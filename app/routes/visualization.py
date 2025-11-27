"""
Visualization routes - Handle data visualization functionality
"""

import os
import json
from flask import Blueprint, render_template, request, jsonify, current_app
from werkzeug.utils import secure_filename
import plotly.graph_objects as go

from aria_haptic_align import AriaHapticAligner, ARIA_API_AVAILABLE
from app.utils.file_utils import allowed_file


bp = Blueprint('visualization', __name__, url_prefix='/visualize')


@bp.route('/')
def index():
    """Render data visualization page"""
    return render_template('visualize.html', aria_api_available=ARIA_API_AVAILABLE)


@bp.route('/data', methods=['POST'])
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
            mps_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(mps_file.filename))
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
            haptic_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(haptic_file.filename))
            haptic_file.save(haptic_path)

            # Load data
            aligner = AriaHapticAligner(mps_csv_path=None, haptic_csv_path=haptic_path)
            aligner.load_haptic_data()

            print(f"Loaded Haptic data: {len(aligner.haptic_timestamps)} points")
            print(f"Time range: {aligner.haptic_timestamps[0]} to {aligner.haptic_timestamps[-1]}")
            print(f"Force range: {aligner.haptic_force.min()} to {aligner.haptic_force.max()}")

            # Prepare sensor data for frontend
            sensor_data = {}
            available_sensors = []

            if hasattr(aligner, 'haptic_sensors') and aligner.haptic_sensors:
                for sensor_name, axes_data in aligner.haptic_sensors.items():
                    available_sensors.append(sensor_name)
                    sensor_data[sensor_name] = {
                        'Fx': axes_data['Fx'].tolist(),
                        'Fy': axes_data['Fy'].tolist(),
                        'Fz': axes_data['Fz'].tolist(),
                        'Total': axes_data['Total'].tolist()
                    }
                print(f"Available sensors: {available_sensors}")
            else:
                print("No multi-axis sensor data available")

            # Create initial plot with default sensors (all available)
            fig = go.Figure()

            # Define colors for different axes
            axis_colors = {
                'Fx': '#ff6b6b',  # Red
                'Fy': '#51cf66',  # Green
                'Fz': '#339af0',  # Blue
                'Total': '#f59e0b'  # Orange
            }

            # If multi-sensor data is available, plot all sensors' Total force by default
            if sensor_data:
                for sensor_name in available_sensors:
                    fig.add_trace(go.Scatter(
                        x=aligner.haptic_timestamps.tolist(),
                        y=sensor_data[sensor_name]['Total'],
                        mode='lines',
                        name=f'{sensor_name} - Total',
                        line=dict(width=2),
                        visible=True
                    ))
            else:
                # Fallback to legacy single force trace
                fig.add_trace(go.Scatter(
                    x=aligner.haptic_timestamps.tolist(),
                    y=aligner.haptic_force.tolist(),
                    mode='lines',
                    name='Force Magnitude',
                    line=dict(color='#f56565', width=2)
                ))

            fig.update_layout(
                title='Haptic Sensor Data - Multi-Axis View',
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
                'force_range': [float(aligner.haptic_force.min()), float(aligner.haptic_force.max())],
                'sensor_data': sensor_data,
                'available_sensors': available_sensors,
                'timestamps': aligner.haptic_timestamps.tolist()
            })

        else:
            return jsonify({'error': 'Invalid file type'}), 400

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500

