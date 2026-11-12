// Real Request/session/SQLite routes with an explicit legacy-draft adapter seam.
// Owned temporary state only; no installed-source, production, SAVE or profile I/O.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { fail } from '../server/security.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
register('../vps/text-loader.mjs', import.meta.url);
const { createEditorApplication } = await import('../server/editorapp.js');

test('lightweight portrait catalog keeps legacy usage and authority contracts', async t => {
  const scratch = mkdtempSync(join(tmpdir(), 'dragon-portrait-catalog-'));
  const storage = openStorage(join(scratch, 'authority.sqlite')), sql = storage.sql;
  try {
    const origin = 'https://owned-editor.invalid', token = '2'.repeat(64), owner = randomUUID(), gameId = randomUUID();
    const tokenHash = createHash('sha256').update(token).digest('hex'), time = new Date().toISOString();
    let imageReads = 0, draftReads = 0;
    const Application = createEditorApplication(class {}, { readSharedPortrait: async () => { imageReads++; throw new Error('catalog must not read image bytes'); } });
    const app = new Application({ storage }, { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: 'a'.repeat(64), EDITOR_DEFAULT_PASSWORD: 'Owned-Fixture-Only-1!', EDITOR_BLOBS: new FileBucket({ root: join(scratch, 'objects') }) });
    sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', owner, 'catalog-author', 'author', '{}', 0, 0, 1, 1, '', '', '', '');
    sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', tokenHash, owner, 1, Date.now() + 86400000, Date.now() + 86400000);
    sql.exec('INSERT INTO content_used_ids VALUES(?)', gameId);
    sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)', gameId, owner, 'catalog fixture', '', '1', '1', null, '1', time, time);
    const path = `/api/games/${gameId}/portraits`;
    const call = async (suffix = '?usage=0', authenticated = true) => {
      const headers = { Origin: origin, ...(authenticated ? { Cookie: `__Secure-dragon-editor=${token}` } : {}) };
      const result = await app.fetch(new Request(origin + path + suffix, { headers }));
      return { status: result.status, body: await result.json() };
    };
    app.privateDrafts.read = async () => { draftReads++; fail(503, 'OWNED_USAGE_UNAVAILABLE'); };

    await t.test('catalog works without a legacy draft and reads no image or source bytes', async () => {
      const result = await call();
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.gameId, gameId);
      assert.deepEqual(result.body.portraits, KAO_MANIFEST.map(row => ({ assetId: row.id, sha256: row.sha256, byteLength: row.bytes, mime: 'image/png' })));
      assert.ok(result.body.portraits.every(row => !Object.hasOwn(row, 'inUse')));
      assert.equal(draftReads, 0); assert.equal(imageReads, 0);
    });
    await t.test('default list still returns usage and propagates usage-read failures', async () => {
      app.privateDrafts.read = async () => { draftReads++; return { chapters: [{ generals: [{ portraitKey: '150' }] }], generalDefinitions: [{ portraitRef: { assetId: '255' } }] }; };
      const result = await call('');
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.portraits.filter(row => row.inUse).map(row => row.assetId), ['150', '255']);
      assert.ok(result.body.portraits.every(row => typeof row.inUse === 'boolean'));
      assert.equal(draftReads, 1);
      app.privateDrafts.read = async () => { draftReads++; fail(503, 'OWNED_USAGE_UNAVAILABLE'); };
      assert.deepEqual(await call(''), { status: 503, body: { error: 'OWNED_USAGE_UNAVAILABLE' } });
      assert.equal(draftReads, 2);
      assert.equal((await call()).status, 200); assert.equal(draftReads, 2);
    });
    await t.test('opt-out is exact and only valid on the list route', async () => {
      for (const suffix of ['?usage=1', '?usage=false', '?usage=00', '?usage=', '?usage=0&usage=0', '?usage=0&extra=1', '/255?usage=0', '/255/bytes?usage=0']) {
        assert.deepEqual(await call(suffix), { status: 422, body: { error: 'PORTRAIT_QUERY' } }, suffix);
      }
      const descriptor = await call('/255');
      assert.equal(descriptor.status, 200); assert.equal(descriptor.body.assetId, '255');
      assert.equal(draftReads, 2); assert.equal(imageReads, 0);
    });
    await t.test('missing session remains unauthorized', async () => {
      const result = await call('?usage=0', false);
      assert.equal(result.status, 401); assert.equal(Object.hasOwn(result.body, 'portraits'), false);
      assert.equal(draftReads, 2);
    });
    await t.test('password-change gate is retained', async () => {
      sql.exec('UPDATE users SET must_change=1 WHERE id=?', owner);
      try { assert.deepEqual(await call(), { status: 403, body: { error: 'PASSWORD_CHANGE_REQUIRED' } }); }
      finally { sql.exec('UPDATE users SET must_change=0 WHERE id=?', owner); }
      assert.equal(draftReads, 2);
    });
    await t.test('revoked epoch cannot read the catalog', async () => {
      sql.exec('UPDATE users SET epoch=2 WHERE id=?', owner);
      try { assert.deepEqual(await call(), { status: 401, body: { error: 'SESSION_INVALID' } }); }
      finally { sql.exec('UPDATE users SET epoch=1 WHERE id=?', owner); }
      assert.equal(draftReads, 2);
    });
    await t.test('deletion fence blocks both catalogs without reading the draft', async () => {
      sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', gameId, owner, owner, '1', '2', time);
      for (const suffix of ['?usage=0', '', '/255']) assert.deepEqual(await call(suffix), { status: 409, body: { error: 'GAME_DELETING' } });
      assert.equal(draftReads, 2); assert.equal(imageReads, 0);
    });
  } finally {
    storage.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});
