// Main JavaScript for Aria-Haptic Alignment Web App
// Server file browser mode — no file uploads

// Global variables
let segmentsCSV = null;
let cachedData = null;
let optimalOffset = null;

// Conversion state
let conversionJobId = null;
let conversionPollInterval = null;

// Saved alignment config mapping: { filePath -> offset_config }
let savedAlignmentConfigs = {};

// Segment visualization colors (D3 category10 palette)
const SEGMENT_COLORS = [
    'rgba(31, 119, 180, 0.2)',
    'rgba(255, 127, 14, 0.2)',
    'rgba(44, 160, 44, 0.2)',
    'rgba(214, 39, 40, 0.2)',
    'rgba(148, 103, 189, 0.2)',
    'rgba(140, 86, 75, 0.2)',
    'rgba(227, 119, 194, 0.2)',
    'rgba(127, 127, 127, 0.2)',
    'rgba(188, 189, 34, 0.2)',
    'rgba(23, 190, 207, 0.2)',
    'rgba(255, 187, 120, 0.2)',
    'rgba(152, 223, 138, 0.2)',
];

const SEGMENT_BORDER_COLORS = [
    'rgb(31, 119, 180)',
    'rgb(255, 127, 14)',
    'rgb(44, 160, 44)',
    'rgb(214, 39, 40)',
    'rgb(148, 103, 189)',
    'rgb(140, 86, 75)',
    'rgb(227, 119, 194)',
    'rgb(127, 127, 127)',
    'rgb(188, 189, 34)',
    'rgb(23, 190, 207)',
    'rgb(255, 187, 120)',
    'rgb(152, 223, 138)',
];

// Force segment state
let forceSegments = [];       // [{id, start, end, duration, enabled, color, borderColor}]
let originalSegments = [];    // Original positions for offset recalculation
let isRelayouting = false;    // Re-entrancy guard for plotly_relayout handler

// DOM Elements
const dirSelect = document.getElementById('dir-select');
const mpsSelect = document.getElementById('mps-select');
const hapticSelect = document.getElementById('haptic-select');
const vrsSelect = document.getElementById('vrs-select');
const alignBtn = document.getElementById('alignBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const resultsSection = document.getElementById('resultsSection');
const errorSection = document.getElementById('errorSection');
const downloadSection = document.getElementById('downloadSection');
const downloadBtn = document.getElementById('downloadBtn');
const offsetSlider = document.getElementById('offset-slider');
const currentOffsetSpan = document.getElementById('current-offset');
const currentSimilaritySpan = document.getElementById('current-similarity');
const applyOffsetBtn = document.getElementById('apply-offset-btn');
const resetOffsetBtn = document.getElementById('reset-offset-btn');
const maxOffsetLabel = document.getElementById('max-offset-label');

// ==================== Server File Browser ====================

// Load directory listing on page load
async function loadDirectories() {
    // Parse URL params for auto-selection from data manager
    const urlParams = new URLSearchParams(window.location.search);
    const autoMps = urlParams.get('mps_csv');
    const autoHaptic = urlParams.get('haptic_csv');
    const autoVrs = urlParams.get('vrs_file');
    const autoLoad = urlParams.get('load');

    // Derive data directory from file paths
    let autoDir = null;
    if (autoMps) {
        // mps_csv path like: /mnt/.../20260121/mps_XXX_vrs/hand_tracking/hand_tracking_results.csv
        // data dir is 3 levels up
        const parts = autoMps.replace(/\\/g, '/').split('/');
        if (parts.length >= 4) {
            autoDir = parts.slice(0, -3).join('/');
        }
    } else if (autoHaptic) {
        // haptic_csv path like: /mnt/.../20260121/XXX.csv
        const parts = autoHaptic.replace(/\\/g, '/').split('/');
        if (parts.length >= 2) {
            autoDir = parts.slice(0, -1).join('/');
        }
    }

    try {
        const response = await fetch('/data/api/directories');
        const result = await response.json();

        if (!result.success) {
            dirSelect.innerHTML = '<option value="">加载失败</option>';
            return;
        }

        dirSelect.innerHTML = '<option value="">-- 选择数据目录 --</option>';

        // Add root if it has files
        if (result.root_files && result.root_files.length > 0) {
            const opt = document.createElement('option');
            opt.value = result.root;
            opt.textContent = '/ (根目录)';
            dirSelect.appendChild(opt);
        }

        // Add subdirectories
        if (result.subdirectories) {
            result.subdirectories.forEach(dir => {
                const opt = document.createElement('option');
                opt.value = dir.path;
                opt.textContent = `${dir.name}  (VRS: ${dir.vrs_count}, CSV: ${dir.csv_count})`;
                dirSelect.appendChild(opt);
            });
        }

        // Auto-select directory if from data manager
        if (autoLoad && autoDir) {
            dirSelect.value = autoDir;
            await loadFiles(autoDir);
            // Auto-select files
            if (autoMps && mpsSelect) {
                mpsSelect.value = autoMps;
            }
            if (autoHaptic && hapticSelect) {
                hapticSelect.value = autoHaptic;
            }
            if (autoVrs && vrsSelect) {
                vrsSelect.value = autoVrs;
            }
            checkFormValidity();
            // Clean URL to avoid re-triggering on refresh
            window.history.replaceState({}, '', '/');
        }
    } catch (error) {
        console.error('Failed to load directories:', error);
        dirSelect.innerHTML = '<option value="">加载失败</option>';
    }
}

// Load files for selected directory
async function loadFiles(directory) {
    if (!directory) {
        mpsSelect.innerHTML = '<option value="">-- 请先选择目录 --</option>';
        hapticSelect.innerHTML = '<option value="">-- 请先选择目录 --</option>';
        vrsSelect.innerHTML = '<option value="">-- 无 --</option>';
        mpsSelect.disabled = true;
        hapticSelect.disabled = true;
        vrsSelect.disabled = true;
        checkFormValidity();
        return;
    }

    try {
        const response = await fetch(`/data/api/files?directory=${encodeURIComponent(directory)}`);
        const result = await response.json();

        if (!result.success) {
            console.error('Failed to load files:', result.error);
            return;
        }

        // Collect all CSV and VRS files
        const mpsFiles = [];
        const hapticFiles = [];
        const vrsFiles = [];
        savedAlignmentConfigs = {};

        result.files.forEach(group => {
            // MPS hand tracking files
            if (group.has_hand_tracking && group.hand_tracking_file) {
                mpsFiles.push({
                    path: group.hand_tracking_file,
                    name: `${group.name} / hand_tracking_results.csv`
                });
            }

            // CSV files
            if (group.csv_files) {
                group.csv_files.forEach(csv => {
                    hapticFiles.push({
                        path: csv.path,
                        name: csv.name,
                        size: csv.size_mb
                    });
                });
            }

            // VRS files
            if (group.vrs_file) {
                vrsFiles.push({
                    path: group.vrs_file,
                    name: `${group.name}.vrs`,
                    size: group.size_mb
                });
            }

            // Store offset_config if available
            if (group.offset_config) {
                const oc = group.offset_config;
                // Map by all related file paths for matching
                if (oc.files) {
                    if (oc.files.haptic_csv) savedAlignmentConfigs[oc.files.haptic_csv] = oc;
                    if (oc.files.mps_csv) savedAlignmentConfigs[oc.files.mps_csv] = oc;
                    if (oc.files.vrs_file) savedAlignmentConfigs[oc.files.vrs_file] = oc;
                }
                // Also map by group name for fallback matching
                if (group.name) savedAlignmentConfigs[`__group__${group.name}`] = oc;
            }
        });

        // Populate MPS select
        mpsSelect.innerHTML = '<option value="">-- 选择 MPS 文件 --</option>';
        mpsFiles.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.path;
            opt.textContent = f.name;
            mpsSelect.appendChild(opt);
        });
        mpsSelect.disabled = mpsFiles.length === 0;

        // Populate Haptic select
        hapticSelect.innerHTML = '<option value="">-- 选择触觉文件 --</option>';
        hapticFiles.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.path;
            opt.textContent = `${f.name} (${f.size} MB)`;
            hapticSelect.appendChild(opt);
        });
        hapticSelect.disabled = hapticFiles.length === 0;

        // Populate VRS select
        vrsSelect.innerHTML = '<option value="">-- 无 --</option>';
        vrsFiles.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.path;
            opt.textContent = `${f.name} (${f.size} MB)`;
            vrsSelect.appendChild(opt);
        });
        vrsSelect.disabled = vrsFiles.length === 0;

        checkFormValidity();
    } catch (error) {
        console.error('Failed to load files:', error);
    }
}

// Directory change handler
dirSelect.addEventListener('change', function () {
    loadFiles(this.value);
});

// File select change handlers
mpsSelect.addEventListener('change', checkFormValidity);
hapticSelect.addEventListener('change', checkFormValidity);
vrsSelect.addEventListener('change', checkFormValidity);

// Check if form is valid
function checkFormValidity() {
    const hasMps = mpsSelect.value !== '';
    const hasHaptic = hapticSelect.value !== '';
    alignBtn.disabled = !(hasMps && hasHaptic);
    checkSavedAlignmentConfig();
}

/**
 * Check if any selected file has a saved alignment config.
 * If found, show a banner with "Load Saved Alignment" button and fill in parameters.
 */
