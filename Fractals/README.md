# GenArt Fractals

This app uses real-time camera-based surface detection to generate and project fractals onto detected surfaces. It is designed for interactive installations using a camera and a projector.

## Features
- **Surface Detection**: Uses color-based contour detection to identify surfaces in the camera feed.
- **Fractal Generation**: For each detected surface, generates a fractal pattern based on its position, color, width, and height.
- **Projection Mapping**: Supports projector corner pinning for keystone correction.
- **Configurable**: Color profiles, detection parameters, and fractal settings are easily adjustable.

## Usage
1. **Setup**: Place your camera to view the area where surfaces will be detected. Connect your projector to display the output.
2. **Configure**: Edit `config.js` to set color profiles and detection parameters. Use the UI to fine-tune detection and projection.
3. **Run**: Open `index.html` in a browser with camera and projector connected. Detected surfaces will be outlined, and fractals will be rendered and projected onto them.

## Project Structure
- `main.js` — Main orchestrator: detection, stabilization, fractal rendering, and UI.
- `config.js` — Detection and fractal configuration.
- `modules/` — (Optional) Fractal algorithms, storage, and utilities.
- `index.html` — App entry point, includes required canvases and scripts.
- `shared/` — Shared modules for camera, detection, and utilities.

## Fractal Algorithm
Each detected surface's position, color, width, and height are used to parameterize a fractal equation (e.g., Mandelbrot, Julia, or custom). The fractal is rendered inside the surface bounds, with color and detail influenced by the detected properties.

## Requirements
- Modern browser with WebGL and camera support
- OpenCV.js (for detection)
- Projector (for projection mapping)

## Development
- See `main.js` for the detection and rendering pipeline.
- To add new fractal types, implement them in `modules/fractalRenderer.js` and call from `main.js`.
- For advanced projection mapping, adjust the corner pin UI and transformation logic.

## License
MIT

