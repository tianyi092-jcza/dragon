# 军团去向与注销审计及严格内核

**状态：已接 detached native 的有限无消息去向/解散真实调用者，见§7；原属回归3485→50D7限定handler见§8（不解除外围事件泵）。一般灭亡/消息/初始化链未闭合，默认v1与正常App拒v2不变。** 本页维护本次接线前差异与提交边界；字段定义仍见[实体字典](re-notes-entity-fields.md#general)，历史当前槽/其它槽续段见[AI全链P01](re-notes-ai-chain.md#6-p01去向返回与当前活动槽尾部)。不能把静态写集、旧 Web 测试或消息入队当作完整原 callee 返回。

## 1. 原始来源与重复方法

只读 `E:/Dragon/Dragon/KI.EXE`，SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`；文件偏移为 VA+200h，near 目标按16位回绕。未运行 EXE、读取 SAVE 或浏览器存档。

仓库根执行（已审 `tools/disasm.py` 的 `data/va_range`；不调用 pickle 辅助）：

```bash
PYTHONPATH=tools PYTHONUTF8=1 PYTHONDONTWRITEBYTECODE=1 python -B -c 'from disasm import va_range; print(va_range(0x291A,0x2AF4)); print(va_range(0x2BA8,0x2BD9)); print(va_range(0x463E,0x4698)); print(va_range(0x7028,0x703C))'
```

四窗合计633B、270条线性解码指令；不把窗口覆盖当作动态分支覆盖。对应原字节 SHA256：

| 半开 VA 窗口 | SHA256 |
| --- | --- |
| 291A..2AF4 | `3573971cd295a92d0799f447ce9961b93fae30fd4857cbc6b87fb35720db4c0a` |
| 2BA8..2BD9 | `19264a7fc5105bf6fd26787008442a1173de8c46b753c7cb37e42a683c42f3b2` |
| 463E..4698 | `f2fea6f3c83a19b2b7007e26a8d8f7a90334fef84a93ad38ba015cacd822e7da` |
| 7028..703C | `86f3514a3d72941d6547627cab9622fbe0e037d389edfb282ed5280e35dcd7f2` |

## 2. 291A：入口、身份与 RNG（静态实锤）

1. `291A/291D/291F`：L00<80h立即RET，不读其它规则字段、不消费RNG。活动入口先保存AX/BX，把传入AL写CS:2919，再`2926→2BA8`。
2. `2BA8`先无条件`AND byte[L00],EFh`；随后才测CS:98A6 bit2。清位路径不调显示callee；置位路径依次9656、96ED，未闭合这些callee前不能当作整个2BA8 no-op，也不能无条件假RET。
3. `2929..2935`从L01定位势力，读F01君主号与F03首都；`2938..2940`按**当前固定槽地址**定位同号武将BX，不按L02或显示名找武将。
4. `2944 80fcff / 2947 7428`：首都FF直接29C3，优先于所有逃脱短路。否则`2949 3a4402`比较F01与**L02**；再按接收方==L01、接收方==18h短路到2977。该门不是势力attr活动判断，也不能混同“同号武将”与L02。
5. 仅余下分支在295B消费一次ECE0；`u8(RNG)&7Fh <= (G1F>>1)+28h`走2977，否则29C3。G1F读取来自上面的同号武将。门槛最大167，无byte加法溢出；不能因此省略门槛>=127时那一次RNG。

`ai.js:dispatchLegionFate` 的legacy/v1分支用 `factionIsActive` 包围逃脱门、用general.idx比较君主并容许缺评分补0；均不能替代此严格native入口。已有v1兼容夹具的slot/generalIdx不一致也不是原版身份认证。

## 3. 四种注销路径不得合并（静态实锤）

| 原入口 | 规则写序与条件 | 保留/后继 |
| --- | --- | --- |
| 2977 | 按BX武将反定位同号槽；2989远指针L1A/L1C→298C占格byte DEC；2990 status08；2993 counter30h；2997→4689减F14 | 不清武将G17；TALK31/32之后返回；不清L03之外的道路残值 |
| 29C3 | 同号槽status>=80h才占格DEC、减F14；**无论槽是否活动**均29EA→2AD2(AL=FF, AH=旧G1C)；随后29ED清槽status，29F0写G17=4，交换G1C并写G1D | 不清L03；捕获没有在此给接收方F18加1；消息/永久退场见§4 |
| 4651 | 4658先减F14；466C→4717归还六队；466F清槽status；467A清同号G17；4682最后占格byte DEC | 不清L03、不改G1C；463E返回后若L01是玩家还调5E80(AL=8)（纯HUD刷新，P32已放行，见[消息ABI§17](re-notes-strategic-message-abi.md#17-p3288105e80传递树写集审计与规则闭包)） |
| 7028 | 702D先XCHG清槽status，按**旧status bit3**决定是否跳过7033/7036占格DEC | 此本体没有F14/G17写入；不能用status>=80门替代bit3门 |

`2AD2`本体只读AH旧属、AL新属：非FF旧属先byte DEC F18，非FF新属再byte INC F18，各自独立跳过；不饱和、不按live数组重算。相同非FF新旧属也会先减再增，不可为了净值相同省略消费/失败边界。

`ai.js:disbandLegionForReturn/clearCapturedLegionRecord`尚缺对应占格副作用，`settleCapturedGeneral`没有29EA的严格F18接缝。现有native表inactive捕获修复仅认证[行军§3.15.5](re-notes-march-pathfinding.md#native-formation-callers)的限定写者，不是这些callee已完整接通。

## 4. 被俘消息分支与永久退场勘误

### 4.1 TALK33不接19Ah

原指令：

```text
2A1E 33d2        xor dx,dx
2A24 3a471d      cmp al,[bx+1D]     ; 玩家是否旧属
2A27 7408        je 2A31           ; 是：DX保持0
2A29 ...        cmp al,cs:[2919]   ; 否：玩家是否接收方
2A2E 7548        jne 2A78          ; 都不是：无消息
2A30 42          inc dx            ; 仅接收方：DX=1
2A36 b92100      mov cx,21h
2A39 03ca        add cx,dx          ; TALK33 / TALK34
2A3B e8d25d      call 8810
2A41 23d2        and dx,dx
2A43 7433        je 2A78           ; TALK33返回后直接退出
2A4E b99a01      mov cx,19Ah        ; 仅TALK34后续
2A51 e8bc5d      call 8810
```

**原调用者静态分支实锤**：玩家是旧属只发TALK33；玩家不是旧属但为接收方才TALK34→19Ah；都不是则静默。两种身份相同的显式输入也由旧属门优先选33，不额外执行INC DX。完整8810寄存器/设备返回仍见[消息ABI未闭合边界](re-notes-strategic-message-abi.md)，这里不宣称已动态走通消息。

撤销“所有被俘通用消息后都接19Ah”的旧摘要。`tools/verify_postbattle_fate.mjs` 原TALK33附19Ah断言已删除，保留捕获状态、RNG次数、TALK33及独立TALK34→19Ah断言。删除错误oracle不是修复，更不是负向覆盖：正式修复时须增加TALK33不带selector及真实FIFO无第二段的回归。

**本轮挂起接线（现刷＋泵验证）**：2977分支现刷`299D..29C2`关闭——`299A mov cx,1Fh`预置，玩家==L01走29AE单8810 CX=1F（TALK31），否则玩家==captor则INC CX后单8810 CX=20（TALK32），都不是静默；参数push AX=L02|FF00、DI=SP、AL=93h，无CDE、无第二段。TALK67现刷`2A5F..2A78`关闭——玩家==captor才单8810 CX=43h（push BX、DI=SP、AL=93h；无CDE、无第二段），否则静默；G17保持4。31/32/33/34/67五支前缀皆在消息前提交、关闭后原版直接返回，故挂起无尾写：内核`onFateMessage`通道（缺省历史stop裸叶合同）→行军/野战/攻城三入口blocks透传→`buildNativeSiegeBlocks.onPlayerFateMessage`→TALK35形状挂起（无clickSfx、无continuation，onComplete直认ticket，34独附0x19A）；`dispatchLegionFate`（v1结算出口）仍保持stop。legacy `enqueuePostbattleFateTalk` 的TALK33多19Ah偏差一并修复（仅34附selector）。覆盖：`verify_original_legion_fate`新增通道裁决/回落/五talk序列断言；`verify_native_legion_fate`新增blocks透传＋挂起形状（34取19A/其余无selector/无UI抛错/stale ticket完成幂等）。

### 4.2 永久退场不清G17

29F0已写G17=4。旧属attr<80h且G00 bit4置位才`2A57→2A5A`：G00=0、word G1C=FFFFh；这条支路**没有再写G17**，也不执行普通分支的清君主bit6/G1E加3。玩家为接收方才TALK67；否则静默。

实体字典[武将3.2](re-notes-entity-fields.md#general)此前已正确记录这一点。legacy/v1 Web额外 `general.status=0` 不符合原残值；此处只登记未修差异，不把attr清零与所有字段清零混为一谈。

## 5. 2A7E返回与下一实施边界

`2A7E`接收的是slot相对偏移SI，不是2240h绝对军团指针；先DEC `[SI+2243]`，非零立即RET。归零才清槽status和同号G17；F00<80h则G1C=FF并立即RET。仅F00>=80h且L01==玩家才依次CDE→TALK35→198h。**灭亡分支不发TALK35**，不能把“玩家等于记录owner”作为唯一通知门。

以下是接线前审计的历史依赖顺序；§7已推进有限域，其余继续保留停点，不直接复用legacy helper：

1. 定义严格F18及同号槽/武将、远指针占格消费，保留上述写序与异常前缀；核初始化/保存字段来源，未知不补零。
2. 先隔离2BA8绘制关域、无消息2977/29C3/2A7E与NPC463E的可复核输入；绘制开域、5E80、消息返回仍各自明确停点。显示关域是输入合同，不是默认世界事实。
3. 从真实47BB高费、28F4、4325状态11及25E5入口接续，再覆盖当前活动槽尾、其它槽、保存恢复；不新增平行轮询器。
4. 独立修复消息分支时，须测试旧属/接收方/都不是及身份相同优先序，检验真实FIFO、3秒/右键和hold；不能只改一个selector断言后称完整去向链完成。

审计批次未更改生产规则、v1/v2准入、保存格式或实际存档。后续隔离实现见§6；全AI与完整去向返回保持未完成。

## 6. 严格内核（P24-FATE-KERNEL-1 历史阶段，接线状态已由§7取代）

`web/src/game/navigation/originallegionfate.js` 实现 `291A/2977/29C3/2A7E/2AD2/2BA8/7028` 的上述有限域。它是**待接线的原指令内核，不是第二套生产规则路径**：没有生产 import、Scenario 适配器、独立轮询器或新保存字段；返回字符串仅供 Web 调用者识别结果，不冒充 AX/CF 或完整 ABI。`4651/463E` 及六队归池接缝尚未实现。

### 6.1 显式 IO 合同

- 军团/武将均按固定槽0..127寻址；`readLegionByte/readGeneralByte/readFactionByte` 与对应写函数处理明确偏移。读不到值或读到非byte立即报 `OriginalFateBoundaryError`，不补0、不读raw/leader或扫描live数组。接口以裸byte表达FF，不把null自动转换成FF。
- `readLegionWord(slot,1A/1C)` 提供**现有Web规范占格指针**：offset为0..383、rowParagraph为24×0..255，并非DOS segment；`readOccupancyByte/writeOccupancyByte(row,offset)` 必须保未知洞，不能从坐标或军团数重建。字节DEC保留0→FF。
- F18只通过 `readFactionByte(owner,18h)` 消费；`2AD2`独立旧属DEC/新属INC，保同属两次读写、字节回绕和失败前缀。**不使用 `n_generals`**：已核 `tools/parse_sinario.py:parse_scenario` 将原F18减去同属军师（不只所选玩家），不能冒充当前原字段；旧 `raw` 也只是静态来源，不是当前运行态。初始化、玩家军师处理、后续全部写者及正式保存的单一权威仍需接续核验，暂不新增可漂移的平行计数。
- `readPlayerFaction/readDisplayFlags/nextRandomByte` 均为显式输入；不假定98A6关、不自建RNG。缺评分发生在ECE0之后时仍保已经消费的一次RNG。
- 每次写立即交给IO，异常不回滚。永久退场的 `2A5A` 通过 `writeGeneralWord` 单次写FFFF，保G17=4。写入确定值可以建立此前未知的字节；IO须保其它槽/偏移。

### 6.2 有限返回与停点

- 只允许原无消息/显示关路径正常返回。显示开在 **2BB3基本块前**停止（生产`nativeFateDisplayFlags`恒0，该支不可达，纯工程护栏）；2977的31/32在29AE前、29C3的33/34在2A31前、67在2A6A前（以上五支已由本轮§4现刷关闭序列并经泵挂起通道接线，无通道调用方仍历史stop），2A7E的CDE/35/198在2AB2前停止（已接TALK35挂起）。这些是明确的基本块边界，**不是声称已执行消息参数读取或callee**；前面的规则写集已经提交。
- 5101（TALK37）现刷`50FA..511F`关闭：owner==玩家才CDE＋单8810 CX=25h＋第二段8810 CX=199h（AH=G1E、AL=G01），否则静默；前缀（清17/G1D→FF/G1C/2AD2）已提交，关闭后直接返回。3485事件泵与4FCE扫描内层暂保持stop（前者泵延续设计、后者嵌套挂起待另行设计），属本轮后剩余待办。
- 58F1全灭环：22连 inactive 才停，原版该处无返回（死循环），Web stop 恒大声；活局至少玩家活跃故不可达，纯工程边界（与4064外栈同类）。4AD3空名单尾：接触即有守军，实践不可达，保持大声stop。
- 原CS2919/寄存器/栈由这一次调用的显式参数和局部值表示，不提供中途保存或异常重入协议。未来生产适配必须把异常接到既有失败hold/禁存，不能在相同对象上盲目重试（会重复占格/F14/F18写）。
- legacy `ai.js` 的永久退场多清G17、灭亡回归仍通知等偏差**仍未修改**（TALK33多第二段已在本轮修复）；内核拒绝消息返回不等于真实FIFO修复。默认v1、正常App拒v2、原47BB/28F4/25E5/463E停点均保持原状。

### 6.3 验证范围与下一接线条件

`tools/verify_original_legion_fate.mjs` 只用纯内存IO，无fetch、文件/存档读写或子进程。覆盖资本FF优先、L02与同号武将分离、256×256评分/RNG门、0/1次RNG、F14/F18分属、四FF组合/同属顺序、占格/计数回绕、永久G17残值、消息基本块优先、缺字段失败前缀及7028旧bit3。倒数48/0测试仅代表给定初值的连续自身访问；人工JSON内存续测**不是正式savegame或当前槽尾认证**。

后续须先为真实Scenario建立可复核F18来源/写者与显示输入合同（含正式JSON未知值守卫），再将本内核接入唯一native槽及原调用者。之后才能测试当前槽2600/264A尾、其它槽、故障禁存、正式保存冷恢复和完整安全回归。无前置闭合时不放行生产入口；不得把本批纯内存测试挪作完整175入口、浏览器或原版运行态证书。

## 7. 有限 Scenario 接线（P24-FATE-INTEGRATION-1）

### 7.1 唯一字段、来源和保存合同（Web工程，不声称全初始化）

`scenariolegionfate.js` 是上述内核的生产 IO；`ai.js`、`originalroadmovement.js` 直接调用，不设第二调度器。SI必须是 `nativeLegionAt(sc, slot)` 的同一对象；武将由 `generals[slot]` 且 `idx===slot` 定位，不读L02找武将。status写立即重绑live/delayed视图，独立03仍在 `legionSlotCounters`；不创建缺槽、不以dead/leader/raw补规则。

- **F18唯一native权威：势力own `nativeGeneralCount` byte**。由显式运行态输入提供，未提供就是未知；只由严格2AD2（捕获的旧属DEC、§8原属回归的新属INC）写，不从 `n_generals`、raw、活动武将数组或F14推导。`n_generals` 是现有解析器扣同属军师后的旧Web字段，既不读作native F18，也不随着native写者“同步”成第二权威。此合同只认证显式输入之后的有限写者，**没有宣称章加载→玩家军师处理→F18初始化已闭合**。
- **98A6唯一显式输入：Scenario own `nativeFateDisplayFlags` byte**，不是全世界默认0。2BA8先清L00 bit4，才读此字段；缺值/非法值或bit2开均保已清位并抛异常，开域停2BB3，不假定9656/96ED整体no-op。
- 已有具名G1C/G1D/F03沿 `faction/origFaction/capital`，明确null或255编码FF，缺own property仍未知；G00/G17/G1E/G1F沿 `attr/status/talk_idx/battle_rating`。`active/is_monarch/captive_flag`仅是写时UI投影，不作为native读取回退。F14沿 `n_legions`，与F18独立。
- 占格仅使用既有 `context.movement` 和L1A/L1C规范pointer；known0/FF、未知洞及部分写沿既有能力保存，不从坐标或军团重建。
- 正式 `snapshotState→JSON→restoreSnapshotState→prepareScenario` 克隆上述own state；**不增加第二sidecar字段**。可选字段缺失保缺失；present的undefined、null（非指定FF字段）、NaN/Infinity及越界值拒存/拒载。新局清掉模板夹带的运行F18/display输入，随后必须显式提供；不把重开时旧runtime计数当章初值。

### 7.2 实锤调用者与返回尾

复核同§1 KI SHA及VA+200h：`25A3..2708 / 28F4..2919 / 291A..2AF4 / 2BA8..2BD9 / 44D9..4502 / 461D..4698 / 4717..474A / 47BB..487B / 55EC..55F9`。原组合28F4窗口在inline byte2919后线性错位；291A之后只使用从291A重新对齐的解码，不采用组合窗的错位指令。字节散列及重放文本见本批journal收据。新增接缝不是从现有Web测试推定：

| 原调用者 | 实际接线与尾 |
| --- | --- |
| `applyFieldBattleResult/其他既有战果调用者→dispatchLegionFate` | native优先291A，资本FF或RNG失败进入同一29C3；不落legacy fate。旧v1 helper不改。 |
| `4DA4:4DE5` | 4DA7读易主后城主，4DAD/4DB1跨487B保存恢复AL；仅真实CF1按原BP列表逐项291A。每项返回后4DE8..4DEA推进下一项，不按新live视图重建组；任何工程异常不作CF1分派。限定回归及外层4FCE停点见§7.5。 |
| `47BB:4801/4851` | 高费用且命令>=0A，以L01为AL调291A；正常返回走4875..487A的STC。`26AB/26BE`跳26F5，仍读当前pointer并INC占格，不能提前结束整个动作或继续消费点。计数为外层DEC→2977/活动29C3再DEC→26FA INC。任何异常都不补INC。 |
| `28F4:2912` | 异属且target20×8==BX，以该地址低byte为AL调291A，2915 STC；266E返回后2671仍无条件4325，不按CF或新的inactive status提前退出。 |
| `4325 state11:44FE→463E→4651` | 4658减F14，465B再读owner；466C共用抽出的严格4717三池归还（type4跳过、4732先交换清队兵、4735读池、55EC封顶）；466F清L00，467A清同号G17，4682占格DEC；463E返回后4641读取L01，NPC直接RET，玩家分支4641..4650：属主==cs:[CFF]时call 5E80(al=8)仅HUD资金面板刷新、4650直接RET，规则两侧等价，464B停点已删除（P32，originallegionfate.js放行）。总兵、03、F18不在本体重算/清除。 |
| `25E5→2A7E` | 现有16槽泵调用；48→47正常返回，不走活动daily/tail。归零才清L00/G17、按原势力活动门处理；玩家CDE/消息仍停2AB2。 |
| 活动入口后去向/解散返回 | 保同一记录给2600、264A，无第二active检查；日费读取遗留/动作后04与0E，再清03/21。当前返回48可被尾清0；其它非活动返回槽48→47。 |

这些返回只认证无消息、明确display关域；没有以JS返回字符串冒充完整寄存器ABI。267A的2BA8也使用同一显式显示门。裸低层IO/stepTo异常交调用者；真实slot泵取消剩余批次并fail-hold/禁存，dispatcher持有app时同样fail-hold。已经提交的F14/F18/占格/六队/RNG不回滚，禁止失败对象盲目重试。

### 7.3 F18未闭合写者必须被阻断

原有native5030“成功捕获/可保存”**认证撤销**：其外围4FCE仍夹有未闭合外交官/武将归属与消息链，不能先走legacy写者再保存漂移F18。实际 `finalizeFactionExtinction` 现在入口抛明确 `Uncovered ...4FCE`，此前战果/占城/势力首都等调用者前缀保留，但不写 `_extinctionHandled`，不消费同号捕获槽/武将，不发成功消息。独立严格29C3叶已可用，**不等于5030/4FCE正式caller已接通**；旧v1灭亡路径仍保留。

native `processMonthlyGeneralFates(585F)`全停已由[§9](#9-月度俘虏5940585f扫描与301c入队p24-monthly-captive-1)的有界扫描取代；`settleFactionNegotiation(35ED结算入口)`、`tickStrategicWarEvents(1D8E事件入口)`仍显式停在legacy规则写入之前，并hold/禁存，不让一般改属/释放俘虏写者暗中漂移F18。`dispatchGeneralFateEvent`原全停边界仅由§8的严格3485→50D7限定handler取代，不解除上述外围。1D8E整入口是保守工程边界，**不声称其所有事件都改变F18**；没有实现整月或外交生命周期。新字段非“全程序F18已认证”的许可证。

### 7.4 验证边界

新 `verify_native_legion_fate.mjs` 使用synthetic四资产mock、正式prepare、真实field apply/dispatcher/step/16槽泵，覆盖上述正常返回、F14/F18分离、同号武将与L02分离、两类47BB调用者、当槽/另槽、异步无关的失败hold、JSON冷恢复及未知洞。旧arrival/movement测试改为验证更深的明确缺字段/缺池停点，增加prefix断言；formation保留独立合法inactive槽JSON往返，将旧native灭亡伪成功改成4FCE入口失败。原kernel穷举测试仍保留，未删除原oracle以迁就实现。

未覆盖：显示开callee、玩家消息8810/CDE/5E80、完整5030/灭亡/外交/月界、章节F18初始化及所有原始写者、正常App v2、完整战役与浏览器。旧v1 TALK33多19A、永久退场多清G17、灭亡回归通知等独立偏差仍未修。本批focused不等于完整安全套件或原版CPU/运行态证书。

### 7.5 4DA4 caller覆盖修复（P24-FATE-ROAD-RECOVERY-1）

> **当前范围更正（§10.4）：** 以下保留当批历史记录，撤销其中“真实apply已完成占城/迁都再进入4DA4、末城自然生成FF后到4FCE”的返回认证。新核F23写序证明legacy占城前缀不能用于native：该批native在4CF3入口停；当前由§11推进实锤前缀，仍hold/禁存且不认证完整返回。4DA4的BP/CF/捕获方/同号槽/两成员/玩家消息/FF零RNG覆盖均保留，改为显式先决状态的既有leaf测试，不证明4CF3已返回。

**只修测试合同，不改生产规则。** `verify_native_road_callers.mjs`的旧夹具仅设live军团却期望native291A成功，现保留为缺表拒绝：已提交攻方474A/占城前缀保留，守军、F14、RNG不动，dispatcher报错、hold且禁止snapshot。另保留capital缺值的真实487B工程异常：它不经过dispatcher、不被冒充CF失败；裸apply没有外层battle owner，测试不将其未自建hold说成可继续游戏。

原窗静态实锤（同§1 KI SHA；本次重新读取）：

- `4D0D→4DF0`返回的CF由`4D10 PUSHF / 4D1B POPF`跨整个4DA4保留；无首都才`4D1E→4FCE`。`4DAE→487B / 4DB2 JB4DDC / 4DE5→291A`与`4DE8..4DEF`定义组内调用及返回顺序，不能把搜索工程异常当原CF。
- `487B:48B5..48D3→4903/4908`两端异属可直接STC；首都FF另在488B返回STC。前者在本夹具首都非FF且排除君主/同属/中立短路后，291A按295B消费每个活动成员一个RNG；后者2944优先29C3、零RNG。
- `291A..2AF4`单独对齐；2990/29ED状态写会改变Web live/delayed投影，但不改变原BP引用。29C3只减旧属F18，不加接收方；2977写03=48而29C3保03。4DA4自身无活动槽264A尾，不能在这里将48清0。

新增显式synthetic夹具由正式prepare绑定稀疏native槽0/1/5、独立03、known占格byte、F14/F18、G1F、显示关与玩家门；不会从live数组补表、从坐标造占格或把显示关设成产品默认。代表成员以给定edge800两端异属取得CF，覆盖两成员捕获/回归、第二成员在第一次status重绑视图后继续、L02不同于同号武将、规则残值、占格2→0、RNG两次和真实JSON snapshot/restore稀疏槽。它是给定输入的caller合同，不证明该合成几何由完整战役自然产生，也不认证整段4CF3的88CC/显示后继。

玩家为旧属/接收方时，31/32/33/34基本块均保首成员前缀、停住后成员及apply尾、hold/禁存、不伪造FIFO返回。另以末城失陷自然生成首都FF：两个BP成员均先捕获，随后真实apply在外围4FCE停止，未写`_extinctionHandled`、未处理额外武将；不把它称作native5030成功。最新定向成绩与绑定收据见[旧§11收据缺口索引（待恢复）](historical-receipts.md#p24-fate-road-recovery-1)；完整AI/全量及浏览器归因仍待后续。

## 8. 原属回归50D7与限定3485入口（P24-ORIGINAL-RETURN-1）

### 8.1 重新绑定的原始指令（静态实锤）

本批重新读取§1固定KI，SHA仍为`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA+200h。只执行已审`disasm.py`的`data/va_range`；未运行KI、pickle/code_addrs或访问真实存档。原byte、对齐解码及分析依赖/命令收据见[旧§13收据缺口索引（待恢复）](historical-receipts.md#p24-original-return-1)。

| 半开VA窗口 | 原字节SHA256 |
| --- | --- |
| 50D7..5130 | `c64bf989aa9dec13dc3b74e362941ee7b9c703e554b9e5c60651146f039289bc` |
| 2AD2..2AF4 | `cbf296a853d4b98e4ddf1b42651154ae15b8ce5a76a7da7e81d22f29ee521cda` |
| 3485..3496 | `91ec713eb68493f2070ad6f9befdc6f4cb61f855d95e1b067e5dcba296b92815` |
| 35ED..3639 | `6a199b3decfff67a64f3ee74dc181718e373ad0066d92c71931099e22dd57055` |
| 4FCE..5074 | `fe88c9515c52cc464c9e68eedc009603279832d3da826271488ddb9b6bfa9920` |
| 31AE..320C | `40797812fefbffda0160a160f31d73ea7e9bdc53fe1bbc19615b5cb550d4d790` |

50D7函数终止于511F RET；5120..512F是数据，不把线性工具的伪指令计为可达代码。同理31F2之后是dispatch word表，type9项`word[3202]=3485`，不是顺序执行代码。

以下为带字宽/地址的精确规则伪代码，`state8`表示原DS状态字节；仅正常无消息域的寄存器保存也列出。不是通用CPU或未知别名内存的默认实现：

```text
3485(AH:u8):
  AL=0; AX:u16 >>= 3; AX=u16(AX+4240h); DI=AX
  CALL 50D7(DI); RET                         //3492/3495；无G00活动门

50D7(DI:u16):
  PUSH AX,BX,CX                             //50D7..50D9
  AL:u8=FFh
  state8[DI+17h]=0                          //50DC c6451700
  XCHG(AL,state8[DI+1Dh])                   //50E0 86451d，读原属且写FF
  BX:u16=(u16(AL)<<8)>>2                    //50E3..50E9，即原属*40h
  if state8[BX] < 80h: AL=FFh               //50EB..50F0，无FF/18短路
  state8[DI+1Ch]=AL                         //50F2 88451c
  AH:u8=FFh                                //50F5 b4ff，不是旧G1C
  CALL 2AD2(AH,AL)                         //50F7：这里只可能新属INC
  if AL==CS:CFF:
    STOP before5101                        //不假返回；完整消息域未接
    //原序列：PUSH DI；DI=SP；5104 CDE；CX=25h/AL=93h；510C8810
    //POP恢复DI；CX=199h；AH=G1E；AL=G01；5119 CALL8810
  POP CX,BX,AX; RET                        //511C..511F

2AD2(AH:u8 old,AL:u8 new):
  PUSH BX
  if AH!=FFh: state8[AH*40h+18h]=u8(state8[AH*40h+18h]-1)
  if AL!=FFh: state8[AL*40h+18h]=u8(state8[AL*40h+18h]+1)
  POP BX; RET                              //保AX（因而保AL）；不消费RNG
```

- **撤销候选假设中的“50D7先减旧属、同属可净零、FF原属可直接无所属”**。50D7根本不读旧G1C/G00/G17；AH强制FF，故同属也只INC，当前属FF/18/缺失均不消费；原属F00<80时写G1C=FF且两计数门均跳过。2AD2的通用DEC→INC合同仍正确，但不是此caller的实参。无新增RNG。
- 原属**18h**寻址0600h（外交状态别名）、原属**FFh**寻址3FC0h（军团区别名），不是“F00=0”。严格IO仅已建模24势力槽，因此原属>=18h均在50EB消费前抛明确alias异常，**保留50DC与50E0写回，G1C/F18尚未动**。不是证明原码会拒绝这些输入；也不新增RAM权威来猜其值。
- 只有原属0..17h且其own attr byte已知才继续。G1C先写，F18缺失则在2AEF前停，不能回滚所属；玩家byte缺失在计数之后停。正常玩家恢复在5101基本块前停止，前面的身份/所属/F18已经提交；不执行CDE、TALK37或199参数读取/队列，也不盲目重试。
- 这里无军团槽、F14、03、六队、占格或显示98A6写读。G17/G1D/G1C属于**同一DI武将**，与军团L02无关。结果字符串只作Web分类，不伪造CF/AX；AX/BX/CX在原无消息路径恢复入口值，DI、DX、SI不变，最终标志来自50FA比较，不是约定CF成功位。

### 8.2 真调用者、RET消费者与仍停的外围

- `31CB`取事件首word到AX，即AL=type、AH=arg0，31CE另取DX；type9表项转3485。3485无active/旧属/同属检查，不读arg1/arg2；AH0..127直接对应同号武将（**127也没有被caller排除**），AH>=128转向未建模状态，适配器在3490明确拒绝，不补占位武将。
- 3485→50D7正常返回后3495直接RET。31ED覆盖AX=CS、31EF恢复DS，31F1 RET；此局部不消费callee CF做决策。本批**不放行31AE/1D8E的整段事件泵**，不声称外层寄存器/历史栈已整体表达。
- 35ED先按AL=1付款，361D/3622读word G1C比较两种互俘组合才3627→50D7；362A加DI、362D按CX继续127将，原50D7恢复AX/CX，不能丢比较word或扫描计数。3632另有5E80；本批仍在现有35ED入口前停止，不能把已闭合leaf绕过付款、消息与返回后界面。
- 4FCE经玩家1CB1/外交官5074/4236后才500A读G00>=80、500F核亡属、5014核G1D!=FF，然后501A→50D7。**active/FF门属于这个外caller，不可移入leaf或3485。** 501D跳5033加DI、INC CL、CMP127继续；这些指令重置标志，不消费50D7的CF。整4FCE及5030先前伪成功认证仍不恢复。

### 8.3 Web限定接线、保存与回归边界

`originalGeneralReturn50D7/originalGeneralFate3485 → performScenarioGeneralFateEvent → ai.dispatchGeneralFateEvent`只接同一个现有type9 handler。为测试该真实入口而导出handler，原private type9 dispatcher仍调用它；**没有新增事件轮/轮询器/跳过外层门的App路径**。native先走严格分支；legacy的active/general-index/capital近似行为保留，不冒充本证据。原50D7全入口停止被此有限域替代；585F后续有限域见§9，35ED结算、1D8E、4FCE仍停并禁存。

适配器要求own事件arg0整数及`generals[arg0].idx===arg0`，不做Number(null)/字符串转换、不读captive_flag/raw/活动武将扫描。沿既有G17/G1C/G1D命名权威与写时captive_flag投影，F18仍只有own `nativeGeneralCount`；没有新初始化、保存字段或第二sidecar。正常返回可由正式snapshot→真实JSON→restore→prepare保全；缺失own F18仍缺失，已存在非法字段仍拒存/拒载。失败交既有strategicfailure hold/禁存，保所有前缀且重新抛错，不重放、不假事务回滚。

原kernel测试新增精确有序写集、当前属同/异/FF/18/缺失、原属活动/灭亡、0/255回绕、24..255原属别名拒绝、缺字段前缀、玩家5101与3485无active门。Scenario测试直接真实handler，覆盖与L02分离、127号、缺own/错identity、显示字段无关、无意外全场景/军团/F14/03/占格/RNG变化、JSON恢复以及外围入口仍拒绝。它们是**原字节推导的有界回归，不是原CPU动态执行/正常完整战役前史**；未修未知别名、全F18初始化/写者、显示及8810返回或默认v2。新进展不关闭C13整行，更不关闭C01–C15。

## 9. 月度俘虏5940、585F扫描与301C入队（P24-MONTHLY-CAPTIVE-1）

本节为该增量的唯一详细维护源，取代§7/8中585F全入口停止的旧现状；**仅有限native真实`processMonthlyGeneralFates`已接，不是整月/全AI完成**。本节当批未接无属招募5899，后由[§10](#10-招募5899与f23权威边界p24-recruitment-1)有限接通；玩家消息599C已由[§18](#18-玩家登场与俘虏归宿消息接线p33-monthly-fate-1)接线；1D8E事件泵、5358外围/正常App v2、35ED及4FCE仍不放行。未新增章节初始化、F18回算、第二事件缓冲或消息假RET；v1旧近似保留并明确不是原规则证明。

### 9.1 新原窗、字段来源与扫描返回（实锤）

重新绑定KI.EXE SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA+200h。新窗585F..59C5（只认证到59A5的本链）、300E..3060（本链到304D）、2AD2..2AF4、5358..53C6、3485..3496、31AE..320C；31F2后为分发表，不当可达顺序代码。逐窗原bytes/SHA与复核命令位置见journal§14；这是静态原证，不是CPU动态执行证书。

`538B→5695`后`538E E8CE04`调用585F，返回5391先55A6，再5394→2BD9移事件页，不能把本入队推迟到移页后。585F保存AX/BX/CX/SI，固定CX=007F、SI=4240，每名另PUSH/POP CX；5940仅保存DX，其CX被消息号覆盖不影响外扫描次数。588E加SI20h、5892 LOOP重新读下名；无callee CF分支。5898返回后5391同样不消费CF。此调用/返回核证不放开尚未闭合的整5358财政/消息栈。

```text
585F:
  for slot=0..126:                         //5863 B97F00，不取数组length
    if G00<80h: continue                  //586A 803C80 /586D JB
    if G18!=0: G18=u8(G18-1); continue    //586F..5878；1减为0也等下次
    if G1C==FFh: CALL5899; continue       //587A..5883；本实现在5899入口停
    if G1D!=FFh: CALL5940                 //5885..588B
```

G00是own attr，不用UI active；G18=`appear_months`、G19=`join_faction`映射另以**官方SINARIO四章512条**直接按`chapter*56C0h+42C0h+slot*20h+18/19`逐byte核对现有内容源；G19的FF对应显式null，缺键不是FF。解析器同字段映射与原文件偏移一致，但不以解析器/当前行为本身证明规则。未执行解析/导入/编译或改资产。G1C/G1D沿§7权威；同号general的idx必须吻合，无缺将补0或captive_flag读取回退。

### 9.2 5940/5990精确写序与消息边界（实锤）

```text
5940(slot):
  PUSH DX
  r:u8=ECE0()                            //5941 E89C93，恰好一次全byte
  if r>=40h: POP DX; RET                 //5944..5955；不读所属/目标
  if r>=20h:
    AL=G1C                               //594C
    if AL!=G19: POP DX; RET              //594F..5955；绝不落入排队
    G1D=FFh                              //5956 C6441DFF
    G17=0                                //595A C6441700
    AH=FFh; CALL2AD2(AH,AL)              //595E B4FF /5960 E86FD1
    CX=42h; CALL5990                     //5963..5966 TALK66
    POP DX; RET                          //5969跳598E，G1C不改
  BL=(r&0Fh)+8                           //596B..596F，延迟8..23个槽
  AX=u16((SI-4240h)<<3); AL=9            //5971..597C；AH=slot
  DX=FFFFh; CALL301C(AX,DX,BL)           //597E..5981，不额外RNG
  CX=41h; CALL5990                       //5984..5987 TALK65；完全不检查CF
  G1C=18h                               //598A C6441C18，仅5990真正返回后
  POP DX; RET
5990:
  AL=CS:CFF                              //5990 2EA0FF0C
  if AL!=G1C: RET                        //5994..5997 →59A5 C3
  PUSH SI; DI=SP                        //5999..599A
  CALL CDE                              //599C E83FB3：当前首个未闭合指令，停
  AL=93h; CALL8810(CX)                   //599F..59A1
  POP SI; RET                            //59A4..59A5，未冒充此返回
```

2AD2实参AH=FF，仅INC当前匹配方F18（byte255→0），不减旧G1D/不按同属豁免、不用n_generals/raw。G1C=FF与G19=FF相等时两计数门跳过，仍比较玩家；G1C=18h相等则原F18读取为状态0618h别名，当前严格域在2AEF停止，保5956/595A前缀。正常585F的FF所属优先5899，不能把leaf FF结果说成该scan可达。

低门即使队满仍调用5990；非玩家无消息返回后写18。玩家599C消息已由[§18](#18-玩家登场与俘虏归宿消息接线p33-monthly-fate-1)以deferred合同接线：关闭前已排的两word保留、G1C仍旧所属，关闭后才沿598A写18，不提前写18、退回队列或发Web FIFO冒充原消息完成。匹配加入玩家则G1D/G17/F18都已提交再停599C。RNG或后续IO错误同样保前缀，不做重试/回滚；后名不扫描。

### 9.3 301C搜索、两word写与CF（实锤及明确工程域）

```text
301C(AX:u16 firstWord, DX:u16 secondWord, BL:u8 delay):
  PUSH DS,AX,BX,CX,DX
  CX=AX
  BH=0; BX=u16(BX<<2)                   //3023..3027
  BX=u16(BX + CS:D20)                   //3029 2E031E200D
  DS=CS:D56                             //302E
probe:
  CMP byte[DS:BX],0                     //3033 803F00，边界检查之前先读
  if equal:
    word[DS:BX]=CX                      //3038 890F，第一word独立提交
    word[DS:u16(BX+2)]=DX               //303A 895702，第二word
    goto done                           //303D；CMP type0留下CF=0
  BX=u16(BX+4)                          //303F 83C304
  CMP BX,0400h                          //3042 81FB0004
  if unsigned BX<0400h: goto probe     //3046 72EB
  //满队列或步进越界退出，CMP同样CF=0
 done: POP DX,CX,BX,AX,DS; RET          //3048..304D，不恢复FLAGS
```

**301C的普通插入/满队列两种返回CF都为0，不是Boolean成功/失败协议。** 内核返回`inserted`只供Web展示本次已写条目，5940不读它。起点没有`<0400`保护；D20是word，BL清BH后乘4，初加与逐步加均16bit回绕。例如D20=FFE0、BL=8先探0000；D20=03E0、BL=8先探0400，不可伪装为“已满”。底层IO有未知即工程停止，不把异常改成KI正常full。

经批准复用唯一own `scenario.strategicEventSlots`及own `_strategicEventCursor`，后者是**对齐D20/4**的精确槽单位表示，整数0..16383、不钳制。命名桥仅建模D56的0000..03FF且按4B对齐；其它地址/未知槽在实际probe处停止，不添加RAM零区。短dense数组表示已知前缀，尾部未知；hole/undefined不是空。显式null只知道type0，其余byte未知；对象只从own type读byte，非零即占用，不读/修补arg0/1/2。

第一word写建立type/arg0并仅保已有arg1/2，**无需预读未知尾word**；第二word再写arg1/2。任一次写失败保此前独立MOV前缀，不预写整条/整体回滚。type9写成`{type:9,arg0:slot,arg1:255,arg2:255}`；没有第二队列、自动补256槽或新章初始化。原有legacy ensure/查询/随机入队/月移页入口在native显式拒绝，不能补空、迁移旧队列、改/clamp此游标；其它生产/查询/移页算法尚未认证native。

### 9.4 保存、真实入口回归及尚未闭合

native场景（v2 context或唯一native表）的真实`processMonthlyGeneralFates`走同一严格585F→5940→301C适配器；错误由既有hold/禁存所有者处理并重新抛出。原事件consumer3485沿§8；测试可明确调用已写handler，但**不声称31AE/1D8E已经自然调度/返回**。主App继续拒v2，整月/日期/财政与消息栈不放行。

snapshot/restore均验证可选own G18/G19、队列和游标：缺键保持缺键，native sidecar不补`[]/0`；合法短队列/缺字段对象原样JSON保存，hole、undefined、NaN/Infinity、非byte/非整数cursor拒绝。显式null/0/FF各保语义。验证作用于合并后的state；native表配非v2保存身份依旧拒绝，不绕过准入。

回归以本节原码推导：256个RNG×匹配/不匹配、0/FF/18、F18回绕/缺值、127固定扫描与1→0倒数、5899/599C停点（P33起为deferred合同，见§18）、首名提交后次名未知、两MOV分别故障、已占/满队列、word wrap与越界先probe、真正snapshot→JSON→restore→prepare、canonical RNG保存、native无表/有表输入、legacy ensure拒绝；既有50D7/3485与v1回归不删。它们是有界Web单元/调用者证据，不是原CPU执行或完整战役前史。

**本节剩余及后续：** 5899的有限接线见§10；599C之后CDE/8810返回/消息参数已由§18按8810规则闭包接线；全事件泵/月移页与其它生产者、非对齐D20/事件外RAM/18与FF势力别名、F18初始化/所有写者、5358整链、35ED/4FCE及C01–C15仍未闭合。原v1的中区间fallthrough、漏F18、满队列continue等已知近似不因本native增量变成原版规则；本波没有扩大为v1月结重写。

## 10. 招募5899与F23权威边界（P24-RECRUITMENT-1）

本节为5899实现、CFD/F23权威及必要4CF3停点的唯一详细维护源；静态原码实锤与Web工程域分开。**只推进C13的现有585F真实月度入口，不完成5358、C12/C13整行或全AI**。原5924/599C消息已由§18接线；35ED/1D8E/4FCE及默认App-v2门不放行；未新增招募公式、队列或章节初始化。

### 10.1 新原证与caller返回

重新读取固定KI，SHA256仍`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`、VA+200h；保原bin及逐指令byte。关键半开窗口：

| VA | 原字节SHA256 |
| --- | --- |
| 585F..59A6 | `58fb5c93c3a9c0ac076c6d8689bd448b5323565cb865e1753f0bfcb08087a650` |
| 2AD2..2AF4 | `cbf296a853d4b98e4ddf1b42651154ae15b8ce5a76a7da7e81d22f29ee521cda` |
| 5358..53C6 | `442201b9d1c4318beaa15c06fc08e647c6c7fc6158164d2f660da18a4b62cba7` |
| 4CF3..4DA4 | `20b42d9acb402e694336db22f01ace19f6a5fdd4789ab673064d40926ee6c7fc` |
| 1AF8..1B2C | `54c5dd729dc49e0d06e01fd24149efa2c9d55c0e5ae9ab9ad0f4c969806ece2a` |
| 53C6..5456 | `8679095617271c468a25d4c272883f9ac31e407d14c016b52bea1dce6954c2ce` |

另核ECE0..ECFC（包含ECFB RET）、CDE..CE7及4DA4..4DF0；所有工具/源码/原数据hash与执行命令在journal§15的具名证据根。没有执行KI、disasm.py、pickle、site/.pth或读写真实存档。

`538E→585F→5880 CALL5899`：FF所属优先招募，未读取G1D；5899保存DI，SI不改。无消息时58C1/593F RET→5883→588E加SI20h→5891恢复本名之前压的CX→5892 LOOP，callee的AX/BX/CX/FLAGS不用于下一名分派。585F最后恢复SI/CX/BX/AX；5391先55A6后5394→2BD9，未消费5899 CF。**不能把局部RET推成完整5358返回**。

ECE0保存DS/BX，以ECFD索引读ECFE表，AL byte加ECFC，ECFC byte加89h，再ECFD=AL，恢复BX/DS并RET。5899每候选恰一次完整byte RNG，预设分支58A2，无预设分支必须在22槽扫描之后58E0；扫描失败尚不消费。原始near-call文本可打印FFFFECE0，16bit IP实际ECE0。

### 10.2 5899逐读、写序与消息停点（实锤）

```text
PUSH DI
BH=G19                                      //589A 8A7C19
if BH!=FF:
  r=ECE0()                                  //58A2 E83B94
  if r>=40h: POP DI; RET                     //58A5/58A7→58C0
  G19=FF                                    //58A9 C64419FF，先于目标存活读
  BX=u16(BH<<8)>>2                          //58AD..58B1，即旧目标*40h
  if byte[BX]<80h:                          //58B3 803F80
    if G00&20h: G00=0                       //58B8 F60420 /58BD C60400，清整byte
    POP DI; RET                            //不在本轮转一般招募
else:
  DI=0; BX=0; AX=FF16h                      //58C2..58C7
  repeat exactly22:
    if byte[DI]>=80h and AH>=byte[DI+18h]:
      AH=byte[DI+18h]; BX=DI                //58CF比较/58D4再次读取，等值后者覆盖
    DI+=40h; AL--                          //58D9..58DE
  k=(ECE0()&3Fh)+1                         //58E0..58E5，不是均匀24势力
  if k>=30h:
    BX=word CS:CFD                         //5907 2E8B1EFD0C
    AL=(byte[BX+23h]>>2)+1                 //590C..5913，范围1..64
    if AL<=byte[BX+18h]: POP DI; RET       //5915/5918，等号拒绝，无F00活动门
  else:
    if k>=18h: k=1                         //58EB..58EF
    loop:
      if byte[BX]>=80h and --k==0: break   //58F1..58F8，仅活动者减k
      BX+=40h; if BX>=0580h: BX=0         //58FA..5905，22槽环
if BX==word CS:CFD:                        //591A 2E3B1EFD0C，再次word读
  PUSH SI; DI=SP
  STOP before CALL CDE at5924              //5924 E8B7B3
  // 原序列5927 AL=93h;5929 CX=29h(TALK41);592C CALL8810;592F POP SI
BX=u16(BX<<2)                             //5930/5932两次word SHL
G1C=BH                                    //5934 887C1C
AL=BH; AH=FF; CALL2AD2                     //5937..593B，只INC新属F18
POP DI; RET                               //593E/593F
```

不会读取/修改G17、G1D、F14、军团/占格或生成type9。G19清除后遇未知目标、CFD或消息均保FF；5934之后F18缺失则保已写owner，不rollback。玩家消息**早于owner和F18**，与5940匹配加入先写计数再599C不同。5924旧停点不执行设备CDE或8810，不发Web FIFO、不读取头像/对白参数冒充返回（该停点已由§18的deferred接线取代）；TALK29是战斗另一个调用点，这里CX=29h=十进制41。

无预设且没有活动势力时，ring分支原指令永远不能把AL减到0。Web不挂死、不补默认势力/原版RET：已完成22槽扫描及1 RNG后，在环实际连续读取22个非活动F00的58F1位置抛“all-inactive recruitment ring (no original return)”工程边界。没有原规则写，保此前名的写入/RNG；rare CFD分支不受此ring保护提前阻断，仍按原F23/F18门执行。这里只是静态不终止域证明，非原版运行测量。

### 10.3 字段权威、别名与JSON合同

- **G19**沿own `join_faction`；显式null/255都表示FF，写FF规范为null；缺键未知，不读raw。G00沿attr且其清零同步UI active/is_monarch投影，G1C沿faction；F18仅own `nativeGeneralCount`，不alias已扣军师的n_generals。
- **CFD**经本批批准新增可选own `scenario.nativePlayerFactionPointer`，唯一16bit word权威。1B17存BX到CFD，1B1C..1B20另以BX两次SHL后BH写CFF只证明该初始化调用点；不保证任意快照CFD与CFF相等，故不得用player_faction*64补值。591A仅比较时接受任何已知u16，包括不对齐/FFFF；590C实际解引用才要求40h对齐、0..17h势力记录，否则在590C别名停。预设24..254的状态别名在58B3停，G19已清；不建未知RAM零区。
- **F23**沿现有own `faction.n_cities`为stored byte，不增nativeCityCount副本。原文件`chapter*56C0h+80h+faction*40h+23h`，现有parser直接取f[23]；本批独立对官方四章当前内容实际保留的43势力逐byte相等（不是声称所有96槽已导入），另复核512将G18/G19。该值不得由citiesOf长度修复；官方不一致缓存照存。
- 唯一当前JS赋值写者检索定位`updateFactionAfterCityCapture`的legacy live-count重算；native入口及其直接调用都拒绝，详见§10.4。新局保持原导入n_cities、不补缺；CFD与既有F18/display一样从fresh模板清除且不初始化。53C6原月结最终544B写计算后的DH到F23，但整个5358未接，不把legacy月结当认证的原写者。
- 正式snapshot→JSON→restore→prepare保持这些own字段，缺键保缺键；F23只容整数0..255，CFD整数0..65535，undefined/null/NaN/Infinity/字符串拒存拒载。非规范但合法u16可保存，只在实际解引用时拒绝；不加第二sidecar，也不因某分支不消费字段就预读所有规则字段。保存校验不是规则预flight。

### 10.4 必要撤销：native4CF3不再经过legacy占城F23重算

fresh原窗确认：4CF5先XCHG城市owner、4CF8存旧owner到C1A；旧属非18h才4D01→4D63（清官员后消息）→4D0A byte DEC旧F23→4D0D→4DF0→4DA4（用保存CF）→必要4FCE。真正返回后才4D2A byte INC新F23，再8A1E/88CC及显示尾。当前legacy实现却先官员消息、再owner，并将两边n_cities都在4DA4之前重算；它不证明原计数或调用者返回。

经监督批准不在招募片段扩造4DF0/8A1E/88CC返回：该批真实native `applyBattleResult`胜攻在**4CF3入口**停止（现由§11限定前缀取代），保此前两侧战果、攻/守474A及已经发生的去向/城损，但未进入旧owner/governor/F23写者。错误持有app，hold且禁存；另对exported旧重算helper加native拒绝，防绕过。v1仍原路径。此停止是工程缺口，不是KI机制，也不代表C12完成。

撤销§7.5和行军§3.11曾把native capture当已可返回/自然末城迁都的认证。仅导出现有 `retreatCapturedGarrison`（没有第二handler）；保留原BP一次查询、CF才分派、captor跨查询、inactive成员、两成员去向/归队、同号槽与L02、玩家消息31/32/33/34和首都FF零RNG的全部leaf断言。夹具明确提供“已完成原owner/资本/474A前缀”的先决状态，**不再假装从apply一路返回**；真实apply另测4CF3前缀、城市/官员/两侧F23未变、无后继RNG/消息及hold禁存，v1对照保留。

### 10.5 验证范围与下一边界

kernel新增全256预设门、256×1..22活动数的选择/环绕、F18最低/等值/FF、F23×F18全部65536 byte对、CFD/CFF分离、不活动rare、无活动环、实际读/写故障前缀；Scenario走原 `processMonthlyGeneralFates`，测试JSON/缺失/非法字节、canonical RNG保存、消息前缀和后名不执行。既有25+33+20项目保留（失实capture断言按§10.4改为leaf与新边界，不删已证规则）。实测与失败收据只记journal§15。

5924/599C之后消息返回已由§18接线；仍未闭合：CFD全初始化/跨阶段写者、F18全生命周期、非规范别名RAM、原完整事件泵/5358/1D8E/35ED/4FCE。**紧接独立后续**为4CF3→4D63→4DF0→4DA4/4FCE→新F23 INC→8A1E/88CC的精确接续；本guard不是完成证书。不启用正常App v2、不改默认资产、不声称完整战役或全AI完成。

## 11. 4CF3真实占城前缀与首都返回（P24-CAPTURE-1）

本节是P24-CAPTURE-1前缀的详细维护源；地图新增返回与权威唯一维护于§12。**C12整行、完整capture/消息/显示返回仍未完成**。替代§10.4的“当前全停4CF3入口”状态，但不撤销其legacy写序错误和禁止重算F23的结论。真实`applyBattleResult`在双方战果/474A前缀后分流至`captureOriginalCity`，无第二套测试handler、不进入legacy官员/首都/外交projection。失败保已写前缀并hold/禁存，不回滚、不补RET、不继续当槽尾。默认v1和正常App拒v2不变。

### 11.1 原始绑定与调用者（实锤）

KI.EXE SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，文件偏移=VA+200h。可独立从该文件重取以下半开窗口：

| VA窗口 | 原byte SHA256 |
| --- | --- |
| 4CF3..4E5C | `6b1fd2e1ced40620aea2bb13395ab6a93b473d49af618894e0c8457b7d190612` |
| 4502..4548 | `3c8c595ccd487a5bf35e001df8b5df69181b7e9956fdebfb2e9a4ff01ee05e39` |
| 6A3D..6A9B | `b8231f399fe0e73ab2e612c2eb862f2a44193de29a1e8436d55dfff51610ebc8` |
| 8A1E..8AEA | `01d8314f5acb5341e07288b7f16d2e03ab9d749ff2eb2bb2a3bd0974dc1bdd84` |
| 88CC..895D | `36fda64eb97a79c3bd05ca1ead136c08b2dca05a66efc8ccce7a167daa60f38d` |

另复核4ADE..4B63、4C72..4CF3、4ED7..4F8A、518E..51B3、1B9B..1BE0及4FCE..5074、CE7..CF0、8810..8853。完整bin/txt/解释器/Capstone源/DLL绑定和官方四章768城的type/prod/governor逐byte映射，位置见journal§16；不执行原程序、site/.pth或pickle。

- 4C72固定127槽，4C8F把军团BX记录指针按槽序写入BP，4C9D写BP+FE word count；4CF1 CLC返回最强主军，空组4CA9 STC。后续BP不能按active/live重新构造。
- NPC/委任4EEB→5130，5192先攻474A、51A1再守，AH置相应失败位；恢复BX/BP，AL为胜负。玩家战术1BBA/1BC9也先攻后守474A，1BD1/1BD4还有9321/9D0设备调用；4F4C另减攻军占格。此处仅复核返回ABI，不认证那些设备/占格外围已接通。
- 4B23只在攻胜消费守方失败位，4B28传攻方所属→291A后才4B41。无主军4B3A先4FC8清临时军status；玩家无主军还有4EFE→4F71的TALK26前置边界，不能挪到占城尾。
- 4B41读取攻L01给AL，4B44从外栈恢复城市指针到SI，4B46调用4CF3；4B49直接到4B56恢复保存寄存器并RET，**不在此补宣战/双向降关系**。Web native退出在legacy这些写者之前；v1差异未借本片修改。

### 11.2 逐指令前缀与停止点（实锤＋明确工程边界）

```text
BH=AL(new owner)                         //4CF3 8AF8
XCHG C01,BH; C1A=BH(old owner)           //4CF5 867C01 /4CF8 887C1A
PUSH AX
if BH!=18h:
  if C19!=FF:                           //4D63 807C19FF
    XCHG C19,FF                         //4D6F 867C19
    G17[old governor]=0                 //4D7E C6471700
    STOP before4D86 CALL CE7            //后为TALK68, then selector1A6；非纯消息RET
  DEC byte F23[old]                     //4D0A FE4F23，00→FF
  CALL4DF0; PUSHF                       //4D0D /4D10 9C
  if byte BP[FE]!=0: CALL4DA4           //原BP含已退场成员
  POPF                                 //4D1B 9D，恢复首都CF，不用487B的CF
  if CF: STOP before4D1E CALL4FCE       //不执行legacy灭亡/补新F23
POP AX
INC byte F23[new]                       //4D2A FE4723，FF→00
STOP before4D2D CALL8A1E                //当批停点；现由§12推进地图/88CC/display-off
```

旧18（Scenario显式null或24）不读C19、旧F23、旧首都，也不调BP。旧属=新属没有额外早退，DEC/INC抵消；F23即使0也不推断灭亡。4CF5以当时own城市owner为权威，不用战果DTO中的旧owner。C1A沿现有`_strategicLastFaction`，不是新sidecar。官员G17清除前不读旧G17；指针域外在C19已清后停。缺字段只在实际读点停，明确已写owner/governor/F23不回滚。该前缀自身0 RNG；只有原4DA4→291A可消费既有canonical流。

**4DF0**：4DFE仅比较失城索引与F03；不同则4E4B CLC，即使已DEC的F23为0也不检查存城。相同才以旧势力AL调6A3D。无候选4E50先F03=FF，4E54再F00&=7F，4E57 STC。候选成功4E1B交换F03（AL=new、AH=old），4E26→4502，之后4E2B将旧势力指针与**独立CFD word**比较；相等在4E3A→CE7/TALK30/5E60前停，非玩家返回4E4B CLC。CFF不能替代CFD，合法不对齐word作比较不拒绝，但没有初始化假设。

**6A3D**：固定192城市、BL=FF、DX=0、BH=0、DI=FFFF。仅同属者读C16低4bit，`BL < type`跳过；再按unsigned word比较`DX > prod`跳过。两门通过且BH=0，先更新type/prod/DI；随后读取C00&1F，非零不作preferred写；为0则BH=1并再次更新type/prod/DI。BH置1后非preferred不能替换；preferred仍必须同时满足前面两个门，相等后者替换。最后DI=FFFF才STC，返回AX=原城市地址；不是最低idx/按type优先的排序，也不读n_cities。

**4502**：保存BX/CX/DX/SI；BL=旧势力、AL=new城、AH=old城；CX=new*8、DX=old*8。固定127槽先读L01，匹配才读L00>=80，再读L20是否old。命中先写L20=new，随后比较独立word L14与new*8；只有相等才写L14=old*8，**且只有该分支OR status2**。与legacy统一OR2/清导航不同，不写03/0B/1E/0A/0C/0E/占格/兵数，也不把14由20重建。当前命名桥只接受既有targetNode城市id0..191；其它word/别名保已写L20并在4531工程停止，不宣称全word地址域已建模。此合法域索引乘8无16bit溢出；测试word生产力FFFF/越界拒绝、CFD FFFF与byte计数双向回绕，不虚构可达的索引word wrap。

### 11.3 当批地图停点（当前地图续段由§12取代，消息仍停）

- 8A1E按`u16((C0A-2)*24+D44)`建ES，从`ES:C08+300h`读地图tile；8A42 byte减CB、DIV3/MUL3再加CB，按中立/玩家/其它归属加2/0/1，**8A63写回地图**。8A74读C16低4bit决定四个角块偏移，8AD1只处理DE..F1内的tile并以玩家flag在8AE6写回。它不是纯绘制；当批没有获准的可写terrain权威；本限制现由§12显式Scenario能力推进，DOS段别名仍不建模，不能拿占格plane代替。
- 88CC固定四C1C邻接，FF则跳过；非FF才在88FD将DL左移，**不是无条件每方向移一位**。890A扫描对方四邻接找回本城；没有反向匹配在891E只返回该callee，外层88FD仍左移DL并继续下一邻接，**不是88CC提前返回**。异属按对应bit是否已置逐byte INC双方C1B并OR双方C00；同属按bit是否已置DEC/AND。值回绕和先对方后本方的写序不可替换为全图重算。它依赖8A1E真实返回；当批不越过前停点，当前§12已按这一顺序接线。
- 4D33测试98A6 mask04h，清则4D62 RET；置位经5CA4/9656/5CE0/95C9/5C58切DS并绘图。该后继、CE7→EB11端口/等待、8810→895D/01B4/075B/01DB/222B及其98A5=8写、迁都5E60都不是已认证无副作用调用。
- 4FCE在4FD5写CS2919捕获方，4FD9清F00，4FDC比较CFD，玩家4FE5→1CB1可能非局部退出；非玩家4FE8 DEC D2A后5074/4236/固定127扫描/必经TALK36。4D1E停点现由去向§19推进为非玩家扫描（各消息点保前缀停，TALK36后F19续段待接）；CS2919/D2A仍无新增存储字节（captor透传＋活计数投影，见§19.3）；不从dead/active镜像补它们。

### 11.4 工程与测试合同

- `originalcitycapture.js`只由真实apply native分支调用；既有`retreatCapturedGarrison`承接同一原BP引用，不复制成另一个去向实现。4DF0 CF保在局部值，BP中的inactive记录和重绑live视图不改变遍历；先退出当前callee错误则不执行新F23/显示或legacy外交。无自动恢复续段；失败始终hold/禁存。
- 沿现有字段：n_cities=唯一stored F23，nativeGeneralCount=唯一F18，CFD独立own word，C1A已有运行字段，type为已导入C16低4bit、prod为C0E word、attr为C00、governor为C19。原官方768城的三字段重新核符。缺键不初始化；新snapshot/restore严格拒绝这些已消费city字段的非法/非有限own值，真实JSON保缺键、合法word和中立null；失败现场不允许snapshot。
- 真实caller回归覆盖官员/中立、全部256 F23 DEC/INC及同属、非首都不扫描、首都无候选CF跨原BP、返回/捕获同号身份与03/占格/RNG、迁都127槽及反向14/条件OR2、CFD/CFF分离、未知字段/晚写失败前缀与owned battleflow不执行endBattle、JSON拒绝和v1未变。保留全部既有4DA4 leaf断言；只把已被原证推进的4CF3入口oracle改成各首停点。
- 静态源闭合＋Web focused不是CPU/整战役证书；本批完整回归、独立review与主动LSP另交父门。具体结果、失败及源码hash只在journal与证据收据记录。

## 12. C12地图续段与单一terrain权威（P24-CAPTURE-MAP-1）

### 12.1 实施前合同与来源

本节维护8A1E/88CC/4D33限定续段；不是完整C12/全AI或默认v2许可。经本批监督批准新增可选Scenario独占`terrainMemory`，仅显式known spans与正式JSON恢复；不从现有占格、PNG、raw城市或资源底图补未知值。初始terrain字节仅作精确身份；实例不共享可变数组。资源初始图与规则运行图不可互写。

原KI SHA同§11、VA+200h。新核0140令D44=D46；87CC..87FE令9872=D46+1800h，故占格与terrain不是同一平面。00D2..00DE以D44/offset0调E364，正常原解码证书见[消息ABI§11](re-notes-strategic-message-abi.md#11-p13原mmap解码eof与资源释放真正返回)。89F0..8A1D固定192城调8A1E，再固定127军团调8AEA；本批不把资源底图当作已执行这一初始化的当前图。

新能力须绑定exact world/content及完整初始terrain字节身份；缺能力保持缺失，洞保持未知，已知00/FF可保存。native2708读取与capture写入使用同一实例；战斗分类只能注入该reader或在未闭合入口停止，不能偷用default-world。v1仍原兼容门面，静态PNG仍只作显示缓存。跨场景、restore/prepare异步所有权必须独立。

8A1E完整返回后才88CC，随后4D33消费既有`nativeFateDisplayFlags`的mask04h：清则4D62返回；置位在4D41前停，缺失在4D33停。官员4D86、迁都4E3A与条件4D1E→4FCE不因地图闭合而放行。任何失败保真实MOV/INC/DEC前缀并hold/禁存，不回滚或补尾。

### 12.2 8A1E逐读写与规范地址域（实锤＋Web有界映射）

原源窗口8A1E..8AEA与88CC..895D hash见§11，新轮重新从固定KI读取；另取89F0..8A1E、87AF..87FF、00D2..00DF、00DF..0155、19CA..1A6E、E364..E378、F5E7..F6DC、8CAE..8D4D与4B63..4C72，完整bin/txt/hash/提取环境收据见journal§17。初探F5E7..F6DA窗未包含完整EOF尾，最终窗已包括F6D9 `B4FF`及F6DB `C3`，不把截断窗当完整返回证据。

```text
8A1F: Y=u16(C0A); ES=u16(D44 + u16((Y-2)*24))
8A38: BX=u16(C08+0300h)
8A3F: AL=terrain[ES:BX]
8A42..8A4C: AL=u8(floor(u8(AL-CBh)/3)*3+CBh)
8A4E: AH=C01
8A51..8A61: AL=u8(AL+(AH==18h ? 2 : AH==CFF ? 0 : 1))
8A63: terrain[ES:BX]=AL                  //中心先提交
8A68/8A6B: 重新读C01/CFF；AH=(相等 ? 10 : 0)
8A74: AL=C16&0Fh
  type0: BX依次word加[-302h,+4,+600h,-4]
  type3: BX依次word加[-180h,+17Fh,+2,+17Fh]
  其它:  BX依次word加[-181h,+2,+300h,-2]
每个角块CALL8AD1:
  AL=terrain[ES:BX]                      //未知立即停，保此前中心/角块
  if AL<DEh or AL>=F2h: RET              //不写，00/FF是真实已知byte
  AL=DEh+((AL-DEh)%10)+AH
  8AE6: terrain[ES:BX]=AL
8ACF POP CX;8AD0 RET                     //不消费RNG
```

Web规范映射是D44相对线性byte地址0..98303；**不是DOS segment模拟器**。本片Yword只认证2..255，其它Y在首次8A3F停；原段基址回绕/跨分配块别名未知。BX每步独立u16回绕后，用`(Y-2)*384+BX`访问，而非按视觉矩形clamp或把负X当0；线性范围外按实际访问失败。正常中心地址等Y*384+X，但不能用该等式替换所有word回绕。独立输入X=FFFF、Y=10覆盖BX下溢访问68605等真实规范地址，缺byte仍不填。C16沿既有type低4bit字段，C01 null显式18；cap不初始化这些city字段。真实军团captor18在更早474A→700F已属未建模势力域，本轮不冒称从真实apply覆盖了8A56中立绘色或完成89F0初始化。

### 12.3 88CC双边写序与局部RET（实锤）

入口保存AX/BX/CX/DX/DI；AH=本城索引、AL=入口C01、DL=1，固定四次读取C1C..C1F。每个FF直接88FF，**不左移DL**；其它值按`idx*20h`查对方记录。890A将DH=1，从对方四C1C逐项找AH，每不匹配左移DH。四项都不匹配：891E RET仅返回88FA调用者；88FD仍左移DL，再读下一项。入口AL不因后续owner变化重读。

- 异属：8925 test对方attr&DH；清时先892B INC对方C1B，再892F OR对方attr。随后8933 test本城attr&DL，清时8937 INC本城C1B，再893A OR本城attr。
- 同属：893D test对方attr&DH；置位时8943 DEC对方C1B，再8949 AND清bit；然后894F test本城，置位时8953 DEC、8958 AND。NOT DH/DL仅临时取反，返回前恢复，不改变下一邻接使用的bit。
- 各INC/DEC按byte回绕，attr保其它bit；标志已正确时不读取C1B。不能重算邻城数或先改完两边count再统一attr，四个独立写点故障都保先前写。C1C缺键/洞、邻居192..254别名、对方反向项未知在实际读点停，不当FF或“没有反向边”。允许给定不对称/重复/自邻的原字节，既有格式保存只校验四byte，不按几何修复。

### 12.4 单一规则图、保存、消费者与caller返回

`prepareScenario`显式可选`terrainMemory:{version:1,spans:[{address,hex}]}`；创建私有bytes/known数组，空洞未知，无自动资源复制。restore要求exact world id/revision、content packId/chapterId/revision和完整小写hex `initialTerrain`相等；该身份来自既有world resource的98304字节，不是版本号替代数据。保存为唯一`webMeta.terrainMemory`，无Scenario同名state或第二平面；无cap不产生sidecar，v1或无assembly携带该sidecar明确拒绝。known00/FF及部分写逐byteJSON保存；非法/重叠/越界spans拒绝。源input在await前克隆，cap不共享数组，两个Scenario与旧owner各自独立。资源`loadTerrain()`只给副本，`terrainIdentity()`给不可变字符串，不暴露资源可写数组。

当前固定MMAP原文件独立decode为98304B，SHA `740708c27a89db0a7f82865be623b5732099ec97aabf399e7dbde1450c87c861`，与Web `mmap_map.bin`和content布局逐byte一致。`import_builtin_content.py`导入现有decoded布局，`content_pipeline.py:421`按行flatten；这是底图来源证据，**不是当前章节已执行89F0的规则图初值**。原8CFF只写header/label、D52状态和D56事件，没有保存D44；原加载89F0另逐城绘色。Web按已批准完整状态政策保存本cap，不将原重建当缺字节可补的许可。

| 当前消费者/写者 | 唯一读取与限定域 |
| --- | --- |
| native2708 candidate | `context.readTerrainByte→terrainMemory.readTile`，缺cap/洞抛错；外层真实槽保先前occupancyDEC、hold/禁存，不用静态asset填洞 |
| capture4D2D→8A1E | 同context.terrain按规范线性地址写；地图真返回后才88CC与4D33 |
| 城市AI/4300 | 仍读own attr/strategicBorderCount/strategicNeighbours及独立C18 cache；新88CC写的是同一city字段，无边界副本 |
| `siegeApproachCity/currentEngagement/stepRoadGraph` | v1路径；`stepTo`与`performLegionSlotAction`的native分流先返回严格动作，native不进入这组default-world读取 |
| fieldterrain/battleflow | [§13](#native-field-terrain)已接真实2873的first-D分类、规范4C41别名及4C72原BP选择；后继[§13.6](#native-field-dispatch)接4E5C/5130野战正常返回，玩家消息停4E82/4EA1、空名单止4AD3，未知别名仍止4C41；较晚startFieldBattle仍拒native，v1保旧分类，无两个mutable terrain权威 |
| pathfinder gateDirs/findPath/roadOffset、地图PNG | 旧v1格网/只读显示资源；不作为native规则当前图。静态PNG颜色仍属显示差异，本波不重构渲染 |

4D30返回后才4D33读取既有own `nativeFateDisplayFlags`，mask04清按4D62 RET；开在4D41 CALL5CA4前停，缺失在4D33停。原4B49无条件跳4B56，依次POP DI、移除100h栈帧、POP BP/SI/DX/CX/BX/AX/ES，再于4B62 RET；4ADE PUSH ES与4B61 POP ES对应，不是恢复DS，无legacy宣战/关系减记。真实`applyBattleResult`原native return阻止进入legacy尾；实际owned battle callback只有apply正常返回才endBattle/尝试原owned deferred tail/legend/draw，故障不执行后继。回归锁定原BP（含inactive）先处理、map/border后置、RNG不额外消费；另覆盖apply返回后下一真实到期槽的daily/03/游标与JSON。**该下一槽测试不是自然count1→4ADE返回的完整前史**；本地图批次native wait(count1)停于2873/28BF；后继[§13](#native-field-terrain)先推进至4A9E/class9别名停点，§13.5再接规范alias/原BP选择；后继[§13.6](#native-field-dispatch)推进野战无消息quick及同栈日结/余槽；攻城后来按[§15](#native-siege-integration)接真实28BF限定返回，空名单4AD3及完整消息/战术、全战役仍未放行。

### 12.5 新撤销：4B63地形分类的pointer/AL调用合同未闭合

新原窗证明既有`fieldterrain.js`的“按XY五点即可完整认证”不成立：4B7D/4B80读取守军独立L1C/L1A，再减9872加D44取terrain，不按当前XY修复pointer。4B71先可取玩家攻方marker，4B79又独立可用玩家守方marker覆盖；二者非玩家时保入口AL，不能无证从攻方marker补。class9的4C33 `LDS BX,[SI+1A]`回到**攻军占格far pointer**，4C36 `CMP byte[BX],CAh`不是读terrain XY。未把该新发现直接改成另一个分类公式。

本批native `startFieldBattle`入口拒绝保留：它是选主军/消息之后的旧Web入口，不持有原首次DI与入口AL，不能重开分类。后继[§13](#native-field-terrain)闭合candidate-Y的AL、首次DI及DS别名，沿真实2873接有限前缀并精确停止；取代本节“整个native4B63仍入口全停”的旧状态。特别更正：4C33之后DS不是D52，4C41的`[SI+1]`不能标作attacker.faction。v1旧XY/marker/class9近似不获认证。

### 12.6 验证和剩余范围

新回归覆盖中心256byte×两玩家关系×四type布局、角块全部256byte、各未知读前缀、BX回绕、FF不shift、reverse缺失后继续、双边count/attr四写故障与00/FF溢出、cap/identity/真实JSON/隔离/异步输入、native2708单一图、owned battle正常与display-on停、原BP及下一槽。A修复另把absent C1A的delete→JSON→3F11与非法ownundefined/-1/string快照TypeError分开，legal00/FF保3FAB/3F29消费断言，生产校验未放松。变更后的完整安全回归、独立review与父主动诊断仍各自必需，成绩仅见journal§17。

仍未知/未接：89F0章节初始化与其它terrain写者的全生命周期、DOS段回绕/域外别名、field4C72以后的完整调用/返回、4D86/4E3A/4D41消息显示、条件4FCE及CS2919/D2A、自然接战count1返回与完整同槽尾、C01–C15。默认v1、正常App拒v2、真实存档安全边界保持；不称完整capture/campaign或全AI完成。

<a id="native-field-terrain"></a>

## 13. 4B63真实首次DI与有限2873前缀

当前增量为P24-FIELD-DISPATCH-1，详见[§13.6](#native-field-dispatch)：真实2873选择后已接4E5C/5130模式1及有限正常slot返回；未委任玩家停4E82/4EA1，空名单停4AD3，未知/域外仍按消费点停。§13.1–13.5保留前批原证与历史首停范围，不是完整消息/战术/全AI完成。

### 13.1 原始证据与调用现场（实锤）

固定`KI.EXE` SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA+200h。重新对齐读取2708..28F4、4A7B..4B63、4B63..4C72、4C72..4CF3、4E5C..4ED7、ECE0..ECFE及97F0..985A；另读9A33、CAEB、CB9B消费者窗口。每窗bin/txt/hash、解释器/Capstone源码与DLL前后hash及命令双流在journal§18所指新证据根。不是复用前批文本作新执行，也没有运行原EXE。near CALL4C1F的目标按16位IP回绕为ECE0。

- 2708读取候选Xword到DI，270B读候选Ybyte/flagsbyte到AX；2732令DX=X，2734清AH，故2736进入2831时`AX=Ybyte`。2831仅保存BX/CX/DI，不保存AX/DX；count1路径2853只改CL，285B置攻方bit5，285E/2864比较，不改AX。**2873→4A7B→4B63入口AL是本次候选Y，不是攻方marker或守方当前坐标补值。** 03>1的286C才改AL=3并调音效，不是count1路径。
- 2831从2240扫127槽，status≥80、Yword相等、Xword相等即首匹配DI；首匹配同属直接STC，不继续找敌军。异属count1才2873。4B63使用这个**首次匹配DI**的saved pointer，尚未选最强主守军；4A9E之后4C72才按CH所属/AX-Y/DX-X重新收集BP名单并评分。二者可为不同槽，不能用后者替代前者分类。
- 4A7B保存AX/BX/CX/DX/SI/BP，分配100h的SS帧并令BP=SP。该帧供4C72写127个word及BP+FE计数；本片不虚构SS/BP数值或预填帧。4A87先写D32word=0，再4A8E调用4B63。成功返回才4A91写D35=CH，4A96写D34=CL，4A9B重新读首次DI+1到CH，再4A9E调4C72。
- 4B63保存DS/AX/BX/DX，返回时按DX/BX/AX/DS恢复，CX是输出；SI/DI未改。因而4C72仍消费原AX=候选Y、DX=候选X，不是classifier修改的AL。4C72普通扫描后的选择/CF、4AA3改DI及4AA5..4AAF清两军bit5/03现按§13.5接入；4AB3战斗及4AD3尾仍不在执行域。

### 13.2 五次读取、分支与返回CX（实锤）

4B67读CFF到AH；先4B6C比较攻方L01，相等才4B71取攻方L08到AL；**再独立**4B74比较首次DI的L01，相等才4B79覆盖AL。两方都是玩家时守方覆盖优先；都不是玩家保入口AL。虽然真实2831异属分支排除双方同时同玩家，叶函数仍忠实保这条优先序。

4B7D先读守方L1Cword，4B80再读L1Aword。DX按word减9872、加D44、减18h再成为DS。规范cap域令`base=(occupancyRowParagraph-24)*16`，BX仍为saved offset，五次byte地址严格依次：

```text
4B92 base+u16(BX+017F) -> CL  西
4B9B base+u16(BX+0181) -> CH  东
4BA4 base+BX           -> DH  北
4BAB base+u16(BX+0300) -> DL  南
4BB4 base+u16(BX+0180) -> BL  中心（至此才覆盖原BX低byte）
```

全部五读及4C4C分类都早于中心判断；center直接命中也不能跳过四邻未知读。`BX=FFFF`的有效offset序列为017E、0180、FFFF、02FF、017F，不能做几何clamp/按XY重建。规范row要求原saved row为24..6120且24整倍数；word偏移独立回绕，线性结果必须落本cap已知byte。原DOS基段回绕/跨分配块不因此获认证。

4C4C保存DS/CX/SI，将DS=CS，固定14次扫描CS:982F的`[class,low,high]`闭区间。无命中时4C6A读**紧随14条后的CS:9859=00**，不是臆造default。21条3byte有序对在97F0..982E，三列是`[directory-C0,firstClass,secondClass]`，不是layout。整块97F0..9859的106原byte SHA256为`db672540c3be0d743d8a9658b518a3128b04cc35f488d39a28de63e9cc800222`，`raw-supplement/tables.bin/tables.json`保存原值及切分；测试穷尽256 tile与100类配对。

- center1..7：CL=u8(center+CE)，CH=0。
- center0：4BDD按保存AL选择：0→南/北、1→北/南、3→东/西；**所有其它AL≥2（包括4..255）→西/东**。4BFF每行先正向CMP，再交换AX高低byte并XOR DH40尝试反向；反向也不匹配时再交换回原序并清DH后推进下一条。相等类正向优先，21条均无命中为CL=C6/CH=0。
- center8：4C1F恰好调用ECE0一次，CL=D1+(AL&3)、CH=0；ECE0保DS/BX，ECF1更新addend再ECF6更新index。后继失败不能撤回或重复该RNG消费。
- center9：4C2C令DS=D52，清CH；4C33 `LDS BX,[SI+1A]`读攻方saved offset与segment，**然后DS已是攻方占格segment**。4C36读此DS:BX，等CA才CH=40；4C3D重读CS:CFF到AL；4C41比较`DS:u16(SI+1)`，不相等才XOR CH40；CL=D5。这是独立占格段内别名，非terrain、非攻方L01。SI仍为攻方记录偏移`2240+slot*40`；例如slot2时别名offset=22C1，canonical线性候选为row*16+22C1，普通cap的offset域仍仅0..383；§13.5获批只读同平面alias域后，此线性候选在已知/界内时可读，域外/段回绕不获认证。

CH只返回0/40，CL是目录C0..D5。不能从CX推断主军身份、攻守玩家或layout；bit7由后续4E8F另OR80。4E5C先检查攻方玩家及委任，再守方；玩家战术有4EB9/8810→1B5A和4EAF额外占格DEC。该链未在本片用旧Web消息回调替代。

### 13.3 消费者与接线范围（P24-FIELD-TERRAIN-1历史，当前见§13.6）

4A91/4A96之后D34在9A5E..9A6F按<C0、<D1分mode0/1/2；CAEB→CB07以D34乘2读BATTLE.MAP目录，CB1D恢复目录号，CB1F..CB41形成`200h+directory*1000h`地图块偏移，不是layout寻址。9A33取D35低四bit到D316，本片CH不产生低四bit；CB9B反转内部线性区0040..0FBF并调CBBC换方向tile。D35 bit6不是Canvas整体镜像/人物身份。这里只闭合相关输入消费，不新增战术生命周期、地图Session或D35 bit7默认值。

**经批准的Web工程停止诊断，非原版持久存储机制**：`originalfieldterrain.js`提供纯IO kernel及唯一Scenario适配；`originalroadmovement.js`在真实field count1→2873调用，使用首次DI对象、候选X/Y、同一context.terrain/context.movement与canonical RNG。每次创建空稀疏prefix，仅实际执行4A87/4A91/4A96才分别出现d32/d35/d34。该对象不是Scenario字段、sidecar、CS全局或可恢复Session；本调用永不正常返回，catch把同一对象附在**原Error**的`nativeFieldPrefix`，AX/DX等已取得现场见`nativeFieldCall`，不另读未知字段仅为诊断。能力错误保原类型/消息，只补实际instruction；不回滚前缀或RNG。原slot错误所有者保存同一个Error并hold/禁存。

**历史首停，已由§13.5限定替代**：前批正常分类只推进至4A9E CALL4C72之前；class9先读4C36，再读CFF，停4C41别名。当前新增只读同平面alias与选择局部返回，不扩普通movementMemory row/offset读写域。缺字段/terrain hole/段域/RNG按各自首次消费指令更早停。4A9B晚失败保D32/D35/D34；class8分类后失败保已消费一次RNG。prefix从不序列化、从不resume/replay，未来正常接线必须另行批准真正跨调用权威，不能沿错误对象续跑。

旧`startFieldBattle`仍拒native：当前旧`resolveFieldBattle`先选定D、清标记、消息后才调用它，并非原4A8E现场；在那里按选后D重算即使公式正确也会错序。故本批是**真实2873前缀接线，不是完成野战启动**。4ADE仍停28BF；4C72现仅按§13.5局部返回，4E5C返回、消息、战果、4AD3/2876/26F5占格INC及2600/264A同槽余尾仍一律不伪造RET。v1分类函数仅修正认证注释，不改运行行为；默认v1与正常App拒v2不变。

### 13.4 有界验证与下一缺口（P24-FIELD-TERRAIN-1历史）

`verify_native_field_terrain.mjs`核所有256tile/AL、21表正反/无命中、五点顺序与u16偏移、每读/每global写故障、class8单RNG、class9独立alias输入与真实cap拒绝。alias callback的纯IO控制是显式内存输入，不是生产alias域扩展或原CPU执行证书。`verify_native_road_movement.mjs`通过真实slot泵核首次弱DI≠后续强D、saved pointer≠XY、candidateAL、D32/D35/D34、hold/nonsave、RNG、无消息/无提前03清理/无余槽/日结/占格INC，以及正式snapshot→JSON→restore→prepare的独立cap。`verify_native_capture_map.mjs`核8A1E后同一rules cap及JSON冷恢复，静态BA资源不能替代已绘CB/E8。成绩/失败/冻结hash只记journal§18。

本历史批次所列4C41/4C72缺口，现按§13.5仅闭合规范别名、相对BP和stored评分/局部返回。仍需完整G1F初始化/刷新调用者、任意DOS别名/外栈、4E5C消息/战術返回及额外DEC、4AD3→2876→26F5→日结/03/余槽。既有Kernel测试不证明正常App/native完整战斗、全C10/C11或全AI完成。

### 13.5 规范4C41别名、4C72原BP与主军选择（P24-FIELD-SELECTION-1历史边界）

**实锤原证**：本批独立重读同SHA的KI，文件偏移VA+200h；新窗口2708..28F4、4A7B..4B63、4B63..4CF3、55A6..55EC、6FD2..7028、8AEA..8B32与97F0..985A。原byte、对齐反汇编、逐窗hash、Capstone源码/DLL/解释器前后绑定及双流在journal§19新证据根；前批封存不覆写。表106B重新读取，SHA仍为`db672540c3be0d743d8a9658b518a3128b04cc35f488d39a28de63e9cc800222`。静态原证golden不是新增CPU执行差分。

**4C41原址与批准的Web工程域**：4C33的LDS把DS换为攻军占格行段；SI保持`2240h+slot*40h`，故4C41读`DS:u16(SI+1)`。8AEA..8B0E先以Yword经三次SHL、再SHL加中间值得24Y，加9872形成segment；Xword写L1A、segment写L1C并INC ES:BX。规范占格cap本已表达9872相对行段；新`readAliasByte(row,offset)`仅校验row为0..6120且24倍数、offset为u16，读取同一98304B bytes/known中的`row*16+offset`，结果必须界内。普通readByte/writeByte的offset<384域不变。无第二存储、无DOS基段值、无XY/L01/terrain/军团数回填、未知洞不补零。已知0/FF有效；后部行加SI+1越界、非法row/word、未知byte均在实际4C41保前缀失败，不把相对规范域扩称任意段回绕/跨分配块。例slot2,row240：offset22C1，线性12737，与规范row792:65同一byte。仅读取不写占格、不消费RNG。

**4C72扫描与BP写序**：入口AX=候选Y零扩展、DX=候选X、CH=4A9B重新读取的first-D所属。BX=2240、CL=127；保存SI/BP，SI=0。逐槽0..126，严格4C7B status≥80→4C80 Yword==AX→4C85 Xword==DX→4C8A owner==CH，前门失败不读后字段；缺fixed-slot不等于空。每匹配4C8F立即写word[SS:BP]=军团指针，再INC SI并BP+=2。完整扫描结束才4C9D将计数word写原BP+FE；127条占00..FC，不覆盖FE。不读L02/dead/active或六队，不重建live数组；名单保原槽序与实际固定对象。扫描途中失败保部分指针，FE仍未知；评分失败则保完整名单/计数。

**4C72评分逐指令**：count低byte=0时4CA9 STC返回`BX=4200,CX=owner<<8`。非零时保存AX/DX/SI/DI/BP，CH=count、CL=4、DI=0、SI=BP[0]。各指针评分为：

```text
AX = L04word >> 4                         // 4CBE/4CC1
AH = L06byte >> 4                         // 4CC3/4CC6，覆盖旧AH
AX = AL * AH                             // 4CC8 byte MUL，只取移位AX的低AL
BX = (legionPointer - 2240h) >> 1
DX = (byte[425Fh + BX] >> 4) + 1          // 4CD0..4CD8，同号G1F，不是L02
AX = low16(AX * DX)                       // 4CD9 word MUL
if unsigned(AX) > DI: DI = AX; SI = BP[i] // 4CDB..4CE1，严格大于
```

所以不是旧直觉`(L04>>4)*(L06>>4)*(G1F>>4+1)`全word乘法：L04=4096先得0100h，AH替换后AL=0，因此得分0；L04=65535的移位0FFFh只保AL=FF。输入全合法时最大255*15*16=61200，word MUL形式保留但不会溢出16位，不能造不可达溢出golden。全零分时SI在4CB8已是首名单，不返回未初始化0；相等分保最早匹配槽。循环结束BX=SI，依次恢复BP/DI/SI/DX/AX，CH减至0、CL仍4，4CF1 CLC，因此非空返回`BX=selectedPointer,CX=4,CF=0`。零/非零均不改原AX/DX/SI/DI/BP；CX不是名单长度或评分。

**存储表示与未知生命周期**：6FE9/6FEC从六个L29byte累加AX，6FF6直接存L04word，当前native `troops`即内部总兵word，不再/10或从units重算；units人员表示只在已有6FD2入口换算。G1F沿现有own `general.battle_rating`，同号slot消费，不读generalIdx/L02、attr/G00或能力。55A6固定0..126，G00≥80才对G0E..10高nibble之和及G11/G12各byte SHL1按byte加法累计AH并写G1F，非活动/127不写。此窗证明写法，不证明完整初入/月界/战术返回调用者已接通；本片仅显式own存储值，缺/非法立即4CD0失败，不凭公式刷新/补默认。

**获批局部权威与后继**：沿现真实2873扩展原`nativeFieldPrefix`，4C72开始才建立`bpWords={}`，键为相对word偏移，仅4C8F/4C9D写入，不预填栈/绝对SS或BP。selector真实返回后才在`nativeFieldCall.selection`保BX/CX/CF；原AX/DX不变，`firstDefender`保实际首DI对象引用而不为诊断另读字段。CF1在4AD3之前停止，不释放帧/返回同槽。CF0在4AA3把返回pointer绑定同一fixed record并记录call.di，随后严格4AA5 A.status&DF→4AA8 A03=0→4AAC selectedD.status&DF→4AAF selectedD03=0，**然后4AB3之前停止**。03经既有唯一slot计数字节绑定，不增第二count；原first-D若未选中，其status/03不因选择被清。每次AND读/写及03写晚失败保之前结果，同一Error类型/对象并补实际instruction，catch持同一BP/globals前缀，不回滚、重播或续跑。

这是经批准的**永不正常返回调用的错误持有证据**，不是持久CS/SS、Scenario state、sidecar、可resume Session或公开正常战斗API。真实slot仍由既有owner保该Error并hold/禁存；本片不执行4E5C/消息/战术/4AD3 RET/2876/26F5 INC/日结/03尾/余槽。late startFieldBattle继续拒native，siege28BF、正常App拒v2、默认v1保持。未来正常返回必须重新批准跨调用生命周期，不能沿Error当session接线。

**证据测试**：`verify_native_field_selection.mjs`逐门/缺槽、127word+FE、零候选/全零分/strict ties、AL截断/最大61200、同slot G1F≠L02/units/能力、partial BP/每个晚字段失败、四写及两次AND读故障保原Error与剩余状态；同cap别名/洞/0/FF/端点/u16/显式rawmapping、JSON隔离和身份。原field-terrain测试保早期故障golden，用显式4A9E故障注入保原global写断言；真实movement测试将原missingG1F门推进至4CD0，保原状态断言，给足G1F的首DI≠最强DI/冷恢复/class8则到4AB3并锁四写。capture-map共享terrain/冷恢复测试无候选到4AD3且不补尾。成绩仅记journal，不将测试当原机制来源。

<a id="native-field-dispatch"></a>

### 13.6 真实4E5C分派与5130野战速算返回（P24-FIELD-DISPATCH-1）

本节取代§13.5的“全部4AB3前停/仅错误持有frame”当前边界；§13.1–13.5保留其各批历史原证。**实锤限定域**：detached真实2873→4A7B→4C72后，四次status/唯一03写→4E5C；两方非玩家或首先命中的玩家军团bit04委任时，执行AL=1的5130、双方474A、AH去向消费者，正常返回到26F5占格INC及原slot泵。玩家未委任的消息/战术仍在首个未知CALL前停；空名单仍按本波合同停4AD3。非全AI完成，不放行默认v2/正常App、攻城5130模式0或任意段/外栈。

**原证绑定**：同一`KI.EXE` SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，新读VA+200h的25A3..2708、2708..28F4、4A7B..4ADE、aligned4E5C..4ED7、5120表、5130..5358、474A..487B、6FD2..7028、ECE0..ECFE。原bin/text/hash和source-only已安装Capstone/DLL/Python前后绑定见journal§20的新证据根。没有运行DOS程序；不依赖上一批文字作为本批原字节读取。

**4E5C门序及首次未知**：

- 4E5C读CFF；4E60先比较A.L01。相等只在4E70查A.status&04：置位直达4E6A，否则4E75写D2E=SI、4E7A写D30=selectedDI，CX=1D，停**4E82→4EB9**。不提前读取4EBB/4EC1的L02消息实参，不调用FIFO代替原返回。
- A非玩家才4E65比较selectedD.L01；匹配后4E8A查selectedD.status&04。未委任4E8F令D35|=80，4E95写D30=SI、4E9A写D2E=DI，4E9F交换SI/DI后停**4EA1→CDE**。不越过CDE进入4EA7消息、交换回来或战术1B5A。
- 两方非玩家、或以上相关军团委任：4E6A写AL=1→4E6C调用5130→**4E6F直接RET**。不经过4EAF/4EB4额外占格DEC；那是两条战术返回路径的尾。两方皆玩家的叶输入先A门，区别于classifier先A后D的marker覆盖；真实2831异属门排除两方同时同玩家，不能据叶测试宣称正常接战可达。

**批准的Web表示**：父核对原窗后批准同步调用局部frame。已有D32/D35/D34和稀疏相对BP仍只由对应MOV建立；D2E/D30只在上述实际MOV建立。5130的51B9读取本次frame.D34；classifier产生C0..D5，故该真实AL1链跳过51C3..51E7城损。没有把D32=0解释成有效city0，也没有扩大mode0初始化。`nativeFieldPrefix/nativeFieldCall`仅失败时挂同一个Error作诊断，不可resume，不新增Scenario/sidecar/Session/持久CS；正常同步返回丢弃frame。已接返回4AD3→2876→2708→26F5→2600/264A/余槽没有这些globals/BP消费者，下次4A7B先重新写；尚未接的战术/其它入口继续守门。本片未宣称任意CS历史皆可丢弃。

**5130数字、随机和写序**：由`originalfieldbattle.js`提供严格native IO路径，复用`autobattle.TYPE_WEIGHT`原5120表，而不调用legacy六队补齐、默认能力、weak夹1、DTO批量结果提交。单位继续沿唯一fixed record的六个现有unit对象，人员字段只在原byte读写边界精确除/乘10；不从L04重新均分，不替换兵种或records。G1F选择仍按同号slot，52DB主将读取则严格沿L02/generalIdx。

1. A5285逐六队先type@529A、troops@52A1，52A4按mode1行加权；类型1..4之外为明确CS表别名未知，不夹型、不模4。加权和乘`L06>>3`后取low16。A52D7完整结束才交换SI/DI处理D5285/52D7，不能先算双方base再消费A能力/RNG。
2. 52E7同一word读取G11 force/G12 lead。force<lead不消费随机；否则52F3消费一次ECE0，低2bit非零取u8(force*2)，零取force−floor(force/4)+**5304重读lead**；force<lead同样在5304重读lead。结果CH为byte。530D按mode1读field高nibble，modifier=floor(CH*16/(16−specialty))；5325的word MUL及字节重排/RCR等价`floor(base*modifier/1024)&FFFF`。保全byte/word截断，不把解析器当前半byte武力当原全部域。
3. 5155/5158双方score各word加8，unsigned平手A胜；5171执行强方*8/弱方的word DIV后才上限100。原DIV除0/商溢出是显式unsupported异常，不先夹weak/quotient。合法byte反例：A加权869、morale152，force127/lead0/field15且RNG低2非零：base16511，modifier4064，power65528，加8回绕0，5171除零；已锁原前缀。
4. 51B3固定SI胜、DI败。六轮各先ECE0胜方损失(r&7)+2→5200读队→5215写byte，再ECE0→CH=ratio+i+1的byte DIV取余+8→5225读败队→523A写byte。首队最低1，其余最低0；即时写与RNG交错，共12随机byte，不一次提交十二队。
5. 5249先XCHG胜L04与新总兵；524C再XCHG败L04与新总兵，故第二方未知/失败保第一方总兵写。旧L04是原word除数，不是六队和。旧total=0短路，不读士气；否则旧士气<100归零。胜方525D重读旧士气×**5260重读新L04**/旧total，败方用100×新L04/旧total。word DIV商须≤FFFF，再仅AL写morale，不能直接无界整数后&FF掩盖原DIV异常。胜morale@5265先于败morale@527D，late DIV/字段故障不回滚双方队/总兵或胜morale。
6. 双方战果写毕才5192调用A474A（CL=AL，0代表赢），再51A1调用D474A（CL=AL xor1）。474A仍先严格6FD2，之后morale/首队、己节点/487B撤路及4780/4789/478C/命令写；本次从ai抽到`originalroadretreat.continueOriginalLegionAfterBattle`，旧native apply与新real5130共用一处，v1逻辑不变。每个失败CF形成AH bit0/bit1。新接口仅返回真实被消费的AX；5130尾ADD SP产生的flags不冒充battle CF API，BX/CX/DX/BP与SI/DI恢复，不返回数值DTO。

**caller消费者和原尾**：4AB6只查AH；0不去向；1或3由4AC1读取selectedD.L01后对A调用291A；仅2交换SI/DI，4ACB读取A.L01后对D调用291A。没有“两军失败就两次去向”。沿原fixed对象和canonical RNG进入已有有限291A；消息/显示/未知仍首停。只有其真正返回后才能4AD3释放本次frame，2876 CLC使2708不提交候选点，26F7重读当前A占格pointer并26FA INC，最后原slot泵继续2600→264A→余槽/天气。A当槽2977写48后264A清0；另槽D的48在稍后2A7E减47。F14为原byte维护而非重数live，A退场也仍按新L04/原0E结当槽日费。任何callee/后继失败保持前缀，原owner取消批次并hold/禁存，重复aiTick不重播RNG或补尾。

**验证范围**：独立有界解释器在私有内存执行真实5130及5285/52D7/51B3/ECE0字节，**止于5192首次474A CALL之前**或实际5171/5263/527B DIV异常；129显式byte/word/RNG向量，与Web的十二队写迹、两次word交换、morale、RNG全表/index/addend/calls及停点逐项相等。没有stub474A返回、执行DOS或把此证据叫5130完整RET证书；474A/去向/调度另由原窗和真实slot测试覆盖。`verify_native_field_dispatch.mjs`覆盖playerA/D/both/neither门、委任优先、每个quick IO故障前缀、force/lead顺序、字宽、DIV和AX/AH；`verify_native_road_movement.mjs`覆盖真正2873首DI≠selectedD、正常quick→同槽/余槽、当前与另槽归队倒数、AH3、二次474A失败、无重复RNG、hold/禁存和合法snapshot→实际JSON→restore→prepare。既有early field/selector测试保原前缀，原4AB3首停只推进到各自实际缺输入529A/52E7；未删除其断言来放行battle。

**仍未知/不在本片**：4AD3空名单、4E82/4EA1消息及战术RET/4EAF、攻城28BF→4ADE与mode0初始化、全部G1F初始化/刷新、任意DOS段别名/SS外栈、占格完整生命周期、天气后继/日期月界、全战役/全AI。参数完备的quick返回不证明上述域完成。默认v1资产与App拒v2保持；本波focused/raw通过不代替独立完整门/主动LSP。

<a id="native-siege-entry-evidence"></a>

## 14. 真实攻城入口、固定127槽与返回分流（P24-SIEGE-ENTRY-EVIDENCE-1）

**实锤限定域：原字节、4ADE前缀及4C72/4ED7/4F8A/4FC8的有界原指令执行，另有显式AX/栈输入的战果返回站点与6FD2叶。** 本节记录P24-SIEGE-ENTRY-EVIDENCE-1历史原证，不是该批新增Web接线（当时`originalroadmovement`仍停28BF；后续实现见[§15](#native-siege-integration)），不能把下面的局部执行当成5130/474A/291A/4CF3或消息的完整返回证明。原证根及可复跑脚本见[旧§21收据缺口索引（待恢复）](historical-receipts.md#p24-siege-entry-evidence-1)。同KI SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA+200h；不读取真实SAVE或执行DOS程序。

### 14.1 28BF现场、4ADE帧与主军名单

2880依stride是否等4取当前edge的+8/+6端点，将node地址左移两位后比较城市+1与攻军+1。同属返回CF1；异属先OR攻军status20，再读取唯一03：0写12、>1调用接触表现、1才28BB将0840加到DI后28BF调用4ADE。此时SI是原攻军，DI是**城市记录指针**，不是守军。只有4ADE真正返回后28C2 CLC→275E RET→26F5/26FA重读攻军占格pointer并INC，才接原同槽日结/03/余槽。不能在战斗开始前提交候选道路点。

4ADE按ES/AX/BX/CX/DX/SI/BP保存，分配100h，BP=SP；4AEB另PUSH城市DI，位于名单帧下方。之后顺序：

1. 4AEC只清**攻军**status bit5，4AEF只清攻军03。此入口不像野战4AA5..4AAF，**没有对真实主守军清bit5/03**。
2. 4AF3写D32word=原城市指针；将`u16((DI−0840h)<<3)`的AH写D34，规范192城市域即城市index；4B08写D35=0。不是D32=city index，不能复用野战的D32=0含义。
3. 4B0E读取城+8的Xword，4B11读取城+0A的Yword，4B14取城所属到CH，然后4B17调用§13.5的4C72。不得以攻军坐标、候选边点、live军团列表或byte Y代替。
4. BP名单含0..126全部合条件fixed槽、BP+FE保存word计数；评分/返回BX仍按§13.5。非空调用4ED7时BX=选中军团、DI仍是城市；空名单的BX=4200，先4F8A再4ED7。

4B56 POP DI后释放100h并恢复其余保存寄存器；外层2831/2880各自定义CF，不能把4ADE末尾ADD SP产生的flags作为战果API。正常返回没有把这份BP/global帧变成持久Session的依据。

### 14.2 4ED7不是野战分派器

4ED7先保存BX/DI；CFF先比攻军所属，相等则只走攻方门；否则比**城市所属**，不是先读取选中军团。真实异属攻城不含“两方皆玩家”，叶分派优先序不能反推该现场可达。

| 条件 | 原址及第一后继 |
| --- | --- |
| 双方非玩家 | 4EE7令DI=BX，AL=0，4EEB→5130；恢复城市DI/BX，直接RET |
| 玩家攻方且委任 | 4F2B测A.status&04，置位跳4EE7 |
| 玩家攻方、未委任、无真实守军 | 4F30比较BX=4200，仍跳4EE7速算；不进战术 |
| 玩家攻方、未委任、有真实守军 | 首个外部CALL为4F36→CDE，随后CX=1C→4F58；返回才写D2E=攻军、D30=主守军并1B5A。Web现经战术挂起管线实现该返回：dispatch回描述符→入口挂起TALK28→v1战术引擎→退出写回＋双方474A合成ax→续跑后半段 |
| 玩家城、无真实守军 | 4EF7令DI=4200，AL=0→5130；4EFE恢复城市DI，CX=1A；仅AL=0攻胜才4F06→4F71，消息返回后才退出4ED7 |
| 玩家城、有真实且委任的主守军 | 4F0B测`[BX].status&04`，置位跳4EE7；**不经过无主军TALK26分支** |
| 玩家城、有真实且未委任的主守军 | CX=1B，4F13→4F58；返回后D35 OR C0、D2E=主守军、D30=攻军，才1B5A。Web同管线挂起TALK27后进战术引擎 |

速算直返不经过4F4C..4F53的额外占格DEC；该尾属于战术返回。4F58/4F71的消息/声音返回仍按原外部边界另证，不能调用Web FIFO便假定所有寄存器、栈与后继皆等价。玩家空城攻陷顺序为`5130→TALK26返回→4FC8→4CF3→条件迁都TALK30`，不是统一占城后才发26，详见[消息审计§3.1](message-system-audit.md#31-玩家失城消息的入口分流勘误)。

### 14.3 临时城防是固定槽127的部分写，不是新军团DTO

`DS:4200=2240+127*40`。4F8A保存AX/CX、令BX=4200，只执行以下写入，未列字段保留原值：

| 原址 | 写入 |
| --- | --- |
| 4F92 | L01=城市+1所属byte，包括18h |
| 4F95 / 4F99 | L02=7F、L06=FF |
| 4FA2 | L04word=城市+13 byte零扩展 |
| 4FAD / 4FB0 / 条件4FBA | 六个L29兵力byte=商再给前余数队+1；六个L2A兵种byte=3 |

设城兵N为完整byte0..255，商`floor(N/6)`、余`N%6`；不会因N=0跳过临时军。此函数不消费RNG，不增加F14，不建立占格，不写status、03、0B、0E、14、1A/1C、20、23，也不清其它六队字段。选择器不扫描127号并不表示这个槽不存在或可丢弃；4F8A也没有把L00先置为活动。G127能力来自后续52D7按L02寻址读取，不在此处写死8/8或创建默认将。

4FC8保存AX，只将`[BX]`状态byte写0，再恢复AX返回。它不撤回兵力、士气、位置、计数、命令或派生字段，不DEC F14/占格，不删除整条对象。原用例用非零哨兵填满槽127，对256种城兵逐字节核对全部64字节，证明该写集与残值保留；哨兵是**显式私有RAM输入**，不是对原版开局值的断言。

**后继实际会读残值/别名，不能用“只是临时军”跳过：** 5130先完成双方伤亡与士气，再对双方执行474A；474A首先无条件6FD2，不因L00未活动而跳过。6FD2重算L04并写L1E/L09/L0B；700F读取`DS:(L01*40h+3Eh)`。临时军所属18h时该址为**063Eh**，不是现有24个势力对象中的合法index；本片以显式raw byte0/5D/FF执行6FD2，L09分别写`u8(5*raw)`，而没有造“势力24”。继续追查而非把063E停留在未知：新读310A..3138，3119以两势力记录指针为SI/DI，计算`BX=600h+24*from+to`；故**063E就是现有外交矩阵`[2][14]`的同一raw byte**。实际3119指令返回063E，并穷尽256种该byte重新执行6FD2核`L09=u8(5*raw)`；不去bit7、不夹100，也不制造势力24或独立palette默认值。这是L09的别名读写事实，不能扩大成外交关系改变攻城胜负的公式。未来桥接必须读取同一矩阵权威；矩阵完整生产/恢复和其它别名域仍遵守C01/C06/C14，不把地址识别说成这些整行已闭合。败军474A若通过士气/首队门，还会读取保留的L0E并可能进入487B；4F8A本身没有将它定位到被攻城市。现有默认v1合成城防对象不构成这些原值的证据。

### 14.4 4ADE战果消费者与野战AH解释不同

以下表格的AX是4ED7真实返回值；有界执行测试把它作为**明确返回站点输入**，并未stub5130/474A成功或认证该AX已由完整战役生产。AL=0攻胜、AL非0守胜；AH bit0/1分别为攻/守474A失败。

| 路径/条件 | 外层原指令行为 |
| --- | --- |
| 真实主守军、攻胜、AH bit1=1 | 4B28取A所属到AL，4B2B交换SI/BX，以选中守军为SI调291A；真正返回后交换回来，再占城 |
| 真实主守军、攻胜、AH bit1=0 | 直接占城；不因AH bit0=1改为攻军去向 |
| 临时城防、任意胜负 | 4B3A先4FC8仅清临时L00；随后才检测AL。不存在临时守军291A分支 |
| 任一守军类型、守胜、AH bit0=1 | 4B50以城市所属为AL，对原A调用291A；AH bit1不额外触发守军去向 |
| 任一守军类型、守胜、AH bit0=0 | 直接4B56恢复并返回，无占城/去向 |
| 占城分支 | 4B41先取A所属；4B44 POP SI取回原城市指针，立即PUSH保存；4B46以同一原BP调用4CF3 |

特别是**真实攻城AL0/AH3只先处理守军去向，再占城**，与野战4AB6的AH3只处理攻军不同，禁止共用一个脱离caller的AH映射。4CF3后续4D11读取的是原BP+FE，4DA4消费战前名单；其中已被291A改变的记录也不能被live过滤掉。官员/迁都/灭亡/display-on仍遵循§11–12的未知边界，不能在失败后补4B56/28C2或slot尾。

### 14.5 原证批次结束时的接缝（历史，后续实现见§15）

- 已新核：入口四项global/status写序、真实/临时分派、临时槽部分写/清理、原BP传递和AL/AH返回站点；前述范围之外不沿用“完整攻城已接”标签。
- mode0数值须以严格同步IO接入：A5285权重行3、双方52D7攻城专长、D5285行0且在52BA加城+13；51B3在六队前按51D0→51D9→51E2写城+13/+10/+11。正常数值推导见[NPC局部原证§3](re-notes-npc-strategy.md#3-胜负与损失实锤正常数值范围)，不能调用legacy DTO默认/夹值路径冒充全域字宽、DIV故障及即时写序证书。本次未执行这段mode0完整速算。
- 必须保单一slot127及所有旧字段、同一BP/canonical RNG与既有slot失败所有者；不能让4F8A清空未知、默认能力填洞、4FC8删对象、捕城重建BP或message代替原RET。中立063E已定位外交矩阵`[2][14]`，但其同权威桥接、G127/临时槽初始与全写者、消息/战术返回仍是具体接缝；在它们被实际消费前，任何有限接线也必须明确首停，不能猜公式/残值补齐。
- 该原证批次保持默认v1、App拒v2、28BF工程守门，没有改规则模块或游戏测试。后续有限实现见§15，不把本节原证脚本通过写成全AI完成。

<a id="native-siege-integration"></a>

## 15. 真实28BF攻城同步接线（P24-SIEGE-INTEGRATION-1）

**实锤限定域**：在§14原窗与已闭合474A/291A/4CF3合同内，`originalroadmovement`的2880倒数1现进入`originalsiege.js`；两方非玩家、玩家委任或空城可调用严格5130 mode0，同步返回后才执行28C2→275E→26F5占格INC及原slot尾。不是全AI/全战役认证；默认v1、正常App拒v2及旧晚battle入口守门不变。

### 15.1 唯一状态与执行顺序

- 复用field的严格Scenario IO和5130数值内核；mode1原门/公式保持，mode0增加A权重3、D权重0与52B5读取本次D32、52BA读取城兵，双方专长取siege。不调用legacy DTO/default/夹weak路径。
- 城损在51B3先读D34，随后51CB读取D32。三个字段依次执行真实byte SUB：先写`u8(old-damage)`，借位时才在51D5/51DE/51E7单独MOV0，不能将两个写压成一次饱和赋值。后续六队、旧总兵除数、士气、DIV异常与RNG交错共用§13.6原序。故障保已有城损/队写/RNG，不以回滚模拟事务。
- `4ADE`仅清攻军bit5/03；不清真实守军。4C72仍同号stored G1F与127槽名单，原相对BP在本次调用内保留。无守军时4200是固定slot127，不生成新军团DTO：仅按4F8A的各次MOV/INC写所属、主将127、士气255、总兵与六队，缺少存储对象只在实际写处建立该字段，其它旧值/未知保持。4FC9仅清status，重绑定live投影视图但保留同一个fixed record和残值。能力继续严格读现有G127，不补8/8。
- 6FD2的owner18仅扩展**已闭合的700F只读别名**：同一`sc.diplomacy[2][14]`原byte即DS063E，不mask7、不调用有默认值的relation、不借fabricated faction24。缺值在总兵/1E已写、marker/0B未写处失败。该批没有一并扩展其它owner18地址；后续487B/47A0的0603同外交byte只读桥见[§17](#native-neutral-retreat)，其余未核别名仍按消费点停止。
- 4ED7按攻军所属优先、再城市所属判玩家。未委任真实守军的玩家攻/守现经战术挂起管线进v1引擎（TALK28/27→战斗→写回＋474A→续跑），不再停4F36/4F13；空守军玩家城被攻胜在速算及474A之后停4F06，**尚未4FC8清临时status、尚未易主**（4F06警告挂起不变）。不发FIFO冒充消息返回，不执行战术4F51额外占格DEC（与v1战术及速算路径一致：该DEC只存在于两条战术返回尾，Web均未实现，属已知缺口），不预写D2E/D30或D35|C0。后续[警告/等待原证](re-notes-strategic-message-abi.md#siege-warning-wait)核4F71参数、CE7及222B限定返回，尚不解除这些工程停止。
- 只有dispatch真正返回后，临时军先4FC9清status；真实军攻胜AH&2才D291A，随后4CF3；攻败AH&1才A291A。AH3不复用野战映射。4CF3沿原BP记录引用执行同一个抽出的native4DA4，保已退场成员与全组原序；不按live重选，先城市易主/官员/首都，再组退、F23、地图等既有顺序。未知消息/灭亡/显示输入保前缀停。
- globals/BP仅本次同步栈的Web表示，正常返回丢弃；失败将`nativeSiegePrefix/nativeSiegeCall`附在原Error，仅供诊断，不能resume/入存档。没有增加第二调度器或RNG，失败仍由原slot owner hold/禁存并阻止重播。

### 15.2 原始验证与仍未闭合项

本批重新执行固定SHA KI的5130/5285/52D7/51B3/ECE0原字节，256组显式mode0字宽/能力/城兵/旧总兵/RNG向量，与JS逐城byte写、十二队写、两个word交换、士气、全RNG及DIV停点比较。**执行止于5192首次474A CALL之前，不是完整5130 RET原CPU证书**；更外层原窗复用§14封存，291A/4CF3继续使用各自有限原证。脚本/输入输出/实际安全验证见[旧§22收据缺口索引（待恢复）](historical-receipts.md#p24-siege-integration-1)。

真实slot回归区分：攻城入口不清D03，但474A把D0B改1后，当批后面的D槽会在自己的25CC/264A清bit5/03；不得把后者误测为入场清零。覆盖败退→未消费候选→原格INC→同槽/余槽、玩家4F36失败/hold/不重播、中立零城兵仍战斗及063E→临时清理→占城绘图→同槽尾、未知063E保前缀。纯IO测试另核全部256城兵构造、完整AL/AH返回站点矩阵、玩家/委任门和逐IO故障；这些人工接口输入不是整战役可达性证明。

仍未完成：G127/G1F与slot127的实际初始化接线及全写者（源载入值与55A6局部现见§16）、任意DOS段/外栈/其它中立别名、完整消息/战术返回、灭亡与占格全生命周期、天气/月界、全AI因果复演。已知限定返回不能解除C01–C15剩余缺口或App/defaultv2门。

<a id="native-siege-initialization"></a>

## 16. 临时槽源初值、55A6与攻城冷恢复（P24-SIEGE-INITIALIZATION-1）

**实锤范围**：固定五个SINARIO的20章字节、KI明确载入/写指令、55A6整叶有界原执行。Web新增保存回归只证明显式输入下的攻城前后冷恢复；没有运行DOS新局、补造生产默认字段或完成C01/C14整链。原证与失败/检查收据见[旧§23收据缺口索引（待恢复）](historical-receipts.md#p24-siege-initialization-1)。

### 16.1 源值不是运行时兜底

8CAE正常完整读取章+80h的5240h字节到D52:0，覆盖L127（DS4200，章内4280）和G127（DS5220，章内52A0）。五个固定源`原版/上/中/下/后`各四章的整个128×64B军团区均为零；这是**载入时**的值，不是每次4F8A清零的依据。下库末章少2B在事件尾，所核军团/武将区完整，不认证整文件格式。

官方四章G127完整32B相同：

```text
00ffa1d0a1d0a1d0a1d0a1d0a1d00000000808080000000000ff0000ffff0300
```

20章的G127三专长均0、武术/统率/政治均8、+1F均0；但**上库第0、1章G127+1C为02，其余18章为FF**。所以8/8是这些源的已知值，不是可以忽略所属/兼容字节的默认对象。4F8A写L127所属、主将号127，不因此覆盖G127所属。20章全部128将的+11/+12/+13都≤15，当前解析器`&0F`对本次来源没有截掉高位；全byte机制域的解析缺陷仍然存在，本波没有修解析器、重导入或修改运行资产。

### 16.2 已核写者与严格边界

- 8F82清头像，8F90写六个D0A1占位word；8FFF、913D、9154改头像；905E/9075/911E沿偶数SI写5222..522D姓名/字号；915B..9178转换占位空格。这些**明确指令**不写能力，不能扩称所有UI间接调用都无规则副作用。8F97..8FC8含表/文本，按8FC9重新对齐反汇编，禁止把穿表线性解码当代码。
- 9047写军师号7F。1B00/1B03仅对该号跳过F18 DEC；1B12仍清被选军师G00。没有因此“跳过整个军师初始化”。新局后续2BD9及其它写者仍单列待闭合。
- 55A6固定DX=127、SI=4240，遍历G0..G126；仅G00≥80h才在55DC写G1F。公式为三个专长高nibble之和，加`u8(force*2)`与`u8(lead*2)`，最终u8；政治不参与。**即使G127的attr显式设FF也不访问它**。因此不能对128将统一重算G1F来模拟该入口。
- 533D的55A6调用与1B7E战术返回调用533D已定位；不将55A6整叶通过当作整个533D/1B5A生命周期完成。9E97复制军团+1..7与六队至D30A，并非将G127能力重置。89F0的8A09只遍历127个普通军团，不能用8AEA为L127推造当前占格pointer。

本批私有内存执行真实55A6..55EB并RET：256组显式输入覆盖active门两侧、全byte能力回绕、inactive残值，G127刻意设active且整个记录非零。核全DS写集仅活动G0..126的+1F、写址顺序、保存寄存器与栈恢复；没有callee替身、RNG或DOS设备。该证书不证明所有G1F调用者或G127/L127任意运行前史。

### 16.3 有限Web保存证书

`verify_native_road_movement.mjs`新增真实28BF前后两次`snapshotState→JSON.stringify/parse→restoreSnapshot→prepareScenario`回归。显式fixture给G127三专长0/三能力8及所属2，给L127非零旧道路地址、命令、03残值；这些残值是**受控输入**，不是从全零章自动推导的战役前史。

原实例与冷恢复实例分别进入中立零守军攻城，消费同一raw063E、清临时status、占城并完成slot尾。核固定slot127仍为唯一对象、G127未被临时所属覆盖、03/道路/命令残值保留、inactive127不出现在live视图。战后再冷恢复核全部临时槽字段、计数、G127、完整RNG及下一byte一致，双方规则快照及占格/terrain能力一致。跨实例全表比较使用`snapshotNativeLegionSlots`的正式规则序列化边界，不比较刻意剥离的dead/leader/target表现引用；并独立逐字段核L127与G127，未用structuredClone代替JSON。

**仍待闭合**：完整新局/军师/月份/战术返回写者与正式装配，任意中立别名、消息返回、一般全byte解析与源更新流程，以及C01–C15其余项。不新加初始化默认值，不放行App/defaultv2。

### 16.4 55A6调用者闭合与G+0x1F唯一写者（P47-C11-G1F-CALLERS-1，零生产改动）

**实锤（现刷窗＋全EXE opcode扫描，KI SHA256沿§17，VA+200h）：**

- `callers(55A6)={0x5347,0x5391}`（`E8 call rel16`全扫描）；`9A A6 55` far-call与`EA A6 55` far-jmp零命中。寄存器间接call不在opcode扫描域内，记残余未知。
- `533D`体=533D..5357：push全寄存器→`DS=[D52]`→`call 55A6`(5347)→`DS=CS`→`call 1E17`(534E)→恢复→ret。`callers(533D)={1B7E,1BE9}`。
- `5358`函数体=5358..53C5(ret)：派系循环5362..5389（SI+=0x40，CL<0x16）→5695(538B)→585F(538E)→55A6(5391)→2BD9(5394)→5715(5397)→578F(539A)→22DB(539D)→2286(53A0)→57FE(53A3)→53A6四word `cs:D10→D08`→AL=0x0E→5E80(53BD)→`DS=CS`→ret。`callers(5358)={1DD4}`（1DD1清CF0→call 5358→CF0++→CF3置1，月驱动）。Web `main.js`月末序（585F→55A6→2BD9→5715/578F→type11/12→57FE→53A6+5E80）与此逐项对齐，5391位置一致。
- 启动链：入口0x00→0x31序列→0x40:`call 0x5B`→0x67:`call 1BE0`→1BE9:`call 533D`。`callers(0x5B)={0x40}`，`callers(1BE0)={0x67}`，启动期单次执行。
- 战术驱动1B5A..1BDF内1B7E:`call 533D`，其后1B81 call 20D6、1B84 1F7F、1B87 89F0、1BBA/1BC9两次`call 474A`（SI/DI互换，AH分别or 1/or 2）。`callers(1B5A)={4E85,4EAC,4F26,4F49}`（战斗分派区）。
- 全EXE `mov r/m8,reg8 disp8=0x1F`仅两处：55DC（55A6内写G记录+0x1F）与B2C8。B2C8属B240函数（B240..B35F ret），其SI域为0..0xC00/stride 0x20战术对象表（AE26调用点`add si,0x20; cmp si,0xC00`循环；B4AF调用前`ES=[D2FA]`战斗显示段；比较`cs:D32C/D32E/D33C`战场几何），非DS:4240系武将记录。故武将G+0x1F静态写者唯一=55DC（`C6 disp8=0x1F`直接数与`425F/523F`直接寻址写零命中）。
- 20章全量：活动G0..126共2309槽raw +0x1F全0（以已证55A6公式对chapter JSON逐槽重算，2309/2309为raw0<>calc非零）；G127+1F=0沿§16.1。战役G1F有效值完全来自运行时55A6执行，载入初值即raw 0。
- Web接线现状：初值=解析器raw +0x1F（`parse_sinario.py:103`，=8CAE载入语义）；唯一刷新=月末`main.js:543→processMonthlyGeneralRatings`（=5391）。两者与已证路径一致。

**推断：** 启动1BE0→55A6在玩家选章输入之前执行（entry fall-through顺序，0x5B块仅被0x40调用一次），对战役内存行为上应无实质影响；但33B/210/155/6B/30F与A1C/19CA/1A6E/89F0/1F7F身份未证，仍只标推断。

**未知（hold，不修）：** (a)1BE0相对8CAE章载入的先后；(b)1B7E相对战术战斗的前/后（1B5A内相对474A双调的位置语义）；(c)1E17语义（读CF6/CF4/CF0调062F×3，疑似显示）与533D整体在Web战术返回/新局的对应；(d)寄存器间接call残余。Web新局/读档首入/战术返回均不调rating refresh（全仓库仅`main.js:543`一处调用），现状保持hold：启动期若接在载入后会把全0改写为计算值，若1BE0实为载入前则接错方向，未证前不动。`parse_sinario.py:103`旧注释“新局/标准读档首入战略均执行”属未证期望，已改未知标注。

<a id="native-neutral-retreat"></a>

## 17. 中立临时军的0603撤退别名（P24-NEUTRAL-RETREAT-1）

**实锤限定域**：KI原指令及显式RAM下487B/474A整调用返回；Web只增加已证DS0603的同权威只读桥，不建势力24、不扩任意别名或城市范围。原始bin/对齐反汇编、执行器输入输出与验证收据见[旧§24收据缺口索引（待恢复）](historical-receipts.md#p24-neutral-retreat-1)。KI SHA256仍`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，VA+200h。

### 17.1 真实地址、分支和写序

487B取L01到BH、BL=0，4880/4882两次SHR使BX=`owner*40h`；4884读取byte[BX+3]。owner=18h时地址是**DS0603**，3119关系矩阵地址式`0600h+24*from+to`将它定位为同一个外交raw `[0][3]`，不是第25个势力的独立首都。

- 读到FF：488B STC、488C RET，不读取本叶489A的L0E，也不搜索。其它byte均先零扩展乘8；不mask7、不夹191、不用外交默认NEUTRAL替代。FF分支只在既有Web叶ABI中声明BX/CF，不因此虚构未提供的入口AH/CX。
- 4897再次读所属，489A读取L0E；道路端点和491B继续沿已核487B原序。实际491B shortcut返回CF1时490C恢复DS，4911/4913令AX左移2，4915 BX=AX，4917 CLC；这条返回没有额外城主比较，不能人为以“中立没有首都”拦截。
- caller474A先6FD2，再士气/首队/胜负门。败方**4761已先读取L0E**，所以不能把487B的FF早退挪到整个474A之前。中立的6FD2继续读§14–15的063E，0603是另一byte，不能混用。
- 退路成功后依次写L14@4780、L20@4789、status OR2@478C；总兵≤300写命令10。>300才47A0重新读取同`owner*40h+3`，目标等该byte写10，否则写8。不得缓存4884第一次读取来代替第二次；第二次失败时已写目标/status，不回滚或补写命令。

`readOriginalRetreatCapital`现在对owner18仅接受`scenario.diplomacy[0]`自有索引3的整数byte，缺值/非法/inherited byte仍明确抛出；即使存在伪造`factions[idx=24]`也不使用。普通0..23仍沿原命名capital/显式null→FF规则。桥不增加RNG、占格、默认初值或第二状态。命名city仍限0..191；raw 192..254不能借原RAM测试被升级为合法Web据点。

### 17.2 原字节与真实攻城覆盖

有界原CPU执行**512组**（256个0603 byte各运行487B及474A）：DS3000、graph4000、L127属18/士气200/六队各50、063E=17，显式旧L0E=`capital*8`，城主0。非FF自然进入真实491B shortcut，FF走早退；调用6FD2/487B/491B均执行原字节，没有callee成功替身。核全DS写集、L127、CF/AX/BX/CX、段寄存器、保存寄存器与SP。非FF时487B AX/BX=`capital*32`、CX=`capital*8`、CF0；474A刷新总兵300/1E3/marker85/0B1后写目标/status/命令10；FF保目标/status/命令并CF1。192..254只是显式RAM范围的叶证书，**不是正常城市可达性、全搜索或完整5130原CPU证明**。

纯IO/Scenario回归另核缺值/非法/伪势力兜底、FF叶不读current、474A仍读current、胜方不读0603及>300第二次0603读故障前缀。真实28BF回归用中立城兵255且败方士气/首队仍非零，确保进入退路：0603=0沿旧L0E0快捷返回、FF沿CF失败；两者都按原临时分支清status，再占城和同槽/余槽。缺0603则在城损、六队与6FD2之后停住，保持原Error/hold/禁存，不占城、不补占格INC，再tick不重播12次RNG。

**仍未完成**：其它中立别名、完整槽历史/初始化装配、任意DOS段/外栈、消息与战术返回、天气/月界及全战役AI因果复演。本片不更改默认v1/App拒v2，不把局部失败当正常RET。

## 18. 玩家登场与俘虏归宿消息接线（P33-MONTHLY-FATE-1）

本节为5924/599C玩家径接线的唯一详细维护源，取代§9/§10中的两处停点合同；静态原码实锤与Web工程域分开。**只推进585F扫描内的玩家消息续段，不完成5358整链、C12/C13整行或全AI**；正常App仍走v1，默认源不放行v2。

- 权威窗复核（`tools/disasm.py`现刷，KI固定SHA、file offset=VA+200h）：`591A`目标==`cs:[CFD]`（玩家）→`5921 PUSH SI`/`5922 DI=SP`→`5924 CALL CDE`→`592C CALL 8810`（CX=0x29→TALK[41]，075B选择器CX<0x196直接索引）→`592F POP SI`→`5930/5932 BX<<=2`→`5934 G1C=BH(槽号)`→`5937..593B AL=BH,AH=FF,CALL 2AD2`（只INC新属F18）→`593E RET`。**玩家消息严格早于owner/F18写入**。
- `5940`（G1D!=FF俘虏归宿）：ECE0消费1字节；r>=0x40→RET；r>=0x20且G1C==G19→joined径（5956 G1D=FF、595A G17=0、5960 2AD2(AH=FF,AL=G1C)先写、5963 CX=0x42→TALK[66]→5990）；否则pending径（596B BL=(r&0xF)+8、597E 301C入队AX=(slot<<8)|9/DX=FFFF、5984 CX=0x41→TALK[65]→5990、**598A G1C=0x18仅在5990返回后**）。`5990`：`cs:[CFF]!=G1C`→RET（非玩家无消息）；==→`5999 PUSH SI`/`599A DI=SP`→`599C CALL CDE`→8810→`59A4 POP SI`→RET。joined径写在消息前、pending径`G1C=0x18`写在消息后，顺序不对称已实锤。
- Web接线（5810合同同§9/§10）：`originalMonthlyGeneralScan585F(io,startSlot=0)`支持`io.deferPlayerFateMessage`钩子——玩家径返回`{deferred:{at,kind:'recruit-join'|'captive-joined'|'captive-pending',slot,owner,talkIndex},slot}`并暂停扫描，恢复从`slot+1`重入（跨槽无其它存活寄存器，与LOOP CX/SI语义等价）；无钩子保持`5924`/`599C` stop fail-closed。导出续段commit：`commitOriginalRecruitJoinOwnerWrite`（5930：`G1C==0xFF`幂等门+`G1C=owner`+`2AD2(255,owner)`）与`commitOriginalCaptivePendingFactionWrite`（598A：`G1C=owner`，owner=挂起时捕获的G1C）；captive-joined无尾写。挂起期间禁止快照保存（`_nativeMonthlyFateContinuation`禁存门）。
- ai.js合同：`processMonthlyGeneralFates(app,deferredTail)` native支路入口前置门——同scenario已挂起直接RangeError（在消耗任何RNG/扫描前；旧实现把检查放在suspend时导致重扫slot 0二次消费RNG，已改前置）；deferred→`suspendNativeMonthlyFateMessage`入队8810等价Talk模态（talkIndex 41/65/66、generalName参数、onClose=resumeNativeMonthlyFate）并置`_strategicEventPostMessageRngPending`。resume：验scenario/owner→按kind补写续段→从`slot+1`续扫→再deferred则链式下一条（保tail）→完成后清续体、rngPending=false并执行`deferredTail`（月结剩余步：ratings/diplomacy/budgets/disaster/deficit/policy/monthlyAI/cmd.monthEnd/monthlyAppear守卫后）。错误路径holdFailedStrategicUpdate+rethrow，保留前缀不回滚。无gamebar→RangeError fail-closed。
- main.js月结重构：`onMonthEnd`在5358序列后建nativeBlocked守卫（scenarioNativeRoadContext||hasNativeLegionSlots）与`runRemainingMonthEndSteps`闭包；processMonthlyGeneralFates未挂起才立即顺序执行尾巴。native场景下monthlyAppear与cmd.monthEnd的pendingRecruits段跳过（585F逐月减G18=appear_months与v1按elapsed阈值直改faction双机制冲突消除；v1 recruit()命令花200金次月+500无原版对应，native场景返err禁用，v1保留——**未批准差异候选，待用户裁决**，原版兵源=5695自动增长+67C5跳表財政政策配额，见[财政§14](re-notes-ai-fiscal.md#native-fiscal-monthly-sequence)）。
- 回归：`verify_native_legion_fate.mjs` 40项——5924/599C两旧stop断言改写为deferred全合同（挂起前缀保留、continuation形状、talkIndex、already-pending再入、onClose后5930/598A写序、slot+1续扫、链式多挂起、无新RNG、tail执行、故障保持hold+禁存），外加既有585F/5940/5899钉值不变。
- 仍未闭合：CFD全初始化/跨阶段写者、F18全生命周期、5358整链、35ED/1D8E、4FCE消息返回与TALK36后F19续段（扫描本体见§19）、生产native内容挂载与默认App v2准入；不启用正常App v2、不改默认资产。

## 19. 4FCE灭亡扫描本体与D2A写者闭合（P45-EXTINCTION-1）

本节是4D1E停点之后4FCE扫描的唯一详细维护源，取代§11.2的"当前停在调用指令4D1E"状态。**只推进非玩家灭亡径到TALK36前停点，不完成玩家1CB1非局部退出、任何消息返回、TALK36后F19续段接线、C12整行或全AI**；正常App仍走v1，默认源不放行v2。

### 19.1 原始绑定与D52布局确认（实锤）

KI固定SHA、file offset=VA+200h。本轮现刷窗口：`4FCE..5120`、`4236..4268`、`3669..36C0`、`7028..703B`、`29C3..2A7E`、`4689..4697`、`2AD2..2AF3`、`89F0..8A1E`。

- `89F0`以`DS=D52、SI=0840h、CX=C0h、步进20h`固定192城调`8A1E`，与`4236`的`DS=D52、SI=0840h、CX=C0h、步进20h`同基/同跨/同数：4236目标即城市表`+1/+1A`，不是第二套镜像。
- D52状态块内布局一次对齐：势力`@0`（22×40h，5055循环`DI=0、+=40h、22次`复核）、24×24矩阵`@600h`（3697的`AL*24+AH`行主序复核，`600h+240h=840h`恰接城市基）、城市`@840h`（192×20h）、军团`@2240h`（50B4的`(DI-4240h)*2+2240h`与29C8同式复核）、武将`@4240h`（127×20h）；总`5220h≤5240h`。
- `50D7`的`BH=old1D、BL=0、shr×2`得`BX=old1D*40h`（40h=64，十进制勿误作64 stride之外的换算），正是势力指针算法；`4FF0..4FF6`的`BX*4取AH`同理得死亡势力索引。
- `5074`的`BH=diplomat、BL=0、shr×3、+4240h`得武将指针（20h stride），与50D7的两种位移不对称是原码原样，不统一。

### 19.2 逐指令扫描与停止点（实锤＋明确工程边界）

```text
4FD5 CS:[2919]=AL(captor)              // Web无存储字节，captor透传即等价投影
4FD9 F00&=7F                           // 玩家径之前已提交，失败保留
4FDC BX(dead*40h)==CFD word ?
  == → 4FE5 CALL 1CB1（玩家非局部退出，不返回）→ 首停
  != → 4FE8 DEC D2A                    // Web无存储字节，见19.3
4FED CALL 5074（F2A==FF直接RET；否则XCHG F2A/G17清后首停于509E call 8810/TALK69；P55勘误：无CDE/beep，旧“509D CDE”标签退役）
4FFD CALL 4236（192城+1/+1A双∈{dead,captor}则+1A:=+1；纯叶）
500A 固定127将：inactive跳过；G1C!=dead跳过
  G1D!=FF → 50D7（既有叶；玩家恢复方首停于5101）
  君主或G17==0 → 502E 直调29C3（既有叶；首停于2A31/2A6A）
  否则 → 50B4（纯叶：2BA8+7028+G17=0+G1C=FF，无TALK路径）
503D CDE+8810(AL=93h,CX=24h→TALK36)    // 无条件，首停于5042
504E F19循环（本轮独立测试，调用点待TALK36返回，见19.4）
```

- `50B4`全程不调`4689`：F14不清零是原码行为，测试只钉`n_legions`不变，不补减。
- `4236`保持AX（仅push ds/cx/si），调用点`5000 xor ah,ah`后AL仍是死亡索引；`3669`保持CX（3697内部破坏由3669首尾push/pop覆盖），CH死亡索引在F19循环中存活。寄存器存活已逐项核对。
- `2A08`旧属活跃短路、`2A0D` bit4永久退场、`2A12` bit6清零+G1E+=3、`2A20..2A31` CFF==旧属→TALK33（无19A）/==captor→TALK34→19A，均沿既有`originalCapture29C3`实现，不在本节复述。
- 武将`+1`字节名未知：仅5074第二段（TALK69返回后）与29C3第二段读取，均在消息停点之后，本轮不命名不建模。

### 19.3 CS:2919与D2A的Web投影（工程等价，P36延续）

- CS:2919全部读者（4FF8的4236-AH、29C3、2977的captor参数位、2A29/2A63的captor比较）都以显式输入接受captor；Web透传captor即精确投影，不新增存储字节。落城当时own城市owner为权威（§11.2既有结论）不受影响。
- D2A沿P36决定不存字节：4FE8 dec的唯一可观测效应是`1D0B cmp D2A,1`门的活计数；F00清零后活计数恰减一，由专项活计数不变式测试锁定（`liveCount(before)-1`＋`Object.hasOwn(sc,"d2a")===false`）。写者侧至此闭合。
- `4FDC`比较的是`deadIdx*40h`与CFD word的16bit原值比较，无对齐门；Web作数值直比，不套用590C的解引用对齐要求。

### 19.4 F19循环与3669（实锤行为＋未知动机）

- 5055循环固定22次（`AL=0..15h`），`[DI]&80h`非活跃跳过；`F19==dead`才清FF并以`AL=当前槽、AH=0`调3669。3669双`0x18`门、取小、OR80h对称写，均实锤。
- 为何与0号势力合并（AH恒0）动机未知：行为精确实现，原因标未知，不作外交语义推断。矩阵单元边界归矩阵IO（24×24 version1），kernel不复核。
- F19循环本体无消息、无RNG，已独立全分支测试；P46现刷`503D..5073`＋4FCE序幕＋`callers(4FCE)={4D1E}`后，调用点推进为19.6的resume入口（编排器本身仍停于5042）。

### 19.5 Web接线与测试合同

- `originallegionfate.js`新增纯叶：`originalExtinctionDiplomat5074`（前缀＋509E停；P55勘误旧509D标签）、`originalExtinctionCitySweep4236`、`originalGeneralScatter50B4`、`originalRelationMerge3669`、`originalExtinctionTargetSweep`（独立）、编排器`originalExtinction4FCE`（F00→CFD门→5074→4236→127分派→5042停）。50D7/29C3/2BA8/7028/2AD2/4689全部复用既有叶及其消息停点。
- `scenariolegionfate.js` fate-IO新增：faction `25/42`读（null≡FF）写（FF写回null）、`F00`写、城市owner（null≡18h）/`+1A`读写、矩阵读写（缺表转fail-closed）；`performScenarioExtinction4FCE(sc,deadOwner,captor,context)`显式输入、无RNG；快照校验新增`target_faction`/`diplomat_idx`。
- `captureOriginalCity`第5参数`extinctionScan(deadOwner,captor)`：缺省保持历史4D1E停；ai.js（`scenarioNativeRoadContext(sc)`）与`originalsiege.js`（siege context）双调用方接线。context缺失只在实际触及占格时fail-closed，不预检。
- 回归：`tools/verify_native_extinction4FCE.mjs` 16项（=13＋P46三项：resume入口504D非法停零IO触碰、场景级resume清目标/合并/4D1E返回/计数不动、capture模拟触发后越过4D1E走完4D62）。
- 仍未闭合：城市`+1A`全生命周期（C02；活数据缺键即在424E停）、G1D=FF/18h别名（沿既有50D7停）、TALK36/69/1A7与1CB1消息/非局部返回（C09，含resume入口的生产触发）、官员4D86/迁都4E3A（§11既有停点不变）。

### 19.6 TALK36后resume入口504D..5073（P46-EXTINCTION-2，实锤）

现刷窗：`503D..5090`、`4FCE..4FF0`，`callers(4FCE)={4D1E}`唯一。

```text
503D mov ah,ff / push ax / mov di,sp / call CDE
5042 (编排器停点：CDE调用前，TALK36尚未进入FIFO)
5045 mov al,93h / mov cx,24h / call 8810 (TALK36) / 504D pop ax
504E mov di,0 / 5051 mov ch,al (CH=死亡索引，AL跨消息存活)
5053 xor ax,ax / 5055..506D F19内联循环（非call；AL=槽计数，AH=0调3669）
506F pop di / 5070 pop cx / 5071 pop bx / 5072 pop ax (配4FCE序幕push)
5073 ret → 唯一调用者4D1E+3
```

- `originalExtinctionAfterTalk36(io,deadOwner)`＝504D..5073：504D配503F零净效（无Web操作）；5051即显式deadOwner参数（与captor/CS:2919同投影 pattern）；504E..506D复用`originalExtinctionTargetSweep`；506F..5073即正常返回（Web无调用者寄存器）。无消息、无RNG。非法deadOwner在504D停且零IO触碰。
- `performScenarioExtinctionAfterTalk36`同IO合同；`captureOriginalCity`在`extinctionScan`正常返回后自然越过4D1E（4D2A→8A1E→88CC→4D33→4D62），该续行是既有代码、本轮首次可达。
- 编排器`originalExtinction4FCE`仍停于5042（13旧项全钉住）；resume入口不自调用。生产触发（TALK36 FIFO关闭→调resume）属C09消息返回域，仍未闭合，不属本节。

### 19.7 TALK36挂起与4D2A尾延后（P54-C09-1，实锤+生产接线）

P54现刷`503D..5073`与P46窗逐字节一致（5042=`e899bc call 0xcde`，5045后TALK36，5055..506D之`cmp al,0x16`即22槽F19，506F..5073尾声），`callers(4FCE)={4D1E}`重证。DOS序：4D1E→4FCE前缀（5074/4236/127分派）→5042 CDE/TALK36入FIFO→504D resume（F19）→5073 ret→4D1E+3即4D2A（captor F23++、8A1E、88CC）。

生产接线（585F deferred同构）：`captureOriginalCity`新增可选第6参`onExtinctionBlock(deadOwner,captor,captureTail)`——scan抛5042且有handler时把4D2A尾包进`captureTail`延后，调handler后返回`"extinction-suspended"`；无handler沿历史5042 hold；非5042停（4FE5/4D86/4E3A等）一律穿透。ai.js原生支传入handler→`suspendNativeExtinctionTalk36`（`app._nativeExtinctionContinuation`+`kind:"faction-extinction"`之TALK36+`onClose→resumeNativeExtinction`；挂起中禁存、在途重复挂起/异scenario抛错、失败走hold）；`resumeNativeExtinction`先resume sweep再跑`captureTail`（=5073 ret→4D1E+3），清continuation，二次close为no-op（尾不重跑）。顺序断言：挂起时captor F23仍0，resume+tail后才1。detached链（originalsiege经capture无handler）沿历史hold，待app-threading设计（P55已接，见§19.8）。外交官/内政官/玩家三消息返回P54时仍hold，P55已接（见§19.8；外交官停点勘误为509E）。

### 19.8 外交官/内政官/玩家消息返回与detached触发（P55-C09-2，实锤+生产接线）

P55现刷（与P54窗一致，逐字节重核）：`5074..50B3`——F2A==FF则50B3 ret；否则push四寄存器、XCHG F2A/FF（BH=FF）、武将索引shr3+0x4240、G17=0、`509E call 8810`(CX=45/AL=93即TALK69，无CDE/beep，旧“509D CDE”标签退役，停点改509E)、50A1 pops后`50AC call 8810`(CX=1A7 selector)；`4D7E..4DA3`——G17=0、`4D86 call CE7`（双哔，P50合同）→8810 CX=44(TALK68)→8810 CX=1A6；`1CB1`=SS:SP复位+AX=2 far-call退出+A1C，`callers={1D43,3E04,4FE5,60C8}`。外交官无beep/内政官先双哔的不对称是原码行为，Web照抄（suspend外交官无音、suspend内政官先doubleClickSfx）。

生产接线（585F/TALK36 deferred同构，legacy v1分支不动）：
- 2b外交官：`originalExtinctionDiplomat5074`加`(onDiplomatBlock,diplomatTail)`参→调handler回“diplomat-suspended”，否则509E hold；新增`originalExtinctionPostDiplomat`（4236+127+5042）；编排器`originalExtinction4FCE`加第4参并拆F00/check helper；scenario层转发+`performScenarioExtinctionPlayerGate`。
- 2a内政官：`captureOriginalCity`重构（`runInlineTail`=4D2A块复用即captureTail；`runPrefixRest`=DEC之后；第7参`extraBlocks{onGovernorBlock}`，挂起回“governor-suspended”否则4D86 hold）；scan第3参`hooks={captureTail}`。
- 2c玩家：ai.js scan lambda先走gate→`triggerNativePlayerDefeat`（沿legacy endView.show gameover.png，不跑scan/尾）回“player-defeated”；capture透传。
- 2d detached：`createDetachedExtinctionScan(sc,context,blocks)`工厂（originalsiege内复用+导出可测；无blocks则4FE5回落编排器hold）；`performScenarioSiegeEntry`加第6参blocks；`performOriginalRoadAction`加第5参blocks（wait闭包直传）；ai.js stepTo加blocks参，`performLegionSlotAction`经`buildNativeSiegeBlocks`构造（含onDiplomatBlock/onGovernorBlock/onPlayerDead，context空回undefined）。
- ai.js新增`suspendNativeDiplomatReport`（无beep；TALK69+1A7单序列onComplete→resume；用leaf捕获的外交官索引，不重读已清F2A）/`resumeNativeDiplomatReport`（跑tail，5042则链suspendNativeExtinctionTalk36，否则hold；正常返回视为模型错RangeError）/`suspendNativeGovernorReport`（先doubleClickSfx；TALK68+1A6序列onComplete→resume）/`resumeNativeGovernorReport`（跑tail，内层挂起各自链）。savegame canSnapshotState加两continuation。
- 回归`verify_native_extinction4FCE.mjs` 21→31全绿：外交官/内政官挂起单元（后者另设第8城保4DF0有新首都不断言灭亡）、4D86无handler hold、player gate两分支、玩家defeat e2e（endView mock）、外交官e2e（69→onComplete→36→onClose，禁存门两段）、内政官e2e（68→onComplete回extinction-suspended→36→onClose）、两resume外scenario守卫、detached工厂两测。gamebar mock记pre-split单调用。

### 19.9 H4尾三项闭合（P84，实锤4项+未知1项；零生产/测试改动）

- H4-(1)选择器返回后段（实锤，覆盖成立）：`50AC call 8810`(CX=1A7)之后仅四pop+`50B3 ret`（窗`50AC..50B4`=`4fafd5b7…`）；`4D9C call 8810`(CX=1A6)之后仅四pop+`4DA3 ret`（窗`4D86..4DA4`=`05b8f0fb…`）。两选择器调用均为序列尾，无后段分支；Web单序列onComplete→resume恰覆盖。
- H4-(2)TALK68/69异常分支（实锤，原版不可达）：入口`8810..8852`窗（=`85f9f617…`）全直线、无任何条件跳转；`cmp cx,-1/je`跳门只存在于兄弟入口（8853+）而灭亡三调用方CX硬编码44/45/1A6/1A7，永不-1。P54“opening-ABORTED”标签全树无第二定义，特此退役——不是未闭合分支，而是无可达分支。
- H4-(3a)1D43胜利语境（实锤，覆盖成立）：`1D20..1D46`（=`30e78f36…`，与kernel已pin一致）=D2A==1胜利分支，CDE+TALK75+君主个性行+AL=2→1CB1；Web `dispatchNativeUnificationGate`逐项镜像（beep/75/个性序列/onClose→D7END十二图，缺基础设施fail-closed）。
- H4-(3b)3E04信赖语境（实锤，覆盖成立）：`3D91`(trust加封FF)/`3DC9`(trust减借位夹0，借位则CX=19E)完整窗（=`dcbb1a28…`/`4c7ed83f…`）；`call 2F5`是声效模式门（cs:[20F]，INT61），非菜单——CX=-1跳门属调用方3B7E菜单合同（P27域）；3DC9本体（借位19E→87FF+个性+8810→D00==0则AL=1→1CB1，否则AL=2→5E80纯显示门）恰为Web玩家决定praiseTalk+checkTrustGameOver（→D7OVER）所覆盖。
- H4-(3c)60C8语境（未知，精确有界；C09相关性未证）：窗`60B4..60CC`（=`1ab65d9c…`）=poll原语93E9(AX=102/CX=51/DX=1116)→CF或AL≠0则ret，否则AL=0→1CB1；93E9为D38段菜单轮询（兄弟调用方6240/6268菜单分派、3B97选项、1F2C/8071），周边6097..60B3为CF8/CFB/CFC显示thunk，指向菜单/系统域而非灭亡域。60B4在KI内无任何静态引用（E8近调用/9A远调用/`68B460`手工帧/字表全空）；1CB1（=`4b9b07ed…`）=SS:SP复位+压AX+AX=2 far-call线性0x10000，而YNVSHELL.COM文件0偏移即入口代码，0x1000:0分派桩为loader放置，KI静态不可解。故AL=0出口语义与60B4归属均记未知；下一步=受控DOSBox-X运行时观测（菜单退出路径）或overlay分析。Web无此路径，fail-closed，无需改动——除非未来证明其在灭亡流可达。

### 19.10 H4-(3c)补充排查（P85，未知维持；三条静态可达理论证伪＋运行时路暂不可行；零生产/测试改动）

- overlay理论死：93E9所轮询cs:[D38]=启动分配器base块（kernel内存段槽：[D38]=base，KI自有段），非外部overlay——调用方不可能藏于D38加载内容。
- 中断向量理论死：全EXE无`B4 25`(INT21/AH=25h设向量)出现，运行时装向量指向60B4无静态立足点。
- 表/帧理论已死（P84）：字值`B460`全EXE仅两处且均为`mov ah,0x60`误命中（5D47/6060）。60B4为RET隔离的真正孤儿入口（前函数60A5止于60B3 ret；字节流反汇编有效，暂不贬为数据）。
- 运行时观测暂不可行：DOSBox-X二进制在本环境零输出（`-version`/`-h`均exit 0无字；journal无其成功运行记录），debugger交互式、自动化既有捕获方案明示阻塞——构造“到达未知菜单函数”的观测na输入不可设计（调用方本身未知）。下一步仍为受控DOSBox-X菜单退出路径观测，但前置条件（可运行环境＋可复现输入脚本）均不满足，本轮不硬上。
- 结论：H4-(3c)维持未知（C09相关性未证、菜单/系统域推断仅记推断不入正式路径）；Web fail-closed成立，不改动。门后延续目标除此一项有界未知外全闭。

### 19.11 H4-(3c)返回后效应界（P86；零生产/测试改动）

- `0A1C`窗（A1C，1CB1返回后唯一KI后继）=纯VGA场同步调色板重载：0x3DA轮询+cs:0x1964表16轮写调色板，寄存器save/restore对称（push ax/bx/cx/dx/si … pop逆序+ret），零规则内存写、零RNG、零分支外发。
- 故即使60B4可达且shell对AL=0返回调用方，KI侧返回后效应仅显示（调色板重刷）；1CB1压栈的AX在A1C内被pop恢复，无残留。H4-(3c)封为**非规则影响UNKNOWN围栏**：归属/loader语义仍未知，但影响半径已证不含任何规则状态，可终局携带不再阻塞。
