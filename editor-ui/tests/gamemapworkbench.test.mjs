import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameMapWorkbench } from '../src/gamemapworkbench.js';

test('game coordinator disposes before switching, preserves canvas ports, and only enters each session once', async () => {
  const sessions = [], log = [];
  let selected = 'game-a', model = {};
  const coordinator = createGameMapWorkbench({ api() {}, work: fn => fn(), confirm: () => true,
    gameContext: { current: () => selected }, publish: value => Object.assign(model, value),
    createWorkbench: ({ gameId }) => {
      const s = { gameId, dirtyValue: false, disposed: false, entries: 0, identity: null, attached: null,
        setIdentity(value) { s.identity = value; }, dispose() { s.disposed = true; log.push('dispose:' + gameId); },
        dirty: () => s.dirtyValue, canLeave: () => !s.dirtyValue, render() {},
        actions: { attach: (...args) => { s.attached = args; }, enter: () => { s.entries++; }, formDirty: value => { s.dirtyValue = value; },
          previewPlacement: (...args) => { log.push(['preview', gameId, ...args]); return { materialId: args[0], x: args[1], y: args[2], inBounds: true }; },
          cancelPlacement: () => { log.push(['cancel', gameId]); },
          commitPlacement: () => { log.push(['commit', gameId]); return true; },
        },
      };
      sessions.push(s); log.push('create:' + gameId); return s;
    },
  });
  const canvas = {}, minimap = {}, actor = { user: { id: 'owner', role: 'author' }, version: 1 };
  coordinator.actions.attach(canvas, minimap); coordinator.setIdentity(actor);
  assert.equal(coordinator.selectedGame(), 'game-a'); assert.deepEqual(sessions[0].attached, [canvas, minimap]);
  await coordinator.actions.enter(); await coordinator.actions.enter(); assert.equal(sessions[0].entries, 1);
  coordinator.actions.formDirty(true); assert.equal(coordinator.canLeave(), false);
  coordinator.actions.formDirty(false); assert.equal(coordinator.canLeave(), true);
  selected = 'game-b'; coordinator.adoptGame(selected); await coordinator.actions.enter();
  assert.deepEqual(log, ['create:game-a', 'dispose:game-a', 'create:game-b']);
  assert.deepEqual(sessions[1].attached, [canvas, minimap]); assert.equal(sessions[1].entries, 1);
  assert.deepEqual(coordinator.actions.previewPlacement('material-1', 12, 34), { materialId: 'material-1', x: 12, y: 34, inBounds: true });
  coordinator.actions.cancelPlacement();
  assert.equal(coordinator.actions.commitPlacement(), true);
  assert.deepEqual(log.slice(-3), [['preview', 'game-b', 'material-1', 12, 34], ['cancel', 'game-b'], ['commit', 'game-b']]);
  // Same actor object rendering must not recreate or erase pending input.
  coordinator.actions.formDirty(true); coordinator.setIdentity(actor); assert.equal(sessions.length, 2); assert.equal(coordinator.dirty(), true);
  actor.version = 2; coordinator.setIdentity(actor); await coordinator.actions.enter();
  assert.equal(sessions[1].disposed, true); assert.equal(sessions[2].entries, 1);
  coordinator.setIdentity(null); assert.equal(sessions[2].disposed, true);
  assert.equal(coordinator.selectedGame(), null); assert.equal(coordinator.canAdoptGame(), false); assert.equal(model.locked, true);
  await coordinator.actions.enter(); assert.equal(sessions.length, 3);
  const callsAfterLogout = log.length;
  assert.equal(coordinator.actions.previewPlacement('material-1', 12, 34), undefined);
  assert.equal(coordinator.actions.cancelPlacement(), undefined);
  assert.equal(coordinator.actions.commitPlacement(), undefined);
  assert.equal(log.length, callsAfterLogout);
});
