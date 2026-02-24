// Gripper Visualization JavaScript
// Hand landmarks to SO-101 gripper mapping

// Hand skeleton connections (21 landmarks)
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
    // Palm connections
    [8, 20], [11, 20], [14, 20], [17, 20]
];

// Finger base colors (HSL format for easy darkening)
// Each finger has a base hue, saturation, and lightness
const FINGER_BASE_COLORS = {
    thumb:  { h: 0,   s: 100, l: 50 },   // Red
    index:  { h: 30,  s: 100, l: 50 },   // Orange
    middle: { h: 60,  s: 100, l: 50 },   // Yellow
    ring:   { h: 120, s: 100, l: 40 },   // Green
    pinky:  { h: 240, s: 100, l: 50 },   // Blue
    wrist:  { h: 0,   s: 0,   l: 50 },   // Gray
    palm:   { h: 280, s: 100, l: 40 }    // Purple
};

// Legacy FINGER_COLORS for backward compatibility
const FINGER_COLORS = {
    thumb: 0xff0000,    // Red
    index: 0xffa500,    // Orange
    middle: 0xffff00,   // Yellow
    ring: 0x00ff00,     // Green
    pinky: 0x0000ff,    // Blue
    wrist: 0x6c757d,    // Gray
    palm: 0x800080      // Purple
};

/**
 * Convert HSL to hex color
 */
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return parseInt(`${f(0)}${f(8)}${f(4)}`, 16);
}

/**
 * Get color for a landmark based on finger and joint depth
 * depth: 0 = closest to wrist (lightest), higher = further from wrist (darker)
 */
function getLandmarkColor(fingerName, depth, maxDepth) {
    const base = FINGER_BASE_COLORS[fingerName] || FINGER_BASE_COLORS.wrist;
    // Darken based on depth: depth 0 = light, max depth = dark
    const darkenFactor = depth / maxDepth;
    const newL = Math.max(20, base.l - darkenFactor * 35); // Lightness decreases with depth
    return hslToHex(base.h, base.s, newL);
}

/**
 * MPS landmark index to finger mapping with depth
 * Returns { finger: string, depth: number, maxDepth: number }
 */
function getLandmarkFingerInfo(idx) {
    // MPS format:
    // 0: thumb_tip, 1: index_tip, 2: middle_tip, 3: ring_tip, 4: pinky_tip
    // 5: wrist
    // 6-7: thumb joints (6=MCP, 7=IP)
    // 8-10: index joints (8=MCP, 9=PIP, 10=DIP)
    // 11-13: middle joints
    // 14-16: ring joints
    // 17-19: pinky joints
    // 20: palm_center

    if (idx === 5) return { finger: 'wrist', depth: 0, maxDepth: 1 };
    if (idx === 20) return { finger: 'palm', depth: 0, maxDepth: 1 };

    // Thumb: tip=0, joints=6,7, so order from wrist: 6->7->0
    if (idx === 0) return { finger: 'thumb', depth: 3, maxDepth: 3 };  // tip (darkest)
    if (idx === 6) return { finger: 'thumb', depth: 1, maxDepth: 3 };  // MCP
    if (idx === 7) return { finger: 'thumb', depth: 2, maxDepth: 3 };  // IP

    // Index: tip=1, joints=8,9,10, order: 8->9->10->1
    if (idx === 1) return { finger: 'index', depth: 4, maxDepth: 4 };  // tip
    if (idx === 8) return { finger: 'index', depth: 1, maxDepth: 4 };  // MCP
    if (idx === 9) return { finger: 'index', depth: 2, maxDepth: 4 };  // PIP
    if (idx === 10) return { finger: 'index', depth: 3, maxDepth: 4 }; // DIP

    // Middle: tip=2, joints=11,12,13
    if (idx === 2) return { finger: 'middle', depth: 4, maxDepth: 4 };
    if (idx === 11) return { finger: 'middle', depth: 1, maxDepth: 4 };
    if (idx === 12) return { finger: 'middle', depth: 2, maxDepth: 4 };
    if (idx === 13) return { finger: 'middle', depth: 3, maxDepth: 4 };

    // Ring: tip=3, joints=14,15,16
    if (idx === 3) return { finger: 'ring', depth: 4, maxDepth: 4 };
    if (idx === 14) return { finger: 'ring', depth: 1, maxDepth: 4 };
    if (idx === 15) return { finger: 'ring', depth: 2, maxDepth: 4 };
    if (idx === 16) return { finger: 'ring', depth: 3, maxDepth: 4 };

    // Pinky: tip=4, joints=17,18,19
    if (idx === 4) return { finger: 'pinky', depth: 4, maxDepth: 4 };
    if (idx === 17) return { finger: 'pinky', depth: 1, maxDepth: 4 };
    if (idx === 18) return { finger: 'pinky', depth: 2, maxDepth: 4 };
    if (idx === 19) return { finger: 'pinky', depth: 3, maxDepth: 4 };

    return { finger: 'wrist', depth: 0, maxDepth: 1 };
}

// Global variables
let gripperScene, gripperCamera, gripperRenderer, gripperControls;
let gripperModels = [];  // Array to store multiple STL models
let gripperLinkMap = {};  // Map link names to Three.js objects
let gripperLinkInitialTransforms = {};  // Store initial transforms for reset
let urdfData = null;  // Parsed URDF data
let handLandmarksData = null;
let hapticData = null;  // Haptic sensor data
let slamTrajectory = null;  // SLAM trajectory data (device positions in world coordinates)
let useWorldCoordinates = false;  // Flag indicating if data is in world coordinates
let handTimestamps = [];  // Timestamps for each frame

// Trajectory visualization settings
let trajectorySettings = {
    enabled: true,
    duration: 10,  // seconds
    trackPoint: 'index',  // wrist, thumb, index, middle, palm
    lineWidth: 3
};
let trajectoryLine = null;  // THREE.Line object for trajectory
let trajectoryPoints = [];  // Array of Vector3 points for trajectory
let hapticTimestamps = [];  // Haptic timestamps
let currentFrameIndex = 0;
let animationId = null;
let isPlaying = false;
let playbackSpeed = 1;
let playInterval = null;

// VRS video frame settings
let vrsSessionInitialized = false;
let vrsAvailableCameras = [];
let vrsNumFrames = 0;
let vrsTimeRangeS = [0, 0];
let lastVideoFrameIndex = -1;
let videoFrameUpdateInterval = 200;  // ms between frame updates
let videoFramePending = false;

// Hand mesh visualization
let handMeshModel = null;  // GLB hand model
let handMeshBones = {};  // Bone references for IK
let handMeshMixer = null;  // Animation mixer for hand model
let handMeshLoaded = false;
let handViewMode = 'landmarks';  // 'landmarks' or 'mesh'

// Mapping settings
let mappingSettings = {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    showSkeleton: true,
    showGripper: true
};

// Hand pose transform settings - for device coordinates (fixed at origin)
let handPoseTransformDevice = {
    posX: 0,      // Position offset in meters
    posY: 0,
    posZ: 0,
    rotX: 0,      // Rotation in degrees
    rotY: 0,
    rotZ: 0,
    scale: 1.0
};

// Hand pose transform settings - for world coordinates (SLAM)
let handPoseTransformWorld = {
    posX: 0,      // Position offset in meters
    posY: 0,
    posZ: 0,
    rotX: 0,      // Rotation in degrees
    rotY: 0,
    rotZ: 0,
    scale: 1.0
};

// Active hand pose transform (points to current mode's settings)
let handPoseTransform = handPoseTransformDevice;

// Hand-to-gripper mapping settings
let handGripperMapping = {
    enabled: true,
    closeDistCm: 2,    // Distance (cm) that maps to gripper fully closed (-10°)
    openDistCm: 10,    // Distance (cm) that maps to gripper fully open (100°)
    currentDistCm: 0,  // Current thumb-index distance
    currentAngleDeg: 50 // Current mapped gripper angle
};

// Calculate bounding box of landmarks and adjust camera
function adjustCameraToLandmarks(landmarks) {
    console.log('adjustCameraToLandmarks called with:', landmarks);
    
    if (!landmarks || landmarks.length === 0) {
        console.warn('No landmarks provided, using default camera position');
        // Set default camera position to view origin
        if (gripperCamera) {
            gripperCamera.position.set(0.2, 0.2, 0.4);
            gripperCamera.lookAt(0, 0, 0);
            gripperCamera.updateProjectionMatrix();
            if (gripperControls) {
                gripperControls.target.set(0, 0, 0);
                gripperControls.update();
            }
        }
        return;
    }
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let validPoints = 0;
    
    landmarks.forEach(point => {
        if (point && point.length >= 3 && 
            !isNaN(point[0]) && !isNaN(point[1]) && !isNaN(point[2])) {
            minX = Math.min(minX, point[0]);
            maxX = Math.max(maxX, point[0]);
            minY = Math.min(minY, point[1]);
            maxY = Math.max(maxY, point[1]);
            minZ = Math.min(minZ, point[2]);
            maxZ = Math.max(maxZ, point[2]);
            validPoints++;
        }
    });
    
    if (validPoints === 0) {
        console.warn('No valid points found in landmarks');
        // Use default position
        if (gripperCamera) {
            gripperCamera.position.set(0.2, 0.2, 0.4);
            gripperCamera.lookAt(0, 0, 0);
            gripperCamera.updateProjectionMatrix();
            if (gripperControls) {
                gripperControls.target.set(0, 0, 0);
                gripperControls.update();
            }
        }
        return;
    }
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ, 0.1); // At least 0.1m
    
    console.log('Bounding box:', { minX, maxX, minY, maxY, minZ, maxZ });
    console.log('Center:', { centerX, centerY, centerZ });
    console.log('Max size:', maxSize);
    
    // Adjust camera to view the bounding box
    const distance = maxSize * 2.5; // Distance to view the whole object
    
    if (gripperCamera) {
        gripperCamera.position.set(
            centerX + distance * 0.7,
            centerY + distance * 0.7,
            centerZ + distance * 0.5
        );
        gripperCamera.lookAt(centerX, centerY, centerZ);
        gripperCamera.updateProjectionMatrix();
        if (gripperControls) {
            gripperControls.target.set(centerX, centerY, centerZ);
            gripperControls.update();
        }
        console.log('Gripper camera adjusted to:', gripperCamera.position);
    }

    console.log('Camera adjusted to landmarks:', {
        center: [centerX, centerY, centerZ],
        size: [sizeX, sizeY, sizeZ],
        distance: distance
    });
}

// Initialize Three.js scenes
function initScenes() {
    // Gripper scene (single canvas showing gripper + hand landmarks)
    const gripperCanvas = document.getElementById('gripper-canvas');
    if (!gripperCanvas) {
        console.error('gripper-canvas not found');
        return;
    }

    // Get canvas dimensions, use defaults if canvas is hidden (display: none)
    let gripperWidth = gripperCanvas.clientWidth;
    let gripperHeight = gripperCanvas.clientHeight;
    if (gripperWidth === 0 || gripperHeight === 0) {
        // Canvas is hidden, use default dimensions from CSS (600px height)
        gripperWidth = 800; // Default width
        gripperHeight = 600; // Default height from CSS
        console.warn('Canvas is hidden, using default dimensions:', gripperWidth, gripperHeight);
    }

    gripperScene = new THREE.Scene();
    gripperScene.background = new THREE.Color(0x1a1a1a);

    const aspect = gripperWidth / gripperHeight || 1;
    gripperCamera = new THREE.PerspectiveCamera(75, aspect, 0.01, 100); // Closer near/far planes
    gripperCamera.position.set(0.2, 0.2, 0.4); // Closer initial position to see grid better
    gripperCamera.lookAt(0, 0, 0);

    gripperRenderer = new THREE.WebGLRenderer({ canvas: gripperCanvas, antialias: true });
    gripperRenderer.setSize(gripperWidth, gripperHeight);
    gripperRenderer.setPixelRatio(window.devicePixelRatio);

    console.log('Gripper scene initialized:', {
        width: gripperWidth,
        height: gripperHeight,
        cameraPosition: gripperCamera.position
    });

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);

    gripperScene.add(ambientLight);
    gripperScene.add(directionalLight);

    // Add grid helpers (larger and more visible)
    // Grid size: 0.5m, 10 divisions, brighter colors for visibility
    const gridHelper = new THREE.GridHelper(0.5, 10, 0x888888, 0x555555);
    const axesHelper = new THREE.AxesHelper(0.2); // Larger axes (20cm)
    gripperScene.add(gridHelper);
    gripperScene.add(axesHelper);

    // Add OrbitControls for camera manipulation
    gripperControls = new THREE.OrbitControls(gripperCamera, gripperCanvas);
    gripperControls.enableDamping = true;
    gripperControls.dampingFactor = 0.05;
    gripperControls.screenSpacePanning = true;
    gripperControls.minDistance = 0.05;
    gripperControls.maxDistance = 5;
    gripperControls.enableZoom = true;
    gripperControls.enableRotate = true;
    gripperControls.enablePan = true;
    gripperControls.target.set(0, 0, 0);
    gripperControls.update();

    console.log('✅ OrbitControls initialized - use mouse to zoom/rotate/pan');

    console.log('Grid and axes helpers added to scene');
    console.log('Gripper scene children after init:', gripperScene.children.length);

    // Force initial render to show grid and axes immediately
    if (gripperRenderer && gripperScene && gripperCamera) {
        gripperRenderer.render(gripperScene, gripperCamera);
        console.log('Initial gripper scene render completed');
    }
}

// Load STL model
// useURDFMode: if true, preserve original geometry (no scaling/centering/rotation)
function loadSTLModel(url, filename = '', useURDFMode = false) {
    return new Promise((resolve, reject) => {
        // Use fetch to load STL file
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                try {
                    const loader = new STLLoader();
                    const geometry = loader.parse(buffer);

                    if (!useURDFMode) {
                        // Manual mode: Center and normalize geometry
                        geometry.computeBoundingBox();
                        const box = geometry.boundingBox;
                        const size = new THREE.Vector3();
                        box.getSize(size);
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const scale = 0.1 / maxDim; // Scale to ~0.1m
                        geometry.scale(scale, scale, scale);

                        // Center geometry
                        const center = new THREE.Vector3();
                        box.getCenter(center);
                        geometry.translate(-center.x * scale, -center.y * scale, -center.z * scale);
                    }

                    // Create material - uniform gray color
                    const material = new THREE.MeshPhongMaterial({
                        color: 0x888888,
                        specular: 0x333333,
                        shininess: 100,
                        transparent: true,
                        opacity: 0.9
                    });

                    const mesh = new THREE.Mesh(geometry, material);

                    if (!useURDFMode) {
                        // Manual mode: Rotate to correct orientation
                        mesh.rotation.x = -Math.PI / 2;
                    }

                    mesh.userData.filename = filename; // Store filename for reference
                    resolve(mesh);
                } catch (e) {
                    reject(e);
                }
            })
            .catch(reject);
    });
}

// Convert RPY (roll, pitch, yaw) to rotation matrix
function rpyToQuaternion(rpy) {
    const [roll, pitch, yaw] = rpy;
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);

    return {
        w: cr * cp * cy + sr * sp * sy,
        x: sr * cp * cy - cr * sp * sy,
        y: cr * sp * cy + sr * cp * sy,
        z: cr * cp * sy - sr * sp * cy
    };
}

// Load and assemble gripper from URDF
async function loadGripperFromURDF(urdfData, stlFileMap) {
    console.log('loadGripperFromURDF called with stlFileMap keys:', Object.keys(stlFileMap));

    gripperModels = [];
    gripperLinkMap = {};

    // Remove old models from scene
    const objectsToRemove = [];
    gripperScene.children.forEach(child => {
        if (child.userData.isGripper) {
            objectsToRemove.push(child);
        }
    });
    objectsToRemove.forEach(obj => gripperScene.remove(obj));
    
    // Create a map of link names to link data
    const linkMap = {};
    urdfData.links.forEach(link => {
        linkMap[link.name] = link;
    });
    
    // Create a map of child to parent joints
    const childToParent = {};
    urdfData.joints.forEach(joint => {
        if (joint.child && joint.parent) {
            childToParent[joint.child] = {
                parent: joint.parent,
                origin: joint.origin
            };
        }
    });
    
    // Load all mesh files and create link objects
    const linkObjects = {};
    
    for (const link of urdfData.links) {
        for (const visual of link.visuals) {
            if (visual.mesh) {
                const meshBasename = getBasename(visual.mesh);
                // Try exact match first, then case-insensitive match, then suffix match
                let stlUrl = stlFileMap[meshBasename];
                if (!stlUrl) {
                    const lowerBasename = meshBasename.toLowerCase();
                    for (const key of Object.keys(stlFileMap)) {
                        // Case-insensitive exact match
                        if (key.toLowerCase() === lowerBasename) {
                            stlUrl = stlFileMap[key];
                            break;
                        }
                        // Suffix match (key ends with the basename, e.g., "folder_file.stl" ends with "file.stl")
                        if (key.toLowerCase().endsWith(lowerBasename) ||
                            key.toLowerCase().endsWith('_' + lowerBasename)) {
                            stlUrl = stlFileMap[key];
                            break;
                        }
                    }
                }

                if (!stlUrl) {
                    // Only log once per unique missing file
                    continue;
                }
                
                try {
                    // Use URDF mode - preserve original geometry scale
                    const mesh = await loadSTLModel(stlUrl, meshBasename, true);

                    // Apply visual origin transform from URDF
                    const origin = visual.origin || { xyz: [0, 0, 0], rpy: [0, 0, 0] };
                    mesh.position.set(origin.xyz[0], origin.xyz[1], origin.xyz[2]);

                    // Apply rotation from URDF
                    const quat = rpyToQuaternion(origin.rpy);
                    mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w);

                    // Apply scale from URDF visual if specified
                    if (visual.scale) {
                        mesh.scale.set(visual.scale[0], visual.scale[1], visual.scale[2]);
                    }
                    
                    mesh.userData.isGripper = true;
                    mesh.userData.linkName = link.name;
                    
                    if (!linkObjects[link.name]) {
                        linkObjects[link.name] = new THREE.Group();
                        linkObjects[link.name].name = link.name;
                        linkObjects[link.name].userData.isGripper = true;
                    }
                    
                    linkObjects[link.name].add(mesh);
                    gripperModels.push(mesh);
                } catch (error) {
                    console.error(`Failed to load mesh ${meshBasename}:`, error);
                }
            }
        }
    }
    
    // Build hierarchy based on joints
    const rootLinks = [];

    for (const linkName in linkObjects) {
        const linkObj = linkObjects[linkName];
        const jointInfo = childToParent[linkName];

        if (jointInfo) {
            // This link has a parent, apply joint transform
            const origin = jointInfo.origin || { xyz: [0, 0, 0], rpy: [0, 0, 0] };
            linkObj.position.set(origin.xyz[0], origin.xyz[1], origin.xyz[2]);

            const quat = rpyToQuaternion(origin.rpy);
            linkObj.quaternion.set(quat.x, quat.y, quat.z, quat.w);

            // Add to parent link group
            const parentObj = linkObjects[jointInfo.parent];
            if (parentObj) {
                parentObj.add(linkObj);
            } else {
                rootLinks.push(linkObj);
            }
        } else {
            // Root link (no parent)
            rootLinks.push(linkObj);
        }

        gripperLinkMap[linkName] = linkObj;
    }

    // Create a root group for the entire robot to handle coordinate system conversion
    // URDF uses Z-up (ROS convention), Three.js uses Y-up
    const robotRoot = new THREE.Group();
    robotRoot.name = 'robot_root';
    robotRoot.userData.isGripper = true;
    robotRoot.userData.isRobotRoot = true;

    // Add all root links to the robot root
    rootLinks.forEach(linkObj => {
        robotRoot.add(linkObj);
    });

    // Convert from URDF coordinate system (Z-up) to Three.js (Y-up)
    // Rotate -90 degrees around X axis
    robotRoot.rotation.x = -Math.PI / 2;

    gripperScene.add(robotRoot);

    // Store robot root for later transformations
    gripperLinkMap['_robot_root'] = robotRoot;

    // Save initial transforms for reset functionality
    gripperLinkInitialTransforms = {};
    for (const linkName in gripperLinkMap) {
        const linkObj = gripperLinkMap[linkName];
        if (linkObj) {
            gripperLinkInitialTransforms[linkName] = {
                position: linkObj.position.clone(),
                quaternion: linkObj.quaternion.clone(),
                rotation: linkObj.rotation.clone()
            };
        }
    }

    console.log(`Loaded gripper from URDF: ${Object.keys(linkObjects).length} links`);
    console.log('Saved initial transforms for links:', Object.keys(gripperLinkInitialTransforms));
}

// Load multiple STL models (manual mode, without URDF)
async function loadSTLModels(urls, filenames) {
    gripperModels = [];
    gripperLinkMap = {};
    
    // Remove old models from scene
    const objectsToRemove = [];
    gripperScene.children.forEach(child => {
        if (child.userData.isGripper) {
            objectsToRemove.push(child);
        }
    });
    objectsToRemove.forEach(obj => gripperScene.remove(obj));
    
    // Load all STL files
    const loadPromises = urls.map((url, index) => 
        loadSTLModel(url, filenames[index] || `part_${index}`)
    );
    
    try {
        const models = await Promise.all(loadPromises);
        models.forEach((mesh, index) => {
            mesh.userData.isGripper = true;
            gripperScene.add(mesh);
            gripperModels.push(mesh);
        });
        console.log(`Loaded ${models.length} STL models (manual mode)`);
    } catch (error) {
        console.error('Error loading STL models:', error);
        throw error;
    }
}

// Apply hand pose transform to a single point (used for trajectory)
function applyHandPoseTransformToPoint(point, wrist) {
    if (!point || point.length < 3) return point;

    // Get rotation angles in radians
    const rotX = handPoseTransform.rotX * Math.PI / 180;
    const rotY = handPoseTransform.rotY * Math.PI / 180;
    const rotZ = handPoseTransform.rotZ * Math.PI / 180;

    // Pre-calculate rotation matrix components (Euler XYZ order)
    const cx = Math.cos(rotX), sx = Math.sin(rotX);
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cz = Math.cos(rotZ), sz = Math.sin(rotZ);

    if (useWorldCoordinates) {
        // World coordinates mode: apply transform around world origin
        let x = wrist[0] + (point[0] - wrist[0]) * handPoseTransform.scale;
        let y = wrist[1] + (point[1] - wrist[1]) * handPoseTransform.scale;
        let z = wrist[2] + (point[2] - wrist[2]) * handPoseTransform.scale;

        // Apply rotation around origin
        let y1 = y * cx - z * sx;
        let z1 = y * sx + z * cx;
        let x2 = x * cy + z1 * sy;
        let z2 = -x * sy + z1 * cy;
        let x3 = x2 * cz - y1 * sz;
        let y3 = x2 * sz + y1 * cz;

        return [
            x3 + handPoseTransform.posX,
            y3 + handPoseTransform.posY,
            z2 + handPoseTransform.posZ
        ];
    } else {
        // Device coordinates mode: relative to wrist
        let x = (point[0] - wrist[0]) * handPoseTransform.scale;
        let y = (point[1] - wrist[1]) * handPoseTransform.scale;
        let z = (point[2] - wrist[2]) * handPoseTransform.scale;

        let y1 = y * cx - z * sx;
        let z1 = y * sx + z * cx;
        let x2 = x * cy + z1 * sy;
        let z2 = -x * sy + z1 * cy;
        let x3 = x2 * cz - y1 * sz;
        let y3 = x2 * sz + y1 * cz;

        return [
            x3 + handPoseTransform.posX,
            y3 + handPoseTransform.posY,
            z2 + handPoseTransform.posZ
        ];
    }
}

