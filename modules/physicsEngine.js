/**
 * Physics engine integration using Matter.js for real-time projection mapping.
 * Uses global Matter object and project CONFIG.
 */
import { CONFIG } from '../config.js';

/**
 * Initializes the Matter.js physics engine, world, and renderer.
 *
 * @param {HTMLCanvasElement} renderCanvas - Canvas element for Matter.js rendering.
 * @returns {{ engine: Matter.Engine, world: Matter.World, runner: Matter.Runner, render: Matter.Render }}
 * @example
 * const { engine, world, runner, render } = initPhysics(canvas);
 */
export function initPhysics(renderCanvas) {
  // Create engine and world
  const engine = Matter.Engine.create();
  const world = engine.world;
  engine.gravity.x = 0;
  engine.gravity.y = 1;

  // Create renderer
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

  // Add static boundaries (floor, left, right walls)
  const floor = Matter.Bodies.rectangle(
    CONFIG.canvasWidth / 2,
    CONFIG.canvasHeight + 25,
    CONFIG.canvasWidth,
    50,
    { isStatic: true, render: { visible: false } }
  );
  const leftWall = Matter.Bodies.rectangle(
    -25,
    CONFIG.canvasHeight / 2,
    50,
    CONFIG.canvasHeight,
    { isStatic: true, render: { visible: false } }
  );
  const rightWall = Matter.Bodies.rectangle(
    CONFIG.canvasWidth + 25,
    CONFIG.canvasHeight / 2,
    50,
    CONFIG.canvasHeight,
    { isStatic: true, render: { visible: false } }
  );
  Matter.World.add(world, [floor, leftWall, rightWall]);

  // Start engine and renderer
  const runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);
  Matter.Render.run(render);

  return { engine, world, runner, render };
}

/**
 * Synchronizes Matter.js static bodies with stabilized detected objects.
 *
 * @param {Matter.World} world - The Matter.js world.
 * @param {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>, id?: number}>} stabilizedObjects - Array of stabilized objects (must include unique id).
 * @param {Map<number, Matter.Body>} bodyRegistry - Map of tracked object IDs to Matter bodies.
 * @returns {void}
 * @example
 * syncPhysicsBodies(world, stabilizedObjects, bodyRegistry);
 */
export function syncPhysicsBodies(world, stabilizedObjects, bodyRegistry) {
  // Helper: Euclidean distance
  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Track which IDs are present
  const currentIds = new Set();

  for (const obj of stabilizedObjects) {
    // Require a unique id for each stabilized object
    const id = obj.id;
    if (typeof id !== 'number') continue;
    currentIds.add(id);
    let body = bodyRegistry.get(id);
    const vertices = obj.corners.map(pt => ({ x: pt.x, y: pt.y }));
    if (!body) {
      // Create new static body from 4 corners
      body = Matter.Bodies.fromVertices(
        obj.center.x,
        obj.center.y,
        [vertices],
        { isStatic: true, render: { fillStyle: 'rgba(0,255,0,0.2)' } },
        true
      );
      Matter.World.add(world, body);
      bodyRegistry.set(id, body);
    } else {
      // Update position/angle if changed beyond tolerance
      const d = dist(obj.center, body.position);
      const angleDelta = Math.abs(obj.angle - body.angle * 180 / Math.PI);
      if (d > CONFIG.stabilizerTolerance || angleDelta > 5) {
        Matter.Body.setPosition(body, obj.center);
        Matter.Body.setAngle(body, obj.angle * Math.PI / 180);
      }
    }
  }

  // Remove bodies for IDs no longer present
  for (const [id, body] of bodyRegistry.entries()) {
    if (!currentIds.has(id)) {
      Matter.World.remove(world, body);
      bodyRegistry.delete(id);
    }
  }
}

