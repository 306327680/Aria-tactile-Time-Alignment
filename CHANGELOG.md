# Changelog

---

## [未发布] 2026-04-23

### Bug Fix：segment_time_offset 双重补偿导致 LeRobot 力度偏移

**问题**：转换出的 LeRobot 数据集每段起始帧力度从 ~5–8N 开始，不为 0。

**根因**：`web_app.py` 的 `run_conversion()` 传入 `segment_time_offset = delta_s`（≈1.3s）给 `convert.py`，但 `delta_s` 实际上已经被 UI slider（`current_offset`）补偿过了。用户在对齐 UI 中拖动 slider 时直接看 VRS 视频，因此 `current_offset` 建立的是 `haptic时间 → VRS相机时间` 的映射，segment CSV 中的边界已经在 VRS 相机时间坐标下。再加一次 `delta_s` 导致：
- VRS 帧选取晚了 1.3s（选到握物途中而非起始）
- haptic 力度查询也晚了 1.3s

**修复**（`web_app.py` line 919）：
```python
# 修改前
'segment_time_offset': delta_s,

# 修改后
'segment_time_offset': 0.0,
```

**同步修复**（`Aria-to-Lerobot/__main__.py`）：移除了 `segment_time_offset` 的自动计算逻辑（原先自动计算 `delta_s` 后传入），默认值改为 `0.0`；新增 `--segment-time-offset` CLI 参数供特殊场景手动覆盖。

---

### 新功能：LeRobot 数据集查看器

**`web_app.py`** 新增三个 API：
- `GET /lerobot-viewer` — 渲染 LeRobot 数据集查看页面
- `GET /api/lerobot/episodes?dir=<path>` — 列出数据集所有 episode（来自 `meta/info.json` 和 `meta/episodes.jsonl`）
- `GET /api/lerobot/episode/<n>?dir=<path>` — 获取单个 episode 的时间戳、力度曲线、拇指-食指距离及视频 URL

**`templates/data_manager.html`**：
- 转换完成的数据集卡片新增「📊 查看数据」按钮，点击在新标签页打开 LeRobot 查看器

**`app/static/js/alignment/main.js`**：
- 导出面板输出目录自动填充改为与 VRS 文件同级目录（`{vrs目录}/{base_name}_lerobot`），不再写死 `/mnt/zyl/data/IROS_data/Lerobot/`
- 输出目录旁新增「📊 查看数据」快捷链接

---

### 新功能：数据集"标记作废"

**`web_app.py`**：
- 新增 `POST /data/api/toggle_deprecated` 接口，将指定 `base_name` 写入 `alignment_configs/deprecated.json`
- `scan_data_directory()` 读取 `deprecated.json`，在返回结果中附加 `deprecated` 字段
- `scan_data_directory()` 跳过仅含 NFS stale handle（`.nfs*`）文件的 lerobot 目录
- 增加 `scan_subdirectories` / `scan_data_directory` 耗时日志

**`templates/data_manager.html`**：
- 已作废数据集卡片显示灰色「作废」标签，视觉降权（半透明 + 去色）
- 卡片底部新增「标记作废」/「恢复」按钮
- 已作废数据集屏蔽「转换」和「对齐」操作入口

---

## 历史版本

历史版本说明见 [README.md — 版本说明章节](README.md#版本说明)。