// Map hand landmarks to gripper positions with pose transform
function mapHandToGripper(landmarks) {
    if (!landmarks || landmarks.length !== 21) return null;

    // Key mapping points:
    // - Wrist (5) -> Gripper base center
    // - Thumb tip (0) -> Left finger tip
    // - Index tip (1) -> Right finger tip
    // - Middle tip (2) -> Additional reference
    // - Palm center (20) -> Gripper base reference

    const wrist = landmarks[5];
    const thumbTip = landmarks[0];
    const indexTip = landmarks[1];
    const middleTip = landmarks[2];
    const palmCenter = landmarks[20];

    // Calculate gripper opening (distance between thumb and index)
    const opening = Math.sqrt(
        Math.pow(thumbTip[0] - indexTip[0], 2) +
        Math.pow(thumbTip[1] - indexTip[1], 2) +
        Math.pow(thumbTip[2] - indexTip[2], 2)
    );

    // Get rotation angles in radians
    const rotX = handPoseTransform.rotX * Math.PI / 180;
    const rotY = handPoseTransform.rotY * Math.PI / 180;
    const rotZ = handPoseTransform.rotZ * Math.PI / 180;

    // Pre-calculate rotation matrix components (Euler XYZ order)
    const cx = Math.cos(rotX), sx = Math.sin(rotX);
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cz = Math.cos(rotZ), sz = Math.sin(rotZ);

    // Map all landmarks with transform
    const mappedLandmarks = landmarks.map((landmark, idx) => {
        if (useWorldCoordinates) {
            // World coordinates mode: apply transform around world origin for alignment
            // First apply scale around wrist
            let x = wrist[0] + (landmark[0] - wrist[0]) * handPoseTransform.scale;
            let y = wrist[1] + (landmark[1] - wrist[1]) * handPoseTransform.scale;
            let z = wrist[2] + (landmark[2] - wrist[2]) * handPoseTransform.scale;

            // Apply rotation around origin (for plane alignment)
            // Rotate around X
            let y1 = y * cx - z * sx;
            let z1 = y * sx + z * cx;
            // Rotate around Y
            let x2 = x * cy + z1 * sy;
            let z2 = -x * sy + z1 * cy;
            // Rotate around Z
            let x3 = x2 * cz - y1 * sz;
            let y3 = x2 * sz + y1 * cz;

            // Apply position offset
            return [
                x3 + handPoseTransform.posX,
                y3 + handPoseTransform.posY,
                z2 + handPoseTransform.posZ
            ];
        } else {
            // Device coordinates mode: relative to wrist with pose transform
            let x = (landmark[0] - wrist[0]) * handPoseTransform.scale;
            let y = (landmark[1] - wrist[1]) * handPoseTransform.scale;
            let z = (landmark[2] - wrist[2]) * handPoseTransform.scale;

            // Apply rotation (Euler XYZ)
            // Rotate around X
            let y1 = y * cx - z * sx;
            let z1 = y * sx + z * cx;
            // Rotate around Y
            let x2 = x * cy + z1 * sy;
            let z2 = -x * sy + z1 * cy;
            // Rotate around Z
            let x3 = x2 * cz - y1 * sz;
            let y3 = x2 * sz + y1 * cz;

            // Apply position offset
            return [
                x3 + handPoseTransform.posX,
                y3 + handPoseTransform.posY,
                z2 + handPoseTransform.posZ
            ];
        }
    });

    // Calculate transformed wrist position
    let transformedWrist;
    if (useWorldCoordinates) {
        let wx = wrist[0], wy = wrist[1], wz = wrist[2];
        let wy1 = wy * cx - wz * sx;
        let wz1 = wy * sx + wz * cx;
        let wx2 = wx * cy + wz1 * sy;
        let wz2 = -wx * sy + wz1 * cy;
        let wx3 = wx2 * cz - wy1 * sz;
        let wy3 = wx2 * sz + wy1 * cz;
        transformedWrist = [
            wx3 + handPoseTransform.posX,
            wy3 + handPoseTransform.posY,
            wz2 + handPoseTransform.posZ
        ];
    } else {
        transformedWrist = [
            handPoseTransform.posX,
            handPoseTransform.posY,
            handPoseTransform.posZ
        ];
    }

    return {
        landmarks: mappedLandmarks,
        wrist: transformedWrist,
        wristWorld: wrist,  // Original wrist position
        opening: opening,
        center: [
            (thumbTip[0] + indexTip[0]) / 2,
            (thumbTip[1] + indexTip[1]) / 2,
            (thumbTip[2] + indexTip[2]) / 2
        ]
    };
}

// Cached geometries and materials for hand landmarks to avoid memory leaks
let handLandmarkGeometry = null;
let handLandmarkMaterials = {};
let handLineGeometries = [];

// Get landmark index for trajectory tracking point
function getTrackPointIndex(trackPoint) {
    const trackPointMap = {
        'wrist': 5,
        'thumb': 0,
        'index': 1,
        'middle': 2,
        'ring': 3,
        'pinky': 4,
        'palm': 20
    };
    return trackPointMap[trackPoint] || 1;  // default to index finger
}

// Update trajectory with current frame data
function updateTrajectory(scene, currentTime) {
    if (!useWorldCoordinates || !trajectorySettings.enabled) {
        // Remove trajectory line if it exists
        if (trajectoryLine && scene) {
            scene.remove(trajectoryLine);
            if (trajectoryLine.geometry) trajectoryLine.geometry.dispose();
            if (trajectoryLine.material) trajectoryLine.material.dispose();
            trajectoryLine = null;
        }
        trajectoryPoints = [];
        return;
    }

    if (!handLandmarksData || !handLandmarksData.right_hand || !handTimestamps || handTimestamps.length === 0) {
        return;
    }

    // Calculate time range for trajectory
    const startTime = currentTime - trajectorySettings.duration;
    const trackPointIdx = getTrackPointIndex(trajectorySettings.trackPoint);

    // Collect points within the time range
    trajectoryPoints = [];
    for (let i = 0; i < handTimestamps.length; i++) {
        const t = handTimestamps[i];
        if (t >= startTime && t <= currentTime) {
            const landmarks = handLandmarksData.right_hand[i];
            if (landmarks && landmarks.length > trackPointIdx) {
                const point = landmarks[trackPointIdx];
                if (point && point.length >= 3) {
                    // Apply hand pose transform to trajectory point (same as hand landmarks)
                    const wrist = landmarks[5] || [0, 0, 0];  // Use wrist as reference
                    const transformedPoint = applyHandPoseTransformToPoint(point, wrist);
                    trajectoryPoints.push(new THREE.Vector3(transformedPoint[0], transformedPoint[1], transformedPoint[2]));
                }
            }
        }
    }

    // Need at least 2 points to draw a line
    if (trajectoryPoints.length < 2) {
        if (trajectoryLine && scene) {
            scene.remove(trajectoryLine);
        }
        return;
    }

    // Create or update trajectory line
    if (trajectoryLine) {
        scene.remove(trajectoryLine);
        if (trajectoryLine.geometry) trajectoryLine.geometry.dispose();
        if (trajectoryLine.material) trajectoryLine.material.dispose();
    }

    // Create gradient colors from old (blue) to new (red)
    const colors = [];
    for (let i = 0; i < trajectoryPoints.length; i++) {
        const t = i / (trajectoryPoints.length - 1);  // 0 to 1
        // Gradient: blue (old) -> cyan -> green -> yellow -> red (new)
        const color = new THREE.Color();
        color.setHSL(0.6 - t * 0.6, 1.0, 0.5);  // H: 0.6 (blue) to 0 (red)
        colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(trajectoryPoints);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: trajectorySettings.lineWidth  // Note: linewidth > 1 only works on some platforms
    });

    trajectoryLine = new THREE.Line(geometry, material);
    trajectoryLine.userData.isTrajectory = true;
    scene.add(trajectoryLine);
}

// Clear trajectory from scene
function clearTrajectory(scene) {
    if (trajectoryLine && scene) {
        scene.remove(trajectoryLine);
        if (trajectoryLine.geometry) trajectoryLine.geometry.dispose();
        if (trajectoryLine.material) trajectoryLine.material.dispose();
        trajectoryLine = null;
    }
    trajectoryPoints = [];
}

// Render hand landmarks
function renderHandLandmarks(scene, landmarks, isMapped = false) {
    if (!scene) {
        return;
    }

    // Clear previous hand objects and dispose resources
    const objectsToRemove = [];
    scene.children.forEach(child => {
        if (child.userData.isHandLandmark) {
            objectsToRemove.push(child);
        }
    });
    objectsToRemove.forEach(obj => {
        scene.remove(obj);
        // Dispose line geometries (spheres use shared geometry)
        if (obj.geometry && obj.userData.isLine) {
            obj.geometry.dispose();
        }
    });

    if (!landmarks || landmarks.length !== 21) {
        return;
    }

    // Create shared geometry for spheres (reuse to avoid memory leaks)
    if (!handLandmarkGeometry) {
        handLandmarkGeometry = new THREE.SphereGeometry(0.005, 8, 8);
    }

    // Create joint spheres with finger-based coloring (darker = further from wrist)
    landmarks.forEach((point, idx) => {
        if (!point || point.length < 3) {
            return;
        }

        // Get finger info and calculate color based on depth
        const fingerInfo = getLandmarkFingerInfo(idx);
        const color = getLandmarkColor(fingerInfo.finger, fingerInfo.depth, fingerInfo.maxDepth);

        // Reuse materials to avoid memory leaks
        if (!handLandmarkMaterials[color]) {
            handLandmarkMaterials[color] = new THREE.MeshPhongMaterial({ color: color });
        }

        const sphere = new THREE.Mesh(handLandmarkGeometry, handLandmarkMaterials[color]);
        sphere.position.set(point[0], point[1], point[2]);
        sphere.userData.isHandLandmark = true;
        scene.add(sphere);
    });

    // Draw skeleton if enabled
    if (mappingSettings.showSkeleton) {
        HAND_CONNECTIONS.forEach(([i, j]) => {
            const start = landmarks[i];
            const end = landmarks[j];
            if (!start || !end || start.length < 3 || end.length < 3) return;

            // Line geometries must be created each frame (positions change)
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(start[0], start[1], start[2]),
                new THREE.Vector3(end[0], end[1], end[2])
            ]);

            // Use the color of the endpoint further from wrist (higher depth = darker)
            const infoI = getLandmarkFingerInfo(i);
            const infoJ = getLandmarkFingerInfo(j);
            // Use the finger of the point with higher depth, or the one that's not wrist/palm
            let fingerInfo;
            if (infoI.finger === 'wrist' || infoI.finger === 'palm') {
                fingerInfo = infoJ;
            } else if (infoJ.finger === 'wrist' || infoJ.finger === 'palm') {
                fingerInfo = infoI;
            } else {
                fingerInfo = infoI.depth > infoJ.depth ? infoI : infoJ;
            }
            // Use average depth for the line color
            const avgDepth = (infoI.depth + infoJ.depth) / 2;
            const color = getLandmarkColor(fingerInfo.finger, avgDepth, fingerInfo.maxDepth);

            // Reuse line materials
            const matKey = 'line_' + color;
            if (!handLandmarkMaterials[matKey]) {
                handLandmarkMaterials[matKey] = new THREE.LineBasicMaterial({ color: color });
            }

            const line = new THREE.Line(lineGeometry, handLandmarkMaterials[matKey]);
            line.userData.isHandLandmark = true;
            line.userData.isLine = true;
            scene.add(line);
        });
    }
}

// ==================== Hand Mesh Visualization ====================

/**
 * MPS Hand Landmark 索引 (21个点):
 * 0: thumb_tip, 1: index_tip, 2: middle_tip, 3: ring_tip, 4: pinky_tip
 * 5: wrist
 * 6-7: thumb_joints, 8-10: index_joints, 11-13: middle_joints
 * 14-16: ring_joints, 17-19: pinky_joints, 20: palm_center
 */

// 简化手部mesh - 使用程序化生成的圆柱体和球体组成手部形状
let handMeshGroup = null;
let handMeshParts = {};
// 存储每个segment的mesh引用，用于直接根据landmark位置更新
let handSegmentMeshes = {};

// MANO模型相关
let manoMesh = null;
let manoData = null;  // JSON数据（关节、权重等）
let manoOriginalPositions = null;  // 原始顶点位置
let manoLoaded = false;
let useManoModel = true;  // 是否使用MANO模型（如果加载成功）

/**
 * MPS Hand Landmark索引定义:
 * 0: 拇指指尖, 1: 食指指尖, 2: 中指指尖, 3: 无名指指尖, 4: 小指指尖
 * 5: 手腕
 * 6, 7: 拇指关节 (从基部到指尖方向)
 * 8, 9, 10: 食指关节
 * 11, 12, 13: 中指关节
 * 14, 15, 16: 无名指关节
 * 17, 18, 19: 小指关节
 * 20: 掌心中心
 */
const MPS_LANDMARK = {
    THUMB_TIP: 0, INDEX_TIP: 1, MIDDLE_TIP: 2, RING_TIP: 3, PINKY_TIP: 4,
    WRIST: 5,
    THUMB_MCP: 6, THUMB_IP: 7,
    INDEX_MCP: 8, INDEX_PIP: 9, INDEX_DIP: 10,
    MIDDLE_MCP: 11, MIDDLE_PIP: 12, MIDDLE_DIP: 13,
    RING_MCP: 14, RING_PIP: 15, RING_DIP: 16,
    PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19,
    PALM_CENTER: 20
};

// 手指的landmark索引映射 (从基部到指尖)
const FINGER_LANDMARKS = {
    thumb:  [MPS_LANDMARK.WRIST, MPS_LANDMARK.THUMB_MCP, MPS_LANDMARK.THUMB_IP, MPS_LANDMARK.THUMB_TIP],
    index:  [MPS_LANDMARK.PALM_CENTER, MPS_LANDMARK.INDEX_MCP, MPS_LANDMARK.INDEX_PIP, MPS_LANDMARK.INDEX_DIP, MPS_LANDMARK.INDEX_TIP],
    middle: [MPS_LANDMARK.PALM_CENTER, MPS_LANDMARK.MIDDLE_MCP, MPS_LANDMARK.MIDDLE_PIP, MPS_LANDMARK.MIDDLE_DIP, MPS_LANDMARK.MIDDLE_TIP],
    ring:   [MPS_LANDMARK.PALM_CENTER, MPS_LANDMARK.RING_MCP, MPS_LANDMARK.RING_PIP, MPS_LANDMARK.RING_DIP, MPS_LANDMARK.RING_TIP],
    pinky:  [MPS_LANDMARK.PALM_CENTER, MPS_LANDMARK.PINKY_MCP, MPS_LANDMARK.PINKY_PIP, MPS_LANDMARK.PINKY_DIP, MPS_LANDMARK.PINKY_TIP]
};

/**
 * 创建基于Landmark驱动的Skinned手部Mesh
 * 每个骨骼segment直接根据landmark位置定位，实现真正的骨骼驱动
 */
function createProceduralHandMesh() {
    if (handMeshGroup) {
        if (handMeshGroup.parent) {
            handMeshGroup.parent.remove(handMeshGroup);
        }
    }

    handMeshGroup = new THREE.Group();
    handMeshGroup.name = 'hand_mesh_skinned';
    handMeshGroup.userData.isHandMesh = true;
    handSegmentMeshes = {};

    const skinMaterial = new THREE.MeshPhongMaterial({
        color: 0xffccaa,
        transparent: true,
        opacity: 0.8,
        shininess: 30,
        side: THREE.DoubleSide
    });

    // 手指配置: 每段的半径比例
    const fingerConfig = {
        thumb:  { baseRadius: 0.010, segments: 3, taperRatio: [1.0, 0.9, 0.8] },
        index:  { baseRadius: 0.008, segments: 4, taperRatio: [1.0, 0.95, 0.85, 0.75] },
        middle: { baseRadius: 0.008, segments: 4, taperRatio: [1.0, 0.95, 0.85, 0.75] },
        ring:   { baseRadius: 0.007, segments: 4, taperRatio: [1.0, 0.95, 0.85, 0.75] },
        pinky:  { baseRadius: 0.006, segments: 4, taperRatio: [1.0, 0.95, 0.85, 0.75] }
    };

    // 为每个手指创建独立的segment meshes和关节球
    Object.keys(fingerConfig).forEach(fingerName => {
        const config = fingerConfig[fingerName];
        handSegmentMeshes[fingerName] = [];
        handSegmentMeshes[fingerName + '_joints'] = [];

        for (let i = 0; i < config.segments; i++) {
            // 创建可变形的胶囊状segment
            const radiusTop = config.baseRadius * config.taperRatio[Math.min(i + 1, config.taperRatio.length - 1)];
            const radiusBottom = config.baseRadius * config.taperRatio[i];

            // 使用CylinderGeometry，后续会根据landmark动态更新
            const segGeom = new THREE.CylinderGeometry(radiusTop, radiusBottom, 0.02, 12, 1);
            const segment = new THREE.Mesh(segGeom, skinMaterial.clone());
            segment.name = `${fingerName}_seg_${i}`;
            segment.userData.fingerName = fingerName;
            segment.userData.segmentIndex = i;

            handMeshGroup.add(segment);
            handSegmentMeshes[fingerName].push(segment);

            // 在每个关节位置创建球体（除了指尖）
            const jointRadius = radiusBottom * 1.15;
            const jointGeom = new THREE.SphereGeometry(jointRadius, 10, 8);
            const jointMesh = new THREE.Mesh(jointGeom, skinMaterial.clone());
            jointMesh.name = `${fingerName}_joint_${i}`;
            jointMesh.userData.fingerName = fingerName;
            jointMesh.userData.jointIndex = i;
            handMeshGroup.add(jointMesh);
            handSegmentMeshes[fingerName + '_joints'].push(jointMesh);
        }

        // 添加指尖球
        const tipRadius = config.baseRadius * config.taperRatio[config.taperRatio.length - 1] * 1.1;
        const tipGeom = new THREE.SphereGeometry(tipRadius, 10, 8);
        const tipMesh = new THREE.Mesh(tipGeom, skinMaterial.clone());
        tipMesh.name = `${fingerName}_tip`;
        tipMesh.userData.fingerName = fingerName;
        tipMesh.userData.isTip = true;
        handMeshGroup.add(tipMesh);
        handSegmentMeshes[fingerName + '_tip'] = tipMesh;
    });

    // 创建掌心mesh (连接手腕和各手指基部)
    const palmGeom = new THREE.BufferGeometry();
    const palmMesh = new THREE.Mesh(palmGeom, skinMaterial.clone());
    palmMesh.name = 'palm_mesh';
    palmMesh.userData.isPalm = true;
    handMeshGroup.add(palmMesh);
    handSegmentMeshes.palm = palmMesh;

    // 创建手腕mesh
    const wristGeom = new THREE.SphereGeometry(0.015, 12, 8);
    const wristMesh = new THREE.Mesh(wristGeom, skinMaterial.clone());
    wristMesh.name = 'wrist_mesh';
    handMeshGroup.add(wristMesh);
    handSegmentMeshes.wrist = wristMesh;

    console.log('Skinned hand mesh created with', Object.keys(handSegmentMeshes).length, 'parts');
    return handMeshGroup;
}

// 防止重复加载
let manoLoadingPromise = null;

/**
 * 加载MANO模型（OBJ + JSON）
 */
async function loadManoModel() {
    if (manoLoaded && manoMesh) return manoMesh;

    // 如果正在加载，等待加载完成
    if (manoLoadingPromise) return manoLoadingPromise;

    manoLoadingPromise = (async () => {
    try {
        // 并行加载OBJ和JSON
        const [objResponse, jsonResponse] = await Promise.all([
            fetch('/static/models/mano_right.obj'),
            fetch('/static/models/mano_right.json')
        ]);

        if (!objResponse.ok || !jsonResponse.ok) {
            throw new Error('Failed to load MANO model files');
        }

        // 解析JSON数据
        manoData = await jsonResponse.json();

        // 解析OBJ
        const objText = await objResponse.text();

        // 检查OBJLoader是否可用
        if (typeof THREE.OBJLoader === 'undefined') {
            console.warn('OBJLoader not available, falling back to procedural mesh');
            return createProceduralHandMesh();
        }

        const loader = new THREE.OBJLoader();
        const obj = loader.parse(objText);

        // 获取mesh
        let mesh = null;
        obj.traverse(child => {
            if (child.isMesh && !mesh) {
                mesh = child;
            }
        });

        if (!mesh) {
            throw new Error('No mesh found in OBJ');
        }

        // 设置材质 - 使用肤色
        mesh.material = new THREE.MeshPhongMaterial({
            color: 0xffdbac,  // 肤色
            transparent: false,
            opacity: 1.0,
            shininess: 30,
            side: THREE.DoubleSide
        });

        mesh.name = 'mano_hand';
        mesh.userData.isHandMesh = true;
        mesh.userData.isMano = true;

        // 禁用视锥裁剪，确保mesh始终渲染
        mesh.frustumCulled = false;

        // OBJ 加载后顶点会被展开（每个面独立顶点）
        // 需要建立从展开顶点到原始顶点的映射
        const positions = mesh.geometry.attributes.position;
        const expandedCount = positions.count;  // 4614
        const originalCount = manoData.num_vertices;  // 778

        console.log('Building vertex mapping: expanded=', expandedCount, 'original=', originalCount);

        // 从 OBJ 文本手动解析原始顶点
        const lines = objText.split('\n');
        const originalVertices = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] === 'v' && parts.length >= 4) {
                originalVertices.push([
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                ]);
            }
        }
        console.log('Parsed original vertices:', originalVertices.length);

        // 建立展开顶点到原始顶点的映射
        // 通过位置匹配找到对应关系
        const vertexMapping = new Int32Array(expandedCount);
        const tolerance = 0.00001;

        for (let i = 0; i < expandedCount; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            // 找到最近的原始顶点
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let j = 0; j < originalVertices.length; j++) {
                const dx = x - originalVertices[j][0];
                const dy = y - originalVertices[j][1];
                const dz = z - originalVertices[j][2];
                const dist = dx*dx + dy*dy + dz*dz;
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = j;
                }
                if (dist < tolerance) break;
            }
            vertexMapping[i] = bestIdx;
        }

        // 保存映射和原始顶点
        mesh.userData.vertexMapping = vertexMapping;
        mesh.userData.originalVertices = originalVertices;

        // 保存展开后的原始顶点位置（用于变形）
        manoOriginalPositions = new Float32Array(positions.array);

        // 计算法线和包围盒
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();

        manoMesh = mesh;
        manoLoaded = true;

        // 调试：检查geometry
        console.log('MANO geometry: expanded vertices=', expandedCount, 'original=', originalCount);
        const bb = mesh.geometry.boundingBox;
        console.log('BoundingBox: min=', bb.min, 'max=', bb.max);

        return mesh;

    } catch (error) {
        console.error('Error loading MANO model:', error);
        useManoModel = false;
        return createProceduralHandMesh();
    }
    })();

    return manoLoadingPromise;
}

/**
 * MANO到MPS的关节映射
 * MANO有16个关节，MPS有21个landmark
 */
const MANO_TO_MPS = {
    0: 5,   // wrist -> wrist
    1: 8,   // index MCP
    2: 9,   // index PIP
    3: 10,  // index DIP
    4: 11,  // middle MCP
    5: 12,  // middle PIP
    6: 13,  // middle DIP
    7: 14,  // ring MCP
    8: 15,  // ring PIP
    9: 16,  // ring DIP
    10: 17, // pinky MCP
    11: 18, // pinky PIP
    12: 19, // pinky DIP
    13: 6,  // thumb MCP
    14: 7,  // thumb IP
    15: 0   // thumb tip (用指尖近似)
};

/**
 * 根据MPS landmarks更新MANO mesh
 * 使用LBS（线性混合蒙皮）驱动手指变形
 */
