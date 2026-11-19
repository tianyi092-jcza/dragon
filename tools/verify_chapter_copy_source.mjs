// Read pinned non-save assets; all source construction and copy work is in memory.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { isInstalledSourcePolicy, isIsolatedChapterSourcePolicy, isolatedChapterSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';
register('../vps/text-loader.mjs', import.meta.url);
const { createEditorApplication } = await import('../server/editorapp.js');
const { PublishedPacks } = await import('../server/playpacks.js');
import { buildChapterCopySourceFixture, createIsolatedChapterCopyLoader } from './fixtures/chapter-copy-source.mjs';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { initializeCopyChapters } from '../server/copychapters.js';
import { initializeCopyGenerals } from '../server/copygenerals.js';
import { validateGameSource } from '../web/src/content/authoring/gamesource.js';

const fixture = buildChapterCopySourceFixture();
const originalBytes = Buffer.from(fixture.bytes);
const options = { role: fixture.role, registryId: fixture.registryId,
  readWeb: path => { assert.ok(path === fixture.role.path || fixture.basePolicy.roles.some(role => role.path === path)); return Uint8Array.from(fixture.isolatedSource.readWeb(path)); } };

test('independent immutable fixture copies every registered chapter through the shared profile', async () => {
  assert.notEqual(fixture.registryId, 'approved-builtin-28805f-entities7e7-1');
  assert.equal(createHash('sha256').update(fixture.bytes).digest('hex'), fixture.sourceDigest);
  const profile = new FixedCopyProfile({ loadCopy: createIsolatedChapterCopyLoader(options) });
  const captured = await profile.capture({ gameId: 'isolated-full-copy', ownerId: 'fixture-author' });
  assert.equal(captured.provenance.registryId, fixture.registryId);
  assert.equal(captured.provenance.sourceDigest, fixture.sourceDigest);
  assert.equal(captured.game.chapterOrder.length, fixture.chapterIds.length);
  assert.equal(captured.game.chapterOrder.length + fixture.excluded.length, 20, 'count is this pinned input, not an engine rule');
  assert.equal(profile.verify(captured.capability, captured.game).sourceDigest, captured.baselineDigest);
  const converted = initializeCopyChapters(initializeCopyGenerals(captured.game));
  validateGameSource(converted, { draft: true });
  assert.deepEqual(converted.chapterConversion.duplicates.map(row => [row.keptFactionIdx, row.discardedFactionIdx]), [[2, 11], [10, 15], [1, 10], [2, 3]], 'registered source retains both same-monarch and shared-capital positive controls');
  assert.equal(converted.chapterOrder.length, fixture.chapterIds.length, 'conversion drops no fixture chapters');
  assert.deepEqual(fixture.bytes, originalBytes);
});

test('startup accepts only branded isolated policy and keeps all original pins unchanged', async () => {
  const { basePolicy, isolatedSource } = fixture;
  assert.equal(isInstalledSourcePolicy(isolatedSource.policy), true);
  assert.equal(isIsolatedChapterSourcePolicy(isolatedSource.policy), true);
  assert.equal(isIsolatedChapterSourcePolicy(basePolicy), false);
  assert.equal(isolatedSource.policy.roles.length, basePolicy.roles.length + 1);
  basePolicy.roles.forEach(role => assert.deepEqual(isolatedSource.policy.roles.find(row => row.path === role.path), role));
  assert.equal(basePolicy.registryId, 'approved-builtin-28805f-entities7e7-1');
  assert.notEqual(basePolicy.sourceDigest, isolatedSource.policy.sourceDigest);
  assert.throws(() => isolatedChapterSourcePolicy({ ...basePolicy }, fixture.role), /pinned base/);
  for (const policy of [basePolicy, { ...isolatedSource.policy }]) {
    assert.throws(() => createEditorApplication(class {}, { isolatedCopySource: { ...isolatedSource, policy } }), /branded chapter source/);
    await assert.rejects(stageInstalledEditorSource({}, { ...isolatedSource, policy }), /branded staging source/);
    assert.throws(() => new PublishedPacks({ isolatedSourcePolicy: policy }), /branded publication source/);
  }
  assert.equal(typeof createEditorApplication(class {}, { isolatedCopySource: isolatedSource }), 'function');
  const objects = new Map();
  const root = await stageInstalledEditorSource({
    get: async key => objects.has(key) ? { arrayBuffer: async () => objects.get(key) } : null,
    put: async (key, bytes, conditions) => {
      assert.deepEqual(conditions, { onlyIf: { etagDoesNotMatch: '*' } });
      assert.ok(key.startsWith(`installed/${fixture.registryId}/`));
      assert.equal(objects.has(key), false); objects.set(key, Buffer.from(bytes)); return true;
    },
  }, isolatedSource);
  assert.equal(root.registryId, fixture.registryId);
  const index = JSON.parse(objects.get(`installed/${root.registryId}/${root.root.sha256}`).toString());
  assert.equal(index.roles.length, basePolicy.roles.length + 1);
  assert.deepEqual(index.roles.find(role => role.path === fixture.role.path).sha256, fixture.sourceDigest);
});

test('fixture loader rejects altered bytes, length, path and original-source identity', () => {
  const damaged = Buffer.from(fixture.bytes); damaged[damaged.length - 2] ^= 1;
  assert.throws(() => createIsolatedChapterCopyLoader({ ...options, readWeb: () => damaged }), /byte identity mismatch/);
  assert.throws(() => createIsolatedChapterCopyLoader({ ...options, role: { ...fixture.role, byteLength: fixture.role.byteLength + 1 } }), /byte identity mismatch/);
  assert.throws(() => createIsolatedChapterCopyLoader({ ...options, role: { ...fixture.role, path: 'game-source.json' } }), /independent fixture identity/);
  assert.throws(() => createIsolatedChapterCopyLoader({ ...options, registryId: 'approved-builtin-28805f-entities7e7-1' }), /independent fixture identity/);
  assert.deepEqual(fixture.bytes, originalBytes);
});
