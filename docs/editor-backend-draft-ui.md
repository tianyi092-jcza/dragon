# 私有资料表单：实际认证与明确保存

## 限定范围

以下初始批次的“仅元数据可写／四资源只读”为历史范围；四资源写入后继见[章节资源](editor-chapter-resource-write.md)，当前本地取消行为见本文末节。历史收据不作为新源码验证。

`E-01-BACKEND-DRAFT-UI-1`把[私有固定副本API](editor-backend-private-draft.md)接入独立后台。只有名称／简介可编辑；20章及既有公开槽四资源只读。不是完整工作台、可玩数值域、原生初始化、地图／角色编辑、共同编译器执行、Q69／Trial／发布或完整E-01完成。

从413声明输入出发，只改Root固定Text资源路由、后台HTML/client，新增`server/public/draft.txt`和实际浏览器生产者；410旧输入（含375玩家输入）保持。Root API、SQL、R2、固定来源／profile和游戏规则不改。没有部署、云创建、安装、提交推送、实际用户profile／IDB／SAVE或全局信任调整。

## 页面合同

- 实际会话与强制改密门；管理者／作者都只能查看自己的清单。选择游戏后，必须明确加载指定已保存修订，不自动切latest。DTO、DOM、SessionStorage及本地session对象引用不赋服务器权限；底层仍由真实owner／epoch／完整源／profile／CAS门裁决。
- 名称8／简介20码点，trim／NFC，控制字符／孤立代理拒。作者文字用textContent；资源数值仅只读显示，不以signed24/u16表示域批准可玩控件。
- 未保存资料通过原生确认处理加载／换目标／登入／改密／登出及beforeunload；取消保留原字段与上下文。busy期间不提交另一操作；会话／加载本地代次改变后拒应用迟到结果。失效隐藏私有面板，不伪称保存成功；明确登出后清本页私有输入。
- 保存捕获原规范body、游戏、期待修订与唯一key；只提交元数据和空resourceEdits。失败、412或失去回应保留原输入，不自动另起key、重试或覆盖latest。明确查询永久操作后才确认成功；实际failed且仍有原内容时，可明确同key／同body／同条件重试。
- 可选SessionStorage只保存actor关联的`gameId/revision/key`，不存作者输入、密码或CSRF，不是持久授权。reload丢失原body时不能重造同键请求。查询确认committed可展示结果，但没有实际精确draft读时仍禁用编辑。

## 原请求未送达且原内容丢失

操作404只说明查询当时无记录，不证明在途请求已结束。没有原body时不能重造请求，也不能直接另起key。

明确实际改密成功会由账户服务撤销所有旧epoch，原请求即使迟到也不能通过既有提交复查。页面仅在这个真实成功回调后允许确认放弃输入并加载明确修订；随后404不撤销这条已知事实。**这不宣称原保存失败、成功或SQL已取消，不删除服务记录，也不自动替用户改密。** 不能用仅登出当前cookie推断所有未知旧会话均已撤销。

改密后的本地确认不是可序列化权限；若在重新加载草稿前再次刷新，只保留原操作关联，仍须重新查询或明确改密。此处是保守的最小恢复路径，非完整取消任务协议。

## 实际验证

证据位于`.dragon-analysis/editor-phase/backend-draft-ui-session-r1/`，每轮绑定实际源码／410保护输入并前后核验；截图独立路径且buffer写入`wx`，不覆盖历史。

- `ui-r1`五组通过；补beforeunload取消／no-op／实际作者独立会话后`ui-r2`七组通过，产品不为测试调期待。
- `ui-r3`最终八组真实Root、owned SQLite/R2、HTTPS8787与fresh Chromium：自身清单／实际不可变draft1、textContent与20章只读；dirty加载及beforeunload取消、超长字段无POST；服务真实提交2后仅在浏览器网络层丢回应、原字段保留和原键查询；实际另一写者提交3、陈旧2的412／查询failed／同键重试／确认加载3；提交4后丢回应并reload，仅操作关联、查询结果不冒完整draft读；实际读4与clean no-op保4；独立真实作者看不到管理者游戏；另一次POST在网络层**未送到Root**、reload无body、真实404、用户明确改密及再次404、确认加载4恢复，无额外保存。
- 两次丢回应都有实际服务200后才abort，不伪造成功；未送达负控单独说明，不混作已提交。最终记录10个Node实际API请求及6个浏览器保存尝试，其中1个未送达，不能把它计为服务执行。browser错误0、外网0、IDB0；两套独立工程会话，不读取用户profile。
- 当前后台API逻辑不变，`draft-r4`九组50实际请求、`epoch-r2`三组18实际受控请求均通过；当前表单接线后`browser-r17`真实账户浏览器六组／实际持久启动器重启通过。不是全库存87游戏回归或完整工作台证明。
- 交付前全历史SHA复核发现首轮静态收集器把仍在写的自身log收为empty SHA，不能采其PASS收据。原收据和producer归档，排除在进程日志、结束后独立复核与签log；只修收集器，不重跑产品或冒静态全通过。
- 诊断／语法／静态逆差／来源与历史图片SHA／文档链接另封存；不把unsupported／unavailable／push-only或空缓存当全clean。测试结果不代源机制或目标完成。

