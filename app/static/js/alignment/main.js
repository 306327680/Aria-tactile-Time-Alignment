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

    let ariaFileValid = false;
    if (useMpsCSV) {
        ariaFileValid = mpsFileInput.files.length > 0;
    } else {
        ariaFileValid = vrsFileInput.files.length > 0;
    }

    alignBtn.disabled = !(ariaFileValid && hapticFile);
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
        // Prepare form data
        const formData = new FormData();
        const useMpsCSV = modeMpsCSV.checked;

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

        // Send request
        const response = await fetch('/align', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '处理失败');
        }

        // Display results
        displayResults(data);

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
        offsets: data.offsets,
        correlation_scores: data.correlation_scores,
        segments: data.segments
    };
    optimalOffset = data.optimal_offset;

    // Initialize slider
    offsetSlider.min = 0;
    offsetSlider.max = data.max_offset;
    offsetSlider.value = data.optimal_offset;
    currentOffsetSpan.textContent = data.optimal_offset.toFixed(3);
    maxOffsetLabel.textContent = data.max_offset.toFixed(1) + 's';

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

    // Find the closest offset in the offsets array
    const offsets = cachedData.offsets;
    const scores = cachedData.correlation_scores;

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

    // Calculate new haptic timestamps with offset
    const hapticTimestampsOffset = cachedData.haptic_timestamps.map(t => t + newOffset);

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
});

// Apply offset button handler - actually update the plot
applyOffsetBtn.addEventListener('click', function() {
    const newOffset = parseFloat(offsetSlider.value);
    updatePlotWithOffset(newOffset);
});

// Reset offset button handler
resetOffsetBtn.addEventListener('click', function() {
    if (optimalOffset !== null) {
        offsetSlider.value = optimalOffset;
        currentOffsetSpan.textContent = optimalOffset.toFixed(3);
        const similarity = getSimilarityAtOffset(optimalOffset);
        currentSimilaritySpan.textContent = similarity.toFixed(4);
        updatePlotWithOffset(optimalOffset);
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkFormValidity();
    initVRSVideoPlayer();
    console.log('Aria-Haptic Alignment Tool initialized');
});

// ==================== VRS Video Player ====================
let vrsVideoInitialized = false;
let vrsVideoPlaying = false;
let vrsPlaybackInterval = null;
let vrsCurrentTime = 0;
let vrsTimeRange = [0, 100];  // [min, max] in seconds
let vrsPlaybackSpeed = 1;
let currentTimelineShape = null;  // Store the vertical line shape

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
        });
    }
}

// Global variables for VRS video
let vrsNumFrames = 0;
let vrsDuration = 0;

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

            // Fetch first frame
            await updateVRSVideoFrame(vrsCurrentTime);

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

    const frameImg = document.getElementById('vrs-video-frame');
    const timeDisplay = document.getElementById('vrs-video-time');
    const timeSlider = document.getElementById('video-time-slider');

    try {
        const response = await fetch(`/gripper/video_frame?timestamp=${timestamp}&camera=camera-rgb`);
        const result = await response.json();

        if (response.ok && result.image) {
            if (frameImg) frameImg.src = result.image;
            if (timeDisplay) timeDisplay.textContent = timestamp.toFixed(3);

            // Update slider position
            if (timeSlider && vrsTimeRange[1] > vrsTimeRange[0]) {
                const percent = ((timestamp - vrsTimeRange[0]) / (vrsTimeRange[1] - vrsTimeRange[0])) * 100;
                timeSlider.value = Math.min(100, Math.max(0, percent));
            }
        }
    } catch (error) {
        console.error('Error fetching video frame:', error);
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
    }, frameInterval);
}

// Pause VRS video
function pauseVRSVideo() {
    vrsVideoPlaying = false;
    if (vrsPlaybackInterval) {
        clearInterval(vrsPlaybackInterval);
        vrsPlaybackInterval = null;
    }
}

// Stop VRS video
function stopVRSVideo() {
    pauseVRSVideo();
    vrsCurrentTime = vrsTimeRange[0];
    updateVRSVideoFrame(vrsCurrentTime);
    updateTimelineIndicator(vrsCurrentTime);
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
