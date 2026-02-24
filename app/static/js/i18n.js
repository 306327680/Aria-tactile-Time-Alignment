// Internationalization (i18n) for Aria-Haptic Alignment Web App
// Supports Chinese (zh-CN) and English (en-US)

const translations = {
    'zh-CN': {
        // Header
        'app.title': 'Aria-Haptic 时间对齐工具',
        'app.subtitle': '对齐 Project Aria 手部追踪数据与触觉传感器数据',
        'nav.visualize': '数据可视化',
        'nav.player': '数据播放器',
        'nav.data_manager': '数据管理',
        'nav.gripper': '夹爪可视化',
        'nav.alignment': '对齐工具',

        // Workflow Guide
        'workflow.title': '使用流程',
        'workflow.step1.title': '选择数据文件',
        'workflow.step1.desc': '在「选择数据文件」中选择数据目录，系统自动识别 MPS CSV、触觉 CSV 和 VRS 文件',
        'workflow.step2.title': '运行对齐',
        'workflow.step2.desc': '确认参数后点击「开始对齐分析」，系统计算 Aria 手部追踪与触觉数据的最优时间偏移',
        'workflow.step3.title': '微调偏移 & 检查视频',
        'workflow.step3.desc': '拖动偏移滑条微调对齐；播放 RGB 视频确认对齐效果；满意后点击「保存偏移配置」',
        'workflow.step4.title': '编辑力度片段',
        'workflow.step4.desc': '在图表中拖动片段边界调整起止时间；「+ 添加片段」手动新增；右键删除不需要的片段；完成后点「💾 保存片段」',
        'workflow.step5.title': '导出到 LeRobot',
        'workflow.step5.desc': '在「导出到 LeRobot」面板设置输出目录和任务名，点击「运行转换」生成训练数据集',
        'workflow.tip': '下次打开时，系统会自动检测已保存的对齐配置和片段，可直接加载无需重新计算',

        // Theme
        'theme.dark': '切换到夜间模式',
        'theme.light': '切换到日间模式',

        // Warning Banner
        'warning.aria_api.title': 'aria_api 未安装',
        'warning.aria_api.desc': 'VRS 文件处理功能不可用。如需完整功能，请安装 aria_api 库。',
        'warning.aria_api.install': '安装方法：',

        // File Upload Section
        'upload.title': '上传数据文件',
        'upload.mode.mps': 'MPS CSV 模式',
        'upload.mode.mps.desc': '上传 MPS 生成的 hand_tracking_results.csv（推荐，无需 aria_api）',
        'upload.mode.vrs': 'VRS 模式',
        'upload.mode.vrs.desc': '上传 VRS 文件（需要 aria_api，文件较大）',
        'upload.mode.vrs.disabled': '（aria_api 未安装）',
        'upload.file.mps': 'MPS CSV 文件：',
        'upload.file.vrs': 'VRS 文件：',
        'upload.file.haptic': '触觉 CSV 文件：',
        'upload.file.none': '未选择文件',

        // Parameters Section
        'params.title': '对齐参数',
        'params.max_offset': '最大偏移范围 (秒)：',
        'params.max_offset.help': '搜索时间偏移的最大范围',
        'params.method': '对齐方法：',
        'params.method.help': '选择相似度计算方法',
        'params.method.xcorr': '交叉相关 (推荐)',
        'params.method.pearson': 'Pearson 相关',
        'params.method.dtw': '动态时间规整 (慢)',
        'params.method.mi': '互信息 (慢)',
        'params.method.hybrid': '混合方法 (慢)',
        'params.force_threshold': '力度阈值 (N)：',
        'params.force_threshold.help': '片段检测的最小力度值',
        'params.smooth_window': '平滑窗口大小：',
        'params.smooth_window.help': '降噪平滑滤波器窗口',
        'params.export_segments': '检测并导出片段',
        'params.export_segments.help': '自动识别力度片段并生成 CSV',
        'params.view_window': '显示窗口 (秒)：',
        'params.view_window.help': '图表默认可见范围，用底部滑条导航全部数据',

        // Action Button
        'action.align': '开始对齐分析',
        'action.processing': '处理中...',

        // Loading
        'loading.title': '正在处理...',
        'loading.upload': '上传文件中...',
        'loading.load': '加载数据中...',
        'loading.align': '计算最优偏移中...',
        'loading.segment': '检测片段中...',
        'loading.plot': '生成可视化图表中...',
        'loading.wait': '这可能需要几秒到几分钟，取决于数据大小和对齐方法。',

        // Results Section
        'results.title': '对齐结果',
        'results.stats': '统计信息',
        'results.optimal_offset': '最优时间偏移',
        'results.similarity': '相似度得分',
        'results.aria_samples': 'Aria 样本数',
        'results.haptic_samples': '触觉样本数',
        'results.segments': '检测到的片段',
        'results.method': '对齐方法',
        'results.unit.seconds': '秒',
        'results.unit.samples': '个样本',
        'results.unit.segments': '个片段',

        // Interactive Controls
        'interactive.title': '交互式偏移调整',
        'interactive.current_offset': '当前偏移',
        'interactive.current_similarity': '当前相似度',
        'interactive.apply': '应用偏移',
        'interactive.reset': '重置到最优偏移',
        'interactive.help': '拖动滑块实时查看不同时间偏移下的对齐效果',

        // Visualization
        'viz.title': '可视化图表',
        'viz.before': '对齐前',
        'viz.after': '对齐后 (偏移 = {offset}秒)',
        'viz.correlation': '相似度得分 vs 时间偏移',
        'viz.aria': 'Aria (反向距离)',
        'viz.haptic': '触觉 (力度)',
        'viz.haptic_offset': '触觉 (偏移 +{offset}秒)',
        'viz.similarity': '相似度得分',
        'viz.time': '时间 (s)',
        'viz.offset': '时间偏移 (s)',
        'viz.value': '归一化值',

        // Segments Panel
        'segments.title': '力度片段',
        'segments.add': '+ 添加片段',
        'segments.save': '💾 保存片段',
        'segments.save_no_haptic': '需要先加载触觉数据才能保存片段',
        'segments.save_empty': '没有片段可保存',
        'segments.select_all': '全选',
        'segments.deselect_all': '取消全选',
        'segments.empty': '暂无片段，点击"+ 添加片段"创建',
        'segments.drag_hint': '在图表中拖动片段边界来调整起止时间，取消勾选可排除出 CSV 导出',

        // Episode Preview
        'episodes.title': 'LeRobot 分集预览',
        'episodes.count': '{count} 个分集',
        'episodes.episode': '分集',
        'episodes.time_range': '时间范围',
        'episodes.duration': '时长',
        'episodes.frames': '估计帧数',
        'episodes.source': '来源片段',
        'episodes.total': '总计',
        'episodes.total_duration': '总时长',
        'episodes.total_frames': '总帧数',
        'episodes.no_segments': '没有启用的片段，请在上方片段列表中勾选至少一个片段',

        // Export
        'export.title': 'LeRobot 导出',
        'export.output_dir': '输出目录：',
        'export.output_dir_placeholder': 'LeRobot 数据集输出路径',
        'export.cli_label': 'CLI 命令：',
        'export.save_segments': '保存片段 CSV',
        'export.copy_cli': '复制命令',
        'export.save_success': '片段 CSV 已保存至：{path}',
        'export.save_error': '保存失败：{error}',
        'export.copy_success': '命令已复制到剪贴板',
        'export.copy_error': '复制失败',
        'export.run_conversion': '运行转换',
        'export.converting': '转换中...',
        'export.conversion_complete': '转换完成',
        'export.conversion_failed': '转换失败',
        'export.task_name': '任务名称：',
        'export.no_output_dir': '请先指定输出目录',
        'export.no_vrs': '需要 VRS 文件才能运行转换',

        // Saved Alignment
        'saved.found': '检测到已有对齐配置',
        'saved.load': '加载已有对齐',
        'saved.load_cached': '直接加载结果',
        'saved.recompute': '重新计算对齐',
        'saved.offset': '偏移',
        'saved.similarity': '相似度',
        'saved.source_manual': '手动保存',
        'saved.source_auto': '自动保存',

        // Download
        'download.button': '下载片段 CSV 文件',

        // Error Messages
        'error.title': '错误',
        'error.generic': '处理过程中出现错误',
        'error.see_details': '详细信息：',

        // Footer
        'footer.docs': '查看文档',
        'footer.github': 'GitHub 仓库',

        // Visualize Page
        'visualize.title': '数据可视化工具',
        'visualize.subtitle': '单独查看 MPS 手部追踪数据和触觉传感器数据',
        'visualize.nav.back': '返回对齐工具',
        'visualize.tab.mps': 'MPS 手部追踪数据',
        'visualize.tab.haptic': '触觉传感器数据',
        'visualize.mps.upload': '上传 MPS CSV 文件',
        'visualize.mps.label': 'MPS CSV 文件 (hand_tracking_results.csv):',
        'visualize.mps.button': '加载并可视化',
        'visualize.haptic.upload': '上传触觉 CSV 文件',
        'visualize.haptic.label': '触觉 CSV 文件:',
        'visualize.haptic.button': '加载并可视化',
        'visualize.result.mps': 'MPS 数据可视化',
        'visualize.result.haptic': '触觉数据可视化',
        'visualize.stats.samples': '样本数',
        'visualize.stats.time_range': '时间范围',
        'visualize.stats.distance_range': '距离范围',
        'visualize.stats.force_range': '力度范围',
        'visualize.stats.total_frames': '总帧数',
        'visualize.stats.valid_frames': '有效帧数',
        'visualize.stats.success_rate': '成功率',
        'visualize.stats.avg_confidence': '平均置信度',

        // Player Page
        'player.title': '对齐数据播放器',
        'player.subtitle': '交互式浏览和播放对齐后的数据，支持时间窗口和缩放控制',
        'player.nav.back': '返回对齐工具',
        'player.upload.title': '加载对齐数据',
        'player.upload.desc': '请先在对齐工具中完成对齐，然后上传数据文件进行播放查看',
        'player.upload.mps': 'MPS CSV 文件:',
        'player.upload.haptic': '触觉 CSV 文件:',
        'player.upload.offset': '时间偏移 (秒):',
        'player.upload.load': '加载数据',
        'player.viewer.title': '数据查看器',
        'player.info.total_time': '总时长:',
        'player.info.aria_samples': 'Aria 样本:',
        'player.info.haptic_samples': '触觉样本:',
        'player.info.offset': '时间偏移:',
        'player.control.play': '播放',
        'player.control.pause': '暂停',
        'player.control.stop': '停止',
        'player.control.speed': '速度:',
        'player.control.window': '显示窗口大小:',
        'player.control.window_unit': '秒 (设为0显示全部)',
        'player.control.apply': '应用',
        'player.range.x_axis': 'X 轴范围 (时间/秒)',
        'player.range.y_axis': 'Y 轴范围 (归一化值)',
        'player.range.apply': '应用范围',
        'player.range.reset': '重置',
        'player.plot.signals': '信号曲线',
        'player.plot.hand3d': '手部3D可视化',
        'player.hint.restored': '检测到上次使用的文件和设置已自动恢复',
    },

    'en-US': {
        // Header
        'app.title': 'Aria-Haptic Time Alignment Tool',
        'app.subtitle': 'Align Project Aria hand tracking data with haptic sensor data',
        'nav.visualize': 'Data Visualization',
        'nav.player': 'Data Player',
        'nav.data_manager': 'Data Manager',
        'nav.gripper': 'Gripper Visualization',
        'nav.alignment': 'Alignment Tool',

        // Workflow Guide
        'workflow.title': 'Workflow',
        'workflow.step1.title': 'Select Data Files',
        'workflow.step1.desc': 'Choose a data directory under "Select Data Files". The system auto-detects MPS CSV, haptic CSV, and VRS files.',
        'workflow.step2.title': 'Run Alignment',
        'workflow.step2.desc': 'Confirm parameters and click "Start Alignment". The system computes the optimal time offset between Aria hand tracking and haptic data.',
        'workflow.step3.title': 'Fine-tune Offset & Check Video',
        'workflow.step3.desc': 'Drag the offset slider to fine-tune alignment; play the RGB video to verify; click "Save Offset Config" when satisfied.',
        'workflow.step4.title': 'Edit Force Segments',
        'workflow.step4.desc': 'Drag segment boundaries in the chart to adjust; click "+ Add Segment" to create new ones; right-click to delete; then click "Save Segments".',
        'workflow.step5.title': 'Export to LeRobot',
        'workflow.step5.desc': 'Set output directory and task name in "Export to LeRobot", then click "Run Conversion" to generate the training dataset.',
        'workflow.tip': 'Next time you open the tool, saved alignment configs and segments are auto-detected and can be loaded instantly without re-computing.',

        // Theme
        'theme.dark': 'Switch to dark mode',
        'theme.light': 'Switch to light mode',

        // Warning Banner
        'warning.aria_api.title': 'aria_api Not Installed',
        'warning.aria_api.desc': 'VRS file processing is not available. Please install aria_api for full functionality.',
        'warning.aria_api.install': 'Installation:',

        // File Upload Section
        'upload.title': 'Upload Data Files',
        'upload.mode.mps': 'MPS CSV Mode',
        'upload.mode.mps.desc': 'Upload MPS-generated hand_tracking_results.csv (recommended, no aria_api required)',
        'upload.mode.vrs': 'VRS Mode',
        'upload.mode.vrs.desc': 'Upload VRS file (requires aria_api, large file)',
        'upload.mode.vrs.disabled': '(aria_api not installed)',
        'upload.file.mps': 'MPS CSV File:',
        'upload.file.vrs': 'VRS File:',
        'upload.file.haptic': 'Haptic CSV File:',
        'upload.file.none': 'No file selected',

        // Parameters Section
        'params.title': 'Alignment Parameters',
        'params.max_offset': 'Max Offset Range (s):',
        'params.max_offset.help': 'Maximum range to search for time offset',
        'params.method': 'Alignment Method:',
        'params.method.help': 'Choose similarity computation method',
        'params.method.xcorr': 'Cross-correlation (Recommended)',
        'params.method.pearson': 'Pearson Correlation',
        'params.method.dtw': 'Dynamic Time Warping (Slow)',
        'params.method.mi': 'Mutual Information (Slow)',
        'params.method.hybrid': 'Hybrid Method (Slow)',
        'params.force_threshold': 'Force Threshold (N):',
        'params.force_threshold.help': 'Minimum force value for segment detection',
        'params.smooth_window': 'Smooth Window Size:',
        'params.smooth_window.help': 'Noise reduction smooth filter window',
        'params.export_segments': 'Detect and Export Segments',
        'params.export_segments.help': 'Auto-detect force segments and generate CSV',
        'params.view_window': 'View Window (s):',
        'params.view_window.help': 'Default visible range in chart, use bottom slider to navigate all data',

        // Action Button
        'action.align': 'Start Alignment Analysis',
        'action.processing': 'Processing...',

        // Loading
        'loading.title': 'Processing...',
        'loading.upload': 'Uploading files...',
        'loading.load': 'Loading data...',
        'loading.align': 'Computing optimal offset...',
        'loading.segment': 'Detecting segments...',
        'loading.plot': 'Generating visualization...',
        'loading.wait': 'This may take from seconds to minutes, depending on data size and alignment method.',

        // Results Section
        'results.title': 'Alignment Results',
        'results.stats': 'Statistics',
        'results.optimal_offset': 'Optimal Time Offset',
        'results.similarity': 'Similarity Score',
        'results.aria_samples': 'Aria Samples',
        'results.haptic_samples': 'Haptic Samples',
        'results.segments': 'Detected Segments',
        'results.method': 'Alignment Method',
        'results.unit.seconds': 's',
        'results.unit.samples': 'samples',
        'results.unit.segments': 'segments',

        // Interactive Controls
        'interactive.title': 'Interactive Offset Adjustment',
        'interactive.current_offset': 'Current Offset',
        'interactive.current_similarity': 'Current Similarity',
        'interactive.apply': 'Apply Offset',
        'interactive.reset': 'Reset to Optimal Offset',
        'interactive.help': 'Drag the slider to view alignment with different time offsets in real-time',

        // Visualization
        'viz.title': 'Visualization',
        'viz.before': 'Before Alignment',
        'viz.after': 'After Alignment (offset = {offset}s)',
        'viz.correlation': 'Similarity Score vs Time Offset',
        'viz.aria': 'Aria (inverted distance)',
        'viz.haptic': 'Haptic (force)',
        'viz.haptic_offset': 'Haptic (offset +{offset}s)',
        'viz.similarity': 'Similarity Score',
        'viz.time': 'Time (s)',
        'viz.offset': 'Time Offset (s)',
        'viz.value': 'Normalized Value',

        // Segments Panel
        'segments.title': 'Force Segments',
        'segments.add': '+ Add Segment',
        'segments.save': '💾 Save Segments',
        'segments.save_no_haptic': 'Load haptic data first before saving segments',
        'segments.save_empty': 'No segments to save',
        'segments.select_all': 'Select All',
        'segments.deselect_all': 'Deselect All',
        'segments.empty': 'No segments yet. Click "+ Add Segment" to create one.',
        'segments.drag_hint': 'Drag segment boundaries in the plot to adjust. Uncheck to exclude from CSV export.',

        // Episode Preview
        'episodes.title': 'LeRobot Episode Preview',
        'episodes.count': '{count} episodes',
        'episodes.episode': 'Episode',
        'episodes.time_range': 'Time Range',
        'episodes.duration': 'Duration',
        'episodes.frames': 'Est. Frames',
        'episodes.source': 'Source Segment',
        'episodes.total': 'Total',
        'episodes.total_duration': 'Total Duration',
        'episodes.total_frames': 'Total Frames',
        'episodes.no_segments': 'No enabled segments. Please check at least one segment above.',

        // Export
        'export.title': 'LeRobot Export',
        'export.output_dir': 'Output Directory:',
        'export.output_dir_placeholder': 'LeRobot dataset output path',
        'export.cli_label': 'CLI Command:',
        'export.save_segments': 'Save Segments CSV',
        'export.copy_cli': 'Copy Command',
        'export.save_success': 'Segments CSV saved to: {path}',
        'export.save_error': 'Save failed: {error}',
        'export.copy_success': 'Command copied to clipboard',
        'export.copy_error': 'Copy failed',
        'export.run_conversion': 'Run Conversion',
        'export.converting': 'Converting...',
        'export.conversion_complete': 'Conversion Complete',
        'export.conversion_failed': 'Conversion Failed',
        'export.task_name': 'Task Name:',
        'export.no_output_dir': 'Please specify an output directory first',
        'export.no_vrs': 'VRS file is required for conversion',

        // Saved Alignment
        'saved.found': 'Saved alignment config found',
        'saved.load': 'Load Saved Alignment',
        'saved.load_cached': 'Load Results Directly',
        'saved.recompute': 'Re-compute Alignment',
        'saved.offset': 'Offset',
        'saved.similarity': 'Similarity',
        'saved.source_manual': 'Manual',
        'saved.source_auto': 'Auto',

        // Download
        'download.button': 'Download Segments CSV',

        // Error Messages
        'error.title': 'Error',
        'error.generic': 'An error occurred during processing',
        'error.see_details': 'Details:',

        // Footer
        'footer.docs': 'Documentation',
        'footer.github': 'GitHub Repository',

        // Visualize Page
        'visualize.title': 'Data Visualization Tool',
        'visualize.subtitle': 'View MPS hand tracking data and haptic sensor data separately',
        'visualize.nav.back': 'Back to Alignment Tool',
        'visualize.tab.mps': 'MPS Hand Tracking Data',
        'visualize.tab.haptic': 'Haptic Sensor Data',
        'visualize.mps.upload': 'Upload MPS CSV File',
        'visualize.mps.label': 'MPS CSV File (hand_tracking_results.csv):',
        'visualize.mps.button': 'Load and Visualize',
        'visualize.haptic.upload': 'Upload Haptic CSV File',
        'visualize.haptic.label': 'Haptic CSV File:',
        'visualize.haptic.button': 'Load and Visualize',
        'visualize.result.mps': 'MPS Data Visualization',
        'visualize.result.haptic': 'Haptic Data Visualization',
        'visualize.stats.samples': 'Samples',
        'visualize.stats.time_range': 'Time Range',
        'visualize.stats.distance_range': 'Distance Range',
        'visualize.stats.force_range': 'Force Range',
        'visualize.stats.total_frames': 'Total Frames',
        'visualize.stats.valid_frames': 'Valid Frames',
        'visualize.stats.success_rate': 'Success Rate',
        'visualize.stats.avg_confidence': 'Avg Confidence',

        // Player Page
        'player.title': 'Aligned Data Player',
        'player.subtitle': 'Interactively browse and play aligned data with time window and zoom controls',
        'player.nav.back': 'Back to Alignment Tool',
        'player.upload.title': 'Load Aligned Data',
        'player.upload.desc': 'Complete alignment first, then upload data files for playback',
        'player.upload.mps': 'MPS CSV File:',
        'player.upload.haptic': 'Haptic CSV File:',
        'player.upload.offset': 'Time Offset (s):',
        'player.upload.load': 'Load Data',
        'player.viewer.title': 'Data Viewer',
        'player.info.total_time': 'Total Duration:',
        'player.info.aria_samples': 'Aria Samples:',
        'player.info.haptic_samples': 'Haptic Samples:',
        'player.info.offset': 'Time Offset:',
        'player.control.play': 'Play',
        'player.control.pause': 'Pause',
        'player.control.stop': 'Stop',
        'player.control.speed': 'Speed:',
        'player.control.window': 'Display Window Size:',
        'player.control.window_unit': 's (set 0 to show all)',
        'player.control.apply': 'Apply',
        'player.range.x_axis': 'X Axis Range (Time/s)',
        'player.range.y_axis': 'Y Axis Range (Normalized)',
        'player.range.apply': 'Apply Range',
        'player.range.reset': 'Reset',
        'player.plot.signals': 'Signal Curves',
        'player.plot.hand3d': 'Hand 3D Visualization',
        'player.hint.restored': 'Previously used files and settings have been automatically restored',
    }
};