function checkSavedAlignmentConfig() {
    const banner = document.getElementById('saved-alignment-banner');
    const infoDiv = document.getElementById('saved-alignment-info');
    if (!banner) return;

    // Try to find a matching config for any selected file
    let config = null;
    const filePaths = [hapticSelect.value, mpsSelect.value, vrsSelect.value].filter(Boolean);
    for (const fp of filePaths) {
        if (savedAlignmentConfigs[fp]) {
            config = savedAlignmentConfigs[fp];
            break;
        }
    }

    if (!config) {
        banner.style.display = 'none';
        return;
    }

    // Show banner — prefer current_offset (user-adjusted) over optimal_offset (auto-computed)
    const t = window.i18n ? window.i18n.t : (k => k);
    const displayOffset = config.current_offset != null ? config.current_offset : config.optimal_offset;
    const offset = displayOffset != null ? displayOffset.toFixed(3) : '?';
    const sim = config.similarity != null ? config.similarity.toFixed(4) : '?';
    const method = config.method || 'xcorr';
    const ts = config.timestamp ? new Date(config.timestamp).toLocaleString() : '';

    const sourceLabel = config.save_source === 'manual' ? t('saved.source_manual') : config.save_source === 'auto' ? t('saved.source_auto') : '';

    infoDiv.innerHTML = `${t('saved.offset')}: <b>${offset}s</b> | ${t('saved.similarity')}: <b>${sim}</b> | ${method.toUpperCase()}${sourceLabel ? ' | ' + sourceLabel : ''} ${ts ? '| ' + ts : ''}`;
    banner.style.display = 'block';

    // Show/hide cached load button based on whether cache exists
    const cachedBtn = document.getElementById('load-cached-alignment-btn');
    if (cachedBtn) {
        cachedBtn.style.display = config.has_cache ? 'inline-block' : 'none';
    }

    // Fill in saved parameters to the form
    const params = config.parameters || {};
    if (params.max_offset) document.getElementById('max_offset').value = params.max_offset;
    if (params.force_threshold) document.getElementById('force_threshold').value = params.force_threshold;
    if (params.force_max_threshold) document.getElementById('force_max_threshold').value = params.force_max_threshold;
    if (params.smooth_window) document.getElementById('smooth_window').value = params.smooth_window;
    if (config.method) document.getElementById('method').value = config.method;

    // Auto-select matching files if not already selected
    const files = config.files || {};
    if (files.mps_csv && !mpsSelect.value) {
        for (const opt of mpsSelect.options) {
            if (opt.value === files.mps_csv) { mpsSelect.value = files.mps_csv; break; }
        }
    }
    if (files.haptic_csv && !hapticSelect.value) {
        for (const opt of hapticSelect.options) {
            if (opt.value === files.haptic_csv) { hapticSelect.value = files.haptic_csv; break; }
        }
    }
    if (files.vrs_file && !vrsSelect.value) {
        for (const opt of vrsSelect.options) {
            if (opt.value === files.vrs_file) { vrsSelect.value = files.vrs_file; break; }
        }
    }

    // Update button state after auto-select
    const hasMps = mpsSelect.value !== '';
    const hasHaptic = hapticSelect.value !== '';
    alignBtn.disabled = !(hasMps && hasHaptic);
}

/**
 * Load saved alignment by re-running alignment with saved parameters.
 * After results display, applies saved current_offset to slider.
 */
async function loadSavedAlignment() {
    // Find matching config
    let config = null;
    const filePaths = [hapticSelect.value, mpsSelect.value, vrsSelect.value].filter(Boolean);
    for (const fp of filePaths) {
        if (savedAlignmentConfigs[fp]) {
            config = savedAlignmentConfigs[fp];
            break;
        }
    }
    if (!config) return;

    // Trigger alignment with saved parameters (same as clicking align button)
    resultsSection.style.display = 'none';
    errorSection.style.display = 'none';
    downloadSection.style.display = 'none';
    loadingIndicator.style.display = 'block';
    alignBtn.disabled = true;

    try {
        const params = config.parameters || {};
        const requestBody = {
            mps_csv_path: mpsSelect.value || null,
            haptic_csv_path: hapticSelect.value,
            vrs_path: vrsSelect.value || null,
            max_offset: parseFloat(params.max_offset || document.getElementById('max_offset').value),
            method: config.method || document.getElementById('method').value,
            force_threshold: parseFloat(params.force_threshold || document.getElementById('force_threshold').value),
            force_max_threshold: parseFloat(params.force_max_threshold || document.getElementById('force_max_threshold').value),
            smooth_window: parseInt(params.smooth_window || document.getElementById('smooth_window').value),
            export_segments: true,
            view_window: parseFloat(document.getElementById('view_window').value) || 120
        };

        window.serverMpsPath = requestBody.mps_csv_path;
        window.serverHapticPath = requestBody.haptic_csv_path;
        window.serverVrsPath = requestBody.vrs_path;

        const response = await fetch('/align_from_path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Processing failed');

        displayResults(data);

        // Apply saved current_offset to slider (may differ from optimal_offset)
        _applySavedOffset(config);

        // Initialize VRS video if VRS selected
        if (vrsSelect.value && !vrsVideoInitialized) {
            await initVRSSessionFromPath(vrsSelect.value);
        }
    } catch (error) {
        displayError(error);
    } finally {
        loadingIndicator.style.display = 'none';
        alignBtn.disabled = false;
    }
}

/**
 * Load cached alignment results directly without re-computing.
 * Uses saved alignment cache (gzipped JSON) for instant load.
 */
async function loadCachedAlignment() {
    // Find matching config
    let config = null;
    const filePaths = [hapticSelect.value, mpsSelect.value, vrsSelect.value].filter(Boolean);
    for (const fp of filePaths) {
        if (savedAlignmentConfigs[fp]) {
            config = savedAlignmentConfigs[fp];
            break;
        }
    }
    if (!config) return;

    resultsSection.style.display = 'none';
    errorSection.style.display = 'none';
    downloadSection.style.display = 'none';
    loadingIndicator.style.display = 'block';
    alignBtn.disabled = true;

    try {
        window.serverMpsPath = mpsSelect.value || null;
        window.serverHapticPath = hapticSelect.value;
        window.serverVrsPath = vrsSelect.value || null;

        const response = await fetch('/api/load_saved_alignment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                haptic_csv_path: hapticSelect.value,
                mps_csv_path: mpsSelect.value || null,
                vrs_path: vrsSelect.value || null
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.no_cache) {
                // No cache found, fall back to re-compute
                console.log('No alignment cache found, falling back to re-compute');
                loadingIndicator.style.display = 'none';
                alignBtn.disabled = false;
                await loadSavedAlignment();
                return;
            }
            throw new Error(data.error || 'Failed to load cached alignment');
        }

        displayResults(data);

        // Apply saved current_offset to slider
        _applySavedOffset(config);

        // Initialize VRS video if VRS selected
        if (vrsSelect.value && !vrsVideoInitialized) {
            await initVRSSessionFromPath(vrsSelect.value);
        }
    } catch (error) {
        displayError(error);
    } finally {
        loadingIndicator.style.display = 'none';
        alignBtn.disabled = false;
    }
}

/**
 * Apply saved current_offset to slider after displayResults().
 * If the user previously adjusted the offset (current_offset != optimal_offset),
 * this restores their adjusted value and updates the plot.
 */
function _applySavedOffset(config) {
    if (config.current_offset != null && config.optimal_offset != null &&
        Math.abs(config.current_offset - config.optimal_offset) > 0.0001) {
        const savedOffset = config.current_offset;
        offsetSlider.value = savedOffset;
        currentOffsetSpan.textContent = savedOffset.toFixed(3);
        const similarity = getSimilarityAtOffset(savedOffset);
        currentSimilaritySpan.textContent = similarity.toFixed(4);
        updatePlotWithOffset(savedOffset);
    }
}

// ==================== Alignment ====================

// Align button click handler
alignBtn.addEventListener('click', async function () {
    resultsSection.style.display = 'none';
    errorSection.style.display = 'none';
    downloadSection.style.display = 'none';
    loadingIndicator.style.display = 'block';
    alignBtn.disabled = true;

    try {
        const requestBody = {
            mps_csv_path: mpsSelect.value || null,
            haptic_csv_path: hapticSelect.value,
            vrs_path: vrsSelect.value || null,
            max_offset: parseFloat(document.getElementById('max_offset').value),
            method: document.getElementById('method').value,
            force_threshold: parseFloat(document.getElementById('force_threshold').value),
            force_max_threshold: parseFloat(document.getElementById('force_max_threshold').value),
            smooth_window: parseInt(document.getElementById('smooth_window').value),
            export_segments: document.getElementById('export_segments').checked,
            view_window: parseFloat(document.getElementById('view_window').value) || 120
        };

        // Store paths globally for save offset
        window.serverMpsPath = requestBody.mps_csv_path;
        window.serverHapticPath = requestBody.haptic_csv_path;
        window.serverVrsPath = requestBody.vrs_path;

        const response = await fetch('/align_from_path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '处理失败');
        }

        displayResults(data);

        // Initialize VRS video if VRS selected
        if (vrsSelect.value && !vrsVideoInitialized) {
            await initVRSSessionFromPath(vrsSelect.value);
        }
    } catch (error) {
        displayError(error);
    } finally {
        loadingIndicator.style.display = 'none';
        alignBtn.disabled = false;
    }
});

// ==================== Display Results ====================

