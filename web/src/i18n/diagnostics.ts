import type {
  DarkFrameReport,
  IsoNoiseSeriesReport,
  RawImageMetadata,
  SharpnessReport,
  WorkerProgressKey,
} from '../types/collima';
import type { LocaleCode } from './locales';

const DIRECTION_MAP: Record<string, Record<LocaleCode, string>> = {
  Centered: {
    'zh-CN': '居中 (Centered)',
    'zh-TW': '置中 (Centered)',
    en: 'Centered',
    ja: '中央 (Centered)',
  },
  'Left (ML)': {
    'zh-CN': '左侧 (ML)',
    'zh-TW': '左側 (ML)',
    en: 'Left (ML)',
    ja: '左端 (ML)',
  },
  'Top-Left (TL)': {
    'zh-CN': '左上 (TL)',
    'zh-TW': '左上 (TL)',
    en: 'Top-Left (TL)',
    ja: '左上 (TL)',
  },
  'Top (TC)': {
    'zh-CN': '上方 (TC)',
    'zh-TW': '上方 (TC)',
    en: 'Top (TC)',
    ja: '上端 (TC)',
  },
  'Top-Right (TR)': {
    'zh-CN': '右上 (TR)',
    'zh-TW': '右上 (TR)',
    en: 'Top-Right (TR)',
    ja: '右上 (TR)',
  },
  'Right (MR)': {
    'zh-CN': '右侧 (MR)',
    'zh-TW': '右側 (MR)',
    en: 'Right (MR)',
    ja: '右端 (MR)',
  },
  'Bottom-Right (BR)': {
    'zh-CN': '右下 (BR)',
    'zh-TW': '右下 (BR)',
    en: 'Bottom-Right (BR)',
    ja: '右下 (BR)',
  },
  'Bottom (BC)': {
    'zh-CN': '下方 (BC)',
    'zh-TW': '下方 (BC)',
    en: 'Bottom (BC)',
    ja: '下端 (BC)',
  },
  'Bottom-Left (BL)': {
    'zh-CN': '左下 (BL)',
    'zh-TW': '左下 (BL)',
    en: 'Bottom-Left (BL)',
    ja: '左下 (BL)',
  },
};

export function localizeCollapseDirection(
  rawLabel: string,
  locale: LocaleCode,
): string {
  const entry = DIRECTION_MAP[rawLabel];
  return entry ? entry[locale] : rawLabel;
}

function formatSonyXocnNote(locale: LocaleCode): string {
  switch (locale) {
    case 'zh-CN':
      return '检测到索尼 X-OCN / LLVC3 (ARW 6.0 已压缩 / 已压缩 HQ) 5/3 小波编码流：解码像素已经过 12→16-bit LLVC3 曲线线性化映射（BL=1024, WL=39002），EV 动态范围具备尺度不变性，但 σ_ADU 处于 LLVC3 线性域而非传感器原始 14-bit ADC 码值域。';
    case 'zh-TW':
      return '偵測到 Sony X-OCN / LLVC3 (ARW 6.0 已壓縮 / 已壓縮 HQ) 5/3 小波編碼流：解碼像素已經過 12→16-bit LLVC3 曲線線性化映射（BL=1024, WL=39002），EV 動態範圍具備尺度不變性，惟 σ_ADU 處於 LLVC3 線性域而非感光元件原始 14-bit ADC 碼值域。';
    case 'ja':
      return 'Sony X-OCN / LLVC3 (ARW 6.0 圧縮 / 圧縮HQ) 5/3 ウェーブレットストリームを検出：デコード画素は 12→16-bit LLVC3 線形化LUT（BL=1024, WL=39002）で展開されています。EV ダイナミックレンジはスケール不変ですが、σ_ADU は生の 14-bit ADC コードではなく LLVC3 線形領域の値となります。';
    case 'en':
      return 'Sony X-OCN / LLVC3 (ARW 6.0 Compressed / HQ) 5/3 wavelet stream detected: decoded pixels are mapped via the 12→16-bit LLVC3 linearization LUT (BL=1024, WL=39002). Engineering DR (EV) remains scale-invariant, while σ_ADU is expressed in the linearized LLVC3 domain rather than raw 14-bit ADC codes.';
  }
}

