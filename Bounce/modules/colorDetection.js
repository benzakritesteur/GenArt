/**
 * Color detection and contour finding utilities using OpenCV.js.
 *
 * Detection pipeline (per profile):
 *   1. Optionally downscale source for performance (CONFIG.detectionScale)
 *   2. Gaussian blur on the RGB image (noise reduction)
 *   3. Convert to HSV (OpenCV WASM — robust under varying lighting)
 *   4. cv.inRange in HSV space for binary mask (WASM — replaces JS pixel loop)
 *      Handles hue wrapping for red-ish colors via two-range bitwise_or.
 *   5. Morphology: open + close + optional dilation to merge nearby blobs
 *   6. Contour finding + area filtering + vertex simplification (approxPolyDP)
 *
 * Falls back to direct RGBA per-channel comparison if cv.cvtColor is unavailable.
 */
import { CONFIG } from '../config.js';

/** Flag set once after first successful cv.cvtColor call. */
let hsvSupported = null;

// ── Cached OpenCV objects (allocated once, reused every frame) ──
let _blurSize = null;
let _kernelSmall = null;
let _kernelLarge = null;
let _kernelDilate = null;
let _lastDilateSize = 0;

/**
 * Return (and lazily create) cached structuring elements & sizes.
 * Avoids repeated WASM heap allocation every frame.
 *
 * @returns {{ blurSize: Object, kernelSmall: Object, kernelLarge: Object, kernelDilate: Object|null }}
 */
function getCachedKernels() {
  if (!_blurSize) _blurSize = new cv.Size(5, 5);
  if (!_kernelSmall) _kernelSmall = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  if (!_kernelLarge) _kernelLarge = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));

  const dilateSize = CONFIG.morphDilateSize || 0;
  if (dilateSize >= 3 && dilateSize !== _lastDilateSize) {
    if (_kernelDilate) _kernelDilate.delete();
    _kernelDilate = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(dilateSize, dilateSize));
    _lastDilateSize = dilateSize;
  } else if (dilateSize < 3 && _kernelDilate) {
    _kernelDilate.delete();
    _kernelDilate = null;
    _lastDilateSize = 0;
  }

  return { blurSize: _blurSize, kernelSmall: _kernelSmall, kernelLarge: _kernelLarge, kernelDilate: _kernelDilate };
}

/**
 * Converts a hex color string to RGB values.
 *
 * @param {string} hex - Hex color string (e.g. '#ff0' or '#ffcc00').
 * @returns {{r: number, g: number, b: number}} RGB values (0-255).
 */
export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/**
 * Converts RGB (0-255 per channel) to OpenCV-scale HSV.
 *
 * @param {number} r - Red   (0-255).
 * @param {number} g - Green (0-255).
 * @param {number} b - Blue  (0-255).
 * @returns {{h: number, s: number, v: number}} HSV with H [0-179], S [0-255], V [0-255].
 */
export function rgbToHsv(r, g, b) {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let hDeg = 0;
  if (delta > 0) {
    if (max === rf) {
      hDeg = 60 * (((gf - bf) / delta) % 6);
    } else if (max === gf) {
      hDeg = 60 * ((bf - rf) / delta + 2);
    } else {
      hDeg = 60 * ((rf - gf) / delta + 4);
    }
    if (hDeg < 0) hDeg += 360;
  }

  const s = max === 0 ? 0 : delta / max;

  return {
    h: Math.round(hDeg / 2),     // OpenCV Hue: [0-179]
    s: Math.round(s * 255),      // [0-255]
    v: Math.round(max * 255),    // [0-255]
  };
}

/**
 * Builds a binary mask using cv.inRange in HSV space (runs in WASM).
 * Handles hue wrapping for red-ish colors via two separate inRange calls
 * combined with cv.bitwise_or.
 *
 * @param {Object} hsv  - HSV cv.Mat (3-channel, CV_8UC3).
 * @param {number} th   - Target hue (0-179).
 * @param {number} ts   - Target saturation (0-255).
 * @param {number} tv   - Target value (0-255).
 * @param {number} hTol - Hue tolerance.
 * @param {number} sTol - Saturation tolerance.
 * @param {number} vTol - Value tolerance.
 * @returns {Object} Single-channel binary mask (cv.Mat CV_8UC1). Caller must delete.
 */
