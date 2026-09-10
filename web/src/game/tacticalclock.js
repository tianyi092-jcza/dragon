// 战术固定帧墙钟门控。
// YNSOUND.COM 0x8B7/0x913：PIT ch0=1193182/256 Hz，INT 8 handler
// 每16个硬件IRQ执行一次0x93D自修改far call；KI.EXE通过INT61 AH=0Ch
// 把0x356计时回调注册到该槽。KI.EXE 0x60A5再令CFB<<4写CFC，
// 0xA0F2按CFC个回调等待下一战术逻辑帧。

export const TACTICAL_SPEED_LABELS = [
  "最低速",
  "低速",
  "普通",
  "高速",
  "最高速",
];

export const YNSOUND_PIT_INPUT_HZ = 1193182;
export const YNSOUND_PIT_DIVISOR = 256;
export const YNSOUND_CALLBACK_IRQ_DIVISOR = 16;
export const YNSOUND_TIMER_HZ =
  YNSOUND_PIT_INPUT_HZ / (YNSOUND_PIT_DIVISOR * YNSOUND_CALLBACK_IRQ_DIVISOR);
export const YNSOUND_TIMER_PERIOD_MS = 1000 / YNSOUND_TIMER_HZ;
export const TACTICAL_IRQ_WAIT_COUNTS = [64, 48, 32, 16, 0];
// Web产品决定（用户本次要求，非原版IRQ等待）：入场与后续战斗的五档
// 墙钟推进速率统一为此前的1/2；原始IRQ常量及每个规则帧保持不变。
// 此前最高档60Hz现为30Hz，仍独立于显示器刷新率、一RAF最多一帧且不追债。
export const TACTICAL_PLAYBACK_RATE = 0.5;
export const TACTICAL_HIGHEST_SPEED_CAP_MS =
  1000 / (60 * TACTICAL_PLAYBACK_RATE);
const FRAME_BUDGET_EPSILON_MS = 1e-9;
// 仅保留给旧调试句柄/测试显示；BattleView不再使用此倍率推进规则帧。
export const TACTICAL_SPEED_FACTORS = [0.5, 0.75, 1.0, 1.5, 2.5];

export function tacticalFrameIntervalMs(speed) {
  const idx = Math.max(0, Math.min(4, Math.trunc(Number(speed) || 0)));
  if (idx === 4) return TACTICAL_HIGHEST_SPEED_CAP_MS;
  return (
    (TACTICAL_IRQ_WAIT_COUNTS[idx] * YNSOUND_TIMER_PERIOD_MS) /
    TACTICAL_PLAYBACK_RATE
  );
}

export function consumeTacticalFrameBudget(
  accumulatorMs,
  elapsedMs,
  speed,
  maxFrames = 1,
) {
  const rawElapsed = Number(elapsedMs);
  const elapsed =
    Number.isFinite(rawElapsed) && rawElapsed >= 0 ? rawElapsed : 0;
  const limit = Math.max(0, Math.trunc(Number(maxFrames) || 0));
  const intervalMs = tacticalFrameIntervalMs(speed);
  const rawAccumulator = Number(accumulatorMs);
  const accumulator =
    Number.isFinite(rawAccumulator) && rawAccumulator >= 0 ? rawAccumulator : 0;
  const accumulated = accumulator + elapsed;
  // Repeated 120/144Hz fractional RAF deltas can otherwise end a mathematically
  // exact 30Hz interval a few ulps short. This only normalizes floating-point
  // phase; it is far below any real timer precision or game interval.
  const available = Math.floor(
    (accumulated + FRAME_BUDGET_EPSILON_MS) / intervalMs,
  );
  const frames = Math.min(limit, available);
  const fractionalRemainder = Math.max(0, accumulated - available * intervalMs);
  return {
    frames,
    // A throttled/background RAF must not leave a hidden backlog that drains as
    // one rule frame on every later paint. Keep only the fractional phase.
    remainderMs:
      available > limit
        ? fractionalRemainder
        : Math.max(0, accumulated - frames * intervalMs),
  };
}
