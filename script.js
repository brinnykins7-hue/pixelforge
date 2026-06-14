/* ================================================
   PixelForge â€” Global State & Utilities
   Shared state object used by all modules
   ================================================ */

const State = {
  // Canvas dimensions (actual pixel art size)
  width: 32,
  height: 32,
  maxSize: 256,

  // Viewport / display
  zoom: 10,
  panX: 0,
  panY: 0,
  showGrid: true,
  gridSize: 1,

  // Tool state
  currentTool: 'pencil',
  brushSize: 1,
  filledShape: false,
  symmetryH: false,
  symmetryV: false,

  // Colors
  foregroundColor: { r: 0, g: 0, b: 0, a: 255 },
  backgroundColor: { r: 255, g: 255, b: 255, a: 255 },

  // Layers: array of layer objects
  // Each layer: { id, name, canvas, ctx, visible, opacity, blendMode, locked }
  layers: [],
  activeLayerIndex: 0,

  // Animation frames
  // Each frame: { id, layers: [...layerData], duration: 100 }
  frames: [],
  activeFrameIndex: 0,
  playing: false,
  fps: 12,
  onionSkinning: false,
  onionFrames: 1,

  // History
  history: [],
  historyIndex: -1,
  maxHistory: 50,

  // Selection
  selection: null, // { x, y, w, h, data: ImageData }
  clipboard: null,

  // UI state
  isPanning: false,
  isDrawing: false,
  lastSaveTime: 0,
  dirty: false,
  projectName: 'Untitled',

  // Layer ID counter
  _nextLayerId: 1,
  _nextFrameId: 1,

  nextLayerId() { return this._nextLayerId++; },
  nextFrameId() { return this._nextFrameId++; },
};

/* ---- Color Utilities ---- */
const ColorUtil = {
  rgbaToHex(r, g, b, a) {
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    if (a !== undefined && a < 255) {
      return hex + a.toString(16).padStart(2, '0');
    }
    return hex;
  },

  hexToRgba(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const r = parseInt(hex.substr(0, 2), 16) || 0;
    const g = parseInt(hex.substr(2, 2), 16) || 0;
    const b = parseInt(hex.substr(4, 2), 16) || 0;
    const a = hex.length >= 8 ? (parseInt(hex.substr(6, 2), 16) || 0) : 255;
    return { r, g, b, a };
  },

  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  },

  hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  },

  rgbaToCSS(c) {
    return `rgba(${c.r},${c.g},${c.b},${(c.a / 255).toFixed(3)})`;
  },

  equals(a, b) {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  },

  clone(c) {
    return { r: c.r, g: c.g, b: c.b, a: c.a };
  }
};

/* ---- Canvas Utilities ---- */
const CanvasUtil = {
  createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    return { canvas: c, ctx };
  },

  cloneCanvas(source) {
    const { canvas, ctx } = this.createCanvas(source.width, source.height);
    ctx.drawImage(source, 0, 0);
    return { canvas, ctx };
  },

  clearCanvas(ctx, w, h) {
    ctx.clearRect(0, 0, w || ctx.canvas.width, h || ctx.canvas.height);
  },

  getPixel(ctx, x, y) {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  },

  setPixel(ctx, x, y, color) {
    ctx.fillStyle = ColorUtil.rgbaToCSS(color);
    ctx.clearRect(x, y, 1, 1);
    ctx.fillRect(x, y, 1, 1);
  }
};

/* ---- Event Bus (pub/sub) ---- */
const EventBus = {
  _handlers: {},

  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  },

  off(event, handler) {
    if (!this._handlers[event]) return;
    this._handlers[event] = this._handlers[event].filter(h => h !== handler);
  },

  emit(event, data) {
    if (!this._handlers[event]) return;
    this._handlers[event].forEach(h => h(data));
  }
};

/* ---- Math / Geometry Utilities ---- */
const MathUtil = {
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

  // Bresenham's line algorithm - returns array of {x, y}
  linePoints(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      points.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return points;
  },

  // Rectangle outline points
  rectPoints(x0, y0, x1, y1) {
    const points = [];
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    for (let x = minX; x <= maxX; x++) { points.push({x, y: minY}); points.push({x, y: maxY}); }
    for (let y = minY + 1; y < maxY; y++) { points.push({x: minX, y}); points.push({x: maxX, y}); }
    return points;
  },

  // Filled rectangle points
  filledRectPoints(x0, y0, x1, y1) {
    const points = [];
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++)
        points.push({x, y});
    return points;
  },

  // Ellipse outline points (midpoint algorithm)
  ellipsePoints(cx, cy, rx, ry) {
    const points = [];
    if (rx <= 0 || ry <= 0) return points;
    const addSymmetric = (x, y) => {
      points.push({x: cx + x, y: cy + y});
      points.push({x: cx - x, y: cy + y});
      points.push({x: cx + x, y: cy - y});
      points.push({x: cx - x, y: cy - y});
    };
    let x = 0, y = ry;
    let rx2 = rx * rx, ry2 = ry * ry;
    let p = ry2 - rx2 * ry + 0.25 * rx2;
    while (2 * ry2 * x <= 2 * rx2 * y) {
      addSymmetric(x, y);
      x++;
      if (p < 0) { p += 2 * ry2 * x + ry2; }
      else { y--; p += 2 * ry2 * x - 2 * rx2 * y + ry2; }
    }
    p = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
    while (y >= 0) {
      addSymmetric(x, y);
      y--;
      if (p > 0) { p += rx2 - 2 * rx2 * y; }
      else { x++; p += 2 * ry2 * x - 2 * rx2 * y + rx2; }
    }
    return points;
  },

  // Filled ellipse points
  filledEllipsePoints(cx, cy, rx, ry) {
    const points = [];
    if (rx <= 0 || ry <= 0) return points;
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
          points.push({ x: cx + x, y: cy + y });
        }
      }
    }
    return points;
  },

  // Brush points (filled circle centered at x,y with given radius)
  brushPoints(x, y, size) {
    if (size <= 1) return [{ x, y }];
    const points = [];
    const r = Math.floor(size / 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          points.push({ x: x + dx, y: y + dy });
        }
      }
    }
    return points;
  }
};
/* ================================================
   PixelForge â€” Canvas Rendering Engine
   Manages display canvas, compositing, zoom, pan,
   grid rendering, onion skinning, and selection ants
   ================================================ */

window.Canvas = (function () {
  'use strict';

  /* ---- DOM References ---- */
  let viewport = null;   // #canvas-viewport
  let wrapper = null;    // #canvas-wrapper
  let displayCanvas = null;
  let displayCtx = null;

  /* ---- Compositing scratch canvases (reused every frame) ---- */
  let compCanvas = null; // full-size composite at 1:1
  let compCtx = null;

  /* ---- Preview overlay (used by Tools for shape previews) ---- */
  let previewCanvas = null;
  let previewCtx = null;

  /* ---- Marching ants state ---- */
  let antOffset = 0;
  let antAnimId = null;

  /* ---- Pan dragging state ---- */
  let isPanDragging = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;

  /* ---- Space-bar panning ---- */
  let spaceDown = false;

  /* ---- Zoom constants ---- */
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 64;
  const VIEWPORT_PADDING = 32; // px padding when fitting

  /* ================================================
     init() â€” Bootstrap the canvas system
     ================================================ */
  function init() {
    viewport = document.getElementById('canvas-viewport');
    wrapper = document.getElementById('canvas-wrapper');
    displayCanvas = document.getElementById('display-canvas');
    displayCtx = displayCanvas.getContext('2d');
    displayCtx.imageSmoothingEnabled = false;

    // Create 1:1 composite canvas (matches document size)
    const comp = CanvasUtil.createCanvas(State.width, State.height);
    compCanvas = comp.canvas;
    compCtx = comp.ctx;

    // Create preview overlay canvas (same document size)
    const pv = CanvasUtil.createCanvas(State.width, State.height);
    previewCanvas = pv.canvas;
    previewCtx = pv.ctx;

    // Attach event listeners
    _attachWheelListener();
    _attachPanListeners();
    _attachSpacebarListeners();
    _attachResizeObserver();

    // Listen for render events
    EventBus.on('render', render);

    // Fit canvas into viewport on first load
    zoomToFit();
    render();
  }

  /* ================================================
     render() â€” Full display redraw
     ================================================ */
  function render() {
    const w = State.width;
    const h = State.height;
    const z = State.zoom;

    // Resize display canvas to zoomed dimensions
    const dw = w * z;
    const dh = h * z;
    if (displayCanvas.width !== dw || displayCanvas.height !== dh) {
      displayCanvas.width = dw;
      displayCanvas.height = dh;
      displayCtx.imageSmoothingEnabled = false;
    }

    // Ensure composite canvas matches document size
    if (compCanvas.width !== w || compCanvas.height !== h) {
      compCanvas.width = w;
      compCanvas.height = h;
      compCtx.imageSmoothingEnabled = false;
    }

    displayCtx.clearRect(0, 0, dw, dh);

    // --- Onion skinning (behind current frame) ---
    if (State.onionSkinning && State.frames.length > 1) {
      _drawOnionSkin(dw, dh, z);
    }

    // --- Composite all visible layers at 1:1 ---
    compCtx.clearRect(0, 0, w, h);
    for (let i = 0; i < State.layers.length; i++) {
      const layer = State.layers[i];
      if (!layer.visible) continue;

      compCtx.save();
      compCtx.globalAlpha = (layer.opacity !== undefined ? layer.opacity : 100) / 100;
      compCtx.globalCompositeOperation = layer.blendMode || 'source-over';
      compCtx.drawImage(layer.canvas, 0, 0);
      compCtx.restore();
    }

    // Draw the preview overlay on top (shape tools use this)
    compCtx.save();
    compCtx.globalAlpha = 1;
    compCtx.globalCompositeOperation = 'source-over';
    compCtx.drawImage(previewCanvas, 0, 0);
    compCtx.restore();

    // Scale composite onto display canvas
    displayCtx.drawImage(compCanvas, 0, 0, w, h, 0, 0, dw, dh);

    // --- Pixel grid ---
    if (State.showGrid && z >= 4) {
      _drawGrid(dw, dh, z, w, h);
    }

    // --- Selection marching ants ---
    if (State.selection) {
      _drawSelectionAnts(z);
    }

    // --- Apply pan offset to wrapper ---
    _applyPan();
  }

  /* ================================================
     Onion skin rendering
     ================================================ */
  function _drawOnionSkin(dw, dh, z) {
    const frames = State.frames;
    const fi = State.activeFrameIndex;
    const skinCount = State.onionFrames || 1;

    // Previous frames â€” tinted red
    for (let d = 1; d <= skinCount; d++) {
      const idx = fi - d;
      if (idx < 0) break;
      const frameCanvas = compositeFrame(idx);
      displayCtx.save();
      displayCtx.globalAlpha = 0.25 / d;
      displayCtx.drawImage(frameCanvas, 0, 0, State.width, State.height, 0, 0, dw, dh);
      // Red tint overlay
      displayCtx.globalCompositeOperation = 'source-atop';
      displayCtx.fillStyle = 'rgba(255,60,60,0.35)';
      displayCtx.fillRect(0, 0, dw, dh);
      displayCtx.restore();
    }

    // Next frames â€” tinted blue
    for (let d = 1; d <= skinCount; d++) {
      const idx = fi + d;
      if (idx >= frames.length) break;
      const frameCanvas = compositeFrame(idx);
      displayCtx.save();
      displayCtx.globalAlpha = 0.25 / d;
      displayCtx.drawImage(frameCanvas, 0, 0, State.width, State.height, 0, 0, dw, dh);
      displayCtx.globalCompositeOperation = 'source-atop';
      displayCtx.fillStyle = 'rgba(60,120,255,0.35)';
      displayCtx.fillRect(0, 0, dw, dh);
      displayCtx.restore();
    }
  }

  /* ================================================
     Grid rendering
     ================================================ */
  function _drawGrid(dw, dh, z, w, h) {
    displayCtx.save();

    // Fine grid (every pixel)
    displayCtx.strokeStyle = 'rgba(255,255,255,0.12)';
    displayCtx.lineWidth = 1;
    displayCtx.beginPath();
    for (let x = 1; x < w; x++) {
      const px = x * z + 0.5;
      displayCtx.moveTo(px, 0);
      displayCtx.lineTo(px, dh);
    }
    for (let y = 1; y < h; y++) {
      const py = y * z + 0.5;
      displayCtx.moveTo(0, py);
      displayCtx.lineTo(dw, py);
    }
    displayCtx.stroke();

    // Coarse grid (every gridSize pixels) â€” thicker if gridSize > 1
    if (State.gridSize > 1) {
      displayCtx.strokeStyle = 'rgba(255,255,255,0.28)';
      displayCtx.lineWidth = 1;
      displayCtx.beginPath();
      for (let x = State.gridSize; x < w; x += State.gridSize) {
        const px = x * z + 0.5;
        displayCtx.moveTo(px, 0);
        displayCtx.lineTo(px, dh);
      }
      for (let y = State.gridSize; y < h; y += State.gridSize) {
        const py = y * z + 0.5;
        displayCtx.moveTo(0, py);
        displayCtx.lineTo(dw, py);
      }
      displayCtx.stroke();
    }

    displayCtx.restore();
  }

  /* ================================================
     Selection marching ants
     ================================================ */
  function _drawSelectionAnts(z) {
    const sel = State.selection;
    if (!sel) return;

    const x = sel.x * z;
    const y = sel.y * z;
    const w = sel.w * z;
    const h = sel.h * z;

    displayCtx.save();
    displayCtx.strokeStyle = '#fff';
    displayCtx.lineWidth = 1;
    displayCtx.setLineDash([4, 4]);
    displayCtx.lineDashOffset = -antOffset;
    displayCtx.strokeRect(x + 0.5, y + 0.5, w, h);

    displayCtx.strokeStyle = '#000';
    displayCtx.lineDashOffset = -(antOffset + 4);
    displayCtx.strokeRect(x + 0.5, y + 0.5, w, h);
    displayCtx.restore();

    // Animate ants
    _startAntAnimation();
  }

  function _startAntAnimation() {
    if (antAnimId) return;
    function tick() {
      antOffset = (antOffset + 0.5) % 8;
      render();
      if (State.selection) {
        antAnimId = requestAnimationFrame(tick);
      } else {
        antAnimId = null;
      }
    }
    // Don't call tick directly here â€” we're already inside render.
    // Schedule first tick for next frame.
    antAnimId = requestAnimationFrame(tick);
  }

  function _stopAntAnimation() {
    if (antAnimId) {
      cancelAnimationFrame(antAnimId);
      antAnimId = null;
    }
    antOffset = 0;
  }

  /* ================================================
     Pan helpers
     ================================================ */
  function _applyPan() {
    if (!wrapper) return;
    wrapper.style.transform = `translate(${State.panX}px, ${State.panY}px)`;
  }

  /* ================================================
     Coordinate conversion
     ================================================ */
  function screenToPixel(screenX, screenY) {
    const rect = displayCanvas.getBoundingClientRect();
    const px = Math.floor((screenX - rect.left) / State.zoom);
    const py = Math.floor((screenY - rect.top) / State.zoom);
    return { x: px, y: py };
  }

  function pixelToScreen(px, py) {
    const rect = displayCanvas.getBoundingClientRect();
    return {
      x: rect.left + px * State.zoom,
      y: rect.top + py * State.zoom
    };
  }

  /* ================================================
     Zoom
     ================================================ */
  function setZoom(level, pivotScreenX, pivotScreenY) {
    const oldZoom = State.zoom;
    const newZoom = MathUtil.clamp(Math.round(level), MIN_ZOOM, MAX_ZOOM);
    if (newZoom === oldZoom) return;

    // If a pivot point is provided, adjust pan so that the pixel under the
    // cursor stays in the same screen position.
    if (pivotScreenX !== undefined && pivotScreenY !== undefined) {
      const vpW = viewport.clientWidth;
      const vpH = viewport.clientHeight;

      // Current offset of the canvas top-left relative to viewport
      const oldCX = (vpW - State.width * oldZoom) / 2 + State.panX;
      const oldCY = (vpH - State.height * oldZoom) / 2 + State.panY;

      // Pixel coordinate under cursor
      const pixX = (pivotScreenX - viewport.getBoundingClientRect().left - oldCX) / oldZoom;
      const pixY = (pivotScreenY - viewport.getBoundingClientRect().top - oldCY) / oldZoom;

      // New offset for that pixel to remain at same screen position
      const newCX = (vpW - State.width * newZoom) / 2;
      const newCY = (vpH - State.height * newZoom) / 2;

      State.panX = (pivotScreenX - viewport.getBoundingClientRect().left) - newCX - pixX * newZoom;
      State.panY = (pivotScreenY - viewport.getBoundingClientRect().top) - newCY - pixY * newZoom;
    }

    State.zoom = newZoom;
    _updateZoomStatus();
    render();
  }

  function zoomToFit() {
    if (!viewport) return;
    const vpW = viewport.clientWidth - VIEWPORT_PADDING * 2;
    const vpH = viewport.clientHeight - VIEWPORT_PADDING * 2;
    if (vpW <= 0 || vpH <= 0) {
      State.panX = 0;
      State.panY = 0;
      setTimeout(zoomToFit, 100);
      return;
    }

    const fitZoom = Math.max(1, Math.floor(Math.min(vpW / State.width, vpH / State.height)));
    State.zoom = MathUtil.clamp(fitZoom, MIN_ZOOM, MAX_ZOOM);
    State.panX = 0;
    State.panY = 0;
    _updateZoomStatus();
    render();
  }

  function setPan(x, y) {
    State.panX = x;
    State.panY = y;
    _applyPan();
  }

  function _updateZoomStatus() {
    const el = document.getElementById('status-zoom');
    if (el) el.textContent = `Zoom: ${State.zoom}x`;
  }

  /* ================================================
     Document resize
     ================================================ */
  function resizeDocument(newW, newH) {
    newW = MathUtil.clamp(newW, 1, State.maxSize);
    newH = MathUtil.clamp(newH, 1, State.maxSize);

    // Resize every layer canvas, preserving top-left content
    for (let i = 0; i < State.layers.length; i++) {
      const layer = State.layers[i];
      const old = layer.canvas;

      const { canvas, ctx } = CanvasUtil.createCanvas(newW, newH);
      ctx.drawImage(old, 0, 0); // copies as much as fits
      layer.canvas = canvas;
      layer.ctx = ctx;
    }

    State.width = newW;
    State.height = newH;

    // Resize composite & preview canvases
    compCanvas.width = newW;
    compCanvas.height = newH;
    compCtx.imageSmoothingEnabled = false;
    previewCanvas.width = newW;
    previewCanvas.height = newH;
    previewCtx.imageSmoothingEnabled = false;

    // Update status bar
    const sizeEl = document.getElementById('status-canvas-size');
    if (sizeEl) sizeEl.textContent = `${newW}Ã—${newH}`;

    // Clear selection (no longer valid)
    if (State.selection) {
      State.selection = null;
      _stopAntAnimation();
      EventBus.emit('selectionChanged');
    }

    zoomToFit();
    EventBus.emit('render');
    EventBus.emit('dirty');
  }

  /* ================================================
     compositeFrame(frameIndex)
     Composite a specific frame's layers into a
     single canvas and return it.
     ================================================ */
  function compositeFrame(frameIndex) {
    const frame = State.frames[frameIndex];
    if (!frame) return CanvasUtil.createCanvas(State.width, State.height).canvas;

    const { canvas, ctx } = CanvasUtil.createCanvas(State.width, State.height);

    // If this is the active frame, composite from live State.layers
    if (frameIndex === State.activeFrameIndex) {
      for (let i = 0; i < State.layers.length; i++) {
        const layer = State.layers[i];
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = (layer.opacity !== undefined ? layer.opacity : 100) / 100;
        ctx.globalCompositeOperation = layer.blendMode || 'source-over';
        ctx.drawImage(layer.canvas, 0, 0);
        ctx.restore();
      }
    } else {
      // Deserialise frame layer data and composite
      const layersData = frame.layers;
      if (!layersData) return canvas;

      for (let i = 0; i < layersData.length; i++) {
        const ld = layersData[i];
        if (!ld.visible) continue;
        ctx.save();
        ctx.globalAlpha = (ld.opacity !== undefined ? ld.opacity : 100) / 100;
        ctx.globalCompositeOperation = ld.blendMode || 'source-over';

        // Layer data stores an ImageData or a canvas reference
        if (ld.imageData) {
          // Temporary canvas to draw ImageData
          const tmp = CanvasUtil.createCanvas(State.width, State.height);
          tmp.ctx.putImageData(ld.imageData, 0, 0);
          ctx.drawImage(tmp.canvas, 0, 0);
        } else if (ld.canvas) {
          ctx.drawImage(ld.canvas, 0, 0);
        }
        ctx.restore();
      }
    }

    return canvas;
  }

  /* ================================================
     Preview canvas accessors (used by Tools)
     ================================================ */
  function getPreviewCanvas() { return previewCanvas; }
  function getPreviewCtx() { return previewCtx; }
  function clearPreview() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }

  /* ================================================
     Composite canvas accessor (for eyedropper etc.)
     ================================================ */
  function getCompositeCtx() { return compCtx; }

  /* ================================================
     Event: Mouse wheel zoom
     ================================================ */
  function _attachWheelListener() {
    viewport.addEventListener('wheel', function (e) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;

      // Determine new zoom â€” scale faster at higher zoom levels
      let step = 1;
      if (State.zoom >= 16) step = 2;
      if (State.zoom >= 32) step = 4;

      setZoom(State.zoom + delta * step, e.clientX, e.clientY);
    }, { passive: false });
  }

  /* ================================================
     Event: Middle mouse button & space+drag panning
     ================================================ */
  function _attachPanListeners() {
    viewport.addEventListener('mousedown', function (e) {
      // Middle button (button 1) starts pan
      if (e.button === 1 || (spaceDown && e.button === 0)) {
        e.preventDefault();
        isPanDragging = true;
        State.isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = State.panX;
        panOriginY = State.panY;
        viewport.classList.add('cursor-grabbing');
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (!isPanDragging) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      State.panX = panOriginX + dx;
      State.panY = panOriginY + dy;
      _applyPan();
    });

    window.addEventListener('mouseup', function (e) {
      if (isPanDragging && (e.button === 1 || e.button === 0)) {
        isPanDragging = false;
        State.isPanning = false;
        viewport.classList.remove('cursor-grabbing');
      }
    });

    // Prevent middle-click scroll behaviour
    viewport.addEventListener('auxclick', function (e) {
      if (e.button === 1) e.preventDefault();
    });
  }

  function _attachSpacebarListeners() {
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !e.repeat) {
        // Don't interfere with text inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        spaceDown = true;
        viewport.classList.add('cursor-grab');
      }
    });

    window.addEventListener('keyup', function (e) {
      if (e.code === 'Space') {
        spaceDown = false;
        if (!isPanDragging) {
          viewport.classList.remove('cursor-grab');
        }
      }
    });
  }

  /* ================================================
     Resize observer â€” re-center when viewport resizes
     ================================================ */
  function _attachResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(function () {
      _applyPan();
    });
    ro.observe(viewport);
  }

  /* ================================================
     Public API
     ================================================ */
  return {
    init: init,
    render: render,
    screenToPixel: screenToPixel,
    pixelToScreen: pixelToScreen,
    setZoom: setZoom,
    zoomToFit: zoomToFit,
    setPan: setPan,
    resizeDocument: resizeDocument,
    compositeFrame: compositeFrame,
    getPreviewCanvas: getPreviewCanvas,
    getPreviewCtx: getPreviewCtx,
    clearPreview: clearPreview,
    getCompositeCtx: getCompositeCtx,

    /** True when the user is currently space-dragging or middle-mouse dragging */
    get isPanning() { return isPanDragging; }
  };
})();
/* ================================================
   PixelForge â€” Drawing Tools
   All interactive tools: pencil, eraser, line,
   rectangle, ellipse, fill, eyedropper, selection,
   and move.
   ================================================ */

