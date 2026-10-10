// Web capability boundary, not a game rule. No persistence imports or IO.
// b2 发布玩（用户裁决 2026-10-10）：localhost 免登持久玩，按游戏隔离存档库名；内置沿用默认库。
export function playSaveDatabaseName(gameId) {
  if (gameId === "wolong-builtin" || typeof gameId !== "string" || !gameId) return "wolong-web";
  return `wolong-web-pub-${encodeURIComponent(gameId)}`;
}
export function disableTrialPersistence(app, identity) {
  if (!identity?.gameId || !identity.trialSnapshotId || !identity.sourceDigest) throw new TypeError("invalid trial identity");
  const reject = () => { throw new Error("草稿試運行禁止正式存讀檔"); };
  const repository = Object.freeze(Object.fromEntries(["load", "save", "put", "add", "remove", "clear", "import"].map((key) => [key, reject])));
  Object.defineProperties(app, {
    canPersist: { value: false, enumerable: true, writable: false, configurable: false },
    trialIdentity: { value: Object.freeze({ ...identity }), enumerable: true, writable: false, configurable: false },
    saveRepository: { value: repository, enumerable: true, writable: false, configurable: false },
  });
  app.saves = { schema: 1, slots: [] };
}
