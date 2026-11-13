// Real registered source -> converted template -> shared display compositor.
// Display-only Web contract; not native terrain classification or RNG evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { composeMapDisplayLayers } from '../web/src/editor/mapdisplay.js';
import { renderMinimapPixels, MINIMAP_STYLE_REVISION } from '../web/src/content/authoring/minimap.js';
import { setWaterGroupMinimapVisibility } from '../web/src/editor/componenttools.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const installed = readInstalledEditorSource();
const { template } = convertInstalledSystemBaseMap(installed, BUILTIN_RESOURCES.sourceDigest);
const source = template.content;
const original = composeMapLayers(installed), converted = composeMapLayers(source);
assert.deepEqual(converted.terrain, original.terrain);
assert.deepEqual(converted.minimapGeography, original.minimapGeography);
const roadMask = new Uint8Array(384 * 256);
source.map.roads.forEach(road => road.geometry.forEach(({ x, y }) => { roadMask[y * 384 + x] = 1; }));
const hidden = source.map.waterGroups.filter(group => group.showOnMinimap).reduce((current, group) => setWaterGroupMinimapVisibility(current, group.id, false), source);
const withoutWater = composeMapLayers(hidden);
assert.deepEqual(withoutWater.terrain, converted.terrain);
assert.deepEqual(withoutWater.geography, converted.geography);
assert.notDeepEqual(withoutWater.minimapGeography, converted.minimapGeography);
const before = sha(JSON.stringify(template));
const rows = [];
const random = Math.random, now = Date.now;
Math.random = () => { throw new Error('minimap must not consume ambient RNG'); };
Date.now = () => { throw new Error('minimap must not depend on time'); };
try {
  for (const [width, height] of [[208, 139], [250, 167]]) {
    const render = (geography, seed) => renderMinimapPixels(geography, roadMask, 384, 256, width, height, seed);
    const prior = render(original.minimapGeography, 1);
    const image = render(converted.minimapGeography, 1);
    assert.deepEqual(image, prior, 'unchanged conversion preserves approved display bytes');
    assert.deepEqual(image, render(converted.minimapGeography, 1));
    const alternate = render(converted.minimapGeography, 2);
    assert.deepEqual(alternate.geoMask, image.geoMask);
    assert.notDeepEqual(alternate.pixels, image.pixels);
    const invisible = render(withoutWater.minimapGeography, 1);
    assert.notDeepEqual(invisible.pixels, image.pixels);
    assert.ok(image.geoMask.includes(1) && image.geoMask.includes(2), 'visible sea and river/lake retained');
    let roads = 0;
    image.geoMask.forEach((value, index) => {
      if (value !== 3) return;
      roads++;
      assert.equal(invisible.geoMask[index], 3, 'hiding water cannot hide static roads');
      assert.deepEqual(invisible.pixels.slice(index * 3, index * 3 + 3), image.pixels.slice(index * 3, index * 3 + 3));
    });
    assert.ok(roads > 0);
    rows.push({ width, height, pixels: sha(image.pixels), hiddenWater: sha(invisible.pixels), roadPixels: roads });
  }
} finally { Math.random = random; Date.now = now; }
const visible = { base: true, decor: true, roads: true, cities: true };
assert.deepEqual(composeMapDisplayLayers(source, visible).tiles, converted.terrain);
const bare = composeMapDisplayLayers(source, { base: true, decor: false, roads: false, cities: false });
assert.ok(bare.tiles.every(tile => tile === null), 'unknown hidden ground is not invented');
assert.equal(sha(JSON.stringify(template)), before, 'display composition must not mutate the template');
console.log(JSON.stringify({ passed: true, style: MINIMAP_STYLE_REVISION, rows,
  scope: 'shared pixel/display compositor only; Canvas/browser interaction remains B4/B7' }, null, 2));