function hasSonyXocnWarning(meta: RawImageMetadata): boolean {
  return (
    meta.compressionName.includes('LLVC3') ||
    meta.warnings.some((w) => w.includes('LLVC3'))
  );
}

export interface LocalizedSharpnessDiagnostics {
  collapseDirectionLabel: string;
  verdictTitle: string;
  notes: string[];
}

export function localizeSharpnessReport(
  sharpness: SharpnessReport,
  metadata: RawImageMetadata,
  locale: LocaleCode,
): LocalizedSharpnessDiagnostics {
  const collapseDir = localizeCollapseDirection(
    sharpness.tiltVector.collapseDirectionLabel,
    locale,
  );
  const mag = sharpness.tiltVector.magnitude.toFixed(2);
  const diagPct = (sharpness.asymmetry.maxDiagonalAsymmetry * 100).toFixed(1);
  const meanCornerPct = (sharpness.cornerRetention.mean * 100).toFixed(0);

  const lowTexCorners = [0, 2, 6, 8].filter(
    (idx) => sharpness.grid3x3[idx]?.validity !== 'valid',
  ).length;
  const totalStars = sharpness.grid3x3.reduce(
    (acc, c) => acc + (c.starCount || 0),
    0,
  );

  const notes: string[] = [];

  if (lowTexCorners > 0) {
    switch (locale) {
      case 'zh-CN':
        notes.push(
          `4 个边角采样站中有 ${lowTexCorners} 处缺乏均匀高频纹理（如纯色天空、大虚化或高光溢出）；可将该视口采样框拖至有纹理细节处，或正对平面纹理目标重拍。`,
        );
        break;
      case 'zh-TW':
        notes.push(
          `4 個邊角取樣站中有 ${lowTexCorners} 處缺乏均勻高頻紋理（如純色天空、散景或高光過曝）；可將該視口取樣框拖曳至有細節處，或正對平面紋理目標重拍。`,
        );
        break;
      case 'ja':
        notes.push(
          `四隅4箇所のうち ${lowTexCorners} 箇所で均一な高周波テクスチャが不足しています（青空・ボケ・白飛びなど）。測定枠をディテールのある箇所へドラッグするか、平面チャートを正対撮影してください。`,
        );
        break;
      case 'en':
        notes.push(
          `${lowTexCorners} of 4 corner stations lack uniform high-frequency texture (e.g. blank sky, defocus, or highlight clipping); drag those loupe boxes onto textured detail or shoot a planar target.`,
        );
        break;
    }
  }

  if (totalStars >= 9) {
    switch (locale) {
      case 'zh-CN':
        notes.push(
          `九宫格采样区内共检出 ${totalStars} 颗点光源星点轮廓；已在各视口顶部同步标出中位星点半通量半径 HFR (px)。`,
        );
        break;
      case 'zh-TW':
        notes.push(
          `九宮格取樣區內共檢出 ${totalStars} 顆點光源星點輪廓；已於各視口頂部同步標示中位星點半通量半徑 HFR (px)。`,
        );
        break;
      case 'ja':
        notes.push(
          `9分割測定枠内で合計 ${totalStars} 個の点光源（星像）プロファイルを検出しました。Tenengrad 先鋭度と併せて各枠の中央値 Star HFR (px) を表示しています。`,
        );
        break;
      case 'en':
        notes.push(
          `Detected ${totalStars} point-source star profiles across the 9 stations; per-cell median Star HFR (px) is displayed alongside Tenengrad sharpness.`,
        );
        break;
    }
  }

  let verdictTitle: string;

  switch (sharpness.grade) {
    case 'insufficient_texture': {
      switch (locale) {
        case 'zh-CN':
          verdictTitle = '平面高频纹理不足 — 请微调采样框或更换测试目标';
          notes.push('当前有效纹理采样站不足，无法可靠解耦卡口光轴倾斜与场景景深差异。');
          break;
        case 'zh-TW':
          verdictTitle = '平面高頻紋理不足 — 請微調取樣框或更換測試目標';
          notes.push('目前有效紋理取樣站不足，無法可靠分離接環光軸傾斜與場景景深差異。');
          break;
        case 'ja':
          verdictTitle = '平面テクスチャ不足 — 測定枠を移動するか被写体を変更してください';
          notes.push('有効なテクスチャ測定枠が不足しているため、マウントの光軸ズレと被写体の奥行き差を分離できません。');
          break;
        case 'en':
          verdictTitle = 'Insufficient Planar Texture — Adjust ROI or Target';
          notes.push(
            'Insufficient valid textured stations to separate mount tilt from scene framing.',
          );
          break;
      }
      break;
    }

    case 'severe_tilt': {
      switch (locale) {
        case 'zh-CN':
          verdictTitle = `检出显著焦平面倾斜 / 单侧塌陷（朝向 ${collapseDir}）`;
          notes.push(
            `锐度平面向 ${collapseDir} 呈现显著非对称塌陷（Tilt 模长 ${mag}，最大对角差 ${diagPct}%）。请先确认机位与被摄平面严格垂直；若在星空或调平标板上复现，建议排查转接环平行度、机身法兰距垫片或镜组偏心。`,
          );
          break;
        case 'zh-TW':
          verdictTitle = `檢出顯著焦平面傾斜 / 單側塌陷（朝向 ${collapseDir}）`;
          notes.push(
            `銳利度平面向 ${collapseDir} 呈現顯著非對稱塌陷（Tilt 量值 ${mag}，最大對角差 ${diagPct}%）。請先確認機位與被攝平面嚴格垂直；若於星空或調平標板上重現，建議排查轉接環平行度、機身法蘭距墊片或鏡組偏心。`,
          );
          break;
        case 'ja':
          verdictTitle = `顕著な像面傾斜・片ボケを検出（${collapseDir} 方向）`;
          notes.push(
            `先鋭度平面が ${collapseDir} 方向へ非対称に大きく低下しています（Tilt 量 ${mag}、最大対角差 ${diagPct}%）。カメラが被写体平面に正対しているか確認し、星景や水平チャートでも再現する場合はマウントアダプターの平行度・フランジバック調整シム・レンズ偏心を点検してください。`,
          );
          break;
        case 'en':
          verdictTitle = `Significant Focal-Plane Tilt Detected (${collapseDir})`;
          notes.push(
            `Asymmetric sharpness plane collapse toward ${collapseDir} (tilt magnitude ${mag}, diagonal Δ ${diagPct}%). Verify camera-to-target perpendicularity; if confirmed on a starfield or aligned chart, check mount flange / adapter shimming or lens decentering.`,
          );
          break;
      }
      break;
    }

    case 'mild_tilt': {
      switch (locale) {
        case 'zh-CN':
          verdictTitle = `检出轻度光学非对称 / 倾角（偏向 ${collapseDir}）`;
          notes.push(
            `锐度分布向 ${collapseDir} 存在轻微单侧偏移（Tilt 模长 ${mag}，对角差 ${diagPct}%），常见于大光圈广角镜头装配公差或机位存在 <2° 轻微偏航角。`,
          );
          break;
        case 'zh-TW':
          verdictTitle = `檢出輕度光學非對稱 / 傾角（偏向 ${collapseDir}）`;
          notes.push(
            `銳利度分佈向 ${collapseDir} 存在輕微單側偏移（Tilt 量值 ${mag}，對角差 ${diagPct}%），常見於大光圈廣角鏡頭組裝公差或機位存在 <2° 輕微偏航角。`,
          );
          break;
        case 'ja':
          verdictTitle = `軽微な光学非対称 / 片ボケ傾向（${collapseDir} 方向）`;
          notes.push(
            `${collapseDir} 方向へわずかな非対称性が見られます（Tilt 量 ${mag}、対角差 ${diagPct}%）。大口径広角レンズの製造公差、または被写体に対するごくわずかな正対ズレ（<2°）で生じる範囲です。`,
          );
          break;
        case 'en':
          verdictTitle = `Mild Optical Asymmetry / Tilt (${collapseDir})`;
          notes.push(
            `Mild directional asymmetry toward ${collapseDir} (tilt ${mag}, diagonal Δ ${diagPct}%). Typical of fast wide-angle tolerances or slight target yaw (<2°).`,
          );
          break;
      }
      break;
    }

    case 'normal_curvature': {
      switch (locale) {
        case 'zh-CN':
          verdictTitle = '光轴同轴度良好 — 呈正常对称场曲衰减';
          notes.push(
            `四角锐度呈均匀同心衰减（四角平均保持率 ${meanCornerPct}%，对角差仅 ${diagPct}%），属于大光圈正常像场弯曲 / 边缘子午弧矢像散，并非卡口倾斜或镜组偏心。`,
          );
          break;
        case 'zh-TW':
          verdictTitle = '光軸同軸度良好 — 呈正常對稱像場彎曲衰減';
          notes.push(
            `四角銳利度呈均勻同心衰減（四角平均維持率 ${meanCornerPct}%，對角差僅 ${diagPct}%），屬於大光圈正常像場彎曲 / 邊緣子午弧矢像散，並非接環傾斜或鏡組偏心。`,
          );
          break;
        case 'ja':
          verdictTitle = '光軸センター良好 — 正常な対称像面湾曲';
          notes.push(
            `四隅の先鋭度は同心円状に対称減衰しています（四隅平均維持率 ${meanCornerPct}%、対角差 ${diagPct}%）。絞り開放特有の正常な像面湾曲・非点収差であり、片ボケ（マウント傾斜や偏心）ではありません。`,
          );
          break;
        case 'en':
          verdictTitle = 'Well-Centered Axis — Symmetric Field Curvature';
          notes.push(
            `Corners decay symmetrically (mean corner retention ${meanCornerPct}%, diagonal Δ ${diagPct}%), indicating normal wide-open field curvature / sagittal-meridional MTF falloff rather than mount tilt.`,
          );
          break;
      }
      break;
    }

    case 'excellent': {
      switch (locale) {
        case 'zh-CN':
          verdictTitle = '光轴准直与平坦度优异';
          notes.push(
            `光学同轴度极佳：四角平均锐度保持率达 ${meanCornerPct}%，且对角非对称度极低（${diagPct}%）。`,
          );
          break;
        case 'zh-TW':
          verdictTitle = '光軸準直與像場平坦度優異';
          notes.push(
            `光學同軸度極佳：四角平均銳利度維持率達 ${meanCornerPct}%，且對角非對稱度極低（${diagPct}%）。`,
          );
          break;
        case 'ja':
          verdictTitle = '極めて優秀な光軸同軸度・像面平坦性';
          notes.push(
            `高い光軸精度を確認：四隅平均維持率 ${meanCornerPct}%、対角非対称性も極めて低水準（${diagPct}%）です。`,
          );
          break;
        case 'en':
          verdictTitle = 'Excellent Optical Collimation & Flatness';
          notes.push(
            `High optical coaxiality: mean corner retention ${meanCornerPct}% with minimal diagonal asymmetry (${diagPct}%).`,
          );
          break;
      }
      break;
    }
  }

  if (hasSonyXocnWarning(metadata)) {
    notes.push(formatSonyXocnNote(locale));
  }

  return {
    collapseDirectionLabel: collapseDir,
    verdictTitle,
    notes,
  };
}

