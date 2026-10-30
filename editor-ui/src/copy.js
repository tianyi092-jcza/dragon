// Presentation adapter only. The service owns source validation, copy leases and CAS.
export function createCopyController({ api, authority, work, isBusy, publish, gotoGame, openDeletion, storage = globalThis.sessionStorage, confirm = text => globalThis.confirm(text) }) {
  let actor = null, generation = 0, source = null, operation = null, summary = null, games = [], broken = false, needsQuery = false;
  let name = '', introduction = '', message = '';
  const permitted = () => actor && actor === authority() && ['admin', 'author'].includes(actor.user.role) && !actor.user.mustChangePassword;
  const administrator = () => permitted() && actor.user.role === 'admin';
  const operationPath = () => administrator() ? '/api/admin/copies' : '/api/games/create';
  const storeKey = () => 'editor-copy-operation:' + actor.user.id;
  const validKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
  const revision = value => typeof value === 'string' && /^[1-9][0-9]{0,63}$/.test(value);
  const ticket = () => ({ actor, generation });
  const valid = t => permitted() && t.actor === actor && t.generation === generation;
  const pending = () => ['pending', 'running'].includes(summary?.state);
  function render() {
    const allowed = permitted(), locked = !allowed || isBusy();
    publish({ author: allowed && !administrator(), sourceLocked: locked || !administrator(), name: allowed ? name : '', introduction: allowed ? introduction : '', games: allowed ? games.map(row => ({ ...row })) : [],
      sourceState: allowed && source ? source.registryId + ' — ' + (source.registered ? '已驗證登記' : source.staged ? '已裝配，尚須驗證登記' : '未裝配；請停止服務後以 --stage-source 啟動') : '',
      copyState: allowed && summary ? '目標 ' + summary.gameId + ' — ' + (summary.state ?? 'committed') + (summary.draftRevision ? '／已保存修訂 ' + summary.draftRevision : '／狀態修訂 ' + summary.rowRevision) : '',
      message: allowed ? message : '', locked,
      createDisabled: locked || broken || administrator() && !source?.registered || needsQuery || pending() || Boolean(operation && !summary),
      runDisabled: locked || broken || needsQuery || !operation || !summary?.rowRevision || !pending(),
      cancelDisabled: locked || broken || needsQuery || !operation || !summary?.rowRevision || !pending() });
  }
  function restore() {
    operation = null; broken = false;
    if (!permitted()) return;
    try { const value = storage.getItem(storeKey()); if (value !== null && !validKey(value)) throw new Error('原鍵格式無效'); operation = value; }
    catch { broken = true; message = '本機原鍵不可讀，不能另建複製；請先恢復原關聯儲存。'; }
  }
  function decodeSummary(data, expectedGame = null) {
    if (!data || typeof data.gameId !== 'string' || !data.gameId || expectedGame && data.gameId !== expectedGame) throw new Error('複製目標回應無效。');
    if (revision(data.draftRevision)) return { gameId: data.gameId, draftRevision: data.draftRevision };
    if (!['pending', 'running', 'canceled'].includes(data.state) || !revision(data.rowRevision)) throw new Error('複製狀態回應無效。');
    return { gameId: data.gameId, state: data.state, rowRevision: data.rowRevision };
  }
  async function ownGames(t) {
    const data = await api('/api/games'); if (!valid(t)) return;
    const ids = new Set();
    if (!Array.isArray(data?.games)) throw new Error('遊戲清單回應無效。');
    const rows = data.games.map(game => {
      if (typeof game.gameId !== 'string' || !game.gameId || ids.has(game.gameId) || !revision(game.draftRevision) || typeof game.metadata?.name !== 'string' || typeof game.metadata.introduction !== 'string' || typeof game.createdAt !== 'string' || typeof game.modifiedAt !== 'string') throw new Error('遊戲清單回應無效。');
      ids.add(game.gameId);
      const state = game.listed ? '已上架' : '下架' + (game.restricted ? '（管理限制，須管理員解除）' : '');
      return { gameId: game.gameId, label: game.metadata.name + ' — ' + (game.metadata.introduction || '無簡介') + '／創建 ' + game.createdAt + '／修改 ' + game.modifiedAt + '／草稿 ' + game.draftRevision + '／' + state };
    });
    games = rows;
  }
  async function queryCopy(t) {
    if (!operation) { summary = null; return; }
    const key = operation; needsQuery = true;
    try { const data = await api(operationPath() + '/' + encodeURIComponent(key)); if (!valid(t) || operation !== key) return; summary = decodeSummary(data, summary?.gameId); needsQuery = false; message = '已查得原操作狀態；草稿完成不代表可運行或已發布。'; }
    catch (error) {
      if (!valid(t) || operation !== key) return;
      if (error.status !== 404 && error.code !== 'COPY_OPERATION_REVOKED') throw error;
      message = error.code === 'COPY_OPERATION_REVOKED' ? '原操作的帳戶版本已撤銷；本機追蹤不提供權限。' : '服務未找到此原鍵；這不是取消或回滾的證明。';
      // Previously a 404 silently removed the key. Keep the existing local-clear
      // capability, but require explicit acknowledgement; never create a new key here.
      if (!confirm(message + '只清除本機追蹤？這不取消或回滾可能在途的請求，亦不證明舊請求失敗；不會自動新建副本。')) return;
      if (!valid(t) || operation !== key) return;
      storage.removeItem(storeKey()); operation = null; summary = null; needsQuery = false;
    }
  }
  async function refreshSource() {
    if (!administrator()) return;
    const t = ticket(); source = null; render();
    const data = await api('/api/admin/source'); if (!valid(t)) return;
    if (typeof data?.definition?.registryId !== 'string' || !data.definition.registryId) throw new Error('來源描述無效。');
    source = { registryId: data.definition.registryId, registered: Boolean(data.registered), staged: Boolean(data.staged) };
    await queryCopy(t); if (valid(t)) await ownGames(t);
  }
  async function create() {
    if (broken || administrator() && !source?.registered || needsQuery || pending() || operation && !summary) throw new Error('請先明確查詢原操作及驗證登記來源，不另建未知目標。');
    const validText = (text, limit, required) => {
      const normalized = text.trim().normalize('NFC');
      return (!required || normalized.length > 0) && normalized.isWellFormed() && [...normalized].length <= limit && ![...normalized].some(char => { const code = char.codePointAt(0); return code < 32 || code >= 127 && code <= 159; });
    };
    if (!validText(name, 8, true) || !validText(introduction, 20, false)) throw new Error('名稱trim／NFC後須為1–8碼點，簡介最多20碼點；不能含控制字元或孤立代理字元。');
    const t = ticket(), body = administrator() ? { registryId: source.registryId, name, introduction } : { name, introduction }, path = administrator() ? '/api/admin/copies' : '/api/games', key = crypto.randomUUID();
    operation = key; summary = null; needsQuery = true;
    try { storage.setItem(storeKey(), key); } catch { broken = true; throw new Error('無法保留原鍵；本次未提交，不另起鍵。'); }
    render(); if (!valid(t) || operation !== key) return;
    const data = await api(path, body, { key });
    if (!valid(t) || operation !== key) return;
    summary = decodeSummary(data); needsQuery = false;
    name = ''; introduction = ''; message = administrator() ? '預約已確認；須另行執行完整複製。' : '預約已確認；須另行建立中立草稿與空白首章，尚不具備運行資格。';
  }
  async function command(kind) {
    if (broken || needsQuery || !operation || !summary?.rowRevision || !pending()) throw new Error('請先查詢未完成複製狀態。');
    const t = ticket(), key = operation, row = summary;
    if (kind === 'cancel' && !confirm('取消此未完成建立／複製？目標ID與操作鍵不再重用；暫存物件只記帳，不代表已物理刪除。')) return;
    if (!valid(t) || operation !== key || summary !== row) return;
    needsQuery = true;
    message = kind === 'run' ? '正在驗證固定來源並寫入獨立草稿；請勿重新提交。' : '取消回應待確認。'; render();
    const data = await api(operationPath() + '/' + encodeURIComponent(key) + '/' + kind, {}, { revision: row.rowRevision });
    if (!valid(t) || operation !== key) return;
    summary = decodeSummary(data, row.gameId); needsQuery = false;
    message = kind === 'run' ? '獨立草稿已確認；不代表可運行或已發布。' : '取消已確認；不代表暫存物件已物理刪除。';
    if (kind === 'run') await ownGames(t);
  }
  const action = callback => (...args) => work(async () => {
    if (!permitted()) return;
    const t = ticket();
    try { return await callback(...args); } catch (error) { if (valid(t)) message = '操作未確認：' + error.message; throw error; } finally { render(); }
  });
  function canLeave(forUnload = false) {
    return !(name || introduction || operation && (!summary || needsQuery || pending())) || !forUnload && confirm('副本輸入或原操作尚未完成。離開不會自動保存、重試或取消服務操作；仍要離開？');
  }
  const actions = Object.freeze({
    refreshSource: action(refreshSource), installSource: action(async () => { if (!administrator()) return; const t = ticket(); await api('/api/admin/source/install', {}); if (valid(t)) await refreshSource(); }),
    refresh: action(async () => { const t = ticket(); await queryCopy(t); if (valid(t)) await ownGames(t); }), create: action(create), run: action(() => command('run')), cancel: action(() => command('cancel')),
    setField(key, value) { if (!permitted() || isBusy() || !['name', 'introduction'].includes(key) || typeof value !== 'string') return; if (key === 'name') name = value; else introduction = value; render(); },
    gotoGame: action(async id => { const t = ticket(); if (games.some(game => game.gameId === id) && canLeave() && valid(t)) await gotoGame(id); }),
    openDeletion: action(async id => { const t = ticket(); if (games.some(game => game.gameId === id) && canLeave() && valid(t)) await openDeletion(id); }),
  });
  return Object.freeze({ actions, render, canLeave,
    setIdentity(next) { if (actor === next) return render(); generation++; actor = next; source = null; summary = null; games = []; name = ''; introduction = ''; message = ''; needsQuery = false; restore(); render(); },
    pagehide() { generation++; source = null; summary = null; games = []; needsQuery = Boolean(operation); render(); },
  });
}
