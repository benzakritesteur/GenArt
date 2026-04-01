/**
 * Tests for modules/stabilizer.js
 */
import { describe, it, assert } from './testRunner.js';
import { stabilizeObjects, resetStabilizer } from '../modules/stabilizer.js';

/** Helper: creates a mock detection object */
function makeDet(x, y, w = 100, h = 60, angle = 0) {
  return {
    center: { x, y },
    size: { width: w, height: h },
    angle,
    corners: [
      { x: x - w / 2, y: y - h / 2 },
      { x: x + w / 2, y: y - h / 2 },
      { x: x + w / 2, y: y + h / 2 },
      { x: x - w / 2, y: y + h / 2 },
    ],
  };
}

describe('stabilizer', () => {

  it('should assign IDs to new detections', () => {
    resetStabilizer();
    const result = stabilizeObjects([makeDet(100, 100)]);
    assert.equal(result.length, 1);
    assert.ok(typeof result[0].id === 'number', 'id must be a number');
  });

  it('should return empty array for empty input', () => {
    resetStabilizer();
    const result = stabilizeObjects([]);
    assert.equal(result.length, 0);
  });

  it('should track multiple objects with unique IDs', () => {
    resetStabilizer();
    const result = stabilizeObjects([makeDet(100, 100), makeDet(400, 400)]);
    assert.equal(result.length, 2);
    const ids = result.map(r => r.id);
    assert.ok(ids[0] !== ids[1], 'IDs must be unique');
  });

  it('should re-use the same ID for a matched detection in next frame', () => {
    resetStabilizer();
    const r1 = stabilizeObjects([makeDet(100, 100)]);
    const firstId = r1[0].id;
    // Move slightly within tolerance
    const r2 = stabilizeObjects([makeDet(105, 102)]);
    assert.equal(r2.length, 1);
    assert.equal(r2[0].id, firstId, 'Same object should keep same ID');
  });

  it('should smooth positions via EMA (not jump to raw values)', () => {
    resetStabilizer();
    stabilizeObjects([makeDet(100, 100)]);
    const r2 = stabilizeObjects([makeDet(120, 100)]);
    // Center should be between 100 and 120 (EMA smoothing)
    assert.ok(r2[0].center.x > 100, 'Smoothed x should be > 100');
    assert.ok(r2[0].center.x < 120, 'Smoothed x should be < 120');
  });

  it('should persist objects for stabilizerFreezeFrames after disappearing', () => {
    resetStabilizer();
    stabilizeObjects([makeDet(200, 200)]);
    // Object disappears for 1 frame
    const r2 = stabilizeObjects([]);
    assert.equal(r2.length, 1, 'Object should persist for at least 1 frame after disappearing');
  });

  it('should eventually remove objects that disappear for many frames', () => {
    resetStabilizer();
    stabilizeObjects([makeDet(300, 300)]);
    // Simulate many empty frames
    let result;
    for (let i = 0; i < 200; i++) {
      result = stabilizeObjects([]);
    }
    assert.equal(result.length, 0, 'Object should be removed after enough missed frames');
  });

  it('should include corners in the output', () => {
    resetStabilizer();
    const result = stabilizeObjects([makeDet(100, 100, 80, 60)]);
    assert.ok(Array.isArray(result[0].corners), 'corners must be an array');
    assert.equal(result[0].corners.length, 4, 'corners must have 4 points');
  });
});

