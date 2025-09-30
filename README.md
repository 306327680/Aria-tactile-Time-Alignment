# Aria-Haptic Time Alignment Library

一个用于对齐 Project Aria 手部追踪数据与触觉传感器数据的时间同步库。

## 功能概述

本库实现了基于相关性分析的时间对齐算法，用于同步：
- **Aria 数据**：右手拇指与食指之间的距离（基于 MPS 手部追踪的 21 个关键点）
- **触觉数据**：手指力传感器的力度测量值

核心假设：拇指与食指距离越小 → 捏合力越大

## 依赖项

- `aria_api`：Project Aria 内部库，用于 VRS/MPS 数据访问和手部追踪
- `numpy`：数值计算
- `pandas`：CSV 数据处理
- `matplotlib`：可视化
- `scipy`：信号处理和插值

## 安装

```bash
pip install numpy pandas matplotlib scipy
```

注意：`aria_api` 为内部库，需要单独安装。

## 使用方法

### 命令行使用（推荐）

```bash
# 基本用法 - 自动以VRS文件名命名输出图片
python aria_haptic_alignment/aria_haptic_align.py <vrs_path> <haptic_csv>

# 示例
python aria_haptic_alignment/aria_haptic_align.py glue.vrs sensor_data/sequence_2_20250927_203243.csv

# 指定最大搜索偏移范围
python aria_haptic_alignment/aria_haptic_align.py glue.vrs sensor_data/sequence_2_20250927_203243.csv --max-offset 10.0

# 使用不同的对齐方法
python aria_haptic_alignment/aria_haptic_align.py glue.vrs sensor_data/sequence_2_20250927_203243.csv --method hybrid

# 指定输出目录
python aria_haptic_alignment/aria_haptic_align.py glue.vrs sensor_data/sequence_2_20250927_203243.csv --output-dir results/

# 不显示图表
python aria_haptic_alignment/aria_haptic_align.py glue.vrs sensor_data/sequence_2_20250927_203243.csv --no-plot

# 调整力度阈值进行片段检测
python aria_haptic_alignment/aria_haptic_align.py glue.vrs sensor_data/sequence_2_20250927_203243.csv --force-threshold 2.0

# 禁用片段检测
python aria_haptic_alignment/aria_haptic_align.py glue.vrs sensor_data/sequence_2_20250927_203243.csv --no-segments
```

**命令行参数：**
- `vrs_path`: VRS文件路径（必需）
- `haptic_csv`: 触觉传感器CSV文件路径（必需）
- `--max-offset`: 最大搜索偏移范围（秒），默认5.0
- `--method`: 对齐方法，可选 pearson/xcorr/dtw/mi/hybrid，默认xcorr
- `--no-plot`: 禁用图表显示
- `--no-segments`: 禁用片段检测和导出
- `--force-threshold`: 片段检测的力度阈值（牛顿），默认1.0
- `--output-dir`: 指定输出目录，默认为VRS文件所在目录的aria_haptic_alignment子目录

**输出文件命名：**
- 图片文件名格式：`{vrs_filename}_alignment.png`（包含片段标记的竖线）
- CSV文件名格式：`{vrs_filename}_alignment_segments.csv`
- 例如：`glue.vrs` → `glue_alignment.png` + `glue_alignment_segments.csv`

### Python API使用

```python
from aria_haptic_align import AriaHapticAligner

# 初始化对齐器
aligner = AriaHapticAligner(
    vrs_path="path/to/recording.vrs",
    haptic_csv_path="path/to/haptic_data.csv"
)

# 运行对齐分析
results = aligner.run(
    max_offset=5.0,      # 最大搜索偏移范围（秒）
    method='xcorr',      # 对齐方法（默认推荐）
    plot=True,           # 生成可视化图表
    save_path="results/alignment_result.png"
)

# 查看结果
print(f"最优时间偏移: {results['optimal_offset']:.3f} 秒")
print(f"相似度得分: {results['max_similarity']:.4f}")
print(f"对齐方法: {results['method']}")
```

### 分步使用

```python
# 1. 加载 Aria 手部追踪数据
aria_timestamps, aria_distances = aligner.load_aria_data()

# 2. 加载触觉传感器数据
haptic_timestamps, haptic_forces = aligner.load_haptic_data()

# 3. 寻找最优时间偏移
optimal_offset = aligner.find_optimal_offset(max_offset=5.0, method='xcorr', step=0.01)

# 4. 绘制对齐前后对比图
aligner.plot_alignment(save_path="alignment_result.png")
```

### 比较不同方法

```python
# 测试多种对齐方法
methods = ['xcorr', 'pearson', 'mi']

for method in methods:
    aligner = AriaHapticAligner(vrs_path, haptic_csv_path)
    results = aligner.run(max_offset=5.0, method=method, plot=False)
    print(f"{method}: offset={results['optimal_offset']:.3f}s, "
          f"score={results['max_similarity']:.4f}")
```

## 工作原理

### 1. 数据加载

**Aria 数据提取：**
- 使用 `aria_api.AriaSession.from_vrs()` 自动发现并加载 MPS 产物
- 从 21 个手部关键点中提取：
  - 右手拇指尖（关键点 4）
  - 右手食指尖（关键点 8）
- 计算世界坐标系下的欧氏距离
- 采样频率：10Hz（每 100ms）

**触觉数据提取：**
- 读取 CSV 文件（支持 `relative_time` 列作为时间戳）
- 提取力度 magnitude 列（如 Ring Tip、Little Tip）
- 时间戳自动归一化到从 0 开始

### 2. 时间对齐算法

支持多种对齐方法，默认使用**交叉相关（Cross-Correlation）**：