function displayResults(data) {
    document.getElementById('optimal-offset').textContent = data.optimal_offset.toFixed(3);
    document.getElementById('similarity-score').textContent = data.max_similarity.toFixed(4);
    document.getElementById('aria-samples').textContent = data.aria_sample_count.toLocaleString();

    let hapticText = data.haptic_sample_count.toLocaleString();
    if (data.haptic_filtered_count && data.haptic_filtered_count > 0) {
        hapticText += ` (${data.haptic_filtered_count} 超过阈值 ${data.force_max_threshold}N 被过滤)`;
    }
    document.getElementById('haptic-samples').textContent = hapticText;

    document.getElementById('segment-count').textContent =
        data.force_segments ? data.force_segments.length : (data.segment_count || 0);
    document.getElementById('method-used').textContent = data.method.toUpperCase();

    // Initialize force segments from API response
    forceSegments = (data.force_segments || []).map(seg => ({
        ...seg,
        source: seg.source || 'auto',
        color: SEGMENT_COLORS[seg.id % SEGMENT_COLORS.length],
        borderColor: SEGMENT_BORDER_COLORS[seg.id % SEGMENT_BORDER_COLORS.length]
    }));
    // Save original positions for offset recalculation
    originalSegments = forceSegments.map(seg => ({ ...seg }));

    // Generate CSV from force segments
    updateSegmentsCSV();

    // Auto-fill output directory: /mnt/zyl/data/IROS_data/Lerobot/{base_name}
    const outputDirInput = document.getElementById('lerobot-output-dir');
    if (outputDirInput && !outputDirInput.value) {
        let baseName = '';
        if (window.serverVrsPath) {
            // Extract base name from VRS path: /mnt/.../Half_coke_0.vrs → Half_coke_0
            const vrsFile = window.serverVrsPath.split('/').pop();
            baseName = vrsFile.replace(/\.vrs$/, '');
        } else if (window.serverHapticPath) {
            // Fallback: extract from haptic CSV: Half_coke_0_20260110_155330.csv → Half_coke_0
            const csvFile = window.serverHapticPath.split('/').pop().replace(/\.csv$/, '');
            // Remove timestamp suffix (_YYYYMMDD_HHMMSS)
            baseName = csvFile.replace(/_\d{8}_\d{6}$/, '');
        }
        if (baseName) {
            outputDirInput.value = '/mnt/zyl/data/IROS_data/Lerobot/' + baseName;
            updateLeRobotCLI();
        }
    }

    cachedData = {
        aria_timestamps: data.aria_timestamps,
        aria_normalized: data.aria_normalized,
        haptic_timestamps: data.haptic_timestamps,
        haptic_normalized: data.haptic_normalized,
        haptic_thumb_force: data.haptic_thumb_force || [],
        haptic_index_force: data.haptic_index_force || [],
        offsets: data.offsets,
        correlation_scores: data.correlation_scores,
        force_segments: data.force_segments || []
    };
    optimalOffset = data.optimal_offset;

    offsetSlider.min = -10;
    offsetSlider.max = 20;
    offsetSlider.value = data.optimal_offset;
    currentOffsetSpan.textContent = data.optimal_offset.toFixed(3);
    maxOffsetLabel.textContent = '20s';

    const optimalSimilarity = getSimilarityAtOffset(data.optimal_offset);
    currentSimilaritySpan.textContent = optimalSimilarity.toFixed(4);

    try {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const layout = {
            ...data.plotly_json.layout,
            autosize: true,
            width: null,
            paper_bgcolor: isDark ? '#252540' : '#ffffff',
            plot_bgcolor: isDark ? '#252540' : '#ffffff',
            font: { ...(data.plotly_json.layout.font || {}), color: isDark ? '#c0c0d0' : '#333333' }
        };

        Plotly.newPlot('plotly-chart', data.plotly_json.data, layout, {
            responsive: true,
            displayModeBar: true,
            scrollZoom: true,
            edits: { shapePosition: true },
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            modeBarButtonsToAdd: ['toggleSpikelines'],
            displaylogo: false
        }).then(() => {
            window.dispatchEvent(new Event('resize'));
            renderSegmentShapes();
            bindPlotlyRelayoutEvent();
            updateSegmentListPanel();
            // Auto-load previously saved segments (overrides auto-detected)
            loadSavedSegments();
        });
    } catch (error) {
        console.error('Plotly rendering error:', error);
    }

    resultsSection.style.display = 'block';

    // Auto-save offset config so gripper page can read it
    // Skip if user already has a manually saved config (to avoid overwriting current_offset)
    const hasExistingConfig = [window.serverHapticPath, window.serverMpsPath, window.serverVrsPath]
        .filter(Boolean).some(fp => savedAlignmentConfigs[fp]);
    if (!hasExistingConfig) {
        autoSaveOffset(data.optimal_offset, data.max_similarity, data.method);
    }

    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

/**
 * Auto-save offset config to server after alignment completes
 */
async function autoSaveOffset(offset, similarity, method) {
    if (!window.serverHapticPath && !window.serverMpsPath && !window.serverVrsPath) return;
    try {
        await fetch('/data/api/save_offset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                haptic_path: window.serverHapticPath || null,
                mps_path: window.serverMpsPath || null,
                vrs_path: window.serverVrsPath || null,
                current_offset: offset,
                optimal_offset: offset,
                similarity: similarity,
                method: method,
                save_source: 'auto',
                parameters: {
                    max_offset: document.getElementById('max_offset').value,
                    force_threshold: document.getElementById('force_threshold').value,
                    force_max_threshold: document.getElementById('force_max_threshold').value,
                    smooth_window: document.getElementById('smooth_window').value
                }
            })
        });
        console.log('Offset auto-saved:', offset);
    } catch (e) {
        console.warn('Auto-save offset failed:', e);
    }
}

