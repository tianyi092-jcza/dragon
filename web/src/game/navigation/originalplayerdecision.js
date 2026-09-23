// 卧龙传 Web - 38C7/38E6 玩家外交决定（原生模块）
//
// 来源（均为 KI.EXE 静态反汇编实锤，详见 docs/re-notes-ai-diplomacy.md §36）：
// - 调用点：type3 停战 3287 CALL 38C7（接收方为玩家，3280 cmp si,cs:[CFD]）；
//   type2 合作 3248 CALL 38E6（受邀方为玩家，3241 cmp si,cs:[CFD]）。
//   两条路径此前已由 NPC 算法预计算 AL=结果(0/1/2)、DX=fee。
// - 38C7/38E6 包装：CX=TALK 基 0x168=360(type3)/0x175=373(type2)，
//   AX=0x7530=30000（数字键盘上限），DX=算法 fee，AL=算法结果；序列 2078→3902→20D6。
// - 3902 决定语义：
//   1) 选项 0=无条件同意 / 1=提供资金 / 2=拒绝（TALK 363/376）；
//   2) 选 1 进 7C6E 数字键盘（默认 0，上限 30000，CF 取消=回选项重选）；
//      输入额为 0 时 [bp+3]=0，即按“无条件同意”处理；
//   3) 399E CALL ECE0 恰好消费 1 字节 RNG；cmp al,cs:[D00]（信赖度）；ja 跳过——
//      RNG > 信赖：玩家决定不生效，保持 NPC 算法 AL/DX，回应集 base+7（367-369 犹豫组）；
//      RNG ≤ 信赖：[bp+2]=玩家选择、DX=输入额，回应集 base+10（370-372 采纳组）；
//      输入额 > 算法 fee → AL=3（索价过高破裂）；
//   4) 本函数只计算结果，不做任何状态写入（状态写入在 ai.js resume 与 3C3D/3DC9 罚则）。
// 未知项保持未知：9409/7C6E 的具体按键映射不影响结果语义。

/** type3 停战：TALK 基 360。type2 合作：TALK 基 373。 */
export const PLAYER_DECISION_TALK_BASE = Object.freeze({
 truce: 360,
 assistance: 373,
});

/** 数字键盘上限：38C7/38E6 入口 AX=0x7530。 */
export const PLAYER_DECISION_FEE_CAP = 0x7530; // 30000

/**
 * 解析玩家选择为原版 3902 内部选择码。
 * 原版“提供资金且输入 0”落回选择 0（无条件同意）。
 * @param {"honor"|"accept"|"pay"|"refuse"} choice UI 选择（accept=honor 别名）
 * @param {number} amount 数字键盘输入额（仅 choice==="pay" 时有意义）
 * @returns {0|1|2}
 */
export function resolveOriginalPlayerDecisionChoice(choice, amount) {
 if (choice === "honor" || choice === "accept") return 0;
 if (choice === "refuse") return 2;
 if (choice === "pay") return amount > 0 ? 1 : 0;
 throw new RangeError(`unknown player decision choice: ${String(choice)}`);
}

/**
 * 3902 玩家决定门（纯函数）。
 * @param {object} request
 * @param {"truce"|"assistance"} request.kind
 * @param {number} request.algorithmOutcome 入口 AL：NPC 算法预计算结果 0/1/2
 * @param {number} request.algorithmFee 入口 DX：NPC 算法 fee
 * @param {number} request.choice 解析后的选择码 0/1/2（见 resolveOriginalPlayerDecisionChoice）
 * @param {number} request.amount 数字键盘输入额（choice 不为 1 时忽略）
 * @param {number|null|undefined} request.rngByte 399E CALL ECE0 的一字节 RNG；缺失时 fail-closed
 * @param {number} request.trust cs:[D00] 信赖度（0-255；运行时字节）
 * @returns {{outcome:number, fee:number, honored:boolean, responseTalk:number}}
 *   outcome∈{0,1,2,3}；3=索价过高破裂；responseTalk 为君主回应 TALK 索引（不含个性变体，
 *   个性变体 +talk_idx 由 UI 层在显示时追加，与 3C99 一致）。
 */
export function resolveOriginalPlayerDecision(request) {
 const kind = request?.kind;
 const base = PLAYER_DECISION_TALK_BASE[kind];
 if (base === undefined) {
  throw new RangeError(`unsupported player decision kind: ${String(kind)}`);
 }
 const algorithmOutcome = assertByte(
  request.algorithmOutcome,
  "algorithmOutcome",
 );
 const algorithmFee = assertWord(request.algorithmFee, "algorithmFee");
 const choice = request.choice;
 if (choice !== 0 && choice !== 1 && choice !== 2) {
  throw new RangeError(`unsupported player decision code: ${String(choice)}`);
 }
 const amount = choice === 1 ? assertWord(request.amount, "amount") : 0;
 if (choice === 1 && amount > PLAYER_DECISION_FEE_CAP) {
  throw new RangeError(`player decision amount exceeds keypad cap: ${amount}`);
 }
 const trust = assertByte(request.trust, "trust");
 const rngByte = request.rngByte;
 if (!Number.isInteger(rngByte) || rngByte < 0 || rngByte > 0xff) {
  throw new RangeError(
   "original player decision requires one rng byte (399E CALL ECE0)",
  );
 }

 // 399E-39BF：RNG > 信赖 → 玩家决定不生效，保持 NPC 算法 AL/DX，回应集 base+7。
 if (rngByte > trust) {
  return {
   outcome: algorithmOutcome,
   fee: algorithmFee,
   honored: false,
   responseTalk: base + 7,
  };
 }

 // RNG ≤ 信赖：[bp+2]=玩家选择，DX=输入额；输入额 > 算法 fee → AL=3。
 let outcome = choice;
 let fee = algorithmFee;
 if (choice === 1) {
  fee = amount;
  if (amount > algorithmFee) {
   outcome = 3;
  }
 }
 return {
  outcome,
  fee,
  honored: true,
  responseTalk: base + 10,
 };
}

function assertByte(value, name) {
 if (!Number.isInteger(value) || value < 0 || value > 0xff) {
  throw new RangeError(`${name} must be a byte`);
 }
 return value;
}

function assertWord(value, name) {
 if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
  throw new RangeError(`${name} must be a word`);
 }
 return value;
}
