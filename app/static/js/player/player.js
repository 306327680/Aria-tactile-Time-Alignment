// Player JavaScript for Aria-Haptic Data Playback

// Global variables
let playerData = null;
let isPlaying = false;
let playInterval = null;
let currentPosition = 0;  // Current time position in seconds
let windowSize = 10;  // Display window size in seconds (0 = show all)
let playbackSpeed = 1;

// Recording variables
let isRecording = false;
let recordedFrames = [];
let recordStartTime = 0;

// 3D visualization settings
let hand3dSettings = {
    jointSize: 6,
    boneWidth: 4,
    center: { x: 0.4, y: -0.4, z: 0.2 },
    expand: { x: 0.3, y: 0.3, z: 0.3 },
    showCenter: true
};

// Store camera state to preserve user's view during playback
let savedCameraState = null;
let cameraListenerAdded = false;

// LocalStorage keys
const STORAGE_KEYS = {
    MPS_FILENAME: 'player_mps_filename',
    HAPTIC_FILENAME: 'player_haptic_filename',
    OFFSET: 'player_offset',
    CENTER: 'player_center',
    EXPAND: 'player_expand',
    WINDOW_SIZE: 'player_window_size',
    JOINT_SIZE: 'player_joint_size',
    BONE_WIDTH: 'player_bone_width',
    SHOW_CENTER: 'player_show_center',
    MAX_FORCE: 'player_max_force'
};

// Hand skeleton bone connections (based on 21 landmarks)
// Reference: aria2lerobot/visualize.py
// Landmark layout:
// 0-4: fingertips (thumb, index, middle, ring, pinky)
// 5: wrist
// 6-7: thumb joints
// 8-10: index joints
// 11-13: middle joints
// 14-16: ring joints
// 17-19: pinky joints
// 20: palm center
const HAND_CONNECTIONS = [
    // Wrist to palm center
    [5, 20],
    // Thumb: wrist -> joints -> tip
    [5, 6], [6, 7], [7, 0],
    // Index: wrist -> joints -> tip
    [5, 8], [8, 9], [9, 10], [10, 1],
    // Middle: wrist -> joints -> tip
    [5, 11], [11, 12], [12, 13], [13, 2],
    // Ring: wrist -> joints -> tip
    [5, 14], [14, 15], [15, 16], [16, 3],
    // Pinky: wrist -> joints -> tip
    [5, 17], [17, 18], [18, 19], [19, 4],
    // Palm connections: finger bases to palm center
    [8, 20], [11, 20], [14, 20], [17, 20]
];

// Colors for different finger groups (matching visualize.py)
const FINGER_COLORS = {
    wrist_palm: '#ffffff',    // White for wrist-palm
    thumb: '#ff0000',         // Red
    index: '#ffa500',         // Orange
    middle: '#ffff00',        // Yellow
    ring: '#00ff00',          // Green
    pinky: '#0000ff',         // Blue
    palm: '#800080'           // Purple for palm connections
};

function getFingerColor(idx1, idx2) {
    // Determine which finger the connection belongs to
    // Layout: 0-4=tips, 5=wrist, 6-7=thumb, 8-10=index, 11-13=middle, 14-16=ring, 17-19=pinky, 20=palm

    // Wrist to palm center
    if ((idx1 === 5 && idx2 === 20) || (idx1 === 20 && idx2 === 5)) {
        return FINGER_COLORS.wrist_palm;
    }

    // Palm connections (joints to palm center)
    if (idx1 === 20 || idx2 === 20) {
        return FINGER_COLORS.palm;
    }

    // Thumb: tip(0) or joints(6-7) or connections from wrist(5)
    if (idx1 === 0 || idx2 === 0 || (idx1 >= 6 && idx1 <= 7) || (idx2 >= 6 && idx2 <= 7)) {
        return FINGER_COLORS.thumb;
    }

    // Index: tip(1) or joints(8-10)
    if (idx1 === 1 || idx2 === 1 || (idx1 >= 8 && idx1 <= 10) || (idx2 >= 8 && idx2 <= 10)) {
        return FINGER_COLORS.index;
    }

    // Middle: tip(2) or joints(11-13)
    if (idx1 === 2 || idx2 === 2 || (idx1 >= 11 && idx1 <= 13) || (idx2 >= 11 && idx2 <= 13)) {
        return FINGER_COLORS.middle;
    }

    // Ring: tip(3) or joints(14-16)
    if (idx1 === 3 || idx2 === 3 || (idx1 >= 14 && idx1 <= 16) || (idx2 >= 14 && idx2 <= 16)) {
        return FINGER_COLORS.ring;
    }

    // Pinky: tip(4) or joints(17-19)
    if (idx1 === 4 || idx2 === 4 || (idx1 >= 17 && idx1 <= 19) || (idx2 >= 17 && idx2 <= 19)) {
        return FINGER_COLORS.pinky;
    }

    // Default (shouldn't reach here)
    return '#6c757d';
}

