# 检查点日志归档：截至批次72

> 历史快照，来自本次整理前的journal。下文“当前”“待完成”、Git状态、授权及测试结果仅属于各自记录时点，不能作为现行指令或再次操作的授权。现行交接见[checkpoint-journal.md](checkpoint-journal.md)，长期规则见[AGENTS.md](../AGENTS.md)。保留原编号、失败尝试与收据，避免压缩时丢失未提交批次的证据。

> 长期事实、架构、命令及约定见 [AGENTS.md](../AGENTS.md)；本页记录有范围的交接、调试、验证与未完成项，不代替原证或实施授权。已提交细节用 `git log -p -- docs/checkpoint-journal.md` 追溯；历史成绩不代表当前通过。旧链接锚点保留，旧方案不因此恢复。

## 当前主线与状态

| 工作线 | 当前交接 |
| --- | --- |
| 地图新批次 | §72最终回归/依赖/逐项审计已核42/42项，本地实施完成；§71真实HTTPS浏览器两创建/保存、§69同一玩家加载器装配有独立收据。本期不扩容、未部署 |
| copy收敛 | 元数据、章节、据点、武将库及发布审核已接copy；地图已接共用copy工作台；部分定义面板、旧draft控制器整体退役与表清理另待，见[任务清单](copy-simplification-tasks.md) |
| 本地后继 | §53主表初始化／整库覆盖／持久管理列表、§54删除链、§55–56阻塞弹窗已实现并做适用验证；纳入§58统一提交批次，未部署 |
| 真实数据 | 用户授权的两份本地孤儿文件已定向清除，收据见§54；这不代表头像旧copy/publish/formal、旧冻结包或生产已迁移／验收 |
| Git／生产 | §58提交前已fetch核本地HEAD与github/main均为`4191dc1`、无分叉；用户已授权本批commit/push，提交与推送结果以Git记录为准。生产仍以[存储布局§18](game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产)为入口；本轮未部署、未重启用户服务 |
| 验证边界 | 独立Vue检查可用；宿主push-only／timeout／deferred不能称clean。API夹具浏览器、隔离真实HTTPS后端和生产分别报告 |

### 未完成、阻塞与下一步

- **本地图批次**：用户授权§59计划连续实施并选择A（Web可拆片段）；B0–B6实现、浏览器及同加载器装配已覆盖，最终收据见§72与[逐项核对](system-base-map-completion-audit.md)。本期不迁移缺mapEditorAssets的旧copy；该类旧游戏画布明确拒绝，独立迁移须另授权。真实数据操作、提交/推送和部署仍需分别授权。
- **交付边界**：本地复制／检验／删除展示已验；真实生产发布、玩家整局／存档、旧头像引用迁移未验。后续按对应lane及实际来源验证，不能用合成DTO替代。
- **保留失败**：`verify_vps_publish_pack.mjs`最近记录43过1失败（`stale draft visual capture refused`）；`verify_vps_trial.mjs`长链超时；旧玩家pack harness缺检验票报`PUBLISH_VALIDATION_REQUIRED`。§53未消除这些问题。
- **旧入口缺口**：`verify_editor_backend_admin_copy`缺`MINIFLARE_MODULE`未跑；`verify_editor_backend_copy_entry`取消回执旧objects断言失败；`verify_editor_template_root --portrait-epoch-only`仍期待已退役Trial返回422而实际410；`verify_generals_conflict_model`动作清单漏`adoptFor`。先核入口适用性，不放宽来源门或重开Trial凑通过。
- **检查工具**：宿主LSP仍有未确认，独立Vue LS仅余ChaptersPanel既有TS6133提示。发布控制器测试8项完成后轮询计时器未退出：`node --test --test-force-exit tools/verify_publish_controller_slot.mjs`可得到用例收据，但不能证明计时器清理；生命周期应另测。

## 72. 基础地图最终依赖审计与分级复验

- **需求核对**：新增`system-base-map-completion-audit.md`逐项映射42要求到真实产物/测试断言，独立列生产、旧数据、支持域与未确认LSP限制，不用绿色总数冒充全覆盖。设计§7.9核旧启动链已删、ChapterRoles仍挂载、旧协议/组件有直接兼容测试消费者；本地图清理不等于整个draft退役。撤销设计/盘点中B0未闭合、创建/游戏地图未接等过时现态；copy清单地图项改为已替换工作台，完整draft退役仍未勾。
- **失败与修正**：共享上下文/定义/章节三入口首跑95测试80过15失败；git diff证明相关夹具与控制器此前未在本轮改动。核现行DTO和发布接口：据点夹具补prod/growth/defence/troops四个null字段，发布夹具改独立全局copy-slot列表及实际动作/逐游戏状态读取。未改产品门；前两入口94项重跑全过，章节继承独立13组已过。
- **最终串行回归**：本机忽略目录`.dragon-analysis/system-base-map-final-uqJeiD/`保存五个地图核心入口、copy地图/验证/单槽9项、schema sources、purge19组、distribution schema rows19组；player pack61/client50/environment37/chapters42/runtime104/mock saves36/reader77全部通过。HTTP/browser438.7秒收据在§71，随后产品源码未变。
- **工程门**：17前端测试、48变更JS/MJS＋client/shell语法通过；build→check JS978168/CSS122370/13许可；trialweb242文件，摘要`29e41cc948a0a172bc1767a06abeffd3f736adae7350f86a9d5301534375bef6`，复建unchanged。独立Vue LS31SFC通过，仅ChaptersPanel既有TS6133。主动LSP50路径0发现/11clean/39push-only未确认，modeall仍client pending/两个SFC deferred；不是全仓clean。git diff --check通过，仅换行提示。
- **交付状态**：本地未提交修改，未推送/部署/读写真实SAVE或用户profile；42项逐项证据与B0–B6出口已核，实际diff审阅完成；最终10文档287本地链接路径/8基础地图锚点通过，发现并补回§7.1历史锚点。最后追加交付索引后再次核链接/任务计数与diff。真实公共分发/reader网络准入与整局游戏未被这批加载器端口测试替代。

## 71. 浏览器创建入口与画布编辑验收补齐

- **画布交互**：真实登记模板/图集＋内存API的新Chromium context实际点击多格片段，核装饰层锁定/隐藏后拾取基底、不出现拆分；恢复后拆分撤销、删除暴露unknown、定位单格明确补底、两步撤销恢复无待保存。组合/素材擷取保存、作者地图/跨游戏隔离与宽窄视口旧用例仍通过。首跑Element Plus checkbox的隐藏原生input不可见，改点击可见label，未force/改产品皮肤。
- **真实创建**：`EDITOR_TEST_PORT=19837 ... node tools/verify_copy_http_roundtrip.mjs --browser`438.7秒通过，真实隔离HTTPS/SQLite/FileBucket、新browser context、无API拦截；新增点击完整复制/普通新建，核两份copy地图同当前模板、人物466/0，模板不变。模板/游戏保存重读、实际发布审批/玩家loader装配和负控也在同一次回放通过。非公共分发/生产部署或完整App战役。
- **检查**：两变更MJS语法及git diff --check通过，三文档37本地链接路径与36/6计数通过；主动LSP两路径0诊断但push-only均未确认，mode=all仍有pending/deferred，不称clean。本批只改测试/文档，无新产品bundle变更。
- **进度**：B4浏览器门与B7浏览器项勾选，36/42；剩余旧内部依赖清理、适用回归/负控收据复核、最终检查与逐项完成审计。未提交/推送/部署，未访问用户profile/真实存档。

