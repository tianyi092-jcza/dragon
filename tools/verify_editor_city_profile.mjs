// 據點是遊戲自己的共享資料（用户 2026-11 决定）：固定副本譜系也能改父表據點，
// 但歷史必須證明「基線＋已記錄編輯＝候選」。無記錄、數值不符、動到第二座外都拒絕。
// 不含原生初始化、試玩、發布或地圖／道路權限。
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_COPY_PROFILE } from '../server/copyprofile.js';
import { setCityDefinitionName, setCityDefinitionNumbers } from '../web/src/content/authoring/citydefinitions.js';

const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind: 'full' }), profileRevision: FIXED_COPY_PROFILE });
const capture = await profile.capture({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-city-profile' });
const base = capture.game;
const verify = (candidate, cityEdits) => profile.verify(capture.capability, candidate, [], [], [], [], cityEdits);
const reject = (candidate, cityEdits) => assert.throws(() => verify(candidate, cityEdits), error => error.status === 422);

// 父表確實有 192 座，而且帶著第一章取回的預設值。
assert.equal(Object.keys(base.cities).length, 192);
const first = base.cities['city-000'];
for (const key of ['name', 'x', 'y', 'max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view']) assert.ok(Object.hasOwn(first, key), `${key} 缺失`);

// 改名：有記錄通過；無記錄／記錄不符／改別座都拒絕。
const renamed = setCityDefinitionName(base, 'city-000', '新北平');
assert.equal(verify(renamed, [{ op: 'rename', cityId: 'city-000', name: '新北平' }]).profileRevision, FIXED_COPY_PROFILE);
reject(renamed, []);
reject(renamed, [{ op: 'rename', cityId: 'city-000', name: '別的' }]);
reject(renamed, [{ op: 'rename', cityId: 'city-001', name: '新北平' }]);

// 數值：六項都可寫，但必須與歷史值一致。
const numbers = setCityDefinitionNumbers(base, 'city-000', { max_prod: 30000, prod: 12345, growth: 99, defence: 200, troops: 250, type: 1 });
verify(numbers, [{ op: 'numbers', cityId: 'city-000', values: { max_prod: 30000, prod: 12345, growth: 99, defence: 200, troops: 250, type: 1 } }]);
reject(numbers, [{ op: 'numbers', cityId: 'city-000', values: { max_prod: 30000, prod: 12346 } }]);
reject(numbers, []);

// 未經記錄動到第二座也拒絕。
const tampered = setCityDefinitionNumbers(base, 'city-001', { prod: 1 });
reject(tampered, [{ op: 'numbers', cityId: 'city-000', values: { prod: 12345 } }]);

// 保留原有限制：座標／槽位不能由據點命令改寫。
reject(base, [{ op: 'move', cityId: 'city-000', x: 1 }]);
reject(base, [{ op: 'numbers', cityId: 'city-000', values: { runtimeSlot: 3 } }]);

console.log('city profile lane PASS 8 groups');