function updateManoMeshFromLandmarks(landmarks) {
    if (!manoMesh) {
        console.warn('updateManoMesh: manoMesh is null');
        return;
    }
    if (!landmarks || landmarks.length !== 21) {
        console.warn('updateManoMesh: invalid landmarks');
        return;
    }

    // 获取MPS关键点
    const wristPos = landmarks[MPS_LANDMARK.WRIST];
    const palmCenter = landmarks[MPS_LANDMARK.PALM_CENTER];
    const indexMCP = landmarks[MPS_LANDMARK.INDEX_MCP];
    const pinkyMCP = landmarks[MPS_LANDMARK.PINKY_MCP];
    const middleTip = landmarks[MPS_LANDMARK.MIDDLE_TIP];

    if (!wristPos || !palmCenter || !middleTip) {
        console.warn('updateManoMesh: missing key landmarks, using default position');
        manoMesh.position.set(0, 0, 0);
        manoMesh.scale.set(1, 1, 1);
        return;
    }

    // 计算MPS手的大小（手腕到中指尖）
    const mpsHandSize = Math.sqrt(
        Math.pow(middleTip[0] - wristPos[0], 2) +
        Math.pow(middleTip[1] - wristPos[1], 2) +
        Math.pow(middleTip[2] - wristPos[2], 2)
    );

    // MANO原始手大小 (约0.15m)
    const manoHandSize = 0.15;
    let scale = mpsHandSize / manoHandSize;

    // 限制scale范围，防止异常值
    if (isNaN(scale) || scale <= 0 || scale > 10) {
        scale = 1.0;
    }

    // MANO模型中手腕位置偏移 (手腕不在原点)
    const manoWristOffset = new THREE.Vector3(0.096, 0.006, 0.006);

    // 计算手掌方向（MPS: 从手腕到掌心）
    const mpsForward = new THREE.Vector3(
        palmCenter[0] - wristPos[0],
        palmCenter[1] - wristPos[1],
        palmCenter[2] - wristPos[2]
    ).normalize();

    // 计算侧向（MPS: 从食指到小指）
    const mpsSide = new THREE.Vector3(
        pinkyMCP[0] - indexMCP[0],
        pinkyMCP[1] - indexMCP[1],
        pinkyMCP[2] - indexMCP[2]
    ).normalize();

    // 手掌法线
    const mpsUp = new THREE.Vector3().crossVectors(mpsForward, mpsSide).normalize();
    mpsSide.crossVectors(mpsUp, mpsForward).normalize();

    // 构建从 MPS 到 MANO 的旋转矩阵
    // MANO坐标系: -X指向指尖, Y手掌法线, Z侧向(pinky->index)
    const rotMatrix = new THREE.Matrix4();
    const negForward = mpsForward.clone().negate();
    const negSide = mpsSide.clone().negate();  // 翻转侧向，修正大拇指方向
    const negUp = mpsUp.clone().negate();      // 同时翻转法线保持右手坐标系
    rotMatrix.makeBasis(negForward, negUp, negSide);

    const quaternion = new THREE.Quaternion();
    quaternion.setFromRotationMatrix(rotMatrix);

    // 计算逆旋转（用于将 MPS landmarks 转换到 MANO 局部坐标系）
    const inverseQuat = quaternion.clone().invert();

    // === LBS 顶点变形 ===
    // 暂时禁用 LBS，先确保基本显示正确
    const enableLBS = true;  // 设为 false 可禁用 LBS
    if (enableLBS && manoData && manoOriginalPositions && manoData.skinning_weights) {
        applyLBSDeformation(landmarks, scale, inverseQuat, wristPos);
    } else {
        if (lbsDebugCounter < 5) {
            console.warn('LBS skipped:', {
                enableLBS: enableLBS,
                manoData: !!manoData,
                manoOriginalPositions: !!manoOriginalPositions,
                skinning_weights: manoData ? !!manoData.skinning_weights : false
            });
            lbsDebugCounter++;
        }
    }

    // 应用变换
    manoMesh.scale.set(scale, scale, scale);
    manoMesh.quaternion.copy(quaternion);

    // 计算旋转后的手腕偏移
    const rotatedWristOffset = manoWristOffset.clone().multiplyScalar(scale);
    rotatedWristOffset.applyQuaternion(quaternion);

    // 设置位置
    manoMesh.position.set(
        wristPos[0] - rotatedWristOffset.x,
        wristPos[1] - rotatedWristOffset.y,
        wristPos[2] - rotatedWristOffset.z
    );
}

/**
 * 从 MPS landmarks 计算关节局部旋转矩阵
 * MANO 使用层级骨骼结构：wrist -> MCP -> PIP -> DIP
 */
function computeJointRotationsFromLandmarks(landmarks) {
    if (!manoData) return null;

    const restJoints = manoData.joints;
    const parents = manoData.kintree_parents;
    const numJoints = 16;

    // 初始化为单位矩阵
    const rotations = [];
    for (let i = 0; i < numJoints; i++) {
        rotations.push(new THREE.Matrix4().identity());
    }

    // MPS landmark 索引 (使用常量确保正确)
    // 0-4: 指尖 (thumb, index, middle, ring, pinky)
    // 5: 手腕
    // 6-7: 拇指 MCP, IP
    // 8-10: 食指 MCP, PIP, DIP
    // 11-13: 中指 MCP, PIP, DIP
    // 14-16: 无名指 MCP, PIP, DIP
    // 17-19: 小指 MCP, PIP, DIP
    // 20: 掌心

    // MANO 关节顺序 (根据 kintree):
    // 0: wrist (root)
    // 1-3: index (MCP, PIP, DIP)
    // 4-6: middle (MCP, PIP, DIP)
    // 7-9: ring (MCP, PIP, DIP)
    // 10-12: pinky (MCP, PIP, DIP)
    // 13-15: thumb (MCP, IP, TIP)

    // 手指链定义：MPS 索引 [MCP, PIP, DIP, TIP]
    const fingerChains = {
        index:  { manoBase: 1,  mpsIndices: [MPS_LANDMARK.INDEX_MCP, MPS_LANDMARK.INDEX_PIP, MPS_LANDMARK.INDEX_DIP, MPS_LANDMARK.INDEX_TIP] },
        middle: { manoBase: 4,  mpsIndices: [MPS_LANDMARK.MIDDLE_MCP, MPS_LANDMARK.MIDDLE_PIP, MPS_LANDMARK.MIDDLE_DIP, MPS_LANDMARK.MIDDLE_TIP] },
        ring:   { manoBase: 7,  mpsIndices: [MPS_LANDMARK.RING_MCP, MPS_LANDMARK.RING_PIP, MPS_LANDMARK.RING_DIP, MPS_LANDMARK.RING_TIP] },
        pinky:  { manoBase: 10, mpsIndices: [MPS_LANDMARK.PINKY_MCP, MPS_LANDMARK.PINKY_PIP, MPS_LANDMARK.PINKY_DIP, MPS_LANDMARK.PINKY_TIP] },
        thumb:  { manoBase: 13, mpsIndices: [MPS_LANDMARK.THUMB_MCP, MPS_LANDMARK.THUMB_IP, MPS_LANDMARK.THUMB_TIP, MPS_LANDMARK.THUMB_TIP] }
    };

    // 获取手腕位置作为参考
    const wrist = landmarks[MPS_LANDMARK.WRIST];
    if (!wrist) return rotations;

    let debugCount = 0;

    // 对每个手指计算关节旋转
    Object.keys(fingerChains).forEach(fingerName => {
        const chain = fingerChains[fingerName];
        const mpsIndices = chain.mpsIndices;

        // 获取 MPS 中的关节位置
        const mpsPositions = mpsIndices.map(idx => {
            const pos = landmarks[idx];
            if (!pos) return null;
            return new THREE.Vector3(pos[0], pos[1], pos[2]);
        });

        // 如果有缺失的 landmark，跳过
        if (mpsPositions.some(p => p === null)) {
            if (debugCount < 1) {
                console.warn('Missing landmark for', fingerName);
            }
            return;
        }

        // 计算每个关节的旋转 (只处理 MCP, PIP, DIP - 3 个关节)
        const numFingerJoints = (fingerName === 'thumb') ? 3 : 3;
        for (let i = 0; i < numFingerJoints; i++) {
            const manoJointIdx = chain.manoBase + i;
            let parentIdx = parents[manoJointIdx];

            // 处理无效的 parent 索引
            if (parentIdx < 0 || parentIdx >= numJoints || parentIdx === 4294967295) {
                parentIdx = 0;
            }

            // 当前关节在 rest pose 中的方向（从父关节到当前关节）
            const restDir = new THREE.Vector3(
                restJoints[manoJointIdx][0] - restJoints[parentIdx][0],
                restJoints[manoJointIdx][1] - restJoints[parentIdx][1],
                restJoints[manoJointIdx][2] - restJoints[parentIdx][2]
            );

            // 防止零向量
            if (restDir.length() < 0.0001) {
                continue;
            }
            restDir.normalize();

            // 目标方向（从 MPS landmarks）
            // i=0: MCP -> PIP
            // i=1: PIP -> DIP
            // i=2: DIP -> TIP
            let targetDir;
            if (i < 3) {
                targetDir = mpsPositions[i + 1].clone().sub(mpsPositions[i]);
            } else {
                continue;
            }

            // 防止零向量
            if (targetDir.length() < 0.0001) {
                continue;
            }
            targetDir.normalize();

            // 计算从 rest 到 target 的旋转
            const quaternion = new THREE.Quaternion().setFromUnitVectors(restDir, targetDir);
            const rotMatrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);

            rotations[manoJointIdx] = rotMatrix;
        }
        debugCount++;
    });

    return rotations;
}

// 调试计数器，避免过多日志
let lbsDebugCounter = 0;

/**
 * 从两个方向向量计算旋转四元数
 */
function quaternionFromDirections(fromDir, toDir) {
    const from = fromDir.clone().normalize();
    const to = toDir.clone().normalize();

    const dot = from.dot(to);

    if (dot > 0.9999) {
        return new THREE.Quaternion(); // 单位四元数
    }

    if (dot < -0.9999) {
        // 反向，找垂直轴
        let axis = new THREE.Vector3(1, 0, 0).cross(from);
        if (axis.lengthSq() < 0.001) {
            axis = new THREE.Vector3(0, 1, 0).cross(from);
        }
        axis.normalize();
        return new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
    }

    const axis = from.clone().cross(to).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

/**
 * 基于旋转的 LBS - 每个关节有旋转四元数
 * 顶点绕关节中心旋转，而不是简单位移
 */
function applyLBSDeformation(landmarks, scale, inverseQuat, wristPos) {
    if (!manoMesh || !manoData || !manoOriginalPositions) {
        if (lbsDebugCounter < 5) {
            console.warn('applyLBSDeformation: missing data');
            lbsDebugCounter++;
        }
        return;
    }

    const positions = manoMesh.geometry.attributes.position;
    const weights = manoData.skinning_weights.data;
    const restJoints = manoData.joints;
    const kintreeParents = manoData.kintree_parents;
    const numJoints = 16;
    const numVertices = manoData.num_vertices;

    const shouldDebug = (lbsDebugCounter % 100 === 0) && lbsDebugCounter < 500;
    lbsDebugCounter++;

    // MANO 到 MPS 的映射
    const manoToMps = manoData.mano_to_mps_mapping || {
        0: 5, 1: 8, 2: 9, 3: 10, 4: 11, 5: 12, 6: 13,
        7: 14, 8: 15, 9: 16, 10: 17, 11: 18, 12: 19,
        13: 6, 14: 7, 15: 0
    };

    // 子关节映射（用于计算骨骼方向）
    const childJoint = {
        0: 4,   // wrist -> middle_mcp (用中指作为参考)
        1: 2, 2: 3, 3: -1,      // index: MCP->PIP->DIP->TIP
        4: 5, 5: 6, 6: -1,      // middle
        7: 8, 8: 9, 9: -1,      // ring
        10: 11, 11: 12, 12: -1, // pinky
        13: 14, 14: 15, 15: -1  // thumb
    };

    // TIP landmarks 对应
    const tipLandmark = {
        3: 1, 6: 2, 9: 3, 12: 4, 15: 0  // DIP -> TIP
    };

    // 将 MPS landmarks 转换到 MANO 局部坐标系
    const manoWrist = new THREE.Vector3(restJoints[0][0], restJoints[0][1], restJoints[0][2]);

    // 计算缩放
    const mpsIndexMCP = landmarks[manoToMps[1]];
    let internalScale = 1.0;
    if (mpsIndexMCP) {
        const mpsRefDist = Math.sqrt(
            Math.pow(mpsIndexMCP[0] - wristPos[0], 2) +
            Math.pow(mpsIndexMCP[1] - wristPos[1], 2) +
            Math.pow(mpsIndexMCP[2] - wristPos[2], 2)
        );
        const manoRefDist = Math.sqrt(
            Math.pow(restJoints[1][0] - restJoints[0][0], 2) +
            Math.pow(restJoints[1][1] - restJoints[0][1], 2) +
            Math.pow(restJoints[1][2] - restJoints[0][2], 2)
        );
        if (mpsRefDist > 0.001) {
            internalScale = manoRefDist / mpsRefDist;
        }
    }

    // 计算当前关节位置（MANO 局部坐标系）
    const currentJoints = [];
    for (let k = 0; k < numJoints; k++) {
        const mpsIdx = manoToMps[k];
        const mpsPos = landmarks[mpsIdx];

        if (mpsPos && k > 0) {
            const relWorld = new THREE.Vector3(
                mpsPos[0] - wristPos[0],
                mpsPos[1] - wristPos[1],
                mpsPos[2] - wristPos[2]
            );
            const localRel = relWorld.applyQuaternion(inverseQuat).multiplyScalar(internalScale);
            currentJoints.push(manoWrist.clone().add(localRel));
        } else {
            currentJoints.push(new THREE.Vector3(restJoints[k][0], restJoints[k][1], restJoints[k][2]));
        }
    }

    // 计算每个关节的局部旋转四元数
    // 通过比较 rest pose 和 current pose 的骨骼方向
    const jointRotations = [];

    for (let k = 0; k < numJoints; k++) {
        const child = childJoint[k];
        let restDir, currDir;

        if (child >= 0) {
            // 有子关节：计算到子关节的方向
            restDir = new THREE.Vector3(
                restJoints[child][0] - restJoints[k][0],
                restJoints[child][1] - restJoints[k][1],
                restJoints[child][2] - restJoints[k][2]
            );
            currDir = currentJoints[child].clone().sub(currentJoints[k]);
        } else if (tipLandmark[k] !== undefined) {
            // DIP 关节：使用 TIP landmark
            const tipMps = tipLandmark[k];
            const tipPos = landmarks[tipMps];
            if (tipPos) {
                const relWorld = new THREE.Vector3(
                    tipPos[0] - wristPos[0],
                    tipPos[1] - wristPos[1],
                    tipPos[2] - wristPos[2]
                );
                const tipLocal = relWorld.clone().applyQuaternion(inverseQuat).multiplyScalar(internalScale);
                tipLocal.add(manoWrist);

                // Rest pose: 延伸父关节方向
                const parentK = kintreeParents[k];
                if (parentK !== 4294967295) {
                    restDir = new THREE.Vector3(
                        restJoints[k][0] - restJoints[parentK][0],
                        restJoints[k][1] - restJoints[parentK][1],
                        restJoints[k][2] - restJoints[parentK][2]
                    );
                    currDir = tipLocal.clone().sub(currentJoints[k]);
                } else {
                    jointRotations.push(new THREE.Quaternion());
                    continue;
                }
            } else {
                jointRotations.push(new THREE.Quaternion());
                continue;
            }
        } else {
            jointRotations.push(new THREE.Quaternion());
            continue;
        }

        // 计算旋转
        if (restDir.lengthSq() > 0.0001 && currDir.lengthSq() > 0.0001) {
            const quat = quaternionFromDirections(restDir, currDir);
            jointRotations.push(quat);
        } else {
            jointRotations.push(new THREE.Quaternion());
        }
    }

    if (shouldDebug) {
        console.log('=== LBS Rotation Debug ===');
        // 检查各手指 MCP 旋转
        const fingerNames = ['', 'index', '', '', 'middle', '', '', 'ring', '', '', 'pinky', '', '', 'thumb'];
        [1, 4, 7, 10, 13].forEach(idx => {
            const q = jointRotations[idx];
            const euler = new THREE.Euler().setFromQuaternion(q);
            console.log(fingerNames[idx], 'MCP rotation (deg):',
                (euler.x * 180/Math.PI).toFixed(1),
                (euler.y * 180/Math.PI).toFixed(1),
                (euler.z * 180/Math.PI).toFixed(1)
            );
        });

        // 检查 ring 和 pinky 的 restDir 和 currDir
        console.log('=== Ring/Pinky Direction Debug ===');
        [7, 10].forEach(k => {
            const child = childJoint[k];
            if (child >= 0) {
                const restDir = new THREE.Vector3(
                    restJoints[child][0] - restJoints[k][0],
                    restJoints[child][1] - restJoints[k][1],
                    restJoints[child][2] - restJoints[k][2]
                ).normalize();
                const currDir = currentJoints[child].clone().sub(currentJoints[k]).normalize();
                console.log('Joint', k, '(' + fingerNames[k] + ') MCP:');
                console.log('  restDir:', restDir.x.toFixed(3), restDir.y.toFixed(3), restDir.z.toFixed(3));
                console.log('  currDir:', currDir.x.toFixed(3), currDir.y.toFixed(3), currDir.z.toFixed(3));
                console.log('  currentJoint[k]:', currentJoints[k].x.toFixed(4), currentJoints[k].y.toFixed(4), currentJoints[k].z.toFixed(4));
                console.log('  currentJoint[child]:', currentJoints[child].x.toFixed(4), currentJoints[child].y.toFixed(4), currentJoints[child].z.toFixed(4));
            }
        });

        // 检查食指旋转（保留原有的）
        const q = jointRotations[1];
        const euler = new THREE.Euler().setFromQuaternion(q);
        console.log('Index MCP rotation (deg):',
            (euler.x * 180/Math.PI).toFixed(1),
            (euler.y * 180/Math.PI).toFixed(1),
            (euler.z * 180/Math.PI).toFixed(1)
        );

        // 比较 MANO 和 MPS 各手指的比例
        console.log('=== Finger Length Ratio Analysis ===');

        // 计算距离的辅助函数
        const dist = (p1, p2) => Math.sqrt(
            Math.pow(p1[0]-p2[0], 2) + Math.pow(p1[1]-p2[1], 2) + Math.pow(p1[2]-p2[2], 2)
        );
        const dist3 = (v1, v2) => Math.sqrt(
            Math.pow(v1.x-v2.x, 2) + Math.pow(v1.y-v2.y, 2) + Math.pow(v1.z-v2.z, 2)
        );

        // MANO 手腕到各 MCP 的距离
        const manoWristToIndex = dist(restJoints[0], restJoints[1]);
        const manoWristToMiddle = dist(restJoints[0], restJoints[4]);
        const manoWristToRing = dist(restJoints[0], restJoints[7]);
        const manoWristToPinky = dist(restJoints[0], restJoints[10]);
        const manoWristToThumb = dist(restJoints[0], restJoints[13]);

        // MPS 手腕到各 MCP 的距离
        const mpsWrist = landmarks[5];
        const mpsWristToIndex = dist(mpsWrist, landmarks[8]);
        const mpsWristToMiddle = dist(mpsWrist, landmarks[11]);
        const mpsWristToRing = dist(mpsWrist, landmarks[14]);
        const mpsWristToPinky = dist(mpsWrist, landmarks[17]);
        const mpsWristToThumb = dist(mpsWrist, landmarks[6]);

        // 以 index 为基准，计算各手指的相对比例
        console.log('Wrist to MCP ratios (relative to index):');
        console.log('  MANO - index:1.00, middle:', (manoWristToMiddle/manoWristToIndex).toFixed(3),
            ', ring:', (manoWristToRing/manoWristToIndex).toFixed(3),
            ', pinky:', (manoWristToPinky/manoWristToIndex).toFixed(3),
            ', thumb:', (manoWristToThumb/manoWristToIndex).toFixed(3));
        console.log('  MPS  - index:1.00, middle:', (mpsWristToMiddle/mpsWristToIndex).toFixed(3),
            ', ring:', (mpsWristToRing/mpsWristToIndex).toFixed(3),
            ', pinky:', (mpsWristToPinky/mpsWristToIndex).toFixed(3),
            ', thumb:', (mpsWristToThumb/mpsWristToIndex).toFixed(3));

        // 计算各手指总长度 (MCP to TIP)
        // MANO: MCP -> PIP -> DIP (没有 TIP，用 DIP 近似)
        const manoIndexLen = dist(restJoints[1], restJoints[2]) + dist(restJoints[2], restJoints[3]);
        const manoMiddleLen = dist(restJoints[4], restJoints[5]) + dist(restJoints[5], restJoints[6]);
        const manoRingLen = dist(restJoints[7], restJoints[8]) + dist(restJoints[8], restJoints[9]);
        const manoPinkyLen = dist(restJoints[10], restJoints[11]) + dist(restJoints[11], restJoints[12]);
        const manoThumbLen = dist(restJoints[13], restJoints[14]) + dist(restJoints[14], restJoints[15]);

        // MPS: MCP -> PIP -> DIP -> TIP
        const mpsIndexLen = dist(landmarks[8], landmarks[9]) + dist(landmarks[9], landmarks[10]) + dist(landmarks[10], landmarks[1]);
        const mpsMiddleLen = dist(landmarks[11], landmarks[12]) + dist(landmarks[12], landmarks[13]) + dist(landmarks[13], landmarks[2]);
        const mpsRingLen = dist(landmarks[14], landmarks[15]) + dist(landmarks[15], landmarks[16]) + dist(landmarks[16], landmarks[3]);
        const mpsPinkyLen = dist(landmarks[17], landmarks[18]) + dist(landmarks[18], landmarks[19]) + dist(landmarks[19], landmarks[4]);
        const mpsThumbLen = dist(landmarks[6], landmarks[7]) + dist(landmarks[7], landmarks[0]);

        console.log('Finger length ratios (relative to index):');
        console.log('  MANO - index:1.00, middle:', (manoMiddleLen/manoIndexLen).toFixed(3),
            ', ring:', (manoRingLen/manoIndexLen).toFixed(3),
            ', pinky:', (manoPinkyLen/manoIndexLen).toFixed(3),
            ', thumb:', (manoThumbLen/manoIndexLen).toFixed(3));
        console.log('  MPS  - index:1.00, middle:', (mpsMiddleLen/mpsIndexLen).toFixed(3),
            ', ring:', (mpsRingLen/mpsIndexLen).toFixed(3),
            ', pinky:', (mpsPinkyLen/mpsIndexLen).toFixed(3),
            ', thumb:', (mpsThumbLen/mpsIndexLen).toFixed(3));

        // 直接比较 MANO vs MPS 的大拇指比例差异
        const manoThumbRatio = manoThumbLen / manoIndexLen;
        const mpsThumbRatio = mpsThumbLen / mpsIndexLen;
        console.log('Thumb ratio difference: MANO=' + manoThumbRatio.toFixed(3) + ', MPS=' + mpsThumbRatio.toFixed(3) +
            ', diff=' + ((manoThumbRatio - mpsThumbRatio) * 100).toFixed(1) + '%');
    }

    // 获取原始顶点
    const originalVertices = manoMesh.userData.originalVertices;
    if (!originalVertices) return;

    // 获取顶点映射
    const vertexMapping = manoMesh.userData.vertexMapping;
    if (!vertexMapping) return;

    // 为每个原始顶点计算变换后的位置
    const transformedVertices = new Array(numVertices);
    for (let v = 0; v < numVertices; v++) {
        transformedVertices[v] = new THREE.Vector3(
            originalVertices[v][0],
            originalVertices[v][1],
            originalVertices[v][2]
        );
    }

    // 应用 LBS：对每个顶点，根据权重应用关节旋转
    for (let i = 0; i < weights.length; i++) {
        const entry = weights[i];
        const v = entry.vertex;
        const jointIndices = entry.joints;
        const jointWeights = entry.weights;

        if (v >= numVertices) continue;

        const origPos = new THREE.Vector3(
            originalVertices[v][0],
            originalVertices[v][1],
            originalVertices[v][2]
        );

        // 累积变换后的位置
        const resultPos = new THREE.Vector3(0, 0, 0);
        let totalWeight = 0;

        for (let j = 0; j < jointIndices.length; j++) {
            const k = jointIndices[j];
            const w = jointWeights[j];

            if (w < 0.001 || k >= numJoints) continue;

            // 关节中心（rest pose）
            const jointCenter = new THREE.Vector3(
                restJoints[k][0],
                restJoints[k][1],
                restJoints[k][2]
            );

            // 顶点相对于关节的位置
            const relPos = origPos.clone().sub(jointCenter);

            // 应用旋转
            relPos.applyQuaternion(jointRotations[k]);

            // 加上关节的新位置（当前位置）
            const newPos = currentJoints[k].clone().add(relPos);

            // 加权累加
            resultPos.addScaledVector(newPos, w);
            totalWeight += w;
        }

        if (totalWeight > 0.001) {
            resultPos.divideScalar(totalWeight);
            transformedVertices[v].copy(resultPos);
        }
    }

    // 应用到展开顶点
    const expandedCount = positions.count;
    for (let i = 0; i < expandedCount; i++) {
        const origIdx = vertexMapping[i];
        const pos = transformedVertices[origIdx];
        positions.setXYZ(i, pos.x, pos.y, pos.z);
    }

    if (shouldDebug) {
        console.log('LBS rotation applied');
    }

    positions.needsUpdate = true;
    manoMesh.geometry.computeVertexNormals();
}

/**
 * 加载GLB格式的手部模型 (旧函数，保留兼容)
 * @param {string} url - GLB文件URL
 */
async function loadHandMeshModel(url) {
    return new Promise((resolve, reject) => {
        // 检查是否有GLTFLoader
        if (typeof THREE.GLTFLoader === 'undefined') {
            console.warn('GLTFLoader not available, using procedural hand mesh');
            const mesh = createProceduralHandMesh();
            handMeshLoaded = true;
            resolve(mesh);
            return;
        }

        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            function(gltf) {
                handMeshModel = gltf.scene;
                handMeshModel.name = 'hand_mesh_gltf';
                handMeshModel.userData.isHandMesh = true;

                // 查找骨骼
                handMeshModel.traverse(function(child) {
                    if (child.isBone) {
                        handMeshBones[child.name] = child;
                        console.log('Found bone:', child.name);
                    }
                    if (child.isMesh) {
                        child.material.transparent = true;
                        child.material.opacity = 0.85;
                    }
                });

                // 设置动画混合器
                if (gltf.animations && gltf.animations.length > 0) {
                    handMeshMixer = new THREE.AnimationMixer(handMeshModel);
                }

                handMeshLoaded = true;
                console.log('Hand mesh model loaded:', url);
                resolve(handMeshModel);
            },
            function(progress) {
                console.log('Loading hand mesh:', (progress.loaded / progress.total * 100).toFixed(1) + '%');
            },
            function(error) {
                console.error('Error loading hand mesh:', error);
                // 回退到程序化模型
                const mesh = createProceduralHandMesh();
                handMeshLoaded = true;
                resolve(mesh);
            }
        );
    });
}

