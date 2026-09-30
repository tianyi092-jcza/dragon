# AGENTS.md — 臥龍傳 Web 项目记忆

> 本文件只维护长期事实、架构、命令、约定及当前主线。先读[全局AGENTS](../AGENTS.md)：安全、原证、审批与自主执行以其为准。
> [journal](docs/checkpoint-journal.md)只保留当前状态、限定验证摘要与证据入口；版本沿革见[CHANGELOG](CHANGELOG.md)，旧调试流水通过Git历史追溯。机制详细源为相关SKILL/`re-notes`，不在记忆中复制。历史日志不是任务授权或机制证明。

## 1. 边界与当前主线

- 原生JavaScript ES Modules + Canvas 2D重写1995 DOS《臥龍傳》，无模拟器、框架、构建步骤或npm运行时依赖；完整`web/`可由静态HTTP服务独立运行。
- 仓库`E:/Dragon/web-port`；原程序`E:/Dragon/Dragon/`；官方基准`E:/Dragon/原版/`；`上/中/下/后/`为改版库。自动化禁止访问真实`SAVE.DAT`、用户存档/profile；测试用内存、mock或新隔离profile。
- **现行规则主干**：fresh与restore使用v2原生道路/固定表，生产v1路径已删除，不相容槽禁用。原生接线及门后续段已有各自限定域证据，但不据此宣称完整战役或所有原机制均已认证。未知消费点继续fail-closed，保已提交前缀、hold/禁存。
- **当前主线**：已发布`0.1.5`（Git标签`v0.1.5`）；发布号由`VERSION`维护，独立规则基线仍为`web-0.1.1`。存储/内容扩展、地图分段脏层、灾害只读播放器、据点/军团锚点、战术对白折行、G1F评分刷新与普通军师新局初始化已落地。
- **工作方向**：在单一规则/AI/地图引擎上推进已批准的Web工程与表现任务，不以“全逆向完成”为工程重构前提；性能先测量再切片。编辑器与当前游戏统一地图迁移遵循第2.1–2.3节；超原容量、任意道路/城池移动及完整组件分层不能因已有设计而视为已实现或已授权。
- 原机制只依据原指令/原数据/受控原运行态，区分实锤、推断、未知。Web产品差异单列；不凭现代码、测试或体验补公式。容量仍为原运行域，不自动授权超过192据点或改变AI/调度。
- 保留共享脏改；commit、push分别需要明确授权，不调整全局配置、信任或权限来绕过工具限制。发布目标须显式指定：`github`与Gitea镜像`origin`不是同一目标，不能因默认remote误推。
- 只纳入产品代码、测试、迁移及必要文档；本地代理状态、缓存、临时报告/截图、运行产物不入版本库，也不擅自清理。仓库外SKILL不强行复制进仓库。

## 2. 架构与数据流

`原版非存档资料 → 显式离线导入 → Web编辑源 → 校验/编译资产 → Scenario副本 → 保存守卫/快照 → IndexedDB`

模块路径相对`web/src/`：

| 模块 | 职责 |
| --- | --- |
| `main.js`、`app/startflow.js`、`app/battleflow.js` | App装配、标题/开局、战斗接续；新局与读档共用`loadState` |
| `content/`、`game/world.js`、`game/worldresources.js` | 内容/章节/修订身份、Scenario副本、每世界资源实例 |
| `game/navigation/` | 原生道路图、地形/占格能力与规则桥；不用通用Dijkstra/A*替代原寻径 |
| `game/ai.js`、`weather.js`、`autobattle.js`、`legionscheduler.js` | 战略规则、灾害、速算及逐槽调度 |
| `game/native*.js`、`legionphase.js`、`legioncounts.js`、`legioncontinuation.js`、`strategicfailure.js` | 固定原始表、相位/计数、续段所有权、严格恢复与故障暂停 |
| `game/clock.js`、`tacticalclock.js`、`battle/original*.js` | 战略/战术预算、权威Session、RNG、VM、结算 |
| `game/savegame.js`、`core/saverepository.js`、`indexeddbsavebackend.js`、`localstore.js` | 快照/守卫与仓储分离；单档正文及摘要原子写入 |
| `render/`、`ui/`、`game/playerqueries.js` | 只读绘制与表现状态、GameBar/HUD、消息FIFO、纯查询 |

