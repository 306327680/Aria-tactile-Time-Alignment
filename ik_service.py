#!/usr/bin/env python3
"""
IK Service for SO-101 Robot Arm

Provides inverse kinematics calculation using ikpy library.
The service loads a URDF file and computes joint angles for target end-effector poses.

Usage:
    python ik_service.py [--urdf PATH] [--port PORT]

API Endpoints:
    POST /ik - Compute inverse kinematics
        Input: {"position": [x, y, z]} or {"position": [x, y, z], "orientation": [roll, pitch, yaw]}
        Output: {"joint_angles": [...], "joint_names": [...], "success": true}

    GET /fk - Compute forward kinematics
        Input: {"joint_angles": [...]}
        Output: {"position": [x, y, z], "orientation_matrix": [[...]], "success": true}

    GET /info - Get robot info
        Output: {"joint_names": [...], "joint_limits": {...}, "chain_length": N}
"""

import os
import sys
import json
import argparse
import numpy as np
from pathlib import Path

# Check for ikpy
try:
    import ikpy
    from ikpy.chain import Chain
    from ikpy.link import URDFLink
except ImportError:
    print("Error: ikpy not installed. Install with: pip install ikpy")
    print("Note: You may also need: pip install numpy scipy")
    sys.exit(1)

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

# Global chain object
robot_chain = None
joint_names = []
active_joint_indices = []  # Indices of active (non-fixed) joints in the chain


def load_urdf_chain(urdf_path: str, base_link: str = "base_link", end_link: str = "gripper_frame_link"):
    """
    Load URDF and create ikpy chain.

    Args:
        urdf_path: Path to URDF file
        base_link: Name of the base link (fixed to world)
        end_link: Name of the end effector link

    Returns:
        Chain object for IK calculations
    """
    global robot_chain, joint_names, active_joint_indices

    if not os.path.exists(urdf_path):
        raise FileNotFoundError(f"URDF file not found: {urdf_path}")

    # First, create chain to determine link types
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        temp_chain = Chain.from_urdf_file(
            urdf_path,
            base_elements=[base_link],
            name="so101_temp"
        )

    # Build active_links_mask: True only for non-fixed joints
    active_links_mask = []
    for link in temp_chain.links:
        is_active = hasattr(link, 'joint_type') and link.joint_type != 'fixed'
        active_links_mask.append(is_active)

    # Create final chain with correct active_links_mask
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        robot_chain = Chain.from_urdf_file(
            urdf_path,
            base_elements=[base_link],
            active_links_mask=active_links_mask,
            name="so101"
        )

    # Extract joint names and identify active joints
    joint_names = []
    active_joint_indices = []

    for i, link in enumerate(robot_chain.links):
        if hasattr(link, 'name') and link.name:
            # In ikpy, link.name is the joint name for non-fixed links
            if hasattr(link, 'joint_type') and link.joint_type != 'fixed':
                joint_names.append(link.name)
                active_joint_indices.append(i)

    print(f"Loaded URDF chain with {len(robot_chain.links)} links")
    print(f"Active joints ({len(joint_names)}): {joint_names}")
    print(f"Active joint indices: {active_joint_indices}")

    return robot_chain


def get_joint_limits():
    """Get joint limits from the chain."""
    limits = {}
    for i, link in enumerate(robot_chain.links):
        if hasattr(link, 'bounds') and link.bounds is not None:
            name = link.name if hasattr(link, 'name') else f"joint_{i}"
            limits[name] = {
                'lower': float(link.bounds[0]) if link.bounds[0] is not None else -np.pi,
                'upper': float(link.bounds[1]) if link.bounds[1] is not None else np.pi
            }
    return limits


