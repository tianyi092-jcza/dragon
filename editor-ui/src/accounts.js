// Framework-free account UI adapter. API/CSRF/serialization remain owned by
// the existing client transport; only allowlisted display DTOs reach Vue.
export function createAccountController({ api, authority, work, publish, confirm }) {
  let identity = null, generation = 0, request = 0, rows = [], loaded = false, stale = false, message = '';
  const permitted = () => identity && identity === authority() && identity.user.role === 'admin' && !identity.user.mustChangePassword;
  const emit = () => publish({ rows, loaded, stale, message, generation });
  function requireAdmin() { if (!permitted()) throw new Error('請以已變更密碼的管理員帳戶登入。'); }
  function capture() {
    requireAdmin(); const actor = identity, epoch = generation, serial = ++request;
    return () => actor === identity && epoch === generation && serial === request && permitted();
  }
  function decode(data) {
    if (!Array.isArray(data?.accounts)) throw new Error('帳戶清單回應無效。');
    const seen = new Set();
    return data.accounts.map(row => {
      if (!row || typeof row.id !== 'string' || !row.id || seen.has(row.id) || typeof row.account !== 'string' || !['admin', 'author'].includes(row.role) || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.disabled !== 'boolean' || typeof row.mustChangePassword !== 'boolean') throw new Error('帳戶清單回應無效。');
      seen.add(row.id);
      const result = { id: row.id, account: row.account, role: row.role, version: row.version, disabled: row.disabled, mustChangePassword: row.mustChangePassword };
      for (const field of ['displayName', 'email', 'phone', 'note']) {
        if (typeof row[field] !== 'string') throw new Error('帳戶資料回應無效。');
        result[field] = row[field];
      }
      return Object.freeze(result);
    });
  }
  async function load() {
    const valid = capture();
    try {
      const data = await api('/api/admin/accounts'); if (!valid()) return false;
      const next = decode(data); rows = next; loaded = true; stale = false; message = ''; emit(); return true;
    } catch (error) {
      if (valid()) { stale = true; message = '清單未更新：' + error.message + ' 請明確重載後再操作。'; emit(); }
      throw error;
    }
  }
  async function create(account) {
    return work(async () => {
      const valid = capture();
      if (stale) throw new Error('請先重載清單，核對上次操作結果。');
      if (typeof account !== 'string' || !account) throw new Error('請輸入帳戶名稱。');
      try { await api('/api/admin/accounts', { account }); }
      catch (error) { if (valid()) { stale = true; message = '建立未確認：' + error.message + ' 不自動重試；請重載清單核對。'; emit(); } throw error; }
      if (!valid()) return false;
      // Creation was acknowledged even if the follow-up read fails. Clear the
      // create input, retain the failure message, never silently create again.
      try { await load(); } catch { /* load publishes the explicit read failure. */ }
      return permitted();
    });
  }
  async function mutate(id, kind) {
    return work(async () => {
      requireAdmin();
      const row = rows.find(item => item.id === id);
      if (!loaded || stale || !row || row.role !== 'author' || !['disable', 'reset', 'delete'].includes(kind)) throw new Error('請先重載並選擇可管理的創作者帳戶。');
      let label = row.disabled ? '恢復' : '停用', suffix = '此操作會撤銷它的既有會話。';
      if (kind === 'reset') label = '重設密碼';
      if (kind === 'delete') { label = '刪除'; suffix = '此操作會物理刪除該帳戶，不可恢復。'; }
      if (!confirm(label + '帳戶 ' + row.account + '？' + suffix)) return false;
      const valid = capture();
      const value = { expectedVersion: row.version }; if (kind === 'disable') value.disabled = !row.disabled;
      try { await api('/api/admin/accounts/' + encodeURIComponent(row.id) + '/' + kind, value); }
      catch (error) { if (valid()) { stale = true; message = error.message + ' 原清單僅供核對，請重載後再操作；不自動重試。'; emit(); } throw error; }
      if (!valid()) return false;
      return load();
    });
  }
  return Object.freeze({
    setIdentity(next) {
      if (next === identity) return;
      identity = next; generation++; request++; rows = []; loaded = false; stale = false; message = ''; emit();
    },
    // load is used inside the client's already-serialized login/password flow.
    load, refresh: () => work(load), create, mutate,
  });
}
