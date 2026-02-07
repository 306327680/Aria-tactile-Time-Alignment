# SO101 URDF Assets Collection

This folder contains all the STL mesh files required by the SO101 URDF model.

## Contents

### URDF File
- `so101_new_calib.urdf` - Main URDF file with calibrated joint parameters

### STL Mesh Files (13 files)

#### Base Components
1. `base_motor_holder_so101_v1.stl` - Base motor holder
2. `base_so101_v2.stl` - Base structure
3. `waveshare_mounting_plate_so101_v2.stl` - Waveshare mounting plate

#### Shoulder Components
4. `motor_holder_so101_base_v1.stl` - Motor holder for base
5. `rotation_pitch_so101_v1.stl` - Rotation pitch component

#### Arm Components
6. `upper_arm_so101_v1.stl` - Upper arm
7. `under_arm_so101_v1.stl` - Lower/under arm
8. `motor_holder_so101_wrist_v1.stl` - Motor holder for wrist

#### Wrist and Gripper Components
9. `wrist_roll_pitch_so101_v2.stl` - Wrist roll pitch mechanism
10. `wrist_roll_follower_so101_v1.stl` - Wrist roll follower
11. `moving_jaw_so101_v1.stl` - Gripper moving jaw

#### Motor Components
12. `sts3215_03a_v1.stl` - STS3215 servo motor (standard version, used 5 times in URDF)
13. `sts3215_03a_no_horn_v1.stl` - STS3215 servo motor without horn

## File Verification

All 13 STL files referenced in `so101_new_calib.urdf` are present in this folder.

### URDF Reference Paths
The URDF file references these meshes with paths like:
```xml
<mesh filename="assets/base_motor_holder_so101_v1.stl"/>
```

To use this URDF:
1. Keep the URDF file and STL files in the same directory structure
2. Or update the URDF mesh paths to match your desired structure
3. The URDF expects an `assets/` subdirectory containing the STL files

## Source
Copied from: `/Users/zhuyilong/Documents/SO-ARM100/Simulation/SO101/`

Date: 2025-11-27
