"""
Haptic CSV file loader utility
"""

import csv
import pandas as pd


def load_haptic_data(haptic_csv_path):
    """
    Load haptic sensor data from CSV file.

    Expected columns:
    - Timestamp or Relative_Time_ms: time information
    - ThumbTip_Fx, ThumbTip_Fy, ThumbTip_Fz, ThumbTip_Total: thumb force
    - IndexTip_Fx, IndexTip_Fy, IndexTip_Fz, IndexTip_Total: index force

    Returns:
        dict with timestamps and force values for each sensor
    """
    df = pd.read_csv(haptic_csv_path)

    # Find timestamp column
    time_col = None
    for col in ['Relative_Time_ms', 'relative_time_ms', 'Timestamp', 'timestamp', 'time']:
        if col in df.columns:
            time_col = col
            break

    if time_col is None:
        raise ValueError("No timestamp column found in haptic CSV")

    # Convert timestamps to seconds
    if 'ms' in time_col.lower():
        timestamps = df[time_col].values / 1000.0  # ms to seconds
    else:
        # Try to parse as datetime
        try:
            timestamps = pd.to_datetime(df[time_col])
            timestamps = (timestamps - timestamps.iloc[0]).dt.total_seconds().values
        except:
            timestamps = df[time_col].values

    result = {
        'timestamps': timestamps.tolist(),
        'sensors': {}
    }

    # Find force columns for each sensor
    sensor_prefixes = ['ThumbTip', 'IndexTip', 'MiddleTip', 'RingTip', 'PinkyTip']

    for prefix in sensor_prefixes:
        # Check if this sensor exists
        total_col = f'{prefix}_Total'
        if total_col not in df.columns:
            # Try lowercase
            total_col_lower = total_col.lower()
            for col in df.columns:
                if col.lower() == total_col_lower:
                    total_col = col
                    break
            else:
                continue

        sensor_data = {
            'total': df[total_col].fillna(0).values.tolist()
        }

        # Try to get individual force components
        for axis in ['Fx', 'Fy', 'Fz']:
            axis_col = f'{prefix}_{axis}'
            if axis_col in df.columns:
                sensor_data[axis.lower()] = df[axis_col].fillna(0).values.tolist()
            else:
                # Try lowercase
                for col in df.columns:
                    if col.lower() == axis_col.lower():
                        sensor_data[axis.lower()] = df[col].fillna(0).values.tolist()
                        break

        # Map sensor prefix to finger name
        finger_map = {
            'ThumbTip': 'thumb',
            'IndexTip': 'index',
            'MiddleTip': 'middle',
            'RingTip': 'ring',
            'PinkyTip': 'pinky'
        }
        finger_name = finger_map.get(prefix, prefix.lower())
        result['sensors'][finger_name] = sensor_data

    # Calculate force range for normalization
    all_forces = []
    for sensor_name, sensor_data in result['sensors'].items():
        all_forces.extend(sensor_data['total'])

    if all_forces:
        result['force_range'] = [min(all_forces), max(all_forces)]
    else:
        result['force_range'] = [0, 1]

    print(f"Loaded haptic data: {len(timestamps)} samples, sensors: {list(result['sensors'].keys())}")
    print(f"Force range: {result['force_range']}")

    return result
