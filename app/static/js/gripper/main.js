/**
 * Main entry point for gripper visualization
 * Integrates all modules and manages the application lifecycle
 */

import { SceneManager } from './sceneManager.js';
import { ModelLoader } from './modelLoader.js';
import { HandRenderer } from './handRenderer.js';
import { ConfigManager } from './configManager.js';
import { TimelineManager } from './timelineManager.js';
import { UIController } from './uiController.js';

class GripperVisualization {
    constructor() {
        // Initialize modules
        this.sceneManager = null;
        this.modelLoader = new ModelLoader();
        this.handRenderer = null;
        this.configManager = new ConfigManager();
        this.timelineManager = new TimelineManager();
        this.uiController = new UIController();

        // Data
        this.handLandmarksData = null;
        this.urdfData = null;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing gripper visualization...');

        // Initialize UI
        this.uiController.init();

        // Load saved file info
        const savedInfo = this.configManager.loadSavedFileInfo();
        if (savedInfo && savedInfo.hasSavedInfo) {
            this.uiController.applySavedFileInfo(savedInfo);
        }

        // Apply saved settings to UI
        this.uiController.applySettings(this.configManager.getSettings());

        // Attach event listeners
        this.attachEventListeners();

        console.log('Gripper visualization initialized');
    }

