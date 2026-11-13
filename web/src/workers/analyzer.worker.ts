/// <reference lib="webworker" />

import initWasm, {
  RawSession,
  analyze_dark_frame,
  analyze_iso_series_json,
  generateSyntheticDarkDng,
  generateSyntheticStarfieldDng,
  generateSyntheticTiltDng,
} from '../wasm-pkg/collima_core';

import type {
  DarkFrameReport,
  ImageBufferDesc,
  IsoNoiseSeriesReport,
  PatchRenderModeCode,
  RawImageMetadata,
  SharpnessReport,
  WorkerRequest,
  WorkerResponse,
} from '../types/collima';

declare const self: DedicatedWorkerGlobalScope;

let wasmReadyPromise: Promise<unknown> | null = null;
let activeSession: RawSession | null = null;

function ensureWasm(): Promise<unknown> {
  if (!wasmReadyPromise) {
    wasmReadyPromise = initWasm();
  }
  return wasmReadyPromise;
}

/**
 * Safely extract a standalone ArrayBuffer suitable for zero-copy Transferable postMessage
 * without ever detaching WebAssembly.Memory.
 */
function toTransferableBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }
  return bytes.slice().buffer;
}

function postWorkerMessage(msg: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

function renderAllPatches(
  session: RawSession,
  sharpness: SharpnessReport,
  patchSize: number,
  patchMode: PatchRenderModeCode,
  evBoost: number,
): { patchDescs: ImageBufferDesc[]; patchBuffers: ArrayBuffer[] } {
  const patchDescs: ImageBufferDesc[] = [];
  const patchBuffers: ArrayBuffer[] = [];

  for (let i = 0; i < sharpness.grid3x3.length; i++) {
    const cell = sharpness.grid3x3[i];
    const rgba = session.renderPatchRgba(
      cell.normX,
      cell.normY,
      patchSize,
      patchSize,
      patchMode,
      evBoost,
    );
    const desc = session.lastImageDesc() as ImageBufferDesc;
    patchDescs.push(desc);
    patchBuffers.push(toTransferableBuffer(rgba));
  }

  return { patchDescs, patchBuffers };
}

function openSessionFromBytes(
  requestId: number,
  bytes: Uint8Array,
  filename: string,
  evBoost: number,
  patchMode: PatchRenderModeCode,
  patchSize: number,
) {
  if (activeSession) {
    activeSession.free();
    activeSession = null;
  }

  postWorkerMessage({
    type: 'PROGRESS',
    requestId,
    stage: `正在内存解码 ${filename} 并提取拜耳四通道与 G1/G2 锐度梯度…`,
    completed: 1,
    total: 3,
  });

  const session = new RawSession(bytes, filename);
  activeSession = session;

  const summary = session.getSummary() as {
    metadata: RawImageMetadata;
    sharpness: SharpnessReport;
    noise: DarkFrameReport;
  };

  postWorkerMessage({
    type: 'PROGRESS',
    requestId,
    stage: '正在生成色彩标定 2×2 预览轨与九宫格 1:1 采样切片…',
    completed: 2,
    total: 3,
  });

  const overviewRgba = session.renderOverviewRgba(1680, evBoost);
  const overviewDesc = session.lastImageDesc() as ImageBufferDesc;
  const overviewBuffer = toTransferableBuffer(overviewRgba);

  const { patchDescs, patchBuffers } = renderAllPatches(
    session,
    summary.sharpness,
    patchSize,
    patchMode,
    evBoost,
  );

  postWorkerMessage(
    {
      type: 'SESSION_READY',
      requestId,
      filename,
      metadata: summary.metadata,
      sharpness: summary.sharpness,
      noise: summary.noise,
      overviewDesc,
      overviewBuffer,
      patchDescs,
      patchBuffers,
      evBoost,
      patchMode,
    },
    [overviewBuffer, ...patchBuffers],
  );
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    await ensureWasm();

    switch (req.type) {
      case 'OPEN_RAW_FILE': {
        postWorkerMessage({
          type: 'PROGRESS',
          requestId: req.requestId,
          stage: `正在读取本地文件流 ${req.file.name} (${(req.file.size / (1024 * 1024)).toFixed(1)} MB)…`,
          completed: 0,
          total: 3,
        });
        const arrayBuf = await req.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        openSessionFromBytes(
          req.requestId,
          bytes,
          req.file.name,
          req.evBoost,
          req.patchMode,
          req.patchSize,
        );
        break;
      }

      case 'OPEN_SYNTHETIC_PRESET': {
        postWorkerMessage({
          type: 'PROGRESS',
          requestId: req.requestId,
          stage: '正在合成 14-bit 无压缩 RGGB 标定样张 (.DNG)…',
          completed: 0,
          total: 3,
        });

        let dngBytes: Uint8Array;
        let filename: string;
        if (req.preset === 'tilt_chart') {
          dngBytes = generateSyntheticTiltDng(1600, 1080, 0.85);
          filename = 'synth_mount_tilt_TL_collapse_14bit.dng';
        } else if (req.preset === 'astro_starfield') {
          dngBytes = generateSyntheticStarfieldDng(1600, 1080);
          filename = 'synth_astro_starfield_TR_tilt_14bit.dng';
        } else {
          dngBytes = generateSyntheticTiltDng(1600, 1080, 0.0);
          filename = 'synth_collimated_reference_vignetted_14bit.dng';
        }

        openSessionFromBytes(
          req.requestId,
          dngBytes,
          filename,
          req.evBoost,
          req.patchMode,
          req.patchSize,
        );
        break;
      }

      case 'UPDATE_RENDER_PARAMS': {
        if (!activeSession) {
          throw new Error('当前无活动 RAW 会话');
        }
        const summary = activeSession.getSummary() as {
          sharpness: SharpnessReport;
        };
        const overviewRgba = activeSession.renderOverviewRgba(1680, req.evBoost);
        const overviewDesc = activeSession.lastImageDesc() as ImageBufferDesc;
        const overviewBuffer = toTransferableBuffer(overviewRgba);

        const { patchDescs, patchBuffers } = renderAllPatches(
          activeSession,
          summary.sharpness,
          req.patchSize,
          req.patchMode,
          req.evBoost,
        );

        postWorkerMessage(
          {
            type: 'RENDER_UPDATED',
            requestId: req.requestId,
            overviewDesc,
            overviewBuffer,
            patchDescs,
            patchBuffers,
            evBoost: req.evBoost,
            patchMode: req.patchMode,
          },
          [overviewBuffer, ...patchBuffers],
        );
        break;
      }

      case 'RELOCATE_STATION': {
        if (!activeSession) {
          throw new Error('当前无活动 RAW 会话');
        }
        const updatedSharpness = activeSession.relocateStation(
          req.stationIdx,
          req.normX,
          req.normY,
        ) as SharpnessReport;

        const cell = updatedSharpness.grid3x3[req.stationIdx];
        const patchRgba = activeSession.renderPatchRgba(
          cell.normX,
          cell.normY,
          req.patchSize,
          req.patchSize,
          req.patchMode,
          req.evBoost,
        );
        const patchDesc = activeSession.lastImageDesc() as ImageBufferDesc;
        const patchBuffer = toTransferableBuffer(patchRgba);

        postWorkerMessage(
          {
            type: 'STATION_UPDATED',
            requestId: req.requestId,
            stationIdx: req.stationIdx,
            sharpness: updatedSharpness,
            patchDesc,
            patchBuffer,
          },
          [patchBuffer],
        );
        break;
      }

      case 'RESET_STATIONS': {
        if (!activeSession) {
          throw new Error('当前无活动 RAW 会话');
        }
        const resetSharpness = activeSession.resetStations() as SharpnessReport;
        const { patchDescs, patchBuffers } = renderAllPatches(
          activeSession,
          resetSharpness,
          req.patchSize,
          req.patchMode,
          req.evBoost,
        );

        postWorkerMessage(
          {
            type: 'STATIONS_RESET',
            requestId: req.requestId,
            sharpness: resetSharpness,
            patchDescs,
            patchBuffers,
          },
          patchBuffers,
        );
        break;
      }

      case 'ANALYZE_NOISE_BATCH': {
        const mergedFrames: DarkFrameReport[] = [...req.existingFrames];
        const total = req.files.length;

        // Sequential one-file-at-a-time streaming inside Worker: avoids OOM on 10x 60MP RAW dark frames!
        for (let i = 0; i < total; i++) {
          const file = req.files[i];
          postWorkerMessage({
            type: 'PROGRESS',
            requestId: req.requestId,
            stage: `正在分析暗帧 (${i + 1}/${total})：${file.name}`,
            completed: i,
            total,
          });

          const buf = await file.arrayBuffer();
          const report = analyze_dark_frame(
            new Uint8Array(buf),
            file.name,
          ) as DarkFrameReport;

          const dupIdx = mergedFrames.findIndex(
            (f) => f.filename === report.filename && f.iso === report.iso,
          );
          if (dupIdx >= 0) {
            mergedFrames[dupIdx] = report;
          } else {
            mergedFrames.push(report);
          }
        }

        const series = analyze_iso_series_json(
          JSON.stringify(mergedFrames),
        ) as IsoNoiseSeriesReport;

        postWorkerMessage({
          type: 'NOISE_SERIES_READY',
          requestId: req.requestId,
          series,
        });
        break;
      }

      case 'GENERATE_SYNTHETIC_ISO_SERIES': {
        const isoSteps = [100, 200, 400, 640, 800, 1600, 3200, 6400];
        const frames: DarkFrameReport[] = [];

        for (let i = 0; i < isoSteps.length; i++) {
          const iso = isoSteps[i];
          postWorkerMessage({
            type: 'PROGRESS',
            requestId: req.requestId,
            stage: `正在生成并标定合成双原生 ISO 暗帧：ISO ${iso} (${i + 1}/${isoSteps.length})`,
            completed: i,
            total: isoSteps.length,
          });
          const dng = generateSyntheticDarkDng(960, 640, iso);
          const report = analyze_dark_frame(
            dng,
            `synth_dual_gain_ISO${iso}.dng`,
          ) as DarkFrameReport;
          frames.push(report);
        }

        const series = analyze_iso_series_json(
          JSON.stringify(frames),
        ) as IsoNoiseSeriesReport;

        postWorkerMessage({
          type: 'NOISE_SERIES_READY',
          requestId: req.requestId,
          series,
        });
        break;
      }
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? '未知 WASM 分析错误');
    postWorkerMessage({
      type: 'ERROR',
      requestId: req.requestId,
      message,
    });
  }
};
