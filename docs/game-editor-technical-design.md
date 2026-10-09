# 编辑器工程合同（任务一技术分册）

> 状态校正（2026-10-01）：设计轮后已实施部分本地E-02/E-03切片，准确支持域／验证／限制见[journal](checkpoint-journal.md)及[本地验证清单](editor-local-validation.md)。下文是完整系统合同，不代表认证／发布／存档隔离事务已交付，不把本地harness等同完整App试运行。

当前默认的[日期受控采纳](editor-date-adoption.md)通过单一joint release module选resources/作者来源，原地图认可只作精确map-only工程继承，旧assets/副本/history不热换；不是正式互联网发布/CAS事务或新human整屏认可。
当前本地接线：[E-02/03工作台切片](editor-current-workspace.md)共用源/组件/composer/pixels；其后[本地App Trial](editor-local-app-trial.md)已走真实App并禁正式存档，格式studio-app-2保留旧目录。仍不等同完整RuntimeManifest、后台CAS、认证/断网生命周期。

> 设计编写轮状态（历史）：供最终确认的工程设计稿，当时未实施、未通过产品验收。本文中的结构、接口、算法选择均为 **Web 工程方案**，不是新增的原版机制结论。
> 产品决定唯一源：[任务一](game-editor-design.md)；术语：[CONTEXT](../CONTEXT.md)；当前游戏的实施顺序、迁移差异与验收：[任务二](game-map-migration-plan.md)。本文唯一维护具体数据结构、接口和竞态合同，其它文档只引用。
> 设计编写轮授权是补齐设计，不包括产品代码、部署、真实存档、commit或push。未知规则不得用工程默认值补齐；第10节的门槛不是“已支持”声明，也不能在实施时被当作可忽略TODO。

## 1. 身份、修订与权威数据

### 1.1 身份必须分开

| 标识 | 合同 |
| --- | --- |
| `gameId` | 服务端分配、永久不复用；改名不变。内置保留`wolong-builtin`身份，自建及测试副本使用新的不透明ID；不能以姓名、作者或端口代替 |
| 实体ID | 据点、武将、章节、章节势力、组件实例、道路各有稳定ID；引用带所属游戏上下文。删除后不将旧ID分配给新人／新城 |
| `draftRevision` | 每次成功草稿写事务生成新修订；单调序号作为十进制字符串传输，不能用时间戳判断是否相同 |
| `sourceDigest` | 规范JSON及其资源依赖的SHA-256摘要；规范化保留有意义数组顺序、拒绝非有限数／缺洞／重复键，不重排道路或叠放数组 |
| `releaseId / releaseOrdinal` | 前者唯一不可变；后者从0递增，显示为`1.${releaseOrdinal}`，因此第11次是1.10。只有发布提交成功分配序号 |
| `contentRevision / worldRevision` | 编译内容／世界依赖摘要，供装配及缓存验证；不是显示版本或软件版本。美术修改也产生新游戏发布版，不豁免旧档 |
| `schemaVersion / compilerRevision / ruleProfile` | 分别表示格式、编译器及共享规则实现。现有`ki-1995 / web-0.1.1`不因新增游戏而改名，更不是“原规则全部认证”标章 |
| `trialId / snapshotId` | 私有试运行及其准确快照身份；永远不能冒充正式`releaseId` |
| `sourceRef` | `{kind, sourceId, revision, digest}`，复制时固定的溯源信息；不得成为运行时读取“最新模板”的指针 |

序号由事务分配，以十进制字符串／任意精度整数处理，禁止浮点版本号；所有时间为服务端UTC，显示转换不改变排序。同名比较采用trim后NFC规范化、区分大小写，按Unicode码点计数（中英数字各一）；拒绝控制字符、孤立代理项，原作者文字不转繁体。名称8／简介20限制按此计算。同作者的草稿名和当前正式名均登记占用，只允许同一游戏共用，防止改草稿名后另一游戏抢旧线上名；旧历史公告不永久占名。此为字符计数及重名检查的工程细化，不增加大小写不敏感的产品规则。

### 1.2 创作包 `GameSource@1`

逻辑结构如下；实际存储可以分块，不能因此形成多份权威数据。

```text
GameSource
  schemaVersion, gameId, sourceRef?, ruleProfile
  metadata { name, introduction }
  map { bounds, base, decorations[], roads[], placements[] }
  componentDefinitions { definitionId: ComponentDefinition }
  cities { cityId: CityDefinition }
  generals { generalId: GeneralDefinition }
  chapters { chapterId: ChapterDefinition }, chapterOrder[]
  assets { assetId: AssetReference }
  compatibility { importRef, opaqueRecords, slotBindings, evidenceBindings }
```

- `ownerId/createdAt/modifiedAt/draftRevision`由服务端维护，不接受客户端伪造；公开名称／简介来自当前正式修订，草稿改名不能直接改变玩家目录。
- `compatibility`由导入器／受信编译器维护，作者表单不可任改；原始未知字节、已证零及“未取得”是不同状态，不能用`null/0/FF`互换。只有具名字段明确负责的位允许覆盖，输出不得同时保留分歧的raw与命名值。
- 工作区另存`selectedLayer/hiddenLayers/lockedLayers/camera/selection`，不计入内容摘要、发布或规则；手动保存冲突不能靠工作区状态覆盖别人的草稿。
- 草稿允许语义不完整；JSON结构、整数／资源大小、安全、ID所有权仍必须合法。引用未配置用显式缺项诊断表示，不能保存可执行脚本或任意URL。

### 1.3 复制合同

复制开始时原子捕获来源修订及完整依赖清单，全部读取该修订；来源期间更新不影响此次复制。创建目标、登记资源引用和`sourceRef`一次提交，失败不留下可见半成品；同一请求重试返回同一目标。

普通新建只带地图、组件定义、匹配道路和据点基础资料，章节／人物／势力为空。据点中立是新章节归属的显式初态，不向全局据点资料塞势力字段。管理员完整测试复制带全部章节、人物及归属，目标所有者为发起管理员；重新分配游戏／实体身份并重写全部内部引用，保留来源到目标的映射及原运行槽绑定。不得复制玩家存档或运行时队列。

共享内置图片可以只读引用；修改产生新资源，不原地覆盖。上传资源若未来允许复制也必须独立登记目标所有权，不能依靠来源游戏持续存在。源修订不存在／摘要变动／不完整则整次失败，不混读最新版。模板更新只通过受控内容维护流程产生新修订，不提供编辑器修改内置原件的权限。

### 1.4 本地游戏管理切片（E-02-LOCAL-METADATA-1）

本地`POST /api/metadata`仅接受`{gameId,expectedRevision,metadata:{name,introduction}}`，修订必须精确匹配；内置ID拒写。trim+NFC后按Unicode码点8/20计数、名称必填，保留作者原文字。只改显示资料、单调草稿修订及服务UTC修改时间，不改gameId/sourceRef/地图/章/人物/固定表/资产。map保存同样刷新本地modifiedAt；新复制由服务一次写同值createdAt/modifiedAt，旧草稿缺时间时明确未记录，不取文件时间猜补。

重名只检查相同本地ownerId占位值的当前草稿；本地尚无认证、正式名占用登记或发布，不能宣称完整作者权限/全修订名称合同。旧harness无metadata的复制继续允许未配置草稿名，管理表单新建/改名必须合法；不自动修旧文件。名字变更计入原共同sourceDigest，新编译身份改变但六个native/mini资产byte不因改名改变；旧快照/正在运行的试运行不热换。已打开工作台若持旧修订须拒覆盖并手动合并。

`GET /api/games`保留旧ID清单，`?details=1`增加紧凑显示摘要；`GET /api/game-info?game=...`读当前摘要。损坏草稿单独显示错误，不隐去其它有效草稿；名称占用无法核实时仍阻断写入。首页用DOM textContent显示作者内容，普通保存/取消/离开提示、保存途中新输入保持未保存。列表无上架/删除/认证假按钮。文件harness仍无耐故障/多进程CAS/复制事务；完整E-02尚未完成。验证入口/I/O先登记于[本地验证](editor-local-validation.md)，交付源见[本地游戏管理](editor-local-game-management.md)。

### 1.5 本地上下文壳切片（E-01-LOCAL-CONTEXT-1）

[三模块上下文](editor-local-context.md)只接已有游戏资料/地图/唯读来源：固定路径与game参数，完整导航而非热换源，保dirty/busy离开保护，管理选择同步同源URL/重载；游戏级壳无章节选择。左菜单及按主窗宽度的canvas有八focused限定证据。本地editable清单不是认证，完整可写实体/章节、账号和事务仍未接，不以此替代§3/§5–8。

## 2. 统一地图合同

### 2.1 坐标与四层

| 数据 | 字段及不变量 |
| --- | --- |
| `bounds` | `{minX,minY,width,height,tileSize:16}`；整数图块坐标，范围左闭右开；允许源模型表示向左／上扩边，当前规则profile仍只接受原支持域 |
| `base` | 分块保存每格`terrainRef`及明确的地理类别；未配置格与导入时被组件覆盖的未知底层分开表示。后者带来源和覆盖实例，不伪填地形 |
| `decorations[]` | 有序`{id,definitionRef,x,y,variantRef,waterClass?}`；顺序就是同层上下顺序，后者在上；水域类别为river/lake/sea，非水域没有该字段 |
| `roads[]` | 见2.3；同一记录决定道路视觉和连接，不能另外画一条无拓扑的“装饰路”冒充道路 |
| `placements[]` | `{id,cityId,x,y,componentRef}`；一据点至多一处，位置不是章节属性；据点中心是节点格中心，不是组件外框中心 |
| `ComponentDefinition` | `id/revision/category/footprint/anchor/variants/visualRef/geographyMask/ruleRecipeRef`；footprint是整数格掩码，anchor是本地格锚点；图形透明遮罩、地理掩码、规则作用域分别记录 |

基本地图→地图装饰→道路→据点顺序固定。变体必须来自明确素材定义；未验证的旋转／镜像不能通过转一张图片同时猜造规则或道路flags。组件可由多个原16×16图块组成；导入剩余单格也是可编辑的原子组件，不能把整张原图包装成一个不可拆背景来验收。

- 拖放预览不提交；确认后一次写入实例／边界变化，取消不留下扩边格。四向扩边保留原作者坐标，编译时按`minX/minY`统一换算全部城、点列、掩码与资源；没有容量证书不能输出运行包。
- 删除只移除目标实例，显露当前下层内容；未知底层的受影响格要求作者明确补齐，不能回放放置时的整块截图。对其它后续修改没有回滚权。
- 城市／道路不检查下方必须是哪种地形。不得把“不支持某个规则编译能力”伪装成“城市不能建在水上”；错误必须指出具体缺失的recipe／消费者／证据。
- 装饰重叠合法，道路交叉规则不因此放宽。据点不得共享同一节点格；其它超出已证据点组件覆盖组合的限制须作为能力缺口说明，不擅自增加地形禁令。

### 2.2 三种输出，不能相互猜测

1. **视觉输出**：四层及组件顺序、季节调色板生成地形／建筑／装饰栅格资源。运行时可加载分块和必要的整图回退；源仍可拆解编辑。
2. **小地图地理输出**：每格先取明确base地理，再取此处最上方的水域组件；非水域装饰不参与选择。保留静态路网，动态实体另绘。此结果不能作为通行图。
3. **规则输出**：由共享profile的受信`ruleRecipeRef`及其组合合同生成原生图块字节、道路图与相关输入。不从最上层颜色、地理类别或道路字符串直接计算通行／代价。

`ruleRecipe`不是作者上传的代码。定义须登记输入域、每格写入／保留位、组合前置条件、相关KI地址／资源、输出和后续消费者验证。已取得的原始字节可以保真保留；组合语义未闭合必须报告`UNSUPPORTED_RULE_BINDING`。原图和新图经过同一判断，禁止按`gameId`放行。

#### 2.2.1 MAP-MIGRATION-2原子保真候选合同（非任意组合认证）

本批共享实现见`authoring/maplayers.js`及`atomicmapimport.js`，执行结果与尚缺验收见[任务二完成审计](map-migration-completion-audit.md)。这是上述合同的有限编码，不解除G-MAP、G-ROAD、G-SLOTS或扩容门：

- 受信`ki-byte-stamp-1`只写显式原MMAP图块byte；`footprint/anchor`是整数局部格，`variants[variantRef].tiles`是完整`[dx,dy,byte]`序列，须恰覆盖footprint。`variantRef`默认`original`。视觉绑定仅接受相应`MMAP.MDL:tile-N`或`MMAP.MDL:indexed-footprint`；不执行作者代码、不按名字/颜色猜规则，不静默忽略未支持视觉资源或recipe。
- 装饰实例`{id,definitionRef,variantRef?,x,y,waterClass?}`按数组顺序合成；道路显式`components`置其上；据点`componentRef`以placement锚点置最上。规则/视觉使用同一显式byte输出；运行时可改规则平面仍唯一归Scenario，静态输出不能独立推进规则。原图导入按实际道路点/据点中心分层，其余格仅作可编辑原子，不冒充已重建山脉等多格对象。
- `base.terrainRef`允许`null=unknown`，须同时保留`base.unknownUnderlays[cell]={sourceRef,coveringInstanceId}`。覆盖原子保留已知结果；删除后裸露unknown则阻断正式编译，草稿诊断可存。作者明确补当前base才可继续；不从旧截图恢复、补零或补草地，不覆盖其它后续编辑。
- `base.geography`编码0陆／1海／2河／3湖。水域实例显式`waterClass:sea|river|lake`，可用definition的`geographyMask:[[dx,dy],...]`选footprint子集，缺mask代表全footprint。最上方水域选择与规则byte分离；非水域覆盖不擦除下层水域，隐藏／锁定工作台字段不影响正式结果。原图实际水域导入标注仍需独立依据/审核，不以合成样本或边缘连通启发式销账。
- `compatibilityAssets={roadCostHex,roadOffsetJson,sourceRole}`可携带既有Web辅助字节，按明确长度/JSON有限元组校验并原样产出。M0-r2确认原兼容cost与“道路点＋节点mask”有15773字节差异；它不是KI原生搜索权重，不造新公式。正式无编辑迁移必须用`source-explicit`及实际字节对照。旧本地harness的无此字段模式明确标为`legacy-trial-derived-mask`，其成功收据不能证明正式辅助资产保真；不会按内置身份放行。
- 本批编译支持域限制（不放开G-SLOTS，不是“原版不能移城”结论）：`fixedcitybindings.js`将M0已核的192原槽XY作为当前profile受信绑定，所有gameId同门；同时核章城市raw的+08/+0A与节点坐标。不能把placement、业务city和章JSON一起改坐标就绕开“移城未放行”。复制的溯源摘要覆盖map、definition和显式兼容资产，不只world/章目录；兼容资产随副本实际保留。0.4加入上述接缝门；0.5进一步核合成平面的CB..D3扫描集合/顺序恰等于原192槽（原E4CE..E50B逐格调用E57F并计数，M0原图坐标已核）。不能画入额外节点或移除节点后仍编码旧图。此为本批Web支持域拒收，不宣称模拟原版畸形输入后果；历史0.2/0.3/0.4目录/收据保留但不替代新结果。
- 本批实际支持/验证域是固定384×256、192原槽/端点/原章、原byte保留及列明原子样本；语义分组、任意recipe/拓扑、移动据点、新原机制及未知组合仍不获认证。原消费者/来源索引见准入排查与RE SKILL，当前实测/失败/覆盖边界在审计清单。

现状中`worldresources.loadSeason`把同一个terrain字节布局交给绘图，Scenario又持有可改写的`terrainMemory`。四层创作不能只改画面：需将**静态视觉派生物**与**唯一规则地形权威**明确分开，并保留城池易主引起的图块重着色到绘图脏区的投影。8A1E改变的是中心／角块所属配色，不是修改城市type。当前分块复制初始layout，terrain写接口没有revision／脏格通知，单独叠cityIcon不足以证明角块更新；开局89F0着色也有独立接线缺口，详见[本轮排查§2](re-notes-editor-map-admission.md)。工程方案为权威写入后记录只读变更版本／脏格，失效对应视觉块及非整数DPR整图缓存；恢复、季节切换从同一已保存规则状态重建投影，不重播规则或RNG，不改变原写序／失败前缀。不得增加第二份可独立推进的规则地图，或用静态PNG掩盖攻城后地形变化。未证组合及动态投影列入G-MAP，不自创“上层覆盖就改变通行”的机制。

#### 2.2.2 组合级小地图开关（本轮用户确认，Web显示合同）

`map.waterGroups[]={id,name?,memberIds[],baseCells[],showOnMinimap}`：地图上一个具体拼接组合，不是素材定义或水域类别；memberIds引用装饰实例/道路图块实例，baseCells只引用明确已有水域显示资料的基础格（用于原图道路图块下的显示标注，非隐藏规则底层）。成员引用唯一、一成员至多属于一个组，baseCells不得跨组重复；错引用、重复、非boolean、空组、越界及无水域base格均拒收。多格水域实例整体列入一个组合，不拆成格开关。无组旧源仍全显示；存在组的showOnMinimap必填boolean，默认由创建工具写true。

编译同时输出完整`geography`和显示专用`minimapGeography`；仅在后者过滤关闭组合。合成时取最上方仍参与小地图的水域，非水域不擦下层；道路mask独立、始终保留。规则/大地图仍按原四层完整合成，开关不改terrain/native图/helper/章/通行/RNG。组保留在GameSource及其摘要，不是workspace.hidden。显示摘要不能反写完整地理。