## 后续

完整受权地图／实体／章编辑、共同compiler与图片依赖、Trial全部门、发布／玩家／删除引用及备份恢复仍开放。[完成工作表](editor-goal-completion.md)及[需求索引](editor-requirements-matrix.md)保持未完成项，不用此表单关闭E-01或全目标。

## 后继资料与四资源的本地取消

资料面板新增“取消资料与资源编辑”。确认后只恢复名称、简介及**所有章节**四资源到当前私有已读值；空白／非法数值输入也可放弃，不必先修成能保存的值。保留作者填写的修订输入、所选章、人物表单与地图准备；不推进readGeneration、不换loaded、不触发GET／POST、保存journal或存储操作。恢复不是读取服务器最新值，也不是取消服务器任务。

控制器仅在真实本地身份仍匹配、非busy、已有verifiedRead、无任何保存attempt／坏journal且这两类输入实际有变化时允许取消；确认后重核原票据、身份版本、loaded和同一组门。未知保存响应、刷新恢复的原键、已知失败待处理操作不能通过此按钮丢弃。人物／地图还有修改时，原离开保护继续生效。

复用既有验证，产物前缀 `.dragon-analysis/editor-completion/draft-cancel-`：

- `controller-r2.log` 78项通过（新增一组），覆盖取消／接受、非法数值、已读值恢复、typed999与readGeneration保持、独立地图准备仍拦离开、确认时身份版本变化拒绝、busy拒绝、丢保存响应后原journal与输入不被取消。`controller.log` 首轮77／78：新夹具从首次load之前就声明地图准备，正常触发了加载确认，测试却期待零次；仅改夹具为load完成后再置准备，产品守卫未放宽。另按本轮诊断对该测试内六处原字符串拼接定点改等价模板字符串，无批量格式或换行处理。
- `workbench.log` 全新Chromium147项通过，`.dragon-analysis/editor-workbench/run-Jyc07n/`。实际gateway／Vue、明确API夹具；两章资源及名称／简介先改，取消确认保输入，接受后全部恢复、typed999保留、无新GET／POST、恢复干净时按钮禁用；保留其余工作台流程。不是新后端权限、真实保存或Trial证明。
- Vue build/check逐字节一致、shell65、两测试JS及TXT模块语法、diff通过。三代码主动LSP300秒仍未确认（一超时、两push-only）；TXT无服务，不称clean。两文档主动warning视图clean；mode=all缓存107文件36项warning（含该测试旧spread写法5项），未屏蔽，不称全仓clean。
- 无后端／web/src／DDL变更，不重建原生束，不重复无影响的Root／实际保存／规则／Trial／发布长链；没有新增独立测试脚本。完整编辑器及全部编辑面的取消／离开矩阵仍未关闭。

## 后继共用实体保存与连续章节复制

内容层的复制时点、保留后代并删除来源及生成ID生命周期已有历史实现，不能再按A18早期总表把它们视为全部未接。此次审阅发现 `verify_editor_backend_draft_ui.mjs --copied-entity-only` 的武将段仍等待旧表保存后自动刷新，与已交付的共用journal不符；修的是既有验证入口，不重做产品或复制规则，也未执行旧入口负控来声称新的产品失败。

现先接受两个姓名／字prompt，再分别取消和接受共用保存确认。取消不发GET／POST；接受只提交saved metadata、空resourceEdits及一个rename-general命令，If-Match取已读3而不是手填999。收据4不自动GET，独立武将表仍显示修订3且禁写；明确共用读4后旧表继续锁，独立刷新同修订表才解锁。保留此前据点city-native精确保存及取消流程，并把原章保持断言扩大为全部20章，而非只核第一章。

真实新轮复用 `--node-service --copied-entity-only`，自有Node、文件SQLite／FileBucket、固定41来源安装、HTTPS、真实管理员登录／完整复制及全新Chromium。没有成功API回包替换、用户profile或正式IDB访问。六个范围组对应：