/**
 * 使用landmark位置更新手部mesh (已重构)
 * 现在直接调用 updateHandMeshFromLandmarks 进行骨骼驱动更新
 * @param {Array} landmarks - 21个关键点 [[x,y,z], ...]
 */
function updateHandMesh(landmarks) {
    if (!handMeshGroup || !landmarks || landmarks.length !== 21) return;

    // 直接使用新的骨骼驱动更新方法
    updateHandMeshFromLandmarks(landmarks);
}

/**
 * 渲染手部mesh或关键点
 */
async function renderHandVisualization(scene, landmarks, isMapped = false) {
    if (handViewMode === 'mesh') {
        // Mesh模式：显示手部mesh，隐藏关键点
        await renderHandMesh(scene, landmarks);
        // 清除旧的landmark显示
        clearHandLandmarks(scene);
    } else {
        // 关键点模式：显示关键点，隐藏mesh
        renderHandLandmarks(scene, landmarks, isMapped);
        hideHandMesh();
    }
}

/**
 * 渲染手部mesh
 * 优先使用MANO模型，如果不可用则使用程序化mesh
 */
async function renderHandMesh(scene, landmarks) {
    if (!landmarks || landmarks.length !== 21) {
        console.log('renderHandMesh: no valid landmarks');
        hideHandMesh();
        return;
    }

    // 尝试使用MANO模型
    if (useManoModel && !manoLoaded) {
        try {
            await loadManoModel();
        } catch (e) {
            console.warn('Failed to load MANO:', e);
            useManoModel = false;
        }
    }

    if (useManoModel && manoMesh) {
        // 确保 MANO mesh 直接添加到场景（不是子 Group）
        if (manoMesh.parent !== scene) {
            // 如果在其他父级中，先移除
            if (manoMesh.parent) {
                manoMesh.parent.remove(manoMesh);
            }
            scene.add(manoMesh);
            console.log('MANO mesh added to scene');
        }

        // 更新位置和变形
        updateManoMeshFromLandmarks(landmarks);

        // 确保可见
        manoMesh.visible = true;
        manoMesh.frustumCulled = false;

        // 隐藏程序化mesh
        if (handMeshGroup) {
            handMeshGroup.visible = false;
        }
    } else {
        // 使用程序化mesh作为后备
        if (!handMeshGroup) {
            handMeshGroup = createProceduralHandMesh();
        }

        if (!handMeshGroup.parent) {
            scene.add(handMeshGroup);
        }

        handMeshGroup.visible = true;

        // 隐藏MANO mesh
        if (manoMesh) {
            manoMesh.visible = false;
        }

        // 更新mesh位置和姿态
        updateHandMeshFromLandmarks(landmarks);
    }
}

/**
 * 根据关键点更新手部mesh姿态 - 真正的骨骼驱动
 * 每个segment直接根据对应的landmark位置定位
 */
function updateHandMeshFromLandmarks(landmarks) {
    if (!handMeshGroup || !landmarks || landmarks.length !== 21) return;
    if (!handSegmentMeshes || Object.keys(handSegmentMeshes).length === 0) return;

    // 更新手腕位置
    if (handSegmentMeshes.wrist) {
        const wristPos = landmarks[MPS_LANDMARK.WRIST];
        handSegmentMeshes.wrist.position.set(wristPos[0], wristPos[1], wristPos[2]);
    }

    // 更新每个手指的segments、关节球和指尖
    Object.keys(FINGER_LANDMARKS).forEach(fingerName => {
        const landmarkIndices = FINGER_LANDMARKS[fingerName];
        const segments = handSegmentMeshes[fingerName];
        const joints = handSegmentMeshes[fingerName + '_joints'];
        const tipMesh = handSegmentMeshes[fingerName + '_tip'];

        if (!segments) return;

        // 每个segment连接两个相邻的landmark
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const startIdx = landmarkIndices[i];
            const endIdx = landmarkIndices[i + 1];

            if (startIdx === undefined || endIdx === undefined) continue;

            const startPos = new THREE.Vector3(...landmarks[startIdx]);
            const endPos = new THREE.Vector3(...landmarks[endIdx]);

            // 计算segment中心位置
            const center = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
            segment.position.copy(center);

            // 计算segment长度和方向
            const direction = new THREE.Vector3().subVectors(endPos, startPos);
            const length = direction.length();

            // 更新segment的缩放（Y轴是圆柱体长度方向）
            segment.scale.y = length / 0.02; // 0.02是初始高度

            // 计算旋转，使Y轴指向direction
            if (length > 0.001) {
                direction.normalize();
                const up = new THREE.Vector3(0, 1, 0);
                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(up, direction);
                segment.quaternion.copy(quaternion);
            }

            // 更新关节球位置（放在segment起点）
            if (joints && joints[i]) {
                joints[i].position.copy(startPos);
            }
        }

        // 更新指尖位置
        if (tipMesh) {
            const tipIdx = landmarkIndices[landmarkIndices.length - 1];
            const tipPos = landmarks[tipIdx];
            tipMesh.position.set(tipPos[0], tipPos[1], tipPos[2]);
        }
    });

    // 更新掌心mesh
    updatePalmMesh(landmarks);
}

/**
 * 更新掌心mesh - 创建连接手腕、掌心和各手指基部的多边形
 */
function updatePalmMesh(landmarks) {
    const palmMesh = handSegmentMeshes.palm;
    if (!palmMesh) return;

    const wrist = new THREE.Vector3(...landmarks[MPS_LANDMARK.WRIST]);
    const palmCenter = new THREE.Vector3(...landmarks[MPS_LANDMARK.PALM_CENTER]);
    const thumbMCP = new THREE.Vector3(...landmarks[MPS_LANDMARK.THUMB_MCP]);
    const indexMCP = new THREE.Vector3(...landmarks[MPS_LANDMARK.INDEX_MCP]);
    const middleMCP = new THREE.Vector3(...landmarks[MPS_LANDMARK.MIDDLE_MCP]);
    const ringMCP = new THREE.Vector3(...landmarks[MPS_LANDMARK.RING_MCP]);
    const pinkyMCP = new THREE.Vector3(...landmarks[MPS_LANDMARK.PINKY_MCP]);

    // 计算手掌法线
    const v1 = new THREE.Vector3().subVectors(indexMCP, wrist);
    const v2 = new THREE.Vector3().subVectors(pinkyMCP, wrist);
    const palmNormal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    const palmThickness = 0.008; // 手掌厚度

    // 创建手掌顶点 (上下两面)
    const palmPoints = [wrist, thumbMCP, indexMCP, middleMCP, ringMCP, pinkyMCP];
    const vertices = [];
    const indices = [];

    // 上面顶点
    palmPoints.forEach(p => {
        const upper = p.clone().add(palmNormal.clone().multiplyScalar(palmThickness / 2));
        vertices.push(upper.x, upper.y, upper.z);
    });
    // 下面顶点
    palmPoints.forEach(p => {
        const lower = p.clone().sub(palmNormal.clone().multiplyScalar(palmThickness / 2));
        vertices.push(lower.x, lower.y, lower.z);
    });

    // 上面三角形 (fan from wrist)
    for (let i = 1; i < 5; i++) {
        indices.push(0, i, i + 1);
    }
    // 下面三角形
    for (let i = 1; i < 5; i++) {
        indices.push(6, 6 + i + 1, 6 + i);
    }
    // 侧面
    for (let i = 0; i < 6; i++) {
        const next = (i + 1) % 6;
        indices.push(i, next, 6 + i);
        indices.push(next, 6 + next, 6 + i);
    }

    // 更新geometry
    const geometry = palmMesh.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;
}

/**
 * 更新单个手指的姿态 (保留旧函数以兼容)
 * @deprecated 使用 updateHandMeshFromLandmarks 代替
 */
function updateFingerPose(fingerName, jointPositions, wristPos) {
    // 此函数已被 updateHandMeshFromLandmarks 取代
    // 保留空实现以防止调用错误
}

/**
 * 隐藏手部mesh（包括MANO和程序化mesh）
 */
function hideHandMesh() {
    if (handMeshGroup) {
        handMeshGroup.visible = false;
    }
    if (manoMesh) {
        manoMesh.visible = false;
    }
}

/**
 * 清除关键点显示
 */
function clearHandLandmarks(scene) {
    const objectsToRemove = [];
    scene.children.forEach(child => {
        if (child.userData.isHandLandmark) {
            objectsToRemove.push(child);
        }
    });
    objectsToRemove.forEach(obj => {
        scene.remove(obj);
        if (obj.geometry && obj.userData.isLine) {
            obj.geometry.dispose();
        }
    });
}

/**
 * 切换手部视图模式
 * @param {string} mode - 'landmarks' 或 'mesh'
 */
function setHandViewMode(mode) {
    if (mode !== 'landmarks' && mode !== 'mesh') {
        console.warn('Invalid hand view mode:', mode);
        return;
    }
    handViewMode = mode;
    console.log('Hand view mode set to:', mode);

    // 如果切换到mesh模式且还没创建mesh，创建它
    if (mode === 'mesh' && !handMeshGroup && gripperScene) {
        handMeshGroup = createProceduralHandMesh();
        gripperScene.add(handMeshGroup);
    }
}

// Render gripper scene
function renderGripperScene() {
    // Position gripper models at origin if no hand data (for testing display)
    if (!handLandmarksData || !handLandmarksData.right_hand || handLandmarksData.right_hand.length === 0) {
        
        // Position gripper models at origin (0, 0, 0) for testing
        if (mappingSettings.showGripper) {
            if (Object.keys(gripperLinkMap).length > 0) {
                // URDF mode: position root links at origin
                Object.values(gripperLinkMap).forEach(linkObj => {
                    if (linkObj.parent === null || linkObj.parent === gripperScene) {
                        linkObj.position.set(0, 0, 0);
                    }
                });
            } else if (gripperModels.length > 0) {
                // Manual STL mode: position all models at origin
                gripperModels.forEach((model) => {
                    model.position.set(0, 0, 0);
                    model.scale.set(1, 1, 1);
                });
            }
        }
        
        // Update haptic colors even without hand data (use haptic timestamps)
        if (hapticData && hapticTimestamps.length > 0) {
            const hapticFrameIndex = Math.floor(currentFrameIndex) % hapticTimestamps.length;
            const currentTime = hapticTimestamps[hapticFrameIndex] || 0;
            updateManoHapticColors(currentTime);
            // Also update force bars independently (in case MANO mesh is not available)
            const hapticValues = getHapticValueAtTime(currentTime);
            if (hapticValues) {
                updateForceBars(hapticValues);
            }
        }

        // Scene will render with grid, axes, and gripper models (if any)
        return;
    }

    const frameIndex = Math.floor(currentFrameIndex) % handLandmarksData.right_hand.length;
    let landmarks = handLandmarksData.right_hand[frameIndex];

    // If current frame is invalid, try to find nearest valid frame
    if (!landmarks || landmarks.length !== 21) {
        // Search forward for valid frame
        for (let i = 1; i < Math.min(50, handLandmarksData.right_hand.length); i++) {
            const nextIdx = (frameIndex + i) % handLandmarksData.right_hand.length;
            const nextLandmarks = handLandmarksData.right_hand[nextIdx];
            if (nextLandmarks && nextLandmarks.length === 21) {
                landmarks = nextLandmarks;
                break;
            }
        }
    }

    if (!landmarks || landmarks.length !== 21) {
        // Still no valid landmarks found
        return;
    }

    // Map hand to gripper
    const mapped = mapHandToGripper(landmarks);
    if (!mapped) {
        // Still show gripper at origin
        if (mappingSettings.showGripper) {
            if (Object.keys(gripperLinkMap).length > 0) {
                Object.values(gripperLinkMap).forEach(linkObj => {
                    if (linkObj.parent === null || linkObj.parent === gripperScene) {
                        linkObj.position.set(0, 0, 0);
                    }
                });
            } else if (gripperModels.length > 0) {
                gripperModels.forEach((model) => {
                    model.position.set(0, 0, 0);
                    model.scale.set(1, 1, 1);
                });
            }
        }
        return;
    }

    // Add/update gripper models
    // Important: gripper should be at origin (0,0,0) because hand landmarks are already relative to wrist
    if (mappingSettings.showGripper) {
        if (Object.keys(gripperLinkMap).length > 0) {
            // URDF mode: position root links at origin (matching hand landmarks coordinate system)
            Object.values(gripperLinkMap).forEach(linkObj => {
                // Only update root links (those directly in scene)
                if (linkObj.parent === null || linkObj.parent === gripperScene) {
                    // Place at origin with offset (hand landmarks are already relative to wrist)
                    const basePosition = new THREE.Vector3(
                        mappingSettings.offsetX,
                        mappingSettings.offsetY,
                        mappingSettings.offsetZ
                    );

                    // Update position relative to current joint transforms
                    linkObj.position.copy(basePosition);

                    // Adjust finger opening if applicable (find finger links)
                    const linkName = linkObj.name || '';
                    if (linkName.toLowerCase().includes('finger') ||
                        linkName.toLowerCase().includes('手指') ||
                        linkName.toLowerCase().includes('left') ||
                        linkName.toLowerCase().includes('right')) {
                        // Could adjust joint angles here based on opening
                    }
                }
            });
        } else if (gripperModels.length > 0) {
            // Manual STL mode: position all models at origin (matching hand landmarks coordinate system)
            gripperModels.forEach((model, index) => {
                // Place at origin with offset (hand landmarks are already relative to wrist)
                model.position.set(
                    mappingSettings.offsetX,
                    mappingSettings.offsetY,
                    mappingSettings.offsetZ
                );

                // Scale gripper opening based on thumb-index distance for finger parts
                const filename = model.userData.filename || '';
                if (filename.toLowerCase().includes('finger') ||
                    filename.toLowerCase().includes('手指') ||
                    filename.toLowerCase().includes('left') ||
                    filename.toLowerCase().includes('right') ||
                    filename.toLowerCase().includes('左') ||
                    filename.toLowerCase().includes('右')) {
                    // Scale finger opening
                    const openingScale = Math.max(0.1, Math.min(2.0, mapped.opening * mappingSettings.scale * 10));
                    model.scale.set(1, 1, openingScale);
                } else {
                    // Base parts keep original scale
                    model.scale.set(1, 1, 1);
                }
            });
        }
    }

    // Apply hand-to-gripper mapping (thumb-index distance -> gripper angle)
    applyHandToGripper(landmarks);

    // Render mapped hand (landmarks or mesh based on view mode)
    renderHandVisualization(gripperScene, mapped.landmarks, true);

    // Update trajectory (only in world coordinates mode)
    if (useWorldCoordinates && handTimestamps.length > 0) {
        const currentTime = handTimestamps[Math.min(frameIndex, handTimestamps.length - 1)] || 0;
        updateTrajectory(gripperScene, currentTime);
    }

    // Update IK if follow hand is enabled
    if (ikFollowHand && ikChainLoaded) {
        computeIKForCurrentHand();
    }

    // Update haptic colors on MANO mesh if haptic data is available
    if (hapticData) {
        // Use hand timestamps if available, otherwise use haptic timestamps
        const timestamps = handTimestamps.length > 0 ? handTimestamps : hapticTimestamps;
        if (timestamps.length > 0) {
            const currentTime = timestamps[Math.min(frameIndex, timestamps.length - 1)] || 0;
            updateManoHapticColors(currentTime);
            // Also update force bars independently
            const hapticValues = getHapticValueAtTime(currentTime);
            if (hapticValues) {
                updateForceBars(hapticValues);
            }
        }
    } else if (frameIndex % 100 === 0) {
        console.log('renderGripperScene: hapticData is null/undefined');
    }
}

// Animation loop - always runs for camera controls
function animate() {
    // Always request next frame first
    animationId = requestAnimationFrame(animate);

    if (!gripperRenderer || !gripperScene || !gripperCamera) {
        return;
    }

    // Update controls for smooth interaction (works even when paused)
    if (gripperControls) {
        gripperControls.update();
    }

    // Render scene content
    renderGripperScene();

    // Always render
    gripperRenderer.render(gripperScene, gripperCamera);
}

// Helper function to get basename (for URDF mesh matching)
function getBasename(path) {
    return path.split('/').pop().split('\\').pop();
}

// LocalStorage keys for saving file paths
const STORAGE_KEYS = {
    MPS_FILENAME: 'gripper_mps_filename',
    URDF_FILENAME: 'gripper_urdf_filename',
    STL_FILENAMES: 'gripper_stl_filenames',
    MAPPING_SETTINGS: 'gripper_mapping_settings',
    CONFIG_DATA: 'gripper_config_data'
};

// DOM Elements - will be initialized in DOMContentLoaded
let dirSelect;
let groupSelect;
let mpsFolderInfo;
let hapticFileInfo;
let vrsFileInfoEl;
let urdfFileInfo;
let loadBtn;
let loadingIndicator;
let visualizationSection;
let errorSection;
let errorMessage;

// Server data state
let dataGroups = [];  // Current directory's data groups
let selectedGroup = null;  // Currently selected data group
const URDF_ASSETS_DIR = '/home/zhuyilong/IROS2026/Aria-tactile-Time-Alignment/SO101_URDF_Assets';
const URDF_FILE_PATH = URDF_ASSETS_DIR + '/so101_new_calib.urdf';

// Legacy file input references (kept as null for backward compat with code that checks them)
let mpsFileInput = null;
let urdfFileInput = null;
let stlFilesInput = null;
let stlFolderInput = null;
let hapticFileInput = null;
let mpsFolderInput = null;
let mpsFolderFiles = null;
let mpsFileInfo = null;
let stlFileInfo = null;
let stlFileList = null;

// ==================== Server File Browser Functions ====================

/**
 * Load directory list from server
 */
