// I/O: synthetic records only. Oracle vectors are frozen from actual KI.EXE
// 248A→24FF→ECE0 execution; source/evidence root is documented in march §3.16.
import assert from "node:assert/strict";
import test from "node:test";
import {
  moveOriginalWeatherCloud,
  tickOriginalStrategicWeather,
} from "../web/src/game/weather.js";

const TABLE = Array.from({ length: 256 }, (_, i) => (i * 73 + 19) & 255);
const VECTORS = [
  [
    [-16, -15, -1, -1, 9, 271, -16, 400, -16, 400, 0, 1],
    [-16, -15, -3, -2, 8, 271, 18, 216],
  ],
  [
    [-1, 16, -128, 1, -15, 273, -32768, 32767, -32768, 32767, 128, 0],
    [14, 15, -112, 1, -15, 272, 146, 7],
  ],
  [
    [14, -1, 14, 16, -17, 400, 10, 10, 10, 10, 1, 255],
    [13, 0, 14, 14, 400, -16, 19, 128],
  ],
  [
    [127, 127, -14, -128, 32767, 32767, 0, 20, 0, 20, 255, 128],
    [97, -14, -14, -16, 400, -16, 17, 61],
  ],
  [
    [-15, 0, 127, -15, 400, -17, -16, 400, -16, 400, 127, 127],
    [0, 0, 97, -15, 399, -16, 145, 108],
  ],
  [
    [0, -128, 1, 0, 273, -15, -32768, 32767, -32768, 32767, 0, 1],
    [0, -15, 0, -1, 272, -15, 18, 216],
  ],
  [
    [-128, -16, 16, 127, 10, 20, 0, 20, 0, 20, 1, 255],
    [98, -15, 16, 14, 11, 21, 19, 128],
  ],
  [
    [1, -15, -16, -1, -16, 399, -32768, 32767, -32768, 32767, 127, 127],
    [-14, -15, -2, -1, -16, -16, 145, 108],
  ],
  [
    [14, 0, 14, -15, 272, 0, -32768, 32767, -32768, 32767, 255, 128],
    [0, 1, -1, -15, 273, 0, 17, 61],
  ],
  [
    [15, 15, -15, -16, -17, 400, -32768, 32767, -32768, 32767, 1, 255],
    [15, 15, -15, -15, -16, -16, 19, 128],
  ],
  [
    [1, 0, -16, -15, -15, 273, 0, 20, 0, 20, 128, 0],
    [1, 1, -16, -16, -15, 272, 146, 7],
  ],
  [
    [-14, -15, 0, -1, 32767, 32767, 0, 20, 0, 20, 255, 128],
    [-13, -15, -1, -2, -16, -16, 17, 61],
  ],
  [
    [15, 16, -15, 1, 10, 20, 0, 20, 0, 20, 1, 255],
    [15, 15, 0, 0, 11, 19, 19, 128],
  ],
  [
    [14, 127, 14, -128, 9, 271, 0, 20, 0, 20, 0, 1],
    [14, 15, 14, 14, 10, 272, 18, 216],
  ],
  [
    [0, -16, 1, 127, -15, 273, 0, 20, 0, 20, 128, 0],
    [0, -14, 1, 14, -16, -16, 146, 7],
  ],
];

function executeVector(input) {
  const [
    phaseX,
    velocityX,
    phaseY,
    velocityY,
    x,
    y,
    minX,
    maxX,
    minY,
    maxY,
    startAdd,
    startIndex,
  ] = input;
  const cloud = { phaseX, velocityX, phaseY, velocityY, x, y };
  const bounds = { minX, maxX, minY, maxY };
  let addend = startAdd,
    index = startIndex;
  const keys = (axis) =>
    axis === "x" ? ["phaseX", "velocityX"] : ["phaseY", "velocityY"];
  moveOriginalWeatherCloud({
    readAxis(axis) {
      return keys(axis).map((key) => cloud[key]);
    },
    writeAxis(axis, pair) {
      keys(axis).forEach((key, i) => {
        cloud[key] = pair[i];
      });
    },
    read(key) {
      return cloud[key];
    },
    write(key, value) {
      cloud[key] = value;
    },
    bound(key) {
      return bounds[key];
    },
    nextByte() {
      const value = (TABLE[index] + addend) & 255;
      addend = (addend + 0x89) & 255;
      index = value;
      return value;
    },
  });
  return [
    cloud.phaseX,
    cloud.velocityX,
    cloud.phaseY,
    cloud.velocityY,
    cloud.x,
    cloud.y,
    addend,
    index,
  ];
}

