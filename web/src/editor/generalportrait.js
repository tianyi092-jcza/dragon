// Web authoring writer only: bind or clear an uploaded portrait asset id on one chapter
// general (事项④ Web 产品决定，用户裁决 2026-10-09，非原版机制). The numeric portrait
// byte is never touched (kao fallback intact); portraitKey is additive metadata resolved
// at trial boot, so the Q69 asset gate keeps checking bytes and seals stay valid.
import { BUILTIN_GAME_ID } from "../content/authoring/gamesource.js";
export function setGeneralPortrait(game, chapterId, generalIdx, portraitKey) {
  if (game?.gameId === BUILTIN_GAME_ID) throw new RangeError("內置原件唯讀，請先複製");
  if (typeof chapterId !== "string" || !game.chapterOrder?.includes(chapterId) || !Object.hasOwn(game.chapters ?? {}, chapterId) || game.chapters[chapterId].chapterId !== chapterId) throw new RangeError("章節身份不符");
  const state = game.chapters[chapterId].state;
  if (!Array.isArray(state?.generals)) throw new TypeError("缺少武將來源");
  const slot = state.generals.findIndex((g) => g?.idx === generalIdx);
  if (slot < 0) throw new RangeError("武將槽不符");
  if (portraitKey !== null && (typeof portraitKey !== "string" || !/^[A-Za-z]{1,32}$/.test(portraitKey))) throw new TypeError("頭像編號須為 1..32 個英文字母");
  const record = state.generals[slot];
  if ((record.portraitKey ?? null) === portraitKey) return game;
  const next = structuredClone(game), target = next.chapters[chapterId].state.generals[slot];
  if (portraitKey === null) delete target.portraitKey;
  else target.portraitKey = portraitKey;
  return next;
}
