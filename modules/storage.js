/**
 * Persistence helpers for saving/loading calibration and config presets.
 * Uses localStorage and File API.
 */
import { CONFIG } from '../config.js';

const STORAGE_KEY = 'genart-calibration';

/**
 * Serialisable snapshot of CONFIG (excludes getter/setter-based props).
 * @returns {Object}
 */
function snapshot() {
  return {
    colorProfiles: CONFIG.colorProfiles.map(p => ({ ...p })),
    minContourArea: CONFIG.minContourArea,
    stabilizerTolerance: CONFIG.stabilizerTolerance,
    stabilizerFreezeFrames: CONFIG.stabilizerFreezeFrames,
    canvasWidth: CONFIG.canvasWidth,
    canvasHeight: CONFIG.canvasHeight,
    cornerPin: CONFIG.cornerPin.map(p => ({ ...p })),
    cameraCornerPin: CONFIG.cameraCornerPin.map(p => ({ ...p })),
    spawnInterval: CONFIG.spawnInterval,
    maxDynamicBodies: CONFIG.maxDynamicBodies,
    autoSpawnEnabled: CONFIG.autoSpawnEnabled,
    dynamicBodyRadius: CONFIG.dynamicBodyRadius,
    spawnMode: CONFIG.spawnMode,
    spawnPoint: { ...CONFIG.spawnPoint },
    showCameraFeed: CONFIG.showCameraFeed,
    showSurfaces: CONFIG.showSurfaces,
  };
}

/**
 * Merges a data object into CONFIG.
 * @param {Object} data
 */
function mergeIntoConfig(data) {
  if (!data) return;
  if (Array.isArray(data.colorProfiles) && data.colorProfiles.length > 0) {
    // Only merge profiles that use the new targetColor+tolerance format;
    // discard stale HSV-based profiles from older versions.
    const isNewFormat = data.colorProfiles.every(p => typeof p.targetColor === 'string');
    if (isNewFormat) {
      CONFIG.colorProfiles = data.colorProfiles.map(p => ({ ...p }));
    }
  }
  const scalars = [
    'minContourArea', 'stabilizerTolerance', 'stabilizerFreezeFrames',
    'canvasWidth', 'canvasHeight',
    'spawnInterval', 'maxDynamicBodies', 'autoSpawnEnabled', 'dynamicBodyRadius',
    'spawnMode',
    'showCameraFeed', 'showSurfaces'
  ];
  for (const key of scalars) {
    if (data[key] !== undefined) CONFIG[key] = data[key];
  }
  if (Array.isArray(data.cornerPin) && data.cornerPin.length === 4) {
    CONFIG.cornerPin = data.cornerPin.map(p => ({ ...p }));
  }
  if (Array.isArray(data.cameraCornerPin) && data.cameraCornerPin.length === 4) {
    CONFIG.cameraCornerPin = data.cameraCornerPin.map(p => ({ ...p }));
  }
  if (data.spawnPoint && typeof data.spawnPoint.x === 'number') {
    CONFIG.spawnPoint = { ...data.spawnPoint };
  }
}

// ─── localStorage ───

/**
 * Save current CONFIG to localStorage.
 */
export function saveCalibration() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
  } catch (e) {
    console.warn('[storage] Failed to save calibration:', e);
  }
}

/**
 * Load calibration from localStorage and merge into CONFIG.
 * @returns {boolean} true if loaded successfully.
 */
export function loadCalibration() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    mergeIntoConfig(data);
    return true;
  } catch (e) {
    console.warn('[storage] Failed to load calibration:', e);
    return false;
  }
}

/**
 * Clear saved calibration from localStorage.
 */
export function clearCalibration() {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── File export / import ───

/**
 * Export current CONFIG as a downloadable JSON file.
 */
export function exportPreset() {
  const json = JSON.stringify(snapshot(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `genart-preset-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a JSON preset file and merge into CONFIG.
 * @param {File} file
 * @returns {Promise<void>}
 */
export function importPreset(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        mergeIntoConfig(data);
        saveCalibration(); // persist immediately
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

