// 委任战斗的战略地图四相示意动画。表现时间不参与 KI.EXE 规则状态。
export const ENGAGE_TRANSITION_FRAMES = Object.freeze([0, 1, 2, 3]);
// ID3→ID13→静音共10个INT1Ch tick，约549.254ms；四相各配一声。
export const ENGAGE_TRANSITION_FRAME_MS = 550;

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

/**
 * app 级单槽 gate。四图准备完成后才开始计时；每个 RAF 最多推进一相，
 * 因而后台/延迟帧也不会跳过 0→1→2→3。完成回调至多一次。
 */
export function playEngageTransition(
  app,
  legion,
  onFinish,
  {
    frameMs = ENGAGE_TRANSITION_FRAME_MS,
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame,
    prepare = null,
    onFrame = null,
  } = {},
) {
  if (app.engageTransition?.active || typeof onFinish !== "function")
    return false;

  const gamebar = app.gamebar;
  const previousHoldRequest = gamebar?._clockHoldRequested ?? false;
  let rafId = null;
  let done = false;
  let prepared = false;
  let lastAdvanceAt = null;
  let frameIndex = 0;
  const transition = {
    active: true,
    runtimeEnabled: true,
    legion,
    frame: ENGAGE_TRANSITION_FRAMES[0],
  };
  const emitFrame = () => {
    if (typeof onFrame === "function") onFrame(transition.frame);
  };
  app.engageTransition = transition;
  if (gamebar) {
    gamebar._clockHoldRequested = true;
    gamebar.syncClock?.();
  } else if (app.clock) {
    app.clock.hold = true;
  }

  const finish = (runCallback = true) => {
    if (done) return;
    done = true;
    transition.active = false;
    if (rafId != null && typeof cancelFrame === "function") cancelFrame(rafId);
    rafId = null;
    app.view?.draw?.();
    try {
      if (runCallback) onFinish();
    } finally {
      if (app.engageTransition === transition) app.engageTransition = null;
      if (gamebar) {
        gamebar._clockHoldRequested = previousHoldRequest;
        gamebar.syncClock?.();
      } else if (app.clock) {
        app.clock.hold = previousHoldRequest;
      }
      app.view?.draw?.();
    }
  };
  transition.finish = finish;
  transition.cancel = () => finish(false);
  transition.suspend = () => {
    transition.runtimeEnabled = false;
  };
  transition.setRuntimeEnabled = (enabled) => {
    transition.runtimeEnabled = Boolean(enabled);
    lastAdvanceAt = null;
  };

  const tick = (timestamp) => {
    if (done || app.engageTransition !== transition) return;
    if (!transition.runtimeEnabled || app.runtimeEnabled === false) {
      lastAdvanceAt = null;
      rafId = requestFrame(tick);
      return;
    }
    if (lastAdvanceAt == null) {
      lastAdvanceAt = timestamp;
    } else if (timestamp - lastAdvanceAt >= frameMs) {
      lastAdvanceAt = timestamp;
      frameIndex++;
      if (frameIndex >= ENGAGE_TRANSITION_FRAMES.length) {
        finish();
        return;
      }
      transition.frame = ENGAGE_TRANSITION_FRAMES[frameIndex];
      emitFrame();
      app.view?.draw?.();
    }
    rafId = requestFrame(tick);
  };

  const start = () => {
    if (done || prepared) return;
    prepared = true;
    emitFrame();
    app.view?.draw?.();
    if (typeof requestFrame !== "function") {
      finish();
      return;
    }
    rafId = requestFrame(tick);
  };

  if (typeof prepare === "function") {
    Promise.resolve()
      .then(() => prepare())
      .catch(() => null)
      .then(start);
  } else {
    start();
  }
  return true;
}
