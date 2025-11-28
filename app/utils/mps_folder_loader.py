"""
MPS Folder loader utility - loads SLAM trajectory and hand tracking data
and transforms hand positions to world coordinates
"""

import os
import numpy as np
import pandas as pd
from scipy.spatial.transform import Rotation


def load_slam_trajectory(slam_csv_path):
    """
    Load SLAM trajectory from closed_loop_trajectory.csv

    Returns:
        dict with timestamps and device poses (position + quaternion)
    """
    df = pd.read_csv(slam_csv_path)

    result = {
        'timestamps_us': df['tracking_timestamp_us'].values,
        'positions': np.column_stack([
            df['tx_world_device'].values,
            df['ty_world_device'].values,
            df['tz_world_device'].values
        ]),
        'quaternions': np.column_stack([
            df['qx_world_device'].values,
            df['qy_world_device'].values,
            df['qz_world_device'].values,
            df['qw_world_device'].values
        ])
    }

    print(f"Loaded SLAM trajectory: {len(result['timestamps_us'])} poses")
    return result


def load_hand_tracking_device(hand_csv_path):
    """
    Load hand tracking data in device coordinates from hand_tracking_results.csv

    Returns:
        dict with timestamps and hand landmarks in device coordinates
    """
    df = pd.read_csv(hand_csv_path)

    timestamps_us = df['tracking_timestamp_us'].values

    # Extract right hand landmarks (21 points)
    right_hand_frames = []
    right_confidence = df['right_tracking_confidence'].values

    for idx in range(len(df)):
        if right_confidence[idx] > 0:
            landmarks = []
            for i in range(21):
                x = df[f'tx_right_landmark_{i}_device'].iloc[idx]
                y = df[f'ty_right_landmark_{i}_device'].iloc[idx]
                z = df[f'tz_right_landmark_{i}_device'].iloc[idx]
                landmarks.append([x, y, z])
            right_hand_frames.append(landmarks)
        else:
            right_hand_frames.append(None)

    # Extract left hand landmarks (21 points)
    left_hand_frames = []
    left_confidence = df['left_tracking_confidence'].values

    for idx in range(len(df)):
        if left_confidence[idx] > 0:
            landmarks = []
            for i in range(21):
                x = df[f'tx_left_landmark_{i}_device'].iloc[idx]
                y = df[f'ty_left_landmark_{i}_device'].iloc[idx]
                z = df[f'tz_left_landmark_{i}_device'].iloc[idx]
                landmarks.append([x, y, z])
            left_hand_frames.append(landmarks)
        else:
            left_hand_frames.append(None)

    result = {
        'timestamps_us': timestamps_us,
        'right_hand_device': right_hand_frames,
        'left_hand_device': left_hand_frames,
        'right_confidence': right_confidence,
        'left_confidence': left_confidence
    }

    valid_right = sum(1 for f in right_hand_frames if f is not None)
    valid_left = sum(1 for f in left_hand_frames if f is not None)
    print(f"Loaded hand tracking: {len(timestamps_us)} frames, right={valid_right}, left={valid_left}")

    return result


def transform_to_world(hand_data, slam_data):
    """
    Transform hand landmarks from device coordinates to world coordinates
    using SLAM trajectory data.

    Args:
        hand_data: dict from load_hand_tracking_device()
        slam_data: dict from load_slam_trajectory()

    Returns:
        dict with hand landmarks in world coordinates
    """
    hand_timestamps = hand_data['timestamps_us']
    slam_timestamps = slam_data['timestamps_us']
    slam_positions = slam_data['positions']
    slam_quaternions = slam_data['quaternions']

    # Build interpolation for SLAM poses
    # For each hand timestamp, find nearest SLAM pose
    right_hand_world = []
    left_hand_world = []

    for i, hand_ts in enumerate(hand_timestamps):
        # Find nearest SLAM timestamp
        idx = np.argmin(np.abs(slam_timestamps - hand_ts))

        # Get device pose in world
        device_pos = slam_positions[idx]
        device_quat = slam_quaternions[idx]  # [qx, qy, qz, qw]

        # Create rotation matrix from quaternion
        rot = Rotation.from_quat(device_quat)  # scipy uses [x,y,z,w] format
        rot_matrix = rot.as_matrix()

        # Transform right hand
        if hand_data['right_hand_device'][i] is not None:
            landmarks_device = np.array(hand_data['right_hand_device'][i])
            # Transform: world_pos = device_pos + rot_matrix @ landmark_device
            landmarks_world = device_pos + (rot_matrix @ landmarks_device.T).T
            right_hand_world.append(landmarks_world.tolist())
        else:
            right_hand_world.append(None)

        # Transform left hand
        if hand_data['left_hand_device'][i] is not None:
            landmarks_device = np.array(hand_data['left_hand_device'][i])
            landmarks_world = device_pos + (rot_matrix @ landmarks_device.T).T
            left_hand_world.append(landmarks_world.tolist())
        else:
            left_hand_world.append(None)

    result = {
        'timestamps_us': hand_timestamps.tolist(),
        'timestamps': (hand_timestamps / 1e6).tolist(),  # Convert to seconds
        'right_hand': right_hand_world,
        'left_hand': left_hand_world,
        'slam_trajectory': {
            'positions': slam_positions.tolist(),
            'timestamps': (slam_timestamps / 1e6).tolist()
        }
    }

    return result


def load_mps_folder(folder_path):
    """
    Load all data from MPS output folder.

    Expected structure:
        folder_path/
            slam/
                closed_loop_trajectory.csv
            hand_tracking/
                hand_tracking_results.csv

    Returns:
        dict with hand landmarks in world coordinates and SLAM trajectory
    """
    slam_path = os.path.join(folder_path, 'slam', 'closed_loop_trajectory.csv')
    hand_path = os.path.join(folder_path, 'hand_tracking', 'hand_tracking_results.csv')

    has_slam = os.path.exists(slam_path)
    has_hand = os.path.exists(hand_path)

    print(f"MPS folder: {folder_path}")
    print(f"  SLAM: {'found' if has_slam else 'not found'}")
    print(f"  Hand tracking: {'found' if has_hand else 'not found'}")

    result = {
        'has_slam': has_slam,
        'has_hand': has_hand,
        'world_coordinates': True  # Flag indicating data is in world coordinates
    }

    if has_slam:
        slam_data = load_slam_trajectory(slam_path)
        result['slam_data'] = slam_data

    if has_hand and has_slam:
        # Load hand data and transform to world coordinates
        hand_data = load_hand_tracking_device(hand_path)
        world_data = transform_to_world(hand_data, slam_data)
        result['hand_landmarks'] = world_data
    elif has_hand:
        # No SLAM, load hand data in device coordinates
        hand_data = load_hand_tracking_device(hand_path)
        result['hand_landmarks'] = {
            'timestamps_us': hand_data['timestamps_us'].tolist(),
            'timestamps': (hand_data['timestamps_us'] / 1e6).tolist(),
            'right_hand': hand_data['right_hand_device'],
            'left_hand': hand_data['left_hand_device']
        }
        result['world_coordinates'] = False

    return result
