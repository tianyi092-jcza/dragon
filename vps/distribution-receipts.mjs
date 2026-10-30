// Private R2 observation capabilities for FrozenDistributionLedger, not a publisher.
// No root writes, authority decisions, dependency admission, or backup reconciliation.
// Production callers must separately reconcile the remote head and verify resources.
import { createHash } from 'node:crypto';
import { MAX_METADATA_BYTES, isGameId, isDigest, parseJSON } from '../reader/runtimecontract.js';
import { publicationRootArchiveKey } from '../reader/publicationroot.js';
import { DISTRIBUTION_PAYLOAD_LIMIT } from '../server/distributionledger.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const kinds = new Set(['publish', 'listing', 'restriction', 'delete-fence', 'bootstrap']);
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function requireValue(condition, code = 'DISTRIBUTION_READBACK') { if (!condition) throw new Error(code); }
function header(stored, name) {
  const entries = Object.entries(stored?.headers ?? {}).filter(([key]) => key.toLowerCase() === name);
  requireValue(entries.length === 1 && typeof entries[0][1] === 'string');
  return entries[0][1];
}
function jsonType(stored) {
  const type = header(stored, 'content-type');
  requireValue(type === 'application/json' || type === 'application/json; charset=utf-8');
}
function etag(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\r\n]/.test(value); }
function matches(stored, expected) {
  requireValue(stored?.bytes instanceof Uint8Array && Buffer.from(stored.bytes).equals(expected));
  jsonType(stored);
}
function capture(record) {
  requireValue(record?.version === 1 && isGameId(record.authorityId) && isGameId(record.operationId) && Number.isSafeInteger(record.generation) && record.generation > 0 && kinds.has(record.kind));
  requireValue(record.kind === 'bootstrap' ? record.gameId === null && record.generation === 1 : isGameId(record.gameId));
  requireValue(record.generation === 1 ? record.previousDigest === null : isDigest(record.previousDigest));
  requireValue(isDigest(record.payloadDigest) && isDigest(record.operationDigest) && iso(record.createdAt));
  requireValue(record.payload instanceof Uint8Array && record.payload.byteLength > 0 && record.payload.byteLength <= DISTRIBUTION_PAYLOAD_LIMIT);
  const payload = Buffer.from(record.payload);
  requireValue(sha(payload) === record.payloadDigest);
  const identity = { version: 1, authorityId: record.authorityId, generation: record.generation, operationId: record.operationId, kind: record.kind, gameId: record.gameId, payloadDigest: record.payloadDigest, previousDigest: record.previousDigest, createdAt: record.createdAt };
  requireValue(sha(JSON.stringify(identity)) === record.operationDigest);
  const envelope = parseJSON(payload);
  requireValue(envelope?.version === 1 && envelope.projection && typeof envelope.projection === 'object' && !Array.isArray(envelope.projection));
  // Exact materialization of the frozen member, never current SQL or a new time.
  // Projection semantics/resource closure belong to the producer and reader.
  const projection = Buffer.from(JSON.stringify(envelope.projection));
  requireValue(projection.length <= MAX_METADATA_BYTES);
  const control = { version: 2, authorityId: identity.authorityId, generation: identity.generation, operationId: identity.operationId, operationDigest: record.operationDigest, payloadDigest: identity.payloadDigest, previousOperationDigest: identity.previousDigest, digest: sha(projection) };
  const root = Buffer.from(JSON.stringify(control));
  return { identity, operationDigest: record.operationDigest, projection, control, root, rootDigest: sha(root) };
}
function claims(value, captured) {
  const c = captured.control;
  requireValue(value && !Array.isArray(value) && value.authorityId === c.authorityId && value.generation === c.generation && value.operationId === c.operationId && value.operationDigest === c.operationDigest && value.payloadDigest === c.payloadDigest && value.rootDigest === captured.rootDigest && etag(value.rootETag) && iso(value.visibleAt));
  return { authorityId: value.authorityId, generation: value.generation, operationId: value.operationId, operationDigest: value.operationDigest, payloadDigest: value.payloadDigest, rootDigest: value.rootDigest, rootETag: value.rootETag, visibleAt: value.visibleAt };
}

