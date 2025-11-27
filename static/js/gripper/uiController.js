/**
 * UI Controller - Handles UI interactions and events
 */

export class UIController {
    constructor() {
        this.elements = {};
        this.fileChangeHandlers = {};
        this.filteredStlFiles = null;  // Store filtered STL files
    }

    /**
     * Initialize UI elements
     */
    init() {
        // File inputs
        this.elements.mpsFileInput = document.getElementById('mps_file');
        this.elements.urdfFileInput = document.getElementById('urdf_file');
        this.elements.stlFilesInput = document.getElementById('stl_files');
        this.elements.stlFolderInput = document.getElementById('stl_folder');
        this.elements.configFileInput = document.getElementById('config_file');

        // File info displays
        this.elements.mpsFileInfo = document.getElementById('mps-file-info');
        this.elements.urdfFileInfo = document.getElementById('urdf-file-info');
        this.elements.stlFileInfo = document.getElementById('stl-file-info');
        this.elements.stlFileList = document.getElementById('stl-file-list');

        // Buttons
        this.elements.loadBtn = document.getElementById('loadBtn');
        this.elements.downloadConfigBtn = document.getElementById('download-config-btn');
        this.elements.loadSavedConfigBtn = document.getElementById('load-saved-config-btn');
        this.elements.applySettingsBtn = document.getElementById('apply-settings');

        // Control sliders and inputs
        this.elements.scaleSlider = document.getElementById('scale-slider');
        this.elements.scaleValue = document.getElementById('scale-value');
        this.elements.offsetX = document.getElementById('offset-x');
        this.elements.offsetY = document.getElementById('offset-y');
        this.elements.offsetZ = document.getElementById('offset-z');
        this.elements.showSkeleton = document.getElementById('show-skeleton');
        this.elements.showGripper = document.getElementById('show-gripper');

        // Playback controls
        this.elements.playPauseBtn = document.getElementById('play-pause-btn');
        this.elements.stopBtn = document.getElementById('stop-btn');
        this.elements.playbackSpeed = document.getElementById('playback-speed');
        this.elements.timelineSlider = document.getElementById('timeline-slider');

        // Sections
        this.elements.loadingIndicator = document.getElementById('loadingIndicator');
        this.elements.visualizationSection = document.getElementById('visualizationSection');
        this.elements.errorSection = document.getElementById('errorSection');
        this.elements.errorMessage = document.getElementById('errorMessage');
        this.elements.configStatus = document.getElementById('config-status');

        return this.elements;
    }

    /**
     * Attach event listeners for file inputs
     */
    attachFileInputListeners(handlers) {
        this.fileChangeHandlers = handlers;

        if (this.elements.mpsFileInput && handlers.onMpsFileChange) {
            this.elements.mpsFileInput.addEventListener('change', handlers.onMpsFileChange);
        }
        if (this.elements.urdfFileInput && handlers.onUrdfFileChange) {
            this.elements.urdfFileInput.addEventListener('change', handlers.onUrdfFileChange);
        }
        if (this.elements.stlFilesInput && handlers.onStlFilesChange) {
            this.elements.stlFilesInput.addEventListener('change', handlers.onStlFilesChange);
        }
        if (this.elements.stlFolderInput && handlers.onStlFilesChange) {
            this.elements.stlFolderInput.addEventListener('change', handlers.onStlFilesChange);
        }
        if (this.elements.configFileInput && handlers.onConfigFileChange) {
            this.elements.configFileInput.addEventListener('change', handlers.onConfigFileChange);
        }
    }

    /**
     * Update file info display
     */
    updateFileInfo(type, file) {
        const formatFileSize = (bytes) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        };

