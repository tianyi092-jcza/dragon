// CHAPTER-WB: real HTTPS/auth + isolated SQLite/file bucket; no user data or SAVE.DAT.
// Default: ordinary creation/commands. CHAPTER_WB_FORMAL=1 also seeds an explicitly
// detached valid fixture and covers approval/formal loader; it is not full-copy API success.
// Add CHAPTER_WB_BLANK=1 to author that formal game entirely through real copy APIs
// instead of injecting the converted fixture. CHAPTER_WB_COPY=1 instead uses
// the independently branded source and actual full-copy API; it never claims
// that the original ambiguous twenty-chapter source succeeded.
// CHAPTER_WB_EDITOR=1 drives the real editor's five tabs against this HTTPS service.
// Add CHAPTER_WB_BROWSER=1 for real chooser clicks and native preparation in Chromium.
// CHAPTER_WB_APP=1 additionally boots the real App, saves to owned IDB, exits to
// title, then restores through the actual save chooser on a fresh page.
// CHAPTER_WB_ERA=1 adds authored BC1 year-end, real monthly callbacks, post-AD
// save/restore and one resumed strategic update (not a simulated full campaign).
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { initializeCopyChapters } from '../server/copychapters.js';
import { initializeCopyGenerals } from '../server/copygenerals.js';
import { TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { loadPlayerPack } from '../web/src/player/playerpack.js';
import { createPlayerEnvironment } from '../web/src/player/playerenvironment.js';
import { ASSET_TYPES } from '../web/src/player/runtimecontract.js';
import { prepareScenario } from '../web/src/game/scenarioassembly.js';
import { nativeMonthlyPolicyWord } from '../web/src/game/nativemonthlypolicy.js';
import { initializeNativeFactionSlots } from '../web/src/game/nativefactions.js';
import { countNativeAliveFactions } from '../web/src/game/navigation/originalvictorygate.js';

import { request } from 'node:https';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createEditorService } from '../vps/editor-server.mjs';
import { createEditorHTTPS } from './editor_local_https.mjs';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';

function liveFactions(state) {
  const detached = structuredClone(state);
  initializeNativeFactionSlots(detached);
  return countNativeAliveFactions(detached, 'CHAPTER-WB HTTP creation');
}