async function loadDirectories() {
    try {
        const response = await fetch('/data/api/directories');
        const data = await response.json();
        if (data.success && data.subdirectories) {
            dirSelect.innerHTML = '<option value="">-- 选择目录 --</option>';
            data.subdirectories.forEach(dir => {
                const opt = document.createElement('option');
                opt.value = dir.path;
                opt.textContent = `${dir.name} (VRS: ${dir.vrs_count}, CSV: ${dir.csv_count}, MPS: ${dir.mps_count})`;
                dirSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Failed to load directories:', e);
        dirSelect.innerHTML = '<option value="">加载失败</option>';
    }
}

/**
 * Load files/data groups from a selected directory
 */
async function loadFiles(directory) {
    try {
        const response = await fetch(`/data/api/files?directory=${encodeURIComponent(directory)}`);
        const data = await response.json();
        if (data.success && data.files) {
            dataGroups = data.files;
            groupSelect.disabled = false;
            groupSelect.innerHTML = '<option value="">-- 选择数据组 --</option>';
            dataGroups.forEach((group, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                let label = group.name;
                const parts = [];
                if (group.vrs_file) parts.push('VRS');
                if (group.mps_folder) parts.push('MPS');
                if (group.csv_files && group.csv_files.length > 0) parts.push(`${group.csv_files.length} CSV`);
                if (parts.length > 0) label += ` (${parts.join(', ')})`;
                opt.textContent = label;
                groupSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Failed to load files:', e);
        groupSelect.innerHTML = '<option value="">加载失败</option>';
    }
}

/**
 * Handle data group selection - populate file info displays
 */
function onGroupSelected(groupIndex) {
    if (groupIndex === '' || groupIndex === undefined) {
        selectedGroup = null;
        mpsFolderInfo.textContent = '未选择';
        mpsFolderInfo.style.color = '#6c757d';
        hapticFileInfo.textContent = '未选择';
        hapticFileInfo.style.color = '#6c757d';
        vrsFileInfoEl.textContent = '未选择';
        vrsFileInfoEl.style.color = '#6c757d';
        checkFormValidity();
        return;
    }

    selectedGroup = dataGroups[parseInt(groupIndex)];
    if (!selectedGroup) return;

    // MPS folder
    if (selectedGroup.mps_folder) {
        const folderName = selectedGroup.mps_folder.split('/').pop();
        mpsFolderInfo.textContent = folderName;
        mpsFolderInfo.style.color = '#1565c0';
    } else {
        mpsFolderInfo.textContent = '无 MPS 文件夹';
        mpsFolderInfo.style.color = '#e65100';
    }

    // Haptic CSV - find CSV with 'haptic', 'force', or 'tactile' in name, or any CSV that's not hand_tracking
    if (selectedGroup.csv_files && selectedGroup.csv_files.length > 0) {
        let hapticCsv = selectedGroup.csv_files.find(f =>
            f.name.toLowerCase().includes('haptic') ||
            f.name.toLowerCase().includes('force') ||
            f.name.toLowerCase().includes('tactile'));
        // If no specific haptic file, use the first CSV that's not hand_tracking
        if (!hapticCsv) {
            hapticCsv = selectedGroup.csv_files.find(f => !f.name.toLowerCase().includes('hand_tracking'));
        }
        if (hapticCsv) {
            hapticFileInfo.textContent = hapticCsv.name;
            hapticFileInfo.style.color = '#28a745';
        } else {
            hapticFileInfo.textContent = '未找到触觉 CSV';
            hapticFileInfo.style.color = '#e65100';
        }
    } else {
        hapticFileInfo.textContent = '无 CSV 文件';
        hapticFileInfo.style.color = '#6c757d';
    }

    // VRS file
    if (selectedGroup.vrs_file) {
        const vrsName = selectedGroup.vrs_file.split('/').pop();
        vrsFileInfoEl.textContent = vrsName;
        vrsFileInfoEl.style.color = '#28a745';
    } else {
        vrsFileInfoEl.textContent = '无 VRS 文件';
        vrsFileInfoEl.style.color = '#6c757d';
    }

    // Show offset config status in file-status-box
    const statusBox = document.getElementById('file-status-box');
    if (statusBox && selectedGroup.offset_config) {
        const oc = selectedGroup.offset_config;
        const offset = oc.current_offset ?? oc.optimal_offset;
        statusBox.innerHTML = `<div style="color: #28a745;">已找到对齐偏移: ${offset?.toFixed(3) ?? '--'}s (相似度: ${oc.similarity?.toFixed(4) ?? '--'})</div>` +
            `<div style="color: #6c757d;">加载数据后将自动应用偏移</div>`;
    } else if (statusBox) {
        statusBox.innerHTML = `<div style="color: #6c757d;">未找到对齐偏移配置，将使用自动计算</div>`;
    }

    checkFormValidity();
}

/**
 * Get the haptic CSV path from selected group
 */
function getHapticPath() {
    if (!selectedGroup || !selectedGroup.csv_files) return null;
    let hapticCsv = selectedGroup.csv_files.find(f =>
        f.name.toLowerCase().includes('haptic') ||
        f.name.toLowerCase().includes('force') ||
        f.name.toLowerCase().includes('tactile'));
    if (!hapticCsv) {
        hapticCsv = selectedGroup.csv_files.find(f => !f.name.toLowerCase().includes('hand_tracking'));
    }
    return hapticCsv ? hapticCsv.path : null;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function checkFormValidity() {
    const button = document.getElementById('loadBtn');
    if (!button) return;

    // Enable if a data group is selected (which has MPS folder or VRS/CSV data)
    const hasGroup = selectedGroup !== null;
    button.disabled = !hasGroup;
}

function saveFileInfo() {
    // No-op: server file browser mode doesn't need localStorage persistence
}

function loadSavedFileInfo() {
    // No-op: server file browser mode doesn't need localStorage persistence
}

// Load button handler - uses server file paths via /gripper_data_from_path
const uploadForm = document.getElementById('uploadForm');
if (!uploadForm) {
    console.error('uploadForm not found!');
} else {
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('Form submitted (server path mode)');

        if (!selectedGroup) {
            alert('请先选择数据目录和数据组');
            return;
        }

        loadingIndicator.style.display = 'block';
        errorSection.style.display = 'none';
        loadBtn.disabled = true;

        try {
            const requestBody = {
                urdf_path: URDF_FILE_PATH,
                stl_dir_path: URDF_ASSETS_DIR
            };
            if (selectedGroup.mps_folder) requestBody.mps_folder_path = selectedGroup.mps_folder;
            const hapticPath = getHapticPath();
            if (hapticPath) requestBody.haptic_path = hapticPath;
            if (selectedGroup.vrs_file) requestBody.vrs_path = selectedGroup.vrs_file;

            console.log('Request body:', requestBody);
            const response = await fetch('/gripper_data_from_path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || '加载数据失败');
            }

            const data = await response.json();
            console.log('Response data keys:', Object.keys(data));

            // Store hand landmarks data (optional - for testing display without hand data)
            handLandmarksData = data.hand_landmarks || null;
            hapticData = data.haptic_data || null;
            urdfData = data.urdf || null;
            slamTrajectory = data.slam_trajectory || null;
            useWorldCoordinates = data.world_coordinates || false;

            console.log('Hand landmarks data:', handLandmarksData);
            console.log('Right hand frames:', handLandmarksData?.right_hand?.length || 0);
            console.log('World coordinates:', useWorldCoordinates);
            if (slamTrajectory) {
                console.log('SLAM trajectory:', slamTrajectory.positions?.length || 0, 'poses');
            }

            // Switch hand pose transform based on coordinate mode
            if (useWorldCoordinates) {
                handPoseTransform = handPoseTransformWorld;
                console.log('Using world coordinates hand pose transform');
            } else {
                handPoseTransform = handPoseTransformDevice;
                console.log('Using device coordinates hand pose transform');
            }

            // Update UI based on coordinate mode
            const handPosePanel = document.getElementById('hand-pose-panel');
            const trajectoryPanel = document.getElementById('trajectory-panel');
            const handPoseModeLabel = document.getElementById('hand-pose-mode-label');

            // Hand pose panel is always visible, but label changes
            if (handPosePanel) {
                handPosePanel.style.display = 'block';
            }

            if (handPoseModeLabel) {
                if (useWorldCoordinates) {
                    handPoseModeLabel.textContent = '(世界坐标 - 平面对齐)';
                    handPoseModeLabel.style.color = '#1565c0';
                } else {
                    handPoseModeLabel.textContent = '(设备坐标)';
                    handPoseModeLabel.style.color = '#666';
                }
            }

            // Update hand pose UI inputs to show current mode's values
            updateHandPoseUI();

            if (trajectoryPanel) {
                if (useWorldCoordinates) {
                    trajectoryPanel.style.display = 'block';
                    console.log('Trajectory panel shown (world coordinates mode)');
                } else {
                    trajectoryPanel.style.display = 'none';
                    console.log('Trajectory panel hidden (device coordinates mode)');
                }
            }
            console.log('Haptic data:', hapticData);
            if (hapticData) {
                console.log('Haptic sensors:', Object.keys(hapticData.sensors || {}));
                console.log('Haptic timestamps:', hapticData.timestamps?.length || 0);
                hapticTimestamps = hapticData.timestamps || [];

                // Reset haptic time offset for auto-calculation
                hapticTimeOffset = null;
                hapticTimeDebugCounter = 0;

                // Auto-load alignment offset from offset_config if available
                if (selectedGroup && selectedGroup.offset_config) {
                    const oc = selectedGroup.offset_config;
                    savedAlignmentOffset = oc.current_offset ?? oc.optimal_offset ?? null;
                    console.log('Loaded alignment offset from config:', savedAlignmentOffset, 's');
                } else {
                    savedAlignmentOffset = null;
                }

                // Debug: log first few force values
                if (hapticData.sensors) {
                    for (const [finger, sensorData] of Object.entries(hapticData.sensors)) {
                        console.log(`${finger} force samples (first 5):`, sensorData.total?.slice(0, 5));
                        // Avoid stack overflow with large arrays
                        if (sensorData.total && sensorData.total.length > 0) {
                            let min = sensorData.total[0], max = sensorData.total[0];
                            for (let i = 1; i < sensorData.total.length; i++) {
                                if (sensorData.total[i] < min) min = sensorData.total[i];
                                if (sensorData.total[i] > max) max = sensorData.total[i];
                            }
                            console.log(`${finger} force range:`, min, '-', max);
                        }
                    }
                }

                // Show force bars panel when haptic data is available
                const forceBarsPanel = document.getElementById('force-bars-panel');
                if (forceBarsPanel) {
                    forceBarsPanel.style.display = 'flex';
                    console.log('Force bars panel shown');
                }

                // Auto-adjust force max based on data range
                if (hapticData.force_range && hapticData.force_range[1] > hapticSettings.forceMax) {
                    hapticSettings.forceMax = Math.ceil(hapticData.force_range[1]);
                    // Update both inputs
                    const forceMaxInput = document.getElementById('haptic-force-max');
                    const forceBarMaxInput = document.getElementById('force-bar-max');
                    if (forceMaxInput) forceMaxInput.value = hapticSettings.forceMax;
                    if (forceBarMaxInput) forceBarMaxInput.value = hapticSettings.forceMax;
                    console.log('Auto-adjusted forceMax to:', hapticSettings.forceMax);
                }
            }

            // Update file status box
            updateFileStatusBox(data);

            // Show video frame panel
            showVideoFramePanel();

            // Auto-initialize VRS from server path if available
            if (selectedGroup && selectedGroup.vrs_file) {
                try {
                    await initVRSSessionFromPath(selectedGroup.vrs_file);
                } catch (e) {
                    console.warn('Failed to auto-init VRS:', e);
                }
            }
            
            // Hand data is optional - if not provided, we'll just show gripper model
            if (handLandmarksData && handLandmarksData.right_hand && handLandmarksData.right_hand.length > 0) {
                // Extract timestamps if available
                if (handLandmarksData.timestamps) {
                    handTimestamps = handLandmarksData.timestamps;
                } else {
                    // Generate timestamps if not available
                    const frameCount = handLandmarksData.right_hand.length;
                    handTimestamps = Array.from({ length: frameCount }, (_, i) => i * 0.1); // Assume 10Hz
                }
                
                console.log(`Loaded ${handTimestamps.length} frames of hand data`);
                console.log('First frame landmarks:', handLandmarksData.right_hand[0]);
                
                // Initialize timeline
                initializeTimeline();
            } else {
                console.log('No hand landmarks data - will only display gripper model and grid/axes for testing');
                handTimestamps = [];
                // Initialize timeline with empty data
                initializeTimeline();
            }

            // Show visualization section first (so canvas has dimensions)
            visualizationSection.style.display = 'block';
            
            // Wait a bit for layout to update, then initialize scenes
            setTimeout(async () => {
                // Initialize scenes (now canvas should have proper dimensions)
                initScenes();

            // Load gripper models
            if (urdfData && data.stl_file_map) {
                // Load from URDF (recommended)
                try {
                    await loadGripperFromURDF(urdfData, data.stl_file_map);
                    console.log(`Successfully loaded gripper from URDF with ${Object.keys(gripperLinkMap).length} links`);
                } catch (err) {
                    console.warn('Failed to load gripper from URDF:', err);
                    alert(`从URDF加载夹爪模型时出错: ${err.message}`);
                }
            } else if (data.stl_urls && data.stl_urls.length > 0) {
                // Manual STL file loading (fallback)
                try {
                    await loadSTLModels(data.stl_urls, data.stl_files || []);
                    console.log(`Successfully loaded ${data.stl_urls.length} STL file(s) (manual mode)`);
                } catch (err) {
                    console.warn('Failed to load STL models:', err);
                    alert(`加载STL文件时出错: ${err.message}`);
                }
            } else {
                console.log('No gripper files provided, using hand landmarks only');
            }

            // Load MANO model if haptic data is available (for haptic visualization)
            if (hapticData) {
                try {
                    console.log('Loading MANO model for haptic visualization...');
                    const mesh = await loadManoModel();
                    if (mesh && gripperScene) {
                        // 初始化顶点颜色（用于触觉可视化）
                        const numVerts = mesh.geometry.attributes.position.count;
                        const colors = new Float32Array(numVerts * 3);
                        // 初始为肤色 (0xffdbac -> r:1, g:0.858, b:0.674)
                        for (let i = 0; i < numVerts; i++) {
                            colors[i * 3] = 0.82;
                            colors[i * 3 + 1] = 0.64;
                            colors[i * 3 + 2] = 0.49;
                        }
                        mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

                        // 使用 PhongMaterial 支持顶点颜色
                        mesh.material = new THREE.MeshPhongMaterial({
                            color: 0xffffff,
                            vertexColors: true,
                            shininess: 30,
                            side: THREE.DoubleSide
                        });

                        // 添加到场景
                        if (!mesh.parent) {
                            mesh.position.set(0, 0.05, 0);
                            gripperScene.add(mesh);
                            console.log('MANO model added to scene for haptic visualization');
                        }
                    }
                    console.log('MANO model loaded for haptic visualization');
                } catch (e) {
                    console.warn('Failed to load MANO model for haptic visualization:', e);
                }
            }

            // Start animation
            currentFrameIndex = 0;
            updateTimeline();

            // Adjust camera to first frame's landmarks (if available)
            if (handLandmarksData && handLandmarksData.right_hand && handLandmarksData.right_hand.length > 0) {
                const firstFrameLandmarks = handLandmarksData.right_hand[0];
                if (firstFrameLandmarks && firstFrameLandmarks.length === 21) {
                    // Use mapped landmarks for camera adjustment (includes world coordinates transform)
                    const mapped = mapHandToGripper(firstFrameLandmarks);
                    if (mapped && mapped.landmarks) {
                        adjustCameraToLandmarks(mapped.landmarks);
                        console.log('Camera adjusted to mapped landmarks, useWorldCoordinates:', useWorldCoordinates);
                    } else {
                        adjustCameraToLandmarks(firstFrameLandmarks);
                    }
                }
            } else {
                // No hand data - use default camera position to view origin (where gripper will be)
                console.log('No hand data - using default camera position');
                if (gripperCamera) {
                    gripperCamera.position.set(0.2, 0.2, 0.4);
                    gripperCamera.lookAt(0, 0, 0);
                    gripperCamera.updateProjectionMatrix();
                    if (gripperControls) {
                        gripperControls.target.set(0, 0, 0);
                        gripperControls.update();
                    }
                }
            }

                // Re-adjust renderer size now that section is visible
                const gripperCanvasEl = document.getElementById('gripper-canvas');
                if (gripperRenderer && gripperCanvasEl) {
                    const actualWidth = gripperCanvasEl.clientWidth;
                    const actualHeight = gripperCanvasEl.clientHeight;
                    if (actualWidth > 0 && actualHeight > 0) {
                        gripperRenderer.setSize(actualWidth, actualHeight);
                        gripperCamera.aspect = actualWidth / actualHeight;
                        gripperCamera.updateProjectionMatrix();
                        console.log('Gripper renderer resized to:', actualWidth, actualHeight);
                    }
                }

                // Force initial render
                console.log('=== Starting initial render ===');
                console.log('handLandmarksData:', handLandmarksData);
                console.log('handLandmarksData.right_hand length:', handLandmarksData?.right_hand?.length || 0);
                console.log('gripperScene:', gripperScene);
                console.log('gripperRenderer:', gripperRenderer);
                console.log('gripperCamera:', gripperCamera);

                // Ensure scene is initialized
                if (!gripperScene) {
                    console.error('Scene not initialized, calling initScenes()');
                    initScenes();
                }

                // Render scene (will show grid/axes even if no data)
                renderGripperScene();

                // Force render
                if (gripperRenderer && gripperScene && gripperCamera) {
                    gripperRenderer.render(gripperScene, gripperCamera);
                    console.log('Gripper scene rendered, children count:', gripperScene.children.length);
                } else {
                    console.error('Gripper renderer/scene/camera not initialized:', {
                        renderer: !!gripperRenderer,
                        scene: !!gripperScene,
                        camera: !!gripperCamera
                    });
                }

                // Start animation loop
                console.log('Starting animation loop...');
                animate();

                // Show IK status
                if (data.ik_loaded) {
                    console.log('IK chain loaded:', data.ik_joint_names);
                    ikChainLoaded = true;
                    // Show a brief notification
                    const ikPanel = document.getElementById('ik-panel');
                    if (ikPanel) {
                        const statusNote = document.createElement('div');
                        statusNote.style.cssText = 'margin-top: 10px; padding: 8px; background: #c8e6c9; border-radius: 4px; color: #2e7d32;';
                        statusNote.innerHTML = `✅ IK 服务已就绪 (${data.ik_joint_names?.length || 0} 个关节)`;
                        statusNote.id = 'ik-ready-note';
                        // Remove existing note if any
                        const existingNote = document.getElementById('ik-ready-note');
                        if (existingNote) existingNote.remove();
                        ikPanel.insertBefore(statusNote, ikPanel.firstChild.nextSibling);
                    }
                } else if (data.ik_available === false) {
                    console.warn('ikpy not installed on server');
                } else {
                    console.warn('IK chain not loaded (no URDF?)');
                }
            }, 100);
            setTimeout(() => {
                visualizationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);

            // Save file info after successful load
            saveFileInfo();

        } catch (error) {
            console.error('Error in form submission:', error);
            displayError(error);
        } finally {
            loadingIndicator.style.display = 'none';
            loadBtn.disabled = false;
        }
    });
}

function displayError(error) {
    console.error('Displaying error:', error);
    const errorMsg = error.message || String(error);
    if (errorMessage) {
        errorMessage.textContent = errorMsg;
    }
    if (errorSection) {
        errorSection.style.display = 'block';
        setTimeout(() => {
            errorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        alert('错误: ' + errorMsg);
    }
}

// Control handlers
document.getElementById('show-skeleton').addEventListener('change', function(e) {
    mappingSettings.showSkeleton = e.target.checked;
    saveFileInfo();
});

document.getElementById('show-gripper').addEventListener('change', function(e) {
    mappingSettings.showGripper = e.target.checked;
    gripperModels.forEach(model => {
        model.visible = e.target.checked;
    });
    Object.values(gripperLinkMap).forEach(linkObj => {
        linkObj.visible = e.target.checked;
    });
    saveFileInfo();
});

// Trajectory controls
const showTrajectoryCheckbox = document.getElementById('show-trajectory');
const trajectoryDurationInput = document.getElementById('trajectory-duration');
const trajectoryPointSelect = document.getElementById('trajectory-point');
const trajectoryWidthInput = document.getElementById('trajectory-width');

if (showTrajectoryCheckbox) {
    showTrajectoryCheckbox.addEventListener('change', function(e) {
        trajectorySettings.enabled = e.target.checked;
        if (!e.target.checked) {
            clearTrajectory(gripperScene);
        }
    });
}

if (trajectoryDurationInput) {
    trajectoryDurationInput.addEventListener('change', function(e) {
        trajectorySettings.duration = parseFloat(e.target.value) || 10;
    });
}

if (trajectoryPointSelect) {
    trajectoryPointSelect.addEventListener('change', function(e) {
        trajectorySettings.trackPoint = e.target.value;
    });
}

if (trajectoryWidthInput) {
    trajectoryWidthInput.addEventListener('input', function(e) {
        trajectorySettings.lineWidth = parseInt(e.target.value) || 3;
    });
}

// Hand pose transform controls
const HAND_POSES_STORAGE_KEY = 'aria_hand_poses_list';
// Legacy keys (for migration)
const HAND_POSE_STORAGE_KEY_DEVICE = 'aria_hand_pose_transform_device';
const HAND_POSE_STORAGE_KEY_WORLD = 'aria_hand_pose_transform_world';

// Get the storage key based on current mode (legacy, kept for compat)
function getHandPoseStorageKey() {
    return useWorldCoordinates ? HAND_POSE_STORAGE_KEY_WORLD : HAND_POSE_STORAGE_KEY_DEVICE;
}

/**
 * Get all saved hand poses from localStorage
 */
function getAllSavedPoses() {
    try {
        const raw = localStorage.getItem(HAND_POSES_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to load saved poses:', e);
    }

    // Migrate from legacy keys if no new-format data exists
    const poses = [];
    try {
        const legacyDevice = localStorage.getItem(HAND_POSE_STORAGE_KEY_DEVICE);
        if (legacyDevice) {
            const d = JSON.parse(legacyDevice);
            poses.push({
                ...d,
                id: 'legacy_device',
                label: '旧设置 (设备坐标)',
                groupName: '(未知)',
                mode: 'device',
                savedAt: d.savedAt || new Date().toISOString()
            });
        }
        const legacyWorld = localStorage.getItem(HAND_POSE_STORAGE_KEY_WORLD);
        if (legacyWorld) {
            const d = JSON.parse(legacyWorld);
            poses.push({
                ...d,
                id: 'legacy_world',
                label: '旧设置 (世界坐标)',
                groupName: '(未知)',
                mode: 'world',
                savedAt: d.savedAt || new Date().toISOString()
            });
        }
    } catch (e) {}
    return poses;
}

/**
 * Save all poses to localStorage
 */
function saveAllPoses(poses) {
    localStorage.setItem(HAND_POSES_STORAGE_KEY, JSON.stringify(poses));
}

function saveHandPoseTransform() {
    const modeLabel = useWorldCoordinates ? '世界坐标' : '设备坐标';
    const mode = useWorldCoordinates ? 'world' : 'device';
    const groupName = selectedGroup ? selectedGroup.name : '(未知)';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const id = `${groupName}_${mode}_${now.getTime()}`;
    const label = `${groupName} [${modeLabel}] ${dateStr} ${timeStr}`;

    const poseData = {
        id,
        label,
        groupName,
        mode,
        savedAt: now.toISOString(),
        posX: handPoseTransform.posX,
        posY: handPoseTransform.posY,
        posZ: handPoseTransform.posZ,
        rotX: handPoseTransform.rotX,
        rotY: handPoseTransform.rotY,
        rotZ: handPoseTransform.rotZ,
        scale: handPoseTransform.scale,
        handGripperMapping: {
            enabled: handGripperMapping.enabled,
            closeDistCm: handGripperMapping.closeDistCm,
            openDistCm: handGripperMapping.openDistCm
        }
    };

    const poses = getAllSavedPoses();
    poses.push(poseData);
    saveAllPoses(poses);

    // Also save to legacy keys for backward compat
    const legacyKey = getHandPoseStorageKey();
    localStorage.setItem(legacyKey, JSON.stringify(poseData));

    console.log('Hand pose saved:', poseData);

    // Update the load dropdown
    updatePoseLoadDropdown();

    // Brief visual feedback
    const saveBtn = document.getElementById('hand-pose-save-btn');
    if (saveBtn) {
        const orig = saveBtn.textContent;
        saveBtn.textContent = '已存';
        saveBtn.style.background = '#2e7d32';
        setTimeout(() => {
            saveBtn.textContent = orig;
            saveBtn.style.background = '#4caf50';
        }, 1500);
    }
}

function loadHandPoseTransform() {
    // Called when user selects from dropdown
    const dropdown = document.getElementById('hand-pose-load-select');
    if (!dropdown) return false;

    const selectedId = dropdown.value;
    if (!selectedId) return false;

    const poses = getAllSavedPoses();
    const pose = poses.find(p => p.id === selectedId);
    if (!pose) {
        console.warn('Pose not found:', selectedId);
        return false;
    }

    return applyPoseData(pose);
}

/**
 * Apply a pose data object to the current hand pose transform
 */
function applyPoseData(data) {
    try {
        handPoseTransform.posX = data.posX ?? 0;
        handPoseTransform.posY = data.posY ?? 0;
        handPoseTransform.posZ = data.posZ ?? 0;
        handPoseTransform.rotX = data.rotX ?? 0;
        handPoseTransform.rotY = data.rotY ?? 0;
        handPoseTransform.rotZ = data.rotZ ?? 0;
        handPoseTransform.scale = data.scale ?? 1;

        if (data.handGripperMapping) {
            handGripperMapping.enabled = data.handGripperMapping.enabled ?? true;
            handGripperMapping.closeDistCm = data.handGripperMapping.closeDistCm ?? 2;
            handGripperMapping.openDistCm = data.handGripperMapping.openDistCm ?? 10;
        }

        updateHandPoseUI();
        updateHandGripperMappingUI();

        console.log('Applied pose:', data.label || data.id);
        return true;
    } catch (e) {
        console.error('Failed to apply pose:', e);
        return false;
    }
}

/**
 * Delete a saved pose by ID
 */
function deleteSavedPose(poseId) {
    let poses = getAllSavedPoses();
    poses = poses.filter(p => p.id !== poseId);
    saveAllPoses(poses);
    updatePoseLoadDropdown();
}

/**
 * Update the load dropdown with all saved poses
 */
function updatePoseLoadDropdown() {
    const dropdown = document.getElementById('hand-pose-load-select');
    if (!dropdown) return;

    const poses = getAllSavedPoses();
    const mode = useWorldCoordinates ? 'world' : 'device';
    const groupName = selectedGroup ? selectedGroup.name : null;

    dropdown.innerHTML = '<option value="">-- 选择已保存的姿态 --</option>';

    // Sort: matching group+mode first, then same mode, then rest; newest first within each group
    const sorted = [...poses].sort((a, b) => {
        const aMatch = (a.groupName === groupName ? 2 : 0) + (a.mode === mode ? 1 : 0);
        const bMatch = (b.groupName === groupName ? 2 : 0) + (b.mode === mode ? 1 : 0);
        if (aMatch !== bMatch) return bMatch - aMatch;
        return new Date(b.savedAt) - new Date(a.savedAt);
    });

    sorted.forEach(pose => {
        const opt = document.createElement('option');
        opt.value = pose.id;
        // Highlight matching entries
        let prefix = '';
        if (pose.groupName === groupName && pose.mode === mode) prefix = '★ ';
        else if (pose.mode === mode) prefix = '● ';
        opt.textContent = prefix + pose.label;
        dropdown.appendChild(opt);
    });
}

// Auto-load the best matching saved pose for each mode (called on data load)
function autoLoadHandPoseSettings() {
    const poses = getAllSavedPoses();
    const groupName = selectedGroup ? selectedGroup.name : null;

    // Helper: find best pose for a given mode
    function findBest(targetMode) {
        // Priority: 1) same group + same mode (newest), 2) same mode (newest), 3) legacy
        const matching = poses.filter(p => p.mode === targetMode);
        const groupMatch = matching.filter(p => p.groupName === groupName);
        if (groupMatch.length > 0) {
            groupMatch.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
            return groupMatch[0];
        }
        if (matching.length > 0) {
            matching.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
            return matching[0];
        }
        return null;
    }

    // Load device pose
    const devicePose = findBest('device');
    if (devicePose) {
        handPoseTransformDevice.posX = devicePose.posX ?? 0;
        handPoseTransformDevice.posY = devicePose.posY ?? 0;
        handPoseTransformDevice.posZ = devicePose.posZ ?? 0;
        handPoseTransformDevice.rotX = devicePose.rotX ?? 0;
        handPoseTransformDevice.rotY = devicePose.rotY ?? 0;
        handPoseTransformDevice.rotZ = devicePose.rotZ ?? 0;
        handPoseTransformDevice.scale = devicePose.scale ?? 1;
        console.log('Auto-loaded device pose:', devicePose.label);
    }

    // Load world pose
    const worldPose = findBest('world');
    if (worldPose) {
        handPoseTransformWorld.posX = worldPose.posX ?? 0;
        handPoseTransformWorld.posY = worldPose.posY ?? 0;
        handPoseTransformWorld.posZ = worldPose.posZ ?? 0;
        handPoseTransformWorld.rotX = worldPose.rotX ?? 0;
        handPoseTransformWorld.rotY = worldPose.rotY ?? 0;
        handPoseTransformWorld.rotZ = worldPose.rotZ ?? 0;
        handPoseTransformWorld.scale = worldPose.scale ?? 1;
        console.log('Auto-loaded world pose:', worldPose.label);
    }

    // Load hand-gripper mapping from whichever was found
    const bestPose = devicePose || worldPose;
    if (bestPose && bestPose.handGripperMapping) {
        handGripperMapping.enabled = bestPose.handGripperMapping.enabled ?? true;
        handGripperMapping.closeDistCm = bestPose.handGripperMapping.closeDistCm ?? 2;
        handGripperMapping.openDistCm = bestPose.handGripperMapping.openDistCm ?? 10;
    }

    // Update the load dropdown
    updatePoseLoadDropdown();
}

function updateHandPoseUI() {
    const posXInput = document.getElementById('hand-pos-x');
    const posYInput = document.getElementById('hand-pos-y');
    const posZInput = document.getElementById('hand-pos-z');
    const rotXInput = document.getElementById('hand-rot-x');
    const rotYInput = document.getElementById('hand-rot-y');
    const rotZInput = document.getElementById('hand-rot-z');
    const scaleSlider = document.getElementById('hand-scale');
    const scaleValue = document.getElementById('hand-scale-value');

    if (posXInput) posXInput.value = handPoseTransform.posX;
    if (posYInput) posYInput.value = handPoseTransform.posY;
    if (posZInput) posZInput.value = handPoseTransform.posZ;
    if (rotXInput) rotXInput.value = handPoseTransform.rotX;
    if (rotYInput) rotYInput.value = handPoseTransform.rotY;
    if (rotZInput) rotZInput.value = handPoseTransform.rotZ;
    if (scaleSlider) scaleSlider.value = handPoseTransform.scale;
    if (scaleValue) scaleValue.textContent = handPoseTransform.scale.toFixed(1);
}

function updateHandGripperMappingUI() {
    const enableCheckbox = document.getElementById('enable-hand-gripper-mapping');
    const closeDistInput = document.getElementById('gripper-close-dist');
    const openDistInput = document.getElementById('gripper-open-dist');

    if (enableCheckbox) enableCheckbox.checked = handGripperMapping.enabled;
    if (closeDistInput) closeDistInput.value = handGripperMapping.closeDistCm;
    if (openDistInput) openDistInput.value = handGripperMapping.openDistCm;
}

function initHandPoseControls() {
    // Position controls
    const posXInput = document.getElementById('hand-pos-x');
    const posYInput = document.getElementById('hand-pos-y');
    const posZInput = document.getElementById('hand-pos-z');
    // Rotation controls
    const rotXInput = document.getElementById('hand-rot-x');
    const rotYInput = document.getElementById('hand-rot-y');
    const rotZInput = document.getElementById('hand-rot-z');
    // Scale control
    const scaleSlider = document.getElementById('hand-scale');
    const scaleValue = document.getElementById('hand-scale-value');
    // Buttons
    const saveBtn = document.getElementById('hand-pose-save-btn');
    const loadBtn = document.getElementById('hand-pose-load-btn');
    const resetBtn = document.getElementById('hand-pose-reset-btn');
    const deleteBtn = document.getElementById('hand-pose-delete-btn');
    const loadSelect = document.getElementById('hand-pose-load-select');

    // Position handlers
    if (posXInput) {
        posXInput.addEventListener('input', function(e) {
            handPoseTransform.posX = parseFloat(e.target.value) || 0;
        });
    }
    if (posYInput) {
        posYInput.addEventListener('input', function(e) {
            handPoseTransform.posY = parseFloat(e.target.value) || 0;
        });
    }
    if (posZInput) {
        posZInput.addEventListener('input', function(e) {
            handPoseTransform.posZ = parseFloat(e.target.value) || 0;
        });
    }

    // Rotation handlers
    if (rotXInput) {
        rotXInput.addEventListener('input', function(e) {
            handPoseTransform.rotX = parseFloat(e.target.value) || 0;
        });
    }
    if (rotYInput) {
        rotYInput.addEventListener('input', function(e) {
            handPoseTransform.rotY = parseFloat(e.target.value) || 0;
        });
    }
    if (rotZInput) {
        rotZInput.addEventListener('input', function(e) {
            handPoseTransform.rotZ = parseFloat(e.target.value) || 0;
        });
    }

    // Scale handler
    if (scaleSlider) {
        scaleSlider.addEventListener('input', function(e) {
            handPoseTransform.scale = parseFloat(e.target.value) || 1;
            if (scaleValue) {
                scaleValue.textContent = handPoseTransform.scale.toFixed(1);
            }
        });
    }

    // Save handler
    if (saveBtn) {
        saveBtn.addEventListener('click', saveHandPoseTransform);
    }

    // Load handler
    if (loadBtn) {
        loadBtn.addEventListener('click', loadHandPoseTransform);
    }

    // Delete handler
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            if (!loadSelect || !loadSelect.value) return;
            const selectedId = loadSelect.value;
            const selectedText = loadSelect.options[loadSelect.selectedIndex].textContent;
            if (confirm(`删除姿态设置?\n${selectedText}`)) {
                deleteSavedPose(selectedId);
            }
        });
    }

    // Reset handler
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            // Reset values
            handPoseTransform.posX = 0;
            handPoseTransform.posY = 0;
            handPoseTransform.posZ = 0;
            handPoseTransform.rotX = 0;
            handPoseTransform.rotY = 0;
            handPoseTransform.rotZ = 0;
            handPoseTransform.scale = 1;

            // Update UI
            updateHandPoseUI();

            console.log('Hand pose reset to default');
        });
    }

    // Auto-load saved settings for both modes on page load (silently)
    autoLoadHandPoseSettings();
    updateHandPoseUI();
    updateHandGripperMappingUI();

    console.log('Hand pose controls initialized');
}

document.addEventListener('DOMContentLoaded', initHandPoseControls);

document.getElementById('apply-settings').addEventListener('click', function() {
    // Settings are already applied in real-time
    console.log('Settings applied:', mappingSettings);
});

// Joint angle control
// Store current joint angles (in degrees for UI, converted to radians for Three.js)
let currentJointAngles = {
    shoulder_pan: 0,
    shoulder_lift: 0,
    elbow_flex: 0,
    wrist_flex: 0,
    wrist_roll: 0,
    gripper: 50  // Gripper uses degrees directly (-10 to 100)
};

// Map joint names to the link they control
const jointToLinkMapForSliders = {
    'shoulder_pan': 'shoulder_link',
    'shoulder_lift': 'upper_arm_link',
    'elbow_flex': 'lower_arm_link',
    'wrist_flex': 'wrist_link',
    'wrist_roll': 'gripper_link',
    'gripper': 'moving_jaw_so101_v1_link'
};

/**
 * Set a single joint angle
 * @param {string} jointName - Name of the joint
 * @param {number} angleDeg - Angle in degrees
 */
function setJointAngle(jointName, angleDeg) {
    currentJointAngles[jointName] = angleDeg;

    const linkName = jointToLinkMapForSliders[jointName];
    const linkObj = gripperLinkMap[linkName];
    const initialTransform = gripperLinkInitialTransforms[linkName];

    if (!linkObj || !initialTransform) {
        // Only log once per missing link
        if (jointName === 'gripper') {
            console.warn(`Link not found for joint ${jointName}: ${linkName}`);
            console.warn('Available links:', Object.keys(gripperLinkMap));
        }
        return;
    }

    // Convert to radians
    const angleRad = angleDeg * Math.PI / 180;

    // Restore initial quaternion
    linkObj.quaternion.copy(initialTransform.quaternion);

    // Apply joint angle as rotation around local Z axis
    const jointRotation = new THREE.Quaternion();
    jointRotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angleRad);
    linkObj.quaternion.multiply(jointRotation);

    // Update UI
    const valueDisplay = document.querySelector(`.joint-value[data-joint="${jointName}"]`);
    if (valueDisplay) {
        valueDisplay.textContent = `${angleDeg.toFixed(0)}°`;
    }
}

/**
 * Reset all joints to zero (or default for gripper)
 */
function resetAllJoints() {
    // Reset arm joints to 0
    setJointAngle('shoulder_pan', 0);
    setJointAngle('shoulder_lift', 0);
    setJointAngle('elbow_flex', 0);
    setJointAngle('wrist_flex', 0);
    setJointAngle('wrist_roll', 0);
    // Reset gripper to 50% (middle position)
    setJointAngle('gripper', 50);

    // Update all sliders
    document.querySelectorAll('.joint-slider').forEach(slider => {
        const joint = slider.dataset.joint;
        if (joint === 'gripper') {
            slider.value = 50;
        } else {
            slider.value = 0;
        }
    });

    console.log('All joints reset to zero');
}

// Initialize joint slider events
function initJointSliders() {
    const sliders = document.querySelectorAll('.joint-slider');
    sliders.forEach(slider => {
        slider.addEventListener('input', function(e) {
            const jointName = this.dataset.joint;
            const angleDeg = parseFloat(e.target.value);
            setJointAngle(jointName, angleDeg);
        });
    });

    // Reset button
    const resetBtn = document.getElementById('joints-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetAllJoints);
    }

    console.log('Joint sliders initialized');
}

// Call init when DOM is ready
document.addEventListener('DOMContentLoaded', initJointSliders)

// Hand-to-gripper mapping functions
/**
 * Map thumb-index distance to gripper angle
 * @param {number} distanceM - Distance in meters
 * @returns {number} Gripper angle in degrees
 */
function mapFingerDistToGripperAngle(distanceM) {
    const distanceCm = distanceM * 100;  // Convert to cm

    const closeDist = handGripperMapping.closeDistCm;
    const openDist = handGripperMapping.openDistCm;
    const closeAngle = -10;  // Gripper min angle
    const openAngle = 100;   // Gripper max angle

    // Linear interpolation with clamping
    let t = (distanceCm - closeDist) / (openDist - closeDist);
    t = Math.max(0, Math.min(1, t));  // Clamp to [0, 1]

    const angle = closeAngle + t * (openAngle - closeAngle);

    // Update tracking
    handGripperMapping.currentDistCm = distanceCm;
    handGripperMapping.currentAngleDeg = angle;

    return angle;
}

/**
 * Update hand-gripper mapping UI display
 */
function updateHandGripperMappingUI() {
    const distDisplay = document.getElementById('current-finger-dist');
    const angleDisplay = document.getElementById('mapped-gripper-angle');

    if (distDisplay) {
        distDisplay.textContent = handGripperMapping.currentDistCm.toFixed(1);
    }
    if (angleDisplay) {
        angleDisplay.textContent = `${handGripperMapping.currentAngleDeg.toFixed(0)}°`;
    }
}

/**
 * Apply hand landmarks to gripper - maps thumb-index distance to gripper opening
 * @param {Array} landmarks - 21-point hand landmarks
 */
function applyHandToGripper(landmarks) {
    if (!handGripperMapping.enabled) {
        console.log('Hand-gripper mapping disabled');
        return;
    }
    if (!landmarks || landmarks.length !== 21) {
        console.log('Invalid landmarks for gripper mapping, length:', landmarks?.length);
        return;
    }
    console.log('applyHandToGripper called, enabled:', handGripperMapping.enabled);

    // Get thumb tip (index 0) and index tip (index 1) in MPS hand landmark format
    // Note: MPS uses different indices than MediaPipe
    // MPS: 0=thumb tip, 1=index tip, 2=middle tip, etc.
    const thumbTip = landmarks[0];
    const indexTip = landmarks[1];

    if (!thumbTip || !indexTip) {
        console.debug('Thumb or index tip not found');
        return;
    }

    // Calculate distance
    const distance = Math.sqrt(
        Math.pow(thumbTip[0] - indexTip[0], 2) +
        Math.pow(thumbTip[1] - indexTip[1], 2) +
        Math.pow(thumbTip[2] - indexTip[2], 2)
    );

    // Map to gripper angle
    const gripperAngle = mapFingerDistToGripperAngle(distance);

    // Check if gripper link exists
    const gripperLinkName = jointToLinkMapForSliders['gripper'];
    if (!gripperLinkMap[gripperLinkName]) {
        console.debug(`Gripper link not found: ${gripperLinkName}`);
    }

    // Apply to gripper joint
    setJointAngle('gripper', gripperAngle);

    // Update gripper slider UI
    const gripperSlider = document.querySelector('.joint-slider[data-joint="gripper"]');
    if (gripperSlider) {
        gripperSlider.value = gripperAngle;
    }

    // Update mapping UI
    updateHandGripperMappingUI();
}

// Initialize hand-gripper mapping controls
function initHandGripperMapping() {
    const enableCheckbox = document.getElementById('enable-hand-gripper-mapping');
    const closeDistInput = document.getElementById('gripper-close-dist');
    const openDistInput = document.getElementById('gripper-open-dist');

    if (enableCheckbox) {
        enableCheckbox.addEventListener('change', function(e) {
            handGripperMapping.enabled = e.target.checked;
            console.log('Hand-gripper mapping:', handGripperMapping.enabled ? 'enabled' : 'disabled');
        });
    }

    if (closeDistInput) {
        closeDistInput.addEventListener('change', function(e) {
            handGripperMapping.closeDistCm = parseFloat(e.target.value) || 2;
            console.log('Gripper close distance:', handGripperMapping.closeDistCm, 'cm');
        });
    }

    if (openDistInput) {
        openDistInput.addEventListener('change', function(e) {
            handGripperMapping.openDistCm = parseFloat(e.target.value) || 10;
            console.log('Gripper open distance:', handGripperMapping.openDistCm, 'cm');
        });
    }

    console.log('Hand-gripper mapping controls initialized');
}

document.addEventListener('DOMContentLoaded', initHandGripperMapping);

// Timeline controls
function initializeTimeline() {
    if (handTimestamps.length === 0) return;
    
    const timelineSlider = document.getElementById('timeline-slider');
    const timeStart = document.getElementById('time-start');
    const timeEnd = document.getElementById('time-end');
    const totalTimeDisplay = document.getElementById('total-time-display');
    
    if (timelineSlider) {
        timelineSlider.min = 0;
        timelineSlider.max = handTimestamps.length - 1;
        timelineSlider.value = 0;
        timelineSlider.step = 1;
    }
    
    if (timeStart && handTimestamps.length > 0) {
        timeStart.textContent = `${handTimestamps[0].toFixed(3)}s`;
    }
    
    if (timeEnd && handTimestamps.length > 0) {
        timeEnd.textContent = `${handTimestamps[handTimestamps.length - 1].toFixed(3)}s`;
    }
    
    if (totalTimeDisplay && handTimestamps.length > 0) {
        const totalTime = handTimestamps[handTimestamps.length - 1];
        const mins = Math.floor(totalTime / 60);
        const secs = (totalTime % 60).toFixed(3);
        totalTimeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
    }
}

function updateTimeline() {
    const timelineSlider = document.getElementById('timeline-slider');
    const currentTimeDisplay = document.getElementById('current-time-display');
    
    if (handTimestamps.length === 0) return;
    
    const frameIndex = Math.floor(currentFrameIndex);
    const time = handTimestamps[frameIndex] || 0;
    
    if (timelineSlider) {
        timelineSlider.value = frameIndex;
        // Update progress bar
        const progress = (frameIndex / (handTimestamps.length - 1)) * 100;
        timelineSlider.style.background = `linear-gradient(to right, #667eea 0%, #667eea ${progress}%, #dee2e6 ${progress}%, #dee2e6 100%)`;
    }
    
    if (currentTimeDisplay) {
        const mins = Math.floor(time / 60);
        const secs = (time % 60).toFixed(3);
        currentTimeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
    }
}

// Playback controls
function startPlayback() {
    if (!handLandmarksData || handLandmarksData.right_hand.length === 0) return;

    isPlaying = true;
    const playIcon = document.getElementById('play-icon');
    const playText = document.getElementById('play-text');
    if (playIcon) playIcon.textContent = '⏸';
    if (playText) playText.textContent = '暂停';

    // Read current speed from dropdown
    const speedSelect = document.getElementById('playback-speed');
    if (speedSelect) {
        playbackSpeed = parseFloat(speedSelect.value) || 1;
    }
    console.log('Starting playback at speed:', playbackSpeed);

    const baseInterval = 100; // Base interval in ms (10fps at 1x speed)

    // Accumulator for fractional frame advancement
    let frameAccumulator = 0;

    playInterval = setInterval(() => {
        // Read speed from dropdown each frame so changes take effect immediately
        const speedSelect = document.getElementById('playback-speed');
        if (speedSelect) {
            playbackSpeed = parseFloat(speedSelect.value) || 1;
        }

        // Accumulate frames based on playback speed
        // At 1x speed, we advance 1 frame per interval
        // At 0.5x speed, we advance 0.5 frames per interval (need 2 intervals to advance 1 frame)
        // At 2x speed, we advance 2 frames per interval
        frameAccumulator += playbackSpeed;

        // Only advance when we've accumulated at least 1 frame
        if (frameAccumulator >= 1) {
            const framesToAdvance = Math.floor(frameAccumulator);
            frameAccumulator -= framesToAdvance; // Keep the fractional part

            const totalFrames = handLandmarksData.right_hand.length;
            currentFrameIndex = (Math.floor(currentFrameIndex) + framesToAdvance) % totalFrames;
            updateTimeline();
        }
    }, baseInterval);
}

function pausePlayback() {
    isPlaying = false;
    const playIcon = document.getElementById('play-icon');
    const playText = document.getElementById('play-text');
    if (playIcon) playIcon.textContent = '▶';
    if (playText) playText.textContent = '播放';
    
    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }
}

function stopPlayback() {
    pausePlayback();
    currentFrameIndex = 0;
    lastIKFrameIndex = -1;  // Reset IK frame tracking so IK will compute on next play
    updateTimeline();
}

// Timeline slider handler
const timelineSlider = document.getElementById('timeline-slider');
if (timelineSlider) {
    timelineSlider.addEventListener('input', function(e) {
        currentFrameIndex = parseFloat(e.target.value);
        lastIKFrameIndex = -1;  // Reset so IK will compute for new frame
        updateTimeline();
        // Force render
        renderGripperScene();
        if (gripperRenderer) gripperRenderer.render(gripperScene, gripperCamera);
        // Update video frame
        if (vrsSessionInitialized) {
            updateVideoFrame();
        }
    });
}

// Playback button handlers
const playPauseBtn = document.getElementById('play-pause-btn');
const stopBtn = document.getElementById('stop-btn');
const playbackSpeedSelect = document.getElementById('playback-speed');

if (playPauseBtn) {
    playPauseBtn.addEventListener('click', function() {
        if (isPlaying) {
            pausePlayback();
        } else {
            startPlayback();
        }
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', function() {
        stopPlayback();
    });
}

if (playbackSpeedSelect) {
    playbackSpeedSelect.addEventListener('change', function(e) {
        playbackSpeed = parseFloat(e.target.value);
        if (isPlaying) {
            pausePlayback();
            startPlayback();
        }
    });
}

// 空格键控制播放/暂停
document.addEventListener('keydown', function(e) {
    // 如果焦点在输入框内，不响应空格键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }

    if (e.code === 'Space') {
        e.preventDefault();  // 防止页面滚动
        if (isPlaying) {
            pausePlayback();
        } else {
            startPlayback();
        }
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing gripper visualization (server browser mode)...');

    // Initialize DOM elements for server file browser
    dirSelect = document.getElementById('dir-select');
    groupSelect = document.getElementById('group-select');
    mpsFolderInfo = document.getElementById('mps-folder-info');
    hapticFileInfo = document.getElementById('haptic-file-info');
    vrsFileInfoEl = document.getElementById('vrs-file-info');
    urdfFileInfo = document.getElementById('urdf-file-info');
    loadBtn = document.getElementById('loadBtn');
    loadingIndicator = document.getElementById('loadingIndicator');
    visualizationSection = document.getElementById('visualizationSection');
    errorSection = document.getElementById('errorSection');
    errorMessage = document.getElementById('errorMessage');

    if (!loadBtn) {
        console.error('loadBtn not found');
        return;
    }

    // Directory select handler
    if (dirSelect) {
        dirSelect.addEventListener('change', function(e) {
            const dir = e.target.value;
            if (dir) {
                loadFiles(dir);
            } else {
                groupSelect.innerHTML = '<option value="">请先选择目录</option>';
                groupSelect.disabled = true;
                selectedGroup = null;
                checkFormValidity();
            }
        });
    }

    // Data group select handler
    if (groupSelect) {
        groupSelect.addEventListener('change', function(e) {
            onGroupSelected(e.target.value);
        });
    }

    // Load directories on page load
    loadDirectories();

    console.log('Page loaded, waiting for data to initialize scenes...');

    // Initialize hand view mode toggle
    const handViewModeRadios = document.querySelectorAll('input[name="hand-view-mode"]');
    handViewModeRadios.forEach(radio => {
        radio.addEventListener('change', function(e) {
            const mode = e.target.value;
            setHandViewMode(mode);
        });
    });

    // Initialize haptic controls
    initHapticControls();

    console.log('Gripper visualization initialized');
});

// Handle window resize
window.addEventListener('resize', function() {
    if (gripperRenderer && gripperCamera) {
        const gripperCanvas = document.getElementById('gripper-canvas');
        if (gripperCanvas) {
            gripperCamera.aspect = gripperCanvas.clientWidth / gripperCanvas.clientHeight;
            gripperCamera.updateProjectionMatrix();
            gripperRenderer.setSize(gripperCanvas.clientWidth, gripperCanvas.clientHeight);
        }
    }
});

// ==================== IK Control ====================

// IK state
let ikTargetMarker = null;
let ikChainLoaded = false;
let lastIKResult = null;
let ikFollowHand = false;  // Whether IK should follow hand position
let lastIKFrameIndex = -1;  // Last frame index when IK was computed

/**
 * Initialize IK control panel
 */
function initIKControls() {
    const computeBtn = document.getElementById('ik-compute-btn');
    const resetBtn = document.getElementById('ik-reset-btn');
    const showTargetCheckbox = document.getElementById('show-ik-target');
    const presetBtns = document.querySelectorAll('.ik-preset-btn');

    if (computeBtn) {
        computeBtn.addEventListener('click', computeIK);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetIK);
    }

    if (showTargetCheckbox) {
        showTargetCheckbox.addEventListener('change', function(e) {
            if (ikTargetMarker) {
                ikTargetMarker.visible = e.target.checked;
            }
        });
    }

    // IK follow hand checkbox
    const followHandCheckbox = document.getElementById('ik-follow-hand');
    if (followHandCheckbox) {
        followHandCheckbox.addEventListener('change', function(e) {
            ikFollowHand = e.target.checked;
            console.log('IK follow hand:', ikFollowHand);
            if (ikFollowHand) {
                // Immediately compute IK for current hand position
                computeIKForCurrentHand();
            }
        });
    }

    // Preset buttons
    presetBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const x = parseFloat(this.dataset.x);
            const y = parseFloat(this.dataset.y);
            const z = parseFloat(this.dataset.z);

            document.getElementById('ik-target-x').value = x;
            document.getElementById('ik-target-y').value = y;
            document.getElementById('ik-target-z').value = z;

            // Auto compute
            computeIK();
        });
    });

    // Create target marker sphere
    createIKTargetMarker();

    console.log('IK controls initialized');
}

