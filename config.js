/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} ColorProfile
 * @property {string} name - Display name
 * @property {string} targetColor - Target color in hex (e.g. '#FFD700')
 * @property {number} tolerance - Max per-channel color difference (0-255)
 */

/**
 * Global configuration object for GenArt real-time projection mapping system.
 * Color detection uses HSV color space comparison (falls back to RGB if
 * cv.cvtColor is unavailable). The tolerance value controls how far a pixel's
 * color may deviate from the target; it is mapped to separate H/S/V ranges
 * internally for robust detection under varying lighting.
 * @namespace
 */
export const CONFIG = {
  // ── Multi-color detection profiles (HSV-based, tolerance 0-255) ──
  /** @type {ColorProfile[]} */
  colorProfiles: [
    { name: 'Yellow', targetColor: '#E2C829', tolerance: 70 },
    { name: 'Pink',   targetColor: '#E8509A', tolerance: 70 },
    { name: 'Blue',   targetColor: '#3B7DD8', tolerance: 70 },
    { name: 'Green',  targetColor: '#3BB54A', tolerance: 70 },
  ],

  // ── Contour ──
  /** @type {number} */ minContourArea: 150,

  // ── Stabilizer ──
  /** @type {number} */ stabilizerTolerance: 60,
  /** @type {number} */ stabilizerFreezeFrames: 30,

  // ── Canvas ──
  /** @type {number} */ canvasWidth: 1280,
  /** @type {number} */ canvasHeight: 720,

  // ── Corner pin (projector output warp) ──
  /** @type {Point[]} */
  cornerPin: [
    { x: 0, y: 0 },
    { x: 1280, y: 0 },
    { x: 1280, y: 720 },
    { x: 0, y: 720 }
  ],

  // ── Camera: zoom + perspective correction (input-side corner pin) ──
  // Drag the 4 cyan handles (C key) to crop, zoom, and correct camera angle.
  /** @type {Point[]} */
  cameraCornerPin: [
    { x: 0, y: 0 },
    { x: 1280, y: 0 },
    { x: 1280, y: 720 },
    { x: 0, y: 720 }
  ],

  // ── Physics: dynamic bodies ──
  /** @type {number} */ spawnInterval: 800,
  /** @type {number} */ maxDynamicBodies: 80,
  /** @type {boolean} */ autoSpawnEnabled: true,
  /** @type {boolean} */ recycleOldest: true,
  /** @type {number} */ dynamicBodyRadius: 12,
  /** @type {string} */ spawnMode: 'random',  // 'random' | 'single'
  /** @type {Point} */ spawnPoint: { x: 640, y: 10 },

  // ── Display ──
  /** @type {boolean} */ showCameraFeed: true,
  /** @type {boolean} */ showSurfaces: true,
};
