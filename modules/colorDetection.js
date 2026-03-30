/**
 * Color detection and contour finding utilities using OpenCV.js.
 *
 * Detection pipeline (per profile):
 *   1. Gaussian blur on the RGBA source (noise reduction)
 *   2. Direct RGBA pixel comparison in JavaScript (no BGR conversion, no cv.inRange)
 *   3. Morphology (open + close) to clean up the binary mask
 *   4. Contour finding + area filtering
 *
 * This approach avoids cv.cvtColor, cv.inRange, and the full-size scalar Mat
 * constructor — all of which have known compatibility issues across OpenCV.js
 * CDN builds.
 */
import { CONFIG } from '../config.js';

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
 * Builds a binary mask by comparing each pixel's RGBA channels against a
 * target RGB color within a per-channel tolerance. Operates directly on the
 * Uint8Array pixel buffer — no cv.cvtColor or cv.inRange needed.
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
    const off = i << 2; // i * 4
    // RGBA layout: [R, G, B, A, R, G, B, A, ...]
    const dr = rgba[off]     - tr;
    const dg = rgba[off + 1] - tg;
    const db = rgba[off + 2] - tb;
    // Fast abs check: if |dr|<=tol && |dg|<=tol && |db|<=tol → 255
    if (dr >= -tol && dr <= tol &&
        dg >= -tol && dg <= tol &&
        db >= -tol && db <= tol) {
      mask[i] = 255;
    }
    // else mask[i] stays 0 (Uint8Array is zero-initialized)
  }
  return mask;
}

/**
 * Optimized multi-profile detection.
 * Blurs the RGBA source once, then builds a mask per profile using direct
 * pixel comparison in JavaScript. Morphology cleanup is done via OpenCV.
 *
 * @param {Object} src      - Source RGBA cv.Mat (from cv.imread).
 * @param {Array<{targetColor: string, tolerance: number}>} profiles - Color profiles.
 * @returns {Array<{profileIndex: number, mask: Object}>} Array of {profileIndex, mask (cv.Mat)}.
 */
export function detectColorMasks(src, profiles) {
  let blurred = null;
  let kernelSmall = null, kernelLarge = null;
  const results = [];

  try {
    // 1. Gaussian blur on the RGBA image (works on any channel count)
    blurred = new cv.Mat();
    cv.GaussianBlur(src, blurred, new cv.Size(5, 5), 0);

    const w = blurred.cols;
    const h = blurred.rows;
    const rgba = blurred.data; // Uint8Array — RGBA interleaved

    // 2. Morphology kernels (shared across profiles)
    kernelSmall = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    kernelLarge = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));

    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const { r, g, b } = hexToRgb(p.targetColor);
      const tol = p.tolerance;

      // 3. Build mask directly from RGBA pixels (JavaScript — no cv.inRange)
      const maskBytes = buildMaskFromRgba(rgba, w, h, r, g, b, tol);

      // 4. Wrap into a cv.Mat for morphology + contour finding
      const rawMask = new cv.Mat(h, w, cv.CV_8UC1);
      rawMask.data.set(maskBytes);

      // 5. Morphology: open removes salt noise, close fills pepper gaps
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
    if (blurred) blurred.delete();
    if (kernelSmall) kernelSmall.delete();
    if (kernelLarge) kernelLarge.delete();
  }
}

/**
 * Single-profile convenience wrapper (kept for backward compatibility).
 *
 * @param {Object} src - Source RGBA cv.Mat.
 * @param {{targetColor: string, tolerance: number}} profile - Color profile.
 * @returns {Object} Binary mask cv.Mat (CV_8UC1, 0/255).
 */
export function detectColorMask(src, profile) {
  const result = detectColorMasks(src, [profile]);
  if (result.length > 0) return result[0].mask;
  return cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
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
