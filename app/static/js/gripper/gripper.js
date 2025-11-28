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

// Finger colors
const FINGER_COLORS = {
    thumb: 0xff0000,    // Red
    index: 0xffa500,    // Orange
    middle: 0xffff00,   // Yellow
    ring: 0x00ff00,     // Green
    pinky: 0x0000ff,    // Blue
    wrist: 0x6c757d,    // Gray
    palm: 0x800080      // Purple
};

// Global variables
let gripperScene, gripperCamera, gripperRenderer, gripperControls;
let gripperModels = [];  // Array to store multiple STL models
let gripperLinkMap = {};  // Map link names to Three.js objects
let gripperLinkInitialTransforms = {};  // Store initial transforms for reset
let urdfData = null;  // Parsed URDF data
let handLandmarksData = null;
let handTimestamps = [];  // Timestamps for each frame
let currentFrameIndex = 0;
let animationId = null;
let isPlaying = false;
let playbackSpeed = 1;
let playInterval = null;

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

// Hand pose transform settings
let handPoseTransform = {
    posX: 0,      // Position offset in meters
    posY: 0,
    posZ: 0,
    rotX: 0,      // Rotation in degrees
    rotY: 0,
    rotZ: 0,
    scale: 1.0
};

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

    // Map all landmarks relative to wrist position with full transform
    const mappedLandmarks = landmarks.map((landmark, idx) => {
        // Relative position to wrist, scaled
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
    });

    return {
        landmarks: mappedLandmarks,
        wrist: wrist,
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

    // Create joint spheres
    landmarks.forEach((point, idx) => {
        if (!point || point.length < 3) {
            return;
        }

        let color = 0xffffff;

        // Color fingertips
        if (idx === 0) color = FINGER_COLORS.thumb;
        else if (idx === 1) color = FINGER_COLORS.index;
        else if (idx === 2) color = FINGER_COLORS.middle;
        else if (idx === 3) color = FINGER_COLORS.ring;
        else if (idx === 4) color = FINGER_COLORS.pinky;
        else if (idx === 5) color = FINGER_COLORS.wrist;
        else if (idx === 20) color = FINGER_COLORS.palm;

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

            let color = 0xffffff;
            if (i === 0 || j === 0) color = FINGER_COLORS.thumb;
            else if (i === 1 || j === 1) color = FINGER_COLORS.index;
            else if (i === 2 || j === 2) color = FINGER_COLORS.middle;
            else if (i === 3 || j === 3) color = FINGER_COLORS.ring;
            else if (i === 4 || j === 4) color = FINGER_COLORS.pinky;
            else if (i === 20 || j === 20) color = FINGER_COLORS.palm;

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
        // 检查食指旋转
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
    CONFIG_DATA: 'gripper_config_data'  // Full config for easy restore
};

// DOM Elements - will be initialized in DOMContentLoaded
let mpsFileInput;
let urdfFileInput;
let stlFilesInput;
let stlFolderInput;
let mpsFileInfo;
let urdfFileInfo;
let stlFileInfo;
let stlFileList;
let loadBtn;
let loadingIndicator;
let visualizationSection;
let errorSection;
let errorMessage;

// File input handler functions (to be attached in DOMContentLoaded)
function handleMpsFileChange(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        if (mpsFileInfo) {
            mpsFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
            mpsFileInfo.style.color = '#28a745';
            mpsFileInfo.style.fontStyle = 'normal';
        }
        saveFileInfo(); // Save to localStorage
        checkFormValidity();
    } else {
        if (mpsFileInfo) {
            mpsFileInfo.textContent = '未选择文件';
            mpsFileInfo.style.color = '#6c757d';
        }
        checkFormValidity();
    }
}

function handleUrdfFileChange(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        if (urdfFileInfo) {
            urdfFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
            urdfFileInfo.style.color = '#28a745';
            urdfFileInfo.style.fontStyle = 'normal';
        }
        saveFileInfo(); // Save to localStorage
        checkFormValidity(); // Check if button should be enabled
    } else {
        if (urdfFileInfo) {
            urdfFileInfo.textContent = '未选择文件';
            urdfFileInfo.style.color = '#6c757d';
        }
        saveFileInfo(); // Save to localStorage
        checkFormValidity(); // Check if button should be enabled
    }
}