window.Tools = (function () {
  'use strict';

  /* ---- DOM references ---- */
  let viewport = null;

  /* ---- Drawing state ---- */
  let isDrawing = false;
  let startPixel = null;   // { x, y } at mousedown
  let lastPixel = null;    // last interpolated point
  let mouseButton = 0;     // 0 = left, 2 = right
  let shiftHeld = false;

  /* ---- Pre-stroke snapshot for undo ---- */
  let undoSnapshot = null; // ImageData of active layer before stroke

  /* ---- Selection move state ---- */
  let selMoving = false;
  let selMoveStart = null; // { x, y } screen coords at drag start
  let selOrigRect = null;  // original selection rect copy

  /* ---- Move tool state ---- */
  let moveSnapshot = null; // ImageData snapshot
  let moveOffsetX = 0;
  let moveOffsetY = 0;
  let moveStartPx = null;

  /* ---- Tool cursors (CSS class names) ---- */
  const TOOL_CURSORS = {
    pencil: 'cursor-crosshair',
    eraser: 'cursor-crosshair',
    line: 'cursor-crosshair',
    rect: 'cursor-crosshair',
    ellipse: 'cursor-crosshair',
    fill: 'cursor-crosshair',
    eyedropper: 'cursor-eyedropper',
    selection: 'cursor-crosshair',
    move: 'cursor-move'
  };

  /* ---- Readable names for status bar ---- */
  const TOOL_NAMES = {
    pencil: 'Pencil',
    eraser: 'Eraser',
    line: 'Line',
    rect: 'Rectangle',
    ellipse: 'Ellipse',
    fill: 'Fill',
    eyedropper: 'Eyedropper',
    selection: 'Selection',
    move: 'Move'
  };

  /* ================================================
     init()
     ================================================ */
  function init() {
    viewport = document.getElementById('canvas-viewport');

    _attachCanvasListeners();
    _attachToolButtons();
    _attachBrushSizeSlider();
    _attachFilledToggle();
    _attachSymmetryButtons();

    // Track shift key globally
    window.addEventListener('keydown', function (e) { shiftHeld = e.shiftKey; });
    window.addEventListener('keyup', function (e) { shiftHeld = e.shiftKey; });
  }

  /* ================================================
     setTool(name)
     ================================================ */
  function setTool(name) {
    if (!TOOL_NAMES[name]) return;

    State.currentTool = name;

    // Update active class on tool buttons
    document.querySelectorAll('.tool-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tool === name);
    });

    // Show/hide shape fill control for rect and ellipse
    const shapeFillCtrl = document.getElementById('shape-fill-control');
    if (shapeFillCtrl) {
      shapeFillCtrl.style.display = (name === 'rect' || name === 'ellipse') ? '' : 'none';
    }

    // Update status bar
    const statusTool = document.getElementById('status-tool');
    if (statusTool) statusTool.textContent = TOOL_NAMES[name];

    // Update viewport cursor class
    _applyCursorClass(name);

    EventBus.emit('toolChanged', name);
  }

  function _applyCursorClass(toolName) {
    // Remove all cursor classes
    Object.values(TOOL_CURSORS).forEach(function (cls) {
      viewport.classList.remove(cls);
    });
    const cls = TOOL_CURSORS[toolName];
    if (cls) viewport.classList.add(cls);
  }

  /* ================================================
     Canvas mouse event listeners
     ================================================ */
  function _attachCanvasListeners() {
    viewport.addEventListener('mousedown', _onMouseDown);
    viewport.addEventListener('mousemove', _onMouseMove);
    viewport.addEventListener('mouseup', _onMouseUp);
    viewport.addEventListener('mouseleave', _onMouseLeave);
    viewport.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ---- mousedown ---- */
  function _onMouseDown(e) {
    // Ignore if panning
    if (Canvas.isPanning || e.button === 1) return;

    // Ignore right-click for tools that don't use it
    if (e.button === 2 && State.currentTool !== 'eyedropper' &&
        State.currentTool !== 'pencil' && State.currentTool !== 'eraser' &&
        State.currentTool !== 'line' && State.currentTool !== 'rect' &&
        State.currentTool !== 'ellipse' && State.currentTool !== 'fill') {
      return;
    }

    mouseButton = e.button;
    const pixel = Canvas.screenToPixel(e.clientX, e.clientY);

    // Update cursor position status
    _updateCursorStatus(pixel);

    const tool = State.currentTool;

    // Check if active layer is locked
    const activeLayer = State.layers[State.activeLayerIndex];
    if (activeLayer && activeLayer.locked && tool !== 'eyedropper' && tool !== 'selection') {
      return;
    }

    isDrawing = true;
    State.isDrawing = true;
    startPixel = pixel;
    lastPixel = pixel;

    switch (tool) {
      case 'pencil':   _pencilStart(pixel); break;
      case 'eraser':   _eraserStart(pixel); break;
      case 'line':     _lineStart(pixel); break;
      case 'rect':     _rectStart(pixel); break;
      case 'ellipse':  _ellipseStart(pixel); break;
      case 'fill':     _fillStart(pixel); break;
      case 'eyedropper': _eyedropperPick(pixel, e); break;
      case 'selection':  _selectionStart(pixel, e); break;
      case 'move':     _moveStart(pixel); break;
    }
  }

  /* ---- mousemove ---- */
  function _onMouseMove(e) {
    const pixel = Canvas.screenToPixel(e.clientX, e.clientY);
    _updateCursorStatus(pixel);

    if (!isDrawing) return;

    const tool = State.currentTool;

    switch (tool) {
      case 'pencil':   _pencilMove(pixel); break;
      case 'eraser':   _eraserMove(pixel); break;
      case 'line':     _lineMove(pixel); break;
      case 'rect':     _rectMove(pixel, e); break;
      case 'ellipse':  _ellipseMove(pixel, e); break;
      case 'eyedropper': _eyedropperPick(pixel, e); break;
      case 'selection':  _selectionMove(pixel, e); break;
      case 'move':     _moveMove(pixel); break;
    }
  }

  /* ---- mouseup ---- */
  function _onMouseUp(e) {
    if (!isDrawing) return;

    const pixel = Canvas.screenToPixel(e.clientX, e.clientY);
    const tool = State.currentTool;

    switch (tool) {
      case 'pencil':   _pencilEnd(); break;
      case 'eraser':   _eraserEnd(); break;
      case 'line':     _lineEnd(pixel); break;
      case 'rect':     _rectEnd(pixel, e); break;
      case 'ellipse':  _ellipseEnd(pixel, e); break;
      case 'selection':  _selectionEnd(pixel); break;
      case 'move':     _moveEnd(); break;
    }

    isDrawing = false;
    State.isDrawing = false;
    Canvas.clearPreview();
    EventBus.emit('render');
  }

  /* ---- mouseleave ---- */
  function _onMouseLeave(e) {
    // Treat as mouseup if drawing
    if (isDrawing) _onMouseUp(e);
  }

  /* ---- Status bar cursor position ---- */
  function _updateCursorStatus(pixel) {
    const el = document.getElementById('status-cursor-pos');
    if (el) el.textContent = `${pixel.x}, ${pixel.y}`;
  }

  /* ================================================
     Helper: get draw color
     ================================================ */
  function _getDrawColor() {
    return mouseButton === 2
      ? ColorUtil.clone(State.backgroundColor)
      : ColorUtil.clone(State.foregroundColor);
  }

  /* ================================================
     Helper: save undo snapshot
     ================================================ */
  function _saveUndoSnapshot() {
    const layer = State.layers[State.activeLayerIndex];
    if (!layer) return;
    undoSnapshot = layer.ctx.getImageData(0, 0, State.width, State.height);
  }

  function _pushUndo(actionName) {
    if (!undoSnapshot) return;
    EventBus.emit('pushHistory', {
      name: actionName,
      layerIndex: State.activeLayerIndex,
      before: undoSnapshot
    });
    undoSnapshot = null;
  }

  /* ================================================
     Helper: bounds check
     ================================================ */
  function _inBounds(x, y) {
    return x >= 0 && x < State.width && y >= 0 && y < State.height;
  }

  /* ================================================
     Helper: draw points with symmetry
     Calls drawFn(x, y) for each symmetry variant.
     ================================================ */
  function _withSymmetry(points, drawFn) {
    const cx = State.width;
    const cy = State.height;
    const sh = State.symmetryH;
    const sv = State.symmetryV;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      drawFn(p.x, p.y);

      if (sh) {
        drawFn(cx - 1 - p.x, p.y);
      }
      if (sv) {
        drawFn(p.x, cy - 1 - p.y);
      }
      if (sh && sv) {
        drawFn(cx - 1 - p.x, cy - 1 - p.y);
      }
    }
  }

  /* ================================================
     Helper: draw a single pixel on active layer
     ================================================ */
  function _drawPixel(ctx, x, y, color) {
    if (!_inBounds(x, y)) return;
    ctx.clearRect(x, y, 1, 1);
    if (color.a > 0) {
      ctx.fillStyle = ColorUtil.rgbaToCSS(color);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  /* ================================================
     Helper: draw brush-sized stamp at a point
     ================================================ */
  function _drawBrushAt(ctx, px, py, color) {
    const brushPts = MathUtil.brushPoints(px, py, State.brushSize);
    for (let i = 0; i < brushPts.length; i++) {
      _drawPixel(ctx, brushPts[i].x, brushPts[i].y, color);
    }
  }

  /* ================================================
     Helper: erase brush-sized stamp at a point
     ================================================ */
  function _eraseBrushAt(ctx, px, py) {
    const brushPts = MathUtil.brushPoints(px, py, State.brushSize);
    for (let i = 0; i < brushPts.length; i++) {
      const b = brushPts[i];
      if (_inBounds(b.x, b.y)) {
        ctx.clearRect(b.x, b.y, 1, 1);
      }
    }
  }

  /* ================================================
     PENCIL TOOL
     ================================================ */
  function _pencilStart(pixel) {
    _saveUndoSnapshot();
    const ctx = State.layers[State.activeLayerIndex].ctx;
    const color = _getDrawColor();

    const pts = MathUtil.brushPoints(pixel.x, pixel.y, State.brushSize);
    _withSymmetry(pts, function (x, y) { _drawPixel(ctx, x, y, color); });

    EventBus.emit('render');
  }

  function _pencilMove(pixel) {
    const ctx = State.layers[State.activeLayerIndex].ctx;
    const color = _getDrawColor();

    // Interpolate from lastPixel to current pixel
    const linePoints = MathUtil.linePoints(lastPixel.x, lastPixel.y, pixel.x, pixel.y);
    for (let i = 0; i < linePoints.length; i++) {
      const lp = linePoints[i];
      const pts = MathUtil.brushPoints(lp.x, lp.y, State.brushSize);
      _withSymmetry(pts, function (x, y) { _drawPixel(ctx, x, y, color); });
    }

    lastPixel = pixel;
    EventBus.emit('render');
  }

  function _pencilEnd() {
    _pushUndo('Pencil');
    EventBus.emit('dirty');
  }

  /* ================================================
     ERASER TOOL
     ================================================ */
  function _eraserStart(pixel) {
    _saveUndoSnapshot();
    const ctx = State.layers[State.activeLayerIndex].ctx;

    const pts = MathUtil.brushPoints(pixel.x, pixel.y, State.brushSize);
    _withSymmetry(pts, function (x, y) {
      if (_inBounds(x, y)) ctx.clearRect(x, y, 1, 1);
    });

    EventBus.emit('render');
  }

  function _eraserMove(pixel) {
    const ctx = State.layers[State.activeLayerIndex].ctx;

    const linePoints = MathUtil.linePoints(lastPixel.x, lastPixel.y, pixel.x, pixel.y);
    for (let i = 0; i < linePoints.length; i++) {
      const lp = linePoints[i];
      const pts = MathUtil.brushPoints(lp.x, lp.y, State.brushSize);
      _withSymmetry(pts, function (x, y) {
        if (_inBounds(x, y)) ctx.clearRect(x, y, 1, 1);
      });
    }

    lastPixel = pixel;
    EventBus.emit('render');
  }

  function _eraserEnd() {
    _pushUndo('Eraser');
    EventBus.emit('dirty');
  }

  /* ================================================
     LINE TOOL
     ================================================ */
  function _lineStart(pixel) {
    _saveUndoSnapshot();
  }

  function _lineMove(pixel) {
    // Show preview on the overlay canvas
    const pvCtx = Canvas.getPreviewCtx();
    Canvas.clearPreview();

    const color = _getDrawColor();
    const linePoints = MathUtil.linePoints(startPixel.x, startPixel.y, pixel.x, pixel.y);
    for (let i = 0; i < linePoints.length; i++) {
      const lp = linePoints[i];
      const pts = MathUtil.brushPoints(lp.x, lp.y, State.brushSize);
      _withSymmetry(pts, function (x, y) { _drawPixel(pvCtx, x, y, color); });
    }

    EventBus.emit('render');
  }

  function _lineEnd(pixel) {
    Canvas.clearPreview();

    const ctx = State.layers[State.activeLayerIndex].ctx;
    const color = _getDrawColor();
    const linePoints = MathUtil.linePoints(startPixel.x, startPixel.y, pixel.x, pixel.y);

    for (let i = 0; i < linePoints.length; i++) {
      const lp = linePoints[i];
      const pts = MathUtil.brushPoints(lp.x, lp.y, State.brushSize);
      _withSymmetry(pts, function (x, y) { _drawPixel(ctx, x, y, color); });
    }

    _pushUndo('Line');
    EventBus.emit('dirty');
  }

  /* ================================================
     RECTANGLE TOOL
     ================================================ */
  function _rectStart(pixel) {
    _saveUndoSnapshot();
  }

  function _rectMove(pixel, e) {
    const pvCtx = Canvas.getPreviewCtx();
    Canvas.clearPreview();

    let ex = pixel.x;
    let ey = pixel.y;

    // Shift = square
    if (shiftHeld || (e && e.shiftKey)) {
      const dx = ex - startPixel.x;
      const dy = ey - startPixel.y;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      ex = startPixel.x + side * Math.sign(dx || 1);
      ey = startPixel.y + side * Math.sign(dy || 1);
    }

    const color = _getDrawColor();
    const pts = State.filledShape
      ? MathUtil.filledRectPoints(startPixel.x, startPixel.y, ex, ey)
      : MathUtil.rectPoints(startPixel.x, startPixel.y, ex, ey);

    // Apply brush size to outline points (filled already has all interior)
    if (State.filledShape) {
      _withSymmetry(pts, function (x, y) { _drawPixel(pvCtx, x, y, color); });
    } else {
      for (let i = 0; i < pts.length; i++) {
        const bp = MathUtil.brushPoints(pts[i].x, pts[i].y, State.brushSize);
        _withSymmetry(bp, function (x, y) { _drawPixel(pvCtx, x, y, color); });
      }
    }

    EventBus.emit('render');
  }

  function _rectEnd(pixel, e) {
    Canvas.clearPreview();

    let ex = pixel.x;
    let ey = pixel.y;

    if (shiftHeld || (e && e.shiftKey)) {
      const dx = ex - startPixel.x;
      const dy = ey - startPixel.y;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      ex = startPixel.x + side * Math.sign(dx || 1);
      ey = startPixel.y + side * Math.sign(dy || 1);
    }

    const ctx = State.layers[State.activeLayerIndex].ctx;
    const color = _getDrawColor();
    const pts = State.filledShape
      ? MathUtil.filledRectPoints(startPixel.x, startPixel.y, ex, ey)
      : MathUtil.rectPoints(startPixel.x, startPixel.y, ex, ey);

    if (State.filledShape) {
      _withSymmetry(pts, function (x, y) { _drawPixel(ctx, x, y, color); });
    } else {
      for (let i = 0; i < pts.length; i++) {
        const bp = MathUtil.brushPoints(pts[i].x, pts[i].y, State.brushSize);
        _withSymmetry(bp, function (x, y) { _drawPixel(ctx, x, y, color); });
      }
    }

    _pushUndo('Rectangle');
    EventBus.emit('dirty');
  }

  /* ================================================
     ELLIPSE TOOL
     ================================================ */
  function _ellipseStart(pixel) {
    _saveUndoSnapshot();
  }

  function _ellipseMove(pixel, e) {
    const pvCtx = Canvas.getPreviewCtx();
    Canvas.clearPreview();

    let ex = pixel.x;
    let ey = pixel.y;

    // Shift = circle
    if (shiftHeld || (e && e.shiftKey)) {
      const dx = ex - startPixel.x;
      const dy = ey - startPixel.y;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      ex = startPixel.x + side * Math.sign(dx || 1);
      ey = startPixel.y + side * Math.sign(dy || 1);
    }

    const cx = Math.round((startPixel.x + ex) / 2);
    const cy = Math.round((startPixel.y + ey) / 2);
    const rx = Math.abs(Math.round((ex - startPixel.x) / 2));
    const ry = Math.abs(Math.round((ey - startPixel.y) / 2));

    const color = _getDrawColor();
    const pts = State.filledShape
      ? MathUtil.filledEllipsePoints(cx, cy, rx, ry)
      : MathUtil.ellipsePoints(cx, cy, rx, ry);

    if (State.filledShape) {
      _withSymmetry(pts, function (x, y) { _drawPixel(pvCtx, x, y, color); });
    } else {
      for (let i = 0; i < pts.length; i++) {
        const bp = MathUtil.brushPoints(pts[i].x, pts[i].y, State.brushSize);
        _withSymmetry(bp, function (x, y) { _drawPixel(pvCtx, x, y, color); });
      }
    }

    EventBus.emit('render');
  }

  function _ellipseEnd(pixel, e) {
    Canvas.clearPreview();

    let ex = pixel.x;
    let ey = pixel.y;

    if (shiftHeld || (e && e.shiftKey)) {
      const dx = ex - startPixel.x;
      const dy = ey - startPixel.y;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      ex = startPixel.x + side * Math.sign(dx || 1);
      ey = startPixel.y + side * Math.sign(dy || 1);
    }

    const cx = Math.round((startPixel.x + ex) / 2);
    const cy = Math.round((startPixel.y + ey) / 2);
    const rx = Math.abs(Math.round((ex - startPixel.x) / 2));
    const ry = Math.abs(Math.round((ey - startPixel.y) / 2));

    const ctx = State.layers[State.activeLayerIndex].ctx;
    const color = _getDrawColor();
    const pts = State.filledShape
      ? MathUtil.filledEllipsePoints(cx, cy, rx, ry)
      : MathUtil.ellipsePoints(cx, cy, rx, ry);

    if (State.filledShape) {
      _withSymmetry(pts, function (x, y) { _drawPixel(ctx, x, y, color); });
    } else {
      for (let i = 0; i < pts.length; i++) {
        const bp = MathUtil.brushPoints(pts[i].x, pts[i].y, State.brushSize);
        _withSymmetry(bp, function (x, y) { _drawPixel(ctx, x, y, color); });
      }
    }

    _pushUndo('Ellipse');
    EventBus.emit('dirty');
  }

  /* ================================================
     FILL (BUCKET) TOOL â€” Scanline flood fill
     ================================================ */
  function _fillStart(pixel) {
    if (!_inBounds(pixel.x, pixel.y)) return;

    _saveUndoSnapshot();

    const layer = State.layers[State.activeLayerIndex];
    const ctx = layer.ctx;
    const w = State.width;
    const h = State.height;
    const fillColor = _getDrawColor();

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Target colour at the clicked pixel
    const idx = (pixel.y * w + pixel.x) * 4;
    const tR = data[idx], tG = data[idx + 1], tB = data[idx + 2], tA = data[idx + 3];

    // If target colour matches fill colour, nothing to do
    if (tR === fillColor.r && tG === fillColor.g && tB === fillColor.b && tA === fillColor.a) {
      undoSnapshot = null;
      return;
    }

    function matchTarget(i) {
      return data[i] === tR && data[i + 1] === tG && data[i + 2] === tB && data[i + 3] === tA;
    }

    function setPixelData(i) {
      data[i] = fillColor.r;
      data[i + 1] = fillColor.g;
      data[i + 2] = fillColor.b;
      data[i + 3] = fillColor.a;
    }

    // Scanline flood fill
    const stack = [pixel.x, pixel.y];

    while (stack.length > 0) {
      const sy = stack.pop();
      let sx = stack.pop();

      let i = (sy * w + sx) * 4;
      // Move left to find scanline start
      while (sx >= 0 && matchTarget(i)) {
        sx--;
        i -= 4;
      }
      sx++;
      i += 4;

      let spanAbove = false;
      let spanBelow = false;

      while (sx < w && matchTarget(i)) {
        setPixelData(i);

        // Check pixel above
        if (sy > 0) {
          const ai = ((sy - 1) * w + sx) * 4;
          if (matchTarget(ai)) {
            if (!spanAbove) {
              stack.push(sx, sy - 1);
              spanAbove = true;
            }
          } else {
            spanAbove = false;
          }
        }

        // Check pixel below
        if (sy < h - 1) {
          const bi = ((sy + 1) * w + sx) * 4;
          if (matchTarget(bi)) {
            if (!spanBelow) {
              stack.push(sx, sy + 1);
              spanBelow = true;
            }
          } else {
            spanBelow = false;
          }
        }

        sx++;
        i += 4;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Handle symmetry by repeating for mirrored seed points
    if (State.symmetryH || State.symmetryV) {
      _fillSymmetry(pixel, fillColor);
    }

    _pushUndo('Fill');
    EventBus.emit('render');
    EventBus.emit('dirty');
  }

  /** Re-run flood fill for mirrored seed pixels (symmetry support). */
  function _fillSymmetry(pixel, fillColor) {
    const seeds = [];
    const cxMax = State.width - 1;
    const cyMax = State.height - 1;

    if (State.symmetryH) seeds.push({ x: cxMax - pixel.x, y: pixel.y });
    if (State.symmetryV) seeds.push({ x: pixel.x, y: cyMax - pixel.y });
    if (State.symmetryH && State.symmetryV) seeds.push({ x: cxMax - pixel.x, y: cyMax - pixel.y });

    const layer = State.layers[State.activeLayerIndex];
    const ctx = layer.ctx;
    const w = State.width;
    const h = State.height;

    for (let si = 0; si < seeds.length; si++) {
      const seed = seeds[si];
      if (!_inBounds(seed.x, seed.y)) continue;

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      const idx = (seed.y * w + seed.x) * 4;
      const tR = data[idx], tG = data[idx + 1], tB = data[idx + 2], tA = data[idx + 3];

      if (tR === fillColor.r && tG === fillColor.g && tB === fillColor.b && tA === fillColor.a) continue;

      function matchTarget(i) {
        return data[i] === tR && data[i + 1] === tG && data[i + 2] === tB && data[i + 3] === tA;
      }

      function setPixelData(i) {
        data[i] = fillColor.r;
        data[i + 1] = fillColor.g;
        data[i + 2] = fillColor.b;
        data[i + 3] = fillColor.a;
      }

      const stack = [seed.x, seed.y];
      while (stack.length > 0) {
        const sy = stack.pop();
        let sx = stack.pop();
        let ii = (sy * w + sx) * 4;
        while (sx >= 0 && matchTarget(ii)) { sx--; ii -= 4; }
        sx++; ii += 4;
        let spanAbove = false, spanBelow = false;
        while (sx < w && matchTarget(ii)) {
          setPixelData(ii);
          if (sy > 0) {
            const ai = ((sy - 1) * w + sx) * 4;
            if (matchTarget(ai)) { if (!spanAbove) { stack.push(sx, sy - 1); spanAbove = true; } }
            else spanAbove = false;
          }
          if (sy < h - 1) {
            const bi = ((sy + 1) * w + sx) * 4;
            if (matchTarget(bi)) { if (!spanBelow) { stack.push(sx, sy + 1); spanBelow = true; } }
            else spanBelow = false;
          }
          sx++; ii += 4;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }

  /* ================================================
     EYEDROPPER TOOL
     ================================================ */
  function _eyedropperPick(pixel) {
    if (!_inBounds(pixel.x, pixel.y)) return;

    // Sample from composite (all visible layers)
    const compCtx = Canvas.getCompositeCtx();
    const color = CanvasUtil.getPixel(compCtx, pixel.x, pixel.y);

    if (mouseButton === 2) {
      State.backgroundColor = color;
    } else {
      State.foregroundColor = color;
    }

    EventBus.emit('colorChanged', color);
  }

  /* ================================================
     SELECTION TOOL
     ================================================ */
  function _selectionStart(pixel, e) {
    // If clicking inside existing selection, enter move mode
    if (State.selection && _isInsideSelection(pixel.x, pixel.y)) {
      selMoving = true;
      selMoveStart = { x: pixel.x, y: pixel.y };
      selOrigRect = {
        x: State.selection.x,
        y: State.selection.y,
        w: State.selection.w,
        h: State.selection.h
      };

      // If selection doesn't have floating data yet, cut it from the layer
      if (!State.selection.data) {
        _saveUndoSnapshot();
        _liftSelection();
      }
      return;
    }

    // Commit any existing floating selection first
    if (State.selection && State.selection.data) {
      _commitSelection();
    }

    // Start a new selection rectangle
    State.selection = null;
    EventBus.emit('selectionChanged');
  }

  function _selectionMove(pixel) {
    if (selMoving) {
      // Move floating selection
      const dx = pixel.x - selMoveStart.x;
      const dy = pixel.y - selMoveStart.y;
      State.selection.x = selOrigRect.x + dx;
      State.selection.y = selOrigRect.y + dy;
      EventBus.emit('render');
      return;
    }

    // Update rubber-band selection rect
    const x = Math.min(startPixel.x, pixel.x);
    const y = Math.min(startPixel.y, pixel.y);
    const w = Math.abs(pixel.x - startPixel.x) + 1;
    const h = Math.abs(pixel.y - startPixel.y) + 1;

    State.selection = { x: x, y: y, w: w, h: h, data: null };
    EventBus.emit('selectionChanged');
    EventBus.emit('render');
  }

  function _selectionEnd(pixel) {
    if (selMoving) {
      selMoving = false;
      selMoveStart = null;
      selOrigRect = null;
      EventBus.emit('render');
      return;
    }

    // Finalise selection rectangle
    if (State.selection && State.selection.w <= 1 && State.selection.h <= 1) {
      // Click without drag â€” deselect
      State.selection = null;
    }

    EventBus.emit('selectionChanged');
    EventBus.emit('render');
  }

  function _isInsideSelection(px, py) {
    const s = State.selection;
    if (!s) return false;
    return px >= s.x && px < s.x + s.w && py >= s.y && py < s.y + s.h;
  }

  /** Lift (cut) the selected region from the active layer into floating data. */
  function _liftSelection() {
    const s = State.selection;
    if (!s) return;

    const layer = State.layers[State.activeLayerIndex];
    const ctx = layer.ctx;

    // Clamp to canvas bounds
    const sx = Math.max(0, s.x);
    const sy = Math.max(0, s.y);
    const sw = Math.min(State.width - sx, s.w - (sx - s.x));
    const sh = Math.min(State.height - sy, s.h - (sy - s.y));

    if (sw <= 0 || sh <= 0) return;

    s.data = ctx.getImageData(sx, sy, sw, sh);
    ctx.clearRect(sx, sy, sw, sh);
    EventBus.emit('render');
  }

  /** Commit floating selection data back onto the active layer. */
  function _commitSelection() {
    const s = State.selection;
    if (!s || !s.data) {
      State.selection = null;
      return;
    }

    const layer = State.layers[State.activeLayerIndex];
    // Create temp canvas from ImageData and draw at selection position
    const tmp = CanvasUtil.createCanvas(s.data.width, s.data.height);
    tmp.ctx.putImageData(s.data, 0, 0);
    layer.ctx.drawImage(tmp.canvas, s.x, s.y);

    State.selection = null;
    _pushUndo('Move Selection');
    EventBus.emit('selectionChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
  }

  /* ================================================
     MOVE TOOL â€” move active layer contents
     ================================================ */
  function _moveStart(pixel) {
    _saveUndoSnapshot();

    const layer = State.layers[State.activeLayerIndex];
    if (!layer) return;

    moveSnapshot = layer.ctx.getImageData(0, 0, State.width, State.height);
    moveStartPx = { x: pixel.x, y: pixel.y };
    moveOffsetX = 0;
    moveOffsetY = 0;
  }

  function _moveMove(pixel) {
    if (!moveSnapshot) return;

    moveOffsetX = pixel.x - moveStartPx.x;
    moveOffsetY = pixel.y - moveStartPx.y;

    const layer = State.layers[State.activeLayerIndex];
    const ctx = layer.ctx;

    // Restore original, then draw translated
    ctx.clearRect(0, 0, State.width, State.height);
    const tmp = CanvasUtil.createCanvas(State.width, State.height);
    tmp.ctx.putImageData(moveSnapshot, 0, 0);
    ctx.drawImage(tmp.canvas, moveOffsetX, moveOffsetY);

    EventBus.emit('render');
  }

  function _moveEnd() {
    moveSnapshot = null;
    moveStartPx = null;
    _pushUndo('Move Layer');
    EventBus.emit('dirty');
  }

  /* ================================================
     UI setup helpers
     ================================================ */
  function _attachToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const toolName = btn.dataset.tool;
        if (toolName) setTool(toolName);
      });
    });
  }

  function _attachBrushSizeSlider() {
    const slider = document.getElementById('brush-size-slider');
    const display = document.getElementById('brush-size-value');
    if (!slider) return;

    slider.addEventListener('input', function () {
      State.brushSize = parseInt(slider.value, 10);
      if (display) display.textContent = State.brushSize;
    });
  }

  function _attachFilledToggle() {
    const btn = document.getElementById('filled-toggle');
    if (!btn) return;

    btn.addEventListener('click', function () {
      State.filledShape = !State.filledShape;
      btn.classList.toggle('active', State.filledShape);
    });
  }

  function _attachSymmetryButtons() {
    const hBtn = document.getElementById('symmetry-h-btn');
    const vBtn = document.getElementById('symmetry-v-btn');

    if (hBtn) {
      hBtn.addEventListener('click', function () {
        State.symmetryH = !State.symmetryH;
        hBtn.classList.toggle('active', State.symmetryH);
      });
    }

    if (vBtn) {
      vBtn.addEventListener('click', function () {
        State.symmetryV = !State.symmetryV;
        vBtn.classList.toggle('active', State.symmetryV);
      });
    }
  }

  /* ================================================
     Public API
     ================================================ */
  return {
    init: init,
    setTool: setTool,

    /** Commit any floating selection â€” called by other modules before operations. */
    commitSelection: function () {
      if (State.selection && State.selection.data) _commitSelection();
    }
  };
})();
/* ================================================
   PixelForge â€” Layer Management
   Handles layer CRUD, reordering, compositing,
   serialization, and UI panel rendering
   ================================================ */

window.Layers = (function () {
  'use strict';

  /* ---- DOM element references (cached on init) ---- */
  let elLayersList, elBlendMode, elOpacitySlider, elOpacityValue;

  /* ---- Drag-and-drop state ---- */
  let dragSrcIndex = -1;

  /* ============================================================
     init â€” Create first layer, wire up buttons & events
     ============================================================ */
  function init() {
    /* Cache DOM references */
    elLayersList   = document.getElementById('layers-list');
    elBlendMode    = document.getElementById('layer-blend-mode');
    elOpacitySlider = document.getElementById('layer-opacity-slider');
    elOpacityValue = document.getElementById('layer-opacity-value');

    /* Create the initial layer */
    _createLayerInternal('Layer 1');
    State.activeLayerIndex = 0;

    /* ---- Button handlers ---- */
    document.getElementById('add-layer-btn').addEventListener('click', function () {
      createLayer('Layer ' + State._nextLayerId);
    });
    document.getElementById('delete-layer-btn').addEventListener('click', function () {
      deleteLayer(State.activeLayerIndex);
    });
    document.getElementById('duplicate-layer-btn').addEventListener('click', function () {
      duplicateLayer(State.activeLayerIndex);
    });
    document.getElementById('merge-layer-btn').addEventListener('click', function () {
      mergeDown(State.activeLayerIndex);
    });
    document.getElementById('move-layer-up-btn').addEventListener('click', function () {
      if (State.activeLayerIndex < State.layers.length - 1) {
        moveLayer(State.activeLayerIndex, State.activeLayerIndex + 1);
      }
    });
    document.getElementById('move-layer-down-btn').addEventListener('click', function () {
      if (State.activeLayerIndex > 0) {
        moveLayer(State.activeLayerIndex, State.activeLayerIndex - 1);
      }
    });

    /* ---- Blend mode select ---- */
    elBlendMode.addEventListener('change', function () {
      setBlendMode(State.activeLayerIndex, elBlendMode.value);
    });

    /* ---- Opacity slider ---- */
    elOpacitySlider.addEventListener('input', function () {
      setOpacity(State.activeLayerIndex, parseInt(elOpacitySlider.value, 10));
    });

    /* ---- EventBus listeners ---- */
    EventBus.on('layersChanged', function () {
      renderPanel();
    });

    /* Initial render */
    renderPanel();
  }

  /* ============================================================
     INTERNAL: create a layer object without history / events
     ============================================================ */
  function _createLayerInternal(name) {
    var pair = CanvasUtil.createCanvas(State.width, State.height);
    var layer = {
      id:        State.nextLayerId(),
      name:      name,
      canvas:    pair.canvas,
      ctx:       pair.ctx,
      visible:   true,
      opacity:   100,
      blendMode: 'source-over',
      locked:    false
    };
    State.layers.push(layer);
    return layer;
  }

  /* ============================================================
     createLayer â€” Add a new empty layer (public, with history)
     ============================================================ */
  function createLayer(name) {
    var layer = _createLayerInternal(name || 'Layer ' + State._nextLayerId);
    State.activeLayerIndex = State.layers.length - 1;
    EventBus.emit('layersChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
    EventBus.emit('historyChanged');
    return layer;
  }

  /* ============================================================
     deleteLayer â€” Remove layer at index (keep â‰¥ 1 layer)
     ============================================================ */
  function deleteLayer(index) {
    if (State.layers.length <= 1) return;
    if (index < 0 || index >= State.layers.length) return;

    State.layers.splice(index, 1);

    /* Adjust active index */
    if (State.activeLayerIndex >= State.layers.length) {
      State.activeLayerIndex = State.layers.length - 1;
    }

    EventBus.emit('layersChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
    EventBus.emit('historyChanged');
  }

  /* ============================================================
     duplicateLayer â€” Clone layer at index, insert above
     ============================================================ */
  function duplicateLayer(index) {
    if (index < 0 || index >= State.layers.length) return;

    var src = State.layers[index];
    var cloned = CanvasUtil.cloneCanvas(src.canvas);
    var layer = {
      id:        State.nextLayerId(),
      name:      src.name + ' copy',
      canvas:    cloned.canvas,
      ctx:       cloned.ctx,
      visible:   src.visible,
      opacity:   src.opacity,
      blendMode: src.blendMode,
      locked:    false
    };

    /* Insert above the source layer */
    State.layers.splice(index + 1, 0, layer);
    State.activeLayerIndex = index + 1;

    EventBus.emit('layersChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
    EventBus.emit('historyChanged');
    return layer;
  }

  /* ============================================================
     mergeDown â€” Composite layer[index] onto layer[index-1]
     ============================================================ */
  function mergeDown(index) {
    if (index <= 0 || index >= State.layers.length) return;

    var top    = State.layers[index];
    var bottom = State.layers[index - 1];

    /* Draw top onto bottom using composite operation */
    bottom.ctx.save();
    bottom.ctx.globalAlpha = top.opacity / 100;
    bottom.ctx.globalCompositeOperation = top.blendMode;
    bottom.ctx.drawImage(top.canvas, 0, 0);
    bottom.ctx.restore();

    /* Remove top layer */
    State.layers.splice(index, 1);
    State.activeLayerIndex = index - 1;

    EventBus.emit('layersChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
    EventBus.emit('historyChanged');
  }

  /* ============================================================
     moveLayer â€” Reorder layers array
     ============================================================ */
  function moveLayer(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= State.layers.length) return;
    if (toIndex < 0 || toIndex >= State.layers.length) return;
    if (fromIndex === toIndex) return;

    var layer = State.layers.splice(fromIndex, 1)[0];
    State.layers.splice(toIndex, 0, layer);
    State.activeLayerIndex = toIndex;

    EventBus.emit('layersChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
  }

  /* ============================================================
     setActiveLayer â€” Switch to layer at index
     ============================================================ */
  function setActiveLayer(index) {
    if (index < 0 || index >= State.layers.length) return;
    State.activeLayerIndex = index;
    renderPanel();
    EventBus.emit('render');
  }

  /* ============================================================
     setOpacity â€” Set layer opacity (0-100)
     ============================================================ */
  function setOpacity(index, value) {
    if (index < 0 || index >= State.layers.length) return;
    State.layers[index].opacity = MathUtil.clamp(value, 0, 100);
    _updateOpacityUI();
    EventBus.emit('render');
    EventBus.emit('dirty');
  }

  /* ============================================================
     setBlendMode â€” Set layer composite blend mode
     ============================================================ */
  function setBlendMode(index, mode) {
    if (index < 0 || index >= State.layers.length) return;
    State.layers[index].blendMode = mode;
    EventBus.emit('render');
    EventBus.emit('dirty');
  }

  /* ============================================================
     setVisibility â€” Toggle layer visible flag
     ============================================================ */
  function setVisibility(index, visible) {
    if (index < 0 || index >= State.layers.length) return;
    State.layers[index].visible = visible;
    EventBus.emit('layersChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
  }

  /* ============================================================
     renameLayer â€” Rename layer at index
     ============================================================ */
  function renameLayer(index, newName) {
    if (index < 0 || index >= State.layers.length) return;
    State.layers[index].name = newName || 'Layer';
    EventBus.emit('layersChanged');
    EventBus.emit('dirty');
  }

  /* ============================================================
     getActiveLayer â€” Return current active layer object
     ============================================================ */
  function getActiveLayer() {
    return State.layers[State.activeLayerIndex] || null;
  }

  /* ============================================================
     resizeAllLayers â€” Resize all layer canvases preserving
                       top-left content
     ============================================================ */
  function resizeAllLayers(newW, newH) {
    newW = MathUtil.clamp(newW, 1, State.maxSize);
    newH = MathUtil.clamp(newH, 1, State.maxSize);

    for (var i = 0; i < State.layers.length; i++) {
      var layer = State.layers[i];
      /* Grab current content */
      var imgData = layer.ctx.getImageData(0, 0, Math.min(layer.canvas.width, newW), Math.min(layer.canvas.height, newH));
      layer.canvas.width = newW;
      layer.canvas.height = newH;
      layer.ctx.imageSmoothingEnabled = false;
      layer.ctx.putImageData(imgData, 0, 0);
    }

    State.width = newW;
    State.height = newH;

    EventBus.emit('layersChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
  }

  /* ============================================================
     serializeLayers â€” Convert current layers to serializable data
                       (canvas â†’ dataURL). Used by animation frames.
     ============================================================ */
  function serializeLayers() {
    var data = [];
    for (var i = 0; i < State.layers.length; i++) {
      var layer = State.layers[i];
      data.push({
        id:        layer.id,
        name:      layer.name,
        dataURL:   layer.canvas.toDataURL(),
        visible:   layer.visible,
        opacity:   layer.opacity,
        blendMode: layer.blendMode,
        locked:    layer.locked
      });
    }
    return data;
  }

  /* ============================================================
     deserializeLayers â€” Restore layers from serialized data
     ============================================================ */
  function deserializeLayers(data) {
    State.layers = [];
    var loadCount = 0;

    for (var i = 0; i < data.length; i++) {
      (function (entry) {
        var pair = CanvasUtil.createCanvas(State.width, State.height);
        var layer = {
          id:        entry.id,
          name:      entry.name,
          canvas:    pair.canvas,
          ctx:       pair.ctx,
          visible:   entry.visible,
          opacity:   entry.opacity,
          blendMode: entry.blendMode,
          locked:    entry.locked
        };
        State.layers.push(layer);

        /* Load the image data from the dataURL */
        var img = new Image();
        img.onload = function () {
          layer.ctx.drawImage(img, 0, 0);
          loadCount++;
          if (loadCount === data.length) {
            EventBus.emit('layersChanged');
            EventBus.emit('render');
          }
        };
        img.onerror = function () {
          loadCount++;
          if (loadCount === data.length) {
            EventBus.emit('layersChanged');
            EventBus.emit('render');
          }
        };
        img.src = entry.dataURL;
      })(data[i]);
    }

    /* Fallback: if State.layers is empty, create a default layer */
    if (State.layers.length === 0) {
      var pair = CanvasUtil.createCanvas(State.width, State.height);
      State.layers.push({
        id:        State.nextLayerId ? State.nextLayerId() : 1,
        name:      'Layer 1',
        canvas:    pair.canvas,
        ctx:       pair.ctx,
        visible:   true,
        opacity:   100,
        blendMode: 'source-over',
        locked:    false
      });
    }

    /* Adjust active layer index */
    State.activeLayerIndex = Math.max(0, Math.min(State.layers.length - 1, State.activeLayerIndex || 0));
  }

  /* ============================================================
     _updateOpacityUI â€” Sync slider / label with active layer
     ============================================================ */
  function _updateOpacityUI() {
    var layer = getActiveLayer();
    if (!layer) return;
    elOpacitySlider.value = layer.opacity;
    elOpacityValue.textContent = layer.opacity + '%';
  }

  /* ============================================================
     renderPanel â€” Rebuild the layer list in #layers-list
     Layers are displayed top-to-bottom (last in array = top,
     shown first in the list).
     ============================================================ */
  function renderPanel() {
    if (!elLayersList) return;

    elLayersList.innerHTML = '';

    /* Iterate in reverse so the topmost layer appears first */
    for (var i = State.layers.length - 1; i >= 0; i--) {
      var layer = State.layers[i];
      var isActive = (i === State.activeLayerIndex);

      /* --- Container --- */
      var item = document.createElement('div');
      item.className = 'layer-item' + (isActive ? ' active' : '');
      item.setAttribute('data-index', i);
      item.setAttribute('draggable', 'true');

      /* --- Thumbnail --- */
      var thumbWrap = document.createElement('div');
      thumbWrap.className = 'layer-thumb';
      var thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = State.width;
      thumbCanvas.height = State.height;
      var thumbCtx = thumbCanvas.getContext('2d');
      thumbCtx.imageSmoothingEnabled = false;
      thumbCtx.drawImage(layer.canvas, 0, 0);
      thumbWrap.appendChild(thumbCanvas);
      item.appendChild(thumbWrap);

      /* --- Layer name (span, double-click to rename) --- */
      var nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      nameSpan.textContent = layer.name;
      nameSpan.setAttribute('data-index', i);
      item.appendChild(nameSpan);

      /* --- Visibility eye button --- */
      var visBtn = document.createElement('button');
      visBtn.className = 'layer-visibility' + (layer.visible ? '' : ' hidden-layer');
      visBtn.setAttribute('data-index', i);
      visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
      visBtn.innerHTML = layer.visible
        ? '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 3C3 3 1 8 1 8s2 5 7 5 7-5 7-5-2-5-7-5zm0 8a3 3 0 110-6 3 3 0 010 6z" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 3C3 3 1 8 1 8s2 5 7 5 7-5 7-5-2-5-7-5zm0 8a3 3 0 110-6 3 3 0 010 6z" fill="currentColor" opacity="0.3"/><line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/></svg>';
      item.appendChild(visBtn);

      elLayersList.appendChild(item);
    }

    /* Update blend mode dropdown & opacity slider for active layer */
    var activeLayer = getActiveLayer();
    if (activeLayer) {
      elBlendMode.value = activeLayer.blendMode;
      _updateOpacityUI();
    }

    /* ---- Attach event listeners ---- */
    _attachLayerEvents();
  }

  /* ============================================================
     _attachLayerEvents â€” Wire up click, dblclick, contextmenu,
                          drag-and-drop on layer items
     ============================================================ */
  function _attachLayerEvents() {
    var items = elLayersList.querySelectorAll('.layer-item');

    for (var n = 0; n < items.length; n++) {
      (function (itemEl) {
        var idx = parseInt(itemEl.getAttribute('data-index'), 10);

        /* Click to select */
        itemEl.addEventListener('click', function (e) {
          if (e.target.closest('.layer-visibility') || e.target.closest('.layer-name-input')) return;
          setActiveLayer(idx);
        });

        /* Right-click context menu */
        itemEl.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          _showContextMenu(idx, e.clientX, e.clientY);
        });

        /* ---- Double-click on name to rename inline ---- */
        var nameEl = itemEl.querySelector('.layer-name');
        if (nameEl) {
          nameEl.addEventListener('dblclick', function (e) {
            e.stopPropagation();
            _startInlineRename(itemEl, idx);
          });
        }

        /* ---- Visibility toggle ---- */
        var visEl = itemEl.querySelector('.layer-visibility');
        if (visEl) {
          visEl.addEventListener('click', function (e) {
            e.stopPropagation();
            var layerIdx = parseInt(visEl.getAttribute('data-index'), 10);
            setVisibility(layerIdx, !State.layers[layerIdx].visible);
          });
        }

        /* ---- Drag and Drop reorder ---- */
        itemEl.addEventListener('dragstart', function (e) {
          dragSrcIndex = idx;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(idx));
          /* Delay adding class so the drag image renders cleanly */
          setTimeout(function () { itemEl.style.opacity = '0.4'; }, 0);
        });

        itemEl.addEventListener('dragend', function () {
          itemEl.style.opacity = '';
          _clearDragStyles();
        });

        itemEl.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          itemEl.classList.add('drag-over');
        });

        itemEl.addEventListener('dragleave', function () {
          itemEl.classList.remove('drag-over');
        });

        itemEl.addEventListener('drop', function (e) {
          e.preventDefault();
          e.stopPropagation();
          itemEl.classList.remove('drag-over');
          var targetIdx = idx;
          if (dragSrcIndex !== targetIdx && dragSrcIndex >= 0) {
            moveLayer(dragSrcIndex, targetIdx);
          }
          dragSrcIndex = -1;
        });
      })(items[n]);
    }
  }

  /* ============================================================
     _clearDragStyles â€” Remove drag-over indicators
     ============================================================ */
  function _clearDragStyles() {
    var items = elLayersList.querySelectorAll('.layer-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('drag-over');
    }
  }

  /* ============================================================
     _startInlineRename â€” Replace name span with input field
     ============================================================ */
  function _startInlineRename(itemEl, index) {
    var nameEl = itemEl.querySelector('.layer-name');
    if (!nameEl) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'layer-name-input';
    input.value = State.layers[index].name;
    input.maxLength = 40;

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    function commit() {
      var newName = input.value.trim() || State.layers[index].name;
      renameLayer(index, newName);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        /* Cancel â€” restore without renaming */
        input.removeEventListener('blur', commit);
        renderPanel();
      }
    });
  }

  /* ============================================================
     _showContextMenu â€” Emit contextmenu event for the layer
     ============================================================ */
  function _showContextMenu(index, x, y) {
    var items = [
      { label: 'Rename',    action: function () { setActiveLayer(index); _triggerRename(index); } },
      { label: 'Duplicate', action: function () { duplicateLayer(index); } },
      { label: 'Delete',    action: function () { deleteLayer(index); } },
      { separator: true },
      { label: State.layers[index].visible ? 'Hide' : 'Show',
        action: function () { setVisibility(index, !State.layers[index].visible); } },
      { label: State.layers[index].locked ? 'Unlock' : 'Lock',
        action: function () {
          State.layers[index].locked = !State.layers[index].locked;
          EventBus.emit('layersChanged');
        }
      },
      { separator: true },
      { label: 'Merge Down', action: function () { mergeDown(index); },
        disabled: index <= 0 },
      { label: 'Flatten All', action: function () { _flattenAll(); } }
    ];
    EventBus.emit('contextmenu', { items: items, x: x, y: y });
  }

  /* ============================================================
     _triggerRename â€” Programmatically start rename on a layer item
     ============================================================ */
  function _triggerRename(index) {
    /* renderPanel() will have been called by setActiveLayer, so
       we need a micro-delay to let the DOM settle. */
    setTimeout(function () {
      var item = elLayersList.querySelector('.layer-item[data-index="' + index + '"]');
      if (item) _startInlineRename(item, index);
    }, 50);
  }

  /* ============================================================
     _flattenAll â€” Merge all layers into one
     ============================================================ */
  function _flattenAll() {
    if (State.layers.length <= 1) return;

    var pair = CanvasUtil.createCanvas(State.width, State.height);
    for (var i = 0; i < State.layers.length; i++) {
      var layer = State.layers[i];
      if (!layer.visible) continue;
      pair.ctx.save();
      pair.ctx.globalAlpha = layer.opacity / 100;
      pair.ctx.globalCompositeOperation = layer.blendMode;
      pair.ctx.drawImage(layer.canvas, 0, 0);
      pair.ctx.restore();
    }

    /* Replace all layers with the composited result */
    State.layers = [{
      id:        State.nextLayerId(),
      name:      'Flattened',
      canvas:    pair.canvas,
      ctx:       pair.ctx,
      visible:   true,
      opacity:   100,
      blendMode: 'source-over',
      locked:    false
    }];
    State.activeLayerIndex = 0;

    EventBus.emit('layersChanged');
    EventBus.emit('render');
    EventBus.emit('dirty');
    EventBus.emit('historyChanged');
  }

  /* ============================================================
     Public API
     ============================================================ */
  return {
    init:               init,
    createLayer:        createLayer,
    deleteLayer:        deleteLayer,
    duplicateLayer:     duplicateLayer,
    mergeDown:          mergeDown,
    moveLayer:          moveLayer,
    setActiveLayer:     setActiveLayer,
    setOpacity:         setOpacity,
    setBlendMode:       setBlendMode,
    setVisibility:      setVisibility,
    renameLayer:        renameLayer,
    renderPanel:        renderPanel,
    getActiveLayer:     getActiveLayer,
    resizeAllLayers:    resizeAllLayers,
    serializeLayers:    serializeLayers,
    deserializeLayers:  deserializeLayers
  };
})();
/* ================================================
   PixelForge â€” Color Picker & Palette Management
   HSL color field, hue bar, alpha bar, text inputs,
   preset palettes, and custom swatch management
   ================================================ */

window.Palette = (function () {
  'use strict';

  /* ============================================================
     Preset palette data â€” FULL hex arrays
     ============================================================ */
  var PRESETS = {
    pico8: [
      '#000000', '#1D2B53', '#7E2553', '#008751',
      '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
      '#FF004D', '#FFA300', '#FFEC27', '#00E436',
      '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'
    ],
    endesga32: [
      '#be4a2f', '#d77643', '#ead4aa', '#e4a672',
      '#b86f50', '#733e39', '#3e2731', '#a22633',
      '#e43b44', '#f77622', '#feae34', '#fee761',
      '#63c74d', '#3e8948', '#265c42', '#193c3e',
      '#124e89', '#0099db', '#2ce8f5', '#ffffff',
      '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#ff0044', '#68386c',
      '#b55088', '#f6757a', '#e8b796', '#c28569'
    ],
    gameboy: [
      '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
    ],
    sweetie16: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57',
      '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
      '#f4f4f4', '#94b0c2', '#566c86', '#333c57'
    ],
    aap64: [
      '#060608', '#141013', '#3b1725', '#73172d',
      '#b4202a', '#df3e23', '#fa6a0a', '#f9a31b',
      '#ffd541', '#fffc40', '#d6f264', '#9cdb43',
      '#59c135', '#14a02e', '#1a7a3e', '#24523b',
      '#122020', '#143464', '#285cc4', '#249fde',
      '#20d6c7', '#a6fcdb', '#ffffff', '#fef3c0',
      '#fad6b8', '#f5a097', '#e86a73', '#bc4a9b',
      '#793a80', '#403353', '#242234', '#221c1a',
      '#322b28', '#71413b', '#bb7547', '#dba463',
      '#f4d29c', '#dae0ea', '#b3b9d1', '#8b93af',
      '#6d758d', '#4a5462', '#333941', '#422433',
      '#5b3138', '#8e5252', '#ba756a', '#e9b5a3',
      '#e3e6ff', '#b9bffb', '#849be4', '#588dbe',
      '#477d85', '#23674e', '#328464', '#5daf8d',
      '#92dcba', '#cdf0e2', '#e4d2aa', '#c7b08b',
      '#a08662', '#796755', '#5a4e44', '#423934'
    ]
  };

  /* ---- DOM element references ---- */
  var elColorField, elColorFieldCtx, elColorFieldCursor, elColorFieldWrapper;
  var elHueBar, elHueBarCtx, elHueBarCursor;
  var elAlphaBar, elAlphaBarCtx, elAlphaBarCursor;
  var elH, elS, elL, elR, elG, elB, elHex, elA;
  var elFg, elBg, elSwap;
  var elPaletteSelect, elPaletteGrid, elAddColorBtn;

  /* ---- Internal color state (HSL + alpha for field positioning) ---- */
  var currentHue = 0;       // 0â€“360
  var currentSat = 0;       // 0â€“100
  var currentLight = 0;     // 0â€“100

  /* ---- Drag flags ---- */
  var draggingField = false;
  var draggingHue = false;
  var draggingAlpha = false;

  /* ---- Custom palette storage ---- */
  var activePaletteName = 'pico8';

  /* ============================================================
     init â€” Set up all color picker UI
     ============================================================ */
  function init() {
    /* Cache DOM */
    elColorFieldWrapper = document.getElementById('color-field-wrapper');
    elColorField   = document.getElementById('color-field');
    elColorFieldCtx = elColorField.getContext('2d');
    elColorFieldCursor = document.getElementById('color-field-cursor');

    elHueBar       = document.getElementById('hue-bar');
    elHueBarCtx    = elHueBar.getContext('2d');
    elHueBarCursor = document.getElementById('hue-bar-cursor');

    elAlphaBar     = document.getElementById('alpha-bar');
    elAlphaBarCtx  = elAlphaBar.getContext('2d');
    elAlphaBarCursor = document.getElementById('alpha-bar-cursor');

    elH = document.getElementById('h-input');
    elS = document.getElementById('s-input');
    elL = document.getElementById('l-input');
    elR = document.getElementById('r-input');
    elG = document.getElementById('g-input');
    elB = document.getElementById('b-input');
    elHex = document.getElementById('hex-input');
    elA   = document.getElementById('a-input');

    elFg   = document.getElementById('fg-color');
    elBg   = document.getElementById('bg-color');
    elSwap = document.getElementById('swap-colors-btn');

    elPaletteSelect = document.getElementById('palette-select');
    elPaletteGrid   = document.getElementById('palette-grid');
    elAddColorBtn   = document.getElementById('add-color-btn');

    /* Initialize custom palette in state if not already */
    if (!State.customPalette) State.customPalette = [];
    if (!State.activePaletteColors) State.activePaletteColors = [];

    /* Sync HSL from initial foreground color */
    _syncHSLFromRGB(State.foregroundColor);

    /* Draw initial gradients */
    drawColorField();
    drawHueBar();
    drawAlphaBar();
    updateUI();

    /* Load default palette */
    loadPreset('pico8');
    elPaletteSelect.value = 'pico8';

    /* ---- Color field mouse handlers ---- */
    elColorFieldWrapper.addEventListener('mousedown', function (e) {
      draggingField = true;
      _handleFieldDrag(e);
    });

    /* ---- Hue bar mouse handlers ---- */
    var hueBarWrapper = document.getElementById('hue-bar-wrapper');
    hueBarWrapper.addEventListener('mousedown', function (e) {
      draggingHue = true;
      _handleHueDrag(e);
    });

    /* ---- Alpha bar mouse handlers ---- */
    var alphaBarWrapper = document.getElementById('alpha-bar-wrapper');
    alphaBarWrapper.addEventListener('mousedown', function (e) {
      draggingAlpha = true;
      _handleAlphaDrag(e);
    });

    /* Global mousemove / mouseup for all drag operations */
    document.addEventListener('mousemove', function (e) {
      if (draggingField) _handleFieldDrag(e);
      if (draggingHue) _handleHueDrag(e);
      if (draggingAlpha) _handleAlphaDrag(e);
    });
    document.addEventListener('mouseup', function () {
      draggingField = false;
      draggingHue = false;
      draggingAlpha = false;
    });

    /* ---- HSL text inputs ---- */
    elH.addEventListener('change', _onHSLInputChange);
    elS.addEventListener('change', _onHSLInputChange);
    elL.addEventListener('change', _onHSLInputChange);

    /* ---- RGB text inputs ---- */
    elR.addEventListener('change', _onRGBInputChange);
    elG.addEventListener('change', _onRGBInputChange);
    elB.addEventListener('change', _onRGBInputChange);

    /* ---- Hex input ---- */
    elHex.addEventListener('change', _onHexInputChange);

    /* ---- Alpha input ---- */
    elA.addEventListener('change', _onAlphaInputChange);

    /* ---- Swap / fg / bg buttons ---- */
    elSwap.addEventListener('click', swapColors);

    elFg.addEventListener('click', function () {
      /* Already editing foreground â€” no-op for now */
    });
    elBg.addEventListener('click', function () {
      /* Switch to editing background color â€” swap to make bg the "active" edit target */
      swapColors();
    });

    /* ---- Palette preset selector ---- */
    elPaletteSelect.addEventListener('change', function () {
      var val = elPaletteSelect.value;
      if (val === 'custom') {
        _renderCustomPalette();
      } else {
        loadPreset(val);
      }
    });

    /* ---- Add current color to custom palette ---- */
    elAddColorBtn.addEventListener('click', function () {
      addCurrentColor();
    });

    /* ---- Listen for colorChanged events from other modules ---- */
    EventBus.on('colorChanged', function () {
      _syncHSLFromRGB(State.foregroundColor);
      updateUI();
    });
  }

  /* ============================================================
     setForegroundColor â€” Update State.foregroundColor, sync UI
     ============================================================ */
  function setForegroundColor(rgba) {
    State.foregroundColor = {
      r: MathUtil.clamp(Math.round(rgba.r), 0, 255),
      g: MathUtil.clamp(Math.round(rgba.g), 0, 255),
      b: MathUtil.clamp(Math.round(rgba.b), 0, 255),
      a: MathUtil.clamp(Math.round(rgba.a !== undefined ? rgba.a : 255), 0, 255)
    };
    _syncHSLFromRGB(State.foregroundColor);
    drawColorField();
    drawAlphaBar();
    updateUI();
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     setBackgroundColor â€” Update State.backgroundColor, sync UI
     ============================================================ */
  function setBackgroundColor(rgba) {
    State.backgroundColor = {
      r: MathUtil.clamp(Math.round(rgba.r), 0, 255),
      g: MathUtil.clamp(Math.round(rgba.g), 0, 255),
      b: MathUtil.clamp(Math.round(rgba.b), 0, 255),
      a: MathUtil.clamp(Math.round(rgba.a !== undefined ? rgba.a : 255), 0, 255)
    };
    elBg.style.background = ColorUtil.rgbaToCSS(State.backgroundColor);
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     swapColors â€” Swap foreground and background colors
     ============================================================ */
  function swapColors() {
    var tmp = ColorUtil.clone(State.foregroundColor);
    setForegroundColor(State.backgroundColor);
    setBackgroundColor(tmp);
  }

  /* ============================================================
     updateUI â€” Sync all color picker UI elements from state
     ============================================================ */
  function updateUI() {
    var c = State.foregroundColor;

    /* Text inputs */
    elH.value = currentHue;
    elS.value = currentSat;
    elL.value = currentLight;
    elR.value = c.r;
    elG.value = c.g;
    elB.value = c.b;
    elHex.value = ColorUtil.rgbaToHex(c.r, c.g, c.b).replace('#', '');
    elA.value = c.a;

    /* Swatches */
    elFg.style.background = ColorUtil.rgbaToCSS(c);
    elBg.style.background = ColorUtil.rgbaToCSS(State.backgroundColor);

    /* Color field cursor position */
    _positionFieldCursor();

    /* Hue bar cursor */
    _positionHueCursor();

    /* Alpha bar cursor */
    _positionAlphaCursor();

    /* Refresh palette highlights */
    _highlightActiveSwatch();
  }

  /* ============================================================
     drawColorField â€” 2D SL gradient for current hue
     X = saturation (0% left â†’ 100% right)
     Y = lightness (100% top â†’ 0% bottom)
     ============================================================ */
  function drawColorField() {
    var w = elColorField.width;
    var h = elColorField.height;
    var imgData = elColorFieldCtx.createImageData(w, h);
    var data = imgData.data;

    for (var py = 0; py < h; py++) {
      /* lightness: 100 at top, 0 at bottom */
      var l = 100 - (py / (h - 1)) * 100;
      for (var px = 0; px < w; px++) {
        var s = (px / (w - 1)) * 100;
        var rgb = ColorUtil.hslToRgb(currentHue, s, l);
        var idx = (py * w + px) * 4;
        data[idx]     = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }
    elColorFieldCtx.putImageData(imgData, 0, 0);
  }

  /* ============================================================
     drawHueBar â€” Horizontal hue spectrum (0â€“360Â°)
     ============================================================ */
  function drawHueBar() {
    var w = elHueBar.width;
    var h = elHueBar.height;
    var imgData = elHueBarCtx.createImageData(w, h);
    var data = imgData.data;

    for (var px = 0; px < w; px++) {
      var hue = (px / (w - 1)) * 360;
      var rgb = ColorUtil.hslToRgb(hue, 100, 50);
      for (var py = 0; py < h; py++) {
        var idx = (py * w + px) * 4;
        data[idx]     = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }
    elHueBarCtx.putImageData(imgData, 0, 0);
  }

  /* ============================================================
     drawAlphaBar â€” Horizontal gradient from transparent to fg color
     ============================================================ */
  function drawAlphaBar() {
    var w = elAlphaBar.width;
    var h = elAlphaBar.height;
    var c = State.foregroundColor;

    elAlphaBarCtx.clearRect(0, 0, w, h);

    var grad = elAlphaBarCtx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)');
    grad.addColorStop(1, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',1)');
    elAlphaBarCtx.fillStyle = grad;
    elAlphaBarCtx.fillRect(0, 0, w, h);
  }

  /* ============================================================
     loadPreset â€” Load a named preset palette
     ============================================================ */
  function loadPreset(name) {
    var colors = PRESETS[name];
    if (!colors) return;

    activePaletteName = name;
    State.activePaletteColors = colors.slice();
    renderPalette();
  }

  /* ============================================================
     renderPalette â€” Render palette swatches in #palette-grid
     Click = set fg color, right-click = set bg color
     ============================================================ */
  function renderPalette() {
    if (!elPaletteGrid) return;
    elPaletteGrid.innerHTML = '';

    var colors = State.activePaletteColors || [];

    for (var i = 0; i < colors.length; i++) {
      (function (hexColor) {
        var swatch = document.createElement('div');
        swatch.className = 'palette-swatch';
        swatch.style.background = hexColor;
        swatch.title = hexColor;

        /* Check if this matches the current foreground */
        var swatchRGBA = ColorUtil.hexToRgba(hexColor);
        if (_colorsCloseEnough(swatchRGBA, State.foregroundColor)) {
          swatch.classList.add('active');
        }

        /* Left-click â†’ set fg */
        swatch.addEventListener('click', function () {
          var rgba = ColorUtil.hexToRgba(hexColor);
          rgba.a = 255;
          setForegroundColor(rgba);
        });

        /* Right-click â†’ set bg */
        swatch.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          var rgba = ColorUtil.hexToRgba(hexColor);
          rgba.a = 255;
          setBackgroundColor(rgba);
        });

        elPaletteGrid.appendChild(swatch);
      })(colors[i]);
    }
  }

  /* ============================================================
     addCurrentColor â€” Add State.foregroundColor to custom palette
     ============================================================ */
  function addCurrentColor() {
    var c = State.foregroundColor;
    var hex = ColorUtil.rgbaToHex(c.r, c.g, c.b);

    /* Avoid duplicates */
    for (var i = 0; i < State.customPalette.length; i++) {
      if (State.customPalette[i].toLowerCase() === hex.toLowerCase()) return;
    }

    State.customPalette.push(hex);

    /* If currently viewing custom palette, refresh */
    if (elPaletteSelect.value === 'custom') {
      _renderCustomPalette();
    }

    /* Also add to the active palette view regardless */
    if (elPaletteSelect.value !== 'custom') {
      /* Optionally switch to custom palette */
      elPaletteSelect.value = 'custom';
      _renderCustomPalette();
    }
  }

  /* ---- Render custom palette ---- */
  function _renderCustomPalette() {
    activePaletteName = 'custom';
    State.activePaletteColors = State.customPalette.slice();
    renderPalette();
  }

  /* ============================================================
     INTERNAL: Sync HSL state from an RGB color object
     ============================================================ */
  function _syncHSLFromRGB(c) {
    var hsl = ColorUtil.rgbToHsl(c.r, c.g, c.b);
    /* Only update hue if saturation > 0 and lightness is not 0 or 100
       (avoids hue jumps for pure black/white/grays) */
    if (hsl.s > 0 && hsl.l > 0 && hsl.l < 100) {
      currentHue = hsl.h;
    }
    currentSat = hsl.s;
    currentLight = hsl.l;
  }

  /* ============================================================
     INTERNAL: Color field drag handler
     ============================================================ */
  function _handleFieldDrag(e) {
    var rect = elColorFieldWrapper.getBoundingClientRect();
    var x = MathUtil.clamp(e.clientX - rect.left, 0, rect.width);
    var y = MathUtil.clamp(e.clientY - rect.top, 0, rect.height);

    /* x â†’ saturation 0â€“100, y â†’ lightness 100â†’0 */
    currentSat = (x / rect.width) * 100;
    currentLight = 100 - (y / rect.height) * 100;

    var rgb = ColorUtil.hslToRgb(currentHue, currentSat, currentLight);
    State.foregroundColor.r = rgb.r;
    State.foregroundColor.g = rgb.g;
    State.foregroundColor.b = rgb.b;

    drawAlphaBar();
    updateUI();
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     INTERNAL: Hue bar drag handler
     ============================================================ */
  function _handleHueDrag(e) {
    var rect = elHueBar.parentElement.getBoundingClientRect();
    var x = MathUtil.clamp(e.clientX - rect.left, 0, rect.width);

    currentHue = Math.round((x / rect.width) * 360);

    var rgb = ColorUtil.hslToRgb(currentHue, currentSat, currentLight);
    State.foregroundColor.r = rgb.r;
    State.foregroundColor.g = rgb.g;
    State.foregroundColor.b = rgb.b;

    drawColorField();
    drawAlphaBar();
    updateUI();
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     INTERNAL: Alpha bar drag handler
     ============================================================ */
  function _handleAlphaDrag(e) {
    var rect = elAlphaBar.parentElement.getBoundingClientRect();
    var x = MathUtil.clamp(e.clientX - rect.left, 0, rect.width);

    State.foregroundColor.a = Math.round((x / rect.width) * 255);

    updateUI();
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     INTERNAL: Position color field cursor
     ============================================================ */
  function _positionFieldCursor() {
    /* x = sat / 100 * width,  y = (1 - light/100) * height */
    var wrapW = elColorFieldWrapper.clientWidth || 200;
    var wrapH = elColorFieldWrapper.clientHeight || 150;
    var x = (currentSat / 100) * wrapW;
    var y = (1 - currentLight / 100) * wrapH;
    elColorFieldCursor.style.left = x + 'px';
    elColorFieldCursor.style.top = y + 'px';
  }

  /* ============================================================
     INTERNAL: Position hue bar cursor
     ============================================================ */
  function _positionHueCursor() {
    var wrapW = elHueBar.parentElement.clientWidth || 200;
    var x = (currentHue / 360) * wrapW;
    elHueBarCursor.style.left = x + 'px';
  }

  /* ============================================================
     INTERNAL: Position alpha bar cursor
     ============================================================ */
  function _positionAlphaCursor() {
    var wrapW = elAlphaBar.parentElement.clientWidth || 200;
    var x = (State.foregroundColor.a / 255) * wrapW;
    elAlphaBarCursor.style.left = x + 'px';
  }

  /* ============================================================
     INTERNAL: HSL input change handler
     ============================================================ */
  function _onHSLInputChange() {
    currentHue   = MathUtil.clamp(parseInt(elH.value, 10) || 0, 0, 360);
    currentSat   = MathUtil.clamp(parseInt(elS.value, 10) || 0, 0, 100);
    currentLight = MathUtil.clamp(parseInt(elL.value, 10) || 0, 0, 100);

    var rgb = ColorUtil.hslToRgb(currentHue, currentSat, currentLight);
    State.foregroundColor.r = rgb.r;
    State.foregroundColor.g = rgb.g;
    State.foregroundColor.b = rgb.b;

    drawColorField();
    drawAlphaBar();
    updateUI();
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     INTERNAL: RGB input change handler
     ============================================================ */
  function _onRGBInputChange() {
    State.foregroundColor.r = MathUtil.clamp(parseInt(elR.value, 10) || 0, 0, 255);
    State.foregroundColor.g = MathUtil.clamp(parseInt(elG.value, 10) || 0, 0, 255);
    State.foregroundColor.b = MathUtil.clamp(parseInt(elB.value, 10) || 0, 0, 255);

    _syncHSLFromRGB(State.foregroundColor);
    drawColorField();
    drawAlphaBar();
    updateUI();
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     INTERNAL: Hex input change handler
     ============================================================ */
  function _onHexInputChange() {
    var hex = elHex.value.replace(/[^0-9a-fA-F]/g, '');
    if (hex.length < 3) return;

    var rgba = ColorUtil.hexToRgba(hex);
    State.foregroundColor.r = rgba.r;
    State.foregroundColor.g = rgba.g;
    State.foregroundColor.b = rgba.b;
    /* If 8-digit hex, also update alpha */
    if (hex.length >= 8) {
      State.foregroundColor.a = rgba.a;
    }

    _syncHSLFromRGB(State.foregroundColor);
    drawColorField();
    drawAlphaBar();
    updateUI();
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     INTERNAL: Alpha input change handler
     ============================================================ */
  function _onAlphaInputChange() {
    State.foregroundColor.a = MathUtil.clamp(parseInt(elA.value, 10) || 0, 0, 255);
    updateUI();
    EventBus.emit('colorChanged');
  }

  /* ============================================================
     INTERNAL: Highlight matching swatch in palette grid
     ============================================================ */
  function _highlightActiveSwatch() {
    if (!elPaletteGrid) return;
    var swatches = elPaletteGrid.querySelectorAll('.palette-swatch');
    for (var i = 0; i < swatches.length; i++) {
      var hexColor = swatches[i].title;
      var rgba = ColorUtil.hexToRgba(hexColor);
      if (_colorsCloseEnough(rgba, State.foregroundColor)) {
        swatches[i].classList.add('active');
      } else {
        swatches[i].classList.remove('active');
      }
    }
  }

  /* ============================================================
     INTERNAL: Compare two colors (ignoring alpha, tolerance 2)
     ============================================================ */
  function _colorsCloseEnough(a, b) {
    return Math.abs(a.r - b.r) <= 2 &&
           Math.abs(a.g - b.g) <= 2 &&
           Math.abs(a.b - b.b) <= 2;
  }

  /* ============================================================
     Public API
     ============================================================ */
  return {
    init:                init,
    setForegroundColor:  setForegroundColor,
    setBackgroundColor:  setBackgroundColor,
    swapColors:          swapColors,
    updateUI:            updateUI,
    drawColorField:      drawColorField,
    drawHueBar:          drawHueBar,
    drawAlphaBar:        drawAlphaBar,
    loadPreset:          loadPreset,
    renderPalette:       renderPalette,
    addCurrentColor:     addCurrentColor
  };
})();
/* ================================================
   PixelForge â€” Animation Timeline Management
   Frame CRUD, playback, onion skinning,
   timeline rendering with thumbnails
   ================================================ */

window.Animation = (function () {
  'use strict';

  /* ---- DOM element references ---- */
  var elFramesStrip, elFrameCount;
  var elFpsSlider, elFpsValue;
  var elPlayBtn, elPlayIcon;
  var elOnionSkinBtn;

  /* ---- Playback state ---- */
  var playbackRAF = null;     // requestAnimationFrame handle
  var lastFrameTime = 0;      // timestamp of last frame advance
  var prePlayFrameIndex = 0;  // frame index before play started

  /* ============================================================
     init â€” Create initial frame, wire up buttons and events
     ============================================================ */
  function init() {
    /* Cache DOM */
    elFramesStrip  = document.getElementById('frames-strip');
    elFrameCount   = document.getElementById('frame-count');
    elFpsSlider    = document.getElementById('fps-slider');
    elFpsValue     = document.getElementById('fps-value');
    elPlayBtn      = document.getElementById('play-btn');
    elPlayIcon     = document.getElementById('play-icon');
    elOnionSkinBtn = document.getElementById('onion-skin-btn');

    initFrames();

    /* ---- Button handlers ---- */
    document.getElementById('add-frame-btn').addEventListener('click', function () {
      addFrame(false);
    });
    document.getElementById('duplicate-frame-btn').addEventListener('click', function () {
      addFrame(true);
    });
    document.getElementById('delete-frame-btn').addEventListener('click', function () {
      deleteFrame(State.activeFrameIndex);
    });
    document.getElementById('prev-frame-btn').addEventListener('click', function () {
      if (State.activeFrameIndex > 0) {
        selectFrame(State.activeFrameIndex - 1);
      }
    });
    document.getElementById('next-frame-btn').addEventListener('click', function () {
      if (State.activeFrameIndex < State.frames.length - 1) {
        selectFrame(State.activeFrameIndex + 1);
      }
    });
    elPlayBtn.addEventListener('click', function () {
      togglePlay();
    });
    elOnionSkinBtn.addEventListener('click', function () {
      toggleOnionSkin();
    });

    /* ---- FPS slider ---- */
    elFpsSlider.addEventListener('input', function () {
      setFPS(parseInt(elFpsSlider.value, 10));
    });

    /* ---- EventBus listeners ---- */
    EventBus.on('frameChanged', function () {
      renderTimeline();
    });
    EventBus.on('layersChanged', function () {
      /* Update the current frame's thumbnail when layers change */
      _updateCurrentFrameData();
      renderTimeline();
    });
    EventBus.on('render', function () {
      /* Keep frame thumbnail in sync after draw operations */
      _updateCurrentFrameData();
    });

    /* Initial timeline render */
    renderTimeline();
  }

  function initFrames() {
    /* Create initial frame from current layers */
    State.frames = [{
      id:       State.nextFrameId(),
      layers:   (typeof Layers !== 'undefined' && Layers.serializeLayers)
                  ? Layers.serializeLayers()
                  : [],
      duration: 100 // ms per frame
    }];
    State.activeFrameIndex = 0;
  }

  /* ============================================================
     addFrame â€” Add a new frame after the current one
     If duplicate is true, clone current frame's layers.
     Otherwise create a blank frame with the same layer count.
     ============================================================ */
  function addFrame(duplicate) {
    if (State.playing) pause();

    /* Save current frame first */
    saveCurrentFrame();

    var newFrame;
    if (duplicate) {
      /* Clone current frame's serialized layers */
      var clonedLayers = _deepCloneLayerData(State.frames[State.activeFrameIndex].layers);
      newFrame = {
        id:       State.nextFrameId(),
        layers:   clonedLayers,
        duration: State.frames[State.activeFrameIndex].duration
      };
    } else {
      /* Create blank frame with matching layer structure */
      var blankLayers = [];
      for (var i = 0; i < State.layers.length; i++) {
        var pair = CanvasUtil.createCanvas(State.width, State.height);
        blankLayers.push({
          id:        State.nextLayerId(),
          name:      State.layers[i].name,
          dataURL:   pair.canvas.toDataURL(),
          visible:   true,
          opacity:   100,
          blendMode: 'source-over',
          locked:    false
        });
      }
      newFrame = {
        id:       State.nextFrameId(),
        layers:   blankLayers,
        duration: 100
      };
    }

    /* Insert after current frame */
    State.frames.splice(State.activeFrameIndex + 1, 0, newFrame);

    /* Switch to the new frame */
    _switchToFrame(State.activeFrameIndex + 1);

    EventBus.emit('frameChanged');
    EventBus.emit('dirty');
  }

  /* ============================================================
     deleteFrame â€” Remove frame at index. Keep at least 1 frame.
     ============================================================ */
  function deleteFrame(index) {
    if (State.frames.length <= 1) return;
    if (index < 0 || index >= State.frames.length) return;
    if (State.playing) pause();

    State.frames.splice(index, 1);

    /* Switch to nearest valid frame */
    var newIndex = Math.min(index, State.frames.length - 1);
    _switchToFrame(newIndex);

    EventBus.emit('frameChanged');
    EventBus.emit('dirty');
  }

  /* ============================================================
     selectFrame â€” Switch to a different frame by index
     ============================================================ */
  function selectFrame(index) {
    if (index < 0 || index >= State.frames.length) return;
    if (index === State.activeFrameIndex) return;
    if (State.playing) pause();

    /* Save current layers into current frame slot */
    saveCurrentFrame();

    /* Load target frame */
    _switchToFrame(index);

    EventBus.emit('frameChanged');
  }

  /* ============================================================
     saveCurrentFrame â€” Serialize current State.layers into
                        State.frames[State.activeFrameIndex].layers
     ============================================================ */
  function saveCurrentFrame() {
    if (State.activeFrameIndex < 0 || State.activeFrameIndex >= State.frames.length) return;
    if (typeof Layers !== 'undefined' && Layers.serializeLayers) {
      State.frames[State.activeFrameIndex].layers = Layers.serializeLayers();
    }
  }

  /* ============================================================
     loadFrame â€” Deserialize State.frames[index].layers into
                 State.layers
     ============================================================ */
  function loadFrame(index) {
    if (index < 0 || index >= State.frames.length) return;
    var frameData = State.frames[index].layers;
    if (typeof Layers !== 'undefined' && Layers.deserializeLayers) {
      Layers.deserializeLayers(frameData);
    }
  }

  /* ============================================================
     _switchToFrame â€” Internal: set active index and load layers
     ============================================================ */
  function _switchToFrame(index) {
    State.activeFrameIndex = index;
    loadFrame(index);
  }

  /* ============================================================
     _updateCurrentFrameData â€” Silently update the stored data for
                                the current frame without reloading
     ============================================================ */
  function _updateCurrentFrameData() {
    if (State.playing) return; // don't overwrite during playback
    if (State.activeFrameIndex >= 0 &&
        State.activeFrameIndex < State.frames.length &&
        typeof Layers !== 'undefined' && Layers.serializeLayers) {
      State.frames[State.activeFrameIndex].layers = Layers.serializeLayers();
    }
  }

  /* ============================================================
     play â€” Start animation playback
     ============================================================ */
  function play() {
    if (State.frames.length <= 1) return;
    if (State.playing) return;

    /* Save current frame state */
    saveCurrentFrame();
    prePlayFrameIndex = State.activeFrameIndex;
    State.playing = true;

    /* Update play button to show pause icon */
    elPlayIcon.innerHTML = '<rect x="4" y="3" width="3" height="10" fill="currentColor"/><rect x="9" y="3" width="3" height="10" fill="currentColor"/>';
    elPlayBtn.classList.add('active');

    lastFrameTime = performance.now();
    playbackRAF = requestAnimationFrame(_playbackLoop);
  }

  /* ============================================================
     pause â€” Stop animation playback
     ============================================================ */
  function pause() {
    if (!State.playing) return;

    State.playing = false;
    if (playbackRAF) {
      cancelAnimationFrame(playbackRAF);
      playbackRAF = null;
    }

    /* Update play button to show play icon */
    elPlayIcon.innerHTML = '<polygon points="5,3 13,8 5,13" fill="currentColor"/>';
    elPlayBtn.classList.remove('active');

    /* Restore the frame the user was on (or stay on current) */
    _switchToFrame(State.activeFrameIndex);
    EventBus.emit('frameChanged');
    EventBus.emit('render');
  }

  /* ============================================================
     togglePlay â€” Toggle between play and pause
     ============================================================ */
  function togglePlay() {
    if (State.playing) {
      pause();
    } else {
      play();
    }
  }

  /* ============================================================
     _playbackLoop â€” requestAnimationFrame callback for playback
     Advances frames based on FPS and per-frame duration.
     Composites and displays without modifying layer state.
     ============================================================ */
  function _playbackLoop(timestamp) {
    if (!State.playing) return;

    var currentFrame = State.frames[State.activeFrameIndex];
    /* Duration for this frame: use per-frame duration or fall back to FPS */
    var frameDuration = currentFrame.duration || (1000 / State.fps);

    if (timestamp - lastFrameTime >= frameDuration) {
      lastFrameTime = timestamp;

      /* Advance to next frame (loop) */
      var nextIndex = (State.activeFrameIndex + 1) % State.frames.length;
      State.activeFrameIndex = nextIndex;

      /* Composite and render the frame directly to the display canvas
         without fully loading into State.layers to avoid overhead */
      _renderPlaybackFrame(nextIndex);

      /* Update timeline highlight */
      renderTimeline();
    }

    playbackRAF = requestAnimationFrame(_playbackLoop);
  }

  /* ============================================================
     _renderPlaybackFrame â€” Composite a frame's layers directly
                             to the display canvas during playback
     ============================================================ */
  function _renderPlaybackFrame(frameIndex) {
    var frame = State.frames[frameIndex];
    if (!frame || !frame.layers) return;

    /* Create a compositing canvas at art resolution */
    var comp = CanvasUtil.createCanvas(State.width, State.height);

    var layersToRender = frame.layers;
    var loaded = 0;
    var total = layersToRender.length;

    if (total === 0) {
      /* Empty frame â€” just emit render */
      EventBus.emit('render');
      return;
    }

    /* Load each layer image and composite */
    for (var i = 0; i < total; i++) {
      (function (entry, layerIndex) {
        if (!entry.visible) {
          loaded++;
          if (loaded === total) _finalizePlaybackRender(comp);
          return;
        }

        var img = new Image();
        img.onload = function () {
          comp.ctx.save();
          comp.ctx.globalAlpha = (entry.opacity || 100) / 100;
          comp.ctx.globalCompositeOperation = entry.blendMode || 'source-over';
          comp.ctx.drawImage(img, 0, 0);
          comp.ctx.restore();
          loaded++;
          if (loaded === total) _finalizePlaybackRender(comp);
        };
        img.onerror = function () {
          loaded++;
          if (loaded === total) _finalizePlaybackRender(comp);
        };
        img.src = entry.dataURL;
      })(layersToRender[i], i);
    }
  }

  /* ============================================================
     _finalizePlaybackRender â€” Draw composited playback frame
                                to the display canvas
     ============================================================ */
  function _finalizePlaybackRender(comp) {
    /* Temporarily load the composited image into the first layer
       and emit render so the Canvas module picks it up.
       Or, if a Canvas.renderComposite exists, use it directly. */
    EventBus.emit('playbackRender', comp.canvas);
  }

  /* ============================================================
     setFPS â€” Update State.fps and UI
     ============================================================ */
  function setFPS(fps) {
    State.fps = MathUtil.clamp(fps, 1, 60);
    elFpsSlider.value = State.fps;
    elFpsValue.textContent = State.fps;
  }

  /* ============================================================
     toggleOnionSkin â€” Toggle onion skinning mode
     ============================================================ */
  function toggleOnionSkin() {
    State.onionSkinning = !State.onionSkinning;
    if (State.onionSkinning) {
      elOnionSkinBtn.classList.add('active');
    } else {
      elOnionSkinBtn.classList.remove('active');
    }
    EventBus.emit('render');
  }

  /* ============================================================
     renderTimeline â€” Update #frames-strip with frame thumbnails
     ============================================================ */
  function renderTimeline() {
    if (!elFramesStrip) return;

    elFramesStrip.innerHTML = '';

    for (var i = 0; i < State.frames.length; i++) {
      (function (frameIndex) {
        var frame = State.frames[frameIndex];
        var isActive = (frameIndex === State.activeFrameIndex);

        /* Container */
        var thumb = document.createElement('div');
        thumb.className = 'frame-thumb' + (isActive ? ' active' : '');
        thumb.setAttribute('data-frame-index', frameIndex);

        /* Preview canvas â€” composite all layers */
        var previewCanvas = document.createElement('canvas');
        previewCanvas.width = State.width;
        previewCanvas.height = State.height;
        var previewCtx = previewCanvas.getContext('2d');
        previewCtx.imageSmoothingEnabled = false;

        /* If this is the active frame, composite from live State.layers */
        if (isActive && !State.playing) {
          for (var j = 0; j < State.layers.length; j++) {
            var layer = State.layers[j];
            if (!layer.visible) continue;
            previewCtx.save();
            previewCtx.globalAlpha = layer.opacity / 100;
            previewCtx.globalCompositeOperation = layer.blendMode;
            previewCtx.drawImage(layer.canvas, 0, 0);
            previewCtx.restore();
          }
          thumb.appendChild(previewCanvas);
          _appendFrameLabels(thumb, frameIndex, frame);
          elFramesStrip.appendChild(thumb);
          _attachFrameEvents(thumb, frameIndex);
        } else {
          /* Load from serialized data */
          _compositeFrameToCanvas(frame.layers, previewCanvas, previewCtx, function () {
            /* Already appended â€” just ensures images are drawn */
          });
          thumb.appendChild(previewCanvas);
          _appendFrameLabels(thumb, frameIndex, frame);
          elFramesStrip.appendChild(thumb);
          _attachFrameEvents(thumb, frameIndex);
        }
      })(i);
    }

    /* Update frame count label */
    elFrameCount.textContent = 'Frame ' + (State.activeFrameIndex + 1) + '/' + State.frames.length;
  }

  /* ============================================================
     _appendFrameLabels â€” Add frame number and duration labels
     ============================================================ */
  function _appendFrameLabels(thumb, frameIndex, frame) {
    var numLabel = document.createElement('span');
    numLabel.className = 'frame-number';
    numLabel.textContent = frameIndex + 1;
    thumb.appendChild(numLabel);

    var durLabel = document.createElement('span');
    durLabel.className = 'frame-duration';
    durLabel.textContent = frame.duration + 'ms';
    thumb.appendChild(durLabel);
  }

  /* ============================================================
     _attachFrameEvents â€” Click, double-click on frame thumbnails
     ============================================================ */
  function _attachFrameEvents(thumb, frameIndex) {
    /* Click to select */
    thumb.addEventListener('click', function () {
      selectFrame(frameIndex);
    });

    /* Double-click to edit duration */
    thumb.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      _editFrameDuration(thumb, frameIndex);
    });
  }

  /* ============================================================
     _editFrameDuration â€” Inline input to change frame duration
     ============================================================ */
  function _editFrameDuration(thumb, frameIndex) {
    var durLabel = thumb.querySelector('.frame-duration');
    if (!durLabel) return;

    var input = document.createElement('input');
    input.type = 'number';
    input.min = '10';
    input.max = '10000';
    input.value = State.frames[frameIndex].duration;
    input.style.cssText = 'position:absolute;bottom:2px;right:2px;width:50px;height:16px;font-size:9px;padding:0 2px;z-index:10;';

    durLabel.replaceWith(input);
    input.focus();
    input.select();

    function commit() {
      var val = MathUtil.clamp(parseInt(input.value, 10) || 100, 10, 10000);
      State.frames[frameIndex].duration = val;
      renderTimeline();
      EventBus.emit('dirty');
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        input.blur();
      } else if (ev.key === 'Escape') {
        input.removeEventListener('blur', commit);
        renderTimeline();
      }
    });
  }

  /* ============================================================
     _compositeFrameToCanvas â€” Load serialized layer data and
                                composite onto a canvas
     ============================================================ */
  function _compositeFrameToCanvas(layerDataArray, canvas, ctx, callback) {
    if (!layerDataArray || layerDataArray.length === 0) {
      if (callback) callback();
      return;
    }

    var loaded = 0;
    var total = layerDataArray.length;

    /* We need to draw layers in order, so collect images first */
    var images = new Array(total);

    for (var i = 0; i < total; i++) {
      (function (idx) {
        var entry = layerDataArray[idx];
        if (!entry.visible) {
          images[idx] = null;
          loaded++;
          if (loaded === total) _drawAllLayers();
          return;
        }

        var img = new Image();
        img.onload = function () {
          images[idx] = { img: img, opacity: entry.opacity, blendMode: entry.blendMode };
          loaded++;
          if (loaded === total) _drawAllLayers();
        };
        img.onerror = function () {
          images[idx] = null;
          loaded++;
          if (loaded === total) _drawAllLayers();
        };
        img.src = entry.dataURL;
      })(i);
    }

    function _drawAllLayers() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var k = 0; k < images.length; k++) {
        if (!images[k]) continue;
        ctx.save();
        ctx.globalAlpha = (images[k].opacity || 100) / 100;
        ctx.globalCompositeOperation = images[k].blendMode || 'source-over';
        ctx.drawImage(images[k].img, 0, 0);
        ctx.restore();
      }
      if (callback) callback();
    }
  }

  /* ============================================================
     getOnionData â€” Return composited canvases for adjacent frames
     Used by Canvas.render for onion skinning overlay.
     Returns { prev: canvas|null, next: canvas|null }
     ============================================================ */
  function getOnionData() {
    if (!State.onionSkinning || State.frames.length <= 1) {
      return { prev: null, next: null };
    }

    var result = { prev: null, next: null };
    var framesCount = State.onionFrames || 1;

    /* Previous frame */
    var prevIndex = State.activeFrameIndex - 1;
    if (prevIndex >= 0) {
      var prevComp = CanvasUtil.createCanvas(State.width, State.height);
      var prevFrame = State.frames[prevIndex];
      _compositeFrameToCanvasSync(prevFrame.layers, prevComp.canvas, prevComp.ctx);
      result.prev = prevComp.canvas;
    }

    /* Next frame */
    var nextIndex = State.activeFrameIndex + 1;
    if (nextIndex < State.frames.length) {
      var nextComp = CanvasUtil.createCanvas(State.width, State.height);
      var nextFrame = State.frames[nextIndex];
      _compositeFrameToCanvasSync(nextFrame.layers, nextComp.canvas, nextComp.ctx);
      result.next = nextComp.canvas;
    }

    return result;
  }

  /* ============================================================
     _compositeFrameToCanvasSync â€” Synchronous version that draws
     from already-loaded dataURLs using cached images. Falls back
     to creating images (may render blank on first call due to
     async image loading; this is acceptable for onion skin which
     re-renders on layer changes).
     ============================================================ */
  function _compositeFrameToCanvasSync(layerDataArray, canvas, ctx) {
    if (!layerDataArray || layerDataArray.length === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* Use async compositing with immediate image creation */
    for (var i = 0; i < layerDataArray.length; i++) {
      var entry = layerDataArray[i];
      if (!entry.visible) continue;

      var img = new Image();
      img.src = entry.dataURL;

      /* If cached (same-origin dataURL), drawImage may work synchronously */
      try {
        ctx.save();
        ctx.globalAlpha = (entry.opacity || 100) / 100;
        ctx.globalCompositeOperation = entry.blendMode || 'source-over';
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      } catch (e) {
        /* Image not yet loaded â€” will appear on next render cycle */
        ctx.restore();
      }
    }
  }

  /* ============================================================
     _deepCloneLayerData â€” Deep-copy serialized layer data array
     ============================================================ */
  function _deepCloneLayerData(layerDataArray) {
    var clone = [];
    for (var i = 0; i < layerDataArray.length; i++) {
      var entry = layerDataArray[i];
      clone.push({
        id:        State.nextLayerId(),
        name:      entry.name,
        dataURL:   entry.dataURL,
        visible:   entry.visible,
        opacity:   entry.opacity,
        blendMode: entry.blendMode,
        locked:    entry.locked
      });
    }
    return clone;
  }

  /* ============================================================
     Public API
     ============================================================ */
  return {
    init:             init,
    initFrames:       initFrames,
    addFrame:         addFrame,
    deleteFrame:      deleteFrame,
    selectFrame:      selectFrame,
    saveCurrentFrame: saveCurrentFrame,
    loadFrame:        loadFrame,
    play:             play,
    pause:            pause,
    togglePlay:       togglePlay,
    setFPS:           setFPS,
    toggleOnionSkin:  toggleOnionSkin,
    renderTimeline:   renderTimeline,
    getOnionData:     getOnionData
  };
})();
/* ================================================
   PixelForge â€” History (Undo / Redo)
   Full snapshot-based undo/redo system
   ================================================ */

window.History = (function () {
  'use strict';

  /* ---- Initialisation ---- */

  /**
   * Bind to EventBus so the history panel refreshes
   * whenever the history stack changes.
   */
  function init() {
    EventBus.on('historyChanged', renderPanel);
    EventBus.on('pushHistory', function (data) {
      pushState(data.name);
    });
    pushState('Project Loaded');
  }

  /* ---- Snapshot helpers ---- */

  /**
   * Capture the entire drawable state as a plain object.
   * Each layer's pixel content is stored as ImageData so
   * it can be cheaply written back with putImageData.
   */
  function captureSnapshot(description) {
    const layerSnapshots = State.layers.map(function (layer) {
      return {
        id:        layer.id,
        name:      layer.name,
        visible:   layer.visible,
        opacity:   layer.opacity,
        blendMode: layer.blendMode,
        locked:    layer.locked,
        imageData: layer.ctx.getImageData(0, 0, State.width, State.height)
      };
    });

    return {
      description:      description,
      width:            State.width,
      height:           State.height,
      activeLayerIndex: State.activeLayerIndex,
      activeFrameIndex: State.activeFrameIndex,
      layers:           layerSnapshots
    };
  }

  /* ---- Public API ---- */

  /**
   * Push the current state onto the history stack.
   * Any redo states (entries after historyIndex) are discarded.
   *
   * @param {string} description - Human-readable label for this action
   */
  function pushState(description) {
    var snapshot = captureSnapshot(description);

    // Truncate any future (redo) states
    State.history = State.history.slice(0, State.historyIndex + 1);

    // Push the new snapshot
    State.history.push(snapshot);

    // Enforce maximum history depth
    if (State.history.length > State.maxHistory) {
      State.history.shift();               // remove oldest
    } else {
      State.historyIndex++;                // only bump if we did not shift
    }

    // Keep index at the tip
    State.historyIndex = State.history.length - 1;

    EventBus.emit('historyChanged');
    State.dirty = true;
    EventBus.emit('dirty');
  }

  /**
   * Undo: step one entry back in the history stack.
   */
  function undo() {
    if (!canUndo()) return;
    State.historyIndex--;
    restoreState(State.history[State.historyIndex]);
    EventBus.emit('historyChanged');
  }

  /**
   * Redo: step one entry forward in the history stack.
   */
  function redo() {
    if (!canRedo()) return;
    State.historyIndex++;
    restoreState(State.history[State.historyIndex]);
    EventBus.emit('historyChanged');
  }

  /** @returns {boolean} true if an undo operation is possible */
  function canUndo() {
    return State.historyIndex > 0;
  }

  /** @returns {boolean} true if a redo operation is possible */
  function canRedo() {
    return State.historyIndex < State.history.length - 1;
  }

  /**
   * Apply a previously captured snapshot, restoring every
   * layer canvas and all associated State properties.
   *
   * @param {object} snapshot - Object produced by captureSnapshot
   */
  function restoreState(snapshot) {
    if (!snapshot) return;

    // Restore canvas dimensions if they changed
    State.width  = snapshot.width;
    State.height = snapshot.height;

    // Restore active indices
    State.activeLayerIndex = snapshot.activeLayerIndex;
    State.activeFrameIndex = snapshot.activeFrameIndex;

    // Number of layers may have changed â€” rebuild the array
    // while reusing existing canvas elements where possible.
    var newLayers = [];
    for (var i = 0; i < snapshot.layers.length; i++) {
      var snap = snapshot.layers[i];

      // Create (or re-create) the offscreen canvas at the right size
      var pair = CanvasUtil.createCanvas(snapshot.width, snapshot.height);

      // Write the stored ImageData onto the canvas
      pair.ctx.putImageData(snap.imageData, 0, 0);

      newLayers.push({
        id:        snap.id,
        name:      snap.name,
        canvas:    pair.canvas,
        ctx:       pair.ctx,
        visible:   snap.visible,
        opacity:   snap.opacity,
        blendMode: snap.blendMode,
        locked:    snap.locked
      });
    }

    State.layers = newLayers;

    // Fallback: If no layers exist, create a default one
    if (State.layers.length === 0) {
      var pair = CanvasUtil.createCanvas(State.width, State.height);
      State.layers.push({
        id:        State.nextLayerId ? State.nextLayerId() : 1,
        name:      'Layer 1',
        canvas:    pair.canvas,
        ctx:       pair.ctx,
        visible:   true,
        opacity:   100,
        blendMode: 'source-over',
        locked:    false
      });
    }

    // Clamp activeLayerIndex and activeFrameIndex
    State.activeLayerIndex = Math.max(0, Math.min(State.layers.length - 1, State.activeLayerIndex || 0));
    if (State.frames && State.frames.length > 0) {
      State.activeFrameIndex = Math.max(0, Math.min(State.frames.length - 1, State.activeFrameIndex || 0));
    } else {
      State.activeFrameIndex = 0;
    }

    // Notify the rest of the app to refresh
    EventBus.emit('layersChanged');
    EventBus.emit('render');
  }

  /* ---- Panel rendering ---- */

  /**
   * Re-draw the #history-list panel to reflect the current
   * history stack.  Active index is highlighted; future
   * (redo) entries are visually dimmed.  Clicking an entry
   * jumps directly to that state.
   */
  function renderPanel() {
    var list = document.getElementById('history-list');
    if (!list) return;

    list.innerHTML = '';

    if (State.history.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No history yet';
      list.appendChild(empty);
      return;
    }

    for (var i = 0; i < State.history.length; i++) {
      (function (index) {
        var item = document.createElement('div');
        item.className = 'history-item';

        // Highlight the active snapshot
        if (index === State.historyIndex) {
          item.classList.add('active');
        }

        // Dim future (redo) entries
        if (index > State.historyIndex) {
          item.classList.add('future');
        }

        // Index badge
        var badge = document.createElement('span');
        badge.className = 'history-index';
        badge.textContent = index + 1;

        // Description text
        var desc = document.createElement('span');
        desc.className = 'history-desc';
        desc.textContent = State.history[index].description || 'Action';

        item.appendChild(badge);
        item.appendChild(desc);

        // Click â†’ jump to this state
        item.addEventListener('click', function () {
          jumpToState(index);
        });

        list.appendChild(item);
      })(i);
    }

    // Scroll the active entry into view
    var active = list.querySelector('.history-item.active');
    if (active) {
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Jump directly to any state in the history stack.
   *
   * @param {number} index - Target history index
   */
  function jumpToState(index) {
    if (index < 0 || index >= State.history.length) return;
    State.historyIndex = index;
    restoreState(State.history[index]);
    EventBus.emit('historyChanged');
  }

  /**
   * Clear the entire history stack (used when creating
   * or loading a new project).
   */
  function clear() {
    State.history      = [];
    State.historyIndex = -1;
    EventBus.emit('historyChanged');
  }

  /* ---- Expose public API ---- */

  return {
    init:         init,
    pushState:    pushState,
    undo:         undo,
    redo:         redo,
    canUndo:      canUndo,
    canRedo:      canRedo,
    restoreState: restoreState,
    renderPanel:  renderPanel,
    clear:        clear
  };
})();
/* ================================================
   PixelForge â€” Built-in Templates
   Provides starter projects with pre-set sizes,
   palettes, and optional guide / outline layers.
   ================================================ */

window.Templates = (function () {
  'use strict';

  /* =========================================================
     Palette definitions (hex strings without '#')
     ========================================================= */

  var PICO8 = [
    '000000','1D2B53','7E2553','008751',
    'AB5236','5F574F','C2C3C7','FFF1E8',
    'FF004D','FFA300','FFEC27','00E436',
    '29ADFF','83769C','FF77A8','FFCCAA'
  ];

  var ENDESGA32 = [
    'BE4A2F','D77643','EAD4AA','E4A672',
    'B86F50','733E39','3E2731','A22633',
    'E43B44','F77622','FEAE34','FEE761',
    '63C74D','3E8948','265C42','193C3E',
    '124E89','0099DB','2CE8F5','FFFFFF',
    'C0CBDC','8B9BB4','5A6988','3A4466',
    '262B44','181425','FF0044','68386C',
    'B55088','F6757A','E8B796','C28569'
  ];

  var SWEETIE16 = [
    '1A1C2C','5D275D','B13E53','EF7D57',
    'FFCD75','A7F070','38B764','257179',
    '29366F','3B5DC9','41A6F6','73EFF7',
    'F4F4F4','94B0C2','566C86','333C57'
  ];

  var GAMEBOY = [
    '0F380F','306230','8BAC0F','9BBC0F'
  ];

  /* =========================================================
     Template definitions
     ========================================================= */

  var templates = [

    /* ---------- 1. Blank 16Ã—16 ---------- */
    {
      name: 'Blank 16Ã—16',
      width: 16, height: 16,
      description: 'Empty 16Ã—16 canvas with the PICO-8 palette.',
      palette: PICO8,
      layers: [
        { name: 'Layer 1', pixels: [] }
      ]
    },

    /* ---------- 2. Blank 32Ã—32 ---------- */
    {
      name: 'Blank 32Ã—32',
      width: 32, height: 32,
      description: 'Empty 32Ã—32 canvas with the Endesga 32 palette.',
      palette: ENDESGA32,
      layers: [
        { name: 'Layer 1', pixels: [] }
      ]
    },

    /* ---------- 3. Blank 64Ã—64 ---------- */
    {
      name: 'Blank 64Ã—64',
      width: 64, height: 64,
      description: 'Empty 64Ã—64 canvas with the Sweetie 16 palette.',
      palette: SWEETIE16,
      layers: [
        { name: 'Layer 1', pixels: [] }
      ]
    },

    /* ---------- 4. Character Side 16Ã—16 ---------- */
    {
      name: 'Character Side 16Ã—16',
      width: 16, height: 16,
      description: 'Side-view humanoid silhouette guide for small sprites.',
      palette: PICO8,
      layers: [
        { name: 'Character', pixels: [] },
        {
          name: 'Guide',
          pixels: (function () {
            var px = [];
            // Head (3Ã—3 at columns 7-9, rows 1-3)
            for (var hy = 1; hy <= 3; hy++)
              for (var hx = 7; hx <= 9; hx++)
                px.push([hx, hy]);
            // Neck
            px.push([8, 4]);
            // Body (1px wide, rows 5-8)
            for (var by = 5; by <= 8; by++) px.push([8, by]);
            // Back arm (left of body)
            px.push([6, 6]); px.push([7, 6]);
            // Front arm (right of body)
            px.push([9, 6]); px.push([10, 6]);
            // Left leg
            px.push([7, 9]); px.push([6, 10]); px.push([5, 11]);
            // Right leg
            px.push([9, 9]); px.push([10, 10]); px.push([11, 11]);
            return px;
          })(),
          guide: true, color: '83769C'
        }
      ]
    },

    /* ---------- 5. Character Front 16Ã—16 ---------- */
    {
      name: 'Character Front 16Ã—16',
      width: 16, height: 16,
      description: 'Front-facing humanoid guide for small sprites.',
      palette: PICO8,
      layers: [
        { name: 'Character', pixels: [] },
        {
          name: 'Guide',
          pixels: (function () {
            var px = [];
            // Head (4Ã—4 centered at columns 6-9, rows 1-4)
            for (var hy = 1; hy <= 4; hy++)
              for (var hx = 6; hx <= 9; hx++)
                px.push([hx, hy]);
            // Body (4Ã—6 at columns 6-9, rows 5-10)
            for (var by = 5; by <= 10; by++)
              for (var bx = 6; bx <= 9; bx++)
                px.push([bx, by]);
            // Left arm
            px.push([5, 5]); px.push([4, 6]); px.push([4, 7]);
            // Right arm
            px.push([10, 5]); px.push([11, 6]); px.push([11, 7]);
            // Left leg
            px.push([6, 11]); px.push([6, 12]); px.push([7, 11]); px.push([7, 12]);
            // Right leg
            px.push([8, 11]); px.push([8, 12]); px.push([9, 11]); px.push([9, 12]);
            return px;
          })(),
          guide: true, color: '83769C'
        }
      ]
    },

    /* ---------- 6. Top-Down RPG 16Ã—16 ---------- */
    {
      name: 'Top-Down RPG 16Ã—16',
      width: 16, height: 16,
      description: 'Top-down RPG-style character guide (circle head, body rectangle).',
      palette: SWEETIE16,
      layers: [
        { name: 'Character', pixels: [] },
        {
          name: 'Guide',
          pixels: (function () {
            var px = [];
            // Circular head outline (rows 2-6, centered at col 8)
            // Approximate small circle
            px.push([7, 2]); px.push([8, 2]);
            px.push([6, 3]); px.push([9, 3]);
            px.push([6, 4]); px.push([9, 4]);
            px.push([6, 5]); px.push([9, 5]);
            px.push([7, 6]); px.push([8, 6]);
            // Body rectangle outline (rows 7-12, columns 5-10)
            for (var x = 5; x <= 10; x++) { px.push([x, 7]); px.push([x, 12]); }
            for (var y = 8; y <= 11; y++) { px.push([5, y]); px.push([10, y]); }
            // Feet
            px.push([6, 13]); px.push([7, 13]);
            px.push([8, 13]); px.push([9, 13]);
            return px;
          })(),
          guide: true, color: '566C86'
        }
      ]
    },

    /* ---------- 7. Tileset 128Ã—128 ---------- */
    {
      name: 'Tileset 128Ã—128',
      width: 128, height: 128,
      description: '8Ã—8 grid of 16Ã—16 tiles with grid guide lines.',
      palette: ENDESGA32,
      layers: [
        { name: 'Tiles', pixels: [] },
        {
          name: 'Grid Guide',
          pixels: (function () {
            var px = [];
            // Vertical lines every 16 pixels
            for (var gx = 16; gx < 128; gx += 16)
              for (var gy = 0; gy < 128; gy++)
                px.push([gx, gy]);
            // Horizontal lines every 16 pixels
            for (var gy2 = 16; gy2 < 128; gy2 += 16)
              for (var gx2 = 0; gx2 < 128; gx2++)
                px.push([gx2, gy2]);
            return px;
          })(),
          guide: true, color: '3A4466'
        }
      ]
    },

    /* ---------- 8. Icon 32Ã—32 ---------- */
    {
      name: 'Icon 32Ã—32',
      width: 32, height: 32,
      description: 'Icon template with a rounded-rectangle boundary guide.',
      palette: SWEETIE16,
      layers: [
        { name: 'Icon', pixels: [] },
        {
          name: 'Boundary Guide',
          pixels: (function () {
            var px = [];
            var m = 2; // margin
            var w = 32, h = 32;
            var r = 3; // corner radius

            // Top and bottom edges (excluding corners)
            for (var x = m + r; x <= w - 1 - m - r; x++) {
              px.push([x, m]);
              px.push([x, h - 1 - m]);
            }
            // Left and right edges (excluding corners)
            for (var y = m + r; y <= h - 1 - m - r; y++) {
              px.push([m, y]);
              px.push([w - 1 - m, y]);
            }
            // Corners (quarter circles with radius r)
            // Top-left
            px.push([m + 1, m + 1]); px.push([m + 2, m]); px.push([m, m + 2]);
            px.push([m + 1, m + 2]); px.push([m + 2, m + 1]);
            // Top-right
            px.push([w-1-m-1, m+1]); px.push([w-1-m-2, m]); px.push([w-1-m, m+2]);
            px.push([w-1-m-1, m+2]); px.push([w-1-m-2, m+1]);
            // Bottom-left
            px.push([m+1, h-1-m-1]); px.push([m+2, h-1-m]); px.push([m, h-1-m-2]);
            px.push([m+1, h-1-m-2]); px.push([m+2, h-1-m-1]);
            // Bottom-right
            px.push([w-1-m-1, h-1-m-1]); px.push([w-1-m-2, h-1-m]); px.push([w-1-m, h-1-m-2]);
            px.push([w-1-m-1, h-1-m-2]); px.push([w-1-m-2, h-1-m-1]);
            return px;
          })(),
          guide: true, color: '566C86'
        }
      ]
    },

    /* ---------- 9. Game Boy Sprite 8Ã—8 ---------- */
    {
      name: 'Game Boy Sprite 8Ã—8',
      width: 8, height: 8,
      description: 'Tiny 8Ã—8 canvas with the classic Game Boy 4-colour palette.',
      palette: GAMEBOY,
      layers: [
        { name: 'Sprite', pixels: [] }
      ]
    },

    /* ---------- 10. Platformer Character 16Ã—32 ---------- */
    {
      name: 'Platformer Character 16Ã—32',
      width: 16, height: 32,
      description: 'Tall character sprite with 4 walk-cycle animation frames and guide outlines.',
      palette: PICO8,
      frames: 4,
      layers: [
        { name: 'Character', pixels: [] },
        {
          name: 'Guide',
          pixels: (function () {
            var px = [];
            // Head (5Ã—5 centred at 6-10, rows 2-6)
            for (var hy = 2; hy <= 6; hy++)
              for (var hx = 6; hx <= 10; hx++)
                px.push([hx, hy]);
            // Neck
            px.push([7, 7]); px.push([8, 7]); px.push([9, 7]);
            // Torso (columns 5-10, rows 8-18)
            for (var by = 8; by <= 18; by++) {
              px.push([5, by]); px.push([10, by]);
            }
            for (var tx = 5; tx <= 10; tx++) {
              px.push([tx, 8]); px.push([tx, 18]);
            }
            // Left arm
            px.push([4, 9]); px.push([3, 10]); px.push([3, 11]);
            px.push([3, 12]); px.push([3, 13]);
            // Right arm
            px.push([11, 9]); px.push([12, 10]); px.push([12, 11]);
            px.push([12, 12]); px.push([12, 13]);
            // Left leg
            for (var ly = 19; ly <= 28; ly++) px.push([6, ly]);
            px.push([7, 19]); px.push([7, 28]);
            // Right leg
            for (var ry = 19; ry <= 28; ry++) px.push([9, ry]);
            px.push([8, 19]); px.push([8, 28]);
            // Feet
            px.push([5, 29]); px.push([6, 29]); px.push([7, 29]);
            px.push([8, 29]); px.push([9, 29]); px.push([10, 29]);
            return px;
          })(),
          guide: true, color: '83769C'
        }
      ]
    }
  ];

  /* =========================================================
     API
     ========================================================= */

  function init() {
    // No setup required â€” templates are pure data.
  }

  /**
   * Return the full list of template definitions.
   */
  function getList() {
    return templates.map(function (t) {
      return {
        name:        t.name,
        width:       t.width,
        height:      t.height,
        description: t.description
      };
    });
  }

  /**
   * Load a template by name, creating a fresh project.
   *
   * @param {string} templateName - Must match one of the template .name values.
   */
  function load(templateName) {
    var tpl = null;
    for (var i = 0; i < templates.length; i++) {
      if (templates[i].name === templateName) { tpl = templates[i]; break; }
    }
    if (!tpl) {
      console.warn('[Templates] Unknown template: ' + templateName);
      return;
    }

    // Reset State dimensions
    State.width  = tpl.width;
    State.height = tpl.height;

    // Reset IDs
    State._nextLayerId  = 1;
    State._nextFrameId  = 1;

    // Build layers
    State.layers = [];
    tpl.layers.forEach(function (layerDef) {
      var pair = CanvasUtil.createCanvas(tpl.width, tpl.height);
      var layer = {
        id:        State.nextLayerId(),
        name:      layerDef.name,
        canvas:    pair.canvas,
        ctx:       pair.ctx,
        visible:   true,
        opacity:   100,
        blendMode: 'source-over',
        locked:    false
      };

      // Draw guide / outline pixels
      if (layerDef.pixels && layerDef.pixels.length > 0) {
        var color;
        if (layerDef.color) {
          color = ColorUtil.hexToRgba(layerDef.color);
        } else {
          color = { r: 0, g: 0, b: 0, a: 255 };
        }
        layerDef.pixels.forEach(function (pt) {
          CanvasUtil.setPixel(pair.ctx, pt[0], pt[1], color);
        });

        // Guide layers default to 50 % opacity and locked
        if (layerDef.guide) {
          layer.opacity = 50;
          layer.locked  = true;
        }
      }

      State.layers.push(layer);
    });

    State.activeLayerIndex = 0;

    // Build frames (the platformer template requests 4 frames)
    State.frames = [];
    var frameCount = tpl.frames || 1;
    for (var f = 0; f < frameCount; f++) {
      State.frames.push({
        id:       State.nextFrameId(),
        layers:   serializeLayersForFrame(),
        duration: 100
      });
    }
    State.activeFrameIndex = 0;

    // Load palette into State (if Palette module is available later)
    if (tpl.palette) {
      State.palette = tpl.palette.map(function (hex) {
        return ColorUtil.hexToRgba(hex);
      });
    }

    // Reset misc state
    State.dirty     = false;
    State.selection = null;
    State.clipboard = null;
    State.projectName = tpl.name;

    if (typeof History !== 'undefined') {
      History.clear();
      History.pushState('Project Loaded');
    }

    // Notify modules
    EventBus.emit('layersChanged');
    EventBus.emit('frameChanged');
    EventBus.emit('render');
  }

  /**
   * Serialise current layers (canvas data as data URLs) for
   * storing inside a frame object.
   */
  function serializeLayersForFrame() {
    return State.layers.map(function (layer) {
      return {
        id:        layer.id,
        name:      layer.name,
        dataURL:   layer.canvas.toDataURL(),
        visible:   layer.visible,
        opacity:   layer.opacity,
        blendMode: layer.blendMode,
        locked:    layer.locked
      };
    });
  }

  /* ---- Expose ---- */

  return {
    init:    init,
    getList: getList,
    load:    load
  };
})();
/* ================================================
   PixelForge â€” Storage
   IndexedDB auto-save & .pixelforge project files
   ================================================ */

window.Storage = (function () {
  'use strict';

  var DB_NAME       = 'PixelForge';
  var DB_VERSION    = 1;
  var STORE_NAME    = 'projects';
  var AUTOSAVE_KEY  = 'autosave';
  var AUTOSAVE_MS   = 30000; // 30 seconds

  var _db           = null;
  var _intervalId   = null;

  /* =========================================================
     IndexedDB helpers â€” thin, promise-based wrappers
     ========================================================= */

  /**
   * Open (or create) the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(_db); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = function (e) {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = function (e) {
        console.error('[Storage] IndexedDB open error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /**
   * Put a value into the object store under the given key.
   * @returns {Promise<void>}
   */
  function idbPut(key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx    = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var req   = store.put(value, key);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  /**
   * Get a value from the object store by key.
   * @returns {Promise<*>}
   */
  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx    = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var req   = store.get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  /**
   * Delete a key from the object store.
   * @returns {Promise<void>}
   */
  function idbDelete(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx    = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var req   = store.delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  /* =========================================================
     Serialisation / deserialisation
     ========================================================= */

  /**
   * Serialise the full project state into a JSON-friendly object.
   * Layer canvas data is stored as dataURL strings (base64 PNG).
   */
  function serializeProject() {
    var layersData = State.layers.map(function (layer) {
      return {
        id:        layer.id,
        name:      layer.name,
        visible:   layer.visible,
        opacity:   layer.opacity,
        blendMode: layer.blendMode,
        locked:    layer.locked,
        dataURL:   layer.canvas.toDataURL()
      };
    });

    var framesData = State.frames.map(function (frame) {
      return {
        id:       frame.id,
        duration: frame.duration,
        layers:   frame.layers  // already serialised as dataURLs when stored
      };
    });

    return {
      version:          1,
      projectName:      State.projectName,
      width:            State.width,
      height:           State.height,
      activeLayerIndex: State.activeLayerIndex,
      activeFrameIndex: State.activeFrameIndex,
      zoom:             State.zoom,
      showGrid:         State.showGrid,
      gridSize:         State.gridSize,
      currentTool:      State.currentTool,
      brushSize:        State.brushSize,
      filledShape:      State.filledShape,
      symmetryH:        State.symmetryH,
      symmetryV:        State.symmetryV,
      foregroundColor:  ColorUtil.clone(State.foregroundColor),
      backgroundColor:  ColorUtil.clone(State.backgroundColor),
      fps:              State.fps,
      onionSkinning:    State.onionSkinning,
      onionFrames:      State.onionFrames,
      layers:           layersData,
      frames:           framesData,
      palette:          State.palette || [],
      _nextLayerId:     State._nextLayerId,
      _nextFrameId:     State._nextFrameId,
      savedAt:          new Date().toISOString()
    };
  }

  /**
   * Restore the full project state from a serialised object.
   * Layer canvases are reconstructed from dataURL strings by
   * drawing them onto new offscreen canvases.
   *
   * @param {object} data - Object produced by serializeProject
   * @returns {Promise<void>}
   */
  function deserializeProject(data) {
    return new Promise(function (resolve, reject) {
      if (!data || !data.width || !data.height || !data.layers) {
        reject(new Error('Invalid project data'));
        return;
      }

      // Apply scalar state
      State.projectName      = data.projectName || 'Untitled';
      State.width            = data.width;
      State.height           = data.height;
      State.activeLayerIndex = data.activeLayerIndex || 0;
      State.activeFrameIndex = data.activeFrameIndex || 0;
      State.zoom             = data.zoom || 10;
      State.showGrid         = data.showGrid !== undefined ? data.showGrid : true;
      State.gridSize         = data.gridSize || 1;
      State.currentTool      = data.currentTool || 'pencil';
      State.brushSize        = data.brushSize || 1;
      State.filledShape      = !!data.filledShape;
      State.symmetryH        = !!data.symmetryH;
      State.symmetryV        = !!data.symmetryV;
      State.fps              = data.fps || 12;
      State.onionSkinning    = !!data.onionSkinning;
      State.onionFrames      = data.onionFrames || 1;
      State._nextLayerId     = data._nextLayerId || 1;
      State._nextFrameId     = data._nextFrameId || 1;

      if (data.foregroundColor) State.foregroundColor = ColorUtil.clone(data.foregroundColor);
      if (data.backgroundColor) State.backgroundColor = ColorUtil.clone(data.backgroundColor);
      if (data.palette) State.palette = data.palette;

      // Restore frames (stored serialised data)
      State.frames = (data.frames || []).map(function (f) {
        return { id: f.id, duration: f.duration || 100, layers: f.layers || [] };
      });

      // Rebuild layers from dataURLs â€” each image load is async
      var remaining = data.layers.length;
      if (remaining === 0) { finish(); return; }

      State.layers = [];
      data.layers.forEach(function (ld, index) {
        var pair = CanvasUtil.createCanvas(data.width, data.height);
        var layer = {
          id:        ld.id,
          name:      ld.name,
          canvas:    pair.canvas,
          ctx:       pair.ctx,
          visible:   ld.visible !== undefined ? ld.visible : true,
          opacity:   ld.opacity !== undefined ? ld.opacity : 100,
          blendMode: ld.blendMode || 'source-over',
          locked:    !!ld.locked
        };

        // If there is no pixel data, the layer is empty
        if (!ld.dataURL) {
          State.layers[index] = layer;
          remaining--;
          if (remaining === 0) finish();
          return;
        }

        var img = new Image();
        img.onload = function () {
          pair.ctx.drawImage(img, 0, 0);
          State.layers[index] = layer;
          remaining--;
          if (remaining === 0) finish();
        };
        img.onerror = function () {
          // If image fails, leave canvas blank
          State.layers[index] = layer;
          remaining--;
          if (remaining === 0) finish();
        };
        img.src = ld.dataURL;
      });

      function finish() {
        // Fallback: if State.layers is empty, create a default layer
        if (State.layers.length === 0) {
          var pair = CanvasUtil.createCanvas(State.width, State.height);
          State.layers.push({
            id:        State.nextLayerId ? State.nextLayerId() : 1,
            name:      'Layer 1',
            canvas:    pair.canvas,
            ctx:       pair.ctx,
            visible:   true,
            opacity:   100,
            blendMode: 'source-over',
            locked:    false
          });
        }

        // Clamp indices
        State.activeLayerIndex = Math.max(0, Math.min(State.layers.length - 1, State.activeLayerIndex || 0));
        if (State.frames.length > 0 && State.activeFrameIndex >= State.frames.length) {
          State.activeFrameIndex = Math.max(0, Math.min(State.frames.length - 1, State.activeFrameIndex || 0));
        }

        State.dirty = false;

        // Clear and push initial history
        if (typeof History !== 'undefined') {
          History.clear();
          History.pushState('Project Loaded');
        }

        // Notify the whole app
        EventBus.emit('layersChanged');
        EventBus.emit('frameChanged');
        EventBus.emit('colorChanged');
        EventBus.emit('toolChanged', State.currentTool);
        EventBus.emit('render');

        resolve();
      }
    });
  }

  /* =========================================================
     Auto-save
     ========================================================= */

  /**
   * Serialise the project and store it in IndexedDB.
   */
  function autoSave() {
    var data = serializeProject();
    idbPut(AUTOSAVE_KEY, data)
      .then(function () {
        State.lastSaveTime = Date.now();
        var el = document.getElementById('autosave-text');
        if (el) {
          var d = new Date();
          var hh = String(d.getHours()).padStart(2, '0');
          var mm = String(d.getMinutes()).padStart(2, '0');
          el.textContent = 'Saved ' + hh + ':' + mm;
        }
      })
      .catch(function (err) {
        console.error('[Storage] Auto-save failed:', err);
        var el = document.getElementById('autosave-text');
        if (el) el.textContent = 'Save error';
      });
  }

  /**
   * Attempt to load the most recent auto-save from IndexedDB.
   * @returns {Promise<object|null>}
   */
  function autoLoad() {
    return idbGet(AUTOSAVE_KEY).then(function (data) {
      return data || null;
    }).catch(function (err) {
      console.error('[Storage] Auto-load failed:', err);
      return null;
    });
  }

  /**
   * Remove the auto-save entry from IndexedDB.
   * @returns {Promise<void>}
   */
  function clearAutoSave() {
    return idbDelete(AUTOSAVE_KEY);
  }

  /* =========================================================
     Project file I/O
     ========================================================= */

  /**
   * Serialise the project to JSON, then trigger a file download
   * as a .pixelforge file.
   */
  function saveProject() {
    var data = serializeProject();
    var json = JSON.stringify(data);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href     = url;
    a.download = (State.projectName || 'Untitled') + '.pixelforge';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    State.dirty = false;
    var el = document.getElementById('autosave-text');
    if (el) el.textContent = 'Saved';
  }

  /**
   * Read a .pixelforge / .json file selected by the user
   * and restore the project from it.
   *
   * @param {File} file - File object from an <input type="file">
   * @returns {Promise<void>}
   */
  function loadProject(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file provided')); return; }

      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var data = JSON.parse(e.target.result);
          deserializeProject(data).then(resolve).catch(reject);
        } catch (err) {
          console.error('[Storage] Failed to parse project file:', err);
          reject(err);
        }
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsText(file);
    });
  }

  /* =========================================================
     Initialisation
     ========================================================= */

  /**
   * Open the database, start the auto-save timer,
   * and check for an existing auto-save.
   */
  function init() {
    openDB().then(function () {
      // Start periodic auto-save
      _intervalId = setInterval(function () {
        if (State.dirty) {
          autoSave();
        }
      }, AUTOSAVE_MS);

      // Check for existing autosave (consumed by app.js)
      autoLoad().then(function (data) {
        if (data) {
          EventBus.emit('autosaveFound', data);
        }
      });
    }).catch(function (err) {
      console.warn('[Storage] IndexedDB unavailable, auto-save disabled.', err);
    });
  }

  /* =========================================================
     Expose public API
     ========================================================= */

  return {
    init:               init,
    autoSave:           autoSave,
    autoLoad:           autoLoad,
    clearAutoSave:      clearAutoSave,
    saveProject:        saveProject,
    loadProject:        loadProject,
    serializeProject:   serializeProject,
    deserializeProject: deserializeProject
  };
})();
/* ================================================
   PixelForge â€” Export & Import
   PNG, spritesheet, animated GIF export with a
   complete built-in GIF89a encoder, plus image import.
   ================================================ */

window.Export = (function () {
  'use strict';

  /* =========================================================
     Initialisation
     ========================================================= */

  function init() {
    var fileInput = document.getElementById('file-input-image');
    if (fileInput) {
      fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) {
          importImage(e.target.files[0]);
          e.target.value = ''; // reset so same file can be re-selected
        }
      });
    }
  }

  /* =========================================================
     Helpers
     ========================================================= */

  /**
   * Composite all visible layers of the current frame onto
   * a single canvas and return it.
   *
   * @param {number} [frameIndex] â€“ defaults to State.activeFrameIndex
   * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
   */
  function compositeFrame(frameIndex) {
    // If frameIndex differs from the active frame we need to
    // temporarily deserialise its layer data.
    var layers;
    if (frameIndex !== undefined && frameIndex !== State.activeFrameIndex && State.frames[frameIndex]) {
      layers = rebuildLayersFromFrame(State.frames[frameIndex]);
    } else {
      layers = State.layers;
    }

    var pair = CanvasUtil.createCanvas(State.width, State.height);
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!layer.visible) continue;

      pair.ctx.save();
      pair.ctx.globalAlpha = (layer.opacity !== undefined ? layer.opacity : 100) / 100;
      pair.ctx.globalCompositeOperation = layer.blendMode || 'source-over';
      pair.ctx.drawImage(layer.canvas, 0, 0);
      pair.ctx.restore();
    }
    return pair;
  }

  /**
   * Rebuild layer objects (with real canvases) from a frame's
   * serialised layer array.  Returns an array of layer-like
   * objects.  Images are drawn synchronously because dataURLs
   * from canvas.toDataURL() are available instantly via Image.
   */
  function rebuildLayersFromFrame(frame) {
    if (!frame || !frame.layers) return [];
    return frame.layers.map(function (ld) {
      var pair = CanvasUtil.createCanvas(State.width, State.height);
      if (ld.dataURL) {
        var img = new Image();
        img.src = ld.dataURL;          // synchronous for data: URIs
        pair.ctx.drawImage(img, 0, 0);
      } else if (ld.imageData) {
        pair.ctx.putImageData(ld.imageData, 0, 0);
      }
      return {
        canvas:    pair.canvas,
        ctx:       pair.ctx,
        visible:   ld.visible !== undefined ? ld.visible : true,
        opacity:   ld.opacity !== undefined ? ld.opacity : 100,
        blendMode: ld.blendMode || 'source-over'
      };
    });
  }

  /**
   * Scale a canvas up by an integer factor using nearest-neighbour.
   */
  function scaleCanvas(source, factor) {
    if (factor <= 1) return source;
    var sw = source.width, sh = source.height;
    var dw = sw * factor, dh = sh * factor;
    var pair = CanvasUtil.createCanvas(dw, dh);
    pair.ctx.imageSmoothingEnabled = false;
    pair.ctx.drawImage(source, 0, 0, dw, dh);
    return pair.canvas;
  }

  /**
   * Trigger a file download from a Blob.
   */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* =========================================================
     Export PNG
     ========================================================= */

  /**
   * Export the current frame as a PNG, optionally scaled up.
   *
   * @param {number} [scale=1] â€“ integer scale factor (1, 2, 4, â€¦)
   */
  function exportPNG(scale) {
    scale = Math.max(1, Math.round(scale || 1));
    var comp   = compositeFrame();
    var output = scaleCanvas(comp.canvas, scale);

    output.toBlob(function (blob) {
      downloadBlob(blob, (State.projectName || 'sprite') + '.png');
    }, 'image/png');
  }

  /* =========================================================
     Export Spritesheet
     ========================================================= */

  /**
   * Composite every animation frame and arrange them in a
   * grid or horizontal strip, then download as PNG.
   *
   * @param {object} [options]
   * @param {number}  options.columns   â€“ columns per row (default: frame count)
   * @param {number}  options.padding   â€“ pixels between frames (default: 0)
   * @param {number}  options.scale     â€“ integer scale factor (default: 1)
   * @param {string}  options.direction â€“ 'horizontal' | 'grid' (default: 'horizontal')
   */
  function exportSpritesheet(options) {
    options = options || {};
    var padding   = Math.max(0, options.padding || 0);
    var scale     = Math.max(1, Math.round(options.scale || 1));
    var direction = options.direction || 'horizontal';
    var totalFrames = Math.max(1, State.frames.length);
    var columns   = options.columns || (direction === 'horizontal' ? totalFrames : Math.ceil(Math.sqrt(totalFrames)));
    var rows      = Math.ceil(totalFrames / columns);

    var fw = State.width  * scale;
    var fh = State.height * scale;
    var sheetW = columns * fw + (columns - 1) * padding;
    var sheetH = rows    * fh + (rows    - 1) * padding;

    var pair = CanvasUtil.createCanvas(sheetW, sheetH);
    pair.ctx.imageSmoothingEnabled = false;

    for (var i = 0; i < totalFrames; i++) {
      var comp  = compositeFrame(i);
      var frame = scaleCanvas(comp.canvas, scale);
      var col = i % columns;
      var row = Math.floor(i / columns);
      var dx  = col * (fw + padding);
      var dy  = row * (fh + padding);
      pair.ctx.drawImage(frame, dx, dy);
    }

    pair.canvas.toBlob(function (blob) {
      downloadBlob(blob, (State.projectName || 'spritesheet') + '.png');
    }, 'image/png');
  }

  /* =========================================================
     Export animated GIF
     ========================================================= */

  /**
   * Encode all frames as an animated GIF and download.
   */
  function exportGIF() {
    var totalFrames = Math.max(1, State.frames.length);
    var w = State.width, h = State.height;
    var delayMs = Math.round(1000 / (State.fps || 12));

    var encoder = new GIFEncoder();
    encoder.start();
    encoder.setSize(w, h);
    encoder.setRepeat(0); // loop forever

    for (var i = 0; i < totalFrames; i++) {
      var frameDelay = delayMs;
      if (State.frames[i] && State.frames[i].duration) {
        frameDelay = State.frames[i].duration;
      }
      encoder.setDelay(frameDelay);

      var comp = compositeFrame(i);
      var imgData = comp.ctx.getImageData(0, 0, w, h);
      encoder.addFrame(imgData);
    }

    encoder.finish();
    encoder.download((State.projectName || 'animation') + '.gif');
  }

  /* =========================================================
     Import Image
     ========================================================= */

  /**
   * Import a raster image file as a new layer.
   * If the image is larger than the canvas the user is
   * asked whether to resize the canvas.
   *
   * @param {File} file
   */
  function importImage(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        // Check if we need to resize
        var needsResize = (img.width > State.width || img.height > State.height);
        if (needsResize) {
          var doResize = confirm(
            'Image (' + img.width + 'Ã—' + img.height + ') is larger than the canvas (' +
            State.width + 'Ã—' + State.height + ').\n\nResize canvas to fit?'
          );
          if (doResize) {
            var newW = Math.min(State.maxSize, Math.max(State.width, img.width));
            var newH = Math.min(State.maxSize, Math.max(State.height, img.height));
            // Resize all existing layer canvases
            State.layers.forEach(function (layer) {
              var old = layer.canvas;
              var pair = CanvasUtil.createCanvas(newW, newH);
              pair.ctx.drawImage(old, 0, 0);
              layer.canvas = pair.canvas;
              layer.ctx    = pair.ctx;
            });
            State.width  = newW;
            State.height = newH;
          }
        }

        // Create new layer with imported image
        var pair = CanvasUtil.createCanvas(State.width, State.height);
        pair.ctx.drawImage(img, 0, 0);

        var layer = {
          id:        State.nextLayerId(),
          name:      file.name.replace(/\.[^.]+$/, '') || 'Imported',
          canvas:    pair.canvas,
          ctx:       pair.ctx,
          visible:   true,
          opacity:   100,
          blendMode: 'source-over',
          locked:    false
        };

        State.layers.push(layer);
        State.activeLayerIndex = State.layers.length - 1;

        if (typeof History !== 'undefined') History.pushState('Import Image');

        EventBus.emit('layersChanged');
        EventBus.emit('render');
      };
      img.onerror = function () {
        console.error('[Export] Failed to load imported image');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* =========================================================
     Built-in GIF89a Encoder
     ========================================================= */

  /**
   * A complete, self-contained animated-GIF encoder.
   *
   * Usage:
   *   var enc = new GIFEncoder();
   *   enc.start();
   *   enc.setSize(w, h);
   *   enc.setRepeat(0);       // 0 = loop forever
   *   enc.setDelay(100);      // ms before next frame
   *   enc.addFrame(imageData);
   *   ...
   *   enc.finish();
   *   enc.download('out.gif');
   */
  function GIFEncoder() {
    this.width      = 0;
    this.height     = 0;
    this.delay      = 100;     // frame delay in ms
    this.repeat     = 0;       // -1 = no repeat, 0 = forever, N = count
    this.transparent = true;   // support transparent pixels
    this.transIndex = 0;       // palette index for transparency
    this.started    = false;
    this.firstFrame = true;
    this.out        = [];      // output byte array
  }

  GIFEncoder.prototype.start = function () {
    this.out     = [];
    this.started = true;
    this.firstFrame = true;
    // GIF89a header
    this.writeString('GIF89a');
  };

  GIFEncoder.prototype.setSize = function (w, h) {
    this.width  = w & 0xFFFF;
    this.height = h & 0xFFFF;
  };

  GIFEncoder.prototype.setDelay = function (ms) {
    this.delay = Math.max(0, Math.round(ms));
  };

  GIFEncoder.prototype.setRepeat = function (count) {
    this.repeat = count;
  };

  /**
   * Add a frame from an ImageData object (RGBA).
   */
  GIFEncoder.prototype.addFrame = function (imageData) {
    if (!this.started) return;

    var pixels = imageData.data;
    var w = this.width, h = this.height;
    var numPixels = w * h;

    // â”€â”€ 1. Build RGBA pixel array â”€â”€
    var rgba = new Uint8Array(numPixels * 4);
    for (var i = 0; i < numPixels; i++) {
      rgba[i * 4]     = pixels[i * 4];
      rgba[i * 4 + 1] = pixels[i * 4 + 1];
      rgba[i * 4 + 2] = pixels[i * 4 + 2];
      rgba[i * 4 + 3] = pixels[i * 4 + 3];
    }

    // â”€â”€ 2. Quantize to 256 colours (median-cut) â”€â”€
    var result     = medianCut(rgba, numPixels, 255); // reserve index 0 for transparency
    var palette    = result.palette;   // flat array [r,g,b, r,g,b, ...]  (255 entries)
    var indexed    = result.indexed;   // Uint8Array of palette indices (1..255)

    // Index 0 is the transparent colour
    // Prepend a transparent entry to the palette
    var fullPalette = new Uint8Array(256 * 3);
    fullPalette[0] = 0; fullPalette[1] = 0; fullPalette[2] = 0; // transparent slot
    fullPalette.set(palette, 3);

    // Re-map indices: shift by 1 (the quantiser returned 0..254, we need 1..255)
    // Pixels with alpha < 128 get index 0 (transparent).
    var indexedFinal = new Uint8Array(numPixels);
    for (var j = 0; j < numPixels; j++) {
      if (rgba[j * 4 + 3] < 128) {
        indexedFinal[j] = 0;            // transparent
      } else {
        indexedFinal[j] = indexed[j] + 1;
      }
    }

    // â”€â”€ 3. Write Logical Screen Descriptor on first frame â”€â”€
    if (this.firstFrame) {
      this.writeLSD(fullPalette);
      if (this.repeat >= 0) {
        this.writeNetscapeExt();
      }
    }

    // â”€â”€ 4. Graphic Control Extension â”€â”€
    this.writeGraphicControlExt(indexedFinal);

    // â”€â”€ 5. Image Descriptor â”€â”€
    this.writeImageDesc(fullPalette);

    // â”€â”€ 6. LZW-compressed image data â”€â”€
    this.writeLZW(indexedFinal);

    this.firstFrame = false;
  };

  GIFEncoder.prototype.finish = function () {
    if (!this.started) return;
    this.out.push(0x3B); // GIF trailer
    this.started = false;
  };

  GIFEncoder.prototype.download = function (filename) {
    var data = new Uint8Array(this.out);
    var blob = new Blob([data], { type: 'image/gif' });
    downloadBlob(blob, filename);
  };

  /* ---- Internal write methods ---- */

  GIFEncoder.prototype.writeString = function (s) {
    for (var i = 0; i < s.length; i++) {
      this.out.push(s.charCodeAt(i));
    }
  };

  GIFEncoder.prototype.writeShort = function (v) {
    this.out.push(v & 0xFF);
    this.out.push((v >> 8) & 0xFF);
  };

  GIFEncoder.prototype.writeByte = function (v) {
    this.out.push(v & 0xFF);
  };

  /**
   * Logical Screen Descriptor + Global Color Table
   */
  GIFEncoder.prototype.writeLSD = function (palette) {
    this.writeShort(this.width);
    this.writeShort(this.height);

    // GCT flag=1, colour resolution=7 (8 bits), sort=0, size=7 (256 entries)
    // packed: 1_111_0_111 = 0xF7
    this.writeByte(0xF7);
    this.writeByte(0);   // background colour index
    this.writeByte(0);   // pixel aspect ratio

    // Global Color Table (256 Ã— 3 bytes)
    for (var i = 0; i < 256 * 3; i++) {
      this.out.push(palette[i] || 0);
    }
  };

  /**
   * NETSCAPE2.0 Application Extension (loop control)
   */
  GIFEncoder.prototype.writeNetscapeExt = function () {
    this.writeByte(0x21);          // extension introducer
    this.writeByte(0xFF);          // application extension label
    this.writeByte(11);            // block size
    this.writeString('NETSCAPE2.0');
    this.writeByte(3);             // sub-block size
    this.writeByte(1);             // sub-block ID
    this.writeShort(this.repeat);  // loop count (0 = forever)
    this.writeByte(0);             // block terminator
  };

  /**
   * Graphic Control Extension (transparency + delay)
   */
  GIFEncoder.prototype.writeGraphicControlExt = function (/* indexedPixels */) {
    this.writeByte(0x21);          // extension introducer
    this.writeByte(0xF9);          // GCE label
    this.writeByte(4);             // block size

    // packed: reserved(3)=0, disposal(3)=1(do not dispose), user input=0, transparency=1
    // 0_001_0_1 = 0x05
    var disposal = 1;              // do not dispose
    var transparentFlag = this.transparent ? 1 : 0;
    var packed = (disposal << 2) | transparentFlag;
    this.writeByte(packed);

    // Delay in centiseconds (GIF uses 1/100 s units)
    this.writeShort(Math.round(this.delay / 10));

    // Transparent colour index
    this.writeByte(this.transparent ? 0 : 0);

    this.writeByte(0);             // block terminator
  };

  /**
   * Image Descriptor (using global colour table)
   */
  GIFEncoder.prototype.writeImageDesc = function (/* palette */) {
    this.writeByte(0x2C);          // image separator
    this.writeShort(0);            // left
    this.writeShort(0);            // top
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.writeByte(0);             // packed: no local colour table, not interlaced
  };

  /**
   * LZW-compressed image data with sub-block output.
   * Implements GIF-specific variable-length-code LZW.
   */
  GIFEncoder.prototype.writeLZW = function (indexedPixels) {
    var minCodeSize = 8; // palette has 256 entries â†’ min code size = 8
    this.writeByte(minCodeSize);

    var clearCode = 1 << minCodeSize;     // 256
    var eoiCode   = clearCode + 1;        // 257
    var codeSize  = minCodeSize + 1;       // start at 9 bits
    var nextCode  = eoiCode + 1;           // 258
    var maxCode   = (1 << codeSize);       // 512

    // Bit-packing accumulator
    var bitBuffer = 0;
    var bitCount  = 0;
    var subBlock  = [];
    var blocks    = [];
    var self      = this;

    function emitCode(code) {
      bitBuffer |= (code << bitCount);
      bitCount  += codeSize;

      while (bitCount >= 8) {
        subBlock.push(bitBuffer & 0xFF);
        bitBuffer >>= 8;
        bitCount  -= 8;

        if (subBlock.length >= 255) {
          blocks.push(subBlock);
          subBlock = [];
        }
      }
    }

    // Initialise the code table as a map of single-byte strings â†’ codes
    var table = {};
    function resetTable() {
      table = {};
      for (var i = 0; i < clearCode; i++) {
        table[String.fromCharCode(i)] = i;
      }
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
      maxCode  = 1 << codeSize;
    }

    resetTable();
    emitCode(clearCode);

    var numPixels = indexedPixels.length;
    if (numPixels === 0) {
      emitCode(eoiCode);
      flushBits();
      writeBlocks();
      return;
    }

    var current = String.fromCharCode(indexedPixels[0]);

    for (var i = 1; i < numPixels; i++) {
      var pixel  = String.fromCharCode(indexedPixels[i]);
      var concat = current + pixel;

      if (table[concat] !== undefined) {
        current = concat;
      } else {
        emitCode(table[current]);

        if (nextCode < 4096) {
          table[concat] = nextCode++;
          if (nextCode > maxCode && codeSize < 12) {
            codeSize++;
            maxCode = 1 << codeSize;
          }
        } else {
          // Table full â€” emit clear code and reset
          emitCode(clearCode);
          resetTable();
        }

        current = pixel;
      }
    }

    // Emit the last code
    emitCode(table[current]);
    emitCode(eoiCode);

    // Flush remaining bits
    flushBits();
    writeBlocks();

    function flushBits() {
      if (bitCount > 0) {
        subBlock.push(bitBuffer & 0xFF);
        bitBuffer = 0;
        bitCount  = 0;
      }
      if (subBlock.length > 0) {
        blocks.push(subBlock);
        subBlock = [];
      }
    }

    function writeBlocks() {
      for (var b = 0; b < blocks.length; b++) {
        var blk = blocks[b];
        self.out.push(blk.length);
        for (var k = 0; k < blk.length; k++) {
          self.out.push(blk[k]);
        }
      }
      self.out.push(0); // block terminator
    }
  };

  /* =========================================================
     Median-Cut Colour Quantization
     ========================================================= */

  /**
   * Reduce an RGBA pixel array to at most `maxColours` colours
   * using the median-cut algorithm.
   *
   * @param {Uint8Array} rgba       â€“ RGBA pixel data
   * @param {number}     numPixels  â€“ total pixel count
   * @param {number}     maxColours â€“ target palette size (â‰¤256)
   * @returns {{ palette: Uint8Array, indexed: Uint8Array }}
   *    palette  â€“ flat RGB array (maxColours Ã— 3 bytes)
   *    indexed  â€“ per-pixel palette index (0 â€¦ maxColours-1)
   */
  function medianCut(rgba, numPixels, maxColours) {
    // Collect unique opaque colours
    var opaquePixels = [];
    for (var i = 0; i < numPixels; i++) {
      if (rgba[i * 4 + 3] >= 128) {
        opaquePixels.push({
          r: rgba[i * 4],
          g: rgba[i * 4 + 1],
          b: rgba[i * 4 + 2]
        });
      }
    }

    // Degenerate case: no opaque pixels
    if (opaquePixels.length === 0) {
      var emptyPalette = new Uint8Array(maxColours * 3);
      var emptyIndexed = new Uint8Array(numPixels);
      return { palette: emptyPalette, indexed: emptyIndexed };
    }

    // Build initial bucket
    var buckets = [opaquePixels];

    // Repeatedly split the bucket with the largest range
    while (buckets.length < maxColours) {
      // Find the bucket with the widest colour range
      var bestIdx = -1, bestRange = -1, bestChannel = 'r';
      for (var b = 0; b < buckets.length; b++) {
        if (buckets[b].length <= 1) continue;
        var ranges = channelRanges(buckets[b]);
        var maxR = Math.max(ranges.r, ranges.g, ranges.b);
        if (maxR > bestRange) {
          bestRange = maxR;
          bestIdx = b;
          if (ranges.r >= ranges.g && ranges.r >= ranges.b) bestChannel = 'r';
          else if (ranges.g >= ranges.r && ranges.g >= ranges.b) bestChannel = 'g';
          else bestChannel = 'b';
        }
      }

      if (bestIdx === -1) break; // can't split further

      // Sort and split at the median
      var bucket = buckets[bestIdx];
      bucket.sort(function (a, b) { return a[bestChannel] - b[bestChannel]; });
      var mid = Math.floor(bucket.length / 2);
      buckets.splice(bestIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
    }

    // Average each bucket to produce palette entries
    var palette = new Uint8Array(maxColours * 3);
    for (var p = 0; p < buckets.length && p < maxColours; p++) {
      var avg = bucketAverage(buckets[p]);
      palette[p * 3]     = avg.r;
      palette[p * 3 + 1] = avg.g;
      palette[p * 3 + 2] = avg.b;
    }

    // Map every pixel to the closest palette entry
    var indexed = new Uint8Array(numPixels);
    var paletteCount = Math.min(buckets.length, maxColours);

    for (var j = 0; j < numPixels; j++) {
      if (rgba[j * 4 + 3] < 128) {
        indexed[j] = 0; // will become transparent
        continue;
      }
      var pr = rgba[j * 4], pg = rgba[j * 4 + 1], pb = rgba[j * 4 + 2];
      var bestDist = Infinity, bestP = 0;
      for (var k = 0; k < paletteCount; k++) {
        var dr = pr - palette[k * 3];
        var dg = pg - palette[k * 3 + 1];
        var db = pb - palette[k * 3 + 2];
        var dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; bestP = k; }
        if (dist === 0) break;
      }
      indexed[j] = bestP;
    }

    return { palette: palette, indexed: indexed };
  }

  /**
   * Compute the value range of each colour channel within a bucket.
   */
  function channelRanges(bucket) {
    var rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (var i = 0; i < bucket.length; i++) {
      var c = bucket[i];
      if (c.r < rMin) rMin = c.r; if (c.r > rMax) rMax = c.r;
      if (c.g < gMin) gMin = c.g; if (c.g > gMax) gMax = c.g;
      if (c.b < bMin) bMin = c.b; if (c.b > bMax) bMax = c.b;
    }
    return { r: rMax - rMin, g: gMax - gMin, b: bMax - bMin };
  }

  /**
   * Average the colours in a bucket.
   */
  function bucketAverage(bucket) {
    if (bucket.length === 0) return { r: 0, g: 0, b: 0 };
    var sr = 0, sg = 0, sb = 0;
    for (var i = 0; i < bucket.length; i++) {
      sr += bucket[i].r; sg += bucket[i].g; sb += bucket[i].b;
    }
    var n = bucket.length;
    return {
      r: Math.round(sr / n),
      g: Math.round(sg / n),
      b: Math.round(sb / n)
    };
  }

  /* =========================================================
     Expose public API
     ========================================================= */

  return {
    init:              init,
    exportPNG:         exportPNG,
    exportSpritesheet: exportSpritesheet,
    exportGIF:         exportGIF,
    importImage:       importImage
  };
})();
/* ================================================
   PixelForge â€” Keyboard Shortcuts Manager
   Central keydown handler for all editor shortcuts
   ================================================ */

