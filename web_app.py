#!/usr/bin/env python3
"""
Aria-Haptic Alignment Web Application

A Flask-based web interface for aligning Aria hand tracking data
with haptic sensor data through an interactive browser interface.

Dependencies:
    - aria_api (optional): For VRS file processing
                          Installation: https://github.com/306327680/Aria-Vrs-Mps-api
    - Flask, Plotly: For web interface and visualization
    - NumPy, Pandas, SciPy: For data processing
"""

import os
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
import tempfile
import shutil
from aria_haptic_align import AriaHapticAligner, ARIA_API_AVAILABLE
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import numpy as np
import pandas as pd

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size
app.config['UPLOAD_FOLDER'] = tempfile.mkdtemp()

ALLOWED_EXTENSIONS = {'vrs', 'csv'}

# Check required dependencies
DEPENDENCIES_OK = True
MISSING_DEPS = []

try:
    import flask
except ImportError:
    DEPENDENCIES_OK = False
    MISSING_DEPS.append('flask')

try:
    import plotly
except ImportError:
    DEPENDENCIES_OK = False
    MISSING_DEPS.append('plotly')

try:
    import scipy
except ImportError:
    DEPENDENCIES_OK = False
    MISSING_DEPS.append('scipy')


def allowed_file(filename, extensions):
    """Check if file has allowed extension"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions


def create_plotly_figure(aligner, segments=None):
    """
    Create interactive Plotly figure for alignment visualization.

    Args:
        aligner: AriaHapticAligner instance with alignment results
        segments: Optional list of (split_time, segment_index) tuples

    Returns:
        Plotly figure as JSON
    """
    print(f"DEBUG: Creating plotly figure")
    print(f"DEBUG: Aria data points: {len(aligner.aria_timestamps)}")
    print(f"DEBUG: Haptic data points: {len(aligner.haptic_timestamps)}")
    print(f"DEBUG: Aria time range: {aligner.aria_timestamps[0]:.3f} - {aligner.aria_timestamps[-1]:.3f}")
    print(f"DEBUG: Haptic time range: {aligner.haptic_timestamps[0]:.3f} - {aligner.haptic_timestamps[-1]:.3f}")
    print(f"DEBUG: Aria distance range: {aligner.aria_distance.min():.6f} - {aligner.aria_distance.max():.6f}")
    print(f"DEBUG: Haptic force range: {aligner.haptic_force.min():.6f} - {aligner.haptic_force.max():.6f}")

    # Check for valid data
    if len(aligner.aria_timestamps) == 0 or len(aligner.haptic_timestamps) == 0:
        raise ValueError("Empty data arrays provided")

    # Normalize signals with safety checks
    aria_distance_range = aligner.aria_distance.max() - aligner.aria_distance.min()
    haptic_force_range = aligner.haptic_force.max() - aligner.haptic_force.min()

    if aria_distance_range <= 0:
        print(f"WARNING: Aria distance range is zero or negative: {aria_distance_range}")
        aria_norm = np.zeros_like(aligner.aria_distance)
    else:
        aria_norm = (aligner.aria_distance - aligner.aria_distance.min()) / aria_distance_range

    if haptic_force_range <= 0:
        print(f"WARNING: Haptic force range is zero or negative: {haptic_force_range}")
        haptic_norm = np.zeros_like(aligner.haptic_force)
    else:
        haptic_norm = (aligner.haptic_force - aligner.haptic_force.min()) / haptic_force_range

    # Check for NaN values
    if np.any(np.isnan(aria_norm)) or np.any(np.isnan(haptic_norm)):
        print("WARNING: NaN values detected in normalized data")
        aria_norm = np.nan_to_num(aria_norm, nan=0.0)
        haptic_norm = np.nan_to_num(haptic_norm, nan=0.0)

    aria_inverted = 1.0 - aria_norm

    print(f"DEBUG: Normalization complete")
    print(f"DEBUG: Aria norm range: {aria_norm.min():.3f} - {aria_norm.max():.3f}")
    print(f"DEBUG: Haptic norm range: {haptic_norm.min():.3f} - {haptic_norm.max():.3f}")

    # Create subplots
    fig = make_subplots(
        rows=3, cols=1,
        subplot_titles=(
            'Before Alignment',
            f'After Alignment (offset = {aligner.optimal_offset:.3f}s)',
            'Similarity Score vs Time Offset'
        ),
        vertical_spacing=0.12,
        row_heights=[0.35, 0.35, 0.30]
    )

    # Plot 1: Before alignment
    print(f"DEBUG: Adding Plot 1 traces")
    print(f"DEBUG: Aria trace - x length: {len(aligner.aria_timestamps)}, y length: {len(aria_inverted)}")
    print(f"DEBUG: Haptic trace - x length: {len(aligner.haptic_timestamps)}, y length: {len(haptic_norm)}")

    # Check data ranges for overlap
    aria_time_min, aria_time_max = aligner.aria_timestamps[0], aligner.aria_timestamps[-1]
    haptic_time_min, haptic_time_max = aligner.haptic_timestamps[0], aligner.haptic_timestamps[-1]
    print(f"DEBUG: Time overlap check: Aria [{aria_time_min:.2f}, {aria_time_max:.2f}], Haptic [{haptic_time_min:.2f}, {haptic_time_max:.2f}]")

    # Convert to lists to ensure compatibility
    aria_x = aligner.aria_timestamps.tolist() if hasattr(aligner.aria_timestamps, 'tolist') else list(aligner.aria_timestamps)
    aria_y = aria_inverted.tolist() if hasattr(aria_inverted, 'tolist') else list(aria_inverted)
    haptic_x = aligner.haptic_timestamps.tolist() if hasattr(aligner.haptic_timestamps, 'tolist') else list(aligner.haptic_timestamps)
    haptic_y = haptic_norm.tolist() if hasattr(haptic_norm, 'tolist') else list(haptic_norm)

    print(f"DEBUG: Converted arrays to lists - aria_x: {len(aria_x)}, aria_y: {len(aria_y)}, haptic_x: {len(haptic_x)}, haptic_y: {len(haptic_y)}")

    fig.add_trace(
        go.Scatter(
            x=aria_x,
            y=aria_y,
            name='Aria (inverted distance)',
            line=dict(color='blue', width=2),
            mode='lines'
        ),
        row=1, col=1
    )
    print(f"DEBUG: Added Aria trace to Plot 1")

    fig.add_trace(
        go.Scatter(
            x=haptic_x,
            y=haptic_y,
            name='Haptic (force)',
            line=dict(color='red', width=2),
            mode='lines'
        ),
        row=1, col=1
    )
    print(f"DEBUG: Plot 1 traces added successfully")

    # Plot 2: After alignment
    haptic_aligned_x = (aligner.haptic_timestamps + aligner.optimal_offset).tolist() if hasattr(aligner.haptic_timestamps, 'tolist') else list(aligner.haptic_timestamps + aligner.optimal_offset)

    fig.add_trace(
        go.Scatter(
            x=aria_x,
            y=aria_y,
            name='Aria (inverted distance)',
            line=dict(color='blue', width=2),
            mode='lines',
            showlegend=False
        ),
        row=2, col=1
    )
    print(f"DEBUG: Added Aria trace to Plot 2")

    fig.add_trace(
        go.Scatter(
            x=haptic_aligned_x,
            y=haptic_y,
            name=f'Haptic (offset +{aligner.optimal_offset:.3f}s)',
            line=dict(color='red', width=2),
            mode='lines',
            showlegend=False
        ),
        row=2, col=1
    )
    print(f"DEBUG: Added Haptic trace to Plot 2 (aligned)")

    # Add segment split lines
    if segments:
        for i, (split_time, idx) in enumerate(segments):
            fig.add_vline(
                x=split_time,
                line=dict(color='red', dash='dash', width=1),
                row=2, col=1
            )

    # Plot 3: Correlation curve
    offsets_list = aligner.search_offsets.tolist() if hasattr(aligner.search_offsets, 'tolist') else list(aligner.search_offsets)
    scores_list = aligner.correlation_scores.tolist() if hasattr(aligner.correlation_scores, 'tolist') else list(aligner.correlation_scores)

    print(f"DEBUG: Adding Plot 3 - offsets length: {len(offsets_list)}, scores length: {len(scores_list)}")

    fig.add_trace(
        go.Scatter(
            x=offsets_list,
            y=scores_list,
            name='Similarity score',
            line=dict(color='green', width=2),
            mode='lines',
            showlegend=False
        ),
        row=3, col=1
    )
    print(f"DEBUG: Added correlation curve to Plot 3")
    fig.add_vline(
        x=aligner.optimal_offset,
        line=dict(color='red', dash='dash'),
        row=3, col=1
    )

    # Update axes labels and ranges
    # For Plot 1 (Before Alignment), set x-axis range to encompass both signals
    x_min_plot1 = min(aligner.aria_timestamps[0], aligner.haptic_timestamps[0])
    x_max_plot1 = max(aligner.aria_timestamps[-1], aligner.haptic_timestamps[-1])

    print(f"DEBUG: Plot 1 x-axis range: [{x_min_plot1:.2f}, {x_max_plot1:.2f}]")

    # For Plot 2 (After Alignment), set x-axis range to encompass both aligned signals
    haptic_aligned_min = aligner.haptic_timestamps[0] + aligner.optimal_offset
    haptic_aligned_max = aligner.haptic_timestamps[-1] + aligner.optimal_offset
    x_min_plot2 = min(aligner.aria_timestamps[0], haptic_aligned_min)
    x_max_plot2 = max(aligner.aria_timestamps[-1], haptic_aligned_max)

    print(f"DEBUG: Plot 2 x-axis range: [{x_min_plot2:.2f}, {x_max_plot2:.2f}]")

    fig.update_xaxes(title_text="Time (s)", row=1, col=1, range=[x_min_plot1, x_max_plot1])
    fig.update_xaxes(title_text="Time (s)", row=2, col=1, range=[x_min_plot2, x_max_plot2])
    fig.update_xaxes(title_text="Time Offset (s)", row=3, col=1)

    fig.update_yaxes(title_text="Normalized Value", row=1, col=1, range=[-0.05, 1.05])
    fig.update_yaxes(title_text="Normalized Value", row=2, col=1, range=[-0.05, 1.05])
    fig.update_yaxes(title_text="Similarity Score", row=3, col=1)

    # Update layout
    fig.update_layout(
        height=1000,
        showlegend=True,
        template='plotly_white',
        hovermode='x unified',
        autosize=True,
        margin=dict(l=50, r=50, t=80, b=50)
    )

    print(f"DEBUG: Final figure creation complete")
    print(f"DEBUG: Number of traces: {len(fig.data)}")
    for i, trace in enumerate(fig.data):
        if len(trace.x) > 0 and len(trace.y) > 0:
            print(f"DEBUG: Trace {i} - {trace.name}: x length={len(trace.x)}, x=[{trace.x[0]:.2f}, {trace.x[-1]:.2f}], y length={len(trace.y)}, y=[{trace.y[0]:.3f}, {trace.y[-1]:.3f}]")
        else:
            print(f"WARNING: Trace {i} - {trace.name}: EMPTY DATA - x length={len(trace.x)}, y length={len(trace.y)}")

    fig_json = json.loads(fig.to_json())
    print(f"DEBUG: Figure JSON created successfully")

    return fig_json


@app.route('/')
def index():
    """Render main page"""
    return render_template('index.html', aria_api_available=ARIA_API_AVAILABLE)


@app.route('/visualize')
def visualize():
    """Render data visualization page"""
    return render_template('visualize.html', aria_api_available=ARIA_API_AVAILABLE)


@app.route('/align', methods=['POST'])
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
        aria_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(aria_file.filename))
        haptic_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(haptic_file.filename))

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


@app.route('/download_segments', methods=['POST'])
def download_segments():
    """Download segments CSV file"""
    try:
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


@app.route('/visualize_data', methods=['POST'])
def visualize_data():
    """Process and visualize data files"""
    try:
        file_type = request.form.get('file_type', 'mps')  # 'mps' or 'haptic'

        if file_type == 'mps':
            # Visualize MPS CSV
            if 'mps_file' not in request.files:
                return jsonify({'error': 'Missing MPS CSV file'}), 400

            mps_file = request.files['mps_file']
            if mps_file.filename == '':
                return jsonify({'error': 'No MPS CSV file selected'}), 400

            if not allowed_file(mps_file.filename, {'csv'}):
                return jsonify({'error': 'MPS file must have .csv extension'}), 400

            # Save file
            mps_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(mps_file.filename))
            mps_file.save(mps_path)

            # Load data
            aligner = AriaHapticAligner(mps_csv_path=mps_path, haptic_csv_path=None)
            aligner.load_aria_data_from_mps_csv()

            # Convert distance from meters to centimeters
            distance_cm = aligner.aria_distance * 100

            print(f"Loaded MPS data: {len(aligner.aria_timestamps)} points")
            print(f"Time range: {aligner.aria_timestamps[0]} to {aligner.aria_timestamps[-1]}")
            print(f"Distance range: {distance_cm.min():.2f}cm to {distance_cm.max():.2f}cm")

            # Create plot
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=aligner.aria_timestamps.tolist(),
                y=distance_cm.tolist(),
                mode='lines',
                name='Thumb-Index Distance',
                line=dict(color='#667eea', width=2)
            ))

            # Update x-axis title to indicate normalized time
            fig.update_layout(
                title='MPS Hand Tracking Data - Thumb-Index Distance',
                xaxis_title='Time (seconds, normalized from start)',
                yaxis_title='Distance (cm)',
                template='plotly_white',
                hovermode='x unified',
                height=600,
                autosize=True
            )

            print(f"Figure created with {len(fig.data)} traces")

            # Use original time range for statistics if available, otherwise use normalized
            if hasattr(aligner, 'mps_original_time_range'):
                display_time_range = aligner.mps_original_time_range
                time_display_note = "Original time range"
            else:
                display_time_range = [float(aligner.aria_timestamps[0]), float(aligner.aria_timestamps[-1])]
                time_display_note = "Normalized time range"

            print(f"Display time range ({time_display_note}): {display_time_range[0]:.2f}s to {display_time_range[1]:.2f}s")

            return jsonify({
                'plotly_json': json.loads(fig.to_json()),
                'sample_count': len(aligner.aria_timestamps),
                'time_range': display_time_range,
                'time_display_note': time_display_note,
                'distance_range': [float(distance_cm.min()), float(distance_cm.max())],
                'total_frames': int(aligner.mps_total_frames),
                'valid_frames': int(aligner.mps_valid_frames),
                'success_rate': float(aligner.mps_success_rate) if aligner.mps_success_rate is not None else None,
                'avg_confidence': float(aligner.mps_avg_confidence) if aligner.mps_avg_confidence is not None else None,
                'min_confidence': float(aligner.mps_min_confidence) if aligner.mps_min_confidence is not None else None,
                'max_confidence': float(aligner.mps_max_confidence) if aligner.mps_max_confidence is not None else None
            })

        elif file_type == 'haptic':
            # Visualize Haptic CSV
            if 'haptic_file' not in request.files:
                return jsonify({'error': 'Missing haptic CSV file'}), 400

            haptic_file = request.files['haptic_file']
            if haptic_file.filename == '':
                return jsonify({'error': 'No haptic CSV file selected'}), 400

            if not allowed_file(haptic_file.filename, {'csv'}):
                return jsonify({'error': 'Haptic file must have .csv extension'}), 400

            # Save file
            haptic_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(haptic_file.filename))
            haptic_file.save(haptic_path)

            # Load data
            aligner = AriaHapticAligner(mps_csv_path=None, haptic_csv_path=haptic_path)
            aligner.load_haptic_data()

            print(f"Loaded Haptic data: {len(aligner.haptic_timestamps)} points")
            print(f"Time range: {aligner.haptic_timestamps[0]} to {aligner.haptic_timestamps[-1]}")
            print(f"Force range: {aligner.haptic_force.min()} to {aligner.haptic_force.max()}")

            # Create plot
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=aligner.haptic_timestamps.tolist(),
                y=aligner.haptic_force.tolist(),
                mode='lines',
                name='Force Magnitude',
                line=dict(color='#f56565', width=2)
            ))

            fig.update_layout(
                title='Haptic Sensor Data - Force Magnitude',
                xaxis_title='Time (seconds)',
                yaxis_title='Force (N)',
                template='plotly_white',
                hovermode='x unified',
                height=600,
                autosize=True
            )

            print(f"Figure created with {len(fig.data)} traces")

            return jsonify({
                'plotly_json': json.loads(fig.to_json()),
                'sample_count': len(aligner.haptic_timestamps),
                'time_range': [float(aligner.haptic_timestamps[0]), float(aligner.haptic_timestamps[-1])],
                'force_range': [float(aligner.haptic_force.min()), float(aligner.haptic_force.max())]
            })

        else:
            return jsonify({'error': 'Invalid file type'}), 400

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500


@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy'})


if __name__ == '__main__':
    # Create upload folder if it doesn't exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    print("=" * 60)
    print("Aria-Haptic Alignment Web Application")
    print("=" * 60)

    # Check dependencies
    if MISSING_DEPS:
        print("⚠️  WARNING: Missing dependencies:")
        for dep in MISSING_DEPS:
            print(f"   - {dep}")
        print("Please install missing packages: pip install -r requirements.txt")
        print("=" * 60)
        exit(1)

    # Check aria_api availability
    if ARIA_API_AVAILABLE:
        print("✅ aria_api: Available")
    else:
        print("⚠️  aria_api: NOT AVAILABLE")
        print("   VRS file processing will not work.")
        print("   To enable full functionality:")
        print("   Installation: https://github.com/306327680/Aria-Vrs-Mps-api")
        print("   Alternatively, you can use MPS CSV files instead of VRS files")

    print("-" * 60)
    print(f"🌐 Server starting at: http://localhost:5001")
    print(f"📁 Upload folder: {app.config['UPLOAD_FOLDER']}")
    print("🛑 Press Ctrl+C to stop the server")
    print("=" * 60)

    # Use port 5001 to avoid conflicts with macOS AirPlay Receiver (port 5000)
    app.run(debug=True, host='0.0.0.0', port=5001)
