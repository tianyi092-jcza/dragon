// Full-copy content capability only: pinned non-save inputs, no HTTP grant.
import assert from 'node:assert/strict';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { splitWaterGroup, mergeWaterGroups, renameWaterGroup, setWaterGroupMinimapVisibility } from '../web/src/editor/componenttools.js';
import { renameChapter, copyChapterInGame } from '../web/src/content/authoring/gamesource.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader() });
const captured = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-fullcopy-water' });
const base = captured.game, group = base.map.waterGroups[0];
assert.equal(base.chapterOrder.length, 20); assert.ok(group);
const edit = { op: 'water-visibility', groupId: group.id, showOnMinimap: !group.showOnMinimap };
const changed = setWaterGroupMinimapVisibility(base, edit.groupId, edit.showOnMinimap);
const verify = (game, maps = [], chapters = []) => profile.verify(captured.capability, game, chapters, [], maps);
let checks = 0;
const proof = verify(changed, [edit]); assert.notEqual(proof.sourceDigest, captured.baselineDigest); checks++;
assert.throws(() => verify(changed), error => error.code === 'COPY_PROTECTED_DELTA');
assert.equal(verify(base).sourceDigest, captured.baselineDigest);
assert.throws(() => profile.verify({}, changed, [], [], [edit]), error => error.code === 'COPY_CAPTURE_REQUIRED'); checks++;
const expected = structuredClone(base); expected.map.waterGroups[0].showOnMinimap = edit.showOnMinimap;
assert.deepEqual(changed, expected); assert.equal(base.map.waterGroups[0].showOnMinimap, group.showOnMinimap); checks++;
const restored = setWaterGroupMinimapVisibility(changed, group.id, group.showOnMinimap);
assert.equal(verify(restored, [edit, { ...edit, showOnMinimap: group.showOnMinimap }]).sourceDigest, captured.baselineDigest);
assert.equal(verify(base, [{ ...edit, showOnMinimap: group.showOnMinimap }]).sourceDigest, captured.baselineDigest); checks++;
const renamed = structuredClone(changed), chapterId = base.chapterOrder[0];
renameChapter(renamed, chapterId, '水域章'); copyChapterInGame(renamed, chapterId);
verify(renamed, [edit], [{ op: 'rename', chapterId, name: '水域章' }, { op: 'copy', chapterId }]);
assert.equal(renamed.chapterOrder.length, 21);
assert.deepEqual(renamed.chapters[renamed.chapterOrder.at(-1)].state, base.chapters[chapterId].state); checks++;
const decoded = decodeSourceChunks(encodeSourceChunks(changed));
assert.equal(verify(decoded, [edit]).sourceDigest, proof.sourceDigest); checks++;
for (const mutate of [
  game => { game.map.waterGroups[0].name = 'unauthorized'; },
  game => { game.map.waterGroups[0].memberIds.pop(); },
  game => { game.map.waterGroups[1].showOnMinimap = !game.map.waterGroups[1].showOnMinimap; },
  game => { game.map.roads[0].id += '-changed'; },
  game => { game.chapters[chapterId].state.generals[0].name += '改'; },
]) { const bad = structuredClone(changed); mutate(bad); assert.throws(() => verify(bad, [edit]), error => error.code === 'COPY_PROTECTED_DELTA'); }
checks++;
for (const edits of [null, {}, [null], [{ ...edit, op: 'move-city' }], [{ ...edit, groupId: 'missing' }], [{ ...edit, showOnMinimap: 0 }], [{ ...edit, extra: true }], Array(1)]) assert.throws(() => verify(changed, edits));
checks++;
let getters = 0;
const accessor = { ...edit }; Object.defineProperty(accessor, 'op', { enumerable: true, get() { getters++; return 'water-visibility'; } });
const callable = () => {}; Object.defineProperty(callable, 'op', { get() { getters++; return 'water-visibility'; } });
for (const item of [accessor, callable]) assert.throws(() => verify(changed, [item]));
assert.equal(getters, 0); checks++;
assert.equal(verify(base).sourceDigest, captured.baselineDigest);
assert.deepEqual(changed, expected); checks++;
const template = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind: 'minimal' }), profileRevision: FIXED_TEMPLATE_PROFILE });
const neutral = await template.capture({ gameId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ownerId: 'owned-fullcopy-water' });
assert.throws(() => template.verify(neutral.capability, neutral.game, [], [], [edit]), error => error.code === 'COPY_MAP_PROFILE'); checks++;
// The same exact name command is replayed by both trusted profile paths.
for (const [owner, capture] of [[profile, captured], [template, neutral]]) {
  const source = capture.game, target = source.map.waterGroups[0];
  const commands = [
    { op: 'water-rename', groupId: target.id, name: '  組合𠀀  ' },
    { op: 'water-visibility', groupId: target.id, showOnMinimap: !target.showOnMinimap },
    { op: 'water-rename', groupId: target.id, name: '最終名稱' },
  ];
  const check = (candidate, maps) => owner === profile
    ? owner.verify(capture.capability, candidate, [], [], maps)
    : owner.verifyOrderedTemplate(capture.capability, candidate, [{ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits: maps }]);
  let candidate = renameWaterGroup(source, target.id, commands[0].name);
  candidate = setWaterGroupMinimapVisibility(candidate, target.id, commands[1].showOnMinimap);
  candidate = renameWaterGroup(candidate, target.id, commands[2].name);
  const wanted = structuredClone(source);
  wanted.map.waterGroups[0].name = '最終名稱'; wanted.map.waterGroups[0].showOnMinimap = !target.showOnMinimap;
  assert.deepEqual(candidate, wanted);
  const accepted = check(candidate, commands);
  assert.equal(check(decodeSourceChunks(encodeSourceChunks(candidate)), commands).sourceDigest, accepted.sourceDigest); checks++;
  assert.throws(() => check(candidate, []));
  assert.throws(() => check(candidate, commands.toReversed()));
  const tampered = structuredClone(candidate); tampered.map.waterGroups[0].memberIds.push('not-authorized');
  assert.throws(() => check(tampered, commands)); checks++;
  for (const bad of [
    { ...commands[0], extra: true }, { ...commands[0], showOnMinimap: true },
    { op: 'water-rename', groupId: target.id }, { ...commands[0], groupId: 'missing' },
    { ...commands[0], name: null }, { ...commands[0], name: 'bad\ud800' },
    { ...commands[0], name: 'x'.repeat(65) }, { ...commands[0], op: 'water-members' },
  ]) assert.throws(() => check(source, [bad]));
  const nameAccessor = { ...commands[0] };
  Object.defineProperty(nameAccessor, 'name', { enumerable: true, get() { getters++; return 'not-read'; } });
  assert.throws(() => check(source, [nameAccessor])); assert.equal(getters, 0); checks++;
  assert.equal(check(source, []).sourceDigest, capture.baselineDigest);
  assert.deepEqual(candidate, wanted); checks++;
}
for (const [owner, capture] of [[profile, captured], [template, neutral]]) {
  const source = capture.game;
  const instances = new Map([...source.map.decorations, ...source.map.roads.flatMap(road => road.components ?? [])].map(instance => [instance.id, instance]));
  // Only explicit members accepted by the existing common writer; imported
  // display groups with unclassified members remain closed.
  const eligible = group => group.memberIds.every(id => ['river', 'lake', 'sea'].includes(instances.get(id)?.waterClass)) && group.baseCells.every(cell => source.map.base.geography[cell]);
  const groups = source.map.waterGroups.filter(eligible).slice(0, 4);
  assert.equal(groups.length, 4);
  const id = source.gameId + '#water-' + 'a'.repeat(64), nextId = source.gameId + '#water-' + 'b'.repeat(64);
  const command = { op: 'water-merge', groupIds: groups.slice(0, 2).map(row => row.id), groupId: id, name: '合併水域', showOnMinimap: false };
  const apply = (game, edit) => mergeWaterGroups(game, edit.groupIds, edit.groupId, edit.name, edit.showOnMinimap);
  const check = (candidate, maps) => owner === profile
    ? owner.verify(capture.capability, candidate, [], [], maps)
    : owner.verifyOrderedTemplate(capture.capability, candidate, maps.map(edit => ({ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits: [edit] })));
  const unsupported = source.map.waterGroups.find(group => !eligible(group)); assert.ok(unsupported);
  assert.throws(() => apply(source, { ...command, groupIds: [unsupported.id, groups[0].id] }), /只能組合|只能選取/);
  const merged = apply(source, command), expected = structuredClone(source); expected.map.waterGroups = structuredClone(merged.map.waterGroups);
  assert.deepEqual(merged, expected);
  const row = merged.map.waterGroups.find(item => item.id === id);
  assert.deepEqual(row.memberIds, groups.slice(0, 2).flatMap(item => item.memberIds));
  assert.deepEqual(row.baseCells, groups.slice(0, 2).flatMap(item => item.baseCells));
  assert.equal(row.showOnMinimap, false); assert.equal(merged.map.waterGroups.length, source.map.waterGroups.length - 1);
  const proof = check(merged, [command]); assert.equal(check(decodeSourceChunks(encodeSourceChunks(merged)), [command]).sourceDigest, proof.sourceDigest); checks++;
  const second = { ...command, groupIds: [id, groups[2].id], groupId: nextId };
  const third = { ...command, groupIds: [nextId, groups[3].id] };
  const twice = apply(merged, second); check(twice, [command, second]);
  assert.throws(() => check(apply(twice, third), [command, second, third]), 'deleted group identity cannot be reused, including across requests');
  assert.throws(() => check(merged, [])); assert.throws(() => check(twice, [second, command]));
  const bad = structuredClone(merged); bad.map.waterGroups.find(item => item.id === id).memberIds.push('unrecorded'); assert.throws(() => check(bad, [command])); checks++;
  for (const edit of [
    { ...command, groupId: 'foreign' }, { ...command, groupIds: [groups[0].id] },
    { ...command, groupIds: [unsupported.id, groups[0].id] },
    { ...command, groupIds: [groups[0].id, groups[0].id] }, { ...command, groupIds: [groups[0].id, 'missing'] },
    { ...command, extra: true }, { ...command, name: 'bad\ud800' }, { ...command, name: 'bad\u0085' },
    { ...command, showOnMinimap: null }, { ...command, groupIds: Array(2) },
  ]) assert.throws(() => check(merged, [edit]));
  const accessor = { ...command }; Object.defineProperty(accessor, 'groupIds', { enumerable: true, get() { getters++; return command.groupIds; } });
  assert.throws(() => check(merged, [accessor])); assert.equal(getters, 0);
  assert.equal(check(source, []).sourceDigest, capture.baselineDigest); checks++;
}
for (const [owner, capture] of [[profile, captured], [template, neutral]]) {
  const source = capture.game;
  const instances = new Map([...source.map.decorations, ...source.map.roads.flatMap(road => road.components ?? [])].map(instance => [instance.id, instance]));
  const target = source.map.waterGroups.find(group => group.memberIds.length >= 2 && group.memberIds.every(id => ['river','lake','sea'].includes(instances.get(id)?.waterClass)));
  assert.ok(target);
  const groupId = source.gameId + '#water-' + 'c'.repeat(64), mergedId = source.gameId + '#water-' + 'd'.repeat(64);
  const command = { op: 'water-split', sourceGroupId: target.id, groupId, memberIds: [target.memberIds[0]], baseCells: [], name: '拆出𠀀' };
  const apply = (game, edit) => splitWaterGroup(game, edit.sourceGroupId, edit.memberIds, edit.baseCells, edit.groupId, edit.name);
  const check = (candidate, maps) => owner === profile
    ? owner.verify(capture.capability, candidate, [], [], maps)
    : owner.verifyOrderedTemplate(capture.capability, candidate, maps.map(edit => ({ chapterEdits: [], generalEdits: [], peopleEdits: [], mapEdits: [edit] })));
  const hidden = setWaterGroupMinimapVisibility(source, target.id, false);
  const visibility = { op: 'water-visibility', groupId: target.id, showOnMinimap: false };
  const split = apply(hidden, command), expected = structuredClone(source); expected.map.waterGroups = structuredClone(split.map.waterGroups);
  assert.deepEqual(split, expected);
  const remaining = split.map.waterGroups.find(group => group.id === target.id), extracted = split.map.waterGroups.find(group => group.id === groupId);
  assert.deepEqual(remaining.memberIds, target.memberIds.slice(1)); assert.deepEqual(remaining.baseCells, target.baseCells);
  assert.deepEqual(extracted.memberIds, command.memberIds); assert.deepEqual(extracted.baseCells, []);
  assert.equal(remaining.showOnMinimap, false); assert.equal(extracted.showOnMinimap, false);
  assert.equal(split.map.waterGroups.length, source.map.waterGroups.length + 1);
  const proof = check(split, [visibility, command]);
  assert.equal(check(decodeSourceChunks(encodeSourceChunks(split)), [visibility, command]).sourceDigest, proof.sourceDigest); checks++;
  const merge = { op: 'water-merge', groupIds: [target.id, groupId], groupId: mergedId, name: '重組', showOnMinimap: false };
  const merged = mergeWaterGroups(split, merge.groupIds, merge.groupId, merge.name, merge.showOnMinimap);
  check(merged, [visibility, command, merge]);
  const reused = { ...command, sourceGroupId: mergedId };
  assert.throws(() => check(apply(merged, reused), [visibility, command, merge, reused]), 'split identity cannot be reused after merging it away');
  assert.throws(() => check(split, [])); assert.throws(() => check(split, [command, visibility]));
  const tampered = structuredClone(split); tampered.map.waterGroups.find(group => group.id === groupId).memberIds.push('unrecorded');
  assert.throws(() => check(tampered, [visibility, command])); checks++;
  const sparse = []; sparse.length = 1;
  for (const edit of [
    { ...command, sourceGroupId: 'missing' }, { ...command, groupId: 'foreign' },
    { ...command, memberIds: [] }, { ...command, memberIds: ['missing'] },
    { ...command, memberIds: [target.memberIds[0], target.memberIds[0]] },
    { ...command, memberIds: target.memberIds, baseCells: target.baseCells },
    { ...command, memberIds: null }, { ...command, memberIds: sparse },
    { ...command, baseCells: [-1] }, { ...command, baseCells: [0.5] },
    { ...command, name: 'bad\ud800' }, { ...command, name: 'bad\u0085' },
    { ...command, showOnMinimap: true }, { ...command, extra: true },
  ]) assert.throws(() => check(split, [visibility, edit]));
  const accessor = { ...command }; Object.defineProperty(accessor, 'memberIds', { enumerable: true, get() { getters++; return command.memberIds; } });
  assert.throws(() => check(split, [accessor])); assert.equal(getters, 0);
  assert.equal(check(source, []).sourceDigest, capture.baselineDigest); checks++;
}
process.stdout.write(JSON.stringify({ checks, getters, chapters: base.chapterOrder.length, scope: 'Pinned full-copy and neutral water name/visibility/explicit-member merge/split history; content-only verification, no HTTP/UI evidence from this test' }) + '\n');
