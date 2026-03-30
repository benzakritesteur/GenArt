import { describe, it, assert, assertEqual } from './testRunner.js';

// Mock cv before importing the module
function setupMockCv() {
  window.cv = {
    minAreaRect(contour) {
      return {
        center: { x: contour._cx, y: contour._cy },
        size: { width: contour._w, height: contour._h },
        angle: contour._angle
      };
    },
    boxPoints(rect) {
      const cx = rect.center.x, cy = rect.center.y;
      const hw = rect.size.width / 2, hh = rect.size.height / 2;
      return {
        data32F: new Float32Array([
          cx - hw, cy - hh,
          cx + hw, cy - hh,
          cx + hw, cy + hh,
          cx - hw, cy + hh
        ]),
        delete() {}
      };
    }
  };
}

function makeContour(cx, cy, w, h, angle = 0) {
  return { _cx: cx, _cy: cy, _w: w, _h: h, _angle: angle };
}

describe('ContourProcessor', () => {
  it('processContours returns correct structure', async () => {
    setupMockCv();
    const { processContours } = await import('../modules/contourProcessor.js');
    const results = processContours([makeContour(100, 200, 50, 30, 15)]);
    assertEqual(results.length, 1);
    assertEqual(results[0].center.x, 100);
    assertEqual(results[0].center.y, 200);
    assertEqual(results[0].angle, 15);
    assertEqual(results[0].corners.length, 4);
  });

  it('processContours handles empty array', async () => {
    setupMockCv();
    const { processContours } = await import('../modules/contourProcessor.js');
    const results = processContours([]);
    assertEqual(results.length, 0);
  });

  it('processContours handles multiple contours', async () => {
    setupMockCv();
    const { processContours } = await import('../modules/contourProcessor.js');
    const results = processContours([
      makeContour(10, 20, 40, 20, 0),
      makeContour(200, 300, 60, 40, 45)
    ]);
    assertEqual(results.length, 2);
    assertEqual(results[1].center.x, 200);
    assertEqual(results[1].angle, 45);
  });

  it('drawDebugOverlay does not throw', async () => {
    setupMockCv();
    const { drawDebugOverlay } = await import('../modules/contourProcessor.js');
    // Mock canvas context
    const mockCtx = {
      save() {}, restore() {}, beginPath() {}, closePath() {},
      moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, fillText() {},
      lineWidth: 0, strokeStyle: '', fillStyle: '', font: '', textAlign: '', textBaseline: ''
    };
    const objs = [{
      center: { x: 50, y: 50 }, size: { width: 20, height: 10 }, angle: 5,
      corners: [{ x: 40, y: 45 }, { x: 60, y: 45 }, { x: 60, y: 55 }, { x: 40, y: 55 }],
      id: 1, displayColor: '#0f0', profileName: 'Green'
    }];
    // Should not throw
    drawDebugOverlay(mockCtx, objs);
    assert(true);
  });
});

