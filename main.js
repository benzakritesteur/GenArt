/**
 * Main entry point for GenArt real-time projection mapping system.
 * Orchestrates camera, OpenCV, physics, and UI modules.
 */
import { initCamera, captureFrame } from './modules/camera.js';
import { detectColorMask, findContours } from './modules/colorDetection.js';
import { processContours, drawDebugOverlay } from './modules/contourProcessor.js';
import { buildPerspectiveTransform, warpPoints, initCornerPinUI } from './modules/cornerPin.js';
import { stabilizeObjects } from './modules/stabilizer.js';
import { initPhysics, syncPhysicsBodies } from './modules/physicsEngine.js';
import { CONFIG } from './config.js';
import { createFPSMonitor } from './modules/utils.js';

// DOM elements
const video = document.getElementById('video');
const captureCanvas = document.getElementById('captureCanvas');
const debugCanvas = document.getElementById('debugCanvas');
const physicsCanvas = document.getElementById('physicsCanvas');
const debugCtx = debugCanvas.getContext('2d');

let showDebug = true;
let currentTransformMat = null;
const bodyRegistry = new Map();
let physics = null;
let fpsTick = null;

/**
 * Waits for OpenCV.js to be ready by listening for the global onOpenCvReady callback.
 * @returns {Promise<void>}
 */
function waitForOpenCvReady() {
  return new Promise(resolve => {
    if (window.cv && window.cv.Mat) return resolve();
    window.onOpenCvReady = () => resolve();
  });
}

/**
 * Initializes the system: camera, physics, corner pin UI, and perspective transform.
 * @returns {Promise<void>}
 */
async function init() {
  await waitForOpenCvReady();
  await initCamera(video);
  physics = initPhysics(physicsCanvas);
  // Set canvas sizes
  [captureCanvas, debugCanvas, physicsCanvas].forEach(c => {
    c.width = CONFIG.canvasWidth;
    c.height = CONFIG.canvasHeight;
  });
  // FPS HUD
  fpsTick = createFPSMonitor(document.body);
  // Initial transform: CONFIG.cornerPin to canvas corners
  const canvasCorners = [
    { x: 0, y: 0 },
    { x: CONFIG.canvasWidth, y: 0 },
    { x: CONFIG.canvasWidth, y: CONFIG.canvasHeight },
    { x: 0, y: CONFIG.canvasHeight }
  ];
  currentTransformMat = buildPerspectiveTransform(CONFIG.cornerPin, canvasCorners);
  // Corner pin UI
  initCornerPinUI(debugCanvas, newCorners => {
    if (currentTransformMat) currentTransformMat.delete();
    currentTransformMat = buildPerspectiveTransform(newCorners, canvasCorners);
  });
  // Debug toggle
  window.addEventListener('keydown', e => {
    if (e.key === 'd' || e.key === 'D') {
      showDebug = !showDebug;
      debugCanvas.style.display = showDebug ? 'block' : 'none';
    }
  });
  debugCanvas.style.display = showDebug ? 'block' : 'none';
  requestAnimationFrame(mainLoop);
}

/**
 * Main real-time processing/rendering loop.
 * @returns {void}
 */
function mainLoop() {
  if (fpsTick) fpsTick();
  // 1. Capture video frame
  captureFrame(video, captureCanvas, captureCanvas.getContext('2d'));
  // 2. Read frame as OpenCV Mat
  let src = null, mask = null, contoursVec = null;
  try {
    src = cv.imread(captureCanvas);
    // 3. Detect color mask
    mask = detectColorMask(src);
    // 4. Find contours
    contoursVec = findContours(mask);
    // 5. Process contours
    const contours = [];
    for (let i = 0; i < contoursVec.size(); ++i) {
      contours.push(contoursVec.get(i));
    }
    const detected = processContours(contours);
    // 6. Warp corners
    const warpedDetections = detected.map(obj => {
      const warpedCorners = warpPoints(obj.corners, currentTransformMat);
      return { ...obj, corners: warpedCorners };
    });
    // 7. Stabilize
    const stabilized = stabilizeObjects(warpedDetections);
    // 8. Sync physics bodies
    syncPhysicsBodies(physics.world, stabilized, bodyRegistry);
    // 9. Draw debug overlay
    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    if (showDebug) drawDebugOverlay(debugCtx, stabilized);
    // 10. Cleanup
    src.delete();
    mask.delete();
    contoursVec.delete();
    contours.forEach(cnt => cnt.delete());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Main loop error:', err);
  }
  // 11. Next frame
  requestAnimationFrame(mainLoop); // ⚠️ PERF
}

// Add debug calibration panel
const calibrationPanel = document.createElement('div');
calibrationPanel.style.position = 'fixed';
calibrationPanel.style.top = '16px';
calibrationPanel.style.right = '16px';
calibrationPanel.style.background = 'rgba(30,30,30,0.85)';
calibrationPanel.style.padding = '16px 20px 12px 20px';
calibrationPanel.style.borderRadius = '10px';
calibrationPanel.style.zIndex = '10000';
calibrationPanel.style.color = '#fff';
calibrationPanel.style.font = '14px monospace';
calibrationPanel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.25)';
calibrationPanel.style.display = 'block';
calibrationPanel.innerHTML = `
  <div style="font-weight:bold;font-size:15px;margin-bottom:8px;">HSV Calibration</div>
  <div id="slider-hueMin"></div>
  <div id="slider-hueMax"></div>
  <div id="slider-satMin"></div>
  <div id="slider-satMax"></div>
  <div id="slider-valMin"></div>
  <div id="slider-valMax"></div>
`;
document.body.appendChild(calibrationPanel);

const sliderDefs = [
  { key: 'hueMin', min: 0, max: 179, step: 1, label: 'Hue Min' },
  { key: 'hueMax', min: 0, max: 179, step: 1, label: 'Hue Max' },
  { key: 'satMin', min: 0, max: 255, step: 1, label: 'Sat Min' },
  { key: 'satMax', min: 0, max: 255, step: 1, label: 'Sat Max' },
  { key: 'valMin', min: 0, max: 255, step: 1, label: 'Val Min' },
  { key: 'valMax', min: 0, max: 255, step: 1, label: 'Val Max' }
];

sliderDefs.forEach(({ key, min, max, step, label }) => {
  const container = document.getElementById(`slider-${key}`);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = CONFIG[key];
  slider.style.width = '120px';
  slider.style.marginRight = '10px';
  slider.style.verticalAlign = 'middle';
  slider.style.accentColor = '#6cf';
  const valueSpan = document.createElement('span');
  valueSpan.textContent = slider.value;
  valueSpan.style.display = 'inline-block';
  valueSpan.style.width = '32px';
  valueSpan.style.textAlign = 'right';
  valueSpan.style.marginLeft = '4px';
  valueSpan.style.fontWeight = 'bold';
  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  labelSpan.style.display = 'inline-block';
  labelSpan.style.width = '70px';
  labelSpan.style.marginRight = '6px';
  container.appendChild(labelSpan);
  container.appendChild(slider);
  container.appendChild(valueSpan);
  slider.addEventListener('input', () => {
    CONFIG[key] = Number(slider.value); // Live update
    valueSpan.textContent = slider.value;
  });
});

// Start system
init();
