# Checkpoint Journal

> 会话交接，不是长期指令或任务授权。[项目记忆](../AGENTS.md)维护事实、架构、命令与约定；[全局AGENTS](../../AGENTS.md)维护安全与证据纪律。这里只保留本轮关键过程、验证、失败、阻塞与下一步，机制细节链接唯一维护源。

## 1. 当前交付：P24成功编成与权威槽修复

**限定切片已完成，全AI仍未完成。** 成功编成/state9兵池重分、严格6FD2、唯一native固定槽及保存接缝已接；首审P1/P2经修复和fresh复审关闭，结论 **No issues found / OK with notes**。修后独立完整 **175入口全部通过（155非浏览器＋20全新隔离浏览器）**。默认源/运行道路仍v1，正常App仍拒v2；本结论不认证完整原生战役、灭亡或消息返回。

- 开发顺序已明确：先还原AI及依赖、保持玩法完整和正确存档，再做独立JS/Canvas架构重构。用户取消旧Web存档兼容/迁移/保全要求；没有因此读取或清理实际存档。
- 交付现场：`main`，HEAD `5e14645b1e381af2a00cf4123d6a4e806ba42697`，47项modified/untracked、index空；保留继承改动，未stage/commit/push。这些是本批记录，后续继续时重查。
- 最新修复仅改6文件：`web/src/game/ai.js`、`tools/verify_native_formation.mjs`及AI-chain、NPC-strategy、行军详细源、本journal；5个相关Skills本次修复未改。
- 已测AI SHA：`ca95f98311b33f1ae6fbafc2f0e5c79575aa906684018e9fc9b4eabcf5c856ad`；formation测试SHA：`ba52a939b7e96368d0f23857094e4587ecf81f10118b9bea283bb249b21191b5`。之后只有父journal交付追加和本次两文档整理，不把文档新SHA写成游戏重测结果。

## 2. 本轮推进顺序

