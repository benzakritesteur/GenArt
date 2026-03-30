/**
 * Main entry point for GenArt real-time projection mapping system.
 * Orchestrates camera, OpenCV, physics, and UI modules.
 */
import { initCamera, captureFrame } from './modules/camera.js';
import { detectColorMasks, findContours } from './modules/colorDetection.js';
import { processContours, drawDebugOverlay } from './modules/contourProcessor.js';
import { buildPerspectiveTransform, warpPoints, initCornerPinUI } from './modules/cornerPin.js';
import { stabilizeObjects } from './modules/stabilizer.js';
import { initPhysics, syncPhysicsBodies, spawnDynamicBody, cleanupDynamicBodies, getDynamicBodyCount, getDynamicBodies } from './modules/physicsEngine.js';
import { CONFIG } from './config.js';
import { createFPSMonitor } from './modules/utils.js';
import { saveCalibration, loadCalibration, clearCalibration, exportPreset, importPreset } from './modules/storage.js';
import { PluginManager } from './modules/pluginSystem.js';
import { initWebGL, uploadVideoFrame, renderMaskOverlay, renderParticles, clearWebGL, destroyWebGL } from './modules/webglRenderer.js';
import collisionSparkPlugin from './plugins/collisionSpark.js';
import trailEffectPlugin from './plugins/trailEffect.js';

// ─── DOM elements ───
const video = document.getElementById('video');
const captureCanvas = document.getElementById('captureCanvas');
const debugCanvas = document.getElementById('debugCanvas');
const physicsCanvas = document.getElementById('physicsCanvas');
const webglCanvas = document.getElementById('webglCanvas');
const debugCtx = debugCanvas.getContext('2d');
// Create capture context once with willReadFrequently for cv.imread performance
const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });

let showDebug = true;
let currentTransformMat = null;
const bodyRegistry = new Map();
let physics = null;
let fpsTick = null;
let spawnTimerId = null;

// ── Plugin system ──
const pluginManager = new PluginManager();

// ── WebGL renderer ──
let webglRenderer = null;

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
  // Load saved calibration first
  loadCalibration();

  await waitForOpenCvReady();
  await initCamera(video);
  physics = initPhysics(physicsCanvas);

  // Force transparent background on physicsCanvas (in case Matter.js overrides it)
  physicsCanvas.style.background = 'transparent';

  // Canvas internal resolution
  [captureCanvas, debugCanvas, physicsCanvas, webglCanvas].forEach(c => {
    c.width = CONFIG.canvasWidth;
    c.height = CONFIG.canvasHeight;
  });

  // Make canvases fill the viewport via CSS
  function resizeToViewport() {
    const vw = window.innerWidth + 'px';
    const vh = window.innerHeight + 'px';
    [physicsCanvas, debugCanvas, webglCanvas].forEach(c => {
      c.style.width = vw;
      c.style.height = vh;
    });
  }
  resizeToViewport();
  window.addEventListener('resize', resizeToViewport);

  // FPS HUD
  fpsTick = createFPSMonitor(document.body);

  // Perspective transform
  const canvasCorners = [
    { x: 0, y: 0 },
    { x: CONFIG.canvasWidth, y: 0 },
    { x: CONFIG.canvasWidth, y: CONFIG.canvasHeight },
    { x: 0, y: CONFIG.canvasHeight }
  ];
  currentTransformMat = buildPerspectiveTransform(CONFIG.cornerPin, canvasCorners);

  initCornerPinUI(debugCanvas, newCorners => {
    if (currentTransformMat) currentTransformMat.delete();
    currentTransformMat = buildPerspectiveTransform(newCorners, canvasCorners);
    CONFIG.cornerPin = newCorners.map(p => ({ ...p }));
    debouncedSave();
  });

  // Debug toggle (D key)
  window.addEventListener('keydown', e => {
    if (e.key === 'd' || e.key === 'D') {
      showDebug = !showDebug;
      debugCanvas.style.display = showDebug ? 'block' : 'none';
    }
  });
  debugCanvas.style.display = showDebug ? 'block' : 'none';

  // Click / tap to spawn dynamic body
  physicsCanvas.style.pointerEvents = 'auto';
  function spawnAtPointer(px, py) {
    const rect = physicsCanvas.getBoundingClientRect();
    const scaleX = CONFIG.canvasWidth / rect.width;
    const scaleY = CONFIG.canvasHeight / rect.height;
    spawnDynamicBody(physics.world, (px - rect.left) * scaleX, (py - rect.top) * scaleY);
  }
  physicsCanvas.addEventListener('click', e => spawnAtPointer(e.clientX, e.clientY));
  physicsCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    spawnAtPointer(t.clientX, t.clientY);
  }, { passive: false });

  // Auto-spawn timer
  startAutoSpawn();

  // ── Register plugins ──
  const pluginCtx = { engine: physics.engine };
  // Wrap init/destroy to receive engine context
  const wrapPlugin = (p) => ({
    ...p,
    init: () => p.hooks.onInit?.(pluginCtx),
    destroy: () => p.hooks.onDestroy?.(pluginCtx),
  });
  pluginManager.register(wrapPlugin(collisionSparkPlugin));
  pluginManager.register(wrapPlugin(trailEffectPlugin));
  // Restore enabled state from config
  for (const p of pluginManager.list()) {
    pluginManager.toggle(p.name, CONFIG.enabledPlugins.includes(p.name));
  }

  // ── WebGL init ──
  applyWebGLMode();

  // ── Cleanup on page unload ──
  window.addEventListener('beforeunload', () => {
    pluginManager.run('onDestroy', pluginCtx);
    if (webglRenderer) { destroyWebGL(webglRenderer); webglRenderer = null; }
  });

  // Rebuild UI to reflect plugin state
  buildCalibrationUI();

  requestAnimationFrame(mainLoop);
}

