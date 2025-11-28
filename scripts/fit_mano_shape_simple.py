#!/usr/bin/env python3
"""
根据 MPS 手部关节位置拟合 MANO shape 参数，生成匹配实际手形的 OBJ 文件
简化版本 - 不依赖 chumpy，直接使用 pickle 加载
"""

import sys
import os
import json
import csv
import pickle
import numpy as np
import argparse

import torch
import torch.nn as nn

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


class ChumypArrayReplacer(pickle.Unpickler):
    """Custom unpickler to handle chumpy arrays without importing chumpy"""

    def find_class(self, module, name):
        # Replace chumpy.ch.Ch and related classes with a simple wrapper
        if 'chumpy' in module:
            return ChumypDummy
        return super().find_class(module, name)


class ChumypDummy:
    """Dummy class to hold chumpy data"""
    def __init__(self, *args, **kwargs):
        pass

    def __setstate__(self, state):
        # Store the state for extraction
        if isinstance(state, dict):
            for k, v in state.items():
                setattr(self, k, v)
        elif isinstance(state, tuple) and len(state) == 2:
            # (args, kwargs) format
            pass

    @property
    def r(self):
        """Return the underlying numpy array"""
        if hasattr(self, 'x'):
            return np.array(self.x)
        if hasattr(self, 'a'):
            return np.array(self.a)
        return None


def extract_chumpy_value(obj, depth=0):
    """递归提取 chumpy 对象中的 numpy 数组"""
    if depth > 10:
        return None
    if isinstance(obj, np.ndarray):
        return obj
    if hasattr(obj, 'x'):
        return extract_chumpy_value(obj.x, depth+1)
    if hasattr(obj, 'a'):
        return extract_chumpy_value(obj.a, depth+1)
    return obj


def load_mano_pkl(pkl_path):
    """直接加载 MANO pkl 文件，提取需要的数据（绕过 chumpy）"""
    # 先临时将 chumpy 移出 sys.modules 以避免冲突
    chumpy_backup = sys.modules.pop('chumpy', None)

    try:
        with open(pkl_path, 'rb') as f:
            # 使用自定义 unpickler 处理 chumpy 对象
            unpickler = ChumypArrayReplacer(f, encoding='latin1')
            data = unpickler.load()
    finally:
        # 恢复 chumpy
        if chumpy_backup:
            sys.modules['chumpy'] = chumpy_backup

    # 提取需要的数据，处理 chumpy 包装
    def extract_array(obj):
        val = extract_chumpy_value(obj)
        if val is None:
            return np.array(obj)
        return np.array(val)

    # 获取 shapedirs，只取前 10 个 shape components
    shapedirs = extract_array(data['shapedirs'])
    print(f"  shapedirs original shape: {shapedirs.shape}")
    if shapedirs.shape[2] > 10:
        shapedirs = shapedirs[:, :, :10]
    print(f"  shapedirs used shape: {shapedirs.shape}")

    result = {
        'v_template': extract_array(data['v_template']),  # (778, 3)
        'shapedirs': shapedirs,                           # (778, 3, 10)
        'J_regressor': data['J_regressor'],               # sparse matrix (16, 778)
        'weights': extract_array(data['weights']),        # (778, 16)
        'faces': np.array(data['f']),                     # (1538, 3)
        'kintree_table': np.array(data['kintree_table']), # (2, 16)
        'posedirs': extract_array(data['posedirs']),      # (778, 3, 135)
        'hands_mean': extract_array(data['hands_mean']),  # (45,)
        'hands_components': extract_array(data['hands_components']),  # (45, 45)
    }

    # 转换 J_regressor 为 dense
    if hasattr(result['J_regressor'], 'toarray'):
        result['J_regressor'] = result['J_regressor'].toarray()

    return result


