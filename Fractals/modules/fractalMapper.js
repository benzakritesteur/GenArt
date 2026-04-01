/**
 * Fractal parameter mapper — converts detected surfaces into Julia set
 * equation parameters.
 *
 * Each surface contributes to the fractal via its position, color, and
 * dimensions:
 *
 *   - **Position** → complex constant `c` in z² + c (weighted blend of all
 *     surfaces, normalised to the interesting Julia set region [-1.5, 1.5]).
 *   - **Color** → Inigo Quilez cosine-palette coefficients (`a`, `b`, `c`, `d`)
 *     producing smooth, mathematically-derived colour gradients.
 *   - **Width / Height** → zoom level and iteration depth.
 *   - **Angle** → rotation of the complex plane, adding orientational variety.
 *
 * When no surfaces are detected a beautiful default Julia set is returned.
 * All transitions are designed to be smoothly interpolated by the renderer.
 *
 * @module Fractals/fractalMapper
 */

/**
 * @typedef {Object} FractalParams
 * @property {{real: number, imag: number}} c        - Julia set constant.
 * @property {number}                       zoom     - Zoom level (>0).
 * @property {{x: number, y: number}}       center   - View centre offset.
 * @property {number}                       maxIter  - Maximum iteration count.
 * @property {number}                       rotation - Complex-plane rotation (radians).
 * @property {{r: number, g: number, b: number}[]} paletteA - Cosine palette coefficient a (per-surface + default).
 * @property {{r: number, g: number, b: number}[]} paletteB - Cosine palette coefficient b.
 * @property {{r: number, g: number, b: number}[]} paletteC - Cosine palette coefficient c.
 * @property {{r: number, g: number, b: number}[]} paletteD - Cosine palette coefficient d.
 */

/**
 * Converts a hex colour string to normalised [0,1] RGB.
 *
 * @param {string} hex - Hex colour (e.g. '#3B7DD8').
 * @returns {{r: number, g: number, b: number}} Normalised RGB.
 */
