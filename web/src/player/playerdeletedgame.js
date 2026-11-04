// 玩家侧删除事实的唯一表现（用户 m256/m262 产品决定）：告知而非询问，只有一个「確認」，
// 确认即无条件清除本机进度并返回游戏开始的选择页。右键、Esc 都不关闭也不回退，弹窗是
// 阻塞项。清档沿用逐槽 compare-delete：核不上的保留，不猜删、不整库丢弃。
// 读者只把显式的 GAME_DELETED 事实当作删除证据，目录里缺一条不算删。
export const GAME_DELETED_NOTICE = '該遊戲已刪除！';

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

export function mountDeletedGameNotice({ root, store, onExit = () => {} }) {
  if (!root?.ownerDocument || typeof root.append !== 'function') throw new TypeError('prompt root required');
  if (typeof store?.list !== 'function' || typeof store?.get !== 'function' || typeof store?.compareDelete !== 'function')
    throw new TypeError('game-local save store required');
  if (typeof onExit !== 'function') throw new TypeError('prompt exit port required');
  const document = root.ownerDocument;
  const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const host = make('section'), message = make('p'), status = make('p'), confirm = make('button', '確認');
  host.className = 'player-game-deleted'; host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true'); host.setAttribute('aria-label', '遊戲已刪除'); host.tabIndex = -1;
  host.dataset.gameDeleted = 'blocking';
  Object.assign(host.style, { position: 'fixed', inset: '25% 12%', zIndex: '10002', background: '#f0d090', color: '#201800', border: '4px solid #806020', padding: '16px' });
  message.textContent = GAME_DELETED_NOTICE; status.setAttribute('role', 'status');
  confirm.type = 'button';
  host.append(message, confirm, status); root.append(host);
  let settled = false, working = false, resolve;
  const result = new Promise(done => { resolve = done; });
  // No second answer exists: the only exit is confirming the local purge.
  async function accept() {
    if (settled || working) return;
    working = true; confirm.disabled = true;
    status.textContent = '正在清除本機進度…';
    let summary;
    try { summary = await discardLocalSaves({ store }); }
    catch {
      // Nothing was guessed away; the same confirmation stays the only control.
      if (settled) return;
      working = false; confirm.disabled = false;
      status.textContent = '本機進度尚未清除，請再確認一次。';
      confirm.focus();
      return;
    }
    if (settled) return;
    settled = true; host.remove();
    const action = { deleted: summary.deleted, kept: summary.kept };
    resolve(action); onExit(action);
  }
  confirm.addEventListener('click', () => { void accept(); });
  // Right click and Escape never close, step back or stand in for the answer.
  for (const type of ['contextmenu', 'auxclick', 'pointerdown', 'mousedown', 'mouseup', 'wheel'])
    host.addEventListener(type, event => { event.preventDefault(); event.stopPropagation(); });
  host.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key !== 'Tab') { event.preventDefault(); return; }
    event.preventDefault();
    (confirm.disabled ? host : confirm).focus();
  });
  confirm.focus();
  return Object.freeze({ node: host, result, accept, close: () => { if (!settled) { settled = true; host.remove(); resolve(null); } } });
}
