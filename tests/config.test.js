import { describe, it, assert, assertEqual, assertDeepEqual } from './testRunner.js';
import { CONFIG } from '../config.js';

describe('CONFIG', () => {
  it('has at least one color profile', () => {
    assert(Array.isArray(CONFIG.colorProfiles), 'colorProfiles should be an array');
    assert(CONFIG.colorProfiles.length >= 1, 'should have at least 1 profile');
  });

  it('first profile has all HSV keys', () => {
    const p = CONFIG.colorProfiles[0];
    for (const k of ['hueMin','hueMax','satMin','satMax','valMin','valMax','displayColor','name']) {
      assert(p[k] !== undefined, `profile missing key "${k}"`);
    }
  });

  it('legacy hueMin accessor reads first profile', () => {
    const original = CONFIG.colorProfiles[0].hueMin;
    assertEqual(CONFIG.hueMin, original, 'legacy getter should match profile');
  });

  it('legacy hueMin setter writes first profile', () => {
    const original = CONFIG.colorProfiles[0].hueMin;
    CONFIG.hueMin = 42;
    assertEqual(CONFIG.colorProfiles[0].hueMin, 42);
    CONFIG.hueMin = original; // restore
  });

  it('has expected scalar defaults', () => {
    assertEqual(typeof CONFIG.minContourArea, 'number');
    assertEqual(typeof CONFIG.stabilizerTolerance, 'number');
    assertEqual(typeof CONFIG.canvasWidth, 'number');
    assertEqual(typeof CONFIG.canvasHeight, 'number');
  });

  it('cornerPin has 4 points with x,y', () => {
    assertEqual(CONFIG.cornerPin.length, 4);
    for (const p of CONFIG.cornerPin) {
      assert(typeof p.x === 'number' && typeof p.y === 'number');
    }
  });

  it('has physics config keys', () => {
    assertEqual(typeof CONFIG.spawnInterval, 'number');
    assertEqual(typeof CONFIG.maxDynamicBodies, 'number');
    assertEqual(typeof CONFIG.autoSpawnEnabled, 'boolean');
    assertEqual(typeof CONFIG.dynamicBodyRadius, 'number');
  });

  it('has useWebGL and enabledPlugins', () => {
    assertEqual(typeof CONFIG.useWebGL, 'boolean');
    assert(Array.isArray(CONFIG.enabledPlugins));
  });
});

