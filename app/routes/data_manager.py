"""
Data Manager routes - Browse and manage local data files
"""

import os
import json
from pathlib import Path
from flask import Blueprint, render_template, jsonify, request
from aria_haptic_align import ARIA_API_AVAILABLE

bp = Blueprint('data_manager', __name__, url_prefix='/data')

# Default data root directory
DEFAULT_DATA_ROOT = os.path.expanduser('~/Documents/Aria_data/IROS_data')


def get_data_root():
    """Get the configured data root directory"""
    return os.environ.get('ARIA_DATA_ROOT', DEFAULT_DATA_ROOT)


def scan_data_directory(directory):
    """
    Scan a directory for VRS and CSV files, grouping them by base name.

    Returns:
        List of data groups with VRS, CSV, and MPS folder info
    """
    data_groups = {}
    directory = Path(directory)

    if not directory.exists():
        return []

    # First, scan for offset config files to know which groups have alignment
    offset_configs = {}
    for config_file in directory.glob('*_offset_config.json'):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                base_name = config.get('base_name', config_file.stem.replace('_offset_config', ''))
                offset_configs[base_name] = {
                    'current_offset': config.get('current_offset'),
                    'optimal_offset': config.get('optimal_offset'),
                    'similarity': config.get('similarity'),
                    'timestamp': config.get('timestamp'),
                    'config_path': str(config_file)
                }
        except:
            pass

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
                'offset_config': offset_configs.get(base_name)
            }

        data_groups[base_name]['vrs_file'] = str(vrs_file)
        data_groups[base_name]['size_mb'] = round(vrs_file.stat().st_size / (1024 * 1024), 1)

        # Check for corresponding JSON
        json_file = vrs_file.with_suffix('.vrs.json')
        if json_file.exists():
            data_groups[base_name]['vrs_json'] = str(json_file)

    # Scan for CSV files (haptic data)
    for csv_file in directory.glob('*.csv'):
        # Try to match CSV to VRS by finding common base name
        csv_name = csv_file.stem.lower()
        matched = False

        for base_name in list(data_groups.keys()):
            # Check if CSV name contains the VRS base name (case insensitive)
            if base_name.lower().replace('_', '') in csv_name.replace('_', ''):
                data_groups[base_name]['csv_files'].append({
                    'path': str(csv_file),
                    'name': csv_file.name,
                    'size_mb': round(csv_file.stat().st_size / (1024 * 1024), 2)
                })
                matched = True
                break

        # If no match found, create standalone CSV entry
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
                    'offset_config': offset_configs.get(csv_base)
                }
            data_groups[csv_base]['csv_files'].append({
                'path': str(csv_file),
                'name': csv_file.name,
                'size_mb': round(csv_file.stat().st_size / (1024 * 1024), 2)
            })

    # Scan for MPS folders
    for mps_folder in directory.glob('mps_*'):
        if mps_folder.is_dir():
            # Extract VRS name from mps folder name
            mps_name = mps_folder.name
            for base_name in data_groups:
                if base_name.lower() in mps_name.lower():
                    data_groups[base_name]['mps_folder'] = str(mps_folder)
                    # Check for hand tracking results
                    hand_tracking_file = mps_folder / 'hand_tracking' / 'hand_tracking_results.csv'
                    if hand_tracking_file.exists():
                        data_groups[base_name]['has_hand_tracking'] = True
                        data_groups[base_name]['hand_tracking_file'] = str(hand_tracking_file)
                    break

    # Convert to list and sort by name
    result = list(data_groups.values())
    result.sort(key=lambda x: x['name'])
    return result


def scan_subdirectories(root_dir):
    """
    Scan root directory for subdirectories containing data.

    Returns:
        List of subdirectory info dicts
    """
    root = Path(root_dir)
    subdirs = []

    if not root.exists():
        return subdirs

    for item in sorted(root.iterdir()):
        if item.is_dir() and not item.name.startswith('.'):
            # Count files
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


@bp.route('/')
def data_manager():
    """Render data manager page"""
    return render_template('data_manager.html',
                         aria_api_available=ARIA_API_AVAILABLE,
                         default_data_root=get_data_root())


@bp.route('/api/directories')
def list_directories():
    """List available data directories"""
    root_dir = request.args.get('root', get_data_root())

    try:
        # Get subdirectories
        subdirs = scan_subdirectories(root_dir)

        # Also scan root directory for files
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


@bp.route('/api/files')
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


