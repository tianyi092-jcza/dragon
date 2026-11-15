// Web display categories, not DOS terrain or topology classifications.
// Existing-definition cards are projected here; new recipe cards/plans stay in the private canvas adapter.
import catalog from './mapspritecatalog.json' with { type: 'json' };
import basePresets from './mapbasepresets.json' with { type: 'json' };

function matchesRegisteredDefinition(def, item) {
  return Boolean(def && def.id === item.definitionRef && def.revision === item.definitionRevision
    && def.category === item.definitionCategory && def.ruleRecipeRef === item.ruleRecipeRef && def.visualRef === item.visualRef
    && JSON.stringify(def.anchor) === JSON.stringify(item.anchor)
    && JSON.stringify(def.footprint) === JSON.stringify(item.footprint)
    && Object.keys(def.variants).length === 1
    && JSON.stringify(def.variants.original?.tiles) === JSON.stringify(item.tiles)
    && def.authorWaterClass === undefined && def.geographyMask === undefined);
}

export function projectSpriteCatalog(definitions) {
  return {
    catalogCategories: catalog.categories.map(({ id, name }) => ({ id, name })),
    // Complete byte inventory; classification is program metadata, availability is this map's exact definition.
    catalogAtoms: Array.from({ length: 256 }, (_, tile) => {
      const id = `tile-${tile}`, def = definitions?.[id];
      const references = [...catalog.items.filter(item => item.tile === tile),
        ...[...catalog.components, ...catalog.recipes].filter(item => item.tiles.some(([, , byte]) => byte === tile))];
      const base = Object.values(basePresets.items).some(item => item.fill.tile === tile);
      const retained = catalog.advancedRetention.find(group => group.tiles.includes(tile));
      let disposition = 'pending-identification', label = '待辨識';
      if (base) { disposition = 'base-preset'; label = '基底預設'; }
      else if (references.some(item => item.support === 'existing-decoration')) { disposition = 'catalog-reference'; label = '分類樣板引用'; }
      else if (references.length) { disposition = 'read-only-reference'; label = '只讀樣板引用'; }
      else if (retained) { disposition = 'advanced-retained'; label = '高級保留'; }
      const available = matchesRegisteredDefinition(def, { definitionRef: id, definitionRevision: 'original-byte-1',
        definitionCategory: 'atomic-original', ruleRecipeRef: 'ki-byte-stamp-1', visualRef: `MMAP.MDL:${id}`,
        anchor: [0, 0], footprint: [[0, 0]], tiles: [[0, 0, tile]] });
      return { id, name: def?.name || id, cells: 1, disposition, label, available,
        note: `${label}；${retained?.note ?? (references.map(item => item.name).join('、') || '無已確認的分類樣板')}；原byte身份保留，高級入口僅供參考${available ? '' : '；本圖缺少匹配定義，不顯示圖像'}` };
    }),
    catalogItems: [...catalog.items.map(item => ({ ...item, definitionRevision: 'original-byte-1',
      definitionCategory: 'atomic-original', visualRef: `MMAP.MDL:tile-${item.tile}`, tiles: [[0, 0, item.tile]] })),
      ...catalog.components.map(item => ({ ...item, visualRef: 'MMAP.MDL:indexed-footprint' }))].map(item => {
      const def = definitions?.[item.definitionRef];
      const available = matchesRegisteredDefinition(def, item);
      let note = 'Web原圖字節樣板；沿用完全匹配的既有定義，不改下層地理，不代表自然物件身份或自動拼接';
      if (!available) note = '本圖缺少匹配的受信定義；不可預覽或放置';
      else if (item.support === 'reference-only') {
        note = '外觀參考；地理作用域未確認，不開放放置';
        if (item.category === 'ground') note = '地表外觀參考；地理作用域未確認，不開放放置，不據像素補地理遮罩';
        if (item.category === 'road') note = '外觀參考；不可新建道路／橋梁，不開放放置或改變通行拓撲';
        if (item.category === 'city') note = '外觀參考；不可新建／搬移據點，不開放放置或改變據點資料';
      }
      return {
        id: item.definitionRef, itemId: item.itemId, name: item.name, category: item.category, cells: item.footprint.length,
        available, canPlace: available && item.support === 'existing-decoration', note,
      };
    }),
  };
}
