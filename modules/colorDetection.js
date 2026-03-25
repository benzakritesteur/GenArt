/**
 * Color detection and contour finding utilities using OpenCV.js.
 * Uses global `cv` object and project CONFIG.
 */
import { CONFIG } from '../config.js';

/**
 * Detects a color mask in the given RGBA OpenCV Mat using HSV thresholding and morphological cleaning.
 *
 * @param {cv.Mat} src - Source image Mat in RGBA format.
 * @returns {cv.Mat} Binary mask Mat (single channel, 0/255) with noise cleaned.
 * @example
 * const mask = detectColorMask(srcMat);
 */
export function detectColorMask(src) {
  let bgr = null, hsv = null, mask = null, kernel = null, opened = null, closed = null;
  try {
    bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
    hsv = new cv.Mat();
    cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV);
    const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [CONFIG.hueMin, CONFIG.satMin, CONFIG.valMin, 0]);
    const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [CONFIG.hueMax, CONFIG.satMax, CONFIG.valMax, 255]);
    mask = new cv.Mat();
    cv.inRange(hsv, low, high, mask);
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
    // closed is returned (cloned), so do not delete here
  }
}

/**
 * Finds external contours in a binary mask and filters by minimum area.
 *
 * @param {cv.Mat} mask - Binary mask Mat (single channel, 0/255).
 * @returns {cv.MatVector} MatVector of contours passing area threshold.
 * @example
 * const contours = findContours(mask);
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
    // filtered is returned, do not delete
  }
}

