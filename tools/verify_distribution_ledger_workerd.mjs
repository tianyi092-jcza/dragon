// Same ledger contract in actual owned workerd/SQLite, plus instance restart.
// Fake receipt capability only; no application registration, production schema or R2 proof.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
let modulePath;
try { modulePath = createRequire(import.meta.url).resolve('miniflare'); }
catch { modulePath = join(process.env.APPDATA ?? '', 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js'); }
if (!existsSync(modulePath)) throw new Error('installed Miniflare required; no automatic install');
const { Miniflare } = await import(pathToFileURL(modulePath).href);
const scratch = resolve('.dragon-analysis'); mkdirSync(scratch, { recursive: true });
const own = mkdtempSync(join(scratch, 'frozen-ledger-workerd-'));
let mf, outbound = 0;
try {
  writeFileSync(join(own, 'fixture.mjs'), `
import { DurableObject } from 'cloudflare:workers';
import { FrozenDistributionLedger } from '../../server/distributionledger.js';
import { exerciseDistributionLedger } from '../../tools/fixtures/distribution-ledger.mjs';
export class LedgerFixture extends DurableObject {
  async fetch(request) {
    if (new URL(request.url).pathname === '/run') {
      const checks = exerciseDistributionLedger(() => {
        // Reset only these known tables in this newly-created private test DO.
        this.ctx.storage.transactionSync(() => {
          for (const name of ['content_distribution_chunks','content_distribution_events','content_distribution_state','fixture_authority']) this.ctx.storage.sql.exec('DROP TABLE IF EXISTS ' + name);
        });
        return { sql: this.ctx.storage.sql, transactionSync: fn => this.ctx.storage.transactionSync(fn) };
      });
      return Response.json({ checks });
    }
    if (new URL(request.url).pathname === '/status') {
      const ledger = new FrozenDistributionLedger({ storage: this.ctx.storage, verifyReceipt: () => { throw new Error('no receipt capability'); } });
      const tables = this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'content_distribution_%' ORDER BY name").toArray();
      const columns = tables.reduce((n, row) => n + this.ctx.storage.sql.exec('PRAGMA table_xinfo(' + row.name + ')').toArray().length, 0);
      const foreignKeys = tables.reduce((n, row) => n + this.ctx.storage.sql.exec('PRAGMA foreign_key_list(' + row.name + ')').toArray().length, 0);
      return Response.json({ ...ledger.status(), tables: tables.length, columns, foreignKeys });
    }
    return new Response('not found', { status: 404 });
  }
}
export default { fetch(request, env) { return env.OWNED.get(env.OWNED.idFromName('owned')).fetch(request); } };
`, { flag: 'wx' });
  const options = { modules: true, scriptPath: join(own, 'fixture.mjs'), compatibilityDate: '2026-01-01', compatibilityFlags: ['nodejs_compat'], modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }], durableObjects: { OWNED: { className: 'LedgerFixture', useSQLite: true } }, durableObjectsPersist: join(own, 'state'), host: '127.0.0.1', port: 0, outboundService: () => { outbound++; return new Response('outbound forbidden', { status: 403 }); } };
  mf = new Miniflare(options);
  let response = await mf.dispatchFetch('https://owned.test/run');
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), { checks: 30 });
  response = await mf.dispatchFetch('https://owned.test/status');
  assert.equal(response.status, 200, await response.clone().text());
  const before = await response.json();
  assert.equal(before.tables, 6); assert.equal(before.columns, 38); assert.equal(before.foreignKeys, 1);
  assert.equal(before.tailGeneration, 1); assert.equal(before.confirmedGeneration, 0); assert.equal(before.blockedReason, 'REMOTE_AHEAD');
  await mf.dispose(); mf = null;
  mf = new Miniflare(options);
  response = await mf.dispatchFetch('https://owned.test/status');
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), before);
  assert.equal(outbound, 0);
  process.stdout.write('frozen distribution workerd: 30 shared groups plus actual instance restart; 6 standalone tables / 38 columns / 1 FK; no outbound\n');
} finally { await mf?.dispose(); rmSync(own, { recursive: true, force: true }); }
