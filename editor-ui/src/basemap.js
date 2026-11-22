// Framework-free controller. Source/template bodies never enter the Vue model.
// preview and paint are native editor-core ports, not reactive view callbacks.
import { previewMapEdits } from '../../web/src/editor/mapcommands.js';
import { parseMapSides } from '../../web/src/content/authoring/mapextent.js';
import { changesMapPositions } from '../../web/src/editor/mapobjectmove.js';
import { assertMapPositions } from '../../web/src/editor/mappositionvalidation.js';
import { MAP_EDIT_MAX_COMMANDS, MAP_EDIT_MAX_BYTES } from '../../web/src/editor/mapeditlimits.js';

export { createMapController as createBaseMapController };
export function createMapController({ api, work, publish, preview = previewMapEdits, paint, confirm, gameId = null }) {
  const path = gameId ? '/api/games/' + encodeURIComponent(gameId) + '/copy' : '/api/admin/base-map';
  let identity = null, actorId = null, actorVersion = null, generation = 0;
  let pendingForm = false, readRevision = 0, saveReport = null;
  let snapshot = null, candidate = null, edits = [], undoSizes = [], loaded = false, uncertain = false, message = '', serverProblems = [];
  const permitted = () => Boolean(identity && !identity.user.mustChangePassword && (gameId ? ['admin', 'author'].includes(identity.user.role) : identity.user.role === 'admin'));
  const current = mark => mark === generation && permitted() && identity.user.id === actorId && (identity.version ?? null) === actorVersion;
  const extentSides = () => {
    try { return candidate?.map?.bounds ? parseMapSides(candidate.map.bounds) : null; }
    catch { return null; }
  };
  const render = () => publish({ loaded, exists: Boolean(snapshot), version: snapshot?.version ?? 0,
    dirty: edits.length > 0, editCount: edits.length, locked: !permitted() || uncertain || !snapshot,
    uncertain, message, serverProblems, saveReport, readRevision, gameId, gameScoped: Boolean(gameId),
    extentSides: extentSides(),
    seaGroundPending: edits.some(edit => edit.op === 'sea-ground-enable'),
    seaGroundEnabled: candidate?.map.base.policy === 'sea-ground-1' });
  function install(value) {
    if (gameId && (value.gameId !== gameId || value.data?.gameId !== gameId || !/^[a-f0-9]{64}$/.test(value.copyDigest) || !value.data.map)) throw new Error('遊戲地圖回應無效');
    let next = null;
    if (gameId) next = { content: { ...value.data, editorAssets: value.data.mapEditorAssets }, digest: value.copyDigest, version: value.copyDigest.slice(0, 12) };
    else if (value.snapshot !== null) next = { ...value.snapshot, content: value.snapshot?.template?.content };
    if (!gameId && next !== null && (!Number.isSafeInteger(next?.version) || next.version < 1 || !/^[a-f0-9]{64}$/.test(next.digest) || !next.content?.map)) throw new Error('基礎地圖回應無效');
    // Stage the visible product transition, never write on GET. Save/undo/leave
    // use the same command history as ordinary edits; old formal content is unchanged.
    const pending = next && next.content.map.base.policy === undefined ? [{ op: 'sea-ground-enable' }] : [];
    const prepared = next ? preview(next.content, pending) : null;
    pendingForm = false; readRevision++;
    snapshot = next; candidate = prepared; edits = pending; undoSizes = pending.length ? [1] : []; loaded = true; uncertain = false; serverProblems = [];
    paint(candidate, false); render();
  }
  async function read(mark, options) {
    const value = await api(path, undefined, options);
    if (!current(mark)) return;
    if (!options) saveReport = null;
    install(value);
  }
  async function reload() {
    const mark = generation;
    if (!permitted() || ((edits.length || pendingForm) && !confirm('重新讀取將放棄尚未保存的地圖修改，是否繼續？')) || !current(mark)) return;
    return work(async () => {
      if (!current(mark)) return;
      try { await read(mark); if (current(mark)) message = gameId ? '已重新讀取遊戲地圖。' : '已重新讀取基礎地圖。'; }
      catch (error) { if (current(mark)) { uncertain = true; message = error.message; } }
      if (current(mark)) render();
    });
  }
  async function initialize() {
    if (gameId || !permitted() || snapshot || !loaded) return;
    const mark = generation;
    return work(async () => {
      if (!current(mark)) return;
      try {
        await api('/api/admin/base-map/initialize', {});
        if (!current(mark)) return;
        await read(mark);
        if (current(mark)) message = '基礎地圖已建立。';
      } catch (error) { if (current(mark)) { uncertain = true; message = error.message; } }
      if (current(mark)) render();
    });
  }
  function stage(edit) {
    if (!permitted() || uncertain || !snapshot) return false;
    // One user action may expand into existing wire commands; preview and undo
    // still commit the entire action, while the server keeps its flat protocol.
    const batch = structuredClone(Array.isArray(edit) ? edit : [edit]);
    if (!batch.length) throw new Error('修改批次不可為空。');
    const pending = [...edits, ...batch];
    if (pending.length > MAP_EDIT_MAX_COMMANDS || new TextEncoder().encode(JSON.stringify(gameId ? { module: 'map', patch: { edits: pending } } : { edits: pending })).length > MAP_EDIT_MAX_BYTES)
      throw new Error('本次修改超過保存上限（4096條命令／16 MiB）。已有修改可先保存；若單次操作仍超限，請縮小選取範圍。');
    const next = preview(snapshot.content, pending);
    saveReport = null;
    candidate = next; edits = pending; undoSizes = [...undoSizes, batch.length]; serverProblems = []; message = '有尚未保存的修改。'; paint(candidate, pending.some(changesMapPositions)); render();
    return true;
  }
  function undo() {
    if (!permitted() || uncertain || !edits.length) return;
    const pending = edits.slice(0, -undoSizes.at(-1)), next = preview(snapshot.content, pending);
    saveReport = null;
    candidate = next; edits = pending; undoSizes = undoSizes.slice(0, -1); serverProblems = [];
    message = pending.length ? '已撤銷上一步；仍有未保存修改。' : '已撤銷全部未保存修改。';
    paint(candidate, pending.some(changesMapPositions)); render();
  }
  async function save() {
    if (!permitted() || uncertain || !edits.length) return;
    const mark = generation, pending = structuredClone(edits);
    return work(async () => {
      if (!current(mark)) return;
      const moved = pending.some(changesMapPositions);
      const steps = [...(moved ? ['本機檢查：道路端點、據點占格、重疊與路網連通'] : []),
        gameId ? `伺服器核驗 ${pending.length} 條地圖修改（命令格式、素材與物件引用${moved ? '、修改後的位置與連通性' : ''}），通過才寫入遊戲地圖` : `伺服器核驗 ${pending.length} 條地圖修改：物件位置、路網連通、模板及受保護資源，通過才寫入基礎地圖`,
        '重新讀取已保存的地圖'];
      let index = 0, committed = false, submitted = false;
      const report = (state, summary) => { saveReport = { steps, index, state, summary }; render(); };
      const local = { feedback: 'local' };
      serverProblems = [];
      try {
        report('running', '正在檢查地圖');
        if (moved) {
          // Give the checklist a paint opportunity before synchronous map validation.
          if (typeof requestAnimationFrame === 'function') await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
          if (!current(mark)) return;
          assertMapPositions(candidate); index++;
        }
        report('running', '等待伺服器核驗及寫入');
        submitted = true;
        await api(gameId ? path : path + '/save', gameId ? { module: 'map', patch: { edits: pending } } : { edits: pending }, local);
        if (!current(mark)) return;
        committed = true;
        index++; report('running', '正在重新讀取地圖');
        await read(mark, local);
        if (current(mark)) {
          message = gameId ? '已保存並重新讀取遊戲地圖。' : '已保存並重新讀取基礎地圖。';
          index++; report('success', '保存成功');
        }
      } catch (error) {
        if (current(mark)) {
          // A known validation rejection retains editable inputs. Unknown writes
          // or a failed read after success must not replay non-idempotent edits.
          uncertain = committed || submitted && error.status !== 422;
          serverProblems = Array.isArray(error.detail?.problems) ? error.detail.problems.filter(problem => typeof problem?.message === 'string').slice(0, 128).map(problem => ({ message: problem.message.slice(0, 512) })) : [];
          const summary = committed ? '已寫入，重新讀取失敗' : uncertain ? '未能確認寫入結果' : '檢查未通過，未保存';
          message = committed ? '保存已成功，但重新讀取失敗；請重新讀取後再編輯。' : error.message;
          if (!serverProblems.length) serverProblems = [{ message: error.message }];
          report(uncertain && !committed ? 'unknown' : 'failed', summary);
        }
      }
    }, { feedback: 'local', ownStatus: true });
  }
  function setIdentity(next) {
    if (next === identity && next?.user.id === actorId && (next?.version ?? null) === actorVersion && permitted()) return;
    pendingForm = false; readRevision++; saveReport = null;
    identity = next; actorId = next?.user.id ?? null; actorVersion = next?.version ?? null; generation++;
    snapshot = null; candidate = null; edits = []; undoSizes = []; loaded = false; uncertain = false; message = ''; serverProblems = [];
    paint(null); render();
  }
  return Object.freeze({ actions: Object.freeze({ reload, initialize, stage, undo, save, formDirty: value => { pendingForm = Boolean(value); }, enter: () => loaded ? undefined : reload() }), setIdentity, render,
    dirty: () => edits.length > 0 || uncertain || pendingForm,
    canLeave: (forUnload = false) => !(edits.length || uncertain || pendingForm) || !forUnload && confirm('地圖有未保存修改或未確認結果，仍要離開？'),
    dispose() { generation++; snapshot = null; candidate = null; edits = []; undoSizes = []; paint(null); },
  });
}