// DOM Elements
const mpsFileInput = document.getElementById('mps_file');
const hapticFileInput = document.getElementById('haptic_file');
const mpsFileInfo = document.getElementById('mps-file-info');
const hapticFileInfo = document.getElementById('haptic-file-info');
const offsetInput = document.getElementById('offset_input');
const loadDataBtn = document.getElementById('loadDataBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const playerSection = document.getElementById('playerSection');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const playIcon = document.getElementById('playIcon');
const playText = document.getElementById('playText');
const playbackSpeedSelect = document.getElementById('playbackSpeed');
const timelineSlider = document.getElementById('timelineSlider');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');
const timeStart = document.getElementById('timeStart');
const timeEnd = document.getElementById('timeEnd');

const windowSizeInput = document.getElementById('windowSize');
const applyWindowBtn = document.getElementById('applyWindowBtn');
const xMinInput = document.getElementById('xMin');
const xMaxInput = document.getElementById('xMax');
const yMinInput = document.getElementById('yMin');
const yMaxInput = document.getElementById('yMax');
const applyRangeBtn = document.getElementById('applyRangeBtn');
const resetRangeBtn = document.getElementById('resetRangeBtn');

// Save settings to localStorage
function saveSettings() {
    try {
        // Save filenames
        if (mpsFileInput.files.length > 0) {
            localStorage.setItem(STORAGE_KEYS.MPS_FILENAME, mpsFileInput.files[0].name);
        }
        if (hapticFileInput.files.length > 0) {
            localStorage.setItem(STORAGE_KEYS.HAPTIC_FILENAME, hapticFileInput.files[0].name);
        }

        // Save offset
        localStorage.setItem(STORAGE_KEYS.OFFSET, offsetInput.value);

        // Save 3D settings
        localStorage.setItem(STORAGE_KEYS.CENTER, JSON.stringify(hand3dSettings.center));
        localStorage.setItem(STORAGE_KEYS.EXPAND, JSON.stringify(hand3dSettings.expand));
        localStorage.setItem(STORAGE_KEYS.WINDOW_SIZE, windowSize);
        localStorage.setItem(STORAGE_KEYS.JOINT_SIZE, hand3dSettings.jointSize);
        localStorage.setItem(STORAGE_KEYS.BONE_WIDTH, hand3dSettings.boneWidth);
        localStorage.setItem(STORAGE_KEYS.SHOW_CENTER, hand3dSettings.showCenter);

        // Save max force setting
        const maxForceInput = document.getElementById('max-force-input');
        if (maxForceInput) {
            localStorage.setItem(STORAGE_KEYS.MAX_FORCE, maxForceInput.value);
        }

        console.log('Settings saved');
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

// Load settings from localStorage
function loadSettings() {
    let hasSettings = false;

    try {
        // Load and display last used filenames
        const lastMpsFile = localStorage.getItem(STORAGE_KEYS.MPS_FILENAME);
        const lastHapticFile = localStorage.getItem(STORAGE_KEYS.HAPTIC_FILENAME);

        if (lastMpsFile) {
            mpsFileInfo.textContent = `上次: ${lastMpsFile}`;
            mpsFileInfo.style.color = '#6c757d';
            mpsFileInfo.style.fontStyle = 'italic';
            hasSettings = true;
        }

        if (lastHapticFile) {
            hapticFileInfo.textContent = `上次: ${lastHapticFile}`;
            hapticFileInfo.style.color = '#6c757d';
            hapticFileInfo.style.fontStyle = 'italic';
            hasSettings = true;
        }

        // Load offset
        const savedOffset = localStorage.getItem(STORAGE_KEYS.OFFSET);
        if (savedOffset !== null) {
            offsetInput.value = savedOffset;
        }

        // Load 3D settings
        const savedCenter = localStorage.getItem(STORAGE_KEYS.CENTER);
        if (savedCenter) {
            const center = JSON.parse(savedCenter);
            document.getElementById('center-x').value = center.x;
            document.getElementById('center-y').value = center.y;
            document.getElementById('center-z').value = center.z;
            hand3dSettings.center = center;
        }

        const savedExpand = localStorage.getItem(STORAGE_KEYS.EXPAND);
        if (savedExpand) {
            const expand = JSON.parse(savedExpand);
            document.getElementById('expand-x').value = expand.x;
            document.getElementById('expand-y').value = expand.y;
            document.getElementById('expand-z').value = expand.z;
            hand3dSettings.expand = expand;
        }

        const savedWindowSize = localStorage.getItem(STORAGE_KEYS.WINDOW_SIZE);
        if (savedWindowSize !== null) {
            windowSize = parseFloat(savedWindowSize);
            document.getElementById('windowSize').value = windowSize;
        }

        const savedJointSize = localStorage.getItem(STORAGE_KEYS.JOINT_SIZE);
        if (savedJointSize !== null) {
            hand3dSettings.jointSize = parseInt(savedJointSize);
            document.getElementById('hand3d-joint-size').value = hand3dSettings.jointSize;
            document.getElementById('joint-size-value').textContent = hand3dSettings.jointSize;
        }

        const savedBoneWidth = localStorage.getItem(STORAGE_KEYS.BONE_WIDTH);
        if (savedBoneWidth !== null) {
            hand3dSettings.boneWidth = parseInt(savedBoneWidth);
            document.getElementById('hand3d-bone-width').value = hand3dSettings.boneWidth;
            document.getElementById('bone-width-value').textContent = hand3dSettings.boneWidth;
        }

        const savedShowCenter = localStorage.getItem(STORAGE_KEYS.SHOW_CENTER);
        if (savedShowCenter !== null) {
            hand3dSettings.showCenter = savedShowCenter === 'true';
            document.getElementById('show-ref-point').checked = hand3dSettings.showCenter;
        }

        // Load max force setting
        const savedMaxForce = localStorage.getItem(STORAGE_KEYS.MAX_FORCE);
        if (savedMaxForce !== null) {
            const maxForceInput = document.getElementById('max-force-input');
            if (maxForceInput) {
                maxForceInput.value = savedMaxForce;
            }
        }

        // Show hint if settings were loaded
        if (hasSettings) {
            const hint = document.getElementById('lastUsedHint');
            if (hint) {
                hint.style.display = 'block';
            }
        }

        console.log('Settings loaded');
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

// File input handlers
mpsFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        mpsFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        mpsFileInfo.style.color = '#28a745';
        mpsFileInfo.style.fontStyle = 'normal';
    } else {
        mpsFileInfo.textContent = '未选择文件';
        mpsFileInfo.style.color = '#6c757d';
    }
    checkFormValidity();
});

hapticFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        hapticFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        hapticFileInfo.style.color = '#28a745';
        hapticFileInfo.style.fontStyle = 'normal';
    } else {
        hapticFileInfo.textContent = '未选择文件';
        hapticFileInfo.style.color = '#6c757d';
    }
    checkFormValidity();
});

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function checkFormValidity() {
    const hasMps = mpsFileInput.files.length > 0;
    const hasHaptic = hapticFileInput.files.length > 0;
    loadDataBtn.disabled = !(hasMps && hasHaptic);
}

