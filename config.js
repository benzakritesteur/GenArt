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
      name: 'Green',
      hueMin: 30, hueMax: 90,
      satMin: 80, satMax: 255,
      valMin: 80, valMax: 255,
      displayColor: '#0f0'
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
  /** @type {number} */ minContourArea: 500,

  // ── Stabilizer ──
  /** @type {number} */ stabilizerTolerance: 8,
  /** @type {number} */ stabilizerFreezeFrames: 10,

  // ── Canvas ──
  /** @type {number} */ canvasWidth: 1280,
  /** @type {number} */ canvasHeight: 720,

  // ── Corner pin ──
  /** @type {Point[]} */
  cornerPin: [
    { x: 100, y: 100 },
    { x: 1180, y: 100 },
    { x: 1180, y: 620 },
    { x: 100, y: 620 }
  ],

  // ── Physics: dynamic bodies ──
  /** @type {number} */ spawnInterval: 800,
  /** @type {number} */ maxDynamicBodies: 80,
  /** @type {boolean} */ autoSpawnEnabled: true,
  /** @type {number} */ dynamicBodyRadius: 12,

  // ── Rendering ──
  /** @type {boolean} */ useWebGL: false,

  // ── Plugins ──
  /** @type {string[]} */ enabledPlugins: ['collisionSpark', 'trailEffect'],
};
