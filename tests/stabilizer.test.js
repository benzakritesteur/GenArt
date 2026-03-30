import { describe, it, assert, assertEqual, assertGreaterThan } from './testRunner.js';
import { stabilizeObjects, resetStabilizer } from '../modules/stabilizer.js';

function makeDet(x, y, angle = 0) {
  return {
    center: { x, y },
    size: { width: 50, height: 30 },
    angle,
    corners: [{ x: x-25, y: y-15 }, { x: x+25, y: y-15 }, { x: x+25, y: y+15 }, { x: x-25, y: y+15 }]
  };
}

describe('Stabilizer', () => {
  it('returns empty for no detections', () => {
    resetStabilizer();
    const result = stabilizeObjects([]);
    assertEqual(result.length, 0);
  });

  it('assigns unique IDs', () => {
    resetStabilizer();
    const result = stabilizeObjects([makeDet(100, 100), makeDet(300, 300)]);
    assertEqual(result.length, 2);
    assert(typeof result[0].id === 'number', 'should have numeric id');
    assert(result[0].id !== result[1].id, 'IDs should be unique');
  });

  it('tracks object across frames at same position', () => {
    resetStabilizer();
    const r1 = stabilizeObjects([makeDet(100, 100)]);
    const id = r1[0].id;
    // Same position next frame
    const r2 = stabilizeObjects([makeDet(100, 100)]);
    assertEqual(r2.length, 1);
    assertEqual(r2[0].id, id, 'should keep same ID');
  });

  it('removes objects after missed frames', () => {
    resetStabilizer();
    stabilizeObjects([makeDet(100, 100)]);
    // Miss many frames
    for (let i = 0; i < 20; i++) stabilizeObjects([]);
    const result = stabilizeObjects([]);
    assertEqual(result.length, 0, 'should be removed after missing many frames');
  });

  it('creates new ID for far-away detection', () => {
    resetStabilizer();
    const r1 = stabilizeObjects([makeDet(100, 100)]);
    const id1 = r1[0].id;
    // Very far away — should be a new object
    const r2 = stabilizeObjects([makeDet(100, 100), makeDet(900, 900)]);
    assertEqual(r2.length, 2);
    const ids = r2.map(o => o.id);
    assert(ids.includes(id1), 'original ID should persist');
    const newId = ids.find(i => i !== id1);
    assertGreaterThan(newId, id1, 'new ID should be higher');
  });

  it('resetStabilizer clears all state', () => {
    resetStabilizer();
    stabilizeObjects([makeDet(100, 100)]);
    resetStabilizer();
    const result = stabilizeObjects([]);
    assertEqual(result.length, 0);
  });
});

