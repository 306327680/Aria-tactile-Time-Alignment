"""
MPS CSV file loader utility
"""

import csv


def load_hand_landmarks(mps_csv_path):
    """
    Load full 21-point hand landmarks from MPS CSV file.
    
    Args:
        mps_csv_path: Path to MPS CSV file
        
    Returns:
        dict with timestamps, left_hand, right_hand, and confidence arrays
    """
    hand_data = {
        'timestamps': [],
        'left_hand': [],
        'right_hand': [],
        'left_confidence': [],
        'right_confidence': []
    }

    # Get first timestamp for normalization
    first_timestamp = None

    with open(mps_csv_path, 'r') as f:
        reader = csv.DictReader(f)

        for row in reader:
            try:
                # Get timestamp
                timestamp_us = float(row['tracking_timestamp_us'])
                if first_timestamp is None:
                    first_timestamp = timestamp_us

                # Normalize timestamp to seconds from start
                timestamp_s = (timestamp_us - first_timestamp) / 1_000_000.0
                hand_data['timestamps'].append(timestamp_s)

                # Parse left hand landmarks (21 points)
                left_confidence = float(row.get('left_tracking_confidence', -1))
                hand_data['left_confidence'].append(left_confidence)

                if left_confidence > 0:
                    left_landmarks = []
                    for i in range(21):
                        x = float(row.get(f'tx_left_landmark_{i}_device', 0))
                        y = float(row.get(f'ty_left_landmark_{i}_device', 0))
                        z = float(row.get(f'tz_left_landmark_{i}_device', 0))
                        left_landmarks.append([x, y, z])
                    hand_data['left_hand'].append(left_landmarks)
                else:
                    hand_data['left_hand'].append(None)

                # Parse right hand landmarks (21 points)
                right_confidence = float(row.get('right_tracking_confidence', -1))
                hand_data['right_confidence'].append(right_confidence)

                if right_confidence > 0:
                    right_landmarks = []
                    for i in range(21):
                        x = float(row.get(f'tx_right_landmark_{i}_device', 0))
                        y = float(row.get(f'ty_right_landmark_{i}_device', 0))
                        z = float(row.get(f'tz_right_landmark_{i}_device', 0))
                        right_landmarks.append([x, y, z])
                    hand_data['right_hand'].append(right_landmarks)
                else:
                    hand_data['right_hand'].append(None)

            except Exception as e:
                print(f"Error parsing hand row: {e}")
                continue

    return hand_data