- 逻辑基准640×400；现世界384×256格、16px图块、192道路节点；128军团槽、22正常势力、24×24外交矩阵、256×4B事件轮。哨兵、别名及排除槽有语义，不能把固定循环一律改成数组length。
- `web/content/builtin/`是编辑源，编译产生20章模板及资源；命名state字段为权威，未知兼容字节保留。解析纠错先导入新目录比较，不手改生成物掩盖错误。
- 图集、地图布局、世界资源与道路拓扑分离；画道路不等于建立通路，图块索引也参与规则。地图分块保留非整数DPR的整图采样回退；发布资产不等于跨文件原子事务。
- 新局live `legions=[]`不代表原始表可缺失；显式初始化有来源合同。地图对象前16火灾/暴动、后16雨云，不filter压缩槽号。
- 多档仓储使用同源IndexedDB `wolong-web/saves`；正式保存不是DOS文件或服务端API。目录与单档正文同事务提交，完成前不得报成功。`saves.html`提供隔离管理/JSON备份，`editor.html`只编辑现容量许可字段并导出补丁，不热改运行场景。
- 用户不要求旧Web格式兼容，但这不授权批量清库。新档须完整保存RNG/固定表/调度/能力状态；旧或不相容槽在hover、hit-test、click三路禁用。
- 读档先回标题；detached校验和资源ready后才安装。await后核scenario/world/clock/票据；预检失败不碰live，安装后故障保前缀并禁存，不假事务回滚。战斗、未完成交互/续段/装配/故障均禁存。

既有架构维护源：[基础重构](docs/web-refactor-phase1.md)、[多档/受限编辑/地图分块](docs/web-refactor-phase2.md)、[内容架构](docs/content-architecture.md)、[表现现代化](docs/presentation-modernization.md)。两份“第二阶段”分别指内容扩展和表现升级，不混为同一范围；既有受限编辑器不是下面的完整互联网编辑器。

### 2.1 编辑器与统一地图的文档职责

开展这些模块的设计、实现、审阅或验证前，按任务范围读取以下维护源；本文件只留长期约束，不复制字段表、接口清单、原证或批次成绩。

| 维护源 | 职责 |
| --- | --- |
| [产品设计](docs/game-editor-design.md) | 编辑器及多游戏玩家入口的已确认需求、产品更正与待确认建议 |
| [工程合同](docs/game-editor-technical-design.md) | 原游戏迁移和编辑器共用的数据、编译、加载合同；另含编辑器专属账户、发布、试运行等接口，不能把全部后端功能当迁移前提 |
| [迁移计划](docs/game-map-migration-plan.md) | 当前Web游戏地图改造的切片、差异、验收和退出条件，不是改写DOS原程序 |
| [准入排查](docs/re-notes-editor-map-admission.md)及相关SKILL/原证笔记 | 分层、道路/城市/章节、容量限制的证据与缺口；仍须复核本次影响范围的原始来源 |
| [术语表](CONTEXT.md) | 统一用语，不替代需求、机制证据或技术规范 |

产品决定、工程建议、现有实现、原机制证据与测试通过须分别标识。初次设计补齐或只读排查完成不等于方案已最终确认、迁移完成或任意自建游戏可运行；文档更新不自动授权产品实现、部署、commit或push。

### 2.2 执行顺序与迁移准入

