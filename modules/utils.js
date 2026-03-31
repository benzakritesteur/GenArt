/**
 * Utility for monitoring FPS and OpenCV Mat memory usage in a fixed HUD.
 * @module utils
 */

/**
 * Creates an FPS monitor HUD and returns a tick function to update it each frame.
 *
 * @param {HTMLElement} containerElement - The DOM element to attach the HUD to (usually document.body).
 * @returns {function(): void} tick - Call this function once per frame to update FPS and memory info.
 * @example
 * import { createFPSMonitor } from './modules/utils.js';
 * const tick = createFPSMonitor(document.body);
 * // In main loop: tick();
 */
export function createFPSMonitor(containerElement) {
  const bufferSize = 60;
  const timestamps = [];
  let frameCount = 0;
  let lastFPS = 0;

  // Create HUD
  const hud = document.createElement('div');
  hud.style.position = 'fixed';
  hud.style.left = '16px';
  hud.style.top = '16px';
  hud.style.background = 'rgba(0,0,0,0.7)';
  hud.style.color = '#fff';
  hud.style.font = '14px monospace';
  hud.style.padding = '8px 16px';
  hud.style.borderRadius = '8px';
  hud.style.zIndex = '10001';
  hud.style.pointerEvents = 'none';
  hud.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
  containerElement.appendChild(hud);

  function updateHUD(fps, matCount, matWarning) {
    hud.innerHTML =
      `<span style="color:#6cf">FPS:</span> ${fps.toFixed(1)}<br>` +
      `<span style="color:#fc6">cv.Mat:</span> ${matCount}` +
      (matWarning ? ` <span style="color:#f44;font-weight:bold">(LEAK?)</span>` : '');
  }

  function getMatCount() {
    // OpenCV.js exposes a global counter for Mats in debug builds as cv.Mat.counter
    // If not available, fallback to 0
    return (window.cv && window.cv.Mat && typeof window.cv.Mat.counter === 'number')
      ? window.cv.Mat.counter
      : 0;
  }

  function tick() {
    const now = performance.now();
    timestamps.push(now);
    if (timestamps.length > bufferSize) timestamps.shift();
    frameCount++;
    if (frameCount % 10 === 0) {
      if (timestamps.length >= 2) {
        const deltas = [];
        for (let i = 1; i < timestamps.length; ++i) {
          deltas.push(timestamps[i] - timestamps[i - 1]);
        }
        const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        lastFPS = 1000 / avgDelta;
      }
      const matCount = getMatCount();
      const matWarning = matCount > 200;
      updateHUD(lastFPS, matCount, matWarning);
    }
  }

  // Initial HUD
  updateHUD(0, getMatCount(), false);

  return tick;
}

