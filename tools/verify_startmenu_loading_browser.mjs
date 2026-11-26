// Fresh browser/profile and loopback only; real App entry with a held asset-load boundary.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startBrowserTestServer} from './browser_test_server.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const server=await startBrowserTestServer(),origin=`http://127.0.0.1:${server.port}`;
let browser;const errors=[],forbidden=[];
try {
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key)));
 browser=await chromium.launch({headless:true,env});
 const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
 await context.addInitScript(origin=>{if(location.origin===origin)sessionStorage.setItem('wolong.intro.seen.v1','1');},origin);
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin||/save\.dat|\/api\//i.test(url.pathname)){forbidden.push(url.href);return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('requestfailed',request=>errors.push(`${request.url()} ${request.failure()?.errorText}`));
 await page.goto(`${origin}/index.html`);
 await page.waitForFunction(()=>!!window.__app?.startMenu?._onClick);
 await page.evaluate(()=>{
  const app=window.__app,menu=app.startMenu;
  menu._chooseChapter=async()=>16;menu._factionDialog=async()=>0;
  menu._advisorDialog=()=>menu._nameDialog({portrait:145});
  const load=app.ensureGameAssets.bind(app),begin=app.beginNewGame.bind(app);
  const gate=new Promise(resolve=>{window.__releaseLoading=resolve;});
  app.ensureGameAssets=async()=>{window.__loadingHeld=true;await gate;return load();};
  window.__beginCalls=[];app.beginNewGame=(...args)=>{window.__beginCalls.push(args);return begin(...args);};
 });
 const click=async(x,y,button='left')=>{const b=await page.locator('#startv').boundingBox();await page.mouse.click(b.x+x*b.width/640,b.y+y*b.height/400,{button});};
 await click(300,175);
 const inputs=page.locator('#advisor-input-overlay input');await inputs.first().waitFor();
 await inputs.first().fill('測試名');await inputs.nth(1).fill('測試號');
 await click(280,260);
 await page.waitForFunction(()=>window.__loadingHeld);
 assert.deepEqual(await inputs.evaluateAll(nodes=>nodes.map(n=>[n.value,n.readOnly])),[['測試名',true],['測試號',true]]);
 const mask=page.getByRole('dialog',{name:'正在準備地圖與遊戲資源…'});
 assert.equal(await mask.locator('[role=status]').isVisible(),true);
 assert.equal(await mask.locator('progress').getAttribute('value'),null);
 await page.keyboard.press('Escape');
 assert.equal(await mask.evaluate(node=>node.matches(':modal')),true);
 await inputs.first().dispatchEvent('keydown',{key:'Enter'});await click(280,260);await click(360,260,'right');
 assert.equal(await page.evaluate(()=>window.__beginCalls.length),1);
 await page.setViewportSize({width:1280,height:800});
 assert.equal(await inputs.first().isVisible(),true);
 assert.equal(await page.evaluate(()=>window.__app.gameStarted),false);
 await page.evaluate(()=>window.__releaseLoading());
 await page.waitForFunction(()=>window.__app.gameStarted&&!document.querySelector('#advisor-input-overlay'),{},{timeout:120000});
 assert.deepEqual(await page.evaluate(()=>window.__beginCalls[0][2]),{name:'測試名',hao:'測試號',portrait:145});
 assert.equal(await page.evaluate(()=>window.__app.startMenu._advisorLoadingCleanup),null);
 assert.equal(await page.locator('dialog.start-loading').count(),0);
 assert.equal(await page.evaluate(async()=>{
  const failure=new Error('held chapter read failed');
  return window.__app.startMenu.withLoading('正在載入章節資料…',()=>{throw failure;})
   .then(()=>false,error=>error===failure&&!document.querySelector('dialog.start-loading'));
 }),true);
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
 process.stdout.write('advisor loading: real App started; name/hao retained, indeterminate progress visible, duplicate/cancel blocked, resize and cleanup passed\n');
} finally {await browser?.close();await server.close();}
