# 水域组合小地图显隐：共同写入、草稿API与界面

## 范围

依据[产品合同](game-editor-design.md)地图分层节：组合的 `showOnMinimap` 是内容显示开关，不是工作区隐藏／锁定，也不改大地图、完整地理类别、规则或道路。现已完成共同写入器、中立模板与完整副本的受信历史、精确修订草稿API／组DTO，以及共用地图面板的显式保存。中立模板已有真实浏览器原键恢复证据；完整副本新增接口／控制器及专门的真实登录浏览器写入链现也通过验证（见文末）。**已保存修订的预览像素API、显式按钮和原生Canvas已接，真实浏览器逐像素摘要核对通过**；下方几何示意图不是小地图预览。后继已接两profile的改名、明确成员合并／拆分及共用选择界面；最新拆分浏览器只覆盖管理员自有完整副本，详见末节。本地studio原有直接操作没有在此改接，不据此声称完整互联网地图已经可编辑。

`web/src/editor/componenttools.js` 新增 `setWaterGroupMinimapVisibility(source,groupId,visible)`：要求显式boolean、唯一且已存在的组、已有boolean原状态。沿用copy-on-write事务与共同合成校验，失败不改变输入；只更改选中组合的显示标志。没有创建、合并、删组、改成员、改类别、道路、底层或规则的权限。输入是受信／已校验JSON源，不是执行任意JavaScript对象的沙箱。

`FixedCopyProfile.verifyOrderedTemplate` 的受信步骤可选 `mapEdits`，缺省与旧三列表步骤兼容；每步最多16项，显隐基础批次的唯一命令为 `{op:'water-visibility',groupId,showOnMinimap}`，全部键精确核验，接在该步章节／定义／人物操作之后。继承原描述子拒绝、捕获能力检查及完整候选比较，不能夹带其它地图修改。基础批次未扩完整副本legacy校验；本页末分别记录完整副本内容端口及后继HTTP／界面接线。基础批次的PrivateDrafts请求捕获仍拒绝 `mapEdits`；后继显式接线见下节，不是由内部profile自动开放HTTP。

## 基础批次验证

日志在 `.dragon-analysis/editor-completion/`：

- `water-history-before.log`：尚无新历史命令时实际固定模板候选被 `COPY_TEMPLATE_HISTORY` 拒绝，保留为先行负控。
- `water-history-r3.log`：12组、41固定来源输入、getter执行0。实际模板显示开关改变小地图地理摘要，而完整terrain／geography、章节、compatibility和道路不变；整个候选只差该boolean。无历史、改组名称、未知组／命令、非boolean、额外键、null／超16列表和getter均拒绝；正反操作恢复基线，真实source codec往返成立。不是原版运行／像素或可玩初始化证明。
- `water-components-r2.log`：共同组件117项、原36失败控制、5850拾取和3891框选核对通过；新增显示开关往返／等值、成员数组输出隔离、缺组／重复组／缺原flag／坏成员／坏boolean拒绝且输入不变。首轮 `water-components-final.log` 因测试误把合并后的成员顺序假定为a,b而失败；改为捕获实际原顺序作隔离比较，没有更改产品排序。该首轮短路，Root未运行。
- `water-root-r2.log`：实际common Request、文件SQLite／FileBucket、41固定输入原34组通过；增加空／非空 `mapEdits` HTTP请求均422 `REQUEST_FIELDS`、无请求行及草稿变化。认证为种子夹具，不冒真实登录／浏览器／生产证明。
- 五个修改JS/MJS语法及 `git diff --check` 通过。未改Vue或用户可用接口，不跑无关浏览器、完整原副本72项存储恢复或原版战斗回归。

主动LSP七路径2份clean、4份push-only未确认、1份超时；session全量107文件19项warning、23项hint/info。新出现的componenttools第6行控制字符正则告警针对既有名称校验（故意拒绝控制字符），本批未改该行、未屏蔽；其它18项为既有告警。不称全仓或LSP全部clean。

原生程序束按既有全树协议重建232文件，重复构建 `water-bundle-check.log` 为 unchanged；摘要 `85d494fccce55eea3ee0fbe30b95712c1199668f6e65d569b1ab90c91d33f1fe`，Trial／Play壳摘要不变。不登记新程序、不更新固定库身份或放宽生产准入；无需Vue构建。该批次尚缺的API／DTO后继见下；仍不能以本基础关闭A09／A11或完整目标。没有提交、推送或部署。

## 后继精确修订API与组摘要

`PrivateDrafts` 在原保存入口接受可选 `mapEdits`，缺省字段不补入旧请求JSON。沿用总16KiB、单列表16笔、原请求键／body、所有权／epoch、CAS和不可变对象／SQL收据。仅上列精确命令可用；在章节、定义、人物命令之后调用共同setter，再由整段受信历史核验完整候选，不能任改map。该初始批次完整副本拒绝非空mapEdits为 `DRAFT_MAP_PROFILE`（本页末后继已接完整副本）；不存在的组为 `DRAFT_MAP_EDIT`。没有增加DDL、独立存储或新的后台授权。

精确修订read额外返回顶层 `waterGroups`：中立模板是 `{groupId,name,showOnMinimap,memberCount,baseCellCount}` 数组；该初始批次完整副本为null（后继现在返回同形摘要）。仅显示摘要，不输出可修改成员列表或私有对象地址；旧地图几何DTO不变。read／captureForCompile／后续save都重放已提交map历史，服务重建后保持，旧无mapEdits收据原字节不改。

`water-api-root-r2.log` 及最终 `water-api-root-r3.log` 均38组通过：实际共同Request、文件SQLite／FileBucket和41来源；原34组保留，把已过时的“mapEdits一律拒绝”负控改为坏列表／未知命令拒绝。新增13→14显隐保存、原键重放／查询、精确DTO和全源只差一个flag；坏命令／原生字段／超16／坏boolean／未知组无对象写入，异作者／管理员404、陈旧修订412、原键不同body409、完整副本拒绝。等值不递增14，重启后恢复显示至15，全源回到13，旧13／14及旧请求JSON不变；坏历史组ID在read／capture拒绝，恢复测试记录后可重读。Trial仍409、发布仍未编译，trial／release行仍0。不是浏览器、真实登录／HTTPS、云或可玩新局证明。

首轮 `water-api-root-r1.log` 在坏历史测试失败：只翻转较早boolean，被同修订另一合法等值请求重新声明的flag覆盖，最终内容仍相等；这是测试把最终内容校验当成每条历史正文认证的错误假设。负控改为不存在的历史组ID（后续不能修复该非法引用），产品校验未因此放宽；不宣称此测试认证每条旧请求正文。

同轮 `water-api-history.log` 12组、`water-api-shell.log` 65项、`water-api-controller.log` 草稿39组，以及 `water-api-legacy.log` 完整副本实际保存／静止恢复72项通过。`water-api-schema.log` 仍23来源／50表／49索引／343列／4FK。两修改脚本语法、diff检查通过。新增DTO嵌套三元风格告警已改为等价if，最终r3再次38组通过；72项完整副本链在此模板DTO等价整理之前运行，完整副本分支未变。主动LSP四路径1文档clean、1 SHA词典信息、两脚本未确认（push-only／超时），最后服务文件重探仍超时；session全量107文件18项既有warning、23项hint/info，未屏蔽或称全clean。本后继仅后台／测试／文档，未重建Vue或原生束、未跑浏览器；待用户操作层接线后另验丢失回应及确切重读，不冒已有表单证明。未提交、推送、部署或改变生产维护门。

## 后继前端保存控制器（尚未挂载表单）

本标题保留控制器批次历史锚点；当前表单后继见下一节。

`server/public/draft.txt` 在原唯一草稿控制器增加 `water` 显示投影与 `waterVisibility(groupId,visible)` 动作。读取缺摘要为未知／不可编辑；仅中立模板接受精确字段、唯一ID、boolean及非负整数成员摘要，非法回包不半替换任何旧上下文。投影为独立副本，不拿Vue改写的行作保存权威。

动作要求已验证的确切修订，原生确认清楚说明仅改小地图显示；等值不请求，取消不留操作键。确认返回后重核身份、代次、loaded及人物表上下文。只携带已保存metadata与一个mapEdits，不保存另一个表的未提交输入；16KiB与写入操作键成功是POST前提。原sendAttempt／query／retry绑定原键、原body、原修订；收据使旧投影失效，必须显式精确重读，但保留未保存名称／资源／人物表。重载只恢复三字段操作关联，不重造body或另起请求。

