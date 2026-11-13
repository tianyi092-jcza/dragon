import { createMapWorkbench } from './basemapworkbench.js';

// Game selection carries only an ID. Each selected game owns its private edit
// session; switching (after the shared context's leave check) disposes the old
// session before creating another. No source objects enter the Vue model.
export function createGameMapWorkbench({ api, work, publish, confirm, gameContext, createWorkbench = createMapWorkbench }) {
  let identity = null, identityVersion = null, selected = null, session = null, entered = false;
  let canvas = null, minimap = null;
  const permitted = () => Boolean(identity && !identity.user.mustChangePassword && ['admin', 'author'].includes(identity.user.role));
  function adoptGame(gameId) {
    if (gameId === selected && session) return;
    session?.dispose(); session = null; selected = gameId; entered = false;
    publish({ gameScoped: true, gameId, loaded: false, exists: false, version: '', locked: true, dirty: false,
      readRevision: 0, selected: null, layers: [], materials: [], waters: [], groups: [], diagnostics: [],
      serverProblems: [], message: gameId ? '' : '請先在頂部選擇自己的遊戲。' });
    if (!gameId || !permitted()) return;
    session = createWorkbench({ api, work, publish, confirm, gameId });
    session.setIdentity(identity);
    session.actions.attach(canvas, minimap);
  }
  const actions = Object.fromEntries(['reload', 'initialize', 'stage', 'undo', 'save', 'formDirty', 'resize', 'pick', 'pan', 'zoom', 'fit', 'locate', 'focusDiagnostic', 'selectGroup', 'layer', 'previewMaterial', 'season', 'retryAtlas', 'command'].map(name => [name, (...args) => session?.actions[name](...args)]));
  actions.attach = (nextCanvas, nextMinimap) => {
    canvas = nextCanvas; minimap = nextMinimap; session?.actions.attach(canvas, minimap);
  };
  actions.enter = () => {
    if (entered || !session) return;
    entered = true; return session.actions.enter();
  };
  return Object.freeze({ actions: Object.freeze(actions), adoptGame,
    canAdoptGame: () => permitted(), selectedGame: () => permitted() ? selected : null,
    canLeave: forUnload => session?.canLeave(forUnload) ?? true,
    dirty: () => session?.dirty() ?? false,
    render: () => session?.render(),
    setIdentity(next) {
      if (identity === next && identityVersion === (next?.version ?? null)) { session?.setIdentity(next); return; }
      session?.dispose(); session = null; selected = null;
      identity = next; identityVersion = next?.version ?? null;
      adoptGame(permitted() ? gameContext.current() : null);
      session?.setIdentity(next);
    },
    dispose() { session?.dispose(); session = null; canvas = null; minimap = null; },
  });
}
