/**
 * Shared perspective transform and interactive corner pin utilities.
 *
 * Uses OpenCV.js for the perspective matrix and Canvas 2D API for the
 * interactive drag-handle UI.
 *
 * **Config-agnostic** — no fixed config import. Default corner points
 * are derived from the overlay canvas dimensions.
 *
 * @module shared/cornerPin
 */

/**
 * Builds a perspective transform (homography) matrix from 4 source and 4 destination points.
 *
 * @param {Array<{x: number, y: number}>} srcPoints - Array of 4 source points.
 * @param {Array<{x: number, y: number}>} dstPoints - Array of 4 destination points.
 * @returns {cv.Mat} 3×3 perspective transform matrix (cv.CV_64F). Caller must delete.
 * @throws {Error} If srcPoints or dstPoints do not have exactly 4 elements.
 */
export function buildPerspectiveTransform(srcPoints, dstPoints) {
  if (srcPoints.length !== 4 || dstPoints.length !== 4) {
    throw new Error('srcPoints and dstPoints must be arrays of 4 points');
  }
  let srcMat, dstMat, transformMat;
  try {
    srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, srcPoints.flatMap(p => [p.x, p.y]));
    dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstPoints.flatMap(p => [p.x, p.y]));
    transformMat = cv.getPerspectiveTransform(srcMat, dstMat);
    return transformMat;
  } finally {
    if (srcMat) srcMat.delete();
    if (dstMat) dstMat.delete();
  }
}

/**
 * Warps an array of points using a 3×3 perspective transform matrix.
 *
 * @param {Array<{x: number, y: number}>} points - Array of points to warp.
 * @param {cv.Mat} transformMat - 3×3 perspective transform matrix.
 * @returns {Array<{x: number, y: number}>} Warped points.
 * @throws {Error} If transformMat is not a 3×3 cv.Mat.
 */
export function warpPoints(points, transformMat) {
  if (!transformMat || transformMat.rows !== 3 || transformMat.cols !== 3) {
    throw new Error('transformMat must be a 3x3 cv.Mat');
  }
  const M = [];
  for (let r = 0; r < 3; ++r) {
    M[r] = [];
    for (let c = 0; c < 3; ++c) {
      M[r][c] = transformMat.doubleAt ? transformMat.doubleAt(r, c) : transformMat.data64F[r * 3 + c];
    }
  }
  return points.map(({ x, y }) => {
    const w = M[2][0] * x + M[2][1] * y + M[2][2];
    const xp = (M[0][0] * x + M[0][1] * y + M[0][2]) / w;
    const yp = (M[1][0] * x + M[1][1] * y + M[1][2]) / w;
    return { x: xp, y: yp };
  });
}

/**
 * Initializes an interactive corner pin UI on the given overlay canvas.
 *
 * @param {HTMLCanvasElement} overlayCanvas - Canvas for drawing and interaction.
 * @param {(points: Array<{x: number, y: number}>) => void} onUpdate - Callback with new corner points after drag.
 * @param {{initialPoints?: Array<{x: number, y: number}>, handleColor?: string, lineColor?: string, label?: string}} [opts] - Options.
 * @returns {function(): void} draw — Call each frame to redraw handles. Has a `.destroy()` method to remove listeners.
 */
