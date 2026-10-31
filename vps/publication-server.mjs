// Trusted Node assembly; deliberately not a CLI or an environment-selected mode.
// Caller owns storage/bucket/transport lifetimes. Close this service before SQL.
import { config } from '../server/security.js';
import { createRuntimeStager } from './runtime-stage.mjs';
import { createDistributionPublisher } from './distribution-publisher.mjs';
import { createDistributionDrainer } from './distribution-drainer.mjs';
import { startEditorServer } from './editor-server.mjs';

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
  await publisher.checkHead();
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
    status: () => Object.freeze({ state, distribution: drainer.status() }),
    close,
  });
}
