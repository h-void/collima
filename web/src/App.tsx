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
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { TiltInspector } from './components/TiltInspector';
import { NoiseChart } from './components/NoiseChart';
import { formatWorkerProgress } from './i18n/diagnostics';
import { useI18n } from './i18n/useI18n';
import type {
  ActiveTiltSessionData,
  IsoNoiseSeriesReport,
  PatchRenderModeCode,
  SyntheticPresetId,
  WorkerProgressKey,
  WorkerRequest,
  WorkerResponse,
} from './types/collima';

type WorkbenchMode = 'tilt' | 'noise';

const PATCH_SIZE = 256;

export const App: React.FC = () => {
  const { locale, t } = useI18n();
  const [mode, setMode] = useState<WorkbenchMode>('tilt');
  const [tiltSession, setTiltSession] = useState<ActiveTiltSessionData | null>(
    null,
  );
  const [noiseSeries, setNoiseSeries] = useState<IsoNoiseSeriesReport | null>(
    null,
  );
  const [progress, setProgress] = useState<{
    requestId: number;
    stage: string;
    progressKey?: WorkerProgressKey;
    progressParams?: Record<string, string | number>;
    completed: number;
    total: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef<number>(1);
  const activeTiltSessionReqRef = useRef<number>(0);
  const activeTiltRenderReqRef = useRef<number>(0);
  const activeTiltStationReqRef = useRef<number>(0);
  const activeNoiseReqRef = useRef<number>(0);

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

    const clearProgressIfMatch = (requestId: number) => {
      setProgress((prev) =>
        prev && prev.requestId <= requestId ? null : prev,
      );
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'PROGRESS': {
          const isActiveReq =
            msg.requestId === activeTiltSessionReqRef.current ||
            msg.requestId === activeNoiseReqRef.current;
          if (!isActiveReq) return;
          setProgress({
            requestId: msg.requestId,
            stage: msg.stage,
            progressKey: msg.progressKey,
            progressParams: msg.progressParams,
            completed: msg.completed,
            total: msg.total,
          });
          break;
        }
        case 'SESSION_READY': {
          clearProgressIfMatch(msg.requestId);
          if (msg.requestId !== activeTiltSessionReqRef.current) {
            return;
          }
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
          clearProgressIfMatch(msg.requestId);
          if (
            msg.requestId < activeTiltSessionReqRef.current ||
            msg.requestId < activeTiltRenderReqRef.current
          ) {
            return;
          }
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
          clearProgressIfMatch(msg.requestId);
          if (
            msg.requestId < activeTiltSessionReqRef.current ||
            msg.requestId < activeTiltStationReqRef.current
          ) {
            return;
          }
          setTiltSession((prev) => {
            if (
              !prev ||
              msg.stationIdx < 0 ||
              msg.stationIdx >= prev.patches.length
            ) {
              return prev;
            }
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
          clearProgressIfMatch(msg.requestId);
          if (
            msg.requestId < activeTiltSessionReqRef.current ||
            msg.requestId < activeTiltStationReqRef.current
          ) {
            return;
          }
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
          clearProgressIfMatch(msg.requestId);
          if (msg.requestId !== activeNoiseReqRef.current) {
            return;
          }
          setNoiseSeries(msg.series);
          break;
        }
        case 'ERROR': {
          clearProgressIfMatch(msg.requestId);
          const isCurrentError =
            msg.requestId === activeTiltSessionReqRef.current ||
            msg.requestId === activeTiltRenderReqRef.current ||
            msg.requestId === activeTiltStationReqRef.current ||
            msg.requestId === activeNoiseReqRef.current;
          if (isCurrentError) {
            setErrorMsg(msg.message);
          }
          break;
        }
      }
    };

    worker.onerror = (err) => {
      setProgress(null);
      setErrorMsg(err.message || '');
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const handleFilesAccepted = (files: File[]) => {
    const requestId = ++reqIdRef.current;
    if (mode === 'tilt') {
      activeTiltSessionReqRef.current = requestId;
      activeTiltRenderReqRef.current = requestId;
      activeTiltStationReqRef.current = requestId;
      sendWorkerRequest({
        type: 'OPEN_RAW_FILE',
        requestId,
        file: files[0],
        evBoost: tiltSession?.evBoost ?? 0,
        patchMode: tiltSession?.patchMode ?? 0,
        patchSize: PATCH_SIZE,
      });
    } else {
      activeNoiseReqRef.current = requestId;
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
    activeTiltSessionReqRef.current = requestId;
    activeTiltRenderReqRef.current = requestId;
    activeTiltStationReqRef.current = requestId;
    sendWorkerRequest({
      type: 'OPEN_SYNTHETIC_PRESET',
      requestId,
      preset,
      evBoost: 0,
      patchMode: 0,
      patchSize: PATCH_SIZE,
    });
  };

  const handleCloseTiltSession = () => {
    const requestId = ++reqIdRef.current;
    activeTiltSessionReqRef.current = 0;
    activeTiltRenderReqRef.current = requestId;
    activeTiltStationReqRef.current = requestId;
    setTiltSession(null);
    sendWorkerRequest({
      type: 'CLOSE_SESSION',
      requestId,
    });
  };

  const handleLoadNoisePreset = () => {
    const requestId = ++reqIdRef.current;
    activeNoiseReqRef.current = requestId;
    sendWorkerRequest({
      type: 'GENERATE_SYNTHETIC_ISO_SERIES',
      requestId,
    });
  };

  const handleClearNoiseSeries = () => {
    const requestId = ++reqIdRef.current;
    activeNoiseReqRef.current = 0;
    setProgress((prev) =>
      prev && prev.requestId < requestId ? null : prev,
    );
    setNoiseSeries(null);
    sendWorkerRequest({
      type: 'CANCEL_NOISE_BATCH',
      requestId,
    });
  };

  const handleUpdateRenderParams = (
    evBoost: number,
    patchMode: PatchRenderModeCode,
  ) => {
    if (!tiltSession) return;
    const requestId = ++reqIdRef.current;
    activeTiltRenderReqRef.current = requestId;
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
    activeTiltStationReqRef.current = requestId;
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
    activeTiltStationReqRef.current = requestId;
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
                <span className="brand-subtitle">{t.brandSubtitle}</span>
              </h1>
            </div>
          </div>

          {/* Primary Workbench Mode Switcher */}
          <nav aria-label={t.navAriaLabel} className="segmented-control">
            <button
              id="tab-tilt-inspector"
              type="button"
              onClick={() => setMode('tilt')}
              className={`segmented-btn ${mode === 'tilt' ? 'is-active' : ''}`}
            >
              <Aperture size={15} className="mode-indicator" />
              <span>{t.tabTiltLabel}</span>
            </button>
            <button
              id="tab-sensor-noise-lab"
              type="button"
              onClick={() => setMode('noise')}
              className={`segmented-btn ${mode === 'noise' ? 'is-active' : ''}`}
            >
              <FlaskConical size={15} className="mode-indicator" />
              <span>{t.tabNoiseLabel}</span>
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
                  onClick={handleCloseTiltSession}
                  className="btn-instrument"
                >
                  {t.btnBackToBench}
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
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* EXIF, Sensor Geometry & Dual-Codec Telemetry Strip */}
      {activeMeta && (
        <div
          className="telemetry-strip"
          role="region"
          aria-label={t.telemetryRegionAria}
        >
          <div className="telemetry-strip-inner mono-num">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="telemetry-kv font-sans">
                <strong>{activeMeta.cameraLabel}</strong>
              </span>
              {activeMeta.lensModel && (
                <>
                  <span className="telemetry-divider" />
                  <span className="telemetry-kv font-sans">
                    <span>{t.telemetryLens}</span>
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
                    activeMeta.shutterDisplay,
                    activeMeta.iso ? `ISO ${activeMeta.iso}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || t.telemetryManualExposure}
                </strong>
              </span>
              <span className="telemetry-divider" />
              <span className="telemetry-kv">
                <span>{t.telemetryActiveArea}</span>
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
                <span>
                  {t.telemetryDecodeTime(activeMeta.decodeMs.toFixed(1))}
                </span>
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
              <span>
                {formatWorkerProgress(
                  progress.stage,
                  progress.progressKey,
                  progress.progressParams,
                  locale,
                )}
              </span>
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
      {errorMsg !== null && (
        <div className="max-w-5xl mx-auto w-full px-4 pt-4">
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-[var(--alert-coral-soft)] border border-[hsla(3,82%,63%,0.35)] flex items-start justify-between gap-3 text-xs text-[hsl(3,88%,78%)]"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold">{t.errorTitle}</div>
                <div>{errorMsg || t.workerRuntimeError}</div>
              </div>
            </div>
            <button
              id="btn-dismiss-error"
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-[hsl(3,88%,78%)] hover:text-white"
              aria-label={t.errorDismissAria}
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
            onClear={handleClearNoiseSeries}
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
        {t.footerNote}
      </footer>
    </div>
  );
};

export default App;
