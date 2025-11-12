// Internationalization (i18n) for Aria-Haptic Alignment Web App
// Supports Chinese (zh-CN) and English (en-US)

const translations = {
    'zh-CN': {
        // Header
        'app.title': 'Aria-Haptic 时间对齐工具',
        'app.subtitle': '对齐 Project Aria 手部追踪数据与触觉传感器数据',
        'nav.visualize': '数据可视化',

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
    },

    'en-US': {
        // Header
        'app.title': 'Aria-Haptic Time Alignment Tool',
        'app.subtitle': 'Align Project Aria hand tracking data with haptic sensor data',
        'nav.visualize': 'Data Visualization',

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
