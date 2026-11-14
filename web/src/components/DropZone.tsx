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

const SUPPORTED_EXTENSIONS = [
  '.arw',
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
  '.3fr',
  '.fff',
  '.erf',
  '.kdc',
  '.dcr',
  '.mos',
  '.mrw',
  '.srw',
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleIncomingFileList = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || disabled) return;
    const all = Array.from(fileList);
    const valid = all.filter(isSupportedRawFile);

    if (valid.length === 0) {
      setValidationError(
        `不支持的文件格式（${all[0].name}）。请拖入相机原始 RAW 文件（如 .ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF）。`,
      );
      return;
    }

    setValidationError(null);
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
          <span>{mode === 'tilt' ? '载入新样张' : '追加暗帧 RAW'}</span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label={mode === 'tilt' ? '镜头光轴样张导入区' : '传感器暗帧批量导入区'}
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
              {mode === 'tilt'
                ? '拖入单张光学测试 RAW 样张（标板 / 远景建筑 / 砖墙 / 星野）'
                : '批量拖入多档 ISO 传感器暗帧 RAW（盖紧镜头盖与取景器遮光片）'}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {mode === 'tilt'
                ? '直接在去马赛克前的拜耳 G1 / G2 独立绿通道上提取黑电平校准 Tenengrad 锐度与星点 HFR，剥离暗角干扰，定量分离正常场曲与卡口/镜组光轴倾斜（Tilt）。'
                : '基于单遍 65,536 桶精确 u16 直方图逐通道（R / G1 / G2 / B）剥离 5σ 热像素，测算黑电平漂移、读出噪声 σ_ADU、工程动态范围（EV）并自动捕获双原生 ISO 增益切换拐点。'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="status-tag">Sony .ARW (含 A7M5/A7R6 X-OCN 已压缩 HQ · ARW 6.0)</span>
            <span className="status-tag">Nikon .NEF (含 Z9/Z8/Z6III/ZR HE &amp; HE* TicoRAW)</span>
            <span className="status-tag">Canon .CR3 / .CR2</span>
            <span className="status-tag">Adobe .DNG (含 JXL)</span>
            <span className="status-tag">Fujifilm .RAF · Lumix/Leica .RW2 · OM .ORF · Pentax .PEF</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--optical-green)] pt-1">
            <ShieldCheck size={14} />
            <span>100% 本地 WebAssembly 内存解码 · 零网络上传 · Web Worker 零拷贝渲染</span>
          </div>
        </div>
      </div>

      {validationError && (
        <div
          role="alert"
          className="mt-3 px-4 py-2.5 rounded-lg bg-[var(--alert-coral-soft)] border border-[hsla(3,82%,63%,0.3)] text-xs text-[hsl(3,88%,75%)]"
        >
          {validationError}
        </div>
      )}

      {/* Built-in Synthetic 14-bit DNG Calibration Suite */}
      <div className="mt-5 instrument-panel p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              内置 14-bit 物理合成标定套件（免样张即刻验证算法）
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              在 WASM 内存中实时合成带精确 PSF 散焦梯度、暗角、散粒/读出噪声与双增益跳变的未压缩 14-bit RGGB `.DNG` 原始流并送入完整解码管线。
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
                  <span>模拟左上塌陷斜轴标板</span>
                </button>
                <button
                  id="btn-synth-astro"
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoadTiltPreset('astro_starfield')}
                  className="btn-instrument"
                >
                  <Stars size={14} className="text-[var(--channel-b)]" />
                  <span>模拟星野右上慧差/倾斜</span>
                </button>
                <button
                  id="btn-synth-flat-ref"
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoadTiltPreset('flat_reference')}
                  className="btn-instrument"
                >
                  <Sparkles size={14} className="text-[var(--optical-green)]" />
                  <span>模拟带 1.4EV 暗角的合焦基准</span>
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
                <span>生成 8 档双原生 ISO 暗帧序列 (ISO 100–6400, HCG @ 800)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
