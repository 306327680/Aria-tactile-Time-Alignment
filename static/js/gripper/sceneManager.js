/**
 * Scene Manager - Handles Three.js scene, camera, renderer setup
 */

import { SCENE_CONFIG, CAMERA_CONFIG } from './constants.js';

export class SceneManager {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.animationId = null;
    }

    /**
     * Initialize the Three.js scene
     */
    init() {
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) {
            console.error(`Canvas #${this.canvasId} not found`);
            return false;
        }

        // Get canvas dimensions
        let width = canvas.clientWidth;
        let height = canvas.clientHeight;
        if (width === 0 || height === 0) {
            width = 800;
            height = 600;
            console.warn('Canvas hidden, using default dimensions:', width, height);
        }

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);

        // Create camera
        const aspect = width / height || 1;
        this.camera = new THREE.PerspectiveCamera(
            CAMERA_CONFIG.fov,
            aspect,
            CAMERA_CONFIG.near,
            CAMERA_CONFIG.far
        );
        this.camera.position.set(
            CAMERA_CONFIG.defaultPosition.x,
            CAMERA_CONFIG.defaultPosition.y,
            CAMERA_CONFIG.defaultPosition.z
        );
        this.camera.lookAt(
            CAMERA_CONFIG.defaultTarget.x,
            CAMERA_CONFIG.defaultTarget.y,
            CAMERA_CONFIG.defaultTarget.z
        );

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Add lights
        this.addLights();

        // Add grid and axes helpers
        this.addHelpers();

        // Add orbit controls
        this.controls = new THREE.OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(
            CAMERA_CONFIG.defaultTarget.x,
            CAMERA_CONFIG.defaultTarget.y,
            CAMERA_CONFIG.defaultTarget.z
        );
        this.controls.update();

        console.log('Scene initialized:', { width, height, camera: this.camera.position });

        // Force initial render
        this.render();

        return true;
    }

    /**
     * Add lighting to the scene
     */
    addLights() {
        const ambientLight = new THREE.AmbientLight(
            0xffffff,
            SCENE_CONFIG.ambientLightIntensity
        );
        const directionalLight = new THREE.DirectionalLight(
            0xffffff,
            SCENE_CONFIG.directionalLightIntensity
        );
        directionalLight.position.set(1, 1, 1);

        this.scene.add(ambientLight);
        this.scene.add(directionalLight);
    }

    /**
     * Add grid and axes helpers
     */
    addHelpers() {
        const gridHelper = new THREE.GridHelper(
            SCENE_CONFIG.gridSize,
            SCENE_CONFIG.gridDivisions,
            0x888888,
            0x555555
        );
        const axesHelper = new THREE.AxesHelper(SCENE_CONFIG.axesSize);

        this.scene.add(gridHelper);
        this.scene.add(axesHelper);
    }

    /**
     * Adjust camera to view landmarks
     */
    adjustCameraToLandmarks(landmarks) {
        if (!landmarks || landmarks.length === 0) {
            console.warn('No landmarks, using default camera position');
            this.resetCamera();
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
            console.warn('No valid points, using default camera position');
            this.resetCamera();
            return;
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        const sizeX = maxX - minX;
        const sizeY = maxY - minY;
        const sizeZ = maxZ - minZ;
        const maxSize = Math.max(sizeX, sizeY, sizeZ, 0.1);

        const distance = maxSize * 2.5;

        this.camera.position.set(
            centerX + distance * 0.7,
            centerY + distance * 0.7,
            centerZ + distance * 0.5
        );
        this.camera.lookAt(centerX, centerY, centerZ);
        this.camera.updateProjectionMatrix();

        if (this.controls) {
            this.controls.target.set(centerX, centerY, centerZ);
            this.controls.update();
        }

        console.log('Camera adjusted to landmarks:', {
            center: [centerX, centerY, centerZ],
            size: [sizeX, sizeY, sizeZ],
            distance
        });
    }

    /**
     * Reset camera to default position
     */
    resetCamera() {
        this.camera.position.set(
            CAMERA_CONFIG.defaultPosition.x,
            CAMERA_CONFIG.defaultPosition.y,
            CAMERA_CONFIG.defaultPosition.z
        );
        this.camera.lookAt(
            CAMERA_CONFIG.defaultTarget.x,
            CAMERA_CONFIG.defaultTarget.y,
            CAMERA_CONFIG.defaultTarget.z
        );
        this.camera.updateProjectionMatrix();

        if (this.controls) {
            this.controls.target.set(
                CAMERA_CONFIG.defaultTarget.x,
                CAMERA_CONFIG.defaultTarget.y,
                CAMERA_CONFIG.defaultTarget.z
            );
            this.controls.update();
        }
    }

    /**
     * Render the scene
     */
    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Start animation loop
     */
    startAnimation(callback) {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            if (this.controls) {
                this.controls.update();
            }

            if (callback) {
                callback();
            }

            this.render();
        };

        animate();
    }

    /**
     * Stop animation loop
     */
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Handle window resize
     */
    onResize() {
        const canvas = document.getElementById(this.canvasId);
        if (canvas && this.camera && this.renderer) {
            this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        }
    }

    /**
     * Clear objects with specific userData flag
     */
    clearObjects(userDataKey) {
        const objectsToRemove = [];
        this.scene.children.forEach(child => {
            if (child.userData[userDataKey]) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => this.scene.remove(obj));
    }

    /**
     * Get scene, camera, renderer
     */
    getScene() { return this.scene; }
    getCamera() { return this.camera; }
    getRenderer() { return this.renderer; }
    getControls() { return this.controls; }
}
