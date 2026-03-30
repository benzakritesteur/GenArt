# GenArt: Real-Time Projection Mapping System

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![OpenCV.js](https://img.shields.io/badge/OpenCV.js-CDN-blue)](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
[![Matter.js](https://img.shields.io/badge/Matter.js-CDN-orange)](https://brm.io/matter-js/)

> **Real-time computer vision meets browser physics.**

---

## Overview

**GenArt** is a real-time, browser-based projection mapping system that combines computer vision (OpenCV.js) and 2D physics (Matter.js) to turn physical objects into interactive digital colliders. Designed for rapid prototyping and live installations, GenArt requires no build tools or frameworks—just open `index.html` and go.

### Features
- **Live Webcam Capture**
- **Multi-Color Detection** — detect multiple HSV color ranges simultaneously with tabbed profiles
- **Color-based Object Detection (HSV thresholding)**
- **Contour Extraction & Rotated Bounding Boxes**
- **Perspective Correction (Corner Pin Tool)**
- **Real-Time Physics Colliders (Matter.js)** — static colliders from detection + dynamic spawned bodies
- **Dynamic Body Spawning** — auto-spawn particles or click/tap to drop them
- **Interactive Calibration UI** — HSV sliders per profile, physics controls, corner pin drag handles
- **Save/Load Calibration** — persist all settings to localStorage
- **Export/Import Config Presets** — download/upload JSON preset files
- **Touch & Mobile Support** — full touch events for corner pin and spawning
- **Debug Overlay & FPS/Memory HUD**
- **No Bundler, No Frameworks: 100% Vanilla JS, ES Modules**

---

## Pipeline

```text
+-----------+    +------------------+    +-------------------+    +-------------------+    +-------------------+
|  Webcam   | -> | HSV Threshold    | -> | Contour Extraction| -> | Perspective Warp  | -> | Physics Colliders |
|  Capture  |    | (multi-profile)  |    | (OpenCV.js)       |    | (OpenCV.js)       |    | (Matter.js)       |
+-----------+    +------------------+    +-------------------+    +-------------------+    +-------------------+
                                                                                            + Dynamic Bodies
```

---

## File Structure

```text
project/
├── index.html                # Entry point, loads all scripts via <script type="module">
├── main.js                   # Main orchestrator (init, loop, UI, multi-color, physics controls)
├── config.js                 # Global CONFIG object (color profiles, canvas, stabilizer, physics, etc.)
└── modules/
    ├── camera.js             # Webcam capture utilities
    ├── colorDetection.js     # Multi-color HSV masking & contour finding (OpenCV.js)
    ├── contourProcessor.js   # Bounding box, angle extraction (OpenCV.js)
    ├── cornerPin.js          # Perspective transform & UI with touch support (OpenCV.js)
    ├── physicsEngine.js      # Matter.js world, static collider sync, dynamic body spawning
    ├── stabilizer.js         # Jitter prevention & object tracking
    ├── storage.js            # Save/load calibration (localStorage) + export/import presets (JSON)
    └── utils.js              # FPS/memory HUD and other utilities
```

### Module Descriptions

| Module              | Responsibility                                                    |
|---------------------|------------------------------------------------------------------|
| camera.js           | Webcam stream setup and frame capture                             |
| colorDetection.js   | Multi-color HSV masking (optimized: single HSV conversion), contour finding |
| contourProcessor.js | Rotated bounding box, angle, corner extraction, per-profile debug colors |
| cornerPin.js        | Perspective transform matrix, drag + touch UI                     |
| physicsEngine.js    | Matter.js world, static collider sync, dynamic body spawn/cleanup |
| stabilizer.js       | Object tracking, jitter filtering, ID assignment                  |
| storage.js          | localStorage persistence, JSON file export/import                 |
| utils.js            | FPS/memory HUD, general utilities                                 |

---

## Getting Started

### Prerequisites
- Modern browser (Chrome, Edge, Firefox; must support ES modules and getUserMedia)
- Local HTTP server (for webcam access; e.g. Python, Node, or VSCode Live Server)

### Quick Start

1. **Clone or Download** this repository.
2. **Start a local server** in the project directory:

```bash
# Python 3.x
python3 -m http.server 8000
# OR Node.js
npx serve .
```

3. **Open** [http://localhost:8000](http://localhost:8000) in your browser.
4. **Allow webcam access** when prompted.

### Docker

```bash
docker build -t genart .
docker run -p 8080:80 genart
# Open http://localhost:8080
```

### Configuration

All tunable parameters are in `config.js`:

```javascript
export const CONFIG = {
  colorProfiles: [              // Multi-color detection profiles
    {
      name: 'Green',
      hueMin: 30, hueMax: 90,
      satMin: 80, satMax: 255,
      valMin: 80, valMax: 255,
      displayColor: '#0f0'
    }
  ],
  minContourArea: 500,
  stabilizerTolerance: 8,
  stabilizerFreezeFrames: 10,
  canvasWidth: 1280,
  canvasHeight: 720,
  cornerPin: [ ... ],           // 4 perspective transform corners
  spawnInterval: 800,           // Auto-spawn interval (ms)
  maxDynamicBodies: 80,         // Max particles
  autoSpawnEnabled: true,
  dynamicBodyRadius: 12,
};
```

---

## Usage Guide

### Multi-Color Detection
- Click the **color profile tabs** in the control panel to switch between profiles.
- Click **+** to add a new color profile (up to 6 predefined colors).
- Each profile has independent HSV sliders, name, and display color.
- Detected objects are tagged with their profile color in the debug overlay.

### HSV Calibration
- Use the **HSV sliders** for the active color profile to adjust detection in real time.
- Each slider updates the detection mask instantly.

### Corner Pin Setup
- Drag (or touch-drag) the 4 yellow handles on the debug overlay to align the detection quad.
- The perspective transform updates live.

### Physics & Dynamic Bodies
- **Auto-spawn** particles rain from the top (toggle with checkbox).
- **Click/tap** anywhere on the canvas to drop a particle.
- Adjust spawn interval, max bodies, and particle radius with sliders.
- Physical objects detected by the camera act as static colliders that particles bounce off.

### Save / Load / Export / Import
- **💾 Save** — persist all settings (profiles, corner pin, physics) to browser localStorage.
- **📂 Load** — restore saved settings.
- **🗑 Reset** — clear saved settings and reload defaults.
- **⬇ Export** — download current settings as a `.json` preset file.
- **⬆ Import** — upload a `.json` preset file to restore settings.

### Debug Mode
- Press **'D'** to toggle the debug overlay (bounding boxes, handles, angle text).
- The **FPS/Mem HUD** (top-left) shows real FPS and OpenCV Mat count (memory leak warning if >200).

---

## Performance Notes & Known Limitations
- ⚠️ **PERF:** All OpenCV Mats are manually deleted each frame to prevent memory leaks.
- Multi-color detection shares a single HSV conversion across profiles for efficiency.
- Real-time performance (30+ FPS) depends on webcam resolution, CPU, and browser.
- No GPU/WebGL acceleration; all processing is CPU-bound.
- Physics colliders are static and update only when objects move significantly.
- Dynamic bodies are automatically cleaned up when off-screen or over the cap.

---

## Roadmap

- [x] Multi-color detection (multiple masks)
- [x] Save/load calibration (localStorage)
- [x] Touch/mobile support for UI
- [x] Physics: dynamic bodies, more interactions
- [x] Export/import config presets
- [ ] WebGL-accelerated pipeline
- [ ] Modular plugin system
- [ ] Automated test suite

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## Acknowledgements
- [OpenCV.js](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html) — Computer vision in the browser
- [Matter.js](https://brm.io/matter-js/) — 2D physics engine
- [shields.io](https://shields.io/) — Badges
- Inspired by the creative coding and projection mapping communities

