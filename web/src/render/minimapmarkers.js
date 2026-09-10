// KI.EXE 2B3C/2B88: the minimap contact marker switches square colours using
// legion +3 bit0. Web now uses the user-approved shared fixed audio/visual beat,
// not that original timing. 2BA8 restores the marker on contact end.
// Web product choice (user request): reuse selected/other-faction styles and
// anchor sieges at the city, field contacts at the encounter target. Original
// hardware uses AH=3F/FA at the attacking legion's position (see re-notes-audio).
export const MINI_MARKER_STYLES = Object.freeze({
  player: Object.freeze({ border: "#D00000", fill: "#F0E000" }),
  selected: Object.freeze({ border: "#FFFFFF", fill: "#3040D0" }),
  other: Object.freeze({ border: "#002060", fill: "#3040D0" }),
  neutral: Object.freeze({ border: "#000000", fill: "#eeeeee" }),
});

/** Read-only projection; no timers, audio, route changes or retained flash queue. */
export function minimapBattleMarkers(scenario, presentation) {
  const markers = new Map();
  const legions = (scenario?.legions ?? []).toSorted(
    (a, b) => (a.slot ?? a._runtimeId ?? 0) - (b.slot ?? b._runtimeId ?? 0),
  );
  for (const legion of legions) {
    const contact = legion._engagement;
    if (legion.dead || legion._active === false || !contact) continue;
    const frame = presentation?.frameOf(legion);
    if (!Number.isInteger(frame)) continue;
    const city =
      contact.kind === "siege"
        ? scenario.cities?.[contact.target?.cityIdx]
        : null;
    const position = contact.kind === "field" ? contact.target : city;
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y))
      continue;
    const key = city ? city.idx : `field:${position.x}:${position.y}`;
    markers.set(key, {
      x: position.x,
      y: position.y,
      style: frame & 1 ? MINI_MARKER_STYLES.selected : MINI_MARKER_STYLES.other,
    });
  }
  return markers;
}

/** Same 5x5 border / 3x3 fill as ordinary Web faction markers. */
export function drawMinimapMarker(ctx, x, y, style) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.fillStyle = style.border;
  ctx.fillRect(rx - 2, ry - 2, 5, 5);
  ctx.fillStyle = style.fill;
  ctx.fillRect(rx - 1, ry - 1, 3, 3);
}
