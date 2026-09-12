// Web product presentation only; no game clock, state or RNG access.
import { introConfig as config } from "./intro.config.js";
import { openingFrame } from "./timeline.js";

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
  const audio = new Audio(asset(config.musicUrl));
  audio.loop = false;
  audio.volume = config.musicVolume;
  audio.preload = seen ? "none" : "auto";
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
    if (!active || muted || document.hidden || audio.ended) return;
    const token = ++request;
    if (sync && Number.isFinite(audio.duration))
      audio.currentTime = Math.min(time, audio.duration);
    try {
      await audio.play();
      if (!active || muted || document.hidden) {
        audio.pause();
        return;
      }
      // A late play() resolution must not pause a newer valid playback.
      if (token !== request) return;
      blocked = false;
    } catch {
      if (token === request) blocked = true;
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
    if (time >= 15) releaseMenu();
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
      cleanups.splice(0).forEach((fn) => fn());
      audio.removeAttribute("src");
      audio.load();
    },
  };
  window.WolongIntro = api;
  on(window, "resize", fit);
  on(skip, "click", finish);
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
  on(document, "keydown", () => {
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
  $("footer-line-1").textContent = config.footerLine1;
  const row = $("footer-line-2");
  let end = 0;
  for (const match of config.footerLine2.matchAll(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
  )) {
    row.append(
      document.createTextNode(config.footerLine2.slice(end, match.index)),
    );
    const link = document.createElement("a");
    link.textContent = match[1];
    link.href = match[2];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    row.append(link);
    end = match.index + match[0].length;
  }
  row.append(document.createTextNode(config.footerLine2.slice(end)));
  character.src = asset(
    seen || reduced ? config.characterPoster : config.characterUrl,
  );
  fit();
  const musicReady = seen
    ? Promise.resolve()
    : new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          audio.removeEventListener("canplay", done);
          audio.removeEventListener("error", done);
          resolve();
        };
        const timer = setTimeout(done, 4000);
        audio.addEventListener("canplay", done, { once: true });
        audio.addEventListener("error", done, { once: true });
        audio.load();
      });
  try {
    await Promise.all([
      musicReady,
      ...[...stage.querySelectorAll("img")].map((img) => img.decode()),
    ]);
    stage.classList.add("is-loaded");
    status.hidden = true;
    sound.hidden = false;
    skip.hidden = false;
    replay.hidden = false;
    phase = "intro";
    if (seen) finish();
    else if (reduced) {
      time = config.duration;
      draw();
      void playMusic();
    } else {
      draw();
      schedule();
      void playMusic();
    }
    updateSound();
  } catch (error) {
    // Decorative resources must not make saved games inaccessible.
    phase = "error";
    muted = true;
    stopMusic();
    status.textContent = "开场素材加载失败，仍可选择游戏。";
    replay.hidden = false;
    releaseMenu();
    console.error("[WolongIntro]", error);
  }
  return api;
}