    /**
     * Attach all event listeners
     */
    attachEventListeners() {
        const ui = this.uiController;

        // File input handlers
        ui.attachFileInputListeners({
            onMpsFileChange: (e) => this.handleFileChange(e, 'mps'),
            onUrdfFileChange: (e) => this.handleFileChange(e, 'urdf'),
            onStlFilesChange: (e) => this.handleFileChange(e, 'stl'),
            onConfigFileChange: (e) => this.handleConfigFileChange(e)
        });

        // Form submission
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Settings controls
        const scaleSlider = document.getElementById('scale-slider');
        if (scaleSlider) {
            scaleSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                document.getElementById('scale-value').textContent = value.toFixed(1);
                this.configManager.updateSettings({ scale: value });
            });
        }

        ['offset-x', 'offset-y', 'offset-z'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', (e) => {
                    const key = id.replace('offset-', 'offset') + id.slice(-1).toUpperCase();
                    this.configManager.updateSettings({ [key]: parseFloat(e.target.value) || 0 });
                });
            }
        });

        const showSkeleton = document.getElementById('show-skeleton');
        if (showSkeleton) {
            showSkeleton.addEventListener('change', (e) => {
                this.configManager.updateSettings({ showSkeleton: e.target.checked });
            });
        }

        const showGripper = document.getElementById('show-gripper');
        if (showGripper) {
            showGripper.addEventListener('change', (e) => {
                this.configManager.updateSettings({ showGripper: e.target.checked });
                this.modelLoader.setVisibility(e.target.checked);
            });
        }

        // Apply settings button
        const applyBtn = document.getElementById('apply-settings');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                console.log('Settings applied:', this.configManager.getSettings());
            });
        }

        // Config buttons
        const downloadConfigBtn = document.getElementById('download-config-btn');
        if (downloadConfigBtn) {
            downloadConfigBtn.addEventListener('click', () => this.exportConfig());
        }

        const loadSavedConfigBtn = document.getElementById('load-saved-config-btn');
        if (loadSavedConfigBtn) {
            loadSavedConfigBtn.addEventListener('click', () => this.loadSavedConfig());
        }

        // Playback controls
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                if (this.timelineManager.getIsPlaying()) {
                    this.timelineManager.pause();
                } else {
                    this.timelineManager.play();
                }
            });
        }

        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.timelineManager.stop());
        }

        const playbackSpeed = document.getElementById('playback-speed');
        if (playbackSpeed) {
            playbackSpeed.addEventListener('change', (e) => {
                this.timelineManager.setSpeed(parseFloat(e.target.value));
            });
        }

        const timelineSlider = document.getElementById('timeline-slider');
        if (timelineSlider) {
            timelineSlider.addEventListener('input', (e) => {
                this.timelineManager.seekToFrame(parseFloat(e.target.value));
            });
        }

        // Window resize
        window.addEventListener('resize', () => {
            if (this.sceneManager) {
                this.sceneManager.onResize();
            }
        });

        // Timeline frame change callback
        this.timelineManager.onFrameChange((frameIndex) => {
            this.renderFrame(frameIndex);
        });
    }

    /**
     * Handle file input change
     */
    handleFileChange(e, type) {
        const files = e.target.files;
        console.log(`File change event: type=${type}, files count=${files ? files.length : 0}`);
        if (type === 'mps') {
            this.uiController.updateFileInfo('mps', files[0]);
        } else if (type === 'urdf') {
            this.uiController.updateFileInfo('urdf', files[0]);
        } else if (type === 'stl') {
            // Filter to only include .stl files (for folder upload)
            const stlFiles = [];
            if (files) {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (file.name.toLowerCase().endsWith('.stl')) {
                        stlFiles.push(file);
                    }
                }
            }
            console.log(`STL files filtered: ${stlFiles.length} files`);
            this.uiController.updateFileInfo('stl', stlFiles.length > 0 ? stlFiles : files);
        }
        this.uiController.checkFormValidity();
    }

    /**
     * Handle config file upload
     */
    async handleConfigFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.uiController.showConfigStatus('正在加载配置文件...', 'info');

        try {
            const config = await this.configManager.loadConfigFromFile(file);
            this.uiController.applySettings(config.mapping_settings || {});
            this.uiController.showConfigStatus('配置文件加载成功！', 'success');
        } catch (error) {
            this.uiController.showConfigStatus('加载配置文件失败: ' + error.message, 'error');
        }
    }

    /**
     * Handle form submission
     */
    async handleSubmit(e) {
        e.preventDefault();

        this.uiController.setLoading(true);
        this.uiController.hideError();

        try {
            const formData = new FormData();
            const { mpsFile, urdfFile, stlFiles } = this.uiController.getFormData();

            if (mpsFile) {
                formData.append('mps_file', mpsFile);
            }
            if (urdfFile) {
                formData.append('urdf_file', urdfFile);
            }
            if (stlFiles && stlFiles.length > 0) {
                for (let i = 0; i < stlFiles.length; i++) {
                    formData.append('stl_files', stlFiles[i]);
                }
            }

            // Send request to server
            const response = await fetch('/gripper/data', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || '加载数据失败');
            }

            const data = await response.json();

            // Store data
            this.handLandmarksData = data.hand_landmarks || null;
            this.urdfData = data.urdf || null;

            // Show visualization section
            this.uiController.showVisualization(true);

            // Wait for layout update, then initialize scene
            setTimeout(async () => {
                await this.initializeVisualization(data);
                this.configManager.saveFileInfo(mpsFile, urdfFile, stlFiles);
            }, 100);

        } catch (error) {
            console.error('Error in form submission:', error);
            this.uiController.showError(error.message || String(error));
        } finally {
            this.uiController.setLoading(false);
        }
    }

    /**
     * Initialize visualization after data is loaded
     */
    async initializeVisualization(data) {
        // Initialize scene
        this.sceneManager = new SceneManager('gripper-canvas');
        if (!this.sceneManager.init()) {
            throw new Error('Failed to initialize scene');
        }

        this.handRenderer = new HandRenderer(this.sceneManager.getScene());

        // Load gripper models
        if (this.urdfData && data.stl_file_map) {
            // Merge stl_file_map with stl_file_map_case_insensitive for better matching
            const mergedStlFileMap = { ...data.stl_file_map };
            if (data.stl_file_map_case_insensitive) {
                // Add lowercase mappings
                for (const [key, value] of Object.entries(data.stl_file_map_case_insensitive)) {
                    mergedStlFileMap[key] = value;
                }
            }
            await this.modelLoader.loadFromURDF(this.urdfData, mergedStlFileMap, this.sceneManager.getScene());
        } else if (data.stl_urls && data.stl_urls.length > 0) {
            await this.modelLoader.loadSTLModels(data.stl_urls, data.stl_files || [], this.sceneManager.getScene());
        }

        // Initialize timeline
        const timestamps = this.handLandmarksData?.timestamps ||
                         (this.handLandmarksData?.right_hand ?
                          Array.from({ length: this.handLandmarksData.right_hand.length }, (_, i) => i * 0.1) :
                          []);
        this.timelineManager.init(timestamps);

        // Adjust camera
        if (this.handLandmarksData?.right_hand && this.handLandmarksData.right_hand.length > 0) {
            this.sceneManager.adjustCameraToLandmarks(this.handLandmarksData.right_hand[0]);
        }

        // Start animation loop
        this.sceneManager.startAnimation(() => {
            const frameIndex = this.timelineManager.getCurrentFrame();
            this.renderFrame(frameIndex);
        });
    }

    /**
     * Render a specific frame
     */
    renderFrame(frameIndex) {
        if (!this.handLandmarksData?.right_hand || frameIndex >= this.handLandmarksData.right_hand.length) {
            // No data, just position gripper at origin
            this.modelLoader.positionModels(new THREE.Vector3(0, 0, 0));
            return;
        }

        const landmarks = this.handLandmarksData.right_hand[frameIndex];
        if (!landmarks || landmarks.length !== 21) return;

        const settings = this.configManager.getSettings();
        const mapped = this.handRenderer.mapHandToGripper(landmarks, settings);
        if (!mapped) return;

        // Position gripper at origin (hand landmarks are relative)
        const position = new THREE.Vector3(
            settings.offsetX,
            settings.offsetY,
            settings.offsetZ
        );
        this.modelLoader.positionModels(position);

        // Render hand landmarks
        if (settings.showSkeleton) {
            this.handRenderer.renderLandmarks(mapped.landmarks, settings.showSkeleton);
        } else {
            this.handRenderer.clear();
        }
    }

    /**
     * Export configuration
     */
    exportConfig() {
        const { mpsFile, urdfFile, stlFiles } = this.uiController.getFormData();
        const success = this.configManager.exportConfig(mpsFile, urdfFile, stlFiles);
        if (success) {
            this.uiController.showConfigStatus('配置已导出', 'success');
        } else {
            this.uiController.showConfigStatus('导出配置失败', 'error');
        }
    }

    /**
     * Load saved configuration
     */
    loadSavedConfig() {
        const config = this.configManager.loadSavedConfig();
        if (config) {
            this.uiController.applySettings(config.mapping_settings || {});
            this.uiController.showConfigStatus('已加载保存的配置', 'success');
        } else {
            this.uiController.showConfigStatus('没有找到保存的配置', 'info');
        }
    }

    /**
     * Cleanup and dispose resources to prevent memory leaks
     */
    dispose() {
        console.log('Disposing gripper visualization...');

        // Stop animation
        if (this.sceneManager) {
            this.sceneManager.stopAnimation();
        }

        // Stop timeline
        if (this.timelineManager) {
            this.timelineManager.dispose();
        }

        // Clear UI event listeners
        if (this.uiController) {
            this.uiController.dispose();
        }

        // Clear hand renderer
        if (this.handRenderer) {
            this.handRenderer.clear();
        }

        // Clear models - dispose geometries and materials to prevent memory leaks
        const models = this.modelLoader.getModels();
        models.forEach(model => {
            if (model.geometry) {
                model.geometry.dispose();
            }
            if (model.material) {
                if (Array.isArray(model.material)) {
                    model.material.forEach(mat => mat.dispose());
                } else {
                    model.material.dispose();
                }
            }
        });

        // Clear scene
        if (this.sceneManager) {
            const scene = this.sceneManager.getScene();
            if (scene) {
                // Dispose all geometries and materials in scene
                scene.traverse((object) => {
                    if (object.geometry) {
                        object.geometry.dispose();
                    }
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(mat => mat.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                });
            }

            // Dispose renderer
            const renderer = this.sceneManager.getRenderer();
            if (renderer) {
                renderer.dispose();
            }
        }

        console.log('Gripper visualization disposed');
    }
}

// Initialize on page load
let app = null;

document.addEventListener('DOMContentLoaded', function() {
    app = new GripperVisualization();
    app.init();
});

// Cleanup on page unload to prevent memory leaks
window.addEventListener('beforeunload', function() {
    if (app) {
        app.dispose();
    }
});

// Export for debugging
window.gripperApp = app;