**可选方法：**
- **`pearson`**: Pearson 相关系数（简单快速，但对异常值敏感）
- **`xcorr`**: 归一化交叉相关（推荐，对信号形状匹配更好）
- **`dtw`**: 动态时间规整（处理时间扭曲，但计算慢）
- **`mi`**: 互信息（捕捉非线性关系，计算慢）
- **`hybrid`**: 多方法加权组合（综合性能最佳，但计算慢）

**算法步骤：**
1. **信号归一化**：将距离和力度归一化到 [0, 1] 区间
2. **距离反转**：将距离信号反转（小距离 → 大值），以匹配力度趋势
3. **信号插值**：创建插值函数以支持任意时间点采样
4. **相似度搜索**：
   - 在 0-5 秒范围内，以 0.01 秒为步长搜索
   - 对每个偏移量，计算选定方法的相似度得分
5. **最优偏移**：选择相似度得分最大的偏移量

### 3. 可视化输出

生成三个子图：
1. **对齐前**：原始信号时间序列对比
2. **对齐后**：应用最优偏移后的信号对比
3. **相关性曲线**：不同偏移量下的相关系数变化

## 数据格式要求

### VRS 文件
- Project Aria 标准 VRS 格式
- 需要配套的 MPS 产物目录（包含 `hand_tracking/` 子目录）
- MPS 目录会被自动发现（命名规则：`mps_{vrs_basename}_vrs/`）

### 触觉 CSV 文件
期望的列格式：
```
timestamp, relative_time, [指尖名称]_magnitude, ...
```

示例：
```csv
timestamp,relative_time,Ring Tip_fx,Ring Tip_fy,Ring Tip_fz,Ring Tip_magnitude,Little Tip_magnitude
1758975757.45,0.0,0,0,0,0.0,0.0
1758975757.47,0.02,10.2,5.3,8.1,14.5,12.3
```

## 示例

见 `aria_haptic_align.py` 中的 `main()` 函数：

```bash
python aria_haptic_align.py
```

使用测试数据：
- VRS: `/Volumes/BU100/Aria_data/glue.vrs`
- CSV: `/Volumes/BU100/Aria_data/sensor_data/sequence_2_20250927_203243.csv`

## 输出结果

### 控制台输出
```
Hand tracking time range: 225399505000 to 413599504000 ns
Loaded 1881 Aria hand tracking frames
Time range: 0.00s to 188.00s
Distance range: 0.0616m to 0.0831m

Using force columns: Ring Tip_magnitude, Little Tip_magnitude
Loaded 9385 haptic sensor samples
Time range: 0.00s to 189.08s
Force range: 0.0000 to 259.6247

Using alignment method: xcorr
Searching offsets in range [0, 5.0s] with step 0.01s...

=== Time Alignment Results ===
Method: xcorr
Optimal offset: 1.310 seconds
Max similarity score: 0.1685
Search range: 0 to 5.0s
```

### 图像文件
保存包含三个子图的 PNG 文件：
- 对齐前的信号对比
- 对齐后的信号对比
- 相关系数 vs 时间偏移曲线

## API 参考

### `AriaHapticAligner`

**构造函数：**
```python
AriaHapticAligner(vrs_path: str, haptic_csv_path: str)
```

**主要方法：**

- `load_aria_data() -> Tuple[np.ndarray, np.ndarray]`
  - 返回：(时间戳数组, 距离数组)

- `load_haptic_data() -> Tuple[np.ndarray, np.ndarray]`
  - 返回：(时间戳数组, 力度数组)

- `find_optimal_offset(max_offset: float = 5.0, method: str = 'xcorr', step: float = 0.01) -> float`
  - 参数：
    - `max_offset`: 最大搜索范围（秒）
    - `method`: 对齐方法（'pearson', 'xcorr', 'dtw', 'mi', 'hybrid'）
    - `step`: 搜索步长（秒）
  - 返回：最优时间偏移（秒）

- `plot_alignment(save_path: Optional[str] = None)`
  - 生成并保存对齐可视化图

- `run(max_offset: float = 5.0, method: str = 'xcorr', plot: bool = True, save_path: Optional[str] = None) -> Dict`
  - 参数：
    - `max_offset`: 最大搜索范围（秒）
    - `method`: 对齐方法（默认 'xcorr'）
    - `plot`: 是否生成可视化图
    - `save_path`: 图像保存路径
  - 返回：包含对齐结果的字典
    - `optimal_offset`: 最优时间偏移（秒）
    - `max_similarity`: 最大相似度得分
    - `method`: 使用的对齐方法
    - `aria_time_range`: Aria 数据时间范围
    - `haptic_time_range`: 触觉数据时间范围

## 注意事项

1. **时间偏移含义**：返回的 `optimal_offset` 表示触觉数据需要向后偏移的秒数
2. **采样率差异**：Aria 数据以 10Hz 采样，触觉数据通常更高（~50Hz），算法会自动插值对齐
3. **方法选择**：
   - **快速测试**：使用 `pearson` 或 `xcorr`（推荐）
   - **高精度**：使用 `hybrid` 或 `mi`（计算时间较长）
   - **处理时序扭曲**：使用 `dtw`（适合信号有局部时间拉伸的情况）
4. **数据质量**：相似度得分较低（<0.3）可能表示：
   - 数据不同步范围超出搜索范围
   - 手部动作与触觉信号不匹配
   - 数据质量问题（如遮挡、传感器故障）
5. **性能优化**：
   - DTW 和 MI 方法对长序列计算较慢，已进行降采样优化
   - 推荐首选 `xcorr` 方法，在速度和准确性之间取得良好平衡

## 许可证

内部使用

## 作者

Generated with Claude Code