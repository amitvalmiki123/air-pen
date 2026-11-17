/*
 * Air Pen
 *
 * Draw glowing lines on a black canvas. Two ways to drive the pen:
 *
 *   1. Mouse / touch / stylus  — works on any laptop, phone or TV browser.
 *   2. Camera + hand tracking  — hold Shift and move your finger in the air.
 *
 * A projector is optional: it only makes the canvas bigger. Everything is
 * plain static HTML/CSS/JS, so it runs from GitHub Pages, a local web server
 * or even a file:// URL (mouse mode only — browsers need https or localhost
 * before they hand out a camera).
 */

(() => {
  'use strict';

  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const modeBtn = document.getElementById('mode-btn');
  const clearBtn = document.getElementById('clear-btn');
  const fsBtn = document.getElementById('fs-btn');
  const toastEl = document.getElementById('toast');

  // Finished strokes live on this offscreen canvas, so each frame only has to
  // copy it and draw the stroke that is still in progress.
  const baseCanvas = document.createElement('canvas');
  const baseCtx = baseCanvas.getContext('2d');

  const PEN = {
    color: 'rgb(176, 225, 255)',
    width: 6,
    glow: 15,
    dotRadius: 6,
    minStep: 1.5, // px between recorded points
  };

  const HANDS_VERSION = '0.4.1675469240';
  const HANDS_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${HANDS_VERSION}/hands.js`;
  const HANDS_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${HANDS_VERSION}/`;

  const IDLE_MS = 4000;

  const state = {
    mode: 'pointer', // 'pointer' | 'camera'
    width: 0,
    height: 0,
    dpr: 1,
    strokes: [], // finished strokes, each an array of {x, y}
    activeStroke: null, // stroke currently being drawn
    shiftHeld: false,
    pointerDown: false,
    cursor: { x: 0, y: 0, source: null, visible: false },
    camera: { stream: null, hands: null, running: false, raf: 0 },
    needsRender: true,
    previewOn: true,
    uiHidden: false,
  };

  /* ------------------------------------------------------------------ *
   * Sizing
   * ------------------------------------------------------------------ */

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Keep what is already drawn in the same relative place.
    const oldWidth = state.width || width;
    const oldHeight = state.height || height;
    const scaleX = width / oldWidth;
    const scaleY = height / oldHeight;

    if (scaleX !== 1 || scaleY !== 1) {
      for (const stroke of state.strokes) {
        for (const point of stroke) {
          point.x *= scaleX;
          point.y *= scaleY;
        }
      }
      if (state.activeStroke) {
        for (const point of state.activeStroke) {
          point.x *= scaleX;
          point.y *= scaleY;
        }
      }
      if (state.cursor.visible) {
        state.cursor.x *= scaleX;
        state.cursor.y *= scaleY;
      }
    }

    state.width = width;
    state.height = height;
    state.dpr = dpr;

    for (const surface of [canvas, baseCanvas]) {
      surface.width = Math.max(1, Math.round(width * dpr));
      surface.height = Math.max(1, Math.round(height * dpr));
    }

    // Draw in CSS pixels; the transform handles high-DPI screens.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    rebuildBase();
    requestRender();
  }

  /* ------------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------------ */

  function configureStyle(c) {
    c.shadowColor = PEN.color;
    c.shadowBlur = PEN.glow;
    c.strokeStyle = PEN.color;
    c.fillStyle = PEN.color;
    c.lineWidth = PEN.width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
  }

  function drawStroke(c, points) {
    if (!points.length) return;

    configureStyle(c);

    if (points.length === 1) {
      c.beginPath();
      c.arc(points[0].x, points[0].y, PEN.width / 2, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      return;
    }

    c.beginPath();
    c.moveTo(points[0].x, points[0].y);

    // Quadratic curves through the midpoints keep the line smooth and soft.
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      c.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }

    const last = points[points.length - 1];
    c.lineTo(last.x, last.y);
    c.stroke();
    c.shadowBlur = 0;
  }

  function clearSurface(c, surface) {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, surface.width, surface.height);
    c.restore();
  }

  function rebuildBase() {
    clearSurface(baseCtx, baseCanvas);
    for (const stroke of state.strokes) drawStroke(baseCtx, stroke);
  }

  function drawCursor(c) {
    if (!state.cursor.visible) return;
    const active = state.shiftHeld || state.pointerDown;

    c.save();
    c.beginPath();
    c.arc(state.cursor.x, state.cursor.y, PEN.dotRadius, 0, Math.PI * 2);
    c.shadowColor = PEN.color;
    c.shadowBlur = PEN.glow;
    c.fillStyle = active ? '#FFFFFF' : PEN.color;
    c.fill();
    c.restore();
  }

  function render() {
    state.needsRender = false;

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, state.width, state.height);

    if (baseCanvas.width > 0) {
      ctx.drawImage(baseCanvas, 0, 0, state.width, state.height);
    }

    if (state.activeStroke) drawStroke(ctx, state.activeStroke);
    drawCursor(ctx);
  }

  function requestRender() {
    state.needsRender = true;
  }

  function tick() {
    if (state.needsRender) render();
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ *
   * Strokes
   * ------------------------------------------------------------------ */

  function extendStroke() {
    const cursor = state.cursor;
    if (!cursor.visible) return;

    if (!state.activeStroke) state.activeStroke = [];

    const points = state.activeStroke;
    const last = points[points.length - 1];

    if (last && Math.hypot(cursor.x - last.x, cursor.y - last.y) < PEN.minStep) {
      return;
    }

    points.push({ x: cursor.x, y: cursor.y });
    requestRender();
  }

  function commitStroke() {
    const stroke = state.activeStroke;
    state.activeStroke = null;

    if (stroke && stroke.length) {
      state.strokes.push(stroke);
      drawStroke(baseCtx, stroke);
    }

    requestRender();
  }

  function clearAll() {
    state.strokes = [];
    state.activeStroke = null;
    rebuildBase();
    requestRender();
  }

  /* ------------------------------------------------------------------ *
   * Cursor
   * ------------------------------------------------------------------ */

  function updateCursor(x, y, source, smoothing) {
    const cursor = state.cursor;

    if (!cursor.visible || cursor.source !== source) {
      cursor.x = x;
      cursor.y = y;
      cursor.source = source;
      cursor.visible = true;
    } else {
      cursor.x += (x - cursor.x) * smoothing;
      cursor.y += (y - cursor.y) * smoothing;
    }

    requestRender();
  }

  function hideCursor() {
    state.cursor.visible = false;
    state.cursor.source = null;
    requestRender();
  }

  /* ------------------------------------------------------------------ *
   * Mouse / touch / stylus
   * ------------------------------------------------------------------ */

  function onPointerMove(event) {
    if (state.mode !== 'pointer') return;

    // Direct 1:1 movement feels right for a mouse; the browser already
    // coalesces events for smooth lines.
    updateCursor(event.clientX, event.clientY, 'pointer', 1);

    if (state.pointerDown || state.shiftHeld) extendStroke();
  }

  function onPointerDown(event) {
    if (state.mode !== 'pointer') return;
    // Right / middle click should not draw.
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (err) {
        /* capture is a nicety, not a requirement */
      }
    }

    state.pointerDown = true;
    updateCursor(event.clientX, event.clientY, 'pointer', 1);
    extendStroke();
  }

  function onPointerUp() {
    if (!state.pointerDown) return;
    state.pointerDown = false;
    commitStroke();
  }

  function onPointerLeave(event) {
    if (event.pointerType !== 'mouse') return;
    if (state.pointerDown) {
      state.pointerDown = false;
      commitStroke();
    }
    if (!state.shiftHeld) hideCursor();
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  /* ------------------------------------------------------------------ *
   * Camera + hand tracking
   * ------------------------------------------------------------------ */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Hand tracking could not be downloaded. Check your connection.'));
      document.head.appendChild(script);
    });
  }

  function onHandResults(results) {
    const hands = results.multiHandLandmarks;

    if (!hands || !hands.length) {
      if (state.activeStroke) commitStroke();
      hideCursor();
      return;
    }

    // Landmark 8 is the tip of the index finger.
    const tip = hands[0][8];
    updateCursor(tip.x * state.width, tip.y * state.height, 'hand', 0.45);

    if (state.shiftHeld) extendStroke();
    else if (state.activeStroke) commitStroke();
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser has no camera access here. Use https, localhost, or mouse mode.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    state.camera.stream = stream;
    video.srcObject = stream;
    await video.play();

    await loadScript(HANDS_CDN);
    if (typeof window.Hands === 'undefined') {
      throw new Error('Hand tracking did not start. Check your connection.');
    }

    const hands = new window.Hands({ locateFile: (file) => `${HANDS_BASE}${file}` });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    hands.onResults(onHandResults);
    state.camera.hands = hands;
    state.camera.running = true;

    const pump = async () => {
      if (!state.camera.running) return;
      if (video.readyState >= 2) {
        try {
          await hands.send({ image: video });
        } catch (err) {
          console.warn('Air Pen: skipping a hand-tracking frame', err);
        }
      }
      if (state.camera.running) state.camera.raf = requestAnimationFrame(pump);
    };

    pump();
  }

  function stopCamera() {
    state.camera.running = false;
    if (state.camera.raf) cancelAnimationFrame(state.camera.raf);
    state.camera.raf = 0;

    if (state.camera.hands) {
      try {
        state.camera.hands.close();
      } catch (err) {
        /* already closed */
      }
      state.camera.hands = null;
    }

    if (state.camera.stream) {
      for (const track of state.camera.stream.getTracks()) track.stop();
      state.camera.stream = null;
    }

    video.srcObject = null;
    hideCursor();
  }

  /* ------------------------------------------------------------------ *
   * Modes
   * ------------------------------------------------------------------ */

  let switching = false;

  async function setMode(mode) {
    if (mode === state.mode || switching) return;
    switching = true;

    commitStroke();

    if (mode === 'camera') {
      // The mouse dot would otherwise freeze at its last position.
      hideCursor();
      state.mode = 'camera';
      document.body.classList.remove('pointer-mode');
      document.body.classList.add('camera-mode');
      paintMode();

      try {
        await startCamera();
        showToast('Camera on — hold Shift and move your finger');
      } catch (err) {
        console.error('Air Pen camera failed:', err);
        stopCamera();
        state.mode = 'pointer';
        document.body.classList.remove('camera-mode');
        document.body.classList.add('pointer-mode');
        paintMode();
        showToast(err && err.message ? err.message : 'Camera unavailable — using mouse / touch.', 5000);
      }
    } else {
      stopCamera();
      state.mode = 'pointer';
      document.body.classList.remove('camera-mode');
      document.body.classList.add('pointer-mode');
      paintMode();
      showToast('Mouse / touch mode — drag, or hold Shift and move', 3200);
    }

    switching = false;
    requestRender();
  }

  function toggleMode() {
    setMode(state.mode === 'pointer' ? 'camera' : 'pointer');
  }

  function paintMode() {
    const camera = state.mode === 'camera';
    modeBtn.textContent = camera ? '🎥 Camera' : '🖱️ Mouse / Touch';
    modeBtn.setAttribute('aria-pressed', String(camera));
    modeBtn.title = camera
      ? 'Switch to mouse/touch drawing (M)'
      : 'Switch to webcam hand tracking (M)';
  }

  /* ------------------------------------------------------------------ *
   * Interface helpers
   * ------------------------------------------------------------------ */

  let toastTimer = 0;

  function showToast(message, duration = 2600) {
    if (!message) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Air Pen: fullscreen failed', err);
      showToast('This browser would not go fullscreen.');
    }
  }

  function toggleUi() {
    state.uiHidden = !state.uiHidden;
    document.body.classList.toggle('ui-hidden', state.uiHidden);
    if (!state.uiHidden) markActive();
  }

  function togglePreview() {
    if (state.mode !== 'camera') return;
    state.previewOn = !state.previewOn;
    document.body.classList.toggle('preview-on', state.previewOn);
    showToast(state.previewOn ? 'Camera preview on' : 'Camera preview off');
  }

  let idleTimer = 0;
  let lastActivity = 0;

  // Dim the toolbar and hint after a few quiet seconds so the canvas stays
  // clean when the laptop is plugged into a TV. Throttled: pointermove can
  // fire hundreds of times a second.
  function markActive() {
    const now = Date.now();
    if (now - lastActivity < 400) return;
    lastActivity = now;

    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!state.uiHidden) document.body.classList.add('idle');
    }, IDLE_MS);
  }

  /* ------------------------------------------------------------------ *
   * Keyboard
   * ------------------------------------------------------------------ */

  window.addEventListener('keydown', (event) => {
    markActive();

    if (event.key === 'Shift') {
      state.shiftHeld = true;
      if (state.mode === 'pointer' && state.cursor.visible) extendStroke();
      requestRender();
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      clearAll();
      return;
    }

    if (event.repeat) return;

    switch (event.key.toLowerCase()) {
      case 'f':
        toggleFullscreen();
        break;
      case 'm':
        toggleMode();
        break;
      case 'h':
        toggleUi();
        break;
      case 'v':
        togglePreview();
        break;
      default:
        break;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.key !== 'Shift') return;
    state.shiftHeld = false;
    commitStroke();
    requestRender();
  });

  window.addEventListener('blur', () => {
    state.shiftHeld = false;
    state.pointerDown = false;
    commitStroke();
  });

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */

  modeBtn.addEventListener('click', () => {
    toggleMode();
    modeBtn.blur();
  });

  clearBtn.addEventListener('click', () => {
    clearAll();
    showToast('Canvas cleared', 1400);
    clearBtn.blur();
  });

  fsBtn.addEventListener('click', () => {
    toggleFullscreen();
    fsBtn.blur();
  });

  window.addEventListener('pointermove', markActive, { passive: true });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.shiftHeld = false;
      state.pointerDown = false;
      commitStroke();
    }
  });

  resize();
  paintMode();
  markActive();
  requestAnimationFrame(tick);

  // ?mode=camera opens straight into hand tracking (handy for a projector).
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'camera') {
    setMode('camera');
  } else {
    showToast('Drag to draw — or hold Shift and move the mouse', 4000);
  }
})();
