// Web fault state, not an original-game result or a save migration. The caller
// must verify its own scene/batch ownership and cancel its continuation first.
export function holdFailedStrategicUpdate(app, error) {
  app._strategicBattleFailure = { error };
  if (app.clock) app.clock.hold = true;
  app.gamebar?.syncClock?.();
  app.hud?.flashEvent?.(
    "軍團處理失敗，遊戲已暫停且未存檔。請由系統選單讀檔或退出；原存檔不變。",
  );
  // 计时算法铁律：永久冻结绝不能是控制台静默的。aiTick/军团批处理
  // 的 catch 会吞掉异常（fail-closed 保状态），此处是唯一的集中上报点，
  // 必须带堆栈输出，否则冻结看起来就是“计时无故停止且不报错”。
  console.error("[wolong] strategic update failed; clock held", error);
  globalThis.__dragonDebug?.reportError?.("strategic update failed", error);
}
