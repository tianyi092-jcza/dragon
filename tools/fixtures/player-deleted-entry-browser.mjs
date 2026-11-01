// Real public load entry (`index.html?formalGame=..&mode=load`) with a controlled
// same-origin reader. The seeded local row is a store-level record with a
// synthetic snapshot: it exists only to exercise the deletion prompt and the
// purge, and is never loaded, restored or treated as a playable save.
import { publicPlayerRequest, launchPublicPlayer } from '/src/player/playerpublic.js';
import { createGameSaveStore } from '/src/core/gamesavestore.js';
const request = publicPlayerRequest(location.search);
if (!request || request.mode !== 'load') throw new Error('owned formal load entry required');
const store = createGameSaveStore({ gameId: request.gameId, databaseName: 'wolong-web', getIndexedDB: () => indexedDB });
const control = window.__entry = { request, store, ready: false };
control.seed = () => store.put({ gameId: request.gameId, releaseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', releaseOrdinal: 1,
  chapterId: request.gameId + '#c1', manifestDigest: 'b'.repeat(64), slot: 0, snapshot: { played: true, scenario_idx: 0, label: 'owned deleted-game save' } });
control.before = async () => store.list();
if ((await store.list()).length === 0) await control.seed();
control.ready = true;
launchPublicPlayer({ startApp: () => { throw new Error('a deleted game must not start the App'); }, request })
  .catch(error => { control.failure = String(error?.message ?? error); });
