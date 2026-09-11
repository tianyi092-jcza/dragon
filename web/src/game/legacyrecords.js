// 原始记录兼容读取边界。native内容编译器生成这些兼容字节；AI不解析DOS文件。
// 保留现有初始raw/运行态字段选择，不在结构迁移中改变生命周期或别名语义。
export function cityRawBytes(city) {
  if (typeof city?.raw !== "string") return null;
  const bytes = city.raw.match(/../g);
  return bytes?.length >= 0x20
    ? Uint8Array.from(bytes, (value) => Number.parseInt(value, 16))
    : null;
}

/** 0x28F4→0x4325 状态5的线性别名读取及外交官维护的兼容字节。 */
export function factionRawByte(sc, faction, offset, fallback = 0) {
  if (offset === 0x18 && faction) {
    const advisor =
      faction.advisor_idx == null ? null : sc.generals?.[faction.advisor_idx];
    const advisorIncluded = advisor?.faction === faction.idx ? 1 : 0;
    return Math.max(
      0,
      Math.min(0xff, (faction.n_generals ?? 0) + advisorIncluded),
    );
  }
  if (typeof faction?.raw === "string") {
    const byte = Number.parseInt(
      faction.raw.slice(offset * 2, offset * 2 + 2),
      16,
    );
    if (Number.isFinite(byte)) return byte;
  }
  return fallback;
}
