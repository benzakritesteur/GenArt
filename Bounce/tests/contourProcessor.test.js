/**
 * Tests for modules/contourProcessor.js
 *
 * Note: processContours requires the global `cv` (OpenCV.js) object which is
 * not available in the test runner. These tests validate the input-validation
 * layer and the drawDebugOverlay function only.
 */
import { describe, it, assert } from './testRunner.js';
import { processContours, drawDebugOverlay } from '../modules/contourProcessor.js';

describe('contourProcessor', () => {

  it('should export processContours as a function', () => {
    assert.equal(typeof processContours, 'function');
  });

  it('should export drawDebugOverlay as a function', () => {
    assert.equal(typeof drawDebugOverlay, 'function');
  });

  it('should throw if contours argument is not an array', () => {
    assert.throws(() => processContours('not-an-array'), 'contours must be an array');
    assert.throws(() => processContours(null), 'contours must be an array');
  });

  it('should return an empty array for empty contour input', () => {
    const result = processContours([]);
    assert.ok(Array.isArray(result), 'result must be an array');
    assert.equal(result.length, 0);
  });

  it('should skip null/undefined contours without crashing', () => {
    const result = processContours([null, undefined]);
    assert.equal(result.length, 0, 'null/undefined contours should be skipped');
  });

  it('should skip contours with too few rows', () => {
    // Mock a contour-like object with rows < 3
    const fakeContour = { rows: 2 };
    const result = processContours([fakeContour]);
    assert.equal(result.length, 0, 'contour with < 3 rows should be skipped');
  });
});