// Format time for display
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
}

// Load data button handler
loadDataBtn.addEventListener('click', async function() {
    loadingIndicator.style.display = 'block';
    playerSection.style.display = 'none';
    errorSection.style.display = 'none';
    loadDataBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('mps_file', mpsFileInput.files[0]);
        formData.append('haptic_file', hapticFileInput.files[0]);
        formData.append('offset', offsetInput.value);

        const response = await fetch('/player_data', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '加载数据失败');
        }

        // Store data
        playerData = data;

        // Save settings for next time
        saveSettings();

        // Initialize player
        initializePlayer();

    } catch (error) {
        displayError(error);
    } finally {
        loadingIndicator.style.display = 'none';
        loadDataBtn.disabled = false;
    }
});

function displayError(error) {
    errorMessage.textContent = error.message || String(error);
    errorSection.style.display = 'block';
}

function initializePlayer() {
    if (!playerData) return;

    // Reset camera state and listener flag for new data
    savedCameraState = null;
    cameraListenerAdded = false;

    // Update info display
    const totalDuration = playerData.time_range[1] - playerData.time_range[0];
    document.getElementById('total-time').textContent = `${totalDuration.toFixed(2)}s`;
    document.getElementById('aria-samples').textContent = playerData.aria_count.toLocaleString();
    document.getElementById('haptic-samples').textContent = playerData.haptic_count.toLocaleString();
    document.getElementById('offset-value').textContent = `${playerData.offset.toFixed(3)}s`;

    // Initialize timeline
    const startTime = playerData.time_range[0];
    const endTime = playerData.time_range[1];

    timelineSlider.min = startTime;
    timelineSlider.max = endTime;
    timelineSlider.value = startTime;
    timelineSlider.step = 0.01;

    timeStart.textContent = `${startTime.toFixed(3)}s`;
    timeEnd.textContent = `${endTime.toFixed(3)}s`;
    currentTimeDisplay.textContent = formatTime(startTime);
    totalTimeDisplay.textContent = formatTime(endTime);

    // Set initial range inputs
    xMinInput.value = startTime.toFixed(2);
    xMaxInput.value = (startTime + windowSize).toFixed(2);

    currentPosition = startTime;

    // Render initial plot
    renderPlot();

    // Show player section
    playerSection.style.display = 'block';

    // Scroll to player
    setTimeout(() => {
        playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function renderPlot() {
    if (!playerData) return;

    const offset = playerData.offset;

    // Calculate display range
    let xMin, xMax;
    if (windowSize > 0) {
        xMin = currentPosition;
        xMax = currentPosition + windowSize;
    } else {
        xMin = playerData.time_range[0];
        xMax = playerData.time_range[1];
    }

    // Get Y range from inputs
    const yMin = parseFloat(yMinInput.value) || -0.1;
    const yMax = parseFloat(yMaxInput.value) || 1.1;

    // Filter data within display range
    const ariaInRange = filterDataInRange(
        playerData.aria_timestamps,
        playerData.aria_normalized,
        xMin,
        xMax
    );
    const hapticInRange = filterDataInRange(
        playerData.haptic_timestamps_aligned,
        playerData.haptic_normalized,
        xMin,
        xMax
    );

    // Create traces
    const traces = [
        {
            x: ariaInRange.x,
            y: ariaInRange.y,
            name: 'Aria (反向距离)',
            line: { color: '#667eea', width: 2 },
            mode: 'lines'
        },
        {
            x: hapticInRange.x,
            y: hapticInRange.y,
            name: `Haptic (力, 偏移 +${offset.toFixed(3)}s)`,
            line: { color: '#f56565', width: 2 },
            mode: 'lines'
        }
    ];

    // Add current position line if playing or seeking
    if (windowSize > 0) {
        traces.push({
            x: [currentPosition, currentPosition],
            y: [yMin, yMax],
            name: '当前位置',
            line: { color: '#28a745', width: 2, dash: 'dash' },
            mode: 'lines',
            showlegend: true
        });
    }

    const layout = {
        title: `对齐后的数据 (偏移: ${offset.toFixed(3)}s)`,
        xaxis: {
            title: '时间 (秒)',
            range: [xMin, xMax],
            showgrid: true,
            gridcolor: '#e9ecef'
        },
        yaxis: {
            title: '归一化值',
            range: [yMin, yMax],
            showgrid: true,
            gridcolor: '#e9ecef'
        },
        showlegend: true,
        legend: {
            x: 1,
            xanchor: 'right',
            y: 1
        },
        hovermode: 'x unified',
        template: 'plotly_white',
        margin: { l: 60, r: 30, t: 50, b: 50 },
        height: 400,
        autosize: true
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false
    };

    Plotly.react('player-chart', traces, layout, config);

    // Also render hand 3D visualization
    renderHand3D();
}

function renderHand3D() {
    if (!playerData || !playerData.hand_landmarks) return;

    const handData = playerData.hand_landmarks;
    if (!handData.timestamps || handData.timestamps.length === 0) return;

    // Find nearest frame to current position
    const frameIndex = findNearestFrameIndex(handData.timestamps, currentPosition);

    // Update force indicator
    updateForceIndicator();

    const traces = [];

    // Render right hand (usually the primary hand)
    if (handData.right_hand[frameIndex]) {
        const landmarks = handData.right_hand[frameIndex];
        addHandTraces(traces, landmarks, '右手', '#667eea', '#4c5ec7');
    }

    // Render left hand
    if (handData.left_hand[frameIndex]) {
        const landmarks = handData.left_hand[frameIndex];
        addHandTraces(traces, landmarks, '左手', '#f56565', '#d63e3e');
    }

    // If no hand data for this frame, show placeholder
    if (traces.length === 0) {
        traces.push({
            x: [0],
            y: [0],
            z: [0],
            mode: 'markers',
            marker: { size: 1, color: '#ccc' },
            name: '无数据',
            type: 'scatter3d'
        });
    }

    // Add center point if enabled
    if (hand3dSettings.showCenter) {
        traces.push({
            x: [hand3dSettings.center.x],
            y: [hand3dSettings.center.y],
            z: [hand3dSettings.center.z],
            mode: 'markers',
            marker: {
                size: 15,
                color: '#ffc107',
                symbol: 'diamond',
                line: {
                    color: '#ff9800',
                    width: 2
                }
            },
            name: '中心点',
            type: 'scatter3d',
            hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<br>Z: %{z:.3f}<extra></extra>'
        });
    }

    // Get container dimensions
    const container = document.getElementById('hand-3d-chart');
    const containerHeight = container ? container.clientHeight : 600;
    const containerWidth = container ? container.clientWidth : window.innerWidth;

    // Calculate axis ranges based on center and expand distances
    const center = hand3dSettings.center;
    const expand = hand3dSettings.expand;

    // Calculate tick interval based on expand (aim for ~5 ticks per axis)
    const tickInterval = Math.max(expand.x, expand.y, expand.z) / 2.5;
    const dtick = Math.round(tickInterval * 100) / 100; // Round to 2 decimal places

    const layout = {
        scene: {
            xaxis: {
                title: 'X (m)',
                showgrid: true,
                gridcolor: '#444444',
                color: '#cccccc',
                backgroundcolor: '#1a1a1a',
                range: [center.x - expand.x, center.x + expand.x],
                autorange: false,
                dtick: dtick
            },
            yaxis: {
                title: 'Y (m)',
                showgrid: true,
                gridcolor: '#444444',
                color: '#cccccc',
                backgroundcolor: '#1a1a1a',
                range: [center.y - expand.y, center.y + expand.y],
                autorange: false,
                dtick: dtick
            },
            zaxis: {
                title: 'Z (m)',
                showgrid: true,
                gridcolor: '#444444',
                color: '#cccccc',
                backgroundcolor: '#1a1a1a',
                range: [center.z - expand.z, center.z + expand.z],
                autorange: false,
                dtick: dtick
            },
            aspectmode: 'cube',
            bgcolor: '#1a1a1a',
            camera: savedCameraState || {
                center: { x: 0, y: 0, z: 0 },
                eye: { x: 1.5, y: 1.5, z: 1.0 }
            }
        },
        paper_bgcolor: '#2d2d2d',
        plot_bgcolor: '#1a1a1a',
        showlegend: true,
        legend: {
            x: 0,
            y: 1,
            bgcolor: 'rgba(45, 45, 45, 0.9)',
            bordercolor: '#666666',
            font: { color: '#ffffff' }
        },
        margin: { l: 0, r: 0, t: 30, b: 0 },
        width: containerWidth,
        height: containerHeight,
        autosize: false
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

    Plotly.react('hand-3d-chart', traces, layout, config).then(function() {
        const plotDiv = document.getElementById('hand-3d-chart');

        // If no saved camera state yet, save the initial one
        if (!savedCameraState && plotDiv.layout && plotDiv.layout.scene && plotDiv.layout.scene.camera) {
            savedCameraState = JSON.parse(JSON.stringify(plotDiv.layout.scene.camera));
            console.log('Initial camera state saved:', savedCameraState);
        }

        // Only add listener once to avoid multiple listeners
        if (!cameraListenerAdded) {
            console.log('Adding camera event listener');
            plotDiv.on('plotly_relayout', function(eventData) {
                console.log('plotly_relayout event fired:', eventData);

                // Check if camera was changed by user interaction
                if (eventData['scene.camera']) {
                    savedCameraState = JSON.parse(JSON.stringify(eventData['scene.camera']));
                    console.log('Camera state updated from scene.camera:', savedCameraState);
                }
                // Sometimes the camera change comes in a different format
                else if (eventData['scene.camera.eye'] || eventData['scene.camera.center'] || eventData['scene.camera.up']) {
                    // Reconstruct camera object from individual properties
                    if (!savedCameraState) {
                        savedCameraState = { eye: {}, center: {}, up: {} };
                    }

                    if (eventData['scene.camera.eye.x'] !== undefined) {
                        savedCameraState.eye = {
                            x: eventData['scene.camera.eye.x'],
                            y: eventData['scene.camera.eye.y'],
                            z: eventData['scene.camera.eye.z']
                        };
                    }
                    if (eventData['scene.camera.center.x'] !== undefined) {
                        savedCameraState.center = {
                            x: eventData['scene.camera.center.x'],
                            y: eventData['scene.camera.center.y'],
                            z: eventData['scene.camera.center.z']
                        };
                    }
                    if (eventData['scene.camera.up.x'] !== undefined) {
                        savedCameraState.up = {
                            x: eventData['scene.camera.up.x'],
                            y: eventData['scene.camera.up.y'],
                            z: eventData['scene.camera.up.z']
                        };
                    }
                    console.log('Camera state updated from individual properties:', savedCameraState);
                }
            });
            cameraListenerAdded = true;
        }
    });
}

function addHandTraces(traces, landmarks, name, jointColor, boneColor) {
    // Extract coordinates
    const x = landmarks.map(p => p[0]);
    const y = landmarks.map(p => p[1]);
    const z = landmarks.map(p => p[2]);

    // Add joint points
    traces.push({
        x: x,
        y: y,
        z: z,
        mode: 'markers',
        marker: {
            size: hand3dSettings.jointSize,
            color: jointColor,
            opacity: 0.9
        },
        name: `${name} 关节`,
        type: 'scatter3d',
        hovertemplate: 'X: %{x:.4f}<br>Y: %{y:.4f}<br>Z: %{z:.4f}<extra></extra>'
    });

    // Add fingertip highlights (0-4: thumb, index, middle, ring, pinky tips)
    const fingertips = [0, 1, 2, 3, 4];
    traces.push({
        x: fingertips.map(i => landmarks[i][0]),
        y: fingertips.map(i => landmarks[i][1]),
        z: fingertips.map(i => landmarks[i][2]),
        mode: 'markers',
        marker: {
            size: hand3dSettings.jointSize * 1.5,
            color: [
                FINGER_COLORS.thumb,   // 0: thumb tip - red
                FINGER_COLORS.index,   // 1: index tip - orange
                FINGER_COLORS.middle,  // 2: middle tip - yellow
                FINGER_COLORS.ring,    // 3: ring tip - green
                FINGER_COLORS.pinky    // 4: pinky tip - blue
            ],
            opacity: 0.9
        },
        name: `${name} 指尖`,
        type: 'scatter3d',
        showlegend: false
    });

    // Add bone connections
    for (const [i, j] of HAND_CONNECTIONS) {
        traces.push({
            x: [landmarks[i][0], landmarks[j][0]],
            y: [landmarks[i][1], landmarks[j][1]],
            z: [landmarks[i][2], landmarks[j][2]],
            mode: 'lines',
            line: {
                color: getFingerColor(i, j),
                width: hand3dSettings.boneWidth
            },
            type: 'scatter3d',
            showlegend: false,
            hoverinfo: 'skip'
        });
    }

    // Add wrist marker (index 5)
    traces.push({
        x: [landmarks[5][0]],
        y: [landmarks[5][1]],
        z: [landmarks[5][2]],
        mode: 'markers',
        marker: {
            size: hand3dSettings.jointSize * 1.8,
            color: '#6c757d',
            symbol: 'diamond'
        },
        name: `${name} 手腕`,
        type: 'scatter3d',
        showlegend: false
    });

    // Add palm center marker (index 20)
    traces.push({
        x: [landmarks[20][0]],
        y: [landmarks[20][1]],
        z: [landmarks[20][2]],
        mode: 'markers',
        marker: {
            size: hand3dSettings.jointSize * 1.3,
            color: '#9ca3af',
            symbol: 'circle'
        },
        name: `${name} 手掌中心`,
        type: 'scatter3d',
        showlegend: false
    });
}

// Get gradient color based on force percentage (0-1)
// Linear gradient: Green (0%) -> Red (100%)
function getForceColor(percentage) {
    const p = Math.min(1, Math.max(0, percentage));
    
    // Simple linear interpolation: Green to Red
    const r = Math.round(255 * p);        // 0 -> 255
    const g = Math.round(255 * (1 - p));  // 255 -> 0
    const b = 0;
    
    return `rgb(${r}, ${g}, ${b})`;
}

function updateForceIndicator() {
    if (!playerData) return;

    // Find force value at current position (using aligned haptic timestamps)
    const hapticIndex = findNearestFrameIndex(playerData.haptic_timestamps_aligned, currentPosition);

    // Get denormalized force value
    // haptic_normalized is normalized between 0 and 1, we need to denormalize it
    // Using the range from the original data
    let currentForce = 0;

    if (hapticIndex >= 0 && hapticIndex < playerData.haptic_normalized.length) {
        // Approximate denormalization - we'll need to track the original range
        // For now, assume linear mapping to 0-150N range based on normalized value
        const normalizedValue = playerData.haptic_normalized[hapticIndex];
        // Better approach: use the actual haptic force range if available
        if (playerData.haptic_force_range) {
            currentForce = playerData.haptic_force_range[0] +
                          normalizedValue * (playerData.haptic_force_range[1] - playerData.haptic_force_range[0]);
        } else {
            // Fallback: assume 0-150N range
            currentForce = normalizedValue * 150;
        }
    }

    // Get max force from user input
    const maxForceInput = document.getElementById('max-force-input');
    const maxForce = maxForceInput ? parseFloat(maxForceInput.value) || 150 : 150;
    
    const percentage = Math.min(100, (currentForce / maxForce) * 100);
    const normalizedPercentage = percentage / 100; // 0-1 for color calculation

    const fillBar = document.getElementById('force-fill-bar');
    const valueDisplay = document.getElementById('force-value-display');

    // Get gradient color based on force level
    const forceColor = getForceColor(normalizedPercentage);

    if (fillBar) {
        fillBar.style.height = `${percentage}%`;
        fillBar.style.background = forceColor;
    }

    if (valueDisplay) {
        valueDisplay.textContent = `${currentForce.toFixed(1)}N`;
        valueDisplay.style.color = forceColor;
    }
}

function findNearestFrameIndex(timestamps, targetTime) {
    if (timestamps.length === 0) return 0;

    let nearestIndex = 0;
    let minDiff = Math.abs(timestamps[0] - targetTime);

    for (let i = 1; i < timestamps.length; i++) {
        const diff = Math.abs(timestamps[i] - targetTime);
        if (diff < minDiff) {
            minDiff = diff;
            nearestIndex = i;
        }
    }

    return nearestIndex;
}

function filterDataInRange(timestamps, values, xMin, xMax) {
    const filteredX = [];
    const filteredY = [];

    for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] >= xMin && timestamps[i] <= xMax) {
            filteredX.push(timestamps[i]);
            filteredY.push(values[i]);
        }
    }

    return { x: filteredX, y: filteredY };
}

// Update timeline slider appearance
function updateSliderProgress() {
    const min = parseFloat(timelineSlider.min);
    const max = parseFloat(timelineSlider.max);
    const val = parseFloat(timelineSlider.value);
    const progress = ((val - min) / (max - min)) * 100;
    timelineSlider.style.setProperty('--progress', `${progress}%`);
}

// Timeline slider handler
timelineSlider.addEventListener('input', function(e) {
    currentPosition = parseFloat(e.target.value);
    currentTimeDisplay.textContent = formatTime(currentPosition);
    updateSliderProgress();

    // Update X range inputs
    if (windowSize > 0) {
        xMinInput.value = currentPosition.toFixed(2);
        xMaxInput.value = (currentPosition + windowSize).toFixed(2);
    }

    renderPlot();
});

// Play/Pause button handler
playBtn.addEventListener('click', function() {
    if (isPlaying) {
        pausePlayback();
    } else {
        startPlayback();
    }
});

// Stop button handler
stopBtn.addEventListener('click', function() {
    stopPlayback();
});

function startPlayback() {
    if (!playerData) return;

    isPlaying = true;
    playIcon.textContent = '⏸';
    playText.textContent = '暂停';
    playText.setAttribute('data-i18n', 'player.control.pause');

    const startTime = playerData.time_range[0];
    const endTime = playerData.time_range[1];
    const frameInterval = 50; // 50ms per frame = 20fps
    const timeStep = (frameInterval / 1000) * playbackSpeed;

    playInterval = setInterval(() => {
        currentPosition += timeStep;

        if (currentPosition >= endTime) {
            currentPosition = startTime;
        }

        timelineSlider.value = currentPosition;
        currentTimeDisplay.textContent = formatTime(currentPosition);
        updateSliderProgress();

        if (windowSize > 0) {
            xMinInput.value = currentPosition.toFixed(2);
            xMaxInput.value = (currentPosition + windowSize).toFixed(2);
        }

        renderPlot();
    }, frameInterval);
}

function pausePlayback() {
    isPlaying = false;
    playIcon.textContent = '▶';
    playText.textContent = '播放';
    playText.setAttribute('data-i18n', 'player.control.play');

    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }
}