@app.route('/ik', methods=['POST', 'OPTIONS'])
def compute_ik():
    """
    Compute inverse kinematics for target position (and optionally orientation).

    Request JSON:
        {
            "position": [x, y, z],           # Required: target position in meters
            "orientation": [roll, pitch, yaw], # Optional: target orientation in radians (Euler angles)
            "initial_angles": [...]           # Optional: initial guess for joint angles
        }

    Response JSON:
        {
            "success": true/false,
            "joint_angles": [...],    # Angles for active joints only (in radians)
            "joint_names": [...],     # Names of active joints
            "full_angles": [...],     # All angles including fixed joints
            "end_position": [x, y, z], # Achieved end effector position
            "error": "..."            # Error message if success=false
        }
    """
    if request.method == 'OPTIONS':
        return '', 204

    if robot_chain is None:
        return jsonify({
            'success': False,
            'error': 'Robot chain not loaded. Please load URDF first.'
        }), 500

    try:
        data = request.get_json()

        if not data or 'position' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: position'
            }), 400

        # Parse target position
        target_position = np.array(data['position'], dtype=float)
        if len(target_position) != 3:
            return jsonify({
                'success': False,
                'error': 'Position must be [x, y, z]'
            }), 400

        # Parse optional orientation (as rotation matrix or Euler angles)
        target_orientation = None
        if 'orientation' in data:
            orient = data['orientation']
            if len(orient) == 3:
                # Euler angles (roll, pitch, yaw) -> rotation matrix
                from scipy.spatial.transform import Rotation
                target_orientation = Rotation.from_euler('xyz', orient).as_matrix()
            elif len(orient) == 9:
                # Flattened 3x3 rotation matrix
                target_orientation = np.array(orient).reshape(3, 3)

        # Parse initial angles (optional)
        initial_angles = None
        if 'initial_angles' in data:
            # Expand to full chain length (including fixed joints)
            active_angles = np.array(data['initial_angles'], dtype=float)
            initial_angles = np.zeros(len(robot_chain.links))
            for idx, angle in zip(active_joint_indices, active_angles):
                initial_angles[idx] = angle

        # Compute IK
        if target_orientation is not None:
            # Full pose IK (position + orientation)
            # Build 4x4 transformation matrix
            target_frame = np.eye(4)
            target_frame[:3, :3] = target_orientation
            target_frame[:3, 3] = target_position

            result_angles = robot_chain.inverse_kinematics(
                target_frame,
                initial_position=initial_angles,
                orientation_mode="all"
            )
        else:
            # Position-only IK
            result_angles = robot_chain.inverse_kinematics(
                target_position,
                initial_position=initial_angles,
                orientation_mode=None
            )

        # Compute achieved end position for verification
        fk_result = robot_chain.forward_kinematics(result_angles)
        achieved_position = fk_result[:3, 3].tolist()

        # Extract only active joint angles
        active_angles = [float(result_angles[i]) for i in active_joint_indices]

        # Calculate position error
        position_error = np.linalg.norm(target_position - np.array(achieved_position))

        return jsonify({
            'success': True,
            'joint_angles': active_angles,
            'joint_names': joint_names,
            'full_angles': result_angles.tolist(),
            'end_position': achieved_position,
            'position_error': float(position_error)
        })

    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/fk', methods=['POST', 'OPTIONS'])
