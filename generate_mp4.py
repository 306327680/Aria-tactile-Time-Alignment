#!/usr/bin/env python3
"""Standalone script to generate MP4 from VRS RGB frames.

Usage: python generate_mp4.py <vrs_path> <mp4_output_path> <progress_file>

Writes progress (0-100) to progress_file as plain text.
"""
import sys
import os
import subprocess
import numpy as np

def main():
    if len(sys.argv) != 4:
        print("Usage: generate_mp4.py <vrs_path> <mp4_output_path> <progress_file>")
        sys.exit(1)

    vrs_path = sys.argv[1]
    mp4_path = sys.argv[2]
    progress_file = sys.argv[3]

    def write_progress(pct):
        with open(progress_file, 'w') as f:
            f.write(str(pct))

    write_progress(0)

    try:
        from projectaria_tools.core import data_provider as dp

        print(f"[generate_mp4] Opening VRS: {vrs_path}")
        provider = dp.create_vrs_data_provider(vrs_path)

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

        # Start ffmpeg (use .mp4.tmp.mp4 so ffmpeg recognizes the format)
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
            # Ensure RGB 3-channel
            if len(arr.shape) == 2:
                arr = np.stack([arr, arr, arr], axis=-1)
            elif arr.shape[2] == 1:
                arr = np.concatenate([arr, arr, arr], axis=-1)
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
