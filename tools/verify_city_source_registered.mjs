// Read-only 41-role registered source -> isolated CITY SLICE audit, not migration.
// Writes only a new caller-named report leaf. No SAVE/IDB, original SINARIO or network.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { captureCitySource } from '../web/src/content/authoring/citysource.js';
import { compileChapterCityState } from '../web/src/content/authoring/chaptercitycompile.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';
import { encodeRoadGraphV2 } from '../web/src/content/authoring/roadedit.js';
import { createOriginalRoadMemory } from '../web/src/game/navigation/originalroadmemory.js';
import { searchOriginalRoadMemory } from '../web/src/game/navigation/originalroadsearch.js';
import { searchStructuredRoadGraph } from '../web/src/game/navigation/structuredroadsearch.js';
import { selectOriginalRoad47BB } from '../web/src/game/navigation/originalroadmovement.js';
import { selectStructuredRoad } from '../web/src/game/navigation/structuredroadselection.js';
import { retreatOriginalRoadMemory } from '../web/src/game/navigation/originalroadretreat.js';
import { findStructuredRetreatCity } from '../web/src/game/navigation/structuredroadretreat.js';
import { createSiegeMapCatalog, resolveSiegeMap } from '../web/src/content/battlemapcatalog.js';

const { values } = parseArgs({ options: { output: { type: 'string' } }, strict: true, allowPositionals: false });
if (!values.output) throw new Error('Required --output <new-report-leaf>');
let serial = 0;
const load = createPinnedCopyLoader({
  allocateEntityId: () => `00000000-0000-4000-8000-${(++serial).toString(16).padStart(12, '0')}`,
});
const { game, provenance } = await load({
  gameId: '11111111-1111-4111-8111-111111111111', ownerId: 'city-capacity-offline-audit',
});
const definitions = Object.values(game.cities).sort((a, b) => a.runtimeSlot - b.runtimeSlot);
const defaultChapterId = game.chapterOrder[0];
const defaultCities = new Map(game.chapters[defaultChapterId].state.cities.map(city => [city.idx, city]));
// Actual program directory bindings, NOT city-type/layout or tactical admission.
// This resource is separate from the 41-role source registration; bind it explicitly.
const battleResourceUrl = new URL('../web/battle_maps.json', import.meta.url);
const battleResourceBytes = await readFile(battleResourceUrl);
const battleResourceSha = createHash('sha256').update(battleResourceBytes).digest('hex');
const battleMaps = JSON.parse(battleResourceBytes.toString('utf8'));
const siegeCatalog = createSiegeMapCatalog(battleMaps);
const siegeMaps = Object.values(siegeCatalog);
const battleMapIds = definitions.map(city => siegeMaps[city.runtimeSlot].battleMapId);
for (const city of definitions) {
  const id = battleMapIds[city.runtimeSlot];
  assert.deepEqual(resolveSiegeMap(siegeCatalog, id), { battleMapId: id, ...battleMaps.directory[city.runtimeSlot] });
}
const root = resolve(values.output);
await mkdir(dirname(root), { recursive: true });
await mkdir(root);
const sourcePath = join(root, 'captured-source.json'), bindingPath = join(root, 'battle-map-ids.json');
const sourceText = JSON.stringify(game), bindingText = JSON.stringify(battleMapIds);
await writeFile(sourcePath, sourceText, { encoding: 'utf8', flag: 'wx' });
await writeFile(bindingPath, bindingText, { encoding: 'utf8', flag: 'wx' });
const tool = fileURLToPath(new URL('./export_city_source_projection.mjs', import.meta.url));
for (const round of ['first', 'second']) {
  execFileSync(process.execPath, [tool, '--source', sourcePath, '--battle-maps', bindingPath,
    '--default-chapter', defaultChapterId, '--output', join(root, round)], { encoding: 'utf8', stdio: 'pipe' });
}
for (const name of ['city-source.json', 'chapter-cities.json', 'legacy-bindings.json', 'receipt.json'])
  assert.equal(await readFile(join(root, 'first', name), 'utf8'), await readFile(join(root, 'second', name), 'utf8'));