class SimpleManoLayer(nn.Module):
    """简化的 MANO 层，只用于 shape 拟合"""

    def __init__(self, mano_data):
        super().__init__()

        self.register_buffer('v_template', torch.tensor(mano_data['v_template'], dtype=torch.float32))
        self.register_buffer('shapedirs', torch.tensor(mano_data['shapedirs'], dtype=torch.float32))
        self.register_buffer('J_regressor', torch.tensor(mano_data['J_regressor'], dtype=torch.float32))
        self.register_buffer('weights', torch.tensor(mano_data['weights'], dtype=torch.float32))

        self.faces = mano_data['faces']
        self.kintree_parents = list(mano_data['kintree_table'][0].astype(int))

    def forward(self, betas):
        """
        计算给定 shape 参数的关节位置

        Args:
            betas: shape parameters (B, 10)

        Returns:
            joints: joint positions (B, 16, 3)
            verts: vertex positions (B, 778, 3)
        """
        batch_size = betas.shape[0]

        # Shape blend shapes: v_shaped = v_template + shapedirs @ betas
        # shapedirs: (778, 3, 10), betas: (B, 10)
        v_shaped = self.v_template.unsqueeze(0) + torch.einsum('vcd,bd->bvc', self.shapedirs, betas)

        # Compute joints from shaped vertices
        # J_regressor: (16, 778), v_shaped: (B, 778, 3)
        joints = torch.einsum('jv,bvc->bjc', self.J_regressor, v_shaped)

        return joints, v_shaped


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

    # 计算多帧平均，减少噪声
    print(f"Found {len(all_frames)} valid frames")

    # 取中间 10% 的帧进行平均
    start_idx = int(len(all_frames) * 0.45)
    end_idx = int(len(all_frames) * 0.55)
    if end_idx <= start_idx:
        end_idx = start_idx + 1

    selected_frames = all_frames[start_idx:end_idx]
    avg_landmarks = np.mean(selected_frames, axis=0)

    print(f"Averaged {len(selected_frames)} frames (indices {start_idx}-{end_idx})")
    return avg_landmarks


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
        joints, _ = mano_layer(betas)
        joints = joints[0]  # (16, 3)

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
    joints, verts = mano_layer(betas)

    verts = verts[0].detach().numpy()
    faces = mano_layer.faces

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
    joints, verts = mano_layer(betas)

    joints = joints[0].detach().numpy()
    weights = mano_layer.weights.numpy()

    # 构建 skinning weights 的稀疏表示
    skinning_data = []
    for v in range(weights.shape[0]):
        row = weights[v]
        nonzero = np.where(row > 0.001)[0]
        if len(nonzero) > 0:
            skinning_data.append({
                'vertex': int(v),
                'joints': [int(x) for x in nonzero.tolist()],
                'weights': [float(x) for x in row[nonzero].tolist()]
            })

    # 将 kintree_parents 转换为 Python int
    kintree_parents = [int(x) for x in mano_layer.kintree_parents]

    data = {
        'num_vertices': int(weights.shape[0]),
        'num_faces': int(mano_layer.faces.shape[0]),
        'num_joints': 16,
        'joints': joints.tolist(),
        'kintree_parents': kintree_parents,
        'betas': [float(x) for x in betas.numpy().flatten().tolist()],
        'skinning_weights': {
            'shape': [int(x) for x in weights.shape],
            'data': skinning_data
        }
    }

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Saved JSON to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Fit MANO shape parameters from MPS landmarks')
    parser.add_argument('--mps', type=str, help='Path to MPS CSV file')
    parser.add_argument('--hand', type=str, default='right', choices=['left', 'right'],
                        help='Which hand to fit (default: right)')
    parser.add_argument('--iterations', type=int, default=500, help='Number of optimization iterations')
    args = parser.parse_args()

    # 路径配置
    mano_pkl_path = f'/Users/zhuyilong/Documents/Aria_data/mano_v1_2/models/MANO_{args.hand.upper()}.pkl'
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
    print(f"Using MANO pkl: {mano_pkl_path}")

    # 加载 MANO 模型
    print("Loading MANO model...")
    mano_data = load_mano_pkl(mano_pkl_path)
    mano_layer = SimpleManoLayer(mano_data)

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

    # 比较拟合前后的关节比例
    print("\n=== Comparison ===")

    # 拟合后的 MANO 关节
    joints_fitted, _ = mano_layer(betas)
    joints_fitted = joints_fitted[0].detach().numpy()

    # 原始 MANO (betas=0)
    joints_original, _ = mano_layer(torch.zeros(1, 10))
    joints_original = joints_original[0].detach().numpy()

    # 计算拇指/食指比例
    def calc_thumb_index_ratio(joints):
        wrist = joints[0]
        index_mcp = joints[1]  # MANO index 1 = index MCP
        thumb_mcp = joints[13]  # MANO index 13 = thumb MCP
        thumb_tip = joints[15]  # MANO index 15 = thumb tip
        index_tip = joints[3]   # MANO index 3 = index DIP (closest to tip)

        # 食指长度（手腕到MCP + MCP到指尖方向的长度）
        wrist_to_index = np.linalg.norm(index_mcp - wrist)
        # 大拇指长度
        thumb_len = np.linalg.norm(thumb_mcp - wrist) + np.linalg.norm(thumb_tip - thumb_mcp)
        # 食指总长
        index_len = wrist_to_index

        return thumb_len / index_len

    mps_thumb_ratio = (lengths['wrist_to_thumb_mcp'] + lengths['thumb_mcp_ip'] + lengths['thumb_ip_tip']) / lengths['wrist_to_index_mcp']
    original_thumb_ratio = calc_thumb_index_ratio(joints_original)
    fitted_thumb_ratio = calc_thumb_index_ratio(joints_fitted)

    print(f"Thumb/Index ratio - MPS: {mps_thumb_ratio:.3f}")
    print(f"Thumb/Index ratio - MANO (original): {original_thumb_ratio:.3f}")
    print(f"Thumb/Index ratio - MANO (fitted): {fitted_thumb_ratio:.3f}")

    # 导出 OBJ 和 JSON
    os.makedirs(os.path.dirname(output_obj_path), exist_ok=True)
    export_mano_obj(mano_layer, betas, output_obj_path)
    export_mano_json(mano_layer, betas, output_json_path)

    print("\nDone! Files saved:")
    print(f"  OBJ: {output_obj_path}")
    print(f"  JSON: {output_json_path}")


if __name__ == '__main__':
    main()
