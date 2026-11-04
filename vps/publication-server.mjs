// Trusted Node assembly; deliberately not a CLI or an environment-selected mode.
// Caller owns storage/bucket/transport lifetimes. Close this service before SQL.
import { config } from '../server/security.js';
import { createRuntimeStager } from './runtime-stage.mjs';
import { createDistributionPublisher } from './distribution-publisher.mjs';
import { createGameReclaimer } from './game-reclaimer.mjs';
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
  // 刪除遊戲後的 R2 回收需要 list/remove：只有傳入完整物件埠時才裝配，否則
  // purge 仍舊只動庫行並在回執裡報 RECLAIMER_UNCONFIGURED（不假裝已清理）。
  const purgeReclaimer = typeof r2.list === 'function' && typeof r2.remove === 'function'
    ? createGameReclaimer({ r2: { get: r2.get.bind(r2), putControl: r2.putControl.bind(r2), list: r2.list.bind(r2), remove: r2.remove.bind(r2) }, prefix })
    : undefined;
  const runtimeStager = createRuntimeStager({ r2: transport, prefix, verifyStaticResources });
  const publisher = createDistributionPublisher({ storage, r2: transport, prefix, verifyStaticResources });
  const drainer = createDistributionDrainer({ publisher, intervalMs });
  // A 路線第一版（可回滾）：同一個 publisher 的 drainOne 注入應用，讓上架／同意在
  // 同一次 HTTP 內推進到可見。EDITOR_SYNC_PUBLISH='0' 不注入＝舊協議；排程器照舊
  // 執行，兩種路徑並存一代。
  const distributionDrain = environment.EDITOR_SYNC_PUBLISH === '0' ? undefined : () => publisher.drainOne();
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
    server = await startEditorServer({ storage, bucket, env: environment, runtimeStager, frozenPublication: true, purgeReclaimer, distributionDrain, host, port, prepare });
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