function displayError(error) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = error.message || String(error);
    errorSection.style.display = 'block';
    setTimeout(() => {
        errorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// ==================== Force Segment Visualization ====================

/**
 * Categorize Plotly shapes into: base (backend vlines), segments (colored rects), playback (green lines)
 */
function categorizeShapes() {
    const chartDiv = document.getElementById('plotly-chart');
    if (!chartDiv || !chartDiv.layout) return { base: [], segments: [], playback: [] };

    const shapes = chartDiv.layout.shapes || [];
    const base = [];
    const segments = [];
    const playback = [];

    shapes.forEach(s => {
        if (s.line && s.line.color === '#00ff00') {
            playback.push(s);
        } else if (s.type === 'rect' && s.fillcolor) {
            segments.push(s);
        } else {
            base.push(s);
        }
    });

    return { base, segments, playback };
}

/**
 * Get the paper domain (y0, y1) from the chart layout
 */
function getRow1PaperDomain() {
    const chartDiv = document.getElementById('plotly-chart');
    if (!chartDiv || !chartDiv.layout) return [0.0, 1.0];
    const domain = chartDiv.layout.yaxis && chartDiv.layout.yaxis.domain;
    return domain || [0.0, 1.0];
}

/**
 * Render segment rectangles as colored bands on the After Alignment plot (Row 2)
 * with ID labels at the top of each segment
 */
function renderSegmentShapes() {
    const chartDiv = document.getElementById('plotly-chart');
    if (!chartDiv || !chartDiv.layout) return;

    const { base, playback } = categorizeShapes();
    const domain = getRow1PaperDomain();

    // Build segment rect shapes
    const segmentShapes = forceSegments.map(seg => ({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: seg.start,
        x1: seg.end,
        y0: domain[0],
        y1: domain[1],
        fillcolor: seg.enabled ? seg.color : 'rgba(200, 200, 200, 0.08)',
        line: {
            color: seg.enabled ? seg.borderColor : 'rgba(150, 150, 150, 0.3)',
            width: seg.enabled ? 2 : 1,
            dash: seg.enabled ? 'solid' : 'dot'
        },
        editable: seg.enabled,
    }));

    // Build segment ID annotations (positioned at top-center of each rect)
    const existingAnnotations = (chartDiv.layout.annotations || []).filter(
        a => !a._isSegmentLabel
    );
    const segmentAnnotations = forceSegments.map(seg => ({
        x: (seg.start + seg.end) / 2,
        y: domain[1],
        xref: 'x',
        yref: 'paper',
        text: `<b>${seg.source === 'manual' ? 'M' : 'A'}${seg.id}</b>`,
        showarrow: false,
        font: {
            size: 11,
            color: seg.enabled ? seg.borderColor : 'rgba(150,150,150,0.5)',
        },
        bgcolor: seg.enabled ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
        bordercolor: seg.enabled ? seg.borderColor : 'rgba(150,150,150,0.3)',
        borderwidth: 1,
        borderpad: 2,
        yshift: 8,
        captureevents: true,
        _isSegmentLabel: true,
        _segmentId: seg.id,
    }));

    isRelayouting = true;
    Plotly.relayout('plotly-chart', {
        shapes: [...base, ...segmentShapes, ...playback],
        annotations: [...existingAnnotations, ...segmentAnnotations]
    }).then(() => { isRelayouting = false; })
      .catch(() => { isRelayouting = false; });
}

/**
 * Bind Plotly events for segment interaction:
 * - plotly_relayout: capture drag boundary changes
 * - plotly_clickannotation: click segment ID label to toggle enable/disable
 */
function bindPlotlyRelayoutEvent() {
    const chartDiv = document.getElementById('plotly-chart');
    if (!chartDiv) return;

    // Click annotation to toggle segment enabled/disabled
    chartDiv.on('plotly_clickannotation', function (eventData) {
        const annotation = eventData.annotation;
        if (annotation && annotation._isSegmentLabel) {
            const segId = annotation._segmentId;
            const seg = forceSegments.find(s => s.id === segId);
            if (seg) {
                seg.enabled = !seg.enabled;
                isRelayouting = true;
                renderSegmentShapes();
                isRelayouting = false;
                updateSegmentListPanel();
                updateSegmentsCSV();
            }
        }
    });

    chartDiv.on('plotly_relayout', function (eventData) {
        if (isRelayouting) return;

        // Only process individual shape property updates (from user drag)
        // Ignore bulk "shapes" array replacements (from our own code)
        const shapeUpdates = {};
        for (const key in eventData) {
            const match = key.match(/^shapes\[(\d+)\]\.(x0|x1|y0|y1)$/);
            if (match) {
                const shapeIndex = parseInt(match[1]);
                const prop = match[2];
                if (!shapeUpdates[shapeIndex]) shapeUpdates[shapeIndex] = {};
                shapeUpdates[shapeIndex][prop] = eventData[key];
            }
        }

        if (Object.keys(shapeUpdates).length === 0) return;

        // Determine the offset of segment shapes in the shapes array
        const { base } = categorizeShapes();
        const baseCount = base.length;

        let needsUpdate = false;
        for (const [idxStr, updates] of Object.entries(shapeUpdates)) {
            const idx = parseInt(idxStr);
            const segIdx = idx - baseCount;

            if (segIdx >= 0 && segIdx < forceSegments.length) {
                const seg = forceSegments[segIdx];
                if (updates.x0 !== undefined) seg.start = updates.x0;
                if (updates.x1 !== undefined) seg.end = updates.x1;

                // Ensure start < end
                if (seg.start > seg.end) {
                    [seg.start, seg.end] = [seg.end, seg.start];
                }
                seg.duration = seg.end - seg.start;

                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            // Correct y-values to prevent vertical drag + update annotation positions
            const domain = getRow1PaperDomain();
            const layoutFixes = {};
            const { base: baseShapes } = categorizeShapes();
            const offset = baseShapes.length;
            const allAnnotations = chartDiv.layout.annotations || [];
            const nonSegAnnotationCount = allAnnotations.filter(a => !a._isSegmentLabel).length;

            forceSegments.forEach((seg, i) => {
                const shapeIdx = offset + i;
                layoutFixes[`shapes[${shapeIdx}].y0`] = domain[0];
                layoutFixes[`shapes[${shapeIdx}].y1`] = domain[1];
                layoutFixes[`shapes[${shapeIdx}].x0`] = seg.start;
                layoutFixes[`shapes[${shapeIdx}].x1`] = seg.end;
                // Update annotation to match new segment center
                const annotIdx = nonSegAnnotationCount + i;
                layoutFixes[`annotations[${annotIdx}].x`] = (seg.start + seg.end) / 2;
            });

            isRelayouting = true;
            Plotly.relayout('plotly-chart', layoutFixes).then(() => {
                isRelayouting = false;
            });

            updateSegmentListPanel();
            updateSegmentsCSV();
        }
    });
}

/**
 * Update the segment list panel UI
 */
function updateSegmentListPanel() {
    const container = document.getElementById('segment-list-panel');
    if (!container) return;

    // Always show the panel (so the "Add Segment" button is accessible)
    container.style.display = 'block';
    const listBody = document.getElementById('segment-list-body');
    listBody.innerHTML = '';

    if (forceSegments.length === 0) {
        listBody.innerHTML = '<div style="text-align: center; color: #999; padding: 8px; font-size: 0.85rem;" data-i18n="segments.empty">暂无片段，点击"+ 添加片段"创建</div>';
        return;
    }

    forceSegments.forEach(seg => {
        const prefix = seg.source === 'manual' ? 'M' : 'A';
        const row = document.createElement('div');
        row.className = 'segment-row';
        row.dataset.segId = seg.id;
        row.style.cssText = `
            display: flex; align-items: center; gap: 10px; padding: 8px 12px;
            background: ${seg.enabled ? '#fff' : '#f5f5f5'};
            border-left: 4px solid ${seg.borderColor};
            margin-bottom: 4px; border-radius: 4px;
            opacity: ${seg.enabled ? 1 : 0.5};
            transition: opacity 0.2s;
            cursor: context-menu;
        `;

        row.innerHTML = `
            <input type="checkbox" ${seg.enabled ? 'checked' : ''}
                   data-seg-id="${seg.id}" class="seg-checkbox"
                   style="width: 16px; height: 16px; cursor: pointer; accent-color: ${seg.borderColor};">
            <span style="font-weight: 600; color: ${seg.borderColor}; min-width: 30px; font-size: 0.85rem;">
                ${prefix}${seg.id}
            </span>
            <span style="font-size: 0.8rem; color: #555; font-family: monospace;">
                ${seg.start.toFixed(3)}s ~ ${seg.end.toFixed(3)}s
            </span>
            <span style="font-size: 0.75rem; color: #999; margin-left: auto; white-space: nowrap;">
                ${seg.duration.toFixed(2)}s
            </span>
        `;

        // Right-click to delete
        row.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            showSegmentContextMenu(e, seg.id);
        });

        listBody.appendChild(row);
    });

    // Bind checkbox events
    container.querySelectorAll('.seg-checkbox').forEach(cb => {
        cb.addEventListener('change', function () {
            const segId = parseInt(this.dataset.segId);
            const seg = forceSegments.find(s => s.id === segId);
            if (seg) {
                seg.enabled = this.checked;
                renderSegmentShapes();
                updateSegmentListPanel();
                updateSegmentsCSV();
            }
        });
    });
}

/**
 * Show a context menu to delete a segment on right-click.
 */
function showSegmentContextMenu(event, segId) {
    // Remove any existing context menu
    const existing = document.getElementById('segment-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'segment-context-menu';
    menu.style.cssText = `
        position: fixed; z-index: 10000;
        left: ${event.clientX}px; top: ${event.clientY}px;
        background: #fff; border: 1px solid #ddd; border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0;
        min-width: 120px; font-size: 0.85rem;
    `;

    const seg = forceSegments.find(s => s.id === segId);
    const prefix = seg ? (seg.source === 'manual' ? 'M' : 'A') : '#';

    const deleteItem = document.createElement('div');
    deleteItem.style.cssText = `
        padding: 6px 16px; cursor: pointer; color: #dc3545;
        display: flex; align-items: center; gap: 6px;
    `;
    deleteItem.innerHTML = `<span>🗑</span><span>删除 ${prefix}${segId}</span>`;
    deleteItem.addEventListener('mouseenter', () => { deleteItem.style.background = '#f8f9fa'; });
    deleteItem.addEventListener('mouseleave', () => { deleteItem.style.background = ''; });
    deleteItem.addEventListener('click', () => {
        deleteSegment(segId);
        menu.remove();
    });

    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    // Close menu on click elsewhere
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

/**
 * Delete a segment by ID.
 */
function deleteSegment(segId) {
    forceSegments = forceSegments.filter(s => s.id !== segId);
    originalSegments = originalSegments.filter(s => s.id !== segId);
    renderSegmentShapes();
    updateSegmentListPanel();
    updateSegmentsCSV();
}

/**
 * Add a new segment after the last existing segment.
 * Default duration: 5 seconds, starting 2 seconds after the last segment ends.
 */
function addNewSegment() {
    const chartDiv = document.getElementById('plotly-chart');
    if (!chartDiv || !chartDiv.layout) {
        console.warn('addNewSegment: chart not ready');
        return;
    }

    const newId = forceSegments.length > 0 ? Math.max(...forceSegments.map(s => s.id)) + 1 : 0;

    // Always place in the center of the current visible range
    const xRange = chartDiv.layout.xaxis && chartDiv.layout.xaxis.range;
    let start;
    if (xRange) {
        const center = (xRange[0] + xRange[1]) / 2;
        start = center - 2.5;
    } else if (forceSegments.length > 0) {
        const lastSeg = forceSegments.reduce((a, b) => a.end > b.end ? a : b);
        start = lastSeg.end + 2;
    } else {
        start = 0;
    }
    const end = start + 5;

    const seg = {
        id: newId,
        start: start,
        end: end,
        duration: end - start,
        enabled: true,
        source: 'manual',
        color: SEGMENT_COLORS[newId % SEGMENT_COLORS.length],
        borderColor: SEGMENT_BORDER_COLORS[newId % SEGMENT_BORDER_COLORS.length],
    };

    forceSegments.push(seg);
    originalSegments.push({ ...seg });

    console.log(`Added segment #${newId}: ${start.toFixed(3)}s ~ ${end.toFixed(3)}s`);
    renderSegmentShapes();
    updateSegmentListPanel();
    updateSegmentsCSV();
}

/**
 * Save current segments to server (CSV file alongside haptic data).
 */
async function saveSegments() {
    const hapticPath = window.serverHapticPath;
    if (!hapticPath) {
        alert(t('segments.save_no_haptic'));
        return;
    }
    if (forceSegments.length === 0) {
        alert(t('segments.save_empty'));
        return;
    }

    const btn = document.getElementById('save-segments-btn');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '...';

    try {
        const resp = await fetch('/api/save_segments_csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                haptic_path: hapticPath,
                offset: parseFloat(offsetSlider.value),
                segments: forceSegments.map(s => ({
                    id: s.id, start: s.start, end: s.end,
                    duration: s.duration, enabled: s.enabled,
                    source: s.source || 'auto'
                }))
            })
        });
        const data = await resp.json();
        if (data.success) {
            btn.textContent = '✓';
            btn.style.background = '#28a745';
            btn.style.borderColor = '#28a745';
            setTimeout(() => {
                btn.textContent = origText;
                btn.style.background = '#007bff';
                btn.style.borderColor = '#007bff';
                btn.disabled = false;
            }, 1500);
        } else {
            throw new Error(data.error || 'Save failed');
        }
    } catch (e) {
        console.error('Save segments error:', e);
        btn.textContent = '✗';
        btn.style.background = '#dc3545';
        btn.style.borderColor = '#dc3545';
        setTimeout(() => {
            btn.textContent = origText;
            btn.style.background = '#007bff';
            btn.style.borderColor = '#007bff';
            btn.disabled = false;
        }, 2000);
    }
}

