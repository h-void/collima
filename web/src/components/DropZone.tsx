import React, { useRef, useState } from 'react';
import {
  Aperture,
  ChevronRight,
  FileUp,
  Layers,
  ShieldCheck,
  Sparkles,
  Stars,
  Target,
} from 'lucide-react';
import type { SyntheticPresetId } from '../types/collima';
import { useI18n } from '../i18n/useI18n';

const SUPPORTED_EXTENSIONS = [
  '.arw',
  '.arq',
  '.srf',
  '.sr2',
  '.nef',
  '.nrw',
  '.cr3',
  '.cr2',
  '.crw',
  '.dng',
  '.raf',
  '.rw2',
  '.rwl',
  '.orf',
  '.ori',
  '.pef',
  '.iiq',
  '.cap',
  '.eip',
  '.3fr',
  '.fff',
  '.erf',
  '.kdc',
  '.dcr',
  '.mos',
  '.mrw',
  '.srw',
  '.bay',
  '.x3f',
];

function isSupportedRawFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface DropZoneProps {
  mode: 'tilt' | 'noise';
  disabled?: boolean;
  compact?: boolean;
  onFilesAccepted: (files: File[]) => void;
  onLoadTiltPreset?: (preset: SyntheticPresetId) => void;
  onLoadNoisePreset?: () => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  mode,
  disabled = false,
  compact = false,
  onFilesAccepted,
  onLoadTiltPreset,
  onLoadNoisePreset,
}) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [invalidFileName, setInvalidFileName] = useState<string | null>(null);

  const handleIncomingFileList = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || disabled) return;
    const all = Array.from(fileList);
    const valid = all.filter(isSupportedRawFile);

    if (valid.length === 0) {
      setInvalidFileName(all[0].name);
      return;
    }

    setInvalidFileName(null);
    onFilesAccepted(mode === 'tilt' ? [valid[0]] : valid);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleIncomingFileList(e.dataTransfer.files);
  };

  if (compact) {
    return (
      <div className="inline-flex items-center">
        <input
          id={`raw-file-input-compact-${mode}`}
          ref={inputRef}
          type="file"
          multiple={mode === 'noise'}
          accept={SUPPORTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            handleIncomingFileList(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          id={`btn-upload-compact-${mode}`}
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="btn-instrument btn-primary-cta"
        >
          <FileUp size={13} />
          <span>
            {mode === 'tilt'
              ? t.dropzone.compactTiltUpload
              : t.dropzone.compactNoiseUpload}
          </span>
        </button>
      </div>
    );
  }

  const guideItems =
    mode === 'tilt' ? t.dropzone.guideTiltItems : t.dropzone.guideNoiseItems;

  return (
    <section
      aria-label={
        mode === 'tilt'
          ? t.dropzone.sectionAriaTilt
          : t.dropzone.sectionAriaNoise
      }
      className="flex-1 flex flex-col justify-center max-w-[1000px] mx-auto w-full px-4 py-6 sm:py-10"
    >
      <input
        id={`raw-file-input-${mode}`}
        ref={inputRef}
        type="file"
        multiple={mode === 'noise'}
        accept={SUPPORTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => {
          handleIncomingFileList(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="launchpad-frame grid grid-cols-1 lg:grid-cols-12">
        {/* Left Column: Primary RAW Drop Target */}
        <div
          id={`dropzone-area-${mode}`}
          role="button"
          tabIndex={0}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`lg:col-span-7 dropzone-target ${
            isDragging ? 'is-dragging' : ''
          }`}
        >
          <div className="space-y-5 relative z-10">
            {/* Precision Sensor Registration Icon */}
            <div className="w-10 h-10 rounded-md bg-[var(--bg-elevated)] border border-[var(--hairline-strong)] grid place-items-center text-[var(--text-primary)]">
              {mode === 'tilt' ? (
                <Aperture size={19} strokeWidth={1.75} />
              ) : (
                <Layers size={19} strokeWidth={1.75} />
              )}
            </div>

            <div className="space-y-2 max-w-lg">
              <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
                {mode === 'tilt' ? t.dropzone.titleTilt : t.dropzone.titleNoise}
              </h2>
              <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                {mode === 'tilt' ? t.dropzone.descTilt : t.dropzone.descNoise}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                id={`btn-select-files-${mode}`}
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) inputRef.current?.click();
                }}
                className="btn-instrument btn-primary-cta"
                style={{ height: '32px', padding: '0 0.9rem' }}
              >
                <FileUp size={14} />
                <span>
                  {mode === 'tilt'
                    ? t.dropzone.btnSelectFilesTilt
                    : t.dropzone.btnSelectFilesNoise}
                </span>
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                {t.dropzone.dragHint}
              </span>
            </div>
          </div>

          {/* Supported Formats & Local WASM Guarantee */}
          <div className="space-y-3 pt-8 relative z-10">
            <div className="space-y-1.5">
              <div className="section-eyebrow">
                {t.dropzone.supportedFormatsLabel}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="status-tag">{t.dropzone.tagSony}</span>
                <span className="status-tag">{t.dropzone.tagNikon}</span>
                <span className="status-tag">{t.dropzone.tagCanon}</span>
                <span className="status-tag">{t.dropzone.tagDng}</span>
                <span className="status-tag">{t.dropzone.tagOthers}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--optical-green)] pt-1">
              <ShieldCheck size={13} className="shrink-0" />
              <span>{t.dropzone.privacyBadge}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Synthetic Calibration Presets + Shooting Protocol */}
        <div className="lg:col-span-5 bg-[var(--bg-panel-subtle)] border-t lg:border-t-0 lg:border-l border-[var(--hairline-default)] flex flex-col justify-between">
          {/* Synthetic 14-bit Calibration Presets */}
          <div className="p-5 space-y-3">
            <div className="space-y-1">
              <div className="section-eyebrow">{t.dropzone.synthTitle}</div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {t.dropzone.synthDesc}
              </p>
            </div>

            <div className="space-y-2 pt-0.5">
              {mode === 'tilt' && onLoadTiltPreset && (
                <>
                  <button
                    id="btn-synth-tilt-chart"
                    type="button"
                    disabled={disabled}
                    onClick={() => onLoadTiltPreset('tilt_chart')}
                    className="preset-row-btn group"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Target
                        size={15}
                        className="text-[var(--accent-amber)] shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {t.dropzone.btnSynthTiltChart}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-muted)] mono-num truncate mt-0.5">
                          {t.dropzone.synthTiltChartMeta}
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0 transition-transform group-hover:translate-x-0.5"
                    />
                  </button>

                  <button
                    id="btn-synth-astro"
                    type="button"
                    disabled={disabled}
                    onClick={() => onLoadTiltPreset('astro_starfield')}
                    className="preset-row-btn group"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Stars
                        size={15}
                        className="text-[var(--signal-blue)] shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {t.dropzone.btnSynthAstro}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-muted)] mono-num truncate mt-0.5">
                          {t.dropzone.synthAstroMeta}
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0 transition-transform group-hover:translate-x-0.5"
                    />
                  </button>

                  <button
                    id="btn-synth-flat-ref"
                    type="button"
                    disabled={disabled}
                    onClick={() => onLoadTiltPreset('flat_reference')}
                    className="preset-row-btn group"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Sparkles
                        size={15}
                        className="text-[var(--optical-green)] shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {t.dropzone.btnSynthFlatRef}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-muted)] mono-num truncate mt-0.5">
                          {t.dropzone.synthFlatRefMeta}
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0 transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                </>
              )}

              {mode === 'noise' && onLoadNoisePreset && (
                <button
                  id="btn-synth-iso-series"
                  type="button"
                  disabled={disabled}
                  onClick={onLoadNoisePreset}
                  className="preset-row-btn group"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Sparkles
                      size={15}
                      className="text-[var(--accent-amber)] shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {t.dropzone.btnSynthIsoSeries}
                      </div>
                      <div className="text-[11.5px] text-[var(--text-muted)] mono-num truncate mt-0.5">
                        {t.dropzone.synthIsoSeriesMeta}
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              )}
            </div>
          </div>

          {/* Concise Field Capture Protocol */}
          <div className="p-5 border-t border-[var(--hairline-subtle)] space-y-2.5">
            <div className="section-eyebrow">{t.dropzone.guideTitle}</div>
            <ol className="space-y-2 m-0 p-0 list-none">
              {guideItems.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-[11.5px] text-[var(--text-secondary)] leading-snug"
                >
                  <span className="mono-num text-[11.5px] text-[var(--text-muted)] pt-0.5 shrink-0">
                    0{idx + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {invalidFileName !== null && (
        <div
          role="alert"
          className="mt-3 px-3.5 py-2.5 rounded-md bg-[var(--alert-coral-soft)] border border-[var(--alert-coral-border)] text-xs text-[var(--alert-coral)]"
        >
          {t.dropzone.unsupportedFormat(invalidFileName)}
        </div>
      )}
    </section>
  );
};
