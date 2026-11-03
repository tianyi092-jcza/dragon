// Owned full-copy bootstrap for the browser/publication integration test.
// Not author blank creation or the HTTP source-install/copy workflow.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
register('../../vps/text-loader.mjs', import.meta.url);
const { createEditorApplication, createEditorGateway } = await import('../../server/editorapp.js');
const gateway = createEditorGateway({ frozenPublication: true });
const { openStorage } = await import('../../vps/sqlite-port.mjs');
const { FileBucket } = await import('../../vps/file-bucket.mjs');
const { createEditorService } = await import('../../vps/editor-server.mjs');
const { installedSourcePolicy } = await import('../../server/sourcecatalogpolicy.js');
const { encodeSourceChunks, canonicalSourceTokens } = await import('../../web/src/content/authoring/sourcejson.js');
const { createPinnedCopyLoader } = await import('../editor_trusted_copy.mjs');
const { mac, passwordHash } = await import('../../server/security.js');
const { assertDeletionDefinitions } = await import('../../server/deletiondefinitions.js');
const { GameDeletionJobFreeze } = await import('../../server/deletionjobfreeze.js');
const { GameDeletionDraftFreeze } = await import('../../server/deletiondraftfreeze.js');
export async function createPublicationBrowserAuthority({ root, origin, runtimeStager, nodeService = false }) {
  const dbPath = join(root, 'editor.sqlite'); assert.equal(existsSync(dbPath), false);
  const storage = openStorage(dbPath), sql = storage.sql;
  const ADMIN = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OWNER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const secret = 'c'.repeat(64), token = '1'.repeat(64), adminToken = '2'.repeat(64);
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const hash = sha(token), adminHash = sha(adminToken), password = 'Owned-Browser-Password-Only-1!';
  try {
    const bucket = new FileBucket({ root: join(root, 'private-objects') });
    const bindings = { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: secret, EDITOR_DEFAULT_PASSWORD: password, EDITOR_BLOBS: bucket };
    const Application = createEditorApplication(class {}, { runtimeStager, frozenPublication: true });
    const app = new Application({ storage }, bindings);
    bindings.EDITOR_METADATA = {
      idFromName(name) { assert.equal(name, 'editor-authority-v1'); return name; },
      get(name) { assert.equal(name, 'editor-authority-v1'); return app; },
    };
    const freezeOptions = { storage, principal: () => { throw new Error('unused freeze principal'); }, requestKey: secret };
    new GameDeletionJobFreeze(freezeOptions); new GameDeletionDraftFreeze(freezeOptions);
    const encodedPassword = passwordHash(password);
    for (const [id, account, role, tokenHash] of [[ADMIN, 'tianyi', 'admin', adminHash], [OWNER, 'owned_author', 'author', hash]]) {
      sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, account, role, encodedPassword, 0, 0, 1, 1, '', '', '', '');
      sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', tokenHash, id, 1, Date.now() + 3600000, Date.now() + 3600000);
    }
    assert.equal(assertDeletionDefinitions(sql).tablesVerified, 53);
    const policy = installedSourcePolicy(readFileSync('server/pinned/world-manifest.txt'), readFileSync('server/pinned/entity-manifest.txt'));
    const stageInstalled = async bytes => {
      const data = new Uint8Array(bytes), digest = sha(data), key = `installed/${policy.registryId}/${digest}`;
      if (!await bucket.get(key)) await bucket.put(key, data, {});
      return { sha256: digest, byteLength: data.length };
    };
    const roles = [];
    for (const role of policy.roles) {
      const data = readFileSync(join('web', role.path)), chunks = [];
      for (let at = 0; at < data.length; at += 1048576) chunks.push(await stageInstalled(data.subarray(at, at + 1048576)));
      roles.push({ path: role.path, sha256: role.sha256, byteLength: role.byteLength, chunks });
    }
    const definitionDigest = app.installedSources.definition().definitionDigest;
    const installedRoot = await stageInstalled(Buffer.concat(encodeSourceChunks({ schema: 'dragon-installed-source-index-1', registryId: policy.registryId, definitionDigest, roles })));
    await app.installedSources.install(adminHash, policy.registryId, installedRoot, 'owned-browser-source-install');
    const allocation = app.games.allocateGameId(hash), gameId = allocation.gameId;
    const { game } = await createPinnedCopyLoader()({ gameId, ownerId: OWNER });
    const stageGame = async bytes => {
      const put = await app.blobs.putImmutable(hash, { gameId, allocation, bytes: new Uint8Array(bytes) });
      return { sha256: put.sha256, byteLength: put.byteLength };
    };
    const all = createHash('sha256'), chunks = [];
    for (const bytes of encodeSourceChunks(game)) { all.update(bytes); chunks.push(await stageGame(bytes)); }
    const sourceDigest = all.digest('hex');
    const sourceRoot = await stageGame(Buffer.concat(encodeSourceChunks({ schema: 'dragon-game-source-index-1', gameId, sourceDigest, sourceByteLength: chunks.reduce((n, part) => n + part.byteLength, 0), chunks, dependencies: [] })));
    const dependencies = createHash('sha256');
    for (const part of canonicalSourceTokens({ chunks, dependencies: [] })) dependencies.update(part, 'utf8');
    storage.transactionSync(() => {
      sql.exec('INSERT INTO copy_objects VALUES(?,?,?,?)', gameId, sourceRoot.sha256, sourceRoot.byteLength, 'committed');
      sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', gameId, policy.registryId, definitionDigest, installedRoot.sha256, policy.profileRevision, sourceRoot.sha256, sourceRoot.byteLength, sourceDigest, sourceDigest, dependencies.digest('hex'));
    });
    const prepared = await app.games.prepareSnapshot(hash, { gameId, draftRevision: '1', metadata: { ...game.metadata }, source: sourceRoot, allocation });
    app.games.transaction(hash, { key: 'owned-browser-create-game', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, prepared));
    const adminCsrf = await mac(`csrf:${adminToken}`, secret); let serial = 0;
    let fetch = request => gateway.fetch(request, bindings);
    if (nodeService) {
      const service = createEditorService({ storage, bucket, env: { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: secret, EDITOR_DEFAULT_PASSWORD: password }, runtimeStager, frozenPublication: true });
      fetch = request => service.fetch(request);
    }
    async function manage(action) {
      const row = sql.exec('SELECT row_revision,draft_name FROM content_games WHERE game_id=?', gameId).toArray()[0];
      let path = 'listing', body = { action: 'unlist' };
      if (action === 'list') body = { action, expectedRowRevision: row.row_revision };
      else if (action === 'delete') { path = 'deletion'; body = { expectedRowRevision: row.row_revision, confirmationName: row.draft_name }; }
      else assert.equal(action, 'unlist');
      const reply = await fetch(new Request(`${origin}/api/games/${gameId}/${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${adminToken}`, 'X-CSRF-Token': adminCsrf, 'Idempotency-Key': `owned-browser-management-${++serial}`, 'If-Match': `"${row.row_revision}"` }, body: JSON.stringify(body) }));
      const value = await reply.json(); assert.equal(reply.status, 200, JSON.stringify(value)); return value;
    }
    return { storage, dbPath, app, fetch, manage, gameId, ownerId: OWNER, account: 'owned_author', password, chapters: [...game.chapterOrder] };
  } catch (error) { storage.close(); throw error; }
}
