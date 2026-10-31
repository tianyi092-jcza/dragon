import { readFileSync, writeFileSync } from 'node:fs';
const p = 'server/editorapp.js';
let s = readFileSync(p, 'utf8');
const before = s;

// 1) 移除登录前的 409 拒绝
const oldGate = `    if (this.singleUser) {
      const now = Date.now();
      const occupant = this.one('SELECT token_hash FROM sessions WHERE absolute_until>? AND idle_until>?', now, now);
      if (occupant) { fail(409, 'SINGLE_USER_ONLINE'); }
    }
`;
if (!s.includes(oldGate)) throw new Error('old gate not found');
s = s.replace(oldGate, '');

// 2) 在提交事务内驱逐旧会话（最新登录胜出），并清过期行
const oldCommit = `      const current = this.one('SELECT * FROM users WHERE id=?', user.id); if (current.epoch !== user.epoch || current.disabled) { fail(401, 'SESSION_INVALID'); }
      this.insertSession(s, current); this.remember(op, sealed, policy); return true;`;
if (!s.includes(oldCommit)) throw new Error('commit block not found');
const newCommit = `      const current = this.one('SELECT * FROM users WHERE id=?', user.id); if (current.epoch !== user.epoch || current.disabled) { fail(401, 'SESSION_INVALID'); }
      // Single-seat with last-login-wins (user decision 2026-10-31): purge expired
      // rows, then evict every live session so the newest login always succeeds.
      // Only one session stays valid at any moment, and closing a browser without
      // logging out can never lock the account out. Same transaction as the insert.
      if (this.singleUser) {
        const stamp = Date.now();
        this.sql.exec('DELETE FROM sessions WHERE absolute_until<=? OR idle_until<=?', stamp, stamp);
        this.sql.exec('DELETE FROM sessions WHERE user_id<>?', current.id);
      }
      this.insertSession(s, current); this.remember(op, sealed, policy); return true;`;
s = s.replace(oldCommit, newCommit);

if (s === before) throw new Error('no change');
writeFileSync(p, s);
console.log('patched last-login-wins');