## 70. 真实HTTPS后端浏览器保存与会话DTO修正

- **新增验证**：`verify_copy_http_roundtrip.mjs --browser`复用自己创建的临时SQLite/FileBucket及真实HTTPS端口19837，在新Chromium1243 context通过隔离服务登录/改密回执导入cookie。无page.route/API夹具：模板水域显隐→保存重读→游戏正文不变，再游戏水域显隐→保存重读→SQL正文变化而模板/第二游戏不变；900×700页面不溢出。完整HTTP/审批/玩家loader回放仍运行，最终318.2秒1项通过。默认自动favicon.ico的404单列为非业务缺失，console仅排除此精确URL+404，其余错误/pageerror/requestfailed均空。
- **失败与修复**：前三次停在模板首读，页面显示版本空、无业务报错。初怀疑boot忙态，尝试自动enter门未修复，已撤回该无效改动。实际原因：真实session DTO没有根级version，控制器捕获为null但判断原undefined，所有读写被current守卫跳过；比较两端统一缺省null修复，角色/对象/actorId/generation守卫不变。新增无根version单元测试核首次读取、编辑及普通render不丢输入。游戏选择label取真实own列表，不假定copy元数据改名已回写旧draft显示名。
- **检查**：17个controller/atlas/canvas用例通过，build→check JS978168/CSS122370/13许可，JS/client语法及diff通过。主动LSP三路径0诊断但全push-only未确认；mode=all含pending/deferred，非clean。本批无SFC修改，独立Vue结果仍见§68，未将旧收据冒充新检查。
- **边界与继续**：浏览器本批用管理员登录且操作已由HTTPS创建的游戏，未覆盖浏览器操作两创建入口、作者创建/全部工具；逐项复核当前BaseMapPanel/controller/store及既有对应验证后，补齐设计§7.8诊断矩阵，勾B1诊断与B4布局/核心/状态三项：34/42，仍不提前勾B4完整浏览器或B7全浏览器验收。未提交/推送/部署，未操作真实数据/profile。

## 69. 实际地图审批包与玩家加载器接缝

- **复现与修正**：copy审批revision为1.n，玩家runtimecontract仍整数门；新增pack 1.0/1.10回归先失败`PLAYER_PACK_INVALID`。只将isRevision扩为旧正整数/规范1.n，保留精确身份/SHA/命名空间门，负控0/01/1.01/负后缀/2.0/路径/超长仍拒。撤销copy任务文档“无需改格式门”旧结论，无原机制改动。
- **真实链路**：扩`verify_copy_http_roundtrip.mjs`，新临时SQLite/FileBucket+HTTPS端口19837，检验取票→实际删山纹片段/明确补底→旧票409、禁发布→重验/提交/审核。读取真实SQL发布包交生产loadPlayerPack/createPlayerEnvironment/prepareScenario，全部terrain等于编辑后编译输出且不同原图、v2道路/192据点与发布身份正确。T1/T2创建/重试/跨游戏隔离仍通过；281.0秒1项通过。
- **回归**：player_pack61、player_client50、player_environment37、player_chapters42、runtime_contract104、player_saves36（mock IDB/JSON）、reader77（新workerd目录）均通过；无真实存档/profile。trialweb核242文件摘要`29e41cc948a0a172bc1767a06abeffd3f736adae7350f86a9d5301534375bef6`。JS语法/diff通过；主动LSP三路径0诊断但push-only未确认，mode=all仍save复杂度建议/2deferred及未确认，不称全clean。
- **覆盖边界**：HTTP创建编辑审核真实；pack读取会话/静态资源用隔离端口，非公共分发桶/reader网络准入或完整玩家App战役验收。B6增量票据及同一加载器两项勾完，42项30完成12未完；B4完整交互、实际后端浏览器、旧内部状态和最终审计继续。未提交推送部署，未操作真实数据。

## 68. 游戏地图展示壳接线

- **实现**：main/Workbench/client接`createGameMapWorkbench`及显示DTO，游戏级地图页面用共用BaseMapPanel替换旧MapPanel，不显示系统首次建立。current-game选择经共同authoringContext，地图参与dirty离开保护；新会话进入仅一次读，选中游戏改变后触发进入。源、城市/章节仍来自同一copy，不进Vue。图集读取失败或未就绪时禁编辑，未自动迁移缺资源描述符的旧copy。
- **验证**：真实转换地图/四季图集+内存API的新Chromium context，管理员流程仍通过；新增作者游戏Canvas、water变更→copy保存→重读、模板/第二游戏不变、切换游戏、拒绝dirty确认后输入仍在；无console/pageerror/请求失败。首跑定位`#current-game`命中ElSelect内部只读input，被默认placeholder挡点；改点真实可见Select壳，未force点击/改产品样式。16个Node会话/画布测试通过。build→check JS978397字节/CSS122370字节/13包许可；移除旧MapPanel挂载使不使用组件从bundle退出。Vue LS31SFC通过，变更SFC零诊断，仅既有ChaptersPanel TS6133提示。
- **诊断**：主动LSP五路径零诊断但4未确认（2超时/2push-only），client.txt无LSP支持；已另跑client模块语法及独立Vue LS。mode=all仍有既有save复杂度建议和2个deferred，不称全仓clean。JS语法、diff与28/14任务计数核对通过。
- **旧入口清理续批**：CodeGraph超时后查实际引用，移除client的installMapViewer启动/身份/渲染、旧画布回调以及main/Workbench旧mapviewDTO/mapInputs桥。MapPanel子组件/mapview.txt/draft内部地图函数仍有历史验证器/混合定义依赖，未整文件删除。浏览器新增禁止请求/mapview.js断言，管理员/作者流程再次通过；16Node通过。最新build→check JS978148/CSS122370/13许可，Vue LS31SFC通过（同一既有提示）。真实临时SQLite/FileBucket+本地HTTP的verify_vps_editor_server默认/frozen两模式各12组通过，包含模块实际字节/权限/重启/登出；首次运行发现其Trial成功和55表/53索引断言过时，按现行410 TRIAL_RETIRED及57表/54索引声明修正，不恢复接口、不放宽门。
- **边界**：内存API使用真实workspace writer/compiler，不是实际HTTP鉴权/持久化或发布运行验收；旧mapview/draft内部状态尚待依赖清理。B6前两项已有实现证据，42任务28完成/14未完；不将这些结果当B6/B7完成。未提交、推送、部署或写真实数据。

