/**
 * Main entry point for GenArt real-time projection mapping system.
 * Orchestrates camera, OpenCV, physics, and UI modules.
 */
import { initCamera, captureFrame } from './modules/camera.js';
import { detectColorMasks, findContours } from './modules/colorDetection.js';
import { processContours, drawDebugOverlay } from './modules/contourProcessor.js';
import { initCornerPinUI, buildPerspectiveTransform } from './modules/cornerPin.js';
import { stabilizeObjects } from './modules/stabilizer.js';
import { initPhysics, syncPhysicsBodies, spawnDynamicBody, cleanupDynamicBodies, getDynamicBodyCount } from './modules/physicsEngine.js';
import { CONFIG } from './config.js';
import { createFPSMonitor } from './modules/utils.js';
import { saveCalibration, loadCalibration, clearCalibration, exportPreset, importPreset } from './modules/storage.js';

// ─── DOM elements ───
const video = document.getElementById('video');
const captureCanvas = document.getElementById('captureCanvas');
const debugCanvas = document.getElementById('debugCanvas');
const physicsCanvas = document.getElementById('physicsCanvas');
const debugCtx = debugCanvas.getContext('2d');

let showDebug = false;
const bodyRegistry = new Map();
let physics = null;
let fpsTick = null;
let spawnTimerId = null;

let cornerPinDraw = null;
let cameraPinDraw = null;
let showCameraPin = false;
let opencvReady = false;
let activeProfileIdx = 0;
let cameraPreviewCanvas = null;
let cameraPreviewCtx = null;
let maskPreviewCanvas = null;

/** Surfaces detected this frame — drawn in the afterRender callback. */
let currentSurfaces = [];

// ═════════════════════════════════════════════
// OpenCV ready
// ═════════════════════════════════════════════
function waitForOpenCvReady() {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };
    if (window.cv && window.cv.Mat) return done();
    if (window.cv && typeof window.cv.then === 'function') {
      window.cv.then(m => { window.cv = m; done(); });
      return;
    }
    window.onOpenCvReady = () => done();
    const timeout = 30000;
    const start = Date.now();
    const id = setInterval(() => {
      if (window.cv && window.cv.Mat) { clearInterval(id); done(); }
      else if (window.cv && typeof window.cv.then === 'function') {
        clearInterval(id);
        window.cv.then(m => { window.cv = m; done(); });
      } else if (Date.now() - start > timeout) {
        clearInterval(id);
        if (!resolved) { resolved = true; reject(new Error('OpenCV.js failed to load within 30 s')); }
      }
    }, 50);
  });
}

