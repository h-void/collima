import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  Move,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import type {
  ActiveTiltSessionData,
  GridCellMetrics,
  OpticalGrade,
  PatchRenderModeCode,
} from '../types/collima';
import { localizeSharpnessReport } from '../i18n/diagnostics';
import { useI18n } from '../i18n/useI18n';

interface TiltInspectorProps {
  session: ActiveTiltSessionData;
  busy: boolean;
  onUpdateRenderParams: (evBoost: number, patchMode: PatchRenderModeCode) => void;
  onRelocateStation: (stationIdx: number, normX: number, normY: number) => void;
  onResetStations: () => void;
}

type ZoomFactor = 1 | 2 | 4;

const GRADE_BADGE_CLASS: Record<OpticalGrade, string> = {
  excellent: 'status-tag status-tag--pass',
  normal_curvature: 'status-tag status-tag--pass',
  mild_tilt: 'status-tag status-tag--warn',
  severe_tilt: 'status-tag status-tag--crit',
  insufficient_texture: 'status-tag status-tag--warn',
};

const CORNER_INDEX_MAP: Record<'tl' | 'tr' | 'bl' | 'br', number> = {
  tl: 0,
  tr: 2,
  bl: 6,
  br: 8,
};

/** Map normalized relative sharpness [0..1] to calibrated thermal RGB. */
function heatmapColor(rel: number): [number, number, number] {
  const safeRel = Number.isFinite(rel) ? rel : 0;
  const t = Math.max(0, Math.min(1, safeRel));
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
  const { locale, t } = useI18n();
  const [zoom, setZoom] = useState<ZoomFactor>(2);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showReticle, setShowReticle] = useState<boolean>(true);
  const [dragMode, setDragMode] = useState<'sync_pan' | 'relocate_roi'>('sync_pan');
  const [panPx, setPanPx] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedStationIdx, setSelectedStationIdx] = useState<number>(4);
  const [isCompactGrid, setIsCompactGrid] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 760px)').matches
      : false,
  );
  const [focusedStationIdx, setFocusedStationIdx] = useState<number | null>(
    null,
  );
  const [evDraft, setEvDraft] = useState<number | null>(null);
  const [overviewCssWidth, setOverviewCssWidth] = useState<number>(0);
  const displayEv = evDraft ?? session.evBoost;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 760px)');
    const onChange = (e: MediaQueryListEvent) => {
      setIsCompactGrid(e.matches);
      if (!e.matches) {
        setFocusedStationIdx(null);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (focusedStationIdx === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFocusedStationIdx(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedStationIdx]);

  const commitEvDraft = useCallback(() => {
    if (evDraft !== null) {
      const nextEv = evDraft;
      setEvDraft(null);
      if (Math.abs(nextEv - session.evBoost) > 1e-6) {
        onUpdateRenderParams(nextEv, session.patchMode);
      }
    }
  }, [evDraft, onUpdateRenderParams, session.evBoost, session.patchMode]);

  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const focusedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pre-build ImageData objects for the 9 patches so pan/zoom redraws are instant (<0.3ms)
  const patchImageDatas = useMemo(() => {
    return session.patches.map((p) => {
      if (p.desc.width === 0 || p.desc.height === 0) return null;
      const clamped = new Uint8ClampedArray(p.rgba);
      return new ImageData(clamped, p.desc.width, p.desc.height);
    });
  }, [session.patches]);

  // Draw synchronized nearest-neighbor loupe canvas(es) (9-zone matrix or mobile single-loupe focus)
  useEffect(() => {
    const offscreen = document.createElement('canvas');

    const renderPatchToCanvas = (
      canvas: HTMLCanvasElement | null,
      idx: number,
    ) => {
      const patch = session.patches[idx];
      const imgData = patchImageDatas[idx];
      if (!canvas || !patch || !imgData) return;

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
            ? 'hsla(36, 92%, 60%, 0.6)'
            : 'hsla(210, 20%, 94%, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy);
        ctx.lineTo(cx - 4, cy);
        ctx.moveTo(cx + 4, cy);
        ctx.lineTo(cx + 16, cy);
        ctx.moveTo(cx, cy - 16);
        ctx.lineTo(cx, cy - 4);
        ctx.moveTo(cx, cy + 4);
        ctx.lineTo(cx, cy + 16);
        ctx.stroke();
      }
    };

    if (isCompactGrid && focusedStationIdx !== null) {
      renderPatchToCanvas(focusedCanvasRef.current, focusedStationIdx);
    } else {
      session.patches.forEach((_, idx) => {
        renderPatchToCanvas(loupeCanvasRefs.current[idx], idx);
      });
    }
  }, [
    session.patches,
    patchImageDatas,
    zoom,
    panPx,
    showReticle,
    isCompactGrid,
    focusedStationIdx,
  ]);

  // Track overview canvas CSS width so station boxes and labels re-scale cleanly on viewport resize
  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? canvas.clientWidth);
      if (w > 0) setOverviewCssWidth(w);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

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

    const centerValid =
      session.sharpness.grid3x3[4]?.validity === 'valid' &&
      Number.isFinite(session.sharpness.centerSharpness) &&
      session.sharpness.centerSharpness > 1e-6;

    // 2. Smooth 5x5 interpolated contour heatmap overlay
    if (showHeatmap && centerValid && session.sharpness.grid5x5.length === 25) {
      const validNodes: { r: number; c: number; val: number }[] = [];
      for (let i = 0; i < 25; i++) {
        const g = session.sharpness.grid5x5[i];
        if (g.validity === 'valid' && Number.isFinite(g.relativeToCenter)) {
          validNodes.push({
            r: Math.floor(i / 5),
            c: i % 5,
            val: g.relativeToCenter,
          });
        }
      }

      if (validNodes.length >= 3) {
        const hmW = Math.min(ow, 360);
        const hmH = Math.max(60, Math.round((oh / ow) * hmW));
        const hmCanvas = document.createElement('canvas');
        hmCanvas.width = hmW;
        hmCanvas.height = hmH;
        const hmCtx = hmCanvas.getContext('2d');

        if (hmCtx) {
          const hmData = hmCtx.createImageData(hmW, hmH);
          const vals = new Float32Array(25);
          for (let i = 0; i < 25; i++) {
            const g = session.sharpness.grid5x5[i];
            if (g.validity === 'valid' && Number.isFinite(g.relativeToCenter)) {
              vals[i] = g.relativeToCenter;
            } else {
              const r = Math.floor(i / 5);
              const c = i % 5;
              let wSum = 0;
              let vSum = 0;
              for (const vn of validNodes) {
                const d2 = (vn.r - r) * (vn.r - r) + (vn.c - c) * (vn.c - c);
                const w = 1 / (d2 + 0.25);
                wSum += w;
                vSum += w * vn.val;
              }
              vals[i] = wSum > 0 ? vSum / wSum : 0;
            }
          }

          const sampleGrid = (u: number, v: number): number => {
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
                hmData.data[p + 3] = 178;
              } else {
                const [r, g, b] = heatmapColor(val);
                hmData.data[p] = r;
                hmData.data[p + 1] = g;
                hmData.data[p + 2] = b;
                hmData.data[p + 3] = 88;
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
    }

    // 3. Draw 9 ROI station boxes on overview (with active selection ring)
    const aw = Math.max(1, session.metadata.activeWidth);
    const ah = Math.max(1, session.metadata.activeHeight);
    // Canvas pixels per CSS pixel: keeps strokes/labels legible regardless of
    // how far the full-resolution overview is scaled down inside the dock.
    const cssPx = Math.max(
      1,
      ow / Math.max(1, overviewCssWidth || canvas.clientWidth || ow),
    );

    ctx.save();
    session.sharpness.grid3x3.forEach((cell, idx) => {
      const [, , rw, rh] = cell.sensorRect;
      const boxW = Math.max(18, (rw / aw) * ow);
      const boxH = Math.max(18, (rh / ah) * oh);
      const bx = cell.normX * ow - boxW * 0.5;
      const by = cell.normY * oh - boxH * 0.5;
      const safeRel = Number.isFinite(cell.relativeToCenter)
        ? cell.relativeToCenter
        : 0;
      const stationValid = cell.validity === 'valid' && (idx === 4 || centerValid);
      const isSelected = idx === selectedStationIdx;

      if (isSelected) {
        const pad = Math.max(3, 2.5 * cssPx);
        ctx.strokeStyle = 'hsla(0, 0%, 100%, 0.9)';
        ctx.lineWidth = Math.max(1.5, 1.25 * cssPx);
        ctx.strokeRect(bx - pad, by - pad, boxW + pad * 2, boxH + pad * 2);
      }

      ctx.strokeStyle =
        idx === 4
          ? cell.validity === 'valid'
            ? 'hsl(36, 95%, 60%)'
            : 'hsl(4, 84%, 64%)'
          : !stationValid
            ? 'hsla(215, 14%, 70%, 0.78)'
            : safeRel >= 0.72
              ? 'hsl(154, 72%, 54%)'
              : safeRel >= 0.48
                ? 'hsl(36, 88%, 60%)'
                : 'hsl(4, 84%, 64%)';
      ctx.lineWidth = Math.max(1.5, 1.25 * cssPx);
      ctx.strokeRect(bx, by, boxW, boxH);

      // Station label tag (~9.5 CSS px regardless of overview scale)
      const fontSize = Math.max(11, Math.round(9.5 * cssPx));
      ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
      const label = stationValid
        ? `${cell.id} ${Math.round(safeRel * 100)}%`
        : `${cell.id} --`;
      const padX = Math.max(4, 3 * cssPx);
      const tw = ctx.measureText(label).width + padX * 2;
      const th = Math.round(fontSize * 1.45);
      const ty = Math.max(0, by - th);
      ctx.fillStyle = isSelected
        ? 'hsla(220, 18%, 10%, 0.94)'
        : 'hsla(220, 20%, 6%, 0.84)';
      ctx.fillRect(bx, ty, tw, th);
      ctx.fillStyle = '#f8fafc';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + padX, ty + th / 2);
    });
    ctx.restore();
  }, [
    session.overview,
    session.sharpness,
    session.metadata,
    showHeatmap,
    selectedStationIdx,
    overviewCssWidth,
  ]);

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
    setSelectedStationIdx(stationIdx);
    const relocating = dragMode === 'relocate_roi' || e.shiftKey;
    if (relocating && busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
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
      const scaleX = patch.desc.width / Math.max(1, rect.width) / zoom;
      const scaleY = patch.desc.height / Math.max(1, rect.height) / zoom;
      const maxPanX = (patch.desc.width - patch.desc.width / zoom) * 0.5;
      const maxPanY = (patch.desc.height - patch.desc.height / zoom) * 0.5;
      setPanPx({
        x: Math.max(-maxPanX, Math.min(maxPanX, st.origPanX + dxCss * scaleX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, st.origPanY + dyCss * scaleY)),
      });
    }
  };

  const handleLoupePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = loupeDragRef.current;
    if (!st) return;
    loupeDragRef.current = null;

    if (st.relocating && !busy) {
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
        Math.min(
          0.96,
          st.origNormX + sensorDx / Math.max(1, session.metadata.activeWidth),
        ),
      );
      const newNormY = Math.max(
        0.04,
        Math.min(
          0.96,
          st.origNormY + sensorDy / Math.max(1, session.metadata.activeHeight),
        ),
      );
      onRelocateStation(st.stationIdx, newNormX, newNormY);
    }
  };

  const handleLoupePointerCancel = () => {
    loupeDragRef.current = null;
  };

  const handleLoupeDoubleClick = () => {
    if (dragMode === 'relocate_roi') return;
    setZoom((prev) => {
      const next: ZoomFactor = prev === 1 ? 2 : prev === 2 ? 4 : 1;
      if (next === 1) setPanPx({ x: 0, y: 0 });
      return next;
    });
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
    if (busy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
    const nearest = findNearestStation(nx, ny);
    setSelectedStationIdx(nearest);
    e.currentTarget.setPointerCapture(e.pointerId);
    overviewDragStationRef.current = nearest;
  };

  const handleOverviewPointerUp = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const idx = overviewDragStationRef.current;
    if (idx === null) return;
    overviewDragStationRef.current = null;
    if (busy) return;
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

  const handleOverviewPointerCancel = () => {
    overviewDragStationRef.current = null;
  };

  const { sharpness } = session;
  const localizedDiag = useMemo(
    () => localizeSharpnessReport(sharpness, session.metadata, locale),
    [sharpness, session.metadata, locale],
  );
  const gradeBadgeClass = GRADE_BADGE_CLASS[sharpness.grade];
  const tv = sharpness.tiltVector;
  const centerIsValid =
    sharpness.grid3x3[4]?.validity === 'valid' &&
    Number.isFinite(sharpness.centerSharpness) &&
    sharpness.centerSharpness > 1e-6;

  const activeCell =
    sharpness.grid3x3[selectedStationIdx] ?? sharpness.grid3x3[4];

  // Polar compass vector endpoint (radius max = 44px mapped to tilt magnitude 0.30)
  const compassRadius = 44;
  const safeMag = Number.isFinite(tv.magnitude) ? Math.max(0, tv.magnitude) : 0;
  const safeCollapseDeg = Number.isFinite(tv.collapseAngleDeg)
    ? tv.collapseAngleDeg
    : 0;
  const normMag = Math.min(1, safeMag / 0.3);
  const collapseRad = (safeCollapseDeg * Math.PI) / 180;
  const arrowX = 60 + Math.cos(collapseRad) * normMag * compassRadius;
  const arrowY = 60 + Math.sin(collapseRad) * normMag * compassRadius;
  const vectorStroke =
    tv.magnitude >= 0.2
      ? 'var(--alert-coral)'
      : tv.magnitude >= 0.09
        ? 'var(--accent-amber)'
        : 'var(--optical-green)';

  const exposureSummary = [
    session.metadata.focalLengthMm
      ? `${session.metadata.focalLengthMm.toFixed(0)}mm`
      : null,
    session.metadata.fNumber
      ? `f/${session.metadata.fNumber.toFixed(1)}`
      : null,
    session.metadata.shutterDisplay,
    session.metadata.iso ? `ISO ${session.metadata.iso}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const getCellPresentation = (cell: GridCellMetrics, idx: number) => {
    const isCenter = idx === 4;
    const safeRel = Number.isFinite(cell.relativeToCenter)
      ? cell.relativeToCenter
      : 0;
    const retPct = Math.round(safeRel * 100);
    const retColor = isCenter
      ? cell.validity === 'valid'
        ? 'hsl(36, 92%, 64%)'
        : 'hsl(4, 86%, 70%)'
      : cell.validity !== 'valid' || !centerIsValid
        ? 'hsl(215, 10%, 66%)'
        : retPct >= 75
          ? 'hsl(154, 72%, 60%)'
          : retPct >= 50
            ? 'hsl(36, 92%, 64%)'
            : 'hsl(4, 86%, 70%)';

    const fullRetLabel = isCenter
      ? cell.validity === 'valid'
        ? t.tilt.hudCenterRef
        : t.tilt.hudCenterInvalid(t.tilt.validities[cell.validity])
      : cell.validity !== 'valid'
        ? t.tilt.validities[cell.validity]
        : !centerIsValid
          ? t.tilt.hudInvalidRef
          : t.tilt.hudRetention(retPct);

    const compactRetLabel = isCenter
      ? cell.validity === 'valid'
        ? '100%'
        : t.tilt.validities[cell.validity]
      : cell.validity !== 'valid'
        ? t.tilt.validities[cell.validity]
        : !centerIsValid
          ? '--'
          : t.tilt.hudRetention(retPct);

    return { isCenter, retColor, fullRetLabel, compactRetLabel };
  };

  const focusedCell =
    isCompactGrid && focusedStationIdx !== null
      ? (sharpness.grid3x3[focusedStationIdx] ?? null)
      : null;

  const stepFocusedStation = (delta: number) => {
    const total = sharpness.grid3x3.length;
    if (total === 0) return;
    const current = focusedStationIdx ?? selectedStationIdx;
    const next = (current + delta + total) % total;
    setSelectedStationIdx(next);
    setFocusedStationIdx(next);
  };

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_396px]">
      {/* Left Primary Stage: 9-Zone 1:1 Synchronized Pixel Loupe */}
      <section
        aria-label={t.tilt.sectionLoupeAria}
        className="flex flex-col min-h-0 min-w-0"
      >
        {/* Mobile Verdict-First Summary Banner (shown <= 760px above the 3x3 loupe grid) */}
        <div
          id="mobile-verdict-banner"
          className="mobile-verdict-banner space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="section-eyebrow">{t.tilt.verdictHeader}</span>
            <span className={gradeBadgeClass}>
              {t.tilt.grades[sharpness.grade]}
            </span>
          </div>
          <div className="text-[13.5px] font-semibold text-[var(--text-primary)] leading-snug">
            {localizedDiag.verdictTitle}
          </div>
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--text-muted)] mono-num">
            <span className="min-w-0 truncate">
              {session.filename}
              {exposureSummary ? ` · ${exposureSummary}` : ''}
            </span>
            <span className="shrink-0 text-[var(--text-secondary)]">
              Tilt{' '}
              <strong className="font-semibold text-[var(--text-primary)]">
                {tv.magnitude.toFixed(3)}
              </strong>{' '}
              · {localizedDiag.collapseDirectionLabel}
            </span>
          </div>
        </div>

        {/* Unified Single-Row Precision Viewport Toolbar */}
        <div className="viewport-toolbar">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Zoom 100% / 200% / 400% */}
            <div
              className="segmented-control"
              role="group"
              aria-label={t.tilt.zoomGroupAria}
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
                  className={`segmented-btn mono-num ${
                    zoom === z ? 'is-active' : ''
                  }`}
                >
                  <span>{z * 100}%</span>
                </button>
              ))}
            </div>

            {/* Pan vs ROI Relocate Mode */}
            <div
              className="segmented-control"
              role="group"
              aria-label={t.tilt.dragModeGroupAria}
            >
              <button
                id="btn-drag-mode-pan"
                type="button"
                onClick={() => setDragMode('sync_pan')}
                className={`segmented-btn ${
                  dragMode === 'sync_pan' ? 'is-active' : ''
                }`}
                title={t.tilt.dragSyncPanTitle}
              >
                <Eye size={12} className="mode-indicator" />
                <span>{t.tilt.dragSyncPan}</span>
              </button>
              <button
                id="btn-drag-mode-relocate"
                type="button"
                onClick={() => setDragMode('relocate_roi')}
                className={`segmented-btn ${
                  dragMode === 'relocate_roi' ? 'is-active' : ''
                }`}
                title={t.tilt.dragRelocateRoiTitle}
              >
                <Move size={12} className="mode-indicator" />
                <span>{t.tilt.dragRelocateRoi}</span>
              </button>
            </div>

            {/* Signal Path Segmented Switch */}
            <div
              className="segmented-control"
              role="group"
              aria-label={t.tilt.renderChannelLabel}
            >
              {([0, 1, 2] as PatchRenderModeCode[]).map((code) => (
                <button
                  key={code}
                  id={`btn-patch-mode-${code}`}
                  type="button"
                  disabled={busy}
                  onClick={() => onUpdateRenderParams(displayEv, code)}
                  title={t.tilt.patchModes[code]}
                  className={`segmented-btn ${
                    session.patchMode === code ? 'is-active' : ''
                  }`}
                >
                  <span>{t.tilt.patchModesShort[code]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right Viewport Controls: EV Boost, Reticle, Reset */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 px-2 h-[28px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--hairline-subtle)] text-xs">
              <Sliders size={12} className="text-[var(--text-muted)]" />
              <label
                htmlFor="slider-ev-boost"
                className="text-[11.5px] text-[var(--text-secondary)] select-none"
              >
                {t.tilt.evBoostLabel}
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
                onPointerUp={commitEvDraft}
                onPointerCancel={commitEvDraft}
                onKeyUp={commitEvDraft}
                onBlur={commitEvDraft}
                className="optical-slider w-20"
              />
              <button
                id="btn-reset-ev"
                type="button"
                disabled={busy}
                title={t.tilt.evResetHint}
                onClick={() => {
                  setEvDraft(null);
                  if (Math.abs(session.evBoost) > 1e-6) {
                    onUpdateRenderParams(0, session.patchMode);
                  }
                }}
                className="mono-num text-[11.5px] w-14 text-right text-[var(--text-primary)] hover:text-[var(--accent-amber)] cursor-pointer bg-transparent border-none p-0 rounded-[2px]"
              >
                {displayEv >= 0
                  ? `+${displayEv.toFixed(2)}`
                  : displayEv.toFixed(2)}
              </button>
            </div>

            <button
              id="btn-toggle-reticle"
              type="button"
              onClick={() => setShowReticle((v) => !v)}
              className={`btn-instrument ${showReticle ? 'is-toggled' : ''}`}
            >
              <Crosshair size={12} />
              <span>{t.tilt.reticleToggle(showReticle)}</span>
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
              title={t.tilt.resetStationsTitle}
            >
              <RotateCcw size={12} />
              <span>{t.tilt.resetStations}</span>
            </button>
          </div>
        </div>

        {/* 3x3 Synchronized 1:1 Sensor Loupe Canvas Stage (or Mobile Single-Loupe Focus View) */}
        <div className="loupe-stage-wrap">
          {focusedCell && focusedStationIdx !== null ? (
            (() => {
              const { isCenter, retColor, fullRetLabel } = getCellPresentation(
                focusedCell,
                focusedStationIdx,
              );
              return (
                <div id="loupe-focus-panel" className="loupe-focus-panel">
                  <div className="loupe-focus-header">
                    <button
                      id="btn-close-loupe-focus"
                      type="button"
                      onClick={() => setFocusedStationIdx(null)}
                      className="btn-instrument"
                    >
                      <ArrowLeft size={13} />
                      <span>{t.tilt.mobileBackToGrid}</span>
                    </button>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="status-tag font-semibold">
                        {focusedCell.id}
                      </span>
                      <span
                        className="status-tag font-semibold"
                        style={{ color: retColor }}
                      >
                        {fullRetLabel}
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-1 shrink-0">
                      <button
                        id="btn-focus-prev-station"
                        type="button"
                        aria-label={t.tilt.mobilePrevStationAria}
                        onClick={() => stepFocusedStation(-1)}
                        className="btn-instrument btn-icon-only"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <button
                        id="btn-focus-next-station"
                        type="button"
                        aria-label={t.tilt.mobileNextStationAria}
                        onClick={() => stepFocusedStation(1)}
                        className="btn-instrument btn-icon-only"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`loupe-cell loupe-focus-cell ${
                      isCenter ? 'is-center' : ''
                    } is-selected`}
                  >
                    <canvas
                      id="focused-loupe-canvas"
                      ref={focusedCanvasRef}
                      onPointerDown={(e) =>
                        handleLoupePointerDown(
                          focusedStationIdx,
                          focusedCell,
                          e,
                        )
                      }
                      onPointerMove={handleLoupePointerMove}
                      onPointerUp={handleLoupePointerUp}
                      onPointerCancel={handleLoupePointerCancel}
                      onDoubleClick={handleLoupeDoubleClick}
                      className={`loupe-canvas ${
                        dragMode === 'relocate_roi'
                          ? 'cursor-move'
                          : zoom > 1
                            ? 'cursor-grab active:cursor-grabbing'
                            : 'cursor-crosshair'
                      }`}
                    />

                    {/* Full Top HUD */}
                    <div className="loupe-hud-top">
                      <div className="flex items-center gap-1">
                        <span className="loupe-pill mono-num font-semibold">
                          {focusedCell.id}
                        </span>
                        {focusedCell.medianStarHfrPx !== null &&
                          Number.isFinite(focusedCell.medianStarHfrPx) &&
                          focusedCell.starCount > 0 && (
                            <span
                              className="loupe-pill mono-num"
                              style={{ color: 'hsl(204, 90%, 68%)' }}
                            >
                              HFR {focusedCell.medianStarHfrPx.toFixed(2)}px
                            </span>
                          )}
                      </div>

                      <span
                        className="loupe-pill mono-num font-semibold"
                        style={{ color: retColor }}
                      >
                        {fullRetLabel}
                      </span>
                    </div>

                    {/* Full Bottom HUD */}
                    <div className="loupe-hud-bottom mono-num">
                      <span>S {focusedCell.sharpness.toFixed(4)}</span>
                      <span>
                        {focusedCell.sensorRect[0]},{focusedCell.sensorRect[1]}
                      </span>
                    </div>
                  </div>

                  {/* Full Station Sharpness & HFR Telemetry Strip */}
                  <div className="loupe-focus-metrics divide-y divide-[var(--hairline-subtle)]">
                    <div className="kv-row">
                      <span className="text-[var(--text-muted)]">
                        {t.tilt.metricG1G2}
                      </span>
                      <span className="mono-num text-[var(--text-primary)]">
                        {focusedCell.sharpnessG1.toFixed(4)} /{' '}
                        {focusedCell.sharpnessG2.toFixed(4)}
                      </span>
                    </div>
                    <div className="kv-row">
                      <span className="text-[var(--text-muted)]">
                        {t.tilt.metricStarHfr}
                      </span>
                      <span className="mono-num text-[var(--text-secondary)]">
                        {focusedCell.starCount > 0 &&
                        focusedCell.medianStarHfrPx !== null
                          ? `${focusedCell.starCount} · ${focusedCell.medianStarHfrPx.toFixed(2)} px`
                          : '—'}
                      </span>
                    </div>
                    <div className="kv-row">
                      <span className="text-[var(--text-muted)]">
                        {t.tilt.metricSignalClip}
                      </span>
                      <span className="mono-num text-[var(--text-secondary)]">
                        {(focusedCell.meanSignalNorm * 100).toFixed(1)}% /{' '}
                        {(focusedCell.clippedFraction * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="kv-row">
                      <span className="text-[var(--text-muted)]">
                        {t.tilt.mobileCoordsLabel}
                      </span>
                      <span className="mono-num text-[var(--text-secondary)]">
                        {focusedCell.sensorRect[0]}, {focusedCell.sensorRect[1]}{' '}
                        ({focusedCell.sensorRect[2]}×{focusedCell.sensorRect[3]}
                        )
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="loupe-matrix">
              {sharpness.grid3x3.map((cell, idx) => {
                const isSelected = idx === selectedStationIdx;
                const { isCenter, retColor, fullRetLabel, compactRetLabel } =
                  getCellPresentation(cell, idx);

                return (
                  <div
                    key={cell.id}
                    id={`loupe-station-${cell.id}`}
                    className={`loupe-cell ${isCenter ? 'is-center' : ''} ${
                      isSelected ? 'is-selected' : ''
                    }`}
                  >
                    <canvas
                      ref={(el) => {
                        loupeCanvasRefs.current[idx] = el;
                      }}
                      onPointerDown={
                        isCompactGrid
                          ? undefined
                          : (e) => handleLoupePointerDown(idx, cell, e)
                      }
                      onPointerMove={
                        isCompactGrid ? undefined : handleLoupePointerMove
                      }
                      onPointerUp={
                        isCompactGrid ? undefined : handleLoupePointerUp
                      }
                      onPointerCancel={
                        isCompactGrid ? undefined : handleLoupePointerCancel
                      }
                      onDoubleClick={
                        isCompactGrid ? undefined : handleLoupeDoubleClick
                      }
                      className={`loupe-canvas ${
                        isCompactGrid
                          ? 'cursor-zoom-in'
                          : dragMode === 'relocate_roi'
                            ? 'cursor-move'
                            : zoom > 1
                              ? 'cursor-grab active:cursor-grabbing'
                              : 'cursor-crosshair'
                      }`}
                    />

                    {isCompactGrid && (
                      <button
                        type="button"
                        className="loupe-focus-trigger"
                        aria-label={t.tilt.mobileInspectTileAria(cell.id)}
                        onClick={() => {
                          setSelectedStationIdx(idx);
                          setFocusedStationIdx(idx);
                        }}
                      />
                    )}

                    {/* Top Micro-HUD */}
                    <div className="loupe-hud-top">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="loupe-pill mono-num font-semibold shrink-0">
                          {cell.id}
                        </span>
                        {cell.medianStarHfrPx !== null &&
                          Number.isFinite(cell.medianStarHfrPx) &&
                          cell.starCount > 0 && (
                            <span
                              className="loupe-pill loupe-hfr-pill mono-num"
                              style={{ color: 'hsl(204, 90%, 68%)' }}
                            >
                              HFR {cell.medianStarHfrPx.toFixed(2)}px
                            </span>
                          )}
                      </div>

                      <span
                        className="loupe-pill mono-num font-semibold"
                        style={{ color: retColor }}
                      >
                        <span className="loupe-ret-full">{fullRetLabel}</span>
                        <span className="loupe-ret-compact">
                          {compactRetLabel}
                        </span>
                      </span>
                    </div>

                    {/* Bottom Micro-HUD (desktop & expanded focus view) */}
                    <div className="loupe-hud-bottom mono-num">
                      <span>S {cell.sharpness.toFixed(4)}</span>
                      <span>
                        {cell.sensorRect[0]},{cell.sensorRect[1]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stage Hint Bar */}
        <div className="px-3.5 py-1.5 bg-[var(--bg-panel)] border-t border-[var(--hairline-default)] flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--text-muted)] shrink-0">
          <span>
            {isCompactGrid && focusedStationIdx === null
              ? t.tilt.mobileLoupeHint
              : t.tilt.loupeHint}
          </span>
          <span className="mono-num">{t.tilt.nearestNeighborBadge}</span>
        </div>
      </section>

      {/* Right Docked Optical Inspector */}
      <aside className="inspector-dock border-t xl:border-t-0 xl:border-l border-[var(--hairline-default)] xl:overflow-y-auto xl:h-full">
        {/* Section 1: Verdict & Optic Summary (desktop/wide; mobile renders above 3x3 grid) */}
        <section
          aria-label={t.tilt.collimationSectionAria}
          className="inspector-section desktop-verdict-section space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="section-eyebrow">{t.tilt.verdictHeader}</span>
            <span className={gradeBadgeClass}>
              {t.tilt.grades[sharpness.grade]}
            </span>
          </div>
          <div className="text-[13.5px] font-semibold text-[var(--text-primary)] leading-snug">
            {localizedDiag.verdictTitle}
          </div>
          <div className="text-[11.5px] text-[var(--text-muted)] mono-num truncate">
            {session.filename}
            {exposureSummary ? ` · ${exposureSummary}` : ''}
          </div>
        </section>

        {/* Section 2: Full-Frame Field Map & 5x5 Contour Heatmap */}
        <section
          aria-label={t.tilt.overviewSectionAria}
          className="inspector-section space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="section-eyebrow">{t.tilt.overviewTitle}</span>
            <button
              id="btn-toggle-heatmap"
              type="button"
              onClick={() => setShowHeatmap((v) => !v)}
              className={`btn-instrument ${showHeatmap ? 'is-toggled' : ''}`}
              style={{
                height: '24px',
                padding: '0 0.52rem',
                fontSize: '0.72rem',
              }}
            >
              {showHeatmap ? t.tilt.btnHideHeatmap : t.tilt.btnShowHeatmap}
            </button>
          </div>

          <div className="rounded-[var(--radius-sm)] bg-[#08090b] border border-[var(--hairline-default)] overflow-hidden">
            <canvas
              id="overview-heatmap-canvas"
              ref={overviewCanvasRef}
              onPointerDown={handleOverviewPointerDown}
              onPointerUp={handleOverviewPointerUp}
              onPointerCancel={handleOverviewPointerCancel}
              className="w-full h-auto cursor-crosshair block touch-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11.5px] text-[var(--text-muted)] mono-num">
              <span>{t.tilt.legendCollapse}</span>
              <div
                className="h-1.5 flex-1 mx-2.5 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, rgb(180,42,58) 0%, rgb(225,90,48) 35%, rgb(70,198,116) 72%, rgb(52,230,140) 100%)',
                }}
              />
              <span>{t.tilt.legendCenterPeak}</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] text-right mono-num">
              {t.tilt.legendOverPeakHint}
            </div>
          </div>
        </section>

        {/* Section 3: Polar Tilt Compass & Collimation Vector */}
        <section className="inspector-section">
          <div className="grid grid-cols-12 gap-3 items-center">
            <div className="col-span-5 flex justify-center">
              <svg
                width="116"
                height="116"
                viewBox="0 0 120 120"
                aria-label={t.tilt.compassAria}
              >
                <circle
                  cx="60"
                  cy="60"
                  r="46"
                  fill="var(--compass-bg)"
                  stroke="var(--compass-ring)"
                  strokeWidth="1"
                />
                {/* 30-degree precision azimuth ticks */}
                {Array.from({ length: 12 }, (_, i) => {
                  const rad = (i * 30 * Math.PI) / 180;
                  const r1 = i % 3 === 0 ? 41 : 43.5;
                  const r2 = 46;
                  return (
                    <line
                      key={i}
                      x1={60 + Math.cos(rad) * r1}
                      y1={60 + Math.sin(rad) * r1}
                      x2={60 + Math.cos(rad) * r2}
                      y2={60 + Math.sin(rad) * r2}
                      stroke="var(--compass-ring)"
                      strokeWidth="1"
                    />
                  );
                })}
                {/* Mild (0.09) & Severe (0.20) tolerance rings */}
                <circle
                  cx="60"
                  cy="60"
                  r="14"
                  fill="none"
                  stroke="var(--optical-green-border)"
                  strokeDasharray="2 2"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="29"
                  fill="none"
                  stroke="var(--accent-amber-border)"
                  strokeDasharray="3 2"
                />
                <line
                  x1="14"
                  y1="60"
                  x2="106"
                  y2="60"
                  stroke="var(--compass-axis)"
                />
                <line
                  x1="60"
                  y1="14"
                  x2="60"
                  y2="106"
                  stroke="var(--compass-axis)"
                />
                <text
                  x="60"
                  y="10"
                  textAnchor="middle"
                  fontSize="7.5"
                  fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-muted)"
                >
                  {t.tilt.compassTop}
                </text>
                <text
                  x="60"
                  y="116"
                  textAnchor="middle"
                  fontSize="7.5"
                  fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-muted)"
                >
                  {t.tilt.compassBottom}
                </text>

                {/* Collapse Direction Vector */}
                <line
                  x1="60"
                  y1="60"
                  x2={arrowX}
                  y2={arrowY}
                  stroke={vectorStroke}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <circle cx={arrowX} cy={arrowY} r="3.5" fill={vectorStroke} />
                <circle cx="60" cy="60" r="2" fill="var(--text-primary)" />
              </svg>
            </div>

            <div className="col-span-7 divide-y divide-[var(--hairline-subtle)]">
              <div className="kv-row">
                <span className="text-[var(--text-muted)]">
                  {t.tilt.metricTiltMag}
                </span>
                <span className="mono-num font-semibold text-[var(--text-primary)]">
                  {tv.magnitude.toFixed(3)}
                </span>
              </div>
              <div className="kv-row">
                <span className="text-[var(--text-muted)]">
                  {t.tilt.metricCollapseDir}
                </span>
                <span className="mono-num text-[var(--accent-amber)]">
                  {localizedDiag.collapseDirectionLabel}
                </span>
              </div>
              <div className="kv-row">
                <span className="text-[var(--text-muted)]">
                  {t.tilt.metricCollapseAngle}
                </span>
                <span className="mono-num text-[var(--text-secondary)]">
                  {tv.collapseAngleDeg.toFixed(1)}°
                </span>
              </div>
              <div className="kv-row">
                <span className="text-[var(--text-muted)]">
                  {t.tilt.metricRadialFalloff}
                </span>
                <span className="mono-num text-[var(--text-secondary)]">
                  {sharpness.radialFalloff.toFixed(3)}
                </span>
              </div>
              <div className="kv-row">
                <span className="text-[var(--text-muted)]">
                  {t.tilt.metricCenterSharpness}
                </span>
                <span className="mono-num text-[var(--optical-green)]">
                  {sharpness.centerSharpness.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: 4-Corner Retention & Diagonal Balance */}
        <section className="inspector-section space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="section-eyebrow">
              {t.tilt.cornerRetentionTitle}
            </span>
            <span className="status-tag">
              {t.tilt.cornerMean(
                (sharpness.cornerRetention.mean * 100).toFixed(1),
              )}
            </span>
          </div>

          <div className="space-y-1.5">
            {(
              [
                ['tl', t.tilt.cornerLabels.tl, sharpness.cornerRetention.tl],
                ['tr', t.tilt.cornerLabels.tr, sharpness.cornerRetention.tr],
                ['bl', t.tilt.cornerLabels.bl, sharpness.cornerRetention.bl],
                ['br', t.tilt.cornerLabels.br, sharpness.cornerRetention.br],
              ] as const
            ).map(([key, label, val]) => {
              const stationIdx = CORNER_INDEX_MAP[key];
              const isSelected = selectedStationIdx === stationIdx;
              const safeVal = Number.isFinite(val) ? Math.max(0, val) : 0;
              const pct = Math.min(100, safeVal * 100);
              const barColor =
                safeVal >= 0.72
                  ? 'var(--optical-green)'
                  : safeVal >= 0.48
                    ? 'var(--accent-amber)'
                    : 'var(--alert-coral)';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedStationIdx(stationIdx)}
                  className={`w-full grid grid-cols-[84px_1fr_48px] items-center gap-2.5 px-2 py-1 rounded-[var(--radius-xs)] border text-left cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[var(--bg-elevated)] border-[var(--hairline-strong)]'
                      : 'bg-transparent border-transparent hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="text-xs text-[var(--text-secondary)] truncate">
                    {label}
                  </span>
                  <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  <span className="mono-num text-xs font-medium text-right text-[var(--text-primary)]">
                    {(safeVal * 100).toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="px-2.5 py-1.5 rounded-[var(--radius-xs)] bg-[var(--bg-panel-subtle)] border border-[var(--hairline-subtle)] flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">
                {t.tilt.diagDiffTlBr}
              </span>
              <span className="mono-num font-medium text-[var(--text-primary)]">
                {(sharpness.asymmetry.tlBrDiff * 100).toFixed(1)}%
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-[var(--radius-xs)] bg-[var(--bg-panel-subtle)] border border-[var(--hairline-subtle)] flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">
                {t.tilt.diagDiffTrBl}
              </span>
              <span className="mono-num font-medium text-[var(--text-primary)]">
                {(sharpness.asymmetry.trBlDiff * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </section>

        {/* Section 5: Selected Station Sub-Plane Telemetry & Notes */}
        <section className="inspector-section space-y-3">
          {activeCell && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="section-eyebrow">
                  {t.tilt.activeStationTitle}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="status-tag">{activeCell.id}</span>
                  <span className="status-tag">
                    {t.tilt.validities[activeCell.validity]}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-[var(--hairline-subtle)]">
                <div className="kv-row">
                  <span className="text-[var(--text-muted)]">
                    {t.tilt.metricG1G2}
                  </span>
                  <span className="mono-num text-[var(--text-primary)]">
                    {activeCell.sharpnessG1.toFixed(4)} /{' '}
                    {activeCell.sharpnessG2.toFixed(4)}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="text-[var(--text-muted)]">
                    {t.tilt.metricSignalClip}
                  </span>
                  <span className="mono-num text-[var(--text-secondary)]">
                    {(activeCell.meanSignalNorm * 100).toFixed(1)}% /{' '}
                    {(activeCell.clippedFraction * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="kv-row">
                  <span className="text-[var(--text-muted)]">
                    {t.tilt.metricStarHfr}
                  </span>
                  <span className="mono-num text-[var(--text-secondary)]">
                    {activeCell.starCount > 0 &&
                    activeCell.medianStarHfrPx !== null
                      ? `${activeCell.starCount} · ${activeCell.medianStarHfrPx.toFixed(2)} px`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {localizedDiag.notes.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-[var(--hairline-subtle)]">
              <div className="section-eyebrow">{t.tilt.notesHeader}</div>
              <ul className="space-y-1.5 text-xs text-[var(--text-secondary)] m-0 pl-4 list-disc">
                {localizedDiag.notes.map((n, i) => (
                  <li key={i} className="leading-relaxed">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
};
