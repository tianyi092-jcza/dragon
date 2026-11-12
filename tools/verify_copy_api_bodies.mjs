// 客户端 api() 约定：无 body 即发 GET。以下 copy 路由没有 GET 读口（submission 读走 GET submission 本体），
// 调用时漏 body 会静默变成 GET 并 404 NOT_FOUND（F4 上架校验曾因此全灭）。
// 本测试静态扫描三份控制器文本，锁定该约定。
// 用法：node --test tools/verify_copy_api_bodies.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const POST_ONLY = ['/copy/validate', '/copy/reject', '/copy/approve'];
const FILES = ['../server/public/publish.txt', '../server/public/draft.txt', '../server/public/review.txt'];

test('copy POST-only routes are always called with a body', async () => {
  for (const file of FILES) {
    const src = await readFile(new URL(file, import.meta.url), 'utf8');
    const re = /api\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const args = m[1];
      if (POST_ONLY.some(p => args.includes(p))) {
        assert.match(args, /,/, `${file}: POST-only copy route called without a body: api(${args})`);
      }
    }
  }
});
