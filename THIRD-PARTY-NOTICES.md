# Third-Party Open-Source Notices

`collima` is an original optical tilt and sensor read-noise metrology workbench dual-licensed under [MIT](./LICENSE) or [Apache-2.0](./LICENSE-APACHE). Its WebAssembly core, browser frontend, and Tauri v2 desktop distributions link against the following open-source libraries, whose authors and maintainers we gratefully acknowledge.

---

## 1. `flashraw` (`ybouane/flashraw`)

- **Repository**: <https://github.com/ybouane/flashraw>
- **License**: `MIT OR Apache-2.0`
- **Copyright**: Copyright (c) 2026 Yassine Bouanane and FlashRaw contributors

```text
MIT License

Copyright (c) 2026 Yassine Bouanane and FlashRaw contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. `ticoraw` (`lukaj99/ticoraw`)

- **Repository**: <https://github.com/lukaj99/ticoraw>
- **License**: `MIT OR Apache-2.0`
- **Copyright**: Copyright (c) 2026 Luka Jovanovic

```text
MIT License

Copyright (c) 2026 Luka Jovanovic

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. Core Ecosystem & Transitive Libraries

| Component | Repository | License | Copyright / Authors |
| --- | --- | --- | --- |
| **`jxl-oxide`** | <https://github.com/tirr-c/jxl-oxide> | `MIT OR Apache-2.0` | Copyright (c) Wonwoo Choi (`tirr-c`) and contributors |
| **`zune-jpeg` / `zune-inflate`** | <https://github.com/etemesi254/zune-image> | `MIT OR Apache-2.0 OR Zlib` | Copyright (c) Caleb Etemesi and contributors |
| **`zlib-rs`** | <https://github.com/trifectatechfoundation/zlib-rs> | `Zlib` | Copyright (c) Trifecta Tech Foundation |
| **`wasm-bindgen` / `js-sys`** | <https://github.com/rustwasm/wasm-bindgen> | `MIT OR Apache-2.0` | Copyright (c) The `wasm-bindgen` Developers |
| **`serde` / `serde_json` / `thiserror`** | <https://github.com/serde-rs/serde> | `MIT OR Apache-2.0` | Copyright (c) Erick Tryzelaar, David Tolnay |
| **`rayon` / `crossbeam`** | <https://github.com/rayon-rs/rayon> | `MIT OR Apache-2.0` | Copyright (c) Josh Stone, Niko Matsakis, The Crossbeam Project Developers |
| **`tauri` (`@tauri-apps/*`)** | <https://github.com/tauri-apps/tauri> | `MIT OR Apache-2.0` | Copyright (c) Tauri Programme within The Commons Conservancy |
| **`react` / `react-dom`** | <https://github.com/facebook/react> | `MIT` | Copyright (c) Meta Platforms, Inc. and affiliates |
| **`lucide-react`** | <https://github.com/lucide-icons/lucide> | `ISC` | Copyright (c) Cole Bemis and Lucide Contributors |
| **`tailwindcss`** | <https://github.com/tailwindlabs/tailwindcss> | `MIT` | Copyright (c) Tailwind Labs, Inc. |
| **`@fontsource/inter`** (`Inter`) | <https://github.com/rsms/inter> | `OFL-1.1` | Copyright 2016 The Inter Project Authors |
| **`@fontsource/jetbrains-mono`** (`JetBrains Mono`) | <https://github.com/JetBrains/JetBrainsMono> | `OFL-1.1` | Copyright 2020 The JetBrains Mono Project Authors |

---

## 4. Bundled Typefaces (SIL Open Font License 1.1)

The web and Tauri desktop distributions bundle Latin subsets of the **Inter** and **JetBrains Mono** typefaces via Fontsource for offline-capable metrology typography:

- **Inter**: Copyright 2016 The Inter Project Authors (<https://github.com/rsms/inter>) — licensed under the SIL Open Font License, Version 1.1 (`OFL-1.1`).
- **JetBrains Mono**: Copyright 2020 The JetBrains Mono Project Authors (<https://github.com/JetBrains/JetBrainsMono>) — licensed under the SIL Open Font License, Version 1.1 (`OFL-1.1`).

Full license text is available at <https://scripts.sil.org/OFL> and distributed with the `@fontsource/inter` and `@fontsource/jetbrains-mono` packages.

