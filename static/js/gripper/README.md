# Gripper Visualization - Modular Architecture

This directory contains the modularized gripper visualization code, refactored from the monolithic `gripper.js` file.

## Module Structure

### Core Modules

1. **constants.js** - Configuration constants and default values
   - Hand skeleton connections
   - Color definitions
   - Storage keys
   - Default settings
   - Scene/camera configuration

2. **sceneManager.js** - Three.js scene management
   - Scene, camera, renderer initialization
   - Lighting and helpers setup
   - Camera positioning and controls
   - Animation loop management
   - Memory cleanup (dispose)

3. **modelLoader.js** - 3D model loading
   - STL file loading
   - URDF parsing and assembly
   - Model positioning
   - Geometry/material cleanup

4. **handRenderer.js** - Hand landmark visualization
   - Landmark mapping to gripper space
   - Joint sphere rendering
   - Skeleton line rendering
   - Coordinate transformation

5. **configManager.js** - Configuration management
   - LocalStorage save/load
   - JSON config export/import
   - Mapping settings management

6. **timelineManager.js** - Playback control
   - Timeline UI updates
   - Play/pause/stop controls
   - Frame seeking
   - Speed control
   - Memory cleanup (dispose)

7. **uiController.js** - UI interaction handling
   - DOM element management
   - Event listener attachment
   - Form validation
   - Status messages
   - Memory cleanup (dispose)

8. **main.js** - Application entry point
   - Module integration
   - Event coordination
   - Lifecycle management
   - Memory leak prevention

## Memory Leak Prevention

The refactored code includes several improvements to prevent memory leaks:

### 1. Proper Disposal
- All modules have `dispose()` methods
- Three.js geometries and materials are explicitly disposed
- Event listeners are removed on cleanup
- Intervals are cleared

### 2. Lifecycle Management
- Animation loop can be stopped
- Resources are freed on page unload
- Listeners are properly detached

### 3. Reference Cleanup
- Circular references are avoided
- Callbacks are nullified on dispose
- DOM references are cleared

## Usage

### In HTML
```html
<!-- Replace the old gripper.js script with: -->
<script type="module" src="{{ url_for('static', filename='js/gripper/main.js') }}"></script>
```

### Debugging
The main app instance is exported to `window.gripperApp` for debugging:
```javascript
// In browser console
window.gripperApp.sceneManager.resetCamera();
window.gripperApp.timelineManager.pause();
window.gripperApp.dispose(); // Manual cleanup
```

## Benefits

1. **Modularity**: Each module has a single responsibility
2. **Maintainability**: Easier to debug and modify specific features
3. **Testability**: Modules can be tested independently
4. **Memory Safety**: Explicit disposal prevents leaks
5. **Reusability**: Modules can be reused in other projects
6. **Type Safety**: Clear interfaces between modules

## Migration from Old Code

The original `gripper.js` (1793 lines) has been split into 8 focused modules:
- constants.js (~70 lines)
- sceneManager.js (~280 lines)
- modelLoader.js (~340 lines)
- handRenderer.js (~140 lines)
- configManager.js (~180 lines)
- timelineManager.js (~200 lines)
- uiController.js (~360 lines)
- main.js (~420 lines)

Total: ~1990 lines (including better comments and error handling)

## Future Improvements

- Add TypeScript type definitions
- Implement unit tests for each module
- Add WebGL error recovery
- Implement progressive loading for large models
- Add performance monitoring
