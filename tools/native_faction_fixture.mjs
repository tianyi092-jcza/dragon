// Test-only explicit 22×40h source builder. Never used by product/runtime code.
import assert from "node:assert/strict";

const put16 = (raw, offset, value) => {
  raw[offset] = value & 0xff;
  raw[offset + 1] = (value >>> 8) & 0xff;
};
const put24 = (raw, offset, value) => {
  value &= 0xffffff;
  put16(raw, offset, value);
  raw[offset + 2] = value >>> 16;
};

const recordHex = (sc, slot, extraRecords) => {
  const raw = new Uint8Array(64);
  const faction = sc.factions[slot];
  // Unused synthetic slots must follow the native no-diplomat sentinel rather
  // than accidentally entering the still-unclosed 3E96 path.
  raw[0x16] = 0xff;
  raw[0x17] = 0xff;
  raw[0x19] = 0xff;
  raw[0x2a] = 0xff;
  if (faction) {
    raw[0] = faction.attr ?? (faction.active === false ? 0 : 0x80);
    raw[1] = faction.monarch_idx ?? slot;
    raw[2] = faction.advisor_idx ?? 0x7f;
    raw[3] = faction.capital ?? 0xff;
    put16(raw, 4, faction.reserve_cav ?? 0);
    put16(raw, 6, faction.reserve_arc ?? 0);
    put16(raw, 8, faction.reserve_inf ?? 0);
    raw[0x14] = faction.n_legions ?? 0;
    raw[0x16] = faction.strategic_city_primary ?? 0xff;
    raw[0x17] = faction.strategic_city_secondary ?? 0xff;
    raw[0x18] = faction.nativeGeneralCount ?? 0;
    raw[0x19] = faction.target_faction ?? 0xff;
    put24(raw, 0x1a, faction.monthly_reserve_upkeep ?? 0);
    raw[0x1d] = faction.legion_morale_cap ?? 0;
    raw[0x1e] = faction.talk_style ?? 0;
    put24(raw, 0x20, faction.money ?? 0);
    raw[0x23] = faction.n_cities ?? 0;
    raw[0x28] = faction.bellicosity ?? 0;
    raw[0x2a] = faction.diplomat_idx ?? 0xff;
    raw[0x3e] = faction.march_marker_style ?? 0;
  }
  if (Object.hasOwn(extraRecords, slot)) {
    const supplied = extraRecords[slot];
    assert(supplied instanceof Uint8Array && supplied.length === 64);
    raw.set(supplied);
  }
  return Buffer.from(raw).toString("hex");
};

export function attachSyntheticNativeFactionSource(sc, extraRecords = {}) {
  assert(!Object.hasOwn(sc, "nativeFactionSlotRaw"));
  assert(Array.isArray(sc.factions) && sc.factions.length <= 22);
  const records = Array.from({ length: 22 }, (_, slot) =>
    recordHex(sc, slot, extraRecords),
  );
  sc.nativeFactionSlotRaw = records;
  const declared = sc.factions.length;
  const sourceDiplomacy = Array.isArray(sc.diplomacy)
    ? sc.diplomacy
    : Array.from({ length: declared }, (_, actor) =>
        Array.from({ length: declared }, (_, target) =>
          actor === target ? 0xff : 0x80,
        ),
      );
  const diplomacy = new Uint8Array(24 * 24).fill(0x80);
  for (let actor = 0; actor < 24; actor++) diplomacy[actor * 24 + actor] = 0xff;
  for (let actor = 0; actor < Math.min(24, sourceDiplomacy.length); actor++)
    for (
      let target = 0;
      target < Math.min(24, sourceDiplomacy[actor]?.length ?? 0);
      target++
    )
      diplomacy[actor * 24 + target] = sourceDiplomacy[actor][target];
  sc.diplomacy = Array.from({ length: declared }, (_, actor) =>
    Array.from(
      { length: declared },
      (_, target) => diplomacy[actor * 24 + target],
    ),
  );
  sc.nativeDiplomacyRaw = Buffer.from(diplomacy).toString("hex");
  sc.nativeStrategicEventRaw = "00".repeat(0x400);
  const policy = new Uint8Array(0x10);
  policy[0] = sc.tax ?? 18;
  policy[8] = sc.next_tax ?? policy[0];
  for (let index = 0; index < 3; index++) {
    const current = Math.trunc((sc.conscription?.[index] ?? 0) / 10);
    const next = Math.trunc((sc.next_conscription?.[index] ?? 0) / 10);
    put16(policy, 2 + index * 2, current);
    put16(policy, 10 + index * 2, next);
  }
  sc.tax = policy[0];
  sc.conscription = [0, 1, 2].map(
    (index) => (policy[2 + index * 2] | (policy[3 + index * 2] << 8)) * 10,
  );
  sc.next_tax = policy[8];
  sc.next_conscription = [0, 1, 2].map(
    (index) => (policy[10 + index * 2] | (policy[11 + index * 2] << 8)) * 10,
  );
  sc.nativeMonthlyPolicyRaw = Buffer.from(policy).toString("hex");
  // P40：fresh v2 的 C18 缓存初值 = 8CAE 载入的城记录 byte+0x18；测试夹具
  // 提供 192×32B 全零记录（仅 +0x18 被 fresh 初始化消费；+0x01 owner 语义
  // 属 P30/P34 别名夹具，这里不声明）。
  sc.nativeCityRecordRaw = Array.from({ length: 192 }, () =>
    Buffer.alloc(32).toString("hex"),
  );
  return sc;
}
