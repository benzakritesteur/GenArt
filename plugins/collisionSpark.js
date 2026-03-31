/**
 * Collision Spark plugin for GenArt.
 *
 * Renders a brief spark/flash particle effect at the point where a dynamic
 * body collides with a static collider surface. Listens for Matter.js
 * collision events via the plugin system's event bus.
 *
 * @module plugins/collisionSpark
 */

/**
 * @typedef {Object} Spark
 * @property {number} x       - X position.
 * @property {number} y       - Y position.
 * @property {number} radius  - Current radius.
 * @property {number} opacity - Current opacity (0-1).
 * @property {string} color   - CSS color string.
 * @property {number} birth   - Timestamp of creation (ms).
 */

const SPARK_LIFETIME_MS = 400;
const SPARK_MAX_RADIUS = 18;

/** @type {Spark[]} */
let activeSparks = [];

/**
 * Creates the collision-spark plugin descriptor.
 *
 * @returns {import('../modules/pluginSystem.js').Plugin}
 */
export function createCollisionSparkPlugin() {
  return {
    name: 'collisionSpark',

    /**
     * Initializes the plugin. No-op for now; context may carry the canvas
     * reference in the future.
     *
     * @param {Object} _context - Shared application context.
     * @returns {void}
     */
    init(_context) {
      activeSparks = [];
    },

    /**
     * Called every frame. Draws active sparks and removes expired ones.
     *
     * @param {Object} context
     * @param {CanvasRenderingContext2D} context.ctx - Debug/overlay canvas context.
     * @returns {void}
     */
    update(context) {
      const now = performance.now();
      const ctx = context.ctx;
      if (!ctx) return;

      activeSparks = activeSparks.filter(spark => {
        const age = now - spark.birth;
        if (age > SPARK_LIFETIME_MS) return false;

        const progress = age / SPARK_LIFETIME_MS;
        const radius = spark.radius * (1 - progress * 0.5);
        const opacity = spark.opacity * (1 - progress);

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = spark.color;
        ctx.shadowColor = spark.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();

        return true;
      });
    },

    /**
     * Cleanup on unregistration.
     *
     * @returns {void}
     */
    destroy() {
      activeSparks = [];
    },

    on: {
      /**
       * Handles a collision event by spawning a spark at the contact point.
       *
       * @param {{x: number, y: number, color?: string}} data - Collision info.
       */
      collision(data) {
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return;
        activeSparks.push({
          x: data.x,
          y: data.y,
          radius: SPARK_MAX_RADIUS * (0.6 + Math.random() * 0.4),
          opacity: 0.9,
          color: data.color || '#fff',
          birth: performance.now(),
        });
      },
    },
  };
}

