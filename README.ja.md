# `collima` — カメラセンサー＆レンズ光軸・片ボケ光学診断ワークベンチ

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · **日本語**

**`collima`** は、完全ローカルで動作するクロスプラットフォーム対応のカメラセンサーおよびレンズ光学診断ワークベンチです（**ブラウザ上で即座に使える Web アプリ** と **Tauri v2 ネイティブデスクトップアプリ** の両方に対応）。コア演算部は **Rust + WebAssembly** で実装されており、RAW バイトストリームを外部サーバーへ一切送信せずローカルメモリ内のみでデコード・解析し、**React + Web Worker + HTML5 Canvas** により遅延ゼロの 1:1 等倍センサーピクセル検査を提供します。

- 🌐 **オンライン体験（GitHub Pages — 日本語 / English / 简体中文 / 繁體中文）**：<https://h-void.github.io/collima/?lang=ja>
- 📦 **マルチプラットフォーム版デスクトップアプリ・オフライン配布（Windows x64/ARM64 · macOS Apple Silicon/Intel · Linux x64/ARM64）**：[GitHub Releases](https://github.com/h-void/collima/releases)

---

## 主要機能

### 1. Optical Tilt Inspector（レンズ片ボケ・光軸ズレ＆像面湾曲検査）
- **デモザイク前の独立デュアル G チャンネル計測**：ベイヤー配列の独立した $G_1$ / $G_2$ サブプレーン上で空間勾配を個別計算して平均化することで、広角レンズ周辺の倍率色収差による偽エッジコントラストを排除しつつ、$G_1/G_2$ の斜め統合による 45° 高周波 MTF の減衰を回避します。
- **周辺減光の影響を排除する黒レベル補正済み正規化 Tenengrad 演算子**：

  $$\displaystyle S _ {G_k} = \frac{1}{N \cdot (\mu _ {G_k} - \text{BL} _ {G_k})^2} \sum _ {(x,y)} \max\left(0, G_x^2 + G_y^2 - \tau _ {\text{noise}}^2\right)$$

  チャンネルごとの公称黒レベル $\text{BL} _ {G_k}$ を明示的に減算し、局所ノイズ閾値 $\tau _ {\text{noise}}$ を適用することで、周辺減光（光信号のみを減衰させ、Sony 512 ADU や Canon 2048 ADU などの固定黒レベルオフセットを減衰させない現象）に起因する周辺先鋭度の系統的な過小評価を防ぎます。
- **像面湾曲 vs 像面傾斜（片ボケ / Tilt）の分離と星像 HFR 計測**：重み付き最小二乗法（WLS）により 1 次の傾斜平面と 2 次の放射対称減衰項を同時にフィッティングし、「大口径レンズ特有の正常な対称像面湾曲」と「マウントフランジ・アダプター・レンズ群偏心による片ボケ」を定量分離します。また天体・星景写真向けに星像 HFR（Half-Flux Radius）推定も内蔵しています。
- **9 分割 1:1 等倍同期ルーペ + フルサイズ 5×5 等高線ヒートマップ**：
  - 9 つの測定領域（`TL, TC, TR, ML, MC, MR, BL, BC, BR`）を WASM 内の `RawSession` から直接フル解像度 1:1 ピクセルとして切り出し（縮小プレビューの再拡大ではありません）、`100% / 200% / 400%` のニアレストネイバー拡大（`imageSmoothingEnabled = false`）で 9 窓同期比較が可能です。
  - **1:1 カラーデモザイク (sRGB)**・**デモザイク前 G チャンネル（倍率色収差ゼロ）**・**RAW ベイヤー CFA 配列** をワンクリックで切替可能。`Shift`+ドラッグまたは「測定枠を微調整」モードで空などの平坦部を避けて個別の測定枠を移動し、リアルタイムに先鋭度を再計算できます。

### 2. Sensor Noise Lab（センサー読み出しノイズ＆デュアルネイティブ ISO 計測）
- **1 パス $O(N)$ 厳密 65,536 ビン `u16` ヒストグラムエンジン**：6100 万画素クラスのダークフレームでも追加のソート配列確保を不要とし、低感度時の整数四分位範囲（IQR = 1~2 ADU）量子化崩壊によるガウス裾の誤除外を防ぎながら、反復 $5\sigma$ 閾値でホットピクセル・欠陥画素を精密に除外します。
- **ベイヤー 4 チャンネル ($R, G_1, G_2, B$) 独立キャリブレーション**：
  - **黒レベルドリフト（Black Level Offset）**： $\Delta \text{BL} = \mu _ {\text{clean}} - \text{BL} _ {\text{meta}}$ により、ファームウェアのゼロ点クリップやボディの遮光漏れを自動検知。
  - **読み出しノイズ ($\sigma _ {\text{ADU}}$) と ISO 100 入力換算ノイズ**： $\sigma _ {\text{norm}} = \sigma _ {\text{ADU}} \cdot (100 / \text{ISO})$。
  - **工学ダイナミックレンジ（Engineering DR, EV）**：

    $$\displaystyle \text{DR} _ {\text{EV}} = \log_2 \left( \frac{\text{WhiteLevel} - \text{BlackLevel}}{\sigma _ {\text{ADU}}} \right)$$

- **デュアルネイティブ ISO / 高変換ゲイン（HCG）切替点の自動検出**：物理的単調性と 2 階差分スロープ変化に基づきデュアルゲイン切替感度を自動特定（非 ISO インバリアントな旧世代 PGA センサーでの誤検出も抑止）し、CSV / JSON エクスポートに対応します。

### 3. 内蔵 14-bit 物理合成スイート＆ 4 言語リアクティブ UI（`ja` · `en` · `zh-CN` · `zh-TW`）
- **手元の RAW なしで即座に検証可能**：正確な PSF デフォーカス勾配・周辺減光・ショット/読み出しノイズ・HCG ゲイン切替を備えた非圧縮 14-bit RGGB `.DNG` ストリーム（片ボケ傾斜チャート、星景コマ収差/傾斜、1.4 EV 周辺減光付き合焦基準、ISO 100–6400 の 8 段ダーク系列）を WASM メモリ上でリアルタイム合成し、本番と同一のデコードパイプラインへ投入できます。
- **4 言語リアルタイム切替**：OS / ブラウザ言語の自動検出（`?lang=ja|en|zh-CN|zh-TW` URL パラメータおよび `localStorage` 保存対応）を備え、60MP RAW を再デコードすることなく診断レポートや UI を瞬時に切り替えられます。

---

## テスト用 RAW の撮影ガイド

- **レンズの片ボケ・光軸検査（RAW 1 枚で診断可能）**：
  1. **光軸に対して正対した高精細テクスチャ平面**（画面四隅まで収まる遠景ビルの壁面、平坦なレンガ壁、解像チャート、または無限遠の**天頂付近の星空**）を被写体に選びます。
  2. レンズを**絞り開放**（被写界深度が最も浅く、像面傾斜に最も敏感）、**ベース ISO（ISO 64〜100 等）** に設定し、三脚固定＋手ブレ補正 OFF＋電子先幕/サイレントシャッター（または高速シャッター）で **画面中央（`MC`）** に厳密にピントを合わせて撮影します。
- **センサー読み出しノイズ＆デュアルネイティブ ISO 計測（複数 ISO のダーク RAW）**：
  1. **ボディキャップ（またはレンズキャップ）** を確実に装着し、ファインダーからの迷光も遮光して暗所で撮影します。
  2. **マニュアル露出（`M`）＋マニュアルフォーカス（`MF`）**、長秒時ノイズリダクション OFF、シャッター速度 **`1/1000 秒` 〜 `1/4000 秒`**（熱暗電流を排除し純粋な読み出しノイズのみを抽出）に固定し、最低感度から高感度まで 1 段または 1/3 段刻みで非圧縮 / ロスレス圧縮 RAW を撮影します（例：ISO 100, 200, 400, 500, 640, 800, 1600, 3200, 6400）。

---

## デュアルエンジン純 Rust / WASM RAW デコード対応表

近年 Nikon や Sony がシネマカメラ由来の最新ウェーブレット圧縮 RAW をスチル機へ導入している状況に対応するため、`collima-core` は **MIT/Apache-2.0 純 Rust デュアルエンジン構成** を採用しています：

| デコードエンジン | 対応カメラ・圧縮フォーマット |
| --- | --- |
| [`flashraw 0.2`](https://github.com/ybouane/flashraw) | 約 40 種類のカメラ RAW に対応：**Sony `ARW 6.0` コンテナの `X-OCN / LLVC3` 5/3 ウェーブレット圧縮**（α7 V `ILCE-7M5` / α7R VI `ILCE-7RM6` で導入された CineAlta 由来の「圧縮 HQ」）、Sony ロスレス圧縮 ARW (`L/M/S`) およびピクセルシフト `.ARQ`、Canon `.CR3` (`CRX` ロスレス & `C-RAW`) / `.CR2`、従来の Nikon `.NEF`（非圧縮 / ロスレス圧縮 / 従来圧縮）、Adobe `.DNG`（DNG 1.7 JPEG XL 圧縮対応）、Fujifilm `.RAF`（X-Trans 6×6 対応）、Panasonic/Leica `.RW2` / `.RWL`、OM/Olympus `.ORF`、Pentax `.PEF`、Hasselblad `.3FR`、Phase One `.IIQ`。 |
| [`ticoraw 0.2`](https://github.com/lukaj99/ticoraw) | **Nikon 高効率圧縮 `.NEF`（High Efficiency `HE` および `HE*`）** 専用の純 Rust クリーンルーム・ビット正確デコーダ。Nikon Z9、Z8、Zf、Z6III、Z5II、Z50II、ZR などの intoPIX TicoRAW / N-RAW 由来 JPEG XS サブバンド・ウェーブレットストリームを完全解析し、`flashraw` で抽出したレンズ・露出 EXIF メタデータと自動統合します。 |

---

## ディレクトリ構成

```text
collima/
├── README.md                         # ドキュメント (English, デフォルト)
├── README.zh-CN.md                   # ドキュメント (简体中文)
├── README.zh-TW.md                   # ドキュメント (繁體中文)
├── README.ja.md                      # ドキュメント (日本語)
├── THIRD-PARTY-NOTICES.md            # サードパーティ製 OSS 著作権・ライセンス表記
├── Cargo.toml                        # Rust Workspace & LTO Release プロファイル設定
├── crates/
│   └── collima-core/                 # 光学・センサーノイズ計測コアライブラリ (cdylib + rlib, wasm32 対応)
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                # WASM バインディング (RawSession セッション保持 + ダーク一括解析)
│           ├── decoder.rs            # インメモリ 2 エンジンデコード (flashraw + ticoraw) & 有効画素領域切り出し
│           ├── bayer.rs              # R/G1/G2/B プレーン分離、色行列 2x2 プレビュー & 1:1 パッチ描画
│           ├── sharpness.rs          # 黒レベル補正済み G1/G2 Tenengrad、星像 HFR & WLS Tilt 分離
│           ├── noise.rs              # 65,536 ビン厳密ヒストグラム、5σ ホットピクセル除外 & HCG 検出
│           └── synthetic.rs          # 内蔵 14-bit 非圧縮 RGGB .DNG 物理キャリブレーション生成器
├── src-tauri/                        # Tauri v2 ネイティブデスクトップシェル (Windows / macOS / Linux)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/lib.rs                    # ネイティブ保存ダイアログ出力等のデスクトップブリッジ
└── web/                              # React + TypeScript + Vite ワークベンチ UI
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── i18n/                     # 4 言語辞書 (ja/en/zh-CN/zh-TW)、診断メッセージの動的翻訳 & Context
        ├── types/collima.ts          # 型定義およびゼロコピー Worker メッセージプロトコル
        ├── workers/analyzer.worker.ts# 専用 Web Worker による WASM ライフサイクル＆バッチキュー管理
        ├── components/
        │   ├── LanguageSwitcher.tsx  # トップバー言語スイッチャー
        │   ├── DropZone.tsx          # 単枚/一括 RAW ドロップ検証＆ワンクリック合成スイート起動
        │   ├── TiltInspector.tsx     # 9 分割 1:1 ニアレストネイバールーペ + 5x5 等高線ヒートマップ + コンパス
        │   └── NoiseChart.tsx        # 2 軸対数 σ_ADU / EV ダイナミックレンジ曲線 + G1 ヒストグラム + CSV/JSON
        └── App.tsx                   # トップバー、EXIF テレメトリバー＆モード状態管理
```

---

## ローカルビルド＆開発手順

### 必要環境
- **Rust**（`>= 1.85`、`wasm32-unknown-unknown` ターゲット含む）および **`wasm-pack`**
- **Node.js**（`>= 20`）および `npm`
- *(任意：デスクトップ版インストーラをビルドする場合)* [Tauri v2 システム依存パッケージ](https://v2.tauri.app/start/prerequisites/)（macOS は Xcode CLT、Windows は MSVC Build Tools + WebView2、Ubuntu/Debian は `libwebkit2gtk-4.1-dev` 等）

### 1. Rust 光学・センサー単体テストの実行
```bash
cargo test --workspace
```

### 2. WebAssembly コアのビルド＆ブラウザ開発サーバー起動
```bash
cd web
npm install
npm run build:wasm
npm run dev
```

### 3. 本番用 Web 静的アセットのビルド
```bash
cd web
npm run build
```

### 4. Tauri v2 ネイティブデスクトップ版の起動・パッケージング
```bash
cd web
npm run tauri:dev     # デスクトップデバッグウィンドウを起動
npm run tauri:build   # 各 OS 向けインストーラを生成 (.exe/.msi, .dmg, .deb/.rpm/.AppImage)
```

> **macOS デスクトップ版の初回起動について**：GitHub Releases の macOS 版パッケージはオープンソースの Ad-hoc 署名でビルドされています（有料 Apple Developer 公証なし）。初回起動時に「壊れているため開けません」または「開発元を検証できません」と表示された場合は、`collima.app` を `/Applications` に移動した上で、ターミナルから一度だけ `xattr -cr /Applications/collima.app` を実行してください。

---

## 謝辞およびオープンソースライセンス表記

`collima` の像面傾斜／像面湾曲分離ソルバー、デモザイク前デュアル G 黒レベル補正 Tenengrad 演算子、65,536 ビン読み出しノイズ＆デュアルネイティブ ISO 検出エンジン、14-bit `.DNG` 物理合成キャリブレータ、および 9 分割 1:1 インタラクティブ検査 UI は、すべてゼロから設計された独自のオリジナル実装です（他の類似ツールの移植や派生ではありません）。マルチベンダー RAW ストリームのデコードおよびクロスプラットフォーム実行基盤は以下の優れたオープンソースプロジェクトに支えられており、開発者・メンテナの皆様に心より感謝申し上げます：

- **[@ybouane](https://github.com/ybouane) — [`ybouane/flashraw`](https://github.com/ybouane/flashraw)** (`MIT OR Apache-2.0`, `Copyright (c) 2026 Yassine Bouanane and FlashRaw contributors`)
  - 約 40 種類のカメラ RAW フォーマット（Sony `ARW 6.0` `X-OCN / LLVC3`、Canon `CR3`、Adobe `DNG 1.7`、Fujifilm `RAF` 等）に対応するメモリ安全な純 Rust デコードエンジンおよび色行列キャリブレーションデータベース。
- **[@lukaj99](https://github.com/lukaj99) — [`lukaj99/ticoraw`](https://github.com/lukaj99/ticoraw)** (`MIT OR Apache-2.0`, `Copyright (c) 2026 Luka Jovanovic`)
  - Nikon 高効率圧縮 `.NEF`（High Efficiency `HE` / `HE*`、intoPIX TicoRAW / JPEG XS）専用の純 Rust クリーンルーム・ビット正確デコーダ。
- **コアエコシステム＆基盤ライブラリ**：[`tirr-c/jxl-oxide`](https://github.com/tirr-c/jxl-oxide) (`MIT OR Apache-2.0`, DNG 1.7 JPEG XL デコード)、[`etemesi254/zune-image`](https://github.com/etemesi254/zune-image) (`MIT OR Apache-2.0 OR Zlib`)、[`rustwasm/wasm-bindgen`](https://github.com/rustwasm/wasm-bindgen) (`MIT OR Apache-2.0`)、[`tauri-apps/tauri`](https://github.com/tauri-apps/tauri) (`MIT OR Apache-2.0`)、[`facebook/react`](https://github.com/facebook/react) (`MIT`)、および [`lucide-icons/lucide`](https://github.com/lucide-icons/lucide) (`ISC`)。

サードパーティ製オープンソースソフトウェアの完全な著作権表示とライセンス全文は [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) をご参照ください。

---

## License

Dual-licensed under **[MIT](./LICENSE)** or **[Apache-2.0](./LICENSE-APACHE)**, at your option.
