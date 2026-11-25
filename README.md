# `collima` — Camera Sensor & Lens Optical Collimation Workbench

**English** · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

A 100% local, cross-platform camera RAW optical and sensor metrology workbench (**Web App** + **Tauri v2 Desktop**). Powered by **Rust + WebAssembly**, all RAW files are decoded and analyzed strictly in local memory (zero uploads) with responsive 1:1 pixel inspection.

- 🌐 **Online Workbench**: <https://h-void.github.io/collima/?lang=en> *(English · 简体中文 · 繁體中文 · 日本語)*
- 📦 **Desktop Downloads**: [GitHub Releases](https://github.com/h-void/collima/releases) *(Windows x64/ARM64 · macOS Apple Silicon/Intel · Linux x64/ARM64)*
  > **macOS tip**: Builds use ad-hoc signing. If Gatekeeper blocks first launch, move `collima.app` to `/Applications` and run `xattr -cr /Applications/collima.app` once.

---

## Features

- **Optical Tilt Inspector** — 9-zone synchronized 1:1 nearest-neighbor loupe (`100% / 200% / 400%`), 5×5 full-frame contour heatmap, and polar tilt compass. Measures sharpness directly on pre-demosaic $G_1 / G_2$ planes (plus Star HFR) to separate normal wide-open field curvature from mount/element tilt without vignetting or lateral CA bias.
- **Sensor Noise Lab** — Per-channel ($R, G_1, G_2, B$) black-level drift, read noise ($\sigma _ {\text{ADU}}$ & ISO 100 normalized), Engineering Dynamic Range (EV), automatic **Dual Native ISO (HCG)** switch detection, and CSV/JSON export.
- **Built-in 14-Bit Synthetic Suite & Reactive 4-Locale UI** — Try instantly without camera RAWs via in-memory synthesized 14-bit `.DNG` calibration frames; switch languages anytime without re-decoding 60 MP RAW buffers.

<details>
<summary><strong>Optical &amp; Sensor Metrology Formulas</strong></summary>

- **Black-Level-Calibrated Normalized Tenengrad** (evaluated independently on raw Bayer $G_1$ and $G_2$ sub-planes so optical vignetting and fixed black-level pedestals do not underestimate corner sharpness):

  $$\displaystyle S _ {G_k} = \frac{1}{N \cdot (\mu _ {G_k} - \text{BL} _ {G_k})^2} \sum _ {(x,y)} \max\left(0, G_x^2 + G_y^2 - \tau _ {\text{noise}}^2\right)$$

- **Tilt vs. Curvature Decoupling**: Weighted Least Squares (WLS) fits a 1st-order tilt plane alongside a 2nd-order radially symmetric falloff term.
- **Read Noise & Engineering Dynamic Range** (single-pass $O(N)$ exact 65,536-bin `u16` histogram with iterative $5\sigma$ hot-pixel rejection):

  $$\displaystyle \text{DR} _ {\text{EV}} = \log_2 \left( \frac{\text{WhiteLevel} - \text{BlackLevel}}{\sigma _ {\text{ADU}}} \right)$$

</details>

---

## Supported RAW Formats

| Engine | Cameras & Compression Codecs |
| --- | --- |
| [`flashraw 0.3`](https://github.com/ybouane/flashraw) | ~40 RAW formats: **Sony `.ARW` / `.ARQ`** (incl. `ARW 6.0` `X-OCN / LLVC3` *Compressed HQ* on α7 V / α7R VI & Lossless), **Canon `.CR3` / `.CR2`**, classic **Nikon `.NEF`**, **Adobe `.DNG`** (incl. DNG 1.7 JPEG XL), **Fujifilm `.RAF`** (incl. X-Trans), **Lumix/Leica `.RW2` / `.RWL`**, **OM `.ORF`**, **Pentax `.PEF`**, **Hasselblad `.3FR`**, **Phase One `.IIQ`**. |
| [`ticoraw 0.2`](https://github.com/lukaj99/ticoraw) | **Nikon High Efficiency `.NEF` (`HE` & `HE*`)** clean-room bit-exact JPEG XS wavelet decoder for Z9, Z8, Zf, Z6III, Z5II, Z50II, and ZR (with EXIF fused via `flashraw`). |

---

## How to Shoot Test RAWs

- **Lens Tilt (1 RAW frame)**: Shoot a flat textured surface perpendicular to the optical axis (distant building facade, brick wall filling all four corners, or a **zenith starfield**) **wide open**, at **base ISO**, on a tripod (IBIS off, EFCS/electronic shutter), focused precisely at the **center (`MC`)**.
- **Sensor Noise & Dual Native ISO (Multi-ISO Dark RAWs)**: Put the **body cap** on and cover the **viewfinder** in a dark room. Use `M` + `MF`, Long Exposure NR off, **`1/1000 s` – `1/4000 s`** shutter speed, and shoot one uncompressed/lossless RAW per ISO step (e.g., ISO 100–6400).

<details>
<summary><strong>Local Build &amp; Development</strong></summary>

Requires **Rust `>= 1.88`** (with `wasm32-unknown-unknown`), **`wasm-pack`**, **Node.js `>= 20.19`**, and optional [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for desktop packaging:

```bash
cargo test --workspace          # Run Rust optical & sensor unit tests
cd web && npm install
npm run build:wasm && npm run dev   # Start browser workbench
npm run build                       # Build production static web bundle
npm run tauri:build                 # Package native desktop installers (.exe/.msi, .dmg, .deb/.rpm/.AppImage)
```

</details>

---

## Acknowledgments & License

`collima`'s optical tilt/curvature solver, pre-demosaic dual-green Tenengrad, 65,536-bin read-noise & Dual Native ISO engine, 14-bit `.DNG` synthetic calibrator, and 9-zone 1:1 workbench are original implementations. RAW decoding and runtime infrastructure build upon:

- **[@ybouane](https://github.com/ybouane) / [`flashraw`](https://github.com/ybouane/flashraw)** (`MIT OR Apache-2.0`) — Pure-Rust RAW decoder (~40 formats incl. Sony `ARW 6.0` `X-OCN`, Canon `CR3`, `DNG 1.7`) & color matrices.
- **[@lukaj99](https://github.com/lukaj99) / [`ticoraw`](https://github.com/lukaj99/ticoraw)** (`MIT OR Apache-2.0`) — Pure-Rust clean-room decoder for Nikon High Efficiency `.NEF` (`HE` / `HE*`).
- **Ecosystem**: [`jxl-oxide`](https://github.com/tirr-c/jxl-oxide), [`zune-image`](https://github.com/etemesi254/zune-image), [`wasm-bindgen`](https://github.com/rustwasm/wasm-bindgen), [`tauri`](https://github.com/tauri-apps/tauri), [`react`](https://github.com/facebook/react), and [`lucide`](https://github.com/lucide-icons/lucide) — see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

Dual-licensed under **[MIT](./LICENSE)** or **[Apache-2.0](./LICENSE-APACHE)**, at your option.
