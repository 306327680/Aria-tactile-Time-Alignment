# Aria-Tactile Time Alignment

一个用于对齐 Project Aria 手部追踪数据与触觉传感器数据的时间同步工具，提供命令行工具和交互式 Web 界面。

## 📋 版本说明

### v33 (2026-02-26)

**RGB 视频播放优化 & MP4 缓存**
- 新增 `generate_mp4.py` 独立脚本，从 VRS RGB 帧生成 MP4 视频（子进程运行，不阻塞 Flask）
- VRS 初始化后自动在后台生成 MP4，缓存到磁盘（`.cache/{name}_rgb.mp4`），下次加载秒开
- 双模式播放：`<video>` 标签播放 MP4（流畅）/ `<img>` 逐帧显示骨架叠加
- 服务端 LRU 帧缓存（200帧）+ 原始 JPEG 端点，减少 33% 带宽开销
- 新增 `/gripper/generate_video`、`/gripper/video_progress`、`/gripper/serve_video` 接口
- 修复逐帧播放时间/画面不同步：改用串行帧加载替代 setInterval
- 修复切换视频模式时黑屏：等待 `loadeddata` 后再隐藏旧画面
- 标定加载 UX 优化：按钮优先级调整、加载计时显示
- 关闭 Flask stat reloader，防止后台线程被杀

### v26 (2026-02-25)

**手部骨架叠加 & 数据管理**
- RGB 相机画面支持手部骨架叠加显示（左右手不同颜色）
- RGB 图像 90° 旋转校正
- 触觉力度偏移公式修复
- 时间对齐文档更新

### v20 (2026-02-25)

**LeRobot 导出 & 片段管理**
- 简化 LeRobot schema：observation.state 79→7维，action 8→2维
- 修复 LeRobot 导出时间偏移对齐 bug
- 新增数据管理器，增强触觉力度追踪

## ✨ 功能特性

本项目提供了基于相关性分析的时间对齐算法，用于同步：
- **Aria 数据**：右手拇指与食指之间的距离（基于 MPS 手部追踪）
- **触觉数据**：手指力传感器的力度测量值

**核心假设**：拇指与食指距离越小 → 捏合力越大

### 🌟 主要功能

- 🎯 **多种对齐算法**：交叉相关、Pearson相关、DTW、互信息、混合方法
- 🌐 **Web 交互界面**：拖拽上传、实时参数调整、交互式可视化
- 📊 **智能片段检测**：自动识别力度变化片段
- 📁 **多种数据格式**：支持 VRS、MPS CSV、触觉传感器 CSV
- 💾 **结果导出**：生成对齐图表和片段分割 CSV
- ⚡ **性能优化**：支持多种速度/精度权衡的算法

## 📦 快速开始

### 安装依赖

```bash
# 克隆或进入项目目录
cd aria_haptic_alignment

# 安装 Python 依赖
pip install -r requirements.txt
```

**依赖项说明：**
- `numpy`、`pandas`、`scipy`：数据处理和信号分析
- `matplotlib`、`plotly`：数据可视化
- `Flask`：Web 应用框架
- `aria_api`：Project Aria 内部库（可选，仅 VRS 文件处理需要）

> **注意**：`aria_api` 是内部库，需要单独安装。如果没有此库，Web 应用仍可正常启动，但无法处理 VRS 文件。
>
> **安装 aria_api**：请访问 https://github.com/306327680/Aria-Vrs-Mps-api
>
> 详见 [INSTALL.md](INSTALL.md)

## 🚀 使用方法

### 方式 1：Web 应用界面（推荐）

启动交互式 Web 界面：

```bash
# 使用启动脚本（会自动检查依赖）
./start_web_app.sh

# 或直接运行
python3 web_app.py
```

然后在浏览器中打开：**http://localhost:5001**

**Web 界面功能：**
- 📤 拖拽上传 VRS/MPS CSV 和触觉传感器 CSV 文件
- ⚙️ 实时调整对齐参数（偏移范围、算法、阈值等）
- 📊 交互式 Plotly 图表（缩放、平移、悬停查看数据）
- 📈 数据可视化工具（单独查看 MPS 或触觉数据）
- 💾 一键下载片段分割 CSV 文件
- 📱 响应式设计，支持桌面和移动设备

> 详细使用说明请参考 [WEB_README.md](WEB_README.md)

### 方式 2：命令行工具

适合批量处理和脚本自动化：

