# `collima` — カメラセンサー＆レンズ光軸・片ボケ光学診断ワークベンチ

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · **日本語**

完全ローカルで動作するクロスプラットフォーム対応のカメラ RAW 光学・センサーノイズ診断ワークベンチ（**ブラウザ Web 版** + **Tauri v2 デスクトップ版**）。**Rust + WebAssembly** によりローカルメモリ内のみで RAW を解析（外部送信ゼロ）し、遅延のない 1:1 等倍ピクセル検査を提供します。

- 🌐 **オンライン版**：<https://h-void.github.io/collima/?lang=ja> *（日本語 · English · 简体中文 · 繁體中文）*
- 📦 **デスクトップ版**：[GitHub Releases](https://github.com/h-void/collima/releases) *（Windows x64/ARM64 · macOS Apple Silicon/Intel · Linux x64/ARM64）*
  > **macOS 初回起動メモ**：Ad-hoc 署名のため、初回起動時に警告が出た場合は `/Applications` へ移動後、ターミナルで一度 `xattr -cr /Applications/collima.app` を実行してください。

---

## 主な機能

- **Optical Tilt Inspector（片ボケ・光軸ズレ＆像面湾曲検査）** — 9 分割 1:1 ニアレストネイバー同期ルーペ（`100% / 200% / 400%`）、5×5 等高線ヒートマップ、傾斜コンパスを搭載。デモザイク前の独立した $G_1 / G_2$ チャンネル先鋭度と星像 HFR から周辺減光・倍率色収差の影響を排除し、正常な対称像面湾曲とマウント/レンズ群の片ボケ（Tilt）を定量分離します。
- **Sensor Noise Lab（読み出しノイズ＆デュアルネイティブ ISO 計測）** — ベイヤー 4 チャンネル（$R, G_1, G_2, B$）の黒レベルドリフト、読み出しノイズ（$\sigma _ {\text{ADU}}$・ISO 100 換算）、工学ダイナミックレンジ（EV）を算出し、**デュアルネイティブ ISO（HCG）**切替点を自動検出。CSV / JSON 出力対応。
- **14-bit 合成スイート内蔵＆ 4 言語リアルタイム切替** — 手元に RAW がなくてもメモリ合成 14-bit `.DNG` で即座に検証可能。60MP RAW を再デコードせずに表示言語を瞬時に切り替えられます。

<details>
<summary><strong>光学・センサー計測アルゴリズムと数式（クリックで展開）</strong></summary>

- **黒レベル補正済み正規化 Tenengrad 演算子**（独立した $G_1 / G_2$ サブプレーン上で計算し、周辺減光と固定黒レベルオフセットによる周辺先鋭度の過小評価を防止）：

  $$\displaystyle S _ {G_k} = \frac{1}{N \cdot (\mu _ {G_k} - \text{BL} _ {G_k})^2} \sum _ {(x,y)} \max\left(0, G_x^2 + G_y^2 - \tau _ {\text{noise}}^2\right)$$

- **像面湾曲と片ボケ（Tilt）の分離**：重み付き最小二乗法（WLS）により 1 次傾斜平面と 2 次放射対称減衰項を同時フィッティング。
- **読み出しノイズと工学ダイナミックレンジ**（1 パス $O(N)$ 厳密 65,536 ビン `u16` ヒストグラム + 反復 $5\sigma$ ホットピクセル除外）：

  $$\displaystyle \text{DR} _ {\text{EV}} = \log_2 \left( \frac{\text{WhiteLevel} - \text{BlackLevel}}{\sigma _ {\text{ADU}}} \right)$$

</details>

---

## 対応 RAW フォーマット

| エンジン | 対応カメラ・圧縮方式 |
| --- | --- |
| [`flashraw 0.3`](https://github.com/ybouane/flashraw) | 約 40 種類の RAW：**Sony `.ARW` / `.ARQ`**（α7 V / α7R VI の `ARW 6.0` `X-OCN / LLVC3`「圧縮 HQ」・ロスレス圧縮対応）、**Canon `.CR3` / `.CR2`**、従来の **Nikon `.NEF`**、**Adobe `.DNG`**（DNG 1.7 JPEG XL 対応）、**Fujifilm `.RAF`**（X-Trans 対応）、**Lumix/Leica `.RW2` / `.RWL`**、**OM `.ORF`**、**Pentax `.PEF`**、**Hasselblad `.3FR`**、**Phase One `.IIQ`**。 |
| [`ticoraw 0.2`](https://github.com/lukaj99/ticoraw) | **Nikon 高効率圧縮 `.NEF`（`HE` / `HE*`）** 専用純 Rust ビット正確 JPEG XS ウェーブレットデコーダ。Z9、Z8、Zf、Z6III、Z5II、Z50II、ZR に対応（EXIF は `flashraw` と自動統合）。 |

---

## テスト用 RAW の撮影方法

- **レンズ片ボケ検査（RAW 1 枚）**：光軸に正対した平面テクスチャ（四隅まで入る遠景ビル壁面・レンガ壁、または**天頂付近の星空**）を、**絞り開放**・**ベース ISO**・三脚固定（手ブレ補正 OFF・電子先幕/電子シャッター）で **画面中央（`MC`）** にピントを合わせて撮影。
- **センサーノイズ＆デュアル ISO 計測（複数 ISO のダーク RAW）**：暗所で**ボディキャップ装着＋ファインダー遮光**し、`M` 露出 + `MF`・長秒時 NR OFF・シャッター速度 **`1/1000 秒` 〜 `1/4000 秒`** で各 ISO 感度（例：ISO 100〜6400）の非圧縮 / ロスレス RAW を撮影。

<details>
<summary><strong>ローカルビルド＆開発手順（クリックで展開）</strong></summary>

**Rust `>= 1.88`**（`wasm32-unknown-unknown` 含む）・**`wasm-pack`**・**Node.js `>= 20.19`**（デスクトップ版パッケージングは [Tauri v2 依存環境](https://v2.tauri.app/start/prerequisites/) も必要）：

```bash
cargo test --workspace              # Rust 単体テスト実行
cd web && npm install
npm run build:wasm && npm run dev   # WASM ビルド＆開発サーバー起動
npm run build                       # 本番用 Web 静的ビルド
npm run tauri:build                 # ネイティブインストーラ生成 (.exe/.msi, .dmg, .deb/.rpm/.AppImage)
```

</details>

---

## 謝辞とライセンス

`collima` の片ボケ/像面湾曲分離ソルバー、デモザイク前デュアル G Tenengrad、65,536 ビン読み出しノイズ＆デュアルネイティブ ISO 検出器、14-bit `.DNG` 合成キャリブレータ、9 分割 1:1 検査 UI はすべて独自のオリジナル実装です。RAW デコードと実行基盤は以下の OSS を利用しています：

- **[@ybouane](https://github.com/ybouane) / [`flashraw`](https://github.com/ybouane/flashraw)** (`MIT OR Apache-2.0`) — 約 40 形式対応の純 Rust RAW デコーダ（Sony `ARW 6.0` `X-OCN`、Canon `CR3`、`DNG 1.7` 等）＆色行列データ。
- **[@lukaj99](https://github.com/lukaj99) / [`ticoraw`](https://github.com/lukaj99/ticoraw)** (`MIT OR Apache-2.0`) — Nikon 高効率圧縮 `.NEF`（`HE` / `HE*`）純 Rust クリーンルームデコーダ。
- **エコシステム**：[`jxl-oxide`](https://github.com/tirr-c/jxl-oxide)、[`zune-image`](https://github.com/etemesi254/zune-image)、[`wasm-bindgen`](https://github.com/rustwasm/wasm-bindgen)、[`tauri`](https://github.com/tauri-apps/tauri)、[`react`](https://github.com/facebook/react)、[`lucide`](https://github.com/lucide-icons/lucide) — 詳細は [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) を参照。

**[MIT](./LICENSE)** または **[Apache-2.0](./LICENSE-APACHE)** のデュアルライセンスで提供されます。
