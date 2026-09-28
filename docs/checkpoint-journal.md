# Checkpoint Journal

> 交接记录，不是长期指令、原机制证明或新任务授权。当前0.1.4发布整理见§10，战术对白折行见§9，锚点更正见§8；0.1.3发布批次见§7，渲染实现见§6；§1–5为0.1.2发布历史，不自动授权新任务。长期事实/架构/命令/约定见[项目记忆](../AGENTS.md)；机制细节留在SKILL和`re-notes`。

## 1. 0.1.2发布交付状态（历史）

- 本记录随 **0.1.2 发布批次**纳入提交，前序成果提交为`1102efa`。本批包含后续表现修正、默认面板、测试与必要文档；最终提交以`v0.1.2`标签为准，不在自身提交中猜写SHA。
- 用户已明确授权审查全部改动与未跟踪文件、完整提交、推送GitHub并创建Release。版本概要见[CHANGELOG](../CHANGELOG.md)，版本号见根目录`VERSION`。
- Jev CLI、说明和mock测试经审查作为可复用开发工具纳入；默认不联网、不进入产品运行时。修复缺少retry-after-ms时将null误作0的退避问题并增加mock覆盖。本地代理状态、凭据、缓存、运行报告、临时截图和dist不纳入。
- 用户已确认军团移动及最新云雨暂停/运行问题解决；随后要求默认打开三块UI，已实现并验证。当前没有已复现且未解决的本轮功能阻塞。
- 没有扩展原规则容量、改变AI或安装运行时依赖；未访问真实SAVE/存档/profile，未使用子代理。发布目标为GitHub `main`与`v0.1.2`；Gitea镜像不在本次发布目标内。

## 2. 本轮实现与相关文件

| 工作 | 结果与维护源 | 关键文件 |
| --- | --- | --- |
| Web基础与内容扩展 | 行为基线、资源/状态分层、多档正文+摘要事务、JSON管理、受限编辑器、地图分块；仍192据点，启动仍全读快照。[基础](web-refactor-phase1.md)／[扩展](web-refactor-phase2.md) | `core/savecatalog.js`、`saverepository.js`、`indexeddbsavebackend.js`、`saveexchange.js`；`tools/contenteditor.js`、`render/chunkedterrain.js`；离线`apply_content_patch.py` |
| 3F47恢复缺口 | 保存里已有movement/terrain/cityCache，但App读档接线漏传；补全参数，不合成替代、不放宽守卫。[行军证据](re-notes-march-pathfinding.md) | `main.js`；`verify_legion_lifecycle_browser.mjs`非默认RAM往返哨兵 |
| 行军/接战/战略节奏 | 统一锚点、8×movePeriod插值、五响上限与提速；之后修复图标提前转向/驻守和首次加载空帧。[现行表现](march-presentation-fixes.md) | `render/mapview.js`、`engagementpresentation.js`、`game/clock.js`；`verify_march_marker_presentation.mjs`、`verify_march_markers_browser.mjs` |
| 云雨表现 | 保留原完整PNG，独立八帧播放和平滑位移；随战略计时冻结/恢复，持续慢帧不再停动画，追赶距离不再触发消失。[现行合同](presentation-modernization.md) | `render/presentationclock.js`、`weatherpresentation.js`、`main.js`；`verify_weather_presentation.mjs`、`verify_weather_browser.mjs` |
| 默认UI | 新游戏和标题读档后展开军师一级菜单、势力信息、小地图；不选中子项、不添加hold，按钮仍可收起 | `main.js: enterGame`；生命周期浏览器断言；外部`re-ui-advisor-menu/SKILL.md` |

表中`core/`、`render/`、`game/`与编辑器`tools/`路径相对`web/src/`；验证与离线脚本在仓库`tools/`。外部Skill位于`E:/Dragon/.agents/skills/`。

## 3. 调试过程、失败尝试与修正

