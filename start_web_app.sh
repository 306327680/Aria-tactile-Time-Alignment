#!/bin/bash
# Quick start script for Aria-Haptic Alignment Web App
# Supports conda gen3 environment for IK service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default Python
PYTHON_CMD="python3"

# Check for conda gen3 environment
GEN3_PYTHON="/opt/homebrew/Caskroom/miniforge/base/envs/gen3/bin/python"
if [ -f "$GEN3_PYTHON" ]; then
    echo "✅ Found gen3 conda environment"
    PYTHON_CMD="$GEN3_PYTHON"
else
    echo "⚠️  gen3 conda environment not found, using system python3"
    if ! command -v python3 &> /dev/null; then
        echo "❌ Python3 not found. Please install Python 3.7+"
        exit 1
    fi
fi

# Check ikpy installation
echo "Checking ikpy..."
$PYTHON_CMD -c "import ikpy" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  ikpy not installed. Installing..."
    $PYTHON_CMD -m pip install ikpy
fi

# Run dependency check
echo ""
$PYTHON_CMD check_dependencies.py
DEPS_OK=$?

if [ $DEPS_OK -ne 0 ]; then
    echo ""
    echo "Please install missing dependencies before starting the server."
    exit 1
fi

echo ""
echo "🚀 Starting web server..."
echo "📍 Open your browser and visit: http://localhost:5001"
echo "🛑 Press Ctrl+C to stop the server"
echo ""
echo "📌 IK Service Endpoints:"
echo "   POST /ik         - Inverse Kinematics"
echo "   POST /fk         - Forward Kinematics"
echo "   GET  /ik/info    - Robot Info"
echo "   POST /ik/load_urdf - Load URDF"
echo ""

$PYTHON_CMD web_app.py
