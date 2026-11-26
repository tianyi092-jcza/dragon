// 系統基礎據點工作台：讀寫 system_base_map.content.cities（管理員專用）。
// 與遊戲級 StrongholdPanel 同列同編輯；座標／runtimeSlot 只讀（歸基礎地圖）。
export function createBaseStrongholdWorkbench({ api, work, publish, confirm, isBusy }) {
  let actor = null, generation = 0, editing = false;
  const model = { loaded: false, version: 0, digest: '', updatedAt: '', cities: [], blessed: null, locked: true, message: '' };
  const permitted = () => Boolean(actor) && actor.user.role === 'admin' && !actor.user.mustChangePassword;
  const ticket = () => ({ actor, generation });
  const valid = t => permitted() && t.actor === actor && t.generation === generation;
  function render() {
    publish({ loaded: model.loaded, version: model.version, digest: model.digest, updatedAt: model.updatedAt,
      cities: model.cities.map(row => ({ ...row })), blessed: model.blessed ? { ...model.blessed } : null,
      locked: !permitted() || isBusy(), message: model.message });
  }
  function setIdentity(next) {
    if (next?.user.id !== actor?.user.id) {
      actor = next; generation++; editing = false;
      Object.assign(model, { loaded: false, version: 0, digest: '', updatedAt: '', cities: [], blessed: null, message: '' });
    } else { actor = next; }
    render();
  }
  function canLeave(forUnload = false) {
    if (!editing) return true;
    if (forUnload) return false;
    return confirm('基礎據點有未保存的編輯；此操作不會自動保存這些輸入。確定繼續？');
  }
  function setEditing(value) { editing = Boolean(value); }
  function applySnapshot(snapshot, blessed) {
    if (!snapshot) {
      Object.assign(model, { loaded: false, version: 0, digest: '', updatedAt: '', cities: [], blessed: blessed ?? null, message: '尚未初始化系統基礎地圖。' });
      return;
    }
    const rows = Object.values(snapshot.cities ?? {}).map(row => ({ ...row }))
      .sort((a, b) => (a.runtimeSlot ?? 0) - (b.runtimeSlot ?? 0));
    Object.assign(model, { loaded: true, version: snapshot.version, digest: snapshot.digest,
      updatedAt: snapshot.updatedAt ?? '', cities: rows, blessed: blessed ?? null, message: '' });
  }
  async function load() {
    if (isBusy() || !permitted()) { render(); return; }
    const t = ticket(); editing = false;
    return work(async () => {
      const data = await api('/api/admin/base-cities');
      if (!valid(t)) return;
      applySnapshot(data.snapshot, data.blessed);
      render();
      return model.loaded ? `已載入系統基礎據點 ${model.cities.length} 座。` : model.message;
    });
  }
  async function reload() { return load(); }
  async function saveCity(cityId, patch) {
    if (isBusy() || !permitted() || !model.loaded) throw new Error('請先載入系統基礎據點。');
    const row = model.cities.find(item => item.cityId === cityId);
    if (!row) throw new Error('請選擇已讀取的據點身份。');
    if (!patch || typeof patch !== 'object') throw new Error('據點修改格式無效。');
    const body = {};
    if (patch.name !== undefined && patch.name !== row.name) {
      const name = String(patch.name ?? '').normalize('NFC').trim();
      if ([...name].length < 1 || [...name].length > 12) throw new Error('據點名稱須為 1–12 個字。');
      if (model.cities.some(item => item.cityId !== cityId && item.name === name)) throw new Error('據點名稱「' + name + '」已被其他據點使用。');
      body.rename = { [cityId]: name };
    }
    const values = {};
    for (const key of ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view']) {
      if (patch[key] === undefined) continue;
      const raw = String(patch[key] ?? '').trim();
      if (key === 'view' && patch.view === null) { values.view = null; continue; }
      if (!/^[0-9]{1,5}$/.test(raw || '0') || Number(raw) > 65535) throw new Error(key + ' 必須是 0–65535 的整數。');
      if (Number(raw) !== row[key]) values[key] = Number(raw);
    }
    if (Object.keys(values).length) body.numbers = { [cityId]: values };
    if (patch.region !== undefined && patch.region !== (row.region ?? '')) {
      const region = String(patch.region ?? '').normalize('NFC').trim();
      if ([...region].length > 8) throw new Error('所屬州郡最多 8 個字。');
      body.region = { [cityId]: region };
    }
    if (patch.battleMapId !== undefined && patch.battleMapId !== (row.battleMapId ?? null)) {
      const siege = String(patch.battleMapId ?? '');
      if (!/^ki-1995:siege:(\d{1,3})$/.test(siege) || Number(/^ki-1995:siege:(\d{1,3})$/.exec(siege)[1]) > 191) throw new Error('攻城戰場須為 ki-1995:siege:0..191');
      body.battlefield = { [cityId]: siege };
    }
    if (patch.troops_cap !== undefined && patch.troops_cap !== (row.troops_cap ?? null)) {
      const raw = String(patch.troops_cap ?? '').trim();
      if (!/^[0-9]{1,3}$/.test(raw) || Number(raw) > 255) throw new Error('城兵上限必須是 0–255 的整數。');
      body.troopcap = { [cityId]: Number(raw) };
    }
    if (!Object.keys(body).length) return '據點沒有變更。';
    const t = ticket();
    return work(async () => {
      const data = await api('/api/admin/base-cities', { cities: body });
      if (!valid(t)) return;
      applySnapshot({ version: data.snapshot.version, digest: data.snapshot.digest, cities: data.snapshot.cities ?? data.snapshot.template?.content?.cities, updatedAt: data.snapshot.updatedAt }, model.blessed);
      editing = false;
      render();
      return '已保存系統基礎據點並重讀。';
    });
  }
  async function createCity(create) {
    if (isBusy() || !permitted() || !model.loaded) throw new Error('請先載入系統基礎據點。');
    const t = ticket();
    return work(async () => {
      await api('/api/admin/base-cities', { cities: { create } });
      if (!valid(t)) return;
      const data = await api('/api/admin/base-cities');
      if (!valid(t)) return;
      applySnapshot(data.snapshot, data.blessed);
      editing = false;
      render();
      return '已新增基礎據點並重讀。';
    }, { feedback: 'local', ownStatus: true });
  }
  async function promote(gameId, gameName) {
    if (isBusy() || !permitted() || !gameId) throw new Error('請先選擇要作為來源的遊戲。');
    if (!await confirm(`確定將遊戲「${gameName || gameId}」的全部城池據點覆蓋為系統基礎據點嗎？這會取代現有 ${model.cities.length} 座系統定義。`)) return false;
    const t = ticket();
    return work(async () => {
      const data = await api('/api/admin/base-cities/promote', { gameId });
      if (!valid(t)) return false;
      const snapshot = data.snapshot;
      const cities = snapshot.cities ?? snapshot.template?.content?.cities ?? {};
      const rows = Object.values(cities).map(row => ({ ...row })).sort((a, b) => (a.runtimeSlot ?? 0) - (b.runtimeSlot ?? 0));
      Object.assign(model, { loaded: true, version: snapshot.version, digest: snapshot.digest, updatedAt: snapshot.updatedAt ?? '', cities: rows, blessed: data.blessed ?? null, message: '' });
      editing = false;
      render();
      return `已從遊戲匯入 ${rows.length} 座據點為系統基礎。`;
    });
  }
  render();
  return Object.freeze({ setIdentity, canLeave, setEditing, render,
    actions: Object.freeze({ enter: () => load(), load, reload, saveCity, createCity, promote, setEditing }) });
}
