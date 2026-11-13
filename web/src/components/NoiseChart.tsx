import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Download,
  FileSpreadsheet,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  DarkFrameReport,
  IsoNoiseSeriesReport,
} from '../types/collima';

interface NoiseChartProps {
  series: IsoNoiseSeriesReport;
  onClear: () => void;
}

type ChannelView = 'mean' | 'all_channels' | 'R' | 'G1' | 'G2' | 'B';
type NoiseAxisMode = 'raw_adu' | 'iso100_norm';

const CHANNEL_COLORS: Record<'R' | 'G1' | 'G2' | 'B', string> = {
  R: 'hsl(4, 80%, 62%)',
  G1: 'hsl(150, 65%, 48%)',
  G2: 'hsl(166, 62%, 46%)',
  B: 'hsl(201, 86%, 58%)',
};

function readChannelNoise(
  f: DarkFrameReport,
  ch: 'mean' | 'R' | 'G1' | 'G2' | 'B',
  axisMode: NoiseAxisMode,
): number {
  if (ch === 'mean') {
    return axisMode === 'iso100_norm'
      ? (f.meanReadNoiseIso100Norm ??
          f.meanReadNoiseAdu * (100 / Math.max(1, f.iso)))
      : f.meanReadNoiseAdu;
  }
  const idx = ch === 'R' ? 0 : ch === 'G1' ? 1 : ch === 'G2' ? 2 : 3;
  const stats = f.channels[idx];
  return axisMode === 'iso100_norm'
    ? (stats.readNoiseIso100Norm ??
        stats.readNoiseAdu * (100 / Math.max(1, f.iso)))
    : stats.readNoiseAdu;
}

function getFrameChannelDr(
  f: DarkFrameReport,
  ch: 'mean' | 'R' | 'G1' | 'G2' | 'B',
): number {
  if (ch === 'mean') return f.meanEngineeringDrEv;
  const idx = ch === 'R' ? 0 : ch === 'G1' ? 1 : ch === 'G2' ? 2 : 3;
  return f.channels[idx].engineeringDrEv;
}