// ── Auto-spawn ──
function startAutoSpawn() {
  stopAutoSpawn();
  if (CONFIG.autoSpawnEnabled && physics) {
    spawnTimerId = setInterval(() => {
      const x = Math.random() * CONFIG.canvasWidth;
      spawnDynamicBody(physics.world, x, 10);
    }, CONFIG.spawnInterval);
  }
}
function stopAutoSpawn() {
  if (spawnTimerId) { clearInterval(spawnTimerId); spawnTimerId = null; }
}

// ── WebGL mode toggling ──
function applyWebGLMode() {
  if (CONFIG.useWebGL) {
    try {
      if (!webglRenderer) webglRenderer = initWebGL(webglCanvas);
      webglCanvas.style.display = 'block';
      // Hide Matter.js renderer, keep engine running
      if (physics?.render) Matter.Render.stop(physics.render);
      physicsCanvas.style.display = 'none';
    } catch (e) {
      console.warn('[WebGL] Fallback to Canvas2D:', e.message);
      CONFIG.useWebGL = false;
      webglCanvas.style.display = 'none';
      physicsCanvas.style.display = 'block';
      if (physics?.render) Matter.Render.run(physics.render);
    }
  } else {
    if (webglRenderer) { destroyWebGL(webglRenderer); webglRenderer = null; }
    webglCanvas.style.display = 'none';
    physicsCanvas.style.display = 'block';
    if (physics?.render) Matter.Render.run(physics.render);
  }
}

// ═════════════════════════════════════════════
// Main Loop — multi-color detection
// ═════════════════════════════════════════════
let cleanupCounter = 0;