导入原图的语义组合并非DOS实锤；作者初始化可按明确审核分区、主河带及剩余相连片区提出组合，必须持久化实际成员/稳定ID和来源，不能每次渲染重新猜组或据“相连”改水域类别。当前主河带/组合边界是可修改的Web视觉候选，不声明长江/黄河/汉江原对象身份。新风格采用同色道路/水系、区域色带/有限调色板点阵及独立seed，仍须用户审图，不声称原算法。

工作台[明确重载草稿](editor-draft-reload.md)只整页重读同game，由原beforeunload处理dirty取消/确认；busy/未就绪独立拒，不自动写/热换其它对局。六focused补实际保存busy及新Realm/源文件保持，不代完整Q15/所有API时序验收。

#### 2.2.3 本地素材／组合编辑切片（E-03-COMPONENT-TOOLS-1）

后续[装饰拾取显示索引](editor-decoration-pick.md)按实际footprint/anchor及数组最上序派生，只在现有rebuild成功后更换私有坐标缓存；单点检视、移动、删除复用原层锁/unknown门；矩形原本全实例footprint扫描/末尾一次draw，**不使用最上索引**（旧“检视/框选”归因撤销），后继[完整框选](editor-rectangle-selection.md)只减少临时坐标数组，保下层/空洞/数组序/Shift。先测当前92586实例/98点，再5850线性等值与六focused核实际240格框选；构建仍线性/额外内存，Node计时不代FPS或完整性能验收。原composer/源/规则/资产不改。

在当前固定profile内，素材库列出原图块及作者命名的多格素材。作者从装饰层完整实例选择擷取：按原数组顺序保留最上原byte，保留所有选中水域贡献；不同水域类别须分开擷取，不从颜色归类。输出仍是`ComponentDefinition`受信byte-stamp结构，不是整图背景或新规则。当前本地擷取预算256格／素材库1024定义为工程限制，非DOS容量结论。拖放预览整footprint，放置／移动超384×256界完全拒收、不裁切、不扩容；非锚点格也命中完整多格实例。新增素材随草稿保存；原图块及既有byte/footprint/variant/recipe等配方内容不可覆写。后续INSTANCE-LIBRARY-1允许作者素材只更名或在装饰/道路components/placement均无引用时移除定义；同修订map+definition写集先核引用再共同草稿校验。共享图集、其它游戏和旧immutable快照不清理，配方修改须新建素材。服务对未使用新定义的全部variant仍用共同composer检查。

组合创建从明确水域成员或base水格转移引用，原组余项保留、空组删除；拆分只取当前组的严格非空子集并继承原flag；合并至少两组且作者明确指定结果flag，不能按true/false猜选。只改group元数据及引用，不改实例／顺序／类别／道路／规则byte。组的身份不再复用。框选仍选完整装饰实例。后续INSTANCE-LIBRARY-1可显式把2至256格装饰拆成逐格子实例：使用已存在且受共同composer验证的原byte单格配方，原数组位置/原variant字节、geographyMask逐格贡献及原组flag保留，新增身份不复用。unknown仍为null，仅必要covering引用跟到新子实例并保留priorCovering身份；不猜补底。只支持装饰，不拆道路/据点/节点。整批平移按所选完整footprint先全检查再提交，整数位移/固定边界，组引用不变、其它实例/道路/base不动；暴露unknown仍拒严格编译。

后续[同层调序切片](editor-decoration-order.md)只调整装饰数组次序：稳定ID、多选相对顺序、每个选中块跨一相邻未选项，边界no-op；当前非装饰层/锁定/空选拒收，界面及保留的调用入口同门。不改实例/配方/未知底层、其它层或水域组；地理/mini仍由原共同组合规则选择最上贡献水域。7实际focused入口不冒新71完整轮，更不作为全编辑器证书。

后续[可视素材定位](editor-material-picker.md)只按原variant配方画缩略图/24项有界分页，按明确定义来源及footprint格数过滤；图卡与原下拉/预览同步，选择/翻页不写源，无结果清陈旧预览与拖动。不从外观猜完整语义，原放置/锁/unknown/compiler门不变；六focused不是新80全轮。

明确补底一次只写作者选中的base格及0..255原byte、0..3地理，解除这些格的unknown记录并移除其旧base组引用；上层、其它格／后续修改不动。裸露unknown仍阻断正式编译。界面必须解锁base并确认，填陆／海／河／湖是作者显示选择，不证明通行。工作区显隐／锁定仍不写内容。

本地`POST /api/save`可同包传`map`与`componentDefinitions`、expectedRevision，先核旧修订／定义增改删限制及同包map引用，再经共同草稿校验后保存；存储仍是单进程文件harness，不声称耐故障事务／认证。保存期间后续修改保脏，编译仍取准确已保存包。此切片不放开G-ROAD/G-SLOTS/G-CAP、新recipe、任意语义组合可玩、账户／发布／完整App试运行。实测入口／I/O先登记[本地验证](editor-local-validation.md)，交付[工作台说明](editor-current-workspace.md)。

### 2.2.4 编辑视口与内容分离

[工作台工具菜单切片](editor-tool-menu.md)复用原toolbar，不增加操作能力；右/中键不提交地图编辑，菜单只切换工具，下一左键仍经原当前层/锁门。菜单外首次canvas点击只关闭，菜单Esc与原工作台取消分开；这是Q15编辑器例外，不改变同引擎游戏输入。五focused/167声明源只是限定证据，完整模块交互矩阵仍缺。

当前Web工作区camera只持有world-pixel起点和zoom；绘制/拾取/拖放/预览共用同一正逆变换，DOM/CSS缩放及边框按实际矩形转换。平移/整图/留边/输入取消和有界编辑RAF预算不能修改GameSource/mini像素、规则时钟/RNG或放宽容量门。显示缓存因内容/显隐变化失效，不因camera每帧重合成。当前实际实现/参数/覆盖与剩余由[视口切片](editor-viewport.md)唯一维护；不是G-CAP解除或完整编辑器验收。

### 2.3 道路、节点与战术关联

`Road = {id, fromCityId, toCityId, travelKind:land|water, geometry, endpointPorts, recipeRef, nativeBinding?}`。

- `geometry`为有序图块路径／经确认的连接编辑结果；端点据点中心与边点流分开，不能把城中心追加到点流。道路类型由作者选择，不被河流增删改写。
- `endpointPorts`显式绑定节点有序连接槽；编译后的四槽顺序及端点方向有规则意义，不能按数组插入或ID排序替换。当前profile每节点四个有序槽（可空）、固定192节点；不是1..192任意节点数均已支持，更不是任意图已获认证。原E4AC也直接设定192轮构图，变节点数不能仅放宽JSON计数检查。
- 导入`nativeBinding`保留原槽号、边顺序、tag、逐点flags、成本及包围盒和来源。改动使受影响绑定失效，必须通过同一有证据的构图适配器重建，不能沿用旧flags／成本，也不能普遍套“长度减一”或欧氏距离。
- 无据点X／T交叉和重叠以**有序路径线段相交＋占用格**检查，包含斜线跨越；在据点连接必须分段接入合法端口。预览标出冲突，草稿可存，发布阻断。平面几何检测只负责编辑约束，不计算寻径。
- 移动／移除城市标记相关道路待重连，不替作者寻路；未连接的城市、孤立部分或特殊构图输入须取得调用者适用域证书，不能用通用A*或“无路”兜底。
- 运行`road_graph`采用现行v2：四个有序tag、16B边头、4B点；`0x0800+edges*16<=0x2000`、`0x2000+points*4<=0x8000`等地址检查继续存在。几何合法不能代替原搜索队列、字宽及耗尽边界验证。
- 据点`battleBinding`属于受信profile／兼容绑定，不向作者开放随意战场号。当前攻城映射按`city.idx`选`BATTLE.MAP`目录；新增／删减／重排据点必须同时处理目录与规则消费者。野战仍由规则地形选图，不能因作者填water就强制某战型。只换据点图片不产生可用战术关联。

### 2.4 自动小地图算法与布局

以下是**可替换参数但合同固定的Web表现实现方案**，不声称复现DOS纹理算法：

- 输入`geographyGrid/staticRoadGeometry/bounds/styleRevision/textureSeed`，输出两种尺寸底图、地理／路网掩码及元数据。seed创建地图时固定并随复制保存；不使用时间、`Math.random`或游戏RNG，修改局部不令全图纹理重新抽样。
- 候选配色起点沿用现Web提取／表现资源：陆地`#F0D090`、海洋`#001E5A/#000205`、河湖`#406040`、路`#5A3A23`。它们不是新发现的原版色值证明；最终以原游戏视觉参考及用户Q65验收冻结style修订。
- 渐变用地理掩码内的海岸距离场，纹理用带seed的整数坐标哈希，和掩码裁剪后混色。起步参数：海岸影响半径8源格、陆地阴影幅度12/255、纹理幅度4/255；颜色运算与取整明确为整数，噪声均值居中。参数属于待视觉收敛的表现配置，不是规则阈值，不能据此标视觉验收通过。
- 先画海陆／水系与纹理，再叠静态道路；细河和道路独立栅格化，采用覆盖采样保证连续，不用一格颜色优先级令水上道路消失。相交处道路可居上，但河道两侧仍可识别；细线至少一个输出像素，禁止纹理后盖道路。同源格多水域按Q66，缩略采样的覆盖率只作显示，不改源类别。
- 地图显示框候选250×167，回退208×139；只有完整外框、下方名牌及安全间距不与实体UI相交时用大框。外框尺寸按现有窗皮格尺寸向上取整，多出部分是留白，不拉伸地图。更小视口沿用玩家端既有缩放／布局，不承诺新增移动编辑器支持。
- 对显示框`(bx,by,bw,bh)`与地图像素范围`W=width*16,H=height*16`：`s=min(bw/W,bh/H)`；实际图矩形居中，宽高`W*s,H*s`。屏幕点逆变换只接受半开实际矩形，留边／名牌不导航；动态标记和视口框共用同一个变换对象，不各自使用208/6144常量。
- 图块中心投影`((x-minX)*16+8,(y-minY)*16+8)`；视口框投影实际相机可见世界矩形，不引入改变相机或规则范围的新补偿。DPR只影响栅格采样，不能改变导航落点。
- 预览异步结果绑定草稿修订＋操作序号；过时结果丢弃。正式底图随manifest发布，不在每帧生成。纯生成测试可用任意长宽比，这不开放对应规则地图。

## 3. 人物、据点、章节与固定槽映射

### 3.1 创作字段目录

范围列为**底层表示**而非全部值均可玩；实际编辑控件只显示已完成消费者／初始化验证的profile域。未知值保留，不自动钳位。

| 对象／字段 | 创作与运行映射 | 编辑边界／来源 |
| --- | --- | --- |
| 据点名称、图片 | `CityDefinition{name,cityVisualRef}`；全游戏共用 | 名称不是身份；图片枚举绑定已提取资源及配套城型，不凭图片大小推城损规则 |
| 据点基础数值 | `maxProduction/production`→`max_prod/prod` u16；`growth/disasterProtection/troopCapacity/troops`→`growth/defence/troops_cap/troops` u8 | 城记录+0C/+0E/+10..13；`defence`显示“防災”，不是城壁；兵力内部十人单位，UI可显示人数且只接受精确×10 |
| 据点位置／型／外观 | map placement→x/y；受信城型／view绑定→`type/view` | +08/+0A及+16；不能把0..15存储域都开放成合法城型 |
| 武将身份／头像 | `GeneralDefinition{name,hao,portraitRef}` | 原资源150张PNG，本轮直接读PNG头均128×128；上传按1:1裁剪，正式规范图128×128。普通显示不再假定`kao/${byte}.png`可覆盖所有游戏 |
| 三专长 | `ability.siege/field/naval` | G+0E/+0F/+10高四位0..15，低位保留；字段本身实锤，组合效果不重写 |
| 武术／统率／政治 | `ability.force/lead/politics` | G+11..13全byte；历史`&0xF`已由[离线专项](editor-ability-import.md)纠正，默认未重导入；不能把旧编辑范围当原版上限。高值进入编辑域前审算术／显示消费者 |
| 战术脚本组／对白 | `battleScriptRef/dialogueVariantRef`→`battle_formation/talk_idx` | 只选配套枚举；不是UI阵形，也不按序号解释强弱；原来源G+16/+1E |
| 章节元数据 | `ChapterDefinition{name,startDate,people,factions,cities,diplomacy,policy,initializerRef}` | 日期为明确year/month/day，另保留原日内字节；不使用JavaScript Gregorian Date替代原历法。字段范围由已核原历法profile提供 |
| 本章人物 | `people[generalId]={included, factionId:null或id, overrides, appearance?}` | 未加入本章不等于死亡；延迟出场不是一个“年份”字段。初版无初始驻城、无军团；appearance仅开放已证月倒数及投奔引用，不猜出生／登场公式 |
| 本章势力 | `{id,monarchId,advisorId,capitalCityId,resources,markerRef,...}` | 君主／军师／首都为引用，全部有效势力可选玩家；更换君主不换势力ID |
| 势力资源 | `money` signed24；`reserveCavalry/Archers/Infantry`→三u16池 | 金额有符号、三池十人单位；正常增减边界不等于任意编辑值合法，异常域验证另列。没有“粮草”新资源 |
| 势力其它资料 | `bellicosity/legionMoraleCap/markerRef` | 已有原字段+28/+1D/+3E；样本域与完整byte域区分。F+1E旧名talk_style语义未证，不开放 |
| 本章据点 | `cities[cityId]={factionId:null或id,overrides}` | 首都只在势力引用存一份；据点面板的首都标记派生。太守初任等联动未闭合前只保留导入值，不开放伪造任职状态 |
| 关系／政策 | 定向`fromFactionId/toFactionId/value`，具名当月／下月政策及兼容块 | 关系不自动对称；对角／未公开槽、D09/D11等不丢失。不替空白章猜“中立50”或随意清零 |

`overrides`只存明确改变的白名单字段，未出现表示继承；`null`只在语义允许为空的引用上表示清空，不表示继承。恢复继承删除该键。基表修改影响未覆盖章节，保存前显示影响清单，完整发布仍校验所有章节。

名称／字号、资源引用与原Big5固定字段是不同表示层。导入保留原编码；没有转换合同不得截断Unicode或用`?`写回raw。当前姓名查找的调用点必须改为／核对槽引用，不能用“禁止同名”掩盖身份错误。

后继[章节资源JS写入](editor-chapter-resource-write.md)：完整导入副本既有章/原公开槽money与三池四字段，仅同步两raw对应九byte，先核分叉/无补值/其它章与来源身份保；本地条件POST准确修订/no-op不写盘，189检查70拒、20章真实fresh/公共JSONcold/旧snapshot迟到和12API拒、七focused有证。293/87仅库存，没有表单/新章/角色/首都初始化或真正认证/CAS，不能把表示边界当全部可玩域。

后继[势力双来源一致性](editor-faction-consistency.md)：Python适配器的14个已编码非资源byte若与同槽固定source分歧，明确拒编译，不能报成功再由fresh覆盖。仅一致性门，不批量同步角色/计数/策略或认证初始化；unknown/未公开槽保，未编码字段/JS作者及完整写集仍缺。20章60检查1120拒/七focused有证，290/85是库存，不当全轮。

三预备池后继[编译专项](editor-reserve-compile.md)：Python适配器只同步声明槽+04..09六byte，与资金同步共存；六原KI读取签名/162检查33拒/142生产固定表与cold重绑、七focused有证。u16表示边界不扩正常运行/编辑域，其它字段/初始化/JS创作仍缺。

资金表示后继[编译专项](editor-money-compile.md)：Python适配器独立signed24编码并只同步声明槽固定来源+20..22三个byte，22正常槽校验与生产原生表一致。七focused/50表初始化与JSON重绑有证；原件及默认不变，不等完整异常资金编辑域、其它势力字段同步、JS创作接线或空章初始化。

### 3.2 稳定身份不等于原运行槽

- 每个编译章节生成`slotMap`：city→192槽、general→原固定表、faction→正常0..21域，另保留所有原哨兵／特殊槽。运行保持原数组／地址顺序，不将业务ID塞入原byte字段。
- G127是保留多用途槽，不提供第128名普通武将编辑入口；现有隐藏势力槽、24×24关系、128×64B军团、32天气记录、256×4B事件轮不能裁掉。`legions=[]`与底层固定表完整并不矛盾。
- 导入原章节保留原槽绑定；同槽在不同章节可能是不同人物。本轮核对20章Web源确认不能按`idx`跨章直接合并人物。先建立带来源的独立人物记录与章节引用；只有身份可核对时才归并，不按同名／同槽自动合并。全游戏人物库可大于单章普通槽数，但任何章不得超其profile域。
- 未改的原章保留具名值和不一致的原缓存，发出诊断而非默默“修好”。[本轮排查§3.3](re-notes-editor-map-admission.md)复核官方四章有4项F23不等于实数，不能全局重数掩盖；普通军师fresh只扣所选玩家F18，编译不能提前对各势力再扣。作者修改归属／君主后相关F18/F23、军师初始副本等必须由有证初始化事务更新，不能继续携带陈旧值；此联动列入G-INIT，未闭合时允许存草稿但不得试运行／发布。
- 完整有序城市邻接与异属状态分别表示。旧`connections`只显式保存已置attr位的异属邻居，其余藏于raw，不能作为新的全道路权威。在已证固定槽／拓扑域，按实体证据§9.4同步C00低4、C1B、C1C..1F；保留高4、旧属C1A及占格C18。该字段组的前置条件已有来源，不再笼统列为全未知，但不等于整章初始化已闭合。
- 空白章节确实是空白创作状态，必需日期、势力、首都和初始资源未填时明确报错。`initializerRef`引用受信且版本固定的初态合同，不能让作者上传一段raw或任取某章清空几个列表代替初始化。
- 普通新游戏即使沿用全192城市，也不能带入原势力的隐藏活动槽／预算／事件。必须先完成空白初态、未使用槽及计数的原证审计，再放行新局；这与用原游戏完整副本先贯通是两阶段。

