/**
 * Hand Renderer - Renders hand landmarks and skeleton
 */

import { HAND_CONNECTIONS, FINGER_COLORS } from './constants.js';

export class HandRenderer {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * Map hand landmarks to gripper positions
     */
    mapHandToGripper(landmarks, mappingSettings) {
        if (!landmarks || landmarks.length !== 21) return null;

        const wrist = landmarks[5];
        const thumbTip = landmarks[0];
        const indexTip = landmarks[1];

        // Calculate gripper opening
        const opening = Math.sqrt(
            Math.pow(thumbTip[0] - indexTip[0], 2) +
            Math.pow(thumbTip[1] - indexTip[1], 2) +
            Math.pow(thumbTip[2] - indexTip[2], 2)
        );

        // Map landmarks relative to wrist
        const mappedLandmarks = landmarks.map(landmark => [
            (landmark[0] - wrist[0]) * mappingSettings.scale + mappingSettings.offsetX,
            (landmark[1] - wrist[1]) * mappingSettings.scale + mappingSettings.offsetY,
            (landmark[2] - wrist[2]) * mappingSettings.scale + mappingSettings.offsetZ
        ]);

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

    /**
     * Render hand landmarks
     */
    renderLandmarks(landmarks, showSkeleton = true) {
        // Clear previous landmarks
        const objectsToRemove = [];
        this.scene.children.forEach(child => {
            if (child.userData.isHandLandmark) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => this.scene.remove(obj));

        if (!landmarks || landmarks.length !== 21) {
            console.warn('Invalid landmarks:', landmarks ? landmarks.length : 'null');
            return;
        }

        console.log(`Rendering ${landmarks.length} landmarks`);

        // Create joint spheres
        landmarks.forEach((point, idx) => {
            if (!point || point.length < 3) {
                console.warn(`Invalid point at index ${idx}:`, point);
                return;
            }

            const geometry = new THREE.SphereGeometry(0.01, 16, 16);
            let color = 0xffffff;

            // Color fingertips
            if (idx === 0) color = FINGER_COLORS.thumb;
            else if (idx === 1) color = FINGER_COLORS.index;
            else if (idx === 2) color = FINGER_COLORS.middle;
            else if (idx === 3) color = FINGER_COLORS.ring;
            else if (idx === 4) color = FINGER_COLORS.pinky;
            else if (idx === 5) color = FINGER_COLORS.wrist;
            else if (idx === 20) color = FINGER_COLORS.palm;

            const material = new THREE.MeshPhongMaterial({ color });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.set(point[0], point[1], point[2]);
            sphere.userData.isHandLandmark = true;
            this.scene.add(sphere);
        });

        // Draw skeleton
        if (showSkeleton) {
            HAND_CONNECTIONS.forEach(([i, j]) => {
                const start = landmarks[i];
                const end = landmarks[j];

                const geometry = new THREE.BufferGeometry().setFromPoints([
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

                const material = new THREE.LineBasicMaterial({ color, linewidth: 2 });
                const line = new THREE.Line(geometry, material);
                line.userData.isHandLandmark = true;
                this.scene.add(line);
            });
        }
    }

    /**
     * Clear all hand landmarks
     */
    clear() {
        const objectsToRemove = [];
        this.scene.children.forEach(child => {
            if (child.userData.isHandLandmark) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => this.scene.remove(obj));
    }
}
