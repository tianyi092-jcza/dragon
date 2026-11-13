// B0 read-only inventory of the registered source, not a template converter.
// Writes only a NEW isolated audit directory; never reads DOS saves/profiles.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { planSystemBaseMapPieces } from './system_base_map_pieces.mjs';
import { WATER_CLASSES } from '../web/src/content/authoring/maplayers.js';

const round = process.argv[2];
assert.equal(process.argv.length, 3, 'usage: node tools/audit_system_base_map.mjs <new-round>');
assert.match(round, /^[a-z0-9][a-z0-9-]{0,48}$/);
const source = readInstalledEditorSource(); // 38 SHA/size checks + common compiler parity.
const { map, componentDefinitions: definitions } = source;
const { width, height } = map.bounds;
assert.deepEqual(map.bounds, { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 });
const sha = (value) => createHash('sha256').update(value).digest('hex');
const count = (values) => Object.fromEntries([...new Set(values)].sort().map(value =>
  [value, values.filter(item => item === value).length]));
const atoms = [
  ...map.decorations.map(item => ({ ...item, layer: 'decorations', ownerId: item.id })),
  ...map.roads.flatMap(road => road.components.map(item => ({ ...item, layer: 'roads', ownerId: road.id }))),
  ...map.placements.map(item => ({ ...item, definitionRef: item.componentRef, layer: 'placements', ownerId: item.cityId })),
];
const ownership = Array(width * height).fill(null);
const byId = new Map(atoms.map(item => [item.id, item]));
assert.equal(byId.size, atoms.length);
atoms.forEach(atom => {
  assert.ok(Number.isInteger(atom.x) && atom.x >= 0 && atom.x < width);
  assert.ok(Number.isInteger(atom.y) && atom.y >= 0 && atom.y < height);
  const cell = atom.y * width + atom.x;
  assert.equal(ownership[cell], null, `overlap ${cell}`);
  const definition = definitions[atom.definitionRef];
  assert.ok(definition);
  assert.deepEqual(definition.footprint, [[0, 0]]);
  assert.deepEqual(definition.anchor, [0, 0]);
  assert.equal(definition.ruleRecipeRef, 'ki-byte-stamp-1');
  assert.equal(definition.variants[atom.variantRef].tiles.length, 1);
  assert.equal(map.base.unknownUnderlays[cell].coveringInstanceId, atom.id);
  ownership[cell] = { id: atom.id, layer: atom.layer, ownerId: atom.ownerId, definitionRef: atom.definitionRef };
});
assert.equal(ownership.filter(item => item === null).length, 0);
assert.equal(map.base.terrainRef.filter(item => item === null).length, width * height);
assert.equal(Object.keys(map.base.unknownUnderlays).length, width * height);
source.world.cities.forEach(city => {
  const placement = map.placements.find(item => item.cityId === city.id);
  assert.ok(placement);
  assert.equal(placement.x, city.x); assert.equal(placement.y, city.y);
});
assert.equal(new Set(source.world.cities.map(city => city.index)).size, 192);
map.roads.forEach(road => {
  assert.equal(road.geometry.length, road.components.length);
  road.geometry.forEach((point, index) => {
    assert.equal(point.x, road.components[index].x); assert.equal(point.y, road.components[index].y);
  });
});
const waterMembers = new Set(), waterBase = new Set();
const waterGroups = map.waterGroups.map(group => {
  const points = group.memberIds.map(id => {
    const atom = byId.get(id);
    assert.ok(atom, `missing water member ${id}`);
    const cell = atom.y * width + atom.x;
    assert.ok(atom.waterClass || (atom.layer === 'roads' && group.baseCells.includes(cell)), `unannotated member ${id}`);
    assert.ok(!waterMembers.has(id), `duplicate water member ${id}`); waterMembers.add(id);
    return { x: atom.x, y: atom.y };
  });
  group.baseCells.forEach(cell => {
    assert.ok(Number.isInteger(cell) && cell >= 0 && cell < ownership.length);
    assert.ok(map.base.geography[cell] > 0);
    assert.ok(!waterBase.has(cell), `duplicate base water ${cell}`); waterBase.add(cell);
    assert.ok(group.memberIds.includes(ownership[cell].id), `unpaired base water ${cell}`);
  });
  return { id: group.id, name: group.name, showOnMinimap: group.showOnMinimap,
    members: group.memberIds.length, baseCells: group.baseCells.length,
    classes: count(group.memberIds.map(id => {
      const atom = byId.get(id);
      return atom.waterClass ?? Object.keys(WATER_CLASSES).find(key => WATER_CLASSES[key] === map.base.geography[atom.y * width + atom.x]);
    })), points };
});
assert.equal(waterMembers.size, atoms.filter(atom => atom.waterClass).length + waterBase.size);
assert.equal(waterBase.size, map.base.geography.filter(value => value > 0).length);
const tiles = Object.values(definitions).map(definition => {
  const instances = atoms.filter(atom => atom.definitionRef === definition.id);
  return { id: definition.id, tile: definition.variants.original.tiles[0][2],
    recipe: definition.ruleRecipeRef, evidenceRef: definition.evidenceRef,
    instances: instances.length, layers: count(instances.map(atom => atom.layer)),
    waterClasses: count(instances.map(atom => atom.waterClass ?? 'unannotated')),
    sample: instances.length ? { id: instances[0].id, x: instances[0].x, y: instances[0].y } : null,
    grouping: 'UNREVIEWED: visual sheet is not a rule or semantic grouping oracle' };
}).sort((a, b) => a.tile - b.tile);
// Geometric review candidates only: four-neighbour connectivity is NOT object identity.
// Every non-water decoration remains listed, including ambiguous ground/coast tiles.
const pendingCells = new Map(map.decorations.filter(atom => !waterMembers.has(atom.id)).map(atom => {
  const tile = definitions[atom.definitionRef].variants.original.tiles[0][2];
  return [atom.y * width + atom.x, { atom, tile,
    bucket: tile < 112 ? 'ground-coast-unresolved' : tile < 180 ? 'mountain-texture' : tile < 184 ? 'field-texture' : 'structure-mixed' }];
}));
const candidates = [];
while (pendingCells.size) {
  const [firstCell, first] = pendingCells.entries().next().value;
  const cells = [firstCell], members = [];
  pendingCells.delete(firstCell);
  for (let cursor = 0; cursor < cells.length; cursor++) {
    const cell = cells[cursor], atom = ownership[cell];
    members.push({ cell, id: atom.id, definitionRef: atom.definitionRef });
    const x = cell % width, y = Math.floor(cell / width);
    [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const neighbour = ny * width + nx;
      if (pendingCells.get(neighbour)?.bucket !== first.bucket) return;
      pendingCells.delete(neighbour); cells.push(neighbour);
    });
  }
  members.sort((a, b) => a.cell - b.cell);
  const xs = members.map(member => member.cell % width), ys = members.map(member => Math.floor(member.cell / width));
  const bounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  const nearestCities = first.bucket === 'structure-mixed' ? source.world.cities.map(city => ({
    id: city.id, x: city.x, y: city.y,
    distance: Math.min(...members.map(member => Math.abs(member.cell % width - city.x) + Math.abs(Math.floor(member.cell / width) - city.y))),
  })).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, 3) : [];
  candidates.push({ id: `review-${first.bucket}-${members[0].cell}`, bucket: first.bucket,
    status: 'UNREVIEWED_GEOMETRIC_CANDIDATE', bounds, members, nearestCities });
}
assert.equal(candidates.reduce((sum, item) => sum + item.members.length, 0), map.decorations.filter(atom => !waterMembers.has(atom.id)).length);
// A 5x5 inspection window is deliberately NOT a city footprint or an ownership rule.
const cityWindows = source.world.cities.map(city => {
  const cells = Array.from({ length: 25 }, (_, index) => {
    const dx = index % 5 - 2, dy = Math.floor(index / 5) - 2, x = city.x + dx, y = city.y + dy;
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const cell = y * width + x, atom = ownership[cell];
    return { cell, dx, dy, ...atom, tile: definitions[atom.definitionRef].variants.original.tiles[0][2] };
  }).filter(cell => cell !== null);
  return { cityId: city.id, x: city.x, y: city.y, status: 'INSPECTION_WINDOW_NOT_FOOTPRINT', cells };
});
const cityWindowDecorations = new Set(cityWindows.flatMap(city => city.cells.filter(cell => cell.tile >= 184 && cell.layer === 'decorations').map(cell => cell.cell)));
const citySignatures = new Map();
cityWindows.forEach(city => {
  const signature = JSON.stringify(city.cells.filter(cell => cell.tile >= 184).map(cell => [cell.dx, cell.dy, cell.tile, cell.layer]));
  const cities = citySignatures.get(signature) ?? [];
  cities.push(city.cityId); citySignatures.set(signature, cities);
});
const nearStructureCandidates = candidates.filter(item => item.bucket === 'structure-mixed' && item.nearestCities[0].distance <= 2);
const candidateReport = { schema: 'system-base-map-candidates-1', revision: source.revision,
  scriptSha256: sha(readFileSync(new URL(import.meta.url))),
  boundary: 'Four-neighbour regions within visual tile ranges; no semantic assignment, city ownership, base migration, or rule changes. Nearest city uses minimum Manhattan distance, not ownership.',
  buckets: [...new Set(candidates.map(item => item.bucket))].map(bucket => {
    const items = candidates.filter(item => item.bucket === bucket);
    return { bucket, regions: items.length, cells: items.reduce((sum, item) => sum + item.members.length, 0),
      largest: Math.max(...items.map(item => item.members.length)), singletons: items.filter(item => item.members.length === 1).length };
  }), candidates, cityWindowAudit: {
    boundary: '5x5 inspection window and tile>=184 visual filter only; neither defines city membership. Repeated signatures retain layer and raw byte; no dynamic variants normalized.',
    coveredStructureDecorations: cityWindowDecorations.size,
    nearCandidateCellsOutsideWindows: nearStructureCandidates.flatMap(item => item.members.filter(member => !cityWindowDecorations.has(member.cell)).map(member => ({ candidateId: item.id, ...member }))),
    signatures: [...citySignatures].map(([signature, cityIds]) => ({ cells: JSON.parse(signature), cityIds })),
    windows: cityWindows,
  } };