test("248A actual-instruction vectors preserve byte/word wrap, clamp, pull and world wrap", () => {
  for (const [input, expected] of VECTORS)
    assert.deepEqual(executeVector(input), expected);
});

function scenario(cloud) {
  return {
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
    weatherClouds: [
      cloud,
      ...Array.from({ length: 15 }, () => ({ status: 0 })),
    ],
    weatherCloudBounds: { minX: -16, maxX: 400, minY: -16, maxY: 400 },
  };
}

test("2459 expiry performs reload/dirty then two RNG calls and 248A writes", () => {
  const sc = scenario({
    status: 0x80,
    timer: 1,
    interval: 16,
    phaseX: 14,
    velocityX: 0,
    phaseY: -14,
    velocityY: 0,
    x: 400,
    y: -16,
  });
  const bytes = [0, 2];
  const rng = {
    calls: 0,
    nextByte() {
      return bytes[this.calls++];
    },
  };
  assert.equal(tickOriginalStrategicWeather(sc, rng), true);
  assert.deepEqual(sc.weatherClouds[0], {
    status: 0x81,
    timer: 16,
    interval: 16,
    phaseX: 13,
    velocityX: -1,
    phaseY: -13,
    velocityY: 1,
    x: 400,
    y: -16,
  });
  assert.equal(rng.calls, 2);
});

test("248A uses narrowed current bounds, but physical wrap remains -16/400 and -16/272", () => {
  const sc = scenario({
    status: 0x80,
    timer: 1,
    interval: 1,
    phaseX: 0,
    velocityX: 0,
    phaseY: 0,
    velocityY: 0,
    x: 9,
    y: 21,
  });
  sc._disasterBounds = { minX: 10, maxX: 10, minY: 10, maxY: 10 };
  const rng = { nextByte: () => 3 };
  tickOriginalStrategicWeather(sc, rng);
  assert.equal(sc.weatherClouds[0].velocityX, 1);
  assert.equal(sc.weatherClouds[0].velocityY, -1);
  assert.equal(sc.weatherClouds[0].x, 9);
  assert.equal(sc.weatherClouds[0].y, 21);
});

test("248A failure preserves prior DEC/reload/dirty and immediate axis writes", () => {
  const cloud = {
    status: 0x80,
    timer: 1,
    interval: 7,
    phaseX: 14,
    velocityX: 0,
    phaseY: 0,
    velocityY: 0,
    x: 4,
    y: 5,
  };
  const sc = scenario(cloud);
  const rng = {
    calls: 0,
    nextByte() {
      if (this.calls++) throw new Error("second RNG unavailable");
      return 0;
    },
  };
  assert.throws(
    () => tickOriginalStrategicWeather(sc, rng),
    /second RNG unavailable/,
  );
  assert.deepEqual(cloud, {
    status: 0x81,
    timer: 7,
    interval: 7,
    phaseX: 13,
    velocityX: -1,
    phaseY: 0,
    velocityY: 0,
    x: 4,
    y: 5,
  });
  assert.equal(rng.calls, 2);
});

test("missing current bounds stops only at first 24A7 read after two axes", () => {
  const cloud = {
    status: 0x80,
    timer: 1,
    interval: 7,
    phaseX: 0,
    velocityX: 0,
    phaseY: 0,
    velocityY: 0,
    x: 4,
    y: 5,
  };
  const sc = scenario(cloud);
  delete sc.weatherCloudBounds;
  const rng = {
    calls: 0,
    nextByte() {
      this.calls++;
      return 3;
    },
  };
  assert.throws(() => tickOriginalStrategicWeather(sc, rng), /minX at 24A7/);
  assert.equal(rng.calls, 2);
  assert.equal(cloud.status, 0x81);
  assert.equal(cloud.timer, 7);
});
