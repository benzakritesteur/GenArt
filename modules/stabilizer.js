/**
 * Stabilizer module for smoothing object detection and preventing jitter.
 * Maintains tracked objects and applies freeze logic based on CONFIG.
 */
import { CONFIG } from '../config.js';

/**
 * Internal state: Map of tracked objects by unique integer ID.
 * @type {Map<number, {id: number, center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>, frozenFrames: number, missedFrames: number}>}
 */
const trackedObjects = new Map();
let nextId = 1;

/**
 * Stabilizes detected objects by matching to tracked objects and applying freeze logic.
 *
 * @param {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>}>} newDetections - Array of detected objects from contourProcessor.
 * @returns {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>}>} Array of stabilized objects.
 * @example
 * const stabilized = stabilizeObjects(detectedObjects);
 */
export function stabilizeObjects(newDetections) {
  // Mark all tracked as not updated this frame
  for (const obj of trackedObjects.values()) {
    obj.updated = false;
  }

  // Helper: Euclidean distance
  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Helper: Angle difference
  function angleDiff(a, b) {
    let d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Match new detections to tracked objects
  for (const det of newDetections) {
    let bestId = null;
    let bestDist = Infinity;
    for (const [id, obj] of trackedObjects.entries()) {
      const d = dist(det.center, obj.center);
      if (d < CONFIG.stabilizerTolerance && d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    if (bestId !== null) {
      const tracked = trackedObjects.get(bestId);
      const angleDelta = angleDiff(det.angle, tracked.angle);
      if (bestDist < CONFIG.stabilizerTolerance && angleDelta < 5) {
        tracked.frozenFrames++;
        tracked.missedFrames = 0;
        tracked.updated = true;
        if (tracked.frozenFrames >= CONFIG.stabilizerFreezeFrames) {
          // Return frozen position (do not update)
          // No update to tracked object except frozenFrames
        } else {
          // Update tracked object with new detection, reset frozenFrames
          tracked.center = { ...det.center };
          tracked.size = { ...det.size };
          tracked.angle = det.angle;
          tracked.corners = det.corners.map(c => ({ ...c }));
          tracked.frozenFrames = 0;
        }
      } else {
        // Outside tolerance or angle changed too much: reset frozenFrames, update
        tracked.center = { ...det.center };
        tracked.size = { ...det.size };
        tracked.angle = det.angle;
        tracked.corners = det.corners.map(c => ({ ...c }));
        tracked.frozenFrames = 0;
        tracked.missedFrames = 0;
        tracked.updated = true;
      }
    } else {
      // No match: register new tracked object
      trackedObjects.set(nextId, {
        id: nextId,
        center: { ...det.center },
        size: { ...det.size },
        angle: det.angle,
        corners: det.corners.map(c => ({ ...c })),
        frozenFrames: 0,
        missedFrames: 0,
        updated: true
      });
      nextId++;
    }
  }

  // Remove objects not updated (missed) for too long
  for (const [id, obj] of trackedObjects.entries()) {
    if (!obj.updated) {
      obj.missedFrames = (obj.missedFrames || 0) + 1;
      if (obj.missedFrames > CONFIG.stabilizerFreezeFrames) {
        trackedObjects.delete(id);
      }
    } else {
      obj.missedFrames = 0;
    }
    delete obj.updated;
  }

  // Return stabilized objects (in order of trackedObjects)
  return Array.from(trackedObjects.values()).map(obj => ({
    center: { ...obj.center },
    size: { ...obj.size },
    angle: obj.angle,
    corners: obj.corners.map(c => ({ ...c }))
  }));
}

/**
 * Resets the stabilizer, clearing all tracked objects.
 *
 * @returns {void}
 * @example
 * resetStabilizer();
 */
export function resetStabilizer() {
  trackedObjects.clear();
  nextId = 1;
}

