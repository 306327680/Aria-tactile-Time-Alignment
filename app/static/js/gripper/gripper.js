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

// Mapping settings
let mappingSettings = {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    showSkeleton: true,
    showGripper: true
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

// Map hand landmarks to gripper positions
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

    // Map all landmarks relative to wrist position
    const mappedLandmarks = landmarks.map((landmark, idx) => {
        // Relative position to wrist
        const relativePos = [
            (landmark[0] - wrist[0]) * mappingSettings.scale + mappingSettings.offsetX,
            (landmark[1] - wrist[1]) * mappingSettings.scale + mappingSettings.offsetY,
            (landmark[2] - wrist[2]) * mappingSettings.scale + mappingSettings.offsetZ
        ];
        return relativePos;
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

    // Render mapped hand landmarks
    renderHandLandmarks(gripperScene, mapped.landmarks, true);
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
        
        // Show hint if there's saved info
        if (hasSavedInfo) {
            showSavedFilesHint();
        }
        
    } catch (e) {
        console.error('Error loading saved file info:', e);
    }
}

// Show hint about saved files
function showSavedFilesHint() {
    const uploadSection = document.querySelector('.upload-section');
    if (!uploadSection) return;
    
    // Check if hint already exists
    if (document.getElementById('saved-files-hint')) return;
    
    const hint = document.createElement('div');
    hint.id = 'saved-files-hint';
    hint.style.cssText = 'padding: 12px 16px; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; margin-bottom: 15px; font-size: 0.9rem;';
    hint.innerHTML = `
        <div style="font-weight: 600; color: #1976d2; margin-bottom: 5px;">
            💡 检测到上次使用的文件
        </div>
        <div style="color: #1565c0;">
            已自动恢复文件信息和设置。请重新选择文件（浏览器安全限制，无法自动填充文件输入框）。
        </div>
    `;
    
    uploadSection.insertBefore(hint, uploadSection.firstChild.nextSibling);
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
document.getElementById('scale-slider').addEventListener('input', function(e) {
    document.getElementById('scale-value').textContent = parseFloat(e.target.value).toFixed(1);
    mappingSettings.scale = parseFloat(e.target.value);
    saveFileInfo(); // Save settings
});

document.getElementById('offset-x').addEventListener('change', function(e) {
    mappingSettings.offsetX = parseFloat(e.target.value) || 0;
    saveFileInfo(); // Save settings
});

document.getElementById('offset-y').addEventListener('change', function(e) {
    mappingSettings.offsetY = parseFloat(e.target.value) || 0;
    saveFileInfo(); // Save settings
});

document.getElementById('offset-z').addEventListener('change', function(e) {
    mappingSettings.offsetZ = parseFloat(e.target.value) || 0;
    saveFileInfo(); // Save settings
});

document.getElementById('show-skeleton').addEventListener('change', function(e) {
    mappingSettings.showSkeleton = e.target.checked;
    saveFileInfo(); // Save settings
});

document.getElementById('show-gripper').addEventListener('change', function(e) {
    mappingSettings.showGripper = e.target.checked;
    gripperModels.forEach(model => {
        model.visible = e.target.checked;
    });
    // Also update URDF-loaded models
    Object.values(gripperLinkMap).forEach(linkObj => {
        linkObj.visible = e.target.checked;
    });
    saveFileInfo(); // Save settings
});

document.getElementById('apply-settings').addEventListener('click', function() {
    // Settings are already applied in real-time
    console.log('Settings applied:', mappingSettings);
});

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

// Config file handlers
const configFileInput = document.getElementById('config_file');
const downloadConfigBtn = document.getElementById('download-config-btn');
const loadSavedConfigBtn = document.getElementById('load-saved-config-btn');

if (configFileInput) {
    configFileInput.addEventListener('change', async function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            showConfigStatus('正在加载配置文件...', 'info');
            
            try {
                const config = await loadConfigFromFile(file);
                applyConfig(config);
                showConfigStatus('配置文件加载成功！', 'success');
            } catch (error) {
                showConfigStatus('加载配置文件失败: ' + error.message, 'error');
            }
        }
    });
}

if (downloadConfigBtn) {
    downloadConfigBtn.addEventListener('click', function() {
        exportConfig();
    });
}

if (loadSavedConfigBtn) {
    loadSavedConfigBtn.addEventListener('click', function() {
        if (loadSavedConfig()) {
            showConfigStatus('已加载保存的配置', 'success');
        } else {
            showConfigStatus('没有找到保存的配置', 'info');
        }
    });
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