| 问题／尝试 | 定位及最终处理 |
| --- | --- |
| 前两阶段浏览器3F47失败 | 改前参考版本同样失败；根因为恢复能力漏传，不是原DOS公式未知。补接后原失败测试及三项非默认RAM保存/读档通过。 |
| fresh与JSON恢复快照要求完全相等 | 既有恢复会将sidecar默认值具体化；分别冻结两种表示，不为对齐测试改规则。 |
| 非整数DPR分块像素漂移 | 保留现行DPR覆盖，增加整图采样回退；不以删除失败用例宣称一致。 |
| 军团插值位置配上规则终点帧 | 造成提前转向/驻守；显示段未完按该段方向，段尾再用规则帧。另预载全部120张军团标识，避免首用null。 |
| 渐变云先灰后白，仍不符合原外观 | 两种程序云均退役，恢复原八帧完整PNG；不再叠加自绘雨丝。仅分析方案未实施时曾导致用户刷新仍旧，后已实际修改。 |
| 恢复PNG后雨丝静止 | 原生天气更新不推进对象frame；表现播放器独立换帧，不写回规则。 |
| 移动中云团消失又出现 | 曾用规则位置与滞后显示位置的差判回卷，反复清alpha；改为比较相邻权威位置，真跳变只重定位。 |
| 暂停政策反了、正常计时动画停住 | 用户澄清后云雨随计时暂停；另将>100ms慢帧整帧丢弃改为最多推进100ms，后台显式pause。测试注入120ms可见负载覆盖运行态。 |
| 预载军团图后天气资源统计0/16 | 默认Resource Timing缓存容量不足；在测试新profile扩大buffer，保留资源/错误断言。 |
| 默认势力面板引出战斗测试异常 | 测试用普通对象缺`Scenario.monarchOf/city`；改用正式Scenario包装及君主索引，不关闭面板、不删错误断言。 |
| 云雨只读断言跨越update | 改成紧贴draw取证；浮点收尾采用容差，不改变生产规则。 |
| 快照路径分隔符导致模块404 | 证据生成器按Windows路径形态重建；失败轮保留，重新全量验证，不拼接成绩。 |

这些记录是工程调试，不作为新增原机制结论。历史“渐变云／暂停仍播放／只用规则frame／长帧全丢”均已废弃，不再作为实施参考。

## 4. 验证证据与限制

证据公共父目录：`C:/Users/fczll/AppData/Local/Temp/`。每根的`checks.json`及receipts/源码hash才是对应批次结果；临时文件可能被清理，缺失时不可推定仍有效或补造证明。

| 证据根 | 最终执行轮 | 结果／用途 |
| --- | --- | --- |
| `dragon-refactor-phase2/` | full-2 / browser-2 | 非浏览器201通过；浏览器22/24，保留两项3F47失败历史 |
| `dragon-3f47/` | full-2 / browser-2 | 201/201、24/24；恢复漏传闭合 |
| `dragon-march-presentation/` | full-2 / browser-2 | 201/201、24/24；插值/五响/提速；manifest仅CodeGraph后台日志漂移 |
| `dragon-march-markers/` | full-4 / browser-4 | 203/203、25/25；出城/转向/驻守与图片就绪 |
| `dragon-weather-clock-follow/` | full-4 / browser-4 | 203/203、25/25；原PNG、运行慢帧、暂停冻结 |
| `dragon-default-panels/` | full-5 / browser-5 | 203/203、25/25；新局及读档默认展开 |
| **`dragon-release-012/`** | **full-4 / browser-4** | **发布前完整轮：203/203、25/25；另Jev mock 10/10** |

- 最近完整轮非浏览器DRIFT[]，822文件浏览器快照前后及与当前生产/测试源码零漂移，Node语法与diff检查通过。完整轮包含八帧云雨逐像素、规则/RNG不变、存档隔离往返、军团及原规则基线；不等于完整原版战役认证。
- 默认面板初轮full-4通过、browser-4为24/25；上节Scenario夹具修复后从首入口完整重跑，不拼接成绩。
- 较早渐变探索及focused修复证据仍分别留在`dragon-modern-presentation/`、`dragon-white-cloud/`、`dragon-original-cloud/`、`dragon-cloud-animation/`；它们的通过不证明现行外观或暂停政策。
- LSP存在push-only inconclusive、Markdown服务unavailable、部分超大文件超限；无error报告不等于全clean。实际执行/静态检查补充覆盖，不能伪称工具已确认。
- 复用固定入口/I/O白名单、Node/Python权限守卫及fresh browser profile。测试套件包含有意错误/资源失败探针，不能笼统声称全套零console错误；对应专项自己校验预期。
- 适用的跨域重构曾审最小脱敏preview后调用Jev，仅advisory；确定性修复及本次纯文档整理不额外调用。

