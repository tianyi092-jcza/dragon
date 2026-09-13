// TALK.DAT 对白表 — 隐藏属性提示 (对应原版「確認指示之武將的能力」流)
// 数据: tools/parse_talk.py → talk.json (1023条目, Big5 已转 UTF-8)
// 以下为现Web选择策略，完整原版入口尚未闭合；旧6580证据误指停战提案。
// 见docs/re-notes-entity-fields.md；本批只撤证据声明，不改行为：
//   - 俘虏 status === 4 时进入 553..557 对白
//   - 正常武将: 比较 ability.siege, field, naval, 优先取最大项:
//       siege >= field && siege >= naval -> 城塞戰 (558..565)
//       field >= naval -> 野戰 (566..573)
//       else -> 水戰 (574..581)
//   - 选句偏移: SINARIO.DAT 武将 byte 0x1E (talk_idx, 0..7), 回退 gen.idx % 8
import { loadJSON } from "../core/assets.js";

let table = null;

async function ensureTable() {
  if (!table) {
    const j = await loadJSON("talk.json");
    table = j.strings;
  }
  return table;
}

/**
 * 武将特长对白（现Web策略，非已认证完整原版规则）
 * @param {object} gen
 * @returns {Promise<{ lines: string[], text: string }>}
 */
export async function quoteFor(gen) {
  const t = await ensureTable();
  if (!gen) return { lines: [], text: "" };

  let base = 558;
  let mod = 8;
  if (gen.status === 4) {
    base = 553;
    mod = 5;
  } else {
    const a = gen.ability || {};
    const s = a.siege ?? 0;
    const f = a.field ?? 0;
    const n = a.naval ?? 0;
    if (s >= f && s >= n) {
      base = 558;
    } else if (f >= n) {
      base = 566;
    } else {
      base = 574;
    }
  }

  const offset =
    gen.talk_idx == null ? (gen.idx ?? 0) % mod : gen.talk_idx % mod;
  const entry = t[base + offset] ?? [];
  const lines = Array.isArray(entry) ? entry : [String(entry)];
  return {
    lines,
    text: lines.join(""),
  };
}

/**
 * 军团编成完成对白（075B选句索引有证据；模运算/缺句回退未证全等）
 * @param {object} gen
 * @returns {Promise<{ lines: string[], text: string }>}
 */
export async function quoteForFormation(gen) {
  const t = await ensureTable();
  if (!gen) return { lines: [], text: "" };

  const talk_idx = gen.talk_idx == null ? (gen.idx ?? 0) % 8 : gen.talk_idx % 8;
  const targetNum = 446 + talk_idx;
  let entry = t[targetNum] ?? [];
  if (!Array.isArray(entry) || entry.length === 0) {
    // 446..448 为空时的回退
    const fallbackNum = 449 + (talk_idx % 5);
    entry = t[fallbackNum] ?? [];
  }
  const lines = Array.isArray(entry) ? entry : [String(entry)];
  return {
    lines,
    text: lines.join(""),
  };
}

/**
 * TALK.DAT 指定索引对白
 * @param {number} idx
 * @returns {Promise<{ lines: string[], text: string }>}
 */
export async function quoteForIndex(idx) {
  const t = await ensureTable();
  const entry = t[idx] ?? [];
  const lines = Array.isArray(entry) ? entry : [String(entry)];
  return {
    lines,
    text: lines.join(""),
  };
}

/**
 * KI.EXE 0x075B：CX>=0x196时，把选择器换算为八句个性对白窗口。
 * `tableIndex = 0x196 + (selector - 0x196) * 8 + general[+0x1E]`。
 */
export function personalityTalkIndex(selector, gen) {
  if (!Number.isInteger(selector) || selector < 0x196) return null;
  const personality = Number.isInteger(gen?.talk_idx)
    ? gen.talk_idx
    : (((gen?.idx ?? 0) % 8) + 8) % 8;
  return 0x196 + (selector - 0x196) * 8 + (personality & 0xff);
}