`water-controller-r1.log` 控制器26组通过（原22＋4），新增非法／重复／未知摘要、投影隔离、丢失回应原键重试、重载查询后精确重读、其它表未保存输入保留、取消／等值／坏值／quota／确认时身份与游戏变化无POST。`water-controller-draft.log` 原草稿39组、`water-controller-context.log` 上下文10组、`water-controller-shell.log` 接线65项通过。上述是显式API／确认／storage端口夹具，不是浏览器原生quota、真实确认或后台鉴权证明。

该控制器批次尚未挂载Vue表单、没有新增可点击用户入口；后继完成情况见下一节。未改后台、原生源或任何准入，因此不重跑不相关38组Root／72项存储恢复，也不重建Vue／程序束。完整A09/A11和目标仍未完成。语法／diff检查通过；主动LSP一文档clean、测试push-only未确认、TXT无服务、审计文档仅SHA词典信息，session全量107文件仍18项既有warning、23项hint/info；未屏蔽或称全部clean。

## 后继地图面板与真实保存恢复

新增 `WaterGroupsPanel.vue` 经Workbench将既有draftModel／draftActions交给MapPanel，复用原唯一草稿控制器与journal。显示确切游戏／修订、组合身份／名称、成员数与已读显示状态；按钮是显式命令，不先修改行或假显示已保存。支持原操作查询／重试、确切修订加载；未知／不支持／待查询／待重读／busy时按原投影禁用。所有文本用Vue插值，无HTML注入或上传入口。不持有规则状态，不另开保存服务。只读道路几何仍由native控制器绘制，并明确不预览水域显示结果。

`water-ui-build.log`／`water-ui-check.log` 构建及逐byte核对通过：JS350411B、CSS33898B、8包许可；只重建编辑器壳。gateway／Vue工作台72项通过 `water-ui-workbench.log`（`run-nRqgvc`），这是既有界面回归，不冒新API证明。

`verify_editor_template_browser.mjs r16` 在自有HTTPS、真实Node共同Root／文件SQLite／FileBucket／41固定来源、全新Chromium、实际管理员及作者登录／强制改密下18组通过（`water-ui-browser-r16.log`，stderr为空）。保留前17组创建／人物／章节链；新增实际地图面板取消无POST，服务提交25后仅丢弃浏览器回应，重载→原键查询→显式读取25，不发第二次保存；恢复显示26后整个sourceDigest回到24，旧24／25及人物／章节／192城／道路DTO不变。水域POST仅2次，无正式IDB、外连或非预期页面错误；初始session401及预设丢回应ERR_FAILED单列，不泛化忽略错误。不是云端、完整地图编辑、像素预览、初始化、Trial或发布证明。

产物 `.dragon-analysis/editor-phase/template-browser-r16/{receipt.json,template.png}`；截图已检查，水域表格与道路示意区分明确，列表沿用滚动容器。`water-ui-static.log/json` 独立复核18组、2次水域POST、19份当前源码／壳与截图SHA一致、stderr／错误／外连为空。浏览器测试只对成功提交回应做传输故障，没有伪造成功API。程序束、服务端和规则未改，未重复未受影响的38组Root／72项恢复；仍需小地图显示预览和其它完整地图能力。没有提交、推送、部署或开启生产维护门。

UI批次控制器26组、shell65项再次通过（`water-ui-controller.log`／`water-ui-shell.log`）；语法及diff通过。主动LSP七路径1份文档clean、4份代码未确认（3 push-only、1超时）、两文档SHA词典信息；session全量108文件18项既有warning、23项hint/info，未屏蔽或称全部clean。生成TXT不作为支持的LSP文件，使用build/check逐byte核验。

## 后继已保存修订的小地图像素API

新增只读 `GET /api/games/:gameId/draft/minimap?revision=:revision`，唯一且必填的revision参数，不接受尺寸、seed或其它参数。`PrivateDrafts.readMinimap` 复用确切快照／来源／完整历史核验；捕获前后及计算结束复核所有者、epoch、删除栅栏与来源。仅作者可读自己的模板，管理员可读自己完整副本而不能读作者私稿。缺章初始化不妨碍显示预览，但仍不授予Trial／发布准入。

