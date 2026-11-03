// Presentation adapter only. The service owns source validation, copy leases and CAS.
// B6（工作台結構合同 §2）：兩條既有伺服器管線共用這一份協議實現。
//   mode 'minimal'（工作台級「新建遊戲」）：POST /api/games，只複製底層地圖
//     （含據點），章節與武將庫為空。
//   mode 'full'（管理員「複製遊戲」）：POST /api/admin/copies，地圖＋章節＋武將
//     全套複製；registryId 由 GET /api/admin/source 讀取，使用者不選來源。
// 兩者都保留租約與冪等鍵：失去回應時只查詢原鍵，不另建第二份。
export function createCopyController({ api, authority, work, isBusy, publish, gotoGame, onCreated = () => {}, storage = globalThis.sessionStorage, confirm = text => globalThis.confirm(text), mode = 'minimal' }) {
  const full = mode === 'full';
  const label = full ? '完整副本' : '新遊戲';
  const reservePath = full ? '/api/admin/copies' : '/api/games';
  const operationPath = key => full ? '/api/admin/copies/' + encodeURIComponent(key) : '/api/games/create/' + encodeURIComponent(key);
  let actor = null, generation = 0, operation = null, summary = null, games = [], broken = false, needsQuery = false;
  let name = '', introduction = '', message = '';
  const permitted = () => actor && actor === authority() && (full ? actor.user.role === 'admin' : ['admin', 'author'].includes(actor.user.role)) && !actor.user.mustChangePassword;
  const storeKey = () => (full ? 'editor-fullcopy-operation:' : 'editor-copy-operation:') + actor.user.id;
  const validKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
  const revision = value => typeof value === 'string' && /^[1-9][0-9]{0,63}$/.test(value);
  const ticket = () => ({ actor, generation });
  const valid = t => permitted() && t.actor === actor && t.generation === generation;
  const pending = () => ['pending', 'running'].includes(summary?.state);
  const resumable = () => Boolean(operation) && (!summary || needsQuery || pending());
  function render() {
    const allowed = permitted(), locked = !allowed || isBusy();
    publish({
      visible: allowed,
      name: allowed ? name : '', introduction: allowed ? introduction : '',
      games: allowed ? games.map(row => ({ ...row })) : [],
      message: allowed ? message : '', locked,
      resume: allowed && resumable(),
      // Resumable operations must stay clickable: the button then reads 確認新建（續）.
      // 結果未知但原鍵仍在＝可續查：按鈕必須可點（讀作「（續）」），不能把人鎖死。
      createDisabled: locked || broken || (needsQuery && !operation),
      forgetDisabled: locked || !operation,
      canForget: allowed && Boolean(operation),
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
  function listingState(game) {
    if (game.listed) return '已上架';
    return game.restricted ? '下架（管理限制，須管理員解除）' : '下架';
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
      const state = listingState(game);
      return { gameId: game.gameId, label: game.metadata.name + ' — ' + (game.metadata.introduction || '無簡介') + '／草稿 ' + game.draftRevision + '／' + state };
    });
  }
  async function queryCopy(t) {
    if (!operation) { summary = null; return; }
    const key = operation; needsQuery = true;
    try {
      const data = await api(operationPath(key));
      if (!valid(t) || operation !== key) return;
      summary = decodeSummary(data, summary?.gameId); needsQuery = false;
    } catch (error) {
      if (!valid(t) || operation !== key) return;
      if (!absent(error)) throw error;
      // 服務端沒有這條原鍵（或已隨帳戶版本失效）＝**沒有建立過任何東西**，
      // 留著本機追蹤只會讓使用者被卡在「（續）」上；直接清掉，不留殘骸。
      forgetLocal(error.code === 'COPY_OPERATION_REVOKED'
        ? '原操作已隨帳戶版本失效；本機追蹤已清除。'
        : '服務端沒有這條原操作；本機追蹤已清除，可直接重新建立。');
    }
  }
  // 「服務端沒有這條原鍵」的兩種形態：404（含 COPY_NOT_FOUND）與帳戶版本失效。
  const absent = error => error.status === 404 || error.code === 'COPY_NOT_FOUND' || error.code === 'COPY_OPERATION_REVOKED';
  function forgetLocal(text) {
    try { storage.removeItem(storeKey()); } catch { broken = true; }
    operation = null; summary = null; needsQuery = false; message = text; render();
  }
  async function resolveUnknown(t, key) {
    try { return await api(operationPath(key)); }
    catch (error) {
      if (!valid(t) || operation !== key) return null;
      if (!absent(error)) throw error;
      forgetLocal(error.code === 'COPY_OPERATION_REVOKED'
        ? '原操作已隨帳戶版本失效；本機追蹤已清除。'
        : '服務端沒有這條原操作；本機追蹤已清除，可直接重新建立。');
      return null;
    }
  }
  // full 模式的來源註冊識別由服務端已登記的底層資源決定；客戶端不選來源。
  async function fullBody() {
    const data = await api('/api/admin/source');
    const registryId = data?.definition?.registryId;
    if (typeof registryId !== 'string' || !registryId || registryId.length > 128) throw new Error('底層資源登記回應無效；本次未提交。');
    return { registryId, name, introduction };
  }
  async function create() {
    if (broken) throw new Error('本機原鍵不可讀，不能另建；請先恢復原關聯儲存。');
    // 有原鍵但結果未知（reload 後 summary 遺失、或回應被代理層切斷）：只能續用同一個原鍵，
    // 先依原鍵查詢再決定；不另建第二份。
    if (operation && (needsQuery || !summary)) { await runExisting(ticket()); return; }
    if (needsQuery) throw new Error('請先明確查詢原操作，不另建未知目標。');
    const validText = (text, limit, required) => {
      const normalized = text.trim().normalize('NFC');
      return (!required || normalized.length > 0) && normalized.isWellFormed() && [...normalized].length <= limit &&
        ![...normalized].some(char => { const code = char.codePointAt(0); return code < 32 || code >= 127 && code <= 159; });
    };
    if (!validText(name, 8, true) || !validText(introduction, 100, false)) throw new Error('名稱去掉首尾空白後須為 1–8 個字，簡介最多 100 個字；不能含控制字元。');
    const t = ticket();
    // 名稱先驗（full 模式）：先與自己的遊戲清單比對，重複就不發任何請求，
    // 直接在上方訊息區說明；服務端仍是唯一權威（其它擁有者的名稱由 409 兜底）。
    if (full) {
      const wanted = name.trim().normalize('NFC');
      let list = null;
      try { list = await api('/api/games'); } catch { list = null; }
      const taken = Array.isArray(list?.games) && list.games.some(game => typeof game?.metadata?.name === 'string' && game.metadata.name.normalize('NFC') === wanted);
      if (taken) { message = '名稱「' + wanted + '」已被另一份遊戲使用；請換一個名稱。'; render(); return; }
    }

    // Resume: an existing uncommitted operation keeps its own name/introduction.
    if (operation && pending()) { await runExisting(t); return; }

    const body = full ? await fullBody() : { name, introduction }, key = crypto.randomUUID();
    operation = key; summary = null; needsQuery = true;
    try { storage.setItem(storeKey(), key); } catch { broken = true; throw new Error('無法保留原鍵；本次未提交。'); }
    name = ''; introduction = ''; message = '正在建立' + label + '，請勿重複提交…'; render();
    if (!valid(t) || operation !== key) return;
    let created;
    try { created = await api(reservePath, body, { key }); }
    catch (error) {
      // 明確 4xx 拒絕＝本次未提交：清掉原鍵，換名稱或稍後重試，不把人卡在「（續）」。
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
        try { storage.removeItem(storeKey()); } catch { broken = true; }
        operation = null; summary = null; needsQuery = false;
      }
      throw error;
    }
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
      const data = await resolveUnknown(t, key);
      if (data === null || !valid(t) || operation !== key) return;
      summary = decodeSummary(data); needsQuery = false;
    }
    if (summary.draftRevision) { message = label + '已建立。'; if (!full) await ownGames(t); render(); return; }
    if (!pending()) { message = '此原操作已結束，未產生副本。'; render(); return; }
    needsQuery = true; message = '正在寫入' + label + '，請勿重複提交…'; render();
    // 迴路可能被代理層切斷（長請求：Cloudflare 約 100 秒、nginx 499）：回應遺失不等於未執行。
    // 依既有原則「不另建第二份」，先用同一個原鍵查詢實際結果，再決定訊息。
    let done;
    try { done = await api(operationPath(key) + '/run', {}, { revision: summary.rowRevision }); }
    catch (error) {
      if (!valid(t) || operation !== key) throw error;
      message = '回應中斷，正在依原鍵查詢實際結果…'; render();
      try { done = await api(operationPath(key)); } catch { throw error; }
    }
    if (!valid(t) || operation !== key) return;
    summary = decodeSummary(done, summary.gameId); needsQuery = false;
    // 只有已保存修訂才是已建立。回應停在 pending／running（長請求被代理層切斷、
    // 或服務仍在校驗）時不推定成功也不推定失敗：以原鍵為準，有界自動核對，
    // 讓使用者不必自己猜「到底成沒成」。
    if (!summary.draftRevision) {
      for (let i = 0; i < 20 && valid(t) && operation === key; i++) {
        message = label + '仍在處理（' + (summary.state ?? 'pending') + '）；正在核對原鍵（' + (i + 1) + '/20）…';
        render();
        await new Promise(done => setTimeout(done, 3000));
        if (!valid(t) || operation !== key) return;
        let data;
        try { data = await api(operationPath(key)); }
        catch (error) {
          if (!absent(error)) throw error;
          forgetLocal('服務端已無此原操作；本機追蹤已清除，可直接重新建立。');
          return;
        }
        if (!valid(t) || operation !== key) return;
        summary = decodeSummary(data, summary.gameId); needsQuery = false;
        if (summary.draftRevision) break;
      }
      if (!summary.draftRevision) {
        needsQuery = true;
        message = label + '尚未確認完成（' + summary.state + '）；已自動核對 60 秒仍未完成，可稍後再按「（續）」核對原鍵，不另建第二份。';
        render(); return;
      }
    }
    message = full ? '完整副本已建立；遊戲清單已自動更新，可在「遊戲管理」直接載入。' : '新遊戲已建立，可在下方「我的遊戲」中編輯。';
    if (!full) await ownGames(t); else onCreated();
  }
  const action = callback => (...args) => work(async () => {
    if (!permitted()) return;
    const t = ticket();
    try { return await callback(...args); } catch (error) { if (valid(t)) message = '操作未確認：' + error.message; throw error; } finally { render(); }
  });
  function canLeave(forUnload = false) {
    return !(name || introduction || resumable()) || !forUnload && confirm((full ? '複製遊戲' : '新建輸入') + '或原操作尚未完成。離開不會自動保存或取消服務操作；仍要離開？');
  }
  const actions = Object.freeze({
    refresh: action(async () => { const t = ticket(); await queryCopy(t); if (valid(t) && !full) await ownGames(t); }),
    create: action(create),
    forget: action(async () => {
      // 明確逃生口：只清掉本機追蹤，不取消、不回滾服務端任何請求。
      try { storage.removeItem(storeKey()); } catch { broken = true; }
      operation = null; summary = null; needsQuery = false;
      message = '已清除本機追蹤；未取消或回滾任何在途請求，服務端結果仍以原鍵查詢為準。';
    }),
    setField(key, value) {
      if (!permitted() || isBusy() || !['name', 'introduction'].includes(key) || typeof value !== 'string') return;
      if (key === 'name') name = value; else introduction = value;
      render();
    },
    gotoGame: action(async id => { const t = ticket(); if (games.some(game => game.gameId === id) && canLeave() && valid(t)) await gotoGame(id); }),
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
