/**
 * Color detection and contour finding utilities using OpenCV.js.
 *
 * Detection pipeline (per profile):
 *   1. Convert RGBA source to HSV color space (OpenCV — robust under varying lighting)
 *   2. Gaussian blur on the RGB image before conversion (noise reduction)
 *   3. HSV pixel comparison in JavaScript for binary mask (handles hue wrapping)
 *   4. Morphology (open + close) to clean up the binary mask
 *   5. Contour finding + area filtering
 *
 * HSV detection is significantly more robust than RGB per-channel comparison
 * because the Hue channel is largely invariant to lighting/brightness changes.
 * Falls back to direct RGBA comparison if cv.cvtColor is unavailable.
 */
import { CONFIG } from '../config.js';

/** Flag set once after first successful cv.cvtColor call. */
let hsvSupported = null;

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
 * Builds a binary mask by comparing each pixel's HSV channels against a
 * target HSV color within per-channel tolerances. Handles hue wrapping
 * for red-ish colors (hue near 0 / 179).
 *
 * @param {Uint8Array} hsvData   - HSV interleaved pixel data (H,S,V,H,S,V,…).
 * @param {number}     width     - Image width in pixels.
 * @param {number}     height    - Image height in pixels.
 * @param {number}     th        - Target hue   (0-179).
 * @param {number}     ts        - Target saturation (0-255).
 * @param {number}     tv        - Target value (0-255).
 * @param {number}     hTol      - Hue tolerance.
 * @param {number}     sTol      - Saturation tolerance.
 * @param {number}     vTol      - Value tolerance.
 * @returns {Uint8Array} Single-channel mask (0 or 255 per pixel).
 */
function buildMaskFromHsv(hsvData, width, height, th, ts, tv, hTol, sTol, vTol) {
  const total = width * height;
  const mask = new Uint8Array(total);

  const sLow  = Math.max(0,   ts - sTol);
  const sHigh = Math.min(255, ts + sTol);
  const vLow  = Math.max(0,   tv - vTol);
  const vHigh = Math.min(255, tv + vTol);

  const hLow  = th - hTol;
  const hHigh = th + hTol;
  const hueWrapsLow  = hLow < 0;
  const hueWrapsHigh = hHigh > 179;

  // Pre-compute wrapped bounds once
  const hWrapLow  = hueWrapsLow  ? hLow + 180 : 0;
  const hWrapHigh = hueWrapsHigh ? hHigh - 180 : 0;

  for (let i = 0; i < total; i++) {
    const off = i * 3;
    const pH = hsvData[off];
    const pS = hsvData[off + 1];
    const pV = hsvData[off + 2];

    // Fast reject on S / V first (cheapest, eliminates most pixels)
    if (pS < sLow || pS > sHigh || pV < vLow || pV > vHigh) continue;

    // Hue check with wrapping
    if (hueWrapsLow) {
      // e.g. target H=5, tol=15 → match [170..179] OR [0..20]
      if (pH >= hWrapLow || pH <= hHigh) mask[i] = 255;
    } else if (hueWrapsHigh) {
      // e.g. target H=175, tol=15 → match [160..179] OR [0..10]
      if (pH >= hLow || pH <= hWrapHigh) mask[i] = 255;
    } else {
      if (pH >= hLow && pH <= hHigh) mask[i] = 255;
    }
  }
  return mask;
}

/**
 * Builds a binary mask by comparing each pixel's RGBA channels against a
 * target RGB color within a per-channel tolerance. Operates directly on the
 * Uint8Array pixel buffer — no cv.cvtColor or cv.inRange needed.
 * Used as a fallback when HSV conversion is unavailable.
 *
 * @param {Uint8Array} rgba  - Source pixel data (RGBA interleaved).
 * @param {number}     width - Image width in pixels.
 * @param {number}     height - Image height in pixels.
 * @param {number}     tr   - Target red   (0-255).
 * @param {number}     tg   - Target green (0-255).
 * @param {number}     tb   - Target blue  (0-255).
 * @param {number}     tol  - Per-channel tolerance (0-255).
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
 * Optimized multi-profile detection using HSV color space.
 * Converts the RGBA source to HSV once (OpenCV WASM), then builds a mask per
 * profile using a JavaScript pixel loop in HSV space. Morphology cleanup is
 * applied via OpenCV. Falls back to RGBA comparison if cv.cvtColor is not
 * available in the current OpenCV.js build.
 *
 * @param {Object} src      - Source RGBA cv.Mat (from cv.imread).
 * @param {Array<{targetColor: string, tolerance: number}>} profiles - Color profiles.
 * @returns {Array<{profileIndex: number, mask: Object}>} Array of {profileIndex, mask (cv.Mat)}.
 */
