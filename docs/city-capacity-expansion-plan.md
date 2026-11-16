# CITY-CAPACITY-1：固定地图下的据点扩容开发计划

> **状态：C0进行中（字段审计与合同细化）；运行扩容尚未实现。** 本文是本任务的设计、任务和接续维护源；实施收据写入[检查点日志](checkpoint-journal.md)，不要把勾选或设计本身当作运行证据。
> 基线：`c3efb05 feat(editor): add map pan lock and city group previews`。制定计划前工作区干净；本轮仅新增／更新文档，没有改代码、生成物、真实内容或存档。
> 用户决定：最终使用重构后的独立Web代码，逐步解除人物、据点、道路及地图的旧容量限制；本期先保持384×256地图，突破192据点限制。用户要求先基于代码详细设计，再按建议制定开发任务，实施转到新对话。

<a id="handoff"></a>
## 1. 新对话从这里开始

1. 先读父目录`E:/Dragon/AGENTS.md`、[项目AGENTS](../AGENTS.md)、本文和[journal当前状态](checkpoint-journal.md)。核对HEAD、实际diff，保留本计划文档及其它会话改动；不要假设仍然干净。
2. 本任务当前第一项是 **C0：补全逐字段影响矩阵和具体Web差异合同**。已有主链代码核查见§3，不必重新从“能不能超过192”开始讨论，但必须重读将修改的源码。
3. 按§6依赖推进。第一项运行里程碑是**旧192图通过新结构的同一运行链**，然后是**第193城完整生命周期**，紧接着验证**257城**；193不是新上限。
4. 据点组已有四张只读预览，不要重做素材、布局、锁图或再询问“新增实体还是绑定已有据点”：本任务方向已是新增真实据点。绑定／替换既有据点外形不是新增城的替代验收。
5. 不创建第二套生产AI／寻路／游戏引擎；不把“原图继续旧引擎、新城另走简化引擎”当作方案。旧逻辑可作隔离对照工具，迁移未通过前不提前切换生产准入。
6. 不自动commit、push、部署、迁移真实数据或访问`E:/Dragon/Dragon/SAVE.DAT`／用户浏览器profile。现行Trial HTTP接口仍退役，不借本任务重开。
7. 没有会话goal工具状态需要恢复；不要因本文叫开发目标就自动创建goal。实施中每个批次记录任务ID、文件、测试、限制及下一入口。

**可复制到新对话的启动请求：**

> 请执行 `docs/city-capacity-expansion-plan.md` 的 CITY-CAPACITY-1，从C0开始，按依赖推进本地实现与验证。地图保持384×256，先让旧192图进入统一新结构，再贯通第193城和257城边界。保持单一引擎，不扩大为人物／地图整体扩容，不访问真实SAVE或用户profile，不提交、推送、部署或迁移真实数据。涉及尚未明确的游戏行为时，只提出该项具体决策，不重复询问已确认方向。

## 2. 范围与决定

### 2.1 本期必须达到

- 据点资料、地图放置及章节不再强制恰好192城／原192坐标；支持新增、移动、移除放置及受引用约束的资料删除。
- 新据点能配置章节、连接道路、作为首都／目标，参与治理、财政、预算、灾害、AI、行军、战斗、占领、迁都／灭亡判断和保存恢复。
- 据点身份、运行索引、战场资源身份分离；城市相关引用不再受byte、254／255哨兵、DOS指针或固定内存分区约束。
- 原有内容和自建内容最终共用校验编译、加载和运行模型，不按gameId选择规则。
- 配套的道路节点／边／点存储解除原地址分区容量；并不因此开放未设计的交叉、任意端口、地形机制或地图扩边。
- 据点组从只读展示接入真实创建流程，保持25／9／3／3格与中心锚点，见[据点组合同](map-city-group-contract.md)。

### 2.2 保持及非目标

- 世界384×256、原点(0,0)、16px格；本期不扩宽高或负原点。数量仍受合法落点、引用约束与实际资源预算限制，不承诺无限内存。
- 人物、势力、军团数量和战术单位容量暂不扩，但它们指向据点的字段必须改造。
- 不顺带重写战斗伤亡、经济数值等无关规则；不批量删除`original*`模块或简单全仓替换192／255／位运算。
- 原始DOS数据、来源SHA及冻结历史不变；不向原byte塞入大编号，不伪造新增城的32B原始记录。
- 保留copy／publish／formal隔离、权限、epoch／Origin、检验票、删除栅栏、存档事务和异步安装守卫。
- 玩家／共同核心继续无框架、无npm运行时依赖；Vue只接DTO与动作，不接live Scenario／地图源。
- 不自动支持旧Web存档迁移；旧内容或格式不适配时明确拒绝，不伪装旧身份，也不据此自动删除用户数据。

### 2.3 已采纳的设计方向与尚须具体化的细节

用户“按你建议制定开发计划任务”采纳上一轮建议作为计划方向，不等于以下细节已经实现或获得原版机制认证：

| 方向 | 本计划采用 | C0仍须具体化 |
| --- | --- | --- |
| 战场 | 新城显式选择／复用既有战场模板，资源只读共享，战斗状态独立 | 可选模板目录、适配校验、选择入口及缺项提示；不猜默认战场 |
| 据点节奏 | 随据点数分配更新批次，避免城越多单城治理越慢 | 周期、整数分配、跨批相位、消息暂停后接续；192城时的顺序等价 |
| 不可达 | 返回明确Web状态，不沿用可被误读为道路地址的返回值 | 玩家命令、AI、返都、战后撤退四类caller各自的后续；禁止自动瞬移／消灭 |
| 事件容量 | 结构化排队，不因旧固定页满而静默丢弃 | due时间、同刻顺序、跨月、拥挤时派发节奏及保存合同 |

初态默认值、内存别名的替代语义、异常费用域等也须形成具体合同；需要新增产品行为时只确认受影响项。不得把长期“独立引擎”目标解释成任意改公式授权，也不得用旧192支持域否定用户本次扩容任务。旧文档的固定域描述仍是当前实现事实，实施通过后才更新为新能力。

## 3. 已完成的代码主链核查

以下来源以基线`c3efb05`为准，行号仅定位；是**当前代码事实**，不是本轮重新逆向的KI结论。CodeGraph已用于定位并读取主体，部分常量和接缝以定点源码读取补充；尚未完成所有读写者的穷尽审计。

| 区域／源码 | 已确认的具体限制 | 任务归属 |
| --- | --- | --- |
| [mapcompile.js](../web/src/content/authoring/mapcompile.js) `validateMapSource` | placements固定192，原道路编码384边／6144点预算；端口与分层合成校验 | C1、C2 |
| [gamesource.js](../web/src/content/authoring/gamesource.js) `validateGameSource` | cities固定192，runtimeSlot限0..191；`writeFactionField`将capital写回raw byte | C1、C4 |
| [cityrecords.js](../web/src/content/authoring/cityrecords.js) `captureCityDefinitions` | 作者据点绑定固定槽和范围 | C1 |
| [trialcompile.js](../web/src/content/authoring/trialcompile.js) `compileGameSource` | 固定原XY／CB..D3扫描顺序；道路绑定重核；章节raw坐标和邻接核对 | C2、C5 |
| [chaptermaterialize.js](../web/src/content/authoring/chaptermaterialize.js) `materializeChapterState` | 遍历固定CHAPTER_BASE城市，新增城无对应raw；fresh依赖nativeCityRecordRaw | C4 |
| [roadedit.js](../web/src/content/authoring/roadedit.js) `encodeRoadGraphV2` | node×8、edge=0x800+id×16、四槽tag；成本为byte，固定点区 | C2 |
| [originalroadmemory.js](../web/src/game/navigation/originalroadmemory.js) | 192节点／64KiB图内存，低32KiB与搜索区分区，点和边共享地址域 | C2 |
| [originalroadsearch.js](../web/src/game/navigation/originalroadsearch.js) `searchOriginalRoadMemory` | 0x8000访问区、128项物理环、byte队列计数、node<0x600才读取城市归属；费用有word语义 | C2 |
| [originalroadarrival.js](../web/src/game/navigation/originalroadarrival.js) | city指针换算；`aliasedByte`可跨势力、外交及城市缓存域，不能仅把数组加长 | C0、C3 |
| [originalcity.js](../web/src/game/navigation/originalcity.js) `runOriginalCityMilitary` | 16项Uint8Array工作表，254／255为威胁／空项；候选与邻居引用采用byte | C3 |
| [ai.js](../web/src/game/ai.js) `aiTick`／`finishStrategicCityUpdate` | 索引<192，游标%192；每城军事→治理／损害→一次军团批次，不能循环整aiTick扩城 | C3 |
| [main.js](../web/src/main.js) `onStrategicTick` | 每更新传入一个城市游标及军团批起点，消息／战斗有接续边界 | C3 |
| [originalcitycapture.js](../web/src/game/navigation/originalcitycapture.js) `captureOriginalCity` | 城索引最大191；n_cities增减&255；迁都／灭亡／重绘／邻接后继 | C3、C4 |
| [nativefactions.js](../web/src/game/nativefactions.js) | capital、战略据点引用及n_cities校验为byte，raw初始化会重新投影 | C4、C5 |
| [originalformation.js](../web/src/game/navigation/originalformation.js) `createOriginalLegion` | 首都byte／<192、首都×8写军团位置 | C3 |
| [originalsiege.js](../web/src/game/navigation/originalsiege.js)／[battleprojection.js](../web/src/game/battle/battleprojection.js) | 城指针推D34；`createSiegeProjection`用city.idx选择战场 | C4 |
| [originalfieldbattle.js](../web/src/game/navigation/originalfieldbattle.js) | 速算用d34<0xc0判据点损害，不只是加载图的问题 | C4 |
| [originalfieldterrain.js](../web/src/game/navigation/originalfieldterrain.js) | 野战目录占0xc0起的编号域；与新cityIndex必须解耦 | C4 |
| [scenariocitycache.js](../web/src/game/navigation/scenariocitycache.js) | 192缓存／known表，fresh从192条raw取初态；缓存寿命不能随意改为实时重算 | C3、C5 |
| [scenarioassembly.js](../web/src/game/scenarioassembly.js) `prepareScenario` | 只接道路v2、固定城市表、逐槽城／节点同坐标，关联多个能力快照 | C5 |
| [savegame.js](../web/src/game/savegame.js) | 邻城四byte、首都byte、城市游标与规则状态、道路及能力快照 | C5 |
| [gamecopy.js](../server/gamecopy.js)／[copyprofile.js](../server/copyprofile.js) | 据点模块主要改名／数值；章操作cityIdx多处限0..191，保存与校验路径均须改 | C6 |
| [systembasemap.js](../server/systembasemap.js) | 模板profile明确固定384×256／192，模板与游戏创建也须迁移 | C6 |

已定位但仍须逐函数补全调用／读写矩阵：`originalmonthlyfiscal/scenariomonthlyfiscal`、`originalmonthlybudgets/scenariomonthlybudgets`、`originalweather/scenarioweather`、`originalcapitalrelocation`、`scenariolegionfate`、外交／接见消费者及UI查询。它们包含固定城遍历、指针和byte参数；不要以搜索命中数冒充影响文件数或全部清零证书。

**事件具体接缝**：[originalweather.js](../web/src/game/navigation/originalweather.js)的`originalCurrentEnqueue2FBF`检查当前页offset<0x100，满则返回未插入；[originalevents.js](../web/src/game/navigation/originalevents.js)按四byte槽消费，游标达到0x100结束当前页。总事件存储与当前页容量不是同一概念，不能只把256条表扩长就宣称事件可扩展。

原始机制来源索引：[准入原证§3–4](re-notes-editor-map-admission.md)、[行军SKILL](../../.agents/skills/re-march-engagement/SKILL.md)、[数据SKILL](../../.agents/skills/re-data-formats/SKILL.md)。本轮未重新运行CPU证书／原二进制验证，不新增“原版支持扩城”的结论。

## 4. 目标合同草案

以下是拟议字段／接口方向，不宣称现有文件已实现；C0应完成具体schema及不变量，后继正文在本维护源收敛，不散落竞争版本。

### 4.1 身份与作者数据

```text
游戏级CityDefinition(cityId)
  ├─ 地图Placement(cityId, 坐标, 外观实例)
  ├─ ChapterCity(cityId, 所属及章节数值)
  └─ battleMapId（独立战场资源）
           ↓ 同一编译器
cityOrder → cityId↔cityIndex（0..N-1）→ RuntimeWorld / Scenario
```

- cityId永久、不因改名或移动变化、删除不复用；源与API用ID，编译内部可用紧凑整数。不新造以名字／坐标为身份的模型。
- 原runtimeSlot只留导入溯源。cityOrder导入保原顺序，新增追加；不受表格排序／地图扫描影响。删项后统一重编全部引用，不热换旧对局。
- 名称、类型、最大生产力、四项新章默认值继续归游戏主表；章节按[据点合同](editor-city-definitions.md)及[章节合同](chapter-and-base-resources.md)管理所属与五项现行设置，不擅改为全字段继承模型。
- 坐标由placement唯一写入，列表／运行表只投影；未放置资料可存草稿。确定哪些未放置定义不进入运行包及如何报告章／道路引用，不能保留假节点填槽。
- null表示无引用，不再用254／255或DOS地址表示城市；人物／势力本期仍有原容量，但指向城市的字段需独立类型。
- cityIndex、city数量、引用不使用&255／&65535截断；兵力、士气等规则数值范围不因身份扩容自动变化。

### 4.2 道路与军团位置

- 结构化节点／有序端口／边／点列；端点与道路内部点分离。保已确认道路交叉、端口、移动后待重连及草稿／发布两级门。
- 位置明确区分`{kind:'city', cityIndex}`与`{kind:'road', roadIndex, pointIndex, direction}`，当前位置、玩家目标、即时撤退目标不可混为一个字段。
- 去掉node×8、edge地址和point地址作为业务身份；动态队列和访问表不得覆盖其它记录。费用语义与身份容量分别处理，不能顺手删所有word运算。
- 先结构化现有分批搜索／顺序，**不默认换Dijkstra／A***；在旧图和受支持费用域逐项对照。超原域、费用回绕、耗尽、别名行为列明Web差异，不把旧RAM怪值延伸为新规则。
- 不可达返回结构化结果。各caller如何处理需闭合：普通下令、AI派令、返都、战后撤退不能共用一个未经确认的“取消／灭亡”兜底。
- 当前模板仍四向最多四门／关卡双门；图表示不靠四个word锁容量，本期不因此开放更多门或新路口机制。

### 4.3 初始化、统计、调度与事件

- 新城使用具名的CityInitializer合同：基础数据、章节值、城兵上限来源、无军团初态、冷却、灾害、归属记忆、邻接与边界。必填缺失报告，不复制旧城raw或统一补未知为0。
- n_cities采用整数，明确权威与更新事务；建议以实际归属为基础初始化并可核对缓存。原导入计数与实数分歧必须记录为Web迁移差异，不能伪称原样等价。
- C18类带规则寿命的缓存与可重建显示缓存分开；扩数组不自动授权改成实时统计。跨记录别名逐项归入显式语义或待决定项，不能把原RAM扩大模拟作为最终方案。
- 据点批次与军团批次分开：按N调整每次据点工作量，基准周期中覆盖全部N城，192城保持原顺序；整个战略更新只执行应有的一次军团批次。具体整数分配和保存相位在C0确定。
- 消息暂停必须从正确城市／子阶段接续，不重复治理、RNG或军事动作；持有hold与禁存沿现有合同。
- 事件采用明确type、目标引用、due及同刻序；无城市伪地址或固定页静默丢弃。时间分桶、延迟随机消费、月移页迁移、拥挤派发和去重规则须具体设计，不能以“动态数组”代替时序合同。

### 4.4 战场、显示、保存及版本

- cityId→battleMapId独立绑定；原城保来源关联，新城显式选择。多城可复用只读战场定义，战斗对象和损害回写只属于本次目标城。
- siege／field为明确战斗类型，不通过目录号<192判断；同时覆盖速算、战术初始化、城损、退出、守军及后续占领／撤退。
- 地图中心由实体确定，不扫描中心tile生成城ID；美术部件、端口、拓扑与规则地形仍分开。归属变色需核中心和相关外围写回，不宣称“原版只改中心”。
- 新源schema、编译器、运行包／道路格式、装配及存档版本显式升级，不冒用冻结profile／digest或简单放宽旧校验。
- 存档绑定内容／世界／索引表／拓扑身份，持久化必要位置、目标、规则缓存、调度相位、事件和RNG。真实JSON往返、detached恢复和安装守卫不变。
- 内置及已有Web源先转换到新目录、报告差异；不自动改生产copy或用户档。旧运行格式退出生产路径要有切换清单，过渡代码不成为永久双引擎。

