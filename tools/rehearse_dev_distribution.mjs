// One-off rehearsal for the sole pre-reader dev baseline. No --apply, no HTTP
// listener, no production config. Only the SQLite backup is ever opened writable.
import assert from 'node:assert/strict';
import { backup, DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStorage } from '../vps/sqlite-port.mjs';
import { createDiskBucket } from '../vps/disk-bucket.mjs';
import { createDistributionPublisher } from '../vps/distribution-publisher.mjs';
import { createRuntimeStager } from '../vps/runtime-stage.mjs';
import { createStaticResourceVerifier } from '../vps/static-resources.mjs';
import { parseStaticRelease } from '../vps/static-release.mjs';
import { verifyInstalledProgram } from '../vps/installed-program.mjs';
import { createPlayerService } from '../vps/player-server.mjs';
import { projectPublicationCatalog } from '../server/publicationcatalog.js';
import { FrozenPublicationProducer } from '../server/publicationproducer.js';
import { createPlayerReader } from '../web/src/player/playerclient.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';

assert.equal(process.argv.length, 2, 'rehearsal only; no target or apply option');
const dev = resolve('.dragon-analysis/basemaps-dev-store'), distRoot = resolve('dist');
assert.ok(!existsSync(join(dev, 'distribution/control/current.json')), 'existing local distribution authority: stop');
const scratch = mkdtempSync(join(tmpdir(), 'dragon-bootstrap-rehearsal-'));
const baseline = join(scratch, 'before.sqlite'), target = join(scratch, 'work.sqlite'), bucketRoot = join(scratch, 'distribution');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let storage;
try {
  // Online backup includes committed WAL pages. Keep an untouched, consistent
  // rollback image through the entire rehearsal; do not copy a live DB file.
  for (const [from,to] of [[join(dev,'editor.sqlite'),baseline],[baseline,target]]) {
    const input = new DatabaseSync(from, { readOnly:true });
    try { await backup(input,to); } finally { input.close(); }
  }
  storage = openStorage(target);
  const rows = (query,...args) => storage.sql.exec(query,...args).toArray();
  const one = (query,...args) => { const result = rows(query,...args); assert.equal(result.length,1); return result[0]; };
  assert.equal(one('PRAGMA integrity_check').integrity_check,'ok');
  assert.equal(rows('PRAGMA foreign_key_check').length,0);
  const g = one('SELECT g.game_id,g.owner_id,g.listed,g.restricted,g.current_release_id,g.next_ordinal,u.account FROM content_games g JOIN users u ON g.owner_id=u.id');
  const {game_id:gameId,current_release_id:releaseId} = g;
  const p = one('SELECT * FROM published_games'), pin = JSON.parse(p.pin_json), release = one('SELECT * FROM content_releases');
  const {ordinal,revision,sourceDigest,chapters} = pin;
  assert.deepEqual([gameId,p.game_id,g.owner_id,g.listed,g.restricted,g.next_ordinal,ordinal,chapters.length],
    [pin.gameId,pin.gameId,p.owner_id,1,0,'1.7','1.7',19]);
  assert.deepEqual([release.game_id,release.release_id,release.ordinal,release.draft_revision,release.source_digest],[gameId,releaseId,ordinal,revision,sourceDigest]);
  for (const table of ['content_deletion_fences','content_distribution_events','content_distribution_chunks','content_distribution_checkpoints','content_distribution_cleanup','game_releases']) assert.equal(one(`SELECT count(*) n FROM ${table}`).n,0,table);
  const outbox = rows('SELECT * FROM content_distribution_outbox ORDER BY ordinal'), announcements = rows('SELECT * FROM content_announcements ORDER BY ordinal');
  assert.equal(outbox.length,8); assert.equal(announcements.length,8);
  for (const [i,r] of outbox.entries()) {
    const a = announcements[i];
    assert.deepEqual([r.game_id,r.ordinal,r.state,r.attempts,r.confirmed_at,r.receipt_json],[gameId,`1.${i}`,'pending',0,null,null]);
    assert.deepEqual([a.game_id,a.ordinal,a.release_id],[gameId,r.ordinal,r.release_id]);
  }
  const a = announcements.at(-1);
  assert.deepEqual([a.release_id,a.name,a.creator_account,a.published_at],[releaseId,pin.name,g.account,release.created_at]);
  const pack = one('SELECT * FROM published_packs'), states = rows('SELECT * FROM published_pack_chapters'), assets = rows('SELECT * FROM published_pack_assets');
  assert.ok([...states,...assets].every(row=>row.game_id===gameId));
  const stateHashes = new Map(states.map(row=>[row.chapter_id,sha(row.state_json)]));
  assert.deepEqual([...stateHashes.keys()].sort(),[...chapters].sort());
  assert.equal(assets.length,6);

  const r2 = createDiskBucket({root:bucketRoot});
  const manifestBytes = readFileSync(join(distRoot,'static-release.json')), expectedDigest = sha(manifestBytes);
  const {sourceTreeDigest} = parseStaticRelease(manifestBytes,expectedDigest);
  verifyInstalledProgram({webRoot:resolve('web'),bundlePath:resolve('server/public/trialweb.txt'),expectedSourceTreeDigest:sourceTreeDigest});
  const verifyStaticResources = createStaticResourceVerifier({expectedDigest,sourceTreeDigest,readStatic(path,{maxBytes}) {
    const b=readFileSync(join(distRoot,path)); assert.ok(b.length<=maxBytes); return b;
  }});
  for (const {file,sha256} of KAO_MANIFEST) {
    const key=`kao/${file}`, b=readFileSync(join(distRoot,key)); assert.equal(sha(b),sha256); r2.putImmutable(key,b,'image/png');
  }
  const stager = createRuntimeStager({r2,verifyStaticResources}), candidate={gameId,releaseId,ordinal,draftRevision:revision,sourceDigest};
  const staged = await stager.stage(candidate,{identity:candidate,pack,chapters:states,assets},()=>{});
  const runtime = stager.verifyStaged(staged.ticket,candidate);
  assert.deepEqual(runtime.chapters,chapters);
  let publisher = createDistributionPublisher({storage,r2,verifyStaticResources});
  const {authorityId,tailGeneration,confirmedGeneration,blockedReason,enqueuePaused} = publisher.ledger.status();
  assert.deepEqual([tailGeneration,confirmedGeneration,blockedReason,enqueuePaused],[0,0,null,false]);
  assert.throws(()=>new FrozenPublicationProducer({storage}).assertPublishable(gameId),e=>e.code==='DISTRIBUTION_BOOTSTRAP_REQUIRED');
  const catalog = {version:1,games:[{gameId,listed:true,deleted:false,current:{...runtime,name:pin.name,publishedAt:pin.publishedAt,createdAt:release.created_at},
    announcements:[{releaseId,ordinal,name:a.name,creatorAccount:a.creator_account,publishedAt:a.published_at,firstOnline:{generation:1}}]}]};
  const projection = projectPublicationCatalog(catalog,{authorityId,generation:1});
  const operation = {kind:'bootstrap',operationId:randomUUID(),payload:Buffer.from(JSON.stringify({version:1,catalog,projection}))};
  const injected = new Error('rollback probe');
  for (const probe of [true,false]) {
    const commit = () => storage.transactionSync(()=>{
      assert.equal(publisher.ledger.status().tailGeneration,0);
      for (const table of ['content_distribution_outbox','content_announcements']) {
        rows(`DELETE FROM ${table} WHERE game_id=?`,gameId); assert.equal(one('SELECT changes() n').n,8);
      }
      assert.equal(publisher.ledger.enqueueInTxn(operation).generation,1);
      if (probe) throw injected;
    });
    if (probe) {
      assert.throws(commit,e=>e===injected); assert.equal(publisher.ledger.status().tailGeneration,0);
      assert.deepEqual(rows('SELECT * FROM content_distribution_outbox ORDER BY ordinal'),outbox);
      assert.deepEqual(rows('SELECT * FROM content_announcements ORDER BY ordinal'),announcements);
    } else commit();
  }
  // Simulate stopping after SQLite commit but before the bucket CAS. Restart
  // the normal publisher, not the migration, to resume the one frozen event.
  storage.close(); storage=openStorage(target);
  publisher=createDistributionPublisher({storage,r2,verifyStaticResources});
  assert.equal(publisher.ledger.status().confirmedGeneration,0);
  const confirmation=await publisher.drainOne(); assert.equal(confirmation.state,'VISIBLE_CONFIRMED');
  assert.equal((await publisher.drainOne()).state,'IDLE');
  assert.equal(publisher.ledger.status().confirmedGeneration,1);
  const producer=new FrozenPublicationProducer({storage}); producer.assertPublishable(gameId);
  // Exercise the next producer's catalog continuity without actually changing
  // listed status, publishing a fake 1.8 or claiming a new review receipt.
  assert.throws(()=>storage.transactionSync(()=>{
    rows('UPDATE content_games SET listed=0 WHERE game_id=?',gameId);
    assert.equal(producer.recordInTxn('restriction',gameId).generation,2); throw injected;
  }),e=>e===injected);
  assert.equal(publisher.ledger.status().tailGeneration,1);
  const origin='https://isolated-player.invalid', site=createPlayerService({distRoot,bucketRoot,origin,activeKey:'rehearsal',admissionKeys:JSON.stringify({rehearsal:randomBytes(32).toString('hex')})});
  const reader=createPlayerReader({origin,fetch:(url,init)=>site.fetch(new Request(url,init))});
  const registry=await reader.registry(); assert.deepEqual(registry.directory,projection.directory);
  assert.equal(registry.announcementsError,null); assert.equal(registry.announcements.length,1);
  assert.equal(registry.announcements[0].firstOnlineAt,confirmation.receipt.visibleAt);
  for (const chapterId of chapters) {
    const session=await reader.admit({gameId,chapterId,ordinal});
    try {
      assert.equal(session.identity.releaseId,releaseId); assert.equal(session.identity.sourceDigest,sourceDigest);
      assert.equal((await session.read('manifest')).sha256,sha(pack.manifest_json));
      assert.equal((await session.read(`chapter:${chapterId}`)).sha256,stateHashes.get(chapterId));
    } finally { session.close(); }
  }
  // Compare full rows incl. rowids against the untouched backup (not just row
  // counts). Do not print row bodies: the backup includes account/session data.
  rows('ATTACH DATABASE ? AS baseline',baseline);
  const names=rows("SELECT name FROM main.sqlite_schema WHERE type='table' ORDER BY name").map(r=>r.name);
  const allowed=new Set(['content_announcements','content_distribution_outbox','content_distribution_state','content_distribution_events','content_distribution_chunks']);
  for (const name of names.filter(n=>!allowed.has(n))) {
    assert.match(name,/^[a-zA-Z0-9_]+$/);
    for (const [x,y] of [['main','baseline'],['baseline','main']]) assert.equal(one(`SELECT NOT EXISTS(SELECT rowid,* FROM ${x}.${name} EXCEPT SELECT rowid,* FROM ${y}.${name}) same`).same,1,name);
  }
  assert.equal(one('PRAGMA integrity_check').integrity_check,'ok'); assert.equal(rows('PRAGMA foreign_key_check').length,0);
  console.log(JSON.stringify({mode:'scratch-backup-only',gameId,releaseId,ordinal,revision,sourceDigest,manifest:sha(pack.manifest_json),chapterBodiesVerified:chapters.length,gameAssets:assets.length,
    runtimeIndex:runtime.runtime.sha256,unchangedTables:names.length-allowed.size,legacyPending:outbox.length,legacyAnnouncements:announcements.length,visibleAnnouncements:1,
    bootstrapGeneration:1,rollback:true,restartDrain:confirmation.state,nextProducerRollback:true},null,2));
} finally { storage?.close(); rmSync(scratch,{recursive:true,force:true}); }
