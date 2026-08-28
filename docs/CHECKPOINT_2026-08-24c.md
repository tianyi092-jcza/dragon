# CHECKPOINT Journal — 2026-08-24 会话二（迁都 → 可玩状态）

> 本 journal 记录本轮会话完整进展与调试过程，吸收并取代 CHECKPOINT_2026-08-24b.md（其内容已并入）。
> 持久事实已沉淀至 SESSION_HANDOFF.md（项目记忆）；逆向细节在 re-notes-kernel.md。

## 会话主线（按时间序）

1. BATTLE.DAT 开场脚本 VM 回放（会话前半，详见 §1）
2. 外交扩展·迁都（§2）
3. 天灾/暴动系统（§3）
4. 觐见台词四档 + 重大语义修正（§4）
5. 0xCDE 结案 + PC 喇叭音效（§5）
6. 结束动画系统（§6）
7. LSP/代码风格清理（§7）
8. 開場動畫系統（§8）
9. BGM 音乐逆向结案（§9）
10. OPEN_S1 尾块结案（§10）
11. END_S13/14/15 结案（§11）
12. 音效恢复+开关、可玩状态（§12）

---

## 1. BATTLE.DAT 开场脚本 VM 回放 ✅

**逆向**：反汇编执行器 0xA426/0xA436 与 19 项跳转表全部 handler，实锤指令字格式 op=低5位/cc=次3位/ah=高8位；每帧最多 1 条指令，WAIT 计数器 [0xD313] 阻塞。

**★关键勘误（调试过程）**：op10 条件跳转首版把目标字 t&0xFF==0 的 si=bh*2 当"字索引×2"，导致 block8(pc240)/block9(pc136) PC 跑飞出界。逐条反汇编 0xA59C 子表后确认 bh*2 是**字节偏移**（字索引=bh）；cc 表实为 0=JMP/1=je/2=jne/3=jae/4=jbe。

**实现**：battlescript.js（控制流严格复刻，状态查询委托 io 钩子映射 web 战斗模型）；battle.js mkUnit 加 hx/hy 槽位+placeStaging() 退场待命；battleview.js startCutscene/updateCutscene(60fps 虚拟帧)/endCutscene(snap)/40s 安全阀。

**验证**：VM 节奏与原版一致（2.99s=19 指令+160 等待帧）；编队行军 distToSlots=[6,6,6,150]；跳过/时钟恢复/自动决战全绿。

## 2. 外交扩展·迁都 ✅

- 反汇编 0x6909：城池选择器仅列己方城（[di+0x16]&0xF）→同主城 TALK 0x93 回环→确认→0x33FD 改主城指针→0x33EA 战报。
- **勘误**：0x699E「請出陣」实为玩家自身出擊指令（兵力≥600/武将门槛检查），非外交；web dispatch() 已覆盖。
- 实现 moveCapital + hud「遷都」tab；验证許昌→濃陰、重复迁都报错、地图标记自动跟随。

## 3. 天灾/暴动 ✅

- 反汇编 0x22DB（天灾：rand&1 50%→rand<0xC0 75%→选城，灾区 x±5/y±5，强度 ((rand&7)+8)<<2）+ 0x237E（Chebyshev≤0x14 扣 强度-dist>>1）+ 0x2286（暴动：9.4%×rand&63<稳定度）。
- disaster.js：rng 可注入；monthEnd 接入。
- **调试**：node 种子统计验证门控——2000 月天灾率 36.75%≈50%×75%；morale=0 城暴动 7.33%/morale=200 为 0。playwright 压测时 5 连命中同城曾误判随机性坏了，单独 200 次采样证明均匀分布（小样本巧合）。
- 教训：disaster.js 初版残留一行混乱三元表达式（城市索引选取），自查发现后清理——写长表达式易留垃圾，及时重读。

## 4. 觐见台词四档 + ★语义修正 ✅

- **重大修正**：反汇编+TALK 文本实锤觐见对象是【己方君主】（玩家=军师进言），非敌方君主谈判。宣战 0x644C 成功后直接置敌对。
- 取词：行=cx+偏移0..2（宣战 cx=0x56/停战 0x96/请援 0xD6）；tier≥4 拒斥无进言选项。
- audience.js 三场景重写；DiploView 头像切己方君主；playwright 双档位路径全绿。

## 5. 0xCDE 结案 + speaker.js ✅

- 定论：0xCDE=PC 喇叭音效封装（ax 0x101 短哔/0xCE7 两声警告），非命令流；旧笔记已勘误。
- 新建 core/speaker.js（WebAudio 方波近似 clickSfx/warnSfx）；接入城池面板（顺带修复 develop/recruit 双调用 bug）/monthEnd/DiploView。

## 6. 结束动画系统 ✅

- 发现 D7OPEN/D7END/D7OVER.EXE + END_S1..15.DAT + GAMEOVER.DAT 子系统。
- **格式破解**：成对触发 RLE（相邻两字节相等→下一字节=额外计数）。**调试坑**：首版把首字节当标记致 26KB 枯竭——重读 D7OVER 0x58F 解压器 `jne 0x5B4` 更新 dl 才修正。输出 128000B=640×400 planar 双半屏（各 4 平面×16000B，两次 blit ax=0xC828）；END_S1 特例 640×285。
- **Python 坑**：切片副本赋值 `full[a:b][0:n]=...` 无效（切片是拷贝），改直接索引赋值。
- endview.js 模态层（时钟暂停/2s 淡入/点击 reload）；三触发：灭亡/统一/信赖归零。playwright 三路径全绿。

