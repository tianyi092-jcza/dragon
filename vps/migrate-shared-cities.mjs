// 一次性資料遷移（用户 2026-11 決定）：共享據點的「名稱以父表為準＋四項默認值
// 從第一章回填」在現行代碼裡是讀取投影；本命令把投影寫成一個新修訂，讓已存檔
// 的舊遊戲（生產 rev1 = 舊 copyBuiltinGame 輸出）也收斂。走真實 PrivateDrafts.save：
// 同一 blob/snapshot/CAS/收據管線，不是直接改 SQL 或位元組。
//
// 用法（在 image 內、與 editor 相同的 env/volumes）：
//   docker run --rm --env-file publication.env --env-file editor.env \
//     -e EDITOR_DATA_DIR=/data -v /srv/dragon/data:/data ... \
//     <image> node vps/migrate-shared-cities.mjs [--game <gameId>] [--dry-run]
// 只寫新修訂；不改 copy_origins、不建立 release、不發布。輸出單行 JSON。
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parsePublicationEnvironment } from './publication-config.mjs';
import { openStorage } from './sqlite-port.mjs';
import { FileBucket } from './file-bucket.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const at = argv.indexOf('--game');
const requestedGame = at >= 0 ? argv[at + 1] : undefined;
if (at >= 0 && (!requestedGame || !/^[0-9a-f-]{36}$/.test(requestedGame))) {
  process.stdout.write(JSON.stringify({ event: 'migration-failed', reason: 'game id required' }) + '\n');
  process.exit(1);
}
const options = parsePublicationEnvironment(process.env);
const storage = openStorage(join(options.dataRoot, 'editor.sqlite'));
const report = value => process.stdout.write(JSON.stringify(value) + '\n');
let drafts;
try {
  const bucket = new FileBucket({ root: join(options.dataRoot, 'private-objects') });
  const { createEditorApplication } = await import('../server/editorapp.js');
  const { PrivateDrafts } = await import('../server/drafts.js');
  const Application = createEditorApplication(class SystemBase {}, { readSharedPortrait: async () => { throw new Error('portrait port unused'); } });
  // 同一個應用組裝（installed sources / blobs / games / policy），只是不開 HTTP。
  const application = new Application({ storage }, { ...process.env, EDITOR_BLOBS: bucket });
  const rows = storage.sql.exec('SELECT game_id, owner_id, draft_revision FROM content_games ORDER BY created_at, game_id').toArray();
  const targets = rows.filter(row => requestedGame === undefined || row.game_id === requestedGame);
  if (!targets.length) throw new Error('game not found');
  const outcomes = [];
  for (const row of targets) {
    const user = storage.sql.exec('SELECT id, role, epoch FROM users WHERE id=?', row.owner_id).toArray()[0];
    if (!user) throw new Error('game owner missing');
    // 系統主體只在本進程內有效；不寫 sessions、不簽發 cookie。
    const principal = () => ({ id: user.id, role: user.role, epoch: user.epoch, must_change: 0 });
    drafts = new PrivateDrafts({ storage, principal, games: application.games, blobs: application.blobs,
      definition: () => application.installedSources.definition(), operationGuard: () => {} });
    const before = await drafts.read('system', row.game_id, row.draft_revision);
    const byIdx = new Map(before.cityDefinitions.map(city => [city.runtimeSlot, city]));
    let mismatches = 0;
    for (const chapter of before.chapters) for (const city of chapter.cities) if (city.name !== byIdx.get(city.idx).name) mismatches++;
    const missingDefaults = before.cityDefinitions.filter(city => ['prod', 'growth', 'defence', 'troops'].some(field => !Number.isSafeInteger(city[field]))).length;
    const input = { metadata: before.metadata, resourceEdits: [], chapterEdits: [] };
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (dryRun) { outcomes.push({ gameId: row.game_id, revision: row.draft_revision, nameMismatches: mismatches, citiesMissingDefaults: missingDefaults, dryRun: true }); continue; }
    const saved = await drafts.save('system', row.game_id, row.draft_revision, 'migrate-shared-city-20261111', digest, input);
    const after = await drafts.read('system', row.game_id, saved.draftRevision);
    const afterIdx = new Map(after.cityDefinitions.map(city => [city.runtimeSlot, city]));
    let afterMismatches = 0;
    for (const chapter of after.chapters) for (const city of chapter.cities) if (city.name !== afterIdx.get(city.idx).name) afterMismatches++;
    const afterMissing = after.cityDefinitions.filter(city => ['prod', 'growth', 'defence', 'troops'].some(field => !Number.isSafeInteger(city[field]))).length;
    outcomes.push({ gameId: row.game_id, from: row.draft_revision, to: saved.draftRevision, changed: saved.draftRevision !== row.draft_revision,
      sourceDigest: saved.sourceDigest, nameMismatchesBefore: mismatches, nameMismatchesAfter: afterMismatches, citiesMissingDefaultsAfter: afterMissing });
  }
  report({ event: 'migration-done', dryRun, games: outcomes });
} catch (error) {
  report({ event: 'migration-failed', reason: String(error?.code ?? error?.message ?? error) });
  process.exitCode = 1;
} finally {
  storage.close();
}
