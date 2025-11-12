# 安装指南

## 问题：ModuleNotFoundError: No module named 'aria_api'

如果您遇到这个错误，这是正常的！`aria_api` 是一个**可选的**内部库，仅在处理 VRS 文件时需要。

## 解决方案

### 方案 1：安装所有依赖（推荐）

```bash
# 进入项目目录
cd /Volumes/BU100/Aria_data/aria_haptic_alignment

# 安装 Python 依赖
pip install -r requirements.txt

# 检查依赖状态
python3 check_dependencies.py
```

### 方案 2：仅检查依赖

```bash
python3 check_dependencies.py
```

这会显示哪些包已安装，哪些缺失。

## aria_api 是什么？

`aria_api` 是 Project Aria 的内部 Python 库，用于：
- 读取 VRS (Video Recording Sequences) 文件
- 访问 MPS (Machine Perception Services) 数据
- 提取手部追踪信息

## 我需要 aria_api 吗？

**如果您有 VRS 文件并需要完整功能**：是的
- 请访问 https://github.com/306327680/Aria-Vrs-Mps-api 安装 aria_api
- 按照仓库中的说明进行安装

**如果您只是测试或演示**：不需要
- Web 应用仍然可以启动
- 您可以查看界面和功能
- 可以使用 MPS CSV 文件代替 VRS 文件
- 上传 VRS 文件时会显示友好的错误消息

## 启动 Web 应用

### 方法 1：使用启动脚本（推荐）

```bash
./start_web_app.sh
```

这会：
1. 自动检查 Python 版本
2. 检查所有依赖
3. 显示 aria_api 状态
4. 启动服务器

### 方法 2：手动启动

```bash
python3 web_app.py
```

## 预期输出

### 如果 aria_api 已安装

```
============================================================
Aria-Haptic Alignment Web Application
============================================================
✅ aria_api: Available
------------------------------------------------------------
🌐 Server starting at: http://localhost:5000
📁 Upload folder: /tmp/xxxxx
🛑 Press Ctrl+C to stop the server
============================================================
```

### 如果 aria_api 未安装（也没关系！）

```
Warning: aria_api not found. VRS file processing will not be available.
Please install aria_api to use full functionality.
============================================================
Aria-Haptic Alignment Web Application
============================================================
⚠️  aria_api: NOT AVAILABLE
   VRS file processing will not work.
   To enable full functionality:
   1. Install aria_api according to internal documentation
   2. Or contact the development team for access
------------------------------------------------------------
🌐 Server starting at: http://localhost:5000
📁 Upload folder: /tmp/xxxxx
🛑 Press Ctrl+C to stop the server
============================================================
```

## 网页界面

访问 http://localhost:5000，您会看到：

### 如果 aria_api 未安装
页面顶部会显示橙色警告横幅：
```
⚠️ aria_api 未安装
VRS 文件处理功能不可用。如需完整功能，请安装 aria_api 库。
安装方法：请参考内部文档或联系开发团队。
```

### 如果 aria_api 已安装
正常界面，无警告横幅。

## 常见问题

### Q: 我一定要安装 aria_api 吗？
A: 不一定。如果您只是查看界面或测试其他功能，可以不安装。但处理 VRS 文件需要 aria_api。

### Q: 如何安装 aria_api？
A: 请访问 https://github.com/306327680/Aria-Vrs-Mps-api 查看详细的安装说明和文档。

### Q: 其他依赖在哪里安装？
A: 运行 `pip install -r requirements.txt`

### Q: 我应该用什么 Python 版本？
A: Python 3.7 或更高版本

## 依赖列表

### 必需（Web 应用运行必须）
- Flask >= 3.0.0
- NumPy >= 1.24.0
- Pandas >= 2.0.0
- SciPy >= 1.10.0
- Matplotlib >= 3.7.0
- Plotly >= 5.17.0

### 可选（仅 VRS 文件处理需要）
- aria_api (内部库)

## 下一步

安装依赖后：
1. 启动服务器：`./start_web_app.sh` 或 `python3 web_app.py`
2. 打开浏览器：http://localhost:5000
3. 开始使用！

查看完整使用说明：`WEB_README.md`