1. 初次复制1→2后的21章缺口数量／明细与实际Vue展示一致，展开不发请求，不授运行准入。
2. 副本据点兵力city-native保存2→3，确认取消零请求、精确正文、收据锁及显式读回；20个原章完整DTO及旧2保持。
3. 副本武将文字经共用journal保存3→4，取消／隔离正文／双读解锁如上；此前据点修改、全部原章及旧3保持。
4. 再复制修改后的章4→5，后代独立ID，复制时点姓名／字、城市及势力投影保留，既有所有章保持。
5. 删除复制来源5→6，后代及其它章完整DTO不变，不级联删除后代。
6. 删除后代6→7，最终全部20个原章完整DTO等于修订2时的原章投影。

`chapter-copy-shared-journal-http-r100.log` 首轮6组通过；r101补齐全部原章相对初始投影的断言后仍 **6组通过**，不是合并成12组。最终截图 `.dragon-analysis/editor-phase/backend-draft-ui-session-r1/ui-r101.png`，收据含25个测试源码／资源SHA，6次浏览器保存、丢回应0次、errors／outside为空，IDB访问0。旧r88／r95及其它未知回应链保持各自历史范围，本批不冒新丢回应、角色／画像全部组合、原生raw全字段、空章初始化、Trial或发布证明。

MJS语法、diff及链接检查通过；当前源码、两轮日志、截图和主动诊断见 `chapter-copy-shared-journal-final-hashes.json`。仅既有工具与文档变化，无产品／Vue／web/src／DDL／资源修改，不重建两束，不重复无影响的控制器／夹具工作台／规则／Trial／发布长链。A18仍为部分完成，剩余组合恢复和可玩初始化不能用这六组代替；后继本组合的复制丢回应恢复见下节。

## 后继连续章节复制丢回应恢复

继续复用同一个 `--node-service --copied-entity-only` 入口，不新增产品写入路径。在实体修改后再次复制4→5时，浏览器填写修订999，但实际POST仍用已读4、saved metadata、空resourceEdits及单一copy命令。真实服务完成并返回200／修订5后，测试仅在浏览器网络边界丢弃回应；原21章仍在且保存禁用，没有自动读回或重复复制。

刷新前核sessionStorage只含gameId／key／revision关联，不存正文。刷新后重试禁用，明确查询原键得到已提交5；查询收据仍不能开启编辑／Trial，也不把收据当作新章列表。随后明确读5才安装唯一后代。捕获的整个恢复段恰为一条POST保存、一条原键GET、一条 `revision=5` 的精确GET；没有新键或再次POST。后续删除来源5→6保后代，再删后代6→7保全部20原章的既有断言继续通过。

`chapter-copy-recovery-http-r102.log` 首轮 **7组通过**（原六组＋复制恢复一组），收据 `.dragon-analysis/editor-completion/chapter-copy-recovery-r102-receipt.json` 含25个执行前固定并在结束复核的源码／资源SHA及 `copiedChapterRecovery` 正文、原键、修订与请求轨迹；截图 `.dragon-analysis/editor-phase/backend-draft-ui-session-r1/ui-r102.png`。整条链仍6次浏览器保存，丢回应1次，errors／outside为空，正式IDB访问0。真实管理员登录、自有Node／文件SQLite／FileBucket、固定来源、HTTPS及全新Chromium，无成功API夹具；自签HTTPS例外限自有测试会话，不冒生产TLS。

本批仅修改既有测试和文档，没有产品、Vue、web/src、DDL或资源变化，不重建两束，不重复无影响控制器／工作台夹具／规则／Trial／发布长链；未运行默认combined或workerd模式。MJS语法、diff、链接、收据源码及截图摘要核对通过，主动诊断见 `chapter-copy-recovery-final-hashes.json`。这是该复制组合的未知回应恢复证据，不替代所有角色／画像组合、全部权限、原生raw写集、空章初始化或完整A18／A19验收。

## 后继章节开局日期只读展示

章节页新增同一明确已保存修订的开局日期显示。`PrivateDrafts.read`从该章`state.start`投影`startDate={year,month,day}`，没有日期则null；不取当前运行日历、第一章日期或最新修订，也不为中立空章补日期。共同控制器在DTO边界校验完整三整数字段，旧DTO缺失／null保持未知，错误响应原子拒绝而保留原上下文；输入与展示模型各自复制，不能通过Vue对象回写已读值。

`DraftPanel.vue`每章显示“開局日期（唯讀）”或“未提供／未知”，没有日期输入、保存动作或初始化推导。该值只是已读来源表示，不等于日期编辑已开放或可玩准入；原日期解码／历史采用边界见[日期维护源](editor-date-adoption.md)。现有元数据／四资源保存正文不夹带日期。

验证证据位于 `.dragon-analysis/editor-completion/chapter-start-date-view-20261029/`：

