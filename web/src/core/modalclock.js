// 模态视图时钟控制 — diploview/endview/openview 共用
// 打开模态时暂停游戏时钟(战略速度分离)，关闭时恢复

/**
 * 暂停时钟。holder 需有 _prevSpeed 槽位(通常传 this)。
 * @param {object} app
 * @param {object} holder
 */
export function clockPause(app, holder) {
 if (app.clock && holder._prevSpeed == null) {
  holder._prevSpeed = app.clock.speed;
  app.clock.speed = 0;
 }
}

/**
 * 恢复时钟(与 clockPause 配对)。
 * @param {object} app
 * @param {object} holder
 */
export function clockRestore(app, holder) {
 if (app.clock && holder._prevSpeed != null) {
  app.clock.speed = holder._prevSpeed;
  holder._prevSpeed = null;
 }
}
