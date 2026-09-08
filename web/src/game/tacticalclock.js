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
// 仅保留给旧调试句柄/测试显示；BattleView不再使用此倍率推进规则帧。
export const TACTICAL_SPEED_FACTORS = [0.5, 0.75, 1.0, 1.5, 2.5];

export function tacticalFrameIntervalMs(speed) {
  const idx = Math.max(0, Math.min(4, Math.trunc(Number(speed) || 0)));
  return TACTICAL_IRQ_WAIT_COUNTS[idx] * YNSOUND_TIMER_PERIOD_MS;
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
  if (intervalMs === 0) {
    return { frames: elapsed > 0 ? limit : 0, remainderMs: 0 };
  }
  const rawAccumulator = Number(accumulatorMs);
  const accumulator =
    Number.isFinite(rawAccumulator) && rawAccumulator >= 0 ? rawAccumulator : 0;
  const accumulated = accumulator + elapsed;
  const available = Math.floor(accumulated / intervalMs);
  const frames = Math.min(limit, available);
  return {
    frames,
    // A throttled/background RAF must not leave a hidden backlog that drains as
    // one rule frame on every later paint. Keep only the fractional phase.
    remainderMs:
      available > limit
        ? accumulated % intervalMs
        : accumulated - frames * intervalMs,
  };
}