export function localizeDarkFrameNotes(
  frame: DarkFrameReport,
  locale: LocaleCode,
): string[] {
  const notes: string[] = [];
  const g1 = frame.channels[1];

  if (frame.suspectedLightLeak) {
    const gSigma = g1.readNoiseAdu.toFixed(2);
    const patchSigma = frame.localPatchSigmaG.toFixed(2);
    const dbl = `${g1.blackLevelOffset >= 0 ? '+' : ''}${g1.blackLevelOffset.toFixed(1)}`;
    switch (locale) {
      case 'zh-CN':
        notes.push(
          `疑似遮光不严漏光或误拍亮场帧（全局 G1 σ = ${gSigma} ADU vs 局部块 σ = ${patchSigma} ADU，ΔBL = ${dbl} ADU）。建议盖紧机身盖、遮挡光学取景器并使用 1/4000s 以上高速快门重拍。`,
        );
        break;
      case 'zh-TW':
        notes.push(
          `疑似遮光不嚴漏光或誤拍亮場幀（全域 G1 σ = ${gSigma} ADU vs 局部區塊 σ = ${patchSigma} ADU，ΔBL = ${dbl} ADU）。建議蓋緊機身蓋、遮擋光學觀景窗並使用 1/4000s 以上高速快門重拍。`,
        );
        break;
      case 'ja':
        notes.push(
          `遮光漏れまたは露光フレームの疑いがあります（全体 G1 σ = ${gSigma} ADU vs 局所パッチ σ = ${patchSigma} ADU、ΔBL = ${dbl} ADU）。ボディキャップ装着・ファインダー遮光のうえ、1/4000秒以上の高速シャッターで撮影してください。`,
        );
        break;
      case 'en':
        notes.push(
          `Suspected light leak or illuminated frame (global G1 σ = ${gSigma} ADU vs local patch σ = ${patchSigma} ADU, ΔBL = ${dbl} ADU). Capture dark frames with body cap on, viewfinder covered, and 1/4000s+ shutter.`,
        );
        break;
    }
  }

  if (frame.isZeroClipped) {
    const maxClip = Math.max(
      ...frame.channels.map((c) => c.zeroClippedPct),
    ).toFixed(2);
    switch (locale) {
      case 'zh-CN':
        notes.push(
          `检出直方图零点截断（${maxClip}% 像素堆积在 0 ADU）：相机固件截断了低于黑电平的负向噪声半波，可能轻微低估 σ_ADU 并虚高动态范围。`,
        );
        break;
      case 'zh-TW':
        notes.push(
          `檢出直方圖零點截斷（${maxClip}% 像素堆積於 0 ADU）：相機韌體截斷了低於黑電平的負向雜訊半波，可能輕微低估 σ_ADU 並高估動態範圍。`,
        );
        break;
      case 'ja':
        notes.push(
          `ヒストグラムのゼロクリッピングを検出（${maxClip}% の画素が 0 ADU に集中）：ファームウェアが黒レベル未満の負側ノイズを切り捨てているため、σ_ADU がわずかに小さく、DR が高めに算出される場合があります。`,
        );
        break;
      case 'en':
        notes.push(
          `Histogram zero-clipping detected (${maxClip}% samples at 0 ADU): camera firmware truncates negative black-point noise, which can slightly underestimate σ_ADU and inflate DR.`,
        );
        break;
    }
  }

  if (
    frame.metadata.exposureTimeSec !== null &&
    frame.metadata.exposureTimeSec >= 0.25
  ) {
    const exp = frame.metadata.exposureTimeSec.toFixed(2);
    switch (locale) {
      case 'zh-CN':
        notes.push(
          `较长曝光时间（${exp}s）：当前噪声读数除读出噪声外还包含传感器热暗电流噪声成分。`,
        );
        break;
      case 'zh-TW':
        notes.push(
          `較長曝光時間（${exp}s）：目前雜訊讀數除讀出雜訊外亦包含感光元件熱暗電流成分。`,
        );
        break;
      case 'ja':
        notes.push(
          `長秒露光（${exp}s）：測定値には読み出しノイズに加えて熱暗電流ノイズが含まれています。`,
        );
        break;
      case 'en':
        notes.push(
          `Long exposure (${exp}s): measurements include thermal dark current in addition to readout noise.`,
        );
        break;
    }
  }

  if (frame.iso <= 0) {
    switch (locale) {
      case 'zh-CN':
        notes.push('缺少有效 EXIF ISO 感光度标签；该帧已从双原生 ISO 增益曲线拟合中排除。');
        break;
      case 'zh-TW':
        notes.push('缺少有效 EXIF ISO 感光度標籤；該幀已從雙原生 ISO 增益曲線擬合中排除。');
        break;
      case 'ja':
        notes.push(
          'EXIF ISO 感度が不明または無効なため、ISO-ゲイン曲線の変曲点フィッティングから除外されています。',
        );
        break;
      case 'en':
        notes.push(
          'EXIF ISO missing or invalid; excluded from ISO-gain curve inflection fitting.',
        );
        break;
    }
  }

  if (hasSonyXocnWarning(frame.metadata)) {
    notes.push(formatSonyXocnNote(locale));
  }

  return notes;
}

