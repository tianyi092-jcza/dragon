# 后台展示层迁移（EDITOR-UI-1至14）

## 授权与范围

用户提出后台登录／个人资料／改密／菜单不应上下堆叠，允许采用轻量框架，游戏有关部分保留原技术；随后明确批准按该规划开始实施。选用 **Vue 3＋Element Plus**，这是Web展示层决定，不是原版机制变更。

首批完成后台外壳与账户页；第二批将创作者账户管理迁为Vue表格／表单；用户随后明确要求使用`/goal`持续推进，第三批迁移游戏／章节草稿及只读当前草稿栏。完整范围与逐项状态见[迁移验收清单](editor-ui-migration-checklist.md)。现有后台页面已逐页组件化，**共同审计及获追加授权的阶段结构GET修复均已完成，但不是完整编辑器产品已完成**。既有地图／据点／武将／草稿／发布／删除能力及准入限制不变。迁移实施期间没有生产操作；用户后继另行授权的提交、推送与受限部署见[journal §33](checkpoint-journal.md#33-后台迁移提交推送与受限上线)。

## 文件与所有权

- `editor-ui/src/Workbench.vue`：侧栏工作台、账户菜单、登出快捷入口与页面装配。`LoginPage.vue`、`AccountPages.vue`分别承载登录及个人资料／改密，保留原生表单的FormData／reset接口，密码不进入响应式树。
- `editor-ui/src/AccountsPanel.vue`：创作者账户表格、创建表单、关键词／状态筛选、状态标签与操作列。使用预编译Vue、Element Plus按钮／标签及语义HTML表格，不额外引入大型表格库。新账户名称和筛选仅为本地输入；所有显示文本经Vue插值，不作HTML执行。
- `editor-ui/src/accounts.js`：不依赖Vue的UI适配器，复用client提供的api、authority及串行work。仅传递白名单账户显示字段，保存查询版本作为操作expectedVersion；不改服务端权限、密码策略、幂等或会话契约。
- `editor-ui/src/DraftPanel.vue`：游戏／修订选择、元数据／既有势力四资源表单、原操作查询、章节动作和Trial入口。`server/public/draft.txt`保留无框架业务控制器，经publish输出显示投影，不再创建或修改DOM。
- `editor-ui/src/main.js`：仅把账户名、角色、认证／强制改密事实、选中模块、忙状态及各页面显示模型映射到响应式树；不保存CSRF、密码、完整编辑源、原请求body或游戏运行对象。
- `server/public/client.txt`：原有会话传输、模块安装与业务调度；显式向壳同步显示事实。后端仍判定鉴权／CSRF／所有权／CAS，隐藏菜单不是权限门。
- `server/public/index.html`：仅工作台挂载点、加载提示、noscript及同源资源；空`#main`容器与DOM岛已移除。各页面DOM与显隐由Vue拥有；地图绘制及下载仍由原生控制器执行。脚本失败保留加载提示，不展示业务面板。
- `server/public/style.css`：仅后台展示。各页使用Vue的hidden门；原生`data-shell-active`双重显隐及无人消费的`#main`样式已退役。
- `server/editorapp.js`：仅新增同源静态资源白名单，Node与workerd共用；API、数据库、发布服务和玩家／Trial壳不变。

导航统一经过离开守卫；草稿未保存或操作未确认仍须原键查询，不自动重发。账户建立／个人资料／密码未提交也会提示；切换页面保留表单实例，登出或会话失效清除账户输入和复制／账户清单显示。强制改密时不显示业务或个人资料，完成后才进入工作台。管理账户、上架与限制、固定库登记各自独立；完整测试复制仍仅管理员使用；后继作者可在同一“建立遊戲／完整副本”入口新建中立模板，不能查看／安装来源或复制原人物。角色分流、原操作恢复及真实HTTPS证据统一见[中立创建](editor-neutral-template.md)。URL片段仅选择页面，不提供权限，也不自动保存／查询／发布。

### 账户页操作边界（EDITOR-UI-2）

- Vue独占`#admin`及其后代；原生`show`跳过该节点，忙状态只通过props传入Vue控件，不再用全局DOM恢复覆盖其禁用条件。该批其余模块曾通过不透明DOM容器接入，UI-12后已无未迁移业务DOM。
- 创建、停用／恢复、重设仍走原有服务接口；管理员行不提供动作，确认前不POST。搜索与筛选只改变显示，不改变目标ID或原查询版本；停用不自动下架内容。
- 版本冲突、写入结果未知或清单读取失败：保留原清单供核对，提示并锁定写入，必须显式重载；不自动重试、覆盖版本或假装操作回滚。创建已被服务确认但后续读失败时清空创建输入，保留读取失败提示，避免把已确认创建伪装成未提交。
- 会话变更清空清单、创建输入和筛选；身份／请求代际挡住迟到读回包。服务端继续判定真正权限、CSRF、账户版本和epoch；此UI门不是服务端替代品。

### 草稿页操作边界（EDITOR-UI-3）

- Vue独占`#draft-editor`后代，菜单显隐及忙门通过props；控制器持有原生fields、身份代际、loaded与attempt，显示投影只包含表单文字、游戏摘要、章ID／缺口、四资源保存值与暂存输入及禁用事实。完整source／运行状态不进入响应式树。
- 保存前仍绑定明确已保存修订；失去回包保留原输入／key／body／If-Match，查询与同键重试规则不变。sessionStorage仍只记gameId／revision／key，不存正文或凭据；恢复收据本身不启用编辑，须另行明确读取。清单刷新不切latest。
- 完整校验读回章结构后才安装新显示，异常不半替换旧输入。失效身份不投影私有字段，迟到回包不复活旧上下文；同作者恢复仍可处理原操作。统一beforeunload保留会话失效后的脏数据／未知操作保护，不因当前登录为空而丢失提示。
- 章新增／复制／改名／删除仍调用原章编辑保存接口；原生prompt／confirm保留，取消不POST，动作绑定稳定章ID。Trial同步开等待窗口，再用已保存修订和所选章申请；不隐式保存未提交输入，不改Trial引擎或正式存档。
- 当前草稿栏显示已明确读取／确认的gameId、名称、修订、脏状态与未确认事实；仅恢复收据时提示尚须明确载入。它不是其它模块的自动换目标命令，也不提供权限。已有阶段／素材消费者继续经savedContext读取合法上下文。
- 自有副本清单的跳转在既有串行work内部执行，不再通过一个会因busy拒绝的合成DOM change事件；直接用户选择仍受busy／离开守卫限制，不自动读取草稿。

### 后继资源表单补齐（完整编辑器任务）

草稿页四资源已从只读扩展为既有后端 `resourceEdits` 的表单入口；没有新增资源字段、机制或初始化能力。控制器保留字符串输入及原保存数值，按稳定章ID／势力槽生成仅变更字段，使用相同CAS、原键查询与重试；sessionStorage不增加正文。资源修改参与离开／Trial未保存确认，章操作也包含当前待保存资源，不能重读后静默丢弃。非法／超32笔输入在POST前拒绝，回包失去保留输入，确认原收据后才推进数值／修订。范围复用既有writer的signed24资金和u16三兵种表示域，不宣称全域可玩；服务端原证／profile门不变。当前验证及未完成项统一见[完整验收台账](editor-completion-audit.md)。下文UI-3历史只读验收不代表当前功能仍只读。

### 阶段任务页（EDITOR-UI-4）

- `StageJobsPanel.vue`拥有用途、动作、状态及产物列表DOM；`stage.txt`只输出显示投影，业务仍持有六用途关联、原键／body／CAS与服务端回执。下载动作带稳定operationId／assetId，不能因切换用途下载另一任务；实际长度、正文SHA、响应SHA均通过后才建立文件。
- sessionStorage仍仅保留原关联，不保存产物、凭据或源；重载不自动查询／重跑。未知预约以原键原body明确确认，未知命令先GET；会话代际挡迟到响应，改密撤销后旧任务不可运行／下载。统一离开守卫保护未知操作，卸载回收objectURL。
- 10组控制器测试与真实后台任务流程覆盖以上边界；Node模式用实际SQLite／FileBucket及自有HTTPS，workerd模式仍可运行。两者共用业务类，不替代云端证明。

### 后继阶段与固定库确认隔离（完整编辑器A29）

`stage.txt` 的预约两次确认、无任务ID的原键重放及run/retry确认，现在在写journal／发请求前重核身份对象、用户ID／版本、代次、用途、原binding及其job／command／撤销状态。预约额外捕获已读gameId／revision／dirty值，确认后逐项核对，不因切换上下文而把旧确认用于新请求。实际改密确认递增代次，使已在途的旧回应也不能回装产物。

阶段journal写失败原先仅提示而继续POST，现抛错并保留内存原关联，不发新请求；原键重放也须先成功持久化。恢复存储后仍须明确查询：无ID用原键原完整body，有ID先GET，不自动重跑命令。回执阶段写关联失败也不宣称服务失败／回滚。sessionStorage仍只保关联，不保存凭据、源或产物。

`catalog.txt` 的新登记、原键重放、放弃本机关联亦在确认返回后核身份／版本／代次、原view／op／state／broken／queried；变化时不POST、不写或删除任何身份的journal。放弃不取消服务登记，不把固定库事实当运行准入；没有新API、schema、权限或固定库身份变更。

限定验证日志均在 `.dragon-analysis/editor-completion/`：

- `stage-confirm-before.log` 两新增组先复现未拒绝；`stage-journal-before.log` 另复现存储失败仍继续的缺口；`catalog-confirm-before.log` 先复现确认后切身份导致空view TypeError（不是全部负控已逐条运行）。失败轮保留。
- `stage-catalog-confirm-after-r3.log` 21组通过（阶段14／登记7），新增矩阵覆盖换人、注销、同账户新会话、ABA、原地ID／版本变化、改密／pagehide、坏关联放弃、预约两次确认中的game/revision/dirty变化，确认失效后零新请求、journal逐byte不变；存储失败前拒POST、恢复原键和改密迟到回应分别有负控。
- `stage-catalog-confirm-browser-r2.log` 新Chromium、实际gateway／Vue／原生控制器＋**显式API夹具**82项通过，产物 `editor-workbench/run-jlf7zA/result.json`。新增隔离sessionStorage配额失败后真实预约按钮零API、禁止另建、保留查询，恢复存储并明确查询后仅一预约POST；不是实际后端任务执行或生产浏览器证明。此前阶段独立及联合首轮也通过，交付以补全ID／版本守卫后的r2为准。
- shell65、三JS及两TXT模块语法、diff检查通过；两TXT无LSP服务，三测试主动LSP均push-only未确认。新测试的嵌套三元warning已改为分支并重跑21组；两文档主动warning视图无问题，mode=all缓存29文件仍有drafts.js既有flag参数warning，未屏蔽、不称全仓clean。没有Vue／web/src变化，不重建展示或原生束；未重复无改动的实际SQLite/workerd阶段长链、完整注册资源读取、Trial／发布或规则回归。完整编辑器与A29其它入口矩阵仍未完成。

### 阶段结构页（EDITOR-UI-4）

- `StageAssetsPanel.vue`独占只读结构页；`stageassets.txt`保留原六任务上下文、GET、结构校验和请求代际，不再操作DOM。client显式桥接动作、显示投影及pagehide清理。
- 响应式模型仅接收显示文字／字符串列表／禁用事实；不传递原plan、rootKey、凭据或任务操作对象。身份失效不投影旧结果，精确关联变化或pagehide清空显示。清除显示不删SQL／物件，不执行任务或自动查询。
- 原44描述、398库引用、20章／未闭合引用、6报告／缺项和四项false准入校验保持不变；本迁移不改变其正确性依据，不把结构集合当RuntimeManifest。
- 6控制器测试覆盖显式原六ID GET、权限／代际、关联变化、错误不重试和pagehide；隔离壳浏览器38项含空态、有数据文本转义、44／26行及清除无请求。
- **历史缺口已在UI-14获授权修复**：UI-4时旧76cdf28结构身份与现行f4ba804b策略不一致，Node／workerd真实GET500。用户授权后，`sourcecatalogpolicy.js`导出固定`AVAILABLE_LIBRARY_REGISTRY_ID`，结构消费复用同一常量；清单摘要／长度、400角色、权限及资源校验未放宽，旧身份仍拒绝。详细证据以[最终审计](editor-ui-final-audit.md#原功能阻塞的授权修复editor-ui-14)维护。
- 完整真实入口默认要求GET200，最终轮64已通过，含真实六任务、结构44／398／26及内外四项false，并以实际回执重组及测试旧／未知身份拒绝。`--jobs-only`仍是显式局部测试，不能把其`structuralGetChecked:false`称为结构链验证。

### 只读素材库页（EDITOR-UI-5）

- `LibraryPanel.vue`拥有目录、筛选及下载控件；`library.txt`保留原精确修订、398资源／20未闭合引用及固定注册身份校验。响应式树只接收文字／ID／长度／MIME与禁用事实，不接收catalogRoot、sourceDigest、完整回执或二进制。
- 筛选只改变本地可见行；动作使用目录代际＋稳定assetId，拒绝旧目录按钮或任意路径。真正下载仍逐项核正文SHA／长度、响应SHA、原修订、sourceDigest、catalogRoot、admission和固定文件名，不渲染／执行下载内容或授予Runtime资格。
- 上下文／身份／pagehide变化清空显示及筛选、回收URL；迟到成功或失败不得恢复旧会话展示。载入前脏确认保留，取消不请求；操作忙门与最终render由client同步，Vue禁用条件不被原DOM批量解锁覆盖。
- 6组控制器验证含全部响应绑定、陈旧ID、迟到下载与失败；实际Node／SQLite／FileBucket／隔离HTTPS浏览器读398／20目录、筛选原ID下载核SHA，篡改响应root后不建文件，独立作者禁用与改密清理。该实际素材GET成功与UI-4结构GET失败是不同端点，不能相互替代。

### 据点页（EDITOR-UI-6）

- `StrongholdPanel.vue`拥有游戏／章选择、滚动表格及输入；`stronghold.txt`只发布显示投影，私有detail／metadata不进入Vue树。表头固定，槽位是稳定行身份；未命名章显示原章ID，不伪造名字或转换作者文本。
- 沿用既有自有游戏列表、明确清单修订读取、绝对troops／prod值、同记录上限、原章ID／cityIdx与If-Match保存合同；基城192锁定不变，删除检查只展示引用阻止项，不发删除请求。
- render不再重建输入而丢失未保存数值；保存一行后的精确修订重读保留其它脏行。读取／切章／换游戏与共同导航、beforeunload均提示未保存输入。冲突或未知回包保留输入及原查询修订，不自动重试／切latest；确认保存后重读失败则锁写，须显式重读，不能以旧detail继续写新修订。
- 保留本模块原有的单次保存请求方式，不冒充草稿页的持久原键恢复流程；显式刷新会重读自有清单，再读取该清单修订。身份变化清空私有显示，迟到响应不重新安装；该模块保存不偷偷替换草稿页或六任务已选上下文。
- 7组控制器测试与真实Node／SQLite／隔离HTTPS验证192行、越界不POST、脏取消、实际保存读回、实际412输入保留、成功写入丢回包后显式重读及作者隔离；不是扩容或原版机制证明。

### 只读地图页（EDITOR-UI-7）

- `MapPanel.vue`拥有选择、状态、道路描述和Canvas元素生命周期；`mapview.txt`通过非响应式getCanvas引用绘制原生像素。几何、据点、意向及完整草稿回执留在原生控制器，Vue只收游戏标签、当前读取身份、文字列表与禁用事实。
- 原384×256示意、道路颜色、据点坐标、琥珀色意向和红色断路覆盖不变，绘制不修改源或请求API。道路文字仍仅列前200条，绘图不截断。不是游戏地图编辑器，不开放拖动据点、绘路、图块或任意拓扑。
- 显式刷新自有清单后读取清单指定修订；换游戏立即清空旧图／意向，不自动读取。身份／请求代际阻止迟到草稿和意向回包复活旧图；核对回执gameId／revision后才安装。拓扑是独立GET，不冒充该草稿的历史快照；读取失败或绑定异常明确显示“未确认”，不能把缺失当无阻挡或发布许可。
- 7组控制器测试记录Canvas调用；真实Node／SQLite／隔离HTTPS浏览器读取保存4的192据点／254道路和独立意向，核据点像素，点击／离开返回无写入或自动重读，作者空清单与改密清空像素。共享草稿栏／阶段关联仍保留保存1，不自动换目标。

### 固定库登记页（EDITOR-UI-8）

- `CatalogPanel.vue`独占固定库状态、原操作说明和四个动作；`catalog.txt`保留原schema校验、sessionStorage关联和显式空body登记／原键重放。Vue只收文字与禁用事实，原键仍按原界面作为文字供核对，不接收完整op、root、定义摘要或凭据。
- 页面导航与重载不自动GET／POST；必须明确查看当前固定库事实才可新建或重放。registered只是库事实，不能确认原键已执行；只有该次回执通过绑定校验才标确认。目录／账户版本不匹配、损坏或不可写存储均拒绝另起键绕过；放弃只移除本机关联，不取消服务操作。
- 原角色、强制改密、代际及离开守卫保留；pagehide经client统一委派，清除本次视图但保留恢复关联。迟到回包不在新身份下重装状态，非管理员不投影私有文字。服务端仍判定实际权限／epoch／库身份，本批不修复阶段结构的旧库身份合同。
- 6组控制器测试；真实Node／SQLite／隔离HTTPS浏览器验证400角色的实际登记、取消无POST、实际提交后丢回包、离开取消、重载无请求、查事实不确认原键、同键空body重放、只放弃本机关联。

### 武将与势力页（EDITOR-UI-9）

- `GeneralsPanel.vue`拥有游戏／章选择、势力及武将滚动表格、共享画像选择与只读目录；`general.txt`保留无框架控制器、完整回执和原生prompt／confirm。按章显示而非一次堆叠全部章，不改变稳定章ID／槽位；Vue仅收白名单文字／数值和禁用事实。
- 保留改名／字、画像绑定／清除、四种势力动作与128密排删除阻止说明；不新增上传、画像删除、人物增删或游戏机制。目录数量来自实际回执，不再把旧620提示当固定准入。所有作者文本用插值显示。
- 保存仍先读取清单指定的原修订、使用其metadata与原章／槽位发起一次新键请求，再验证清单恰好推进一修订并重读。冲突／未知结果禁止自动重试、偷偷切latest或假称回滚，锁定写入直到明确重读。原生对话框输入是暂态，保留“重读后重做”的原工作流，不冒充草稿页的持久原键恢复。
- 身份／请求代际阻止迟到回包重装私有状态，也在保存前的await后核身份，失效后不再POST。游戏／章／武将／画像动作均按现有稳定身份取原目标，不能靠旧行位置重定向。
- 修复输入转换风险：非整数／空白不能经`Number`变成NaN后在JSON里变成null，从而把无效军师编号误作辞退；null只来自明确`q`。这只是输入防损，不更改服务端任免或槽位规则。
- 8控制器组覆盖全部动作body、取消、原修订、未知／冲突、格式拒绝与代际；真实Node隔离浏览器覆盖128行、实际改名、画像绑定／清除、解散取消、非法编号不POST、实际412锁定／重读、作者隔离与改密后401清理。四种势力动作的规则正确性不是本次UI测试的证明对象。

### 完整测试副本页（EDITOR-UI-10）

以下是管理员完整复制迁移时的历史范围。作者中立创建后继已接入同一组件，但使用独立作者API、模板profile和空白首章；来源按钮对作者禁用，管理员完整复制不变，详见[中立创建维护源](editor-neutral-template.md)。

- `CopyPanel.vue`独占来源、复制表单、操作状态和自有游戏清单；原client中的DOM业务迁入无框架`editor-ui/src/copy.js`，只投影标签、稳定gameId、输入和禁用事实，不放入来源正文、摘要或凭据。仍使用共同api、串行work和原服务端鉴权／租约／CAS，不改变完整复制策略。
- 仍先明确查看／验证固定来源，预约使用原registryId、名称／简介与新键，执行／取消使用该操作键及已查询rowRevision。sessionStorage保持原用户隔离的单个key格式；重载不自动查询／执行／重建body。丢回包或异常后锁定新预约与命令，显式GET恢复原目标；已完成只代表独立草稿，不代表Trial／发布。
- 原自动清除404追踪改为明确确认；404或`COPY_OPERATION_REVOKED`均不能伪装取消／回滚。确认只移除本地键，不发取消或新建请求。不可写／损坏存储在POST前关闭写入，不再仅警告后继续。未提交字段及未确认／未完成操作接入离开守卫，确认预约后清空输入；身份／pagehide代际拒绝迟到结果。
- 自有游戏动作按原gameId；“测试运行”仍只是跳转草稿选择，不读取、启动Trial或写正式存档。删除入口仍仅打开追踪模块，不替用户执行删除。用户文本用Vue插值，源／复制状态不能反向证明服务权限。
- 9控制器组及真实Node／SQLite／FileBucket／隔离HTTPS浏览器验证实际来源登记、预约／执行成功后丢回包、重载无POST、原键查询、独立保存1、自有草稿跳转、原rowRevision取消及401清理。404／撤销后本地清除的取消／确认分支另由控制器测试覆盖，不冒充物理清理验证。

### 发布管理页（EDITOR-UI-11）

- `PublishPanel.vue`独占游戏选择、名称、版本／公告和操作追踪；`publish.txt`只投影显示字符串、稳定gameId与禁用事实。原tuple、pin、分发回执、凭据和源留在原生控制器，不进入Vue响应式树。仍以原API／服务端权限为准。
- sessionStorage保持原actorId／账户版本／gameId／key／原名称关联，写入后读回核验；重载不自动POST或查询。未知回包先GET，只有明确404且无已确认本地提交才允许用户确认同键／同名称重送；当前输入或游戏选择不改在途目标。失败观察不能把已提交改成失败，停止追踪不取消服务请求。
- 继续区分本地定版、历史分发确认、当前上架；恢复锁不由此页解除。统一身份／请求代际拒绝迟到包，账户版本变更不能重送原请求。未提交名称新增选择／刷新／离开保护，取消保留输入。确认文案撤销旧“已准入旧局持续”的遗留描述，按已批准当前版本唯一政策提示确认更新后旧局停止且禁存；不修改引擎规则。
- 9组控制器及9组隔离API夹具浏览器验证原键／名称恢复、404重送、取消、私有清理、损坏存储和状态区分。另有真实Node共享服务／SQLite／20章编译／自有workerd R2／默认publisher／reader浏览器链：实际提交后丢回包、原操作查询、远端根已写但收据失败仍pending、恢复后确认、新版拒旧票、下架仅拒新准入、删除栅栏410及重开数据库通过。管理／删除在本轮是鉴权API动作，不冒充其UI验证；没有云端、正式玩家App或物理清理结论。

### 上架限制与删除追踪页（EDITOR-UI-12）

- `ManagementPanel.vue`／`DeletionPanel.vue`分别拥有清单、操作按钮与状态；`management.txt`两个原生控制器只投影文字、稳定gameId／rowRevision及禁用事实。行操作回传ID与查询修订，由私有原清单再次定位；旧行或伪造目标不产生请求。没有把原tuple／receipt／distribution对象、凭据或源放进响应式树。
- 保留原actor／版本、永久key、body／If-Match或确认名称／原修订及sessionStorage读回核验。未知操作先明确GET，只有原操作端点明确404且无本地提交回执才允许同键重送；存储失败、版本变化、已知提交均不能绕过。停止本机追踪不取消SQL或分发，恢复锁不可由此页解除。
- 管理员上架／下架限制／解除限制与发布分离；解除仍保持下架。管理员跨作者删除必须先读取目标预览并校验gameId、原修订和准确名称，再明确输入确认；不赋予他人草稿读取／编辑权。柵栏不可逆，但其分发确认不是物理清理证明，不删除玩家本地存档。
- 48管理＋54删除控制器检查保留原全部回执／分发／恢复／异常覆盖，并加显示投影无别名、原ID／修订与取消检查。真实Node／SQLite／自有R2发布链启用三种UI标志，覆盖Vue上架、下架限制、解除限制与管理员跨作者删除，实际提交后丢回包、重载只GET、历史分发确认、旧票拒绝、柵栏410和重启；不是生产云或物理清理验证。

## 构建与分发

版本固定于`editor-ui/package.json`及`package-lock.json`。当前Vue 3.5.44、Element Plus 2.14.7、Vite 6.4.4、Vue插件5.2.4；依赖安装局限该目录。

```bash
npm --prefix editor-ui ci --ignore-scripts
npm --prefix editor-ui run build
npm --prefix editor-ui run check
npm --prefix editor-ui audit
```

`build.mjs`生成并追踪以下资源，服务端只导入文本，无运行时npm安装：

| 文件 | 同源地址 |
| --- | --- |
| `server/public/shell-ui.txt` | `/shell-ui.js` |
| `server/public/shell-ui.css` | `/shell-ui.css` |
| `server/public/shell-ui-licenses.txt` | `/shell-ui-licenses.txt` |

构建按实际输出模块收集完整上游许可证；构建产物固定LF，`check`重新构建并逐字节比较，不覆写。Vue模板在构建时编译，浏览器不使用模板编译器／eval，不依赖CDN；保持既有`script-src 'self'; style-src 'self'`，没有unsafe-inline或unsafe-eval。第三方资源见[许可说明](../THIRD_PARTY_NOTICES.md)。

只有修改后台程序才构建／交付上述资源；编辑游戏、保存草稿、发布内容仍是数据操作。没有改玩家静态部署、Trial资源束、共同编译核心或生产维护门。后续部署必须一起交付HTML、client、样式、三份生成物与网关接线，仍须独立授权；不能只替换HTML。

## 验证入口与边界

```bash
node tools/verify_editor_shell.mjs
node --test tools/verify_editor_accounts.mjs tools/verify_editor_draft_controller.mjs tools/verify_editor_stage_assets_controller.mjs tools/verify_editor_stage_jobs_controller.mjs tools/verify_editor_library_controller.mjs tools/verify_stronghold_ui_model.mjs tools/verify_mapview_topology_model.mjs tools/verify_editor_catalog_controller.mjs tools/verify_generals_conflict_model.mjs tools/verify_editor_copy_controller.mjs tools/verify_publish_ui_model.mjs
node tools/verify_editor_workbench_browser.mjs
node tools/verify_publication_ui_browser.mjs
node tools/verify_management_distribution_ui.mjs
node tools/verify_deletion_ui.mjs
node tools/verify_publication_chain_browser.mjs --node-service --management-ui --deletion-ui --admin-deletion-ui
node tools/verify_vps_editor_server.mjs
node tools/verify_vps_editor_server.mjs --frozen-publication
# 已有真实workerd／SQLite／隔离HTTPS账户流程（端口须空闲且可监听）：
# PLAYWRIGHT_MODULE=<已安装的Playwright模块> EDITOR_TEST_PORT=18787 \
#   node tools/verify_editor_backend_browser.mjs <新的.dragon-analysis输出目录>
# 阶段任务：设置PLAYWRIGHT_MODULE、EDITOR_TEST_PORT；Node模式另设EDITOR_TEST_NODE=1。
# node tools/verify_editor_backend_stage_ui.mjs <新整数轮次> --jobs-only
# 仅跑真实武将流程（同一服务与隔离边界，不重复六用途任务）：
# node tools/verify_editor_backend_stage_ui.mjs <新整数轮次> --generals-only
# 仅跑真实完整副本流程：
# node tools/verify_editor_backend_stage_ui.mjs <新整数轮次> --copy-only
# 去掉上述范围选项即包含真实结构GET；UI-14轮64已通过完整combined链。
# 真实草稿回包丢失／冲突／恢复流程（同样设置PLAYWRIGHT_MODULE、EDITOR_TEST_PORT）：
# node tools/verify_editor_backend_draft_ui.mjs .dragon-analysis/editor-phase/backend-draft-ui-session-r1/ui-r<新轮次>.png
```

- 静态壳矩阵保留原覆盖，更新为共同`editorapp.js`而非已退化为适配器的`worker.js`，删除确认查实际management模块，不拿旧文件位置冒失败。
- 账户适配器内存测试：显示字段投影、权限门、原ID／版本、取消、冲突锁定、无自动重试、已确认创建后的读失败、清单格式拒绝、会话切换迟到包与串行写入；不替代服务端验证。
- 新浏览器入口：真实静态网关／CSP、全新隔离context、显式API夹具；登录、强制改密、单模块、角色菜单、个人资料、回退、脏离开取消、保存409输入保留、登出清理和会话失效；第二批加账户表格、HTML文本转义、筛选后的目标ID／版本、冲突锁定与重载、取消操作、创建脏离开和输入清理。不是服务端鉴权证明。
- HTTP回归：自有SQLite／文件桶，分别核普通及冻结发布模式、静态资源、CSRF、会话epoch、密码／账户、重启持久化；真实workerd浏览器另核账户创建／停用／恢复／重设、CAS与持久重启。
- 不读写真实SAVE.DAT、用户profile或正式IndexedDB。UI-11已补上述发布链；没有运行正式玩家App／完整地图编辑或游戏战役回归，不能据后台局部检查声称这些功能已经完成。

草稿控制器另测原输入／原键、原修订、收据恢复、迟到响应、失效身份、章动作及Trial窗口回执。隔离浏览器增补四种章操作、文本转义、取消、脏选择恢复和失效会话的beforeunload；真实workerd／SQLite／R2浏览器验证实际保存后丢包、跨页CAS冲突、同键重试、无正文恢复、实际改密撤销及独立作者不可见。章节按钮夹具不冒充原版初始化机制或完整Trial引擎验收。

实际结果、失败轮、LSP限制和未提交状态见[首批journal](checkpoint-journal.md#19-后台框架壳editor-ui-1)、[账户管理journal](checkpoint-journal.md#20-账户管理组件化editor-ui-2)、[草稿journal](checkpoint-journal.md#21-草稿与章节组件化editor-ui-3)、[阶段journal](checkpoint-journal.md#22-阶段任务与结构展示editor-ui-4)及[素材库journal](checkpoint-journal.md#23-只读素材库组件化editor-ui-5)。最终管理／删除结果见[journal UI-12](checkpoint-journal.md#30-上架限制与删除追踪组件化editor-ui-12)。共同收尾、逐项证据及唯一功能回归阻塞见[最终审计](editor-ui-final-audit.md)。不能借壳迁移新增游戏规则或放宽准入；原阶段结构功能阻塞已按追加授权闭合；迁移完成范围不包含未授权产品功能；后续部署按单独授权执行，不解除生产维护门。

## 后继：四个作者编辑面板的共享游戏选择

这是A04的增量实现，不是13模块全局上下文的完成证书。`draft.txt:createAuthoringContext` 仅协调游戏ID；`client.txt` 将资料、据点、武将、地图四个控制器接入。各面板仍自行验证精确修订和回执，章节选择属于本面板；不把原生游戏状态放进Vue，不自动更新其它面板的已读修订。

- 一个面板明确选游戏时，先完成其余面板及阶段／发布等既有离开确认，再一起清除旧游戏投影并同步ID。任一拒绝不清除任何输入。资料有未确认保存操作时禁止换目标；身份重置／确认期间发生新上下文变化时，旧选择请求不得落地。
- 同步本身不发API、不保存、不读取最新修订。未读取清单的面板用禁用占位选项显示目标ID；本次清单漏掉当前游戏不自动回退其它游戏，也不推断已经删除。显式读取仍经原有认证服务校验。
- 资料的 `savedContext` 仍要求已验证读取；换游戏使阶段／素材关联失去原已读资格，不伪造新快照。管理、发布、删除操作的独立目标及原操作键**没有**跟随改写，本批未接这些模块；发布面板的后继接线见下节，管理／删除的完整衔接仍待实现。
- `verify_editor_authoring_context.mjs` 七组：四面板无请求同步、各自精确读取、全部确认前不清空、跨面板取消／外部工作流拒绝、未确认资料保存、清单漏项、迟到读取／失败及确认中身份重置。地图原先只按身份判别错误回包，切换游戏后旧失败仍会写新面板；负控 `authoring-late-error-before.log` 复现，补actionGeneration后七组通过。原资料30／据点12／武将17／刷新3组、壳65项通过。
- 新鲜浏览器工作台61项通过（真实静态gateway／Vue，显式API夹具），包含原生跨面板选择、未读取的禁用占位、旧行清除、跨面板未保存取消且无额外请求。`authoring-context-workbench-r3.log` 位于 `.dragon-analysis/editor-completion`。
- 真实Node SQLite/FileBucket／自有HTTPS／新Chromium的 `ui-r94 --copied-entity-only` 五组通过：复制、据点／武将保存、复制已编辑章、删除源章后后代保留、删除后代后20原章不变。日志 `authoring-context-ui-r94.log`；该轮随后仅补确认期间上下文generation复核及地图迟到错误隔离，七组控制器及61项浏览器重跑覆盖，未冒充重新跑了重型后端。不是完整鉴权／Trial／发布或跨游戏后端验收。
- Vue build/check产物JS308639B，CSS33707B／8包notice不变。无提交、部署或生产门变更。主动LSP含push-only未确认和既有hint，txt无服务；不称全仓clean。

## 后继：发布确认后的身份复核

`publish.txt` 原先在POST前才复核捕获身份，但确认返回后已经按当前身份写入操作journal；“停止追踪”也可能在确认后直接清除当前身份的关联。以可重入确认端口切换身份的控制器负控，复现旧发布覆盖另一作者journal、旧停止追踪清除另一作者journal，以及旧刷新发出新会话GET（`publish-consent-before.log`）。这是控制器边界测试，不是宣称原生浏览器确认框已复现并发漏洞。

现于确认返回、任何journal变更或清单GET／选择变更之前复核原身份generation。发布还核原游戏／名称及无新pending；停止追踪核原关联仍是同一对象。拒绝时不写、不删、不请求，保留新身份自己的关联。既有同键重送、发布回执、分发状态和服务端权限不变。本段修复时尚未接入共享选择，现行接线见下节。

`verify_publish_ui_model.mjs` 原9组加3组负控，修后12组通过；壳65项、语法、全新浏览器工作台61项回归通过（真实gateway／Vue与显式API夹具，`publish-consent-workbench.log`／`run-0EhDpI`）。新增确认中身份切换由控制器端口验证，不冒真实发布／R2或浏览器并发证明。测试LSP push-only未确认，publish.txt无服务；未运行不受此次纯控制器变更影响的重型后端／引擎链，未部署。

## 后继：发布目标接入共享选择

`publish.txt` 现作为第五个参与者接入 `createAuthoringContext`。选择器表示**下一次发布**的游戏，读取自己的清单前显示禁用占位且不允许新发布；显式清单刷新只为仍未改动的名称填入已读建议值，缺少当前游戏不改选其它游戏。切换本身不读版本、不发POST、不更新其它面板的精确修订。

发布名称脏状态可以拒绝其它面板的换游戏，拒绝不清空任一面板。接受切换时只清理当前选择的版本／公告等显示，原 `pending` tuple、key、name、已提交pin及分发回执保持原操作身份；原查询和同键重试继续访问原gameId，不能跟随当前选择改写。原操作仍阻止另起发布，明确“停止本机追踪”也不取消服务器操作。身份重置及迟到响应沿用generation门。此接线不赋予管理员编辑别人内容的权限，不等于管理／删除等全部模块上下文完成。

- 五控制器联合 `verify_editor_authoring_context.mjs` 10组、原发布控制器12组、壳65项通过。新增发布发起共享选择、脏发布名拒绝跨面板切换、未读取清单的发布禁用、清单漏项，以及换游戏后仍查／重试原key＋gameId＋name。日志 `publication-context-{controller,publish}.log`。
- 真实gateway／Vue＋显式API夹具的新鲜浏览器64项通过（`publication-context-workbench.log`，`run-nQKD1R`）。新增禁用占位、显式清单的一次GET、发布名取消保持、从发布选择反向同步资料面板且不产生额外请求。原请求重试身份由控制器联合测试覆盖，不冒浏览器实际发布证明。
- Vue build/check JS309163B、CSS33707B／8包notice不变；语法检查通过。主动LSP三项push-only未确认、两个txt无服务；没有重跑不受本次前端接线影响的重型编译／R2／引擎回归，没有部署。

## 后继：元数据输入不提前截断NFC文字

草稿及完整副本表单的原生maxlength原为名称16、简介40个UTF-16单元，仍会截断合法的分解形式。实际浏览器逐键输入八个三段Hangul音节（NFC后八码点），负控 `metadata-nfc-input-before.log` 复现只留下16个单元。两表单现与发布表单使用1024单元输入预算，真正的名称8／简介20码点限制仍在既有控制器与服务端trim／NFC之后执行；不扩大产品名称域，不自动转换作者文字。

全新浏览器工作台69项通过（`metadata-nfc-input-after-r2.log`／`run-tJsL5E`）：两表单分别逐键输入8音节名称／20音节简介均完整保留且无请求；NFC后9码点名称仍拒保存且无POST。首个修后测试错误查看面板消息而非共同错误栏而失败，改为实际`#status`断言后重跑通过，保留失败日志。草稿控制器30组及shell65项通过；build/check JS309277B，CSS33707B／8包notice不变。浏览器API为显式夹具，不冒新创建／真实保存／认证或生产验证；后端规则未改，未另跑重型编译链或部署。

## 后继：武将与势力对话返回的上下文复核

`general.txt` 改名流程在第一条prompt前捕获原身份／游戏generation及章ID，每条prompt返回后复核，失效就停止，不再展示第二条旧资料或调用保存。势力任免／继任／解散同样在prompt及最终confirm返回后复核；原API正文、精确修订、原键策略、服务器权限和角色规则不变。

可重入对话端口测试在改名第一／第二步、势力输入及确认中切换身份或往返切换游戏。负控 `general-consent-before.log` 两组失败，旧流程继续走到保存阶段；修后不再请求或继续旧对话。`verify_generals_conflict_model.mjs` 19组、五面板上下文10组、shell65项通过；全新浏览器工作台69项回归通过（`general-consent-workbench.log`／`run-iUryKJ`，真实gateway／Vue及显式API夹具）。新增重入场景由控制器端口验证，不冒原生浏览器确认框并发、真实后端任免或机制证明。本次没有Vue构建、后端／引擎变化或部署。主动LSP测试为push-only未确认、general.txt无服务，两文档只有既有SHA词典信息，未称全部clean。

## 后继：资料读取与换游戏离开确认

`draft.txt` 明确载入在离开确认前捕获游戏ID、修订与身份generation；确认后若身份、目标、修订或未确认操作状态变化，旧载入停止，不在替换后的会话发GET。游戏选择同样先捕获generation，并在本面板确认及共享上下文协调返回后复核，旧选择不能清空新上下文。

`draft-leave-before.log` 负控复现确认后仍继续操作；修后资料控制器34组通过，新增读取／选择×同作者新会话／目标变化四个组合，无请求／journal／旧选择覆盖，保留替换后输入。共享上下文10组、shell65项、新鲜工作台69项通过（`draft-leave-workbench.log`／`run-xy5wGg`）。这是可重入确认端口及真实Vue＋API夹具回归，不冒原生对话框并发或后端鉴权证明；没有后端、规则、Vue构建或生产变化。

## 后继：章节与Trial确认不跨上下文续办

`draft.txt` 章节更名／删除在prompt或confirm前捕获原身份generation，返回后先复核，再创建保存操作及journal。同作者重新登录仍是不同会话，旧确认不能在新会话发起操作。Trial在脏确认前固定原已读快照对象与章ID，确认返回后、同步开窗返回后都复核；失效不请求Trial，若开窗端口已返回自有子窗，仅关闭该窗。正常开窗仍在用户手势内，保存修订／窗口被拦重试／已有快照隔离规则不变。

控制器负控 `draft-consent-before.log` 三组先失败；修后 `verify_editor_draft_controller.mjs` 33组通过（含确认中换章），覆盖章节确认中同作者会话替换、Trial确认中身份／游戏／章变化、开窗端口返回时身份已变，均无新请求或journal。五面板上下文10组、shell65项、新鲜工作台69项回归通过（`draft-consent-workbench.log`／`run-7DE2OU`）。新增重入边界来自显式控制器端口，不称已复现原生对话框并发，也不替代真实Trial引擎验证；后端、Vue构建、规则及生产环境均未改动。语法／diff检查通过；主动LSP为测试push-only未确认、draft.txt无服务、两文档既有SHA词典信息。session全量缓存75文件仍有10项既有warning，未屏蔽或称全仓clean。

## 后继：据点离开确认的上下文复核

`stronghold.txt` 刷新、明确重读、换游戏及换章节均在离开确认前捕获身份／游戏generation，确认返回后复核；刷新及换游戏还在共享选择协调返回后复核。失效的旧操作不再发GET、不清空或覆盖新上下文。换章使旧generation失效；正常取消仍保留输入。没有改据点字段、上限、保存API、原始数据或服务器权限。

负控 `stronghold-consent-before.log` 两组失败：旧确认在新身份继续发了两个GET，共享选择回调后还发了旧据点读取。修后控制器14组通过，覆盖四种动作×身份／上下文替换及共享协调回调失效；共享上下文10组、刷新3组、shell65项通过。新鲜工作台70项通过（`stronghold-consent-workbench.log`／`run-icdUev`），真实静态gateway／Vue配显式API夹具。新增重入情形是控制器端口负控，不是原生浏览器confirm并发或后端权限证书；没有Vue重建或生产变更。语法／diff检查通过；主动LSP为测试push-only未确认、TXT无服务，两文档仅既有SHA词典信息；session全量缓存仍有8项既有warning、23项hint/info，不称全仓clean。

## 后继：地图共享选择返回的上下文复核

`mapview.txt` 刷新与切换游戏在共享选择协调返回后复核原身份／generation；切换在协调前捕获ticket。共享离开确认期间同作者会话被替换、或上下文已被其它动作改变，旧动作不得继续重写选择／状态或读取旧地图。正常协调已执行adoptGame时保留新选择，仍需显式读取；没有改只读几何绘制、拓扑意向、草稿、地图编辑权限或运行准入。

`map-context-before.log` 复现旧刷新改写新身份的提示。修后 `verify_mapview_topology_model.mjs` 9组通过，含刷新／切换×身份／上下文重入四种组合以及正常共享adopt后的显式读取；共享上下文10组、刷新3组、shell65项、新鲜gateway／Vue工作台71项通过（`map-context-workbench.log`、`run-yMII8C`）。重入是控制器端口负控；浏览器使用显式API夹具，不冒原生confirm并发、后端权限或四层地图编辑完成。没有Vue重建、后台改动、原生束变更或部署。

## 后继：只读地图示意图检视控制

`MapPanel.vue` 增加1×／2×／4×有界示意倍率、原生滚动容器及复位。按实际Canvas尺寸重绘，不对旧位图做CSS拉伸；native `mapview.txt` 只新增redraw入口，仍由同一已读DTO绘制据点、道路及意向覆盖。Vue仅持有倍率／滚动位置，不持有游戏状态。倍率变更回左上角，身份／游戏／已读修订上下文改变复位并清除旧图；未读或busy时禁用检视按钮，不保存视口、不发新API。启动壳先于控制器安装，首次挂载允许redraw尚未提供，由控制器安装后的初次render绘制；后续已有端口时重绘。

验证日志位于 `.dragon-analysis/editor-completion/map-view-controls-*`：模型10组含4×坐标、原始据点／道路／意向数据不变、注销重绘只清图且无请求；共享上下文10组、shell65项、build/check通过（JS343216B／CSS33898B／8包许可）。全新gateway／Vue浏览器72项通过（`browser-r4.log`、`run-umEEnE`），新增真实Canvas像素／尺寸、上限、键盘滚动、复位、导航后显示及换游戏清图，检视过程零API。API为显式夹具，不冒真实后端登录／地图编辑保存证明。

首轮失败源于旧测试假设地图从未加载游戏清单，现新增场景已显式加载，故将后续已知选项预期改为可选；第二轮发现真实启动时redraw尚未安装的两次TypeError，修复挂载时序后第三、四轮通过，失败日志保留。没有更改后台、原生程序束、地图规则、维护门或部署。此项仅是只读几何示意图检视，不是四层地图工作区、拾取／吸附／拖放、边缘平移、素材绘制或可保存地图编辑的完成证明；现有本地工作区camera合同不变。

## 后继：只读地图几何回包完整性

地图读取在采用回包之前核据点／道路ID非空且各自唯一，据点与每个道路点为当前示意图384×256范围内的整数坐标；非法几何整次拒绝，保留旧图／描述，且不继续请求拓扑。可选拓扑的move须为唯一且存在于本次据点集合的ID及有效坐标，否则整份覆盖降为未知，仍绘制有效基础几何；不把未知标成无阻挡。该检查只是现有固定范围示意图的输入合同，不是道路连通、端口、成本、规则准入或地图扩容判定，不修改服务器／源资料。

`map-geometry-before.log` 先复现重复据点ID未拒绝；修后模型11组通过，新增7种坏基础几何与5种坏意向覆盖（空记录、非有限／负坐标、未知ID、重复ID），另核有效重读恢复及拒绝前不请求拓扑。共享上下文10组、刷新3组、shell65项、全新gateway／Vue工作台72项通过（`map-geometry-*`、`run-wvJqGv`）。坏回包由控制器端口注入，浏览器使用显式API夹具；没有重跑无改动的重型后台／规则／编译链，不冒完整四层地图编辑证明。未改Vue或原生束，没有提交、推送或部署。

## 后继：拓扑覆盖的阻挡与重建摘要一致性

`mapview.txt` 按现有拓扑GET合同核 `blocked === (moves.length > 0)`，并要求重建摘要的roadId唯一、属于本次已读道路集合，travelKind明确为land或water。任一矛盾／缺损使整份可选覆盖降为未知：保留合法基础示意图，不显示橙色移动意向或“无阻挡”。有效重建记录仍只是记录，不能据此消除移动意向造成的阻挡；没有移动但有合法重建记录仍可显示本接口的“无阻挡”，不等于全部发布条件已满足。

`map-overlay-before.log` 先复现有意向却blocked=false被采纳；修后模型12组通过，新增两种布尔矛盾、五种重建缺损，以及有效阻挡／非阻挡恢复、基础像素和源数据不变。共享上下文14组、shell65项及全新gateway／Vue工作台73项通过（`map-overlay-*`，`run-XMi7Th`）。坏响应是控制器端口负控，浏览器为显式API夹具集成回归；未改后端、Vue构建、原生束或道路规则，不冒实际重连／四层编辑／运行准入证明。

## 后继：地图页水域显示保存

`MapPanel.vue` 经Workbench接入同一draftModel／draftActions，挂载 `WaterGroupsPanel.vue`。以下保留r16批次范围：当时中立模板既有组合的显示开关可显式保存，未知或完整副本不可编辑；后继已接完整副本及真实Canvas预览，当前范围以水域维护源为准。只读据点／道路几何仍由原native控制器负责，并明确不是水域小地图预览。没有第二个journal或可写source，保存不捎带其它表未提交输入；确切回包后仍要重读。真实HTTPS／NodeRoot／SQLite／FileBucket／新Chromium r16的18组及gateway72项、构建和源码收据，统一维护于[水域显示](editor-water-visibility.md#后继地图面板与真实保存恢复)。不冒完整四层工作区、预览、Trial或发布证明，未部署。

## 后继：中立人物基础定义表单

武将页装配 `GeneralDefinitionsPanel.vue`，与旧128槽章资料明确分区。新表复用 `draft.txt` 的单一精确草稿及保存操作追踪，Vue仅接姓名／字／ID／画像引用和禁用事实，不持有请求body、凭据或运行状态。已有13个模块导航不变；没有第二份可写source或新自动保存入口。

初段交付时作者可在中立模板的无章引用范围内新增／修改／删除定义，选621共享画像；使用保存元数据，不捎带其它表未提交输入。原键恢复、损坏关联和存储失败防护、初段真实HTTPS8组／控制器9组／既有工作台71项及后继章节继承／覆盖／影响确认的当前证据与未完成边界，统一维护于[人物定义](editor-general-definitions.md#后继武将页基础定义表单)。初段只重建后台壳，没有提交、推送、部署或放开原生初始化／Trial准入。

## 后继：草稿清单选择返回复核

`refreshGames` 在共享选择回调返回后再次核原ticket／身份权限，旧刷新不能覆写回调内新身份或另一个游戏的字段。只补调用方边界，不改列表、权限或保存协议。`draft-refresh-return-before.log` 先复现旧gameId回填；修后首轮测试误要求新游戏修订为空，但真实adopt已从当次清单选中其修订1，仅修正该测试期待，失败日志保留。最终草稿40、共享上下文14、定义31、shell65和fresh gateway／Vue72项通过（`draft-refresh-return-*.log`，`run-A2bCuj`）。重入使用明确回调夹具，不冒实际后台鉴权／浏览器撤销竞态证明；未改Vue或后台，不重建束或重复无关重链。

## 后继：共享选择每个回调边界的重入保护

`createAuthoringContext` 两次canAdopt检查、逐个canLeave确认及逐个adopt通知，现在都检查协调器代次。确认内reset后不再询问其它面板或执行外部离开确认；提交通知内reset或嵌套更新选择后，旧通知立即停止并返回false，不用旧游戏清空后续面板。已执行的回调不伪造回滚；正常变更仍先完成全部同意，再设置全局ID并通知非来源面板。后端权限／CAS／操作键与已保存修订不变。

先行 `context-reentrant-before.log` 保留三项失败：旧确认继续询问／旧通知越过reset／新选择被后续旧通知覆盖。`verify_editor_authoring_context.mjs` 最终14组通过（含两次readiness检查内reset）；草稿39、定义31、shell65及全新gateway／Vue浏览器72项通过（`context-reentrant-*.log`，`run-0XThVY`）。重入由明确注入的同步回调验证，不冒实际身份撤销或后台鉴权证明；浏览器为API夹具集成回归。仅改原native协调器和测试，Vue未改，不重建壳或重跑无关Root／资源重链。

## 后继：管理与删除清单的当前游戏定位

Workbench把现有草稿展示模型的当前游戏ID只读传给ManagementPanel／DeletionPanel。两页明确显示该ID，并可选择“只显示目前编辑游戏”；筛选仅针对本页已经持有的清单，不发API、不自动读新修订、不增加编辑或管理权限。未选游戏时禁用筛选；清单尚未读或没有对应项时提示明确读取，不自动回退其它游戏或认定游戏已删除。取消筛选可恢复显示其它有权查看的行，管理员全局管理入口保持。

这是只读定位衔接，不是把管理／删除目标改成可随全局选择变化的引用。新操作仍由原清单行的ID／rowRevision和原控制器确认创建；已有操作的操作者、目标、名称、修订、key、查询／重试及分发收据完全不变。换游戏仍走原离开确认，筛选不更换原操作、清理journal或执行删除。身份不可用时不传当前游戏，筛选回到关闭；没有第二份可写source，也未开放物理清理。A04完整上下文和表单出口仍未关闭。

证据前缀 `.dragon-analysis/editor-completion/context-management-`：

- `browser-r1.log` 首轮133项通过，产物 `.dragon-analysis/editor-workbench/run-Q9XhaJ/result.json`。复用工作台入口，新增独立全新Chromium上下文与明确API夹具：未选游戏禁用、未读清单提示且零GET、明确读取后筛选A，切换B仅改变两页显示、没有新请求。自有sessionStorage夹具预置原A删除关联，确认离开后原tuple逐字段不变；在B筛选下显式查询仍只GET原A操作及其分发，取消筛选恢复两行。所有该场景API均断言GET，未发送管理或删除POST，禁正式IDB及外网；不冒真实后台权限／事务／物理删除证明。
- Vue build／check逐byte一致，shell65、测试语法及diff通过。本批未改原生控制器、后端、web/src或DDL，不重建原生束，不重复无影响Root／发布／删除重链。四代码主动LSP已用120秒／并发2，2项超时、2项push-only，全部未确认，不称clean；两文档warning视图clean，mode=all缓存97文件仍31项既有warning及1hint，未屏蔽。
- 导航CodeGraph先返回后端管理／栅栏实现而非所需前端，随后读明确控制器和Vue文件；首次检索的 `editor-authoring-context.md` 不存在，实际维护源为本文上下文各节。没有据此改索引、权限或产品准入；未新增独立测试脚本。

## 后继：草稿行到删除追踪的目标导航

修复“自己的草稿”逐行传入gameId、但copy控制器及client回调丢弃该ID的问题。copy只接受私有已读清单中的ID，离开确认后重核身份代次，等待目标导航完成；没有从可修改展示模型取得权限。client复用同一导航函数处理测试运行／删除追踪入口，先经现有草稿与全局上下文选择，再于同一会话内打开目标页。

草稿 `selectGame/gotoGame` 现在明确返回成功或拒绝，守卫拒绝、未确认离开或身份失效不再被调用方当成成功切页；缺目标仍报错，不回退别的游戏。需要读清单时保留原API路径，并核等待前后身份。不会自动读草稿、管理／删除清单或发送删除请求；原删除journal、行修订与key保持，目标页仍由作者明确读清单、选择筛选和操作。

证据前缀 `.dragon-analysis/editor-completion/copy-target-`：

- `before.log` 新目标断言在原代码下失败，删除导航回调确实没有收到gameId。`controller-r2.log` 复用copy／draft／authoring-context三入口94项通过：传递实际ID、取消返回false且保原输入／无请求、串行work内成功返回true，读取清单期间身份失效拒绝旧选择。首轮 `controller.log` 的旧上下文夹具缺少现行必需的 `general.faction`，出现“章武将槽资料回应无效”；仅明确补夹具归属0后通过，未放宽产品门。
- `browser-r1.log` 工作台134项通过，产物 `.dragon-analysis/editor-workbench/run-L3ArV1/result.json`。原管理／删除定位场景改走真实Vue草稿行按钮：已有原A删除关联时点击B，取消离开仍在副本页且当前A不变；确认后到删除追踪页、当前B，两页筛选同步，原A tuple逐字段保持，显式查询仍只读A原key及分发。场景所有API仍强制GET，无自动删除或替换关联；实际gateway／Vue／新Chromium，但API明确夹具，不冒后端权限或物理清理证据。
- Vue build／check逐byte一致，shell65、五JS与两TXT模块语法及diff通过。五代码主动LSP120秒／并发2均push-only未确认；TXT无服务，不称clean。两文档warning视图clean；mode=all缓存100文件37项warning及1hint，其中本批重新出现的copy控制器4项和旧测试夹具2项均为未改动的既有嵌套三元式，未屏蔽。无后端、web/src或DDL更改，不重建原生束或重跑无影响Root／Trial／发布／删除长链；未新增独立探针。

## 后继：地图本地参数离开保护

素材放置目标／参数、平移X／Y及补底图块／地理值原先只存在Vue局部ref，未进入原生草稿离开守卫。现由MaterialsPanel／BaseTerrainPanel经MapPanel、Workbench和壳适配器只读查询一个布尔值，client传给既有草稿控制器 `hasLocalMapInputs`。没有把表单变成第二份source，也不复制参数到控制器或journal。

非空放置准备、任一平移输入或补底数值参与原 `canLeave`：普通导航、换游戏、显式重读及beforeunload沿既有确认路径；Trial亦提示只使用已保存修订。取消保输入，不读、不写、不换游戏或开Trial窗口；确认普通导航仍保留面板实例及参数，不隐式保存。筛选、分页、缩放和仅勾选格／实例不算待保存参数。原metadata/resource的dirty、保存正文、原键、CAS及服务权限保持，不将准备参数捎带到资料保存。素材新增显式“取消放置准备”，只清本地目标／变体／坐标／类别，停止相应预览，不发请求；平移与补底值仍可分别清空。

本范围是地图这两类已接表单，不宣称全部实体表单的离开保护闭合。该批次尚未清理同修订重读后的本地参数；后继明确放弃／重读见下节，普通面板导航仍不隐式丢弃参数。

证据前缀 `.dragon-analysis/editor-completion/map-input-guard-`：

- `controller.log` 复用draft／authoring-context共83项通过，新增一组只读布尔端口正负控：卸载返回拒绝且不调用confirm；拒绝重读／换游戏／Trial零GET、零窗口、无journal，metadata的dirty仍false；同意重读只有原GET，清空参数后解除提示。
- `browser-r2.log` 工作台136项通过，产物 `.dragon-analysis/editor-workbench/run-7Vzhg7/result.json`。真实Vue／gateway／全新Chromium、API明确夹具：仅补底数值也可取消导航与重读，输入和请求数保持；确认往返面板仍保值，清数值后仅格选择不阻导航；平移参数及仅选择放置目标同样提示，显式取消放置后不再阻导航。原保存／原键／上下文流程保持。r1在进入独立角色夹具前留下地图准备参数，被新守卫拒绝后等待隐藏的draft-load超时；r2测试显式清空这些参数再转场，未放宽产品守卫。
- Vue build／check逐byte一致、shell65、三JS与两TXT模块语法及diff通过。七代码主动LSP120秒／并发2均push-only未确认；TXT无服务，不称clean。两文档主动LSP warning视图clean；mode=all缓存101文件仍37项既有warning及1hint，未屏蔽。无后端、web/src或DDL变化，不重建原生束，不重复无影响Root／规则／Trial运行／发布链；无新增独立测试脚本。本批浏览器是前端夹具，不冒真实服务鉴权或浏览器原生卸载对话框证明。

## 后继：同修订明确重读清理地图准备

修前已复现：作者同意重新读取当前修订后，补底数值仍保留19，继续导航还会被本地参数守卫提示。原组件只观察游戏／修订／verified，成功重读相同修订时这些值没有变化。

草稿控制器现在只在完整响应校验并安装成功时递增本地 `readGeneration`，随context投影给两地图表单；它不是源修订、身份票据或持久字段，不进入保存正文／journal。MaterialsPanel和BaseTerrainPanel在成功读取代次变化时执行原上下文清理：清放置准备、平移、补底输入及相应选择／分页。读取提示明确说明将放弃本页未保存资料和地图准备参数、不保存或重试；确认只是允许读，取消、运输失败、坏DTO或迟到失效不能发出成功读取代次。普通面板导航／Trial确认仍不丢参数，原单journal和未确认操作禁重读门保持。

该批仍只覆盖这两类地图表单，不宣称全部实体取消流程完成；水域准备的后继接线见下节。连续拖动浏览未实施：核读发现现有render会复制整份实例DTO，未直接把它接入每帧，也没有扩建缓存／刷新框架或新增性能探针；这不是性能测量或整个任务阻塞。

证据前缀 `.dragon-analysis/editor-completion/map-reread-`：

- `before.log` 真实Vue夹具浏览器在同修订重读后实际得到 `'19' !== ''`。修后 `controller-final.log` 复用两控制器150项通过，原本地地图参数用例增加成功读取代次／取消不变／请求失败及坏sourceDigest不变断言，全部请求仍无保存正文。
- 最终 `browser-r2.log` 工作台138项通过，产物 `.dragon-analysis/editor-workbench/run-T6ckFs/result.json`。明确确认文案、补底同修订重读后空值／空选取／重新锁定、随后导航不再误提示；素材准备／平移／勾选遇坏回包保持，正常同修订重读才清空。原导航确认保参数、取消不GET、保存／原键恢复及画布流程保持。r1亦通过，r2在明确重读提示加入后复跑；真实gateway／Vue／全新Chromium，但API为显式夹具，不冒真实后端权限或新的发布链证据。
- Vue build／check逐byte一致，shell65、两JS及TXT模块语法、diff通过。四代码主动LSP120秒／并发2均push-only未确认；TXT无服务，不称clean。两文档warning视图clean，mode=all缓存102文件仍32项既有warning，未屏蔽。没有后端、web/src或DDL变更，不重建原生束或重跑无影响Root／规则／真实服务素材链／Trial／发布长链；未增加独立测试脚本。

## 后继：地图准备在五个共享选择入口的保护

复核 `client.txt` 的 `hasLocalMapInputs → shell.mapInputs()` 接线及五控制器共享选择后，未发现需要另建全局状态或更换保存目标的问题。既有 `verify_editor_authoring_context.mjs` 补充地图准备布尔端口：草稿元数据本身无脏修改时，分别从草稿、据点、武将、地图、发布选择另一游戏，取消均保留原选择及已读上下文、零新增请求／journal；同意后才同步五个选择并清已读草稿。`canLeave(true)` 直接拒离开且不调用确认。测试不模拟Vue表单清理；具体参数及重读清理由下节等已有组件证据承担。

本批仅修改既有测试，15组通过。输入是显式API夹具、内存Map journal和注入的地图准备布尔值，不是后端认证、原生beforeunload对话或新浏览器验证。只读取五份控制器TXT并以data URL导入，不访问网络、数据库、真实存档或浏览器profile。证据在 `.dragon-analysis/editor-completion/context-map-preparation-20261029/`：`tests-r2.log`、`before-r2.json`／`after-r2.json`；8项选定源码SHA保持，非全部传递依赖证书。r1同样15组通过；随后将测试中的嵌套三元选择改为入口映射以消除新增风格警告，r2重新通过。语法／diff通过；主动LSP为push-only未确认，不能称clean。未改产品、Vue或构建资源，因此不重建壳或运行无影响规则／发布链。A04整体仍部分。

## 后继：水域准备离开保护与重读清理

真实Vue夹具已复现：仅选定合并新组的小地图显示值、尚未保存时，原地图离开守卫未识别这项准备，取消导航的期望失败。`WaterGroupsPanel` 和 `WaterCreatePanel` 现在经既有MapPanel／壳布尔端口报告明确的合并／新建显示值；仍不复制表单到原生控制器、source或保存正文。普通勾选、筛选、分页以及仅选择拆分成员不是数据参数，不增加离开确认。

复用原 `canLeave`／明确重读合同：取消保持准备且不发请求；确认普通导航保值；成功安装同修订DTO后，两水域组件观察既有 `context.readGeneration` 清准备及选择／筛选／分页。取消或失败读取不会产生成功代次。新增“取消合并准备”“取消新建准备”，仅清各自的显示值和选取，不保存、不清其它表单或原操作键；原纯选取清除按钮仍只清选取。

证据前缀 `.dragon-analysis/editor-completion/water-input-guard-`：

- `before.log` 新导航断言实际失败 `false !== true`（离开没有被拦）；修改后 `browser-r1.log` 工作台141项通过（原138＋3），产物 `.dragon-analysis/editor-workbench/run-wt9Yo6/result.json`。覆盖仅显示值也受保护、取消导航／读取零请求、确认往返保值、显式取消只清本项、纯选取不阻导航，以及两类表单同修订明确重读清空；原水域新建保存正文、其它脏metadata不捎带、收据后读取和全工作台流程保持。
- 浏览器是实际gateway／Vue／全新Chromium，API为显式夹具；不冒新的真实后端权限、浏览器原生beforeunload对话或完整实体表单认证。复用了既有入口，没有新增独立探针。
- Vue build／check逐byte一致，shell65、测试语法及diff通过。四代码主动LSP180秒／并发2仍push-only未确认，不称clean。两文档主动warning视图clean，mode=all缓存102文件仍32项既有warning，未屏蔽。没有改原生控制器、服务、web/src或DDL，不重建原生束；未重复无影响的控制器、Root、真实素材／水域长链、规则、Trial／发布回归。现有真实水域脚本核读未发现需要新增导航确认的路径，未把历史收据算作本批运行。
