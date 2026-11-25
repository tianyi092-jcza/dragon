// Web presentation geometry only. No Scenario, clock, RNG or navigation.
import { pickMinimapBox, minimapTransform } from "../content/authoring/minimap.js";

export function mapPanelLayout({ width, height, miniOpen, resOpen, world, positions }) {
  let top = 36;
  const edge = 4, gap = 8, border = 8, bannerHeight = 21;
  // Reserve the approved 640x48 advisor strip even when currently hidden:
  // fan toggling must not move navigation controls under the pointer.
  const advisor = { x: Math.max(0, Math.round((width - 640) / 2)), y: 32, w: 640, h: 48 };
  const room = { w: Math.max(0, (width - 640) / 2 - edge - border * 2),
    h: height - top - edge - border * 2 - bannerHeight - (resOpen ? 208 + gap : 0) };
  const box = pickMinimapBox(room);
  const panels = [];
  if (miniOpen) panels.push({ kind: "mini", w: Math.ceil((box.w + border * 2) / 16) * 16,
    h: Math.ceil((box.h + bannerHeight + border * 2) / 16) * 16, mapWidth: box.w, mapHeight: box.h });
  if (resOpen) panels.push({ kind: "res", w: 224, h: 208 });
  const total = panels.reduce((sum, p) => sum + p.h, 0) + Math.max(0, panels.length - 1) * gap;
  // Probe the actual initial positions, including the short-screen row.
  // Only layouts whose panels would cover the advisor strip move below it.
  const initialRow = panels.length > 1 && top + total + edge > height;
  let probeRight = width - edge, probeY = top;
  for (const panel of panels) {
    const x = Math.max(edge, probeRight - panel.w), y = initialRow ? top : probeY;
    if (x < advisor.x + advisor.w && x + panel.w > advisor.x &&
        y < advisor.y + advisor.h && y + panel.h > advisor.y) {
      top = advisor.y + advisor.h + edge;
      break;
    }
    if (initialRow) probeRight = x - gap;
    else probeY += panel.h + gap;
  }
  // Short desktop viewport: both approved existing panels remain visible;
  // fall back to the smaller map and place the resource panel beside it.
  const sideBySide = panels.length > 1 && top + total + edge > height;
  let y = top, right = width - edge;
  for (const panel of panels) {
    const frame = { x: Math.max(edge, right - panel.w), y: sideBySide ? top : y, w: panel.w, h: panel.h };
    if (sideBySide) right = frame.x - gap;
    else y += panel.h + gap;
    const pos = positions?.[panel.kind];
    if (pos) {
      frame.x = Math.max(0, Math.min(width - panel.w, pos.x));
      frame.y = Math.max(0, Math.min(height - panel.h, pos.y));
    }
    panel.frame = frame;
    // Preserve existing content-coordinate API used by resource/legion UI.
    panel.x = frame.x + border; panel.y = frame.y + border;
    if (panel.kind === "mini") {
      // 内容（图＋1px 间隙＋20px 双横幅）在框内垂直居中：原来顶贴，底下剩取整余量。
      const bannerDrawH = 20;
      const slack = Math.max(0, panel.h - border * 2 - (box.h + 1 + bannerDrawH));
      const yOff = Math.floor(slack / 2);
      panel.mapBox = { x: panel.x + (panel.w - border * 2 - box.w) / 2, y: panel.y + yOff, w: box.w, h: box.h };
      panel.transform = minimapTransform(world, panel.mapBox);
      panel.bannerY = panel.mapBox.y + box.h + 1;
      panel.bannerWidth = Math.floor((box.w - 4) / 2);
      panel.secondBannerX = panel.mapBox.x + panel.bannerWidth + 4;
    }
  }
  return panels;
}

export function insidePanel(panel, px, py) {
  const r = panel.frame;
  return px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h;
}