export function localizeNoiseSeriesSummary(
  series: IsoNoiseSeriesReport,
  locale: LocaleCode,
): string {
  const { frames, inflections, cameraModel } = series;
  if (frames.length === 0) {
    switch (locale) {
      case 'zh-CN':
        return '尚未载入暗帧样张。';
      case 'zh-TW':
        return '尚未載入暗幀樣張。';
      case 'ja':
        return 'ダークフレームが読み込まれていません。';
      case 'en':
        return 'No dark frames loaded.';
    }
  }

  const positiveIsos = Array.from(
    new Set(frames.filter((f) => f.iso > 0).map((f) => f.iso)),
  ).sort((a, b) => a - b);
  const missingCount = frames.filter((f) => f.iso <= 0).length;

  const missingSuffix = (() => {
    if (missingCount <= 0 || positiveIsos.length === 0) return '';
    switch (locale) {
      case 'zh-CN':
        return `（另有 ${missingCount} 张缺失 EXIF ISO 的样本未参与曲线拟合。）`;
      case 'zh-TW':
        return `（另有 ${missingCount} 張缺失 EXIF ISO 的樣本未參與曲線擬合。）`;
      case 'ja':
        return `（EXIF ISO 不明の ${missingCount} 枚は曲線から除外。）`;
      case 'en':
        return ` (${missingCount} frame(s) missing EXIF ISO excluded from curve.)`;
    }
  })();

  if (inflections.length > 0) {
    const list = inflections.map((i) => `ISO ${i.toIso}`).join(', ');
    switch (locale) {
      case 'zh-CN':
        return `已完成 ${cameraModel} 共 ${frames.length} 张暗帧标定：自动检出双原生 / 多档转换增益切换点位于 ${list}。${missingSuffix}`;
      case 'zh-TW':
        return `已完成 ${cameraModel} 共 ${frames.length} 張暗幀標定：自動檢出雙原生 / 多檔轉換增益切換點位於 ${list}。${missingSuffix}`;
      case 'ja':
        return `${cameraModel} のダークフレーム ${frames.length} 枚を解析：${list} でデュアル/マルチ変換ゲイン（HCG）切替を検出しました。${missingSuffix}`;
      case 'en':
        return `Analyzed ${frames.length} dark frame(s) for ${cameraModel}: detected Dual/Multi-Gain Conversion switch at ${list}.${missingSuffix}`;
    }
  }

  if (positiveIsos.length === 0) {
    switch (locale) {
      case 'zh-CN':
        return `已解析 ${cameraModel} 共 ${frames.length} 张暗帧（缺失 EXIF ISO；单帧 ADU 读出噪声与工程动态范围依然有效）。`;
      case 'zh-TW':
        return `已解析 ${cameraModel} 共 ${frames.length} 張暗幀（缺失 EXIF ISO；單幀 ADU 讀出雜訊與工程動態範圍依然有效）。`;
      case 'ja':
        return `${cameraModel} のダークフレーム ${frames.length} 枚を解析（EXIF ISO 不明ですが、各フレームの ADU ノイズと DR 計測値は有効です）。`;
      case 'en':
        return `Analyzed ${frames.length} dark frame(s) for ${cameraModel} (EXIF ISO missing; per-frame ADU noise and DR remain valid).`;
    }
  }

  if (positiveIsos.length >= 3) {
    const lo = positiveIsos[0];
    const hi = positiveIsos[positiveIsos.length - 1];
    switch (locale) {
      case 'zh-CN':
        return `已完成 ${cameraModel} 共 ${frames.length} 张暗帧标定（覆盖 ISO ${lo}–${hi}）：采样区间内呈单斜率模拟放大特性，未见显著 HCG 阶跃。${missingSuffix}`;
      case 'zh-TW':
        return `已完成 ${cameraModel} 共 ${frames.length} 張暗幀標定（涵蓋 ISO ${lo}–${hi}）：取樣區間內呈單斜率類比放大特性，未見顯著 HCG 階躍。${missingSuffix}`;
      case 'ja':
        return `${cameraModel} のダークフレーム ${frames.length} 枚（ISO ${lo}–${hi}）を解析：測定範囲内では単一勾配のアナログゲイン特性を示しています（HCG 切替なし）。${missingSuffix}`;
      case 'en':
        return `Analyzed ${frames.length} dark frame(s) for ${cameraModel} across ISO ${lo}–${hi}: single-slope analog gain behavior (no HCG jump in sampled range).${missingSuffix}`;
    }
  }

  if (positiveIsos.length === 1 && frames.length > 1) {
    const iso = positiveIsos[0];
    const matching = frames.filter((f) => f.iso === iso);
    const meanSigma = (
      matching.reduce((s, f) => s + f.meanReadNoiseAdu, 0) / matching.length
    ).toFixed(2);
    const meanDr = (
      matching.reduce((s, f) => s + f.meanEngineeringDrEv, 0) / matching.length
    ).toFixed(2);
    switch (locale) {
      case 'zh-CN':
        return `已标定 ${cameraModel} 在 ISO ${iso} 下的 ${frames.length} 张暗帧（均值 σ = ${meanSigma} ADU，DR = ${meanDr} EV）。继续追加其他 ISO 档位即可测绘双原生增益拐点。${missingSuffix}`;
      case 'zh-TW':
        return `已標定 ${cameraModel} 於 ISO ${iso} 下的 ${frames.length} 張暗幀（平均 σ = ${meanSigma} ADU，DR = ${meanDr} EV）。繼續追加其他 ISO 檔位即可測繪雙原生增益轉折點。${missingSuffix}`;
      case 'ja':
        return `${cameraModel} の ISO ${iso} ダークフレーム ${frames.length} 枚を解析（平均 σ = ${meanSigma} ADU、DR = ${meanDr} EV）。異なる ISO 感度を追加すると変換ゲイン切替点を特定できます。${missingSuffix}`;
      case 'en':
        return `Analyzed ${frames.length} dark frame(s) for ${cameraModel} at ISO ${iso} (mean σ = ${meanSigma} ADU, DR = ${meanDr} EV). Add distinct ISO stops to map conversion gain transitions.${missingSuffix}`;
    }
  }

  switch (locale) {
    case 'zh-CN':
      return `已解析 ${cameraModel} 共 ${frames.length} 张暗帧。建议继续拖入 4 档以上不同 ISO（如 ISO 100–6400）以完整测绘转换增益切换曲线。${missingSuffix}`;
    case 'zh-TW':
      return `已解析 ${cameraModel} 共 ${frames.length} 張暗幀。建議繼續拖入 4 檔以上不同 ISO（如 ISO 100–6400）以完整測繪轉換增益切換曲線。${missingSuffix}`;
    case 'ja':
      return `${cameraModel} のダークフレーム ${frames.length} 枚を解析しました。変換ゲイン切替を特定するには4段階以上の異なる ISO（例：ISO 100–6400）を追加してください。${missingSuffix}`;
    case 'en':
      return `Analyzed ${frames.length} dark frame(s) for ${cameraModel}. Add 4+ ISO stops (e.g. ISO 100–6400) to map conversion gain transitions.${missingSuffix}`;
  }
}