当前E-04已安装可信Web source、full copy保存只读source-record索引（20章原32B/各game独立来源ID/保留G127，原/目标章ID分开），55门/111源/39原资产/作者2输入整轮。仍非可编辑GeneralDefinition或上述author实体/运行耦合；五原源/current39SHA核签和year截断两项、限制/后续见[实体来源盘点](editor-entity-import.md)。相同外观不能自动合人，原型不能作为included/任免/空章初始化证书。

后续[只读来源检查](editor-entity-inspection.md)已实际接管理入口与local API，展示20章来源ID/原目标槽/raw与列明C19F01F02引用，不改上述author字段合同；不是全部消费者/任免/新增将/初始化认证，无认证本地harness不能代替后台。随后[固定历史来源](editor-entity-history.md)只允许副本原sourceRecords/sourceRef与代码可信tuple精确匹配，缺坏不回退当前/不补档；未来版本加入必须受控追加，PENDING日期候选不自动登记。

### 3.3 删除／修改影响表

| 操作 | 允许与原子写集 |
| --- | --- |
| 从地图移除据点 | 移除placement，保留城市与章节配置，道路标记待重连；不删除道路／首都 |
| 删除城市基础资料 | 必须无placement、道路、章节引用；返回完整引用清单，否则拒绝 |
| 删除人物基础资料 | 任意章节所属／君主／军师／投奔／任职兼容引用存在即拒绝，不跨章静默清理 |
| 换君主 | 校验自由候选；同事务更新本章势力引用、人物归属与身份及已证初态关联，失败无半次更换 |
| 替换军师 | 确认原人／新人，校验本章归属及唯一性；同步初始默认军师引用，不伪改运行时外交列表缓存 |
| 解散势力 | 二次确认影响范围；仅本章成员自由、城中立、角色／首都／资源／关系及指向它的出场配置清理；不能留下悬空投奔。精确初始化字节仍受G-INIT约束 |
| 删除章节 | 确认后删该章配置及仅属于它的兼容引用；共享地图／人物保留，已发布版本不变 |
| 删除资源 | 当前草稿、试运行快照或任一保留发布版仍引用即拒绝单独删除；显式删整游戏按第5.4节处理 |

## 4. 编译、发布资产与同一加载器

### 4.1 编译流水线

```text
准确已保存快照
 → 结构／所有权检查 → 依赖闭包 → 实体引用与profile支持域检查
 → 分层视觉＋地理摘要＋已证规则recipe → 原生道路／章节／固定表
 → 交叉核对／确定性产物 → 校验报告＋不可变manifest
 → 正式发布指针 或 私有试运行句柄
```

单章试运行选择闭包为：所选章节、整张共享地图／路网、该章全部人物（含未活动但规则可能读取的槽）及关系／事件／天气／兼容记录、被引用图片与所有可达战术／季节／对白资源。其它章节的必填表单缺项不阻断；共享地图断路、缺必需资源或角色越界仍阻断。未引用的人物只查包级安全和ID唯一性，不强制补全其无关能力。正式发布取所有章节闭包，至少一章，每章均通过。

当前本地固定导入章scope已接独立studio-chapter-1缓存、已保存整源/selected两摘要、精确scope URL与实际App，whole编译仍保留；完整battle/portrait/TALK可达资源与真实私有授权尚未认证，[工程范围/证据](editor-chapter-trial.md)。纯来源DTO不代替实体初始化，单章通过不放行正式全源发布。

服务端重新验证所有必需条件；浏览器预览、客户端hash或旧报告不是放行凭证。校验报告绑定`gameId/draftRevision/sourceDigest/compilerRevision/profileRevision/scope`及错误位置／实体ID／错误码，源码或编译器改变即失效。

现有Python/Pillow编译器是离线工具，不能假设Cloudflare请求环境能执行。方案是把确定性源校验／数据编译／地理与像素生成提炼为**无框架、无npm运行时依赖的ES Modules核心**，浏览器预览、受信编译任务及离线入口共用；Python只保留原资源导入和对照工具。PNG编码／摘要／持久化I/O用显式适配端口，服务端不得依赖DOM Canvas。按块生成并流式处理大资源，禁止在一次受限请求中展开全部四季整图。既有环境是否提供满足合同的事务／对象／任务能力在实施前核验，不借设计擅自选择平台产品或部署。

### 4.2 `RuntimeManifest@1`

```text
identity { gameId, releaseId 或 trialSnapshotId, contentRevision }
schemaVersion, compilerRevision, ruleProfile, sourceDigest
world { id, revision, bounds, tileSize, assets }
chapters [{ chapterId, runtimeIndex, artifactRef, slotMapDigest }]
assets [{ assetId, path, sha256, byteLength, mediaType, role }]
profileCertificateRef, minimapStyleRevision
```

必需角色：章节模板／兼容固定表、原生v2道路、规则初始地形、必要的roadCost／roadOffset、视觉分块／四季回退、自动小地图及变换元数据、据点／头像目录、战术目录和其依赖。具体产物只允许manifest列出的相对路径，禁止`..`、任意远程脚本、运行时动态导入作者代码。共享规则／音频资源可以引用受信公共包，但同样固定修订。

当前`createContentCatalog`要求章节顺序匹配`legacyScenarioIndex`，`prepareScenario`核对内容／世界／roadVersion及能力内存。未来统一加载适配器将manifest转换为这一共享装配合同；内置、自建、试运行只差**取数权限和存储能力**，不选择不同规则。新局／恢复仍detached预检后一次安装，所有await后检查入口票据、scenario、world与clock；旧异步结果不得污染新实例。

缓存键至少含运行模式、游戏、修订及资源摘要；URL不可变，不使用全局固定`kao/0.png`或`minimap_roads.png`跨游戏覆盖。失败promise清除以便重试。标题只取目录／章摘要，不提前加载大地图或战术位图。运行地形／RAM永远归Scenario，不放进共享资源缓存。

## 5. 管理服务与数据事务

### 5.1 接入边界及持久化模型

两个入口沿用既有GitHub→Cloudflare程序部署；编辑器要求独立端口／登录，具体监听映射只在已存在环境核对，不自行改域名、开端口或新增服务器。代码与数据通道分离：保存／发布绝不触发Git、重启或部署。

受信服务需要三个抽象接口（不是三个网络端口）：`MetadataStore.transaction/compareAndSwap`、`BlobStore.putImmutable/read/delete`、`CompileJobs.enqueue/checkpoint/retry`。实现可适配既有环境，但不能拿进程Map、最终一致键值覆盖或前端localStorage代替所要求的事务／持久性。若现有绑定不足，列明缺哪一能力再处理依赖部分，不退回提交JSON到Git发布游戏。

发布计数、当前指针、上架状态、管理限制和公告唯一键必须能在**同一事务域**提交；不要求对象文件与数据库跨服务事务。最小逻辑记录如下（不指定数据库产品）：

| 记录／键 | 必需字段及约束 |
| --- | --- |
| User/userId | 唯一accountName、role、disabled、mustChangePassword、passwordHash描述、authEpoch、可选个人资料；账户名称不可修改 |
| Session/tokenHash | userId、authEpoch、createdAt、lastVerifiedAt、idleExpiresAt、absoluteExpiresAt、CSRF关联；不存明文token |
| Game/gameId | ownerId不可转移、builtin保护、draftRevision、currentReleaseId、nextOrdinal、listed、restricted、rowRevision、createdAt、modifiedAt；唯一名占用另按ownerId＋规范名登记 |
| DraftSnapshot/gameId＋revision | sourceDigest、根资源引用、编译器读取所需的准确依赖清单、createdAt；写入后不可变 |
| Asset/gameId＋assetId | hash、长度、mediaType、处理状态、存储键；Reference记录所属草稿／发布／Trial，禁止凭blob hash跨游戏取私有资料 |
| Release/gameId＋releaseId | 唯一ordinal、draftRevision、manifestDigest、publishedAt、名称简介快照；只在发布提交产生 |
| Announcement/gameId＋releaseId | 公告ID、name/version/creatorAccount快照、publishedAt、firstOnlineAt；当前game.listed决定可见性 |
| CompileJob/operationId | actor、gameId、目标修订／scope、状态、stage、compilerRevision、输出清单、failureCode；查询不泄露他人任务 |
| Validation/reportId | 源及编译器／profile摘要、scope、结果、结构化diagnostics；不能被客户端标记为通过 |
| Trial/trialId | 第7节的固定身份、状态、会话关联与快照引用；不存运行进度 |
| OperationResult/actor＋key | 请求摘要、目标、处理中或已提交结果；提交类幂等键不因短TTL重用，删游戏后仅保留最小收据，不保留内容 |
| Audit/eventId | actor、动作、目标ID、前后修订、时间、结果；删除凭证只保留ID及删除事实，不能恢复游戏 |

创建／修改／删除、引用登记及唯一名约束在同一条件事务内处理。界面编辑完成时修改时间更新，失败请求和只读查询不更新；发布／上下架另有各自事件时间，不冒充内容编辑时间。

### 5.2 API合同（拟定路径）

编辑端前缀`/editor-api/v1`，匿名玩家端`/play-api/v1`；均为JSON，错误`{code,message,fields?,requestId}`，界面message繁体。安全日志不返回堆栈／存储密钥。`If-Match`用于条件写，所有非幂等POST及删除带`Idempotency-Key`，键绑定账户、方法、目标和请求摘要；同键异内容409。

| API | 权限及输入／结果 |
| --- | --- |
| `POST /session`、`DELETE /session`、`GET /me` | 登录／退出／会话状态；首次或重置态只给改密权限，不返回可编辑会话 |
| `PUT /me/profile`、`POST /me/password` | 仅本人；改密撤销旧会话并换新受控会话，不暴露密码hash |
| `GET/POST /users`、`POST /users/:id/{disable,enable,reset-password}` | 仅tianyi管理创作者；原密码不可看，禁止禁用最后管理员 |
| `GET /games` | 作者仅自己的；管理员可另查全局管理摘要，不泄露他人草稿／私有资产 |
| `POST /games` | 普通模板新建；指定固定来源修订和名称 |
| `POST /games/copy-builtin` | 仅管理员；完整复制；不可指定任意他人游戏源 |
| `GET/PUT /games/:id/draft` | 仅作者；PUT带准确修订与整包或有边界的变更集，CAS失败409并返回最新修订，不吞掉本地未保存内容 |
| `POST /games/:id/assets` | 仅作者，上传隔离处理；返回就绪资源ID后才能引用 |
| `POST /games/:id/validations` | 仅作者，指定draftRevision＋scope；202返回任务句柄；完成报告不改变发布状态 |
| 当前原型 `GET /api/games/:id/stage-assets` | [限定接线](editor-backend-stage-asset-api.md)：actualadmin本人fixedcopy，准确saved revision＋六purpose distinctJob query，完整源/阶段产物/库重验与末次原服务capture/Root实际会话复查，只结构435roles/四false；非RuntimeManifest/validations/Trial/发布准入，不能据GET成功消除完整依赖/初始化/证书缺口 |
| `POST /games/:id/trials` | 仅作者，指定chapter＋修订＋有效校验报告；返回私有新窗口入口，不返回正式版本 |
| `GET /trials/:id/...`、`POST /trials/:id/status`、`DELETE /trials/:id` | 仅同一有效用户／会话；资源、状态／探测、主动结束；只暴露绑定快照 |
| `POST /games/:id/releases` | 仅作者，绑定修订／校验／预期当前正式版；202返回发布任务，提交后才显示成功 |
| `GET /operations/:id` | 发起者查询编译／发布／删除结果；管理员仅能查自身管理操作，不因此读到他人编译快照 |
| `GET /games/:id/revisions/:releaseId`（玩家端） | 只返回已获准对局或当前已上架游戏的可识别历史版本身份，不返回旧版开局权限；供存档版本核对 |
| `POST /games/:id/listing` | 作者自己的且无管理限制，或管理员；请求动作list/unlist，带管理行版本；不能上架草稿 |
| `POST /games/:id/restriction/clear` | 仅管理员；解除不自动上架 |
| `DELETE /games/:id` | 作者自己的或管理员跨作者；内置拒绝，已上架拒绝；确认名称与行版本，返回删除任务 |
| `GET /registry`、`GET /announcements?cursor=...` | 匿名；只当前已上架，内置常驻；私有字段不输出 |
| `POST /admissions` | 匿名，指定游戏／新局或恢复／章节及期待正式版；只当前已上架且版本符合时签发固定修订取数凭据 |
| `GET /sessions/status`、正式manifest／asset读取 | 匿名对局凭据绑定游戏／正式修订；下架后仍允许原凭据续取，删除则按明确删除事实返回 |

401会话失效；403权限不足；404不可见／未知对象；409修订／状态冲突；410仅有确实删除事实的已知游戏或已终止试运行；422内容错误／不支持域；429限速；503暂不可用。单资源404、超时或任何网络失败都不能推导GAME_DELETED。所有写端点服务端再查权限及内置保护，不能相信隐藏按钮。

### 5.3 保存、编译和发布线性化

1. 草稿保存检查账户仍有效、作者、非内置、游戏未删除及`If-Match`；事务写新快照／资源引用／修改时间。编译任务读取不可变快照，不在编译中追踪latest。
2. 发布请求捕获`expectedDraftRevision/expectedReleaseId`，重复请求取得同一operation。编译在私有staging命名空间完成；对象写入并读回核长度／hash／依赖后生成完整manifest。
3. 提交事务再次核对用户、权限、游戏、草稿修订及预期正式版；期间有新的草稿保存或其它发布则409，旧编译不能夹带新修改，也不能默默发布旧快照。作者重新审查后发起新请求。
4. 唯一提交点分配序号、写Release、切currentRelease、保留**提交时**上架／限制状态，必要时插入唯一`(gameId,releaseId)`公告并递增registryRevision。管理下架与发布在同一行版本串行，不让发布恢复上架。
5. 提交后响应丢失：同key或operation查询返回已成功版本，不再递增。提交前失败只留下未公开任务／staging，原正式版和计数不变。不同发布抢同一预期版只能一个成功。
6. staged对象未提交前不能被匿名猜URL读取；失败对象按任务引用清理。已发布版本在游戏存在时不自动回收。任何对已发布blob的原地覆盖必须被存储端拒绝。

编译Job记录每阶段摘要、编译器修订、输出清单和可重试状态；软件升级遇不匹配任务应以原修订执行或明确失败重启，不能把两个编译器的半份结果拼一起。发布不是目前`shutil.copyfile`逐文件覆盖的原子性包装。

### 5.4 物理删除与恢复纪律

删除先在事务中确认下架及权限，建立不可再写／发布／准入的删除栅栏；并发发布、上架、上传、复制目标登记不得越过。随后幂等清除该游戏草稿、全部正式版本、试运行、公告和专属资源引用，物理删除不再被其它合法游戏引用的专属对象，最后移除游戏记录。过程中可返回“刪除中”，只有核清成功才报完成；失败保留清理任务继续重试，不伪报已删完。

只保留不含游戏内容的最小操作审计与不可复用ID删除凭证，供曾获准的对局识别410；不是保留可恢复游戏的逻辑删除，不提供回收站／复活入口。缓存失效及备份清理同属删除完成核对；已下载到玩家设备的字节无法远程抹除。实际到达服务端的资源请求先判断游戏删除状态，再命中内部不可变blob缓存；不能把公开CDN永久URL放在状态门前绕过判断。浏览器已有缓存不承诺即时撤销。

备份必须覆盖一致的元数据清单及对应对象；在隔离环境演练恢复，重放删除凭证并排除已物理删除内容。不能以“备份”为由无限保留本应删除的专属数据；选用存储适配器时必须证明能清理备份副本或按游戏销毁解密能力，并记录其实际保障，未证明不宣称满足删除合同。未删游戏的全部正式历史资源仍保留。

### 5.5 内部永久栅栏基础（E-01-BACKEND-DELETION-FENCE-1，限定）

[维护源](editor-backend-deletion-fence.md)只落实§5.4首步：实际同SQL owner/admin／非内置／未上架／名称确认和row CAS、永久请求HMAC及最小fenced收据/审计原子提交。metadata／drafts／image直接查Game门与Root跨namespace key接同一持久fence；现行Blob/prepare/Job/私有库/copy返回及await/提交不越过。409GAME_DELETING不是completed410；无公开delete/UI或物理Blob.delete能力，refs/bytes/名称占用/快照仍保。完整清理／in-flight drain／共享引用／备份/玩家识别和future发布/Trial仍要逐项接线验证。

最终八主组83请求及十一compat36 Node／17库GET／四完整附件：actual回滚、同key／权限／listed／prepared/四nativeawait／restart/epoch、20章fullcopy Root与六purpose拒有证；内部opaque夹具不冒GameSource或普通新建。453声明447旧含375保护；失败原源码保且定位修fixture，人工再修internal prepare先owner后state避免泄露并全域重验当前SHA。不是完整§5.4/E-09/目标完成或云SLA。

### 5.6 内部只读删除观察（E-01-BACKEND-DELETION-INVENTORY-1，限定）

[维护源](editor-backend-deletion-inventory.md)在实际同SQL持久fence后，只对owner/admin给关联记录与双私有namespace分页元数据观察的最小计数/摘要；未知schema、对象/长度/cursor/重复及过程中SQL/R2/epoch变化拒。Root/453旧源不改，samehash不同物理namespace不猜refcount、不读body，deleteAllowed恒false；表名白名单不认证未来列引用/全部命令索引。两相同列表不是跨服务原子快照/in-flight drain、BodySHA或完成清理。

