// CHAPTER-WB author input boundary. KI 67CD..6845: tax cap 100,
// three recruitment caps 10000 people, unsigned DIV 10 before word writes.
// 7C99/7DB9..7DC1 retain/enforce the keypad cap; 53A6 copies next to current.
// Applying the same input contract to both opening months is a Web decision.
import { decodePlayerOpening } from '../game/nativemonthlypolicy.js';

export function encodePlayerOpening(base, values) {
  if (!values || Object.keys(values).sort().join(',') !== 'conscription,nextConscription,tax,trust')
    throw new TypeError('Opening values require trust, tax and two recruitment arrays');
  for (const [key, max] of [['trust', 255], ['tax', 100]]) {
    if (!Number.isInteger(values[key]) || Object.is(values[key], -0) || values[key] < 0 || values[key] > max)
      throw new RangeError(`Opening ${key} must be 0..${max}`);
  }
  for (const key of ['conscription', 'nextConscription']) {
    const people = values[key];
    if (!Array.isArray(people) || people.length !== 3 || [0, 1, 2].some(i =>
      !Number.isInteger(people[i]) || Object.is(people[i], -0) || people[i] < 0 || people[i] > 10000))
      throw new RangeError(`Opening ${key} requires three people counts in 0..10000`);
  }
  const { policy } = decodePlayerOpening(base);
  const bytes = policy.raw;
  bytes[0] = values.tax;
  for (const [key, offsets] of [['conscription', [2, 4, 6]], ['nextConscription', [10, 12, 14]]]) {
    offsets.forEach((offset, i) => {
      const word = Math.floor(values[key][i] / 10);
      bytes[offset] = word & 255;
      bytes[offset + 1] = word >>> 8;
    });
  }
  return { trust: values.trust, policyRaw: bytes.map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