// Current language state
let currentLanguage = localStorage.getItem('language') || 'zh-CN';

// Get translation
function t(key, params = {}) {
    let text = translations[currentLanguage][key] || translations['en-US'][key] || key;

    // Replace parameters
    for (const [param, value] of Object.entries(params)) {
        text = text.replace(`{${param}}`, value);
    }

    return text;
}

// Update all translatable elements
function updateLanguage() {
    // Update elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const params = {};

        // Get parameters from data attributes
        Array.from(element.attributes).forEach(attr => {
            if (attr.name.startsWith('data-i18n-param-')) {
                const paramName = attr.name.replace('data-i18n-param-', '');
                params[paramName] = attr.value;
            }
        });

        // Update text content or placeholder
        if (element.tagName === 'INPUT' && element.type !== 'submit' && element.type !== 'button') {
            if (element.placeholder !== undefined) {
                element.placeholder = t(key, params);
            }
        } else if (element.tagName === 'OPTION') {
            element.textContent = t(key, params);
        } else {
            element.textContent = t(key, params);
        }
    });

    // Update elements with data-i18n-html attribute (for HTML content)
    document.querySelectorAll('[data-i18n-html]').forEach(element => {
        const key = element.getAttribute('data-i18n-html');
        element.innerHTML = t(key);
    });

    // Update page lang attribute
    document.documentElement.lang = currentLanguage;

    // Save language preference
    localStorage.setItem('language', currentLanguage);

    // Update language toggle button
    updateLanguageButton();
}

// Toggle language
function toggleLanguage() {
    currentLanguage = currentLanguage === 'zh-CN' ? 'en-US' : 'zh-CN';
    updateLanguage();
}

// Update language button appearance
function updateLanguageButton() {
    const langBtn = document.getElementById('language-toggle');
    if (langBtn) {
        langBtn.textContent = currentLanguage === 'zh-CN' ? 'English' : '中文';
        langBtn.setAttribute('aria-label',
            currentLanguage === 'zh-CN' ? 'Switch to English' : '切换到中文'
        );
    }
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', function() {
    updateLanguage();

    // Add language toggle button click handler
    const langBtn = document.getElementById('language-toggle');
    if (langBtn) {
        langBtn.addEventListener('click', toggleLanguage);
    }
});

// Export functions for use in other scripts
window.i18n = {
    t: t,
    updateLanguage: updateLanguage,
    toggleLanguage: toggleLanguage,
    getCurrentLanguage: () => currentLanguage
};
