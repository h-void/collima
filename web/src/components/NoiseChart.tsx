import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  DarkFrameReport,
  IsoNoiseSeriesReport,
} from '../types/collima';
import {
  localizeDarkFrameNotes,
  localizeNoiseSeriesSummary,
} from '../i18n/diagnostics';
import { useI18n } from '../i18n/useI18n';

interface NoiseChartProps {
  series: IsoNoiseSeriesReport;
  onClear: () => void;
}

type ChannelView = 'mean' | 'all_channels' | 'R' | 'G1' | 'G2' | 'B';
type NoiseAxisMode = 'raw_adu' | 'iso100_norm';

const CHANNEL_VARS: Record<'R' | 'G1' | 'G2' | 'B', string> = {
  R: 'var(--channel-r)',
  G1: 'var(--channel-g1)',
  G2: 'var(--channel-g2)',
  B: 'var(--channel-b)',
};

function readChannelNoise(
  f: DarkFrameReport,
  ch: 'mean' | 'R' | 'G1' | 'G2' | 'B',
  axisMode: NoiseAxisMode,
): number {
  const rawVal =
    ch === 'mean'
      ? f.meanReadNoiseAdu
      : f.channels[ch === 'R' ? 0 : ch === 'G1' ? 1 : ch === 'G2' ? 2 : 3]
          .readNoiseAdu;
  const safeRaw = Number.isFinite(rawVal) && rawVal >= 0 ? rawVal : 0;

  if (axisMode !== 'iso100_norm') {
    return safeRaw;
  }
  if (ch === 'mean') {
    if (
      f.meanReadNoiseIso100Norm !== null &&
      Number.isFinite(f.meanReadNoiseIso100Norm)
    ) {
      return Math.max(0, f.meanReadNoiseIso100Norm);
    }
    return f.iso > 0 ? safeRaw * (100 / f.iso) : safeRaw;
  }
  const idx = ch === 'R' ? 0 : ch === 'G1' ? 1 : ch === 'G2' ? 2 : 3;
  const norm = f.channels[idx].readNoiseIso100Norm;
  if (norm !== null && Number.isFinite(norm)) {
    return Math.max(0, norm);
  }
  return f.iso > 0 ? safeRaw * (100 / f.iso) : safeRaw;
}

function getFrameChannelDr(
  f: DarkFrameReport,
  ch: 'mean' | 'R' | 'G1' | 'G2' | 'B',
): number {
  const val =
    ch === 'mean'
      ? f.meanEngineeringDrEv
      : f.channels[ch === 'R' ? 0 : ch === 'G1' ? 1 : ch === 'G2' ? 2 : 3]
          .engineeringDrEv;
  return Number.isFinite(val) ? val : 0;
}

function triggerBrowserDownload(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function triggerDownload(
  filename: string,
  mime: string,
  content: string,
  dialogTitle?: string,
) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    void invoke<boolean>('save_export_file', {
      defaultName: filename,
      content,
      dialogTitle,
    }).catch(() => {
      triggerBrowserDownload(filename, mime, content);
    });
    return;
  }
  triggerBrowserDownload(filename, mime, content);
}

