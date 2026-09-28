/** Web表现时间；不读取Clock、不补后台债务，不参与规则或快照。 */
export class PresentationClock {
  constructor() { this.time = 0; this.last = null; }
  pause() { this.last = null; }
  reset() { this.time = 0; this.pause(); }
  advance(now, enabled = true) {
    if (!enabled || !Number.isFinite(now)) { this.pause(); return 0; }
    const delta = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    // 可见页面的慢帧仍须推进，否则战略计算每帧>100ms会永久停住动画。
    // 每帧最多消化100ms，不积欠账；后台由显式pause处理，恢复首帧仍为0。
    const dt = Math.min(delta, 100);
    this.time += dt;
    return dt;
  }
}