@bp.route('/api/file_info')
def file_info():
    """Get detailed info about a specific data group"""
    vrs_path = request.args.get('vrs_path')
    csv_path = request.args.get('csv_path')
    mps_folder = request.args.get('mps_folder')

    info = {
        'vrs': None,
        'csv': None,
        'mps': None
    }

    try:
        if vrs_path and os.path.exists(vrs_path):
            vrs_file = Path(vrs_path)
            info['vrs'] = {
                'path': vrs_path,
                'name': vrs_file.name,
                'size_mb': round(vrs_file.stat().st_size / (1024 * 1024), 1),
                'modified': vrs_file.stat().st_mtime
            }

            # Try to read VRS JSON metadata
            json_path = vrs_path + '.json'
            if os.path.exists(json_path):
                with open(json_path, 'r') as f:
                    info['vrs']['metadata'] = json.load(f)

        if csv_path and os.path.exists(csv_path):
            csv_file = Path(csv_path)
            info['csv'] = {
                'path': csv_path,
                'name': csv_file.name,
                'size_mb': round(csv_file.stat().st_size / (1024 * 1024), 2),
                'modified': csv_file.stat().st_mtime
            }

            # Get line count (approximate sample count)
            with open(csv_path, 'r') as f:
                line_count = sum(1 for _ in f) - 1  # Subtract header
            info['csv']['sample_count'] = line_count

        if mps_folder and os.path.exists(mps_folder):
            mps_path = Path(mps_folder)
            info['mps'] = {
                'path': mps_folder,
                'name': mps_path.name,
                'has_hand_tracking': (mps_path / 'hand_tracking' / 'hand_tracking_results.csv').exists(),
                'has_eye_tracking': (mps_path / 'eye_tracking').exists(),
                'has_slam': (mps_path / 'slam').exists()
            }

        return jsonify({
            'success': True,
            'info': info
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/api/load_for_alignment', methods=['POST'])
def load_for_alignment():
    """
    Prepare data files for alignment by returning paths.
    This allows the alignment page to load files directly from server.
    """
    data = request.get_json()

    vrs_path = data.get('vrs_path')
    csv_path = data.get('csv_path')
    mps_path = data.get('mps_path')

    result = {
        'success': True,
        'files': {}
    }

    try:
        if vrs_path and os.path.exists(vrs_path):
            result['files']['vrs'] = vrs_path

        if csv_path and os.path.exists(csv_path):
            result['files']['haptic_csv'] = csv_path

        if mps_path and os.path.exists(mps_path):
            # Find hand tracking CSV
            hand_tracking_file = os.path.join(mps_path, 'hand_tracking', 'hand_tracking_results.csv')
            if os.path.exists(hand_tracking_file):
                result['files']['mps_csv'] = hand_tracking_file

        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/api/save_offset', methods=['POST'])
def save_offset():
    """
    Save offset configuration to a JSON file in the same directory as the data.
    Auto-saves based on the haptic CSV file location.
    """
    data = request.get_json()

    haptic_path = data.get('haptic_path')
    mps_path = data.get('mps_path')
    vrs_path = data.get('vrs_path')
    current_offset = data.get('current_offset')
    optimal_offset = data.get('optimal_offset')
    similarity = data.get('similarity')
    method = data.get('method')
    parameters = data.get('parameters', {})

    # Determine save directory based on available paths
    save_dir = None
    base_name = None

    if haptic_path and os.path.exists(haptic_path):
        save_dir = os.path.dirname(haptic_path)
        base_name = Path(haptic_path).stem
    elif mps_path and os.path.exists(mps_path):
        # MPS path is usually like /path/mps_xxx/hand_tracking/hand_tracking_results.csv
        # Go up to the parent directory containing mps folder
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
        # Create offset config
        from datetime import datetime
        config = {
            'timestamp': datetime.now().isoformat(),
            'base_name': base_name,
            'current_offset': current_offset,
            'optimal_offset': optimal_offset,
            'similarity': similarity,
            'method': method,
            'parameters': parameters,
            'files': {
                'haptic_csv': haptic_path,
                'mps_csv': mps_path,
                'vrs_file': vrs_path
            }
        }

        # Save to JSON file
        config_filename = f"{base_name}_offset_config.json"
        config_path = os.path.join(save_dir, config_filename)

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


@bp.route('/api/get_offset_config')
def get_offset_config():
    """
    Get saved offset configuration for a data group.
    """
    base_name = request.args.get('base_name')
    directory = request.args.get('directory', get_data_root())

    if not base_name:
        return jsonify({
            'success': False,
            'error': 'base_name is required'
        }), 400

    try:
        config_path = os.path.join(directory, f"{base_name}_offset_config.json")

        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            return jsonify({
                'success': True,
                'config': config
            })
        else:
            return jsonify({
                'success': True,
                'config': None
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
