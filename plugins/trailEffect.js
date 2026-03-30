/**
 * TrailEffect plugin — draws fading trails behind fast-moving dynamic particles.
 * @module plugins/trailEffect
 */

const MAX_TRAIL = 12;         // positions per body
const MIN_SPEED_SQ = 4;       // squared speed threshold to record
const TRAIL_ALPHA = 0.35;

/** @type {Map<number, Array<{x:number,y:number}>>} */
const trails = new Map();

export default {
  name: 'trailEffect',
  version: '1.0',
  description: 'Fading trails on moving particles',

  hooks: {
    /**
     * Record positions of dynamic bodies.
     * @param {{ dynamicBodies: Iterable<Matter.Body> }} arg
     */
    onAfterPhysicsSync({ dynamicBodies }) {
      if (!dynamicBodies) return;
      const seen = new Set();
      for (const body of dynamicBodies) {
        seen.add(body.id);
        let trail = trails.get(body.id);
        if (!trail) { trail = []; trails.set(body.id, trail); }
        const last = trail[trail.length - 1];
        if (last) {
          const dx = body.position.x - last.x;
          const dy = body.position.y - last.y;
          if (dx * dx + dy * dy < MIN_SPEED_SQ) continue;
        }
        trail.push({ x: body.position.x, y: body.position.y });
        if (trail.length > MAX_TRAIL) trail.shift();
      }
      // Purge removed bodies
      for (const id of trails.keys()) {
        if (!seen.has(id)) trails.delete(id);
      }
    },

    /**
     * Draw trails.
     * @param {{ ctx: CanvasRenderingContext2D }} arg
     */
    onRender({ ctx }) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const trail of trails.values()) {
        if (trail.length < 2) continue;
        for (let i = 1; i < trail.length; i++) {
          const t = i / trail.length; // 0→1  (older→newer)
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.strokeStyle = `rgba(120,200,255,${(TRAIL_ALPHA * t).toFixed(2)})`;
          ctx.stroke();
        }
      }
      ctx.restore();
    },

    onDestroy() {
      trails.clear();
    }
  }
};

