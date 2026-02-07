// Main JavaScript for Aria-Haptic Alignment Web App

// Global variables
let segmentsCSV = null;
let cachedData = null;  // Cache for interactive slider
let optimalOffset = null;  // Store optimal offset for reset

// DOM Elements
const mpsFileInput = document.getElementById('mps_file');
const vrsFileInput = document.getElementById('vrs_file');
const hapticFileInput = document.getElementById('haptic_file');
const mpsInfo = document.getElementById('mps-info');
const vrsInfo = document.getElementById('vrs-info');
const hapticInfo = document.getElementById('haptic-info');
const mpsFileWrapper = document.getElementById('mps-file-wrapper');
const vrsFileWrapper = document.getElementById('vrs-file-wrapper');
const modeMpsCSV = document.getElementById('mode-mps-csv');
const modeVRS = document.getElementById('mode-vrs');
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

// Mode switcher handlers
modeMpsCSV.addEventListener('change', function() {
    if (this.checked) {
        mpsFileWrapper.style.display = '';
        vrsFileWrapper.style.display = 'none';
        mpsFileInput.required = true;
        vrsFileInput.required = false;
        checkFormValidity();
    }
});

modeVRS.addEventListener('change', function() {
    if (this.checked) {
        mpsFileWrapper.style.display = 'none';
        vrsFileWrapper.style.display = '';
        mpsFileInput.required = false;
        vrsFileInput.required = true;
        checkFormValidity();
    }
});

// File input change handlers
mpsFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        mpsInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        mpsInfo.style.color = '#28a745';
    } else {
        mpsInfo.textContent = '未选择文件';
        mpsInfo.style.color = '#6c757d';
    }
    checkFormValidity();
});

vrsFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        vrsInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        vrsInfo.style.color = '#28a745';
    } else {
        vrsInfo.textContent = '未选择文件';
        vrsInfo.style.color = '#6c757d';
    }
    checkFormValidity();
});

hapticFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        hapticInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        hapticInfo.style.color = '#28a745';
    } else {
        hapticInfo.textContent = '未选择文件';
        hapticInfo.style.color = '#6c757d';
    }
    checkFormValidity();
});

