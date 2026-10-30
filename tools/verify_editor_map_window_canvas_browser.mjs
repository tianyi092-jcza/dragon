// Fresh owned browser, actual native module/static gateway and Canvas2D.
// Controller transport is an explicit fixture, not authenticated backend evidence.
import assert from 'node:assert/strict';
import { register, createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createFixedTileWindowRows } from '../web/src/content/authoring/tilepixels.js';
register('../vps/text-loader.mjs', import.meta.url);
const { createEditorGateway } = await import('../server/editorapp.js');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['server/public/draft.txt', 'web/src/content/authoring/tilepixels.js', 'tools/verify_editor_map_window_canvas_browser.mjs'];
const sourceHashes = Object.fromEntries(paths.map(path => [path, sha(readFileSync(path))]));
mkdirSync('.dragon-analysis/editor-map-window', { recursive: true });
const output = mkdtempSync('.dragon-analysis/editor-map-window/run-');
const gateway = createEditorGateway(), errors = [], outside = [], failed = [];
let origin, browser;
const server = createServer(async (request, response) => {
  if (request.url === '/owned-canvas-harness') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'" });
    response.end('<!doctype html><meta charset="utf-8"><title>Owned Canvas test</title><canvas id="preview" width="1" height="1"></canvas>'); return;
  }
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const result = await gateway.fetch(new Request(origin + request.url), { EDITOR_METADATA: { idFromName() { throw new Error('Unexpected backend access'); } } });
  response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key)));
  browser = await chromium.launch({ headless: true, env });
  const context = await browser.newContext(), page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push(request.url()));
  page.on('request', request => { if (!request.url().startsWith(origin)) outside.push(request.url()); });
  await page.addInitScript(() => { globalThis.__idbAccess = 0; Object.defineProperty(globalThis, 'indexedDB', { get() { globalThis.__idbAccess++; throw new Error('No IDB allowed'); } }); });
  await page.goto(`${origin}/owned-canvas-harness`);
  const moduleResponse = await context.request.get(`${origin}/draft.js`);
  assert.equal(moduleResponse.status(),200); assert.equal(sha(await moduleResponse.body()),sourceHashes['server/public/draft.txt']);
  const pixels = Uint8Array.from({length:256*256*4}, (_,index) => {
    const x=Math.floor(index/4)%256, y=Math.floor(index/1024);
    if(index%4===3) return 255; if(index%4===0) return x; if(index%4===1) return y; return x^y;
  });
  const plane = new Uint8Array(384*256), tiles = Array.from({length:256},(_,index)=>index);
  for(let row=0;row<16;row++) plane.set(tiles.slice(row*16,row*16+16),(200+row)*384+100);
  const expected = sha(Buffer.concat([...createFixedTileWindowRows(plane,pixels,{x:1600,y:3200,width:256,height:256})]));
  const result = await page.evaluate(async ({ pixelsHex, pixelsSha256 }) => {
    const { installDraftEditor } = await import('/draft.js');
    const canvas = document.querySelector('#preview'), ctx = canvas.getContext('2d');
    const gameId='11111111-1111-4111-8111-111111111111', digest='a'.repeat(64), calls=[];
    let identity={user:{id:'owned-canvas',mustChangePassword:false},version:'1'}, model, rectangle={x:100,y:200,width:16,height:16}, corrupt=false, mounted=true;
    const metadata={name:'畫布',introduction:''};
    const editor=installDraftEditor({ authority:()=>identity, isBusy:()=>false, publish:value=>{model=value;}, work:async fn=>{const value=await fn(); editor.render(); return value;},
      getMapWindowCanvas:()=>mounted?canvas:null, confirm:()=>true,
      storage:{getItem:()=>null,setItem:()=>{throw new Error('Read-only fixture');},removeItem:()=>{}},
      api:async(path,body)=>{
        if(body!==undefined) throw new Error('No POST allowed'); calls.push(path);
        if(path==='/api/games') return {games:[{gameId,draftRevision:'1',metadata}]};
        if(path.includes('/map-window?')) return {format:'dragon-draft-map-window-1',gameId,draftRevision:'1',sourceDigest:digest,worldWidth:384,worldHeight:256,tileSize:16,...rectangle,
          tiles:rectangle.width===16?Array.from({length:256},(_,index)=>index):[null,255],admission:'display-only'};
        if(path.includes('/map-atlas?')) return {format:'dragon-draft-map-atlas-1',gameId,draftRevision:'1',sourceDigest:digest,season:'spring',width:256,height:256,tileSize:16,pixelFormat:'rgba8',assetSha256:'b'.repeat(64),pixelsSha256:corrupt?'f'.repeat(64):pixelsSha256,pixelsHex,admission:'display-only'};
        if(path===`/api/games/${gameId}/draft?revision=1`) return {gameId,draftRevision:'1',sourceDigest:digest,metadata,profileRevision:'fixed-copy-resources-1',chapters:[]};
        throw new Error(`Unexpected fixture read ${path}`);
      } });
    const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),byte=>byte.toString(16).padStart(2,'0')).join('');
    editor.setIdentity(identity); await editor.actions.refresh(); await editor.actions.load();
    await editor.actions.mapWindow(100,200,16,16); await editor.actions.mapAtlas('spring');
    const knownSha=await hash(ctx.getImageData(0,0,256,256).data);
    const before=calls.length; editor.actions.redrawMapWindow(); const after=calls.length;
    rectangle={x:382,y:255,width:2,height:1}; await editor.actions.mapWindow(382,255,2,1);
    const data=ctx.getImageData(0,0,32,16).data;
    const unknown=Array.from(data.subarray(0,4)), alternate=Array.from(data.subarray(32,36)), knownCorner=Array.from(data.subarray(64,68));
    const sourceUnknown=model.mapWindow.value.tiles[0];
    corrupt=true; let rejected=false;
    try { await editor.actions.mapAtlas('spring'); } catch { rejected=true; }
    const clearAfterBad=[...ctx.getImageData(0,0,1,1).data];
    corrupt=false; await editor.actions.mapAtlas('spring');
    mounted=false; editor.actions.redrawMapWindow(); mounted=true; editor.actions.redrawMapWindow();
    const afterMount=[...ctx.getImageData(0,0,1,1).data];
    const actor=identity; identity=null; editor.setIdentity(null); identity=actor; editor.setIdentity(actor); editor.actions.redrawMapWindow();
    const clearAfterIdentity=[...ctx.getImageData(0,0,1,1).data];
    return {knownSha,before,after,unknown,alternate,knownCorner,sourceUnknown,rejected,clearAfterBad,afterMount,clearAfterIdentity,idb:globalThis.__idbAccess,calls};
  }, {pixelsHex:Buffer.from(pixels).toString('hex'),pixelsSha256:sha(pixels)});
  assert.equal(result.knownSha,expected); assert.equal(result.before,result.after);
  assert.deepEqual(result.unknown,[96,96,96,255]); assert.deepEqual(result.alternate,[160,160,160,255]);
  assert.deepEqual(result.knownCorner,[240,240,0,255]); assert.equal(result.sourceUnknown,null);
  assert.equal(result.rejected,true); assert.deepEqual(result.clearAfterBad,[0,0,0,0]);
  assert.deepEqual(result.afterMount,[96,96,96,255]); assert.deepEqual(result.clearAfterIdentity,[0,0,0,0]);
  assert.equal(result.idb,0); assert.deepEqual(errors,[]); assert.deepEqual(outside,[]); assert.deepEqual(failed,[]);
  for(const [path,value] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(path)),value);
  writeFileSync(join(output,'receipt.json'),JSON.stringify({checks:6,result,sourceHashes,errors,outside,failed,scope:'actual gateway/native module/Canvas2D, explicit controller transport fixture; no Vue or backend authorization proof'},null,2),{flag:'wx'});
  process.stdout.write(`${JSON.stringify({checks:6,output})}\n`);
} finally {
  await browser?.close(); await new Promise(resolve=>server.close(resolve));
}