window.Shortcuts = (function () {
  'use strict';

  /* ---- Shortcut definitions ---- */

  /**
   * Master list used both for dispatching and for the
   * "Keyboard Shortcuts" help modal.
   *
   * Each entry: { action, shortcut (display string), category, key config }
   * Key config is consumed internally for matching.
   */
  var shortcutList = [
    // â”€â”€ Tools â”€â”€
    { action: 'Pencil',      shortcut: 'B', category: 'Tools' },
    { action: 'Eraser',      shortcut: 'E', category: 'Tools' },
    { action: 'Line',        shortcut: 'L', category: 'Tools' },
    { action: 'Rectangle',   shortcut: 'U', category: 'Tools' },
    { action: 'Ellipse',     shortcut: 'O', category: 'Tools' },
    { action: 'Fill Bucket', shortcut: 'G', category: 'Tools' },
    { action: 'Eyedropper',  shortcut: 'I', category: 'Tools' },
    { action: 'Selection',   shortcut: 'M', category: 'Tools' },
    { action: 'Move',        shortcut: 'V', category: 'Tools' },

    // â”€â”€ Edit â”€â”€
    { action: 'Undo',            shortcut: 'Ctrl+Z',       category: 'Edit' },
    { action: 'Redo',            shortcut: 'Ctrl+Y',       category: 'Edit' },
    { action: 'Redo (alt)',      shortcut: 'Ctrl+Shift+Z', category: 'Edit' },
    { action: 'Cut',             shortcut: 'Ctrl+X',       category: 'Edit' },
    { action: 'Copy',            shortcut: 'Ctrl+C',       category: 'Edit' },
    { action: 'Paste',           shortcut: 'Ctrl+V',       category: 'Edit' },
    { action: 'Select All',      shortcut: 'Ctrl+A',       category: 'Edit' },
    { action: 'Deselect',        shortcut: 'Ctrl+D',       category: 'Edit' },
    { action: 'Delete Selection',shortcut: 'Delete',       category: 'Edit' },

    // â”€â”€ File â”€â”€
    { action: 'New Canvas',    shortcut: 'Ctrl+N',       category: 'File' },
    { action: 'Open Project',  shortcut: 'Ctrl+O',       category: 'File' },
    { action: 'Save Project',  shortcut: 'Ctrl+S',       category: 'File' },
    { action: 'Save As',       shortcut: 'Ctrl+Shift+S', category: 'File' },

    // â”€â”€ View â”€â”€
    { action: 'Zoom In',     shortcut: 'Ctrl+=',  category: 'View' },
    { action: 'Zoom Out',    shortcut: 'Ctrl+-',  category: 'View' },
    { action: 'Fit to Screen', shortcut: 'Ctrl+0', category: 'View' },
    { action: 'Actual Pixels',  shortcut: 'Ctrl+1', category: 'View' },
    { action: 'Toggle Grid', shortcut: "Ctrl+'",   category: 'View' },

    // â”€â”€ Color â”€â”€
    { action: 'Swap Colors', shortcut: 'X', category: 'Color' },

    // â”€â”€ Animation â”€â”€
    { action: 'New Frame',      shortcut: 'Alt+N', category: 'Animation' },
    { action: 'Previous Frame', shortcut: ',',     category: 'Animation' },
    { action: 'Next Frame',     shortcut: '.',     category: 'Animation' },
    { action: 'Play / Pause',   shortcut: 'Enter', category: 'Animation' },

    // â”€â”€ Brush â”€â”€
    { action: 'Decrease Brush', shortcut: '[', category: 'Brush' },
    { action: 'Increase Brush', shortcut: ']', category: 'Brush' },

    // â”€â”€ Layers â”€â”€
    { action: 'Select Layer 1â€“9', shortcut: '1â€“9', category: 'Layers' },

    // â”€â”€ Help â”€â”€
    { action: 'Show Shortcuts', shortcut: '?', category: 'Help' }
  ];

  /* ---- Helpers ---- */

  /**
   * Returns true when the active element is a text-like input
   * so we should NOT intercept keystrokes.
   */
  function isInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  /**
   * Dispatch a menu-bar action.  The UI module listens for
   * data-action clicks, so we simulate them here.
   */
  function triggerAction(actionName) {
    var btn = document.querySelector('[data-action="' + actionName + '"]');
    if (btn) {
      btn.click();
    }
  }

  /**
   * Set the active tool programmatically.
   */
  function selectTool(toolName) {
    State.currentTool = toolName;
    EventBus.emit('toolChanged', toolName);
  }

  /* ---- Main keydown handler ---- */

  function onKeyDown(e) {
    // Don't intercept when the user is typing in an input field
    if (isInputFocused()) return;

    var key   = e.key;
    var ctrl  = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;
    var alt   = e.altKey;
    var handled = false;

    /* â”€â”€ Ctrl + Shift combos â”€â”€ */
    if (ctrl && shift) {
      switch (key) {
        case 'Z': case 'z':
          if (typeof History !== 'undefined') History.redo();
          handled = true; break;
        case 'S': case 's':
          triggerAction('save-project-as');
          handled = true; break;
      }
    }

    /* â”€â”€ Ctrl combos (no shift) â”€â”€ */
    else if (ctrl && !shift && !alt) {
      switch (key) {
        case 'z': case 'Z':
          if (typeof History !== 'undefined') History.undo();
          handled = true; break;
        case 'y': case 'Y':
          if (typeof History !== 'undefined') History.redo();
          handled = true; break;
        case 'n': case 'N':
          triggerAction('new-canvas');
          handled = true; break;
        case 'o': case 'O':
          triggerAction('open-project');
          handled = true; break;
        case 's': case 'S':
          triggerAction('save-project');
          handled = true; break;
        case 'x': case 'X':
          triggerAction('cut');
          handled = true; break;
        case 'c': case 'C':
          triggerAction('copy');
          handled = true; break;
        case 'v': case 'V':
          triggerAction('paste');
          handled = true; break;
        case 'a': case 'A':
          triggerAction('select-all');
          handled = true; break;
        case 'd': case 'D':
          triggerAction('deselect');
          handled = true; break;
        case '=': case '+':
          triggerAction('zoom-in');
          handled = true; break;
        case '-': case '_':
          triggerAction('zoom-out');
          handled = true; break;
        case '0':
          triggerAction('zoom-fit');
          handled = true; break;
        case '1':
          triggerAction('zoom-100');
          handled = true; break;
        case "'":
          triggerAction('toggle-grid');
          handled = true; break;
      }
    }

    /* â”€â”€ Alt combos â”€â”€ */
    else if (alt && !ctrl && !shift) {
      switch (key) {
        case 'n': case 'N':
          // New frame â€” click the timeline button
          var addFrameBtn = document.getElementById('add-frame-btn');
          if (addFrameBtn) addFrameBtn.click();
          handled = true; break;
      }
    }

    /* â”€â”€ Plain keys (no modifier) â”€â”€ */
    else if (!ctrl && !alt && !shift) {
      switch (key) {
        // Tool shortcuts
        case 'b': case 'B': selectTool('pencil');     handled = true; break;
        case 'e': case 'E': selectTool('eraser');     handled = true; break;
        case 'l': case 'L': selectTool('line');       handled = true; break;
        case 'u': case 'U': selectTool('rect');       handled = true; break;
        case 'o': case 'O': selectTool('ellipse');    handled = true; break;
        case 'g': case 'G': selectTool('fill');       handled = true; break;
        case 'i': case 'I': selectTool('eyedropper'); handled = true; break;
        case 'm': case 'M': selectTool('selection');  handled = true; break;
        case 'v': case 'V': selectTool('move');       handled = true; break;

        // Swap colours
        case 'x': case 'X':
          var tmp = ColorUtil.clone(State.foregroundColor);
          State.foregroundColor = ColorUtil.clone(State.backgroundColor);
          State.backgroundColor = tmp;
          EventBus.emit('colorChanged');
          handled = true; break;

        // Delete selection
        case 'Delete':
        case 'Backspace':
          triggerAction('delete-selection');
          handled = true; break;

        // Brush size
        case '[':
          State.brushSize = Math.max(1, State.brushSize - 1);
          syncBrushUI();
          handled = true; break;
        case ']':
          State.brushSize = Math.min(
            parseInt(document.getElementById('brush-size-slider').max, 10) || 64,
            State.brushSize + 1
          );
          syncBrushUI();
          handled = true; break;

        // Animation navigation
        case ',':
          var prevBtn = document.getElementById('prev-frame-btn');
          if (prevBtn) prevBtn.click();
          handled = true; break;
        case '.':
          var nextBtn = document.getElementById('next-frame-btn');
          if (nextBtn) nextBtn.click();
          handled = true; break;

        // Play / Pause
        case 'Enter':
          var playBtn = document.getElementById('play-btn');
          if (playBtn) playBtn.click();
          handled = true; break;

        // Show shortcuts help
        case '?':
          showShortcutsModal();
          handled = true; break;

        // Quick layer select (1-9)
        default:
          if (key >= '1' && key <= '9') {
            var layerIdx = parseInt(key, 10) - 1;
            if (layerIdx < State.layers.length) {
              State.activeLayerIndex = layerIdx;
              EventBus.emit('layersChanged');
              EventBus.emit('render');
            }
            handled = true;
          }
          break;
      }
    }

    /* Shift-only ? for the shortcuts modal (Shift+/ on US layout) */
    if (!handled && shift && !ctrl && !alt && key === '?') {
      showShortcutsModal();
      handled = true;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /* ---- Brush size UI sync ---- */

  function syncBrushUI() {
    var slider = document.getElementById('brush-size-slider');
    var label  = document.getElementById('brush-size-value');
    if (slider) slider.value = State.brushSize;
    if (label)  label.textContent = State.brushSize;
  }

  /* ---- Shortcuts modal ---- */

  function showShortcutsModal() {
    var overlay   = document.getElementById('modal-overlay');
    var title     = document.getElementById('modal-title');
    var body      = document.getElementById('modal-body');
    var footer    = document.getElementById('modal-footer');
    if (!overlay || !body) return;

    title.textContent = 'Keyboard Shortcuts';
    footer.innerHTML  = '';

    // Group shortcuts by category
    var categories = {};
    shortcutList.forEach(function (s) {
      if (!categories[s.category]) categories[s.category] = [];
      categories[s.category].push(s);
    });

    var html = '<div class="shortcuts-grid">';
    Object.keys(categories).forEach(function (cat) {
      html += '<div class="shortcuts-category">';
      html += '<h3>' + cat + '</h3>';
      categories[cat].forEach(function (s) {
        html += '<div class="shortcut-row">';
        html += '<span class="shortcut-action">' + s.action + '</span>';
        html += '<kbd class="shortcut-key">' + s.shortcut + '</kbd>';
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div>';

    body.innerHTML = html;
    overlay.classList.remove('hidden');
  }

  /* ---- Public API ---- */

  function init() {
    document.addEventListener('keydown', onKeyDown);
  }

  /**
   * Return the full list of shortcut definitions
   * so other modules (e.g. help screen) can consume it.
   */
  function getShortcutList() {
    return shortcutList.map(function (s) {
      return { action: s.action, shortcut: s.shortcut, category: s.category };
    });
  }

  return {
    init:            init,
    getShortcutList: getShortcutList
  };
})();
/* ================================================
   PixelForge â€” UI Helpers
   Panels, modals, menus, tooltips, context menus
   ================================================ */

const UI = {
  _activeMenu: null,
  _menuCloseTimer: null,

  init() {
    this.setupMenuBar();
    this.setupPanelCollapse();
    this.setupModalClose();
    this.setupContextMenuClose();
    this.setupTooltips();
  },

  /* ---- Menu Bar ---- */
  setupMenuBar() {
    const menuItems = document.querySelectorAll('.menu-item');
    let menuOpen = false;

    menuItems.forEach(item => {
      const label = item.querySelector('.menu-label');

      label.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.classList.contains('open')) {
          this.closeAllMenus();
          menuOpen = false;
        } else {
          this.closeAllMenus();
          item.classList.add('open');
          menuOpen = true;
        }
      });

      // Hover to switch menus when one is open
      label.addEventListener('mouseenter', () => {
        if (menuOpen) {
          this.closeAllMenus();
          item.classList.add('open');
        }
      });

      // Handle menu dropdown button clicks
      const buttons = item.querySelectorAll('.menu-dropdown button');
      buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.getAttribute('data-action');
          this.closeAllMenus();
          menuOpen = false;
          this.handleMenuAction(action);
        });
      });
    });

    // Close menus when clicking outside
    document.addEventListener('click', () => {
      if (menuOpen) {
        this.closeAllMenus();
        menuOpen = false;
      }
    });
  },

  closeAllMenus() {
    document.querySelectorAll('.menu-item.open').forEach(m => m.classList.remove('open'));
  },

  handleMenuAction(action) {
    switch (action) {
      // File
      case 'new-canvas': this.showNewCanvasModal(); break;
      case 'new-from-template': this.showTemplateModal(); break;
      case 'open-project':
        document.getElementById('file-input-project').click();
        break;
      case 'save-project':
        if (typeof Storage !== 'undefined' && Storage.saveProject) Storage.saveProject();
        break;
      case 'save-project-as':
        if (typeof Storage !== 'undefined' && Storage.saveProject) Storage.saveProject(true);
        break;
      case 'import-image':
        document.getElementById('file-input-image').click();
        break;
      case 'export-png': this.showExportPNGModal(); break;
      case 'export-spritesheet': this.showExportSpritesheetModal(); break;
      case 'export-gif':
        if (typeof Export !== 'undefined' && Export.exportGIF) Export.exportGIF();
        break;

      // Edit
      case 'undo': if (typeof History !== 'undefined') History.undo(); break;
      case 'redo': if (typeof History !== 'undefined') History.redo(); break;
      case 'cut': EventBus.emit('cut'); break;
      case 'copy': EventBus.emit('copy'); break;
      case 'paste': EventBus.emit('paste'); break;
      case 'delete-selection': EventBus.emit('deleteSelection'); break;
      case 'select-all': EventBus.emit('selectAll'); break;
      case 'deselect': EventBus.emit('deselect'); break;

      // View
      case 'toggle-grid':
        State.showGrid = !State.showGrid;
        EventBus.emit('render');
        break;
      case 'grid-settings': this.showGridSettingsModal(); break;
      case 'zoom-in': if (typeof Canvas !== 'undefined') Canvas.setZoom(State.zoom * 2); break;
      case 'zoom-out': if (typeof Canvas !== 'undefined') Canvas.setZoom(Math.max(1, Math.floor(State.zoom / 2))); break;
      case 'zoom-fit': if (typeof Canvas !== 'undefined') Canvas.zoomToFit(); break;
      case 'zoom-100': if (typeof Canvas !== 'undefined') Canvas.setZoom(1); break;

      // Canvas
      case 'resize-canvas': this.showResizeCanvasModal(); break;
      case 'flip-h': this.flipCanvas('h'); break;
      case 'flip-v': this.flipCanvas('v'); break;
      case 'rotate-cw': this.rotateCanvas(90); break;
      case 'rotate-ccw': this.rotateCanvas(-90); break;

      // Help
      case 'show-shortcuts': this.showShortcutsModal(); break;
      case 'show-about': this.showAboutModal(); break;
    }
  },

  /* ---- Panel Collapse ---- */
  setupPanelCollapse() {
    document.querySelectorAll('.panel-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('collapsed');
      });
    });
  },

  /* ---- Modal System ---- */
  showModal(title, bodyHTML, footerHTML) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const footerEl = document.getElementById('modal-footer');

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHTML;
    footerEl.innerHTML = footerHTML || '';
    overlay.classList.remove('hidden');

    // Focus first input if any
    setTimeout(() => {
      const firstInput = bodyEl.querySelector('input, select');
      if (firstInput) firstInput.focus();
    }, 100);
  },

  hideModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  setupModalClose() {
    document.getElementById('modal-close-btn').addEventListener('click', () => this.hideModal());
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') this.hideModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('modal-overlay').classList.contains('hidden')) {
        this.hideModal();
      }
    });
  },

  /* ---- Specific Modals ---- */
  showNewCanvasModal() {
    this.showModal('New Canvas', `
      <div class="modal-row">
        <label>Width</label>
        <input type="number" id="new-width" value="32" min="1" max="${State.maxSize}">
        <span style="color:var(--text-dim);font-size:11px">px</span>
      </div>
      <div class="modal-row">
        <label>Height</label>
        <input type="number" id="new-height" value="32" min="1" max="${State.maxSize}">
        <span style="color:var(--text-dim);font-size:11px">px</span>
      </div>
    `, `
      <button class="modal-btn modal-btn-secondary" onclick="UI.hideModal()">Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="UI.createNewCanvas()">Create</button>
    `);
  },

  createNewCanvas() {
    const w = MathUtil.clamp(parseInt(document.getElementById('new-width').value) || 32, 1, State.maxSize);
    const h = MathUtil.clamp(parseInt(document.getElementById('new-height').value) || 32, 1, State.maxSize);
    this.hideModal();
    EventBus.emit('newProject', { width: w, height: h });
  },

  showResizeCanvasModal() {
    this.showModal('Resize Canvas', `
      <div class="modal-row">
        <label>Width</label>
        <input type="number" id="resize-width" value="${State.width}" min="1" max="${State.maxSize}">
        <span style="color:var(--text-dim);font-size:11px">px</span>
      </div>
      <div class="modal-row">
        <label>Height</label>
        <input type="number" id="resize-height" value="${State.height}" min="1" max="${State.maxSize}">
        <span style="color:var(--text-dim);font-size:11px">px</span>
      </div>
    `, `
      <button class="modal-btn modal-btn-secondary" onclick="UI.hideModal()">Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="UI.resizeCanvas()">Resize</button>
    `);
  },

  resizeCanvas() {
    const w = MathUtil.clamp(parseInt(document.getElementById('resize-width').value) || State.width, 1, State.maxSize);
    const h = MathUtil.clamp(parseInt(document.getElementById('resize-height').value) || State.height, 1, State.maxSize);
    this.hideModal();
    if (typeof Canvas !== 'undefined') Canvas.resizeDocument(w, h);
  },

  showGridSettingsModal() {
    this.showModal('Grid Settings', `
      <div class="modal-row">
        <label>Grid Size</label>
        <input type="number" id="grid-size-input" value="${State.gridSize}" min="1" max="64">
        <span style="color:var(--text-dim);font-size:11px">px</span>
      </div>
      <div class="modal-row">
        <label>Show Grid</label>
        <input type="checkbox" id="grid-show-input" ${State.showGrid ? 'checked' : ''} style="width:auto">
      </div>
    `, `
      <button class="modal-btn modal-btn-secondary" onclick="UI.hideModal()">Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="UI.applyGridSettings()">Apply</button>
    `);
  },

  applyGridSettings() {
    State.gridSize = MathUtil.clamp(parseInt(document.getElementById('grid-size-input').value) || 1, 1, 64);
    State.showGrid = document.getElementById('grid-show-input').checked;
    this.hideModal();
    EventBus.emit('render');
  },

  showExportPNGModal() {
    this.showModal('Export as PNG', `
      <div class="modal-row">
        <label>Scale</label>
        <select id="export-scale">
          <option value="1">1x (${State.width}Ã—${State.height})</option>
          <option value="2">2x (${State.width*2}Ã—${State.height*2})</option>
          <option value="4">4x (${State.width*4}Ã—${State.height*4})</option>
          <option value="8">8x (${State.width*8}Ã—${State.height*8})</option>
          <option value="16">16x (${State.width*16}Ã—${State.height*16})</option>
        </select>
      </div>
    `, `
      <button class="modal-btn modal-btn-secondary" onclick="UI.hideModal()">Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="UI.doExportPNG()">Export</button>
    `);
  },

  doExportPNG() {
    const scale = parseInt(document.getElementById('export-scale').value) || 1;
    this.hideModal();
    if (typeof Export !== 'undefined') Export.exportPNG(scale);
  },

  showExportSpritesheetModal() {
    const totalFrames = State.frames.length || 1;
    this.showModal('Export Spritesheet', `
      <div class="modal-row">
        <label>Columns</label>
        <input type="number" id="sheet-cols" value="${totalFrames}" min="1" max="${totalFrames}">
      </div>
      <div class="modal-row">
        <label>Padding</label>
        <input type="number" id="sheet-padding" value="0" min="0" max="16">
        <span style="color:var(--text-dim);font-size:11px">px</span>
      </div>
      <div class="modal-row">
        <label>Scale</label>
        <select id="sheet-scale">
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="4">4x</option>
          <option value="8">8x</option>
        </select>
      </div>
    `, `
      <button class="modal-btn modal-btn-secondary" onclick="UI.hideModal()">Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="UI.doExportSpritesheet()">Export</button>
    `);
  },

  doExportSpritesheet() {
    const cols = parseInt(document.getElementById('sheet-cols').value) || 1;
    const padding = parseInt(document.getElementById('sheet-padding').value) || 0;
    const scale = parseInt(document.getElementById('sheet-scale').value) || 1;
    this.hideModal();
    if (typeof Export !== 'undefined') Export.exportSpritesheet({ columns: cols, padding, scale });
  },

  showTemplateModal() {
    if (typeof Templates === 'undefined') return;
    const list = Templates.getList();
    let html = '<div class="template-grid">';
    list.forEach(t => {
      html += `
        <div class="template-card" onclick="UI.loadTemplate('${t.name}')">
          <div class="template-preview"></div>
          <div class="template-name">${t.name}</div>
          <div class="template-size">${t.width}Ã—${t.height}</div>
        </div>
      `;
    });
    html += '</div>';
    this.showModal('New from Template', html, '');
  },

  loadTemplate(name) {
    this.hideModal();
    if (typeof Templates !== 'undefined') Templates.load(name);
  },

  showShortcutsModal() {
    let shortcuts = [];
    if (typeof Shortcuts !== 'undefined' && Shortcuts.getShortcutList) {
      shortcuts = Shortcuts.getShortcutList();
    } else {
      shortcuts = [
        { action: 'Pencil', shortcut: 'B', category: 'Tools' },
        { action: 'Eraser', shortcut: 'E', category: 'Tools' },
        { action: 'Line', shortcut: 'L', category: 'Tools' },
        { action: 'Rectangle', shortcut: 'U', category: 'Tools' },
        { action: 'Ellipse', shortcut: 'O', category: 'Tools' },
        { action: 'Fill', shortcut: 'G', category: 'Tools' },
        { action: 'Eyedropper', shortcut: 'I', category: 'Tools' },
        { action: 'Selection', shortcut: 'M', category: 'Tools' },
        { action: 'Move', shortcut: 'V', category: 'Tools' },
        { action: 'Undo', shortcut: 'Ctrl+Z', category: 'Edit' },
        { action: 'Redo', shortcut: 'Ctrl+Y', category: 'Edit' },
        { action: 'Swap Colors', shortcut: 'X', category: 'Color' },
        { action: 'Brush Size +', shortcut: ']', category: 'Tools' },
        { action: 'Brush Size -', shortcut: '[', category: 'Tools' },
        { action: 'Toggle Grid', shortcut: "Ctrl+'", category: 'View' },
        { action: 'Zoom In', shortcut: 'Ctrl+=', category: 'View' },
        { action: 'Zoom Out', shortcut: 'Ctrl+-', category: 'View' },
        { action: 'New Frame', shortcut: 'Alt+N', category: 'Animation' },
        { action: 'Prev Frame', shortcut: ',', category: 'Animation' },
        { action: 'Next Frame', shortcut: '.', category: 'Animation' },
        { action: 'Play/Pause', shortcut: 'Enter', category: 'Animation' },
      ];
    }

    let categories = {};
    shortcuts.forEach(s => {
      if (!categories[s.category]) categories[s.category] = [];
      categories[s.category].push(s);
    });

    let html = '';
    for (const [cat, items] of Object.entries(categories)) {
      html += `<table class="shortcuts-table"><thead><tr><th colspan="2">${cat}</th></tr></thead><tbody>`;
      items.forEach(s => {
        html += `<tr><td>${s.action}</td><td><kbd>${s.shortcut}</kbd></td></tr>`;
      });
      html += '</tbody></table>';
    }

    this.showModal('Keyboard Shortcuts', html, '');
  },

  showAboutModal() {
    this.showModal('About PixelForge', `
      <div style="text-align:center;padding:10px">
        <svg viewBox="0 0 16 16" width="48" height="48" style="margin-bottom:12px">
          <rect x="1" y="1" width="6" height="6" fill="#e94560"/>
          <rect x="9" y="1" width="6" height="6" fill="#0f3460"/>
          <rect x="1" y="9" width="6" height="6" fill="#0f3460"/>
          <rect x="9" y="9" width="6" height="6" fill="#e94560"/>
        </svg>
        <h3 style="margin-bottom:8px;color:var(--text)">PixelForge</h3>
        <p style="color:var(--text-secondary);font-size:12px;line-height:1.6">
          A free, open-source pixel art editor.<br>
          Built with vanilla HTML, CSS & JavaScript.<br>
          No frameworks. No dependencies.<br><br>
          Inspired by Aseprite.
        </p>
      </div>
    `, '');
  },

  /* ---- Canvas Transforms ---- */
  flipCanvas(direction) {
    if (typeof History !== 'undefined') History.pushState(`Flip ${direction === 'h' ? 'Horizontal' : 'Vertical'}`);
    State.layers.forEach(layer => {
      const temp = CanvasUtil.cloneCanvas(layer.canvas);
      layer.ctx.clearRect(0, 0, State.width, State.height);
      layer.ctx.save();
      if (direction === 'h') {
        layer.ctx.translate(State.width, 0);
        layer.ctx.scale(-1, 1);
      } else {
        layer.ctx.translate(0, State.height);
        layer.ctx.scale(1, -1);
      }
      layer.ctx.drawImage(temp.canvas, 0, 0);
      layer.ctx.restore();
    });
    EventBus.emit('render');
    EventBus.emit('layersChanged');
  },

  rotateCanvas(degrees) {
    if (typeof History !== 'undefined') History.pushState(`Rotate ${degrees > 0 ? 'CW' : 'CCW'}`);
    const oldW = State.width, oldH = State.height;
    const newW = oldH, newH = oldW;

    State.layers.forEach(layer => {
      const temp = CanvasUtil.cloneCanvas(layer.canvas);
      layer.canvas.width = newW;
      layer.canvas.height = newH;
      layer.ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
      layer.ctx.imageSmoothingEnabled = false;
      layer.ctx.save();
      if (degrees === 90) {
        layer.ctx.translate(newW, 0);
        layer.ctx.rotate(Math.PI / 2);
      } else {
        layer.ctx.translate(0, newH);
        layer.ctx.rotate(-Math.PI / 2);
      }
      layer.ctx.drawImage(temp.canvas, 0, 0);
      layer.ctx.restore();
    });

    State.width = newW;
    State.height = newH;
    document.getElementById('status-canvas-size').textContent = `${newW}Ã—${newH}`;
    if (typeof Canvas !== 'undefined') Canvas.zoomToFit();
    EventBus.emit('render');
    EventBus.emit('layersChanged');
  },

  /* ---- Context Menu ---- */
  showContextMenu(items, x, y) {
    const menu = document.getElementById('context-menu');
    let html = '';
    items.forEach(item => {
      if (item.separator) {
        html += '<div class="menu-separator"></div>';
      } else {
        html += `<button data-ctx-action="${item.action}">${item.label}</button>`;
      }
    });
    menu.innerHTML = html;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.remove('hidden');

    // Ensure menu doesn't go off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';

    // Handle clicks
    menu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-ctx-action');
        this.hideContextMenu();
        const item = items.find(i => i.action === action);
        if (item && item.handler) item.handler();
      });
    });
  },

  hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
  },

  setupContextMenuClose() {
    document.addEventListener('click', () => this.hideContextMenu());
    document.addEventListener('contextmenu', (e) => {
      // Don't show browser context menu in the app
      if (e.target.closest('#canvas-viewport') || e.target.closest('#layers-list') || e.target.closest('#frames-strip') || e.target.closest('#palette-grid')) {
        e.preventDefault();
      }
    });

    // Listen for contextmenu events from other modules
    EventBus.on('contextmenu', (data) => {
      this.showContextMenu(data.items, data.x, data.y);
    });
  },

  /* ---- Tooltips ---- */
  setupTooltips() {
    // Native title tooltips are used; no custom implementation needed
    // This is a placeholder for potential custom tooltip implementation
  },

  /* ---- Toast Notifications ---- */
  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 300ms ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /* ---- Welcome Dialog ---- */
  showWelcome(hasAutoSave) {
    let body = `
      <div class="welcome-message">
        <h3>Welcome to PixelForge</h3>
        <p>A powerful pixel art editor right in your browser.</p>
        <div class="welcome-actions">
          <button class="modal-btn modal-btn-primary" onclick="UI.hideModal(); UI.showNewCanvasModal();">New Canvas</button>
          <button class="modal-btn modal-btn-secondary" onclick="UI.hideModal(); UI.showTemplateModal();">From Template</button>
          <button class="modal-btn modal-btn-secondary" onclick="UI.hideModal(); document.getElementById('file-input-project').click();">Open Project</button>
        </div>
      </div>
    `;

    if (hasAutoSave) {
      body = `
        <div class="welcome-message">
          <h3>Welcome Back!</h3>
          <p>We found an auto-saved project. Would you like to continue where you left off?</p>
          <div class="welcome-actions">
            <button class="modal-btn modal-btn-primary" onclick="UI.hideModal(); EventBus.emit('loadAutoSave');">Resume Project</button>
            <button class="modal-btn modal-btn-secondary" onclick="UI.hideModal(); UI.showNewCanvasModal();">New Canvas</button>
          </div>
        </div>
      `;
    }

    this.showModal('', body, '');
    // Hide the title for welcome modal
    document.getElementById('modal-title').style.display = 'none';
    const origHide = this.hideModal.bind(this);
    const patchedHide = () => {
      document.getElementById('modal-title').style.display = '';
      origHide();
    };
    // Temporarily patch
    this._origHideModal = this.hideModal;
    this.hideModal = patchedHide;
    // Restore after close
    setTimeout(() => { this.hideModal = this._origHideModal; }, 0);
  },

  /* ---- Status Bar Updates ---- */
  updateCursorPos(x, y) {
    document.getElementById('status-cursor-pos').textContent = `${x}, ${y}`;
  },

  updateZoom(zoom) {
    document.getElementById('status-zoom').textContent = `Zoom: ${zoom}x`;
  },

  updateTool(name) {
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    document.getElementById('status-tool').textContent = displayName;
  },

  updateCanvasSize(w, h) {
    document.getElementById('status-canvas-size').textContent = `${w}Ã—${h}`;
  },

  updateAutoSave(status) {
    const el = document.getElementById('autosave-text');
    const container = document.getElementById('status-autosave');
    el.textContent = status;
    if (status === 'Savingâ€¦') {
      container.classList.add('saving');
    } else {
      container.classList.remove('saving');
    }
  }
};
/* ================================================
   PixelForge â€” Main Application Entry Point
   Initializes all modules, wires event handlers,
   manages the project lifecycle
   ================================================ */

