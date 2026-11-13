import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Eye,
  Flame,
  Move,
  RotateCcw,
  Sliders,
  ZoomIn,
} from 'lucide-react';
import type {
  ActiveTiltSessionData,
  CellValidity,
  GridCellMetrics,
  OpticalGrade,
  PatchRenderModeCode,
} from '../types/collima';

interface TiltInspectorProps {
  session: ActiveTiltSessionData;
  busy: boolean;
  onUpdateRenderParams: (evBoost: number, patchMode: PatchRenderModeCode) => void;
  onRelocateStation: (stationIdx: number, normX: number, normY: number) => void;
  onResetStations: () => void;
}

type ZoomFactor = 1 | 2 | 4;

const GRADE_META: Record<
  OpticalGrade,
  { badgeClass: string; labelZh: string }
> = {
  excellent: {
    badgeClass: 'status-tag status-tag--pass',
    labelZh: '光轴合焦优异',
  },
  normal_curvature: {
    badgeClass: 'status-tag status-tag--pass',
    labelZh: '光轴居中 · 正常对称场曲',
  },
  mild_tilt: {
    badgeClass: 'status-tag status-tag--warn',
    labelZh: '轻度单侧偏心 / 倾角',
  },
  severe_tilt: {
    badgeClass: 'status-tag status-tag--crit',
    labelZh: '显著焦平面倾斜 (Tilt)',
  },
  insufficient_texture: {
    badgeClass: 'status-tag status-tag--warn',
    labelZh: '局部高频纹理不足',
  },
};

const VALIDITY_LABEL: Record<CellValidity, string> = {
  valid: '有效纹理',
  low_texture: '低反差/纯色',
  underexposed: '欠曝信噪比低',
  clipped: '高光溢出',
};

/** Map normalized relative sharpness [0..1.15] to calibrated thermal RGBA (obsidian -> teal -> optical green -> amber -> ivory). */
function heatmapColor(rel: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, rel));
  if (t < 0.35) {
    const k = t / 0.35;
    return [
      Math.round(180 + k * 45),
      Math.round(42 + k * 48),
      Math.round(58 - k * 10),
    ];
  }
  if (t < 0.68) {
    const k = (t - 0.35) / 0.33;
    return [
      Math.round(225 - k * 155),
      Math.round(90 + k * 108),
      Math.round(48 + k * 68),
    ];
  }
  const k = (t - 0.68) / 0.32;
  return [
    Math.round(70 - k * 18),
    Math.round(198 + k * 32),
    Math.round(116 + k * 24),
  ];
}

