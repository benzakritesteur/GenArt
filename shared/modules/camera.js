/**
 * Shared camera module — webcam capture utilities.
 *
 * Initialises the user's webcam stream and provides frame capture.
 * No application-specific config dependency — fully reusable across apps.
 *
 * @module shared/camera
 */

/**
 * Initializes the user's webcam and attaches the stream to the provided video element.
 *
 * @async
 * @param {HTMLVideoElement} videoElement - The video element to attach the webcam stream to.
 * @param {{width?: number, height?: number}} [resolution={width:1280, height:720}] - Requested resolution.
 * @returns {Promise<void>} Resolves when the video metadata is loaded and the stream is playing.
 * @throws {Error} If camera access is denied or fails for any reason.
 */
export async function initCamera(videoElement, resolution = { width: 1280, height: 720 }) {
  const cameraErrorDiv = document.getElementById('cameraError');

  if (!(videoElement instanceof HTMLVideoElement)) {
    const msg = 'Provided videoElement is not an HTMLVideoElement';
    if (cameraErrorDiv) {
      cameraErrorDiv.textContent = `Camera error: ${msg}`;
      cameraErrorDiv.style.display = 'block';
    }
    throw new Error(msg);
  }

  // Stop any existing stream before requesting a new one
  if (videoElement.srcObject && videoElement.srcObject instanceof MediaStream) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
  }

  try {
    const constraints = { video: { width: resolution.width, height: resolution.height }, audio: false };

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'getUserMedia is not supported in this browser';
      if (cameraErrorDiv) {
        cameraErrorDiv.textContent = `Camera error: ${msg}`;
        cameraErrorDiv.style.display = 'block';
      }
      throw new Error(msg);
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    return new Promise((resolve, reject) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play().then(() => {
          if (cameraErrorDiv) cameraErrorDiv.style.display = 'none';
          resolve();
        }).catch(err => {
          const msg = `Failed to play video: ${err.message}`;
          if (cameraErrorDiv) {
            cameraErrorDiv.textContent = `Camera error: ${msg}`;
            cameraErrorDiv.style.display = 'block';
          }
          reject(new Error(msg));
        });
      };
      videoElement.onerror = (e) => {
        const msg = `Video element error: ${e?.message || e}`;
        if (cameraErrorDiv) {
          cameraErrorDiv.textContent = `Camera error: ${msg}`;
          cameraErrorDiv.style.display = 'block';
        }
        reject(new Error(msg));
      };
      videoElement.srcObject = stream;
    });
  } catch (err) {
    const msg = `Unable to access webcam: ${err?.message || err}`;
    if (cameraErrorDiv) {
      cameraErrorDiv.textContent = `Camera error: ${msg}`;
      cameraErrorDiv.style.display = 'block';
    }
    throw new Error(msg);
  }
}

/**
 * Captures the current frame from the video element and draws it onto the canvas context.
 *
 * @param {HTMLVideoElement} videoElement - The video element containing the webcam stream.
 * @param {HTMLCanvasElement} canvasElement - The canvas element to draw the frame onto.
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context of the canvas.
 * @returns {void}
 * @throws {Error} If any argument is of the wrong type or frame capture fails.
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
    throw new Error(`Failed to capture frame: ${err?.message || err}`);
  }
}