实际20章copy/save2、data/images输出和queued spring，85元数据对象-85引用/192关联行，native2项分页及权限/缺失/orphan/坏list/未知schema/restart/实际改密等最终八组87请求有证；455声明453旧含375保护。全引用图/所有writer-drain/物理delete/scrub/completed410/cache/真实backup及恢复仍缺，不关闭§5.4或完整工程目标。

### 5.7 持久命令目标关联（E-01-BACKEND-COMMAND-TARGETS-1，限定）

[维护源](editor-backend-command-targets.md)新增同SQL copy/stage HTTP command target关联；真实同actor request/Job及命令绑定、关联同事务，旧摘要不反解，合法准确重放才可补缺关联，不作成功receipt。Root run先query当前epoch/owner/fence，cancel保新认证owner可明确取消旧pending，不恢复运行；已fenced不新写command。inventory捕获已绑定行并核target，新增固定coverage=BOUND_ROWS_ONLY_LEGACY_UNKNOWN，deleteAllowed仍false、不称全部历史图或排空。最终十五组123请求、457声明452旧含375保护；关联/rollback/损坏/restart/fence及实际改密run-cancel分立有证。legacy/共享refs/全部writer-drain/物理delete/scrub/backup仍缺。

### 5.8 Root私有PUT持久观察（E-01-BACKEND-PRIVATE-WRITE-JOURNAL-1，限定）

[维护源](editor-backend-private-writes.md)：当前Root Blob原bucket包装为同SQL native前pending/fence，正常返回settled只指promise事实，原完整SHA/owner/epoch仍须重验；未知失败uncertain、ack失败pending及完整目标关联坏503，restart不自动清除。inventory纳入表与两个计数/固定ROOT_PUT_ADAPTER_ONLY_LEGACY_UNKNOWN；两个0不授全部writer排空或delete。最终十九组184请求/20观察及原十五当前兼容有证，459声明455旧含375保护。GET/body/CPU/legacy/其它进程/全部freeze/ref图/physicaldelete/scrub/cache/backup未闭合，不关§5.4或goal。

### 5.9 内部私有字节核验（E-01-BACKEND-DELETION-INTEGRITY-1，限定）

[维护源](editor-backend-deletion-integrity.md)新增真实fence/owner或admin管理后的固定private完整native流长度／SHA观察，前后完整列表和SQLinventory同、逐await actor-epoch/Game-fence复查；只返最小counts/digests，不取数给管理员、不赋跨作者读权。orphan/uncertain可hash但仍未知／不准删；deleteAllowed恒false。工程256对象／16MiB单个／128MiB全次等预算不为原机制或云SLA，重复列表不证ABA／跨服务原子快照、全部writer排空或引用图。最终26组266请求，85实际对象50,665,541B及真实restart／同长坏body／十二native-预算控制／SQL-R2和实际改密有证；461声明459旧含375保，Root/原服务/UI全不改。全physicaldelete／scrub／completed410/cache/backup仍缺，不关闭§5.4或工程目标。

### 5.10 命令目标服务完整性（E-01-BACKEND-COMMAND-PROOFS-1，限定）

[维护源](editor-backend-command-proofs.md)：原结构存在门不证明同actor合法target就是原command目标。真实Root/stage绑定事务以既有服务requestKey，对kind／actor／key／game／target和实际command摘要／存入epoch作固定域HMAC，与原command/target同SQL提交；坏seal不覆盖，只有合法准确同键重放才能补旧缺proof，不根据摘要猜旧target。新内部fenced同步管理观察只返counts/digest／legacyUNKNOWN／deleteAllowedfalse，不返target或内容；它不是成功receipt或权限。inventory捕获新表关联行，不将原observe误称为MAC验证。

最终33组318请求／23metadata-10byte-9command观察、原26当前兼容、proofINSERT真实回滚、同actor合法错目标及digest/epoch/MAC与换key坏值拒、孤立proof、实际restart有证；462声明457旧含375保护。r1源保后补inventory捕获，r2完整重验；fixture三元warning改等值if/else后r3最终全轮当前SHA。全历史关联／共享refs／drain／physicaldelete／receipt scrub／cache-backup与工程目标仍缺；服务key更换不猜自动迁移，不关闭§5.4。

### 5.11 当前编译任务冻结（E-01-BACKEND-DELETION-JOB-FREEZE-1，限定）

[维护源](editor-backend-deletion-job-freeze.md)：实际owner/admin／永久Game-fence和row CAS后，同SQL将当前CompileJobs queued/running/retryable失败置非retry终态／撤lease／推进generation-row；ready和原非retry失败、checkpoint/refs/快照/Game内容时间保。前后摘要及最小actor/time/counts由服务HMAC封存，故障回滚全部任务更新；重放核当前行/有效key，坏值不覆盖，不授内容取数或成功／删除资格。inventory新增表捕获，原Jobs／Root／journal／其它461输入含375玩家不改。

最终40组399记录调用及原33当前兼容，真实SQL回滚／sameinput并发／future列-state及坏key-MAC-row／restart／实际改密，checkpoint晚到既有fence409、零Job新增记录晚inventory409，以及Job终态后native pending仍1有证。464声明；仅当前CompileJobs，不取消provider promise、不清unknown journal，不冒copy/draft/legacy/future writer全冻结、全drain／物理delete／backup／目标完成。

### 5.12 当前SQL列布局门（E-01-BACKEND-DELETION-COLUMNS-1，限定）

[维护源](editor-backend-deletion-columns.md)：表名白名单不足以排除新增引用列，现inventory在实际权限及fence之后、scoped/native之前用table_xinfo对当前34表234列固定cid/name/type/null/default/pk/hidden布局，每次capture／await后重验；未来列／缺列／改名／生成隐藏列或属性不符503，不自动迁移。13份固定源码DDL／Node builtin SQLite纯内存派生、actual workerd当前schema与原40流程当前兼容，最终46组454记录调用及真实ALTER、七PRAGMA返回控制／late schema／restart有证；466声明463旧含375保。仅列结构，不签完整DDL／trigger-view／未知引用语义／全refs-drain-delete，原DTO／legacy UNKNOWN与deleteAllowedfalse不改。Root／原stores／UI／规则不改，不关§5.4或goal。

### 5.13 当前显式引用多重边（E-01-BACKEND-REFERENCE-EDGES-1，限定）

[维护源](editor-backend-reference-edges.md)：新helper共用inventory实际authorized/schema/fence捕获中的六对象表／snapshot／baseline／Job根与checkpoint output提取。同固定private namespace的节点去重但来源／row fingerprint／field边保全部次数，未知长度由已知描述落实，矛盾仍拒；跨物理namespace同hash不判共享，foreign显式root另计。同步内部最小summary及全图冻结／digest不赋权限或持久删除计划，legacy UNKNOWN/deleteAllowedfalse。最终52组含原46原期待当前兼容、SQLite独立COUNT/json_each／重复snapshot／foreign alias／restart及另标纯模型有证；468声明465旧含375保。r1 DDL读取目录错误保失败，测试单路径修后r2全fresh重验，不改业务期待／预算。完整refs／writer-drain／physicaldelete／scrub-cache-backup仍缺，不关§5.4或goal。

### 5.14 当前pending草稿冻结（E-01-BACKEND-DELETION-DRAFT-FREEZE-1，限定）

[维护源](editor-backend-deletion-draft-freeze.md)：实际sameSQLite owner/admin、准确Game-fence-row后，仅pending draft_requests置failed/DELETION_FROZEN，保已有failed/committed及请求内容/对象/references/成功receipt/snapshot/Game内容时间；最小HMAC记录同事务，repeat核实际当前行不重封、SQL失败全回滚。没有draft lease/generation，原PrivateDrafts/Root门不改，晚到保原GAME_DELETING，不假provider取消或R2事务。inventory捕获新表、fixed columns只增35th声明（35表243列），原34布局全保持。

当前59组含原52全链兼容，真实Root43MB全源保存/nativeawait/fence冻结、fault500/并发retry、failed/committed保及晚到409、pendingSQL0但nativejournal1、restart/实际改密有证；470声明466旧含375保。nativeDrainVerified/deleteAllowed恒false，全copy/legacy/external/futurewriters、全refs/physicaldelete/SQLscrub/completed410/cache/实际backup仍缺，不关闭§5.4/goal或原机制准入。

### 5.15 当前SQL冻结同事务协调（不授排空）

[维护源](editor-backend-deletion-sql-freeze.md)：新内部协调器同storage构造原Job/Draft冻结，外层sync事务内重核owner/admin/fence-row、固定35表布局与committed无lease copy行，以独立捕获目标调用两服务；第二seal故障须回滚第一Job更新/记录。只重核原两HMAC，不新增表/批准收据/公开Root；当前journal计数可变，恒nativeDrainVerified/deleteAllowed=false。

最终67组601记录调用含原59当前兼容，真实第三全20章copy/queuedJob/Root nativePUT后hold/fence、secondseal trigger500共同回滚、race/repeat/坏MAC/copy-state/late409/pending保/restart/改密及内部getter单次捕获有证；472声明470旧含375保。r2 generic502与cleanup错误保、细因未知；仅新增工程flow预登记真实owned waiting通知避免重准备期间并发HTTP stats，240s/1800s和旧59期待不变，r3全fresh。不称原observer可靠、全copy取消/legacy writer/native排空、refs/physicaldelete/scrub-cache-backup或§5.4/goal完成。

### 5.16 Root原生私有写入命名空间封闭（非全writer证明）

[维护源](editor-backend-private-namespace.md)：只关闭journal非private-key nativePUT旁路；当前五writer族经同BlobStore/journal、两个nativecatalog只GET，代码SHA/AST限定这些当前调用点，不冒alias/legacy或futurewriter闭包。原合法allocation在Game创建前的写仍由原Blob权限/lease门管理；不擅加Game存在要求。get/list透明、delete503、ROOT_PUT_ADAPTER_ONLY_LEGACY_UNKNOWN及pending/settled/uncertain语义保持。

一次72组646记录调用、原67当前兼容、19坏namespace/key/nativeALL计数-journal不变与真实installedroot bytes保、Root合法private/条件null/fence/restart有证；473声明471旧含375保，表布局/Root/其它服务/UI不改。仍不授全native排空、所有refs/delete/scrub/cache/backup或§5.4/goal完成。

### 5.17 当前实例PUT有限等待（仍非完整排空）

[维护源](editor-backend-current-write-wait.md)：原journal #begin后/native前同步登记，finally移出并通知所属wait；原key/fence/pending/native/settled-uncertain/ack语义不变。new service同storage真实journal+原SQLfreeze，独立目标，在等待前/每await重核actualprincipal、fence-row、35表布局和原seals。current pending无handle/跨restart、uncertain拒；有限timeout只撤own subscription/timer，不取消provider/修SQL，不追认历史provider结果。exact8最小事实mode CURRENT_INSTANCE_REGISTERED_PUTS_RETURNED_LEGACY_UNKNOWN，nativeDrainVerified/deleteAllowed恒false，没有公开Root/新表/410。

最终fresh83组790记录调用含原81原期待当前兼容及12当前facts；旧源独立ack probe两异常wait200保且明确非business pass，当前捕获条目补actual ack及sameoperation/game/hash/instance/settled原行留存核验，SQL假settled／ack后移除行均503，不修SQL；真实Root原生前/后hold、两同hashPUT与并发wait、100ms timeout/未知/实际ackfault/restart、await坏MAC-ADDcolumn/实际改密401与finally ownslots清理有证；475声明472旧含375保，Root/UI/所有writer和35表243列不改，无新producer失败，LSP不确认另签。当前0只限自己捕获的registered PUT，不是全provider/legacy/external/read/body/CPU排空或immutable收据；fullrefs/physicaldelete/scrub-cache-backup/其它Q和goal未完成。

### 5.18 当前Root读取调用退出等待（不授body/provider排空）

[维护源](editor-backend-current-read-wait.md)：BlobStore在原scope/descriptor后、nativeGET前登记当前read，原GET/逐流权限/长度-SHA/取消及错误核心精确保；Root仅传actual ctx.storage，原PUT journal/所有writer不改。新真实品牌/同storage服务拥有原SQLfreeze，捕获目标并等待当前调用返回或拒绝；timeout只撤own订阅/timer，不abort/retry/认证EOF/cancel成功。exact7最小facts恒bodyDrainVerified/nativeDrainVerified/deleteAllowed=false，模式CURRENT_INSTANCE_REGISTERED_READ_CALLS_RETURNED_BODY_DRAIN_UNKNOWN，非immutable receipt/历史或完整native证明。

最终fresh93组930记录调用含原92当前兼容与15read facts；r1源/report保，补新outer await后实际authority重查，inner最后scope后独立真实fence控制须第六查询409、不信DTO。真实Root GET前/read chunk后/cancel hold、双调用与并发wait/短timeout、get失败和cancel次错仍原错误、latefence/实际seal-column/改密/restart有证；477声明473旧含375保，35表243列不变，无新表/公开Rootroute/UI/delete/410。原observer/SLA、全writer/read/body/CPU/legacy/refs/physicaldelete/scrub/cache-backup与§5.4/goal不闭合，LSP未确认另签。

### 5.19 当前SQL声明完整性（非row/ref/drain/delete能力）

[维护源](editor-backend-deletion-definitions.md)：当前14源35DDL→ownedNodeSQLite固定70对象/35表35隐式索引3FK/完整table文本与索引-FK属性；actual workerd同。新内部观察在原actualprincipal/fence-row/usedID/CAS后的同transaction核目录/原列与enforcement，恒rowIntegrity/nativeDrain/deleteAllowedfalse；没有重新从现状造期望、自动迁移、R2或Rootroute，新事实返回后仍需提交重验，旧inventory/freezes仍原列门，不自动继承新保护。

最终fresh16组80调用/15facts，等列CHECK/FK/COLLATE/UNIQUE漂移、extra index-view-trigger-table、defer/owner/epoch/restart有证；_cf_CREATE SDK拒是SQLITE_AUTH事实而非native_cf_table核验，Node9组prefix/缺对象/synthetic分立。r1/r2fixture/helper和aux失败原件全保后最小修正，480声明477旧含375/96imports，35/243不变，无预算/期待放宽。§5.4完整行/refs/native-body-CPU/legacy/physicalcleanup/scrub/cache-backup等仍缺，LSP未确认另签。

### 5.20 当前定义门与原SQL冻结共同事务（非row/ref/drain/delete）

[维护源](editor-backend-definition-freeze.md)：新opt-in内部协调器捕获primitive目标和actualactor/epoch/role，sameStorage outertransaction内原scope/70完整声明在原Job/Draft冻结之前与之后重核；原执行器/HMAC复用，无外部freeze实例/旧DTO权限。原freeze表缺失先拒，原constructor只在已核全部声明存在后IF-NOT-EXISTS，不自动重建history；late失败回滚两冻结/seals及受测SQL mutation，不假SQL-R2原子。

实际fresh11组88调用/4facts、七preDDL/late nativeindex-epoch-row与synthetic tuple分立、missing表/restart/password有证；r1原10源/report保后fullr2，无producer失败。482声明480旧含375保/97imports，所有旧服务/Root不自动接保护，35/243/70不变；工程SQL skeleton不冒Source/enqueue-save/真实nativepending，rowIntegrity/nativeDrain/deletefalse，完整row/refs/body-provider-CPU-legacy/physicalcleanup/cache-backup/其它Q仍开。

### 5.21 当前三声明FK行（非完整行/ref/drain/delete）

[维护源](editor-backend-declared-fk-rows.md)：新内部sameStorage事务在原完整70定义/actualprincipal-owner-fence-CAS门后，固定content_games.owner_id/installed_sources.registered_by/sessions.user_id→users.id的有界LEFT JOIN；每表10000/总20000、每表后和最终原门重核、actualactor-epoch-role固定，缺父/查询/预算拒，不返全局session/user计数或ID。exact13事实仅foreignKeyRowsVerified/edges3与mode，rowIntegrity/nativeDrain/deletefalse，无newtable/公开Root或旧门自动升级。

一次fresh13组50调用/4facts，真实temporary deferred孤儿低层拒并rollback、fullservice先拒defer/late nativeindex-row-epoch/synthetic tuple/10001预算/restart/实际epoch有证；Node7模型与总预算分立，aux parse失败保后SQL探针characterized不冒freeze，main一次通过。484声明482旧含375保/98imports，三关系不是内容/历史/sharedrefs及CHECK等全行证明，不授§5.4、provider/body/CPU/legacy/cleanup或主goal完成；LSP未确认另签。

### 5.22 当前原生quick_check（不授全row/ref/drain/delete）

[维护源](editor-backend-sql-check-rows.md)：native支持quick_check/ignoreflag/databaseSize、SDK拒完整integrity_check/pagepragmas；原完整定义/actualactor-epoch-role/fence/CAS事务前后两次quickcheck，CHECKignore须0/native size≤32MiB，只恰ok接受、不返回全局size/ID/错误。12组51调用/4facts，持久badCHECK/late nativeSQL与syntheticrole/预算和完整行-size rollback/restart/password有证，Node8另标；486声明484旧含375全保/99imports，所有旧门/Root未改不自动升级。官方SQLite明示不核UNIQUE/index内容/FK，本scope也不签业务关系/全refs；rowIntegrity/nativeDrain/deletefalse，无Source/R2/newtable/公开route/repair，故障定位及原件保留、产品预算/期待不变，不关§5.4/主goal。

### 5.23 当前声明唯一键行（非索引一致/完整row）

