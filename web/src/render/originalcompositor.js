// Bounded native DDB4/DE95/DFBB/E085/E0E1. No rule state or RNG access.
// Explicit scratch/framebuffer inputs preserve hardware-history dependencies.
export function compositeOriginalRecord(
  scratch,
  graphics,
  code,
  quadrant = null,
) {
  const base = code * 0x140;
  if (!Number.isInteger(code) || code < 0 || base + 0x140 > graphics.length)
    throw new RangeError("invalid original graphics code");
  const source = quadrant == null ? 0 : quadrant * 0x10;
  const destination = quadrant == null ? 0 : 0x30 - source;
  const count = quadrant == null ? 0x40 : 0x10;
  for (let i = 0; i < count; i++) {
    const mask = graphics[base + source + i];
    for (let plane = 0; plane < 4; plane++) {
      const at = plane * 0x40 + destination + i;
      scratch[at] =
        (scratch[at] & ~mask) |
        graphics[base + (plane + 1) * 0x40 + source + i];
    }
  }
}

export class OriginalBattleCompositor {
  constructor({ scratch, framebuffer, framebufferKnown = null } = {}) {
    // CS:E164 is persistent, not cleared by D958/D971 or DDB4. Callers must
    // supply a proven process-initial value or a captured continuation.
    if (
      !(scratch instanceof Uint8Array) ||
      scratch.length !== 0x100 ||
      !(framebuffer instanceof Uint8Array) ||
      framebuffer.length !== 480 * 368
    )
      throw new TypeError("explicit native scratch and framebuffer required");
    if (
      framebufferKnown != null &&
      (!(framebufferKnown instanceof Uint8Array) ||
        framebufferKnown.length !== 480 * 368)
    )
      throw new TypeError("invalid native framebuffer provenance mask");
    this.scratch = scratch.slice();
    this.framebuffer = framebuffer.slice();
    // Pre-DDB4 VGA/UI/cursor pixels are unclosed. Zero bytes with a zero mask
    // are storage only, never a claim that the original framebuffer was black.
    this.framebufferKnown =
      framebufferKnown?.slice() ?? new Uint8Array(480 * 368);
  }
  draw(display, graphics) {
    const g = display.geometry;
    if (g.columns !== 32 || g.rows !== 30 || g.clipRows !== 24)
      throw new RangeError("DDB4 requires native 32x30 display geometry");
    if (!(graphics instanceof Uint8Array) || graphics.length !== 552 * 0x140)
      throw new TypeError("192 MDL + 360 SCH records required");
    const bytes = display.bytes;
    const word = (at) => bytes[at] | (bytes[at + 1] << 8);
    let writes = 0;
    for (let row = 0; row < 23; row++) {
      for (let column = 1; column < 31; column += 2) {
        const cell = (row * 32 + column) * 32;
        let flags = bytes[cell],
          maximum = bytes[cell + 1];
        if (flags & 8) continue;
        for (const delta of [-32, 32, 0x3e0, 0x420]) {
          flags |= bytes[cell + delta];
          if (maximum <= bytes[cell + delta + 1]) {
            maximum = bytes[cell + delta + 1];
            flags |= 0x10;
          }
        }
        if (flags < 0x40) continue;
        const floor = bytes[cell + 2];
        let slot = cell + 4 + floor * 2;
        const code = word(slot);
        // DE38..DE4F: direct plane copy bypasses the mask and scratch entirely.
        if (
          ((maximum - floor) & 0xff) === 0 &&
          code < 0x20 &&
          !(flags & 0x50)
        ) {
          this.blit(
            graphics.subarray(code * 0x140 + 0x40, code * 0x140 + 0x140),
            column,
            row,
          );
        } else {
          // DE95 INC DX / SHR DX: loop DH=floor((max-floor)/2); DL's
          // bit5 remains the OR of the five original highlight bits.
          const shifted =
            ((((((maximum - floor) & 0xff) << 8) | flags) + 1) & 0xffff) >>> 1;
          const levels = (shifted >>> 8) + 1;
          for (let level = 0; level < levels; level++, slot += 4) {
            for (const [delta, quadrant] of [
              [-32, 3],
              [32, 2],
              [0, null],
              [0x3e0, 1],
              [0x420, 0],
            ]) {
              for (const channel of [0, 2]) {
                const sprite = word(slot + delta + channel);
                if (sprite)
                  compositeOriginalRecord(
                    this.scratch,
                    graphics,
                    sprite,
                    quadrant,
                  );
              }
            }
          }
          if (shifted & 0x20) {
            // DF4E..DFA3: highlight order differs from ordinary layers.
            for (const [delta, quadrant] of [
              [0, null],
              [-32, 3],
              [32, 2],
              [0x3e0, 1],
              [0x420, 0],
            ])
              if (bytes[cell + delta] & 0x20)
                compositeOriginalRecord(this.scratch, graphics, 0, quadrant);
          }
          this.blit(this.scratch, column, row);
        }
        bytes[cell] &= 0x3f;
        bytes[cell - 32] &= 0x3f;
        writes++;
      }
      bytes[(row * 32 + 30) * 32] &= 0x3f;
    }
    for (let column = 0; column < 32; column += 2)
      bytes[(23 * 32 + column) * 32] &= 0x3f;
    return writes;
  }
  blit(planes, column, row) {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 32; x++) {
        const quadrant = (x >= 16 ? 1 : 0) + (y >= 8 ? 2 : 0);
        const at = quadrant * 16 + (y & 7) * 2 + ((x & 15) >> 3),
          bit = 7 - (x & 7);
        let color = 0;
        for (let plane = 0; plane < 4; plane++)
          color |= ((planes[plane * 64 + at] >> bit) & 1) << plane;
        const destination = (row * 16 + y) * 480 + (column - 1) * 16 + x;
        this.framebuffer[destination] = color;
        this.framebufferKnown[destination] = 1;
      }
  }
  snapshot() {
    return {
      scratch: Array.from(this.scratch),
      framebuffer: Array.from(this.framebuffer),
      framebufferKnown: Array.from(this.framebufferKnown),
    };
  }
  static fromSnapshot(snapshot) {
    if (
      !snapshot ||
      !["scratch", "framebuffer"].every(
        (key) =>
          Array.isArray(snapshot[key]) &&
          snapshot[key].every(
            (v) =>
              Number.isInteger(v) &&
              v >= 0 &&
              v <= (key === "framebuffer" ? 15 : 255),
          ),
      )
    )
      throw new TypeError("invalid compositor snapshot");
    if (
      snapshot.framebufferKnown != null &&
      (!Array.isArray(snapshot.framebufferKnown) ||
        snapshot.framebufferKnown.length !== 480 * 368 ||
        snapshot.framebufferKnown.some((v) => v !== 0 && v !== 1))
    )
      throw new TypeError("invalid compositor provenance snapshot");
    return new OriginalBattleCompositor({
      scratch: Uint8Array.from(snapshot.scratch),
      framebuffer: Uint8Array.from(snapshot.framebuffer),
      framebufferKnown: snapshot.framebufferKnown
        ? Uint8Array.from(snapshot.framebufferKnown)
        : null,
    });
  }
}

