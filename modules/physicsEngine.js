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
  engine.gravity.y = 1;

  const render = Matter.Render.create({
    canvas: renderCanvas,
    engine,
    options: {
      width: CONFIG.canvasWidth,
      height: CONFIG.canvasHeight,
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
    restitution: 0.6,
    friction: 0.3,
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

/** @returns {Set<Matter.Body>} */
export function getDynamicBodies() { return dynamicBodies; }

/**
 * Synchronizes Matter.js static bodies with stabilized detected objects.
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
    let body = bodyRegistry.get(id);

    const w = obj.size.width;
    const h = obj.size.height;
    const angleRad = obj.angle * Math.PI / 180;

    if (!body) {
      // Use rectangle — far more reliable than fromVertices
      body = Matter.Bodies.rectangle(
        obj.center.x,
        obj.center.y,
        Math.max(w, 4),   // minimum 4px to avoid degenerate bodies
        Math.max(h, 4),
        { isStatic: true, render: { fillStyle: 'rgba(0,255,0,0.25)', strokeStyle: '#0f0', lineWidth: 1 } }
      );
      if (!body) continue; // safety: skip if creation fails
      Matter.Body.setAngle(body, angleRad);
      Matter.World.add(world, body);
      bodyRegistry.set(id, body);
    } else {
      // Check if shape changed significantly → recreate
      const prevW = body._genartW || 0;
      const prevH = body._genartH || 0;
      const sizeDelta = Math.abs(w - prevW) + Math.abs(h - prevH);
      if (sizeDelta > 20) {
        // Size changed a lot — remove old, create new
        Matter.World.remove(world, body);
        body = Matter.Bodies.rectangle(
          obj.center.x, obj.center.y,
          Math.max(w, 4), Math.max(h, 4),
          { isStatic: true, render: { fillStyle: 'rgba(0,255,0,0.25)', strokeStyle: '#0f0', lineWidth: 1 } }
        );
        if (!body) { bodyRegistry.delete(id); continue; }
        Matter.Body.setAngle(body, angleRad);
        Matter.World.add(world, body);
        bodyRegistry.set(id, body);
      } else {
        // Update position/angle if changed
        const d = dist(obj.center, body.position);
        const angleDelta = Math.abs(obj.angle - body.angle * 180 / Math.PI);
        if (d > 2 || angleDelta > 2) {
          Matter.Body.setPosition(body, obj.center);
          Matter.Body.setAngle(body, angleRad);
        }
      }
    }
    // Store current size for change detection next frame
    body._genartW = w;
    body._genartH = h;
  }

  for (const [id, body] of bodyRegistry.entries()) {
    if (!currentIds.has(id)) {
      Matter.World.remove(world, body);
      bodyRegistry.delete(id);
    }
  }
}