function stopPlayback() {
    pausePlayback();

    if (playerData) {
        currentPosition = playerData.time_range[0];
        timelineSlider.value = currentPosition;
        currentTimeDisplay.textContent = formatTime(currentPosition);
        updateSliderProgress();

        if (windowSize > 0) {
            xMinInput.value = currentPosition.toFixed(2);
            xMaxInput.value = (currentPosition + windowSize).toFixed(2);
        }

        renderPlot();
    }
}

// Playback speed handler
playbackSpeedSelect.addEventListener('change', function(e) {
    playbackSpeed = parseFloat(e.target.value);

    // Restart playback with new speed if currently playing
    if (isPlaying) {
        pausePlayback();
        startPlayback();
    }
});

// Window size apply handler
applyWindowBtn.addEventListener('click', function() {
    windowSize = parseFloat(windowSizeInput.value) || 0;

    if (windowSize > 0) {
        xMinInput.value = currentPosition.toFixed(2);
        xMaxInput.value = (currentPosition + windowSize).toFixed(2);
    } else if (playerData) {
        xMinInput.value = playerData.time_range[0].toFixed(2);
        xMaxInput.value = playerData.time_range[1].toFixed(2);
    }

    // Save window size
    localStorage.setItem(STORAGE_KEYS.WINDOW_SIZE, windowSize);

    renderPlot();
});

