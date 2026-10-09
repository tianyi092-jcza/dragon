// Read-only disaster player. Evidence: KI.EXE 0x23FF/0x2438 fixed-slot
// lifetime, 0x2459 timer, 0x2533 -> 0xD51F eight logical frames / 5x5 tiles.
// This extraction deliberately keeps the authoritative frame and immediate
// removal: no new visual clock, RNG, fade-out, message callback or Scenario field.
import { createPresentationImageResources } from './presentationimages.js';
const cache = new Map();
const ASSETS = Object.freeze({ 1: 'fire', 2: 'riot' });
function entryFor(group, frame, onReady, resources = null) {
  const asset = ASSETS[Number(group) | 0];
  if (!asset) return null;
  const phase = frame & 7, key = `${group}:${phase}`;
  if (resources) {
    const img = resources.getImage(`grf/disaster/${asset}_frame_${phase}.png`, onReady);
    return { img, ok: !!img };
  }
  let entry = cache.get(key);
  if (!entry) {
    let settle;
    entry = { img: new Image(), ok: false, listeners: new Set(), promise: new Promise(resolve => { settle = resolve; }) };
    cache.set(key, entry);
    const complete = ok => {
      entry.ok = ok; entry.settled = true;
      for (const callback of entry.listeners) callback();
      entry.listeners.clear(); settle();
    };
    entry.img.onload = () => complete(true);
    entry.img.onerror = () => complete(false);
    entry.img.src = `grf/disaster/${asset}_frame_${phase}.png`;
  }
  if (onReady && !entry.settled) entry.listeners.add(onReady);
  return entry;
}
export function preloadDisasterObjectImages(onReady) {
  return Promise.all([1, 2].flatMap(group => Array.from({ length: 8 }, (_, frame) => entryFor(group, frame, onReady).promise)));
}
export class DisasterPresentation {
  constructor(onReady, resourcePorts = null) {
    this.onReady = onReady;
    this.imageResources = resourcePorts === null ? null : createPresentationImageResources(resourcePorts);
  }
  preloadImageResources(urls = [1, 2].flatMap(group => Array.from({ length: 8 }, (_, frame) => `grf/disaster/${ASSETS[group]}_frame_${frame}.png`))) {
    if (!this.imageResources) return preloadDisasterObjectImages(this.onReady);
    return this.imageResources.loadImages(urls);
  }
  disposeImageResources() { this.imageResources?.close(); }
  draw(ctx, scenario, camera, tileSize, viewport) {
    this.imageResources?.assertCurrent();
    // Slot identity/order is authoritative. Never filter/compact the first 16.
    const slots = scenario.disasterMapObjects ?? [];
    for (let slot = 0; slot < Math.min(16, slots.length); slot++) {
      const object = slots[slot];
      if (!object || object.active === false) continue;
      const entry = entryFor(object.group ?? object.kind, object.frame ?? 1, this.onReady, this.imageResources);
      if (!entry?.ok) continue;
      const x = camera.x + ((object.x ?? 0) - 2) * tileSize * camera.scale;
      const y = camera.y + ((object.y ?? 0) - 2) * tileSize * camera.scale;
      const size = 80 * camera.scale;
      if (x >= viewport.width || y >= viewport.height || x + size <= 0 || y + size <= 0) continue;
      ctx.drawImage(entry.img, x, y, size, size);
    }
  }
}
