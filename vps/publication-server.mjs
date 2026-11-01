// Trusted Node assembly; deliberately not a CLI or an environment-selected mode.
// Caller owns storage/bucket/transport lifetimes. Close this service before SQL.
import { config } from '../server/security.js';
import { createRuntimeStager } from './runtime-stage.mjs';
import { createDistributionPublisher } from './distribution-publisher.mjs';
import { createDistributionDrainer } from './distribution-drainer.mjs';
import { startEditorServer } from './editor-server.mjs';
import { isRemoteUnreachable } from './r2reachability.mjs';

export async function startPublicationServer({ storage, bucket, env, r2, verifyStaticResources, intervalMs, prefix = '', host = '127.0.0.1', port = 8787, prepare }) {
  const environment = { ...env };
  config(environment);
  if (typeof storage?.sql?.exec !== 'function' || typeof storage?.transactionSync !== 'function' ||
      typeof bucket?.get !== 'function' || typeof bucket?.put !== 'function' ||
      typeof r2?.get !== 'function' || typeof r2?.putImmutable !== 'function' || typeof r2?.putControl !== 'function' ||
      typeof verifyStaticResources !== 'function' || !Number.isInteger(intervalMs) || intervalMs < 1 || intervalMs > 2147483647 ||
      !['127.0.0.1', '0.0.0.0'].includes(host) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError('trusted publication ports, static verifier, interval and listen address required');
  }
  const transport = Object.freeze({ get: r2.get.bind(r2), putImmutable: r2.putImmutable.bind(r2), putControl: r2.putControl.bind(r2) });
  const runtimeStager = createRuntimeStager({ r2: transport, prefix, verifyStaticResources });
  const publisher = createDistributionPublisher({ storage, r2: transport, prefix, verifyStaticResources });
  const drainer = createDistributionDrainer({ publisher, intervalMs });
  // A restored/foreign/legacy remote authority must be rejected before listening.
  // This may persist a recovery lock; startup failure is not a SQL rollback.
  // B8：R2 不是開機條件。只有「傳輸層不可達」才降級啟動（工作台仍可編輯），
  // 且分發狀態照舊由同一 publisher 判定（上架/分發一律待確認）；任何已觀測到的
  // 權威事實（REMOTE_AHEAD／REMOTE_GAP／LEGACY_PENDING／AUTHORITY_MISMATCH…）
  // 仍舊 fail-closed，不降級、不繼續寫。
  let remote = 'verified';
  try { await publisher.checkHead(); }
  catch (error) {
    if (!isRemoteUnreachable(error)) throw error;
    remote = 'unreachable';
  }
  let server, closing, state = 'starting';
  function close() {
    if (closing) return closing;
    state = 'stopping';
    // Stop accepting HTTP and stop scheduling together. An already accepted
    // publish may still commit pending; the next process resumes that exact row.
    // allSettled is essential: one failure must not skip waiting on the other.
    closing = Promise.allSettled([
      Promise.resolve().then(() => server?.close()),
      Promise.resolve().then(() => drainer.stop()),
    ]).then(results => {
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) { state = 'close-failed'; throw new AggregateError(failures.map(result => result.reason), 'publication service close failed'); }
      state = 'stopped';
    });
    return closing;
  }
  try {
    server = await startEditorServer({ storage, bucket, env: environment, runtimeStager, frozenPublication: true, host, port, prepare });
    if (!drainer.start()) throw new Error('DISTRIBUTION_SCHEDULER_UNAVAILABLE');
    state = 'running';
  } catch (error) {
    try { await close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'publication service startup and cleanup failed'); }
    throw error;
  }
  return Object.freeze({
    address: server.address,
    // remote 只說「開機時有沒有讀到遠端根」，不是公開可見性或已確認分發。
    status: () => Object.freeze({ state, remote, distribution: drainer.status() }),
    close,
  });
}