### 4.5 编辑与服务边界

- 据点组放置作为一命令：创建真实cityId／中心placement／外观部件／门端口／组合关系；取消零写、撤销完整，服务端受限命令重验。
- 组合25／9／3／3格，素材预览80×80／48×48／48×16／16×48，旧单格仍32px；中小都市／战场共用外形不合并规则类型。
- 拆组仅解除编辑分组；中心仍是据点，门仍是端口。拆／删门不能留隐形通路；有关道路标待重连，不自动补路。
- 地图移除保资料及章配置，引用清单遵现有删除合同；资料删除须处理placement／道路／首都／章节引用，不静默级联。
- 现有copy模块写入不能承载多份互相独立的半次创建：设计单一受限事务／提交写集，保持鉴权、epoch、Origin、删除栅栏；不借机恢复旧draft CAS架构。
- 系统模板、普通创建、完整复制均使用同一新地图合同。源为模板不等于有章节；共享资料与章初始化按各自职责处理。

<a id="tasks"></a>
## 5. 任务总表

状态仅用：未开始／进行中／待具体决策／待验证／完成。**C0/C1进行中：C1身份、源片段校验／离线转换及章节城市片段编译已实施，完整源未接线；C2已实现结构化道路运输投影及隔离寻路对照，尚未接移动／装配；C3已实现D1/D3、D5主动迁都及军事候选类型化子项，仍限旧运行准入；C4攻城资源身份／战术入口解耦子项已实施；C5–C9未开始**。C0首批实际源码审计及待决合同见§9。已有§3定位不等于C0完整审计完成。

| ID | 任务 | 前置 | 完成门槛 |
| --- | --- | --- | --- |
| C0 | 读写影响矩阵、schema及Web差异合同 | 无 | 入口→字段→消费者→写回／保存全覆盖清单；待决项具体化 |
| C1 | 稳定据点源模型及旧源转换 | C0相关合同 | 动态集合／引用、确定编译顺序、隔离迁移差异 |
| C2 | 结构化道路、寻路、军团位置 | C0、C1 | 无城市／道路地址上限；旧图选边／移动对照及不可达caller合同 |
| C3 | 据点运行、调度及跨模块引用 | C0、C1、C2 | 动态AI／治理／编成／捕获／迁都等，不漏城不截断 |
| C4 | 章节初态、财政／事件、战场绑定 | C0、C1；接线依赖C2／C3 | 新城无需伪造raw；完整月界／战斗／回写接续 |
| C5 | 编译产物、装配、保存及旧192迁移验收 | C1–C4 | 旧192图走统一新运行链；JSON冷恢复与拒绝门通过 |
| C6 | copy／模板／发布的受限保存接线 | C1、C5 | 数据操作完整持久化、票失效／审批／正式加载一致 |
| C7 | 据点组创建／拆散与资料UI | C6及对应命令 | 四模板实际创建、配置、保存重读、撤销及引用错误可见 |
| C8 | 193／257及规模全链验收 | C5–C7 | 下表验收全部有本轮证据，不能只通过显示或数组单测 |
| C9 | 收敛、文档、旧路径退出及交付审计 | C8 | 无生产双轨；差异／限制／测试证据完整，授权边界保持 |

## 6. 可执行检查清单

### C0：先闭合合同，不先删保护门

- [ ] 建立逐字段矩阵：原字段／语义／源权威／新类型／所有读写者／初始化／存档／消息后继／测试。至少覆盖cityId／idx、首都、目标、邻居、n_cities、事件参数、D32／D34、C18、城市游标和道路上下文。
- [ ] 追完§3尚未穷尽的财政、预算、灾害、外交／接见、武将去向、迁都／胜负、UI查询及发布消费者；区分byte值、图块号、状态码和据点身份，不全局替换常量。
- [ ] 定义版本升级表、cityOrder、节点／端口／边schema、位置联合类型、事件schema及存档字段；明确检查在边界完成，不向内层重复塞防御校验。
- [ ] 为§2.3四方向写具体时序／失败示例；列出跨记录内存别名、费用异常、初态缺项的具体Web处理提案，需要行为决定时一次性针对性确认。
- [ ] 登记测试入口和I/O白名单、原192基准的可复核来源及允许差异。未闭合原机制只暂停相关保持项；可独立实现的纯数据合同继续。

### C1：源数据与确定性转换

- [ ] 扩展稳定ID据点字典、cityOrder、placement关联、章城市引用及独立battleMapId，草稿／发布验证分层。
- [ ] 将原slot／raw定位退为来源信息，转换全部相关引用；导入unknown保原证，不拿新增城数据伪装原raw。
- [ ] 旧源→新独占目录转换，父表／章覆盖／道路／战场／来源映射逐项核对；输入不改、重复输出确定性一致。
- [ ] 零城草稿、少于192、193、257，缺ID、重复ID／中心、断章引用、重排／删除后的映射均有正负控；可运行最小章条件单独验证。

### C2：道路与位置

- [ ] 解开图编码、roadgraph查询、Scenario道路上下文、军团节点／边／点序列及保存投影的地址依赖。
- [ ] 结构化搜索保正常域次序与费用，动态工作队列；不再用tag地址区间／byte计数识别节点。
- [ ] 下令、边内改向、换边、接敌倒数、到城、改属阻挡、返都／撤退的写集与后继全部接新位置权威。
- [ ] 原192图逐路线对照；新增节点、回路、等费用、断连、旧队列容量外样本及超过原边／点存储预算样本验证；费用溢出与特殊返回须按C0批准合同测试。

### C3：动态据点运行

- [ ] 替换军事候选byte表、城市引用及统计截断；保本期非城市数值规则和未改RNG消费。
- [ ] 改治理／城损／邻接／占格缓存、首都编成、目标分派、易主／迁都／灭亡／统一及去向引用。
- [ ] 实现据点批次调度；192城顺序不变，193／257同周期不漏不重；一次战略更新不重复军团批次。
- [ ] 玩家消息／战斗挂起后从准确子阶段恢复，旧回调不写新Scenario；状态失败保持正确前缀、hold和禁存。
- [ ] 对索引254／255／256分别测试候选、目标、首都、邻接及计数，不能只测数组长度257。

### C4：初态、事件与战斗

- [ ] CityInitializer逐字段具名来源和缺项诊断；全章共享资料与章覆盖一致，不从第一章反复回填覆盖作者值。
- [ ] 财政、预算、灾害、外交关联城市遍历动态化；占城统计和导入分歧有显式转换报告。
- [ ] 事件生产、调度、消费者、消息返回和存档一体改造；覆盖大量同刻事件、跨月、暂停恢复及无静默丢失。
- [ ] 战场资源建立独立ID；攻城／野战类型从目录编号解耦，速算和战术城损都写回正确目标城。
- [ ] 原城逐一保战场对应；新增城共享模板互不污染；缺战场拒发布；索引256城完成攻城、退出与占领。

### C5：统一编译／运行／保存与旧图里程碑

- [ ] 同一compileGameSource生成动态城市、道路、章初态、战场绑定、资产及索引摘要；取消固定门必须由新不变量替代。
  - C5-1（已接，§146）：计数／位置权威改由地形扫描推导——`validateGameSource`城数1..512、槽位dense、`chapterActiveGaps`两锁同改、`applySharedCityData`同契、`trialcompile`以nodeScan为位置权威（槽序＝扫描序）、`encodeRoadGraphV2`显式拒257+（v3编码另行）；章raw／拓扑门保留，新城仍在章覆盖处fail-closed。呈現層`chaptergapreport`同步新訊息（空章斷言改/512/）。
  - C5-2（已接，§147）：`compileGameSource`输出新增`compileSourceIndex`的`cityIndex`（dense槽／cityId／坐标，扫描序已验证）与`chapterDigests`（逐章state规范摘要，JSON稳定，供C6按章失效）；`battleMapId`绑定表不发射——`game.cities`无该字段是schema事实（C6作者模型工作），不虚构占位。章初态切片（`compileChapterCityState`的initializer／factions[22]形）仍未接线：`game.chapters[].state`是raw记录形，无新形数据可编，属C5剩余。
  - C5-3（已接，§148）：M192里程碑——真实内置192城（game-source.json＋同修订roads.json，节点坐标192/192命中真实城市，槽位dense）走统一链：`compileGameSource`索引与真实路网逐槽一致；fresh装配192城、末城归属1、缓存0、真实图索引搜索found且旧地址读永不触发；JSON快照／恢复往返保留192表。新`verify_m192_unified_chain`3/3。行军／治理／月结／速算／战术／占领的行为覆盖仍由既有分套件承担（合成图），本项锁定真实地图的一致性入口。
  - C5-5（已接，§150）：257城完整savegame-store往返——合成257城v3 fresh装配→`snapshotState`→`saveJSON`→`createGameSaveStore`内存店put/get（文本逐字节一致、记录deepEqual）→`admitSavedScenario`（data取`{scenarios:[template]}`，`prepareFresh`新增返回`template`）→prepare restore→257城／末城归属1／缓存0。新用例一次通过，admission 6/6。无产品代码变更，测试-only，不重建bundle。
  - C5-6（已接，用户2026-11-18批准M192后开放）：v3新内容进入共同可玩准入——合成257城v3正式包（schema2／studio-app-3／native-road-v3 role）→`loadPlayerPack`→`createPlayerEnvironment`→`loadRoadGraph`(v3,257节点)→prepare fresh（257城、roadVersion 3）→`assertPlayableScenario`放行、末城归属1、缓存0。新`verify_player_v3_pack_playable`一次通过（loadTerrain按真实网格维度门配96KB地形／代价＋空偏移表夹具）。canPlace翻转未动（无cityId签发路径，翻开即半开）。
  - C5-4（设计，§149）：剩余三项分解——(i)玩家包准入：`playerpack.js:10` role表＋`:69` schema/buildFormat、`playerenvironment.js:16` buildFormat三处仍钉死v2；按§9.11预定须schema2／studio-app-3／v3-role全链同切且字段先冻结，C6发布器未产出该包形前不动代码；(ii)存档格式：`savegame.js`无版本门（grep version空），roadmemory快照v1与装配metadata（roadVersion 2|3）均已版本无关，M257无需新格式；257城完整savegame-store往返已接（见C5-5，§150）；(iii)章初态接线：`cityIndex`／`chapterDigests`尚无消费者（grep仅trialcompile自引用），`game.chapters[].state`仍raw记录形，待C6作者模型产出新形数据；逐章核对与M192后开放为准入决定门（阻塞项，需用户拍板）。
- [ ] worlddefinition／roadgraph／prepareScenario／玩家包准入及能力创建接线，不绕过身份验证或保留新城特许入口。
- [ ] 存档新格式保存完整规则态、RNG、批次游标、事件、城市缓存及军团结构化位置；旧格式明确拒绝，不自动改档。
- [ ] 旧192图新局、行军、治理、月结、速算／战术、占领和真实JSON冷恢复；固定输入对照未批准变化的行为，已批准Web差异单列。
- [ ] 至少所有受影响内置章节的编译／装配／初态逐章核对；代表性全链测试不能冒充全部战役穷举。
- [x] 完成里程碑M192后开放新内容到共同可玩准入（C5-6已接，用户2026-11-18批准执行；v3包可玩链一次通过）；子模块测试可此前进行，不把未完成格式提前安装到真实来源。

### C6：服务端与发布

#### C6(c) 发布器v3-role字段冻结（已接，用户2026-11-18批准实施）

冻结三元组（v2包逐字节不变，无flag day）：v3正式包为`schemaVersion: 2`／`buildFormat: 'studio-app-3'`／roadGraph role `'native-road-v3'`；其余role／MIME／URL形状、world（384×256×16）、manifest章节结构、compilerRevision（仍为同一`TRIAL_COMPILER_REVISION`常量，三元组已足够区分）一律不动。发布器（`playpacks.js:30/142`）按图版本发射对应三元组（`ASSET_ROLE`由常量改为图版本函数，落盘manifest冻结role串，旧包不受影响）；玩家（`playerpack.js:10/:69`、`playerenvironment.js:16`）双准入两套三元组并拒绝混搭（如schemaVersion 2配v2 role）；`trials.js`（`studio-chapter-1`）保持v2-only（试炼引擎已退役，不发v3试炼包）。回滚沿用republish替换语义。实施核对表（动手时）：v2包照旧加载、v3包加载、混搭三元组拒收；不同步schema／purge／inventory（未改表／文件角色）。本节仅冻结方案，不改代码。

实施（journal§168）：`playpacks.js`按`compiled.roadGraph.version`发射三元组（`tripletFor`，未知版本422拒收；`ASSET_ROLE`常量保留为v2 role表）；玩家`playerpack.js`双准入（`roleTables`按`schemaVersion/buildFormat`查表，混搭因role不匹配拒收，compilerRevision／scope门保留）；`playerenvironment.js`双准入三元组。测试：`verify_player_pack` v3加载＋3组混搭拒收（checks 65）、`verify_player_environment` v3进环境＋2组混搭拒收、`verify_publish_triplets`（新，发布器发射：v2三元组不变／v3三元组／无版本·v1·v4拒收）、发布器夹具补`roadGraph.version:2`；`verify_player_pack_compiled`与`verify_publish_atomicity`为基线既有环境失败（stash同败）。`trials.js`未动（v2-only）。bundle重建含v3 role串，shell/play不变。

- [ ] 新增受限据点创建／placement移动移除／资料删除命令，跨模块批次原子校验提交；失败不留半城。
- [ ] 作者DTO、章节首都／归属等改按稳定ID；服务端重验全部引用，不能信任客户端自报index或hash。
- [ ] 模板profile和两种创建统一升级，旧copy转换显式化；现有游戏不随模板自动更新。
- [ ] 保存重读、检验票失效、重新检验、提交、审核、正式包生成、同加载器全链；失败rollback不耗版本号。
- [ ] 若修改表／文件角色，同步schema、purge、inventory及分发声明；不以计划授权执行生产迁移。

### C7：地图与据点UI

