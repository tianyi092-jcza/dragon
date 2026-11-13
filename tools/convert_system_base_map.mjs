// Explicit registered input + NEW output directory. No DB/network/SAVE access.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
assert.equal(process.argv.length, 4, 'usage: node tools/convert_system_base_map.mjs <registered-revision> <new-output-directory>');
assert.equal(process.argv[2], BUILTIN_RESOURCES.world.revision, 'explicit registered input revision required');
const result = convertInstalledSystemBaseMap(readInstalledEditorSource(), BUILTIN_RESOURCES.sourceDigest);
result.receipt.toolHashes = Object.fromEntries(['convert_system_base_map.mjs', 'system_base_map_conversion.mjs', 'system_base_map_pieces.mjs', '../server/systembasemap.js'].map(path =>
  [path, createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex')]));
const output = resolve(process.argv[3]);
mkdirSync(output); // Existing directory is always refused, never overwritten.
Object.entries(result).forEach(([name, value]) => writeFileSync(resolve(output, `${name}.json`), JSON.stringify(value) + '\n'));
console.log(JSON.stringify({ output, ...result.receipt }, null, 2));