1. **先确认编辑器方案及共同地图合同 → 再迁移并验证当前Web游戏 → 确认无问题后开发编辑器。** 迁移发现合同缺口时回流共同设计；不另设原图专用格式、校验豁免、加载器或第二套规则/AI。
2. 迁移按M0基准/证据核对、M1自动小地图、M2统一源及运行接线、M3隔离真实编辑样本推进。自动小地图是首个可见交付，不等于整个迁移完成；迁移不要求先建设账户、互联网发布服务或完整编辑UI。
3. 在原384×256地图、固定192据点及现有槽域内，已取得的数据保真依据支持受控迁移的可行性判断，**不等于完整拆层、动态更新与同引擎验收已通过**。先核本批依赖，证据不足只暂停受影响机制；任意扩容、新拓扑或完整空白章节不是原槽不变迁移的共同前置条件。
4. 必须证明组件可实际修改、重新编译并由同一入口加载；不得只换包名/ID、重编未变原图或把整图包成不可编辑背景。未知底层保留unknown，副本删除时由作者明确补地形，不猜填、不恢复旧截图覆盖后续修改。
5. 拆层仍保持Scenario的唯一规则地形权威。野战邻域采样、开局着色、易主中心/角块写回须按原证核对；视觉只读投影，季节、脏块、非整数DPR回退及JSON恢复不得丢失写回、重播规则/RNG或反写创作源。旧静态画面不能掩盖本次触及的已证缺口。
6. 原图证书不推广到任意改路/移动城市/增删节点；移动也可能改变编号及战场绑定。未知初始化不补零，不以假城市填槽，不把旧显示计数或不完整connections当完整新章/拓扑权威。具体G-MAP/G-ROAD/G-INIT/G-SLOTS逐项取证。
7. **显示范围、地理寻址、实体表容量分别验证**。扩画布、放宽width或数组length、剩余边/点空间均不证明原引擎支持扩容；坐标字宽、stride、搜索工作区、固定泵/哨兵、天气、战术目录、保存和资源内存须审计。G-CAP未解除不放行超域运行，也不因此阻塞无依赖的原尺寸迁移。
8. 完成标准按迁移计划：无编辑规则字节/有序道路保真、真正修改的隔离组件样本、20章/季节及涉及战术入口、固定RNG已覆盖规则路径、隔离JSON恢复/拒绝、新浏览器实际接入、缓存与迟到资源，以及小地图用户视觉验收。保留来源hash、差异和覆盖限制；自往返不是旧档兼容，离线生成不是游戏已接入，局部通过不是全战役认证。

### 2.3 已确认的编辑器与多游戏边界

以下是后续实现须保持的产品边界，不表示功能已经存在；细节以产品设计对应节为维护源。