## 5. 阻塞、后续与交接

- **本次文档整理**：只改项目记忆和本journal，清除旧主线串行前提、过时HEAD/待提交清单、旧P编号流水账及重复的LSP/权限声明；保留本轮失败原因和可定位证据。两份文档的文件链接与围栏检查、git diff --check通过；822个生产/测试快照文件无变化，未重跑游戏套件。Markdown LSP不可用，mode=all无可用缓存，不据此宣称LSP clean。
- **0.1.2发布**：本次用户已同时批准commit/push/Release；审查范围包括此前未跟踪开发工具，但不包含本地运行产物。发布批次另核14个JS语法、文档链接、diff及822个浏览器快照与当前源码一致。14项LSP主动检查均push-only inconclusive，实际测试补覆盖。最终推送/发布状态以GitHub标签、Release及交付回执为准。
- **未实现的扩展**：超过192据点/规则容量、任意道路/城池移动、大地图建筑分层仍未实现。脏层与灾害只读播放器已在后续§6实施；其它扩展不因该批次获得授权。
- **据点整体偏移**：仅评估，未实施。整座建筑在底图内，不同于中心小标识；直接挪矩形会带动地面与道路，需要单独美术分层方案。
- **原证边界**：具体未知/有界围栏看AI全链和各`re-notes`，不把旧日志中的待调查事项自动升级为本轮阻塞，亦不宣称全逆向结束。
- **文档遗留链接**：0.1.2整理时保留了此前已失效的旧§11/13/21–25链接；后续§6已修复导航并明确标注缺失收据，详见[历史缺口索引](historical-receipts.md)。

## 6. RENDER-LAYERS-1：测量、脏层、灾害播放器及断链整理

### 范围与结果

本地实施阶段用户批准按上述顺序执行，当时未授权commit/push；后续0.1.3发布授权见§7。保持原规则、消息/续段、RNG、输入与存档不变；完整合同与模块说明以[表现现代化](presentation-modernization.md)为唯一维护源。

- `render/retainedlayers.js`与`mapview.js`：terrain/objects/environment/ui累积前缀缓存，cursor单独绘制；保留每次GameBar producer调用，静态帧跳过栅格化。连续对象变化/超64MiB名义checkpoint容量回退直绘。
- 状态/path查询在1×1 scratch context录制。消息打开可能同步重入draw：先提交外层命令，再直绘剩余流程，不覆盖外层tape、不重复业务回调。缓存不进入Scenario/存档。
- `render/disasterpresentation.js`：抽出原火灾/暴动资源与只读绘制，保前16槽、原frame、锚点与即时移除；不新增时间轴、延寿、淡出或RNG。原预载导出保留。
- 新测试：`verify_render_layers_browser.mjs`、`verify_retained_layers.mjs`、`verify_disaster_presentation.mjs`；显式加入安全inventory、读白名单和隔离静态快照。
- 8处失效链接改指`historical-receipts.md`。已查51个可达Git历史journal版本及历史指明的两处空备份目录，**七组旧收据路径仍未恢复**；不把导航修好冒作原证恢复。下一步须取得明确备份/证据包，或在实际需要的限定任务内形成新验证收据。

### 测量与失败记录

证据根：`C:/Users/fczll/AppData/Local/Temp/dragon-render-layers/`。合成1024×768页面、192可见据点；稠密组另有128军团、16灾害和16云。7批×20draw，每批含一次像素读回。**不是完整RAF/FPS、低端设备或战役性能认证**。

