// Editor-only geometry/time budget, not map capacity or a game clock rule.
export const ZOOM_MIN = 1 / 16;
export const ZOOM_MAX = 4;
function finite(value) { if (!Number.isFinite(value)) throw new RangeError("視口參數必須為有限數值"); return value; }
function dimensions(size) { if (!size || finite(size.width) <= 0 || finite(size.height) <= 0) throw new RangeError("視口尺寸必須大於零"); }
function state(view) { finite(view.x); finite(view.y); if (finite(view.zoom) < ZOOM_MIN || view.zoom > ZOOM_MAX) throw new RangeError("縮放超出工作區顯示範圍"); }
export function clampViewport(view, size, world) {
  state(view); dimensions(size); dimensions(world);
  const axis = (value, screenSize, worldSize) => {
    const visible = screenSize / view.zoom;
    if (visible >= worldSize) return (worldSize - visible) / 2; // actual centered letterbox
    return Math.max(0, Math.min(worldSize - visible, value));
  };
  return { x: axis(view.x, size.width, world.width), y: axis(view.y, size.height, world.height), zoom: view.zoom };
}
export function screenToWorld(view, x, y) { state(view); return [finite(x) / view.zoom + view.x, finite(y) / view.zoom + view.y]; }
export function worldToScreen(view, x, y) { state(view); return [(finite(x) - view.x) * view.zoom, (finite(y) - view.y) * view.zoom]; }
export function zoomAt(view, zoom, point, size, world) {
  state(view); finite(zoom); if (zoom <= 0) throw new RangeError("縮放必須大於零");
  const [x, y] = screenToWorld(view, point[0], point[1]);
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  return clampViewport({ x: x - point[0] / next, y: y - point[1] / next, zoom: next }, size, world);
}
export function fitViewport(size, world) {
  dimensions(size); dimensions(world);
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, size.width / world.width, size.height / world.height));
  return clampViewport({ x: 0, y: 0, zoom }, size, world);
}
export function panViewport(view, dx, dy, size, world) {
  return clampViewport({ ...view, x: view.x + finite(dx) / view.zoom, y: view.y + finite(dy) / view.zoom }, size, world);
}
export function edgePanDelta(point, size, elapsedMs) {
  dimensions(size); finite(elapsedMs);
  const dt = Math.max(0, Math.min(50, elapsedMs)); // no background UI catch-up
  finite(point[0]); finite(point[1]);
  if (dt === 0) return [0, 0];
  const axis = (v, extent) => {
    finite(v);
    const zone = Math.min(32, extent / 4);
    if (v < zone) return -640 * dt / 1000 * Math.min(1, (zone - v) / zone);
    if (v > extent - zone) return 640 * dt / 1000 * Math.min(1, (v - extent + zone) / zone);
    return 0;
  };
  return [axis(point[0], size.width), axis(point[1], size.height)];
}
