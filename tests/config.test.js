/**
 * Tests for config.js — validates CONFIG structure and defaults.
 */
import { describe, it, assert } from './testRunner.js';
import { CONFIG } from '../config.js';

describe('CONFIG', () => {

  it('should export a non-null CONFIG object', () => {
    assert.ok(CONFIG, 'CONFIG must be defined');
    assert.equal(typeof CONFIG, 'object');
  });

  it('should have colorProfiles as a non-empty array', () => {
    assert.ok(Array.isArray(CONFIG.colorProfiles), 'colorProfiles must be an array');
    assert.ok(CONFIG.colorProfiles.length > 0, 'colorProfiles must not be empty');
  });

  it('should have valid color profile structure', () => {
    for (const profile of CONFIG.colorProfiles) {
      assert.ok(typeof profile.name === 'string' && profile.name.length > 0, 'profile.name must be a non-empty string');
      assert.ok(typeof profile.targetColor === 'string', 'profile.targetColor must be a string');
      assert.ok(/^#[0-9a-fA-F]{6}$/.test(profile.targetColor), `targetColor "${profile.targetColor}" must be a 6-char hex color`);
      assert.ok(typeof profile.tolerance === 'number', 'profile.tolerance must be a number');
      assert.ok(profile.tolerance > 0 && profile.tolerance <= 255, 'profile.tolerance must be in (0, 255]');
    }
  });

  it('should have positive canvasWidth and canvasHeight', () => {
    assert.ok(CONFIG.canvasWidth > 0, 'canvasWidth must be positive');
    assert.ok(CONFIG.canvasHeight > 0, 'canvasHeight must be positive');
  });

  it('should have cornerPin as an array of 4 points', () => {
    assert.ok(Array.isArray(CONFIG.cornerPin), 'cornerPin must be an array');
    assert.equal(CONFIG.cornerPin.length, 4, 'cornerPin must have exactly 4 points');
    for (const p of CONFIG.cornerPin) {
      assert.ok(typeof p.x === 'number', 'cornerPin point must have numeric x');
      assert.ok(typeof p.y === 'number', 'cornerPin point must have numeric y');
    }
  });

  it('should have valid physics defaults', () => {
    assert.ok(CONFIG.spawnInterval > 0, 'spawnInterval must be positive');
    assert.ok(CONFIG.maxDynamicBodies > 0, 'maxDynamicBodies must be positive');
    assert.equal(typeof CONFIG.autoSpawnEnabled, 'boolean', 'autoSpawnEnabled must be boolean');
    assert.ok(CONFIG.dynamicBodyRadius > 0, 'dynamicBodyRadius must be positive');
  });

  it('should have valid stabilizer defaults', () => {
    assert.ok(CONFIG.stabilizerTolerance > 0, 'stabilizerTolerance must be positive');
    assert.ok(CONFIG.stabilizerFreezeFrames > 0, 'stabilizerFreezeFrames must be positive');
    assert.ok(CONFIG.minContourArea > 0, 'minContourArea must be positive');
  });

  it('should have display toggle booleans', () => {
    assert.equal(typeof CONFIG.showCameraFeed, 'boolean');
    assert.equal(typeof CONFIG.showSurfaces, 'boolean');
  });
});

