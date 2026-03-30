/**
 * Color detection and contour finding utilities using OpenCV.js.
 * Supports multi-color detection via profile parameter.
 *
 * Pipeline: Gaussian blur → HSV conversion → inRange thresholding →
 *           morphology (open + close) → contour finding + shape filtering.
 */
import { CONFIG } from '../config.js';

/**
 * Detects a color mask for a single HSV profile.
 *
 * Applies Gaussian blur to reduce camera noise before HSV thresholding,
 * then cleans the mask with morphological open/close operations.
 *
 * @param {cv.Mat} src - Source image Mat in RGBA format.
 * @param {{hueMin:number,hueMax:number,satMin:number,satMax:number,valMin:number,valMax:number}} [profile] - HSV profile (defaults to first colorProfile).
 * @returns {cv.Mat} Binary mask Mat (single channel, 0/255).
 */
export function detectColorMask(src, profile) {
  const p = profile || CONFIG.colorProfiles[0];
  let bgr = null, blurred = null, hsv = null, mask = null;
  let kernelSmall = null, kernelLarge = null, opened = null, closed = null;
  try {
    bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);

    // Gaussian blur to suppress camera noise before HSV conversion
    blurred = new cv.Mat();
    cv.GaussianBlur(bgr, blurred, new cv.Size(7, 7), 0);

    hsv = new cv.Mat();
    cv.cvtColor(blurred, hsv, cv.COLOR_BGR2HSV);

    const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [p.hueMin, p.satMin, p.valMin, 0]);
    const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [p.hueMax, p.satMax, p.valMax, 255]);
    mask = new cv.Mat();
    cv.inRange(hsv, low, high, mask);
    low.delete();
    high.delete();

    // Morphology: open removes small noise, close fills small holes
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
    if (hsv) hsv.delete();
    if (mask) mask.delete();
    if (kernelSmall) kernelSmall.delete();
    if (kernelLarge) kernelLarge.delete();
    if (opened) opened.delete();
    if (closed) closed.delete();
  }
}

/**
 * Optimized multi-profile detection: converts to HSV once, then runs
 * inRange for each profile. Applies Gaussian blur before conversion.
 *
 * @param {cv.Mat} src - Source RGBA Mat.
 * @param {Array} profiles - Array of HSV profile objects.
 * @returns {Array<{profileIndex: number, mask: cv.Mat}>} Array of masks per profile.
 */
export function detectColorMasks(src, profiles) {
  let bgr = null, blurred = null, hsv = null;
  let kernelSmall = null, kernelLarge = null;
  const results = [];
  try {
    bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);

    // Gaussian blur to suppress camera noise
    blurred = new cv.Mat();
    cv.GaussianBlur(bgr, blurred, new cv.Size(7, 7), 0);

    hsv = new cv.Mat();
    cv.cvtColor(blurred, hsv, cv.COLOR_BGR2HSV);

    // Larger kernels for better morphology on post-it sized objects
    kernelSmall = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    kernelLarge = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11));

    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [p.hueMin, p.satMin, p.valMin, 0]);
      const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [p.hueMax, p.satMax, p.valMax, 255]);
      const mask = new cv.Mat();
      cv.inRange(hsv, low, high, mask);
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
    if (hsv) hsv.delete();
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