- 改前`browser-baseline-3`：暂停稀疏DPR 1/1.25/2中位4.31/6.16/10.48ms；暂停稠密6.01/12.17/15.54ms。前两轮分别因夹具资产路径和缺君主字段失败，只修测试。
- 初版每个脏前缀均拷贝全幅，在连续移动时明显变慢；改为稳定后才缓存、变化时直接重放后缀并自适应回退。不以暂停收益掩盖动态开销。
- 最终实现定向`browser-focused-4`的同轮cached/direct中位值（ms）：

| DPR | 稠密暂停 cached / direct | 稠密仅指针 cached / direct | 稠密移动 cached / direct |
| --- | --- | --- | --- |
| 1 | 2.40 / 6.99 | 2.90 / 7.05 | 7.26 / 6.97 |
| 1.25 | 2.36 / 10.22 | 3.40 / 10.16 | 10.45 / 10.13 |
| 2 | 2.66 / 16.20 | 5.95 / 16.04 | 17.15 / 16.74 |

- 暂停收益明显；持续移动约多2–4%开销，不能宣称全面提速。统计受本机负载/读回影响，无性能硬阈值测试。
- 首完整版测试通过后，人工追查`GameBar._drainStrategicMessages→showNpcMessageDialog→view.draw`发现同步重入风险；增加scratch录制与直接提交降级，追加包含save/clip的嵌套像素/回调次数对照。最终版必须重新整轮验证，不沿用旧版绿测。

### 验证与限制

- **最终完整轮：`full-2`205/205、`browser-full-2`26/26通过**，失败0；完整浏览器包含DPR1/1.25/2的cached/direct逐像素、只读输入、resize、动态源、稳定回调与嵌套draw，以及既有天气/TALK71/72、行军、保存隔离和交互回归。不是完整原版战役认证。
- 根目录`checks.json`核对462份stdout/stderr hash；827文件浏览器快照执行前后及与当前源码零漂移。非浏览器manifest的漂移仅为本journal交付追加与CodeGraph后台daemon日志（各有重复路径别名），生产/测试无漂移。辅助统计一度遇shell反斜线与ps参数错误，改用落盘`seal_delivery.py`完成封存，不计为游戏失败或测试通过。
- `full-1`205入口及`browser-full-1`26入口是重入修复前版本，仅留历史，不拼成最终成绩。旧失败/中间测量保留在各自目录。
- 六个JS/MJS语法、本轮55处范围内文档链接及`git diff --check`通过。主动LSP六代码push-only inconclusive、七Markdown unavailable；最终`mode=all`无列出问题，但不据缓存沉默宣称LSP clean。
- 已审最小脱敏change preview并调用Jev，只作UI/浏览器与单测风险建议，不作为机制证据、独立审阅或放行门。未发送源码、原资产、存档或凭据。
- 全部浏览器使用新隔离context/profile、自有port0静态服务；规则测试使用已审入口与权限守卫。套件包含预期故障/网络失败探针，不能笼统称为零console错误。未访问真实SAVE、用户存档/profile；未调整权限/信任/全局配置，未使用子代理。该实现阶段保留本地未提交改动，未commit/push；后续发布批次见§7。

## 7. RELEASE-0.1.3：审查与发布

- 用户明确授权审查全部改动与未跟踪文件、创建完整提交、推送并发布0.1.3。唯一目标为GitHub `tianyi092-jcza/dragon` 的 `main` 与 `v0.1.3`；不推送Gitea `origin`。
- 逐项审查原13个改动/新增文件，保留产品渲染代码、三项测试及必要架构/证据缺口文档；追加`VERSION`、`README.md`、`CHANGELOG.md`版本说明，共16个文件。本批不需要存档或数据迁移，不更改独立规则基线。
- 本地`.pi/`、`.codegraph/`、`.dragon-runtime/`、`.playwright-cli/`、缓存、临时报告及截图不纳入提交；保留文件原位，不清理用户数据，不调整全局配置。
- 发布整理只修改版本与文档，生产/测试源码未再改动；复核§6最终完整轮的462份日志hash与827文件隔离快照，并核对本次六个JS/MJS与其测试时源码身份。沿用该完整轮成绩，不伪称另跑整套；发布补核语法、文档链接、diff及主动诊断，收据位于本机TEMP `dragon-release-013/`。
- 七组历史收据仍缺失，LSP确认范围仍受限；均不隐去或写成完成。Git提交与标签以实际`v0.1.3`为准，推送与Release是否成功以远端回读和最终交付回执为准，不在提交内预写成功状态。

