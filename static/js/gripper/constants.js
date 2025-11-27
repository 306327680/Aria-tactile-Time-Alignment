/**
 * Constants for gripper visualization
 */

// Hand skeleton connections (21 landmarks)
export const HAND_CONNECTIONS = [
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
    // Palm connections
    [8, 20], [11, 20], [14, 20], [17, 20]
];

// Finger colors
export const FINGER_COLORS = {
    thumb: 0xff0000,    // Red
    index: 0xffa500,    // Orange
    middle: 0xffff00,   // Yellow
    ring: 0x00ff00,     // Green
    pinky: 0x0000ff,    // Blue
    wrist: 0x6c757d,    // Gray
    palm: 0x800080      // Purple
};

// LocalStorage keys for saving file paths
export const STORAGE_KEYS = {
    MPS_FILENAME: 'gripper_mps_filename',
    URDF_FILENAME: 'gripper_urdf_filename',
    STL_FILENAMES: 'gripper_stl_filenames',
    MAPPING_SETTINGS: 'gripper_mapping_settings',
    CONFIG_DATA: 'gripper_config_data'
};

// Default mapping settings
export const DEFAULT_MAPPING_SETTINGS = {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    showSkeleton: true,
    showGripper: true
};

// Scene configuration
export const SCENE_CONFIG = {
    backgroundColor: 0x1a1a1a,
    gridSize: 0.5,
    gridDivisions: 10,
    axesSize: 0.2,
    ambientLightIntensity: 0.6,
    directionalLightIntensity: 0.8
};

// Camera configuration
export const CAMERA_CONFIG = {
    fov: 75,
    near: 0.01,
    far: 100,
    defaultPosition: { x: 0.2, y: 0.2, z: 0.4 },
    defaultTarget: { x: 0, y: 0, z: 0 }
};

// Playback configuration
export const PLAYBACK_CONFIG = {
    defaultSpeed: 1,
    frameInterval: 100, // ms
    speeds: [0.25, 0.5, 1, 2, 4]
};
