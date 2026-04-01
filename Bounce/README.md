# GenArt: Real-Time Projection Mapping System

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![OpenCV.js](https://img.shields.io/badge/OpenCV.js-CDN-blue)](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
[![Matter.js](https://img.shields.io/badge/Matter.js-CDN-orange)](https://brm.io/matter-js/)

> **Real-time computer vision meets browser physics.**

---

## Overview

**GenArt** is a real-time, browser-based projection mapping system that combines computer vision (OpenCV.js) and 2D physics (Matter.js) to turn physical objects into interactive digital colliders. Designed for rapid prototyping and live installations, GenArt requires no build tools or frameworks—just open `index.html` and go.

### Features
- **Live Webcam Capture** with configurable resolution
- **HSV Color Detection** — robust `cv.inRange`-based detection in WASM, with automatic hue-wrapping for reds (falls back to RGB if HSV is unavailable)
- **Multi-Color Profiles** — detect multiple color targets simultaneously with tabbed profiles, per-profile tolerance, and eyedropper color picker
- **Contour Extraction & Rotated Bounding Boxes** with `cv.approxPolyDP` vertex simplification
- **Dual Corner Pin** — projector output warp (yellow handles, `D` key) + camera input perspective correction (cyan handles, `C` key), both with touch support and proper event listener cleanup
- **Real-Time Physics Colliders (Matter.js)** — static colliders from detection + dynamic spawned bodies
- **Infinite Spawn with Recycling** — `recycleOldest` evicts the oldest ball when the cap is reached, enabling continuous particle flow
- **Customisable Ball Color Palette** — add, remove, and pick colors from the UI; persisted in presets
- **Performance Tuning** — configurable input downscaling (`detectionScale`), frame-skipping (`detectionInterval`), cached morphology kernels, optional dilation pass
- **Interactive Calibration Panel** — color picker, tolerance slider per profile, physics controls, performance sliders, corner pin coordinate fields
- **Plugin System** — lightweight lifecycle-hook plugin architecture with event bus
- **Save/Load Calibration** — persist all settings to localStorage
- **Export/Import Config Presets** — download/upload JSON preset files (includes all settings)
- **Touch & Mobile Support** — full touch events for corner pin and spawning
- **Debug Overlay & FPS/Memory HUD**
- **No Bundler, No Frameworks: 100% Vanilla JS, ES Modules**

---

## Pipeline

```text
+-----------+    +----------------+    +-----------------+    +-----------------+    +-------------------+
|  Webcam   | -> | Camera Warp    | -> | HSV cv.inRange  | -> | Morphology +    | -> | Physics Colliders |
|  Capture  |    | (corner pin)   |    | (multi-profile) |    | Contour Extract |    | (Matter.js)       |
+-----------+    +----------------+    +-----------------+    +-----------------+    +-------------------+
                   ↕ optional            ↕ downscaled                                  + Dynamic Bodies
                   perspective           (detectionScale)                               + Recycle Oldest
                   correction
```

---

## File Structure

```text
project/
├── index.html                # Entry point, loads all scripts via <script type="module">
├── main.js                   # Main orchestrator (init, loop, UI, detection, physics controls)
├── config.js                 # Global CONFIG object (profiles, performance, physics, display)
├── Dockerfile                # Nginx-based container for quick deployment
├── modules/
│   ├── camera.js             # Webcam capture utilities
│   ├── colorDetection.js     # HSV cv.inRange masking, morphology, contour finding (OpenCV.js)
│   ├── contourProcessor.js   # Rotated bounding box, angle, corner extraction
│   ├── cornerPin.js          # Perspective transform & interactive drag/touch UI with cleanup
│   ├── physicsEngine.js      # Matter.js world, static collider sync, dynamic body spawn/recycle
│   ├── pluginSystem.js       # Lightweight plugin registry with lifecycle hooks & event bus
│   ├── stabilizer.js         # EMA-smoothed object tracking & jitter prevention
│   ├── storage.js            # Save/load calibration (localStorage) + export/import presets (JSON)
│   ├── utils.js              # FPS/memory HUD and other utilities
│   └── webglRenderer.js      # WebGL2 renderer (planned — feature detection only for now)
├── plugins/
│   ├── collisionSpark.js     # Spark/flash effect on dynamic-body collisions
│   └── trailEffect.js        # Fading motion trail behind dynamic bodies
└── tests/
    ├── index.html            # Test harness HTML page
    ├── testRunner.js         # Minimal browser-based test runner (describe/it/assert)
    ├── config.test.js        # CONFIG structure & defaults tests
    ├── contourProcessor.test.js  # Contour processor input-validation tests
    ├── pluginSystem.test.js  # Plugin system lifecycle & event tests
    ├── stabilizer.test.js    # Stabilizer tracking & EMA tests
    ├── storage.test.js       # Persistence round-trip tests
    └── webglRenderer.test.js # WebGL feature-detection tests
```

### Module Descriptions

| Module              | Responsibility                                                    |
|---------------------|------------------------------------------------------------------|
| camera.js           | Webcam stream setup and frame capture                             |
| colorDetection.js   | HSV `cv.inRange` masking (WASM), hue-wrapping, morphology, downscaling, contour finding |
| contourProcessor.js | Rotated bounding box, angle, corner extraction, aspect ratio filtering |
| cornerPin.js        | Perspective transform matrix, drag + touch UI, event listener cleanup via `destroy()` |
| physicsEngine.js    | Matter.js world, static collider sync, dynamic body spawn/recycle with oldest eviction |
| pluginSystem.js     | Plugin registration, lifecycle hooks (init/update/destroy), event bus |
| stabilizer.js       | Object tracking, EMA smoothing, jitter filtering, ID assignment   |
| storage.js          | localStorage persistence, JSON file export/import (all settings including ball colours & perf) |
| utils.js            | FPS/memory HUD, general utilities                                 |
| webglRenderer.js    | WebGL2 feature detection (full renderer is planned)               |

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
  // ── Detection ──
  colorProfiles: [                // HSV-based detection profiles
    { name: 'Yellow', targetColor: '#E2C829', tolerance: 70 },
    { name: 'Pink',   targetColor: '#E8509A', tolerance: 70 },
    { name: 'Blue',   targetColor: '#3B7DD8', tolerance: 70 },
    { name: 'Green',  targetColor: '#3BB54A', tolerance: 70 },
  ],
  minContourArea: 150,            // Minimum contour area (px²)
  stabilizerTolerance: 60,        // Max distance for object matching (px)
  stabilizerFreezeFrames: 30,     // Frames to keep a lost object alive

  // ── Performance ──
  detectionScale: 0.5,            // Downscale factor (0.25–1.0) — lower = faster
  detectionInterval: 2,           // Run detection every N frames (1–6)
  morphDilateSize: 9,             // Extra dilation kernel (0 = disabled, 3–21)

  // ── Corner pin ──
  cornerPin: [ ... ],             // 4 projector output warp corners
  cameraCornerPin: [ ... ],       // 4 camera input correction corners

  // ── Physics ──
  spawnInterval: 800,             // Auto-spawn interval (ms)
  maxDynamicBodies: 80,           // Max particles on screen
  recycleOldest: true,            // Evict oldest ball when at cap (infinite spawn)
  autoSpawnEnabled: true,
  dynamicBodyRadius: 12,
  spawnMode: 'random',            // 'random' | 'single'
  spawnPoint: { x: 640, y: 10 }, // Drop point for single mode
  ballColors: ['#6cf', '#fc6', '#f66', '#6f6', '#c6f', '#ff6', '#6ff'],

  // ── Display ──
  showCameraFeed: true,
  showSurfaces: true,
};
```

---

## Usage Guide

### Multi-Color Detection
- Click the **color profile tabs** in the control panel to switch between profiles.
- Click **+** to add a new color profile.
- Each profile has an independent **target color** (hex picker or eyedropper), **tolerance** slider, and name.
- **Eyedropper**: click the camera preview thumbnail to pick a target color directly from the live feed.
- Detection uses **HSV colour space** with `cv.inRange` (WASM) for robust matching under varying lighting.
- Detected objects are tagged with their profile color in the debug overlay.

### Color Calibration
- Use the **tolerance slider** for the active profile to widen or narrow the detection range.
- Lower tolerance = stricter match (only very similar colors). Higher = more lenient.
- The detection mask preview updates in real time next to the camera preview.

### Corner Pin Setup
- **Projector output warp** — drag the 4 **yellow** handles (`D` key to toggle). Adjust the projected output to match the physical surface.
- **Camera input correction** — drag the 4 **cyan** handles (`C` key to toggle). Crop, zoom, and correct camera perspective.
- Both support **touch-drag** on mobile. Coordinate fields in the panel update in real time.
- Corner pin instances are properly cleaned up on re-initialization (no event listener leaks).

### Physics & Dynamic Bodies
- **Auto-spawn** particles rain from the top (toggle with checkbox).
- **Click/tap** anywhere on the canvas to drop a particle.
- **Recycle oldest** — when enabled (default), the oldest ball is removed when the max is reached, creating a continuous flow of particles. Disable to stop spawning at the cap.
- Adjust spawn interval, max bodies, and particle radius with sliders.
- **Spawn mode**: `random` (rain across the full width) or `single` (fixed drop point).
- Physical objects detected by the camera act as static colliders that particles bounce off.

### Ball Color Palette
- The **🎨 Ball Colors** section shows editable colour swatches.
- **Click** a swatch to change its colour via the native colour picker.
- **Hover + click ×** to remove a colour (minimum 1 required).
- **Click +** to add a new random colour.
- The palette is persisted in save/export.

### Performance Tuning
- **Det. scale** (25–100%) — downscale the input image before detection. At 50%, only ¼ of the pixels are processed.
- **Det. skip** (1–6) — run detection every Nth frame. Physics and rendering always run every frame using cached results.
- **Dilate size** (0–21) — extra morphological dilation to merge nearby blobs from the same surface. Set to 0 to disable.
- All settings are saved/exported with presets.

### Save / Load / Export / Import
- **💾 Save** — persist all settings (profiles, corner pins, physics, performance, ball colors) to browser localStorage.
- **📂 Load** — restore saved settings.
- **🗑 Reset** — clear saved settings and reload defaults.
- **⬇ Export** — download current settings as a `.json` preset file.
- **⬆ Import** — upload a `.json` preset file to restore settings.

### Keyboard Shortcuts

| Key | Action                                      |
|-----|---------------------------------------------|
| `D` | Toggle projector corner pin handles (yellow) |
| `C` | Toggle camera corner pin handles (cyan)      |
| `V` | Toggle camera feed visibility                |
| `H` | Hide / show the control panel                |
| `T` | Spawn a test static body in the centre       |

### Debug Mode
- Press **`D`** to toggle the debug overlay (bounding boxes, handles, angle text).
- The **FPS/Mem HUD** (top-left) shows real FPS and OpenCV Mat count (memory leak warning if >200).

---

## Performance Notes & Known Limitations
- **HSV + `cv.inRange`** masking runs entirely in WASM (5–10× faster than the previous JS pixel loop).
- **Input downscaling** (`detectionScale: 0.5`) reduces pixel count by 4×; masks are upscaled back to full resolution for accurate contour coordinates.
- **Frame-skipping** (`detectionInterval: 2`) decouples detection from rendering — physics and rendering run every frame using cached detection results. The EMA stabilizer smooths between detection frames.
- **Cached morphology kernels** (`cv.Size`, `cv.getStructuringElement`) are allocated once and reused across all frames, eliminating repeated WASM heap allocations.
- **`cv.approxPolyDP`** simplifies contour vertices before `minAreaRect`, reducing downstream compute and producing cleaner rectangle fits.
- All OpenCV Mats are manually deleted each frame to prevent memory leaks.
- Physics colliders are static and update only when objects move significantly.
- Dynamic bodies are automatically cleaned up when off-screen or over the cap.
- Corner pin UIs properly destroy old event listeners before re-initialization — no handler accumulation.

---

## Roadmap

- [x] Multi-color detection (multiple masks)
- [x] HSV `cv.inRange` detection pipeline (WASM-accelerated)
- [x] Input downscaling & frame-skipping for performance
- [x] Camera perspective correction (input-side corner pin)
- [x] Save/load calibration (localStorage)
- [x] Export/import config presets (all settings)
- [x] Touch/mobile support for UI
- [x] Physics: dynamic bodies, recycleOldest, customisable ball colours
- [x] Modular plugin system
- [x] Automated test suite (browser-based)
- [ ] WebGL-accelerated pipeline

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## Acknowledgements
- [OpenCV.js](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html) — Computer vision in the browser
- [Matter.js](https://brm.io/matter-js/) — 2D physics engine
- [shields.io](https://shields.io/) — Badges
- Inspired by the creative coding and projection mapping communities

