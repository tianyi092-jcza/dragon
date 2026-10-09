// Actual pinned Web inputs/shared copy and writer. Content-only; no DOS, user state or auth claims.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
const sha = b => createHash('sha256').update(b).digest('hex'), calls = [], inputs = {};
const read = path => { calls.push(path); const bytes = readFileSync(new URL('../web/' + path, import.meta.url)); inputs['web/' + path] = sha(bytes); return bytes; };
function jsonClone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (cause) { throw new Error('actual copy JSON clone failed', { cause }); } }
let record = 0;
const loader = createPinnedCopyLoader({ readWeb: read, allocateEntityId: () => 'profile-record-' + ++record });
const profile = new FixedCopyProfile({ loadCopy: loader }), captured = await profile.capture({ gameId: 'copy-profile-engineering-1', ownerId: 'engineering-owner-1' });
assert.equal(captured.game.chapterOrder.length, 20); assert.equal(Object.keys(captured.game.cities).length, 192); assert.equal(Object.keys(captured.game.sourceRecords.entities).length, 2540);
assert.equal(Object.keys(captured.provenance.inputHashes).length, 41); assert.equal(calls.length, 41); assert.ok(calls.every(p => !p.includes('..') && p.startsWith('content/builtin/')));
assert.ok(Object.isFrozen(captured.game.map) && Object.isFrozen(captured.provenance));
const baseline = captured.game, baseProof = profile.verify(captured.capability, baseline); assert.equal(baseProof.sourceDigest, captured.baselineDigest); assert.deepEqual(baseProof.changes, []);
function patch(root, path, replacement) { if (!path.length) return replacement; const [key, ...rest] = path, next = Array.isArray(root) ? [...root] : { ...root }; next[key] = patch(root[key], rest, replacement); return next; }
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
// Anchored manifest and actual leaf bytes, never a self-asserted APPROVED flag.
assert.throws(()=>createPinnedCopyLoader({readWeb:path=>{const bytes=readFileSync(new URL('../web/'+path,import.meta.url));if(path.endsWith('/manifest.json')){const copy=Buffer.from(bytes);copy[0]^=1;return copy;}return bytes;}}),/mismatch/);rejects++;
assert.throws(()=>createPinnedCopyLoader({readWeb:path=>{const bytes=readFileSync(new URL('../web/'+path,import.meta.url));if(path.endsWith('/terrain.bin')){const copy=Buffer.from(bytes);copy[0]^=1;return copy;}return bytes;}}),/mismatch/);rejects++;
const badEntities = createPinnedCopyLoader({readWeb:path=>{const bytes=readFileSync(new URL('../web/'+path,import.meta.url));if(path.endsWith('/entity-source.json')){const copy=Buffer.from(bytes);copy[0]^=1;return copy;}return bytes;}});
await assert.rejects(()=>badEntities({gameId:'bad-entity-copy',ownerId:'engineering-owner'}),/mismatch/);rejects++;
for(const[path,h]of Object.entries(inputs))assert.equal(sha(readFileSync(path)),h);
const files=['server/copyprofile.js','tools/editor_trusted_copy.mjs','tools/verify_editor_copy_profile.mjs'];
process.stdout.write(JSON.stringify({result:'PASS-PINNED-COPY-CONTENT-DELTA',chapters:20,sourceRecords:2540,actualInputs:41,metadataAndFourResourceChanges:20,jsonRoundtrip:true,rejects,getterHits,baselineDigest:captured.baselineDigest,sourceDigest:proof.sourceDigest,inputHashes:inputs,sourceHashes:Object.fromEntries(files.map(path=>[path,sha(readFileSync(path))])),limits:'Actual approved Web loader/sharedcopy/read-only entity IDs and content-only capability. NOT authenticated/persistent source registry or runtime/image/Q69/production copy/save/publish. Representation tests never run rules.'},null,2)+'\n');