const report = {
  schema: 'system-base-map-inventory-1', revision: source.revision,
  scriptSha256: sha(readFileSync(new URL(import.meta.url))),
  evidenceBoundary: 'Current registered Web source; no new DOS mechanism claims, no semantic auto-grouping.',
  checks: ['registered-38-assets-and-common-compiler', 'exact-cell-ownership', 'unknown-underlay-owner',
    'city-placement-coordinates', 'road-geometry-components', 'water-member-and-base-coverage'],
  bounds: map.bounds, summary: { cells: ownership.length, layers: count(atoms.map(atom => atom.layer)),
    definitions: tiles.length, usedDefinitions: tiles.filter(tile => tile.instances > 0).length,
    unknownUnderlays: Object.keys(map.base.unknownUnderlays).length,
    groupedWaterCells: waterMembers.size, annotatedWaterAtoms: atoms.filter(atom => atom.waterClass).length,
    baseWaterCells: waterBase.size,
    waterClasses: count(atoms.filter(atom => atom.waterClass).map(atom => atom.waterClass)),
    waterGroups: waterGroups.length, visibleWaterGroups: waterGroups.filter(group => group.showOnMinimap).length,
    roads: map.roads.length, roadDisplayKinds: count(map.roads.map(road => road.travelKind)),
    ungroupedNonWaterDecorations: map.decorations.filter(atom => !waterMembers.has(atom.id)).length },
  tiles, waterGroups: waterGroups.map(({ points, ...group }) => ({ ...group,
    bounds: { minX: Math.min(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)),
      maxX: Math.max(...points.map(p => p.x)), maxY: Math.max(...points.map(p => p.y)) } })),
  roads: map.roads.map(road => ({ id: road.id, fromCityId: road.fromCityId, toCityId: road.toCityId,
    travelKind: road.travelKind, cells: road.components.length, nativeBinding: road.nativeBinding })),
  cities: source.world.cities,
};
const samples = [
  ...[waterGroups.find(group => group.id.startsWith('water-L-north-01-')),
    waterGroups.find(group => group.id.startsWith('water-L-southeast-68176')),
    waterGroups.find(group => !group.showOnMinimap)].map(group => {
    assert.ok(group); return { label: group.id, points: group.points };
  }),
  { label: map.roads[0].id, points: map.roads[0].geometry },
  { label: map.placements[0].id, points: [map.placements[0]] },
  ...[116, 180, 223].map(tile => {
    const atom = tiles.find(item => item.tile === tile).sample;
    assert.ok(atom);
    return { label: `tile-${tile} 周邊圖樣待審（紫框只標來源格，不是已定義組合）`, points: [atom] };
  }),
];
const escape = (value) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const figures = samples.map(sample => {
  const minX = Math.max(0, Math.min(...sample.points.map(p => p.x)) - 2);
  const minY = Math.max(0, Math.min(...sample.points.map(p => p.y)) - 2);
  const maxX = Math.min(width, Math.max(...sample.points.map(p => p.x)) + 3);
  const maxY = Math.min(height, Math.max(...sample.points.map(p => p.y)) + 3);
  return `<figure><figcaption>${escape(sample.label)} · ${sample.points.length}格 · (${minX},${minY})–(${maxX - 1},${maxY - 1})</figcaption>
  <svg viewBox="${minX * 16} ${minY * 16} ${(maxX - minX) * 16} ${(maxY - minY) * 16}"><image href="map.png" width="6144" height="4096"/>
  ${sample.points.map(p => `<rect x="${p.x * 16}" y="${p.y * 16}" width="16" height="16" fill="none" stroke="#f0f" stroke-width="1"/>`).join('')}</svg></figure>`;
}).join('\n');
const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>B0 基礎地圖盤點</title>
<style>body{font-family:system-ui;margin:24px} .tiles{display:grid;grid-template-columns:repeat(16, minmax(64px,1fr));gap:8px;overflow:auto}.tile svg{width:64px;height:64px} svg{image-rendering:pixelated}figure svg{max-width:100%;max-height:600px}figure{margin:20px 0}small{display:block}</style>
<h1>B0 基礎地圖盤點（非產品頁面）</h1><p>${escape(source.revision)}</p>
<p>只讀資料清單。紫框為既存明確成員，不是自動辨識的新語義分組。無腳本／無網路；圖樣不能證明原版規則。山脈、田地、長城等仍待分組審核。</p>
<h2>256種原子圖樣（編號／全圖使用次數）</h2><div class="tiles">${tiles.map(tile => `<div class="tile"><svg viewBox="${tile.tile % 16 * 16} ${Math.floor(tile.tile / 16) * 16} 16 16"><image href="atlas.png" width="256" height="256"/></svg><small>${tile.tile} / ${tile.instances}</small></div>`).join('')}</div>
<h2>既存水域／道路／據點成員樣本</h2>${figures}</html>`;
const piecePlan = { sourceRevision: source.revision,
  plannerSha256: sha(readFileSync(new URL('./system_base_map_pieces.mjs', import.meta.url))), ...planSystemBaseMapPieces(source) };
const output = new URL(`../.dragon-analysis/system-base-map-${round}/`, import.meta.url);
mkdirSync(output); // EEXIST refuses any overwrite, including partial previous runs.
writeFileSync(new URL('inventory.json', output), JSON.stringify(report, null, 2) + '\n');
writeFileSync(new URL('ownership.json', output), JSON.stringify(ownership) + '\n');
writeFileSync(new URL('review.html', output), html);
writeFileSync(new URL('candidates.json', output), JSON.stringify(candidateReport) + '\n');
writeFileSync(new URL('piece-plan.json', output), JSON.stringify(piecePlan) + '\n');
const candidateHtml = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>B0 非水候選</title>
<style>body{font-family:system-ui;margin:24px}table{border-collapse:collapse}td,th{padding:5px;border:1px solid #aaa}svg{width:100%;max-height:600px;image-rendering:pixelated}details{margin:12px 0}</style>
<h1>非水幾何候選與Web初始分片</h1><p>用戶已選A。正式Web分片計畫見piece-plan.json：${piecePlan.groups.length}可拆組合、${piecePlan.pieces.length}片段、${Object.keys(piecePlan.definitions).length}可重用圖樣。先保留四連通組合，再按固定16×16格網及格內四連通拆片（每片≤256格）；不是原版物件身份。以下原候選圖仍用於檢查，不將近城距離當歸屬。</p><p>${escape(candidateReport.boundary)}</p><p>完整逐格成員見 candidates.json。每類最大三片與全部建築候選可展開；相鄰不代表同一物體，離城近不代表屬城。圖窗按包圍盒加邊距裁取，紫格才是候選成員。</p>
<table><tr><th>類別線索</th><th>片數</th><th>格數</th><th>最大片</th><th>單格片</th></tr>${candidateReport.buckets.map(item => `<tr><td>${item.bucket}</td><td>${item.regions}</td><td>${item.cells}</td><td>${item.largest}</td><td>${item.singletons}</td></tr>`).join('')}</table>
${candidateReport.buckets.flatMap(({ bucket }) => {
  const items = candidates.filter(item => item.bucket === bucket).sort((a, b) => b.members.length - a.members.length || a.members[0].cell - b.members[0].cell);
  return (bucket === 'structure-mixed' ? items : items.slice(0, 3)).map(item => {
    const { minX, minY, maxX, maxY } = item.bounds;
    const x = Math.max(0, minX - 3), y = Math.max(0, minY - 3);
    const w = Math.min(width, maxX + 4) - x, h = Math.min(height, maxY + 4) - y;
    return `<details><summary>${escape(item.id)} · ${item.members.length}格 · (${minX},${minY})–(${maxX},${maxY}) · 鄰近據點（不表示隸屬）${escape(item.nearestCities.map(city => `${city.id}:${city.distance}`).join(', '))}</summary><svg viewBox="${x * 16} ${y * 16} ${w * 16} ${h * 16}"><image href="map.png" width="6144" height="4096"/>${item.members.map(member => `<rect x="${member.cell % width * 16}" y="${Math.floor(member.cell / width) * 16}" width="16" height="16" fill="#f0f" fill-opacity="0.2" stroke="#f0f" stroke-width="0.5"/>`).join('')}</svg></details>`;
  });
}).join('\n')}
<h2>192據點跨層檢查窗（不是正式footprint）</h2><p>固定5×5僅作定位；不可據此自動認定附近裝飾屬城、合併道路或允許移城。完整格/層/道路身份見JSON。</p>
${cityWindows.map(city => `<details><summary>${escape(city.cityId)} · (${city.x},${city.y})</summary><svg viewBox="${(city.x - 3) * 16} ${(city.y - 3) * 16} 112 112"><image href="map.png" width="6144" height="4096"/>${city.cells.map(cell => `<rect x="${(city.x + cell.dx) * 16}" y="${(city.y + cell.dy) * 16}" width="16" height="16" fill="none" stroke="${cell.layer === 'roads' ? '#0ff' : cell.layer === 'placements' ? '#f00' : '#f0f'}" stroke-width="0.5"/>`).join('')}</svg><p>青：道路；紅：據點中心；紫：裝飾（僅層歸屬）。</p></details>`).join('\n')}</html>`;
writeFileSync(new URL('candidates.html', output), candidateHtml);
writeFileSync(new URL('atlas.png', output), readFileSync(new URL('../web/' + source.editorAssets.springAtlas.url, import.meta.url)));
writeFileSync(new URL('map.png', output), readFileSync(new URL('../web/' + source.editorAssets.seasons.spring.url, import.meta.url)));
console.log(JSON.stringify({ output: output.pathname, ...report.summary,
  webPieces: piecePlan.pieces.length, webGroups: piecePlan.groups.length, webDefinitions: Object.keys(piecePlan.definitions).length }, null, 2));
