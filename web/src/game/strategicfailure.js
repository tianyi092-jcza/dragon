// Web fault state, not an original-game result or a save migration. The caller
// must verify its own scene/batch ownership and cancel its continuation first.
export function holdFailedStrategicUpdate(app, error) {
  app._strategicBattleFailure = { error };
  if (app.clock) app.clock.hold = true;
  app.gamebar?.syncClock?.();
  app.hud?.flashEvent?.(
    "軍團處理失敗，遊戲已暫停且未存檔。請由系統選單讀檔或退出；原存檔不變。",
  );
  globalThis.__dragonDebug?.reportError?.("strategic update failed", error);
}
