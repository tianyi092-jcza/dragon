// BATTLE.DAT 开场脚本 VM 解释器 — 复刻 KI.EXE 执行器 0xA426/0xA436
//
// 逆向定论 (docs/re-notes-kernel.md ★BATTLE.DAT 最终定论 + 2026-08-24 反汇编补全):
//   脚本字 u16le: op=低5位(跳转表 cs:[0xA466]×19), cc/imm=次3位, 参数 ah=高8位
//   执行器每帧最多取 1 条指令; WAIT 期间仅递减计数器 (0xA426)
//   op0  WAIT      [0xD313]=ah, 逐帧递减阻塞
//   op1  CMD       [0xD347]=ah 当前命令值
//   op2  MODE      [0xD33E]= ah==0?0x3A : ah==1?0x24 : 0x10 (镜头步进模式)
//   op3  UCMD      给单位区(ds:[0xD30E]+0x600+i*0x100)+0x1B 写命令:
//                  ah==5→调 0xA8F6 列阵; ah==3 且 [0xAB4F]==0 →改1;
//                  imm==7 全体6单位, 否则单兵 #imm
//   op4  R=[0xD346]
//   op5  R= [0xD33C]<0x1C?0 :==?1:>2
//   op6/7 扫描单位区 0x600/0x000 的 +0x1A 取最小值(≥4归0; 无符号字节下恒0)
//   op8  R= 相机高位≤0x20 ? 2 : 低位
//   op9  R= AX mod bl (0xECE0 随机源近似)
//   op10 Jcc       子表 0xA59C: cc0=JMP,1=je,2=jne,3=jae(R>=ah),4=jbe(R<=ah);
//                  目标字 t=[pc+1]: t&0xFF≠0→t 本身是落点指令(两条路径都到 t);
//                  t&0xFF==0→成立则绝对跳 (t>>8)*2, 不成立跳过 t
//   op11/12 R=min(255, [[0xD30A]+0x24 / +4])
//   op13 SEL       按 +0x24==imm*18 选边置 bit3+[+0x1B]=ah 并调 0xA8DE
//   op14 R=[0xD31D]
//   op15 SCAN16    扫 ds:[0xC00]+i*0x20 十六条目: 无 bit0 旗标时 R=(min[+0x18]<<2)>>8
//   op16 FLAGS     调 0xC315 画军旗 ah 次(分阶段旗帜动画)
//   op17 R= 区内任一单位命令[+0x1B]>=9 (仍在移动)?
//   op18 R=[[0xD30E]:0x600+3]
//
// Web 移植策略: 控制流(op0/1/2/10/16)严格复刻; 状态查询委托 io 钩子映射到
//   web 战斗模型(编队距离/移动中判定); 结尾待机循环由调用方超时/点击结束。

export class BattleScript {
  /** @param words u16 数组(128字) @param io 状态钩子集合 */
  constructor(words, io) {
    this.words = words;
    this.io = io;
    this.pc = 0;
    this.wait = 0; // [0xD313]
    this.R = 0; // [0xD315]
    this.cmd = 0; // [0xD347]
    this.mode = 0x3a; // [0xD33E]
    this.done = false;
    this.steps = 0;
  }

  /** 推进一虚拟帧。返回 'run' | 'done' */
  step() {
    if (this.done) return "done";
    if (this.wait > 0) {
      this.wait--;
      return "run";
    }
    if (this.pc >= this.words.length) {
      this.done = true;
      return "done";
    }
    const w = this.words[this.pc++];
    const op = w & 0x1f,
      cc = (w >> 5) & 7,
      ah = w >> 8;
    switch (op) {
      case 0: // WAIT
        this.wait = ah;
        break;
      case 1: // CMD
        this.cmd = ah;
        break;
      case 2: {
        // MODE
        // ah==0→0x3A / ah==1→0x24 / 其余→0x10 (镜头步进模式三档)
        if (ah === 0) this.mode = 0x3a;
        else if (ah === 1) this.mode = 0x24;
        else this.mode = 0x10;
        this.io.camMode?.(this.mode);
        break;
      }
      case 3: // UCMD
        if (!this.io.gate2?.()) {
          if (ah === 5) this.io.formation();
          else {
            let c = ah;
            if (c === 3 && !this.io.themeFlag?.()) c = 1;
            this.io.issueCmd(c, cc); // cc 位即单兵序号(7=全体)
          }
        }
        break;
      case 4:
        this.R = this.io.d346?.() ?? 0;
        break;
      case 5: {
        const v = this.io.d33c?.() ?? 0;
        // 对应原版 jb/je/ja 三分支
        if (v < 0x1c) this.R = 0;
        else if (v === 0x1c) this.R = 1;
        else this.R = 2;
        break;
      }
      case 6: // 扫描 0x600 区 (反汇编证实恒 0, 保留钩子以便调试)
        this.R = this.io.scanUnits?.("active") ?? 0;
        break;
      case 7: // 扫描 0x000 区
        this.R = this.io.scanUnits?.("other") ?? 0;
        break;
      case 8: {
        const p = this.io.camPos?.() ?? { hi: 0xff, lo: 0 };
        this.R = p.hi <= 0x20 ? 2 : p.lo;
        break;
      }
      case 9: {
        const bl = ah || 6;
        this.R = Math.abs(Math.floor(this.io.rand?.() * 0x106)) % bl;
        break;
      }
      case 10: // Jcc
        this.jump(cc, ah);
        break;
      case 11:
        this.R = Math.min(0xff, this.io.mapWord?.(0x24) ?? 0);
        break;
      case 12:
        this.R = Math.min(0xff, this.io.mapWord?.(4) ?? 0);
        break;
      case 13: // SEL
        this.io.select?.(cc, ah);
        break;
      case 14:
        this.R = this.io.d31d?.() ?? 0;
        break;
      case 15:
        this.R = this.io.scan16?.() ?? 0;
        break;
      case 16: // FLAGS
        this.io.flags?.(ah);
        break;
      case 17:
        this.R = this.io.moving?.() ? 1 : 0;
        break;
      case 18:
        this.R = this.io.unitByte?.(3) ?? 0;
        break;
      default: // op>=19: 跳转表越界, 视为脚本终止
        this.done = true;
        return "done";
    }
    if (++this.steps > 4000 || this.pc >= this.words.length) this.done = true;
    return this.done ? "done" : "run";
  }

  /** op10 条件跳转 (0xA59C 子表语义) */
  jump(cc, ah) {
    const tIdx = this.pc; // 目标字位置
    if (tIdx >= this.words.length) {
      this.done = true;
      return;
    }
    const t = this.words[tIdx];
    const cond =
      cc === 0 ||
      (cc === 1 && this.R === ah) ||
      (cc === 2 && this.R !== ah) ||
      (cc === 3 && this.R >= ah) ||
      (cc === 4 && this.R <= ah);
    if (cond) {
      if (t & 0xff)
        this.pc = tIdx; // 落点=t 字本身(作为指令执行)
      else this.pc = t >> 8; // 绝对跳转: 原版 si=bh*2 是字节偏移 → 字索引=bh
    } else if (!(t & 0xff)) {
      this.pc = tIdx + 1; // 不成立且目标是数据字 → 跳过
    } // 不成立且 t 是指令字 → 顺序落入 t (原版双路径设计)
  }
}
