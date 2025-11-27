/**
 * Model Loader - Handles loading STL models and URDF files
 */

export class ModelLoader {
    constructor() {
        this.models = [];
        this.linkMap = {};
        this.urdfData = null;
    }

    /**
     * Load a single STL model
     */
    async loadSTLModel(url, filename = '') {
        return new Promise((resolve, reject) => {
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

                        // Center and normalize geometry
                        geometry.computeBoundingBox();
                        const box = geometry.boundingBox;
                        const size = new THREE.Vector3();
                        box.getSize(size);
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const scale = 0.1 / maxDim;
                        geometry.scale(scale, scale, scale);

                        // Center geometry
                        const center = new THREE.Vector3();
                        box.getCenter(center);
                        geometry.translate(-center.x * scale, -center.y * scale, -center.z * scale);

                        // Create material with colors based on part type
                        let color = 0x667eea; // Default blue
                        if (filename.toLowerCase().includes('base') || filename.toLowerCase().includes('底座')) {
                            color = 0x6c757d; // Gray
                        } else if (filename.toLowerCase().includes('left') || filename.toLowerCase().includes('左')) {
                            color = 0xff6b6b; // Red
                        } else if (filename.toLowerCase().includes('right') || filename.toLowerCase().includes('右')) {
                            color = 0x51cf66; // Green
                        }

                        const material = new THREE.MeshPhongMaterial({
                            color: color,
                            specular: 0x111111,
                            shininess: 200,
                            transparent: true,
                            opacity: 0.8
                        });

                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.rotation.x = -Math.PI / 2; // Rotate to correct orientation
                        mesh.userData.filename = filename;
                        resolve(mesh);
                    } catch (e) {
                        reject(e);
                    }
                })
                .catch(reject);
        });
    }

    /**
     * Convert RPY (roll, pitch, yaw) to quaternion
     */
    rpyToQuaternion(rpy) {
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

    /**
     * Get basename from path
     */
    getBasename(path) {
        return path.split('/').pop().split('\\').pop();
    }

    /**
     * Load gripper from URDF
     */
    async loadFromURDF(urdfData, stlFileMap, scene) {
        this.urdfData = urdfData;
        this.models = [];
        this.linkMap = {};

        // Remove old models from scene
        const objectsToRemove = [];
        scene.children.forEach(child => {
            if (child.userData.isGripper) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => scene.remove(obj));

        // Create link map
        const linkMap = {};
        urdfData.links.forEach(link => {
            linkMap[link.name] = link;
        });

        // Create child-to-parent joint map
        const childToParent = {};
        urdfData.joints.forEach(joint => {
            if (joint.child && joint.parent) {
                childToParent[joint.child] = {
                    parent: joint.parent,
                    origin: joint.origin
                };
            }
        });

        // Load all mesh files
        const linkObjects = {};

        for (const link of urdfData.links) {
            for (const visual of link.visuals) {
                if (visual.mesh) {
                    const meshBasename = this.getBasename(visual.mesh);
                    // Try exact match first, then lowercase match
                    let stlUrl = stlFileMap[meshBasename];
                    if (!stlUrl) {
                        stlUrl = stlFileMap[meshBasename.toLowerCase()];
                    }

                    if (!stlUrl) {
                        console.warn(`STL file not found: ${meshBasename}`);
                        continue;
                    }

                    try {
                        const mesh = await this.loadSTLModel(stlUrl, meshBasename);

                        // Apply visual origin transform
                        const origin = visual.origin || { xyz: [0, 0, 0], rpy: [0, 0, 0] };
                        mesh.position.set(origin.xyz[0], origin.xyz[1], origin.xyz[2]);

                        const quat = this.rpyToQuaternion(origin.rpy);
                        mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w);

                        mesh.userData.isGripper = true;
                        mesh.userData.linkName = link.name;

                        if (!linkObjects[link.name]) {
                            linkObjects[link.name] = new THREE.Group();
                            linkObjects[link.name].name = link.name;
                            linkObjects[link.name].userData.isGripper = true;
                        }

                        linkObjects[link.name].add(mesh);
                        this.models.push(mesh);
                    } catch (error) {
                        console.error(`Failed to load mesh ${meshBasename}:`, error);
                    }
                }
            }
        }

        // Build hierarchy based on joints
        for (const linkName in linkObjects) {
            const linkObj = linkObjects[linkName];
            const jointInfo = childToParent[linkName];

            if (jointInfo) {
                // Apply joint transform
                const origin = jointInfo.origin || { xyz: [0, 0, 0], rpy: [0, 0, 0] };
                linkObj.position.set(origin.xyz[0], origin.xyz[1], origin.xyz[2]);

                const quat = this.rpyToQuaternion(origin.rpy);
                linkObj.quaternion.set(quat.x, quat.y, quat.z, quat.w);

                // Add to parent
                const parentObj = linkObjects[jointInfo.parent];
                if (parentObj) {
                    parentObj.add(linkObj);
                } else {
                    scene.add(linkObj);
                }
            } else {
                // Root link
                scene.add(linkObj);
            }

            this.linkMap[linkName] = linkObj;
        }

        console.log(`Loaded ${Object.keys(linkObjects).length} links from URDF`);
        return this.linkMap;
    }

    /**
     * Load multiple STL models (manual mode)
     */
    async loadSTLModels(urls, filenames, scene) {
        this.models = [];
        this.linkMap = {};

        // Remove old models
        const objectsToRemove = [];
        scene.children.forEach(child => {
            if (child.userData.isGripper) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => scene.remove(obj));

        // Load all STL files
        const loadPromises = urls.map((url, index) =>
            this.loadSTLModel(url, filenames[index] || `part_${index}`)
        );

        try {
            const models = await Promise.all(loadPromises);
            models.forEach(mesh => {
                mesh.userData.isGripper = true;
                scene.add(mesh);
                this.models.push(mesh);
            });
            console.log(`Loaded ${models.length} STL models (manual mode)`);
            return this.models;
        } catch (error) {
            console.error('Error loading STL models:', error);
            throw error;
        }
    }

    /**
     * Position models at specified location
     */
    positionModels(position) {
        if (Object.keys(this.linkMap).length > 0) {
            // URDF mode: position root links
            Object.values(this.linkMap).forEach(linkObj => {
                if (linkObj.parent === null || !linkObj.parent.userData.isGripper) {
                    linkObj.position.copy(position);
                }
            });
        } else if (this.models.length > 0) {
            // Manual mode: position all models
            this.models.forEach(model => {
                model.position.copy(position);
            });
        }
    }

    /**
     * Set visibility of all models
     */
    setVisibility(visible) {
        Object.values(this.linkMap).forEach(linkObj => {
            linkObj.visible = visible;
        });
        this.models.forEach(model => {
            model.visible = visible;
        });
    }

    /**
     * Get models and link map
     */
    getModels() { return this.models; }
    getLinkMap() { return this.linkMap; }
    getURDFData() { return this.urdfData; }
}

// STLLoader implementation
class STLLoader {
    constructor(manager) {
        this.manager = manager !== undefined ? manager : THREE.DefaultLoadingManager;
        this.path = '';
    }

    parse(data) {
        const reader = new DataView(data);
        const faces = reader.getUint32(80, true);
        let r, g, b, hasColors = false;
        let defaultR = 1, defaultG = 1, defaultB = 1;

        // Check for color header
        for (let index = 0; index < 80 - 16; index += 4) {
            const end = index + 4;
            if (reader.getUint32(index, false) == 0x434F4C4F && reader.getUint32(end, false) == 0x52000000) {
                hasColors = true;
                defaultR = reader.getUint8(index + 4) / 255;
                defaultG = reader.getUint8(index + 5) / 255;
                defaultB = reader.getUint8(index + 6) / 255;
            }
        }

        const dataOffset = 84;
        const faceLength = 12 * 4 + 2;
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const normals = [];
        const colors = [];

        for (let face = 0; face < faces; face++) {
            const start = dataOffset + face * faceLength;
            const normalX = reader.getFloat32(start, true);
            const normalY = reader.getFloat32(start + 4, true);
            const normalZ = reader.getFloat32(start + 8, true);

            if (hasColors) {
                const packedColor = reader.getUint16(start + 48, true);
                if ((packedColor & 0x8000) === 0) {
                    r = (packedColor & 0x1F) / 31;
                    g = ((packedColor >> 5) & 0x1F) / 31;
                    b = ((packedColor >> 10) & 0x1F) / 31;
                } else {
                    r = defaultR;
                    g = defaultG;
                    b = defaultB;
                }
            }

            for (let i = 1; i <= 3; i++) {
                const vertexstart = start + i * 12;
                vertices.push(reader.getFloat32(vertexstart, true));
                vertices.push(reader.getFloat32(vertexstart + 4, true));
                vertices.push(reader.getFloat32(vertexstart + 8, true));
                normals.push(normalX, normalY, normalZ);
                if (hasColors) {
                    colors.push(r, g, b);
                }
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        if (hasColors) {
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        }

        return geometry;
    }
}