```bash
# 基本用法 - 自动以VRS文件名命名输出图片
python3 aria_haptic_align.py <vrs_path> <haptic_csv>

# 示例
python3 aria_haptic_align.py glue.vrs sensor_data/sequence_2_20250927_203243.csv

# 使用 MPS CSV 文件（无需 VRS）
python3 aria_haptic_align.py --mps-csv hand_tracking_results.csv --haptic-csv sensor.csv

# 指定最大搜索偏移范围
python3 aria_haptic_align.py glue.vrs sensor.csv --max-offset 10.0

# 使用不同的对齐方法
python3 aria_haptic_align.py glue.vrs sensor.csv --method hybrid

# 调整力度阈值进行片段检测
python3 aria_haptic_align.py glue.vrs sensor.csv --force-threshold 2.0

# 指定输出目录
python3 aria_haptic_align.py glue.vrs sensor.csv --output-dir results/
```

**命令行参数：**
- `vrs_path`: VRS文件路径（与 `--mps-csv` 二选一）
- `haptic_csv`: 触觉传感器CSV文件路径（必需）
- `--mps-csv`: MPS CSV 文件路径（与 `vrs_path` 二选一）
- `--max-offset`: 最大搜索偏移范围（秒），默认5.0
- `--method`: 对齐方法（pearson/xcorr/dtw/mi/hybrid），默认xcorr
- `--force-threshold`: 片段检测的力度阈值（N），默认1.0
- `--smooth-window`: 平滑窗口大小，默认5
- `--output-dir`: 输出目录，默认为 VRS 文件所在目录的子目录
- `--no-plot`: 禁用图表显示
- `--no-segments`: 禁用片段检测和导出

**输出文件：**
- `{vrs_filename}_alignment.png` - 对齐可视化图表
- `{vrs_filename}_alignment_segments.csv` - 片段分割时间点

### 方式 3：Python API

在 Python 代码中集成对齐功能：

```python
from aria_haptic_align import AriaHapticAligner

# 使用 VRS 文件
aligner = AriaHapticAligner(
    vrs_path="recording.vrs",
    haptic_csv_path="sensor_data.csv"
)

# 或使用 MPS CSV 文件
aligner = AriaHapticAligner(
    mps_csv_path="hand_tracking_results.csv",
    haptic_csv_path="sensor_data.csv"
)

# 运行完整对齐流程
results = aligner.run(
    max_offset=5.0,
    method='xcorr',
    plot=True,
    save_path="alignment.png",
    export_segments=True,
    force_threshold=1.0
)

# 查看结果
print(f"最优偏移: {results['optimal_offset']:.3f}s")
print(f"相似度: {results['max_similarity']:.4f}")
print(f"片段数: {len(results['segments'])}")
```

**分步处理：**

```python
# 1. 加载数据
aligner.load_aria_data_from_mps_csv()  # 或 load_aria_data()
aligner.load_haptic_data()

# 2. 寻找最优偏移
offset = aligner.find_optimal_offset(max_offset=5.0, method='xcorr')

# 3. 检测片段
segments = aligner.detect_force_segments(force_threshold=1.0)

# 4. 可视化
aligner.plot_alignment(save_path="result.png", segments=segments)

# 5. 导出 CSV
aligner.export_segments_csv(segments, "segments.csv")
```

## 📊 对齐方法对比

| 方法 | 速度 | 准确度 | 适用场景 | 推荐度 |
|------|------|--------|---------|-------|
| **xcorr** | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | 信号形状相似 | ✅ 推荐 |
| **pearson** | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ | 快速测试 | - |
| **dtw** | ⚡⚡ | ⭐⭐⭐⭐⭐ | 时间扭曲严重 | - |
| **mi** | ⚡⚡ | ⭐⭐⭐⭐ | 非线性关系 | - |
| **hybrid** | ⚡ | ⭐⭐⭐⭐⭐ | 需要最高质量 | - |

**推荐使用 `xcorr`**：在速度和准确性之间取得最佳平衡。

## 🗂️ 项目结构

```
aria_haptic_alignment/
├── aria_haptic_align.py      # 核心对齐算法库
├── web_app.py                 # Flask Web 应用
├── start_web_app.sh          # Web 应用启动脚本
├── check_dependencies.py      # 依赖检查工具
├── requirements.txt           # Python 依赖列表
├── README.md                  # 本文档
├── INSTALL.md                 # 安装指南
├── QUICKSTART.md              # 快速开始指南
├── WEB_README.md              # Web 应用详细文档
├── templates/                 # HTML 模板
│   ├── index.html            # 主页（对齐工具）
│   └── visualize.html        # 数据可视化页面
└── static/                    # 静态资源
    ├── css/style.css         # 样式文件
    └── js/main.js            # JavaScript 交互逻辑
```