// ═════════════════════════════════════════════
// Init
// ═════════════════════════════════════════════
async function init() {
  // Force clear stale calibration from older versions (HSV-format profiles)
  const loaded = loadCalibration();
  const hasOldFormat = loaded && CONFIG.colorProfiles.some(p => p.hueMin !== undefined);
  if (loaded && hasOldFormat) {
    console.warn('[init] Clearing stale calibration (old HSV format detected).');
    clearCalibration();
    location.reload();
    return;
  }

  // 1. Init camera FIRST — no OpenCV needed, user sees feed immediately
  await initCamera(video);

  // Apply saved camera feed visibility
  if (!CONFIG.showCameraFeed) video.style.display = 'none';

  // Canvas internal resolution — set BEFORE physics init so all contexts start at correct size
  [captureCanvas, debugCanvas, physicsCanvas].forEach(c => {
    c.width = CONFIG.canvasWidth;
    c.height = CONFIG.canvasHeight;
  });

  // 2. Init physics — no OpenCV needed
  physics = initPhysics(physicsCanvas);

  // Force transparent background on physicsCanvas (in case Matter.js overrides it)
  physicsCanvas.style.background = 'transparent';

  // Draw camera feed behind physics bodies after each Matter.js render frame,
  // and draw detected surfaces as glowing overlays on top.
  Matter.Events.on(physics.render, 'afterRender', () => {
    const ctx = physicsCanvas.getContext('2d');

    // ── Draw surface overlays on top of physics bodies ──
    if (CONFIG.showSurfaces && currentSurfaces.length > 0) {
      ctx.save();
      for (const surface of currentSurfaces) {
        const color = surface.displayColor || '#0f0';
        if (!surface.corners || surface.corners.length < 4) continue;

        // Glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;

        // Semi-transparent fill
        ctx.fillStyle = color + '30';
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(surface.corners[0].x, surface.corners[0].y);
        for (let i = 1; i < surface.corners.length; i++) {
          ctx.lineTo(surface.corners[i].x, surface.corners[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw a bright inner edge for visibility
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color + 'AA';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Draw camera feed behind everything (destination-over) ──
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    if (CONFIG.showCameraFeed && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, physicsCanvas.width, physicsCanvas.height);
    } else if (!CONFIG.showCameraFeed) {
      // Projection mode: solid black background (no camera feed)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, physicsCanvas.width, physicsCanvas.height);
    }
    ctx.restore();
  });


  // Make canvases fill the viewport via CSS
  function resizeToViewport() {
    const vw = window.innerWidth + 'px';
    const vh = window.innerHeight + 'px';
    [physicsCanvas, debugCanvas].forEach(c => {
      c.style.width = vw;
      c.style.height = vh;
    });
  }
  resizeToViewport();
  window.addEventListener('resize', resizeToViewport);

  // FPS HUD
  fpsTick = createFPSMonitor(document.body);

  // Debug toggle (D key) — toggles corner pin handles
  window.addEventListener('keydown', e => {
    if (e.key === 'd' || e.key === 'D') {
      showDebug = !showDebug;
    }
    // C = toggle camera corner pin handles (perspective correction for input)
    if (e.key === 'c' || e.key === 'C') {
      showCameraPin = !showCameraPin;
      console.log(`[camera] Corner pin handles ${showCameraPin ? 'ON — drag cyan handles' : 'OFF'}`);
    }
    // V = toggle camera feed visibility
    if (e.key === 'v' || e.key === 'V') {
      CONFIG.showCameraFeed = !CONFIG.showCameraFeed;
      video.style.display = CONFIG.showCameraFeed ? '' : 'none';
      debouncedSave();
      console.log(`[display] Camera feed ${CONFIG.showCameraFeed ? 'ON' : 'OFF'}`);
    }
    // H = toggle the control panel
    if (e.key === 'h' || e.key === 'H') {
      const p = document.getElementById('calibrationPanel');
      if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
    }
    // T = spawn a test static body in the middle (to verify physics works)
    if (e.key === 't' || e.key === 'T') {
      const testBody = Matter.Bodies.rectangle(
        CONFIG.canvasWidth / 2,
        CONFIG.canvasHeight * 0.6,
        300,
        20,
        {
          isStatic: true,
          angle: 0.15,
          restitution: 0.6,
          friction: 0.4,
          render: { fillStyle: 'rgba(255,255,0,0.5)', strokeStyle: '#ff0', lineWidth: 2 }
        }
      );
      Matter.World.add(physics.world, testBody);
      console.log('[test] Added test static body at center — press T again for more');
    }
  });

  // Click / tap to spawn dynamic body (on debugCanvas since it's the topmost layer)
  function spawnAtPointer(px, py) {
    const rect = debugCanvas.getBoundingClientRect();
    const scaleX = CONFIG.canvasWidth / rect.width;
    const scaleY = CONFIG.canvasHeight / rect.height;
    spawnDynamicBody(physics.world, (px - rect.left) * scaleX, (py - rect.top) * scaleY);
  }
  debugCanvas.addEventListener('click', e => spawnAtPointer(e.clientX, e.clientY));

  // Auto-spawn timer
  startAutoSpawn();

  // 3. Init corner pin UIs — no OpenCV needed, available immediately
  // Projector output warp (yellow handles — toggle with D key)
  replaceCornerPinDraw(debugCanvas, newCorners => {
    CONFIG.cornerPin = newCorners.map(p => ({ ...p }));
    if (window._syncProjectionWarp) window._syncProjectionWarp();
    console.log('[cornerPin] Projector corners updated', newCorners.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
    debouncedSave();
  }, { initialPoints: CONFIG.cornerPin, handleColor: 'yellow', lineColor: '#ff0', label: 'Projector' });

  // Camera input perspective correction (cyan handles — toggle with C key)
  replaceCameraPinDraw(debugCanvas, newCorners => {
    CONFIG.cameraCornerPin = newCorners.map(p => ({ ...p }));
    console.log('[cornerPin] Camera corners updated', newCorners.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
    debouncedSave();
  }, { initialPoints: CONFIG.cameraCornerPin, handleColor: 'cyan', lineColor: '#0ff', label: 'Camera' });

  // Start render loop NOW (camera + physics work without OpenCV)
  requestAnimationFrame(mainLoop);

  // 4. Wait for OpenCV in the background
  try {
    await waitForOpenCvReady();
  } catch (err) {
    console.error('OpenCV.js failed to load:', err);
    const errDiv = document.getElementById('cameraError');
    if (errDiv) {
      errDiv.textContent = 'OpenCV.js failed to load — color detection is disabled. Refresh to retry.';
      errDiv.style.display = 'block';
    }
    return; // keep running without detection
  }

  opencvReady = true;
  console.log('[init] OpenCV ready — detection pipeline active');
}

// ── Auto-spawn ──
function startAutoSpawn() {
  stopAutoSpawn();
  if (CONFIG.autoSpawnEnabled && physics) {
    spawnTimerId = setInterval(() => {
      const x = CONFIG.spawnMode === 'single' ? CONFIG.spawnPoint.x : Math.random() * CONFIG.canvasWidth;
      const y = CONFIG.spawnMode === 'single' ? CONFIG.spawnPoint.y : 10;
      spawnDynamicBody(physics.world, x, y);
    }, CONFIG.spawnInterval);
  }
}
function stopAutoSpawn() {
  if (spawnTimerId) { clearInterval(spawnTimerId); spawnTimerId = null; }
}

// ═════════════════════════════════════════════
// Main Loop — multi-color detection
// ═════════════════════════════════════════════
let cleanupCounter = 0;
let detectionFrameCounter = 0;
/** Cached detection results reused on skipped frames. */
let lastActiveSurfaces = [];
let lastDiagPerProfile = [];

function mainLoop() {
  if (fpsTick) fpsTick();

  // Update camera preview (always, even without OpenCV)
  if (cameraPreviewCtx && video.readyState >= 2) {
    cameraPreviewCtx.drawImage(video, 0, 0, cameraPreviewCanvas.width, cameraPreviewCanvas.height);
  }

  // Skip detection if video or OpenCV isn't ready yet
  if (!opencvReady || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
    // Still draw debug overlay (corner pin handles)
    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    if (showDebug && cornerPinDraw) cornerPinDraw();
    if (showCameraPin && cameraPinDraw) cameraPinDraw();
    requestAnimationFrame(mainLoop);
    return;
  }

  // ── Frame-skipping: only run detection every N frames ──
  const detectionInterval = Math.max(1, Math.round(CONFIG.detectionInterval || 1));
  const runDetection = (detectionFrameCounter % detectionInterval === 0);
  detectionFrameCounter++;

  if (runDetection) {
    // 1. Capture full frame
    captureFrame(video, captureCanvas, captureCanvas.getContext('2d'));

    let src = null;
    try {
      src = cv.imread(captureCanvas);

      // 1b. Camera perspective correction (input-side warp)
      const camPin = CONFIG.cameraCornerPin;
      const isDefaultCamPin = camPin[0].x === 0 && camPin[0].y === 0 &&
        camPin[1].x === CONFIG.canvasWidth && camPin[1].y === 0 &&
        camPin[2].x === CONFIG.canvasWidth && camPin[2].y === CONFIG.canvasHeight &&
        camPin[3].x === 0 && camPin[3].y === CONFIG.canvasHeight;
      if (!isDefaultCamPin) {
        let transformMat = null;
        let warped = null;
        try {
          const dstPts = [
            { x: 0, y: 0 }, { x: CONFIG.canvasWidth, y: 0 },
            { x: CONFIG.canvasWidth, y: CONFIG.canvasHeight }, { x: 0, y: CONFIG.canvasHeight }
          ];
          transformMat = buildPerspectiveTransform(camPin, dstPts);
          warped = new cv.Mat();
          const dsize = new cv.Size(CONFIG.canvasWidth, CONFIG.canvasHeight);
          cv.warpPerspective(src, warped, transformMat, dsize);
          src.delete();
          src = warped;
          warped = null; // ownership transferred
        } catch (warpErr) {
          console.warn('[mainLoop] Camera perspective warp failed:', warpErr);
          if (warped) warped.delete();
        } finally {
          if (transformMat) transformMat.delete();
        }
      }

      // 2. Detect masks for all color profiles
      const masksInfo = detectColorMasks(src, CONFIG.colorProfiles);

      // Update mask preview for the active profile
      if (maskPreviewCanvas && masksInfo.length > 0) {
        const activeMaskInfo = masksInfo.find(m => m.profileIndex === activeProfileIdx);
        if (activeMaskInfo) {
          try {
            const dsize = new cv.Size(maskPreviewCanvas.width, maskPreviewCanvas.height);
            const resized = new cv.Mat();
            cv.resize(activeMaskInfo.mask, resized, dsize);
            cv.imshow(maskPreviewCanvas, resized);
            resized.delete();
          } catch (_) { /* ignore preview errors */ }
        }
      }

      // 3. Process each mask — isolated per profile so one failure doesn't kill all
      let allDetections = [];
      const diagPerProfile = [];
      for (const { profileIndex, mask } of masksInfo) {
        try {
          const profile = CONFIG.colorProfiles[profileIndex];

          // Count non-zero pixels for diagnostics
          const maskPixels = cv.countNonZero(mask);

          const contoursVec = findContours(mask);
          const contourCount = contoursVec.size();
          const contours = [];
          for (let i = 0; i < contoursVec.size(); ++i) contours.push(contoursVec.get(i));
          const detected = processContours(contours);

          diagPerProfile.push({
            name: profile.name,
            maskPx: maskPixels,
            contours: contourCount,
            shapes: detected.length
          });

          // 4. Tag with profile info — coordinates are already in canvas space
          for (const obj of detected) {
            allDetections.push({
              ...obj,
              profileIndex,
              profileName: profile.name,
              displayColor: profile.targetColor
            });
          }

          // Cleanup OpenCV mats
          contours.forEach(c => c.delete());
          contoursVec.delete();
        } catch (profileErr) {
          console.warn(`[mainLoop] Detection error for profile ${profileIndex}:`, profileErr);
        } finally {
          mask.delete();
        }
      }

      // 5. Stabilize
      const stabilized = stabilizeObjects(allDetections);

      // Propagate display info from detections to stabilized (by matching id).
      const activeSurfaces = [];
      for (const s of stabilized) {
        let best = null, bestDist = Infinity;
        for (const d of allDetections) {
          const dx = d.center.x - s.center.x, dy = d.center.y - s.center.y;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) { bestDist = dist; best = d; }
        }
        if (best) {
          s.displayColor = best.displayColor;
          s.profileName = best.profileName;
          activeSurfaces.push(s);
        }
      }

      // Cache detection results for skipped frames
      lastActiveSurfaces = activeSurfaces;
      lastDiagPerProfile = diagPerProfile;

      // 6. Sync physics
      syncPhysicsBodies(physics.world, activeSurfaces, bodyRegistry);

      // 7. Store active surfaces for the afterRender overlay drawing
      currentSurfaces = activeSurfaces;

      // ── Diagnostic logging (throttled: every ~2s at 60fps) ──
      if (cleanupCounter % 120 === 0) {
        const profileSummary = diagPerProfile.map(
          d => `${d.name}(px:${d.maskPx} cnt:${d.contours} shapes:${d.shapes})`
        ).join(' ');
        console.log(`[detection] ${profileSummary} → raw=${allDetections.length} stabilized=${stabilized.length} bodies=${bodyRegistry.size} scale=${CONFIG.detectionScale} skip=${detectionInterval}`);
      }

      src.delete();
    } catch (err) {
      let msg = err;
      if (typeof err === 'number' && typeof cv !== 'undefined' && cv.exceptionFromPtr) {
        try { msg = cv.exceptionFromPtr(err).msg; } catch (_) { msg = 'OpenCV error (code ' + err + ')'; }
      }
      console.error('Main loop error:', msg);
      if (src) try { src.delete(); } catch (_) {}
    }
  } else {
    // Skipped frame — reuse last detection results for physics + rendering
    currentSurfaces = lastActiveSurfaces;
  }

  // ── Always render (even on skipped detection frames) ──
  debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  drawDebugOverlay(debugCtx, currentSurfaces, getDynamicBodyCount(), bodyRegistry.size);
  if (showDebug && cornerPinDraw) cornerPinDraw();
  if (showCameraPin && cameraPinDraw) cameraPinDraw();

  // Draw spawn point marker when in single mode
  if (CONFIG.spawnMode === 'single') {
    debugCtx.save();
    debugCtx.fillStyle = '#f06';
    debugCtx.strokeStyle = '#fff';
    debugCtx.lineWidth = 2;
    debugCtx.beginPath();
    debugCtx.arc(CONFIG.spawnPoint.x, CONFIG.spawnPoint.y, 8, 0, 2 * Math.PI);
    debugCtx.fill();
    debugCtx.stroke();
    debugCtx.fillStyle = '#fff';
    debugCtx.font = 'bold 10px monospace';
    debugCtx.textAlign = 'center';
    debugCtx.fillText('DROP', CONFIG.spawnPoint.x, CONFIG.spawnPoint.y + 20);
    debugCtx.restore();
  }

  // Periodic cleanup of dynamic bodies
  if (++cleanupCounter % 60 === 0) {
    cleanupDynamicBodies(physics.world);
  }


  requestAnimationFrame(mainLoop);
}

// ═════════════════════════════════════════════
// Debounced save
// ═════════════════════════════════════════════
let saveTimer = null;
function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCalibration(), 500);
}

/**
 * Destroy old corner pin instance (if any) and create a new one.
 * Prevents event listener accumulation when re-initializing.
 */
function replaceCornerPinDraw(...args) {
  if (cornerPinDraw && cornerPinDraw.destroy) cornerPinDraw.destroy();
  cornerPinDraw = initCornerPinUI(...args);
  return cornerPinDraw;
}
function replaceCameraPinDraw(...args) {
  if (cameraPinDraw && cameraPinDraw.destroy) cameraPinDraw.destroy();
  cameraPinDraw = initCornerPinUI(...args);
  return cameraPinDraw;
}

// ═════════════════════════════════════════════
// Calibration UI — multi-color profiles + controls
// ═════════════════════════════════════════════
const panel = document.createElement('div');
panel.id = 'calibrationPanel';
Object.assign(panel.style, {
  position: 'fixed', top: '12px', right: '12px',
  background: 'rgba(20,20,20,0.92)', padding: '14px 18px 10px',
  borderRadius: '10px', zIndex: '10000', color: '#fff',
  font: '13px monospace', boxShadow: '0 2px 14px rgba(0,0,0,0.35)',
  maxHeight: '90vh', overflowY: 'auto', minWidth: '280px',
  pointerEvents: 'auto'
});
document.body.appendChild(panel);

/** Rebuild the entire calibration panel UI */
function buildCalibrationUI() {
  panel.innerHTML = '';

  // ── Title ──
  const title = document.createElement('div');
  title.textContent = '🎨 GenArt Controls (H to hide)';
  title.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:10px;text-align:center;';
  panel.appendChild(title);

  // ── Camera & Detection Preview ──
  const previewSection = document.createElement('div');
  previewSection.style.cssText = 'margin-bottom:10px;';

  const previewTitle = document.createElement('div');
  previewTitle.textContent = '📷 Camera & Detection';
  previewTitle.style.cssText = 'font-weight:bold;margin-bottom:6px;font-size:13px;';
  previewSection.appendChild(previewTitle);

  // Camera status indicator
  const cameraStatusEl = document.createElement('div');
  cameraStatusEl.style.cssText = 'font-size:11px;margin-bottom:4px;';
  function updateCameraStatus() {
    if (video.srcObject && video.readyState >= 2) {
      cameraStatusEl.innerHTML = '<span style="color:#6f6">● Camera active</span>' +
        (opencvReady ? ' <span style="color:#6cf">● Detection ON</span>' : ' <span style="color:#fa0">● Loading OpenCV…</span>');
    } else {
      cameraStatusEl.innerHTML = '<span style="color:#f66">● Camera not available</span>';
    }
  }
  updateCameraStatus();
  setInterval(updateCameraStatus, 1000);
  previewSection.appendChild(cameraStatusEl);

  // Preview canvases container
  const previewContainer = document.createElement('div');
  previewContainer.style.cssText = 'display:flex;gap:4px;margin-bottom:2px;';

  // Camera preview canvas
  const camPrev = document.createElement('canvas');
  camPrev.width = 160; camPrev.height = 90;
  camPrev.style.cssText = 'border:1px solid #444;border-radius:4px;background:#000;cursor:crosshair;';
  cameraPreviewCanvas = camPrev;
  cameraPreviewCtx = camPrev.getContext('2d');

  // ── Eyedropper: click camera preview to pick target color ──
  camPrev.title = 'Click to pick target color for active profile';
  camPrev.addEventListener('click', (e) => {
    const rect = camPrev.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (camPrev.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (camPrev.height / rect.height));
    try {
      const pixel = cameraPreviewCtx.getImageData(x, y, 1, 1).data;
      const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
      const profile = CONFIG.colorProfiles[activeProfileIdx];
      if (profile) {
        profile.targetColor = hex;
        console.log(`[eyedropper] Picked color ${hex} for profile "${profile.name}"`);
        renderTabs();
        renderProfileSliders(activeProfileIdx);
        debouncedSave();
        flash(`Picked ${hex} for ${profile.name}`, '#6f6');
      }
    } catch (err) {
      console.warn('[eyedropper] Failed to read pixel:', err);
    }
  });

  previewContainer.appendChild(camPrev);

  // Mask preview canvas
  const maskPrev = document.createElement('canvas');
  maskPrev.width = 160; maskPrev.height = 90;
  maskPrev.style.cssText = 'border:1px solid #444;border-radius:4px;background:#000;';
  maskPreviewCanvas = maskPrev;
  previewContainer.appendChild(maskPrev);

  previewSection.appendChild(previewContainer);

  // Preview labels
  const labelRow = document.createElement('div');
  labelRow.style.cssText = 'display:flex;gap:4px;font-size:10px;color:#888;margin-bottom:6px;';
  const camLbl = document.createElement('span'); camLbl.textContent = '🎯 Click to pick color'; camLbl.style.width = '160px';
  const maskLbl = document.createElement('span'); maskLbl.textContent = 'Detection Mask (active profile)';
  labelRow.appendChild(camLbl); labelRow.appendChild(maskLbl);
  previewSection.appendChild(labelRow);

  // Show camera feed toggle (for projection mode)
  const feedRow = document.createElement('div');
  feedRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  const feedCheck = document.createElement('input');
  feedCheck.type = 'checkbox'; feedCheck.checked = CONFIG.showCameraFeed;
  feedCheck.onchange = () => {
    CONFIG.showCameraFeed = feedCheck.checked;
    video.style.display = CONFIG.showCameraFeed ? '' : 'none';
    debouncedSave();
  };
  feedRow.appendChild(feedCheck);
  const feedLbl = document.createElement('span');
  feedLbl.textContent = 'Show camera feed (V key)';
  feedLbl.style.fontSize = '11px';
  feedRow.appendChild(feedLbl);
  previewSection.appendChild(feedRow);

  // Show surfaces toggle
  const surfRow = document.createElement('div');
  surfRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  const surfCheck = document.createElement('input');
  surfCheck.type = 'checkbox'; surfCheck.checked = CONFIG.showSurfaces;
  surfCheck.onchange = () => { CONFIG.showSurfaces = surfCheck.checked; debouncedSave(); };
  surfRow.appendChild(surfCheck);
  const surfLbl = document.createElement('span');
  surfLbl.textContent = 'Show detected surfaces overlay';
  surfLbl.style.fontSize = '11px';
  surfRow.appendChild(surfLbl);
  previewSection.appendChild(surfRow);

  panel.appendChild(previewSection);

  // ── Separator ──
  panel.appendChild(Object.assign(document.createElement('hr'), { style: { border: '0', borderTop: '1px solid #444', margin: '10px 0' } }));

  // ── Color profiles tabs ──
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;align-items:center;';
  panel.appendChild(tabBar);

  const profileContainer = document.createElement('div');
  panel.appendChild(profileContainer);

  let activeTab = activeProfileIdx;

  function renderTabs() {
    tabBar.innerHTML = '';
    CONFIG.colorProfiles.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.textContent = p.name;
      btn.style.cssText = `padding:4px 10px;border:2px solid ${p.targetColor};border-radius:6px;cursor:pointer;
        font:12px monospace;color:#fff;background:${i === activeTab ? p.targetColor + '44' : 'transparent'};`;
      btn.onclick = () => { activeTab = i; activeProfileIdx = i; renderTabs(); renderProfileSliders(i); };
      tabBar.appendChild(btn);
    });
    // Add profile button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.title = 'Add color profile';
    addBtn.style.cssText = 'padding:4px 8px;border:1px solid #6cf;border-radius:6px;cursor:pointer;font:bold 14px monospace;color:#6cf;background:transparent;';
    addBtn.onclick = () => {
      const colors = ['#E84040', '#4040E8', '#E8E840', '#40E8E8', '#E840E8', '#E8A040'];
      const names = ['Red', 'Blue', 'Yellow', 'Cyan', 'Magenta', 'Orange'];
      const idx = CONFIG.colorProfiles.length % colors.length;
      CONFIG.colorProfiles.push({
        name: names[idx],
        targetColor: colors[idx],
        tolerance: 70,
      });
      activeTab = CONFIG.colorProfiles.length - 1;
      activeProfileIdx = activeTab;
      renderTabs();
      renderProfileSliders(activeTab);
      debouncedSave();
    };
    tabBar.appendChild(addBtn);
  }

  function renderProfileSliders(idx) {
    profileContainer.innerHTML = '';
    const p = CONFIG.colorProfiles[idx];
    if (!p) return;

    // ── Profile name + target color picker ──
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'margin-bottom:8px;display:flex;align-items:center;gap:6px;';
    const nameInput = document.createElement('input');
    nameInput.type = 'text'; nameInput.value = p.name;
    nameInput.style.cssText = 'width:80px;background:#333;border:1px solid #555;color:#fff;padding:2px 6px;border-radius:4px;font:12px monospace;';
    nameInput.oninput = () => { p.name = nameInput.value; renderTabs(); debouncedSave(); };
    nameRow.appendChild(nameInput);

    // Target color picker — this is both the detection color AND the display color
    const colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.value = p.targetColor;
    colorInput.title = 'Target color to detect';
    colorInput.style.cssText = 'width:36px;height:28px;border:2px solid #888;border-radius:4px;cursor:pointer;padding:0;';
    colorInput.oninput = () => { p.targetColor = colorInput.value; renderTabs(); debouncedSave(); };
    nameRow.appendChild(colorInput);

    // Remove button (only if more than one profile)
    if (CONFIG.colorProfiles.length > 1) {
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '✕';
      rmBtn.style.cssText = 'margin-left:auto;padding:2px 8px;border:1px solid #f44;border-radius:4px;color:#f44;background:transparent;cursor:pointer;font:bold 12px monospace;';
      rmBtn.onclick = () => {
        CONFIG.colorProfiles.splice(idx, 1);
        activeTab = Math.min(activeTab, CONFIG.colorProfiles.length - 1);
        activeProfileIdx = activeTab;
        renderTabs(); renderProfileSliders(activeTab); debouncedSave();
      };
      nameRow.appendChild(rmBtn);
    }
    profileContainer.appendChild(nameRow);

    // ── Color info ──
    const infoRow = document.createElement('div');
    infoRow.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:6px;';
    function updateInfo() {
      const hex = p.targetColor;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      infoRow.textContent = `RGB(${r}, ${g}, ${b}) | Tolerance ${p.tolerance} (HSV-based)`;
    }
    updateInfo();
    profileContainer.appendChild(infoRow);

    // ── Tolerance slider ──
    const tolRow = document.createElement('div');
    tolRow.style.cssText = 'display:flex;align-items:center;margin:4px 0 2px;';
    const tolLbl = document.createElement('span');
    tolLbl.textContent = 'Tolerance';
    tolLbl.style.cssText = 'width:72px;font-size:12px;font-weight:bold;';
    const tolInput = document.createElement('input');
    tolInput.type = 'range'; tolInput.min = 10; tolInput.max = 150; tolInput.step = 1;
    tolInput.value = p.tolerance;
    tolInput.style.cssText = 'flex:1;accent-color:' + p.targetColor + ';';
    const tolVal = document.createElement('span');
    tolVal.textContent = p.tolerance;
    tolVal.style.cssText = 'width:34px;text-align:right;font-size:12px;font-weight:bold;margin-left:4px;';
    tolInput.oninput = () => {
      p.tolerance = Number(tolInput.value);
      tolVal.textContent = tolInput.value;
      updateInfo();
      debouncedSave();
    };
    tolRow.appendChild(tolLbl); tolRow.appendChild(tolInput); tolRow.appendChild(tolVal);
    profileContainer.appendChild(tolRow);

    // ── Explanation ──
    const helpRow = document.createElement('div');
    helpRow.style.cssText = 'font-size:10px;color:#666;margin-top:4px;line-height:1.4;';
    helpRow.textContent = 'Lower tolerance = stricter match (only very similar colors). Higher = more lenient (broader color range detected).';
    profileContainer.appendChild(helpRow);
  }

  renderTabs();
  renderProfileSliders(activeTab);

  // ── Separator ──
  panel.appendChild(Object.assign(document.createElement('hr'), { style: { border: '0', borderTop: '1px solid #444', margin: '10px 0' } }));

  // ── Camera controls ──
  const camTitle = document.createElement('div');
  camTitle.textContent = '📷 Camera Framing';
  camTitle.style.cssText = 'font-weight:bold;margin-bottom:6px;';
  panel.appendChild(camTitle);

  const camDesc = document.createElement('div');
  camDesc.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:6px;line-height:1.4;';
  camDesc.textContent = 'Drag the 4 cyan handles to crop, zoom, and correct the camera angle. This defines which part of the camera image maps to the detection area.';
  panel.appendChild(camDesc);

  // Show / hide camera corner pin handles
  const camPinRow = document.createElement('div');
  camPinRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  const camPinCheck = document.createElement('input');
  camPinCheck.type = 'checkbox'; camPinCheck.checked = showCameraPin;
  camPinCheck.onchange = () => { showCameraPin = camPinCheck.checked; };
  camPinRow.appendChild(camPinCheck);
  const camPinLbl = document.createElement('span');
  camPinLbl.textContent = 'Show camera handles (C key)';
  camPinLbl.style.cssText = 'font-size:11px;color:#0ff;';
  camPinRow.appendChild(camPinLbl);
  panel.appendChild(camPinRow);

  // Camera corner pin coordinate fields
  const camPinFields = addCornerPinFields(panel, () => CONFIG.cameraCornerPin, '#0ff', () => {
    debouncedSave();
    replaceCameraPinDraw(debugCanvas, newCorners => {
      CONFIG.cameraCornerPin = newCorners.map(p => ({ ...p }));
      camPinFields.refresh();
      console.log('[cornerPin] Camera corners updated', newCorners.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
      debouncedSave();
    }, { initialPoints: CONFIG.cameraCornerPin, handleColor: 'cyan', lineColor: '#0ff', label: 'Camera' });
  });

  // Re-init camera pin draw so drag callbacks refresh the fields
  replaceCameraPinDraw(debugCanvas, newCorners => {
    CONFIG.cameraCornerPin = newCorners.map(p => ({ ...p }));
    camPinFields.refresh();
    console.log('[cornerPin] Camera corners updated', newCorners.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
    debouncedSave();
  }, { initialPoints: CONFIG.cameraCornerPin, handleColor: 'cyan', lineColor: '#0ff', label: 'Camera' });

  // Reset camera corner pin
  const camResetBtn = document.createElement('button');
  camResetBtn.textContent = 'Reset Camera Framing';
  camResetBtn.style.cssText = 'padding:3px 8px;border:1px solid #0ff;border-radius:4px;color:#0ff;background:transparent;cursor:pointer;font:10px monospace;margin:4px 0;';
  camResetBtn.onclick = () => {
    CONFIG.cameraCornerPin = [
      { x: 0, y: 0 }, { x: CONFIG.canvasWidth, y: 0 },
      { x: CONFIG.canvasWidth, y: CONFIG.canvasHeight }, { x: 0, y: CONFIG.canvasHeight }
    ];
    camPinFields.refresh();
    debouncedSave();
    replaceCameraPinDraw(debugCanvas, newCorners => {
      CONFIG.cameraCornerPin = newCorners.map(p => ({ ...p }));
      camPinFields.refresh();
      console.log('[cornerPin] Camera corners updated', newCorners.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
      debouncedSave();
    }, { initialPoints: CONFIG.cameraCornerPin, handleColor: 'cyan', lineColor: '#0ff', label: 'Camera' });
    flash('Camera framing reset');
  };
  panel.appendChild(camResetBtn);

  // ── Separator ──
  panel.appendChild(Object.assign(document.createElement('hr'), { style: { border: '0', borderTop: '1px solid #444', margin: '10px 0' } }));

  // ── Projector corner pin ──
  const projTitle = document.createElement('div');
  projTitle.textContent = '🎥 Projector Framing';
  projTitle.style.cssText = 'font-weight:bold;margin-bottom:6px;';
  panel.appendChild(projTitle);

  const projDesc = document.createElement('div');
  projDesc.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:6px;line-height:1.4;';
  projDesc.textContent = 'Adjust output corners for keystoning correction when the projector is at an angle. Drag yellow handles (D key) or type coordinates.';
  panel.appendChild(projDesc);

  // Show / hide projector corner pin handles
  const projPinRow = document.createElement('div');
  projPinRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  const projPinCheck = document.createElement('input');
  projPinCheck.type = 'checkbox'; projPinCheck.checked = showDebug;
  projPinCheck.onchange = () => { showDebug = projPinCheck.checked; };
  projPinRow.appendChild(projPinCheck);
  const projPinLbl = document.createElement('span');
  projPinLbl.textContent = 'Show projector handles (D key)';
  projPinLbl.style.cssText = 'font-size:11px;color:#ff0;';
  projPinRow.appendChild(projPinLbl);
  panel.appendChild(projPinRow);

  // Projector corner pin coordinate fields
  const projPinFields = addCornerPinFields(panel, () => CONFIG.cornerPin, '#ff0', () => {
    if (window._syncProjectionWarp) window._syncProjectionWarp();
    debouncedSave();
    replaceCornerPinDraw(debugCanvas, newCorners => {
      CONFIG.cornerPin = newCorners.map(p => ({ ...p }));
      projPinFields.refresh();
      if (window._syncProjectionWarp) window._syncProjectionWarp();
      console.log('[cornerPin] Projector corners updated', newCorners.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
      debouncedSave();
    }, { initialPoints: CONFIG.cornerPin, handleColor: 'yellow', lineColor: '#ff0', label: 'Projector' });
  });

  // Re-init projector pin draw so drag callbacks refresh the fields
  replaceCornerPinDraw(debugCanvas, newCorners => {
    CONFIG.cornerPin = newCorners.map(p => ({ ...p }));
    projPinFields.refresh();
    if (window._syncProjectionWarp) window._syncProjectionWarp();
    console.log('[cornerPin] Projector corners updated', newCorners.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
    debouncedSave();
  }, { initialPoints: CONFIG.cornerPin, handleColor: 'yellow', lineColor: '#ff0', label: 'Projector' });

  // Reset projector corner pin
  const projResetBtn = document.createElement('button');
  projResetBtn.textContent = 'Reset Projector Framing';
  projResetBtn.style.cssText = 'padding:3px 8px;border:1px solid #ff0;border-radius:4px;color:#ff0;background:transparent;cursor:pointer;font:10px monospace;margin:4px 0;';
  projResetBtn.onclick = () => {
    CONFIG.cornerPin = [
      { x: 0, y: 0 }, { x: CONFIG.canvasWidth, y: 0 },
      { x: CONFIG.canvasWidth, y: CONFIG.canvasHeight }, { x: 0, y: CONFIG.canvasHeight }
    ];
    projPinFields.refresh();
    if (window._syncProjectionWarp) window._syncProjectionWarp();
    debouncedSave();
    replaceCornerPinDraw(debugCanvas, newCorners => {
      CONFIG.cornerPin = newCorners.map(p => ({ ...p }));
      projPinFields.refresh();
      if (window._syncProjectionWarp) window._syncProjectionWarp();
      console.log('[cornerPin] Projector corners updated', newCorners.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
      debouncedSave();
    }, { initialPoints: CONFIG.cornerPin, handleColor: 'yellow', lineColor: '#ff0', label: 'Projector' });
    flash('Projector framing reset');
  };
  panel.appendChild(projResetBtn);

  // ── Separator ──
  panel.appendChild(Object.assign(document.createElement('hr'), { style: { border: '0', borderTop: '1px solid #444', margin: '10px 0' } }));

  // ── Physics controls ──
  const physTitle = document.createElement('div');
  physTitle.textContent = '⚙ Physics';
  physTitle.style.cssText = 'font-weight:bold;margin-bottom:6px;';
  panel.appendChild(physTitle);

  // Auto-spawn toggle
  const spawnRow = document.createElement('div');
  spawnRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  const spawnCheck = document.createElement('input');
  spawnCheck.type = 'checkbox'; spawnCheck.checked = CONFIG.autoSpawnEnabled;
  spawnCheck.onchange = () => {
    CONFIG.autoSpawnEnabled = spawnCheck.checked;
    if (CONFIG.autoSpawnEnabled) startAutoSpawn(); else stopAutoSpawn();
    debouncedSave();
  };
  spawnRow.appendChild(spawnCheck);
  const spawnLbl = document.createElement('span');
  spawnLbl.textContent = 'Auto-spawn particles';
  spawnLbl.style.fontSize = '12px';
  spawnRow.appendChild(spawnLbl);
  panel.appendChild(spawnRow);

  // Recycle oldest toggle (infinite spawn with eviction)
  const recycleRow = document.createElement('div');
  recycleRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  const recycleCheck = document.createElement('input');
  recycleCheck.type = 'checkbox'; recycleCheck.checked = CONFIG.recycleOldest;
  recycleCheck.onchange = () => {
    CONFIG.recycleOldest = recycleCheck.checked;
    debouncedSave();
  };
  recycleRow.appendChild(recycleCheck);
  const recycleLbl = document.createElement('span');
  recycleLbl.textContent = 'Recycle oldest (infinite spawn)';
  recycleLbl.style.fontSize = '12px';
  recycleRow.appendChild(recycleLbl);
  panel.appendChild(recycleRow);

  // Spawn mode toggle (random / single drop point)
  const modeRow = document.createElement('div');
  modeRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:11px;';
  modeRow.textContent = 'Drop: ';
  for (const mode of ['random', 'single']) {
    const rb = document.createElement('input');
    rb.type = 'radio'; rb.name = 'spawnMode'; rb.value = mode;
    rb.checked = CONFIG.spawnMode === mode;
    rb.onchange = () => { CONFIG.spawnMode = mode; startAutoSpawn(); debouncedSave(); };
    const lb = document.createElement('label');
    lb.style.cssText = 'cursor:pointer;margin-right:4px;';
    lb.appendChild(rb);
    lb.append(mode === 'random' ? ' Random' : ' Single point');
    modeRow.appendChild(lb);
  }
  panel.appendChild(modeRow);

  // Single drop point sliders (visible when single mode)
  const spawnPtContainer = document.createElement('div');
  spawnPtContainer.style.cssText = CONFIG.spawnMode === 'single' ? '' : 'display:none;';
  addSliderRow(spawnPtContainer, 'Drop X', CONFIG.spawnPoint.x, 0, CONFIG.canvasWidth, 5, v => {
    CONFIG.spawnPoint.x = v; debouncedSave();
  });
  addSliderRow(spawnPtContainer, 'Drop Y', CONFIG.spawnPoint.y, 0, CONFIG.canvasHeight, 5, v => {
    CONFIG.spawnPoint.y = v; debouncedSave();
  });
  panel.appendChild(spawnPtContainer);
  // Show/hide drop point sliders on mode change
  modeRow.addEventListener('change', () => {
    spawnPtContainer.style.display = CONFIG.spawnMode === 'single' ? '' : 'none';
  });

  // Spawn interval slider
  addSliderRow(panel, 'Interval (ms)', CONFIG.spawnInterval, 100, 3000, 100, v => {
    CONFIG.spawnInterval = v; startAutoSpawn(); debouncedSave();
  });

  // Max bodies slider
  addSliderRow(panel, 'Max bodies', CONFIG.maxDynamicBodies, 10, 300, 10, v => {
    CONFIG.maxDynamicBodies = v; debouncedSave();
  });

  // Radius slider
  addSliderRow(panel, 'Radius', CONFIG.dynamicBodyRadius, 4, 40, 1, v => {
    CONFIG.dynamicBodyRadius = v; debouncedSave();
  });

  // ── Ball Colors palette ──
  const colorsTitle = document.createElement('div');
  colorsTitle.textContent = '🎨 Ball Colors';
  colorsTitle.style.cssText = 'font-weight:bold;margin:8px 0 4px;font-size:12px;';
  panel.appendChild(colorsTitle);

  const colorsContainer = document.createElement('div');
  colorsContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:6px;';
  panel.appendChild(colorsContainer);

  /** Rebuild the color swatch row from CONFIG.ballColors. */
  function renderBallColors() {
    colorsContainer.innerHTML = '';
    CONFIG.ballColors.forEach((hex, idx) => {
      const swatch = document.createElement('div');
      swatch.style.cssText = `position:relative;width:26px;height:26px;border-radius:50%;border:2px solid #888;cursor:pointer;background:${hex};`;
      swatch.title = `${hex} — click to change`;

      // ── Delete badge (×) — visible on hover ──
      if (CONFIG.ballColors.length > 1) {
        const delBadge = document.createElement('span');
        delBadge.textContent = '×';
        delBadge.title = 'Remove this color';
        delBadge.style.cssText =
          'position:absolute;top:-6px;right:-6px;width:14px;height:14px;' +
          'background:#e44;color:#fff;border-radius:50%;font-size:11px;line-height:14px;' +
          'text-align:center;cursor:pointer;opacity:0;transition:opacity .15s;pointer-events:none;';
        swatch.appendChild(delBadge);
        swatch.addEventListener('mouseenter', () => { delBadge.style.opacity = '1'; delBadge.style.pointerEvents = 'auto'; });
        swatch.addEventListener('mouseleave', () => { delBadge.style.opacity = '0'; delBadge.style.pointerEvents = 'none'; });
        delBadge.addEventListener('click', e => {
          e.stopPropagation();
          CONFIG.ballColors.splice(idx, 1);
          renderBallColors();
          debouncedSave();
        });
      }

      // Left-click on swatch body: open a hidden color picker to change this color
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = hex;
      picker.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none;';
      picker.oninput = () => {
        CONFIG.ballColors[idx] = picker.value;
        swatch.style.background = picker.value;
        debouncedSave();
      };
      swatch.appendChild(picker);
      swatch.addEventListener('click', () => picker.click());

      // Right-click: also removes (keep as secondary shortcut)
      swatch.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (CONFIG.ballColors.length <= 1) return;
        CONFIG.ballColors.splice(idx, 1);
        renderBallColors();
        debouncedSave();
      });

      colorsContainer.appendChild(swatch);
    });

    // Add-color button
    const addBtn = document.createElement('div');
    addBtn.textContent = '+';
    addBtn.title = 'Add a ball color';
    addBtn.style.cssText = 'width:26px;height:26px;border-radius:50%;border:2px dashed #6cf;color:#6cf;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:bold;font-size:16px;';
    addBtn.addEventListener('click', () => {
      // Pick a random saturated default so it's visible
      const hue = Math.floor(Math.random() * 360);
      const newColor = `hsl(${hue}, 80%, 60%)`;
      // Convert HSL to hex via a temporary canvas
      const tmp = document.createElement('canvas');
      tmp.width = 1; tmp.height = 1;
      const tctx = tmp.getContext('2d');
      tctx.fillStyle = newColor;
      tctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = tctx.getImageData(0, 0, 1, 1).data;
      const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      CONFIG.ballColors.push(hex);
      renderBallColors();
      debouncedSave();
    });
    colorsContainer.appendChild(addBtn);
  }

  renderBallColors();

  // ── Separator ──
  panel.appendChild(Object.assign(document.createElement('hr'), { style: { border: '0', borderTop: '1px solid #444', margin: '10px 0' } }));

  // ── Detection tuning controls ──
  const detTitle = document.createElement('div');
  detTitle.textContent = '🔍 Detection';
  detTitle.style.cssText = 'font-weight:bold;margin-bottom:6px;';
  panel.appendChild(detTitle);

  addSliderRow(panel, 'Min area', CONFIG.minContourArea, 50, 3000, 50, v => {
    CONFIG.minContourArea = v; debouncedSave();
  });

  addSliderRow(panel, 'Match tol.', CONFIG.stabilizerTolerance, 10, 200, 5, v => {
    CONFIG.stabilizerTolerance = v; debouncedSave();
  });

  addSliderRow(panel, 'Persist (f)', CONFIG.stabilizerFreezeFrames, 5, 120, 5, v => {
    CONFIG.stabilizerFreezeFrames = v; debouncedSave();
  });

  // ── Performance sub-section ──
  const perfTitle = document.createElement('div');
  perfTitle.textContent = '⚡ Performance';
  perfTitle.style.cssText = 'font-weight:bold;margin:8px 0 4px;font-size:12px;color:#fc6;';
  panel.appendChild(perfTitle);

  addSliderRow(panel, 'Det. scale', CONFIG.detectionScale * 100, 25, 100, 5, v => {
    CONFIG.detectionScale = v / 100; debouncedSave();
  });
  addSliderRow(panel, 'Det. skip', CONFIG.detectionInterval, 1, 6, 1, v => {
    CONFIG.detectionInterval = v; debouncedSave();
  });
  addSliderRow(panel, 'Dilate size', CONFIG.morphDilateSize, 0, 21, 2, v => {
    CONFIG.morphDilateSize = v; debouncedSave();
  });

  // ── Separator ──
  panel.appendChild(Object.assign(document.createElement('hr'), { style: { border: '0', borderTop: '1px solid #444', margin: '10px 0' } }));

  // ── Save / Load / Export / Import buttons ──
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';

  function mkBtn(text, color, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `padding:5px 10px;border:1px solid ${color};border-radius:5px;color:${color};background:transparent;cursor:pointer;font:11px monospace;`;
    b.onmouseenter = () => b.style.background = color + '22';
    b.onmouseleave = () => b.style.background = 'transparent';
    b.onclick = onClick;
    return b;
  }

  btnRow.appendChild(mkBtn('💾 Save', '#6cf', () => { saveCalibration(); flash('Saved!'); }));
  btnRow.appendChild(mkBtn('📂 Load', '#6cf', () => {
    if (loadCalibration()) { buildCalibrationUI(); flash('Loaded!'); }
    else flash('Nothing saved yet', '#f44');
  }));
  btnRow.appendChild(mkBtn('🗑 Reset', '#f44', () => {
    if (confirm('Reset all settings to defaults?')) {
      clearCalibration();
      location.reload();
    }
  }));
  btnRow.appendChild(mkBtn('⬇ Export', '#fc6', () => exportPreset()));

  // Import button (hidden file input)
  const importBtn = mkBtn('⬆ Import', '#fc6', () => fileInput.click());
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.json'; fileInput.style.display = 'none';
  fileInput.onchange = async () => {
    if (fileInput.files.length) {
      try {
        await importPreset(fileInput.files[0]);
        buildCalibrationUI();
        flash('Imported!');
      } catch (e) { flash('Import failed: ' + e.message, '#f44'); }
    }
    fileInput.value = '';
  };
  btnRow.appendChild(importBtn);
  btnRow.appendChild(fileInput);

  panel.appendChild(btnRow);

  // ── Flash message area ──
  const flashDiv = document.createElement('div');
  flashDiv.id = 'flashMsg';
  flashDiv.style.cssText = 'text-align:center;margin-top:8px;font-size:12px;min-height:16px;';
  panel.appendChild(flashDiv);
}

/** Show a temporary flash message in the panel */
function flash(msg, color = '#6f6') {
  const el = document.getElementById('flashMsg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2000);
}

/** Helper: add a labeled slider row */
function addSliderRow(parent, label, value, min, max, step, onChange) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;margin:3px 0;';
  const lbl = document.createElement('span');
  lbl.textContent = label;
  lbl.style.cssText = 'width:90px;font-size:11px;';
  const input = document.createElement('input');
  input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
  input.style.cssText = 'flex:1;accent-color:#6cf;';
  const val = document.createElement('span');
  val.textContent = value;
  val.style.cssText = 'width:38px;text-align:right;font-size:11px;font-weight:bold;margin-left:4px;';
  input.oninput = () => { val.textContent = input.value; onChange(Number(input.value)); };
  row.appendChild(lbl); row.appendChild(input); row.appendChild(val);
  parent.appendChild(row);
}

/**
 * Helper: add 4 rows of X/Y number inputs for a corner pin array.
 * Returns a refresh() function to sync the fields when the drag handles move.
 *
 * @param {HTMLElement} parent - Container to append rows to.
 * @param {() => Array<{x: number, y: number}>} getPoints - Getter returning the current 4-point array from CONFIG.
 * @param {string} accentColor - Accent color for labels.
 * @param {() => void} onChanged - Called after any field edit (should save + re-init handles).
 * @returns {{ refresh: () => void }} Call refresh() when drag handles update the points externally.
 */
function addCornerPinFields(parent, getPoints, accentColor, onChanged) {
  const cornerNames = ['Top-Left', 'Top-Right', 'Bot-Right', 'Bot-Left'];
  const inputs = [];
  const points = getPoints();

  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin:2px 0;';

    const lbl = document.createElement('span');
    lbl.textContent = `${i + 1} ${cornerNames[i]}`;
    lbl.style.cssText = `width:80px;font-size:10px;color:${accentColor};`;
    row.appendChild(lbl);

    const xInput = document.createElement('input');
    xInput.type = 'number'; xInput.step = '1';
    xInput.value = Math.round(points[i].x);
    xInput.style.cssText = 'width:52px;background:#222;border:1px solid #555;color:#fff;padding:2px 4px;border-radius:3px;font:11px monospace;';
    xInput.title = 'X';
    row.appendChild(xInput);

    const yInput = document.createElement('input');
    yInput.type = 'number'; yInput.step = '1';
    yInput.value = Math.round(points[i].y);
    yInput.style.cssText = 'width:52px;background:#222;border:1px solid #555;color:#fff;padding:2px 4px;border-radius:3px;font:11px monospace;';
    yInput.title = 'Y';
    row.appendChild(yInput);

    const idx = i;
    function commitField() {
      const pts = getPoints();
      pts[idx].x = Number(xInput.value) || 0;
      pts[idx].y = Number(yInput.value) || 0;
      onChanged();
    }
    xInput.onchange = commitField;
    yInput.onchange = commitField;

    inputs.push({ xInput, yInput });
    parent.appendChild(row);
  }

  return {
    refresh() {
      const pts = getPoints();
      for (let i = 0; i < 4; i++) {
        inputs[i].xInput.value = Math.round(pts[i].x);
        inputs[i].yInput.value = Math.round(pts[i].y);
      }
    }
  };
}

// Build initial UI
buildCalibrationUI();

// ═════════════════════════════════════════════
// Start system
// ═════════════════════════════════════════════
init().catch(err => {
  console.error('Init failed:', err);
  const errDiv = document.getElementById('cameraError');
  if (errDiv) {
    errDiv.textContent = 'Initialization failed: ' + (err && err.message ? err.message : err);
    errDiv.style.display = 'block';
  }
});
