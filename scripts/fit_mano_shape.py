#!/usr/bin/env python3
"""
根据 MPS 手部关节位置拟合 MANO shape 参数，生成匹配实际手形的 OBJ 文件
"""

import sys
import os
import json
import csv
import numpy as np

# 添加 manotorch 路径
sys.path.insert(0, '/Users/zhuyilong/Documents/Aria_data/manotorch')

import torch
from manotorch.manolayer import ManoLayer

# MPS landmark 索引定义
MPS_LANDMARK = {
    'THUMB_TIP': 0, 'INDEX_TIP': 1, 'MIDDLE_TIP': 2, 'RING_TIP': 3, 'PINKY_TIP': 4,
    'WRIST': 5,
    'THUMB_MCP': 6, 'THUMB_IP': 7,
    'INDEX_MCP': 8, 'INDEX_PIP': 9, 'INDEX_DIP': 10,
    'MIDDLE_MCP': 11, 'MIDDLE_PIP': 12, 'MIDDLE_DIP': 13,
    'RING_MCP': 14, 'RING_PIP': 15, 'RING_DIP': 16,
    'PINKY_MCP': 17, 'PINKY_PIP': 18, 'PINKY_DIP': 19,
    'PALM_CENTER': 20
}

# MANO 关节到 MPS landmark 的映射
MANO_TO_MPS = {
    0: 5,   # wrist
    1: 8,   # index MCP
    2: 9,   # index PIP
    3: 10,  # index DIP
    4: 11,  # middle MCP
    5: 12,  # middle PIP
    6: 13,  # middle DIP
    7: 14,  # ring MCP
    8: 15,  # ring PIP
    9: 16,  # ring DIP
    10: 17, # pinky MCP
    11: 18, # pinky PIP
    12: 19, # pinky DIP
    13: 6,  # thumb MCP
    14: 7,  # thumb IP
    15: 0   # thumb TIP (MANO 的 15 是 thumb_tip)
}


def load_mps_landmarks_csv(csv_path, hand='right'):
    """从 MPS CSV 文件加载手部关节数据"""
    all_frames = []

    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)

        for row in reader:
            try:
                # 检查置信度
                confidence = float(row.get(f'{hand}_tracking_confidence', -1))
                if confidence <= 0:
                    continue

                # 读取21个关键点
                landmarks = []
                for i in range(21):
                    x = float(row.get(f'tx_{hand}_landmark_{i}_device', 0))
                    y = float(row.get(f'ty_{hand}_landmark_{i}_device', 0))
                    z = float(row.get(f'tz_{hand}_landmark_{i}_device', 0))
                    landmarks.append([x, y, z])

                all_frames.append(landmarks)

            except Exception as e:
                continue

    if not all_frames:
        raise ValueError(f"No valid {hand} hand data found in CSV")

    # 取中间帧（假设手比较稳定）
    frame_idx = len(all_frames) // 2
    landmarks = all_frames[frame_idx]

    print(f"Loaded frame {frame_idx} from {len(all_frames)} valid frames")
    return np.array(landmarks)


def load_mps_landmarks_json(json_path):
    """从 JSON 文件加载 MPS 手部关节数据（兼容旧格式）"""
    with open(json_path, 'r') as f:
        data = json.load(f)

    # 获取右手数据
    right_hand = data.get('right_hand', [])
    if not right_hand:
        raise ValueError("No right hand data found")

    # 取第一帧或中间帧
    frame_idx = len(right_hand) // 2
    landmarks = right_hand[frame_idx]

    print(f"Loaded frame {frame_idx} from {len(right_hand)} frames")
    return np.array(landmarks)


