#!/usr/bin/env python3
"""
Application entry point

Run the Flask application using the application factory pattern.
"""

import os
from app import create_app
from aria_haptic_align import ARIA_API_AVAILABLE

# Check required dependencies
DEPENDENCIES_OK = True
MISSING_DEPS = []

try:
    import flask
except ImportError:
    DEPENDENCIES_OK = False
    MISSING_DEPS.append('flask')

try:
    import plotly
except ImportError:
    DEPENDENCIES_OK = False
    MISSING_DEPS.append('plotly')

try:
    import scipy
except ImportError:
    DEPENDENCIES_OK = False
    MISSING_DEPS.append('scipy')

if __name__ == '__main__':
    # Create application
    app = create_app()

    print("=" * 60)
    print("Aria-Haptic Alignment Web Application")
    print("=" * 60)

    # Check dependencies
    if MISSING_DEPS:
        print("⚠️  WARNING: Missing dependencies:")
        for dep in MISSING_DEPS:
            print(f"   - {dep}")
        print("Please install missing packages: pip install -r requirements.txt")
        print("=" * 60)
        exit(1)

    # Check aria_api availability
    if ARIA_API_AVAILABLE:
        print("✅ aria_api: Available")
    else:
        print("⚠️  aria_api: NOT AVAILABLE")
        print("   VRS file processing will not work.")
        print("   To enable full functionality:")
        print("   Installation: https://github.com/306327680/Aria-Vrs-Mps-api")
        print("   Alternatively, you can use MPS CSV files instead of VRS files")

    print("-" * 60)
    print(f"🌐 Server starting at: http://localhost:5001")
    print(f"📁 Upload folder: {app.config['UPLOAD_FOLDER']}")
    print("🛑 Press Ctrl+C to stop the server")
    print("=" * 60)

    # Use port 5001 to avoid conflicts with macOS AirPlay Receiver (port 5000)
    app.run(debug=True, host='0.0.0.0', port=5001)