function buildMaskInRange(hsv, th, ts, tv, hTol, sTol, vTol) {
  const sLow  = Math.max(0,   ts - sTol);
  const sHigh = Math.min(255, ts + sTol);
  const vLow  = Math.max(0,   tv - vTol);
  const vHigh = Math.min(255, tv + vTol);

  const hLow  = th - hTol;
  const hHigh = th + hTol;

  const hueWraps = hLow < 0 || hHigh > 179;

  if (!hueWraps) {
    // Simple case — single inRange call
    const lo = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [hLow, sLow, vLow, 0]);
    const hi = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [hHigh, sHigh, vHigh, 255]);
    const mask = new cv.Mat();
    cv.inRange(hsv, lo, hi, mask);
    lo.delete();
    hi.delete();
    return mask;
  }

  // Hue wraps around 0/179 — need two ranges OR-ed together
  const hLowWrapped  = hLow < 0 ? hLow + 180 : hLow;
  const hHighWrapped = hHigh > 179 ? hHigh - 180 : hHigh;

  const lo1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [hLowWrapped, sLow, vLow, 0]);
  const hi1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [179, sHigh, vHigh, 255]);
  const mask1 = new cv.Mat();
  cv.inRange(hsv, lo1, hi1, mask1);

  const lo2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, sLow, vLow, 0]);
  const hi2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [hHighWrapped, sHigh, vHigh, 255]);
  const mask2 = new cv.Mat();
  cv.inRange(hsv, lo2, hi2, mask2);

  const combined = new cv.Mat();
  cv.bitwise_or(mask1, mask2, combined);

  lo1.delete(); hi1.delete(); mask1.delete();
  lo2.delete(); hi2.delete(); mask2.delete();
  return combined;
}

/**
 * Builds a binary mask by comparing each pixel's RGBA channels against a
 * target RGB color within a per-channel tolerance. Used as a fallback when
 * HSV conversion is unavailable.
 *
 * @param {Uint8Array} rgba   - Source pixel data (RGBA interleaved).
 * @param {number}     width  - Image width in pixels.
 * @param {number}     height - Image height in pixels.
 * @param {number}     tr     - Target red   (0-255).
 * @param {number}     tg     - Target green (0-255).
 * @param {number}     tb     - Target blue  (0-255).
 * @param {number}     tol    - Per-channel tolerance (0-255).
 * @returns {Uint8Array} Single-channel mask (0 or 255 per pixel).
 */
function buildMaskFromRgba(rgba, width, height, tr, tg, tb, tol) {
  const total = width * height;
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const off = i << 2;
    const dr = rgba[off]     - tr;
    const dg = rgba[off + 1] - tg;
    const db = rgba[off + 2] - tb;
    if (dr >= -tol && dr <= tol &&
        dg >= -tol && dg <= tol &&
        db >= -tol && db <= tol) {
      mask[i] = 255;
    }
  }
  return mask;
}

/**
 * Optimized multi-profile detection using HSV color space with cv.inRange.
 *
 * Converts the RGBA source to HSV once (OpenCV WASM), then uses cv.inRange
 * per profile (runs entirely in WASM — 5-10x faster than a JS pixel loop).
 * Morphology cleanup and optional dilation are applied via OpenCV.
 * Falls back to RGBA comparison if cv.cvtColor is not available.
 *
 * @param {Object} src      - Source RGBA cv.Mat (from cv.imread).
 * @param {Array<{targetColor: string, tolerance: number}>} profiles - Color profiles.
 * @returns {Array<{profileIndex: number, mask: Object}>} Array of {profileIndex, mask (cv.Mat)}.
 */
