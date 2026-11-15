// Current workspace library: one card per original 16x16 byte, no combinations.
// Categories are Web browsing labels, not native movement rules or land masks.
// Keep the versioned multi-cell catalog as provenance/admission history only.
import catalog from './mapspritecatalog.json' with { type: 'json' };
import { projectSpriteCatalog } from './mapspritecatalog.js';

const categories = [
  ['ground', '地面'], ['mountain', '山地'], ['water', '水系'], ['field', '農田'], ['wall', '牆體'],
  ['city', '據點'], ['road', '道路'],
];
// User-approved visual grouping: blue-water/shore artwork belongs to water.
// Fixed reviewed byte list, never runtime pixel detection or a rule/placement mask.
// Byte 6 has no blue water; keep its ground artwork with the vegetation references.
// See docs/map-atomic-catalog-contract.md#presentation-correction.
const water = new Set([3, 4, 5, 7, 10, 11, 12, 13, 14, 15, 19, 21, 22, 23, 24, 25, 26, 27, 28,
  ...Array.from({ length: 42 }, (_, i) => i + 30), ...Array.from({ length: 39 }, (_, i) => i + 73)]);
const walls = new Set([223, 231, 248, 249, 250, 252, 253]);
// Library-only exclusion. KI 8A3F..8A74 / 8AD1..8AE9 selects these at runtime:
// centers +0/+1 are owned variants, +2 is neutral; corners 232..241 are player variants.
// Keep all 256 catalogAtoms and original definitions for existing maps and gameplay.
// See docs/map-atomic-catalog-contract.md#spring-neutral-library.
const factionCityTiles = new Set([203, 204, 206, 207, 209, 210, ...Array.from({ length: 10 }, (_, i) => i + 232)]);
const admitted = new Set([...catalog.items.map(item => ({ ...item, tiles: [[0, 0, item.tile]] })), ...catalog.components, ...catalog.recipes]
  .filter(item => item.support === 'existing-decoration').flatMap(item => item.tiles.map(([, , tile]) => tile)));

export function projectAtomicSpriteCatalog(definitions) {
  const { catalogAtoms } = projectSpriteCatalog(definitions);
  return {
    catalogCategories: categories.map(([id, name]) => ({ id, name })),
    catalogAtoms,
    catalogItems: catalogAtoms.map((atom, tile) => {
      let category = 'ground';
      if (tile >= 184 && tile <= 202 && tile !== 190) category = 'road';
      else if (walls.has(tile)) category = 'wall';
      else if (tile >= 203) category = 'city';
      else if (tile === 180 || tile === 181) category = 'field';
      else if (tile >= 112 && tile <= 175 && tile !== 168) category = 'mountain';
      else if (water.has(tile)) category = 'water';
      const canPlace = atom.available && admitted.has(tile);
      let note = canPlace ? '16×16原始圖塊；按格放置，一次撤銷。分類不改變規則或小地圖地面語義。' : '16×16原始圖塊；僅供參考，尚未開放放置。';
      // Both unused identical-looking bytes remain separate, visibly unresolved.
      if (tile === 72 || tile === 190) note = '原用途未知，暫列地面供瀏覽；不代表陸地、不合併原byte，不開放放置。';
      else if (tile === 95) note = '底圖圖塊；未放置素材的位置自然露出底圖，不需逐格放置。';
      else if (['road', 'city'].includes(category)) note = '原始結構圖塊；只讀參考，不開放新路橋／水路、移城或據點配色操作。';
      if (!atom.available) note += ' 本圖缺少匹配原子定義，不可預覽或放置。';
      const label = categories.find(([id]) => id === category)[1];
      return { id: atom.id, itemId: atom.id, name: `${label}圖塊 ${tile}`, category, cells: 1, available: atom.available, canPlace, note };
    }).filter((_, tile) => !factionCityTiles.has(tile)),
  };
}
