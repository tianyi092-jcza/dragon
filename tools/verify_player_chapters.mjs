// Presentation/admission ports only; no engine, IDB, sockets or real game data.
import assert from 'node:assert/strict';
import { loadPlayerChapters, admitPlayerChapter } from '../web/src/player/playerchapters.js';
import { sha256 } from '../web/src/player/runtimecontract.js';
const G='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',R='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',D='c'.repeat(64);
const selection={gameId:G,releaseId:R,ordinal:'1.0',revision:'1',sourceDigest:D,name:'Owned',publishedAt:'2037-01-01T00:00:00.000Z',chapters:[G+'#one',G+'#two']};
let checks=0;
async function fixture(era){
 const calls=[],sessions=[],bodies=selection.chapters.map((_chapterId,i)=>({name:i===0?'<img src=x onerror=owned()>':'第二章',start:{year:era===undefined?184+i:1+i,month:1,day:1,...(era===undefined?{}:{era})},privateField:'not retained'}));
 const replies=await Promise.all(bodies.map(async body=>{const bytes=new TextEncoder().encode(JSON.stringify(body));return{bytes,sha256:await sha256(bytes),contentType:'application/json'};}));
 const f={calls,sessions,bodies,replies,admitHook:null,readHook:null,statusHook:null};
 f.reader={async admit(request){calls.push(['admit',structuredClone(request)]);const index=selection.chapters.indexOf(request.chapterId);let state='active';const s={identity:{...structuredClone(selection),chapterId:request.chapterId,manifestDigest:D},state:()=>state,close(){state='closed';calls.push(['close',request.chapterId]);},async read(role){calls.push(['read',role]);return f.readHook?f.readHook(index,s):replies[index];}};sessions.push(s);if(f.admitHook)await f.admitHook(s,index);return s;},async status(id){calls.push(['status',id]);return f.statusHook?f.statusHook():{...structuredClone(selection),listed:true};}};
 return f;
}
const invalid=e=>['PLAYER_SELECTION_CHANGED','PLAYER_CHAPTER_PREVIEW_INVALID'].includes(e?.code)||e instanceof TypeError;
for(const patch of [{gameId:'bad'},{chapters:[]},{chapters:[selection.chapters[0],selection.chapters[0]]},{chapters:['other#chapter']},{name:3},{manifestDigest:'bad'}]){const f=await fixture();await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection:{...selection,...patch}}));assert.deepEqual(f.calls,[]);checks++;}
for(const args of [{reader:{}},{reader:{admit(){}}},{assertCurrent:1}]){const f=await fixture();await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection,...args}));assert.deepEqual(f.calls,[]);checks++;}
{
 // pi-lens-ignore: no-array-reverse-mutation-js
 const f=await fixture(),input=structuredClone(selection),pending=loadPlayerChapters({reader:f.reader,selection:input});input.name='mutated';input.chapters.reverse();const result=await pending;
 assert.deepEqual(result.chapters,f.bodies.map((b,i)=>({chapterId:selection.chapters[i],name:b.name,start:b.start})));assert.equal(result.selection.name,'Owned');assert.equal(result.selection.manifestDigest,D);
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.selection)&&Object.isFrozen(result.chapters)&&result.chapters.every(c=>Object.isFrozen(c)&&Object.isFrozen(c.start)));
 assert.equal(f.sessions.length,2);assert.ok(f.sessions.every(s=>s.state()==='closed'));assert.equal(f.calls.filter(c=>c[0]==='read').length,2);assert.equal(f.calls.at(-1)[0],'status');checks++;
 const final=await admitPlayerChapter({reader:f.reader,selection:result.selection,chapterId:selection.chapters[1]});assert.equal(final.state(),'active');assert.notEqual(final,f.sessions[1]);assert.equal(f.sessions.length,3);assert.equal(f.calls.at(-1)[0],'admit');final.close();checks++;
 const again=await loadPlayerChapters({reader:f.reader,selection:result.selection});assert.deepEqual(again,result);checks++;
}
// pi-lens-ignore: no-array-reverse-mutation-js
for(const mutate of [s=>{s.identity.releaseId=G;},s=>{s.identity.ordinal='1.1';},s=>{s.identity.sourceDigest='e'.repeat(64);},s=>s.identity.chapters.reverse(),s=>{s.identity.chapterId=selection.chapters[1];},s=>{s.identity.manifestDigest='bad';},s=>s.close()]){const f=await fixture();f.admitHook=mutate;await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection}),invalid);assert.ok(f.sessions.every(s=>s.state()==='closed'));assert.equal(f.calls.some(c=>c[0]==='read'),false);checks++;}
{
 const f=await fixture();f.admitHook=(s,i)=>{if(i===1)s.identity.manifestDigest='e'.repeat(64);};await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection}),invalid);assert.ok(f.sessions.every(s=>s.state()==='closed'));assert.equal(f.calls.filter(c=>c[0]==='read').length,1);checks++;
}
for(const patch of [{contentType:'text/plain'},{sha256:'e'.repeat(64)},{bytes:new Uint8Array()},{bytes:new Uint8Array([255])}]){const f=await fixture();f.readHook=()=>({...f.replies[0],...patch});await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection}),invalid);assert.equal(f.sessions[0].state(),'closed');assert.equal(f.calls.some(c=>c[0]==='status'),false);checks++;}
for(const body of [null,[],{}, {name:'',start:{year:1,month:1,day:1}},{name:'x',start:{year:1.5,month:1,day:1}},{name:'x',start:{year:1,month:1}}]){const f=await fixture(),bytes=new TextEncoder().encode(JSON.stringify(body));f.readHook=async()=>({bytes,sha256:await sha256(bytes),contentType:'application/json'});await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection}),invalid);assert.equal(f.sessions[0].state(),'closed');checks++;}
for(const value of [{listed:false},{...selection,listed:true,ordinal:'1.1'},{...selection,listed:true,releaseId:G}]){const f=await fixture();f.statusHook=()=>value;await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection}),invalid);assert.ok(f.sessions.every(s=>s.state()==='closed'));checks++;}
for(const stage of ['admit','read','status']){const f=await fixture(),error=new Error('owned network error');if(stage==='admit')f.reader.admit=async()=>{throw error;};else f[stage+'Hook']=()=>{throw error;};await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection}),e=>e===error);assert.ok(f.sessions.every(s=>s.state()==='closed'));checks++;}
for(const stage of ['before','admit','read','status']){const f=await fixture(),error=new DOMException('owned superseded','AbortError');let cancelled=stage==='before';if(stage==='admit')f.admitHook=()=>{cancelled=true;};if(stage==='read')f.readHook=()=>{cancelled=true;return f.replies[0];};if(stage==='status')f.statusHook=()=>{cancelled=true;return{...selection,listed:true};};await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection,assertCurrent(){if(cancelled)throw error;}}),e=>e===error);assert.ok(f.sessions.every(s=>s.state()==='closed'));if(stage==='before')assert.deepEqual(f.calls,[]);checks++;}
{
 const f=await fixture();await assert.rejects(()=>admitPlayerChapter({reader:f.reader,selection,chapterId:'other'}),TypeError);assert.deepEqual(f.calls,[]);
 let cancelled=false;f.admitHook=()=>{cancelled=true;};await assert.rejects(()=>admitPlayerChapter({reader:f.reader,selection,chapterId:selection.chapters[0],assertCurrent(){if(cancelled)throw new Error('cancelled');}}),/cancelled/);assert.equal(f.sessions[0].state(),'closed');checks++;
}
{
 const f=await fixture(),preview=await loadPlayerChapters({reader:f.reader,selection});f.admitHook=s=>{s.identity.ordinal='1.1';s.identity.releaseId=G;};await assert.rejects(()=>admitPlayerChapter({reader:f.reader,selection:preview.selection,chapterId:selection.chapters[0]}),invalid);assert.ok(f.sessions.every(s=>s.state()==='closed'));checks++;
}
{
 const f=await fixture();
 f.readHook=async i=>{const bytes=new TextEncoder().encode(JSON.stringify({...f.bodies[i],chapterNumber:['1','17'][i],name:['黃巾之亂','呂布歸天'][i]}));return {bytes,sha256:await sha256(bytes),contentType:'application/json'};};
 const result=await loadPlayerChapters({reader:f.reader,selection});
 assert.deepEqual(result.chapters.map(row=>row.name),['第1章  黃巾之亂','第17章  呂布歸天']);checks++;
}
for (const era of ['bc', 'ad']) {
 const f=await fixture(era), preview=await loadPlayerChapters({reader:f.reader,selection});
 assert.deepEqual(preview.chapters.map(row=>row.start),f.bodies.map(body=>body.start));
 const catalog=async()=>({...selection,chapters:f.bodies.map((body,index)=>({chapterId:selection.chapters[index],name:body.name,start:body.start,factions:[]}))});
 f.calls.length=0;
 const listed=await loadPlayerChapters({reader:f.reader,selection,catalog});
 assert.deepEqual(listed.chapters.map(row=>row.start),f.bodies.map(body=>body.start));
 assert.equal(f.calls.some(call=>call[0]==='admit'),false,'valid era catalog must not fall back to previews');
 checks++;
}
for (const start of [{era:'bc',year:0,month:1,day:1},{era:'unknown',year:1,month:1,day:1},{era:null,year:1,month:1,day:1}]) {
 const f=await fixture(),bytes=new TextEncoder().encode(JSON.stringify({name:'bad date',start}));
 f.readHook=async()=>({bytes,sha256:await sha256(bytes),contentType:'application/json'});
 await assert.rejects(()=>loadPlayerChapters({reader:f.reader,selection}),invalid);
 assert.ok(f.sessions.every(session=>session.state()==='closed'));checks++;
}
process.stdout.write(JSON.stringify({checks,scope:'Owned reader ports and bounded real JSON/SHA only; preview does not certify playable rules or supply a reusable gameplay ticket.'})+'\n');
