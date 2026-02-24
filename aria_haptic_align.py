#!/usr/bin/env python3
"""
Aria-Haptic Time Alignment Library

This library aligns Aria hand tracking data (right hand thumb-index distance)
with haptic sensor data (thumb/index force) by finding the optimal time offset.

Dependencies:
    - aria_api: Internal library for VRS/MPS data access and hand tracking
                Installation: https://github.com/306327680/Aria-Vrs-Mps-api
    - numpy: For numerical computations
    - pandas: For CSV data handling
    - matplotlib: For visualization
    - scipy: For signal processing and correlation
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import interpolate, signal, optimize
from typing import Tuple, Dict, Optional

# Try to import aria_api (optional for web app demo mode)
try:
    import aria_api
    ARIA_API_AVAILABLE = True
except ImportError:
    ARIA_API_AVAILABLE = False
    print("Warning: aria_api not found. VRS file processing will not be available.")
    print("Please install aria_api to use full functionality.")
    print("Installation: https://github.com/306327680/Aria-Vrs-Mps-api")


class AriaHapticAligner:
    """
    Aligns Aria hand tracking with haptic sensor data using temporal correlation.
    """

    def __init__(self, vrs_path: str = None, haptic_csv_path: str = None, mps_csv_path: str = None):
        """
        Initialize the aligner with data paths.

        Args:
            vrs_path: Path to the VRS file (aria_api will auto-discover MPS). Optional if mps_csv_path is provided.
            haptic_csv_path: Path to the haptic sensor CSV file
            mps_csv_path: Path to the MPS hand_tracking_results.csv file (alternative to VRS). Optional if vrs_path is provided.
        """
        self.vrs_path = vrs_path
        self.haptic_csv_path = haptic_csv_path
        self.mps_csv_path = mps_csv_path

        # Data storage
        self.aria_timestamps = None
        self.aria_distance = None
        self.haptic_timestamps = None
        self.haptic_force = None
        self.haptic_thumb_force = None  # Separate thumb force
        self.haptic_index_force = None  # Separate index force

        # Alignment results
        self.optimal_offset = None
        self.correlation_scores = None
        self.search_offsets = None  # Store the actual offset values used in search

    def load_aria_data(self) -> Tuple[np.ndarray, np.ndarray]:
        """
        Load Aria VRS/MPS data and extract right hand thumb-index distance.

        Returns:
            timestamps: Array of timestamps (seconds from first valid data)
            distances: Array of thumb-index distances (meters)
        """
        if not ARIA_API_AVAILABLE:
            raise ImportError(
                "aria_api is not installed. This is required for VRS file processing.\n"
                "Installation: https://github.com/306327680/Aria-Vrs-Mps-api\n"
                "Alternatively, you can use MPS CSV files with load_aria_data_from_mps_csv()."
            )

        # Use aria_api to load VRS and auto-discover MPS
        session = aria_api.AriaSession.from_vrs(self.vrs_path)

        # Get session info to find hand tracking time range
        info = session.get_session_info()
        if not info['capabilities']['has_hands']:
            raise RuntimeError("No hand tracking data available in MPS")

        hand_stats = info['hand_stats']
        time_range_ns = hand_stats['time_range_ns']
        print(f"Hand tracking time range: {time_range_ns[0]} to {time_range_ns[1]} ns")

        timestamps = []
        distances = []

        # Sample hand tracking data at regular intervals (e.g., 10Hz)
        start_ns = time_range_ns[0]
        end_ns = time_range_ns[1]
        step_ns = int(100e6)  # 100ms = 10Hz sampling

        # Extract right hand thumb (joint 4) and index (joint 8) positions
        # Hand landmarks: 0-4 (thumb), 5-8 (index), 9-12 (middle), 13-16 (ring), 17-20 (pinky)
        for timestamp_ns in range(start_ns, end_ns + 1, step_ns):
            # Get hand data at this timestamp
            hand_info = session.nearest_hands(timestamp_ns, max_slop_ns=int(100e6))  # 100ms tolerance

            if hand_info is None:
                continue

            # Check if right hand is available
            if hand_info.right_hand is None:
                continue

            right_hand = hand_info.right_hand

            # Check confidence
            if not right_hand.is_valid(confidence_threshold=0.5):
                continue

            # Get world coordinates using wrist_transform
            if right_hand.wrist_transform is None:
                continue

            # landmarks_device is in device frame (21, 3)
            # Transform to world coordinates using wrist_transform
            landmarks_device = right_hand.landmarks_device  # (21, 3)

            # Transform all landmarks to world coordinates at once
            # SE3.transform_points expects shape (N, 3) and returns (N, 3)
            world_points = right_hand.wrist_transform.transform_points(landmarks_device)

            # Thumb tip: index 4, Index finger tip: index 8
            thumb_pos = world_points[4]
            index_pos = world_points[8]

            # Calculate Euclidean distance
            distance = np.linalg.norm(thumb_pos - index_pos)

            timestamps.append(hand_info.timestamp_ns / 1e9)  # Use actual timestamp from data
            distances.append(distance)

        timestamps = np.array(timestamps)
        distances = np.array(distances)

        if len(timestamps) == 0:
            raise RuntimeError("No valid hand tracking data found")

        # Normalize to start from 0
        timestamps = timestamps - timestamps[0]

        self.aria_timestamps = timestamps
        self.aria_distance = distances

        print(f"Loaded {len(timestamps)} Aria hand tracking frames")
        print(f"Time range: {timestamps[0]:.2f}s to {timestamps[-1]:.2f}s")
        print(f"Distance range: {distances.min():.4f}m to {distances.max():.4f}m")

        return timestamps, distances

    def load_aria_data_from_mps_csv(self) -> Tuple[np.ndarray, np.ndarray]:
        """
        Load Aria hand tracking data from MPS-generated CSV file.
        This is an alternative to load_aria_data() that doesn't require aria_api.

        The MPS CSV file (hand_tracking_results.csv) contains:
        - tracking_timestamp_us: Timestamp in microseconds
        - right_tracking_confidence: Confidence score for right hand
        - tx_right_landmark_N_device, ty_right_landmark_N_device, tz_right_landmark_N_device:
          3D coordinates for landmark N (N=0..20)

        We use landmark 4 (thumb tip) and landmark 8 (index tip) to calculate pinch distance.

        Returns:
            timestamps: Array of timestamps (seconds from first valid data)
            distances: Array of thumb-index distances (meters)
        """
        if self.mps_csv_path is None:
            raise ValueError("mps_csv_path must be set to use this function")

        # Read MPS CSV file
        df = pd.read_csv(self.mps_csv_path)

        print(f"Loaded MPS CSV with {len(df)} rows")

        # Extract timestamps (convert from microseconds to seconds)
        timestamps = df['tracking_timestamp_us'].values / 1e6

        # Extract right hand confidence
        confidence = df['right_tracking_confidence'].values

        # Filter out low confidence data (< 0.5)
        valid_mask = confidence > 0.5
        print(f"Valid frames (confidence > 0.5): {np.sum(valid_mask)} / {len(valid_mask)}")

        if np.sum(valid_mask) == 0:
            raise RuntimeError("No valid hand tracking data found (all confidence scores below 0.5)")

        # Extract thumb tip (landmark 4) coordinates
        thumb_x = df['tx_right_landmark_4_device'].values[valid_mask]
        thumb_y = df['ty_right_landmark_4_device'].values[valid_mask]
        thumb_z = df['tz_right_landmark_4_device'].values[valid_mask]

        # Extract index tip (landmark 8) coordinates
        index_x = df['tx_right_landmark_8_device'].values[valid_mask]
        index_y = df['ty_right_landmark_8_device'].values[valid_mask]
        index_z = df['tz_right_landmark_8_device'].values[valid_mask]

        # Calculate Euclidean distance between thumb and index
        distances = np.sqrt(
            (thumb_x - index_x)**2 +
            (thumb_y - index_y)**2 +
            (thumb_z - index_z)**2
        )

        # Get valid timestamps
        timestamps = timestamps[valid_mask]

        # Store original timestamps before normalization for reference
        original_timestamps = timestamps.copy()
        original_time_range = (original_timestamps[0], original_timestamps[-1])

        # Normalize timestamps to start from 0
        timestamps = timestamps - timestamps[0]

        self.aria_timestamps = timestamps
        self.aria_distance = distances

        # Store additional statistics
        self.mps_total_frames = len(df)
        self.mps_valid_frames = np.sum(valid_mask)

        # Try to load statistics from summary.json file in the same directory
        self.mps_success_rate = None
        self.mps_avg_confidence = None
        self.mps_min_confidence = None
        self.mps_max_confidence = None

        try:
            import json
            # Get the directory of the MPS CSV file
            mps_dir = os.path.dirname(self.mps_csv_path)
            summary_json_path = os.path.join(mps_dir, 'summary.json')

            if os.path.exists(summary_json_path):
                print(f"Loading statistics from {summary_json_path}")
                with open(summary_json_path, 'r') as f:
                    summary_data = json.load(f)

                # Use statistics from summary.json
                self.mps_success_rate = summary_data.get('valid_frame_fraction', 0) * 100
                self.mps_avg_confidence = summary_data.get('mean_confidence', 0)

                print(f"Loaded from summary.json - Success rate: {self.mps_success_rate:.1f}%, Mean confidence: {self.mps_avg_confidence:.3f}")
            else:
                print(f"Summary file not found at {summary_json_path}, using CSV data")
                # Fallback to CSV data calculation
                self.mps_success_rate = (self.mps_valid_frames / self.mps_total_frames) * 100
                self.mps_avg_confidence = confidence[valid_mask].mean()
                self.mps_min_confidence = confidence[valid_mask].min()
                self.mps_max_confidence = confidence[valid_mask].max()

        except Exception as e:
            print(f"Error loading summary.json: {e}, using CSV data calculation")
            # Fallback to CSV data calculation
            self.mps_success_rate = (self.mps_valid_frames / self.mps_total_frames) * 100
            self.mps_avg_confidence = confidence[valid_mask].mean()
            self.mps_min_confidence = confidence[valid_mask].min()
            self.mps_max_confidence = confidence[valid_mask].max()

        # Store original time range for display purposes
        self.mps_original_time_range = original_time_range

        print(f"Loaded {len(timestamps)} Aria hand tracking frames from MPS CSV")
        print(f"Original time range: {original_time_range[0]:.2f}s to {original_time_range[1]:.2f}s")
        print(f"Normalized time range: {timestamps[0]:.2f}s to {timestamps[-1]:.2f}s")
        print(f"Distance range: {distances.min():.4f}m to {distances.max():.4f}m")
        if self.mps_success_rate is not None:
            print(f"Success rate: {self.mps_success_rate:.1f}%")
        if self.mps_avg_confidence is not None:
            print(f"Mean confidence: {self.mps_avg_confidence:.3f}")

        return timestamps, distances

    def load_haptic_data(self) -> Tuple[np.ndarray, np.ndarray]:
        """
        Load haptic sensor CSV data and extract finger force magnitudes.
        Supports both GEN3 format and legacy formats.

        GEN3 Format (Version 3):
            - Timestamp, Sample_Index, Relative_Time_ms
            - {Sensor}_Fx, {Sensor}_Fy, {Sensor}_Fz, {Sensor}_Total
            - Sensors: ThumbTip, IndexTip, MiddleTip, RingTip, PinkyTip

        Legacy Formats:
            - timestamp/relative_time columns
            - {Sensor}_magnitude columns

        Returns:
            timestamps: Array of timestamps (seconds from first valid data)
            forces: Array of combined finger forces
        """
        # Read CSV file
        df = pd.read_csv(self.haptic_csv_path)

        print(f"DEBUG: CSV columns: {df.columns.tolist()}")

        # ===== Time column detection =====
        normalize_timestamps = False
        time_source = None

        # Priority 1: Relative_Time_ms (GEN3 format - use actual time)
        if 'Relative_Time_ms' in df.columns:
            timestamps = pd.to_numeric(df['Relative_Time_ms'], errors='coerce').values / 1000.0  # ms to seconds
            time_source = "Relative_Time_ms"
            print(f"Using {time_source} for timestamps")

        # Priority 2: Sample_Index (GEN3 format - guaranteed continuous)
        elif 'Sample_Index' in df.columns:
            timestamps = pd.to_numeric(df['Sample_Index'], errors='coerce').values
            # Convert sample index to time assuming 1000Hz sampling rate
            timestamps = timestamps / 1000.0  # Convert to seconds
            time_source = "Sample_Index (1000Hz)"
            print(f"Using {time_source} for timestamps")

        # Priority 3: relative_time (legacy format, in seconds)
        elif 'relative_time' in df.columns:
            timestamps = pd.to_numeric(df['relative_time'], errors='coerce').values
            time_source = "relative_time"
            print(f"Using {time_source} for timestamps")

        # Priority 4: timestamp (legacy format)
        elif 'timestamp' in df.columns:
            timestamps = pd.to_numeric(df['timestamp'], errors='coerce').values
            normalize_timestamps = True
            time_source = "timestamp"
            print(f"Using {time_source} for timestamps")

        # Fallback: use first column
        else:
            timestamps = pd.to_numeric(df.iloc[:, 0], errors='coerce').values
            normalize_timestamps = True
            time_source = "first column"
            print(f"WARNING: Using {time_source} for timestamps")

        # ===== Force column detection =====
        # Priority 1: Look for _Total columns (GEN3 format)
        total_cols = [col for col in df.columns if '_Total' in col]

        # Priority 2: Look for _magnitude columns (legacy format)
        if not total_cols:
            total_cols = [col for col in df.columns if '_magnitude' in col.lower()]

        print(f"DEBUG: Found force columns: {total_cols}")

        # Extract forces based on available columns
        # Initialize separate thumb and index forces
        thumb_force = None
        index_force = None

        if len(total_cols) >= 2:
            # Try to find ThumbTip and IndexTip for pinch force
            thumb_col = next((col for col in total_cols if 'thumb' in col.lower()), None)
            index_col = next((col for col in total_cols if 'index' in col.lower()), None)

            if thumb_col and index_col:
                force1 = pd.to_numeric(df[thumb_col], errors='coerce').values
                force2 = pd.to_numeric(df[index_col], errors='coerce').values
                thumb_force = force1.copy()
                index_force = force2.copy()
                forces = force1 + force2  # Combined pinch force
                print(f"Using pinch force columns: {thumb_col} + {index_col}")
            else:
                # Use first two available force columns
                force1 = pd.to_numeric(df[total_cols[0]], errors='coerce').values
                force2 = pd.to_numeric(df[total_cols[1]], errors='coerce').values
                thumb_force = force1.copy()
                index_force = force2.copy()
                forces = force1 + force2
                print(f"Using force columns: {total_cols[0]} + {total_cols[1]}")

        elif len(total_cols) == 1:
            forces = pd.to_numeric(df[total_cols[0]], errors='coerce').values
            thumb_force = forces.copy()
            index_force = np.zeros_like(forces)
            print(f"Using single force column: {total_cols[0]}")

        else:
            # Fallback: look for any force-related columns (Fx, Fy, Fz)
            fx_cols = [col for col in df.columns if col.endswith('_Fx')]
            fy_cols = [col for col in df.columns if col.endswith('_Fy')]
            fz_cols = [col for col in df.columns if col.endswith('_Fz')]

            if fx_cols and fy_cols and fz_cols:
                # Calculate magnitude from components
                fx = pd.to_numeric(df[fx_cols[0]], errors='coerce').values
                fy = pd.to_numeric(df[fy_cols[0]], errors='coerce').values
                fz = pd.to_numeric(df[fz_cols[0]], errors='coerce').values
                forces = np.sqrt(fx**2 + fy**2 + fz**2)
                thumb_force = forces.copy()
                index_force = np.zeros_like(forces)
                print(f"Calculated force magnitude from: {fx_cols[0]}, {fy_cols[0]}, {fz_cols[0]}")
            else:
                raise ValueError(f"Cannot find suitable force columns in CSV. Available columns: {df.columns.tolist()}")

        # ===== Data validation and filtering =====
        # Filter out invalid rows (NaN in timestamp or force)
        valid_mask = ~(np.isnan(timestamps) | np.isnan(forces))

        if not np.any(valid_mask):
            raise ValueError("Could not parse timestamp or force columns as numeric values")

        print(f"Valid data rows: {np.sum(valid_mask)} / {len(timestamps)}")

        timestamps = timestamps[valid_mask]
        forces = forces[valid_mask]
        if thumb_force is not None:
            thumb_force = thumb_force[valid_mask]
        if index_force is not None:
            index_force = index_force[valid_mask]

        # ===== Timestamp normalization =====
        if normalize_timestamps:
            # Convert to seconds if needed
            if timestamps[0] > 1e9:  # Likely nanoseconds
                timestamps = timestamps / 1e9
                print(f"Converted timestamps from nanoseconds to seconds")
            elif timestamps[0] > 1e6:  # Likely milliseconds
                timestamps = timestamps / 1e3
                print(f"Converted timestamps from milliseconds to seconds")

        # Always normalize to start from 0
        timestamps = timestamps - timestamps[0]

        self.haptic_timestamps = timestamps
        self.haptic_force = forces
        self.haptic_thumb_force = thumb_force
        self.haptic_index_force = index_force

        # ===== Store multi-axis and multi-finger data =====
        # Store all available sensor data for advanced visualization
        self.haptic_sensors = {}  # Dictionary to store data per sensor

        # List of possible sensors
        sensor_names = ['ThumbTip', 'IndexTip', 'MiddleTip', 'RingTip', 'PinkyTip']

        for sensor in sensor_names:
            fx_col = f"{sensor}_Fx"
            fy_col = f"{sensor}_Fy"
            fz_col = f"{sensor}_Fz"
            total_col = f"{sensor}_Total"

            # Check if this sensor has data
            if fx_col in df.columns and fy_col in df.columns and fz_col in df.columns:
                fx = pd.to_numeric(df[fx_col], errors='coerce').values[valid_mask]
                fy = pd.to_numeric(df[fy_col], errors='coerce').values[valid_mask]
                fz = pd.to_numeric(df[fz_col], errors='coerce').values[valid_mask]

                # Calculate total if not provided
                if total_col in df.columns:
                    total = pd.to_numeric(df[total_col], errors='coerce').values[valid_mask]
                else:
                    total = np.sqrt(fx**2 + fy**2 + fz**2)

                self.haptic_sensors[sensor] = {
                    'Fx': fx,
                    'Fy': fy,
                    'Fz': fz,
                    'Total': total
                }
                print(f"Stored {sensor} sensor data (Fx, Fy, Fz, Total)")

        if self.haptic_sensors:
            print(f"Available sensors: {list(self.haptic_sensors.keys())}")
        else:
            print("Warning: No multi-axis sensor data found")

        print(f"Loaded {len(timestamps)} haptic sensor samples")
        print(f"Time range: {timestamps[0]:.2f}s to {timestamps[-1]:.2f}s")
        print(f"Force range: {forces.min():.4f} to {forces.max():.4f}")

        return timestamps, forces

    def _compute_similarity(self, aria_samples: np.ndarray, haptic_samples: np.ndarray,
                           method: str = 'dtw') -> float:
        """
        Compute similarity between two signals using various methods.

        Args:
            aria_samples: Aria signal samples
            haptic_samples: Haptic signal samples
            method: Similarity method ('pearson', 'dtw', 'xcorr', 'mi', 'hybrid')

        Returns:
            similarity: Higher value indicates better alignment
        """
        valid_mask = (aria_samples > 1e-6) & (haptic_samples > 1e-6)
        if np.sum(valid_mask) < 10:
            return -np.inf

        aria_valid = aria_samples[valid_mask]
        haptic_valid = haptic_samples[valid_mask]

        if method == 'pearson':
            # Simple Pearson correlation
            return np.corrcoef(aria_valid, haptic_valid)[0, 1]

        elif method == 'xcorr':
            # Cross-correlation (normalized)
            aria_centered = aria_valid - np.mean(aria_valid)
            haptic_centered = haptic_valid - np.mean(haptic_valid)
            xcorr = np.correlate(aria_centered, haptic_centered, mode='valid')[0]
            norm = np.sqrt(np.sum(aria_centered**2) * np.sum(haptic_centered**2))
            return xcorr / (norm + 1e-8)

        elif method == 'dtw':
            # Dynamic Time Warping distance (inverted for similarity)
            # Downsample for speed (DTW is O(n*m))
            max_samples = 500
            if len(aria_valid) > max_samples:
                step = len(aria_valid) // max_samples
                aria_ds = aria_valid[::step]
                haptic_ds = haptic_valid[::step]
            else:
                aria_ds = aria_valid
                haptic_ds = haptic_valid

            n = len(aria_ds)
            m = len(haptic_ds)
            window = max(n, m) // 5  # 20% warping window

            # Simple DTW implementation with Sakoe-Chiba band
            dtw_matrix = np.full((n + 1, m + 1), np.inf)
            dtw_matrix[0, 0] = 0

            for i in range(1, n + 1):
                # Sakoe-Chiba band constraint
                j_start = max(1, i - window)
                j_end = min(m + 1, i + window)

                for j in range(j_start, j_end):
                    cost = abs(aria_ds[i-1] - haptic_ds[j-1])
                    dtw_matrix[i, j] = cost + min(
                        dtw_matrix[i-1, j],      # insertion
                        dtw_matrix[i, j-1],      # deletion
                        dtw_matrix[i-1, j-1]     # match
                    )

            # Normalize by path length and invert (lower distance = higher similarity)
            dtw_distance = dtw_matrix[n, m] / max(n, m)
            return -dtw_distance

        elif method == 'mi':
            # Mutual Information (discretized)
            # Bin the signals
            n_bins = 20
            aria_binned = np.digitize(aria_valid, np.linspace(0, 1, n_bins))
            haptic_binned = np.digitize(haptic_valid, np.linspace(0, 1, n_bins))

            # Compute joint histogram
            joint_hist = np.zeros((n_bins + 1, n_bins + 1))
            for a, h in zip(aria_binned, haptic_binned):
                joint_hist[a, h] += 1
            joint_hist /= len(aria_valid)

            # Marginal distributions
            p_aria = np.sum(joint_hist, axis=1)
            p_haptic = np.sum(joint_hist, axis=0)

            # Mutual information
            mi = 0
            for i in range(n_bins + 1):
                for j in range(n_bins + 1):
                    if joint_hist[i, j] > 0:
                        mi += joint_hist[i, j] * np.log(
                            joint_hist[i, j] / (p_aria[i] * p_haptic[j] + 1e-10)
                        )

            return mi

        elif method == 'hybrid':
            # Hybrid: weighted combination of multiple methods (excluding slow DTW)
            corr = self._compute_similarity(aria_samples, haptic_samples, 'pearson')
            xcorr = self._compute_similarity(aria_samples, haptic_samples, 'xcorr')
            mi = self._compute_similarity(aria_samples, haptic_samples, 'mi')

            # Normalize MI to similar range as correlation
            mi_norm = mi / 2.0  # MI is typically 0-2

            # Weighted combination
            return 0.4 * corr + 0.4 * xcorr + 0.2 * mi_norm

        else:
            raise ValueError(f"Unknown similarity method: {method}")

    def find_optimal_offset(self, max_offset: float = 10.0, step: float = 0.01,
                           method: str = 'hybrid') -> float:
        """
        Find optimal time offset between Aria and haptic data.

        Supports multiple alignment methods:
        - 'pearson': Simple Pearson correlation (fast, but sensitive to outliers)
        - 'xcorr': Cross-correlation (better for similar signal shapes)
        - 'dtw': Dynamic Time Warping (handles temporal distortions)
        - 'mi': Mutual Information (captures non-linear relationships)
        - 'hybrid': Combination of multiple methods (recommended)

        Args:
            max_offset: Maximum offset to search (seconds)
            step: Step size for offset search (seconds)
            method: Alignment method to use

        Returns:
            optimal_offset: The best time offset in seconds
        """
        print(f"Using alignment method: {method}")

        # Normalize signals to [0, 1] for comparison
        aria_norm = (self.aria_distance - self.aria_distance.min()) / \
                    (self.aria_distance.max() - self.aria_distance.min())
        haptic_norm = (self.haptic_force - self.haptic_force.min()) / \
                      (self.haptic_force.max() - self.haptic_force.min())

        # Invert distance (smaller distance → larger value, like force)
        aria_norm = 1.0 - aria_norm

        # Create interpolation functions (smoothing done later if needed)
        aria_interp = interpolate.interp1d(
            self.aria_timestamps, aria_norm,
            bounds_error=False, fill_value=0
        )
        haptic_interp = interpolate.interp1d(
            self.haptic_timestamps, haptic_norm,
            bounds_error=False, fill_value=0
        )

        # Search for optimal offset
        offsets = np.arange(0, max_offset, step)
        scores = []

        # Common time range for comparison (after applying offset)
        common_start = step
        common_end = min(self.aria_timestamps[-1], self.haptic_timestamps[-1]) - max_offset

        if common_end <= common_start:
            print(f"Warning: Insufficient overlap. Adjusting range.")
            common_end = min(self.aria_timestamps[-1], self.haptic_timestamps[-1]) / 2

        common_times = np.arange(common_start, common_end, 0.05)  # 20Hz sampling

        print(f"Searching offsets in range [0, {max_offset}s] with step {step}s...")

        for offset in offsets:
            # Apply offset to haptic data (shift it forward in time)
            aria_samples = aria_interp(common_times)
            haptic_samples = haptic_interp(common_times + offset)

            # Calculate similarity
            score = self._compute_similarity(aria_samples, haptic_samples, method)
            scores.append(score)

        scores = np.array(scores)
        self.correlation_scores = scores
        self.search_offsets = offsets  # Store offsets for plotting

        # Find offset with maximum similarity
        best_idx = np.argmax(scores)
        self.optimal_offset = offsets[best_idx]

        print(f"\n=== Time Alignment Results ===")
        print(f"Method: {method}")
        print(f"Optimal offset: {self.optimal_offset:.3f} seconds")
        print(f"Max similarity score: {scores[best_idx]:.4f}")
        print(f"Search range: 0 to {max_offset}s")

        return self.optimal_offset

    def plot_alignment(self, save_path: Optional[str] = None, segments: Optional[list] = None):
        """
        Plot before/after alignment comparison.

        Args:
            save_path: Optional path to save the figure
            segments: Optional list of (split_time, segment_index) tuples to overlay
        """
        fig, axes = plt.subplots(3, 1, figsize=(14, 10))

        # Normalize signals for visualization
        aria_norm = (self.aria_distance - self.aria_distance.min()) / \
                    (self.aria_distance.max() - self.aria_distance.min())
        aria_inverted = 1.0 - aria_norm  # Invert for comparison

        haptic_norm = (self.haptic_force - self.haptic_force.min()) / \
                      (self.haptic_force.max() - self.haptic_force.min())

        # Plot 1: Before alignment
        ax1 = axes[0]
        ax1.plot(self.aria_timestamps, aria_inverted, 'b-', label='Aria (inverted distance)', alpha=0.7)
        ax1.plot(self.haptic_timestamps, haptic_norm, 'r-', label='Haptic (force)', alpha=0.7)
        ax1.set_xlabel('Time (s)')
        ax1.set_ylabel('Normalized Value')
        ax1.set_title('Before Alignment')
        ax1.legend()
        ax1.grid(True, alpha=0.3)

        # Plot 2: After alignment (with segment markers if provided)
        ax2 = axes[1]
        ax2.plot(self.aria_timestamps, aria_inverted, 'b-', label='Aria (inverted distance)', alpha=0.7)
        ax2.plot(self.haptic_timestamps + self.optimal_offset, haptic_norm,
                'r-', label=f'Haptic (force, offset +{self.optimal_offset:.3f}s)', alpha=0.7)

        # Draw segment split points
        if segments:
            for i, (split_time, idx) in enumerate(segments):
                # Draw vertical line at split point (midpoint of zero-force gap)
                if i == 0:
                    ax2.axvline(split_time, color='red', linewidth=1, alpha=0.7, linestyle='--', label='Split point')
                else:
                    ax2.axvline(split_time, color='red', linewidth=1, alpha=0.7, linestyle='--')

        ax2.set_xlabel('Time (s)')
        ax2.set_ylabel('Normalized Value')
        title = f'After Alignment (offset = {self.optimal_offset:.3f}s)'
        if segments:
            title += f' - {len(segments)} splits ({len(segments) + 1} segments)'
        ax2.set_title(title)
        ax2.legend()
        ax2.grid(True, alpha=0.3)

        # Plot 3: Correlation vs offset
        ax3 = axes[2]
        ax3.plot(self.search_offsets, self.correlation_scores, 'g-', linewidth=2)
        ax3.axvline(self.optimal_offset, color='r', linestyle='--',
                   label=f'Optimal offset: {self.optimal_offset:.3f}s')
        ax3.set_xlabel('Time Offset (s)')
        ax3.set_ylabel('Similarity Score')
        ax3.set_title('Similarity Score vs Time Offset')
        ax3.legend()
        ax3.grid(True, alpha=0.3)

        plt.tight_layout()

        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"\nFigure saved to: {save_path}")
            plt.close(fig)  # Close figure to avoid display
        else:
            plt.show()

    def detect_force_segments(self, force_threshold: float = 1.0,
                             min_segment_duration: float = 0.5,
                             min_gap_duration: float = 0.3,
                             smooth_window: int = 5) -> list:
        """
        Detect force segments by finding regions where force is above threshold.
        Uses smoothing to reduce false segmentation from noise.

        Args:
            force_threshold: Minimum force value to consider as "active" (default: 1.0)
            min_segment_duration: Minimum duration (seconds) for a valid segment
            min_gap_duration: Minimum gap duration (seconds) between segments
            smooth_window: Window size for moving average smoothing (default: 5)

        Returns:
            List of tuples: [(split_time, segment_index), ...]
            split_time is the midpoint of zero-force gaps
            Times are in Aria coordinate system (seconds from Aria start)
        """
        from scipy.ndimage import uniform_filter1d

        # Apply time offset to align haptic with Aria timeline
        haptic_aligned_time = self.haptic_timestamps + self.optimal_offset

        # Smooth the force signal to reduce noise
        if smooth_window > 1:
            force_smoothed = uniform_filter1d(self.haptic_force, size=smooth_window, mode='nearest')
        else:
            force_smoothed = self.haptic_force

        # Identify active regions (force > threshold)
        is_active = force_smoothed > force_threshold

        # Find transitions
        segments = []
        in_segment = False
        segment_start = None

        for i in range(len(is_active)):
            if is_active[i] and not in_segment:
                # Start of new segment
                segment_start = haptic_aligned_time[i]
                in_segment = True
            elif not is_active[i] and in_segment:
                # End of segment
                segment_end = haptic_aligned_time[i]
                duration = segment_end - segment_start

                # Only keep segments longer than minimum duration
                if duration >= min_segment_duration:
                    segments.append((segment_start, segment_end))

                in_segment = False

        # Handle case where last segment extends to end
        if in_segment:
            segment_end = haptic_aligned_time[-1]
            duration = segment_end - segment_start
            if duration >= min_segment_duration:
                segments.append((segment_start, segment_end))

        # Merge segments that are too close together
        if len(segments) > 1:
            merged_segments = [segments[0]]
            for start, end in segments[1:]:
                prev_start, prev_end = merged_segments[-1]
                gap = start - prev_end

                if gap < min_gap_duration:
                    # Merge with previous segment
                    merged_segments[-1] = (prev_start, end)
                else:
                    merged_segments.append((start, end))

            segments = merged_segments

        # Calculate split points at the midpoint of zero-force gaps
        split_points = []
        for i in range(len(segments) - 1):
            _, end_current = segments[i]
            start_next, _ = segments[i + 1]

            # Midpoint of the gap
            split_time = (end_current + start_next) / 2.0
            split_points.append((split_time, i))

        return split_points

    def detect_force_segment_pairs(self, force_threshold: float = 1.0,
                                    min_segment_duration: float = 0.5,
                                    min_gap_duration: float = 0.3,
                                    smooth_window: int = 5,
                                    padding: float = 2.0) -> list:
        """
        Detect force segments and return raw start/end time pairs.

        Args:
            force_threshold: Minimum force value to consider as "active" (default: 1.0)
            min_segment_duration: Minimum duration (seconds) for a valid segment
            min_gap_duration: Minimum gap duration (seconds) between segments
            smooth_window: Window size for moving average smoothing (default: 5)
            padding: Extra seconds to extend each segment on both sides (default: 2.0)

        Returns:
            List of dicts: [{'id': int, 'start': float, 'end': float,
                             'duration': float, 'enabled': True}, ...]
            Times are in Aria coordinate system (seconds from Aria start).
        """
        from scipy.ndimage import uniform_filter1d

        # Apply time offset to align haptic with Aria timeline
        haptic_aligned_time = self.haptic_timestamps + self.optimal_offset

        # Smooth the force signal to reduce noise
        if smooth_window > 1:
            force_smoothed = uniform_filter1d(self.haptic_force, size=smooth_window, mode='nearest')
        else:
            force_smoothed = self.haptic_force

        # Identify active regions (force > threshold)
        is_active = force_smoothed > force_threshold

        # Find transitions
        segments = []
        in_segment = False
        segment_start = None

        for i in range(len(is_active)):
            if is_active[i] and not in_segment:
                segment_start = haptic_aligned_time[i]
                in_segment = True
            elif not is_active[i] and in_segment:
                segment_end = haptic_aligned_time[i]
                duration = segment_end - segment_start
                if duration >= min_segment_duration:
                    segments.append((segment_start, segment_end))
                in_segment = False

        # Handle case where last segment extends to end
        if in_segment:
            segment_end = haptic_aligned_time[-1]
            duration = segment_end - segment_start
            if duration >= min_segment_duration:
                segments.append((segment_start, segment_end))

        # Merge segments that are too close together
        if len(segments) > 1:
            merged_segments = [segments[0]]
            for start, end in segments[1:]:
                prev_start, prev_end = merged_segments[-1]
                gap = start - prev_end
                if gap < min_gap_duration:
                    merged_segments[-1] = (prev_start, end)
                else:
                    merged_segments.append((start, end))
            segments = merged_segments

        # Apply padding: extend each segment by `padding` seconds on both sides
        if padding > 0 and len(segments) > 0:
            time_min = float(haptic_aligned_time[0])
            time_max = float(haptic_aligned_time[-1])
            segments = [(max(s - padding, time_min), min(e + padding, time_max))
                        for s, e in segments]
            # Re-merge segments that now overlap after padding
            if len(segments) > 1:
                merged = [segments[0]]
                for s, e in segments[1:]:
                    ps, pe = merged[-1]
                    if s <= pe:
                        merged[-1] = (ps, max(pe, e))
                    else:
                        merged.append((s, e))
                segments = merged

        # Return as list of dicts with id and enabled flag
        return [
            {
                'id': i,
                'start': float(start),
                'end': float(end),
                'duration': float(end - start),
                'enabled': True
            }
            for i, (start, end) in enumerate(segments)
        ]

    def export_segments_csv(self, segments: list, output_path: str):
        """
        Export segment split points to CSV file.

        Args:
            segments: List of (split_time, segment_index) tuples
            output_path: Path to save CSV file
        """
        import csv

        with open(output_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['split_index', 'split_time_s', 'before_segment', 'after_segment'])

            for split_time, idx in segments:
                writer.writerow([idx, f'{split_time:.3f}', idx, idx + 1])

        print(f"\nSegment split points saved to: {output_path}")
        print(f"Total splits: {len(segments)} (creates {len(segments) + 1} segments)")

    def run(self, max_offset: float = 10.0, method: str = 'hybrid',
            plot: bool = True, save_path: Optional[str] = None,
            export_segments: bool = True, force_threshold: float = 1.0,
            smooth_window: int = 5) -> Dict:
        """
        Run complete alignment pipeline.

        Args:
            max_offset: Maximum offset to search (seconds)
            method: Alignment method ('pearson', 'xcorr', 'dtw', 'mi', 'hybrid')
            plot: Whether to generate plots
            save_path: Optional path to save the plot
            export_segments: Whether to detect and export force segments to CSV
            force_threshold: Minimum force value to consider as "active" (default: 1.0)
            smooth_window: Window size for moving average smoothing (default: 5)

        Returns:
            results: Dictionary with alignment results
        """
        # Load data - choose between VRS or MPS CSV
        if self.mps_csv_path:
            self.load_aria_data_from_mps_csv()
        else:
            self.load_aria_data()
        self.load_haptic_data()

        # Find optimal offset
        self.find_optimal_offset(max_offset=max_offset, method=method)

        # Detect segments first (before plotting)
        segments = None
        if export_segments:
            segments = self.detect_force_segments(
                force_threshold=force_threshold,
                smooth_window=smooth_window
            )

            # Generate CSV path from plot path
            if save_path:
                from pathlib import Path
                csv_path = str(Path(save_path).with_suffix('.csv').with_name(
                    Path(save_path).stem + '_segments.csv'
                ))
            else:
                csv_path = 'segments.csv'

            self.export_segments_csv(segments, csv_path)

        # Plot results with segment markers
        if plot:
            self.plot_alignment(save_path=save_path, segments=segments)

        return {
            'optimal_offset': self.optimal_offset,
            'max_similarity': np.max(self.correlation_scores),
            'method': method,
            'aria_time_range': (self.aria_timestamps[0], self.aria_timestamps[-1]),
            'haptic_time_range': (self.haptic_timestamps[0], self.haptic_timestamps[-1]),
            'segments': segments,
        }


def main():
    """
    Example usage with command line arguments.
    """
    import argparse
    from pathlib import Path

    parser = argparse.ArgumentParser(description='Align Aria and haptic sensor data')
    parser.add_argument('vrs_path', help='Path to VRS file')
    parser.add_argument('haptic_csv', help='Path to haptic CSV file')
    parser.add_argument('--max-offset', type=float, default=5.0, help='Maximum offset to search (seconds)')
    parser.add_argument('--method', default='xcorr', choices=['pearson', 'xcorr', 'dtw', 'mi', 'hybrid'],
                       help='Alignment method')
    parser.add_argument('--no-plot', action='store_true', help='Disable plotting')
    parser.add_argument('--no-segments', action='store_true', help='Disable segment detection and export')
    parser.add_argument('--force-threshold', type=float, default=1.0,
                       help='Force threshold for segment detection (default: 1.0)')
    parser.add_argument('--smooth-window', type=int, default=5,
                       help='Smoothing window size for noise reduction (default: 5)')
    parser.add_argument('--output-dir', help='Output directory for plot (default: same as VRS file)')

    args = parser.parse_args()

    # Determine output path using VRS filename
    vrs_path = Path(args.vrs_path)
    vrs_name = vrs_path.stem  # filename without extension

    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = vrs_path.parent / "aria_haptic_alignment"

    output_dir.mkdir(parents=True, exist_ok=True)
    save_path = output_dir / f"{vrs_name}_alignment.png"

    # Create aligner and run
    aligner = AriaHapticAligner(str(vrs_path), args.haptic_csv)
    results = aligner.run(
        max_offset=args.max_offset,
        method=args.method,
        plot=not args.no_plot,
        save_path=str(save_path) if not args.no_plot else None,
        export_segments=not args.no_segments,
        force_threshold=args.force_threshold,
        smooth_window=args.smooth_window
    )

    print("\n=== Summary ===")
    for key, value in results.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()