function hexToFloat(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

/**
 * Derives Inigo Quilez cosine-palette coefficients from an array of surface
 * colours.  When only one colour is provided, sensible defaults fill the
 * remaining palette slots.
 *
 * palette(t) = a + b * cos(2π * (c * t + d))
 *
 * @param {{r: number, g: number, b: number}[]} colors - Normalised RGB colours from surfaces.
 * @returns {{a: {r:number,g:number,b:number}, b: {r:number,g:number,b:number}, c: {r:number,g:number,b:number}, d: {r:number,g:number,b:number}}}
 */
function derivePaletteCoefficients(colors) {
  if (colors.length === 0) {
    // Default: dark-blue → cyan → white gradient
    return {
      a: { r: 0.5,  g: 0.5,  b: 0.5  },
      b: { r: 0.5,  g: 0.5,  b: 0.5  },
      c: { r: 1.0,  g: 1.0,  b: 1.0  },
      d: { r: 0.0,  g: 0.10, b: 0.20 },
    };
  }

  // Average colour → base (a)
  const avg = colors.reduce(
    (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
    { r: 0, g: 0, b: 0 }
  );
  avg.r /= colors.length;
  avg.g /= colors.length;
  avg.b /= colors.length;

  // Amplitude (b) — variance-based contrast
  const variance = colors.reduce(
    (acc, c) => ({
      r: acc.r + (c.r - avg.r) ** 2,
      g: acc.g + (c.g - avg.g) ** 2,
      b: acc.b + (c.b - avg.b) ** 2,
    }),
    { r: 0, g: 0, b: 0 }
  );
  const amp = {
    r: Math.min(0.8, 0.3 + Math.sqrt(variance.r / Math.max(1, colors.length))),
    g: Math.min(0.8, 0.3 + Math.sqrt(variance.g / Math.max(1, colors.length))),
    b: Math.min(0.8, 0.3 + Math.sqrt(variance.b / Math.max(1, colors.length))),
  };

  // Frequency (c) — more surfaces = more colour cycles
  const freq = {
    r: 0.8 + colors.length * 0.15,
    g: 0.8 + colors.length * 0.20,
    b: 0.8 + colors.length * 0.25,
  };

  // Phase (d) — offset by first colour
  const first = colors[0];
  const phase = {
    r: first.r * 0.5,
    g: first.g * 0.5,
    b: first.b * 0.5,
  };

  return { a: avg, b: amp, c: freq, d: phase };
}

/**
 * Maps an array of stabilised detected surfaces to Julia-set fractal
 * parameters.
 *
 * @param {Array<{center: {x: number, y: number}, size: {width: number, height: number}, angle: number, displayColor?: string}>} surfaces - Stabilised surface data.
 * @param {{canvasWidth: number, canvasHeight: number, fractalMaxIterations: number, fractalZoom: number, fractalDefaultC: {real: number, imag: number}, fractalAnimationSpeed: number}} config - Application config values.
 * @param {number} time - Elapsed time in seconds (for animation).
 * @returns {FractalParams} Parameters to feed to the fractal renderer.
 */
export function mapSurfacesToFractalParams(surfaces, config, time) {
  const {
    canvasWidth,
    canvasHeight,
    fractalMaxIterations = 150,
    fractalZoom = 1.0,
    fractalDefaultC = { real: -0.7, imag: 0.27015 },
    fractalAnimationSpeed = 0.3,
  } = config;

  // ── No surfaces → animated default Julia set ──
  if (!surfaces || surfaces.length === 0) {
    const t = time * fractalAnimationSpeed;
    const palette = derivePaletteCoefficients([]);
    return {
      c: {
        real: fractalDefaultC.real + 0.15 * Math.sin(t * 0.7),
        imag: fractalDefaultC.imag + 0.15 * Math.cos(t * 0.5),
      },
      zoom: fractalZoom,
      center: { x: 0, y: 0 },
      maxIter: fractalMaxIterations,
      rotation: t * 0.05,
      palette,
    };
  }

  // ── Compute total area for weighting ──
  const totalArea = surfaces.reduce(
    (sum, s) => sum + s.size.width * s.size.height, 0
  );

  // ── Weighted blend of surface positions → c ��─
  let cReal = 0;
  let cImag = 0;
  let avgAngle = 0;
  const colors = [];

  for (const s of surfaces) {
    const area = s.size.width * s.size.height;
    const weight = totalArea > 0 ? area / totalArea : 1 / surfaces.length;

    // Map centre position to interesting Julia-set range [-1.5, 1.5]
    cReal += ((s.center.x / canvasWidth) * 3.0 - 1.5) * weight;
    cImag += ((s.center.y / canvasHeight) * 3.0 - 1.5) * weight;
    avgAngle += (s.angle * Math.PI / 180) * weight;

    if (s.displayColor) {
      colors.push(hexToFloat(s.displayColor));
    }
  }

  // Clamp to a region where Julia sets produce visually interesting fractals
  cReal = Math.max(-2, Math.min(2, cReal));
  cImag = Math.max(-2, Math.min(2, cImag));

  // ── Subtle time-based animation overlaid on surface-derived c ──
  const t = time * fractalAnimationSpeed;
  cReal += 0.04 * Math.sin(t * 0.3);
  cImag += 0.04 * Math.cos(t * 0.4);

  // ── Zoom from average surface size ──
  const avgDim = surfaces.reduce(
    (sum, s) => sum + (s.size.width + s.size.height) / 2, 0
  ) / surfaces.length;
  const sizeRatio = avgDim / Math.max(canvasWidth, canvasHeight);
  const zoom = fractalZoom * (0.4 + sizeRatio * 3.0);

  // ── Iteration count — more surfaces and larger surfaces = more detail ──
  const maxIter = Math.min(
    400,
    Math.max(80, Math.round(fractalMaxIterations + surfaces.length * 15 + sizeRatio * 100))
  );

  // ── Derive cosine palette from surface colours ──
  const palette = derivePaletteCoefficients(colors);

  return {
    c: { real: cReal, imag: cImag },
    zoom: Math.max(0.1, zoom),
    center: { x: 0, y: 0 },
    maxIter,
    rotation: avgAngle * 0.3 + t * 0.02,
    palette,
  };
}

