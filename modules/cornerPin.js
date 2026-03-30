/**
 * Perspective transform and interactive corner pin utilities using OpenCV.js and Canvas 2D API.
 */
import { CONFIG } from '../config.js';

/**
 * Builds a perspective transform (homography) matrix from 4 source and 4 destination points.
 *
 * @param {Array<{x: number, y: number}>} srcPoints - Array of 4 source points.
 * @param {Array<{x: number, y: number}>} dstPoints - Array of 4 destination points.
 * @returns {cv.Mat} 3x3 perspective transform matrix (cv.CV_64F).
 * @example
 * const mat = buildPerspectiveTransform(src, dst);
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
    // transformMat is returned
  }
}

/**
 * Warps an array of points using a 3x3 perspective transform matrix.
 *
 * @param {Array<{x: number, y: number}>} points - Array of points to warp.
 * @param {cv.Mat} transformMat - 3x3 perspective transform matrix.
 * @returns {Array<{x: number, y: number}>} Warped points.
 * @example
 * const warped = warpPoints(points, mat);
 */
export function warpPoints(points, transformMat) {
  if (!transformMat || transformMat.rows !== 3 || transformMat.cols !== 3) {
    throw new Error('transformMat must be a 3x3 cv.Mat');
  }
  // Extract matrix values
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
 * @param {(points: Array<{x: number, y: number}>) => void} onUpdate - Callback called with new corner points after drag.
 * @returns {void}
 * @example
 * initCornerPinUI(canvas, (pts) => { ... });
 */
export function initCornerPinUI(overlayCanvas, onUpdate) {
  const ctx = overlayCanvas.getContext('2d');
  let points = CONFIG.cornerPin.map(p => ({ ...p }));
  let draggingIdx = null;
  let dragOffset = { x: 0, y: 0 };
  const HANDLE_RADIUS = 8;
  const HIT_RADIUS = 15;

  function draw() {
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    // Draw quad lines
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < 4; ++i) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.stroke();
    // Draw handles
    for (let i = 0; i < 4; ++i) {
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, HANDLE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = 'yellow';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#333';
      ctx.stroke();
    }
    ctx.restore();
  }

  function getHandleAt(x, y) {
    for (let i = 0; i < 4; ++i) {
      const dx = x - points[i].x;
      const dy = y - points[i].y;
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) return i;
    }
    return null;
  }

  function onMouseDown(e) {
    const rect = overlayCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = getHandleAt(x, y);
    if (idx !== null) {
      draggingIdx = idx;
      dragOffset.x = points[idx].x - x;
      dragOffset.y = points[idx].y - y;
      overlayCanvas.style.cursor = 'grabbing';
    }
  }

  function onMouseMove(e) {
    const rect = overlayCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (draggingIdx !== null) {
      points[draggingIdx].x = Math.max(0, Math.min(overlayCanvas.width, x + dragOffset.x));
      points[draggingIdx].y = Math.max(0, Math.min(overlayCanvas.height, y + dragOffset.y));
      draw();
      if (onUpdate) onUpdate(points.map(p => ({ ...p })));
    } else {
      // Change cursor if hovering over a handle
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
  function getTouchPos(e) {
    const t = e.touches[0] || e.changedTouches[0];
    const rect = overlayCanvas.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  overlayCanvas.addEventListener('touchstart', e => {
    const { x, y } = getTouchPos(e);
    const idx = getHandleAt(x, y);
    if (idx !== null) {
      e.preventDefault();
      draggingIdx = idx;
      dragOffset.x = points[idx].x - x;
      dragOffset.y = points[idx].y - y;
    }
  }, { passive: false });
  overlayCanvas.addEventListener('touchmove', e => {
    if (draggingIdx !== null) {
      e.preventDefault();
      const { x, y } = getTouchPos(e);
      points[draggingIdx].x = Math.max(0, Math.min(overlayCanvas.width, x + dragOffset.x));
      points[draggingIdx].y = Math.max(0, Math.min(overlayCanvas.height, y + dragOffset.y));
      draw();
      if (onUpdate) onUpdate(points.map(p => ({ ...p })));
    }
  }, { passive: false });
  overlayCanvas.addEventListener('touchend', () => {
    draggingIdx = null;
  });

  draw();
}

