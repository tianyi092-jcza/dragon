// Local backup purge mechanism verification, fixture-only. Builds an owned
// backup directory, purges it, and proves absence by readback plus a valid
// purge receipt. No production targets touched.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { purgeBackupDir } from './fixtures/backup-purge.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const GAME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let checks = 0;
const own = join(tmpdir(), 'dragon-backup-purge-verify-');
rmSync(own, { recursive: true, force: true });
mkdirSync(own, { recursive: true });
const dir = join(own, 'game-backup');
mkdirSync(dir);
const files = [0, 1, 2].map(i => ({ name: `slot-${i}.json`, bytes: Buffer.from(JSON.stringify({ version: 1, slot: i, payload: `purge-bytes-${i}` })) }));
for (const file of files) writeFileSync(join(dir, file.name), file.bytes);
const manifest = files.map(file => ({ name: file.name, sha256: sha(file.bytes) }));

// A changed byte before purge refuses instead of purging something unexpected.
const code = want => error => error?.code === want;
writeFileSync(join(dir, files[0].name), Buffer.from('tampered'));
assert.throws(() => purgeBackupDir({ dir, target: GAME, files: manifest }), code('BACKUP_PURGE_CHANGED'));
writeFileSync(join(dir, files[0].name), files[0].bytes);
writeFileSync(join(dir, 'stray.tmp'), Buffer.from('stray'));
assert.throws(() => purgeBackupDir({ dir, target: GAME, files: manifest }), code('BACKUP_PURGE_UNEXPECTED'));
rmSync(join(dir, 'stray.tmp')); checks++;

// Clean purge: verified absence plus a frozen receipt bound to the manifest.
const receipt = purgeBackupDir({ dir, target: GAME, files: manifest });
assert.equal(receipt.target, GAME);
assert.equal(receipt.manifestDigest, sha(JSON.stringify(manifest.map(file => [file.name, file.sha256]))));
assert.equal(receipt.fileCount, 3);
assert.ok(/^[a-f0-9]{64}$/.test(receipt.purgeDigest));
assert.ok(!Number.isNaN(Date.parse(receipt.purgedAt)));
assert.throws(() => readFileSync(join(dir, files[0].name)), code('ENOENT'));
assert.deepEqual(Object.keys(receipt).sort(), ['fileCount', 'manifestDigest', 'purgeDigest', 'purgedAt', 'target']); checks++;

// A purged backup cannot be restored from: nothing remains to read back.
assert.throws(() => readFileSync(join(dir, files[1].name)), code('ENOENT'));
assert.throws(() => purgeBackupDir({ dir, target: GAME, files: manifest }), code('ENOENT')); checks++;

rmSync(own, { recursive: true, force: true });
process.stdout.write(`backup purge local: ${checks} groups green (owned test files only; no production targets)\n`);