export const NoiseChart: React.FC<NoiseChartProps> = ({ series, onClear }) => {
  const { locale, t } = useI18n();
  const [channelView, setChannelView] = useState<ChannelView>('mean');
  const [noiseAxisMode, setNoiseAxisMode] = useState<NoiseAxisMode>('raw_adu');
  const [selectedFrameKey, setSelectedFrameKey] = useState<string | null>(null);
  const chartBoxRef = useRef<HTMLDivElement | null>(null);
  const [chartBoxW, setChartBoxW] = useState<number>(880);

  // Narrow the SVG viewBox on small screens so axis text is not scaled to ~4px
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setChartBoxW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frames = series.frames;
  const safeSelectedIdx = useMemo(() => {
    if (frames.length === 0) return 0;
    if (selectedFrameKey !== null) {
      const idx = frames.findIndex(
        (f) => `${f.filename}::${f.iso}` === selectedFrameKey,
      );
      if (idx >= 0) return idx;
    }
    return 0;
  }, [frames, selectedFrameKey]);

  const activeFrame: DarkFrameReport | undefined = frames[safeSelectedIdx];

  const selectFrameByIdx = useCallback(
    (idx: number) => {
      if (frames.length === 0) return;
      const wrapped = ((idx % frames.length) + frames.length) % frames.length;
      const target = frames[wrapped];
      setSelectedFrameKey(`${target.filename}::${target.iso}`);
    },
    [frames],
  );

  const localizedSummary = useMemo(
    () => localizeNoiseSeriesSummary(series, locale),
    [series, locale],
  );
  const localizedFrameNotes = useMemo(
    () => (activeFrame ? localizeDarkFrameNotes(activeFrame, locale) : []),
    [activeFrame, locale],
  );
  const formatIsoText = useCallback(
    (iso: number) => (iso > 0 ? `ISO ${iso}` : t.noise.isoUnknownFull),
    [t.noise.isoUnknownFull],
  );

  const getFrameChannelNoise = useCallback(
    (f: DarkFrameReport, ch: 'mean' | 'R' | 'G1' | 'G2' | 'B') =>
      readChannelNoise(f, ch, noiseAxisMode),
    [noiseAxisMode],
  );

  // Aggregate Series KPIs
  const kpis = useMemo(() => {
    if (frames.length === 0) return null;
    let minNoiseFrame = frames[0];
    let maxDrFrame = frames[0];
    let sumBlDrift = 0;

    for (const f of frames) {
      if (f.meanReadNoiseAdu < minNoiseFrame.meanReadNoiseAdu) {
        minNoiseFrame = f;
      }
      if (f.meanEngineeringDrEv > maxDrFrame.meanEngineeringDrEv) {
        maxDrFrame = f;
      }
      sumBlDrift += f.meanBlackOffsetAdu;
    }

    return {
      minNoiseFrame,
      maxDrFrame,
      meanBlDrift: sumBlDrift / frames.length,
      primaryInflection: series.inflections[0] ?? null,
    };
  }, [frames, series.inflections]);

  // Compute SVG chart geometry, per-ISO aggregated curve buckets & duplicate-ISO node offsets
  const chartGeom = useMemo(() => {
    const W = Math.max(440, Math.min(880, chartBoxW));
    const H = 356;
    const padL = 62;
    const padR = 62;
    const padT = 30;
    const padB = 44;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    if (frames.length === 0) {
      return null;
    }

    const knownIsos = Array.from(
      new Set(frames.filter((f) => f.iso > 0).map((f) => f.iso)),
    ).sort((a, b) => a - b);
    const hasUnknownIso = frames.some((f) => f.iso <= 0);

    let minLogIso: number;
    let maxLogIso: number;
    let unknownLogPos: number;

    if (knownIsos.length > 0) {
      const logKnown = knownIsos.map((iso) => Math.log2(iso));
      minLogIso = Math.min(...logKnown);
      maxLogIso = Math.max(...logKnown);
      if (maxLogIso - minLogIso < 0.5) {
        minLogIso -= 0.5;
        maxLogIso += 0.5;
      }
      if (hasUnknownIso) {
        const extra = Math.max(0.85, (maxLogIso - minLogIso) * 0.22);
        unknownLogPos = maxLogIso + extra * 0.78;
        maxLogIso += extra;
      } else {
        unknownLogPos = maxLogIso;
      }
    } else {
      minLogIso = -0.5;
      maxLogIso = 0.5;
      unknownLogPos = 0;
    }

    const NOISE_LOG_FLOOR = 1e-3;
    const allNoiseVals: number[] = [];
    const allDrVals: number[] = [];

    for (const f of frames) {
      if (channelView === 'all_channels') {
        (['R', 'G1', 'G2', 'B'] as const).forEach((c) => {
          allNoiseVals.push(
            Math.max(NOISE_LOG_FLOOR, getFrameChannelNoise(f, c)),
          );
          allDrVals.push(getFrameChannelDr(f, c));
        });
      } else {
        allNoiseVals.push(
          Math.max(NOISE_LOG_FLOOR, getFrameChannelNoise(f, channelView)),
        );
        allDrVals.push(getFrameChannelDr(f, channelView));
      }
    }

    const logNoises = allNoiseVals.map((v) => Math.log2(v));
    let minLogNoise = Math.floor(Math.min(...logNoises) * 2) / 2 - 0.25;
    let maxLogNoise = Math.ceil(Math.max(...logNoises) * 2) / 2 + 0.35;
    if (!Number.isFinite(minLogNoise) || !Number.isFinite(maxLogNoise)) {
      minLogNoise = -2;
      maxLogNoise = 4;
    } else if (maxLogNoise - minLogNoise < 1) {
      minLogNoise -= 0.5;
      maxLogNoise = minLogNoise + 1;
    }

    let minDr = Math.floor(Math.min(...allDrVals)) - 0.5;
    let maxDr = Math.ceil(Math.max(...allDrVals)) + 0.5;
    if (!Number.isFinite(minDr) || !Number.isFinite(maxDr)) {
      minDr = 0;
      maxDr = 14;
    } else if (maxDr - minDr < 2) {
      minDr -= 0.5;
      maxDr = minDr + 2;
    }

    const logIsoSpan = Math.max(1e-6, maxLogIso - minLogIso);
    const logNoiseSpan = Math.max(1e-6, maxLogNoise - minLogNoise);
    const drSpan = Math.max(1e-6, maxDr - minDr);

    const insetX = 18;
    const xOfIso = (iso: number) => {
      const lv = iso > 0 ? Math.log2(iso) : unknownLogPos;
      return padL + insetX + ((lv - minLogIso) / logIsoSpan) * (plotW - insetX * 2);
    };

    const yOfNoise = (val: number) => {
      const safe = Number.isFinite(val) && val > 0 ? val : NOISE_LOG_FLOOR;
      const lv = Math.log2(Math.max(NOISE_LOG_FLOOR, safe));
      return padT + (1 - (lv - minLogNoise) / logNoiseSpan) * plotH;
    };

    const yOfDr = (ev: number) => {
      const safe = Number.isFinite(ev) ? ev : minDr;
      return padT + (1 - (safe - minDr) / drSpan) * plotH;
    };

    const noiseTicks: number[] = [];
    const stepLog =
      logNoiseSpan > 8 ? 2.0 : logNoiseSpan > 4.5 ? 1.0 : 0.5;
    for (
      let lv = Math.ceil(minLogNoise / stepLog) * stepLog;
      lv <= maxLogNoise + 1e-6;
      lv += stepLog
    ) {
      noiseTicks.push(Math.pow(2, lv));
    }

    const drTicks: number[] = [];
    const stepDr = drSpan > 12 ? 3 : drSpan > 6 ? 2 : 1;
    for (
      let ev = Math.ceil(minDr / stepDr) * stepDr;
      ev <= maxDr + 1e-6;
      ev += stepDr
    ) {
      drTicks.push(ev);
    }

    const uniqueIsos = hasUnknownIso ? [...knownIsos, 0] : knownIsos;

    const bucketMap = new Map<number, number[]>();
    frames.forEach((f, idx) => {
      const arr = bucketMap.get(f.iso);
      if (arr) {
        arr.push(idx);
      } else {
        bucketMap.set(f.iso, [idx]);
      }
    });

    const nodeXOffsets = new Float64Array(frames.length);
    for (const indices of bucketMap.values()) {
      if (indices.length > 1) {
        const stepPx = Math.min(10, 38 / indices.length);
        const mid = (indices.length - 1) * 0.5;
        indices.forEach((frameIdx, rank) => {
          nodeXOffsets[frameIdx] = (rank - mid) * stepPx;
        });
      }
    }

    const curveBuckets = knownIsos.map((iso) => ({
      iso,
      indices: bucketMap.get(iso) ?? [],
    }));

    // Greedy left-to-right ISO tick label culling to avoid overlapping text
    const isoLabelHidden = new Set<number>();
    let lastLabelX = -Infinity;
    for (const iso of uniqueIsos) {
      const x = xOfIso(iso);
      if (x - lastLabelX < 30) {
        isoLabelHidden.add(iso);
      } else {
        lastLabelX = x;
      }
    }

    return {
      W,
      H,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      xOfIso,
      yOfNoise,
      yOfDr,
      noiseTicks,
      drTicks,
      uniqueIsos,
      isoLabelHidden,
      curveBuckets,
      nodeXOffsets,
    };
  }, [frames, channelView, getFrameChannelNoise, chartBoxW]);

  const handleExportJson = () => {
    const slug = series.cameraModel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    triggerDownload(
      `collima_noise_${slug || 'sensor'}.json`,
      'application/json;charset=utf-8',
      JSON.stringify(series, null, 2),
      t.noise.exportDialogJsonTitle,
    );
  };

  const handleExportCsv = () => {
    const headers = [
      'filename',
      'camera',
      'iso',
      'mean_sigma_adu',
      'mean_sigma_iso100_norm',
      'mean_engineering_dr_ev',
      'mean_black_offset_adu',
      'R_sigma_adu',
      'G1_sigma_adu',
      'G2_sigma_adu',
      'B_sigma_adu',
      'R_dr_ev',
      'G1_dr_ev',
      'G2_dr_ev',
      'B_dr_ev',
      'R_black_offset',
      'G1_black_offset',
      'G2_black_offset',
      'B_black_offset',
      'hot_pixels_rejected',
      'hot_pixel_ppm',
      'zero_clipped',
      'suspected_light_leak',
    ];
    const rows = frames.map((f) => [
      `"${f.filename.replace(/"/g, '""')}"`,
      `"${f.metadata.cameraLabel.replace(/"/g, '""')}"`,
      f.iso > 0 ? f.iso : '',
      f.meanReadNoiseAdu.toFixed(4),
      f.meanReadNoiseIso100Norm !== null
        ? f.meanReadNoiseIso100Norm.toFixed(4)
        : '',
      f.meanEngineeringDrEv.toFixed(3),
      f.meanBlackOffsetAdu.toFixed(3),
      f.channels[0].readNoiseAdu.toFixed(4),
      f.channels[1].readNoiseAdu.toFixed(4),
      f.channels[2].readNoiseAdu.toFixed(4),
      f.channels[3].readNoiseAdu.toFixed(4),
      f.channels[0].engineeringDrEv.toFixed(3),
      f.channels[1].engineeringDrEv.toFixed(3),
      f.channels[2].engineeringDrEv.toFixed(3),
      f.channels[3].engineeringDrEv.toFixed(3),
      f.channels[0].blackLevelOffset.toFixed(3),
      f.channels[1].blackLevelOffset.toFixed(3),
      f.channels[2].blackLevelOffset.toFixed(3),
      f.channels[3].blackLevelOffset.toFixed(3),
      f.totalHotPixels,
      f.totalHotPixelPpm.toFixed(2),
      f.isZeroClipped,
      f.suspectedLightLeak,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(
      'collima_sensor_noise_calibration.csv',
      'text/csv;charset=utf-8',
      csv,
      t.noise.exportDialogCsvTitle,
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top Report Header & Actions Bar */}
      <section className="px-4 py-3 bg-[var(--bg-panel)] border-b border-[var(--hairline-default)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] m-0">
              {t.noise.reportTitle(series.cameraModel)}
            </h2>
            <span className="status-tag">
              {t.noise.frameCountBadge(frames.length)}
            </span>
            {series.inflections.map((inf, i) => (
              <span key={i} className="status-tag status-tag--pass">
                <Zap size={11} />
                <span>
                  {t.noise.inflectionBadge(
                    inf.fromIso,
                    inf.toIso,
                    inf.normNoiseDropPct.toFixed(1),
                    inf.drReboundEv.toFixed(2),
                  )}
                </span>
              </span>
            ))}
          </div>
          <p className="text-xs text-[var(--text-secondary)] m-0 leading-relaxed">
            {localizedSummary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            id="btn-export-noise-csv"
            type="button"
            onClick={handleExportCsv}
            className="btn-instrument"
          >
            <FileSpreadsheet size={13} className="text-[var(--optical-green)]" />
            <span>{t.noise.btnExportCsv}</span>
          </button>
          <button
            id="btn-export-noise-json"
            type="button"
            onClick={handleExportJson}
            className="btn-instrument"
          >
            <Download size={13} className="text-[var(--accent-amber)]" />
            <span>{t.noise.btnExportJson}</span>
          </button>
          <button
            id="btn-clear-noise-series"
            type="button"
            onClick={onClear}
            className="btn-instrument btn-danger-hover"
          >
            <Trash2 size={13} />
            <span>{t.noise.btnClearSeries}</span>
          </button>
        </div>
      </section>

      {/* 4-Column Sensor Metrology KPI Strip */}
      {kpis && (
        <section className="grid grid-cols-2 lg:grid-cols-4 bg-[var(--bg-panel-subtle)] border-b border-[var(--hairline-default)] divide-x divide-y lg:divide-y-0 divide-[var(--hairline-subtle)]">
          <div className="px-4 py-2.5 flex items-baseline justify-between gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
            <span className="text-xs text-[var(--text-muted)]">
              {t.noise.kpiBaseNoise}
            </span>
            <div className="sm:text-right mono-num">
              <span className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                {kpis.minNoiseFrame.meanReadNoiseAdu.toFixed(3)} ADU
              </span>
              <span className="text-[11px] text-[var(--text-muted)] ml-1.5 whitespace-nowrap">
                @ {formatIsoText(kpis.minNoiseFrame.iso)}
              </span>
            </div>
          </div>

          <div className="px-4 py-2.5 flex items-baseline justify-between gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
            <span className="text-xs text-[var(--text-muted)]">
              {t.noise.kpiPeakDr}
            </span>
            <div className="sm:text-right mono-num">
              <span className="text-[13.5px] font-semibold text-[var(--optical-green)]">
                {kpis.maxDrFrame.meanEngineeringDrEv.toFixed(2)} EV
              </span>
              <span className="text-[11px] text-[var(--text-muted)] ml-1.5 whitespace-nowrap">
                @ {formatIsoText(kpis.maxDrFrame.iso)}
              </span>
            </div>
          </div>

          <div className="px-4 py-2.5 flex items-baseline justify-between gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
            <span className="text-xs text-[var(--text-muted)]">
              {t.noise.kpiGainArch}
            </span>
            <span
              className={`mono-num text-xs font-semibold ${
                kpis.primaryInflection
                  ? 'text-[var(--optical-green)]'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {kpis.primaryInflection
                ? t.noise.kpiDualGain(kpis.primaryInflection.toIso)
                : t.noise.kpiSingleGain}
            </span>
          </div>

          <div className="px-4 py-2.5 flex items-baseline justify-between gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
            <span className="text-xs text-[var(--text-muted)]">
              {t.noise.kpiMeanBlDrift}
            </span>
            <span className="mono-num text-[13.5px] font-semibold text-[var(--text-primary)]">
              {kpis.meanBlDrift >= 0 ? '+' : ''}
              {kpis.meanBlDrift.toFixed(2)} ADU
            </span>
          </div>
        </section>
      )}

      {/* Upper Split Workspace: Interactive Dual-Axis Plot + Linked Frame Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_410px] border-b border-[var(--hairline-default)]">
        {/* Left Pane: Dual-Axis ISO Plot */}
        <section
          aria-label={t.noise.chartSectionAria}
          className="flex flex-col min-w-0 bg-[var(--bg-app)]"
        >
          <div className="viewport-toolbar">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Left Axis Metric Switch */}
              <div className="segmented-control">
                <button
                  id="btn-axis-raw-adu"
                  type="button"
                  onClick={() => setNoiseAxisMode('raw_adu')}
                  className={`segmented-btn ${
                    noiseAxisMode === 'raw_adu' ? 'is-active' : ''
                  }`}
                >
                  {t.noise.axisRawAduBtn}
                </button>
                <button
                  id="btn-axis-iso100-norm"
                  type="button"
                  onClick={() => setNoiseAxisMode('iso100_norm')}
                  className={`segmented-btn ${
                    noiseAxisMode === 'iso100_norm' ? 'is-active' : ''
                  }`}
                >
                  {t.noise.axisIso100Btn}
                </button>
              </div>

              {/* Clean Curve Legend */}
              <div className="hidden sm:flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-[2px] rounded-full"
                    style={{ background: 'var(--accent-amber)' }}
                  />
                  <span>{t.noise.legendNoiseSolid}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3.5 border-t-2 border-dashed"
                    style={{ borderColor: 'var(--optical-green)' }}
                  />
                  <span>{t.noise.legendDrDashed}</span>
                </span>
              </div>
            </div>

            {/* Channel Selector */}
            <div className="segmented-control">
              {(
                [
                  ['mean', t.noise.channelMean],
                  ['all_channels', t.noise.channelAll],
                  ['R', 'R'],
                  ['G1', 'G1'],
                  ['G2', 'G2'],
                  ['B', 'B'],
                ] as [ChannelView, string][]
              ).map(([key, label]) => {
                const isBayer =
                  key === 'R' || key === 'G1' || key === 'G2' || key === 'B';
                return (
                  <button
                    key={key}
                    id={`btn-channel-filter-${key}`}
                    type="button"
                    onClick={() => setChannelView(key)}
                    className={`segmented-btn mono-num ${
                      channelView === key ? 'is-active' : ''
                    }`}
                  >
                    {isBayer && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: CHANNEL_VARS[key] }}
                      />
                    )}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div ref={chartBoxRef} className="p-4 flex-1 flex items-center">
            {chartGeom && (
              <svg
                viewBox={`0 0 ${chartGeom.W} ${chartGeom.H}`}
                className="w-full h-auto select-none"
                role="img"
                aria-label={t.noise.svgAria}
              >
                {/* Horizontal Reference Lines (Left Noise Log Ticks) */}
                {chartGeom.noiseTicks.map((tv, idx) => {
                  const y = chartGeom.yOfNoise(tv);
                  return (
                    <g key={`nt-${idx}`}>
                      <line
                        x1={chartGeom.padL}
                        y1={y}
                        x2={chartGeom.W - chartGeom.padR}
                        y2={y}
                        stroke="var(--chart-grid)"
                        strokeWidth="1"
                      />
                      <text
                        x={chartGeom.padL - 10}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="10.5"
                        fontFamily="JetBrains Mono, monospace"
                        fill="var(--accent-amber)"
                      >
                        {tv >= 10
                          ? tv.toFixed(1)
                          : tv >= 0.1
                            ? tv.toFixed(2)
                            : tv.toFixed(3)}
                      </text>
                    </g>
                  );
                })}

                {/* Right Axis DR (EV) Labels */}
                {chartGeom.drTicks.map((ev, idx) => {
                  const y = chartGeom.yOfDr(ev);
                  return (
                    <text
                      key={`dr-${idx}`}
                      x={chartGeom.W - chartGeom.padR + 10}
                      y={y + 4}
                      textAnchor="start"
                      fontSize="10.5"
                      fontFamily="JetBrains Mono, monospace"
                      fill="var(--optical-green)"
                    >
                      {ev.toFixed(1)} EV
                    </text>
                  );
                })}

                {/* X-Axis ISO Ticks */}
                {chartGeom.uniqueIsos.map((iso) => {
                  const x = chartGeom.xOfIso(iso);
                  return (
                    <g key={`iso-${iso}`}>
                      <line
                        x1={x}
                        y1={chartGeom.padT}
                        x2={x}
                        y2={chartGeom.H - chartGeom.padB}
                        stroke="var(--chart-grid-minor)"
                      />
                      {!chartGeom.isoLabelHidden.has(iso) && (
                        <text
                          x={x}
                          y={chartGeom.H - chartGeom.padB + 19}
                          textAnchor="middle"
                          fontSize="10.5"
                          fontFamily="JetBrains Mono, monospace"
                          fill="var(--text-secondary)"
                        >
                          {iso > 0 ? iso : t.noise.isoUnknownShort}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Axis Titles */}
                <text
                  x={chartGeom.padL}
                  y={16}
                  fontSize="10.5"
                  fill="var(--accent-amber)"
                >
                  {noiseAxisMode === 'raw_adu'
                    ? t.noise.leftAxisRawTitle
                    : t.noise.leftAxisNormTitle}
                </text>
                <text
                  x={chartGeom.W - chartGeom.padR}
                  y={16}
                  textAnchor="end"
                  fontSize="10.5"
                  fill="var(--optical-green)"
                >
                  {t.noise.rightAxisDrTitle}
                </text>
                <text
                  x={chartGeom.W / 2}
                  y={chartGeom.H - 6}
                  textAnchor="middle"
                  fontSize="10.5"
                  fill="var(--text-muted)"
                >
                  {t.noise.bottomAxisIsoTitle}
                </text>

                {/* Dual Native ISO HCG Inflection Vertical Callouts */}
                {series.inflections.map((inf, idx) => {
                  const x = chartGeom.xOfIso(inf.toIso);
                  return (
                    <g key={`inf-${idx}`}>
                      <line
                        x1={x}
                        y1={chartGeom.padT}
                        x2={x}
                        y2={chartGeom.H - chartGeom.padB}
                        stroke="var(--optical-green)"
                        strokeWidth="1.4"
                        strokeDasharray="4 3"
                      />
                      <rect
                        x={x - 52}
                        y={chartGeom.padT + 4}
                        width={104}
                        height={19}
                        rx={4}
                        fill="var(--bg-panel)"
                        stroke="var(--optical-green-border)"
                      />
                      <text
                        x={x}
                        y={chartGeom.padT + 16.5}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="JetBrains Mono, monospace"
                        fill="var(--optical-green)"
                      >
                        HCG @ ISO {inf.toIso}
                      </text>
                    </g>
                  );
                })}

                {/* Per-ISO Mean Curves */}
                {chartGeom.curveBuckets.length >= 2 &&
                  (channelView === 'all_channels' ? (
                    (['R', 'G1', 'G2', 'B'] as const).map((ch) => {
                      const noisePts = chartGeom.curveBuckets
                        .map(({ iso, indices }) => {
                          const meanNoise =
                            indices.reduce(
                              (acc, i) =>
                                acc + getFrameChannelNoise(frames[i], ch),
                              0,
                            ) / Math.max(1, indices.length);
                          return `${chartGeom.xOfIso(iso)},${chartGeom.yOfNoise(meanNoise)}`;
                        })
                        .join(' ');
                      const drPts = chartGeom.curveBuckets
                        .map(({ iso, indices }) => {
                          const meanDr =
                            indices.reduce(
                              (acc, i) =>
                                acc + getFrameChannelDr(frames[i], ch),
                              0,
                            ) / Math.max(1, indices.length);
                          return `${chartGeom.xOfIso(iso)},${chartGeom.yOfDr(meanDr)}`;
                        })
                        .join(' ');
                      return (
                        <g key={ch}>
                          <polyline
                            fill="none"
                            stroke={CHANNEL_VARS[ch]}
                            strokeWidth="1.9"
                            points={noisePts}
                          />
                          <polyline
                            fill="none"
                            stroke={CHANNEL_VARS[ch]}
                            strokeWidth="1.3"
                            strokeDasharray="5 4"
                            opacity={0.72}
                            points={drPts}
                          />
                        </g>
                      );
                    })
                  ) : (
                    <>
                      {/* Dynamic Range Curve (Right Axis, Dashed Optical Green) */}
                      <polyline
                        fill="none"
                        stroke="var(--optical-green)"
                        strokeWidth="1.8"
                        strokeDasharray="6 4"
                        points={chartGeom.curveBuckets
                          .map(({ iso, indices }) => {
                            const meanDr =
                              indices.reduce(
                                (acc, i) =>
                                  acc +
                                  getFrameChannelDr(frames[i], channelView),
                                0,
                              ) / Math.max(1, indices.length);
                            return `${chartGeom.xOfIso(iso)},${chartGeom.yOfDr(meanDr)}`;
                          })
                          .join(' ')}
                      />

                      {/* Read Noise Curve (Left Axis, Solid) */}
                      <polyline
                        fill="none"
                        stroke={
                          channelView === 'mean'
                            ? 'var(--accent-amber)'
                            : CHANNEL_VARS[channelView]
                        }
                        strokeWidth="2.2"
                        points={chartGeom.curveBuckets
                          .map(({ iso, indices }) => {
                            const meanNoise =
                              indices.reduce(
                                (acc, i) =>
                                  acc +
                                  getFrameChannelNoise(frames[i], channelView),
                                0,
                              ) / Math.max(1, indices.length);
                            return `${chartGeom.xOfIso(iso)},${chartGeom.yOfNoise(meanNoise)}`;
                          })
                          .join(' ')}
                      />
                    </>
                  ))}

                {/* Interactive Data Nodes */}
                {frames.map((f, idx) => {
                  const chKey =
                    channelView === 'all_channels' ? 'mean' : channelView;
                  const x = Math.max(
                    chartGeom.padL + 6,
                    Math.min(
                      chartGeom.W - chartGeom.padR - 6,
                      chartGeom.xOfIso(f.iso) + chartGeom.nodeXOffsets[idx],
                    ),
                  );
                  const yn = chartGeom.yOfNoise(getFrameChannelNoise(f, chKey));
                  const yd = chartGeom.yOfDr(getFrameChannelDr(f, chKey));
                  const isSel = idx === safeSelectedIdx;
                  const frameKey = `${f.filename}::${f.iso}`;

                  return (
                    <g
                      key={frameKey}
                      className="cursor-pointer"
                      onClick={() => setSelectedFrameKey(frameKey)}
                      onMouseEnter={() => setSelectedFrameKey(frameKey)}
                    >
                      {isSel && (
                        <line
                          x1={x}
                          y1={chartGeom.padT}
                          x2={x}
                          y2={chartGeom.H - chartGeom.padB}
                          stroke="var(--chart-crosshair)"
                        />
                      )}
                      {channelView === 'all_channels' ? (
                        (['R', 'G1', 'G2', 'B'] as const).map((c) => (
                          <circle
                            key={c}
                            cx={x}
                            cy={chartGeom.yOfNoise(getFrameChannelNoise(f, c))}
                            r={isSel ? 4.6 : 3.2}
                            fill={
                              isSel ? CHANNEL_VARS[c] : 'var(--chart-node-fill)'
                            }
                            stroke={CHANNEL_VARS[c]}
                            strokeWidth="1.8"
                          />
                        ))
                      ) : (
                        <>
                          <circle
                            cx={x}
                            cy={yd}
                            r={isSel ? 5.2 : 3.8}
                            fill="var(--chart-node-fill)"
                            stroke="var(--optical-green)"
                            strokeWidth="1.9"
                          />
                          <circle
                            cx={x}
                            cy={yn}
                            r={isSel ? 5.8 : 4}
                            fill={
                              isSel
                                ? channelView === 'mean'
                                  ? 'var(--accent-amber)'
                                  : CHANNEL_VARS[channelView]
                                : 'var(--chart-node-fill)'
                            }
                            stroke={
                              channelView === 'mean'
                                ? 'var(--accent-amber)'
                                : CHANNEL_VARS[channelView]
                            }
                            strokeWidth="2.1"
                          />
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </section>

        {/* Right Docked Frame Inspector */}
        {activeFrame && (
          <aside className="inspector-dock border-t xl:border-t-0 xl:border-l border-[var(--hairline-default)]">
            {/* Section 1: Selected ISO Frame & Stepper */}
            <div className="inspector-section flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="section-eyebrow">{t.noise.frameDetailHint}</div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)] mono-num truncate mt-0.5">
                  {formatIsoText(activeFrame.iso)} · {activeFrame.filename}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="status-tag">
                  {activeFrame.metadata.bitsPerSample}-bit{' '}
                  {activeFrame.metadata.cfaPattern}
                </span>
                {frames.length > 1 && (
                  <div className="inline-flex items-center gap-1">
                    <button
                      id="btn-prev-iso-frame"
                      type="button"
                      aria-label={t.noise.prevFrameAria}
                      onClick={() => selectFrameByIdx(safeSelectedIdx - 1)}
                      className="btn-instrument btn-icon-only"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      id="btn-next-iso-frame"
                      type="button"
                      aria-label={t.noise.nextFrameAria}
                      onClick={() => selectFrameByIdx(safeSelectedIdx + 1)}
                      className="btn-instrument btn-icon-only"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Quality Alerts if Zero-Clipped, Light Leak, or Notes */}
            {localizedFrameNotes.length > 0 && (
              <div className="inspector-section">
                <div
                  className={`p-2.5 rounded-[var(--radius-sm)] text-xs space-y-1 ${
                    activeFrame.isZeroClipped || activeFrame.suspectedLightLeak
                      ? 'bg-[var(--alert-coral-soft)] border border-[var(--alert-coral-border)] text-[var(--alert-coral)]'
                      : 'bg-[var(--bg-panel-subtle)] border border-[var(--hairline-default)] text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle size={13} />
                    <span>{t.noise.integrityAlertTitle}</span>
                  </div>
                  {localizedFrameNotes.map((note, idx) => (
                    <p key={idx} className="m-0 leading-relaxed">
                      {note}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: Compact 4-Channel Bayer Matrix */}
            <div className="inspector-section">
              <table className="channel-matrix-table mono-num">
                <thead>
                  <tr>
                    <th>CFA</th>
                    <th>σ_ADU</th>
                    <th>DR (EV)</th>
                    <th>{t.noise.deltaBlLabel}</th>
                    <th>{t.noise.hotPixelsRejectedLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeFrame.channels.map((ch) => (
                    <tr key={ch.channel}>
                      <td>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: CHANNEL_VARS[ch.channel] }}
                          />
                          <span>{t.noise.channelCardTitle(ch.channel)}</span>
                        </span>
                      </td>
                      <td className="font-medium text-[var(--text-primary)]">
                        {ch.readNoiseAdu.toFixed(3)}
                      </td>
                      <td className="text-[var(--optical-green)]">
                        {ch.engineeringDrEv.toFixed(2)}
                      </td>
                      <td>
                        {ch.blackLevelOffset >= 0 ? '+' : ''}
                        {ch.blackLevelOffset.toFixed(2)}
                      </td>
                      <td>
                        {ch.hotPixelCount}{' '}
                        <span className="text-[var(--text-muted)]">
                          ({ch.hotPixelPpm.toFixed(0)}p)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 3: G1 Black-Level ADU Gaussian Histogram */}
            {activeFrame.g1HistogramWindow.length >= 1 && (
              <div className="inspector-section space-y-2">
                <div className="flex items-center justify-between">
                  <span className="section-eyebrow">{t.noise.g1HistTitle}</span>
                  <span className="status-tag">
                    {t.noise.nominalBlLabel(
                      activeFrame.channels[1].nominalBlackLevel.toFixed(0),
                    )}
                  </span>
                </div>

                {(() => {
                  const bins = activeFrame.g1HistogramWindow;
                  const maxCnt = Math.max(1, ...bins.map((b) => b[1]));
                  const rawMin = bins[0][0];
                  const rawMax = bins[bins.length - 1][0];
                  const minAdu =
                    rawMin === rawMax ? Math.max(0, rawMin - 4) : rawMin;
                  const maxAdu = rawMin === rawMax ? rawMax + 4 : rawMax;
                  const span = Math.max(1, maxAdu - minAdu + 1);
                  const blAdu = activeFrame.channels[1].nominalBlackLevel;
                  const blX = ((blAdu - minAdu + 0.5) / span) * 320;

                  return (
                    <div className="p-2.5 rounded-[var(--radius-sm)] bg-[#08090b] border border-[var(--hairline-default)]">
                      <svg viewBox="0 0 320 92" className="w-full h-22 block">
                        {bins.map(([adu, cnt]) => {
                          const x = ((adu - minAdu) / span) * 320;
                          const bw = Math.max(1.2, (320 / span) * 0.82);
                          const bh = (cnt / maxCnt) * 72;
                          return (
                            <rect
                              key={adu}
                              x={x}
                              y={76 - bh}
                              width={bw}
                              height={bh}
                              fill="hsla(152, 65%, 50%, 0.8)"
                            />
                          );
                        })}
                        {blX >= 0 && blX <= 320 && (
                          <line
                            x1={blX}
                            y1={4}
                            x2={blX}
                            y2={76}
                            stroke="hsl(36, 92%, 60%)"
                            strokeWidth="1.2"
                            strokeDasharray="3 2"
                          />
                        )}
                        <text
                          x={4}
                          y={89}
                          fontSize="8.5"
                          fontFamily="JetBrains Mono, monospace"
                          fill="hsl(215, 10%, 56%)"
                        >
                          {minAdu} ADU
                        </text>
                        <text
                          x={316}
                          y={89}
                          textAnchor="end"
                          fontSize="8.5"
                          fontFamily="JetBrains Mono, monospace"
                          fill="hsl(215, 10%, 56%)"
                        >
                          {maxAdu} ADU
                        </text>
                      </svg>
                    </div>
                  );
                })()}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Lower Full-Width Calibration Data Ledger */}
      <section className="bg-[var(--bg-panel)] flex-1">
        <div className="px-4 py-2.5 border-b border-[var(--hairline-subtle)] flex items-center justify-between">
          <h3 className="section-eyebrow m-0">{t.noise.tableTitle}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="calib-table mono-num">
            <thead>
              <tr>
                <th>{t.noise.colIso}</th>
                <th>{t.noise.colFilename}</th>
                <th>{t.noise.colNominalBl}</th>
                <th>{t.noise.colMeanDeltaBl}</th>
                <th>R σ_ADU</th>
                <th>G1 σ_ADU</th>
                <th>G2 σ_ADU</th>
                <th>B σ_ADU</th>
                <th>{t.noise.colMeanSigma}</th>
                <th>{t.noise.colIso100Norm}</th>
                <th>{t.noise.colDrEv}</th>
                <th>{t.noise.colHotPixels}</th>
                <th>{t.noise.colValidation}</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f, idx) => {
                const frameKey = `${f.filename}::${f.iso}`;
                const isSelected = idx === safeSelectedIdx;
                return (
                  <tr
                    key={frameKey}
                    onClick={() => setSelectedFrameKey(frameKey)}
                    className={`cursor-pointer ${
                      isSelected ? 'is-selected-row' : ''
                    }`}
                  >
                    <td className="font-semibold text-[var(--text-primary)]">
                      {formatIsoText(f.iso)}
                    </td>
                    <td className="font-sans text-xs">{f.filename}</td>
                    <td>{f.channels[1].nominalBlackLevel.toFixed(1)}</td>
                    <td>
                      {f.meanBlackOffsetAdu >= 0 ? '+' : ''}
                      {f.meanBlackOffsetAdu.toFixed(2)}
                    </td>
                    <td>{f.channels[0].readNoiseAdu.toFixed(3)}</td>
                    <td>{f.channels[1].readNoiseAdu.toFixed(3)}</td>
                    <td>{f.channels[2].readNoiseAdu.toFixed(3)}</td>
                    <td>{f.channels[3].readNoiseAdu.toFixed(3)}</td>
                    <td className="font-semibold text-[var(--accent-amber)]">
                      {f.meanReadNoiseAdu.toFixed(3)}
                    </td>
                    <td>
                      {f.meanReadNoiseIso100Norm !== null
                        ? f.meanReadNoiseIso100Norm.toFixed(3)
                        : '—'}
                    </td>
                    <td className="font-semibold text-[var(--optical-green)]">
                      {f.meanEngineeringDrEv.toFixed(2)} EV
                    </td>
                    <td>
                      {f.totalHotPixels} ({f.totalHotPixelPpm.toFixed(1)} ppm)
                    </td>
                    <td className="font-sans">
                      {f.isZeroClipped ? (
                        <span className="status-tag status-tag--crit">
                          {t.noise.badgeZeroClipped}
                        </span>
                      ) : f.suspectedLightLeak ? (
                        <span className="status-tag status-tag--warn">
                          {t.noise.badgeLightLeak}
                        </span>
                      ) : (
                        <span className="status-tag status-tag--pass">
                          {t.noise.badgeCleanDark}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
