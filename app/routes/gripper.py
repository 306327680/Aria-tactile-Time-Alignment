"""
Gripper visualization routes
"""

import os
import subprocess
import sys
from flask import Blueprint, render_template, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename

from aria_haptic_align import ARIA_API_AVAILABLE
from app.utils.urdf_parser import parse_urdf
from app.utils.mps_loader import load_hand_landmarks
from app.utils.haptic_loader import load_haptic_data
from app.utils.file_utils import allowed_file


bp = Blueprint('gripper', __name__, url_prefix='/gripper')


# Path to the MANO shape fitting script
MANO_FIT_SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                               'scripts', 'fit_mano_shape_simple.py')


@bp.route('/')
def index():
    """Render gripper visualization page"""
    return render_template('gripper.html', aria_api_available=ARIA_API_AVAILABLE)


@bp.route('/data', methods=['POST'])
def gripper_data():
    """Load data for gripper visualization"""
    try:
        # MPS file is optional (for testing display without hand data)
        mps_file = request.files.get('mps_file')
        haptic_file = request.files.get('haptic_file')
        urdf_file = request.files.get('urdf_file')
        stl_files = request.files.getlist('stl_files')  # Multiple STL files (for manual upload)

        # Check if at least one file type is provided
        has_mps = mps_file and mps_file.filename != ''
        has_haptic = haptic_file and haptic_file.filename != ''
        has_urdf = urdf_file and urdf_file.filename != ''
        has_stl = any(stl_file and stl_file.filename != '' for stl_file in stl_files)

        print(f"File upload check: mps={has_mps}, haptic={has_haptic}, urdf={has_urdf}, stl={has_stl}")
        if haptic_file:
            print(f"Haptic file info: filename='{haptic_file.filename}'")

        if not (has_mps or has_urdf or has_stl):
            return jsonify({'error': '请至少上传以下文件之一：MPS CSV（手部数据）、URDF 或 STL（夹爪模型）'}), 400

        # Save MPS file if provided
        mps_path = None
        if has_mps:
            mps_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(mps_file.filename))
            mps_file.save(mps_path)

        # Save haptic file if provided
        haptic_path = None
        if has_haptic:
            haptic_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(haptic_file.filename))
            haptic_file.save(haptic_path)

        # Process URDF file if provided
        urdf_data = None
        urdf_path = None
        if urdf_file and urdf_file.filename:
            urdf_filename = secure_filename(urdf_file.filename)
            urdf_path = os.path.join(current_app.config['UPLOAD_FOLDER'], urdf_filename)
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
        stl_file_map_case_insensitive = {}  # Case-insensitive mapping
        missing_files = []  # Track missing STL files

        # If URDF is provided, expect STL files to be uploaded with matching names
        if urdf_data:
            # Create a map of expected mesh filenames from URDF (case-insensitive)
            expected_meshes = {}
            expected_meshes_lower = {}  # Lowercase version for case-insensitive matching
            for link in urdf_data['links']:
                for visual in link['visuals']:
                    if 'mesh' in visual and visual['mesh']:
                        mesh_name = os.path.basename(visual['mesh'])
                        expected_meshes[mesh_name] = visual['mesh']
                        expected_meshes_lower[mesh_name.lower()] = mesh_name

            # Match uploaded STL files with URDF mesh references (case-insensitive)
            uploaded_files_lower = {}  # Track uploaded files by lowercase name
            for stl_file in stl_files:
                if stl_file and stl_file.filename:
                    filename = secure_filename(stl_file.filename)
                    file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

                    if file_ext != 'stl':
                        continue  # Skip non-STL files

                    stl_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                    stl_file.save(stl_path)
                    stl_url = f'/gripper/uploaded_stl/{filename}'
                    stl_urls.append(stl_url)
                    stl_filenames.append(filename)

                    # Map by basename for matching with URDF (case-insensitive)
                    mesh_basename = os.path.basename(filename)
                    stl_file_map[mesh_basename] = stl_url
                    # Also create lowercase mapping for case-insensitive lookup
                    uploaded_files_lower[mesh_basename.lower()] = mesh_basename

            # Create case-insensitive mapping for frontend
            for lower_name, original_name in uploaded_files_lower.items():
                stl_file_map_case_insensitive[lower_name] = stl_file_map[original_name]

            # Check for missing files
            for link in urdf_data['links']:
                for visual in link['visuals']:
                    if 'mesh' in visual and visual['mesh']:
                        mesh_name = os.path.basename(visual['mesh'])
                        mesh_lower = mesh_name.lower()
                        # Check both exact match and case-insensitive match
                        if mesh_name not in stl_file_map and mesh_lower not in stl_file_map_case_insensitive:
                            missing_files.append(mesh_name)
        else:
            # Manual STL file upload (no URDF)
            for stl_file in stl_files:
                if stl_file and stl_file.filename:
                    filename = secure_filename(stl_file.filename)
                    file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
                    
                    if file_ext != 'stl':
                        return jsonify({'error': f'不支持的文件格式: {file_ext}。请上传 .stl 文件'}), 400
                    
                    stl_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                    stl_file.save(stl_path)
                    stl_urls.append(f'/gripper/uploaded_stl/{filename}')
                    stl_filenames.append(filename)

        # Load hand landmarks data from MPS CSV (if provided)
        hand_landmarks_data = None
        if mps_path:
            try:
                hand_landmarks_data = load_hand_landmarks(mps_path)
            except Exception as e:
                print(f"Warning: Failed to load hand landmarks from MPS file: {e}")
                hand_landmarks_data = None

        # Load haptic data (if provided)
        haptic_data = None
        print(f"Haptic path: {haptic_path}")
        if haptic_path:
            try:
                print(f"Loading haptic data from: {haptic_path}")
                haptic_data = load_haptic_data(haptic_path)
                print(f"Haptic data loaded: {haptic_data is not None}, sensors: {list(haptic_data.get('sensors', {}).keys()) if haptic_data else 'N/A'}")
            except Exception as e:
                import traceback
                print(f"Warning: Failed to load haptic data: {e}")
                print(traceback.format_exc())
                haptic_data = None
        else:
            print("No haptic path - haptic file was not uploaded or saved")

        # Return data
        result = {
            'hand_landmarks': hand_landmarks_data,  # Can be None if no MPS file
            'haptic_data': haptic_data,  # Can be None if no haptic file
            'stl_files': stl_filenames,
            'stl_urls': stl_urls,
            'stl_file_map': stl_file_map,
            'stl_file_map_case_insensitive': stl_file_map_case_insensitive
        }

        # Add URDF data if available
        if urdf_data:
            result['urdf'] = urdf_data
            result['urdf_filename'] = os.path.basename(urdf_path) if urdf_path else None

        # Add warning for missing STL files
        if missing_files:
            result['missing_stl_files'] = missing_files
            result['warning'] = f'以下 STL 文件在 URDF 中被引用但未上传: {", ".join(missing_files)}'

        return jsonify(result)

    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"Error: {error_msg}\n{stack_trace}")
        return jsonify({'error': error_msg, 'traceback': stack_trace}), 500


