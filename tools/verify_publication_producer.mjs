// Two-game SQL transaction/retention probes. Direct seeded authority rows and
// staged-runtime DTO are explicit seams; actual HTTP/compiler proof is separate.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
register('../vps/text-loader.mjs',import.meta.url);
const {openStorage}=await import('../vps/sqlite-port.mjs');
const {GameMetadataStore}=await import('../server/metadata.js');
const {PublishedGames}=await import('../server/published.js');
const {ReleaseLedger}=await import('../server/releases.js');
const {AnnouncementStore}=await import('../server/announcements.js');
const {DistributionOutbox}=await import('../server/distribution.js');
const {FrozenPublicationProducer}=await import('../server/publicationproducer.js');
const {FrozenDistributionLedger}=await import('../server/distributionledger.js');
const {inspectFrozenGameReferences}=await import('../server/deletionfrozenrefs.js');
const G='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',H='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',digest='a'.repeat(64),time='2026-10-15T00:00:00.000Z';
const storage=openStorage(':memory:'),sql=storage.sql;let groups=0;
try{
 sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT, role TEXT, epoch INTEGER, must_change INTEGER)');sql.exec("INSERT INTO users VALUES('owner','owned','author',1,0)");
 const principal=()=>({id:'owner',account:'owned',role:'author',epoch:1,must_change:0});
 const games=new GameMetadataStore({storage,principal});new PublishedGames({storage,principal});new ReleaseLedger({storage,principal,games});new AnnouncementStore({storage});new DistributionOutbox({storage});
 for(const id of [G,H])sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,'owner','draft','',null,null,'1','1',null,'0',0,0,time,time);
 let producer=new FrozenPublicationProducer({storage});
 const ledger=new FrozenDistributionLedger({storage,verifyReceipt:()=>{throw new Error('no receipt trust');}});
 const payload=n=>JSON.parse(new TextDecoder().decode(ledger.entry(n).payload));
 const snapshot=()=>['content_games','content_releases','published_games','content_distribution_state','content_distribution_events','content_distribution_chunks'].map(t=>sql.exec(`SELECT * FROM ${t} ORDER BY rowid`).toArray());
 function publish(id){
  const releaseId=randomUUID(),runtime={gameId:id,releaseId,ordinal:'1.0',revision:'1',sourceDigest:digest,chapters:[id+'#chapter'],runtime:{key:`artifacts/${id}/1.0/${releaseId}/runtime-${digest}.json`,sha256:digest,byteLength:1}};
  return storage.transactionSync(()=>{sql.exec('UPDATE content_games SET current_release_id=?,next_ordinal=? WHERE game_id=?',releaseId,'1.0',id);sql.exec('INSERT INTO content_releases VALUES(?,?,?,?,?,?)',id,releaseId,'1.0','1',digest,time);sql.exec('INSERT INTO published_games VALUES(?,?,?,?)',id,'owner',JSON.stringify({gameId:id,ordinal:'1.0',revision:'1',sourceDigest:digest,chapters:runtime.chapters,name:'secret-'+id,publishedAt:time}),time);return producer.recordInTxn('publish',id,runtime);});
 }
 for(const poison of [()=>sql.exec('UPDATE content_games SET listed=1 WHERE game_id=?',H),()=>sql.exec('UPDATE content_games SET current_release_id=? WHERE game_id=?',randomUUID(),H),()=>sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)',H,'owner','owner','1','2',time)]){
  poison();const before=snapshot();try{assert.throws(()=>publish(G),e=>e.code==='DISTRIBUTION_BOOTSTRAP_REQUIRED');assert.deepEqual(snapshot(),before);}finally{sql.exec('UPDATE content_games SET listed=0,current_release_id=NULL WHERE game_id=?',H);sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?',H);}groups++;
 }
 producer.assertPublishable(G);publish(G);const first=Buffer.from(ledger.entry(1).payload);assert.deepEqual(payload(1).projection.directory,[]);groups++;
 assert.throws(()=>producer.assertPublishable(G),e=>e.code==='DISTRIBUTION_GAME_PENDING');producer.assertPublishable(H);publish(H);assert.equal(ledger.status().tailGeneration,2);assert.equal(payload(2).catalog.games.length,2);assert.deepEqual(payload(2).projection.directory,[]);assert.deepEqual(Buffer.from(ledger.entry(1).payload),first);groups++;
 storage.transactionSync(()=>{sql.exec('UPDATE content_games SET listed=1 WHERE game_id=?',H);producer.recordInTxn('listing',H);});
 const third=payload(3);assert.deepEqual(third.projection.directory.map(r=>r.gameId),[H]);assert.equal(third.catalog.games.find(g=>g.gameId===G).current.gameId,G);assert.equal(JSON.stringify(third.projection).includes('secret-'+G),false);groups++;
 producer=new FrozenPublicationProducer({storage});
 storage.transactionSync(()=>{sql.exec('UPDATE content_games SET listed=1 WHERE game_id=?',G);producer.recordInTxn('listing',G);});
 assert.deepEqual(payload(4).projection.directory.map(r=>r.gameId),[G,H]);
 const h=payload(4).catalog.games.find(g=>g.gameId===H).announcements[0];assert.equal(h.firstOnline.generation,3);assert.equal(h.firstOnline.operationDigest,ledger.entry(3).operationDigest);groups++;
 const before=snapshot();sql.exec("CREATE TRIGGER owned_abort BEFORE INSERT ON content_distribution_chunks BEGIN SELECT RAISE(ABORT,'owned chunk fault'); END");
 try{assert.throws(()=>storage.transactionSync(()=>{sql.exec('UPDATE content_games SET listed=0,restricted=1 WHERE game_id=?',G);producer.recordInTxn('restriction',G);}));}finally{sql.exec('DROP TRIGGER owned_abort');}
 assert.deepEqual(snapshot(),before);groups++;
 storage.transactionSync(()=>{sql.exec('UPDATE content_games SET listed=0,restricted=1 WHERE game_id=?',G);producer.recordInTxn('restriction',G);});
 assert.deepEqual(payload(5).projection.directory.map(r=>r.gameId),[H]);assert.equal(payload(5).catalog.games.find(g=>g.gameId===G).announcements.length,1);groups++;
 sql.exec("INSERT INTO content_distribution_outbox VALUES('owned-legacy',?,?,?,'pending',0,?,NULL,NULL)",G,'1.0',randomUUID(),time);
 try{assert.throws(()=>producer.assertPublishable(H),e=>e.code==='DISTRIBUTION_BOOTSTRAP_REQUIRED');assert.throws(()=>storage.transactionSync(()=>producer.recordInTxn('restriction',G)),e=>e.code==='DISTRIBUTION_BOOTSTRAP_REQUIRED');}finally{sql.exec("DELETE FROM content_distribution_outbox WHERE op_id='owned-legacy'");}groups++;
 for(const fault of [()=>sql.exec('UPDATE content_games SET listed=0 WHERE game_id=?',H),()=>sql.exec('DELETE FROM published_games WHERE game_id=?',H)]){
  const before=snapshot();assert.throws(()=>storage.transactionSync(()=>{fault();producer.recordInTxn('restriction',G);}),e=>e.code==='DISTRIBUTION_AUTHORITY_CORRUPT');assert.deepEqual(snapshot(),before);groups++;
 }
 const saved=sql.exec('SELECT bytes FROM content_distribution_chunks WHERE generation=5 AND part=0').toArray()[0].bytes;
 sql.exec('UPDATE content_distribution_chunks SET bytes=? WHERE generation=5 AND part=0',new Uint8Array([1]));
 try{assert.throws(()=>storage.transactionSync(()=>producer.recordInTxn('restriction',G)),e=>e.code==='DISTRIBUTION_LEDGER_CORRUPT');}finally{sql.exec('UPDATE content_distribution_chunks SET bytes=? WHERE generation=5 AND part=0',saved);}groups++;
 const beforeInspection=snapshot(), refs=inspectFrozenGameReferences(ledger,G);
 assert.deepEqual(refs.entries.map(row=>row.generation),[1,2,3,4,5]);
 assert.equal(refs.entries[1].eventTargetsGame,false);assert.equal(refs.entries[1].containsContent,true);
 assert.equal(refs.entries[2].otherGameCount,1);assert.equal(refs.runtimeReferences.length,1);assert.ok(refs.runtimeReferences[0].key.startsWith('artifacts/'+G+'/'));
 assert.equal(refs.deleteAllowed,false);assert.equal(refs.physicalCleanupProven,false);
 assert.equal(JSON.stringify(refs).includes('secret-'),false);assert.deepEqual(snapshot(),beforeInspection);groups++;
 assert.equal(refs.catalogRuntimeReferences.length,2);
 assert.deepEqual(refs.catalogRuntimeReferences.map(ref=>ref.gameId),[G,H]);
 for(const ref of refs.catalogRuntimeReferences){assert.deepEqual(Object.keys(ref).sort(),['byteLength','gameId','key','sha256']);assert.ok(ref.key.startsWith('artifacts/'+ref.gameId+'/'));}
 const absent=inspectFrozenGameReferences(ledger,'cccccccc-cccc-4ccc-accc-cccccccccccc');
 assert.deepEqual(absent.entries,[]);assert.deepEqual(absent.runtimeReferences,[]);assert.deepEqual(absent.catalogRuntimeReferences,refs.catalogRuntimeReferences);
 assert.throws(()=>inspectFrozenGameReferences(ledger,G,{maxRuntimeReferences:1}),e=>e.code==='DELETE_FROZEN_RUNTIME_BUDGET');
 for(const limit of [0,-1,1.5,100001])assert.throws(()=>inspectFrozenGameReferences(ledger,G,{maxRuntimeReferences:limit}),TypeError);
 assert.deepEqual(snapshot(),beforeInspection);groups++;
 assert.throws(()=>inspectFrozenGameReferences(ledger,G,{maxGenerations:4}),e=>e.code==='DELETE_FROZEN_SCAN_BUDGET');
 for(const limit of [0,-1,1.5,1001])assert.throws(()=>inspectFrozenGameReferences(ledger,G,{maxGenerations:limit}),TypeError);
 assert.deepEqual(snapshot(),beforeInspection);groups++;
 storage.transactionSync(()=>{sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)',G,'owner','owner','1','2',time);sql.exec('DELETE FROM published_games WHERE game_id=?',G);producer.recordInTxn('delete-fence',G);});
 const afterFence=snapshot(), fencedRefs=inspectFrozenGameReferences(ledger,G);
 assert.deepEqual(fencedRefs.entries.filter(row=>row.containsContent).map(row=>row.generation),[1,2,3,4,5]);
 assert.equal(fencedRefs.entries.at(-1).deletedMarker,true);assert.equal(fencedRefs.entries.at(-1).containsContent,false);
 assert.equal(fencedRefs.entries.at(-1).otherGameCount,1);assert.deepEqual(snapshot(),afterFence);groups++;
 assert.deepEqual(fencedRefs.catalogRuntimeReferences,refs.catalogRuntimeReferences,'historical runtime references survive a later minimal deletion marker');
 assert.deepEqual(fencedRefs.headRuntimeReferences,refs.catalogRuntimeReferences.filter(ref=>ref.gameId===H));
 assert.deepEqual(fencedRefs.historicalOnlyRuntimeReferences,refs.catalogRuntimeReferences.filter(ref=>ref.gameId===G));
 assert.equal(ledger.status().confirmedGeneration,0,'local head is not a confirmed remote retirement');
 const headHash=fencedRefs.headRuntimeReferences[0].sha256;
 fencedRefs.headRuntimeReferences[0].sha256='0'.repeat(64);
 assert.equal(fencedRefs.catalogRuntimeReferences.find(ref=>ref.gameId===H).sha256,headHash);
 assert.equal(inspectFrozenGameReferences(ledger,G).headRuntimeReferences[0].sha256,headHash);
 assert.equal(fencedRefs.deleteAllowed,false);assert.deepEqual(snapshot(),afterFence);groups++;
 fencedRefs.catalogRuntimeReferences[0].sha256='f'.repeat(64);
 assert.deepEqual(inspectFrozenGameReferences(ledger,G).catalogRuntimeReferences,refs.catalogRuntimeReferences);
 assert.deepEqual(snapshot(),afterFence);groups++;
 const originalChunk=sql.exec('SELECT bytes FROM content_distribution_chunks WHERE generation=1 AND part=0').toArray()[0].bytes;
 sql.exec('UPDATE content_distribution_chunks SET bytes=? WHERE generation=1 AND part=0',new Uint8Array([1]));
 try{assert.throws(()=>inspectFrozenGameReferences(ledger,G),e=>e.code==='DISTRIBUTION_LEDGER_CORRUPT');}
 finally{sql.exec('UPDATE content_distribution_chunks SET bytes=? WHERE generation=1 AND part=0',originalChunk);}
 assert.deepEqual(snapshot(),afterFence);groups++;
 // Conflicting descriptors for another game's historical index also fail.
 // Both original payloads are unlisted, so their public projection is unchanged.
 const crossStore=openStorage(':memory:');try{
  const crossLedger=new FrozenDistributionLedger({storage:crossStore,verifyReceipt:()=>{throw new Error('unused');}});
  const original=payload(2),changed=payload(2);changed.catalog.games.find(game=>game.gameId===G).current.runtime.byteLength++;
  crossStore.transactionSync(()=>crossLedger.enqueueInTxn({operationId:randomUUID(),kind:'publish',gameId:H,payload:Buffer.from(JSON.stringify(original))}));
  delete changed.runtime;
  crossStore.transactionSync(()=>crossLedger.enqueueInTxn({operationId:randomUUID(),kind:'listing',gameId:G,payload:Buffer.from(JSON.stringify(changed))}));
  assert.throws(()=>inspectFrozenGameReferences(crossLedger,H),e=>e.code==='DELETE_FROZEN_REFERENCE_INVALID');
  assert.equal(crossLedger.status().tailGeneration,2);
 }finally{crossStore.close();}groups++;
 // A valid ledger digest alone is not a recognized publication envelope.
 for(const mutate of [p=>{p.extra='unclassified';},p=>{p.projection.extra='unclassified';},p=>{p.catalog.games[0].extra='unclassified';},null]){
  const isolated=openStorage(':memory:');try{
   const other=new FrozenDistributionLedger({storage:isolated,verifyReceipt:()=>{throw new Error('unused');}});
   const malformed=payload(2);if(mutate)mutate(malformed);
   isolated.transactionSync(()=>other.enqueueInTxn({operationId:randomUUID(),kind:'publish',gameId:H,payload:Buffer.from(JSON.stringify(malformed))}));
   if(mutate)assert.throws(()=>inspectFrozenGameReferences(other,G));
   else assert.equal(inspectFrozenGameReferences(other,G).entries[0].containsContent,true);
  }finally{isolated.close();}
 }
 groups++;
 for(const encode of [text=>text.replace('"version":1','"version":0,"version":1'),text=>' '+text]){
  const isolated=openStorage(':memory:');try{
   const other=new FrozenDistributionLedger({storage:isolated,verifyReceipt:()=>{throw new Error('unused');}});
   isolated.transactionSync(()=>other.enqueueInTxn({operationId:randomUUID(),kind:'publish',gameId:H,payload:Buffer.from(encode(JSON.stringify(payload(2))))}));
   assert.throws(()=>inspectFrozenGameReferences(other,G),e=>e.code==='DELETE_FROZEN_REFERENCE_INVALID');
  }finally{isolated.close();}
 }
 groups++;
 ledger.block('REMOTE_AHEAD');assert.throws(()=>producer.assertPublishable(H),e=>e.code==='DISTRIBUTION_RECOVERY_REQUIRED');assert.throws(()=>storage.transactionSync(()=>producer.recordInTxn('restriction',G)),e=>e.code==='DISTRIBUTION_RECOVERY_REQUIRED');groups++;
 assert.equal(ledger.status().tailGeneration,6);assert.equal(ledger.status().confirmedGeneration,0);assert.deepEqual(Buffer.from(ledger.entry(1).payload),first);
 process.stdout.write(`publication producer: ${groups} groups passed (two-game SQL seams, no R2)\n`);
}finally{storage.close();}
