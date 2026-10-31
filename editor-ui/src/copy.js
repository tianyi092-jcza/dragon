// Presentation adapter only. The service owns source validation, copy leases and CAS.
// Web product decision 2026-10-31: one "確認新建" action creates a complete
// 20-chapter copy of the built-in game. The old neutral shell template, the
// admin-only source registration and the visible propose/execute/query/cancel
// protocol are gone. The service still keeps leases and idempotency keys, so a
// retry reuses the original key instead of creating a second game.
export function createCopyController({ api, authority, work, isBusy, publish, gotoGame, openDeletion, storage = globalThis.sessionStorage, confirm = text => globalThis.confirm(text) }) {
  let actor = null, generation = 0, operation = null, summary = null, games = [], broken = false, needsQuery = false;
  let name = '', introduction = '', message = '';
  const permitted = () => actor && actor === authority() && ['admin', 'author'].includes(actor.user.role) && !actor.user.mustChangePassword;
  const storeKey = () => 'editor-copy-operation:' + actor.user.id;
  const validKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
  const revision = value => typeof value === 'string' && /^[1-9][0-9]{0,63}$/.test(value);
  const ticket = () => ({ actor, generation });
  const valid = t => permitted() && t.actor === actor && t.generation === generation;
  const pending = () => ['pending', 'running'].includes(summary?.state);
  const resumable = () => Boolean(operation) && (!summary || needsQuery || pending());
  function render() {
    const allowed = permitted(), locked = !allowed || isBusy();
    publish({
      name: allowed ? name : '', introduction: allowed ? introduction : '',
      games: allowed ? games.map(row => ({ ...row })) : [],
      message: allowed ? message : '', locked,
      resume: allowed && resumable(),
      // Resumable operations must stay clickable: the button then reads 確認新建（續）.
      createDisabled: locked || broken || needsQuery,
    });
  }
  function restore() {
    operation = null; broken = false;
    if (!permitted()) return;
    try { const value = storage.getItem(storeKey()); if (value !== null && !validKey(value)) throw new Error('原鍵格式無效'); operation = value; }
    catch { broken = true; message = '本機原鍵不可讀，不能另建；請先恢復原關聯儲存。'; }
  }
  function decodeSummary(data, expectedGame = null) {
    if (!data || typeof data.gameId !== 'string' || !data.gameId || expectedGame && data.gameId !== expectedGame) throw new Error('新建回應無效。');
    if (revision(data.draftRevision)) return { gameId: data.gameId, draftRevision: data.draftRevision };
    if (!['pending', 'running', 'canceled'].includes(data.state) || !revision(data.rowRevision)) throw new Error('新建狀態回應無效。');
    return { gameId: data.gameId, state: data.state, rowRevision: data.rowRevision };
  }
  async function ownGames(t) {
    const data = await api('/api/games'); if (!valid(t)) return;
    const ids = new Set();
    if (!Array.isArray(data?.games)) throw new Error('遊戲清單回應無效。');
    games = data.games.map(game => {
      if (typeof game.gameId !== 'string' || !game.gameId || ids.has(game.gameId) || !revision(game.draftRevision) ||
          typeof game.metadata?.name !== 'string' || typeof game.metadata.introduction !== 'string' ||
          typeof game.createdAt !== 'string' || typeof game.modifiedAt !== 'string') throw new Error('遊戲清單回應無效。');
      ids.add(game.gameId);
      const state = game.listed ? '已上架' : '下架' + (game.restricted ? '（管理限制，須管理員解除）' : '');
      return { gameId: game.gameId, label: game.metadata.name + ' — ' + (game.metadata.introduction || '無簡介') + '／草稿 ' + game.draftRevision + '／' + state };
    });
  }
  async function queryCopy(t) {
    if (!operation) { summary = null; return; }
    const key = operation; needsQuery = true;
    try {
      const data = await api('/api/games/create/' + encodeURIComponent(key));
      if (!valid(t) || operation !== key) return;
      summary = decodeSummary(data, summary?.gameId); needsQuery = false;
    } catch (error) {
      if (!valid(t) || operation !== key) return;
      if (error.status !== 404 && error.code !== 'COPY_OPERATION_REVOKED') throw error;
      message = error.code === 'COPY_OPERATION_REVOKED' ? '原操作已隨帳戶版本失效；本機追蹤不提供權限。' : '服務未找到此原鍵；這不是取消或回滾的證明。';
      if (!confirm(message + '只清除本機追蹤？這不取消或回滾可能在途的請求。')) return;
      if (!valid(t) || operation !== key) return;
      storage.removeItem(storeKey()); operation = null; summary = null; needsQuery = false;
    }
  }
  async function create() {
    if (broken || needsQuery || (operation && !summary)) throw new Error('請先明確查詢原操作，不另建未知目標。');
    const validText = (text, limit, required) => {
      const normalized = text.trim().normalize('NFC');
      return (!required || normalized.length > 0) && normalized.isWellFormed() && [...normalized].length <= limit &&
        ![...normalized].some(char => { const code = char.codePointAt(0); return code < 32 || code >= 127 && code <= 159; });
    };
    if (!validText(name, 8, true) || !validText(introduction, 100, false)) throw new Error('名稱去掉首尾空白後須為 1–8 個字，簡介最多 100 個字；不能含控制字元。');
    const t = ticket();

    // Resume: an existing uncommitted operation keeps its own name/introduction.
    if (operation && pending()) { await runExisting(t); return; }

    const body = { name, introduction }, key = crypto.randomUUID();
    operation = key; summary = null; needsQuery = true;
    try { storage.setItem(storeKey(), key); } catch { broken = true; throw new Error('無法保留原鍵；本次未提交。'); }
    name = ''; introduction = ''; message = '正在建立完整副本，請勿重複提交…'; render();
    if (!valid(t) || operation !== key) return;
    const created = await api('/api/games', body, { key });
    if (!valid(t) || operation !== key) return;
    summary = decodeSummary(created); needsQuery = false;
    await runExisting(t);
  }
  async function runExisting(t) {
    const key = operation, created = summary;
    if (!key) throw new Error('缺少原鍵，不能繼續。');
    if (!created || !summary?.gameId) {
      // Lost the create reply: ask the service first, never mint a new key.
      needsQuery = true; render();
      const data = await api('/api/games/create/' + encodeURIComponent(key));
      if (!valid(t) || operation !== key) return;
      summary = decodeSummary(data); needsQuery = false;
    }
    if (summary.draftRevision) { message = '完整副本已建立。'; await ownGames(t); render(); return; }
    if (!pending()) { message = '此原操作已結束，未產生副本。'; render(); return; }
    needsQuery = true; message = '正在寫入完整副本，請勿重複提交…'; render();
    const done = await api('/api/games/create/' + encodeURIComponent(key) + '/run', {}, { revision: summary.rowRevision });
    if (!valid(t) || operation !== key) return;
    summary = decodeSummary(done, summary.gameId); needsQuery = false;
    message = '完整副本已建立，可在下方「我的遊戲」中編輯。';
    await ownGames(t);
  }
  const action = callback => (...args) => work(async () => {
    if (!permitted()) return;
    const t = ticket();
    try { return await callback(...args); } catch (error) { if (valid(t)) message = '操作未確認：' + error.message; throw error; } finally { render(); }
  });
  function canLeave(forUnload = false) {
    return !(name || introduction || resumable()) || !forUnload && confirm('新建輸入或原操作尚未完成。離開不會自動保存或取消服務操作；仍要離開？');
  }
  const actions = Object.freeze({
    refresh: action(async () => { const t = ticket(); await queryCopy(t); if (valid(t)) await ownGames(t); }),
    create: action(create),
    setField(key, value) {
      if (!permitted() || isBusy() || !['name', 'introduction'].includes(key) || typeof value !== 'string') return;
      if (key === 'name') name = value; else introduction = value;
      render();
    },
    gotoGame: action(async id => { const t = ticket(); if (games.some(game => game.gameId === id) && canLeave() && valid(t)) await gotoGame(id); }),
    openDeletion: action(async id => { const t = ticket(); if (games.some(game => game.gameId === id) && canLeave() && valid(t)) await openDeletion(id); }),
  });
  return Object.freeze({ actions, render, canLeave,
    setIdentity(next) {
      if (actor === next) return render();
      generation++; actor = next; summary = null; games = []; name = ''; introduction = ''; message = ''; needsQuery = false;
      restore(); render();
    },
    pagehide() { generation++; summary = null; games = []; needsQuery = Boolean(operation); render(); },
  });
}
