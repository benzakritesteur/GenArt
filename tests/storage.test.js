import { describe, it, beforeEach, assert, assertEqual } from './testRunner.js';
import { CONFIG } from '../config.js';
import { saveCalibration, loadCalibration, clearCalibration } from '../modules/storage.js';

describe('Storage', () => {
  let origProfiles, origCornerPin;

  beforeEach(() => {
    // Snapshot originals
    origProfiles = JSON.parse(JSON.stringify(CONFIG.colorProfiles));
    origCornerPin = JSON.parse(JSON.stringify(CONFIG.cornerPin));
    clearCalibration();
  });

  it('loadCalibration returns false when nothing saved', () => {
    assertEqual(loadCalibration(), false);
  });

  it('save then load round-trips colorProfiles', () => {
    CONFIG.colorProfiles[0].hueMin = 99;
    saveCalibration();
    CONFIG.colorProfiles[0].hueMin = 0; // reset
    const ok = loadCalibration();
    assertEqual(ok, true);
    assertEqual(CONFIG.colorProfiles[0].hueMin, 99);
    // restore
    CONFIG.colorProfiles = origProfiles;
  });

  it('save then load round-trips cornerPin', () => {
    CONFIG.cornerPin[0].x = 42;
    saveCalibration();
    CONFIG.cornerPin[0].x = 0;
    loadCalibration();
    assertEqual(CONFIG.cornerPin[0].x, 42);
    CONFIG.cornerPin = origCornerPin;
  });

  it('clearCalibration removes data', () => {
    saveCalibration();
    clearCalibration();
    assertEqual(loadCalibration(), false);
  });

  it('persists useWebGL flag', () => {
    const orig = CONFIG.useWebGL;
    CONFIG.useWebGL = true;
    saveCalibration();
    CONFIG.useWebGL = false;
    loadCalibration();
    assertEqual(CONFIG.useWebGL, true);
    CONFIG.useWebGL = orig;
  });

  it('persists enabledPlugins', () => {
    const orig = [...CONFIG.enabledPlugins];
    CONFIG.enabledPlugins = ['testPlugin'];
    saveCalibration();
    CONFIG.enabledPlugins = [];
    loadCalibration();
    assertEqual(CONFIG.enabledPlugins[0], 'testPlugin');
    CONFIG.enabledPlugins = orig;
  });
});

