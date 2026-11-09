// 上架申請的逐步進度：服務端在真正執行到的階段記錄一次，客戶端只輪詢顯示。
// 刻意只放記憶體：這是單次請求的暫時狀態，不是權威；重啟後由「查詢原操作」對帳。
// 六步與 #publishPin 的實際階段一一對應，不在客戶端推定或補步。
export const PUBLISH_STEPS = Object.freeze([
  '讀取草稿修訂與快照',
  '全章引用校驗',
  '檢驗記錄核對',
  '結構驗證與即時編譯',
  '凍結封包與分配版本序號',
  '寫入分發帳本並排隊',
]);

const iso = () => new Date().toISOString();

export class PublishProgress {
  #entries = new Map();
  #limit;
  constructor({ limit = 64 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('progress entry limit required');
    this.#limit = limit;
  }
  #key(actorId, opKey) { return `${actorId}\u0000${opKey}`; }
  #entry(actorId, opKey) { return this.#entries.get(this.#key(actorId, opKey)) ?? null; }
  #put(actorId, opKey, entry) {
    this.#entries.delete(this.#key(actorId, opKey));
    this.#entries.set(this.#key(actorId, opKey), entry);
    while (this.#entries.size > this.#limit) this.#entries.delete(this.#entries.keys().next().value);
  }
  start({ actorId, opKey, gameId }) {
    this.#put(actorId, opKey, { gameId, step: 0, state: 'running', failedStep: null, code: null, updatedAt: iso() });
  }
  advance(actorId, opKey, step) {
    const entry = this.#entry(actorId, opKey);
    if (!entry || entry.state !== 'running' || !Number.isSafeInteger(step) || step < 0 || step > PUBLISH_STEPS.length || step < entry.step) return;
    this.#put(actorId, opKey, { ...entry, step, updatedAt: iso() });
  }
  finish(actorId, opKey) {
    const entry = this.#entry(actorId, opKey);
    if (!entry || entry.state !== 'running') return;
    this.#put(actorId, opKey, { ...entry, step: PUBLISH_STEPS.length, state: 'done', updatedAt: iso() });
  }
  fail(actorId, opKey, code) {
    const entry = this.#entry(actorId, opKey);
    if (!entry || entry.state !== 'running') return;
    this.#put(actorId, opKey, { ...entry, state: 'failed', failedStep: entry.step, code: typeof code === 'string' ? code : 'PUBLISH_FAILED', updatedAt: iso() });
  }
  read(actorId, gameId, opKey) {
    const entry = this.#entry(actorId, opKey);
    if (!entry || entry.gameId !== gameId) return null;
    return Object.freeze({ step: entry.step, total: PUBLISH_STEPS.length, state: entry.state, failedStep: entry.failedStep, code: entry.code, updatedAt: entry.updatedAt });
  }
}
