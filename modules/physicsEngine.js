/**
 * Physics engine integration using Matter.js for real-time projection mapping.
 * Supports static colliders from detection AND dynamic spawned bodies.
 */
import { CONFIG } from '../config.js';

/** @type {Set<Matter.Body>} */
const dynamicBodies = new Set();


/**
 * Initializes the Matter.js physics engine, world, and renderer.
 *
 * @param {HTMLCanvasElement} renderCanvas
 * @returns {{ engine: Matter.Engine, world: Matter.World, runner: Matter.Runner, render: Matter.Render }}
 */
export function initPhysics(renderCanvas) {
  const engine = Matter.Engine.create();
  const world = engine.world;
  engine.gravity.x = 0;
  engine.gravity.y = 1.2;

  const render = Matter.Render.create({
    canvas: renderCanvas,
    engine,
    options: {
      width: CONFIG.canvasWidth,
      height: CONFIG.canvasHeight,
      pixelRatio: 1,
      wireframes: false,
      background: 'transparent',
      hasBounds: true,
      showAngleIndicator: false,
      showCollisions: false,
      showVelocity: false,
      showIds: false,
      showPositions: false,
      showConvexHulls: false,
      showBounds: false
    }
  });

  // Boundaries: floor, left, right, ceiling
  const wallOpts = { isStatic: true, render: { visible: false } };
  const floor = Matter.Bodies.rectangle(CONFIG.canvasWidth / 2, CONFIG.canvasHeight + 25, CONFIG.canvasWidth, 50, wallOpts);
  const leftWall = Matter.Bodies.rectangle(-25, CONFIG.canvasHeight / 2, 50, CONFIG.canvasHeight, wallOpts);
  const rightWall = Matter.Bodies.rectangle(CONFIG.canvasWidth + 25, CONFIG.canvasHeight / 2, 50, CONFIG.canvasHeight, wallOpts);
  const ceiling = Matter.Bodies.rectangle(CONFIG.canvasWidth / 2, -25, CONFIG.canvasWidth, 50, wallOpts);
  Matter.World.add(world, [floor, leftWall, rightWall, ceiling]);

  const runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);
  Matter.Render.run(render);

  return { engine, world, runner, render };
}

// ── Dynamic body helpers ──

const PALETTE = ['#6cf', '#fc6', '#f66', '#6f6', '#c6f', '#ff6', '#6ff'];

/**
 * Spawn a dynamic circle at (x, y).
 * @param {Matter.World} world
 * @param {number} x
 * @param {number} y
 */
export function spawnDynamicBody(world, x, y) {
  if (dynamicBodies.size >= CONFIG.maxDynamicBodies) return;
  const r = CONFIG.dynamicBodyRadius + Math.random() * 6;
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const body = Matter.Bodies.circle(x, y, r, {
    isStatic: false,
    restitution: 0.75,
    friction: 0.1,
    frictionAir: 0.005,
    density: 0.002,
    render: { fillStyle: color }
  });
  Matter.World.add(world, body);
  dynamicBodies.add(body);
}

/**
 * Remove off-screen or excess dynamic bodies.
 * @param {Matter.World} world
 */
export function cleanupDynamicBodies(world) {
  for (const body of dynamicBodies) {
    const { x, y } = body.position;
    if (y > CONFIG.canvasHeight + 100 || y < -100 || x < -100 || x > CONFIG.canvasWidth + 100) {
      Matter.World.remove(world, body);
      dynamicBodies.delete(body);
    }
  }
  // enforce cap
  if (dynamicBodies.size > CONFIG.maxDynamicBodies) {
    const excess = [...dynamicBodies].slice(0, dynamicBodies.size - CONFIG.maxDynamicBodies);
    for (const b of excess) {
      Matter.World.remove(world, b);
      dynamicBodies.delete(b);
    }
  }
}

/** @returns {number} */
export function getDynamicBodyCount() { return dynamicBodies.size; }

/**
 * Synchronizes Matter.js static bodies with stabilized detected objects.
 * Uses Matter.Bodies.rectangle with rotation — much more reliable than
 * fromVertices (which requires poly-decomp for concave polygons).
 *
 * @param {Matter.World} world
 * @param {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>, id?: number}>} stabilizedObjects
 * @param {Map<number, Matter.Body>} bodyRegistry
 */
export function syncPhysicsBodies(world, stabilizedObjects, bodyRegistry) {
  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const currentIds = new Set();

  for (const obj of stabilizedObjects) {
    const id = obj.id;
    if (typeof id !== 'number') continue;
    currentIds.add(id);

    // Use width/height from the detected rotated rectangle
    const w = obj.size.width;
    const h = obj.size.height;
    if (w < 1 || h < 1) continue;

    // OpenCV minAreaRect angle → radians for Matter.js
    // OpenCV 4.x returns angle in [-90, 0) — we convert to standard radians
    const angleRad = obj.angle * Math.PI / 180;

    let body = bodyRegistry.get(id);
    if (!body) {
      // Create a static rectangle at the detected center with rotation.
      // Rendered invisible — surfaces are drawn by the afterRender overlay.
      body = Matter.Bodies.rectangle(
        obj.center.x,
        obj.center.y,
        w,
        h,
        {
          isStatic: true,
          angle: angleRad,
          restitution: 0.6,
          friction: 0.4,
          render: { visible: false }
        }
      );

      if (!body) {
        console.warn(`[physics] Failed to create body for object #${id}`);
        continue;
      }

      Matter.World.add(world, body);
      bodyRegistry.set(id, body);
      console.log(`[physics] Created static body #${id} at (${obj.center.x.toFixed(0)}, ${obj.center.y.toFixed(0)}) size ${w.toFixed(0)}×${h.toFixed(0)}`);
    } else {
      // Update existing body position/angle if moved significantly
      const d = dist(obj.center, body.position);
      const angleDelta = Math.abs(angleRad - body.angle);
      if (d > 3 || angleDelta > 0.03) {
        Matter.Body.setPosition(body, obj.center);
        Matter.Body.setAngle(body, angleRad);
      }
    }
  }

  // Remove bodies whose tracked objects have disappeared
  for (const [id, body] of bodyRegistry.entries()) {
    if (!currentIds.has(id)) {
      Matter.World.remove(world, body);
      bodyRegistry.delete(id);
      console.log(`[physics] Removed static body #${id}`);
    }
  }
}