function handleStlFilesChange(e) {
    const files = e.target.files;
    if (files.length > 0) {
        if (stlFileInfo) {
            stlFileInfo.textContent = `已选择 ${files.length} 个文件`;
            stlFileInfo.style.color = '#28a745';
            stlFileInfo.style.fontStyle = 'normal';
        }

        // Display file list (compact grid layout)
        if (stlFileList) {
            let fileListHtml = '';
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // Truncate long filenames
                const shortName = file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name;
                fileListHtml += `<div style="font-size: 0.8rem; padding: 2px 4px; background: #e9ecef; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${file.name}">${shortName}</div>`;
            }
            stlFileList.innerHTML = fileListHtml;
            stlFileList.style.display = 'grid';
        }

        saveFileInfo(); // Save to localStorage
        checkFormValidity(); // Check if button should be enabled
    } else {
        if (stlFileInfo) {
            stlFileInfo.textContent = '未选择文件（将仅显示手部关键点）';
            stlFileInfo.style.color = '#6c757d';
        }
        if (stlFileList) {
            stlFileList.innerHTML = '';
            stlFileList.style.display = 'none';
        }
        saveFileInfo(); // Save to localStorage
        checkFormValidity(); // Check if button should be enabled
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function checkFormValidity() {
    // Get button element (in case it wasn't loaded when script ran)
    const button = document.getElementById('loadBtn');
    if (!button) {
        console.error('loadBtn not found in checkFormValidity');
        return;
    }
    
    // Get file inputs (in case they weren't loaded when script ran)
    const mpsInput = document.getElementById('mps_file');
    const urdfInput = document.getElementById('urdf_file');
    const stlInput = document.getElementById('stl_files');
    const mpsInfo = document.getElementById('mps-file-info');
    
    // Check if files are selected OR if config is loaded (showing file names)
    const hasMpsFile = mpsInput && mpsInput.files && mpsInput.files.length > 0;
    const hasUrdfFile = urdfInput && urdfInput.files && urdfInput.files.length > 0;
    const hasStlFiles = stlInput && stlInput.files && stlInput.files.length > 0;
    const hasConfigHint = mpsInfo && (mpsInfo.textContent.includes('配置中') || mpsInfo.textContent.includes('上次使用'));
    
    // Enable button if any file is selected OR config is loaded
    const hasAnyFile = hasMpsFile || hasUrdfFile || hasStlFiles;
    const shouldEnable = hasAnyFile || hasConfigHint;
    
    button.disabled = !shouldEnable;
    
    console.log('Form validity check:', {
        hasMpsFile,
        hasUrdfFile,
        hasStlFiles,
        hasConfigHint,
        hasAnyFile,
        shouldEnable,
        buttonDisabled: button.disabled,
        buttonElement: button
    });
    
    if (!hasAnyFile && hasConfigHint) {
        // Show hint that files need to be selected
        console.log('Config loaded but files not selected yet');
    }
    
    // Also log button's actual disabled state for debugging
    if (button.disabled && shouldEnable) {
        console.warn('Button should be enabled but is disabled! Forcing enable...');
        button.disabled = false;
    }
}

// Save file information to localStorage
function saveFileInfo() {
    try {
        const config = {
            mps_filename: null,
            urdf_filename: null,
            stl_filenames: [],
            mapping_settings: mappingSettings,
            timestamp: new Date().toISOString()
        };

        if (mpsFileInput && mpsFileInput.files && mpsFileInput.files.length > 0) {
            config.mps_filename = mpsFileInput.files[0].name;
            localStorage.setItem(STORAGE_KEYS.MPS_FILENAME, config.mps_filename);
        }

        if (urdfFileInput && urdfFileInput.files && urdfFileInput.files.length > 0) {
            config.urdf_filename = urdfFileInput.files[0].name;
            localStorage.setItem(STORAGE_KEYS.URDF_FILENAME, config.urdf_filename);
        }

        if (stlFilesInput && stlFilesInput.files && stlFilesInput.files.length > 0) {
            config.stl_filenames = Array.from(stlFilesInput.files).map(f => f.name);
            localStorage.setItem(STORAGE_KEYS.STL_FILENAMES, JSON.stringify(config.stl_filenames));
        }

        // Save mapping settings
        localStorage.setItem(STORAGE_KEYS.MAPPING_SETTINGS, JSON.stringify(mappingSettings));

        // Save full config
        localStorage.setItem(STORAGE_KEYS.CONFIG_DATA, JSON.stringify(config));

        console.log('File info saved to localStorage');
    } catch (e) {
        console.error('Error saving file info:', e);
    }
}

// Export current configuration to JSON file
function exportConfig() {
    try {
        const config = {
            version: '1.0',
            mps_filename: mpsFileInput && mpsFileInput.files && mpsFileInput.files.length > 0 ? mpsFileInput.files[0].name : null,
            urdf_filename: urdfFileInput && urdfFileInput.files && urdfFileInput.files.length > 0 ? urdfFileInput.files[0].name : null,
            stl_filenames: stlFilesInput && stlFilesInput.files && stlFilesInput.files.length > 0
                ? Array.from(stlFilesInput.files).map(f => f.name)
                : [],
            mapping_settings: mappingSettings,
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
        
        showConfigStatus('配置已导出', 'success');
    } catch (e) {
        console.error('Error exporting config:', e);
        showConfigStatus('导出配置失败: ' + e.message, 'error');
    }
}

// Load configuration from JSON file
function loadConfigFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const config = JSON.parse(e.target.result);
                resolve(config);
            } catch (err) {
                reject(new Error('配置文件格式错误: ' + err.message));
            }
        };
        reader.onerror = function() {
            reject(new Error('读取配置文件失败'));
        };
        reader.readAsText(file);
    });
}

