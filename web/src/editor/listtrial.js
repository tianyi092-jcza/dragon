// Local saved-chapter launcher, not authentication or a manifest/asset validator.
// The production trial loader still verifies the complete fixed snapshot.
export async function launchListTrial(binding, { openWindow, compile }) {
  const gameId = binding?.gameId, draftRevision = binding?.draftRevision, chapterId = binding?.chapterId;
  if (typeof gameId !== "string" || !gameId || typeof chapterId !== "string" || !chapterId ||
      typeof draftRevision !== "string" || !/^[1-9][0-9]*$/.test(draftRevision) ||
      typeof openWindow !== "function" || typeof compile !== "function") throw new TypeError("缺少固定試運行身份");
  // Runs before the first await, in the initiating click's user gesture.
  const child = openWindow("/trial-wait", "_blank");
  if (!child) return { result: "blocked" };
  try {
    child.opener = null;
    const manifest = await compile({ gameId, expectedRevision: draftRevision, scope: { kind: "chapter", chapterId } });
    if (child.closed) throw new Error("試運行視窗已關閉，請重新開啟");
    if (manifest?.identity?.gameId !== gameId || manifest.identity.draftRevision !== draftRevision ||
        manifest.scope?.kind !== "chapter" || manifest.scope.chapterId !== chapterId ||
        !Array.isArray(manifest.chapters) || manifest.chapters.length !== 1 || manifest.chapters[0] !== chapterId ||
        !manifest.visualAssets) throw new Error("試運行回應身份或章節範圍不符");
    child.location.replace("/trial-app?" + new URLSearchParams({ game: gameId, revision: draftRevision, chapter: chapterId, scope: "chapter" }));
    return { result: "opened", gameId, draftRevision, chapterId };
  } catch (error) {
    // Only our waiting window, never existing Trial or editor windows.
    try { if (!child.closed) child.close(); } catch { /* retain original failure */ }
    throw error;
  }
}
