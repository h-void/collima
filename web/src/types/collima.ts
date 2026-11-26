export type MosaicKind =
  | 'bayer2x2'
  | 'x_trans6x6'
  | 'other_single_plane'
  | 'linear_rgb';

export interface RawImageMetadata {
  make: string;
  model: string;
  cameraLabel: string;
  lensMake: string | null;
  lensModel: string | null;
  iso: number | null;
  exposureTimeSec: number | null;
  shutterDisplay: string | null;
  fNumber: number | null;
  focalLengthMm: number | null;
  captureTime: string | null;
  rawWidth: number;
  rawHeight: number;
  activeX: number;
  activeY: number;
  activeWidth: number;
  activeHeight: number;
  bitsPerSample: number;
  cfaPattern: string;
  mosaicKind: MosaicKind;
  blackLevels: [number, number, number, number];
  whiteLevels: [number, number, number, number];
  wbMultipliers: [number, number, number];
  orientationExif: number;
  formatName: string;
  compressionName: string;
  decoderEngine: string;
  decodeMs: number;
  warnings: string[];
}

export type CellValidity =
  | 'valid'
  | 'low_texture'
  | 'underexposed'
  | 'clipped';

export interface GridCellMetrics {
  id: string;
  row: number;
  col: number;
  normX: number;
  normY: number;
  sensorRect: [number, number, number, number];
  sharpness: number;
  sharpnessG1: number;
  sharpnessG2: number;
  relativeToCenter: number;
  meanSignalNorm: number;
  edgeDensity: number;
  clippedFraction: number;
  validity: CellValidity;
  starCount: number;
  medianStarHfrPx: number | null;
}

export interface CornerRetention {
  tl: number;
  tr: number;
  bl: number;
  br: number;
  mean: number;
}

