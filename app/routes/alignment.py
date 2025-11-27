"""
Alignment routes - Handle data alignment功能
"""

import os
from flask import Blueprint, render_template, request, jsonify, current_app
from werkzeug.utils import secure_filename
import pandas as pd
import numpy as np

from aria_haptic_align import AriaHapticAligner, ARIA_API_AVAILABLE
from app.utils.plotly_helper import create_plotly_figure
from app.utils.file_utils import allowed_file


bp = Blueprint('alignment', __name__)


@bp.route('/')
def index():
    """Render main alignment page"""
    return render_template('index.html', aria_api_available=ARIA_API_AVAILABLE)


@bp.route('/align', methods=['POST'])
def align():
    """Process alignment request"""
    try:
        # Check which mode: VRS or MPS CSV
        use_mps_csv = request.form.get('use_mps_csv', 'false').lower() == 'true'

        # Check if haptic CSV file is present
        if 'haptic_file' not in request.files:
            return jsonify({'error': 'Missing haptic CSV file'}), 400

        haptic_file = request.files['haptic_file']

        if haptic_file.filename == '':
            return jsonify({'error': 'No haptic CSV file selected'}), 400

        if not allowed_file(haptic_file.filename, {'csv'}):
            return jsonify({'error': 'Haptic file must have .csv extension'}), 400

        # Check Aria data file based on mode
        if use_mps_csv:
            # MPS CSV mode
            if 'mps_file' not in request.files:
                return jsonify({'error': 'Missing MPS CSV file'}), 400

            aria_file = request.files['mps_file']

            if aria_file.filename == '':
                return jsonify({'error': 'No MPS CSV file selected'}), 400

            if not allowed_file(aria_file.filename, {'csv'}):
                return jsonify({'error': 'MPS file must have .csv extension'}), 400
        else:
            # VRS mode
            if 'vrs_file' not in request.files:
                return jsonify({'error': 'Missing VRS file'}), 400

            aria_file = request.files['vrs_file']

            if aria_file.filename == '':
                return jsonify({'error': 'No VRS file selected'}), 400

            if not allowed_file(aria_file.filename, {'vrs'}):
                return jsonify({'error': 'VRS file must have .vrs extension'}), 400

        # Get parameters
        max_offset = float(request.form.get('max_offset', 5.0))
        method = request.form.get('method', 'xcorr')
        force_threshold = float(request.form.get('force_threshold', 1.0))
        smooth_window = int(request.form.get('smooth_window', 5))
        export_segments = request.form.get('export_segments', 'true').lower() == 'true'

        # Save uploaded files to temp directory
        aria_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(aria_file.filename))
        haptic_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(haptic_file.filename))

        aria_file.save(aria_path)
        haptic_file.save(haptic_path)

        # Run alignment based on mode
        if use_mps_csv:
            # Create aligner with MPS CSV
            aligner = AriaHapticAligner(mps_csv_path=aria_path, haptic_csv_path=haptic_path)
            aligner.load_aria_data_from_mps_csv()
        else:
            # Create aligner with VRS
            aligner = AriaHapticAligner(vrs_path=aria_path, haptic_csv_path=haptic_path)
            aligner.load_aria_data()

        aligner.load_haptic_data()
        aligner.find_optimal_offset(max_offset=max_offset, method=method)

        # Detect segments
        segments = None
        csv_data = None
        if export_segments:
            segments = aligner.detect_force_segments(
                force_threshold=force_threshold,
                smooth_window=smooth_window
            )

            # Convert segments to DataFrame for export
            if segments:
                csv_data = pd.DataFrame([
                    {
                        'split_index': idx,
                        'split_time_s': f'{split_time:.3f}',
                        'before_segment': idx,
                        'after_segment': idx + 1
                    }
                    for split_time, idx in segments
                ]).to_csv(index=False)

        # Create plotly figure
        plotly_json = create_plotly_figure(aligner, segments)

        # Prepare normalized data for interactive slider
        aria_norm = (aligner.aria_distance - aligner.aria_distance.min()) / \
                    (aligner.aria_distance.max() - aligner.aria_distance.min())
        aria_inverted = 1.0 - aria_norm

        haptic_norm = (aligner.haptic_force - aligner.haptic_force.min()) / \
                      (aligner.haptic_force.max() - aligner.haptic_force.min())

        # Prepare results
        results = {
            'optimal_offset': float(aligner.optimal_offset),
            'max_similarity': float(np.max(aligner.correlation_scores)),
            'method': method,
            'aria_time_range': [float(aligner.aria_timestamps[0]), float(aligner.aria_timestamps[-1])],
            'haptic_time_range': [float(aligner.haptic_timestamps[0]), float(aligner.haptic_timestamps[-1])],
            'aria_sample_count': len(aligner.aria_timestamps),
            'haptic_sample_count': len(aligner.haptic_timestamps),
            'segment_count': len(segments) if segments else 0,
            'plotly_json': plotly_json,
            'segments_csv': csv_data,
            # Additional data for interactive slider
            'aria_timestamps': aligner.aria_timestamps.tolist(),
            'aria_normalized': aria_inverted.tolist(),
            'haptic_timestamps': aligner.haptic_timestamps.tolist(),
            'haptic_normalized': haptic_norm.tolist(),
            'offsets': aligner.search_offsets.tolist(),
            'correlation_scores': aligner.correlation_scores.tolist(),
            'max_offset': max_offset,
            'segments': [{'time': float(t), 'index': int(idx)} for t, idx in segments] if segments else []
        }

        return jsonify(results)

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500


@bp.route('/download_segments', methods=['POST'])
def download_segments():
    """Download segments CSV file"""
    try:
        from flask import send_file
        import tempfile

        csv_data = request.json.get('csv_data')
        if not csv_data:
            return jsonify({'error': 'No CSV data provided'}), 400

        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
        temp_file.write(csv_data)
        temp_file.close()

        return send_file(
            temp_file.name,
            as_attachment=True,
            download_name='alignment_segments.csv',
            mimetype='text/csv'
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500
