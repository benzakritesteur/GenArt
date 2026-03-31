/**
 * WebGL-accelerated renderer for GenArt.
 *
 * This module is a planned replacement for the current Canvas 2D rendering
 * pipeline. It will use WebGL2 to offload color detection masking and
 * surface overlay rendering to the GPU.
 *
 * Status: **Not yet implemented** — the current pipeline uses Canvas 2D and
 * CPU-based pixel processing in {@link module:colorDetection}.
 *
 * @module webglRenderer
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext
 */

/**
 * Checks whether the current browser supports WebGL2.
 *
 * @returns {boolean} `true` if WebGL2 is available.
 */
export function isWebGL2Supported() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch (_err) {
    return false;
  }
}