现状（2026-11-17 inventory，设计分解未实施）：copy城市模型已按`cityId`字符串键控（`gamecopy.js` rename/numbers/chapter edits无192门）；地图命令经`web/src/editor/mapcommands.js`共用核心。UI侧硬192门仅两处展示文案（`StrongholdPanel.vue:10`注释称192座共享、`MapPanel.vue:38`称放置192锁定），其余命中为素材ID（bridge-bank-192）与像素高度（max-height=192），非城市计数。服务端`systembasemap.js`仅模板profile名字符串含192，无数量门。结论：C7无“放宽上限”式改动，剩余为新功能轨——受限据点创建／placement移动移除／资料删除命令（跨模块批次原子校验）、拆组／删门补墙／移动／移除引用清单、新城章节配置与主表同数据、一次撤销／取消零写，另加四模板与窄宽视口浏览器覆盖。命令语义与引用规则须先出设计（尤其失败不留半城的原子边界与C6检验票衔接），不直接进入实现。C6(c)字段冻结待用户确认后，C7设计可并行起草。C7-A已出（见[据点组合同§4](map-city-group-contract.md#4-c7-a-受限创建拆散删门引用清单设计未实施)）：放置三路物化／拆散只摘组链／删门先解绑道路／引用清单／非目标；journal§155。C7-B已接（journal§158）：`DraftTopology.references`只读引用查询（方法＋单测，无路由）。C7-C已接：`web/src/editor/citygroupplacement.js:planCityGroupPlacement`放置预检（全有或全无：形状／锚点／cityTypes门、整单越界拒绝、装饰足迹＋道路构件＋placement占格冲突拒绝；只读不写，中心地形规则留mapcompile；journal§159）。C7-D已接：同文件`materializeCityGroupPlacement(plan,{cityId,newId})`地图侧物化变换（门格只出`cityId:gateIndex`端口元数据、非门格出原子`tile-<byte>`装饰描述、组链装饰实例id；copy模型行与章节覆盖不在此写；journal§160）。C7-E已接：`componenttools.js:placeCityGroup(source,materialized)`落源（装饰实例＋`cityGatePorts`＋`selectionGroups`条目，全有或全无，原子tile形状门，不写copy模型）＋`mapcommands.js`新增`city-group-place`命令；`reconcileMapSelectionGroups`补暂存组保留（判新以源集合为准，`decoration-remove`清空的组不复活——初版按调和后集合判新被既有单测抓包，已修正；journal§161）。C7-F已接：`mapcanvas.js decoration-place`有caller签发cityId时走预检＋物化＋stage（无cityId沿用预览拒绝，目录`canPlace`仍false；journal§162）。C7-G已接：`componenttools.js:disbandCityGroup(source,cityId)`拆散（只摘`city-group-<cityId>`组链，装饰／端口／记录原样保留，未知组fail-closed）＋`mapcommands.js`新增`city-group-disband`命令；`reconcileMapSelectionGroups`补删组过滤（否则调和按源集合重建被摘组——新单测抓包，已修正；journal§163）。C7-H已接：`componenttools.js:removeCityGate`删门（端口须存在＋引用该据点的道路须先解绑＋换墙原子tile门＋门格未被占，全有或全无：注销端口＋落墙装饰不入组）＋`mapcommands.js`新增`city-gate-remove`命令；`occupiedCells`移入`componenttools.js`共享（放置侧保留`BAD_SOURCE`门；journal§164）。C7-I已接：据点组三操作经`basemap.js`共用stage管线，单次stage即一undo单元，undo从snapshot重算preview，save是唯一写口，dispose／setIdentity只清本地态；新`citygroupundo.test` 2/2（真实preview＋mock传输，place→disband两步各一单元、两次undo回pristine且零服务端写、stage后dispose零写；journal§165）。C7-J已接（journal§166）：`tools/verify_city_group_browser.mjs`真实Chromium一次通过——四配方（`mapcitygroups.json`结构镜像）页内置放／拆散／删门＋JSON保存重读逐字节一致＋重读态可操作，两视口digest一致，零页错误；UI点击流未覆盖（目录`canPlace`仍false）。

- [ ] 共用预览／命令核心：四组落点、中心锚点、越界拒绝、创建资料、类型选择、战场缺项和门端口预览。
- [ ] 拆组、删门补墙、移动、移除placement／删除资料的引用清单；只开放本任务需要的组合动作，不顺带开放旋转／翻转／对象锁。
- [ ] 新城章节配置与据点主表显示同一数据；保存后重读、一操作一次撤销、取消零写／零遗留。
- [ ] 维持260px素材区、实际16px组合预览、旧32px单格、导航折叠让空间给地图、锁图只禁平移及现有层锁。
- [ ] 新profile浏览器覆盖模板及作者地图、四模板和窄宽视口；控制台／请求／保存重读及失败状态真实可见。

### C8–C9：验收与收敛

- [ ] 按§7逐项登记新证据，失败／未跑／夹具与真实后端分开。

#### C8-1 §7验收登记（进行中，M257(a)–(h)＋C5-1–C5-5＋C6-1＋C7-A–C7-J已闭环）

| ID | 状态 | 证据／缺口 |
| --- | --- | --- |
| V192 | ✓ | `verify_m192_unified_chain`3/3（真实内置192城编译／装配／搜索／快照往返）＋327回归项 |
| V193 | ✓ | admission M193（193城fresh／末城归属／缓存／索引搜索found） |
| V257 | ✓ | v3全链：memory／search／边判／F23／月度／装配／movement257／fiscal257／快照／store往返／真实浏览器257城场景 |
| VCOUNT | ✓部分 | F23 word域（capture／fiscal／diplo／extinction断言）；迁都255＋／灭亡统一条件待深用例 |
| VIDENTITY | ✓部分 | `compileSourceIndex`＋copy cityId键控；改名／删中间城／重编全链待C6c |
| VGROUP | ✓ | `verify_city_group_browser`真实Chromium：四配方逐一place→其一disband→第二家立路拒删门→解绑删门成功→JSON保存重读逐字节一致→重读态可disband；两视口digest一致，零页错误；UI点击流未覆盖（目录canPlace仍false） |
| VROAD | ✓部分 | v3区域／搜索／边判node＋浏览器；复杂真实大路网待补 |
| VSCHEDULE | ✓部分 | 192／193／257 movement轮询；暂停语义沿既有用例 |
| VEVENT | — | D2未批准／不需要，目标需要时才动 |
| VBATTLE | ✓部分 | 攻城入口动态门＋siege12；高索引速算／战术全链待补 |
| VSAVE | ✓部分 | 257 store往返（C5-5）；途中／接敌／占城后待补 |
| VPUBLISH | △部分 | C6(c)已接：发布器按图版本发射三元组、玩家双准入＋混搭拒收（player_pack／environment／publish_triplets绿）；完整后端链（parity／atomicity等）基线既有环境失败：parity在装配期即报`available library consumer fingerprint mismatch`（stash同败；指纹核对registry记录hash与检出consumer文件，属检出／registry偏斜，非CITY回归；改检出换行或重录指纹超出本轮授权，不动） |
| VISOLATION | ✓部分 | copy cityId键控＋C7-J模板浏览器（保存重读）；旧局热换／窄宽视口全覆盖待补 |
| VPERF | △ | codec基线：`tools/bench_m257_perf.mjs`（i5-7500／15.9GiB／win32／node24）：v3 checked编码257节点10.3ms、快照2.1ms、端到端搜索2.1ms（256次索引读）、堆~8MiB；场景级assembly/月度耗时未录 |

#### C8-2 残余192门排查与收敛（已接 rounds）

修完（live长度）：`ai.js`的`rawRoadNodeId`（加`nodeCount`参数，三调用点传live；`0x0800`硬门取消，槽位界已蕴含地址界）与`markLegionAtRoadNode`（live上限，静默跳过改门控）；`originallegionfate.js`灭亡横扫改`readCityCount`能力（缺省192）＋`scenariolegionfate.js`的`cityAt`门放live＋io新增`readCityCount`；extinction4FCE新增200城横扫用例（198／199槽双写锁定超界）。有意保留：`cityphase.js`192相位（D1批准的固定切片，`phase*cityCount/192`天然按比例覆盖257城）；`battleprojection.js`目录门（C4决定：非显式绑定超191必须fail-closed禁误取野战项）；legacy raw转换门（`chaptercityconversion`／`citysourceconversion`／`gamesource`章raw／war／diplo FFFF别名，DOS 32B格式本无257定义）；`battlemapcatalog`为最小值门（允许多）。extinction4FCE 35/35、war三套件、movement＋save三套件通过；bundle重建`17caa963…772a115a`，shell/play不变。
- [ ] 排查残余城市byte／地址／固定循环；保留的192只能是来源／基准周期等有说明的常量，不是隐藏容量。
- [ ] 最终同一生产模型，旧对照逻辑不能通过gameId／数量偷偷成为运行回退；未触及的战术／人物原规则模块不因名称而删除。
- [ ] 回流本计划、产品／工程合同、据点组合同、AGENTS现行支持域及journal；旧批次证据保历史，不改写原证成Web机制。
- [ ] 审实际diff、生成物及分级验证；列明未覆盖／待验收／待部署。未授权commit／push时保留本地修改交付。

## 7. 验收矩阵与证据要求

| 验收ID | 场景 | 必须看到的结果 |
| --- | --- | --- |
| V192 | 原192内容迁移 | 同一新结构运行，源输入不变；未批准变化逐项等价，批准差异明确 |
| V193 | 第193城纵向贯通 | 创建／保存／道路／章节／行军／治理／战斗／占领／恢复全部完成 |
| V257 | 257城且最后索引256 | 最后城可为首都、邻居、目标、事件目标、攻城目标；254／255不当哨兵 |
| VCOUNT | 同势力拥有超过255城 | 计数不回绕；迁都、灭亡及统一条件按明确合同 |
| VIDENTITY | 移城、改名、删中间城、重编 | ID不变／不复用，其它城不串号；首都、道路、战场、章节一致 |
| VGROUP | 四组实际编辑 | 25／9／3／3格和中心正确；拆组保身份、删门不留隐形路，撤销完整 |
| VROAD | 原图与新增复杂路网 | 次序／费用／方向符合合同，断连明确；无越界、队列覆盖、死循环 |
| VSCHEDULE | 192／193／257轮询及暂停 | 单城节奏明确，不漏城、不重复军团批次／消息后动作／RNG |
| VEVENT | 大量城市事件／跨月 | 不静默丢失，派发次序及延迟可复现，目标不截断 |
| VBATTLE | 高索引城速算及战术 | siege／field不由cityIndex决定，城损／六队／退出／占领回写正确 |
| VSAVE | 路途中、接敌等待、占城后 | 真实JSON及冷恢复接续一致；事务失败、身份错、坏引用不污染live |
| VPUBLISH | 隔离真实后端发布链 | copy→检验→票失效／重验→提交／审核→正式包→同加载器／新局／存读 |
| VISOLATION | 内置／模板／其它游戏／旧局 | 编辑不反写来源，不串资源缓存，不热换旧对局 |
| VPERF | 多个更大规模及路网 | 记录机器／样本／内存／编译／每步耗时；预算明确，不拿测试规模当固定上限 |

- 测试固定I/O白名单，只读允许的原非存档资料，生成物写新独占目录；禁读写真实SAVE、用户profile及真实存档。
- 先审现有测试入口／依赖，再选择内容、道路、slot-phase、城市AI、财政事件、战术／战后、保存和发布lane；禁止`verify_*`通配，重任务串行。
- 改`web/src/**`重建`trialweb.txt`并核内容身份；改Vue先build再check，再独立Vue检查和支持文件主动LSP／mode=all。空缓存、超时、push-only不是clean。
- 新浏览器profile，实际HTTP／SQLite／FileBucket链与内存API夹具分开；纯JSON数组往返不能代替游戏保存恢复，Node单测不能代替UI及发布加载。
- 每个完成项至少记录：任务／验收ID、输入与工具版本、命令、结果、证据路径、允许差异、覆盖限制。失败不改预期来凑绿，原机制仍以可复核原证为准。

## 8. 最小阅读索引与当前交接

必读产品／工程边界：[产品设计](game-editor-design.md)、[工程合同](game-editor-technical-design.md)、[地图迁移计划](game-map-migration-plan.md)、[准入原证](re-notes-editor-map-admission.md)、[系统基础地图](system-base-map-design.md)、[据点组](map-city-group-contract.md)。旧“本期不扩容”属旧批次／当前实现限制，本任务明确提出后继改造，不把它当永久禁止，也不提前删旧安全门。

按实际修改加载技能：[数据](../../.agents/skills/re-data-formats/SKILL.md)、[行军](../../.agents/skills/re-march-engagement/SKILL.md)、[战斗](../../.agents/skills/re-battle-command/SKILL.md)、[战后](../../.agents/skills/re-post-battle/SKILL.md)、[内政外交](../../.agents/skills/re-domestic-diplomacy/SKILL.md)、[军师UI](../../.agents/skills/re-ui-advisor-menu/SKILL.md)。详情原证沿技能引用进入，不能把当前实现当规则证明。

**交接状态：** 用户已授权从C0推进本地实施；基线仍为`c3efb05`，保留原有四份文档修改。C0进行中，矩阵与具体差异提案见§9；C1已实现身份／源片段校验、独占输出转换及章节城市片段编译，但非完整GameSource迁移；C2已落结构化道路运输投影及隔离寻路核但未接运行，C3已有D1批次／D3别名／D5主动迁都子项，C4已接攻城资源ID及战术入口解耦子项，C5–C9未开始，产品准入仍固定192城。四组只读预览与平移锁不重做。未提交、推送、部署或迁移真实数据。

## 9. C0实施账本：字段、失败边界与差异提案

### 9.1 本批证据等级与覆盖

本批在`c3efb05`工作树重读以下函数，并用CodeGraph查入口／caller，以定点源码补足字面常量。以下均为**代码事实或Web工程提案，不是新增KI机制结论**；原证入口沿§8的SKILL及其详细来源。没有运行原CPU，也没有用旧测试证明原规则。

覆盖标记：**已读**表示本批已读相关函数体；**待追**表示只有定位或局部命中，不能宣布所有消费者穷尽。C0全部复选框仍未勾选，尤其财政／外交其它读者、UI／发布和初态的原证复核尚未完成。

### 9.2 逐字段影响矩阵（首批）

表中路径除注明外相对`web/src/`；新字段名是目标合同，不表示已接入。每行的初始化与保存都必须与消费者同批改造。

| 字段／语义 | 当前权威、已读入口／读写者 | 目标类型、初始化及保存 | 后继／验证与缺口 |
| --- | --- | --- | --- |
| `cityId / runtimeSlot / idx` | `content/authoring/cityrecords.js:captureCityDefinitions`限制槽0..191；`trialcompile.js:compileGameSource`按runtimeSlot排序并核固定XY及节点扫描 | 源ID永久；`cityOrder`派生紧凑index，raw槽仅溯源；运行包与档绑定完整顺序摘要 | 删除中间项须重编所有引用；不得按列表排序／地图扫描重编号；V192/VIDENTITY；服务writer待追 |
| placement的`x/y` | `mapcompile.js:validateMapSource`固定384×256、192放置、中心不重复；`compileGameSource`还核章raw坐标 | placement唯一位置权威；编译投影章节和运行坐标；坐标不转成身份 | 移动标道路待重连，不自动补路；全组越界拒绝；地图尺寸不改 |
| `capital`（F03） | `originalformation.js:createOriginalLegion`读byte首都、`capital*8`位置；`originalmonthlyfiscal.js:scanFaction53C6`用首都坐标算距离；`originalcapitalrelocation.js`及`originalcitycapture.js`各有选都／改目标实现 | 源`capitalCityId:null或ID`，运行`capitalCityIndex:null或index`；旧FF仅在导入边界转换；保存不截byte | 编成、财政、type8、失城迁都和去向共同改造；`savegame.js:assertNativeFormationSnapshotState`当前仍限255；无候选差异见D5 |
| F16/F17一次性据点指令 | `originalroadarrival.js:arriveOriginalRoad`handler6依次消费secondary/primary并写255；`refreshOriginalCityCache`向旧属写secondary | nullable城市引用；消费清null；不与`target_faction`混同 | 4455/4462随后减C18，不能只改指令字段；中立别名见D3；全部写者待追 |
| `targetCity / targetNode / targetX/Y`（L20/L14/L16/L18） | `arriveOriginalRoad:targetCoordinates`写目标坐标及节点；迁都4502先写targetCity，独立比较后才反向写targetNode | 指令目标与导航目标分别持有城市index；坐标为有来源投影；两者不能保存时强制合并 | 当前4502不是简单old→new：目标节点等新首都才改回旧首都；原证待针对性复核。下令／返都／撤退caller需各自追尾 |
| `roadEdgeOrNode / roadPointAddress / roadStride`（L0E/L0C/L0A） | `createOriginalLegion`写city×8；`arriveOriginalRoad`按0x800区分节点与边；`targetCoordinates`比较节点地址 | `location`为city/road联合类型；边点索引与方向独立；移除DOS分区身份 | 不在节点化时擅清尚有消费者的边点残值；C2追全部读者后确定残值持久化合同；不能只保显示`_march` |
| `strategicNeighbours / strategicBorderCount / attr低位`（C1C..1F/C1B/C00） | `scenariocitycache.js:initializeScenarioCityNativeInputs`从原raw初始化；`compileGameSource`邻接集合比较有排序，但运行四槽顺序不能因此排序 | 战略邻接与导航四端口分别保序、nullable邻城index；border位依战略顺序；只核两者连接多重集合一致，不以导航顺序覆盖导入战略顺序 | `savegame.js`现邻居逐byte校验；高索引254/255须成为普通引用；外交建表及88CC完整写回待追 |
| `n_cities`（F23） | 财政`scanFaction53C6`每城`&255`计数并在544B写回；捕获4D0A/4D2A在消息两侧分别减／增 | 非负整数stored计数；初始化与导入差异见D6；JSON不截断 | 不能简单改为getter：失城消息期间存在已提交前缀；保存继续禁用未完continuation。招募5899、财政危机、宣战阈值所有读者待追 |
| C18占格缓存 | `createScenarioCityCache`固定192 bytes＋known；fresh由`nativeCityRecordRaw[+18]`；`refreshOriginalCityCache`刷新、4455/4462提前减记 | 动态长度规则缓存；保known/unknown区别，保存精确值和索引表身份；元素值域不因城市身份扩容自动扩大 | 不重建为实时legions计数，不用全零替未知；D3含别名读取；V257/VSAVE |
| C17/C1A/C15初态 | 同一initializer从raw取`_aiCooldown/_strategicLastFaction/disaster_event`；治理前刷新旧属并可能写F17 | 具名CityInitializer字段；导入保原值，新建值须经D6确认；restore不再执行fresh | 旧属不总等当前属，不能统一覆盖；新增城不得伪造32B记录；城兵上限来源仍待闭合 |
| `_cityTickCursor` | `ai.js:aiTick`限192；`finishStrategicCityUpdate`治理→灾损→游标%192→一次军团batch；`main.js`传游标；savegame存它 | 保存192相位中的phase及下一城市游标；批内resume在原城市／子阶段接续；D1具体化 | 不能重复调用整个aiTick实现多城批次；重复回调不重耗RNG；暂停期间禁存；VSCHEDULE |
| 事件目标／参数 | `originalMonthlyDomesticBudgets5715`将city塞arg0 byte；`originalMonthlyCityDisasters2286`将城市地址塞DX word | 按type的payload联合类型，城市用index、资金仍独立数值；不把所有arg0都认作城市 | 预算type4目标是city，type5是faction；当前逐城火灾／暴动是type12地址参数；type11区域事件不能误改成逐城事件 |
| 事件游标／divider／队列 | `originalCurrentEnqueue2FBF`仅当前64槽，满返回false；`originalEventPump31AE`先推进游标再dispatch，divider为7/10；301C及月移页待完整追踪 | 逻辑月／槽位置与稳定插入序分离，payload不打包byte；D2提案定义溢出与跨月 | AI／天气的页满返回影响后续分支，不能只扩数组；UI FIFO不是规则队列；VEVENT |
| 月度区域天气选城 | `originalMonthlyWeather22DB`取一RNG byte，>=192直接返回；选中后又按xLow消费条件RNG | 选择域需独立扩容合同D4，不可用`rng%N` | N=257时单byte永远选不到index256；这是新增具体待决项，不是数组扩长能解决 |
| `D32 / D34` | `originalsiege.js`将城市指针及换算目录号写global；`originalfieldbattle.js:51B9`按d34<0xc0决定城损（本批仅定位，主体待读） | `battleContext={kind, targetCityIndex, battleMapId}`；战场资源只读共享，损害只写目标城 | C4须覆盖速算、战术和退出；不能改加载目录却保留<192城损判定。完整战术consumer待追 |
| 存档装配身份 | `scenarioassembly.js:assertMetadata/readSavedAssembly/currentMetadata`为version1＋roadVersion2；`savegame.js`恢复精确能力态并拒缺失 | 新装配版本、cityOrder/topology摘要、规则缓存／位置／队列schema共同升级；旧格式明确拒绝 | 只读拒绝不能触发删档；JSON冷恢复／detached安装和晚到守卫保留；档外层版本及player包schema待追 |

**实现分歧已由原证闭合并修正：** 本批续查直接读取KI 6A3D..6A9B，6A55为`MOV AH,[SI+16]`，6A73才`TEST BYTE [SI],1F`。type8错误以C00低位代C16类型，现新增独立`readCityType`并保留延迟读取C00；捕获路径原`city.type`不改。具体bytes/SHA、反例与15项回归唯一维护于[去向原证§11.1](re-notes-legion-fate.md#111-原始绑定与调用者实锤)。这不是批准新规则，也不改变无候选189；两条caller不因共用6A3D而强行合并。

### 9.3 可先落实的纯数据不变量

下列是§4已采纳方向的工程细化，不新增经济／AI规则：

- `cityOrder`包含主表每个cityId恰好一次（含未放置资料）；编译运行顺序是其中**有placement**的稳定子序列。未放置且无运行引用的资料不生成假节点；章配置、首都或道路仍引用未放置城时报告缺项并阻发布，不静默丢配置。
- 草稿允许零城／缺战场／未放置；结构上的重复ID、重复中心、非法坐标、order漏项／多项仍拒绝。可运行章节的最小条件另做发布检查，不能由“数组非空”代替。
- 源道路保持稳定roadId、fromCityId/toCityId、有序geometry与明确端口。编译节点`{cityIndex, ports:[null或{roadIndex,end}]×4}`，边`{roadId, fromCityIndex, toCityIndex, points, cost, bounds}`；end表示from/to，不能依靠地址高bit表达。四门上限是本期端口合同，不是城市数量限制。
- 运行位置`{kind:'city', cityIndex}`或`{kind:'road', roadIndex, pointIndex, direction:-1|1}`；军团目标和撤退目标另外保存。点列只含道路内部点，端点中心不追加；到城时机仍由原动作链决定。
- 边界一次验证安全整数和所属索引表；内部传已校验引用。城市index/count不使用位运算裁剪，地图tile、势力、武将、单位类型、规则byte/word不能被批量替换。
- 战场目录先只枚举现有攻城资源0..191，以稳定`battleMapId`引用，保原目录号作资源溯源；192..213野战资源不加入攻城选择。新增城缺项拒发布；可选类型／布局适配门及选择UI须完成资源审计，不以可见缩略图认证兼容。

<a id="94-web差异具体提案待用户确认不进正式规则"></a>
### 9.4 Web差异决定与剩余提案

**现行批准范围**：用户在§98集中确认请求后回复“同意建议”，批准D1、D3、D5，以及D6新城初态／导入计数部分；随后恢复goal。以下“建议”措辞在上述范围内转为已批准Web产品决定（非原版机制），不再重复索批。D2事件跨月、D4天气抽样、D5费用域及D6财政算术扩域未在此次批准内，仍须细化确认。此前各批“D1–D6未批”仅记录当时状态，不是当前阻塞。

未定部分仅暂停依赖它的代码；其它授权工作继续。统一新引擎采用同一策略，不按gameId或新旧城市分支。

**D1 据点节奏：** 建议以192次主更新为一轮。相位`p∈0..191`处理cityOrder运行子序列的区间`[floor(p*N/192), floor((p+1)*N/192))`，每城依次军事→治理→灾损；完成本次全部城市后只执行一次16槽军团batch，再推进原日历。192城每次恰1城；193城最后相位2城；257城各相位1或2城，整轮恰257次。若第二城TALK38挂起，第一城不重跑，第二城从消息后继返回，再跑唯一军团batch。保存完整轮间phase；未返回批次仍禁存。小于192时有空城市批次，军团和日历不跳过。该整数分配不改变已批准的墙钟速度。

**D1前置实施记录：** 已修原生aiTick的TALK38关闭后治理／军团续段（此前只在legacy分支正确接回），消息期间不再提前治理或推进游标；31项native city及request continuation通过，见journal§101与[详细接续边界](re-notes-march-pathfinding.md#city-capacity-request-tail)。随后已接`cityPhaseRange`与原生military/daily区间续段：全批返回才提交下一phase并执行一次军团batch，空批不跳军团。历史`cityIndex/_cityTickCursor`字段暂为0..191相位，N192语义不变。9项相位契约、33项native city（含双城连续请求定点探针）、请求续段、34项movement及18项capture通过，见journal§102。下游城市地址／缓存、道路及装配仍固定192，未达M193/M257或C3整体验收。

**D2 事件拥挤（初稿，§9.7已补充不可省略的跨月缺口；暂不具备实施条件）：** 建议保月内64个逻辑时间位置及首7／后10次势力tick的时间基准，位置内改为按递增sequence排序的事件列表；原随机延迟／显式延迟消费保留，不额外耗RNG。兼容正常未拥挤行为时仍先寻找后续空逻辑位置；当前月后面没有空位时，溢出事件追加至当前月末位置并标明overflow，不丢弃。一个位置的事件逐个串行执行，消息关闭后才继续，全部返回后再走该次势力tick后继；月界不丢未处理事件。**此提案使原页满失败改为成功，天气区域bounds写回等后继也会改变**，不是无规则影响的存储升级。301C跨月延迟的精确映射、月界先后和溢出延迟上限还须追完整caller后冻结；目前不能据此实现事件泵。

**D3 去除跨记录别名：** 建议43D3改为明确读取当前到达城的C18缓存（不是实时计数），不再按cityIndex地址读势力人数／未知raw／外交表／其它城缓存；3F29中立旧属不再把城市index写到外交`[0][23]`。正常势力的F17写回与C18刷新寿命保留。例如新增index256不可能再被截成外交byte0。**旧192城同样会改变部分命令与外交行为，需单列允许差异，不能宣称旧图全部逐位等价。**其它别名（中立临时军、外交活动槽、财政半记录等）尚未完整分类，本提案不一揽子删除它们。

**D4 月度区域天气选城：** 建议保原首次1/2门。令`B=256^k`为容纳N的最小byte空间，以k个原RNG byte组成r，接受`r<floor(B*3/4)`后选`floor(r*N/floor(B*3/4))`，否则返回；N=192且k=1时接受0..191且index=r，与旧局部选择和消费相同。N=257用两byte，index256可达；原后续xLow门／bounds流程另按原证保留。这是明确的Web抽样提案，最多相差一个离散桶，并非宣称严格均匀；是否要求严格均匀及增加RNG消费须用户决定。零城只允许草稿，不进入此函数。

**D5 不可达／无首都：** 建议搜索返回`found / already-there / unreachable`，异常费用另为明确错误，不沿用CF耗尽的edge0800。普通玩家新命令预检失败不覆盖旧命令并提示；AI派令失败不写新目标、留待后续正常调度，不新造重试计时；返都运行中断路保留当前位置／目标并暂停该军团行动，禁止瞬移或删除；战后无合法退点保留已写战果及原位置，报告无法撤退，不由无路自动触发武将去向。最后一项会改变旧无路291A分支，必须单独批准；士气0／首队0等其它既有去向条件不因此改变。type8无候选返回`no-capital-candidate`且不写189／不改首都；失城迁都无候选仍须走已证灭亡链，不与type8合并。费用回绕采用何种新域仍待C2追完整搜索后提交具体建议。

**D5子项实施记录：** type8无首都候选已按批准决定落地，不写189；真实189候选不被排除，失城4DF0及显式提案commit不改。迁都17/17、捕获／JSON18/18回归见journal§100；[详细Web差异](re-notes-legion-fate.md#city-capacity-d5-capital)。后续已接原生47BB耗尽的明确unreachable及动作占格恢复／待重算标记，连续到期不沿旧方向偷走，35项movement、6项结构化选边、32项到达、18项捕获回归通过，详见[运行无路边界](re-notes-march-pathfinding.md#city-capacity-unreachable-action)与journal§114。仍不等于487B撤退选址、玩家／AI新命令预检及提示等其它D5 caller或动态城市接线完成。

**D6 初始化／计数：** 建议新城显式填写城兵上限，四项章节默认值从主表复制一次；运行初态为无驻军、无灾害、冷却0、旧属等当前属、C18=0，新建城按非空导航端口原序构造独立战略邻接，边界依本章归属生成；导入战略顺序不得用导航端口顺序替代（见§9.10.12）。这些是**已批准的Web新城初态方向**，不称原版新增城默认值；财政算术扩域不包含在批准内。原内容导入逐字段保留已知初态与来源，未知缺项拒绝，不造raw；F23建议转换时按实际归属重计并报告旧值差异，运行中仍在原捕获写序及月结边界维护整数stored计数，不每帧重算。财政收入／三池累加是否仍保原24/16位回绕，不由计数改造顺带决定，须列异常规模输入域后确认。

**D6城兵上限保持项已复核**：C12是独立byte输入，20章3840条导入原值对照通过；2328条与首章不同，不能列入主表跨章不变量或由type推算。新源每章具名初态保有`troops_cap`，新建显式填、旧源取本章原值。完整五库聚合导入仍因下库末章缺2B拒绝，本次只认证完整城市字段；来源与复核工具见[字段原证](re-notes-entity-fields.md#city-capacity-troops-cap)。尚未实现新源版本及初始化接线。

### 9.5 版本升级与验证登记（未执行）

| 边界 | 本批核到的当前值 | 拟升级及切换门 |
| --- | --- | --- |
| GameSource / map source | `GAMESOURCE_SCHEMA=1`、`MAP_SCHEMA_VERSION=1` | 拟均2；新增cityOrder／稳定引用与战场绑定；仅离线转换输出新目录，不放宽v1 |
| 编译器 | `TRIAL_COMPILER_REVISION=editor-local-0.6` | 拟`city-capacity-1`；名虽Trial，仍同一compileGameSource，不重开HTTP |
| 道路 | v2原地址布局 | 拟v3结构化图；M192前不得装入可玩App，不能在v2容器塞新对象 |
| 装配 | `scenarioAssembly.version=1,roadVersion=2` | 拟version2＋roadVersion3＋cityOrder/topology摘要；world/content身份核对不删 |
| CityCache | version1＋固定192 span | 拟version2＋动态数量与索引身份；保存known位及规则值，不从restore重建 |
| 存档外层 | `core/gamesavecodec.js`正文／目录format3，`gamesavestore.js`打开IDB version1、`saves` store，目录key为catalog-v3 | 本次已读两模块全文：snapshot为规范JSON对象，外层不含192或byte容量门。单因城市扩容无需改IDB／外层format；升级运行snapshot装配版本，不绕开release身份、摘要或CAS。内存codec对照已证257条及192/254/255/256索引、null无损；未证明Scenario可恢复，未访问IDB |
| 正式包／系统模板 | 尚未完整追到外层格式 | 待C0补完全部版本与pin/inventory消费者，再分配版本；不虚填“已升级” |

验证入口**仅登记，尚未审完依赖/I/O、尚未执行**：`tools/verify_native_city.mjs`、`verify_city_request_continuation.mjs`、`verify_native_capital_relocation.mjs`、`verify_native_monthly_fiscal.mjs`、`verify_native_monthly_budgets.mjs`、`verify_native_weather_monthly.mjs`、`verify_native_weather_events.mjs`、`verify_game_save_snapshot.mjs`、`verify_editor_city_references.mjs`、`verify_copy_http_roundtrip.mjs`。旧Trial入口不得作为新正式发布验收。

I/O白名单：首批只读仓库源码／文档／Git状态，仅修改本文与journal；§9.6续批显式只读KI.EXE，修改已闭合选都字段错误、定点测试、原证记录及共同引擎包；后续原证只显式读指定KI.EXE、MMAP资源和五库SINARIO非存档文件；测试输出新独占临时目录或`.dragon-analysis/<新轮次>`，浏览器用新profile、IDB用mock／隔离环境；禁止真实SAVE、生产桶／SQLite、用户profile及网络写入。测试入口被登记不等于已获得其任意I/O权限，执行前逐项审查依赖。

**下一具体入口：** 6A55原字段分歧已修正；继续追天气type11/12与301C／月移页完整链，补外交F23／邻接和UI／publish消费者及存档外层版本。D1–D6仍待针对性产品确认；“继续审计”不等于批准这些新行为，独立数据合同不受影响。

### 9.6 本批续查：原证修正及事件剩余边界

- **完成局部修正**：type8选都独立读取C16类型和C00边界，15项回归通过，三个JS/MJS语法通过；共同引擎包已同步，243文件SHA256为`8f243853ac899faad2c6e7e17595fc05d957ffbbff736986b6989ad833e1886f`，重复构建unchanged。主动LSP三路径均push-only/inconclusive，mode=all缓存未认证，不称clean。未跑浏览器／完整战役；未改调度、RNG、存档schema或容量门。
- **301C原窗复核**：起点没有先验0400门，不能把域外读取改成full。详细原证归[去向§9.3](re-notes-legion-fate.md#93-301c搜索两word写与cf实锤及明确工程域)，本批窗口SHA与跨月对照统一回流[外交§2.1](re-notes-ai-diplomacy.md#21-city-capacity-1c0事件移页与消费边界复核)。
- **月结次序复核**：去向301C入队可能先于2BD9移页，预算／天气在其后；D2必须分别换算，不能统一假设所有月结producer在移页后。逐地址次序及SHA同上详细维护源。
- 本批最初只确认上述局部次序；下一续批已定位原生移页与consumer，见§9.7。`ai.js:beginStrategicEventMonth`是拒native的legacy路径，不能用其slice实现证明现行native移页。

### 9.7 C0事件边界测试与D2缺口收敛

**本地新增产物：** `tools/verify_city_capacity_event_boundaries.mjs`，只读KI、只用私有内存，5/5通过；旧事件／区域天气consumer回归另5/5通过。原证维护源为[外交§2.1](re-notes-ai-diplomacy.md#21-city-capacity-1c0事件移页与消费边界复核)，本节仅记录扩容影响。原生链为`performScenarioMonthlyDiplomacy→originalMonthlyDiplomacy2BD9→resetEventMonth`；消费为`tickStrategicWarEvents→consumeScenarioStrategicEvent→originalEventPump31AE→dispatchStrategicEvent`。

| 实际边界 | D2必须显式决定的变化 |
| --- | --- |
| 31AE只推进游标，不清旧槽 | 不可把“已消费槽可立即复用”当等价优化；新结构须区分历史占位、待消费和已消费 |
| 2BD9直接覆盖旧当前页，包括未消费事件 | “不丢事件”不只是满页时追加：还须定义正常未消费尾部的跨月顺序与到期时点 |
| 301C月结去向在移页前入队 | 旧63+2→65→新1；不能全部改用新月游标0而变新2 |
| handler前已推进游标 | 同位置多事件的每个handler再入队必须有一致逻辑游标；不能按列表长度额外推进时间 |
| 页尽divider0后下溢FF，不继续读末槽 | “追加月末”在游标已越过末槽时不可消费，必须有专门但待批准的迟到处理 |
| type11的区域数据在共享bounds，type12结束事件延迟入队 | 未消费事件跨月保留后会遇到新bounds／同城新灾害；保留原共享读还是改为事件快照需另核原证并确认，不盲加payload快照 |

最后一行目前是**源码消费者影响判断**：`beginOriginalDisasterAreaEvent34A6`进入237E时才读取bounds；type12的34EB后写灾度并301C排subtype0清除事件。没有宣称跨月前史已由原CPU复演，更不能直接以旧测试规定新事件覆盖／合并规则。

**D2当前结论：** 撤销“只扩大存储即可不丢事件”的隐含假设；§9.4为尚未冻结的提案，不予实现。下一步细化跨月carry、末槽迟到、区域天气bounds和同城灾害延迟清除，再一次性确认产品差异。其它ID／保存／发布字段盘点可独立继续。C0未完成；本批未修改运行规则或扩容保护门，未重建不变的引擎包。

### 9.8 C0正式发布与存档外层接缝

本节为实际源码审计，不是原版机制或生产操作。已读`server/gamecopy.js`的validate主要正文、approvePreview/approveSlot，`server/editorapp.js`的copy approve路由，`server/playpacks.js`的prepare／snapshotPrepared／installPreparedInTxn，以及`web/src/player/playerpack.js`准入主体；未将旧publishoperations的draft流水当copy现行入口。

```text
copy.validate → validateGameSource(draft:true) + compileMapSource → 摘要绑定检验票
submit → submitted
approvePreview → compileTrialSource（compileGameSource别名）→ PublishedPacks.prepare
approveSlot事务 → 编号 / pin / formal / listed + installPreparedInTxn
玩家session → loadPlayerPack → 后续运行装配
```

- **检验与审批编译不相同：** 当前copy检验只运行地图编译，审批才执行完整共同编译。C6须把新城市身份／运行引用／初态与战场缺项在发票前报告；不能给作者通过票后仅在管理员审批才暴露新城市不支持。身份、epoch、Origin、删除栅栏和摘要复核仍保留。
- **冻结状态接缝：** 当前`PublishedPacks.prepare`逐章深拷贝`game.chapters[id].state`，道路／地形却取`compiled`输出。C1/C5投影稳定城市ID后，必须明确共同编译器提供的运行章节产物，并让审批包只冻结同一次编译的章节与索引／道路；不能把源引用和运行数字索引混装。现状是否已错不由本条断定，这是扩容后必须改变的合同。
- **原子边界：** prepare在异步视觉资源读取前捕获state、规则字节与identity；approveSlot复核检验摘要、分配ordinal并在同事务调用installPreparedInTxn。城市表、topology与战场绑定不得异步安装或另作一次SQL提交，失败不消耗版本、不半更新正式包。
- **已核包格式：** manifest为`schemaVersion:1 / buildFormat:'studio-app-2' / compilerRevision`，roadGraph资产role为`native-road-v2`；玩家`loadPlayerPack`精确检查上述字段和4个规则资产ID，不能仅新增资产而不改准入。拟新包schema2／buildFormat `studio-app-3`与结构化道路role须在C5/C6全链一起切换，具体字段冻结后才实现；不得放宽旧manifest身份来偷塞v3。
- **地图与图片边界：** prepare及玩家仍核384×256、16px格，继续保留；`cityViewGaps`为图片库门，不代替独立battleMapId完整性与战术适配门。只更换攻城缩略图不足以证明可运行。
- **分发消费者续核：** 已全文读`vps/runtime-index.mjs:buildRuntimeIndex`，并读`vps/distribution-resources.mjs:manifestRoles`及调用方前段：两者均精确检查旧schema/buildFormat，前者逐资源核字节／SHA并生成version1 runtime index，后者要求manifest角色集合与index完全一致。新城市表若独立成资产，必须同步`ASSET_TYPES`允许表和manifest/index清单；不能靠额外未登记JSON旁路加载。`web/src/player/playerenvironment.js:createPlayerEnvironment`已全文读：也精确核compiler/buildFormat，固定装配四规则资产，经`createContentCatalog→createWorldResources→createNewGameScenario`交给同引擎；publication releaseId/ordinal继续单独校验，不能被sourceDigest相同绕过。分发完整inventory／程序登记仍待闭合。CodeGraph的compileGameSource caller清单会漏别名compileTrialSource，须同时追别名。
- **开局列表也是运行索引消费者：** `buildRuntimeIndex`从每章state生成chapterIndex，以`state.cities[faction.capital].name`投影首都、直接取`faction.n_cities`。因此即使玩家地图尚未加载，发布章状态也必须已完成稳定ID→index投影；不可只在Scenario构造时转换。`runtimecontract.js`的chapterIndex nCities为非负safe integer（字面定位），不是byte门；无需因城数机械放宽其数值检查。角色排序只用于资源映射，不能顺带排序章节或城市。
- **存档外层已闭合的部分：** `core/gamesavecodec.js`与`gamesavestore.js`全文已读；format3记录／目录、IDB version1不承载城市字段schema，snapshot为规范JSON对象。纯内存codec调用已验证257条城市、192/254/255/256引用和null无损，未打开IDB；所以不因容量机械升级存储库。运行snapshot装配版本必须升级并拒绝旧规则快照，但保留原记录供明确提示，不能把不兼容当删除授权。CAS／摘要、目录正文事务与新版本清旧事务继续原样维护。

本批尚未执行发布、IDB、浏览器或新版运行恢复测试；上述codec对照仅证明JSON外层无byte截断，不冒充M257／VSAVE验收。

### 9.9 稳定ID写链与旧界面排除（首批）

| 接缝 | 已核当前行为 | 改造要求／剩余边界 |
| --- | --- | --- |
| `gamesource.js:cityReferences` | 按cityId找主表和道路端点，但章state以runtimeSlot匹配idx、势力capital；只报告所属／太守／首都与作者配置 | 返回清单不是删除闭包；事件／军团／地图组／战场引用不能漏。C1须让作者引用全部用ID；索引仅为编译产物 |
| `server/gamecopy.js`城市模块 | rename/numbers请求以cityId为键；章节city-faction/set-capital/city-governor却传cityIdx且限0..191（本批字面定位，分支全文仍待读） | 保留主表ID写入口，章节受限请求改ID，不只把191改成MAX_SAFE_INTEGER；改字段须同步客户端、服务端和旧请求拒绝 |
| `server/public/draft.txt:cityCopySave` | 当前copy城市行保存按cityId，分别提交rename/numbers，成功重读；无创建／删除动作 | 新动作应接同一copy保存／重读协议，不创建第二个源store，也不恢复旧draft修订保存 |
| `editor-ui/src/CityDefinitionsPanel.vue`、`server/public/stronghold.txt` | 本批已全文读；前者是显式草稿修订／中立配置界面，后者只读旧draft引用，仍按runtimeSlot并显示192锁 | 不把这两处当现行copy主表的唯一入口；仅有词命中不等于现行路由。后续按实际Workbench挂载与DTO追到当前表，旧面板退役不借本任务扩大成全仓清理 |
| `server/public/draft.txt`copy DTO与章节动作 | 已定位copyData.cities投影及cityCopySave；`ChaptersPanel.vue`仍用idx行key（目前只定位） | C6/C7需核DTO捕获、章动作发包与响应重读全链；Vue只收展示DTO，不接源对象或规则表 |

没有为消除命中而批量改旧192／byte常量。规则tile、势力、武将及地址语义保留到各自证据审计；本节不授予删除有引用据点或自动清理章节的权限。

**续查现行copy DTO（C0，非旧draft）：** `server/public/draft.txt:checkedCopyCities`遍历父表字典生成cityId/name/数值行；`checkedCopyData`仍从章state.cities取idx，限0..191，首都role限191。`render`将主表copyData.cities及章城市分别复制进Vue DTO。`editor-ui/src/StrongholdPanel.vue`调用`cityCopySave(row.cityId,patch)`；该面板而非旧`CityDefinitionsPanel.vue`是现行copy据点资料写入入口。`checkedCityDefinitions/submitChapterCity`是另一旧draft分支，不能为消除限制改错入口。

**续查服务边界：** `server/gamecopy.js`章节patch白名单对city-faction/set-capital/city-governor仍要求cityIdx≤191；city/city-native数值编辑在这一层只检查非负安全整数，后续核心负责城存在及值域，不等于它已经支持新增城。势力0..21、武将0..127及owner byte限制不是本轮城市身份限制。后续须将这五类城市操作的请求键／DTO引用一起转为稳定cityId，按章解析；不得只扩大数值上限，或将客户端报的运行index当权威。尚未穷尽全部UI读者，未因此勾完C0。

### 9.10 C1独立子模块：确定性城市身份投影

依§6允许独立实施已闭合纯数据合同，新增`web/src/content/authoring/cityidentity.js:compileCityIdentity`，输入`{cities,cityOrder,placements}`，验证身份双射、单城单放置、384×256整数中心与中心格唯一，输出冻结、可JSON的`{cityIds,indexByCityId}`。主表对象／placement顺序、名称、旧runtimeSlot都不决定索引；运行序列为cityOrder的已放置子序列，无placement的资料保留源内而不生成假节点。建筑完整footprint、章引用、规则初态和可玩准入由后续各自边界验证，本函数不冒充完整源validator；边角中心通过不表示建筑能越界放置。

- **不接旧生产路径**：当前v1源无cityOrder，编译器仍固定192；尚未接schema2、转换器、发布或玩家装配。不是第二引擎、不是第193城可玩入口；主表schema、章引用和battleMapId仍待完整实现。
- **本轮验证**：新增`tools/verify_city_capacity_identity.mjs`首批22/22通过，补放置边界后37/37通过。覆盖0/1/191/192/193/257、254/255/256普通索引、未放置资料、显式重排／删除、改名／旧槽不改索引、JSON往返、输出脱离调用方及重复／缺失／悬空身份负控。续批覆盖四角中心、移动不改索引、重复中心（含±0别名）、非法坐标11组及98304个互异中心的纯投影；全平面样本不是可玩容量或建筑放置认证。测试只用内存，无文件读写、SAVE、IDB、网络或浏览器。
- **构建／检查**：两文件`node --check`与`git diff --check`通过。共用引擎包同步244模块，SHA `c78dcdcac24c73c8b052c8eb4ac744f2376d07d07cbb2845dd97ecf718d01dd0`，显式重建返回unchanged；shell/play未变。主动LSP两路径均push-only/inconclusive，mode=all无已认证缓存，不报clean。
- **未完成**：这不是C1整项完成，尤其删除引用闭包、完整footprint冲突、隔离旧源转换和后续规则引用尚未接入；M192/M193/M257游戏验收均未执行。D1–D6仍待确认。

#### 9.10.1 C1据点源属性边界（已实现，尚未接GameSource新版）

`content/authoring/citysource.js:captureCitySource`复用身份／中心校验，捕获独立的据点源片段`{cities,cityOrder,placements}`及其identity投影；不是完整GameSource、运行装配或发布准入。

- 据点定义只接`cityId/name/max_prod/prod/growth/defence/troops/troops_cap/type/view/battleMapId`。旧`runtimeSlot/x/y/raw`以及其它未知字段明确拒绝，不能悄悄丢弃溯源；旧源转换必须另行把原slot/raw保存在来源记录中。
- placement接`cityId/x/y`及可选`id/componentRef/variantRef/importRef`；真实登记源含后四项，必须逐值保留。元数据为非空字符串，componentRef另允许null（沿共同composer无stamp语义），出现的实例id须唯一；其它未知字段拒绝。定义不再重复拥有坐标。结果隔离此纯标量片段的字典、行、顺序和placement，不引用调用方可变数组／对象；资源引用存在性仍由共同编译器验证。
- 草稿允许缺项，不自动补默认值；严格模式只要求已放置城字段完整，未放置资料不冒充运行节点。零城通过仅是结构有效，不是可运行章节。
- `max_prod/prod`仍word；`growth/defence/troops/troops_cap`仍byte；`type/view`为原C16的两个nibble。上限255合法，不能因原样本最大254收窄。提供的prod／troops不能超过对应提供的上限，不做隐式钳位。
- 这里的可变数字是**新章默认值**，尤其`troops_cap`不覆盖已有章具名初态；实际章节引用与覆盖编译尚待实现。战场ID此处只验证非空字符串，是否存在／适配由后续目录门负责，不因字符串有效而称资源就绪。
- 新测试`verify_city_source.mjs`首批13/13、补真实placement元数据后14/14及身份37/37通过，覆盖0/1/191/192/193/257、缺项／额外字段、byte/word/nibble边界、超上限拒绝、不依type算城兵、JSON与捕获隔离。仍未接生产旧schema，也没有宣称M193/M257通过。

#### 9.10.2 C1旧据点源片段转换与独占输出（已实现）

`content/authoring/citysourceconversion.js:convertLegacyCitySource(game,{defaultChapterId,battleMapIds})`只转换据点主表／placement片段，不把整个旧GameSource改成schema2：

- 要求旧schema1、完整且唯一的0..191槽、192个placement，并核主表坐标与placement一致；按旧slot生成cityOrder，不按对象插入顺序或地图扫描排序。新定义去掉slot／坐标，原绑定独立保存在`legacyBindings`。
- 调用方必须明确指定默认章及192个战场ID，不推定“当前第一个章节”，也不把slot字符串伪装成已存在的资源ID。允许多个城市共用同一战场ID；是否真实存在／适配仍需目录检查。
- 新章默认`troops_cap`从所选章具名数据按idx映射一次；主表已有其它默认值保持。所有已有章、首都、raw和其它状态不改；该函数不转换章节，后继章节城市片段由§9.10.4另行投影，完整章节转换仍未完成。非法槽、缺上限、坐标冲突及不完整定义拒绝，不补值、不钳位。
- 输出`{citySource,defaultChapterId,legacyBindings}`与输入无可变引用，JSON可往返。它没有“完整游戏已转换”身份，不可交给运行／发布门。

工具入口（须显式输入JSON，不读取SINARIO／SAVE）：

```bash
node tools/export_city_source_projection.mjs --source /path/game-v1.json --default-chapter <chapterId> --battle-maps /path/battle-ids.json --output /new-parent/new-round
```

`battle-ids.json`为按旧slot排列的192个明确资源ID字符串。工具先只读输入并完成片段校验，再允许创建父目录，独占创建新轮次叶目录；已有叶目录一律拒绝。当前修订`city-source-projection-4`输出`city-source.json`、`legacy-bindings.json`、`chapter-cities.json`，最后写`receipt.json`，绑定输入两份JSON、输出三文件SHA、章数／计数差异数，以及导出器和六个转换／校验／解码模块SHA。修订2的五代码文件／两输出收据保留，不回写。收据显式排除其余章节状态及剩余原生初态转换、道路转换、运行准入、发布及存档迁移；中途文件写入失败可能留不完整目录，不得因目录存在视为成功，也不自动覆盖重试。

`verify_city_source_conversion.mjs`6/6通过：纯转换与11组坏源负控、显式默认章、共享战场ID、输入及输出隔离；CLI只在新临时目录运行合成夹具，验证缺失父目录创建、同输入两轮逐字节相同、输入不变、已有轮次拒覆盖、坏源不创建输出、收据SHA准确。未执行真实登记源的完整转换；本项不能勾掉C1整项或M192验收。

#### 9.10.3 真实登记源片段核验（非运行验收）

新增`tools/verify_city_source_registered.mjs --output <新独占轮次目录>`：经只读`createPinnedCopyLoader`核41个实际登记Web输入，使用固定审计身份和确定性实体ID构造共同full-copy的内存结果，不走真实账户／copy API。原先合成夹具漏了placement的实例／素材／变体／导入来源四字段；补真实形状负控先失败，随后显式支持并逐值保留，而非在导出工具先剥掉字段来造通过。

最终本轮产物在`.dragon-analysis/city-capacity/registered-city-source-r2/`：192城及placement逐项对照、20章原状态不写回、两轮输出逐字节一致、41登记输入运行后重核SHA不变；`audit.json`绑定登记身份／输入SHA／投影五文件和审计四文件SHA，子轮receipt绑定捕获JSON与各输出。r1是升级工具SHA收据前的首轮，保留、不覆盖、不追补。

**限制**：本轮battleMapIds明确使用`audit-only-siege-*`运输探针，不认证任何真实战场资源ID；原源经共同copy投影后只验证据点片段，不是完整GameSource v2转换、真实API创建、道路／章节引用迁移、M192可玩或存档／发布验收。当前完整源转换仍待C1后继，不能从此收据跳过C2–C8。

#### 9.10.4 章节城市值、首都／目标与城数投影（rev3）

`chaptercityconversion.js:convertLegacyChapterCities`基于已验证的旧192槽→稳定ID映射，为每章生成城市字典（所属、太守、prod/growth/defence/troops及本章troops_cap）和势力城市引用片段；不把新章默认值覆盖已有章。首都／primary／secondary转换为`capitalCityId/strategicCityPrimaryId/strategicCitySecondaryId`，原FF只在旧数据边界解成null；非法原192以外引用拒绝，不能借导入器把0xFE解释成新增城。

**22物理槽与公开表分离**：最初仅遍历公开`state.factions`，实登记源upper-1的21号城主因此被误判为悬空。现复用生产已有`decodeFactionSlot`读取完整`nativeFactionSlotRaw`的22槽，输出每槽`factionIndex/declared`；未公开槽仍未公开，不扩大势力容量。公开首都／目标若与raw冲突则拒绝；公开未命名的字段可取已存在完整raw，而缺raw不从公开表猜造。该侧表不是可以直接替换公开`factions`的完整势力对象。

D6已批准的导入计数在此执行：按本章各城所属统计整数`nCities`，逐物理槽记录`countChanges={chapterId,factionIndex,before,declaredBefore,after}`，同时保留raw旧计数和公开旧计数以免掩盖分歧。中立null不计入任何正常势力。只输出新侧表，不写原F23、不改运行财政阈值或未知字段。

验证：新纯内存5/5（含14组坏源不变负控）、旧转换／CLI6/6通过；CLI缺物理源时也在创建输出前拒绝。实登记源新轮次`.dragon-analysis/city-capacity/registered-city-source-r3/`通过20章3840城、440物理势力槽的逐字段／引用／计数对照，共报告39处计数差异；审计oracle直接对原raw的F03/F16/F17/F23及具名城市值核对，不复用被测转换器算预期。41登记输入不变、原章JSON不改、两轮全部输出逐字节同，rev3绑定七个代码文件SHA；旧r1/r2不改写。

**仍未覆盖**：其它章字段、原生城市完整初态、军团／武将去向引用、道路、真实战场目录、运行装配、正式发布与保存。使用的战场ID仍为明确audit-only运输探针；以上不是完整新GameSource、M192或193/257游戏验收。

#### 9.10.5 导入章已知城市初态投影（rev4）

在上述每章城市值旁新增`initializer`，从该城完整32B原记录提取现有fresh城市消费者所读字段：C00→`attr`、C17→`_aiCooldown`、C1A→`_strategicLastFaction`、C1B→`strategicBorderCount`、C15→`disaster_event`、C18→`cityCacheByte`、C1C..1F→有序四项`neighbourCityIds`（原FF→null，其它原索引须落在已知192槽）。这些字段沿现有`scenariocitycache.js`已证输入映射，不在本批添加规则或将其它未知字节重新命名。

- 不按当前属重算旧属，不按当前驻军重建C18，不清旧冷却／灾害，不按边界计数修正attr；包括原C00 bit4/5及0x64样本都保原byte。旧章导入不同于D6新城零初态，二者不得混用。
- 四邻接保持原槽顺序，包括FF后的尾槽，不排序、不压缩空位；暂不假定其顺序与道路图端口顺序相同。C2仍须分别核军事邻接与导航端口合同。
- `city.raw`必须完整。若有`nativeCityRecordRaw`副本，须完整且按原slot与主记录同字节（允许hex大小写差异）；若有同名具名初态／`strategicNeighbours`，须与原byte一致。缺来源、冲突及无法映射的原邻居明确拒绝，不靠默认值或丢弃尾槽通过。
- 输出初态是新源片段，不含原raw，也不改输入raw；完整捕获源和输入SHA仍是溯源。尚未接新的运行装配／保存消费者，不得把这些字段直接注入旧192世界来冒充新格式准入。

新轮次`.dragon-analysis/city-capacity/registered-city-source-r4/`逐字段／逐邻接核20章3840份初态，仍核22物理槽／章和39项计数差异；41输入及原章不改、两轮输出确定性一致。7/7章节转换、6/6导出CLI通过；负控覆盖短／非hex原记录、重复raw冲突、未知邻居及同名字段矛盾，正控覆盖旧属不同于当前属、cache255、attr0x64、空位后仍有邻居及输出隔离。r1–r3收据保留，不回写。

这不是完整CityInitializer设计／新城创建或C4验收；人物／军团／事件等初态、道路、真实战场、运行／发布／保存仍待。新源只描述当前已知的具名城市输入，不能把尚未投影的原字段认作unused。

#### 9.10.6 C2结构化道路运输投影（不含寻路／运行切换）

新增`structuredroadgraph.js:projectStructuredRoadGraph(roads,citySource)`。调用方先用`captureCitySource`捕获未修改的城市片段，投影边界校验道路身份／端点、显式byte费用、点坐标／flags、精确bounds及两个互逆端口，不重复校验已捕获的城市身份／坐标。

```text
v2 node.edgeSlots = 方向位 | (0800h + edgeIndex*16)
        ↓ 仅表示转换；保持槽序、边序、点序，不运行搜索
v3 node.ports[0..3] = null | {roadIndex, end:'from'|'to'}
   edge = {roadId, fromCityIndex, toCityIndex, cost, points, bounds}
```

- 节点按cityOrder已放置子序列，含cityId、cityIndex和原坐标；边按源道路数组次序，roadId独立于数组索引。每边两个端口必须各属实际from/to城市且槽0..3不冲突；空槽明确null，roadIndex0/255/256均普通值。
- 不再用节点×8、边区0800h、方向高位或点区地址存储；运输层无旧384边／6144点预算。四端口与384×256范围继续保留，不凭本投影解除建筑footprint或请求体预算。
- cost和每点flags仍byte，bounds要求与点列一致但不替缺项生成输入。点列不追加城市中心，不以视觉travelKind推成本／flags；导出运行片段不替换源道路中的视觉components／provenance。
- `version:3`当前仅为待接入的结构化运输产物；旧加载器／存档仍拒绝v3。新费用推导、费用扩域、道路视觉端口准入、搜索、军团位置和全部caller均未由本函数实现，不能跳过其门槛。

纯内存`verify_structured_road_graph.mjs`8/8：正常域逐值对照旧encoder、193/257节点及386/514边、索引192/254/255/256、6145点、城市重排、孤点／空图、14组坏字段和缺槽／碰撞／稀疏数组、显示分类不改规则值、输出隔离。大样本只测运输结构，几何不冒充可放置地图。

实登记源新轮次`.dragon-analysis/city-capacity/registered-city-source-r5/`增加`road-topology.json`：192节点、254边、5526点与旧`encodeRoadGraphV2`逐端口方向／端点／费用／flags／bounds对应；文件SHA `5281b3944009925286c9245457a50a5c204698e53a2cb44de7c85aa837b0c71e`。audit绑定新投影器及旧encoder代码SHA，并重核41输入、源对象／章节未改、现有两轮城市输出与3840初态／39项计数差异。城市导出器仍rev4；道路运输另属audit产物，不把旧收据改成道路迁移证书。此对照是代码表示验证，不是原CPU、真实路线或M192证明；原路线语义仍按原证链及后续运行对照验收。

#### 9.10.7 C2结构化寻路隔离核（旧费用域，未接运行）

新增`navigation/structuredroadsearch.js`，以结构化端口和动态数组保原491B按批最小费用、旧项／新项交错及双端口访问次序；返回D5的`found/already-there/unreachable`，不把耗尽0800当道路。当前费用明确为原`costWord`语义，保16位加法／OR8000，不是已批准的新费用扩域；v3正常运行准入未打开。

局部8项验证通过（含KI原窗pin、非优先队列反例、原word回绕、索引192/254/255/256及256项同时待处理前沿）；实登记源新r6完成52176查询的地址版／结构版逐项对照，包括返回道路／方向／费用与所属读取顺序。原41输入、源对象、结构图不改，城市两轮输出仍一致；旧r1–r5报告保留。精确配置、原窗／轨迹SHA及报告范围唯一维护于[行军原证与实现边界](re-notes-march-pathfinding.md#city-capacity-structured-search)。未核全部所属组合、CPU执行、移动／撤退caller、费用新政策、保存或M192完整战役；不以查询对照替代C2/C5完成。

#### 9.10.8 C2结构化位置选边决策（隔离，未接运行）

新增`structuredroadselection.js:selectStructuredRoad`复用结构化491B反搜。节点选边给首／末点，边内改向保留点游标；已到达、无路、原费用门去向请求分别返回，不用假边或副作用表达。新增6项与旧47BB的结果／惰性读取／写集对照通过；费用仍旧word域，未抢先批准扩域。完整合同、原窗SHA与限制见[选边边界](re-notes-march-pathfinding.md#city-capacity-structured-selection)。

特别区分规则pointIndex与实际XY：原选边可能先写点游标、在candidate接敌时尚未提交坐标。残留L0A/L0C及status bit0不能只按联合类型一删了之；本批尚未修改运行军团字段／序列化，不据此宣布位置与保存迁移完成。原192装配门保留。

后续实登记r7新增56160次47BB节点／边中点／方向／目标／command的三所属profile对照，通过结果、owner读取与原写集次序检查；原52176次491B对照和城市转换也重跑通过。独占报告在`.dragon-analysis/city-capacity/registered-city-source-r7/`，旧r1–r6不改；采样范围、轨迹SHA及未覆盖项仍由上述[选边边界](re-notes-march-pathfinding.md#city-capacity-structured-selection)唯一维护。未执行实际写回／移动／去向／存档，不改本节未接运行状态。

#### 9.10.9 C2结构化撤退选址（隔离，未接运行）

`findStructuredRetreatCity`已落地487B的首都／双端点筛选／反搜／下一城所属判断，返回found／already-there或带原因的unreachable；无首都、外属端点、图不通及下一城外属分开，不执行去向。静态原窗及7项回归（含640次正常查询逐结果／所属读取序对照、等费端口顺序、孤图和索引256）通过，详见[详细维护源](re-notes-march-pathfinding.md#city-capacity-structured-retreat)。

输入图和typed位置归边界所有，本函数不清残留、推算XY或提交军团写集。现行originalRetreatRoute／战后continue／守军撤退仍未接新结果；不可将原null→fate调用链机械接到unreachable。当前只是C2迁移部件，不是D5运行撤退、M192或新图支持完成。费用扩域仍待批准。

后续真实登记图r8增加三种所属配置、全部节点／边中点、采样首都及端点／null的30720次487B决策对照，通过结果与所属读取序核验；原52176搜索／56160选边及41输入不改也重核，并与r7收据相同。范围、失败分类、轨迹SHA和未覆盖项仍由上述详细源维护。运行接线须先区分原continue/garrison的null→去向与已批准无路等待，保证待撤退状态能保存且不会继续旧目标，不能只把失败改返回true。

#### 9.10.10 C4攻城资源身份与战术入口解耦（局部已接）

`content/battlemapcatalog.js`从现行完整BATTLE目录捕获前192项不可变元数据，定义Web稳定资源ID `ki-1995:siege:0`…`ki-1995:siege:191`。这里192是既有攻城**资源库**数量，不是城市容量；192..213野战目录不开放为攻城绑定。ID不是原版字段，不能从新城index生成。目录项保留原idx/layout/theme，缺项／错序／非byte拒绝；布局内容、导航规则和资源SHA仍归现有加载边界，不以目录捕获代资源认证。

`main.ensureGameAssets`在资源装配边界一次捕获`siegeCatalog`，向内传不可变目录，单场投影不重复校验完整目录。`createSiegeProjection`已消费显式`city.battleMapId`：通过目录解析资源，`directoryIndex`用于加载战场，而`view.city`继续引用实际据点。缺失／非法的**显式**绑定不能回退到city.idx；旧未带字段的192城兼容输入暂按原目录解析，但超出0..191不能误取野战项。该兼容是同一战术入口的旧输入映射，不是第二套引擎；新源正式接线时应全部具备显式绑定。

现有`createBattle→createHandle`保持mode0并把实际`view.city`交给exitContext，导航通过资源directoryIndex读取每目录独立地图，不以layout编号替代完整地图。新增detached探针以城市256／257共用资源0，分别验证玩家攻方／守方：实际Session加载原图／镜像图、攻城mode、exitContext目标对象、RNG消费计数和两个Session地图独立。没有把资源0误写成目标城市0。尚未覆盖退出时完整城损／捕获写回和战略D32/D34解耦，因此不是高索引城攻城全链验收。

`verify_battle_map_catalog.mjs`7/7通过，直接只读现行`web/battle_maps.json`验证192项目录元数据逐同、旧绑定同投影、高索引目标、错误绑定拒绝和显示数据隔离；首次隔离测试把源人头数1000错当显示十人单位，按既有`legionBattleUnits`的/10投影改预期100，未改换算公式。扩展`verify_battle_tactics.mjs`通过，另外只读`battle_navigation.json/battle_rules.json`；没有读取SAVE／用户profile、联网或写资源。不能用当前JSON代码一致性认证原始BATTLE机制。

真实登记源r1–r8仍含audit-only运输ID，旧报告不改。续批r9（`.dragon-analysis/city-capacity/registered-city-source-r9/`）改为实际`ki-1995:siege:*`：41角色源与程序资源分开取证，另绑定`web/battle_maps.json`的2142364字节／SHA `ccc1459ee8d1f09600667ff02d9e438d2c6efa7e541667d3aa27845f6ff6e10b`，写独占`siege-catalog.json`（SHA `c750ab3b87ab053ad6c6d490c911be5e319def2ce37d9dac3ea983280c840158`）。192城逐slot对目录元数据，资源输入前后SHA不变；收据的14份审计代码SHA包含目录捕获模块，转换器仍rev4／7份代码SHA，不借新增报告重写旧收据。

r9重新通过两轮城市／章节产物、52176寻路／56160选边／30720撤退对照。另独立比较r8/r9：41输入、章节城市／旧绑定文件、全部道路结果与39项计数差异相同；city-source只改变192处battleMapId。目录绑定有效不等于类型／布局适配、原BATTLE二进制认证或正式包登记，收据明确排除这些项。

战术续测还以索引256／257、不同城兵基数、共用资源0构造受控退出，`settleVisualBattle`的cityDamage分别与同属性旧索引0基准一致、两城输出不同，玩家攻／守两方向均通过；退出不耗RNG且不写城市对象。该测试强制finished／固定wallRecords，只认证输出取实际目标，不冒充完整打完一战或战略城损提交。

作者选择UI、类型／布局适配、发布检验、正式资源身份绑定及C5保存仍待，C4不勾整项完成。

#### 9.10.11 C1/C3章节城市ID到运行索引编译（隔离片段）

`web/src/content/authoring/chaptercitycompile.js:compileChapterCityState`消费**严格捕获后未改动**的citySource、已校验的结构化道路图和具名章节城市片段，返回独立`{cities,factionCities,cityCache}`。仍不是完整Scenario／存档恢复器，不直接塞回旧native-v2装配。

- 城市数组按cityOrder的已放置子序列排列；name／max_prod／type／view／battleMapId取主表，坐标只取placement；七项章值及具名initializer原样保留，不用新章默认值覆盖。C18单独编译为同序byte数组，不改成实时占格计数，不造raw。
- 章节城市必须恰好覆盖已放置身份；主表未放置资料仍可保留，但章节配置、首都、一次性指令或邻居若引用未放置／不存在的城市，严格编译拒绝，不静默漏项。四邻居槽保序，空值仅null；索引192／254／255／256均为普通城市。
- 22个物理势力的城市片段保持`factionIndex/declared`，输出`capitalCityIndex/strategicCityPrimaryIndex/strategicCitySecondaryIndex/nCities`；中立所属仍null，不新增24号势力。nCities须与源章节实际归属一致，陈旧／坏计数拒绝；这是**新局源编译**检查，不用于live F23、捕获消息中间态或读档，不改原先已提交前缀的计数寿命。作者归属编辑后须同步其源派生计数再编译。
- 校验由本边界一次完成：章值byte/word域、完整initializer、四槽邻接、完整物理势力及引用。不重校已捕获主表，不推断缺失字段；运行消费者的支持域、其余角色数据、战场类型／布局、版本身份与完整保存仍由后继共同编译／装配门闭合。
- `tools/verify_chapter_city_compile.mjs`首批12/12通过（后续14/14见§9.10.12）：0/1/191/192/193/257，重排后的引用与缓存对应、高索引首都／邻居／指令／计数、未放置引用、隐藏物理槽、20组错误负控、JSON往返与输出隔离。0城结构有效不等于可玩新局；257仅片段测试，不是M257。
- 实际登记源独占报告`.dragon-analysis/city-capacity/registered-city-source-r10/`：20章3840城市／缓存及440物理势力片段逐项与原state／raw字节的独立oracle一致；`runtime-city-slices.json` SHA `c15e4c47f8d558246ccc5f5e3a70d8c798a5f182713ed1712e49f2bc34ff7d13`。报告绑定15份审计代码＋原7份转换代码。原52176搜索／56160选边／30720退路对照、41输入、真实攻城目录及39计数差异全部复验；另只读比对r9/r10，原四份转换产物逐字节一致，旧道路／目录／计数收据字段不变。r1–r9保留不改。

**未完成：** 尚未汇入全GameSource编译、v3世界装配或现行军团／财政／事件消费者；其余初态、位置与快照版本未因此就绪。C1/C3/M192不以本片段通过结案。

#### 9.10.12 C1/C2/C3战略邻接与导航端口分离

本批核到C1C顺序不能从道路端口顺序重建，88CC位序原证及登记输入统计唯一维护于[战后§12.3.1](re-notes-legion-fate.md#city-capacity-strategic-neighbour-order)：3840行连接多重集合相同，2600行非空顺序不同；导航114节点有中间空槽，战略数组没有。不可把排序比较时的临时数组写回，也不能把导航slot直接当C00位号。

`compileChapterCityState`新增必需的已校验图参数，核城市数量／ID顺序／index／坐标与citySource一致，并比较每城战略邻接与实际道路端点的多重集合；保留各自原序及原初态。已知但未连接的引用、与图不符的漏项／重复邻接、陈旧图配新顺序／坐标拒绝。该检查是新局源编译接缝，不改变live／保存的原字节消费，也不认证间隙战略槽的运行行为。

新增拓扑负控和逆序端口正控后测试14/14通过。独占r11重跑全部实际登记验证，`runtimeCitySlices.neighbourOrders`记录上述统计；另只读对照r10/r11，runtime-city-slices仍为SHA `c15e4c47f8d558246ccc5f5e3a70d8c798a5f182713ed1712e49f2bc34ff7d13`，41输入、转换代码、道路三类轨迹、攻城目录及39计数差异不变。旧报告未改。仍非M192；D6完整新城初态生成、改路时的源写集以及v3运行消费者后续接线，不将本次编译检查冒充这些功能。

#### 9.10.13 C3军事候选表类型化（已接现行函数）

`runOriginalCityMilitary`的私有工作表已由byte身份＋FE/FF改为结构化候选与独立威胁标记，保四槽顺序、重复owner/cache读、威胁byte回绕、一次405D及既有第四候选Web例外；详细维护源见[行军原证／现行表示边界](re-notes-march-pathfinding.md#city-capacity-typed-city-candidates)。本轮native city35/35（含1..4候选×256随机byte和混合邻居读取轨迹）、原窗静态核对及TALK38续段通过，不认证原CPU。

这一步实际改同一生产函数，不新建简化AI；neighbour byte/FF及派令／编成／缓存／v3装配仍待改，cityOwner的192／DS指针已由后继§9.10.14解除。不能把候选数组可装宽整数当作高索引军事入口通过。原版工作表证据保留为原版记录，不改写成结构化对象。

#### 9.10.14 C3索引所属服务接入同一军事／治理叶

`readCityOwnerByIndex`成为live所属的共同读取体，旧地址API先保留192槽地址验证再复用；Scenario能力新增`readCityOwner(index,instruction)`，军事／治理九处读取去除DS拼地址及重复固定槽校验，未知值与故障标签保留。详细维护源见[所属索引边界](re-notes-march-pathfinding.md#city-capacity-indexed-city-owner)。

索引服务8/8、native city36/36、治理算术3/3（393216样本）、月度外交15/15、movement35/35、capture18/18及请求续段通过。高索引治理使用同一生产叶与真实索引读取服务，不是另一套简化规则；但未通过新世界装配，派令／编成／缓存／道路位置等仍限制完整路径，因此不代表新城运行准入或C3完成。

#### 9.10.15 C3战略邻居索引边界接入同一军事叶

`readOriginalStrategicNeighbour`只做单格旧C1C解码，FF为空引用，不压缩／排序／修复；军事仍四槽懒读、null终止，其它消费者保留各自语义。详细维护源见[战略邻居索引边界](re-notes-march-pathfinding.md#city-capacity-typed-city-neighbours)。显式nullable-index输入已验证192/254/255/256可派令且仅null终止；旧byte解码仍不能产生高索引。邻居存储、v3装配及完整高索引路径仍待接，不代表C3完成。

#### 9.10.16 C3到达刷新现属读取改索引

`refreshOriginalCityCache`的3F11现属读取由`0x841+idx*32`改为`readCityOwner(idx,"3F11")`，与军事／治理共用同一索引体；旧属比较、F17写回门、冷却前缀与C18刷新不变。到达首读当时仍走旧地址API（未放宽192门），已由后继§9.10.17改为按节点解槽的索引读取。native city36/36、arrival32/32及请求续段通过，不代表完整到达路径已脱离地址域。

`readOriginalStrategicNeighbour`只做单格旧C1C解码，FF为空引用，不压缩／排序／修复；军事仍四槽懒读、null终止，其它消费者保留各自语义。详细维护源见[战略邻居索引边界](re-notes-march-pathfinding.md#city-capacity-typed-city-neighbours)。显式nullable-index输入已验证192/254/255/256可派令且仅null终止；旧byte解码仍不能产生高索引。邻居存储、v3装配及完整高索引路径仍待接，不代表C3完成。

#### 9.10.17 C3到达首读按节点解槽改索引

`originalroadstate.js`新增`roadNodeToCitySlot(scenario,node,instruction)`：`BX`为城市节点（8*slot），`BX*4`即城市基址偏移，`DI+0x841`即该城+1所属byte；用同一u16回绕／32对齐解出槽位，再以`cities[slot].idx===slot`验身份，不设192槽门。`arriveOriginalRoad`的28F4首读改用`context.readCityOwner(slot,"28F4-first")`，错位／回绕越界／身份错位仍fail-closed。`performOriginalRoadAction`内联`cityOwner(node)`（候选攻城门与42AB端点检查）改用同一解槽＋索引读取，标签为`movement-owner`。`arriveOriginalRoad`的`cityAtPointer`私有指针校验（`cacheAt`／4311／attr／4549坐标／缓存递减，含4300截留重入）改用共享`cityAtRoadPointer`：同一起始／32对齐，按live城市长度验`idx`身份，不设192门，失败仍为带指针与指令的fail-closed RangeError。movement的47BB寻路plumbing仍走旧地址API（共享`originalroadsearch`契约，另行转移）；movement`cityAt`／目标桥`191*8`及`retreat`同类读取仍带旧门。`verify_original_road_state`10/10（含新增指针桥超192／错位／身份错位覆盖）、arrival32/32、movement35/35、siege12/12通过，不代表完整到达／移动／撤退路径已脱离地址域。movement目标桥与城市节点门（`targetNode`读写、`cityAt`、`nodeize`落点）已按live城市长度动态化，城市表缺失时沿用旧门；retreat的474A驻留检查与BX返回校验已按live长度动态化。超192节点的完整移动／撤退进入仍未用真实大世界验证。road_callers31/32与march_resume的失败经stash基线复核为改动前既有环境失败（夹具装配期地形／路图），非本轮回归。

#### 9.10.18 C4攻城入口城市门改动态长度

`performScenarioSiegeEntry`（movement围城等待的下游）的私有指针`cityAt`与28BB入口`cityIndex>=192`门，分别改用共享`cityAtRoadPointer`与live城市长度＋`idx`身份校验；诊断标签（`city address/identity`、`28BB city pointer alias`）保留，失败仍fail-closed。192城生产行为不变；高索引攻城的完整战斗链（battle IO／俘虏／灭亡扫描）仍未做超192验证，不声称高城攻城可玩。siege12/12、siege_result、npc_siege_evidence、movement35/35通过；siege_contact_march装配期失败经stash基线复核为既有环境失败。

#### 9.10.19 C2/C3寻路索引读契约（可选注入，已接）

`searchOriginalRoadMemory`新增可选`readCityOwnerAtNode(node,at)`＋`cityNodeBound`：提供时以索引读替代D52地址读、以live界替代0x600城节点门；缺省走旧契约，既有夹具字节行为不变。`selectOriginalRoad47BB`经`io`透传（无新字段的mock即走旧路）。movement与retreat在`context.readCityOwner`能力存在时注入（`readRoadNodeOwner`＋共享`cityNodeBoundOf`，原movement私有界已改为共享导入）；能力缺失的旧mock保留旧地址读。retreat的487B三处读（两端点、`search`内、终点`BX+0x841`）统一经同一契约，终点先验`BX%0x20`再解节点。`verify_original_road_search`11/11（含新增198..200槽索引链：旧形pin、live界费用、0x600旧界门控、487B found全链路，且旧地址读永不触发）。movement35/35、arrival32/32、siege12/12及结构化search/retreat/selection对照通过；`verify_city_source_registered`为需`--output`的CLI，不能裸跑，非回归。不代表完整高槽位移动／撤退可玩。

#### 9.10.20 C1 fresh缓存合成与初态改live长度（`create`工厂门待定）

`synthesizeScenarioCityCache`与`initializeScenarioCityNativeInputs`改按live城市表长度（城／记录等长＋逐槽`idx`身份，空表仍拒）；192城输出逐字节不变。`createScenarioCityCache`的192槽门（schema／span／slot／snapshot）涉及存档面，本次不动：超192合成span在其处保持fail-closed。`verify_native_occupancy_init`12/12（含新增200城合成＋工厂门拒、城／记录错长拒），arrival32/32、city36/36、road_state10/10通过。不代表新城市世界装配或存档格式扩容。

#### 9.10.21 C3/C5编成／增援／迁都城市门动态化

三处单门改live长度，诊断标签与fail-closed不变，192城行为一致：`createOriginalLegion`的6F89首都门去`capital<192`短路（`idx`身份校验本就存在）；`requestReinforcement`的412B首都门去`capital>=192`门；`originalSelectCapital6A3D`的192扫描改`io.cityCount ?? 192`（`nativeCapitalIo`提供live长度，无count的mock走旧界）。`verify_native_capital_relocation`18/18（含新增199槽选中＋无count回旧界null），formation28/28、city36/36通过。不代表迁都完整链或高城编成可玩。

#### 9.10.22 C4俘虏城市门与首都扫描动态化

`originalcitycapture.js`的`cityAt`去`index>=192`门（改live长度＋`idx`身份，缺表沿用192界，诊断不变），`capital6A3D`首都扫描改live界（与迁都6A3D同策略）。`borders88CC`邻接读经同一`cityAt`，仍为byte邻居域。capture18/18、siege12/12、city36/36通过。不代表灭亡扫描完整链可玩。

本轮同时确认两处有意保留的门（非遗漏）：`STRATEGIC_LAYOUT.citySlots=192`在`scenarioassembly`与`roadgraph`的准入校验是产品准入门（仍固定192城），解除它等于放行超192世界进入生产，未获授权不动；月度／财政／外交／俘虏后继的城市循环与F23算术域（`originalmonthly*.js`、`scenario*`包装、fate/budget）属未批准的财政扩域（见§9.11），不动。

#### 9.10.23 C0准入放行1..256与M193验证（用户授权2026-11-17解除上述保留）

用户明确授权：阻塞项每项如目标需要都允许修改继续。此前未批准项中，与目标直接相关的准入、财政、缓存格式、v3装配及里程碑按此授权推进；D2事件携带、D4天气抽样、费用域仍只在目标需要时才动（本轮未动）。

`originalroadmemory`的192节点门改为live长度1..256（`MAX_NODE_COUNT=0x800/8`，tag／端点上限同随；257+与0x800边基址冲突，需v3节点重编号）。`roadgraph.installGraph`同界（另加`roadNodeCount()`），`scenarioassembly`改live相等（城市数==图节点数，逐槽身份＋中心匹配；`roadNodeCount`缺失时回落192）。`createScenarioCityCache`加`cityCount`（默认192保旧存档面），装配传live长度。`STRATEGIC_LAYOUT.citySlots`保留为原版布局常量，不再是准入门。`verify_city_capacity_admission`3/3：193城fresh装配（末城归属1、缓存合成、索引寻路found(fffc,800,5)且旧地址读永不触发）；JSON快照／恢复往返保留193城与末城归属／缓存；257图／空表／城图不等拒收。内存／v2／checkpoint／search／state／arrival／city／siege／occupancy回归全过；`verify_scenario_assembly`装配期失败为改动前既有环境失败（fetch mock URL与实际资源不一致，stash基线6/6同败）。仍未做财政扩宽、v3装配、M257、存档往返与浏览器回归。

#### 9.10.24 M257设计分解：v3重编号与财政域扩宽（设计，未实施）

M193已验证v2布局上限为256（`MAX_NODE_COUNT=0x800/8`）。257城需要两处并行改造，本节只锁定证据与分工，不改代码。

**A．v2地址天花板（实测＋静态双 Pin）。** `originalroadmemory.js:5/9-10/26-32`：节点记录`id*8`占4槽（`id*8+slot*2`），边记录`0x800+id*16`（至`0x2000`点区），点区`0x2000..0x8000`，搜索工作区`0x8000+`。257城的第257节点基址恰为`0x800`，与`EDGE_BASE`重合。连带三处硬编码同构：`originalroadsearch.js:70`清`0x8000..0x8800`、`84-85/98-99`访问标记在`nodeAddr+0x8000`（节点≥`0x800`即落入`0x8800+`队列区）、`163`队列环`nextEntry & 0xFBFF`写死`0x8800..0x8BFF`128项；`originalroadmovement.js:48/369/412`与`originalroadretreat.js:57`以`>= 0x800`判边，节点`0x800`会被误判为边。`node=slot*8`本身（`/8`、`%8`、`>>>3`、`<<3`、`bx%0x20`、D52解码）与槽位语义在257下依然自洽，无需重编号槽位，只需搬区域。

**B．v3布局（推荐 V3-A：区域参数化，算法不动）。** v2字节逐位不变；v3=`version:3`图：节点表`0..N*8`，`EDGE_BASE_V3=align16(N*8)`（N=257时为`0x810`，边容量`(0x2000-0x810)/16=389`，257城约300边够用），点区保持`0x2000..0x8000`；访问标记仍`+0x8000`（最大`0x8806`），队列整体搬至`0x9000..0x9400`（wrap掩码改为对应环，`nextEntry`按版本分派）；搜索清区改为`[0x8000,0x8000+N*8)`；边类标记改为版本相关`edgeBase`（movement／retreat三处`0x800`比较跟随）。`cityNodeBoundOf`（live长度*8）天然成立：恒有`N*8 ≤ EDGE_BASE_V3`，边地址恒被门排除。D52地址适配保持192旧门（仅旧契约用，索引路径不碰D52）。

**C．F23与月度循环扩域清单（M257必需，N≤256时已证无溢出）。** 存储：`nativefactions.js:46`解码`byte(raw,0x23)`、`101`断言`integer(...,0,255)`、`164`字段表。读者：`originalFactionTick3E14`读F23、`originalmonthlydiplomacy.js`3091／2F17／2F99三消费者（§9.11已证N=257时`cities*8+24=2080`、`min(16N+64/96,…)`无溢出，只需存取扩域、表达式不动）。循环：`originalmonthlyfiscal.js:109`收入扫描、`255`生长更新、`originalmonthlydiplomacy.js:107`候选构造的三处`for <192`改live长度（`readCityByte(index,…)`已是索引式，只动界）；`scenariomonthlybudgets.js:39`的`length!==192`门改live＋idx校验。`ai.js:1769`的`faction.n_cities=cities.length`已是live，无需动。灭亡扫描／俘虏链的城市循环待实施前逐入口复核。

**D．实施顺序。** (a)memory v3编码＋checked＋单测（已接，见§9.10.25）；(b)search区域参数＋单测（已接，见§9.10.26）；(c)movement／retreat的edgeBase跟随（已接，见§9.10.27）；(d)F23存取扩域（已接，见§9.10.28）；(e)月度三循环＋budgets门（已接，见§9.10.29）；(f)装配v3准入（已接，见§9.10.30）；(g)M257深路径单测（已接，见§9.10.31）；(h)浏览器回归（完成，见§9.10.32：harness可跑，主流程绿，257城场景绿；坏图断言为基线既有失败）。存档版本号／编辑器copy（C5–C9轨）与D2／D4／费用域按目标需要另行排期。

#### 9.10.25 M257(a) memory v3编码与checked（已接）

`originalroadmemory.js`新增版本参数化`layoutFor`：v2逐字节不变（256门、`edgeBase=0x800`）；v3（`version:3`）保持`node=slot*8`与全部槽位算术，仅`edgeBase=align16(N*8)`（257城为`0x810`，边容量389），上限512（scratch`[0x8000,0x8000+N*8)`须低于v3队列`0x9000`）。编码器、checked互标校验与checkpoint往返均经`edgeBase`；内存对象新增冻结`roadLayout{version,nodeCount,edgeBase,pointBase}`供后继搜索步骤(b)使用。`verify_original_road_memory`7/7（含新增257城边基址／256槽可读／v2拒257／v3拒513／边溢出／互标／往返）。checkpoint／v2lifecycle／road_graph／search／state共39/39通过；bundle重建`71baddf8…af11b5ec`，shell/play不变。搜索工作区重定位（清区、访问基址、队列环掩码）与edge判跟随留待(b)(c)，本轮不碰。

#### 9.10.26 M257(b) search区域参数与接线（已接）

`searchOriginalRoadMemory`新增可选`regions{scratchEnd,queueBase}`：缺省`{0x8800,0x8800}`与旧清区／队列环逐字节一致；`nextEntry`改环模运算（v2环上与`&0xFBFF`同构）。`scratchEnd>queueBase`（含`<=0x8000`）直接拒收，保证访问标记永不混入队列。`originalroadmemory.js`新增`searchRegionsFor(layout)`（v3为`{0x8000+N*8,0x9000}`，其余回落v2）；movement经`io.roadSearchRegions`透传（`movementIO`按`context.memory?.roadLayout`装配，v2值与旧路一致），`retreatOriginalRoadMemory`新增`regions`参数由`originalRetreatRoute`装配（中途曾在无`context`的解构函数内误引用，已改为参数传入）。`verify_original_road_search`12/12（含新增3节点v3区域链：结果与旧路同`found(fffc,810,10)`、队列事件全≥`0x9000`、超清区字节`0x8018`保留、旧界清零、非法区域拒收）。memory／checkpoint／v2lifecycle／road_graph／state／admission 38/38、movement＋arrival 67/67、siege／city／state／结构化search／retreat／selection 79/79通过。bundle重建`26ac8ca1…f72d4e`（仅门改），shell/play不变。

#### 9.10.27 M257(c) 边类标记版本跟随（已接）

五处`>=0x800／<0x800`边判改为版本相关`edgeBase`（缺省`0x800`，v2逐字节一致）：movement选边经`io.roadEdgeBase`透传（`movementIO`按`roadLayout.edgeBase`装配）、`performOriginalRoadAction`两处（截留门、边端点门）与arrival handler5（`0x0E`边复核）经同一`io`字段、`retreatOriginalRoadMemory`新增`edgeBase`参数由`originalRetreatRoute`按`roadLayout`装配。`result.cx>=0x8000`费用高位与`0x20`槽位桥不动（与地址域无关）。`verify_original_road_search`13/13（含新增边parked链：capital取254避`0xFF`无首都门；v3 `0x820`下`0x800`走城市路`found(fffc,910,10)`；旧界走边分支零端点一致、搜索在别名工作区上耗尽`{ax:20,bx:20,cx:0,exhausted}`；两次端点读后无城市读）。memory／checkpoint／v2lifecycle／road_graph／state／admission／siege／city／结构化search／retreat／selection 107/107、movement＋arrival 67/67通过。bundle重建`48bffa9a…fb8340b`（仅门改），shell/play不变。

#### 9.10.28 M257(d) F23存取扩域（已接，表达式不动）

F23存取由byte扩word，可达域（0..255）行为与DOS一致：`nativefactions.js`断言`0..65535`（`decode raw`仍为byte）；`originalfactiontick.js`3E25读word；`originalmonthlydiplomacy.js`30B0计数读u16；`scenariomonthlyfiscal.js`／`scenariomonthlydiplomacy.js`的IO读数门对`n_cities`放word。`originalcitycapture.js`的±1改为word域回绕`&65535`（production要求：byte回绕会在256城时把计数清零，破坏财政阈值；旧`&255`仅在0↔255边界与word域不同，属不可达态）。`warconsumer`的`own`无门，无需动。阈值／min表达式一律不动（§9.11已证N=257无溢出）。`verify_native_capture_map`抓包256次强制改属复用场景后修正；extinction4FCE 4项不可达态（0城又失城）期望由255改为65535；road_callers循环断言`&255→&65535`＋标题改word域（第二块同属相消`255-1+1`不受影响；该套件本身装配期环境失败，不可跑）。capture18/18、fiscal／diplomacy／budgets／budget-consumer／factiontick 57/57、war_consumer／war_proposal／faction_tick／extinction4FCE／save_snapshot／save_runtime 64/64、extinction_fate通过；extinction_message_fifo与game_save_store为基线既有环境失败（stash同败：minimap资产缺失／store环境）。bundle重建`15265420…496d54e`（仅门改），shell/play不变。月度`for <192`循环与budgets `length!==192`门留待(e)。

#### 9.10.29 M257(e) 月度三循环与budgets门改live长度（已接）

方案A（用户授权继续后按推荐实施）：原生三循环经可选`readCityCount`能力取live长度，缺省192（旧mock与既有行为逐字节一致）；场景IO提供`readCityCount`并放宽城市门（`length!==192`→`1..0xffff`＋idx校验）。财政`scanFaction53C6`循环＋`cities=(cities+1)&0xffff`（与(d)word域一致）、`updateCities5695`循环；外交`buildCandidates`循环＋邻居门`>=cityCount`（C1C byte存储上限255仍在，257+槽引用留待存储扩宽）；预算5715循环。阈值／min／费用表达式一律不动。FFFF别名`nativeCityRecordRaw.length!==192`门保留（DOS 32B raw无257格式，属旧兼容路径）。fiscal10/10（含新增200城：recount＋8、收入增、RNG 200次）、budgets9/9（含新增195槽：金额同字段同值4250、事件槽同编码、RNG 1次）、diplomacy16/16（含新增对照：192域抛2C79、257域零扰动30次RNG）。domestic_budget_event为基线既有环境失败（stash同败：talk.json资产缺失）。bundle重建`c85ae173…fc0b0164`（仅门改），shell/play不变。

#### 9.10.30 M257(f) 装配v3准入（已接）

准入门从v2放宽到v2|v3：`originalroadmemory.js`新增`maxNodesForVersion`（v2→256，v3→512，未知→0拒收）与`edgeBaseForVersion`（v2→`0x800`，v3→`align16(N*8)`，未知→-1），`layoutFor`经二者单源；`roadgraph.js`装配（版本检查＋容量门；v1保持可装载旧256界，行为与基线一致）／`originalRoadGraph`／边地址三函数（`versionEdgeBase`；v3权重门同v2）经同一基址；`scenarioassembly.js`元数据断言／可玩断言／P76门／城市表容量门（`maxNodesForVersion(roadVersion)`）／原生初始化块／context门／snapshot块放行v3；`savegame.js`四处原生存档门放行v3。admission新增M257双用例（257城fresh装配末城归属／缓存／`found(fffc,810,5)`旧址读永不触发；v3快照恢复往返）与513拒收；movement／callers的v1拒收断言改`/must be v2 or v3/`。road_graph／memory／search／state／checkpoint／v2lifecycle／siege／city 96/96、admission 5/5（含新增M257双用例与513拒收）、movement＋arrival＋save＋fiscal＋budgets＋月度diplomacy＋road_graph 106/106通过。bundle重建`df484a5c…f9a99a4`（仅门改），shell/play不变。

#### 9.10.31 M257(g) 深路径单测：257城移动与月度（已接）

admission的fresh／快照只覆盖装配层；本节补两条257城生产深路径。移动：movement夹具加`nodeCount`（默认192）与v3边基址（`(N*8+15)&~15`，257城为`0x810`），`version!==1`分支统一原生初始化／faction源／地形（v1行为不变）；`native_faction_fixture`的192硬门改为live长度＋逐槽保留（根因：它覆盖`nativeCityRecordRaw`，257城下先被截断致缓存合成拒收；192用例逐字节一致）；M257用例以257城v3图出发首点，状态`[2,10,0x810,0x2000,4]`、bit0/1清零，并锁定v3工作区（`0x8808`未知、`0x9000`已用）。月度：fiscal新增257城用例（recount 7→72、收入增、RNG 257次）。movement36/36、fiscal11/11；arrival／city／siege／capital／admission／state／memory／search133项、月度／war／俘虏／extinction106项、save／checkpoint／v2lifecycle／road_graph／结构化三套件41项全过（共327项）。本轮仅测测与夹具变更，bundle与(f)一致（`df484a5c…f9a99a4`），shell/play不变。v2全路径逐字节不受影响。

#### 9.10.32 M257(h) 浏览器回归（完成；坏图断言仍为基线既有失败）

本环境此前判无浏览器，复查发现`%LOCALAPPDATA%/ms-playwright`已有chromium/headless_shell多版本（b39探查误查`~/.cache`）。`verify_road_cold_load_browser.mjs`真实Chromium可跑：含(a)–(g)代码的主冷加载流程（fresh装配＋快照＋道路搜索共享路径）全部断言通过；尾部坏图（`road_graph.json`为`{}`）拒绝断言失败（期望`invalid strategic road graph`，实际`loadSave`未拒），stash基线同败，为既有环境／用例失败，非CITY回归。

新增`tools/verify_road_v3_browser.mjs`（真实Chromium，一次通过）：拦截`roads.json`（默认世界资产实为`content/.../roads.json`，初版误拦`/road_graph.json`致257城对192图装配拒收，已修正）服务257城v3图；页内合成catalog／world／257城raw（faction源为`native_faction_fixture`的浏览器内联移植，`Buffer`改手动hex，`TOTAL`改`graph.nodes.length`，两处`const total`重声明已合一），fresh装配断言（roadVersion 3、257城、末城归属1、缓存0、`found(fffc,810,5)`且旧地址读永不触发）＋JSON快照／恢复往返（257城、归属、缓存一致），零页错误。无产品代码变更，不重建bundle。

#### 9.10.33 C7-F画布放置解禁（已接，UI目录仍预览态）

`mapcanvas.js decoration-place`：materialId命中据点组时，有caller签发`cityId`则走预检（`planCityGroupPlacement`，锚点取选中格，`cityType`须入配方门）＋物化（`materializeCityGroupPlacement`，`newId`复用画布工厂）＋`stage({op:'city-group-place',materialized})`；无`cityId`沿用预览拒绝（既有用例逐字行为不变）。画布不签发cityId（须经C6-1 copy模型路径），UI目录`canPlace`仍false（无cityType／归属输入面），`previewPlacement`不动。`mapcanvas.test`20/20（含新增：无cityId拒收、错cityType拒收、有cityId落stage且源只读）。bundle未变（web/src未动，shell/play不变）。

#### 9.10.34 C7-H删门（已接：先解绑道路＋换原子墙）

`componenttools.js:removeCityGate(source,{cityId,gateIndex,wallMaterialId,wallInstanceId})`：端口须存在（`cityId:gateIndex`身份三项一致）；引用该据点的道路边须先经道路工具解绑（道路按`fromCityId/toCityId`判，模型无端口级引用——有路引用拒删，路本身不动）；换墙tile走原子单格门（tile-≤255、`BYTE_STAMP_RECIPE`、anchor/footprint/variants原尺寸、门格未被占）；全有或全无（注销端口＋落墙装饰，组链其它成员不动，墙装饰不入组）。`occupiedCells`由`citygroupplacement.js`移入`componenttools.js`共享（放置侧保留`BAD_SOURCE`门：源map缺失先判，共享函数消息不变——既有 placement 单测逐字通过）。`mapcommands.js`新增`city-gate-remove`命令（调和器无需改动：不增删组）。新`verify_map_city_gate_remove` 4/4（落墙／未知门／坏墙／路引用／占格拒收全fail-closed且源只读、命令接线）；放置族／物化／落源／拆散／copy_map_ops／component_tools 16/16、`mapcanvas.test`20/20、`verify_copy_map_ops`＋`verify_editor_component_tools` 9/9通过。bundle 255文件重建`4e64515d…d7c6d6a1`（web/src变更入束，shell/play不变）。

#### 9.10.35 C7-I撤销语义锁定（已接：单命令单元＋取消零写）

据点组三操作（place／disband／gate-remove）经`basemap.js`共用stage管线：每次stage调用即一undo单元（`undoSizes`按batch长度记），undo从snapshot重算preview，save是唯一写口，dispose／setIdentity只清本地态。`cityType`缺省等既有行为不变。新`editor-ui/tests/citygroupundo.test.mjs` 2/2（真实`previewMapEdits`＋mock传输：place→disband两步各一单元、两次undo回pristine且零服务端写；stage后dispose零写且dirty清零——初版断言dispose后model未重绘被抓包，已改显式render后断言）。`basemap.test`＋`mapcanvas.test` 30/30全过。无产品代码变更，不重建bundle。

#### 9.10.36 C7-J四模板浏览器覆盖（已接：真机四配方放置／拆散／删门＋保存重读）

新`tools/verify_city_group_browser.mjs`在真实Chromium一次通过：页内（`/src`模块直引）对四配方（`mapcitygroups.json`结构镜像）逐一plan→materialize→`placeCityGroup`（测试签发cityId，锚点分散），随后disband其一（组摘除、记录保留）、第二家先立路引用拒删门再解绑删门成功、JSON保存重读逐字节一致且重读态可继续disband；两视口（1280×800／800×600）结果digest一致，零页错误／零请求外发。UI点击流未覆盖（目录`canPlace`仍false、无caller签发cityId的UI路径不存在）。无产品代码变更，不重建bundle。

### 9.11 C0续查：F23计数与算术域

本批是源码影响审计，不新增原机制认证。`originalFactionTick3E14`已读至费用写回前：先清attr bit6，再读byte F23；财政阈值`(cities*8+24)&65535`，先按signed16与资金高word比较，第二门按unsigned右移1比较。因此仅将n_cities扩大为整数并保留旧表达式，会在N=4093使阈值32768变成-32768，N=8189使65536回绕0。它们在384×256中心数量域内，不能以“地图不扩边”排除；这些数值是现代码数学推导，尚未构成新规则或原CPU新规模结果。

`originalmonthlydiplomacy.js`中三个F23消费者已定位并读体：3091的`power>>>8 >= cities`选择固定2000值，再做资金门；2F17宣战门`min(16*N+64,1562)`；2F99空地宣战门`min(16*N+96,1757)`。这些函数仍由readFactionByte限255。移除该门以后，两个min表达式本身能容纳新计数，但不能据此宣称已核全部原16位中间运算或新规模公式；需把计数输入域与非计数字段溢出分别批准。

UI／非原生包装的命中尚待逐入口核适用性：`game/economy.js`24+8*N、`game/diplomacy.js`N<<8及N<<4、`ui/gamebar.js`进言双方城数比较与迁都候选、`ui/hud.js/startmenu.js`显示；`nativefactions.js`decode/assert仍byte，`scenariolegionfate.js`F23映射及快照断言仍需整链追读。当前字面检索不等于全部caller闭合，不能把旧经济／外交包装当作生产原生链。D6需要明确**扩大城市计数引起的算术中间值是否同步扩域**，而不仅是保存字段改成integer；本批不实施任何阈值修正。


