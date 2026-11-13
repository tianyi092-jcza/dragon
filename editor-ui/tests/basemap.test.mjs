import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseMapController } from '../src/basemap.js';

function fixture() {
  let stored = null, model, painted, postError = null, readError = null, allow = true;
  const calls = [];
  const actor = { user: { id: 'admin', role: 'admin', mustChangePassword: false }, version: 1 };
  const fresh = () => ({ version: 1, digest: 'a'.repeat(64), template: { content: { map: { value: 0 } } } });
  const controller = createBaseMapController({
    api: async (path, body) => {
      calls.push({ path, body });
      if (body !== undefined && postError) throw postError;
      if (path.endsWith('/initialize')) stored ??= fresh();
      if (path.endsWith('/save')) { stored.version++; stored.template.content.map.value += body.edits.reduce((sum, edit) => sum + edit.amount, 0); }
      if (body === undefined && readError) throw readError;
      return { snapshot: structuredClone(stored) };
    },
    work: action => action(), publish: value => { model = value; }, paint: value => { painted = value; },
    preview: (source, edits) => ({ map: { value: source.map.value + edits.reduce((sum, edit) => sum + edit.amount, 0) } }),
    confirm: () => allow,
  });
  controller.setIdentity(actor);
  return { controller, calls, actor, model: () => model, painted: () => painted,
    postError: value => { postError = value; }, readError: value => { readError = value; }, allow: value => { allow = value; } };
}

test('actual session DTO without a root version can read, edit and preserve pending input on render', async () => {
  const f = fixture(); delete f.actor.version; f.controller.setIdentity(f.actor);
  await f.controller.actions.enter(); assert.equal(f.model().loaded, true);
  await f.controller.actions.initialize(); f.controller.actions.stage({ amount: 2 });
  f.controller.setIdentity(f.actor); assert.equal(f.model().dirty, true);
  await f.controller.actions.save(); assert.equal(f.painted().map.value, 2);
});

test('explicit initialization; display projection excludes source; stage/undo/save rereads', async () => {
  const f = fixture(), a = f.controller.actions;
  assert.equal(f.calls.length, 0);
  await a.reload(); assert.equal(f.model().exists, false);
  await a.initialize(); assert.equal(f.model().version, 1);
  a.stage({ amount: 2 }); a.stage({ amount: 3 }); a.undo();
  assert.equal(f.painted().map.value, 2);
  assert.equal(f.model().editCount, 1);
  assert.equal('map' in f.model() || 'template' in f.model() || 'digest' in f.model(), false);
  await a.save();
  assert.equal(f.model().version, 2); assert.equal(f.model().dirty, false);
  assert.equal(f.painted().map.value, 2);
  assert.equal(f.calls.at(-2).path, '/api/admin/base-map/save');
  assert.equal(f.calls.at(-1).body, undefined);
  const count = f.calls.length;
  await a.initialize(); await a.save(); assert.equal(f.calls.length, count);
});

test('known validation rejection preserves editable input; uncertain write blocks replay', async () => {
  const f = fixture(), a = f.controller.actions;
  await a.reload(); await a.initialize(); a.stage({ amount: 2 });
  f.postError(Object.assign(new Error('BASE_MAP_INVALID'), { status: 422, detail: { problems: [{ message: 'UNKNOWN_UNDERLAY: uncovered cell 2,3' }, null, { message: 7 }] } }));
  await a.save(); assert.equal(f.model().dirty, true); assert.equal(f.model().locked, false);
  assert.deepEqual(f.model().serverProblems, [{ message: 'UNKNOWN_UNDERLAY: uncovered cell 2,3' }]);
  a.stage({ amount: 1 }); assert.deepEqual(f.model().serverProblems, []);
  assert.equal(f.controller.canLeave(true), false, 'beforeunload must not open a nested confirmation');
  f.postError(new Error('lost response')); await a.save();
  assert.equal(f.model().uncertain, true); assert.equal(f.model().locked, true);
  const count = f.calls.length;
  await a.save(); assert.equal(a.stage({ amount: 3 }), false); assert.equal(f.calls.length, count);
  f.allow(false); await a.reload(); assert.equal(f.calls.length, count); assert.equal(f.controller.canLeave(), false);
  f.allow(true); f.postError(null); await a.reload(); assert.equal(f.model().dirty, false);
});

test('successful write plus failed reread is not replayed or falsely marked rolled back', async () => {
  const f = fixture(), a = f.controller.actions;
  await a.reload(); await a.initialize(); a.stage({ amount: 4 });
  f.readError(new Error('read failed')); await a.save();
  assert.equal(f.model().uncertain, true); assert.match(f.model().message, /保存已成功/);
  assert.equal(f.painted().map.value, 4);
  f.readError(null); await a.reload(); assert.equal(f.model().version, 2);
  assert.equal(f.painted().map.value, 4); assert.equal(f.controller.dirty(), false);
});

test('permission/session replacement clears private view; request bounds preserve pending inputs', async () => {
  const f = fixture(), a = f.controller.actions;
  await a.reload(); await a.initialize(); a.stage({ amount: 1 });
  assert.throws(() => a.stage({ amount: 2, text: 'x'.repeat(17000) }), /上限/);
  assert.equal(f.model().editCount, 1);
  f.controller.setIdentity({ user: { id: 'author', role: 'author', mustChangePassword: false }, version: 1 });
  assert.equal(f.painted(), null); assert.equal(f.model().exists, false);
  const count = f.calls.length; await a.reload(); await a.initialize(); await a.save();
  assert.equal(f.calls.length, count);
});

test('unstaged material form input participates in leave and reload protection', async () => {
  const f = fixture(), a = f.controller.actions;
  await a.reload(); await a.initialize();
  const revision = f.model().readRevision;
  a.formDirty(true); assert.equal(f.controller.dirty(), true); assert.equal(f.controller.canLeave(true), false);
  f.allow(false); const count = f.calls.length; await a.reload(); assert.equal(f.calls.length, count);
  f.allow(true); await a.reload(); assert.equal(f.controller.dirty(), false); assert.ok(f.model().readRevision > revision);
});

test('late response cannot restore a previous session', async () => {
  let resolve, model, painted;
  const controller = createBaseMapController({ api: () => new Promise(done => { resolve = done; }), work: action => action(),
    publish: value => { model = value; }, paint: value => { painted = value; }, preview: source => source, confirm: () => true });
  controller.setIdentity({ user: { id: 'admin', role: 'admin' }, version: 1 });
  const pending = controller.actions.reload(); controller.setIdentity(null);
  resolve({ snapshot: { version: 1, digest: 'a'.repeat(64), template: { content: { map: {} } } } });
  await pending;
  assert.equal(model.exists, false); assert.equal(painted, null);
});