export function detectColorMasks(src, profiles) {
  const mats = [];   // Track all intermediate Mats for guaranteed cleanup
  const results = [];
  const { blurSize, kernelSmall, kernelLarge, kernelDilate } = getCachedKernels();

  try {
    let hsvMat = null;
    let fallbackData = null, fallbackW = 0, fallbackH = 0;
    let useHsv;

    // ── Downscale for performance ──
    const scale = Math.max(0.25, Math.min(1.0, CONFIG.detectionScale || 1.0));
    let working = src;
    if (scale < 1.0) {
      const dw = Math.round(src.cols * scale);
      const dh = Math.round(src.rows * scale);
      const small = new cv.Mat();
      mats.push(small);
      cv.resize(src, small, new cv.Size(dw, dh), 0, 0, cv.INTER_LINEAR);
      working = small;
    }

    // ── Try HSV pipeline (much more robust under varying lighting) ──
    if (hsvSupported !== false) {
      try {
        const rgb = new cv.Mat();
        mats.push(rgb);
        cv.cvtColor(working, rgb, cv.COLOR_RGBA2RGB);

        const blurredRgb = new cv.Mat();
        mats.push(blurredRgb);
        cv.GaussianBlur(rgb, blurredRgb, blurSize, 0);

        hsvMat = new cv.Mat();
        mats.push(hsvMat);
        cv.cvtColor(blurredRgb, hsvMat, cv.COLOR_RGB2HSV);

        useHsv = true;

        if (hsvSupported === null) {
          hsvSupported = true;
          console.log('[colorDetection] HSV + cv.inRange pipeline active — optimized detection enabled');
        }
      } catch (convErr) {
        hsvSupported = false;
        console.warn('[colorDetection] cv.cvtColor unavailable, using RGBA fallback:', convErr);
        useHsv = false;
      }
    } else {
      useHsv = false;
    }

    // ── Fallback: blur RGBA directly ──
    if (!useHsv) {
      const blurredRgba = new cv.Mat();
      mats.push(blurredRgba);
      cv.GaussianBlur(working, blurredRgba, blurSize, 0);
      fallbackData = blurredRgba.data;
      fallbackW    = blurredRgba.cols;
      fallbackH    = blurredRgba.rows;
    }

    // ── Per-profile mask generation ──
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const { r, g, b } = hexToRgb(p.targetColor);
      const tol = p.tolerance;

      let rawMask;

      if (useHsv) {
        const target = rgbToHsv(r, g, b);
        // Map user tolerance (0-255 RGB space) to HSV tolerances.
        const hTol = Math.max(10, Math.round(tol * 0.35));
        const sTol = Math.max(40, Math.round(tol * 1.2));
        const vTol = Math.max(50, Math.round(tol * 1.5));
        rawMask = buildMaskInRange(hsvMat, target.h, target.s, target.v, hTol, sTol, vTol);
      } else {
        const maskBytes = buildMaskFromRgba(fallbackData, fallbackW, fallbackH, r, g, b, tol);
        rawMask = new cv.Mat(fallbackH, fallbackW, cv.CV_8UC1);
        rawMask.data.set(maskBytes);
      }

      // Morphology: open removes salt noise, close fills pepper gaps
      const opened = new cv.Mat();
      cv.morphologyEx(rawMask, opened, cv.MORPH_OPEN, kernelSmall);
      rawMask.delete();

      const closed = new cv.Mat();
      cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, kernelLarge);
      opened.delete();

      // Optional extra dilation to merge nearby blobs from the same surface
      let finalMask = closed;
      if (kernelDilate) {
        const dilated = new cv.Mat();
        cv.dilate(closed, dilated, kernelDilate);
        closed.delete();
        finalMask = dilated;
      }

      // If downscaled, resize mask back to full canvas dimensions for contour coordinates
      if (scale < 1.0) {
        const fullMask = new cv.Mat();
        cv.resize(finalMask, fullMask, new cv.Size(CONFIG.canvasWidth, CONFIG.canvasHeight), 0, 0, cv.INTER_NEAREST);
        finalMask.delete();
        results.push({ profileIndex: i, mask: fullMask });
      } else {
        results.push({ profileIndex: i, mask: finalMask });
      }
    }

    return results;
  } finally {
    for (const m of mats) {
      try { m.delete(); } catch (_) { /* ignore cleanup errors */ }
    }
    // NOTE: cached kernels are NOT deleted — reused across frames for page lifetime.
  }
}


/**
 * Finds external contours in a binary mask and filters by minimum area.
 * Uses cv.approxPolyDP to simplify contour vertices, reducing downstream
 * minAreaRect cost and producing cleaner rectangle fits.
 *
 * @param {Object} mask - Binary mask cv.Mat (single channel, 0/255).
 * @returns {Object} cv.MatVector of contours passing area threshold.
 */
export function findContours(mask) {
  let contours = null, hierarchy = null, filtered = null;
  try {
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    filtered = new cv.MatVector();

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area >= CONFIG.minContourArea) {
        // Simplify contour to reduce vertex count (~2% of perimeter)
        const perimeter = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * perimeter, true);

        filtered.push_back(approx);
        approx.delete();
      }
      cnt.delete();
    }
    return filtered;
  } finally {
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}
