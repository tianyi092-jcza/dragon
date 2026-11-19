// 游戏时钟 — 复刻 KI.EXE 0x1D8E 主循环的时间语义
//
// 逆向依据 (KI.EXE 0x1DF8-0x1E16 / docs/re-notes-kernel.md):
//   CF2 子刻度0..8 → CF3 每日时刻0..23(进位时轮询1个势力槽) → CF0 日1..当月天数
//   → CF4 月1..12(换月调0x5358结算) → CF6 年(>1000回绕)
//   战略速度 5 档 (0xcfa): 最低速 (4 IRQ counts)、低速 (3)、普通 (2)、高速 (1)、最高速 (0，无等待)
//   当月天数表 @va 0x98AC = 真实历法 [31,28,31,30,...]
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const STRATEGIC_SPEED_LABELS = [
  "最低速",
  "低速",
  "普通",
  "高速",
  "最高速",
];
// YNSOUND:08D7/0930..093D：PIT除数256，每16 IRQ调用KI:0356。
// KI:1DF8以CFA=4/3/2/1/0等待累计回调；保留原时基证据，不作为Web档位。
export const STRATEGIC_TIMER_MS = (1000 * 256 * 16) / 1193182;

// Web产品决定：用户指定五档墙钟间隔（ms），不是原DOS等待值。
// 每RAF最多两次128槽轮转；正常周期2/3动作相隔16/24次主更新，
// 因而单帧至多提交一个常规道路步点。迟到时丢超额债务，不跳点追赶。
// 60Hz最高约960更新/秒，高刷仍受1.0ms档位约束（1000更新/秒）。
// 依据及旧速度政策撤换见 docs/re-notes-strategic-time.md §6。
export const MAX_TICKS_PER_FRAME = 16;
export const STRATEGIC_SPEEDS = [6.5, 5.0, 4.8, 1.8, 1.0];

export class Clock {
  /**
   * @param opts
   *   onStrategicTick  每次主更新；9次更新进一时刻，新日从hour=1开始
   *   onDay       旧日结束（日期尚未进位）
   *   onMonthEnd  新年月已写、day=0时，对应 KI.EXE call 0x5358 月结
   *   onYearEnd   每年结束
   */
  constructor({
    startYear,
    startEra = null,
    startMonth,
    startDay = 1,
    onStrategicTick = null,
    onStrategicUpdateComplete = null,
    onSyncHold = null,
    onHour = null,
    onDay = null,
    onMonthEnd = null,
    onYearEnd = null,
  }) {
    this.sub = 0; // CF2: 子刻度 0..8
    this.hour = 0; // CF3: 每日时刻 0..23
    this.day = startDay; // CF0: 日 1..当月天数
    this.month = startMonth; // CF4: 月 1..12
    this.year = startYear; // CF6: 年
    // CHAPTER-WB Web calendar: explicit era enables forward-only years, no 0.
    // Unlabelled historical content retains its native year-wrap contract.
    if (startEra !== null && (startEra !== 'bc' && startEra !== 'ad' ||
        !Number.isSafeInteger(startYear) || startYear < 1))
      throw new RangeError('calendar requires bc|ad and a positive year');
    this.era = startEra;

    this._strategicSpeed = 2; // 0最低速 1低速 2普通 3高速 4最高速 — 对应系统选单"戰略速度"
    this._legacyPaused = false;
    this.SPEEDS = STRATEGIC_SPEEDS;
    this._acc = 0;
    this._renderPhase = 0; // 已发布的显示相位，不是待执行规则的毫秒预算。
    // 单调战略更新序号仅供表现层插值；不参与任何规则、RNG 或存档状态。
    this.strategicTickSerial = 0;
    this.hold = false;
    this._pendingDayAdvance = false;
    this._pendingMonthAdvance = false;
    this._pendingStrategicAdvance = false;

    this.onStrategicTick = onStrategicTick;
    this.onStrategicUpdateComplete = onStrategicUpdateComplete;
    this._pendingPresentation = false;
    this.onSyncHold = onSyncHold;
    this.onHour = onHour;
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
      const phase = Math.min(1, Math.max(0, this._acc / this.currentStep));
      this._strategicSpeed = Math.max(0, Math.min(4, Math.trunc(idx)));
      // 变速只改后续墙钟步长，不能把旧毫秒余额放大成规则欠账或插值跳跃。
      this._acc = phase * this.currentStep;
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
    return this.SPEEDS[this._strategicSpeed] ?? STRATEGIC_SPEEDS[2];
  }

  get daysInMonth() {
    return DAYS_IN_MONTH[this.month - 1];
  }

  /** 获取当前主更新间的插值进度0..1，供军团单步移动平滑显示。 */
  dayProgress() {
    return this._renderPhase;
  }

