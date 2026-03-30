/**
 * WebGL2-accelerated renderer for GenArt.
 * Provides GPU-based HSV mask overlay and particle rendering.
 * @module webglRenderer
 */

// ─── Shader sources ───

const MASK_VS = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = (a_position + 1.0) * 0.5;
  v_texCoord.y = 1.0 - v_texCoord.y; // flip Y for video
}`;

const MASK_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_video;
uniform float u_hueMin;
uniform float u_hueMax;
uniform float u_satMin;
uniform float u_satMax;
uniform float u_valMin;
uniform float u_valMax;
uniform vec3 u_color;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  float h = abs(q.z + (q.w - q.y) / (6.0 * d + e));
  float s = d / (q.x + e);
  float v = q.x;
  return vec3(h, s, v);
}

void main() {
  vec4 rgba = texture(u_video, v_texCoord);
  vec3 hsv = rgb2hsv(rgba.rgb);
  // OpenCV HSV: H 0-179, S 0-255, V 0-255. Shader HSV: H 0-1, S 0-1, V 0-1.
  float h = hsv.x * 179.0;
  float s = hsv.y * 255.0;
  float v = hsv.z * 255.0;
  float inRange = step(u_hueMin, h) * step(h, u_hueMax) *
                  step(u_satMin, s) * step(s, u_satMax) *
                  step(u_valMin, v) * step(v, u_valMax);
  fragColor = vec4(u_color, 0.45 * inRange);
}`;

const PARTICLE_VS = `#version 300 es
in vec2 a_position;
in float a_radius;
in vec3 a_color;
uniform vec2 u_resolution;
out vec3 v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_radius * 2.0 * (u_resolution.x / 1280.0); // scale with viewport
  v_color = a_color;
}`;

const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float alpha = 1.0 - smoothstep(0.38, 0.5, d);
  fragColor = vec4(v_color, alpha);
}`;

// ─── Helpers ───

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + info);
  }
  return shader;
}

function linkProgram(gl, vs, fs) {
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error('Program link error: ' + info);
  }
  return prog;
}

function hexToRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// ─── Public API ───

/**
 * Initialize WebGL2 renderer.
 * @param {HTMLCanvasElement} canvas
 * @returns {Object} renderer state object
 */
export function initWebGL(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 not supported in this browser');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // ── Mask program ──
  const maskVS = compileShader(gl, gl.VERTEX_SHADER, MASK_VS);
  const maskFS = compileShader(gl, gl.FRAGMENT_SHADER, MASK_FS);
  const maskProgram = linkProgram(gl, maskVS, maskFS);
  gl.deleteShader(maskVS);
  gl.deleteShader(maskFS);

  // Fullscreen quad VAO
  const quadVAO = gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(maskProgram, 'a_position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Video texture
  const videoTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // ── Particle program ──
  const partVS = compileShader(gl, gl.VERTEX_SHADER, PARTICLE_VS);
  const partFS = compileShader(gl, gl.FRAGMENT_SHADER, PARTICLE_FS);
  const partProgram = linkProgram(gl, partVS, partFS);
  gl.deleteShader(partVS);
  gl.deleteShader(partFS);

  const partVAO = gl.createVertexArray();
  gl.bindVertexArray(partVAO);
  const partBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
  const aPosP = gl.getAttribLocation(partProgram, 'a_position');
  const aRad = gl.getAttribLocation(partProgram, 'a_radius');
  const aCol = gl.getAttribLocation(partProgram, 'a_color');
  // Stride: 2 (pos) + 1 (radius) + 3 (color) = 6 floats = 24 bytes
  gl.enableVertexAttribArray(aPosP);
  gl.vertexAttribPointer(aPosP, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(aRad);
  gl.vertexAttribPointer(aRad, 1, gl.FLOAT, false, 24, 8);
  gl.enableVertexAttribArray(aCol);
  gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 24, 12);
  gl.bindVertexArray(null);

  return {
    gl, canvas, videoTex,
    maskProgram, quadVAO, quadBuf,
    partProgram, partVAO, partBuf,
  };
}

/**
 * Upload the current video frame to the GPU texture.
 * @param {Object} renderer — from initWebGL
 * @param {HTMLVideoElement} videoElement
 */
export function uploadVideoFrame(renderer, videoElement) {
  const { gl, videoTex } = renderer;
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
}

/**
 * Render HSV mask overlay for one color profile.
 * @param {Object} renderer
 * @param {{hueMin:number,hueMax:number,satMin:number,satMax:number,valMin:number,valMax:number,displayColor:string}} profile
 */
export function renderMaskOverlay(renderer, profile) {
  const { gl, maskProgram, quadVAO, videoTex } = renderer;
  gl.useProgram(maskProgram);
  gl.bindVertexArray(quadVAO);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.uniform1i(gl.getUniformLocation(maskProgram, 'u_video'), 0);

  gl.uniform1f(gl.getUniformLocation(maskProgram, 'u_hueMin'), profile.hueMin);
  gl.uniform1f(gl.getUniformLocation(maskProgram, 'u_hueMax'), profile.hueMax);
  gl.uniform1f(gl.getUniformLocation(maskProgram, 'u_satMin'), profile.satMin);
  gl.uniform1f(gl.getUniformLocation(maskProgram, 'u_satMax'), profile.satMax);
  gl.uniform1f(gl.getUniformLocation(maskProgram, 'u_valMin'), profile.valMin);
  gl.uniform1f(gl.getUniformLocation(maskProgram, 'u_valMax'), profile.valMax);

  const rgb = hexToRGB(profile.displayColor || '#0f0');
  gl.uniform3f(gl.getUniformLocation(maskProgram, 'u_color'), rgb[0], rgb[1], rgb[2]);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

/**
 * Render dynamic physics bodies as colored circle point-sprites.
 * @param {Object} renderer
 * @param {Iterable<Matter.Body>} bodies
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function renderParticles(renderer, bodies, canvasWidth, canvasHeight) {
  const { gl, partProgram, partVAO, partBuf } = renderer;

  // Build interleaved array: [x, y, radius, r, g, b, ...]
  const arr = [];
  for (const b of bodies) {
    const fs = b.render?.fillStyle || '#fff';
    const rgb = hexToRGB(fs);
    const radius = b.circleRadius || 10;
    arr.push(b.position.x, b.position.y, radius, rgb[0], rgb[1], rgb[2]);
  }
  if (arr.length === 0) return;

  const data = new Float32Array(arr);
  gl.useProgram(partProgram);
  gl.bindVertexArray(partVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

  gl.uniform2f(gl.getUniformLocation(partProgram, 'u_resolution'), canvasWidth, canvasHeight);
  gl.drawArrays(gl.POINTS, 0, data.length / 6);
  gl.bindVertexArray(null);
}

/**
 * Clear the WebGL canvas.
 * @param {Object} renderer
 */
export function clearWebGL(renderer) {
  const { gl, canvas } = renderer;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/**
 * Destroy the WebGL renderer and release GPU resources.
 * @param {Object} renderer
 */
export function destroyWebGL(renderer) {
  if (!renderer) return;
  const { gl, maskProgram, partProgram, quadVAO, quadBuf, partVAO, partBuf, videoTex } = renderer;
  gl.deleteProgram(maskProgram);
  gl.deleteProgram(partProgram);
  gl.deleteVertexArray(quadVAO);
  gl.deleteBuffer(quadBuf);
  gl.deleteVertexArray(partVAO);
  gl.deleteBuffer(partBuf);
  gl.deleteTexture(videoTex);
}

