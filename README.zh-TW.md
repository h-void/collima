# `collima` — 相機感光元件與鏡頭光軸光學診斷工作台

[English](./README.md) · [简体中文](./README.zh-CN.md) · **繁體中文** · [日本語](./README.ja.md)

**`collima`** 是一套純本機執行的跨平台相機與鏡頭光學診斷工作台（同時支援 **Web 瀏覽器線上即開即用** 與 **Tauri v2 原生桌面應用程式**）。底層以 **Rust + WebAssembly** 於本機沙盒記憶體完成 RAW 原始位元組流解碼與拜耳像素統計（零雲端上傳），前端結合 **React + Web Worker + HTML5 Canvas** 提供零延遲的 1:1 感光元件像素級檢視。

- 🌐 **線上工作台（GitHub Pages — 繁體中文 / 简体中文 / English / 日本語）**：<https://h-void.github.io/collima/?lang=zh-TW>
- 📦 **全平台桌面版與離線安裝包下載（Windows x64/ARM64 · macOS Apple Silicon/Intel · Linux x64/ARM64）**：[GitHub Releases](https://github.com/h-void/collima/releases)

---

## 核心功能架構

### 1. Optical Tilt Inspector（鏡頭光軸傾斜與像場彎曲診斷）
- **解馬賽克前獨立雙綠通道量測**：直接於原始拜耳陣列的 $G_1$ 與 $G_2$ 獨立子平面分別計算空間梯度並取平均，既排除廣角鏡頭邊緣橫向色差（倍率色差）造成的偽邊緣反差，亦避免將 $G_1/G_2$ 斜向合併導致的 45° 高頻細節衰減。
- **排除邊角失光（暗角）干擾的黑電平校準歸一化 Tenengrad 算子**：

  $$\displaystyle S _ {G_k} = \frac{1}{N \cdot (\mu _ {G_k} - \text{BL} _ {G_k})^2} \sum _ {(x,y)} \max\left(0, G_x^2 + G_y^2 - \tau _ {\text{noise}}^2\right)$$

  明確扣除通道標稱黑電平 $\text{BL} _ {G_k}$ 並套用局部底噪門檻 $\tau _ {\text{noise}}$，防止鏡頭邊角失光（Vignetting）因僅衰減光訊號而不衰減固定黑電平偏置（如 Sony 512 / Canon 2048 ADU）所造成的系統性邊角銳利度低估。
- **像場彎曲 vs 光軸傾斜（Tilt）解耦與星點 HFR 偵測**：採用加權最小平方法（WLS）擬合一階傾斜平面與二階徑向對稱衰減項，定量區分「大光圈正常對稱像場彎曲」與「接環法蘭距 / 轉接環 / 鏡組偏心導致的單側塌陷」，並內建星點半通量半徑（Star HFR）估算。
- **九宮格 1:1 同步放大檢視台 + 全片幅 5×5 等高線熱力圖**：
  - 9 個視口（`TL, TC, TR, ML, MC, MR, BL, BC, BR`）直接自 WASM 常駐 `RawSession` 即時切片全解析度 1:1 感光元件像素（絕非縮圖二次插值放大），支援 `100% / 200% / 400%` 最近鄰無插值（`imageSmoothingEnabled = false`）同步平移檢視。
  - 支援一鍵切換 **1:1 色彩解馬賽克 (sRGB)**、**解馬賽克前純綠通道** 與 **原始拜耳 CFA 陣列**；按住 `Shift` 或開啟「微調取樣點」即可單獨拖曳局部取樣框避開純色天空並即時重算銳利度。

### 2. Sensor Noise Lab（感光元件讀出雜訊與雙原生 ISO 標定）
- **單遍 $O(N)$ 精確 65,536 桶 `u16` 直方圖引擎**：無須為 6100 萬畫素暗幀配置額外排序陣列，避免低 ISO 下整數四分位距（IQR = 1~2 ADU）量化坍縮誤判正常高斯尾部，透過迭代 $5\sigma$ 門檻精準剔除熱像素（Hot Pixels）與壞點。
- **拜耳四通道 ($R, G_1, G_2, B$) 獨立標定**：
  - **黑電平漂移（Black Level Offset）**： $\Delta \text{BL} = \mu _ {\text{clean}} - \text{BL} _ {\text{meta}}$，自動偵測韌體零點截斷（Zero Clipping）與機身漏光。
  - **讀出雜訊 ($\sigma _ {\text{ADU}}$) 與 ISO 100 等效輸入底噪**： $\sigma _ {\text{norm}} = \sigma _ {\text{ADU}} \cdot (100 / \text{ISO})$。
  - **工程動態範圍（Engineering DR, EV）**：

    $$\displaystyle \text{DR} _ {\text{EV}} = \log_2 \left( \frac{\text{WhiteLevel} - \text{BlackLevel}}{\sigma _ {\text{ADU}}} \right)$$

- **雙原生 ISO / 高轉換增益（HCG）轉折點自動捕捉**：依據物理單調性與二階斜率跳變判準，精準標註雙原生 ISO 增益切換點（同時避免舊款非 ISO 不變性感光元件之平滑 PGA 曲線誤報），支援一鍵匯出 CSV / JSON 標定報告。

### 3. 內建 14-bit 物理合成標定套件與四語即時切換介面（`zh-TW` · `zh-CN` · `en` · `ja`）
- **免樣張即刻驗證**：於 WASM 記憶體即時合成具精確 PSF 散焦梯度、暗角、散粒/讀出雜訊與雙增益跳變的未壓縮 14-bit RGGB `.DNG` 原始流（歪軸測試標板、星野彗差/傾斜、1.4 EV 暗角準焦基準、8 檔 ISO 100–6400 雙原生 ISO 暗幀序列），直接送入正式解碼管線。
- **四語即時響應**：自動偵測作業系統 / 瀏覽器語系（亦支援 `?lang=zh-TW|zh-CN|en|ja` 參數直達與 `localStorage` 記憶），頂欄一鍵切換語系時無須重新解碼 60MP RAW 即可即時重譯所有光學與底噪診斷報告。

---

## 測試樣張拍攝指南

- **檢測鏡頭光軸傾斜 / 偏心（單張 RAW 即可）**：
  1. 選擇**與光軸正交且富含高頻紋理的平面目標**（填滿全片幅四角的遠景建築立面、平整磚牆、室內測試標板，或無窮遠**天頂星野**）。
  2. 將鏡頭開至**最大光圈**（景深最淺、對焦平面傾角最敏感）、**原生最低 ISO（如 ISO 64–100）**，上腳架關閉機身防手震並使用電子前簾 / 靜音快門（或高速快門），將對焦點精準鎖定於**畫面正中央（`MC`）**。
- **測繪感光元件讀出雜訊與雙原生 ISO（多檔 ISO 暗幀 RAW）**：
  1. 蓋緊**鏡頭蓋或機身蓋**，遮蔽光學 / 電子觀景窗以防雜散光滲入，並於暗處拍攝。
  2. 設為 **手動曝光（`M`）+ 手動對焦（`MF`）**，關閉「長曝雜訊抑制」，快門固定於 **`1/1000 s` – `1/4000 s`**（排除暗電流熱雜訊，純粹量測讀出電路底噪），由最低原生 ISO 至高 ISO 依整檔或 1/3 檔各拍一張無損 / 未壓縮 RAW（如 ISO 100, 200, 400, 500, 640, 800, 1600, 3200, 6400）。

---

## 雙引擎純 Rust / WASM RAW 解碼矩陣（涵蓋 Nikon / Sony 最新電影級壓縮格式）

針對近年 Nikon 與 Sony 將自家電影機 / 錄影 RAW 壓縮技術下放至靜態照片 RAW 的趨勢，`collima-core` 採用 **MIT/Apache-2.0 純 Rust 雙解碼引擎架構**：

| 解碼引擎 | 支援相機與壓縮編碼格式 |
| --- | --- |
| [`flashraw 0.2`](https://github.com/ybouane/flashraw) | 涵蓋約 40 種相機 RAW 格式：原生支援 **Sony `ARW 6.0` 容器下的 `X-OCN / LLVC3` 5/3 小波壓縮**（即 α7 V `ILCE-7M5` / α7R VI `ILCE-7RM6` 源自 CineAlta 電影機的「已壓縮 HQ」編碼）、Sony 無損壓縮 ARW (`L/M/S`) 與像素偏移 `.ARQ`、Canon `.CR3` (`CRX` 無損與 `C-RAW`) / `.CR2`、傳統 Nikon `.NEF`（未壓縮 / 無損 / 傳統有損）、Adobe `.DNG`（含 DNG 1.7 JPEG XL 壓縮）、Fujifilm `.RAF`（含 X-Trans 6×6）、Panasonic/Leica `.RW2` / `.RWL`、OM/Olympus `.ORF`、Pentax `.PEF`、Hasselblad `.3FR`、Phase One `.IIQ`。 |
| [`ticoraw 0.2`](https://github.com/lukaj99/ticoraw) | 專為 **Nikon 高效率壓縮 `.NEF`（High Efficiency `HE` 與 `HE*`）** 打造的純 Rust 潔淨室位元精確解碼器，完整解析 Nikon Z9、Z8、Zf、Z6III、Z5II、Z50II、ZR 等機型源自 intoPIX TicoRAW / N-RAW 的 JPEG XS 子頻帶小波碼流，並自動融合 `flashraw` 擷取的鏡頭與曝光 EXIF 中繼資料。 |

---

## 專案目錄結構

```text
collima/
├── README.md                         # 專案說明文件 (English, 預設首頁)
├── README.zh-CN.md                   # 專案說明文件 (简体中文)
├── README.zh-TW.md                   # 專案說明文件 (繁體中文)
├── README.ja.md                      # 專案說明文件 (日本語)
├── THIRD-PARTY-NOTICES.md            # 第三方開源元件版權與授權聲明
├── Cargo.toml                        # Rust Workspace 與 LTO Release 編譯設定
├── crates/
│   └── collima-core/                 # 核心光學與雜訊運算函式庫 (cdylib + rlib, 相容 wasm32-unknown-unknown)
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                # WASM 匯出介面 (RawSession 狀態工作階段 + 批次暗幀介面)
│           ├── decoder.rs            # 純記憶體雙引擎解碼 (flashraw + ticoraw) 與有效畫幅/CFA 校準
│           ├── bayer.rs              # R/G1/G2/B 四平面分離、色彩矩陣 2x2 預覽與 1:1 局部切片渲染
│           ├── sharpness.rs          # 黑電平校準 G1/G2 Tenengrad、星點 HFR 與 WLS Tilt 向量解耦
│           ├── noise.rs              # 65,536 桶精確直方圖、5σ 熱像素剔除與雙原生 ISO 轉折點偵測
│           └── synthetic.rs          # 內建 14-bit 未壓縮 RGGB .DNG 物理標定樣張產生器
├── src-tauri/                        # Tauri v2 原生桌面端外殼 (Windows / macOS / Linux)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/lib.rs                    # 原生系統儲存對話框匯出等桌面端橋接命令
└── web/                              # React + TypeScript + Vite 互動工作台
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── i18n/                     # 四語詞典 (zh-CN/zh-TW/en/ja)、診斷動態在地化與 I18nProvider
        ├── types/collima.ts          # 前後端強型別契約與 Worker 零拷貝訊息協定
        ├── workers/analyzer.worker.ts# 獨立 Web Worker 執行緒管理 WASM 生命週期與序列批次佇列
        ├── components/
        │   ├── LanguageSwitcher.tsx  # 頂欄多語系切換器
        │   ├── DropZone.tsx          # 單張/批次 RAW 拖放校驗與一鍵 14-bit 合成標定套件載入
        │   ├── TiltInspector.tsx     # 九宮格 1:1 同步最近鄰放大畫布 + 5x5 等高線熱力圖 + 極座標羅盤
        │   └── NoiseChart.tsx        # 雙軸對數 σ_ADU / EV 動態範圍互動曲線 + G1 高斯直方圖 + CSV/JSON 匯出
        └── App.tsx                   # 工作台頂欄、EXIF 遙測列與雙模式狀態切換
```

---

## 本機建置與開發指南

### 環境需求
- **Rust** (`>= 1.85`, 含 `wasm32-unknown-unknown` target) 與 **`wasm-pack`**
- **Node.js** (`>= 20`) 與 `npm`
- *(選用：打包原生桌面安裝包時)* [Tauri v2 系統相依套件](https://v2.tauri.app/start/prerequisites/)（macOS 需 Xcode CLT，Windows 需 MSVC Build Tools + WebView2，Ubuntu/Debian 需 `libwebkit2gtk-4.1-dev` 等）

### 1. 執行底層 Rust 單元與整合測試
```bash
cargo test --workspace
```

### 2. 編譯 WebAssembly 核心套件並啟動開發伺服器
```bash
cd web
npm install
npm run build:wasm
npm run dev
```

### 3. 建置正式環境 Web 靜態檔案
```bash
cd web
npm run build
```

### 4. 啟動或打包 Tauri v2 原生桌面版
```bash
cd web
npm run tauri:dev     # 啟動原生桌面除錯視窗
npm run tauri:build   # 打包當前作業系統安裝包 (.exe/.msi, .dmg, .deb/.rpm/.AppImage)
```

> **macOS 桌面版首次開啟說明**：GitHub Releases 中的 macOS 安裝包採用開源建置 Ad-hoc 簽章（未接入付費 Apple Developer 公證）。若首次開啟時提示「已損毀」或「無法驗證開發者」，請將 `collima.app` 拖入 `/Applications` 後於終端機執行一次 `xattr -cr /Applications/collima.app` 即可正常啟動。

---

## 致謝與開源相依套件聲明

`collima` 的光學傾斜/像場彎曲解耦演算法、解馬賽克前雙綠通道校準 Tenengrad、65,536 桶暗幀底噪與雙原生 ISO 轉折點偵測引擎、14-bit `.DNG` 物理合成標定器及九宮格 1:1 互動工作台均為獨立原創實作（並非復刻或改寫自其他同類工具）。底層跨品牌 RAW 原始流解碼與跨平台執行環境建構於以下優秀開源專案之上，特此向原作者與維護者致上誠摯感謝：

- **[@ybouane](https://github.com/ybouane) — [`ybouane/flashraw`](https://github.com/ybouane/flashraw)** (`MIT OR Apache-2.0`, `Copyright (c) 2026 Yassine Bouanane and FlashRaw contributors`)
  - 提供約 40 種相機 RAW 格式的純 Rust 記憶體安全解碼引擎（含 Sony `ARW 6.0` `X-OCN / LLVC3`、Canon `CR3`、Adobe `DNG 1.7`、Fujifilm `RAF` 等）及相機色彩矩陣校準資料庫。
- **[@lukaj99](https://github.com/lukaj99) — [`lukaj99/ticoraw`](https://github.com/lukaj99/ticoraw)** (`MIT OR Apache-2.0`, `Copyright (c) 2026 Luka Jovanovic`)
  - 提供 Nikon 高效率壓縮 `.NEF`（High Efficiency `HE` / `HE*`，intoPIX TicoRAW / JPEG XS）的純 Rust 潔淨室位元精確解碼器。
- **核心生態與底層元件**：[`tirr-c/jxl-oxide`](https://github.com/tirr-c/jxl-oxide) (`MIT OR Apache-2.0`, DNG 1.7 JPEG XL 解碼)、[`etemesi254/zune-image`](https://github.com/etemesi254/zune-image) (`MIT OR Apache-2.0 OR Zlib`)、[`rustwasm/wasm-bindgen`](https://github.com/rustwasm/wasm-bindgen) (`MIT OR Apache-2.0`)、[`tauri-apps/tauri`](https://github.com/tauri-apps/tauri) (`MIT OR Apache-2.0`)、[`facebook/react`](https://github.com/facebook/react) (`MIT`) 與 [`lucide-icons/lucide`](https://github.com/lucide-icons/lucide) (`ISC`)。

完整的第三方開源元件版權聲明與授權條款全文請參閱 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

---

## License

Dual-licensed under **[MIT](./LICENSE)** or **[Apache-2.0](./LICENSE-APACHE)**, at your option.
