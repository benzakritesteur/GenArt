/**
 * Shared stabilizer module — smooths object detection across frames.
 *
 * Uses exponential moving average (EMA) smoothing for position, size, and
 * angle. Maintains tracked objects with nearest-neighbour matching.
 *
 * **Factory-based** — call `createStabilizer()` to get an isolated instance
 * with its own tracking state. This allows multiple apps (or pipelines within
 * one app) to maintain independent stabilizer state.
 *
 * **Config-agnostic** — tolerance and freeze-frame values are passed per call
 * to `stabilize()`, not imported from a fixed config module.
 *
 * @module shared/stabilizer
 */

/** Smoothing factor for EMA (0 = full smoothing, 1 = no smoothing). */
const SMOOTH_ALPHA = 0.35;

/**
 * Linear interpolation helper.
 *
 * @param {number} a - Start value.
 * @param {number} b - End value.
 * @param {number} t - Blend factor (0 = a, 1 = b).
 * @returns {number} Interpolated value.
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpolate corners using EMA.
 *
 * @param {Array<{x: number, y: number}>} oldCorners - Previous frame corners.
 * @param {Array<{x: number, y: number}>} newCorners - Current frame corners.
 * @param {number} t - Blend factor.
 * @returns {Array<{x: number, y: number}>} Smoothed corners.
 */
function lerpCorners(oldCorners, newCorners, t) {
  return newCorners.map((c, i) => ({
    x: lerp(oldCorners[i]?.x ?? c.x, c.x, t),
    y: lerp(oldCorners[i]?.y ?? c.y, c.y, t)
  }));
}

/**
 * Creates a new stabilizer instance with its own tracking state.
 *
 * @returns {{
 *   stabilize: (newDetections: Array, tolerance: number, freezeFrames: number) => Array,
 *   reset: () => void
 * }}
 */
export function createStabilizer() {
  /** @type {Map<number, Object>} */
  const trackedObjects = new Map();
  let nextId = 1;

  /**
   * Stabilizes detected objects by matching to tracked objects and applying
   * EMA smoothing. Objects that disappear are kept for `freezeFrames` before
   * removal, providing temporal persistence.
   *
   * @param {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>}>} newDetections
   * @param {number} tolerance - Max distance (px) for matching a detection to a tracked object.
   * @param {number} freezeFrames - Frames to keep a lost object alive before removing it.
   * @returns {Array<{id: number, center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>}>}
   */
  function stabilize(newDetections, tolerance, freezeFrames) {
    // Mark all tracked as not updated this frame
    for (const obj of trackedObjects.values()) {
      obj.updated = false;
    }

    function dist(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Greedy nearest-neighbor matching
    const pairs = [];
    for (const det of newDetections) {
      for (const [id, obj] of trackedObjects.entries()) {
        const d = dist(det.center, obj.center);
        if (d < tolerance) {
          pairs.push({ det, id, d });
        }
      }
    }
    pairs.sort((a, b) => a.d - b.d);

    const matchedDetections = new Set();
    const matchedIds = new Set();

    for (const { det, id } of pairs) {
      if (matchedDetections.has(det) || matchedIds.has(id)) continue;
      matchedDetections.add(det);
      matchedIds.add(id);

      const tracked = trackedObjects.get(id);
      tracked.center = {
        x: lerp(tracked.center.x, det.center.x, SMOOTH_ALPHA),
        y: lerp(tracked.center.y, det.center.y, SMOOTH_ALPHA)
      };
      tracked.size = {
        width: lerp(tracked.size.width, det.size.width, SMOOTH_ALPHA),
        height: lerp(tracked.size.height, det.size.height, SMOOTH_ALPHA)
      };
      tracked.angle = lerp(tracked.angle, det.angle, SMOOTH_ALPHA);
      tracked.corners = lerpCorners(tracked.corners, det.corners, SMOOTH_ALPHA);
      tracked.missedFrames = 0;
      tracked.updated = true;
    }

    // Register unmatched detections as new tracked objects
    for (const det of newDetections) {
      if (matchedDetections.has(det)) continue;
      trackedObjects.set(nextId, {
        id: nextId,
        center: { ...det.center },
        size: { ...det.size },
        angle: det.angle,
        corners: det.corners.map(c => ({ ...c })),
        missedFrames: 0,
        updated: true
      });
      nextId++;
    }

    // Increment missed frames for unmatched, remove after threshold
    for (const [id, obj] of trackedObjects.entries()) {
      if (!obj.updated) {
        obj.missedFrames = (obj.missedFrames || 0) + 1;
        if (obj.missedFrames > freezeFrames) {
          trackedObjects.delete(id);
        }
      }
      delete obj.updated;
    }

    return Array.from(trackedObjects.values()).map(obj => ({
      id: obj.id,
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
   */
  function reset() {
    trackedObjects.clear();
    nextId = 1;
  }

  return { stabilize, reset };
}

