import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Aperture,
  ArrowUpRight,
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
  const [statusFade, setStatusFade] = useState<{
    left: boolean;
    right: boolean;
  }>({ left: false, right: false });

  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const statusScrollRef = useRef<HTMLDivElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const engineReadyRef = useRef<boolean>(false);
  const reqIdRef = useRef<number>(1);
  const activeTiltSessionReqRef = useRef<number>(0);
  const activeTiltRenderReqRef = useRef<number>(0);
  const activeTiltStationReqRef = useRef<number>(0);
  const activeNoiseReqRef = useRef<number>(0);

  const updateStatusFade = useCallback(() => {
    const el = statusScrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setStatusFade((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

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

  const terminateWorker = useCallback((target?: Worker) => {
    const current = workerRef.current;
    if (!current) return;
    if (target && current !== target) return;
    current.onmessage = null;
    current.onerror = null;
    current.onmessageerror = null;
    current.terminate();
    workerRef.current = null;
    engineReadyRef.current = false;
  }, []);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) {
      return workerRef.current;
    }

    const worker = new Worker(
      new URL('./workers/analyzer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;
    engineReadyRef.current = false;

    const clearProgressIfMatch = (requestId: number) => {
      setProgress((prev) =>
        prev && prev.requestId <= requestId ? null : prev,
      );
    };

    const handleFatalWorkerError = (message: string) => {
      if (workerRef.current !== worker) return;
      // Terminate the poisoned worker (e.g. panic=abort WASM trap / worker crash)
      // and leave workerRef null so the next user action lazily spawns a fresh worker.
      terminateWorker(worker);
      activeTiltSessionReqRef.current = 0;
      activeNoiseReqRef.current = 0;
      setProgress(null);
      setTiltSession(null);
      setErrorMsg(message);
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (workerRef.current !== worker) return;
      const msg = event.data;
      switch (msg.type) {
        case 'ENGINE_READY': {
          engineReadyRef.current = true;
          break;
        }
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
          window.scrollTo(0, 0);
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
          window.scrollTo(0, 0);
          break;
        }
        case 'ERROR': {
          clearProgressIfMatch(msg.requestId);
          if (msg.fatal) {
            handleFatalWorkerError(msg.message || '');
            return;
          }
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
      handleFatalWorkerError(err.message || '');
    };

    worker.onmessageerror = () => {
      handleFatalWorkerError('');
    };

    return worker;
  }, [terminateWorker]);

  const sendWorkerRequest = useCallback(
    (req: WorkerRequest) => {
      setErrorMsg(null);
      if (
        (req.type === 'CLOSE_SESSION' || req.type === 'CANCEL_NOISE_BATCH') &&
        !workerRef.current
      ) {
        return;
      }
      const worker = ensureWorker();
      if (
        !engineReadyRef.current &&
        (req.type === 'OPEN_RAW_FILE' ||
          req.type === 'OPEN_SYNTHETIC_PRESET' ||
          req.type === 'ANALYZE_NOISE_BATCH' ||
          req.type === 'GENERATE_SYNTHETIC_ISO_SERIES')
      ) {
        setProgress({
          requestId: req.requestId,
          stage: 'Loading Rust/WASM engine…',
          progressKey: 'loading_engine',
          completed: 0,
          total: 0,
        });
      }
      worker.postMessage(req);
    },
    [ensureWorker],
  );

  // Eagerly spawn the worker on mount so WASM downloads & compiles while viewing landing screen.
  useEffect(() => {
    ensureWorker();
    return () => {
      terminateWorker();
    };
  }, [ensureWorker, terminateWorker]);

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

  useEffect(() => {
    const el = statusScrollRef.current;
    if (!el) return;
    const rafId = window.requestAnimationFrame(updateStatusFade);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateStatusFade);
      ro.observe(el);
    }
    return () => {
      window.cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [updateStatusFade, activeMeta, locale, progress, mode]);

  return (
    <div
      className={`workbench-shell ${
        isLockedDesktopTilt ? 'is-locked-viewport' : ''
      }`}
    >
      {/* Top 44px Precision Command Bar */}
      <header className="topbar max-md:h-auto!">
        <div className="topbar-inner max-md:h-auto! max-md:flex-wrap max-md:py-1.5! max-md:gap-y-1.5!">
          {/* Left: Brand + Mode Tabs */}
          <div className="flex items-center gap-3 max-sm:gap-2 min-w-0 md:shrink-0 max-md:w-full max-md:justify-between">
            <div className="brand-cluster overflow-hidden shrink-0">
              <div className="aperture-mark" aria-hidden="true">
                <Aperture size={15} strokeWidth={1.9} />
              </div>
              <h1 className="brand-title">
                <span>collima</span>
                <span className="hidden xl:inline text-xs font-normal text-[var(--text-muted)] tracking-normal">
                  {t.brandSubtitle}
                </span>
              </h1>
            </div>

            <span className="brand-divider hidden md:block" />

            <nav
              aria-label={t.navAriaLabel}
              className="segmented-control min-w-0"
            >
              <button
                id="tab-tilt-inspector"
                type="button"
                onClick={() => setMode('tilt')}
                className={`segmented-btn max-sm:px-2! ${mode === 'tilt' ? 'is-active' : ''}`}
              >
                <Aperture size={13} className="mode-indicator shrink-0" />
                <span className="truncate">{t.tabTiltLabel}</span>
                <span className="kbd-hint max-lg:hidden!">1</span>
              </button>
              <button
                id="tab-sensor-noise-lab"
                type="button"
                onClick={() => setMode('noise')}
                className={`segmented-btn max-sm:px-2! ${mode === 'noise' ? 'is-active' : ''}`}
              >
                <FlaskConical size={13} className="mode-indicator shrink-0" />
                <span className="truncate">{t.tabNoiseLabel}</span>
                <span className="kbd-hint max-lg:hidden!">2</span>
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
          <div className="flex items-center gap-1.5 shrink-0 max-md:w-full max-md:justify-end max-md:flex-wrap">
            {hasActiveView && (
              <div ref={presetMenuRef} className="popover-anchor max-sm:hidden!">
                <button
                  id="btn-presets-menu"
                  type="button"
                  disabled={isBusy}
                  aria-label={t.presetsMenuLabel}
                  title={t.presetsMenuLabel}
                  onClick={() => setPresetMenuOpen((v) => !v)}
                  className="btn-instrument max-sm:hidden!"
                >
                  <Sparkles size={12} className="text-[var(--accent-amber)]" />
                  <span className="hidden lg:inline">{t.presetsMenuLabel}</span>
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
                  aria-label={t.btnBackToBench}
                  title={t.btnBackToBench}
                  onClick={handleCloseTiltSession}
                  className="btn-instrument"
                >
                  <X size={12} className="text-[var(--text-muted)]" />
                  <span className="hidden lg:inline">{t.btnBackToBench}</span>
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

            <a
              id="link-github-source"
              href="https://github.com/h-void/collima"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.githubSourceAriaLabel}
              title={t.githubSourceAriaLabel}
              className="btn-instrument no-underline"
            >
              <svg
                viewBox="0 0 16 16"
                width={13}
                height={13}
                fill="currentColor"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              <span className="hidden lg:inline">{t.githubSourceLabel}</span>
              <span className="lg:hidden">GitHub</span>
              <ArrowUpRight size={12} className="text-[var(--text-muted)]" />
            </a>
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
        <div
          ref={statusScrollRef}
          onScroll={updateStatusFade}
          data-fade-left={statusFade.left ? 'true' : 'false'}
          data-fade-right={statusFade.right ? 'true' : 'false'}
          className="statusbar-scroll"
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
                  {activeMeta.formatName} · {activeMeta.compressionName} ·{' '}
                  {activeMeta.decoderEngine}
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
        </div>
      </footer>
    </div>
  );
};

export default App;
