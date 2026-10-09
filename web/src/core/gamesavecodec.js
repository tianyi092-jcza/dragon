// Web engineering §8.2. JSON storage only, NOT scenario/release validity or restoration.
const headerKeys = ["gameId", "releaseId", "releaseOrdinal", "chapterId", "manifestDigest", "slot"];
export function saveIdentity(value) {
  if (typeof value !== "string" || !value.length || value.length > 256) throw new TypeError("invalid save identity");
  for (const char of value) { const code = char.codePointAt(0); if (code < 32 || code === 127 || code >= 0xd800 && code <= 0xdfff) throw new TypeError("invalid save identity character"); }
  return value;
}
export function saveInteger(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) throw new TypeError("invalid save integer");
  return value;
}
export function saveDigest(value) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError("invalid save digest"); return value; }
function plain(value) { return value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
export function saveObject(value, keys) {
  if (!plain(value)) throw new TypeError("invalid save object");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string") || Object.values(descriptors).some(d => !d.enumerable || !Object.hasOwn(d, "value"))) throw new TypeError("save accessor/hidden property");
  if (keys && (Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key)))) throw new TypeError("invalid save fields");
  return value;
}
export function saveJSON(value) {
  const ancestors = new Set();
  function encode(item) {
    if (item === null || typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") { if (!Number.isFinite(item) || Object.is(item, -0)) throw new TypeError("lossy save number"); return JSON.stringify(item); }
    if (typeof item !== "object" || ancestors.has(item)) throw new TypeError("non-JSON or cyclic save");
    ancestors.add(item); let result;
    if (Array.isArray(item)) {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Reflect.ownKeys(descriptors).length !== item.length + 1) throw new TypeError("save array extra/holes");
      const values = [];
      for (let i = 0; i < item.length; i++) { const d = descriptors[i]; if (!d || !d.enumerable || !Object.hasOwn(d, "value")) throw new TypeError("save array hole/accessor"); values.push(encode(d.value)); }
      result = "[" + values.join(",") + "]";
    } else {
      saveObject(item); result = "{" + Object.keys(item).sort().map(key => JSON.stringify(key) + ":" + encode(item[key])).join(",") + "}";
    }
    ancestors.delete(item); return result;
  }
  return encode(value);
}
export function parseSaveJSON(text) {
  if (typeof text !== "string") throw new TypeError("invalid save JSON text");
  let value; try { value = JSON.parse(text); } catch (cause) { throw new TypeError("invalid save JSON", { cause }); }
  if (saveJSON(value) !== text) throw new TypeError("noncanonical save JSON"); return value;
}
export function gameSaveKeys(gameId, slot) {
  const prefix = "game:" + encodeURIComponent(saveIdentity(gameId)) + ":";
  return { catalog: prefix + "catalog-v3", record: prefix + "record:" + saveInteger(slot) };
}
function header(value, gameId) {
  saveIdentity(value.gameId); if (value.gameId !== gameId) throw new TypeError("save game mismatch");
  saveIdentity(value.releaseId); saveIdentity(value.chapterId); saveInteger(value.releaseOrdinal); saveInteger(value.slot); saveDigest(value.manifestDigest);
}
export function saveInput(value, gameId) {
  saveObject(value, [...headerKeys, "snapshot"]); header(value, gameId); saveObject(value.snapshot);
  return parseSaveJSON(saveJSON(value)); // Snapshot captured before any await; no JSON-loss fallback.
}
export function saveRecord(text, gameId) {
  const record = parseSaveJSON(text); saveObject(record, ["format", ...headerKeys, "snapshot", "recordId", "writeRevision"]);
  if (record.format !== 3) throw new TypeError("invalid save format"); header(record, gameId); saveIdentity(record.recordId); saveInteger(record.writeRevision, 1); saveObject(record.snapshot); return record;
}
export function saveSummary(record, bodyDigest) {
  return { gameId: record.gameId, slot: record.slot, recordId: record.recordId, writeRevision: record.writeRevision, releaseId: record.releaseId,
    releaseOrdinal: record.releaseOrdinal, chapterId: record.chapterId, manifestDigest: record.manifestDigest, bodyDigest: saveDigest(bodyDigest) };
}
export function saveCatalog(value, gameId) {
  if (value === undefined) return { format: 3, gameId, nextWriteRevision: 1, rows: [] };
  saveObject(value, ["format", "gameId", "nextWriteRevision", "rows"]);
  if (value.format !== 3 || value.gameId !== gameId || !Array.isArray(value.rows)) throw new TypeError("invalid save catalog");
  saveInteger(value.nextWriteRevision, 1); saveJSON(value); let previous = -1; const identities = new Set();
  for (const row of value.rows) {
    saveObject(row, [...headerKeys, "recordId", "writeRevision", "bodyDigest"]); header(row, gameId); saveIdentity(row.recordId); saveInteger(row.writeRevision, 1); saveDigest(row.bodyDigest);
    if (row.slot <= previous || row.writeRevision >= value.nextWriteRevision || identities.has(row.recordId)) throw new TypeError("invalid save catalog order/revision/identity"); previous = row.slot; identities.add(row.recordId);
  }
  return value;
}
export function saveToken(record, bodyText, bodyDigest) {
  return Object.freeze({ gameId: record.gameId, slot: record.slot, recordId: record.recordId, writeRevision: record.writeRevision,
    savedReleaseId: record.releaseId, bodyDigest: saveDigest(bodyDigest), bodyText });
}
export function checkSaveToken(value, gameId) {
  saveObject(value, ["gameId", "slot", "recordId", "writeRevision", "savedReleaseId", "bodyDigest", "bodyText"]);
  const copy = parseSaveJSON(saveJSON(value)), record = saveRecord(copy.bodyText, gameId);
  if (saveJSON(saveToken(record, copy.bodyText, copy.bodyDigest)) !== saveJSON(copy)) throw new TypeError("save token identity mismatch"); return copy;
}
export async function hashSaveText(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}
