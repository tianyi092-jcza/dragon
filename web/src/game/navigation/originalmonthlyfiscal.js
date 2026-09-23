// Strict KI.EXE 5358..5389 monthly fiscal loop plus 5695 city production.
// Evidence: docs/re-notes-ai-fiscal.md §§2-5.
export class OriginalMonthlyFiscalBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original monthly fiscal boundary at ${at}: ${detail}`);
    this.name = "OriginalMonthlyFiscalBoundaryError";
    this.instruction = at;
  }
}
const stop = (at, detail) => {
  throw new OriginalMonthlyFiscalBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const integer = (value, min, max, at, label) => {
  if (!Number.isInteger(value) || value < min || value > max)
    stop(at, `${label} is out of range`);
  return value;
};
const byte = (value, at, label) => integer(value, 0, 0xff, at, label);
const word = (value, at, label) => integer(value, 0, 0xffff, at, label);
const u24 = (value, at, label) => integer(value, 0, 0xffffff, at, label);
const signed24 = (value) => (value & 0x800000 ? value - 0x1000000 : value);

export function originalSubtractFunds563B(money, expense) {
  let result =
    (u24(money, "563D", "money") - u24(expense, "563D", "expense")) & 0xffffff;
  const high = (result >>> 16) & 0xff;
  const signedHigh = (high << 24) >> 24;
  if (signedHigh < -10 || (signedHigh === -10 && (result & 0xffff) <= 0x0168))
    result = 0xf60168;
  return result;
}

export function originalAddFunds5609(money, income) {
  let result =
    (u24(money, "560B", "money") + u24(income, "560B", "income")) & 0xffffff;
  const high = (result >>> 16) & 0xff;
  const signedHigh = (high << 24) >> 24;
  if (signedHigh > 9 || (signedHigh === 9 && (result & 0xffff) >= 0xfe98))
    result = 0x09fe98;
  return result;
}

export function originalReserveAdd55EC(pool, produced) {
  pool = word(pool, "55EC", "reserve pool");
  produced = word(produced, "55EC", "produced reserve");
  const sum = pool + produced;
  return sum > 0xffdc ? 0xffdc : sum;
}

function distanceDivisor54FC(capital, city) {
  const dx = Math.abs(
    word(capital.x, "54FC", "capital x") - word(city.x, "54FF", "city x"),
  );
  const dy = Math.abs(
    word(capital.y, "5506", "capital y") - word(city.y, "5509", "city y"),
  );
  const distance = Math.max(dx, dy) > 0xff ? 0xff : Math.max(dx, dy);
  if (distance <= 0x50) return 2;
  if (distance <= 0xc8) return 3;
  return 4;
}

function production5547(base, y) {
  base = word(base, "5547", "production base") >>> 5;
  y = word(y, "555A", "city y");
  if (y < 0x50) {
    let inf = base >>> 2;
    let arc = inf >>> 1;
    inf = (inf + arc) & 0xffff;
    arc >>>= 2;
    return { cav: (base - inf - arc) & 0xffff, arc, inf };
  }
  if (y < 0x96) {
    const cav = base >>> 3;
    return { cav, arc: cav, inf: (base - cav - cav) & 0xffff };
  }
  const cav = base >>> 5;
  const arc = base >>> 1;
  return { cav, arc, inf: (arc - cav) & 0xffff };
}

function scanFaction53C6(io, slot, expense) {
  const capitalIndex = byte(
    call(io, "readFactionByte", [slot, "capital"], "53D0"),
    "53D0",
    "capital",
  );
  const capital = {
    x: word(
      call(io, "readCityWord", [capitalIndex, "x"], "54FC"),
      "54FC",
      "capital x",
    ),
    y: word(
      call(io, "readCityWord", [capitalIndex, "y"], "5506"),
      "5506",
      "capital y",
    ),
  };
  let income = 0,
    cav = 0,
    arc = 0,
    inf = 0,
    cities = 0;
  for (let index = 0; index < 192; index++) {
    const owner = byte(
      call(io, "readCityByte", [index, "faction"], "53F7"),
      "53F7",
      "city owner",
    );
    if (owner !== slot) continue;
    const city = {
      x: word(call(io, "readCityWord", [index, "x"], "54FF"), "54FF", "city x"),
      y: word(call(io, "readCityWord", [index, "y"], "5509"), "5509", "city y"),
    };
    const divisor = distanceDivisor54FC(capital, city);
    const production = word(
      call(io, "readCityWord", [index, "prod"], "5538"),
      "5538",
      "city production",
    );
    const quotient = Math.floor(production / divisor);
    income = (income + quotient) & 0xffffff;
    const yields = production5547(quotient, city.y);
    cav = (cav + yields.cav) & 0xffff;
    arc = (arc + yields.arc) & 0xffff;
    inf = (inf + yields.inf) & 0xffff;
    cities = (cities + 1) & 0xff;
  }
  const playerPointer = word(
    call(io, "readPlayerFactionPointer", [], "5410"),
    "5410",
    "CFD",
  );
  let recruit = true;
  if (playerPointer === slot * 0x40) {
    const tax = byte(
      call(io, "readCurrentTaxByte", [], "5491"),
      "5491",
      "current tax",
    );
    income = Math.floor((income * tax) / 100) & 0xffffff;
    cav = Math.min(
      cav,
      word(
        call(io, "readCurrentConscriptionWord", [0], "54CA"),
        "54CA",
        "cavalry policy",
      ),
    );
    arc = Math.min(
      arc,
      word(
        call(io, "readCurrentConscriptionWord", [1], "54CA"),
        "54CA",
        "archer policy",
      ),
    );
    inf = Math.min(
      inf,
      word(
        call(io, "readCurrentConscriptionWord", [2], "54CA"),
        "54CA",
        "infantry policy",
      ),
    );
    call(io, "writePlayerFinanceReport", [income, expense], "54E3");
  } else {
    income >>>= 1;
    let total = 0;
    for (let half = 0; half < 0x7f; half++) {
      const status = byte(
        call(io, "readLegionHalfByte", [half, "status"], "546C"),
        "546C",
        "half status",
      );
      if (status < 0x80) continue;
      const owner = byte(
        call(io, "readLegionHalfByte", [half, "faction"], "5470"),
        "5470",
        "half owner",
      );
      if (owner !== slot) continue;
      total =
        (total +
          word(
            call(io, "readLegionHalfWord", [half, "troops"], "5475"),
            "5475",
            "half troops",
          )) &
        0xffff;
    }
    const burden =
      ((((total >>> 8) + ((expense >>> 8) & 0xffff)) & 0xffff) << 1) & 0xffff;
    recruit = burden < ((income >>> 8) & 0xffff);
  }
  if (recruit) {
    for (const [field, produced, at] of [
      ["reserve_cav", cav, "5421"],
      ["reserve_arc", arc, "542D"],
      ["reserve_inf", inf, "5439"],
    ]) {
      const pool = word(
        call(io, "readFactionWord", [slot, field], at),
        at,
        field,
      );
      call(
        io,
        "writeFactionWord",
        [slot, field, originalReserveAdd55EC(pool, produced)],
        at,
      );
    }
  }
  call(io, "writeFactionByte", [slot, "n_cities", cities], "544B");
  return {
    income,
    cav: recruit ? cav : 0,
    arc: recruit ? arc : 0,
    inf: recruit ? inf : 0,
  };
}

function deficit5828(io, slot, money) {
  const shifted = (money >>> 8) & 0xffff;
  if (shifted >>> 8 < 0x80) return;
  const base = ((-shifted << 4) & 0xffff) >>> 0;
  for (const [field, at] of [
    ["reserve_cav", "5846"],
    ["reserve_arc", "5846"],
    ["reserve_inf", "5846"],
  ]) {
    const random = byte(call(io, "nextRandomByte", [], at), at, "deficit RNG");
    const loss = (base + (random & 0x1f)) & 0xffff;
    const pool = word(
      call(io, "readFactionWord", [slot, field], "584E"),
      "584E",
      field,
    );
    call(
      io,
      "writeFactionWord",
      [slot, field, pool >= loss ? pool - loss : 0],
      "584E",
    );
  }
}

function updateCities5695(io) {
  for (let index = 0; index < 192; index++) {
    const growth = byte(
      call(io, "readCityByte", [index, "growth"], "56A0"),
      "56A0",
      "growth",
    );
    let factor = growth - 100;
    const player = byte(
      call(io, "readPlayerFactionByte", [], "56A8"),
      "56A8",
      "CFF",
    );
    const owner = byte(
      call(io, "readCityByte", [index, "faction"], "56AD"),
      "56AD",
      "city owner",
    );
    if (owner === player) {
      const tax = byte(
        call(io, "readCurrentTaxByte", [], "56B2"),
        "56B2",
        "current tax",
      );
      factor -= tax - 30;
    }
    const production = word(
      call(io, "readCityWord", [index, "prod"], "56BD"),
      "56BD",
      "production",
    );
    const scale = Math.max(1, production >>> 8);
    const productRaw = (scale * factor) & 0xffff;
    const product = productRaw & 0x8000 ? productRaw - 0x10000 : productRaw;
    let next;
    if (product >= 0) next = (production + (product >> 1)) & 0xffff;
    else {
      const decrease = -productRaw & 0xffff;
      next = production >= decrease ? production - decrease : 0;
    }
    const maximum = word(
      call(io, "readCityWord", [index, "max_prod"], "56E1"),
      "56E1",
      "maximum production",
    );
    if (next > maximum) next = maximum;
    call(io, "writeCityWord", [index, "prod", next], "56E9");
    const random =
      byte(call(io, "nextRandomByte", [], "56EC"), "56EC", "growth RNG") & 0x0f;
    factor = Math.max(-100, Math.min(100, factor - random));
    call(io, "writeCityByte", [index, "growth", factor + 100], "5707");
  }
}

export function originalMonthlyFiscal5358(io) {
  const reports = [];
  for (let slot = 0; slot < 22; slot++) {
    const attr = byte(
      call(io, "readFactionByte", [slot, "attr"], "5362"),
      "5362",
      "attr",
    );
    if (attr < 0x80) continue;
    const expense = u24(
      call(io, "readFactionExpense24", [slot], "5367"),
      "5367",
      "expense",
    );
    let money = u24(
      call(io, "readFactionMoney24", [slot], "563D"),
      "563D",
      "money",
    );
    money = originalSubtractFunds563B(money, expense);
    call(io, "writeFactionMoney24", [slot, money], "565A");
    const result = scanFaction53C6(io, slot, expense);
    money = originalAddFunds5609(money, result.income);
    call(io, "writeFactionMoney24", [slot, money], "5622");
    call(io, "writeFactionExpense24", [slot, 0], "5378");
    deficit5828(io, slot, money);
    reports.push({
      slot,
      expense,
      income: result.income,
      ...result,
      money: signed24(money),
    });
  }
  updateCities5695(io);
  return reports;
}