/**
 * Create a red sphere to mark IK target position
 */
function createIKTargetMarker() {
    if (!gripperScene) return;

    // Remove existing marker
    if (ikTargetMarker) {
        if (ikTargetMarker.parent) {
            ikTargetMarker.parent.remove(ikTargetMarker);
        }
        ikTargetMarker.geometry.dispose();
        ikTargetMarker.material.dispose();
    }

    const geometry = new THREE.SphereGeometry(0.015, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.8
    });
    ikTargetMarker = new THREE.Mesh(geometry, material);
    ikTargetMarker.visible = false;
    ikTargetMarker.userData.isIKTarget = true;

    // Add to robot root if available (so it shares the same coordinate transform)
    // Otherwise add directly to scene
    const robotRoot = gripperLinkMap['_robot_root'];
    if (robotRoot) {
        robotRoot.add(ikTargetMarker);
    } else {
        gripperScene.add(ikTargetMarker);
    }
}

/**
 * Load URDF for IK calculation
 */
async function loadIKChain(urdfPath) {
    try {
        const response = await fetch('/ik/load_urdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urdf_path: urdfPath,
                base_link: 'base_link',
                end_link: 'gripper_frame_link'
            })
        });

        const result = await response.json();
        if (result.success) {
            ikChainLoaded = true;
            console.log('IK chain loaded:', result.joint_names);
            return true;
        } else {
            console.error('Failed to load IK chain:', result.error);
            return false;
        }
    } catch (error) {
        console.error('Error loading IK chain:', error);
        return false;
    }
}

/**
 * Compute IK for target position
 */