        if (type === 'mps' && this.elements.mpsFileInfo) {
            if (file) {
                this.elements.mpsFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
                this.elements.mpsFileInfo.style.color = '#28a745';
                this.elements.mpsFileInfo.style.fontStyle = 'normal';
            } else {
                this.elements.mpsFileInfo.textContent = '未选择文件（可仅上传夹爪模型测试显示）';
                this.elements.mpsFileInfo.style.color = '#6c757d';
            }
        } else if (type === 'urdf' && this.elements.urdfFileInfo) {
            if (file) {
                this.elements.urdfFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
                this.elements.urdfFileInfo.style.color = '#28a745';
                this.elements.urdfFileInfo.style.fontStyle = 'normal';
            } else {
                this.elements.urdfFileInfo.textContent = '未选择文件';
                this.elements.urdfFileInfo.style.color = '#6c757d';
            }
        } else if (type === 'stl' && this.elements.stlFileInfo) {
            // Handle both FileList and Array
            const fileCount = file ? (Array.isArray(file) ? file.length : file.length) : 0;
            // Store filtered files for later use
            this.filteredStlFiles = file;
            if (fileCount > 0) {
                this.elements.stlFileInfo.textContent = `已选择 ${fileCount} 个文件`;
                this.elements.stlFileInfo.style.color = '#28a745';
                this.elements.stlFileInfo.style.fontStyle = 'normal';

                // Show file list
                let fileListHtml = '<div style="margin-top: 5px; padding: 8px; background: #f8f9fa; border-radius: 4px;">';
                for (let i = 0; i < fileCount; i++) {
                    const f = Array.isArray(file) ? file[i] : file[i];
                    fileListHtml += `<div style="font-size: 0.85rem; margin: 3px 0;">${i + 1}. ${f.name} (${formatFileSize(f.size)})</div>`;
                }
                fileListHtml += '</div>';
                if (this.elements.stlFileList) {
                    this.elements.stlFileList.innerHTML = fileListHtml;
                }
            } else {
                this.filteredStlFiles = null;
                this.elements.stlFileInfo.textContent = '未选择文件（将仅显示手部关键点）';
                this.elements.stlFileInfo.style.color = '#6c757d';
                if (this.elements.stlFileList) {
                    this.elements.stlFileList.innerHTML = '';
                }
            }
        }
    }

    /**
     * Check form validity and enable/disable load button
     */
    checkFormValidity() {
        if (!this.elements.loadBtn) return;

        const hasMpsFile = this.elements.mpsFileInput && this.elements.mpsFileInput.files && this.elements.mpsFileInput.files.length > 0;
        const hasUrdfFile = this.elements.urdfFileInput && this.elements.urdfFileInput.files && this.elements.urdfFileInput.files.length > 0;
        const hasStlFiles = this.elements.stlFilesInput && this.elements.stlFilesInput.files && this.elements.stlFilesInput.files.length > 0;
        const hasStlFolder = this.elements.stlFolderInput && this.elements.stlFolderInput.files && this.elements.stlFolderInput.files.length > 0;
        const hasFilteredStl = this.filteredStlFiles && this.filteredStlFiles.length > 0;
        const hasConfigHint = this.elements.mpsFileInfo && (this.elements.mpsFileInfo.textContent.includes('配置中') || this.elements.mpsFileInfo.textContent.includes('上次使用'));

        const hasAnyFile = hasMpsFile || hasUrdfFile || hasStlFiles || hasStlFolder || hasFilteredStl;
        const shouldEnable = hasAnyFile || hasConfigHint;

        this.elements.loadBtn.disabled = !shouldEnable;
    }

    /**
     * Show/hide loading indicator
     */
    setLoading(isLoading) {
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.style.display = isLoading ? 'block' : 'none';
        }
        if (this.elements.loadBtn) {
            this.elements.loadBtn.disabled = isLoading;
        }
    }

    /**
     * Show/hide visualization section
     */
    showVisualization(show) {
        if (this.elements.visualizationSection) {
            this.elements.visualizationSection.style.display = show ? 'block' : 'none';
            if (show) {
                setTimeout(() => {
                    this.elements.visualizationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
        }
        if (this.elements.errorSection) {
            this.elements.errorSection.style.display = 'block';
            setTimeout(() => {
                this.elements.errorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }

    /**
     * Hide error message
     */
    hideError() {
        if (this.elements.errorSection) {
            this.elements.errorSection.style.display = 'none';
        }
    }

    /**
     * Show config status message
     */
    showConfigStatus(message, type = 'info') {
        if (!this.elements.configStatus) return;

        const colors = {
            success: { bg: '#d4edda', border: '#28a745', text: '#155724' },
            error: { bg: '#f8d7da', border: '#dc3545', text: '#721c24' },
            info: { bg: '#d1ecf1', border: '#17a2b8', text: '#0c5460' }
        };

        const color = colors[type] || colors.info;
        this.elements.configStatus.style.cssText = `padding: 8px 12px; background: ${color.bg}; border-left: 4px solid ${color.border}; border-radius: 4px; color: ${color.text}; font-weight: 500;`;
        this.elements.configStatus.textContent = message;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.elements.configStatus.textContent = '';
            this.elements.configStatus.style.cssText = '';
        }, 5000);
    }

    /**
     * Apply saved file info to UI
     */
    applySavedFileInfo(savedInfo) {
        if (savedInfo.mpsFilename && this.elements.mpsFileInfo) {
            this.elements.mpsFileInfo.textContent = `上次使用: ${savedInfo.mpsFilename}`;
            this.elements.mpsFileInfo.style.color = '#6c757d';
            this.elements.mpsFileInfo.style.fontStyle = 'italic';
        }

        if (savedInfo.urdfFilename && this.elements.urdfFileInfo) {
            this.elements.urdfFileInfo.textContent = `上次使用: ${savedInfo.urdfFilename}`;
            this.elements.urdfFileInfo.style.color = '#6c757d';
            this.elements.urdfFileInfo.style.fontStyle = 'italic';
        }

        if (savedInfo.stlFilenames && savedInfo.stlFilenames.length > 0 && this.elements.stlFileInfo) {
            this.elements.stlFileInfo.textContent = `上次使用: ${savedInfo.stlFilenames.length} 个文件`;
            this.elements.stlFileInfo.style.color = '#6c757d';
            this.elements.stlFileInfo.style.fontStyle = 'italic';

            let fileListHtml = '<div style="margin-top: 5px; padding: 8px; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; font-size: 0.85rem;">';
            fileListHtml += '<div style="font-weight: 600; color: #1976d2; margin-bottom: 5px;">上次使用的文件：</div>';
            savedInfo.stlFilenames.forEach((name, index) => {
                fileListHtml += `<div style="color: #1565c0; margin: 2px 0;">${index + 1}. ${name}</div>`;
            });
            fileListHtml += '</div>';
            if (this.elements.stlFileList) {
                this.elements.stlFileList.innerHTML = fileListHtml;
            }
        }
    }

    /**
     * Apply settings to UI controls
     */
    applySettings(settings) {
        if (this.elements.scaleSlider) {
            this.elements.scaleSlider.value = settings.scale;
        }
        if (this.elements.scaleValue) {
            this.elements.scaleValue.textContent = settings.scale.toFixed(1);
        }
        if (this.elements.offsetX) {
            this.elements.offsetX.value = settings.offsetX;
        }
        if (this.elements.offsetY) {
            this.elements.offsetY.value = settings.offsetY;
        }
        if (this.elements.offsetZ) {
            this.elements.offsetZ.value = settings.offsetZ;
        }
        if (this.elements.showSkeleton) {
            this.elements.showSkeleton.checked = settings.showSkeleton;
        }
        if (this.elements.showGripper) {
            this.elements.showGripper.checked = settings.showGripper;
        }
    }

    /**
     * Get current form values
     */
    getFormData() {
        // Use filtered STL files if available, otherwise try input elements
        let stlFiles = null;
        if (this.filteredStlFiles && this.filteredStlFiles.length > 0) {
            stlFiles = this.filteredStlFiles;
        } else if (this.elements.stlFilesInput && this.elements.stlFilesInput.files && this.elements.stlFilesInput.files.length > 0) {
            stlFiles = this.elements.stlFilesInput.files;
        } else if (this.elements.stlFolderInput && this.elements.stlFolderInput.files && this.elements.stlFolderInput.files.length > 0) {
            stlFiles = this.elements.stlFolderInput.files;
        }

        return {
            mpsFile: this.elements.mpsFileInput && this.elements.mpsFileInput.files[0],
            urdfFile: this.elements.urdfFileInput && this.elements.urdfFileInput.files[0],
            stlFiles: stlFiles
        };
    }

    /**
     * Dispose - remove event listeners to prevent memory leaks
     */
    dispose() {
        // Remove file change listeners
        if (this.elements.mpsFileInput && this.fileChangeHandlers.onMpsFileChange) {
            this.elements.mpsFileInput.removeEventListener('change', this.fileChangeHandlers.onMpsFileChange);
        }
        if (this.elements.urdfFileInput && this.fileChangeHandlers.onUrdfFileChange) {
            this.elements.urdfFileInput.removeEventListener('change', this.fileChangeHandlers.onUrdfFileChange);
        }
        if (this.elements.stlFilesInput && this.fileChangeHandlers.onStlFilesChange) {
            this.elements.stlFilesInput.removeEventListener('change', this.fileChangeHandlers.onStlFilesChange);
        }
        if (this.elements.stlFolderInput && this.fileChangeHandlers.onStlFilesChange) {
            this.elements.stlFolderInput.removeEventListener('change', this.fileChangeHandlers.onStlFilesChange);
        }
        if (this.elements.configFileInput && this.fileChangeHandlers.onConfigFileChange) {
            this.elements.configFileInput.removeEventListener('change', this.fileChangeHandlers.onConfigFileChange);
        }

        this.fileChangeHandlers = {};
        this.elements = {};
    }
}
