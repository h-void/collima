import type { CellValidity, OpticalGrade, PatchRenderModeCode } from '../types/collima';

export type LocaleCode = 'zh-CN' | 'zh-TW' | 'en' | 'ja';

export interface LocaleOption {
  code: LocaleCode;
  nativeLabel: string;
  shortLabel: string;
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: 'zh-CN', nativeLabel: '简体中文', shortLabel: '简中' },
  { code: 'zh-TW', nativeLabel: '繁體中文', shortLabel: '繁中' },
  { code: 'en', nativeLabel: 'English', shortLabel: 'EN' },
  { code: 'ja', nativeLabel: '日本語', shortLabel: '日本語' },
] as const;

export interface TranslationMessages {
  windowTitle: string;
  metaDescription: string;
  brandSubtitle: string;
  navAriaLabel: string;
  tabTiltLabel: string;
  tabNoiseLabel: string;
  btnBackToBench: string;
  presetsMenuLabel: string;
  themeDarkLabel: string;
  themeLightLabel: string;
  statusReady: string;
  langMenuAriaLabel: string;
  githubSourceLabel: string;
  githubSourceAriaLabel: string;

  telemetryRegionAria: string;
  telemetryLens: string;
  telemetryManualExposure: string;
  telemetryActiveArea: string;
  telemetryDecodeTime: (ms: string) => string;

  errorTitle: string;
  errorDismissAria: string;
  workerRuntimeError: string;
  footerNote: string;

  dropzone: {
    compactTiltUpload: string;
    compactNoiseUpload: string;
    btnSelectFilesTilt: string;
    btnSelectFilesNoise: string;
    dragHint: string;
    sectionAriaTilt: string;
    sectionAriaNoise: string;
    titleTilt: string;
    titleNoise: string;
    descTilt: string;
    descNoise: string;
    supportedFormatsLabel: string;
    tagSony: string;
    tagNikon: string;
    tagCanon: string;
    tagDng: string;
    tagOthers: string;
    privacyBadge: string;
    unsupportedFormat: (name: string) => string;
    synthTitle: string;
    synthDesc: string;
    btnSynthTiltChart: string;
    synthTiltChartMeta: string;
    btnSynthAstro: string;
    synthAstroMeta: string;
    btnSynthFlatRef: string;
    synthFlatRefMeta: string;
    btnSynthIsoSeries: string;
    synthIsoSeriesMeta: string;
    guideTitle: string;
    guideTiltItems: [string, string, string];
    guideNoiseItems: [string, string, string];
  };

  tilt: {
    sectionLoupeAria: string;
    loupePanelTitle: string;
    grades: Record<OpticalGrade, string>;
    validities: Record<CellValidity, string>;
    zoomGroupAria: string;
    dragModeGroupAria: string;
    dragSyncPan: string;
    dragSyncPanTitle: string;
    dragRelocateRoi: string;
    dragRelocateRoiTitle: string;
    reticleToggle: (on: boolean) => string;
    resetStations: string;
    resetStationsTitle: string;
    renderChannelLabel: string;
    patchModes: Record<PatchRenderModeCode, string>;
    patchModesShort: Record<PatchRenderModeCode, string>;
    evBoostLabel: string;
    evResetHint: string;
    hudCenterRef: string;
    hudCenterInvalid: (validityLabel: string) => string;
    hudInvalidRef: string;
    hudRetention: (pct: number) => string;
    loupeHint: string;
    mobileLoupeHint: string;
    mobileBackToGrid: string;
    mobilePrevStationAria: string;
    mobileNextStationAria: string;
    mobileInspectTileAria: (id: string) => string;
    mobileCoordsLabel: string;
    nearestNeighborBadge: string;

    overviewSectionAria: string;
    overviewTitle: string;
    btnHideHeatmap: string;
    btnShowHeatmap: string;
    legendCollapse: string;
    legendCenterPeak: string;
    legendOverPeakHint: string;

    collimationSectionAria: string;
    verdictHeader: string;
    compassAria: string;
    compassTop: string;
    compassBottom: string;
    metricTiltMag: string;
    metricCollapseDir: string;
    metricCollapseAngle: string;
    metricRadialFalloff: string;
    metricCenterSharpness: string;

    cornerRetentionTitle: string;
    cornerMean: (pct: string) => string;
    cornerLabels: {
      tl: string;
      tr: string;
      bl: string;
      br: string;
    };
    diagDiffTlBr: string;
    diagDiffTrBl: string;

    activeStationTitle: string;
    metricG1G2: string;
    metricSignalClip: string;
    metricStarHfr: string;
    notesHeader: string;
  };

  noise: {
    reportTitle: (camera: string) => string;
    frameCountBadge: (count: number) => string;
    inflectionBadge: (
      fromIso: number,
      toIso: number,
      dropPct: string,
      reboundEv: string,
    ) => string;
    btnExportCsv: string;
    btnExportJson: string;
    btnClearSeries: string;
    exportDialogCsvTitle: string;
    exportDialogJsonTitle: string;

    kpiBaseNoise: string;
    kpiPeakDr: string;
    kpiGainArch: string;
    kpiSingleGain: string;
    kpiDualGain: (iso: number) => string;
    kpiMeanBlDrift: string;

    chartSectionAria: string;
    chartPanelTitle: string;
    axisRawAduBtn: string;
    axisIso100Btn: string;
    legendNoiseSolid: string;
    legendDrDashed: string;
    channelMean: string;
    channelAll: string;
    svgAria: string;
    isoUnknownShort: string;
    isoUnknownFull: string;
    leftAxisRawTitle: string;
    leftAxisNormTitle: string;
    rightAxisDrTitle: string;
    bottomAxisIsoTitle: string;

    frameDetailHint: string;
    prevFrameAria: string;
    nextFrameAria: string;
    integrityAlertTitle: string;
    channelCardTitle: (ch: string) => string;
    deltaBlLabel: string;
    hotPixelsRejectedLabel: string;
    g1HistTitle: string;
    nominalBlLabel: (adu: string) => string;

    tableTitle: string;
    colIso: string;
    colFilename: string;
    colNominalBl: string;
    colMeanDeltaBl: string;
    colMeanSigma: string;
    colIso100Norm: string;
    colDrEv: string;
    colHotPixels: string;
    colValidation: string;
    badgeZeroClipped: string;
    badgeLightLeak: string;
    badgeCleanDark: string;
  };
}

