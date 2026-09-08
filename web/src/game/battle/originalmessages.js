// KI C315/C39C/075B, C3B8, C407..C4F9. Semantic windows, NOT VGA pixels.
// No wall clock, RNG, asset fetch, strategic FIFO or native compositor here.
const clone = (value) => structuredClone(value);
const markerFor = (side) => (side === 0 ? "side0MarkerAt" : "side1MarkerAt");
const lowByteDeadline = (counter, delta) =>
  (counter & 0xff00) | ((counter + delta) & 0xff);

export const ORIGINAL_TALK_SOURCE_HASH =
  "cb0cdba4f1c507243cbc4e636bc3fcf698a4f88fe3a0d784cc579e5548e6fcaf";

/** C31F..C34D: general pointer is derived from legion SLOT, never +2 commander.
 * 6E92..6EAD normally allocates the matching slot. Preserve mismatched snapshots
 * literally; absent slots are unresolved, not an invitation to use generalIdx.
 */
export function originalTalkContext(scenario, sideLegions) {
  const speakers = sideLegions.map((legion) => {
    const slot = legion?.slot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= 128) return null;
    const general = scenario?.generals?.[slot];
    if (
      !general ||
      !Number.isInteger(general.portrait) ||
      !Number.isInteger(general.talk_idx) ||
      typeof general.name !== "string"
    )
      return null;
    return {
      legionPointer: 0x2240 + slot * 0x40,
      generalPointer: 0x4240 + slot * 0x20,
      slot,
      name: general.name.trim(),
      portrait: general.portrait,
      personality: general.talk_idx,
    };
  });
  // 0939 reads current player's advisor, independently of the argument stack.
  const faction = scenario?.factions?.find(
    (f) => f?.idx === scenario.player_faction,
  );
  const advisorIndex = faction?.advisor_idx;
  const advisor = Number.isInteger(advisorIndex)
    ? scenario.generals?.[advisorIndex]
    : null;
  return { speakers, advisorName: advisor?.name?.trim() ?? null };
}

/** 075B word arithmetic; AH is a byte, not personality modulo eight. */
export function originalTacticalTalkIndex(selector, personality) {
  if (
    !Number.isInteger(selector) ||
    selector < 0 ||
    selector > 0xffff ||
    !Number.isInteger(personality) ||
    personality < 0 ||
    personality > 0xff
  )
    throw new RangeError("invalid C315 selector/personality");
  return selector < 0x196
    ? selector
    : (0x196 + ((selector - 0x196) << 3) + personality) & 0xffff;
}

export function resolveOriginalTacticalTalk(catalog, context, side, selector) {
  const speaker = context?.speakers?.[side];
  const opponent = context?.speakers?.[side ^ 1];
  if (!speaker || !opponent) return { status: "unresolved-slot-context" };
  if (
    !catalog ||
    catalog.revision !== 1 ||
    catalog.sourceSha256 !== ORIGINAL_TALK_SOURCE_HASH
  )
    return { status: "unresolved-talk-asset" };
  const index = originalTacticalTalkIndex(selector, speaker.personality);
  const record = catalog.records[index];
  if (!record) return { status: "unresolved-talk-index", index };
  // C349 PUSH speaker, PUSH opponent; SS:DI begins at opponent. 097E skips
  // one word. Cursor lives across 084A line breaks; \4 does not consume it.
  const args = [opponent, speaker];
  let cursor = 0;
  let unresolved = false;
  const lines = record.lines.map((line) =>
    line.replace(/\\(.)/g, (_, token) => {
      if (token === "6") {
        cursor++;
        return "";
      }
      if (token === "1") {
        const arg = args[cursor++];
        if (!arg) unresolved = true;
        return arg?.name ?? "";
      }
      if (token === "4" && context.advisorName != null)
        return context.advisorName;
      unresolved = true;
      return "";
    }),
  );
  if (unresolved) return { status: "unresolved-talk-arguments", index };
  return {
    status: "decoded",
    index,
    offset: record.offset,
    speaker: clone(speaker),
    opponent: clone(opponent),
    rawLines: [...record.lines],
    lines,
    text: lines.join("\n"),
    argumentWordsConsumed: cursor,
  };
}

