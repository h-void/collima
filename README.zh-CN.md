# `collima` — 相机传感器与镜头光轴光学诊断工作台

[English](./README.md) · **简体中文** · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

纯本地运行的跨平台相机 RAW 光学与底噪诊断工作台（**Web 在线即用** + **Tauri v2 原生桌面端**）。基于 **Rust + WebAssembly** 在本地内存完成解码与像素统计（零上传），提供零延迟 1:1 传感器像素检视。

- 🌐 **在线工作台**：<https://h-void.github.io/collima/?lang=zh-CN> *（简体中文 · 繁體中文 · English · 日本語）*
- 📦 **桌面端下载**：[GitHub Releases](https://github.com/h-void/collima/releases) *（Windows x64/ARM64 · macOS Apple Silicon/Intel · Linux x64/ARM64）*
  > **macOS 提示**：安装包为开源 Ad-hoc 签名；首次打开若提示「已损坏 / 无法验证开发者」，拖入 `/Applications` 后在终端执行一次 `xattr -cr /Applications/collima.app` 即可。

---

## 核心功能

- **Optical Tilt Inspector（光轴倾斜与场曲检视）** — 九宫格 1:1 最近邻同步放大镜（`100% / 200% / 400%`）、全画幅 5×5 等高线热力图与极坐标倾角罗盘。直接在去马赛克前的独立 $G_1 / G_2$ 绿通道上计算锐度与星点 HFR，剥离暗角与边缘色散干扰，定量区分正常对称场曲与卡口/镜组偏心倾斜（Tilt）。
- **Sensor Noise Lab（底噪与双原生 ISO 测绘）** — 拜耳四通道（$R, G_1, G_2, B$）独立测算黑电平漂移、读出噪声（$\sigma _ {\text{ADU}}$ 与 ISO 100 归一化）与工程动态范围（EV），自动捕获**双原生 ISO（HCG）**切换拐点，支持导出 CSV / JSON。
- **内置 14-bit 合成样张与四语实时切换** — 无需真机 RAW 即可在内存中合成 14-bit `.DNG` 标定样张体验完整管线；切换语言无需重新解码 60MP RAW。

<details>
<summary><strong>核心光学与传感器算法公式（点击展开）</strong></summary>

- **黑电平校准归一化 Tenengrad 算子**（在原始拜耳 $G_1 / G_2$ 独立子平面计算，消除边缘暗角与固定黑电平偏置导致的边缘锐度低估）：

  $$\displaystyle S _ {G_k} = \frac{1}{N \cdot (\mu _ {G_k} - \text{BL} _ {G_k})^2} \sum _ {(x,y)} \max\left(0, G_x^2 + G_y^2 - \tau _ {\text{noise}}^2\right)$$

- **场曲与光轴倾斜解耦**：加权最小二乘（WLS）联合拟合一阶倾斜平面与二阶径向对称衰减项。
- **读出噪声与工程动态范围**（单遍 $O(N)$ 精确 65,536 桶 `u16` 直方图 + 迭代 $5\sigma$ 热像素剥离）：

  $$\displaystyle \text{DR} _ {\text{EV}} = \log_2 \left( \frac{\text{WhiteLevel} - \text{BlackLevel}}{\sigma _ {\text{ADU}}} \right)$$

</details>

---

## 支持的 RAW 格式

| 解码引擎 | 覆盖相机与压缩格式 |
| --- | --- |
| [`flashraw 0.2`](https://github.com/ybouane/flashraw) | 约 40 种 RAW 格式：**索尼 `.ARW` / `.ARQ`**（含 α7 V / α7R VI 的 `ARW 6.0` `X-OCN / LLVC3`「已压缩 HQ」与无损压缩）、**佳能 `.CR3` / `.CR2`**、传统**尼康 `.NEF`**、**Adobe `.DNG`**（含 DNG 1.7 JPEG XL）、**富士 `.RAF`**（含 X-Trans）、**松下/徕卡 `.RW2` / `.RWL`**、**奥林巴斯/OM `.ORF`**、**宾得 `.PEF`**、**哈苏 `.3FR`**、**飞思 `.IIQ`**。 |
| [`ticoraw 0.2`](https://github.com/lukaj99/ticoraw) | **尼康高效率压缩 `.NEF`（`HE` / `HE*`）** 纯 Rust 位精确 JPEG XS 小波解码器，支持 Z9、Z8、Zf、Z6III、Z5II、Z50II、ZR（自动融合 `flashraw` EXIF 元数据）。 |

---

## 测试样张拍摄指南

- **测镜头光轴倾斜（1 张 RAW）**：对准与光轴正交的平面细节目标（填满四角的远景建筑立面、平整砖墙或**天顶星野**），**最大光圈全开** + **最低原生 ISO**，三脚架关闭防抖并用电子前帘/电子快门，对焦锁定**画面正中心（`MC`）**。
- **测传感器底噪与双原生 ISO（多档暗帧 RAW）**：暗处盖紧**机身盖/镜头盖**并遮住**取景器**，`M` 档 + `MF`、关闭长曝光降噪，快门固定 **`1/1000 s` – `1/4000 s`**，按各档 ISO（如 100–6400）各拍一张未压缩或无损压缩 RAW。

<details>
<summary><strong>本地构建与开发（点击展开）</strong></summary>

需安装 **Rust `>= 1.85`**（含 `wasm32-unknown-unknown`）、**`wasm-pack`**、**Node.js `>= 20`**（打包桌面端另需 [Tauri v2 系统依赖](https://v2.tauri.app/start/prerequisites/)）：

```bash
cargo test --workspace              # 运行 Rust 光学与底噪单元测试
cd web && npm install
npm run build:wasm && npm run dev   # 编译 WASM 并启动浏览器工作台
npm run build                       # 构建生产静态包
npm run tauri:build                 # 打包原生桌面安装包 (.exe/.msi, .dmg, .deb/.rpm/.AppImage)
```

</details>

---

## 致谢与开源协议

`collima` 的光轴倾斜/场曲解耦求解器、去马赛克前双绿校准 Tenengrad、65,536 桶底噪与双原生 ISO 引擎、14-bit `.DNG` 物理合成器及九宫格 1:1 交互界面均为独立原创实现。底层跨品牌 RAW 解码与运行时基于以下优秀开源项目：

- **[@ybouane](https://github.com/ybouane) / [`flashraw`](https://github.com/ybouane/flashraw)** (`MIT OR Apache-2.0`) — 约 40 种相机 RAW 纯 Rust 解码引擎（含索尼 `ARW 6.0` `X-OCN`、佳能 `CR3`、`DNG 1.7`）与色彩矩阵库。
- **[@lukaj99](https://github.com/lukaj99) / [`ticoraw`](https://github.com/lukaj99/ticoraw)** (`MIT OR Apache-2.0`) — 尼康高效率压缩 `.NEF`（`HE` / `HE*`）纯 Rust 洁净室解码器。
- **核心生态**：[`jxl-oxide`](https://github.com/tirr-c/jxl-oxide)、[`zune-image`](https://github.com/etemesi254/zune-image)、[`wasm-bindgen`](https://github.com/rustwasm/wasm-bindgen)、[`tauri`](https://github.com/tauri-apps/tauri)、[`react`](https://github.com/facebook/react) 与 [`lucide`](https://github.com/lucide-icons/lucide)，完整版权声明见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

本项目采用 **[MIT](./LICENSE)** 或 **[Apache-2.0](./LICENSE-APACHE)** 双重许可（任选其一）。
