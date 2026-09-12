// Web product presentation only; no game clock, state or RNG access.
import { introConfig as config } from "./intro.config.js";
import { openingFrame } from "./timeline.js";
import { loadOpeningMusic } from "./music-cache.js";

const SEEN = "wolong.intro.seen.v1";
export async function mountOpening() {
  const response = await fetch(new URL("./scene.html", import.meta.url));
  if (!response.ok) throw new Error(`开场页面加载失败: ${response.status}`);
  const root = document.querySelector("#titlebg");
  const fragment = new DOMParser().parseFromString(
    await response.text(),
    "text/html",
  );
  root.replaceChildren(...fragment.body.childNodes);
  const $ = (id) => root.querySelector(`#${id}`);
  const stage = $("scene"),
    character = $("character");
  const sound = $("sound-toggle"),
    skip = $("skip-button"),
    replay = $("replay-button");
  const status = $("load-status"),
    label = $("load-label"),
    progress = $("load-progress"),
    start = $("start-opening"),
    footer = $("scene-footer");
  const asset = (name) => new URL(name, import.meta.url).href;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = false;
  try {
    seen = sessionStorage.getItem(SEEN) === "1";
    sessionStorage.setItem(SEEN, "1");
  } catch {
    /* Storage denied: first-visit behavior. */
  }
  let time = 0,
    phase = "loading",
    muted = seen,
    blocked = false,
    active = true;
  let raf = 0,
    last = null,
    request = 0;
  let releaseMenu;
  const menuReady = new Promise((resolve) => {
    releaseMenu = resolve;
  });
  const audio = new Audio();
  audio.loop = false;
  audio.volume = config.musicVolume;
  audio.preload = "auto";
  const controller = new AbortController();
  let musicReady, musicObjectUrl;
  let memoryOnly = false;
  function reportProgress({ stage: step, loaded, total }) {
    if (!active || phase === "error") return;
    if (step === "download") {
      // No Content-Length means indeterminate, not a fabricated percentage.
      if (total)
        progress.value = Math.min(99, Math.floor((loaded / total) * 100));
      else progress.removeAttribute("value");
      label.textContent = total
        ? `正在加载音乐 ${progress.value}%`
        : `正在加载音乐（${Math.round(loaded / 1024)} KB）`;
    } else {
      progress.value = step === "saving" ? 99 : 100;
      memoryOnly = step === "memory";
      if (step === "saving") label.textContent = "正在缓存音乐…";
      else if (memoryOnly)
        label.textContent = "音乐已就绪（浏览器未允许持久缓存）";
      else label.textContent = "音乐已缓存，正在准备画面…";
    }
  }
  function prepareMusic() {
    if (musicReady) return musicReady;
    musicReady = (async () => {
      const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const blob = await loadOpeningMusic(asset(config.musicUrl), {
          signal: controller.signal,
          onProgress: reportProgress,
        });
        controller.signal.throwIfAborted();
        musicObjectUrl = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          const done = (event) => {
            clearTimeout(mediaTimer);
            audio.removeEventListener("canplay", done);
            audio.removeEventListener("error", done);
            controller.signal.removeEventListener("abort", done);
            if (event.type === "canplay") resolve();
            else reject(new Error("开场音乐无法解码或加载已取消"));
          };
          const mediaTimer = setTimeout(() => done({ type: "timeout" }), 30000);
          audio.addEventListener("canplay", done);
          audio.addEventListener("error", done);
          controller.signal.addEventListener("abort", done, { once: true });
          audio.src = musicObjectUrl;
          audio.load();
        });
      } finally {
        clearTimeout(timer);
      }
    })();
    return musicReady;
  }
  function begin() {
    if (!active || (phase !== "ready" && phase !== "waiting")) return;
    status.hidden = true;
    start.hidden = true;
    phase = "intro";
    character.src = asset(
      reduced ? config.characterPoster : config.characterUrl,
    );
    stage.classList.add("is-loaded");
    if (reduced) time = config.duration;
    draw();
    schedule();
  }
  function fail(error) {
    // Decorative resource failure must not make saved games inaccessible.
    phase = "error";
    controller.abort();
    muted = true;
    stopMusic();
    status.hidden = false;
    progress.hidden = true;
    start.hidden = true;
    label.textContent = "开场素材加载失败，仍可选择游戏。";
    replay.hidden = false;
    releaseMenu();
    console.error("[WolongIntro]", error);
  }
  const cleanups = [];
  const on = (node, name, fn) => {
    node.addEventListener(name, fn);
    cleanups.push(() => node.removeEventListener(name, fn));
  };
  function fit() {
    // Top-left cover, never downscale: browser chrome only crops the scene.
    stage.style.setProperty(
      "--scene-scale",
      Math.max(1, innerWidth / 1920, innerHeight / 1080),
    );
  }
  function updateSound() {
    sound.dataset.enabled = String(!muted && !audio.ended);
    sound.dataset.waiting = String(blocked && !muted);
    sound.setAttribute("aria-pressed", String(!muted && !audio.ended));
    sound.setAttribute(
      "aria-label",
      muted || audio.ended ? "开启背景音乐" : "关闭背景音乐",
    );
    $("sound-hint").hidden = !blocked || muted;
  }
  function stopMusic() {
    request++;
    audio.pause();
    updateSound();
  }
  async function playMusic(sync = false) {
    if (
      !active ||
      muted ||
      document.hidden ||
      audio.ended ||
      phase === "loading" ||
      phase === "error"
    )
      return;
    const token = ++request;
    if (sync && Number.isFinite(audio.duration))
      audio.currentTime = Math.min(time, audio.duration);
    try {
      if (!musicObjectUrl) await prepareMusic();
      if (token !== request || !active || muted) return;
      await audio.play();
      if (!active || muted || document.hidden) {
        audio.pause();
        return;
      }
      // A late play() resolution must not pause a newer valid playback.
      if (token !== request) return;
      blocked = false;
      begin();
    } catch (error) {
      if (token !== request || !active) return;
      if (error.name !== "NotAllowedError") {
        fail(error);
        return;
      }
      blocked = true;
      if (phase === "ready" || phase === "waiting") {
        phase = "waiting";
        label.textContent = memoryOnly
          ? "加载完成（仅本次缓存），点击开始播放"
          : "加载完成，点击开始播放";
        start.hidden = false;
      }
    }
    updateSound();
  }
  function draw() {
    const frame = openingFrame(time);
    $("landscape").style.transform = `translateY(${frame.landscapeY}px)`;
    $("landscape").style.opacity = frame.landscapeOpacity;
    $("foreground").style.transform = `translateY(${frame.foregroundY}px)`;
    $("game-title").style.opacity = frame.titleOpacity;
    $("subtitle").style.opacity = frame.subtitleOpacity;
    footer.style.opacity = frame.footerOpacity;
    footer.inert = time <= 22;
    footer.classList.toggle("is-visible", !footer.inert);
    // Show the game prompt only after “三国制霸之计” has fully faded in.
    if (frame.subtitleOpacity >= 1) releaseMenu();
    if (time >= config.duration) phase = "idle";
  }
  function tick(now) {
    raf = 0;
    if (!active || document.hidden || phase !== "intro") {
      last = null;
      return;
    }
    if (last !== null)
      time = Math.min(config.duration, time + (now - last) / 1000);
    last = now;
    draw();
    if (phase === "intro") raf = requestAnimationFrame(tick);
  }
  function schedule() {
    if (!raf && active && !document.hidden && phase === "intro")
      raf = requestAnimationFrame(tick);
  }
  function finish() {
    status.hidden = true;
    start.hidden = true;
    stage.classList.add("is-loaded");
    cancelAnimationFrame(raf);
    raf = 0;
    last = null;
    time = config.duration;
    muted = true;
    blocked = false;
    stopMusic();
    audio.currentTime = 0;
    draw();
  }
  function hide() {
    active = false;
    cancelAnimationFrame(raf);
    raf = 0;
    last = null;
    stopMusic();
    character.src = asset(config.characterPoster);
    root.hidden = true;
  }
  function showFinished() {
    active = true;
    root.hidden = false;
    character.src = asset(config.characterPoster);
    finish();
  }
  const api = {
    menuReady,
    hide,
    showFinished,
    skip: finish,
    get time() {
      return time;
    },
    get phase() {
      return phase;
    },
    get music() {
      return {
        playing: !audio.paused,
        muted,
        blocked,
        time: audio.currentTime,
      };
    },
    destroy() {
      hide();
      controller.abort();
      cleanups.splice(0).forEach((fn) => fn());
      audio.removeAttribute("src");
      audio.load();
      if (musicObjectUrl) URL.revokeObjectURL(musicObjectUrl);
    },
  };
  window.WolongIntro = api;
  on(window, "resize", fit);
  on(skip, "click", finish);
  on(start, "click", () => {
    void playMusic();
  });
  on(replay, "click", () => {
    try {
      sessionStorage.removeItem(SEEN);
    } catch {
      /* Reload still resets all UI. */
    }
    location.reload();
  });
  replay.title = "重新开始";
  replay.setAttribute("aria-label", "重新开始");
  on(sound, "click", () => {
    if (!muted && !audio.ended) {
      muted = true;
      blocked = false;
      stopMusic();
      begin(); // Explicit mute is allowed to start a silent opening.
    } else {
      muted = false;
      if (audio.ended) audio.currentTime = 0;
      void playMusic();
    }
    updateSound();
  });
  on(audio, "ended", updateSound);
  on(document, "pointerdown", (event) => {
    if (!root.contains(event.target) && !active) return;
    if (event.target.closest?.("button") && root.contains(event.target)) return;
    if (blocked && !muted) void playMusic(true);
  });
  on(document, "keydown", (event) => {
    if (event.target.closest?.("button") && root.contains(event.target)) return;
    if (blocked && !muted) void playMusic(true);
  });
  on(document, "visibilitychange", () => {
    last = null;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      stopMusic();
    } else {
      schedule();
      void playMusic();
    }
  });
  on(window, "pagehide", () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = null;
    stopMusic();
  });
  const subtitle = config.subtitle;
  $("subtitle").textContent = subtitle.text;
  Object.assign($("subtitle").style, {
    left: `${subtitle.x}px`,
    top: `${subtitle.y}px`,
    fontSize: `${subtitle.fontSize}px`,
    letterSpacing: `${subtitle.letterSpacing}px`,
    color: subtitle.color,
    fontFamily: subtitle.fontFamily,
  });
  const row = $("footer-text");
  // Only <br> is markup; all other content stays text, never arbitrary HTML.
  for (const [index, line] of config.footerText
    .split(/<br\s*\/?\s*>/i)
    .entries()) {
    if (index) row.append(document.createElement("br"));
    row.append(document.createTextNode(line));
  }
  character.src = asset(config.characterPoster);
  fit();
  try {
    const animation = new Image();
    if (!seen && !reduced) animation.src = asset(config.characterUrl);
    await Promise.all([
      seen ? Promise.resolve() : prepareMusic(),
      seen || reduced ? Promise.resolve() : animation.decode(),
      ...[...stage.querySelectorAll("img")].map((img) => img.decode()),
    ]);
    controller.signal.throwIfAborted();
    sound.hidden = false;
    skip.hidden = false;
    replay.hidden = false;
    phase = "ready";
    if (seen) finish();
    else void playMusic();
    updateSound();
  } catch (error) {
    if (active) fail(error);
  }
  return api;
}
