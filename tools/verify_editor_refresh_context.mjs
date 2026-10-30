// Controller context checks only; no backend authorization or game-rule claim.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const cases = [['stronghold', 'installStronghold', 'selectGame'], ['general', 'installGenerals', 'selectGame'], ['mapview', 'installMapViewer', 'select']];
for (const [file, exportName, select] of cases) {
  const module = await import('data:text/javascript;base64,' + Buffer.from(await readFile(`server/public/${file}.txt`)).toString('base64'));
  test(`${file}: refresh retains selected game/chapter, falling back only when absent`, async () => {
    let identity = { user: { id: 'owner', mustChangePassword: false } }, model, busy = false;
    let rows = ['a', 'b'].map(gameId => ({ gameId, draftRevision: '1', metadata: { name: gameId } }));
    let chapterCount = 2;
    const calls = [];
    const ui = module[exportName]({ authority: () => identity, isBusy: () => busy, publish: value => { model = value; },
      work: async fn => { busy = true; try { return await fn(); } finally { busy = false; ui.render(); } },
      api: async path => {
        calls.push(path);
        if (path === '/api/games') return { games: structuredClone(rows) };
        const url = new URL(path, 'https://owned.invalid'), gameId = url.pathname.split('/')[3];
        if (url.pathname.endsWith('/topology')) return { gameId, moves: [], rebuilds: [], blocked: false };
        const game = rows.find(row => row.gameId === gameId);
        assert.ok(game); assert.equal(url.searchParams.get('revision'), game.draftRevision);
        return { ...game, map: { roads: [] }, strongholds: [], chapters: Array.from({ length: chapterCount }, (_, i) => ({ chapterId: `${gameId}-${i}`, name: `${gameId}-${i}`, cities: [], generals: [], factions: [] })) };
      },
    });
    ui.setIdentity(identity); await ui.actions.refresh();
    ui.actions[select]('b'); await ui.actions.inspect();
    if (ui.actions.selectChapter) ui.actions.selectChapter('b-1');
    const start = calls.length;
    rows[1].draftRevision = '2'; await ui.actions.refresh();
    assert.equal(model.selected, 'b'); assert.match(model.context, /b.*2/);
    assert.ok(calls.slice(start).some(path => path === '/api/games/b/draft?revision=2'));
    assert.ok(!calls.slice(start).some(path => path.startsWith('/api/games/a/')));
    if (ui.actions.selectChapter) assert.equal(model.chapterId, 'b-1');
    chapterCount = 1; await ui.actions.refresh();
    if (ui.actions.selectChapter) assert.equal(model.chapterId, 'b-0');
    rows = rows.slice(0, 1); await ui.actions.refresh();
    assert.equal(model.selected, 'a');
    if (ui.actions.selectChapter) assert.equal(model.chapterId, 'a-0');
    rows = []; await ui.actions.refresh(); assert.equal(model.selected, null);
    identity = null; ui.setIdentity(identity); assert.deepEqual(model.games, []);
  });
}
