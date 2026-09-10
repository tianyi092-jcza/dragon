// 战略雨云、火灾/暴动对象与统一天灾损害。规则来源：KI.EXE 0x2286、
// 0x22DB、0x237E、0x23FF、0x2438、0x2459、0x248A、0x24FF、
// 0x2533、0x34A6、0x34B1、0x3EFD→0x4269。
// Canvas 只读取这里推进后的帧；原版 0x2533 在绘制时消费 dirty bit，
// Web 将同一次 0x2459 更新的帧推进折叠到规则 tick，避免渲染修改状态。

export const DISASTER_OBJECT_COUNT = 16;
export const WEATHER_CLOUD_COUNT = 16;
export const WEATHER_CLOUD_FRAMES = 8;
export const WEATHER_GLOBAL_BOUNDS = Object.freeze({
  minX: -16,
  maxX: 400,
  minY: -16,
  maxY: 400,
});

const trunc = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
};
const byte = (value, fallback = 0) => trunc(value, fallback) & 0xff;
const signedByte = (value, fallback = 0) => (byte(value, fallback) << 24) >> 24;
const signedWord = (value, fallback = 0) =>
  (trunc(value, fallback) << 16) >> 16;
const cityByte = (value) => Math.max(0, Math.min(0xff, trunc(value)));

function normalizeCloud(cloud) {
  return {
    active: cloud?.active !== false,
    x: signedWord(cloud?.x),
    y: signedWord(cloud?.y),
    phaseX: signedByte(cloud?.phaseX),
    velocityX: signedByte(cloud?.velocityX),
    phaseY: signedByte(cloud?.phaseY),
    velocityY: signedByte(cloud?.velocityY),
    timer: byte(cloud?.timer, 1),
    interval: byte(cloud?.interval, 0x10),
    group: byte(cloud?.group),
    frame: byte(cloud?.frame) & 7,
  };
}

function normalizeDisasterMapObject(object) {
  if (!object || object.active === false || object.active === 0) return null;
  const group = byte(object.group, object.kind);
  return {
    active: true,
    kind: byte(object.kind, group),
    group,
    x: signedWord(object.x),
    y: signedWord(object.y),
    // 0x23FF明确写1，但+6/+7的完整用途仍未知，故保留raw名而不臆造语义。
    raw6: byte(object.raw6, 1),
    raw7: byte(object.raw7, 1),
    timer: byte(object.timer, 1),
    interval: byte(object.interval, 0x10),
    frame: byte(object.frame, 1) & 7,
  };
}

/**
 * DS:0x2040..0x213F 是固定16槽。旧Web快照曾保存紧凑数组；加载时
 * 只可按原顺序放回低槽并补null，后续删除不能再压缩槽号。
 */
export function normalizeDisasterMapObjectState(scenario) {
  if (!scenario) return [];
  const source = Array.isArray(scenario.disasterMapObjects)
    ? scenario.disasterMapObjects
    : [];
  scenario.disasterMapObjects = Array.from(
    { length: DISASTER_OBJECT_COUNT },
    (_, slot) => normalizeDisasterMapObject(source[slot]),
  );
  return scenario.disasterMapObjects;
}

/**
 * 旧 Web IndexedDB 快照没有雨云字段时，从同章节 SINARIO 模板补回
 * DS:0x2140（文件 +0x21C0）的 16 条原始记录。
 */
export function normalizeWeatherCloudState(
  scenario,
  fallbackClouds = [],
  fallbackBounds = null,
) {
  if (!scenario) return [];
  const bounds =
    scenario.weatherCloudBounds ?? fallbackBounds ?? WEATHER_GLOBAL_BOUNDS;
  scenario.weatherCloudBounds = {
    minX: signedWord(bounds.minX, WEATHER_GLOBAL_BOUNDS.minX),
    maxX: signedWord(bounds.maxX, WEATHER_GLOBAL_BOUNDS.maxX),
    minY: signedWord(bounds.minY, WEATHER_GLOBAL_BOUNDS.minY),
    maxY: signedWord(bounds.maxY, WEATHER_GLOBAL_BOUNDS.maxY),
  };
  const current = Array.isArray(scenario.weatherClouds)
    ? scenario.weatherClouds
    : [];
  const source = current.length ? current : fallbackClouds;
  scenario.weatherClouds = (Array.isArray(source) ? source : [])
    .slice(0, WEATHER_CLOUD_COUNT)
    .map(normalizeCloud);
  return scenario.weatherClouds;
}

function tickAnimationTimer(object, initialFrame = 0) {
  const timer = (byte(object.timer, 1) - 1) & 0xff;
  object.timer = timer;
  if (timer !== 0) return false;
  object.timer = byte(object.interval, 0x10);
  object.interval = byte(object.interval, 0x10);
  object.frame = (byte(object.frame, initialFrame) + 1) & 7;
  return true;
}

/** KI.EXE 0x24FF：单轴随机加速度、±15限速与十五分之一格残差。 */
function stepCloudAxis(phase, velocity, randomByte) {
  let nextVelocity = signedByte(velocity);
  const jitter = randomByte & 7;
  if (jitter <= 2) nextVelocity = signedByte(nextVelocity + jitter - 1);
  if (nextVelocity < -15) nextVelocity = -15;
  if (nextVelocity > 15) nextVelocity = 15;

  let nextPhase = signedByte(signedByte(phase) + nextVelocity);
  let delta = 0;
  if (nextPhase >= 15) {
    nextPhase = signedByte(nextPhase - 15);
    delta = 1;
  } else if (nextPhase <= -15) {
    nextPhase = signedByte(nextPhase + 15);
    delta = -1;
  }
  return { phase: nextPhase, velocity: nextVelocity, delta };
}

