## Lifecycle follow-up (2026-09-07)

See [re-notes-tactical-lifecycle.md](re-notes-tactical-lifecycle.md) for independently reread raw KI branches, this batch's startup CF/CX/borrow, D318 byte counter, BA0D HP floor, B240 tail and B360 repairs, and the subsequent B413/B240 overlay/terrain-bit02 and BD46 reverse-workspace/backtracking repairs. Normal/death DA1C inputs are captured before rule phase toggles and snapshotted. Browser startup yields exactly once per A04B/A065 rule frame so retained C315 captures can paint while startup continues; legal early nonlocal battle termination and the bounded B941/native-reference compositor are now implemented. Full draggable-world native pixel equivalence is explicitly not claimed.

## Deterministic command audit corrections (2026-09-07, bounded batch)

Rechecked directly from `Dragon/KI.EXE` with `tools/disasm.py`, file offset VA+0x200; relative near calls interpreted modulo 65536. These are **confirmed local instruction chains**, not proof of whole-battle equivalence. No SAVE.DAT access.

- **AA2C → AA46/AA56** reads live D33C/D33E words on every formation evaluation. C165/C181/C19D change only player X (48/28/5); A4AB changes enemy X (58/36/16). Remove the production constant handler bases: custom Y and restored registers must reach actual targets. D342/D344 continue selecting all 16 vector blocks.
- **CB0F/CB13 → CB85..CB8C → AB39**: AB4F is the patched `MOV DL,imm8` wall target X, not only a gate. Mirror nonzero values with `63-X`. AB50..AB78 write position/target=(X,anchorY), clear path word, and set positionLevel=`D2FC[0x1000+Y*64+X]&7`. Flags&2 plus height!=0 sets pending6 and jumps through **AB7C timed=min(timed,40)** before class attack.
- **ACA4** starts DX=0x0100: west/north/east/south directions are 0/1/2/3; equal distances choose X, including coincidence=0. **AD01** contains words AD09/AD12/AD1B/AD24: directions 0/1 add step to X/Y only when original coordinate<=54; directions 2/3 subtract only when original coordinate>=10. Step is u8(10+nonnegative levelDelta), otherwise zero; writes are byte arithmetic, not clamped coordinates.
- **AED2/AEF6/AEF9 → BD46** AX packs nonadjacent current +6 X and +8 Y (not previous X at +7). AF06..AF19 reads upper descriptors through D2FC, **not occupancy**. CC31..CC41 establishes D2FC=D2FA+0x700 paragraphs, hence spatial byte offset 0x8000+cell for the upper descriptor.
- **AF69 → AFDD/AFE5 → AF78 → AF82 → AF92** uses carry, not a moved flag. Blocked X falls back to Y, then level in the same call, each probe clearing AH. CLC returns immediately even for an enemy hit with unchanged coordinates. AH=1 calls B00D even for count0; success jumps AF65 (AH=0) and moves immediately. Exhaustion calls ACA4: distance1 plus own target==anchor writes target object's anchor/level to position (AFB0), else writes direction and own target to position (AFC3). Both clear bit5 and return without C653. AH=0 terminal AFD0 alone queues then updates direction. **B112/B159** collision CLC returns without overwriting spatial pointer with the probe candidate; B533/B732 owns collision writes. B240 itself is unchanged in this batch.
- **A85B/A889/A88D/A8A9**: when sourceY<candidateY, abs(dy) is added twice; otherwise once. Score=`u8(abs(dx)+abs(dy)*(sourceY<candidateY?2:1)+heightPenalty)`. Strict lower comparison retains earlier slots on ties.
- **9A5E..9A6F** mode derives from directory: <C0=0, C0..D0=1, >=D1=2, independent of layout. CBE5 variant=mode+1 except mode0/player defender=0; mode2 selects formation*4+3. 9C13 reads specialty at general+0E+mode; A1CD skips A34F unless mode1. A1C5 remains the same rule sequence, but the browser driver now suspends after each actual A04B/A065 so it can paint without stopping or batching tactical time.
- Queue `groups` copying is a Web snapshot isolation contract, not an original DOS save mechanism. Insert, snapshot, and restored queue payloads must be independent.

**Explicitly pending after lifecycle/BD46/B941 follow-ups:** B533 full damage/exchange audit; command9/10 reachability; E04A and all indirect scratch-writer reachability; complete pre-first-DDB4 VGA/UI/cursor provenance; original TALK window pixels; legacy restore without display history; expanded full-world native pixel equivalence; controlled complete DOS runtime differential. Browser yielding, legal startup nonlocal exit, bounded B941/native reference, C315/TALK/marker producers and B824 six-plane writes are covered only by their lifecycle sections and do not imply whole-battle equivalence. Do not blindly replace generalIdx with legion.idx. Earlier contrary descriptions below are historical and superseded by these corrections.

# 战术战斗规则兼容目标与逆向账本

> 产品目标：不复刻原版小窗口和动画；Web 可以使用完整大场景、插值和现代视觉效果，
> 但胜负、六队伤亡、军团士气、城壁状态及据点城损必须由原版规则决定。

## 1. 验收定义

相同剧本状态、日期、据点、双方武将、六队兵种/兵力、士气、阵形、玩家命令帧，
并固定同一原版随机状态时，Web 必须与 KI.EXE 输出相同的：

- 胜负与结束帧；
- 双方六队剩余兵力和军团总兵力；
- 双方战后士气；
- 16 条城壁对象的 `metric/flags`；
- 据点城兵、上升率、防灾；
- 主动撤军、败退及战后去向。

浏览器刷新率和动画播放方式不得影响以上结果。

## 2. 已闭合规则

### 2.1 原版随机源 `0xEC82 / 0xECE0`

实现：`web/src/game/battle/originalrng.js`。