@bp.route('/uploaded_stl/<filename>')
def uploaded_stl(filename):
    """Serve uploaded STL files"""
    try:
        stl_path = os.path.join(current_app.config['UPLOAD_FOLDER'], secure_filename(filename))
        if os.path.exists(stl_path):
            return send_file(stl_path, mimetype='application/octet-stream')
        else:
            return jsonify({'error': 'STL file not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/fit_mano_shape', methods=['POST'])
def fit_mano_shape():
    """
    Fit MANO shape parameters from MPS landmarks.
    Expects a MPS CSV file upload.
    Returns the fitted model files.
    """
    try:
        mps_file = request.files.get('mps_file')
        hand = request.form.get('hand', 'right')
        iterations = request.form.get('iterations', '500')

        if not mps_file or mps_file.filename == '':
            return jsonify({'error': '请上传 MPS CSV 文件'}), 400

        # Save uploaded file
        mps_filename = secure_filename(mps_file.filename)
        mps_path = os.path.join(current_app.config['UPLOAD_FOLDER'], mps_filename)
        mps_file.save(mps_path)

        # Check if script exists
        if not os.path.exists(MANO_FIT_SCRIPT):
            return jsonify({'error': f'拟合脚本不存在: {MANO_FIT_SCRIPT}'}), 500

        # Run the fitting script
        python_exe = sys.executable
        cmd = [
            python_exe,
            MANO_FIT_SCRIPT,
            '--mps', mps_path,
            '--hand', hand,
            '--iterations', iterations
        ]

        print(f"Running MANO shape fitting: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )

        # Parse output
        output = result.stdout + result.stderr

        if result.returncode != 0:
            return jsonify({
                'error': '拟合失败',
                'details': output
            }), 500

        # Check if output files exist
        output_obj = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                                  'app', 'static', 'models', 'mano_right_fitted.obj')
        output_json = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                                   'app', 'static', 'models', 'mano_right_fitted.json')

        if not os.path.exists(output_obj) or not os.path.exists(output_json):
            return jsonify({
                'error': '拟合完成但输出文件未生成',
                'details': output
            }), 500

        # Extract betas and comparison info from output
        betas = None
        comparison = {}
        for line in output.split('\n'):
            if 'Fitted betas:' in line:
                try:
                    betas_str = line.split('[')[1].split(']')[0]
                    betas = [float(x.strip()) for x in betas_str.split()]
                except:
                    pass
            elif 'Thumb/Index ratio - MPS:' in line:
                try:
                    comparison['mps_ratio'] = float(line.split(':')[1].strip())
                except:
                    pass
            elif 'Thumb/Index ratio - MANO (original):' in line:
                try:
                    comparison['mano_original_ratio'] = float(line.split(':')[1].strip())
                except:
                    pass
            elif 'Thumb/Index ratio - MANO (fitted):' in line:
                try:
                    comparison['mano_fitted_ratio'] = float(line.split(':')[1].strip())
                except:
                    pass

        return jsonify({
            'success': True,
            'message': 'MANO shape 拟合完成',
            'betas': betas,
            'comparison': comparison,
            'obj_url': '/static/models/mano_right_fitted.obj',
            'json_url': '/static/models/mano_right_fitted.json',
            'output': output
        })

    except subprocess.TimeoutExpired:
        return jsonify({'error': '拟合超时（超过5分钟）'}), 500
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@bp.route('/mano_models')
def list_mano_models():
    """List available MANO model files"""
    models_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                              'static', 'models')

    models = []
    if os.path.exists(models_dir):
        for f in os.listdir(models_dir):
            if f.endswith('.obj'):
                json_file = f.replace('.obj', '.json')
                models.append({
                    'name': f.replace('.obj', ''),
                    'obj': f'/static/models/{f}',
                    'json': f'/static/models/{json_file}' if os.path.exists(os.path.join(models_dir, json_file)) else None
                })

    return jsonify({'models': models})