function mainLoop() {
  if (fpsTick) fpsTick();

  // Plugin hook: before frame
  pluginManager.run('onBeforeFrame', { video, captureCanvas });

  // 1. Capture frame — skip if video not ready
  if (video.readyState < 2) {
    requestAnimationFrame(mainLoop);
    return;
  }
  captureFrame(video, captureCanvas, captureCtx);

  let src = null;
  try {
    src = cv.imread(captureCanvas);

    // 2. Detect masks for all color profiles
    const masksInfo = detectColorMasks(src, CONFIG.colorProfiles);

    // 3. Process each mask
    let allDetections = [];
    for (const { profileIndex, mask } of masksInfo) {
      const profile = CONFIG.colorProfiles[profileIndex];
      const contours = findContours(mask);
      const detected = processContours(contours);

      // 4. Warp + tag with profile info
      for (const obj of detected) {
        const warpedCorners = warpPoints(obj.corners, currentTransformMat);
        // Recompute center, size, angle from warped corners (canvas-space)
        const cx = warpedCorners.reduce((s, p) => s + p.x, 0) / 4;
        const cy = warpedCorners.reduce((s, p) => s + p.y, 0) / 4;
        const edgeLen = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        const w = edgeLen(warpedCorners[0], warpedCorners[1]);
        const h = edgeLen(warpedCorners[1], warpedCorners[2]);
        const dx = warpedCorners[1].x - warpedCorners[0].x;
        const dy = warpedCorners[1].y - warpedCorners[0].y;
        const warpedAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        allDetections.push({
          center: { x: cx, y: cy },
          size: { width: w, height: h },
          angle: warpedAngle,
          corners: warpedCorners,
          profileIndex,
          profileName: profile.name,
          displayColor: profile.displayColor
        });
      }

      // Cleanup OpenCV mats
      mask.delete();
      contours.forEach(c => c.delete());
    }

    // Plugin hook: after detection
    pluginManager.run('onAfterDetection', { detections: allDetections });

    // 5. Stabilize
    const stabilized = stabilizeObjects(allDetections);

    // Propagate display info from detections to stabilized
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
      }
    }

    // Plugin hook: after stabilize
    pluginManager.run('onAfterStabilize', { stabilized });

    // 6. Sync physics
    syncPhysicsBodies(physics.world, stabilized, bodyRegistry);

    const dynamicBodies = getDynamicBodies();

    // Plugin hook: after physics sync
    pluginManager.run('onAfterPhysicsSync', { dynamicBodies, stabilized, world: physics.world });

    // 7. Rendering
    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

    if (CONFIG.useWebGL && webglRenderer) {
      // WebGL path: GPU mask overlay + particle rendering
      clearWebGL(webglRenderer);
      uploadVideoFrame(webglRenderer, video);
      for (const profile of CONFIG.colorProfiles) {
        renderMaskOverlay(webglRenderer, profile);
      }
      renderParticles(webglRenderer, dynamicBodies, CONFIG.canvasWidth, CONFIG.canvasHeight);
    }

    if (showDebug) drawDebugOverlay(debugCtx, stabilized);

    // Plugin hook: render (plugins draw on debug canvas)
    pluginManager.run('onRender', { ctx: debugCtx });

    // 8. Periodic cleanup of dynamic bodies
    if (++cleanupCounter % 60 === 0) {
      cleanupDynamicBodies(physics.world);
    }

    src.delete();
  } catch (err) {
    console.error('Main loop error:', err);
    if (src) try { src.delete(); } catch (_) {}
  }

  requestAnimationFrame(mainLoop);
}