// Apply configuration to form
function applyConfig(config) {
    try {
        // Update mapping settings
        if (config.mapping_settings) {
            Object.assign(mappingSettings, config.mapping_settings);
            
            // Apply to UI
            const scaleSlider = document.getElementById('scale-slider');
            const offsetX = document.getElementById('offset-x');
            const offsetY = document.getElementById('offset-y');
            const offsetZ = document.getElementById('offset-z');
            const showSkeleton = document.getElementById('show-skeleton');
            const showGripper = document.getElementById('show-gripper');
            
            if (scaleSlider) {
                scaleSlider.value = mappingSettings.scale;
                document.getElementById('scale-value').textContent = mappingSettings.scale.toFixed(1);
            }
            if (offsetX) offsetX.value = mappingSettings.offsetX;
            if (offsetY) offsetY.value = mappingSettings.offsetY;
            if (offsetZ) offsetZ.value = mappingSettings.offsetZ;
            if (showSkeleton) showSkeleton.checked = mappingSettings.showSkeleton;
            if (showGripper) showGripper.checked = mappingSettings.showGripper;
        }
        
        // Update file info display (we can't set file input values, but we can show what was configured)
        if (config.mps_filename) {
            mpsFileInfo.textContent = `配置中: ${config.mps_filename} (请重新选择此文件)`;
            mpsFileInfo.style.color = '#ff9800';
            mpsFileInfo.style.fontStyle = 'italic';
        }
        
        if (config.urdf_filename && urdfFileInfo) {
            urdfFileInfo.textContent = `配置中: ${config.urdf_filename} (请重新选择此文件)`;
            urdfFileInfo.style.color = '#ff9800';
            urdfFileInfo.style.fontStyle = 'italic';
        }
        
        if (config.stl_filenames && config.stl_filenames.length > 0 && stlFileInfo) {
            stlFileInfo.textContent = `配置中: ${config.stl_filenames.length} 个文件 (请重新选择)`;
            stlFileInfo.style.color = '#ff9800';
            stlFileInfo.style.fontStyle = 'italic';

            // Show file list (compact grid)
            if (stlFileList) {
                let fileListHtml = '';
                config.stl_filenames.forEach((name) => {
                    const shortName = name.length > 25 ? name.substring(0, 22) + '...' : name;
                    fileListHtml += `<div style="font-size: 0.8rem; padding: 2px 4px; background: #fff3cd; border-radius: 3px; color: #856404; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${name}">${shortName}</div>`;
                });
                stlFileList.innerHTML = fileListHtml;
                stlFileList.style.display = 'grid';
            }
        }
        
        // Save to localStorage
        localStorage.setItem(STORAGE_KEYS.CONFIG_DATA, JSON.stringify(config));
        
        // Update form validity check (allow button to be enabled if config is loaded)
        checkFormValidity();
        
        showConfigStatus('配置已加载，请重新选择文件', 'info');
        console.log('Config applied:', config);
    } catch (e) {
        console.error('Error applying config:', e);
        showConfigStatus('应用配置失败: ' + e.message, 'error');
    }
}

