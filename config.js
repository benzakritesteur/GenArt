/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * Global configuration object for GenArt real-time projection mapping system.
 * All values are read-only and should not be mutated at runtime.
 * @namespace
 * @property {number} hueMin - Minimum hue value for HSV color thresholding (0-179)
 * @property {number} hueMax - Maximum hue value for HSV color thresholding (0-179)
 * @property {number} satMin - Minimum saturation value for HSV color thresholding (0-255)
 * @property {number} satMax - Maximum saturation value for HSV color thresholding (0-255)
 * @property {number} valMin - Minimum value (brightness) for HSV color thresholding (0-255)
 * @property {number} valMax - Maximum value (brightness) for HSV color thresholding (0-255)
 * @property {number} minContourArea - Minimum area (in pixels) for detected contours to be considered valid
 * @property {number} stabilizerTolerance - Maximum pixel movement allowed before stabilizer updates position
 * @property {number} stabilizerFreezeFrames - Number of frames to "freeze" object position after movement
 * @property {number} canvasWidth - Width of the main canvas in pixels
 * @property {number} canvasHeight - Height of the main canvas in pixels
 * @property {Point[]} cornerPin - Array of 4 points for perspective transform: [topLeft, topRight, bottomRight, bottomLeft]
 */
export const CONFIG = {
  /** @type {number} */ hueMin: 30,
  /** @type {number} */ hueMax: 90,
  /** @type {number} */ satMin: 80,
  /** @type {number} */ satMax: 255,
  /** @type {number} */ valMin: 80,
  /** @type {number} */ valMax: 255,
  /** @type {number} */ minContourArea: 500,
  /** @type {number} */ stabilizerTolerance: 8,
  /** @type {number} */ stabilizerFreezeFrames: 10,
  /** @type {number} */ canvasWidth: 1280,
  /** @type {number} */ canvasHeight: 720,
  /** @type {Point[]} */
  cornerPin: [
    { x: 100, y: 100 },    // topLeft
    { x: 1180, y: 100 },   // topRight
    { x: 1180, y: 620 },   // bottomRight
    { x: 100, y: 620 }     // bottomLeft
  ]
};