## 8. MAP-ANCHOR-1：据点中心与行军图块锚点更正

- 用户明确批准按原始逆向证据本地修改；没有授权新的commit/push。起点为已发布的0.1.3（`ae3c24e`），本批不改版本号、资产、存档或依赖。
- 用户截图只作线索。补核`2B2A→D4C7→D66A/D804/D796`到渲染记录、MDL/MCH同原点合成及VGA提交，192节点及120军团资源几何也已核对；唯一详细源为[图块锚点证据](re-notes-map-marker-anchor.md)。
- `mapview.js`撤销旧统一(+10,+11)，恢复图块中心(+8,+8)，使城标不再右移2px/下移3px；军团相对道路图案自然偏移，转向不另加坐标。段内定向按2808的X优先修正，仍保留已批准8×movePeriod平滑插值及段末采用规则帧的Web差异。
- 更新三项既有行军测试，新增只读`verify_map_marker_anchor.py`；同步项目记忆、行军表现说明、原证文档入口、外部`re-march-engagement/SKILL.md`，明确废弃旧截图偏移/道路居中结论。`pathfinder.js`仅修正过期资产注释，无算法变更。
- 本轮为已定位的显示修复，不改规则、RNG、消息、输入优先级或存档；按分级验证跑适用测试，不宣称重跑205/26全套。未新增Jev请求或使用子代理。

### 验证回执

证据根：`C:/Users/fczll/AppData/Local/Temp/dragon-march-anchor/`。固定入口、只读原资源白名单、Node/Python守卫及全新隔离浏览器context；未访问真实SAVE或用户profile。

- 最终`focused-2` **12/12**：原字节/资源几何、行军显示与导航、光标、resize、接战、小地图、缓存，以及原生道路移动/到达/调用者/编成；`DRIFT[]`。`browser-2` **4/4**：行军标识、光标吸附、接战、缓存像素对照；行军及缓存覆盖DPR1/1.25/2。
- `checks.json`绑定32份stdout/stderr hash，2288个非浏览器输入及827文件浏览器快照执行后/与当前源码一致；四浏览器入口pageerror、console error、失败请求和阻断均0，所有8个context、4个browser及4个服务端口关闭。
- 五个JS/MJS语法、81处范围内文件链接及`git diff --check`通过。Python实际只读执行通过。主动LSP无列出问题，但按outcomes仅1项确认clean、5项push-only inconclusive、Markdown unavailable；不能称为全clean。最终mode=all的两项Python路径遍历告警来自固定字面量/整数范围拼接，已逐项标为false-positive；无外部路径输入，不为此更改权限或加入无意义兜底。
- `focused-1/browser-1`也通过，之后仅补测试资源URL断言与更正旧资产注释，仍从头重跑适用两组。辅助单行统计曾因变量赋值顺序报NameError，改用落盘`check.py`成功完成；未隐去或拼接测试结果。
- 限制：这是原指令/资源布局及Web显示的有界认证，不是全原版战役或实机像素一致证明；七组历史收据缺口与本修复无依赖，仍见§6。当前保留本地改动，未commit/push。

## 9. BATTLE-TEXT-REFLOW-1：战术双方对白自动折行