/**
 * Load previously saved segments from server.
 * Called after alignment results are displayed.
 * If saved segments exist, they replace the auto-detected ones.
 */
async function loadSavedSegments() {
    const hapticPath = window.serverHapticPath;
    if (!hapticPath) return;

    try {
        const resp = await fetch('/api/load_segments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ haptic_path: hapticPath })
        });
        const data = await resp.json();
        if (data.success && data.found && data.segments && data.segments.length > 0) {
            console.log(`Loaded ${data.segments.length} saved segments`);
            forceSegments = data.segments.map(seg => ({
                ...seg,
                source: seg.source || 'auto',
                color: SEGMENT_COLORS[seg.id % SEGMENT_COLORS.length],
                borderColor: SEGMENT_BORDER_COLORS[seg.id % SEGMENT_BORDER_COLORS.length]
            }));
            originalSegments = forceSegments.map(seg => ({ ...seg }));
            renderSegmentShapes();
            updateSegmentListPanel();
            updateSegmentsCSV();
        }
    } catch (e) {
        console.warn('Failed to load saved segments:', e);
    }
}

/**
 * Regenerate segments CSV from current forceSegments state
 */
function updateSegmentsCSV() {
    if (forceSegments.length === 0) {
        segmentsCSV = null;
        downloadSection.style.display = 'none';
        return;
    }

    let csv = 'segment_id,start_time_s,end_time_s,duration_s,enabled,source\n';
    forceSegments.forEach(seg => {
        csv += `${seg.id},${seg.start.toFixed(3)},${seg.end.toFixed(3)},${seg.duration.toFixed(3)},${seg.enabled},${seg.source || 'auto'}\n`;
    });
    segmentsCSV = csv;
    downloadSection.style.display = 'block';

    // 同步更新分集预览
    updateEpisodePreview();
}

// ==================== LeRobot Episode Preview ====================

/**
 * 根据当前启用的片段更新分集预览面板
 */
