// Internal, read-only diagnostic over a trusted FrozenDistributionLedger.
// Not an authorization boundary, R2 inventory, cleanup plan or delete capability.
import { isGameId, parseJSON, sameIdentity, validateRuntimeReference } from '../reader/runtimecontract.js';
import { validatePublicationCatalog, projectPublicationCatalog } from './publicationcatalog.js';
import { fail } from './security.js';
const check = value => { if (!value) fail(503, 'DELETE_FROZEN_REFERENCE_INVALID'); };
function fields(value, allowed) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).length === allowed.length && allowed.every(key => Object.hasOwn(value, key)));
}
export function inspectFrozenGameReferences(ledger, gameId, { maxGenerations = 1000, maxRuntimeReferences = 1000 } = {}) {
  if (!isGameId(gameId) || !Number.isSafeInteger(maxGenerations) || maxGenerations < 1 || maxGenerations > 1000 || !Number.isSafeInteger(maxRuntimeReferences) || maxRuntimeReferences < 1 || maxRuntimeReferences > 100000) throw new TypeError('bounded frozen reference inspection required');
  const before = ledger.status();
  if (before.tailGeneration > maxGenerations) fail(503, 'DELETE_FROZEN_SCAN_BUDGET');
  const entries = [], retiredGenerations = [], runtimes = new Map(), catalogRuntimes = new Map(), headKeys = new Set(), confirmedKeys = new Set();
  for (let generation = 1; generation <= before.tailGeneration; generation++) {
    const entry = ledger.entry(generation);
    // Retired generations carry only the minimal identity credential: their
    // content is not inventoried here. Absence from the reference partitions
    // below is explicitly NOT proof that their objects are unreferenced.
    if (entry.retired === true) {
      retiredGenerations.push(generation);
      entries.push({ generation, operationDigest: entry.operationDigest, payloadDigest: entry.payloadDigest,
        state: entry.state, eventTargetsGame: entry.gameId === gameId, retired: true, checkpointDigest: entry.checkpointDigest });
      continue;
    }
    // entry verifies the actual payload bytes and permanent digest chain. Never
    // select by event.gameId: another game's event carries the global catalog.
    const envelope = parseJSON(entry.payload);
    // The producer emits JSON.stringify bytes. Reject alternate encodings and
    // duplicate keys rather than silently discard hidden historical content.
    const encoded = new TextEncoder().encode(JSON.stringify(envelope));
    check(encoded.length === entry.payload.length && encoded.every((byte, index) => byte === entry.payload[index]));
    fields(envelope, entry.kind === 'publish' ? ['version', 'projection', 'catalog', 'runtime'] : ['version', 'projection', 'catalog']);
    check(envelope.version === 1);
    const catalog = validatePublicationCatalog(envelope.catalog, entry);
    check(JSON.stringify(projectPublicationCatalog(catalog, entry)) === JSON.stringify(envelope.projection));
    if (entry.kind === 'publish') {
      const runtime = envelope.runtime;
      fields(runtime, ['gameId', 'releaseId', 'ordinal', 'revision', 'sourceDigest', 'chapters', 'runtime']);
      fields(runtime.runtime, ['key', 'sha256', 'byteLength']);
      validateRuntimeReference(runtime, runtime.runtime);
      const published = catalog.games.find(game => game.gameId === entry.gameId)?.current;
      check(runtime.gameId === entry.gameId && published && sameIdentity(runtime, published));
      check(JSON.stringify(runtime.chapters) === JSON.stringify(published.chapters) && JSON.stringify(runtime.runtime) === JSON.stringify(published.runtime));
    }
    // Capture all games BEFORE target filtering. A later resource scan needs
    // other games' historical indexes too, even when the target is absent.
    headKeys.clear();
    for (const game of catalog.games) if (game.current) {
      const ref = game.current.runtime, old = catalogRuntimes.get(ref.key);
      headKeys.add(ref.key);
      if (generation === before.confirmedGeneration) confirmedKeys.add(ref.key);
      check(!old || old.gameId === game.gameId && old.sha256 === ref.sha256 && old.byteLength === ref.byteLength);
      if (!old) {
        if (catalogRuntimes.size >= maxRuntimeReferences) fail(503, 'DELETE_FROZEN_RUNTIME_BUDGET');
        catalogRuntimes.set(ref.key, { gameId: game.gameId, ...ref });
      }
    }
    const target = catalog.games.find(game => game.gameId === gameId);
    if (!target) continue;
    if (target.current) {
      const ref = target.current.runtime, old = runtimes.get(ref.key);
      check(!old || old.sha256 === ref.sha256 && old.byteLength === ref.byteLength);
      runtimes.set(ref.key, { ...ref });
    }
    entries.push({ generation, operationDigest: entry.operationDigest, payloadDigest: entry.payloadDigest,
      state: entry.state, eventTargetsGame: entry.gameId === gameId,
      containsContent: target.current !== null || target.announcements.length > 0,
      deletedMarker: target.deleted, otherGameCount: catalog.games.length - 1 });
  }
  // This synchronous scan does not hold an external writer lease. Detect a
  // changed local head; provider/cache/backup closure is explicitly still absent.
  check(JSON.stringify(ledger.status()) === JSON.stringify(before));
  return { gameId, authorityId: before.authorityId, scannedGenerations: before.tailGeneration,
    blockedReason: before.blockedReason, confirmedGeneration: before.confirmedGeneration, retiredGenerations,
    // Local acknowledgement is not a provider snapshot. Zero means no locally
    // confirmed generation, not proof that no remote objects remain referenced.
    confirmedRuntimeReferences: [...catalogRuntimes.values()].filter(ref => confirmedKeys.has(ref.key)).map(ref => ({ ...ref })),
    entries, runtimeReferences: [...runtimes.values()],
    catalogRuntimeReferences: [...catalogRuntimes.values()],
    // Local frozen tail may still be pending: neither this partition nor a
    // missing head reference means remote retirement or safe reclamation.
    headRuntimeReferences: [...catalogRuntimes.values()].filter(ref => headKeys.has(ref.key)).map(ref => ({ ...ref })),
    historicalOnlyRuntimeReferences: [...catalogRuntimes.values()].filter(ref => !headKeys.has(ref.key)).map(ref => ({ ...ref })),
    deleteAllowed: false, physicalCleanupProven: false };
}
