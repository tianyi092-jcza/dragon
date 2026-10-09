// Read-only current Web fixture, no DOS/save/profile/network/native storage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { createContentCatalog } from '../web/src/content/catalog.js';
import { createWorldResources } from '../web/src/game/worldresources.js';
import { createNewGameScenario } from '../web/src/game/world.js';
import { prepareScenario } from '../web/src/game/scenarioassembly.js';
import { snapshotState } from '../web/src/game/savegame.js';
import { Clock } from '../web/src/game/clock.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';
const root = new URL('../', import.meta.url), hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function gameSaveFixture() {
  const prefix = 'web/content/builtin/compiled/' + BUILTIN_RESOURCES.world.revision + '/', inputHashes = {}, files = new Map(), requests = [];
  function read(name) { const path = prefix + name, bytes = readFileSync(new URL(path, root)); inputHashes[path] = hash(bytes); return bytes; }
  function parse(bytes) { try { return JSON.parse(bytes.toString('utf8')); } catch (cause) { throw new TypeError('bad game-save fixture JSON', { cause }); } }
  const manifestBytes = read('manifest.json'), manifest = parse(manifestBytes); assert.equal(manifest.assets.length, 38);
  for (const name of ['data.json','catalog.json','world-definition.json','terrain.bin','roads.json','road_cost.bin','road_offset.json']) {
    const row = manifest.assets.find(asset => asset.path === name); assert.ok(row); const bytes = read(name);
    assert.equal(row.url, prefix.slice(4) + name); assert.equal(bytes.length, row.byteLength); assert.equal(hash(bytes), row.sha256); files.set(row.url, bytes);
  }
  const definition = parse(files.get(prefix.slice(4) + 'world-definition.json')), data = parse(files.get(prefix.slice(4) + 'data.json'));
  assert.deepEqual(definition, BUILTIN_RESOURCES.world); assert.equal(data.scenarios.length, 20);
  const content = createContentCatalog(parse(files.get(prefix.slice(4) + 'catalog.json')), data), allowed = [definition.assets.terrain,definition.assets.roadGraph,definition.assets.roadCost,definition.assets.roadOffset];
  const context = () => ({ data, content, world: createWorldResources(definition) });
  const fetch = async input => { const url = String(input); assert.ok(allowed.includes(url)); requests.push(url); assert.ok(files.has(url)); return new Response(files.get(url)); };
  async function snapshot(idx) {
    const ctx = context(), raw = createNewGameScenario(content.chapter(idx).template); raw.player_faction = raw.factions[0].idx;
    const ready = await prepareScenario({raw,idx,mode:'fresh',...ctx}), scenario = ready.scenario;
    const clock = new Clock({startYear:scenario.start.year,startMonth:scenario.start.month,startDay:scenario.start.day}), originalRng = createOriginalBattleRng({ch:1,cl:2,dh:3});
    const app = {...ctx,scenario,scenarioIdx:idx,clock,originalRng}, saved = snapshotState(app,0,'工程備份夾具');
    return {app,saved};
  }
  function verify() { for (const [path, digest] of Object.entries(inputHashes)) assert.equal(hash(readFileSync(new URL(path,root))), digest, path); }
  return {snapshot,context,fetch,verify,inputHashes,requests,manifestDigest:hash(manifestBytes)};
}