// ═════════════════════════════════════════════
// Debounced save
// ═════════════════════════════════════════════
let saveTimer = null;
function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCalibration();
    pluginManager.run('onConfigChange', { CONFIG });
  }, 500);
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
  title.textContent = '🎨 GenArt Controls';
  title.style.cssText = 'font-weight:bold;font-size:15px;margin-bottom:10px;text-align:center;';
  panel.appendChild(title);

  // ── Color profiles tabs ──
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;align-items:center;';
  panel.appendChild(tabBar);

  const profileContainer = document.createElement('div');
  panel.appendChild(profileContainer);

  let activeTab = 0;

  function renderTabs() {
    tabBar.innerHTML = '';
    CONFIG.colorProfiles.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.textContent = p.name;
      btn.style.cssText = `padding:4px 10px;border:2px solid ${p.displayColor};border-radius:6px;cursor:pointer;
        font:12px monospace;color:#fff;background:${i === activeTab ? p.displayColor + '44' : 'transparent'};`;
      btn.onclick = () => { activeTab = i; renderTabs(); renderProfileSliders(i); };
      tabBar.appendChild(btn);
    });
    // Add profile button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.title = 'Add color profile';
    addBtn.style.cssText = 'padding:4px 8px;border:1px solid #6cf;border-radius:6px;cursor:pointer;font:bold 14px monospace;color:#6cf;background:transparent;';
    addBtn.onclick = () => {
      const colors = ['#f00', '#00f', '#ff0', '#0ff', '#f0f', '#fa0'];
      const names = ['Red', 'Blue', 'Yellow', 'Cyan', 'Magenta', 'Orange'];
      const idx = CONFIG.colorProfiles.length % colors.length;
      CONFIG.colorProfiles.push({
        name: names[idx], hueMin: 0, hueMax: 179,
        satMin: 80, satMax: 255, valMin: 80, valMax: 255,
        displayColor: colors[idx]
      });
      activeTab = CONFIG.colorProfiles.length - 1;
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

    // Profile name
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'margin-bottom:6px;display:flex;align-items:center;gap:6px;';
    const nameInput = document.createElement('input');
    nameInput.type = 'text'; nameInput.value = p.name;
    nameInput.style.cssText = 'width:80px;background:#333;border:1px solid #555;color:#fff;padding:2px 6px;border-radius:4px;font:12px monospace;';
    nameInput.oninput = () => { p.name = nameInput.value; renderTabs(); debouncedSave(); };
    nameRow.appendChild(nameInput);

    // Color picker
    const colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.value = p.displayColor;
    colorInput.style.cssText = 'width:30px;height:24px;border:none;cursor:pointer;';
    colorInput.oninput = () => { p.displayColor = colorInput.value; renderTabs(); debouncedSave(); };
    nameRow.appendChild(colorInput);

    // Remove button (only if more than one profile)
    if (CONFIG.colorProfiles.length > 1) {
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '✕';
      rmBtn.style.cssText = 'margin-left:auto;padding:2px 8px;border:1px solid #f44;border-radius:4px;color:#f44;background:transparent;cursor:pointer;font:bold 12px monospace;';
      rmBtn.onclick = () => {
        CONFIG.colorProfiles.splice(idx, 1);
        activeTab = Math.min(activeTab, CONFIG.colorProfiles.length - 1);
        renderTabs(); renderProfileSliders(activeTab); debouncedSave();
      };
      nameRow.appendChild(rmBtn);
    }
    profileContainer.appendChild(nameRow);

    // HSV sliders
    const sliders = [
      { key: 'hueMin', min: 0, max: 179, label: 'Hue Min' },
      { key: 'hueMax', min: 0, max: 179, label: 'Hue Max' },
      { key: 'satMin', min: 0, max: 255, label: 'Sat Min' },
      { key: 'satMax', min: 0, max: 255, label: 'Sat Max' },
      { key: 'valMin', min: 0, max: 255, label: 'Val Min' },
      { key: 'valMax', min: 0, max: 255, label: 'Val Max' },
    ];
    for (const s of sliders) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;margin:3px 0;';
      const lbl = document.createElement('span');
      lbl.textContent = s.label;
      lbl.style.cssText = 'width:62px;font-size:11px;';
      const input = document.createElement('input');
      input.type = 'range'; input.min = s.min; input.max = s.max; input.step = 1;
      input.value = p[s.key];
      input.style.cssText = 'flex:1;accent-color:' + p.displayColor + ';';
      const val = document.createElement('span');
      val.textContent = p[s.key];
      val.style.cssText = 'width:30px;text-align:right;font-size:11px;font-weight:bold;margin-left:4px;';
      input.oninput = () => { p[s.key] = Number(input.value); val.textContent = input.value; debouncedSave(); };
      row.appendChild(lbl); row.appendChild(input); row.appendChild(val);
      profileContainer.appendChild(row);
    }
  }

  renderTabs();
  renderProfileSliders(activeTab);

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

  // ── Separator ──
  panel.appendChild(Object.assign(document.createElement('hr'), { style: { border: '0', borderTop: '1px solid #444', margin: '10px 0' } }));

  // ── WebGL toggle ──
  const webglTitle = document.createElement('div');
  webglTitle.textContent = '⚡ Rendering';
  webglTitle.style.cssText = 'font-weight:bold;margin-bottom:6px;';
  panel.appendChild(webglTitle);

  const webglRow = document.createElement('div');
  webglRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  const webglCheck = document.createElement('input');
  webglCheck.type = 'checkbox'; webglCheck.checked = CONFIG.useWebGL;
  webglCheck.onchange = () => {
    CONFIG.useWebGL = webglCheck.checked;
    applyWebGLMode();
    pluginManager.run('onConfigChange', { key: 'useWebGL', value: CONFIG.useWebGL });
    debouncedSave();
  };
  webglRow.appendChild(webglCheck);
  const webglLbl = document.createElement('span');
  webglLbl.textContent = 'WebGL accelerated rendering';
  webglLbl.style.fontSize = '12px';
  webglRow.appendChild(webglLbl);
  panel.appendChild(webglRow);

  // ── Separator ──
  panel.appendChild(Object.assign(document.createElement('hr'), { style: { border: '0', borderTop: '1px solid #444', margin: '10px 0' } }));

  // ── Plugins ──
  const plugTitle = document.createElement('div');
  plugTitle.textContent = '🔌 Plugins';
  plugTitle.style.cssText = 'font-weight:bold;margin-bottom:6px;';
  panel.appendChild(plugTitle);

  for (const p of pluginManager.list()) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.checked = p.enabled;
    chk.onchange = () => {
      pluginManager.toggle(p.name, chk.checked);
      CONFIG.enabledPlugins = pluginManager.list().filter(x => x.enabled).map(x => x.name);
      debouncedSave();
    };
    row.appendChild(chk);
    const info = document.createElement('span');
    info.style.fontSize = '11px';
    info.innerHTML = `<b>${p.name}</b> <span style="color:#888">v${p.version}</span>`;
    if (p.description) info.innerHTML += ` — <span style="color:#aaa">${p.description}</span>`;
    row.appendChild(info);
    panel.appendChild(row);
  }

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
