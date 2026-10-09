// Pending date candidate -> actual App/Clock/render; only owned loopback,
// fresh contexts and immutable bytes. No adoption/title repository/save IO.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {startBrowserTestServer} from './browser_test_server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),[first,second,round]=process.argv.slice(2);
assert.equal(process.argv.length,5);for(const value of[first,second,round])assert.match(value??'',/^[A-Za-z0-9-]{1,64}$/);assert.equal(new Set([first,second,round]).size,3);
const base='.dragon-analysis/editor-phase/',sourceHashes={},sha=b=>createHash('sha256').update(b).digest('hex');
function read(p){assert.ok(!/save\.dat/i.test(p));const bytes=readFileSync(join(root,p));sourceHashes[p]=sha(bytes);return bytes;}
function json(b){try{return JSON.parse(b.toString('utf8'));}catch(cause){throw new TypeError('invalid bound date App fixture',{cause});}}
const oldPrefix=`content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`,oldManifest=json(read('web/'+oldPrefix+'manifest.json'));
const oldAllowed=['web/'+oldPrefix+'manifest.json',...oldManifest.assets.map(e=>'web/'+oldPrefix+e.path),'web/'+BUILTIN_ENTITY_SOURCE.manifestURL,'web/'+BUILTIN_ENTITY_SOURCE.resourceURL,'../Dragon/KI.EXE'];
const producerTools=['tools/stage_editor_date_candidate.mjs','tools/editor_builtin_source.mjs','tools/editor_entity_source.mjs','web/src/content/builtinresources.generated.js','web/src/editor/builtinentitysource.generated.js','web/src/editor/entitysource.js','web/src/content/authoring/gamesource.js','web/src/content/authoring/trialcompile.js','web/src/content/authoring/mapcompile.js','web/src/content/authoring/maplayers.js','web/src/content/authoring/fixedcitybindings.js','web/src/content/authoring/roadedit.js'];
const allowed=new Set([...oldAllowed,...producerTools]);
const a=json(read(base+first+'/receipt.json')),b=json(read(base+second+'/receipt.json'));assert.deepEqual(a,b);assert.equal(a.result,'PASS-DATE-CANDIDATE-NOT-INSTALLED');
for(const[p,h]of Object.entries(a.inputs)){assert.ok(allowed.has(p));assert.equal(sha(read(p)),h);}
const proof=json(read(base+'date-app-session-r1/candidate-verify.log'));assert.equal(proof.result,'PASS-DATE-CANDIDATE-SAME-ENGINE-NOT-INSTALLED');assert.equal(proof.revision,a.revision);assert.equal(proof.productionFreshAndJsonRestore,20);
for(const[p,h]of Object.entries(proof.toolHashes)){assert.ok(['tools/verify_editor_date_candidate.mjs','web/src/game/scenarioassembly.js','web/src/game/world.js','web/src/game/worldresources.js','web/src/content/catalog.js'].includes(p));assert.equal(sha(read(p)),h);}
const files=new Map();
for(const[p,h]of Object.entries(a.artifacts)){
  assert.match(p,/^(?:package\/(?:[A-Za-z0-9_-]+\.(?:json|bin|png)|chapters\/[A-Za-z0-9_-]+\.json)|author-input\/(?:entity-source|manifest)\.json|resources\.json|author-descriptor\.json)$/);
  const bytes=read(base+first+'/'+p);assert.equal(sha(bytes),h);assert.deepEqual(bytes,read(base+second+'/'+p));if(p.startsWith('package/'))files.set(p.slice(8),bytes);
}
const resources=json(read(base+first+'/resources.json')),manifest=json(files.get('manifest.json'));assert.equal(manifest.dateCorrection.status,'PENDING');assert.equal(manifest.geographyReview,'PENDING-DATE-DELTA');assert.equal(Object.hasOwn(manifest,'displayAcceptance'),false);
const oldFiles=new Map(oldManifest.assets.map(e=>[e.path,read('web/'+oldPrefix+e.path)]));
const shell=read('web/index.html').toString('utf8'),boot='<script type="module" src="src/boot.js"></script>';assert.equal(shell.split(boot).length,2);
const fixtureShell=shell.replace(boot,''); // DOM unchanged; no formal title/singleinstance/IDB boot
const output=join(root,base,round);mkdirSync(output);
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const server=await startBrowserTestServer(),origin=`http://127.0.0.1:${server.port}`,errors=[],forbidden=[],requests=[],cases=[];let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const idx of[14,15])for(const candidate of[false,true]){
    const current=candidate?resources:BUILTIN_RESOURCES,prefix=`content/builtin/compiled/${current.world.revision}/`,bytes=candidate?files:oldFiles;
    const catalog=json(bytes.get('catalog.json')),data=json(bytes.get('data.json'));
    const context=await browser.newContext({viewport:{width:1280,height:768}});
    await context.addInitScript(()=>{window.__idbOpens=0;indexedDB.open=()=>{window.__idbOpens++;throw new Error('formal IDB forbidden');};});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());requests.push({idx,candidate,path:url.pathname});
      if(url.origin!==origin||/save\.dat|\/api\/|\/src\/boot\.js$/i.test(url.pathname)){forbidden.push(url.href);return route.abort();}
      if(url.pathname==='/date-app-fixture.html')return route.fulfill({contentType:'text/html',body:fixtureShell});
      if(url.pathname.startsWith('/'+prefix)){
        const name=url.pathname.slice(prefix.length+1);if(!bytes.has(name)){forbidden.push(url.href);return route.abort();}
        let contentType='application/octet-stream';if(name.endsWith('.png'))contentType='image/png';else if(name.endsWith('.json'))contentType='application/json';
        return route.fulfill({contentType,body:bytes.get(name),headers:{'Cache-Control':'no-store'}});
      }
      if(/\/compiled\/|\/mmap_map\.bin$|\/road_graph\.json$|\/road_cost\.bin$|\/road_offset\.json$|\/map_(?:atlas|tiles)_/.test(url.pathname)){forbidden.push(url.href);return route.abort();}
      return route.continue();
    });
    const page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))errors.push(m.text());});
    await page.goto(origin+'/date-app-fixture.html');
    const result=await page.evaluate(async({world,catalog,chapter,chapterEntry,digest})=>{
      const {createContentCatalog}=await import('/src/content/catalog.js'),{createWorldResources}=await import('/src/game/worldresources.js');
      const {startApp}=await import('/src/main.js'),{createOriginalBattleRng}=await import('/src/game/battle/originalrng.js');
      const app=window.__app;app.originalRng=createOriginalBattleRng({ch:1,cl:2,dh:3}); // fixture seed, not a CPU-equivalence claim
      const content=createContentCatalog({...catalog,chapters:[{...chapterEntry,legacyScenarioIndex:0}]},{scenarios:[chapter]});
      await startApp(null,{trial:{content,world:createWorldResources(world),player:0,identity:{gameId:'date-app-fixture',sourceDigest:digest,trialSnapshotId:world.revision+'#'+chapterEntry.id}}});
      // Owned settings hold in the same task before the first RAF; normal speed untouched.
      app.gamebar.settingsOpen=true;app.gamebar.syncClock();app.hud.refreshClock();
      const {snapshotScenarioAssembly}=await import('/src/game/scenarioassembly.js');
      const before={state:JSON.stringify(app.scenario),ram:JSON.stringify(snapshotScenarioAssembly({scenario:app.scenario,scenarioIdx:app.scenarioIdx,content:app.content,world:app.world})),rng:JSON.stringify(app.originalRng.snapshot()),clock:JSON.stringify(app.clock.serialize()),serial:app.clock.strategicTickSerial};
      const canvas=document.querySelector('#cv'),ctx=canvas.getContext('2d'),original=ctx.fillText,own=Object.getOwnPropertyDescriptor(ctx,'fillText'),draws=[];
      ctx.fillText=function(text,x,y,...rest){if(y===8)draws.push({text:String(text),x,y});return original.call(this,text,x,y,...rest);};
      try{app.view.draw();}finally{if(own)Object.defineProperty(ctx,'fillText',own);else delete ctx.fillText;}
      const after={state:JSON.stringify(app.scenario),ram:JSON.stringify(snapshotScenarioAssembly({scenario:app.scenario,scenarioIdx:app.scenarioIdx,content:app.content,world:app.world})),rng:JSON.stringify(app.originalRng.snapshot()),clock:JSON.stringify(app.clock.serialize()),serial:app.clock.strategicTickSerial};
      const denied={save:await app.saveGame(0,'forbidden'),load:await app.loadSave(0)};
      return {start:app.scenario.start,clock:app.clock.serialize(),serial:app.clock.strategicTickSerial,hold:app.clock.hold,domDate:document.querySelector('#datestr').textContent,draws,before,after,denied,idb:window.__idbOpens,content:app.content.revision,world:app.world.definition.revision,canPersist:app.canPersist,gameStarted:app.gameStarted,runtimeEnabled:app.runtimeEnabled};
    },{world:current.world,catalog,chapter:data.scenarios[idx],chapterEntry:catalog.chapters[idx],digest:current.sourceDigest});
    assert.equal(result.gameStarted,true);assert.equal(result.runtimeEnabled,true);assert.equal(result.world,current.world.revision);assert.equal(result.content,catalog.revision);
    assert.deepEqual(result.clock,data.scenarios[idx].start);assert.deepEqual(result.start,result.clock);assert.equal(result.serial,0);assert.equal(result.hold,true);assert.equal(result.idb,0);assert.equal(result.canPersist,false);
    assert.deepEqual(result.before,result.after);assert.equal(result.domDate,`${result.clock.year}年${result.clock.month}月${result.clock.day}日 00時`);assert.ok(result.draws.some(d=>d.text===String(result.clock.year)));
    assert.deepEqual(result.denied,{save:{saved:'blocked',reason:'trial'},load:false});
    if(candidate){const previous=cases.at(-1),probe=json(Buffer.from(result.before.state)),prior=json(Buffer.from(previous.before.state));probe.start=prior.start;assert.deepEqual(probe,prior);assert.equal(result.before.rng,previous.before.rng);}
    await page.screenshot({path:join(output,`${candidate?'candidate':'prior'}-${idx}.png`)});
    cases.push({idx,candidate,...result});await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  for(const[p,h]of Object.entries(sourceHashes))assert.equal(sha(readFileSync(join(root,p))),h,'input drift during actual App');
  const toolHashes=Object.fromEntries(['tools/verify_editor_date_app.mjs','tools/browser_test_server.mjs','web/src/main.js','web/src/game/clock.js','web/src/ui/hud.js','web/src/ui/gamebar.js','web/src/editor/trialpolicy.js'].map(p=>[p,sha(read(p))]));
  writeFileSync(join(output,'receipt.json'),JSON.stringify({result:'PASS-PENDING-DATE-APP-NOT-INSTALLED',revision:a.revision,sourceHashes,toolHashes,cases,requests,errors,forbidden,limits:'Actual App/Clock initial date/Canvas and DOM startup only; settings hold zero ticks, fixed fixture RTC not CPU/full-calendar/campaign proof. No installed source, formal save/profile, publication or approval.'},null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({result:'PASS-PENDING-DATE-APP-NOT-INSTALLED',revision:a.revision,cases:cases.map(c=>({idx:c.idx,candidate:c.candidate,year:c.clock.year,idb:c.idb,serial:c.serial})),errors,forbidden})+'\n');
}catch(error){writeFileSync(join(output,'failure.json'),JSON.stringify({error:String(error),errors,forbidden,requests},null,2)+'\n',{flag:'wx'});throw error;}
finally{await browser?.close();await server.close();}
