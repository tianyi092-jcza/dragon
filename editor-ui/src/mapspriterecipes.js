// Private catalog planning. These objects are NOT Vue DTOs or persisted definitions.
// Inputs are catalog descriptors and world definitions; mutations use existing commands only.
const fields = new Set(['id', 'name', 'revision', 'category', 'anchor', 'footprint', 'visualRef', 'ruleRecipeRef', 'variants']);
const coordinates = values => JSON.stringify(values.map(value => JSON.stringify(value)).sort());

function matchesDefinition(def, id, expected, metadata) {
  return Boolean(def && def.id === id && Object.keys(def).every(key => fields.has(key) || metadata.has(key))
    && def.revision === expected.revision && def.category === expected.category
    && def.visualRef === expected.visualRef && def.ruleRecipeRef === expected.ruleRecipeRef
    && JSON.stringify(def.anchor) === JSON.stringify(expected.anchor)
    && coordinates(def.footprint) === coordinates(expected.footprint)
    && Object.keys(def.variants).length === 1 && def.variants.original
    && Object.keys(def.variants.original).length === 1
    && coordinates(def.variants.original.tiles) === coordinates(expected.variants.original.tiles));
}

export function planSpriteMaterialization(definitions, recipe) {
  // Capture normalizes to the top-left bounding coordinate and anchor [0,0].
  // Other anchors remain supported by ordinary existing-definition placement,
  // but must not silently acquire different geometry through this path.
  const { tiles, footprint, anchor } = recipe;
  if (recipe.ruleRecipeRef !== 'ki-byte-stamp-1' || JSON.stringify(anchor) !== '[0,0]'
    || !tiles.length || tiles.length > 256
    || tiles.some(cell => cell.length !== 3 || !cell.every(Number.isSafeInteger)
      || cell[0] < 0 || cell[1] < 0 || cell[2] < 0 || cell[2] > 255)
    || Math.min(...tiles.map(([x]) => x)) !== 0 || Math.min(...tiles.map(([, y]) => y)) !== 0
    || new Set(tiles.map(([x, y]) => `${x},${y}`)).size !== tiles.length
    || coordinates(footprint) !== coordinates(tiles.map(([x, y]) => [x, y]))) return null;
  const atomicMetadata = new Set(['evidenceRef', 'semanticGrouping']);
  if (!tiles.every(([, , tile]) => {
    const id = `tile-${tile}`;
    return matchesDefinition(definitions?.[id], id, { revision: 'original-byte-1', category: 'atomic-original',
      anchor: [0, 0], footprint: [[0, 0]], visualRef: `MMAP.MDL:${id}`, ruleRecipeRef: 'ki-byte-stamp-1',
      variants: { original: { tiles: [[0, 0, tile]] } } }, atomicMetadata);
  })) return null;
  const definition = structuredClone({ id: `catalog:${recipe.itemId}`, name: recipe.name,
    revision: 'author-byte-stamp-1', category: 'author-multicell', anchor, footprint,
    visualRef: 'MMAP.MDL:indexed-footprint', ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles } } });
  // Name and capture provenance describe authorship/history, not the rule recipe.
  // Unknown fields, alternate variants, water classes and masks are NOT ignored.
  const authorMetadata = new Set(['captureProvenance']);
  const existing = Object.entries(definitions).find(([id, def]) => matchesDefinition(def, id, definition, authorMetadata));
  const materialId = existing?.[0] ?? null;
  const canPlace = recipe.support === 'existing-decoration' && recipe.geographyEffect === 'preserve-underlay';
  return {
    definition: structuredClone(definition), materialId, canPlace,
    definitionCost: materialId ? 0 : 1, commandCount: materialId ? 1 : tiles.length + 3,
    place(x, y, newId) {
      if (!canPlace) throw new Error('此目錄配方僅供參考，不開放放置。');
      if (materialId) return [{ op: 'decoration-place', instanceId: newId('decoration'), materialId,
        variantRef: 'original', x, y, waterClass: null }];
      const id = newId('material'), members = definition.variants.original.tiles.map(() => newId('decoration'));
      return [...definition.variants.original.tiles.map(([dx, dy, tile], index) => ({ op: 'decoration-place',
        instanceId: members[index], materialId: `tile-${tile}`, variantRef: 'original', x: x + dx, y: y + dy, waterClass: null })),
      { op: 'material-capture', materialId: id, memberIds: [...members], name: definition.name },
      { op: 'decoration-remove', memberIds: [...members] },
      { op: 'decoration-place', instanceId: newId('decoration'), materialId: id, variantRef: 'original', x, y, waterClass: null }];
    },
  };
}