[维护源](editor-backend-declared-unique-rows.md)：原固定35隐式唯一键33表，仅BINARY完整键；native NOT INDEXED marker预算/原生GROUP-HAVING排NULL，非JS合键，不签索引页内容一致。新actualsameStorage/身份固定/原70定义-fence观察、首遍逐表重验及末次authority后的无回调第二完整扫描，exact13不泄全局键/行/错误；rowIntegrity/nativeDrain/deletefalse。fresh15组50调用/5facts，临时去约束simple/composite低层重复503与全部rollback、原UNIQUE拒普通重复、fullservice先拒DDL、lateSQL/第二遍预算/restart/password有证，Node10无索引模型分立。488声明486旧375玩家保/100imports，旧Root/全部门不自动升级，无新schema/公开route/Source/R2/repair/delete410，§5.4/其它Q未闭合，LSP未确认另签。

### 5.24 当前声明SQL检查与冻结共同事务（非完整row/refs/delete）

[维护源](editor-backend-validated-freeze.md)：原完整定义门在freeze constructor前，原quickcheck/三FK/35UNIQUE前后检查与原definitionfreeze两SQL更新/seals共同外层transactionSync。actualprincipal-epoch-role/scope重核，最后callback后无回调重扫与依原Root policy的实际session-user最小SQL核验，不信DTO，无await/provider操作；缺表不重建。exact22组合事实仍rowIntegrity/nativeDrain/deletefalse、不签索引实际内容/完整业务refs或持续权限；全部旧Root/门未改、不自动受保护。

最终fresh15组105调用/4facts，SQL skeleton非Source/enqueue/save/PUT，实际原执行器HMAC/状态共同提交和badCHECK先拒、两seals后坏行/预算-index-row与末次actualepoch-expiry-role/行增长拒、全35表/目录/size rollback、restart/password/缺表有证。490声明488旧375玩家保/101imports，产品三轮同、r1/r2新诊断和fixture8值/原5列失败保仅最小修；原期待/1800s不变，不重跑无关原93/20章/浏览器/规则。全row-ref/indexContents/reader-body-nativeCPUlegacy/physicalcleanup/scrub/cache实际backup与其它Q继续open，LSP未确认另签，无新schema/公开产品route/DELETE410。

### 5.25 固定索引/表逻辑投影（非物理完整性/删除许可）

[维护源](editor-backend-index-projections.md)：35固定声明索引/33表，actual EXPLAIN单覆盖索引计划后原表NOT INDEXED与INDEXED BY增量rowid/type/hex/numeric投影相等；32MiB/10000每表20000总行/64MiB投影计量，不是heap/云SLA。同authority/schema/fence/CAS事务首遍逐表重查，末次外部callback之后纯扫描及内部actualsession和scope复查，不信DTO。exact14仍完整indexContent/row/nativeDrain/deletefalse，逻辑投影不认证全部物理页/业务refs/历史provider。

一次fresh18组61调用/5facts，native健康NULL-BLOB/TEXT、lateDDL-row-epoch-expiry预算/35行目录rollback/restart/password有证；五类坏结果明确synthetic、Node10分立，未造native坏页/绕SDK。492声明490旧375玩家保/102imports，所有旧Root/门不自动升级，无Source/R2/newtable/公开route/delete410；原§5.4/全目标仍open，LSP未确认另签。

### 5.26 当前游戏名称/永久ID绑定（非完整业务引用/删除许可）

[维护源](editor-backend-name-bindings.md)：依据§1.1和原metadata.js#names/#create/#save，只读actualauthority/schema/fence/CAS事务核原生TEXT目标、当前draft/nullable-formal BINARY占用恰等distinct名称数量、owner/game双向对应和usedID一条；LIMIT2/3与32MiB，末次外部callback后实际session-scope/无回调binding重查，不信DTO。exact13 nameBindings/usedIdBindingtrue但row/nativeDrain/deletefalse，不授字段域/正式发布/其它game/BLOB别名/全历史refs。

最终fresh29组97调用/8facts，native真实坏引用/第三name/lateSQL-role-epoch-expiry/全35行目录rollback/restart-password，temporary去唯一约束重复membership低层503及Node8分立。494声明492旧375玩家保/103imports，原r1新手工样本重插排序hash故障保仅fixture修、完整hash期待保持；r2保后补独立expectedNames SQL cardinality，r3前28同check。全部旧Root/门未整合，无新schema/公开route/R2/Source/delete410，原§5.4/全目标仍open，LSP未确认另签。

### 5.27 现有ValidatedFreeze接逻辑index/name（非全refs/删除许可）

[维护源](editor-backend-bound-sql-freeze.md)：修改现有coordinator，不另增观察器；原quickcheck/三FK/35UNIQUE之后加入原35覆盖索引投影与当前目标BINARY名称-usedID检查，原两freeze/HMAC同outertransaction前后核；末callback后内部actualsession/schema-scope/fence-row/纯复扫/最终session，不信旧scopeDTO。原22增五字段成exact27，physicalindex/row/nativeDrain/deletefalse，不扩原预算/错误或业务值域。

最终现有旧CLI同process委托当前suite fresh22组155调用/5facts，原15状态-code/发生8-10hook/预算/整rollback期待保，actualname缺失/两seals后和最后callback删除/最后row变动与全35行目录size-sealsrollback，两synthetic indexplan-bytes分立；旧body native gap onlycharacterized并sentinelrollback。495声明492旧375玩家保/103imports，两个旧源先归档、产品两轮同、无producer失败；Root/其它freeze-wait未接、全refs/在途/cleanup/其它Q仍open，无新schema/公开route/DELETE410，§5.4和主goal不关闭。

### 5.28 现有ValidatedFreeze接六私有对象行关系（非全引用/物理删除）

[维护源](editor-backend-private-row-bindings.md)：原五writer和snapshot实际写者核准six-family原生描述子/state及四parent关系，copy game-owner、draft actor-key-game-owner、compile operation-actor-game-owner、draftref snapshot-game-revision；typed父关联逆向捕获外移child。同private namespace同SHA长度由六nativegroups/15pairjoins核，不跨namespace合物理对象；native拒UNION的真实能力边界保，不改SDK/预算。现有checks同原两freeze-HMAC outertransaction前后/末外callback后纯扫，原actualsession-scope-fence全定义/最终session保持，exact31含四限定bool，fullrow/ref/native/deletefalse。

最终现有CLI同process fresh36组275调用/6facts，前22check字符串及status-code-hook8/10-预算-完整rollback保；native六坏descriptor/失父-actor-game/snapshot/长度及晚到坏descriptor拒，全35行目录size/sealsrollback。Node22/辅助query定位分立，所有失败原件保后仅新SQL能力/样本修，r4保后两helper等值分支消warning、r5fullfresh。496声明493旧375玩家保/104imports，原35表243列70对象不变。工程rows/snapshot非Source/正常copy-save-enqueue-PUT，Root/其他freeze-wait未接、其它历史shared/alias/receipt/CPU-provider-body/cleanup/410/cachebackup和§5.4/goal仍open，无新observer/schema/公开route/repair或云操作。

### 5.29 现有ValidatedFreeze接saved snapshot/job引用（非全引用/删除许可）

[维护源](editor-backend-saved-job-links.md)：依据metadata.#save/#insertSnapshot/#snapshotReference与jobs.#enqueue/#owned，current draft指向同game精确saved snapshot；job原owner/game/revision及rootKey/sourceDigest/dependencyDigest三引用逐项原生BINARY相同。rootDigest与sourceDigest可不同（prepareSnapshot95-97），不强等/不改绑latest。纯SQL限DB32MiB、各表10000/总20000，纳原共同事务checks前后与最后callback之后纯扫/actualscope-session；exact32新增savedJobSnapshotLinksVerifiedtrue、新mode，但fullrow/ref/indexContent/native/delete仍false，无新observer/schema/产品route。

现有CLI一次fresh45组342调用/7facts，原36权限/status-code-hook-budget-全35行目录size/sealsrollback期待保，真实六错配/旧saved正例/两边界DELETEsnapshot拒，Node20分立。497声明494旧375玩家保/105imports，两个旧源wx归档，Node辅助tuple形状误读故障保后只模型修、无native失败。SQL伪saved-parent非Source/正常save-enqueue/PUT；全部Root/其它门、完整typed别名/历史-shared-command-receipt/Source字节/物理delete410及其它目标仍开，LSP未确认另签。

### 5.30 现有ValidatedFreeze接copy origin/初始snapshot/receipt（非完整来源字节/删除许可）

[维护源](editor-backend-copy-origin-links.md)：AdminFullCopy同事务writer/原result reader和profile/snapshot canonicalSHA链闭合后，目标copy request/origin互一与owner、四来源字段及shared installed SQL父、精确snapshot1 source-dependency、baseline committed描述/全部copy对象SQLcommit、四字段decoded JSON receipt。baseline index-root不强等baseline sourceDigest，current rootDigest不强等sourceDigest，初始snapshot不latest、registrar不当owner。无copy明确vacuous，preGame allocation/abandoned不泛化。原checks首末/最后callback-free实际scope-session同原两freeze-HMAC事务，exact34但fullrow/ref/indexContent/native/deletefalse，Root/其它门未升级。

当前CLI fresh59组463调用/8facts，原45字符串/权限-error-hook-budget/全35行目录size-sealsrollback保持，11真实错配与两晚边界DELETEorigin拒；Node36分立/回执UTF8工程8192预算，DB32MiB每对象-snapshot10000总20000。498声明495旧375玩家保/106imports，两个旧源wx归档，r1新two-object样本使继承批改SHA PK冲突，独立native9调用定位只新fixture单baseline fault修/原期待预算保、r2全fresh，aux语法原件保。手工SQL不是Source/normalcopy/pinnedpolicy/bytes/PUT，schema无迁移/公开route/DELETE410/R2/UI/原机制不改，§5.4与其它目标仍open，LSP另签。

### 5.31 现有ValidatedFreeze接已提交保存回执SQL链接（非完整summary/删除许可）

[维护源](editor-backend-draft-receipt-links.md)：依据PrivateDrafts.#receipt129-132/save156-197与metadata.transaction115-146/save169-179核同actor-key content_operation digest-epoch-method-target-原JSON TEXT、exactresult快照三refs，decoded game/revision等expected/no-op/+1；历史epoch不current、旧saved不latest、noop对象不强commit。metadata.revision不限制位数，expected64位限制不推广result（65位进位合法）。原首末共同事务/两freeze-HMAC/末callback-free scope-session保，exact35新draftReceiptLinksVerifiedtrue，其余完整row-indexContent-native-deletefalse；Root/其它门未变。

最终CLI fresh82组655调用/12facts、原59字符串/error-hook-budget/全35行目录size-sealsrollback保，17真实坏links/bytes拒、三成功/carry与两晚边界拒，Node31另标；499声明496旧375玩家保/107imports。首轮81无carry保源后人工source复核撤错误result64cap，独立carry/fullfresh；newfixture flagwarning改业务revision值后r3全82同check，不放宽期待/预算。DB32MiB/每表10000总20000/每receipt8192UTF8B合计8MiB，非heap/CPU/providerSLA；完整summary/typed-crossgame/shared-history/content-command refs/Source及provider/physicalcleanup仍open，手工SQL非正常save/PUT，无新产品route/schema/delete410。

### 5.32 现有ValidatedFreeze接copy永久保留键/元数据操作（非全namespace/summary/delete）

[维护源](editor-backend-copy-operation-links.md)：依据copy.reserve37-50与execute101-110/metadata.transaction115-146，create/new reservation永久保留，successcontent_operation同actor-key-method-target-digest-storedEpoch，元数据11字段summary不同copy四字段receipt。新purehelper纳原首末事务checks/末callback-free actualscope-session，核目标TEXT committedcopy实际owner/两个操作槽互一及JSON初始game-owner-draft-row1，不latest/currentepoch，save/job/cancel/preGame不套reservation需求。DB32MiB/固定LIMIT2/JSON8192UTF8B非SLA；exact37加两links true，fullrow/indexContent/native/deletefalse，Root/其它门未变。

final105组838调用/13facts，原82字符串/error-hook-budget/全35行目录size-sealsrollback保，20真实坏槽/bytes拒/old37-current2正例/两晚DELETEreservation拒，Node34分立；500声明497旧375玩家保/108imports。r1新positive漏admin实际401保，onlynewcaller补session/fullfresh、product/helper/fixture两轮同，before-run猜错override方法核actualparent后修并保草稿。工程SQL非Source/normalcopy/PUT，无新observer/schema/productroute/R2，完整summary/namespace/typed-crossgame-shared历史/全Root-submit-waits/provider/physicalcleanup仍open。

### 5.33 现有ValidatedFreeze接目标编译操作（不认证retry历史/孤儿归属）

[维护源](editor-backend-compile-operation-links.md)：jobs.enqueue73-84同SQL原job+enqueue，canonicalSourceTokens/UTF8 SHA字段method-game-draft-scope-pipeline；retry132-144追加同job，expected不存，不推当前row恢复摘要。新pure target job-selected op actor-key-method/hash表示/恰一enqueue及精确摘要纳现有首末checks/末callback-free scope-session；三compiler wrappers/StageHTTP独立policy未认证。exact40两新true与retryRequestDigestsVerifiedfalse，完整row-indexContent-native-deletefalse，Root/其它门不变。DB32MiB/各10000总20000/canonical64KiB工程预算非SLA。

fresh115组913调用/14facts、原105字符串/error-hook-budget/全35行目录size-sealsrollback保，七真坏关联/两晚DELETEenqueue拒、多retry-row100正例与Node18分立；501声明498旧375玩家保/109imports、无producer失败。工程SQL非normalenqueue/Source/PUT，typed-orphan/reverse/shared-history/全部namespace-command/Sourcebytes/provider/cleanup与其它Q仍open，无新observer/schema/产品route/delete410。

### 5.34 两个现有read/writewait接当前ValidatedFreeze（非全部排空/删除）

[维护源](editor-backend-validated-waits.md)：actualbody/只读native缺口后，仅两个waiter import/constructor共四替换，原privatebrand/storage/capture/等待订阅timer/ACK+settledtuple和8-7false DTO保持；每次current走当前40字段SQL冻结/checks/finalactualsession-scope。更具体Schema input/CAS代码适用，missinghistory在executor constructor前拒。原首次SQLfreeze可能await前已提交，晚拒不模拟回滚SQL/R2，timeout不abort/retry/cancel；Root/其余coordinator未变。

fresh23检查353调用/4facts/16asynccases/10reportsource11同期wx源：前坏name-index拒与真实Root登记-fence-订阅后的lateSQL-row-epoch-expiry/timeout-owncleanup/ACKunknown/同实例缺history不重建有证。facade暂停底层R2调用前、释放后真实R2，非provider悬挂；read错误归还不是EOF/cancel成功。502声明499旧375玩家保/109imports，r1旧spawn未SDK/r2新title9码点被原8码点门正确422，保源仅newsetup最小修原期待预算保持后r3fullfresh；次生Windowsclose不冒SDK修。旧83/93全源/媒体suite未重跑，完整ref-body-providerCPUlegacy/unknownjournal/physicalcleanup-cachebackup410与其它Q仍open，无schema/产品route/UI/玩家/原机制改动。

### 5.35 现有ValidatedFreeze接bound Stage HTTP关系/现存MAC（非run成功/完整历史）

[维护源](editor-backend-stage-command-links.md)：Stage.#command49-58先command-target/proof同SQL后CAS/execute；enqueue/retry无此要求，purpose/expected不存不从currentrow/pipeline重造摘要。原HttpCommandTargets.#binding/verify/record定义array HMAC actual服务key和storedEpoch；newpure选择当前TEXT jobs/explicit-target/proofs/逆当前job/相应command，native BINARY owner-actor-key-game-job-parent+现存MAC纳原首末共同freeze/末callback-free actualscope-session，不constructor/reseal/repair，缺proof留unsealed1/verifiedfalse。exact43三新stage字段、LEGACY_UNKNOWN mode，其它fullrow/indexContent/native/deletefalse。DB32MiB/每族10000合计20000/编码8192UTF8B工程预算非SLA。

fresh130检查1030调用/16facts、原115字符串/error-hook-budget/全35行目录size-sealsrollback保，11真坏关系/MAC/逆game与两晚DELETEcommand拒、sealed/legacy分立及Node24；503声明500旧375玩家保/110imports，无producer失败。手工job/opaquecommand由actualrecord签仅是持久关系非Source/Stage正常run/compiler/PUT，未签purpose-preimage/成功。waiter本体不改依现有类，但本轮无新Stage异步case，Root/其它coordinator未升级；未绑定/移出job/typed-crossgame-shared-history全refs/Source/provider/physicalcleanup仍open，无新schema/产品route/UI/规则/delete410。

### 5.36 现有ValidatedFreeze接bound copy HTTP关系/现存MAC（非执行/请求preimage）

[维护源](editor-backend-copy-command-links.md)：Root.copyCommand256-282 sameSQL record先于replay/cancel/claim/execute；target为allocation actor+op_key组合的key，非jobUUID/globalkey。原operation283-286 method/path/value/expected不全存，不从currentrow重造；storedHTTPepoch不强等allocation/currentowner。native explicit/pairedreverse selection、parent/actualowner与command/proof/原JSON-array实际servicekeyMAC，missing保legacy不constructor/repair/reseal。原两freeze-HMAC/最后actualscope-session共同事务保，exact46三新copy字段与独立stage状态，fullrow/indexContent/retryDigest/native/deletefalse；waiter源码不变无本批新async覆盖，Root/其它提交不升级。

