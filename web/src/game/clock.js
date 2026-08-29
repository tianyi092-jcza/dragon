// 游戏时钟 — 复刻 KI.EXE 0x1D8E 主循环的时间语义
//
// 逆向依据 (KI.EXE 0x1DF8-0x1E16 / docs/re-notes-kernel.md):
//   CF2 子刻度0..7 → CF3 每日时刻0..23(每刻度=1个势力AI轮) → CF0 日1..当月天数
//   → CF4 月1..12(换月调0x5358结算) → CF6 年(>1000回绕)
//   战略速度 5 档 (0xcfa): 最低速 (4 ticks)、低速 (3 ticks)、普通 (2 ticks)、高速 (1 tick)、最高速 (0 tick)
//   当月天数表 @va 0x98AC = 真实历法 [31,28,31,30,...]
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const STRATEGIC_SPEED_LABELS = [
  "最低速",
  "低速",
  "普通",
  "高速",
  "最高速",
];
// 5 档每刻度流逝毫秒数 (普通档 160ms，1天 24 刻度 ≈ 3.84 秒；最高速 25ms，1天 ≈ 0.6 秒；最低速 480ms，1天 ≈ 11.5 秒)
export const STRATEGIC_SPEEDS = [480, 280, 160, 80, 25];

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

    this._strategicSpeed = 2; // 0最低速 1低速 2普通 3高速 4最高速 — 对应系统选单"戰略速度"
    this._legacyPaused = false;
    this.SPEEDS = STRATEGIC_SPEEDS;
    this._acc = 0;
    this._lastStep = 160;
    this.hold = false;

    this.onDay = onDay;
    this.onMonthEnd = onMonthEnd;
    this.onYearEnd = onYearEnd;
  }

  get strategicSpeed() {
    return this._strategicSpeed;
  }

  set strategicSpeed(value) {
    const idx = Number(value);
    if (Number.isFinite(idx)) {
      this._strategicSpeed = Math.max(0, Math.min(4, Math.trunc(idx)));
    }
  }

  // 兼容旧调用：0 表示暂停；速度档由 strategicSpeed 独立保存。
  get speed() {
    return this._legacyPaused ? 0 : this._strategicSpeed + 1;
  }

  set speed(value) {
    const idx = Number(value);
    if (!Number.isFinite(idx)) return;
    if (idx === 0) {
      this._legacyPaused = true;
      return;
    }
    this.strategicSpeed = idx - 1;
    this._legacyPaused = false;
  }

  get currentStep() {
    return this.SPEEDS[this._strategicSpeed] ?? 160;
  }

  get daysInMonth() {
    return DAYS_IN_MONTH[this.month - 1];
  }

  /** 获取当天时间流逝进度 0.0..1.0 (用于逐帧平滑插值) */
  dayProgress() {
    const step = this.currentStep || this._lastStep || 160;
    this._lastStep = step;
    const frac = Math.min(1, Math.max(0, this._acc / step));
    return Math.min(1, Math.max(0, (this.hour + frac) / 24));
  }

  /** 推进一个子刻度组 (复刻 1D8E: 满8子刻度进位一次时刻) */
  advance(dtMs) {
    if (this.hold || this._legacyPaused) {
      // 菜单/弹窗或旧模态调用暂停战略时钟
      this._acc = 0;
      return false;
    }
    this._acc += dtMs;
    const step = this.currentStep;
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