export const MESSAGES: Record<LocaleCode, TranslationMessages> = {
  'zh-CN': {
    windowTitle: 'collima — 相机传感器与镜头光轴光学诊断工作台',
    metaDescription:
      '基于 Rust + WebAssembly 的纯本地相机 RAW 光学诊断工作台：支持镜头光轴倾斜（Tilt）与场曲九宫格 1:1 检视、双原生 ISO 传感器读出噪声（ADU）与工程动态范围（EV）标定。',
    brandSubtitle: '光学准直与传感器计量台',
    navAriaLabel: '诊断模式切换',
    tabTiltLabel: '光轴与场曲检视',
    tabNoiseLabel: '底噪与双原生 ISO',
    btnBackToBench: '关闭样张',
    presetsMenuLabel: '合成标定样张',
    themeDarkLabel: '切换至明亮实验室主题',
    themeLightLabel: '切换至中性暗房主题',
    statusReady: '本地引擎就绪',
    langMenuAriaLabel: '切换界面语言',
    githubSourceLabel: 'GitHub 源码',
    githubSourceAriaLabel: '前往 GitHub 查看 collima 源代码',

    telemetryRegionAria: 'RAW 元数据与解码遥测',
    telemetryLens: '镜头',
    telemetryManualExposure: '手动曝光元数据',
    telemetryActiveArea: '有效画幅',
    telemetryDecodeTime: (ms) => `解码 ${ms} ms`,

    errorTitle: 'RAW 内存解析异常',
    errorDismissAria: '关闭错误提示',
    workerRuntimeError: 'Web Worker 运行异常',
    footerNote:
      'Rust + WebAssembly 本地沙箱 (flashraw + ticoraw) · 零网络上传',

    dropzone: {
      compactTiltUpload: '打开 RAW',
      compactNoiseUpload: '追加暗帧',
      btnSelectFilesTilt: '选择 RAW 样张',
      btnSelectFilesNoise: '批量选择暗帧 RAW',
      dragHint: '或将相机原始文件直接拖入此处',
      sectionAriaTilt: '镜头光轴样张导入区',
      sectionAriaNoise: '传感器暗帧批量导入区',
      titleTilt: '导入光学测试 RAW 样张',
      titleNoise: '批量导入多档 ISO 传感器暗帧 RAW',
      descTilt:
        '在去马赛克前的拜耳 G1 / G2 独立绿通道上直接计算黑电平校准 Tenengrad 锐度与星点 HFR，剥离暗角干扰，定量解耦对称场曲与焦平面倾斜（Tilt）。',
      descNoise:
        '基于单遍 65,536 桶精确 u16 直方图逐通道剥离 5σ 热像素，测算黑电平漂移、读出噪声 σ_ADU、工程动态范围（EV），自动识别双原生 ISO（HCG）切换拐点。',
      supportedFormatsLabel: '原生解码覆盖',
      tagSony: 'Sony .ARW / .ARQ (X-OCN / ARW 6.0)',
      tagNikon: 'Nikon .NEF (含 HE / HE* TicoRAW)',
      tagCanon: 'Canon .CR3 / .CR2',
      tagDng: 'Adobe .DNG (含 JXL)',
      tagOthers: 'RAF · RW2 · ORF · PEF · 3FR · IIQ',
      privacyBadge: '100% 本地 WebAssembly 内存运算 · 零网络上传',
      unsupportedFormat: (name) =>
        `不支持的文件格式（${name}）。请拖入相机原始 RAW 文件（如 .ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF）。`,
      synthTitle: '14-bit 物理合成标定样张',
      synthDesc: '无需真机文件，在内存中实时合成 14-bit RGGB .DNG 验证完整管线：',
      btnSynthTiltChart: '左上塌陷斜轴测试标板',
      synthTiltChartMeta: '14-bit RGGB · PSF 单侧倾斜梯度',
      btnSynthAstro: '天顶星野右上彗差与倾角',
      synthAstroMeta: '星点 HFR 半通量半径与偏心检测',
      btnSynthFlatRef: '带 1.4EV 暗角的准直基准',
      synthFlatRefMeta: '验证强暗角下的零偏置四角锐度保持',
      btnSynthIsoSeries: '生成 8 档双原生 ISO 暗帧序列',
      synthIsoSeriesMeta: 'ISO 100–6400 · 自动捕获 HCG @ ISO 800 拐点',
      guideTitle: '实拍采样规范',
      guideTiltItems: [
        '正对填满四角的平面高频目标（远景建筑立面、平整砖墙或天顶星野）',
        '最大光圈全开 + 原生最低 ISO，上三脚架关闭防抖，使用电子前帘/电子快门',
        '单点对焦严格锁定画面正中心（MC），勿重构图',
      ],
      guideNoiseItems: [
        '暗室盖紧机身盖/镜头盖，并遮蔽光学/电子取景器防止杂散漏光',
        'M 档手动对焦、关闭机内长曝光降噪，快门固定 1/1000s – 1/4000s',
        '按各整档 ISO（如 100–6400）各拍一张未压缩或无损压缩 RAW',
      ],
    },

    tilt: {
      sectionLoupeAria: '九宫格 1:1 像素同步检视台',
      loupePanelTitle: '九宫格 1:1 像素同步检视',
      grades: {
        excellent: '光轴准直优异',
        normal_curvature: '光轴居中 · 对称场曲',
        mild_tilt: '轻度单侧偏心 / 倾角',
        severe_tilt: '显著焦平面倾斜 (Tilt)',
        insufficient_texture: '局部高频纹理不足',
      },
      validities: {
        valid: '有效纹理',
        low_texture: '低反差',
        underexposed: '欠曝',
        clipped: '高光溢出',
      },
      zoomGroupAria: '最近邻放大倍率',
      dragModeGroupAria: '视口拖拽模式',
      dragSyncPan: '同步平移',
      dragSyncPanTitle: '拖拽任意视口可 9 窗同步微移观察像素细节',
      dragRelocateRoi: '微调采样',
      dragRelocateRoiTitle:
        '单独微调某个视口的采样坐标（如避开纯色天空对准砖缝或星点）并实时重算锐度',
      reticleToggle: (on) => `十字丝 ${on ? '开' : '关'}`,
      resetStations: '复位',
      resetStationsTitle: '复位九宫格标准采样坐标与平移偏移',
      renderChannelLabel: '通道',
      patchModes: {
        0: '1:1 色彩解马赛克 (sRGB)',
        1: '去马赛克前纯绿通道 (规避倍率色差)',
        2: '原始拜耳 CFA 阵列',
      },
      patchModesShort: {
        0: 'sRGB 色彩',
        1: 'G1/G2 纯绿',
        2: 'Bayer 阵列',
      },
      evBoostLabel: '提亮',
      evResetHint: '点击数值复位至 0.00 EV',
      hudCenterRef: '100% 基准',
      hudCenterInvalid: (v) => `中心·${v}`,
      hudInvalidRef: '基准无效',
      hudRetention: (pct) => `${pct}%`,
      loupeHint:
        '拖拽视口可九窗同步平移；按住 Shift 拖拽或点击右侧热力图可单独移动局部采样窗。',
      mobileLoupeHint:
        '点按任意九宫格区域可放大检视 1:1 像素与完整锐度 / HFR 读数。',
      mobileBackToGrid: '返回 3×3',
      mobilePrevStationAria: '上一个采样窗',
      mobileNextStationAria: '下一个采样窗',
      mobileInspectTileAria: (id) => `放大检视 ${id} 采样窗`,
      mobileCoordsLabel: 'ROI 坐标',
      nearestNeighborBadge: '1:1 最近邻无插值渲染',

      overviewSectionAria: '全画幅缩略图与 5x5 锐度等高线热力图',
      overviewTitle: '全画幅场曲 / 倾角场图 (5×5)',
      btnHideHeatmap: '热力图 开',
      btnShowHeatmap: '热力图 关',
      legendCollapse: '塌陷 <30%',
      legendCenterPeak: '中心峰值 100%',
      legendOverPeakHint: '>100% = 锐度高于中心',

      collimationSectionAria: '光轴倾斜向量与四角保持率指标',
      verdictHeader: '准直诊断结论',
      compassAria: '焦平面倾斜极坐标罗盘',
      compassTop: '上',
      compassBottom: '下',
      metricTiltMag: 'Tilt 倾角模长',
      metricCollapseDir: '劣化塌陷方位',
      metricCollapseAngle: '塌陷方位角',
      metricRadialFalloff: '径向对称场曲',
      metricCenterSharpness: '中心绿通道锐度',

      cornerRetentionTitle: '四角锐度保持率',
      cornerMean: (pct) => `均值 ${pct}%`,
      cornerLabels: {
        tl: '左上 TL',
        tr: '右上 TR',
        bl: '左下 BL',
        br: '右下 BR',
      },
      diagDiffTlBr: '|TL − BR| 对角差',
      diagDiffTrBl: '|TR − BL| 对角差',

      activeStationTitle: '当前选中采样窗',
      metricG1G2: 'G1 / G2 子平面锐度',
      metricSignalClip: '信号均值 / 溢出率',
      metricStarHfr: '检测星点 / 中位 HFR',
      notesHeader: '光学诊断附注',
    },

    noise: {
      reportTitle: (cam) => `${cam} · 传感器底噪与动态范围标定`,
      frameCountBadge: (n) => `${n} 帧样本`,
      inflectionBadge: (fromIso, toIso, dropPct, reboundEv) =>
        `HCG 双增益拐点 ISO ${fromIso}→${toIso} (底噪 −${dropPct}% · DR +${reboundEv} EV)`,
      btnExportCsv: '导出 CSV',
      btnExportJson: '导出 JSON',
      btnClearSeries: '清空',
      exportDialogCsvTitle: '导出 CSV 标定报告',
      exportDialogJsonTitle: '导出 JSON 标定数据',

      kpiBaseNoise: '最低读出噪声',
      kpiPeakDr: '峰值工程动态范围',
      kpiGainArch: '转换增益架构',
      kpiSingleGain: '单斜率线性增益',
      kpiDualGain: (iso) => `双原生 HCG @ ISO ${iso}`,
      kpiMeanBlDrift: '平均黑电平偏移',

      chartSectionAria: '双轴读出噪声与动态范围交互曲线',
      chartPanelTitle: 'ISO 读出噪声与工程动态范围曲线',
      axisRawAduBtn: '原始 σ_ADU',
      axisIso100Btn: 'ISO 100 等效底噪',
      legendNoiseSolid: '读出噪声 σ (左轴)',
      legendDrDashed: '动态范围 EV (右轴)',
      channelMean: '均值',
      channelAll: '四通道',
      svgAria: 'ISO 噪声与动态范围折线图',
      isoUnknownShort: '未知',
      isoUnknownFull: 'ISO 未知',
      leftAxisRawTitle: '← 读出噪声 σ_ADU (Log2)',
      leftAxisNormTitle: '← ISO 100 等效输入噪声 ADU (Log2)',
      rightAxisDrTitle: '工程动态范围 DR (EV) →',
      bottomAxisIsoTitle: '感光度 ISO (Log2 等档距)',

      frameDetailHint: '单帧四通道遥测',
      prevFrameAria: '上一档 ISO 样本',
      nextFrameAria: '下一档 ISO 样本',
      integrityAlertTitle: '暗帧完整性校验提示',
      channelCardTitle: (ch) => ch,
      deltaBlLabel: 'ΔBL',
      hotPixelsRejectedLabel: '5σ 热像素',
      g1HistTitle: 'G1 黑电平附近 ADU 分布',
      nominalBlLabel: (adu) => `BL ${adu} ADU`,

      tableTitle: '多档 ISO 传感器标定台账',
      colIso: 'ISO',
      colFilename: '文件名',
      colNominalBl: '标称 BL',
      colMeanDeltaBl: '均值 ΔBL',
      colMeanSigma: '均值 σ_ADU',
      colIso100Norm: 'ISO 100 归一化',
      colDrEv: '工程 DR',
      colHotPixels: '5σ 热像素',
      colValidation: '校验',
      badgeZeroClipped: '零点截断',
      badgeLightLeak: '疑似漏光',
      badgeCleanDark: '纯净暗帧',
    },
  },

  'zh-TW': {
    windowTitle: 'collima — 相機感光元件與鏡頭光軸光學診斷工作台',
    metaDescription:
      '基於 Rust + WebAssembly 的純本機相機 RAW 光學診斷工作台：支援鏡頭光軸傾斜（Tilt）與像場彎曲九宮格 1:1 檢視、雙原生 ISO 讀出雜訊（ADU）與工程動態範圍（EV）標定。',
    brandSubtitle: '光學準直與感光元件計量台',
    navAriaLabel: '診斷模式切換',
    tabTiltLabel: '光軸與像場檢視',
    tabNoiseLabel: '底噪與雙原生 ISO',
    btnBackToBench: '關閉樣張',
    presetsMenuLabel: '合成標定樣張',
    themeDarkLabel: '切換至明亮實驗室主題',
    themeLightLabel: '切換至中性暗房主題',
    statusReady: '本機引擎就緒',
    langMenuAriaLabel: '切換介面語言',
    githubSourceLabel: 'GitHub 原始碼',
    githubSourceAriaLabel: '前往 GitHub 檢視 collima 原始碼',

    telemetryRegionAria: 'RAW 中繼資料與解碼遙測',
    telemetryLens: '鏡頭',
    telemetryManualExposure: '手動曝光資訊',
    telemetryActiveArea: '有效畫幅',
    telemetryDecodeTime: (ms) => `解碼 ${ms} ms`,

    errorTitle: 'RAW 記憶體解析異常',
    errorDismissAria: '關閉錯誤提示',
    workerRuntimeError: 'Web Worker 執行異常',
    footerNote:
      'Rust + WebAssembly 本機沙盒 (flashraw + ticoraw) · 零網路上傳',

    dropzone: {
      compactTiltUpload: '開啟 RAW',
      compactNoiseUpload: '追加暗幀',
      btnSelectFilesTilt: '選擇 RAW 樣張',
      btnSelectFilesNoise: '批次選擇暗幀 RAW',
      dragHint: '或將相機原始檔案直接拖入此處',
      sectionAriaTilt: '鏡頭光軸樣張匯入區',
      sectionAriaNoise: '感光元件暗幀批次匯入區',
      titleTilt: '匯入光學測試 RAW 樣張',
      titleNoise: '批次匯入多檔 ISO 感光元件暗幀 RAW',
      descTilt:
        '於解馬賽克前的拜耳 G1 / G2 獨立綠通道直接計算黑電平校準 Tenengrad 銳利度與星點 HFR，排除邊角失光干擾，定量分離對稱像場彎曲與焦平面傾斜（Tilt）。',
      descNoise:
        '基於單遍 65,536 桶精確 u16 直方圖逐通道剔除 5σ 熱像素，測算黑電平漂移、讀出雜訊 σ_ADU、工程動態範圍（EV），自動識別雙原生 ISO（HCG）切換轉折點。',
      supportedFormatsLabel: '原生解碼支援',
      tagSony: 'Sony .ARW / .ARQ (X-OCN / ARW 6.0)',
      tagNikon: 'Nikon .NEF (含 HE / HE* TicoRAW)',
      tagCanon: 'Canon .CR3 / .CR2',
      tagDng: 'Adobe .DNG (含 JXL)',
      tagOthers: 'RAF · RW2 · ORF · PEF · 3FR · IIQ',
      privacyBadge: '100% 本機 WebAssembly 記憶體運算 · 零網路上傳',
      unsupportedFormat: (name) =>
        `不支援的檔案格式（${name}）。請拖入相機原始 RAW 檔案（如 .ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF）。`,
      synthTitle: '14-bit 物理合成標定樣張',
      synthDesc: '免實拍檔案，於記憶體即時合成 14-bit RGGB .DNG 驗證完整管線：',
      btnSynthTiltChart: '左上塌陷歪軸測試標板',
      synthTiltChartMeta: '14-bit RGGB · PSF 單側傾斜梯度',
      btnSynthAstro: '天頂星野右上彗差與傾角',
      synthAstroMeta: '星點 HFR 半通量半徑與偏心偵測',
      btnSynthFlatRef: '含 1.4EV 暗角的準直基準',
      synthFlatRefMeta: '驗證強暗角下的零偏置四角銳利度維持',
      btnSynthIsoSeries: '產生 8 檔雙原生 ISO 暗幀序列',
      synthIsoSeriesMeta: 'ISO 100–6400 · 自動捕捉 HCG @ ISO 800 轉折點',
      guideTitle: '實拍取樣規範',
      guideTiltItems: [
        '正對填滿四角的平面高頻目標（遠景建築立面、平整磚牆或天頂星野）',
        '最大光圈全開 + 原生最低 ISO，上腳架關閉防手震，使用電子前簾/電子快門',
        '單點對焦嚴格鎖定畫面正中心（MC），勿重新構圖',
      ],
      guideNoiseItems: [
        '暗處蓋緊機身蓋/鏡頭蓋，並遮蔽光學/電子觀景窗防止雜散漏光',
        'M 模式手動對焦、關閉機內長曝雜訊抑制，快門固定 1/1000s – 1/4000s',
        '依各整檔 ISO（如 100–6400）各拍一張未壓縮或無損壓縮 RAW',
      ],
    },

    tilt: {
      sectionLoupeAria: '九宮格 1:1 像素同步檢視台',
      loupePanelTitle: '九宮格 1:1 像素同步檢視',
      grades: {
        excellent: '光軸準直優異',
        normal_curvature: '光軸置中 · 對稱像場彎曲',
        mild_tilt: '輕度單側偏心 / 傾角',
        severe_tilt: '顯著焦平面傾斜 (Tilt)',
        insufficient_texture: '局部高頻紋理不足',
      },
      validities: {
        valid: '有效紋理',
        low_texture: '低反差',
        underexposed: '欠曝',
        clipped: '高光溢出',
      },
      zoomGroupAria: '最近鄰放大倍率',
      dragModeGroupAria: '視口拖曳模式',
      dragSyncPan: '同步平移',
      dragSyncPanTitle: '拖曳任意視口可 9 窗同步微移檢視像素細節',
      dragRelocateRoi: '微調取樣',
      dragRelocateRoiTitle:
        '單獨微調某個視口的取樣座標（如避開純色天空對準磚縫或星點）並即時重算銳利度',
      reticleToggle: (on) => `十字線 ${on ? '開' : '關'}`,
      resetStations: '重設',
      resetStationsTitle: '重設九宮格標準取樣座標與平移偏移',
      renderChannelLabel: '通道',
      patchModes: {
        0: '1:1 色彩解馬賽克 (sRGB)',
        1: '解馬賽克前純綠通道 (規避倍率色差)',
        2: '原始拜耳 CFA 陣列',
      },
      patchModesShort: {
        0: 'sRGB 色彩',
        1: 'G1/G2 純綠',
        2: 'Bayer 陣列',
      },
      evBoostLabel: '增亮',
      evResetHint: '點擊數值重設至 0.00 EV',
      hudCenterRef: '100% 基準',
      hudCenterInvalid: (v) => `中心·${v}`,
      hudInvalidRef: '基準無效',
      hudRetention: (pct) => `${pct}%`,
      loupeHint:
        '拖曳視口可九窗同步平移；按住 Shift 拖曳或點擊右側熱力圖可單獨移動局部取樣窗。',
      mobileLoupeHint:
        '點按任意九宮格區域可放大檢視 1:1 像素與完整銳利度 / HFR 讀數。',
      mobileBackToGrid: '返回 3×3',
      mobilePrevStationAria: '上一個取樣窗',
      mobileNextStationAria: '下一個取樣窗',
      mobileInspectTileAria: (id) => `放大檢視 ${id} 取樣窗`,
      mobileCoordsLabel: 'ROI 座標',
      nearestNeighborBadge: '1:1 最近鄰無插值渲染',

      overviewSectionAria: '全片幅縮圖與 5x5 銳利度等高線熱力圖',
      overviewTitle: '全片幅像場 / 傾角場圖 (5×5)',
      btnHideHeatmap: '熱力圖 開',
      btnShowHeatmap: '熱力圖 關',
      legendCollapse: '塌陷 <30%',
      legendCenterPeak: '中心峰值 100%',
      legendOverPeakHint: '>100% = 銳利度高於中心',

      collimationSectionAria: '光軸傾斜向量與四角維持率指標',
      verdictHeader: '準直診斷結論',
      compassAria: '焦平面傾斜極座標羅盤',
      compassTop: '上',
      compassBottom: '下',
      metricTiltMag: 'Tilt 傾角量值',
      metricCollapseDir: '劣化塌陷方位',
      metricCollapseAngle: '塌陷方位角',
      metricRadialFalloff: '徑向對稱像場',
      metricCenterSharpness: '中心綠通道銳利度',

      cornerRetentionTitle: '四角銳利度維持率',
      cornerMean: (pct) => `平均 ${pct}%`,
      cornerLabels: {
        tl: '左上 TL',
        tr: '右上 TR',
        bl: '左下 BL',
        br: '右下 BR',
      },
      diagDiffTlBr: '|TL − BR| 對角差',
      diagDiffTrBl: '|TR − BL| 對角差',

      activeStationTitle: '目前選取取樣窗',
      metricG1G2: 'G1 / G2 子平面銳利度',
      metricSignalClip: '訊號均值 / 過曝率',
      metricStarHfr: '偵測星點 / 中位 HFR',
      notesHeader: '光學診斷附註',
    },

    noise: {
      reportTitle: (cam) => `${cam} · 感光元件底噪與動態範圍標定`,
      frameCountBadge: (n) => `${n} 幀樣本`,
      inflectionBadge: (fromIso, toIso, dropPct, reboundEv) =>
        `HCG 雙增益轉折 ISO ${fromIso}→${toIso} (底噪 −${dropPct}% · DR +${reboundEv} EV)`,
      btnExportCsv: '匯出 CSV',
      btnExportJson: '匯出 JSON',
      btnClearSeries: '清空',
      exportDialogCsvTitle: '匯出 CSV 標定報告',
      exportDialogJsonTitle: '匯出 JSON 標定資料',

      kpiBaseNoise: '最低讀出雜訊',
      kpiPeakDr: '峰值工程動態範圍',
      kpiGainArch: '轉換增益架構',
      kpiSingleGain: '單斜率線性增益',
      kpiDualGain: (iso) => `雙原生 HCG @ ISO ${iso}`,
      kpiMeanBlDrift: '平均黑電平偏移',

      chartSectionAria: '雙軸讀出雜訊與動態範圍互動曲線',
      chartPanelTitle: 'ISO 讀出雜訊與工程動態範圍曲線',
      axisRawAduBtn: '原始 σ_ADU',
      axisIso100Btn: 'ISO 100 等效底噪',
      legendNoiseSolid: '讀出雜訊 σ (左軸)',
      legendDrDashed: '動態範圍 EV (右軸)',
      channelMean: '平均',
      channelAll: '四通道',
      svgAria: 'ISO 雜訊與動態範圍折線圖',
      isoUnknownShort: '未知',
      isoUnknownFull: 'ISO 未知',
      leftAxisRawTitle: '← 讀出雜訊 σ_ADU (Log2)',
      leftAxisNormTitle: '← ISO 100 等效輸入雜訊 ADU (Log2)',
      rightAxisDrTitle: '工程動態範圍 DR (EV) →',
      bottomAxisIsoTitle: '感光度 ISO (Log2 等級距)',

      frameDetailHint: '單幀四通道遙測',
      prevFrameAria: '上一檔 ISO 樣本',
      nextFrameAria: '下一檔 ISO 樣本',
      integrityAlertTitle: '暗幀完整性校驗提示',
      channelCardTitle: (ch) => ch,
      deltaBlLabel: 'ΔBL',
      hotPixelsRejectedLabel: '5σ 熱像素',
      g1HistTitle: 'G1 黑電平附近 ADU 分佈',
      nominalBlLabel: (adu) => `BL ${adu} ADU`,

      tableTitle: '多檔 ISO 感光元件標定台帳',
      colIso: 'ISO',
      colFilename: '檔案名稱',
      colNominalBl: '標稱 BL',
      colMeanDeltaBl: '平均 ΔBL',
      colMeanSigma: '平均 σ_ADU',
      colIso100Norm: 'ISO 100 歸一化',
      colDrEv: '工程 DR',
      colHotPixels: '5σ 熱像素',
      colValidation: '校驗',
      badgeZeroClipped: '零點截斷',
      badgeLightLeak: '疑似漏光',
      badgeCleanDark: '純淨暗幀',
    },
  },

  en: {
    windowTitle: 'collima — Camera Sensor & Lens Optical Collimation Workbench',
    metaDescription:
      'Local-first camera RAW optical diagnostics workbench powered by Rust & WebAssembly: 9-zone 1:1 focal-plane tilt & field curvature inspection, plus Dual Native ISO read-noise (ADU) & Engineering Dynamic Range (EV) calibration.',
    brandSubtitle: 'Optical & Sensor Metrology',
    navAriaLabel: 'Diagnostic mode switcher',
    tabTiltLabel: 'Optical Tilt',
    tabNoiseLabel: 'Sensor Noise',
    btnBackToBench: 'Close Frame',
    presetsMenuLabel: 'Synthetic Presets',
    themeDarkLabel: 'Switch to Daylight Lab theme',
    themeLightLabel: 'Switch to Neutral Darkroom theme',
    statusReady: 'Engine Ready',
    langMenuAriaLabel: 'Switch interface language',
    githubSourceLabel: 'GitHub Source',
    githubSourceAriaLabel: 'View collima source repository on GitHub',

    telemetryRegionAria: 'RAW metadata and decode telemetry',
    telemetryLens: 'Lens',
    telemetryManualExposure: 'Manual Exposure',
    telemetryActiveArea: 'Active Area',
    telemetryDecodeTime: (ms) => `${ms} ms`,

    errorTitle: 'In-Memory RAW Decode Error',
    errorDismissAria: 'Dismiss error alert',
    workerRuntimeError: 'Web Worker runtime error',
    footerNote:
      'Rust + WebAssembly Local Sandbox (flashraw + ticoraw) · Zero Upload',

    dropzone: {
      compactTiltUpload: 'Open RAW',
      compactNoiseUpload: 'Add Dark RAWs',
      btnSelectFilesTilt: 'Select RAW Frame',
      btnSelectFilesNoise: 'Select Dark Frame RAWs',
      dragHint: 'or drag camera RAW files directly onto the bench',
      sectionAriaTilt: 'Optical test RAW dropzone',
      sectionAriaNoise: 'Sensor dark-frame batch dropzone',
      titleTilt: 'Open Optical Test RAW Frame',
      titleNoise: 'Import Multi-ISO Sensor Dark Frames',
      descTilt:
        'Measures black-level-calibrated Tenengrad sharpness and star HFR directly on pre-demosaic G1 / G2 planes, decoupling symmetric field curvature from mount/element tilt.',
      descNoise:
        'Computes exact 65,536-bin u16 histograms per Bayer channel with iterative 5σ hot-pixel rejection to characterize black drift, read noise σ_ADU, Engineering DR (EV), and Dual Native ISO switches.',
      supportedFormatsLabel: 'Supported RAW Codecs',
      tagSony: 'Sony .ARW / .ARQ (X-OCN / ARW 6.0)',
      tagNikon: 'Nikon .NEF (incl. HE / HE* TicoRAW)',
      tagCanon: 'Canon .CR3 / .CR2',
      tagDng: 'Adobe .DNG (incl. JXL)',
      tagOthers: 'RAF · RW2 · ORF · PEF · 3FR · IIQ',
      privacyBadge: '100% Local WebAssembly Memory · Zero Cloud Upload',
      unsupportedFormat: (name) =>
        `Unsupported file format (${name}). Please drop a camera RAW file (e.g. .ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF).`,
      synthTitle: '14-bit Synthetic Calibration Suite',
      synthDesc: 'Synthesize calibrated 14-bit RGGB .DNG streams in memory to inspect the pipeline instantly:',
      btnSynthTiltChart: 'Top-Left Mount Tilt Test Chart',
      synthTiltChartMeta: '14-bit RGGB · Asymmetric PSF Tilt Plane',
      btnSynthAstro: 'Starfield Top-Right Coma & Tilt',
      synthAstroMeta: 'Sub-pixel Star HFR & Off-Axis Aberration',
      btnSynthFlatRef: 'Collimated Reference (1.4 EV Vignette)',
      synthFlatRefMeta: 'Zero-Bias Corner Retention Under Vignetting',
      btnSynthIsoSeries: '8-Stop Dual Native ISO Dark Series',
      synthIsoSeriesMeta: 'ISO 100–6400 · Auto-Detects HCG @ ISO 800',
      guideTitle: 'Capture Protocol',
      guideTiltItems: [
        'Frame a planar textured target orthogonal to the optical axis (distant facade, brick wall, or zenith starfield)',
        'Shoot wide-open at max aperture + base native ISO on a tripod with IBIS off and EFCS/electronic shutter',
        'Lock focus strictly on the center point (MC) without focus-and-recompose',
      ],
      guideNoiseItems: [
        'Attach body/lens cap and cover the viewfinder in a dim room to prevent light leaks',
        'Set Manual mode + MF, disable Long Exposure NR, and fix shutter speed at 1/1000s – 1/4000s',
        'Capture one uncompressed or lossless RAW per full ISO stop (e.g. ISO 100 – 6400)',
      ],
    },

    tilt: {
      sectionLoupeAria: '9-zone synchronized 1:1 sensor pixel loupe',
      loupePanelTitle: '9-Zone 1:1 Pixel Loupe',
      grades: {
        excellent: 'Excellent Collimation',
        normal_curvature: 'Centered Axis · Normal Curvature',
        mild_tilt: 'Mild Asymmetry / Tilt',
        severe_tilt: 'Significant Focal-Plane Tilt',
        insufficient_texture: 'Insufficient Local Texture',
      },
      validities: {
        valid: 'Valid',
        low_texture: 'Low Texture',
        underexposed: 'Underexposed',
        clipped: 'Clipped',
      },
      zoomGroupAria: 'Nearest-neighbor zoom factor',
      dragModeGroupAria: 'Loupe pointer drag mode',
      dragSyncPan: 'Sync Pan',
      dragSyncPanTitle: 'Drag any loupe cell to pan all 9 viewports in lockstep',
      dragRelocateRoi: 'Move ROI',
      dragRelocateRoiTitle:
        'Move an individual station ROI box (e.g. away from blank sky onto textured detail) and recompute sharpness live',
      reticleToggle: (on) => `Reticle ${on ? 'On' : 'Off'}`,
      resetStations: 'Reset',
      resetStationsTitle: 'Reset all 9 sampling stations and pan offset to default',
      renderChannelLabel: 'Signal',
      patchModes: {
        0: '1:1 Demosaiced Color (sRGB)',
        1: 'Pre-Demosaic Green (Zero Lateral CA)',
        2: 'Raw Bayer CFA Mosaic',
      },
      patchModesShort: {
        0: 'sRGB',
        1: 'G1/G2 Green',
        2: 'Bayer CFA',
      },
      evBoostLabel: 'EV',
      evResetHint: 'Click readout to reset to 0.00 EV',
      hudCenterRef: '100% REF',
      hudCenterInvalid: (v) => `Center · ${v}`,
      hudInvalidRef: 'Invalid Ref',
      hudRetention: (pct) => `${pct}%`,
      loupeHint:
        'Drag to sync-pan all 9 loupes; Shift-drag or click the overview map to relocate a single ROI.',
      mobileLoupeHint:
        'Tap any tile to inspect 1:1 pixels with full HFR & sharpness readout.',
      mobileBackToGrid: '3×3 Grid',
      mobilePrevStationAria: 'Previous station',
      mobileNextStationAria: 'Next station',
      mobileInspectTileAria: (id) => `Inspect station ${id} in single-loupe view`,
      mobileCoordsLabel: 'ROI Coords',
      nearestNeighborBadge: '1:1 Nearest-Neighbor · Zero Interpolation',

      overviewSectionAria: 'Full-frame overview and 5x5 sharpness contour heatmap',
      overviewTitle: 'Field Map (5×5 Contour)',
      btnHideHeatmap: 'Heatmap On',
      btnShowHeatmap: 'Heatmap Off',
      legendCollapse: 'Collapse <30%',
      legendCenterPeak: 'Center 100%',
      legendOverPeakHint: '>100% = sharper than center',

      collimationSectionAria: 'Optical tilt vector and 4-corner retention telemetry',
      verdictHeader: 'Collimation Verdict',
      compassAria: 'Focal-plane tilt polar compass',
      compassTop: 'TOP',
      compassBottom: 'BTM',
      metricTiltMag: 'Tilt Magnitude',
      metricCollapseDir: 'Collapse Direction',
      metricCollapseAngle: 'Collapse Azimuth',
      metricRadialFalloff: 'Radial Curvature',
      metricCenterSharpness: 'Center G Sharpness',

      cornerRetentionTitle: 'Corner Sharpness Retention',
      cornerMean: (pct) => `Mean ${pct}%`,
      cornerLabels: {
        tl: 'Top-Left TL',
        tr: 'Top-Right TR',
        bl: 'Bottom-Left BL',
        br: 'Bottom-Right BR',
      },
      diagDiffTlBr: '|TL − BR| Diagonal Δ',
      diagDiffTrBl: '|TR − BL| Diagonal Δ',

      activeStationTitle: 'Selected Station',
      metricG1G2: 'G1 / G2 Sub-planes',
      metricSignalClip: 'Mean Signal / Clip',
      metricStarHfr: 'Detected Stars / HFR',
      notesHeader: 'Diagnostic Notes',
    },

    noise: {
      reportTitle: (cam) => `${cam} · Sensor Read-Noise & Dynamic Range`,
      frameCountBadge: (n) => `${n} ${n === 1 ? 'Frame' : 'Frames'}`,
      inflectionBadge: (fromIso, toIso, dropPct, reboundEv) =>
        `HCG Switch ISO ${fromIso}→${toIso} (Noise −${dropPct}% · DR +${reboundEv} EV)`,
      btnExportCsv: 'Export CSV',
      btnExportJson: 'Export JSON',
      btnClearSeries: 'Clear',
      exportDialogCsvTitle: 'Export CSV Calibration Report',
      exportDialogJsonTitle: 'Export JSON Calibration Data',

      kpiBaseNoise: 'Lowest Read Noise',
      kpiPeakDr: 'Peak Engineering DR',
      kpiGainArch: 'Gain Architecture',
      kpiSingleGain: 'Single-Slope Linear',
      kpiDualGain: (iso) => `Dual-Gain HCG @ ISO ${iso}`,
      kpiMeanBlDrift: 'Mean Black Drift',

      chartSectionAria: 'Dual-axis read noise and dynamic range chart',
      chartPanelTitle: 'ISO Read Noise & Engineering Dynamic Range',
      axisRawAduBtn: 'Raw σ_ADU',
      axisIso100Btn: 'ISO 100 Input-Referred',
      legendNoiseSolid: 'Read Noise σ (Left)',
      legendDrDashed: 'Dynamic Range EV (Right)',
      channelMean: 'Mean',
      channelAll: '4-Ch',
      svgAria: 'ISO read noise and dynamic range line chart',
      isoUnknownShort: 'N/A',
      isoUnknownFull: 'ISO Unknown',
      leftAxisRawTitle: '← Read Noise σ_ADU (Log2)',
      leftAxisNormTitle: '← ISO 100 Input Noise ADU (Log2)',
      rightAxisDrTitle: 'Engineering DR (EV) →',
      bottomAxisIsoTitle: 'Sensitivity ISO (Log2 Equal-Stop Axis)',

      frameDetailHint: 'Frame 4-Channel Telemetry',
      prevFrameAria: 'Previous ISO frame',
      nextFrameAria: 'Next ISO frame',
      integrityAlertTitle: 'Dark-Frame Integrity Notice',
      channelCardTitle: (ch) => ch,
      deltaBlLabel: 'ΔBL',
      hotPixelsRejectedLabel: '5σ Hot px',
      g1HistTitle: 'G1 Black-Level ADU Distribution',
      nominalBlLabel: (adu) => `BL ${adu} ADU`,

      tableTitle: 'Multi-ISO Calibration Ledger',
      colIso: 'ISO',
      colFilename: 'File',
      colNominalBl: 'Nominal BL',
      colMeanDeltaBl: 'Mean ΔBL',
      colMeanSigma: 'Mean σ_ADU',
      colIso100Norm: 'ISO 100 Norm',
      colDrEv: 'Eng. DR',
      colHotPixels: '5σ Hot Pixels',
      colValidation: 'Integrity',
      badgeZeroClipped: 'Zero Clipped',
      badgeLightLeak: 'Light Leak?',
      badgeCleanDark: 'Clean Dark',
    },
  },

  ja: {
    windowTitle: 'collima — カメラセンサー＆レンズ光軸・片ボケ光学診断ワークベンチ',
    metaDescription:
      'Rust + WebAssembly 駆動の完全ローカル RAW 光学診断ワークベンチ：レンズの片ボケ（光軸ズレ・像面傾斜）と像面湾曲の9分割等倍検査、デュアルネイティブISO読み出しノイズ（ADU）・工学ダイナミックレンジ（EV）計測に対応。',
    brandSubtitle: '光学アライメント＆センサー計測',
    navAriaLabel: '診断モード切替',
    tabTiltLabel: '片ボケ・光軸検査',
    tabNoiseLabel: 'ノイズ・デュアルISO',
    btnBackToBench: '閉じる',
    presetsMenuLabel: '合成サンプル',
    themeDarkLabel: 'ライトモードへ切替',
    themeLightLabel: 'ダークルームへ切替',
    statusReady: 'エンジン待機中',
    langMenuAriaLabel: '表示言語を切り替え',
    githubSourceLabel: 'GitHub ソース',
    githubSourceAriaLabel: 'GitHub で collima のソースコードを表示',

    telemetryRegionAria: 'RAW メタデータおよびデコード情報',
    telemetryLens: 'レンズ',
    telemetryManualExposure: 'マニュアル露出',
    telemetryActiveArea: '有効画素',
    telemetryDecodeTime: (ms) => `${ms} ms`,

    errorTitle: 'RAW メモリ解析エラー',
    errorDismissAria: 'エラー通知を閉じる',
    workerRuntimeError: 'Web Worker 実行エラー',
    footerNote:
      'Rust + WebAssembly ローカルサンドボックス (flashraw + ticoraw) · 外部送信ゼロ',

    dropzone: {
      compactTiltUpload: 'RAWを開く',
      compactNoiseUpload: 'ダーク追加',
      btnSelectFilesTilt: 'RAWファイルを選択',
      btnSelectFilesNoise: 'ダークRAWを一括選択',
      dragHint: 'またはカメラのRAWファイルをここへドロップ',
      sectionAriaTilt: 'レンズ光学テストRAWドロップ領域',
      sectionAriaNoise: 'センサーダークフレーム一括ドロップ領域',
      titleTilt: '光学テスト用 RAW を読み込む',
      titleNoise: '複数ISO感度のダークフレーム RAW を読み込む',
      descTilt:
        'デモザイク前の独立した G1 / G2 チャンネルから黒レベル補正済み Tenengrad 先鋭度と星像 HFR を直接算出し、周辺減光を排除して正常な像面湾曲と片ボケ（Tilt）を定量分離します。',
      descNoise:
        '1パス 65,536 ビン厳密 u16 ヒストグラムで各チャンネルの 5σ ホットピクセルを除外し、黒レベル誤差・読み出しノイズ σ_ADU・工学ダイナミックレンジ（EV）・HCG 切替点を計測します。',
      supportedFormatsLabel: '対応RAWフォーマット',
      tagSony: 'Sony .ARW / .ARQ (X-OCN / ARW 6.0)',
      tagNikon: 'Nikon .NEF (HE / HE* TicoRAW対応)',
      tagCanon: 'Canon .CR3 / .CR2',
      tagDng: 'Adobe .DNG (JXL対応)',
      tagOthers: 'RAF · RW2 · ORF · PEF · 3FR · IIQ',
      privacyBadge: '100% ローカル WebAssembly メモリ処理 · 外部送信ゼロ',
      unsupportedFormat: (name) =>
        `未対応のファイル形式です（${name}）。カメラの RAW ファイル（.ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF など）をドロップしてください。`,
      synthTitle: '14-bit 物理合成キャリブレーション',
      synthDesc: '実写RAWなしで 14-bit RGGB .DNG をメモリ合成し即座に検証：',
      btnSynthTiltChart: '左上片ボケ傾斜テストチャート',
      synthTiltChartMeta: '14-bit RGGB · 非対称PSF傾斜プレーン',
      btnSynthAstro: '星景・右上コマ収差と像面傾斜',
      synthAstroMeta: '星像 HFR 半値半径と周辺収差検出',
      btnSynthFlatRef: '周辺減光 1.4EV 付き合焦基準',
      synthFlatRefMeta: '周辺減光下での無バイアス四隅維持率検証',
      btnSynthIsoSeries: '8段デュアルネイティブISOダーク系列',
      synthIsoSeriesMeta: 'ISO 100–6400 · HCG @ ISO 800 切替自動検出',
      guideTitle: 'テスト撮影ガイド',
      guideTiltItems: [
        '四隅まで均一な平面ターゲット（遠景ビル壁面・レンガ壁・天頂星景）に正対',
        '絞り開放 + 最低ベースISO、三脚固定・手ブレ補正OFF・電子先幕/電子シャッター',
        '画面中央（MC）で厳密にピント固定（フォーカスロック後の構図ずらし不可）',
      ],
      guideNoiseItems: [
        '暗所でボディキャップ装着＆ファインダーを遮光し迷光混入を防止',
        'Mモード + MF・長秒時NRオフ、シャッター速度 1/1000s – 1/4000s 固定',
        '各ISO段（例：100〜6400）で非圧縮またはロスレス圧縮 RAW を1枚ずつ撮影',
      ],
    },

    tilt: {
      sectionLoupeAria: '9分割 1:1 ピクセル同期ルーペ検査台',
      loupePanelTitle: '9分割 1:1 等倍同期ルーペ',
      grades: {
        excellent: '光軸・合焦ともに極めて良好',
        normal_curvature: '光軸良好 · 対称的な像面湾曲',
        mild_tilt: '軽微な非対称 / 片ボケ傾向',
        severe_tilt: '顕著な像面傾斜・片ボケ (Tilt)',
        insufficient_texture: '高周波テクスチャ不足',
      },
      validities: {
        valid: '有効',
        low_texture: '平坦部',
        underexposed: '露出不足',
        clipped: '白飛び',
      },
      zoomGroupAria: 'ニアレストネイバー拡大倍率',
      dragModeGroupAria: 'ルーペドラッグ操作モード',
      dragSyncPan: '同期パン',
      dragSyncPanTitle: '任意のルーペをドラッグして9箇所すべてを同期スクロール比較します',
      dragRelocateRoi: '枠移動',
      dragRelocateRoiTitle:
        '個別の測定枠（空などの平坦部を避けて壁目地や星像へ）を移動しリアルタイム再計算します',
      reticleToggle: (on) => `レチクル ${on ? 'ON' : 'OFF'}`,
      resetStations: 'リセット',
      resetStationsTitle: '9分割測定枠の座標とスクロール位置を初期状態に戻します',
      renderChannelLabel: '表示',
      patchModes: {
        0: '1:1 カラーデモザイク (sRGB)',
        1: 'デモザイク前Gチャンネル (倍率色収差を排除)',
        2: 'RAW ベイヤー CFA 配列',
      },
      patchModesShort: {
        0: 'sRGB',
        1: 'G1/G2 緑単色',
        2: 'Bayer CFA',
      },
      evBoostLabel: 'EV',
      evResetHint: 'クリックで 0.00 EV にリセット',
      hudCenterRef: '100% 基準',
      hudCenterInvalid: (v) => `中央·${v}`,
      hudInvalidRef: '基準無効',
      hudRetention: (pct) => `${pct}%`,
      loupeHint:
        'ドラッグで9窓同期移動。Shift+ドラッグまたは全体マップクリックで個別の測定枠を移動。',
      mobileLoupeHint:
        '各枠をタップすると 1:1 等倍と詳細な先鋭度・HFR を拡大表示します。',
      mobileBackToGrid: '3×3 に戻る',
      mobilePrevStationAria: '前の測定枠',
      mobileNextStationAria: '次の測定枠',
      mobileInspectTileAria: (id) => `測定枠 ${id} を拡大表示`,
      mobileCoordsLabel: 'ROI 座標',
      nearestNeighborBadge: '1:1 ニアレストネイバー無補間描画',

      overviewSectionAria: 'フルサイズ全体図と 5x5 先鋭度等高線ヒートマップ',
      overviewTitle: 'フィールドマップ (5×5 等高線)',
      btnHideHeatmap: 'ヒートマップ ON',
      btnShowHeatmap: 'ヒートマップ OFF',
      legendCollapse: '低下 <30%',
      legendCenterPeak: '中央 100%',
      legendOverPeakHint: '>100% = 中央より高先鋭',

      collimationSectionAria: '像面傾斜ベクトルと四隅維持率指標',
      verdictHeader: '光学診断結果',
      compassAria: '像面傾斜極座標コンパス',
      compassTop: '上',
      compassBottom: '下',
      metricTiltMag: 'Tilt ベクトル量',
      metricCollapseDir: '解像低下方向',
      metricCollapseAngle: '低下方位角',
      metricRadialFalloff: '対称像面湾曲項',
      metricCenterSharpness: '中央G先鋭度',

      cornerRetentionTitle: '四隅先鋭度維持率',
      cornerMean: (pct) => `平均 ${pct}%`,
      cornerLabels: {
        tl: '左上 TL',
        tr: '右上 TR',
        bl: '左下 BL',
        br: '右下 BR',
      },
      diagDiffTlBr: '|TL − BR| 対角差',
      diagDiffTrBl: '|TR − BL| 対角差',

      activeStationTitle: '選択中の測定枠',
      metricG1G2: 'G1 / G2 サブプレーン',
      metricSignalClip: '平均信号 / 白飛び率',
      metricStarHfr: '検出星数 / 中央値 HFR',
      notesHeader: '診断ノート',
    },

    noise: {
      reportTitle: (cam) => `${cam} · 読み出しノイズ＆ダイナミックレンジ計測`,
      frameCountBadge: (n) => `${n} フレーム`,
      inflectionBadge: (fromIso, toIso, dropPct, reboundEv) =>
        `HCG 切替点 ISO ${fromIso}→${toIso} (ノイズ −${dropPct}% · DR +${reboundEv} EV)`,
      btnExportCsv: 'CSV 出力',
      btnExportJson: 'JSON 出力',
      btnClearSeries: 'クリア',
      exportDialogCsvTitle: 'CSV キャリブレーションレポートを保存',
      exportDialogJsonTitle: 'JSON キャリブレーションデータを保存',

      kpiBaseNoise: '最小読み出しノイズ',
      kpiPeakDr: '最大工学DR',
      kpiGainArch: 'ゲイン構成',
      kpiSingleGain: 'シングルゲイン線形',
      kpiDualGain: (iso) => `デュアル HCG @ ISO ${iso}`,
      kpiMeanBlDrift: '平均黒レベル誤差',

      chartSectionAria: '読み出しノイズ・ダイナミックレンジ2軸グラフ',
      chartPanelTitle: 'ISO 読み出しノイズ ＆ 工学ダイナミックレンジ',
      axisRawAduBtn: '生ノイズ σ_ADU',
      axisIso100Btn: 'ISO 100 入力換算',
      legendNoiseSolid: '読み出しノイズ σ (左軸)',
      legendDrDashed: 'ダイナミックレンジ EV (右軸)',
      channelMean: '平均',
      channelAll: '4ch',
      svgAria: 'ISO ノイズとダイナミックレンジの折れ線グラフ',
      isoUnknownShort: '不明',
      isoUnknownFull: 'ISO 不明',
      leftAxisRawTitle: '← 読み出しノイズ σ_ADU (Log2)',
      leftAxisNormTitle: '← ISO 100 入力換算ノイズ ADU (Log2)',
      rightAxisDrTitle: '工学ダイナミックレンジ DR (EV) →',
      bottomAxisIsoTitle: 'ISO 感度 (Log2 等段数軸)',

      frameDetailHint: 'フレーム 4ch 詳細',
      prevFrameAria: '前のISOフレーム',
      nextFrameAria: '次のISOフレーム',
      integrityAlertTitle: 'ダークフレーム品質通知',
      channelCardTitle: (ch) => ch,
      deltaBlLabel: 'ΔBL',
      hotPixelsRejectedLabel: '5σ 除外',
      g1HistTitle: 'G1 黒レベル周辺 ADU 分布',
      nominalBlLabel: (adu) => `BL ${adu} ADU`,

      tableTitle: 'マルチISO キャリブレーション一覧',
      colIso: 'ISO',
      colFilename: 'ファイル名',
      colNominalBl: '公称 BL',
      colMeanDeltaBl: '平均 ΔBL',
      colMeanSigma: '平均 σ_ADU',
      colIso100Norm: 'ISO 100 換算',
      colDrEv: '工学 DR',
      colHotPixels: '5σ ホットピクセル',
      colValidation: '品質判定',
      badgeZeroClipped: 'ゼロクリップ',
      badgeLightLeak: '遮光漏れ疑い',
      badgeCleanDark: '正常ダーク',
    },
  },
};