// Load saved config from localStorage
function loadSavedConfig() {
    try {
        const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG_DATA);
        if (savedConfig) {
            const config = JSON.parse(savedConfig);
            applyConfig(config);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error loading saved config:', e);
        showConfigStatus('加载保存的配置失败: ' + e.message, 'error');
        return false;
    }
}

// Show config status message
function showConfigStatus(message, type = 'info') {
    const statusDiv = document.getElementById('config-status');
    if (!statusDiv) return;
    
    const colors = {
        success: { bg: '#d4edda', border: '#28a745', text: '#155724' },
        error: { bg: '#f8d7da', border: '#dc3545', text: '#721c24' },
        info: { bg: '#d1ecf1', border: '#17a2b8', text: '#0c5460' }
    };
    
    const color = colors[type] || colors.info;
    statusDiv.style.cssText = `padding: 8px 12px; background: ${color.bg}; border-left: 4px solid ${color.border}; border-radius: 4px; color: ${color.text}; font-weight: 500;`;
    statusDiv.textContent = message;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.style.cssText = '';
    }, 5000);
}

// Load and display saved file information
function loadSavedFileInfo() {
    try {
        const savedMps = localStorage.getItem(STORAGE_KEYS.MPS_FILENAME);
        const savedUrdf = localStorage.getItem(STORAGE_KEYS.URDF_FILENAME);
        const savedStl = localStorage.getItem(STORAGE_KEYS.STL_FILENAMES);
        const savedSettings = localStorage.getItem(STORAGE_KEYS.MAPPING_SETTINGS);
        
        let hasSavedInfo = false;
        
        // Display saved MPS file info
        if (savedMps) {
            mpsFileInfo.textContent = `上次使用: ${savedMps}`;
            mpsFileInfo.style.color = '#6c757d';
            mpsFileInfo.style.fontStyle = 'italic';
            hasSavedInfo = true;
        }
        
        // Display saved URDF file info
        if (savedUrdf && urdfFileInfo) {
            urdfFileInfo.textContent = `上次使用: ${savedUrdf}`;
            urdfFileInfo.style.color = '#6c757d';
            urdfFileInfo.style.fontStyle = 'italic';
            hasSavedInfo = true;
        }
        
        // Display saved STL files info
        if (savedStl && stlFileInfo) {
            try {
                const stlNames = JSON.parse(savedStl);
                if (stlNames.length > 0) {
                    stlFileInfo.textContent = `上次使用: ${stlNames.length} 个文件`;
                    stlFileInfo.style.color = '#6c757d';
                    stlFileInfo.style.fontStyle = 'italic';

                    // Show file list (compact grid)
                    if (stlFileList) {
                        let fileListHtml = '';
                        stlNames.forEach((name) => {
                            const shortName = name.length > 25 ? name.substring(0, 22) + '...' : name;
                            fileListHtml += `<div style="font-size: 0.8rem; padding: 2px 4px; background: #e3f2fd; border-radius: 3px; color: #1565c0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${name}">${shortName}</div>`;
                        });
                        stlFileList.innerHTML = fileListHtml;
                    }
                    hasSavedInfo = true;
                }
            } catch (e) {
                console.error('Error parsing saved STL files:', e);
            }
        }
        
        // Load saved mapping settings
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                Object.assign(mappingSettings, settings);
                
                // Apply settings to UI
                const scaleSlider = document.getElementById('scale-slider');
                const offsetX = document.getElementById('offset-x');
                const offsetY = document.getElementById('offset-y');
                const offsetZ = document.getElementById('offset-z');
                const showSkeleton = document.getElementById('show-skeleton');
                const showGripper = document.getElementById('show-gripper');
                
                if (scaleSlider) {
                    scaleSlider.value = mappingSettings.scale;
                    document.getElementById('scale-value').textContent = mappingSettings.scale.toFixed(1);
                }
                if (offsetX) offsetX.value = mappingSettings.offsetX;
                if (offsetY) offsetY.value = mappingSettings.offsetY;
                if (offsetZ) offsetZ.value = mappingSettings.offsetZ;
                if (showSkeleton) showSkeleton.checked = mappingSettings.showSkeleton;
                if (showGripper) showGripper.checked = mappingSettings.showGripper;
                
                console.log('Mapping settings loaded from localStorage');
            } catch (e) {
                console.error('Error loading mapping settings:', e);
            }
        }
        
    } catch (e) {
        console.error('Error loading saved file info:', e);
    }
}

