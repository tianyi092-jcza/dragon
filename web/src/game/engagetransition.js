// 四幅原始接战资源的纯表现索引工具。实际战略图由军团+3倒计时低两位选帧；
// 不另建一轮阻塞式过渡，否则会在城前等待结束后重复播放动画。
export const ENGAGE_TRANSITION_FRAMES = Object.freeze([0, 1, 2, 3]);
export const ENGAGE_TRANSITION_FRAME_MS = 165;

/** 纯函数：给定经过时间，返回理论帧；播放结束返回 null。 */
export function engageTransitionFrame(
  elapsedMs,
  frameMs = ENGAGE_TRANSITION_FRAME_MS,
) {
  const index = Math.floor(Math.max(0, elapsedMs) / Math.max(1, frameMs));
  return index < ENGAGE_TRANSITION_FRAMES.length
    ? ENGAGE_TRANSITION_FRAMES[index]
    : null;
}
