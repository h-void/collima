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
  langMenuAriaLabel: string;

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
    sectionAriaTilt: string;
    sectionAriaNoise: string;
    titleTilt: string;
    titleNoise: string;
    descTilt: string;
    descNoise: string;
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
    btnSynthAstro: string;
    btnSynthFlatRef: string;
    btnSynthIsoSeries: string;
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
    evBoostLabel: string;
    hudCenterRef: string;
    hudCenterInvalid: (validityLabel: string) => string;
    hudInvalidRef: string;
    hudRetention: (pct: number) => string;
    loupeHint: string;
    nearestNeighborBadge: string;

    overviewSectionAria: string;
    overviewTitle: string;
    btnHideHeatmap: string;
    btnShowHeatmap: string;
    legendCollapse: string;
    legendCenterPeak: string;

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

    chartSectionAria: string;
    chartPanelTitle: string;
    axisRawAduBtn: string;
    axisIso100Btn: string;
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
    brandSubtitle: '相机镜头光轴与传感器底噪诊断工作台',
    navAriaLabel: '诊断模式切换',
    tabTiltLabel: 'Optical Tilt · 光轴与场曲检视',
    tabNoiseLabel: 'Sensor Noise · 底噪与双原生 ISO',
    btnBackToBench: '返回标定台',
    langMenuAriaLabel: '切换界面语言',

    telemetryRegionAria: 'RAW 元数据与解码遥测',
    telemetryLens: '镜头',
    telemetryManualExposure: '手动曝光元数据',
    telemetryActiveArea: '有效画幅',
    telemetryDecodeTime: (ms) => `解码 ${ms} ms`,

    errorTitle: 'RAW 内存解析异常',
    errorDismissAria: '关闭错误提示',
    workerRuntimeError: 'Web Worker 运行异常',
    footerNote:
      'collima Optical & Sensor Metrology Workbench · Rust + WebAssembly (flashraw Sony X-OCN [ARW 6.0] / CR3 / DNG + ticoraw Nikon HE/HE*) · 所有原始图像字节流仅在本地沙箱内存运算',

    dropzone: {
      compactTiltUpload: '载入新样张',
      compactNoiseUpload: '追加暗帧 RAW',
      sectionAriaTilt: '镜头光轴样张导入区',
      sectionAriaNoise: '传感器暗帧批量导入区',
      titleTilt: '拖入单张光学测试 RAW 样张（标板 / 远景建筑 / 砖墙 / 星野）',
      titleNoise: '批量拖入多档 ISO 传感器暗帧 RAW（盖紧镜头盖与取景器遮光片）',
      descTilt:
        '直接在去马赛克前的拜耳 G1 / G2 独立绿通道上提取黑电平校准 Tenengrad 锐度与星点 HFR，剥离暗角干扰，定量分离正常场曲与卡口/镜组光轴倾斜（Tilt）。',
      descNoise:
        '基于单遍 65,536 桶精确 u16 直方图逐通道（R / G1 / G2 / B）剥离 5σ 热像素，测算黑电平漂移、读出噪声 σ_ADU、工程动态范围（EV）并自动捕获双原生 ISO 增益切换拐点。',
      tagSony: 'Sony .ARW / .ARQ (含 A7M5/A7R6 X-OCN 已压缩 HQ · Pixel Shift)',
      tagNikon: 'Nikon .NEF (含 Z9/Z8/Z6III/ZR HE & HE* TicoRAW)',
      tagCanon: 'Canon .CR3 / .CR2',
      tagDng: 'Adobe .DNG (含 JXL)',
      tagOthers: 'Fujifilm .RAF · Lumix/Leica .RW2 · OM .ORF · Pentax .PEF',
      privacyBadge: '100% 本地 WebAssembly 内存解码 · 零网络上传 · Web Worker 零拷贝渲染',
      unsupportedFormat: (name) =>
        `不支持的文件格式（${name}）。请拖入相机原始 RAW 文件（如 .ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF）。`,
      synthTitle: '内置 14-bit 物理合成标定套件（免样张即刻验证算法）',
      synthDesc:
        '在 WASM 内存中实时合成带精确 PSF 散焦梯度、暗角、散粒/读出噪声与双增益跳变的未压缩 14-bit RGGB .DNG 原始流并送入完整解码管线。',
      btnSynthTiltChart: '模拟左上塌陷斜轴标板',
      btnSynthAstro: '模拟星野右上彗差/倾斜',
      btnSynthFlatRef: '模拟带 1.4EV 暗角的合焦基准',
      btnSynthIsoSeries: '生成 8 档双原生 ISO 暗帧序列 (ISO 100–6400, HCG @ 800)',
    },

    tilt: {
      sectionLoupeAria: '九宫格 1:1 像素同步检视台',
      loupePanelTitle: '九宫格 1:1 传感器像素同步放大检视台',
      grades: {
        excellent: '光轴合焦优异',
        normal_curvature: '光轴居中 · 正常对称场曲',
        mild_tilt: '轻度单侧偏心 / 倾角',
        severe_tilt: '显著焦平面倾斜 (Tilt)',
        insufficient_texture: '局部高频纹理不足',
      },
      validities: {
        valid: '有效纹理',
        low_texture: '低反差/纯色',
        underexposed: '欠曝信噪比低',
        clipped: '高光溢出',
      },
      zoomGroupAria: '最近邻放大倍率',
      dragModeGroupAria: '视口拖拽模式',
      dragSyncPan: '同步平移',
      dragSyncPanTitle: '拖拽任意视口可 9 窗同步微移观察像素细节',
      dragRelocateRoi: '微调采样点',
      dragRelocateRoiTitle:
        '单独微调某个视口的采样坐标（如避开纯色天空对准砖缝或星点）并实时重算锐度',
      reticleToggle: (on) => `十字丝 ${on ? '开' : '关'}`,
      resetStations: '复位采样',
      resetStationsTitle: '复位九宫格标准采样坐标与平移偏移',
      renderChannelLabel: '像素渲染通道：',
      patchModes: {
        0: '1:1 色彩解马赛克 (sRGB)',
        1: '去马赛克前纯绿通道 (规避倍率色差)',
        2: '原始拜耳 CFA 阵列',
      },
      evBoostLabel: '检视提亮',
      hudCenterRef: '100% 中心基准',
      hudCenterInvalid: (v) => `中心·${v}`,
      hudInvalidRef: '基准无效',
      hudRetention: (pct) => `保持率 ${pct}%`,
      loupeHint:
        '操作提示：200% / 400% 下拖拽画面可九窗同步比对边缘劣化；按住 Shift 拖拽（或切换至「微调采样点」/ 点击右侧缩略图）可单独移动局部采样框避开纯色区域。',
      nearestNeighborBadge: '最近邻无插值放大 (imageSmoothingEnabled = false)',

      overviewSectionAria: '全画幅缩略图与 5x5 锐度等高线热力图',
      overviewTitle: '全画幅场曲 / 光轴等高线热力图 (5×5)',
      btnHideHeatmap: '隐藏热力图',
      btnShowHeatmap: '叠加 5×5 热力图',
      legendCollapse: '塌陷 <30%',
      legendCenterPeak: '中心峰值 100%',

      collimationSectionAria: '光轴倾斜向量与四角保持率指标',
      verdictHeader: '光学诊断结论',
      compassAria: '焦平面倾斜极坐标罗盘',
      compassTop: '上 TOP',
      compassBottom: '下 BTM',
      metricTiltMag: 'Tilt 偏移模长',
      metricCollapseDir: '劣化塌陷方位',
      metricCollapseAngle: '塌陷方位角',
      metricRadialFalloff: '径向对称场曲项',
      metricCenterSharpness: '中心绿通道锐度',

      cornerRetentionTitle: '四角相对中心锐度保持率 (Corner Retention)',
      cornerMean: (pct) => `均值 ${pct}%`,
      cornerLabels: {
        tl: '左上 TL',
        tr: '右上 TR',
        bl: '左下 BL',
        br: '右下 BR',
      },
      diagDiffTlBr: '|TL - BR| 对角差',
      diagDiffTrBl: '|TR - BL| 对角差',
    },

    noise: {
      reportTitle: (cam) => `${cam} · 传感器读出噪声与动态范围标定报告`,
      frameCountBadge: (n) => `${n} 张暗帧样本`,
      inflectionBadge: (fromIso, toIso, dropPct, reboundEv) =>
        `双原生 ISO HCG 拐点：ISO ${fromIso} → ISO ${toIso}（等效噪声骤降 ${dropPct}%，动态范围回升 +${reboundEv} EV）`,
      btnExportCsv: '导出 CSV',
      btnExportJson: '导出 JSON',
      btnClearSeries: '清空列表',
      exportDialogCsvTitle: '导出 CSV 标定报告',
      exportDialogJsonTitle: '导出 JSON 标定数据',

      chartSectionAria: '双轴读出噪声与动态范围交互曲线',
      chartPanelTitle: 'ISO 读出噪声 (Log2 ADU) 与工程动态范围 (EV) 双轴曲线',
      axisRawAduBtn: 'σ_ADU 原始读出噪声',
      axisIso100Btn: 'ISO 100 等效输入底噪',
      channelMean: '均值',
      channelAll: '四通道',
      svgAria: 'ISO 噪声与动态范围折线图',
      isoUnknownShort: '未知',
      isoUnknownFull: 'ISO 未知',
      leftAxisRawTitle: '← 左轴：读出噪声 σ_ADU (Log2 对数刻度)',
      leftAxisNormTitle: '← 左轴：ISO 100 等效输入噪声 ADU (Log2)',
      rightAxisDrTitle: '右轴：工程动态范围 Engineering DR (EV, 虚线) →',
      bottomAxisIsoTitle: '感光度 ISO (Log2 等档距坐标)',

      frameDetailHint: '单帧四通道详细遥测（点击图表节点切换）',
      integrityAlertTitle: '暗帧数据完整性提示',
      channelCardTitle: (ch) => `${ch} 通道`,
      deltaBlLabel: 'ΔBL 偏移',
      hotPixelsRejectedLabel: '热像素剔除',
      g1HistTitle: 'G1 通道黑电平附近 ADU 高斯分布直方图',
      nominalBlLabel: (adu) => `标称 BL = ${adu} ADU`,

      tableTitle: '多档 ISO 传感器底噪与动态范围标定明细表',
      colIso: 'ISO',
      colFilename: '样张文件',
      colNominalBl: '标称黑电平',
      colMeanDeltaBl: '均值 ΔBL 偏移',
      colMeanSigma: '四通道均值 σ_ADU',
      colIso100Norm: 'ISO 100 归一化底噪',
      colDrEv: '工程动态范围 (EV)',
      colHotPixels: '剔除 5σ 热像素',
      colValidation: '数据校验',
      badgeZeroClipped: '零点截断',
      badgeLightLeak: '疑似漏光',
      badgeCleanDark: '纯净暗帧',
    },
  },

  'zh-TW': {
    windowTitle: 'collima — 相機感光元件與鏡頭光軸光學診斷工作台',
    metaDescription:
      '基於 Rust + WebAssembly 的純本機相機 RAW 光學診斷工作台：支援鏡頭光軸傾斜（Tilt）與像場彎曲九宮格 1:1 檢視、雙原生 ISO 讀出雜訊（ADU）與工程動態範圍（EV）標定。',
    brandSubtitle: '相機鏡頭光軸與感光元件雜訊診斷工作台',
    navAriaLabel: '診斷模式切換',
    tabTiltLabel: 'Optical Tilt · 光軸與像場檢視',
    tabNoiseLabel: 'Sensor Noise · 底噪與雙原生 ISO',
    btnBackToBench: '返回標定台',
    langMenuAriaLabel: '切換介面語言',

    telemetryRegionAria: 'RAW 中繼資料與解碼遙測',
    telemetryLens: '鏡頭',
    telemetryManualExposure: '手動曝光資訊',
    telemetryActiveArea: '有效畫幅',
    telemetryDecodeTime: (ms) => `解碼 ${ms} ms`,

    errorTitle: 'RAW 記憶體解析異常',
    errorDismissAria: '關閉錯誤提示',
    workerRuntimeError: 'Web Worker 執行異常',
    footerNote:
      'collima Optical & Sensor Metrology Workbench · Rust + WebAssembly (flashraw Sony X-OCN [ARW 6.0] / CR3 / DNG + ticoraw Nikon HE/HE*) · 所有原始影像位元組流僅於本機沙盒記憶體運算',

    dropzone: {
      compactTiltUpload: '載入新樣張',
      compactNoiseUpload: '追加暗幀 RAW',
      sectionAriaTilt: '鏡頭光軸樣張匯入區',
      sectionAriaNoise: '感光元件暗幀批次匯入區',
      titleTilt: '拖入單張光學測試 RAW 樣張（測試標板 / 遠景建築 / 磚牆 / 星野）',
      titleNoise: '批次拖入多檔 ISO 感光元件暗幀 RAW（蓋緊鏡頭蓋與觀景窗遮光片）',
      descTilt:
        '直接於解馬賽克前的拜耳 G1 / G2 獨立綠通道提取黑電平校準 Tenengrad 銳利度與星點 HFR，排除邊角失光（暗角）干擾，定量分離正常像場彎曲與接環/鏡組光軸傾斜（Tilt）。',
      descNoise:
        '基於單遍 65,536 桶精確 u16 直方圖逐通道（R / G1 / G2 / B）剔除 5σ 熱像素，測算黑電平漂移、讀出雜訊 σ_ADU、工程動態範圍（EV）並自動捕捉雙原生 ISO 增益切換轉折點。',
      tagSony: 'Sony .ARW / .ARQ (含 A7M5/A7R6 X-OCN 已壓縮 HQ · Pixel Shift)',
      tagNikon: 'Nikon .NEF (含 Z9/Z8/Z6III/ZR HE & HE* TicoRAW)',
      tagCanon: 'Canon .CR3 / .CR2',
      tagDng: 'Adobe .DNG (含 JXL)',
      tagOthers: 'Fujifilm .RAF · Lumix/Leica .RW2 · OM .ORF · Pentax .PEF',
      privacyBadge: '100% 本機 WebAssembly 記憶體解碼 · 零網路上傳 · Web Worker 零拷貝渲染',
      unsupportedFormat: (name) =>
        `不支援的檔案格式（${name}）。請拖入相機原始 RAW 檔案（如 .ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF）。`,
      synthTitle: '內建 14-bit 物理合成標定套件（免樣張即刻驗證演算法）',
      synthDesc:
        '於 WASM 記憶體即時合成具精確 PSF 散焦梯度、暗角、散粒/讀出雜訊與雙增益跳變的未壓縮 14-bit RGGB .DNG 原始流並送入完整解碼管線。',
      btnSynthTiltChart: '模擬左上塌陷歪軸標板',
      btnSynthAstro: '模擬星野右上彗差/傾斜',
      btnSynthFlatRef: '模擬含 1.4EV 暗角的準焦基準',
      btnSynthIsoSeries: '產生 8 檔雙原生 ISO 暗幀序列 (ISO 100–6400, HCG @ 800)',
    },

    tilt: {
      sectionLoupeAria: '九宮格 1:1 像素同步檢視台',
      loupePanelTitle: '九宮格 1:1 感光元件像素同步放大檢視台',
      grades: {
        excellent: '光軸準焦優異',
        normal_curvature: '光軸置中 · 正常對稱像場彎曲',
        mild_tilt: '輕度單側偏心 / 傾角',
        severe_tilt: '顯著焦平面傾斜 (Tilt)',
        insufficient_texture: '局部高頻紋理不足',
      },
      validities: {
        valid: '有效紋理',
        low_texture: '低反差/純色',
        underexposed: '欠曝訊噪比低',
        clipped: '高光過曝溢出',
      },
      zoomGroupAria: '最近鄰放大倍率',
      dragModeGroupAria: '視口拖曳模式',
      dragSyncPan: '同步平移',
      dragSyncPanTitle: '拖曳任意視口可 9 窗同步微移檢視像素細節',
      dragRelocateRoi: '微調取樣點',
      dragRelocateRoiTitle:
        '單獨微調某個視口的取樣座標（如避開純色天空對準磚縫或星點）並即時重算銳利度',
      reticleToggle: (on) => `十字線 ${on ? '開' : '關'}`,
      resetStations: '重設取樣',
      resetStationsTitle: '重設九宮格標準取樣座標與平移偏移',
      renderChannelLabel: '像素渲染通道：',
      patchModes: {
        0: '1:1 色彩解馬賽克 (sRGB)',
        1: '解馬賽克前純綠通道 (規避倍率色差)',
        2: '原始拜耳 CFA 陣列',
      },
      evBoostLabel: '檢視增亮',
      hudCenterRef: '100% 中心基準',
      hudCenterInvalid: (v) => `中心·${v}`,
      hudInvalidRef: '基準無效',
      hudRetention: (pct) => `維持率 ${pct}%`,
      loupeHint:
        '操作提示：200% / 400% 下拖曳畫面可九窗同步比對邊緣劣化；按住 Shift 拖曳（或切換至「微調取樣點」/ 點擊右側縮圖）可單獨移動局部取樣框避開純色區域。',
      nearestNeighborBadge: '最近鄰無插值放大 (imageSmoothingEnabled = false)',

      overviewSectionAria: '全片幅縮圖與 5x5 銳利度等高線熱力圖',
      overviewTitle: '全片幅像場 / 光軸等高線熱力圖 (5×5)',
      btnHideHeatmap: '隱藏熱力圖',
      btnShowHeatmap: '疊加 5×5 熱力圖',
      legendCollapse: '塌陷 <30%',
      legendCenterPeak: '中心峰值 100%',

      collimationSectionAria: '光軸傾斜向量與四角維持率指標',
      verdictHeader: '光學診斷結論',
      compassAria: '焦平面傾斜極座標羅盤',
      compassTop: '上 TOP',
      compassBottom: '下 BTM',
      metricTiltMag: 'Tilt 偏移量值',
      metricCollapseDir: '劣化塌陷方位',
      metricCollapseAngle: '塌陷方位角',
      metricRadialFalloff: '徑向對稱像場彎曲項',
      metricCenterSharpness: '中心綠通道銳利度',

      cornerRetentionTitle: '四角相對中心銳利度維持率 (Corner Retention)',
      cornerMean: (pct) => `平均 ${pct}%`,
      cornerLabels: {
        tl: '左上 TL',
        tr: '右上 TR',
        bl: '左下 BL',
        br: '右下 BR',
      },
      diagDiffTlBr: '|TL - BR| 對角差',
      diagDiffTrBl: '|TR - BL| 對角差',
    },

    noise: {
      reportTitle: (cam) => `${cam} · 感光元件讀出雜訊與動態範圍標定報告`,
      frameCountBadge: (n) => `${n} 張暗幀樣本`,
      inflectionBadge: (fromIso, toIso, dropPct, reboundEv) =>
        `雙原生 ISO HCG 轉折點：ISO ${fromIso} → ISO ${toIso}（等效雜訊驟降 ${dropPct}%，動態範圍回升 +${reboundEv} EV）`,
      btnExportCsv: '匯出 CSV',
      btnExportJson: '匯出 JSON',
      btnClearSeries: '清空列表',
      exportDialogCsvTitle: '匯出 CSV 標定報告',
      exportDialogJsonTitle: '匯出 JSON 標定資料',

      chartSectionAria: '雙軸讀出雜訊與動態範圍互動曲線',
      chartPanelTitle: 'ISO 讀出雜訊 (Log2 ADU) 與工程動態範圍 (EV) 雙軸曲線',
      axisRawAduBtn: 'σ_ADU 原始讀出雜訊',
      axisIso100Btn: 'ISO 100 等效輸入底噪',
      channelMean: '平均',
      channelAll: '四通道',
      svgAria: 'ISO 雜訊與動態範圍折線圖',
      isoUnknownShort: '未知',
      isoUnknownFull: 'ISO 未知',
      leftAxisRawTitle: '← 左軸：讀出雜訊 σ_ADU (Log2 對數刻度)',
      leftAxisNormTitle: '← 左軸：ISO 100 等效輸入雜訊 ADU (Log2)',
      rightAxisDrTitle: '右軸：工程動態範圍 Engineering DR (EV, 虛線) →',
      bottomAxisIsoTitle: '感光度 ISO (Log2 等級距座標)',

      frameDetailHint: '單幀四通道詳細遙測（點擊圖表節點切換）',
      integrityAlertTitle: '暗幀資料完整性提示',
      channelCardTitle: (ch) => `${ch} 通道`,
      deltaBlLabel: 'ΔBL 偏移',
      hotPixelsRejectedLabel: '熱像素剔除',
      g1HistTitle: 'G1 通道黑電平附近 ADU 高斯分佈直方圖',
      nominalBlLabel: (adu) => `標稱 BL = ${adu} ADU`,

      tableTitle: '多檔 ISO 感光元件底噪與動態範圍標定明細表',
      colIso: 'ISO',
      colFilename: '樣張檔案',
      colNominalBl: '標稱黑電平',
      colMeanDeltaBl: '平均 ΔBL 偏移',
      colMeanSigma: '四通道平均 σ_ADU',
      colIso100Norm: 'ISO 100 歸一化底噪',
      colDrEv: '工程動態範圍 (EV)',
      colHotPixels: '剔除 5σ 熱像素',
      colValidation: '資料校驗',
      badgeZeroClipped: '零點截斷',
      badgeLightLeak: '疑似漏光',
      badgeCleanDark: '純淨暗幀',
    },
  },

  en: {
    windowTitle: 'collima — Camera Sensor & Lens Optical Collimation Workbench',
    metaDescription:
      'Local-first camera RAW optical diagnostics workbench powered by Rust & WebAssembly: 9-zone 1:1 focal-plane tilt & field curvature inspection, plus Dual Native ISO read-noise (ADU) & Engineering Dynamic Range (EV) calibration.',
    brandSubtitle: 'Optical Collimation & Sensor Metrology Workbench',
    navAriaLabel: 'Diagnostic mode switcher',
    tabTiltLabel: 'Optical Tilt Inspector',
    tabNoiseLabel: 'Sensor Noise Lab',
    btnBackToBench: 'Back to Dropzone',
    langMenuAriaLabel: 'Switch interface language',

    telemetryRegionAria: 'RAW metadata and decode telemetry',
    telemetryLens: 'Lens',
    telemetryManualExposure: 'Manual Exposure Metadata',
    telemetryActiveArea: 'Active Area',
    telemetryDecodeTime: (ms) => `Decoded in ${ms} ms`,

    errorTitle: 'In-Memory RAW Decode Error',
    errorDismissAria: 'Dismiss error alert',
    workerRuntimeError: 'Web Worker runtime error',
    footerNote:
      'collima Optical & Sensor Metrology Workbench · Rust + WebAssembly (flashraw Sony X-OCN [ARW 6.0] / CR3 / DNG + ticoraw Nikon HE/HE*) · 100% local in-memory RAW processing',

    dropzone: {
      compactTiltUpload: 'Load RAW Frame',
      compactNoiseUpload: 'Add Dark RAWs',
      sectionAriaTilt: 'Optical test RAW dropzone',
      sectionAriaNoise: 'Sensor dark-frame batch dropzone',
      titleTilt:
        'Drop a single optical test RAW frame (test chart / distant facade / brick wall / starfield)',
      titleNoise:
        'Drop multi-ISO sensor dark-frame RAWs (body cap on & viewfinder covered)',
      descTilt:
        'Extracts black-level-calibrated Tenengrad sharpness and Star HFR directly on pre-demosaic G1 / G2 planes, eliminating vignetting bias and decoupling symmetric field curvature from mount/element tilt.',
      descNoise:
        'Single-pass exact 65,536-bin u16 histogram per Bayer channel (R / G1 / G2 / B) with iterative 5σ hot-pixel rejection, measuring black-level drift, read noise σ_ADU, Engineering DR (EV), and Dual Native ISO HCG switches.',
      tagSony: 'Sony .ARW / .ARQ (incl. A7M5/A7R6 X-OCN HQ · Pixel Shift)',
      tagNikon: 'Nikon .NEF (incl. Z9/Z8/Z6III/ZR HE & HE* TicoRAW)',
      tagCanon: 'Canon .CR3 / .CR2',
      tagDng: 'Adobe .DNG (incl. JXL)',
      tagOthers: 'Fujifilm .RAF · Lumix/Leica .RW2 · OM .ORF · Pentax .PEF',
      privacyBadge:
        '100% Local WebAssembly In-Memory Decode · Zero Cloud Upload · Zero-Copy Worker Rendering',
      unsupportedFormat: (name) =>
        `Unsupported file format (${name}). Please drop a camera RAW file (e.g. .ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF).`,
      synthTitle:
        'Built-in 14-bit Synthetic Calibration Suite (Try Instantly Without Camera RAWs)',
      synthDesc:
        'Synthesizes uncompressed 14-bit RGGB .DNG byte streams in WASM memory with calibrated PSF defocus gradients, vignetting, shot/read noise, and dual-gain HCG transitions.',
      btnSynthTiltChart: 'Simulate Top-Left Mount Tilt Chart',
      btnSynthAstro: 'Simulate Starfield Top-Right Coma/Tilt',
      btnSynthFlatRef: 'Simulate Collimated Reference (1.4 EV Vignette)',
      btnSynthIsoSeries:
        'Generate 8-Stop Dual Native ISO Dark Series (ISO 100–6400, HCG @ 800)',
    },

    tilt: {
      sectionLoupeAria: '9-zone synchronized 1:1 sensor pixel loupe',
      loupePanelTitle: '9-Zone Synchronized 1:1 Sensor Pixel Loupe',
      grades: {
        excellent: 'Excellent Collimation',
        normal_curvature: 'Centered Axis · Normal Curvature',
        mild_tilt: 'Mild Asymmetry / Tilt',
        severe_tilt: 'Significant Focal-Plane Tilt',
        insufficient_texture: 'Insufficient Local Texture',
      },
      validities: {
        valid: 'Valid Texture',
        low_texture: 'Low Contrast / Flat',
        underexposed: 'Underexposed SNR',
        clipped: 'Highlight Clipped',
      },
      zoomGroupAria: 'Nearest-neighbor zoom factor',
      dragModeGroupAria: 'Loupe pointer drag mode',
      dragSyncPan: 'Sync Pan',
      dragSyncPanTitle: 'Drag any loupe cell to pan all 9 viewports in lockstep',
      dragRelocateRoi: 'Adjust ROI',
      dragRelocateRoiTitle:
        'Move an individual station ROI box (e.g. away from blank sky onto textured detail) and recompute sharpness live',
      reticleToggle: (on) => `Reticle ${on ? 'On' : 'Off'}`,
      resetStations: 'Reset ROI',
      resetStationsTitle: 'Reset all 9 sampling stations and pan offset to default',
      renderChannelLabel: 'Pixel Signal Path:',
      patchModes: {
        0: '1:1 Demosaiced Color (sRGB)',
        1: 'Pre-Demosaic Green (Zero Lateral CA)',
        2: 'Raw Bayer CFA Mosaic',
      },
      evBoostLabel: 'EV Boost',
      hudCenterRef: '100% Center Ref',
      hudCenterInvalid: (v) => `Center · ${v}`,
      hudInvalidRef: 'Invalid Ref',
      hudRetention: (pct) => `Retained ${pct}%`,
      loupeHint:
        'Tip: Drag at 200% / 400% to pan all 9 loupes synchronously; Shift-drag (or switch to "Adjust ROI" / click the overview map) to relocate a single station away from flat areas.',
      nearestNeighborBadge: 'Nearest-Neighbor 1:1 (imageSmoothingEnabled = false)',

      overviewSectionAria: 'Full-frame overview and 5x5 sharpness contour heatmap',
      overviewTitle: 'Full-Frame Curvature / Tilt Contour Heatmap (5×5)',
      btnHideHeatmap: 'Hide Heatmap',
      btnShowHeatmap: 'Show 5×5 Heatmap',
      legendCollapse: 'Collapse <30%',
      legendCenterPeak: 'Center Peak 100%',

      collimationSectionAria: 'Optical tilt vector and 4-corner retention telemetry',
      verdictHeader: 'Optical Collimation Verdict',
      compassAria: 'Focal-plane tilt polar compass',
      compassTop: 'TOP',
      compassBottom: 'BTM',
      metricTiltMag: 'Tilt Vector Magnitude',
      metricCollapseDir: 'Sharpness Collapse Dir',
      metricCollapseAngle: 'Collapse Azimuth',
      metricRadialFalloff: 'Symmetric Curvature Term',
      metricCenterSharpness: 'Center Green Sharpness',

      cornerRetentionTitle: '4-Corner Sharpness Retention (vs. Center)',
      cornerMean: (pct) => `Mean ${pct}%`,
      cornerLabels: {
        tl: 'Top-Left TL',
        tr: 'Top-Right TR',
        bl: 'Bottom-Left BL',
        br: 'Bottom-Right BR',
      },
      diagDiffTlBr: '|TL - BR| Diagonal Δ',
      diagDiffTrBl: '|TR - BL| Diagonal Δ',
    },

    noise: {
      reportTitle: (cam) => `${cam} · Sensor Read-Noise & Dynamic Range Report`,
      frameCountBadge: (n) => `${n} Dark ${n === 1 ? 'Frame' : 'Frames'}`,
      inflectionBadge: (fromIso, toIso, dropPct, reboundEv) =>
        `Dual Native ISO HCG Switch: ISO ${fromIso} → ISO ${toIso} (Input noise −${dropPct}%, DR +${reboundEv} EV)`,
      btnExportCsv: 'Export CSV',
      btnExportJson: 'Export JSON',
      btnClearSeries: 'Clear Series',
      exportDialogCsvTitle: 'Export CSV Calibration Report',
      exportDialogJsonTitle: 'Export JSON Calibration Data',

      chartSectionAria: 'Dual-axis read noise and dynamic range chart',
      chartPanelTitle: 'ISO Read Noise (Log2 ADU) & Engineering Dynamic Range (EV)',
      axisRawAduBtn: 'σ_ADU Raw Read Noise',
      axisIso100Btn: 'ISO 100 Input-Referred Noise',
      channelMean: 'Mean',
      channelAll: '4 Channels',
      svgAria: 'ISO read noise and dynamic range line chart',
      isoUnknownShort: 'N/A',
      isoUnknownFull: 'ISO Unknown',
      leftAxisRawTitle: '← Left: Read Noise σ_ADU (Log2 Scale)',
      leftAxisNormTitle: '← Left: ISO 100 Normalized Noise ADU (Log2)',
      rightAxisDrTitle: 'Right: Engineering DR (EV, Dashed) →',
      bottomAxisIsoTitle: 'Sensitivity ISO (Log2 Equal-Stop Axis)',

      frameDetailHint: 'Per-Frame 4-Channel Telemetry (click chart node to inspect)',
      integrityAlertTitle: 'Dark-Frame Data Integrity Notice',
      channelCardTitle: (ch) => `${ch} Channel`,
      deltaBlLabel: 'ΔBL Offset',
      hotPixelsRejectedLabel: '5σ Hot Pixels',
      g1HistTitle: 'G1 Black-Level ADU Gaussian Histogram',
      nominalBlLabel: (adu) => `Nominal BL = ${adu} ADU`,

      tableTitle: 'Multi-ISO Sensor Read-Noise & Dynamic Range Calibration Table',
      colIso: 'ISO',
      colFilename: 'Frame File',
      colNominalBl: 'Nominal BL',
      colMeanDeltaBl: 'Mean ΔBL Offset',
      colMeanSigma: 'Mean σ_ADU',
      colIso100Norm: 'ISO 100 Norm σ',
      colDrEv: 'Engineering DR (EV)',
      colHotPixels: 'Rejected 5σ Hot Pixels',
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
    brandSubtitle: 'レンズ光軸ズレ・センサーノイズ光学診断ワークベンチ',
    navAriaLabel: '診断モード切替',
    tabTiltLabel: 'Optical Tilt · 片ボケ・像面湾曲検査',
    tabNoiseLabel: 'Sensor Noise · ノイズ・デュアルISO計測',
    btnBackToBench: '読み込み画面へ戻る',
    langMenuAriaLabel: '表示言語を切り替え',

    telemetryRegionAria: 'RAW メタデータおよびデコード情報',
    telemetryLens: 'レンズ',
    telemetryManualExposure: 'マニュアル露出メタデータ',
    telemetryActiveArea: '有効画素領域',
    telemetryDecodeTime: (ms) => `デコード ${ms} ms`,

    errorTitle: 'RAW メモリ解析エラー',
    errorDismissAria: 'エラー通知を閉じる',
    workerRuntimeError: 'Web Worker 実行エラー',
    footerNote:
      'collima Optical & Sensor Metrology Workbench · Rust + WebAssembly (flashraw Sony X-OCN [ARW 6.0] / CR3 / DNG + ticoraw Nikon HE/HE*) · すべてのRAWデータはローカルメモリ内でのみ処理されます',

    dropzone: {
      compactTiltUpload: '別のRAWを開く',
      compactNoiseUpload: 'ダークRAWを追加',
      sectionAriaTilt: 'レンズ光学テストRAWドロップ領域',
      sectionAriaNoise: 'センサーダークフレーム一括ドロップ領域',
      titleTilt:
        '光学テスト用 RAW を1枚ドロップ（テストチャート / 遠景ビル / レンガ壁 / 星景）',
      titleNoise:
        '複数ISO感度のダークフレーム RAW を一括ドロップ（ボディキャップ装着・ファインダー遮光）',
      descTilt:
        'デモザイク前の独立したベイヤー G1 / G2 チャンネルから黒レベル補正済み Tenengrad 先鋭度と星像 HFR を直接算出し、周辺減光の影響を排除して正常な像面湾曲とマウント/レンズ群の片ボケ（Tilt）を定量分離します。',
      descNoise:
        '1パス 65,536 ビン厳密 u16 ヒストグラムにより各チャンネル（R / G1 / G2 / B）の 5σ ホットピクセルを除外し、黒レベルドリフト・読み出しノイズ σ_ADU・工学ダイナミックレンジ（EV）・デュアルネイティブISO切替点を自動検出します。',
      tagSony: 'Sony .ARW / .ARQ (A7M5/A7R6 X-OCN 圧縮HQ · ピクセルシフト対応)',
      tagNikon: 'Nikon .NEF (Z9/Z8/Z6III/ZR 高効率 HE & HE* TicoRAW対応)',
      tagCanon: 'Canon .CR3 / .CR2',
      tagDng: 'Adobe .DNG (JXL対応)',
      tagOthers: 'Fujifilm .RAF · Lumix/Leica .RW2 · OM .ORF · Pentax .PEF',
      privacyBadge:
        '100% ローカル WebAssembly メモリ解析 · 外部送信ゼロ · Web Worker ゼロコピー描画',
      unsupportedFormat: (name) =>
        `未対応のファイル形式です（${name}）。カメラの RAW ファイル（.ARW, .NEF, .CR3, .CR2, .DNG, .RAF, .RW2, .ORF, .PEF など）をドロップしてください。`,
      synthTitle: '内蔵 14-bit 物理合成キャリブレーションスイート（RAWなしで即座に検証）',
      synthDesc:
        'PSF デフォーカス勾配・周辺減光・ショット/読み出しノイズ・デュアルゲイン切替を備えた非圧縮 14-bit RGGB .DNG を WASM メモリ上でリアルタイム合成して解析します。',
      btnSynthTiltChart: '左上片ボケ傾斜チャートを合成',
      btnSynthAstro: '星景・右上コマ収差/傾斜を合成',
      btnSynthFlatRef: '周辺減光 1.4EV 付き合焦基準を合成',
      btnSynthIsoSeries:
        '8段デュアルネイティブISOダーク系列を生成 (ISO 100–6400, HCG @ 800)',
    },

    tilt: {
      sectionLoupeAria: '9分割 1:1 ピクセル同期ルーペ検査台',
      loupePanelTitle: '9分割 1:1 センサー等倍ピクセル同期ルーペ',
      grades: {
        excellent: '光軸・合焦ともに極めて良好',
        normal_curvature: '光軸良好 · 対称的な像面湾曲',
        mild_tilt: '軽微な非対称 / 片ボケ傾向',
        severe_tilt: '顕著な像面傾斜・片ボケ (Tilt)',
        insufficient_texture: '高周波テクスチャ不足',
      },
      validities: {
        valid: '有効テクスチャ',
        low_texture: '低コントラスト/平坦',
        underexposed: '露出不足(低SNR)',
        clipped: '白飛び飽和',
      },
      zoomGroupAria: 'ニアレストネイバー拡大倍率',
      dragModeGroupAria: 'ルーペドラッグ操作モード',
      dragSyncPan: '9窓同期パン',
      dragSyncPanTitle: '任意のルーペをドラッグして9箇所すべてを同期スクロール比較します',
      dragRelocateRoi: '測定枠を微調整',
      dragRelocateRoiTitle:
        '個別の測定枠（空などの平坦部を避けて壁目地や星像へ）を移動しリアルタイム再計算します',
      reticleToggle: (on) => `レチクル ${on ? 'ON' : 'OFF'}`,
      resetStations: '位置リセット',
      resetStationsTitle: '9分割測定枠の座標とスクロール位置を初期状態に戻します',
      renderChannelLabel: 'ピクセル表示モード：',
      patchModes: {
        0: '1:1 カラーデモザイク (sRGB)',
        1: 'デモザイク前Gチャンネル (倍率色収差を排除)',
        2: 'RAW ベイヤー CFA 配列',
      },
      evBoostLabel: '表示露光補正',
      hudCenterRef: '100% 中央基準',
      hudCenterInvalid: (v) => `中央·${v}`,
      hudInvalidRef: '基準無効',
      hudRetention: (pct) => `維持率 ${pct}%`,
      loupeHint:
        'ヒント：200% / 400% でドラッグすると9窓が同期移動します。Shift+ドラッグ（または「測定枠を微調整」／右の全体マップをクリック）で個別の測定枠を移動できます。',
      nearestNeighborBadge: 'ニアレストネイバー拡大 (imageSmoothingEnabled = false)',

      overviewSectionAria: 'フルサイズ全体図と 5x5 先鋭度等高線ヒートマップ',
      overviewTitle: '像面湾曲 / 光軸等高線ヒートマップ (5×5)',
      btnHideHeatmap: 'ヒートマップ非表示',
      btnShowHeatmap: '5×5 ヒートマップ重畳',
      legendCollapse: '低下 <30%',
      legendCenterPeak: '中央ピーク 100%',

      collimationSectionAria: '像面傾斜ベクトルと四隅維持率指標',
      verdictHeader: '光学診断結果',
      compassAria: '像面傾斜極座標コンパス',
      compassTop: '上 TOP',
      compassBottom: '下 BTM',
      metricTiltMag: 'Tilt 傾斜ベクトル量',
      metricCollapseDir: '解像低下（片ボケ）方向',
      metricCollapseAngle: '低下方位角',
      metricRadialFalloff: '放射対称像面湾曲項',
      metricCenterSharpness: '中央Gチャンネル先鋭度',

      cornerRetentionTitle: '四隅の対中央先鋭度維持率 (Corner Retention)',
      cornerMean: (pct) => `平均 ${pct}%`,
      cornerLabels: {
        tl: '左上 TL',
        tr: '右上 TR',
        bl: '左下 BL',
        br: '右下 BR',
      },
      diagDiffTlBr: '|TL - BR| 対角差',
      diagDiffTrBl: '|TR - BL| 対角差',
    },

    noise: {
      reportTitle: (cam) => `${cam} · センサー読み出しノイズ＆ダイナミックレンジ計測レポート`,
      frameCountBadge: (n) => `ダーク ${n} 枚`,
      inflectionBadge: (fromIso, toIso, dropPct, reboundEv) =>
        `デュアルネイティブISO (HCG) 切替点：ISO ${fromIso} → ISO ${toIso}（入力換算ノイズ −${dropPct}%、DR +${reboundEv} EV 回復）`,
      btnExportCsv: 'CSV 出力',
      btnExportJson: 'JSON 出力',
      btnClearSeries: 'クリア',
      exportDialogCsvTitle: 'CSV キャリブレーションレポートを保存',
      exportDialogJsonTitle: 'JSON キャリブレーションデータを保存',

      chartSectionAria: '読み出しノイズ・ダイナミックレンジ2軸グラフ',
      chartPanelTitle: 'ISO 読み出しノイズ (Log2 ADU) ＆ 工学ダイナミックレンジ (EV)',
      axisRawAduBtn: 'σ_ADU 生読み出しノイズ',
      axisIso100Btn: 'ISO 100 入力換算ノイズ',
      channelMean: '平均',
      channelAll: '4chすべて',
      svgAria: 'ISO ノイズとダイナミックレンジの折れ線グラフ',
      isoUnknownShort: '不明',
      isoUnknownFull: 'ISO 不明',
      leftAxisRawTitle: '← 左軸：読み出しノイズ σ_ADU (Log2 対数軸)',
      leftAxisNormTitle: '← 左軸：ISO 100 入力換算ノイズ ADU (Log2)',
      rightAxisDrTitle: '右軸：工学ダイナミックレンジ Engineering DR (EV, 破線) →',
      bottomAxisIsoTitle: 'ISO 感度 (Log2 等段数スケール)',

      frameDetailHint: '単フレーム 4チャンネル詳細（グラフの点をクリックして切替）',
      integrityAlertTitle: 'ダークフレーム品質チェック通知',
      channelCardTitle: (ch) => `${ch} チャンネル`,
      deltaBlLabel: 'ΔBL オフセット',
      hotPixelsRejectedLabel: '5σ ホットピクセル除外',
      g1HistTitle: 'G1 黒レベル周辺 ADU ガウス分布ヒストグラム',
      nominalBlLabel: (adu) => `公称 BL = ${adu} ADU`,

      tableTitle: 'マルチISO センサー読み出しノイズ＆ダイナミックレンジ一覧表',
      colIso: 'ISO',
      colFilename: 'ファイル名',
      colNominalBl: '公称黒レベル',
      colMeanDeltaBl: '平均 ΔBL 誤差',
      colMeanSigma: '4ch平均 σ_ADU',
      colIso100Norm: 'ISO 100 換算ノイズ',
      colDrEv: '工学DR (EV)',
      colHotPixels: '除外 5σ ホットピクセル',
      colValidation: '品質判定',
      badgeZeroClipped: 'ゼロクリップ',
      badgeLightLeak: '遮光漏れ疑い',
      badgeCleanDark: '正常ダーク',
    },
  },
};
