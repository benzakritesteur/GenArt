/**
 * Color detection and contour finding utilities using OpenCV.js.
 * Uses RGB color difference approach: a pixel is detected when each channel's
 * absolute difference from the target color is within the tolerance.
 *
 * Pipeline: Gaussian blur → BGR conversion → per-profile inRange (BGR ± tolerance)
 *           → morphology (open + close) → contour finding + area filtering.
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
 * Detects a color mask for a single color profile using RGB color difference.
 * A pixel is detected if each BGR channel's absolute difference from the target
 * color is within the tolerance.
 *
 * @param {cv.Mat} src - Source image Mat in RGBA format.
 * @param {{targetColor: string, tolerance: number}} profile - Color profile.
 * @returns {cv.Mat} Binary mask Mat (single channel, 0/255).
 */
export function detectColorMask(src, profile) {
  const { r, g, b } = hexToRgb(profile.targetColor);
  const tol = profile.tolerance;

  let bgr = null, blurred = null, mask = null;
  let kernelSmall = null, kernelLarge = null, opened = null, closed = null;
  try {
    bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);

    blurred = new cv.Mat();
    cv.GaussianBlur(bgr, blurred, new cv.Size(7, 7), 0);

    const low = new cv.Mat(blurred.rows, blurred.cols, blurred.type(), [
      Math.max(0, b - tol), Math.max(0, g - tol), Math.max(0, r - tol), 0
    ]);
    const high = new cv.Mat(blurred.rows, blurred.cols, blurred.type(), [
      Math.min(255, b + tol), Math.min(255, g + tol), Math.min(255, r + tol), 255
    ]);
    mask = new cv.Mat();
    cv.inRange(blurred, low, high, mask);
    low.delete();
    high.delete();

    kernelSmall = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    kernelLarge = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11));
    opened = new cv.Mat();
    cv.morphologyEx(mask, opened, cv.MORPH_OPEN, kernelSmall);
    closed = new cv.Mat();
    cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, kernelLarge);

    return closed.clone();
  } finally {
    if (bgr) bgr.delete();
    if (blurred) blurred.delete();
    if (mask) mask.delete();
    if (kernelSmall) kernelSmall.delete();
    if (kernelLarge) kernelLarge.delete();
    if (opened) opened.delete();
    if (closed) closed.delete();
  }
}

/**
 * Optimized multi-profile detection using RGB color difference: converts to
 * BGR and blurs once, then runs inRange for each profile with ±tolerance.
 *
 * @param {cv.Mat} src - Source RGBA Mat.
 * @param {Array<{targetColor: string, tolerance: number}>} profiles - Array of color profiles.
 * @returns {Array<{profileIndex: number, mask: cv.Mat}>} Array of masks per profile.
 */
export function detectColorMasks(src, profiles) {
  let bgr = null, blurred = null;
  let kernelSmall = null, kernelLarge = null;
  const results = [];
  try {
    bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);

    blurred = new cv.Mat();
    cv.GaussianBlur(bgr, blurred, new cv.Size(7, 7), 0);

    kernelSmall = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    kernelLarge = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11));

    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const { r, g, b } = hexToRgb(p.targetColor);
      const tol = p.tolerance;

      const low = new cv.Mat(blurred.rows, blurred.cols, blurred.type(), [
        Math.max(0, b - tol), Math.max(0, g - tol), Math.max(0, r - tol), 0
      ]);
      const high = new cv.Mat(blurred.rows, blurred.cols, blurred.type(), [
        Math.min(255, b + tol), Math.min(255, g + tol), Math.min(255, r + tol), 255
      ]);
      const mask = new cv.Mat();
      cv.inRange(blurred, low, high, mask);
      low.delete();
      high.delete();

      const opened = new cv.Mat();
      cv.morphologyEx(mask, opened, cv.MORPH_OPEN, kernelSmall);
      const closed = new cv.Mat();
      cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, kernelLarge);

      results.push({ profileIndex: i, mask: closed.clone() });
      mask.delete();
      opened.delete();
      closed.delete();
    }
    return results;
  } finally {
    if (bgr) bgr.delete();
    if (blurred) blurred.delete();
    if (kernelSmall) kernelSmall.delete();
    if (kernelLarge) kernelLarge.delete();
  }
}

/**
 * Finds external contours in a binary mask and filters by minimum area.
 * Uses only proven, crash-safe OpenCV.js calls (findContours + contourArea).
 * Additional shape filtering (aspect ratio) is handled downstream in processContours.
 *
 * @param {cv.Mat} mask - Binary mask Mat (single channel, 0/255).
 * @returns {cv.MatVector} MatVector of contours passing area threshold.
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
        filtered.push_back(cnt);
      }
      cnt.delete();
    }
    return filtered;
  } finally {
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}
