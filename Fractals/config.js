/**
 * Global configuration for the Fractals real-time projection mapping system.
 *
 * Detection settings mirror the Bounce app (shared detection pipeline).
 * Fractal-specific settings control Julia set rendering.
 *
 * @namespace
 */

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

  // ── Detection performance ──
  /** @type {number} */ detectionScale: 0.5,
  /** @type {number} */ detectionInterval: 2,
  /** @type {number} */ morphDilateSize: 9,

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

  // ── Camera perspective correction ──
  /** @type {Point[]} */
  cameraCornerPin: [
    { x: 0, y: 0 },
    { x: 1280, y: 0 },
    { x: 1280, y: 720 },
    { x: 0, y: 720 }
  ],

  // ── Fractal rendering ──
  /** @type {number} Base max iterations for Julia set (increased by surface count). */
  fractalMaxIterations: 150,
  /** @type {number} Base zoom level. */
  fractalZoom: 1.0,
  /** @type {number} Animation speed multiplier (0 = static, 1 = normal). */
  fractalAnimationSpeed: 0.3,
  /** @type {{real: number, imag: number}} Default Julia constant (when no surfaces detected). */
  fractalDefaultC: { real: -0.7, imag: 0.27015 },
  /** @type {number} Blend smoothing for fractal parameter transitions (0-1, lower = smoother). */
  fractalBlendAlpha: 0.08,

  // ── Display ──
  /** @type {boolean} */ showCameraFeed: false,
  /** @type {boolean} */ showSurfaces: true,
  /** @type {boolean} */ showDebugOverlay: true,
};

