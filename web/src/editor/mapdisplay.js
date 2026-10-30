// Workspace display only. Never use this projection as compiled rule terrain.
import { composeMapLayers } from '../content/authoring/maplayers.js';

export function composeMapDisplayLayers(source, visible) {
  if (!visible || Array.isArray(visible) || ![Object.prototype, null].includes(Object.getPrototypeOf(visible))) throw new TypeError('explicit layer visibility required');
  const descriptors = Object.getOwnPropertyDescriptors(visible), keys = Reflect.ownKeys(descriptors);
  const layers = ['base', 'decor', 'roads', 'cities'];
  if (keys.length !== layers.length || layers.some(key => !Object.hasOwn(descriptors, key)) || keys.some(key => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value') || typeof descriptors[key].value !== 'boolean')) throw new TypeError('four explicit layer visibility flags required');
  // Validate the complete composition first: hiding a layer cannot hide a broken
  // recipe or a malformed water group. Unknown lower tiles remain unknown.
  const complete = composeMapLayers(source, { draft: true });
  const unsupported = complete.diagnostics.find(row => row.code !== 'UNKNOWN_UNDERLAY');
  if (unsupported) throw new RangeError(unsupported.message);
  let terrain = complete.terrain;
  if (!layers.every(key => visible[key])) {
    const map = source.map;
    const display = composeMapLayers({ ...source, map: { ...map,
      base: { ...map.base, terrainRef: visible.base ? map.base.terrainRef : Array(map.bounds.width * map.bounds.height).fill(null) },
      decorations: visible.decor ? map.decorations : [],
      roads: visible.roads ? map.roads : [],
      placements: visible.cities ? map.placements : [],
      // Groups affect minimap geography, never the tile image. The complete
      // group graph was checked above; omit it only in this private display view.
      waterGroups: [],
    } }, { draft: true });
    terrain = display.terrain;
  }
  // Deliberately do not export geography, minimap data, or a runnable source.
  return { admission: 'display-only', width: source.map.bounds.width, height: source.map.bounds.height, tiles: terrain };
}