// Load button handler
const uploadForm = document.getElementById('uploadForm');
if (!uploadForm) {
    console.error('uploadForm not found!');
} else {
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        console.log('Form submitted');
        
        // Check if files are selected
        const hasMpsFile = mpsFileInput && mpsFileInput.files && mpsFileInput.files.length > 0;
        const hasUrdfFile = urdfFileInput && urdfFileInput.files && urdfFileInput.files.length > 0;
        const hasStlFiles = stlFilesInput && stlFilesInput.files && stlFilesInput.files.length > 0;
        const hasConfigHint = mpsFileInfo && (mpsFileInfo.textContent.includes('配置中') || mpsFileInfo.textContent.includes('上次使用'));
        
        // Allow loading without MPS file if gripper files are provided (for testing display)
        if (!hasMpsFile && !hasConfigHint && !hasUrdfFile && !hasStlFiles) {
            alert('请至少选择以下文件之一：\n- MPS CSV 文件（手部数据）\n- URDF/STL 文件（夹爪模型，用于测试显示）');
            return;
        }
        
        if (!hasMpsFile && hasConfigHint) {
            // Config is loaded but files not selected yet
            const proceed = confirm('检测到已加载的配置，但文件尚未选择。\n\n点击"确定"继续（将仅显示手部关键点，不显示夹爪模型），或点击"取消"先选择文件。');
            if (!proceed) {
                return;
            }
        }
        
        loadingIndicator.style.display = 'block';
        errorSection.style.display = 'none';
        loadBtn.disabled = true;

        try {
            const formData = new FormData();
            // MPS file is optional (for testing display without hand data)
            if (mpsFileInput && mpsFileInput.files && mpsFileInput.files.length > 0) {
                formData.append('mps_file', mpsFileInput.files[0]);
                console.log('MPS file:', mpsFileInput.files[0].name);
            } else {
                console.log('No MPS file provided - will only display gripper model for testing');
            }
            
            // Append URDF file if provided
            if (urdfFileInput && urdfFileInput.files.length > 0) {
                formData.append('urdf_file', urdfFileInput.files[0]);
                console.log('URDF file:', urdfFileInput.files[0].name);
            }
            
            // Append all STL files
            if (stlFilesInput && stlFilesInput.files.length > 0) {
                for (let i = 0; i < stlFilesInput.files.length; i++) {
                    formData.append('stl_files', stlFilesInput.files[i]);
                    console.log('STL file:', stlFilesInput.files[i].name);
                }
            }

            console.log('Sending request to /gripper_data...');
            const response = await fetch('/gripper_data', {
                method: 'POST',
                body: formData
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || '加载数据失败');
            }
            
            const data = await response.json();
            console.log('Response data:', data);

            // Store hand landmarks data (optional - for testing display without hand data)
            handLandmarksData = data.hand_landmarks || null;
            urdfData = data.urdf || null;
            
            console.log('Hand landmarks data:', handLandmarksData);
            console.log('Right hand frames:', handLandmarksData?.right_hand?.length || 0);
            
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

            // Start animation
            currentFrameIndex = 0;
            updateTimeline();
            
            // Adjust camera to first frame's landmarks (if available)
            if (handLandmarksData && handLandmarksData.right_hand && handLandmarksData.right_hand.length > 0) {
                const firstFrameLandmarks = handLandmarksData.right_hand[0];
                if (firstFrameLandmarks && firstFrameLandmarks.length === 21) {
                    adjustCameraToLandmarks(firstFrameLandmarks);
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

// Hand pose transform controls
const HAND_POSE_STORAGE_KEY = 'aria_hand_pose_transform';

function saveHandPoseTransform() {
    const data = {
        ...handPoseTransform,
        handGripperMapping: {
            enabled: handGripperMapping.enabled,
            closeDistCm: handGripperMapping.closeDistCm,
            openDistCm: handGripperMapping.openDistCm
        },
        savedAt: new Date().toISOString()
    };
    localStorage.setItem(HAND_POSE_STORAGE_KEY, JSON.stringify(data));
    console.log('Hand pose saved:', data);
    alert('手部姿态设置已保存');
}

function loadHandPoseTransform() {
    const saved = localStorage.getItem(HAND_POSE_STORAGE_KEY);
    if (!saved) {
        alert('没有找到已保存的设置');
        return false;
    }

    try {
        const data = JSON.parse(saved);

        // Load hand pose transform
        handPoseTransform.posX = data.posX ?? 0;
        handPoseTransform.posY = data.posY ?? 0;
        handPoseTransform.posZ = data.posZ ?? 0;
        handPoseTransform.rotX = data.rotX ?? 0;
        handPoseTransform.rotY = data.rotY ?? 0;
        handPoseTransform.rotZ = data.rotZ ?? 0;
        handPoseTransform.scale = data.scale ?? 1;

        // Load hand-gripper mapping if available
        if (data.handGripperMapping) {
            handGripperMapping.enabled = data.handGripperMapping.enabled ?? true;
            handGripperMapping.closeDistCm = data.handGripperMapping.closeDistCm ?? 2;
            handGripperMapping.openDistCm = data.handGripperMapping.openDistCm ?? 10;
        }

        // Update UI
        updateHandPoseUI();
        updateHandGripperMappingUI();

        const savedTime = data.savedAt ? new Date(data.savedAt).toLocaleString() : '未知';
        console.log('Hand pose loaded:', data);
        alert(`手部姿态设置已加载\n保存时间: ${savedTime}`);
        return true;
    } catch (e) {
        console.error('Failed to load hand pose:', e);
        alert('加载设置失败: ' + e.message);
        return false;
    }
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

    // Auto-load saved settings on page load (silently)
    const saved = localStorage.getItem(HAND_POSE_STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
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
            console.log('Auto-loaded saved hand pose settings');
        } catch (e) {
            console.warn('Failed to auto-load hand pose settings:', e);
        }
    }

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
        console.warn(`Link not found for joint ${jointName}: ${linkName}`);
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
    if (!handGripperMapping.enabled) return;
    if (!landmarks || landmarks.length !== 21) return;

    // Get thumb tip (index 0) and index tip (index 1) in MPS hand landmark format
    // Note: MPS uses different indices than MediaPipe
    // MPS: 0=thumb tip, 1=index tip, 2=middle tip, etc.
    const thumbTip = landmarks[0];
    const indexTip = landmarks[1];

    if (!thumbTip || !indexTip) return;

    // Calculate distance
    const distance = Math.sqrt(
        Math.pow(thumbTip[0] - indexTip[0], 2) +
        Math.pow(thumbTip[1] - indexTip[1], 2) +
        Math.pow(thumbTip[2] - indexTip[2], 2)
    );

    // Map to gripper angle
    const gripperAngle = mapFingerDistToGripperAngle(distance);

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
    
    const frameInterval = 100; // 100ms per frame = 10fps
    const timeStep = (frameInterval / 1000) * playbackSpeed;
    
    playInterval = setInterval(() => {
        if (handTimestamps.length > 0) {
            // Find next frame based on time
            const currentTime = handTimestamps[Math.floor(currentFrameIndex)] || 0;
            const nextTime = currentTime + timeStep;
            
            // Find frame index for next time
            let nextIndex = currentFrameIndex;
            for (let i = Math.floor(currentFrameIndex); i < handTimestamps.length; i++) {
                if (handTimestamps[i] >= nextTime) {
                    nextIndex = i;
                    break;
                }
            }
            
            if (nextIndex >= handTimestamps.length - 1) {
                nextIndex = 0; // Loop back
            }
            
            currentFrameIndex = nextIndex;
            updateTimeline();
        } else {
            // Fallback: simple frame increment
            currentFrameIndex = (currentFrameIndex + 1) % handLandmarksData.right_hand.length;
            updateTimeline();
        }
    }, frameInterval);
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
    updateTimeline();
}

// Timeline slider handler
const timelineSlider = document.getElementById('timeline-slider');
if (timelineSlider) {
    timelineSlider.addEventListener('input', function(e) {
        currentFrameIndex = parseFloat(e.target.value);
        updateTimeline();
        // Force render
        renderGripperScene();
        if (gripperRenderer) gripperRenderer.render(gripperScene, gripperCamera);
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
    console.log('DOM loaded, initializing gripper visualization...');

    // Initialize DOM elements
    mpsFileInput = document.getElementById('mps_file');
    urdfFileInput = document.getElementById('urdf_file');
    stlFilesInput = document.getElementById('stl_files');
    stlFolderInput = document.getElementById('stl_folder');
    mpsFileInfo = document.getElementById('mps-file-info');
    urdfFileInfo = document.getElementById('urdf-file-info');
    stlFileInfo = document.getElementById('stl-file-info');
    stlFileList = document.getElementById('stl-file-list');
    loadBtn = document.getElementById('loadBtn');
    loadingIndicator = document.getElementById('loadingIndicator');
    visualizationSection = document.getElementById('visualizationSection');
    errorSection = document.getElementById('errorSection');
    errorMessage = document.getElementById('errorMessage');

    // Check if all required elements exist
    if (!mpsFileInput) console.error('mpsFileInput not found');
    if (!urdfFileInput) console.error('urdfFileInput not found');
    if (!stlFilesInput) console.error('stlFilesInput not found');
    if (!stlFolderInput) console.error('stlFolderInput not found');
    if (!loadBtn) {
        console.error('loadBtn not found');
        return;
    }

    // Attach event listeners
    if (mpsFileInput) {
        mpsFileInput.addEventListener('change', handleMpsFileChange);
        console.log('MPS file input listener attached');
    }

    if (urdfFileInput) {
        urdfFileInput.addEventListener('change', handleUrdfFileChange);
        console.log('URDF file input listener attached');
    }

    if (stlFilesInput) {
        stlFilesInput.addEventListener('change', handleStlFilesChange);
        console.log('STL files input listener attached');
    }

    // Handle STL folder input (webkitdirectory)
    if (stlFolderInput) {
        stlFolderInput.addEventListener('change', function(e) {
            // Filter only .stl files from folder
            const allFiles = Array.from(e.target.files);
            const stlFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.stl'));

            if (stlFiles.length > 0) {
                // Copy STL files to stlFilesInput by creating a DataTransfer
                const dt = new DataTransfer();
                stlFiles.forEach(f => dt.items.add(f));
                stlFilesInput.files = dt.files;

                // Update UI
                if (stlFileInfo) {
                    stlFileInfo.textContent = `已选择 ${stlFiles.length} 个 STL 文件`;
                    stlFileInfo.style.color = '#28a745';
                }
                if (stlFileList) {
                    let fileListHtml = '';
                    stlFiles.forEach((f) => {
                        const shortName = f.name.length > 25 ? f.name.substring(0, 22) + '...' : f.name;
                        fileListHtml += `<div style="font-size: 0.8rem; padding: 2px 4px; background: #e9ecef; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.name}">${shortName}</div>`;
                    });
                    stlFileList.innerHTML = fileListHtml;
                }
                console.log(`✅ 从文件夹中加载了 ${stlFiles.length} 个 STL 文件`);
                saveFileInfo();
                checkFormValidity();
            }
        });
        console.log('STL folder input listener attached');
    }

    // Handle auto folder input - automatically detect CSV, URDF, STL files
    const autoFolderInput = document.getElementById('auto_folder');
    if (autoFolderInput) {
        autoFolderInput.addEventListener('change', function(e) {
            const allFiles = Array.from(e.target.files);
            console.log(`Auto folder: found ${allFiles.length} files total`);

            // Categorize files
            const csvFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.csv'));
            const urdfFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.urdf') || f.name.toLowerCase().endsWith('.xml'));
            const stlFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.stl'));

            console.log(`Auto folder: ${csvFiles.length} CSV, ${urdfFiles.length} URDF, ${stlFiles.length} STL`);

            // Set MPS CSV file (prefer files with 'mps' or 'hand' in name)
            if (csvFiles.length > 0 && mpsFileInput) {
                let mpsFile = csvFiles.find(f => f.name.toLowerCase().includes('mps') || f.name.toLowerCase().includes('hand'));
                if (!mpsFile) mpsFile = csvFiles[0];

                const dt = new DataTransfer();
                dt.items.add(mpsFile);
                mpsFileInput.files = dt.files;

                if (mpsFileInfo) {
                    mpsFileInfo.textContent = mpsFile.name;
                    mpsFileInfo.style.color = '#28a745';
                    mpsFileInfo.style.fontStyle = 'normal';
                }
                console.log(`✅ 自动选择 MPS 文件: ${mpsFile.name}`);
            }

            // Set URDF file (prefer files with 'urdf' in name)
            if (urdfFiles.length > 0 && urdfFileInput) {
                let urdfFile = urdfFiles.find(f => f.name.toLowerCase().endsWith('.urdf'));
                if (!urdfFile) urdfFile = urdfFiles[0];

                const dt = new DataTransfer();
                dt.items.add(urdfFile);
                urdfFileInput.files = dt.files;

                if (urdfFileInfo) {
                    urdfFileInfo.textContent = urdfFile.name;
                    urdfFileInfo.style.color = '#28a745';
                    urdfFileInfo.style.fontStyle = 'normal';
                }
                console.log(`✅ 自动选择 URDF 文件: ${urdfFile.name}`);
            }

            // Set STL files
            if (stlFiles.length > 0 && stlFilesInput) {
                const dt = new DataTransfer();
                stlFiles.forEach(f => dt.items.add(f));
                stlFilesInput.files = dt.files;

                if (stlFileInfo) {
                    stlFileInfo.textContent = `已选择 ${stlFiles.length} 个 STL 文件`;
                    stlFileInfo.style.color = '#28a745';
                    stlFileInfo.style.fontStyle = 'normal';
                }
                if (stlFileList) {
                    let fileListHtml = '';
                    stlFiles.forEach((f) => {
                        const shortName = f.name.length > 25 ? f.name.substring(0, 22) + '...' : f.name;
                        fileListHtml += `<div style="font-size: 0.8rem; padding: 2px 4px; background: #e9ecef; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.name}">${shortName}</div>`;
                    });
                    stlFileList.innerHTML = fileListHtml;
                }
                console.log(`✅ 自动选择 ${stlFiles.length} 个 STL 文件`);
            }

            saveFileInfo();
            checkFormValidity();

            // Show summary
            const summary = [];
            if (csvFiles.length > 0) summary.push(`${csvFiles.length} CSV`);
            if (urdfFiles.length > 0) summary.push(`${urdfFiles.length} URDF`);
            if (stlFiles.length > 0) summary.push(`${stlFiles.length} STL`);
            if (summary.length > 0) {
                console.log(`✅ 自动加载完成: ${summary.join(', ')}`);
            }
        });
        console.log('Auto folder input listener attached');
    }

    // Note: We don't initialize scenes on page load because visualizationSection is hidden
    // Scenes will be initialized when data is loaded and visualizationSection is shown
    console.log('Page loaded, waiting for data to initialize scenes...');

    // Load saved file information
    loadSavedFileInfo();

    // Force check form validity after a short delay to ensure all elements are ready
    setTimeout(() => {
        checkFormValidity();
        console.log('Initial form validity check completed');
        console.log('Button state:', {
            disabled: loadBtn.disabled,
            hasMps: mpsFileInput && mpsFileInput.files.length > 0,
            hasUrdf: urdfFileInput && urdfFileInput.files.length > 0,
            hasStl: stlFilesInput && stlFilesInput.files.length > 0
        });
    }, 100);

    // Initialize hand view mode toggle
    const handViewModeRadios = document.querySelectorAll('input[name="hand-view-mode"]');
    handViewModeRadios.forEach(radio => {
        radio.addEventListener('change', function(e) {
            const mode = e.target.value;
            setHandViewMode(mode);
            console.log('Hand view mode changed to:', mode);
        });
    });
    console.log('Hand view mode toggle initialized');

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

    const statusDiv = document.getElementById('ik-status');
    const statusText = document.getElementById('ik-status-text');
    const errorText = document.getElementById('ik-position-error');
    const jointAnglesDiv = document.getElementById('ik-joint-angles');
    const jointAnglesList = document.getElementById('joint-angles-list');

    // Show status
    if (statusDiv) statusDiv.style.display = 'block';
    if (statusText) statusText.textContent = '计算中...';
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
            position: [targetX, targetY, targetZ]
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
                statusText.textContent = '✓ 计算成功';
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

            console.log(`Applied ${jointName} -> ${linkName}: ${angle.toFixed(4)} rad (on top of initial transform)`);
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

    // 使用 PhongMaterial 肤色（需要光源）
    manoMesh.material = new THREE.MeshPhongMaterial({
        color: 0xffdbac,  // 肤色
        shininess: 30,
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
});
