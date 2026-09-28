// Web presentation engineering, not a KI rule. Record every producer call (UI
// layout/message draining still runs), but rasterize only changed command tapes.
// Opaque cumulative checkpoints preserve exact alpha/text blending and ordering.
const PAINT = new Set(['drawImage', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'fill', 'stroke', 'putImageData']);
const QUERIES = new Set(['measureText', 'getTransform', 'getLineDash', 'isPointInPath', 'isPointInStroke', 'getContextAttributes']);
const PROPERTIES = ['direction', 'fillStyle', 'filter', 'font', 'fontKerning', 'fontStretch', 'fontVariantCaps', 'globalAlpha', 'globalCompositeOperation', 'imageSmoothingEnabled', 'imageSmoothingQuality', 'letterSpacing', 'lineCap', 'lineDashOffset', 'lineJoin', 'lineWidth', 'miterLimit', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'strokeStyle', 'textAlign', 'textBaseline', 'textRendering', 'wordSpacing'];
const fontEpochs = new WeakMap();
function fontEpoch(doc) {
  if (!doc.fonts) return 0;
  if (!fontEpochs.has(doc)) {
    fontEpochs.set(doc, 0);
    doc.fonts.addEventListener('loadingdone', () => fontEpochs.set(doc, fontEpochs.get(doc) + 1));
  }
  return fontEpochs.get(doc);
}
function equal(a, b) {
  return a?.length === b.length && b.every((value, i) => Object.is(value, a[i]));
}
function state(ctx) {
  const props = PROPERTIES.filter(p => p in ctx).map(p => [p, ctx[p]]);
  const t = ctx.getTransform(), transform = [t.a, t.b, t.c, t.d, t.e, t.f];
  const dash = ctx.getLineDash();
  return { props, transform, dash, key: [...props.flat(), ...transform, ...dash] };
}
function applyState(ctx, snapshot) {
  for (const [p, value] of snapshot.props) ctx[p] = value;
  ctx.setTransform(...snapshot.transform);
  ctx.setLineDash(snapshot.dash);
}
export class RetainedLayers {
  constructor(canvas) {
    this.canvas = canvas;
    this.entries = new Map();
    this.patterns = new WeakMap();
    this.stats = { frames: 0, presents: 0, rasterized: {}, reused: {} };
    this.valid = false;
    this.movingFrames = 0;
    this.bypassFrames = 0;
    this.depth = 0;
  }
  invalidate() { this.valid = false; }
  begin(ctx) {
    if (this.depth++ > 0) {
      // A message opened synchronously from GameBar.draw may call MapView.draw
      // again. Commit the outer prefix once, then run both remaining producers
      // directly; never overwrite its tape or re-run a business callback.
      const t = ctx.getTransform();
      this.flush();
      ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
      return ctx;
    }
    this.target = ctx;
    this.queue = [];
    this.current = null;
    const size = [this.canvas.width, this.canvas.height, fontEpoch(this.canvas.ownerDocument)];
    if (!equal(this.size, size)) { this.size = size; this.valid = false; this.entries.clear(); }
    // Four viewport-sized RGBA checkpoints; large screens use the direct path
    // rather than retaining unbounded GPU memory. 64 MiB excludes the main canvas.
    this.enabled = this.canvas.width * this.canvas.height * 16 <= 64 * 1024 * 1024;
    if (!this.enabled) { this.entries.clear(); this.valid = false; return ctx; }
    if (this.bypassFrames > 0) {
      this.bypassFrames--;
      this.enabled = false; this.valid = false;
      this.stats.direct = (this.stats.direct ?? 0) + 1;
      return ctx;
    }
    // Execute state/path/query operations on a tiny scratch context, not main.
    // Thus flushing a partially recorded save/clip stack cannot double-apply it.
    this.stateCanvas ??= this.canvas.ownerDocument.createElement('canvas');
    this.stateCanvas.width = this.stateCanvas.height = 1;
    this.recorder = this.stateCanvas.getContext('2d');
    applyState(this.recorder, state(ctx));
    const methods = new Map();
    const record = (kind, name, args) => {
      const tape = this.current;
      if (!tape) throw new Error('Retained layer must be selected before drawing');
      args = args.map(v => Array.isArray(v) ? v.slice() : v);
      tape.commands.push([kind, name, args]);
      tape.key.push(kind, name, args.length);
      for (const arg of args) {
        if (Array.isArray(arg)) tape.key.push('array', arg.length, ...arg);
        else tape.key.push(arg);
      }
      if (name === 'drawImage') {
        const image = args[0];
        tape.key.push(image.currentSrc, image.width, image.height, image.complete);
        // Terrain chunks are immutable by construction. Other canvas/video
        // sources may change without identity changes: never trust their tape.
        if (!tape.immutableSources && !('complete' in image)) tape.volatile = true;
      }
    };
    return new Proxy(this.recorder, {
      get: (_, name) => {
        const target = this.enabled ? this.recorder : this.target;
        if (name === 'canvas') return this.canvas;
        if (typeof target[name] !== 'function') return target[name];
        if (!methods.has(name)) methods.set(name, (...args) => {
          const target = this.enabled ? this.recorder : this.target;
          if (!this.enabled || QUERIES.has(name)) return target[name](...args);
          if (name === 'createPattern') {
            const [image, repeat] = args;
            let cache = this.patterns.get(image);
            if (!cache) this.patterns.set(image, cache = new Map());
            if (!cache.has(repeat)) cache.set(repeat, target.createPattern(image, repeat));
            return cache.get(repeat);
          }
          // Gradients/readback aren't used by this map's producers. Such new
          // producers must explicitly use the uncached path until supported.
          if (name.startsWith('create') || name === 'getImageData')
            throw new Error(`Unsupported retained Canvas operation: ${name}`);
          record('call', name, args);
          if (!PAINT.has(name)) return target[name](...args);
        });
        return methods.get(name);
      },
      set: (_, name, value) => {
        if (this.enabled) { record('set', name, [value]); this.recorder[name] = value; }
        else this.target[name] = value;
        return true;
      },
    });
  }
  layer(name, { immutableSources = false, cursor = false } = {}) {
    if (!this.enabled) return;
    const initial = state(this.recorder);
    this.current = { name, initial, immutableSources, cursor, commands: [], key: initial.key.slice(), volatile: false };
    this.queue.push(this.current);
  }
  flush() {
    if (this.enabled) {
      for (const tape of this.queue) {
        applyState(this.target, tape.initial);
        for (const [kind, name, args] of tape.commands) {
          if (kind === 'set') this.target[name] = args[0]; else this.target[name](...args);
        }
      }
      this.stats.reentrant = (this.stats.reentrant ?? 0) + 1;
    }
    this.enabled = false;
    this.valid = false;
  }
  finish() {
    if (--this.depth > 0 || !this.enabled) return;
    const finalState = state(this.recorder);
    this.stats.frames++;
    const order = this.queue.map(tape => tape.name).join('/');
    if (order !== this.order) { this.valid = false; this.order = order; }
    let dirty = !this.valid, first = dirty ? 0 : this.queue.length;
    let stablePrefix = true;
    for (const [i, tape] of this.queue.entries()) {
      let entry = this.entries.get(tape.name);
      if (!entry) this.entries.set(tape.name, entry = { key: null, stable: 0, valid: false });
      const ownDirty = tape.volatile || !equal(entry.key, tape.key);
      if (tape.name === 'objects') {
        this.movingFrames = ownDirty && this.valid ? this.movingFrames + 1 : 0;
        // Dense movement pays more for recording than it saves in raster work.
        // Sample again after 30 draw calls (not rule ticks / not a new timer).
        if (this.movingFrames >= 2) { this.bypassFrames = 30; this.movingFrames = 0; }
      }
      if (ownDirty) first = Math.min(first, i);
      dirty ||= ownDirty;
      if (dirty) entry.valid = false;
      entry.stable = ownDirty ? 0 : entry.stable + 1;
      stablePrefix &&= entry.stable >= 1 && !tape.volatile;
      // Never copy four full viewports per moving frame. Only materialize a
      // cumulative checkpoint once its entire prefix has settled. Terrain is
      // cheap to retain immediately; dynamic suffixes replay straight to main.
      tape.checkpoint = !tape.cursor && (stablePrefix || i === 0);
      if (tape.checkpoint && !entry.valid) first = Math.min(first, i);
      entry.key = tape.key;
    }
    if (first === this.queue.length) { applyState(this.target, finalState); return; }
    const ctx = this.target;
    ctx.save();
    try {
      let start = 0;
      for (let i = first - 1; i >= 0; i--) {
        const entry = this.entries.get(this.queue[i].name);
        if (!entry.valid || !entry.canvas) continue;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(entry.canvas, 0, 0);
        start = i + 1; break;
      }
      for (const [i, tape] of this.queue.entries()) {
        if (i < start) {
          this.stats.reused[tape.name] = (this.stats.reused[tape.name] ?? 0) + 1;
          continue;
        }
        applyState(ctx, tape.initial);
        for (const [kind, name, args] of tape.commands) {
          if (kind === 'set') ctx[name] = args[0]; else ctx[name](...args);
        }
        this.stats.rasterized[tape.name] = (this.stats.rasterized[tape.name] ?? 0) + 1;
        const entry = this.entries.get(tape.name);
        if (tape.checkpoint && !entry.valid) {
          if (!entry.canvas) {
            entry.canvas = this.canvas.ownerDocument.createElement('canvas');
            entry.canvas.width = this.canvas.width; entry.canvas.height = this.canvas.height;
            entry.ctx = entry.canvas.getContext('2d');
          }
          entry.ctx.globalCompositeOperation = 'copy';
          entry.ctx.drawImage(this.canvas, 0, 0);
          entry.valid = true;
        }
      }
      this.stats.presents++;
      this.valid = true;
    } finally { ctx.restore(); applyState(ctx, finalState); }
  }
}
