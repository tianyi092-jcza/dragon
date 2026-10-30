// Owned Fetch/stream seams only; no network, browser profile or save access.
import assert from 'node:assert/strict';
import { createPlayerReader, PlayerReaderError } from '../reader/playerclient.js';
import { sha256, MAX_METADATA_BYTES } from '../reader/runtimecontract.js';
const G='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', H='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', origin='https://reader.test';
const bytes=new TextEncoder().encode('{"owned":true}'), digest=await sha256(bytes), secret='owned.signed-ticket';
const admission={gameId:G,releaseId:'r0',ordinal:'1.0',revision:'1',sourceDigest:'a'.repeat(64),name:'Owned',publishedAt:'2026-10-16T00:00:00.000Z',chapters:[G+'#c1'],chapterId:G+'#c1',manifestDigest:digest,ticket:secret,fileEndpoint:'/play-api/v1/file'};
const selected={gameId:G,ordinal:'1.0',chapterId:G+'#c1'};
const response=()=>new Response(bytes.slice(),{headers:{'content-type':'application/json','x-content-sha256':digest}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const rejectCode=(fn,code)=>assert.rejects(fn,e=>e instanceof PlayerReaderError&&e.code===code&&!String(e.stack).includes(secret));
let checks=0;
function urlOf(value){try{return new URL(value);}catch{throw new Error('invalid owned request URL');}}
function fixture(timeoutMs=1000){
 const calls=[];let next=async()=>response(),grant=()=>Response.json(admission);
 const client=createPlayerReader({origin,timeoutMs,fetch:async(url,options)=>{calls.push({url,options});return urlOf(url).pathname.endsWith('/admissions')?grant():next(url,options);}});
 return {client,calls,set:fn=>{next=fn;},grant:fn=>{grant=fn;},open:()=>client.admit(selected)};
}
for(const bad of ['http://reader.test','https://reader.test/','https://user:pw@reader.test','https://reader.test/path','https://reader.test?x=1']){assert.throws(()=>createPlayerReader({origin:bad}),TypeError);checks++;}
for(const bad of [0,-1,NaN,1.2,120001,'1000']){assert.throws(()=>createPlayerReader({origin,timeoutMs:bad}),TypeError);checks++;}
{
 const f=fixture(),session=await f.open();assert.deepEqual(Object.keys(session).sort(),['close','identity','read','state','status']);assert.ok(Object.isFrozen(session.identity.chapters));assert.ok(!JSON.stringify(session).includes(secret));
 const got=await session.read('chapter:'+selected.chapterId);assert.deepEqual(got.bytes,bytes);assert.equal(got.sha256,digest);
 for(const {url,options}of f.calls){assert.ok(!url.includes(secret));assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');}
 assert.deepEqual(f.calls[0].options.headers,{});assert.equal(urlOf(f.calls[0].url).searchParams.get('chapter'),selected.chapterId);assert.equal(f.calls[1].options.headers.Authorization,'Bearer '+secret);checks++;
 for(const role of ['chapter:other','asset:../kao/0','asset:unknown','control/current.json','manifest?token=x'])await assert.rejects(()=>session.read(role),TypeError);
 assert.equal(f.calls.length,2);checks++;
 got.bytes[0]=0;assert.deepEqual((await session.read('manifest')).bytes,bytes);assert.equal(f.calls.length,3);checks++;
 f.set(()=>Response.json({...admission,ordinal:'1.1',listed:true}));assert.equal((await session.status()).ordinal,'1.1');assert.equal(session.identity.ordinal,'1.0');assert.deepEqual(f.calls.at(-1).options.headers,{});
 f.set(()=>Response.json({gameId:G,listed:false}));assert.equal((await session.status()).listed,false);f.set(response);await session.read('manifest');assert.equal(f.calls.filter(c=>c.url.includes('/admissions?')).length,1);checks++;
 session.close();const n=f.calls.length;await rejectCode(()=>session.read('manifest'),'PLAYER_SESSION_CLOSED');assert.equal(f.calls.length,n);checks++;
}
for(const patch of [{gameId:H},{ordinal:'1.1'},{chapterId:'other'},{fileEndpoint:'https://other.test/file'},{ticket:'bad\r\nsecret'},{manifestDigest:'bad'},{chapters:['bad#id']},{releaseId:'../x'}]){
 const f=fixture();f.grant(()=>Response.json({...admission,...patch}));await rejectCode(f.open,'PLAYER_RESPONSE_INVALID');assert.equal(f.calls.length,1);checks++;
}
for(const [status,error,expected]of [[404,'NOT_FOUND','PLAYER_REQUEST_FAILED'],[503,'RUNTIME_UNAVAILABLE','RUNTIME_UNAVAILABLE'],[403,'GAME_NOT_LISTED','GAME_NOT_LISTED'],[410,'NOT_FOUND','PLAYER_REQUEST_FAILED'],[503,'GAME_DELETED','PLAYER_REQUEST_FAILED']]){
 const f=fixture(),s=await f.open();f.set(()=>Response.json({error},{status}));await rejectCode(()=>s.read('manifest'),expected);assert.equal(s.state(),'active');f.set(response);await s.read('manifest');assert.equal(f.calls.filter(c=>c.url.includes('/admissions?')).length,1);checks++;
}
{
 const f=fixture(),s=await f.open();f.set(()=>Response.json({error:'GAME_DELETED',gameId:H},{status:410}));await rejectCode(s.status,'PLAYER_REQUEST_FAILED');assert.equal(s.state(),'active');
 f.set(()=>Response.json({error:'GAME_DELETED',gameId:G},{status:410}));await rejectCode(s.status,'GAME_DELETED');assert.equal(s.state(),'deleted');const n=f.calls.length;await rejectCode(()=>s.read('manifest'),'GAME_DELETED');assert.equal(f.calls.length,n);checks++;
}
{
 const f=fixture(),s=await f.open();f.set(()=>Response.json({error:'GAME_DELETED'},{status:410}));await rejectCode(()=>s.read('manifest'),'GAME_DELETED');assert.equal(s.state(),'deleted');checks++;
}
for(const headers of [{'content-type':'image/png','x-content-sha256':digest},{'content-type':'application/json','x-content-sha256':'b'.repeat(64)},{'content-type':'application/json'},{'content-type':'application/json','x-content-sha256':digest,'content-length':String(MAX_METADATA_BYTES+1)}]){
 const f=fixture(),s=await f.open();f.set(()=>new Response(bytes,{headers}));await rejectCode(()=>s.read('manifest'),'PLAYER_RESPONSE_INVALID');assert.equal(s.state(),'active');checks++;
}
{
 const f=fixture(),s=await f.open(),other=new TextEncoder().encode('{"different":true}');f.set(async()=>new Response(other,{headers:{'content-type':'application/json','x-content-sha256':await sha256(other)}}));await rejectCode(()=>s.read('manifest'),'PLAYER_RESPONSE_INVALID');checks++;
}
{
 const f=fixture(),s=await f.open();let cancelled=false;
 f.set(()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_METADATA_BYTES+1));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json','x-content-sha256':digest}}));
 await rejectCode(()=>s.read('manifest'),'PLAYER_RESPONSE_INVALID');assert.equal(cancelled,true);checks++;
}
{
 const f=fixture(),s=await f.open(),gate=deferred();f.set(()=>gate.promise);const pending=s.read('manifest');s.close();gate.resolve(response());await rejectCode(()=>pending,'PLAYER_SESSION_CLOSED');checks++;
}
{
 const f=fixture(),s=await f.open(),gate=deferred();f.set(()=>gate.promise);const pending=s.read('manifest');f.set(()=>Response.json({error:'GAME_DELETED',gameId:G},{status:410}));await rejectCode(s.status,'GAME_DELETED');gate.resolve(response());await rejectCode(()=>pending,'GAME_DELETED');checks++;
}
{
 const f=fixture(),s=await f.open();f.set(()=>{throw new Error(secret);});await rejectCode(()=>s.read('manifest'),'PLAYER_NETWORK_UNAVAILABLE');assert.equal(s.state(),'active');checks++;
}
{
 const f=fixture(25),s=await f.open();let cancelled=false;f.set(()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}}));await rejectCode(()=>s.read('manifest'),'PLAYER_TIMEOUT');assert.equal(cancelled,true);assert.equal(s.state(),'active');checks++;
}
{
 const f=fixture(25),s=await f.open(),gate=deferred();let cancelled=false;f.set(()=>gate.promise);await rejectCode(()=>s.read('manifest'),'PLAYER_TIMEOUT');gate.resolve(new Response(new ReadableStream({cancel(){cancelled=true;}})));await new Promise(r=>setImmediate(r));assert.equal(cancelled,true);checks++;
}
{
 const f=fixture(),s=await f.open();await s.read('manifest');
 assert.ok(f.calls.every(call=>!call.options.signal.aborted),'completed bodies must not be aborted');
 f.set(()=>Response.json({error:'RUNTIME_UNAVAILABLE'},{status:503}));await rejectCode(()=>s.read('manifest'),'RUNTIME_UNAVAILABLE');
 assert.equal(f.calls.at(-1).options.signal.aborted,false,'consumed error bodies also finish without abort');checks++;
}
{
 const f=fixture(),s=await f.open();
 f.set(()=>Response.json({gameId:G,listed:false,currentRelease:{releaseId:'r1',ordinal:'1.1'}}));
 assert.deepEqual((await s.status()).currentRelease,{releaseId:'r1',ordinal:'1.1'});assert.equal(s.state(),'active');
 f.set(()=>Response.json({gameId:G,listed:false,currentRelease:{releaseId:'r1',ordinal:'bad'}}));await rejectCode(s.status,'PLAYER_RESPONSE_INVALID');assert.equal(s.state(),'active');checks++;
 f.set(()=>Response.json({error:'RELEASE_CHANGED'},{status:503}));await rejectCode(()=>s.read('manifest'),'RELEASE_CHANGED');assert.equal(s.state(),'active');
 f.set(()=>Response.json({error:'RELEASE_CHANGED'},{status:409}));await rejectCode(()=>s.read('manifest'),'RELEASE_CHANGED');assert.equal(s.state(),'outdated');
 const count=f.calls.length;await rejectCode(s.status,'RELEASE_CHANGED');await rejectCode(()=>s.read('manifest'),'RELEASE_CHANGED');assert.equal(f.calls.length,count);checks++;
}
{
 const f=fixture(),notice={gameId:G,ordinal:'1.0',announcementId:G+':1.0',name:'Owned',creatorAccount:'owner',publishedAt:admission.publishedAt,firstOnlineAt:admission.publishedAt};
 const page={generation:1,digest:'c'.repeat(64),directory:[admission],announcements:[notice],announcementPage:{reset:false,nextCursor:'owned-next'}};
 f.set(()=>Response.json(page));const first=await f.client.registry({announcementCursor:null});
 assert.equal(first.announcementsError,null);assert.equal(first.announcements[0].announcementId,notice.announcementId);assert.ok(Object.isFrozen(first.announcementPage));assert.equal(urlOf(f.calls.at(-1).url).searchParams.get('announcementPage'),'1');checks++;
 for(const bad of [{...page,announcementPage:{reset:false,nextCursor:'owned-next'}},{...page,announcementPage:null},{...page,announcementPage:{reset:false,nextCursor:null},announcements:[{...notice,announcementId:'position-0'}]}]){
  f.set(()=>Response.json(bad));const result=await f.client.registry({announcementCursor:'owned-next'});
  assert.equal(result.directory.length,1);assert.equal(result.announcementsError,'ANNOUNCEMENTS_UNAVAILABLE');assert.equal(result.announcementPage,null);assert.deepEqual(result.announcements,[]);checks++;
 }
 const count=f.calls.length;await assert.rejects(()=>f.client.registry({announcementCursor:'x'.repeat(1025)}),TypeError);assert.equal(f.calls.length,count);checks++;
}
process.stdout.write(JSON.stringify({checks,scope:'Owned transport and streams; no browser, engine, storage or network proof'})+'\n');
