import assert from "node:assert/strict";
import { PresentationClock } from "../web/src/render/presentationclock.js";
import { WeatherPresentation } from "../web/src/render/weatherpresentation.js";

const clock = new PresentationClock();
assert.equal(clock.advance(0), 0);
assert.equal(clock.advance(50), 50);
assert.equal(clock.advance(9000), 100);
assert.equal(clock.time, 150);
assert.equal(clock.advance(9200), 100, "successive slow visible frames must not stall");
clock.pause();
assert.equal(clock.advance(10000), 0);
assert.equal(clock.advance(10010, false), 0);
assert.equal(clock.advance(10020), 0);
assert.equal(clock.advance(10010), 0);
clock.reset();
assert.equal(clock.time, 0);

const sc = { weatherClouds: [Object.freeze({ x: 100, y: 100, group: 0, frame: 0, active: true })] };
const fx = new WeatherPresentation();
const before = JSON.stringify(sc);
fx.update(sc, 0);
for (let i = 1; i <= 30; i++) fx.update(sc, i * 10);
assert.ok(Math.abs(fx.clouds[0].alpha - 1) < 1e-12);
assert.equal(JSON.stringify(sc), before);
sc.weatherClouds[0] = Object.freeze({ ...sc.weatherClouds[0], x: 101 });
fx.update(sc, 310);
assert.ok(fx.clouds[0].x > 100 && fx.clouds[0].x < 101);
const paused = JSON.stringify(fx.clouds);
fx.update(sc, 9000, { enabled: false });
fx.update(sc, 10000);
assert.equal(JSON.stringify(fx.clouds), paused);
sc.weatherClouds[0] = Object.freeze({ ...sc.weatherClouds[0], x: 0 });
fx.update(sc, 10010);
assert.equal(fx.clouds[0].x, 0, "wrap does not fly across the world");
sc.weatherClouds[0] = null;
for (let i = 1; i <= 40; i++) fx.update(sc, 10010 + i * 10);
assert.equal(fx.clouds[0], null);
fx.update({ weatherClouds: [] }, 11000);
assert.equal(fx.clock.time, 0);
assert.ok(fx.clouds.every((cloud) => cloud === null));

// 30/60Hz只改变采样密度，不改变同一表现时间的连续位置/透明度。
function sample(step) {
  const scenario = { weatherClouds: [{ x: 100, y: 100 }] };
  const view = new WeatherPresentation();
  view.update(scenario, 0);
  scenario.weatherClouds[0].x = 101;
  for (let i = 1; i <= step; i++) view.update(scenario, i * (1000 / step));
  return view.clouds[0];
}
assert.ok(Math.abs(sample(30).x - sample(60).x) < 1e-10);
assert.equal(sample(30).alpha, sample(60).alpha);
// 固定规则帧也持续播放原图；高速连续小步不能误当跳变重置alpha。
const movingSource = { weatherClouds: [{ x: 100, y: 100, frame: 0 }] };
const moving = new WeatherPresentation();
moving.update(movingSource, 0);
const frames = new Set();
for (let time = 10; time <= 1000; time += 10) {
  movingSource.weatherClouds[0].x++;
  moving.update(movingSource, time);
  frames.add(moving.clouds[0].frame);
  if (time >= 300) assert.ok(moving.clouds[0].alpha > 0.999);
}
assert.equal(frames.size, 8);
assert.equal(movingSource.weatherClouds[0].frame, 0, "animation must not write rule frame");
assert.ok(moving.clouds[0].x < movingSource.weatherClouds[0].x - 4, "exercise large visual lag without teleport");
movingSource.weatherClouds[0].x = -16;
moving.update(movingSource, 1010);
assert.equal(moving.clouds[0].x, -16);
assert.ok(moving.clouds[0].alpha > 0.999, "true wrap keeps visibility");
process.stdout.write("weather presentation OK: isolated animation, stable visibility, immutable inputs, smooth samples, wrap, fade and lifecycle\n");
