/**
 * Config Manager - Handles configuration save/load from localStorage and files
 */

import { STORAGE_KEYS, DEFAULT_MAPPING_SETTINGS } from './constants.js';

export class ConfigManager {
    constructor() {
        this.mappingSettings = { ...DEFAULT_MAPPING_SETTINGS };
    }

    /**
     * Save file info to localStorage
     */
    saveFileInfo(mpsFile, urdfFile, stlFiles) {
        try {
            const config = {
                mps_filename: mpsFile ? mpsFile.name : null,
                urdf_filename: urdfFile ? urdfFile.name : null,
                stl_filenames: stlFiles ? Array.from(stlFiles).map(f => f.name) : [],
                mapping_settings: this.mappingSettings,
                timestamp: new Date().toISOString()
            };

            if (config.mps_filename) {
                localStorage.setItem(STORAGE_KEYS.MPS_FILENAME, config.mps_filename);
            }
            if (config.urdf_filename) {
                localStorage.setItem(STORAGE_KEYS.URDF_FILENAME, config.urdf_filename);
            }
            if (config.stl_filenames.length > 0) {
                localStorage.setItem(STORAGE_KEYS.STL_FILENAMES, JSON.stringify(config.stl_filenames));
            }

            localStorage.setItem(STORAGE_KEYS.MAPPING_SETTINGS, JSON.stringify(this.mappingSettings));
            localStorage.setItem(STORAGE_KEYS.CONFIG_DATA, JSON.stringify(config));

            console.log('File info saved to localStorage');
        } catch (e) {
            console.error('Error saving file info:', e);
        }
    }

    /**
     * Load saved file info from localStorage
     */
    loadSavedFileInfo() {
        try {
            const savedMps = localStorage.getItem(STORAGE_KEYS.MPS_FILENAME);
            const savedUrdf = localStorage.getItem(STORAGE_KEYS.URDF_FILENAME);
            const savedStl = localStorage.getItem(STORAGE_KEYS.STL_FILENAMES);
            const savedSettings = localStorage.getItem(STORAGE_KEYS.MAPPING_SETTINGS);

            const result = {
                mpsFilename: savedMps,
                urdfFilename: savedUrdf,
                stlFilenames: savedStl ? JSON.parse(savedStl) : [],
                hasSavedInfo: false
            };

            if (savedSettings) {
                this.mappingSettings = { ...DEFAULT_MAPPING_SETTINGS, ...JSON.parse(savedSettings) };
            }

            if (savedMps || savedUrdf || (savedStl && JSON.parse(savedStl).length > 0)) {
                result.hasSavedInfo = true;
            }

            return result;
        } catch (e) {
            console.error('Error loading saved file info:', e);
            return null;
        }
    }

    /**
     * Export config to JSON file
     */
    exportConfig(mpsFile, urdfFile, stlFiles) {
        try {
            const config = {
                version: '1.0',
                mps_filename: mpsFile ? mpsFile.name : null,
                urdf_filename: urdfFile ? urdfFile.name : null,
                stl_filenames: stlFiles ? Array.from(stlFiles).map(f => f.name) : [],
                mapping_settings: this.mappingSettings,
                timestamp: new Date().toISOString(),
                note: '将此文件保存，下次可以直接上传此配置文件快速加载'
            };

            const configJson = JSON.stringify(config, null, 2);
            const blob = new Blob([configJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gripper_config_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return true;
        } catch (e) {
            console.error('Error exporting config:', e);
            return false;
        }
    }

    /**
     * Load config from JSON file
     */
    async loadConfigFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const config = JSON.parse(e.target.result);
                    if (config.mapping_settings) {
                        this.mappingSettings = { ...DEFAULT_MAPPING_SETTINGS, ...config.mapping_settings };
                    }
                    resolve(config);
                } catch (err) {
                    reject(new Error('配置文件格式错误: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('读取配置文件失败'));
            reader.readAsText(file);
        });
    }

    /**
     * Load saved config from localStorage
     */
    loadSavedConfig() {
        try {
            const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG_DATA);
            if (savedConfig) {
                const config = JSON.parse(savedConfig);
                if (config.mapping_settings) {
                    this.mappingSettings = { ...DEFAULT_MAPPING_SETTINGS, ...config.mapping_settings };
                }
                return config;
            }
            return null;
        } catch (e) {
            console.error('Error loading saved config:', e);
            return null;
        }
    }

    /**
     * Update mapping settings
     */
    updateSettings(settings) {
        this.mappingSettings = { ...this.mappingSettings, ...settings };
        localStorage.setItem(STORAGE_KEYS.MAPPING_SETTINGS, JSON.stringify(this.mappingSettings));
    }

    /**
     * Get current mapping settings
     */
    getSettings() {
        return { ...this.mappingSettings };
    }
}
