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
    document.getElementById('haptic-samples').textContent = data.haptic_sample_count.toLocaleString();
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
const applyOffsetBtn = document.getElementById('apply-offset-btn');
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
    console.log('Aria-Haptic Alignment Tool initialized');
});

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