## 67. 游戏地图共享编辑会话前置

- **范围**：将基礎地圖控制器/工作台明确为可复用map会话，保留旧导出；游戏会话走自己的copy读取/增量保存和图集端点，不调用管理员模板接口。新增当前游戏ID协调适配器，保留私有源、不进Vue，切换/身份版本变化dispose旧会话，首次进入只读一次。尚未接展示壳，不替换旧面板或自动迁移旧copy。
- **验证**：controller/canvas/atlas及新增游戏会话/协调器共16个Node用例通过；包括作者权限投影、payload/re-read、禁止首次建立模板、422保留输入、迟到响应/外来gameId拒绝、切换与身份版本清理。build→check同步JS1149638字节/CSS125785字节/13包许可；新Chromium context的现行管理员真实模板/图集+内存API浏览器夹具通过，无console/pageerror/请求失败。不冒充尚未接入的游戏工作台浏览器验证。
- **诊断**：主动LSP六路径初报3clean、2push-only未确认及一条嵌套三元可读性警告；已改为if/else并重跑16测试/build/check/浏览器通过。未修改SFC，不重复跑独立Vue LS；空缓存不作全仓clean证据。
- **未完**：任务仍26/42；下一步接main/Workbench/client的gameContext、展示DTO、离开保护与新地图面板，随后实际游戏编辑/发布/运行加载器验收。未提交、推送、部署或写真实数据。

## 66. 基础地图组合选取与诊断反馈

- **范围**：增加Web组合分页/整组选取与实际成员格形高亮，不解除图层锁定、隐藏层不画选框，不开放组合整体规则编辑；增加共同composer的unknown诊断分页/基底格定位与服务422问题文本，明确补底后重算，验证失败保留输入。
- **验证**：controller/atlas/canvas共12个Node用例通过，覆盖L形组合不是包围盒、选取不写源/不授权整体移动、unknown定位后显式补底、422有界文本和未知结果锁写。build→check同步shell-ui（JS1148757字节/CSS125785字节/13包许可）；独立Vue LS31个SFC通过，新面板零诊断、既有ChaptersPanel TS6133保留。
- **浏览器**：全新context的真实模板/图集+内存API夹具通过；在§65原覆盖上增加组合选取不显示移动动作、空诊断列表、导航不保存。console/pageerror/requestfailed均空。非空诊断定位/422文本目前由单元测试覆盖，不冒充真实HTTP浏览器验收。
- **素材接线续批**：片段/纯装饰组合擷取，工作区作者素材改名/未引用删除，名称表单离开保护与重读清理；真实资源浏览器增加组合擷取→保存→重读且服务共同writer/compiler验证成功。最初失败实锤旧1024总数门不容新模板2357定义；工作区单独计入2101个不可改转换配方，仍保留最多768作者素材、256格擷取与旧冻结回放1024门。新增负控验证旧门仍拒、768已满拒新增；真实转换编辑验证通过，`verify_copy_map_ops.mjs`7项通过。合成素材测试最初缺`unknownUnderlays:{}`导致结构比较失败，补齐夹具后通过，未改编辑器规则。`build_trial_web_bundle.mjs`核242文件，摘要`2f7ea2ef2ae1e3973bfb8487a6d5e2a28bbf2af29e8eb8b4ca523fc224a38afa`。
- **B6前置续批**：新增按游戏所有权读取四季图集接口，可信catalog单角色读+SHA/长度+await后归属/删除栅栏复核；普通作者可读自己copy，管理员不能借此读他人copy。`verify_game_purge.mjs`最终19组/21调用通过；旧夹具先ensure，再隔离注入可信资源描述符并恢复，非真实创建/UI验收。首次夹具未ensure返回COPY_NOT_FOUND，补正常ensure；他人管理员现行门为隐藏游戏404而非预期403，修正测试不改权限。无描述符旧copy明确拒绝，不自动迁移；旧游戏新工作台兼容仍待B6。
- **诊断边界**：首批主动LSP七路径零诊断但全未确认（1超时/6push-only）；续批十路径零诊断、4clean/6push-only未确认。最终mode=all仍有三文件未确认；独立Vue LS结果另记，不能用空缓存替代。相关JS语法与git diff --check通过（仅既有换行提示）。未称全仓clean。任务仍26/42；组合管理、完整动作浏览器覆盖、游戏工作台/运行加载器及最终审计未完。未提交/推送/部署或写真实数据。

## 65. 管理员基础地图首版画布与构建壳接线

- **范围**：新增BaseMapPanel及框架外mapcanvas/mapatlas/basemapworkbench，接main/Workbench/client管理员菜单与离开保护；四层显示锁定、真实footprint选取、逐格图集绘制、静态道路/水系小地图、装饰拆分/调序/位移/删除、明确基底填格、分页素材图样与水组显示开关。角色不具权限时无入口；模板/图片/源对象不进Vue。
- **本批验证**：controller/atlas/canvas共8个Node用例通过；实际build→check通过并同步shell-ui三产物。独立Vue LS检查31个SFC通过，新BaseMapPanel/Workbench零诊断，既有ChaptersPanel TS6133提示保留。主动LSP十路径零诊断但6clean/4未确认（1超时、3push-only），不称全部clean。
- **浏览器**：`verify_system_base_map_browser.mjs`使用真实登记源转换/图集、内存API夹具与全新Chromium context，检查首次建立、真实Canvas非空像素、水组切换/撤销/保存重读的像素复现、图集不重复加载、900×700页面不溢出、作者直接hash不请求模板。console/pageerror/请求失败均空。复用已安装playwright-core和chromium-1243显式路径，不安装依赖、不使用实际profile；API夹具不是后端鉴权或生产验收。
- **失败记录**：首轮SFC导入option/table-column不存在的独立入口，改由select/table模块再导出后构建通过；Canvas合成夹具补齐现行定义身份与拆分原子后通过。浏览器首次默认请求未安装的1248浏览器，改用已有1243；分页size选择器使定位器匹配两项，改直接子项。纹理复现初比较混入随布局变化的视口边框，改全图定位并明确排除2px指示边框后复现通过，不修改地图像素生成器。
- **未完**：B4组合选取/管理、诊断定位与完整动作浏览器覆盖，B6游戏工作台/实际运行链和B7最终审计；目前42项26完成16未完。未提交、推送、部署或操作真实数据。

## 64. 基础地图统一创建接线与真实HTTPS验证

