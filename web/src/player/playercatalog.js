// Public title presentation only. The reader owns validation; this view never
// admits a session, navigates, or turns a missing row into deletion. Local
// summary inspection uses an explicit read-only port, only after a user click.
import { loadCloudFrameImages, paintCloudWindow } from './cloudframe.js';
const BUILTIN = Object.freeze({ kind: 'builtin', gameId: 'wolong-builtin', name: '臥龍傳·三國制霸之計（內置）' });
export function mountPlayerCatalog({ root, reader, selectionVisible = true, readLocalCatalogs }) {
  if (typeof selectionVisible !== 'boolean' || readLocalCatalogs !== undefined && typeof readLocalCatalogs !== 'function' || !root?.ownerDocument || typeof root.append !== 'function' || typeof reader?.registry !== 'function')
    throw new TypeError('catalog root and validated player reader required');
  const document = root.ownerDocument;
  const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const host = make('section'), notice = make('button', '通知暫不可用'), select = make('select');
  host.className = 'player-catalog'; notice.type = 'button';
  notice.className = 'player-catalog-notice'; select.setAttribute('aria-label', '選擇遊戲');
  select.hidden = !selectionVisible;
  Object.assign(host.style, { display: 'grid', gap: '12px', maxWidth: '100%' });
  Object.assign(notice.style, { height: '28px', padding: '0', border: '0', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  Object.assign(select.style, { width: '70%', height: '28px', justifySelf: 'center', boxSizing: 'border-box' });
  // 使用者 m/#722：入口改成右上角三顆圖示鈕底下的圓形「!」圖示，懸停才顯示文字。
  const manage = make('button', '!'), manageHint = make('span', '不可用存檔');
  manage.type = 'button'; manage.className = 'player-catalog-local';
  manage.setAttribute('aria-label', '不可用存檔'); manageHint.className = 'player-catalog-local-hint';
  manageHint.style.display = 'none';
  Object.assign(manageHint.style, { position: 'absolute', right: '49px', top: '50%', transform: 'translateY(-50%)', whiteSpace: 'nowrap', font: '13px "STKaiti", "KaiTi", serif', color: '#76684e', padding: '6px 9px', background: '#ffffffd9', borderRadius: '4px', pointerEvents: 'none' });
  Object.assign(manage.style, { position: 'fixed', right: 'max(20px, env(safe-area-inset-right))', top: '170px', zIndex: '10001', width: '40px', height: '40px', padding: '0', border: '1px solid #a59a8038', borderRadius: '50%', background: '#ffffffb8', color: '#76684e', font: 'bold 18px/1 "Noto Serif TC", serif', cursor: 'pointer', opacity: '.6', transition: 'opacity 180ms', display: 'grid', placeItems: 'center' });
  manage.append(manageHint);
  // 內聯 display 會蓋掉 [hidden]，所以兩者一起切。
  const manageHidden = !selectionVisible || !readLocalCatalogs;
  manage.hidden = manageHidden;
  if (manageHidden) manage.style.display = 'none';
  const reveal = shown => { manage.style.opacity = shown ? '1' : '.6'; manageHint.style.display = shown ? 'block' : 'none'; };
  manage.addEventListener('mouseenter', () => reveal(true));
  manage.addEventListener('mouseleave', () => reveal(false));
  manage.addEventListener('focus', () => reveal(true));
  manage.addEventListener('blur', () => reveal(false));
  host.append(notice, select, manage); root.append(host);
  let closed = false, epoch = 0, wanted = BUILTIN.gameId, entries = new Map(), announcements = [];
  let announcementError = true, directoryError = false, pending = false, modal = null;
  let nextCursor = null, catalogIdentity = null;
  function options() {
    select.replaceChildren();
    for (const entry of [BUILTIN, ...entries.values()]) {
      const option = make('option', entry.name);
      option.value = entry.gameId; select.append(option);
    }
    select.value = entries.has(wanted) ? wanted : BUILTIN.gameId;
  }
  function paint() {
    let message = '暫無發布資訊';
    if (pending) message = '正在取得發布資訊…';
    else if (announcementError) message = '通知暫不可用';
    else if (announcements.length) message = `${announcements[0].name} ${announcements[0].ordinal}　${announcements[0].creatorAccount}`;
    notice.textContent = message;
    if (!modal || modal.kind === 'local') return;
    const content = modal.content;
    modal.more.hidden = !nextCursor || announcementError;
    modal.more.disabled = modal.again.disabled = pending;
    content.replaceChildren();
    if (pending || announcementError || !announcements.length) {
      content.append(make('p', message));
      return;
    }
    const table = make('table'), heading = make('tr');
    for (const label of ['遊戲', '版本', '創建者', '發布日期', '首次上線日期']) heading.append(make('th', label));
    table.append(heading);
    // Preserve the reader's server-ordered public history, not just five rows.
    for (const row of announcements) {
      const tr = make('tr');
      for (const key of ['name', 'ordinal', 'creatorAccount', 'publishedAt', 'firstOnlineAt']) tr.append(make('td', row[key]));
      table.append(tr);
    }
    content.append(table);
  }
  async function refresh(append = false) {
    if (closed || append && (pending || !nextCursor)) return false;
    const ticket = ++epoch, cursor = append ? nextCursor : null;
    const previousIdentity = catalogIdentity;
    // Revalidation never leaves an old custom choice available as "latest".
    entries = new Map();
    if (!append) { announcements = []; nextCursor = null; }
    pending = true; options(); paint();
    try {
      const result = await reader.registry({ announcementCursor: cursor });
      if (closed || ticket !== epoch) return false;
      entries = new Map(result.directory.map(entry => [entry.gameId, Object.freeze({ ...entry, kind: 'formal' })]));
      announcementError = result.announcementsError !== null;
      const identity = `${result.generation}:${result.digest}`;
      if (announcementError) { announcements = []; nextCursor = null; }
      else {
        const rows = append && identity === previousIdentity && !result.announcementPage.reset
          ? [...announcements, ...result.announcements] : result.announcements;
        announcements = [...new Map(rows.map(row => [row.announcementId, row])).values()];
        nextCursor = result.announcementPage.nextCursor;
      }
      catalogIdentity = identity;
      directoryError = false;
    } catch {
      if (closed || ticket !== epoch) return false;
      entries = new Map(); announcements = []; nextCursor = null; catalogIdentity = null; announcementError = directoryError = true;
    }
    pending = false;
    if (!entries.has(wanted)) wanted = BUILTIN.gameId;
    options(); paint();
    return !directoryError;
  }
  function dismiss() {
    if (!modal) return;
    modal.node.remove(); modal = null;
    select.disabled = notice.disabled = manage.disabled = false;
    notice.focus();
  }
  function showAnnouncements() {
    if (closed || modal) return;
    const node = make('section'), content = make('div'), again = make('button', '重試'), more = make('button', '載入更多');
    more.type = 'button'; more.hidden = true;
    node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', '發布資訊');
    node.tabIndex = -1; again.type = 'button';
    Object.assign(node.style, { position: 'fixed', inset: '8%', zIndex: '10001', background: '#f0d090', color: '#201800', padding: '16px', border: '4px solid #806020', display: 'flex', flexDirection: 'column', gap: '8px' });
    Object.assign(content.style, { overflow: 'auto', flex: '1', minHeight: '0' });
    node.append(make('h2', '發布資訊'), content, more, again, make('p', '右鍵返回'));
    node.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); dismiss(); });
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'wheel']) node.addEventListener(type, event => event.stopPropagation());
    node.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const buttons = [more, again].filter(button => !button.hidden && !button.disabled);
      if (!buttons.length) { node.focus(); return; }
      const index = buttons.indexOf(document.activeElement);
      if (index === -1) {
        if (event.shiftKey) buttons.at(-1).focus();
        else buttons[0].focus();
        return;
      }
      buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    });
    again.addEventListener('click', () => { void refresh(); });
    more.addEventListener('click', () => { void refresh(true); });
    modal = { node, content, more, again }; host.append(node);
    select.disabled = notice.disabled = manage.disabled = true;
    node.focus(); void refresh();
  }
  function showLocalSaves() {
    if (closed || modal || !selectionVisible || !readLocalCatalogs) return;
    // 與中央「新游戏」彈窗同一套雲紋金框，尺寸與它同大（448×368，使用者 m950 要求放大 2 倍）；
    // 打開就自動檢查，底部不再放「重新檢查」按鈕。
    const W = 448, H = 368;
    const node = make('section'), backdrop = make('canvas'), content = make('div'), body = make('div');
    node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', '不可用存檔');
    node.tabIndex = -1;
    Object.assign(node.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: '10001', width: `${W}px`, height: `${H}px`, background: '#12233c', color: '#ffffff', display: 'flex', flexDirection: 'column' });
    backdrop.width = W; backdrop.height = H;
    Object.assign(backdrop.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', imageRendering: 'pixelated', pointerEvents: 'none' });
    Object.assign(content.style, { position: 'relative', zIndex: '1', flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px 22px 14px' });
    Object.assign(body.style, { flex: '1', minHeight: '0', overflow: 'auto', overflowWrap: 'anywhere', fontSize: '15px', lineHeight: '1.6' });
    const heading = make('h2', '不可用存檔');
    Object.assign(heading.style, { margin: '0', fontSize: '20px', fontWeight: 'normal', textAlign: 'center', color: '#ffffff' });
    const legend = make('p', '只讀顯示本機目錄，不會清除或改寫存檔。');
    legend.style.margin = '0';
    const hint = make('p', '右鍵返回');
    Object.assign(hint.style, { margin: '0', fontSize: '12px', textAlign: 'right', opacity: '.8' });
    content.append(heading, legend, body, hint);
    node.append(backdrop, content);
    const owner = { kind: 'local', node, content: body }; modal = owner;
    void (async () => { try { const images = await loadCloudFrameImages(); if (closed || modal !== owner) return; paintCloudWindow(backdrop.getContext('2d'), images, W, H); } catch { /* 素材不可用時保留純色底，不影響只讀資訊。 */ } })();
    let localEpoch = 0;
    async function inspect() {
      if (closed || modal !== owner) return;
      const ticket = ++localEpoch; body.replaceChildren(make('p', '正在檢查本機目錄…'));
      try {
        const report = await readLocalCatalogs();
        if (closed || modal !== owner || ticket !== localEpoch) return;
        if (report?.bodiesRead !== false || !Array.isArray(report.catalogs) || !Number.isSafeInteger(report.otherKeyCount) || report.otherKeyCount < 0) throw new TypeError('local catalog report required');
        const fragment = document.createDocumentFragment(), seen = new Set();
        for (const catalog of report.catalogs) {
          if (typeof catalog?.gameId !== 'string' || !catalog.gameId || seen.has(catalog.gameId) || !['summary-only', 'corrupt-summary'].includes(catalog.state) || !Array.isArray(catalog.rows)) throw new TypeError('invalid local catalog');
          seen.add(catalog.gameId); fragment.append(make('p', `遊戲 ${catalog.gameId}`));
          if (catalog.state === 'corrupt-summary') { fragment.append(make('p', '目錄損壞，保留原資料。')); continue; }
          if (!catalog.rows.length) fragment.append(make('p', '沒有槽摘要。'));
          for (const row of catalog.rows) {
            if (!Number.isSafeInteger(row?.slot) || row.slot < 0 || !['string', 'number'].includes(typeof row.releaseOrdinal)) throw new TypeError('invalid local summary');
            fragment.append(make('p', `槽${row.slot + 1}　版本序號 ${row.releaseOrdinal}`));
          }
        }
        if (!report.catalogs.length) fragment.append(make('p', '沒有此格式的本機遊戲目錄。'));
        if (report.otherKeyCount) fragment.append(make('p', `另有 ${report.otherKeyCount} 個鍵未讀取，全部保留。`));
        body.replaceChildren(fragment);
      } catch {
        if (!closed && modal === owner && ticket === localEpoch) body.replaceChildren(make('p', '檢查未完成，不能判定為沒有存檔；沒有刪除或改寫任何資料。'));
      }
    }
    node.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); dismiss(); });
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'wheel']) node.addEventListener(type, event => event.stopPropagation());
    node.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Tab') { event.preventDefault(); node.focus(); } });
    host.append(node); select.disabled = notice.disabled = manage.disabled = true;
    node.focus(); void inspect();
  }
  manage.addEventListener('click', showLocalSaves);
  select.addEventListener('change', () => { wanted = entries.has(select.value) ? select.value : BUILTIN.gameId; });
  notice.addEventListener('click', showAnnouncements);
  options(); paint();
  return Object.freeze({ refresh, showAnnouncements,
    selection() { return closed || modal || !selectionVisible ? null : entries.get(select.value) ?? BUILTIN; },
    close() { if (closed) return; closed = true; epoch++; modal = null; host.remove(); entries.clear(); announcements = []; },
  });
}
