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
  // 追蹤中＝有一筆本機原鍵還需要自動核對（不是要人按任何按鈕）。
  const tracking = () => Boolean(operation) && !broken && (needsQuery || pending());
  // 進度只用伺服器回報的實際檔案數（copy_objects 列數），不臆造百分比。
  const staged = () => Number.isSafeInteger(summary?.objects) && summary.objects > 0 ? summary.objects : 0;
  const stagedText = () => '已寫入 ' + staged() + ' 個檔案';
  function render() {
    const allowed = permitted(), locked = !allowed || isBusy();
    publish({
      visible: allowed,
      name: allowed ? name : '', introduction: allowed ? introduction : '',
      games: allowed ? games.map(row => ({ ...row })) : [],
      message: allowed ? message : '', locked,
      // 追蹤期間面板會顯示自動核對的進度；不需要任何「續」按鈕（用戶要求）。
      tracking: allowed && tracking(),
      // 失敗不得靜默消失（用戶要求）：彈窗留著並列出原因，使用者按「確認」才關。
      failed: allowed && !tracking() && summary?.state === 'failed',
      // 還在自動核對時不能重送；原鍵不可讀或已在追蹤才鎖住建立。
      createDisabled: locked || broken || tracking(),
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
  // 失敗原因由服務端回報（copy_requests.result_json 的 code），這裡只負責把它翻成人看得懂的句子。
  // 未知 code 一律保留原樣：編造原因比沒有原因更壞。
  const reasons = Object.freeze({
    COPY_INTERRUPTED: '複製中斷（頁面關閉或服務重啟）',
    COPY_FAILED: '複製失敗（服務端未回報具體原因）',
    COPY_SOURCE_CHANGED: '底層資源已變更，需要管理員重新登記來源',
    COPY_PROFILE_CHANGED: '複製模板已變更，請重新整理後再試',
    COPY_OBJECT_CONFLICT: '暫存檔案與既有內容衝突',
    COPY_OBJECT_NOT_VERIFIED: '暫存檔案校驗未通過',
    COPY_LEASE_LOST: '複製階段逾時（單次執行超過 5 分鐘）',
    COPY_BASELINE_PROOF: '來源基準校驗未通過',
    COPY_RECEIPT_CORRUPT: '複製回執校驗未通過',
  });
  const reasonText = code => typeof code === 'string' && code.length > 0
    ? (reasons[code] ?? '複製失敗（' + code + '）')
    : reasons.COPY_FAILED;
  function decodeSummary(data, expectedGame = null) {
    if (!data || typeof data.gameId !== 'string' || !data.gameId || expectedGame && data.gameId !== expectedGame) throw new Error('新建回應無效。');
    // 檔案數與租約到期只作展示與排程用：缺欄位或格式不合時不猜，退回預設。
    const objects = Number.isSafeInteger(data.objects) && data.objects >= 0 ? data.objects : null;
    const leaseUntil = Number.isSafeInteger(data.leaseUntil) && data.leaseUntil >= 0 ? data.leaseUntil : 0;
    const failedCode = typeof data.failedCode === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(data.failedCode) ? data.failedCode : null;
    if (revision(data.draftRevision)) return { gameId: data.gameId, draftRevision: data.draftRevision, objects, leaseUntil };
    if (!['pending', 'running', 'canceled', 'failed'].includes(data.state) || !revision(data.rowRevision)) throw new Error('新建狀態回應無效。');
    return { gameId: data.gameId, state: data.state, rowRevision: data.rowRevision, objects, leaseUntil, failedCode };
    return { gameId: data.gameId, state: data.state, rowRevision: data.rowRevision, objects, leaseUntil };
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
  // 一筆追蹤真正結案（已建立或已失效）：釋放本機原鍵，下一次載入不會再自動核對。
  function release() { try { storage.removeItem(storeKey()); } catch { /* 清除失敗只影響下一筆追蹤 */ } operation = null; }
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
    if (summary.draftRevision) { message = label + '已建立。'; release(); if (!full) await ownGames(t); render(); return; }
    if (summary.state === 'canceled') { message = '此原操作已取消，未產生副本。'; render(); return; }
    // 失敗＝服務端已收回這筆操作（名稱也退回了），不保存任何東西；清掉本機原鍵讓名稱可直接重用。
    if (summary.state === 'failed') { message = label + '失敗：' + reasonText(summary.failedCode) + '。這次的資料已由服務端丟棄（名稱已釋放），可修改後直接重新複製。'; release(); render(); return; }
    if (!pending()) { message = '此原操作已結束，未產生副本。'; render(); return; }
    needsQuery = false;
    await track(t, key);
    if (!valid(t) || operation !== key || !summary?.draftRevision) return;
    // 已完成：釋放本機原鍵，下一次載入不會再自動核對這筆舊操作。
    release();
    message = full ? '完整副本已建立；遊戲清單已自動更新，可在「遊戲管理」直接載入。' : '新遊戲已建立，可在下方「我的遊戲」中編輯。';
    if (!full) await ownGames(t); else onCreated();
  }
  // 一次到底的自動追蹤（用戶要求：不要再按「續」）。伺服器把 /run 跑在同一個請求裡
  // （5 分鐘租約），代理層會切斷回應但不會中止執行；這裡只依原鍵查詢與重跑，永不另建
  // 第二份。進度只報實際寫入的檔案數，不臆造百分比。
  const POLL_MS = 2000, TRACK_MS = 15 * 60 * 1000, MAX_RUNS = 3;
  async function track(t, key) {
    const started = Date.now();
    let runs = 0, mode = summary?.state === 'running' && Number(summary.leaseUntil ?? 0) > Date.now() ? 'poll' : 'run';
    const busyText = () => label + '仍在處理（' + (summary?.state ?? 'pending') + '）；' + stagedText() + '…';
    for (;;) {
      if (!valid(t) || operation !== key) return;
      if (summary?.draftRevision) return;
      if (summary?.state === 'canceled') { message = '此原操作已取消，未產生副本。'; render(); return; }
      if (summary?.state === 'failed') { message = label + '失敗：' + reasonText(summary.failedCode) + '。這次的資料已由服務端丟棄（名稱已釋放），可修改後直接重新複製。'; release(); render(); return; }
      if (Date.now() - started > TRACK_MS || mode === 'run' && runs >= MAX_RUNS) {
        needsQuery = true;
        message = label + '仍在處理（' + (summary?.state ?? 'pending') + '）；' + stagedText() + '。伺服器尚未回報完成，重新載入本頁會自動接著核對，不必按任何按鈕。';
        render(); return;
      }
      if (mode === 'run') {
        runs++;
        message = busyText(); render();
        try { summary = decodeSummary(await api(operationPath(key) + '/run', {}, { revision: summary.rowRevision }), summary.gameId); }
        catch (error) {
          if (!valid(t) || operation !== key) throw error;
          if (absent(error)) { forgetLocal('服務端已無此原操作；本機追蹤已清除，可直接重新建立。'); return; }
          // 已在執行、租約被別的請求持有、或回應被代理層切斷：都不是失敗，改為只讀核對。
          message = '回應中斷，正在依原鍵核對實際結果…'; render();
        }
        mode = 'poll'; needsQuery = false;
        continue;
      }
      message = busyText(); render();
      await new Promise(done => setTimeout(done, POLL_MS));
      if (!valid(t) || operation !== key) return;
      let data = null, failures = 0;
      for (;;) {
        try { data = await api(operationPath(key)); break; }
        catch (error) {
          if (!valid(t) || operation !== key) throw error;
          if (absent(error)) { forgetLocal('服務端已無此原操作；本機追蹤已清除，可直接重新建立。'); return; }
          if (++failures >= 3) throw error;
          await new Promise(done => setTimeout(done, POLL_MS));
          if (!valid(t) || operation !== key) return;
        }
      }
      if (!valid(t) || operation !== key) return;
      summary = decodeSummary(data, summary.gameId); needsQuery = false;
      // 租約未過＝那個請求還在執行，只讀等待；租約過了代表它已不再執行（執行中的請求
      // 不可能超出自已的租約範圍），才允許用同一個原鍵自動再跑一次。
      mode = summary.state === 'running' && Number(summary.leaseUntil ?? 0) > Date.now() ? 'poll' : 'run';
    }
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
    // 重新載入後接著跑完手上那一筆原鍵（不建立第二份）。
    resume: action(async () => { if (!operation) return; await runExisting(ticket()); }),
    // 失敗彈窗的「確認」：只關掉這筆結果，不改服務端任何事。
    dismiss() { if (!permitted() || isBusy()) return; summary = null; message = ''; render(); },
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
      // 本機還留著原鍵（重新載入、換分頁）就自動接著核對到完成，不需要人再按一次。
      // 這是使用者已經按過「複製遊戲」的那一筆，不是在自動開新操作。
      if (operation && permitted()) void actions.resume();
    },
    pagehide() { generation++; summary = null; games = []; needsQuery = Boolean(operation); render(); },
  });
}