def compute_fk():
    """
    Compute forward kinematics from joint angles.

    Request JSON:
        {
            "joint_angles": [...]  # Angles for active joints (in radians)
        }

    Response JSON:
        {
            "success": true/false,
            "position": [x, y, z],
            "orientation_matrix": [[...]],  # 3x3 rotation matrix
            "transform_matrix": [[...]]     # 4x4 transformation matrix
        }
    """
    if request.method == 'OPTIONS':
        return '', 204

    if robot_chain is None:
        return jsonify({
            'success': False,
            'error': 'Robot chain not loaded'
        }), 500

    try:
        data = request.get_json()

        if not data or 'joint_angles' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: joint_angles'
            }), 400

        # Expand active angles to full chain
        active_angles = np.array(data['joint_angles'], dtype=float)
        full_angles = np.zeros(len(robot_chain.links))

        for idx, angle in zip(active_joint_indices, active_angles):
            full_angles[idx] = angle

        # Compute FK
        fk_result = robot_chain.forward_kinematics(full_angles)

        return jsonify({
            'success': True,
            'position': fk_result[:3, 3].tolist(),
            'orientation_matrix': fk_result[:3, :3].tolist(),
            'transform_matrix': fk_result.tolist()
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/info', methods=['GET'])
def get_info():
    """
    Get robot chain information.

    Response JSON:
        {
            "joint_names": [...],
            "joint_limits": {...},
            "chain_length": N,
            "links": [...]
        }
    """
    if robot_chain is None:
        return jsonify({
            'success': False,
            'error': 'Robot chain not loaded'
        }), 500

    # Get link info
    links_info = []
    for link in robot_chain.links:
        link_info = {
            'name': link.name if hasattr(link, 'name') else 'unknown',
            'joint_type': getattr(link, 'joint_type', 'unknown'),
        }
        if hasattr(link, 'bounds') and link.bounds is not None:
            link_info['bounds'] = [
                float(link.bounds[0]) if link.bounds[0] is not None else None,
                float(link.bounds[1]) if link.bounds[1] is not None else None
            ]
        links_info.append(link_info)

    return jsonify({
        'success': True,
        'joint_names': joint_names,
        'active_joint_indices': active_joint_indices,
        'joint_limits': get_joint_limits(),
        'chain_length': len(robot_chain.links),
        'num_active_joints': len(joint_names),
        'links': links_info
    })


@app.route('/load_urdf', methods=['POST'])
def load_urdf():
    """
    Load a URDF file dynamically.

    Request JSON:
        {
            "urdf_path": "/path/to/robot.urdf",
            "base_link": "base_link",       # Optional
            "end_link": "end_effector"      # Optional
        }
    """
    try:
        data = request.get_json()

        if not data or 'urdf_path' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing urdf_path'
            }), 400

        urdf_path = data['urdf_path']
        base_link = data.get('base_link', 'base_link')
        end_link = data.get('end_link', 'gripper_frame_link')

        load_urdf_chain(urdf_path, base_link, end_link)

        return jsonify({
            'success': True,
            'message': f'Loaded URDF with {len(joint_names)} active joints',
            'joint_names': joint_names
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'chain_loaded': robot_chain is not None,
        'num_joints': len(joint_names) if joint_names else 0
    })


def main():
    parser = argparse.ArgumentParser(description='IK Service for SO-101 Robot Arm')
    parser.add_argument('--urdf', type=str,
                        default='/Users/zhuyilong/Documents/SO-ARM100/SO101_URDF_Assets/so101_new_calib.urdf',
                        help='Path to URDF file')
    parser.add_argument('--port', type=int, default=5001,
                        help='Port to run the service on')
    parser.add_argument('--host', type=str, default='0.0.0.0',
                        help='Host to bind to')
    parser.add_argument('--base-link', type=str, default='base_link',
                        help='Base link name in URDF')
    parser.add_argument('--end-link', type=str, default='gripper_frame_link',
                        help='End effector link name in URDF')
    parser.add_argument('--debug', action='store_true',
                        help='Run in debug mode')

    args = parser.parse_args()

    # Load URDF
    print(f"Loading URDF from: {args.urdf}")
    try:
        load_urdf_chain(args.urdf, args.base_link, args.end_link)
        print("URDF loaded successfully!")
    except Exception as e:
        print(f"Warning: Could not load URDF: {e}")
        print("Service will start but /ik endpoint won't work until URDF is loaded via /load_urdf")

    # Start server
    print(f"\nStarting IK service on http://{args.host}:{args.port}")
    print("Endpoints:")
    print("  POST /ik        - Compute inverse kinematics")
    print("  POST /fk        - Compute forward kinematics")
    print("  GET  /info      - Get robot info")
    print("  POST /load_urdf - Load URDF file")
    print("  GET  /health    - Health check")

    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == '__main__':
    main()
