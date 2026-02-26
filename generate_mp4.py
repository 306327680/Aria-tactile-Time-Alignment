#!/usr/bin/env python3
"""Standalone script to generate MP4 from VRS RGB frames.

Usage:
  python generate_mp4.py <vrs_path> <mp4_output_path> <progress_file>
  python generate_mp4.py <vrs_path> <mp4_output_path> <progress_file> --skeleton --mps-dir <mps_dir>

Writes progress (0-100) to progress_file as plain text.
"""
import sys
import os
import subprocess
import numpy as np


# Hand skeleton connection definitions (same as web_app.py)
_HAND_CONNECTIONS = {
    'wrist_palm': {'conn': [(5, 20)], 'cl': (255, 255, 255), 'cr': (200, 200, 200)},
    'thumb':  {'conn': [(5, 6), (6, 7), (7, 0)], 'cl': (0, 0, 255), 'cr': (0, 0, 200)},
    'index':  {'conn': [(5, 8), (8, 9), (9, 10), (10, 1)], 'cl': (0, 165, 255), 'cr': (0, 120, 200)},
    'middle': {'conn': [(5, 11), (11, 12), (12, 13), (13, 2)], 'cl': (0, 255, 255), 'cr': (0, 200, 200)},
    'ring':   {'conn': [(5, 14), (14, 15), (15, 16), (16, 3)], 'cl': (0, 255, 0), 'cr': (0, 200, 0)},
    'pinky':  {'conn': [(5, 17), (17, 18), (18, 19), (19, 4)], 'cl': (255, 0, 0), 'cr': (200, 0, 0)},
    'palm':   {'conn': [(8, 20), (11, 20), (14, 20), (17, 20)], 'cl': (128, 0, 128), 'cr': (100, 0, 100)},
}


