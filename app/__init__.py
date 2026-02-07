"""
Flask Application Factory

Creates and configures the Flask application instance.
"""

import os
import tempfile
from flask import Flask


def create_app(config=None):
    """
    Create and configure Flask application.

    Args:
        config: Optional configuration dictionary

    Returns:
        Configured Flask application instance
    """
    # Get the base directory (where app/ folder is located)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    app = Flask(__name__,
                static_folder=os.path.join(base_dir, 'app', 'static'),
                template_folder=os.path.join(base_dir, 'templates'))

    # Default configuration
    app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max
    app.config['UPLOAD_FOLDER'] = tempfile.mkdtemp()

    # Apply custom configuration if provided
    if config:
        app.config.update(config)

    # Create upload folder
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    # Register blueprints
    from app.routes import main, alignment, visualization, player, gripper, data_manager

    app.register_blueprint(main.bp)
    app.register_blueprint(alignment.bp)
    app.register_blueprint(visualization.bp)
    app.register_blueprint(player.bp)
    app.register_blueprint(gripper.bp)
    app.register_blueprint(data_manager.bp)

    # Health check endpoint
    @app.route('/health')
    def health():
        from flask import jsonify
        return jsonify({'status': 'healthy'})

    return app