像素直接来自现有 `compileMapSource` 的 `minimapGeography/roadMask` 与共同 `renderMinimapPixels`，使用既有large规格250×167、textureSeed=1及MINIMAP_STYLE_REVISION，不另写预览配色／水域或道路算法。返回 `dragon-draft-minimap-1`、gameId、draftRevision、sourceDigest、styleRevision、textureSeed、width／height、pixelFormat=rgb8、pixelsSha256及pixelsHex。RGB固定125250 bytes；没有任意输出尺寸、文件URL或原始私稿。该API仅返回静态地理／道路背景，不含势力、据点标记或导航命令；后继[小地图定位窗口](editor-viewport.md#后继小地图定位已读窗口)在界面层接线，不改变本API或RGB字节。不会取最新源、保存预览对象、写编译任务或生成运行票据；意向列表也不会被当成已保存地图渲染。

`minimap-preview-root-r2.log` 实际common Request／文件SQLite／FileBucket／41来源41组通过（原38＋3）：修订13、隐藏14、恢复15的完整DTO与共同生成器逐byte相同，隐藏像素摘要改变、恢复回原像素且旧14仍隐藏；管理员自己的完整副本输出同源图像。异作者／管理员越权404、内置403、匿名401、坏／重复／多余参数422、POST404；重建服务后旧修订仍相同。首个对象读取期间禁用账户立即401，只读一次；恢复自有测试账户后可重新读取。坏map历史也拒绝预览。预览过程中桶put=0，draft_objects／draft_requests／trial_sessions／content_releases计数不变，旧源DTO不变；“无内容写入”不涵盖正常session活动续期，不能外推为全SQL不变。

首轮r1已41组通过；r2将POST负控由宽泛4xx/5xx拒绝改为精确404，并增加匿名401后再跑通过。shell65项、schema仍23来源／50表／49索引／343列／4FK，三文件语法及diff通过（`minimap-preview-*`）。认证为种子夹具，不冒真实登录、HTTPS、浏览器像素或云证明。本批没有改共同算法、原生束、Vue、草稿写入路径或生产门，没有重跑旧r16浏览器或无关72项保存恢复；该API批次尚缺前端显示控件、摘要核验和迟到回应隔离；控制器后继见下。原版机制／初始化／完整地图／Trial与发布目标仍未完成。

本API批次主动LSP三个JS为两个未确认（push-only／超时），Root测试只有正确的await成员括号提示；最后测试重探仍超时，两文档在warning阈值未发现告警。session全量108文件19项既有warning、23项hint/info，包含再次出现的drafts旧boolean参数告警及componenttools既有控制字元正则；未屏蔽或称全部clean。

## 后继预览控制器（尚未挂载Canvas）

本标题保留控制器批次历史锚点；当前Canvas接线及真实像素验证见下一节。

`draft.txt` 保留精确read返回的sourceDigest；旧回包缺失时仍可沿旧合同编辑，但预览不可用，显式错误摘要拒绝整次读取且保留旧投影。`actions.minimap` 只请求已载入对象的游戏／修订，不使用输入框里尚未载入的修订；不自动请求、不保存脏表单或另起journal。

收到数据后校验精确字段集合、game／revision／sourceDigest、250×167／RGB8／seed1、受限风格标识、hex长度与字元；默认用WebCrypto SHA-256核对125250 bytes后才保留。网络及摘要计算两次await后都复核原ticket、身份、loaded对象和无待定保存。原生控制器私有RGB、来源与身份绑定；Vue只获得ready／locked及小份身份摘要，不获得像素或可写source。`getMinimapCanvas`端口及redraw用原生ImageData绘制不透明RGBA；重读／换游戏／换身份不复用旧预览，非法预览回包先清旧图，迟到回复不重新画图。

保存尝试在POST及journal写入前清预览；任何确认保存收据使来源摘要变为未知，预览须再次明确读该修订（不改变原有其它字段是否可继续编辑的策略）。未保存名称等输入不进入预览，不能把旧像素贴上新修订标签。风格标识仅描述显示，不是程序兼容／可玩证明。

`minimap-controller-r1.log` 及最终 `minimap-controller-r2.log` 控制器30组通过（原26＋4）：实际Node WebCrypto摘要、RGB→RGBA和透明度、只请求已载入而非输入修订、投影隔离／无journal、12种坏身份／尺寸／格式／像素／摘要拒绝，API返回与摘要返回各自晚到×换身份／游戏四组合均不画，旧缺摘要禁用、保存前清像素及确切重读恢复。Canvas为显式内存端口，不冒真实浏览器像素验证。原草稿39组、共享上下文10组、shell65项、全新gateway／Vue既有工作台72项通过（`minimap-controller-*`）；该工作台没有触发尚未挂载的预览入口，不能充作新像素UI验收。语法及diff通过。

本控制器批次仍未挂载用户预览按钮／Canvas；没有改Vue、后台、共同算法或原生程序束，不重复41组Root／72项存储恢复或旧r16真实后台链。实际浏览器像素核对、显示与保存恢复联合链仍待下一步，完整目标继续；没有提交、推送、部署或放开生产准入。

主动LSP一文档clean、测试push-only未确认、TXT无服务、审计文档SHA词典信息。session全量曾报21项warning，其中本测试新增两项spread告警已改为直接比较Uint8ClampedArray并重跑r2；其它19项为既有告警，未屏蔽。最后测试主动重探仍push-only未确认，不称全部clean。

## 后继原生Canvas与真实浏览器像素

本节记录初始Canvas批次；当前等比显示及点击定位见[后继小地图定位窗口](editor-viewport.md#后继小地图定位已读窗口)。当时 `client.txt` 为原草稿控制器提供Canvas引用，`WaterGroupsPanel.vue` 仅管理固定250×167元素生命周期和显式预览按钮；挂载后调用原生redraw，卸载清引用，像素不放入Vue响应式树。页面显示确切来源／修订／风格，注明只是已保存地理／道路背景，不含脏输入、意向、据点标记或导航；不是完整地图编辑或可玩准入。未创建第二个预览缓存／请求控制器。

`verify_editor_template_browser.mjs r17` 真实HTTPS／Node Root／文件SQLite／FileBucket／41来源／全新Chromium／真实登录19组通过，保留r16的18组流程（`minimap-ui-browser-r17.log`，stderr为空）。新增明确预览24、隐藏后25、恢复后26：从实际Canvas读取RGBA，确认250×167且全部alpha255，再用浏览器WebCrypto计算RGB SHA，与真实API返回的pixelsSha256逐一相同；隐藏摘要改变，恢复与24相同。没有自动预览请求；保存未知回应及reload／重读均保持空图，须显式点击。负控仅篡改真实响应的pixelsSha256，控制器报错并清图，不显示旧成功图；撤销拦截后真实重试恢复。共5次预览GET、仍仅2次水域POST，无正式IDB、外连或非预期页面错误；初始401及预设丢回应另列。此负控不是伪造成功API，也不证明所有网络／身份竞态已完成浏览器覆盖。

产物 `.dragon-analysis/editor-phase/template-browser-r17/{receipt.json,template.png}`；已检查截图，水域背景、修订标签和下方几何示意区分明确。独立核签见 `minimap-ui-static-r2.log`／`minimap-ui-static.json`，包含19份当前源码／壳及截图SHA、19组／5次GET／2次写入和空错误／stderr。构建及逐byte检查 `minimap-ui-build.log`／`minimap-ui-check.log` 通过：JS352469B、CSS33898B、8包许可；既有gateway／Vue工作台72项（run-hGFDjI）、控制器30组、shell65项、语法及diff通过。只修改编辑器接线／展示和隔离测试，不改后台、共同算法、原生束或生产门；未重复未受影响的Root41／保存恢复72项，不把旧成绩冒作本批重跑。完整四层地图、初始化、Trial／发布及目标仍未完成；未提交、推送或部署。

首次独立核签误按TAP的`# tests 30`识别实际Node spec输出，检查失败且未生成收据；按实际`ℹ tests 30`／`ℹ pass 30`／`ℹ fail 0`复核后重跑，不改测试或产品结果。

本UI批次主动LSP五路径1份文档clean，Vue和浏览器脚本两项超时未确认、client.txt无服务，审计文档仅SHA词典信息。session全量108文件19项既有warning、23项hint/info；未屏蔽或称全部clean，生成壳用build/check核对。

## 后继完整副本显隐内容校验（接口尚未接线）

本标题保留基础批次锚点；接口后继见下一节。

为落实完整副本与中立模板共用已批准编辑能力，`FixedCopyProfile.verify` 新增受信第五参数mapEdits。仅完整副本可用此参数；中立模板仍走原逐请求顺序端口。每条严格限制为water-visibility命令，对捕获的基线调用同一setter，最终仅将期望waterGroups用于完整候选比较，不替换整个map。既有章节／资源命令不修改组身份或成员，因此这些boolean操作与其相互独立；不凭候选值重构历史，不允许顺带改名称、成员、道路、其它组或人物。访问器／函数对象在读取op前拒绝，基线与输入不变。

新 `verify_editor_fullcopy_water.mjs` 实际41来源、20章验证11组通过（`fullcopy-water-after-r2.log`）：只有一个flag改变、无历史拒绝、捕获身份、等值／往返摘要、章改名＋复制联合、真实source codec往返、非法组／命令／boolean／额外键／稀疏数组拒绝、getter执行0、中立profile不能绕到新端口；未声明的map／人物变化仍拒绝。先行 `fullcopy-water-before.log` 实际返回COPY_PROTECTED_DELTA，说明旧门确实未提供该能力。

原中立顺序12组通过 `fullcopy-water-template.log`；完整旧profile回归 `fullcopy-water-profile-r2.log` 通过20章、2540来源ID、41输入、78拒绝和getter0。首次串行组合600秒超时：前两项已结束，但旧profile日志为空，不算通过；确认该自有测试进程不再运行后单独以1800秒预算重跑完成。shell65、两脚本语法和diff检查通过。该内容批次没有改PrivateDrafts、HTTP、DTO、控制器或Vue，当时完整副本仍拒绝HTTP mapEdits且显示摘要为null，不能宣称管理员表单已可用；后续须接历史重放／保存／读取和界面再验。未重建程序束或壳，未冒旧Root／浏览器为新增接口证据，也未改原版规则或生产门。主动LSP四路径2份clean、1份push-only未确认，审计文档仅SHA词典信息；session全量109文件19项既有warning、23项hint/info，未屏蔽或称全部clean。

## 后继完整副本API与共用控制器

`PrivateDrafts` 现在把已提交请求中的mapEdits按既有修订顺序交给完整profile第五参数；save调用同一setter，read／captureForCompile／minimap重放同一历史。完整副本返回同形waterGroups摘要，不再返回null；generalDefinitions／chapterPeople仍为null，不因此获得中立人物创作权限。原捕获body、16KiB／16项、所有者／epoch／栅栏、CAS、原键和不可变对象提交机制未改变，未新增DDL。管理员只能改自己的完整副本，不能借此写他人或内置。

原draft控制器仅将水域白名单扩至这两个既有profile；共用原journal、确认、原body重试和精确重读。其它人物门不变。WaterGroupsPanel同步说明两种自有来源，不增加第二套表单、写入路径或规则。缺摘要旧DTO仍锁定，不解释成空组。

`fullcopy-water-api-root.log` 实际common Request／文件SQLite／FileBucket／41固定来源45组通过：保留原41组（旧全副本一律拒绝改为未知组拒绝），新增完整副本1→2／原键重放和查询、精确DTO与全源只差flag；异作者404、陈旧412、原键改body409、等值仍2；重建服务后旧1／2保持，恢复3回到完整基线及原像素。未知组历史使read／capture／minimap拒绝，修复自有fixture后重读一致，trial／release行仍0。认证是明确种子夹具，不冒HTTPS登录／浏览器或可玩证明。

`fullcopy-water-controller.log` 31组含完整副本未知回应／原键重试／重读和人物门仍关闭；原草稿39组、shell65、gateway／Vue工作台72项通过。后者是既有界面回归，并未执行完整副本水域实际后台写入，不代替专门浏览器验收。实际PrivateDrafts完整副本存储／静止恢复72项通过 `fullcopy-water-api-legacy.log`；schema仍23来源／50表／49索引／343列／4FK。构建／check通过，JS352484B／CSS33898B／8包许可；语法与diff通过。没有改原生程序束、原版规则或生产门，没有重跑或借用旧r17当新增完整副本浏览器证据。完整目标未完成，未提交／推送／部署。

## 后继完整副本真实浏览器写入

新增 `tools/verify_editor_fullcopy_water_browser.mjs`，独立自有HTTPS／Node Root／文件SQLite／FileBucket／固定来源及全新Chromium，无成功API夹具。`r1` 三组联合流程通过（`fullcopy-water-browser-r1.log`，stderr为空）：从实际管理员登录、强制改密、UI来源登记和完整复制开始，读取20章／192据点／水域组的确切修订1；取消开关无POST，保存2服务已提交后仅丢弃浏览器回应，旧预览清空且不能重发，reload→原键查询→显式重读2只产生一次保存；恢复3后完整源摘要与1相同，旧1／2及所有章节／地图／据点DTO不变。两次水域POST，人物定义权限未开放。

三个修订都从实际Canvas读RGBA，核250×167／alpha255及WebCrypto RGB SHA与真实预览API相同；隐藏改变像素，恢复回到原图。没有正式IDB访问、外连或非预期页面错误，初始session401和故意丢回应单列。截图 `.dragon-analysis/editor-phase/fullcopy-water-browser-r1/water.png` 已检查，显示管理员／修订3及小地图背景；receipt记录13份当前源码SHA、像素摘要和两次原操作。只验证已有组合显隐／预览，不证明其它地图编辑、运行写回、Trial／发布或生产放行。本批只新增隔离测试和文档，未改产品代码／束，未重复Root45／恢复72或旧中立长链。独立核对13当前源码SHA、截图SHA、3组／2POST、像素改变／还原及空stderr，记录 `fullcopy-water-browser-static.json`；语法／diff通过。主动LSP文档1份clean、脚本push-only未确认，审计文档只有SHA词典信息；session全量110文件仍19项既有warning／23项hint-info，不屏蔽或称全部clean。

本API／控制器批次主动LSP七路径1份文档clean、4份代码未确认（2 push-only、2超时）、draft.txt无服务，审计文档仅SHA词典信息。session全量109文件19项既有warning、23项hint/info，未屏蔽或称全部clean。

## 后继组合改名共同写入器（尚未接保存接口）

本标题保留内容层批次锚点；后继已接历史、API、控制器prompt及Vue按钮，真实浏览器范围见末节。

新增 `renameWaterGroup(source,groupId,name)`，只替换唯一已存在组合的name，沿用现有组件命名的1–64码点输入预算及trim，不转换用户文字、不把名称作为身份。额外拒绝C1控制字元和未配对代理项；既有创建／合并命名器未在本批重写。调用原copy-on-write事务与共同合成校验，失败不改输入；成员、基础格、显示flag及其它源内容保持不变。输入仍是受信／已校验JSON源，不提供任意JavaScript对象沙箱。

`water-name-before.log` 因新增导出尚不存在而失败；`water-name-after-r2.log` 共同组件122项通过（原117＋改名5组），包括整源只差name、完整合成结果相同、真实JSON往返、往返／等值、非BMP64码点及65拒绝、坏文字／未知或重复组／坏成员拒绝且输入不变、输出成员与原源隔离。既有36失败控制、5850拾取、3891框选核对保留。`water-name-profile.log` 完整副本11组与 `water-name-template.log` 中立历史12组回归通过，原profile仍拒绝未授权名称修改；这些成绩不是新增保存接口或浏览器证明。

该基础批次只完成共同内容层，当时HTTP命令、历史允许项、原键恢复和改名表单尚未接线，不宣称作者已可通过后台改组名。程序束按全树协议重建232文件并重复核为unchanged，摘要 `aa8a705f7fe6f3d4a00dbf62aa97b32f3a73f68fe9c1bf67ae6f3a232f63d3da`，Trial／Play壳摘要不变；不登记程序或更新固定库身份，不放宽生产／规则准入。未改Vue、后台、DDL，不重复无关真实浏览器或完整存储恢复长链。

## 后继组合改名历史与保存API

两种受信profile现在精确接受 `{op:'water-rename',groupId,name}`，与原water-visibility共用内部严格记录捕获；先拒绝访问器／函数／额外或缺失键，再调用共同writer。中立模板按逐请求顺序重放，完整副本仍仅替换捕获基线的期望waterGroups作全源比较；不放开成员、其它组、道路或原生记录。名称与显示命令的顺序保留，不把最终候选当历史依据。

`PrivateDrafts` 原保存入口显式接受该命令，保持原mapEdits16项、总16KiB、原键／body、确切修订CAS及所有权／epoch／不可变对象提交。raw请求名称保存于原body，writer只按既有命名合同trim，不重写旧收据。read／capture／minimap从同段历史重放；DTO仍用既有name字段，无新DDL或接口地址。改名仅影响源摘要，不改变预览像素；本批仍没有改名按钮／prompt或浏览器新流程。

- `water-name-history-before.log`：旧profile确实以COPY_MAP_DELTA拒绝新命令。`water-name-history-final.log` 19组通过（保留原11＋两profile各4组），包括改名／显隐交错、真实JSON、倒序／无历史／夹带成员拒绝、精确键／坏文字／getter0及基线不变；原中立12组通过 `water-name-history-neutral-final.log`。
- `water-name-api-root-r2.log` 实际common Request／文件SQLite／FileBucket／41来源51组通过（原45保留）：中立15→16、完整副本3→4按同入口改名，原键重放与查询、全源仅name变化、像素相同，坏文字／未知组／混入flag拒绝且无对象写入，越权404／陈旧412／原键改body409／等值不增修订，重建服务后新旧修订与旧像素均稳定；trial／release仍0。会话为种子夹具，不冒真实登录、HTTPS、云或运行证明。
- 首轮 `water-name-api-root.log` 1800秒超时、日志为空，不算通过；确认无残留该自有Node测试进程后，以5400秒预算独立重跑完成。旧失败文件保留，没有调宽产品超时或认证策略。
- 四JS语法通过；schema仍23来源／50表／49索引／343列／4FK（`water-name-api-schema.log`）。未改web/src或Vue，不重建原生束／编辑器壳；未重跑无新入口的改名浏览器流程或无关72项存储恢复，不借旧成绩证明新接口。完整目标、地图编辑／初始化／资源／删除闭包仍未完成，无提交／推送／部署或生产门变动。

## 后继改名控制器（尚未挂载按钮）

本标题保留控制器批次锚点；后继按钮与真实浏览器验证见末节。

`draft.txt` 的 `waterRename(groupId)` 与显隐共用保存动作：从当前已核验组名弹出prompt，取消不继续；校验1–64码点输入预算、trim、控制字元和未配对代理项，保留分解Unicode文字而不做NFC转换。等值不提交。确认列出稳定组ID与新名，prompt及confirm返回后都重核身份、代次、载入源及表单归属，不能接续旧上下文。

仅提交已保存metadata、空resourceEdits及一项water-rename；不提交其它脏表单。沿用16KiB、操作键先落存储、原body查询后重试、刷新后仅恢复关联及精确修订重读，不乐观修改组名。成功前后的预览失效和其它表单保留仍走既有mapEdits协议；没有新后台写入口。

`water-name-controller.log` 34组通过（原31＋3组）：两profile改名／分解字及非BMP、原键原body重试、不重复prompt、未保存资料保留、精确重读；prompt／confirm取消、等值、坏字元／超长／坏ID、存储失败、两对话返回时身份或游戏变化均无POST／journal；刷新仅查询原操作再读确认修订。`water-name-draft.log` 40、`water-name-context.log` 14、`water-name-shell.log` 65通过，语法检查通过。均为明确控制器端口，不冒真实native对话框、浏览器或后端鉴权证明。未改Vue／生成壳／后台／原生束，未重复未受影响的Root51或存储恢复长链；按钮和浏览器验证仍待后续。diff检查通过；主动LSP文档1份clean、测试push-only未确认、draft.txt无服务，审计文档只有SHA词典信息。session全量115文件仍18项既有warning、23项hint/info，未屏蔽或称全部clean。

## 后继改名按钮与真实浏览器

`WaterGroupsPanel.vue` 每组增加「改名」按钮，沿用busy／water.locked及现有控制器动作；说明更新为名称与显隐。不添加第二套保存、乐观组名或新后台权限。

`verify_editor_fullcopy_water_browser.mjs r2` 在自有HTTPS、真实Node Root／文件SQLite／FileBucket／41来源及新Chromium中通过4组（保留原3组显隐／像素／恢复）。真实管理员登录／改密／完整复制后，改名prompt取消和后续confirm取消均无POST；修订4服务提交成功但浏览器回应被故意丢弃，刷新后只能原键查询再精确读4，没有重复改名POST。保留分解Unicode、非BMP及字面`<img>`，无HTML图片节点；组ID／成员／flag、20章／192城／地图投影和旧修订3不变，只有组名及源摘要变化；真实Canvas RGB SHA与改名前相同。全程3次保存（两次显隐、一次改名）、无IDB访问、外连或非预期页面错误。日志 `water-name-browser-r2.log`／空stderr，收据和截图位于 `.dragon-analysis/editor-phase/fullcopy-water-browser-r2/`。

编辑器壳build/check通过；控制器34、shell65、隔离工作台72通过 `water-name-ui-{controller,shell,workbench}.log`。13份当前源码SHA、截图SHA、4组／3写及空错误独立核对见 `water-name-ui-static.json`。此浏览器证据限定管理员自己的完整副本；中立路径由已有双profile控制器／Root验证，不冒本轮真实作者浏览器证明。无后台／原生束／DDL变化，不重复Root51或存储恢复长链；无提交、推送、部署或生产门变动，完整地图编辑与总目标仍未完成。主动LSP四路径1份clean、1份push-only未确认、测试既有DOM查询hint及审计SHA词典信息；session全量115文件仍18项既有warning、23项hint/info，未屏蔽或称全部clean。语法／diff检查通过。

## 后继显式成员组合合并历史（尚未接API）

标题保留内容层批次锚点；后继保存API及界面已接，验证限定范围见末两节。

内部profile新增精确记录 `{op:'water-merge',groupIds,groupId,name,showOnMinimap}`，复用已有 `mergeWaterGroups` 和名称writer；至少两个不同、已存在的组合，所有成员仍须满足共同工具的显式水域分类要求，显示值必须显式boolean。新身份限当前gameId的`#water-`加64位小写hex命名空间，并在完整历史中保持已用ID集合；合并后消失的旧ID不得重新分配。这个ID合同不是权限或服务器分配接口。

中立模板按原逐请求顺序执行；完整副本仍仅用重放所得waterGroups替换捕获基线的比较对象，整源其它字段必须一致。姓名／显隐命令可继续作用于新组。未知命令、额外字段、访问器、坏成员或名称拒绝。该内容层批次HTTP捕获只允许water-rename／water-visibility，当时尚无合并API、ID分配或UI；内部内容证明不构成持久作者准入。

首轮 `water-merge-history-before.log` 暴露首个导入显示组合含不满足共同工具条件的成员，工具以“只能組合明確標注的水域組件”拒绝；没有放宽此门。测试改为从实际固定源选择明确符合既有工具条件的组，并保留该不可合并组合的直接writer／profile负控。第二先行轮 `water-merge-history-before-r2.log` 确认原profile以COPY_MAP_DELTA拒绝新命令。

`water-merge-history-after-r2.log` 25组通过（原19＋双profile各3组）：41固定输入、完整副本20章及中立模板，合并成员／基础格顺序完整保留，整源只有组合列表变化，真实JSON往返、跨请求连续合并、已删除新ID再利用拒绝、倒序／无记录／夹带成员／坏或重复引用／缺boolean／坏名称／稀疏数组拒绝；getter执行0，基线摘要不变。`water-merge-neutral-r2.log` 原中立历史12组、`water-merge-shell.log` 65项通过，语法／diff通过。首次精确替换有一处匹配不唯一，仅已成功项落盘；立即补齐中立调用参数后才执行测试，没有遗留unused变量或半接线。

本批只改服务端内容profile及隔离测试，无共同核心／后台保存协议／Vue／DDL／程序束变动，不重复未受影响的真实浏览器、Root51或存储恢复长链。它不是任意合并、道路／地形规则、新章初始化或完整地图编辑的放行证书。主动LSP文档1份clean、两JS push-only未确认、审计SHA词典信息；session全量115文件仍18项既有warning、23项hint/info，未屏蔽或称全部clean。

## 后继合并保存API与稳定ID

原保存入口新增 `{op:'water-merge',groupIds,name,showOnMinimap}`，严格拒绝客户端提供groupId。至少两项不同的已有组ID、明确boolean及名称；原mapEdits最多16项、整请求16KiB保持。只从当前已核验源执行已有共同工具，分类不明的导入组仍拒绝，不补成员语义。

新ID由服务端确定为 `gameId + '#water-' + SHA256(JSON.stringify(['dragon-water-group-1',gameId,actorId,operationKey,index]))`，index是本请求mapEdits中的位置。同原键／body恢复同ID，同批不同位置得到独立ID；这是身份而非权限。原请求JSON保存未分配ID的原命令，历史捕获按保存的actor／key／位置重新解析，没有新分配器表或重写旧body。名称／显隐旧记录保持原样；两profile继续全源保护比较、跨历史ID不复用、原所有权／epoch／精确修订CAS及不可变对象事务。

`water-merge-api-root.log` 实际common Request／文件SQLite／FileBucket／41固定输入57组通过（保留原51＋两profile各3组）：中立16→17、完整副本4→5各同批合并两对明确成员，两个server ID不同且符合算法；原键重放／查询不重复创建，存储请求中没有客户端groupId，实际源仅组合列表改变、成员／基础格顺序及其它章／城／定义不变。坏／重复／缺失／分类不明成员、客户端ID、坏名称或非boolean均422且无draft对象新增；越权404、陈旧412、原键改body409。重建服务后新旧修订稳定，实际预览像素SHA等于共同生成器；坏合并历史使read／capture拒绝，恢复自有fixture后正常；新ID可在下一修订改名。trial／release仍0。

`water-merge-api-history.log` 双profile内容25组、`water-merge-api-controller.log` 现有控制器34、shell65通过；schema仍23来源／50表／49索引／343列／4FK，语法／diff通过。本批没有合并表单或真实浏览器新流程，Root会话为显式种子夹具，不冒登录／HTTPS／云证明。未改共同核心、Vue、DDL或程序束；没有重复未受影响的存储恢复72或旧显隐／改名浏览器成绩。完整地图、任意组合、原生初始化／Trial／发布与总目标仍未完成。主动LSP文档1份clean、三个JS push-only未确认、审计SHA词典信息；session全量115文件19项既有warning（含drafts旧boolean参数的重复报告）、23项hint/info，未屏蔽或称全部clean。

## 后继合并选择、控制器与真实浏览器

水域面板增加逐组勾选、无默认值的新组显示选择与合并按钮；至少两组和明确显示值才可提交。仅保存本次合并，勾选本身不写内容；换游戏／修订／载入验证状态清空本地选取。Vue只持有选择ID和显示选择，不持有可写游戏源。说明明确分类不明时服务仍拒绝，不把摘要列表当可合并证明。

控制器从已验证水域摘要捕获有序ID副本，拒绝重复／缺失组或非boolean；prompt输入新名，确认列出全部原组名／ID、原身份移除及新组显示状态。两次对话返回都重核身份、代次、载入源及表单对象；不猜新ID、不乐观删除原组、不保存其它脏表单。沿用原操作日志、16KiB、先持久化key、原body查询后重试；刷新只查询原键并精确重读收据修订。未知回应时新保存锁定。

- `water-merge-controller-r2.log`／最终`water-merge-ui-controller.log` 37组通过（原34＋3组）：两profile捕获ID顺序且调用者随后修改数组不改请求、明确false、分解字／非BMP、其它输入保留、原body重试不再prompt；取消／非法选择／无明确显示／存储失败／两对话身份或游戏变化无POST；刷新后仅原查询＋精确读取server新ID。草稿40／上下文14／shell65回归通过。
- `verify_editor_fullcopy_water_browser.mjs r3` 自有HTTPS／真实Node Root、文件SQLite／FileBucket、41来源、新Chromium和真实管理员登录／完整复制通过5组（保留原4）。选择固定源两个明确水域组合后，无默认显示时按钮禁用；prompt及confirm取消都不写且保留选择。合并5服务提交成功但浏览器回应故意丢失，刷新后原键查询／精确读5只产生一次合并POST，新组ID由服务分配、两组成员与基础格计数相加、原两ID移除；旧4及20章／192城／地图投影保持。选择／显示控件在新修订清空，实际Canvas RGB SHA与预览API一致。全程4保存（显隐2、改名1、合并1），无IDB访问、外连或非预期页面错误；日志 `water-merge-browser-r3.log`／空stderr，收据截图 `.dragon-analysis/editor-phase/fullcopy-water-browser-r3/`。
- 编辑器壳build/check、控制器37／shell65／隔离工作台72通过 `water-merge-ui-*`；13份当前浏览器源码SHA、截图SHA、5组／4写与空错误独立复核 `water-merge-ui-static.json`。语法／diff通过。

本浏览器只证明管理员自己的完整副本和这两个明确成员组；中立API／控制器已有独立验证，未冒本轮中立作者浏览器或任意组可合并证明。未改后台、共同核心、原生束或DDL，不重复Root57／存储恢复72。该合并批次尚缺拆分，后继见下；任意语义组件、道路／据点移动／扩容、初始化／资源／Trial／发布及完整目标仍未完成；无提交、推送、部署或生产门变动。主动LSP六路径1份文档clean、三份代码未确认（一次超时、两份push-only）、draft.txt不支持，审计文档SHA词典信息；session全量115文件19项既有warning及23项hint/info，未屏蔽或称全部clean。

## 后继拆分历史内容校验（尚未接API）

标题保留先行批次的历史锚点；保存接口的后继实现见下一节。

两profile的内部map历史新增严格命令 `{op:'water-split',sourceGroupId,groupId,memberIds,baseCells,name}`。仅复用共同 `splitWaterGroup`：明确选择原组的完整成员／基础格，原组至少保留一项，新组继承原显示开关；不拆多格实例、不改成员分类或地形。新组身份继续限定本游戏 `#water-`＋64位摘要且全历史不可复用，拆出后又合并删除也不例外。名称继续通过共同改名器检查；未知字段、访问器、稀疏数组、非字符串成员／非整数基础格先拒绝。保护比较仍只替换重放得到的waterGroups，未放宽其余源数据。

`water-split-history-before.log` 确认新增命令原先被COPY_MAP_DELTA拒绝。`water-split-history-after.log` 31组通过（原25＋两profile各3组，41固定输入）：实际成员拆出、原成员次序／基础格保留、隐藏开关继承、整源仅组合列表变化、真实JSON往返、拆分后合并及已删除ID拒绝复用、倒序／缺历史／夹带成员／空或重复选择／全选清空原组／坏数组和名称拒绝，getter执行0，原捕获摘要不变。本轮正例为实际完整组件成员选择，未声称新增基础格选择的浏览器覆盖。原中立历史12组和shell65通过（`water-split-history-neutral.log`、`water-split-history-shell.log`），语法及diff通过。

本批只改服务端内容profile与其隔离测试；保存接口仍拒绝water-split，未增加分配ID、成员DTO或界面。未改共同工具、原生束、Vue、DDL或运行门，不重复未受影响的Root57、存储恢复72及合并浏览器。后续仍需保存协议／成员选择投影、原键恢复和真实用户流程；不是任意水域语义、完整地图或总目标完成证书。主动LSP在warning阈值两文档clean、两JS push-only未确认；session全量115文件19项既有warning及23项hint/info，未屏蔽或称全部clean。

## 后继拆分保存API与成员投影

保存入口现接受严格 `{op:'water-split',sourceGroupId,memberIds,baseCells,name}`：原组ID、不同的完整成员ID／非负整数基础格组成非空选择，禁止客户端groupId／showOnMinimap及其它字段。原组必须仍有成员、所选必须确属原组且通过共同工具水域条件；新组继承原显示状态，坏名称仍由共同改名器拒绝。新身份沿用上节合并的原actor／操作key／mapEdits位置算法；历史重读同样解析原body，没有新分配表、默认规则值或额外权威。

精确修订草稿DTO新增独立 `waterGroupMembers[{groupId,memberIds,baseCells}]`，数组从核验后的源复制，不改变既有waterGroups摘要五字段。仅列明确成员，不宣称每个导入显示成员都有可编辑语义；接口仍逐项核对，未知不能据此放行。权限、epoch、保存CAS、原键查询／恢复、16KiB和16命令上限、不变量比较与不可变对象提交沿用原通道。

`water-split-api-root-r2.log` 63组通过（原57＋两profile各3组）：实际common Request／文件SQLite／FileBucket／41固定输入，中立18→19、完整副本6→7；server ID精确符合算法，原键重放／查询不重复拆出，存储原body无groupId。实际整源只变组合列表，原组其余成员／基础格保留、新组继承显示、成员DTO对应实际源，原章／城／人物／地图投影不变。客户端ID、缺失／重复／空／全组选取、坏数组／基础格／名称／额外显示值均422且无新draft对象；越权读写404、陈旧412、原键改body409。重建服务后新旧DTO／旧预览稳定，新预览像素SHA不变；坏成员历史使read／capture拒绝，恢复自有fixture后正常，trial／release仍0。首轮同样63组通过；复核发现部分非法输入负控可能先撞到“已移走成员”而非被测字段，r2改从共同writer已确认合法的剩余子集逐项破坏，再重跑整轮通过，没有放宽产品校验。

控制器37／草稿40／shell65回归和schema检查通过（`water-split-api-{controller,draft,shell,schema}.log`）；schema仍23来源／50表／49索引／343列／4FK。语法与diff通过。此处认证为显式种子夹具，不冒真实登录／HTTPS／浏览器验证；该API批次尚无成员选择表单、拆分控制器或新用户流程，后继见下一节。没有改Vue、共同核心、原生束或生产门，未重复未受影响的存储恢复72及合并浏览器，总目标仍未完成。主动LSP在warning阈值两文档clean、两JS push-only未确认；session全量115文件19项既有warning、23项hint/info，未屏蔽或称全部clean。

## 后继拆分选择控制器与真实浏览器

控制器读取waterGroupMembers时核对完整组序、精确字段、摘要计数、全局唯一成员／基础格和固定地图格范围；不完整回包原子拒绝，缺失是未知，只锁拆分，不伪装为空。Vue拿独立副本；动作从私有已验证投影捕获选择数组，再弹新名prompt与影响确认。须为原组非空真子集，原组保留成员；新名同既有64码点／trim规则，不转换用户文字。两个对话返回均复核原身份／代次／源／表单；沿用唯一journal、16KiB、保存前持久化原键、未知回应原body恢复和精确重读，不分配客户端ID、不提交其它表脏输入。

水域面板新增无默认原组选择、完整组件／基础格勾选及拆出按钮；空选／全选／缺清单／未确认修订禁用。组件身份不可拆成图格，基础格显示索引与坐标；新组继承显示。换组清成员选择，换游戏／修订／验证状态清全部拆分选择，仅是工作区选择，不写内容。

- `water-split-ui-controller.log` 41组通过（原37＋4）：清单隔离／坏身份计数重复与越界拒绝、旧缺清单未知；两profile成员／基础格／混合选择在prompt前捕获，调用者随后改数组不改原body，原键重试不再prompt且保留其它输入；取消／非法子集／quota／两次对话换身份或游戏均不写；重载仅原查询再读服务端新ID。原草稿40、上下文14、shell65通过。首次上下文命令误用不存在文件，MODULE_NOT_FOUND保留在`water-split-controller-context.log`，更正实际入口后`-context-r2.log`通过，未算失败轮为通过。
- `verify_editor_fullcopy_water_browser.mjs r4` 自有HTTPS／真实Node Root、文件SQLite／FileBucket／41来源、全新Chromium及真实管理员登录，保留原5组并扩至6组。对刚合并的明确成员组选择一个完整组件，prompt／confirm取消均无写；拆分6服务提交后只丢浏览器回应，刷新原键查询／精确读6只一拆分POST。新server ID、剩余成员顺序／基础格、新组继承隐藏、旧5及20章／192城／地图保持，选择在新修订清空；真实Canvas RGB SHA与API匹配，且拆分前后像素相同。全程5保存，无正式IDB／外连／非预期页面错误，stderr为空。日志`water-split-browser-r4.log`，收据／截图在`editor-phase/fullcopy-water-browser-r4/`；截图已检查。
- 编辑器build/check、隔离gateway工作台72、语法／diff通过（`water-split-ui-*`、`water-split-controller-diff.log`）。13份当前浏览器源码／截图SHA及6组5写独立复核见`water-split-ui-static.json`。

该r4真实浏览器仅覆盖管理员自有完整副本的组件成员拆分；基础格与混合选择后继见下，中立路径仍由明确控制器端口覆盖，不冒新中立作者浏览器或任意导入成员语义证明。未改后台、共同核心、原生束、DDL或生产门，未重复未受影响的Root63／存储恢复72。完整地图、道路／据点移动／扩容、初始化／资源／Trial／发布和总目标仍未完成；无提交、推送或部署。

## 后继基础格独立拆分浏览器覆盖

`verify_editor_fullcopy_water_browser.mjs r5` 保留原6组，新增从实际源中选择含多个基础格的组合，经Vue原组选择及基础格checkbox单独拆出一格：确认取消无写；接受后提交的baseCells为整数数组、memberIds为空，修订6→7只一新POST。精确重读确认服务端新身份、继承显示、原组剩余基础格顺序及全部组件不变，其它组／20章／192据点／地图／资料不变，旧6仍原样；工作区选择清空，实际Canvas像素SHA与API匹配且等于拆分前。

日志 `.dragon-analysis/editor-completion/water-base-split-browser-r5.log` 为7组通过，stderr为空；自有HTTPS、Node Root／文件SQLite／FileBucket／41固定输入、全新Chromium与真实管理员登录，总6保存POST，无正式IDB、外连或非预期页面错误。收据／截图在 `.dragon-analysis/editor-phase/fullcopy-water-browser-r5/`。仅扩展测试，没有改产品、构建产物或准入；当时混合组件＋基础格选择及中立用户此新路径仍未由真实浏览器覆盖；混合选择后继见下，中立路径仍未补浏览器。不重复无变更的Root63、控制器41或构建检查。

主动LSP六路径在warning阈值3份clean、2份push-only未确认、draft.txt无服务；session全量115文件仍19项既有warning、23项hint/info。未屏蔽告警或称全仓clean，生成壳使用build/check逐byte核对。

## 后继组件与基础格混合拆分浏览器覆盖

`verify_editor_fullcopy_water_browser.mjs r6` 保留原7组，再经真实Vue把已拆出的组件组、其剩余组件组和基础格组显式合并为隐藏的新组（7→8），不是注入成功数据；验证全部成员／基础格顺序、仅组集合变化及旧7不可变。随后同时勾选一个完整组件和一个整数基础格，原生确认取消无写，接受后一次保存8→9；新组继承隐藏、原组保留其余成员顺序，其它组／20章／192据点／地图／资料不变，旧8精确重读不变。实际Canvas经摘要核验的拆分前后像素相同，保存清旧图、重读清工作区选择。

`water-mixed-split-browser-r6.log` 9组通过、stderr为空；自有HTTPS、实际Node Root／文件SQLite／FileBucket／41固定输入、全新Chromium及真实管理员登录，共8保存POST，无正式IDB、外连或非预期页面错误。收据与截图为 `.dragon-analysis/editor-phase/fullcopy-water-browser-r6/`。只扩展测试，不改产品或构建产物；该混合路径仍限自有完整副本，不代中立作者的新浏览器证据、任意成员语义、初始化或可玩准入。未重复未变更的Root63、控制器41或构建。脚本语法／diff检查通过；主动LSP两份文档clean、脚本探测超时未确认，session全量116文件仍19项既有warning及23项hint/info，未屏蔽或称全仓clean。

## 后继水域列表本地筛选

水域面板新增名称／身份子串筛选，仅在显示比较时trim、NFC及小写化，不改作者文字、源数据、拆分选择或保存请求。显示匹配数／总数、全部合并选中数及筛选外选中数；筛选不会暗中取消选取，原合并确认仍列全体ID。新增“清除全部合併選取”，显式清除可见与隐藏选择，不提交内容。换游戏／修订／验证状态清筛选与选择；无匹配不冒称没有水域。

`verify_editor_workbench_browser.mjs` 73项通过（`water-filter-browser.log`，新隔离Chromium／实际gateway与Vue，API为显式夹具，产物 `editor-workbench/run-B1px8U`）：名称NFC比较但保留原分解文字、ID大小写查找、HTML转义、跨筛选选择与隐藏计数、零匹配／清全部、上下文重置均验证，纯筛选／清选择无API调用。`water-filter-build.log`／`water-filter-build-check.log` 构建和逐byte检查通过；只更新后台Vue及其生成壳，不改控制器、后端、原生束或准入。不以此替代真实鉴权保存链，未重复无变化的Root63或完整副本r5。shell65、脚本语法及diff检查通过。主动LSP四路径在warning阈值2份文档clean、2份代码push-only未确认；session全量116文件仍19项既有warning及23项hint/info，未屏蔽或称全仓clean。

## 后继新建组合受信历史（HTTP尚未开放）

本标题保留内部端口批次历史锚点；后继保存API见下一节。

两profile的内部map历史新增 `water-create {groupId,memberIds,baseCells,name,showOnMinimap}`。身份须为本游戏 `#water-` 加64位小写hex，且从未使用；成员／基础格数组须完整、类型明确，显隐必须为boolean，不能触发共同函数的缺省true。名称沿用既有水组写入器检查。通过同一 `createWaterGroup` 把明确成员转入新组，保留旧组未选部分，仅删除真正空组；被移空组的身份仍不释放。没有新增水陆分类算法，不猜基础格的地理类别，不改变道路、图块或运行规则。

这不是只能从一个原组拆出真子集的water-split；它可以组合明确组件与已有基础水格，也可在同一受信历史中接续先前明确base-fill。全部选择仍由共同writer校验，陆地、未知成员及空选均拒绝；顺序不能倒置来绕过准入。仅更新原有精确waterGroups重放结果，完整源其它字段照比；没有新根豁免、HTTP命令、客户端ID分配或第二份source。

证据前缀 `.dragon-analysis/editor-completion/water-create-history-`：

- `before.log` 新正控在未接线时实际422 `COPY_TEMPLATE_HISTORY`；`after.log` 两profile共8组通过，使用41固定Web输入。覆盖组件＋基础格明确混合组、JSON往返、完整terrain／geography不变、其它map／章／城市不变、全部转移使旧组移空／禁止重用旧ID、部分转移保原组显隐和余项、先补成水格后创建的顺序；非法／重复／稀疏成员、陆地／越界／负零基础格、缺显隐／undefined显隐、假身份／额外字段及候选夹带修改拒绝，getter执行0。
- `water.log` 既有水组31项、`base.log` 补底6组、`components.log` 共同组件123项／36拒绝／5850索引／3891框选对照、`shell.log` 65项通过。本批未修改共同helper及其默认参数，只在新内部命令要求明确boolean。
- 两JS语法与diff检查通过，主动LSP均push-only未确认，不能称clean；两文档warning视图clean，mode=all缓存66文件仍25项既有warning（根AGENTS格式23项及既有两项代码提示），未屏蔽。HTTP白名单未改，未运行或宣称新建组合HTTP保存；后续须接服务身份分配、精确历史、可选成员投影、控制器／UI及真实浏览器。无web/src／Vue／DDL改变，不重建两束，不重复无影响Root、规则、Trial或发布长链；完整地图与整体goal仍未完成。

## 后继新建组合保存API

`PrivateDrafts` 新增精确 `water-create {memberIds,baseCells,name,showOnMinimap}`。成员／基础格均为明确非重复数组，合计非空，基础格须为固定域整数；名称及显隐显式给出，实际类别、成员存在性与转移仍由共同writer核验。不接受客户端groupId。服务沿用水组身份域 `dragon-water-group-1`，由游戏、作者、原操作键和请求内index生成64位SHA身份；原键重放身份稳定，旧merge／split算法、旧body缺字段和收据不变。

保存执行共同 `createWaterGroup`／名称检查，再通过既有两profile整源顺序历史；read／captureForCompile／后续save同样重放。原16笔／16KiB、CAS、所有权／epoch、不可变对象与SQL事务不变，未加DDL。DTO沿用waterGroups／waterGroupMembers，不新增第二份源；该API批次未接可用成员候选及表单；只读候选后继见下，不宣称用户界面完整。

证据前缀 `.dragon-analysis/editor-completion/water-create-api-`：

- `before.stderr` 新正控在API尚未接线时实际422 `DRAFT_MAP_EDITS`；`after-r1.log` 的 `--base-fill-only` 扩至18组通过（原14＋两profile各2），实际common Request／自有文件SQLite／FileBucket／41来源、种子认证。原入口scope仍概括补底；新增断言包含补底后的明确水格与已有水域组件混合建组，不是只测补底。
- 逐项核服务groupId、原键重复POST／查询、实际whole source与共同writer一致、成员DTO／显隐／其它字段和旧修订；存储原JSON无groupId。缺／坏选择、陆地格、客户端ID、非boolean、额外字段、先合法后非法整批、笔数／字节预算、同键异body409、CAS412、外作者／管理员404拒绝，草稿对象数不变。
- 改自有SQL历史为未知成员后，read／compile capture／save三条路径均422；恢复记录并重建服务实例后读取一致。新操作把相同成员转入另一新ID，旧空组消失但旧修订保留；trial／release行仍0，旧body逐byte保持。不是OS进程重启、真实登录／HTTPS浏览器、运行或发布证书。
- `history.log` 内部8组、schema23来源／50表／49索引／343列／4FK、shell65通过；两JS语法与diff检查通过，两代码主动LSP均push-only未确认。两文档warning视图clean；mode=all缓存66文件仍27项既有warning（根AGENTS23、drafts既有flag参数由两分析器重复报告及其它两项），未屏蔽、不当全仓clean。没有web/src／Vue／DDL改变，不重建两束；未跑未接的创建控制器／浏览器或无关完整素材、规则、Trial／发布长链。

## 后继新建组合候选投影

精确修订GET新增 `waterCreateCandidates {memberIds,baseCells}`，仅依同一已验证源的明确字段投影：组件范围与共同groupParts一致，为decorations及roads.components中显式waterClass属于共同WATER_CLASSES者；基础格为已有非零geography的索引。不是按图像、名称、tile数值或城市外观猜水域，不返回另一份可写组件／图块源。已在组内的成员仍列出，因为新建允许明确转移；不把缺组误当没有水域。候选不授予运行准入或绕过保存时的共同writer复核。

`.dragon-analysis/editor-completion/water-create-candidates-before.stderr` 在未接DTO时先明确断言缺字段失败；`after-r1.log` 的实际Request／文件SQLite／FileBucket／41输入聚焦20组通过（原18＋两profile候选各1）。逐项对照真实源、候选ID唯一，直接修改服务返回数组不改源或后续读回；补底成陆地后两格不再候选，显式写255／3后对应格出现，已转入新组的组件仍可选。原保存／原键／CAS／权限／坏历史／旧修订／服务重建验证继续，trial／release仍0。认证为种子夹具，不冒真实登录、控制器POST、浏览器或可玩地图证书。

shell65、两JS语法及diff检查通过；主动LSP两份push-only未确认，不称clean。两文档warning视图clean，mode=all缓存66文件仍25项既有warning（根AGENTS23项、其余两代码提示），不据缓存中某项消失宣称已修复。无web/src／Vue／DDL改变，不重建两束；该DTO批次的客户端校验、选择／影响确认及真实界面保存当时仍待接；后继控制器见下，没有重复无影响完整长链。

## 后继新建组合原键控制器

`draft.txt` 新增候选校验及 `actions.waterCreate(memberIds,baseCells,visible)`。精确DTO字段、完整数组、唯一ID及基础格范围在读取时校验；缺候选或缺原组成员清单只禁新建，不禁其它已知能力。坏DTO拒绝整次安装、旧快照保留；展示取得独立副本，不从已有组的并集猜候选。

必须显式选择已读候选和boolean显隐。选择先复制，再名称prompt／影响确认：列所选完整组件及基础格、受影响原组稳定ID，说明原组保留余项、空组移除，不拆实例或改分类。确认后复核身份／代次／原loaded与表单对象；只提交已保存metadata及单条water-create，不捎带其它脏输入、不生成客户端groupId。复用唯一journal／16KiB／原键查询重试；未知回应不另发，刷新只恢复键、不重建正文，收据后必须精确读取新修订而非乐观改组。

证据前缀 `.dragon-analysis/editor-completion/water-create-controller-`：

- `before.log` 原110项通过、新3项未接时失败；`after-r1.log` 两控制器合计113项通过。覆盖两profile、候选与模型无别名、缺／坏DTO原子拒绝、已分组及未分组混合选择／显隐false、prompt时篡改选择不影响body、原已读修订而非手改输入、其它脏输入保留、丢回应原key／body重试、刷新只GET查询、无乐观改组。取消、身份／原地version变化、坏选择／稀疏／未知／负零、缺显隐、quota及16KiB均无POST。
- `root-r1.log` 的 `--base-fill-only` 实际Request／文件SQLite／FileBucket／41输入20组通过；新增两profile实际候选DTO经原生控制器读取，逐值对照、模型修改不影响私有候选、render不增加请求。此集成禁止storage写及API POST，仅GET；真实创建保存沿用原后端断言，不冒控制器实际POST或浏览器登录。
- shell65、两JS及TXT模块语法／diff通过；两代码主动LSP均push-only未确认，TXT无服务，不能称clean。两文档warning视图clean，mode=all缓存66文件仍25项既有warning（根AGENTS23项及两旧代码提示），未屏蔽。无Vue／web/src／服务／DDL变化，不重建两束；该批次的新建组合表单和真实浏览器当时尚未接，后继见下；不重复无影响Root长入口、规则／Trial／发布链。

## 后继新建水域组合表单与真实浏览器

`WaterCreatePanel.vue` 嵌入水域面板，直接使用已读候选，每页24项、文字筛选、跨页选择与页外计数；组件选择始终是完整实例，基础格显示索引／坐标。缺候选显示未知，已知空列表与筛选无结果分开；显隐初始未选，不默认true。换游戏／修订／verified或候选可用性变化清理选择。Vue只保留表单选择，名称、转移影响及原键保存仍由原生控制器负责，不持有可写源或提前添加组。

证据前缀 `.dragon-analysis/editor-completion/water-create-ui-`：

- `browser-r2.log` 工作台新Chromium101项通过，产物 `.dragon-analysis/editor-workbench/run-2WJx4x/result.json`。实际gateway／Vue／CSP，API明确夹具。新增缺候选、24／7分页与跨页混合选择、筛选隐藏项仍参与、无显隐不能提交、取消无POST、其它脏输入不捎带、旧组锁至精确读取、新作者文字转义及表单清理。页切换／筛选不发请求。
- `real-r37.log` 的 `verify_editor_template_browser.mjs r37 --base-fill-only` 9组通过：保留基础格7组，再用实际已读水域组件和刚明确填写的基础水格混合新建。实际Node服务／文件SQLite／FileBucket／41来源／自有HTTPS／真实作者管理员登录与全新Chromium，选择隐藏一项、显式不显示、确认列原组影响；取消不POST，4→5真正提交后仅中断浏览器回应。其它脏名称保留，原组表不乐观变化；刷新只恢复键、查询原操作后精确读取5，仅一次创建POST。
- 读回逐项核转移成员、原组余项／空组、保留组显隐与身份、新服务groupId、作者文字不执行HTML；基础层／地形候选／其它章与上层DTO及旧4保持，管理员越权404、正式IDB访问0、无外连／非预期页面错误。收据与截图 `.dragon-analysis/editor-phase/template-browser-r37/receipt.json`／`template.png`；共3次保存3键（两次补底＋一次新组）、33源码SHA事后全匹配，stderr空。该轮为中立混合组，不冒完整副本创建浏览器、Canvas工具、运行或发布证书。
- 初轮工作台101项、真实r36九组亦通过；随后补水域总说明的“新建”措辞并重建，最终以r2／r37为当前源码证据。Vue build/check-r2逐byte一致（JS426534B、CSS33898B、8包notice），shell65、两测试语法与diff通过。四代码主动LSP均push-only未确认，不称clean；两文档warning视图clean，mode=all缓存68文件仍25项既有warning（根AGENTS23项、两旧代码提示），未屏蔽。没有web/src／服务／DDL更改，不重建原生束或重复无影响Root／规则／Trial／发布长链。
