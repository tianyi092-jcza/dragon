// 天灾/暴动 — 复刻月结随机事件链 0x22DB(天灾)+0x237E(灾区应用)+0x2286(暴动)
//
// ★原版机制（反汇编实录）
//  天灾 0x22DB: 月结时 rand&1==1(50%) 才继续；再 rand<0xC0(75%) 门控后
//    取 rand>>3 为受灾中心城索引；灾区=以该城为中心 x±5/y±5 存 [0xD22..0xD28]；
//    事件强度参数 = ((rand&7)+8)<<2 (32..60 步进4)，type=0xB 入队(0x2FBF)→TALK 战报
//  应用 0x237E(al=强度): 遍历所有城，Chebyshev 距离(相对灾区中心)≤0x14(20) 的城
//    扣 al - dist>>1 (下限0)；玩家城受损时弹 TALK 0x46 提示
//  暴动 0x2286: 逐城两段独立判定，各为 rand<0x18(≈9.4%) 且 rand&0x3F < 城稳定度
//    字节([si+0x10]/[si+0x11]) → 入队事件(type ah=1/2)
//
// ★web 映射：灾害扣 development(蝗/旱/疫对生产的经典打击面)；
//   暴动稳定度 = (200 - sim.morale)>>2 (士气越低越易暴动)，效果=兵力流失+发展受损

const RIOT_GATE = 0x18; // 24/256 ≈ 9.4%/段
const DISASTER_RADIUS = 20; // 0x14

/** u8 随机源(可注入便于测试) */
function rnd256(rng) {
  return Math.floor((rng ?? Math.random)() * 256);
}

/**
 * 月结天灾判定。命中返回战报文案，否则 null。
 * @returns {string|null}
 */
export function monthlyDisaster(sc, rng) {
  if (!(rnd256(rng) & 1)) return null; // test al,1: 50% 直接无灾
  if (rnd256(rng) >= 0xc0) return null; // rand<0xC0 门控
  const city = sc.cities[rnd256(rng) % sc.cities.length]; // 原版 rand>>3(32城), web 取模适配
  if (!city) return null;
  const strength = ((rnd256(rng) & 7) + 8) << 2; // 32..60
  // 灾区应用 0x237E: 范围内按距离扣减
  const hit = [];
  for (const c of sc.cities) {
    const dx = Math.abs(c.x - city.x) - 5;
    const dy = Math.abs(c.y - city.y) - 5;
    const d = Math.max(Math.max(dx, 0), Math.max(dy, 0));
    if (d > DISASTER_RADIUS) continue;
    const dmg = Math.max(0, strength - (d >> 1));
    if (dmg <= 0) continue;
    c.development = Math.max(-200, (c.development ?? 0) - dmg);
    hit.push(c.name);
  }
  return `天災侵襲${city.name}！（受損${hit.length}城）`;
}

/**
 * 月结暴动判定(逐城)。返回战报文案数组。
 */
export function monthlyRiots(sc, rng) {
  const out = [];
  for (const c of sc.cities) {
    if (c.faction == null || !c.sim) continue;
    if (rnd256(rng) >= RIOT_GATE) continue;
    const inst = (200 - c.sim.morale) >> 2; // 稳定度缺口
    if ((rnd256(rng) & 63) >= inst) continue;
    // 暴动效果: 兵力流失四成 + 发展受损
    c.sim.troops = Math.floor(c.sim.troops * 0.6);
    c.development = Math.max(-200, (c.development ?? 0) - 10);
    out.push(`${c.name}發生暴動！兵散發展受損`);
  }
  return out;
}

/** 月结入口: 返回全部战报文案 */
export function monthlyEvents(sc, rng) {
  const msgs = [];
  const d = monthlyDisaster(sc, rng);
  if (d) msgs.push(d);
  msgs.push(...monthlyRiots(sc, rng));
  return msgs;
}
