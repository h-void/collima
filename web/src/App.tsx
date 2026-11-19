import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Aperture,
  ChevronDown,
  Cpu,
  FlaskConical,
  Loader2,
  Moon,
  Sparkles,
  Stars,
  Sun,
  Target,
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
type StudioTheme = 'dark' | 'light';

const PATCH_SIZE = 256;
const THEME_STORAGE_KEY = 'collima.theme';

function detectInitialTheme(): StudioTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage access errors
  }
  return 'dark';
}

export const App: React.FC = () => {
  const { locale, t } = useI18n();
  const [mode, setMode] = useState<WorkbenchMode>('tilt');
  const [theme, setTheme] = useState<StudioTheme>(detectInitialTheme);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
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

  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef<number>(1);
  const activeTiltSessionReqRef = useRef<number>(0);
  const activeTiltRenderReqRef = useRef<number>(0);
  const activeTiltStationReqRef = useRef<number>(0);
  const activeNoiseReqRef = useRef<number>(0);

  // Sync studio theme attribute
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  // Close preset popover on outside click / Escape
  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        presetMenuRef.current &&
        !presetMenuRef.current.contains(e.target as Node)
      ) {
        setPresetMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresetMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [presetMenuOpen]);

  // Global 1 / 2 workspace mode shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === '1') {
        setMode('tilt');
      } else if (e.key === '2') {
        setMode('noise');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
    setPresetMenuOpen(false);
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
    setPresetMenuOpen(false);
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
  const hasActiveView =
    mode === 'tilt' ? tiltSession !== null : noiseSeries !== null;
  const activeMeta =
    mode === 'tilt'
      ? tiltSession?.metadata
      : noiseSeries?.frames[0]?.metadata;

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 35;

  const isLockedDesktopTilt =
    mode === 'tilt' && tiltSession !== null && errorMsg === null;

  return (
    <div
      className={`workbench-shell ${
        isLockedDesktopTilt ? 'is-locked-viewport' : ''
      }`}
    >
      {/* Top 44px Precision Command Bar */}
      <header className="topbar">
        <div className="topbar-inner">
          {/* Left: Brand + Mode Tabs */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="brand-cluster">
              <div className="aperture-mark" aria-hidden="true">
                <Aperture size={15} strokeWidth={1.9} />
              </div>
              <h1 className="brand-title">
                <span>collima</span>
                <span className="hidden md:inline text-xs font-normal text-[var(--text-muted)] tracking-normal">
                  {t.brandSubtitle}
                </span>
              </h1>
            </div>

            <span className="brand-divider hidden sm:block" />

            <nav aria-label={t.navAriaLabel} className="segmented-control">
              <button
                id="tab-tilt-inspector"
                type="button"
                onClick={() => setMode('tilt')}
                className={`segmented-btn ${mode === 'tilt' ? 'is-active' : ''}`}
              >
                <Aperture size={13} className="mode-indicator" />
                <span>{t.tabTiltLabel}</span>
                <span className="kbd-hint hidden sm:inline-flex">1</span>
              </button>
              <button
                id="tab-sensor-noise-lab"
                type="button"
                onClick={() => setMode('noise')}
                className={`segmented-btn ${mode === 'noise' ? 'is-active' : ''}`}
              >
                <FlaskConical size={13} className="mode-indicator" />
                <span>{t.tabNoiseLabel}</span>
                <span className="kbd-hint hidden sm:inline-flex">2</span>
              </button>
            </nav>
          </div>

          {/* Center: Active Camera / Lens Context Breadcrumb */}
          {activeMeta && (
            <div className="hidden xl:flex items-center gap-2 min-w-0 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--hairline-subtle)] text-xs truncate max-w-md">
              <span className="font-medium text-[var(--text-primary)] truncate">
                {activeMeta.cameraLabel}
              </span>
              {activeMeta.lensModel && (
                <>
                  <span className="text-[var(--text-muted)]">/</span>
                  <span className="text-[var(--text-secondary)] truncate">
                    {activeMeta.lensModel}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Right: Contextual Actions, Presets, Theme & Locale */}
          <div className="flex items-center gap-1.5 shrink-0">
            {hasActiveView && (
              <div ref={presetMenuRef} className="popover-anchor">
                <button
                  id="btn-presets-menu"
                  type="button"
                  disabled={isBusy}
                  onClick={() => setPresetMenuOpen((v) => !v)}
                  className="btn-instrument hidden sm:inline-flex"
                >
                  <Sparkles size={12} className="text-[var(--accent-amber)]" />
                  <span>{t.presetsMenuLabel}</span>
                  <ChevronDown size={11} className="text-[var(--text-muted)]" />
                </button>

                {presetMenuOpen && (
                  <div className="popover-menu" style={{ minWidth: '220px' }}>
                    {mode === 'tilt' ? (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleLoadTiltPreset('tilt_chart')}
                          className="popover-option"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Target
                              size={13}
                              className="text-[var(--accent-amber)]"
                            />
                            <span>{t.dropzone.btnSynthTiltChart}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleLoadTiltPreset('astro_starfield')
                          }
                          className="popover-option"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Stars
                              size={13}
                              className="text-[var(--signal-blue)]"
                            />
                            <span>{t.dropzone.btnSynthAstro}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleLoadTiltPreset('flat_reference')}
                          className="popover-option"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Sparkles
                              size={13}
                              className="text-[var(--optical-green)]"
                            />
                            <span>{t.dropzone.btnSynthFlatRef}</span>
                          </span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleLoadNoisePreset}
                        className="popover-option"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Sparkles
                            size={13}
                            className="text-[var(--accent-amber)]"
                          />
                          <span>{t.dropzone.btnSynthIsoSeries}</span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode === 'tilt' && tiltSession && (
              <>
                <button
                  id="btn-switch-tilt-preset"
                  type="button"
                  disabled={isBusy}
                  onClick={handleCloseTiltSession}
                  className="btn-instrument"
                >
                  <X size={12} className="text-[var(--text-muted)]" />
                  <span className="hidden sm:inline">{t.btnBackToBench}</span>
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

            <button
              id="btn-theme-toggle"
              type="button"
              aria-label={
                theme === 'dark' ? t.themeDarkLabel : t.themeLightLabel
              }
              title={theme === 'dark' ? t.themeDarkLabel : t.themeLightLabel}
              onClick={() =>
                setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
              }
              className="btn-instrument btn-icon-only"
            >
              {theme === 'dark' ? (
                <Sun size={13} className="text-[var(--text-secondary)]" />
              ) : (
                <Moon size={13} className="text-[var(--text-secondary)]" />
              )}
            </button>

            <LanguageSwitcher />
          </div>
        </div>

        {/* Non-blocking 2px Topbar Progress Hairline */}
        {progress && (
          <div className="topbar-progress-line" aria-hidden="true">
            <div
              className="topbar-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </header>

      {/* Error Alert Banner */}
      {errorMsg !== null && (
        <div className="px-4 py-2 bg-[var(--alert-coral-soft)] border-b border-[var(--alert-coral-border)] flex items-center justify-between gap-3 text-xs text-[var(--alert-coral)] shrink-0">
          <div
            role="alert"
            className="flex items-center gap-2 min-w-0"
          >
            <AlertCircle size={14} className="shrink-0" />
            <span className="font-semibold shrink-0">{t.errorTitle}:</span>
            <span className="truncate">{errorMsg || t.workerRuntimeError}</span>
          </div>
          <button
            id="btn-dismiss-error"
            type="button"
            onClick={() => setErrorMsg(null)}
            className="btn-instrument btn-ghost btn-icon-only shrink-0"
            aria-label={t.errorDismissAria}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Docked Workbench Viewport */}
      <main className="flex-1 min-h-0 flex flex-col">
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

      {/* Bottom 28px Studio Telemetry & Engine Status Bar */}
      <footer
        className="statusbar mono-num"
        role="region"
        aria-label={t.telemetryRegionAria}
      >
        <div className="flex items-center gap-3 shrink-0">
          {progress ? (
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 text-[var(--accent-amber)] font-sans"
            >
              <Loader2 size={11} className="animate-spin" />
              <span>
                {formatWorkerProgress(
                  progress.stage,
                  progress.progressKey,
                  progress.progressParams,
                  locale,
                )}
              </span>
              {progress.total > 0 && (
                <span className="mono-num">({progressPct}%)</span>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-sans text-[var(--text-secondary)]">
              <span className="status-dot" />
              <span>{t.statusReady}</span>
            </span>
          )}

          <span className="text-[var(--hairline-strong)]">·</span>

          {activeMeta ? (
            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <Cpu size={11} className="text-[var(--text-muted)]" />
              <span>
                {activeMeta.formatName} · {activeMeta.compressionName} (
                {activeMeta.decoderEngine})
              </span>
              <span className="text-[var(--optical-green)]">
                · {t.telemetryDecodeTime(activeMeta.decodeMs.toFixed(1))}
              </span>
            </span>
          ) : (
            <span className="font-sans">{t.footerNote}</span>
          )}
        </div>

        {activeMeta && (
          <div className="flex items-center gap-3 shrink-0 text-[var(--text-secondary)]">
            <span>
              <span className="font-sans text-[var(--text-muted)] mr-1">
                {t.telemetryActiveArea}
              </span>
              <strong className="font-medium text-[var(--text-primary)]">
                {activeMeta.activeWidth}×{activeMeta.activeHeight}
              </strong>{' '}
              ({activeMeta.bitsPerSample}-bit {activeMeta.cfaPattern})
            </span>
            <span className="text-[var(--hairline-strong)]">·</span>
            <span>
              <span className="text-[var(--text-muted)] mr-1">BL/WL</span>
              <strong className="font-medium text-[var(--text-primary)]">
                {activeMeta.blackLevels[1].toFixed(0)} /{' '}
                {activeMeta.whiteLevels[1].toFixed(0)} ADU
              </strong>
            </span>
          </div>
        )}
      </footer>
    </div>
  );
};

export default App;
