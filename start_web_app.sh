#!/bin/bash
# Quick start script for Aria-Haptic Alignment Web App

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found. Please install Python 3.7+"
    exit 1
fi

# Run dependency check
echo ""
python3 check_dependencies.py
DEPS_OK=$?

if [ $DEPS_OK -ne 0 ]; then
    echo ""
    echo "Please install missing dependencies before starting the server."
    exit 1
fi

echo ""
echo "🚀 Starting web server..."
echo "📍 Open your browser and visit: http://localhost:5000"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

python3 web_app.py
