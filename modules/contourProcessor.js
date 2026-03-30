/**
 * Contour processing utilities for extracting bounding box and angle information from OpenCV contours.
 * Uses global `cv` object.
 */

/**
 * Processes an array of OpenCV contour Mats and extracts bounding box, center, size, angle, and corners.
 * Uses minAreaRect for accurate rotated rectangle parameters and boxPoints for corner positions.
 * Filters by aspect ratio to reject elongated non-rectangular blobs.
 *
 * @param {cv.Mat[]} contours - Array of OpenCV contour Mats.
 * @returns {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>}>} Array of detected object info.
 */
export function processContours(contours) {
  if (!Array.isArray(contours)) throw new Error('contours must be an array of cv.Mat');
  const results = [];
  for (const contour of contours) {
    try {
      // Skip contours with too few points
      if (!contour || contour.rows < 3) continue;

      const rotatedRect = cv.minAreaRect(contour);
      const { center, size, angle } = rotatedRect;

      // Skip degenerate rectangles (zero area)
      if (size.width < 1 || size.height < 1) continue;

      // Normalize: ensure width >= height and adjust angle
      let w = size.width;
      let h = size.height;
      let normalizedAngle = angle;
      if (w < h) {
        const tmp = w;
        w = h;
        h = tmp;
        normalizedAngle = angle - 90;
      }

      // Aspect ratio filter — reject very elongated shapes (not post-its)
      const aspect = w / h;
      if (aspect > 8.0) continue;

      // Get corners from the rotated rectangle (4 precise corner points)
      const box = cv.boxPoints(rotatedRect);
      const floatData = box.data32F || box.data64F;

      // Guard: ensure box has valid float data (4 corners × 2 coords = 8 values)
      if (!floatData || floatData.length < 8) {
        if (box && typeof box.delete === 'function') box.delete();
        continue;
      }

      const corners = [];
      for (let i = 0; i < 4; ++i) {
        corners.push({
          x: floatData[i * 2],
          y: floatData[i * 2 + 1]
        });
      }
      if (box && typeof box.delete === 'function') box.delete();

      results.push({
        center: { x: center.x, y: center.y },
        size: { width: w, height: h },
        angle: normalizedAngle,
        corners
      });
    } catch (e) {
      // Isolate per-contour errors — one bad contour must not crash the whole batch
      console.warn('[contourProcessor] Skipping contour due to error:', e);
    }
  }
  return results;
}

/**
 * Draws debug overlays for detected objects on a Canvas 2D context.
 * Shows rotated bounding boxes with semi-transparent fills, center dots,
 * info labels, and a diagnostic HUD with object count and body count.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw on.
 * @param {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>, id?: number, displayColor?: string, profileName?: string}>} detectedObjects
 * @param {number} [bodyCount=0] - Number of active physics bodies (for diagnostic display).
 * @returns {void}
 */
export function drawDebugOverlay(ctx, detectedObjects, bodyCount = 0) {
  ctx.save();

  // Diagnostic HUD
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(8, 8, 280, 42);
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = detectedObjects.length > 0 ? '#6f6' : '#f66';
  ctx.fillText(`Surfaces: ${detectedObjects.length}`, 14, 14);
  ctx.fillStyle = bodyCount > 0 ? '#6cf' : '#fa0';
  ctx.fillText(`Balls: ${bodyCount}`, 150, 14);
  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  ctx.fillText(detectedObjects.length === 0 ? 'Pick target color & adjust tolerance' : 'Surfaces detected ✓ — balls bounce on them', 14, 32);

  ctx.lineWidth = 2;
  for (const obj of detectedObjects) {
    const color = obj.displayColor || 'lime';

    // Draw filled semi-transparent shape
    ctx.fillStyle = color + '33';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(obj.corners[0].x, obj.corners[0].y);
    for (let i = 1; i < 4; ++i) {
      ctx.lineTo(obj.corners[i].x, obj.corners[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw center dot
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(obj.center.x, obj.center.y, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Draw info text (ID, angle, size, profile name)
    ctx.fillStyle = 'white';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const sizeStr = `${Math.round(obj.size.width)}×${Math.round(obj.size.height)}`;
    const label = (obj.id != null ? `#${obj.id} ` : '') +
                  obj.angle.toFixed(1) + '° ' + sizeStr +
                  (obj.profileName ? ` [${obj.profileName}]` : '');
    ctx.fillText(label, obj.center.x, obj.center.y + 8);
  }
  ctx.restore();
}

