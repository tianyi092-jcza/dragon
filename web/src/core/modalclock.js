// 模态视图时钟控制 — diploview/endview/openview 共用
// 打开模态时暂停游戏时钟(战略速度分离)，关闭时恢复

/**
 * 暂停时钟。holder 需有 _clockPauseState 槽位(通常传 this)。
 * @param {object} app
 * @param {object} holder
 */
export function clockPause(app, holder) {
  if (app.clock && holder._clockPauseState == null) {
    holder._clockPauseState = {
      strategicSpeed: app.clock.strategicSpeed,
      legacyPaused: app.clock._legacyPaused,
    };
    app.clock._legacyPaused = true;
  }
}

/**
 * 恢复时钟(与 clockPause 配对)。
 * @param {object} app
 * @param {object} holder
 */
export function clockRestore(app, holder) {
  if (app.clock && holder._clockPauseState != null) {
    app.clock.strategicSpeed = holder._clockPauseState.strategicSpeed;
    app.clock._legacyPaused = holder._clockPauseState.legacyPaused;
    holder._clockPauseState = null;
  }
}
