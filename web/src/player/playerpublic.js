// Public, same-origin entry composition. No editor API, alternate origin, or
// historical admission. The shared App is started exactly once per document.
import { createPlayerReader } from './playerclient.js';
import { mountPlayerCatalog } from './playercatalog.js';
import { mountPlayerNewGame } from './playernewgame.js';
import { mountPlayerRestore } from './playerrestore.js';
import { createPlayerStaticReader } from './playerstatic.js';
import { createPlayerEnvironment } from './playerenvironment.js';
import { createPlayerSaveStore } from './playersaves.js';
import { createPlayerSaveRepository } from './playerrepository.js';
import { createPlayerSessionHost } from './playersessionhost.js';
import { createGameSaveStore } from '../core/gamesavestore.js';
import { readGameSaveCatalogs } from '../core/gamesavecatalogs.js';
import { TRIAL_COMPILER_REVISION } from '../content/authoring/trialcompile.js';
import { isGameId } from './runtimecontract.js';

export function publicPlayerRequest(search) {
  const params = new URLSearchParams(search);
  if (!params.has('formalGame') && !params.has('mode')) return null;
  const gameId = params.get('formalGame'), mode = params.get('mode');
  if (params.getAll('formalGame').length !== 1 || params.getAll('mode').length !== 1 ||
      [...params.keys()].some(key => key !== 'formalGame' && key !== 'mode') ||
      !isGameId(gameId) || !['new', 'load'].includes(mode)) throw new TypeError('invalid formal entry');
  return Object.freeze({ gameId, mode });
}
export function navigatePlayerGame(gameId, mode) {
  const target = new URL('./index.html', location.href);
  target.searchParams.set('formalGame', gameId); target.searchParams.set('mode', mode);
  publicPlayerRequest(target.search); // Never turn a name or external URL into navigation.
  location.assign(target.href);
}
function initialPage() { location.assign(new URL('./', location.href).href); }
export function mountPublicCatalog(root, { selectionVisible = true } = {}) {
  let reader;
  try { reader = createPlayerReader({ origin: location.origin }); }
  catch { reader = { async registry() { throw new Error('formal reader requires HTTPS'); } }; }
  const node = root.ownerDocument.createElement('div'); node.className = 'player-public-catalog';
  Object.assign(node.style, { position: 'fixed', top: '8px', left: 'max(16px, calc((100vw - 560px) / 2))', width: 'min(560px, calc(100vw - 32px))', zIndex: '10000', fontSize: '14px', color: '#201800' });
  root.append(node);
  const view = mountPlayerCatalog({ root: node, reader, selectionVisible,
    readLocalCatalogs: selectionVisible ? () => readGameSaveCatalogs({ databaseName: 'wolong-web', getIndexedDB: () => indexedDB }) : undefined,
  });
  void view.refresh();
  return Object.freeze({ node, view, close() { view.close(); node.remove(); } });
}
function showFailure(root) {
  const document = root.ownerDocument, node = document.createElement('section');
  node.className = 'player-public-failure'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-label', '遊戲暫不可用');
  Object.assign(node.style, { position: 'fixed', inset: '25% 12%', zIndex: '10002', background: '#f0d090', color: '#201800', border: '4px solid #806020', padding: '16px' });
  const text = document.createElement('p');
  text.textContent = '目前無法取得所選遊戲的上架版本或必要資料。沒有開始對局，也沒有刪除存檔。';
  const retry = document.createElement('button'), back = document.createElement('button');
  retry.type = back.type = 'button'; retry.textContent = '重新載入'; back.textContent = '返回首頁';
  retry.onclick = () => location.reload(); back.onclick = initialPage;
  node.append(text, retry, back); root.append(node);
  node.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); initialPage(); });
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'wheel']) node.addEventListener(type, event => event.stopPropagation());
  node.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === retry ? back : retry).focus(); }
  });
  retry.focus();
}
export async function launchPublicPlayer({ opening, startApp, request, root = document.body }) {
  if (typeof startApp !== 'function' || !root?.ownerDocument || !isGameId(request?.gameId) || !['new', 'load'].includes(request.mode))
    throw new TypeError('explicit public entry and shared App required');
  const { gameId, mode } = request;
  const catalog = mountPublicCatalog(root, { selectionVisible: false });
  let choice, host, selected;
  try {
    const reader = createPlayerReader({ origin: location.origin });
    const registry = await reader.registry();
    const selection = registry.directory.find(entry => entry.gameId === gameId);
    if (!selection) throw new Error('current listed game unavailable');
    await opening?.menuReady;
    // Bind to this loaded module, never a query parameter, mutable <base>, or
    // a fresh current-program lookup that could hot-swap an admitted session.
    const programBase = new URL('../../', import.meta.url);
    if (programBase.origin !== location.origin) throw new Error('same-origin program required');
    const policy = { compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 256 * 1024 * 1024,
      readStatic: createPlayerStaticReader({ origin: location.origin, basePath: programBase.pathname }) };
    // Same browser origin/store as the built-in player; disjoint game keys. No
    // legacy migration, fallback database, or remote save transport.
    const store = createGameSaveStore({ gameId, databaseName: 'wolong-web', getIndexedDB: () => indexedDB });
    choice = mode === 'load'
      ? mountPlayerRestore({ root, reader, selection, store, ...policy })
      : mountPlayerNewGame({ root, reader, selection, ...policy });
    selected = await choice.result;
    catalog.close();
    if (!selected) { initialPage(); return; }
    host = createPlayerSessionHost({ session: selected.session, pack: selected.pack, root,
      navigate({ reason, initialAction }) {
        // The host calls this only after required deletion/error confirmation.
        if (reason === 'title' && initialAction === 'load') navigatePlayerGame(gameId, 'load');
        else initialPage();
      },
    });
    const environment = selected.environment ?? createPlayerEnvironment(selected.pack, { playerFaction: selected.playerFaction });
    const saveRepository = selected.saveRepository ?? createPlayerSaveRepository({
      saves: createPlayerSaveStore({ environment, store }), assertCurrent: selected.pack.assertCurrent,
    });
    await startApp(opening, { formal: { environment, saveRepository, savedSlot: selected.savedSlot ?? null,
      onExit: host.onExit, checkStatus: host.checkStatus } });
  } catch {
    catalog.close();
    if (host) { void host.onExit({ reason: 'unavailable' }); return; }
    // Before App ownership, only this composition owns the selected resources.
    try { choice?.close(); } catch { /* A fresh page is required after startup failure. */ }
    try { selected?.session.close(); } catch { /* Do not turn cleanup into admission. */ }
    try { selected?.pack.close(); } catch { /* Document navigation releases owned URLs. */ }
    showFailure(root);
  }
}