/** type10/其它运行态通用TALK：按原版单个AX占位word替换控制符。 */
export async function formatGenericTalkEvent(idx, arg0, sc = null) {
  const general = sc?.generals?.[arg0] ?? null;
  const faction = sc?.factions?.find((candidate) => candidate?.idx === arg0);
  const city = sc?.cities?.[arg0] ?? null;
  const label =
    general?.name?.trim?.() ||
    faction?.monarch?.trim?.() ||
    city?.name?.trim?.() ||
    "";
  const targetName = faction?.monarch?.trim?.() || label;
  const cityName = city?.name?.trim?.() || label;
  return formatTalkTokens(idx, targetName, label, label, label, cityName);
}

/** 占位符替换: \\1..\\4 → args[1..4] (势力/城池/武将名等) */
export function fmt(s, args = {}) {
  return s.replace(/\\([1-4])/g, (_, n) => args[n] ?? `\\${n}`);
}

/**
 * 解析并格式化 TALK.DAT 对白分词（支持 \3 目标君主黄色高亮 #ffe000，\4 军师名白色，\1 武将名，\2 据点名/武将名，\7 金额/额外字符串）
 * @param {number} idx
 * @param {string|string[]} targetName
 * @param {string} advisorName
 * @param {string} generalName
 * @param {string} extraStr
 * @param {string} cityName
 * @returns {Promise<Array<Array<{text: string, color: string}>>>}
 */
export async function formatTalkTokens(
  idx,
  targetName = "",
  advisorName = "",
  generalName = "",
  extraStr = "",
  cityName = "",
) {
  const t = await ensureTable();
  const entry = t[idx] ?? [];
  const rawLines = Array.isArray(entry) ? entry : [String(entry)];

  // 同类占位符可对应多个栈参数；索引跨行延续，保持0x0CDE原顺序。
  let targetIdx = 0;
  let generalIdx = 0;
  let cityIdx = 0;

  return rawLines.map((raw) => {
    const segs = [];
    let cur = "";
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === "\\" && i + 1 < raw.length) {
        const tag = raw[i + 1];
        if (
          tag === "1" ||
          tag === "2" ||
          tag === "3" ||
          tag === "4" ||
          tag === "6" ||
          tag === "7"
        ) {
          if (cur) {
            segs.push({ text: cur, color: "#ffffff" });
            cur = "";
          }
          let val = "";
          let col = "#ffffff";
          if (tag === "1") {
            val = Array.isArray(generalName)
              ? (generalName[generalIdx++] ?? "")
              : generalName;
            col = "#ffffff";
          } else if (tag === "2") {
            if (Array.isArray(cityName)) {
              val = cityName[cityIdx++] ?? "";
              col = "#c08020"; // 原版 \2 據點名橙黃色高亮 (#c08020)
            } else if (cityName) {
              val = cityName;
              col = "#c08020"; // 原版 \2 據點名橙黃色高亮 (#c08020)
            } else if (Array.isArray(generalName)) {
              val = generalName[generalIdx++] ?? "";
              col = "#ffffff";
            } else {
              val = generalName;
              col = "#ffffff";
            }
          } else if (tag === "3") {
            if (Array.isArray(targetName)) {
              val = targetName[targetIdx++] ?? "";
            } else {
              val = targetName;
            }
            col = "#ffe000"; // 原版 \3 目标势力君主名黄色高亮 (#ffe000)
          } else if (tag === "4") {
            val = advisorName;
            col = "#ffffff";
          } else if (tag === "6") {
            val = ""; // 原版 \6 内部控制符，置空略过
          } else if (tag === "7") {
            val = extraStr;
            col = "#ffd700"; // 原版 \7 金额黄色高亮 (#ffd700)
          }
          if (val) {
            const isNum = tag === "7" || /^\d+$/.test(val);
            segs.push({ text: val, color: col, isNum });
          }
          i += 2;
          continue;
        }
      }
      cur += raw[i];
      i++;
    }
    if (cur) {
      segs.push({ text: cur, color: "#ffffff" });
    }
    return segs;
  });
}
