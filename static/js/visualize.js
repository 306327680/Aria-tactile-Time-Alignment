// Visualize page JavaScript

// DOM Elements
const mpsFileInput = document.getElementById('mps_file');
const hapticFileInput = document.getElementById('haptic_file');
const mpsFileInfo = document.getElementById('mps-file-info');
const hapticFileInfo = document.getElementById('haptic-file-info');
const visualizeMpsBtn = document.getElementById('visualizeMpsBtn');
const visualizeHapticBtn = document.getElementById('visualizeHapticBtn');

const mpsLoadingIndicator = document.getElementById('mpsLoadingIndicator');
const hapticLoadingIndicator = document.getElementById('hapticLoadingIndicator');
const mpsResultsSection = document.getElementById('mpsResultsSection');
const hapticResultsSection = document.getElementById('hapticResultsSection');
const mpsErrorSection = document.getElementById('mpsErrorSection');
const hapticErrorSection = document.getElementById('hapticErrorSection');

// Tab switching
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
    button.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');

        // Remove active class from all buttons and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        // Add active class to clicked button and corresponding content
        this.classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
    });
});

// File input handlers
mpsFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        mpsFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        mpsFileInfo.style.color = '#28a745';
        visualizeMpsBtn.disabled = false;
    } else {
        mpsFileInfo.textContent = '未选择文件';
        mpsFileInfo.style.color = '#6c757d';
        visualizeMpsBtn.disabled = true;
    }
});

hapticFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        hapticFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        hapticFileInfo.style.color = '#28a745';
        visualizeHapticBtn.disabled = false;
    } else {
        hapticFileInfo.textContent = '未选择文件';
        hapticFileInfo.style.color = '#6c757d';
        visualizeHapticBtn.disabled = true;
    }
});

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Visualize MPS button handler
visualizeMpsBtn.addEventListener('click', async function() {
    mpsResultsSection.style.display = 'none';
    mpsErrorSection.style.display = 'none';
    mpsLoadingIndicator.style.display = 'block';
    visualizeMpsBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('mps_file', mpsFileInput.files[0]);
        formData.append('file_type', 'mps');

        console.log('Sending MPS visualization request...');

        const response = await fetch('/visualize_data', {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);

        const data = await response.json();
        console.log('Response data:', data);

        if (!response.ok) {
            throw new Error(data.error || '处理失败');
        }

        displayMpsResults(data);

    } catch (error) {
        console.error('Error in MPS visualization:', error);
        displayMpsError(error);
    } finally {
        mpsLoadingIndicator.style.display = 'none';
        visualizeMpsBtn.disabled = false;
    }
});

// Visualize Haptic button handler
visualizeHapticBtn.addEventListener('click', async function() {
    hapticResultsSection.style.display = 'none';
    hapticErrorSection.style.display = 'none';
    hapticLoadingIndicator.style.display = 'block';
    visualizeHapticBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('haptic_file', hapticFileInput.files[0]);
        formData.append('file_type', 'haptic');

        const response = await fetch('/visualize_data', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '处理失败');
        }

        displayHapticResults(data);

    } catch (error) {
        displayHapticError(error);
    } finally {
        hapticLoadingIndicator.style.display = 'none';
        visualizeHapticBtn.disabled = false;
    }
});

// Display MPS results
function displayMpsResults(data) {
    console.log('MPS Data received:', data);
    console.log('Plotly JSON:', data.plotly_json);

    // Update stats
    const timeRangeNote = data.time_display_note ? ` (${data.time_display_note})` : '';
    const statsHtml = `
        <div class="stat-inline">
            <span class="stat-inline-label">样本数:</span>
            <span class="stat-inline-value">${data.sample_count.toLocaleString()}</span>
        </div>
        <div class="stat-inline">
            <span class="stat-inline-label">时间范围${timeRangeNote}:</span>
            <span class="stat-inline-value">${data.time_range[0].toFixed(2)}s - ${data.time_range[1].toFixed(2)}s</span>
        </div>
        <div class="stat-inline">
            <span class="stat-inline-label">距离范围:</span>
            <span class="stat-inline-value">${data.distance_range[0].toFixed(2)}cm - ${data.distance_range[1].toFixed(2)}cm</span>
        </div>
        <div class="stat-inline">
            <span class="stat-inline-label">成功率:</span>
            <span class="stat-inline-value">${data.success_rate !== null && data.success_rate !== undefined ? data.success_rate.toFixed(1) + '%' : 'N/A'}</span>
        </div>
        <div class="stat-inline">
            <span class="stat-inline-label">平均置信度:</span>
            <span class="stat-inline-value">${data.avg_confidence !== null && data.avg_confidence !== undefined ? data.avg_confidence.toFixed(3) : 'N/A'}</span>
        </div>
    `;
    document.getElementById('mpsStats').innerHTML = statsHtml;

    // Render Plotly chart
    console.log('Rendering MPS chart...');

    // Ensure layout uses full width
    const layout = {
        ...data.plotly_json.layout,
        autosize: true,
        width: null  // Remove fixed width, let it be responsive
    };

    Plotly.newPlot('mps-chart', data.plotly_json.data, layout, {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false
    }).then(() => {
        console.log('MPS chart rendered successfully');
        // Force resize to ensure it takes full width
        window.dispatchEvent(new Event('resize'));
    }).catch(err => {
        console.error('Error rendering MPS chart:', err);
    });

    mpsResultsSection.style.display = 'block';

    setTimeout(() => {
        mpsResultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// Display Haptic results
function displayHapticResults(data) {
    console.log('Haptic Data received:', data);
    console.log('Plotly JSON:', data.plotly_json);

    // Update stats
    const statsHtml = `
        <div class="stat-inline">
            <span class="stat-inline-label">样本数:</span>
            <span class="stat-inline-value">${data.sample_count.toLocaleString()}</span>
        </div>
        <div class="stat-inline">
            <span class="stat-inline-label">时间范围:</span>
            <span class="stat-inline-value">${data.time_range[0].toFixed(2)}s - ${data.time_range[1].toFixed(2)}s</span>
        </div>
        <div class="stat-inline">
            <span class="stat-inline-label">力度范围:</span>
            <span class="stat-inline-value">${data.force_range[0].toFixed(4)}N - ${data.force_range[1].toFixed(4)}N</span>
        </div>
    `;
    document.getElementById('hapticStats').innerHTML = statsHtml;

    // Render Plotly chart
    console.log('Rendering Haptic chart...');

    // Ensure layout uses full width
    const layout = {
        ...data.plotly_json.layout,
        autosize: true,
        width: null  // Remove fixed width, let it be responsive
    };

    Plotly.newPlot('haptic-chart', data.plotly_json.data, layout, {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false
    }).then(() => {
        console.log('Haptic chart rendered successfully');
        // Force resize to ensure it takes full width
        window.dispatchEvent(new Event('resize'));
    }).catch(err => {
        console.error('Error rendering Haptic chart:', err);
    });

    hapticResultsSection.style.display = 'block';

    setTimeout(() => {
        hapticResultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// Display MPS error
function displayMpsError(error) {
    const errorMessage = document.getElementById('mpsErrorMessage');
    errorMessage.textContent = error.message || String(error);
    mpsErrorSection.style.display = 'block';

    setTimeout(() => {
        mpsErrorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// Display Haptic error
function displayHapticError(error) {
    const errorMessage = document.getElementById('hapticErrorMessage');
    errorMessage.textContent = error.message || String(error);
    hapticErrorSection.style.display = 'block';

    setTimeout(() => {
        hapticErrorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}
