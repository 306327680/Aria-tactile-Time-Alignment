"""
File utility functions
"""


def allowed_file(filename, extensions):
    """
    Check if file has allowed extension.
    
    Args:
        filename: Name of the file
        extensions: Set of allowed extensions (e.g., {'csv', 'stl'})
        
    Returns:
        bool: True if file extension is allowed
    """
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions

