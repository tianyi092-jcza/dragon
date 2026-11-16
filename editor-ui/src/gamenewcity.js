// Game-scoped new-city workbench: archive create -> stamp (via map canvas)
// -> bind -> admit -> road-add. Direct single-shot module writes; the map
// workbench keeps its own staging/preview for geometry. No source objects
// enter the Vue model.
export function createNewCityController({ api, work, publish, gameContext }) {
  let identity = null, identityVersion = null, selected = null, entered = false;
  let loaded = false, locked = true, message = '';
  let cities = [], placements = [], chapterOrder = [];
  const permitted = () => Boolean(identity && !identity.user.mustChangePassword && ['admin', 'author'].includes(identity.user.role));
  function render() {
    const placed = new Set(placements.filter(p => p?.cityId).map(p => p.cityId));
    const boundIds = new Set(placements.filter(p => p?.cityId).map(p => p.cityId));
    publish({ gameScoped: true, gameId: selected, loaded, locked: locked || !selected, message,
      cities: cities.map(c => ({ cityId: c.cityId, name: c.name ?? c.cityId, placed: placed.has(c.cityId) })),
      unboundPieces: placements.filter(p => p && p.cityId == null).map(p => ({ id: p.id, x: p.x, y: p.y })),
      boundIds: [...boundIds], chapters: chapterOrder.length });
  }
  async function read(mark) {
    const value = await api('/api/games/' + encodeURIComponent(selected) + '/copy');
    void mark;
    const data = value?.data;
    cities = Object.values(data?.cities ?? {});
    placements = data?.map?.placements ?? [];
    chapterOrder = data?.chapterOrder ?? [];
    loaded = true; message = '已讀取遊戲據點資料。';
  }
  async function refresh() {
    if (!selected || !permitted()) return;
    const mark = {};
    return work(async () => {
      try { await read(mark); }
      catch (error) { message = error.message ?? String(error); }
      render();
    });
  }
  async function write(module, patch, done) {
    if (!selected || !permitted()) return;
    return work(async () => {
      try {
        await api('/api/games/' + encodeURIComponent(selected) + '/copy', { module, patch });
        await read({});
        message = done;
      } catch (error) { message = error.message ?? String(error); }
      render();
    });
  }
  const actions = {
    enter: () => { if (entered || !selected) return; entered = true; return refresh(); },
    refresh,
    createCity: form => {
      const numbers = {};
      for (const key of ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view']) {
        const value = Number(form?.numbers?.[key]);
        if (!Number.isSafeInteger(value) || value < 0 || value > 65535) throw new Error(`數值欄 ${key} 須為 0..65535 整數`);
        numbers[key] = value;
      }
      const name = String(form?.name ?? '').trim();
      if (!name) throw new Error('據點名稱必填');
      return write('cities', { create: { name, numbers } }, '建檔完成。下一步：在地圖選位並放置圖塊。');
    },
    bindCity: form => {
      if (!form?.pieceId || !form?.cityId) throw new Error('圖塊與據點檔案必選');
      return write('map', { edits: [{ op: 'city-bind', pieceId: form.pieceId, cityId: form.cityId }] }, '綁定完成。下一步：接見 admit 全章。');
    },
    admitCity: form => {
      if (!form?.cityId) throw new Error('據點檔案必選');
      const troops_cap = Number(form?.troops_cap);
      if (!Number.isSafeInteger(troops_cap) || troops_cap < 0 || troops_cap > 255) throw new Error('城兵上限須為 0..255 整數');
      if (!/^ki-1995:siege:(\d{1,3})$/.test(form?.battleMapId ?? '') || Number(form.battleMapId.slice(15)) > 191) throw new Error('攻城戰場須為 ki-1995:siege:0..191');
      return write('chapters', { admit: { cityId: form.cityId, troops_cap, battleMapId: form.battleMapId } }, '全章接見完成。下一步：鋪走廊並加路。');
    },
    addRoad: form => {
      if (!form?.fromCityId || !form?.toCityId || form.fromCityId === form.toCityId) throw new Error('起訖據點必選且須不同');
      if (form?.travelKind !== 'land' && form?.travelKind !== 'water') throw new Error('行旅種類須為 land／water');
      const geometry = String(form?.geometry ?? '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
        const match = /^(\d{1,3}),(\d{1,3})$/.exec(part);
        if (!match) throw new Error(`路徑格格式須為 x,y，以分號分隔：${part}`);
        return { x: Number(match[1]), y: Number(match[2]) };
      });
      if (geometry.length < 2) throw new Error('路徑至少兩格');
      return write('map', { edits: [{ op: 'road-add',
        roadId: `${selected}#road-` + [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join(''),
        fromCityId: form.fromCityId, toCityId: form.toCityId, travelKind: form.travelKind, geometry }] }, '道路寫入完成。請檢驗後發布。');
    },
  };
  function adoptGame(gameId) {
    if (gameId === selected) return;
    selected = gameId; entered = false; loaded = false; cities = []; placements = []; chapterOrder = []; message = gameId ? '' : '請先在頂部選擇自己的遊戲。';
    locked = !permitted() || !gameId; render();
  }
  return Object.freeze({ actions: Object.freeze(actions), adoptGame,
    selectedGame: () => permitted() ? selected : null,
    canAdoptGame: () => permitted(),
    canLeave: () => true,
    dirty: () => false,
    render,
    setIdentity(next) {
      if (identity === next && identityVersion === (next?.version ?? null)) { return; }
      identity = next; identityVersion = next?.version ?? null;
      adoptGame(permitted() && gameContext ? gameContext.current() : null);
      locked = !permitted() || !selected; render();
    },
    dispose() { selected = null; entered = false; },
  });
}
