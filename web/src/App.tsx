import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Aperture,
  Cpu,
  FlaskConical,
  Loader2,
  X,
} from 'lucide-react';
import { DropZone } from './components/DropZone';
import { TiltInspector } from './components/TiltInspector';
import { NoiseChart } from './components/NoiseChart';
import type {
  ActiveTiltSessionData,
  IsoNoiseSeriesReport,
  PatchRenderModeCode,
  SyntheticPresetId,
  WorkerRequest,
  WorkerResponse,
} from './types/collima';

type WorkbenchMode = 'tilt' | 'noise';

const PATCH_SIZE = 256;

export const App: React.FC = () => {
  const [mode, setMode] = useState<WorkbenchMode>('tilt');
  const [tiltSession, setTiltSession] = useState<ActiveTiltSessionData | null>(
    null,
  );
  const [noiseSeries, setNoiseSeries] = useState<IsoNoiseSeriesReport | null>(
    null,
  );
  const [progress, setProgress] = useState<{
    stage: string;
    completed: number;
    total: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef<number>(1);

  const sendWorkerRequest = useCallback((req: WorkerRequest) => {
    setErrorMsg(null);
    workerRef.current?.postMessage(req);
  }, []);

  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/analyzer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'PROGRESS': {
          setProgress({
            stage: msg.stage,
            completed: msg.completed,
            total: msg.total,
          });
          break;
        }
        case 'SESSION_READY': {
          setProgress(null);
          setTiltSession({
            filename: msg.filename,
            metadata: msg.metadata,
            sharpness: msg.sharpness,
            noise: msg.noise,
            overview: {
              desc: msg.overviewDesc,
              rgba: new Uint8ClampedArray(msg.overviewBuffer),
            },
            patches: msg.patchBuffers.map((buf, i) => ({
              desc: msg.patchDescs[i],
              rgba: new Uint8ClampedArray(buf),
            })),
            evBoost: msg.evBoost,
            patchMode: msg.patchMode,
          });
          break;
        }
        case 'RENDER_UPDATED': {
          setProgress(null);
          setTiltSession((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              overview: {
                desc: msg.overviewDesc,
                rgba: new Uint8ClampedArray(msg.overviewBuffer),
              },
              patches: msg.patchBuffers.map((buf, i) => ({
                desc: msg.patchDescs[i],
                rgba: new Uint8ClampedArray(buf),
              })),
              evBoost: msg.evBoost,
              patchMode: msg.patchMode,
            };
          });
          break;
        }
        case 'STATION_UPDATED': {
          setProgress(null);
          setTiltSession((prev) => {
            if (!prev) return prev;
            const nextPatches = [...prev.patches];
            nextPatches[msg.stationIdx] = {
              desc: msg.patchDesc,
              rgba: new Uint8ClampedArray(msg.patchBuffer),
            };
            return {
              ...prev,
              sharpness: msg.sharpness,
              patches: nextPatches,
            };
          });
          break;
        }
        case 'STATIONS_RESET': {
          setProgress(null);
          setTiltSession((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              sharpness: msg.sharpness,
              patches: msg.patchBuffers.map((buf, i) => ({
                desc: msg.patchDescs[i],
                rgba: new Uint8ClampedArray(buf),
              })),
            };
          });
          break;
        }
        case 'NOISE_SERIES_READY': {
          setProgress(null);
          setNoiseSeries(msg.series);
          break;
        }
        case 'ERROR': {
          setProgress(null);
          setErrorMsg(msg.message);
          break;
        }
      }
    };

    worker.onerror = (err) => {
      setProgress(null);
      setErrorMsg(err.message || 'Web Worker 运行异常');
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const handleFilesAccepted = (files: File[]) => {
    const requestId = ++reqIdRef.current;
    if (mode === 'tilt') {
      sendWorkerRequest({
        type: 'OPEN_RAW_FILE',
        requestId,
        file: files[0],
        evBoost: tiltSession?.evBoost ?? 0,
        patchMode: tiltSession?.patchMode ?? 0,
        patchSize: PATCH_SIZE,
      });
    } else {
      sendWorkerRequest({
        type: 'ANALYZE_NOISE_BATCH',
        requestId,
        files,
        existingFrames: noiseSeries?.frames ?? [],
      });
    }
  };

  const handleLoadTiltPreset = (preset: SyntheticPresetId) => {
    const requestId = ++reqIdRef.current;
    sendWorkerRequest({
      type: 'OPEN_SYNTHETIC_PRESET',
      requestId,
      preset,
      evBoost: 0,
      patchMode: 0,
      patchSize: PATCH_SIZE,
    });
  };

  const handleLoadNoisePreset = () => {
    const requestId = ++reqIdRef.current;
    sendWorkerRequest({
      type: 'GENERATE_SYNTHETIC_ISO_SERIES',
      requestId,
    });
  };

  const handleUpdateRenderParams = (
    evBoost: number,
    patchMode: PatchRenderModeCode,
  ) => {
    const requestId = ++reqIdRef.current;
    sendWorkerRequest({
      type: 'UPDATE_RENDER_PARAMS',
      requestId,
      evBoost,
      patchMode,
      patchSize: PATCH_SIZE,
    });
  };

  const handleRelocateStation = (
    stationIdx: number,
    normX: number,
    normY: number,
  ) => {
    if (!tiltSession) return;
    const requestId = ++reqIdRef.current;
    sendWorkerRequest({
      type: 'RELOCATE_STATION',
      requestId,
      stationIdx,
      normX,
      normY,
      evBoost: tiltSession.evBoost,
      patchMode: tiltSession.patchMode,
      patchSize: PATCH_SIZE,
    });
  };

  const handleResetStations = () => {
    if (!tiltSession) return;
    const requestId = ++reqIdRef.current;
    sendWorkerRequest({
      type: 'RESET_STATIONS',
      requestId,
      evBoost: tiltSession.evBoost,
      patchMode: tiltSession.patchMode,
      patchSize: PATCH_SIZE,
    });
  };

  const isBusy = progress !== null;
  const activeMeta =
    mode === 'tilt'
      ? tiltSession?.metadata
      : noiseSeries?.frames[0]?.metadata;

  return (
    <div className="workbench-shell">
      {/* Sticky Top Instrument Bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-cluster">
            <div className="aperture-mark" aria-hidden="true">
              <Aperture size={18} />
            </div>
            <div>
              <h1 className="brand-title">
                <span>collima</span>
                <span className="brand-subtitle">
                  浏览器端镜头光轴与传感器底噪诊断工作台
                </span>
              </h1>
            </div>
          </div>

          {/* Primary Workbench Mode Switcher */}
          <nav aria-label="诊断模式切换" className="segmented-control">
            <button
              id="tab-tilt-inspector"
              type="button"
              onClick={() => setMode('tilt')}
              className={`segmented-btn ${mode === 'tilt' ? 'is-active' : ''}`}
            >
              <Aperture size={15} className="mode-indicator" />
              <span>Optical Tilt Inspector · 光轴与场曲检视</span>
            </button>
            <button
              id="tab-sensor-noise-lab"
              type="button"
              onClick={() => setMode('noise')}
              className={`segmented-btn ${mode === 'noise' ? 'is-active' : ''}`}
            >
              <FlaskConical size={15} className="mode-indicator" />
              <span>Sensor Noise Lab · 底噪与双原生 ISO 测绘</span>
            </button>
          </nav>

          {/* Right Quick Actions */}
          <div className="flex items-center gap-2">
            {mode === 'tilt' && tiltSession && (
              <>
                <button
                  id="btn-switch-tilt-preset"
                  type="button"
                  disabled={isBusy}
                  onClick={() => setTiltSession(null)}
                  className="btn-instrument"
                >
                  返回标定台
                </button>
                <DropZone
                  mode="tilt"
                  compact
                  disabled={isBusy}
                  onFilesAccepted={handleFilesAccepted}
                />
              </>
            )}
            {mode === 'noise' && noiseSeries && (
              <DropZone
                mode="noise"
                compact
                disabled={isBusy}
                onFilesAccepted={handleFilesAccepted}
              />
            )}
          </div>
        </div>
      </header>

      {/* EXIF, Sensor Geometry & Dual-Codec Telemetry Strip */}
      {activeMeta && (
        <div className="telemetry-strip" role="region" aria-label="RAW 元数据与解码遥测">
          <div className="telemetry-strip-inner mono-num">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="telemetry-kv font-sans">
                <strong>{activeMeta.cameraLabel}</strong>
              </span>
              {activeMeta.lensModel && (
                <>
                  <span className="telemetry-divider" />
                  <span className="telemetry-kv font-sans">
                    <span>镜头</span>
                    <strong>{activeMeta.lensModel}</strong>
                  </span>
                </>
              )}
              <span className="telemetry-divider" />
              <span className="telemetry-kv">
                <strong>
                  {[
                    activeMeta.focalLengthMm
                      ? `${activeMeta.focalLengthMm.toFixed(0)}mm`
                      : null,
                    activeMeta.fNumber ? `f/${activeMeta.fNumber.toFixed(1)}` : null,
                    activeMeta.shutterDisplay ? `${activeMeta.shutterDisplay}s` : null,
                    activeMeta.iso ? `ISO ${activeMeta.iso}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '手动曝光元数据'}
                </strong>
              </span>
              <span className="telemetry-divider" />
              <span className="telemetry-kv">
                <span>有效画幅</span>
                <strong>
                  {activeMeta.activeWidth}×{activeMeta.activeHeight}
                </strong>
                <span>
                  ({activeMeta.bitsPerSample}-bit {activeMeta.cfaPattern})
                </span>
              </span>
              <span className="telemetry-divider" />
              <span className="telemetry-kv">
                <span>BL / WL</span>
                <strong>
                  {activeMeta.blackLevels[1].toFixed(0)} /{' '}
                  {activeMeta.whiteLevels[1].toFixed(0)} ADU
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="status-tag">
                <Cpu size={11} />
                <span>
                  {activeMeta.formatName} · {activeMeta.compressionName} (
                  {activeMeta.decoderEngine})
                </span>
              </span>
              <span className="status-tag status-tag--pass">
                <Activity size={11} />
                <span>解码 {activeMeta.decodeMs.toFixed(1)} ms</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking Worker Progress Banner */}
      {progress && (
        <div
          role="status"
          aria-live="polite"
          className="bg-[var(--bg-surface-2)] border-b border-[var(--hairline-default)] px-4 py-2"
        >
          <div className="max-w-[1680px] mx-auto flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-[var(--accent-amber)]">
              <Loader2 size={14} className="animate-spin" />
              <span>{progress.stage}</span>
            </div>
            {progress.total > 0 && (
              <span className="mono-num text-[var(--text-secondary)]">
                {Math.min(100, Math.round((progress.completed / progress.total) * 100))}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error Alert Banner */}
      {errorMsg && (
        <div className="max-w-5xl mx-auto w-full px-4 pt-4">
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-[var(--alert-coral-soft)] border border-[hsla(3,82%,63%,0.35)] flex items-start justify-between gap-3 text-xs text-[hsl(3,88%,78%)]"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold">RAW 内存解析异常</div>
                <div>{errorMsg}</div>
              </div>
            </div>
            <button
              id="btn-dismiss-error"
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-[hsl(3,88%,78%)] hover:text-white"
              aria-label="关闭错误提示"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Main Workbench Viewport */}
      <main className="flex-1 flex flex-col">
        {mode === 'tilt' ? (
          tiltSession ? (
            <TiltInspector
              session={tiltSession}
              busy={isBusy}
              onUpdateRenderParams={handleUpdateRenderParams}
              onRelocateStation={handleRelocateStation}
              onResetStations={handleResetStations}
            />
          ) : (
            <DropZone
              mode="tilt"
              disabled={isBusy}
              onFilesAccepted={handleFilesAccepted}
              onLoadTiltPreset={handleLoadTiltPreset}
            />
          )
        ) : noiseSeries ? (
          <NoiseChart
            series={noiseSeries}
            onClear={() => setNoiseSeries(null)}
          />
        ) : (
          <DropZone
            mode="noise"
            disabled={isBusy}
            onFilesAccepted={handleFilesAccepted}
            onLoadNoisePreset={handleLoadNoisePreset}
          />
        )}
      </main>

      <footer className="border-t border-[var(--hairline-subtle)] py-3 px-4 text-center text-[11px] text-[var(--text-muted)]">
        collima Optical &amp; Sensor Metrology Workbench · Rust + WebAssembly (flashraw Sony X-OCN [ARW 6.0] / CR3 / DNG + ticoraw Nikon HE/HE*) · 所有原始图像字节流仅在浏览器本地沙箱内存运算
      </footer>
    </div>
  );
};

export default App;
