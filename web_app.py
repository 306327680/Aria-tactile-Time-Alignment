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
import sys
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
import tempfile
import shutil
import threading
import uuid
import time as time_module
from aria_haptic_align import AriaHapticAligner, ARIA_API_AVAILABLE
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import numpy as np
import pandas as pd

# Get the base directory
base_dir = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
            static_folder=os.path.join(base_dir, 'app', 'static'),
            template_folder=os.path.join(base_dir, 'templates'))
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024  # 2GB max file size
app.config['UPLOAD_FOLDER'] = tempfile.mkdtemp()

ALLOWED_EXTENSIONS = {'vrs', 'csv', 'stl', 'step', 'stp', 'urdf', 'xml'}

# --- Aria-to-Lerobot 动态导入 ---
def _get_aria2lerobot_convert():
    """动态导入 Aria-to-Lerobot 的 convert 函数（目录名含连字符，无法直接 import）"""
    import importlib.util
    pkg_dir = os.path.join(os.path.dirname(base_dir), 'Aria-to-Lerobot')
    init_path = os.path.join(pkg_dir, '__init__.py')
    if not os.path.exists(init_path):
        raise ImportError(f"Aria-to-Lerobot package not found at {pkg_dir}")
    if 'aria2lerobot' not in sys.modules:
        spec = importlib.util.spec_from_file_location(
            'aria2lerobot', init_path,
            submodule_search_locations=[pkg_dir])
        mod = importlib.util.module_from_spec(spec)
        sys.modules['aria2lerobot'] = mod
        spec.loader.exec_module(mod)
    return sys.modules['aria2lerobot'].convert

# --- 转换任务追踪 ---
_conversion_jobs = {}
_conversion_lock = threading.Lock()

def _run_conversion_worker(job_id, convert_kwargs):
    """后台线程：运行 Aria-to-Lerobot 转换"""
    with _conversion_lock:
        _conversion_jobs[job_id]['status'] = 'running'
    try:
        convert_fn = _get_aria2lerobot_convert()
        result = convert_fn(**convert_kwargs)
        with _conversion_lock:
            _conversion_jobs[job_id].update(
                status='completed', result=result, end_time=time_module.time())
    except Exception as e:
        import traceback
        with _conversion_lock:
            _conversion_jobs[job_id].update(
                status='failed', error=str(e),
                traceback_str=traceback.format_exc(), end_time=time_module.time())

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


