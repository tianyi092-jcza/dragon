// Offline city-slice projection only. Never installs a game or changes its version.
// Output leaf must be new; validation finishes before any output is created.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { convertLegacyCitySource } from '../web/src/content/authoring/citysourceconversion.js';
import { convertLegacyChapterCities } from '../web/src/content/authoring/chaptercityconversion.js';

const { values } = parseArgs({ options: {
  source: { type: 'string' },
  'default-chapter': { type: 'string' },
  'battle-maps': { type: 'string' },
  output: { type: 'string' },
}, strict: true, allowPositionals: false });
for (const key of ['source', 'default-chapter', 'battle-maps', 'output']) {
  if (!values[key]) throw new Error(`Required --${key}`);
}
const sourceBytes = await readFile(resolve(values.source));
const bindingBytes = await readFile(resolve(values['battle-maps']));
const game = JSON.parse(sourceBytes.toString('utf8'));
const result = convertLegacyCitySource(game, {
  defaultChapterId: values['default-chapter'],
  battleMapIds: JSON.parse(bindingBytes.toString('utf8')),
});
const chapterCities = convertLegacyChapterCities(game, result.legacyBindings);
const chapterText = JSON.stringify(chapterCities, null, 2) + '\n';
const sourceText = JSON.stringify(result.citySource, null, 2) + '\n';
const bindingsText = JSON.stringify(result.legacyBindings, null, 2) + '\n';
const receipt = {
  version: 1,
  scope: 'city-source-projection-only',
  converterRevision: 'city-source-projection-4',
  codeHashes: Object.fromEntries(await Promise.all([
    './export_city_source_projection.mjs',
    '../web/src/content/authoring/citysourceconversion.js',
    '../web/src/content/authoring/citysource.js',
    '../web/src/content/authoring/cityidentity.js',
    '../web/src/content/authoring/cityrecords.js',
    '../web/src/content/authoring/chaptercityconversion.js',
    '../web/src/game/nativefactions.js',
  ].map(async path => [path, createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex')]))),
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  battleBindingsSha256: createHash('sha256').update(bindingBytes).digest('hex'),
  defaultChapterId: result.defaultChapterId,
  cityCount: result.citySource.cityOrder.length,
  chapterCount: Object.keys(chapterCities.chapters).length,
  countChangeCount: chapterCities.countChanges.length,
  outputs: {
    'city-source.json': createHash('sha256').update(sourceText).digest('hex'),
    'chapter-cities.json': createHash('sha256').update(chapterText).digest('hex'),
    'legacy-bindings.json': createHash('sha256').update(bindingsText).digest('hex'),
  },
  excluded: ['other-chapter-state-conversion', 'remaining-native-initializer-conversion', 'road-conversion', 'runtime-admission', 'publication', 'save-migration'],
};
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // No recursive/exists fallback for the leaf; never overwrite a round.
await writeFile(join(output, 'city-source.json'), sourceText, { encoding: 'utf8', flag: 'wx' });
await writeFile(join(output, 'legacy-bindings.json'), bindingsText, { encoding: 'utf8', flag: 'wx' });
await writeFile(join(output, 'chapter-cities.json'), chapterText, { encoding: 'utf8', flag: 'wx' });
// Receipt last: a failed write cannot produce a success receipt for partial output.
await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ output, scope: receipt.scope, cityCount: receipt.cityCount }));
