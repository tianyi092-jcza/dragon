// B4 一次性迁移：draft 头修订 → game_copies（只种一次，已有行不覆盖，可重跑）。
// 用法：node tools/migrate_copy_once.mjs <origin> <account> <password>
// 逐游戏 POST /api/games/:id/copy/ensure，输出已种/已存在/失败清单。
import { randomUUID } from 'node:crypto';

const [origin, account, password] = process.argv.slice(2);
if (!origin?.startsWith('https://') || !account || !password) {
  console.error('usage: node tools/migrate_copy_once.mjs <https-origin> <account> <password>');
  process.exit(2);
}

const jar = {};
async function call(path, value, extra = {}) {
  const headers = { Origin: origin, ...extra };
  if (jar.cookie) { headers.Cookie = jar.cookie; headers['X-CSRF-Token'] = jar.csrf; }
  if (value !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  const res = await fetch(origin + path, { method: value === undefined ? 'GET' : 'POST', headers, body: value === undefined ? undefined : JSON.stringify(value) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 非 JSON 报错体 */ }
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jar.cookie = setCookie.split(';')[0];
  return { status: res.status, data };
}

const login = await call('/api/auth/login', { account, password });
if (login.status !== 200) { console.error('login failed', login.status, login.data); process.exit(1); }
jar.csrf = login.data.csrf;

const list = await call('/api/games');
if (list.status !== 200) { console.error('list games failed', list.status, list.data); process.exit(1); }
const games = list.data.games ?? [];
const result = { seeded: [], existed: [], failed: [] };
for (const g of games) {
  const r = await call(`/api/games/${g.gameId}/copy/ensure`, {});
  if (r.status !== 200) { result.failed.push({ gameId: g.gameId, status: r.status, error: r.data?.error ?? null }); continue; }
  // ensure 幂等：行已存在则直接返回旧行（updatedAt 不变可视为已存在，此处仅计数）。
  result.seeded.push(g.gameId);
}
console.log(JSON.stringify({ total: games.length, seeded: result.seeded.length, failed: result.failed, failures: result.failed }, null, 2));
if (result.failed.length) process.exit(1);