const incompleteMessageState = () => {
  throw new TypeError("incomplete-tactical-message-state");
};
const unsigned = (value, maximum) =>
  Number.isInteger(value) && value >= 0 && value <= maximum;
const word = (value) => unsigned(value, 0xffff);
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const stringLines = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((line) => typeof line === "string");

// Restore accepts data, not executable objects. Check descriptors before cloning
// so accessors are not invoked and non-enumerable/symbol payloads are not lost.
// Undefined is allowed for optional diagnostic source fields (not required data).
export function cloneOriginalMessageData(value) {
  const ancestors = new Set();
  function check(item) {
    if (item == null || typeof item === "string" || typeof item === "boolean")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || ancestors.has(item))
      incompleteMessageState();
    const array = Array.isArray(item);
    if (
      Object.getPrototypeOf(item) !==
        (array ? Array.prototype : Object.prototype) &&
      Object.getPrototypeOf(item) !== null
    )
      incompleteMessageState();
    ancestors.add(item);
    const keys = Reflect.ownKeys(item);
    if (
      array &&
      (keys.length !== item.length + 1 ||
        !Array.from({ length: item.length }, (_, index) =>
          Object.hasOwn(item, index),
        ).every(Boolean))
    )
      incompleteMessageState();
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (
        typeof key !== "string" ||
        !("value" in descriptor) ||
        (!descriptor.enumerable && !(array && key === "length"))
      )
        incompleteMessageState();
      check(descriptor.value);
    }
    ancestors.delete(item);
  }
  check(value);
  return clone(value); // A Proxy/noncloneable value must fail before Session writes.
}

function validTalkIdentity(identity) {
  return (
    record(identity) &&
    unsigned(identity.slot, 127) &&
    identity.legionPointer === 0x2240 + identity.slot * 0x40 &&
    identity.generalPointer === 0x4240 + identity.slot * 0x20 &&
    typeof identity.name === "string" &&
    unsigned(identity.portrait, 0xff) &&
    unsigned(identity.personality, 0xff)
  ); // AH is NOT modulo eight.
}