function updateEpisodePreview() {
    const panel = document.getElementById('episode-preview-panel');
    const listBody = document.getElementById('episode-list-body');
    const badge = document.getElementById('episode-count-badge');
    const statsDiv = document.getElementById('episode-total-stats');
    const exportSection = document.getElementById('lerobot-export-section');

    if (!panel || !listBody) return;

    const enabledSegments = forceSegments.filter(s => s.enabled);

    if (enabledSegments.length === 0) {
        panel.style.display = 'none';
        if (exportSection) exportSection.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    if (exportSection) exportSection.style.display = 'block';

    const sorted = [...enabledSegments].sort((a, b) => a.start - b.start);
    const estimatedFPS = 30;

    badge.textContent = `${sorted.length} episodes`;
    listBody.innerHTML = '';

    let totalDuration = 0;
    let totalFrames = 0;

    sorted.forEach((seg, episodeIdx) => {
        const duration = seg.end - seg.start;
        totalDuration += duration;
        const frames = Math.round(duration * estimatedFPS);
        totalFrames += frames;

        const row = document.createElement('div');
        row.style.cssText = `
            display: flex; align-items: center; gap: 12px; padding: 6px 12px;
            background: white; border-left: 4px solid ${seg.borderColor};
            margin-bottom: 3px; border-radius: 4px; font-size: 0.82rem;
        `;
        row.innerHTML = `
            <span style="font-weight: 600; color: ${seg.borderColor}; min-width: 80px;">
                Episode ${episodeIdx}
            </span>
            <span style="color: #555; font-family: monospace; min-width: 180px;">
                ${seg.start.toFixed(3)}s → ${seg.end.toFixed(3)}s
            </span>
            <span style="color: #888; min-width: 60px;">
                ${duration.toFixed(2)}s
            </span>
            <span style="color: #999; font-size: 0.75rem;">
                ~${frames} 帧
            </span>
            <span style="color: #aaa; font-size: 0.7rem; margin-left: auto;">
                (片段 #${seg.id})
            </span>
        `;
        listBody.appendChild(row);
    });

    statsDiv.innerHTML = `
        <span>共 ${sorted.length} 个分集</span>
        <span>总时长: ${totalDuration.toFixed(2)}s</span>
        <span>~${totalFrames} 帧 (预估 @${estimatedFPS}fps)</span>
    `;

    updateLeRobotCLI();
}

/**
 * 生成 Aria-to-Lerobot CLI 命令
 */
function updateLeRobotCLI() {
    const cmdDiv = document.getElementById('lerobot-cli-command');
    if (!cmdDiv) return;

    const vrsPath = window.serverVrsPath || '<VRS_PATH>';
    const hapticPath = window.serverHapticPath || '<HAPTIC_CSV_PATH>';
    const outputDirInput = document.getElementById('lerobot-output-dir');
    const outputDir = (outputDirInput && outputDirInput.value) || '<OUTPUT_DIR>';
    const currentOffset = parseFloat(offsetSlider.value) || optimalOffset || 0;

    // 从 MPS CSV 路径推断 MPS 目录
    let mpsDir = '<MPS_DIR>';
    if (window.serverMpsPath) {
        const parts = window.serverMpsPath.split('/');
        const htIdx = parts.indexOf('hand_tracking');
        if (htIdx > 0) {
            mpsDir = parts.slice(0, htIdx).join('/');
        } else {
            mpsDir = parts.slice(0, -1).join('/');
        }
    }

    // 片段 CSV 路径
    let segCsvPath = '<SEGMENTS_CSV_PATH>';
    if (hapticPath && hapticPath !== '<HAPTIC_CSV_PATH>') {
        segCsvPath = hapticPath.replace('.csv', '_segments.csv');
    }

    const cmd = `python -m aria2lerobot \\
  ${vrsPath} \\
  ${outputDir} \\
  --mps-dir ${mpsDir} \\
  --haptic-csv ${hapticPath} \\
  --haptic-offset ${currentOffset.toFixed(3)} \\
  --segments-csv ${segCsvPath} \\
  --overwrite`;

    cmdDiv.textContent = cmd;

    // 自动填充输出目录
    if (outputDirInput && !outputDirInput.value && window.serverVrsPath) {
        const vrsDir = window.serverVrsPath.substring(0, window.serverVrsPath.lastIndexOf('/'));
        const vrsName = window.serverVrsPath.split('/').pop().replace('.vrs', '');
        outputDirInput.value = `${vrsDir}/${vrsName}_lerobot`;
        // 重新生成命令
        cmdDiv.textContent = cmd.replace('<OUTPUT_DIR>', outputDirInput.value);
    }
}

// ==================== Download ====================

downloadBtn.addEventListener('click', function () {
    if (!segmentsCSV) {
        alert('没有可下载的片段数据');
        return;
    }
    const blob = new Blob([segmentsCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'alignment_segments.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// ==================== Offset Slider ====================

function getSimilarityAtOffset(offset) {
    if (!cachedData) return 0;
    const offsets = cachedData.offsets;
    const scores = cachedData.correlationScores || cachedData.correlation_scores;
    if (!offsets || !scores) return 0;

    let closestIndex = 0;
    let minDiff = Math.abs(offsets[0] - offset);
    for (let i = 1; i < offsets.length; i++) {
        const diff = Math.abs(offsets[i] - offset);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }
    return scores[closestIndex];
}

function updatePlotWithOffset(newOffset) {
    if (!cachedData) return;
    const hapticTimestamps = cachedData.hapticTimestamps || cachedData.haptic_timestamps;
    if (!hapticTimestamps) return;

    const hapticTimestampsOffset = hapticTimestamps.map(t => t + newOffset);

    Plotly.update('plotly-chart', {
        x: [hapticTimestampsOffset],
        name: [`Haptic (force, offset +${newOffset.toFixed(3)}s)`]
    }, {}, [1]);

    let layoutUpdates = {
        'annotations[0].text': `After Alignment (offset = ${newOffset.toFixed(3)}s)`
    };

    // Update segment rectangles and ID labels: shift by offset difference
    if (forceSegments.length > 0) {
        const offsetDiff = newOffset - optimalOffset;
        const { base } = categorizeShapes();
        const baseCount = base.length;

        // Find the starting index of segment label annotations
        const chartDiv = document.getElementById('plotly-chart');
        const allAnnotations = chartDiv.layout.annotations || [];
        const nonSegAnnotationCount = allAnnotations.filter(a => !a._isSegmentLabel).length;

        forceSegments.forEach((seg, i) => {
            const orig = originalSegments[i];
            seg.start = orig.start + offsetDiff;
            seg.end = orig.end + offsetDiff;
            seg.duration = seg.end - seg.start;
            const shapeIdx = baseCount + i;
            layoutUpdates[`shapes[${shapeIdx}].x0`] = seg.start;
            layoutUpdates[`shapes[${shapeIdx}].x1`] = seg.end;
            // Update annotation position
            const annotIdx = nonSegAnnotationCount + i;
            layoutUpdates[`annotations[${annotIdx}].x`] = (seg.start + seg.end) / 2;
        });
    }

    isRelayouting = true;
    Plotly.relayout('plotly-chart', layoutUpdates).then(() => {
        isRelayouting = false;
    }).catch(() => { isRelayouting = false; });
    currentOffsetSpan.textContent = newOffset.toFixed(3);
    const similarity = getSimilarityAtOffset(newOffset);
    currentSimilaritySpan.textContent = similarity.toFixed(4);

    // Update segment list to reflect new positions
    if (forceSegments.length > 0) {
        updateSegmentListPanel();
        updateSegmentsCSV();
    }
}

offsetSlider.addEventListener('input', function (e) {
    const newOffset = parseFloat(e.target.value);
    currentOffsetSpan.textContent = newOffset.toFixed(3);
    const similarity = getSimilarityAtOffset(newOffset);
    currentSimilaritySpan.textContent = similarity.toFixed(4);

    if (vrsVideoInitialized) {
        updateForceIndicators(vrsCurrentTime);
    }
});

applyOffsetBtn.addEventListener('click', function () {
    const newOffset = parseFloat(offsetSlider.value);
    updatePlotWithOffset(newOffset);
    if (vrsVideoInitialized) {
        updateForceIndicators(vrsCurrentTime);
    }
});

resetOffsetBtn.addEventListener('click', function () {
    if (optimalOffset !== null) {
        offsetSlider.value = optimalOffset;
        currentOffsetSpan.textContent = optimalOffset.toFixed(3);
        const similarity = getSimilarityAtOffset(optimalOffset);
        currentSimilaritySpan.textContent = similarity.toFixed(4);
        updatePlotWithOffset(optimalOffset);
        if (vrsVideoInitialized) {
            updateForceIndicators(vrsCurrentTime);
        }
    }
});

// ==================== Save Offset ====================

const saveOffsetBtn = document.getElementById('save-offset-btn');
if (saveOffsetBtn) {
    saveOffsetBtn.addEventListener('click', async function () {
        const currentOffset = parseFloat(offsetSlider.value);
        const similarity = getSimilarityAtOffset(currentOffset);

        try {
            const response = await fetch('/data/api/save_offset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    haptic_path: window.serverHapticPath || null,
                    mps_path: window.serverMpsPath || null,
                    vrs_path: window.serverVrsPath || null,
                    current_offset: currentOffset,
                    optimal_offset: optimalOffset,
                    similarity: similarity,
                    method: document.getElementById('method').value,
                    save_source: 'manual',
                    parameters: {
                        max_offset: document.getElementById('max_offset').value,
                        force_threshold: document.getElementById('force_threshold').value,
                        force_max_threshold: document.getElementById('force_max_threshold').value,
                        smooth_window: document.getElementById('smooth_window').value
                    }
                })
            });

            const result = await response.json();
            if (result.success) {
                alert('✅ ' + result.message);
            } else {
                alert('❌ 保存失败: ' + result.error);
            }
        } catch (error) {
            alert('❌ 保存失败: ' + error.message);
        }
    });
}

// ==================== VRS Video Player ====================
let vrsVideoInitialized = false;
let vrsVideoPlaying = false;
let vrsPlaybackInterval = null;
let vrsCurrentTime = 0;
let vrsTimeRange = [0, 100];
let vrsPlaybackSpeed = 1;
let vrsNumFrames = 0;
let vrsDuration = 0;
let vrsFrameLoading = false;

async function initVRSSessionFromPath(vrsPath) {
    const loadingEl = document.getElementById('vrs-video-loading');

    try {
        if (loadingEl) loadingEl.style.display = 'block';

        const formData = new FormData();
        formData.append('vrs_server_path', vrsPath);

        const response = await fetch('/gripper/init_vrs', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
            vrsVideoInitialized = true;

            const videoPanel = document.getElementById('vrs-video-panel');
            if (videoPanel) videoPanel.style.display = 'block';

            vrsNumFrames = result.num_frames || 0;

            if (result.time_range_s && result.time_range_s.length === 2) {
                vrsDuration = result.time_range_s[1] - result.time_range_s[0];
                vrsTimeRange = [0, vrsDuration];
                vrsCurrentTime = 0;
            }

            await updateVRSVideoFrame(vrsCurrentTime);
            updateForceIndicators(vrsCurrentTime);
            updateTimelineIndicator(vrsCurrentTime);

            if (loadingEl) loadingEl.style.display = 'none';
            return true;
        } else {
            throw new Error(result.error || 'Failed to initialize VRS session');
        }
    } catch (error) {
        console.error('VRS initialization error:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        return false;
    }
}

function initVRSVideoPlayer() {
    const playBtn = document.getElementById('video-play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', function () {
            if (vrsVideoPlaying) {
                pauseVRSVideo();
                this.textContent = '▶ 播放';
            } else {
                playVRSVideo();
                this.textContent = '⏸ 暂停';
            }
        });
    }

    const stopBtn = document.getElementById('video-stop-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', function () {
            stopVRSVideo();
            const playBtn = document.getElementById('video-play-btn');
            if (playBtn) playBtn.textContent = '▶ 播放';
        });
    }

    const speedSelect = document.getElementById('video-speed');
    if (speedSelect) {
        speedSelect.addEventListener('change', function (e) {
            vrsPlaybackSpeed = parseFloat(e.target.value);
        });
    }

    const timeSlider = document.getElementById('video-time-slider');
    if (timeSlider) {
        timeSlider.addEventListener('input', function (e) {
            const percent = parseFloat(e.target.value);
            vrsCurrentTime = vrsTimeRange[0] + (vrsTimeRange[1] - vrsTimeRange[0]) * (percent / 100);
            updateVRSVideoFrame(vrsCurrentTime);
            updateTimelineIndicator(vrsCurrentTime);
            updateForceIndicators(vrsCurrentTime);
        });
    }

    // Prev / Next frame buttons
    const frameDt = () => vrsNumFrames > 1 ? vrsDuration / (vrsNumFrames - 1) : 1 / 30;

    const prevBtn = document.getElementById('video-prev-frame-btn');
    if (prevBtn) {
        prevBtn.addEventListener('click', async function () {
            if (!vrsVideoInitialized) return;
            vrsCurrentTime = Math.max(vrsTimeRange[0], vrsCurrentTime - frameDt());
            vrsFrameLoading = false; // force unlock so frame loads
            await updateVRSVideoFrame(vrsCurrentTime);
            updateTimelineIndicator(vrsCurrentTime);
            updateForceIndicators(vrsCurrentTime);
        });
    }

    const nextBtn = document.getElementById('video-next-frame-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', async function () {
            if (!vrsVideoInitialized) return;
            vrsCurrentTime = Math.min(vrsTimeRange[1], vrsCurrentTime + frameDt());
            vrsFrameLoading = false; // force unlock so frame loads
            await updateVRSVideoFrame(vrsCurrentTime);
            updateTimelineIndicator(vrsCurrentTime);
            updateForceIndicators(vrsCurrentTime);
        });
    }
}

async function updateVRSVideoFrame(timestamp) {
    if (!vrsVideoInitialized) return;
    if (vrsFrameLoading) return;

    const frameImg = document.getElementById('vrs-video-frame');
    const timeDisplay = document.getElementById('vrs-video-time');
    const timeSlider = document.getElementById('video-time-slider');

    if (timeDisplay) timeDisplay.textContent = timestamp.toFixed(3);
    if (timeSlider && vrsTimeRange[1] > vrsTimeRange[0]) {
        const percent = ((timestamp - vrsTimeRange[0]) / (vrsTimeRange[1] - vrsTimeRange[0])) * 100;
        timeSlider.value = Math.min(100, Math.max(0, percent));
    }

    vrsFrameLoading = true;
    try {
        // Build URL with optional skeleton params
        let url = `/gripper/video_frame?timestamp=${timestamp}&camera=camera-rgb`;
        const skeletonCheckbox = document.getElementById('show-hand-skeleton');
        const showSkeleton = skeletonCheckbox ? skeletonCheckbox.checked : false;
        if (showSkeleton && window.serverVrsPath) {
            const mpsDir = getMpsDir();
            if (mpsDir) {
                url += `&skeleton=1&vrs_path=${encodeURIComponent(window.serverVrsPath)}&mps_dir=${encodeURIComponent(mpsDir)}`;
            }
        } else {
            url += '&skeleton=0';
        }

        const response = await fetch(url);
        const result = await response.json();

        if (response.ok && result.image) {
            if (frameImg) frameImg.src = result.image;
        }
    } catch (error) {
        console.error('Error fetching video frame:', error);
    } finally {
        vrsFrameLoading = false;
    }
}