/** App/process-scoped CS:E164 owner plus one battle-scoped native reference.
 * Modern panning never calls this class; only original DDB4 boundaries do. */
export class OriginalBattleDisplayProcess {
  constructor({ scratch = null } = {}) {
    if (
      scratch != null &&
      (!(scratch instanceof Uint8Array) || scratch.length !== 0x100)
    )
      throw new TypeError("invalid process scratch");
    this.scratch = scratch?.slice() ?? new Uint8Array(0x100);
    this.battle = null;
    this.graphics = null;
    this.boundary = 0;
  }

  startBattle(display, graphics) {
    if (!display) throw new TypeError("native display is required");
    if (this.battle) this.endBattle();
    this.graphics = graphics;
    this.battle = new OriginalBattleCompositor({
      scratch: this.scratch,
      framebuffer: new Uint8Array(480 * 368),
      framebufferKnown: new Uint8Array(480 * 368),
    });
    this.boundary = 0;
    return this.commit(display);
  }

  commit(display) {
    if (!this.battle || !this.graphics)
      throw new Error("native battle reference is not active");
    const writes = this.battle.draw(display, this.graphics);
    this.scratch.set(this.battle.scratch);
    this.boundary++;
    return { boundary: this.boundary, writes };
  }

  endBattle() {
    if (this.battle) this.scratch.set(this.battle.scratch);
    this.battle = null;
    this.graphics = null;
    this.boundary = 0;
  }

  snapshotBattle() {
    return this.battle
      ? { boundary: this.boundary, compositor: this.battle.snapshot() }
      : null;
  }

  restoreBattle(snapshot, graphics) {
    if (
      !snapshot ||
      !Number.isSafeInteger(snapshot.boundary) ||
      snapshot.boundary < 0
    )
      throw new TypeError("invalid native battle-history snapshot");
    const compositor = OriginalBattleCompositor.fromSnapshot(
      snapshot.compositor,
    );
    this.scratch.set(compositor.scratch);
    this.battle = compositor;
    this.graphics = graphics;
    this.boundary = snapshot.boundary;
  }
}