  /**
   * 浏览器RAF入口：每个显示帧至多执行MAX_TICKS_PER_FRAME次战略主更新。
   * 延迟帧只保留上限内的相位，不追赶整帧欠账；每次更新后查hold，任一
   * 接战置hold即停（见MAX_TICKS_PER_FRAME注释）。
   */
  advanceFrame(dtMs) {
    this._finishStrategicUpdate();
    if (this.hold || this._legacyPaused) {
      this._acc = 0;
      return false;
    }
    const step = this.currentStep;
    const elapsed = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
    this._acc = Math.min(this._acc + elapsed, step * MAX_TICKS_PER_FRAME);
    if (this._acc < step) {
      this._renderPhase = Math.max(this._renderPhase, this._acc / step);
      return false;
    }
    let advanced = false;
    // Count before repeated fractional subtraction so the capped frame does not
    // lose its last update to floating-point drift at fractional intervals.
    const ticks = Math.min(MAX_TICKS_PER_FRAME, Math.floor(this._acc / step));
    for (let n = 0; n < ticks; n++) {
      this._acc = Math.max(0, this._acc - step);
      this._tick();
      this.onSyncHold?.();
      this._finishStrategicUpdate();
      advanced = true;
      if (this.hold || this._legacyPaused) {
        this._acc = 0;
        break;
      }
    }
    // hold仍丢弃规则欠账，但同一serial的显示不得倒退。恢复后预算重新
    // 累积，直到追上冻结相位；新主更新才从0起。中途draw不看未来预算。
    this._renderPhase = Math.max(this._renderPhase, this._acc / step);
    return advanced;
  }

  /** 推进子刻度组；受控测试/离线调度可消费完整dt。 */
  advance(dtMs) {
    this._finishStrategicUpdate();
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
      // onStrategicTick内可能刚建立战术层/委任过渡；不要依赖下一帧的
      // GameBar.syncClock才写hold，否则高速档同一RAF的catch-up循环会继续
      // 推进战略时间，且过渡动画自身没有获得重绘/冻结边界。
      this.onSyncHold?.();
      this._finishStrategicUpdate();
      // onDay 可能打开战术层或委任过渡；立即终止本次大 dt 的追赶循环。
      if (this.hold || this._legacyPaused) {
        this._acc = 0;
        break;
      }
    }
    this._renderPhase = Math.max(this._renderPhase, this._acc / step);
    return ticked;
  }

  // KI:1D0B returns through the calendar before 1CC9/2533 prepares objects.
  // A Web message may suspend that return; flush it once, before the next tick.
  _finishStrategicUpdate() {
    if (!this._pendingPresentation || this.hold || this._legacyPaused ||
        this._pendingStrategicAdvance || this._pendingDayAdvance ||
        this._pendingMonthAdvance) return;
    this._pendingPresentation = false;
    this.onStrategicUpdateComplete?.(this);
  }

  _tick() {
    if (this._pendingStrategicAdvance) {
      this._pendingStrategicAdvance = false;
      this._advanceStrategicCalendar();
      return;
    }
    if (this._pendingDayAdvance || this._pendingMonthAdvance) {
      this._pendingDayAdvance = false;
      if (!this._advanceDayCalendar()) return;
      this.hour = 1;
      this.sub = 0;
      if (this.onHour) this.onHour(this);
      return;
    }

    // 只在实际执行0x1D0B时递增；延后日历进位不能被当作军团移动帧。
    this.strategicTickSerial++;
    this._renderPhase = 0;
    this._pendingPresentation = true;

    // KI.EXE 0x1D0B：每次现实时间步先处理一个城槽、16个军团槽和
    // 其它战略状态，再由0x1D8E推进CF2/CF3。战斗在其中打开时，日历推进
    // 延到覆盖层结束后的下一步，不能重复处理同一批槽。
    if (this.onStrategicTick) this.onStrategicTick(this);
    if (this.hold || this._legacyPaused) {
      this._pendingStrategicAdvance = true;
      return;
    }
    this._advanceStrategicCalendar();
  }

  _advanceStrategicCalendar() {
    if (this.sub < 8) {
      this.sub++;
      return;
    }
    if (this.hour < 23) {
      this.hour++;
    } else {
      // 1DD7 increments the day, 1DDB clears CF3, then 1DE0 increments it:
      // every subsequent day starts at hour 1, not hour 0.
      // Keep CF3=23 and CF2=8 throughout the suspended 5358 call.
      // Their resets at 1DDB/1DE4 occur only after its real return.
      if (this.onDay) this.onDay(this);
      if (this.hold || this._legacyPaused) {
        this._pendingDayAdvance = true;
        return;
      }
      if (!this._advanceDayCalendar()) return;
      this.hour = 1;
    }
    this.sub = 0;
    if (this.onHour) this.onHour(this);
  }

  _advanceDayCalendar() {
    if (this._pendingMonthAdvance) {
      // The UI has finished the remaining 5358 steps. Resume at 1DD7,
      // without replaying settlement, RNG, or the current city/legion batch.
      this._pendingMonthAdvance = false;
      this.day = (this.day + 1) & 0xff;
      return true;
    }
    if (this.day < this.daysInMonth) {
      this.day++;
      return true;
    }
    // 1DA3..1DD7: year/month and the new month length are committed before
    // 5358; the day low byte is zero during that call and increments after RET.
    this.day = 0;
    let yearEnded = false;
    if (this.month >= 12) {
      if (this.era === 'bc') {
        if (this.year === 1) this.era = 'ad';
        else this.year--;
      } else if (this.era === 'ad') {
        this.year++;
      } else {
        if (this.year >= 1000) this.year = 998;
        this.year = (this.year + 1) & 0xffff;
      }
      this.month = 0;
      yearEnded = true;
    }
    this.month++;
    this._pendingMonthAdvance = true;
    if (yearEnded && this.onYearEnd) this.onYearEnd(this);
    if (this.onMonthEnd) this.onMonthEnd(this);
    if (this.hold || this._legacyPaused) return false;
    this._pendingMonthAdvance = false;
    this.day = (this.day + 1) & 0xff;
    return true;
  }

  serialize() {
    // 对应存档文件头 0x3B 字节里的时钟区
    return { year: this.year, month: this.month, day: this.day,
      ...(this.era === null ? {} : { era: this.era }) };
  }
}
