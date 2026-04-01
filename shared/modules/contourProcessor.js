/**
 * Shared contour processing utilities.
 *
 * Extracts bounding box, angle, and corner information from OpenCV contours.
 * Uses global `cv` object for minAreaRect only — corner points are computed
 * in pure JavaScript to avoid fragile cv.boxPoints / Float32Array extraction.
 *
 * No application-specific config dependency — fully reusable across apps.
 *
 * @module shared/contourProcessor
 */

/**
 * Computes the 4 corner points of a rotated rectangle using trigonometry.
 * Replaces cv.boxPoints — no OpenCV dependency, no Float32Array extraction.
 *
 * @param {number} cx - Center X.
 * @param {number} cy - Center Y.
 * @param {number} w  - Rectangle width  (as returned by cv.minAreaRect).
 * @param {number} h  - Rectangle height (as returned by cv.minAreaRect).
 * @param {number} angleDeg - Rotation angle in degrees (as returned by cv.minAreaRect).
 * @returns {Array<{x: number, y: number}>} Four corner points in sequential order.
 */
function computeBoxCorners(cx, cy, w, h, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const hw = w / 2;
  const hh = h / 2;

  return [
    { x: cx + (-hw * cosA - (-hh) * sinA), y: cy + (-hw * sinA + (-hh) * cosA) },
    { x: cx + ( hw * cosA - (-hh) * sinA), y: cy + ( hw * sinA + (-hh) * cosA) },
    { x: cx + ( hw * cosA - ( hh) * sinA), y: cy + ( hw * sinA + ( hh) * cosA) },
    { x: cx + (-hw * cosA - ( hh) * sinA), y: cy + (-hw * sinA + ( hh) * cosA) },
  ];
}

/**
 * Processes an array of OpenCV contour Mats and extracts bounding box, center,
 * size, angle, and corners. Uses minAreaRect for accurate rotated rectangle
 * parameters and computes corner positions in JS.
 * Filters by aspect ratio to reject elongated non-rectangular blobs.
 *
 * @param {cv.Mat[]} contours - Array of OpenCV contour Mats.
 * @returns {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>}>}
 */
export function processContours(contours) {
  if (!Array.isArray(contours)) throw new Error('contours must be an array of cv.Mat');
  const results = [];

  for (const contour of contours) {
    try {
      if (!contour || contour.rows < 3) continue;

      const rotatedRect = cv.minAreaRect(contour);
      const { center, size, angle } = rotatedRect;

      if (size.width < 1 || size.height < 1) continue;

      const corners = computeBoxCorners(center.x, center.y, size.width, size.height, angle);

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

      // Aspect ratio filter — reject very elongated shapes
      const aspect = w / h;
      if (aspect > 8.0) continue;

      results.push({
        center: { x: center.x, y: center.y },
        size: { width: w, height: h },
        angle: normalizedAngle,
        corners
      });
    } catch (e) {
      console.warn('[contourProcessor] Skipping contour due to error:', e);
    }
  }
  return results;
}

/**
 * Draws debug overlays for detected objects on a Canvas 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw on.
 * @param {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, corners: Array<{x: number, y: number}>, id?: number, displayColor?: string, profileName?: string}>} detectedObjects
 * @param {number} [bodyCount=0] - Number of active dynamic bodies (for diagnostic display).
 * @param {number} [staticBodyCount=0] - Number of active static physics bodies from detection.
 * @returns {void}
 */
export function drawDebugOverlay(ctx, detectedObjects, bodyCount = 0, staticBodyCount = 0) {
  ctx.save();

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(8, 8, 340, 42);
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = detectedObjects.length > 0 ? '#6f6' : '#f66';
  ctx.fillText(`Surfaces: ${detectedObjects.length}`, 14, 14);
  ctx.fillStyle = staticBodyCount > 0 ? '#6f6' : '#fa0';
  ctx.fillText(`Bodies: ${staticBodyCount}`, 140, 14);
  ctx.fillStyle = bodyCount > 0 ? '#6cf' : '#fa0';
  ctx.fillText(`Balls: ${bodyCount}`, 250, 14);
  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  ctx.fillText(
    detectedObjects.length === 0
      ? 'Pick target color & adjust tolerance'
      : 'Surfaces detected ✓',
    14, 32
  );

  ctx.lineWidth = 2;
  for (const obj of detectedObjects) {
    const color = obj.displayColor || 'lime';

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(obj.center.x, obj.center.y, 4, 0, 2 * Math.PI);
    ctx.fill();

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