- **范围**：同一连续任务；AdminFullCopy两种入口均注入系统capture，首个await前取得一次独立模板快照。当前copy由实例化结果seed，取消minimal再读full补城市；旧capture/profile/baseline/proof保持历史身份。已提交重试返回原收据，失败执行不安装可见游戏。无自动旧copy/publish/formal迁移、无生产/真实存档操作或提交推送。
- **真实验证**：`EDITOR_TEST_PORT=19837 node tools/verify_copy_http_roundtrip.mjs`使用新临时SQLite/FileBucket、真实本地HTTPS与随机凭据，最终359.7秒1过0失败。两入口缺模板均409且content_games/game_copies零行；首次建立T1→完整复制A/普通新建B地图完全一致→HTTP删除山纹片并显式补底保存T2→C采用T2；A/B保持T1，T2后两入口重试仍返回原收据，编辑A不影响B或模板。该链还通过copy检验、提交、审核与真实包准备，不等于浏览器/玩家加载器验收。
- **失败与修复**：首次负控名称超现有长度限（422）改为合规短名；随后真实minimal含未完成人物的空白章，被完整运行编译误拒。现在认证minimal保持草稿结构验证，模板本身仍完整编译；full继续完整20章编译，未放宽发布门。纯函数空章测试不足以覆盖实际创建，此次真实HTTP发现并闭合。
- **其它验证**：`verify_author_create.mjs`18项、`verify_copy_abandon.mjs`14项、`verify_system_base_map_instantiation.mjs`11类检查通过。前两旧reserve夹具缺GameCopyStore现行构造埠导致首次失败，补充明确抛错的unused端口，不伪造成功行为。六变更JS/MJS语法、diff检查通过；主动LSP六路径0诊断但全push-only/inconclusive，mode=all空缓存，非clean。未改Vue/玩家引擎，不跑本批无关build/浏览器/规则回归。
- **B4前置续批**：管理员四季图集GET已接可信来源捕获和模板描述符，逐byte长度/SHA复核，不给客户端任意路径。`verify_game_purge.mjs`重跑18组通过（新增四季字节与作者/非法查询拒绝），同时保留删游戏不动模板和编辑保存负控；尚未新增工作台UI，不因此勾选B4。
- **B2显示前置续批**：新增`verify_system_base_map_minimap.mjs`真实登记源→转换模板→共用显示composer/像素生成；208×139与250×167逐byte保持原源结果，水组关闭不改terrain/geography且3092/3703静态道路像素保持，同seed确定/换seed只改纹理；禁用Math.random/Date.now仍通过，全隐藏只露null未知底、不修改输入。这是显示像素测试，不代替Canvas/浏览器验收，B2该项仍未勾。后继atlas两文件及该新测试主动LSP仍push-only未确认。
- **B4控制器前置**：新增`editor-ui/src/basemap.js`，私有模板/编辑队列不进入Vue投影，提供明确读取/首次建立、128条且16KiB的暂存上限、撤销、保存重读及离开保护；422保留可编辑输入，未知写结果或成功后重读失败锁重放，身份切换拒迟到回包。`node --test editor-ui/tests/basemap.test.mjs`5组通过。已接`web/src/editor/mapcommands.js`共同预览分派，服务端与浏览器复用组合引用维护；身份ledger/鉴权仍由copyprofile掌握，预览不是写入许可。`verify_copy_map_ops.mjs`7组通过，新增合法14类命令逐步比对浏览器预览与受权writer完整输出；首轮新夹具错用`captured`variant失败，按capture实际输出`original`更正后通过，未修改配方门。控制器5组重跑通过，Trial束重建检查unchanged。尚未接绘制、菜单或Vue组件，不称工作台已交付。
- **任务状态**：42项完成24项、18项未完；B3/B5已由实际存储/HTTP覆盖。B1诊断、B2小地图Canvas/纹理、B4管理员工作台、B6游戏工作台/实际运行加载器与B7最终覆盖仍未完，不能标记目标完成。

## 63. 基础地图应用装配、固定schema与删除隔离

- **范围**：同一已授权连续任务，未提交/推送/部署；仅隔离临时SQLite/FileBucket及workerd状态，无真实游戏/用户存档写入。42项完成16项、26项未完。
- **实现**：EditorApp装配SystemBaseMapStore，管理员GET `/api/admin/base-map`、POST `/api/admin/base-map/initialize`；已登记源捕获/38资源SHA/共同编译后才首次写入。重复初始化返回已有模板；不接收客户端路径或大JSON、不放宽16KiB请求上限。后继已接POST save（1–128条、有界请求），完整编译通过才保存；共用mapworkspace维护拆片/删除组引用，游戏copy亦复用。创建接线和UI未完成。
- **schema**：新systembasemapdeclarations追加独立单槽声明，旧baseline未重算；definitions/columns/inventory同步，未加入游戏清理范围、无新外键/索引。源校验25 owners/57 tables/54 indexes/373 columns/4 FK通过；实际workerd `verify_distribution_schema.mjs --rows`19组通过，含新系统表缺失/附加列拒绝。
- **隔离实证**：`verify_game_purge.mjs`真实gateway/auth/SQLite/FileBucket建立实际模板，普通作者与缺CSRF写请求拒绝、重复initialize摘要相同；实际删游戏35表零行后模板完整正文/摘要/版本仍相同。最终共17组通过，另覆盖HTTP拆片引用维护、删除暴露unknown以422拒绝且旧摘要不变、同批显式补底后plane改变/roads不变、重进保留编辑。分发桶为内存埠，不等于生产TCP/TLS或真实R2。独立store回归13项、copy map/single-slot7项通过（含混合层组删除引用保留据点）。
- **失败与修复**：首次HTTP初始化遇Uint8Array.toString不是UTF-8文本，修复可信读适配为Buffer后通过，未放宽源检查。workerd旧夹具保留退休前55/53/369、50及48唯一键断言，按实际固定声明核为57/54/373、49唯一键（45显式+3分发+1检验）/48覆盖索引；门本身未放宽，故障注入仍拒绝。
- **验证边界**：11个服务/测试文件语法、diff通过；主动LSP初批11路径及后继7路径均零诊断但全部push-only/inconclusive，mode=all无缓存，不称clean。未改Vue/玩家引擎，未跑产品build/浏览器或无关规则回归。有界编辑保存已验证；继续两种创建入口的单模板快照接线及B1剩余诊断覆盖。

## 62. 基础地图快照实例化与单槽存储核心

