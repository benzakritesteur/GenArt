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
  const cameraErrorDiv = document.getElementById('cameraError');
  if (!(videoElement instanceof HTMLVideoElement)) {
    console.error('[initCamera] Provided videoElement is not an HTMLVideoElement:', videoElement);
    if (cameraErrorDiv) {
      cameraErrorDiv.textContent = 'Camera error: Provided videoElement is not an HTMLVideoElement.';
      cameraErrorDiv.style.display = 'block';
    }
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (cameraErrorDiv) {
        cameraErrorDiv.textContent = 'Camera error: getUserMedia is not supported in this browser.';
        cameraErrorDiv.style.display = 'block';
      }
      throw new Error('getUserMedia is not supported in this browser');
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('[initCamera] getUserMedia success. Stream:', stream);
    return new Promise((resolve, reject) => {
      videoElement.onloadedmetadata = () => {
        console.log('[initCamera] onloadedmetadata fired. Playing video.');
        videoElement.play().then(() => {
          console.log('[initCamera] Video playing.');
          if (cameraErrorDiv) cameraErrorDiv.style.display = 'none';
          resolve();
        }).catch(err => {
          console.error('[initCamera] Failed to play video:', err);
          if (cameraErrorDiv) {
            cameraErrorDiv.textContent = 'Camera error: Failed to play video: ' + err.message;
            cameraErrorDiv.style.display = 'block';
          }
          reject(new Error('Failed to play video: ' + err.message));
        });
      };
      videoElement.onerror = (e) => {
        console.error('[initCamera] Video element error:', e);
        if (cameraErrorDiv) {
          cameraErrorDiv.textContent = 'Camera error: Video element error: ' + (e?.message || e);
          cameraErrorDiv.style.display = 'block';
        }
        reject(new Error('Video element error: ' + (e?.message || e)));
      };
      videoElement.srcObject = stream;
    });
  } catch (err) {
    console.error('[initCamera] Unable to access webcam:', err);
    if (cameraErrorDiv) {
      cameraErrorDiv.textContent = 'Camera error: Unable to access webcam: ' + (err && err.message ? err.message : err);
      cameraErrorDiv.style.display = 'block';
    }
    throw new Error('Unable to access webcam: ' + (err && err.message ? err.message : err));
  }
}

/**
 * Captures the current frame from the video element and draws it onto the canvas context.
 * When an ROI (Region of Interest) is provided, only that sub-region of the video
 * is drawn, stretched to fill the canvas — effectively a digital zoom.
 *
 * @param {HTMLVideoElement} videoElement - The video element containing the webcam stream.
 * @param {HTMLCanvasElement} canvasElement - The canvas element to draw the frame onto.
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
 * @param {{x: number, y: number, w: number, h: number}} [roi] - Optional crop region in video-native pixels.
 * @returns {void}
 */
export function captureFrame(videoElement, canvasElement, ctx, roi) {
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
    if (roi && (roi.w < canvasElement.width || roi.h < canvasElement.height ||
                roi.x > 0 || roi.y > 0)) {
      // Crop the video: draw only the ROI region, stretched to fill the canvas
      const vw = videoElement.videoWidth || canvasElement.width;
      const vh = videoElement.videoHeight || canvasElement.height;
      const sx = (roi.x / canvasElement.width) * vw;
      const sy = (roi.y / canvasElement.height) * vh;
      const sw = (roi.w / canvasElement.width) * vw;
      const sh = (roi.h / canvasElement.height) * vh;
      ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, canvasElement.width, canvasElement.height);
    } else {
      ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    }
  } catch (err) {
    throw new Error('Failed to capture frame: ' + (err && err.message ? err.message : err));
  }
}
