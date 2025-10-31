# 快速开始指南

## 🎉 好消息！

您的 Web 应用现在可以正常启动了！即使没有 `aria_api`，应用也能运行。

## 🚀 立即启动

### 方式 1：使用启动脚本（推荐）

```bash
cd /Volumes/BU100/Aria_data/aria_haptic_alignment
./start_web_app.sh
```

### 方式 2：直接运行

```bash
cd /Volumes/BU100/Aria_data/aria_haptic_alignment
python3 web_app.py
```

然后在浏览器中打开：**http://localhost:5001**

## ⚠️ 关于 aria_api

您会看到这个警告消息：
```
Warning: aria_api not found. VRS file processing will not be available.
Please install aria_api to use full functionality.
```

**这是正常的！** 应用会继续启动，您会看到：

```
============================================================
Aria-Haptic Alignment Web Application
============================================================
⚠️  aria_api: NOT AVAILABLE
   VRS file processing will not work.
   To enable full functionality:
   1. Install aria_api according to internal documentation
   2. Or contact the development team for access
------------------------------------------------------------
🌐 Server starting at: http://localhost:5001
📁 Upload folder: /tmp/xxxxx
🛑 Press Ctrl+C to stop the server
============================================================
```

## 💡 现在可以做什么？

### ✅ 可以使用的功能
- 查看美观的 Web 界面
- 了解对齐工具的功能
- 上传和测试 CSV ��件处理
- 调整对齐参数
- 查看交互式图表界面

### ⚠️ 需要 aria_api 的功能
- 上传和处理 VRS 文件
- 从 Aria 眼镜提取手部追踪数据

## 🔧 如果您需要完整功能

安装 `aria_api`（内部库）：
1. 查看内部文档
2. 联系 Project Aria 开发团队
3. 安装后重启 Web 应用

## 📸 界面预览

访问 http://localhost:5000，您会看到：

1. **警告横幅**（橙色）
   - 提示 aria_api 未安装
   - 说明 VRS 功能不可用

2. **文件上传区域**
   - VRS 文件上传（会显示友好的错误）
   - CSV 文件上传（正常工作）

3. **参数调整面板**
   - 最大偏移范围
   - 对齐方法选择
   - 力度阈值
   - 平滑窗口大小

4. **开始对齐按钮**
   - 点击后处理数据

5. **结果展示区域**
   - 交互式 Plotly 图表
   - 统计信息卡片
   - CSV 下载按钮

## 🧪 测试建议

### 如果您有 CSV 文件
1. 准备两个 CSV 文件（模拟数据或真实数据）
2. 上传并测试触觉数据处理
3. 查看对齐结果

### 如果您只想查看界面
1. 直接访问 http://localhost:5000
2. 浏览各个功能模块
3. 查看参数说明

## 📚 更多文档

- **完整使用手册**: `WEB_README.md`
- **安装指南**: `INSTALL.md`
- **原始算法文档**: `README.md`

## ❓ 常见问题

**Q: 我一定要安装 aria_api 吗？**
A: 不一定。如果您只是测试界面或处理 CSV 数据，可以不安装。

**Q: 上传 VRS 文件会发生什么？**
A: 会显示友好的错误消息，提示需要安装 aria_api。

**Q: 如何停止服务器？**
A: 按 `Ctrl+C`

**Q: 如何更改端口？**
A: 编辑 `web_app.py` 最后一行，将 `port=5000` 改为其他值。

## 🎯 下一步

1. ✅ 启动应用：`python3 web_app.py`
2. 🌐 打开浏览器：http://localhost:5000
3. 📖 阅读界面上的说明
4. 🧪 上传测试数据
5. 📊 查看对齐结果

祝您使用愉快！
