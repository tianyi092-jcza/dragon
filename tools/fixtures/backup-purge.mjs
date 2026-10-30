// Local backup purge mechanism, fixture-only. Deletes caller-listed test backup
// files under an owned session directory, verifies absence by readback, and
// returns a frozen purge receipt. Production backup targets are an external
// dependency; this proves the mechanism, not production clearance.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const sha = value => createHash('sha256').update(value).digest('hex');

export function purgeBackupDir({ dir, target, files }) {
  if (typeof dir !== 'string' || !dir || typeof target !== 'string' || !target || !Array.isArray(files) || files.length < 1) throw new TypeError('owned directory, target identity and manifested file list required');
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !file.name || file.name.includes('/') || file.name.includes('\\') || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new TypeError('manifested file entries required');
    const bytes = readFileSync(join(dir, file.name));
    if (sha(bytes) !== file.sha256) { const error = new Error(`backup file changed before purge: ${file.name}`); error.code = 'BACKUP_PURGE_CHANGED'; throw error; }
  }
  const manifestDigest = sha(JSON.stringify(files.map(file => [file.name, file.sha256])));
  const before = readdirSync(dir).sort();
  const expected = files.map(file => file.name).sort();
  if (JSON.stringify(before) !== JSON.stringify(expected)) { const error = new Error('unexpected files beside the manifested backup'); error.code = 'BACKUP_PURGE_UNEXPECTED'; throw error; }
  for (const file of files) rmSync(join(dir, file.name));
  const after = readdirSync(dir);
  if (after.length !== 0) { const error = new Error('backup files still readable after purge'); error.code = 'BACKUP_PURGE_RESIDUAL'; throw error; }
  const purgedAt = new Date().toISOString();
  const purgeDigest = sha(JSON.stringify([target, manifestDigest, purgedAt]));
  return Object.freeze({ target, manifestDigest, purgeDigest, fileCount: files.length, purgedAt });
}
