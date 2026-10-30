// Internal read-only diagnostic, not an inventory seal or deletion capability.
import { isGameId } from '../reader/runtimecontract.js';
import { inspectFrozenGameReferences } from '../server/deletionfrozenrefs.js';
import { inspectCatalogObjectReferences } from './deletion-runtime-refs.mjs';

export async function inspectFrozenCatalogObjects({ ledger, r2, gameId, prefix = '', maxGenerations = 1000, maxRuntimes = 1000, maxReferences = 50000, verifyBodies = false, maxBodyBytes = 268435456 }) {
  const bounded = (value, maximum) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
  if (!isGameId(gameId) || typeof ledger?.status !== 'function' || typeof ledger?.entry !== 'function' || typeof r2?.get !== 'function' ||
      typeof prefix !== 'string' || !(prefix === '' || /^test\/[A-Za-z0-9_-]{1,100}\/$/.test(prefix)) ||
      !bounded(maxGenerations, 1000) || !bounded(maxRuntimes, 1000) || !bounded(maxReferences, 100000) ||
      typeof verifyBodies !== 'boolean' || !bounded(maxBodyBytes, 1073741824)) {
    throw new TypeError('bounded frozen catalog inspection required');
  }
  // Capture the complete local head, including confirmed progress and blocks,
  // not merely the generation count. No transaction is held across provider I/O.
  const head = { ...ledger.status() }, signature = JSON.stringify(head);
  const unchanged = () => {
    if (JSON.stringify(ledger.status()) !== signature) throw new Error('DELETE_CATALOG_HEAD_CHANGED');
  };
  const frozenReferences = inspectFrozenGameReferences(ledger, gameId, { maxGenerations, maxRuntimeReferences: maxRuntimes });
  unchanged();
  const guardedProvider = { async get(key, options) {
    unchanged();
    const stored = await r2.get(key, options);
    unchanged();
    return stored;
  } };
  const resourceReferences = await inspectCatalogObjectReferences({ r2: guardedProvider, catalogRuntimeReferences: frozenReferences.catalogRuntimeReferences, prefix, maxRuntimes, maxReferences, verifyBodies, maxBodyBytes });
  unchanged();
  // Partition observed object edges, not objects by the age of any one index.
  // A shared image can have both historical and latest-local references. The
  // local tail may be unconfirmed; neither partition is deletion eligibility.
  const headIndexes = new Map(frozenReferences.headRuntimeReferences.map(ref => [ref.key, ref.gameId]));
  const historicalIndexes = new Map(frozenReferences.historicalOnlyRuntimeReferences.map(ref => [ref.key, ref.gameId]));
  const objectFrontier = { basis: 'local-frozen-tail', tailGeneration: head.tailGeneration,
    objects: resourceReferences.objects.map(row => {
      const headReferences = [], historicalReferences = [];
      for (const ref of row.references) {
        if (headIndexes.get(ref.indexKey) === ref.gameId) headReferences.push({ ...ref });
        else if (historicalIndexes.get(ref.indexKey) === ref.gameId) historicalReferences.push({ ...ref });
        else throw new Error('DELETE_CATALOG_REFERENCE_UNKNOWN');
      }
      return { key: row.key, headReferences, historicalReferences };
    }),
  };
  // This independent view may overlap BOTH tail partitions. A pending newer
  // catalog must not erase the references in the last locally confirmed one.
  const confirmedIndexes = new Map(frozenReferences.confirmedRuntimeReferences.map(ref => [ref.key, ref.gameId]));
  const confirmedObjectFrontier = { basis: 'local-confirmed-generation', confirmedGeneration: head.confirmedGeneration,
    objects: resourceReferences.objects.map(row => ({ key: row.key,
      confirmedReferences: row.references.filter(ref => confirmedIndexes.get(ref.indexKey) === ref.gameId).map(ref => ({ ...ref })),
    })),
  };
  return {
    gameId, head, frozenReferences, resourceReferences, objectFrontier, confirmedObjectFrontier,
    // Two equal observations cannot establish a writer lease, provider snapshot,
    // SQL/legacy/backup closure, exclusive ownership, or permission to delete.
    writerLeaseHeld: false, providerSnapshotProven: false, catalogCoverageProven: false,
    resourceBodiesVerified: resourceReferences.resourceBodiesVerified, exclusiveOwnershipProven: false,
    deleteAllowed: false, physicalCleanupProven: false,
  };
}