assert.ok(process.env.CHAPTER_WB_COPY !== '1' || process.env.CHAPTER_WB_FORMAL === '1' && process.env.CHAPTER_WB_BLANK !== '1', 'independent full-copy lane requires FORMAL and excludes BLANK');
const copyFixture = process.env.CHAPTER_WB_COPY === '1' ? (await import('./fixtures/chapter-copy-source.mjs')).buildChapterCopySourceFixture() : null;
assert.ok(process.env.CHAPTER_WB_BLANK !== '1' || process.env.CHAPTER_WB_FORMAL === '1', 'blank publication lane requires CHAPTER_WB_FORMAL=1');
assert.ok(process.env.CHAPTER_WB_RETIREMENT !== '1' || process.env.CHAPTER_WB_FORMAL === '1', 'retirement publication lane requires CHAPTER_WB_FORMAL=1');
assert.ok(process.env.CHAPTER_WB_ERA !== '1' || process.env.CHAPTER_WB_APP === '1', 'era lane requires CHAPTER_WB_APP=1');
assert.ok(process.env.CHAPTER_WB_APP !== '1' || process.env.CHAPTER_WB_BROWSER === '1', 'App lane requires CHAPTER_WB_BROWSER=1');
assert.ok(process.env.CHAPTER_WB_BROWSER !== '1' || process.env.CHAPTER_WB_FORMAL === '1', 'browser lane requires CHAPTER_WB_FORMAL=1');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const port = Number(process.env.EDITOR_TEST_PORT ?? 18789);
const origin = `https://127.0.0.1:${port}`;
const own = mkdtempSync(join(tmpdir(), 'dragon-chapter-http-'));
const initial = randomBytes(24).toString('hex') + 'Aa1!', password = randomBytes(24).toString('hex') + 'Aa1!';
const storage = openStorage(join(own, 'authority.sqlite'));
const bucket = new FileBucket({ root: join(own, 'objects') });
const source = await stageInstalledEditorSource({ get: key => bucket.get(key), put: (key, bytes) => bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) }) }, copyFixture?.isolatedSource);
const config = JSON.parse(readFileSync('server/wrangler.jsonc', 'utf8'));
const service = createEditorService({ storage, bucket, isolatedCopySource: copyFixture?.isolatedSource, env: { ...config.vars, EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'), EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source) } });
const transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
function call(path, body, session, extra = {}) {
  const headers = { Origin: origin, ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...extra };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  return new Promise((done, reject) => {
    // CPU-heavy fixture conversion can outlive the server's idle socket TTL;
    // each test call owns a fresh TLS connection, with no implicit POST retry.
    const req = request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false, agent: false }, response => {
      const parts = [];
      response.on('data', part => parts.push(part)); response.on('error', reject);
      response.on('end', () => done({ status: response.statusCode, cookie: response.headers['set-cookie']?.[0]?.split(';')[0], data: JSON.parse(Buffer.concat(parts).toString('utf8')) }));
    });
    req.setTimeout(240000, () => req.destroy(new Error('HTTP timeout: ' + path)));
    req.on('error', cause => reject(new Error(`HTTP ${path}: ${cause.message}`, { cause }))); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
test(copyFixture ? 'CHAPTER-WB authenticated chapters and independent full-copy publication' : 'CHAPTER-WB authenticated ordinary creation, independent chapters, atomic refusal and full twenty-chapter copy', async () => {
  try {
    const login = await call('/api/auth/login', { account: 'tianyi', password: initial });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: login.cookie, csrf: login.data.csrf });
    assert.equal(changed.status, 200);
    const admin = { cookie: changed.cookie, csrf: changed.data.csrf };
    assert.equal((await call('/api/admin/accounts', { account: 'chapter_other' }, admin)).status, 200);
    const otherLogin = await call('/api/auth/login', { account: 'chapter_other', password: initial });
    assert.equal(otherLogin.status, 200);
    const otherChanged = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: otherLogin.cookie, csrf: otherLogin.data.csrf });
    assert.equal(otherChanged.status, 200);
    const otherActor = { cookie: otherChanged.cookie, csrf: otherChanged.data.csrf };
    assert.equal((await call('/api/admin/source/install', {}, admin)).status, 200);
    const installed = await call('/api/admin/source', undefined, admin);
    assert.equal((await call('/api/admin/base-map/initialize', {}, admin)).status, 200);
    const templateBefore = (await call('/api/admin/base-map', undefined, admin)).data;
    async function create(name) {
      const key = randomUUID();
      assert.equal((await call('/api/games', { name, introduction: 'CHAPTER-WB isolated HTTP' }, admin, { 'Idempotency-Key': key })).status, 202);
      const result = await call(`/api/games/create/${key}/run`, {}, admin, { 'If-Match': '"1"' });
      assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data.gameId;
    }
    const gameId = await create('章測甲'), otherId = await create('章測乙');
    const path = `/api/games/${gameId}/copy`, read = async () => (await call(path, undefined, admin)).data;
    let before = await read();
    const otherBefore = (await call(`/api/games/${otherId}/copy`, undefined, admin)).data;
    assert.deepEqual(before.data.generals, {});
    for (const id of before.data.chapterOrder) {
      assert.deepEqual(before.data.chapters[id].state.factions, [], 'ordinary creation invents no faction');
      assert.equal(liveFactions(before.data.chapters[id].state), 0, 'undeclared native slots must not import original forces');
      assert.ok(before.data.chapters[id].state.generals.every(general => !general.generalId), 'ordinary creation assigns no library person');
      assert.equal((await call(path, { module: 'chapters', patch: { delete: { chapterId: id } } }, admin)).status, 200);
    }
    before = await read(); assert.deepEqual(before.data.chapterOrder, []);
    assert.equal(Object.keys(before.data.cities).length, 192);
    const createBody = { module: 'chapters', patch: { create: { number: '甲', name: '獨立甲', start: { era: 'bc', year: 1, month: 12, day: 31 } } } };
    assert.equal((await call(path, createBody)).status, 401);
    assert.equal((await call(path, createBody, admin, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal((await call(path, undefined, otherActor)).status, 404);
    assert.equal((await call(path, createBody, otherActor)).status, 404);
    assert.deepEqual(await read(), before, 'authentication and ownership refusals do not change content/digest/time');
    assert.equal((await call(path, createBody, admin)).status, 200);
    const first = await read(), firstId = first.data.chapterOrder[0];
    assert.equal(first.data.chapters[firstId].state.start.era, 'bc');
    const secondBody = structuredClone(createBody); secondBody.patch.create.number = '乙'; secondBody.patch.create.name = '獨立乙';
    assert.equal((await call(path, secondBody, admin)).status, 200);
    let two = await read();
    const secondId = two.data.chapterOrder[1];
    const imported = await call(path, { module: 'generals', patch: { import: [{ name: '章測人物', ability: { force: 1, lead: 2, politics: 3, siege: 4, field: 5, naval: 6 }, suicideOnCapture: true }] } }, admin);
    assert.equal(imported.status, 200, JSON.stringify(imported.data));
    const libraryOnly = await read(), generalId = Object.keys(libraryOnly.data.generals)[0];
    assert.ok(generalId.startsWith(gameId + '#general-'));
    assert.deepEqual(libraryOnly.data.chapters, two.data.chapters, 'importing the master never assigns a chapter slot');
    const settings = (chapterId, active, appearMonths) => ({ op: 'general-settings', chapterId, generalId, values: { active, appearMonths, joinFaction: null } });
    const firstSettings = { module: 'chapters', patch: { edits: [settings(firstId, false, 12)] } };
    assert.equal((await call(path, firstSettings, otherActor)).status, 404);
    assert.equal((await call(path, firstSettings, admin, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.deepEqual(await read(), libraryOnly);
    assert.equal((await call(path, firstSettings, admin)).status, 200);
    const firstConfigured = await read(), firstGeneral = firstConfigured.data.chapters[firstId].state.generals[0];
    assert.equal(firstGeneral.generalId, generalId); assert.equal(firstGeneral.active, false); assert.equal(firstGeneral.appear_months, 12);
    assert.equal(firstGeneral.attr, 0x10); assert.equal(firstGeneral.faction, null);
    const firstExpected = structuredClone(libraryOnly.data); firstExpected.chapters[firstId].state.generals[0] = firstGeneral;
    assert.deepEqual(firstConfigured.data, firstExpected, 'first configuration changes exactly one chapter slot');
    assert.equal((await call(path, { module: 'chapters', patch: { edits: [settings(secondId, true, 0)] } }, admin)).status, 200);
    two = await read();
    assert.deepEqual(two.data.chapters[firstId], firstConfigured.data.chapters[firstId]);
    const secondGeneral = two.data.chapters[secondId].state.generals[0];
    assert.equal(secondGeneral.generalId, generalId); assert.equal(secondGeneral.active, true); assert.equal(secondGeneral.appear_months, 0);
    assert.deepEqual(two.data.generals, libraryOnly.data.generals);
    const badSettings = await call(path, { module: 'chapters', patch: { edits: [settings(firstId, true, 0), { ...settings(secondId, false, 9), generalId: otherId + '#general-' + 'f'.repeat(64) }] } }, admin);
    assert.equal(badSettings.status, 422); assert.deepEqual(await read(), two, 'invalid person after a valid edit rolls back content, digest and time');
    const establish = await call(path, { module: 'chapters', patch: { edits: [settings(firstId, true, 0), { op: 'create-faction', chapterId: firstId, monarchIdx: 0, cityIdx: 0 }] } }, admin);
    assert.equal(establish.status, 200, JSON.stringify(establish.data));
    const established = await read(), firstFaction = established.data.chapters[firstId].state.factions[0];
    assert.equal(firstFaction.monarch_idx, 0); assert.equal(firstFaction.capital, 0);
    assert.equal(firstFaction.number, 1); assert.equal(firstFaction.factionId, `${firstId}#faction-1`);
    assert.equal(firstFaction.playerOpening.trust, 255); assert.equal(firstFaction.money, 0);
    assert.equal(established.data.chapters[firstId].state.cities[0].faction, 0);
    assert.equal(established.data.chapters[firstId].state.generals[0].is_monarch, true);
    assert.deepEqual(established.data.chapters[secondId], two.data.chapters[secondId], 'same library person stays an ordinary free general in the other chapter');
    assert.deepEqual(established.data.generals, two.data.generals);
    two = established;
    const incompleteNative = await call(path + '/validate', {}, admin);
    assert.equal(incompleteNative.status, 200);
    assert.equal(incompleteNative.data.state, 'failed');
    assert.equal(incompleteNative.data.ticket, null);
    assert.ok(!incompleteNative.data.problems.some(problem => problem.chapterId === firstId && problem.code === 'CHAPTER_NATIVE_INITIALIZATION'), 'the initialized first chapter no longer fails on missing diplomacy/events');
    assert.equal(two.data.chapters[firstId].state.nativeDiplomacyRaw.length, 1152);
    assert.equal(two.data.chapters[firstId].state.nativeStrategicEventRaw.length, 2048);
    assert.deepEqual(await read(), two, 'publication inspection never changes author input');
    const rename = (chapterId, number, name) => ({ op: 'chapter-labels', chapterId, number, name });
    const invalid = await call(path, { module: 'chapters', patch: { edits: [rename(firstId, '丙', '將回滾'), rename(secondId, '丙', '重複')] } }, admin);
    assert.equal(invalid.status, 422, JSON.stringify(invalid.data));
    assert.deepEqual(await read(), two, 'failed second edit writes no prefix');
    const foreign = await call(path, { module: 'chapters', patch: { edits: [rename(firstId, '丙', '將回滾'), rename(otherBefore.data.chapterOrder[0], '丁', '跨遊戲')] } }, admin);
    assert.equal(foreign.status, 422);
    assert.deepEqual(await read(), two, 'a foreign chapter identity cannot be written in this game');
    const morePeople = await call(path, { module: 'generals', patch: { import: ['乙將', '丙將'].map(name => ({ name,
      ability: { force: 1, lead: 2, politics: 3, siege: 4, field: 5, naval: 6 }, suicideOnCapture: false })) } }, admin);
    assert.equal(morePeople.status, 200, JSON.stringify(morePeople.data));
    const roster = (await read()).data.generals;
    const secondPerson = Object.keys(roster).find(id => roster[id].name === '乙將');
    const thirdPerson = Object.keys(roster).find(id => roster[id].name === '丙將');
    assert.ok(secondPerson && thirdPerson);
    const configure = (chapterId, id, factionId = null) => ({ op: 'general-settings', chapterId, generalId: id,
      values: { active: true, appearMonths: 0, joinFaction: null, factionId } });
    const twoByTwo = await call(path, { module: 'chapters', patch: { edits: [
      configure(firstId, secondPerson), { op: 'create-faction', chapterId: firstId, monarchIdx: 1, cityIdx: 1 },
      configure(secondId, secondPerson), { op: 'create-faction', chapterId: secondId, monarchIdx: 1, cityIdx: 1 },
      configure(secondId, thirdPerson), { op: 'create-faction', chapterId: secondId, monarchIdx: 2, cityIdx: 0 },
      configure(secondId, generalId, 0),
    ] } }, admin);
    assert.equal(twoByTwo.status, 200, JSON.stringify(twoByTwo.data));
    two = await read();
    assert.deepEqual([firstId, secondId].map(id => two.data.chapters[id].state.factions.length), [2, 2]);
    assert.deepEqual([firstId, secondId].map(id => liveFactions(two.data.chapters[id].state)), [2, 2]);
    assert.equal(two.data.chapters[firstId].state.generals[0].is_monarch, true);
    assert.equal(two.data.chapters[secondId].state.generals[0].attr & 0x40, 0);
    assert.equal(two.data.chapters[secondId].state.generals[0].faction, 0);
    assert.equal(two.data.chapters[firstId].state.cities[0].faction, 0);
    assert.equal(two.data.chapters[secondId].state.cities[0].faction, 1, 'the same master city has independent chapter ownership');
    if (process.env.CHAPTER_WB_EDITOR === '1') {
      const { verifyChapterEditorHTTPBrowser } = await import('./fixtures/chapter-editor-http-browser.mjs');
      await verifyChapterEditorHTTPBrowser({ origin, cookie: admin.cookie, gameId, source: two.data, read });
      two = await read();
    }
    const blankValidation = await call(path + '/validate', {}, admin);
    assert.equal(blankValidation.status, 200);
    assert.equal(blankValidation.data.state, 'passed', JSON.stringify(blankValidation.data));
    assert.ok(blankValidation.data.ticket, 'real two-chapter author-created game obtains a publication ticket');
    two = await read();
    const diplomacyBody = { module: 'chapters', patch: { edits: [{ op: 'diplomacy', chapterId: firstId, actorIdx: 0, targetIdx: 1, relation: 'good' }] } };
    assert.equal((await call(path, diplomacyBody, otherActor)).status, 404);
    assert.equal((await call(path, diplomacyBody, admin, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.deepEqual(await read(), two, 'unauthorized matrix edits leave the source untouched');
    const expectedDiplomacy = structuredClone(two.data), expectedState = expectedDiplomacy.chapters[firstId].state;
    expectedState.nativeDiplomacyRaw = expectedState.nativeDiplomacyRaw.slice(0, 2) + 'cc' + expectedState.nativeDiplomacyRaw.slice(4);
    expectedState.diplomacy[0][1] = 204;
    const editedDiplomacy = await call(path, diplomacyBody, admin);
    assert.equal(editedDiplomacy.status, 200, JSON.stringify(editedDiplomacy.data));
    two = await read();
    assert.deepEqual(two.data, expectedDiplomacy, 'only the selected direction changes; reverse, other chapter and master data remain exact');
    const diagonal = await call(path, { module: 'chapters', patch: { edits: [rename(secondId, '乙', '不能保存'),
      { op: 'diplomacy', chapterId: firstId, actorIdx: 0, targetIdx: 0, relation: 'good' }] } }, admin);
    assert.equal(diagonal.status, 422);
    assert.deepEqual(await read(), two, 'invalid matrix target rolls back the earlier chapter rename');
    const retireBody = { module: 'chapters', patch: { edits: [{ op: 'disband-faction', chapterId: firstId, factionIdx: 0, confirm: true }] } };
    assert.equal((await call(path, retireBody, otherActor)).status, 404);
    assert.equal((await call(path, retireBody, admin, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.deepEqual(await read(), two, 'unauthorized retirement changes nothing');
    const retiredResponse = await call(path, retireBody, admin);
    assert.equal(retiredResponse.status, 200, JSON.stringify(retiredResponse.data));
    const retiredCopy = await read(), retiredChapter = retiredCopy.data.chapters[firstId].state;
    assert.equal(retiredChapter.factions.length, 2); assert.equal(retiredChapter.factions[0].retired, true);
    assert.equal(liveFactions(retiredChapter), 1);
    assert.deepEqual(retiredChapter.factions[1], two.data.chapters[firstId].state.factions[1]);
    assert.equal(retiredChapter.factions[0].factionId, firstFaction.factionId);
    assert.equal(retiredChapter.factions[0].monarch_idx, 255); assert.equal(retiredChapter.factions[0].capital, null);
    assert.equal(retiredChapter.generals[0].faction, null); assert.equal(retiredChapter.generals[0].is_monarch, false);
    assert.equal(retiredChapter.cities[0].faction, null);
    assert.deepEqual(retiredCopy.data.chapters[secondId], two.data.chapters[secondId]);
    assert.deepEqual(retiredCopy.data.generals, two.data.generals); assert.deepEqual(retiredCopy.data.cities, two.data.cities);
    const staleTarget = await call(path, { module: 'chapters', patch: { edits: [rename(secondId, '乙', '不能保存'),
      { op: 'general-arrival', chapterId: firstId, generalIdx: 0, values: { appearMonths: 0, joinFaction: 0 } }] } }, admin);
    assert.equal(staleTarget.status, 422); assert.deepEqual(await read(), retiredCopy, 'retired target rejection rolls back the earlier chapter edit');
    const recreate = await call(path, { module: 'chapters', patch: { edits: [{ op: 'create-faction', chapterId: firstId, monarchIdx: 0, cityIdx: 0 }] } }, admin);
    assert.equal(recreate.status, 200, JSON.stringify(recreate.data));
    two = await read();
    const recreated = two.data.chapters[firstId].state.factions;
    assert.equal(recreated.length, 3); assert.deepEqual(recreated[0], retiredChapter.factions[0]);
    assert.equal(liveFactions(two.data.chapters[firstId].state), 2);
    assert.deepEqual(recreated[1], retiredChapter.factions[1]);
    assert.equal(recreated[2].idx, 2); assert.equal(recreated[2].number, 3);
    assert.equal(recreated[2].factionId, `${firstId}#faction-3`);
    assert.equal(two.data.chapters[firstId].nextFactionNumber, 4);
    assert.deepEqual(two.data.chapters[secondId], retiredCopy.data.chapters[secondId]);
    assert.deepEqual(two.data.generals, retiredCopy.data.generals); assert.deepEqual(two.data.cities, retiredCopy.data.cities);
    assert.equal((await call(path, { module: 'chapters', patch: { delete: { chapterId: firstId } } }, admin)).status, 200);
    const after = await read(), expected = structuredClone(two.data);
    delete expected.chapters[firstId]; expected.chapterOrder = [secondId];
    assert.deepEqual(after.data, expected, 'delete only affects selected chapter and order');
    assert.deepEqual((await call(`/api/games/${otherId}/copy`, undefined, admin)).data, otherBefore);
    assert.equal((await call(path, { module: 'chapters', patch: { delete: { chapterId: secondId } } }, admin)).status, 200);
    const zero = await read(); assert.deepEqual(zero.data.chapterOrder, []);
    const validation = await call(path + '/validate', {}, admin);
    assert.equal(validation.status, 200); assert.equal(validation.data.state, 'failed');
    assert.ok(JSON.stringify(validation.data).includes('CHAPTER_EMPTY')); assert.ok(!validation.data.ticket);
    const rowsBefore = storage.sql.exec('SELECT COUNT(*) AS n FROM game_copies').toArray()[0].n;
    const key = randomUUID();
    assert.equal((await call('/api/admin/copies', { registryId: installed.data.definition.registryId, name: copyFixture ? '獨立完整副本' : '完整原源副本', introduction: '' }, admin, { 'Idempotency-Key': key })).status, 202);
    const refused = await call(`/api/admin/copies/${key}/run`, {}, admin, { 'If-Match': '"1"' });
    let copiedId = null;
    if (copyFixture) {
      assert.equal(refused.status, 200, JSON.stringify(refused.data));
      copiedId = refused.data.gameId;
      assert.equal(typeof copiedId, 'string');
      const copied = (await call(`/api/games/${copiedId}/copy`, undefined, admin)).data.data;
      assert.equal(copied.chapterOrder.length, copyFixture.chapterIds.length, 'full copy keeps every independently registered fixture chapter');
      assert.deepEqual(refused.data.chapterConversion, copied.chapterConversion, 'committed response exposes the exact detached conversion receipt');
      assert.deepEqual(copied.chapterConversion.duplicates.map(row => [row.keptFactionIdx, row.discardedFactionIdx]), [[2, 11], [10, 15], [1, 10], [2, 3]]);
      for (const row of copied.chapterConversion.duplicates) {
        const state = copied.chapters[row.chapterId].state;
        assert.equal(state.factions[row.discardedFactionIdx].retired, true);
        assert.equal(state.factions[row.keptFactionIdx].retired, undefined);
        if (row.reason !== 'shared-capital') assert.equal(state.factions[row.keptFactionIdx].monarch_idx, row.monarchIdx);
        else assert.equal(state.cities.find(city => city.idx === row.cityIdx).faction, row.keptFactionIdx);
      }
      const queried = await call(`/api/admin/copies/${key}`, undefined, admin);
      assert.equal(queried.status, 200);
      assert.deepEqual(queried.data.chapterConversion, copied.chapterConversion, 'original-key recovery preserves conversion details');
      const committedReceipt = storage.sql.exec('SELECT result_json FROM copy_requests WHERE game_id=?', copiedId).toArray()[0].result_json;
      for (const changed of [
        { ...JSON.parse(committedReceipt), sourceDigest: '0'.repeat(64) },
        { ...JSON.parse(committedReceipt), unexpected: true },
        { ...JSON.parse(committedReceipt), chapterConversion: { version: 2, labels: [], capitals: [] } },
      ]) {
        storage.sql.exec('UPDATE copy_requests SET result_json=? WHERE game_id=?', JSON.stringify(changed), copiedId);
        const corrupt = await call(`/api/admin/copies/${key}`, undefined, admin);
        assert.equal(corrupt.status, 503); assert.equal(corrupt.data.error, 'COPY_RECEIPT_CORRUPT');
      }
      const legacyReceipt = JSON.parse(committedReceipt); delete legacyReceipt.chapterConversion;
      storage.sql.exec('UPDATE copy_requests SET result_json=? WHERE game_id=?', JSON.stringify(legacyReceipt), copiedId);
      assert.deepEqual((await call(`/api/admin/copies/${key}`, undefined, admin)).data, legacyReceipt, 'legacy four-field receipt keeps its original identity contract');
      storage.sql.exec('UPDATE copy_requests SET result_json=? WHERE game_id=?', committedReceipt, copiedId);
      const provenance = storage.sql.exec('SELECT registry_id FROM copy_origins WHERE game_id=?', copiedId).toArray()[0];
      assert.equal(provenance.registry_id, copyFixture.registryId);
      assert.notEqual(provenance.registry_id, 'approved-builtin-28805f-entities7e7-1');
    } else {
      assert.equal(refused.status, 200, JSON.stringify(refused.data));
      const copied = (await call(`/api/games/${refused.data.gameId}/copy`, undefined, admin)).data.data;
      assert.equal(copied.chapterOrder.length, 20);
      assert.deepEqual(copied.chapterConversion.duplicates.map(row => [row.keptFactionIdx, row.discardedFactionIdx]), [[2, 11], [10, 15], [1, 10], [2, 3]]);
      assert.deepEqual(refused.data.chapterConversion, copied.chapterConversion);
      const queried = await call(`/api/admin/copies/${key}`, undefined, admin);
      assert.equal(queried.status, 200); assert.deepEqual(queried.data, refused.data);
    }
    assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM game_copies').toArray()[0].n, rowsBefore + 1);
    assert.deepEqual((await call('/api/admin/source', undefined, admin)).data, installed.data, 'installed original is unchanged');
    assert.deepEqual((await call('/api/admin/base-map', undefined, admin)).data, templateBefore, 'system template is unchanged');
    assert.deepEqual((await read()).data, zero.data);
    if (process.env.CHAPTER_WB_FORMAL === '1') {
      // The BLANK lane authors a separate ordinary game entirely via API.
      // COPY reuses the actual complete copy of the independently registered
      // source. Otherwise the legacy formal lane injects a converted fixture.
      // Without COPY, the separate original-source copy above is still checked;
      // BLANK/legacy formal fixtures below remain separate games.
      const formalId = copiedId ?? await create('章正式測試'), formalPath = `/api/games/${formalId}/copy`;
      const container = (await call(formalPath, undefined, admin)).data.data;
      let converted;
      if (copyFixture) {
        converted = container; // Actual committed HTTP full copy; no SQL source injection.
        assert.equal(converted.chapterOrder.length, copyFixture.chapterIds.length);
      } else if (process.env.CHAPTER_WB_BLANK === '1') {
        const post = async body => {
          const response = await call(formalPath, body, admin);
          assert.equal(response.status, 200, JSON.stringify(response.data));
        };
        for (const chapterId of container.chapterOrder)
          await post({ module: 'chapters', patch: { delete: { chapterId } } });
        for (const name of ['新甲', '新乙'])
          await post({ module: 'chapters', patch: { create: { number: name, name, start: { era: 'ad', year: 1, month: 1, day: 1 } } } });
        const names = ['甲主', '乙主', '備用主', '晚將'];
        await post({ module: 'generals', patch: { import: names.map(name => ({ name })) } });
        const authored = (await call(formalPath, undefined, admin)).data.data;
        const generalIds = names.map(name => Object.keys(authored.generals).find(id => authored.generals[id].name === name));
        assert.ok(generalIds.every(Boolean));
        for (const chapterId of authored.chapterOrder) {
          const count = process.env.CHAPTER_WB_RETIREMENT === '1' ? 3 : 2;
          const edits = generalIds.map((generalId, index) => ({ op: 'general-settings', chapterId, generalId,
            values: { active: index < count, appearMonths: 0, joinFaction: null, factionId: null } }));
          for (let slot = 0; slot < count; slot++) {
            edits.push({ op: 'create-faction', chapterId, monarchIdx: slot, cityIdx: slot });
            // Explicit author funds isolate the save/month-boundary test from
            // unrelated zero-treasury crisis. The creation default stays zero.
            edits.push({ op: 'resources-people', chapterId, factionIdx: slot, values: { money: 10000 } });
          }
          await post({ module: 'chapters', patch: { edits } });
        }
        converted = (await call(formalPath, undefined, admin)).data.data;
        assert.equal(converted.chapterOrder.length, 2);
        assert.equal(Object.keys(converted.generals).length, 4);
      } else {
        const ownerId = storage.sql.exec('SELECT owner_id FROM content_games WHERE game_id=?', formalId).toArray()[0].owner_id;
        const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ allocateEntityId: () => 'formal-' + randomUUID() }) });
        const captured = await profile.capture({ gameId: formalId, ownerId });
        const originalText = JSON.stringify(captured.game), detached = structuredClone(captured.game);
        detached.chapterOrder = detached.chapterOrder.filter(id => {
          const capitals = detached.chapters[id].state.factions.map(faction => faction.capital);
          return new Set(capitals).size === capitals.length;
        }).slice(0, 2);
        assert.equal(detached.chapterOrder.length, 2);
        for (const id of Object.keys(detached.chapters)) if (!detached.chapterOrder.includes(id)) delete detached.chapters[id];
        detached.metadata = container.metadata;
        converted = initializeCopyChapters(initializeCopyGenerals(detached));
        assert.equal(JSON.stringify(captured.game), originalText);
        const text = JSON.stringify(converted), digest = sha(text);
        storage.sql.exec('UPDATE game_copies SET data_json=?,copy_digest=? WHERE game_id=?', text, digest, formalId);
      }
      for (const [index, trust] of [47, 201].entries()) {
        const change = await call(formalPath, { module: 'chapters', patch: { edits: [{ op: 'player-opening', chapterId: converted.chapterOrder[0], factionIdx: index,
          values: { trust, tax: index ? 24 : 12, conscription: index ? [70, 80, 90] : [127, 19, 9], nextConscription: [29, 39, 49] } }] } }, admin);
        assert.equal(change.status, 200, JSON.stringify(change.data));
      }
      let retiredSlot = null;
      if (process.env.CHAPTER_WB_RETIREMENT === '1') {
        const chapterId = converted.chapterOrder[0], beforeRetirement = (await call(formalPath, undefined, admin)).data.data;
        retiredSlot = beforeRetirement.chapters[chapterId].state.factions.at(-1).idx;
        assert.ok(retiredSlot > 1, 'both selected player factions must survive');
        const response = await call(formalPath, { module: 'chapters', patch: { edits: [{ op: 'disband-faction', chapterId, factionIdx: retiredSlot, confirm: true }] } }, admin);
        assert.equal(response.status, 200, JSON.stringify(response.data));
        const afterRetirement = (await call(formalPath, undefined, admin)).data.data;
        assert.equal(afterRetirement.chapters[chapterId].state.factions[retiredSlot].retired, true);
        assert.deepEqual(afterRetirement.chapters[converted.chapterOrder[1]], beforeRetirement.chapters[converted.chapterOrder[1]]);
        assert.deepEqual(afterRetirement.generals, beforeRetirement.generals); assert.deepEqual(afterRetirement.cities, beforeRetirement.cities);
      }
      let eraGeneralIdx = null;
      if (process.env.CHAPTER_WB_ERA === '1') {
        const chapterId = converted.chapterOrder[0];
        const general = converted.chapters[chapterId].state.generals.find(row => row.idx < 127 && row.faction === null && row.status === 0 && row.captive_flag === 255);
        assert.ok(general); eraGeneralIdx = general.idx;
        const dated = await call(formalPath, { module: 'chapters', patch: {
          setStart: { [chapterId]: { era: 'bc', year: 1, month: 12, day: 31 } },
          edits: [{ op: 'general-arrival', chapterId, generalIdx: eraGeneralIdx, values: { active: true, appearMonths: 3, joinFaction: null } }],
        } }, admin);
        assert.equal(dated.status, 200, JSON.stringify(dated.data));
      }
      const checked = await call(formalPath + '/validate', {}, admin);
      assert.equal(checked.status, 200); assert.equal(checked.data.state, 'passed', JSON.stringify(checked.data));
      const submitted = await call(formalPath + '/submission', { ticket: checked.data.ticket, description: 'CHAPTER-WB isolated converted fixture' }, admin);
      assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
      const provenance = storage.sql.exec('SELECT * FROM copy_origins WHERE game_id=?', formalId).toArray()[0];
      assert.equal(provenance.profile_revision, copyFixture ? 'fixed-copy-resources-1' : 'fixed-template-authoring-1', 'copy origin retains its actual creation mode');
      const submittedSlot = storage.sql.exec('SELECT * FROM publish_slots WHERE game_id=?', formalId).toArray()[0];
      for (const field of ['profile_revision', 'registry_id', 'definition_digest']) {
        storage.sql.exec(`UPDATE copy_origins SET ${field}=? WHERE game_id=?`, 'invalid-isolated-provenance', formalId);
        const refusedOrigin = await call(formalPath + '/approve', {}, admin);
        assert.equal(refusedOrigin.status, 409, JSON.stringify(refusedOrigin.data));
        assert.equal(refusedOrigin.data.error, 'PLAY_SOURCE_CHANGED');
        assert.equal(storage.sql.exec('SELECT game_id FROM published_packs WHERE game_id=?', formalId).toArray().length, 0);
        assert.deepEqual(storage.sql.exec('SELECT * FROM publish_slots WHERE game_id=?', formalId).toArray()[0], submittedSlot);
        storage.sql.exec(`UPDATE copy_origins SET ${field}=? WHERE game_id=?`, provenance[field], formalId);
      }
      const approved = await call(formalPath + '/approve', {}, admin);
      assert.equal(approved.status, 200, JSON.stringify(approved.data));
      assert.equal(approved.data.state, 'approved');
      const packRow = storage.sql.exec('SELECT * FROM published_packs WHERE game_id=?', formalId).toArray()[0];
      assert.ok(packRow);
      const manifest = JSON.parse(packRow.manifest_json), chapterId = converted.chapterOrder[0];
      assert.deepEqual(manifest.chapters, converted.chapterOrder);
      const declarations = new Map([...manifest.assets, ...manifest.minimapAssets, ...manifest.portraits].map(entry => [entry.assetId, entry]));
      const result = (bytes, contentType) => ({ bytes: new Uint8Array(bytes), contentType, sha256: sha(bytes) });
      const selection = { gameId: formalId, releaseId: approved.data.releaseId, ordinal: approved.data.ordinal,
        revision: packRow.revision, sourceDigest: packRow.source_digest, chapters: manifest.chapters,
        name: converted.metadata.name, publishedAt: packRow.updated_at };
      const readRole = async role => {
          if (role === 'manifest') return result(Buffer.from(packRow.manifest_json), 'application/json');
          if (role.startsWith('chapter:')) {
            const id = role.slice(8); assert.ok(manifest.chapters.includes(id));
            return result(Buffer.from(storage.sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?', formalId, id).toArray()[0].state_json), 'application/json');
          }
          assert.ok(role.startsWith('asset:'));
          const assetId = role.slice(6), declaration = declarations.get(assetId); assert.ok(declaration);
          if (declaration.role === 'game-portrait') {
            assert.match(declaration.url, /^kao\/(?:0|[1-9]\d{0,2})\.png$/);
            return result(readFileSync('web/' + declaration.url), 'image/png');
          }
          const row = storage.sql.exec('SELECT bytes FROM published_pack_assets WHERE game_id=? AND asset_id=?', formalId, assetId).toArray()[0];
          assert.ok(row); return result(Buffer.from(row.bytes), ASSET_TYPES[assetId]);
      };
      const readStatic = async path => {
        assert.ok([...Object.values(manifest.visualAssets.seasons), ...Object.values(manifest.visualAssets.seasonAtlases)].some(entry => entry.path === path));
        return result(readFileSync('web/' + path), 'image/png');
      };
      const { loadPlayerChapters } = await import('../web/src/player/playerchapters.js');
      const preview = await loadPlayerChapters({ selection, reader: {
        status: async () => ({ ...selection, listed: true }),
        admit: async ({ chapterId: previewId }) => {
          let state = 'active';
          return { identity: { ...selection, chapterId: previewId, manifestDigest: sha(packRow.manifest_json) },
            state: () => state, close: () => { state = 'closed'; }, read: readRole };
        },
      } });
      assert.deepEqual(preview.chapters.map(row => row.name), converted.chapterOrder.map(id => converted.chapters[id].name), 'formal chooser sees current author chapter labels');
      const pack = await loadPlayerPack({ compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024,
        session: { identity: { ...selection, chapterId, manifestDigest: sha(packRow.manifest_json) },
          state: () => 'active', read: readRole }, readStatic });
      try {
        if (retiredSlot !== null) assert.throws(() => createPlayerEnvironment(pack, { playerFaction: retiredSlot }), /matching formal pack and explicit player faction/);
        for (const [playerFaction, trust] of [47, 201].entries()) {
          const environment = createPlayerEnvironment(pack, { playerFaction });
          const prepared = await prepareScenario({ raw: environment.raw, idx: 0, mode: 'fresh', content: environment.content, world: environment.world });
          assert.equal(prepared.scenario.player_faction, playerFaction);
          assert.equal(prepared.scenario.trust, trust);
          assert.equal(prepared.scenario.tax, playerFaction ? 24 : 12);
          assert.equal(nativeMonthlyPolicyWord(prepared.scenario, 2, 'formal selected opening'), playerFaction ? 7 : 12);
          assert.deepEqual(prepared.scenario.next_conscription, [20, 30, 40]);
          if (retiredSlot !== null) {
            const retired = prepared.scenario.factions[retiredSlot];
            assert.equal(retired.retired, true); assert.equal(retired.active, false); assert.equal(retired.monarch_idx, 255);
            assert.equal(prepared.scenario.nativeFactionSlots.records[retiredSlot], retired);
          }
        }
      } finally { pack.close(); }
      if (process.env.CHAPTER_WB_BROWSER === '1') {
        const { verifyPublishedChapterChoice } = await import('./fixtures/chapter-published-choice-browser.mjs');
        const choices = await verifyPublishedChapterChoice({ selection, manifestDigest: sha(packRow.manifest_json), readRole, readStatic, app: process.env.CHAPTER_WB_APP === '1', eraGeneralIdx });
        console.log('PASS real browser chapter/faction clicks and native preparation over formal bytes:', JSON.stringify(choices));
      }
      const beforeDelete = (await call(formalPath, undefined, admin)).data.data;
      const frozenChapters = storage.sql.exec('SELECT * FROM published_pack_chapters WHERE game_id=? ORDER BY chapter_id', formalId).toArray();
      const deleted = await call(formalPath, { module: 'chapters', patch: { delete: { chapterId } } }, admin);
      assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
      const expectedCopy = structuredClone(beforeDelete);
      delete expectedCopy.chapters[chapterId]; expectedCopy.chapterOrder = expectedCopy.chapterOrder.filter(id => id !== chapterId);
      assert.deepEqual((await call(formalPath, undefined, admin)).data.data, expectedCopy);
      assert.deepEqual(storage.sql.exec('SELECT * FROM published_packs WHERE game_id=?', formalId).toArray()[0], packRow, 'editing copy does not replace the formal manifest');
      assert.deepEqual(storage.sql.exec('SELECT * FROM published_pack_chapters WHERE game_id=? ORDER BY chapter_id', formalId).toArray(), frozenChapters, 'deleting a copy chapter leaves both formal chapter snapshots intact');
      assert.deepEqual((await read()).data, zero.data);
      assert.deepEqual((await call(`/api/games/${otherId}/copy`, undefined, admin)).data, otherBefore);
      assert.deepEqual((await call('/api/admin/source', undefined, admin)).data, installed.data);
      assert.deepEqual((await call('/api/admin/base-map', undefined, admin)).data, templateBefore);
      console.log(copyFixture ? 'PASS independent registered source: real full-copy API, approval and formal player loading' : process.env.CHAPTER_WB_BLANK === '1'
        ? 'PASS API-authored ordinary game: validation/submission/approval, formal loader and two player environments'
        : 'PASS isolated converted fixture: authenticated validation/submission/approval, formal loader and two player environments', formalId);
    }
    console.log('Isolated HTTP artifacts:', own);
  } finally { await transport.close(); storage.close(); }
});
