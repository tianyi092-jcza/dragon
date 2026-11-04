// Title-only restore chooser. Confirmed older releases are cleared automatically;
// unknown/corrupt records are not treated as version updates. No migration.
import { loadPlayerChapters, admitPlayerChapter } from './playerchapters.js';
import { loadPlayerPack } from './playerpack.js';
import { createPlayerEnvironment } from './playerenvironment.js';
import { createPlayerSaveStore } from './playersaves.js';
import { isGameDeletedFailure, mountDeletedGameNotice } from './playerdeletedgame.js';
import { capturePlayerSaveRepository } from './playerrepository.js';
import { saveJSON, saveReleaseOrdinal, saveReleaseOrdinalFromVersion } from '../core/gamesavecodec.js';

export function mountPlayerRestore({ root, reader, selection, store, compilerRevision, maxTotalBytes, readStatic }) {
  if (!root?.ownerDocument || typeof root.append !== 'function' ||
      typeof reader?.admit !== 'function' || typeof reader?.status !== 'function' ||
      !selection || store?.gameId !== selection.gameId || ['list', 'get', 'put', 'compareDelete'].some(key => typeof store?.[key] !== 'function') ||
      typeof compilerRevision !== 'string' || !compilerRevision || !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || typeof readStatic !== 'function')
    throw new TypeError('restore root, reader, game store and explicit pack policy required');
  const selected = structuredClone(selection), document = root.ownerDocument;
  const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const host = make('section'), heading = make('h2', '讀取存檔'), message = make('p'), rows = make('div');
  host.className = 'player-restore'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', '正式讀檔'); host.tabIndex = -1;
  Object.assign(host.style, { position: 'fixed', inset: '18% 12% 8%', zIndex: '9999', background: '#f0d090', color: '#201800', border: '4px solid #806020', padding: '16px', display: 'flex', flexDirection: 'column' });
  Object.assign(rows.style, { overflow: 'auto', minHeight: '0', display: 'grid', gap: '6px' });
  host.append(heading, message, rows, make('p', '右鍵返回')); root.append(host);
  let epoch = 0, closed = false, phase = 'loading', preview, choices = [], resolve, cleared = 0;
  const owners = new Set(), result = new Promise(done => { resolve = done; });
  function current(ticket) { if (closed || epoch !== ticket) throw new DOMException('Restore choice superseded', 'AbortError'); }
  function release(owner) {
    let error;
    try { owner.session?.close(); } catch (failure) { error = failure; }
    try { owner.pack?.close(); } catch (failure) { error ??= failure; }
    if (error) throw error;
    owners.delete(owner);
  }
  function releaseAll() { for (const owner of owners) release(owner); }
  function button(text, action, slot) {
    const node = make('button', text); node.type = 'button';
    if (slot !== undefined) node.dataset.saveSlot = String(slot);
    node.addEventListener('click', action); rows.append(node); return node;
  }
  function agrees(row, value) {
    const token = value?.token, record = value?.record;
    return record && token && ['gameId', 'slot', 'recordId', 'writeRevision', 'releaseId', 'releaseOrdinal', 'chapterId', 'manifestDigest'].every(key => record[key] === row[key]) && token.bodyDigest === row.bodyDigest;
  }
  function matches(row) {
    return row.gameId === selected.gameId && row.releaseId === preview.selection.releaseId &&
      row.releaseOrdinal === saveReleaseOrdinalFromVersion(preview.selection.ordinal) &&
      row.manifestDigest === preview.selection.manifestDigest && preview.selection.chapters.includes(row.chapterId);
  }
  async function resources(chapterId, ticket) {
    const owner = { session: null, pack: null }; owners.add(owner);
    try {
      owner.session = await admitPlayerChapter({ reader, selection: preview.selection, chapterId, assertCurrent: () => current(ticket) });
      current(ticket);
      owner.pack = await loadPlayerPack({ session: owner.session, compilerRevision, maxTotalBytes, readStatic });
      current(ticket); owner.pack.assertCurrent(); return owner;
    } catch (error) { release(owner); throw error; }
  }
  function failed(ticket) {
    if (closed || epoch !== ticket) return;
    phase = 'error'; heading.textContent = '讀檔暫不可用';
    message.textContent = `資料、版本或存檔檢查未完成，沒有載入存檔。${cleared ? `已清除${cleared}個確認過期的存檔。` : '沒有刪除存檔。'}可重試；版本已變更時請返回重新選擇遊戲。`;
    rows.replaceChildren(); button('重試', () => { void refresh(); });
  }
  // 用户 m256/m262：读者确认删除后只有告知与一个「確認」；确认即清本机进度并回到
  // 游戏开始的选择页。存档面板本身不再提供保留分支，也不再提供第二个出口。
  let notice = null;
  function deleted(ticket) {
    if (closed || epoch !== ticket) return;
    phase = 'deleted'; heading.textContent = ''; message.textContent = ''; rows.replaceChildren();
    if (notice) return;
    notice = mountDeletedGameNotice({ root, store, onExit: () => { notice = null; close(); } });
  }
  function listing() {
    phase = 'list'; heading.textContent = '讀取存檔'; message.textContent = `${preview.selection.name} ${preview.selection.ordinal}${cleared ? `：遊戲版本已更新，舊版存檔不能載入，已自動清除${cleared}個。` : ''}`; rows.replaceChildren();
    if (!choices.length) rows.append(make('p', '目前沒有本機存檔。'));
    for (const choice of choices) {
      if (choice.token) button(`槽${choice.slot + 1}　${choice.label}`, () => { void choose(choice); }, choice.slot);
      else { const line = make('p', `槽${choice.slot + 1}　不可用`); line.dataset.unavailableSlot = String(choice.slot); rows.append(line); }
    }
    button('重新檢查', () => { void refresh(); });
    if (choices.some(choice => !choice.token)) button('不可用存檔說明', () => {
      phase = 'unavailable'; heading.textContent = '不可用存檔'; rows.replaceChildren();
      message.textContent = '這些存檔的版本資料不足、損壞或未通過檢查，不能判定為已作廢的舊版，將保留且不載入。';
      for (const choice of choices.filter(item => !item.token)) rows.append(make('p', `槽${choice.slot + 1}　保留原存檔`));
    });
  }
  async function refresh() {
    if (closed) return false;
    const ticket = ++epoch; phase = 'loading'; heading.textContent = '讀取存檔'; message.textContent = '正在核對目前上架版本與本機存檔…'; rows.replaceChildren();
    try {
      releaseAll(); choices = [];
      preview = await loadPlayerChapters({ reader, selection: selected, assertCurrent: () => current(ticket) }); current(ticket);
      const catalog = await store.list(); current(ticket);
      if (!Array.isArray(catalog) || catalog.some(row => row?.gameId !== selected.gameId || !Number.isSafeInteger(row.slot) || row.slot < 0) || new Set(catalog.map(row => row.slot)).size !== catalog.length)
        throw new TypeError('game-local save catalog required');
      const removed = new Set(), ordinal = BigInt(saveReleaseOrdinalFromVersion(preview.selection.ordinal));
      for (const row of catalog) {
        let older = false;
        try { older = row.releaseId !== preview.selection.releaseId && BigInt(saveReleaseOrdinal(row.releaseOrdinal)) < ordinal; } catch { /* Unknown identity stays unavailable. */ }
        if (!older) continue;
        let saved;
        try { saved = await store.get(row.slot); } catch { current(ticket); continue; }
        current(ticket);
        if (!agrees(row, saved)) continue;
        const latest = await reader.status({ gameId: selected.gameId }); current(ticket);
        if (!latest.listed || latest.gameId !== selected.gameId || latest.releaseId !== preview.selection.releaseId || latest.ordinal !== preview.selection.ordinal)
          throw new Error('current release changed during cleanup');
        await store.compareDelete(saved.token); cleared++; removed.add(row.slot); current(ticket);
      }
      const next = catalog.filter(row => !removed.has(row.slot)).map(row => ({ slot: row.slot, label: '', token: null }));
      // Validate before exposing a selectable row. Nonmatching identities are
      // inert; their bodies are not read and they are not recognized old releases.
      for (const chapterId of new Set(catalog.filter(matches).map(row => row.chapterId))) {
        let owner;
        const group = [];
        try {
          owner = await resources(chapterId, ticket);
          for (const row of catalog.filter(item => matches(item) && item.chapterId === chapterId)) {
            const saved = await store.get(row.slot); current(ticket);
            if (!agrees(row, saved)) throw new Error('save changed during listing');
            const environment = createPlayerEnvironment(owner.pack, { playerFaction: saved.record.snapshot?.state?.player_faction });
            const bound = createPlayerSaveStore({ environment, store });
            const verified = await bound.get(row.slot); current(ticket);
            if (!verified || saveJSON(verified.token) !== saveJSON(saved.token)) throw new Error('save changed during preflight');
            group.push({ slot: row.slot, label: verified.snapshot.label ?? '', player: environment.player, chapterId, token: verified.token });
          }
          for (const choice of group) next[next.findIndex(row => row.slot === choice.slot)] = choice;
        } catch { current(ticket); /* Whole chapter remains inert, matching repository load's all-row gate. */ }
        finally { if (owner) release(owner); }
      }
      current(ticket); choices = next; listing(); return true;
    } catch (error) {
      if (isGameDeletedFailure(error)) { deleted(ticket); return false; }
      failed(ticket); return false;
    }
  }
  async function choose(choice) {
    if (closed || phase !== 'list' || !choice.token || !choices.includes(choice)) return;
    const ticket = ++epoch; phase = 'restoring'; heading.textContent = '載入存檔'; message.textContent = '正在重新准入並捕獲所選存檔…'; rows.replaceChildren();
    let owner;
    try {
      owner = await resources(choice.chapterId, ticket); current(ticket);
      const environment = createPlayerEnvironment(owner.pack, { playerFaction: choice.player });
      const saves = createPlayerSaveStore({ environment, store });
      let transferred = false;
      const repository = await capturePlayerSaveRepository({ saves, expectedToken: choice.token, assertCurrent: () => { if (!transferred) current(ticket); owner.pack.assertCurrent(); } });
      current(ticket); owner.pack.assertCurrent();
      // The captured repository outlives this UI. Its guard must not retain the
      // chooser epoch; bind only the pack after the transfer succeeds.
      transferred = true; closed = true; epoch++; owners.delete(owner); host.remove();
      resolve(Object.freeze({ session: owner.session, pack: owner.pack, environment, saveRepository: repository, savedSlot: choice.slot, chapters: preview.chapters }));
    } catch (error) {
      if (owner) { try { release(owner); } catch { /* Retain for retry. */ } }
      if (isGameDeletedFailure(error)) deleted(ticket); else failed(ticket);
    }
  }
  function close() {
    if (closed) return true;
    const ticket = ++epoch;
    try { releaseAll(); } catch { failed(ticket); return false; }
    closed = true; host.remove(); resolve(null); return true;
  }
  host.addEventListener('contextmenu', event => {
    event.preventDefault(); event.stopPropagation();
    if (phase === 'unavailable') listing();
    else if (phase === 'restoring') { const ticket = ++epoch; try { releaseAll(); listing(); } catch { failed(ticket); } }
    else close();
  });
  host.addEventListener('keydown', event => {
    event.stopPropagation(); if (event.key !== 'Tab') return; event.preventDefault();
    const controls = [...rows.querySelectorAll('button')], index = controls.indexOf(document.activeElement);
    if (!controls.length) { host.focus(); return; }
    let target;
    if (index < 0) target = event.shiftKey ? controls.length - 1 : 0;
    else target = (index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length;
    controls[target].focus();
  });
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'wheel']) host.addEventListener(type, event => event.stopPropagation());
  host.focus(); void refresh(); return Object.freeze({ result, close });
}
