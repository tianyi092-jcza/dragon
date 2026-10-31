// Startup registration of the operator-staged fixed source (option C).
// A fresh deployment has no `tianyi` row until the first request, so the normal
// admin "register pinned source" click is unavailable before anyone can log in;
// without a row every 新建遊戲/完整副本 answers 404 SOURCE_NOT_REGISTERED.
//
// This runs the real InstalledSourceCatalog.install path, so it still verifies
// every pinned chunk and still writes an auditable source_operations receipt
// (actor = the seeded administrator). It is not a silent trust shortcut:
// a drifted pinned byte set fails closed and asks for the documented migration.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { InstalledSourceCatalog } from '../server/sourcecatalog.js';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { passwordHash } from '../server/security.js';

const OWNER_ACCOUNT = 'tianyi';
const REPLACEMENT_TOKEN = '0'.repeat(64); // Synthetic authority; the owner row carries the identity.

function manifest(path) { return new TextEncoder().encode(readFileSync(new URL(path, import.meta.url), 'utf8')); }

// Mirrors editorapp.seed(): same columns, default password, must_change=1.
// A verifier asserts the resulting row can log in with that same password.
function ensureOwner(storage, defaultPassword) {
  const existing = storage.sql.exec("SELECT id,role,epoch FROM users WHERE account=?", OWNER_ACCOUNT).toArray()[0];
  if (existing) {
    if (existing.role !== 'admin') throw new Error('SOURCE_REGISTRATION_OWNER_NOT_ADMIN');
    return existing;
  }
  const id = randomUUID(), encoded = passwordHash(defaultPassword);
  storage.transactionSync(() => {
    if (storage.sql.exec("SELECT id FROM users WHERE account=?", OWNER_ACCOUNT).toArray()[0]) return;
    storage.sql.exec("INSERT INTO users VALUES(?,?,'admin',?,0,1,1,1,'','','','')", id, OWNER_ACCOUNT, encoded);
  });
  return storage.sql.exec("SELECT id,role,epoch FROM users WHERE account=?", OWNER_ACCOUNT).toArray()[0];
}

export async function registerPinnedSource({ storage, bucket, env }) {
  if (typeof storage?.sql?.exec !== 'function' || typeof storage?.transactionSync !== 'function' ||
      typeof bucket?.get !== 'function' || typeof bucket?.put !== 'function') throw new TypeError('actual SQLite/R2 ports required');
  if (typeof env?.EDITOR_DEFAULT_PASSWORD !== 'string' || !env.EDITOR_DEFAULT_PASSWORD) throw new Error('SOURCE_REGISTRATION_PASSWORD_MISSING');
  let staged;
  try { staged = JSON.parse(env.EDITOR_INSTALLED_SOURCE_ROOT); } catch { throw new Error('SOURCE_REGISTRATION_NOT_STAGED'); }
  if (!staged || typeof staged.registryId !== 'string' || !staged.root) throw new Error('SOURCE_REGISTRATION_NOT_STAGED');

  const policy = installedSourcePolicy(manifest('../server/pinned/world-manifest.txt'), manifest('../server/pinned/entity-manifest.txt'));
  const owner = ensureOwner(storage, env.EDITOR_DEFAULT_PASSWORD);
  const catalog = new InstalledSourceCatalog({
    storage, bucket,
    principal: () => ({ id: owner.id, role: 'admin', must_change: 0, epoch: owner.epoch }),
    policy,
  });
  const definition = catalog.definition();
  if (staged.registryId !== definition.registryId) throw new Error('SOURCE_REGISTRATION_REGISTRY_MISMATCH');

  const row = storage.sql.exec('SELECT * FROM installed_sources WHERE registry_id=?', definition.registryId).toArray()[0];
  if (row) {
    if (row.definition_digest === definition.definitionDigest && row.root_digest === staged.root.sha256 &&
        row.root_byte_length === staged.root.byteLength) {
      return Object.freeze({ status: 'already-registered', registryId: definition.registryId, rootDigest: row.root_digest, registeredBy: row.registered_by });
    }
    // Pinned bytes moved under an existing registration: that is the documented
    // operator migration, never an automatic overwrite.
    throw new Error('SOURCE_REGISTRATION_CONFLICT');
  }
  // Deterministic key: the same pinned root replays the same receipt instead of
  // stacking receipts on every restart. Full verification happens here.
  const operationKey = `startup-${staged.root.sha256.slice(0, 32)}`;
  const receipt = await catalog.install(REPLACEMENT_TOKEN, definition.registryId, staged.root, operationKey);
  return Object.freeze({ status: 'registered', registryId: receipt.registryId, rootDigest: receipt.rootDigest, registeredBy: owner.id });
}