- 用户明确批准：战术地图双方武将姓名独占第一行不变，正文从下一行开始按窗口宽度自动折行，不保留原文强制断行。唯一合同见[战术对白显示边界](re-notes-tactical-lifecycle.md#battle-text-reflow-1姓名首行正文自动折行web产品决定)；这是Web产品决定，非新增原机制结论。
- `BattleView.showBattleDialogue`仅在正文DOM赋值时移除CR/LF，保留姓名元素、原捕获/事件/台词/快照、3秒期限、右键及Session推进。窗口尺寸、字体、头像与长文本有界裁切不变；双方和战略攻守互换共用同一路径。保留此前锚点未提交改动，不扩大发布授权。
- 更新`verify_battle_dialogue_presentation.mjs`（两侧、攻守互换、LF/CRLF/CR、输入只读）和`verify_battle_panel_layout.mjs`（正式显示方法、短台词续行、姓名独行、长中文/长token自动折行）。同步战斗SKILL与维护源，撤销旧“原换行保留”的显示说明，原始数据换行契约不变。
- 证据根：本机TEMP `dragon-battle-text-wrap/`；最终`focused-2` **8/8**、`browser-2` **2/2**。非浏览器覆盖对白、命令穿透、开场消息、原消息/快照、clock hold及战略提示框原回归；浏览器覆盖640×400/1024×768/1920×1080布局与既有完整战斗UI验收入口。没有跑与本次显示变更无关的全量205/26。
- `checks.json`绑定20份输出hash、2283个非浏览器输入与827个浏览器快照；测试前后及当前代码无漂移，三JS语法与diff检查通过。使用已审inventory/权限守卫和全新隔离context/profile，无真实SAVE/用户profile访问。
- 布局浏览器初轮把字形墨迹边界当成行盒边界而失败（短正文实际已为20px一行）；改用name/body布局盒核姓名首行，未改产品布局或放宽折行/宽高断言。保留`browser-1`失败，之后两浏览器入口全部重跑，非浏览器亦重跑。最终page/console错误0；战斗入口保留1个开场音频`ERR_ABORTED`（切过开场时发生），不称全请求零失败。所有4个context与唯一服务端口关闭；战斗入口使用persistent context，close由该context完成。
- 主动LSP无语义错误，但存在push-only无法确认及Markdown不可用；辅助诊断仍列5项既有测试风格告警（测试输出console、固定隔离URL和FakeTime布尔参数），非本次新增，不为消警改动无关测试逻辑。最终mode=all一并核对；不称全LSP clean。
- 本次是已定位的单一显示修复，未发Jev或委派子代理；实施交付时未commit/push，版本仍0.1.3；后续发布授权见§10。

## 10. 0.1.4发布整理

- 用户明确授权审查全部已改动与未跟踪文件、完整提交、Release与推送。唯一目标为GitHub `tianyi092-jcza/dragon` 的 `main` 和 `v0.1.4`，不推送Gitea `origin`。§8–9的未提交说明为各自实施阶段历史，不是当前发布限制。
- 审查原15个文件后，保留两项产品显示修复、相关测试及原证/合同文档；追加`VERSION`、`README.md`、`CHANGELOG.md`，共18个文件。无数据/存档迁移，不改规则基线、依赖或许可边界。
- 本地代理状态、缓存、临时截图、运行日志和`dist/`继续排除，保留原位；仓库外SKILL记忆不强行纳入。没有新增子代理、联网辅助评估或真实存档访问。
- 发布整理只改版本和文档，生产/测试源码保持不变。复核§8最终12/4与§9最终8/2的输出hash及源码身份；旧地图快照与当前战斗文件的差异单独核对，并由后续战斗最终轮覆盖，不谎称旧快照整体仍与当前完全相同，也不声称重跑205/26全量。
- 补核八个JS/MJS语法、Python语法、范围内Markdown链接、diff和主动诊断。17路径主动诊断outcomes为clean7、findings2、inconclusive6、unavailable2；五项既有测试风格告警无新增，固定路径误报保留原处置。mode=all另核，不称全LSP clean。战斗开场音频1次`ERR_ABORTED`仍按§9披露。
- 发布审查与索引/远端校验收据保存在本机TEMP `dragon-release-014/`；最终提交以实际`v0.1.4`标签为准，推送与Release状态以远端回读和交付回执为准，不在提交内预写成功。
