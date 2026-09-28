import { PresentationClock } from "./presentationclock.js";
import { loadImage } from "../core/assets.js";

// 原版完整云雨帧直接绘制；换帧/平滑位置是Web表现，不反写天气规则。
const FRAME_MS = 100; // Web表现节拍，不是DOS规则周期。
const SLOTS = 16;
const WIDTH = 256, HEIGHT = 144;

export class WeatherPresentation {
  constructor() {
    this.clock = new PresentationClock();
    this.scenario = null;
    this.clouds = Array(SLOTS).fill(null);
    this.frames = [];
  }

  async preload() {
    this.frames = await Promise.all(Array.from({ length: 8 }, (_, frame) =>
      loadImage(`grf/weather/cloud_frame_${frame}.png`)));
  }

  reset() {
    this.clock.reset();
    this.scenario = null;
    this.clouds.fill(null);
  }

  pause() { this.clock.pause(); }

  update(scenario, now, { enabled = true } = {}) {
    if (scenario !== this.scenario) {
      this.reset();
      this.scenario = scenario;
    }
    if (!enabled || !scenario) { this.pause(); return false; }
    const dt = this.clock.advance(now);
    let changed = false;
    for (let slot = 0; slot < SLOTS; slot++) {
      const source = scenario.weatherClouds?.[slot];
      const active = source && source.active !== false && (source.group ?? 0) === 0 &&
        Number.isFinite(source.x) && Number.isFinite(source.y);
      let cloud = this.clouds[slot];
      if (active) {
        if (!cloud) {
          cloud = this.clouds[slot] = { x: source.x, y: source.y, alpha: 0,
            sourceX: source.x, sourceY: source.y,
            initialFrame: (source.frame ?? 0) & 7, bornAt: this.clock.time };
          changed = true;
        } else if (Math.abs(source.x - cloud.sourceX) > 4 || Math.abs(source.y - cloud.sourceY) > 4) {
          // 比较相邻权威位置，而非滞后的显示位置；追赶距离大不等于回卷。
          // 真跳变只重定位，不重置可见度/动画，避免连续移动反复淡出消失。
          cloud.x = source.x;
          cloud.y = source.y;
          changed = true;
        }
        cloud.sourceX = source.x;
        cloud.sourceY = source.y;
        const frame = (cloud.initialFrame + Math.floor((this.clock.time - cloud.bornAt) / FRAME_MS)) & 7;
        if (cloud.frame !== frame) changed = true;
        cloud.frame = frame;
        const blend = 1 - Math.exp(-dt / 120);
        cloud.x += (source.x - cloud.x) * blend;
        cloud.y += (source.y - cloud.y) * blend;
        cloud.alpha = Math.min(1, cloud.alpha + dt / 300);
      } else if (cloud) {
        cloud.alpha = Math.max(0, cloud.alpha - dt / 300);
        if (cloud.alpha === 0) this.clouds[slot] = null;
      }
      if (cloud && dt > 0) changed = true;
    }
    return changed;
  }

  /** 原帧已含云体、雨丝及透明区域，不重画、不额外叠加粒子。 */
  draw(ctx, camera, tileSize, viewport) {
    for (const cloud of this.clouds) {
      if (!cloud || cloud.alpha <= 0) continue;
      const image = this.frames[cloud.frame];
      if (!image) continue;
      const x = camera.x + (cloud.x - 8) * tileSize * camera.scale;
      const y = camera.y + (cloud.y - 4) * tileSize * camera.scale;
      if (x >= viewport.width || y >= viewport.height ||
          x + WIDTH * camera.scale <= 0 || y + HEIGHT * camera.scale <= 0) continue;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha *= cloud.alpha;
      ctx.drawImage(image, x, y, WIDTH * camera.scale, HEIGHT * camera.scale);
      ctx.restore();
    }
  }
}