- 范围：沿用户连续推进授权；新增`instantiateSystemBaseMap`、`SystemBaseMapStore`和两份独立验证入口。详细合同维护在[设计§7.3–7.4](system-base-map-design.md#73-单快照实例化与历史来源边界纯函数已验证服务未接)，不改旧固定profile/manifest/指纹。
- 实例化：真实源minimal/full地图等价、全20章和人物保留、T1→A/B及T2真实删片/补底→C隔离、城市名投影、局部city ID/运行槽重绑、不兼容章节拒绝均通过。T1摘要仍`6a1c0b0666f012558829d0688cdf2cb60ffef009fdde3b38643e1574ab9febd9`，测试T2为`6178e6a1bfd060381b06a219c26b636241ba3bddf07bdb4fa6fc2ef16e615c4b`。
- 存储：新临时目录真实SQLite验证管理员限制、await后鉴权失效、缺模板拒绝、无效保存/注入回滚保留原内容、可信资源/转换来源保护、重开不重导、迟到initialize不覆盖编辑、摘要损坏拒绝；清理仅测试自己目录。
- 验证：`verify_system_base_map_instantiation.mjs`、`verify_system_base_map_store.mjs`通过；合并运行store+conversion在总180秒超时（store已输出通过，conversion未结论），确认无残留测试进程后单独用360秒预算重跑`verify_system_base_map_conversion.mjs`通过。四变更JS/MJS语法与diff检查通过。主动LSP四文件0诊断但全push-only/inconclusive，mode=all无缓存，非clean。
- 边界：B1新增三项有合同/测试证据，任务13完成/29未完。独立store未装入EditorApp，未更新旧schema inventory，未有HTTP/创建入口接线；不能当B3/B5整批完成。未改Vue/web引擎，未跑产品构建/浏览器或无关游戏回归；未提交、推送、部署或操作真实数据。

## 61. 基础地图A方案分片与独立候选转换

- **授权/边界**：用户明确选择A，解除§60末的历史阻塞。Web可拆片段不宣称原版山脉/城墙对象身份，不改变原规则权限；继续实施授权仍有效，不包含真实数据/提交/推送/部署。
- **B0出口**：新增`system_base_map_pieces.mjs`及其验证入口，69,786非水格→4,081组/5,506片/2,101定义，2,962片多格，最大255格；四类最大组PNG已直接审阅。审计r8/r9八正式产物逐字节相同，全部成员/byte/四连通/≤256/单格网、输入不变及负控通过。详细策略见盘点§4.3。
- **候选合同/转换**：`server/systembasemap.js`提供独立schema/profile、完整共同编译及据点初值/选择引用/资源描述符检查；`system_base_map_conversion.mjs`把规划物化为真实多格实例，修正unknown覆盖引用，保留逐格来源，且独立复制可变数据。CLI `convert_system_base_map.mjs`显式登记修订+新目录，产出template/mapping/receipt，不建库、不注册生效模板。合同见设计§7.2。
- **真实验证**：`verify_system_base_map_pieces.mjs`及`verify_system_base_map_conversion.mjs`通过。全共同编译输出与登记源深等，含原地形/水域/小地图/道路mask、完整roadGraph、辅助成本/偏移；另带真实20章编译核邻接/坐标。JSON往返、共同编辑核心拆分、删除暴露unknown拒绝、明确填byte16后真实规则平面修改/重编及源不变通过；缺引用/重复组/缺主表初值/缺资源/缺兼容资产/禁止人物章节状态/扩容/越界/未知配方负控通过。初跑未知配方已正确拒绝，但测试误匹配`recipe`字样；改为实际`UNSUPPORTED_RULE_BINDING`后重跑通过，未放宽编译器。
- **隔离产物**：`.dragon-analysis/system-base-map-conversion-r3/`与r4三产物逐字节相同；候选摘要`6a1c0b0666f012558829d0688cdf2cb60ffef009fdde3b38643e1574ab9febd9`，地形SHA仍`740708c27a89db0a7f82865be623b5732099ec97aabf399e7dbde1450c87c861`。重复输出EEXIST拒绝且旧文件不变，非登记输入拒绝且无输出。先前r1/r2为同数据但较早验证器工具SHA的收据，最终以r3/r4为准。
- **检查/限制**：7个JS/MJS语法检查、diff、5份文档77个本地链接路径及任务10/32计数通过；最终主动LSP 0诊断但7个push-only/inconclusive，不称clean；mode=all无缓存。无web/src、Vue或运行资源改动，未跑壳build、玩家回归或浏览器；离线PNG不是产品交互验收。资源描述符验证不等于存储层真实资源存在证明，服务须沿用可信来源绑定。
- **编辑能力续验**：共同picker按多格footprint命中；共同拆分/平移/调序/删除/明确补底/捕获素材/再放置及选择组引用调整通过，六种编辑后模板均真实JSON往返再编译相等。水域显隐只改minimapGeography、不改terrain/geography/roadMask，恢复开关后字节相同；仍未作小地图纹理/Canvas视觉验收。平移样例初选大块在±16格内无全山纹落点，测试正确停止；改选≤8格多格样例，仍从真实地图寻找全山纹目标，没有放宽产品边界。越界平移明确拒绝。
- **未完**：42项中10项完成（B0五项、B1结构一项、B2转换/映射/保真/核心编辑四项），32项未完。B1来源/初始化接线、B2小地图纹理视觉验收、B3–B7仍继续；没有系统表/服务/菜单、没有改变创建入口或真实数据。

## 60. 基础地图B0源盘点（历史，后继见§61）

- **授权/命名**：用户明确“这个模块放在管理员组里，名称叫基础地图。按你思路开始下一步”；已更新设计、任务和memory，繁体界面使用“基礎地圖”。没有为未实现功能先挂空入口。
- **产物**：新增`tools/audit_system_base_map.mjs`与[盘点详细源](system-base-map-inventory.md)。工具只读当前登记源，写全新隔离轮次；产出完整逐格归属、256图样计数、道路/水域/据点清单与8个离线局部样本，不写模板或真实数据库。
- **结果**：38资源/共同编译核验通过；98,304格无缺失/重叠、unknown归属相符；254路/5,526点逐点一致，192城坐标/槽一致；水域161组覆盖23,716格（含916个道路底部显示格）。69,786个非水装饰尚未语义分组；B0不能因全格归属已满而勾完。
- **失败与修正**：首跑将水域所有member错误要求为带waterClass的装饰，遇道路成员断言失败；核既存作者组构造与composer后，正确区分道路member和baseCells双引用，未改源/未放宽compiler。首个成功r1后补充非水样本，最终r2/r3五产物逐字节一致；重复输出目录与非法轮次负控均拒绝。
- **验证限制**：语法及diff通过；主动LSP 0诊断但push-only/inconclusive，mode=all无可用缓存，不称clean。未修改产品UI/运行代码，未跑无关构建、浏览器或游戏回归；离线页不是浏览器验收、模板转换或完整语义分组证据。
- **非水候选续批**：用户要求继续后，工具新增全量候选JSON及离线展开页；69,786格分成地面/岸线1,120片、山纹1,201片、田纹1,293片、建筑467片，均为四邻接待审片而非正式组件。建筑1,352格邻近据点、134格分10片较远区域；PNG局部抽查可见墙段/城池构图，但不按距离认定归属。详细成员与限制见[盘点§4.1](system-base-map-inventory.md#41-非水候选全量清单r4r5)。r4/r5七产物逐字节一致、独立成员去重/四连通/归属检查及语法通过；LSP仍push-only/inconclusive，未验浏览器或产品UI。
- **连续推进续批**：按用户要求继续到192据点跨层检查，102种检查窗字节/层签名覆盖全部据点；1,348个建筑装饰落在5×5检查窗，另4格位于邻近候选但窗外。直接PNG核city-031/068/072可见关口墙段越窗，排除统一5×5即正式城组件的做法。r6/r7七工具产物确定性一致；独立Python重核69,786候选格四连通/去重/归属及192检查窗坐标/归属通过，JS语法、diff、四份变更文档本地链接路径通过；本次LSP仍为0诊断但push-only/inconclusive，mode=all无缓存，不称clean。无产品行为改动，未跑产品构建/浏览器/游戏回归。B1独立前置审计已回流设计§7.1，覆盖旧profile、创建事务、copy命令、素材上限、跨层水组及编译/审核接缝，不改旧来源门。
- **历史阻塞/交接（已由§61用户选A解除）**：当时42项中3项完成；原数据不唯一规定默认创作对象边界，现设计又不允许直接把自动连通当正式分组。需选择盘点§4.2建议A（可拆Web编辑片段）或B（逐对象人工确认）；不以此宣称原机制未知、也不把候选覆盖当B0已完成。选定后继续B0正式片段→B1/B2。未建系统表/服务/菜单、未改变创建入口、未提交/推送/部署、未访问SAVE/profile。

## 59. 系统基础地图独立化设计与任务

- **用户裁决**：旧地图页面全部作废重设计；内置地图全元素可编辑转换只做一次，独立保存为系统基础地图模板，由管理员专属模块维护。普通新建和管理员完整复制调用同一地图初始化方法；创建后各游戏独立，模板更新只影响后续创建。本期固定内置范围、不扩容；后期独立增加地图扩展。
- **只读核对**：当前`admincopy → createPinnedCopyLoader → copyBuiltinGame`已有full/minimal共用map复制，但仍取固定内置源。实际源为256单格atomic-original定义、92586装饰、254路/5526路图块、192据点和161水域组；不是完整元素化创作转换。
- **产物**：[设计](system-base-map-design.md)为详细维护源，[B0–B7任务](system-base-map-tasks.md)按元素盘点→数据合同→转换/持久化→管理员模板工作台→统一创建→游戏地图→验收排列。同步产品/工程合同、术语、memory及copy旧计划入口，标明旧方案替代范围。
- **检查/边界**：8份变更文档的267条本地链接路径存在，新引用目标标题已核；新增文档格式及diff检查通过，42项实现任务均未勾选。只改文档，未生成模板、改产品代码、迁移真实数据或部署；纯文档未跑LSP/构建/游戏/浏览器回归。下一步B0，不复用历史回归称本批通过。
- **补齐上批Git事实**：本轮恢复上下文时本地HEAD为`0541fff`，reflog有github/main的`update by push`，工作区当时干净；未联网复核远端，不把推送记作部署。

## 58. 全量工作区审查与统一提交

- **范围**：用户明确授权审查全部修改与未跟踪文件、创建一个完整提交并推送。纳入产品代码、8份回归测试、构建壳及必要合同／任务／交接文档，共33文件；本批没有新增持久化迁移脚本，不自动迁移旧副本。
- **排除**：本地`.pi`配置、CodeGraph索引、依赖、`.dragon-analysis`运行数据及临时测试日志不纳入提交；不部署、不重启用户服务、不再次操作真实游戏数据。
- **本轮复验**：13个明确指定入口共58项通过（含删除15组、回收10组和发布服务18项内部断言）；真实隔离HTTPS新建／复制／导入／审批链1项通过。两套全新浏览器测试通过，build `--check`确认JS/CSS及13包许可产物一致；独立Vue LS正控和30SFC检查通过，变更组件零诊断。
- **检查限制**：宿主21路径主动LSP均未确认（push-only／timeout），`mode=all`仍5个Vue文件deferred，不宣称clean；独立Vue检查保留ChaptersPanel既有提示。首页旧入口失败、发布轮询计时器及生产验证缺口未被本次消除。全部变更JS/MJS及控制器／构建TXT语法、33文件精确暂存清单、暂存diff检查通过；未发现私钥或常见凭据模式，本地代理／运行产物未入暂存。一次忽略目录状态扫描超时留下空index.lock，确认无Git进程后移除残留锁，随后暂存成功。

## 57. 本轮 project memory／journal 整理

- **范围**：仅`AGENTS.md`与本页；保留代码、测试、生成物、用户数据及仓外全局约定。本次不运行无关游戏／浏览器回归，不提交／推送。
- **整理**：长期规则留memory／模块维护源；本页保留§53–56产物、根因、失败、验证边界与§54授权清理收据。已提交批次压为索引，去掉重复构建字节、临时运行信息及被新方案替代的详细步骤。
- **纠正**：不再把§47–50写成待实施；本地残留清理已完成，撤销首页“未操作真实数据”的过时总括。区分本地缓存远端指针与在线远端状态，不把历史commit授权延伸到本轮。
- **检查通过**：57条本地链接／目标锚点有效，原54个标题／兼容锚点全部保留，2962份非目标文件SHA及路径集合不变，diff检查通过；journal体积约减49%。纯文档不跑无关LSP、构建或游戏／浏览器回归。未解决项集中列出，不重复散落为多个“当前阻塞”。

## 56. 检验窗口沿用阻塞弹窗布局

- `PublishPanel.vue`共用检验／提交弹窗缩窄、加高、居中；四圆点位于内容上方，删除底部说明及无消费者计时器。保留检验层、长明细内部滚动、通过自动关闭和失败关闭入口；展示事件通知`Workbench.vue`抑制重复全局动画，不改busy、票据或协议。
- 扩展`tools/verify_editor_panel_visibility_browser.mjs`：新隔离Chromium＋构建壳／控制器＋内存API，覆盖3视口、Esc／遮罩阻塞、20条错误滚动、失败停动画、成功自动关闭及关闭后普通刷新恢复全局Loading；既有复制／删除／显隐／分页回归通过，console/pageerror/意外请求0。
- 发布控制器8/8通过；首次直接node执行后因轮询计时器超时，改测试runner加`--test-force-exit`取收据，限制见“未完成”。build/check同字节；独立Vue LS正控及30SFC通过，本次组件零诊断，宿主3路径未确认。
- 本地服务返回的shell-ui.js/css曾核200且SHA匹配当前产物；这是资源核对，不是生产或真实检验端到端验收。未操作真实数据／部署。

## 55. 完整复制阻塞弹窗布局调整

- `CopyGamePanel.vue`去底部说明、缩窄加高居中，四圆点置弹窗内文字上方；`Workbench.vue`不重复显示背景Loading，保留请求计数／busy及复制协议。执行中无关闭按钮、Esc／遮罩不退出，失败保留原因与确认按钮。现行细则见[布局规范§3](editor-ui-layout-spec.md#3-加载反馈)。
- 同一永久浏览器入口覆盖宽／中／窄屏、局部动画位置、说明移除、阻塞与失败确认；build/check及独立Vue检查通过，宿主仍未确认。没有为验证创建真实游戏，未重启用户实例。

## 54. 删除弹窗就地进度与文件清理先于库行删除

- **根因**：开发入口未装配回收器；旧HTTP先删库后回收，失败pending时管理行已消失。前端又误拒成功回执`pointer: removed`／`privateObjects`。截图只作线索，不能凭图确定具体服务端错误。
- **实现**：`server/gamepurge.js`复用check核身份／归属／fence／名称／修订／下架；`server/editorapp.js`先核权→移除目录指针／清空专属文件→交易内复核并删库。缺回收器或回收失败503，保留fence及管理入口重试。`vps/game-reclaimer.mjs`抽出共用私有回收，`tools/dev_editor.mjs`接实际私有桶；正式装配仍清分发与私有两桶。详细合同：[存储布局§11.1](game-storage-layout.md#111-本轮实际做了什么)。
- **展示**：`ReviewPanel.vue`／`server/public/review.txt`就地更新栅栏、清文件、重读及结果；动作和全部请求走progress，无Loading。第4项改“遊戲檔案與公開入口”，失败显示原因，只有确认全部清理才显示完成。
- **验证**：控制器10项、Loading6项、reclaim10组、publication-server18项通过。`verify_game_purge.mjs`15组使用真实隔离SQLite/FileBucket＋内存分发桶：缺回收器拒绝、实际删一文件后故障仍保留库行／fence／管理行、重试清空前缀、35表零行、私有单桶幂等；其他游戏／installed／共享程序／画像不动。不含真实生产分发或账本退役验证。
- 新隔离浏览器阻住fence／purge／重读逐阶段核无全局Loading，最终四组完成；build/check、独立Vue及语法／diff通过，宿主9路径未确认。实现阶段没有操作真实数据，后续授权操作如下。

### §54 后续：用户确认本地测试，定向清除历史残留

- 用户确认本地并授权清除全部剩余残留；定位实际状态`.dragon-analysis/dev`，只读SQLite及专属源索引SHA／长度／源gameId／metadata，不按名称盲删。
- `dc7dc520-ab20-46d3-a29c-cdee91eecb55`（截图「臥龍傳·重構版」）：36张含game_id表0引用，复用`reclaimPrivateGame`清49文件／47,983,946字节；目标目录消失，其余568个桶文件SHA不变。
- `7e0b9428-3419-45c2-ae21-e0b62aa7f6d0`（另一旧副本）：再次核0引用后清49文件／47,983,954字节。合计98文件／95,967,900字节；私有目录`private/private/`在复查时已空，保留519个桶文件SHA不变。
- 未写数据库、未删共享installed、未访问线上或真实SAVE、未主动重启用户进程。运行实例及资源字节已核，但不冒充另一次真实游戏删除验收；本收据也不是持续保证该目录永远为空。

## 53. copy主表初始化、内置武将覆盖与持久管理员列表

- **授权／产物**：用户批准本地P1–P8，任务见[清单](copy-initialization-tasks.md)。`server/copygenerals.js`＋`admincopy.js`／`gamecopy.js`：新建事务安装copy，普通新建192据点完整父表／空武将库，完整复制按章序槽序首名优先形成466名／2540槽关联；冻结baseline/profile不改。主表按稳定ID跨章投影，丢失引用留发布门。
- `editorapp.js`／`server/public/draft.txt`／`GeneralsPanel.vue`：内置来源验证后单事务整库覆盖，确认→单次POST→重读，不扫描目标章、不再64条追加，失败不动旧库。
- `gamecopy.js`／`review.txt`／`ReviewPanel.vue`／`Workbench.vue`：全局管理按gameId保留提交过申请的游戏；通过／驳回不丢删除入口，编辑／校验不解锁审核，状态与listed独立；默认分页／固定表头。删除后继以§54为准。
- **规则／服务验证**：聚焦29项、关联27项通过；覆盖真实固定源首名优先、0/255头像、稳定ID、跨游戏隔离、缺失引用、章级覆盖拒绝及触发器注入写失败回滚。`verify_copy_http_roundtrip.mjs`独立临时SQLite/FileBucket＋真实HTTPS＋已登记源，完成复制立即读copy→覆盖重读→prepare／审批1.0→管理行保留／重复审核拒绝；普通新建后导入466名不改另一游戏。
- **展示／检查**：两份永久浏览器入口使用构建壳／内存API／真实PNG，确认单次导入、分页／列宽／相册／隐藏输入、据点及跨游戏管理通过；build/check、独立Vue、语法／diff通过。宿主LSP未确认，旧入口失败见“未完成”；没有真实数据迁移或生产验收。

## 已提交批次摘要

以下只保留原因、决策与兼容引用。§47–51纳入本地提交`4191dc1`，§39–45纳入`df8b35a`，§36–38纳入`34bf1c1`；细节查Git，不把历史通过／失败套作今日结果。

## 52. 全量工作区审查与统一提交批次

- 审查全部改动与未跟踪文件、画像重命名逐字节核验、链接及产物一致性；用户当批授权commit/push，当前本地记录为`4191dc1`。旧验证中的pack43/44失败仍保留，不以推送代替部署；本轮未联网复核远端。

## 51. project memory 与会话日志整理

- 上次文档职责拆分及旧锚点保留；修过手工压缩漏连字符的问题。当前整理以§57为准。

## 50. copy头像目录跳过无用旧草稿使用统计

- `?usage=0`跳过copy未消费的旧draft使用统计，保留无查询旧接口inUse、鉴权／epoch／SHA与删除栅栏；不读取PNG。34项及真实PNG夹具浏览器当批通过；现行合同见[轻量目录](editor-general-definitions.md#copy头像目录轻量读取现行)。

## 49. 共享头像文件及资产ID数字重编号

- 用户批准`p0001..p0471 → 150..620`，621图字节不变、255按普通资源、ID>255走portraitKey而非byte；不改DOS FF或冻结身份。清单／运行时／武将／发布适用回归通过，pack／旧Trial／玩家harness缺口集中见“未完成”。旧持久化及生产未自动迁移，见[画像合同](re-notes-portrait-reader.md#现行web准入与原证边界)。

## 48. 头像弹窗等尺寸加载、分页／按钮右对齐与数字排序

- 固定外框、网格内部滚动、数值排序与分页／按钮右对齐；改名风险的“待确认”已由§49批准实施取代。细则见[布局规范§6](editor-ui-layout-spec.md#6-头像选择弹窗)。

## 47. 武将管理加载性能、真实进度、固定列宽与局部头像加载

- 隐藏重型表单随busy重渲染导致慢，改内部按active挂载并保留输入；本机合成负载DOM由47867降至2499，不是生产SLA。全局／局部／progress分流、固定列及相册局部Loading落地；当时64批追加导入已被§53原子覆盖取代。

## 46. 编辑器展示修补与 Vue 检查工具本地提交

- `df8b35a`纳入§39–45及工具／产物／文档；仓外全局AGENTS不在本仓库提交中。

## 45. 项目级 Vue LSP standalone 兼容工具（2026-11-12）

- Vue LS3等待本机未接通的TS桥，改项目私有standalone并用TS2322正控／修正证明诊断通路。父目录解析到配置不等于launcher生效；从editor-ui新会话核验。安装与回退见[工具说明](../editor-ui/lsp/README.md)，宿主未确认与独立检查分开报告。

## 44. 武将／据点统一分页与操作列、头像每页 25 张（2026-11-12）

- 共用Pagination／RowActions落地；Teleport不继承父scoped属性曾使resize失效。撤销悬浮操作列、蓝色保存与一次挂全部头像，现行规则在memory／布局规范。

## 43. 武将管理固定表头、行编辑与懒加载核查（2026-11-12）

- 修空库不能导入、空能力被控件挂载补0；新增永久武将浏览器入口。后续展示及导入合同以§44／53为准。

## 42. 据点面板跨模块残留回归修复（2026-11-12）

- 局部display:flex覆盖hidden，改`:not([hidden])`；新增空态／192据点后遍历11模块的浏览器回归。单面板隐藏再显示不足以发现跨模块残留。

## 41. 编辑器统一页中央四圆点加载动画（2026-11-12）

- 共用请求计数在响应正文消费完后finally清理；并发／失败回归入口`verify_editor_loading.mjs`。一律全局遮罩已被局部／阻塞弹窗例外替代。

## 40. 城池据点加载按钮旋转动画（2026-11-12）

- 按钮转圈／等待文字已撤销，不是现行待办。

## 39. 城池据点列表固定表头（2026-11-12）

- 默认ElTable限定高度配合局部flex；引入的跨模块残留由§42修复。

## 38. 完整本地提交前审查：copy／发布审核／默认展示层与回归

- `34bf1c1`含copy发布审核、删除及默认展示；修approve名称登记误用管理员、copy map漏componentDefinitions。历史302项中7失败并非全绿，后续改过部分夹具，今日状态须重核，不能复用旧数字放行。

## 37. 前端架构决策：编辑器采用 Element Plus 默认主题与组件

- **tag: architecture；accepted，用户批准的Web决定，非原版机制。** 深绿自造主题、原生表格与部分EP／玩家样式混用导致重复覆盖维护；全自造和“EP＋自定义皮肤”均未选。
- 统一EP默认主题／组件／控件／size，接受默认外观及DOM／事件适配成本，减少重复实现；不额外引入UI／图标库。仅编辑器展示层，CSS只布局，不改变玩家Canvas／共同核心／规则／存档。
- 长期规则见[全局约定§2.3](../../AGENTS.md#23-渲染与状态原则)、[memory§3](../AGENTS.md#3-展示交互与文档职责)、[布局规范](editor-ui-layout-spec.md)；旧34px／原生table皮肤已撤销，架构获批不等于业务全链验收。

## 36. Element Plus 默认主题与默认组件迁移（本轮）

- 展示迁默认组件、补CSS、移除玩家style link；细节见[迁移记录](../editor-ui/element-plus-migration.md)。裸组件、check不生成包、ESM缓存、事件传值及有效空字符串等坑已回流memory；`--no-library`只验壳，不放宽真实库准入。

## 14. 批次 J：同意上架 422 SOURCE_RUNTIME_BINDING＋审核页重复提示（2026-11-11）

- 修copy批准误走旧rootKey capture，保来源／SHA／新鲜度门；真实prepare补旧approve注入桩盲区。

## 15. 批次 J-2：同意成功却无反馈＋上架管理仍待审核（2026-11-11）

- 透传成功反馈，approve同事务写listed=1，修formal已写但目录不可见；后续管理行保留见§53。

## 34. 编辑副本简化收尾：删除重试打通＋冻结基线对齐＋上架章门恢复（2026-11-11）

- 栅栏幂等重试、章引用门及冻结声明同步；WAL裸拷、只check未build、回执只认修订+1的教训已回流memory。现行删除顺序由§54取代，历史详情见[任务清单](copy-simplification-tasks.md#7-2026-11-11-补记删除失败冻结基线对齐上架章门恢复)。

## 35. 游戏级武将管理重写：父表库行编辑＋自杀旗＋头像相册（2026-11-11）

- 父表六能力0..15、自杀bit4、zi只存及头像DTO落地。旧整批正文触HTTPS16KiB/413后曾改64批；该导入现由§53空载荷／服务端原子覆盖取代，不恢复旧方案。

## 归档索引与兼容锚点

无法恢复的旧收据见[缺口索引](historical-receipts.md)，不把索引当原证。旧文档裸§4.x／§45–47.4可能属于更早编号；旧LRU原型跳过blob／epoch校验已回退，不是已交付优化。

<!-- markdownlint-disable MD033 -->
<a id="5-当前时钟系统逆向与重构本地完成"></a>
<a id="8-用户指定五档提速"></a>
时钟／提速：[战略时序](re-notes-strategic-time.md)。

<a id="6-发布主线阻塞与下一步"></a>
旧发布阻塞见本文「当前主线与状态」，不复活旧待办。

<a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a>
<a id="9-battle-text-reflow-1战术双方对白自动折行"></a>
<a id="10-014发布整理"></a>
<a id="10-录像反馈后的战略性能修复"></a>
<a id="10-录像反馈后的战略性能修复--10-014-发布整理"></a>
表现／对白／性能：[表现合同](presentation-modernization.md)、[战术生命周期](re-notes-tactical-lifecycle.md)。

<a id="11-015发布整理"></a>
<a id="11-编辑器vps部署前只读盘点"></a>
<a id="11-编辑器vps部署前只读盘点--11-015-发布整理"></a>
<a id="12-受限编辑器容器部署"></a>
<a id="13-固定库刷新与私有trial接续"></a>
<a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署／固定库／Trial：[VPS就绪历史](vps-editor-readiness.md)、[私有字节合同](editor-backend-private-byte-context.md)；现行生产见存储布局§18，Trial已退役。

<a id="19-后台框架壳editor-ui-1"></a>
<a id="20-账户管理组件化editor-ui-2"></a>
<a id="21-草稿与章节组件化editor-ui-3"></a>
<a id="22-阶段任务与结构展示editor-ui-4"></a>
<a id="23-只读素材库组件化editor-ui-5"></a>
<a id="19–23-后台框架壳--账户管理--阶段任务--只读素材库--草稿与章节组件化"></a>
<a id="30-上架限制与删除追踪组件化editor-ui-12"></a>
<a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a>
<a id="33-后台迁移提交推送与受限上线"></a>
<a id="30-上架限制与删除追踪组件化--32-固定库身份合同授权修复--33-后台迁移提交推送与受限上线"></a>
早期Vue壳／上线：[框架壳合同](editor-framework-shell.md)、[迁移清单](editor-ui-migration-checklist.md)、[早期审计](editor-ui-final-audit.md)；默认组件决策见§37。
<!-- markdownlint-enable MD033 -->
