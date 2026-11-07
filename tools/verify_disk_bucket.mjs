// 方案 B 的磁碟桶埠證據：`vps/disk-bucket.mjs` 必須讓既有的發布器、指針 CAS、
// 收據與回收器原樣可用。這裡驗的是埠契約本身——etag/last-modified 形狀（收據會逐字
// 比對）、putImmutable 的「已存在即 null」、putControl 的 CAS 語意、list 前綴、remove
// 的 204/404 與空目錄回收、以及鍵形狀越界。不是真實遷移證據，也不連任何雲端。
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, statSync, utimesSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiskBucket } from '../vps/disk-bucket.mjs';

const md5 = bytes => '"' + createHash('md5').update(bytes).digest('hex') + '"';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const root = mkdtempSync(join(tmpdir(), 'disk-bucket-'));
const bucket = createDiskBucket({ root });
const checks = [];
const pass = label => checks.push(label);

// ① 寫入／讀回：etag 是 R2 形狀、last-modified 是合法 toUTCString、content-type 按副檔名。
{
  const bytes = Buffer.from('{"hello":"world"}');
  const put = bucket.putImmutable('control/current.json', bytes, 'application/json');
  assert.equal(put.sha256, sha256(bytes));
  assert.equal(put.byteLength, bytes.length);
  const read = bucket.get('control/current.json');
  assert.deepEqual(Buffer.from(read.bytes), bytes);
  assert.equal(read.headers.etag, md5(bytes), 'etag 必須是 R2 的 "＜md5＞" 形狀');
  const time = Date.parse(read.headers['last-modified']);
  assert.ok(Number.isFinite(time) && new Date(time).toUTCString() === read.headers['last-modified'], 'last-modified 必須可被 Date.parse 還原');
  assert.equal(read.headers['content-type'], 'application/json');
  assert.equal(bucket.get('control/missing.json'), null, '缺席必須是 null，不是空物件');
  pass('寫入/讀回：etag 與 last-modified 是 R2 形狀，缺席回 null');
}

// ② putImmutable 冪等：已存在不改寫、回 null（發布器靠這個避免覆寫不可變字節）。
{
  const before = bucket.get('control/current.json');
  assert.equal(bucket.putImmutable('control/current.json', Buffer.from('other'), 'application/json'), null);
  const after = bucket.get('control/current.json');
  assert.deepEqual(Buffer.from(after.bytes), Buffer.from(before.bytes), '已存在的不可變物件不得被覆寫');
  pass('putImmutable：已存在回 null 且不改寫');
}

// ③ putControl CAS：條件不符回 false 且不動字節；相符才寫；ifMatch=null 只在缺席時成立。
{
  const key = 'control/directory.json';
  const first = Buffer.from('{"v":1}');
  assert.equal(bucket.putControl(key, first, null), true, '缺席 + ifMatch=null 必須成功');
  const etag = bucket.get(key).headers.etag;
  const second = Buffer.from('{"v":2}');
  assert.equal(bucket.putControl(key, second, '"deadbeef"'), false, 'etag 不符必須拒絕');
  assert.deepEqual(Buffer.from(bucket.get(key).bytes), first, '拒絕時不得改寫');
  assert.equal(bucket.putControl(key, second, etag), true, 'etag 相符必須成功');
  assert.deepEqual(Buffer.from(bucket.get(key).bytes), second);
  assert.equal(bucket.putControl(key, first, null), false, '已存在時 ifMatch=null 必須拒絕');
  pass('putControl：CAS 三種情況都符合埠契約');
}

// ④ list：前綴過濾、排序、maxKeys 上限；不列出臨時檔。
{
  for (const key of ['artifacts/a/1.json', 'artifacts/a/2.json', 'artifacts/b/3.json', 'kao/17.png']) bucket.putImmutable(key, Buffer.from(key));
  assert.deepEqual(bucket.list('artifacts/a/', 1000), ['artifacts/a/1.json', 'artifacts/a/2.json']);
  assert.deepEqual(bucket.list('artifacts/', 2).length, 2, 'maxKeys 必須生效');
  assert.deepEqual(bucket.list('artifacts/b/'), ['artifacts/b/3.json']);
  assert.deepEqual(bucket.list('kao/'), ['kao/17.png']);
  assert.deepEqual(bucket.list('nothing/'), []);
  pass('list：前綴、排序、上限都正確');
}