export function detectColorMasks(src, profiles) {
  const mats = [];   // Track all intermediate Mats for guaranteed cleanup
  const results = [];

  try {
    let pixelData, imgWidth, imgHeight, useHsv;

    // ── Try HSV pipeline (much more robust under varying lighting) ──
    if (hsvSupported !== false) {
      try {
        const rgb = new cv.Mat();
        mats.push(rgb);
        cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

        const blurredRgb = new cv.Mat();
        mats.push(blurredRgb);
        cv.GaussianBlur(rgb, blurredRgb, new cv.Size(5, 5), 0);

        const hsv = new cv.Mat();
        mats.push(hsv);
        cv.cvtColor(blurredRgb, hsv, cv.COLOR_RGB2HSV);

        pixelData = hsv.data;
        imgWidth  = hsv.cols;
        imgHeight = hsv.rows;
        useHsv    = true;

        if (hsvSupported === null) {
          hsvSupported = true;
          console.log('[colorDetection] HSV pipeline active — robust detection enabled');
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
      cv.GaussianBlur(src, blurredRgba, new cv.Size(5, 5), 0);
      pixelData = blurredRgba.data;
      imgWidth  = blurredRgba.cols;
      imgHeight = blurredRgba.rows;
    }

    // ── Morphology kernels (shared across profiles) ──
    const kernelSmall = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    mats.push(kernelSmall);
    const kernelLarge = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    mats.push(kernelLarge);

    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const { r, g, b } = hexToRgb(p.targetColor);
      const tol = p.tolerance;

      // ── Build binary mask ──
      let maskBytes;
      if (useHsv) {
        const target = rgbToHsv(r, g, b);
        // Map the user's tolerance (0-255 RGB space) to HSV tolerances.
        // Hue is narrow (color identity), S/V are wider (lighting robustness).
        const hTol = Math.max(10, Math.round(tol * 0.35));
        const sTol = Math.max(40, Math.round(tol * 1.2));
        const vTol = Math.max(50, Math.round(tol * 1.5));
        maskBytes = buildMaskFromHsv(
          pixelData, imgWidth, imgHeight,
          target.h, target.s, target.v, hTol, sTol, vTol,
        );
      } else {
        maskBytes = buildMaskFromRgba(pixelData, imgWidth, imgHeight, r, g, b, tol);
      }

      // ── Wrap into cv.Mat for morphology + contour finding ──
      const rawMask = new cv.Mat(imgHeight, imgWidth, cv.CV_8UC1);
      rawMask.data.set(maskBytes);

      // Morphology: open removes salt noise, close fills pepper gaps
      const opened = new cv.Mat();
      cv.morphologyEx(rawMask, opened, cv.MORPH_OPEN, kernelSmall);
      const closed = new cv.Mat();
      cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, kernelLarge);

      results.push({ profileIndex: i, mask: closed.clone() });

      rawMask.delete();
      opened.delete();
      closed.delete();
    }

    return results;
  } finally {
    for (const m of mats) {
      try { m.delete(); } catch (_) { /* ignore cleanup errors */ }
    }
  }
}


/**
 * Finds external contours in a binary mask and filters by minimum area.
 * Uses only proven, crash-safe OpenCV.js calls (findContours + contourArea).
 * Additional shape filtering (aspect ratio) is handled downstream in processContours.
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
        // Deep-clone so filtered owns its data independently of `contours`.
        // This survives contours.delete() in the finally block.
        const cloned = cnt.clone();
        filtered.push_back(cloned);
        cloned.delete();
      }
      cnt.delete();
    }
    return filtered;
  } finally {
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}
