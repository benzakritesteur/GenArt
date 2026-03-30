/**
 * Contour processing utilities for extracting bounding box and angle information from OpenCV contours.
 * Uses global `cv` object.
 */

/**
 * Processes an array of OpenCV contour Mats and extracts bounding box, center, size, angle, and corners.
 *
 * @param {cv.Mat[]} contours - Array of OpenCV contour Mats.
 * @returns {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>}>} Array of detected object info.
 * @example
 * const objects = processContours([contour1, contour2]);
 */
export function processContours(contours) {
  if (!Array.isArray(contours)) throw new Error('contours must be an array of cv.Mat');
  const results = [];
  for (const contour of contours) {
    try {
      const rotatedRect = cv.minAreaRect(contour);
      const { center, size, angle } = rotatedRect;
      const box = cv.boxPoints(rotatedRect);
      // Guard: skip if boxPoints returned an invalid/empty Mat
      if (!box || !box.data32F || box.data32F.length < 8) {
        if (box) box.delete();
        continue;
      }
      const corners = [];
      for (let i = 0; i < 4; ++i) {
        corners.push({
          x: box.data32F[i * 2],
          y: box.data32F[i * 2 + 1]
        });
      }
      box.delete();
      results.push({
        center: { x: center.x, y: center.y },
        size: { width: size.width, height: size.height },
        angle,
        corners
      });
    } catch (e) {
      // Skip contours that cause OpenCV errors (degenerate shapes, etc.)
      continue;
    }
  }
  return results;
}

/**
 * Draws debug overlays for detected objects on a Canvas 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw on.
 * @param {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>, id?: number, displayColor?: string, profileName?: string}>} detectedObjects
 * @returns {void}
 */
export function drawDebugOverlay(ctx, detectedObjects) {
  ctx.save();
  ctx.lineWidth = 2;
  for (const obj of detectedObjects) {
    const color = obj.displayColor || 'lime';
    // Draw rotated bounding box
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(obj.corners[0].x, obj.corners[0].y);
    for (let i = 1; i < 4; ++i) {
      ctx.lineTo(obj.corners[i].x, obj.corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    // Draw center dot
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(obj.center.x, obj.center.y, 4, 0, 2 * Math.PI);
    ctx.fill();
    // Draw info text (ID, angle, profile name)
    ctx.fillStyle = 'white';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const label = (obj.id != null ? `#${obj.id} ` : '') +
                  obj.angle.toFixed(1) + '°' +
                  (obj.profileName ? ` [${obj.profileName}]` : '');
    ctx.fillText(label, obj.center.x, obj.center.y + 8);
  }
  ctx.restore();
}

