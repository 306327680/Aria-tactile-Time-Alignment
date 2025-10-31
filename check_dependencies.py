#!/usr/bin/env python3
"""
Dependency checker for Aria-Haptic Alignment Web Application
"""

import sys

def check_dependencies():
    """Check if all required dependencies are installed"""

    print("=" * 60)
    print("Checking Dependencies for Aria-Haptic Alignment Tool")
    print("=" * 60)
    print()

    required_packages = {
        'flask': 'Flask',
        'numpy': 'NumPy',
        'pandas': 'Pandas',
        'scipy': 'SciPy',
        'matplotlib': 'Matplotlib',
        'plotly': 'Plotly'
    }

    optional_packages = {
        'aria_api': 'Aria API (for VRS file processing)'
    }

    missing_required = []
    missing_optional = []
    installed_packages = []

    # Check required packages
    print("Required Packages:")
    print("-" * 60)
    for module_name, display_name in required_packages.items():
        try:
            __import__(module_name)
            version = get_version(module_name)
            print(f"✅ {display_name:20} {version}")
            installed_packages.append(display_name)
        except ImportError:
            print(f"❌ {display_name:20} NOT INSTALLED")
            missing_required.append(module_name)

    print()

    # Check optional packages
    print("Optional Packages:")
    print("-" * 60)
    for module_name, display_name in optional_packages.items():
        try:
            __import__(module_name)
            version = get_version(module_name)
            print(f"✅ {display_name:40} {version}")
        except ImportError:
            print(f"⚠️  {display_name:40} NOT INSTALLED")
            missing_optional.append(module_name)

    print()
    print("=" * 60)

    # Summary
    if missing_required:
        print("❌ MISSING REQUIRED PACKAGES:")
        for pkg in missing_required:
            print(f"   - {pkg}")
        print()
        print("Please install missing packages:")
        print(f"   pip install {' '.join(missing_required)}")
        print()
        print("Or install all requirements:")
        print("   pip install -r requirements.txt")
        print("=" * 60)
        return False
    else:
        print("✅ All required packages are installed!")

    if missing_optional:
        print()
        print("⚠️  OPTIONAL PACKAGES NOT INSTALLED:")
        for pkg in missing_optional:
            print(f"   - {pkg}")
        print()
        if 'aria_api' in missing_optional:
            print("Note: aria_api is required for VRS file processing.")
            print("      The web app will run but VRS uploads will fail.")
            print("      Please install aria_api for full functionality.")

    print("=" * 60)
    return True


def get_version(module_name):
    """Get version of installed package"""
    try:
        module = __import__(module_name)
        if hasattr(module, '__version__'):
            return f"v{module.__version__}"
        return "(installed)"
    except:
        return ""


if __name__ == '__main__':
    success = check_dependencies()
    sys.exit(0 if success else 1)