def create_plotly_figure(aligner, segments=None, force_max_threshold=None, view_window=30.0):
    """
    Create interactive Plotly figure for alignment visualization.

    Args:
        aligner: AriaHapticAligner instance with alignment results
        segments: Optional list of (split_time, segment_index) tuples
        force_max_threshold: Optional max force threshold - values above this are not displayed

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
    if force_max_threshold:
        print(f"DEBUG: Force max threshold: {force_max_threshold}")

    # Check for valid data
    if len(aligner.aria_timestamps) == 0 or len(aligner.haptic_timestamps) == 0:
        raise ValueError("Empty data arrays provided")

    # Create a copy of haptic force for display (mask values above threshold)
    haptic_force_display = aligner.haptic_force.copy()
    if force_max_threshold and force_max_threshold > 0:
        # Set values above threshold to NaN so they won't be displayed
        haptic_force_display = np.where(haptic_force_display <= force_max_threshold, haptic_force_display, np.nan)
        print(f"DEBUG: Masked {np.sum(np.isnan(haptic_force_display))} values above threshold")

    # Normalize signals with safety checks
    aria_distance_range = aligner.aria_distance.max() - aligner.aria_distance.min()

    # For haptic normalization, use threshold as max if provided
    if force_max_threshold and force_max_threshold > 0:
        haptic_min = 0  # Use 0 as min for force
        haptic_max = force_max_threshold  # Use threshold as max
    else:
        haptic_min = np.nanmin(haptic_force_display)
        haptic_max = np.nanmax(haptic_force_display)
    haptic_force_range = haptic_max - haptic_min

    if aria_distance_range <= 0:
        print(f"WARNING: Aria distance range is zero or negative: {aria_distance_range}")
        aria_norm = np.zeros_like(aligner.aria_distance)
    else:
        aria_norm = (aligner.aria_distance - aligner.aria_distance.min()) / aria_distance_range

    if haptic_force_range <= 0:
        print(f"WARNING: Haptic force range is zero or negative: {haptic_force_range}")
        haptic_norm = np.zeros_like(haptic_force_display)
    else:
        haptic_norm = (haptic_force_display - haptic_min) / haptic_force_range

    # Check for NaN values in aria_norm only (haptic NaN is intentional for threshold filtering)
    if np.any(np.isnan(aria_norm)):
        print("WARNING: NaN values detected in aria normalized data")
        aria_norm = np.nan_to_num(aria_norm, nan=0.0)

    aria_inverted = 1.0 - aria_norm

    # Count NaN values in haptic (these are intentional from threshold filtering)
    haptic_nan_count = np.sum(np.isnan(haptic_norm))
    print(f"DEBUG: Normalization complete")
    print(f"DEBUG: Aria norm range: {np.nanmin(aria_norm):.3f} - {np.nanmax(aria_norm):.3f}")
    print(f"DEBUG: Haptic norm range: {np.nanmin(haptic_norm):.3f} - {np.nanmax(haptic_norm):.3f} ({haptic_nan_count} NaN values filtered)")

    # Single subplot: After Alignment with rangeslider
    fig = make_subplots(
        rows=1, cols=1,
        subplot_titles=(
            f'After Alignment (对齐后, offset = {aligner.optimal_offset:.3f}s)',
        ),
        specs=[[{"secondary_y": True}]]
    )

    # Convert to lists
    aria_x = aligner.aria_timestamps.tolist() if hasattr(aligner.aria_timestamps, 'tolist') else list(aligner.aria_timestamps)
    aria_y_real = aligner.aria_distance.tolist() if hasattr(aligner.aria_distance, 'tolist') else list(aligner.aria_distance)
    haptic_aligned_x = (aligner.haptic_timestamps + aligner.optimal_offset).tolist() if hasattr(aligner.haptic_timestamps, 'tolist') else list(aligner.haptic_timestamps + aligner.optimal_offset)
    haptic_y_real = haptic_force_display.tolist() if hasattr(haptic_force_display, 'tolist') else list(haptic_force_display)

    fig.add_trace(
        go.Scatter(x=aria_x, y=aria_y_real, name='Aria距离(m)',
                   line=dict(color='blue', width=2), mode='lines'),
        row=1, col=1, secondary_y=False
    )
    fig.add_trace(
        go.Scatter(x=haptic_aligned_x, y=haptic_y_real,
                   name=f'触觉力(N)',
                   line=dict(color='red', width=2), mode='lines'),
        row=1, col=1, secondary_y=True
    )

    # X-axis with rangeslider for navigation
    haptic_aligned_min = aligner.haptic_timestamps[0] + aligner.optimal_offset
    haptic_aligned_max = aligner.haptic_timestamps[-1] + aligner.optimal_offset
    x_min = min(aligner.aria_timestamps[0], haptic_aligned_min)
    x_max = max(aligner.aria_timestamps[-1], haptic_aligned_max)
    total_duration = x_max - x_min
    visible_max = (x_min + view_window) if total_duration > view_window else x_max

    fig.update_xaxes(title_text="时间 (s)",
                     range=[x_min, visible_max],
                     rangeslider=dict(visible=True, thickness=0.10,
                                      range=[x_min, x_max]))

    # Y-axes
    aria_min, aria_max = float(np.min(aligner.aria_distance)), float(np.max(aligner.aria_distance))
    aria_padding = (aria_max - aria_min) * 0.05
    haptic_min = 0
    haptic_max_val = force_max_threshold if force_max_threshold and force_max_threshold > 0 else float(np.nanmax(haptic_force_display))
    haptic_padding = haptic_max_val * 0.05

    fig.update_yaxes(title_text="距离 (m)", title_font=dict(color='blue'), tickfont=dict(color='blue'),
                     range=[aria_min - aria_padding, aria_max + aria_padding], secondary_y=False)
    fig.update_yaxes(title_text="力 (N)", title_font=dict(color='red'), tickfont=dict(color='red'),
                     range=[haptic_min, haptic_max_val + haptic_padding], secondary_y=True)

    fig.update_layout(
        height=350,
        showlegend=True,
        legend=dict(
            orientation='h',
            yanchor='bottom',
            y=1.02,
            xanchor='right',
            x=1,
            font=dict(size=11)
        ),
        template='plotly_white',
        hovermode='x unified',
        dragmode='pan',
        autosize=True,
        margin=dict(l=50, r=50, t=30, b=30)
    )

    fig_json = json.loads(fig.to_json())
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
        force_max_threshold = float(request.form.get('force_max_threshold', 500.0))
        smooth_window = int(request.form.get('smooth_window', 5))
        export_segments = request.form.get('export_segments', 'true').lower() == 'true'
        view_window = float(request.form.get('view_window', 30.0))

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

        # Filter out force values above the max threshold
        if force_max_threshold > 0:
            mask = aligner.haptic_force <= force_max_threshold
            filtered_count = np.sum(~mask)
            if filtered_count > 0:
                print(f"Filtering {filtered_count} haptic samples with force > {force_max_threshold}N")
                # Replace values above threshold with NaN, then interpolate or use median
                aligner.haptic_force = np.where(mask, aligner.haptic_force, np.nan)
                # Fill NaN with interpolation
                valid_mask = ~np.isnan(aligner.haptic_force)
                if np.any(valid_mask):
                    aligner.haptic_force = np.interp(
                        np.arange(len(aligner.haptic_force)),
                        np.arange(len(aligner.haptic_force))[valid_mask],
                        aligner.haptic_force[valid_mask]
                    )
        aligner.find_optimal_offset(max_offset=max_offset, method=method)

        # Detect segments as start/end pairs
        segment_pairs = None
        csv_data = None
        if export_segments:
            segment_pairs = aligner.detect_force_segment_pairs(
                force_threshold=force_threshold,
                smooth_window=smooth_window
            )

            if segment_pairs:
                csv_data = pd.DataFrame(segment_pairs).to_csv(index=False)

        # Create plotly figure (segment shapes managed by frontend)
        plotly_json = create_plotly_figure(aligner, None, force_max_threshold, view_window)

        # Prepare normalized data for interactive slider
        aria_norm = (aligner.aria_distance - aligner.aria_distance.min()) / \
                    (aligner.aria_distance.max() - aligner.aria_distance.min())
        aria_inverted = 1.0 - aria_norm

        # For haptic normalization in slider, also apply threshold
        haptic_display = aligner.haptic_force.copy()
        if force_max_threshold > 0:
            haptic_display = np.where(haptic_display <= force_max_threshold, haptic_display, np.nan)
        haptic_min = 0
        haptic_max = force_max_threshold if force_max_threshold > 0 else np.nanmax(haptic_display)
        haptic_norm = (haptic_display - haptic_min) / (haptic_max - haptic_min)

        # Count filtered samples
        filtered_count = int(np.sum(np.isnan(haptic_norm))) if force_max_threshold > 0 else 0

        # Prepare results
        results = {
            'optimal_offset': float(aligner.optimal_offset),
            'max_similarity': float(np.max(aligner.correlation_scores)),
            'method': method,
            'aria_time_range': [float(aligner.aria_timestamps[0]), float(aligner.aria_timestamps[-1])],
            'haptic_time_range': [float(aligner.haptic_timestamps[0]), float(aligner.haptic_timestamps[-1])],
            'aria_sample_count': len(aligner.aria_timestamps),
            'haptic_sample_count': len(aligner.haptic_timestamps),
            'haptic_filtered_count': filtered_count,
            'force_max_threshold': force_max_threshold,
            'segment_count': len(segment_pairs) if segment_pairs else 0,
            'plotly_json': plotly_json,
            'segments_csv': csv_data,
            # Additional data for interactive slider
            'aria_timestamps': aligner.aria_timestamps.tolist(),
            'aria_normalized': aria_inverted.tolist(),
            'haptic_timestamps': aligner.haptic_timestamps.tolist(),
            'haptic_normalized': haptic_norm.tolist(),
            'haptic_thumb_force': aligner.haptic_thumb_force.tolist() if aligner.haptic_thumb_force is not None else [],
            'haptic_index_force': aligner.haptic_index_force.tolist() if aligner.haptic_index_force is not None else [],
            'offsets': aligner.search_offsets.tolist(),
            'correlation_scores': aligner.correlation_scores.tolist(),
            'max_offset': max_offset,
            'force_segments': segment_pairs if segment_pairs else []
        }

        return jsonify(results)

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500


@app.route('/align_from_path', methods=['POST'])
def align_from_path():
    """
    Process alignment request using server file paths.
    This is used when loading files from the data manager.
    """
    try:
        data = request.get_json()

        mps_csv_path = data.get('mps_csv_path')
        haptic_csv_path = data.get('haptic_csv_path')
        vrs_path = data.get('vrs_path')

        # Validate paths
        if not haptic_csv_path or not os.path.exists(haptic_csv_path):
            return jsonify({'error': f'Haptic CSV file not found: {haptic_csv_path}'}), 400

        use_mps_csv = mps_csv_path and os.path.exists(mps_csv_path)
        use_vrs = vrs_path and os.path.exists(vrs_path)

        if not use_mps_csv and not use_vrs:
            return jsonify({'error': 'Either MPS CSV or VRS file is required'}), 400

        # Get parameters
        max_offset = float(data.get('max_offset', 5.0))
        method = data.get('method', 'xcorr')
        force_threshold = float(data.get('force_threshold', 1.0))
        force_max_threshold = float(data.get('force_max_threshold', 500.0))
        smooth_window = int(data.get('smooth_window', 5))
        export_segments = data.get('export_segments', True)
        view_window = float(data.get('view_window', 30.0))

        # Run alignment based on available data
        if use_mps_csv:
            aligner = AriaHapticAligner(mps_csv_path=mps_csv_path, haptic_csv_path=haptic_csv_path)
            aligner.load_aria_data_from_mps_csv()
        else:
            aligner = AriaHapticAligner(vrs_path=vrs_path, haptic_csv_path=haptic_csv_path)
            aligner.load_aria_data()

        aligner.load_haptic_data()

        # Filter out force values above the max threshold
        if force_max_threshold > 0:
            mask = aligner.haptic_force <= force_max_threshold
            filtered_count = np.sum(~mask)
            if filtered_count > 0:
                print(f"Filtering {filtered_count} haptic samples with force > {force_max_threshold}N")
                aligner.haptic_force = np.where(mask, aligner.haptic_force, np.nan)
                valid_mask = ~np.isnan(aligner.haptic_force)
                if np.any(valid_mask):
                    aligner.haptic_force = np.interp(
                        np.arange(len(aligner.haptic_force)),
                        np.arange(len(aligner.haptic_force))[valid_mask],
                        aligner.haptic_force[valid_mask]
                    )

        aligner.find_optimal_offset(max_offset=max_offset, method=method)

        # Detect segments as start/end pairs
        segment_pairs = None
        csv_data = None
        if export_segments:
            segment_pairs = aligner.detect_force_segment_pairs(
                force_threshold=force_threshold,
                smooth_window=smooth_window
            )

            if segment_pairs:
                csv_data = pd.DataFrame(segment_pairs).to_csv(index=False)

        # Create plotly figure (segment shapes managed by frontend)
        plotly_json = create_plotly_figure(aligner, None, force_max_threshold, view_window)

        # Prepare normalized data for interactive slider
        aria_norm = (aligner.aria_distance - aligner.aria_distance.min()) / \
                    (aligner.aria_distance.max() - aligner.aria_distance.min())
        aria_inverted = 1.0 - aria_norm

        haptic_display = aligner.haptic_force.copy()
        if force_max_threshold > 0:
            haptic_display = np.where(haptic_display <= force_max_threshold, haptic_display, np.nan)
        haptic_min = 0
        haptic_max = force_max_threshold if force_max_threshold > 0 else np.nanmax(haptic_display)
        haptic_norm = (haptic_display - haptic_min) / (haptic_max - haptic_min)

        filtered_count = int(np.sum(np.isnan(haptic_norm))) if force_max_threshold > 0 else 0

        # Prepare results
        results = {
            'optimal_offset': float(aligner.optimal_offset),
            'max_similarity': float(np.max(aligner.correlation_scores)),
            'method': method,
            'aria_time_range': [float(aligner.aria_timestamps[0]), float(aligner.aria_timestamps[-1])],
            'haptic_time_range': [float(aligner.haptic_timestamps[0]), float(aligner.haptic_timestamps[-1])],
            'aria_sample_count': len(aligner.aria_timestamps),
            'haptic_sample_count': len(aligner.haptic_timestamps),
            'haptic_filtered_count': filtered_count,
            'force_max_threshold': force_max_threshold,
            'segment_count': len(segment_pairs) if segment_pairs else 0,
            'plotly_json': plotly_json,
            'segments_csv': csv_data,
            'aria_timestamps': aligner.aria_timestamps.tolist(),
            'aria_normalized': aria_inverted.tolist(),
            'haptic_timestamps': aligner.haptic_timestamps.tolist(),
            'haptic_normalized': haptic_norm.tolist(),
            'haptic_thumb_force': aligner.haptic_thumb_force.tolist() if aligner.haptic_thumb_force is not None else [],
            'haptic_index_force': aligner.haptic_index_force.tolist() if aligner.haptic_index_force is not None else [],
            'offsets': aligner.search_offsets.tolist(),
            'correlation_scores': aligner.correlation_scores.tolist(),
            'max_offset': max_offset,
            'force_segments': segment_pairs if segment_pairs else [],
            # Include source file info
            'source_files': {
                'mps_csv': mps_csv_path if use_mps_csv else None,
                'haptic_csv': haptic_csv_path,
                'vrs': vrs_path if use_vrs else None
            }
        }

        # Auto-save alignment cache for fast reload
        _save_alignment_cache(results, haptic_csv_path, mps_csv_path, vrs_path)

        return jsonify(results)

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500


def _get_config_dir(data_dir):
    """Get (and create) the alignment_configs/ subfolder under the data directory."""
    config_dir = os.path.join(data_dir, 'alignment_configs')
    os.makedirs(config_dir, exist_ok=True)
    return config_dir


def _get_alignment_cache_path(haptic_path, mps_path=None, vrs_path=None):
    """Get the cache file path for alignment results."""
    save_dir = None
    base_name = None
    if haptic_path and os.path.exists(haptic_path):
        save_dir = os.path.dirname(haptic_path)
        base_name = Path(haptic_path).stem
    elif mps_path and os.path.exists(mps_path):
        mps_parent = Path(mps_path).parent.parent.parent
        if mps_parent.exists():
            save_dir = str(mps_parent)
            base_name = Path(mps_path).parent.parent.name.replace('mps_', '')
    elif vrs_path and os.path.exists(vrs_path):
        save_dir = os.path.dirname(vrs_path)
        base_name = Path(vrs_path).stem
    if not save_dir or not base_name:
        return None
    config_dir = _get_config_dir(save_dir)
    new_path = os.path.join(config_dir, f"{base_name}_alignment_cache.json.gz")
    # Backward compat: migrate old file if exists
    old_path = os.path.join(save_dir, f"{base_name}_alignment_cache.json.gz")
    if not os.path.exists(new_path) and os.path.exists(old_path):
        import shutil
        shutil.move(old_path, new_path)
        print(f"Migrated cache: {old_path} -> {new_path}")
    return new_path


def _save_alignment_cache(results, haptic_path, mps_path=None, vrs_path=None):
    """Save alignment results to a gzipped JSON file for fast reload."""
    import gzip
    cache_path = _get_alignment_cache_path(haptic_path, mps_path, vrs_path)
    if not cache_path:
        return
    try:
        # Add cache version to detect stale layouts
        results['_cache_version'] = 2  # v2 = single subplot with rangeslider
        with gzip.open(cache_path, 'wt', encoding='utf-8') as f:
            json.dump(results, f)
        print(f"Alignment cache saved: {cache_path}")
    except Exception as e:
        print(f"Failed to save alignment cache: {e}")


@app.route('/api/load_saved_alignment', methods=['POST'])
def load_saved_alignment():
    """Load cached alignment results without re-computing."""
    import gzip
    try:
        data = request.get_json()
        haptic_path = data.get('haptic_csv_path')
        mps_path = data.get('mps_csv_path')
        vrs_path = data.get('vrs_path')

        cache_path = _get_alignment_cache_path(haptic_path, mps_path, vrs_path)
        if not cache_path or not os.path.exists(cache_path):
            return jsonify({'error': 'No cached alignment results found', 'no_cache': True}), 404

        with gzip.open(cache_path, 'rt', encoding='utf-8') as f:
            results = json.load(f)

        # Check for stale cache: v2 = single subplot with rangeslider
        cache_version = results.get('_cache_version', 0)
        is_stale = False
        if cache_version < 2:
            is_stale = True
        elif 'plotly_json' in results:
            layout = results['plotly_json'].get('layout', {})
            # If xaxis2 exists, this is a multi-subplot layout (stale)
            if 'xaxis2' in layout:
                is_stale = True

        if is_stale:
            # Delete stale cache and force re-computation
            try:
                os.remove(cache_path)
                print(f"Deleted stale alignment cache: {cache_path}")
            except OSError:
                pass
            return jsonify({'error': 'Stale cache invalidated, please re-compute', 'no_cache': True}), 404

        # Override layout properties to match current settings
        if 'plotly_json' in results:
            layout = results['plotly_json'].get('layout', {})
            layout['height'] = 350
            layout['margin'] = dict(l=50, r=50, t=30, b=30)
            layout['legend'] = dict(
                orientation='h',
                yanchor='bottom',
                y=1.02,
                xanchor='right',
                x=1,
                font=dict(size=11)
            )

        results['from_cache'] = True
        return jsonify(results)

    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


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


@app.route('/api/save_segments_csv', methods=['POST'])
def save_segments_csv():
    """保存片段 CSV 到数据目录，供下游 Aria-to-Lerobot 管线使用"""
    try:
        data = request.get_json()
        segments = data.get('segments', [])
        haptic_path = data.get('haptic_path')
        offset = data.get('offset', 0.0)

        if not segments:
            return jsonify({'success': False, 'error': '没有片段数据'}), 400

        if not haptic_path or not os.path.exists(haptic_path):
            return jsonify({'success': False, 'error': f'触觉文件路径无效: {haptic_path}'}), 400

        # 保存到 alignment_configs/ 子文件夹
        save_dir = os.path.dirname(haptic_path)
        config_dir = _get_config_dir(save_dir)
        base_name = Path(haptic_path).stem
        segments_filename = f"{base_name}_segments.csv"
        segments_path = os.path.join(config_dir, segments_filename)

        import csv as csv_module
        with open(segments_path, 'w', newline='') as f:
            writer = csv_module.writer(f)
            writer.writerow(['segment_id', 'start_time_s', 'end_time_s', 'duration_s', 'enabled', 'source'])
            for seg in segments:
                writer.writerow([
                    seg['id'],
                    f"{seg['start']:.3f}",
                    f"{seg['end']:.3f}",
                    f"{seg['duration']:.3f}",
                    str(seg['enabled']).lower(),
                    seg.get('source', 'auto')
                ])

        print(f"[save_segments_csv] Saved {len(segments)} segments to {segments_path}")

        return jsonify({
            'success': True,
            'segments_csv_path': segments_path,
            'message': f'已保存 {len(segments)} 个片段到 {segments_filename}'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/load_segments', methods=['POST'])
def load_segments():
    """加载已保存的片段 CSV"""
    try:
        data = request.get_json()
        haptic_path = data.get('haptic_path')

        if not haptic_path or not os.path.exists(haptic_path):
            return jsonify({'success': False, 'found': False}), 200

        save_dir = os.path.dirname(haptic_path)
        config_dir = _get_config_dir(save_dir)
        base_name = Path(haptic_path).stem
        segments_path = os.path.join(config_dir, f"{base_name}_segments.csv")

        # Backward compat: check old location
        if not os.path.exists(segments_path):
            old_path = os.path.join(save_dir, f"{base_name}_segments.csv")
            if os.path.exists(old_path):
                import shutil
                shutil.move(old_path, segments_path)
                print(f"Migrated segments: {old_path} -> {segments_path}")

        if not os.path.exists(segments_path):
            return jsonify({'success': True, 'found': False}), 200

        import csv as csv_module
        segments = []
        with open(segments_path, 'r') as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                segments.append({
                    'id': int(row['segment_id']),
                    'start': float(row['start_time_s']),
                    'end': float(row['end_time_s']),
                    'duration': float(row['duration_s']),
                    'enabled': row['enabled'].lower() == 'true',
                    'source': row.get('source', 'auto')
                })

        print(f"[load_segments] Loaded {len(segments)} segments from {segments_path}")

        return jsonify({
            'success': True,
            'found': True,
            'segments': segments,
            'segments_csv_path': segments_path
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/run_conversion', methods=['POST'])
def run_conversion():
    """启动 Aria-to-LeRobot 后台转换"""
    try:
        data = request.get_json()

        vrs_path = data.get('vrs_path')
        haptic_csv = data.get('haptic_csv')
        haptic_offset = float(data.get('haptic_offset', 0.0))
        segments_csv_path = data.get('segments_csv')
        output_dir = data.get('output_dir')
        task_name = data.get('task_name', 'aria_recording')

        # 推导 MPS 目录
        mps_dir = data.get('mps_dir')
        mps_csv_path = data.get('mps_csv_path')
        if not mps_dir and mps_csv_path:
            parts = mps_csv_path.replace('\\', '/').split('/')
            ht_idx = None
            for i, part in enumerate(parts):
                if part == 'hand_tracking':
                    ht_idx = i
                    break
            if ht_idx:
                mps_dir = '/'.join(parts[:ht_idx])
            else:
                mps_dir = '/'.join(parts[:-1])

        # 如果没有 segments_csv 文件但有 segments 数组，自动保存
        segments_data = data.get('segments')
        if (not segments_csv_path or not os.path.exists(str(segments_csv_path))) and segments_data and haptic_csv:
            import csv as csv_module
            save_dir = os.path.dirname(haptic_csv)
            config_dir = _get_config_dir(save_dir)
            base_name = Path(haptic_csv).stem
            segments_csv_path = os.path.join(config_dir, f"{base_name}_segments.csv")
            with open(segments_csv_path, 'w', newline='') as f:
                writer = csv_module.writer(f)
                writer.writerow(['segment_id', 'start_time_s', 'end_time_s', 'duration_s', 'enabled'])
                for seg in segments_data:
                    writer.writerow([
                        seg['id'],
                        f"{seg['start']:.3f}",
                        f"{seg['end']:.3f}",
                        f"{seg['duration']:.3f}",
                        str(seg['enabled']).lower()
                    ])
            print(f"[run_conversion] Auto-saved segments CSV to {segments_csv_path}")

        # 校验
        errors = []
        if not vrs_path or not os.path.exists(str(vrs_path)):
            errors.append(f'VRS file not found: {vrs_path}')
        if not mps_dir or not os.path.isdir(str(mps_dir)):
            errors.append(f'MPS directory not found: {mps_dir}')
        if not output_dir:
            errors.append('Output directory is required')
        if not segments_csv_path or not os.path.exists(str(segments_csv_path)):
            errors.append(f'Segments CSV not found: {segments_csv_path}')
        if errors:
            return jsonify({'success': False, 'errors': errors}), 400

        # 检查并发
        with _conversion_lock:
            running = [jid for jid, j in _conversion_jobs.items() if j['status'] == 'running']
            if running:
                return jsonify({
                    'success': False,
                    'error': '已有转换任务在运行中，请等待完成',
                    'running_job_id': running[0]
                }), 409

        job_id = str(uuid.uuid4())[:8]

        # 时间基准说明：
        # 前端播放 VRS 视频用的是 VRS 相机相对时间（第一帧=0）。
        # 用户手动调 slider 时是直接看着 VRS 视频帧和力曲线对齐的，
        # 所以 slider 值直接建立了 VRS 相机时间 → haptic 原始时间的映射：
        #   haptic_raw = vrs_camera_time - slider_value
        # convert.py 中 get_force_at_time: query = time_s - time_offset
        # time_s 就是 VRS 相机相对时间，所以 time_offset = slider_value（直接传）。
        #
        # segment start/end 来自 alignment tool，是 Aria 归零时间（手部追踪第一帧=0）。
        # convert.py 中 create_segment_boundaries 用 VRS 相机 start_ns 做基准，
        # 所以需要 delta_s = (hand_start - camera_start) 来补偿。
        delta_s = 0.0
        try:
            from aria_api import AriaSession as _AriaSession
            _sess = _AriaSession.from_vrs(vrs_path, mps_dir)
            _info = _sess.get_session_info()
            hand_start_ns = _info.get('hand_stats', {}).get('time_range_ns', [None])[0]

            _provider = vrs_data_provider_module.create_vrs_data_provider(vrs_path)
            _streams = _provider.get_all_streams()
            camera_start_ns = None
            for _sid in _streams:
                _label = _provider.get_label_from_stream_id(_sid)
                if 'rgb' in _label.lower():
                    _r = _provider.get_image_data_by_index(_sid, 0)
                    if _r and len(_r) >= 2:
                        camera_start_ns = _r[1].capture_timestamp_ns
                    break

            if hand_start_ns is not None and camera_start_ns is not None:
                delta_s = (hand_start_ns - camera_start_ns) / 1e9
                print(f"[run_conversion] Time base delta: hand_start - camera_start = {delta_s:.3f}s")
        except Exception as e:
            print(f"[run_conversion] Could not compute time base delta (using 0): {e}")

        # haptic_time_offset = slider 值直接传（用户手动标定已包含时间基准差）
        # segment_time_offset = delta_s（segment 在 Aria 时间轴，需转到 VRS 相机时间轴）
        print(f"[run_conversion] haptic_time_offset: {haptic_offset:.3f}s (slider value, direct)")
        print(f"[run_conversion] segment_time_offset: {delta_s:.3f}s")

        convert_kwargs = {
            'vrs_path': vrs_path,
            'mps_dir': mps_dir,
            'out_dir': output_dir,
            'haptic_csv': haptic_csv,
            'haptic_time_offset': haptic_offset,
            'segments_csv': segments_csv_path,
            'segment_time_offset': delta_s,  # 补偿 segment 时间基准差
            'overwrite': True,
            'task_name': task_name,
            'log_level': 'INFO',
            'rotate_image': True,  # Aria RGB 需要顺时针旋转 90 度
        }

        with _conversion_lock:
            _conversion_jobs[job_id] = {
                'status': 'pending',
                'start_time': time_module.time(),
                'end_time': None,
                'result': None,
                'error': None,
                'traceback_str': None,
                'output_dir': output_dir,
            }

        thread = threading.Thread(
            target=_run_conversion_worker,
            args=(job_id, convert_kwargs),
            daemon=True
        )
        thread.start()

        return jsonify({
            'success': True,
            'job_id': job_id,
            'message': '转换已启动'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/conversion_status/<job_id>', methods=['GET'])
def conversion_status(job_id):
    """查询转换任务状态"""
    with _conversion_lock:
        job = _conversion_jobs.get(job_id)

    if not job:
        return jsonify({'success': False, 'error': 'Job not found'}), 404

    response = {
        'success': True,
        'job_id': job_id,
        'status': job['status'],
        'elapsed_s': round(
            (job['end_time'] or time_module.time()) - job['start_time'], 1
        ),
        'output_dir': job['output_dir'],
    }

    if job['status'] == 'completed' and job['result']:
        result = job['result']
        response['result'] = {
            'mode': result.get('mode', 'single'),
            'num_episodes': result.get('num_chunks', 1),
            'total_frames': result.get('processing', {}).get('valid_frames', 0),
            'elapsed_time_s': round(result.get('processing', {}).get('elapsed_time_s', 0), 1),
            'parquet_shards': result.get('files', {}).get('parquet_shards', 0),
            'video_shards': result.get('files', {}).get('video_shards', 0),
        }
        if 'chunks' in result:
            episodes = []
            for chunk in result['chunks']:
                cr = chunk.get('result', {})
                episodes.append({
                    'episode_id': chunk.get('chunk_idx', 0),
                    'frames': cr.get('processing', {}).get('valid_frames', 0),
                    'start_time_s': chunk.get('start_time_s'),
                    'end_time_s': chunk.get('end_time_s'),
                    'elapsed_s': round(cr.get('processing', {}).get('elapsed_time_s', 0), 1),
                })
            response['result']['episodes'] = episodes

    elif job['status'] == 'failed':
        response['error'] = job.get('error', 'Unknown error')
        response['traceback'] = job.get('traceback_str', '')

    # 运行中：读取 conversion.log 尾部
    if job['status'] == 'running' and job['output_dir']:
        log_path = os.path.join(job['output_dir'], 'conversion.log')
        if os.path.exists(log_path):
            try:
                with open(log_path, 'r') as f:
                    lines = f.readlines()
                    response['log_tail'] = ''.join(lines[-5:])
            except Exception:
                pass

    return jsonify(response)



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


@app.route('/player')
def player():
    """Render data player page"""
    return render_template('player.html', aria_api_available=ARIA_API_AVAILABLE)


@app.route('/player_data', methods=['POST'])
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
        mps_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(mps_file.filename))
        haptic_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(haptic_file.filename))
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


def parse_urdf(urdf_path):
    """
    Parse URDF file and extract link/joint information.
    
    Returns:
        dict with links, joints, and mesh paths
    """
    try:
        tree = ET.parse(urdf_path)
        root = tree.getroot()
        
        urdf_data = {
            'links': [],
            'joints': [],
            'mesh_paths': []
        }
        
        # Parse links
        for link in root.findall('link'):
            link_name = link.get('name', '')
            link_data = {
                'name': link_name,
                'visuals': [],
                'collisions': []
            }
            
            # Parse visual elements
            for visual in link.findall('visual'):
                visual_data = {}
                
                # Get origin
                origin = visual.find('origin')
                if origin is not None:
                    xyz = origin.get('xyz', '0 0 0').split()
                    rpy = origin.get('rpy', '0 0 0').split()
                    visual_data['origin'] = {
                        'xyz': [float(x) for x in xyz],
                        'rpy': [float(r) for r in rpy]
                    }
                else:
                    visual_data['origin'] = {'xyz': [0, 0, 0], 'rpy': [0, 0, 0]}
                
                # Get geometry (mesh)
                geometry = visual.find('geometry')
                if geometry is not None:
                    mesh = geometry.find('mesh')
                    if mesh is not None:
                        filename = mesh.get('filename', '')
                        # Remove package:// prefix if present
                        if filename.startswith('package://'):
                            filename = filename.replace('package://', '')
                        # Remove leading slash
                        filename = filename.lstrip('/')
                        visual_data['mesh'] = filename
                        if filename and filename not in urdf_data['mesh_paths']:
                            urdf_data['mesh_paths'].append(filename)
                
                link_data['visuals'].append(visual_data)
            
            urdf_data['links'].append(link_data)
        
        # Parse joints
        for joint in root.findall('joint'):
            joint_name = joint.get('name', '')
            joint_type = joint.get('type', 'fixed')
            
            joint_data = {
                'name': joint_name,
                'type': joint_type,
                'parent': '',
                'child': '',
                'origin': {'xyz': [0, 0, 0], 'rpy': [0, 0, 0]}
            }
            
            # Get parent and child links
            parent = joint.find('parent')
            if parent is not None:
                joint_data['parent'] = parent.get('link', '')
            
            child = joint.find('child')
            if child is not None:
                joint_data['child'] = child.get('link', '')
            
            # Get origin
            origin = joint.find('origin')
            if origin is not None:
                xyz = origin.get('xyz', '0 0 0').split()
                rpy = origin.get('rpy', '0 0 0').split()
                joint_data['origin'] = {
                    'xyz': [float(x) for x in xyz],
                    'rpy': [float(r) for r in rpy]
                }
            
            urdf_data['joints'].append(joint_data)
        
        return urdf_data
    
    except Exception as e:
        raise ValueError(f"Failed to parse URDF file: {str(e)}")


def load_hand_landmarks(mps_csv_path):
    """Load full 21-point hand landmarks from MPS CSV file"""
    import csv

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


# ==================== Data Manager Routes ====================
# Default data root directory
DEFAULT_DATA_ROOT = '/mnt/zyl/data/IROS_data'


def get_data_root():
    """Get the configured data root directory"""
    return os.environ.get('ARIA_DATA_ROOT', DEFAULT_DATA_ROOT)


def _get_csv_duration(csv_path):
    """快速获取 CSV 文件的录制时长（秒），只读首行和末行。"""
    try:
        with open(csv_path, 'r') as f:
            header = f.readline().strip().split(',')
            # 查找 Relative_Time_ms 列
            col_idx = None
            for i, col in enumerate(header):
                if col.strip().lower() == 'relative_time_ms':
                    col_idx = i
                    break
            if col_idx is None:
                return None
            # 快速定位文件末尾读取最后一行
            f.seek(0, 2)
            fsize = f.tell()
            if fsize < 2:
                return None
            # 回退读取最后一行
            f.seek(max(fsize - 4096, 0))
            lines = f.readlines()
            last_line = lines[-1].strip() if lines[-1].strip() else lines[-2].strip()
            fields = last_line.split(',')
            if col_idx < len(fields):
                return round(float(fields[col_idx]) / 1000.0, 1)
    except Exception:
        pass
    return None


def scan_data_directory(directory):
    """Scan a directory for VRS and CSV files, grouping them by base name."""
    data_groups = {}
    directory = Path(directory)

    if not directory.exists():
        return []

    # First, scan for offset config files to know which groups have alignment
    # Check both alignment_configs/ subfolder and root dir (backward compat)
    # Store both by exact name and by VRS-related name for matching
    offset_configs = {}
    offset_configs_by_vrs = {}  # Maps VRS base name to config
    config_search_dirs = [directory / 'alignment_configs', directory]
    for search_dir in config_search_dirs:
        if not search_dir.exists():
            continue
        for config_file in search_dir.glob('*_offset_config.json'):
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    base_name = config.get('base_name', config_file.stem.replace('_offset_config', ''))
                    # Skip if already found (prefer alignment_configs/ over root)
                    if base_name in offset_configs:
                        continue
                    # Check if alignment cache exists (same dir as config)
                    cache_path = str(config_file).replace('_offset_config.json', '_alignment_cache.json.gz')
                    config_data = {
                        'current_offset': config.get('current_offset'),
                        'optimal_offset': config.get('optimal_offset'),
                        'similarity': config.get('similarity'),
                        'timestamp': config.get('timestamp'),
                        'config_path': str(config_file),
                        'method': config.get('method'),
                        'save_source': config.get('save_source', 'unknown'),
                        'parameters': config.get('parameters', {}),
                        'files': config.get('files', {}),
                        'has_cache': os.path.exists(cache_path),
                    }
                    offset_configs[base_name] = config_data

                    # Also try to extract VRS name from the config's file paths
                    files_info = config.get('files', {})
                    vrs_file = files_info.get('vrs_file')
                    if vrs_file:
                        vrs_base = Path(vrs_file).stem
                        offset_configs_by_vrs[vrs_base] = config_data
            except:
                pass

    # Helper function to find offset config for a base name
    def find_offset_config(base_name):
        # First try exact match
        if base_name in offset_configs:
            return offset_configs[base_name]
        # Then try VRS-based match
        if base_name in offset_configs_by_vrs:
            return offset_configs_by_vrs[base_name]
        # Finally try partial match (config name contains VRS base name)
        base_lower = base_name.lower()
        for config_name, config_data in offset_configs.items():
            if base_lower in config_name.lower() or config_name.lower().startswith(base_lower):
                return config_data
        return None

    # Scan for VRS files
    for vrs_file in directory.glob('*.vrs'):
        base_name = vrs_file.stem
        if base_name not in data_groups:
            data_groups[base_name] = {
                'name': base_name,
                'vrs_file': None,
                'vrs_json': None,
                'csv_files': [],
                'mps_folder': None,
                'has_hand_tracking': False,
                'size_mb': 0,
                'duration_s': None,
                'offset_config': find_offset_config(base_name)
            }

        data_groups[base_name]['vrs_file'] = str(vrs_file)
        data_groups[base_name]['size_mb'] = round(vrs_file.stat().st_size / (1024 * 1024), 1)

        json_file = vrs_file.with_suffix('.vrs.json')
        if json_file.exists():
            data_groups[base_name]['vrs_json'] = str(json_file)
            try:
                with open(json_file, 'r') as jf:
                    vrs_meta = json.load(jf)
                    st = vrs_meta.get('start_time')
                    et = vrs_meta.get('end_time')
                    if st is not None and et is not None:
                        data_groups[base_name]['duration_s'] = et - st
            except Exception:
                pass

    # Scan for CSV files (skip segments and alignment cache files)
    for csv_file in directory.glob('*.csv'):
        csv_name = csv_file.stem.lower()
        # Skip generated files: segments CSV, offset config, alignment cache
        if csv_name.endswith('_segments') or '_segments.' in csv_file.name.lower():
            continue
        if '_offset_config' in csv_name or '_alignment_cache' in csv_name:
            continue
        matched = False

        # Sort by name length descending so longer names match first
        # e.g. "Half_coke1" matches before "Half_coke"
        sorted_keys = sorted(data_groups.keys(), key=lambda k: len(k), reverse=True)
        for base_name in sorted_keys:
            # CSV pattern: {base_name}_{timestamp}.csv
            # Match base_name at start, followed by '_' + digits (timestamp)
            bn = base_name.lower()
            if csv_name == bn or csv_name.startswith(bn + '_'):
                # Ensure we don't match "half_coke_" against "half_coke1_"
                # After removing base_name prefix + '_', remaining should start with digit (date)
                remainder = csv_name[len(bn):]
                if remainder == '' or (remainder.startswith('_') and len(remainder) > 1 and remainder[1:2].isdigit()):
                    data_groups[base_name]['csv_files'].append({
                        'path': str(csv_file),
                        'name': csv_file.name,
                        'size_mb': round(csv_file.stat().st_size / (1024 * 1024), 2),
                        'duration_s': _get_csv_duration(csv_file)
                    })
                    matched = True
                    break

        if not matched:
            csv_base = csv_file.stem
            if csv_base not in data_groups:
                data_groups[csv_base] = {
                    'name': csv_base,
                    'vrs_file': None,
                    'vrs_json': None,
                    'csv_files': [],
                    'mps_folder': None,
                    'has_hand_tracking': False,
                    'size_mb': 0,
                    'duration_s': None,
                    'offset_config': find_offset_config(csv_base)
                }
            data_groups[csv_base]['csv_files'].append({
                'path': str(csv_file),
                'name': csv_file.name,
                'size_mb': round(csv_file.stat().st_size / (1024 * 1024), 2),
                'duration_s': _get_csv_duration(csv_file)
            })

    # Scan for MPS folders — use exact match mps_{base_name}_vrs
    for mps_folder in directory.glob('mps_*'):
        if mps_folder.is_dir():
            mps_name = mps_folder.name.lower()
            for base_name in data_groups:
                expected = f'mps_{base_name.lower()}_vrs'
                if mps_name == expected:
                    data_groups[base_name]['mps_folder'] = str(mps_folder)
                    hand_tracking_file = mps_folder / 'hand_tracking' / 'hand_tracking_results.csv'
                    if hand_tracking_file.exists():
                        data_groups[base_name]['has_hand_tracking'] = True
                        data_groups[base_name]['hand_tracking_file'] = str(hand_tracking_file)
                    break

    result = list(data_groups.values())
    result.sort(key=lambda x: x['name'])
    return result


def scan_subdirectories(root_dir):
    """Scan root directory for subdirectories containing data."""
    root = Path(root_dir)
    subdirs = []

    if not root.exists():
        return subdirs

    for item in sorted(root.iterdir()):
        if item.is_dir() and not item.name.startswith('.'):
            vrs_count = len(list(item.glob('*.vrs')))
            csv_count = len(list(item.glob('*.csv')))
            mps_count = len(list(item.glob('mps_*')))

            if vrs_count > 0 or csv_count > 0:
                subdirs.append({
                    'name': item.name,
                    'path': str(item),
                    'vrs_count': vrs_count,
                    'csv_count': csv_count,
                    'mps_count': mps_count
                })

    return subdirs


@app.route('/data')
def data_manager():
    """Render data manager page"""
    return render_template('data_manager.html',
                         aria_api_available=ARIA_API_AVAILABLE,
                         default_data_root=get_data_root())


@app.route('/data/api/directories')
def list_directories():
    """List available data directories"""
    root_dir = request.args.get('root', get_data_root())

    try:
        subdirs = scan_subdirectories(root_dir)
        root_files = scan_data_directory(root_dir)

        return jsonify({
            'success': True,
            'root': root_dir,
            'subdirectories': subdirs,
            'root_files': root_files
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/data/api/files')
def list_files():
    """List files in a specific directory"""
    directory = request.args.get('directory', get_data_root())

    try:
        files = scan_data_directory(directory)
        return jsonify({
            'success': True,
            'directory': directory,
            'files': files
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/data/api/save_offset', methods=['POST'])
def save_offset():
    """Save offset configuration to a JSON file in the same directory as the data."""
    from datetime import datetime
    data = request.get_json()

    haptic_path = data.get('haptic_path')
    mps_path = data.get('mps_path')
    vrs_path = data.get('vrs_path')
    current_offset = data.get('current_offset')
    optimal_offset = data.get('optimal_offset')
    similarity = data.get('similarity')
    method = data.get('method')
    save_source = data.get('save_source', 'manual')
    parameters = data.get('parameters', {})

    # Determine save directory based on available paths
    save_dir = None
    base_name = None

    if haptic_path and os.path.exists(haptic_path):
        save_dir = os.path.dirname(haptic_path)
        base_name = Path(haptic_path).stem
    elif mps_path and os.path.exists(mps_path):
        # MPS path is usually like /path/mps_xxx/hand_tracking/hand_tracking_results.csv
        mps_parent = Path(mps_path).parent.parent.parent
        if mps_parent.exists():
            save_dir = str(mps_parent)
            base_name = Path(mps_path).parent.parent.name.replace('mps_', '')
    elif vrs_path and os.path.exists(vrs_path):
        save_dir = os.path.dirname(vrs_path)
        base_name = Path(vrs_path).stem

    if not save_dir or not base_name:
        return jsonify({
            'success': False,
            'error': 'Could not determine save location from provided paths'
        }), 400

    try:
        config = {
            'timestamp': datetime.now().isoformat(),
            'base_name': base_name,
            'current_offset': current_offset,
            'optimal_offset': optimal_offset,
            'similarity': similarity,
            'method': method,
            'save_source': save_source,
            'parameters': parameters,
            'files': {
                'haptic_csv': haptic_path,
                'mps_csv': mps_path,
                'vrs_file': vrs_path
            }
        }

        config_dir = _get_config_dir(save_dir)
        config_filename = f"{base_name}_offset_config.json"
        config_path = os.path.join(config_dir, config_filename)

        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

        return jsonify({
            'success': True,
            'config_path': config_path,
            'message': f'配置已保存到 {config_filename}'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/gripper')
def gripper():
    """Render gripper visualization page"""
    return render_template('gripper.html', aria_api_available=ARIA_API_AVAILABLE)


@app.route('/gripper_data', methods=['POST'])
@app.route('/gripper/data', methods=['POST'])  # Also support new route format
def gripper_data():
    """Load data for gripper visualization"""
    try:
        # Check for MPS folder first (highest priority)
        mps_folder_path = request.form.get('mps_folder_path')
        mps_folder_files = request.files.getlist('mps_folder_files')

        # MPS file is optional (for testing display without hand data)
        mps_file = request.files.get('mps_file')
        haptic_file = request.files.get('haptic_file')  # Haptic sensor data
        urdf_file = request.files.get('urdf_file')
        stl_files = request.files.getlist('stl_files')  # Multiple STL files (for manual upload)

        # Check if at least one file type is provided
        has_mps_folder = len(mps_folder_files) > 0
        has_mps = mps_file and mps_file.filename != ''
        has_haptic = haptic_file and haptic_file.filename != ''
        has_urdf = urdf_file and urdf_file.filename != ''
        has_stl = any(stl_file and stl_file.filename != '' for stl_file in stl_files)

        print(f"File upload check: mps_folder={has_mps_folder}, mps={has_mps}, haptic={has_haptic}, urdf={has_urdf}, stl={has_stl}")

        # Allow loading with just MPS folder, or any combination of other files
        if not (has_mps_folder or has_mps or has_haptic or has_urdf or has_stl):
            return jsonify({'error': '请至少上传以下之一：MPS 文件夹、MPS CSV、触觉 CSV、URDF 或 STL 文件'}), 400

        # Process MPS folder if provided (highest priority for hand data)
        hand_landmarks_data = None
        slam_trajectory = None
        world_coordinates = False

        if has_mps_folder:
            try:
                # Save MPS folder files to temp directory
                mps_temp_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'mps_folder')
                os.makedirs(mps_temp_dir, exist_ok=True)

                for f in mps_folder_files:
                    if f.filename:
                        # Preserve folder structure
                        rel_path = f.filename
                        full_path = os.path.join(mps_temp_dir, rel_path)
                        os.makedirs(os.path.dirname(full_path), exist_ok=True)
                        f.save(full_path)

                # Load MPS folder data
                from app.utils.mps_folder_loader import load_mps_folder
                mps_data = load_mps_folder(mps_temp_dir)

                if mps_data.get('hand_landmarks'):
                    hand_landmarks_data = mps_data['hand_landmarks']
                    world_coordinates = mps_data.get('world_coordinates', False)
                    print(f"MPS folder: loaded hand landmarks, world_coordinates={world_coordinates}")

                if mps_data.get('slam_data'):
                    slam_trajectory = {
                        'positions': mps_data['slam_data']['positions'].tolist(),
                        'timestamps': (mps_data['slam_data']['timestamps_us'] / 1e6).tolist()
                    }
                    print(f"MPS folder: loaded SLAM trajectory with {len(slam_trajectory['positions'])} poses")

            except Exception as e:
                import traceback
                print(f"Warning: Failed to load MPS folder: {e}")
                print(traceback.format_exc())

        # Save MPS file if provided
        mps_path = None
        if has_mps:
            mps_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(mps_file.filename))
            mps_file.save(mps_path)

        # Save haptic file if provided
        haptic_path = None
        if has_haptic:
            haptic_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(haptic_file.filename))
            haptic_file.save(haptic_path)
            print(f"Haptic file saved to: {haptic_path}")

        # Process URDF file if provided
        urdf_data = None
        urdf_path = None
        if urdf_file and urdf_file.filename:
            urdf_filename = secure_filename(urdf_file.filename)
            urdf_path = os.path.join(app.config['UPLOAD_FOLDER'], urdf_filename)
            urdf_file.save(urdf_path)
            
            try:
                urdf_data = parse_urdf(urdf_path)
                print(f"Parsed URDF: {len(urdf_data['links'])} links, {len(urdf_data['joints'])} joints")
            except Exception as e:
                return jsonify({'error': f'Failed to parse URDF file: {str(e)}'}), 400

        # Save STL files if provided (manual upload or from URDF)
        stl_urls = []
        stl_filenames = []
        stl_file_map = {}  # Map mesh filename to uploaded file URL
        
        # If URDF is provided, expect STL files to be uploaded with matching names
        if urdf_data:
            # Create a map of expected mesh filenames from URDF
            expected_meshes = {}
            for link in urdf_data['links']:
                for visual in link['visuals']:
                    if 'mesh' in visual and visual['mesh']:
                        mesh_name = os.path.basename(visual['mesh'])
                        expected_meshes[mesh_name] = visual['mesh']
            
            # Match uploaded STL files with URDF mesh references
            for stl_file in stl_files:
                if stl_file and stl_file.filename:
                    filename = secure_filename(stl_file.filename)
                    file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
                    
                    if file_ext != 'stl':
                        continue  # Skip non-STL files
                    
                    stl_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                    stl_file.save(stl_path)
                    stl_url = f'/uploaded_stl/{filename}'
                    stl_urls.append(stl_url)
                    stl_filenames.append(filename)
                    
                    # Map by basename for matching with URDF
                    mesh_basename = os.path.basename(filename)
                    stl_file_map[mesh_basename] = stl_url
        else:
            # Manual STL file upload (no URDF)
            for stl_file in stl_files:
                if stl_file and stl_file.filename:
                    filename = secure_filename(stl_file.filename)
                    file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
                    
                    if file_ext != 'stl':
                        return jsonify({'error': f'不支持的文件格式: {file_ext}。请上传 .stl 文件'}), 400
                    
                    stl_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                    stl_file.save(stl_path)
                    stl_urls.append(f'/uploaded_stl/{filename}')
                    stl_filenames.append(filename)

        # Load hand landmarks data from MPS CSV (if provided and not already loaded from MPS folder)
        if mps_path and hand_landmarks_data is None:
            try:
                hand_landmarks_data = load_hand_landmarks(mps_path)
            except Exception as e:
                print(f"Warning: Failed to load hand landmarks from MPS file: {e}")
                hand_landmarks_data = None

        # Load haptic data (if provided)
        haptic_data = None
        if haptic_path:
            try:
                from app.utils.haptic_loader import load_haptic_data
                haptic_data = load_haptic_data(haptic_path)
                print(f"Haptic data loaded: {len(haptic_data.get('timestamps', []))} samples, sensors: {list(haptic_data.get('sensors', {}).keys())}")
            except Exception as e:
                import traceback
                print(f"Warning: Failed to load haptic data: {e}")
                print(traceback.format_exc())
                haptic_data = None

        # Auto-load IK chain if URDF is provided
        ik_loaded = False
        if urdf_path and IKPY_AVAILABLE:
            try:
                load_ik_chain(urdf_path, 'base_link', 'gripper_frame_link')
                ik_loaded = True
                print(f"IK chain auto-loaded from URDF: {urdf_path}")
            except Exception as e:
                print(f"Warning: Failed to auto-load IK chain: {e}")

        # Return data
        result = {
            'hand_landmarks': hand_landmarks_data,  # Can be None if no MPS file
            'haptic_data': haptic_data,  # Can be None if no haptic file
            'stl_files': stl_filenames,
            'stl_urls': stl_urls,
            'stl_file_map': stl_file_map,
            'ik_available': IKPY_AVAILABLE,
            'ik_loaded': ik_loaded,
            'world_coordinates': world_coordinates,  # Whether hand data is in world coordinates
            'slam_trajectory': slam_trajectory  # SLAM trajectory (if available)
        }

        # Add URDF data if available
        if urdf_data:
            result['urdf'] = urdf_data
            result['urdf_filename'] = os.path.basename(urdf_path) if urdf_path else None
            result['urdf_path'] = urdf_path  # For IK service

        # Add IK joint info if loaded
        if ik_loaded:
            result['ik_joint_names'] = ik_joint_names
            result['ik_active_indices'] = ik_active_indices

        return jsonify(result)

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500


@app.route('/gripper_data_from_path', methods=['POST'])
def gripper_data_from_path():
    """Load gripper data from server file paths (no upload needed)"""
    try:
        data = request.get_json()
        mps_folder_path = data.get('mps_folder_path')  # e.g. /mnt/zyl/data/IROS_data/20260110/mps_Jelly_1_vrs
        haptic_path = data.get('haptic_path')  # e.g. /mnt/zyl/data/IROS_data/20260110/jelly_1_xxx.csv
        vrs_path = data.get('vrs_path')  # e.g. /mnt/zyl/data/IROS_data/20260110/Jelly_1.vrs
        urdf_path = data.get('urdf_path')  # e.g. /path/to/SO101_URDF_Assets/so101_new_calib.urdf
        stl_dir_path = data.get('stl_dir_path')  # e.g. /path/to/SO101_URDF_Assets

        hand_landmarks_data = None
        slam_trajectory = None
        world_coordinates = False
        haptic_data_result = None
        urdf_data = None
        stl_urls = []
        stl_filenames = []
        stl_file_map = {}

        # Load MPS folder data
        if mps_folder_path and os.path.isdir(mps_folder_path):
            try:
                from app.utils.mps_folder_loader import load_mps_folder
                mps_data = load_mps_folder(mps_folder_path)
                if mps_data.get('hand_landmarks'):
                    hand_landmarks_data = mps_data['hand_landmarks']
                    world_coordinates = mps_data.get('world_coordinates', False)
                if mps_data.get('slam_data'):
                    slam_trajectory = {
                        'positions': mps_data['slam_data']['positions'].tolist(),
                        'timestamps': (mps_data['slam_data']['timestamps_us'] / 1e6).tolist()
                    }
                print(f"MPS folder loaded: hand={hand_landmarks_data is not None}, slam={slam_trajectory is not None}")
            except Exception as e:
                import traceback
                print(f"Warning: Failed to load MPS folder: {e}")
                print(traceback.format_exc())

        # Load haptic data
        if haptic_path and os.path.isfile(haptic_path):
            try:
                from app.utils.haptic_loader import load_haptic_data
                haptic_data_result = load_haptic_data(haptic_path)
                print(f"Haptic data loaded: {len(haptic_data_result.get('timestamps', []))} samples")
            except Exception as e:
                print(f"Warning: Failed to load haptic data: {e}")

        # Parse URDF file
        if urdf_path and os.path.isfile(urdf_path):
            try:
                urdf_data = parse_urdf(urdf_path)
                print(f"Parsed URDF: {len(urdf_data['links'])} links, {len(urdf_data['joints'])} joints")
            except Exception as e:
                return jsonify({'error': f'Failed to parse URDF file: {str(e)}'}), 400

        # Serve STL files from directory
        if stl_dir_path and os.path.isdir(stl_dir_path):
            for stl_file in sorted(os.listdir(stl_dir_path)):
                if stl_file.lower().endswith('.stl'):
                    stl_filenames.append(stl_file)
                    stl_url = f'/gripper/server_stl?path={os.path.join(stl_dir_path, stl_file)}'
                    stl_urls.append(stl_url)
                    stl_file_map[stl_file] = stl_url

        # Auto-load IK chain if URDF is provided
        ik_loaded = False
        if urdf_path and os.path.isfile(urdf_path) and IKPY_AVAILABLE:
            try:
                load_ik_chain(urdf_path, 'base_link', 'gripper_frame_link')
                ik_loaded = True
            except Exception as e:
                print(f"Warning: Failed to auto-load IK chain: {e}")

        result = {
            'hand_landmarks': hand_landmarks_data,
            'haptic_data': haptic_data_result,
            'stl_files': stl_filenames,
            'stl_urls': stl_urls,
            'stl_file_map': stl_file_map,
            'ik_available': IKPY_AVAILABLE,
            'ik_loaded': ik_loaded,
            'world_coordinates': world_coordinates,
            'slam_trajectory': slam_trajectory,
            'vrs_path': vrs_path  # Pass through for VRS init
        }

        if urdf_data:
            result['urdf'] = urdf_data
            result['urdf_filename'] = os.path.basename(urdf_path)
            result['urdf_path'] = urdf_path

        if ik_loaded:
            result['ik_joint_names'] = ik_joint_names
            result['ik_active_indices'] = ik_active_indices

        return jsonify(result)

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500


@app.route('/gripper/server_stl')
def server_stl():
    """Serve STL files from server paths"""
    stl_path = request.args.get('path', '')
    if not stl_path or not os.path.isfile(stl_path):
        return jsonify({'error': 'STL file not found'}), 404
    # Security check: only allow STL files
    if not stl_path.lower().endswith('.stl'):
        return jsonify({'error': 'Not an STL file'}), 400
    return send_file(stl_path, mimetype='application/octet-stream')


@app.route('/uploaded_stl/<filename>')
@app.route('/gripper/uploaded_stl/<filename>')  # Also support new route format
def uploaded_stl(filename):
    """Serve uploaded STL files"""
    try:
        stl_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
        if os.path.exists(stl_path):
            return send_file(stl_path, mimetype='application/octet-stream')
        else:
            return jsonify({'error': 'STL file not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== VRS Video Frame Service ====================
# Try to import projectaria_tools for video frame extraction
VRS_PROVIDER_AVAILABLE = False
vrs_data_provider_module = None
try:
    from projectaria_tools.core import data_provider
    from projectaria_tools.core.sensor_data import TimeDomain
    vrs_data_provider_module = data_provider
    VRS_PROVIDER_AVAILABLE = True
    print("projectaria_tools loaded successfully for VRS video frames")
except ImportError as e:
    print(f"projectaria_tools not available for VRS video frames: {e}")

# Global VRS provider cache
_vrs_provider = None
_vrs_path = None
_vrs_cameras = []
_vrs_time_range_ns = [0, 0]
_vrs_num_frames = 0
_vrs_rgb_stream_id = None

# Global AriaSession cache for hand landmark projection
_aria_session = None
_aria_session_vrs_path = None
_aria_session_mps_dir = None
_aria_rgb_h_orig = None  # cached original RGB image height for rotation compensation

# LRU frame cache: (frame_index, skeleton_bool) -> jpeg_bytes
from collections import OrderedDict
_frame_cache = OrderedDict()
_FRAME_CACHE_MAX = 200

# VRS provider lock - protects concurrent access to _vrs_provider
_vrs_lock = threading.Lock()

# MP4 video generation state
_video_generating = False
_video_progress = 0  # 0-100
_video_cached_path = None  # path to generated MP4
_video_progress_file = None  # path to progress file for subprocess
_video_gen_proc = None  # subprocess.Popen for MP4 generation


def _get_or_create_aria_session(vrs_path, mps_dir):
    """Get or create AriaSession for hand landmark projection"""
    global _aria_session, _aria_session_vrs_path, _aria_session_mps_dir
    if (_aria_session is not None and
        _aria_session_vrs_path == vrs_path and
        _aria_session_mps_dir == mps_dir):
        return _aria_session
    try:
        from aria_api import AriaSession
        _aria_session = AriaSession.from_vrs(vrs_path, mps_dir)
        _aria_session_vrs_path = vrs_path
        _aria_session_mps_dir = mps_dir
        print(f"[AriaSession] Created for {vrs_path}, mps_dir={mps_dir}")
        return _aria_session
    except Exception as e:
        print(f"[AriaSession] Failed to create: {e}")
        _aria_session = None
        return None


@app.route('/gripper/init_vrs', methods=['POST'])
def init_vrs():
    """Initialize VRS session for video frame extraction"""
    global _vrs_provider, _vrs_path, _vrs_cameras, _vrs_time_range_ns, _vrs_num_frames, _vrs_rgb_stream_id
    global _frame_cache, _video_cached_path

    print("[init_vrs] VRS_PROVIDER_AVAILABLE:", VRS_PROVIDER_AVAILABLE)

    # Clear caches when switching VRS files
    _frame_cache.clear()
    _video_cached_path = None

    if not VRS_PROVIDER_AVAILABLE:
        return jsonify({'error': 'projectaria_tools not available', 'available': False}), 400

    try:
        # Check if using server path or uploaded file
        vrs_server_path = request.form.get('vrs_server_path')
        vrs_file = request.files.get('vrs_file')

        if vrs_server_path and os.path.exists(vrs_server_path):
            # Use server path directly
            vrs_path = vrs_server_path
            print(f"[init_vrs] Using server VRS file: {vrs_path}")
        elif vrs_file and vrs_file.filename != '':
            # Upload and save file
            print(f"[init_vrs] Received VRS file: {vrs_file.filename}")
            vrs_filename = secure_filename(vrs_file.filename)
            vrs_path = os.path.join(app.config['UPLOAD_FOLDER'], vrs_filename)
            vrs_file.save(vrs_path)
            print(f"[init_vrs] VRS file saved to: {vrs_path}")
        else:
            return jsonify({'error': 'No VRS file provided'}), 400

        # Initialize VRS data provider directly
        print(f"[init_vrs] Creating VRS data provider...")
        _vrs_provider = vrs_data_provider_module.create_vrs_data_provider(vrs_path)
        _vrs_path = vrs_path
        print(f"[init_vrs] VRS provider created: {_vrs_provider}")

        # Get available cameras/streams and time range
        _vrs_cameras = []
        _vrs_time_range_ns = [0, 0]
        rgb_stream_id = None
        try:
            all_streams = _vrs_provider.get_all_streams()
            for stream_id in all_streams:
                try:
                    label = _vrs_provider.get_label_from_stream_id(stream_id)
                    _vrs_cameras.append(label)
                    # Find RGB camera stream for time range
                    if 'rgb' in label.lower() and rgb_stream_id is None:
                        rgb_stream_id = stream_id
                except:
                    pass
            print(f"[init_vrs] Available cameras: {_vrs_cameras}")

            # Get time range from RGB stream (or first stream)
            if rgb_stream_id is None and len(all_streams) > 0:
                rgb_stream_id = all_streams[0]

            if rgb_stream_id is not None:
                _vrs_rgb_stream_id = rgb_stream_id
                _vrs_num_frames = _vrs_provider.get_num_data(rgb_stream_id)
                if _vrs_num_frames > 0:
                    # Get first frame timestamp
                    first_result = _vrs_provider.get_image_data_by_index(rgb_stream_id, 0)
                    if first_result and len(first_result) >= 2:
                        _vrs_time_range_ns[0] = first_result[1].capture_timestamp_ns

                    # Get last frame timestamp
                    last_result = _vrs_provider.get_image_data_by_index(rgb_stream_id, _vrs_num_frames - 1)
                    if last_result and len(last_result) >= 2:
                        _vrs_time_range_ns[1] = last_result[1].capture_timestamp_ns

                    print(f"[init_vrs] Time range: {_vrs_time_range_ns[0]/1e9:.3f}s - {_vrs_time_range_ns[1]/1e9:.3f}s ({_vrs_num_frames} frames)")
        except Exception as e:
            print(f"[init_vrs] Error getting streams: {e}")

        return jsonify({
            'success': True,
            'vrs_path': vrs_path,
            'cameras': _vrs_cameras,
            'has_vrs': _vrs_provider is not None,
            'time_range_ns': _vrs_time_range_ns,
            'time_range_s': [_vrs_time_range_ns[0] / 1e9, _vrs_time_range_ns[1] / 1e9],
            'num_frames': _vrs_num_frames
        })

    except Exception as e:
        import traceback
        print(f"[init_vrs] Error: {e}")
        print(traceback.format_exc())
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/gripper/video_frame', methods=['GET'])
def get_video_frame():
    """Get video frame at specified timestamp or frame index"""
    global _vrs_provider, _vrs_cameras, _vrs_time_range_ns, _vrs_num_frames, _vrs_rgb_stream_id

    if not VRS_PROVIDER_AVAILABLE:
        return jsonify({'error': 'projectaria_tools not available'}), 400

    if _vrs_provider is None:
        return jsonify({'error': 'VRS session not initialized. Call /gripper/init_vrs first'}), 400

    try:
        import io
        import base64
        from PIL import Image

        # Support both frame_index and timestamp parameters
        frame_index = request.args.get('frame_index', type=int)
        timestamp_s = request.args.get('timestamp', type=float)
        camera = request.args.get('camera', 'camera-rgb')
        # Hand skeleton overlay params (optional)
        show_skeleton = request.args.get('skeleton', '1')  # '1' = on, '0' = off
        vrs_path_param = request.args.get('vrs_path', '')
        mps_dir_param = request.args.get('mps_dir', '')

        # Use cached RGB stream if available
        stream_id = _vrs_rgb_stream_id
        actual_camera = camera

        # If no cached stream, find one
        if stream_id is None:
            all_streams = _vrs_provider.get_all_streams()
            for sid in all_streams:
                try:
                    label = _vrs_provider.get_label_from_stream_id(sid)
                    if camera == label or camera in label or label in camera:
                        stream_id = sid
                        actual_camera = label
                        break
                except:
                    continue

            # If not found, try RGB camera specifically
            if stream_id is None:
                for sid in all_streams:
                    try:
                        label = _vrs_provider.get_label_from_stream_id(sid)
                        if 'rgb' in label.lower():
                            stream_id = sid
                            actual_camera = label
                            break
                    except:
                        continue

            # If still not found, use first image stream
            if stream_id is None and len(all_streams) > 0:
                stream_id = all_streams[0]
                try:
                    actual_camera = _vrs_provider.get_label_from_stream_id(stream_id)
                except:
                    actual_camera = str(stream_id)

        if stream_id is None:
            return jsonify({'error': 'No image stream found in VRS'}), 404

        # Determine which frame to get
        if frame_index is not None:
            # Direct frame index access
            target_index = max(0, min(frame_index, _vrs_num_frames - 1))
            # print(f"[video_frame] Getting frame by index: {target_index}")
            result = _vrs_provider.get_image_data_by_index(stream_id, target_index)
        elif timestamp_s is not None and _vrs_time_range_ns[0] > 0:
            # Convert relative timestamp (0 to duration) to frame index
            # This is more reliable than using device timestamps directly
            duration_s = (_vrs_time_range_ns[1] - _vrs_time_range_ns[0]) / 1e9
            if duration_s > 0 and _vrs_num_frames > 0:
                # Calculate frame index based on relative position
                relative_pos = timestamp_s / duration_s if duration_s > 0 else 0
                target_index = int(relative_pos * (_vrs_num_frames - 1))
                target_index = max(0, min(target_index, _vrs_num_frames - 1))
                # print(f"[video_frame] Timestamp {timestamp_s:.3f}s -> frame index {target_index} (duration: {duration_s:.3f}s, frames: {_vrs_num_frames})")
                result = _vrs_provider.get_image_data_by_index(stream_id, target_index)
            else:
                result = _vrs_provider.get_image_data_by_index(stream_id, 0)
        else:
            # Get first frame
            result = _vrs_provider.get_image_data_by_index(stream_id, 0)

        if result is None:
            return jsonify({'error': f'No frame found for timestamp {timestamp_s}s'}), 404

        # Unpack result: (ImageData, ImageDataRecord)
        if isinstance(result, tuple) and len(result) >= 2:
            image_data, image_record = result[0], result[1]
        else:
            return jsonify({'error': f'Unexpected image data format'}), 500

        # Get timestamp from record
        frame_timestamp_ns = image_record.capture_timestamp_ns

        # Convert to numpy array
        image_array = image_data.to_numpy_array()

        # Draw hand skeleton overlay on the raw image (before rotation)
        if show_skeleton == '1' and vrs_path_param and mps_dir_param and os.path.isdir(mps_dir_param):
            try:
                import cv2
                import numpy as np
                session = _get_or_create_aria_session(vrs_path_param, mps_dir_param)
                if session is not None:
                    hands = session.project_hands(
                        frame_timestamp_ns, "camera-rgb",
                        confidence_threshold=0.3,
                        max_slop_ns=int(500e6)
                    )
                    # Draw on a copy of the image array
                    draw_img = image_array.copy()
                    if len(draw_img.shape) == 2:
                        draw_img = cv2.cvtColor(draw_img, cv2.COLOR_GRAY2BGR)
                    elif draw_img.shape[2] == 1:
                        draw_img = cv2.cvtColor(draw_img[:, :, 0], cv2.COLOR_GRAY2BGR)
                    elif draw_img.shape[2] == 3:
                        draw_img = cv2.cvtColor(draw_img, cv2.COLOR_RGB2BGR)

                    _HAND_CONNECTIONS = {
                        'wrist_palm': {'conn': [(5, 20)], 'cl': (255, 255, 255), 'cr': (200, 200, 200)},
                        'thumb':  {'conn': [(5, 6), (6, 7), (7, 0)], 'cl': (0, 0, 255), 'cr': (0, 0, 200)},
                        'index':  {'conn': [(5, 8), (8, 9), (9, 10), (10, 1)], 'cl': (0, 165, 255), 'cr': (0, 120, 200)},
                        'middle': {'conn': [(5, 11), (11, 12), (12, 13), (13, 2)], 'cl': (0, 255, 255), 'cr': (0, 200, 200)},
                        'ring':   {'conn': [(5, 14), (14, 15), (15, 16), (16, 3)], 'cl': (0, 255, 0), 'cr': (0, 200, 0)},
                        'pinky':  {'conn': [(5, 17), (17, 18), (18, 19), (19, 4)], 'cl': (255, 0, 0), 'cr': (200, 0, 0)},
                        'palm':   {'conn': [(8, 20), (11, 20), (14, 20), (17, 20)], 'cl': (128, 0, 128), 'cr': (100, 0, 100)},
                    }

                    for side_key, is_left in [('left', True), ('right', False)]:
                        hand_data = hands.get(side_key)
                        if hand_data is None:
                            continue
                        coords, valid = hand_data  # (21,2), (21,)
                        if valid is None or not np.any(valid):
                            continue
                        # Draw connections
                        for finfo in _HAND_CONNECTIONS.values():
                            color = finfo['cl'] if is_left else finfo['cr']
                            for si, ei in finfo['conn']:
                                if si < len(coords) and ei < len(coords) and valid[si] and valid[ei]:
                                    p1 = (int(round(coords[si][0])), int(round(coords[si][1])))
                                    p2 = (int(round(coords[ei][0])), int(round(coords[ei][1])))
                                    cv2.line(draw_img, p1, p2, color, 2, cv2.LINE_AA)
                        # Draw keypoints
                        for i in range(len(coords)):
                            if not valid[i]:
                                continue
                            c = (int(round(coords[i][0])), int(round(coords[i][1])))
                            r = 6 if i == 5 else 4
                            cv2.circle(draw_img, c, r, (255, 255, 255), -1, cv2.LINE_AA)
                            cv2.circle(draw_img, c, r, (0, 0, 0), 1, cv2.LINE_AA)
                            if i == 5:
                                lbl = "L" if is_left else "R"
                                cv2.putText(draw_img, lbl, (c[0] + 8, c[1]),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
                                cv2.putText(draw_img, lbl, (c[0] + 8, c[1]),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1, cv2.LINE_AA)

                    # Convert back to RGB for PIL
                    image_array = cv2.cvtColor(draw_img, cv2.COLOR_BGR2RGB)
            except Exception as e:
                print(f"[video_frame] Skeleton drawing error (non-fatal): {e}")

        # Handle grayscale or RGB
        if len(image_array.shape) == 2:
            img = Image.fromarray(image_array, mode='L')
        elif len(image_array.shape) == 3 and image_array.shape[2] == 1:
            img = Image.fromarray(image_array[:, :, 0], mode='L')
        else:
            img = Image.fromarray(image_array)

        # Rotate image 90 degrees clockwise (270 degrees counter-clockwise)
        img = img.rotate(-90, expand=True)

        # Encode to base64
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return jsonify({
            'image': f'data:image/jpeg;base64,{img_base64}',
            'timestamp_ns': int(frame_timestamp_ns),
            'timestamp_s': frame_timestamp_ns / 1e9,
            'width': image_array.shape[1],
            'height': image_array.shape[0],
            'camera': actual_camera
        })

    except Exception as e:
        import traceback
        print(f"[video_frame] Error: {e}")
        print(traceback.format_exc())
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


def _extract_frame_jpeg(frame_index, show_skeleton=False, vrs_path_param='', mps_dir_param=''):
    """Extract a single frame from VRS, rotate, encode as JPEG bytes.
    Uses LRU cache to avoid re-decoding the same frame."""
    global _frame_cache
    import io
    from PIL import Image

    cache_key = (frame_index, show_skeleton, vrs_path_param if show_skeleton else '')
    if cache_key in _frame_cache:
        _frame_cache.move_to_end(cache_key)
        return _frame_cache[cache_key]

    stream_id = _vrs_rgb_stream_id
    with _vrs_lock:
        result = _vrs_provider.get_image_data_by_index(stream_id, frame_index)
    if result is None:
        return None

    image_data, image_record = result[0], result[1]
    frame_timestamp_ns = image_record.capture_timestamp_ns
    image_array = image_data.to_numpy_array()

    # Optional skeleton overlay
    if show_skeleton and vrs_path_param and mps_dir_param and os.path.isdir(mps_dir_param):
        try:
            import cv2
            session = _get_or_create_aria_session(vrs_path_param, mps_dir_param)
            if session is not None:
                hands = session.project_hands(
                    frame_timestamp_ns, "camera-rgb",
                    confidence_threshold=0.3,
                    max_slop_ns=int(500e6)
                )
                draw_img = image_array.copy()
                if len(draw_img.shape) == 2:
                    draw_img = cv2.cvtColor(draw_img, cv2.COLOR_GRAY2BGR)
                elif draw_img.shape[2] == 1:
                    draw_img = cv2.cvtColor(draw_img[:, :, 0], cv2.COLOR_GRAY2BGR)
                elif draw_img.shape[2] == 3:
                    draw_img = cv2.cvtColor(draw_img, cv2.COLOR_RGB2BGR)

                _HAND_CONNECTIONS = {
                    'wrist_palm': {'conn': [(5, 20)], 'cl': (255, 255, 255), 'cr': (200, 200, 200)},
                    'thumb':  {'conn': [(5, 6), (6, 7), (7, 0)], 'cl': (0, 0, 255), 'cr': (0, 0, 200)},
                    'index':  {'conn': [(5, 8), (8, 9), (9, 10), (10, 1)], 'cl': (0, 165, 255), 'cr': (0, 120, 200)},
                    'middle': {'conn': [(5, 11), (11, 12), (12, 13), (13, 2)], 'cl': (0, 255, 255), 'cr': (0, 200, 200)},
                    'ring':   {'conn': [(5, 14), (14, 15), (15, 16), (16, 3)], 'cl': (0, 255, 0), 'cr': (0, 200, 0)},
                    'pinky':  {'conn': [(5, 17), (17, 18), (18, 19), (19, 4)], 'cl': (255, 0, 0), 'cr': (200, 0, 0)},
                    'palm':   {'conn': [(8, 20), (11, 20), (14, 20), (17, 20)], 'cl': (128, 0, 128), 'cr': (100, 0, 100)},
                }

                for side_key, is_left in [('left', True), ('right', False)]:
                    hand_data = hands.get(side_key)
                    if hand_data is None:
                        continue
                    coords, valid = hand_data
                    if valid is None or not np.any(valid):
                        continue
                    for finfo in _HAND_CONNECTIONS.values():
                        color = finfo['cl'] if is_left else finfo['cr']
                        for si, ei in finfo['conn']:
                            if si < len(coords) and ei < len(coords) and valid[si] and valid[ei]:
                                p1 = (int(round(coords[si][0])), int(round(coords[si][1])))
                                p2 = (int(round(coords[ei][0])), int(round(coords[ei][1])))
                                cv2.line(draw_img, p1, p2, color, 2, cv2.LINE_AA)
                    for i in range(len(coords)):
                        if not valid[i]:
                            continue
                        c = (int(round(coords[i][0])), int(round(coords[i][1])))
                        r = 6 if i == 5 else 4
                        cv2.circle(draw_img, c, r, (255, 255, 255), -1, cv2.LINE_AA)
                        cv2.circle(draw_img, c, r, (0, 0, 0), 1, cv2.LINE_AA)
                        if i == 5:
                            lbl = "L" if is_left else "R"
                            cv2.putText(draw_img, lbl, (c[0] + 8, c[1]),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
                            cv2.putText(draw_img, lbl, (c[0] + 8, c[1]),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1, cv2.LINE_AA)

                image_array = cv2.cvtColor(draw_img, cv2.COLOR_BGR2RGB)
        except Exception as e:
            print(f"[_extract_frame_jpeg] Skeleton error (non-fatal): {e}")

    # Convert to PIL, rotate, encode JPEG
    if len(image_array.shape) == 2:
        img = Image.fromarray(image_array, mode='L')
    elif len(image_array.shape) == 3 and image_array.shape[2] == 1:
        img = Image.fromarray(image_array[:, :, 0], mode='L')
    else:
        img = Image.fromarray(image_array)

    img = img.rotate(-90, expand=True)

    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=85)
    jpeg_bytes = buffer.getvalue()

    # Cache the result
    _frame_cache[cache_key] = jpeg_bytes
    while len(_frame_cache) > _FRAME_CACHE_MAX:
        _frame_cache.popitem(last=False)

    return jpeg_bytes


@app.route('/gripper/video_frame_raw', methods=['GET'])
def get_video_frame_raw():
    """Get video frame as raw JPEG bytes (no base64, no JSON wrapper)"""
    global _vrs_provider, _vrs_time_range_ns, _vrs_num_frames, _vrs_rgb_stream_id

    if not VRS_PROVIDER_AVAILABLE or _vrs_provider is None:
        print("[video_frame_raw] REJECTED: VRS not initialized")
        return 'VRS not initialized', 400

    try:
        import time as _t
        from flask import make_response

        _t0 = _t.time()

        frame_index = request.args.get('frame_index', type=int)
        timestamp_s = request.args.get('timestamp', type=float)
        show_skeleton = request.args.get('skeleton', '0') == '1'
        vrs_path_param = request.args.get('vrs_path', '')
        mps_dir_param = request.args.get('mps_dir', '')

        # Calculate frame index from timestamp
        if frame_index is not None:
            target_index = max(0, min(frame_index, _vrs_num_frames - 1))
        elif timestamp_s is not None and _vrs_time_range_ns[0] > 0:
            duration_s = (_vrs_time_range_ns[1] - _vrs_time_range_ns[0]) / 1e9
            if duration_s > 0 and _vrs_num_frames > 0:
                relative_pos = timestamp_s / duration_s if duration_s > 0 else 0
                target_index = int(relative_pos * (_vrs_num_frames - 1))
                target_index = max(0, min(target_index, _vrs_num_frames - 1))
            else:
                target_index = 0
        else:
            target_index = 0

        jpeg_bytes = _extract_frame_jpeg(target_index, show_skeleton, vrs_path_param, mps_dir_param)
        _dt = (_t.time() - _t0) * 1000
        if jpeg_bytes is None:
            print(f"[video_frame_raw] frame {target_index} -> None ({_dt:.0f}ms)")
            return 'Frame not found', 404

        print(f"[video_frame_raw] frame {target_index} -> {len(jpeg_bytes)/1024:.0f}KB ({_dt:.0f}ms) skeleton={show_skeleton}")

        response = make_response(jpeg_bytes)
        response.headers['Content-Type'] = 'image/jpeg'
        response.headers['Cache-Control'] = 'public, max-age=3600'
        response.headers['X-Frame-Index'] = str(target_index)
        return response

    except Exception as e:
        import traceback
        print(f"[video_frame_raw] ERROR: {e}")
        print(traceback.format_exc())
        return str(e), 500


@app.route('/gripper/generate_video', methods=['POST'])
def generate_video():
    """Pre-generate MP4 video from all VRS RGB frames for smooth playback."""
    global _vrs_provider, _vrs_num_frames, _vrs_rgb_stream_id, _vrs_time_range_ns
    global _video_generating, _video_progress, _video_cached_path, _video_progress_file, _video_gen_proc

    if not VRS_PROVIDER_AVAILABLE or _vrs_provider is None:
        return jsonify({'error': 'VRS not initialized'}), 400

    if _video_generating:
        return jsonify({'status': 'generating', 'progress': _video_progress})

    try:
        import subprocess
        from PIL import Image

        vrs_path = request.json.get('vrs_path', _vrs_path)

        # Check for cached MP4
        if vrs_path:
            cache_dir = os.path.join(os.path.dirname(vrs_path), '.cache')
            stem = os.path.splitext(os.path.basename(vrs_path))[0]
            mp4_path = os.path.join(cache_dir, f'{stem}_rgb.mp4')
        else:
            cache_dir = tempfile.mkdtemp()
            mp4_path = os.path.join(cache_dir, 'rgb_preview.mp4')

        if os.path.exists(mp4_path):
            duration_s = (_vrs_time_range_ns[1] - _vrs_time_range_ns[0]) / 1e9
            fps = _vrs_num_frames / duration_s if duration_s > 0 else 30
            _video_cached_path = mp4_path
            return jsonify({
                'video_url': f'/gripper/serve_video?path={mp4_path}',
                'num_frames': _vrs_num_frames,
                'fps': round(fps, 2),
                'duration_s': round(duration_s, 3),
                'from_cache': True
            })

        # Generate MP4 in background SUBPROCESS (avoids GIL blocking Flask)
        os.makedirs(cache_dir, exist_ok=True)
        _video_generating = True
        _video_progress = 0

        # Progress file for subprocess communication
        _video_progress_file = os.path.join(cache_dir, f'{stem}_progress.txt')
        with open(_video_progress_file, 'w') as f:
            f.write('0')

        # Launch standalone script as subprocess
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generate_mp4.py')
        python_path = sys.executable
        _video_gen_proc = subprocess.Popen(
            [python_path, script_path, vrs_path, mp4_path, _video_progress_file],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )

        # Monitor subprocess in a lightweight thread (no GIL-heavy work)
        def _monitor():
            global _video_generating, _video_cached_path, _video_gen_proc
            try:
                stdout, _ = _video_gen_proc.communicate()
                if stdout:
                    print(stdout.decode(errors='replace'))
                if _video_gen_proc.returncode == 0 and os.path.exists(mp4_path):
                    _video_cached_path = mp4_path
                    print(f"[generate_video] MP4 subprocess completed successfully")
                else:
                    print(f"[generate_video] MP4 subprocess failed with code {_video_gen_proc.returncode}")
            except Exception as e:
                print(f"[generate_video] Monitor error: {e}")
            finally:
                _video_generating = False
                _video_gen_proc = None

        monitor_thread = threading.Thread(target=_monitor, daemon=True)
        monitor_thread.start()

        duration_s = (_vrs_time_range_ns[1] - _vrs_time_range_ns[0]) / 1e9
        fps = _vrs_num_frames / duration_s if duration_s > 0 else 30
        return jsonify({
            'status': 'generating',
            'progress': 0,
            'num_frames': _vrs_num_frames,
            'fps': round(fps, 2),
            'duration_s': round(duration_s, 3)
        })

    except Exception as e:
        import traceback
        _video_generating = False
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@app.route('/gripper/video_progress', methods=['GET'])
def video_progress():
    """Check MP4 video generation progress."""
    global _video_generating, _video_progress, _video_cached_path, _video_progress_file
    if _video_cached_path and os.path.exists(_video_cached_path):
        duration_s = (_vrs_time_range_ns[1] - _vrs_time_range_ns[0]) / 1e9
        fps = _vrs_num_frames / duration_s if duration_s > 0 else 30
        return jsonify({
            'status': 'done',
            'progress': 100,
            'video_url': f'/gripper/serve_video?path={_video_cached_path}',
            'fps': round(fps, 2),
            'duration_s': round(duration_s, 3)
        })
    # Read progress from subprocess progress file
    if _video_progress_file and os.path.exists(_video_progress_file):
        try:
            with open(_video_progress_file, 'r') as f:
                _video_progress = int(f.read().strip())
        except (ValueError, IOError):
            pass
    return jsonify({
        'status': 'generating' if _video_generating else 'idle',
        'progress': _video_progress
    })


@app.route('/gripper/serve_video', methods=['GET'])
def serve_video():
    """Serve pre-generated MP4 video file with Range request support and browser caching."""
    path = request.args.get('path')
    if path and os.path.exists(path):
        response = send_file(path, mimetype='video/mp4')
        response.headers['Cache-Control'] = 'public, max-age=86400'  # 浏览器缓存24小时
        return response
    return jsonify({'error': 'Video not found'}), 404


@app.route('/gripper/vrs_status')
def vrs_status():
    """Check VRS session status"""
    global _vrs_provider, _vrs_path, _vrs_cameras

    return jsonify({
        'vrs_provider_available': VRS_PROVIDER_AVAILABLE,
        'session_initialized': _vrs_provider is not None,
        'vrs_path': _vrs_path,
        'cameras': _vrs_cameras
    })


@app.route('/api/hand_landmarks', methods=['GET'])
def get_hand_landmarks():
    """Get projected hand landmarks for a given VRS frame timestamp"""
    import numpy as np

    timestamp_ns = request.args.get('timestamp_ns', type=int)
    vrs_path = request.args.get('vrs_path')
    mps_dir = request.args.get('mps_dir')

    if timestamp_ns is None or not vrs_path or not mps_dir:
        return jsonify({'error': 'Missing required parameters: timestamp_ns, vrs_path, mps_dir'}), 400

    if not os.path.exists(vrs_path):
        return jsonify({'error': f'VRS file not found: {vrs_path}'}), 404
    if not os.path.isdir(mps_dir):
        return jsonify({'error': f'MPS directory not found: {mps_dir}'}), 404

    session = _get_or_create_aria_session(vrs_path, mps_dir)
    if session is None:
        return jsonify({'error': 'Failed to create AriaSession'}), 500

    try:
        hands = session.project_hands(
            timestamp_ns,
            "camera-rgb",
            confidence_threshold=0.3,
            max_slop_ns=int(500e6)  # 500ms tolerance for ~10Hz hand tracking
        )

        # The video_frame endpoint rotates image by -90° (clockwise 90°).
        # Original image shape: (H_orig, W_orig). After rotation: (W_orig, H_orig).
        # For the coordinate transform:
        #   u_rotated = H_orig - 1 - v_orig
        #   v_rotated = u_orig
        # We need the original image dimensions. Get from VRS provider.
        # The video_frame endpoint returns width=image_array.shape[1] (W_orig),
        # height=image_array.shape[0] (H_orig) BEFORE rotation.
        # We can get these from the VRS provider directly.
        global _aria_rgb_h_orig
        H_orig = _aria_rgb_h_orig
        if H_orig is None and _vrs_provider is not None and _vrs_rgb_stream_id is not None:
            try:
                test_result = _vrs_provider.get_image_data_by_index(_vrs_rgb_stream_id, 0)
                if test_result and len(test_result) >= 2:
                    arr = test_result[0].to_numpy_array()
                    H_orig = arr.shape[0]
                    _aria_rgb_h_orig = H_orig
            except:
                pass

        # If VRS provider not yet initialized, open it briefly to get dimensions
        if H_orig is None:
            try:
                tmp_provider = vrs_data_provider_module.create_vrs_data_provider(vrs_path)
                for sid in tmp_provider.get_all_streams():
                    label = tmp_provider.get_label_from_stream_id(sid)
                    if 'rgb' in label.lower():
                        r = tmp_provider.get_image_data_by_index(sid, 0)
                        if r and len(r) >= 2:
                            H_orig = r[0].to_numpy_array().shape[0]
                            _aria_rgb_h_orig = H_orig
                        break
            except:
                pass

        result = {'left': None, 'right': None, 'timestamp_ns': timestamp_ns}

        for side in ['left', 'right']:
            hand_data = hands.get(side)
            if hand_data is None:
                continue
            pixel_coords, valid_mask = hand_data  # (21,2), (21,)

            landmarks = []
            valids = []
            for i in range(len(pixel_coords)):
                u_orig, v_orig = float(pixel_coords[i][0]), float(pixel_coords[i][1])
                is_valid = bool(valid_mask[i]) if valid_mask is not None else True

                # Mark NaN coordinates as invalid
                if np.isnan(u_orig) or np.isnan(v_orig):
                    is_valid = False
                    u_orig = 0.0
                    v_orig = 0.0

                # Apply rotation compensation (-90° = clockwise 90°)
                if H_orig is not None:
                    u_rot = H_orig - 1 - v_orig
                    v_rot = u_orig
                else:
                    u_rot = u_orig
                    v_rot = v_orig

                landmarks.append([u_rot, v_rot])
                valids.append(is_valid)

            result[side] = {
                'landmarks': landmarks,
                'valid': valids
            }

        return jsonify(result)

    except Exception as e:
        import traceback
        print(f"[hand_landmarks] Error: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# ==================== IK Service ====================
# Global IK chain object
ik_chain = None
ik_joint_names = []
ik_active_indices = []

# Check for ikpy
IKPY_AVAILABLE = False
try:
    import ikpy
    from ikpy.chain import Chain
    IKPY_AVAILABLE = True
except ImportError:
    print("Warning: ikpy not installed. IK service will not be available.")
    print("Install with: pip install ikpy")


def load_ik_chain(urdf_path: str, base_link: str = "base_link", end_link: str = "gripper_frame_link"):
    """Load URDF and create ikpy chain for IK calculations."""
    global ik_chain, ik_joint_names, ik_active_indices

    if not IKPY_AVAILABLE:
        raise RuntimeError("ikpy not installed")

    if not os.path.exists(urdf_path):
        raise FileNotFoundError(f"URDF file not found: {urdf_path}")

    import warnings

    # First, create chain to determine link types
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
        ik_chain = Chain.from_urdf_file(
            urdf_path,
            base_elements=[base_link],
            active_links_mask=active_links_mask,
            name="so101"
        )

    # Extract joint names and identify active joints
    ik_joint_names = []
    ik_active_indices = []

    for i, link in enumerate(ik_chain.links):
        if hasattr(link, 'name') and link.name:
            if hasattr(link, 'joint_type') and link.joint_type != 'fixed':
                ik_joint_names.append(link.name)
                ik_active_indices.append(i)

    print(f"IK: Loaded URDF with {len(ik_joint_names)} active joints: {ik_joint_names}")
    return ik_chain


def compute_jacobian(chain, angles, active_indices, delta=1e-6):
    """Compute numerical Jacobian matrix for the chain."""
    fk = chain.forward_kinematics(angles)
    end_pos = fk[:3, 3]

    n_active = len(active_indices)
    jacobian = np.zeros((3, n_active))

    for j, idx in enumerate(active_indices):
        angles_plus = angles.copy()
        angles_plus[idx] += delta
        fk_plus = chain.forward_kinematics(angles_plus)
        pos_plus = fk_plus[:3, 3]
        jacobian[:, j] = (pos_plus - end_pos) / delta

    return jacobian


def jacobian_transpose_ik(chain, target_position, active_indices, initial_angles=None,
                          max_iter=100, tolerance=1e-4, alpha=0.1):
    """
    Jacobian Transpose IK solver.
    Simple and fast, good for real-time applications.
    Uses J^T * error instead of inverting the Jacobian.
    """
    if initial_angles is None:
        angles = np.zeros(len(chain.links))
    else:
        angles = initial_angles.copy()

    for iteration in range(max_iter):
        fk = chain.forward_kinematics(angles)
        end_pos = fk[:3, 3]
        error = target_position - end_pos
        error_norm = np.linalg.norm(error)

        if error_norm < tolerance:
            break

        # Compute Jacobian
        J = compute_jacobian(chain, angles, active_indices)

        # Jacobian transpose method: delta_theta = alpha * J^T * error
        delta_theta = alpha * J.T @ error

        # Apply to active joints
        for j, idx in enumerate(active_indices):
            angles[idx] += delta_theta[j]

    return angles


def jacobian_pseudoinverse_ik(chain, target_position, active_indices, initial_angles=None,
                               max_iter=100, tolerance=1e-4, damping=0.01):
    """
    Jacobian Pseudoinverse (Damped Least Squares / Levenberg-Marquardt) IK solver.
    More accurate than transpose, handles singularities better.
    """
    if initial_angles is None:
        angles = np.zeros(len(chain.links))
    else:
        angles = initial_angles.copy()

    for iteration in range(max_iter):
        fk = chain.forward_kinematics(angles)
        end_pos = fk[:3, 3]
        error = target_position - end_pos
        error_norm = np.linalg.norm(error)

        if error_norm < tolerance:
            break

        # Compute Jacobian
        J = compute_jacobian(chain, angles, active_indices)

        # Damped pseudoinverse: (J^T * J + lambda^2 * I)^-1 * J^T
        # Or equivalently: J^T * (J * J^T + lambda^2 * I)^-1
        JJT = J @ J.T
        damped = JJT + damping**2 * np.eye(3)

        try:
            delta_theta = J.T @ np.linalg.solve(damped, error)
        except np.linalg.LinAlgError:
            # Fallback to pseudoinverse if solve fails
            delta_theta = np.linalg.pinv(J) @ error

        # Apply to active joints
        for j, idx in enumerate(active_indices):
            angles[idx] += delta_theta[j]

    return angles


def fabrik_ik(chain, target_position, active_indices, initial_angles=None,
              max_iter=100, tolerance=1e-4):
    """
    FABRIK (Forward And Backward Reaching Inverse Kinematics) solver.
    Very fast and intuitive, works by iteratively adjusting joint positions.
    """
    if initial_angles is None:
        angles = np.zeros(len(chain.links))
    else:
        angles = initial_angles.copy()

    # Get link lengths from chain
    n_links = len(active_indices)
    if n_links < 2:
        return angles

    # Compute initial joint positions
    def get_joint_positions(angles):
        positions = []
        for i in range(len(chain.links)):
            partial_angles = angles.copy()
            for j in range(i + 1, len(chain.links)):
                partial_angles[j] = 0
            fk = chain.forward_kinematics(partial_angles)
            positions.append(fk[:3, 3].copy())
        return positions

    # Get base position (fixed)
    base_pos = np.array([0, 0, 0])
    fk_base = chain.forward_kinematics(np.zeros(len(chain.links)))
    base_pos = fk_base[:3, 3].copy()

    for iteration in range(max_iter):
        fk = chain.forward_kinematics(angles)
        end_pos = fk[:3, 3]
        error = np.linalg.norm(target_position - end_pos)

        if error < tolerance:
            break

        # Get current joint positions
        positions = get_joint_positions(angles)

        # Backward reaching: move end effector to target
        positions[-1] = target_position.copy()
        for i in range(len(positions) - 2, -1, -1):
            direction = positions[i] - positions[i + 1]
            dist = np.linalg.norm(direction)
            if dist > 1e-6:
                # Estimate link length from current config
                link_len = np.linalg.norm(positions[i + 1] - positions[i]) if i < len(positions) - 1 else 0.05
                direction = direction / dist * link_len
            positions[i] = positions[i + 1] + direction

        # Forward reaching: fix base position
        positions[0] = base_pos.copy()
        for i in range(1, len(positions)):
            direction = positions[i] - positions[i - 1]
            dist = np.linalg.norm(direction)
            if dist > 1e-6:
                link_len = np.linalg.norm(positions[i] - positions[i - 1])
                if link_len < 1e-6:
                    link_len = 0.05
                direction = direction / dist * link_len
            positions[i] = positions[i - 1] + direction

        # Convert positions back to joint angles (approximate)
        # This is a simplified conversion
        for j, idx in enumerate(active_indices):
            if j < len(positions) - 1:
                # Compute angle from position change
                current_fk = chain.forward_kinematics(angles)
                current_pos = current_fk[:3, 3]
                target_dir = positions[-1] - current_pos
                if np.linalg.norm(target_dir) > 1e-6:
                    angles[idx] += 0.1 * np.arctan2(target_dir[1], target_dir[0])

    return angles


def gradient_descent_ik(chain, target_position, active_indices, initial_angles=None,
                        max_iter=100, tolerance=1e-4, learning_rate=0.5):
    """
    Gradient Descent IK solver.
    Simple optimization approach, minimizes position error directly.
    """
    if initial_angles is None:
        angles = np.zeros(len(chain.links))
    else:
        angles = initial_angles.copy()

    for iteration in range(max_iter):
        fk = chain.forward_kinematics(angles)
        end_pos = fk[:3, 3]
        error = target_position - end_pos
        error_norm = np.linalg.norm(error)

        if error_norm < tolerance:
            break

        # Compute gradient numerically
        delta = 1e-6
        gradient = np.zeros(len(active_indices))

        for j, idx in enumerate(active_indices):
            angles_plus = angles.copy()
            angles_plus[idx] += delta
            fk_plus = chain.forward_kinematics(angles_plus)
            pos_plus = fk_plus[:3, 3]
            error_plus = np.linalg.norm(target_position - pos_plus)

            angles_minus = angles.copy()
            angles_minus[idx] -= delta
            fk_minus = chain.forward_kinematics(angles_minus)
            pos_minus = fk_minus[:3, 3]
            error_minus = np.linalg.norm(target_position - pos_minus)

            gradient[j] = (error_plus - error_minus) / (2 * delta)

        # Update angles
        for j, idx in enumerate(active_indices):
            angles[idx] -= learning_rate * gradient[j]

    return angles


def ccd_ik(chain, target_position, active_indices=None, initial_angles=None, max_iter=100, tolerance=1e-4):
    """
    Cyclic Coordinate Descent (CCD) IK solver.
    Fast iterative method that adjusts one joint at a time.
    """
    if initial_angles is None:
        angles = np.zeros(len(chain.links))
    else:
        angles = initial_angles.copy()

    for iteration in range(max_iter):
        # Get current end effector position
        fk = chain.forward_kinematics(angles)
        end_pos = fk[:3, 3]
        error = np.linalg.norm(target_position - end_pos)

        if error < tolerance:
            break

        # Iterate through active joints from end to base
        for i in reversed(range(len(chain.links))):
            link = chain.links[i]
            if not hasattr(link, 'joint_type') or link.joint_type == 'fixed':
                continue

            # Get joint position
            partial_angles = angles.copy()
            partial_fk = chain.forward_kinematics(partial_angles)

            # Calculate rotation axis (simplified - assumes revolute joints around Z)
            joint_pos = partial_fk[:3, 3]

            # Vector from joint to end effector
            to_end = end_pos - joint_pos
            # Vector from joint to target
            to_target = target_position - joint_pos

            # Calculate angle adjustment
            if np.linalg.norm(to_end) > 1e-6 and np.linalg.norm(to_target) > 1e-6:
                to_end_norm = to_end / np.linalg.norm(to_end)
                to_target_norm = to_target / np.linalg.norm(to_target)
                dot = np.clip(np.dot(to_end_norm, to_target_norm), -1, 1)
                angle_diff = np.arccos(dot)
                cross = np.cross(to_end_norm, to_target_norm)
                if cross[2] < 0:
                    angle_diff = -angle_diff
                angles[i] += angle_diff * 0.5  # Damping factor

            # Update end effector position
            fk = chain.forward_kinematics(angles)
            end_pos = fk[:3, 3]

    return angles


@app.route('/ik', methods=['POST', 'OPTIONS'])
def compute_ik():
    """
    Compute inverse kinematics for target position.

    Request JSON:
        {
            "position": [x, y, z],             # Required: target position in meters
            "orientation": [roll, pitch, yaw], # Optional: target orientation in radians
            "initial_angles": [...]            # Optional: initial guess
            "solver": "L-BFGS-B"               # Optional: solver method
            "max_iter": 100                    # Optional: max iterations
        }

    Response JSON:
        {
            "success": true/false,
            "joint_angles": [...],
            "joint_names": [...],
            "end_position": [x, y, z],
            "position_error": float,
            "solver_used": string
        }
    """
    if request.method == 'OPTIONS':
        return '', 204

    if not IKPY_AVAILABLE:
        return jsonify({
            'success': False,
            'error': 'ikpy not installed. Install with: pip install ikpy'
        }), 500

    if ik_chain is None:
        return jsonify({
            'success': False,
            'error': 'IK chain not loaded. Call /ik/load_urdf first.'
        }), 500

    try:
        data = request.get_json()

        if not data or 'position' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: position'
            }), 400

        target_position = np.array(data['position'], dtype=float)
        if len(target_position) != 3:
            return jsonify({
                'success': False,
                'error': 'Position must be [x, y, z]'
            }), 400

        # Parse solver method
        solver_method = data.get('solver', 'L-BFGS-B')
        max_iter = int(data.get('max_iter', 100))

        # Parse optional orientation
        target_orientation = None
        if 'orientation' in data:
            orient = data['orientation']
            if len(orient) == 3:
                from scipy.spatial.transform import Rotation
                target_orientation = Rotation.from_euler('xyz', orient).as_matrix()

        # Parse initial angles
        initial_angles = None
        if 'initial_angles' in data:
            active_angles = np.array(data['initial_angles'], dtype=float)
            initial_angles = np.zeros(len(ik_chain.links))
            for idx, angle in zip(ik_active_indices, active_angles):
                initial_angles[idx] = angle

        # Compute IK with selected solver
        solver_used = solver_method
        custom_solvers = ['CCD', 'jacobian_transpose', 'jacobian_pinv', 'fabrik', 'gradient_descent']
        ikpy_solvers = ['least_squares', 'scalar']

        if solver_method in custom_solvers:
            # Use custom IK solvers
            if solver_method == 'CCD':
                result_angles = ccd_ik(
                    ik_chain,
                    target_position,
                    active_indices=ik_active_indices,
                    initial_angles=initial_angles,
                    max_iter=max_iter
                )
            elif solver_method == 'jacobian_transpose':
                result_angles = jacobian_transpose_ik(
                    ik_chain,
                    target_position,
                    ik_active_indices,
                    initial_angles=initial_angles,
                    max_iter=max_iter
                )
            elif solver_method == 'jacobian_pinv':
                result_angles = jacobian_pseudoinverse_ik(
                    ik_chain,
                    target_position,
                    ik_active_indices,
                    initial_angles=initial_angles,
                    max_iter=max_iter
                )
            elif solver_method == 'fabrik':
                result_angles = fabrik_ik(
                    ik_chain,
                    target_position,
                    ik_active_indices,
                    initial_angles=initial_angles,
                    max_iter=max_iter
                )
            elif solver_method == 'gradient_descent':
                result_angles = gradient_descent_ik(
                    ik_chain,
                    target_position,
                    ik_active_indices,
                    initial_angles=initial_angles,
                    max_iter=max_iter
                )
        elif solver_method in ikpy_solvers:
            # Use ikpy built-in solvers
            if target_orientation is not None:
                target_frame = np.eye(4)
                target_frame[:3, :3] = target_orientation
                target_frame[:3, 3] = target_position
                result_angles = ik_chain.inverse_kinematics(
                    target_frame,
                    initial_position=initial_angles,
                    orientation_mode="all",
                    optimizer=solver_method,
                    max_iter=max_iter
                )
            else:
                result_angles = ik_chain.inverse_kinematics(
                    target_position,
                    initial_position=initial_angles,
                    orientation_mode=None,
                    optimizer=solver_method,
                    max_iter=max_iter
                )
        else:
            # Fallback to default
            solver_used = 'least_squares'
            result_angles = ik_chain.inverse_kinematics(
                target_position,
                initial_position=initial_angles,
                orientation_mode=None,
                optimizer='least_squares',
                max_iter=max_iter
            )

        # Compute achieved position
        fk_result = ik_chain.forward_kinematics(result_angles)
        achieved_position = fk_result[:3, 3].tolist()

        # Extract active joint angles
        active_angles = [float(result_angles[i]) for i in ik_active_indices]
        position_error = np.linalg.norm(target_position - np.array(achieved_position))

        return jsonify({
            'success': True,
            'joint_angles': active_angles,
            'joint_names': ik_joint_names,
            'full_angles': result_angles.tolist(),
            'end_position': achieved_position,
            'position_error': float(position_error),
            'solver_used': solver_used,
            'max_iter': max_iter
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
    """Compute forward kinematics from joint angles."""
    if request.method == 'OPTIONS':
        return '', 204

    if not IKPY_AVAILABLE or ik_chain is None:
        return jsonify({'success': False, 'error': 'IK chain not available'}), 500

    try:
        data = request.get_json()
        if not data or 'joint_angles' not in data:
            return jsonify({'success': False, 'error': 'Missing joint_angles'}), 400

        active_angles = np.array(data['joint_angles'], dtype=float)
        full_angles = np.zeros(len(ik_chain.links))
        for idx, angle in zip(ik_active_indices, active_angles):
            full_angles[idx] = angle

        fk_result = ik_chain.forward_kinematics(full_angles)

        return jsonify({
            'success': True,
            'position': fk_result[:3, 3].tolist(),
            'orientation_matrix': fk_result[:3, :3].tolist(),
            'transform_matrix': fk_result.tolist()
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/ik/info', methods=['GET'])
def ik_info():
    """Get IK chain information."""
    if not IKPY_AVAILABLE:
        return jsonify({'success': False, 'error': 'ikpy not installed'}), 500

    if ik_chain is None:
        return jsonify({
            'success': False,
            'error': 'IK chain not loaded',
            'ikpy_available': True
        })

    links_info = []
    for link in ik_chain.links:
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
        'joint_names': ik_joint_names,
        'active_joint_indices': ik_active_indices,
        'chain_length': len(ik_chain.links),
        'num_active_joints': len(ik_joint_names),
        'links': links_info
    })


@app.route('/ik/load_urdf', methods=['POST'])
def ik_load_urdf():
    """Load URDF for IK calculations."""
    if not IKPY_AVAILABLE:
        return jsonify({'success': False, 'error': 'ikpy not installed'}), 500

    try:
        data = request.get_json()
        if not data or 'urdf_path' not in data:
            return jsonify({'success': False, 'error': 'Missing urdf_path'}), 400

        urdf_path = data['urdf_path']
        base_link = data.get('base_link', 'base_link')
        end_link = data.get('end_link', 'gripper_frame_link')

        load_ik_chain(urdf_path, base_link, end_link)

        return jsonify({
            'success': True,
            'message': f'Loaded URDF with {len(ik_joint_names)} active joints',
            'joint_names': ik_joint_names
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'ik_available': IKPY_AVAILABLE,
        'ik_chain_loaded': ik_chain is not None
    })


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
    # use_reloader=False: prevent stat reloader from killing background threads (MP4 generation)
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5001)
