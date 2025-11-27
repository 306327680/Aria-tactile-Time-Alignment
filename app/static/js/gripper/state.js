// Global state management for gripper visualization

// Three.js scenes and renderers
export let gripperScene, gripperCamera, gripperRenderer;
export let handScene, handCamera, handRenderer;

// Model data
export let gripperModels = [];  // Array to store multiple STL models
export let gripperLinkMap = {};  // Map link names to Three.js objects
export let urdfData = null;  // Parsed URDF data
export let handLandmarksData = null;
export let handTimestamps = [];  // Timestamps for each frame

// Animation state
export let currentFrameIndex = 0;
export let animationId = null;
export let isPlaying = false;
export let playbackSpeed = 1;
export let playInterval = null;

// Mapping settings
export let mappingSettings = {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    showSkeleton: true,
    showGripper: true
};

// Setters for state
export function setGripperScene(scene) { gripperScene = scene; }
export function setGripperCamera(camera) { gripperCamera = camera; }
export function setGripperRenderer(renderer) { gripperRenderer = renderer; }
export function setHandScene(scene) { handScene = scene; }
export function setHandCamera(camera) { handCamera = camera; }
export function setHandRenderer(renderer) { handRenderer = renderer; }
export function setGripperModels(models) { gripperModels = models; }
export function setGripperLinkMap(map) { gripperLinkMap = map; }
export function setUrdfData(data) { urdfData = data; }
export function setHandLandmarksData(data) { handLandmarksData = data; }
export function setHandTimestamps(timestamps) { handTimestamps = timestamps; }
export function setCurrentFrameIndex(index) { currentFrameIndex = index; }
export function setAnimationId(id) { animationId = id; }
export function setIsPlaying(playing) { isPlaying = playing; }
export function setPlaybackSpeed(speed) { playbackSpeed = speed; }
export function setPlayInterval(interval) { playInterval = interval; }
export function setMappingSettings(settings) { Object.assign(mappingSettings, settings); }

