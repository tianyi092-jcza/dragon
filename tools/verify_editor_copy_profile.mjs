// Actual pinned Web inputs/shared copy and writer. Content-only; no DOS, user state or auth claims.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
import { setGeneralPortrait } from '../web/src/editor/generalportrait.js';
import { renameChapter, copyChapterInGame, addBlankChapter, deleteChapter, editChapterCity, editChapterCityNative, disbandFaction, setMonarch, setStrategist, removeMonarch, renameGeneral } from '../web/src/content/authoring/gamesource.js';
const sha = b => createHash('sha256').update(b).digest('hex'), calls = [], inputs = {};
const read = path => { calls.push(path); const bytes = readFileSync(new URL('../web/' + path, import.meta.url)); inputs['web/' + path] = sha(bytes); return bytes; };
function jsonClone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (cause) { throw new Error('actual copy JSON clone failed', { cause }); } }
const started = performance.now();
function progress(stage) { process.stderr.write(`${JSON.stringify({ stage, elapsedMs: Math.round(performance.now() - started) })}\n`); }
progress('capture-start');
let record = 0;
const loader = createPinnedCopyLoader({ readWeb: read, allocateEntityId: () => 'profile-record-' + ++record });
const profile = new FixedCopyProfile({ loadCopy: loader }), captured = await profile.capture({ gameId: 'copy-profile-engineering-1', ownerId: 'engineering-owner-1' });
assert.equal(captured.game.chapterOrder.length, 20); assert.equal(Object.keys(captured.game.cities).length, 192); assert.equal(Object.keys(captured.game.sourceRecords.entities).length, 2540);
assert.equal(Object.keys(captured.provenance.inputHashes).length, 41); assert.equal(calls.length, 41); assert.ok(calls.every(p => !p.includes('..') && p.startsWith('content/builtin/')));
assert.ok(Object.isFrozen(captured.game.map) && Object.isFrozen(captured.provenance));
const baseline = captured.game, baseProof = profile.verify(captured.capability, baseline); assert.equal(baseProof.sourceDigest, captured.baselineDigest); assert.deepEqual(baseProof.changes, []);
progress('baseline-verified');
function patch(root, path, replacement) { if (!path.length) return replacement; const [key, ...rest] = path, next = Array.isArray(root) ? [...root] : { ...root }; next[key] = patch(root[key], rest, replacement); return next; }
const cityNativeOnly = process.argv[2] === '--city-native-only';
assert.ok(process.argv.length === 2 || cityNativeOnly && process.argv.length === 3);
if (cityNativeOnly) {
  verifyNativeCityHistory();
  const files = ['server/copyprofile.js', 'web/src/content/authoring/gamesource.js', 'tools/verify_editor_copy_profile.mjs'];
  process.stdout.write(`${JSON.stringify({ result: 'PASS-CITY-NATIVE-CONTENT-HISTORY', actualInputs: calls.length, inputHashes: inputs, sourceHashes: Object.fromEntries(files.map(path => [path, sha(readFileSync(path))])), limits: 'Pinned fullcopy content capability only; not persistent history, HTTP, template, UI or runtime certification.' })}\n`);
} else {
let changed = { ...baseline, metadata: { name: '作者原文', introduction: 'Mixed漢字É😀' }, chapters: { ...baseline.chapters } };
for (const id of baseline.chapterOrder) {
  const chapter = baseline.chapters[id], state = chapter.state, f = state.factions[0];
  const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [id], chapters: { [id]: { chapterId: id, state: { factions: state.factions, nativeFactionSlotRaw: state.nativeFactionSlotRaw } } } };
  const written = editChapterResources(shell, id, 0, { money: f.money + 1, reserve_cav: f.reserve_cav + 1, reserve_arc: f.reserve_arc + 1, reserve_inf: f.reserve_inf + 1 }).chapters[id].state;
  changed.chapters[id] = { ...chapter, state: { ...state, ...written } };
}
const proof = profile.verify(captured.capability, changed); assert.equal(proof.changes.length, 20); assert.ok(proof.changes.every(row => row.slot === 0 && row.fields.length === 4)); assert.notEqual(proof.sourceDigest, captured.baselineDigest);
let roundtrip; try { roundtrip = JSON.parse(JSON.stringify(changed)); } catch (cause) { throw new Error('actual copy JSON roundtrip failed', { cause }); }
assert.equal(profile.verify(captured.capability, roundtrip).sourceDigest, proof.sourceDigest); roundtrip = undefined;
let rejects = 0, getterHits = 0;
function rejected(game, capability = captured.capability, status = 422) { assert.throws(() => profile.verify(capability, game), e => e.status === status); rejects++; }
rejected(baseline, {}, 403); rejected(baseline, { valid: true, baselineDigest: captured.baselineDigest }, 403); rejected(baseline, jsonClone(captured.capability), 403);
const paths = [['gameId'], ['sourceRef','digest'], ['sourceRef','revision'], ['sourceRef','sourceId'], ['ruleProfile'], ['compatibilityAssets','roadCostHex'], ['compatibility','slotBindings','cities',Object.keys(baseline.cities)[0]], ['localModel','ownerId'], ['localModel','draftRevision'], ['chapterOrder',0], ['chapters',baseline.chapterOrder[0],'sourceChapterId'], ['map','bounds','width'], ['map','decorations',0,'x'], ['cities',Object.keys(baseline.cities)[0],'runtimeSlot']];
for (const path of paths) rejected(patch(baseline, path, 'self-claimed-valid'));
rejected({ ...baseline, valid: true }); rejected({ ...baseline, sourceRecords: null }); rejected({ ...baseline, componentDefinitions: {} }); rejected({ ...baseline, assets: { guessed: { valid: true } } });
const sourceRecordId = Object.keys(baseline.sourceRecords.entities)[0];
for (const path of [['sourceRecords','entities',sourceRecordId,'id'], ['sourceRecords','entities',sourceRecordId,'origin','originalRaw32'], ['sourceRecords','bindings',baseline.chapterOrder[0],'reserved127','originalRaw32'], ['sourceRecords','resourceRef','sha256'], ['chapters',baseline.chapterOrder[19],'state','nativeMonthlyPolicyRaw']]) rejected(patch(baseline,path,'self-repaired'));
assert.throws(()=>new FixedCopyProfile({loadCopy:loader}).verify(captured.capability,baseline),e=>e.status===403);rejects++;
const id = baseline.chapterOrder[0], state = baseline.chapters[id].state, f = state.factions[0];
for (const field of Object.keys(f).filter(k => !['money','money_hi','reserve_cav','reserve_arc','reserve_inf','raw'].includes(k))) rejected(patch(baseline, ['chapters',id,'state','factions',0,field], '__protected__'));
for (const field of ['money','money_hi','reserve_cav','reserve_arc','reserve_inf']) rejected(patch(baseline, ['chapters',id,'state','factions',0,field], f[field] + 1));
for (const offset of [0,1,2,3,10,0x18,0x23,0x3e,0x3f]) {
  const raw = f.raw, byte = Number.parseInt(raw.slice(offset*2,offset*2+2),16), changedRaw = raw.slice(0,offset*2)+(byte^1).toString(16).padStart(2,'0')+raw.slice(offset*2+2);
  rejected(patch(baseline, ['chapters',id,'state','factions',0,'raw'], changedRaw));
}
const unused = state.nativeFactionSlotRaw[21], alteredUnused = (Number.parseInt(unused.slice(0,2),16)^1).toString(16).padStart(2,'0')+unused.slice(2);
rejected(patch(baseline, ['chapters',id,'state','nativeFactionSlotRaw',21], alteredUnused));
for (const v of [-0,NaN,Infinity,-0x800001,0x800000,'1']) rejected(patch(baseline,['chapters',id,'state','factions',0,'money'],v));
for (const metadata of [{name:'',introduction:''},{name:'九個字ABCDEFGHI',introduction:''},{name:'e\u0301',introduction:''},{name:'abc',introduction:'\ud800'},{name:'abc',introduction:'x',ownerId:'spoof'}]) rejected({...baseline,metadata});
const getter = { ...baseline }; Object.defineProperty(getter,'chapters',{enumerable:true,get(){getterHits++;return baseline.chapters;}}); rejected(getter);
const metaGetter = { ...baseline.metadata }; Object.defineProperty(metaGetter,'name',{enumerable:true,get(){getterHits++;return baseline.metadata.name;}}); rejected({...baseline,metadata:metaGetter});
const hidden = {...baseline}; Object.defineProperty(hidden,'hidden',{value:true}); rejected(hidden); rejected({...baseline,[Symbol('cap')]:true}); rejected(Object.assign(Object.create({}),baseline));
assert.equal(getterHits,0); assert.equal(profile.verify(captured.capability,baseline).sourceDigest,captured.baselineDigest);
progress('protected-input-negatives-verified');
// An applied history must not make structuredClone execute nested accessors.
for (const arrayEntry of [false, true]) {
  const nested = structuredClone(baseline), generals = nested.chapters[id].state.generals;
  const target = arrayEntry ? generals : generals[0], key = arrayEntry ? '0' : 'name', original = target[key];
  let nestedHits = 0;
  Object.defineProperty(target, key, { enumerable: true, configurable: true, get() { nestedHits++; return original; } });
  assert.throws(() => profile.verify(captured.capability, nested, [{ op: 'rename', chapterId: id, name: '診斷章' }]), error => error.status === 422 && error.code === 'COPY_STRUCTURE');
  assert.equal(nestedHits, 0, 'nested accessor must not execute during history validation');
}
for (const mutate of [
  chapter => Object.defineProperty(chapter.state, 'hidden', { value: true }),
  chapter => { chapter.state.generals[Symbol('hidden')] = true; },
  chapter => Object.setPrototypeOf(chapter.state.generals, Object.create(Array.prototype)),
  chapter => { chapter.state.loop = chapter.state; },
]) {
  const malformed = structuredClone(baseline); mutate(malformed.chapters[id]);
  assert.throws(() => profile.verify(captured.capability, malformed, [{ op: 'rename', chapterId: id, name: '診斷章' }]), error => error.status === 422 && error.code === 'COPY_STRUCTURE');
}
// Anchored manifest and actual leaf bytes, never a self-asserted APPROVED flag.
assert.throws(()=>createPinnedCopyLoader({readWeb:path=>{const bytes=readFileSync(new URL('../web/'+path,import.meta.url));if(path.endsWith('/manifest.json')){const copy=Buffer.from(bytes);copy[0]^=1;return copy;}return bytes;}}),/mismatch/);rejects++;
assert.throws(()=>createPinnedCopyLoader({readWeb:path=>{const bytes=readFileSync(new URL('../web/'+path,import.meta.url));if(path.endsWith('/terrain.bin')){const copy=Buffer.from(bytes);copy[0]^=1;return copy;}return bytes;}}),/mismatch/);rejects++;
const badEntities = createPinnedCopyLoader({readWeb:path=>{const bytes=readFileSync(new URL('../web/'+path,import.meta.url));if(path.endsWith('/entity-source.json')){const copy=Buffer.from(bytes);copy[0]^=1;return copy;}return bytes;}});
await assert.rejects(()=>badEntities({gameId:'bad-entity-copy',ownerId:'engineering-owner'}),/mismatch/);rejects++;
// Imported chapters omit the optional display name; restoring undefined must
// not invent a new own property during protected-delta verification.
const renamed = structuredClone(changed), renameId = baseline.chapterOrder[0];
assert.equal(Object.hasOwn(baseline.chapters[renameId], 'name'), false);
renameChapter(renamed, renameId, '收據章');
const renameEdits = [{ op: 'rename', chapterId: renameId, name: '收據章' }];
assert.equal(typeof profile.verify(captured.capability, renamed, renameEdits).sourceDigest, 'string');
assert.throws(() => profile.verify(captured.capability, renamed), e => e.code === 'COPY_PROTECTED_DELTA');
const renamedTampered = structuredClone(renamed); renamedTampered.map.bounds.width++;
assert.throws(() => profile.verify(captured.capability, renamedTampered, renameEdits), e => e.code === 'COPY_PROTECTED_DELTA');
assert.equal(Object.hasOwn(baseline.chapters[renameId], 'name'), false);
// Copying a resource-edited chapter preserves the same representation-only
// allowance; raw bytes and all non-resource fields remain protected.
const copied = structuredClone(changed), copyId = copyChapterInGame(copied, renameId);
const copyEdits = [{ op: 'copy', chapterId: renameId }];
const copiedProof = profile.verify(captured.capability, copied, copyEdits);
assert.equal(typeof copiedProof.sourceDigest, 'string');
assert.equal(profile.verify(captured.capability, jsonClone(copied), copyEdits).sourceDigest, copiedProof.sourceDigest);
assert.deepEqual(copied.chapters[copyId].state, changed.chapters[renameId].state);
for (const mutate of [
  chapter => { chapter.name = '未授權改名'; },
  chapter => { delete chapter.name; },
  chapter => { chapter.sourceChapterId = 'another-game#chapter'; },
  chapter => { delete chapter.sourceChapterId; },
]) {
  const tampered = structuredClone(copied); mutate(tampered.chapters[copyId]);
  assert.throws(() => profile.verify(captured.capability, tampered, copyEdits), e => e.code === 'COPY_PROTECTED_DELTA');
}
const namedCopies = structuredClone(changed);
renameChapter(namedCopies, renameId, '來源改名');
const namedCopyId = copyChapterInGame(namedCopies, renameId);
renameChapter(namedCopies, namedCopyId, '副本改名');
const namedDescendant = copyChapterInGame(namedCopies, namedCopyId);
const namedHistory = [{ op: 'rename', chapterId: renameId, name: '來源改名' }, { op: 'copy', chapterId: renameId }, { op: 'rename', chapterId: namedCopyId, name: '副本改名' }, { op: 'copy', chapterId: namedCopyId }];
const namedProof = profile.verify(captured.capability, namedCopies, namedHistory);
assert.equal(profile.verify(captured.capability, jsonClone(namedCopies), namedHistory).sourceDigest, namedProof.sourceDigest);
assert.equal(namedCopies.chapters[namedDescendant].name, '副本改名（副本）');
for (const mutate of [
  state => { state.factions[0].money++; },
  state => { state.factions[0].raw = 'ff' + state.factions[0].raw.slice(2); },
  state => { state.cities[0].troops++; },
]) {
  const tampered = structuredClone(copied); mutate(tampered.chapters[copyId].state);
  assert.throws(() => profile.verify(captured.capability, tampered, copyEdits), e => e.status === 422);
}
const blank = structuredClone(changed), blankId = addBlankChapter(blank);
const blankEdits = [{ op: 'add-blank' }];
assert.equal(typeof profile.verify(captured.capability, blank, blankEdits).sourceDigest, 'string');
for (const mutate of [
  chapter => { chapter.state.nativeUnknownRaw = '00'; },
  chapter => { chapter.extra = { approved: true }; },
  chapter => { chapter.chapterId = 'wrong-id'; },
  chapter => { chapter.sourceChapterId = renameId; },
]) {
  const tampered = structuredClone(blank); mutate(tampered.chapters[blankId]);
  assert.throws(() => profile.verify(captured.capability, tampered, blankEdits), e => e.code === 'COPY_PROTECTED_DELTA');
}
assert.throws(() => profile.verify(captured.capability, blank, copyEdits), e => e.code === 'COPY_PROTECTED_DELTA');
const extraBlank = structuredClone(blank); addBlankChapter(extraBlank);
assert.throws(() => profile.verify(captured.capability, extraBlank, [...blankEdits, ...copyEdits]), e => e.code === 'COPY_PROTECTED_DELTA');
for (const [source, newId, edits] of [[blank, blankId, blankEdits], [copied, copyId, copyEdits]]) {
  const renamedNew = structuredClone(source); renameChapter(renamedNew, newId, '新增章改名');
  const history = [...edits, { op: 'rename', chapterId: newId, name: '新增章改名' }];
  assert.equal(typeof profile.verify(captured.capability, renamedNew, history).sourceDigest, 'string');
  renameChapter(renamedNew, newId, '再次改名');
  history.push({ op: 'rename', chapterId: newId, name: '再次改名' });
  assert.equal(typeof profile.verify(captured.capability, jsonClone(renamedNew), history).sourceDigest, 'string');
  const tampered = structuredClone(renamedNew); tampered.chapters[newId].state.unapproved = '00';
  assert.throws(() => profile.verify(captured.capability, tampered, history), e => e.code === 'COPY_PROTECTED_DELTA');
}
// A temporary created chapter can be removed again without changing any
// surviving chapter. Reused generated IDs belong to separate lifetimes.
for (const kind of ['blank', 'copy']) {
  const temporary = structuredClone(changed), history = [];
  for (let cycle = 0; cycle < 2; cycle++) {
    const newId = kind === 'blank' ? addBlankChapter(temporary) : copyChapterInGame(temporary, renameId);
    history.push(kind === 'blank' ? { op: 'add-blank' } : { op: 'copy', chapterId: renameId });
    renameChapter(temporary, newId, '暫存章'); history.push({ op: 'rename', chapterId: newId, name: '暫存章' });
    deleteChapter(temporary, newId); history.push({ op: 'delete', chapterId: newId });
  }
  assert.equal(profile.verify(captured.capability, temporary, history).sourceDigest, proof.sourceDigest);
  const retainedId = addBlankChapter(temporary); history.push({ op: 'add-blank' });
  renameChapter(temporary, retainedId, '保留章'); history.push({ op: 'rename', chapterId: retainedId, name: '保留章' });
  assert.equal(typeof profile.verify(captured.capability, jsonClone(temporary), history).sourceDigest, 'string');
  const corrupt = structuredClone(temporary); corrupt.chapters[renameId].state.cities[0].troops++;
  assert.throws(() => profile.verify(captured.capability, corrupt, history), e => e.code === 'COPY_PROTECTED_DELTA');
  const corruptNew = structuredClone(temporary); corruptNew.chapters[retainedId].state.extra = 1;
  assert.throws(() => profile.verify(captured.capability, corruptNew, history), e => e.code === 'COPY_PROTECTED_DELTA');
}
const removedOriginal = structuredClone(changed), removalHistory = [];
for (const chapterId of baseline.chapterOrder.slice(0, 2)) {
  renameChapter(removedOriginal, chapterId, '將刪除'); removalHistory.push({ op: 'rename', chapterId, name: '將刪除' });
  deleteChapter(removedOriginal, chapterId); removalHistory.push({ op: 'delete', chapterId });
}
assert.equal(typeof profile.verify(captured.capability, removedOriginal, removalHistory).sourceDigest, 'string');
const removedTampered = structuredClone(removedOriginal); removedTampered.chapters[baseline.chapterOrder[2]].state.cities[0].troops++;
assert.throws(() => profile.verify(captured.capability, removedTampered, removalHistory), e => e.code === 'COPY_PROTECTED_DELTA');
const mixed = structuredClone(changed), removedId = baseline.chapterOrder[4];
deleteChapter(mixed, removedId); copyChapterInGame(mixed, renameId); addBlankChapter(mixed);
copyChapterInGame(mixed, baseline.chapterOrder[1]);
const mixedEdits = [{ op: 'delete', chapterId: removedId }, { op: 'copy', chapterId: renameId }, { op: 'add-blank' }, { op: 'copy', chapterId: baseline.chapterOrder[1] }];
assert.equal(typeof profile.verify(captured.capability, mixed, mixedEdits).sourceDigest, 'string');
assert.equal(profile.verify(captured.capability, jsonClone(mixed), mixedEdits).sourceDigest, profile.verify(captured.capability, mixed, mixedEdits).sourceDigest);
// Chapter history authorizes exact structural IDs/order, not an arbitrary
// permutation hidden by restoring the baseline order during verification.
for (const [source, edits] of [[renamed, renameEdits], [copied, copyEdits], [blank, blankEdits]]) {
  const reordered = structuredClone(source); reordered.chapterOrder = reordered.chapterOrder.toReversed();
  assert.throws(() => profile.verify(captured.capability, reordered, edits), e => e.code === 'COPY_PROTECTED_DELTA');
  const duplicated = structuredClone(source); duplicated.chapterOrder[1] = duplicated.chapterOrder[0];
  assert.throws(() => profile.verify(captured.capability, duplicated, edits), e => e.code === 'COPY_PROTECTED_DELTA');
}
for (const [source, oldId, edits] of [[copied, copyId, copyEdits], [blank, blankId, blankEdits]]) {
  const spoofed = structuredClone(source), newId = oldId + '-spoofed';
  spoofed.chapters[newId] = { ...spoofed.chapters[oldId], chapterId: newId }; delete spoofed.chapters[oldId];
  spoofed.chapterOrder[spoofed.chapterOrder.indexOf(oldId)] = newId;
  assert.throws(() => profile.verify(captured.capability, spoofed, edits), e => e.code === 'COPY_PROTECTED_DELTA');
}
for(const[path,h]of Object.entries(inputs))assert.equal(sha(readFileSync(path)),h);
progress('chapter-structure-history-verified');
// City history must not erase unrelated raw-byte corruption. Multiple edits
// to the same record must retain the earlier authorized field until reversed.
const city = baseline.chapters[id].state.cities.find(row => row.troops > 0 && row.prod > 0);
assert.ok(city);
const cityOps = [{ op: 'city', chapterId: id, cityIdx: city.idx, values: { troops: city.troops - 1 } }, { op: 'city', chapterId: id, cityIdx: city.idx, values: { prod: city.prod - 1 } }];
let cityEdited = baseline;
for (const op of cityOps) cityEdited = editChapterCity(cityEdited, id, city.idx, op.values);
assert.equal(typeof profile.verify(captured.capability, cityEdited, cityOps).sourceDigest, 'string');
assert.equal(profile.verify(captured.capability, jsonClone(cityEdited), cityOps).sourceDigest, profile.verify(captured.capability, cityEdited, cityOps).sourceDigest);
for (const offset of [0, 1, 12, 31]) {
  const tampered = structuredClone(cityEdited), row = tampered.chapters[id].state.cities.find(row => row.idx === city.idx);
  const byte = Number.parseInt(row.raw.slice(offset * 2, offset * 2 + 2), 16);
  row.raw = row.raw.slice(0, offset * 2) + (byte ^ 1).toString(16).padStart(2, '0') + row.raw.slice(offset * 2 + 2);
  assert.throws(() => profile.verify(captured.capability, tampered, cityOps), e => e.code === 'COPY_PROTECTED_DELTA');
}
const divergentCity = structuredClone(cityEdited); divergentCity.chapters[id].state.cities.find(row => row.idx === city.idx).troops++;
assert.throws(() => profile.verify(captured.capability, divergentCity, cityOps), e => e.code === 'COPY_PROTECTED_DELTA');
verifyNativeCityHistory();
progress('city-history-verified');
// A disband operation must not authorize unrelated membership changes.
const disbanded = structuredClone(baseline), factionId = state.factions[0].idx;

