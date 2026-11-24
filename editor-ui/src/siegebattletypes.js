import { origins } from '../../server/siegeorigins.generated.js';
import { siegeMatchesType } from '../../server/siegeorigin.js';

export const SIEGE_OPTIONS = origins.map(([name, type, layout, theme], i) => ({
  id: `ki-1995:siege:${i}`, type, layout, theme, label: `${name}（siege:${i}）`, url: `/siege-thumb/${i}.png`,
}));
const byId = new Map(SIEGE_OPTIONS.map(option => [option.id, option]));
export function siegeLabel(id) { return byId.get(id)?.label ?? (id ? `${id}（未知）` : '—'); }
// 列表图文两行：首行戰場名、次行 siege:N（不帶括號）；未知 ID 回退單行顯示。
export function siegeParts(id) {
  const m = typeof id === 'string' ? /^ki-1995:siege:(\d{1,3})$/.exec(id) : null;
  const option = m ? byId.get(id) : null;
  if (!option) return { name: id ? String(id) : '—', tag: '' };
  return { name: origins[Number(m[1])][0], tag: `siege:${m[1]}` };
}
export function siegeValid(id) { return byId.has(id); }
export function thumbUrl(id) { return byId.get(id)?.url ?? ''; }
export function siegeOptionsFor(type) {
  return SIEGE_OPTIONS.filter(option => siegeInType(option.id, type));
}
export function siegeInType(id, type) {
  return /^[0-4]$/.test(String(type)) && siegeMatchesType(id, Number(type));
}
