// 内容身份与旧scenario_idx的边界；不创建运行态、不读写本地存档。
import { loadJSON } from "../core/assets.js";

export function createContentCatalog(manifest, data) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.rules !== "ki-1995" ||
    typeof manifest.id !== "string" ||
    !manifest.id ||
    typeof manifest.revision !== "string" ||
    !manifest.revision ||
    !Array.isArray(manifest.chapters) ||
    !Array.isArray(data?.scenarios) ||
    manifest.chapters.length !== data.scenarios.length
  )
    throw new Error("unsupported or incomplete content catalog");
  const byId = new Map();
  const chapters = manifest.chapters.map((entry, index) => {
    if (
      entry.legacyScenarioIndex !== index ||
      typeof entry.id !== "string" ||
      !entry.id ||
      byId.has(entry.id) ||
      typeof entry.official !== "boolean"
    )
      throw new Error("invalid chapter identity/order");
    const chapter = Object.freeze({
      id: entry.id,
      legacyScenarioIndex: index,
      official: entry.official,
      template: data.scenarios[index],
      reference: Object.freeze({
        packId: manifest.id,
        chapterId: entry.id,
        revision: manifest.revision,
      }),
    });
    byId.set(entry.id, chapter);
    return chapter;
  });
  return Object.freeze({
    id: manifest.id,
    revision: manifest.revision,
    data, // 旧API兼容视图；新局仍必须通过createNewGameScenario复制模板。
    chapters: Object.freeze(chapters),
    chapter(indexOrId) {
      return typeof indexOrId === "string"
        ? (byId.get(indexOrId) ?? null)
        : (chapters[indexOrId] ?? null);
    },
    resolveReference(reference) {
      if (
        reference?.packId !== manifest.id ||
        reference.revision !== manifest.revision
      )
        return null;
      return byId.get(reference.chapterId) ?? null;
    },
  });
}

export async function loadBuiltinContent() {
  // 这里只读取目录/章模板；图集、地图与战斗资源仍等开局确认后才加载。
  const [manifest, data] = await Promise.all([
    loadJSON("content/builtin/catalog.json"),
    loadJSON("data.json"),
  ]);
  return createContentCatalog(manifest, data);
}