const disbandOps = [{ op: 'disband-faction', chapterId: id, factionIdx: factionId, confirm: true }];
disbandFaction(disbanded, id, factionId);
assert.equal(typeof profile.verify(captured.capability, disbanded, disbandOps).sourceDigest, 'string');
const fundedThenDisbanded = structuredClone(changed);
disbandFaction(fundedThenDisbanded, id, factionId);
assert.equal(typeof profile.verify(captured.capability, fundedThenDisbanded, disbandOps).sourceDigest, 'string');
assert.equal(profile.verify(captured.capability, jsonClone(fundedThenDisbanded), disbandOps).sourceDigest, profile.verify(captured.capability, fundedThenDisbanded, disbandOps).sourceDigest);
const fundedCopy = structuredClone(fundedThenDisbanded);
const fundedCopyId = copyChapterInGame(fundedCopy, id);
const fundedCopyOps = [...disbandOps, { op: 'copy', chapterId: id }];
const fundedCopyProof = profile.verify(captured.capability, fundedCopy, fundedCopyOps);
assert.equal(profile.verify(captured.capability, jsonClone(fundedCopy), fundedCopyOps).sourceDigest, fundedCopyProof.sourceDigest);
assert.deepEqual(fundedCopy.chapters[fundedCopyId].state, fundedThenDisbanded.chapters[id].state);
for (const offset of [0x18, 0x23]) {
  const tampered = structuredClone(fundedCopy), raw = tampered.chapters[fundedCopyId].state.nativeFactionSlotRaw[factionId];
  tampered.chapters[fundedCopyId].state.nativeFactionSlotRaw[factionId] = raw.slice(0, offset * 2) + (Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16) ^ 1).toString(16).padStart(2, '0') + raw.slice(offset * 2 + 2);
  assert.throws(() => profile.verify(captured.capability, tampered, fundedCopyOps), error => error.code === 'COPY_PROTECTED_DELTA');
}
const fundedTamper = structuredClone(fundedThenDisbanded);
const fundedRaw = fundedTamper.chapters[id].state.nativeFactionSlotRaw[factionId];
fundedTamper.chapters[id].state.nativeFactionSlotRaw[factionId] = fundedRaw.slice(0, 0x18 * 2) + (Number.parseInt(fundedRaw.slice(0x18 * 2, 0x19 * 2), 16) ^ 1).toString(16).padStart(2, '0') + fundedRaw.slice(0x19 * 2);
assert.throws(() => profile.verify(captured.capability, fundedTamper, disbandOps), error => error.code === 'COPY_PROTECTED_DELTA');
const survivingFaction = disbanded.chapters[id].state.factions[0];
const compactResources = editChapterResources(disbanded, id, survivingFaction.idx, { money: survivingFaction.money + 1 });
assert.equal(typeof profile.verify(captured.capability, compactResources, disbandOps).sourceDigest, 'string');
const compactCopy = structuredClone(disbanded), compactCopyId = copyChapterInGame(compactCopy, id);
const compactCopyEdited = editChapterResources(compactCopy, compactCopyId, survivingFaction.idx, { reserve_inf: survivingFaction.reserve_inf + 1 });
const compactOps = [...disbandOps, { op: 'copy', chapterId: id }];
assert.equal(profile.verify(captured.capability, compactCopyEdited, compactOps).sourceDigest, profile.verify(captured.capability, jsonClone(compactCopyEdited), compactOps).sourceDigest);
const compactCorrupt = structuredClone(compactCopyEdited);
compactCorrupt.chapters[compactCopyId].state.nativeFactionSlotRaw[factionId] = 'ff'.repeat(64);
assert.throws(() => profile.verify(captured.capability, compactCorrupt, compactOps), e => e.code === 'COPY_PROTECTED_DELTA');
for (const collection of ['generals', 'cities']) {
  for (const affected of [false, true]) {
    const tampered = structuredClone(disbanded);
    const original = state[collection].find(row => affected ? row.faction === factionId : row.faction !== null && row.faction !== factionId);
    assert.ok(original);
    tampered.chapters[id].state[collection].find(row => row.idx === original.idx).faction = affected ? state.factions[1].idx : null;
    assert.throws(() => profile.verify(captured.capability, tampered, disbandOps), e => e.code === 'COPY_PROTECTED_DELTA');
  }
}
const disbandedTwice = structuredClone(disbanded), secondFaction = state.factions[1].idx;
disbandFaction(disbandedTwice, id, secondFaction);
const twiceOps = [...disbandOps, { op: 'disband-faction', chapterId: id, factionIdx: secondFaction, confirm: true }];
assert.equal(profile.verify(captured.capability, jsonClone(disbandedTwice), twiceOps).sourceDigest, profile.verify(captured.capability, disbandedTwice, twiceOps).sourceDigest);
const reassigned = structuredClone(disbanded), formerMonarch = state.factions[0].monarch_idx;
setMonarch(reassigned, id, secondFaction, formerMonarch);
const reassignedOps = [...disbandOps, { op: 'set-monarch', chapterId: id, factionIdx: secondFaction, generalIdx: formerMonarch }];
assert.equal(typeof profile.verify(captured.capability, reassigned, reassignedOps).sourceDigest, 'string');
disbandFaction(reassigned, id, secondFaction);
assert.equal(typeof profile.verify(captured.capability, reassigned, [...reassignedOps, twiceOps[1]]).sourceDigest, 'string');
progress('disband-history-verified');
// Newly copied chapters retain a history-derived pinned content baseline,
// not an authority supplied by their sourceChapterId metadata.
let editedCopy = structuredClone(baseline);
const editableCopyId = copyChapterInGame(editedCopy, id);
renameGeneral(editedCopy, editableCopyId, 0, { name: '副本武將', hao: '副本字' });
editedCopy = editChapterCity(editedCopy, editableCopyId, city.idx, { troops: city.troops - 1 });
const editedCopyOps = [{ op: 'copy', chapterId: id }, { op: 'rename-general', chapterId: editableCopyId, generalIdx: 0, values: { name: '副本武將', hao: '副本字' } }, { op: 'city', chapterId: editableCopyId, cityIdx: city.idx, values: { troops: city.troops - 1 } }];
assert.equal(typeof profile.verify(captured.capability, editedCopy, editedCopyOps).sourceDigest, 'string');
assert.equal(profile.verify(captured.capability, jsonClone(editedCopy), editedCopyOps).sourceDigest, profile.verify(captured.capability, editedCopy, editedCopyOps).sourceDigest);
assert.deepEqual(editedCopy.chapters[id], baseline.chapters[id]);
for (const mutate of [
  chapter => { chapter.state.generals[0].force++; },
  chapter => { const row = chapter.state.cities.find(row => row.idx === city.idx); row.raw = (row.raw.startsWith('ff') ? '00' : 'ff') + row.raw.slice(2); },
]) {
  const tampered = structuredClone(editedCopy); mutate(tampered.chapters[editableCopyId]);
  assert.throws(() => profile.verify(captured.capability, tampered, editedCopyOps), e => e.code === 'COPY_PROTECTED_DELTA');
}
assert.throws(() => profile.verify(captured.capability, editedCopy, editedCopyOps.slice(1)), e => e.code === 'COPY_PROTECTED_DELTA');
// Copy captures the source at that point, not its original or later state.
let beforeCopy = structuredClone(baseline);
renameGeneral(beforeCopy, id, 0, { name: '複製前', hao: '原字' });
beforeCopy = editChapterCity(beforeCopy, id, city.idx, { troops: city.troops - 1 });
const beforeCopyOps = [{ op: 'rename-general', chapterId: id, generalIdx: 0, values: { name: '複製前', hao: '原字' } }, { op: 'city', chapterId: id, cityIdx: city.idx, values: { troops: city.troops - 1 } }];
const capturedCopyId = copyChapterInGame(beforeCopy, id); beforeCopyOps.push({ op: 'copy', chapterId: id });
renameGeneral(beforeCopy, id, 0, { name: '複製後' }); beforeCopyOps.push({ op: 'rename-general', chapterId: id, generalIdx: 0, values: { name: '複製後' } });
assert.equal(typeof profile.verify(captured.capability, beforeCopy, beforeCopyOps).sourceDigest, 'string');
assert.equal(profile.verify(captured.capability, jsonClone(beforeCopy), beforeCopyOps).sourceDigest, profile.verify(captured.capability, beforeCopy, beforeCopyOps).sourceDigest);
assert.equal(beforeCopy.chapters[capturedCopyId].state.generals[0].name, '複製前');
for (const mutate of [
  chapter => { chapter.state.generals[0].name = '複製後'; },
  chapter => { chapter.state.generals[0].force++; },
  chapter => { const row = chapter.state.cities.find(row => row.idx === city.idx); row.raw = 'ff' + row.raw.slice(2); },
]) {
  const tampered = structuredClone(beforeCopy); mutate(tampered.chapters[capturedCopyId]);
  assert.throws(() => profile.verify(captured.capability, tampered, beforeCopyOps), e => e.code === 'COPY_PROTECTED_DELTA');
}
// Portrait metadata is captured at copy time too; this is not an asset/SHA admission test.
let portraitSource = setGeneralPortrait(structuredClone(baseline), id, 0, '1');
const portraitCopyId = copyChapterInGame(portraitSource, id);
portraitSource = setGeneralPortrait(portraitSource, id, 0, null);
const portraitOps = [{ op: 'portrait', chapterId: id, generalIdx: 0, portraitKey: '1' }, { op: 'copy', chapterId: id }, { op: 'portrait', chapterId: id, generalIdx: 0, portraitKey: null }];
assert.equal(typeof profile.verify(captured.capability, portraitSource, portraitOps).sourceDigest, 'string');
assert.equal(profile.verify(captured.capability, jsonClone(portraitSource), portraitOps).sourceDigest, profile.verify(captured.capability, portraitSource, portraitOps).sourceDigest);
assert.equal(portraitSource.chapters[portraitCopyId].state.generals[0].portraitKey, '1');
for (const key of ['2', null]) {
  const wrongTime = setGeneralPortrait(portraitSource, portraitCopyId, 0, key);
  assert.throws(() => profile.verify(captured.capability, wrongTime, portraitOps), e => e.code === 'COPY_PROTECTED_DELTA');
}
// A chapter copy captures an existing authoring advisor edit, not the pinned
// advisor or a later source change. This is content preservation, not rules.
const advisorSource = structuredClone(changed);
const advisorFaction = advisorSource.chapters[id].state.factions.find(row => Number.isInteger(row.advisor_idx));
assert.ok(advisorFaction);
const advisorIdx = advisorFaction.advisor_idx, factionIdx = advisorFaction.idx;
setStrategist(advisorSource, id, factionIdx, null);
const advisorCopyId = copyChapterInGame(advisorSource, id);
setStrategist(advisorSource, id, factionIdx, advisorIdx);
const advisorOps = [{ op: 'set-strategist', chapterId: id, factionIdx, generalIdx: null }, { op: 'copy', chapterId: id }, { op: 'set-strategist', chapterId: id, factionIdx, generalIdx: advisorIdx }];
const advisorProof = profile.verify(captured.capability, advisorSource, advisorOps);
assert.equal(profile.verify(captured.capability, jsonClone(advisorSource), advisorOps).sourceDigest, advisorProof.sourceDigest);
assert.equal(advisorSource.chapters[advisorCopyId].state.factions.find(row => row.idx === factionIdx).advisor_idx, null);
// A baseline-only shadow would wrongly retain the former monarch's post.
// Preserve already-authorized role history before the advisor change.
const afterRoles = structuredClone(disbanded);
setMonarch(afterRoles, id, secondFaction, formerMonarch);
const oldSecondMonarch = state.factions.find(row => row.idx === secondFaction).monarch_idx;
setStrategist(afterRoles, id, secondFaction, oldSecondMonarch);
assert.equal(typeof profile.verify(captured.capability, afterRoles, [...reassignedOps, { op: 'set-strategist', chapterId: id, factionIdx: secondFaction, generalIdx: oldSecondMonarch }]).sourceDigest, 'string');
const wrongAdvisor = structuredClone(advisorSource);
setStrategist(wrongAdvisor, advisorCopyId, factionIdx, advisorIdx);
assert.throws(() => profile.verify(captured.capability, wrongAdvisor, advisorOps), e => e.code === 'COPY_PROTECTED_DELTA');
assert.equal(typeof profile.verify(captured.capability, wrongAdvisor, [...advisorOps, { op: 'set-strategist', chapterId: advisorCopyId, factionIdx, generalIdx: advisorIdx }]).sourceDigest, 'string');
progress('copy-time-entity-history-verified');
// Copied chapters retain their own captured role baseline, not a lookup
// requiring that their generated ID exist in the original pinned chapters.
const copiedRoles = structuredClone(disbanded);
const copiedRolesId = copyChapterInGame(copiedRoles, id);
setMonarch(copiedRoles, copiedRolesId, secondFaction, formerMonarch);
const copiedRoleOps = [...disbandOps, { op: 'copy', chapterId: id }, { op: 'set-monarch', chapterId: copiedRolesId, factionIdx: secondFaction, generalIdx: formerMonarch }];
const copiedRoleProof = profile.verify(captured.capability, copiedRoles, copiedRoleOps);
assert.equal(profile.verify(captured.capability, jsonClone(copiedRoles), copiedRoleOps).sourceDigest, copiedRoleProof.sourceDigest);
assert.deepEqual(copiedRoles.chapters[id], disbanded.chapters[id]);
const copiedDisband = structuredClone(baseline), copiedDisbandId = copyChapterInGame(copiedDisband, id);
disbandFaction(copiedDisband, copiedDisbandId, factionId);
const copiedDisbandOps = [{ op: 'copy', chapterId: id }, { op: 'disband-faction', chapterId: copiedDisbandId, factionIdx: factionId, confirm: true }];
const copiedDisbandProof = profile.verify(captured.capability, copiedDisband, copiedDisbandOps);
assert.equal(profile.verify(captured.capability, jsonClone(copiedDisband), copiedDisbandOps).sourceDigest, copiedDisbandProof.sourceDigest);
assert.deepEqual(copiedDisband.chapters[id], baseline.chapters[id]);
for (const [source, chapterId, operations] of [[copiedRoles, copiedRolesId, copiedRoleOps], [copiedDisband, copiedDisbandId, copiedDisbandOps]]) {
  for (const field of ['force', 'faction']) {
    const tampered = structuredClone(source);
    const record = tampered.chapters[chapterId].state.generals.find(g => g.idx !== formerMonarch && g.faction === secondFaction);
    assert.ok(record);
    if (field === 'force') record.force++;
    else record.faction = null;
    assert.throws(() => profile.verify(captured.capability, tampered, operations), e => e.code === 'COPY_PROTECTED_DELTA');
  }
  assert.throws(() => profile.verify(captured.capability, source, operations.slice(0, -1)), e => e.code === 'COPY_PROTECTED_DELTA');
}
const successionCopy = structuredClone(disbanded), successionId = copyChapterInGame(successionCopy, id);
removeMonarch(successionCopy, successionId, secondFaction, { successor: formerMonarch });
const successionOps = [...disbandOps, { op: 'copy', chapterId: id }, { op: 'remove-monarch', chapterId: successionId, factionIdx: secondFaction, resolution: { successor: formerMonarch } }];
const dissolvedCopy = structuredClone(baseline), dissolvedId = copyChapterInGame(dissolvedCopy, id);
removeMonarch(dissolvedCopy, dissolvedId, factionId, { disband: true });
const dissolvedOps = [{ op: 'copy', chapterId: id }, { op: 'remove-monarch', chapterId: dissolvedId, factionIdx: factionId, resolution: { disband: true } }];
function verifyDetachedCopy(source, operations) {
  const result = profile.verify(captured.capability, source, operations);
  assert.equal(profile.verify(captured.capability, jsonClone(source), operations).sourceDigest, result.sourceDigest);
  const corrupt = structuredClone(source);
  corrupt.chapters[corrupt.chapterOrder.at(-1)].state.generals[0].force++;
  assert.throws(() => profile.verify(captured.capability, corrupt, operations), e => e.code === 'COPY_PROTECTED_DELTA');
}
for (const [source, chapterId, operations, expected, expectedOps] of [
  [successionCopy, successionId, successionOps, disbanded, disbandOps],
  [dissolvedCopy, dissolvedId, dissolvedOps, baseline, []],
  [copiedRoles, copiedRolesId, copiedRoleOps, disbanded, disbandOps],
  [copiedDisband, copiedDisbandId, copiedDisbandOps, baseline, []],
]) {
  const deleted = structuredClone(source);
  deleteChapter(deleted, chapterId);
  const deletionOps = [...operations, { op: 'delete', chapterId }];
  const deletionProof = profile.verify(captured.capability, deleted, deletionOps);
  assert.equal(deletionProof.sourceDigest, profile.verify(captured.capability, expected, expectedOps).sourceDigest);
  assert.equal(profile.verify(captured.capability, jsonClone(deleted), deletionOps).sourceDigest, deletionProof.sourceDigest);
  const unrelated = structuredClone(deleted);
  unrelated.chapters[id].state.generals[0].force++;
  assert.throws(() => profile.verify(captured.capability, unrelated, deletionOps), e => e.code === 'COPY_PROTECTED_DELTA');
  const invalidHistory = [...operations.slice(0, -1), { ...operations.at(-1), factionIdx: 999 }, deletionOps.at(-1)];
  assert.throws(() => profile.verify(captured.capability, deleted, invalidHistory), e => e.code === 'COPY_PROTECTED_DELTA');
  const dependent = structuredClone(source);
  copyChapterInGame(dependent, chapterId);
  deleteChapter(dependent, chapterId);
  verifyDetachedCopy(dependent, [...operations, { op: 'copy', chapterId }, { op: 'delete', chapterId }]);
}
progress('copied-role-deletion-verified');
// An unreferenced copied chapter may also be discarded after an advisor or
// portrait edit. Validation must still replay invalid edits before discarding.
for (const kind of ['set-strategist', 'portrait']) {
  let transient = structuredClone(baseline);
  const transientId = copyChapterInGame(transient, id);
  const edit = kind === 'portrait'
    ? { op: kind, chapterId: transientId, generalIdx: 0, portraitKey: '1' }
    : { op: kind, chapterId: transientId, factionIdx, generalIdx: null };
  if (kind === 'portrait') transient = setGeneralPortrait(transient, transientId, 0, '1');
  else setStrategist(transient, transientId, factionIdx, null);
  const dependent = structuredClone(transient);
  copyChapterInGame(dependent, transientId);
  deleteChapter(dependent, transientId);
  deleteChapter(transient, transientId);
  const history = [{ op: 'copy', chapterId: id }, edit, { op: 'delete', chapterId: transientId }];
  assert.equal(profile.verify(captured.capability, transient, history).sourceDigest, profile.verify(captured.capability, baseline).sourceDigest);
  assert.equal(profile.verify(captured.capability, jsonClone(transient), history).sourceDigest, profile.verify(captured.capability, baseline).sourceDigest);
  const tampered = structuredClone(transient); tampered.chapters[id].state.generals[0].force++;
  assert.throws(() => profile.verify(captured.capability, tampered, history), e => e.code === 'COPY_PROTECTED_DELTA');
  const invalid = kind === 'portrait' ? { ...edit, portraitKey: '../bad' } : { ...edit, factionIdx: 999 };
  assert.throws(() => profile.verify(captured.capability, transient, [history[0], invalid, history[2]]), e => e.code === 'COPY_PROTECTED_DELTA');
  verifyDetachedCopy(dependent, [history[0], edit, { op: 'copy', chapterId: transientId }, history[2]]);
}
const tamperedAdvisorCopy = structuredClone(advisorSource);
tamperedAdvisorCopy.chapters[advisorCopyId].state.generals[0].force++;
assert.throws(() => profile.verify(captured.capability, tamperedAdvisorCopy, advisorOps), e => e.code === 'COPY_PROTECTED_DELTA');
const changedPortrait = setGeneralPortrait(portraitSource, portraitCopyId, 0, '2');
assert.equal(typeof profile.verify(captured.capability, changedPortrait, [...portraitOps, { op: 'portrait', chapterId: portraitCopyId, generalIdx: 0, portraitKey: '2' }]).sourceDigest, 'string');
const siblingCopies = structuredClone(baseline), otherChapterId = baseline.chapterOrder[1];
const siblingA = copyChapterInGame(siblingCopies, id), siblingB = copyChapterInGame(siblingCopies, otherChapterId);
const siblingOps = [{ op: 'copy', chapterId: id }, { op: 'copy', chapterId: otherChapterId }];
assert.equal(typeof profile.verify(captured.capability, siblingCopies, siblingOps).sourceDigest, 'string');
const swapped = structuredClone(siblingCopies);
swapped.chapters[siblingA] = { ...structuredClone(siblingCopies.chapters[siblingB]), chapterId: siblingA };
swapped.chapters[siblingB] = { ...structuredClone(siblingCopies.chapters[siblingA]), chapterId: siblingB };
assert.throws(() => profile.verify(captured.capability, swapped, siblingOps), e => e.code === 'COPY_PROTECTED_DELTA');
const removedEditedCopy = structuredClone(editedCopy);
deleteChapter(removedEditedCopy, editableCopyId);
const removedEditedOps = [...editedCopyOps, { op: 'delete', chapterId: editableCopyId }];
assert.equal(profile.verify(captured.capability, removedEditedCopy, removedEditedOps).sourceDigest, captured.baselineDigest);
assert.equal(profile.verify(captured.capability, jsonClone(removedEditedCopy), removedEditedOps).sourceDigest, captured.baselineDigest);
const tamperedSurvivor = structuredClone(removedEditedCopy); tamperedSurvivor.chapters[id].state.generals[0].force++;
assert.throws(() => profile.verify(captured.capability, tamperedSurvivor, removedEditedOps), e => e.code === 'COPY_PROTECTED_DELTA');
const dependent = structuredClone(editedCopy); copyChapterInGame(dependent, editableCopyId); deleteChapter(dependent, editableCopyId);
verifyDetachedCopy(dependent, [...editedCopyOps, { op: 'copy', chapterId: editableCopyId }, { op: 'delete', chapterId: editableCopyId }]);
// Generated IDs may be reused after deletion. Earlier copy dependencies are
// snapshots, not permanent references to the later chapter with the same ID.
for (const retainLeaf of [false, true]) {
  const reused = structuredClone(baseline), history = [];
  const create = sourceId => { const result = copyChapterInGame(reused, sourceId); history.push({ op: 'copy', chapterId: sourceId }); return result; };
  const remove = chapterId => { deleteChapter(reused, chapterId); history.push({ op: 'delete', chapterId }); };
  const parent = create(id), child = create(parent);
  renameGeneral(reused, child, 0, { name: '舊輪副本' });
  history.push({ op: 'rename-general', chapterId: child, generalIdx: 0, values: { name: '舊輪副本' } });
  const leaf = retainLeaf ? create(child) : null;
  remove(parent); remove(child);
  const replacement = create(otherChapterId);
  assert.equal(replacement, retainLeaf ? child : parent);
  verifyDetachedCopy(reused, history);
  if (leaf) {
    assert.equal(reused.chapters[leaf].state.generals[0].name, '舊輪副本');
    assert.throws(() => profile.verify(captured.capability, reused, history.filter(edit => edit.op !== 'rename-general')), error => error.code === 'COPY_PROTECTED_DELTA');
    const tamperedLeaf = structuredClone(reused); tamperedLeaf.chapters[leaf].state.generals[0].force++;
    assert.throws(() => profile.verify(captured.capability, tamperedLeaf, history), error => error.code === 'COPY_PROTECTED_DELTA');
  }
  const invalidHistory = history.map(edit => edit.op === 'rename-general' ? { ...edit, values: { force: 255 } } : edit);
  assert.throws(() => profile.verify(captured.capability, reused, invalidHistory), error => error.code === 'COPY_PROTECTED_DELTA');
}
progress('all-history-verified');
const files=['server/copyprofile.js','tools/editor_trusted_copy.mjs','tools/verify_editor_copy_profile.mjs'];
process.stdout.write(JSON.stringify({result:'PASS-PINNED-COPY-CONTENT-DELTA',chapters:20,sourceRecords:2540,actualInputs:41,metadataAndFourResourceChanges:20,jsonRoundtrip:true,rejects,getterHits,baselineDigest:captured.baselineDigest,sourceDigest:proof.sourceDigest,inputHashes:inputs,sourceHashes:Object.fromEntries(files.map(path=>[path,sha(readFileSync(path))])),limits:'Actual approved Web loader/sharedcopy/read-only entity IDs and content-only capability. NOT authenticated/persistent source registry or runtime/image/Q69/production copy/save/publish. Representation tests never run rules.'},null,2)+'\n');
}
function verifyNativeCityHistory() {
  const id = baseline.chapterOrder[0], city = baseline.chapters[id].state.cities.find(row => row.troops > 0 && row.prod > 2);
  assert.ok(city);
  const op = { op: 'city-native', chapterId: id, cityIdx: city.idx, values: { prod: city.prod - 1, troops: city.troops - 1 } };
  const legacyOnly = editChapterCity(baseline, id, city.idx, op.values);
  assert.equal(typeof profile.verify(captured.capability, legacyOnly, [{ ...op, op: 'city' }]).sourceDigest, 'string');
  assert.deepEqual(legacyOnly.chapters[id].state.nativeCityRecordRaw, baseline.chapters[id].state.nativeCityRecordRaw);
  assert.throws(() => profile.verify(captured.capability, legacyOnly, [op]), e => e.code === 'COPY_PROTECTED_DELTA');
  const edited = editChapterCityNative(baseline, id, city.idx, op.values);
  const proof = profile.verify(captured.capability, edited, [op]);
  assert.equal(profile.verify(captured.capability, jsonClone(edited), [op]).sourceDigest, proof.sourceDigest);
  assert.throws(() => profile.verify(captured.capability, edited, [{ ...op, op: 'city' }]), e => e.code === 'COPY_PROTECTED_DELTA');
  for (const [idx, offset] of [[city.idx, 0], [city.idx, 0x0e], [city.idx, 0x13], [(city.idx + 1) % 192, 0x0e]]) {
    const raw = edited.chapters[id].state.nativeCityRecordRaw[idx];
    const changed = `${raw.slice(0, offset * 2)}${(Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16) ^ 1).toString(16).padStart(2, '0')}${raw.slice(offset * 2 + 2)}`;
    assert.throws(() => profile.verify(captured.capability, patch(edited, ['chapters', id, 'state', 'nativeCityRecordRaw', idx], changed), [op]), e => e.code === 'COPY_PROTECTED_DELTA');
  }
  const laterLegacy = { ...op, op: 'city', values: { prod: city.prod } };
  const mixed = editChapterCity(edited, id, city.idx, laterLegacy.values);
  assert.throws(() => profile.verify(captured.capability, mixed, [op]), e => e.code === 'COPY_PROTECTED_DELTA');
  assert.equal(typeof profile.verify(captured.capability, mixed, [op, laterLegacy]).sourceDigest, 'string');
  const repaired = editChapterCityNative(mixed, id, city.idx, laterLegacy.values);
  assert.equal(typeof profile.verify(captured.capability, repaired, [op, laterLegacy, { ...laterLegacy, op: 'city-native' }]).sourceDigest, 'string');
  const copies = structuredClone(edited), copyId = copyChapterInGame(copies, id);
  const copyOp = { ...op, chapterId: copyId, values: { prod: city.prod - 2 } };
  const changedCopy = editChapterCityNative(copies, copyId, city.idx, copyOp.values);
  assert.equal(typeof profile.verify(captured.capability, changedCopy, [op, { op: 'copy', chapterId: id }, copyOp]).sourceDigest, 'string');
  const descendant = copyChapterInGame(changedCopy, copyId);
  deleteChapter(changedCopy, copyId); deleteChapter(changedCopy, id);
  const history = [op, { op: 'copy', chapterId: id }, copyOp, { op: 'copy', chapterId: copyId }, { op: 'delete', chapterId: copyId }, { op: 'delete', chapterId: id }];
  assert.equal(typeof profile.verify(captured.capability, changedCopy, history).sourceDigest, 'string');
  assert.equal(changedCopy.chapters[descendant].state.cities.find(row => row.idx === city.idx).prod, city.prod - 2);
  assert.throws(() => profile.verify(captured.capability, changedCopy, history.map(edit => edit === copyOp ? { ...edit, values: { prod: -1 } } : edit)), e => e.code === 'COPY_PROTECTED_DELTA');
  const replacement = copyChapterInGame(changedCopy, baseline.chapterOrder[1]);
  assert.equal(replacement, copyId);
  assert.equal(typeof profile.verify(captured.capability, changedCopy, [...history, { op: 'copy', chapterId: baseline.chapterOrder[1] }]).sourceDigest, 'string');
  assert.equal(profile.verify(captured.capability, baseline).sourceDigest, captured.baselineDigest);
  for (const [path, hash] of Object.entries(inputs)) assert.equal(sha(readFileSync(path)), hash);
}
