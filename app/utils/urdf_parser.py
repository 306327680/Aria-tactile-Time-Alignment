"""
URDF file parser utility
"""

import xml.etree.ElementTree as ET


def parse_urdf(urdf_path):
    """
    Parse URDF file and extract link/joint information.
    
    Args:
        urdf_path: Path to URDF file
        
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