## 🔬 工作原理

### 数据处理流程

1. **数据加载**
   - **Aria**：从 VRS 或 MPS CSV 提取右手拇指-食指距离（21个关键点中的第4和第8个）
   - **触觉**：从 CSV 提取力度数据（支持多种格式）

2. **信号预处理**
   - 归一化到 [0, 1] 区间
   - 距离信号反转（小距离 → 高值，匹配高力度）
   - 创建插值函数支持任意时间点采样

3. **时间对齐**
   - 在搜索范围内以步长滑动触觉信号
   - 计算每个偏移量的相似度得分
   - 选择最高得分对应的偏移量

4. **片段检测**
   - 基于力度阈值识别接触段
   - 平滑滤波降噪
   - 合并过于接近的片段

5. **结果输出**
   - 生成对齐前后对比图
   - 导出片段分割时间点 CSV

## 📋 数据格式要求

### VRS 文件
- Project Aria 标准 VRS 格式
- 需要配套的 MPS 产物目录（包含 `hand_tracking/` 子目录）
- MPS 目录命名规则：`mps_{vrs_basename}_vrs/`

### MPS CSV 文件
支持直接使用 MPS 导出的 `hand_tracking_results.csv`：

```csv
tracking_timestamp_us,right_tracking_confidence,tx_right_landmark_4_device,ty_right_landmark_4_device,tz_right_landmark_4_device,tx_right_landmark_8_device,...
1234567890,0.95,0.01,0.02,0.03,0.05,0.06,0.07,...
```

- 需包含拇指尖（landmark 4）和食指尖（landmark 8）的 3D 坐标
- 置信度 > 0.5 的帧会被使用

### 触觉传感器 CSV 文件

**GEN3 格式（推荐）：**
```csv
Timestamp,Sample_Index,Relative_Time_ms,ThumbTip_Fx,ThumbTip_Fy,ThumbTip_Fz,ThumbTip_Total,IndexTip_Total,...
```

**旧版格式：**
```csv
timestamp,relative_time,Ring Tip_magnitude,Little Tip_magnitude,...
```

支持自动识别时间列（`Relative_Time_ms`、`Sample_Index`、`relative_time`、`timestamp`）和力度列（`_Total`、`_magnitude` 或分量 `_Fx/_Fy/_Fz`）。

## 📚 文档

- **[INSTALL.md](INSTALL.md)** - 详细安装指南和依赖说明
- **[QUICKSTART.md](QUICKSTART.md)** - 5分钟快速上手
- **[WEB_README.md](WEB_README.md)** - Web 应用完整使用手册

## ⚠️ 常见问题

**Q: aria_api 是否必需？**
A: 不是。仅处理 VRS 文件时需要。使用 MPS CSV 文件或仅启动 Web 界面不需要。

**Q: 如何安装 aria_api？**
A: 请访问 https://github.com/306327680/Aria-Vrs-Mps-api 查看安装说明。

**Q: 推荐使用哪种方式？**
A: Web 界面适合交互式使用，命令行适合批量处理，Python API 适合集成到其他程序。

**Q: 相似度得分很低怎么办？**
A: 尝试增大 `max_offset` 搜索范围，或使用 `hybrid` 方法。检查数据质量和时间同步。

**Q: 如何解释时间偏移结果？**
A: `optimal_offset = 1.5s` 表示触觉数据需要向后移动 1.5 秒才能与 Aria 数据对齐。

**Q: Web 应用端口被占用？**
A: 编辑 `web_app.py` 最后一行，将 `port=5001` 改为其他值。

## 📊 示例输出

**控制台输出：**
```
Loaded 1881 Aria hand tracking frames
Time range: 0.00s to 188.00s
Distance range: 0.0616m to 0.0831m

Loaded 9385 haptic sensor samples
Time range: 0.00s to 189.08s

=== Time Alignment Results ===
Method: xcorr
Optimal offset: 1.310 seconds
Max similarity score: 0.1685
```

**可视化图表：**
- 图1：对齐前信号对比
- 图2：对齐后信号对比（带片段标记）
- 图3：相似度得分曲线

**CSV 输出：**
```csv
split_index,split_time_s,before_segment,after_segment
0,5.234,0,1
1,12.567,1,2
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

内部使用

---

**Generated with Claude Code**
