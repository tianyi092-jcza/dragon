// KI 25A3..25E8: select the live slot, gate its action, then run its daily
// settlement and tail before visiting the next slot. Evidence: AI chain P16.
// This cursor owns sequencing only. The caller owns command/battle effects,
// 2600/264A/2A7E bodies, canonical RNG, weather and scenario lifetime.

function byte(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new TypeError(`Legion slot requires an explicit byte: ${field}`);
  }
  return value;
}

export class LegionSlotBatch {
  constructor({ firstSlot, endSlot, settleDaily }) {
    if (
      !Number.isInteger(firstSlot) ||
      !Number.isInteger(endSlot) ||
      firstSlot < 0 ||
      firstSlot >= endSlot ||
      endSlot > 128
    ) {
      throw new RangeError("Invalid legion slot interval");
    }
    this.nextSlot = firstSlot;
    this.endSlot = endSlot;
    this.settleDaily = settleDaily === true;
    this.currentRecord = null;
    this.phase = "slot";
  }

  cancel() {
    this.currentRecord = null;
    this.phase = "cancelled";
  }

  // Each returned operation must finish before requesting the next one.
  // In particular, after an asynchronous action the next operation is the
  // CURRENT record's daily/tail, even if it was removed from the live list.
  // Production uses 16-slot intervals; isolated tools may visit a full table.
  next(lookup) {
    for (;;) {
      if (this.phase === "cancelled") return { kind: "cancelled" };
      if (this.phase === "done") return { kind: "done" };
      if (this.phase === "daily") {
        this.phase = "tail";
        if (this.settleDaily) {
          return {
            kind: "daily",
            slot: this.nextSlot,
            record: this.currentRecord,
          };
        }
      }
      if (this.phase === "tail") {
        const record = this.currentRecord;
        const slot = this.nextSlot++;
        this.currentRecord = null;
        this.phase = "slot";
        return { kind: "tail", slot, record };
      }
      if (this.nextSlot === this.endSlot) {
        this.phase = "done";
        return { kind: "done" };
      }
      // An absent record means a declared empty slot, not an unknown byte.
      // The adapter must include inactive bit3 return records in this view.
      const record = lookup(this.nextSlot);
      if (record == null) {
        this.nextSlot++;
        continue;
      }
      const status = byte(record.status, "status");
      if (status < 0x80) {
        const slot = this.nextSlot++;
        if (status & 8) return { kind: "inactive", slot, record };
        continue;
      }
      const delay = (byte(record.moveDelay, "moveDelay") - 1) & 0xff;
      const due = delay === 0;
      // No guessed legacy phase. Only a due action reads the reload byte.
      const nextDelay = due ? byte(record.movePeriod, "movePeriod") : delay;
      record.moveDelay = nextDelay;
      this.currentRecord = record;
      this.phase = "daily";
      if (due) {
        record.status = status & 0xdf;
        return { kind: "action", slot: this.nextSlot, record };
      }
    }
  }
}
