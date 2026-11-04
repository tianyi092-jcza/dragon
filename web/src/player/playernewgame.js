// Formal new-game chooser. Only an explicit faction click transfers a newly
// admitted session/pack to the caller; this view never installs an App or saves.
import { loadPlayerChapters, admitPlayerChapter } from './playerchapters.js';
import { isGameDeletedFailure, mountDeletedGameNotice } from './playerdeletedgame.js';
import { loadPlayerPack } from './playerpack.js';

export function mountPlayerNewGame({ root, reader, selection, store, compilerRevision, maxTotalBytes, readStatic }) {
  if (!root?.ownerDocument || typeof root.append !== 'function' ||
      typeof reader?.admit !== 'function' || typeof reader?.status !== 'function' ||
      typeof compilerRevision !== 'string' || !compilerRevision ||
      !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || typeof readStatic !== 'function')
    throw new TypeError('new-game root, reader and explicit pack policy required');
  // Capture the requested directory observation; retries must not silently
  // switch releases. A changed current version requires a new directory choice.
  const selected = structuredClone(selection), document = root.ownerDocument;
  const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const host = make('section'), heading = make('h2', '選擇章節'), message = make('p'), rows = make('div');
  host.className = 'player-new-game'; host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', '正式新局'); host.tabIndex = -1;
  Object.assign(host.style, { position: 'fixed', inset: '18% 12% 8%', zIndex: '9999', background: '#f0d090', color: '#201800', border: '4px solid #806020', padding: '16px', display: 'flex', flexDirection: 'column' });
  Object.assign(rows.style, { overflow: 'auto', minHeight: '0', display: 'grid', gap: '6px' });
  host.append(heading, message, rows, make('p', '右鍵返回')); root.append(host);
  let epoch = 0, closed = false, phase = 'chapters', preview = null, owned = null, resolve;
  const result = new Promise(done => { resolve = done; });
  const current = ticket => {
    if (closed || ticket !== epoch) throw new DOMException('New-game choice superseded', 'AbortError');
  };
  function release(owner) {
    if (!owner) return;
    let failure;
    try { owner.session?.close(); } catch (error) { failure = error; }
    try { owner.pack?.close(); } catch (error) { failure ??= error; }
    if (failure) throw failure;
    if (owned === owner) owned = null;
  }
  function button(text, action, key, value) {
    const node = make('button', text); node.type = 'button';
    if (key) node.dataset[key] = String(value);
    node.addEventListener('click', action); rows.append(node); return node;
  }
  function failed(ticket) {
    if (closed || ticket !== epoch) return;
    phase = 'error'; heading.textContent = '新局暫不可用';
    message.textContent = '資料取得或版本檢查未完成，沒有開始對局。可重試；版本已變更時請返回重新選擇遊戲。';
    rows.replaceChildren(); button('重試', () => { void refresh(); });
  }
  // 用户 m256/m262：新局流程中被告知删除时同样只有確認；确认即清本机进度并回选择页。
  let notice = null;
  function deleted(ticket) {
    if (closed || ticket !== epoch) return;
    phase = 'deleted'; heading.textContent = ''; message.textContent = ''; rows.replaceChildren();
    if (notice) return;
    notice = mountDeletedGameNotice({ root, store, onExit: () => { notice = null; close(); } });
  }
  function chapters() {
    phase = 'chapters'; heading.textContent = '選擇章節'; message.textContent = `${preview.selection.name} ${preview.selection.ordinal}`;
    rows.replaceChildren();
    for (const row of preview.chapters)
      button(`${row.name}　${row.start.year}/${row.start.month}/${row.start.day}`, () => { void choose(row.chapterId); }, 'chapterId', row.chapterId);
  }
  async function refresh() {
    if (closed) return false;
    const ticket = ++epoch; phase = 'loading-chapters';
    heading.textContent = '選擇章節'; message.textContent = '正在核對目前上架版本…'; rows.replaceChildren();
    try {
      release(owned);
      const value = await loadPlayerChapters({ reader, selection: selected, assertCurrent: () => current(ticket) });
      current(ticket); preview = value; chapters(); return true;
    } catch (error) { if (isGameDeletedFailure(error)) deleted(ticket); else failed(ticket); return false; }
  }
  async function choose(chapterId) {
    if (closed || phase !== 'chapters' || !preview.chapters.some(row => row.chapterId === chapterId)) return;
    const ticket = ++epoch, owner = { session: null, pack: null }; owned = owner;
    phase = 'loading-pack'; heading.textContent = '載入章節'; message.textContent = '正在取得固定版本資源…'; rows.replaceChildren();
    try {
      owner.session = await admitPlayerChapter({ reader, selection: preview.selection, chapterId, assertCurrent: () => current(ticket) });
      current(ticket);
      owner.pack = await loadPlayerPack({ session: owner.session, compilerRevision, maxTotalBytes, readStatic });
      current(ticket); owner.pack.assertCurrent();
      const factions = owner.pack.chapter.factions;
      if (!Array.isArray(factions)) throw new TypeError('chapter factions required');
      const visible = factions.filter(faction => typeof faction?.monarch === 'string' && faction.monarch.trim());
      if (!visible.length || visible.some(faction => !Number.isSafeInteger(faction.idx) || faction.idx < 0) || new Set(visible.map(faction => faction.idx)).size !== visible.length)
        throw new TypeError('explicit unique faction slots required');
      phase = 'factions'; heading.textContent = '選擇勢力'; message.textContent = owner.pack.chapter.name;
      rows.replaceChildren();
      for (const faction of visible) button(faction.monarch, () => {
        if (closed || phase !== 'factions' || ticket !== epoch) return;
        try { owner.pack.assertCurrent(); }
        catch { try { release(owner); } catch { /* Retry retains ownership. */ } failed(ticket); return; }
        // Use the actual declared slot, never the filtered row index.
        closed = true; epoch++; owned = null; host.remove();
        resolve(Object.freeze({ session: owner.session, pack: owner.pack, playerFaction: faction.idx, chapters: preview.chapters }));
      }, 'factionSlot', faction.idx);
    } catch (error) {
      try { release(owner); } catch { /* Keep the owned handle for explicit retry. */ }
      if (isGameDeletedFailure(error)) deleted(ticket); else failed(ticket);
    }
  }
  function close() {
    if (closed) return true;
    const ticket = ++epoch;
    try { release(owned); }
    catch { failed(ticket); return false; }
    closed = true; host.remove(); resolve(null); return true;
  }
  function back(event) {
    event.preventDefault(); event.stopPropagation();
    if (closed) return;
    if (phase === 'factions' || phase === 'loading-pack') {
      const ticket = ++epoch;
      try { release(owned); chapters(); } catch { failed(ticket); }
    } else close();
  }
  host.addEventListener('contextmenu', back);
  host.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const controls = [...rows.querySelectorAll('button')];
    event.preventDefault();
    if (!controls.length) { host.focus(); return; }
    const index = controls.indexOf(document.activeElement);
    let target;
    if (index < 0) target = event.shiftKey ? controls.length - 1 : 0;
    else target = (index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length;
    controls[target].focus();
  });
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'wheel']) host.addEventListener(type, event => event.stopPropagation());
  host.focus(); void refresh();
  return Object.freeze({ result, close });
}
