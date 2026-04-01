/**
 * WebGL-based Julia set fractal renderer.
 *
 * Renders a full-screen Julia set using a fragment shader where all iteration
 * and colouring happens on the GPU. Parameters (complex constant `c`, zoom,
 * rotation, colour palette) are passed as uniforms and can be updated every
 * frame for smooth, real-time animation driven by detected surfaces.
 *
 * Uses the Inigo Quilez cosine-palette technique for mathematically smooth
 * colour gradients:
 *
 *   palette(t) = a + b × cos(2π × (c × t + d))
 *
 * @module Fractals/fractalRenderer
 */

// ─── Shader sources ────────────────────────────────────────────────────────

const VERTEX_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision highp float;

uniform vec2  u_resolution;
uniform vec2  u_c;          // Julia set constant (real, imag)
uniform float u_zoom;
uniform vec2  u_center;     // View centre offset
uniform float u_maxIter;
uniform float u_rotation;   // Complex-plane rotation (radians)
uniform float u_time;

// Inigo Quilez cosine-palette coefficients
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;

#define MAX_ITER 500

/**
 * Cosine palette: a + b * cos(2π(c*t + d))
 */
vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318530718 * (c * t + d));
}

void main() {
  // Normalised coordinates centred on screen, aspect-corrected
  vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);

  // Apply zoom
  uv /= max(u_zoom, 0.01);

  // Apply rotation
  float cosR = cos(u_rotation);
  float sinR = sin(u_rotation);
  uv = vec2(uv.x * cosR - uv.y * sinR, uv.x * sinR + uv.y * cosR);

  // Apply centre offset
  uv += u_center;

  // Julia set iteration: z = z² + c
  vec2 z = uv;
  float iter = 0.0;
  for (int i = 0; i < MAX_ITER; i++) {
    if (float(i) >= u_maxIter) break;
    if (dot(z, z) > 4.0) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + u_c;
    iter += 1.0;
  }

  // Colouring
  if (iter >= u_maxIter) {
    // Inside the set — black with subtle glow based on final |z|
    float glow = 1.0 - min(1.0, length(z) * 0.05);
    gl_FragColor = vec4(vec3(glow * 0.05), 1.0);
  } else {
    // Smooth iteration count (avoids colour banding)
    float smoothIter = iter - log2(max(1.0, log2(dot(z, z))));
    float t = smoothIter / u_maxIter;

    vec3 color = cosinePalette(t, u_palA, u_palB, u_palC, u_palD);

    // Subtle vignette for projection depth
    vec2 vigUV = gl_FragCoord.xy / u_resolution;
    float vig = 1.0 - 0.3 * length(vigUV - 0.5);

    gl_FragColor = vec4(color * vig, 1.0);
  }
}
`;

// ─── Renderer class ────────────────────────────────────────────────────────

/**
 * @typedef {Object} RendererState
 * @property {WebGLRenderingContext} gl
 * @property {WebGLProgram} program
 * @property {Object<string, WebGLUniformLocation>} uniforms
 * @property {WebGLBuffer} vertexBuffer
 */

/**
 * Compiles a shader of the given type.
 *
 * @param {WebGLRenderingContext} gl - WebGL context.
 * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER.
 * @param {string} source - GLSL source code.
 * @returns {WebGLShader} Compiled shader.
 * @throws {Error} If compilation fails.
 */
function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

/**
 * Links a vertex + fragment shader into a program.
 *
 * @param {WebGLRenderingContext} gl - WebGL context.
 * @param {WebGLShader} vs - Vertex shader.
 * @param {WebGLShader} fs - Fragment shader.
 * @returns {WebGLProgram} Linked program.
 * @throws {Error} If linking fails.
 */
function linkProgram(gl, vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

/**
 * Initialises the WebGL fractal renderer on the given canvas.
 *
 * @param {HTMLCanvasElement} canvas - Canvas element for WebGL output.
 * @returns {RendererState} Internal state object passed to `renderFractal()`.
 * @throws {Error} If WebGL is not available or shader compilation fails.
 */
export function initFractalRenderer(canvas) {
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    throw new Error('WebGL is not available in this browser');
  }

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = linkProgram(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // Full-screen quad (two triangles)
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  // Cache uniform locations
  const uniformNames = [
    'u_resolution', 'u_c', 'u_zoom', 'u_center', 'u_maxIter',
    'u_rotation', 'u_time',
    'u_palA', 'u_palB', 'u_palC', 'u_palD',
  ];
  const uniforms = {};
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  gl.useProgram(program);

  return { gl, program, uniforms, vertexBuffer };
}

/**
 * Renders a single frame of the Julia set fractal.
 *
 * @param {RendererState} state - Renderer state from `initFractalRenderer()`.
 * @param {import('./fractalMapper.js').FractalParams} params - Fractal parameters from the mapper.
 * @param {number} time - Elapsed time in seconds.
 * @returns {void}
 */
export function renderFractal(state, params, time) {
  const { gl, uniforms } = state;
  const { c, zoom, center, maxIter, rotation, palette } = params;

  // Ensure viewport matches canvas
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Upload uniforms
  gl.uniform2f(uniforms.u_resolution, gl.canvas.width, gl.canvas.height);
  gl.uniform2f(uniforms.u_c, c.real, c.imag);
  gl.uniform1f(uniforms.u_zoom, zoom);
  gl.uniform2f(uniforms.u_center, center.x, center.y);
  gl.uniform1f(uniforms.u_maxIter, maxIter);
  gl.uniform1f(uniforms.u_rotation, rotation);
  gl.uniform1f(uniforms.u_time, time);

  // Cosine palette coefficients
  gl.uniform3f(uniforms.u_palA, palette.a.r, palette.a.g, palette.a.b);
  gl.uniform3f(uniforms.u_palB, palette.b.r, palette.b.g, palette.b.b);
  gl.uniform3f(uniforms.u_palC, palette.c.r, palette.c.g, palette.c.b);
  gl.uniform3f(uniforms.u_palD, palette.d.r, palette.d.g, palette.d.b);

  // Draw full-screen quad
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/**
 * Cleans up WebGL resources.
 *
 * @param {RendererState} state - Renderer state to destroy.
 * @returns {void}
 */
export function destroyFractalRenderer(state) {
  const { gl, program, vertexBuffer } = state;
  gl.deleteBuffer(vertexBuffer);
  gl.deleteProgram(program);
}