export function initCornerPinUI(overlayCanvas, onUpdate, opts = {}) {
  const ctx = overlayCanvas.getContext('2d');
  const handleColor = opts.handleColor || 'yellow';
  const lineColor = opts.lineColor || '#ff0';
  const label = opts.label || '';

  // Default to full-canvas rectangle if no initial points provided
  const defaultPoints = [
    { x: 0, y: 0 },
    { x: overlayCanvas.width, y: 0 },
    { x: overlayCanvas.width, y: overlayCanvas.height },
    { x: 0, y: overlayCanvas.height }
  ];
  let points = (opts.initialPoints || defaultPoints).map(p => ({ ...p }));

  let draggingIdx = null;
  let dragOffset = { x: 0, y: 0 };
  const HANDLE_RADIUS = 10;
  const HIT_RADIUS = 20;
  const EDGE_INSET = HANDLE_RADIUS + 2;

  function clampX(v) { return Math.max(EDGE_INSET, Math.min(overlayCanvas.width - EDGE_INSET, v)); }
  function clampY(v) { return Math.max(EDGE_INSET, Math.min(overlayCanvas.height - EDGE_INSET, v)); }

  function draw() {
    ctx.save();

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(clampX(points[0].x), clampY(points[0].y));
    for (let i = 1; i < 4; ++i) ctx.lineTo(clampX(points[i].x), clampY(points[i].y));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 4; ++i) {
      const hx = clampX(points[i].x);
      const hy = clampY(points[i].y);
      ctx.beginPath();
      ctx.arc(hx, hy, HANDLE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = handleColor;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#222';
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), hx, hy);
    }

    if (label) {
      const lx = clampX(points[0].x) + HANDLE_RADIUS + 6;
      const ly = clampY(points[0].y) + 1;
      ctx.fillStyle = handleColor;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly);
    }

    ctx.restore();
  }

  function getHandleAt(x, y) {
    for (let i = 0; i < 4; ++i) {
      const hx = clampX(points[i].x);
      const hy = clampY(points[i].y);
      const dx = x - hx;
      const dy = y - hy;
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) return i;
    }
    return null;
  }

  function canvasCoords(clientX, clientY) {
    const rect = overlayCanvas.getBoundingClientRect();
    const scaleX = overlayCanvas.width / rect.width;
    const scaleY = overlayCanvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function onMouseDown(e) {
    const { x, y } = canvasCoords(e.clientX, e.clientY);
    const idx = getHandleAt(x, y);
    if (idx !== null) {
      draggingIdx = idx;
      dragOffset.x = points[idx].x - x;
      dragOffset.y = points[idx].y - y;
      overlayCanvas.style.cursor = 'grabbing';
    }
  }

  function onMouseMove(e) {
    const { x, y } = canvasCoords(e.clientX, e.clientY);
    if (draggingIdx !== null) {
      points[draggingIdx].x = Math.max(0, Math.min(overlayCanvas.width, x + dragOffset.x));
      points[draggingIdx].y = Math.max(0, Math.min(overlayCanvas.height, y + dragOffset.y));
      draw();
      if (onUpdate) onUpdate(points.map(p => ({ ...p })));
    } else {
      overlayCanvas.style.cursor = getHandleAt(x, y) !== null ? 'grab' : 'default';
    }
  }

  function onMouseUp() {
    draggingIdx = null;
    overlayCanvas.style.cursor = 'default';
  }

  overlayCanvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // ── Touch support ──
  function getTouchCanvasCoords(e) {
    const t = e.touches[0] || e.changedTouches[0];
    return canvasCoords(t.clientX, t.clientY);
  }
  function onTouchStart(e) {
    const { x, y } = getTouchCanvasCoords(e);
    const idx = getHandleAt(x, y);
    if (idx !== null) {
      e.preventDefault();
      draggingIdx = idx;
      dragOffset.x = points[idx].x - x;
      dragOffset.y = points[idx].y - y;
    }
  }
  function onTouchMove(e) {
    if (draggingIdx !== null) {
      e.preventDefault();
      const { x, y } = getTouchCanvasCoords(e);
      points[draggingIdx].x = Math.max(0, Math.min(overlayCanvas.width, x + dragOffset.x));
      points[draggingIdx].y = Math.max(0, Math.min(overlayCanvas.height, y + dragOffset.y));
      draw();
      if (onUpdate) onUpdate(points.map(p => ({ ...p })));
    }
  }
  function onTouchEnd() {
    draggingIdx = null;
  }

  overlayCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
  overlayCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
  overlayCanvas.addEventListener('touchend', onTouchEnd);

  draw();

  /**
   * Remove all event listeners registered by this corner pin instance.
   * Call before re-initializing to prevent accumulated handlers.
   */
  draw.destroy = function () {
    overlayCanvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    overlayCanvas.removeEventListener('touchstart', onTouchStart);
    overlayCanvas.removeEventListener('touchmove', onTouchMove);
    overlayCanvas.removeEventListener('touchend', onTouchEnd);
  };

  return draw;
}

