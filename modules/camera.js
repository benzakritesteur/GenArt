/**
 * Initializes the user's webcam and attaches the stream to the provided video element.
 *
 * @async
 * @param {HTMLVideoElement} videoElement - The video element to attach the webcam stream to.
 * @returns {Promise<void>} Resolves when the video metadata is loaded and the stream is playing.
 * @throws {Error} If camera access is denied or fails for any reason.
 * @example
 * import { initCamera } from './modules/camera.js';
 * const video = document.getElementById('video');
 * await initCamera(video);
 */
export async function initCamera(videoElement) {
  if (!(videoElement instanceof HTMLVideoElement)) {
    throw new Error('Provided videoElement is not an HTMLVideoElement');
  }
  try {
    const constraints = { video: { width: 1280, height: 720 }, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    return new Promise((resolve, reject) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play().then(resolve).catch(err => {
          reject(new Error('Failed to play video: ' + err.message));
        });
      };
      videoElement.onerror = (e) => {
        reject(new Error('Video element error: ' + (e?.message || e)));
      };
    });
  } catch (err) {
    throw new Error('Unable to access webcam: ' + (err && err.message ? err.message : err));
  }
}

/**
 * Captures the current frame from the video element and draws it onto the canvas context.
 *
 * @param {HTMLVideoElement} videoElement - The video element containing the webcam stream.
 * @param {HTMLCanvasElement} canvasElement - The canvas element to draw the frame onto.
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
 * @returns {void}
 * @example
 * import { captureFrame } from './modules/camera.js';
 * captureFrame(video, canvas, ctx);
 */
export function captureFrame(videoElement, canvasElement, ctx) {
  if (!(videoElement instanceof HTMLVideoElement)) {
    throw new Error('Provided videoElement is not an HTMLVideoElement');
  }
  if (!(canvasElement instanceof HTMLCanvasElement)) {
    throw new Error('Provided canvasElement is not an HTMLCanvasElement');
  }
  if (!(ctx instanceof CanvasRenderingContext2D)) {
    throw new Error('Provided ctx is not a CanvasRenderingContext2D');
  }
  try {
    ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  } catch (err) {
    // Drawing errors are rare but possible (e.g., if video is not ready)
    throw new Error('Failed to capture frame: ' + (err && err.message ? err.message : err));
  }
}