function stormBounds(scenario) {
  // 场景头+0x32..+0x39是月初复位边界；官方值的maxY=400与
  // 0x248A物理Y回绕上限272并不相同，二者不能合并。
  const bounds =
    scenario?._disasterBounds ??
    scenario?.weatherCloudBounds ??
    WEATHER_GLOBAL_BOUNDS;
  return {
    minX: signedWord(bounds.minX, WEATHER_GLOBAL_BOUNDS.minX),
    maxX: signedWord(bounds.maxX, WEATHER_GLOBAL_BOUNDS.maxX),
    minY: signedWord(bounds.minY, WEATHER_GLOBAL_BOUNDS.minY),
    maxY: signedWord(bounds.maxY, WEATHER_GLOBAL_BOUNDS.maxY),
  };
}

/** KI.EXE 0x248A：一朵雨云的一次 16-tick 移动。固定消费两个 RNG 字节。 */
function moveCloud(cloud, bounds, rng) {
  const horizontal = stepCloudAxis(
    cloud.phaseX,
    cloud.velocityX,
    rng.nextByte(),
  );
  cloud.phaseX = horizontal.phase;
  cloud.velocityX = horizontal.velocity;
  cloud.x = signedWord(cloud.x + horizontal.delta);

  const vertical = stepCloudAxis(cloud.phaseY, cloud.velocityY, rng.nextByte());
  cloud.phaseY = vertical.phase;
  cloud.velocityY = vertical.velocity;
  cloud.y = signedWord(cloud.y + vertical.delta);

  // 0x24A2..0x24FB：先依据灾区矩形施加回拉，再执行世界环绕；
  // 回拉量最后才加到速度，因此允许短暂出现 ±16。
  let pullX = 0;
  if (cloud.x < bounds.minX) pullX = 1;
  if (cloud.x > bounds.maxX) pullX = -1;
  if (cloud.x < -16) cloud.x = 400;
  else if (cloud.x > 400) cloud.x = -16;

  let pullY = 0;
  if (cloud.y < bounds.minY) pullY = 1;
  if (cloud.y > bounds.maxY) pullY = -1;
  if (cloud.y < -16) cloud.y = 272;
  else if (cloud.y > 272) cloud.y = -16;

  cloud.velocityX = signedByte(cloud.velocityX + pullX);
  cloud.velocityY = signedByte(cloud.velocityY + pullY);
}

/**
 * KI.EXE 0x2459：每个战略更新扫描 16 个定点灾害对象，再扫描 16 朵雨云。
 * 只有后半区雨云调用 0x248A，因此一次云移动严格按槽序消费 32 个 RNG 字节。
 */
export function tickStrategicWeather(scenario, rng) {
  if (!scenario) return false;
  let changed = false;

  // DS:0x2040..0x213F：火灾/暴动对象只推进八相动画，不移动、不消费 RNG。
  for (const object of (scenario.disasterMapObjects ?? []).slice(
    0,
    DISASTER_OBJECT_COUNT,
  )) {
    if (!object || object.active === false) continue;
    if (tickAnimationTimer(object, 1)) changed = true;
  }

  const clouds = Array.isArray(scenario.weatherClouds)
    ? scenario.weatherClouds
    : [];
  if (!clouds.length) return changed;
  if (!rng || typeof rng.nextByte !== "function") {
    throw new TypeError(
      "strategic weather tick requires canonical original RNG",
    );
  }
  const bounds = stormBounds(scenario);
  for (const cloud of clouds.slice(0, WEATHER_CLOUD_COUNT)) {
    if (!cloud || cloud.active === false) continue;
    if (!tickAnimationTimer(cloud)) continue;
    moveCloud(cloud, bounds, rng);
    changed = true;
  }
  return changed;
}

/**
 * KI.EXE 0x4269：城池完成0x4194治理后，每次轮到都承受+0x15统一天灾强度。
 * 防灾先吸收；溢出同步扣上升值、生产力与城兵，所有除法均为无符号下取整。
 */
export function applyDisasterDamageToCity(city) {
  if (!city) return false;
  const strength = cityByte(city.disaster_event);
  const defence = cityByte(city.defence);
  if (defence >= strength) {
    const nextDefence = defence - strength;
    const changed = nextDefence !== defence;
    city.defence = nextDefence;
    return changed;
  }

  const spill = strength - defence;
  city.defence = 0;
  city.growth = Math.max(0, cityByte(city.growth) - spill);

  const production = Math.max(0, Math.min(0xffff, trunc(city.prod)));
  const productionHigh = (production >>> 8) & 0xff;
  city.prod = production - ((spill * productionHigh) >>> 2);
  city.troops = Math.max(0, cityByte(city.troops) - (spill >>> 1));
  return strength > 0;
}

// 兼容既有天气验证/调用名；0x4269实际统一处理暴雨、火灾与暴动的+0x15。
export const applyStormDamageToCity = applyDisasterDamageToCity;