const projected = JSON.parse(await readFile(join(root, 'first', 'city-source.json'), 'utf8'));
assert.deepEqual(projected.cityOrder, definitions.map(city => city.cityId));
assert.deepEqual(projected.placements, game.map.placements);
for (const city of definitions) {
  const { runtimeSlot, x, y, ...fields } = city;
  assert.deepEqual(projected.cities[city.cityId], {
    ...fields, troops_cap: defaultCities.get(runtimeSlot).troops_cap, battleMapId: battleMapIds[runtimeSlot],
  });
  assert.equal(projected.identity.indexByCityId[city.cityId], runtimeSlot);
}
const legacy = JSON.parse(await readFile(join(root, 'first', 'legacy-bindings.json'), 'utf8'));
assert.deepEqual(legacy, definitions.map(({ cityId, runtimeSlot, x, y }) => ({ cityId, runtimeSlot, x, y })));
const chapterProjection = JSON.parse(await readFile(join(root, 'first', 'chapter-cities.json'), 'utf8'));
const expectedChanges = [];
assert.deepEqual(Object.keys(chapterProjection.chapters), game.chapterOrder);
for (const chapterId of game.chapterOrder) {
  const state = game.chapters[chapterId].state, result = chapterProjection.chapters[chapterId];
  assert.deepEqual(result.cities, Object.fromEntries(state.cities.map(city => {
    const bytes = Buffer.from(city.raw, 'hex');
    return [definitions[city.idx].cityId, {
      ...Object.fromEntries(['faction', 'governor', 'prod', 'growth', 'defence', 'troops', 'troops_cap'].map(key => [key, city[key]])),
      initializer: { attr: bytes[0], _aiCooldown: bytes[0x17], _strategicLastFaction: bytes[0x1a],
        strategicBorderCount: bytes[0x1b], disaster_event: bytes[0x15], cityCacheByte: bytes[0x18],
        neighbourCityIds: Array.from(bytes.subarray(0x1c, 0x20), index => index === 255 ? null : definitions[index].cityId) },
    }];
  })));
  assert.equal(result.factions.length, 22);
  for (let index = 0; index < 22; index++) {
    const bytes = Buffer.from(state.nativeFactionSlotRaw[index], 'hex');
    const nCities = state.cities.filter(city => city.faction === index).length;
    const reference = offset => bytes[offset] === 255 ? null : definitions[bytes[offset]].cityId;
    assert.deepEqual(result.factions[index], { factionIndex: index, declared: index < state.factions.length,
      capitalCityId: reference(3), strategicCityPrimaryId: reference(0x16), strategicCitySecondaryId: reference(0x17), nCities });
    const declared = state.factions[index];
    if (nCities !== bytes[0x23] || (declared && declared.n_cities !== nCities))
      expectedChanges.push({ chapterId, factionIndex: index, before: bytes[0x23], declaredBefore: declared?.n_cities ?? null, after: nCities });
  }
}
assert.deepEqual(chapterProjection.countChanges, expectedChanges);
const capturedCities = captureCitySource(projected, { draft: false });
const roadGraph = projectStructuredRoadGraph(game.map.roads, capturedCities);
const neighbourOrders = { rowsCompared: 0, orderedDifferences: 0, strategicSlotGapRows: 0,
  navigationPortGapNodes: roadGraph.nodes.filter(node => node.ports.some((port, i) =>
    port === null && node.ports.slice(i + 1).some(other => other !== null))).length };
