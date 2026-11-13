// Framework-free controller. Source/template bodies never enter the Vue model.
// preview and paint are native editor-core ports, not reactive view callbacks.
import { previewMapEdits } from '../../web/src/editor/mapcommands.js';

export { createMapController as createBaseMapController };
export function createMapController({ api, work, publish, preview = previewMapEdits, paint, confirm, gameId = null }) {
  const path = gameId ? '/api/games/' + encodeURIComponent(gameId) + '/copy' : '/api/admin/base-map';
  let identity = null, actorId = null, actorVersion = null, generation = 0;
  let pendingForm = false, readRevision = 0;
  let snapshot = null, candidate = null, edits = [], loaded = false, uncertain = false, message = '', serverProblems = [];
  const permitted = () => Boolean(identity && !identity.user.mustChangePassword && (gameId ? ['admin', 'author'].includes(identity.user.role) : identity.user.role === 'admin'));
  const current = mark => mark === generation && permitted() && identity.user.id === actorId && (identity.version ?? null) === actorVersion;
  const render = () => publish({ loaded, exists: Boolean(snapshot), version: snapshot?.version ?? 0,
    dirty: edits.length > 0, editCount: edits.length, locked: !permitted() || uncertain || !snapshot,
    uncertain, message, serverProblems, readRevision, gameId, gameScoped: Boolean(gameId) });
  function install(value) {
    if (gameId && (value.gameId !== gameId || value.data?.gameId !== gameId || !/^[a-f0-9]{64}$/.test(value.copyDigest) || !value.data.map)) throw new Error('遊戲地圖回應無效');
    let next = null;
    if (gameId) next = { content: { ...value.data, editorAssets: value.data.mapEditorAssets }, digest: value.copyDigest, version: value.copyDigest.slice(0, 12) };
    else if (value.snapshot !== null) next = { ...value.snapshot, content: value.snapshot?.template?.content };
    if (!gameId && next !== null && (!Number.isSafeInteger(next?.version) || next.version < 1 || !/^[a-f0-9]{64}$/.test(next.digest) || !next.content?.map)) throw new Error('基礎地圖回應無效');
    pendingForm = false; readRevision++;
    snapshot = next; candidate = next?.content ?? null; edits = []; loaded = true; uncertain = false; serverProblems = [];
    paint(candidate); render();
  }
  async function read(mark) {
    const value = await api(path);
    if (!current(mark)) return;
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
    const pending = [...edits, structuredClone(edit)];
    if (pending.length > 128 || new TextEncoder().encode(JSON.stringify(gameId ? { module: 'map', patch: { edits: pending } } : { edits: pending })).length > 16384) throw new Error('本次修改已達保存上限，請先保存。');
    const next = preview(snapshot.content, pending);
    candidate = next; edits = pending; serverProblems = []; message = '有尚未保存的修改。'; paint(candidate); render();
    return true;
  }
  function undo() {
    if (!permitted() || uncertain || !edits.length) return;
    const pending = edits.slice(0, -1), next = preview(snapshot.content, pending);
    candidate = next; edits = pending; serverProblems = []; paint(candidate); render();
  }
  async function save() {
    if (!permitted() || uncertain || !edits.length) return;
    const mark = generation, pending = structuredClone(edits);
    return work(async () => {
      if (!current(mark)) return;
      let committed = false;
      try {
        await api(gameId ? path : path + '/save', gameId ? { module: 'map', patch: { edits: pending } } : { edits: pending });
        if (!current(mark)) return;
        committed = true;
        await read(mark);
        if (current(mark)) message = gameId ? '已保存並重新讀取遊戲地圖。' : '已保存並重新讀取基礎地圖。';
      } catch (error) {
        if (current(mark)) {
          // A known validation rejection retains editable inputs. Unknown writes
          // or a failed read after success must not replay non-idempotent edits.
          uncertain = committed || error.status !== 422;
          serverProblems = Array.isArray(error.detail?.problems) ? error.detail.problems.filter(problem => typeof problem?.message === 'string').slice(0, 128).map(problem => ({ message: problem.message.slice(0, 512) })) : [];
          message = committed ? '保存已成功，但重新讀取失敗；請重新讀取後再編輯。' : error.message;
        }
      }
      if (current(mark)) render();
    });
  }
  function setIdentity(next) {
    if (next === identity && next?.user.id === actorId && (next?.version ?? null) === actorVersion && permitted()) return;
    pendingForm = false; readRevision++;
    identity = next; actorId = next?.user.id ?? null; actorVersion = next?.version ?? null; generation++;
    snapshot = null; candidate = null; edits = []; loaded = false; uncertain = false; message = ''; serverProblems = [];
    paint(null); render();
  }
  return Object.freeze({ actions: Object.freeze({ reload, initialize, stage, undo, save, formDirty: value => { pendingForm = Boolean(value); }, enter: () => loaded ? undefined : reload() }), setIdentity, render,
    dirty: () => edits.length > 0 || uncertain || pendingForm,
    canLeave: (forUnload = false) => !(edits.length || uncertain || pendingForm) || !forUnload && confirm('地圖有未保存修改或未確認結果，仍要離開？'),
    dispose() { generation++; snapshot = null; candidate = null; edits = []; paint(null); },
  });
}