function updateForceIndicators(timestamp) {
    if (!cachedData) return;

    const ariaTimestamps = cachedData.ariaTimestamps || cachedData.aria_timestamps;
    const hapticTimestamps = cachedData.hapticTimestamps || cachedData.haptic_timestamps;
    const hapticThumbForce = cachedData.hapticThumbForce || cachedData.haptic_thumb_force || [];
    const hapticIndexForce = cachedData.hapticIndexForce || cachedData.haptic_index_force || [];

    if (!hapticTimestamps || hapticTimestamps.length === 0) return;
    if (!ariaTimestamps || ariaTimestamps.length === 0) return;

    const currentOffset = parseFloat(offsetSlider.value) || optimalOffset || 0;
    const ariaStartTime = ariaTimestamps[0];
    const ariaTime = timestamp + ariaStartTime;
    // 图表对齐: haptic_display = haptic_raw + offset => haptic_raw = aria_time - offset
    const hapticTime = ariaTime - currentOffset;

    let closestIdx = 0;
    let left = 0;
    let right = hapticTimestamps.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (hapticTimestamps[mid] < hapticTime) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    if (left >= hapticTimestamps.length) {
        closestIdx = hapticTimestamps.length - 1;
    } else if (left === 0) {
        closestIdx = 0;
    } else {
        const diffLeft = Math.abs(hapticTimestamps[left] - hapticTime);
        const diffRight = Math.abs(hapticTimestamps[left - 1] - hapticTime);
        closestIdx = diffLeft < diffRight ? left : left - 1;
    }

    const thumbForce = hapticThumbForce[closestIdx] || 0;
    const indexForce = hapticIndexForce[closestIdx] || 0;
    const forceMaxThreshold = parseFloat(document.getElementById('force_max_threshold').value) || 50;

    const thumbPercent = Math.min(100, Math.max(0, (thumbForce / forceMaxThreshold) * 100));
    const indexPercent = Math.min(100, Math.max(0, (indexForce / forceMaxThreshold) * 100));

    const thumbBar = document.getElementById('thumb-force-bar');
    const indexBar = document.getElementById('index-force-bar');
    const thumbValue = document.getElementById('thumb-force-value');
    const indexValue = document.getElementById('index-force-value');
    const hapticSyncTime = document.getElementById('haptic-sync-time');

    if (thumbBar) thumbBar.style.width = thumbPercent + '%';
    if (indexBar) indexBar.style.width = indexPercent + '%';
    if (thumbValue) thumbValue.textContent = thumbForce.toFixed(1) + ' N';
    if (indexValue) indexValue.textContent = indexForce.toFixed(1) + ' N';

    if (hapticSyncTime) {
        const hapticStartTime = hapticTimestamps[0];
        const relativeHapticTime = hapticTimestamps[closestIdx] - hapticStartTime;
        hapticSyncTime.textContent = relativeHapticTime.toFixed(3);
    }
}

function playVRSVideo() {
    if (!vrsVideoInitialized || vrsVideoPlaying) return;
    vrsVideoPlaying = true;
    const frameInterval = 100;

    vrsPlaybackInterval = setInterval(() => {
        vrsCurrentTime += (frameInterval / 1000) * vrsPlaybackSpeed;
        if (vrsCurrentTime > vrsTimeRange[1]) {
            vrsCurrentTime = vrsTimeRange[0];
        }
        updateVRSVideoFrame(vrsCurrentTime);
        updateTimelineIndicator(vrsCurrentTime);
        updateForceIndicators(vrsCurrentTime);
    }, frameInterval);
}

function pauseVRSVideo() {
    vrsVideoPlaying = false;
    if (vrsPlaybackInterval) {
        clearInterval(vrsPlaybackInterval);
        vrsPlaybackInterval = null;
    }
    vrsFrameLoading = false;
}

function stopVRSVideo() {
    pauseVRSVideo();
    vrsCurrentTime = vrsTimeRange[0];
    updateVRSVideoFrame(vrsCurrentTime);
    updateTimelineIndicator(vrsCurrentTime);
    updateForceIndicators(vrsCurrentTime);
}

function updateTimelineIndicator(timestamp) {
    const chartDiv = document.getElementById('plotly-chart');
    if (!chartDiv || !chartDiv.data) return;
    if (!cachedData) return;

    const currentOffset = parseFloat(offsetSlider.value) || optimalOffset || 0;
    const ariaTimestamps = cachedData.aria_timestamps || cachedData.ariaTimestamps;
    if (!ariaTimestamps || ariaTimestamps.length === 0) return;

    // Both VRS time and Aria time start from 0 (normalized in backend)
    const ariaTime = timestamp;

    // Get y-axis range for the single subplot
    const yaxis = chartDiv.layout.yaxis || {};
    const y1Range = yaxis.range || [0, 1];

    // Build green playback indicator line
    const playbackShapes = [
        {
            type: 'line', xref: 'x', yref: 'y',
            x0: ariaTime, x1: ariaTime, y0: y1Range[0], y1: y1Range[1],
            line: { color: '#00ff00', width: 2, dash: 'solid' }
        }
    ];

    // Get non-playback shapes (base + segments), preserve them
    const currentLayout = chartDiv.layout || {};
    const existingShapes = currentLayout.shapes || [];
    const otherShapes = existingShapes.filter(s => {
        if (!s.line) return true;
        return s.line.color !== '#00ff00';
    });

    isRelayouting = true;
    Plotly.relayout('plotly-chart', { shapes: [...otherShapes, ...playbackShapes] })
        .then(() => { isRelayouting = false; })
        .catch(() => { isRelayouting = false; });
}

// ==================== Hand Skeleton Helper ====================
function getMpsDir() {
    // Derive MPS root directory from serverMpsPath
    // e.g. /mnt/.../mps_Half_coke_0_vrs/hand_tracking/hand_tracking_results.csv
    //   -> /mnt/.../mps_Half_coke_0_vrs
    if (!window.serverMpsPath) return null;
    const parts = window.serverMpsPath.replace(/\\/g, '/').split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].startsWith('mps_') && parts[i].endsWith('_vrs')) {
            return parts.slice(0, i + 1).join('/');
        }
    }
    // Fallback: go up 2 levels from CSV file
    if (parts.length >= 3) {
        return parts.slice(0, -2).join('/');
    }
    return null;
}

// ==================== LeRobot Conversion ====================

async function startConversion() {
    const outputDir = document.getElementById('lerobot-output-dir')?.value;
    if (!outputDir) {
        alert(window.i18n ? window.i18n.t('export.no_output_dir') : 'Please specify an output directory');
        return;
    }
    if (!window.serverVrsPath) {
        alert(window.i18n ? window.i18n.t('export.no_vrs') : 'VRS file is required');
        return;
    }

    const currentOffset = parseFloat(offsetSlider?.value) || optimalOffset || 0;
    const taskName = document.getElementById('lerobot-task-name')?.value || 'aria_recording';

    // MPS 目录推导
    let mpsDir = null;
    if (window.serverMpsPath) {
        const parts = window.serverMpsPath.replace(/\\/g, '/').split('/');
        const htIdx = parts.indexOf('hand_tracking');
        mpsDir = htIdx > 0 ? parts.slice(0, htIdx).join('/') : parts.slice(0, -1).join('/');
    }

    // 收集片段数据
    const segmentData = (typeof forceSegments !== 'undefined' ? forceSegments : []).map(s => ({
        id: s.id, start: s.start, end: s.end,
        duration: s.duration, enabled: s.enabled
    }));

    // UI 状态
    const runBtn = document.getElementById('run-conversion-btn');
    runBtn.disabled = true;
    runBtn.textContent = window.i18n ? window.i18n.t('export.converting') : '转换中...';

    const progressDiv = document.getElementById('conversion-progress');
    const resultsDiv = document.getElementById('conversion-results');
    const errorDiv = document.getElementById('conversion-error');
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    errorDiv.style.display = 'none';

    try {
        const resp = await fetch('/api/run_conversion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vrs_path: window.serverVrsPath,
                mps_csv_path: window.serverMpsPath,
                mps_dir: mpsDir,
                haptic_csv: window.serverHapticPath,
                haptic_offset: currentOffset,
                output_dir: outputDir,
                task_name: taskName,
                segments: segmentData,
            })
        });
        const result = await resp.json();

        if (!resp.ok || !result.success) {
            throw new Error(result.error || (result.errors || []).join(', ') || 'Failed to start conversion');
        }

        conversionJobId = result.job_id;
        conversionPollInterval = setInterval(pollConversionStatus, 2000);

    } catch (e) {
        console.error('Failed to start conversion:', e);
        showConversionError(e.message);
        resetConversionButton();
    }
}

async function pollConversionStatus() {
    if (!conversionJobId) return;
    try {
        const resp = await fetch(`/api/conversion_status/${conversionJobId}`);
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'Status check failed');

        // 更新耗时
        const elapsedEl = document.getElementById('conversion-elapsed');
        if (elapsedEl) {
            const elapsed = data.elapsed_s || 0;
            const mins = Math.floor(elapsed / 60);
            const secs = Math.floor(elapsed % 60);
            elapsedEl.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        }

        // 日志尾部
        const logTailEl = document.getElementById('conversion-log-tail');
        if (logTailEl && data.log_tail) {
            logTailEl.textContent = data.log_tail;
        }

        if (data.status === 'completed') {
            clearInterval(conversionPollInterval);
            conversionPollInterval = null;
            showConversionResults(data);
            resetConversionButton();
        } else if (data.status === 'failed') {
            clearInterval(conversionPollInterval);
            conversionPollInterval = null;
            showConversionError(data.error, data.traceback);
            resetConversionButton();
        }
    } catch (e) {
        console.error('Poll error:', e);
    }
}