- 原版初始化256B表`CS:ECFE..EDFD=0..255`；Web的257长度仅快照兼容padding；
- DOS `int 1Ah/AH=2` 提供 `CH/CL/DH`；
- 初值 `AL = DH + CL + CH*4 (mod 256)`，`BL = DH`；
- `ECB3/ECB5`在循环外一次令`DX=BL+1`；256次先交换`table[BL]/table[DL]`，再分别byte加`4Fh/89h`。合法RTC不会触及第257项；旧相邻交换结论撤销，详见[原始执行证据](re-notes-npc-strategy.md#4-rng初始化勘误实锤)；
- 保存：`addend=AL`，`index=AL xor BL`；
- 每次 `0xECE0`：`value = table[index] + addend (mod 256)`，
  `addend += 0x89`，`index=value`，返回 `value`。
- `0xEC82`唯一直接调用在程序启动`0x0077`，而非新局/读档入口；`INT 1Ah/AH=2`的本地RTC BCD `CH/CL/DH`只在该时刻播种。因而标题、新局和无sidecar DOS读档持续消费同一流；Web只在浏览器进程初始装配按本地BCD建流，sidecar才恢复保存快照。战略`0x2FBF`的随机事件槽随此流变化，固定种子仅供可回放测试。

规则模拟层必须逐调用消费此字节流，不能使用 `Math.random()`。随机调用次数和顺序也是兼容要求。

### 2.2 战斗主循环和结束入口

32块原始脚本、19个opcode、条件标记、选表与分支分母统一见[P07战术AI账本](re-notes-tactical-ai.md)。该包区分单步RET、C315入口停点与完整帧；R范围排除只在明确的跨步接口模型内成立，不代替A065/输入/消息写集核验。

- 主循环 `0x9FA0`：输入 → 按钮 → BATTLE.DAT VM `0xA426` → 战术帧 `0xA065`；`A156`未取到点击时直接落到`0x9FD4 call A426`与`0x9FD7 call A065`，然后回到输入循环。因此A426是全战斗持续脚本，不是开场动画；Web不得等待玩家首令而冻结整个战斗，也不得以墙钟或指令数上限截断命令/RNG/规则帧；原版最高速仅取消额外INT61等待。**Web产品决定（非原版IRQ机制）**现按§5半速政策固定为`1000/30ms`规则门控（此前为60Hz），避免显示器RAF频率改变战斗速率；所有档位每RAF仍最多执行1个完整逻辑帧，不能在一幅显示帧中批跑12帧造成进场即结算。
- 玩家攻方路径`0x4E75`和玩家守方交换路径`0x4E8F/0x4E9A`都把玩家军团写入`D2E`；`0x9E81`先将D2E复制到对象0侧，`0x9E89`再将D30敌军复制到0x600侧。`A6FA`随后固定先调用`A754`处理玩家0侧，再调用`A785`处理敌方0x600侧；
- `0x9BCE mov word ptr es:[di+1A],0001`的精确字节语义是`currentCommand=1`、`pendingCommand=0`，不是两者都为1。首个A065中A7B7/A7FD把双方切到命令0；玩家侧按AA2C回阵并在到位后转内部命令7待机，不会因为无输入而获得后续AI改令；
- 敌方策略块由`CBE5`按敌军团**槽位**的`general[slot][+0x16]*4+variant`选择：`0x4E75/4E8F/4F16`把对手军团记录地址写D30，`CBE5`计算`(D30-0x2240)>>1=slot*0x20`并从D52武将表`0x4240+slot*0x20+0x16`读取；不读军团`+2`主将索引或Web `generalIdx`。`0x6E8F`正常编成让槽号与主将索引同号是独立约束，不可借此替换读取规则。variant为玩家守城0、玩家攻城1、野战2、第四战型3。A426的A4BF固定从`0x600`写一个或六个敌方组长，A60D也固定扫描0x600侧按兵种CLASS改令；脚本只读取玩家侧命令、兵力和战况用于决策，绝不写玩家0侧。因此玩家不操作时，敌方仍会按WAIT、原版RNG、双方命令/兵力、D31E、城壁和主将HP持续变阵、进攻、守阵或退却；
- `C8B0`六行按钮配合`C8E6..C937`命中区得到精确映射：突擊=id9→命令2、攻擊=id8→命令1、陣形=id7→命令0、城壁=id10→命令3、守陣=id11→命令4、退卻=id12→C21A命令5。“攻擊”不是攻城专用；只有命令3在`C1D9..C211`受`AB4F==0`门控；
- `0xA065` 内调用 `0xA6FA`；
- `0xA6FA`：
  - 战斗态倒计时到零时调用 `0x9FDC`；
  - `[0xD31C]==0` 时胜方置 1；
  - `[0xD31D]==0` 时胜方置 0；
- **真实自动撤退 `0xADC8→0xAE56→0xA8F6`**：每帧后处理只检查双方
  0号首对象的 `+3` HP类字节；当其无符号值 `<0x32`（50）时开始该侧撤退。
  不读取士气12、总兵25%或任何兵力比例，也不消耗RNG。0侧先检查；`A8F6`
  写 `D349=1/2`、令撤退侧六个组长pending=5，随后 `D34A=0x78` 倒计时；
- mode0下 `0xAE73..0xAEA8` 每10次后处理按 `D35 bit7` 选择一侧令首对象
  `+3` 减1（最低0），本帧减到49后在下一帧 `AE56` 触发撤退；
- `0xAE35..0xAE4C` 从 `D31A/D31B` 以原版u8差值重建 `D31E` 三态；
- `0x9FDC` 返回 `[0xD349]`，并在攻城模式调用 `0xA65D→0x9FF8` 结算城损。

### 2.2.1 战后 474A 双调与退出帧（P48 闭合）

- **实锤（现刷窗，`disasm.py`）**：`4E70..4EAC`（sha256 `30f14e4d…`）——`4E70 test [SI],4` 攻方委任门，落空 `4E75` 写 `D2E=SI`（玩家攻方）；`4E8A test [DI],4` 守方委任门，落空 `4E8F or D35,0x80` 置玩家守方旗后 `D30=SI、D2E=DI`（`DI` 为玩家守方）。两条路径都把**玩家军团**写入 `D2E`，对手写入 `D30`。`CX=0x1D` 后 `call 4EB9` 即 TALK29；战术分别经 `4E85/4EAC call 1B5A` 进入（与 P47 `callers(1B5A)` 吻合；`4F26/4F49` 为攻城对应项）。
- **实锤（现刷窗）**：`1B5A..1BDF`（sha256 `c921531a…`）——`9FA0` 主循环返回后 `push ax` 保存胜方字节；`1B7E call 533D`（G1F 刷新）后经若干中间调用（`19CA/20D6/1F7F/89F0/D615/1CC9/D66A` 语义未知，见下）；`1B9B pop ax` 取回胜方字节，`DS=[D52]`，`SI=D2E、DI=D30`；`1BAA cmp D35,0x80`：bit7 置位（玩家守方）则 `xor al,1 + xchg SI,DI`，否则直通。首调 `1BBA call 474A` 取 `CL=AL`，失败 `or AH,1`；`xchg` 后次调 `1BC9 call 474A` 取 `CL=AL^1`，失败 `or AH,2`；尾声 `1BD1 call 9321、1BD4 call 9D0`（设备调用）。`AH` 累积方式与 `5130` 的 `5192/51A1` 逐项一致。
- **实锤（两分支消去）**：首调恒为攻方——bit7 清时 `SI=D2E=玩家=攻方`；bit7 置位时交换后 `SI=D30=敌方=攻方`。结合已记录的 `5130` 合同（首调攻方 `CL=AL`、`0` 代表该侧获胜），`xor al,1 + xchg` 配对唯一自洽读法是 `AL` 为对象侧帧（`0`=对象0/玩家侧胜，`1`=对象1/敌方侧胜），`1BAA..1BC6` 把它连同指针序一起换算成攻守帧。`A6FA` 胜方置位（`[D31C]==0→D349=1` 于 `A72F`，`[D31D]==0→D349=0` 于 `A740`，窗 sha256 `63c7734b…`）与此一致；`D31C/D31D` 各属哪一对象侧的写者归属（`AEB2/AEC4` 线性窗疑似错位）仍记未知，本结论不依赖它。P82-H1补充（门后延续H1闭合）：重读`AEA9..AED1`真边界——`cmp si,0600; jae AEC1`，SI<0600支`inc D31C`（`[si+19]!=0`再`inc D31A`），否则`inc D31D`（`[si+19]!=0`再`inc D31B`），无错位，旧疑似为线性解码伪影；D31C=side0/D31D=side1映射沿既有P48链+回归（`originalstate.js side0Active/side1Active`），本轮未改。
- **Web 修复（生产改动）**：`settleVisualBattle`（`tacticalbattle.js`）此前直接返回对象侧序 `sides`，而 `ai.js` 按 `sides[0]→A（战略攻方）` 消费；玩家守方战术退出时双方兵力/六队/士气被交叉写回（`winnerName` 经 `sideMap` 换算正确，故 `won` 旗不受影响）。现按原版同一换算在边界统一为攻守帧 `[attacker, defender]`（`sideMap.atk/def` 索引；legacy 合成 `sides:[attack, defence]` 本就攻方在前，不受影响）。回归 `tools/verify_tactical_exit_frame.mjs`（攻/守/守败三例；修前 case2 以 `540!==60` 复现交叉写回，修后全绿且两次稳定）。

### 2.2.2 开场消息音并线（P50 闭合）

- **实锤（现刷窗，`disasm.py`）**：`4E5C..4F89`（sha256 `d43bb2be…`）——`4EB9` 体（`push [DI+2]/FF、push [SI+2]/FF、DI=SP→call 0CDE→AL=0x93→call 8810→add sp,4`）即 TALK29（`CX=0x1D` 由 `4E7F/4EA4` 置）；`4F58` 体（`push DI、push DI、push [SI+2]/FF、DI=SP→call 0CDE→AL=0x93→call 8810`）即 TALK27（`CX=0x1B`，`4F10`）/TALK28（`CX=0x1C`，`4F39`）；`4F71` 体（同形，`call 0CE7→AL=0x93→call 8810`）即 TALK26（`CX=0x1A`，`4F06`，`5130` 返回 `AL==0` 才显示）。分支音：攻方 TALK29 只经 `4EB9` 内一次 `0CDE`；守方 TALK29 经 `4EA1` 直调 +`4EB9` 内共两次；守方 TALK27 只经 `4F58` 内一次；攻方 TALK28 经 `4F36` 直调 +`4F58` 内共两次；TALK26 只经 `4F71` 内一次 `0CE7`。
- **实锤（现刷窗）**：`0CDE..0CEF`（sha256 `d0d64f16…`）=`push ax→AX=0x101→call EB11→pop ax→ret`；`0CE7..0CF0`（sha256 `9a2d100b…`）=`AX=0x202→call EB11`；`EB11..EB6B`（sha256 `73a03d2f…`）以 `CX=AX` 作内外两层循环经 `EB5E`（`port 0x3DA bit3` 回扫等待）门控 `port 0x61`，即 PC 喇叭 beep（`CL`=次数：`0CDE`=1、`0CE7`=2），与 `speaker.js` 头注一致；`DI=SP` 等栈参数在 `0CDE/0CE7` 内被忽略（只读 `AX`）。
- **Web 接线（生产改动）**：`speaker.js` 新增 `doubleClickSfx()`（`0xCDE` 连击两声）；`ai.js` 野战开场（`A.faction===pf.idx` 攻方支→`clickSfx` 一次，否则守方支→`doubleClickSfx`）、攻城开场（`playerDefender` TALK27→一次，否则 TALK28→两次）在 `enqueueTalkMessage` 前播放；TALK26 原已 `warnSfx()`（=`0CE7` 两声）不动。`AL=0x93` 在 `8810` 内的确切语义（颜色/风格？）仍记未知，Web 显示文本不变。回归 `tools/verify_battle_opening_messages.mjs` 追加三音无音频 no-op 断言（既有四流程已实际经过新调用点）。P80围栏终局（门后延续H3闭合，零生产改动）：Web侧复核——全树无AL读者（开场三分支固定哔声+固定TALK文本，`originalvictorygate.js`之AL=0x93仅注释文档；`diplomacy.js`之TALK 0x93系talk序号无关），回归no-op断言现存；KI侧P56窗结论（8810线性窗内无入口AL分支消费者）未变，未重探。围栏永久有效：Web行为已钉死，AL语义不可达。

### 2.2.3 完整退出帧写集/RNG交错/D2E-D30别名（P51 闭合，零生产改动审计）

- **实锤（现刷窗，`disasm.py`）**：`1B5A` 全体=战前装配（`1B62 call 2078` 驱动、`1B6D call 0A1C` 调色板、`1B70 call 9946` 战术初始化）→`1B73 call 9FA0` 主循环→战后序列 `1B7B call 19CA`（98xx 相机/VRAM 清理＋`[59D2]` 驱动分发表）→`1B7E call 533D`（G1F刷新；P47时点hold已由[实体字典G1F-BOUNDARY-1](re-notes-entity-fields.md#g1f-refresh-boundary-audit)撤销）→`1B81 call 20D6`（98xx＋驱动）→`1B84 call 1F7F`（98xx 相机：`987E/9880` 比对、`9882/9884` 视口、`988E/9890/989A/989C` 派生）→`1B87 call 89F0`（`8A1E/8AEA` 经 `ES=D44` 派生段重绘地图 tile 字节）→`1B92 call D615`（`ES↔DS` 像素换存＋`D854/D856` 光标）→`1B95 call 1CC9`（=`2AF4` 军团动画：`bit 0x20` 置位槽经 `2B3C` 置 `bit4`＋`D51F/5D19`，`≥0xC0` 槽经 `2B2A` 读 `+10/+12/+9/+8` 调 `D4C7`；`2533` 城记录动画帧：`+0xE` 索引/`+0xF` 低 3 位循环＋`D51F`）→`1B98 call D66A`（EGA 端口＋8B-stride 对象台清理，`FF` 清 `+3..+7` 或写 `0x40`）→P48 已闭 `1BBA/1BC9` 之 `474A` 双调→`1BD1 call 9321`（按 `CF4` 查表调 `10241` 定模式）→`1BD4 call 9D0`（`0x3DA`＋`0x1964` 调色板恢复）。**G1F-BOUNDARY-1勘误**：旧“唯一战略规则写回是474A双调、Web无需新增退出写回”结论撤销；`1B7E→533D→55A6`另在`55DC`写活动武将G0..126的`+1F`，发生在两次474A之前。P48攻守帧修复不覆盖该刷新；Web后经[G1F-INTEGRATION-1](re-notes-entity-fields.md#g1f-integration)获批补入两条战术返回适配器，早于474A/去向尾。其余所列驱动/调色板/VRAM/98xx 相机/地图 tile 重绘/动画帧归类不因此改变（军团`bit4`沿P44为交战动画在列标志，`2BA8`先清；城`+0xE/+0xF`为动画cell索引经表查调`D51F`，显示类）。
- **实锤（全 EXE `callers(0xECE0)` 扫描，48 个）**：`2297/229E/22B4/22BB/230C/2313/232B/2333/24FF/295B/2D43/2FCB/34A6/34EB/34F5/37C5/399E/3E96/3EBF/405D/40F6/416E/41D5/41EE/4213/43D9/4C1F/51F9/5218/52F3/56EC/5812/5846/58A2/58E0/5941/9C58/9E54/A2A6/A2B3/A37E/A38B/A584/AA18/AD3E/B61A/B6CF/B6D6`——无一落在退出序列（`19CA/20D6/1F7F/89F0/D615/2AF4/2B2A/2B3C/2533/D66A/D782/D7E7/D804/D76B/D51F/5D19/D4C7/474A/533D/9321/9D0` 体内零命中；`Axxx/9C58/9E54` 命中均在战斗本体内，属帧内正常消费）。退出路径零 RNG 消费；Web 侧 `settleVisualBattle`/`settleExit` 只快照（`strategicRng`＋`rng.snapshot()`）不消费——流位置在末帧后对齐，无交错漂移。
- **实锤（全 EXE disp16 含 `2E0D/300D` 且段前缀 `2E` 的读写扫描）**：`D2E/D30` 唯一写者为四组入口分支（`4E78/4E9D` 野战、`4F1F/4F42` 攻城，均在已闭窗内）；读者为退出重载 `1BA3/1BA8`（`SI=D2E、DI=D30`）、战前拷贝 `9E84/9E8C`（`9E70` 复制对象侧）、`9ED6/9F05`、`C315` 内 `C327/C336`（读 `D2E→slot→0x4240` 武将号作消息显示）、`C9AB` 内 `C9B4/C9F8`（读槽作显示）。战斗循环与退出 teardown 零写者→退出重载恒等于入口携带→Web 在 `createHandle` 入口一次建成 `sideMap/exitContext` 并全程携带与原语义等价，无需改 exit 重读。
- **历史审计结论更正（零生产改动）**：P51原“C10–C11三项剩余全部闭合”不能继续代表完整退出写集已实现；G1F-BOUNDARY-1补回55A6规则写者，后续G1F-INTEGRATION-1已接战术返回刷新，但不把限定接线扩大为全退出路径认证。RNG/别名既有局部结论不因此扩大或撤销；`1E17`语义旧hold已由P52处理，见AI全链C11，不在本节展开。`AL=0x93` 语义 hold 已由 P80 转围栏终局（见上，门后延续 H3 闭合）。`D31C/D31D` 归属（门后延续 H1）已由 P82 闭合为战术域（见§2.2.1 P82-H1 补充；Web 对应状态全在 `battle/*`）。

### 2.3 原版对象池与输入回放骨架

实现：`web/src/game/battle/originalstate.js`、`originalcommands.js`、
`originalsession.js`、`originaltargeting.js`、`originalinit.js`。

- 建立连续 `0xC00` 字节池：0侧 `0x000..0x5FF`、1侧 `0x600..0xBFF`；
- 每侧固定 6 组、每组 `0x100`、每组 8 个 `0x20` 槽，提供严格地址升序遍历；
- 已定位字段按原始偏移以 u8/u16 读写，不把未闭合字段强行命名成产品机制；
- `0xA8DE` 无条件广播组内其余 7 槽：每槽 `flags|=0x08` 并写
  `pendingCommand`，不检查活动标志；
- `0xA7B7/0xA7FD` 公共切换：除 current=5 外，current/pending 不同时清
  `+0x16` 并把 `+0x10/+0x11/+0x12` 恢复到 `+6/+8/+0x0A` 锚点；
- `0xA4BF`写敌组长pending；`0xA8F6`是撤退入口，不是列阵；`0xA60D`按首孩子CLASS匹配群发，不是组号匹配。原指令分支及实现认证范围以[P07](re-notes-tactical-ai.md)为准；
- 固定逻辑帧会话同时快照对象池、原版 RNG、帧号、
  `D31A/D31B/D31C/D31D/D349/D34A/D310` 状态和剩余命令；
- `0xA85B` 按对侧48槽地址升序选择 u8 曼哈顿评分最小目标，同分保留首槽，
  不消耗 RNG；
- 已按真实角色固化组长跳表`0xA7E7`与子对象跳表`0xA82D`：A754/A785两侧组长均调用A7B7/A7E7，只有每组后7槽调用A7FD/A82D；不得再按玩家/AI势力切换整侧跳表。
- `CS:0xCCE4`阵型资产已扩展为16块×`0x60`字节（768组向量）：BATTLE.DAT op1写`D344=AH*0x60`，只导出首48组会在脚本AH>0时越界。
- `0xAA2C` 阵型目标索引已闭合：零偏移时向量序号=`group*8+slot`，0侧基准为`D33C/D33D`、1侧为`D33E/D33F`且只镜像dx，坐标钳制1..62；`D342/D344`是字节偏移，越过16块资产时明确报错。`0xAA7E`同公式但基准改为本组组长`+14/+15`，当前全程序无直接call/jump引用，保留已证纯函数但不接入生产跳表。
- `0xA754/0xA785` 已按0侧→1侧、每组组长→7子槽执行；固定帧会话随后按A065执行B941，再进入`0xADC8/0xAEA9`等价重算，逐帧重建`D31A..D31D`，因而同帧效果伤害可进入AE56，而重建后的空侧在下一帧`0xA6FA`被观察。

### 2.4 城壁对象

实现：`web/src/game/battlewalls.js`。

- `0x9CB3→0x9CE2` 从 BATTLE.MAP `0xD0..0xDF` 图块构造前 16 条记录；
- mode 0 初值：`metric=(城兵+50)*10`；其它模式为 300；
- `0xB5B7` 有效接触通常使`metric--`；mode0的直接清零条件已闭合：`D35 bit7=0`时0侧攻击者且`direction=0`，或`D35 bit7=1`时1侧攻击者且`direction=2`，同次接触写`metric=0`并进入B799/B824；其它侧别/方向不触发；
- `metric==0` 后 `0xB799→0xB824` 设置 bit0，清除地图对象；
- `0xA65D→0x9FF8`只扫描前16条kind1墙对象；**返回AX始终是原始最小metric，不乘4**。无bit0时乘4只用于写VM的D315；位宽、无kind1分支及旧实现差异见下节。

`0xB533`触发边界已由静态调用图闭合：只有AF69逐帧移动中B047/B069/B08B/B0AF四向探针与B0D3/B116上下层探针在“占用ID非零”时各至多调用一次；ABD2/ABFF/AC55及B941远近程攻击效果链均不直接调用B533。实际调用频率因此等于单位进入AF69的帧数中占用探针命中非零ID的次数，不按攻击/兵种另设周期；直接清零读取的是对象`+5 direction`，不是兵种/武力字段。

### 2.4.1 A65D返回值与城损勘误

**实锤：原始指令及以下私有RAM整调用证书；不等于所有战术入口/墙构造可达性已认证。** 固定KI哈希见[AI专项原始来源](re-notes-ai-chain.md#1-范围与证据纪律)。

`A65D`保存DS/CX/DX，以DS=CS:D30E扫描`0C00..0DFF`的16条32B记录，DX初值FFFF、AH初值1。每个`kind(+1)==1`记录按无符号word比较更新最小`+18`；任一该类记录flags bit0置位便令AH=0。循环后：

```text
if AH != 0:
    AX = u16(DX * 4)                 # A68E/A690/A692
CS:D315 = AH                        # A694：仅VM查询值
AX = DX                             # A699，字节8B C2，无条件还原！
restore DX/CX/DS; return
```

故没有kind1时AX仍FFFF，不能凭Web的`found=false`跳过原城损。`9FF8`将该AX无符号除10；`A00C..A01A`计算`damageWord=u16(u8(city+13)+50-floor(metric/10))>>3`，之后三次`SUB byte,DL`只使用`damage=damageWord&FFh`，依次饱和扣`city+10/+11/+13`。中间减法下溢不能钳0，也不能把整个damageWord扣进byte字段。该链0 RNG，不写产量/城兵上限。

复演输入：城兵/上升率/防灾为87/104/100；16条kind1、flags80、metric1370。原版返回metric1370，D315=21，damage=0，三字段不变；现Web正式`originalexit.js`却返回5480、damage8140并扣为0。flags81时D315=0但AX仍1370。另无kind1或全FFFF的受控异常输入得到damageWord7390、DL222；metric3000得到8171/DL235。这组纯内存输入本身不证明地图可达性；后续§2.4.2已在两个原始城市目录构造出无kind1状态，不能再把该分支一概当损坏数据。

父重放源码/结果保全于`C:/Users/fczll/AppData/Local/Temp/dragon-ai-date-render-13emjwia/`：`wall-probe.py`只提取固定快照的CPU/walls/wall_boundaries，快照SHA256为`3282b011c402aebeb65779f5490265ab86771679bcd681fe7fb5e359535c6005`；输出`wall-result.json`、`wall-web-contrast.json`。执行范围`9FF8..A037`及`A65D..A69F`，停在清屏入口前，无KI callee替身；10条常规墙输入和4条边界输入均与上述原指令一致。该有限CPU只建模本路径消费的标志，不认证硬件/完整战役。

**撤销旧实现一致声明**：`originalexit.js`的乘4、缺少最终DL截取、无kind1早退，以及`autobattle.js`旧战术城损fallback均须按本证据修正；`verify_battle_original_exit.mjs`中的旧乘4golden不能再作为原版证明。P49已按本证据修正上述生产/测试路径（`originalexit.js`、`autobattle.js` fallback、两套golden同步更正，P49现刷窗A65D..A69E/9FF8..A036与本节一致）。VM op15对D315的乘4查询是另一输出，保持不动。

### 2.4.2 原始城市目录确有无kind1的构造结果

原始`BATTLE.MAP`长`0x200+214*0x1000`，SHA256 `8bbb2867ed526a2dcd2fcc1e0202a93952dcd113d3720936fd7304fd9e3ef872`；`BATTLE.MDL` SHA256 `3522f7362f928fae45c1431a9efe57e285250d9db05d04ebdcb59f420e3e0bd3`。未使用Web导出资产反证原版。

- `4AF3..4B08`将攻城DI换成城市索引D34并清D35；`9A5E..9A6F`令目录0..191为mode0。`CAEB..CB41`取目录号而非layout号计算地图偏移`200h+directory*1000h`；目录首byte仅选择MDL布局。对214块原始地图逐byte计数，前192城只有**75与154**完全没有D0..DF墙tile；两者layout都为1。目录88对照有5个墙tile、layout0。
- `9ACE..9ADF`清对象区1800h字节；军团初始化限定前96对象，即0000..0BFF。随后`9CB3`以ES=D30E+00C0、DI=0进入`9CE2`，按列扫描D0..DF，建kind1记录；`9DA1`只向剩余前16槽建kind2，`9E10`从DI=0200开始建kind3。不能将“前16条地图对象”视为“永远至少一条城壁”。
- `CB9B/CBBC`的翻转与tile改码保持D0..DF集合，不会凭空生成墙。父分别以两个无墙目录和88目录的原始MAP/MDL输入，实际执行可选`CB9B`、完整`9CB3`（含`9CE2/9DA1/9E10`及真实ECE0）、再执行`A65D`，无KI callee替身。
- 75与154在翻转前/后均得到kind1数量0、AX=FFFF、D315=FF；88两向均得kind1数量1、metric1370、D315=21。地图对象构造的RNG为0/0/12字节，不能统一把`9CB3`当无RNG函数或跳过`9E10`。

证书：上述父TEMP内`wall-map-probe.py`与`wall-map-result.json`；每次原调用限500000指令，仅执行已审核CPU类。资源装载输入和9ACE后的零区是显式接口，未模拟DOS读盘、整场军团初始化或全部战斗帧。**已闭合的是原始城市资源经真实构造得到无kind1，不是这两个目录的任意完整战斗历史都已复演。** 后续仍要接到真实退出调用，并审核其它目录及运行中所有墙写者；但当前Web `found=false`早退不能再以“原始城市图不可能无墙”作理由。

## 3. 已定位、尚待闭合

### 3.1 单位对象初始化与命令执行器

对象初始化实现：`web/src/game/battle/originalinit.js`。

- `0x9E97` 把双方原军团记录裁成各 `0x20` 字节临时记录：复制军团
  `+1..+7`，六队各复制 `+0x28+i*4` 的前三字节，并把每队临时幸存槽清零；
- `0x9AF4/0x9B6D` 固定建立双方各6组、每组8对象模板；每槽初始HP来自
  临时军团 `+6`，CLASS为 `18*type`，POWER严格按武将原始字段、战场mode和
  `CS:9C0F=[0x1E,0x04,0x0C,0]` 的u8公式计算；
- `0x9B40` 只特殊化双方第一个对象：CLASS清零，并重算POWER和HP；
- `0x9C45` 严格按对象地址顺序固定消费96次RNG，空组也消费；每组最多激活8
  对象，激活一个就同时令临时总兵u16和该队剩余数u8各减1；超过8的未展开兵力
  保留在临时记录中；`9C98..9CA6`初始空间索引已纠正为`y*0x40+x`（`AX=(Y<<8)>>2+X`），不再误用`y*0x10+x`；
- `0x9F2C` 在B4B8已累计到临时组`+3`的退出幸存数上追加仍活动对象；最终六队结果为临时未展开数`+1`与`+3`之和，不能在9F2C前清空`+3`。
- `ADC8`的B413/B4B8对象生命周期已接入：inactive且bit0清时从该队未展开兵补入；撤退侧不补；命令5对象到边缘经B4B8退出并计入临时幸存数。ADC8计数按对象进入本槽时是否active执行，B413同槽新补对象到下一帧才进入AEA9。
- `0xB047/0xB069/0xB08B/0xB0AF` 四向平面移动的“先探针、清空才提交，
  非零占用ID转 `0xB533`”调用边界已经落地；
- 活动子对象`A7FD`已接入子对象跳表A82D，命令0执行AA2C阵型目标；两侧组长则统一走A7B7/A7E7；
- `ABD2/ABFF/AC55`、`ACA4/ACD6`、`AD2D/AD7F`与`B8AA`固定附属槽已闭合：
  远程冷却为0时先固定消费1次RNG再查槽，近层攻击0次RNG，入口不直接扣HP；
- `9A33→A110`静态可见D316与B561/B569自修改，但完整写入链已闭合其正常产品路径为不可达：`4B63`返回CH只含0/bit6，`4A91`整字节写D35，随后`4E8F/4F16`仅OR bit7/bit6，故D35低四位恒0、D316恒0且B561/B569保持0x600。Web保留标准0x600双方边界，不为不可达非零低四位制造隐藏状态。
- `B0D3/B116`上下层移动、`B15D/B186`占用探针与`B732`双平面占用字节
  交换已闭合并可快照；占用冲突后B533返回carry-clear时会把候选BX写回`+0x0C`，
  但层级/高度增减只发生在无占用的直接通行分支；
- `B1B1`双占用平面、动态高度描述、tile门槛与probe内自动跨层已闭合；
- `B941→B97E→BA2E→BAB7`效果对象逐帧命中、8.8轨迹、重力、阻挡和清槽已闭合，
  该链0 RNG且不经过B533；B8AA仅有32固定槽并按`source&0x1E0`产生别名；
- `0x9FDC`退出接口已定位；旧“城损实现已闭合”声明撤销，`A65D→9FF8`的原返回值和DL位宽已由§2.4.1更正，P49已修复生产路径。双方六队/士气仍须与完整退出及战略续段分别认证；
- `C653→AED2`环形队列、每帧2项预算、路径内存快照与`B00D`路径word消费已闭合；
  B00D已确认路径区寻址为`0x1800+(SI<<2)+u8 offset`，完整窗口0x3000字节，
  双方对应对象不再错误别名；`BD46..BFF1`双平面u16代价波前、固定方向展开、
  地形代价与最多64项回溯已实现并作为AED2默认builder接入；
- 可视战斗正式tick/finish/命令入口已切到`OriginalBattleSession`：Canvas不再调用
  `simulation.tickBattle`决定兵力、士气、城壁或胜负，战果唯一来自`settleExit()`；
  UI命令已通过固定帧命令队列写入，玩家军团在玩家守方时交换到对象0侧；撤退基址按该sideMap选择，不再固定写守方=0x600；
- `0xB240`普通对象占用提交已静态闭合：旧`+0E`双平面清低7位保留bit7，
  新`+0C`双平面OR对象ID并同步`+0E=+0C`；提交末段还把锚点`+6/+8`、层`+0A`和高`+1E`分别写入前值`+7/+9/+0B/+1F`，Web规则态已同步，C4FA/C51E/DAAA/DA1C仅属VGA刷新投影；
- `0x291A`严格0/1次原版字节RNG已接入，同势力/君主/0x18短路不消费RNG；
  战略速算也显式携带同一原版字节RNG，不再在普通武将分支缺失；
- SAVE已写回军团完整status、撤退目标节点/坐标/城/命令态、延迟槽+2/+3，
  武将空所属写FF；活动军团+2为主将byte、+3为bit5接敌倒计时；Web以版本化sidecar保存完整257字节RNG及二进制无法区分的规则态，
  不占用SAVE.DAT未知尾段；
- `AF65..B00C`对象移动状态机已验证四向/上下层步进、路径word消费、C653请求和
  B240提交，并已作为executor的move handler接入正式facade；
- `CAEB..CB43`资源装载已再次校正：BATTLE.MAP 的64×64 tile不是按layout取三个
  256B滑窗，而是按**目录号**读取`0x200+directoryIndex*0x1000`；文件恰为
  `0x200+214*0x1000`，所以214个据点/野战目录各有独立地图。目录首字节layout只在
  `CB44..CB71`选择BATTLE.MDL的`0x1000+layout*0xF800`块。每块前0x800为
  256×8 D302描述，后0xF000为192×0x140地形图形；BATTLE.SCH整个文件则是
  360×0x140战术对象半帧，并非layout调度块。图形记录格式由`DFBB..E156`闭合为
  32×16、0x40B mask加四个0x40B VGA平面；对象帧公式由`B32D..B355`闭合。
  战术atlas调色板不能采用`palette.json`归一化后的n×17通道；原版截图及ICONGRF战术UI均证明应保留4-bit高半字节n×16。
  `C4FA`仍以`y*64+x`索引tile；`DA1C/DAAA`的显示坐标为`X=16*(x+y)+16`、`Y=64+8*(64+y-x)-16*level`。其缓冲行公式是`(y-x)/2+20h-level`，而DDB4一行输出16px；DD22每个descriptor槽也令`SI-=400h`，故相邻静态层同样上移16px，`DL=0,2,..,12`是遮挡高度码。地形按`y-x`深度与活动对象交错绘制，外围由`DD22`固定tile0（layout0/1 sprite20h、layout2 sprite21h）填充，不能转置、水平翻Canvas或使用黑底。
  `CB9B/CBBC`保留边界行、反转线性内部区`0x40..0xFBF`并转换方向tile；非零theme变为`3Fh-theme`。玩家守城时`4F16`同时置D35 bit7/bit6，因此同样走该地图变换，但人物、相机与点击坐标保持原轴。
  `C6F6→C775`从双方战术临时记录`+4`取总兵，右移2并钳到124px画红线；`C6F6→C78E`从双方主将对象`+3`取HP/士气，以`floor(v/2)+floor(v/4)`并钳到124px画黄线。Web呈现按用户指定布局：192px宽标题/敌军/玩家窗分别位于左上、右上、右下并离边16px，高80/112/288px；三个窗的四边纹理由DOM canvas直接复用`GameBar._drawWindow(...,"black")`。弹窗文字16px，兵力/士气分两行白字，标签左、Oswald数字右且不显示“人”；原始0..124进度等比投到160px，与双箭头按钮同宽。左下528×36六卡栏使用88px DOM卡，不用整卡PNG；显示顺序`左翼、左備、大將、先鋒、右備、右翼`映射原始军团槽`2,4,0,1,5,3`，兵种图标逐卡读取真实type，空槽不可令后续卡前移；每卡底部黄色线按该队当前兵力/入场最大兵力更新。战术主将对象HP可经能力公式超过200，士气文字只在呈现层钳到游戏上限200，不反写HP且不改C78E黄线。此布局是Web呈现政策，不是原版机制结论。
  `BB3C/BBA6/BC39/BCA6/BD07`双导航平面、坡道层描述和代价区已改由214张目录地图与
  三套0x800描述生成并进入Session；BD46的`CL=EB/74`按原版仅控制
  跨层分支（非方向mask），四向展开始终读取10/20/40/80，垂直代价含层差；
  `BD96..BDBE`端点双平面择路已按静态指令闭合：`BP==0 && CL!=EB`先检查目标上层中心/右/左任一方向高半字节，存在则选上层；否则回退检查低层三点，无连接即CF=1。该条件已补固定fixture；真实逐帧捕获仍用于整体差分，不再阻塞本分支实现；
- `0x9CB3→9CE2/9DA1/9E10`地图对象池已进入Session：9CE2/9DA1共享前16槽
  `0xC00..0xDFF`，9E10固定从`0xE00`开始；0xD0..DF连续墙段、0xF0..F7障碍和
  D302低字节回绕索引命中0xBA..BF的kind3对象均按0x20记录建立；9E10每创建一个
  对象固定消费1次RNG并写`rng&3`；占用ID可被B533解码。kind3记录的`+6/+8/+A`
  是X/Y/level，`+1B`是0..3相位，`+1C`为SCH基址；偶/奇subtype写`150h/204h`，
  对应红/蓝军旗logical 72/162起始帧。`B941→BB10→DC03`逐帧将其按16px level
  投影到城头；它们不是六队slot0替代标识，也不能按8px level压进城墙立面；
  `B5B7→B799/B824`的metric递减、归零后下一次接触破坏、tile按`<F0:+10`否则
  `+8`改写、清六占用平面与高度描述已接入；B799不是只改命中记录，而是读取其`+8 Y`后固定扫描前16槽，对所有同Y记录逐个调用B824；碰撞本身0 RNG；
- 固定帧整体顺序已按`A065`纠正为入口消费并清`D348` mapRedraw→`A12A`自增`D318`并比较`D322/D324/D326`呈现调度→A6FA/A754/A785对象命令→B941效果→ADC8；ADC8内部为清计数→AE56→AED2→地址升序AF69/B240/AEA9→D31E，因此同帧B941伤害可被随后AE56观察。Web已把D318与三项调度寄存器纳入Session快照，命中时只发呈现事件。`A1C5`主循环前启动链也进入同一Session：所有mode先固定50个A065；mode1再执行A2E8双方主将评分（每方固定2 RNG）、优势旗帜/等待与可达的单挑帧，A2E8成功时BATTLE.DAT脚本PC前移3个word。`ADE7..AE26`门控已落实为active且flags bit6清零才进入AF69，攻击/受击效果bit6置位对象本帧只走B240；`AF6E..AFF5`四向判定方向已按指令纠正：锚点`+6/+8`大于位置`+10/+11`时走B047/B08B递减，小于时走B069/B0AF递增；地图对象
  接触从B613无条件通过C653重建攻击者路径；阵型基准修正为`0x2005/0x203A`，
  D35现独立合并bit6地图字节/theme变换与bit7玩家守方；玩家守方时`0x4E8F`交换D2E/D30，因此对象0侧始终是玩家军团、对象1侧是对手。战后旧兵力统一为十人单位，避免士气比例缩小10倍；UI显示才乘10还原“人”，不得改Session；
- B824后续BB6D已按新tile重建七层bit7并保留低7位碰撞ID；`B7CB`已接入命令2切换：仅mode0且命令方匹配D35指示的玩家对象侧执行（D35 bit7清→对象1侧，置位→对象0侧），扫描前16个kind1、active且bit0清零墙对象并调用B824，不改对象bit7；C4FA仅为VGA旧点刷新，Canvas以逐tile事件和`mapRedraw`投影，不参与规则；
- 已增加`originaldiff.js`规范化规则包、逐blob hash、首差异字节报告和静态fixture回放；
  真正KI.EXE动态捕获工具已准备：本地`.tools`已取得并校验DOSBox-X 2026.08.02 portable，包含DEBUGBOX、MEMDUMPBIN与断点命令。尚缺的是可重复进入同一原版战斗的输入脚本，以及`A426/A065/9FDC`断点状态导出流程；工具可用性不再是阻塞。

### 3.2 碰撞与伤害入口

实现：`web/src/game/battle/originalcollision.js`。

- `0xB533` 将占用探针返回的对象号解码为 `DI=(AL-1)<<5`，以 `0x600`
  边界判双方，以 `0xC00` 边界判单位/地图对象；
- 同侧对象按 flags/state/current command/高度与 class 门槛决定阻挡或进入
  `0xB732` 空间记录交换；该路径不消费 RNG；
- 敌方目标 `[DI+4]!=0` 进入 `0xB618`，每条路径固定消费 1 个 RNG 字节：
  `roll=(rng&0x7F)+power`（u8），`D31E` 非中立时，匹配攻击方侧码增加
  `damage+0x40` 饱和，否则 `roll-0x32` 下限0；`roll>=0x46` 命中；命令2
  再令伤害 `+0xC8` 饱和；HP归零时 `flags=(flags&0x10)|1`、kind=4；
- 敌方目标 `[DI+4]==0` 进入 `0xB6BC`：HP<=1或目标命令0/5时消费0次
  RNG；否则首字节 `<0x19` 直接命中（共1次）；其余再消费1字节，以
  `contest&0x7F < clamp(attackerPower-targetPower,0,0x18)` 判定；伤害为
  `max(1,power>>3)`，HP最低保持1，因此该路径不会杀死对象；
- 命中/失败分别保留原版 `0x102F5` 事件号6/7/8/9，事件仅供动画消费；
- `D31E` 已作为原始三态寄存器纳入会话快照；其产品语义暂不命名。

验证增强项：真实KI.EXE动态逐帧差分捕获。TALK 606..669的静态可达性结论见下一节：当前构建更支持未启用，Web句子属于呈现政策而非规则缺口。

### 3.3 战中发言与双通话框

产品层固定保留攻守双方两个带头像通话框，战斗中的命令、冲锋、齐射、破壁、
溃退等发言按侧更新对应通话框，不覆盖另一侧最后一句。头像优先取该侧主将，
城池无实际军团长时回退守将/通用NPC头像。

实锤勘误（2026-08-26）：`C315→C39C→075B` 是真实TALK链。`C3B0 E8 A8 43`
在16位IP下跳到`075B`，线性反汇编打印`1075B`曾导致调用者扫描漏判。
`C349..C350`取说话方临时军团记录`+1E`到AH、`+1`到AL；`075B`在CX>=0x196时
以`0x196+(CX-0x196)*8+AH`取TALK指针表。因而旧“606..669不可达”结论撤销。
`C1F7..C20F`普通命令选择`CX=0x1B1+cmd`，守方城壁改`0x1B4→0x1B6`；
`C21A/A8F6`撤退选择`0x1AF`。由075B公式可复核：撤退606..613，
普通阵形622..629、攻击630..637、突击638..645、城壁646..653、守阵654..661、
守方城壁662..669（每池再加临时记录+1E选择值）。`A69F`（op16）按cc/D349门控，至多调用一次
`C315(CX=0x1CE+AH, DL=cc&1)`，不是循环AH次画旗。完整个性索引、双侧替换和现代3秒表现边界见生命周期文档；这仍不代表原始VGA逐像素窗口已实现。

### 3.4 指挥面板原始输入链（2026-08-26 实锤）

- `C897..C8AD`用E3D7注册ID3、(496,248)整块128×32区域；`C11A..C160`
  计算`index=((mouseX-496)>>4)+(mouseY-248>=16?8:0)`，写D346与D342=index×0x60。
  **一个命中区内可细分16格**；旧“没有16个命中区所以不可点击”结论错误。
  D346为玩家阵形选择，不是相机列；`C11A..C164`没有到C315的调用，故单独选图标不发武将TALK、不写对象命令、不消费RNG。
  `ICONGRF.DAT[2800h..2FFFh]`可直接按四个`200h`平面解出完整128×32图：16格各16×16，红/黄视觉框位于格内`1..14`，两排外没有整体框；文件中的第0格是当时选中的黄框。`extract_battle_formation_icons.py`只把各独立图的框标准化为未选红色并原样保留glyph，运行时黄框跟随D346；`verify_battle_formation_assets.py`逐像素回查原文件。
- `C8BC..C8E3`注册ID4/5/6：(552,288,64,24)/(552,312,64,32)/(552,344,64,24)。
  `C165/C181/C19D`仅改D33C低字节到0x30/0x1C/0x05，高字节保留。
  `AA2C..AA69`按D342选CCE4向量，以D33C/D33D为坐标基址；`A50D/A516`
  供脚本读取玩家阵形/部署档，故三块是部署基址选择而非相机控制。
- `C27D..C30C`六卡XOR D310各bit；`C1B9`在D349=1时直接拒绝并保留mask。
  其它情况下`C1CE`用xchg清D310，零mask→FF；`C1D9`随后才判cmd3/AB4F。
  合法普通命令只写所选**组长pending**，不改flags、不广播孩子；`C1F4..C216`随后同一次按钮处理恰好调用一次C315（阵形/攻击/突击/城壁/守阵为1B1..1B5，守方城壁1B6），所以确认TALK边界早于A7B7实际切换。即使重下同令也会确认一次，但不提前广播。
  `A7B7→A92E/A953/A96D/A988`在实际切换时才A8DE广播，并由A8CC/C673更新状态图；守阵A99C每帧按距离广播0/4。
- `C21A→A8F6`仅D349=0时接受撤退，忽略mask、写六个组长pending5、D349=1；
  成功后C229清mask，拒绝保留。`A156`的INT33h功能5返回AX按钮位图（AH=0），
  `E453`只替换AL为命中号，BFF2保存/恢复AX后分派；A8F6也保存/恢复AX。已是current5的对象不能再切换。
- `A92E/A953/A96D/A988/A99C/A9D0→A8CC→C673`只在玩家组长接受0..5命令时绘制状态图。
  内部6/7/8无此调用，保留先前图；不按currentCommand直接索引图集。
  `00B2..00C3`加载ICONGRF文件0x9700到D48段；`C673..C6A1`SI=cmd×0xC0，
  DX=组X+54，BX=374，CX=0x1018→F888四平面24×16，六帧依次阵形/攻击/突击/城壁/守阵/退却。
  `extract_battle_status_icons.py`复现提取；GAMEPAL.BRG首16色按B/R/G低四位解码，
  EBDC..EC29闭合DAC的R/G/B写出顺序，Web按既有战术素材n×16通道输出（显示转换政策）。
  `verify_battle_status_assets.py`锁KI/ICONGRF/GAMEPAL三个完整源SHA256、关键VA+0x200字节及六图像素hash。
- `C234`切A06A的JE(74)为JMP(EB)，马上`DC9D(128,128)→DDB4`；
  `DC9D/DD22`该原点在64×64地图外，绘tile0背景，后续对象被视口原点裁除。
  再点击`C260`恢复74并置D348=1。隐藏期间A065绕过重绘及清D348，但仍A12A/A6FA/B941/ADC8，
  `A0F2`等待值CFC不变。因此这是战场显示抑制，**不是速度档切换或暂停**。
  Web保持现代相机不动，仅隐藏地形/对象而保留原始tile0底纹；恢复时消费待重绘请求。

## 4. Web 表现边界

旧`battle/simulation.js`中的随机伤害、兵种克制、士气溃退、城壁strike和超时判胜平行规则已删除。正式产品仅由`OriginalBattleSession`推进规则；`battleprojection.js`只组装零RNG的Canvas显示DTO。

现代对白窗口的产品规格集中在`web/src/ui/battlepanels.js`：480×80外框（30×5个16px tile）、8px纹理框内距、64×64缩放头像、16px共享popup字体；敌方顶边对齐左上标题窗的16px顶距，玩家底边对齐六卡栏的16px底距。姓名与正文作为一个内容块在64px内高垂直居中；正文保留换行并对CJK和无断点长词自动折行，固定内容高内裁切；纹理仍由`GameBar._drawWindow`读取原`frame_sq/frame_col/frame_cap`绘制。此段是用户批准的现代呈现，不是KI布局结论；3秒、全局右键、双侧替换及规则/RNG隔离语义不变。

## 5. 战术墙钟门控与战略速度隔离（原始证据 / Web政策）

- 认证源：`KI.EXE` 67099B，SHA-256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`；`YNSOUND.COM` 3463B，SHA-256 `e2c6a6a8576c4f2a96b7e3f156d7f48c9570ae03539fe9367adb78aebb364fa1`。
- 设置链`5FAA→6062`、字符串向量`5FF2/6033`及分发表`6056`闭合：原存储`CFB=0..4`依次为最高速、高速、普通、低速、最低速。`60A5..60B3`执行`CFC=CFB<<4`，故Web低到高等待计数为`64/48/32/16/0`。
- 战略尾段`1DF8..1E16`只读`CFA`；每个完整战术帧末段`A0F2..A110`只读`CFC`并等待`D2C/D2D`。`9FA0..9FDA`无输入仍按`A426→A065`执行，门控位于同一完整规则帧内，不能把战术速度降为纯动画速度，也不能让战略速度改变战术帧、HP或RNG进度。
- KI`0031→033B`经INT61 AH=0Ch注册`0356`回调；YNSOUND `017D→08B7`将PIT ch0设mode3、除数`0100h`，`0913`每16次IRQ执行`093D`回调。标准PIT下周期为`256×16/1193182≈3.4328376ms`，四档非零战术等待约`219.7016/164.7762/109.8508/54.9254ms`；最高速跳过等待，绝对FPS依硬件而未知。
- **Web产品决定（战术节奏半速批次，用户明确要求）**：入场展开和后续战斗的五档推进速率统一减为本次变更前的1/2。`tacticalclock.js`单独定义`TACTICAL_PLAYBACK_RATE=0.5`，不改原始IRQ常量：低到高实际间隔约为`439.4032/329.5524/219.7016/109.8508/33.3333ms`；最高档由此前固定60Hz变为30Hz。该倍率是用户要求的Web节奏，不是由截图或体感证明原程序快慢，更不声称实机同档FPS一致。
- `BattleView.updateBattleFrames`的A1C5启动步进和后续输入→A426→A065共用这一个预算器；首个A065仍立即执行，之后尾部等待加倍。相同命令帧的Session/RNG/HP/城损处理不变；不通过改单位位移、伤害、动画帧数或跳帧来减速。战略速度、音乐速度及已批准的3秒对白显示时长均不随此倍率改变。
- 每RAF仍最多1个完整规则帧。实际RAF把完整有限非负间隔交给预算器，不先截断为50ms；延迟/后台callback按完整间隔取模，只保留不足一帧的真实相位并丢弃整帧欠账，恢复后不得连续追赶。此RAF上限是呈现政策，不冒充原版固定FPS。
- 原始字节锁见`tools/verify_tactical_speed_original.mjs`；墙钟、默认单帧上限、丢欠账和战略速度隔离矩阵见`tools/verify_tactical_speed.mjs`及fresh Chromium acceptance。

## 6. 实施顺序

1. 固化原版 RNG 与快照/回放（已完成）；
2. 建立原版 `0x20` 单位槽、6×8×2 对象池、确定性命令队列和固定帧会话（已完成）；
3. 闭合 `0xA8DE/0xA8F6` 广播、公共命令切换与 `0xA85B` 目标选择（已完成）；
4. 移植 `0xB533/B618/B6BC/B732` 碰撞、伤害、状态迁移和精确 RNG 短路（已完成）；
5. 移植对象初始化、伤亡汇总、命令跳表、A754/A785帧顺序、阵型目标、A7FD、
   四向/上下层移动、攻击对象、效果生命周期、C653/AED2、BD46及地图导航（已完成）；
6. 移植首对象HP `<0x32` 触发的 `AE56→A8F6` 自动撤退、mode0十帧HP衰减、
   `D31E`重建、结束倒计时及完整 `0x9FDC` 战术退出（已完成）；
7. 闭合城壁特殊受击条件；
8. 建立固定 RNG + 固定命令帧的 KI.EXE/Web 差分测试；
9. Web 画面只消费模拟器的状态与事件。