- **原件保护**：内置游戏始终上架，管理员也不能通过编辑器直接修改、下架或删除。授权的Web工程迁移与编辑器写权限分开，原DOS资料只读。首个可编辑实例是管理员完整复制的独立测试游戏（地图、据点、人物、势力、全部章节，不含对局/存档）；普通新建仅复制地图/道路/中立据点，不复制人物/势力/章节。复制固定来源修订，不能追踪模板更新；副本编辑、编译、发布、删除不得改写原件或共享资源。
- **共同内核与身份**：内置、正式自建和草稿试运行使用同一源合同、校验/编译与规则/AI/地图加载引擎；仅权限、内容身份和存储能力不同。稳定游戏/实体ID与原运行槽分开，身份独立不代表槽重排已经安全。同游戏章节共用地图，章节维护所属/角色/资源及明确覆盖，不热改运行对局。
- **四层与路网**：自下而上基本地图→地图装饰→道路→据点；装饰可同层叠放/调序，显隐/锁定只是工作区状态。道路/据点不因下层地形种类禁止放置，水陆路型由作者指定，不随水域覆盖自动改变；仍验证引用、连接、断路、禁止的交叉及规则支持域。装饰这个名称不表示无规则作用，显示水域分类不替代原通行/野战分类。
- **自动小地图**：同一地图源自动生成，原/新游戏不保留两套算法或必需手工渐变图；明确河/湖/海地理，保留静态水陆路网，动态军团路线不能代替道路。非水域遮挡不抹去水域摘要，重叠取最上方水域。等比例完整显示、留边不导航，图片/标记/视口/点击共用实际矩形；可用空间足够且有需要时地图区域宽高各增约20%，连同外框/名牌适配。渐变/随机感纹理尽量接近原游戏，生成可复现且不消费规则RNG，最终视觉由用户验收。
- **编辑权限与界面**：指定创作者经独立入口/端口登录，仅管理自己的内容；管理员有全局上下架/限制与删除权限，但不编辑或发布他人内容，内置保护不例外。停用账户不自动下架其游戏。编辑器只要求桌面浏览器，内部界面繁体中文，不自动转换用户内容；工作台允许常规关闭/取消/右键工具菜单。玩家匿名使用，游戏界面的右键/关闭/hold约定不因编辑器而改变。独立端口或新窗口不构成权限、cookie或存储隔离证明。
- **草稿、发布与数据更新**：不完整草稿可保存，试运行/发布按各自依赖完整校验；手动保存拒绝陈旧覆盖，发布绑定精确已保存修订。发布与上下架分开，管理员下架限制不能被作者发布绕过。正式版本逐次1.0、1.1…1.9、1.10递增，不是小数运算；不回滚或复用旧版本。游戏数据保存/发布不需Git推送、服务重启或程序重部署；普通页面刷新发现最新已上架内容。程序更新才走另获授权的既有GitHub→Cloudflare流程，不自行改变部署或放宽技术/依赖约束。
- **隔离试运行**：列表“測試運行”打开新窗口，固定已保存且校验过的草稿快照；可只选完整章节，但必须包含其共享依赖，不能跳过缺失规则数据。只用窗口内存，不读写正式玩家存档、不回写草稿、不发布或通知；新窗口不等于隔离已成立。断网暂停保留内存进度，认证确认失效终止；重新登录须新开试运行，关闭编辑器窗口不等于登出。
- **玩家存档与退出**：存档留在本地按游戏隔离，无玩家账户/云存档；运行会话固定内容版本。下架隐藏新局/读档入口，旧会话可继续并按守卫保存，不清本地档；物理删除与下架不同，仅未上架/已下架自建游戏可删，明确得知删除后提示并确认回初始加载页。版本确实不符才提供当前档的显式确认清理，取消不准许载入；缺身份、网络错误、损坏、下架或删除不冒充版本不符，不批量清库、不把旧档重贴新版标签。

## 3. 当前Web产品约定

