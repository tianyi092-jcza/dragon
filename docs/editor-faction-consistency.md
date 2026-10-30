# E-04-FACTION-CONSISTENCY-1：势力双来源一致性拒收

首批为Python `content_pipeline.compile_chapter`的工程保护；后继JS只读拒绝门见下。该适配器已编码的非资源字段，若与同槽固定`nativeFactionSlotRaw`不一致，明确拒编译，而不是成功输出随后被fresh覆盖的值。**不批量同步角色/计数/策略、不猜任免初始化**；资金三byte与预备池六byte的既有同步保持。默认/原件/旧副本/live/save/App/规则/JS作者路径不改，无commit/push/deploy。

## 确认的Web缺口

[I/O先登记](editor-local-validation.md#e-04-faction-consistency-1双来源一致性先审io)。owned `faction-consistency-session-r1/audit.json`保护此前289源/82资产，20章原输出相等，20×14个首槽编辑使公开编码byte改变、固定raw仍旧。`nativefactions.js#initializeNativeFactionSlots`固定source.map(decodeSlot)后Object.assign覆盖声明视图；这是Web消费边界，不是原机制/角色可玩证据。

守卫比较本适配器已经回写的14个byte：+00/+01/+02/+03、+16/+17/+18/+19、+1D/+1E/+23/+28/+2A/+3E。覆盖attr/君主/军师/首都、两个策略城市、既有NPC军师计数派生byte、目标/士气/对白/城数/好战/外交官/标识。+18仍使用本来已有的n_generals＋advisor_count编码，不新增计数公式或实锤声明。错误明确槽号、偏移和初始化编辑不支持；输入/兼容区未写。

一致只证明两份编码没有在该接缝分叉，**不是改君主/军师/首都/计数等的许可或完整初始化门**；手动同时改两来源不能据此宣称合法游戏。未编码的n_legions/monthly_reserve_upkeep等不在此14byte比较，其它引用/初始化仍须共同校验与原证，不冒全势力schema。未知byte不作全记录等值比较，不整条64B覆写、不补零、未公开槽保留。

## 实际验证与限制

- 新固定Python门不接路径/命令，只current Web manifest/data与参数API。20章未改全文相等；首/末声明槽×14字段×具名/固定来源两个方向×20章，共1120精确拒收且源/兼容区保持。未知+0B/+2B/+30分别在公开和固定来源保不同值，不能借一致性校验擦掉或禁用未知；既有money=-1与三池联合编码继续同其它全文，合60正向检查。边界仅表示夹具，未执行角色/异常资源规则。
- normal/-O完整收据逐同，显式七focused全部exit0：新两门、reserve-native162/33与142表初始化cold、money-native70/13与50cold、内容产线20章/四季像素/坏源不覆旧输出、copy-drift、installed实体来源。没有新App/浏览器或角色变更执行成绩，不拼旧七门。
- 85入口/290源码（272Node/14Python/4HTML）只是库存，未全85轮。287旧声明源byte同，只有compiler/runner两个有界delta和一新Python门；82当前/归档资产、36产线输入/原始输入前后SHA。新详细静态收据关联当轮日志、audit、源码、链接/诊断和HEAD，旧收据/失败历史保留。
- 本轮是编码一致性拒收，不产生新的原版机制结论；宽度/角色来源仍以[原字段维护源](re-notes-custom-data.md)及[实体字段](re-notes-entity-fields.md)为准。Jev仅3036B人工工程摘要经preview/fixed1.13/advisory，不传原资源/快照/正文/全文日志，不作规则、许可或完成门。主动9路径0clean/0诊断/6MD unavailable/3inconclusive，全部未确认；矛盾工具6clean文字拒。session243files九旧path/duplicate/已裁决JSON建议warning，无新blocking，不清cache/禁rule，缓存缺项不等修复。

完整可写实体/继承/角色引用/初始化、其它字段写集、完整JS创作接线、真正后台与完整goal仍开放；这些拒收不能代替它们。

## 后继JS直接覆盖字段与原生视图拒绝门

新增 `web/src/content/authoring/factionconsistency.js`，由共同 `chapterActiveGaps` 调用。它在独立 `{factions:[],nativeFactionSlotRaw}` 对象上复用实际fresh的 `initializeNativeFactionSlots` 解码，不复制另一套字节／哨兵公式、不修改源／原生表、不耗RNG或运行AI。新增 `entity-native-mismatch`／`entity-native-source`／`entity-native-view` 诊断及繁体定位。

该首批范围为fresh `Object.assign` **直接覆盖的13个已知非资源字段**（后继四资源比较见下）：attr／monarch_idx／advisor_idx／capital／strategic_city_primary／strategic_city_secondary／target_faction／legion_morale_cap／talk_style／n_cities／bellicosity／diplomat_idx／march_marker_style。这与Python14byte门不冒同范围：+18解码为独立nativeGeneralCount，非直接覆盖n_generals；本批不另造其计数转换，也不补n_legions／monthly_reserve_upkeep等其它字段写集。未知+0B／+2B／+30保持可不同，不做整条raw等值或自动修复。

原生来源已存在时，必须是实际decoder认可的22槽；公开视图也须符合fresh已有的 `current.idx === position` 固定前缀合同，乱序或中间缺槽不能假装可运行，不自动重排。它是Web消费接缝一致性，不是新增原版机制。没有raw字段时本比较不猜来源；**不意味着可运行**，缺依赖仍受后续准入限制。保存必填门不变，结构安全的不完整草稿可保留问题；没有新增作者改槽／任免／初始化许可，同时改两来源也不据此认定合法。

本批日志在 `.dragon-analysis/editor-completion/faction-consistency-*`：

- `js-before.log`：前3个内容组通过，但既有setStrategist修改后共同active门未报告分歧，先行断言失败保留。
- `js-after-r2.log` 5组通过：20固定章不变；首／末公开槽×13字段×两方向×20章共1040次精确拒收，不改输入；坏已提供表、未知byte保留、无raw不补值；固定视图乱序／缺前缀；实际角色writer的军师清空使全源／所选章拒绝，而另一完整章仍能投影，保存缺口不变且源raw原样。
- `js-gaps-r2.log` 既有报告9组、`js-scope-r2.log` 20章编译／8负控通过。`js-api-r2.log` 自有临时目录及loopback本地接口39拒收（先前33＋新增6）：公开军师与raw分歧、空的已提供native表、仅重排公开势力，各使全源／坏章HTTP400且错误准确；另一完整章HTTP200，六资产SHA不变、旧修订2不可变pack保留、源bytes不改。stderr为预期请求及自有关闭日志，不是互联网认证／真实游戏浏览器／生产发布证明。
- 原Python一致性60正控／1120拒收回归通过（`python-regression.log`），既有资源writer193检查／71负控通过（`js-resources-r2.log`）；没有改变这两条实现。原生束235文件重建并复建unchanged（`js-bundle-check-r2.log`），两壳SHA保持，shell65通过。没有Vue或DDL变化，未重跑无关Root／浏览器／游戏规则长链，不登记程序／固定库、不解除任何门。

五份JS语法及diff检查通过。主动LSP五份JS均push-only未确认，两文档warning视图clean；mode=all缓存50文件仍3项既有warning（drafts布尔参数、能力测试字符串建议、原证数值解析），未屏蔽、不称全仓clean。

## 后继四资源具名与固定来源比较

同一JS门现包含 `money/reserve_cav/reserve_arc/reserve_inf`，合计17个直接覆盖字段。比较仍复用实际fresh decoder，不另写signed24/u16公式；合法 `editChapterResources` 同步具名值、record.raw与固定表的写集不变。只有具名／固定来源分歧时拒绝编译，不替作者选择其中一份、自动补值或扩大任免权限。缺raw、未知字段、计数转换等既有边界不变；保存结构门不变，诊断不是任意数值可玩证书。

日志前缀 `.dragon-analysis/editor-completion/faction-resources-consistency-`：

- `before.log` 新负控先复现第一章money具名修改漏检（5组过、1组失败），不冒四资源所有旧失败逐项复现。`after.log` 修后6组通过：20固定章不变，首／末槽×17字段×两方向×20章1360次拒收；既有资源writer在20章分别应用4组signed24/u16边界组合（80次），比较全保持一致，原输入不变。未知byte、缺raw、坏表、槽序和实际军师改动的边界继续覆盖。
- `api.log` 自有临时loopback接口47拒收／17个成功所选章scope：新增四资源各具名修改、raw保持旧值时，全源和坏章各400精确指出字段；另一好章仍200、六资产SHA与旧pack不变、坏源不回写。不是真实认证／浏览器／生产或完整Trial证据，stderr保留预期请求和关闭记录。
- `writer.log` 现有资源writer193检查／71负控通过；原生束235文件重建并复建unchanged（`bundle-check.log`），两壳SHA保持，shell65通过。未改Vue／DDL／原版规则，不跑无影响Root、浏览器、Python编译及游戏规则长链，不登记程序／固定库。
- 三代码主动LSP均push-only未确认；两文档warning视图clean，mode=all的50文件缓存仍为前述3项既有warning，未屏蔽；不把空诊断当clean。三JS语法与diff检查通过，原有CRLF提示保留。完整实体初始化、计数与其它字段、资源闭包及全量编辑器目标仍未完成。

## 后继任官保留槽边界

依据[工程合同§3.2](game-editor-technical-design.md#32-稳定身份不等于原运行槽)已批准的G127保留槽约束，`gamesource.js` 两种任官writer共同使用的 `generalByIdx` 现只接受规范整数0至126。`setMonarch`、`setStrategist`及经前者执行的继任不能把127作为普通角色；军师明确清空null仍走原路径。检查在字段修改前完成，不删G127来源记录、不改raw／计数、不改变普通槽其它任官条件，也没有新增初始化或可玩资格。这是创作入口限制，不据此宣称新原版机制结论。

已有服务保存和完整副本历史校验调用同一writer。含保留槽任官操作的历史将拒绝，不能靠回放把它洗成合法任官；本批不迁移、删除或修复真实历史数据。普通军师清空的草稿历史仍可核验，但是否可运行仍受上述具名／raw一致性等门限制。

证据前缀 `.dragon-analysis/editor-completion/role-slots-`：

- `before.log` 新测试先复现保留槽任官未拒（含第一固定章军师路径）；非法参数组另有错误信息不匹配，不冒全部旧值都曾被接受。`after-r2.log` 4组通过：显式自有夹具的君主／军师／继任127拒绝且源不变、正常端点0／126与null清空保持、非法身份拒绝；41固定输入的20章逐一拒绝127且整源／原始表不变；受信完整副本正常清空历史通过、伪造127任官历史422。
- `profile.log` 的完整 `verify_editor_copy_profile.mjs` 在前置测试完成后仍超过命令900秒预算，日志为空，**未计通过**，未用旧全量成绩代替。本批改跑上述有界历史正负控，不称完整profile回归完成。只读进程检查首轮因shell展开PowerShell变量而失败，修正引用后匹配该脚本的node进程数为0，没有杀进程或清未知目录。
- `consistency.log` 既有势力一致性6组通过，含20章、17字段／两方向共1360拒收、80组合法资源同步及所选章独立性；shell65通过。原生束236文件重建并复建unchanged，SHA `0907b6ca642ebaca84cacfb55a062b5013658a02259d44536f15f55732a5831d`，两入口壳SHA保持。无Vue／服务／DDL修改，不重建展示壳；该边界批次未重新跑HTTP，后继聚焦API见下；浏览器及无关规则／Trial发布长链未跑。
- 两代码主动LSP均push-only未确认，不能称clean；两文档warning视图clean，mode=all缓存80文件仍26项既有warning，未屏蔽。两JS语法通过。首次diff因新增文档EOF空行失败，已定点删除，不批量规范化换行。

## 后继任官保留槽实际HTTP验证

`verify_editor_template_root.mjs --role-slots-only` 新增独立聚焦入口，复用实际common Request／自有文件SQLite／FileBucket和41固定输入；保留八组公共来源／创建检查，另加四组完整副本任官边界。普通作者的中立创建仍参与公共检查，但该任官场景使用真实管理员完整副本，不把中立空章缺势力的拒绝冒称G127证明。身份为明确种子夹具，不是登录／浏览器或部署验证。

`.dragon-analysis/editor-completion/role-slots-api-r1.log` 首轮12组通过，stderr为空：

- 君主／军师／继任127，以及“先合法改章名、再任127”的同请求全部422 `DRAFT_CHAPTER_EDIT`；拒绝期间实际桶put为0、草稿对象数不增、原修订全文不变。请求账本并非不变：保留四条准确原body的failed记录，无结果修订，查询明确失败；同键同body重试仍拒、同键换成合法body409，不另伪造成功收据。
- 另两账户跨游戏保存404且不产生请求记录；重建服务实例后原修订／源及失败键状态保持。
- 独立新键明确清空普通军师成功保存1→2，捕获整源等于共同writer结果、旧修订1不变。这只是可保存草稿正控，不绕过具名／raw运行一致性或初始化缺口。
- 仅在自有SQLite将该已提交操作历史的null篡为127，读取／编译捕获／后续保存均422；finally恢复原JSON后重建服务恢复读取，Trial／release数仍0。未修改生产账本，不声称真实历史自动修复。

本批只改测试及文档，无产品／Vue／web/src／DDL变化，不重建两束，也不重复此前超时的完整profile或其它Root长入口；该历史超时仍为未通过。shell65、测试语法及diff通过；测试代码主动LSP为push-only未确认，两文档warning视图clean，mode=all缓存80文件仍26项既有warning，未屏蔽。

## 后继章节角色只读控制器投影

`draft.txt` 复用既有草稿GET的chapters／factions／generals字段，新增只读 `roles` 模型；没有新服务DTO、请求或写操作。仅完整副本的字段齐全时为known，旧DTO缺必要字段或中立定义模式显示未知，不当空名单。字段齐全但数组／槽／角色引用／姓名／所属类型非法时拒绝整次安装，保留原已读快照，不半安装新角色上下文。

角色资料按章ID和原槽组织，不把同槽／同名当跨章同一人物；保留君主／军师引用、姓名字号及明确所属，不要求所属必须属于公开势力前缀，不重数／修复源值。G127标记reserved，仍保留只读来源资料，不成为普通候选资格。此目录是显示资料，不是任官合法性或原生初始化证据；该投影批次尚未接写入控制器；后继清空引用见下，任免表单仍待接。

私有投影绑定原loaded对象、身份／账户ID及版本，显示副本无别名；换源、身份退休或未确认保存撤销。观察到身份版本变化后再恢复，不复活旧投影。手改修订输入不更换已读上下文；读取／render不写journal，不捎带脏字段。

证据前缀 `.dragon-analysis/editor-completion/faction-role-projection-`：

- `r2.log` 两控制器142项通过，新增三组覆盖旧DTO未知、正常0／126及保留127、响应与模型无别名、字段形状错误原子拒绝、缺字段与中立模式、脏修订输入、身份／账户ABA及待确认保存隐藏。r1亦通过；r2补已提供null／对象清单必须拒绝，不将其混同于字段缺失。
- `root-r2.log` 的`--role-slots-only` 13组通过，新增原生控制器真实GET两个精确修订，将20章全部角色／武将投影逐值与实际源对照；模型修改后render恢复、修订输入999不触发请求、身份退役清空。该控制器集成的API回调禁止POST、storage禁止journal写，保留原任官拒绝／正常清空／历史损坏矩阵；认证仍为种子夹具，不冒实际登录或控制器任免保存。r1亦通过，r2对应最终边界代码，stderr空。
- shell65、两JS及TXT模块语法通过。没有Vue／web/src／服务／DDL变化，不重建两束；未跑尚未接的角色表单／浏览器或此前超时完整profile，不宣称任免初始化、完整实体编辑完成。两测试主动LSP均push-only未确认，TXT无服务；两文档warning视图clean，mode=all缓存80文件仍26项既有warning，未屏蔽。

## 后继清空军师引用控制器

`actions.clearStrategist(chapterId,factionSlot)` 仅在完整副本的精确角色投影已知时工作，要求本章势力引用可识别的非保留普通武将；未知、空引用、G127、缺武将或非法槽不提交。确认明确列出原槽／姓名，说明只清空草稿引用，不删人物、不补原生计数或初始化，不承诺Trial／发布。

请求只含已保存metadata、空resourceEdits及一条 `set-strategist/generalIdx:null`；确认后重核ticket／身份、原loaded与角色投影，沿原16KiB、单journal、原键查询与明确重试路径。刷新仅恢复键、不重造body；收据后必须精确重读。该孤立操作的accept分支保持其它脏名称／资源输入，不沿一般章保存路径清掉未提交输入；没有改一般章保存行为或服务协议。

证据前缀 `.dragon-analysis/editor-completion/advisor-clear-controller-`：

- `r6.log` 两控制器145项通过（r5亦通过，r6补16KiB拒绝）：已读1而非输入999、其它脏字段不捎带也不消失、原键原body查询后重试、刷新仅查询、无乐观角色更新、精确读回null；未知／保留／缺失目标、取消、确认中身份／版本／账户／改密／游戏变化、存储失败和预算拒绝均无POST。
- r1至r3为新测试夹具修正：API端口使用key／revision而非headers、context字段为verified、恢复测试隔离Map，以及未确认操作必须先查询才能重试；没有放宽产品重试门。r4复现新角色操作成功后被旧章保存accept分支抹掉其它脏名称，随后定点区分孤立清空操作；失败日志全部保留。
- `root-r3.log` 的`--role-slots-only` 13组通过，实际common Request／自有SQLite／FileBucket／41来源、种子管理员认证。原手工正常清空POST换成原生控制器读取1→确认→实际POST保存2，发送前journal存在，body逐值等于预期、修订999及脏名称／资金不捎带，收据清journal但保脏字段并锁角色待重读；原整源、旧修订、权限及损坏历史验证保持。r1漏传authority、r2误用不存在的initialGameId端口导致测试失败；修正为现有authority／refresh／chooseGame接口后通过，未改产品授权或选择守卫。最终stderr为空。
- shell65、两JS及TXT模块语法通过；没有Vue／web/src／服务／DDL变化，不重建两束。此控制器批次不是Vue／登录浏览器验证，后继表单见下；完整任免／原生初始化及完整编辑器仍未完成，不重跑无影响长链或将此前完整profile超时计为通过。两测试主动LSP均push-only未确认，TXT无服务；两文档warning视图clean。mode=all缓存80文件为30项既有warning（含再次出现的四处旧Canvas测试spread提示），未改旧表达式或屏蔽提示。

## 后继角色查看与清空军师引用表单

`ChapterRolesPanel.vue` 由草稿页挂载，按已读章节与势力槽展示君主／军师引用，区分未配置、人物资料缺少与G127保留槽；文字经Vue转义。只对已知普通军师引用开放独立清空按钮，忙时或角色投影未确认时禁用；未知资料不假装空势力库，不新增任命／继任／解散入口或资格推断。沿原控制器确认、单journal、其它脏字段保留和精确重读流程；不是可写角色源。

证据前缀 `.dragon-analysis/editor-completion/advisor-clear-ui-`：

- `browser-r1.log` 工作台125项首轮通过，产物 `.dragon-analysis/editor-workbench/run-qGJ9LU/result.json`。实际gateway／Vue／CSP但API显式夹具；补齐旧章夹具已提供角色投影所需的明确faction字段，不把缺失补入产品。覆盖未知、空／缺人物／保留引用禁用，合法126、HTML转义、取消、修订输入999和脏名称／资金不捎带也不抹掉、无乐观清空以及精确读回null后禁用。
- `verify_editor_roles_browser.mjs r4` 新独立入口3组通过：真实Node／文件SQLite／FileBucket／41固定来源／自有HTTPS／管理员实际登录与改密／完整复制／全新Chromium。20章角色面板从真实DTO选择已有普通军师；取消无写，实际提交1→2收到200后仅中断浏览器回包，保其它脏输入；刷新仅原键关联，不能重造重试，查询后显式读2，全程仅1次角色保存POST。
- 读回仅目标advisor_idx为null及相应`GENERAL_ADVISOR_REF`派生引用移除，其它人／所属、其它19章和地图素材等DTO不变，旧1不可变。运行缺口仍明确含`entity-native-mismatch`，未替作者同步raw或宣布可Trial。收据／截图为 `.dragon-analysis/editor-phase/roles-browser-r4/receipt.json`／`roles.png`，24项源码SHA核验一致、stderr空，未触正式IDB、外网或非预期页面错误。
- r1至r3均在提交后刷新导航处失败／超时，未计通过：复制页快捷入口不改URL片段；显式导航还须逐一确认草稿未确认保存和副本关联的两条独立离开提示。测试先漏导航，再仅处理一条提示导致另一条默认取消；最终按现有`canLeave`逐条确认，未改产品导航或保存守卫。复核派生报告后，测试明确只移除目标势力的那一条军师引用，而非错误要求引用报告完全不变。
- Vue build/check逐byte一致（JS460465B、CSS34712B、8包notice）。shell65、两测试语法及diff通过；四份代码主动LSP均push-only未确认，不能称clean。两文档warning视图clean，mode=all缓存83文件仍30项既有warning，未屏蔽。本批无web/src／服务／DDL变化，不重建原生束，也不重复无影响Root／完整profile／规则／Trial发布长链。

## 后继军师任命入口前置审查

从清空引用转向任命表单前，核对工程§3.1／3.3及真实writer，确认现有 `setStrategist` 只改具名引用，不构成已完成初始化的profile。保留当前清空的限定草稿能力，不据此扩大任命、G127或运行权限。

本次重新核读固定KI的选边／取消／普通军师fresh分支，并盘点五固定SINARIO的440条正常势力记录。发现一条初始默认军师与当前引用不同，以及两条活动势力的普通军师所属为FF；这否定了将所有来源无条件规范为“同势力且默认引用相等”的做法，但不证明任意跨势力任命合法。详细地址、输入SHA、偏移和置信度统一维护于[默认军师与来源例外](re-notes-custom-data.md#势力-41-默认军师与来源例外)，不在此复制原证。

仅新增有界原证记录与文档，没有新增独立测试框架、任命控件或服务／引擎代码；未执行KI、未读真实SAVE，未改原始输入或既有草稿。后续必须先闭合限定替换域和初始化写集；不能只加下拉框、默认同步两byte或猜F18。其它独立产品任务不因此阻塞。

三文档主动LSP按120秒预算检查，warning视图均clean；mode=all缓存95文件仍31项既有warning及1hint，未屏蔽。只有文档与原证产物变化，不运行无影响的浏览器／游戏回归或重建两束。反汇编首轮的近调用显示回绕／截断窗口问题已在原证维护源记明，使用全窗覆盖的r2，不把首次输出冒完整调用链。

## 后继军师初始化消费链审查

本节是**当前Web接线事实**，不是原版规则证明，也未开放任命。为避免把写集接错到离线编译器，核对实际路径如下：

| 边界 | 当前实际消费／写入 | 对任命接线的约束 |
| --- | --- | --- |
| `server/datacompiler.js` | 调用JS `compileGameSource`，章节产物保存完整definition；标记data-only | 通过资料阶段不等于完成角色原生初始化 |
| `server/playpacks.js:prepare` | 将每章`state`直接structuredClone成包内章节，另绑定资源 | 互联网Trial／发布包不会在此调用Python重新编码军师字段 |
| `trialruntime.js:createTrialEnvironment` → `prepareScenario` | 使用包内章节；fresh从`nativeFactionSlotRaw`初始化22槽，restore要求已有原生表并重绑 | 不能指望仅改具名advisor_idx后自动重建原生来源 |
| `nativefactions.js:decodeSlot/initializeNativeFactionSlots` | F02解为advisor_idx、F18解为nativeGeneralCount，并Object.assign覆盖声明前缀；原始record保留raw，F3F未作为独立具名初始军师字段解出 | 需区分声明引用、记录raw与固定表；不能由F02全局反填F3F |
| `main.js:loadState` | initPlayer后仅fresh调用initializeFreshPlayerAdvisor，再绑定CFD、按既有条件初始化外交、仅fresh刷新评分 | 作者编辑源不能预先执行玩家选边后的扣数／清attr；restore不能重播 |
| `initializeFreshPlayerAdvisor` | 普通0..126必须与原生F02相符，F18按byte减1后清对应G00／active；Web custom走既有例外 | 不把原生选择处理扩成任意角色初始化公式 |

`tools/content_pipeline.py:compile_chapter`是另一条离线编译路径：编码声明F02，按已有解析视图构造F18后与固定表逐byte比较；除已支持资金／三池之外，角色字节分歧仍拒绝。修改这一Python函数**不能单独修好互联网保存／包／fresh链**，也不应删除一致性门以接受新表单。

原版普通确认／自创确认／取消返回的局部地址复核见[原证维护源](re-notes-custom-data.md#势力-42-自创军师确认与返回边界)。其中7F和G00行为已有原证，本批不是首次发现；补回返回窗也不替代间接菜单／返回保护的完整证据。下一实现仍应限定不迁属、不换槽的普通替换域，证明旧／新角色引用及初始默认值写集、计数与人物状态不被重复处理，再接现有保存历史与表单。跨势力、空引用新增、保留槽和任意初始化不能一并放行；本次未添加候选控件或修改服务／引擎。

只读源代码与固定KI静态窗口，不执行KI、不读真实SAVE、不操作浏览器或既有内容。原始输出在 `.dragon-analysis/editor-completion/advisor-custom-{entry-r2,return}.txt`；未新增独立测试入口。CodeGraph的调用者索引未列出实际main.js调用，按明确符号检索及读文件核实；两次猜测路径不存在的检索已纠正，未计验证成功。纯文档及静态证据变更不重跑无影响回归、不重建两束。三文档主动LSP以120秒／并发2核查，warning视图均clean；mode=all缓存95文件仍31项既有warning及1hint，未屏蔽。diff检查及本批源码／原证SHA记录位于 `advisor-init-consumers-*` 产物，不将静态审查计作新的运行或保存测试成绩。

## 后继开局动作码与任命边界

重新读取固定KI六个窗口，闭合8F37写动作格→E453读动作码→8E5A分流→1AEA调用者的近端协议：20h／21h是界面动作，不是普通武将候选索引；接受既有军师时重新读F02，非零动作转自创路径，取消按原F3F恢复。详细字节、伪代码与far输入尚未认证的边界见[原证唯一维护源](re-notes-custom-data.md#势力-43-开局选项返回的是动作码不是普通武将索引)。

这排除了把该开局对话当普通任免writer的实现路线，不新增任命许可。下一步仍是已批准的作者初始默认引用修改：核限定普通旧／新人物的占职、所属、F02／默认引用及fresh消费写集，再接现有保存历史；不能把界面动作AL直接同步进raw，也不能提前执行fresh扣数或清attr。无关鼠标far模块不为此扩追，其未知不阻塞其它独立功能。

本批只有只读KI静态证据与文档，未执行KI、访问真实SAVE或修改产品／夹具／准入。r1探查输出含数据及截断已明确作废为函数证据，r3为最终六个完整指令窗口；没有新增测试脚本，不重建两束或运行无影响浏览器／游戏回归。三文档主动LSP240秒预算／并发2的warning视图均clean；mode=all缓存106文件保留31项既有warning，未屏蔽。diff检查、文档与原证SHA记录于 `advisor-selection-write-*`，不计作运行或保存验证。

## 后继军师替换的本章归属保存门

依据已批准[工程合同§3.3](game-editor-technical-design.md#33-删除修改影响表)，`gamesource.setStrategist` 现在在写入前拒绝新任人 `general.faction !== faction.idx`，不迁移人物所属，也不为缺失所属补默认值。这是作者编辑合同的拒绝边界，不是新的原版任官规则或初始化公式。

显式null清空保持；原引用不变时不因来源自身的归属例外新增拒绝，但仍经过既有普通槽／占职检查。原件中的两条G所属FF例外不批量修复，G127保留槽门不放宽。仅修改具名引用的既有草稿能力仍不等于可运行替换；F02／F3F同步、F18及人物状态的初始化闭包依旧未完成，不提前执行fresh扣数，不开放新任命表单或运行准入。

复用现有验证，前缀 `.dragon-analysis/editor-completion/advisor-domain-`：

- `before.log` 新拒绝场景先复现 missing expected exception。`roles.log` 五组通过：非本势力／缺所属拒绝且源不变；明确同属的普通槽0／126、null清空及未变来源例外保持；20固定章原有保留槽拒绝；完整副本顺序历史不能以之后合法清空掩盖早先跨势力替换。原正控夹具明确补所属0，不把原先无所属候选继续视为合法任命。
- `consistency.log` 六组通过，具名／raw角色分歧仍不能编译；资金等已有路径保持。未改原生表、初始化或编译放行条件。
- `root-r2.log` 的 `--role-slots-only` 实际common Request／自有文件SQLite／FileBucket／41固定输入13组通过，种子认证而非浏览器登录。增加真实固定章中未占其它职位的外势力候选，跨属单命令及先跨属后清空整批均422 `DRAFT_CHAPTER_EDIT`；六条失败请求保原正文／原键，无对象PUT，跨属原键重放仍同结果、换正文409。既有权限、实例重建、原源不变、唯一清空保存、报告读取和坏历史拒绝保持。r1也通过，r2仅补跨属原键重放；两轮stderr空。
- 原生束重建前核236条只有本次gamesource源码漂移；重建后第二次逐字节一致，Trial／玩家两壳SHA保持a456d356…／515019f2…。固定库f4ba804b清单及20个既有消费者指纹仍匹配（`library.log`），未改库身份或覆盖清单。Vue未变，不重建Vue。shell65、三JS语法与diff通过；不跑无影响完整profile长入口、浏览器或规则／Trial／发布长链，不新增测试脚本。

三代码主动LSP240秒首查有1超时／2push-only；按用户要求延长至300秒、并发1复查，均为push-only未确认，不称clean。两文档主动warning视图clean；mode=all缓存106文件仍31项既有warning，未屏蔽。定位时误查不存在的旧测试名产生一次rg错误，已核实际直接调用者，未计验证成绩。

完整A17与G-INIT仍开放；此批只关闭既有作者写入口漏查归属的问题。

## 后继默认军师重建排查的显示子链

[原证维护源](re-notes-custom-data.md#势力-44-8607显示调用不重建默认军师)补齐7B90所调8607的五窗口／七直接调用：它计算列表显示偏移、写CS:81A4并在A0C8h绘制，不读取D52并重建F3F；正常返回保留AX等原证列明寄存器，CX不作保留承诺。这个局部缺口已缩小，不重复审查已确认的候选builder或动作码。

这仍不是整个开局选择链的无写入证明，不能据此认定F3F永不覆盖或把F18改成重数公式。既有作者归属拒绝门、原source例外与运行门均保持，未新增任命控件／初始化写者。证据 `.dragon-analysis/editor-completion/advisor-default-display-r2.txt` 只含固定KI静态反汇编；探查首RET窗口保留并明确限度。未访问SAVE、执行DOS或新增测试框架；纯原证文档变更不重建两束或跑无关游戏／浏览器回归。四文档主动LSP在warning视图clean，mode=all缓存106文件仍31项既有warning，未屏蔽；diff检查通过。

## 后继F3F间接写点与调查收束

[原证维护源](re-notes-custom-data.md#势力-45-f3f间接写点与排查边界)复核`7A7A..7AC5`的完整75字节：实际写指令是`[DI]`，通过初值3Fh及40h步长写正常22槽的显示缓存；只检索直接`+3F`写点会漏掉它。未新增任何军师规则，也未证明全部新局路径无其它写入；候选扫描只留作线索，不作负面证明。

后续工作收束到作者源阶段的固定raw／具名字段、默认引用和fresh消费写集，不再把全标题／全显示／输入驱动的无写证明当作任命前置。F18不重算、G00不预清，既有源例外与归属拒绝门不变。本批仅原证文档与自有分析产物，无产品、束或测试框架变化，不跑无影响浏览器／游戏回归。三文档主动LSP300秒在warning视图clean；mode=all缓存107文件仍36项既有warning，未屏蔽。完整叶窗解码／分支边界与diff检查通过，不冒运行态观测或军师任命闭包。

## 后继作者源三处表示与旧命令写集

本批只核作者保存／编译边界，不继续扩大标题调用链。当前完整副本的军师引用涉及具名 `state.factions[].advisor_idx`、该记录的 `raw`、固定22槽 `state.nativeFactionSlotRaw[slot]` 三处表示。`nativefactions.decodeSlot` 从固定raw的F02解码，7F映为null；`factionNativeConsistencyGaps` 比较具名与实际fresh解码值，不以具名值反盖固定raw。已有四资源写者 `chapterresources.editChapterResources` 同步具名、记录raw及固定raw，但这不能自动赋予角色写者初始化许可。

自有分析产物 `.dragon-analysis/editor-completion/advisor-source-binding.json`：

- 通过既有固定加载器核41个Web输入，20章228条**公开声明**势力记录的两份64B raw逐字节相等，具名军师均与F02的现有解码一致。这里不是原版440个物理正常槽的新盘点，也不是所有具名字段／初始化已认证。
- `middle-1`槽11仍为F02=89、F3F=61、F18=13；两份raw一致地保留该差异，没有按当前军师重填默认引用。与原始来源例外相符，不把Web副本本身当原机制证明。
- 在自有副本 `upper-1`槽0，现有 `setStrategist` 将普通同属、未占职候选3替换原16后，只改变具名引用；两份raw和全部将记录不变。现有一致性门准确报告 `advisor_idx differs from native source; initialization edit unsupported`。这是现行草稿能力的边界，不是一次完成的原生任命。

`advisor-source-legacy-history-r2.json` 用既有 `FixedCopyProfile` 捕获能力验证同一例：旧 `set-strategist` 命令的具名修改可通过内容历史验证；在独立实验副本同时改两份raw的F02／F3F，仍使用该旧命令时422拒绝。实验字节修改没有写入产品或持久草稿，不是批准的初始化实现。首轮误对捕获的只读对象调用mutator，触发read-only TypeError；空stdout及摘录stderr保留，不计通过。r2只改为先克隆捕获对象，未改产品守卫。

因此后继角色初始化需要**明确区分的新操作或版本语义**，保留旧成功请求、原键正文及旧快照写集。不能直接把旧 `setStrategist` 改成自动同步raw，也不能让历史重放忽略新增字节差异。新写者仍须闭合源阶段默认引用、所属／占职及实际fresh消费，并逐项保持不受影响的字段；不重数F18、不预清G00、不混写运行期外交缓存。本节不预先定新API、不授初始化准入；原null清空和来源例外继续按旧能力处理。

本批没有产品代码、束或DDL变更，也没有新增测试脚本；仅自有内存副本／既有加载器与profile审计，非HTTP、浏览器或DOS运行观测。不重复无影响游戏／Trial／发布长链。两文档主动LSP300秒在warning视图clean；mode=all缓存107文件仍36项既有warning，未屏蔽；源码指纹复核与diff检查通过。

## 后继君主候选未知所属拒绝

按工程§3.3“君主候选必须自由”的既有作者合同，`setMonarch` 不再把缺失所属或显式undefined当作自由：只有明确 `faction:null` 才可继续原占职检查。`removeMonarch` 的继任路径共用此检查。拒绝发生在所属与君主引用写入前；不推断缺失值、不迁属、不补raw／计数，本批未新增君主任免表单或原生初始化；既有旧提示框不构成完整任免交付。这是编辑输入边界修复，不是新的DOS机制结论。

复用 `tools/verify_editor_role_slots.mjs`，日志前缀 `.dragon-analysis/editor-completion/monarch-unknown-`：

- `before.log` 新测试的显式undefined候选先复现 Missing expected exception，其余五组通过；不冒所有新增分支都已逐一复现旧失败。
- `after.log` 六组通过：缺键／显式undefined分别经任命与继任四条负控拒绝，原君主及完整源保持；既有明确null的0／126正控、保留127拒绝、军师归属与历史校验保持。41固定输入的20章全部原武将记录均明确持有所属字段且为null或整数；不把这一固定来源核验推广为任意历史输入合法证明。未迁移或修复已有草稿。
- 原生束236文件重建，两次构建第二次unchanged，SHA `750f3c6f9ae28470d0014a3dc61111dec72f7b2895f16b11a2b277eb9bd829e9`；两入口壳保持a456d356…／515019f2…。固定库身份不更新；Vue／服务协议／DDL／规则执行未改，不重建后台壳。
- 两JS语法、shell65通过。两代码主动LSP等待300秒均push-only未确认，不称clean。没有新增测试入口；本批不是实际HTTP／浏览器或任免后可玩证据，不重跑未受影响的长链，先前完整profile及Root超时仍不能记为通过。

完整A17与初始化闭包仍未完成；拒绝未知输入不等于交付任免功能。

## 后继武将页共用军师引用清空入口

`GeneralsPanel.vue` 在势力行新增“清空草稿軍師引用”，复用既有 `draftActions.clearStrategist`，不新增角色命令或原生写集。与改名／画像共用已读gameId／revision、verified及未确认操作门；还须共用roles已知且未锁，势力槽与独立表军师槽一致、军师有完整普通记录。未配置、G127保留槽、缺失记录或不同修订均禁用，不按显示文字猜引用。

取消及确认后复核、saved metadata／空资源编辑／单set-strategist null、唯一journal及原键恢复仍由原共用控制器负责；不新增读取或自动追latest。收据后锁定，须明确读共用修订及同修订武将表；其它脏name／money等不随清空保存，也不被收据清除。不删武将、不补F18／raw／初始化或授予运行准入。

该UI批旧“設軍師／辭退”提示入口仍明确标为旧流程，当时q辞退路径尚未退役；后继见[旧q清空退役](#后继旧军师q清空路径退役)。其它任免仍未迁移，不宣称所有角色写入已统一。既有角色面板的独立清空按钮也保持，不因增加武将页入口而改变其合同。

复用 `verify_editor_workbench_browser.mjs` 原角色场景，补DTO正常idx／capital字段供真实武将适配器读取，成功清空改由新按钮触发。`advisor-clear-ui-browser-r1.log` 首轮186组通过（185＋1），产物 `.dragon-analysis/editor-workbench/run-Xk4cuC/`，errors／unexpected／failed为空。普通126可用，null／127／缺失42禁用；确认取消零POST，typed999仍使用已读修订和saved metadata，精确单命令不带另表name／money777。收据锁清空与改名，不自动读表；共用读回但旧武将表仍不可改名，再读同修订表才解锁，已清空军师不能重复清空。原角色面板的已知／未知显示及读后清空状态回归保持。该批为新Chromium／实际Vue与gateway、明确API夹具，不冒新入口真实HTTPS保存证明；后继证据见[清空HTTPS恢复](#后继武将页军师清空真实https恢复)。

草稿控制器89、shell65通过，build/check逐byte一致（JS539780B、CSS37287B、8包许可），测试语法与diff通过。仅Vue、既有工作台测试、生成后台壳及文档变化；共用控制器、旧适配器、后台、web/src及DDL未改，不重建原生束，不重复无影响真实保存／Trial／发布／规则长链。主动诊断与源码指纹见 `.dragon-analysis/editor-completion/advisor-clear-ui-final-hashes.json`；完整A17／A19仍部分。

## 后继武将页军师清空真实HTTPS恢复

复用 `tools/verify_editor_roles_browser.mjs`，将已有真实清空／丢回应链的触发与恢复入口迁到武将页，不新建服务或测试框架。自有Node共同服务、临时文件SQLite／FileBucket、41固定来源、loopback HTTPS、真实管理员登录／改密／完整20章复制与全新Chromium，无成功API回包夹具。先按实际DTO挑选普通军师，再读取武将表同章；不借固定槽默认值或改变角色规则。

`advisor-clear-ui-http-r3.log`／`roles-browser-r7/receipt.json` **3组通过**，26源码SHA与`roles.png`绑定本轮。取消零POST，另表name／money777及typed999保留，确认只有一条If-Match1、saved metadata／空resourceEdits／set-strategist null。服务真正提交2后仅浏览器丢回应；旧武将表仍1，清空与改名禁用，不乐观显示成功。刷新后查询精确原key，真实返回committed／result修订2；查询和共用明确read2之后尚无独立武将行，再明确读取同修订武将表才显示“無”，清空禁用、改名恢复。全过程只有一次草稿保存POST。

原对照保持：除所选军师引用与对应引用报告外，受影响章其余投影、其它19章、其余源投影以及旧修订1完整DTO不变；active报告仍明确 `entity-native-mismatch`，不把清空引用当成原生初始化成功。错误／域外清单为空，正式IDB隔离断言保持。仅确认该新入口的普通军师清空，不认证任命、旧q路径或生产TLS。

失败保留：r5的测试选择器误将无值data属性当槽号，等待超时；修为势力行内按钮。r6已完成真实提交／丢回应，但仍断言旧快捷入口的两次离开提示，实际URL已经恢复武将页，无需切页，故0不等于2；改核目标hash与后续原键恢复，不改产品或放宽保存断言。两轮日志分别为`advisor-clear-ui-http-r1.log`／`-r2.log`，不算通过。

本批只改既有工具及文档；语法、diff、链接／源码／截图指纹复核，主动LSP范围及未确认项记录于 `advisor-clear-ui-http-final-hashes.json`。不重建未变后台／原生束，不重复无影响工作台、控制器或Trial／发布／规则长链。该HTTPS批旧军师提示q及其独立保存仍待退役；后继见下节。角色写集、初始化与A17／A19完整目标仍未完成。

## 后继旧军师q清空路径退役

在共用按钮取得上述限定HTTPS恢复证据后，`general.txt` 的旧 `set-strategist` 提示框不再把q编码成 `generalIdx:null`。输入q仅显示改用共用精确修订及清空按钮的指引，零读取／确认／POST，不自动调用另一工作流。数字任命及其替换确认保持；“免君主”的q解散仍是独立既有确认流程，本批不改它。Vue标签改为“設軍師（舊流程）”，移除已停用的辞退承诺。服务端set-strategist协议、历史正文、共用clearStrategist及原生角色写集均未改；已加载旧页面不被远程撤销，不把本地入口退役当成新的服务端权限门。

`verify_generals_conflict_model.mjs` 的通用收据／迟到／冲突守卫改用仍保留的数字任命（明确API夹具），保留原覆盖，不再用已退役q触发保存。新增q无请求／无确认且原advisor不变用例；原四类任免其它命令和取消覆盖保留。四个既有控制器入口合计125项通过（武将19＋草稿89＋上下文10＋刷新7），shell65通过。

新Chromium工作台187组通过（186＋1），产物 `.dragon-analysis/editor-workbench/run-MfBGVI/` errors／unexpected／failed为空；新组从真实“設軍師（舊流程）”按钮输入q，仅显示停用指引、全部API计数和rolePosts不变，随后原共用清空确认／保存／显式双读仍通过。API为明确夹具，不冒新的真实HTTPS保存证据。`verify_editor_backend_stage_ui.mjs` 同步这一按钮的精确选择器，未重跑该实际HTTPS长链；旧收据不冒本批源码。

日志前缀 `.dragon-analysis/editor-completion/advisor-legacy-clear-`。build/check逐byte一致（JS539771B、CSS37287B、8包许可）；三MJS语法、TXT测试导入执行、diff及链接检查通过。主动诊断及指纹见 `advisor-legacy-clear-final-hashes.json`。无web/src、共用控制器、后台、DDL或规则改变，不重建原生束，不重复无影响Trial／发布／规则长链；该退役批数字任命及其它任免的journal迁移、原生写集与初始化仍未完成；军师任命共用动作后继见下节。

## 后继军师任命共用journal动作

`server/public/draft.txt` 将既有军师清空的提交部分复用为私有 `submitStrategistReference`，公开新增 `assignStrategist(chapterId, factionSlot, generalSlot)`。必须有完整副本的已读角色投影、章及势力存在、目标为明确0..126整数普通槽且实际存在；null、缺值、负零、保留槽或未知记录均不能借任命动作清空。独立 `clearStrategist` 继续明确传null并沿原清空合同。

动作只固定身份／精确修订／已读普通记录，不重写服务端任职判定：同势力、占职与原来源异常原位no-op仍由现有 `setStrategist` 及保存profile检查。确认显示新候选和原军师槽，明确不迁属、不补raw／原生计数或初始化、不代表可试玩。与清空共用16KiB预算、确认后二次ticket／loaded／角色目录核验、成功持久化唯一键才POST、未知回应原key／body查询重试。正文仅saved metadata、空resourceEdits、单set-strategist；收据保留其它脏metadata／资源输入且不是已读修订，不自动GET。

复用 `verify_editor_draft_controller.mjs` 新增三组，`advisor-assign-journal-controller-r2.log` **92组通过**（89＋3）：取消零写、typed999仍用原修订1、候选7替换原126的精确正文、其它dirty name／money777保持；未知时阻止任命／清空／普通保存及未查询retry，重载仅query、原realm失败查询后原key／body重试、明确load2才显示新引用；坏章／势力／目标、确认期间身份／上下文变化和保键失败不POST。API与收据为明确夹具，不是任命资格或真实HTTP成功证明。首轮有一测试错误地期待未确认操作期间setField能改写锁定名称，实际按既有合同保持原值；改为事前设脏名称并核保留，仅修测试，原失败日志保留。一次后继edit因读覆盖拒绝，重新读取后成功，未运行未修齐状态。

shell65、MJS语法、TXT由测试实际导入执行及diff／链接通过；主动诊断与指纹见 `advisor-assign-journal-final-hashes.json`。该动作批仅共用控制器、既有测试及文档变化，当时尚未切换武将页按钮；后继见[共用任命入口](#后继武将页共用军师任命入口)；不冒全任免迁移、真实HTTPS或原生写集闭合。无Vue、后台、web/src、DDL变化，不重建两束或跑无影响浏览器／Trial／发布／规则长链；A17／A19仍部分。

## 后继武将页共用军师任命入口

`GeneralsPanel.vue` 的“設草稿軍師”改调共用 `assignStrategist`，不再从现行按钮调用旧 `general.actions.faction('set-strategist')`。须两表同gameId／已读revision、角色目录已知且未锁，势力槽和军师引用一致；提示框返回后重新核原模型／context及资格。明确输入普通槽，空白不默认为0，q不能变成null；清空继续使用独立按钮。任职资格仍由服务检查，不把前端可点当作候选获准或原生初始化完成。旧适配器数字任命action此批尚未退役，后继见[旧任命路径退役](#后继旧军师任命路径退役)；君主任免／解散仍旧流程。

复用工作台角色场景，保留原共用清空成功链，再增加候选7任命。`advisor-assign-ui-browser.log` 新Chromium／实际Vue与gateway **189组通过**（187＋2），产物 `.dragon-analysis/editor-workbench/run-O1WRQP/`，errors／unexpected／failed为空。原旧q界面用例改为新任命输入q被共用边界拒绝、零GET／POST；旧q退役本身仍由独立适配器测试覆盖。新任命输入取消及最终确认取消均零请求；成功只发已读If-Match及saved metadata／空resourceEdits／set-strategist7，typed999与其它脏名称不入正文，收据不自动GET，任命／清空锁定。共用明确读回但独立表仍旧时继续锁，读取同修订表后显示7并解锁。API及成功任命为明确夹具，不冒真实后端资格或HTTP证据。

草稿控制器92回归通过。首轮shell检查仍硬编码四个按钮都调用旧 `actions.faction`，因此faction-panel失败；更新为三种未迁移旧动作加共用任命按钮／action接线，未删除后台角色出口检查。修后 `advisor-assign-ui-shell-r2.log` shell65通过，原失败日志保留。已有 `verify_editor_backend_stage_ui.mjs` 的非法编号定位同步新按钮及全局错误状态，但本批未重跑真实HTTPS，也没有新任命成功的实际HTTP证书。

build/check逐byte一致（JS540586B、CSS37287B、8包许可），三MJS语法／diff／链接通过；主动诊断及指纹见 `advisor-assign-ui-final-hashes.json`。仅Vue、三个现有验证入口、后台壳和文档变化；共用控制器、服务、web/src与DDL不变，不重建原生束或重复无影响Trial／发布／规则长链。该UI批之后仍需真实任命保存及原键恢复，后继见下节；旧数字任命action的后继退役见[下文](#后继旧军师任命路径退役)，其它角色写集与初始化及A17／A19完整出口仍未完成。

## 后继军师任命真实HTTPS与原键恢复

复用 `verify_editor_roles_browser.mjs` 原清空恢复链，补入新“設草稿軍師”按钮的任命，不新增测试框架或API成功夹具。自有Node共同服务、临时文件SQLite／FileBucket、41固定来源、loopback HTTPS、真实管理员登录／改密／完整20章复制及新Chromium；只选择实际DTO中所属与势力槽一致、没有其它君主／军师职位的普通原军师。该样本为上库首章势力0／原槽16，清空后任命回原人，不冒新人物初始化或所有候选资格验证。

`advisor-assign-ui-http-r2.log`／`.dragon-analysis/editor-phase/roles-browser-r9/receipt.json` **5组通过**（原清空3＋任命2），26源码SHA及`roles.png`绑定此轮。保留清空1→2、真实提交后丢回应／刷新原key查询／显式双读及旧1保持；任命2→3新增：

- 输入取消、最终确认取消均零GET／POST。typed999不改变If-Match2，正文只有saved metadata、空resourceEdits、set-strategist16；其它脏名称“任命外未存”不带入且提交后保留。
- 收到真实服务200／修订3后仅丢弃浏览器回应，旧表仍显示无军师，任命及未查询重试锁定，无自动GET。刷新后只查询第二个独立原key，真实committed／result3；恢复前后总保存POST仍2、草稿正文GET增量0，未重造正文或自动重试。
- 之后明确共用load3仍没有独立武将行；再读同修订武将表显示16，任命／清空恢复。除draftRevision外完整DTO及sourceDigest回到初始1；旧1／2完整DTO不变。收据另存 `recoveries` 与浏览器 `draftReads`，区别测试用独立GET与页面读取。错误／域外清单为空，正式IDB隔离断言保持。

首轮r8在已完成原清空三组后，测试切回资料页未处理离开确认，导航被取消、在隐藏的draft-name等待240秒超时；日志 `advisor-assign-ui-http-r1.log` 保留为失败。仅补测试接受原离开确认并断言目标hash，产品未改；r9通过，不把该等待归为服务任命失败。

本批只改既有工具和文档，不重建未变后台／原生束，不重复无影响控制器／工作台／Trial／发布／规则。语法、diff、链接和26源码／截图指纹复核通过；主动LSP及最终范围见 `advisor-assign-ui-http-final-hashes.json`。新人物任命、替换不同候选、全并发权限矩阵与原生引用初始化仍未完成；旧数字任命action后继退役见下节，不以恢复原人样本关闭A17／A19或完整目标。

## 后继旧军师任命路径退役

在共用按钮及其真实HTTPS恢复取得上述限定证据后，删除 `server/public/general.txt` 中旧 `set-strategist` 提示／替换确认／直接保存分支，移除随分支失去用途的本地势力记录变量及军师专用数字错误提示。旧适配器 `actions.faction('set-strategist', …)` 现在按未知操作拒绝，在prompt、confirm、GET及POST之前返回错误；现行Vue任命／清空仍用共用draft journal，不增加第二套保存入口。

保留 `set-monarch`、`remove-monarch`、`disband-faction` 的原请求、确认及 `saveEdits` 身份／修订／迟到守卫；君主任免与解散仍待迁移。服务端set-strategist命令、旧请求历史、共同writer、原生字段与运行门均未改。此处是旧展示层入口退役，不是新的服务端权限限制，也不能远程撤销已加载的旧页面。

复用 `verify_generals_conflict_model.mjs`：先预览再应用AST调用替换，将收据精确修订、坏收据、读回失败、身份迟到、冲突／未知回应及陈旧章节守卫改用仍保留的set-monarch动作；运输响应仍为明确夹具，不冒君主任命规则验证。新增旧军师命令零prompt／confirm／GET／POST拒绝断言；原q专用引导用例随整段退役被替换，三种保留动作合同及其实际具有的确认取消覆盖保持，不为凑数量保留旧写路径。

`advisor-assign-retired-controller.log` 四个现有入口合计 **128项通过**（武将19、草稿92、共享上下文10、刷新7）；shell65通过。新Chromium／实际Vue与gateway的工作台 **189组通过**，产物 `.dragon-analysis/editor-workbench/run-BqiMQx/`，errors／unexpected／failed为空；API为明确夹具，非新真实HTTPS保存证书。两轮上下文读写之间只修改旧适配器及此测试，没有改变共用动作或现行按钮。

测试语法、TXT由测试实际导入执行、diff、调用检索与文档链接通过；主动诊断及指纹见 `advisor-assign-retired-final-hashes.json`。仅旧适配器、既有测试及文档变化，不重建未变Vue／原生束，不重复无影响真实HTTPS／Trial／发布／规则长链。其它任免journal、完整角色写集／初始化及A17／A19与完整编辑器目标仍未完成。

## 后继君主任命共用journal动作

`server/public/draft.txt` 新增 `actions.assignMonarch(chapterId,factionSlot,generalSlot)`，与军师任命／清空共用私有 `submitFactionPost`。公开动作固定set-monarch，只接受显式普通槽0..126，拒null／G127／负零；必须是当前完整副本、已验证精确章／势力／普通武将投影且无未确认保存。确认展示原君主和新候选，并明确自由武将／无任职资格仍由服务校验；确认后再核身份、generation、loaded及角色目录，持久保键成功才提交。

正文仅saved metadata、空resourceEdits和单条既有set-monarch，typed revision及其它脏表单不参与。成功收据保其它名称／资源输入、使已读角色失效，不自动GET；未知回应沿原query／retry，重载只有键不能重造正文。两种任命共用收据分类，不改变已有军师动作。前端不复制所属／占职规则：既有 `gamesource.setMonarch` 仍要求明确faction=null且无其它君主／军师职位，写入具名所属及君主引用；本批不改后台、writer、旧历史、raw、计数或初始化。

复用 `verify_editor_draft_controller.mjs` 新增三组，`monarch-assign-journal-controller.log` **95项通过**（92＋3）。明确自由候选7为控制器夹具：取消零请求、saved revision1不受999影响、准确set-monarch正文、脏名称／money777保留、收据不是已读；未知回应挡新君主／军师／清空／普通保存及未查询重试，重载仅原键查询、原realm查询failed后按原key／body重试，明确读2才更新monarchSlot。缺数据、坏章／势力、缺失／保留／非法槽、确认取消／登出／版本或游戏变化及存键失败均零POST。原92项回归保持；API成功回包为明确夹具，不冒真实自由武将资格或HTTP保存证明。

shell65、测试语法／TXT实际导入执行、diff及文档链接通过；主动诊断和最终指纹见 `monarch-assign-journal-final-hashes.json`。只改共用控制器、既有测试和文档，不重建未变Vue／原生束，不重复无影响浏览器／Trial／发布／规则长链。该动作批现行君主按钮仍用旧独立适配器；后继按钮及真实保存／原键恢复见下节。旧路径退役、继任／解散、原生角色写集及A17／A19完整出口仍未完成。

## 后继君主任命按钮与真实HTTPS恢复

`GeneralsPanel.vue` 的“立草稿君主”改用共用 `draftActions.assignMonarch`，不再从现行按钮调用旧set-monarch适配器。两表同gameId／已读revision、角色目录已知且未锁、独立表与角色投影的势力／君主槽一致才可操作；提示返回后重核原model／context／资格。显式普通槽0..126，空白不默认为0；资格仍由原服务校验，不在前端另设自由或占职规则。军师、文字、画像的共用流程保留。该UI批旧 `general.txt` 的set-monarch action尚未退役，后继见[旧君主任命路径退役](#后继旧君主任命路径退役)；继任／解散仍旧流程；不改后台命令、writer、raw或初始化。

复用现有入口，`.dragon-analysis/editor-completion/monarch-assign-ui-` 日志：

- `browser.log` **191组通过**（189＋2），实际Vue／gateway与明确API夹具，产物 `.dragon-analysis/editor-workbench/run-AmaIta/`。自由候选8为夹具；输入取消、空白拒绝及最终确认取消均零GET／POST；准确saved metadata／当前If-Match／单set-monarch8，不带typed999或其它脏名称。收据锁君主与军师、无自动GET且保脏，共用明确读回后旧表继续锁，再读同修订表才显示#8解锁。原军师任命／清空及其它工作台回归保留。
- `controller.log` **95项通过**，`shell.log` **65项通过**；shell接线断言由三种旧角色按钮改为两种旧动作＋共用君主任命，保留后台全部角色出口检查。build/check逐byte一致（JS541428B、CSS37287B、8包许可）。本轮以上各入口首轮通过。
- `http-r1.log`／`.dragon-analysis/editor-phase/roles-browser-r10/receipt.json` **7组通过**（原角色5＋君主2）。自有Node共同服务／文件SQLite／FileBucket／41固定来源、loopback HTTPS、真实管理员登录改密／完整20章复制、新Chromium，没有API成功替身。实际DTO选同势力普通军师16及明确faction=null且无君主／军师职位的普通将10；保清空1→2和军师任回2→3链后，通过新按钮任命将10为势力0君主3→4。输入和最终确认取消零写，typed999下仍If-Match3、原saved metadata及单命令。收到真实200／修订4才丢浏览器回应，旧表未乐观更新、脏名称保留；刷新只查第三个独立原键，真实committed4，总POST仍3且恢复阶段草稿正文GET增量0。明确共用load4后仍无独立武将行，再读表显示#10并解锁。角色变更只核具名所属／君主引用及其引用报告，其余已投影字段、其它19章和旧1／2／3完整DTO保持；native mismatch仍显式报告，不称可玩初始化。errors／outside为空，正式IDB隔离断言保持，26源码SHA与`roles.png`绑定本轮。

本批仅Vue、三个既有测试、后台壳及文档变化；共用控制器、旧适配器、服务、web/src和DDL未改。不重建原生束，不重复无影响Trial／发布／规则长链。三MJS语法、diff、链接、源码与收据指纹复核通过；主动LSP及最终范围见 `monarch-assign-ui-final-hashes.json`。这是既有set-monarch写入合同的共用入口迁移，非原生角色同步／新人物初始化或完整权限矩阵；该批之后旧set-monarch路径待退役（见下节）；继任／解散和A17／A19仍未完成。

## 后继旧君主任命路径退役

`server/public/general.txt` 删除旧set-monarch提示／直接新键保存分支。现行君主任命已由共用按钮和journal处理；遗留 `actions.faction('set-monarch', …)` 与set-strategist一样，在prompt／confirm／GET／POST之前按未知操作拒绝。保留remove-monarch继任／确认解散及disband-faction的原合同、读取和保存守卫，不改服务端命令、历史正文或角色writer；不能远程撤销旧页面，也不是新的服务端权限门。

复用 `verify_generals_conflict_model.mjs`，AST预览后将十个旧任命测试调用迁到保留的继任动作；fixture只改对应 `resolution.successor` 的具名投影。精确收据、坏收据、同修订响应夹具、读回失败、身份迟到、冲突／未知回应及陈旧章守卫继续覆盖。新增两种已退役任命均零prompt／confirm／请求且保原君主／军师的断言；继任数字与q两条提示后身份复核、解散确认取消保持。这里是明确API夹具，不冒继任规则或原生写集证明。

`monarch-assign-retired-controller.log` 四入口 **131项通过**（19＋95＋10＋7），shell65通过；工作台 **191组通过**，新Chromium／实际Vue与gateway、API夹具产物 `.dragon-analysis/editor-workbench/run-BJxN6k/`，errors／unexpected／failed为空。测试语法、TXT实际导入执行、diff和调用点检索通过；AST后一次编辑因读取覆盖失效被拒，重读后完成，无未修齐状态的测试或产品失败轮。主动诊断与源码指纹见 `monarch-assign-retired-final-hashes.json`。

仅旧适配器、既有测试和文档变化；Vue、服务、web/src、DDL和两束未改，不重建或重复无影响HTTPS／Trial／发布／规则长链。继任／解散的完整共用journal迁移、完整角色原生同步与A17／A19仍未完成；后继继任动作见下节。

## 后继指定继任者共用journal动作

`server/public/draft.txt` 新增 `actions.succeedMonarch(chapterId, factionSlot, generalSlot)`，复用已有 `submitFactionPost` 的完整副本已读身份／修订／角色目录、16KiB预算、确认后二次ticket／loaded／catalogue复核、持久原key及原正文恢复。继任者须明确普通槽0..126且实际存在；null、q、对象或保留槽不能变成解散。只发送既有 `remove-monarch`、`resolution: { successor }`，不借set-monarch改写历史命令，也不新增disband入口。

确认文字列原君主槽及新继任者，说明不解散势力、须无任职自由武将、服务端校验及草稿不代表运行准入。资格仍沿现有 `removeMonarch → setMonarch` writer，本批不复制资格规则或改具名字段、raw与初始化写集。收到单条继任收据保留其它脏metadata／资源输入，未明确读取前仍未验证，不自动GET。

复用 `verify_editor_draft_controller.mjs` 增加三组，`monarch-succession-journal-controller.log` 首轮 **98组通过**（95＋3），shell65通过。实际导入TXT执行，API与明确自由槽7为控制器夹具，不冒原始来源或HTTP任职证明：

- 确认取消零请求，成功只用已读修订1／saved metadata／空resourceEdits／单remove-monarch-successor7；typed999不入If-Match，其它脏名称与money777保持，收据不是已读。
- 未知回应阻止继任／君主或军师任命／清空／普通保存及未查询重试；重载只保存原key并query、不能重建正文。原realm查询failed后，即使输入999也仍原key／revision1／resolution重试；明确读2后才显示继任结果。
- 无已读角色、坏章／势力、缺失／保留／非法继任槽、null／q／disband对象均零confirm／POST；确认期间取消、登出、版本或游戏切换以及持久化key失败均不发送。

测试语法、TXT真实导入执行、diff与链接通过；主动诊断和当前指纹见 `monarch-succession-journal-final-hashes.json`。仅共用控制器、既有测试和文档变化，无Vue／服务／web/src／DDL改动，不重建两束或重复无影响浏览器／HTTPS／Trial／发布／规则。该动作批现行继任按钮尚未切换，后继见下节；旧remove-monarch与解散路径、真实保存恢复及完整A17／A19仍未完成。

## 后继武将页指定继任入口

`GeneralsPanel.vue` 将原“免君主（須繼任或解散）”按钮切为“指定繼任者免君主”，调用共用 `draftActions.succeedMonarch`。复用君主任命的两表gameId／已读revision及角色目录／君主引用一致门，提示返回后重核原model／context及资格；空白不变成0，q不转成解散。原独立“解散勢力”按钮保持，因此未删除解散能力；旧适配器remove-monarch分支暂未退役。服务端自由／占职限制、命令及原生写集不变。

既有工作台角色用例保留清空、军师任命及君主任命，再增加明确自由候选9继任8的响应夹具。`monarch-succession-ui-browser.log` 首轮 **193组通过**（191＋2），新Chromium／实际Vue与gateway，产物 `.dragon-analysis/editor-workbench/run-0YCHWY/`，errors／unexpected／failed为空。输入取消、q／空白拒绝及最终确认取消零GET／POST；第四次角色保存精确为saved metadata／空resourceEdits／remove-monarch-successor9，typed999与脏名称不入正文。收据后仍显示8、继任和任命按钮锁定、无自动GET且保留脏名称；明确共用load后旧表仍锁，再读同修订武将表才显示9并解锁。该成功为API夹具，非实际候选资格或HTTPS证书。

草稿控制器98、shell65通过，shell保留后台角色出口检查并核共用继任action／按钮，只剩直接解散使用旧按钮入口。build/check逐byte一致（JS541859B、CSS37287B、8包许可）、两MJS语法／diff与链接通过；主动诊断及指纹见 `monarch-succession-ui-final-hashes.json`。仅Vue、两个既有测试、后台壳和文档变化，无共用控制器／后台／web/src／DDL改动，不重建原生束或重复无影响Trial／发布／规则。该UI批新继任真实HTTPS保存恢复尚未验证，后继见下节；旧继任分支退役、解散共用迁移及原生初始化仍未完成，A17／A19仍部分。

## 后继指定继任真实HTTPS恢复

复用 `verify_editor_roles_browser.mjs` 的真实角色链，追加第四次保存，不新建测试框架或替换成功API。沿自有Node共同服务、临时文件SQLite／FileBucket、41固定来源、loopback HTTPS、真实管理员登录／改密／完整20章复制及新Chromium。继任者从修订4实际DTO选普通、明确自由且无君主／军师职位者；本样本上库首章势力0由将18接任将10，不按同名或槽号猜资格。

`monarch-succession-http-r2.log`、`.dragon-analysis/editor-phase/roles-browser-r12/receipt.json` **9组通过**（原角色链7＋继任2），26源码SHA与`roles.png`绑定此轮：

- 保留军师清空1→2、任回16的2→3、自由将10任命3→4及各自原键恢复。继任输入取消、最终确认取消零GET／POST；typed999仍按If-Match4提交saved metadata、空resourceEdits及唯一remove-monarch／resolution.successor18，其它脏名称不带入且提交后保留。
- 真正收到服务200／修订5后仅丢浏览器回应，旧表仍显示10，继任／重试锁定，无自动GET。刷新后按第四个独立原key查询committed／result5；累计保存POST仍4，恢复前草稿正文GET增量0，没有重造正文或自动重试。
- 明确共用load5仍没有独立武将行，再读同章表5才显示18并解锁。检查具名君主、新将所属及对应引用变化，旧君主10仍属原势力、不解散或删除人物；其它字段、19章及旧1／2／3／4完整DTO保持。save gaps数量保持，active native-mismatch仍显式报告，不把具名引用保存当原生初始化。
- errors／outside为空，正式IDB隔离断言保持；`recoveries`记录修订3／4／5的恢复键、零自动正文GET及累计POST数，`draftReads`另列浏览器明确读取。

首轮r11在900秒命令预算内无输出、无收据，记为超时未确认。随后仅在既有入口增加六条无凭据阶段日志（输入准备、读1、军师读3、君主读4、继任提交5），再次以1200秒预算执行r12取得上述完整收据；不能据此确定首轮唯一等待原因或把它改记通过。超时后查询未发现此脚本的存活Node，未终止其它进程。

本批只改既有测试与文档，产品／后台壳／原生束不变，不重建或重复无影响控制器／工作台／Trial／发布／规则。语法、diff、链接与26源码／截图指纹复核通过；主动LSP及最终范围见 `monarch-succession-http-final-hashes.json`。该HTTPS批之后仍缺旧remove-monarch分支退役，后继见下节；解散迁移、完整权限／候选矩阵及原生同步仍未完成，A17／A19与完整目标保持部分。

## 后继旧继任及q解散分支退役

现行继任按钮及真实原键恢复取得上述限定证据后，从 `server/public/general.txt` 删除旧 `remove-monarch` 分支（数字继任和q解散一起退出），并移除已无用途的prompt依赖／数字解析。旧适配器 `actions.faction` 只保留直接 `disband-faction`；旧任命、军师及继任调用在提示、确认、GET／POST之前拒绝为未知操作。现行共用继任／任命／军师动作、后台协议和历史重放不变；不能远程撤销已加载旧页面，也不是新的服务端权限门。直接解散按钮继续保留原功能，不以删功能代替迁移。

复用 `verify_generals_conflict_model.mjs`：十处旧继任测试调用迁到实际保留的直接解散，响应夹具只移除势力行；原精确收据、坏收据、同修订响应夹具、读回失败、身份迟到、冲突／未知回应和旧章拒写守卫继续覆盖。增加旧remove-monarch零prompt／confirm／请求拒绝，保直接解散确认取消及确认期间游戏／身份变化拒写。已退役的数字输入专属测试删除，由共用继任控制器及现行入口承担，不为保旧数量留下第二套写入。此夹具不是完整解散机制／成员去向证明。

四个既有控制器入口合计 **133项通过**（武将适配器18、草稿98、共享上下文10、刷新7）；shell65通过。新Chromium实际Vue／gateway工作台 **193组通过**，产物 `.dragon-analysis/editor-workbench/run-X8JS0y/`，errors／unexpected／failed为空。API是明确夹具，非新的真实HTTP证据。日志 `monarch-succession-retired-{controller,shell,browser}.log`；测试语法、TXT实际导入执行、旧UI调用检索、diff及链接通过，主动诊断与当前指纹见 `monarch-succession-retired-final-hashes.json`。

仅旧适配器、既有测试及文档变化，无Vue／web/src／后台／DDL改动，不重建两束，不重复无影响HTTPS／Trial／发布／规则长链。该退役批尚缺直接解散共用journal，后继动作见下节；完整角色原生初始化仍未完成，A17／A19保持部分。

## 后继直接解散共用journal动作

`draft.txt` 新增 `actions.disbandFaction(chapterId,factionSlot)`，复用现有角色提交的完整副本已读目录、身份／版本、唯一attempt、16KiB正文、确认后二次ticket／loaded／catalogue核验及保键后发送。只允许明确存在的章／势力，不要求军师引用存在；解散没有待任命武将，不用缺失军师阻止此独立命令。正文为saved metadata、空resourceEdits、单 `disband-faction`／`confirm:true`，确认明确成员转自由、据点转中立且仅本章。沿既有服务命令，不在前端重写所属、原生计数或初始化。

成功收据仍不是已读修订，保其它脏metadata／资源输入、不自动GET；未知回应沿原key／原body查询重试，重载只有原键不重造正文。该动作批尚未接到现行按钮；后继接线见[共用解散按钮](#后继武将页共用解散按钮)。旧general适配器仍待只读化，不宣称完整迁移。

复用草稿控制器新增三组，`disband-journal-controller.log` **101组通过**（98＋3），shell65通过。明确无军师的已读势力可保存；确认取消零写、typed999仍按已读1提交精确命令、其它脏name／money777保留、收据锁定；未知时拦其它角色和通用保存／未查询重试，刷新只query、原realm失败后原键原正文重试；无角色目录／错章势力／负零／错型、确认时取消／退出／版本／游戏变化及存储保键失败均不POST。API是控制器夹具，不是解散成员写集、真实HTTP或原生规则证明。

MJS语法、TXT测试实际导入执行、diff与链接通过；主动诊断和指纹见 `disband-journal-final-hashes.json`。仅控制器、既有测试及文档变化，无Vue、web/src、服务或DDL变更，不重建两束或重复无影响浏览器／HTTPS／Trial／发布／规则。该批之后的现行按钮接线见下节；真实保存／原键恢复、旧适配器只读化及完整A17／A19仍待完成。

## 后继武将页共用解散按钮

`GeneralsPanel.vue` 的直接解散改调 `draftActions.disbandFaction`，不再调用旧独立适配器。`disbandableFactions` 复用两表同gameId／revision、已验证、无未确认操作、角色目录已知的门，并要求当前势力君主和军师引用都与共用目录一致；按钮禁用与点击均核验。没有新增成员处理算法，也不要求存在待任命武将。确认仍由共用动作持有；解散只作用于本章。现行角色按钮全部使用共用动作，但旧general适配器的disband写入口尚未退役，不能据此称所有旧入口已移除。

复用既有工作台角色场景，在清空／军师任命／君主任命／继任之后增加解散。`disband-ui-browser.log` 首轮 **195组通过**（193＋2），产物 `.dragon-analysis/editor-workbench/run-C4YSYb/`，errors／unexpected／failed为空。确认取消零GET／POST；typed999与其它脏名称不进入saved metadata／空resourceEdits／单disband-faction-confirm正文，收据后仍显示原势力与君主9，解散及继任锁定、不自动GET并保脏输入。明确共用load后旧独立表仍在且禁写，再refresh同修订表才移除目标势力行，其余三行保持。响应夹具只移除势力行，不冒完整成员归属／城市中立化或真实HTTPS证明。

草稿控制器101、shell65通过；shell检查同步为现行按钮零 `actions.faction` 调用、共用解散action接线，后台角色出口检查仍保留。build/check逐byte一致（JS542067B、CSS37287B、8包许可），两MJS语法／diff／链接通过。主动诊断及最终指纹见 `disband-ui-final-hashes.json`。仅Vue、两个既有测试、后台壳及文档变化，无控制器、服务、web/src或DDL改动，不重建原生束或重复无影响HTTPS／Trial／发布／规则。该UI批尚缺真实解散保存／原键恢复，后继验证见下节；旧适配器只读化及原生初始化仍缺，A17／A19与完整目标继续保持部分。

## 后继解散真实HTTPS与原键恢复

复用 `verify_editor_roles_browser.mjs`，在既有真实清空／任命／继任链后解散当前章势力0：确认取消零请求；typed999与其它脏名称不进入If-Match5、saved metadata、空resourceEdits及单 `disband-faction`／confirm:true。自有Node共同服务、文件SQLite／FileBucket、41固定输入、loopback HTTPS、真实管理员完整20章副本与全新Chromium，无成功API回包夹具。

服务真实提交6后仅浏览器回应被丢弃；原势力及君主18仍在，按钮／未查询重试锁定、不自动GET且其它脏输入保持。刷新后查询第五个独立原键，明确committed6，累计POST仍5、页面草稿正文GET增量0；共用load6后仍无独立势力表，再refresh同章表才移除目标行。完整DTO比较只允许目标势力删除、该势力武将所属与城市归属变null、对应君主／军师／所属及城市首都引用报告消退；其余投影及19章保持。解散后再次GET完整旧5保持；旧1—4在前面各自步骤及继任末已核，本步不重复宣称解散后重新读取全部旧版。

`disband-http-r3.log`（r15，1200秒预算）**11组通过**（9＋2），收据 `.dragon-analysis/editor-phase/roles-browser-r15/receipt.json`／roles.png，26源码SHA、四次恢复记录及完整disbandGaps保留。最终saveGaps=0、activeGaps=15，均为entity-native-view固定槽映射缺口；不能把可存草稿说成原生一致／可玩。正式IDB隔离、errors／outside为空。

失败记录不撤销：r13已完成真实提交／恢复及部分DTO比较，失败于测试错误要求解散后仍出现此前任官的entity-native-mismatch诊断；改为核准入缺口仍存在并保完整报告，未修改产品。r14在提交6后的阶段超过1200秒，无完整收据，原因未确认；查询未发现该工具残存Node，未终止其它进程。r15增加无凭据阶段日志并取消末尾重复读取1—4，只核本次直接前版5，完整成功。不是删除成员规则负控或放宽产品准入。

仅既有工具与文档变化，语法／diff／链接及指纹核验见 `disband-http-final-hashes.json`；不重建不变后台／原生束，不重复无影响控制器／工作台／Trial／发布／规则长链。该批尚缺旧适配器最后写入口只读化，后继见下节；完整原生字段与初始化仍未完成，goal及A17／A19保持进行中。

## 后继武将适配器只读化

现行所有角色按钮已使用共用journal，且解散真实HTTPS保存／原键恢复取得上述限定证据后，从 `server/public/general.txt` 移除最后的直接解散 `faction` action、`saveEdits`、独立新UUID保存／自动inspect流程及needsRead／confirm状态。现在仅暴露refresh、inspect、listPortraits、blockers及三个本地选择动作；只读请求不带正文或写入选项。saveDisabled仍表达表是否已读／忙碌，供共用按钮的双读资格使用，不恒设true以误禁现行功能。canLeave仍仅表示本只读参与者无脏输入，不绕过共用draft守卫。

不改现行Vue、后台角色协议、历史重放、共同writer或原生字段；已加载旧页面不会被本地退役远程撤销，不称新增服务端安全门。将旧适配器保存测试继续迁到其它假写入口没有意义，因此 `verify_generals_conflict_model.mjs` 重写为8个只读合同组：action白名单、零正文／写选项、投影不反写、精确读取、跨章引用和未知报告、来源ID／保留槽、画像选择、坏DTO原子拒绝、身份失效／迟到回应及选择回调失效。原独立收据／冲突／保存确认用例随被退役流程删除；这些保存出口由共用草稿101组及现行真实HTTPS链覆盖，不凑旧数量。

四个既有控制器入口合计 **126项通过**（只读武将8、草稿101、共享上下文10、刷新7）；shell65通过；新Chromium／实际Vue与gateway工作台 **195组通过**，`.dragon-analysis/editor-workbench/run-r70rlj/` errors／unexpected／failed为空。API明确夹具，不冒新HTTPS证明。日志 `generals-readonly-{controller,shell,browser}.log`，语法、TXT测试实际导入、diff／链接及旧UI调用检索通过；主动诊断与最终指纹见 `generals-readonly-final-hashes.json`。

仅旧适配器、既有测试与文档变化，无Vue／web/src／后台／DDL改动，不重建两束或重复无影响真实HTTPS／Trial／发布／规则长链。原章已迁移写入口不再经过此独立适配器，但完整实体编辑、角色原生同步／初始化及A17／A19总体验收仍未完成。

## 后继末尾解散声明数量拒收

有界审计复用41固定输入、共同副本writer、active门及实际 `initializeNativeFactionSlots`，只操作内存，不运行原CPU／App。`.dragon-analysis/editor-completion/disband-native-review-r1.json` 保存20章首／中／末58个去重样本、41输入与四源码SHA；原章全文及原生raw不变。末尾解散20例都仍是合法索引前缀，旧active门零缺口，`n_factions`却保留原数量；固定22槽解码仍保留被删槽，其中18例attr为128、2例为0。这是Web源／消费接缝事实，不是已执行AI或证明全部后续运行结果。

`factionconsistency.js` 现比较**已存在**的 `n_factions` 与公开列表长度，不等时报 `entity-native-view`；该声明不是22槽容量，不按attr重数，也不清槽、重排或自动更新计数。没有声明或没有native raw时仍不补值，本比较不能充当缺依赖、任意手改两来源或完整初始化证书。`disbandFaction`、历史操作重放、草稿保存结构门均不变：结构安全的未初始化草稿仍可保存，所选坏章Trial投影及全量编译拒绝，独立好章继续投影。`chaptergapreport.js` 增加准确繁体定位。

复用既有验证，日志前缀 `.dragon-analysis/editor-completion/disband-native-count-`：

- `before.log` 原6组通过、新2组失败，首章末尾解散零诊断得到复现；不冒该断言执行了全部20例。独立审计上述20例均已执行。`after.log` 修守卫后7／8通过，余项暴露新信息缺繁体识别；补报告映射而非放宽测试，`after-r2.log` **8组全部通过**。
- 正向保20固定章、1360次旧字段双向拒收、80次现有资源writer组合、未知byte和来源缺失边界；新增20章实际末尾解散均保raw／声明／保存缺口，精确报告声明长度分歧、不修改输入；八类错误声明拒绝，缺失声明不伪造；全源／坏章拒编译且另一完整章可投影，报告recognized。既有报告入口 **10组**、shell **65项**通过。
- 原生束236文件两次构建，复建unchanged，SHA `7d32f0602387dae6392582e949e6fba97a8294f735bed7f42983d0cd7be1b41a`；两App壳及固定库指纹保持，详细复核、语法／diff／链接及主动诊断见 `disband-native-count-final-hashes.json`。无Vue／DDL／规则算法改动，不重复无影响工作台、角色保存HTTPS或规则长链；未声称真实Trial issue／完整发布验收。

后继服务路径复用 `verify_editor_chapter_trial_api.mjs`，新增一次实际 `disbandFaction` 末尾删除，不手造数量分歧；确认原声明及22槽raw保持。`disband-native-count-api.log` 首轮通过，**49次拒收／18个成功所选章scope**（原47／17加本例两次拒收和一次好章编译）。自有临时目录、loopback HTTP及现有共同编译／缓存服务中，全量与所选坏章各HTTP400并准确指出声明长度分歧；另一好章HTTP200、六资产SHA保持，精确所选pack正文不变，旧修订2的immutable pack不被取代，每次请求后草稿原字节保持。stderr保留预期拒收及自有服务关闭日志；这是本地固定源接口，不冒互联网登录、实际Trial issue／浏览器或生产发布。仅既有测试与文档变化，源码、束及库未变，不重复构建或其它已验证入口；当前指纹与主动诊断见 `disband-native-count-api-final-hashes.json`。

先前r15的15项错序为旧源码收据，不能冒当前报告；本守卫会另报告声明分歧。此批关闭末尾解散的已发现漏检，不是完成解散的原生初始化。完整任免／解散写集与A17、A20仍未完成。

## 后继章节管理页完整角色操作入口

按产品设计§4的章节集中配置要求，`ChapterRolesPanel.vue` 在原只读引用／清空军师基础上新增立君主、设军师、指定继任和显式解散。全部调用已存在的共用draft动作，不新增命令、表、服务写入或原生字段。武将页入口保留；章节页直接使用共用已读角色目录，不依赖另外刷新武将表，也不把来源槽当成跨章人物身份。中立定义模式仍不提供这些原槽操作。

任命／继任输入0..126普通槽，任官资格继续由服务判定；输入取消不提交，空白不变成0，提示返回后重核组件的已读模型及锁定状态，再由共用控制器执行确认／精确loaded修订／原键保护。清空仍只允许已知普通军师引用；解散单独确认成员自由／据点中立及仅本章范围。成功收据后角色区转未知，须显式精确重读；其它未保存名称、资源输入不夹带入正文。未知初始化／双来源不一致仍由现有准入门拒收，不因新增按钮而放行。

复用 `verify_editor_workbench_browser.mjs` 保留原武将页五动作与所有旧用例，另以明确API夹具在章节页顺序执行清空、任军师、立君主、指定继任、解散。每步核取消零GET／POST，三种输入动作另核q／纯空白及最终确认取消；typed999仍使用已读CAS，正文仅saved metadata／空resourceEdits／对应单命令；未保存name／money777保留、收据不自动GET且所有新增入口消失，只有显式load才恢复，最终移除目标势力行。夹具解散只移除该行，不作为成员去向／完整写集证据。

首轮工作台 **223组通过**（原218＋5），产物 `.dragon-analysis/editor-workbench/run-1yVdfW/result.json`，errors／unexpected／failed为空；固定八个输入后的第二轮仍223组通过，产物 `run-q64GJX/result.json`（同一editor-workbench目录），三类错误列表仍空且输入SHA保持。共用草稿控制器106组、shell65通过，Vue构建与逐字节复建一致。源码／最终复核及主动诊断见 `.dragon-analysis/editor-completion/chapter-role-actions-final-hashes.json`。该UI批没有新的真实登录HTTPS保存证书，后继章节页证据见下节，既有武将页真实链保持其历史范围；未改服务／Web引擎／DDL，不重建原生束或重复无影响Trial、发布和规则长链。A17／A18／A19及全目标仍未完成。

## 后继章节管理页角色真实HTTPS恢复

复用 `verify_editor_roles_browser.mjs r17 --chapter-actions`，默认武将页模式保持，新增模式直接在章节管理页执行清空军师、复任原军师16、任命自由将10为君主、指定自由将18继任及解散势力0。自有Node服务、文件SQLite／FileBucket、固定41来源安装、真实管理员登录／改密／完整复制20章、新Chromium及HTTPS；没有替换成功API回应。章节页不需要读取独立武将表，沿同一共用journal。

五步分别1→2→3→4→5→6：输入取消及最终确认取消均不保存／不读源，typed999仍用已读CAS1至5；正文只有saved metadata、空resourceEdits及单个精确chapterEdit。另表名称／money777在回应不明的当前页面保留、不夹带。每次真实服务200提交后只在浏览器端abort回应，角色区转未知且不能继续操作；重载查询原不同key得到committed2至6，累计POST恰1至5，显式load之前浏览器源GET增量均0，无重造保存。明确读回后直接恢复章节页操作，无独立武将表刷新。

每步核完整受影响章投影（gap另核，引用集合独立核后保实际顺序），其它19章、非相关源投影及直接前修订完整DTO保持。复任后的修订3与初始1除修订号完全相等；继任不解散或清旧君主所属，解散仅移除该势力、其人物／城市named所属及相应引用报告。最后保存缺口0、active缺口16，完整报告保存在收据；不是原生计数／raw同步或可玩初始化证明。旧1至5在各步边界核对，不冒解散后重新读取全部历史。

`chapter-role-http-r16.log` 在真实清空提交2后因测试错误假定重载hash为draft-editor而失败，实际为copy；没有通过收据。沿既有测试做法补明确导航及未确认操作离开提示处理，不改产品或放宽保存断言。`chapter-role-http-r17.log` **11组通过**，产物 `.dragon-analysis/editor-phase/roles-browser-r17/receipt.json` 及 `roles.png`：5个不同保存键、5次丢回应恢复，errors／outside为空，正式IDB访问0，26个测试输入SHA前后相同。

仅既有测试及文档变化，语法／diff／链接与收据核验、主动诊断见 `chapter-role-http-final-hashes.json`；不重建不变两束或重复无影响控制器、工作台夹具、规则、Trial、发布长链。未跑默认武将页模式的新轮，不将该模式历史成绩移作当前证书；自签名隔离HTTPS也不是生产TLS。A17／A18／A19及完整目标仍未闭合。

## 后继章节页普通武将槽位索引

`ChapterRolesPanel.vue` 在各章已有展开区增加普通武将索引，沿共用已读角色目录的源顺序显示槽号、姓名和字号，排除已标记reserved的G127；同名／同槽不跨章合并。显示的是 `context.draftRevision`，不是作者手填的待读取修订。列表限高滚动，不新增筛选／任命状态、字段写入或网络请求，现有数字提示和最终确认保持。

该批索引尚未提供所属／角色引用，下节已补只读展示；两批均不把索引当任官资格，资格仍由服务校验；中立定义模式／角色未知不显示，收到保存收据但未精确重读时随角色区清除，不把旧名单冒充新修订。缺少普通武将时显示空提示，不补造候选。作者可在章节管理页直接查出槽号，不必为查名字切到独立武将表。

复用 `verify_editor_workbench_browser.mjs`，**224组通过**（原223＋1），产物 `.dragon-analysis/editor-workbench/run-xjgn33/result.json`：普通槽按0／8／9／7／126原顺序显示、127排除，字号和空字显示，`<img src=x>`保持纯文本且无img／input／select／button；typed999与其它脏名称保留，展示修订仍是已读值，GET／POST计数不增加。原章节页五动作仍覆盖收据后索引消失、显式重读后恢复及原保存协议。真实Vue／gateway、新Chromium，API为明确夹具，不冒新的认证HTTPS或任官机制证书。

Vue构建／逐字节check一致，shell65、测试语法／diff／链接通过；源码、固定输入及诊断记录见 `chapter-roster-final-hashes.json`。两代码主动LSP300秒push-only未确认，两文档warning视图clean；mode=all保留两项既有实体复制JSON往返误报，不抑制。首次编辑第三处结束标签不唯一，前两处已应用；重读后定点补齐样式，再运行构建和测试，没有测试半改状态。无控制器、后台、Web引擎、原生字段、DDL或资源更改，不重建原生束或重复无影响HTTPS保存／Trial／发布／规则长链。A17／A18仍部分。

## 后继章节槽位索引的所属与角色引用

`ChapterRolesPanel.vue` 复用共用角色目录已验证的 `factionSlot`，显式null显示「無所屬」，整数保留为势力槽；若该槽不在本章公开势力列表，追加「本章未列出」，不猜成null或修复归属。另按本章已读势力顺序列出全部君主／军师引用，同将多处引用不擅自合并或挑选。没有这两种引用时显示「未見君主／軍師引用」，不是没有太守、外交官等其它任职，更不是可任官判断。G127仍不在普通索引内。

没有新增服务DTO、来源解析、筛选／候选选择、规则或保存操作；读取边界仍为 `draft.txt.checkedFactionRoles`，不在Vue重验受信字段。已有未知目录和收据后隐藏、精确重读更新、数字提示／确认及唯一journal保持。

复用工作台原225组，加一组显示断言共 **226组通过**：已读势力0与null区分，夹具同将四条君主引用全部原序显示、126军师引用准确；typed999／脏名称保留且请求计数不增。原五角色操作后分别核清空、任军师、立君主、继任的显式重读结果；解散表现夹具只删势力行而不模拟成员清理，剩余所属0明确显示未列出，不能变成无所属。原HTML文本转义、G127排除及收据后旧索引消失断言保持。实际Vue／gateway和新Chromium、显式API夹具，非新的认证HTTP或成员去向原证。

日志、最终浏览器产物、固定输入与诊断在 `.dragon-analysis/editor-completion/role-affiliation-final-hashes.json`；Vue build／逐字节check、shell65及语法／diff／链接检查通过。未改控制器／后台／web/src／DDL／资源，不重建原生束或重复无影响HTTPS保存、Trial、发布、规则长链。A17／A18仍部分，完整目标不关闭。
