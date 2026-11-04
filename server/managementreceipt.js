// Private persisted envelope only. HTTP/replay results retain their old shape.
// A null association means an explicitly recorded no-op, not public visibility.
// version 1 = {operationId,generation}; version 2 adds releaseDigest. Both stay
// readable so already-persisted receipts replay byte-for-byte.
import { fail } from './security.js';
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const corrupt = () => fail(503, 'MANAGEMENT_RECEIPT_CORRUPT');
const reference = (ref, version) => {
  if (ref === null) return;
  if (ref === undefined || !ref || typeof ref !== 'object' || Array.isArray(ref)) corrupt();
  const keys = Object.keys(ref).sort().join(',');
  if (keys !== (version === 1 ? 'generation,operationId' : 'generation,operationId,releaseDigest') || !uuid(ref.operationId) || !Number.isSafeInteger(ref.generation) || ref.generation < 1) corrupt();
  if (version === 2 && ref.releaseDigest !== null && !digest(ref.releaseDigest)) corrupt();
};
export function decodeManagementReceipt(text) {
  let value;
  try { value = JSON.parse(text); } catch { corrupt(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) corrupt();
  if (!Object.hasOwn(value, 'version')) return { result: value, distribution: undefined };
  if ((value.version !== 1 && value.version !== 2) || Object.keys(value).sort().join(',') !== 'distribution,result,version') corrupt();
  const ref = value.distribution;
  reference(ref, value.version);
  if (JSON.stringify({ version: value.version, result: value.result, distribution: ref }) !== text) corrupt();
  return { result: value.result, distribution: ref === null ? null : Object.freeze({ ...ref }) };
}
export function encodeManagementReceipt(result, distribution) {
  if (distribution === undefined) return JSON.stringify(result);
  const version = distribution !== null && Object.hasOwn(distribution, 'releaseDigest') ? 2 : 1;
  const text = JSON.stringify({ version, result, distribution });
  decodeManagementReceipt(text);
  return text;
}