// Revision 1 captures are retained history, not instructions to re-decode from
// today's catalog/names. Only complete status-specific captures can continue.
function validateMessageSnapshot(snapshot, catalog) {
  if (
    !record(snapshot) ||
    snapshot.revision !== 1 ||
    !Array.isArray(snapshot.slots) ||
    snapshot.slots.length !== 2 ||
    !word(snapshot.wallMinimum)
  )
    incompleteMessageState();
  if (snapshot.catalogHash !== null) {
    if (snapshot.catalogHash !== ORIGINAL_TALK_SOURCE_HASH)
      incompleteMessageState();
    if (!catalog) throw new TypeError("missing-tactical-talk-catalog");
  }
  const context = snapshot.context;
  if (
    context !== null &&
    (!record(context) ||
      !Array.isArray(context.speakers) ||
      context.speakers.length !== 2 ||
      !context.speakers.every(
        (identity) => identity === null || validTalkIdentity(identity),
      ) ||
      !(
        context.advisorName === null || typeof context.advisorName === "string"
      ))
  )
    incompleteMessageState();
  const hasSpeakers =
    context !== null && context.speakers.every(validTalkIdentity);
  for (let side = 0; side < 2; side++) {
    const slot = snapshot.slots[side];
    if (slot === null) continue;
    if (
      !record(slot) ||
      slot.side !== side ||
      slot.hitId !== 27 + side ||
      !word(slot.deadline) ||
      !word(slot.selector) ||
      !(slot.source === undefined || typeof slot.source === "string")
    )
      incompleteMessageState();
    switch (slot.status) {
      case "unresolved-slot-context":
        // Null context / either null speaker is the legitimate unresolved subset.
        if (hasSpeakers) incompleteMessageState();
        break;
      case "unresolved-talk-asset":
        if (!hasSpeakers) incompleteMessageState();
        break;
      case "unresolved-talk-index":
      case "unresolved-talk-arguments":
        if (
          !hasSpeakers ||
          !word(slot.index) ||
          slot.index !==
            originalTacticalTalkIndex(
              slot.selector,
              context.speakers[side].personality,
            )
        )
          incompleteMessageState();
        break;
      case "decoded":
        if (
          !hasSpeakers ||
          snapshot.catalogHash !== ORIGINAL_TALK_SOURCE_HASH ||
          !validTalkIdentity(slot.speaker) ||
          !validTalkIdentity(slot.opponent) ||
          slot.speaker.slot !== context.speakers[side].slot ||
          slot.opponent.slot !== context.speakers[side ^ 1].slot ||
          !word(slot.index) ||
          slot.index !==
            originalTacticalTalkIndex(
              slot.selector,
              slot.speaker.personality,
            ) ||
          !word(slot.offset) ||
          !stringLines(slot.rawLines) ||
          !stringLines(slot.lines) ||
          slot.rawLines.length !== slot.lines.length ||
          slot.text !== slot.lines.join("\n") ||
          !Number.isSafeInteger(slot.argumentWordsConsumed) ||
          slot.argumentWordsConsumed < 0
        )
          incompleteMessageState();
        break;
      default:
        incompleteMessageState();
    }
  }
  const wall = snapshot.wall;
  if (
    wall !== null &&
    (!record(wall) ||
      wall.label !== "門強度" ||
      wall.hitId !== 29 ||
      !word(wall.address) ||
      wall.address < 0xc00 ||
      wall.address >= 0x2000 ||
      wall.address % 0x20 !== 0 ||
      wall.maximum !== 0x97 ||
      !unsigned(wall.value, 0x97) ||
      !word(wall.metric) ||
      wall.metric !== snapshot.wallMinimum ||
      !word(wall.deadline) ||
      !(wall.value === 0 || wall.value === Math.min(0x97, wall.metric >>> 4)))
  )
    incompleteMessageState();
}

export class OriginalBattleMessages {
  constructor({ context = null, catalog = null, snapshot = null } = {}) {
    this.catalog = catalog; // immutable external asset; never reconstructed on restore
    this.context = clone(context);
    this.slots = [null, null];
    this.wall = null;
    this.wallMinimum = 0xffff; // C405, reset only when C407 opens a new window
    if (snapshot) this.restore(snapshot);
  }

  get catalog() {
    return this._catalog;
  }
  set catalog(value) {
    if (
      value != null &&
      (value.revision !== 1 ||
        value.sourceSha256 !== ORIGINAL_TALK_SOURCE_HASH ||
        !value.records)
    )
      throw new TypeError("invalid-tactical-talk-catalog");
    this._catalog = value;
  }

  // Prepare the ENTIRE incoming continuation before any Session writes. Require
  // supplied own u16 words, never register defaults or masked/coerced values.
  prepareRestore(snapshot, registers) {
    const words = [
      "tacticalFrameCounter",
      "side0MarkerAt",
      "side1MarkerAt",
      "wallMarkerAt",
    ].map(
      (key) => registers && Object.getOwnPropertyDescriptor(registers, key),
    );
    if (
      words.some(
        (property) =>
          !property ||
          !property.enumerable ||
          !("value" in property) ||
          !word(property.value),
      )
    )
      incompleteMessageState();
    const [counter, ...markers] = words.map((property) => property.value);
    if (snapshot === undefined || snapshot === null) {
      // FFFF can itself be active at D319=FF; only the explicit legacy subset
      // is compatible. This is NOT a runtime sentinel exemption.
      if (
        markers.some((value) => value !== 0xffff) ||
        (counter & 0xff00) === 0xff00
      )
        incompleteMessageState();
      return new OriginalBattleMessages({ catalog: this.catalog });
    }
    const prepared = new OriginalBattleMessages({ catalog: this.catalog });
    prepared.restore(snapshot);
    for (const [index, slot] of [...prepared.slots, prepared.wall].entries()) {
      if (
        slot === null
          ? markers[index] !== 0xffff
          : slot.deadline !== markers[index]
      )
        incompleteMessageState();
    }
    return prepared;
  }

