/**
 * CollisionSpark plugin — draws fading spark bursts when particles collide with detected objects.
 * @module plugins/collisionSpark
 */

const SPARK_LIFETIME = 400; // ms
const SPARK_COUNT = 6;
const SPARK_RADIUS = 18;

let sparks = [];
let collisionHandler = null;

export default {
  name: 'collisionSpark',
  version: '1.0',
  description: 'Visual sparks on particle collisions',

  hooks: {
    /**
     * Register Matter.js collision listener.
     * @param {{ engine: Matter.Engine }} ctx
     */
    onInit(ctx) {
      if (!ctx?.engine) return;
      sparks = [];
      collisionHandler = (event) => {
        for (const pair of event.pairs) {
          const a = pair.bodyA, b = pair.bodyB;
          // Only spark when a dynamic body hits a static body
          if ((a.isStatic && !b.isStatic) || (!a.isStatic && b.isStatic)) {
            const contact = pair.collision?.supports?.[0] || pair.activeContacts?.[0]?.vertex;
            const pos = contact || { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 };
            sparks.push({ x: pos.x, y: pos.y, time: performance.now() });
          }
        }
      };
      Matter.Events.on(ctx.engine, 'collisionStart', collisionHandler);
    },

    /**
     * Draw sparks on the debug canvas.
     * @param {{ ctx: CanvasRenderingContext2D }} arg
     */
    onRender({ ctx }) {
      const now = performance.now();
      sparks = sparks.filter(s => now - s.time < SPARK_LIFETIME);
      ctx.save();
      for (const s of sparks) {
        const t = (now - s.time) / SPARK_LIFETIME; // 0→1
        const alpha = 1 - t;
        const radius = SPARK_RADIUS * (0.4 + t * 0.6);
        for (let i = 0; i < SPARK_COUNT; i++) {
          const angle = (Math.PI * 2 * i) / SPARK_COUNT + t * 0.5;
          const dist = radius * t;
          const px = s.x + Math.cos(angle) * dist;
          const py = s.y + Math.sin(angle) * dist;
          const r = 3 * (1 - t);
          ctx.beginPath();
          ctx.arc(px, py, Math.max(r, 0.5), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,${Math.round(200 * (1 - t))},50,${alpha.toFixed(2)})`;
          ctx.fill();
        }
      }
      ctx.restore();
    },

    /**
     * Cleanup listener.
     * @param {{ engine: Matter.Engine }} ctx
     */
    onDestroy(ctx) {
      if (ctx?.engine && collisionHandler) {
        Matter.Events.off(ctx.engine, 'collisionStart', collisionHandler);
      }
      collisionHandler = null;
      sparks = [];
    }
  }
};

