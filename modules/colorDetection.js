/**
 * Color detection and contour finding utilities using OpenCV.js.
 * Supports multi-color detection via profile parameter.
 */
import { CONFIG } from '../config.js';

/**
 * Detects a color mask for a single HSV profile.
 *
 * @param {cv.Mat} src - Source image Mat in RGBA format.
 * @param {{hueMin:number,hueMax:number,satMin:number,satMax:number,valMin:number,valMax:number}} [profile] - HSV profile (defaults to first colorProfile).
 * @returns {cv.Mat} Binary mask Mat (single channel, 0/255).
 */
export function detectColorMask(src, profile) {
  const p = profile || CONFIG.colorProfiles[0];
  let bgr = null, hsv = null, mask = null, kernel = null, opened = null, closed = null;
  try {
    bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
    hsv = new cv.Mat();
    cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV);
    const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [p.hueMin, p.satMin, p.valMin, 0]);
    const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [p.hueMax, p.satMax, p.valMax, 255]);
    mask = new cv.Mat();
    cv.inRange(hsv, low, high, mask);
    low.delete();
    high.delete();
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    opened = new cv.Mat();
    cv.morphologyEx(mask, opened, cv.MORPH_OPEN, kernel);
    closed = new cv.Mat();
    cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, kernel);
    return closed.clone();
  } finally {
    if (bgr) bgr.delete();
    if (hsv) hsv.delete();
    if (mask) mask.delete();
    if (kernel) kernel.delete();
    if (opened) opened.delete();
  }
}

/**
 * Optimized: converts to HSV once, then runs inRange for each profile.
 *
 * @param {cv.Mat} src - Source RGBA Mat.
 * @param {Array} profiles - Array of HSV profile objects.
 * @returns {Array<{profileIndex: number, mask: cv.Mat}>} Array of masks per profile.
 */
export function detectColorMasks(src, profiles) {
  let bgr = null, hsv = null, kernel = null;
  const results = [];
  try {
    bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
    hsv = new cv.Mat();
    cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV);
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));

    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [p.hueMin, p.satMin, p.valMin, 0]);
      const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [p.hueMax, p.satMax, p.valMax, 255]);
      const mask = new cv.Mat();
      cv.inRange(hsv, low, high, mask);
      low.delete();
      high.delete();
      const opened = new cv.Mat();
      cv.morphologyEx(mask, opened, cv.MORPH_OPEN, kernel);
      const closed = new cv.Mat();
      cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, kernel);
      results.push({ profileIndex: i, mask: closed.clone() });
      mask.delete();
      opened.delete();
      closed.delete();
    }
    return results;
  } finally {
    if (bgr) bgr.delete();
    if (hsv) hsv.delete();
    if (kernel) kernel.delete();
  }
}

/**
 * Finds external contours in a binary mask and filters by minimum area.
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