export function formatWorkerProgress(
  fallbackStage: string,
  progressKey: WorkerProgressKey | undefined,
  params: Record<string, string | number> | undefined,
  locale: LocaleCode,
): string {
  if (!progressKey) return fallbackStage;
  const p = params ?? {};
  switch (progressKey) {
    case 'reading_file':
      switch (locale) {
        case 'zh-CN':
          return `正在读取本地文件流 ${p.filename} (${p.sizeMb} MB)…`;
        case 'zh-TW':
          return `正在讀取本機檔案流 ${p.filename} (${p.sizeMb} MB)…`;
        case 'ja':
          return `ローカルファイルを読み込み中 ${p.filename} (${p.sizeMb} MB)…`;
        case 'en':
          return `Reading local file stream ${p.filename} (${p.sizeMb} MB)…`;
      }
      break;
    case 'decoding_bayer':
      switch (locale) {
        case 'zh-CN':
          return `正在内存解码 ${p.filename} 并提取拜耳四通道与 G1/G2 锐度梯度…`;
        case 'zh-TW':
          return `正在記憶體解碼 ${p.filename} 並提取拜耳四通道與 G1/G2 銳利度梯度…`;
        case 'ja':
          return `${p.filename} をメモリ内でデコードし、ベイヤー4chと G1/G2 先鋭度勾配を計算中…`;
        case 'en':
          return `Decoding ${p.filename} in memory & computing Bayer G1/G2 sharpness gradients…`;
      }
      break;
    case 'rendering_patches':
      switch (locale) {
        case 'zh-CN':
          return '正在生成色彩标定 2×2 预览轨与九宫格 1:1 采样切片…';
        case 'zh-TW':
          return '正在產生色彩標定 2×2 預覽與九宮格 1:1 取樣切片…';
        case 'ja':
          return 'カラー補正済みプレビューと9分割 1:1 等倍クロップを描画中…';
        case 'en':
          return 'Rendering color-calibrated overview & 9-zone 1:1 sensor patches…';
      }
      break;
    case 'synthesizing_dng':
      switch (locale) {
        case 'zh-CN':
          return '正在合成 14-bit 无压缩 RGGB 标定样张 (.DNG)…';
        case 'zh-TW':
          return '正在合成 14-bit 無壓縮 RGGB 標定樣張 (.DNG)…';
        case 'ja':
          return '14-bit 非圧縮 RGGB 校正用サンプル (.DNG) を合成中…';
        case 'en':
          return 'Synthesizing 14-bit uncompressed RGGB calibration frame (.DNG)…';
      }
      break;
    case 'analyzing_dark_frame':
      switch (locale) {
        case 'zh-CN':
          return `正在分析暗帧 (${p.current}/${p.total})：${p.filename}`;
        case 'zh-TW':
          return `正在分析暗幀 (${p.current}/${p.total})：${p.filename}`;
        case 'ja':
          return `ダークフレームを解析中 (${p.current}/${p.total})：${p.filename}`;
        case 'en':
          return `Analyzing dark frame (${p.current}/${p.total}): ${p.filename}`;
      }
      break;
    case 'generating_synth_iso':
      switch (locale) {
        case 'zh-CN':
          return `正在生成并标定合成双原生 ISO 暗帧：ISO ${p.iso} (${p.current}/${p.total})`;
        case 'zh-TW':
          return `正在產生並標定合成雙原生 ISO 暗幀：ISO ${p.iso} (${p.current}/${p.total})`;
        case 'ja':
          return `合成デュアルネイティブISOダークフレームを生成・解析中：ISO ${p.iso} (${p.current}/${p.total})`;
        case 'en':
          return `Synthesizing & calibrating dual-gain dark frame: ISO ${p.iso} (${p.current}/${p.total})`;
      }
      break;
  }
  return fallbackStage;
}