一次旧CLI146检查1167调用/19facts/46report4wx，原130字符串/status-error-hook-budget/全35行目录size-sealsrollback保，11坏关系/MAC/逆game/孤立与两晚DELETE拒、sealed/legacy/同keys不同actor正例，Node26独立。504声明501旧375玩家保/111imports，35/243/70不变，无producer失败。DB32MiB/各组10000总20000/8192UTF8payload guard非heapCPUproviderSLA，工程command实际签MAC非原HTTP/run/cancel/Source成功；全部typed/unbound/sharedhistory/preimage/physicalcleanup/runtime仍open，无新route/schema/delete410。

### 5.37 现有ValidatedFreeze选中六族键跨族结构absence（非正常来源/全history）

[维护源](editor-backend-key-namespace-links.md)：原配置Root八族actor-key门与已证六native选择组合，42固定EXISTS，metadata companion非新族、differentactor同key分立、expiredauth不TTL清，delete actor可admin不owner。DB32MiB/每族10000总20000/严格projection/type，非heap/CPU/provider SLA；typedalias/unbound/moved-parent/auth-source归属及normalRoot provenance UNKNOWN。原46检查先行与原两freeze-HMAC同SQL/末callback-free实际session-schema-scope保，exact48新absence true/normalRootOriginfalse，Root/其它提交/waiter源码不变，无新产品route/schema/delete。

final155检查1239调用20facts48report4wx，原146字符串/error-hook-budget/全35行目录size-sealsrollback保，六真实authcollision前拒/不同actor-metadata正例/两晚边界精确拒，Node57全部42对分立；505声明502旧375玩家保/112imports。r1newmetadata样本6值插8列正确500保，onlynewfixture补存入37/created_at，产品/helper/tool同、原期待预算保再r2fullfresh。工程SQL非normalRoot/Source/provider，complete46领域以外history/refs/native-delete-runtime仍open；既有waiter引用当前class，但未复验23异步/旧83-93套件，不推广新等待证书。

### 5.38 管理下架/解除认证状态事务（只API，不授发布上架）

[详细维护源](editor-backend-management.md)：new GameManagement与actual Root/principal/storage，exact admin unlist/clear、quoted管理row IfMatch与body-headerHMAC、永久content reservation/operation两method（Root copy族标签非copy能力）；oldhistoric六字段result不latest/reapply，no-op不增row，新key独立audit。只listed/restricted/row_revision及独立event写，内容时间/draft/refs/versions不改。first-last actualSQL session/role/epoch/safeexpiry与Game/fence/builtin、原Root keyguard后实际存在七known族nativeBINARY键自核，防R2配置移除legacy早return；新表/修复/未知future族/资源或正常Source准入无。

final16检查161调用4minimalreceipt12wx、原13whole35rows/catalog/size-trigger-lateSQL/权限-budget/原错误保、实际去R2配置保留authkey拒/末callback expiredkey碰撞/密码handler/restart有证；Node28独立fakeports、原账户当前7组61请求；原15/26保，manual receipt array-key coercion补primitive ownaction门及两model/一native只读503，r3fullfresh。507声明504旧375玩家保/113imports另签，当前35/243/70无schema改；firstNode lazyexec错误onlyadapter eager修，不放宽期待，helper人工发现配置边界后加纯检查/fullfresh。完整操作UI/unknown-write客户端、正常发布/上架-限制/registry/announcement同CAS提交、全部Root/ref-native/bodyCPUlegacy-delete/Runtime/Trial仍open，本小节不是完整Q20/物理删除认证。

### 5.39 管理操作界面与原键恢复（不授发布/上架）

[维护源](editor-backend-management-ui.md)：Root只追加management.js公共Text route，existingadmin页面public摘要/confirmed两动作与local原actor-publicversion/game/key/action/expected六字段journal。实际请求权限仍RootSQL判，publicversion不是epoch权限；先persist后POST，unknown/坏200/网络错误保原key/body/header，reload/setIdentity不自动写/查。仅explicit原operation GET之exact404允许人工confirmed同键重试；旧result不是currentstate，另GET列表；forget只停止local追踪，不cancel/rollback/重用permanentkey。lateidentity/version/generation不装旧结果，badstorage阻新POST，不读他人draft/builtin。

actualfresh browser13检查24控制请求9管理POST5operationGET、独立fakeDOM-port26：actualcommit后丢回复／pre-nativeabort／坏200、GET404/retry、cachedCAS409、passwordhandler-epoch与actualRootrestart、cancel全35行目录size和public-only/IDB0有证；既有账户/四模块壳保持，非fullcopy-save-R2-regression。三旧源限Text/装配，management API/认证/CAS/schema/16KiB保持，新509/114与504旧含375玩家110旧imports/9syntax577links73Q/35-243-70已static-r3独立核，旧Root整个类body与三旧源正逆delta等值，文档后r4重签。r1cookiePath采集/r2pending离开确认漏接保失败源码-log、onlynewtest修；r3pass后flagwarning消除/r4同13fullfresh。不签完整Q20/正常发布上架-registryannouncement/匿名旧局/fullrefs-drain-delete/RuntimeTrial工作台初始化及73Q。

## 6. 权限、认证及资源安全

| 动作 | 创作者 | 管理员 | 内置原件 |
| --- | --- | --- | --- |
| 内容读写／试运行／发布 | 仅本人 | 仅本人，不能读写他人草稿 | 编辑端只读，无写入API特例 |
| 上下架 | 本人、受管理限制约束 | 全局自建游戏 | 永远上架 |
| 解除管理限制 | 不允许 | 允许，但不自动上架 | 不适用 |
| 物理删除 | 本人且未上架 | 跨作者且未上架 | 一律拒绝 |
| 完整复制内置 | 不允许 | 允许，产生本人新游戏 | 来源不变 |

- TLS、服务端密码哈希（独立随机salt、经过审阅的标准KDF，不自造算法）、常量时间验证、账户＋来源双维度登录限速、统一登录失败信息。默认秘密仅从安全配置注入，日志／源码／文档／浏览器包均不得包含；共享默认密码抢先登录风险按产品决定保留披露。
- 使用不可预测服务端会话，cookie为Secure／HttpOnly／SameSite=Strict、host-only，限定API路径；CSRF token及精确Origin检查覆盖所有改变状态的请求，GET不得写入。会话固定攻击通过登录／改密换token防止；cookie不放localStorage，公开资源不携带管理凭据。
- **不同端口不隔离cookie，SameSite也不是同Origin。** 精确Origin必须包含scheme/host/port，不能用通配CORS；独立端口不是单独的安全论据。草稿试运行放在编辑器受控源，复用同引擎静态模块及仅编辑端可读的资源路由，不访问玩家正式源的IDB。
- 会话携带账户`authEpoch`；禁用／重置／改密在事务递增epoch并撤销旧会话，写提交再次查验。启用不复活旧token。管理员撤销与已开始写事务以提交点定义先后，已经提交的合法保存不倒回。
- idle/absolute期限、登录速率、上传／草稿／编译配额是集中版本化的运维配置，必须有非零有限值并在适配器测试用固定时钟证明；不得无限制或用这些配置增加游戏机制阈值。具体容量按既有环境测量冻结，不在未测时承诺并发量／SLA。
- 头像只收实际可解码的PNG/JPEG静态图，拒绝SVG、HTML、动画、多态内容及远程URL抓取；先检查字节／尺寸／像素数量上限，再隔离解码、按裁剪参数重编码128×128规范PNG，丢弃EXIF等元信息。客户端预览不替代服务端处理。
- 上传先进入当前游戏私有暂存，扫描／解码失败不能引用；用户文件名不作存储路径。资源ID和hash不构成读取权限；草稿及试运行资源每次查授权，`Cache-Control: no-store`，不进公共CDN或Service Worker缓存。
- 统一文本输出使用textContent／受控Canvas绘字，不拼HTML，CSP不允许作者脚本；文件路径防穿越。发布可分发的正式图像资源只来自已校验manifest。
- 审计记录操作者、对象ID、操作、前后修订、结果及requestId；不录密码／token／个人资料正文／完整草稿。账户可选姓名邮箱电话备注仅本人和用户管理权限可见，不进入匿名API或公告。

### 6.1 独立真实账户服务切片（用户m6873/m6911授权）

[Worker/SQLite账户入口](editor-backend-auth.md)独立server配置、HTTPS8787本机启动/线上专域443，原玩家静态配置不动。真实密码KDF、cookie/Origin/CSRF/强制改密/epoch撤销、账户CAS与密封幂等/重启/限速/期限、API七组与fresh浏览器六组有证；不是mock或旧无认证harness。入口有界POST捕获再DO RPC，提交仍同SQLite事务复查。此切片只账户域，草稿/私有资源/Trial/编译任务/发布/运维/玩家协议仍按本合同开放，不把域名或端口当权限隔离。

### 6.2 同一SQLite游戏元数据基础切片

[GameMetadataStore](editor-backend-metadata.md)在账户同DO事务域建立真正principal作者绑定/名称占用/十进制修订/不可变快照引用/永久提交收据/CAS与回滚，自己的只读列表及管理员无私有源的管理摘要已接。八组实际HTTPS/SQLite及当前账户/浏览器重跑有证，但快照是工程引用夹具，生产不可变对象与源核验端口未接仍503，创建/草稿写/编译/发布API未开。不能以自报有效JSON或引用存在放行，也不据此关闭第5/6节完整能力。

### 6.3 真实R2不可变对象基础切片

[ImmutableBlobStore](editor-backend-blobs.md)已接独立本机R2 binding/持久目录、实际条件创建与写后完整长度/SHA读回、真实作者及所有await/流段后epoch复查；九组存储门及当前metadata/账户/fresh浏览器重跑有证。云bucket只是配置声明未创建，生产snapshot verifier/源依赖/草稿写仍关闭，delete503直至真正栅栏/引用清理就绪；不冒源安全、上传图片、完整发布或备份清理完成。

### 6.4 内部分块源结构与本机传输（E-01-BACKEND-SNAPSHOT-1）

[完整43MB源结构端口](editor-backend-snapshots.md)规范UTF8分块/增量parser、实际索引和所有chunks读/hash、物理root与逻辑source摘要分离、真主体/metadata/共同draft门及精确opaque依赖仅fixture有证；PNG/共享库/runtime/原始来源与compatibility-delta未闭合，生产写/编译/发布仍关闭。真实新NodeHTTPS8787→own WorkerHTTP边界完整八组、内部binding七组、91/38codec及四回归重跑；原生本机workerdTLS中断全部保，根因未认证，不patchSDK或降线上TLS。不能把source hash/结构通过当可玩、初始化或发布许可。

### 6.5 固定副本内容差异切片（E-01-BACKEND-PROVENANCE-1）

[固定实际来源与窄写集](editor-backend-provenance.md)pin当前joint tuple与真实manifest/41Web输入、共同复制/来源ID；内部冻结品牌内容cap仅允许metadata及既有公开势力四资源九byte同步，其余原槽/unknown/角色/计数/helper/sourceRecords精确保。20章JSON/78拒/getter0及真实Worker-R2六组/epoch与重启负控有证；signed24/u16不授任意异常初值可玩权。没有生产来源注册、作者上传/草稿/复制事务，WeakMap内容cap不是principal/持久授权，构造端口必须来自服务代码，不从自报有效DTO创建。

### 6.6 持久任务基础（E-01-BACKEND-JOBS-1）

[同事务域Job](editor-backend-jobs.md)固定已保存source及compiler/profile/pipeline，永久幂等、持久租约hash/代次、stage输出清单与digest/CAS/epoch、失败/恢复/重试；九组真SQLite/R2/NodeHTTPS测试只用工程marker和opaque数据，未装公共执行器/编译/发布。ready表示阶段描述，不能当Validation/Trial/Release。丢临时cap不恢复DTO权限，过期新claim受SQL代次栅栏；升级不拼旧阶段，物理删除/staging引用与源/图片/runtime验收仍独立。

### 6.7 持久固定来源byte目录（E-01-BACKEND-SOURCE-CATALOG-1）

[固定来源SQL/R2目录](editor-backend-source-catalog.md)实际两代码manifest锚/品牌41角色57MB，有限分块/规范索引/全对象和whole角色SHA，登记与永久actor/key收据同SQL/提交epoch复查；重启从固定策略＋持久记录＋实际R2重读新捕获，不从DTO复活旧品牌。Worker内使用未改共同installed-source/entity/copy loader、20章2540记录，八组有证。只管理员完整来源读取、无作者任意上传；尚未装生产或绑定目标Game/name/private-ref复制提交，不是头像/PNG、运行初始化/Q69、编译/Trial/发布/SLA证书。

### 6.8 管理员内部完整复制事务（E-01-BACKEND-ADMIN-COPY-1）

[真实完整副本落库](editor-backend-admin-copy.md)从已登记41R2固定角色核字节，经共同loader/full copy/独立来源记录和差异＋草稿结构门，baseline与候选完整规范分块写/读回。持久全局key/目标/名字预约，实际SQL租约代次恢复私有allocation而非DTO重构；最终Game/snapshot/origin/baseline/refs/永久结果在同一metadata transaction提交，trigger失败全回滚，stage意图保持追踪。两实际完整20章/2540来源副本、重启及8组87请求与七相关回归有证；新会话只能取消自己的旧pending，不恢复旧key/lease。未装公开复制UI/API、共同运行/PNG/Q69/编译/发布，staging记账不代physicalGC/删除备份/SLA，原玩家不变。

### 6.9 真实管理员复制入口（E-01-BACKEND-COPY-ENTRY-1）

[RootWorker/启动器/管理员最小UI](editor-backend-copy-entry.md)已装实际SQL/R2/catalog/完整复制：操作员显式stage固定41角色不赋权，真实管理员强制改密/Origin/CSRF登记，永久key预约/状态/If-Match运行或取消，实际pending和已提交副本跨启动器重启。source/auth/copy key namespace提交复查；command表仅绑定请求，不冒执行收据；已终态不变更查询与写CAS分别标注。300秒租约为本机有界操作参数，非Cloudflare预算/SLA。旧Node TLS未发HTTP预连接阻塞close经独立负控定位；只销毁自有入口连接、共用关闭Promise，不保障在途HTTP回应，未知失败不补原因。entry-r11/r12六组各40请求/fresh浏览器与七相关回归、browser-r15有证，395旧输入保持；截图旧覆盖限制明示、新产物wx。未装完整工作台/私有draft编辑/共同编译/PNG/Q69/Trial/发布/清理，不影响玩家、未部署。

### 6.10 私有固定副本草稿（E-01-BACKEND-PRIVATE-DRAFT-1）

[真实Root精确读取／限定保存](editor-backend-private-draft.md)复用SQL复制origin及实际不可变baseline/R2，固定服务definition而非两表自报同值；owner/epoch每await与提交复查。请求只收元数据与共同九byte四资源补丁，完整候选按baseline限定差异和结构门再核验；实际对象意图/条件写/读回及最终CAS/name/snapshot/refs/永久操作同SQL，no-op和失败保modifiedAt、旧修订不latest回退。draft-r3九组及受控真实读等待epoch三组、当前七回归和fresh入口有证；r2瞬时pending观察器错误不靠重跑掩盖，以实际SQL状态触发器证明转换，独立HTTP没有调度保证。表示安全不授可玩UI/运行/Trial/Release，该API轮未装表单；后继最小元数据表单见下节。重复全源读解析不称云SLA，staging不冒物理清理，玩家不变。

### 6.11 实际私有资料表单（E-01-BACKEND-DRAFT-UI-1，限定）

[真实资料表单](editor-backend-draft-ui.md)复用上述owner／epoch／固定源／精确修订服务；客户端状态／DOM／SessionStorage不赋权。只编辑名称／简介，四资源只读。dirty原生确认、beforeunload取消、条件保存失败保原输入、原body与key捕获／未知回应只查询、412不latest回退。reload只存actor/game/revision/key，原body丢失不重造；404不证明在途结束，用户明确实际改密撤全旧epoch后才允许确认放弃并载入明确修订，不冒成功／失败／SQL取消，不自动改密。该本页成功回调不是可持久恢复授权。

ui-r3八真实Root/SQL/R2/fresh Chromium流程、当前真实账户六组与私有API九／受控epoch三组通过；没有改API/存储/原生合同或玩家部署。完整工作台／可玩范围／compiler与图像／Trial／发布仍缺，不关闭E-01。

### 6.12 内部共同资料执行器（E-01-BACKEND-COMPILE-DATA-1，限定）

[实际资料编译](editor-backend-data-compile.md)通过真实owner／epoch／固定origin与baseline／准确不可变快照，调用未改共同`compileGameSource`，两阶段Job实际写／核29私有R2产物。恢复须重读／重编／对拍旧checkpoint和实际bytes；ready再次核完整SQL pipeline及末端状态。临时计算Map不是授权，旧epoch不能复活Job／key。损坏／stale／改密await与当前四focused回归有证。

仅完整固定副本all scope、data-only；报告明确缺image／pixel-PNG／完整runtime依赖与admission，不签valid／Trial／Release。Root／前端／玩家未改，公开编译仍404；300秒租约／4MiB块非云执行SLA。完整编译与公共入口仍是后继工作，不关闭E-01／E-06或Q69。

### 6.13 独立无DOM PNG I/O（E-01-BACKEND-PNG-IO-1，限定）

[适配器](editor-backend-png-io.md)已实测现兼容日期／flags的Node与workerd同步zlib／消费长度。原始样本PNG8解码／RGB-RGBA编码，无DOM／Canvas／第三方运行时库；完整CRC／边界／滤波／透明／解压预算负控、固定四atlas／两mini及新编码独立Pillow对拍有证。Pillow只测试，不参与生产。

尚未装到真实source／profile／持久Job，不能以图片SHA／格式成功当认证或运行资格。≤4Mi pixels显式拒整图回退；unsupported交错／位深／色彩管理／动画拒，完整资源／像素编译／Q69／runtime仍缺。Root／375玩家与现有417输入不改，不关闭E-01／E-06。

