// Actual default Root, own SQLite/R2 and fresh Chromium. Response controls are browser-only.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';
import { startEditorBackend } from './start_editor_backend.mjs';
import { assembleFixedStageAssets } from '../server/stageassetplan.js';
import { AVAILABLE_LIBRARY_REGISTRY_ID, installedAvailableLibraryPolicy } from '../server/sourcecatalogpolicy.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
const round = process.argv[2]; assert.ok(/^[1-9][0-9]{0,2}$/.test(round));
const port=Number(process.env.EDITOR_TEST_PORT||8787);assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535);
const dir = '.dragon-analysis/editor-phase/backend-stage-ui-session-r1/', own = mkdtempSync(join(tmpdir(), 'dragon-stage-ui-')), origin = 'https://127.0.0.1:'+port, sha = bytes => createHash('sha256').update(bytes).digest('hex');
function parse(bytes) { try { return JSON.parse(bytes); } catch (cause) { throw new Error('invalid owned UI JSON', { cause }); } }
const config = parse(readFileSync('server/wrangler.jsonc')), initial = (randomBytes(24).toString('hex') + 'Aa1!'), password = (randomBytes(24).toString('hex') + 'Aa1!'), requestKey = randomBytes(32).toString('hex'); config.main = resolve('server/worker.js'); config.dev={...config.dev,port};config.vars={...config.vars,EDITOR_ORIGIN:origin}; writeFileSync(join(own, 'wrangler.jsonc'), JSON.stringify(config)); writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(requestKey) + '\n', { flag: 'wx', mode: 0o600 });
const paths = ['editor-ui/src/PortraitPreview.vue','server/public/shell-ui.css','web/kao/manifest.js','server/portraits.js','web/src/editor/generalportrait.js','server/editorapp.js','web/src/content/authoring/gamesource.js','server/drafts.js','server/stageassetplan.js','server/sourcecatalogpolicy.js','server/available-library.txt','server/public/stageassets.txt','editor-ui/src/StageAssetsPanel.vue','server/worker.js','server/public/client.txt','server/public/draft.txt','server/public/index.html','server/public/stage.txt','server/public/library.txt','server/public/stronghold.txt','editor-ui/src/StrongholdPanel.vue','server/public/mapview.txt','editor-ui/src/MapPanel.vue','server/public/catalog.txt','editor-ui/src/CatalogPanel.vue','server/public/general.txt','editor-ui/src/GeneralsPanel.vue','editor-ui/src/CopyPanel.vue','editor-ui/src/copy.js','server/public/shell-ui.txt','editor-ui/src/StageJobsPanel.vue','editor-ui/src/LibraryPanel.vue','tools/verify_editor_backend_stage_ui.mjs','vps/editor-server.mjs','vps/sqlite-port.mjs','vps/file-bucket.mjs','tools/editor_local_https.mjs','tools/editor_stage_source.mjs','tools/editor_stage_library.mjs'], sourceHashes = Object.fromEntries(paths.map(p => [p, sha(readFileSync(p))])), calls = [], checks = [], downloads = []; let server, browser;
async function call(path, value, session, extra = {}) {
  const headers = { Origin: origin, ...extra }; if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; } if (value !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  const response = await new Promise((done,reject) => { const req = httpsRequest(origin+path, { method: value === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false }, res => { const parts = []; res.on('data',bytes=>parts.push(bytes)); res.on('error',reject); res.on('end',()=>{ try { done({ status:res.statusCode, data:parse(Buffer.concat(parts)), cookie:res.headers['set-cookie']?.[0]?.split(';')[0] }); } catch(error) { reject(error); } }); }); req.on('error',reject); req.end(value === undefined ? undefined : JSON.stringify(value)); }); calls.push({path,status:response.status}); return response;
}
async function startOwnedService() {
  if(process.env.EDITOR_TEST_NODE!=='1') return startEditorBackend(join(own,'wrangler.jsonc'),{stageSource:true,stageLibrary:true});
  const {openStorage}=await import('../vps/sqlite-port.mjs'),{FileBucket}=await import('../vps/file-bucket.mjs'),{createEditorService}=await import('../vps/editor-server.mjs');
  const {stageInstalledEditorSource}=await import('./editor_stage_source.mjs'),{stageInstalledAvailableLibrary}=await import('./editor_stage_library.mjs'),{createEditorHTTPS}=await import('./editor_local_https.mjs');
  const storage=openStorage(join(own,'node.sqlite')),bucket=new FileBucket({root:join(own,'node-private')});
  try {
    const operatorBucket={get:key=>bucket.get(key),put:(key,bytes,options)=>{assert.deepEqual(options,{onlyIf:{etagDoesNotMatch:'*'}});return bucket.put(key,bytes,{onlyIf:new Headers({'If-None-Match':'*'})});}};
    const source=await stageInstalledEditorSource(operatorBucket),library=await stageInstalledAvailableLibrary(operatorBucket);
    const env={...config.vars,EDITOR_DEFAULT_PASSWORD:initial,EDITOR_REQUEST_KEY:requestKey,EDITOR_INSTALLED_SOURCE_ROOT:JSON.stringify(source),EDITOR_AVAILABLE_LIBRARY_ROOT:JSON.stringify(library)};
    const service=createEditorService({storage,bucket,env});
    const transport=await createEditorHTTPS({dispatchFetch:(url,init)=>service.fetch(new Request(url,init))},{port});
    return {async close(){try{await transport.close();}finally{storage.close();}}};
  } catch(error){storage.close();throw error;}
}
async function wait(page) { await page.waitForFunction(() => !document.querySelector('#draft-games-refresh').disabled, undefined, { timeout:300000 }); }
async function navigate(page,view) { if(await page.locator('#'+view).isVisible())return;const accept=dialog=>dialog.accept();page.on('dialog',accept);try{await page.locator('#menu button[data-view="'+view+'"]').click();await page.locator('#'+view).waitFor({state:'visible'});}finally{page.off('dialog',accept);} }
async function dirty(page) { await navigate(page,'draft-editor');await page.locator('#draft-name').fill('未保存');await navigate(page,'stage-editor'); }
async function draft(page) { await navigate(page,'draft-editor');await page.locator('#draft-games-refresh').click(); await page.waitForFunction(()=>document.querySelector('#draft-game').options.length===1 && !document.querySelector('#draft-games-refresh').disabled); await page.locator('#draft-revision').fill('1'); await page.locator('#draft-load').click(); await page.waitForFunction(()=>document.querySelector('#draft-context').textContent.includes('已保存修訂 1') && !document.querySelector('#draft-name').disabled,undefined,{timeout:300000});await navigate(page,'stage-editor'); }
async function download(page, selector, label) { const event=page.waitForEvent('download',{timeout:300000}); await selector.click(); const file=await event, stream=await file.createReadStream(); assert.ok(stream); const parts=[]; for await(const bytes of stream)parts.push(bytes); const bytes=Buffer.concat(parts),path=dir+'download-r'+round+'-'+label+'.bin'; assert.equal(existsSync(path),false); writeFileSync(path,bytes,{flag:'wx'}); downloads.push({path,sha256:sha(bytes),byteLength:bytes.length}); await wait(page); return bytes; }
try {
  process.stderr.write('stage-ui: setup actual Root\n'); server=await startOwnedService(); const login=await call('/api/auth/login',{account:'tianyi',password:initial}); assert.equal(login.status,200); const changed=await call('/api/auth/password',{oldPassword:initial,newPassword:password},{cookie:login.cookie,csrf:login.data.csrf}); assert.equal(changed.status,200); const admin={cookie:changed.cookie,csrf:changed.data.csrf}; assert.equal((await call('/api/admin/accounts',{account:'stage_viewer'},admin)).status,200); const foreignLogin=await call('/api/auth/login',{account:'stage_viewer',password:initial}); assert.equal(foreignLogin.status,200); const foreignChanged=await call('/api/auth/password',{oldPassword:initial,newPassword:password},{cookie:foreignLogin.cookie,csrf:foreignLogin.data.csrf}); assert.equal(foreignChanged.status,200); assert.equal((await call('/api/admin/source/install',{},admin)).status,200); assert.equal((await call('/api/admin/library/install',{},admin)).status,200); const source=(await call('/api/admin/source',undefined,admin)).data,copyKey=randomUUID(); assert.equal((await call('/api/admin/copies',{registryId:source.definition.registryId,name:'<img>',introduction:''},admin,{'Idempotency-Key':copyKey})).status,202); const copied=await call('/api/admin/copies/'+copyKey+'/run',{},admin,{'If-Match':'"1"'}); assert.equal(copied.status,200); const gameId=copied.data.gameId, before=(await call('/api/games',undefined,admin)).data.games[0];
  const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href); browser=await chromium.launch({headless:true,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key)))}); const context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block',acceptDownloads:true,viewport:{width:1280,height:1100}}),errors=[],outside=[],expected=[],posts=[];
  await context.addInitScript(()=>Object.defineProperty(globalThis,'indexedDB',{get(){globalThis.__idbAccess=(globalThis.__idbAccess??0)+1;throw new Error('IDB forbidden');}})); await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){outside.push('outside');return route.abort();}return route.continue();});
  const page=await context.newPage(); const copyFaultPaths=new Set(); let downloadCount=0, revokedQueryPath=null, strongholdConflictPath=null; page.on('download',()=>downloadCount++); page.on('pageerror',error=>errors.push(error.message)); page.on('console',message=>{if(message.type()!=='error')return;const path=new URL(message.location().url||origin).pathname,text=message.text();if(copyFaultPaths.has(path)&&text.includes('net::ERR_FAILED')||path==='/api/admin/library/install'&&text.includes('net::ERR_FAILED')||path==='/api/session'&&text.includes('401')||path==='/favicon.ico'&&text.includes('404')||path.includes('/stage-jobs/')&&text.includes('net::ERR_FAILED')||path===revokedQueryPath&&(text.includes('409')||text.includes('401'))||path===strongholdConflictPath&&(text.includes('412')||text.includes('net::ERR_FAILED')))expected.push({path,text});else errors.push(text);}); page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='POST'&&path.includes('/stage-jobs/'))posts.push({path,key:request.headers()['idempotency-key'],revision:request.headers()['if-match'],body:parse(request.postData())});});
  await page.goto(origin+'/#stage-editor'); await page.locator('#login [name=account]').fill('tianyi'); await page.locator('#login [name=password]').fill(password); await page.locator('#login button').click(); await page.locator('#stage-editor').waitFor({state:'visible'}); await wait(page); assert.equal(await page.locator('#stage-create').isDisabled(),true); await draft(page); assert.equal(await page.locator('#draft-game img').count(),0); checks.push('actual fresh authenticated UI: stage disabled until exact private saved1 read, author labels textContent, no trial/publish controls');
  const generalsOnly=process.argv[3]==='--generals-only',copyOnly=process.argv[3]==='--copy-only',cityOnly=process.argv[3]==='--city-native-only',focused=generalsOnly||copyOnly||cityOnly;let savedImageAssociation;const cityPosts=[],generalWrites=[],generalRecoveries=[],rowPortraitPreviews=[],rowPortraitImages=[];
  if (copyOnly) {
    process.stderr.write('copy-ui: actual reserve/recover/run/cancel\n');
    const copyPosts=[];page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/api/admin/copies'))copyPosts.push({path:new URL(r.url()).pathname,key:r.headers()['idempotency-key'],revision:r.headers()['if-match'],body:parse(r.postData())});});
    await navigate(page,'copy');assert.equal(await page.locator('#source-state').textContent(),'');await page.locator('#source-refresh').click();await wait(page);assert.match(await page.locator('#source-state').textContent(),/已驗證登記/);assert.equal(await page.locator('#own-games [data-game-id]').count(),1);assert.equal(await page.locator('#own-games img').count(),0);
    await page.locator('#source-install').click();await wait(page);
    await page.locator('#copy-create [name=name]').fill('複製測試');await page.locator('#copy-create [name=introduction]').fill('原文');page.once('dialog',d=>d.dismiss());await page.locator('#menu button[data-view="draft-editor"]').click();assert.equal(await page.locator('#copy').isVisible(),true);assert.equal(copyPosts.length,0);
    const reserveURL=origin+'/api/admin/copies';copyFaultPaths.add('/api/admin/copies');await page.route(reserveURL,async route=>{const response=await route.fetch({timeout:300000});assert.equal(response.status(),202);await route.abort();});await page.locator('#copy-create button').click();await wait(page);assert.equal(copyPosts.length,1);assert.equal(await page.locator('#copy-create [name=name]').inputValue(),'複製測試');assert.equal(await page.locator('#copy-create button').isDisabled(),true);await page.unroute(reserveURL);
    page.once('dialog',d=>d.accept());await page.reload();await wait(page);assert.equal(copyPosts.length,1);await navigate(page,'copy');assert.equal(await page.locator('#copy-run').isDisabled(),true);await page.locator('#copy-refresh').click();await wait(page);assert.match(await page.locator('#copy-state').textContent(),/pending/);assert.equal(copyPosts.length,1);const key=copyPosts[0].key;assert.deepEqual(copyPosts[0].body,{registryId:source.definition.registryId,name:'複製測試',introduction:'原文'});
    const runPath='/api/admin/copies/'+key+'/run';copyFaultPaths.add(runPath);await page.route(origin+runPath,async route=>{const response=await route.fetch({timeout:300000});assert.equal(response.status(),200);await route.abort();});await page.locator('#copy-run').click();await wait(page);assert.equal(copyPosts.length,2);assert.equal(copyPosts[1].revision,'"1"');assert.deepEqual(copyPosts[1].body,{});assert.equal(await page.locator('#copy-run').isDisabled(),true);await page.unroute(origin+runPath);
    await page.locator('#copy-refresh').click();await wait(page);assert.match(await page.locator('#copy-state').textContent(),/committed/);assert.equal(copyPosts.length,2);assert.equal(await page.locator('#own-games [data-game-id]').count(),2);const created=(await call('/api/admin/copies/'+key,undefined,admin)).data;assert.equal(created.draftRevision,'1');assert.notEqual(created.gameId,gameId);
    await page.locator('#own-games [data-game-id="'+created.gameId+'"]').getByRole('button',{name:'測試運行',exact:true}).click();await wait(page);assert.equal(await page.locator('#draft-editor').isVisible(),true);assert.equal(await page.locator('#draft-game').inputValue(),created.gameId);assert.equal(await page.locator('#draft-name').isDisabled(),true);
    await navigate(page,'copy');await page.locator('#source-refresh').click();await wait(page);await page.locator('#copy-create [name=name]').fill('取消測試');await page.locator('#copy-create button').click();await wait(page);assert.equal(copyPosts.length,3);page.once('dialog',d=>d.dismiss());await page.locator('#copy-cancel').click();await wait(page);assert.equal(copyPosts.length,3);page.once('dialog',d=>d.accept());await page.locator('#copy-cancel').click();await wait(page);assert.equal(copyPosts.length,4);assert.match(await page.locator('#copy-state').textContent(),/canceled/);assert.equal(copyPosts[3].revision,'"1"');assert.equal(copyPosts[3].path,'/api/admin/copies/'+copyPosts[2].key+'/cancel');
    await page.locator('#copy').screenshot({path:dir+'copy-r'+round+'.png'});checks.push('actual source validation, escaped own list, dirty leave cancel; committed reservation/run replies lost, reload never POSTs, explicit original-key GET resolves independent saved1; draft jump selects but does not read/Trial; original-row CAS cancel only after confirmation');
  }
  if (!focused) {
  process.stderr.write('stage-ui: actual catalog original-key recovery\n');
  const catalogCalls=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/admin/library'))catalogCalls.push({method:r.method(),path:new URL(r.url()).pathname,key:r.headers()['idempotency-key'],body:r.postData()?parse(r.postData()):null});});
  await navigate(page,'catalog-editor');assert.equal(catalogCalls.length,0);await page.locator('#catalog-read').click();await wait(page);assert.match(await page.locator('#catalog-state').textContent(),/服務已登記/);assert.equal(await page.locator('#catalog-install').isEnabled(),true);
  page.once('dialog',d=>d.dismiss());await page.locator('#catalog-install').click();await wait(page);assert.equal(catalogCalls.length,1);
  const installURL=origin+'/api/admin/library/install';await page.route(installURL,async route=>{const reply=await route.fetch({timeout:300000});assert.equal(reply.status(),200);await route.abort();});page.once('dialog',d=>d.accept());await page.locator('#catalog-install').click();await wait(page);await page.unroute(installURL);assert.match(await page.locator('#catalog-operation').textContent(),/回應未確認/);assert.equal(await page.locator('#catalog-install').isDisabled(),true);
  const original=catalogCalls.at(-1);assert.deepEqual(original.body,{});page.once('dialog',d=>d.dismiss());await page.locator('#menu button[data-view="stage-editor"]').click();assert.equal(await page.locator('#catalog-editor').isVisible(),true);
  page.once('dialog',d=>d.accept());await page.reload();await page.locator('#catalog-editor').waitFor({state:'visible'});await wait(page);assert.equal(catalogCalls.length,2);assert.match(await page.locator('#catalog-operation').textContent(),/回應未確認/);assert.equal(await page.locator('#catalog-replay').isDisabled(),true);
  await page.locator('#catalog-read').click();await wait(page);assert.match(await page.locator('#catalog-operation').textContent(),/回應未確認/);assert.equal(await page.locator('#catalog-replay').isEnabled(),true);page.once('dialog',d=>d.accept());await page.locator('#catalog-replay').click();await wait(page);assert.deepEqual(catalogCalls.at(-1),original);assert.match(await page.locator('#catalog-operation').textContent(),/已收到並核對/);
  await page.locator('#catalog-editor').screenshot({path:dir+'catalog-r'+round+'.png'});page.once('dialog',d=>d.dismiss());await page.locator('#catalog-forget').click();await wait(page);assert.match(await page.locator('#catalog-operation').textContent(),/已收到並核對/);page.once('dialog',d=>d.accept());await page.locator('#catalog-forget').click();await wait(page);assert.equal(catalogCalls.length,4);assert.equal(await page.locator('#catalog-install').isDisabled(),true);
  checks.push('actual catalog GET/400-role registration, cancelled install no POST, committed reply dropped retains original key, leave cancel and reload no automatic request, fact read not original confirmation, same-key empty-body replay and local-only forget');await draft(page);
  await dirty(page); page.once('dialog',dialog=>dialog.dismiss()); await page.locator('#stage-create').click(); await wait(page); assert.equal(posts.length,0); assert.equal(await page.locator('#draft-name').inputValue(),'未保存');
  const dataURL=origin+'/api/games/'+gameId+'/stage-jobs/data'; await page.route(dataURL,async route=>{const response=await route.fetch({timeout:300000});assert.equal(response.status(),202);await route.abort();}); page.once('dialog',dialog=>dialog.accept()); await page.locator('#stage-create').click(); await page.waitForFunction(()=>!document.querySelector('#stage-query').disabled,undefined,{timeout:300000}); assert.equal(await page.locator('#stage-create').isDisabled(),true); assert.deepEqual(posts[0].body,{draftRevision:'1',scope:'all'}); await page.unroute(dataURL); page.once('dialog',dialog=>dialog.accept()); await page.reload(); await page.locator('#stage-editor').waitFor({state:'visible'}); await wait(page); assert.equal(posts.length,1); assert.equal(await page.locator('#stage-run').isDisabled(),true); page.once('dialog',dialog=>dialog.accept()); await page.locator('#stage-query').click(); await page.waitForFunction(()=>document.querySelector('#stage-task').textContent.includes('queued')&&!document.querySelector('#stage-run').disabled); assert.equal(posts.length,2); assert.equal(posts[0].key,posts[1].key); assert.equal(await page.locator('#draft-name').isDisabled(),true); await draft(page); await dirty(page);
  const association=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('editor-stage-jobs:')).map(([,value])=>JSON.parse(value))); assert.equal(association.length,1); const dataId=association[0].data.id; assert.deepEqual(Object.keys(association[0].data).sort(),['command','draftRevision','enqueueKey','gameId','id','purpose']); checks.push('dirty cancel no POST; lost actual202 then explicit reload preserves complete original association, no automaticPOST; explicit confirmation reuses original key/body, no implicit save');
  process.stderr.write('stage-ui: actual data run/lost reply\n'); const runURL=dataURL+'/'+dataId+'/run'; await page.route(runURL,async route=>{const response=await route.fetch({timeout:300000});assert.equal(response.status(),200);await route.abort();}); page.once('dialog',dialog=>dialog.accept()); await page.locator('#stage-run').click(); await page.waitForFunction(()=>document.querySelector('#stage-status').textContent.includes('階段操作未確認')&&!document.querySelector('#stage-query').disabled,undefined,{timeout:300000}); assert.equal(await page.locator('#stage-run').isDisabled(),true); await page.unroute(runURL); const count=posts.length; const commandKeys=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('editor-stage-jobs:')).map(([,value])=>Object.keys(JSON.parse(value).data.command).sort())); assert.deepEqual(commandKeys,[['action','key','revision']]); page.once('dialog',dialog=>dialog.accept()); await page.reload(); await page.locator('#stage-editor').waitFor({state:'visible'}); await wait(page); assert.equal(posts.length,count); assert.equal(await page.locator('#stage-run').isDisabled(),true); await page.locator('#stage-query').click(); await page.waitForFunction(()=>document.querySelector('#stage-task').textContent.includes('ready')&&!document.querySelector('#stage-query').disabled); assert.equal(posts.length,count); assert.equal(await page.locator('#stage-artifacts button').count(),29); assert.equal(await page.locator('#draft-name').isDisabled(),true); await draft(page); await dirty(page); const dataJob=(await call('/api/games/'+gameId+'/stage-jobs/data/'+dataId,undefined,admin)).data.job,terrain=dataJob.checkpoint.flatMap(record=>record.outputs).find(item=>item.assetId==='terrain_0'); checks.push('actual data29 ready after dropped command reply+reload with exact original commandkey/CAS restored; explicitGET only, no autorun/newcommand, saved metadata untouched; stage-only');
  process.stderr.write('stage-ui: actual artifact download and client corruption guard\n'); const terrainButton=page.locator('#stage-artifacts p').filter({hasText:'terrain_0／'}).locator('button'); const actual=await download(page,terrainButton,'terrain'); assert.equal(actual.length,terrain.byteLength); assert.equal(sha(actual),terrain.sha256); const artifactURL=dataURL+'/'+dataId+'/artifacts/terrain_0'; await page.route(artifactURL,async route=>{const response=await route.fetch({timeout:300000}),bytes=Buffer.from(await response.body());assert.equal(response.status(),200);bytes[0]^=1;await route.fulfill({response,body:bytes});}); const previousDownloads=downloadCount; await terrainButton.click(); await page.waitForFunction(()=>document.querySelector('#stage-status').textContent.includes('不建立檔案')&&!document.querySelector('#stage-query').disabled,undefined,{timeout:300000}); assert.equal(downloadCount,previousDownloads); await page.unroute(artifactURL); await page.route(artifactURL,async route=>{const response=await route.fetch({timeout:300000}); assert.equal(response.status(),200); await route.fulfill({response,headers:{...response.headers(),'x-content-sha256':'0'.repeat(64)}});}); await terrainButton.click(); await page.waitForFunction(()=>document.querySelector('#stage-status').textContent.includes('不建立檔案')&&!document.querySelector('#stage-query').disabled,undefined,{timeout:300000}); assert.equal(downloadCount,previousDownloads); await page.unroute(artifactURL); checks.push('actual ready artifact streamed to owned download and fullSHA/length checked; browser-only byteflip and separately wrong fullSHA header rejected before creating another download');
  page.once('dialog',dialog=>dialog.accept()); await page.reload(); await page.locator('#stage-editor').waitFor({state:'visible'}); await wait(page); assert.equal(posts.length,count); assert.equal(await page.locator('#stage-run').isDisabled(),true); assert.equal(await page.locator('#stage-artifacts button').count(),0); await page.locator('#stage-query').click(); await page.waitForFunction(()=>document.querySelector('#stage-task').textContent.includes('ready')&&!document.querySelector('#stage-query').disabled); assert.equal(posts.length,count); assert.equal(await page.locator('#stage-artifacts button').count(),29); checks.push('reload preserves only complete fixed association, not credentials/source/output; no automatic POST/artifact, explicit query rebuilds UI facts without latest switching');
  process.stderr.write('stage-ui: actual image job\n'); await draft(page); await page.locator('#stage-purpose').selectOption('images'); await page.locator('#stage-create').click(); await page.waitForFunction(()=>document.querySelector('#stage-task').textContent.includes('queued')&&!document.querySelector('#stage-run').disabled); page.once('dialog',dialog=>dialog.accept()); await page.locator('#stage-run').click(); await page.waitForFunction(()=>document.querySelector('#stage-task').textContent.includes('ready')&&!document.querySelector('#stage-query').disabled,undefined,{timeout:300000}); assert.equal(await page.locator('#stage-artifacts button').count(),7); const imageAssociation=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('editor-stage-jobs:')).map(([,value])=>JSON.parse(value))[0].images),imageJob=(await call('/api/games/'+gameId+'/stage-jobs/images/'+imageAssociation.id,undefined,admin)).data.job,mini=imageJob.checkpoint.flatMap(record=>record.outputs).find(item=>item.assetId==='minimap_base'); const miniBytes=await download(page,page.locator('#stage-artifacts p').filter({hasText:'minimap_base／'}).locator('button'),'minimap'); assert.equal(sha(miniBytes),mini.sha256); assert.equal(sha(miniBytes),sha(readFileSync('.dragon-analysis/editor-phase/backend-copy-images-session-r1/images-r2/asset-5.png'))); const after=(await call('/api/games',undefined,admin)).data.games[0]; assert.equal(after.draftRevision,'1'); assert.equal(after.modifiedAt,before.modifiedAt); assert.equal(after.metadata.name,'<img>'); checks.push('actual separate image7 ready and ownedmini download equals prior independent pixel-certified PNG; all stages/downloads leave saved1/metadata/modifiedAt unchanged');
  process.stderr.write('stage-ui: actual Vue library read and verified download\n');
  await navigate(page,'library-editor');assert.equal(await page.locator('#library-assets p').count(),0);
  const libraryReply=page.waitForResponse(r=>r.url().includes('/draft/library-assets?'),{timeout:300000});
  await page.locator('#library-load').click();const libraryResponse=await libraryReply;assert.equal(libraryResponse.status(),200);const library=await libraryResponse.json();
  await page.waitForFunction(()=>document.querySelectorAll('#library-assets p').length===398&&!document.querySelector('#library-load').disabled,undefined,{timeout:300000});
  assert.equal(await page.locator('#library-missing p').count(),20);assert.equal(await page.locator('#library-editor img,#library-editor audio,#library-editor video').count(),0);
  const asset=[...library.assets].sort((a,b)=>a.byteLength-b.byteLength)[0];
  await page.locator('#library-filter').fill(asset.logicalURL);const assetButton=page.locator('#library-assets button[data-asset-id="'+asset.assetId+'"]');
  const libraryBytes=await download(page,assetButton,'library');assert.equal(libraryBytes.length,asset.byteLength);assert.equal(sha(libraryBytes),asset.sha256);
  const libraryURL=origin+'/api/games/'+gameId+'/draft/library-assets/'+asset.assetId+'?revision=1',beforeBadLibrary=downloadCount;
  await page.route(libraryURL,async route=>{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response,headers:{...response.headers(),'x-library-root':'0'.repeat(64)}});});
  await assetButton.click();await page.waitForFunction(()=>document.querySelector('#library-status').textContent.includes('不建立檔案')&&!document.querySelector('#library-load').disabled);assert.equal(downloadCount,beforeBadLibrary);await page.unroute(libraryURL);
  await page.locator('#library-filter').fill('not-an-existing-library-path');assert.equal(await page.locator('#library-assets p').count(),0);await page.locator('#library-filter').fill('');assert.equal(await page.locator('#library-assets p').count(),398);
  writeFileSync(dir+'library-r'+round+'.png',await page.locator('#library-editor').screenshot(),{flag:'wx'});
  checks.push('actual Vue library398/missing20 exact saved1 GET, local filter targets stable asset ID, verified fixed-file download; wrong source-root header creates no file, no media execution');
  await navigate(page,'stage-editor');
  process.stderr.write('stage-ui: actual four seasonal stages and structural GET\n');
  for(const purpose of ['fallback-spring','fallback-summer','fallback-autumn','fallback-winter']) {
    await page.locator('#stage-purpose').selectOption(purpose);await page.locator('#stage-create').click();
    await page.waitForFunction(()=>document.querySelector('#stage-task').textContent.includes('queued')&&!document.querySelector('#stage-run').disabled,undefined,{timeout:300000});
    page.once('dialog',dialog=>dialog.accept());await page.locator('#stage-run').click();
    await page.waitForFunction(()=>document.querySelector('#stage-task').textContent.includes('ready')&&!document.querySelector('#stage-query').disabled,undefined,{timeout:300000});
    assert.equal(await page.locator('#stage-artifacts button').count(),2);
  }
  const beforeStructure=posts.length;
  await navigate(page,'stage-assets-editor');assert.equal(await page.locator('#stage-assets-load').isEnabled(),true);
  checks.push('actual six purposes ready and same-revision structural context enabled; no automatic structural GET');
  if(process.argv[3]!=='--jobs-only') {
  const structureReply=page.waitForResponse(response=>response.url().includes('/stage-assets?'),{timeout:900000});
  await page.locator('#stage-assets-load').click();process.stderr.write('stage-ui: structural GET clicked\n');const structureResponse=await structureReply;process.stderr.write('stage-ui: structural response '+structureResponse.status()+'\n');
  assert.equal(structureResponse.status(),200,await structureResponse.text());const structure=await structureResponse.json();
  assert.equal(structure.plan.reference.gameId,gameId);assert.equal(structure.plan.reference.draftRevision,'1');
  for(const flag of ['runtimeAllowed','trialAllowed','releaseAllowed','deleteAllowed']){assert.equal(structure[flag],false);assert.equal(structure.plan[flag],false);}
  const policy=installedAvailableLibraryPolicy(readFileSync('server/available-library.txt'));
  assert.equal(policy.registryId,AVAILABLE_LIBRARY_REGISTRY_ID);assert.equal(library.registryId,policy.registryId);
  assert.equal(policy.manifestDigest,sha(readFileSync('server/available-library.txt')));
  const stages=[];
  for(const report of structure.plan.reports){const response=await call('/api/games/'+gameId+'/stage-jobs/'+report.purpose+'/'+report.binding.operationId,undefined,admin);assert.equal(response.status,200);stages.push({purpose:report.purpose,job:response.data.job,binding:report.binding});}
  const input={reference:structure.plan.reference,stages,library};
  assert.deepEqual(assembleFixedStageAssets(input),structure.plan);
  for(const registryId of ['approved-available-library-76cdf28-1','unregistered-library'])assert.throws(()=>assembleFixedStageAssets({...input,library:{...library,registryId}}),error=>error.message==='STAGE_PLAN_LIBRARY_REGISTRY');
  assert.throws(()=>assembleFixedStageAssets({...input,library:{...library,draftRevision:'2'}}),error=>error.message==='STAGE_PLAN_LIBRARY_REFERENCE');
  assert.throws(()=>assembleFixedStageAssets({...input,library:{...library,admission:'runtime'}}),error=>error.message==='STAGE_PLAN_LIBRARY_ADMISSION');
  writeFileSync(dir+'stage-plan-input-r'+round+'.json',JSON.stringify(input)+'\n',{flag:'wx'});
  checks.push('current pinned manifest policy and structural registry agree; independently reassembled real descriptions match, old/unregistered identities and wrong revision/runtime admission rejected');
  await page.waitForFunction(()=>document.querySelector('#stage-assets-summary').textContent.includes('44階段描述')&&!document.querySelector('#stage-assets-load').disabled,undefined,{timeout:300000});
  assert.equal(await page.locator('#stage-assets-outputs p').count(),44);assert.equal(await page.locator('#stage-assets-missing p').count(),26);assert.equal(posts.length,beforeStructure);
  await page.locator('#stage-assets-clear').click();assert.equal(await page.locator('#stage-assets-outputs p').count(),0);
  checks.push('actual UI six-purpose jobs on saved1 + default Root structural GET: 44 outputs/26 missing, four admission flags false, clear sends no stage POST; no fixture worker/native-read bridge');
  }
  await navigate(page,'stage-editor');await page.locator('#stage-purpose').selectOption('images');
  savedImageAssociation=imageAssociation;
  }
  if (!focused || cityOnly) {
  process.stderr.write('stage-ui: actual stronghold edit and CAS conflict\n');
  await navigate(page,'stronghold-editor');await page.locator('#stronghold-refresh').click();
  await page.waitForFunction(()=>document.querySelectorAll('#stronghold-cities tbody tr').length===192&&!document.querySelector('#stronghold-refresh').disabled,undefined,{timeout:300000});
  assert.equal(await page.locator('#stronghold-cities input').count(),0);
  assert.ok((await page.locator('#native-city-chapter option:checked').textContent()).trim());
  const cityRow=page.locator('#native-city-table tr[data-native-city]').first(),cityInput=cityRow.locator('[data-native-field="troops"]'),cityIdx=Number(await cityRow.getAttribute('data-native-city')),oldTroops=Number(await cityInput.inputValue()),cityCap=Number(await cityInput.getAttribute('max'));
  assert.ok(Number.isSafeInteger(cityCap)&&cityCap>0);const newTroops=oldTroops>0?oldTroops-1:1,saveCity=cityRow.locator('[data-native-save]');
  page.on('request',request=>{if(request.method()==='POST'&&request.url()===origin+'/api/games/'+gameId+'/draft/save')cityPosts.push({body:parse(request.postData()),revision:request.headers()['if-match']});});
  await cityInput.fill(String(cityCap+1));await saveCity.click();await wait(page);assert.equal(cityPosts.length,0);assert.match(await page.locator('#status').textContent(),/上限/);
  await cityInput.fill(String(newTroops));page.once('dialog',dialog=>dialog.dismiss());await page.locator('#menu button[data-view="draft-editor"]').click();assert.equal(await page.locator('#stronghold-editor').isVisible(),true);assert.equal(await cityInput.inputValue(),String(newTroops));
  page.once('dialog',dialog=>dialog.accept());await saveCity.click();await page.waitForFunction(()=>document.querySelector('#native-city-message').textContent.includes('已確認保存修訂 2')&&!document.querySelector('#logout').disabled,undefined,{timeout:300000});
  assert.equal(await cityInput.isDisabled(),true);assert.equal(cityPosts[0].body.chapterEdits[0].op,'city-native');
  await page.locator('#native-city-load').click();await wait(page);assert.equal(await cityInput.inputValue(),String(newTroops));
  assert.equal(cityPosts.length,1);assert.equal(cityPosts[0].revision,'"1"');assert.deepEqual(cityPosts[0].body.chapterEdits[0].values,{troops:newTroops});assert.equal(cityPosts[0].body.chapterEdits[0].cityIdx,cityIdx);
  const cityChapter=cityPosts[0].body.chapterEdits[0].chapterId,cityRead=(await call('/api/games/'+gameId+'/draft?revision=2',undefined,admin)).data;
  assert.equal(cityRead.chapters.find(c=>c.chapterId===cityChapter).cities.find(c=>c.idx===cityIdx).troops,newTroops);
  await page.locator('#stronghold-chapters').selectOption(cityChapter);
  await page.locator('#stronghold-cities tr[data-city-idx="'+cityIdx+'"]').getByRole('button',{name:'刪除檢查'}).click();await wait(page);assert.equal(cityPosts.length,1);assert.match(await page.locator('#stronghold-message').textContent(),/192 座/);
  const competing=await call('/api/games/'+gameId+'/draft/save',{metadata:cityRead.metadata,resourceEdits:[],chapterEdits:[{op:'city-native',chapterId:cityChapter,cityIdx,values:{troops:oldTroops}}]},admin,{'If-Match':'"2"'});assert.equal(competing.status,200);assert.equal(competing.data.draftRevision,'3');
  strongholdConflictPath='/api/games/'+gameId+'/draft/save';await cityInput.fill(String(oldTroops));const conflictReply=page.waitForResponse(r=>r.url()===origin+strongholdConflictPath&&r.request().method()==='POST',{timeout:300000});page.once('dialog',dialog=>dialog.accept());await saveCity.click();assert.equal((await conflictReply).status(),412);await wait(page);assert.equal(await cityInput.inputValue(),String(oldTroops));assert.equal(cityPosts.length,2);assert.equal(cityPosts[1].revision,'"2"');
  await page.locator('#stronghold-editor').screenshot({path:dir+'stronghold-r'+round+'.png'});
  assert.equal(await cityInput.isDisabled(),true);await page.locator('#native-city-query').click();await wait(page);
  assert.match(await page.locator('#native-city-message').textContent(),/服務已記錄失敗/);
  await page.locator('#native-city-revision').fill('3');page.once('dialog',dialog=>dialog.accept());await page.locator('#native-city-load').click();await wait(page);
  assert.equal(await cityInput.inputValue(),String(oldTroops));assert.equal(cityPosts.length,2);assert.match(await page.locator('#workspace-context').textContent(),/修訂 3/);
  await page.route(origin+strongholdConflictPath,async route=>{const response=await route.fetch({timeout:300000});assert.equal(response.status(),200);await route.abort();});
  await cityInput.fill(String(newTroops));page.once('dialog',dialog=>dialog.accept());await saveCity.click();await wait(page);await page.unroute(origin+strongholdConflictPath);assert.equal(cityPosts.length,3);assert.equal(await cityInput.inputValue(),String(newTroops));assert.equal(await cityInput.isDisabled(),true);
  await page.locator('#native-city-query').click();await wait(page);assert.match(await page.locator('#native-city-message').textContent(),/已確認保存修訂 4/);assert.equal(await cityInput.isDisabled(),true);
  await page.locator('#native-city-load').click();await wait(page);assert.equal(await cityInput.inputValue(),String(newTroops));assert.equal(cityPosts.length,3);
  checks.push('actual saved4 response dropped: input retained and locked, original-key query confirms4 without retry, explicit exact read installs4');
  checks.push('actual shared Vue city table192, bounded input/no POST on overflow, dirty navigation cancel, city-native CAS save2 and explicit readback, independent delete-report no mutation, actual412 keeps inputs until query and confirmed read3; shared draft context now4');
  }
  if (!focused) {
  await navigate(page,'stage-editor');
  process.stderr.write('stage-ui: actual native map under Vue presentation\n');
  const mapRequests=[];page.on('request',r=>{if(r.url().endsWith('/topology')||r.url().includes('/draft?revision=4'))mapRequests.push({method:r.method(),url:r.url()});});
  await navigate(page,'mapview-editor');assert.equal(mapRequests.length,0);
  const mapReply=page.waitForResponse(r=>r.url().endsWith('/draft?revision=4'),{timeout:300000});await page.locator('#mapview-refresh').click();const mapResponse=await mapReply;assert.equal(mapResponse.status(),200);await wait(page);
  // Large draft bodies can be evicted from Chromium's inspector cache. Read an
  // independent exact-revision HTTPS oracle; never replace the browser response.
  const mapOracle=await call('/api/games/'+gameId+'/draft?revision=4',undefined,admin);
  assert.equal(mapOracle.status,200);const mapBody=mapOracle.data;assert.equal(mapBody.draftRevision,'4');
  assert.match(await page.locator('#mapview-roads').textContent(),/放置 192/);assert.match(await page.locator('#mapview-roads').textContent(),/拓撲意向 0/);assert.ok(mapBody.map.roads.length>0);
  const dot=mapBody.strongholds[0],pixel=await page.locator('#mapview-canvas').evaluate((canvas,dot)=>Array.from(canvas.getContext('2d').getImageData(dot.x,dot.y,1,1).data),dot);assert.deepEqual(pixel,[232,217,176,255]);
  assert.deepEqual(mapRequests.map(r=>r.method),['GET','GET']);await page.locator('#mapview-canvas').click();assert.equal(mapRequests.length,2);assert.equal(cityPosts.length,3);
  await page.locator('#mapview-editor').screenshot({path:dir+'map-r'+round+'.png'});await navigate(page,'stage-editor');await navigate(page,'mapview-editor');assert.equal(mapRequests.length,2);assert.match(await page.locator('#workspace-context').textContent(),/修訂 4/);
  checks.push('actual exact saved4 map+independent topology GET, native384x256 city pixel matches original color, readonly click/navigation sends no write or automatic reread; shared draft remains4');
  }
  const imageAssociation=savedImageAssociation,generalBase=generalsOnly?1:4;
  if (!copyOnly && !cityOnly) {
  strongholdConflictPath='/api/games/'+gameId+'/draft/save';
  async function generalRevision(offset) {assert.match(await page.locator('#generals-context').textContent(),new RegExp('修訂 '+(generalBase+offset)+'(?:／|$)'));}
  process.stderr.write('stage-ui: actual generals rename/portrait/conflict\n');
  await navigate(page,'generals-editor');await page.locator('#generals-refresh').click();await wait(page);assert.equal(await page.locator('[data-general-idx]').count(),128);await generalRevision(0);process.stderr.write('generals: loaded128\n');
  page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname===strongholdConflictPath)generalWrites.push({body:parse(r.postData()),revision:r.headers()['if-match'],key:r.headers()['idempotency-key']});});
  await page.locator('#native-general-revision').fill(String(generalBase));await page.locator('#native-general-load').click();await wait(page);
  const originalGeneral=(await call('/api/games/'+gameId+'/draft?revision='+generalBase,undefined,admin)).data;
  async function verifyReadOnlyAbilities(snapshot) {
    const traffic=[],observe=request=>{if(new URL(request.url()).pathname.startsWith('/api/'))traffic.push(request.method()+' '+request.url());};
    page.on('request',observe);
    const rows=page.locator('[data-general-idx]');
    const displayed=await rows.evaluateAll(elements=>elements.map(row=>({idx:Number(row.dataset.generalIdx),values:[...row.querySelectorAll('[data-native-ability-values] dd')].map(cell=>cell.textContent),low:row.querySelector('[data-native-specialty-low]').textContent})));
    assert.deepEqual(displayed,snapshot.chapters[0].generals.map(g=>({idx:g.idx,values:[`${g.ability.force}／${g.ability.lead}／${g.ability.politics}`,`${g.ability.siege}／${g.ability.field}／${g.ability.naval}`],low:`專長低四位（攻城／野戰／水戰）：${g.specialtyLowBits===null?'未提供；未知不等於000':g.specialtyLowBits}。不由高位推回原字節。`})));
    const panels=rows.locator('[data-native-general-ability]');
    assert.equal(await panels.locator('input,select,button,textarea').count(),0);
    await panels.first().locator('summary').click();
    assert.equal(await panels.first().locator('[data-native-ability-values]').isVisible(),true);
    await panels.first().locator('summary').click();
    page.off('request',observe);assert.deepEqual(traffic,[]);
    checks.push(`actual saved${snapshot.draftRevision} ability projection: all 128 displayed rows equal exact HTTP DTO, missing low bits remain unknown, expansion has no inputs or API traffic`);
  }
  if(generalsOnly)await verifyReadOnlyAbilities(originalGeneral);
  await page.locator('#native-general-revision').fill('999');
  const firstGeneral=page.locator('[data-general-idx="0"]'),renameButton=firstGeneral.getByRole('button',{name:'改名／字',exact:true});page.once('dialog',d=>d.dismiss());await renameButton.click();await wait(page);assert.equal(generalWrites.length,0);
  async function renameGeneral(name,hao,accept=true) {const values=[name,hao],answer=d=>{if(d.type()==='prompt')return d.accept(values.shift());if(accept)return d.accept();return d.dismiss();};page.on('dialog',answer);try{await renameButton.click();await wait(page);assert.equal(values.length,0);}finally{page.off('dialog',answer);}}
  async function dropGeneralSave() {
    await page.route(origin+strongholdConflictPath,async route=>{
      const request=route.request(),response=await route.fetch({timeout:300000});assert.equal(response.status(),200);
      const result=await response.json();assert.equal(result.gameId,gameId);
      const revision=request.headers()['if-match'];assert.equal(result.draftRevision,String(BigInt(revision.slice(1,-1))+1n));
      generalRecoveries.push({op:parse(request.postData()).chapterEdits[0].op,key:request.headers()['idempotency-key'],revision,committedRevision:result.draftRevision});
      await route.abort();
    },{times:1});
  }
  async function recoverGeneralSave() {
    const saved=generalRecoveries.at(-1),count=generalWrites.length,reads=[];
    assert.match(await page.locator('#native-general-message').textContent(),/未確認/);
    assert.equal(await page.locator('#native-general-retry').isDisabled(),true);
    const observe=request=>{if(request.method()==='GET'&&new URL(request.url()).pathname==='/api/games/'+gameId+'/draft')reads.push(request.url());};
    page.on('request',observe);
    await page.reload();await page.locator('#menu').waitFor({state:'visible'});await wait(page);await navigate(page,'generals-editor');
    assert.equal(await page.locator('[data-general-idx]').count(),0);
    assert.equal(await page.locator('#native-general-retry').isDisabled(),true);
    const query=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/games/'+gameId+'/draft/operations/'+saved.key);
    await page.locator('#native-general-query').click();const response=await query;assert.equal(response.status(),200);
    const result=await response.json();await wait(page);assert.equal(result.state,'committed');assert.equal(result.result.draftRevision,saved.committedRevision);
    assert.equal(generalWrites.length,count);assert.deepEqual(reads,[]);assert.equal(await page.locator('[data-general-idx]').count(),0);
    assert.equal(await page.locator('#native-general-revision').inputValue(),saved.committedRevision);
    assert.equal(await page.locator('#native-general-retry').isDisabled(),true);
    page.off('request',observe);saved.queryRevision=result.result.draftRevision;saved.browserPostsAfterRecovery=count;saved.sourceReadsBeforeExplicitLoad=reads.length;
  }
  await renameGeneral('測試將','測字',false);assert.equal(generalWrites.length,0);
  if(generalsOnly)await dropGeneralSave();
  await renameGeneral('測試將','測字');await generalRevision(0);assert.equal(await renameButton.isDisabled(),true);
  assert.equal(generalWrites[0].revision,'"'+generalBase+'"');
  assert.deepEqual(generalWrites[0].body,{metadata:originalGeneral.metadata,resourceEdits:[],chapterEdits:[{op:'rename-general',chapterId:originalGeneral.chapters[0].chapterId,generalIdx:0,values:{name:'測試將',hao:'測字'}}]});
  if(generalsOnly)await recoverGeneralSave();
  await page.locator('#native-general-load').click();await wait(page);
  if(generalsOnly)assert.equal(await renameButton.count(),0);else assert.equal(await renameButton.isDisabled(),true);
  await page.locator('#generals-refresh').click();await wait(page);assert.equal(await renameButton.isEnabled(),true);
  assert.match(await firstGeneral.textContent(),/測試將/);await generalRevision(1);process.stderr.write('generals: shared rename explicitly read back\n');
  assert.deepEqual((await call('/api/games/'+gameId+'/draft?revision='+generalBase,undefined,admin)).data,originalGeneral);
  const portraitReply=page.waitForResponse(r=>r.url().endsWith('/portraits'),{timeout:300000});await page.locator('#portrait-list').click();const portraitData=await (await portraitReply).json();await wait(page);const available=portraitData.portraits.find(p=>p.assetId==='p0001');assert.ok(available);assert.equal(available.inUse===true,false);const manifestPortrait=KAO_MANIFEST.find(p=>p.id==='p0001');assert.equal(available.sha256,manifestPortrait.sha256);assert.equal(available.byteLength,manifestPortrait.bytes);assert.equal(await page.locator('#portrait-pick option').count(),portraitData.portraits.length);await page.locator('#portrait-pick').selectOption(available.assetId);
  if(generalsOnly)page.on('response',response=>{
    const url=new URL(response.url());
    if(url.pathname.startsWith('/api/games/'+gameId+'/portraits/')&&url.pathname.endsWith('/bytes')) {
      const headers=response.headers();
      rowPortraitImages.push({path:url.pathname,query:url.search,status:response.status(),sha256:headers['x-content-sha256'],mime:headers['content-type'],cacheControl:headers['cache-control']});
    }
  });
  async function previewSavedPortrait(snapshot) {
    await verifyReadOnlyAbilities(snapshot);
    const general=snapshot.chapters[0].generals.find(row=>row.idx===0);
    assert.ok(Number.isInteger(general.portrait)&&general.portrait>=0&&general.portrait<=255);
    const assetId=general.portraitKey??String(general.portrait),entry=KAO_MANIFEST.find(row=>row.id===assetId);
    assert.ok(entry);
    const bytes=readFileSync(join('web/kao',entry.file));
    assert.equal(sha(bytes),entry.sha256);assert.equal(bytes.length,entry.bytes);
    if(await page.locator('#portrait-pick option').count()===0) {
      await page.locator('#portrait-list').click();await wait(page);
    }
    const panel=firstGeneral.locator('[data-native-general-preview]'),beforeWrites=generalWrites.length;
    const picker=await page.locator('#portrait-pick').inputValue(),revision=await page.locator('#native-general-revision').inputValue();
    const traffic=[],observe=request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))traffic.push({method:request.method(),path:url.pathname,query:url.search});};
    page.on('request',observe);
    assert.equal(await panel.locator('img').count(),0);
    if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
    assert.deepEqual(traffic,[]);assert.equal(await panel.locator('img').count(),0);
    assert.equal(await firstGeneral.locator('[data-native-general-portrait-id]').textContent(),general.portraitKey??`原圖 #${general.portrait}`);
    await panel.locator('[data-portrait-preview]').click();
    await page.waitForFunction(()=>{const image=document.querySelector('[data-general-idx="0"] [data-native-general-preview] img');return image&&!image.hidden&&image.naturalWidth>0;});
    const path='/api/games/'+gameId+'/portraits/'+assetId+'/bytes',query='?sha256='+entry.sha256;
    assert.equal(await panel.locator('img').getAttribute('src'),path+query);
    const size=await panel.locator('img').evaluate(image=>[image.naturalWidth,image.naturalHeight]);
    assert.deepEqual(size,[bytes.readUInt32BE(16),bytes.readUInt32BE(20)]);
    assert.ok(traffic.length<=1);assert.ok(traffic.every(row=>row.method==='GET'&&row.path===path&&row.query===query));
    const image=rowPortraitImages.find(row=>row.path===path&&row.query===query);
    assert.ok(image,'each unique picture must have an actual verified HTTP response, even when later decodes reuse it');
    assert.deepEqual(image,{path,query,status:200,sha256:entry.sha256,mime:'image/png',cacheControl:'no-store'});
    await panel.locator('[data-portrait-preview-clear]').click();
    assert.equal(await panel.locator('img').count(),0);assert.equal(generalWrites.length,beforeWrites);
    assert.equal(await page.locator('#portrait-pick').inputValue(),picker);assert.equal(await page.locator('#native-general-revision').inputValue(),revision);
    page.off('request',observe);
    rowPortraitPreviews.push({draftRevision:snapshot.draftRevision,portrait:general.portrait,portraitKey:general.portraitKey,assetId,sha256:entry.sha256,byteLength:entry.bytes,size,traffic});
    checks.push(`actual saved${snapshot.draftRevision} row portrait ${assetId}: original/override resolution, explicit verified HTTPS image and browser decode, clear preserves picker/revision and sends no save`);
    process.stderr.write('generals: row portrait preview verified at '+snapshot.draftRevision+'\n');
  }
  for (const [portraitKey,offset] of [[available.assetId,2],[null,3]]) {
    process.stderr.write('generals: portrait pre-read '+offset+'\n');
    const prior=(await call('/api/games/'+gameId+'/draft?revision='+(generalBase+offset-1),undefined,admin)).data;
    if(generalsOnly&&offset===2)await previewSavedPortrait(prior);
    const portraitButton=firstGeneral.locator('[data-native-general-portrait]'),before=generalWrites.length;
    await page.locator('#native-general-revision').fill('999');
    page.once('dialog',d=>d.dismiss());await portraitButton.click();await wait(page);assert.equal(generalWrites.length,before);
    if(generalsOnly)await dropGeneralSave();
    process.stderr.write('generals: portrait submit '+offset+'\n');
    page.once('dialog',d=>d.accept());await portraitButton.click();await wait(page);
    process.stderr.write('generals: portrait response processed '+offset+'\n');
    assert.equal(generalWrites.length,before+1);assert.equal(generalWrites.at(-1).revision,'"'+(generalBase+offset-1)+'"');
    assert.deepEqual(generalWrites.at(-1).body,{metadata:prior.metadata,resourceEdits:[],chapterEdits:[{op:'portrait',chapterId:prior.chapters[0].chapterId,generalIdx:0,portraitKey}]});
    await generalRevision(offset-1);assert.equal(await portraitButton.isDisabled(),true);assert.equal(await renameButton.isDisabled(),true);
    if(generalsOnly)await recoverGeneralSave();
    process.stderr.write('generals: portrait original key recovered '+offset+'\n');
    await page.locator('#native-general-load').click();await wait(page);
    if(generalsOnly)assert.equal(await portraitButton.count(),0);else assert.equal(await portraitButton.isDisabled(),true);
    await page.locator('#generals-refresh').click();await wait(page);await generalRevision(offset);assert.equal(await renameButton.isEnabled(),true);
    assert.equal(await portraitButton.textContent(),portraitKey===null?'綁定頭像':'清除頭像綁定');
    const savedPortrait=(await call('/api/games/'+gameId+'/draft?revision='+(generalBase+offset),undefined,admin)).data;
    assert.equal(savedPortrait.draftRevision,String(generalBase+offset));
    const expectedChapters=structuredClone(prior.chapters);
    expectedChapters[0].generals.find(g=>g.idx===0).portraitKey=portraitKey;
    assert.deepEqual(savedPortrait.chapters,expectedChapters,'only the explicit portraitKey changes in all chapter projections');
    assert.equal(savedPortrait.chapters[0].generals[0].portraitKey,portraitKey);
    assert.deepEqual((await call('/api/games/'+gameId+'/draft?revision='+(generalBase+offset-1),undefined,admin)).data,prior);
    if(generalsOnly)await previewSavedPortrait(savedPortrait);
    process.stderr.write('generals: shared portrait explicitly read back '+offset+'\n');
  }
  if(generalsOnly){assert.equal(generalRecoveries.length,3);assert.equal(new Set(generalRecoveries.map(row=>row.key)).size,3);checks.push('actual rename, shared p0001 portrait bind and clear each commit then lose only the browser response; library ID/SHA/length match the fixed manifest, only portraitKey changes across all chapter projections; reload queries original keys with zero source reads before explicit load and no duplicate POST');}
  const firstFaction=page.locator('[data-faction-idx]').first();page.once('dialog',d=>d.dismiss());await firstFaction.locator('[data-native-faction-disband]').click();await wait(page);await firstGeneral.getByRole('button',{name:'刪除檢查',exact:true}).click();await wait(page);assert.equal(generalWrites.length,3);assert.match(await page.locator('#generals-message').textContent(),/128/);
  const referencesSnapshot=(await call('/api/games/'+gameId+'/draft?revision='+(generalBase+3),undefined,admin)).data;
  for(const ch of referencesSnapshot.chapters)for(const g of ch.generals){assert.ok(Array.isArray(g.references));assert.equal(g.references[0].code,'GENERAL_CHAPTER_REF');assert.ok(g.references[0].detail.includes(ch.chapterId));}
  const referencesMessage=await page.locator('#generals-message').textContent();assert.match(referencesMessage,/不代表各章為同一人物/);
  for(const ch of referencesSnapshot.chapters){const g=ch.generals.find(g=>g.idx===0);if(g)for(const ref of g.references)assert.ok(referencesMessage.includes(ref.detail));}
  page.once('dialog',d=>d.accept('abc'));await firstFaction.locator('[data-native-advisor-assign]').click();await wait(page);assert.equal(generalWrites.length,3);assert.match(await page.locator('#status').textContent(),/普通武將槽/);
  assert.equal(await renameButton.isEnabled(),true); // Both portrait commands were explicitly read into the shared context.
  const general7=(await call('/api/games/'+gameId+'/draft?revision='+(generalBase+3),undefined,admin)).data;assert.equal((await call('/api/games/'+gameId+'/draft/save',{metadata:{...general7.metadata,name:'競寫遊戲'},resourceEdits:[]},admin,{'If-Match':'"'+(generalBase+3)+'"'})).status,200);const conflict=page.waitForResponse(r=>new URL(r.url()).pathname===strongholdConflictPath&&r.request().method()==='POST');await renameGeneral('衝突將','測字');assert.equal((await conflict).status(),412);assert.match(await page.locator('#native-general-message').textContent(),/未確認/);assert.equal(await renameButton.isDisabled(),true);assert.equal(generalWrites.length,4);assert.equal(generalWrites[3].revision,'"'+(generalBase+3)+'"');await generalRevision(3);assert.equal(await page.locator('#native-general-retry').isDisabled(),true);await page.locator('#native-general-query').click();await wait(page);assert.equal(await page.locator('#native-general-retry').isEnabled(),true);
  await page.locator('#native-general-revision').fill(String(generalBase+4));page.once('dialog',d=>d.accept());await page.locator('#native-general-load').click();await wait(page);assert.equal(await renameButton.isDisabled(),true);
  await page.locator('#generals-refresh').click();await wait(page);await generalRevision(4);assert.equal(await renameButton.isEnabled(),true);assert.equal(generalWrites.length,4);
  await page.locator('#generals-editor').screenshot({path:dir+'generals-r'+round+'.png'});assert.match(await page.locator('#workspace-context').textContent(),new RegExp('修訂 '+(generalBase+4)));checks.push('actual chapter128: shared-journal rename with prompt/confirmation cancellation, typed999 ignored, exact body and immutable prior source, receipt locks until explicit shared and table reads; shared portrait bind/clear with cancellation, exact saved bodies, locked receipts, explicit reads and immutable old revisions; real CAS412 retains original key pending query then explicit read, no automatic retry or runtime changes');
  }
  const foreignContext=await browser.newContext({ignoreHTTPSErrors:true}),foreignPage=await foreignContext.newPage(); foreignPage.on('pageerror',error=>errors.push(error.message)); await foreignContext.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){outside.push('outside');return route.abort();}return route.continue();}); await foreignContext.addInitScript(()=>Object.defineProperty(globalThis,'indexedDB',{get(){globalThis.__idbAccess=(globalThis.__idbAccess??0)+1;throw new Error('IDB forbidden');}})); await foreignPage.goto(origin+'/#stage-editor'); await foreignPage.locator('#login [name=account]').fill('stage_viewer'); await foreignPage.locator('#login [name=password]').fill(password); await foreignPage.locator('#login button').click(); await foreignPage.locator('#stage-editor').waitFor({state:'visible'}); await wait(foreignPage); assert.equal(await foreignPage.locator('#stage-purpose [value=images]').evaluate(option=>option.disabled),true); assert.equal(await foreignPage.locator('#stage-create').isDisabled(),true); assert.equal(await foreignPage.locator('#stage-artifacts button').count(),0); await navigate(foreignPage,'library-editor');assert.equal(await foreignPage.locator('#library-load').isDisabled(),true);assert.equal(await foreignPage.locator('#library-assets p').count(),0);await navigate(foreignPage,'stronghold-editor');await foreignPage.locator('#stronghold-refresh').click();await wait(foreignPage);assert.equal(await foreignPage.locator('#stronghold-games option').count(),0);assert.equal(await foreignPage.locator('#stronghold-cities input').count(),0);assert.equal(await foreignPage.locator('#native-city-table input').count(),0);await navigate(foreignPage,'mapview-editor');await foreignPage.locator('#mapview-refresh').click();await wait(foreignPage);assert.equal(await foreignPage.locator('#mapview-roads p').count(),0);assert.equal(await foreignPage.locator('#mapview-inspect').isDisabled(),true);await navigate(foreignPage,'generals-editor');await foreignPage.locator('#generals-refresh').click();await wait(foreignPage);assert.equal(await foreignPage.locator('[data-general-idx]').count(),0);assert.equal(await foreignPage.locator('#portrait-list').isDisabled(),true);assert.equal(await foreignPage.evaluate(()=>globalThis.__idbAccess??0),0); await foreignContext.close(); checks.push('actual separate author cannot select administrator images, sees no other-owner association/inputs/outputs; server gates remain authority');
  if (focused) {
    revokedQueryPath=copyOnly?'/api/admin/source':'/api/games';assert.equal((await call('/api/auth/password',{oldPassword:password,newPassword:randomBytes(24).toString('hex')+'Aa1!'},admin)).status,200);
    const entityRefresh=cityOnly?'#stronghold-refresh':'#generals-refresh';
    await page.locator(copyOnly?'#source-refresh':entityRefresh).click();await page.waitForFunction(()=>document.getElementById('session').hidden,undefined,{timeout:300000});assert.equal(await page.locator('[data-general-idx]').count(),0);assert.equal(await page.locator('#portrait-pick option').count(),0);assert.equal(await page.locator('#own-games [data-game-id]').count(),0);assert.equal(await page.locator('#source-state').textContent(),'');assert.equal(await page.locator('#native-city-table input').count(),0);checks.push('actual password revocation then GET401 clears private module projection and returns to login');
  }
  if (!focused) {
  process.stderr.write('stage-ui: actual password/epoch UI invalidation\n'); revokedQueryPath='/api/games/'+gameId+'/stage-jobs/images/'+imageAssociation.id; const nextPassword=(randomBytes(24).toString('hex') + 'Aa1!');await page.locator('.user-menu summary').click();await page.locator('.user-menu-items').getByRole('button',{name:'變更密碼',exact:true}).click(); await page.locator('#password [name=oldPassword]').fill(password); await page.locator('#password [name=newPassword]').fill(nextPassword); await page.locator('#password [name=confirmPassword]').fill(nextPassword); await page.locator('#password button').click(); await page.waitForFunction(()=>document.querySelector('#stage-status').textContent.includes('實際改密已撤銷')&&!document.querySelector('#draft-games-refresh').disabled,undefined,{timeout:300000}); assert.equal(await page.locator('#library-assets p').count(),0);assert.equal(await page.locator('#library-filter').inputValue(),'');assert.equal(await page.locator('#mapview-roads p').count(),0);assert.equal(await page.locator('#mapview-canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,1,1).data[3]),0);await navigate(page,'stage-editor');assert.equal(await page.locator('#stage-run').isDisabled(),true); assert.equal(await page.locator('#stage-artifacts button:not([disabled])').count(),0); const actualEpochResponse=page.waitForResponse(response=>response.url()===origin+'/api/games/'+gameId+'/stage-jobs/images/'+imageAssociation.id&&response.request().method()==='GET'); await page.locator('#stage-query').click(); assert.equal((await actualEpochResponse).status(),409); await wait(page); assert.equal(await page.locator('#stage-create').isDisabled(),false); checks.push('actual password success revokes oldepoch, disables old run/download; actual oldjob query409 cannot revive it, explicit newreservation allowed without deleting old artifacts');
  }
  let limits='Actual owned Root/SQL/bucket/HTTPS/fresh Chromium stage operations/downloads; no runtime/Trial/Release/full goal completion or cloudSLA.';
  if(cityOnly) limits='Actual owned service/SQL/bucket/HTTPS/fresh Chromium city-native conflict and lost-response recovery only; no stage jobs, full workflow, runtime, Trial, publication or cloud certification.';
  if(generalsOnly) limits='Actual shared-journal rename and portrait bind/clear with original-key recovery, plus original/override/restored row picture HTTPS headers and browser decode after exact reads; fixed PNG bytes checked against manifest. No full 621-image, faction, stage, runtime, Trial, publication or production certification.';
  assert.equal(await page.evaluate(()=>globalThis.__idbAccess??0),0); assert.deepEqual(outside,[]); assert.deepEqual(errors,[]); const shot=dir+'ui-r'+round+'.png'; writeFileSync(shot,await page.screenshot({fullPage:true}),{flag:'wx'}); for(const[p,h]of Object.entries(sourceHashes))assert.equal(sha(readFileSync(p)),h,p); process.stdout.write(JSON.stringify({result:'PASS-REAL-ROOT-STAGE-UI-SCOPED',structuralGetChecked:!focused&&process.argv[3]!=='--jobs-only',scope:focused?process.argv[3].slice(2):'combined',platform:process.env.EDITOR_TEST_NODE==='1'?'Node SQLite/FileBucket + owned HTTPS':'workerd SQLite/R2 + owned HTTPS',checks,calls,posts,...(cityOnly?{cityPosts}:{}),...(generalsOnly?{generalWrites,generalRecoveries,rowPortraitPreviews,rowPortraitImages}:{}),sourceHashes,downloads,screenshot:shot,screenshotSha:sha(readFileSync(shot)),expected,errors,outside,limits},null,2)+'\n');
} catch(error) {writeFileSync(dir+'failure-r'+round+'.json',JSON.stringify({message:error.message,checks,calls,sourceHashes},null,2)+'\n',{flag:'wx'});throw error;} finally { await browser?.close(); await server?.close(); }
