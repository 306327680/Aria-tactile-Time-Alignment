"""
Player routes - Handle data playback functionality
"""

import os
import numpy as np
from flask import Blueprint, render_template, request, jsonify, current_app
from werkzeug.utils import secure_filename

from aria_haptic_align import AriaHapticAligner, ARIA_API_AVAILABLE
from app.utils.mps_loader import load_hand_landmarks
from app.utils.file_utils import allowed_file


bp = Blueprint('player', __name__, url_prefix='/player')


@bp.route('/')
def index():
    """Render data player page"""
    return render_template('player.html', aria_api_available=ARIA_API_AVAILABLE)


@bp.route('/data', methods=['POST'])
def player_data():
    """Load data for player view"""
    try:
        # Check files
        if 'mps_file' not in request.files or 'haptic_file' not in request.files:
            return jsonify({'error': 'Missing MPS or haptic CSV file'}), 400

        mps_file = request.files['mps_file']
        haptic_file = request.files['haptic_file']
        offset = float(request.form.get('offset', 0))

        if mps_file.filename == '' or haptic_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Save files
        mps_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(mps_file.filename))
        haptic_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(haptic_file.filename))
        mps_file.save(mps_path)
        haptic_file.save(haptic_path)

        # Load data
        aligner = AriaHapticAligner(mps_csv_path=mps_path, haptic_csv_path=haptic_path)
        aligner.load_aria_data_from_mps_csv()
        aligner.load_haptic_data()

        # Normalize data
        aria_range = aligner.aria_distance.max() - aligner.aria_distance.min()
        if aria_range > 0:
            aria_norm = (aligner.aria_distance - aligner.aria_distance.min()) / aria_range
        else:
            aria_norm = np.zeros_like(aligner.aria_distance)
        aria_inverted = 1.0 - aria_norm

        haptic_range = aligner.haptic_force.max() - aligner.haptic_force.min()
        if haptic_range > 0:
            haptic_norm = (aligner.haptic_force - aligner.haptic_force.min()) / haptic_range
        else:
            haptic_norm = np.zeros_like(aligner.haptic_force)

        # Apply offset to haptic timestamps
        haptic_timestamps_aligned = aligner.haptic_timestamps + offset

        # Calculate combined time range
        combined_min = min(aligner.aria_timestamps[0], haptic_timestamps_aligned[0])
        combined_max = max(aligner.aria_timestamps[-1], haptic_timestamps_aligned[-1])

        # Load full hand landmarks data from MPS CSV
        hand_landmarks_data = load_hand_landmarks(mps_path)

        # Get original haptic force range for denormalization in frontend
        haptic_force_range = [float(aligner.haptic_force.min()), float(aligner.haptic_force.max())]

        return jsonify({
            'aria_timestamps': aligner.aria_timestamps.tolist(),
            'aria_normalized': aria_inverted.tolist(),
            'haptic_timestamps': aligner.haptic_timestamps.tolist(),
            'haptic_timestamps_aligned': haptic_timestamps_aligned.tolist(),
            'haptic_normalized': haptic_norm.tolist(),
            'haptic_force_range': haptic_force_range,
            'aria_count': len(aligner.aria_timestamps),
            'haptic_count': len(aligner.haptic_timestamps),
            'time_range': [float(combined_min), float(combined_max)],
            'aria_time_range': [float(aligner.aria_timestamps[0]), float(aligner.aria_timestamps[-1])],
            'haptic_time_range': [float(aligner.haptic_timestamps[0]), float(aligner.haptic_timestamps[-1])],
            'offset': offset,
            'hand_landmarks': hand_landmarks_data
        })

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500