### 6.14 固定副本受权图像（E-01-BACKEND-COPY-IMAGES-1，限定）

[内存规划器](editor-backend-copy-images.md)只给真实管理员本人的固定副本准确已保存修订；重新验证私有全源／baseline/profile、SQL origin与品牌policy、目录全部41角色真实R2。共同compiler/mini算法/尺寸/seed1与有界PNG生成四256atlas及两mini，六新PNG独立像素对拍。owner/epoch与来源前后复查，临时plan只绑定原token/实例，JSON／新会话／重启不恢复品牌；不把输出hash当权限。

images-r2八组48真实请求、saved2/requested1／SQL和R2损坏／原生来源get await改密／重启均有证。报告bounded-images-only，完整回退／依赖／runtime／持久image Job仍缺；Root／Job／375玩家及420旧输入全保。没有公开编译、RuntimeManifest／valid／Trial／Release或云SLA，不关闭E-01/E-06/Q69。

### 6.15 固定六图持久Job（E-01-BACKEND-IMAGE-JOBS-1，限定）

[实际图像产物Job](editor-backend-image-jobs.md)复用原样CompileJobs／FixedCopyImages与同SQL/R2；准确源/profile/catalog全读取后生产报告及六PNG，私有条件写/读回/intent/verified/checkpoint/前后owner-epoch-lease-CAS门。重启后持久lease过期才新claim并重算核所有旧产物；ready也复核SQL pipeline和实际bytes，不按DTO恢复品牌或按SHA自报授信。

jobs-r1八组53实际请求／七产物、请求1而当前2、SQL过期/真实重启、ready记录和原生R2损坏/epoch await有证；六图byte与既有独立Pillow封存图完全同。423旧输入及375玩家不改，新两源425，公共Root/UI未接。阶段ready、image-stage-outputs-only报告不签runtime/Trial/Release；完整回退/依赖/Q69与公共compiler仍缺，不关闭E-01/E-06或承诺云SLA。

### 6.16 真实认证阶段入口（E-01-BACKEND-STAGE-API-1，限定）

[真实Root阶段API](editor-backend-stage-api.md)安装原样data／images执行器：明确本人游戏与已保存修订、scope all，永久key提交／查询／If-Match显式运行或重试。Origin／CSRF／会话／epoch与SQL pipeline／owner／snapshot均真实复查；图片仍管理员本人。命令表只绑定请求条件，不冒成功收据，未知回应先查Job。

私有产物只从ready Job完整重建准确源／核所有checkpoint和R2 bytes后读取，再核当前Job；不按客户端SHA／缓存ready签发。api-r3七组42请求及最终同SHA四focused有证；重复enqueue旧摘要漏pipeline经实际SQL负控202定位，新入口query补门后原409通过。完整compile／Trial／publish仍关闭，不提供RuntimeManifest／Valid／Q69许可，不改玩家/UI或承诺云SLA。

### 6.17 阶段任务操作界面（E-01-BACKEND-STAGE-UI-1，限定）

[后台阶段界面](editor-backend-stage-ui.md)从实际私有已读修订取得只读上下文，dirty明确确认但不保存；每用途只记完整固定预约／Job／命令条件关联，未知回应reload不自动POST或新键，明确原键确认／GET状态／CAS推进。关联与ready均不赋运行权限，身份代次拒迟到，实际改密才撤旧会话。

产物只经真实服务完整重建／所有checkpoint与R2核验后取数，再按描述有界读完整SHA及响应SHA头，才创建owned blob下载。ui-r2八真实Root／fresh Chromium流程与两下载、API／draft／epoch三当前focused有证；375玩家／原引擎及旧服务不改。完整工作台、回退／消费者／Q69、RuntimeManifest／Trial／发布仍缺，不承诺云SLA或关闭完整E-01/E-06。

### 6.18 固定可用库byte目录（E-01-BACKEND-AVAILABLE-LIBRARY-1，限定）

[独立可用库](editor-backend-available-library.md)保持原398资源／许可／20个G127/255未闭合引用byte，当前捕获仅更新两consumer指纹；400角色代码SHA锚／临时品牌／独立registry，复用原SQL/R2全对象核验、永久key和epoch守卫。Root真实管理员明确登记，运维stage不等批准，不能用库替代41角色复制源或Game作者权。

policy十负控与默认Root五组26请求／真实重启改密，以及原目录61／阶段API42当前回归有证。库仍STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE，无asset读取、全部loader/CSS/audio或RuntimeManifest／Trial／发布许可；375玩家不改，运维预算非云SLA，完整第4/7节仍缺。

### 6.19 标准packed索引PNG（E-01-BACKEND-INDEXED-PNG-1，限定）

[实际缺口与支持](editor-backend-indexed-png.md)：固定库376 PNG中168为indexed4，旧Node实测拒，非损坏／超预算。PNG2支持非交错indexed1/2/4的byte stride／五filter／高位优先样本与palette位深门，原8bit、CRC／deflate／透明及4Mi pixels等门保持；灰度低位深／交错／色彩管理／16bit仍拒。planner2和派生Job新pipeline隔离旧tuple，不迁移／重贴旧任务或source。394正例独立Pillow对Node/workerd及18新拒、原PNG回归、持久Job／默认Root有证；不代授权、fullfallback／audio／G127／全部依赖／Q69，原引擎不改。

### 6.20 精确保存修订的私有固定库（E-01-BACKEND-PRIVATE-LIBRARY-ASSETS-1，限定）

[具体维护源](editor-backend-library-assets.md)：固定398角色仅经实际管理员本人、明确snapshot、完整source/baseline/profile及全部400 R2角色读取；服务固定assetId而非客户端path/hash。每次实际SQL/epoch/owner/source及catalog复查，Root在service await返回后再assert，才构造清单或attachment。旧1不跟current2，库mode与admission明确非runtime/Trial/Release，未知255保留。七组55主请求及当前API42／draft50、独立native20有证；真实password handler callback撤旧epoch不是并发外部HTTP，失败observer502细因仍未知。重复完整读取不保证云SLA；普通模板权限、全部消费/Q69与完整工程目标仍缺。

### 6.21 固定整图逐行基础（E-01-BACKEND-FALLBACK-ROWS-1，限定）

[详细支持域](editor-backend-fallback-rows.md)：捕获已编译固定plane／不透明atlas，纯逐行投影和标准RGBA8 stream PNG I/O；原flags实际Node streams/zlib探针、四季／显式改tile／奇数宽12产物独立Pillow及Node/workerd预算错误关闭有证。全部437旧源含375玩家保持，原decoder4Mi pixels／Root／六图Job不改；16MiB压缩预算不是整个Worker内存/CPU SLA，生成器未赋来源／租约／runtime许可，持久接线及完整Q69仍需后继验证。

### 6.22 单季整图持久任务（E-01-BACKEND-FALLBACK-JOBS-1，限定）

[唯一详细源](editor-backend-fallback-jobs.md)：原六图准确source前缀私有共用，新端口逐行await真实执行守卫及SQL/epoch/snapshot/catalog复查；固定单季／I/O修订区分pipeline，report与一PNG各≤4MiB、真实intent/条件R2读回/写返回复查/verified/checkpoint。重启和ready重建明确source及全部旧bytes，不跟latest或重贴旧Job。主65／原六图56／独立写返回21实际HTTPS、四PNG精确bytes复用旧独立Pillow像素证据，row128 lease和真实password callback／故障显式retry有证；443声明440旧保护。Root/UI/runtime/全资源/Q69未接，预算非云SLA，intent非物理GC。

### 6.23 固定季节认证入口（E-01-BACKEND-FALLBACK-API-1，限定）

[唯一详细源](editor-backend-fallback-api.md)：Root将四固定fallback purpose接原独立单季服务，原data/images DTO及接口不变。精确saved revision／永久key／quoted CAS、actual admin-owner／Origin-CSRF／epoch及pipeline均真实；ready附件先原执行器重建全源和核所有checkpoint/R2，再于Root末次await后查实际token／Job／snapshot并核响应bytes全SHA。临时回应关联不赋持久授权，不把命令绑定当成功收据。

最终主七组78及当前data/images七组42 HTTPS通过，四独立季节附件精确bytes同此前独立Pillow封存；native末次snapshot409／bytes503／实际password handler200后Root401有证。r1终态failed夹具错、r2不同DO ingress401分别经native协议／同真实session探针定位，只修夹具且保失败，不改产品期待或预算。444声明441旧含375保护；该API轮固定季节UI／统一运行manifest／全部消费者／Q69与Trial仍缺，不承诺云SLA。

### 6.24 固定季节操作界面（E-01-BACKEND-FALLBACK-UI-1，限定）

[固定季节界面](editor-backend-fallback-ui.md)扩展既有stage模块，六固定purpose分关联，普通author仅data；旧二项关联逐字段核验并保ID/key后加四空项，不重贴Job版本。沿用实际saved context、dirty显式确认、原key/完整固定body、未知run先GET、CAS与有界全SHA下载；reload不自动POST、执行或下载，单季ready不是四季／RuntimeManifest／Trial／发布。

新八组真实默认Root／fresh Chromium及原data/images当前八组通过，spring/winter三下载与原两下载，主console／外网及受测IDB0。r1错误报告选择器与event拒绝观察器已定位，只修测试且保失败；两旧UI／新验证445声明442旧保护含375，Root／服务／引擎不改。仍缺完整编辑和消费者/运行准入，不保证云SLA或关闭完整goal。

### 6.25 精确修订的只读素材入口（E-01-BACKEND-LIBRARY-UI-1，限定）

[只读库维护源](editor-backend-library-ui.md)在既有认证库API上接管理员本人固定副本的398／20目录、local筛选及opaque下载，准确saved context与dirty确认；current2不热换已读1，reload不恢复目录或自动请求。上下文／实际identity变化清本模块目录及ownedURL，await后代次／actor／captured revision复查；DTO／label／URL不赋权限或运行资格。

固定最大FLAC11,196,244B仅新libraryBinary16MiB分支，旧stage4MiB及DTO保持；完整bytes长度／SHA、响应SHA／保存修订／source SHA／library root／非运行admission和固定attachment核验后才下载。全部文本textContent、不预览或执行图片／媒体／JSON／字体、不写资源或补255。真实Root fresh profile最终十组／三库附件与一当前data-stage兼容下载、七坏回应拒及改密／author／IDB0／外网0有证；另标synthetic pagehide晚到隔离，不冒实际BFCache。r1旧源保、warning修if/else并补控制／目录截图后r2完整重验；449声明／444旧含375保护。预算不为整堆／GC／云SLA，普通模板权限、全消费者／Q69／RuntimeManifest／Trial／发布及工程目标仍缺。

### 6.26 固定库运维登记界面（E-01-BACKEND-LIBRARY-REGISTER-UI-1，限定）

[维护源](editor-backend-library-register-ui.md)接既有admin GET／install，以完整固定definition/root作UI关联而非权限，POST仅原永久key与空body；丢回应用明确GET核事实后明确同key重放，不以registered事实推原键成功／运行资格。reload不自动请求，坏关联／actor版本或描述变化禁止重放／新键，明确放弃仅本机关联且须重新GET；服务principal/epoch/实际400R2／永久收据仍权威。unknown/broken native beforeunload与站内leave、generation拒迟到及shared busy后本区render，不改业务API/事务/玩家。

最终fresh Root十组／13 Node／12 status GET／4 POST、真实staging与再次重启、丢200／原键、恶意描述／mode、实际改密旧key409-cookie401与author/IDB0有证；synthetic pagehide另标。当前私有库／data-stage原十流程／4附件兼容；451声明446旧含375保。两失败经dialog与storage-memory controlled probes定位，r3完整原预算验证，不拼partial。运维状态非媒体当前全验，普通模板／完整源写／RuntimeManifest／Trial／发布/删除备份及goal仍缺。

## 7. 草稿试运行状态机

本地Q67[游戏列表入口](editor-list-trial.md)已接选章及用户手势新窗口，捕获已保存修订、检查compile响应game/revision/单章后走原Trial loader；阻挡不compile、冲突不换latest、未保存资料确认/保留、失败只关本次等待窗口。实际五focused含两个App/不同修订与章/旧stateRAMRNG不变及IDB0；73/167为更新库存而非新全量成绩。工作台、服务与引擎原样，真正作者认证/Q69闭包/Q70/71实际App接线仍缺。

后续[连接能力核心/注入monitor](editor-trial-connection.md)已独立实现精确绑定/逻辑单飞/代次/不可逆终态及fake5s/10s、先暂停再abort；随后独立窗口events adapter与fresh DOM原生offline/online、刷新空新Realm已测；visibility/BFCache/非persisted终止仍synthetic，原生关闭回调观测未闭合。随后opt-in继承Clock与真实BattleView/VM/Session计时边界已测82检查/8负控、hold并集/代次无债务/启动50帧续段与异常前缀；旧引擎源不改。没有真实Trial的认证/HTTP/双规则边界/全部输入入口/认证终态触发的App处置安装，不关闭本节或Q70/Q71；未来保存hold必须分开nonTrialHold与网络有效hold。

本地E-05切片仅实现本节准确快照、新窗口/被拦重试及无正式存档能力：manifest新增从复制源核验并捕获的visualAssets八季节图引用，native四资源/两PNG身份不改；共享App注入独立content/world与readonly rejecting repository，直接入口和菜单均禁存读，结束清空scenario/clock/RNG且同窗重开拒绝。实测绑定chapterId。未认证服务端Trial对象/会话epoch、下面的网络/撤销生命周期或Q69单章依赖闭包；详见[交付](editor-local-app-trial.md)，不据本地实现改写完整产品合同。随后[Trial主动退出处置](editor-trial-discard.md)已在本地App接撤销战术开场代次/清原生战术队列/丢owned Session和回调、不结算不恢复hold，实际pending/active夹具与新71门/164声明源通过；正常finish不变。真实认证失效及网络安装仍未完成。

```text
准备快照／校验 → 待打开 → 装配 → 运行
                               ↔ 断网暂停（窗口内存保留）
                               → 会话失效／快照已删除／退出 → 结束
```

- 用户点击时同步打开同源受控等待页并取得窗口句柄，立即在可访问时将新窗口opener置空；原页持有的句柄只用于完成后导航到固定Trial入口，随后释放。不能使用带noopener而返回null的调用结果判断是否被拦。若使用消息，必须额外核Origin、窗口引用和不可预测nonce。弹窗被拦／句柄不可用则原页显示“開啟試運行視窗”明确点击重试，不修改浏览器配置、不顶替编辑页。失败等待页仅显示繁体诊断，不启动空数据游戏。
- `Trial`固定`ownerId/sessionId/authEpoch/gameId/draftRevision/snapshotDigest/chapterId/manifestDigest`；后续保存不修改它。所有私有资源都以此记录授权，不仅保护启动URL。
- 运行适配端注入**无正式存档能力**的接口；进入路径没有load/save/import玩家档案操作，调用即拒绝。只在内存持有对局和暂停进度，不用另一个正式IDB库“暂存”。用spy验证连IndexedDB.open都不调用；窗口不同本身不算通过。
- 连接探测采用单飞请求：建议5秒发起、10秒超时；首次明确请求失败即申请独立trial-network暂停能力，在下一个规则步前禁止战略和战术Session继续推进（不是仅调用现有战略clock.hold），保留已提交前缀，不能按失败时间倒滚规则。`offline`事件及页面恢复可提前触发探测，`online`事件本身不释放hold。
- 恢复必须同时确认账户／会话epoch、Trial及固定manifest仍有效；确认后只释放自己的hold，不清除菜单／战术／其它hold，不补后台规则帧。与旧请求竞争用请求代次隔离。
- 401或明确会话撤销：终止对局、清除窗口进度并提示重新登录；重登录只能新建Trial。网络503／超时不是401，保持暂停不误销毁进度。关闭编辑器标签不撤销会话；主动退出才撤销。
- 试运行快照在Trial有效期间固定保留，不因新草稿覆盖或短暂断网删除。会话到期／撤销、显式结束或游戏删除后终止Trial；无客户端关闭回调也按服务端会话绝对期限处理孤儿，不能依赖无限保活。终止后清理仅属于Trial的派生对象，发布版／当前草稿／其它Trial引用不受影响。
- 后台冻结不能保证瞬时知道服务器禁用；可见性恢复后在确认前不推进。该时序保障与“已缓存私有内容不能远程擦除”的边界必须如实说明，不宣称DRM。

## 8. 玩家目录、正式对局与本地存档

### 8.1 最新目录与固定对局

registry及状态读取`no-store`，不使用`stale-while-revalidate`把已下架内容当最新；资产不可变但通过游戏状态门读取。刷新页面／回到标题／浏览器返回恢复时重新取得目录；自建目录不可用则禁新局／读档并重试，内置使用随软件提供且验证就绪的manifest，不把内置常驻误变为依赖远端成功。

准入请求在服务端一次核对上架与currentRelease；成功即锁定此局修订（包含随后异步装配阶段）。发布发生在准入之后不令已开始的装配热换新版；发生在准入之前则返回冲突重新选择。凭据签名覆盖gameId／releaseId／manifestDigest及用途，只能取该修订，不授予草稿或任意历史开局权；下架可续取已获准资源，但不能签发新准入。可以无玩家账户、无每局保活表地验证凭据；不承诺阻止玩家重新使用已下载内容。内置在目录服务不可用时按随软件的受信manifest本地准入，不等待远端凭据，这只是取数边界，不另建加载引擎。

对局可低频读取状态、在保存界面进入及资源失败时复查：新版只警告，不强退；下架不打断；明确GAME_DELETED取得确认后回初始加载页。普通网络失败不推断删除。状态更新不运行游戏规则或改RNG；正式对局不采用私有Trial的断网认证暂停政策。