// Apply range handler
applyRangeBtn.addEventListener('click', function() {
    const xMin = parseFloat(xMinInput.value);
    const xMax = parseFloat(xMaxInput.value);

    if (!isNaN(xMin) && !isNaN(xMax) && xMax > xMin) {
        currentPosition = xMin;
        windowSize = xMax - xMin;
        windowSizeInput.value = windowSize.toFixed(1);

        timelineSlider.value = currentPosition;
        currentTimeDisplay.textContent = formatTime(currentPosition);
        updateSliderProgress();
    }

    renderPlot();
});

// Reset range handler
resetRangeBtn.addEventListener('click', function() {
    if (!playerData) return;

    windowSize = 10;
    windowSizeInput.value = windowSize;

    yMinInput.value = '-0.1';
    yMaxInput.value = '1.1';

    currentPosition = playerData.time_range[0];
    timelineSlider.value = currentPosition;
    currentTimeDisplay.textContent = formatTime(currentPosition);
    updateSliderProgress();

    xMinInput.value = currentPosition.toFixed(2);
    xMaxInput.value = (currentPosition + windowSize).toFixed(2);

    // Reset camera state for 3D view
    savedCameraState = null;

    renderPlot();
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (!playerData) return;

    // Don't capture if typing in input
    if (e.target.tagName === 'INPUT') return;

    switch (e.key) {
        case ' ':  // Space - play/pause
            e.preventDefault();
            if (isPlaying) {
                pausePlayback();
            } else {
                startPlayback();
            }
            break;
        case 'ArrowLeft':  // Left arrow - seek backward
            e.preventDefault();
            currentPosition = Math.max(playerData.time_range[0], currentPosition - 1);
            timelineSlider.value = currentPosition;
            currentTimeDisplay.textContent = formatTime(currentPosition);
            updateSliderProgress();
            renderPlot();
            break;
        case 'ArrowRight':  // Right arrow - seek forward
            e.preventDefault();
            currentPosition = Math.min(playerData.time_range[1], currentPosition + 1);
            timelineSlider.value = currentPosition;
            currentTimeDisplay.textContent = formatTime(currentPosition);
            updateSliderProgress();
            renderPlot();
            break;
        case 'Home':  // Home - go to start
            e.preventDefault();
            stopPlayback();
            break;
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkFormValidity();

    // 3D settings controls
    const jointSizeSlider = document.getElementById('hand3d-joint-size');
    const boneWidthSlider = document.getElementById('hand3d-bone-width');
    const jointSizeValue = document.getElementById('joint-size-value');
    const boneWidthValue = document.getElementById('bone-width-value');
    const applyHand3dBtn = document.getElementById('apply-hand3d-settings');

    // Update display values when sliders change
    if (jointSizeSlider) {
        jointSizeSlider.addEventListener('input', function() {
            jointSizeValue.textContent = this.value;
        });
    }

    if (boneWidthSlider) {
        boneWidthSlider.addEventListener('input', function() {
            boneWidthValue.textContent = this.value;
        });
    }

    // Apply 3D settings button
    if (applyHand3dBtn) {
        applyHand3dBtn.addEventListener('click', function() {
            // Get size values
            const jointSize = parseInt(jointSizeSlider.value) || 6;
            const boneWidth = parseInt(boneWidthSlider.value) || 4;

            // Get center point values
            const centerX = parseFloat(document.getElementById('center-x').value) || 0;
            const centerY = parseFloat(document.getElementById('center-y').value) || 0;
            const centerZ = parseFloat(document.getElementById('center-z').value) || 0;

            // Get expand distances
            const expandX = parseFloat(document.getElementById('expand-x').value) || 0.3;
            const expandY = parseFloat(document.getElementById('expand-y').value) || 0.3;
            const expandZ = parseFloat(document.getElementById('expand-z').value) || 0.3;

            const showCenter = document.getElementById('show-ref-point').checked;

            // Update settings
            hand3dSettings = {
                jointSize: jointSize,
                boneWidth: boneWidth,
                center: { x: centerX, y: centerY, z: centerZ },
                expand: { x: expandX, y: expandY, z: expandZ },
                showCenter: showCenter
            };

            // Save settings
            saveSettings();

            // Re-render
            if (playerData) {
                renderHand3D();
            }

            console.log('3D settings updated:', hand3dSettings);
        });
    }

    // Max force input handler - update display when changed
    const maxForceInput = document.getElementById('max-force-input');
    if (maxForceInput) {
        maxForceInput.addEventListener('change', function() {
            // Save the new value
            localStorage.setItem(STORAGE_KEYS.MAX_FORCE, this.value);
            
            // Update the force indicator if data is loaded
            if (playerData) {
                updateForceIndicator();
            }
            
            console.log('Max force updated to:', this.value);
        });
        
        // Also update on input for immediate feedback
        maxForceInput.addEventListener('input', function() {
            if (playerData) {
                updateForceIndicator();
            }
        });
    }

    // GIF Recording button handler
    const recordGifBtn = document.getElementById('record-gif-btn');
    if (recordGifBtn) {
        recordGifBtn.addEventListener('click', startGifRecording);
    }

    // Load saved settings on page load
    loadSettings();

    console.log('Aria-Haptic Data Player initialized');
});

// GIF Recording functions
async function startGifRecording() {
    if (!playerData) {
        alert('请先加载数据');
        return;
    }
    
    if (isRecording) {
        console.log('Already recording');
        return;
    }
    
    const durationInput = document.getElementById('record-duration');
    const fpsSelect = document.getElementById('record-fps');
    const recordBtn = document.getElementById('record-gif-btn');
    const recordStatus = document.getElementById('record-status');
    const recordProgress = document.getElementById('record-progress');
    
    const duration = parseFloat(durationInput.value) || 5;
    const fps = parseInt(fpsSelect.value) || 10;
    const totalFrames = duration * fps;
    const frameInterval = 1000 / fps;
    
    console.log(`Starting GIF recording: ${duration}s at ${fps}fps = ${totalFrames} frames`);
    
    // Update UI
    isRecording = true;
    recordedFrames = [];
    recordBtn.disabled = true;
    recordBtn.innerHTML = '<span>⏺</span> <span>录制中...</span>';
    recordBtn.style.background = '#95a5a6';
    recordStatus.style.display = 'inline';
    
    // Save current position
    const startPosition = currentPosition;
    const timeStep = 1 / fps * playbackSpeed;
    
    // Get the container to capture (3D chart + force indicator)
    const hand3dChart = document.getElementById('hand-3d-chart');
    const forceContainer = hand3dChart.parentElement;
    
    try {
        // Capture frames
        for (let i = 0; i < totalFrames; i++) {
            // Update progress
            const progress = Math.round((i / totalFrames) * 100);
            recordProgress.textContent = `录制中... ${progress}%`;
            
            // Update position and render
            currentPosition = startPosition + (i * timeStep);
            if (currentPosition > playerData.time_range[1]) {
                currentPosition = playerData.time_range[0] + (currentPosition - playerData.time_range[1]);
            }
            
            timelineSlider.value = currentPosition;
            currentTimeDisplay.textContent = formatTime(currentPosition);
            updateSliderProgress();
            
            // Render the frame
            await renderPlotAsync();
            
            // Wait a bit for render to complete
            await sleep(50);
            
            // Capture the frame
            try {
                const canvas = await html2canvas(forceContainer, {
                    backgroundColor: '#ffffff',
                    scale: 1,
                    logging: false,
                    useCORS: true,
                    allowTaint: true
                });
                recordedFrames.push(canvas);
            } catch (e) {
                console.error('Frame capture error:', e);
            }
            
            // Small delay between frames
            await sleep(frameInterval - 50);
        }
        
        recordProgress.textContent = '生成 GIF 中...';
        
        // Generate GIF
        await generateGif(fps);
        
    } catch (error) {
        console.error('Recording error:', error);
        alert('录制失败: ' + error.message);
    } finally {
        // Reset UI
        isRecording = false;
        recordBtn.disabled = false;
        recordBtn.innerHTML = '<span>🎬</span> <span>录制 GIF</span>';
        recordBtn.style.background = '#e74c3c';
        recordStatus.style.display = 'none';
        
        // Restore position
        currentPosition = startPosition;
        timelineSlider.value = currentPosition;
        currentTimeDisplay.textContent = formatTime(currentPosition);
        updateSliderProgress();
        renderPlot();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function renderPlotAsync() {
    return new Promise(resolve => {
        renderPlot();
        // Give Plotly time to render
        setTimeout(resolve, 30);
    });
}

async function generateGif(fps) {
    return new Promise((resolve, reject) => {
        if (recordedFrames.length === 0) {
            reject(new Error('No frames captured'));
            return;
        }
        
        console.log(`Generating GIF from ${recordedFrames.length} frames`);
        
        // Create GIF
        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: recordedFrames[0].width,
            height: recordedFrames[0].height,
            workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
        });
        
        // Add frames
        const delay = Math.round(1000 / fps);
        for (const canvas of recordedFrames) {
            gif.addFrame(canvas, { delay: delay });
        }
        
        gif.on('finished', function(blob) {
            console.log('GIF generated, size:', blob.size);
            
            // Download the GIF
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hand_tracking_${new Date().toISOString().slice(0,19).replace(/[:-]/g, '')}.gif`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            resolve();
        });
        
        gif.on('progress', function(p) {
            const recordProgress = document.getElementById('record-progress');
            if (recordProgress) {
                recordProgress.textContent = `生成 GIF 中... ${Math.round(p * 100)}%`;
            }
        });
        
        gif.render();
    });
}
