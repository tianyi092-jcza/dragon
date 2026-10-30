// Stage-0 retirement prototype fixture. Test-only: explicit retain/retire
// branches over an owned ledger. No product code, DDL, lock or DELETE ability.
import { createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function fail(code, message) {
  const error = new Error(message ?? code);
  error.code = code;
  throw error;
}

function canonical(checkpoint) {
  return JSON.stringify({ version: 1, authorityId: checkpoint.authorityId,
    retiredGenerations: [...checkpoint.retiredGenerations], anchorDigest: checkpoint.anchorDigest });
}

// A checkpoint is a NEW object with its own digest, never a reused operation
// digest. Validation is metadata-only: the events table, never chunks.
export function validateRetirementCheckpoint({ storage, checkpoint }) {
  if (!checkpoint || checkpoint.version !== 1 || !uuid(checkpoint.authorityId) ||
      !Array.isArray(checkpoint.retiredGenerations) || checkpoint.retiredGenerations.length < 1 ||
      !checkpoint.retiredGenerations.every(g => Number.isSafeInteger(g) && g >= 1) ||
      new Set(checkpoint.retiredGenerations).size !== checkpoint.retiredGenerations.length ||
      !digest(checkpoint.anchorDigest) || !digest(checkpoint.checkpointDigest)) fail('RETIREMENT_PROTOTYPE_CHECKPOINT');
  if (sha(canonical(checkpoint)) !== checkpoint.checkpointDigest) fail('RETIREMENT_PROTOTYPE_CHECKPOINT');
  const rows = storage.sql.exec('SELECT generation, operation_digest FROM content_distribution_events ORDER BY generation').toArray();
  if (rows.length === 0) fail('RETIREMENT_PROTOTYPE_CHECKPOINT');
  const digests = new Set(rows.map(row => row.operation_digest));
  if (digests.has(checkpoint.checkpointDigest)) fail('RETIREMENT_PROTOTYPE_CHECKPOINT');
  for (const generation of checkpoint.retiredGenerations) {
    if (generation > rows.length) fail('RETIREMENT_PROTOTYPE_CHECKPOINT');
  }
  if (!digests.has(checkpoint.anchorDigest)) fail('RETIREMENT_PROTOTYPE_CHECKPOINT');
  return Object.freeze({ authorityId: checkpoint.authorityId,
    retiredGenerations: Object.freeze([...checkpoint.retiredGenerations].sort((a, b) => a - b)),
    anchorDigest: checkpoint.anchorDigest, checkpointDigest: checkpoint.checkpointDigest });
}

function metadataOnly(storage, authorityId, generation) {
  const row = storage.sql.exec('SELECT generation, operation_id, kind, game_id, previous_digest, operation_digest, payload_digest, created_at FROM content_distribution_events WHERE generation=?', generation).toArray()[0];
  if (!row) fail('DISTRIBUTION_UNKNOWN');
  const identity = { version: 1, authorityId, generation: row.generation, operationId: row.operation_id,
    kind: row.kind, gameId: row.game_id, payloadDigest: row.payload_digest, previousDigest: row.previous_digest, createdAt: row.created_at };
  if (sha(JSON.stringify(identity)) !== row.operation_digest) fail('DISTRIBUTION_LEDGER_CORRUPT');
  return { identity, operationDigest: row.operation_digest };
}

export function createRetirementPrototypeReader({ storage, ledger, checkpoint }) {
  if (!storage?.sql || !ledger || typeof ledger.entry !== 'function') throw new TypeError('owned storage and ledger required');
  const pin = validateRetirementCheckpoint({ storage, checkpoint });
  const authorityId = ledger.status().authorityId;
  if (authorityId !== pin.authorityId) fail('RETIREMENT_PROTOTYPE_CHECKPOINT');
  const retired = new Set(pin.retiredGenerations);
  return Object.freeze({
    checkpoint: pin,
    read(generation) {
      if (!Number.isSafeInteger(generation) || generation < 1) fail('DISTRIBUTION_GENERATION');
      const authorityId = ledger.status().authorityId;
      if (authorityId !== pin.authorityId) fail('RETIREMENT_PROTOTYPE_CHECKPOINT');
      if (!retired.has(generation)) {
        if (generation > ledger.status().tailGeneration) fail('DISTRIBUTION_UNKNOWN');
        throw Object.assign(new Error('retained generation is not retired in this prototype'), { code: 'RETIREMENT_PROTOTYPE_NOT_RETIRED' });
      }
      // Retired: minimal identity credential from metadata only. The chunks
      // table is never touched; a missing body must not fail this branch.
      const { identity, operationDigest } = metadataOnly(storage, authorityId, generation);
      return Object.freeze({ generation: identity.generation, operationId: identity.operationId,
        kind: identity.kind, gameId: identity.gameId, operationDigest, previousDigest: identity.previousDigest,
        retired: true, checkpointDigest: pin.checkpointDigest });
    },
    readRetained(generation) {
      return ledger.entry(generation);
    },
  });
}
