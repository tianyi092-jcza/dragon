// Opt-in engineering backup boundary. Explicit expected tuple is NOT authentication.
// No storage access, legacy fallback, release lookup, live installation or deletion.
import { ORIGINAL_RULE_PROFILE } from '../content/ruleprofile.js';
import { encodeSaveFile, decodeSaveFile, MAX_SAVE_FILE_BYTES } from './saveexchange.js';
import { saveObject, saveInput, saveRecord, saveJSON, saveDigest, hashSaveText } from './gamesavecodec.js';
const format = 'wolong-game-save', identityFields = ['gameId', 'releaseId', 'releaseOrdinal', 'chapterId', 'manifestDigest'];
export function createGameSaveExchange({ identity, context }) {
  saveObject(identity, identityFields);
  const bound = saveInput({ ...identity, slot: 0, snapshot: {} }, identity.gameId);
  const capturedContext = { data: context.data, content: context.content, world: context.world };
  function match(record) {
    for (const field of identityFields) if (record[field] !== bound[field]) throw new TypeError('backup identity mismatch');
    if (capturedContext.content.chapter(record.snapshot.scenario_idx).id !== bound.chapterId) throw new TypeError('backup snapshot chapter mismatch');
  }
  async function admit(record) {
    match(record);
    // Preserve the existing rule/RNG/JSON and actual detached assembly path.
    const legacyText = await encodeSaveFile(record.snapshot, capturedContext);
    return decodeSaveFile(legacyText, capturedContext);
  }
  async function decode(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_SAVE_FILE_BYTES) throw new TypeError('backup file too large');
    let envelope;
    try { envelope = JSON.parse(text); } catch (cause) { throw new TypeError('invalid backup JSON', { cause }); }
    saveObject(envelope, ['format', 'version', 'rules', 'bodyText', 'bodyDigest']);
    if (envelope.format !== format || envelope.version !== 1 || saveJSON(envelope.rules) !== saveJSON(ORIGINAL_RULE_PROFILE)) throw new TypeError('unsupported game backup / rules');
    saveDigest(envelope.bodyDigest);
    const record = saveRecord(envelope.bodyText, bound.gameId); match(record);
    if (await hashSaveText(envelope.bodyText) !== envelope.bodyDigest) throw new TypeError('backup digest mismatch');
    const snapshot = await admit(record);
    const input = saveInput({ gameId: record.gameId, releaseId: record.releaseId, releaseOrdinal: record.releaseOrdinal,
      chapterId: record.chapterId, manifestDigest: record.manifestDigest, slot: record.slot, snapshot }, bound.gameId);
    // Origin is informational; a receiving store assigns its own recordId/writeRevision.
    return { input, origin: Object.freeze({ slot: record.slot, recordId: record.recordId, writeRevision: record.writeRevision }) };
  }
  async function encode(value) {
    const record = saveRecord(saveJSON(value), bound.gameId); match(record); // Capture before await; no lossy JSON fallback/getter.
    await admit(record);
    const bodyText = saveJSON(record), bodyDigest = await hashSaveText(bodyText);
    const text = saveJSON({ format, version: 1, rules: ORIGINAL_RULE_PROFILE, bodyText, bodyDigest });
    if (new TextEncoder().encode(text).length > MAX_SAVE_FILE_BYTES) throw new TypeError('backup file too large');
    return text;
  }
  return Object.freeze({ encode, decode });
}