- 共同草稿控制器107项通过，新增缺值、264年2月3日显示模型隔离、八种坏结构原子拒绝、保存无日期及身份清理；API为明确夹具。
- 工作台230组通过，真实Vue／gateway／新隔离Chromium，API为夹具；两章分别显示明确值与未知，没有日期写控件或额外请求。结果 `editor-workbench/run-ctbsFN/result.json` 的errors／unexpected／failed为空，不冒真实HTTPS日期读取证书。
- 真实自有文件SQLite／FileBucket的`verify_vps_city_save.mjs --native-only`25项通过；20章日期逐项等于精确保存源，原新旧city历史、旧修订可读与对象计数检查保持。principal／来源登记为明确夹具，不是HTTP登录或可玩空章。
- 583项选定源码／资源SHA前后保持；四JS语法、后台Vue build／check逐字节一致、shell65通过。只重建后台壳，不改web/src、原生束、固定库、DDL或规则，不跑无影响游戏／发布回归。

本批主动LSP五份代码均未确认（四份push-only、一份超时）；两份文档只见三条既有词典提示。`mode=all`八路径缓存另列六条既有测试warning（五处展开数组、一处console）及25条风格／词典hint，不据空缓存或构建成功称全部clean。TXT通过实际控制器加载与后台构建验证；未批量改动无关测试风格。

## 后继章节日期真实HTTPS复制保存验证

复用 `verify_editor_backend_draft_ui.mjs <ui-r106.png> --city-native-only --node-service`，新增日期断言而不改产品。实际Node共同服务、独立文件SQLite／FileBucket、固定20章来源、自有HTTPS、真实管理员登录／改密与全新Chromium，成功回包不替换；只有测试自身回环访问，正式IDB访问为0。

本轮四个范围组通过：复制首章保存到修订2后，21章页面日期逐项等于独立认证GET取得的精确修订DTO，复制章日期等于来源章；检查日期控件为空、只读检视零请求。随后既有city-native单城兵力保存到3，显式重读后所有日期仍与2相同，返回章节页仍对应精确3；独立读取旧2全文保持。原确认取消零POST、typed999不进入CAS、保存后不自动GET、旧行锁至显式读回的断言继续通过。实际浏览器仅两次保存（复制章／兵力），没有日期写入或丢回应注入。

证据 `.dragon-analysis/editor-completion/chapter-date-https-20261029/` 含运行日志、完整结果、602项选定输入前后相同SHA；25个入口源码摘要与 `backend-draft-ui-session-r1/ui-r106.png` 截图摘要另行核对。errors／outside为空，语法和限定diff通过。该入口仅city-native聚焦，不冒默认长链、workerd、日期编辑／初始化、Trial或发布；缺值／坏DTO仍由前批夹具证明，不把本轮完整原章日期当成中立日期证据。

## 后继默认组合链完整复验

本轮不改测试或产品，实际执行 `node tools/verify_editor_backend_draft_ui.mjs <新截图路径> --node-service`，不带任何聚焦选项。独立Node文件SQLite／FileBucket、真实HTTPS登录／改密及全新Chromium，默认combined **23组通过**，保存至修订18，20次浏览器保存请求、4次已提交后主动丢回应；另有一次明确发送前中断，不计作服务提交。

前16组包含资料／资源读取与校验、脏离开取消、NFC与资金保存、实际并发CAS412及同键重试、刷新只留操作关联、no-op不升修订、独立作者看不到管理员副本、未送达且失正文后的真实404／改密恢复、章节改名丢回应、资源修改后的复制、空白章创建／改名／删除及删除原章。空白章明确保留缺口，不认定可玩初始化。随后七组继续在同一历史上验证city-native保存14、武将文字15、复制16丢回应原键恢复、删来源17保后代、删后代18；最终保留的19个原章完整DTO与删除前相应原章一致，不拿聚焦模式的20章结果替代。

证据 `.dragon-analysis/editor-completion/draft-combined-https-20261029/{before.json,after.json,tests-r1.log,exit-r1.txt}`：602项选定源码／资源SHA前后相同，收据25项源码及截图 `editor-phase/backend-draft-ui-session-r1/ui-r105.png` 摘要复核，退出码0。意外错误／外连均空，正式IDB访问0；预期401／404／412及主动断网错误独立记录。测试保留自有临时资料，浏览器／监听／SQLite正常关闭；无生产或真实存档操作。

语法、diff及链接检查通过；两文档主动LSP与mode=all仅台账三处既有标识／摘要词典hint，无error／warning，不冒全仓clean。

该收据补齐当前Node默认组合模式，不是workerd默认combined、全部实体字段／角色写集、认证权限全矩阵、Trial／发布或完整编辑器证明；两运行时复制聚焦模式见[各自七组收据](editor-city-definitions.md#后继复制实体https长链复验)。