def draw_skeleton_on_frame(arr_bgr, hands):
    """Draw hand skeleton overlay on a BGR image array.

    Args:
        arr_bgr: numpy array in BGR format (H, W, 3)
        hands: dict from session.project_hands(), keys 'left'/'right'
    """
    import cv2

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
                    cv2.line(arr_bgr, p1, p2, color, 2, cv2.LINE_AA)
        # Draw keypoints
        for i in range(len(coords)):
            if not valid[i]:
                continue
            c = (int(round(coords[i][0])), int(round(coords[i][1])))
            r = 6 if i == 5 else 4
            cv2.circle(arr_bgr, c, r, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(arr_bgr, c, r, (0, 0, 0), 1, cv2.LINE_AA)
            if i == 5:
                lbl = "L" if is_left else "R"
                cv2.putText(arr_bgr, lbl, (c[0] + 8, c[1]),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.putText(arr_bgr, lbl, (c[0] + 8, c[1]),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1, cv2.LINE_AA)

    return arr_bgr


def main():
    # Parse arguments
    args = sys.argv[1:]
    skeleton_mode = False
    mps_dir = None

    # Extract --skeleton and --mps-dir flags
    filtered_args = []
    i = 0
    while i < len(args):
        if args[i] == '--skeleton':
            skeleton_mode = True
            i += 1
        elif args[i] == '--mps-dir' and i + 1 < len(args):
            mps_dir = args[i + 1]
            i += 2
        else:
            filtered_args.append(args[i])
            i += 1

    if len(filtered_args) != 3:
        print("Usage: generate_mp4.py <vrs_path> <mp4_output_path> <progress_file> [--skeleton --mps-dir <mps_dir>]")
        sys.exit(1)

    vrs_path = filtered_args[0]
    mp4_path = filtered_args[1]
    progress_file = filtered_args[2]

    if skeleton_mode and not mps_dir:
        print("[generate_mp4] ERROR: --skeleton requires --mps-dir")
        sys.exit(1)

    def write_progress(pct):
        with open(progress_file, 'w') as f:
            f.write(str(pct))

    write_progress(0)

    try:
        from projectaria_tools.core import data_provider as dp

        mode_str = "skeleton" if skeleton_mode else "plain"
        print(f"[generate_mp4] Opening VRS: {vrs_path} (mode={mode_str})")
        provider = dp.create_vrs_data_provider(vrs_path)

        # Initialize AriaSession for skeleton overlay
        aria_session = None
        if skeleton_mode:
            try:
                from aria_api import AriaSession
                aria_session = AriaSession.from_vrs(vrs_path, mps_dir)
                print(f"[generate_mp4] AriaSession created for skeleton overlay, mps_dir={mps_dir}")
            except Exception as e:
                print(f"[generate_mp4] WARNING: Failed to create AriaSession: {e}")
                print("[generate_mp4] Falling back to plain video generation")
                skeleton_mode = False

        # Find RGB stream
        rgb_stream_id = None
        for sid in provider.get_all_streams():
            try:
                label = provider.get_label_from_stream_id(sid)
                if 'rgb' in label.lower():
                    rgb_stream_id = sid
                    break
            except:
                pass

        if rgb_stream_id is None:
            print("[generate_mp4] ERROR: No RGB stream found")
            write_progress(-1)
            sys.exit(1)

        num_frames = provider.get_num_data(rgb_stream_id)
        print(f"[generate_mp4] RGB stream found, {num_frames} frames")

        # Get first frame to determine dimensions
        first_result = provider.get_image_data_by_index(rgb_stream_id, 0)
        first_arr = first_result[0].to_numpy_array()
        orig_h, orig_w = first_arr.shape[:2]
        # After 90° CW rotation
        rot_w, rot_h = orig_h, orig_w

        # Calculate FPS from time range
        first_ts = first_result[1].capture_timestamp_ns
        last_result = provider.get_image_data_by_index(rgb_stream_id, num_frames - 1)
        last_ts = last_result[1].capture_timestamp_ns
        duration_s = (last_ts - first_ts) / 1e9
        fps = num_frames / duration_s if duration_s > 0 else 30

        print(f"[generate_mp4] Frame size: {rot_w}x{rot_h}, FPS: {fps:.2f}, Duration: {duration_s:.1f}s")

        # Import cv2 if skeleton mode
        cv2 = None
        if skeleton_mode:
            import cv2 as _cv2
            cv2 = _cv2

        # Start ffmpeg
        tmp_mp4 = mp4_path + '.generating.mp4'
        cmd = [
            'ffmpeg', '-y',
            '-f', 'rawvideo',
            '-pix_fmt', 'rgb24',
            '-s', f'{rot_w}x{rot_h}',
            '-r', str(round(fps, 2)),
            '-i', 'pipe:0',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            tmp_mp4
        ]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        # Check if ffmpeg started successfully
        import time
        time.sleep(0.5)
        if proc.poll() is not None:
            stderr = proc.stderr.read().decode()
            print(f"[generate_mp4] ffmpeg exited immediately with code {proc.returncode}")
            print(f"[generate_mp4] ffmpeg stderr: {stderr[-1000:]}")
            write_progress(-1)
            sys.exit(1)

        for i in range(num_frames):
            result = provider.get_image_data_by_index(rgb_stream_id, i)
            if result is None:
                continue
            arr = result[0].to_numpy_array()
            frame_timestamp_ns = result[1].capture_timestamp_ns

            # Ensure RGB 3-channel
            if len(arr.shape) == 2:
                arr = np.stack([arr, arr, arr], axis=-1)
            elif arr.shape[2] == 1:
                arr = np.concatenate([arr, arr, arr], axis=-1)

            # Draw skeleton overlay BEFORE rotation (skeleton coords are in original image space)
            if skeleton_mode and aria_session is not None:
                try:
                    hands = aria_session.project_hands(
                        frame_timestamp_ns, "camera-rgb",
                        confidence_threshold=0.3,
                        max_slop_ns=int(500e6)
                    )
                    if hands:
                        # Convert RGB to BGR for OpenCV drawing
                        arr_bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
                        arr_bgr = draw_skeleton_on_frame(arr_bgr, hands)
                        arr = cv2.cvtColor(arr_bgr, cv2.COLOR_BGR2RGB)
                except Exception as e:
                    if i % 500 == 0:
                        print(f"[generate_mp4] Skeleton error at frame {i} (non-fatal): {e}")

            # Rotate 90° clockwise
            arr = np.rot90(arr, k=-1)
            arr = np.ascontiguousarray(arr)
            try:
                proc.stdin.write(arr.tobytes())
            except BrokenPipeError:
                stderr = proc.stderr.read().decode()
                print(f"[generate_mp4] BrokenPipe at frame {i}, ffmpeg stderr:")
                print(stderr[-1500:])
                write_progress(-1)
                sys.exit(1)

            pct = int((i + 1) / num_frames * 100)
            if i % 50 == 0 or pct != int(i / num_frames * 100):
                write_progress(pct)
            if i % 100 == 0:
                print(f"[generate_mp4] Progress: {pct}% ({i}/{num_frames})")

        proc.stdin.close()
        proc.wait()

        if proc.returncode == 0:
            os.rename(tmp_mp4, mp4_path)
            write_progress(100)
            print(f"[generate_mp4] Done: {mp4_path} ({num_frames} frames, {fps:.1f} FPS)")
        else:
            stderr = proc.stderr.read().decode()
            print(f"[generate_mp4] ffmpeg error: {stderr}")
            write_progress(-1)
            if os.path.exists(tmp_mp4):
                os.remove(tmp_mp4)
            sys.exit(1)

    except Exception as e:
        import traceback
        print(f"[generate_mp4] Error: {e}")
        traceback.print_exc()
        write_progress(-1)
        sys.exit(1)


if __name__ == '__main__':
    main()
