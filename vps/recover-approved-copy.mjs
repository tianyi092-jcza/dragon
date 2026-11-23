// Operator-only, local disk publication service. No version issuance or directory edits.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { parsePublicationEnvironment } from './publication-config.mjs';
import { openStorage } from './sqlite-port.mjs';
import { createDiskBucket } from './disk-bucket.mjs';
import { createRuntimeStager } from './runtime-stage.mjs';
import { FrozenPublicationProducer } from '../server/publicationproducer.js';
import { isGameId } from '../web/src/player/runtimecontract.js';

const [mode, gameId, releaseId] = process.argv.slice(2);
if (mode !== '--enqueue' || !isGameId(gameId) || !isGameId(releaseId)) throw Error('expected --enqueue GAME_UUID RELEASE_UUID');
const { dataRoot, bucketRoot, prefix, verifyStaticResources } = parsePublicationEnvironment(process.env);
const path = join(dataRoot, 'editor.sqlite');
if (!bucketRoot || !statSync(path).isFile()) throw Error('existing local publication store required');
const storage = openStorage(path);
try {
  const rows = (sql, ...args) => storage.sql.exec(sql, ...args).toArray();
  const current = () => {
    const [row] = rows(`SELECT r.* FROM content_releases r JOIN content_games g USING(game_id) JOIN publish_slots s USING(game_id) WHERE r.game_id=? AND r.release_id=? AND g.current_release_id=r.release_id AND g.listed=1 AND g.restricted=0 AND s.state='approved' AND r.ordinal='1.0' AND NOT EXISTS(SELECT 1 FROM content_deletion_fences f WHERE f.game_id=g.game_id)`, gameId, releaseId);
    if (!row) throw Error('expected approved, listed, current first version');
    return row;
  };
  const release = current();
  if (rows('SELECT generation FROM content_distribution_events WHERE operation_id=?', releaseId).length) console.log('already enqueued');
  else {
    const candidate = { gameId, releaseId, ordinal: release.ordinal, draftRevision: release.draft_revision, sourceDigest: release.source_digest };
    const snapshot = { identity: candidate, pack: rows('SELECT * FROM published_packs WHERE game_id=?', gameId)[0], chapters: rows('SELECT chapter_id,state_json FROM published_pack_chapters WHERE game_id=?', gameId), assets: rows('SELECT * FROM published_pack_assets WHERE game_id=?', gameId) };
    if (snapshot.pack?.revision !== candidate.draftRevision || snapshot.pack.source_digest !== candidate.sourceDigest) throw Error('pack identity mismatch');
    const stager = createRuntimeStager({ r2: createDiskBucket({ root: bucketRoot }), prefix, verifyStaticResources });
    const staged = await stager.stage(candidate, snapshot, () => { current(); });
    storage.transactionSync(() => {
      current();
      if (!rows('SELECT generation FROM content_distribution_events WHERE operation_id=?', releaseId).length) new FrozenPublicationProducer({ storage }).recordInTxn('publish', gameId, stager.verifyStaged(staged.ticket, candidate));
    });
    console.log('enqueued existing release; verify player registry after drain');
  }
} finally { storage.close(); }
