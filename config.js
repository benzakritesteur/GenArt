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
 * Color detection uses RGB color difference: a pixel is detected when each
 * channel's absolute difference from the target color is within the tolerance.
 * @namespace
 */
export const CONFIG = {
  // ── Multi-color detection profiles (RGB difference) ──
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

  // ── Corner pin ──
  /** @type {Point[]} */
  cornerPin: [
    { x: 0, y: 0 },
    { x: 1280, y: 0 },
    { x: 1280, y: 720 },
    { x: 0, y: 720 }
  ],

  // ── Physics: dynamic bodies ──
  /** @type {number} */ spawnInterval: 800,
  /** @type {number} */ maxDynamicBodies: 80,
  /** @type {boolean} */ autoSpawnEnabled: true,
  /** @type {number} */ dynamicBodyRadius: 12,

  // ── Display ──
  /** @type {boolean} */ showCameraFeed: true,
  /** @type {boolean} */ showSurfaces: true,
};
