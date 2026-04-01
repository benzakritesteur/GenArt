/**
 * Trail Effect plugin for GenArt.
 *
 * Draws a fading motion trail behind each dynamic physics body. The trail
 * stores the last N positions per body and renders them as a polyline with
 * decreasing opacity.
 *
 * @module plugins/trailEffect
 */

const MAX_TRAIL_LENGTH = 20;
const TRAIL_OPACITY_START = 0.6;

/**
 * Per-body trail buffer.
 * @type {Map<number, Array<{x: number, y: number}>>}
 */
let trails = new Map();

/**
 * Creates the trail-effect plugin descriptor.
 *
 * @returns {import('../modules/pluginSystem.js').Plugin}
 */
export function createTrailEffectPlugin() {
  return {
    name: 'trailEffect',

    /**
     * Reset trail buffers on init.
     *
     * @param {Object} _context - Shared application context.
     * @returns {void}
     */
    init(_context) {
      trails = new Map();
    },

    /**
     * Called every frame. Records body positions and draws trails.
     *
     * @param {Object} context
     * @param {CanvasRenderingContext2D} context.ctx       - Overlay canvas context.
     * @param {Array<{id: number, position: {x: number, y: number}, render?: {fillStyle?: string}}>} [context.dynamicBodies] - Current dynamic bodies.
     * @returns {void}
     */
    update(context) {
      const ctx = context.ctx;
      const bodies = context.dynamicBodies;
      if (!ctx || !Array.isArray(bodies)) return;

      const activeIds = new Set();

      for (const body of bodies) {
        const id = body.id;
        activeIds.add(id);

        if (!trails.has(id)) {
          trails.set(id, []);
        }
        const trail = trails.get(id);
        trail.push({ x: body.position.x, y: body.position.y });
        if (trail.length > MAX_TRAIL_LENGTH) trail.shift();

        // Draw trail
        if (trail.length < 2) continue;
        const color = (body.render && body.render.fillStyle) || '#6cf';

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < trail.length; i++) {
          const progress = i / trail.length;
          ctx.globalAlpha = TRAIL_OPACITY_START * progress;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, 3 * progress);
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Prune trails for bodies that no longer exist
      for (const id of trails.keys()) {
        if (!activeIds.has(id)) {
          trails.delete(id);
        }
      }
    },

    /**
     * Cleanup on unregistration.
     *
     * @returns {void}
     */
    destroy() {
      trails = new Map();
    },
  };
}