  show(registers, side, selector, source) {
    if (side !== 0 && side !== 1) throw new RangeError("C315 side must be 0/1");
    const deadline = lowByteDeadline(registers.tacticalFrameCounter, 0x3c);
    registers[markerFor(side)] = deadline;
    const message = {
      side,
      selector,
      source,
      deadline,
      hitId: 27 + side,
      ...resolveOriginalTacticalTalk(
        this.catalog,
        this.context,
        side,
        selector,
      ),
    };
    this.slots[side] = message;
    return {
      type: "tactical-talk-show",
      message: clone(message),
      mask: {
        x: side === 0 ? 14 : 0,
        y: side === 0 ? 18 : 0,
        width: 16,
        height: 5,
      },
    };
  }

  close(registers, side, reason) {
    registers[markerFor(side)] = 0xffff; // C3C0 even when no captured window
    this.slots[side] = null;
    return {
      type: "tactical-talk-close",
      side,
      hitId: 27 + side,
      reason,
      unmask: {
        x: side === 0 ? 14 : 0,
        y: side === 0 ? 18 : 0,
        width: 16,
        height: 5,
      },
    };
  }

  /** C407 called ONLY by B60F after decrement, mode0/kind1. C483 lower-only.
   * Label is literal KI CS:C3FF Big5 AA F9 B1 6A AB D7 (not a TALK record).
   */
  showWall(registers, metric, flags, address) {
    const opening = (registers.wallMarkerAt & 0xffff) === 0xffff;
    if (opening) {
      this.wallMinimum = 0xffff;
      this.wall = {
        label: "門強度",
        hitId: 29,
        address,
        value: null,
        maximum: 0x97,
      };
    }
    const events = opening
      ? [
          {
            type: "tactical-wall-open",
            mask: { x: 16, y: 0, width: 14, height: 2 },
          },
        ]
      : [];
    if (metric < this.wallMinimum) {
      this.wallMinimum = metric;
      const value = flags < 0x80 ? 0 : Math.min(0x97, metric >>> 4);
      registers.wallMarkerAt = lowByteDeadline(
        registers.tacticalFrameCounter,
        0x14,
      );
      this.wall = {
        label: "門強度",
        hitId: 29,
        address,
        value,
        maximum: 0x97,
        metric,
        deadline: registers.wallMarkerAt,
      };
      events.push({ type: "tactical-wall-update", wall: clone(this.wall) });
    }
    return events;
  }

  closeWall(registers, reason) {
    registers.wallMarkerAt = 0xffff;
    this.wall = null; // C405 is retained until next opening.
    return {
      type: "tactical-wall-close",
      reason,
      hitId: 29,
      unmask: { x: 16, y: 0, width: 14, height: 4 },
    };
  }

  /** C048 IDs27/28 are RET; C086 IDs27/28→C30D, 29→C4A6.
   * Caller supplies an already hit-tested local ID, never a global right click.
   */
  input(registers, hitId, button) {
    if (button !== 2) return null;
    if ((hitId === 27 || hitId === 28) && this.slots[hitId - 27])
      return this.close(registers, hitId - 27, "right-click");
    if (hitId === 29 && this.wall)
      return this.closeWall(registers, "right-click");
    return null;
  }

  snapshot() {
    return clone({
      revision: 1,
      catalogHash: this.catalog?.sourceSha256 ?? null,
      context: this.context,
      slots: this.slots,
      wall: this.wall,
      wallMinimum: this.wallMinimum,
    });
  }
  restore(snapshot) {
    const prepared = cloneOriginalMessageData(snapshot);
    validateMessageSnapshot(prepared, this.catalog);
    this.context = prepared.context;
    this.slots = prepared.slots;
    this.wall = prepared.wall;
    this.wallMinimum = prepared.wallMinimum;
  }
}
