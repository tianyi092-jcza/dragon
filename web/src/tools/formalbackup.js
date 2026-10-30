// Standalone backup page, not a gameplay/Trial surface. Each operation obtains
// fresh current-release admission; no pack or save permission survives it.
import { loadPlayerChapters, admitPlayerChapter } from '../player/playerchapters.js';
import { loadPlayerPack } from '../player/playerpack.js';
import { createPlayerEnvironment } from '../player/playerenvironment.js';
import { createPlayerSaveStore } from '../player/playersaves.js';
import { MAX_SAVE_FILE_BYTES } from '../core/saveexchange.js';
import { nextSaveId } from '../core/savecatalog.js';
import { saveReleaseOrdinalFromVersion } from '../core/gamesavecodec.js';

export function mountFormalBackup({ root, reader, createStore, compilerRevision, maxTotalBytes, readStatic }) {
  const document = root.ownerDocument;
  const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const game = make('select'), chapter = make('select'), file = make('input');
  game.setAttribute('aria-label', '備份遊戲'); chapter.setAttribute('aria-label', '備份章節');
  file.type = 'file'; file.accept = '.json,application/json'; file.setAttribute('aria-label', '正式遊戲備份檔');
  const refresh = make('button', '更新上架遊戲'), chapters = make('button', '讀取章節'), list = make('button', '讀取本機目錄'), importing = make('button', '驗證並另存新槽');
  for (const button of [refresh, chapters, list, importing]) button.type = 'button';
  const message = make('p'), rows = make('div'); message.setAttribute('role', 'status');
  root.append(make('h2', '正式自建遊戲備份'), make('p', '只處理目前上架版本。先選遊戲及章節；匯入另存新槽，不啟動對局。舊版／未知存檔不在此刪除，已匯入的新版本仍遵循保存時原子清舊政策。'), game, refresh, chapters, chapter, list, file, importing, message, rows);
  let directory = [], preview = null, busy = false, closed = false, owner = null;
  function current() { if (closed) throw new DOMException('Backup page closed', 'AbortError'); }
  function enabled() {
    for (const control of root.querySelectorAll('button,select,input')) control.disabled = busy || closed;
    game.disabled ||= !directory.length; chapters.disabled ||= !directory.length;
    chapter.disabled ||= !preview; list.disabled ||= !preview;
    importing.disabled ||= !preview || !file.files?.length;
  }
  function release() { if (owner) { owner.session?.close(); owner.pack?.close(); owner = null; } }
  async function run(action) {
    if (busy || closed) return;
    busy = true; enabled();
    try { await action(); }
    catch { if (!closed) message.textContent = '操作未完成。請重新核對版本、章節與檔案；未啟動對局。'; }
    finally { release(); busy = false; enabled(); }
  }
  function clearChapter() { preview = null; chapter.replaceChildren(); rows.replaceChildren(); file.value = ''; enabled(); }
  async function bound() {
    current();
    const chapterId = chapter.value;
    owner = { session: null, pack: null };
    const session = await admitPlayerChapter({ reader, selection: preview.selection, chapterId, assertCurrent: current });
    // pagehide may have released the pending owner before admission returns.
    if (closed) { session.close(); current(); }
    owner.session = session;
    const pack = await loadPlayerPack({ session, compilerRevision, maxTotalBytes, readStatic });
    if (closed) { pack.close(); current(); }
    owner.pack = pack;
    const latest = await reader.status(preview.selection.gameId); current();
    if (!latest.listed || latest.releaseId !== preview.selection.releaseId || latest.ordinal !== preview.selection.ordinal) throw new Error('backup release changed');
    const environment = createPlayerEnvironment(owner.pack, { playerFaction: owner.pack.chapter.factions[0].idx });
    const guarded = { ...environment, assertCurrent() { current(); environment.assertCurrent(); } };
    const store = createStore(preview.selection.gameId);
    return { saves: createPlayerSaveStore({ environment: guarded, store }), store };
  }
  refresh.onclick = () => run(async () => {
    clearChapter(); directory = []; game.replaceChildren();
    const registry = await reader.registry(); current(); directory = registry.directory;
    for (const entry of directory) { const option = make('option', `${entry.name} ${entry.ordinal}`); option.value = entry.gameId; game.append(option); }
    message.textContent = directory.length ? '請選擇遊戲並讀取章節。' : '目前沒有上架的自建遊戲。';
  });
  game.onchange = () => { clearChapter(); message.textContent = '請重新讀取所選遊戲章節。'; };
  chapter.onchange = () => { rows.replaceChildren(); file.value = ''; enabled(); };
  file.onchange = enabled;
  chapters.onclick = () => run(async () => {
    clearChapter();
    preview = await loadPlayerChapters({ reader, selection: directory.find(entry => entry.gameId === game.value), assertCurrent: current }); current();
    for (const entry of preview.chapters) { const option = make('option', entry.name); option.value = entry.chapterId; chapter.append(option); }
    message.textContent = '章節已核對。可讀取目錄或選擇此遊戲／章節的備份。';
  });
  list.onclick = () => run(async () => {
    rows.replaceChildren();
    const catalog = await createStore(preview.selection.gameId).list(); current();
    const ordinal = saveReleaseOrdinalFromVersion(preview.selection.ordinal);
    for (const entry of catalog) {
      const line = make('p', `槽${entry.slot + 1}　${entry.label ?? ''}　`);
      if (entry.releaseId === preview.selection.releaseId && entry.releaseOrdinal === ordinal && entry.chapterId === chapter.value && entry.manifestDigest === preview.selection.manifestDigest) {
        const button = make('button', '匯出目前槽 JSON'); button.type = 'button';
        button.onclick = () => run(async () => {
          const { saves } = await bound(), text = await saves.exportBackup(entry.slot); current();
          const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
          const link = make('a'); link.href = url; link.download = `wolong-${saves.identity.gameId}-${entry.slot + 1}.json`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          message.textContent = '已送出經驗證的備份下載，未改寫存檔。';
        });
        line.append(button);
      } else line.append(make('span', '非所選章節／版本，保留且不匯出'));
      rows.append(line);
    }
    message.textContent = `${catalog.length} 個本機存檔；目錄不是可恢復證明，匯出時仍須完整驗證。`;
  });
  importing.onclick = () => run(async () => {
    const chosen = file.files?.[0];
    if (!chosen || chosen.size > MAX_SAVE_FILE_BYTES) throw new TypeError('backup file budget');
    const text = await chosen.text(); current();
    const { saves, store } = await bound();
    const catalog = await store.list(); current();
    const receipt = await saves.importBackup(text, nextSaveId(catalog));
    // A committed receipt remains true even if pagehide retired the UI.
    if (closed) return;
    rows.replaceChildren(); file.value = '';
    message.textContent = `匯入已提交為槽${receipt.snapshot.slot + 1}。沒有啟動或替換對局，請重新讀取目錄。`;
  });
  enabled();
  message.textContent = '請先更新上架遊戲清單。';
  return Object.freeze({ close() { closed = true; release(); enabled(); } });
}