export interface EdgeRetention {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface AsymmetryMetrics {
  tlBrDiff: number;
  trBlDiff: number;
  leftRightBalance: number;
  topBottomBalance: number;
  maxDiagonalAsymmetry: number;
}

export interface TiltVector {
  tx: number;
  ty: number;
  magnitude: number;
  angleDeg: number;
  collapseAngleDeg: number;
  collapseDirectionLabel: string;
}

export type OpticalGrade =
  | 'excellent'
  | 'normal_curvature'
  | 'mild_tilt'
  | 'severe_tilt'
  | 'insufficient_texture';

export interface SharpnessReport {
  grid3x3: GridCellMetrics[];
  grid5x5: GridCellMetrics[];
  centerSharpness: number;
  cornerRetention: CornerRetention;
  edgeRetention: EdgeRetention;
  asymmetry: AsymmetryMetrics;
  tiltVector: TiltVector;
  radialFalloff: number;
  validCells3x3: number;
  validCells5x5: number;
  grade: OpticalGrade;
  verdictTitle: string;
  notes: string[];
}

export interface ChannelNoiseStats {
  channel: 'R' | 'G1' | 'G2' | 'B';
  sampleCount: number;
  cleanSampleCount: number;
  nominalBlackLevel: number;
  whiteLevel: number;
  measuredMean: number;
  medianAdu: number;
  iqrAdu: number;
  blackLevelOffset: number;
  readNoiseAdu: number;
  readNoiseIso100Norm: number | null;
  engineeringDrEv: number;
  hotPixelCount: number;
  deadPixelCount: number;
  hotPixelPpm: number;
  outlierLowCutoff: number;
  outlierHighCutoff: number;
  minAdu: number;
  maxAdu: number;
  zeroClippedPct: number;
}

export interface DarkFrameReport {
  filename: string;
  metadata: RawImageMetadata;
  iso: number;
  channels: [
    ChannelNoiseStats,
    ChannelNoiseStats,
    ChannelNoiseStats,
    ChannelNoiseStats,
  ];
  meanReadNoiseAdu: number;
  meanReadNoiseIso100Norm: number | null;
  meanEngineeringDrEv: number;
  meanBlackOffsetAdu: number;
  totalHotPixels: number;
  totalHotPixelPpm: number;
  localPatchSigmaG: number;
  isZeroClipped: boolean;
  suspectedLightLeak: boolean;
  g1HistogramWindow: [number, number][];
  qualityNotes: string[];
}

export interface DualIsoInflection {
  fromIso: number;
  toIso: number;
  drReboundEv: number;
  normNoiseDropPct: number;
  rawAduDropped: boolean;
  description: string;
}

export interface IsoNoiseSeriesReport {
  frames: DarkFrameReport[];
  inflections: DualIsoInflection[];
  cameraModel: string;
  summary: string;
}

export interface ImageBufferDesc {
  width: number;
  height: number;
  sensorX: number;
  sensorY: number;
  sensorPxPerOutPx: number;
}

export interface RenderedBitmap {
  desc: ImageBufferDesc;
  rgba: Uint8ClampedArray;
}

/** 0 = Demosaic sRGB, 1 = Pre-Demosaic Green Luminance, 2 = Raw Bayer CFA Mosaic */
export type PatchRenderModeCode = 0 | 1 | 2;

export type SyntheticPresetId =
  | 'tilt_chart'
  | 'astro_starfield'
  | 'flat_reference';

export interface ActiveTiltSessionData {
  filename: string;
  metadata: RawImageMetadata;
  sharpness: SharpnessReport;
  noise: DarkFrameReport;
  overview: RenderedBitmap;
  patches: RenderedBitmap[]; // 9 full-resolution 1:1 patches (TL..BR)
  evBoost: number;
  patchMode: PatchRenderModeCode;
}

/* Worker RPC Protocol */
export type WorkerRequest =
  | {
      type: 'OPEN_RAW_FILE';
      requestId: number;
      file: File;
      evBoost: number;
      patchMode: PatchRenderModeCode;
      patchSize: number;
    }
  | {
      type: 'OPEN_SYNTHETIC_PRESET';
      requestId: number;
      preset: SyntheticPresetId;
      evBoost: number;
      patchMode: PatchRenderModeCode;
      patchSize: number;
    }
  | {
      type: 'UPDATE_RENDER_PARAMS';
      requestId: number;
      evBoost: number;
      patchMode: PatchRenderModeCode;
      patchSize: number;
    }
  | {
      type: 'RELOCATE_STATION';
      requestId: number;
      stationIdx: number;
      normX: number;
      normY: number;
      evBoost: number;
      patchMode: PatchRenderModeCode;
      patchSize: number;
    }
  | {
      type: 'RESET_STATIONS';
      requestId: number;
      evBoost: number;
      patchMode: PatchRenderModeCode;
      patchSize: number;
    }
  | {
      type: 'ANALYZE_NOISE_BATCH';
      requestId: number;
      files: File[];
      existingFrames: DarkFrameReport[];
    }
  | {
      type: 'GENERATE_SYNTHETIC_ISO_SERIES';
      requestId: number;
    }
  | {
      type: 'CLOSE_SESSION';
      requestId: number;
    }
  | {
      type: 'CANCEL_NOISE_BATCH';
      requestId: number;
    };

export type WorkerProgressKey =
  | 'loading_engine'
  | 'reading_file'
  | 'decoding_bayer'
  | 'rendering_patches'
  | 'synthesizing_dng'
  | 'analyzing_dark_frame'
  | 'generating_synth_iso';

export type WorkerResponse =
  | {
      type: 'ENGINE_READY';
    }
  | {
      type: 'PROGRESS';
      requestId: number;
      stage: string;
      progressKey?: WorkerProgressKey;
      progressParams?: Record<string, string | number>;
      completed: number;
      total: number;
    }
  | {
      type: 'SESSION_READY';
      requestId: number;
      filename: string;
      metadata: RawImageMetadata;
      sharpness: SharpnessReport;
      noise: DarkFrameReport;
      overviewDesc: ImageBufferDesc;
      overviewBuffer: ArrayBuffer;
      patchDescs: ImageBufferDesc[];
      patchBuffers: ArrayBuffer[];
      evBoost: number;
      patchMode: PatchRenderModeCode;
    }
  | {
      type: 'RENDER_UPDATED';
      requestId: number;
      overviewDesc: ImageBufferDesc;
      overviewBuffer: ArrayBuffer;
      patchDescs: ImageBufferDesc[];
      patchBuffers: ArrayBuffer[];
      evBoost: number;
      patchMode: PatchRenderModeCode;
    }
  | {
      type: 'STATION_UPDATED';
      requestId: number;
      stationIdx: number;
      sharpness: SharpnessReport;
      patchDesc: ImageBufferDesc;
      patchBuffer: ArrayBuffer;
    }
  | {
      type: 'STATIONS_RESET';
      requestId: number;
      sharpness: SharpnessReport;
      patchDescs: ImageBufferDesc[];
      patchBuffers: ArrayBuffer[];
    }
  | {
      type: 'NOISE_SERIES_READY';
      requestId: number;
      series: IsoNoiseSeriesReport;
    }
  | {
      type: 'ERROR';
      requestId: number;
      message: string;
      fatal?: boolean;
    };
