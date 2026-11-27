// Offline converter. No UPDATE, deploy, or apply option. Output is a map artifact, not a publishable pack.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { canonicalDigest } from '../web/src/content/authoring/gamesource.js';
import { compileMapSource } from '../web/src/content/authoring/mapcompile.js';
import { compileCellMap, convertCellMap } from '../web/src/content/authoring/cellmap.js';

const [mode, input, output, gameId, ...extra] = process.argv.slice(2);
if (!['--template-sqlite', '--copy-sqlite', '--source-json'].includes(mode) || !input || !output || extra.length || (mode === '--copy-sqlite') !== Boolean(gameId)) throw new Error('usage: node tools/convert_cell_map.mjs (--template-sqlite DB | --source-json SOURCE | --copy-sqlite DB) NEW_OUTPUT_DIR [copy UUID]');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let source, sourceDigest, version;
if (mode === '--template-sqlite') {
  const db = new DatabaseSync(resolve(input), { readOnly: true });
  const row = db.prepare('SELECT version,digest,template_json FROM system_base_map WHERE singleton=1').get(); db.close();
  if (!row) throw new Error('missing system base map');
  const template = JSON.parse(row.template_json);
  sourceDigest = canonicalDigest(template, sha); assert.equal(sourceDigest, row.digest, 'template digest');
  version = row.version; source = template.content;
} else if (mode === '--copy-sqlite') {
  const db = new DatabaseSync(resolve(input), { readOnly: true });
  const row = db.prepare('SELECT data_json,copy_digest FROM game_copies WHERE game_id=?').get(gameId); db.close();
  if (!row) throw new Error('missing editable copy');
  sourceDigest = sha(row.data_json); assert.equal(sourceDigest, row.copy_digest, 'copy digest');
  source = JSON.parse(row.data_json); assert.equal(source.gameId, gameId);
} else {
  const inputBytes = readFileSync(input); sourceDigest = sha(inputBytes);
  const json = JSON.parse(inputBytes); source = json.content ?? json;
}
const original = compileMapSource({ ...source, schemaVersion: 1 }, { mapExtent: true });
const text = JSON.stringify(convertCellMap(source)), map = JSON.parse(text), converted = compileCellMap(map);
for (const key of ['terrainBytes', 'roadMask', 'geography', 'minimapGeography']) assert.deepEqual(converted[key], original[key], key);
assert.deepEqual(map.roads, source.map.roads.map(({ components, ...road }) => road));
assert.deepEqual(map.placements, source.map.placements.map(({ id, cityId, x, y }) => ({ id, cityId, x, y })));
const before = Buffer.byteLength(JSON.stringify({ map: source.map, componentDefinitions: source.componentDefinitions, selectionGroups: source.selectionGroups }));
const report = { format: map.format, sourceDigest, version, gameId, bounds: map.bounds, cells: original.width * original.height,
  legacyMapAndDefinitionsBytes: before, convertedMapBytes: Buffer.byteLength(text), mapSha256: sha(text),
  decorationsBefore: source.map.decorations.length, roads: map.roads.length, placements: map.placements.length,
  matchingPlanes: Object.fromEntries(['terrainBytes', 'roadMask', 'geography', 'minimapGeography'].map(k => [k, sha(original[k])])) };
// Only publish output after checks; never overwrite an existing report or input.
mkdirSync(output); writeFileSync(join(output, 'map.json'), text, { flag: 'wx' });
assert.equal(sha(readFileSync(join(output, 'map.json'))), report.mapSha256);
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
