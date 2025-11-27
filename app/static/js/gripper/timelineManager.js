/**
 * Timeline Manager - Handles playback timeline and controls
 */

import { PLAYBACK_CONFIG } from './constants.js';

export class TimelineManager {
    constructor() {
        this.timestamps = [];
        this.currentFrameIndex = 0;
        this.isPlaying = false;
        this.playbackSpeed = PLAYBACK_CONFIG.defaultSpeed;
        this.playInterval = null;
        this.onFrameChangeCallback = null;
    }

    /**
     * Initialize timeline with timestamps
     */
    init(timestamps) {
        this.timestamps = timestamps || [];
        this.currentFrameIndex = 0;
        this.updateUI();
    }

    /**
     * Set frame change callback
     */
    onFrameChange(callback) {
        this.onFrameChangeCallback = callback;
    }

    /**
     * Update UI elements
     */
    updateUI() {
        const timelineSlider = document.getElementById('timeline-slider');
        const currentTimeDisplay = document.getElementById('current-time-display');
        const timeStart = document.getElementById('time-start');
        const timeEnd = document.getElementById('time-end');
        const totalTimeDisplay = document.getElementById('total-time-display');

        if (this.timestamps.length === 0) return;

        const frameIndex = Math.floor(this.currentFrameIndex);
        const time = this.timestamps[frameIndex] || 0;

        // Update slider
        if (timelineSlider) {
            timelineSlider.min = 0;
            timelineSlider.max = this.timestamps.length - 1;
            timelineSlider.value = frameIndex;
            timelineSlider.step = 1;

            // Update progress bar
            const progress = (frameIndex / (this.timestamps.length - 1)) * 100;
            timelineSlider.style.background = `linear-gradient(to right, #667eea 0%, #667eea ${progress}%, #dee2e6 ${progress}%, #dee2e6 100%)`;
        }

        // Update time displays
        if (currentTimeDisplay) {
            const mins = Math.floor(time / 60);
            const secs = (time % 60).toFixed(3);
            currentTimeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
        }

        if (timeStart && this.timestamps.length > 0) {
            timeStart.textContent = `${this.timestamps[0].toFixed(3)}s`;
        }

        if (timeEnd && this.timestamps.length > 0) {
            timeEnd.textContent = `${this.timestamps[this.timestamps.length - 1].toFixed(3)}s`;
        }

        if (totalTimeDisplay && this.timestamps.length > 0) {
            const totalTime = this.timestamps[this.timestamps.length - 1];
            const mins = Math.floor(totalTime / 60);
            const secs = (totalTime % 60).toFixed(3);
            totalTimeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
        }
    }

    /**
     * Start playback
     */
    play() {
        if (this.timestamps.length === 0) return;

        this.isPlaying = true;
        this.updatePlayPauseButton(true);

        const frameInterval = PLAYBACK_CONFIG.frameInterval;
        const timeStep = (frameInterval / 1000) * this.playbackSpeed;

        this.playInterval = setInterval(() => {
            if (this.timestamps.length > 0) {
                const currentTime = this.timestamps[Math.floor(this.currentFrameIndex)] || 0;
                const nextTime = currentTime + timeStep;

                // Find next frame
                let nextIndex = this.currentFrameIndex;
                for (let i = Math.floor(this.currentFrameIndex); i < this.timestamps.length; i++) {
                    if (this.timestamps[i] >= nextTime) {
                        nextIndex = i;
                        break;
                    }
                }

                if (nextIndex >= this.timestamps.length - 1) {
                    nextIndex = 0; // Loop
                }

                this.currentFrameIndex = nextIndex;
                this.updateUI();

                if (this.onFrameChangeCallback) {
                    this.onFrameChangeCallback(this.currentFrameIndex);
                }
            }
        }, frameInterval);
    }

    /**
     * Pause playback
     */
    pause() {
        this.isPlaying = false;
        this.updatePlayPauseButton(false);

        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }

    /**
     * Stop playback
     */
    stop() {
        this.pause();
        this.currentFrameIndex = 0;
        this.updateUI();

        if (this.onFrameChangeCallback) {
            this.onFrameChangeCallback(this.currentFrameIndex);
        }
    }

    /**
     * Seek to frame
     */
    seekToFrame(frameIndex) {
        this.currentFrameIndex = Math.max(0, Math.min(frameIndex, this.timestamps.length - 1));
        this.updateUI();

        if (this.onFrameChangeCallback) {
            this.onFrameChangeCallback(this.currentFrameIndex);
        }
    }

    /**
     * Set playback speed
     */
    setSpeed(speed) {
        this.playbackSpeed = speed;
        if (this.isPlaying) {
            this.pause();
            this.play();
        }
    }

    /**
     * Update play/pause button
     */
    updatePlayPauseButton(isPlaying) {
        const playIcon = document.getElementById('play-icon');
        const playText = document.getElementById('play-text');
        if (playIcon) playIcon.textContent = isPlaying ? '⏸' : '▶';
        if (playText) playText.textContent = isPlaying ? '暂停' : '播放';
    }

    /**
     * Cleanup - stop intervals to prevent memory leaks
     */
    dispose() {
        this.pause();
        this.timestamps = [];
        this.onFrameChangeCallback = null;
    }

    /**
     * Get current state
     */
    getCurrentFrame() {
        return Math.floor(this.currentFrameIndex);
    }

    getTimestamps() {
        return this.timestamps;
    }

    getIsPlaying() {
        return this.isPlaying;
    }
}
