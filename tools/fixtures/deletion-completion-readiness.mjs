// Stage-1 completion gate, fixture-only. Fail-closed readiness assessment for the
// deletion completion exit (doc rows 224/303). No product code, no DELETE grant,
// no 410/name-release surface. deleteAllowed stays hardcoded false in product;
// this evaluator reports per-requirement evidence and opens only on complete
// evidence. A synthetic positive control proves the gate is live logic.
import { createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function rows(sql, query, ...values) {
  return sql.exec(query, ...values).toArray();
}
// Every requirement is explicit. `met: false` names missing evidence; nothing is
// inferred from silence, and silence never opens the gate.
export function assessDeletionCompletion({ sql, ledger, gameId, fenceGeneration, checkpointDigest, cleanupReceipt, backupPurgeReceipts = [], writerDrainProof = null, sqlScrubReceipt = null, privatePurgeReceipt = null, nameReleaseReceipt = null, cacheClearReceipt = null, recoveryExclusionProof = null }) {
  if (!sql || typeof ledger?.entry !== 'function' || typeof gameId !== 'string' || !Number.isSafeInteger(fenceGeneration) || fenceGeneration < 1 || !digest(checkpointDigest)) throw new TypeError('owned SQL, live ledger, target identity and checkpoint binding required');
  const requirements = [];
  const need = (id, met, evidence) => requirements.push(Object.freeze({ id, met: met === true, evidence }));
  need('writers-drained', !!writerDrainProof && writerDrainProof.checkpointDigest === checkpointDigest, writerDrainProof ?? 'no cross-process writer drain condition verified');
  let retiredOk = false, retiredEvidence = 'delete-fence generation not covered by a checkpoint pin';
  try {
    const read = ledger.entry(fenceGeneration);
    if (read?.retired === true && read?.checkpointDigest === checkpointDigest && read?.gameId === gameId && cleanupReceipt?.checkpointDigest === checkpointDigest && Array.isArray(cleanupReceipt?.retiredGenerations) && cleanupReceipt.retiredGenerations.includes(fenceGeneration)) {
      retiredOk = true; retiredEvidence = { checkpointDigest, cleanedGenerations: [...cleanupReceipt.retiredGenerations] };
    } else retiredEvidence = 'pin coverage or cleanup-complete receipt mismatch';
  } catch (error) { retiredEvidence = `retired read failed: ${error?.code ?? error?.message}`; }
  need('ledger-retired-covered', retiredOk, retiredEvidence);
  need('sql-scrubbed', !!sqlScrubReceipt && sqlScrubReceipt.gameId === gameId, sqlScrubReceipt ?? 'no verified target SQL scrub record');
  need('private-writes-purged', !!privatePurgeReceipt && privatePurgeReceipt.gameId === gameId, privatePurgeReceipt ?? 'no verified private-write purge record');
  let cascadedOk = false, cascadeEvidence = 'cascade tables unreadable';
  try {
    const trialsTable = rows(sql, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='trial_sessions'")[0]?.n ?? 0;
    const trials = trialsTable > 0 ? rows(sql, "SELECT COUNT(*) AS n FROM trial_sessions WHERE game_id=? AND state='active'", gameId)[0]?.n ?? -1 : 0;
    const publishedTable = rows(sql, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='published_games'")[0]?.n ?? 0;
    const published = publishedTable > 0 ? rows(sql, 'SELECT COUNT(*) AS n FROM published_games WHERE game_id=?', gameId)[0]?.n ?? -1 : 0;
    cascadedOk = trials === 0 && published === 0;
    cascadeEvidence = cascadedOk ? 'no active trials, no published rows' : `residual cascade rows: trials=${trials} published=${published}`;
  } catch (error) { cascadeEvidence = `cascade read failed: ${error?.code ?? error?.message}`; }
  need('trial-publish-cascaded', cascadedOk, cascadeEvidence);
  let namesGone = false, namesEvidence = 'name bindings unreadable';
  try {
    const namesTable = rows(sql, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='content_names'")[0]?.n ?? 0;
    const usedTable = rows(sql, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='content_used_ids'")[0]?.n ?? 0;
    const names = namesTable > 0 ? rows(sql, 'SELECT COUNT(*) AS n FROM content_names WHERE game_id=?', gameId)[0]?.n ?? -1 : 0;
    const used = usedTable > 0 ? rows(sql, 'SELECT COUNT(*) AS n FROM content_used_ids WHERE game_id=?', gameId)[0]?.n ?? -1 : 0;
    namesGone = (names === 0 && used === 0) || !!nameReleaseReceipt;
    namesEvidence = namesGone ? (nameReleaseReceipt ? 'release record presented' : 'no name/used-id rows remain') : `bindings remain: names=${names} used=${used}`;
  } catch (error) { namesEvidence = `name read failed: ${error?.code ?? error?.message}`; }
  need('names-released', namesGone && !!nameReleaseReceipt, nameReleaseReceipt ?? namesEvidence);
  need('caches-cleared', !!cacheClearReceipt && cacheClearReceipt.gameId === gameId, cacheClearReceipt ?? 'no verified cache clearing record');
  const purges = Array.isArray(backupPurgeReceipts) ? backupPurgeReceipts : [];
  const purgesOk = purges.length > 0 && purges.every(r => r?.target === gameId && digest(r?.manifestDigest) && digest(r?.purgeDigest) && Number.isSafeInteger(r?.fileCount) && r.fileCount >= 0);
  need('backups-purged', purgesOk, purges.length === 0 ? 'no backup purge receipts' : purges);
  need('recovery-excludes-target', !!recoveryExclusionProof && recoveryExclusionProof.target === gameId, recoveryExclusionProof ?? 'no restore-exclusion proof from a purged backup');
  const deleteAllowed = requirements.every(r => r.met);
  return Object.freeze({ mode: 'DELETION_COMPLETION_READINESS_FIXTURE_ONLY_NO_DELETE_GRANT', target: gameId, checkpointDigest, deleteAllowed, requirements: Object.freeze(requirements) });
}
// Synthetic positive control: every evidence slot satisfied by construction.
// Labeled synthetic; proves the gate is live logic, not a hardcoded constant.
export function syntheticFullEvidence({ gameId, checkpointDigest }) {
  const stamp = { target: gameId, checkpointDigest };
  return { writerDrainProof: { ...stamp }, sqlScrubReceipt: { gameId }, privatePurgeReceipt: { gameId }, nameReleaseReceipt: { gameId }, cacheClearReceipt: { gameId }, backupPurgeReceipts: [{ target: gameId, manifestDigest: sha('manifest'), purgeDigest: sha('purged'), fileCount: 2 }], recoveryExclusionProof: { target: gameId }, syntheticPositiveControl: true };
}
