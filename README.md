# `collima` — Camera Sensor & Lens Optical Collimation Workbench

**English** · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

**`collima`** is a 100% local, cross-platform optical and sensor metrology workbench for cameras and lenses — available both as an **instant browser app** and as a **native Tauri v2 desktop application**. Powered by **Rust + WebAssembly**, all RAW byte streams are decoded and analyzed strictly in local sandboxed memory (zero cloud uploads), paired with a **React + Web Worker + HTML5 Canvas** frontend for zero-latency 1:1 sensor-pixel inspection.

- 🌐 **Live Online Workbench (GitHub Pages — English / 简体中文 / 繁體中文 / 日本語)**: <https://h-void.github.io/collima/?lang=en>
- 📦 **Native Desktop Apps & Offline Bundles (Windows x64/ARM64 · macOS Apple Silicon/Intel · Linux x64/ARM64)**: [GitHub Releases](https://github.com/h-void/collima/releases)

---

## Core Capabilities

### 1. Optical Tilt Inspector (Focal-Plane Tilt & Field Curvature Metrology)
- **Pre-Demosaic Independent Dual-Green Measurement**: Computes spatial gradients separately on raw Bayer $G_1$ and $G_2$ sub-planes before averaging — eliminating false edge contrast induced by lateral chromatic aberration (LCA) on wide-angle lenses while avoiding the 45° high-frequency MTF attenuation caused by diagonally merging $G_1/G_2$.
- **Vignetting-Immune, Black-Level-Calibrated Normalized Tenengrad Operator**:

  $$\displaystyle S _ {G_k} = \frac{1}{N \cdot (\mu _ {G_k} - \text{BL} _ {G_k})^2} \sum _ {(x,y)} \max\left(0, G_x^2 + G_y^2 - \tau _ {\text{noise}}^2\right)$$

  Explicitly subtracts nominal per-channel black level $\text{BL} _ {G_k}$ and enforces a local noise-floor gate $\tau _ {\text{noise}}$, preventing optical vignetting — which attenuates photon signal without attenuating fixed camera pedestals (e.g., Sony 512 ADU or Canon 2048 ADU) — from systematically underestimating corner sharpness.
- **Field Curvature vs. Focal-Plane Tilt Decoupling & Star HFR**: Fits a first-order tilt plane alongside a second-order radially symmetric falloff term via Weighted Least Squares (WLS), quantitatively separating normal wide-open field curvature from mount/adapter/element decentering, with built-in Half-Flux Radius (Star HFR) estimation for astrophotography frames.
- **9-Zone Synchronized 1:1 Pixel Loupe + Full-Frame 5×5 Contour Heatmap**:
  - 9 sampling stations (`TL, TC, TR, ML, MC, MR, BL, BC, BR`) slice true 1:1 sensor pixels directly from the resident WASM `RawSession` (never upscaled from half-size previews), supporting lockstep `100% / 200% / 400%` nearest-neighbor (`imageSmoothingEnabled = false`) panning.
  - Instant switching among **1:1 Demosaiced Color (sRGB)**, **Pre-Demosaic Green (Zero Lateral CA)**, and **Raw Bayer CFA Mosaic**, plus `Shift`-drag or **"Adjust ROI"** mode to relocate individual station boxes away from blank sky onto textured detail with live sharpness recomputation.

### 2. Sensor Noise Lab (Read Noise & Dual Native ISO Calibration)
- **Single-Pass $O(N)$ Exact 65,536-Bin `u16` Histogram Engine**: Eliminates 61 MP auxiliary sort allocations and avoids integer Interquartile Range (`IQR = 1–2 ADU`) quantization collapse at base ISO, applying iterative $5\sigma$ rejection to strip hot pixels and cosmic-ray hits cleanly.
- **Independent 4-Channel ($R, G_1, G_2, B$) Bayer Calibration**:
  - **Black-Level Drift (Black Level Offset)**: $\Delta \text{BL} = \mu _ {\text{clean}} - \text{BL} _ {\text{meta}}$, automatically flagging firmware zero-clipping or body light leaks.
  - **Read Noise ($\sigma _ {\text{ADU}}$) & ISO 100 Input-Referred Noise**: $\sigma _ {\text{norm}} = \sigma _ {\text{ADU}} \cdot (100 / \text{ISO})$.
  - **Engineering Dynamic Range (Engineering DR, EV)**:

    $$\displaystyle \text{DR} _ {\text{EV}} = \log_2 \left( \frac{\text{WhiteLevel} - \text{BlackLevel}}{\sigma _ {\text{ADU}}} \right)$$

- **Automatic Dual Native ISO / High Conversion Gain (HCG) Detection**: Identifies physical HCG switch points via monotonicity and second-order slope-jump criteria (immune to false positives on legacy non-ISO-invariant smooth PGA curves), with one-click **CSV / JSON** export.

### 3. Built-in 14-Bit Synthetic Suite & 4-Locale Reactive Internationalization (`en` · `zh-CN` · `zh-TW` · `ja`)
- **Zero-Sample Instant Verification**: Synthesizes uncompressed 14-bit RGGB `.DNG` byte streams directly in WASM memory (tilted resolution chart, coma/tilted starfield, 1.4 EV vignetted collimated reference, and an 8-stop ISO 100–6400 dark series with an HCG switch at ISO 800) and feeds them through the exact production decode pipeline.
- **Reactive Multi-Language UI**: Auto-detects OS/browser locale (with `?lang=en|zh-CN|zh-TW|ja` deep-linking and `localStorage` persistence) and re-renders all optical verdicts and noise diagnostics instantly without re-decoding 60 MP RAW buffers.

---

## Capture Guide (How to Shoot Test RAWs)

- **For Optical Tilt Inspection (1 RAW frame)**:
  1. Shoot a **planar textured target** perpendicular to the optical axis (distant building facade, brick wall filling all four corners, printed resolution chart, or a **zenith starfield** at infinity).
  2. Shoot **wide open** (maximum aperture, shallowest depth of field), at **base ISO (e.g., ISO 64–100)**, on a tripod with IBIS off and EFCS/electronic shutter (or fast shutter speed), focusing precisely at the **center (`MC`)**.
- **For Sensor Read-Noise & Dual Native ISO Mapping (Multi-ISO Dark RAWs)**:
  1. Attach a tight **body cap** (or lens cap), cover the **viewfinder** against stray light, and shoot in a dark environment.
  2. Set **Manual exposure (`M`) + Manual Focus (`MF`)**, turn off Long Exposure NR, fix shutter speed at **`1/1000 s` – `1/4000 s`** (isolating pure read noise from thermal dark current), and capture one uncompressed or lossless RAW per ISO step (e.g., ISO 100, 200, 400, 500, 640, 800, 1600, 3200, 6400).

---

## Dual-Engine Pure-Rust / WASM RAW Codec Matrix

To support modern mirrorless bodies that bring cinema/video RAW wavelet codecs to still photography, `collima-core` combines two **MIT/Apache-2.0 pure-Rust decoders**:

| Engine | Supported Cameras & Compression Formats |
| --- | --- |
| [`flashraw 0.2`](https://github.com/ybouane/flashraw) | Covers ~40 camera RAW formats: native support for **Sony `ARW 6.0` `X-OCN / LLVC3` 5/3 wavelet compression** (*Compressed HQ* derived from CineAlta on α7 V `ILCE-7M5` / α7R VI `ILCE-7RM6`), Sony Lossless Compressed ARW (`L/M/S`) & Pixel Shift `.ARQ`, Canon `.CR3` (`CRX` lossless & `C-RAW`) / `.CR2`, classic Nikon `.NEF` (uncompressed / lossless / classic lossy), Adobe `.DNG` (incl. DNG 1.7 JPEG XL), Fujifilm `.RAF` (incl. X-Trans 6×6), Panasonic/Leica `.RW2` / `.RWL`, OM/Olympus `.ORF`, Pentax `.PEF`, Hasselblad `.3FR`, Phase One `.IIQ`. |
| [`ticoraw 0.2`](https://github.com/lukaj99/ticoraw) | Dedicated clean-room bit-exact Rust decoder for **Nikon High Efficiency `.NEF` (`HE` and `HE*`)** — decoding the intoPIX TicoRAW / N-RAW JPEG XS sub-band wavelet streams from Nikon Z9, Z8, Zf, Z6III, Z5II, Z50II, and ZR while fusing lens and exposure EXIF metadata extracted via `flashraw`. |

---

## Repository Structure

```text
collima/
├── README.md                         # Documentation (English, default)
├── README.zh-CN.md                   # Documentation (简体中文)
├── README.zh-TW.md                   # Documentation (繁體中文)
├── README.ja.md                      # Documentation (日本語)
├── THIRD-PARTY-NOTICES.md            # Upstream open-source copyright & license notices
├── Cargo.toml                        # Rust workspace & LTO release profile
├── crates/
│   └── collima-core/                 # Core optical & sensor metrology crate (cdylib + rlib, wasm32-compatible)
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                # WASM bindings (stateful RawSession + batch dark-frame APIs)
│           ├── decoder.rs            # In-memory dual-engine decode (flashraw + ticoraw) & active-area crop
│           ├── bayer.rs              # R/G1/G2/B plane split, color-matrix 2x2 preview & 1:1 patch renderer
│           ├── sharpness.rs          # Black-level calibrated G1/G2 Tenengrad, Star HFR & WLS tilt decoupling
│           ├── noise.rs              # 65,536-bin exact histogram, 5σ hot-pixel rejection & HCG inflection detector
│           └── synthetic.rs          # Built-in 14-bit uncompressed RGGB .DNG physical calibration generator
├── src-tauri/                        # Tauri v2 native desktop shell (Windows / macOS / Linux)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/lib.rs                    # Native save-dialog export & desktop command bridge
└── web/                              # React + TypeScript + Vite workbench frontend
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── i18n/                     # 4-locale dictionaries (en/zh-CN/zh-TW/ja), reactive diagnostics & context
        ├── types/collima.ts          # Strongly typed contracts & zero-copy Worker message protocol
        ├── workers/analyzer.worker.ts# Dedicated Web Worker managing WASM lifecycle & serial batch queue
        ├── components/
        │   ├── LanguageSwitcher.tsx  # Top-bar locale switcher
        │   ├── DropZone.tsx          # Single/batch RAW dropzone & 1-click 14-bit synthetic suite loader
        │   ├── TiltInspector.tsx     # 9-zone 1:1 nearest-neighbor loupe + 5x5 contour heatmap + polar compass
        │   └── NoiseChart.tsx        # Dual-axis Log2 σ_ADU / EV DR interactive chart + G1 histogram + CSV/JSON
        └── App.tsx                   # Top bar, EXIF telemetry strip & dual-mode state orchestration
```

---

## Local Build & Development

### Prerequisites
- **Rust** (`>= 1.85`, with the `wasm32-unknown-unknown` target) and **`wasm-pack`**
- **Node.js** (`>= 20`) and `npm`
- *(Optional, for native desktop installers)* [Tauri v2 system prerequisites](https://v2.tauri.app/start/prerequisites/) (Xcode CLT on macOS, MSVC Build Tools + WebView2 on Windows, `libwebkit2gtk-4.1-dev` on Ubuntu/Debian)

### 1. Run Rust Optical & Sensor Unit Tests
```bash
cargo test --workspace
```

### 2. Build WebAssembly Core & Start Browser Dev Server
```bash
cd web
npm install
npm run build:wasm
npm run dev
```

### 3. Build Production Static Web Bundle
```bash
cd web
npm run build
```

### 4. Run or Package Tauri v2 Native Desktop App
```bash
cd web
npm run tauri:dev     # Launch native desktop debug window
npm run tauri:build   # Package installers (.exe/.msi, .dmg, .deb/.rpm/.AppImage)
```

> **macOS First-Launch Note**: macOS bundles in GitHub Releases use open-source ad-hoc signing (without paid Apple Developer notarization). If Gatekeeper reports that `"collima.app" is damaged` or from an unidentified developer on first launch, drag `collima.app` into `/Applications` and run `xattr -cr /Applications/collima.app` once in Terminal.

---

## Acknowledgments & Open-Source Notices

`collima`'s focal-plane tilt / field-curvature decoupling solver, pre-demosaic dual-green black-level-calibrated Tenengrad operator, 65,536-bin dark-frame read-noise & Dual Native ISO inflection detector, 14-bit `.DNG` physical synthetic calibrator, and 9-zone 1:1 interactive workbench are original implementations built from scratch (not a port or derivative of any other optical inspection tool). Cross-vendor RAW stream decoding and the cross-platform runtime stand on the shoulders of the following outstanding open-source projects, whose authors and maintainers we gratefully acknowledge:

- **[@ybouane](https://github.com/ybouane) — [`ybouane/flashraw`](https://github.com/ybouane/flashraw)** (`MIT OR Apache-2.0`, `Copyright (c) 2026 Yassine Bouanane and FlashRaw contributors`)
  - Memory-safe pure-Rust RAW decoding engine covering ~40 camera formats (including Sony `ARW 6.0` `X-OCN / LLVC3`, Canon `CR3`, Adobe `DNG 1.7`, Fujifilm `RAF`, etc.) and camera color-matrix calibration metadata.
- **[@lukaj99](https://github.com/lukaj99) — [`lukaj99/ticoraw`](https://github.com/lukaj99/ticoraw)** (`MIT OR Apache-2.0`, `Copyright (c) 2026 Luka Jovanovic`)
  - Clean-room bit-exact pure-Rust decoder for Nikon High Efficiency `.NEF` (`HE` / `HE*`, intoPIX TicoRAW / JPEG XS).
- **Core Ecosystem & Foundational Libraries**: [`tirr-c/jxl-oxide`](https://github.com/tirr-c/jxl-oxide) (`MIT OR Apache-2.0`, DNG 1.7 JPEG XL decoding), [`etemesi254/zune-image`](https://github.com/etemesi254/zune-image) (`MIT OR Apache-2.0 OR Zlib`), [`rustwasm/wasm-bindgen`](https://github.com/rustwasm/wasm-bindgen) (`MIT OR Apache-2.0`), [`tauri-apps/tauri`](https://github.com/tauri-apps/tauri) (`MIT OR Apache-2.0`), [`facebook/react`](https://github.com/facebook/react) (`MIT`), and [`lucide-icons/lucide`](https://github.com/lucide-icons/lucide) (`ISC`).

Full third-party copyright notices and license texts are available in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

---

## License

Dual-licensed under **[MIT](./LICENSE)** or **[Apache-2.0](./LICENSE-APACHE)**, at your option.
