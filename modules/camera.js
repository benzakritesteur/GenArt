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
  console.log('[initCamera] Called. videoElement:', videoElement);
  if (!(videoElement instanceof HTMLVideoElement)) {
    console.error('[initCamera] Provided videoElement is not an HTMLVideoElement:', videoElement);
    throw new Error('Provided videoElement is not an HTMLVideoElement');
  }
  // Stop any existing stream before requesting a new one
  if (videoElement.srcObject && videoElement.srcObject instanceof MediaStream) {
    console.log('[initCamera] Stopping previous stream.');
    videoElement.srcObject.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
  }
  try {
    const constraints = { video: { width: 1280, height: 720 }, audio: false };
    console.log('[initCamera] Requesting getUserMedia with constraints:', constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('[initCamera] getUserMedia success. Stream:', stream);
    return new Promise((resolve, reject) => {
      videoElement.onloadedmetadata = () => {
        console.log('[initCamera] onloadedmetadata fired. Playing video.');
        videoElement.play().then(() => {
          console.log('[initCamera] Video playing.');
          resolve();
        }).catch(err => {
          console.error('[initCamera] Failed to play video:', err);
          reject(new Error('Failed to play video: ' + err.message));
        });
      };
      videoElement.onerror = (e) => {
        console.error('[initCamera] Video element error:', e);
        reject(new Error('Video element error: ' + (e?.message || e)));
      };
      videoElement.srcObject = stream;
    });
  } catch (err) {
    console.error('[initCamera] Unable to access webcam:', err);
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
