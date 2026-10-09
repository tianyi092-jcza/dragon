// Web editor display metadata only. No rule/default/identity rewriting.
import { checkGameName } from "../content/authoring/gamesource.js";
export function normalizeGameMetadata(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !["name", "introduction"].includes(k)))
    throw new RangeError("遊戲資料僅接受名稱與簡介");
  const text = (value, limit) => {
    if (typeof value !== "string") throw new RangeError("名稱與簡介必須為文字");
    return checkGameName(value.trim().normalize("NFC"), limit);
  };
  const name = text(input.name, 8), introduction = text(input.introduction, 20);
  if (!name) throw new RangeError("遊戲名稱不可空白");
  return { name, introduction };
}
export function checkLocalDraftName(game, metadata, records) {
  // ownerId is only the existing local placeholder, NOT authenticated identity.
  for (const other of records) {
    if (other.gameId === game.gameId || other.ownerId !== game.localModel.ownerId) continue;
    const name = typeof other.metadata?.name === "string" ? other.metadata.name.trim().normalize("NFC") : "";
    if (name === metadata.name) throw new RangeError("同一本地建立者占位值已有此名稱");
  }
}
export function summarizeLocalDraft(game) {
  return { gameId: game.gameId, metadata: game.metadata, ownerId: game.localModel.ownerId,
    draftRevision: game.localModel.draftRevision, createdAt: game.localModel.createdAt ?? null,
    modifiedAt: game.localModel.modifiedAt ?? null, sourceRef: game.sourceRef,
    chapterCount: game.chapterOrder.length, cityCount: Object.keys(game.cities).length,
    waterGroupCount: (game.map.waterGroups ?? []).length, editable: game.gameId !== "wolong-builtin" };
}
