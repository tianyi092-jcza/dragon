// Framework-free controller. Source/template bodies never enter the Vue model.
// preview and paint are native editor-core ports, not reactive view callbacks.
import { previewMapEdits } from '../../web/src/editor/mapcommands.js';
import { parseMapSides } from '../../web/src/content/authoring/mapextent.js';
import { changesMapPositions } from '../../web/src/editor/mapobjectmove.js';
import { assertMapPositions } from '../../web/src/editor/mappositionvalidation.js';
import { MAP_EDIT_MAX_COMMANDS, MAP_EDIT_MAX_BYTES } from '../../web/src/editor/mapeditlimits.js';

// Visual road-chain diagnostics also apply to tile edits; they are not new
// save gates. Recompute after a gesture, never on individual pointer moves.
const needsOverlay = edit => changesMapPositions(edit) || /^(city-|road-|decoration-)/.test(edit.op);
export { createMapController as createBaseMapController };
export function createMapController({ api, work, publish, preview = previewMapEdits, paint, confirm, gameId = null }) {
  const path = gameId ? '/api/games/' + encodeURIComponent(gameId) + '/copy' : '/api/admin/base-map';
  let identity = null, actorId = null, actorVersion = null, generation = 0;
  let pendingForm = false, readRevision = 0, saveReport = null;
  let snapshot = null, candidate = null, edits = [], undoSizes = [], loaded = false, uncertain = false, message = '', serverProblems = [];
  const encoder = new TextEncoder();
  const emptyBodyBytes = encoder.encode(JSON.stringify(gameId ? { module: 'map', patch: { edits: [] } } : { edits: [] })).length;
  let bodyBytes = emptyBodyBytes;
  const permitted = () => Boolean(identity && !identity.user.mustChangePassword && (gameId ? ['admin', 'author'].includes(identity.user.role) : identity.user.role === 'admin'));
  const current = mark => mark === generation && permitted() && identity.user.id === actorId && (identity.version ?? null) === actorVersion;
  const extentSides = () => {
    try { return candidate?.map?.bounds ? parseMapSides(candidate.map.bounds) : null; }
    catch { return null; }
  };
  const render = () => publish({ loaded, exists: Boolean(snapshot), version: snapshot?.version ?? 0,
    dirty: edits.length > 0, canUndo: undoSizes.length > 0, editCount: edits.length, locked: !permitted() || uncertain || !snapshot,
    uncertain, message, serverProblems, saveReport, readRevision, gameId, gameScoped: Boolean(gameId),
    extentSides: extentSides(),
    seaGroundPending: edits.some(edit => edit.op === 'sea-ground-enable'),
    seaGroundEnabled: candidate?.map.format === 'cell-map-1' || candidate?.map.base?.policy === 'sea-ground-1' });
  function install(value) {
    if (gameId && (value.gameId !== gameId || value.data?.gameId !== gameId || !/^[a-f0-9]{64}$/.test(value.copyDigest) || !value.data.map)) throw new Error('遊戲地圖回應無效');
    let next = null;
    if (gameId) next = { content: { ...value.data, editorAssets: value.data.mapEditorAssets }, digest: value.copyDigest, version: value.copyDigest.slice(0, 12) };
    else if (value.snapshot !== null) next = { ...value.snapshot, content: value.snapshot?.template?.content };
    if (!gameId && next !== null && (!Number.isSafeInteger(next?.version) || next.version < 1 || !/^[a-f0-9]{64}$/.test(next.digest) || !next.content?.map)) throw new Error('基礎地圖回應無效');
    // Stage the visible product transition, never write on GET. Save/undo/leave
    // use the same command history as ordinary edits; old formal content is unchanged.
    const pending = next && next.content.map.format !== 'cell-map-1' && next.content.map.base.policy === undefined ? [{ op: 'sea-ground-enable' }] : [];
    if (next && !gameId) next.content = { ...next.content, gameId: 'system-base-map' };
    const prepared = next ? preview(next.content, pending) : null;
    pendingForm = false; readRevision++;
    snapshot = next; candidate = prepared; edits = pending; undoSizes = pending.length ? [1] : []; loaded = true; uncertain = false; serverProblems = [];
    bodyBytes = emptyBodyBytes + encoder.encode(JSON.stringify(pending)).length - 2;
    paint(candidate, false); render();
  }
  async function read(mark, options, timings) {
    const started = performance.now();
    const value = await api(path, undefined, options);
    const received = performance.now();
    if (timings) timings.reloadRequestMs = Math.round(received - started);
    if (!current(mark)) return;
    if (!options) saveReport = null;
    install(value);
    if (timings) timings.installMs = Math.round(performance.now() - received);
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
    // The automatic legacy sea-ground preview is not part of the persisted map. Convert the
    // actual snapshot, otherwise merely switching format can change rule/minimap geography.
    const conversion = batch.length === 1 && batch[0].op === 'cell-convert';
    if (conversion && edits.some(e => e.op !== 'sea-ground-enable')) throw new Error('請先保存或撤銷修改再轉換。');
    const previous = conversion ? [] : edits, pending = [...previous, ...batch];
    const nextBytes = (conversion ? emptyBodyBytes : bodyBytes) + encoder.encode(JSON.stringify(batch)).length - 2 + (previous.length ? 1 : 0);
    if (pending.length > MAP_EDIT_MAX_COMMANDS || nextBytes > MAP_EDIT_MAX_BYTES)
      throw new Error('本次修改超過保存上限（4096條命令／16 MiB）。已有修改可先保存；若單次操作仍超限，請縮小選取範圍。');
    // In a stamp-only history, reconciliation just filters removed decoration IDs.
    // Filtering after each gesture gives the same groups as filtering once at the end.
    // Object moves can read group membership: keep full replay for mixed remove/move
    // histories and for structural commands such as split or regroup.
    const hasRemoval = pending.some(({ op }) => op === 'decoration-remove');
    const incremental = pending.every(({ op }) => ['cell-paint', 'decoration-place', 'decoration-remove', 'decoration-translate', 'sea-ground-enable'].includes(op)
      || (!hasRemoval && op === 'map-object-translate'));
    const next = incremental ? preview(candidate, batch) : preview(snapshot.content, pending);
    saveReport = null;
    bodyBytes = nextBytes;
    candidate = next; edits = pending; undoSizes = gameId && !conversion ? [...undoSizes, batch.length] : [batch.length]; serverProblems = []; message = '有尚未保存的修改。'; paint(candidate, pending.some(needsOverlay), incremental && batch.every(({ op }) => op === 'cell-paint' || op === 'decoration-place' || op === 'decoration-remove')); render();
    return true;
  }
  function undo() {
    if (!permitted() || uncertain || !undoSizes.length) return;
    const removed = edits.slice(-undoSizes.at(-1));
    const pending = edits.slice(0, -removed.length), next = preview(snapshot.content, pending);
    bodyBytes -= encoder.encode(JSON.stringify(removed)).length - 2 + (pending.length ? 1 : 0);
    saveReport = null;
    candidate = next; edits = pending; undoSizes = undoSizes.slice(0, -1); serverProblems = [];
    message = pending.length ? '已撤銷上一步；仍有未保存修改。' : '已撤銷全部未保存修改。';
    paint(candidate, pending.some(needsOverlay)); render();
  }
  function convert() {
    if (!permitted() || uncertain || !candidate || candidate.map.format === 'cell-map-1' || edits.some(e => e.op !== 'sea-ground-enable')) return;
    if (confirm('轉為單格地圖會打散組合，只保留每格最上層的素材。不會更改其他地圖或已上架版本。現在只預覽，按「保存」才寫入；保存前可撤銷。確定預覽轉換？')) return work(() => stage({ op: 'cell-convert' }));
  }
  async function save() {
    if (!permitted() || uncertain || !edits.length) return;
    const mark = generation, pending = structuredClone(edits);
    return work(async () => {
      if (!current(mark)) return;
      const started = performance.now(), timings = gameId ? null : { commands: pending.length };
      let sent;
      const moved = pending.some(changesMapPositions);
      const steps = [...(moved ? ['本機檢查：道路端點、據點占格、重疊與路網連通'] : []),
        gameId ? `伺服器核驗 ${pending.length} 條地圖修改（命令格式、素材與物件引用${moved ? '、修改後的位置與連通性' : ''}），通過才寫入遊戲地圖` : `伺服器套用 ${pending.length} 條修改；普通裝飾直接保存，涉及道路或據點才檢查路網，擴縮或舊模板完整檢查`,
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
        sent = performance.now();
        if (timings) timings.localMs = Math.round(sent - started);
        const result = await api(gameId ? path : path + '/save', gameId ? { module: 'map', patch: { edits: pending } } : { edits: pending }, local);
        if (timings) Object.assign(timings, { postMs: Math.round(performance.now() - sent), server: result?.metrics });
        if (!current(mark)) return;
        committed = true;
        index++; report('running', '正在重新讀取地圖');
        await read(mark, local, timings);
        if (current(mark)) {
          message = gameId ? '已保存並重新讀取遊戲地圖。' : '已保存並重新讀取基礎地圖。';
          index++; report('success', '保存成功');
        }
      } catch (error) {
        if (current(mark)) {
          // A known validation rejection retains editable inputs. Unknown writes
          // or a failed read after success must not replay non-idempotent edits.
          const oversized = !gameId && error.status === 413 && error.code === 'BASE_MAP_TOO_LARGE';
          uncertain = committed || submitted && error.status !== 422 && !oversized;
          if (timings) {
            if (sent !== undefined && timings.postMs === undefined) timings.postMs = Math.round(performance.now() - sent);
            Object.assign(timings, { error: error.code ?? 'REQUEST_FAILED', ...(error.detail?.metrics && { server: error.detail.metrics }) });
          }
          serverProblems = Array.isArray(error.detail?.problems) ? error.detail.problems.filter(problem => typeof problem?.message === 'string').slice(0, 128).map(problem => ({ message: problem.message.slice(0, 512) })) : [];
          const summary = committed ? '已寫入，重新讀取失敗' : uncertain ? '未能確認寫入結果' : '檢查未通過，未保存';
          message = committed ? '保存已成功，但重新讀取失敗；請重新讀取後再編輯。' : error.message;
          if (oversized && Number.isSafeInteger(error.detail?.excessBytes)) message = `模板共 ${error.detail.bytes} bytes，超過上限 ${error.detail.excessBytes} bytes；未寫入，可撤銷或調整。`;
          if (!uncertain && error.status === 422) paint(candidate, true);
          if (!serverProblems.length) serverProblems = [{ message: committed ? message : uncertain ? '請先重新讀取地圖，確認上一次修改是否已保存，再繼續編輯。' : oversized ? message : error.code ?? error.message }];
          if (!uncertain && !oversized) {
            serverProblems = serverProblems.map(({message: reason}) => {
              const unbound = candidate.map.placements?.find(p=>!p.cityId);
              const coords = reason.match(/(?:cell |\()(-?\d+),\s*(-?\d+)/)?.slice(1).join(', ');
              const network = reason.match(/^(isolated city without road|map road network disconnected: isolated segment): (.+)$/);
              if (network) {
                const towns=network[2].split('、').map(id=>candidate.cities?.[id]?.name ?? id).join('、');
                return {message:`${towns} 沒有${network[1].startsWith('isolated city')?'連到其他據點':'連到主路網'}。請檢查相鄰道路是否被清除，或撤銷上一步。`};
              }
              if (/unbound city|城市未綁定/i.test(reason) || (unbound && /^placements\[\d+\]\.cityId invalid$/.test(reason))) return {message:`據點中心${unbound?`（${unbound.x}, ${unbound.y}）`:''}尚未綁定。請右鍵中心選擇據點並按「綁定」，或清除不需要的中心。`};
              if (/UNKNOWN_UNDERLAY/.test(reason)) return {message:`格子（${coords ?? '位置未提供'}）缺少底圖，請補上底圖後再保存。`};
              if (/road|headless|路網/i.test(reason) && !/[\u3400-\u9fff]/u.test(reason)) return {message:`道路${coords?`（${coords}）`:''}未能接通兩個據點。請檢查兩端城門、方向及中間是否缺格。`};
              if (/out of bounds/i.test(reason)) return {message:`格子${coords?`（${coords}）`:''}超出地圖，請移回邊界內。`};
              if (/city|placement/i.test(reason) && !/[\u3400-\u9fff]/u.test(reason)) return {message:`據點資料與地圖不一致。請檢查${coords?`（${coords}）的`:''}中心格與綁定是否正確。`};
              return {message:/[\u3400-\u9fff]/u.test(reason)?reason:'地圖修改未通過檢查。可撤銷最後一步再保存；若仍失敗，請回報操作位置與步驟。'};
            });
            message=serverProblems[0].message;
          }
          report(uncertain && !committed ? 'unknown' : 'failed', summary);
        }
      } finally {
        if (timings && current(mark)) console.info('[base-map-save]', JSON.stringify({ ...timings, committed: committed || (uncertain ? null : false), totalMs: Math.round(performance.now() - started) }));
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
  return Object.freeze({ actions: Object.freeze({ reload, initialize, stage, undo, save, convert, dismissSaveReport() {
    if (!saveReport || saveReport.state === 'running') return;
    saveReport = null; serverProblems = []; message = ''; render();
  }, formDirty: value => { pendingForm = Boolean(value); }, enter: () => loaded ? undefined : reload() }), setIdentity, render,
    dirty: () => edits.length > 0 || uncertain || pendingForm,
    canLeave: (forUnload = false) => !(edits.length || uncertain || pendingForm) || !forUnload && confirm('地圖有未保存修改或未確認結果，仍要離開？'),
    dispose() { generation++; snapshot = null; candidate = null; edits = []; undoSizes = []; paint(null); },
  });
}