def compute_bone_lengths(landmarks):
    """计算 MPS 关节之间的骨骼长度"""
    def dist(i, j):
        return np.linalg.norm(np.array(landmarks[i]) - np.array(landmarks[j]))

    lengths = {
        'wrist_to_index_mcp': dist(5, 8),
        'wrist_to_middle_mcp': dist(5, 11),
        'wrist_to_ring_mcp': dist(5, 14),
        'wrist_to_pinky_mcp': dist(5, 17),
        'wrist_to_thumb_mcp': dist(5, 6),

        # 手指长度
        'index_mcp_pip': dist(8, 9),
        'index_pip_dip': dist(9, 10),
        'index_dip_tip': dist(10, 1),

        'middle_mcp_pip': dist(11, 12),
        'middle_pip_dip': dist(12, 13),
        'middle_dip_tip': dist(13, 2),

        'ring_mcp_pip': dist(14, 15),
        'ring_pip_dip': dist(15, 16),
        'ring_dip_tip': dist(16, 3),

        'pinky_mcp_pip': dist(17, 18),
        'pinky_pip_dip': dist(18, 19),
        'pinky_dip_tip': dist(19, 4),

        'thumb_mcp_ip': dist(6, 7),
        'thumb_ip_tip': dist(7, 0),
    }
    return lengths


def fit_mano_shape(mps_landmarks, mano_layer, num_iterations=1000, lr=0.01):
    """
    拟合 MANO shape 参数以匹配 MPS 关节位置
    """
    device = 'cpu'

    # 初始化 shape 参数 (10维)
    betas = torch.zeros(1, 10, requires_grad=True, device=device)

    # 初始化 pose 参数 (全零 = flat hand)
    pose = torch.zeros(1, 48, device=device)  # 16 joints * 3 (axis-angle)

    # 将 MPS landmarks 转换为 tensor，并归一化到 MANO 尺度
    mps_landmarks = np.array(mps_landmarks)
    mps_wrist = mps_landmarks[5]

    # 计算 MPS 手的大小（手腕到中指 MCP）
    mps_scale = np.linalg.norm(mps_landmarks[11] - mps_wrist)

    # 相对于手腕的位置，归一化
    mps_rel = (mps_landmarks - mps_wrist) / mps_scale

    # 目标关节位置（只用 MANO 有的 16 个关节）
    target_joints = []
    for mano_idx in range(16):
        mps_idx = MANO_TO_MPS[mano_idx]
        target_joints.append(mps_rel[mps_idx])
    target_joints = torch.tensor(target_joints, dtype=torch.float32, device=device)

    # 优化器
    optimizer = torch.optim.Adam([betas], lr=lr)

    print("Fitting MANO shape parameters...")
    for i in range(num_iterations):
        optimizer.zero_grad()

        # 前向传播
        output = mano_layer(pose, betas)
        joints = output.joints[0]  # (16, 3)

        # 归一化 MANO 关节（相对于手腕，按中指 MCP 距离归一化）
        mano_wrist = joints[0]
        mano_scale = torch.norm(joints[4] - mano_wrist)  # middle MCP
        joints_rel = (joints - mano_wrist) / mano_scale

        # 计算损失：关节位置差异
        loss = torch.mean((joints_rel - target_joints) ** 2)

        # 添加正则化，防止 shape 参数过大
        reg_loss = 0.001 * torch.mean(betas ** 2)
        total_loss = loss + reg_loss

        total_loss.backward()
        optimizer.step()

        if i % 100 == 0:
            print(f"  Iteration {i}: loss = {loss.item():.6f}, reg = {reg_loss.item():.6f}")

    print(f"Final loss: {loss.item():.6f}")
    print(f"Fitted betas: {betas.detach().numpy().flatten()}")

    return betas.detach()


def export_mano_obj(mano_layer, betas, output_path):
    """导出 MANO mesh 为 OBJ 文件"""
    pose = torch.zeros(1, 48)
    output = mano_layer(pose, betas)

    verts = output.verts[0].detach().numpy()
    faces = mano_layer.th_faces.numpy()

    print(f"Exporting mesh: {verts.shape[0]} vertices, {faces.shape[0]} faces")

    with open(output_path, 'w') as f:
        f.write("# MANO mesh fitted to MPS landmarks\n")
        f.write(f"# Shape parameters: {betas.numpy().flatten().tolist()}\n")

        for v in verts:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")

        for face in faces:
            f.write(f"f {face[0]+1} {face[1]+1} {face[2]+1}\n")

    print(f"Saved to: {output_path}")
    return verts, faces


