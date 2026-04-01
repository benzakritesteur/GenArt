/**
 * Persistence helpers for saving/loading Fractals calibration and config presets.
 * Uses localStorage and File API.
 *
 * @module Fractals/storage
 */
import { CONFIG } from '../config.js';

const STORAGE_KEY = 'fractals-calibration';

/**
 * Creates a serialisable snapshot of current CONFIG values.
 *
 * @returns {Object} Plain object safe for JSON serialisation.
 */
function snapshot() {
  return {
    colorProfiles: CONFIG.colorProfiles.map(p => ({ ...p })),
    minContourArea: CONFIG.minContourArea,
    stabilizerTolerance: CONFIG.stabilizerTolerance,
    stabilizerFreezeFrames: CONFIG.stabilizerFreezeFrames,
    detectionScale: CONFIG.detectionScale,
    detectionInterval: CONFIG.detectionInterval,
    morphDilateSize: CONFIG.morphDilateSize,
    canvasWidth: CONFIG.canvasWidth,
    canvasHeight: CONFIG.canvasHeight,
    cornerPin: CONFIG.cornerPin.map(p => ({ ...p })),
    cameraCornerPin: CONFIG.cameraCornerPin.map(p => ({ ...p })),
    fractalMaxIterations: CONFIG.fractalMaxIterations,
    fractalZoom: CONFIG.fractalZoom,
    fractalAnimationSpeed: CONFIG.fractalAnimationSpeed,
    fractalDefaultC: { ...CONFIG.fractalDefaultC },
    fractalBlendAlpha: CONFIG.fractalBlendAlpha,
    showCameraFeed: CONFIG.showCameraFeed,
    showSurfaces: CONFIG.showSurfaces,
    showDebugOverlay: CONFIG.showDebugOverlay,
  };
}

/**
 * Merges a data object into CONFIG.
 *
 * @param {Object} data - Data to merge (from JSON parse or localStorage).
 * @returns {void}
 */
function mergeIntoConfig(data) {
  if (!data) return;

  if (Array.isArray(data.colorProfiles) && data.colorProfiles.length > 0) {
    const isNewFormat = data.colorProfiles.every(p => typeof p.targetColor === 'string');
    if (isNewFormat) {
      CONFIG.colorProfiles = data.colorProfiles.map(p => ({ ...p }));
    }
  }

  const scalars = [
    'minContourArea', 'stabilizerTolerance', 'stabilizerFreezeFrames',
    'detectionScale', 'detectionInterval', 'morphDilateSize',
    'canvasWidth', 'canvasHeight',
    'fractalMaxIterations', 'fractalZoom', 'fractalAnimationSpeed',
    'fractalBlendAlpha',
    'showCameraFeed', 'showSurfaces', 'showDebugOverlay',
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
  if (data.fractalDefaultC && typeof data.fractalDefaultC.real === 'number') {
    CONFIG.fractalDefaultC = { ...data.fractalDefaultC };
  }
}

// ─── localStorage ───

/**
 * Save current CONFIG to localStorage.
 *
 * @returns {void}
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
 *
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
 *
 * @returns {void}
 */
export function clearCalibration() {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── File export / import ───

/**
 * Export current CONFIG as a downloadable JSON file.
 *
 * @returns {void}
 */
export function exportPreset() {
  const json = JSON.stringify(snapshot(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fractals-preset-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a JSON preset file and merge into CONFIG.
 *
 * @param {File} file - JSON file to import.
 * @returns {Promise<void>}
 */
export function importPreset(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        mergeIntoConfig(data);
        saveCalibration();
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

