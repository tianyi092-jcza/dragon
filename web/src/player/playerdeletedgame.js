// Load-time deletion facts only. A game missing from the public directory is
// not deletion evidence: only the reader's explicit GAME_DELETED fact is. Local
// saves are removed slot by slot through the store's compare-delete, never by
// dropping the database, and any row whose body/catalog pair cannot be verified
// is retained instead of guessed away.
export const GAME_DELETED_SAVE_NOTICE = '該遊戲已被刪除，存檔不可用，是否刪除？';

export function isGameDeletedFailure(error) {
  return error?.code === 'GAME_DELETED' && error.status === 410;
}

export async function confirmGameDeleted({ reader, gameId }) {
  if (typeof reader?.status !== 'function') throw new TypeError('reader status port required');
  if (typeof gameId !== 'string' || !gameId) throw new TypeError('game ID required');
  try { await reader.status(gameId); return false; }
  catch (error) { if (isGameDeletedFailure(error)) return true; throw error; }
}

export async function discardLocalSaves({ store }) {
  if (typeof store?.list !== 'function' || typeof store?.get !== 'function' || typeof store?.compareDelete !== 'function')
    throw new TypeError('game-local save store required');
  const rows = await store.list();
  if (!Array.isArray(rows)) throw new TypeError('game-local save catalog required');
  let deleted = 0, kept = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row?.slot) || row.slot < 0) { kept++; continue; }
    let saved;
    try { saved = await store.get(row.slot); } catch { kept++; continue; }
    // Already gone, or the summary no longer describes the body: no delete claim.
    if (saved === null) continue;
    if (saved.token?.bodyDigest !== row.bodyDigest) { kept++; continue; }
    try { await store.compareDelete(saved.token); deleted++; } catch { kept++; }
  }
  return Object.freeze({ deleted, kept });
}

export function mountDeletedSavePrompt({ root, store, onExit = () => {} }) {
  if (!root?.ownerDocument || typeof root.append !== 'function') throw new TypeError('prompt root required');
  if (typeof store?.list !== 'function' || typeof store?.get !== 'function' || typeof store?.compareDelete !== 'function')
    throw new TypeError('game-local save store required');
  if (typeof onExit !== 'function') throw new TypeError('prompt exit port required');
  const document = root.ownerDocument;
  const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const host = make('section'), message = make('p'), status = make('p');
  const remove = make('button', '刪除本機存檔'), keep = make('button', '保留存檔');
  host.className = 'player-save-deleted'; host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true'); host.setAttribute('aria-label', '存檔不可用'); host.tabIndex = -1;
  Object.assign(host.style, { position: 'fixed', inset: '25% 12%', zIndex: '10002', background: '#f0d090', color: '#201800', border: '4px solid #806020', padding: '16px' });
  message.textContent = GAME_DELETED_SAVE_NOTICE; status.setAttribute('role', 'status');
  remove.type = keep.type = 'button';
  host.append(message, remove, keep, status, make('p', '右鍵保留存檔')); root.append(host);
  let settled = false, purged = false, resolve;
  const result = new Promise(done => { resolve = done; });
  // Right click never deletes: it is the keep/leave answer in every phase.
  function finish() {
    if (settled) return;
    settled = true; host.remove();
    const action = purged ? 'deleted' : 'kept';
    resolve(action); onExit(action);
  }
  keep.addEventListener('click', finish);
  remove.addEventListener('click', async () => {
    if (settled || purged || remove.disabled) return;
    remove.disabled = keep.disabled = true;
    status.textContent = '正在刪除本機存檔…';
    try {
      const summary = await discardLocalSaves({ store });
      if (settled) return;
      // The deletion is complete and irreversible; the remaining control only
      // leaves the page, so it must not offer a second deletion.
      purged = true; remove.hidden = true; keep.disabled = false; keep.textContent = '返回首頁';
      status.textContent = `已刪除${summary.deleted}個本機存檔${summary.kept ? `；另有${summary.kept}個無法核對的存檔保留未動` : ''}。`;
      keep.focus();
    } catch {
      if (settled) return;
      remove.disabled = keep.disabled = false;
      status.textContent = '刪除未完成，本機存檔保留未動。可重試或返回。';
      remove.focus();
    }
  });
  host.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); finish(); });
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'wheel']) host.addEventListener(type, event => event.stopPropagation());
  host.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const controls = [remove, keep].filter(button => !button.hidden && !button.disabled);
    if (!controls.length) { host.focus(); return; }
    const index = controls.indexOf(document.activeElement);
    controls[index < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
  });
  remove.focus();
  return Object.freeze({ node: host, result, close: finish });
}
