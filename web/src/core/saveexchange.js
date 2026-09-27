import { ORIGINAL_RULE_PROFILE } from '../content/ruleprofile.js';
import { admitSavedScenario } from '../game/savegame.js';
import { prepareScenario } from '../game/scenarioassembly.js';

export const MAX_SAVE_FILE_BYTES = 64 * 1024 * 1024;
const format = 'wolong-web-save';

function checkJson(value, depth = 0) {
  if (depth > 128) throw new TypeError('Save nesting limit exceeded');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new TypeError('Non-finite save number');
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new TypeError('Unsafe save key');
      checkJson(child, depth + 1);
    }
  }
}

async function validate(saved, context) {
  const rng = saved?.webMeta?.originalRng;
  const byte = (n) => Number.isInteger(n) && n >= 0 && n <= 255;
  if (!rng || !Array.isArray(rng.table) || rng.table.length !== 257 ||
      !rng.table.every(byte) || !byte(rng.addend) || !byte(rng.index) ||
      !Number.isSafeInteger(rng.calls) || rng.calls < 0)
    throw new TypeError('Invalid save RNG');
  const admitted = admitSavedScenario(saved, context);
  // The exact production detached admission path; no live App/RNG is installed.
  await prepareScenario({ ...admitted, content: context.content,
    world: context.world, mode: 'restore' });
}

export async function decodeSaveFile(text, context) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_SAVE_FILE_BYTES)
    throw new TypeError('Save file too large');
  let envelope;
  try { envelope = JSON.parse(text); }
  catch (cause) { throw new TypeError('Invalid save JSON', { cause }); }
  checkJson(envelope);
  if (envelope?.format !== format || envelope.version !== 1 ||
      envelope.rules?.id !== ORIGINAL_RULE_PROFILE.id ||
      envelope.rules?.revision !== ORIGINAL_RULE_PROFILE.revision)
    throw new TypeError('Unsupported save file / rule version');
  await validate(envelope.saved, context);
  return structuredClone(envelope.saved);
}

export async function encodeSaveFile(saved, context) {
  checkJson(saved);
  const text = JSON.stringify({ format, version: 1, rules: ORIGINAL_RULE_PROFILE, saved });
  // Validate the actual JSON representation, not only structuredClone.
  await decodeSaveFile(text, context);
  return text;
}