export function createDistributionReceipts({ r2, prefix = '' }) {
  if (typeof r2?.get !== 'function' || typeof r2?.putImmutable !== 'function' || typeof prefix !== 'string' || !(prefix === '' || /^test\/[A-Za-z0-9_-]{1,100}\/$/.test(prefix))) throw new TypeError('private R2 port and exact publication prefix required');
  const tickets = new WeakMap();
  const rootKey = prefix + 'control/current.json';
  const receiptKey = c => `${prefix}control/receipts/${c.control.authorityId}/${c.control.generation}/${c.operationDigest}.json`;
  const issue = value => { const ticket = Object.freeze({}); tickets.set(ticket, Object.freeze(value)); return ticket; };
  function verifyReceipt(ticket, expected) {
    const value = tickets.get(ticket);
    requireValue(value && ['authorityId', 'generation', 'operationId', 'operationDigest', 'payloadDigest'].every(key => value[key] === expected?.[key]), 'DISTRIBUTION_RECEIPT');
    return value;
  }
  function rootObservation(stored, c) {
    matches(stored, c.root);
    const rootETag = header(stored, 'etag'), modified = header(stored, 'last-modified');
    // S3 HTTP Last-Modified has second precision. Never substitute local time,
    // a queued timestamp, or a user-controlled custom metadata field.
    const time = Date.parse(modified);
    requireValue(etag(rootETag) && Number.isFinite(time) && new Date(time).toUTCString() === modified);
    return claims({ ...c.control, rootDigest: c.rootDigest, rootETag, visibleAt: new Date(time).toISOString() }, c);
  }
  async function persisted(c) {
    const stored = await r2.get(receiptKey(c), { maxBytes: 4096 });
    if (stored === null) return null;
    requireValue(stored?.bytes instanceof Uint8Array && stored.bytes.byteLength > 0 && stored.bytes.byteLength <= 4096);
    jsonType(stored);
    const value = claims(parseJSON(stored.bytes), c);
    // Reject injected fields, alternative encodings and conflicting observations.
    requireValue(Buffer.from(stored.bytes).equals(Buffer.from(JSON.stringify(value))));
    return value;
  }
  async function recover(record) {
    const c = capture(record), value = await persisted(c);
    return value === null ? null : issue(value);
  }
  // Payload-free recovery for a retired generation: the receipt object is an
  // independent immutable object that stage-1 never cleans. Validates the exact
  // stored receipt against the ledger's own metadata identity, without any
  // content rebuild. Retained paths keep using capture(); no format is changed.
  async function recoverRetired(record) {
    requireValue(record?.retired === true && isGameId(record.authorityId) && isGameId(record.operationId) && Number.isSafeInteger(record.generation) && record.generation > 0 && isDigest(record.operationDigest) && isDigest(record.payloadDigest) && isDigest(record.checkpointDigest));
    const stored = await r2.get(`${prefix}control/receipts/${record.authorityId}/${record.generation}/${record.operationDigest}.json`, { maxBytes: 4096 });
    if (stored === null) return null;
    requireValue(stored?.bytes instanceof Uint8Array && stored.bytes.byteLength > 0 && stored.bytes.byteLength <= 4096);
    jsonType(stored);
    const value = parseJSON(stored.bytes);
    requireValue(value && !Array.isArray(value) && value.authorityId === record.authorityId && value.generation === record.generation && value.operationId === record.operationId && value.operationDigest === record.operationDigest && value.payloadDigest === record.payloadDigest && isDigest(value.rootDigest) && etag(value.rootETag) && iso(value.visibleAt));
    // Reject injected fields and alternative encodings, same as persisted().
    requireValue(Buffer.from(stored.bytes).equals(Buffer.from(JSON.stringify(value))));
    return issue(value);
  }
  async function observe(record) {
    const c = capture(record);
    const old = await persisted(c);
    if (old !== null) return issue(old);
    const first = rootObservation(await r2.get(rootKey, { maxBytes: 4096 }), c);
    matches(await r2.get(`${prefix}projections/${c.control.generation}/${c.control.digest}/projection.json`, { maxBytes: c.projection.byteLength }), c.projection);
    const second = rootObservation(await r2.get(rootKey, { maxBytes: 4096 }), c);
    requireValue(JSON.stringify(first) === JSON.stringify(second), 'DISTRIBUTION_READBACK_CHANGED');
    const bytes = Buffer.from(JSON.stringify(first));
    // This immutable, minimal receipt must be durable BEFORE a caller confirms
    // SQLite or permits the next root. A failed PUT/readback remains unknown.
    await r2.putImmutable(receiptKey(c), bytes, 'application/json');
    const saved = await persisted(c);
    requireValue(saved !== null && JSON.stringify(saved) === JSON.stringify(first));
    return issue(saved);
  }
  // Shape helper for a future CAS publisher: no I/O or authority to switch roots.
  function expectedObjects(record) {
    const c = capture(record);
    return { root: { key: rootKey, bytes: new Uint8Array(c.root), contentType: 'application/json' }, rootArchive: { key: prefix + publicationRootArchiveKey(c.control), bytes: new Uint8Array(c.root), contentType: 'application/json' }, projection: { key: `${prefix}projections/${c.control.generation}/${c.control.digest}/projection.json`, bytes: new Uint8Array(c.projection), contentType: 'application/json' }, receiptKey: receiptKey(c) };
  }
  return Object.freeze({ observe, recover, recoverRetired, verifyReceipt, expectedObjects });
}
