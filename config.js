/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} ColorProfile
 * @property {string} name - Display name
 * @property {number} hueMin
 * @property {number} hueMax
 * @property {number} satMin
 * @property {number} satMax
 * @property {number} valMin
 * @property {number} valMax
 * @property {string} displayColor - CSS color for debug overlay
 */

/**
 * Global configuration object for GenArt real-time projection mapping system.
 * @namespace
 */
export const CONFIG = {
  // ── Multi-color detection profiles ──
  /** @type {ColorProfile[]} */
  colorProfiles: [
    {
      name: 'Yellow',
      hueMin: 15, hueMax: 45,
      satMin: 60, satMax: 255,
      valMin: 100, valMax: 255,
      displayColor: '#ff0'
    },
    {
      name: 'Pink',
      hueMin: 140, hueMax: 175,
      satMin: 40, satMax: 255,
      valMin: 100, valMax: 255,
      displayColor: '#f6c'
    },
    {
      name: 'Blue',
      hueMin: 90, hueMax: 130,
      satMin: 60, satMax: 255,
      valMin: 80, valMax: 255,
      displayColor: '#39f'
    },
    {
      name: 'Green',
      hueMin: 45, hueMax: 85,
      satMin: 50, satMax: 255,
      valMin: 80, valMax: 255,
      displayColor: '#3c6'
    }
  ],

  // ── Legacy accessors (point to first profile) ──
  get hueMin()  { return this.colorProfiles[0].hueMin; },
  set hueMin(v) { this.colorProfiles[0].hueMin = v; },
  get hueMax()  { return this.colorProfiles[0].hueMax; },
  set hueMax(v) { this.colorProfiles[0].hueMax = v; },
  get satMin()  { return this.colorProfiles[0].satMin; },
  set satMin(v) { this.colorProfiles[0].satMin = v; },
  get satMax()  { return this.colorProfiles[0].satMax; },
  set satMax(v) { this.colorProfiles[0].satMax = v; },
  get valMin()  { return this.colorProfiles[0].valMin; },
  set valMin(v) { this.colorProfiles[0].valMin = v; },
  get valMax()  { return this.colorProfiles[0].valMax; },
  set valMax(v) { this.colorProfiles[0].valMax = v; },

  // ── Contour ──
  /** @type {number} */ minContourArea: 300,

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
};
