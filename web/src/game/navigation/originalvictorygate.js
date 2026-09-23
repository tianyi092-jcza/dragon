// KI.EXE 1D0B 首指令统一胜利门（D2A 存活势力计数）与 1D20 胜利分支。
// 证据（capstone 现刷，re-notes-ai-chain/journal P36）：
// - 1D0B 首指令 `cmp byte cs:[0x0D2A],1; je 1D20`；
// - D2A 初始化=8CAE 从章节/存档记录+0x3A 载入（含在 CS:0xCF0..0x0D2A 的
//   0x3B 字节块内）；官方四章 record[0x3A]=0x16/0x0B/0x06/0x04=活跃势力数；
// - 唯一写者 4FE8 `dec byte cs:[0xD2A]` 在 4FCE 势力灭亡处理内（同体 4FD9
//   清 F00 attr）；玩家灭亡不 dec，直接 al=1 → 1CB1 败北。
//   由「初值=活跃数 + 唯一写者仅在灭亡时 dec 且同步清 attr」得不变式：
//   D2A ≡ attr&0x80 的势力槽计数；Web 以活计数实现，不引入静态字节。
// - 1D20 胜利分支：CDE beep → 8810(CX=0x4B=TALK[75], AL=0x93) → 87FF 玩家
//   君主 → 8810(CX=0x197 选择器 → TALK[414+talk_idx]) → AL=2 → 1CB1
//   （ss/sp←cs:[9903]/[9901] 换栈长跳回主循环，exit2 → YNVSHELL 分派
//   D7END.EXE 循环播放 END_S1..12）。全链 0 RNG（P32 静态审计）。
// file offset = VA + 0x200。
import { hasNativeFactionSlots, nativeFactionAt } from "../nativefactions.js";

/** 1D0B 胜利判定：TALK[75]（8810 CX=0x4B）。 */
export const NATIVE_UNIFICATION_TALK_INDEX = 0x4b;
/** 1D3A 君主个性行选择器（075B 展开 = TALK[414+talk_idx]）。 */
export const NATIVE_UNIFICATION_MONARCH_SELECTOR = 0x197;

function missing(at) {
  throw new RangeError(
    `Web engineering Uncovered native victory gate at ${at}`,
  );
}

/**
 * D2A 活计数等价物：attr&0x80 的固定 22 槽计数（含玩家槽）。
 * 只在 native 场景调用；缺槽表/坏槽一律 fail-closed。
 */
export function countNativeAliveFactions(sc) {
  if (!hasNativeFactionSlots(sc)) missing("1D0B faction slots");
  let alive = 0;
  for (let slot = 0; slot < 22; slot++) {
    const faction = nativeFactionAt(sc, slot, "1D0B D2A live count");
    if (
      !Number.isInteger(faction.attr) ||
      faction.attr < 0 ||
      faction.attr > 0xff
    )
      missing(`1D0B slot ${slot} attr`);
    if (faction.attr & 0x80) alive++;
  }
  return alive;
}

/**
 * 87FF+0x4240（实锤，与 scenarionegotiation 同一合同）：CFD 玩家势力指针
 * → +1 君主号 → 武将记录。胜利分支需要君主记录显示个性行。
 */
export function resolveNativeVictoryMonarch(sc) {
  const pointer = sc?.nativePlayerFactionPointer;
  if (!Number.isInteger(pointer) || pointer % 0x40 || pointer >= 22 * 0x40)
    missing("87FF aligned player faction pointer");
  const faction = nativeFactionAt(sc, pointer >>> 6, "87FF player faction");
  const monarchIndex = faction.monarch_idx;
  if (
    !Number.isInteger(monarchIndex) ||
    monarchIndex < 0 ||
    monarchIndex > 0xff
  )
    missing("87FF monarch_idx");
  const general = sc?.generals?.[monarchIndex];
  if (!general || general.idx !== monarchIndex)
    missing(`87FF monarch general ${monarchIndex}`);
  return general;
}