def export_mano_json(mano_layer, betas, output_path):
    """导出 MANO 数据为 JSON 文件（关节位置、权重等）"""
    pose = torch.zeros(1, 48)
    output = mano_layer(pose, betas)

    joints = output.joints[0].detach().numpy()
    weights = mano_layer.th_weights.numpy()

    # 构建 skinning weights 的稀疏表示
    skinning_data = []
    for v in range(weights.shape[0]):
        row = weights[v]
        nonzero = np.where(row > 0.001)[0]
        if len(nonzero) > 0:
            skinning_data.append({
                'vertex': int(v),
                'joints': nonzero.tolist(),
                'weights': row[nonzero].tolist()
            })

    data = {
        'num_vertices': int(weights.shape[0]),
        'num_faces': int(mano_layer.th_faces.shape[0]),
        'num_joints': 16,
        'joints': joints.tolist(),
        'kintree_parents': mano_layer.kintree_parents,
        'betas': betas.numpy().flatten().tolist(),
        'skinning_weights': {
            'shape': list(weights.shape),
            'data': skinning_data
        }
    }

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Saved JSON to: {output_path}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Fit MANO shape parameters from MPS landmarks')
    parser.add_argument('--mps', type=str, help='Path to MPS CSV file')
    parser.add_argument('--hand', type=str, default='right', choices=['left', 'right'],
                        help='Which hand to fit (default: right)')
    parser.add_argument('--iterations', type=int, default=500, help='Number of optimization iterations')
    args = parser.parse_args()

    # 路径配置
    mano_assets_root = '/Users/zhuyilong/Documents/Aria_data/mano_v1_2'
    output_obj_path = '/Users/zhuyilong/Documents/Aria_data/aria_haptic_alignment/app/static/models/mano_right_fitted.obj'
    output_json_path = '/Users/zhuyilong/Documents/Aria_data/aria_haptic_alignment/app/static/models/mano_right_fitted.json'

    # MPS CSV 路径
    mps_csv_path = args.mps
    if not mps_csv_path:
        # 默认使用最新的 MPS 文件
        default_paths = [
            '/Users/zhuyilong/Documents/Aria_data/mps_E3_4_vrs/hand_tracking/hand_tracking_results.csv',
            '/Users/zhuyilong/Documents/Aria_data/mps_all_vrs/hand_tracking/hand_tracking_results.csv',
            '/Users/zhuyilong/Documents/Aria_data/mps_G1_2_vrs/hand_tracking/hand_tracking_results.csv',
        ]
        for p in default_paths:
            if os.path.exists(p):
                mps_csv_path = p
                break
        else:
            print("Error: No MPS CSV file found. Please provide --mps argument")
            return

    print(f"Using MPS file: {mps_csv_path}")

    # 加载 MANO 模型
    print("Loading MANO model...")
    mano_layer = ManoLayer(
        rot_mode='axisang',
        side=args.hand,
        mano_assets_root=mano_assets_root,
        use_pca=False,
        flat_hand_mean=True
    )

    # 加载 MPS landmarks（从 CSV）
    print(f"Loading MPS landmarks ({args.hand} hand)...")
    mps_landmarks = load_mps_landmarks_csv(mps_csv_path, hand=args.hand)

    # 打印 MPS 骨骼长度比例
    print("\nMPS bone lengths:")
    lengths = compute_bone_lengths(mps_landmarks)
    index_len = lengths['wrist_to_index_mcp']
    for name, length in lengths.items():
        print(f"  {name}: {length:.4f} (ratio: {length/index_len:.3f})")

    # 拟合 shape 参数
    betas = fit_mano_shape(mps_landmarks, mano_layer, num_iterations=args.iterations)

    # 导出 OBJ 和 JSON
    os.makedirs(os.path.dirname(output_obj_path), exist_ok=True)
    export_mano_obj(mano_layer, betas, output_obj_path)
    export_mano_json(mano_layer, betas, output_json_path)

    print("\nDone! Files saved:")
    print(f"  OBJ: {output_obj_path}")
    print(f"  JSON: {output_json_path}")


if __name__ == '__main__':
    main()