- 玩家游戏界面无关闭按钮、羽扇唯一交互开关、右键逐层退回、子菜单地图锁、地图空白左键无功能，详见[全局约定](../AGENTS.md)和[军师UI技能](../.agents/skills/re-ui-advisor-menu/SKILL.md)。强制多步对话右键无效；普通提示可右键/3秒关闭并执行后继。
- 新游戏及从标题读档后默认展开军师一级菜单、势力信息面板、小地图；军师子项未选中，不额外锁地图/hold；原按钮仍可收起。
- 菜单/模态/场景/战斗/装配/鼠标hold取并集，不改速度模拟暂停。地图鼠标移动即暂停，连续静止1秒释放自己的hold；输入锁与物理区域识别分开。
- 战略五档60/35/20/10/3.125ms，每RAF最多6次完整更新、每步检查hold；战术最多一个完整帧，不补后台债务。战略与表现时钟不能互相代替。
- 行军按8×movePeriod插值；城标/军团共用原图块中心(16x+8,16y+8)，不补偿到道路视觉中线，证据见[图块锚点](docs/re-notes-map-marker-anchor.md)。显示段按X优先定向、结束才采用下一方向/驻守帧；绘制不改路线/RNG。六队全骑周期2、其余3的规则不变。接战30ms换帧、60ms发声，每段连续共享接触最多五响；详情见[行军表现](docs/march-presentation-fixes.md)。
- 云雨直接使用原完整八帧PNG，不画渐变云或额外雨丝；独立表现时间100ms换帧、平滑位移，**随战略计时暂停/恢复**：speed<=0或任何hold时位置和雨丝均冻结，后台/场景退出亦冻结。可见慢帧限量推进，不整帧丢弃至永久停动画；细节见[表现合同](docs/presentation-modernization.md)。
- Canvas backing store仅尺寸/DPR变化时重建；地图分段缓存只跳过栅格化，不跳过GameBar布局/消息drain；连续移动或超容量回退直绘。灾害播放器只读原槽/frame，无新时钟或延寿。详见[表现合同](docs/presentation-modernization.md)。
- 列表右侧滚动条、24px表头、墨绿色`#4a7828`选中；排序绑定原对象。
- 自定军师`{custom:true,general_idx:null,name,hao,portrait}`；军师化身排除普通任官/编成/自动出征。统一后留在地图、不播D7END；信赖归零/玩家灭亡仍GAME OVER。
- 系统菜单：保存、读取、音效、战略速度、战术速度、退出。音效TYPE1→2→3→4→关闭调CF9；OFF停BGM，不禁PC/FM效果。战术对白不暂停Session；姓名独占首行，正文仅在DOM移除CR/LF后按宽度折行，原捕获/消息/快照不变。见[对白合同](docs/re-notes-tactical-lifecycle.md#battle-text-reflow-1姓名首行正文自动折行web产品决定)与[战术规则](docs/re-notes-tactical-rules.md)。
- 独立开场原生动画/单次MP3，会话刷新/读档直达终场；具体音乐与弹窗边界见[开场维护源](docs/opening-scene.md)。

## 4. 重要坑点与证据入口

- canonical `OriginalBattleRng`启动RTC播种一次，新局/标题不重播种，读档恢复；禁Math.random兜底。战术回写同一RNG后续战略；输入→A426 VM→A065帧，消息/RNG不能重播。见[战斗技能](../.agents/skills/re-battle-command/SKILL.md)。
- 每更新1据点/16军团，槽动作→日结→03尾→余槽/天气；退场当前槽仍完成尾段。native表唯一持有记录，live/delayed是同对象视图；0B/1E零值、独立03、F14及inactive/未知槽不能被“清理”。generalIdx、slot、leader不可混用。见[行军技能](../.agents/skills/re-march-engagement/SKILL.md)。
- `_march`不能覆盖原0A/0C/0E或消除残值；地址、节点id与字宽区分，CF1不一律无路，未知RAM不补零。工程拒绝不能伪造原版blocked。
- 六队原值及战前BP列表是权威，不合并军团、不用synthetic city替代守军。双方战果先提交再各自474A，失败保前缀；撤退不传送，初值48不等于固定等待48次。见[战后技能](../.agents/skills/re-post-battle/SKILL.md)。
- 战争关系、势力目标、军团命令分开；玩家未完命令优先，委任不能覆盖。消息返回有续段/付款/互俘边界，不假回滚。见[外交技能](../.agents/skills/re-domestic-diplomacy/SKILL.md)、[消息ABI](docs/re-notes-strategic-message-abi.md)。
- 存档恢复须贯穿传递road/movement/terrain/cityCache能力，不能靠重新合成掩盖漏传。JSON会丢undefined、非有限数变null，structuredClone不替代真实JSON往返。地址不等于SAVE偏移，内部十人单位不等于显示人数，MMAP透明用独立mask，索引0可是不透明黑。见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- BGM FLAC来自软件OPL3，不是实机录音；无损不保证无缝或低解码内存。部署/版权见[README](README.md)，旧日志不证明再分发许可或远端状态。
- 原证总入口：[AI全链](docs/re-notes-ai-chain.md)、[行军](docs/re-notes-march-pathfinding.md)、[去向](docs/re-notes-legion-fate.md)、[财政](docs/re-notes-ai-fiscal.md)、[外交](docs/re-notes-ai-diplomacy.md)。文档中的旧批次、历史v1说明不代替当前代码及原始证据。

## 5. 常用命令与验证

仓库根执行；先审入口、依赖和I/O，命令清单不是扩大任务/安装/部署授权。

```bash
python -m http.server 8321 --directory web
unset PYTHONOPTIMIZE
export PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1
python -B tools/compile_content.py --output /path/to/new-generated  # 需Pillow；不要覆盖共享目录
python -B tools/verify_content_pipeline.py
node tools/verify_content_catalog.mjs
node tools/verify_world_resources.mjs
node tools/verify_start_flow.mjs
node tools/verify_legion_slot_phase.mjs
node tools/verify_legion_slot_battle.mjs
node --test --test-reporter=tap tools/verify_native_formation.mjs
node --test tools/verify_road_field_authority.mjs
python -B tools/verify_map_marker_anchor.py  # 固定非存档原资源，只读锚点/像素布局核验
node tools/verify_weather_presentation.mjs
node tools/verify_disaster_presentation.mjs
node tools/verify_retained_layers.mjs
node tools/verify_render_layers_browser.mjs
node tools/verify_weather_browser.mjs  # 已有Playwright；可指定PLAYWRIGHT_MODULE
node tools/verify_legion_lifecycle_browser.mjs
node --check web/src/main.js
git diff --check
```

- 全部变更检查实际diff、支持文件的主动LSP、`lens_diagnostics mode=all`、`git diff --check`。unavailable/inconclusive或空缓存不代表clean；工具自动格式化后核字节漂移。
- 纯文档检查链接、职责/规则一致性及元数据，不跑无关游戏回归。规则/数据/工具跑focused；共享调度/RNG/存档/跨模块状态改变须完整安全回归。UI用新profile核流程及console/page/request错误；保存额外测守卫、往返、事务失败。
- 全量先固定显式入口/依赖/源码及I/O白名单，再串行执行入口；禁止verify_*通配或把历史通过当本轮证明。新测试进入inventory、权限白名单和快照。只能关闭自有监听/profile，不碰真实档案或共享dist。
- 验证绑定实际SHA，保留失败轮；后续源码漂移先核差异再重验，不拼接成绩。UTF8日志、明确reporter；Windows复杂路径用落盘脚本，检查manifest分隔符；脚本不得覆盖已封存证据根。
- 子进程仅传必要环境白名单，不转储凭据；LF/CRLF warning不等于diff检查失败。原窗口、同引擎往返、首批及完整战役证据分开陈述。

### Jev开发期辅助（非运行时依赖）

- 仅advisory，不是机制证据、测试oracle、审阅替代品或放行门。跨规则/存档状态/时序RNG/UI浏览器/工具测试等多风险域的实际diff，或验证有明显遗漏风险时用`change`；失败经直接诊断仍有多种归因时用`failure`。
- 逆向先取得原始事实；仍有多个调查方向/关键证据缺口时用`reverse-triage`选探针，不让模型计算指令、字宽、公式或判机制。确定性证据已唯一定位、纯文档、明显语法/导入问题无需调用。
- 固定流程：人工最小文字→不联网preview并审最终state→确认无禁发信息及TYPESAFE_API_KEY可用→`--send`。适用范围已有持续授权；缺key/失败/不宜外发则说明，不阻塞权威验证。
- 禁发原版资源、真实存档/profile、凭据、个人信息、私密issue、未审完整日志或大段源码；不得把结果直接用作命令/路径/自动改码输入。
- `node tools/jev_assess.mjs <change|failure|reverse-triage> --input -`，审过后才加`--send`；详见[集成文档](docs/jev-integration.md)。