async function computeIK() {
    const targetX = parseFloat(document.getElementById('ik-target-x').value) || 0;
    const targetY = parseFloat(document.getElementById('ik-target-y').value) || 0;
    const targetZ = parseFloat(document.getElementById('ik-target-z').value) || 0;

    // Get solver settings
    const solverMethod = document.getElementById('ik-solver-method')?.value || 'least_squares';
    const maxIter = parseInt(document.getElementById('ik-max-iter')?.value) || 100;

    const statusDiv = document.getElementById('ik-status');
    const statusText = document.getElementById('ik-status-text');
    const errorText = document.getElementById('ik-position-error');
    const jointAnglesDiv = document.getElementById('ik-joint-angles');
    const jointAnglesList = document.getElementById('joint-angles-list');

    // Show status
    if (statusDiv) statusDiv.style.display = 'block';
    if (statusText) statusText.textContent = `计算中 (${solverMethod})...`;
    if (statusText) statusText.style.color = '#1976d2';

    // Update target marker position
    // Since ikTargetMarker is now a child of robot_root (which handles the coordinate transform),
    // we can use URDF coordinates directly
    if (ikTargetMarker) {
        ikTargetMarker.position.set(targetX, targetY, targetZ);
        ikTargetMarker.visible = document.getElementById('show-ik-target')?.checked ?? true;

        // If marker is not yet attached to robot root, try to attach it now
        const robotRoot = gripperLinkMap['_robot_root'];
        if (robotRoot && ikTargetMarker.parent !== robotRoot) {
            if (ikTargetMarker.parent) {
                ikTargetMarker.parent.remove(ikTargetMarker);
            }
            robotRoot.add(ikTargetMarker);
        }
    }

    try {
        // Prepare initial angles from last result for better convergence
        const requestBody = {
            position: [targetX, targetY, targetZ],
            solver: solverMethod,
            max_iter: maxIter
        };

        if (lastIKResult && lastIKResult.joint_angles) {
            requestBody.initial_angles = lastIKResult.joint_angles;
        }

        const response = await fetch('/ik', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (result.success) {
            lastIKResult = result;

            // Update status
            if (statusText) {
                statusText.textContent = `✓ ${result.solver_used || solverMethod}`;
                statusText.style.color = '#2e7d32';
            }
            if (errorText) {
                errorText.textContent = result.position_error.toFixed(6);
            }

            // Show joint angles
            if (jointAnglesDiv) jointAnglesDiv.style.display = 'block';
            if (jointAnglesList) {
                jointAnglesList.innerHTML = result.joint_names.map((name, i) => {
                    const rad = result.joint_angles[i];
                    const deg = (rad * 180 / Math.PI).toFixed(2);
                    return `
                        <div style="padding: 8px; background: #c8e6c9; border-radius: 4px;">
                            <strong>${name}</strong><br>
                            <span style="font-family: monospace;">${rad.toFixed(4)} rad</span><br>
                            <span style="font-family: monospace; color: #558b2f;">${deg}°</span>
                        </div>
                    `;
                }).join('');
            }

            // Apply joint angles to the model
            applyJointAngles(result.joint_names, result.joint_angles);

            console.log('IK result:', result);

        } else {
            if (statusText) {
                statusText.textContent = '✗ ' + (result.error || '计算失败');
                statusText.style.color = '#d32f2f';
            }
            console.error('IK failed:', result.error);
        }

    } catch (error) {
        if (statusText) {
            statusText.textContent = '✗ 网络错误: ' + error.message;
            statusText.style.color = '#d32f2f';
        }
        console.error('IK request error:', error);
    }
}

/**
 * Apply joint angles to the Three.js model
 *
 * Important: IK joint angles are relative rotations around each joint axis.
 * We need to apply them on top of the initial URDF transforms, not replace them.
 *
 * For SO-101 robot arm:
 * - All joints rotate around local Z axis (URDF convention)
 * - The initial transforms from URDF define the zero position of each joint
 * - IK angles are added to this zero position
 */
function applyJointAngles(jointNames, jointAngles) {
    if (!gripperLinkMap || Object.keys(gripperLinkMap).length === 0) {
        console.warn('No gripper model loaded to apply joint angles');
        return;
    }

    if (!gripperLinkInitialTransforms || Object.keys(gripperLinkInitialTransforms).length === 0) {
        console.warn('No initial transforms saved - cannot apply IK angles correctly');
        return;
    }

    // Map joint names to the link they control (child link of each joint)
    // Joint names in SO-101: shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll
    const jointToLinkMap = {
        'shoulder_pan': 'shoulder_link',
        'shoulder_lift': 'upper_arm_link',
        'elbow_flex': 'lower_arm_link',
        'wrist_flex': 'wrist_link',
        'wrist_roll': 'gripper_link'
    };

    jointNames.forEach((jointName, index) => {
        const angle = jointAngles[index];
        const linkName = jointToLinkMap[jointName];

        if (linkName && gripperLinkMap[linkName]) {
            const linkGroup = gripperLinkMap[linkName];
            const initialTransform = gripperLinkInitialTransforms[linkName];

            if (!initialTransform) {
                console.warn(`No initial transform for link ${linkName}`);
                return;
            }

            // First restore the initial quaternion (URDF joint origin rotation)
            linkGroup.quaternion.copy(initialTransform.quaternion);

            // Then apply the IK joint angle as additional rotation around local Z axis
            // Create a quaternion for the joint rotation (around Z axis)
            const jointRotation = new THREE.Quaternion();
            jointRotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);

            // Multiply: final = initial * jointRotation
            // This applies the joint rotation in the local frame after the initial orientation
            linkGroup.quaternion.multiply(jointRotation);

            // console.log(`Applied ${jointName} -> ${linkName}: ${angle.toFixed(4)} rad (on top of initial transform)`);
        }
    });
}

/**
 * Reset robot to home position (restore initial URDF transforms)
 */
function resetIK() {
    lastIKResult = null;

    // Reset input fields
    document.getElementById('ik-target-x').value = '0.15';
    document.getElementById('ik-target-y').value = '0.0';
    document.getElementById('ik-target-z').value = '0.2';

    // Hide status
    const statusDiv = document.getElementById('ik-status');
    const jointAnglesDiv = document.getElementById('ik-joint-angles');
    if (statusDiv) statusDiv.style.display = 'none';
    if (jointAnglesDiv) jointAnglesDiv.style.display = 'none';

    // Hide target marker
    if (ikTargetMarker) {
        ikTargetMarker.visible = false;
    }

    // Restore all links to their initial transforms (from URDF loading)
    if (gripperLinkMap && gripperLinkInitialTransforms) {
        for (const linkName in gripperLinkMap) {
            const linkGroup = gripperLinkMap[linkName];
            const initialTransform = gripperLinkInitialTransforms[linkName];

            if (linkGroup && initialTransform) {
                linkGroup.position.copy(initialTransform.position);
                linkGroup.quaternion.copy(initialTransform.quaternion);
            }
        }
    }

    console.log('IK reset to home position (restored initial transforms)');
}

/**
 * Compute IK for current hand position (called when IK follow is enabled)
 * Uses the same tracking point as trajectory (configurable in trajectory panel)
 * Position is transformed using hand pose settings (world/device coordinates)
 */
async function computeIKForCurrentHand() {
    if (!ikFollowHand || !ikChainLoaded) return;
    if (!handLandmarksData || !handLandmarksData.right_hand) return;

    const frameIndex = Math.floor(currentFrameIndex) % handLandmarksData.right_hand.length;

    // Only compute IK when frame changes
    if (frameIndex === lastIKFrameIndex) return;
    lastIKFrameIndex = frameIndex;
    const landmarks = handLandmarksData.right_hand[frameIndex];
    if (!landmarks || landmarks.length < 21) return;

    // Get the same tracking point as trajectory for consistency
    const trackPointIdx = getTrackPointIndex(trajectorySettings.trackPoint);
    const wrist = landmarks[5] || [0, 0, 0];
    const trackPoint = landmarks[trackPointIdx];
    if (!trackPoint) return;

    // Apply hand pose transform to get the actual target position
    const transformedPoint = applyHandPoseTransformToPoint(trackPoint, wrist);

    // The transformedPoint is in Three.js world coordinates (Y-up)
    // IK service expects URDF coordinates (Z-up)
    // Robot root has rotation.x = -PI/2 to convert URDF to Three.js
    // So we need the inverse: Three.js -> URDF
    // Three.js (Y-up) -> URDF (Z-up): X stays, Y becomes Z, Z becomes -Y
    const threeX = transformedPoint[0];
    const threeY = transformedPoint[1];
    const threeZ = transformedPoint[2];

    // Convert to URDF coordinates for IK calculation
    const urdfX = threeX;
    const urdfY = -threeZ;
    const urdfZ = threeY;

    // Update IK target input fields (show URDF coordinates)
    const ikTargetX = document.getElementById('ik-target-x');
    const ikTargetY = document.getElementById('ik-target-y');
    const ikTargetZ = document.getElementById('ik-target-z');
    if (ikTargetX) ikTargetX.value = urdfX.toFixed(4);
    if (ikTargetY) ikTargetY.value = urdfY.toFixed(4);
    if (ikTargetZ) ikTargetZ.value = urdfZ.toFixed(4);

    // Update target marker position in Three.js world coordinates
    // When following hand, marker should be in world coordinates (scene space)
    if (ikTargetMarker) {
        // Make sure marker is in scene (world coordinates), not robot root
        if (ikTargetMarker.parent !== gripperScene) {
            if (ikTargetMarker.parent) {
                ikTargetMarker.parent.remove(ikTargetMarker);
            }
            gripperScene.add(ikTargetMarker);
        }
        // Use Three.js coordinates for visual marker
        ikTargetMarker.position.set(threeX, threeY, threeZ);
        ikTargetMarker.visible = document.getElementById('show-ik-target')?.checked ?? true;
    }

    // Compute IK silently (without alert or status update spam)
    try {
        // Get solver settings from UI
        const solverMethod = document.getElementById('ik-solver-method')?.value || 'least_squares';
        const maxIter = parseInt(document.getElementById('ik-max-iter')?.value) || 100;

        // Send URDF coordinates to IK service
        const requestBody = {
            position: [urdfX, urdfY, urdfZ],
            solver: solverMethod,
            max_iter: maxIter
        };

        if (lastIKResult && lastIKResult.joint_angles) {
            requestBody.initial_angles = lastIKResult.joint_angles;
        }

        const response = await fetch('/ik', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (result.success) {
            lastIKResult = result;
            // Apply joint angles to the model
            applyJointAngles(result.joint_names, result.joint_angles);
        }
    } catch (error) {
        // Silently fail for continuous tracking
        console.debug('IK computation error:', error);
    }
}

// Initialize IK controls when visualization section becomes visible
const ikObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.attributeName === 'style') {
            const section = document.getElementById('visualizationSection');
            if (section && section.style.display !== 'none') {
                // Initialize IK controls when section is shown
                setTimeout(() => {
                    initIKControls();

                    // Create target marker if scene is ready
                    if (gripperScene && !ikTargetMarker) {
                        createIKTargetMarker();
                    }
                }, 500);
            }
        }
    });
});

// Start observing
document.addEventListener('DOMContentLoaded', function() {
    const section = document.getElementById('visualizationSection');
    if (section) {
        ikObserver.observe(section, { attributes: true });
    }
});

// ========== DEBUG FUNCTIONS ==========
// 调试函数：测试MANO mesh在原点是否可见
async function debugTestManoAtOrigin() {
    console.log("=== DEBUG: Testing MANO mesh at origin ===");

    if (!gripperScene) {
        console.error("gripperScene not initialized");
        return;
    }

    // 加载MANO模型
    await loadManoModel();

    if (!manoMesh) {
        console.error("Failed to load MANO mesh");
        return;
    }

    // 重置为简单位置
    manoMesh.position.set(0, 0, 0);
    manoMesh.scale.set(1, 1, 1);
    manoMesh.rotation.set(0, 0, 0);
    manoMesh.visible = true;

    // 添加到场景
    if (!manoMesh.parent) {
        gripperScene.add(manoMesh);
    }

    // 设置相机看向原点
    gripperCamera.position.set(0.3, 0.2, 0.3);
    gripperCamera.lookAt(0, 0, 0);
    if (gripperControls) {
        gripperControls.target.set(0, 0, 0);
        gripperControls.update();
    }

    // 强制渲染
    if (gripperRenderer) {
        gripperRenderer.render(gripperScene, gripperCamera);
    }

    console.log("MANO mesh setup complete:", {
        position: manoMesh.position.toArray(),
        scale: manoMesh.scale.toArray(),
        visible: manoMesh.visible,
        parent: manoMesh.parent ? "scene" : "none",
        geometry: manoMesh.geometry ? {
            vertices: manoMesh.geometry.attributes.position.count,
            hasNormals: Boolean(manoMesh.geometry.attributes.normal)
        } : "null"
    });

    // 检查场景中的所有mesh
    console.log("Scene children count:", gripperScene.children.length);
    gripperScene.children.forEach((child, i) => {
        if (child.isMesh) {
            console.log("  Mesh " + i + ": " + (child.name || "unnamed") + ", visible=" + child.visible);
        }
    });
}

// 暴露调试函数到全局
window.debugTestManoAtOrigin = debugTestManoAtOrigin;

// 调试：使用MeshBasicMaterial测试（不需要光源）
async function debugTestManoBasicMaterial() {
    console.log("=== DEBUG: Testing MANO with BasicMaterial ===");

    await loadManoModel();

    if (!manoMesh) {
        console.error("MANO mesh not loaded");
        return;
    }

    // 先检查 geometry 是否有效
    const positions = manoMesh.geometry.attributes.position;
    if (!positions || positions.count === 0) {
        console.error("MANO geometry has no vertices!");
        return;
    }
    console.log("MANO geometry valid, vertices:", positions.count);

    // 检查顶点值是否为 NaN
    let hasNaN = false;
    for (let i = 0; i < Math.min(30, positions.count * 3); i++) {
        if (isNaN(positions.array[i])) {
            hasNaN = true;
            break;
        }
    }
    if (hasNaN) {
        console.error("MANO geometry contains NaN values!");
    }

    // 初始化顶点颜色（用于触觉可视化）
    const numVerts = manoMesh.geometry.attributes.position.count;
    const colors = new Float32Array(numVerts * 3);
    // 初始为肤色 (0xffdbac -> r:1, g:0.858, b:0.674)
    for (let i = 0; i < numVerts; i++) {
        colors[i * 3] = 0.82;
        colors[i * 3 + 1] = 0.64;
        colors[i * 3 + 2] = 0.49;
    }
    manoMesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // 使用 LambertMaterial 漫反射材质，无高光，颜色更清晰
    manoMesh.material = new THREE.MeshLambertMaterial({
        color: 0xffffff,  // 白色基础，让顶点颜色显示
        vertexColors: true,  // 启用顶点颜色
        side: THREE.DoubleSide
    });

    // 设置位置和变换
    manoMesh.position.set(0, 0.05, 0);
    manoMesh.rotation.set(0, 0, 0);
    manoMesh.scale.set(1, 1, 1);
    manoMesh.visible = true;
    manoMesh.frustumCulled = false;

    // 强制从任何父级移除，然后直接添加到场景
    if (manoMesh.parent) {
        console.log("Removing manoMesh from parent:", manoMesh.parent.type);
        manoMesh.parent.remove(manoMesh);
    }

    if (gripperScene) {
        gripperScene.add(manoMesh);
        console.log("MANO mesh added directly to scene");
    } else {
        console.error("gripperScene is null!");
        return;
    }

    // 强制更新矩阵
    manoMesh.updateMatrix();
    manoMesh.updateMatrixWorld(true);

    // 计算模型中心（世界坐标）
    manoMesh.geometry.computeBoundingBox();
    const bb = manoMesh.geometry.boundingBox;
    const center = new THREE.Vector3();
    bb.getCenter(center);
    center.applyMatrix4(manoMesh.matrixWorld);

    console.log("Model bounding box (local):", {
        min: bb.min.toArray(),
        max: bb.max.toArray()
    });
    console.log("Model center (world):", center.toArray());
    console.log("manoMesh position:", manoMesh.position.toArray());
    console.log("manoMesh scale:", manoMesh.scale.toArray());
    console.log("manoMesh.parent:", manoMesh.parent ? manoMesh.parent.type : "null");
    console.log("manoMesh in scene children:", gripperScene.children.includes(manoMesh));

    // 注意：不再隐藏其他物体，保持夹爪可见

    // 渲染
    if (gripperRenderer) {
        gripperRenderer.render(gripperScene, gripperCamera);
    }

    // 列出场景中可见的 mesh
    console.log("Scene children (visible):");
    gripperScene.children.forEach((child, i) => {
        if (child.visible) {
            console.log(`  [${i}] ${child.type} name="${child.name}" visible=${child.visible}`);
        }
    });

    console.log("=== Test MANO complete ===");
}

window.debugTestManoBasicMaterial = debugTestManoBasicMaterial;

// 最简单的渲染测试 - 添加一个红色立方体
function debugTestCube() {
    console.log("=== DEBUG: Testing with a simple cube ===");

    if (!gripperScene) {
        console.error("gripperScene is null!");
        return;
    }

    // 创建一个简单的红色立方体
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 0.1, 0);
    cube.name = 'debug_cube';

    gripperScene.add(cube);
    console.log("Green cube added at (0, 0.1, 0)");

    // 调整相机
    if (gripperCamera) {
        gripperCamera.position.set(0.3, 0.3, 0.3);
        gripperCamera.lookAt(0, 0.1, 0);
    }
    if (gripperControls) {
        gripperControls.target.set(0, 0.1, 0);
        gripperControls.update();
    }

    // 渲染
    if (gripperRenderer) {
        gripperRenderer.render(gripperScene, gripperCamera);
    }

    console.log("Cube test complete - you should see a green cube");
}
window.debugTestCube = debugTestCube;

// 绑定测试按钮
document.addEventListener('DOMContentLoaded', function() {
    const testManoBtn = document.getElementById('test-mano-btn');
    if (testManoBtn) {
        testManoBtn.addEventListener('click', function() {
            console.log('Test MANO button clicked');
            debugTestManoBasicMaterial();
        });
    }

    // 绑定 MANO Shape 拟合按钮
    const fitManoBtn = document.getElementById('fit-mano-btn');
    if (fitManoBtn) {
        fitManoBtn.addEventListener('click', fitManoShape);
    }
});

/**
 * MANO Shape 拟合功能
 * 从当前加载的 MPS 数据拟合 MANO shape 参数
 */
async function fitManoShape() {
    // Check if MPS data is loaded (from server path)
    if (!selectedGroup || !selectedGroup.mps_folder) {
        // Check if hand_tracking file exists in the group
        const htFile = selectedGroup && selectedGroup.hand_tracking_file;
        if (!htFile && !handLandmarksData) {
            alert('请先选择包含 MPS 文件夹的数据组');
            return;
        }
    }

    const fitBtn = document.getElementById('fit-mano-btn');

    const originalText = fitBtn.textContent;
    fitBtn.textContent = '拟合中...';
    fitBtn.disabled = true;
    fitBtn.style.background = '#ccc';

    try {
        // Send MPS folder path to server
        const formData = new FormData();
        if (selectedGroup && selectedGroup.mps_folder) {
            const htPath = selectedGroup.mps_folder + '/hand_tracking/hand_tracking_results.csv';
            formData.append('mps_server_path', htPath);
        } else if (selectedGroup && selectedGroup.hand_tracking_file) {
            formData.append('mps_server_path', selectedGroup.hand_tracking_file);
        }
        formData.append('hand', 'right');
        formData.append('iterations', '500');

        const response = await fetch('/gripper/fit_mano_shape', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || '拟合失败');
        }

        // 显示结果
        let message = `✅ MANO Shape 拟合完成\n\n`;

        if (result.comparison) {
            message += `大拇指/食指比例对比:\n`;
            message += `  MPS: ${result.comparison.mps_ratio?.toFixed(3) || '-'}\n`;
            message += `  MANO原始: ${result.comparison.mano_original_ratio?.toFixed(3) || '-'}\n`;
            message += `  MANO拟合: ${result.comparison.mano_fitted_ratio?.toFixed(3) || '-'}\n\n`;
        }

        if (result.betas) {
            message += `Shape参数 (betas):\n`;
            message += `  [${result.betas.map(b => b.toFixed(2)).join(', ')}]\n\n`;
        }

        message += `输出文件:\n`;
        message += `  ${result.obj_url}\n`;
        message += `  ${result.json_url}\n\n`;

        message += `是否切换到拟合后的模型？`;

        if (confirm(message)) {
            // 重新加载 MANO 模型
            await reloadManoModel(result.obj_url, result.json_url);
            console.log('Switched to fitted MANO model');
        }

    } catch (error) {
        console.error('MANO shape fitting error:', error);
        alert(`拟合失败: ${error.message}`);
    } finally {
        // 恢复按钮
        fitBtn.textContent = originalText;
        fitBtn.disabled = false;
        fitBtn.style.background = '#9c27b0';
    }
}

/**
 * 重新加载 MANO 模型
 */
async function reloadManoModel(objUrl, jsonUrl) {
    try {
        // 加载新的 OBJ 和 JSON
        const [objResponse, jsonResponse] = await Promise.all([
            fetch(objUrl),
            fetch(jsonUrl)
        ]);

        if (!objResponse.ok || !jsonResponse.ok) {
            throw new Error('Failed to load fitted MANO model files');
        }

        // 解析 JSON
        manoData = await jsonResponse.json();

        // 解析 OBJ
        const objText = await objResponse.text();

        if (typeof THREE.OBJLoader === 'undefined') {
            console.warn('OBJLoader not available');
            return;
        }

        const loader = new THREE.OBJLoader();
        const obj = loader.parse(objText);

        // 获取新 mesh
        let newMesh = null;
        obj.traverse(child => {
            if (child instanceof THREE.Mesh) {
                newMesh = child;
            }
        });

        if (!newMesh) {
            throw new Error('No mesh found in fitted OBJ');
        }

        // 复制 geometry
        if (manoMesh) {
            manoMesh.geometry.dispose();
            manoMesh.geometry = newMesh.geometry.clone();

            // 保存初始顶点
            manoRestVertices = new Float32Array(manoMesh.geometry.attributes.position.array);

            console.log('MANO model reloaded with fitted shape');
        }

    } catch (error) {
        console.error('Error reloading MANO model:', error);
        throw error;
    }
}
window.fitManoShape = fitManoShape;
window.reloadManoModel = reloadManoModel;

// ========== 触觉数据可视化 ==========

// MANO 指尖顶点索引 (来自 HOT3D，但 thumb 调整为 745 因为 744 在当前模型中不存在)
const MANO_FINGERTIP_VERT_INDICES = {
    thumb: 745,  // 原为 744，但该模型中不存在，使用 745 代替
    index: 320,
    middle: 443,
    ring: 554,
    pinky: 671
};

// 触觉可视化参数（可通过前端控制）
let hapticSettings = {
    enabled: true,
    radius: 0.05,      // 影响半径（米）
    forceMin: 0,       // 力值映射下限
    forceMax: 10,      // 力值映射上限（默认10N）
    timeOffset: 0      // 时间偏移（秒），正值表示触觉数据延后
};

// 初始化触觉控制面板
function initHapticControls() {
    const enabledCheckbox = document.getElementById('haptic-enabled');
    const radiusSlider = document.getElementById('haptic-radius');
    const radiusValue = document.getElementById('haptic-radius-value');
    const forceMinInput = document.getElementById('haptic-force-min');
    const forceMaxInput = document.getElementById('haptic-force-max');

    if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', (e) => {
            hapticSettings.enabled = e.target.checked;
            if (!hapticSettings.enabled) {
                resetManoColors();
            }
        });
    }

    if (radiusSlider) {
        radiusSlider.addEventListener('input', (e) => {
            const mm = parseInt(e.target.value);
            hapticSettings.radius = mm / 1000;  // 转换为米
            if (radiusValue) radiusValue.textContent = mm + 'mm';
        });
    }

    if (forceMinInput) {
        forceMinInput.addEventListener('change', (e) => {
            hapticSettings.forceMin = parseFloat(e.target.value) || 0;
            // 确保 min < max
            if (hapticSettings.forceMin >= hapticSettings.forceMax) {
                hapticSettings.forceMax = hapticSettings.forceMin + 1;
                if (forceMaxInput) forceMaxInput.value = hapticSettings.forceMax;
            }
        });
    }

    if (forceMaxInput) {
        forceMaxInput.addEventListener('change', (e) => {
            hapticSettings.forceMax = parseFloat(e.target.value) || 10;
            // 确保 max > min
            if (hapticSettings.forceMax <= hapticSettings.forceMin) {
                hapticSettings.forceMin = Math.max(0, hapticSettings.forceMax - 1);
                if (forceMinInput) forceMinInput.value = hapticSettings.forceMin;
            }
        });
    }

    // 时间偏移控制
    const timeOffsetInput = document.getElementById('haptic-time-offset');
    if (timeOffsetInput) {
        timeOffsetInput.addEventListener('change', (e) => {
            hapticSettings.timeOffset = parseFloat(e.target.value) || 0;
            console.log('Haptic time offset:', hapticSettings.timeOffset, 's');
        });
    }

    // Force bar max input (in force bars panel)
    const forceBarMaxInput = document.getElementById('force-bar-max');
    if (forceBarMaxInput) {
        forceBarMaxInput.addEventListener('change', (e) => {
            hapticSettings.forceMax = parseFloat(e.target.value) || 174;
            // Sync with haptic panel input
            if (forceMaxInput) forceMaxInput.value = hapticSettings.forceMax;
            console.log('Force bar max updated to:', hapticSettings.forceMax);
        });
    }

    console.log('Haptic controls initialized');
}

/**
 * Update the file status box with load results
 */