## 7. LSP/风格清理（用户指令）✅

- hud.js getElementById×30→querySelector（sed 两步法，跨行属性有漏网需二次修）；appendChild→append（h() 辅助简化）；diploview.js 嵌套三元改 if/else。
- lens mode=full 确认清零；playwright 冒烟回归正常。

## 8. 開場動畫 ✅

- 发现 OPEN_S1..S6.DAT + OPENPAL.BRG；全部与 END 系同款 RLE。
- **布局破解**：S1=640×350 EGA 单张全景（前 56000B）；S2..S6=320×200×16 色多帧（每帧 32000B=4 平面×8000B 平面连续），12/12/12/9/4 帧。渲染验证 S2_f0=曹操仗剑图完美。
- parse_open.py 导出 50 张 PNG → openview.js 播放器（S1 停留 3.2s→帧进 450ms）→ main.js sessionStorage 防重播。
- **★调试坑（重要教训）**：点击跳过后播放协程永久悬挂——finish() 只 clearTimeout 不 resolve 挂起的 await Promise。表现为 page.evaluate "promise garbage collected"。修复：保存 resolver（this._wake）finish 时调用。另有一次"自动播放提前结束"假象，实为重载竞态，挂 MutationObserver 全程 trace 后确认播放器本身正确。

## 9. BGM 音乐逆向结案（不复刻）✅

- **排查路径**：KI.EXE 全文无 AdLib(388/389)/PIT(40-43)/int21 AH=25 钩子 → 疑文件不被播放 → 发现 EXE 内嵌 BGM.DAT/SOUND.DAT 文件名字符串 → 找到加载代码 **int 0x61**（D7 系 int 0xA1）→ 常驻驱动 **YNSOUND.COM**（目录里一直躺着）。
- 驱动逆向：int 21h AH=25h 钩 INT8 + PIT ch0 mode3 分频 0x100（≈1.27kHz 音序时钟）+ EOI/链旧向量；另有 [0x97c] 变址端口协议接硬件音乐卡。
- BGM.DAT：4 文件同构，5 轨道偏移+10B 轨头前导 `80 0F A0 00 F0 00 00 06 D0 00`；音符编码未破（需反汇编驱动解析器，性价比低）。
- **决策**：不复刻，逆向全程留档 re-notes。教训：排查"无端口"类问题先查软中断+常驻驱动，别只盯着硬件端口。

## 10. OPEN_S1 尾块结案 ✅

- 尾块 22016B=日文 FAT/hex 编辑器工具残留（Shift-JIS 串 FAT EDIT/[CTRL+K]/ADDR @0x5364..）；Big5 无游戏文本。无需处理。

## 11. END_S13/14/15 结案 ✅

- **决定性证据**：D7END.EXE 仅硬编码 END_S1..S12 文件名，无动态拼接——S13/S14 不被任何 EXE 加载。
- S13（404KB，**文件日期 1992-06** 早于游戏本体）：RLE→1.55MB，试 128000/153600 步长+自相关均无周期→旧版遗留动画。S14（1990-07）=tile 遗留。S15=自創軍師命名 Big5 码表（尾段码点连续递增 B2F3→B343 是码表特征；KI.EXE 0x8FC8 加载，[0x5221] 门控）——推翻"加密文本"猜测。
- **调试方法**：校准法（先解码正常 END_S2/S12→128000 基准）+ numpy 非零占比分块统计 + 自相关找步长 + EXE 字符串穷举交叉验证。
- 结论：endview 回退 S12 图=与原版一致，零代码改动。

## 12. 音效恢复+开关、可玩状态 ✅

- speaker.js 补 unlockSfx()（首次 pointerdown 解锁 AudioContext）+toggleMute()+音量 0.12；HUD 🔊 开关；进言/战斗按钮补音效。
- playwright 全绿；console 仅 favicon 404。
- **当前状态：可玩**。启动：`python tools/webserver.py 8321` → <http://127.0.0.1:8321/index.html>

## 本会话产出清单

- 新文件：battlescript.js / disaster.js / openview.js / speaker.js / endview.js / parse_open.py / CHECKPOINT(b/c)
- 修改：battle.js battleview.js main.js index.html hud.js diploview.js diplomacy.js audience.js commands.js re-notes-kernel.md
- 结案不复刻：BGM / 0xCDE(已复刻 SFX) / OPEN_S1 尾块 / END_S13/14/15
- 剩余可选项：开场打磨（编制类型真实判定/相机漂移/军旗细分）、BGM 音符编码、自創軍師命名

## 环境备忘

- webserver.py 8321 常驻；playwright-cli 会话随用随开（close 后重开解缓存）
- pi-lens：无阻塞错误；parse_open.py 两条 path-traversal 已标 false-positive（离线工具硬编码路径）