// Check if form is valid
function checkFormValidity() {
    const useMpsCSV = modeMpsCSV.checked;
    const hapticFile = hapticFileInput.files.length > 0;

    // Also check for server paths (from data manager)
    const hasServerHaptic = window.serverHapticPath && window.serverHapticPath.length > 0;
    const hasServerMps = window.serverMpsPath && window.serverMpsPath.length > 0;
    const hasServerVrs = window.serverVrsPath && window.serverVrsPath.length > 0;

    let ariaFileValid = false;
    if (useMpsCSV) {
        ariaFileValid = mpsFileInput.files.length > 0 || hasServerMps;
    } else {
        ariaFileValid = vrsFileInput.files.length > 0 || hasServerVrs;
    }

    const hapticValid = hapticFile || hasServerHaptic;

    alignBtn.disabled = !(ariaFileValid && hapticValid);
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Align button click handler
alignBtn.addEventListener('click', async function() {
    // Hide previous results and errors
    resultsSection.style.display = 'none';
    errorSection.style.display = 'none';
    downloadSection.style.display = 'none';

    // Show loading indicator
    loadingIndicator.style.display = 'block';
    alignBtn.disabled = true;

    try {
        const useMpsCSV = modeMpsCSV.checked;

        // Check if using server paths (from data manager)
        const hasServerPaths = window.serverHapticPath &&
            (window.serverMpsPath || window.serverVrsPath);

        let response;
        let data;

        if (hasServerPaths) {
            // Use server path API
            const requestBody = {
                mps_csv_path: window.serverMpsPath || null,
                haptic_csv_path: window.serverHapticPath,
                vrs_path: window.serverVrsPath || null,
                max_offset: parseFloat(document.getElementById('max_offset').value),
                method: document.getElementById('method').value,
                force_threshold: parseFloat(document.getElementById('force_threshold').value),
                force_max_threshold: parseFloat(document.getElementById('force_max_threshold').value),
                smooth_window: parseInt(document.getElementById('smooth_window').value),
                export_segments: document.getElementById('export_segments').checked
            };

            response = await fetch('/align_from_path', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            data = await response.json();
        } else {
            // Use file upload API
            const formData = new FormData();

            // Add mode flag
            formData.append('use_mps_csv', useMpsCSV);

            // Add Aria file based on mode
            if (useMpsCSV) {
                formData.append('mps_file', mpsFileInput.files[0]);
            } else {
                formData.append('vrs_file', vrsFileInput.files[0]);
            }

            // Add haptic CSV file
            formData.append('haptic_file', hapticFileInput.files[0]);

            // Add parameters
            formData.append('max_offset', document.getElementById('max_offset').value);
            formData.append('method', document.getElementById('method').value);
            formData.append('force_threshold', document.getElementById('force_threshold').value);
            formData.append('force_max_threshold', document.getElementById('force_max_threshold').value);
            formData.append('smooth_window', document.getElementById('smooth_window').value);
            formData.append('export_segments', document.getElementById('export_segments').checked);

            response = await fetch('/align', {
                method: 'POST',
                body: formData
            });

            data = await response.json();
        }

        if (!response.ok) {
            throw new Error(data.error || '处理失败');
        }

        // Display results
        displayResults(data);

        // Initialize VRS video player if VRS path is available
        if (window.serverVrsPath && !vrsVideoInitialized) {
            await initVRSSessionFromPath(window.serverVrsPath);
        }

    } catch (error) {
        displayError(error);
    } finally {
        loadingIndicator.style.display = 'none';
        alignBtn.disabled = false;
    }
});

// Display results
function displayResults(data) {
    console.log('DEBUG: Received alignment results:', data);
    console.log('DEBUG: Plotly JSON:', data.plotly_json);

    // Update stats
    document.getElementById('optimal-offset').textContent = data.optimal_offset.toFixed(3);
    document.getElementById('similarity-score').textContent = data.max_similarity.toFixed(4);
    document.getElementById('aria-samples').textContent = data.aria_sample_count.toLocaleString();

    // Show haptic samples with filtered count if any
    let hapticText = data.haptic_sample_count.toLocaleString();
    if (data.haptic_filtered_count && data.haptic_filtered_count > 0) {
        hapticText += ` (${data.haptic_filtered_count} 超过阈值 ${data.force_max_threshold}N 被过滤)`;
    }
    document.getElementById('haptic-samples').textContent = hapticText;

    document.getElementById('segment-count').textContent = data.segment_count;
    document.getElementById('method-used').textContent = data.method.toUpperCase();

    // Store CSV data
    segmentsCSV = data.segments_csv;

    // Show download button if segments exist
    if (segmentsCSV) {
        downloadSection.style.display = 'block';
    }

    // Cache data for interactive slider
    cachedData = {
        aria_timestamps: data.aria_timestamps,
        aria_normalized: data.aria_normalized,
        haptic_timestamps: data.haptic_timestamps,
        haptic_normalized: data.haptic_normalized,
        haptic_thumb_force: data.haptic_thumb_force || [],
        haptic_index_force: data.haptic_index_force || [],
        offsets: data.offsets,
        correlation_scores: data.correlation_scores,
        segments: data.segments
    };
    optimalOffset = data.optimal_offset;

    // Initialize slider with fixed range -10 to 20
    offsetSlider.min = -10;
    offsetSlider.max = 20;
    offsetSlider.value = data.optimal_offset;
    currentOffsetSpan.textContent = data.optimal_offset.toFixed(3);
    maxOffsetLabel.textContent = '20s';

    // Update similarity score for optimal offset
    const optimalSimilarity = getSimilarityAtOffset(data.optimal_offset);
    currentSimilaritySpan.textContent = optimalSimilarity.toFixed(4);

    // Render Plotly chart
    console.log('DEBUG: Attempting to render Plotly chart');
    console.log('DEBUG: Plotly data length:', data.plotly_json.data?.length);
    console.log('DEBUG: Plotly layout:', data.plotly_json.layout);

    if (data.plotly_json.data && data.plotly_json.data.length > 0) {
        data.plotly_json.data.forEach((trace, i) => {
            console.log(`DEBUG: Trace ${i}:`, trace.name, '- x length:', trace.x?.length, '- y length:', trace.y?.length);
        });
    }

    try {
        // Ensure layout is responsive
        const layout = {
            ...data.plotly_json.layout,
            autosize: true,
            width: null  // Remove fixed width
        };

        Plotly.newPlot('plotly-chart', data.plotly_json.data, layout, {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            displaylogo: false
        }).then(() => {
            console.log('DEBUG: Plotly chart rendered successfully');
            // Force resize after rendering
            window.dispatchEvent(new Event('resize'));
        }).catch(err => {
            console.error('ERROR: Failed to render Plotly chart:', err);
        });
    } catch (error) {
        console.error('ERROR: Exception during Plotly rendering:', error);
    }

    // Show results section
    resultsSection.style.display = 'block';

    // Smooth scroll to results
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    // Initialize VRS video player if VRS file is selected
    const vrsVideoFileInput = document.getElementById('vrs_video_file');
    if (vrsVideoFileInput && vrsVideoFileInput.files[0]) {
        // Set time range from alignment data
        if (data.aria_timestamps && data.aria_timestamps.length > 0) {
            vrsTimeRange = [
                Math.min(...data.aria_timestamps),
                Math.max(...data.aria_timestamps)
            ];
            vrsCurrentTime = vrsTimeRange[0];
        }
        // Initialize VRS session
        initVRSSession();
    }
}

// Display error
function displayError(error) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = error.message || String(error);
    errorSection.style.display = 'block';

    // Smooth scroll to error
    setTimeout(() => {
        errorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// Download CSV button handler
downloadBtn.addEventListener('click', function() {
    if (!segmentsCSV) {
        alert('没有可下载的片段数据');
        return;
    }

    // Create blob and download
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

// Helper function to get similarity score at a given offset
function getSimilarityAtOffset(offset) {
    if (!cachedData) return 0;

    // Support both naming conventions (camelCase and snake_case)
    const offsets = cachedData.offsets;
    const scores = cachedData.correlationScores || cachedData.correlation_scores;

    if (!offsets || !scores) return 0;

    // Binary search or linear search for closest offset
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

// Update plot with new offset
function updatePlotWithOffset(newOffset) {
    if (!cachedData) return;

    // Support both naming conventions (camelCase and snake_case)
    const hapticTimestamps = cachedData.hapticTimestamps || cachedData.haptic_timestamps;
    if (!hapticTimestamps) return;

    // Calculate new haptic timestamps with offset
    const hapticTimestampsOffset = hapticTimestamps.map(t => t + newOffset);

    // Update the second subplot (After Alignment) - trace index 3 is the haptic line
    Plotly.update('plotly-chart', {
        x: [hapticTimestampsOffset],
        name: [`Haptic (force, offset +${newOffset.toFixed(3)}s)`]
    }, {}, [3]);

    // Update the second subplot title
    let layoutUpdates = {
        'annotations[1].text': `After Alignment (offset = ${newOffset.toFixed(3)}s)`
    };

    // Update vertical line in correlation plot (third subplot) - shape[0]
    layoutUpdates['shapes[0].x0'] = newOffset;
    layoutUpdates['shapes[0].x1'] = newOffset;

    // Update segment vertical lines if they exist
    // Segments are stored starting from shape[1] onwards
    if (cachedData.segments && cachedData.segments.length > 0) {
        console.log(`DEBUG: Updating ${cachedData.segments.length} segment lines`);

        // Calculate offset difference from optimal offset
        const offsetDiff = newOffset - optimalOffset;
        console.log(`DEBUG: Offset diff = ${offsetDiff.toFixed(3)}s (new: ${newOffset.toFixed(3)}s, optimal: ${optimalOffset.toFixed(3)}s)`);

        // Update each segment line
        cachedData.segments.forEach((segment, i) => {
            const shapeIndex = i + 1; // shape[0] is the correlation line, segments start from shape[1]
            // Original segment time plus the offset difference
            const newSegmentTime = segment.time + offsetDiff;
            layoutUpdates[`shapes[${shapeIndex}].x0`] = newSegmentTime;
            layoutUpdates[`shapes[${shapeIndex}].x1`] = newSegmentTime;
            console.log(`DEBUG: Segment ${i}: original=${segment.time.toFixed(3)}s, new=${newSegmentTime.toFixed(3)}s, shape[${shapeIndex}]`);
        });
    } else {
        console.log('DEBUG: No segments to update');
    }

    Plotly.relayout('plotly-chart', layoutUpdates);

    // Update current offset and similarity display
    currentOffsetSpan.textContent = newOffset.toFixed(3);
    const similarity = getSimilarityAtOffset(newOffset);
    currentSimilaritySpan.textContent = similarity.toFixed(4);
}

// Offset slider input handler - only update display, not the plot
offsetSlider.addEventListener('input', function(e) {
    const newOffset = parseFloat(e.target.value);
    // Only update the displayed values, not the plot
    currentOffsetSpan.textContent = newOffset.toFixed(3);
    const similarity = getSimilarityAtOffset(newOffset);
    currentSimilaritySpan.textContent = similarity.toFixed(4);

    // Update force indicators in real-time as slider moves
    if (vrsVideoInitialized) {
        updateForceIndicators(vrsCurrentTime);
    }
});

// Apply offset button handler - actually update the plot
applyOffsetBtn.addEventListener('click', function() {
    const newOffset = parseFloat(offsetSlider.value);
    updatePlotWithOffset(newOffset);

    // Also update force indicators for current VRS time with new offset
    if (vrsVideoInitialized) {
        updateForceIndicators(vrsCurrentTime);
    }
});

// Reset offset button handler
resetOffsetBtn.addEventListener('click', function() {
    if (optimalOffset !== null) {
        offsetSlider.value = optimalOffset;
        currentOffsetSpan.textContent = optimalOffset.toFixed(3);
        const similarity = getSimilarityAtOffset(optimalOffset);
        currentSimilaritySpan.textContent = similarity.toFixed(4);
        updatePlotWithOffset(optimalOffset);

        // Also update force indicators for current VRS time with reset offset
        if (vrsVideoInitialized) {
            updateForceIndicators(vrsCurrentTime);
        }
    }
});

// Save offset configuration button handler
const saveOffsetBtn = document.getElementById('save-offset-btn');
if (saveOffsetBtn) {
    saveOffsetBtn.addEventListener('click', async function() {
        const currentOffset = parseFloat(offsetSlider.value);
        const similarity = getSimilarityAtOffset(currentOffset);

        // Check if we have server paths (loaded from data manager)
        const hasServerPaths = window.serverHapticPath || window.serverMpsPath || window.serverVrsPath;

        if (hasServerPaths) {
            // Auto-save to server
            try {
                const response = await fetch('/data/api/save_offset', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        haptic_path: window.serverHapticPath || null,
                        mps_path: window.serverMpsPath || null,
                        vrs_path: window.serverVrsPath || null,
                        current_offset: currentOffset,
                        optimal_offset: optimalOffset,
                        similarity: similarity,
                        method: document.getElementById('method').value,
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
                    // Show success message
                    alert('✅ ' + result.message);
                    console.log('Offset saved to:', result.config_path);
                } else {
                    alert('❌ 保存失败: ' + result.error);
                }
            } catch (error) {
                console.error('Save error:', error);
                alert('❌ 保存失败: ' + error.message);
            }
        } else {
            // Fall back to download CSV for file upload mode
            downloadOffsetConfigCSV(currentOffset, similarity);
        }
    });
}

// Helper function to download offset config as CSV (for file upload mode)
function downloadOffsetConfigCSV(currentOffset, similarity) {
    const useMpsCSV = modeMpsCSV.checked;
    let ariaFileName = '';
    let ariaFilePath = '';

    if (useMpsCSV) {
        const mpsFile = mpsFileInput.files[0];
        if (mpsFile) {
            ariaFileName = mpsFile.name;
            ariaFilePath = mpsFile.webkitRelativePath || mpsFile.name;
        }
    } else {
        const vrsFile = vrsFileInput.files[0];
        if (vrsFile) {
            ariaFileName = vrsFile.name;
            ariaFilePath = vrsFile.webkitRelativePath || vrsFile.name;
        }
    }

    const hapticFile = hapticFileInput.files[0];
    const hapticFileName = hapticFile ? hapticFile.name : '';
    const hapticFilePath = hapticFile ? (hapticFile.webkitRelativePath || hapticFile.name) : '';

    // Get VRS video file if selected
    const vrsVideoFileInput = document.getElementById('vrs_video_file');
    const vrsVideoFile = vrsVideoFileInput ? vrsVideoFileInput.files[0] : null;
    const vrsVideoFileName = vrsVideoFile ? vrsVideoFile.name : '';
    const vrsVideoFilePath = vrsVideoFile ? (vrsVideoFile.webkitRelativePath || vrsVideoFile.name) : '';

    // Get parameters
    const maxOffsetParam = document.getElementById('max_offset').value;
    const method = document.getElementById('method').value;
    const forceThreshold = document.getElementById('force_threshold').value;
    const forceMaxThreshold = document.getElementById('force_max_threshold').value;
    const smoothWindow = document.getElementById('smooth_window').value;

    // Create CSV content
    const timestamp = new Date().toISOString();
    const csvHeader = 'timestamp,aria_file,aria_path,haptic_file,haptic_path,vrs_video_file,vrs_video_path,current_offset_s,optimal_offset_s,similarity,method,max_offset_param,force_threshold,force_max_threshold,smooth_window';
    const csvRow = [
        timestamp,
        `"${ariaFileName}"`,
        `"${ariaFilePath}"`,
        `"${hapticFileName}"`,
        `"${hapticFilePath}"`,
        `"${vrsVideoFileName}"`,
        `"${vrsVideoFilePath}"`,
        currentOffset.toFixed(6),
        optimalOffset ? optimalOffset.toFixed(6) : '',
        similarity.toFixed(6),
        method,
        maxOffsetParam,
        forceThreshold,
        forceMaxThreshold,
        smoothWindow
    ].join(',');

    const csvContent = csvHeader + '\n' + csvRow;

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    // Generate filename with timestamp
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseFileName = hapticFileName.replace(/\.[^/.]+$/, '') || 'alignment';
    link.setAttribute('href', url);
    link.setAttribute('download', `offset_config_${baseFileName}_${dateStr}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    console.log('Offset configuration saved:', { currentOffset, optimalOffset, similarity, ariaFileName, hapticFileName });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkFormValidity();
    initVRSVideoPlayer();
    console.log('Aria-Haptic Alignment Tool initialized');

    // Check for URL parameters to auto-load files from data manager
    checkUrlParamsAndLoad();
});

// ==================== URL Parameter Loading ====================
// Check URL parameters and auto-load files from server paths
async function checkUrlParamsAndLoad() {
    const urlParams = new URLSearchParams(window.location.search);

    // Check if we should auto-load
    if (!urlParams.has('load') || urlParams.get('load') !== '1') {
        return;
    }

    const mpsPath = urlParams.get('mps_csv');
    const hapticPath = urlParams.get('haptic_csv');
    const vrsPath = urlParams.get('vrs_file');
    const savedOffset = urlParams.get('saved_offset');
    const savedSimilarity = urlParams.get('saved_similarity');

    if (!hapticPath) {
        console.log('No haptic CSV path provided in URL');
        return;
    }

    if (!mpsPath && !vrsPath) {
        console.log('No MPS CSV or VRS path provided in URL');
        return;
    }

    console.log('Auto-loading files from URL parameters:', { mpsPath, hapticPath, vrsPath, savedOffset });

    // Store paths globally for later use
    window.serverMpsPath = mpsPath;
    window.serverHapticPath = hapticPath;
    window.serverVrsPath = vrsPath;

    // Helper function to get short path (last 2-3 components)
    function getShortPath(fullPath) {
        if (!fullPath) return '';
        const parts = fullPath.split('/');
        // Get last 3 parts or all if less than 3
        const relevantParts = parts.slice(-3);
        return relevantParts.join('/');
    }

    // Show file info in UI with more path context
    if (mpsPath) {
        const shortPath = getShortPath(mpsPath);
        mpsInfo.textContent = `${shortPath}`;
        mpsInfo.style.color = '#17a2b8';
        mpsInfo.title = mpsPath;  // Full path on hover
        modeMpsCSV.checked = true;
        mpsFileWrapper.style.display = '';
        vrsFileWrapper.style.display = 'none';
    }

    if (hapticPath) {
        const shortPath = getShortPath(hapticPath);
        hapticInfo.textContent = `${shortPath}`;
        hapticInfo.style.color = '#17a2b8';
        hapticInfo.title = hapticPath;  // Full path on hover
    }

    if (vrsPath) {
        const shortPath = getShortPath(vrsPath);
        vrsInfo.textContent = `${shortPath}`;
        vrsInfo.style.color = '#17a2b8';
        vrsInfo.title = vrsPath;  // Full path on hover
    }

    // Update form validity so "开始对齐分析" button is enabled
    checkFormValidity();

    // Show loading indicator
    loadingIndicator.style.display = 'block';
    resultsSection.style.display = 'none';
    errorSection.style.display = 'none';

    try {
        // Get alignment parameters
        const maxOffset = parseFloat(document.getElementById('max_offset').value);
        const method = document.getElementById('method').value;
        const forceThreshold = parseFloat(document.getElementById('force_threshold').value);
        const forceMaxThreshold = parseFloat(document.getElementById('force_max_threshold').value);
        const smoothWindow = parseInt(document.getElementById('smooth_window').value);
        const exportSegments = document.getElementById('export_segments').checked;

        // Call server API to align from paths
        const response = await fetch('/align_from_path', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                mps_csv_path: mpsPath,
                haptic_csv_path: hapticPath,
                vrs_path: vrsPath,
                max_offset: maxOffset,
                method: method,
                force_threshold: forceThreshold,
                force_max_threshold: forceMaxThreshold,
                smooth_window: smoothWindow,
                export_segments: exportSegments
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Alignment failed');
        }

        // Display results using the same logic as the regular alignment
        displayAlignmentResults(data);

        // If we have a saved offset, apply it instead of the calculated optimal
        if (savedOffset !== null && savedOffset !== undefined) {
            const offsetValue = parseFloat(savedOffset);
            if (!isNaN(offsetValue)) {
                console.log('Applying saved offset:', offsetValue);
                offsetSlider.value = offsetValue;
                currentOffsetSpan.textContent = offsetValue.toFixed(3);

                // Update similarity display if provided
                if (savedSimilarity !== null && savedSimilarity !== undefined) {
                    const simValue = parseFloat(savedSimilarity);
                    if (!isNaN(simValue)) {
                        currentSimilaritySpan.textContent = simValue.toFixed(4);
                    }
                } else {
                    // Calculate similarity at saved offset
                    const similarity = getSimilarityAtOffset(offsetValue);
                    currentSimilaritySpan.textContent = similarity.toFixed(4);
                }

                // Update the plot with saved offset
                updatePlotWithOffset(offsetValue);

                // Show indicator that we're using saved config
                const optimalOffsetEl = document.getElementById('optimal-offset');
                if (optimalOffsetEl) {
                    optimalOffsetEl.innerHTML = `${data.optimal_offset.toFixed(3)} <span style="color: #17a2b8; font-size: 0.8em;">(已加载保存值: ${offsetValue.toFixed(3)}s)</span>`;
                }
            }
        }

        // Initialize VRS video player if VRS path is available
        if (vrsPath) {
            await initVRSSessionFromPath(vrsPath);
        }

        // Clear URL parameters to prevent re-loading on refresh
        window.history.replaceState({}, document.title, window.location.pathname);

    } catch (error) {
        console.error('Auto-load alignment failed:', error);
        loadingIndicator.style.display = 'none';
        errorSection.style.display = 'block';
        document.getElementById('errorMessage').textContent = error.message;
    }
}

// Display alignment results (extracted from the existing code for reuse)
function displayAlignmentResults(data) {
    loadingIndicator.style.display = 'none';
    resultsSection.style.display = 'block';

    // Update stats
    document.getElementById('optimal-offset').textContent = data.optimal_offset.toFixed(3);
    document.getElementById('similarity-score').textContent = data.max_similarity.toFixed(4);
    document.getElementById('aria-samples').textContent = data.aria_sample_count.toLocaleString();
    document.getElementById('haptic-samples').textContent = data.haptic_sample_count.toLocaleString();
    document.getElementById('segment-count').textContent = data.segment_count;
    document.getElementById('method-used').textContent = data.method.toUpperCase();

    // Store optimal offset for reset
    optimalOffset = data.optimal_offset;

    // Update slider range to fixed -10 to 20
    offsetSlider.min = -10;
    offsetSlider.max = 20;
    offsetSlider.value = data.optimal_offset;
    maxOffsetLabel.textContent = '20s';

    // Update current offset display
    currentOffsetSpan.textContent = data.optimal_offset.toFixed(3);
    currentSimilaritySpan.textContent = data.max_similarity.toFixed(4);

    // Cache data for interactive slider
    cachedData = {
        ariaTimestamps: data.aria_timestamps,
        ariaNormalized: data.aria_normalized,
        hapticTimestamps: data.haptic_timestamps,
        hapticNormalized: data.haptic_normalized,
        hapticThumbForce: data.haptic_thumb_force || [],
        hapticIndexForce: data.haptic_index_force || [],
        offsets: data.offsets,
        correlationScores: data.correlation_scores,
        segments: data.segments || [],
        handLandmarks: data.hand_landmarks || null
    };

    // Store segments CSV for download
    if (data.segments_csv) {
        segmentsCSV = data.segments_csv;
        downloadSection.style.display = 'block';
    } else {
        downloadSection.style.display = 'none';
    }

    // Render Plotly chart
    if (data.plotly_json) {
        const plotlyData = typeof data.plotly_json === 'string' ?
            JSON.parse(data.plotly_json) : data.plotly_json;
        Plotly.newPlot('plotly-chart', plotlyData.data, plotlyData.layout, {responsive: true});
    }

    // Initialize VRS session if VRS file was provided
    if (data.source_files && data.source_files.vrs) {
        // Store VRS path for later use
        window.serverVrsPath = data.source_files.vrs;
    }
}

// ==================== VRS Video Player ====================
let vrsVideoInitialized = false;
let vrsVideoPlaying = false;
let vrsPlaybackInterval = null;
let vrsCurrentTime = 0;
let vrsTimeRange = [0, 100];  // [min, max] in seconds
let vrsPlaybackSpeed = 1;
let currentTimelineShape = null;  // Store the vertical line shape

// Initialize VRS session from server path (for data manager auto-load)
async function initVRSSessionFromPath(vrsPath) {
    const loadingEl = document.getElementById('vrs-video-loading');

    try {
        if (loadingEl) loadingEl.style.display = 'block';

        console.log('Initializing VRS session from server path:', vrsPath);

        const formData = new FormData();
        formData.append('vrs_server_path', vrsPath);

        const response = await fetch('/gripper/init_vrs', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        console.log('VRS init response:', result);

        if (response.ok && result.success) {
            vrsVideoInitialized = true;
            console.log('VRS session initialized from server path');

            // Show video panel
            const videoPanel = document.getElementById('vrs-video-panel');
            if (videoPanel) videoPanel.style.display = 'block';

            // Store VRS info
            vrsNumFrames = result.num_frames || 0;

            // Set time range
            if (result.time_range_s && result.time_range_s.length === 2) {
                vrsDuration = result.time_range_s[1] - result.time_range_s[0];
                vrsTimeRange = [0, vrsDuration];
                vrsCurrentTime = 0;
                console.log(`VRS duration: ${vrsDuration.toFixed(3)}s, frames: ${vrsNumFrames}`);
            }

            // Update UI to show file is loaded
            const vrsVideoInfo = document.getElementById('vrs-video-info');
            if (vrsVideoInfo) {
                const fileName = vrsPath.split('/').pop();
                vrsVideoInfo.textContent = `${fileName} (服务器文件)`;
                vrsVideoInfo.style.color = '#17a2b8';
            }

            // Fetch first frame and update force indicators
            await updateVRSVideoFrame(vrsCurrentTime);
            updateForceIndicators(vrsCurrentTime);
            updateTimelineIndicator(vrsCurrentTime);

            if (loadingEl) loadingEl.style.display = 'none';
            return true;
        } else {
            throw new Error(result.error || 'Failed to initialize VRS session');
        }
    } catch (error) {
        console.error('VRS initialization from path error:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        return false;
    }
}

// Initialize VRS video player
function initVRSVideoPlayer() {
    const vrsVideoFileInput = document.getElementById('vrs_video_file');
    const vrsVideoInfo = document.getElementById('vrs-video-info');

    if (!vrsVideoFileInput) return;

    // File selection handler
    vrsVideoFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            vrsVideoInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
            // Don't initialize VRS session yet - wait until alignment is done
        } else {
            vrsVideoInfo.textContent = '未选择文件';
        }
    });

    // Play button
    const playBtn = document.getElementById('video-play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', function() {
            if (vrsVideoPlaying) {
                pauseVRSVideo();
                this.textContent = '▶ 播放';
            } else {
                playVRSVideo();
                this.textContent = '⏸ 暂停';
            }
        });
    }

    // Stop button
    const stopBtn = document.getElementById('video-stop-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            stopVRSVideo();
            const playBtn = document.getElementById('video-play-btn');
            if (playBtn) playBtn.textContent = '▶ 播放';
        });
    }

    // Speed selector
    const speedSelect = document.getElementById('video-speed');
    if (speedSelect) {
        speedSelect.addEventListener('change', function(e) {
            vrsPlaybackSpeed = parseFloat(e.target.value);
        });
    }

    // Time slider
    const timeSlider = document.getElementById('video-time-slider');
    if (timeSlider) {
        timeSlider.addEventListener('input', function(e) {
            const percent = parseFloat(e.target.value);
            vrsCurrentTime = vrsTimeRange[0] + (vrsTimeRange[1] - vrsTimeRange[0]) * (percent / 100);
            updateVRSVideoFrame(vrsCurrentTime);
            updateTimelineIndicator(vrsCurrentTime);
            updateForceIndicators(vrsCurrentTime);
        });
    }
}

// Global variables for VRS video
let vrsNumFrames = 0;
let vrsDuration = 0;
let vrsFrameLoading = false;  // Lock to prevent overlapping frame requests

// Initialize VRS session after alignment results are ready
async function initVRSSession() {
    const vrsVideoFileInput = document.getElementById('vrs_video_file');
    if (!vrsVideoFileInput || !vrsVideoFileInput.files[0]) {
        return false;
    }

    const vrsFile = vrsVideoFileInput.files[0];
    const loadingEl = document.getElementById('vrs-video-loading');

    try {
        if (loadingEl) loadingEl.style.display = 'block';

        console.log('Uploading VRS file for video playback:', vrsFile.name);

        const formData = new FormData();
        formData.append('vrs_file', vrsFile);

        const response = await fetch('/gripper/init_vrs', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        console.log('VRS init response:', result);

        if (response.ok && result.success) {
            vrsVideoInitialized = true;
            console.log('VRS session initialized for video playback');

            // Show video panel
            const videoPanel = document.getElementById('vrs-video-panel');
            if (videoPanel) videoPanel.style.display = 'block';

            // Store VRS info
            vrsNumFrames = result.num_frames || 0;

            // Set time range: use VRS duration (0 to duration_seconds)
            // The backend expects relative time from 0 to duration
            if (result.time_range_s && result.time_range_s.length === 2) {
                vrsDuration = result.time_range_s[1] - result.time_range_s[0];
                vrsTimeRange = [0, vrsDuration];  // Use 0 to duration as the range
                vrsCurrentTime = 0;
                console.log(`VRS duration: ${vrsDuration.toFixed(3)}s, frames: ${vrsNumFrames}`);
            }

            // Fetch first frame and update force indicators
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

// Update video frame at given timestamp
async function updateVRSVideoFrame(timestamp) {
    if (!vrsVideoInitialized) return;
    if (vrsFrameLoading) return;  // Skip if previous frame is still loading

    const frameImg = document.getElementById('vrs-video-frame');
    const timeDisplay = document.getElementById('vrs-video-time');
    const timeSlider = document.getElementById('video-time-slider');

    // Update time display and slider immediately (don't wait for frame)
    if (timeDisplay) timeDisplay.textContent = timestamp.toFixed(3);
    if (timeSlider && vrsTimeRange[1] > vrsTimeRange[0]) {
        const percent = ((timestamp - vrsTimeRange[0]) / (vrsTimeRange[1] - vrsTimeRange[0])) * 100;
        timeSlider.value = Math.min(100, Math.max(0, percent));
    }

    vrsFrameLoading = true;
    try {
        const response = await fetch(`/gripper/video_frame?timestamp=${timestamp}&camera=camera-rgb`);
        const result = await response.json();

        if (response.ok && result.image) {
            if (frameImg) frameImg.src = result.image;
        } else if (response.status === 400) {
            // VRS session lost, try to reinitialize
            console.warn('VRS session lost, attempting to reinitialize...');
            vrsVideoInitialized = false;
            pauseVRSVideo();
            const playBtn = document.getElementById('video-play-btn');
            if (playBtn) playBtn.textContent = '▶ 播放';
            // Try to reinitialize
            await initVRSSession();
        }
    } catch (error) {
        console.error('Error fetching video frame:', error);
    } finally {
        vrsFrameLoading = false;
    }
}

// Update force indicator bars based on current timestamp
function updateForceIndicators(timestamp) {
    if (!cachedData) return;

    // Support both naming conventions (camelCase and snake_case)
    const ariaTimestamps = cachedData.ariaTimestamps || cachedData.aria_timestamps;
    const hapticTimestamps = cachedData.hapticTimestamps || cachedData.haptic_timestamps;
    const hapticThumbForce = cachedData.hapticThumbForce || cachedData.haptic_thumb_force || [];
    const hapticIndexForce = cachedData.hapticIndexForce || cachedData.haptic_index_force || [];

    if (!hapticTimestamps || hapticTimestamps.length === 0) return;
    if (!ariaTimestamps || ariaTimestamps.length === 0) return;

    // Get current offset from slider (this is the alignment offset between Aria and Haptic)
    const currentOffset = parseFloat(offsetSlider.value) || optimalOffset || 0;

    // Convert VRS relative timestamp to haptic timestamp:
    // In the alignment, we shift haptic by +offset to align with aria:
    //   aligned_haptic_time = haptic_time + offset
    // So to find the original haptic time from aria time:
    //   haptic_time = aria_time - offset (because haptic_time + offset = aria_time)
    //
    // 1. VRS relative time (0 to duration) → Aria absolute time
    //    ariaTime = vrsRelativeTime + ariaStartTime
    // 2. Aria time → original Haptic time (reverse of alignment offset)
    //    hapticTime = ariaTime - offset
    const ariaStartTime = ariaTimestamps[0];
    const ariaTime = timestamp + ariaStartTime;
    const hapticTime = ariaTime - currentOffset;

    // Find closest haptic data point using binary search for efficiency
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

    // Check which neighbor is closer
    if (left >= hapticTimestamps.length) {
        closestIdx = hapticTimestamps.length - 1;
    } else if (left === 0) {
        closestIdx = 0;
    } else {
        const diffLeft = Math.abs(hapticTimestamps[left] - hapticTime);
        const diffRight = Math.abs(hapticTimestamps[left - 1] - hapticTime);
        closestIdx = diffLeft < diffRight ? left : left - 1;
    }

    // Get force values
    const thumbForce = hapticThumbForce[closestIdx] || 0;
    const indexForce = hapticIndexForce[closestIdx] || 0;

    // Get force max threshold for scaling
    const forceMaxThreshold = parseFloat(document.getElementById('force_max_threshold').value) || 50;

    // Calculate bar heights (as percentage)
    const thumbPercent = Math.min(100, Math.max(0, (thumbForce / forceMaxThreshold) * 100));
    const indexPercent = Math.min(100, Math.max(0, (indexForce / forceMaxThreshold) * 100));

    // Update bars
    const thumbBar = document.getElementById('thumb-force-bar');
    const indexBar = document.getElementById('index-force-bar');
    const thumbValue = document.getElementById('thumb-force-value');
    const indexValue = document.getElementById('index-force-value');
    const hapticSyncTime = document.getElementById('haptic-sync-time');

    if (thumbBar) thumbBar.style.width = thumbPercent + '%';
    if (indexBar) indexBar.style.width = indexPercent + '%';
    if (thumbValue) thumbValue.textContent = thumbForce.toFixed(1) + ' N';
    if (indexValue) indexValue.textContent = indexForce.toFixed(1) + ' N';

    // Update haptic sync time display (show relative time from haptic start)
    if (hapticSyncTime) {
        const hapticStartTime = hapticTimestamps[0];
        const relativeHapticTime = hapticTimestamps[closestIdx] - hapticStartTime;
        hapticSyncTime.textContent = relativeHapticTime.toFixed(3);
    }
}

// Play VRS video
function playVRSVideo() {
    if (!vrsVideoInitialized || vrsVideoPlaying) return;

    vrsVideoPlaying = true;
    const frameInterval = 100;  // 10 fps base rate

    vrsPlaybackInterval = setInterval(() => {
        vrsCurrentTime += (frameInterval / 1000) * vrsPlaybackSpeed;

        // Loop back to start if past end
        if (vrsCurrentTime > vrsTimeRange[1]) {
            vrsCurrentTime = vrsTimeRange[0];
        }

        updateVRSVideoFrame(vrsCurrentTime);
        updateTimelineIndicator(vrsCurrentTime);
        updateForceIndicators(vrsCurrentTime);
    }, frameInterval);
}

// Pause VRS video
function pauseVRSVideo() {
    vrsVideoPlaying = false;
    if (vrsPlaybackInterval) {
        clearInterval(vrsPlaybackInterval);
        vrsPlaybackInterval = null;
    }
    // Reset loading lock to allow next frame request
    vrsFrameLoading = false;
}

// Stop VRS video
function stopVRSVideo() {
    pauseVRSVideo();
    vrsCurrentTime = vrsTimeRange[0];
    updateVRSVideoFrame(vrsCurrentTime);
    updateTimelineIndicator(vrsCurrentTime);
    updateForceIndicators(vrsCurrentTime);
}

// Update vertical line indicator on plotly chart
function updateTimelineIndicator(timestamp) {
    const chartDiv = document.getElementById('plotly-chart');
    if (!chartDiv || !chartDiv.data) return;

    // Create vertical line shapes for the subplots
    const shapes = [];

    // Get current offset from slider
    const currentOffset = parseFloat(offsetSlider.value) || optimalOffset || 0;

    // Line for subplot 1 (Before Alignment) - x axis
    // Before alignment shows original timestamps without offset
    shapes.push({
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: timestamp,
        x1: timestamp,
        y0: 0.70,  // Top subplot (Before Alignment)
        y1: 1.0,
        line: { color: '#00ff00', width: 2, dash: 'solid' }
    });

    // Line for subplot 2 (After Alignment) - x2 axis
    shapes.push({
        type: 'line',
        xref: 'x2',
        yref: 'paper',
        x0: timestamp,
        x1: timestamp,
        y0: 0.35,  // Middle subplot (After Alignment)
        y1: 0.65,
        line: { color: '#00ff00', width: 2, dash: 'solid' }
    });

    // Line for subplot 3 (Correlation) - x3 axis
    // This shows the offset value at the current time position
    shapes.push({
        type: 'line',
        xref: 'x3',
        yref: 'paper',
        x0: currentOffset,
        x1: currentOffset,
        y0: 0.0,  // Bottom subplot (Correlation)
        y1: 0.30,
        line: { color: '#00ff00', width: 2, dash: 'solid' }
    });

    // Preserve existing shapes (segment lines, optimal offset line, etc.)
    const currentLayout = chartDiv.layout || {};
    const existingShapes = currentLayout.shapes || [];

    // Filter out old timeline indicators (identified by green color)
    const otherShapes = existingShapes.filter(s => s.line && s.line.color !== '#00ff00');

    // Combine other shapes with new timeline indicators
    const allShapes = [...otherShapes, ...shapes];

    Plotly.relayout('plotly-chart', { shapes: allShapes });
}

// Add drag and drop support for file inputs
[mpsFileInput, vrsFileInput, hapticFileInput].forEach(input => {
    const wrapper = input.closest('.file-input-wrapper');

    wrapper.addEventListener('dragover', function(e) {
        e.preventDefault();
        wrapper.style.borderColor = '#667eea';
        wrapper.style.background = '#f8f9ff';
    });

    wrapper.addEventListener('dragleave', function(e) {
        e.preventDefault();
        wrapper.style.borderColor = '#dee2e6';
        wrapper.style.background = 'white';
    });

    wrapper.addEventListener('drop', function(e) {
        e.preventDefault();
        wrapper.style.borderColor = '#dee2e6';
        wrapper.style.background = 'white';

        if (e.dataTransfer.files.length > 0) {
            input.files = e.dataTransfer.files;
            // Trigger change event
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
        }
    });
});