| 阶段 | 已完成的限定内容与边界 |
| --- | --- |
| RAM/内容/装配 | 原图known/unknown与旧队列快照；内容/world身份、每Scenario独立RAM、正式sidecar及两阶段准入。修过“旧现场未完成、新预检失败却解除hold/禁存”的P1。详见[§3.8–3.10](re-notes-march-pathfinding.md#310-p24正式装配与保存身份准入web工程生产仍限v1)。 |
| 战后与移动 | detached真实487B→474A/4DA4、47BB/42AB同动作续行、占格/点提交/节点化与槽尾。攻城双方战果必须先于攻方474A，异常不能丢守方结果。见[战后caller](re-notes-march-pathfinding.md#native-retreat-callers)、[移动caller](re-notes-march-pathfinding.md#native-movement-callers)。 |
| 到达/城市 | 28F4/4325、4300存储缓存/别名、严格日结/资金与21尾写；城市军事/治理/灾害、游标真实返回、32槽天气timer。见[到达](re-notes-march-pathfinding.md#native-arrival-callers)、[城市](re-notes-march-pathfinding.md#native-city-callers)。 |
| 成功编成 | 4575→45C1→6E8F、461D重分、创建/state9/474A共享严格6FD2；资格失败保逐队前缀、旧残兵按新type归池、active同号复用保F14/03及占格残值。唯一详细源：[§3.15](re-notes-march-pathfinding.md#native-formation-callers)。 |
| 审阅修复 | 初始编成175全绿仍被fresh review判BLOCK；补5030同号native查表及29D4严格status门，再完整重验并关闭P1/P2。不是凭绿测跳过审阅。 |

初始编成workflow：`5b8c5b8e-4bd8-4098-acc9-923e82686497`；修复workflow：`ae9b5ac4-5167-4b94-9424-061d8f35b4ee`。两者均已结束，不沿旧日志重新启动。

## 3. 调试、失败尝试与修正

| 问题/失败 | 处理及保留的结论 |
| --- | --- |
| 三个旧回归长期首失败 | delegated混用耗尽边点与真实未消费边界；engagement混用裸入口/槽尾；march期待到达清target，并缺03/0B/1E/F14。按原证补显式夹具、实际坐标＋0E到达和到期节奏，未改v1算法或删除后续断言。Clock非全骑slot0在第1/25主更新动作，25更新后hour2/sub7/day1；三脚本最终均到末尾。 |
| P1：捕获遗漏权威槽 | `finalizeFactionExtinction`只查live/delayed视图，漏掉status04或未知status的槽却继续捕将。现按general.idx查native同号槽，29D4严格读byte，缺slot/status或非法值抛Uncovered；已知inactive清0，保03/F14/残值。不是按L02/leader匹配，也不创建缺槽。 |
| P2：过时摘要 | AI-chain A03及NPC-strategy§6仍称成功新编未闭合；已改为限定域已接并链接§3.15，保留未知槽/外栈/完整初始化边界。 |
| 新红测先被错误单位挡住 | 战果参数把400显示人数当内部数，提前在6FE9失败，不能算P1红。改为内部40/总240后得到24过＋4个具名AssertionError，修复后28/28。 |
| 快照expected漏既有清理null | 首修27/28；仅补`_retreat:null`、`_engagement:null`这两个既有Web投影清理结果，完整原字段/冷恢复比较保留，不扩大DOS写集。 |
| 私有变异执行器错误 | 旧TAP解析器遇默认spec输出、另一次needle漏当前括号，均属于辅助失败，不是有效mutant红。固定TAP、精确匹配私有副本后重跑baseline及具名断言控制；不在生产源码做变异。 |
| SHA/排版漂移 | 多次交接发现布局、尾逗号或换行变化，均冻结前后件、亲读diff并重新绑定验证。最新只变formation测试排版，其余51路径不变；重新主动LSP后完整重跑8focused及controls。来源未知，不能归因于历史ai.js实际autofix通知；无证通知说法已撤销。 |
| UTF8、shell与差分工具 | GBK解码/输出失败、shell反引号或反斜杠转义、两侧CRLF归一不一致导致假“全文新增”等，均保失败后仅修TEMP runner。明确UTF8、独立脚本、对称文本差分，原byte SHA不归一。 |
| 收口检查误判 | validator把exit0的Git换行stderr当失败；分离stdout/stderr后重跑辅助收口。父检查又误要求21个隔离static-root入口cwd必须为repo；按已审runner两域修正。原失败、真实命令和新收据分开，未改产品追绿。 |

每次非预期失败都先停止受影响lane，保存exact错误、Git/cwd、partial diff及SHA，再获明确同协议恢复；没有切换CLI/foreground兜底。旧失败原件仍在证据包，不保留过时“当前待验证”流水作为今天的待办。

### P1新增回归的实际边界

- 真实prepared场景→`applyBattleResult`→NPC末城灭亡：无守军组、攻方474A正常返回；general5但槽内L02=99，slot04/03=77/F14=7，锁定按武将号查表而非主将字段。
- 成功例验证04→0、捕获、规则残值/兵池/占格/RNG/游标及正式JSON冷保存恢复；原24测试保留，新增4例。
- 缺slot/status、null/-1/256/非整数/非有限status在29D4停止。裸apply抛错不自建hold；owned战斗入口捕获错误、hold/禁存、不执行endBattle，保已提交战果/占城前缀而不继续捕将。
- 此接缝不放行一般29C3、29EA→2AD2、active占格注销、完整灭亡扫描或消息返回，详细说明仅在§3.15.5维护。

## 4. 最终验证与证据限度

| 验证 | 当前修复版结果 |
| --- | --- |
| 完整回归 | 155非浏览器＋20fresh隔离浏览器＝175全过，失败/未执行0；不是旧全量拼focused。浏览器错误覆盖仅按各入口实际断言。 |
| 定向及反向控制 | formation28/28；同版私有baseline28绿，删native查表4个具名AssertionError、删严格status2个具名AssertionError；非语法/模块导入失败。 |
| 原证/静态 | 独核112编码行、5030 rel16→29C3、128槽地址算术；17JS/MJS语法、9文档/Skills、6修改行链接及Git检查通过。 |
| 独立审阅 | fresh reviewer关闭P1/P2，No issues found / OK with notes；不代替原程序执行或完整战役证书。 |
| 版本/收据 | validator绑定1016键/1003唯一输入、700条import边、764静态副本，执行前后无漂移。父核300证据hash、175逐入口metadata/顺序/loghash、3私有控制及23辅助命令。 |
| 父交付复核 | 980个当前repo/Skills/全局AGENT输入、764静态副本及52批准路径核符；另23个原始/私有/工具输入未重开，已明确列出。之后journal单独追加并检查，其余979已测路径未变。 |

初始编成阶段另有49152重分/1728编成算术对照、16窗1610编码行及20个零军团表验证；本次P1修复未重跑这些穷举，不计为本次新增覆盖。静态字节、算术、同引擎JSON往返都不是完整CPU/启动/战役认证。

**诊断仍非全clean**：修复2代码初探5辅助，test变版重探44项（41动态Scenario字段hint＋3辅助）；JSON语义helper两建议已精确标false-positive，未改源码忽略或配置。4文档及最终journal主动LSP unavailable；缓存无列出blocking不等于active clean。详细诊断与所测SHA留父证据包。

## 5. 相关文件与证据入口

- 原生实现：`web/src/game/navigation/originalformation.js`、`originalcity.js`、`originalroadarrival.js`、`originalroadmovement.js`、`originalroadretreat.js`；唯一槽表`web/src/game/nativelegions.js`。
- 集成：`web/src/game/ai.js`、`savegame.js`、`scenarioassembly.js`、`world.js`；相位/续段见`legionphase.js`、`legioncounts.js`、`legioncontinuation.js`、`strategicfailure.js`。同组省略重复目录。
- 回归：`tools/verify_native_formation.mjs`、`verify_native_city.mjs`、`verify_native_road_{arrival,movement,callers}.mjs`及`verify_{delegated_autobattle,engagement_state,march_navigation}.mjs`；花括号仅表示文件组，**不是执行通配命令**。
- 规则索引：[AI全链](re-notes-ai-chain.md)、[行军§3.15](re-notes-march-pathfinding.md#native-formation-callers)、[字段字典](re-notes-entity-fields.md)、[内容架构](content-architecture.md)。早期批次详细机制已回流，不再复制旧完整日志。

以下均相对本机`C:/Users/fczll/AppData/Local/Temp/`；TEMP可能清理，只是证据定位，不是运行依赖：

| 证据包 | 关键入口 |
| --- | --- |
| `dragon-native-formation-chain-cwl3bykd/` | 初始合同/首审BLOCK及`implementation-drift/`；`validation-receipt-retry/receipt.json` |
| `dragon-formation-repair-writer-x_wvhrab/` | `actual.diff`、真实历史红`red-retry-receipt.json`、最终`focused-receipt.json`及私有控制 |
| `dragon-formation-repair-validation-hmwcljfx/` | `entry-ledger.json`、`final-summary.json`、原字节/双流日志与artifact清单；不要读取或分享原始环境收据 |
| `dragon-formation-review-repair-mcjm0whb/` | `post-barrier-drift-2bf88e20/admitted-manifest.json`；`validation-completed-17d55fe7-retry/`中的`receipt.json`及`report-receipt-redacted.json`；`final-delivery/`含三最终报告、workflow receipt及交付检查 |
| `dragon-ai-slot-order-parent-uudvtfid/` | 早期原窗/P06/道路证据；`extinction-count-raw.txt`及下述历史安全事件索引 |

### 安全记录不能因清理删除

- 更早scout曾违规读取`.dragon-runtime/save.json`部分内容，已停止且未恢复，父未使用该内容；原事件索引`incident-slot21-read.json`、`incident-slot21-stop.json`在上表最后一包。不能宣称整个专项从未触及禁区；后续本批测试保持固定非存档输入及隔离状态。
- 本轮部分辅助环境快照含未脱敏凭据，父一次读取误显示后已告知用户。不要再输出、复制或上传其值；原件仅私有hash引用，分享只用脱敏摘要，已建议轮换相关密钥，未擅自改凭据/全局配置。不要公开打包整个证据目录。

## 6. 当前阻塞与下一步

1. **继续闭合原callee**：一般29C3/291A/2A7E及2AD2、463E、2BA8、4A7B/4ADE、完整灭亡/消息返回；当前限定接缝不能假RET替代这些链。
2. **补初始化与写者**：active占格注销、88CC/城市边界、未知固定槽/别名、四候选外栈、55A6评分刷新、21/22完整生命周期；不从live数组、raw或坐标猜缺值。
3. **日期与跨链复演**：248A、天气后继及日期/月界，完整P06后续批/玩家非局部返回，再调查持续战争返都与占城弃守的战役因果。
4. **产品准入**：必要初始化/消费者/保存/返回域闭合并完成相应完整回归、复审后，才评估默认v2；随后再按已定阶段进入独立实现重构。

以上是交接顺序，不自动授权下一机制实现、提交或推送。本次请求仅整理项目记忆与journal。

## 7. 本次记忆整理（仅文档）

- `web-port/AGENTS.md`保长期事实、架构、命令、约定、坑点和当前AI主线；本journal收束为本轮进展/调试/验证/阻塞。删除旧版本的重复成绩、过时待办、临时PID/耗时/行号、重复SHA与审批流水；重要失败和安全事件保摘要及证据索引。
- 两文件整理前完整备份及47个既有脏路径SHA：`C:/Users/fczll/AppData/Local/Temp/dragon-project-memory-cleanup-8vrszv4e/`。不另建庞大的常驻历史记忆副本，不删除原始证据。
- 本次只改两文档；不改代码/资产/Skills，不运行游戏回归、浏览器、原程序或访问真实SAVE/profile，不挪用上面的175成绩。37处本地链接/锚点、围栏、命令文件路径及Git空白检查通过，45个其它既有脏文件SHA不变、index空；证据索引核对时更正了脱敏收据所在目录，未打开原始环境内容。
- 主动LSP首探两文档均unavailable；复探项目记忆clean、journal仍unavailable（marksman/typos未ready）。缓存为13个既有warning及2个hint，不作本轮文档失败或通过依据。检查记录存上述备份目录。
