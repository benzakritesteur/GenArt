/**
 * Tests for modules/storage.js
 *
 * Uses a localStorage mock to avoid side effects on the real browser storage.
 */
import { describe, it, assert } from './testRunner.js';
import { CONFIG } from '../config.js';
import { saveCalibration, loadCalibration, clearCalibration } from '../modules/storage.js';

describe('storage', () => {

  it('should save calibration without throwing', () => {
    // saveCalibration writes to localStorage; should not throw
    let threw = false;
    try {
      saveCalibration();
    } catch (_) {
      threw = true;
    }
    assert.ok(!threw, 'saveCalibration should not throw');
  });

  it('should load calibration and return true after save', () => {
    saveCalibration();
    const result = loadCalibration();
    assert.equal(result, true, 'loadCalibration should return true after save');
  });

  it('should clear calibration', () => {
    saveCalibration();
    clearCalibration();
    const result = loadCalibration();
    assert.equal(result, false, 'loadCalibration should return false after clearCalibration');
  });

  it('should persist and restore colorProfiles', () => {
    // Snapshot current state
    const originalName = CONFIG.colorProfiles[0].name;
    CONFIG.colorProfiles[0].name = '__test_name__';
    saveCalibration();

    // Alter in-memory state
    CONFIG.colorProfiles[0].name = 'altered';

    // Restore
    loadCalibration();
    assert.equal(CONFIG.colorProfiles[0].name, '__test_name__', 'Profile name should be restored from storage');

    // Restore original
    CONFIG.colorProfiles[0].name = originalName;
    saveCalibration();
  });

  it('should persist corner pin points', () => {
    const originalCorner = { ...CONFIG.cornerPin[0] };
    CONFIG.cornerPin[0] = { x: 42, y: 99 };
    saveCalibration();

    CONFIG.cornerPin[0] = { x: 0, y: 0 };
    loadCalibration();
    assert.equal(CONFIG.cornerPin[0].x, 42, 'cornerPin x should be restored');
    assert.equal(CONFIG.cornerPin[0].y, 99, 'cornerPin y should be restored');

    // Restore original
    CONFIG.cornerPin[0] = originalCorner;
    saveCalibration();
  });

  it('should persist scalar values (spawnInterval)', () => {
    const original = CONFIG.spawnInterval;
    CONFIG.spawnInterval = 12345;
    saveCalibration();

    CONFIG.spawnInterval = 0;
    loadCalibration();
    assert.equal(CONFIG.spawnInterval, 12345, 'spawnInterval should be restored');

    // Restore
    CONFIG.spawnInterval = original;
    saveCalibration();
  });
});

