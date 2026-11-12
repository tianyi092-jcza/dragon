// 一次性运维脚本：清空某游戏副本的武将库（父表 game.generals），保留其它一切。
// 走 GameCopyStore.writeModule('generals', {remove:[...]})，由 store 重算 copy_digest，
// 不做裸 SQL 改写，避免 digest 与数据脱节（read() 会校验 sha(data_json)）。
// 用法：node tools/clear_copy_generals_once.mjs <gameId> [--store .dragon-analysis/dev] [--dry]
import { openStorage } from '../vps/sqlite-port.mjs';
import { GameCopyStore } from '../server/gamecopy.js';

const gameId = process.argv[2];
const at = process.argv.indexOf('--store');
const storeDir = at >= 0 ? process.argv[at + 1] : '.dragon-analysis/dev/editor.sqlite';
const dry = process.argv.includes('--dry');
if (!/^[a-f0-9-]{36}$/.test(gameId ?? '')) throw new Error('gameId required');

const storage = openStorage(storeDir);
const row = storage.sql.exec('SELECT owner_id FROM content_games WHERE game_id=?', gameId).toArray()[0];
if (!row) throw new Error('game not found in content_games');
const actor = { id: row.owner_id, must_change: 0, epoch: 1 };
const store = new GameCopyStore({ storage, principal: () => actor, games: { assertNotDeleting: () => {}, listOwn: () => [] } });

const before = store.read('tok', gameId);
const ids = Object.keys(before.data.generals ?? {});
if (!ids.length) { console.log(JSON.stringify({ gameId, already: 0, note: 'library already empty' })); process.exit(0); }
console.log(JSON.stringify({ gameId, before: ids.length, digestBefore: before.copyDigest.slice(0, 8), dry }));
if (dry) process.exit(0);

const written = store.writeModule('tok', gameId, 'generals', { remove: ids });
const after = store.read('tok', gameId);
console.log(JSON.stringify({ gameId, removed: ids.length, after: Object.keys(after.data.generals ?? {}).length,
  digestAfter: written.copyDigest.slice(0, 8), shaOk: after.copyDigest === written.copyDigest }));