const App = {
  init() {
    window.addEventListener('error', function (e) {
      console.error(e);
      if (typeof UI !== 'undefined' && UI.showToast) {
        UI.showToast('JS Error: ' + e.message + ' (' + (e.filename ? e.filename.split('/').pop() : 'inline') + ':' + e.lineno + ')', 'error');
      } else {
        alert('JS Error: ' + e.message);
      }
    });

    console.log('%c PixelForge %c Pixel Art Editor ', 
      'background:#e94560;color:white;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px',
      'background:#0f3460;color:white;padding:2px 6px;border-radius:0 3px 3px 0');

    // Initialize all modules in order
    UI.init();
    Canvas.init();
    Layers.init();
    Palette.init();
    Animation.init();
    History.init();
    Tools.init();
    Export.init();
    Shortcuts.init();
    Storage.init();

    // Wire up cross-module events
    this.setupEvents();

    // Wire up file inputs
    this.setupFileInputs();

    // Set up auto-save interval
    this.setupAutoSave();

    // Check for auto-save and show welcome or resume
    this.checkAutoSave();

    // Prevent accidental page close if dirty
    window.addEventListener('beforeunload', (e) => {
      if (State.dirty) {
        // Trigger a final auto-save
        if (typeof Storage !== 'undefined' && Storage.autoSave) {
          Storage.autoSave();
        }
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      Canvas.zoomToFit();
    });
  },

  /* ---- Event Wiring ---- */
  setupEvents() {
    // Render event â€” redraws the display canvas
    EventBus.on('render', () => {
      Canvas.render();
    });

    // Layers changed â€” update layer panel and re-render
    EventBus.on('layersChanged', () => {
      Layers.renderPanel();
      Canvas.render();
      Animation.renderTimeline();
    });

    // Frame changed â€” update timeline
    EventBus.on('frameChanged', () => {
      Animation.renderTimeline();
      Canvas.render();
      Layers.renderPanel();
    });

    // History changed â€” update history panel
    EventBus.on('historyChanged', () => {
      History.renderPanel();
    });

    // Color changed â€” update palette UI
    EventBus.on('colorChanged', () => {
      Palette.updateUI();
    });

    // Tool changed â€” update status
    EventBus.on('toolChanged', () => {
      UI.updateTool(State.currentTool);
    });

    // Dirty â€” mark project as modified
    EventBus.on('dirty', () => {
      State.dirty = true;
      document.title = 'â— PixelForge â€” ' + State.projectName;
    });

    // New project
    EventBus.on('newProject', (opts) => {
      this.newProject(opts.width, opts.height);
    });

    // Load auto-save
    EventBus.on('loadAutoSave', () => {
      this.loadAutoSave();
    });

    // Selection events
    EventBus.on('selectAll', () => {
      State.selection = { x: 0, y: 0, w: State.width, h: State.height };
      EventBus.emit('render');
    });

    EventBus.on('deselect', () => {
      // If selection has pixel data, stamp it back
      if (State.selection && State.selection.data) {
        const layer = Layers.getActiveLayer();
        if (layer) {
          layer.ctx.putImageData(State.selection.data, State.selection.x, State.selection.y);
        }
      }
      State.selection = null;
      EventBus.emit('render');
    });

    EventBus.on('deleteSelection', () => {
      if (!State.selection) return;
      History.pushState('Delete Selection');
      const layer = Layers.getActiveLayer();
      if (layer) {
        layer.ctx.clearRect(State.selection.x, State.selection.y, State.selection.w, State.selection.h);
      }
      State.selection = null;
      EventBus.emit('render');
    });

    EventBus.on('cut', () => {
      if (!State.selection) return;
      const layer = Layers.getActiveLayer();
      if (!layer) return;
      History.pushState('Cut');
      State.clipboard = {
        data: layer.ctx.getImageData(State.selection.x, State.selection.y, State.selection.w, State.selection.h),
        w: State.selection.w,
        h: State.selection.h
      };
      layer.ctx.clearRect(State.selection.x, State.selection.y, State.selection.w, State.selection.h);
      State.selection = null;
      EventBus.emit('render');
      UI.showToast('Cut to clipboard', 'info');
    });

    EventBus.on('copy', () => {
      if (!State.selection) return;
      const layer = Layers.getActiveLayer();
      if (!layer) return;
      State.clipboard = {
        data: layer.ctx.getImageData(State.selection.x, State.selection.y, State.selection.w, State.selection.h),
        w: State.selection.w,
        h: State.selection.h
      };
      UI.showToast('Copied to clipboard', 'info');
    });

    EventBus.on('paste', () => {
      if (!State.clipboard) return;
      History.pushState('Paste');
      // Create selection with pasted data at top-left
      State.selection = {
        x: 0, y: 0,
        w: State.clipboard.w,
        h: State.clipboard.h,
        data: State.clipboard.data
      };
      EventBus.emit('render');
      Tools.setTool('selection');
    });
  },

  /* ---- File Inputs ---- */
  setupFileInputs() {
    document.getElementById('file-input-project').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        Storage.loadProject(e.target.files[0]);
        e.target.value = ''; // Reset
      }
    });

    document.getElementById('file-input-image').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        Export.importImage(e.target.files[0]);
        e.target.value = '';
      }
    });
  },

  /* ---- Auto-Save ---- */
  setupAutoSave() {
    setInterval(() => {
      if (State.dirty && typeof Storage !== 'undefined' && Storage.autoSave) {
        Storage.autoSave();
      }
    }, 30000); // Every 30 seconds
  },

  async checkAutoSave() {
    try {
      if (typeof Storage !== 'undefined' && Storage.autoLoad) {
        const data = await Storage.autoLoad();
        if (data) {
          UI.showWelcome(true);
          return;
        }
      }
    } catch (err) {
      console.warn('Auto-save check failed:', err);
    }
    // No auto-save found, start fresh
    // Don't show welcome modal - just start with default canvas
  },

  async loadAutoSave() {
    try {
      if (typeof Storage !== 'undefined' && Storage.autoLoad) {
        const data = await Storage.autoLoad();
        if (data) {
          await Storage.deserializeProject(data);
          if (typeof Canvas !== 'undefined') {
            Canvas.zoomToFit();
          }
          UI.showToast('Project resumed', 'success');
          State.dirty = false;
          document.title = 'PixelForge — ' + State.projectName;
        }
      }
    } catch (err) {
      console.error('Failed to load auto-save:', err);
      UI.showToast('Failed to load auto-save', 'error');
    }
  },

  /* ---- New Project ---- */
  newProject(width, height) {
    // Clear everything
    State.width = width;
    State.height = height;
    State.layers = [];
    State.activeLayerIndex = 0;
    State.frames = [];
    State.activeFrameIndex = 0;
    State.playing = false;
    State.selection = null;
    State.clipboard = null;
    State.dirty = false;
    State._nextLayerId = 1;
    State._nextFrameId = 1;
    State.projectName = 'Untitled';

    // Clear and re-init
    History.clear();
    Layers.createLayer('Layer 1');
    History.pushState('Project Loaded');
    Animation.initFrames();
    Canvas.zoomToFit();
    Layers.renderPanel();
    Animation.renderTimeline();
    History.renderPanel();
    Canvas.render();

    UI.updateCanvasSize(width, height);
    document.title = 'PixelForge â€” Untitled';
    UI.showToast(`New canvas: ${width}Ã—${height}`, 'success');
  }
};

/* ---- Boot ---- */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