const runtimeCitySlices = Object.fromEntries(game.chapterOrder.map(chapterId => {
  const state = game.chapters[chapterId].state;
  const compiled = compileChapterCityState(capturedCities, chapterProjection.chapters[chapterId], roadGraph);
  const byIndex = new Map(state.cities.map(city => [city.idx, city]));
  // Independent source/raw oracle, not a re-use of the stable-ID projection.
  assert.deepEqual(compiled.cities, definitions.map(definition => {
    const city = byIndex.get(definition.runtimeSlot), bytes = Buffer.from(city.raw, 'hex');
    return { idx: city.idx, cityId: definition.cityId, name: definition.name,
      x: definition.x, y: definition.y, max_prod: definition.max_prod,
      type: definition.type, view: definition.view, battleMapId: battleMapIds[city.idx],
      ...Object.fromEntries(['faction', 'governor', 'prod', 'growth', 'defence', 'troops', 'troops_cap'].map(key => [key, city[key]])),
      attr: bytes[0], _aiCooldown: bytes[0x17], _strategicLastFaction: bytes[0x1a],
      strategicBorderCount: bytes[0x1b], disaster_event: bytes[0x15],
      strategicNeighbours: Array.from(bytes.subarray(0x1c), index => index === 255 ? null : index) };
  }));
  assert.deepEqual(compiled.cityCache, definitions.map(definition => Buffer.from(byIndex.get(definition.runtimeSlot).raw, 'hex')[0x18]));
  assert.deepEqual(compiled.factionCities, state.nativeFactionSlotRaw.map((raw, factionIndex) => {
    const bytes = Buffer.from(raw, 'hex');
    const reference = offset => bytes[offset] === 255 ? null : bytes[offset];
    return { factionIndex, declared: factionIndex < state.factions.length,
      capitalCityIndex: reference(3), strategicCityPrimaryIndex: reference(0x16),
      strategicCitySecondaryIndex: reference(0x17),
      nCities: state.cities.filter(city => city.faction === factionIndex).length };
  }));
  assert.deepEqual(compileChapterCityState(capturedCities, chapterProjection.chapters[chapterId], roadGraph), compiled);
  assert.deepEqual(JSON.parse(JSON.stringify(compiled)), compiled);
  for (const city of compiled.cities) {
    const strategic = city.strategicNeighbours.filter(index => index !== null);
    const navigation = roadGraph.nodes[city.idx].ports.filter(port => port !== null).map(port => {
      const edge = roadGraph.edges[port.roadIndex];
      return port.end === 'from' ? edge.toCityIndex : edge.fromCityIndex;
    });
    assert.deepEqual([...strategic].sort((a, b) => a - b), [...navigation].sort((a, b) => a - b));
    neighbourOrders.rowsCompared++;
    if (JSON.stringify(strategic) !== JSON.stringify(navigation)) neighbourOrders.orderedDifferences++;
    if (city.strategicNeighbours.some((index, i) => index === null && city.strategicNeighbours.slice(i + 1).some(other => other !== null)))
      neighbourOrders.strategicSlotGapRows++;
  }
  return [chapterId, compiled];
}));
const runtimeCityText = JSON.stringify(runtimeCitySlices, null, 2) + '\n';
await writeFile(join(root, 'runtime-city-slices.json'), runtimeCityText, { encoding: 'utf8', flag: 'wx' });
// Independent old encoder oracle: only representation changes, never search/RNG.
const oldGraph = encodeRoadGraphV2(game.map.roads, new Map(definitions.map(city => [city.cityId, city])));
for (const [i, node] of oldGraph.nodes.entries()) {
  assert.deepEqual(roadGraph.nodes[i], { cityId: definitions[i].cityId, cityIndex: i, x: node.x, y: node.y,
    ports: node.edgeSlots.map(tag => tag === 0 ? null : {
      roadIndex: ((tag & 0x3fff) - 0x800) / 16, end: tag & 0x4000 ? 'from' : 'to',
    }) });
}
for (const [i, edge] of oldGraph.edges.entries()) {
  assert.deepEqual(roadGraph.edges[i], { roadId: game.map.roads[i].id,
    fromCityIndex: edge.source, toCityIndex: edge.target, cost: edge.weight, points: edge.points, bounds: edge.bounds });
}
assert.deepEqual(projectStructuredRoadGraph(game.map.roads, capturedCities), roadGraph);
const roadText = JSON.stringify(roadGraph, null, 2) + '\n';
await writeFile(join(root, 'road-topology.json'), roadText, { encoding: 'utf8', flag: 'wx' });
// Same registered graph, independent address-based oracle; no live App/clock.
const roadMemory = createOriginalRoadMemory(oldGraph);
const searchProfiles = [];
for (const profile of [
  { name: 'default-chapter-owner-0-all-pairs', startStep: 1,
    owners: definitions.map(city => defaultCities.get(city.runtimeSlot).faction ?? 0x18) },
  { name: 'all-owned-owner-0-sampled-roots', startStep: 8, owners: definitions.map(() => 0) },
  { name: 'all-foreign-owner-0-sampled-roots', startStep: 8, owners: definitions.map(() => 1) },
]) {
  const digest = createHash('sha256');
  let queries = 0, shortcuts = 0, unreachable = 0;
  const starts = roadGraph.nodes.filter(node => node.cityIndex % profile.startStep === 0);
  for (const { cityIndex: startCityIndex } of starts) {
    // Two-stop queries model searching toward either endpoint while in a road.
    const stops = roadGraph.nodes.map(node => [node.cityIndex]);
    if (profile.startStep === 1 && startCityIndex % 8 === 0)
      stops.push(...roadGraph.edges.map(edge => [edge.fromCityIndex, edge.toCityIndex]));
    for (const stopCityIndices of stops) {
      const oldReads = [], newReads = [];
      const old = searchOriginalRoadMemory({ start: startCityIndex * 8,
        stopB: stopCityIndices[0] * 8, stopC: (stopCityIndices[1] ?? stopCityIndices[0]) * 8, owner: 0,
        readGraphByte: roadMemory.readByte, writeGraphByte: roadMemory.writeByte,
        readStateByte: address => { const index = (address - 0x841) / 32; oldReads.push(index); return profile.owners[index]; },
      });
      const actual = searchStructuredRoadGraph(roadGraph, { startCityIndex, stopCityIndices, owner: 0,
        readCityOwner: index => { newReads.push(index); return profile.owners[index]; } });
      let expected;
      if (old.reason === 'shortcut') {
        shortcuts++;
        expected = { status: 'already-there', cityIndex: startCityIndex };
      } else if (old.reason === 'exhausted') {
        unreachable++;
        expected = { status: 'unreachable' };
      } else {
        assert.ok(old.ax === 4 || old.ax === 0xfffc);
        const roadIndex = (old.bx - 0x800) / 16, direction = old.ax === 4 ? 1 : -1;
        expected = { status: 'found', roadIndex, direction, costWord: old.cx,
          cityIndex: direction === 1 ? oldGraph.edges[roadIndex].source : oldGraph.edges[roadIndex].target };
      }
      assert.deepEqual(actual, expected, `${profile.name} ${startCityIndex} -> ${stopCityIndices}`);
      assert.deepEqual(newReads, oldReads, 'owner read order differs');
      digest.update(JSON.stringify([startCityIndex, stopCityIndices, actual, newReads]) + '\n');
      queries++;
    }
  }
  searchProfiles.push({ name: profile.name, owner: 0, startStep: profile.startStep,
    ownersSha256: createHash('sha256').update(JSON.stringify(profile.owners)).digest('hex'),
    queries, shortcuts, unreachable, resultAndOwnerReadTraceSha256: digest.digest('hex') });
}
// Actual registered road midpoints and nodes: selection decisions only, no XY,
// occupancy, contact or fate execution. Scratch memory stays private to the oracle.
const selectionProfiles = [];
const sampledTargets = roadGraph.nodes.filter(node => node.cityIndex % 16 === 0).map(node => node.cityIndex);
const graphWord = at => roadMemory.readByte(at) | roadMemory.readByte(at + 1) << 8;
const ownershipProfiles = [
  ['default-chapter', definitions.map(city => defaultCities.get(city.runtimeSlot).faction ?? 0x18)],
  ['all-owned', definitions.map(() => 0)],
  ['all-foreign', definitions.map(() => 1)],
];
const positions = [
  ...roadGraph.nodes.map(node => ({ kind: 'city', cityIndex: node.cityIndex })),
  ...roadGraph.edges.flatMap((edge, roadIndex) => [-1, 1].map(direction => ({
    kind: 'road', roadIndex, pointIndex: Math.floor(edge.points.length / 2), direction,
  }))),
];
for (const [name, owners] of ownershipProfiles) {
  const trace = createHash('sha256');
  let queries = 0, selected = 0, alreadyThere = 0, fateRequired = 0, endpointShortcuts = 0;
  for (const position of positions) {
    const onRoad = position.kind === 'road';
    const edge = onRoad ? roadGraph.edges[position.roadIndex] : null;
    const targets = onRoad ? [...new Set([...sampledTargets, edge.fromCityIndex, edge.toCityIndex])] : sampledTargets;
    for (const targetCityIndex of targets) for (const command of [1, 10]) {
      const current = onRoad ? 0x800 + position.roadIndex * 16 : position.cityIndex * 8;
      const bytes = { 0: 0xa2, 1: 0, 0x0a: onRoad ? (position.direction === 1 ? 4 : 252) : 128, 0x23: command };
      const words = { 0x0e: current, 0x0c: onRoad ? graphWord(current) + position.pointIndex * 4 : 0x7777, 0x14: targetCityIndex * 8 };
      const oldReads = [], newReads = [], writes = [], fate = [];
      const old = selectOriginalRoad47BB({
        readByte: at => { assert.ok(Object.hasOwn(bytes, at)); return bytes[at]; },
        readWord: at => { assert.ok(Object.hasOwn(words, at)); return words[at]; },
        writeByte: (at, value) => { writes.push(at); bytes[at] = value; },
        writeWord: (at, value) => { writes.push(at); words[at] = value; },
        graphWord, readGraphByte: roadMemory.readByte, writeGraphByte: roadMemory.writeByte,
        readCityOwnerByte: at => { const index = (at - 0x841) / 32; oldReads.push(index); return owners[index]; },
        fate: owner => fate.push(owner),
      });
      const before = JSON.stringify(position);
      const actual = selectStructuredRoad(roadGraph, { position, targetCityIndex, owner: 0, command,
        readCityOwner: index => { newReads.push(index); return owners[index]; } });
      assert.equal(JSON.stringify(position), before);
      assert.deepEqual(newReads, oldReads, 'selection owner read order differs');
      assert.equal(bytes[0] & 0xfe, 0xa2, 'unrelated legion status bits changed');
      if (old.cf) {
        assert.equal(actual.status, 'fate-required');
        assert.equal(actual.owner, 0);
        assert.deepEqual(fate, [0]);
        assert.deepEqual(writes, []);
        fateRequired++;
      } else if (!onRoad && targetCityIndex === position.cityIndex) {
        assert.deepEqual(actual, { status: 'already-there' });
        assert.deepEqual(writes, []);
        assert.equal(words[0x0c], 0x7777);
        assert.equal(bytes[0x0a], 128);
        alreadyThere++;
      } else {
        assert.equal(actual.status, 'selected');
        assert.deepEqual(actual.position, { kind: 'road', roadIndex: (words[0x0e] - 0x800) / 16,
          pointIndex: (words[0x0c] - graphWord(words[0x0e])) / 4, direction: bytes[0x0a] === 4 ? 1 : -1 });
        assert.equal(actual.hasEnteredRoad, Boolean(bytes[0] & 1));
        assert.deepEqual(writes, onRoad ? [0, 0x0a] : [0x0c, 0x0e, 0, 0x0a]);
        if (onRoad && [edge.fromCityIndex, edge.toCityIndex].includes(targetCityIndex)) {
          assert.deepEqual(newReads, []);
          endpointShortcuts++;
        }
        selected++;
      }
      trace.update(JSON.stringify([position, targetCityIndex, command, actual, newReads, writes]) + '\n');
      queries++;
    }
  }
  selectionProfiles.push({ name, owner: 0, commands: [1, 10], targetStep: 16,
    roadPoints: 'floor(length/2)', directions: [-1, 1], includeRoadEndpoints: true,
    ownersSha256: createHash('sha256').update(JSON.stringify(owners)).digest('hex'),
    queries, selected, alreadyThere, fateRequired, endpointShortcuts,
    resultReadAndWriteTraceSha256: trace.digest('hex') });
}
// Actual graph 487B decisions, separately from continuation/fate/occupancy writes.
const retreatProfiles = [];
for (const [name, owners] of ownershipProfiles) {
  const trace = createHash('sha256');
  const failures = {};
  let queries = 0, found = 0, alreadyThere = 0;
  for (const position of positions) {
    const onRoad = position.kind === 'road';
    const edge = onRoad ? roadGraph.edges[position.roadIndex] : null;
    const capitals = [...new Set([null, ...sampledTargets,
      ...(onRoad ? [edge.fromCityIndex, edge.toCityIndex] : [position.cityIndex])])];
    for (const capitalCityIndex of capitals) {
      const oldReads = [], newReads = [];
      let oldCurrentReads = 0;
      const old = retreatOriginalRoadMemory({
        readFactionByte: () => 0,
        readCapitalByte: () => capitalCityIndex === null ? 255 : capitalCityIndex,
        readCurrentWord: () => {
          oldCurrentReads++;
          return onRoad ? 0x800 + position.roadIndex * 16 : position.cityIndex * 8;
        },
        readGraphByte: roadMemory.readByte, writeGraphByte: roadMemory.writeByte,
        readStateByte: address => {
          const index = (address - 0x841) / 32;
          oldReads.push(index);
          return owners[index];
        },
      });
      const before = JSON.stringify(position);
      const actual = findStructuredRetreatCity(roadGraph, { position, capitalCityIndex, owner: 0,
        readCityOwner: index => { newReads.push(index); return owners[index]; } });
      assert.equal(JSON.stringify(position), before);
      assert.equal(oldCurrentReads, capitalCityIndex === null ? 0 : 1);
      const expected = old.cf ? { status: 'unreachable', reason: old.reason }
        : old.reason === 'exhausted' ? { status: 'unreachable', reason: 'no-route' }
          : { status: old.reason === 'shortcut' ? 'already-there' : 'found', cityIndex: old.bx / 32 };
      assert.deepEqual(actual, expected, `${name} retreat ${JSON.stringify(position)} -> ${capitalCityIndex}`);
      assert.deepEqual(newReads, oldReads, 'retreat owner read order differs');
      if (actual.status === 'found') found++;
      else if (actual.status === 'already-there') alreadyThere++;
      else failures[actual.reason] = (failures[actual.reason] ?? 0) + 1;
      trace.update(JSON.stringify([position, capitalCityIndex, actual, newReads, oldCurrentReads]) + '\n');
      queries++;
    }
  }
  retreatProfiles.push({ name, owner: 0, capitalStep: 16, includeNoCapital: true,
    includeCurrentCityOrRoadEndpoints: true, roadPoints: 'floor(length/2)', directions: [-1, 1],
    ownersSha256: createHash('sha256').update(JSON.stringify(owners)).digest('hex'),
    queries, found, alreadyThere, failures, resultAndOwnerReadTraceSha256: trace.digest('hex') });
}
assert.equal(JSON.stringify(roadGraph, null, 2) + '\n', roadText);
assert.equal(JSON.stringify(game), sourceText);
assert.equal(await readFile(sourcePath, 'utf8'), sourceText);
assert.equal(await readFile(bindingPath, 'utf8'), bindingText);
for (const [path, digest] of Object.entries(provenance.inputHashes)) {
  const bytes = await readFile(new URL('../web/' + path, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, path);
}
assert.equal(createHash('sha256').update(await readFile(battleResourceUrl)).digest('hex'), battleResourceSha);
const catalogText = JSON.stringify(siegeCatalog, null, 2) + '\n';
await writeFile(join(root, 'siege-catalog.json'), catalogText, { encoding: 'utf8', flag: 'wx' });
const report = {
  version: 1, scope: 'registered-source-detached-projection-search-selection-retreat-with-city-runtime-slice-and-siege-bindings',
  registryId: provenance.registryId, revision: provenance.revision,
  inputHashes: provenance.inputHashes, defaultChapterId,
  projectionCodeHashes: JSON.parse(await readFile(join(root, 'first', 'receipt.json'), 'utf8')).codeHashes,
  auditCodeHashes: Object.fromEntries(await Promise.all([
    './verify_city_source_registered.mjs', './editor_trusted_copy.mjs',
    './editor_builtin_source.mjs', './editor_entity_source.mjs',
    '../web/src/content/battlemapcatalog.js', '../web/src/content/authoring/chaptercitycompile.js',
    '../web/src/content/authoring/structuredroadgraph.js', '../web/src/content/authoring/roadedit.js',
    '../web/src/game/navigation/originalroadmemory.js', '../web/src/game/navigation/originalroadsearch.js',
    '../web/src/game/navigation/structuredroadsearch.js',
    '../web/src/game/navigation/originalroadmovement.js', '../web/src/game/navigation/structuredroadselection.js',
    '../web/src/game/navigation/originalroadretreat.js', '../web/src/game/navigation/structuredroadretreat.js',
  ].map(async path => [path, createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex')]))),
  siegeDirectory: { resource: 'web/battle_maps.json', resourceSha256: battleResourceSha,
    resourceBytes: battleResourceBytes.length, entries: siegeMaps.length,
    catalogFile: 'siege-catalog.json', catalogSha256: createHash('sha256').update(catalogText).digest('hex'),
    originalSlotBindings: definitions.length, resourceUnchanged: true,
    scope: 'program-resource-directory-metadata-binding-only',
    unverified: ['raw-BATTLE-binary-authenticity', 'city-type-layout-admission', 'tactical-entry-and-exit', 'formal-pack-registration'] },
  cityCount: definitions.length, chapterCountUnmodified: game.chapterOrder.length,
  chapterCityRowsProjected: Object.values(chapterProjection.chapters).reduce((n, chapter) => n + Object.keys(chapter.cities).length, 0),
  cityCountChanges: chapterProjection.countChanges,
  runtimeCitySlices: { file: 'runtime-city-slices.json', sha256: createHash('sha256').update(runtimeCityText).digest('hex'),
    chapters: game.chapterOrder.length, cities: Object.values(runtimeCitySlices).reduce((sum, chapter) => sum + chapter.cities.length, 0),
    factionCityRecords: Object.values(runtimeCitySlices).reduce((sum, chapter) => sum + chapter.factionCities.length, 0),
    neighbourOrders,
    scope: 'detached-city-reference-initializer-and-topology-coherence-compilation-only',
    unverified: ['remaining-scenario-state', 'v3-assembly', 'runtime-consumer-wiring', 'save-restore', 'M192'] },
  placementMetadataPreserved: ['id', 'componentRef', 'variantRef', 'importRef'],
  roadTopology: { nodes: roadGraph.nodes.length, edges: roadGraph.edges.length,
    points: roadGraph.edges.reduce((count, edge) => count + edge.points.length, 0),
    sha256: createHash('sha256').update(roadText).digest('hex'), version: roadGraph.version,
    scope: 'transport-only-v2-encoder-comparison' },
  roadSearch: { scope: 'detached-legacy-word-cost-oracle-comparison', profiles: searchProfiles,
    queries: searchProfiles.reduce((sum, profile) => sum + profile.queries, 0),
    unverified: ['all-ownership-configurations', 'CPU-execution', 'new-cost-policy', 'movement-and-retreat-callers'] },
  roadSelection: { scope: 'detached-47BB-decision-and-write-order-comparison', profiles: selectionProfiles,
    queries: selectionProfiles.reduce((sum, profile) => sum + profile.queries, 0),
    unverified: ['all-points-and-targets', 'unreachable-on-registered-graph', 'CPU-execution', 'legion-write-commit', 'occupancy', 'contact', 'fate-execution', 'retreat-callers', 'new-cost-policy'] },
  roadRetreat: { scope: 'detached-487B-decision-and-owner-read-order-comparison', profiles: retreatProfiles,
    queries: retreatProfiles.reduce((sum, profile) => sum + profile.queries, 0),
    unverified: ['all-ownership-configurations', 'all-capitals-and-position-snapshots', 'unreachable-on-registered-graph', 'CPU-execution', 'legion-write-commit', 'occupancy', 'fate-execution', 'battle-continuation-callers', 'new-cost-policy'] },
  deterministicTwoRounds: true, registeredInputsUnchanged: true,
  excluded: ['battle-type-layout-admission', 'tactical-entry-and-exit', 'other-chapter-state-conversion', 'remaining-native-initializer-conversion', 'road-derivation-and-route-behaviour', 'runtime-admission', 'M192', 'publication', 'save-migration'],
};
await writeFile(join(root, 'audit.json'), JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS', output: root, scope: report.scope, cities: report.cityCount, inputs: Object.keys(report.inputHashes).length }));