### 8.2 多游戏存档合同

继续使用玩家同源IndexedDB，建议在现有`saves` store内使用分离键：`game:<gameId>:catalog-v3`和`game:<gameId>:record:<slot>`，避免不必要的整库升级。gameId受格式验证，不可通过分隔符碰撞别的命名空间。每个正文携带`recordId/writeRevision/gameId/releaseId/releaseOrdinal/chapterId/manifestDigest`及现行完整snapshot；目录摘要同一事务提交，事务完成前不报成功。

- 仓储构造绑定gameId，读／写／覆盖／导入／JSON备份均核对同一身份；保存槽号只在该游戏内有意义。不同游戏可同时有slot0，不能靠标题当前选择给无身份档补gameId。
- 原`catalog-v2/record:<slot>/slots`只可在明确识别原内置内容身份后做隔离、非破坏性迁移；未知或缺版本存档保留为不可用，不能伪贴1.0、静默恢复或批量删除。旧键不自动清空。Task2身份迁移另见任务二差异表。
- 用户从标题进入所选游戏档目录；不相容行hover/hit-test/click均不进入恢复，另给“不可用存檔管理”操作触发明确版本不符说明。取消不删也不载入；不自动倒计时。
- 判定版本不符须确认同一gameId、有效可识别的旧正式release及服务器最新版本；缺字段、坏结构、未识别发布版、网络错误、下架／删除均不能走此清理。版本相同仍走现有完整能力／JSON／detached恢复门。
- 删除提示捕获`(gameId,slot,recordId,writeRevision,bodyDigest,savedReleaseId,observedCurrentReleaseId)`；确认时重新检查目录可用和版本条件，随后同一IDB读写事务compare-and-delete正文及摘要。槽被其它窗口替换则中止并重读，不能删新档。
- 远端目录和本地IDB不能组成跨网络事务：网络核验先完成，IDB事务内只做本地比较。成功发布版本单调、无回滚、gameId不复用，因此已确认的旧版不会被后续发布重新变成最新版；若复查信息不完整一律不删。删除事务失败保留原记录并报错。
- 恢复准入固定正式修订后仍先detached验证、等资源ready再安装；期间槽被改写不改变已捕获的本次快照，但后续覆盖该槽必须检测writeRevision冲突。既有禁存守卫、RNG／原生表／能力内存全部保持，不以版本检查代替。

限定底层实现见[opt-in游戏仓储](editor-game-save-store.md)：v1/saves内编码game键、格式3正文/目录、外部SHA＋事务内精确CAS、单调writeRevision/ABA与两页真实IDB原生abort已测。必须显式注入db名/工厂；原v2/App/Trial不导入它。元数据语法不是正式版本认证，compareDelete仅本地primitive；本节最新/已识别版本/左确认/取消、完整snapshot/共同恢复与导入备份仍待接线，没有授权清理原存档。后续[真实快照兼容验证](editor-game-save-snapshot.md)已补当前20章snapshotState/严格仓储/公共detached、native RAM及RNG continuation和80坏能力/索引拒载保档；仅fresh0tick切片，不代完整运行态/正式版本确认或App安装。

后续[游戏绑定备份输入](editor-game-save-exchange.md)只opt-in完整v3/显式预期tuple/文件SHA与原规则profile及公共detached门；decode不写库，显式另存由仓储生成自己的ID/counter，旧format1/UI/App不改。当前20章/148拒、八focused有证，不证明正式release/latest权限或完成备份UI，不能绕本节版本/删档政策。

后续[运行入口快照切片](editor-game-save-runtime.md)20章直接aiTick八次→真实快照/opt-in仓储与备份→cold common，再原/cold各八次续行比较完整恢复语义/sidecar/RNG；20越界失败hold禁存/已存正文保。公共sidecar物化不等raw重快照byte同。没有改规则或新局初始化，不是实际App/Clock/hour/month/活动军团/消息返回/全战役或本节正式版本政策认证，八focused不是80全轮。

### 8.3 发布公告

公告事务采用唯一`(gameId,releaseId)`；name/version/creatorAccount及publishedAt为生成时快照，firstOnlineAt首次可玩时产生。排序键`(firstOnlineAt DESC, announcementId DESC)`；游标包含这个键及registryRevision。每页建议30条，当前上架过滤始终重新执行；期间目录修订变更返回重新取第一页，客户端按announcementId去重，不能翻页漏出已下架公告。

重新上架旧版恢复原公告及日期，不置顶；下架期间未公开的中间发布不补公告。物理删除清理该游戏公告内容。空列表显示“暫無發布資訊”；单独失败显示“通知暫不可用”及重试，不阻断成功取得的游戏目录。标题刷新同时刷新最新一条，打开弹窗再取历史；右键只退弹窗，保留原游戏选择，不增加关闭按钮／自动消失／点击直接开局。

## 9. 分阶段验收合同

所有项目均为**待执行**。下表是实现出口而非本轮通过记录；使用新profile、mock或纯内存，禁止真实SAVE与实际用户档案。Task2先于编辑器阶段，详细迁移用例只在任务二维护。

| 编号／阶段 | 必须取得的正向与反向证据 |
| --- | --- |
| D-01 设计审查 | Q1–Q73及更正可追踪；产品／工程／原证分离，字段／接口单一维护源，全部已知门槛有来源与解除条件 |
| M-00..M-03 当前游戏 | 按任务二执行；自动小地图、统一地图源、同一编译／加载及原基准差异逐项核对，用户视觉验收另列 |
| E-01 权限及持久化 | 两创作者交叉ID读取／写入／上传／试运行均拒；管理员也不能写内置或他人草稿；禁用／重置中途写提交拒绝；软件重新部署模拟不丢草稿与发布数据 |
| E-02 完整副本闭环 | 管理员复制全部20章；副本地图编辑→保存→校验→新窗口试运行；原件hash前后不变，旧来源更新不串副本，实体／资源身份不串 |
| E-03 地图工作区 | 四层吸附、显示锁定、防误选、同层调序、已知／未知下层恢复、断路提示、无据点交叉拒绝、水陆手选不被下层改写；未支持recipe有精确诊断 |
| E-04 人物／章节 | 继承与覆盖、角色替换／解散／删除引用、所有势力可选、无开局軍团；不同章坏数据不阻断独立完整章试运行，却阻断全量发布 |
| E-05 Trial隔离 | 无任何正式IDB调用；同快照晚资源、新草稿、弹窗拦截；断网暂停／有效重连续旧局／401终止／新登录不复活／仅关闭编辑页不中断 |
| E-06 发布竞态 | 保存冲突、本地编辑保留、双发布CAS、发布与下架／禁用／删除竞态、每一阶段故障注入、响应丢失重试只一个版本、1.9→1.10、公告一次提交 |
| E-07 多游戏入口 | 无代码变更／Git／重启／部署，数据发布上架后普通刷新可见；目录失败时自建禁入、内置仍可用；下架旧局续取／新版旧局警告／明确删除确认退出 |
| E-08 存档 | 同slot跨游戏隔离、旧版单档确认删除／取消、网络与坏档不删除、并发替槽compare-delete、同版坏能力拒绝、JSON恢复及事务失败；无真实档访问 |
| E-09 安全与删除 | CSRF／Origin含端口、会话固定、IDOR、XSS、路径穿越、图片炸弹／伪格式、配额与限速；独占／共享资源引用、物理删除重试、备份恢复不复活删除内容 |
| E-10 完整发布 | 新游戏初始化门槛解除后完成中立模板→人物→章节→试运行→发布→上架→匿名新局／保存恢复；不能用完整原章副本代替空白新游戏验收 |
| E-11 容量专项 | 按G-CAP审计并取证后才启用扩边／变节点数；源模型能存更大尺寸、纯渲染能画更大图均不算通过 |

每阶段报告列代码／资料SHA、profile与编译器修订、命令白名单、输入源、预期来源、正负结果、未覆盖项。规则更动按项目完整安全回归，不拼接历史成绩。共享算法差分不能只以两个Web实现互相证明原机制。

## 10. 原证与实施前置门槛登记

### 10.1 本轮核对到的事实

- 当前代码：[内容编译器](../tools/content_pipeline.py)、[解析器](../tools/parse_sinario.py)、[目录](../web/src/content/catalog.js)、[世界定义](../web/src/content/worlddefinition.js)、[世界资源](../web/src/game/worldresources.js)、[装配](../web/src/game/scenarioassembly.js)、[战术投影](../web/src/game/battle/battleprojection.js)、[IDB后端](../web/src/core/indexeddbsavebackend.js)。这些证明改造接缝，不证明原规则。
- 原证详细源：[实体字段](re-notes-entity-fields.md)、[自定义资料](re-notes-custom-data.md)、[原生道路](re-notes-march-pathfinding.md)、[锚点](re-notes-map-marker-anchor.md)。沿用其中可复核指令／资源索引，不把历史“未接线”说明当当前代码状态。
- 本轮只读复核：`Dragon/KI.EXE`长67099，SHA256 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`；`原版/SINARIO.DAT`长88832，SHA256 `4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87`。按VA+0x200读取：55D0的`b902008a07d0e002e043e2f788641f`与全byte能力参与派生写回相符；6851的`8a4422988bd08b44201f`与资金有符号显示窗口相符；8CD5的`8b1e520d33f6bf4052e8ab56`核对5240h状态块读取参数。只是指定窗口字节复核，未执行原程序。
- 官方四章`22C0..42BF`军团区和`52C0..56BF`事件区逐字节均零；G127完整32B均相同且并非全零。该复核不推广到任意自建章的未知记录初始化。没有读取任何SAVE文件。
- Web源道路当前确为v2、192节点、254边、5526点；头像目录150张PNG头均128×128，`GameBar._drawLegionDetailPanel`按128×128取样、64×64显示，支持方形裁剪方案。原实体／原证详细结论仍由上述笔记维护，本轮未产生新机制公式。
- `source_chapter`目前只把城市／势力raw放入compatibility，人物JSON未保留全部原32B。完整人物创作源不能从该JSON臆造未知字节，需在受控导入阶段从明确非存档原资料保留完整记录；地图迁移不借此重跑旧有损解析覆盖章节。

### 10.2 不能靠设计文档宣称关闭的门

| 门 | 已知缺口／影响 | 解除所需证据及负责阶段 |
| --- | --- | --- |
| G-MAP 分层到规则 | 现布局同时参与绘制与规则；任意叠放、作者水陆类型、城型变化后的视觉映射未闭合。用户“任意下层可放”不能改写成地形禁止 | M0列原256图块／组件分类、覆盖与未知底层清单；逐recipe核原输入输出／组合和运行写回；支持域双源编译对照。未闭合组合只存草稿，不虚称可运行 |
| G-ROAD 构图与任意拓扑 | 原图证书不自动覆盖任意新路、队列耗尽／特殊seed；旧roadCost／offset不能原样复制给新拓扑 | 复核E4CE/E57F/E717/E81C/E961到491B及接敌消费者；受控改图、原有序tag／flags／成本对拍、明确拒绝域。地图道路编辑放行前完成 |
| G-INIT 新章节与实体 | 历史日期截断已按[日期解码](editor-date-import.md)专项纠正；后继[能力全byte解码](editor-ability-import.md)只修离线11..13、不重导入旧源或放行扩值。后继[资金signed24解码](editor-money-import.md)只修离线具名money，20章原输出不变/82资产不改；后继[资金编译](editor-money-compile.md)已signed24表示及固定三byte同步，[三池编译](editor-reserve-compile.md)补六byte同步；缓存与隐藏槽/角色初始化等缺口仍在，不能由数量公式补齐 | 对原SINARIO／KI复核并在独立源纠错；初始化每字段具备来源、引用联动和未用槽策略。地图迁移不暗改它们；E-04/E-10之前专项完成 |
| G-SLOTS 身份与战术 | 同槽不同人、G127、22正常势力、按city.idx选战场、姓名查询；增删重排会改变引用／别名 | 人物跨章导入映射、保留槽、同名身份、据点战场目录及全消费者审计；未证明前保留原槽，不开放可运行的新增／删减槽 |
| G-CAP 扩边与容量 | 384×256、Y byte、图低32KiB、固定调度／工作区／哨兵等 | 逐消费点矩阵、原证适用范围与唯一引擎适配、容量／溢出／性能负控；不能只改width或数组length。属于后续专项，非M1完成条件 |
| G-HOST 既有环境接入 | 未查验远端端口／事务／对象／编译任务绑定；当前Python不能直接假定在请求环境执行 | 实施时只核已有配置能力和接口一致性；不足只暂停依赖功能，变更部署另需授权。不重新询问单服务器／集群，不把内容更新变成部署 |
| G-STYLE 原图视觉 | 原生组件水系标注及自动纹理最终参数尚无本次生成对照 | M0保留视觉来源／人工标注置信度，M1生成新旧对比和大小框样本，由用户按Q65验收。不是规则证书 |

完整工程设计稿可以明确这些门的接口、拒绝条件和取证任务；这不等于已经消除了证据缺口。**当前可交付的是供确认的合同与执行方案，不是“任意地图／空白新游戏已可实施放行”或“全部原规则设计已认证”。** 若门槛检验推翻字段或映射，先回流本分册与产品源、同步任务二及测试，不能用内置专用旁路或新规则填平。

### 10.3 MAP-EDITOR-AUDIT-1后续排查状态

详细原字节／数据检查及反例只维护在[前三项准入排查](re-notes-editor-map-admission.md)，本表更新第10.2节的定位精度，不撤销未完成的门。

| 门／分项 | 本轮已取得 | 仍未放行／阶段边界 |
| --- | --- | --- |
| G-MAP原输入与动态接缝 | 解包原图与当前规则资源98304B相同；野战五点分类与易主中心／角块写回重读；发现静态分块与动态terrain投影缺口 | 完整组件归组、任意叠放recipe及动态投影验收未完成；M1独立，M2/M3不能绕过 |
| G-ROAD原图／新图区分 | 当前v2编码复现既有原构图低32KiB摘要；边内跨边共享点／线段／单位斜X均0；原固定构图轮数及末方向未检查CF的输入风险已定位 | 端口footprint及改图构图、搜索工作区／耗尽／真实接敌仍需专项，不能据原图数据开放任意新路 |
| G-INIT可复用字段组 | 官方初始固定表分布、普通军师前置、F23差异及城市边界组同步依据已明确 | 空白章／隐藏槽／角色联动与解析纠错仍未完整认证；原槽不变迁移不需先完成全部新章功能 |
| G-SLOTS移动／增删 | 原扫描号、node→城市地址、城市指针→战术目录完整关系已定位 | 移动即使不增加数量也要核编号映射；不得用假城市填槽或把C0野战目录当第193座城 |
| G-CAP显示／地理／实体容量 | 固定stride/Y byte、图空间当前余618点／130边头、天气双边界、DPR整图内存风险已量化 | 编码空间余量不是安全容量；显示扩框、扩大地理域、变节点表分别取证，实际扩容不纳入任务二 |

下一验证输入与输出见排查§5的A-MAP／A-ROAD／A-INIT／A-SLOTS／A-CAP清单。只有对应原证与实现验证均成立才解除该功能门；本轮未改产品代码，不把只读排查记成迁移或任意地图测试通过。

## 11. 初次设计交付核对（历史范围，非产品测试报告）

| 本轮要求 | 产物／实际证据 |
| --- | --- |
| 保留产品决定及更正 | 产品源仍记录Q1–Q73、原件只读更正、管理员完整测试复制、任意下层放置、四层与水域摘要、数据发布无需重启／部署；技术方案单独标注为待确认 |
| 统一数据与引擎映射 | 本分册第1–4节及第10节；已读现有编译／解析／目录／世界／装配／战术／保存接口，未知初始化与组合未写成正式机制 |
| API、持久化、安全与竞态 | 第5–8节；含原子指针、幂等、删除与缓存、会话撤销、单章快照、IDB比较删除，不假设现有Cloudflare已提供所需绑定 |
| 迁移和验收 | 任务二第4节文件接缝／差异矩阵／身份存档影响，第5节M-00..06；本分册第9节E-01..11，均明确待执行 |
| 文档验证 | Markdown、79条本地链接、空白／冲突标记／表格列数及git diff --check通过，工作区仅8份文档；主设计与迁移计划主动LSP为clean，技术分册LSP未就绪，不能记作通过；session mode=all无缓存问题仅作补充 |
| 未越界 | git工作区仅文档变化；没有运行游戏回归／浏览器验证、改产品代码、读写真实存档、部署或提交推送 |

关键工程来源核对时的SHA-256（后续文件变化须重新核对，不能用本文替代读取源码）：

| 文件 | SHA-256 |
| --- | --- |
| `tools/content_pipeline.py` | `994065257090100af3837fd5b7ce9a588412411c2e0cd1175fda2232857e0dbe` |
| `tools/parse_sinario.py` | `d2f63e564eb7c9518e40c4fbd9fce4034091be1c49ab87bd7e726ad1db44098d` |
| `web/src/game/worldresources.js` | `78c0aca7c7c77418885bc748fe6bfbf4615872c60dcbc4968b3ea616df4040d8` |
| `web/src/game/battle/battleprojection.js` | `aa9715dd725138429d7bff81ed540633ddb635de81e188abe63db71fc794fe76` |
| `web/src/core/indexeddbsavebackend.js` | `9b839f67949b484572f330c7a540f34ac8fb31a966f1990e7bc023741ce1a2e4` |

最终状态：文档补齐已交付，方案待用户确认；第10节门槛未获本轮关闭，相关功能放行仍阻塞。不能将本轮设计工作完成记成任务二、完整编辑器或任意自定义游戏已经完成。
