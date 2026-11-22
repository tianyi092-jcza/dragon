// Shared siege-battlefield classification for city editors (game + system base).
// BATTLE.MAP directory: first byte layout (MDL descriptor block), second byte
// theme (0x3F-theme variant). Same city type maps to several (layout,theme)
// combos; measured program bindings: type0:4 type1:16 type2:16 type3:2 type4:2,
// 22 distinct combos total across 192 directories.
// Source: .dragon-analysis/city-capacity/registered-city-source-r11/siege-catalog.json
// (program directory bytes); semantics: re-battle-command SKILL (CAEB directory
// index, CB44 layout block, CB9B/CBBC non-zero theme transform). Labels stay
// neutral (版式/主題 numbers); no invented terrain names.
const SIEGE_LAYOUTS = '0,36;1,39;0,42;1,36;2,35;1,42;0,42;2,40;1,42;0,36;0,42;2,40;1,42;2,35;0,36;1,42;0,36;0,36;1,40;2,35;0,35;0,36;1,35;2,40;1,36;0,42;0,36;0,36;1,36;0,36;1,40;1,36;0,36;1,36;1,36;1,36;0,42;1,42;2,0;1,42;0,42;1,42;1,42;0,37;2,40;2,35;0,42;1,39;2,0;1,36;2,33;2,40;2,37;0,42;2,40;1,36;2,38;1,36;0,36;1,36;0,42;1,39;0,36;0,36;2,0;1,39;2,41;0,42;1,36;0,36;1,46;1,36;1,36;2,40;1,36;1,0;0,42;2,37;1,36;0,36;0,42;0,36;0,36;1,40;1,39;1,42;2,40;0,36;0,35;1,39;1,35;0,42;2,40;1,36;1,36;0,36;0,42;0,42;1,36;1,35;0,36;1,42;0,36;1,36;1,42;0,42;0,36;2,41;1,40;1,36;2,40;2,38;1,40;0,36;0,42;1,39;0,36;0,36;1,36;2,40;1,36;1,36;1,39;0,37;0,42;2,0;0,42;1,42;1,40;1,36;0,42;0,36;1,40;1,42;0,36;0,39;1,36;0,36;1,40;0,41;1,42;1,39;0,37;1,36;0,42;0,36;0,42;1,39;0,42;0,36;1,40;1,42;0,43;0,36;1,0;0,42;2,40;1,42;1,42;1,36;1,40;2,40;1,39;0,42;1,40;1,35;2,37;0,36;1,42;1,36;0,36;0,39;1,42;1,40;1,36;0,41;2,38;0,42;0,36;0,36;1,35;2,35;1,39;1,40;2,38;0,42;2,40;1,36;0,36;0,36;0,42;1,43'.split(';');
export const SIEGE_OPTIONS = SIEGE_LAYOUTS.map((pair, i) => {
  const [layout, theme] = pair.split(',').map(Number);
  return { id: `ki-1995:siege:${i}`, layout, theme, label: `siege:${i}（版式${layout}·主題${theme}）` };
});
if (SIEGE_OPTIONS.length !== 192) throw new Error('siege catalog must cover 192 directories');
export function siegeLabel(value) {
  if (value === null || value === undefined || value === '') return '—';
  const found = SIEGE_OPTIONS.find(option => option.id === value);
  return found ? found.label : `${value}（未知）`;
}
export function siegeValid(value) {
  const match = typeof value === 'string' ? /^ki-1995:siege:(\d{1,3})$/.exec(value) : null;
  return Boolean(match) && Number(match[1]) <= 191;
}
// Per-city-type subsets (type first, then battlefield): measured program bindings.
const SIEGE_BY_TYPE = {
  0: ['0,35', '0,36', '0,37', '0,42'],
  1: ['0,35', '0,36', '0,37', '0,42', '1,35', '1,36', '1,39', '1,40', '1,42', '2,0', '2,33', '2,35', '2,37', '2,38', '2,40', '2,41'],
  2: ['0,36', '0,39', '0,41', '0,42', '0,43', '1,35', '1,36', '1,39', '1,40', '1,42', '1,43', '2,0', '2,35', '2,37', '2,38', '2,40'],
  3: ['1,36', '1,46'],
  4: ['1,0', '2,0'],
};
export function siegeOptionsFor(type) {
  if (type === '' || type === null || type === undefined) return SIEGE_OPTIONS;
  const n = Number(type);
  if (!Number.isInteger(n) || !(n in SIEGE_BY_TYPE)) return SIEGE_OPTIONS;
  const allowed = new Set(SIEGE_BY_TYPE[n]);
  return SIEGE_OPTIONS.filter(option => allowed.has(option.layout + ',' + option.theme));
}
export function thumbUrl(battleMapId) {
  const match = /^ki-1995:siege:(\d{1,3})$/.exec(typeof battleMapId === 'string' ? battleMapId : '');
  const index = match ? Number(match[1]) : -1;
  if (index < 0 || index > 191) return '';
  return `/siege-thumb/${index}.png`;
}
export function siegeInType(battleMapId, type) {
  if (type === '' || type === null || type === undefined) return true;
  const n = Number(type);
  if (!Number.isInteger(n) || !(n in SIEGE_BY_TYPE)) return true;
  const found = SIEGE_OPTIONS.find(option => option.id === battleMapId);
  return Boolean(found) && SIEGE_BY_TYPE[n].includes(found.layout + ',' + found.theme);
}
