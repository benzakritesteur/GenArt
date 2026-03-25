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
- **Color-based Object Detection (HSV thresholding)**
- **Contour Extraction & Rotated Bounding Boxes**
- **Perspective Correction (Corner Pin Tool)**
- **Real-Time Physics Colliders (Matter.js)**
- **Interactive Calibration UI (HSV sliders, Corner Pin drag handles)**
- **Debug Overlay & FPS/Memory HUD**
- **No Bundler, No Frameworks: 100% Vanilla JS, ES Modules**

---

## Pipeline

```text
+-----------+    +----------------+    +-------------------+    +-------------------+    +-------------------+
|  Webcam   | -> | HSV Threshold   | -> | Contour Extraction| -> | Perspective Warp  | -> | Physics Colliders |
|  Capture  |    | (OpenCV.js)    |    | (OpenCV.js)       |    | (OpenCV.js)       |    | (Matter.js)       |
+-----------+    +----------------+    +-------------------+    +-------------------+    +-------------------+
```

---

## File Structure

```text
project/
├── index.html                # Entry point, loads all scripts via <script type="module">
├── main.js                   # Main orchestrator (init, loop, UI)
├── config.js                 # Global CONFIG object (HSV, canvas, stabilizer, etc.)
└── modules/
    ├── camera.js             # Webcam capture utilities
    ├── colorDetection.js     # HSV masking & contour finding (OpenCV.js)
    ├── contourProcessor.js   # Bounding box, angle extraction (OpenCV.js)
    ├── cornerPin.js          # Perspective transform & UI (OpenCV.js)
    ├── physicsEngine.js      # Matter.js world & body sync
    ├── stabilizer.js         # Jitter prevention & object tracking
    └── utils.js              # FPS/memory HUD and other utilities
```

### Module Descriptions

| Module              | Responsibility                                      |
|---------------------|----------------------------------------------------|
| camera.js           | Webcam stream setup and frame capture               |
| colorDetection.js   | HSV masking, morphological cleaning, contour find   |
| contourProcessor.js | Rotated bounding box, angle, and corner extraction  |
| cornerPin.js        | Perspective transform matrix and drag UI            |
| physicsEngine.js    | Matter.js world, static collider sync               |
| stabilizer.js       | Object tracking, jitter filtering                   |
| utils.js            | FPS/memory HUD, general utilities                   |

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

### Configuration

All tunable parameters are in `config.js`:

```javascript
export const CONFIG = {
  hueMin: 30, hueMax: 90,      // HSV color threshold
  satMin: 80, satMax: 255,
  valMin: 80, valMax: 255,
  minContourArea: 500,         // Minimum contour area
  stabilizerTolerance: 8,      // Jitter tolerance (px)
  stabilizerFreezeFrames: 10,  // Freeze duration (frames)
  canvasWidth: 1280,           // Canvas size
  canvasHeight: 720,
  cornerPin: [                 // Perspective transform corners
    { x: 100, y: 100 },
    { x: 1180, y: 100 },
    { x: 1180, y: 620 },
    { x: 100, y: 620 }
  ]
};
```

---

## Usage Guide

### HSV Calibration
- Use the **HSV Calibration Panel** (top-right) to adjust color detection in real time.
- Each slider updates the detection mask instantly.

### Corner Pin Setup
- Drag the 4 yellow handles on the debug overlay to align the detection quad with your projector/screen.
- The perspective transform updates live.

### Debug Mode
- Press **'D'** to toggle the debug overlay (bounding boxes, handles, angle text).
- The **FPS/Mem HUD** (top-left) shows real FPS and OpenCV Mat count (memory leak warning if >200).

---

## Performance Notes & Known Limitations
- ⚠️ **PERF:** All OpenCV Mats are manually deleted each frame to prevent memory leaks.
- Real-time performance (30+ FPS) depends on webcam resolution, CPU, and browser.
- No GPU/WebGL acceleration; all processing is CPU-bound.
- Only one color range is supported at a time (single mask).
- No persistent storage for calibration/config (refresh resets sliders).
- Physics colliders are static and update only when objects move significantly.

---

## Roadmap

- [ ] Multi-color detection (multiple masks)
- [ ] Save/load calibration (localStorage)
- [ ] Touch/mobile support for UI
- [ ] Physics: dynamic bodies, more interactions
- [ ] Export/import config presets
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