// ⑤ remove：204/404，並把空目錄一起收掉。
{
  assert.equal(bucket.remove('artifacts/a/1.json'), 204);
  assert.equal(bucket.remove('artifacts/a/2.json'), 204);
  assert.equal(bucket.remove('artifacts/a/2.json'), 404, '重複刪除必須回 404');
  assert.equal(existsSync(join(root, 'artifacts', 'a')), false, '空目錄要一併移除');
  assert.equal(bucket.get('artifacts/a/1.json'), null);
  assert.deepEqual(bucket.list('artifacts/b/'), ['artifacts/b/3.json'], '別的鍵不得受影響');
  pass('remove：204/404 與空目錄回收');
}

// ⑥ 鍵形狀與唯讀：越界鍵一律 TypeError；readOnly 桶拒絕任何寫入（玩家端只用唯讀桶）。
{
  for (const key of ['../escape', '/absolute', 'a//b', 'a/./b', 'a/../b', '', 'a\\b']) {
    assert.throws(() => bucket.get(key), TypeError, '越界鍵必須拒絕: ' + key);
  }
  const readOnly = createDiskBucket({ root, readOnly: true });
  assert.ok(readOnly.get('kao/17.png') !== null, '唯讀桶仍可讀');
  assert.throws(() => readOnly.putImmutable('kao/18.png', Buffer.from('x')), /read-only/);
  assert.throws(() => readOnly.remove('kao/17.png'), /read-only/);
  pass('鍵形狀越界與唯讀桶都被拒絕');
}

// ⑦ 遷移用 setModified：把 R2 的 Last-Modified 帶過來後，讀回的時間必須逐字相同
// （收據裡的 visibleAt 靠這個才不會被判 REMOTE_GAP）。
{
  const key = 'control/current.json';
  const when = new Date('2026-11-06T14:21:39.000Z');
  bucket.setModified(key, when);
  assert.equal(bucket.get(key).headers['last-modified'], when.toUTCString());
  assert.equal(statSync(join(root, 'control', 'current.json')).mtime.toUTCString(), when.toUTCString());
  assert.throws(() => bucket.setModified(key, 'not-a-date'), TypeError);
  pass('setModified：遷移後 last-modified 與 R2 逐字一致');
}

// ⑧ 玩家端唯讀綁定必須是 Workers 綁定形狀（reader/programarchive.js 用 body 串流＋
// httpMetadata.contentType 逐字比對）。少一個 body 就讓 /program-assets/* 全部 503。
{
  const { readOnlyBinding } = await import('../vps/player-server.mjs');
  const binding = readOnlyBinding(createDiskBucket({ root, readOnly: true }));
  const object = await binding.get('kao/17.png');
  assert.ok(object, '唯讀綁定必須讀到既有物件');
  assert.equal(object.size, bucket.get('kao/17.png').bytes.length);
  assert.equal(object.httpMetadata.contentType, 'application/octet-stream', 'content-type 必須取自 .meta 而非猜副檔名');
  assert.equal(typeof object.body?.getReader, 'function', 'body 必須是 ReadableStream：programarchive 逐塊讀');
  const stream = object.body.getReader(), parts = [];
  for (let chunk = await stream.read(); !chunk.done; chunk = await stream.read()) parts.push(chunk.value);
  assert.deepEqual(Buffer.concat(parts), Buffer.from(bucket.get('kao/17.png').bytes), '串流位元組必須與桶內一致');
  assert.equal(await binding.get('kao/missing.png'), null);
  pass('玩家端唯讀綁定：size／httpMetadata／body 串流與桶內位元組一致');
}

rmSync(root, { recursive: true, force: true });
process.stdout.write(JSON.stringify({ result: 'PASS-DISK-BUCKET', checks: checks.length, labels: checks }) + '\n');
