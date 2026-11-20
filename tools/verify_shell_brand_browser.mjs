// 編輯器 chrome 資源：真 EditorService＋隔離落盤 SQLite，驗證 favicon/品牌/登入圖。
// 用法：node --test tools/verify_shell_brand_browser.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { request as httpsRequest } from 'node:https';

const port = Number(process.env.EDITOR_TEST_PORT ?? 18799);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const own = mkdtempSync(join(tmpdir(), 'dragon-shell-brand-'));
const origin = 'https://127.0.0.1:' + port;
const initial = randomBytes(24).toString('hex') + 'Aa1!';
const secret = randomBytes(32).toString('hex');

const config = JSON.parse(readFileSync('server/wrangler.jsonc', 'utf8'));
config.main = resolve('server/worker.js');
config.dev.port = port;
config.vars.EDITOR_ORIGIN = origin;

function get(path) {
  return new Promise((done, reject) => {
    const req = httpsRequest(origin + path, { headers: { Origin: origin }, rejectUnauthorized: false }, res => {
      const parts = [];
      res.on('data', b => parts.push(b));
      res.on('error', reject);
      res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'], bytes: Buffer.concat(parts) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { createEditorService } = await import('../vps/editor-server.mjs');
const { createEditorHTTPS } = await import('./editor_local_https.mjs');
const { stageInstalledEditorSource } = await import('./editor_stage_source.mjs');

const storage = openStorage(join(own, 'authority.sqlite'));
const bucket = new FileBucket({ root: join(own, 'private-objects') });
const source = await stageInstalledEditorSource({
  get: key => bucket.get(key),
  put: (key, bytes, _options) => bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) }),
});
const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: secret, EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source) } });
const transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });

test('chrome 資源路由＋登入頁呈現', async context => {
  try {
    const icon = await get('/favicon.ico');
    assert.equal(icon.status, 200);
    assert.match(icon.type, /image\/x-icon/);
    assert.ok(icon.bytes.equals(readFileSync('server/public/favicon.ico')), 'tab icon bytes match project file');
    for (const path of ['/brand.png', '/auth-logo.png']) {
      const image = await get(path);
      assert.equal(image.status, 200, path);
      assert.match(image.type, /image\/png/, path);
      assert.ok(image.bytes.equals(readFileSync('server/public' + path)), path + ' bytes match project file');
    }
    const shell = await get('/');
    assert.equal(shell.status, 200);
    assert.ok(shell.bytes.toString().includes('<link rel="icon" type="image/x-icon" href="/favicon.ico">'), 'shell links the tab icon');

    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    try {
      const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true })).newPage();
      page.on('pageerror', error => { throw error; });
      await page.goto(origin + '/#draft-editor');
      await page.locator('#login').waitFor();
      const shot = join(own, 'login.png');
      await page.locator('.auth-card').screenshot({ path: shot });
      assert.equal(await page.locator('.auth-layout .brand').count(), 0, 'login header shows no brand');
      const logo = page.locator('.auth-logo');
      assert.equal(await logo.count(), 1);
      assert.deepEqual(await logo.evaluate(node => [node.naturalWidth, node.naturalHeight]), [128, 128]);
      const card = await page.locator('.auth-card').boundingBox();
      const account = await page.locator('#login label').first().boundingBox();
      assert.ok(Math.abs((account.x + account.width / 2) - (card.x + card.width / 2)) < 4, 'inputs horizontally centered');
      const button = await page.locator('#login button').boundingBox();
      assert.ok(Math.abs(button.width - account.width) < 4, `login button same width as inputs: ${button.width} vs ${account.width}`);
      assert.ok(account.width < card.width * 0.6, `inputs narrower than card: ${account.width} vs ${card.width}`);
      const main = await page.locator('.auth-layout .workbench-main').boundingBox();
      const viewport = page.viewportSize();
      assert.ok(Math.abs((main.y + main.height / 2) - viewport.height / 2) < main.height / 2, 'login area vertically centered');
      console.log('LOGIN-SHOT ' + shot);
    } finally {
      await browser?.close();
    }
  } finally {
    try { await transport.close(); } finally { storage.close(); }
  }
});
