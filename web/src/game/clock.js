// 游戏时钟 — 复刻 KI.EXE 0x1D8E 主循环的时间语义
//
// 逆向依据 (docs/re-notes-kernel.md):
//   CF2 子刻度0..7 → CF3 每日时刻0..23(每刻度=1个势力AI轮) → CF0 日1..当月天数
//   → CF4 月1..12(换月调0x5358结算) → CF6 年(>1000回绕)
//   当月天数表 @va 0x98AC = 真实历法 [31,28,31,30,...]
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export class Clock {
  /**
   * @param opts
   *   onTick      每24刻度(游戏一天)结束
   *   onMonthEnd  每月结束 (year, month) — 对应 KI.EXE call 0x5358 月度结算
   *   onYearEnd   每年结束
   */
  constructor({
    startYear,
    startMonth,
    startDay = 1,
    onDay = null,
    onMonthEnd = null,
    onYearEnd = null,
  }) {
    this.sub = 0; // CF2: 子刻度 0..7
    this.hour = 0; // CF3: 每日时刻 0..23
    this.day = startDay; // CF0: 日 1..当月天数
    this.month = startMonth; // CF4: 月 1..12
    this.year = startYear; // CF6: 年

    this.speed = 2; // 0暂停 1慢 2中 3快 — 对应系统菜单"戰略速度"
    this.SPEEDS = [0, 512, 256, 96]; // ms/刻度
    this._acc = 0;
    this._lastStep = 256;

    this.onDay = onDay;
    this.onMonthEnd = onMonthEnd;
    this.onYearEnd = onYearEnd;
  }

  get daysInMonth() {
    return DAYS_IN_MONTH[this.month - 1];
  }

  /** 获取当天时间流逝进度 0.0..1.0 (用于逐帧平滑插值) */
  dayProgress() {
    const step = this.SPEEDS[this.speed] || this._lastStep || 256;
    if (this.speed > 0) this._lastStep = step;
    const frac = Math.min(1, Math.max(0, this._acc / step));
    return Math.min(1, Math.max(0, (this.hour + frac) / 24));
  }

  /** 推进一个子刻度组 (复刻 1D8E: 满8子刻度进位一次时刻) */
  advance(dtMs) {
    if (this.speed === 0) return false;
    if (this.hold) {
      // 鼠标活动战略暂停 (静止1秒后由 GameBar.pokeClock 解除)
      this._acc = 0;
      return false;
    }
    this._acc += dtMs;
    const step = this.SPEEDS[this.speed];
    let ticked = false;
    while (this._acc >= step) {
      this._acc -= step;
      this._tick();
      ticked = true;
    }
    return ticked;
  }

  _tick() {
    this.hour++;
    if (this.hour > 23) {
      // 一天结束 (KI.EXE 1DE0 分支)
      this.hour = 0;
      if (this.onDay) this.onDay(this);
      this.day++;
      if (this.day > this.daysInMonth) {
        // 月末 (1DA3 分支)
        this.day = 1;
        this.month++;
        if (this.month > 12) {
          // 年末 (1DA3→1DAA 分支)
          this.month = 1;
          this.year++;
          if (this.year > 1000) this.year = 998; // 复刻 cmp 0x3E8 / 重置 0x3E6+1... 取整
          if (this.onYearEnd) this.onYearEnd(this);
        }
        if (this.onMonthEnd) this.onMonthEnd(this); // ★月度结算钩子 (对应 0x5358)
      }
    }
  }

  serialize() {
    // 对应存档文件头 0x3B 字节里的时钟区
    return { year: this.year, month: this.month, day: this.day };
  }
}
