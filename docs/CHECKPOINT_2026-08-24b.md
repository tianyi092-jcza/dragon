# Checkpoint Journal — 2026-08-24 第二轮（开场脚本 VM + 进言收尾）

## 本轮目标

1. 恢复上轮上下文（CHECKPOINT_2026-08-24.md + SESSION_HANDOFF.md）
2. 收尾上次半成品：进言系统（advisor.js 已写但从未验证）
3. 主任务：BATTLE.DAT 开场脚本 VM 回放接入战斗系统
4. （插入指令）LSP 发现的问题一并解决
两项主任务均完成 ✅。

## 已完成工作

### 进言系统收尾

- advisor.js/diplomacy.js 是 8-23 20:39 的未记录遗留（HUD「進言」tab 已接线但文档标待做）
- playwright 全链路验证通过：曹操(政治最高)任军师→建议文本→採納信赖+20/金-100/洛阳发展度→80→駁回信赖-20→对话框开关正常；node 压测 4剧本×200次建议生成无崩溃；0 console error

### BATTLE.DAT 执行器补全反汇编（本轮核心逆向产出）

- **字格式实锤**（执行器 0xA442）：op=低字节低5位、cc/imm=次3位(AL=rol(al&0xE0,3))、参数ah=高8位；si 在 call handler 前 +2，handler 可再消费后续 word
- **每帧节奏**：0xA426 先查 [0xD313] WAIT 计数器，非零则递减返回——即每帧最多取1条指令，WAIT 阻塞
- **19 个 handler 全部反汇编定论**（跳转表 cs:[0xA466]）：op0=WAIT(ah帧)/op1=CMD([0xD347]=ah,[0xD344]=ah*96)/op2=MODE(ah==0?0x3A:==1?0x24:0x10)/op3=UCMD(imm==7全体6单位否则单兵#imm；ah==5列阵调0xA8F6；ah==3且[0xAB4F]==0改1)/op4=R=[0xD346]/op5=R=[0xD33C]与0x1C比较三档/op6,7=扫描单位区0x600/0x000的+0x1A取最小值(≥4归0；无符号字节下恒0)/op8=R=相机高位≤0x20?2:低位/op9=R=AX mod bl(0xECE0随机源近似)/op11,12=R=min(255,[ds:0xD30A]+0x24/+4)/op13=按+0x24==imm*18选边置bit3+[+0x1B]=ah调0xA8DE/op14=R=[0xD31D]/op15=扫ds:[0xC00]+i*0x20十六条目/op16=画军旗0xC315 ah次/op17=R=区内任一单位命令[+0x1B]>=9/op18=R=[0x600+3]
- **★op10 跳转语义勘误**：子表 0xA59C 实际 cc0=JMP/1=je/2=jne/3=jae(R>=ah)/4=jbe(R<=ah)；目标字 t=[pc+1]：t&0xFF≠0→t 本身就是落点指令（成立不成立都落入 t）；t&0xFF==0→成立 si=bh*2(**字节偏移！字索引=bh**)，不成立跳过 t。首版实现误把 bh*2 当字索引致 pc 跑飞出界（block8 pc240/block9 pc136）

### Web 实现

- `web/src/game/battlescript.js`（新建）：BattleScript 逐帧解释器。控制流(op0/1/2/10/16)严格复刻；状态查询委托 io 钩子映射 web 战斗模型。node 验证全部块界内持续运行（结尾待机循环按设计不自然终止）
- `web/src/game/battle.js`：mkUnit 增加 hx/hy 编队槽位；新增 placeStaging()（单位退场边待命由脚本列阵召回）
- `web/src/render/battleview.js` 接入：
  - open() 选块：编制类型=单位数-1 近似×4 + 玩家攻守(0/1)；app.battleScripts 由 main.js 载入
  - startCutscene/updateCutscene：60fps 虚拟帧驱动 VM + 单位行军（与 tickBattle 同速逻辑）
  - 军旗脉冲(op16 视觉反馈)+「⚔ 開戰…點擊跳過」提示条；开场期间隐藏 #bctl
  - endCutscene(snap)：用户跳过=snap 回槽位；自然播完=就地清指令；40s 安全阀
  - 三按钮(突擊/撤退/自動決戰)开场期间先 endCutscene 再动作；finish 清 cutscene 态
  - getElementById→querySelector 全替换（LSP 一致性）

### LSP 问题清理（用户指令）

- main.js L145/193/194 getElementById → querySelector
- battlescript.js 两处嵌套三元 → if/else（对应原版 jb/je/ja 与三档 MODE 分支）
- battleview.js 新代码 getElementById → querySelector（含跨行 sed 漏网的 #bassault 二次修复）
- tools/_adv_t1.js 裸函数表达式为 run-code 格式要求 → lens_diagnostic_mark 标 false-positive

## 关键发现/勘误

- player_faction 是序号(number)：battleview.playerSide 的 === 比较本来就对；测试 harness 取 .idx 得 undefined 是测试 bug
- 回归时 AI 会实时开新战斗重开覆盖层：自动决战获胜→城池易主→时钟恢复→AI 军团犯境→新战斗 open()——测试需隔离后续开战，勿误判引擎卡死
- VM 步进"慢"是原版设计：每帧1指令+WAIT 帧阻塞（实测 2.99s=19 指令+160 等待帧），整场开场约 12-18s

## 相关文件

- 新建：`web/src/game/battlescript.js`
- 修改：`web/src/render/battleview.js`、`web/src/game/battle.js`、`web/src/main.js`(载 battle_scripts.json)
- 文档：`docs/SESSION_HANDOFF.md` 新增 #11 条目
- 测试脚本：tools/_bs_t*.js、_adv_t1.js（已清理）
- 新增工具：tools/parse_end.py（END_S/GAMEOVER 解码器，含批量出图）

### 外交扩展：遷都 (2026-08-24 续)

- 逆向确认：0x6909 城池选择器(仅己方城, [di+0x16]&0xF 校验)→与当前主城相同则 TALK 0x93 提示回环重选→确认对话(TALK 0x386)→0x33FD 改写主城指针→0x33EA 战报入队
- 「請出陣」勘误：反汇编 0x699E 实为玩家自身出擊指令(兵力≥600/武将数门槛检查)，非外交；且 web 端 `dispatch()` 已实现出征，无需另做
- 实现：`diplomacy.js moveCapital(sc,city)`（己方城校验/同主城报错/指针改写）；hud 城池面板新增「遷都」tab
- 验证：許昌→濃陰迁都成功+战报、重复迁都报错、地图主城标记读 f.capital 自动跟随、savegame 槽位已有 capital 字段自动持久化；console 仅 favicon 404

### 天灾/暴动系统 (2026-08-24 续)

- 逆向补全：0x22DB/0x237E/0x2286 全链（门控概率/灾区几何/扣减公式，详见 SESSION_HANDOFF #13）
- 实现：web/src/game/disaster.js；monthEnd 钩子接入
- 验证：node 种子统计(天灾率/暴动率符合门控组合)；playwright 战报与 development 受损正常

### 開場動畫 (2026-08-24 续)

- OPEN_S1..S6.DAT 布局破解 + parse_open.py 导出 50 张资产 → openview.js 播放器接入主流程（详见 SESSION_HANDOFF #17）
- playwright 全程 trace 全绿；0 console error

### 0xCDE 结案 + PC 喇叭音效 (2026-08-24 续)

- 定论：0xCDE=音效封装(一声确认)/0xCE7=两声警告，非命令流；re-notes 已勘误
- 实现：core/speaker.js(WebAudio)；hud/monthEnd/DiploView 三处接入；顺带修复 develop/recruit 双调用 bug

### 觐见台词信赖度四档细分 (2026-08-24 续)

- ★语义修正：觐见对象实为己方君主（玩家=军师进言），非敌方；取词表 cx=0x56/0x96/0xD6 + 偏移 0..2，拒斥行在 base-2/-1（详见 SESSION_HANDOFF #14）
- 实现：audience.js 三场景重写（SCENE_BASE + fmt 占位替换 + tier≥4 拒斥门控）；DiploView 头像随场景切换

## 当前状态

- playwright 验证全绿：cutscene 启动/单位散开(-40场边)/VM 推进/编队行军到位(dist 6px)/跳过 snap/时钟暂停恢复/自动决战→易主→后续 AI 战斗链路正常；0 pageerror
- pi-lens 无阻塞错误（仅文档 MD029 编号风格 advisory，沿用既有格式）
- 本地服务器运行中：python tools/webserver.py 8321

## 下一步（建议方向）

1. **全部结案**：遷都/天灾暴动/觐见分档/0xCDE 音效(#14-15)/结束动画(#16)/開場動畫(#17)/S1尾块(#19)/S13-15(#20)/音乐(#18)/编制类型真实判定(#21)——待办全清零
2. LSP 清理完成：ai.js weightedPick 提取、advisor.js playerContext 提取、modalclock.js 三视图时钟去重、嵌套三元全清；playwright 回归全绿（adv/diplo/clock/battle/end）
3. 仅余纯视觉打磨（可选）：相机漂移跟随脚本 MODE 段、军旗阶段细分视觉
