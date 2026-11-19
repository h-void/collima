# `collima` — 相機感光元件與鏡頭光軸光學診斷工作台

[English](./README.md) · [简体中文](./README.zh-CN.md) · **繁體中文** · [日本語](./README.ja.md)

純本機執行的跨平台相機 RAW 光學與雜訊診斷工作台（**Web 線上即用** + **Tauri v2 原生桌面版**）。基於 **Rust + WebAssembly** 於本機記憶體完成解碼與像素統計（零上傳），提供零延遲 1:1 感光元件像素檢視。

- 🌐 **線上工作台**：<https://h-void.github.io/collima/?lang=zh-TW> *（繁體中文 · 简体中文 · English · 日本語）*
- 📦 **桌面版下載**：[GitHub Releases](https://github.com/h-void/collima/releases) *（Windows x64/ARM64 · macOS Apple Silicon/Intel · Linux x64/ARM64）*
  > **macOS 提示**：安裝包採用開源 Ad-hoc 簽章；首次開啟若提示「已損毀 / 無法驗證開發者」，拖入 `/Applications` 後於終端機執行一次 `xattr -cr /Applications/collima.app` 即可。

---

## 核心功能

- **Optical Tilt Inspector（光軸傾斜與像場彎曲檢視）** — 九宮格 1:1 最近鄰同步放大鏡（`100% / 200% / 400%`）、全片幅 5×5 等高線熱力圖與極座標傾角羅盤。直接於解馬賽克前的獨立 $G_1 / G_2$ 綠通道計算銳利度與星點 HFR，排除邊角失光（暗角）與橫向色差干擾，定量區分正常對稱像場彎曲與接環/鏡組偏心傾斜（Tilt）。
- **Sensor Noise Lab（讀出雜訊與雙原生 ISO 標定）** — 拜耳四通道（$R, G_1, G_2, B$）獨立測算黑電平漂移、讀出雜訊（$\sigma _ {\text{ADU}}$ 與 ISO 100 歸一化）與工程動態範圍（EV），自動捕捉**雙原生 ISO（HCG）**切換轉折點，支援匯出 CSV / JSON。
- **內建 14-bit 合成樣張與四語即時切換** — 無須實機 RAW 即可於記憶體合成 14-bit `.DNG` 標定樣張驗證完整管線；切換語系無須重新解碼 60MP RAW。

<details>
<summary><strong>核心光學與感光元件演算法公式（點擊展開）</strong></summary>

- **黑電平校準歸一化 Tenengrad 算子**（於原始拜耳 $G_1 / G_2$ 獨立子平面計算，消除邊角暗角與固定黑電平偏置造成的邊角銳利度低估）：

  $$\displaystyle S _ {G_k} = \frac{1}{N \cdot (\mu _ {G_k} - \text{BL} _ {G_k})^2} \sum _ {(x,y)} \max\left(0, G_x^2 + G_y^2 - \tau _ {\text{noise}}^2\right)$$

- **像場彎曲與光軸傾斜解耦**：加權最小平方法（WLS）聯合擬合一階傾斜平面與二階徑向對稱衰減項。
- **讀出雜訊與工程動態範圍**（單遍 $O(N)$ 精確 65,536 桶 `u16` 直方圖 + 迭代 $5\sigma$ 熱像素剔除）：

  $$\displaystyle \text{DR} _ {\text{EV}} = \log_2 \left( \frac{\text{WhiteLevel} - \text{BlackLevel}}{\sigma _ {\text{ADU}}} \right)$$

</details>

---

## 支援的 RAW 格式

| 解碼引擎 | 涵蓋相機與壓縮格式 |
| --- | --- |
| [`flashraw 0.3`](https://github.com/ybouane/flashraw) | 約 40 種 RAW 格式：**Sony `.ARW` / `.ARQ`**（含 α7 V / α7R VI 之 `ARW 6.0` `X-OCN / LLVC3`「已壓縮 HQ」與無損壓縮）、**Canon `.CR3` / `.CR2`**、傳統 **Nikon `.NEF`**、**Adobe `.DNG`**（含 DNG 1.7 JPEG XL）、**Fujifilm `.RAF`**（含 X-Trans）、**Panasonic/Leica `.RW2` / `.RWL`**、**OM/Olympus `.ORF`**、**Pentax `.PEF`**、**Hasselblad `.3FR`**、**Phase One `.IIQ`**。 |
| [`ticoraw 0.2`](https://github.com/lukaj99/ticoraw) | **Nikon 高效率壓縮 `.NEF`（`HE` / `HE*`）** 純 Rust 位元精確 JPEG XS 小波解碼器，支援 Z9、Z8、Zf、Z6III、Z5II、Z50II、ZR（自動融合 `flashraw` EXIF 中繼資料）。 |

---

## 測試樣張拍攝指南

- **檢測鏡頭光軸傾斜（1 張 RAW）**：對準與光軸正交的平面紋理目標（填滿四角的遠景建築立面、平整磚牆或**天頂星野**），**最大光圈全開** + **最低原生 ISO**，上腳架關閉防手震並使用電子前簾/電子快門，對焦鎖定**畫面正中央（`MC`）**。
- **測繪讀出雜訊與雙原生 ISO（多檔暗幀 RAW）**：暗處蓋緊**機身蓋/鏡頭蓋**並遮蔽**觀景窗**，`M` 模式 + `MF`、關閉長曝雜訊抑制，快門固定 **`1/1000 s` – `1/4000 s`**，依各檔 ISO（如 100–6400）各拍一張未壓縮或無損壓縮 RAW。

<details>
<summary><strong>本機建置與開發（點擊展開）</strong></summary>

需安裝 **Rust `>= 1.85`**（含 `wasm32-unknown-unknown`）、**`wasm-pack`**、**Node.js `>= 20`**（打包桌面版另需 [Tauri v2 系統相依套件](https://v2.tauri.app/start/prerequisites/)）：

```bash
cargo test --workspace              # 執行 Rust 光學與雜訊單元測試
cd web && npm install
npm run build:wasm && npm run dev   # 編譯 WASM 並啟動瀏覽器工作台
npm run build                       # 建置正式靜態檔案
npm run tauri:build                 # 打包原生桌面安裝包 (.exe/.msi, .dmg, .deb/.rpm/.AppImage)
```

</details>

---

## 致謝與開源授權

`collima` 的光軸傾斜/像場彎曲解耦求解器、解馬賽克前雙綠校準 Tenengrad、65,536 桶底噪與雙原生 ISO 引擎、14-bit `.DNG` 物理合成器及九宮格 1:1 互動介面均為獨立原創實作。底層跨品牌 RAW 解碼與執行環境建構於以下優秀開源專案之上：

- **[@ybouane](https://github.com/ybouane) / [`flashraw`](https://github.com/ybouane/flashraw)** (`MIT OR Apache-2.0`) — 約 40 種相機 RAW 純 Rust 解碼引擎（含 Sony `ARW 6.0` `X-OCN`、Canon `CR3`、`DNG 1.7`）與色彩矩陣庫。
- **[@lukaj99](https://github.com/lukaj99) / [`ticoraw`](https://github.com/lukaj99/ticoraw)** (`MIT OR Apache-2.0`) — Nikon 高效率壓縮 `.NEF`（`HE` / `HE*`）純 Rust 潔淨室解碼器。
- **核心生態**：[`jxl-oxide`](https://github.com/tirr-c/jxl-oxide)、[`zune-image`](https://github.com/etemesi254/zune-image)、[`wasm-bindgen`](https://github.com/rustwasm/wasm-bindgen)、[`tauri`](https://github.com/tauri-apps/tauri)、[`react`](https://github.com/facebook/react) 與 [`lucide`](https://github.com/lucide-icons/lucide)，完整版權聲明請見 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

本專案採用 **[MIT](./LICENSE)** 或 **[Apache-2.0](./LICENSE-APACHE)** 雙重授權（任選其一）。