export const TiltInspector: React.FC<TiltInspectorProps> = ({
  session,
  busy,
  onUpdateRenderParams,
  onRelocateStation,
  onResetStations,
}) => {
  const [zoom, setZoom] = useState<ZoomFactor>(2);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showReticle, setShowReticle] = useState<boolean>(true);
  const [dragMode, setDragMode] = useState<'sync_pan' | 'relocate_roi'>('sync_pan');
  const [panPx, setPanPx] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [evDraft, setEvDraft] = useState<number | null>(null);
  const displayEv = evDraft ?? session.evBoost;

  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Pre-build ImageData objects for the 9 patches so pan/zoom redraws are instant (<0.3ms)
  const patchImageDatas = useMemo(() => {
    return session.patches.map((p) => {
      if (p.desc.width === 0 || p.desc.height === 0) return null;
      const clamped = new Uint8ClampedArray(p.rgba);
      return new ImageData(clamped, p.desc.width, p.desc.height);
    });
  }, [session.patches]);

  // Draw all 9 synchronized nearest-neighbor loupe canvases
  useEffect(() => {
    const offscreen = document.createElement('canvas');

    session.patches.forEach((patch, idx) => {
      const canvas = loupeCanvasRefs.current[idx];
      const imgData = patchImageDatas[idx];
      if (!canvas || !imgData) return;

      const pw = patch.desc.width;
      const ph = patch.desc.height;
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }

      if (offscreen.width !== pw || offscreen.height !== ph) {
        offscreen.width = pw;
        offscreen.height = ph;
      }
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;
      offCtx.putImageData(imgData, 0, 0);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, pw, ph);

      // Visible source window in 1:1 sensor pixels at 100% / 200% / 400%
      const viewW = pw / zoom;
      const viewH = ph / zoom;
      const maxPanX = (pw - viewW) * 0.5;
      const maxPanY = (ph - viewH) * 0.5;
      const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, panPx.x));
      const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, panPx.y));

      const sx = Math.round((pw - viewW) * 0.5 - clampedPanX);
      const sy = Math.round((ph - viewH) * 0.5 - clampedPanY);

      ctx.drawImage(offscreen, sx, sy, viewW, viewH, 0, 0, pw, ph);

      if (showReticle) {
        const cx = Math.floor(pw / 2) + 0.5;
        const cy = Math.floor(ph / 2) + 0.5;
        ctx.strokeStyle =
          idx === 4
            ? 'hsla(37, 92%, 60%, 0.55)'
            : 'hsla(210, 20%, 92%, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy);
        ctx.lineTo(cx - 4, cy);
        ctx.moveTo(cx + 4, cy);
        ctx.lineTo(cx + 18, cy);
        ctx.moveTo(cx, cy - 18);
        ctx.lineTo(cx, cy - 4);
        ctx.moveTo(cx, cy + 4);
        ctx.lineTo(cx, cy + 18);
        ctx.stroke();
      }
    });
  }, [session.patches, patchImageDatas, zoom, panPx, showReticle]);

  // Draw Overview Canvas + 5x5 Contour Heatmap Overlay + 9 Interactive ROI Station Boxes
  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    const { width: ow, height: oh } = session.overview.desc;
    if (ow === 0 || oh === 0) return;

    if (canvas.width !== ow || canvas.height !== oh) {
      canvas.width = ow;
      canvas.height = oh;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Base overview sRGB frame
    const baseImg = new ImageData(
      new Uint8ClampedArray(session.overview.rgba),
      ow,
      oh,
    );
    ctx.putImageData(baseImg, 0, 0);

    // 2. Smooth 5x5 interpolated contour heatmap overlay
    if (showHeatmap && session.sharpness.grid5x5.length === 25) {
      const hmW = 120;
      const hmH = Math.max(60, Math.round((oh / ow) * hmW));
      const hmCanvas = document.createElement('canvas');
      hmCanvas.width = hmW;
      hmCanvas.height = hmH;
      const hmCtx = hmCanvas.getContext('2d');

      if (hmCtx) {
        const hmData = hmCtx.createImageData(hmW, hmH);
        const vals = new Float32Array(25);
        for (let i = 0; i < 25; i++) {
          vals[i] = session.sharpness.grid5x5[i].relativeToCenter;
        }

        const sampleGrid = (u: number, v: number): number => {
          // Grid centers lie at (c + 0.5) / 5
          const gx = Math.max(0, Math.min(4, u * 5 - 0.5));
          const gy = Math.max(0, Math.min(4, v * 5 - 0.5));
          const x0 = Math.floor(gx);
          const y0 = Math.floor(gy);
          const x1 = Math.min(4, x0 + 1);
          const y1 = Math.min(4, y0 + 1);
          const fx = gx - x0;
          const fy = gy - y0;
          const v00 = vals[y0 * 5 + x0];
          const v10 = vals[y0 * 5 + x1];
          const v01 = vals[y1 * 5 + x0];
          const v11 = vals[y1 * 5 + x1];
          const top = v00 + (v10 - v00) * fx;
          const bot = v01 + (v11 - v01) * fx;
          return top + (bot - top) * fy;
        };

        const field = new Float32Array(hmW * hmH);
        for (let y = 0; y < hmH; y++) {
          const v = (y + 0.5) / hmH;
          for (let x = 0; x < hmW; x++) {
            const u = (x + 0.5) / hmW;
            field[y * hmW + x] = sampleGrid(u, v);
          }
        }

        const bands = [0.3, 0.45, 0.6, 0.75, 0.9];
        for (let y = 0; y < hmH; y++) {
          for (let x = 0; x < hmW; x++) {
            const idx = y * hmW + x;
            const val = field[idx];
            // Quantize slightly for crisp optical iso-contour legibility + contour edge highlight
            const right = field[y * hmW + Math.min(hmW - 1, x + 1)];
            const down = field[Math.min(hmH - 1, y + 1) * hmW + x];
            let isContourLine = false;
            for (const b of bands) {
              if (
                (val < b && (right >= b || down >= b)) ||
                (val >= b && (right < b || down < b))
              ) {
                isContourLine = true;
                break;
              }
            }

            const p = idx * 4;
            if (isContourLine) {
              hmData.data[p] = 248;
              hmData.data[p + 1] = 250;
              hmData.data[p + 2] = 252;
              hmData.data[p + 3] = 195;
            } else {
              const [r, g, b] = heatmapColor(val);
              hmData.data[p] = r;
              hmData.data[p + 1] = g;
              hmData.data[p + 2] = b;
              hmData.data[p + 3] = 112;
            }
          }
        }

        hmCtx.putImageData(hmData, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(hmCanvas, 0, 0, ow, oh);
        ctx.restore();
      }
    }

    // 3. Draw 9 ROI station boxes on overview
    const aw = Math.max(1, session.metadata.activeWidth);
    const ah = Math.max(1, session.metadata.activeHeight);

    ctx.save();
    session.sharpness.grid3x3.forEach((cell, idx) => {
      const [, , rw, rh] = cell.sensorRect;
      const boxW = Math.max(18, (rw / aw) * ow);
      const boxH = Math.max(18, (rh / ah) * oh);
      const bx = cell.normX * ow - boxW * 0.5;
      const by = cell.normY * oh - boxH * 0.5;

      ctx.strokeStyle =
        idx === 4
          ? 'hsl(37, 95%, 60%)'
          : cell.relativeToCenter >= 0.72
            ? 'hsl(152, 72%, 56%)'
            : cell.relativeToCenter >= 0.48
              ? 'hsl(37, 88%, 60%)'
              : 'hsl(3, 86%, 66%)';
      ctx.lineWidth = Math.max(1.5, ow / 520);
      ctx.strokeRect(bx, by, boxW, boxH);

      // Station label tag
      const fontSize = Math.max(11, Math.round(ow / 78));
      ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
      const label = `${cell.id} ${Math.round(cell.relativeToCenter * 100)}%`;
      const tw = ctx.measureText(label).width + 8;
      const th = fontSize + 6;
      ctx.fillStyle = 'hsla(220, 24%, 6%, 0.84)';
      ctx.fillRect(bx, Math.max(0, by - th), tw, th);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(label, bx + 4, Math.max(fontSize, by - 4));
    });
    ctx.restore();
  }, [session.overview, session.sharpness, session.metadata, showHeatmap]);

  // Pointer drag inside any of the 9 loupes: either sync pan OR per-station ROI relocation
  const loupeDragRef = useRef<{
    stationIdx: number;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    origNormX: number;
    origNormY: number;
    relocating: boolean;
  } | null>(null);

  const handleLoupePointerDown = (
    stationIdx: number,
    cell: GridCellMetrics,
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const relocating = dragMode === 'relocate_roi' || e.shiftKey;
    loupeDragRef.current = {
      stationIdx,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: panPx.x,
      origPanY: panPx.y,
      origNormX: cell.normX,
      origNormY: cell.normY,
      relocating,
    };
  };

  const handleLoupePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = loupeDragRef.current;
    if (!st) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dxCss = e.clientX - st.startX;
    const dyCss = e.clientY - st.startY;

    if (!st.relocating) {
      if (zoom === 1) return;
      const patch = session.patches[st.stationIdx];
      const scale = patch.desc.width / Math.max(1, rect.width) / zoom;
      setPanPx({
        x: st.origPanX + dxCss * scale,
        y: st.origPanY + dyCss * scale,
      });
    }
  };

  const handleLoupePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = loupeDragRef.current;
    if (!st) return;
    loupeDragRef.current = null;

    if (st.relocating) {
      const rect = e.currentTarget.getBoundingClientRect();
      const dxCss = e.clientX - st.startX;
      const dyCss = e.clientY - st.startY;
      if (Math.hypot(dxCss, dyCss) < 2) return;

      const patch = session.patches[st.stationIdx];
      const sensorDx =
        (-dxCss / Math.max(1, rect.width)) * (patch.desc.width / zoom);
      const sensorDy =
        (-dyCss / Math.max(1, rect.height)) * (patch.desc.height / zoom);

      const newNormX = Math.max(
        0.04,
        Math.min(0.96, st.origNormX + sensorDx / session.metadata.activeWidth),
      );
      const newNormY = Math.max(
        0.04,
        Math.min(0.96, st.origNormY + sensorDy / session.metadata.activeHeight),
      );
      onRelocateStation(st.stationIdx, newNormX, newNormY);
    }
  };

  // Dragging or clicking a station directly on the Overview Canvas
  const overviewDragStationRef = useRef<number | null>(null);

  const findNearestStation = useCallback(
    (normX: number, normY: number): number => {
      let bestIdx = 4;
      let bestDist = Infinity;
      session.sharpness.grid3x3.forEach((c, idx) => {
        const d = Math.hypot(c.normX - normX, c.normY - normY);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      return bestIdx;
    },
    [session.sharpness.grid3x3],
  );

  const handleOverviewPointerDown = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
    const nearest = findNearestStation(nx, ny);
    e.currentTarget.setPointerCapture(e.pointerId);
    overviewDragStationRef.current = nearest;
  };

  const handleOverviewPointerUp = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const idx = overviewDragStationRef.current;
    if (idx === null) return;
    overviewDragStationRef.current = null;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(
      0.04,
      Math.min(0.96, (e.clientX - rect.left) / Math.max(1, rect.width)),
    );
    const ny = Math.max(
      0.04,
      Math.min(0.96, (e.clientY - rect.top) / Math.max(1, rect.height)),
    );
    onRelocateStation(idx, nx, ny);
  };

  const { sharpness } = session;
  const gradeInfo = GRADE_META[sharpness.grade];
  const tv = sharpness.tiltVector;

  // Polar compass vector endpoint (radius max = 44px mapped to tilt magnitude 0.30)
  const compassRadius = 44;
  const normMag = Math.min(1, tv.magnitude / 0.3);
  const collapseRad = (tv.collapseAngleDeg * Math.PI) / 180;
  const arrowX = 60 + Math.cos(collapseRad) * normMag * compassRadius;
  const arrowY = 60 + Math.sin(collapseRad) * normMag * compassRadius;

  return (
    <div className="max-w-[1680px] mx-auto w-full px-4 py-4 grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      {/* Left / Primary Column: 9-Grid Synchronized 1:1 Sensor Loupe Workbench */}
      <section
        aria-label="九宫格 1:1 像素同步检视台"
        className="xl:col-span-8 instrument-panel overflow-hidden"
      >
        <div className="panel-header">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="panel-title">
              <Crosshair size={15} className="text-[var(--accent-amber)]" />
              <span>九宫格 1:1 传感器像素同步放大检视台</span>
            </h2>
            <span className={gradeInfo.badgeClass}>{gradeInfo.labelZh}</span>
          </div>

          {/* Loupe Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Zoom 100% / 200% / 400% */}
            <div
              className="segmented-control"
              role="group"
              aria-label="最近邻放大倍率"
            >
              {([1, 2, 4] as ZoomFactor[]).map((z) => (
                <button
                  key={z}
                  id={`btn-loupe-zoom-${z * 100}`}
                  type="button"
                  onClick={() => {
                    if (z === 1) setPanPx({ x: 0, y: 0 });
                    setZoom(z);
                  }}
                  className={`segmented-btn mono-num ${zoom === z ? 'is-active' : ''}`}
                  style={{ padding: '0.26rem 0.6rem', fontSize: '0.75rem' }}
                >
                  <ZoomIn size={12} />
                  <span>{z * 100}%</span>
                </button>
              ))}
            </div>

            {/* Pan vs ROI Relocate Mode */}
            <div
              className="segmented-control"
              role="group"
              aria-label="视口拖拽模式"
            >
              <button
                id="btn-drag-mode-pan"
                type="button"
                onClick={() => setDragMode('sync_pan')}
                className={`segmented-btn ${dragMode === 'sync_pan' ? 'is-active' : ''}`}
                style={{ padding: '0.26rem 0.6rem', fontSize: '0.75rem' }}
                title="拖拽任意视口可 9 窗同步微移观察像素细节"
              >
                <Eye size={12} />
                <span>同步平移</span>
              </button>
              <button
                id="btn-drag-mode-relocate"
                type="button"
                onClick={() => setDragMode('relocate_roi')}
                className={`segmented-btn ${dragMode === 'relocate_roi' ? 'is-active' : ''}`}
                style={{ padding: '0.26rem 0.6rem', fontSize: '0.75rem' }}
                title="单独微调某个视口的采样坐标（如避开纯色天空对准砖缝或星点）并实时重算锐度"
              >
                <Move size={12} />
                <span>微调采样点</span>
              </button>
            </div>

            <button
              id="btn-toggle-reticle"
              type="button"
              onClick={() => setShowReticle((v) => !v)}
              className="btn-instrument"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
            >
              十字丝 {showReticle ? '开' : '关'}
            </button>

            <button
              id="btn-reset-stations"
              type="button"
              disabled={busy}
              onClick={() => {
                setPanPx({ x: 0, y: 0 });
                onResetStations();
              }}
              className="btn-instrument"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              title="复位九宫格标准采样坐标与平移偏移"
            >
              <RotateCcw size={12} />
              <span>复位采样</span>
            </button>
          </div>
        </div>

        {/* Signal Path & Exposure Controls Strip */}
        <div className="px-4 py-2.5 bg-[var(--bg-surface-1)] border-b border-[var(--hairline-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[var(--text-muted)]">像素渲染通道：</span>
            {(
              [
                [0, '1:1 色彩解马赛克 (sRGB)'],
                [1, '去马赛克前纯绿通道 (规避倍率色差)'],
                [2, '原始拜耳 CFA 阵列'],
              ] as [PatchRenderModeCode, string][]
            ).map(([code, label]) => (
              <button
                key={code}
                id={`btn-patch-mode-${code}`}
                type="button"
                disabled={busy}
                onClick={() => onUpdateRenderParams(displayEv, code)}
                className={`btn-instrument ${
                  session.patchMode === code
                    ? 'border-[var(--accent-amber)] text-[var(--accent-amber)]'
                    : ''
                }`}
                style={{ padding: '0.24rem 0.58rem', fontSize: '0.74rem' }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <Sliders size={13} className="text-[var(--text-muted)]" />
            <label htmlFor="slider-ev-boost" className="text-[var(--text-secondary)]">
              检视提亮
            </label>
            <input
              id="slider-ev-boost"
              type="range"
              min={-2}
              max={5}
              step={0.25}
              value={displayEv}
              disabled={busy}
              onChange={(e) => setEvDraft(parseFloat(e.target.value))}
              onMouseUp={() => {
                if (evDraft !== null) {
                  onUpdateRenderParams(evDraft, session.patchMode);
                  setEvDraft(null);
                }
              }}
              onTouchEnd={() => {
                if (evDraft !== null) {
                  onUpdateRenderParams(evDraft, session.patchMode);
                  setEvDraft(null);
                }
              }}
              className="optical-slider w-24"
            />
            <span className="mono-num w-14 text-right text-[var(--text-primary)]">
              {displayEv >= 0 ? `+${displayEv.toFixed(2)}` : displayEv.toFixed(2)} EV
            </span>
          </div>
        </div>

        {/* 3x3 Synchronized Canvas Matrix */}
        <div className="loupe-matrix">
          {sharpness.grid3x3.map((cell, idx) => {
            const isCenter = idx === 4;
            const retPct = Math.round(cell.relativeToCenter * 100);
            const retTone = isCenter
              ? 'text-[var(--accent-amber)]'
              : cell.validity !== 'valid'
                ? 'text-[var(--text-muted)]'
                : retPct >= 75
                  ? 'text-[var(--optical-green)]'
                  : retPct >= 50
                    ? 'text-[var(--accent-amber)]'
                    : 'text-[var(--alert-coral)]';

            return (
              <div
                key={cell.id}
                id={`loupe-station-${cell.id}`}
                className={`loupe-cell ${isCenter ? 'is-center' : ''}`}
              >
                <canvas
                  ref={(el) => {
                    loupeCanvasRefs.current[idx] = el;
                  }}
                  onPointerDown={(e) => handleLoupePointerDown(idx, cell, e)}
                  onPointerMove={handleLoupePointerMove}
                  onPointerUp={handleLoupePointerUp}
                  className={`loupe-canvas ${
                    dragMode === 'relocate_roi'
                      ? 'cursor-move'
                      : zoom > 1
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'cursor-crosshair'
                  }`}
                />

                {/* Top HUD */}
                <div className="loupe-hud-top">
                  <div className="flex items-center gap-1.5">
                    <span className="mono-num font-semibold px-1.5 py-0.5 rounded bg-[hsla(220,25%,8%,0.85)] text-[var(--text-primary)] border border-[var(--hairline-default)]">
                      {cell.id}
                    </span>
                    {cell.medianStarHfrPx !== null && cell.starCount > 0 && (
                      <span className="mono-num px-1.5 py-0.5 rounded bg-[hsla(201,80%,16%,0.82)] text-[var(--channel-b)]">
                        HFR {cell.medianStarHfrPx.toFixed(2)}px
                      </span>
                    )}
                  </div>

                  <span
                    className={`mono-num font-semibold px-1.5 py-0.5 rounded bg-[hsla(220,25%,8%,0.85)] ${retTone}`}
                  >
                    {isCenter
                      ? '100% 中心基准'
                      : cell.validity !== 'valid'
                        ? VALIDITY_LABEL[cell.validity]
                        : `保持率 ${retPct}%`}
                  </span>
                </div>

                {/* Bottom HUD */}
                <div className="loupe-hud-bottom mono-num text-[var(--text-secondary)]">
                  <span>S={cell.sharpness.toFixed(4)}</span>
                  <span>
                    ({cell.sensorRect[0]}, {cell.sensorRect[1]}) px
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 pb-3 text-[11px] text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
          <span>
            操作提示：200% / 400% 下拖拽画面可九窗同步比对边缘劣化；按住 Shift 拖拽（或切换至「微调采样点」/ 点击右侧缩略图）可单独移动局部采样框避开纯色区域。
          </span>
          <span className="mono-num">
            最近邻无插值放大 (imageSmoothingEnabled = false)
          </span>
        </div>
      </section>

      {/* Right Column: Overview Contour Heatmap + Tilt Vector Polar Compass + Retention Telemetry */}
      <aside className="xl:col-span-4 flex flex-col gap-4">
        {/* Overview Canvas + 5x5 Sharpness Contour Heatmap */}
        <section
          aria-label="全画幅缩略图与 5x5 锐度等高线热力图"
          className="instrument-panel overflow-hidden"
        >
          <div className="panel-header">
            <h3 className="panel-title">
              <Flame size={15} className="text-[var(--accent-amber)]" />
              <span>全画幅场曲 / 光轴等高线热力图 (5×5)</span>
            </h3>
            <button
              id="btn-toggle-heatmap"
              type="button"
              onClick={() => setShowHeatmap((v) => !v)}
              className={`btn-instrument ${
                showHeatmap
                  ? 'border-[var(--accent-amber)] text-[var(--accent-amber)]'
                  : ''
              }`}
              style={{ padding: '0.26rem 0.62rem', fontSize: '0.74rem' }}
            >
              {showHeatmap ? '隐藏热力图' : '叠加 5×5 热力图'}
            </button>
          </div>

          <div className="p-3 bg-[var(--bg-loupe)]">
            <canvas
              id="overview-heatmap-canvas"
              ref={overviewCanvasRef}
              onPointerDown={handleOverviewPointerDown}
              onPointerUp={handleOverviewPointerUp}
              className="w-full h-auto rounded-md border border-[var(--hairline-subtle)] cursor-crosshair block"
            />

            {/* Heatmap Color Scale Legend */}
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[var(--text-muted)] mono-num">
              <span>塌陷 &lt;30%</span>
              <div
                className="h-2 flex-1 mx-3 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, rgb(180,42,58) 0%, rgb(225,90,48) 35%, rgb(70,198,116) 72%, rgb(52,230,140) 100%)',
                }}
              />
              <span>中心峰值 100%</span>
            </div>
          </div>
        </section>

        {/* Optical Collimation & Tilt Vector Telemetry */}
        <section
          aria-label="光轴倾斜向量与四角保持率指标"
          className="instrument-panel p-4 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-[var(--text-muted)]">光学诊断结论</div>
              <div className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">
                {sharpness.verdictTitle}
              </div>
            </div>
            <Compass size={18} className="text-[var(--accent-amber)] shrink-0" />
          </div>

          {/* Polar Tilt Vector Compass + Core Numbers */}
          <div className="grid grid-cols-12 gap-3 items-center bg-[var(--bg-surface-1)] p-3 rounded-lg border border-[var(--hairline-subtle)]">
            <div className="col-span-5 flex justify-center">
              <svg
                width="120"
                height="120"
                viewBox="0 0 120 120"
                aria-label="焦平面倾斜极坐标罗盘"
              >
                <circle
                  cx="60"
                  cy="60"
                  r="46"
                  fill="hsl(220, 20%, 5%)"
                  stroke="hsla(210, 16%, 85%, 0.16)"
                  strokeWidth="1"
                />
                {/* Mild threshold ring (0.09 / 0.30 * 44 = 13.2) & Severe ring (0.20 / 0.30 * 44 = 29.3) */}
                <circle
                  cx="60"
                  cy="60"
                  r="14"
                  fill="none"
                  stroke="hsla(152, 62%, 48%, 0.32)"
                  strokeDasharray="2 2"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="29"
                  fill="none"
                  stroke="hsla(37, 88%, 56%, 0.32)"
                  strokeDasharray="3 2"
                />
                <line
                  x1="14"
                  y1="60"
                  x2="106"
                  y2="60"
                  stroke="hsla(210, 16%, 85%, 0.1)"
                />
                <line
                  x1="60"
                  y1="14"
                  x2="60"
                  y2="106"
                  stroke="hsla(210, 16%, 85%, 0.1)"
                />
                <text
                  x="60"
                  y="11"
                  textAnchor="middle"
                  fontSize="8"
                  fill="hsl(215, 10%, 52%)"
                >
                  TOP
                </text>
                <text
                  x="60"
                  y="116"
                  textAnchor="middle"
                  fontSize="8"
                  fill="hsl(215, 10%, 52%)"
                >
                  BTM
                </text>

                {/* Collapse Direction Vector */}
                <line
                  x1="60"
                  y1="60"
                  x2={arrowX}
                  y2={arrowY}
                  stroke={
                    tv.magnitude >= 0.2
                      ? 'hsl(3, 82%, 63%)'
                      : tv.magnitude >= 0.09
                        ? 'hsl(37, 88%, 56%)'
                        : 'hsl(152, 62%, 48%)'
                  }
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle
                  cx={arrowX}
                  cy={arrowY}
                  r="3.8"
                  fill={
                    tv.magnitude >= 0.2
                      ? 'hsl(3, 82%, 63%)'
                      : tv.magnitude >= 0.09
                        ? 'hsl(37, 88%, 56%)'
                        : 'hsl(152, 62%, 48%)'
                  }
                />
                <circle cx="60" cy="60" r="2.2" fill="#e2e8f0" />
              </svg>
            </div>

            <div className="col-span-7 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Tilt 偏移模长</span>
                <span className="mono-num font-semibold text-[var(--text-primary)]">
                  {tv.magnitude.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">劣化塌陷方位</span>
                <span className="mono-num text-[var(--accent-amber)]">
                  {tv.collapseDirectionLabel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">塌陷方位角</span>
                <span className="mono-num text-[var(--text-secondary)]">
                  {tv.collapseAngleDeg.toFixed(1)}°
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">径向对称场曲项</span>
                <span className="mono-num text-[var(--text-secondary)]">
                  {sharpness.radialFalloff.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">中心绿通道锐度</span>
                <span className="mono-num text-[var(--optical-green)]">
                  {sharpness.centerSharpness.toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          {/* 4-Corner Retention & Diagonal Asymmetry */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text-secondary)]">
                四角相对中心锐度保持率 (Corner Retention)
              </span>
              <span className="mono-num text-[var(--text-primary)]">
                均值 {(sharpness.cornerRetention.mean * 100).toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['左上 TL', sharpness.cornerRetention.tl],
                  ['右上 TR', sharpness.cornerRetention.tr],
                  ['左下 BL', sharpness.cornerRetention.bl],
                  ['右下 BR', sharpness.cornerRetention.br],
                ] as [string, number][]
              ).map(([label, val]) => {
                const pct = Math.min(120, Math.max(0, val * 100));
                const barColor =
                  val >= 0.72
                    ? 'var(--optical-green)'
                    : val >= 0.48
                      ? 'var(--accent-amber)'
                      : 'var(--alert-coral)';
                return (
                  <div
                    key={label}
                    className="p-2 rounded-md bg-[var(--bg-surface-1)] border border-[var(--hairline-subtle)] space-y-1"
                  >
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">{label}</span>
                      <span className="mono-num font-medium text-[var(--text-primary)]">
                        {(val * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bg-surface-3)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="p-2 rounded-md bg-[var(--bg-surface-1)] border border-[var(--hairline-subtle)] flex justify-between">
                <span className="text-[var(--text-muted)]">|TL - BR| 对角差</span>
                <span className="mono-num text-[var(--text-primary)]">
                  {(sharpness.asymmetry.tlBrDiff * 100).toFixed(1)}%
                </span>
              </div>
              <div className="p-2 rounded-md bg-[var(--bg-surface-1)] border border-[var(--hairline-subtle)] flex justify-between">
                <span className="text-[var(--text-muted)]">|TR - BL| 对角差</span>
                <span className="mono-num text-[var(--text-primary)]">
                  {(sharpness.asymmetry.trBlDiff * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Diagnostic Notes */}
          {sharpness.notes.length > 0 && (
            <ul className="space-y-1.5 text-xs text-[var(--text-secondary)] border-t border-[var(--hairline-subtle)] pt-3 list-disc pl-4">
              {sharpness.notes.map((n, i) => (
                <li key={i} className="leading-relaxed">
                  {n}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
};
