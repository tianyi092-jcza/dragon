// Strict KI.EXE 5715/578F monthly type4/type5 producers.
// Evidence: fixed bytes 5715..57FD and docs/re-notes-ai-fiscal.md §§8-10.
import { originalCurrentEnqueue2FBF } from "./originalweather.js";

export class OriginalMonthlyBudgetBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original monthly budget boundary at ${at}: ${detail}`);
    this.name = "OriginalMonthlyBudgetBoundaryError";
  }
}
const stop = (at, detail) => {
  throw new OriginalMonthlyBudgetBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const byte = (value, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    stop(at, `${label} is not u8`);
  return value;
};
const word = (value, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff)
    stop(at, `${label} is not u16`);
  return value;
};
const enqueueIO = (io) => ({
  nextRandomByte: () =>
    byte(call(io, "nextRandomByte", [], "2FCB"), "2FCB", "random byte"),
  readEventCursorWord: () =>
    word(call(io, "readEventCursorWord", [], "2FD4"), "2FD4", "D20"),
  readEventTypeByte: (offset) =>
    byte(call(io, "readEventTypeByte", [offset], "2FF1"), "2FF1", "event type"),
  writeEventWord: (offset, value) =>
    call(io, "writeEventWord", [offset, value], "2FF6"),
});
const enqueue = (io, type, arg0, amount) =>
  originalCurrentEnqueue2FBF(
    enqueueIO(io),
    byte(type, "2FBF", "type") | (byte(arg0, "2FBF", "arg0") << 8),
    word(amount, "2FBF", "amount"),
    0xff,
  );

/** 5715: fixed 192-city scan; amount zero is still enqueued. */
export function originalMonthlyDomesticBudgets5715(io) {
  const player = byte(
    call(io, "readPlayerFactionByte", [], "5720"),
    "5720",
    "CFF player faction",
  );
  const queued = [];
  for (let city = 0; city < 192; city++) {
    const owner = byte(
      call(io, "readCityByte", [city, "owner"], "572A"),
      "572A",
      "city owner",
    );
    if (owner !== player) continue;
    const governor = byte(
      call(io, "readCityByte", [city, "governor"], "572F"),
      "572F",
      "city governor",
    );
    if (governor === 0xff) continue;
    const budget = byte(
      call(io, "readGeneralBudgetByte", [governor], "573F"),
      "573F",
      "governor budget",
    );
    if (budget !== 0) continue;
    const growth = byte(
      call(io, "readCityByte", [city, "growth"], "574C"),
      "574C",
      "city growth",
    );
    const defence = byte(
      call(io, "readCityByte", [city, "defence"], "5755"),
      "5755",
      "city defence",
    );
    const cap = byte(
      call(io, "readCityByte", [city, "troopCap"], "575C"),
      "575C",
      "city troop cap",
    );
    const troops = byte(
      call(io, "readCityByte", [city, "troops"], "575F"),
      "575F",
      "city troops",
    );
    const deficit =
      Math.max(0, 180 - growth) +
      Math.max(0, 180 - defence) +
      Math.max(0, cap - troops);
    const amount = (deficit >>> 1) * 50;
    const result = enqueue(io, 4, city, amount);
    if (result.inserted)
      queued.push({ type: 4, arg0: city, amount, ...result });
  }
  return queued;
}

/** 578F: fixed 22 faction slots; no active/city-count gate. */
export function originalMonthlyEnvoyBudgets578F(io) {
  const playerPointer = word(
    call(io, "readPlayerFactionPointerWord", [], "5795"),
    "5795",
    "CFD player faction pointer",
  );
  const queued = [];
  for (let faction = 0; faction < 22; faction++) {
    if (playerPointer === faction * 0x40) continue;
    const diplomat = byte(
      call(io, "readFactionDiplomatByte", [faction], "57A8"),
      "57A8",
      "diplomat index",
    );
    if (diplomat === 0xff) continue;
    const budget = byte(
      call(io, "readGeneralBudgetByte", [diplomat], "57B8"),
      "57B8",
      "diplomat budget",
    );
    if (budget !== 0) continue;
    const outgoing = byte(
      call(
        io,
        "readRelationPointerByte",
        [playerPointer, faction * 0x40],
        "57BF",
      ),
      "57BF",
      "outgoing relation",
    );
    const incoming = byte(
      call(
        io,
        "readRelationPointerByte",
        [faction * 0x40, playerPointer],
        "57C6",
      ),
      "57C6",
      "incoming relation",
    );
    const raw = Math.min(outgoing, incoming);
    const amount = (((raw >= 0x80 ? 100 : 125) - (raw & 0x7f)) & 0xff) * 200;
    const result = enqueue(io, 5, faction, amount);
    if (result.inserted)
      queued.push({ type: 5, arg0: faction, amount, ...result });
  }
  return queued;
}

/** 57FE: one-month negative-funds trust event producer. */
export function originalDeficitTrust57FE(io) {
  const playerPointer = word(
    call(io, "readPlayerFactionPointerWord", [], "57FE"),
    "57FE",
    "CFD player faction pointer",
  );
  const moneyHighWord = word(
    call(io, "readFactionPointerMoneyHighWord", [playerPointer], "5803"),
    "5803",
    "money high word",
  );
  if (moneyHighWord >>> 8 < 0x80) return { queued: false, gated: "sign" };
  const magnitude = -moneyHighWord & 0xffff;
  if (magnitude < 0x27) return { queued: false, gated: "magnitude" };
  const random = byte(
    call(io, "nextRandomByte", [], "5812"),
    "5812",
    "random byte",
  );
  const bellicosity = byte(
    call(io, "readFactionPointerBellicosityByte", [playerPointer], "5817"),
    "5817",
    "bellicosity",
  );
  if ((random & 0x0f) >= bellicosity)
    return { queued: false, gated: "random", random };
  const result = originalCurrentEnqueue2FBF(
    enqueueIO(io),
    0x000d,
    0x0196,
    0xff,
  );
  return { queued: result.inserted, random, ...result };
}