function triggerDownload(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const NoiseChart: React.FC<NoiseChartProps> = ({ series, onClear }) => {
  const [channelView, setChannelView] = useState<ChannelView>('mean');
  const [noiseAxisMode, setNoiseAxisMode] = useState<NoiseAxisMode>('raw_adu');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  const frames = series.frames;
  const activeFrame: DarkFrameReport | undefined =
    frames[Math.min(selectedIdx, Math.max(0, frames.length - 1))];

  const getFrameChannelNoise = useCallback(
    (f: DarkFrameReport, ch: 'mean' | 'R' | 'G1' | 'G2' | 'B') =>
      readChannelNoise(f, ch, noiseAxisMode),
    [noiseAxisMode],
  );

  // Compute SVG chart geometry & scales
  const chartGeom = useMemo(() => {
    const W = 860;
    const H = 370;
    const padL = 66;
    const padR = 64;
    const padT = 32;
    const padB = 46;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    if (frames.length === 0) {
      return null;
    }

    const logIsos = frames.map((f) => Math.log2(Math.max(25, f.iso)));
    let minLogIso = Math.min(...logIsos);
    let maxLogIso = Math.max(...logIsos);
    if (maxLogIso - minLogIso < 0.5) {
      minLogIso -= 0.5;
      maxLogIso += 0.5;
    }

    const allNoiseVals: number[] = [];
    const allDrVals: number[] = [];

    for (const f of frames) {
      if (channelView === 'all_channels') {
        (['R', 'G1', 'G2', 'B'] as const).forEach((c) => {
          allNoiseVals.push(Math.max(0.05, getFrameChannelNoise(f, c)));
          allDrVals.push(getFrameChannelDr(f, c));
        });
      } else {
        allNoiseVals.push(Math.max(0.05, getFrameChannelNoise(f, channelView)));
        allDrVals.push(getFrameChannelDr(f, channelView));
      }
    }

    const logNoises = allNoiseVals.map((v) => Math.log2(v));
    let minLogNoise = Math.floor(Math.min(...logNoises) * 2) / 2 - 0.25;
    let maxLogNoise = Math.ceil(Math.max(...logNoises) * 2) / 2 + 0.35;
    if (maxLogNoise - minLogNoise < 1) {
      maxLogNoise = minLogNoise + 1;
    }

    let minDr = Math.floor(Math.min(...allDrVals)) - 0.5;
    let maxDr = Math.ceil(Math.max(...allDrVals)) + 0.5;
    if (maxDr - minDr < 2) {
      maxDr = minDr + 2;
    }

    const xOfIso = (iso: number) =>
      padL +
      ((Math.log2(Math.max(25, iso)) - minLogIso) /
        (maxLogIso - minLogIso)) *
        plotW;

    const yOfNoise = (val: number) => {
      const lv = Math.log2(Math.max(0.05, val));
      return (
        padT +
        (1 - (lv - minLogNoise) / (maxLogNoise - minLogNoise)) * plotH
      );
    };

    const yOfDr = (ev: number) =>
      padT + (1 - (ev - minDr) / (maxDr - minDr)) * plotH;

    // Generate clean ticks
    const noiseTicks: number[] = [];
    const stepLog = maxLogNoise - minLogNoise > 4.5 ? 1.0 : 0.5;
    for (
      let lv = Math.ceil(minLogNoise / stepLog) * stepLog;
      lv <= maxLogNoise + 1e-6;
      lv += stepLog
    ) {
      noiseTicks.push(Math.pow(2, lv));
    }

    const drTicks: number[] = [];
    const stepDr = maxDr - minDr > 6 ? 2 : 1;
    for (
      let ev = Math.ceil(minDr / stepDr) * stepDr;
      ev <= maxDr + 1e-6;
      ev += stepDr
    ) {
      drTicks.push(ev);
    }

    const uniqueIsos = Array.from(new Set(frames.map((f) => f.iso))).sort(
      (a, b) => a - b,
    );

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
    };
  }, [frames, channelView, getFrameChannelNoise]);

  const handleExportJson = () => {
    const slug = series.cameraModel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    triggerDownload(
      `collima_noise_${slug || 'sensor'}.json`,
      'application/json;charset=utf-8',
      JSON.stringify(series, null, 2),
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
      f.iso,
      f.meanReadNoiseAdu.toFixed(4),
      (f.meanReadNoiseIso100Norm ?? 0).toFixed(4),
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
    );
  };

  return (
    <div className="max-w-[1680px] mx-auto w-full px-4 py-4 space-y-4">
      {/* Top Summary & Inflection Callouts */}
      <section className="instrument-panel p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {series.cameraModel} · 传感器读出噪声与动态范围标定报告
            </h2>
            <span className="status-tag">{frames.length} 张暗帧样本</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{series.summary}</p>

          {series.inflections.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {series.inflections.map((inf, i) => (
                <span
                  key={i}
                  className="status-tag status-tag--pass flex items-center gap-1.5"
                >
                  <Zap size={12} />
                  <span>
                    双原生 ISO HCG 拐点：ISO {inf.fromIso} → ISO {inf.toIso}（等效噪声骤降{' '}
                    {inf.normNoiseDropPct.toFixed(1)}%，动态范围回升 +
                    {inf.drReboundEv.toFixed(2)} EV）
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            id="btn-export-noise-csv"
            type="button"
            onClick={handleExportCsv}
            className="btn-instrument"
          >
            <FileSpreadsheet size={14} className="text-[var(--optical-green)]" />
            <span>导出 CSV</span>
          </button>
          <button
            id="btn-export-noise-json"
            type="button"
            onClick={handleExportJson}
            className="btn-instrument"
          >
            <Download size={14} className="text-[var(--accent-amber)]" />
            <span>导出 JSON</span>
          </button>
          <button
            id="btn-clear-noise-series"
            type="button"
            onClick={onClear}
            className="btn-instrument"
          >
            <Trash2 size={14} className="text-[var(--alert-coral)]" />
            <span>清空列表</span>
          </button>
        </div>
      </section>

      {/* Main Dual-Axis Interactive Chart + G1 Bell-Curve Histogram Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <section
          aria-label="双轴读出噪声与动态范围交互曲线"
          className="xl:col-span-8 instrument-panel overflow-hidden"
        >
          <div className="panel-header">
            <h3 className="panel-title">
              <BarChart3 size={15} className="text-[var(--accent-amber)]" />
              <span>ISO 读出噪声 (Log2 ADU) 与工程动态范围 (EV) 双轴曲线</span>
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              {/* Left Axis Metric Switch */}
              <div className="segmented-control">
                <button
                  id="btn-axis-raw-adu"
                  type="button"
                  onClick={() => setNoiseAxisMode('raw_adu')}
                  className={`segmented-btn ${noiseAxisMode === 'raw_adu' ? 'is-active' : ''}`}
                  style={{ padding: '0.24rem 0.58rem', fontSize: '0.74rem' }}
                >
                  σ_ADU 原始读出噪声
                </button>
                <button
                  id="btn-axis-iso100-norm"
                  type="button"
                  onClick={() => setNoiseAxisMode('iso100_norm')}
                  className={`segmented-btn ${noiseAxisMode === 'iso100_norm' ? 'is-active' : ''}`}
                  style={{ padding: '0.24rem 0.58rem', fontSize: '0.74rem' }}
                >
                  ISO 100 等效输入底噪
                </button>
              </div>

              {/* Channel Selector */}
              <div className="segmented-control">
                {(
                  [
                    ['mean', '均值'],
                    ['all_channels', '四通道'],
                    ['R', 'R'],
                    ['G1', 'G1'],
                    ['G2', 'G2'],
                    ['B', 'B'],
                  ] as [ChannelView, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    id={`btn-channel-filter-${key}`}
                    type="button"
                    onClick={() => setChannelView(key)}
                    className={`segmented-btn mono-num ${
                      channelView === key ? 'is-active' : ''
                    }`}
                    style={{ padding: '0.24rem 0.52rem', fontSize: '0.73rem' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4">
            {chartGeom && (
              <svg
                viewBox={`0 0 ${chartGeom.W} ${chartGeom.H}`}
                className="w-full h-auto select-none"
                role="img"
                aria-label="ISO 噪声与动态范围折线图"
              >
                {/* Horizontal Subtle Reference Lines (Left Noise Log Ticks) */}
                {chartGeom.noiseTicks.map((tv, idx) => {
                  const y = chartGeom.yOfNoise(tv);
                  return (
                    <g key={`nt-${idx}`}>
                      <line
                        x1={chartGeom.padL}
                        y1={y}
                        x2={chartGeom.W - chartGeom.padR}
                        y2={y}
                        stroke="hsla(210, 16%, 85%, 0.07)"
                        strokeWidth="1"
                      />
                      <text
                        x={chartGeom.padL - 10}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fontFamily="JetBrains Mono, monospace"
                        fill="hsl(37, 88%, 62%)"
                      >
                        {tv >= 10 ? tv.toFixed(1) : tv.toFixed(2)}
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
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                      fill="hsl(152, 65%, 56%)"
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
                        stroke="hsla(210, 16%, 85%, 0.05)"
                      />
                      <text
                        x={x}
                        y={chartGeom.H - chartGeom.padB + 20}
                        textAnchor="middle"
                        fontSize="11"
                        fontFamily="JetBrains Mono, monospace"
                        fill="hsl(214, 12%, 68%)"
                      >
                        {iso}
                      </text>
                    </g>
                  );
                })}

                {/* Axis Titles */}
                <text
                  x={chartGeom.padL}
                  y={18}
                  fontSize="11"
                  fill="hsl(37, 88%, 62%)"
                >
                  {noiseAxisMode === 'raw_adu'
                    ? '← 左轴：读出噪声 σ_ADU (Log2 对数刻度)'
                    : '← 左轴：ISO 100 等效输入噪声 ADU (Log2)'}
                </text>
                <text
                  x={chartGeom.W - chartGeom.padR}
                  y={18}
                  textAnchor="end"
                  fontSize="11"
                  fill="hsl(152, 65%, 56%)"
                >
                  右轴：工程动态范围 Engineering DR (EV, 虚线) →
                </text>
                <text
                  x={chartGeom.W / 2}
                  y={chartGeom.H - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill="hsl(215, 10%, 50%)"
                >
                  感光度 ISO (Log2 等档距坐标)
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
                        stroke="hsl(152, 70%, 52%)"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                      />
                      <rect
                        x={x - 54}
                        y={chartGeom.padT + 4}
                        width={108}
                        height={20}
                        rx={4}
                        fill="hsla(152, 55%, 14%, 0.92)"
                        stroke="hsla(152, 62%, 48%, 0.45)"
                      />
                      <text
                        x={x}
                        y={chartGeom.padT + 17}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                        fill="hsl(152, 75%, 68%)"
                      >
                        HCG @ ISO {inf.toIso}
                      </text>
                    </g>
                  );
                })}

                {/* Curves */}
                {channelView === 'all_channels' ? (
                  (['R', 'G1', 'G2', 'B'] as const).map((ch) => {
                    const noisePts = frames
                      .map(
                        (f) =>
                          `${chartGeom.xOfIso(f.iso)},${chartGeom.yOfNoise(
                            getFrameChannelNoise(f, ch),
                          )}`,
                      )
                      .join(' ');
                    const drPts = frames
                      .map(
                        (f) =>
                          `${chartGeom.xOfIso(f.iso)},${chartGeom.yOfDr(
                            getFrameChannelDr(f, ch),
                          )}`,
                      )
                      .join(' ');
                    return (
                      <g key={ch}>
                        <polyline
                          fill="none"
                          stroke={CHANNEL_COLORS[ch]}
                          strokeWidth="2"
                          points={noisePts}
                        />
                        <polyline
                          fill="none"
                          stroke={CHANNEL_COLORS[ch]}
                          strokeWidth="1.4"
                          strokeDasharray="5 4"
                          opacity={0.75}
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
                      stroke="hsl(152, 62%, 48%)"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      points={frames
                        .map(
                          (f) =>
                            `${chartGeom.xOfIso(f.iso)},${chartGeom.yOfDr(
                              getFrameChannelDr(f, channelView),
                            )}`,
                        )
                        .join(' ')}
                    />

                    {/* Read Noise Curve (Left Axis, Solid Amber or Channel Color) */}
                    <polyline
                      fill="none"
                      stroke={
                        channelView === 'mean'
                          ? 'hsl(37, 88%, 56%)'
                          : CHANNEL_COLORS[channelView]
                      }
                      strokeWidth="2.5"
                      points={frames
                        .map(
                          (f) =>
                            `${chartGeom.xOfIso(f.iso)},${chartGeom.yOfNoise(
                              getFrameChannelNoise(f, channelView),
                            )}`,
                        )
                        .join(' ')}
                    />
                  </>
                )}

                {/* Interactive Data Nodes */}
                {frames.map((f, idx) => {
                  const chKey =
                    channelView === 'all_channels' ? 'mean' : channelView;
                  const x = chartGeom.xOfIso(f.iso);
                  const yn = chartGeom.yOfNoise(getFrameChannelNoise(f, chKey));
                  const yd = chartGeom.yOfDr(getFrameChannelDr(f, chKey));
                  const isSel = idx === selectedIdx;

                  return (
                    <g
                      key={`${f.filename}-${idx}`}
                      className="cursor-pointer"
                      onClick={() => setSelectedIdx(idx)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                    >
                      {isSel && (
                        <line
                          x1={x}
                          y1={chartGeom.padT}
                          x2={x}
                          y2={chartGeom.H - chartGeom.padB}
                          stroke="hsla(210, 20%, 95%, 0.18)"
                        />
                      )}
                      <circle
                        cx={x}
                        cy={yd}
                        r={isSel ? 5.5 : 4}
                        fill="hsl(220, 20%, 6%)"
                        stroke="hsl(152, 62%, 52%)"
                        strokeWidth="2"
                      />
                      <circle
                        cx={x}
                        cy={yn}
                        r={isSel ? 6 : 4.2}
                        fill={
                          isSel
                            ? 'hsl(37, 92%, 60%)'
                            : 'hsl(220, 20%, 6%)'
                        }
                        stroke="hsl(37, 88%, 56%)"
                        strokeWidth="2.2"
                      />
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </section>

        {/* Right Sidebar: Selected ISO Frame 4-Channel Breakdown + G1 ADU Bell Curve */}
        {activeFrame && (
          <aside className="xl:col-span-4 instrument-panel p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--hairline-subtle)] pb-3">
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  单帧四通道详细遥测（点击图表节点切换）
                </div>
                <div className="text-sm font-semibold text-[var(--text-primary)] mono-num mt-0.5">
                  ISO {activeFrame.iso} · {activeFrame.filename}
                </div>
              </div>
              <span className="status-tag">
                {activeFrame.metadata.bitsPerSample}-bit {activeFrame.metadata.cfaPattern}
              </span>
            </div>

            {/* Quality Alerts if Zero-Clipped or Light Leak */}
            {(activeFrame.isZeroClipped || activeFrame.suspectedLightLeak) && (
              <div className="p-2.5 rounded-lg bg-[var(--alert-coral-soft)] border border-[hsla(3,82%,63%,0.3)] text-xs text-[hsl(3,88%,75%)] space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  <span>暗帧数据完整性提示</span>
                </div>
                {activeFrame.qualityNotes.map((note, idx) => (
                  <p key={idx} className="leading-relaxed">
                    {note}
                  </p>
                ))}
              </div>
            )}

            {/* R / G1 / G2 / B 4-Channel Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              {activeFrame.channels.map((ch) => (
                <div
                  key={ch.channel}
                  className="p-2.5 rounded-lg bg-[var(--bg-surface-1)] border border-[var(--hairline-subtle)] space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="mono-num font-semibold"
                      style={{ color: CHANNEL_COLORS[ch.channel] }}
                    >
                      {ch.channel} 通道
                    </span>
                    <span className="mono-num text-[var(--text-muted)]">
                      DR {ch.engineeringDrEv.toFixed(2)} EV
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">σ_ADU</span>
                    <span className="mono-num font-medium text-[var(--text-primary)]">
                      {ch.readNoiseAdu.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">ΔBL 偏移</span>
                    <span className="mono-num text-[var(--text-secondary)]">
                      {ch.blackLevelOffset >= 0 ? '+' : ''}
                      {ch.blackLevelOffset.toFixed(2)} ADU
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">热像素剔除</span>
                    <span className="mono-num text-[var(--text-secondary)]">
                      {ch.hotPixelCount} ({ch.hotPixelPpm.toFixed(1)} ppm)
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* G1 Black-Level ADU Histogram Bell-Curve Micro-Plot */}
            {activeFrame.g1HistogramWindow.length > 1 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)] font-medium">
                    G1 通道黑电平附近 ADU 高斯分布直方图
                  </span>
                  <span className="mono-num text-[var(--text-muted)]">
                    标称 BL = {activeFrame.channels[1].nominalBlackLevel.toFixed(0)} ADU
                  </span>
                </div>

                {(() => {
                  const bins = activeFrame.g1HistogramWindow;
                  const maxCnt = Math.max(1, ...bins.map((b) => b[1]));
                  const minAdu = bins[0][0];
                  const maxAdu = bins[bins.length - 1][0];
                  const span = Math.max(1, maxAdu - minAdu + 1);
                  const blAdu = activeFrame.channels[1].nominalBlackLevel;
                  const blX = ((blAdu - minAdu + 0.5) / span) * 320;

                  return (
                    <div className="p-2.5 rounded-lg bg-[var(--bg-loupe)] border border-[var(--hairline-subtle)]">
                      <svg viewBox="0 0 320 96" className="w-full h-24">
                        {bins.map(([adu, cnt]) => {
                          const x = ((adu - minAdu) / span) * 320;
                          const bw = Math.max(1.2, (320 / span) * 0.82);
                          const bh = (cnt / maxCnt) * 76;
                          return (
                            <rect
                              key={adu}
                              x={x}
                              y={80 - bh}
                              width={bw}
                              height={bh}
                              fill="hsla(150, 65%, 48%, 0.78)"
                            />
                          );
                        })}
                        {blX >= 0 && blX <= 320 && (
                          <line
                            x1={blX}
                            y1={4}
                            x2={blX}
                            y2={80}
                            stroke="hsl(37, 92%, 60%)"
                            strokeWidth="1.3"
                            strokeDasharray="3 2"
                          />
                        )}
                        <text
                          x={4}
                          y={93}
                          fontSize="9"
                          fontFamily="JetBrains Mono, monospace"
                          fill="hsl(215, 10%, 52%)"
                        >
                          {minAdu} ADU
                        </text>
                        <text
                          x={316}
                          y={93}
                          textAnchor="end"
                          fontSize="9"
                          fontFamily="JetBrains Mono, monospace"
                          fill="hsl(215, 10%, 52%)"
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

      {/* Full Calibration Table */}
      <section className="instrument-panel overflow-hidden">
        <div className="panel-header">
          <h3 className="panel-title">多档 ISO 传感器底噪与动态范围标定明细表</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="calib-table mono-num">
            <thead>
              <tr>
                <th>ISO</th>
                <th>样张文件</th>
                <th>标称黑电平</th>
                <th>均值 ΔBL 偏移</th>
                <th>R σ_ADU</th>
                <th>G1 σ_ADU</th>
                <th>G2 σ_ADU</th>
                <th>B σ_ADU</th>
                <th>四通道均值 σ_ADU</th>
                <th>ISO 100 归一化底噪</th>
                <th>工程动态范围 (EV)</th>
                <th>剔除 5σ 热像素</th>
                <th>数据校验</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f, idx) => (
                <tr
                  key={`${f.filename}-${idx}`}
                  onClick={() => setSelectedIdx(idx)}
                  className="cursor-pointer"
                  style={
                    idx === selectedIdx
                      ? { background: 'hsla(37, 88%, 56%, 0.08)' }
                      : undefined
                  }
                >
                  <td className="font-semibold text-[var(--text-primary)]">
                    ISO {f.iso}
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
                  <td>{(f.meanReadNoiseIso100Norm ?? 0).toFixed(3)}</td>
                  <td className="font-semibold text-[var(--optical-green)]">
                    {f.meanEngineeringDrEv.toFixed(2)} EV
                  </td>
                  <td>
                    {f.totalHotPixels} ({f.totalHotPixelPpm.toFixed(1)} ppm)
                  </td>
                  <td className="font-sans">
                    {f.isZeroClipped ? (
                      <span className="status-tag status-tag--crit">零点截断</span>
                    ) : f.suspectedLightLeak ? (
                      <span className="status-tag status-tag--warn">疑似漏光</span>
                    ) : (
                      <span className="status-tag status-tag--pass">纯净暗帧</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
