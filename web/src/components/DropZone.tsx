import React, { useRef, useState } from 'react';
import {
  Aperture,
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
      <div className="flex flex-wrap items-center gap-2">
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
          className="btn-instrument btn-primary-amber"
        >
          <FileUp size={15} />
          <span>
            {mode === 'tilt'
              ? t.dropzone.compactTiltUpload
              : t.dropzone.compactNoiseUpload}
          </span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label={
        mode === 'tilt'
          ? t.dropzone.sectionAriaTilt
          : t.dropzone.sectionAriaNoise
      }
      className="max-w-5xl mx-auto w-full py-6 px-4"
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
        className={`dropzone-surface ${isDragging ? 'is-dragging' : ''}`}
      >
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--hairline-strong)] grid place-items-center text-[var(--accent-amber)]">
            {mode === 'tilt' ? <Aperture size={24} /> : <Layers size={24} />}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              {mode === 'tilt' ? t.dropzone.titleTilt : t.dropzone.titleNoise}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {mode === 'tilt' ? t.dropzone.descTilt : t.dropzone.descNoise}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="status-tag">{t.dropzone.tagSony}</span>
            <span className="status-tag">{t.dropzone.tagNikon}</span>
            <span className="status-tag">{t.dropzone.tagCanon}</span>
            <span className="status-tag">{t.dropzone.tagDng}</span>
            <span className="status-tag">{t.dropzone.tagOthers}</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--optical-green)] pt-1">
            <ShieldCheck size={14} />
            <span>{t.dropzone.privacyBadge}</span>
          </div>
        </div>
      </div>

      {invalidFileName !== null && (
        <div
          role="alert"
          className="mt-3 px-4 py-2.5 rounded-lg bg-[var(--alert-coral-soft)] border border-[hsla(3,82%,63%,0.3)] text-xs text-[hsl(3,88%,75%)]"
        >
          {t.dropzone.unsupportedFormat(invalidFileName)}
        </div>
      )}

      {/* Built-in Synthetic 14-bit DNG Calibration Suite */}
      <div className="mt-5 instrument-panel p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {t.dropzone.synthTitle}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {t.dropzone.synthDesc}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {mode === 'tilt' && onLoadTiltPreset && (
              <>
                <button
                  id="btn-synth-tilt-chart"
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoadTiltPreset('tilt_chart')}
                  className="btn-instrument"
                >
                  <Target size={14} className="text-[var(--accent-amber)]" />
                  <span>{t.dropzone.btnSynthTiltChart}</span>
                </button>
                <button
                  id="btn-synth-astro"
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoadTiltPreset('astro_starfield')}
                  className="btn-instrument"
                >
                  <Stars size={14} className="text-[var(--channel-b)]" />
                  <span>{t.dropzone.btnSynthAstro}</span>
                </button>
                <button
                  id="btn-synth-flat-ref"
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoadTiltPreset('flat_reference')}
                  className="btn-instrument"
                >
                  <Sparkles size={14} className="text-[var(--optical-green)]" />
                  <span>{t.dropzone.btnSynthFlatRef}</span>
                </button>
              </>
            )}

            {mode === 'noise' && onLoadNoisePreset && (
              <button
                id="btn-synth-iso-series"
                type="button"
                disabled={disabled}
                onClick={onLoadNoisePreset}
                className="btn-instrument btn-primary-amber"
              >
                <Sparkles size={14} />
                <span>{t.dropzone.btnSynthIsoSeries}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