function updateFileStatusBox(data) {
    const statusBox = document.getElementById('file-status-box');
    if (!statusBox) return;

    const lines = [];

    // Hand data status
    if (data.hand_landmarks && data.hand_landmarks.right_hand) {
        const frames = data.hand_landmarks.right_hand.length;
        const validFrames = data.hand_landmarks.right_hand.filter(f => f && f.length === 21).length;
        lines.push(`<span style="color: #28a745;">✓ 手部数据:</span> ${frames} 帧 (有效: ${validFrames})`);
    } else {
        lines.push(`<span style="color: #dc3545;">✗ 手部数据:</span> 未加载`);
    }

    // Haptic data status
    if (data.haptic_data && data.haptic_data.sensors) {
        const sensors = Object.keys(data.haptic_data.sensors);
        const samples = data.haptic_data.timestamps?.length || 0;
        const forceRange = data.haptic_data.force_range || [0, 0];
        lines.push(`<span style="color: #28a745;">✓ 触觉数据:</span> ${samples} 样本`);
        lines.push(`  传感器: ${sensors.join(', ')}`);
        lines.push(`  力范围: ${forceRange[0].toFixed(2)} ~ ${forceRange[1].toFixed(2)} N`);

        // Show per-sensor info (avoid stack overflow with large arrays)
        for (const [finger, sensorData] of Object.entries(data.haptic_data.sensors)) {
            if (sensorData.total && sensorData.total.length > 0) {
                let min = sensorData.total[0], max = sensorData.total[0];
                for (let i = 1; i < sensorData.total.length; i++) {
                    if (sensorData.total[i] < min) min = sensorData.total[i];
                    if (sensorData.total[i] > max) max = sensorData.total[i];
                }
                lines.push(`  ${finger}: ${min.toFixed(2)} ~ ${max.toFixed(2)} N`);
            }
        }
    } else {
        lines.push(`<span style="color: #ffc107;">○ 触觉数据:</span> 未加载`);
    }

    // URDF status
    if (data.urdf) {
        const linkCount = data.urdf.links?.length || 0;
        const jointCount = data.urdf.joints?.length || 0;
        lines.push(`<span style="color: #28a745;">✓ URDF:</span> ${linkCount} links, ${jointCount} joints`);
    } else {
        lines.push(`<span style="color: #ffc107;">○ URDF:</span> 未加载`);
    }

    // STL status
    if (data.stl_file_map && Object.keys(data.stl_file_map).length > 0) {
        lines.push(`<span style="color: #28a745;">✓ STL:</span> ${Object.keys(data.stl_file_map).length} 文件`);
    } else if (data.stl_urls && data.stl_urls.length > 0) {
        lines.push(`<span style="color: #28a745;">✓ STL:</span> ${data.stl_urls.length} 文件`);
    } else {
        lines.push(`<span style="color: #ffc107;">○ STL:</span> 未加载`);
    }

    // World coordinates
    if (data.world_coordinates) {
        lines.push(`<span style="color: #17a2b8;">ℹ 坐标系:</span> 世界坐标`);
    } else {
        lines.push(`<span style="color: #6c757d;">ℹ 坐标系:</span> 设备坐标`);
    }

    statusBox.innerHTML = lines.join('<br>');
}

// 更新当前力值显示
function updateHapticForceDisplay(hapticValues) {
    const forceDisplay = document.getElementById('haptic-current-force');
    if (!forceDisplay || !hapticValues) return;

    const forces = [];
    if (hapticValues.thumb !== undefined) forces.push(`拇:${hapticValues.thumb.toFixed(1)}`);
    if (hapticValues.index !== undefined) forces.push(`食:${hapticValues.index.toFixed(1)}`);

    forceDisplay.textContent = forces.length > 0 ? forces.join(' ') : '--';

    // Update force progress bars
    updateForceBars(hapticValues);
}

/**
 * Update force progress bars UI
 */
function updateForceBars(hapticValues) {
    const thumbBar = document.getElementById('thumb-force-bar');
    const indexBar = document.getElementById('index-force-bar');
    const thumbValue = document.getElementById('thumb-force-value');
    const indexValue = document.getElementById('index-force-value');
    const thumbMaxLabel = document.getElementById('thumb-force-max-label');
    const indexMaxLabel = document.getElementById('index-force-max-label');

    if (!thumbBar || !indexBar) return;

    const forceMin = hapticSettings.forceMin;
    const forceMax = hapticSettings.forceMax;
    const forceRange = forceMax - forceMin;

    // Get force threshold (values above this are not displayed)
    const thresholdInput = document.getElementById('force-threshold');
    const forceThreshold = thresholdInput ? parseFloat(thresholdInput.value) || Infinity : Infinity;

    // Update max labels
    if (thumbMaxLabel) thumbMaxLabel.textContent = forceMax;
    if (indexMaxLabel) indexMaxLabel.textContent = forceMax;

    // Update thumb bar
    if (hapticValues && hapticValues.thumb !== undefined) {
        const thumbForce = hapticValues.thumb;
        // Check threshold - if exceeded, show as invalid/hidden
        if (thumbForce > forceThreshold) {
            thumbBar.style.height = '0%';
            thumbBar.style.background = '#ccc';
            if (thumbValue) thumbValue.textContent = '超限';
            if (thumbValue) thumbValue.style.color = '#e53935';
        } else {
            const thumbNorm = Math.min(1, Math.max(0, (thumbForce - forceMin) / forceRange));
            const thumbPercent = thumbNorm * 100;
            thumbBar.style.height = thumbPercent + '%';
            thumbBar.style.background = getForceBarGradient(thumbNorm);
            if (thumbValue) thumbValue.textContent = thumbForce.toFixed(1);
            if (thumbValue) thumbValue.style.color = '#495057';
        }
    } else {
        thumbBar.style.height = '0%';
        if (thumbValue) thumbValue.textContent = '--';
    }

    // Update index bar
    if (hapticValues && hapticValues.index !== undefined) {
        const indexForce = hapticValues.index;
        // Check threshold - if exceeded, show as invalid/hidden
        if (indexForce > forceThreshold) {
            indexBar.style.height = '0%';
            indexBar.style.background = '#ccc';
            if (indexValue) indexValue.textContent = '超限';
            if (indexValue) indexValue.style.color = '#e53935';
        } else {
            const indexNorm = Math.min(1, Math.max(0, (indexForce - forceMin) / forceRange));
            const indexPercent = indexNorm * 100;
            indexBar.style.height = indexPercent + '%';
            indexBar.style.background = getForceBarGradient(indexNorm);
            if (indexValue) indexValue.textContent = indexForce.toFixed(1);
            if (indexValue) indexValue.style.color = '#495057';
        }
    } else {
        indexBar.style.height = '0%';
        if (indexValue) indexValue.textContent = '--';
    }
}

/**
 * Get color for force bar based on normalized value
 */
function getForceBarGradient(normalizedForce) {
    // Returns a solid color based on force level
    const p = Math.min(1, Math.max(0, normalizedForce));

    let r, g, b;
    if (p < 0.5) {
        // Green to yellow
        r = Math.round(p * 2 * 255);
        g = 255;
        b = 0;
    } else {
        // Yellow to red
        r = 255;
        g = Math.round((1 - (p - 0.5) * 2) * 255);
        b = 0;
    }

    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 根据力值获取颜色 (绿色->黄色->红色)
 */
function getForceColor(normalizedForce) {
    const p = Math.min(1, Math.max(0, normalizedForce));

    // 绿色 -> 黄色 -> 红色
    let r, g, b;
    if (p < 0.5) {
        // 绿色到黄色
        r = p * 2;
        g = 1;
        b = 0;
    } else {
        // 黄色到红色
        r = 1;
        g = 1 - (p - 0.5) * 2;
        b = 0;
    }

    return { r, g, b };
}

/**
 * 根据当前时间获取触觉数据值
 */
let hapticTimeDebugCounter = 0;
let hapticTimeOffset = null; // Auto-calculated offset to align hand and haptic timestamps
let savedAlignmentOffset = null; // Alignment offset loaded from offset_config (from alignment page)

function getHapticValueAtTime(currentTime) {
    if (!hapticData || !hapticData.timestamps || hapticData.timestamps.length === 0) {
        return null;
    }

    // Auto-calculate time offset on first call (align start times)
    if (hapticTimeOffset === null && handTimestamps.length > 0) {
        const handStart = handTimestamps[0];
        const hapticStart = hapticData.timestamps[0];
        hapticTimeOffset = handStart - hapticStart;
        console.log('Auto-calculated haptic time offset:', hapticTimeOffset,
            '(hand starts at', handStart, ', haptic starts at', hapticStart, ')');

        // If alignment offset is available, compute residual correction
        if (savedAlignmentOffset !== null) {
            const residual = savedAlignmentOffset - hapticTimeOffset;
            hapticSettings.timeOffset = residual;
            const inputEl = document.getElementById('haptic-time-offset');
            if (inputEl) inputEl.value = residual.toFixed(2);
            console.log('Applied alignment offset:', savedAlignmentOffset,
                '-> residual timeOffset:', residual.toFixed(3), 's');
        }
    }

    // Convert hand time to haptic time coordinate
    // hapticTime = handTime - hapticTimeOffset
    const autoOffset = hapticTimeOffset || 0;
    const adjustedTime = currentTime - autoOffset - hapticSettings.timeOffset;

    // 找到最近的时间戳索引 (binary search for efficiency)
    let nearestIdx = 0;
    const timestamps = hapticData.timestamps;

    // Binary search
    let left = 0, right = timestamps.length - 1;
    while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (timestamps[mid] < adjustedTime) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }

    // Check which neighbor is closer
    nearestIdx = left;
    if (left > 0 && Math.abs(timestamps[left - 1] - adjustedTime) < Math.abs(timestamps[left] - adjustedTime)) {
        nearestIdx = left - 1;
    }

    const minDiff = Math.abs(timestamps[nearestIdx] - adjustedTime);

    // Debug: log time matching info
    if (hapticTimeDebugCounter++ < 10) {
        const hapticTimeRange = [timestamps[0], timestamps[timestamps.length - 1]];
        console.log('getHapticValueAtTime:', {
            currentTime,
            adjustedTime,
            hapticTimeRange,
            nearestIdx,
            minDiff,
            thumbForce: hapticData.sensors?.thumb?.total?.[nearestIdx],
            indexForce: hapticData.sensors?.index?.total?.[nearestIdx]
        });
    }

    // 提取各传感器的力值
    const result = {};
    for (const [finger, sensorData] of Object.entries(hapticData.sensors)) {
        if (sensorData.total && sensorData.total[nearestIdx] !== undefined) {
            result[finger] = sensorData.total[nearestIdx];
        }
    }

    return result;
}

/**
 * 更新 MANO mesh 的顶点颜色以反映触觉数据
 */
let hapticDebugCounter = 0;
function updateManoHapticColors(currentTime) {
    // 检查是否启用
    if (!hapticSettings.enabled) {
        return;
    }

    if (!manoMesh || !hapticData) {
        if (hapticDebugCounter++ < 5) {
            console.log('updateManoHapticColors: missing manoMesh or hapticData', {manoMesh: !!manoMesh, hapticData: !!hapticData});
        }
        return;
    }

    const geometry = manoMesh.geometry;
    if (!geometry.attributes.color) {
        if (hapticDebugCounter++ < 5) {
            console.log('updateManoHapticColors: no color attribute on geometry');
        }
        return;
    }

    const colors = geometry.attributes.color;
    const positions = geometry.attributes.position;
    const numVerts = positions.count;

    // 获取当前时间的触觉值
    const hapticValues = getHapticValueAtTime(currentTime);
    if (!hapticValues) {
        if (hapticDebugCounter++ < 5) {
            console.log('updateManoHapticColors: no haptic values at time', currentTime);
        }
        return;
    }

    // 更新力值显示
    updateHapticForceDisplay(hapticValues);

    // 调试输出（只输出前几次）
    if (hapticDebugCounter++ < 10) {
        console.log('updateManoHapticColors:', {
            currentTime,
            hapticValues,
            numVerts,
            forceRange: hapticData.force_range,
            settings: hapticSettings
        });
    }

    // 计算力的范围用于归一化
    const forceRange = hapticData.force_range || [0, 100];
    const forceMin = forceRange[0];
    const forceMax = Math.max(forceRange[1], forceMin + 1);

    // 获取指尖顶点位置
    // 注意：MANO_FINGERTIP_VERT_INDICES 是原始778顶点的索引
    // OBJ加载后顶点被展开成4614个，需要使用 vertexMapping 找到对应的展开顶点
    // 使用当前变形后的顶点位置（不是原始T-pose位置）
    const fingertipPositions = {};
    const vertexMapping = manoMesh.userData.vertexMapping;

    for (const [finger, origVertIdx] of Object.entries(MANO_FINGERTIP_VERT_INDICES)) {
        // 找到映射到该原始顶点的展开顶点，使用当前变形后的位置
        if (vertexMapping) {
            for (let i = 0; i < numVerts; i++) {
                if (vertexMapping[i] === origVertIdx) {
                    fingertipPositions[finger] = new THREE.Vector3(
                        positions.array[i * 3],
                        positions.array[i * 3 + 1],
                        positions.array[i * 3 + 2]
                    );
                    break;
                }
            }
        }
    }

    // 调试输出指尖位置（只输出前几次）
    if (hapticDebugCounter < 10) {
        console.log('=== Haptic Debug ===');
        console.log('Fingertip positions found:', Object.keys(fingertipPositions));
        console.log('thumb position:', fingertipPositions.thumb);
        console.log('index position:', fingertipPositions.index);
        console.log('hapticValues:', hapticValues);
        console.log('vertexMapping available:', !!vertexMapping);
        if (!fingertipPositions.thumb) {
            console.warn('WARNING: thumb position not found! Checking vertexMapping...');
            // 找出 vertexMapping 中的最大索引和索引分布
            let maxIdx = 0;
            const indexCounts = {};
            for (let i = 0; i < numVerts; i++) {
                if (vertexMapping) {
                    const idx = vertexMapping[i];
                    if (idx > maxIdx) maxIdx = idx;
                    // 统计 740-778 范围内的索引（大拇指区域）
                    if (idx >= 740 && idx <= 778) {
                        indexCounts[idx] = (indexCounts[idx] || 0) + 1;
                    }
                }
            }
            console.log('vertexMapping max index:', maxIdx);
            console.log('Indices in range 740-778:', indexCounts);
            console.log('Looking for thumb tip alternatives near 744...');

            // 尝试找到740-750范围内的顶点作为备选
            for (let targetIdx = 740; targetIdx <= 750; targetIdx++) {
                for (let i = 0; i < numVerts; i++) {
                    if (vertexMapping && vertexMapping[i] === targetIdx) {
                        console.log(`Found vertex ${targetIdx} at expanded index ${i}`);
                        break;
                    }
                }
            }
        }
    }

    // 遍历所有顶点，计算颜色
    let coloredVerts = 0;
    for (let i = 0; i < numVerts; i++) {
        const vertPos = new THREE.Vector3(
            positions.array[i * 3],
            positions.array[i * 3 + 1],
            positions.array[i * 3 + 2]
        );

        // 默认肤色 (深色，提高对比度)
        let r = 0.82, g = 0.64, b = 0.49;
        let wasColored = false;

        // 检查与各指尖的距离
        const influenceRadius = hapticSettings.radius;  // 使用设置的半径
        // 使用用户设置的力值映射范围
        const mappingMin = hapticSettings.forceMin;
        const mappingMax = hapticSettings.forceMax;

        // Get force threshold from UI
        const thresholdInput = document.getElementById('force-threshold');
        const forceThreshold = thresholdInput ? parseFloat(thresholdInput.value) || Infinity : Infinity;

        for (const [finger, tipPos] of Object.entries(fingertipPositions)) {
            const force = hapticValues[finger];
            if (force === undefined) continue;

            // 如果力值小于映射下限，不着色
            if (force < mappingMin) continue;

            // 如果力值超过阈值，不着色（视为无效数据）
            if (force > forceThreshold) continue;

            const dist = vertPos.distanceTo(tipPos);
            if (dist < influenceRadius) {
                wasColored = true;
                // 计算影响权重（距离越近权重越大）
                const distWeight = 1 - (dist / influenceRadius);

                // 使用用户设置的范围归一化力值
                const normalizedForce = Math.min(1, Math.max(0, (force - mappingMin) / (mappingMax - mappingMin)));
                const forceColor = getForceColor(normalizedForce);

                // 力值权重 - 力越大颜色越明显
                const forceWeight = Math.min(1, normalizedForce * 2);  // 放大力值影响
                const weight = distWeight * (0.3 + 0.7 * forceWeight);  // 最小30%权重

                // 混合颜色
                r = r * (1 - weight) + forceColor.r * weight;
                g = g * (1 - weight) + forceColor.g * weight;
                b = b * (1 - weight) + forceColor.b * weight;
            }
        }

        if (wasColored) coloredVerts++;

        colors.array[i * 3] = r;
        colors.array[i * 3 + 1] = g;
        colors.array[i * 3 + 2] = b;
    }

    // 调试：输出着色顶点数
    if (hapticDebugCounter < 15) {
        console.log(`Haptic: colored ${coloredVerts}/${numVerts} vertices`);
    }

    colors.needsUpdate = true;
}

/**
 * 重置 MANO mesh 颜色为默认肤色
 */
function resetManoColors() {
    if (!manoMesh) return;

    const geometry = manoMesh.geometry;
    if (!geometry.attributes.color) return;

    const colors = geometry.attributes.color;
    const numVerts = colors.count;

    for (let i = 0; i < numVerts; i++) {
        colors.array[i * 3] = 0.82;
        colors.array[i * 3 + 1] = 0.64;
        colors.array[i * 3 + 2] = 0.49;
    }

    colors.needsUpdate = true;
}

window.updateManoHapticColors = updateManoHapticColors;
window.resetManoColors = resetManoColors;
window.getHapticValueAtTime = getHapticValueAtTime;

// ==================== VRS Video Frame Functions ====================

/**
 * Initialize VRS file input listener (no longer uses file input, kept for compatibility)
 */
function initVRSFileInput() {
    // No-op: VRS is now auto-loaded from server path via data group selection
}

/**
 * Initialize VRS session from server path (no upload needed)
 */
async function initVRSSessionFromPath(vrsPath) {
    const loadingEl = document.getElementById('video-frame-loading');
    const errorEl = document.getElementById('video-frame-error');
    const imgEl = document.getElementById('video-frame-img');
    const vrsPanelInfo = document.getElementById('vrs-panel-info');
    const videoFramePanel = document.getElementById('video-frame-panel');

    try {
        if (errorEl) errorEl.style.display = 'none';
        if (imgEl) imgEl.style.display = 'none';
        if (loadingEl) loadingEl.style.display = 'block';

        console.log('Initializing VRS from server path:', vrsPath);

        const formData = new FormData();
        formData.append('vrs_server_path', vrsPath);

        const response = await fetch('/gripper/init_vrs', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        console.log('VRS init response:', result);

        if (response.ok && result.success) {
            vrsSessionInitialized = true;
            vrsAvailableCameras = result.cameras || [];
            vrsNumFrames = result.num_frames || 0;
            vrsTimeRangeS = result.time_range_s || [0, 0];

            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'none';
            if (vrsPanelInfo) vrsPanelInfo.textContent = `VRS: ${vrsPath.split('/').pop()}`;
            if (videoFramePanel) videoFramePanel.style.display = 'flex';

            lastVideoFrameIndex = -1;
            await updateVideoFrame(0);
        } else {
            throw new Error(result.error || 'Failed to initialize VRS session');
        }
    } catch (error) {
        console.error('VRS initialization error:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) {
            errorEl.textContent = error.message || '初始化失败';
            errorEl.style.display = 'block';
        }
        vrsSessionInitialized = false;
    }
}

/**
 * Upload VRS file and initialize session (legacy, kept for compatibility)
 */
async function initVRSSession(vrsFile) {
    const loadingEl = document.getElementById('video-frame-loading');
    const errorEl = document.getElementById('video-frame-error');
    const imgEl = document.getElementById('video-frame-img');
    const vrsFileInfo = document.getElementById('vrs-file-info');

    try {
        if (errorEl) errorEl.style.display = 'none';
        if (imgEl) imgEl.style.display = 'none';

        console.log('Uploading VRS file:', vrsFile.name, 'size:', (vrsFile.size / 1024 / 1024).toFixed(1), 'MB');

        const formData = new FormData();
        formData.append('vrs_file', vrsFile);

        const response = await fetch('/gripper/init_vrs', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        console.log('VRS init response:', result);

        if (response.ok && result.success) {
            vrsSessionInitialized = true;
            vrsAvailableCameras = result.cameras || [];
            console.log('VRS session initialized, cameras:', vrsAvailableCameras);

            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'none';
            if (vrsFileInfo) vrsFileInfo.textContent = `✓ ${vrsFile.name}`;

            // Fetch first frame immediately (timestamp 0 will get first frame)
            lastVideoFrameTimestamp = null;  // Reset to force fetch
            console.log('Fetching initial video frame...');
            await updateVideoFrame(0);  // Force timestamp 0 to get first frame
        } else {
            throw new Error(result.error || 'Failed to initialize VRS session');
        }

    } catch (error) {
        console.error('VRS initialization error:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) {
            errorEl.textContent = error.message || '初始化失败';
            errorEl.style.display = 'block';
        }
        if (vrsFileInfo) vrsFileInfo.textContent = `✗ ${vrsFile.name}`;
        vrsSessionInitialized = false;
    }
}

/**
 * Fetch and display video frame for current hand/haptic frame index.
 * Maps the current data frame index proportionally to VRS frame index.
 * @param {number|null} [forceFrameIndex] - Optional VRS frame index to fetch directly
 */
async function updateVideoFrame(forceFrameIndex = null) {
    if (!vrsSessionInitialized || videoFramePending) return;

    // Calculate VRS frame index
    let vrsFrameIndex;
    if (forceFrameIndex !== null) {
        vrsFrameIndex = forceFrameIndex;
    } else {
        const totalDataFrames = handTimestamps.length > 0 ? handTimestamps.length : hapticTimestamps.length;
        if (totalDataFrames === 0 || vrsNumFrames === 0) {
            vrsFrameIndex = 0;
        } else {
            // Map current data frame to VRS frame proportionally
            const dataFrameIdx = Math.floor(currentFrameIndex) % totalDataFrames;
            const ratio = dataFrameIdx / (totalDataFrames - 1);
            vrsFrameIndex = Math.round(ratio * (vrsNumFrames - 1));
        }
    }

    // Clamp to valid range
    vrsFrameIndex = Math.max(0, Math.min(vrsFrameIndex, vrsNumFrames - 1));

    // Skip if same frame
    if (vrsFrameIndex === lastVideoFrameIndex) return;

    videoFramePending = true;
    const loadingEl = document.getElementById('video-frame-loading');
    const errorEl = document.getElementById('video-frame-error');
    const imgEl = document.getElementById('video-frame-img');
    const timeEl = document.getElementById('video-frame-time');

    try {
        if (loadingEl) loadingEl.style.display = 'block';

        const camera = vrsAvailableCameras.find(c => c.includes('rgb')) ||
                       vrsAvailableCameras[0] || 'camera-rgb';

        const response = await fetch(`/gripper/video_frame?frame_index=${vrsFrameIndex}&camera=${camera}`);
        const result = await response.json();

        if (response.ok && result.image) {
            if (imgEl) {
                imgEl.src = result.image;
                imgEl.style.display = 'block';
            }
            if (errorEl) errorEl.style.display = 'none';
            if (timeEl) timeEl.textContent = `${result.timestamp_s.toFixed(2)}s`;
            lastVideoFrameIndex = vrsFrameIndex;
        } else {
            throw new Error(result.error || 'Failed to get frame');
        }

    } catch (error) {
        console.error('Video frame error:', error);
        if (errorEl) {
            errorEl.textContent = error.message || '获取帧失败';
            errorEl.style.display = 'block';
        }
        if (imgEl) imgEl.style.display = 'none';
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        videoFramePending = false;
    }
}

/**
 * Schedule video frame updates during playback
 */
let videoFrameUpdateTimer = null;

function startVideoFrameUpdates() {
    if (videoFrameUpdateTimer) return;

    videoFrameUpdateTimer = setInterval(() => {
        if (vrsSessionInitialized && isPlaying) {
            updateVideoFrame();
        }
    }, videoFrameUpdateInterval);
}

function stopVideoFrameUpdates() {
    if (videoFrameUpdateTimer) {
        clearInterval(videoFrameUpdateTimer);
        videoFrameUpdateTimer = null;
    }
}

// Show video frame panel when data is loaded
function showVideoFramePanel() {
    const panel = document.getElementById('video-frame-panel');
    if (panel) {
        panel.style.display = 'flex';
    }
}

// Initialize VRS input on page load
document.addEventListener('DOMContentLoaded', () => {
    initVRSFileInput();
    startVideoFrameUpdates();
});

// Export for use elsewhere
window.updateVideoFrame = updateVideoFrame;
window.showVideoFramePanel = showVideoFramePanel;