function showConversionResults(data) {
    document.getElementById('conversion-progress').style.display = 'none';
    document.getElementById('conversion-error').style.display = 'none';

    const panel = document.getElementById('conversion-results');
    const r = data.result || {};
    const outputDir = data.output_dir || '';
    const elapsed = data.elapsed_s || 0;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    const t = window.i18n ? window.i18n.t : (k => k);

    let html = `<h4 style="margin: 0 0 10px 0; color: #155724; font-size: 0.9rem;">${t('export.conversion_complete')}</h4>`;
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-bottom: 10px;">`;
    html += `<div class="result-card"><div class="result-value">${r.num_episodes || 1}</div><div class="result-label">Episodes</div></div>`;
    html += `<div class="result-card"><div class="result-value">${(r.total_frames || 0).toLocaleString()}</div><div class="result-label">Frames</div></div>`;
    html += `<div class="result-card"><div class="result-value">${r.parquet_shards || 0}+${r.video_shards || 0}</div><div class="result-label">Parquet+Video</div></div>`;
    html += `<div class="result-card"><div class="result-value">${elapsedStr}</div><div class="result-label">${t('episodes.duration')}</div></div>`;
    html += `</div>`;

    if (r.episodes && r.episodes.length > 0) {
        html += `<div style="font-weight: 600; font-size: 0.78rem; margin-bottom: 4px;">Per-Episode:</div>`;
        html += `<div style="max-height: 180px; overflow-y: auto;">`;
        r.episodes.forEach(ep => {
            const dur = (ep.end_time_s && ep.start_time_s)
                ? (ep.end_time_s - ep.start_time_s).toFixed(1) + 's' : '-';
            html += `<div style="display: flex; gap: 12px; padding: 3px 8px; background: white; border-radius: 3px; margin-bottom: 2px; font-size: 0.75rem;">
                <span style="font-weight:600; min-width:65px;">Episode ${ep.episode_id}</span>
                <span style="color:#555;">${ep.frames} frames</span>
                <span style="color:#888;">${dur}</span>
                <span style="color:#aaa;">${ep.elapsed_s}s</span>
            </div>`;
        });
        html += `</div>`;
    }

    html += `<div style="margin-top: 8px; padding: 6px 10px; background: white; border-radius: 4px; font-family: monospace; font-size: 0.75rem; display: flex; align-items: center; gap: 8px;">
        <span style="color:#666;">Output:</span>
        <span style="color:#155724; flex:1; word-break:break-all;">${outputDir}</span>
        <button onclick="navigator.clipboard.writeText('${outputDir.replace(/'/g, "\\'")}')"
                style="padding:2px 8px; border:1px solid #28a745; background:white; color:#28a745; border-radius:4px; cursor:pointer; font-size:0.7rem; white-space:nowrap;">
            Copy
        </button>
    </div>`;

    panel.innerHTML = html;
    panel.style.display = 'block';
}

function showConversionError(errorMsg, tracebackStr) {
    document.getElementById('conversion-progress').style.display = 'none';
    document.getElementById('conversion-results').style.display = 'none';

    const panel = document.getElementById('conversion-error');
    const body = document.getElementById('conversion-error-body');
    body.textContent = errorMsg || 'Unknown error';
    if (tracebackStr) body.textContent += '\n\n' + tracebackStr;
    panel.style.display = 'block';
}

function resetConversionButton() {
    const runBtn = document.getElementById('run-conversion-btn');
    if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = window.i18n ? window.i18n.t('export.run_conversion') : '运行转换';
    }
}

// ==================== Theme Toggle ====================

function updateThemeButton(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? t('theme.light') : t('theme.dark');
}

function updatePlotlyTheme(theme) {
    const chartDiv = document.getElementById('plotly-chart');
    if (!chartDiv || !chartDiv.data) return;

    const isDark = theme === 'dark';
    const update = {
        'paper_bgcolor': isDark ? '#252540' : '#ffffff',
        'plot_bgcolor': isDark ? '#252540' : '#ffffff',
        'font.color': isDark ? '#c0c0d0' : '#333333',
        'xaxis.gridcolor': isDark ? '#3a3a5c' : '#e5e5e5',
        'yaxis.gridcolor': isDark ? '#3a3a5c' : '#e5e5e5',
        'yaxis2.gridcolor': isDark ? '#3a3a5c' : '#e5e5e5',
        'xaxis.linecolor': isDark ? '#3a3a5c' : '#e5e5e5',
        'yaxis.linecolor': isDark ? '#3a3a5c' : '#e5e5e5',
        'yaxis2.linecolor': isDark ? '#3a3a5c' : '#e5e5e5',
    };
    Plotly.relayout('plotly-chart', update).catch(() => {});
}

// ==================== Initialize ====================

document.addEventListener('DOMContentLoaded', function () {
    // Theme toggle - restore saved preference
    const savedTheme = localStorage.getItem('aria-theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeButton(savedTheme);

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('aria-theme', next);
            updateThemeButton(next);
            // Update Plotly chart template if chart exists
            updatePlotlyTheme(next);
        });
    }

    loadDirectories();
    initVRSVideoPlayer();
    checkFormValidity();

    // Segment panel: Add / Select All / Deselect All
    document.getElementById('add-segment-btn')?.addEventListener('click', () => {
        addNewSegment();
    });

    document.getElementById('save-segments-btn')?.addEventListener('click', () => {
        saveSegments();
    });

    // Workflow guide toggle
    const workflowToggle = document.getElementById('workflow-toggle');
    const workflowContent = document.getElementById('workflow-content');
    const workflowArrow = document.getElementById('workflow-arrow');
    if (workflowToggle && workflowContent) {
        // Start collapsed
        workflowContent.classList.add('collapsed');
        workflowArrow?.classList.add('collapsed');
        workflowToggle.addEventListener('click', () => {
            const isCollapsed = workflowContent.classList.toggle('collapsed');
            workflowArrow?.classList.toggle('collapsed', isCollapsed);
        });
    }

    document.getElementById('select-all-segments')?.addEventListener('click', () => {
        forceSegments.forEach(s => s.enabled = true);
        renderSegmentShapes();
        updateSegmentListPanel();
        updateSegmentsCSV();
    });

    document.getElementById('deselect-all-segments')?.addEventListener('click', () => {
        forceSegments.forEach(s => s.enabled = false);
        renderSegmentShapes();
        updateSegmentListPanel();
        updateSegmentsCSV();
    });

    // LeRobot Export: 保存片段 CSV 到服务器
    document.getElementById('save-segments-csv-btn')?.addEventListener('click', async () => {
        const hapticPath = window.serverHapticPath;
        if (!hapticPath) {
            alert('没有触觉文件路径，无法保存');
            return;
        }
        const currentOffset = parseFloat(offsetSlider.value) || optimalOffset || 0;
        try {
            const resp = await fetch('/api/save_segments_csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    segments: forceSegments.map(s => ({
                        id: s.id, start: s.start, end: s.end,
                        duration: s.duration, enabled: s.enabled
                    })),
                    haptic_path: hapticPath,
                    offset: currentOffset
                })
            });
            const result = await resp.json();
            const statusDiv = document.getElementById('save-segments-status');
            if (result.success) {
                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.style.color = '#28a745';
                    statusDiv.textContent = result.message;
                }
                // 更新 CLI 命令中的路径
                updateLeRobotCLI();
            } else {
                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.style.color = '#dc3545';
                    statusDiv.textContent = '保存失败: ' + (result.error || '未知错误');
                }
            }
        } catch (e) {
            console.error('保存片段 CSV 失败:', e);
            alert('保存失败: ' + e.message);
        }
    });

    // LeRobot Export: 复制 CLI 命令
    document.getElementById('copy-cli-btn')?.addEventListener('click', () => {
        const cmdDiv = document.getElementById('lerobot-cli-command');
        if (cmdDiv && cmdDiv.textContent) {
            navigator.clipboard.writeText(cmdDiv.textContent).then(() => {
                const btn = document.getElementById('copy-cli-btn');
                const orig = btn.textContent;
                btn.textContent = '已复制!';
                btn.style.color = 'white';
                btn.style.background = '#28a745';
                setTimeout(() => {
                    btn.textContent = orig;
                    btn.style.color = '#28a745';
                    btn.style.background = 'white';
                }, 1500);
            }).catch(() => {
                // 降级：选中文本
                const range = document.createRange();
                range.selectNodeContents(cmdDiv);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            });
        }
    });

    // 输出目录变更时重新生成 CLI 命令
    document.getElementById('lerobot-output-dir')?.addEventListener('input', () => {
        updateLeRobotCLI();
    });

    // LeRobot 转换: 运行转换
    document.getElementById('run-conversion-btn')?.addEventListener('click', () => {
        startConversion();
    });

    // Load saved alignment button (re-compute)
    document.getElementById('load-saved-alignment-btn')?.addEventListener('click', () => {
        loadSavedAlignment();
    });

    // Load cached alignment button (direct load, no re-compute)
    document.getElementById('load-cached-alignment-btn')?.addEventListener('click', () => {
        loadCachedAlignment();
    });
});
