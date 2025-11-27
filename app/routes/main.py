"""
Main routes - Handle root and index pages
"""

from flask import Blueprint, render_template
from aria_haptic_align import ARIA_API_AVAILABLE


bp = Blueprint('main', __name__)


@bp.route('/')
def index():
    """Render main page"""
    return render_template('index.html', aria_api_available=ARIA_API_AVAILABLE)

