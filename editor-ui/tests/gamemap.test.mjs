import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapController } from '../src/basemap.js';

const gameId = '11111111-1111-4111-8111-111111111111';
const path = `/api/games/${gameId}/copy`;
const author = { user: { id: 'owner', role: 'author', mustChangePassword: false }, version: 1 };
function fixture() {
  let model = {}, painted = null, rejectSave = false, readHook = null;
  let saved = { gameId, map: { decorations: [] }, mapEditorAssets: { seasonAtlases: {} }, cities: { city: { name: '甲' } } };
  const calls = [];
  const controller = createMapController({ gameId, work: fn => fn(), confirm: () => true,
    publish: patch => Object.assign(model, patch), paint: source => { painted = source; },
    preview: (source, edits) => ({ ...structuredClone(source), map: { decorations: structuredClone(edits) } }),
    api: async (url, body) => {
      calls.push({ url, body }); assert.equal(url, path);
      if (body) {
        if (rejectSave) throw Object.assign(new Error('COPY_PATCH'), { status: 422 });
        assert.equal(body.module, 'map'); saved.map = { decorations: structuredClone(body.patch.edits) };
        return { copyDigest: 'b'.repeat(64) };
      }
      if (readHook) return readHook();
      return { gameId, copyDigest: 'a'.repeat(64), data: structuredClone(saved) };
    },
  });
  controller.setIdentity(author);
  return { controller, calls, model: () => model, source: () => painted,
    rejectSave: value => { rejectSave = value; }, readHook: value => { readHook = value; } };
}

test('author map session uses copy endpoints, command payload and reread; never initializes a template', async () => {
  const f = fixture(), actions = f.controller.actions;
  await actions.enter(); assert.equal(f.model().gameScoped, true); assert.equal(f.model().locked, false);
  assert.equal(f.source().gameId, gameId); assert.deepEqual(f.source().editorAssets, { seasonAtlases: {} });
  assert.equal(f.model().map, undefined); assert.equal(f.model().cities, undefined);
  await actions.initialize(); assert.equal(f.calls.length, 1);
  actions.stage({ op: 'decoration-remove', memberIds: ['piece'] });
  await actions.save();
  assert.deepEqual(f.calls.map(row => row.url), [path, path, path]);
  assert.deepEqual(f.calls[1].body, { module: 'map', patch: { edits: [{ op: 'decoration-remove', memberIds: ['piece'] }] } });
  assert.equal(f.model().dirty, false); assert.equal(f.source().cities.city.name, '甲');
});

test('copy rejection preserves input; session loss clears sources and stale read cannot restore them', async () => {
  const f = fixture(), actions = f.controller.actions; await actions.enter();
  actions.stage({ op: 'base-fill', cells: [0], tile: 16, geography: 0 });
  f.rejectSave(true); await actions.save(); assert.equal(f.model().dirty, true); assert.equal(f.model().uncertain, false);
  let resolve; f.readHook(() => new Promise(done => { resolve = done; }));
  const pending = actions.reload(); f.controller.setIdentity(null);
  resolve({ gameId, copyDigest: 'c'.repeat(64), data: { gameId, map: {} } }); await pending;
  assert.equal(f.source(), null); assert.equal(f.model().loaded, false); assert.equal(f.model().locked, true);
});

test('foreign-game read is rejected before paint and a non-author cannot read', async () => {
  const f = fixture(); f.readHook(() => ({ gameId: 'other', copyDigest: 'a'.repeat(64), data: { gameId: 'other', map: {} } }));
  await f.controller.actions.enter(); assert.equal(f.model().uncertain, true); assert.equal(f.source(), null);
  f.controller.setIdentity({ user: { id: 'viewer', role: 'viewer', mustChangePassword: false }, version: 1 });
  const count = f.calls.length; await f.controller.actions.enter(); assert.equal(f.calls.length, count);
});
