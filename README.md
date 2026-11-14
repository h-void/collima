# `collima` — 相机传感器与镜头光轴光学诊断工作台

**`collima`** 是一个纯本地运行的跨平台相机与镜头光学诊断工作台（支持 **Web 浏览器在线即开即用** 与 **Tauri v2 原生桌面端**）。底层基于 **Rust + WebAssembly** 实现纯内存（零云端上传）RAW 原始字节流解码与拜耳像素统计，前端基于 **React + Web Worker + HTML5 Canvas** 提供零延迟的 1:1 像素级视觉检视。

- 🌐 **在线体验（GitHub Pages，支持 简体中文 / 繁體中文 / English / 日本語）**：<https://h-void.github.io/collima/>
- 📦 **全平台桌面端与离线包下载（Windows x64/ARM64 · macOS Apple Silicon/Intel · Linux x64/ARM64）**：[GitHub Releases](https://github.com/h-void/collima/releases)

---

## 核心能力闭环

### 1. Optical Tilt Inspector（镜头光轴倾斜与场曲诊断）
- **去马赛克前独立双绿通道测量**：直接在原始拜耳阵列的 $G_1$ 与 $G_2$ 独立子平面上分别计算梯度并取均值，既规避广角镜头边缘横向色差（倍率色散）造成的伪边缘对比度，又避免将 $G_1/G_2$ 斜向合并导致的 45° 高频细节衰减。
- **消除暗角干扰的黑电平校准归一化 Tenengrad 算子**：

  $$\displaystyle S _ {G_k} = \frac{1}{N \cdot (\mu _ {G_k} - \text{BL} _ {G_k})^2} \sum _ {(x,y)} \max\negthinspace\left(0,\thickspace G_x^2 + G_y^2 - \tau _ {\text{noise}}^2\right)$$

  显式扣除通道标称黑电平 $\text{BL} _ {G_k}$ 并施加局部底噪门限 $\tau _ {\text{noise}}$，防止镜头边缘暗角（Vignetting）因仅衰减光信号而不衰减固定黑电平偏置（如索尼 512 / 佳能 2048 ADU）所引发的系统性边缘锐度低估。
- **场曲 vs 光轴倾斜（Tilt）解耦与星野 HFR 检测**：采用加权最小二乘（WLS）拟合一阶倾斜平面与二阶径向对称衰减项，自动区分「大光圈正常对称场曲」与「卡口法兰/转接环/镜组偏心导致的单侧塌陷」，并内置点光源半通量半径（Star HFR）估算。
- **九宫格 1:1 同步放大镜 + 全画幅 5×5 等高线热力图**：
  - 9 个视口（`TL, TC, TR, ML, MC, MR, BL, BC, BR`）直接从 WASM 驻留 `RawSession` 实时切片全分辨率 1:1 传感器像素（绝非半尺寸预览图二次插值放大），支持 `100% / 200% / 400%` 最近邻（`imageSmoothingEnabled = false`）同步检视。
  - 支持一键切换 **1:1 色彩解马赛克 (sRGB)**、**去马赛克前纯绿通道** 与 **原始拜耳 CFA 阵列**，支持按住 `Shift` 或开启「微调采样点」单独拖动局部采样框避开纯色天空并实时重算锐度。

### 2. Sensor Noise Lab（传感器读出噪声与双原生 ISO 测绘）
- **单遍 $O(N)$ 精确 65,536 桶 `u16` 直方图引擎**：无需为 6100 万像素暗帧分配额外排序数组，避免低 ISO 下整数四分位距（IQR = 1~2 ADU）量化坍缩误杀正常高斯尾部，以迭代 $5\sigma$ 门限精准剥离长曝光热像素（Hot Pixels）与坏点。
- **拜耳四通道 ($R, G_1, G_2, B$) 独立标定**：
  - **黑电平漂移（Black Level Offset）**： $\Delta \text{BL} = \mu _ {\text{clean}} - \text{BL} _ {\text{meta}}$，自动检测固件零点截断（Zero Clipping）与机身漏光。
  - **读出噪声 ($\sigma _ {\text{ADU}}$) 与 ISO 100 归一化等效输入底噪**： $\sigma _ {\text{norm}} = \sigma _ {\text{ADU}} \cdot (100 / \text{ISO})$。
  - **工程动态范围（Engineering DR, EV）**：

    $$\displaystyle \text{DR} _ {\text{EV}} = \log_2 \left( \frac{\text{WhiteLevel} - \text{BlackLevel}}{\sigma _ {\text{ADU}}} \right)$$

- **双原生 ISO / 高转换增益（HCG）拐点自动捕获**：基于物理单调性与二阶斜率跳变判据，精准标注双原生 ISO 增益切换点（同时免疫老款非 ISO 不变性传感器的平滑 PGA 增益曲线误报），支持一键导出 CSV / JSON 标定数据。

### 3. 四语实时响应国际化（`zh-CN` · `zh-TW` · `en` · `ja`）
- 自动匹配操作系统 / 浏览器语言偏好（亦支持 `?lang=zh-CN|zh-TW|en|ja` 参数直达与 `localStorage` 记忆），顶栏一键切换语言时无需重新解码 60MP RAW 字节流即可实时重译全部光学与底噪诊断报告。

---

## 双引擎纯 Rust / WASM RAW 解码矩阵（含尼康 / 索尼最新视频源压缩格式）

针对近年尼康与索尼将自家电影机/视频 RAW 压缩技术下放至静态照片 RAW 的趋势，`collima-core` 采用 **MIT/Apache-2.0 纯 Rust 双解码引擎架构**：

| 解码引擎 | 覆盖相机与压缩编码格式 |
| --- | --- |
| **`flashraw 0.2`** | 覆盖约 40 种相机 RAW 格式：原生支持 **索尼 `ARW 6.0` 容器下的 `X-OCN / LLVC3` 5/3 小波压缩**（即 α7 V `ILCE-7M5` / α7R VI `ILCE-7RM6` 下放自 CineAlta 电影机的「已压缩 HQ / 新已压缩」编码）、索尼无损压缩 ARW (`L/M/S`)、佳能 `.CR3` (`CRX` 无损与 `C-RAW`) / `.CR2`、传统尼康 `.NEF`（未压缩 / 无损 / 传统有损）、Adobe `.DNG`（含 DNG 1.7 JPEG XL 压缩）、富士 `.RAF`（含 X-Trans 6×6）、松下/徕卡 `.RW2` / `.RWL`、奥林巴斯/OM `.ORF`、宾得 `.PEF`、哈苏 `.3FR`、飞思 `.IIQ`。 |
| **`ticoraw 0.2`** | 专为 **尼康高效率压缩 `.NEF`（High Efficiency `HE` 与 `HE*`）** 打造的纯 Rust 洁净室位精确解码器，完整解析尼康 Z9、Z8、Zf、Z6III、Z5II、Z50II、ZR 等机型源自 intoPIX TicoRAW / N-RAW 的 JPEG XS 亚像素小波码流，并自动融合 `flashraw` 提取的镜头与曝光 EXIF 元数据。 |

---

## 仓库目录结构

```text
collima/
├── Cargo.toml                        # Rust Workspace 与 LTO Release 编译配置
├── crates/
│   └── collima-core/                 # 核心光学与底噪计算库 (cdylib + rlib, 兼容 wasm32-unknown-unknown)
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                # WASM 导出接口 (RawSession 状态会话 + 批量暗帧接口)
│           ├── decoder.rs            # 纯内存双引擎解码 (flashraw + ticoraw) 与有效画幅/CFA 校准
│           ├── bayer.rs              # R/G1/G2/B 四平面分离、色彩矩阵 2x2 预览与 1:1 局部切片渲染
│           ├── sharpness.rs          # 黑电平校准 G1/G2 Tenengrad、星点 HFR 与 WLS Tilt 向量解耦
│           ├── noise.rs              # 65536 桶精确直方图、5σ 热像素剔除与双原生 ISO 拐点检测
│           └── synthetic.rs          # 内置 14-bit 未压缩 RGGB .DNG 物理标定样张生成器
├── src-tauri/                        # Tauri v2 原生桌面端外壳 (Windows / macOS / Linux)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/lib.rs                    # 原生系统保存对话框导出等桌面端命令桥接
└── web/                              # React + TypeScript + Vite 交互工作台
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── i18n/                     # 四语词典 (zh-CN/zh-TW/en/ja)、诊断动态本地化与 I18nProvider
        ├── types/collima.ts          # 前后端强类型契约与 Worker 零拷贝消息协议
        ├── workers/analyzer.worker.ts# 独立 Web Worker 线程管理 WASM 生命周期与串行批处理队列
        ├── components/
        │   ├── LanguageSwitcher.tsx  # 顶栏多语言切换器
        │   ├── DropZone.tsx          # 单张/多张 RAW 拖拽校验与一键 14-bit 合成标定样张加载
        │   ├── TiltInspector.tsx     # 九宫格 1:1 同步最近邻放大画布 + 5x5 等高线热力图 + 极坐标罗盘
        │   └── NoiseChart.tsx        # 双轴对数 σ_ADU / EV 动态范围交互曲线 + G1 高斯直方图 + CSV/JSON 导出
        └── App.tsx                   # 工作台顶栏、EXIF 遥测条与双模式状态切换
```

---

## 本地构建与运行指南

### 环境依赖
- **Rust** (`>= 1.85`, 含 `wasm32-unknown-unknown` target) 与 **`wasm-pack`**
- **Node.js** (`>= 20`) 与 `npm`
- *(可选：构建桌面端安装包时)* [Tauri v2 系统依赖](https://v2.tauri.app/start/prerequisites/)（macOS 需 Xcode CLT，Windows 需 MSVC Build Tools + WebView2，Ubuntu/Debian 需 `libwebkit2gtk-4.1-dev` 等）

### 1. 运行底层 Rust 单元与集成测试
```bash
cargo test --workspace
```

### 2. 编译 WebAssembly 核心包并启动浏览器工作台
```bash
cd web
npm install
npm run build:wasm
npm run dev
```

### 3. 构建生产环境 Web 静态包
```bash
cd web
npm run build
```

### 4. 启动或打包 Tauri v2 原生桌面端
```bash
cd web
npm run tauri:dev     # 启动原生桌面调试窗口
npm run tauri:build   # 打包当前系统安装包 (.exe/.msi, .dmg, .deb/.rpm/.AppImage)
```

> **macOS 桌面端首次启动说明**：GitHub Releases 中的 macOS 安装包采用开源构建 Ad-hoc 签名（未接入付费 Apple 公证）。若首次打开提示「已损坏」或「无法验证开发者」，将 `collima.app` 拖入 `/Applications` 后在终端执行一次 `xattr -cr /Applications/collima.app` 即可正常打开。

---

## License

Dual-licensed under **MIT** or **Apache-2.0**.
