# E-03-INSTANCE-LIBRARY-1：装饰实例与作者素材管理

首批对应历史goal655“继续完成剩下的所有任务”中的独立桌面编辑器切片，**不是完整任务一完成证书**。当前固定384×256/192、byte-stamp/compiler0.6门不变，原件844e…/current39资源及switch保真。后端/原证依赖和整体收口见[逐项工作表](editor-goal-completion.md)。

## 实现及原子边界

`web/src/editor/componenttools.js`提供纯copy-on-write操作，成功后仍经共享composer(draft)检查；失败不替换工作区数据。本批无新KI规则或公式，也不改共用地图编译/游戏AI/RNG/存档。

- `splitDecoration`：2至256格的完整装饰实例拆成逐格子实例，必须是受信多格byte-stamp/原variant。只复用现有受composer验证的相同byte单格配方，不猜建新的机制；保持原数组位置，逐格水域mask贡献及组显示flag。子ID全新/不复用，原组成员引用展开为真正贡献水域的子ID，空组清理；后续上层仍上层。底层null不补，仅相关unknown.covering引用更新且保留priorCovering来源。素材定义本身不拆/删除，原实例来源随子实例留存。不是道路/据点拆分或任意节点增删。
- `translateDecorations`：选定完整装饰集合、明确非零整数格位移；所有成员及全footprint先验证，再一次提交。重复/缺失成员或任一超界整批拒绝，不裁切或先改一部分。成员ID、组flag/引用、base/unknown和未选实例/道路/placement不改；移动露unknown仍由严格编译拒收，不恢复旧图。
- `renameMaterial`：只改作者素材显示name，不改byte/footprint/recipe/variant/watermask。原图块配方唯读；同源语言保留，不自动转繁体。保存后sourceDigest/修订改变，但native四产物/两mini不因名称改变。
- `materialReferences/removeMaterial`：明确列装饰、道路components、placement三种定义消费者；有引用拒绝，只移除无当前引用的作者定义。不是删除共享图集、其它游戏、专属blob或旧编译快照；完整互联网资源删除/GC尚另属后台合同。
- `validateLibraryAdditions`历史API名保留兼容，当前允许新增合法定义、只改作者name、删除无同包map引用的作者定义；其它旧定义内容及原图块全部不可覆写。服务先核expectedRevision和上述结构/引用，再将同包map+definitions作共同草稿校验并写入；本地文件harness不是耐故障事务或真实认证。
- 实际`studio.js/HTML`有完整实例拆分/整数X/Y批量平移、更名/引用列表/无引用移除按钮；锁定层仍保护内容，raw配方更名/移除禁用，已用作者素材移除禁用并列引用。移除需确认；失败不改变选取，成功拆分选取新子实例。新增author ID用Web crypto，仅作者身份，不消费规则RNG。

## 本轮证据（2026-10-01）

入口/I/O先登记[验证清单](editor-local-validation.md)；扩展原两个component入口，库存仍53/98源，未以旧viewport成绩代替当前变更验证。

- [新完整机器轮](../.dragon-analysis/map-migration-2/instance-library-machine-r1/receipt.json)：18:46:37.541Z–19:08:32.974Z53入口串行全exit0，98源码及39当前资源前后SHA同。相对上一viewport98只有helper/server/HTML/studio/两个component测试六差；其余92同。全部旧功能也重跑，5退休road skip不算通过，固定RNG只证明相应Web路径而非CPU/完整战役。
- pure：44检查、28精确失败/不改调用者控制；含带mask的多格拆分/false组/后盖层/unknown引用、整批平移及其它成员不动、三消费者引用拒绝、raw配方不可改/删、作者更名/联合map无引用删除、JSON源保真。未构造未经原证认证的规则golden。
- [真实工作台收据](../.dragon-analysis/editor-phase/instance-library-machine-r1-components/receipt.json)：新owned temp/loopback/Chromium context，实际框选擷取/拖放/组拆合及既有补底；新增更名保存后六资产hash同/identity变、UI+服务拒绝已用定义、整实例拆分后三种plane及mini像素同/false组保留、整批超界完全无提交、实际平移/返回、删已无引用定义与旧compiled pack仍全同；保存重开、两PNG、20章fresh+生产JSON恢复。IDB open0、errors/forbidden0、current39/switch同。[截图](../.dragon-analysis/editor-phase/instance-library-machine-r1-components/component-workspace.png)为owned副本，不是原件新美术批准。
- 初始focused `instance-library-focused-r1`及`unit-r1.log`通过后，完整53又在相同最终代码SHA执行；没有本批产品测试失败或重写预期值。以最后完整收据为最终证据，不拼多轮成绩。
- 主动6代码/HTML：9hint（动态Scenario.cities、querySelector与正确await括号等），3有finding/3push-only inconclusive，0confirmed-clean；原常量waiting页open误报沿已有裁决重新锚定，无新增ignore/禁用规则或全局配置。7份Markdown主动检查均unavailable。session全量133文件仍列1条现有name控制码正则warning：已标本位置false-positive（明确拒绝控制码，不是意外字符），[33个拒绝/合法名接受探针](../.dragon-analysis/editor-phase/instance-library-session-r1/name-controls.log)验证安全限制；缓存仍显示，不清缓存/禁用规则/撤掉限制，不声称0W。最终[静态记录](../.dragon-analysis/editor-phase/instance-library-session-r1/static-receipt.json)绑定源码与覆盖，不能称“全LSP清洁”。
- Jev仅发审过2527B人工工程摘要/preview0redactions，固定1.13.0/advisoryOnly；无资源/代码/profile/凭据，不作原证/验收/命令来源。

## 后续可视定位（限定切片）

[工作台可视素材定位](editor-material-picker.md)已补原配方图卡/24项分页/作者来源与单多格过滤、键盘焦点/选中可见性/无结果清理；六实际focused及原20章JSON重验，定义/地图不因选择改变。不是完整语义组件整理，本文原53门成绩保持历史，不冒新80全轮。

## 剩余与接续

仅当前原字节profile及装饰，尚缺完整语义山脉/河流等素材整理、任意分块式子实例操作、完整性能/UX验收；这些不能因原图块列表与截图而称完成。真实账户/权限/持久事务/资源删除、单章Trial闭包及生命周期、人物/章节初始化、发布/目录/多游戏存档与G门仍另待证据/环境。

该历史批次的下一步是人物/据点/章节身份和引用的只读审计与明确写入门，不自动按同槽合人或填0/FF初值。此次未再次commit/push/fetch/deploy，未访问真实SAVE/profile/DOS或更改全局配置；共享旧脏改/目录与sealed报告保留。

## 后继中立受信素材历史入口

完整编辑器A09/A10接续：`server/copyprofile.js` 的有序中立历史现在识别内部mapEdits中的 `material-capture/material-rename/material-remove`。仅复用已有 `captureComponent/renameMaterial/removeMaterial`，并逐步运行 `validateLibraryAdditions`；作者素材ID须属于该game的 `#material-`＋64位小写hex命名空间，保存整条历史的已用ID，删除后也不能重新擷取复用。命令精确字段、成员类型、描述符先检；原图块配方不能借新入口改写。

擷取仅从完整装饰实例派生已有byte-stamp定义，256格／1024定义等既有预算不扩大；此处没有放置新素材、移动装饰、修改地形或新规则。最后仍对整源比较，任意夹带地图、配方byte或未授权名称修改拒绝。旧缺mapEdits历史形状不变。该首批独立完整副本路径不持有新ID账本，曾拒绝这些命令；后继完整副本接线见下。该历史批次尚未接HTTP捕获、保存历史提取及Vue素材工作区；后继API见下，**不是互联网素材创作已经完成**。

本批日志前缀 `.dragon-analysis/editor-completion/material-history-`：

- `before.log` 正向擷取在未接入口时422 `COPY_TEMPLATE_HISTORY`。`after-r2.log` 5组通过，实际41固定Web输入；中立擷取／跨请求更名／无引用移除、codec往返、整张map及章节不变、共同composer产物一致；重复使用已删除ID、外game ID、缺失／重复成员、原配方改删、额外字段、空名、乱序历史、无授权配方byte／坐标／名称夹带拒收，访问器零执行。实际完整副本擷取候选仍被旧profile拒绝。它是受信内容历史测试，不是原生初始化或任意组合可玩证明。
- 既有有序人物／地图历史12组（`people.log`）、完整副本水域31检查（`fullcopy-water.log`）、shell65通过；两JS语法通过。首次精确替换存在两处同文调用点，工具部分应用后即用唯一上下文补齐中立调用点；没有运行半接线版本，未扩旧full-copy入口。
- 两代码主动LSP均push-only未确认，两文档warning视图clean；mode=all缓存52文件仍有3项既有warning（drafts布尔参数、能力测试字符串建议、原证数值解析），未屏蔽、不以空诊断称全仓clean。没有web/src／Vue／DDL变更，不重建两束；未跑尚未接线的HTTP／浏览器素材流程或无关Trial／发布长链，未修改真实内容或部署。

该批次之后的服务端ID／历史／DTO进展见后继API段；素材选取／擷取／更名／引用移除工作区与真实后端浏览器联合验证仍需接续。不能用现有本地工具或本入口冒充四层完整地图编辑。

## 后继完整副本受信素材历史

完整副本 `FixedCopyProfile.verify` 现同样按已存操作顺序重放素材命令，持有独立的已用素材ID集合；只把已核对的 `componentDefinitions` 与水组列表作为整源比较替换项，其它地图、章节、来源与固定配方仍逐项比较。复用中立入口的共同写入器和素材库门，不另建配方解释器。已有章节／四资源操作不改变这两类数据，组合验证不放宽其它内容写集；删除后ID仍不可复用。

日志前缀 `.dragon-analysis/editor-completion/material-fullcopy-`：

- `before.log` 在原未开放完整副本路径先复现 `COPY_MAP_DELTA`；`after.log` 7组通过，保留中立4组，并覆盖实际41输入／20章完整副本擷取→更名→无引用移除、codec往返、ID不复用、缺操作拒绝、跨game ID／未知成员／额外字段／访问器拒绝、配方byte／坐标／章节城兵夹带拒绝；水组更名与四资源writer的资金同步可与素材历史共存，源和装饰实例不变。
- `water.log` 既有水域31检查；`profile.log` 固定副本20章／2540来源记录／78拒收；`people.log` 顺序历史12组；`shell.log` 65项通过。范围均为受信内容比较，不是素材保存HTTP／认证／运行时许可。
- 两代码主动LSP未确认（1超时、1 push-only）；两文档warning视图clean，mode=all缓存52文件仍为前述3项既有warning，未屏蔽、不称全仓clean。两JS语法与diff检查通过，保留原有换行提示。没有web/src／Vue／DDL改动，不重建两束或重跑未接线HTTP／浏览器及无关长链。HTTP `capture` 仍只接已开放水域操作，未知素材op拒绝分支保持；未修改该服务捕获／保存路径，不将静态核读称HTTP新测试。

以上完整副本批次只完成受信历史；后继API接线见下，不能把两个内容profile通过当地图编辑全功能完成。

## 后继素材保存API与精确修订DTO

`server/drafts.js` 的既有 `mapEdits` 现接受三类精确命令：擷取 `{op:'material-capture',memberIds,name}`、更名 `{op:'material-rename',materialId,name}`、移除 `{op:'material-remove',materialId}`。擷取不接受客户端素材ID或配方；服务以game／actor／原操作键／数组索引及固定域生成 `#material-` 身份，同键重试重放原ID，新操作重新擷取不复用已删除ID。继承每请求16操作／整正文16KiB预算，复用既有共同helper及两profile整源历史门；未知命令、原图块改删、未知成员或非法配方仍拒绝。

原键保存／查询、CAS、权限、epoch及不可变对象事务没有分叉；旧无mapEdits请求正文不补字段。读回新增只读 `materialDefinitions`（ID、可空名称、footprint格数、是否作者素材、三类定义消费者引用）与 `decorationInstances`（实例ID／定义ID／坐标），绑定原DTO的精确修订和sourceDigest。未配置名称不从其它源猜填。当前仅从已有完整装饰实例擷取，不放置实例、不改地图、不创建新机制；素材从当前草稿移除不删除旧修订、共享资源或物理blob。

证据前缀 `.dragon-analysis/editor-completion/material-api-`：

- 新显式 `node tools/verify_editor_template_root.mjs --materials-only` 的 `r1.log` 16组通过：实际common Request／文件SQLite／FileBucket／41固定输入，中立和完整副本两路径擷取→更名→移除→重新擷取，ID服务生成／原键POST重放及查询、旧body逐byte保留、CAS／同键异正文／外作者与管理员越权拒绝、16操作及16KiB预算、旧修订不变、服务重建、早期历史损坏导致read／compile／save全拒。只读DTO和当前地图／章节不被素材操作修改。认证为种子夹具，不冒真实浏览器登录；Trial／release表保持空。
- `city-regression.log` 原聚焦城市／章复制19组通过；`history.log` 两profile受信素材历史7组；`controller.log` 既有定义控制器47组；`schema.log` 仍23源／50表／49索引／343列／4FK；`shell.log` 65项通过。新接口首轮通过，无失败轮；原完整Root长入口未跑，不将聚焦结果扩称全量通过。
- 两JS语法／diff检查通过。主动LSP一项push-only未确认，另一项仍有drafts既有布尔参数warning；两文档warning视图clean，mode=all的52文件缓存仍有前述3项既有warning，未屏蔽、不称全仓clean。无web/src／Vue／DDL变更，不重建两束；未跑未接线的素材浏览器流程、Trial或发布长链。

以上API批次后续的原生控制器接线见下；Vue素材表单及真实浏览器联合证据仍缺。这不是四层完整编辑、语义素材整理或完整发布验收。

## 后继素材控制器与单一保存日志

`server/public/draft.txt` 复用既有journal新增 `actions.material`，只发送已保存metadata、空resourceEdits及单项mapEdits。素材名称沿共同helper保留作者文字、trim／64码点／原控制码限制，不自动NFC或取其它来源。擷取只接受已读的完整装饰实例ID，调用前复制选取，不发送素材ID或配方；更名／移除只允许作者定义，已有引用的移除在客户端拒绝，服务端门保持权威。

读回素材定义与实例两份DTO须完整才开放；任一缺失表示未知。已提供完整DTO时严格检查字段、重复身份、作者ID本game命名空间、格数／坐标及装饰引用双向一致性；其它道路／据点引用只读展示，不把此清单当完整删除闭包。坏回包不半替换已读上下文，发布给展示层的是独立副本，不提供第二份可写source。

prompt／confirm后重核身份、代次、原loaded与表单对象；并加强共同ticket，捕获userId／version，拒绝身份对象被原地改写后继续旧异步流程。其它脏表单不捎带保存，整请求16KiB，保留原键查询／原body重试；确切收据仍撤销verifiedRead，须明确读取收据修订。刷新只恢复原键关联，不重造请求；存储失败不发POST。

证据前缀 `.dragon-analysis/editor-completion/material-controller-`：

- `r3.log` 定义／草稿控制器联合92项通过：新增素材5组覆盖未知与坏DTO、投影无别名、中立及完整副本profile、原键回包丢失／精确重试、其它脏表单保留、收据重读、刷新仅查键、原配方与引用保护、擷取／更名／移除、取消／换身份／原地改ID或version／强制改密、存储失败及16KiB拒绝。前两轮91项也通过，最终以新增身份检查后的r3为准。
- `root-r3.log` 聚焦实际Request／SQLite／FileBucket18组通过；原16组保留，新增两profile的原生控制器读取真实素材DTO（擷取前后）并逐项匹配。控制器读取端只允许GET，若试图存journal即测试失败；写操作仍由原API测试直接调用，不冒浏览器或控制器真实提交联合证据。认证为种子夹具，未接Vue。
- `shell-r3.log` 65项通过；两测试JS及TXT经ES module stdin语法检查通过。没有产品／测试失败轮。首次编辑Root时工具要求重新读取，补读后定点编辑，没有覆盖工作树。
- 两测试末次主动LSP仍未确认（1超时、1 push-only），TXT无配置服务；两文档warning视图clean，mode=all的52文件缓存仍有前述3项既有warning，未屏蔽、不以零诊断称全仓clean。语法与diff检查通过。没有Vue／web/src／DDL变更，不重建两束，不跑未接线的素材浏览器及无关Trial／发布长链。

该控制器批次之后的表单与浏览器证据见下；不能把控制器通过当完整地图工作区完成。

## 后继素材Vue表单与真实浏览器

新增 `editor-ui/src/MaterialsPanel.vue`，嵌入既有MapPanel，复用draft控制器，不增加第二保存日志或可写source。素材／完整装饰实例按24项分页，可分别筛选；素材可只看作者定义。跨页／筛选保留选取并明确显示本页外选取数，清除按钮一次清空，换游戏／修订或收据撤销verifiedRead后重置选择。仅列已保存身份／格坐标，不冒画布框选或地形预览。

原配方更名／移除禁用，有引用作者素材不能移除；具名引用以转义文字只读展开。擷取使用完整实例ID，名称通过原生prompt，确认及提交由共同控制器处理；未知DTO不显示旧库或可写按钮，收据后必须明确读取。没有放置／移动新实例或新资源上传。

证据前缀 `.dragon-analysis/editor-completion/material-ui-`：

- `build.log`／`build-check.log`：展示束逐byte一致，JS392179B／CSS33898B／8包notice；没有web/src变化，不重建原生束。
- `browser-r1.log`：实际gateway／生成Vue／CSP＋显式API夹具、新Chromium90项通过，产物 `editor-workbench/run-OPjJOQ/result.json`。新增素材分页／跨页选择与筛选无请求、原配方与引用保护、未知DTO、取消、擷取不捎带脏表单、精确读回、更名／移除、HTML不执行。它不是后端权限证明。
- `verify_editor_template_browser.mjs r27 --materials-only` 新独立聚焦入口：实际Node共同服务／自有SQLite、FileBucket、HTTPS／41固定来源、真实管理员及作者登录改密／新Chromium7组通过，`real-r27.log`与空stderr，收据 `editor-phase/template-browser-r27/receipt.json`。素材2→3真实提交后仅丢浏览器回应，刷新仅恢复原键、查回并明确读3且仅一次POST；原metadata／地图／章及其它脏表单保持，作者素材身份由服务生成，文字不转NFC且HTML不执行。实际更名3→4、移除4→5均覆盖取消无POST、准确身份／修订、旧3／4不变；共3次不同键POST。管理员读取作者修订404，无正式IDB、外连或非预期错误。31源码SHA前后及事后复核一致。
- 该聚焦入口保留默认workerd及原城市入口，不运行无关人物／水域／城市长链；本次实际浏览器仅中立作者路径，完整副本仍以此前API与控制器证据为限。没有运行素材放置、Trial／发布或云端。两浏览器入口首轮通过，没有产品／测试失败轮；一次批量edit命中重复if产生部分应用，立即用唯一上下文补齐启动分支后才运行。
- shell65、两测试语法与diff检查通过；四代码主动LSP均push-only未确认。两文档warning视图clean，mode=all缓存54文件仍有前述3项既有warning，未屏蔽，不以空诊断称全仓clean。

素材基础库操作已贯通上述限定链；完整goal仍active。四层工作区、画布选择与素材放置、移动／拆分、语义组件目录、道路及实体完整编辑和初始化／发布等剩余出口继续按全量清单推进。

## 后继装饰平移受信历史（HTTP尚未开放）

本节记录HTTP开放前的历史切片；后继保存接口见下一节，旧拒绝收据不代表现行接口能力。

两profile的内部map历史新增精确 `{op:'decoration-translate',memberIds,dx,dy}`。只调用既有 `translateDecorations`，不新建移动或地形算法；位移为安全整数且拒负零表示，非零／唯一完整实例／所有footprint边界与draft composer继续由共同helper校验。按顺序验证每一步，不能以“越界后再移回”掩盖非法中间步骤；失败不修改调用者。城市、道路、原生表、底层未知、配方、实例ID及顺序都不在写集。

完整副本的整源比较增加仅来自受信重放的 `map.decorations` 替换项，与现有水组／素材定义替换并列；中立仍直接对整个重放结果比较。没有对应操作的装饰变化、未选实例／ID／次序／底层／城市位置夹带修改仍拒绝。此时服务HTTP捕获还不接受新命令，API预算／权限／原键路径未改变；它不证明平移结果可玩或互联网画布已完成。

证据前缀 `.dragon-analysis/editor-completion/decoration-history-`：

- `before.log` 在未接线时新正控拒绝；`after-r2.log` 6组通过，实际固定Web源的中立／20章完整副本均覆盖双实例平移／返回、JSON codec、其它源字段不变、无操作夹带拒绝、越界再返回／重复与未知成员／空选／零或小数位移／负零／额外字段／访问器零执行，以及平移后擷取素材组合。
- `after-r1.log` 保留实现后的测试失败：负控把本来为null的隐藏底层再次写null，没有制造差异，故错误期待拒绝。改为明确不同的未知定义ID后验证整源拒绝；没有补下层默认值或放宽产品。
- `api-denial.log`：聚焦真实Request／文件SQLite／FileBucket18组通过，两profile均新增HTTP平移命令422拒绝及不可变对象数不变；保留素材原键／CAS／旧修订／服务重建／历史损坏验证。认证为种子夹具，不冒浏览器登录或平移HTTP保存成功。素材历史7组（`material.log`）、完整副本水域31检查（`water.log`）、shell65通过。
- 三JS语法及diff检查通过；主动LSP三项均push-only未确认，两文档warning视图clean；mode=all缓存55文件仍有前述3项既有warning，未屏蔽、不称全仓clean。没有web/src／Vue／DDL改动，不重建两束；未跑未开放的平移浏览器流程、Trial／发布或无关完整长链。下一接线仍须复用精确修订、单一journal、取消／迟到确认和明确读取收据修订，且保持严格编译对未知下层的拒绝。

## 后继装饰平移保存API

`server/drafts.js` 接受精确 `{op:'decoration-translate',memberIds,dx,dy}`，位于既有mapEdits顺序中。非空不重复实例ID、整数非零位移及原每请求16操作／整16KiB预算先校验，再调用同一个完整footprint原子writer；源与候选继续经过两profile整历史／整源比较。没有另分CAS、权限、epoch、原键、DTO或不可变对象事务，旧无mapEdits正文不补字段。只移动已有装饰，不接受城市／道路、绝对位置、配方或额外字段。

现有 `decorationInstances` DTO按精确修订返回更新坐标；未选实例及地图基础、城市、道路、章节、定义、身份、组成员／开关保持。允许保存的不完整草稿不等于准入运行：本批实际移动样本露出未知下层，draft composer给出 `UNKNOWN_UNDERLAY`，strict composer明确拒绝，未填0或恢复旧图。

证据前缀 `.dragon-analysis/editor-completion/decoration-api-`：

- `before.log` 新保存正控在未接线时422；`after-r2.log` 22组通过（包含原素材18组和两profile各2组平移链），实际common Request／文件SQLite／FileBucket／41输入、种子认证。两个完整实例一起移动、原键POST重复／查询、旧修订不变、全源等于共同writer结果、坐标DTO、反向移回、服务重建及早期移动历史损坏导致read／compile捕获／save全拒；其它源字段不被修改。
- 空／重复／部分缺失成员、零／小数／越界位移、未知字段、越界再返回、超16操作、CAS及同键异正文、外作者／管理员越权拒绝，拒绝时draft对象数不变；继承原素材16KiB负控。两profile的未知底层由实际已存source重读后验证draft诊断及strict拒绝。Trial／release表仍为空，不冒真实Trial请求或发布验证。`after-r1.log` 也22组通过，但尚未加入上述strict检查；最终以r2为准。
- `history.log` 受信历史6组、`schema.log` 23源／50表／49索引／343列／4FK、`shell.log` 65项通过；两JS语法通过。主动LSP两项push-only未确认，两文档warning视图clean；mode=all缓存55文件为4项warning（3处既有位置，drafts布尔参数由两个分析器重复报告），未屏蔽，不以零诊断称clean。语法／diff检查通过。
- 该API批次无web/src／Vue／DDL改动，不重建两束；未跑当时未接线的平移控制器／浏览器或无关完整Root、规则、Trial及发布长链。后继列表平移表单及原键浏览器联合验证见下，完整画布仍未完成。

## 后继装饰平移表单与真实浏览器保存

`draft.txt` 的 `translate(selection,dx,dy)` 与素材动作共用唯一journal、已读source和mapEdits事务，不新建第二份source。明确完整实例选取及安全整数位移（不能双零或负零表示），确认前捕获独立ID数组，确认后复核身份／代次／原loaded／表单对象；只保存已读metadata＋本次命令，不捎带其它脏输入。16KiB预算、存储失败不POST、原键查询／原正文重试／刷新只恢复键、收据后撤销verifiedRead并要求精确读取全部沿用。客户端没有完整footprint，不能以锚点坐标假装做过整块边界验证，也不先修改展示坐标。

`MaterialsPanel.vue` 使用原跨页实例选择增加X／Y格位移输入与整批平移按钮。初始为空，必须明确填写两个整数；成功／修订改变时清理选取和位移。确认文案说明未知底层及严格编译限制；这只是列表操作，不是画布拖曳、地形预览或可玩认证。没有开放放置、原配方编辑、城市或道路移动。

本批证据均在 `.dragon-analysis/editor-completion/`：

- `decoration-controller-before.log` 三个新测试在未接动作时失败；`decoration-controller-after-r1.log` 94通过1失败为完整副本测试夹具错误携带中立generalDefinitions。修夹具为原协议的null、按实际可编辑域检查人物表单保持，不改产品门。最终`decoration-controller-after-r2.log` 95组通过：两profile原键精确正文、缺／坏向量及选取、确认身份变化、刷新不重造正文、脏输入保持、配额／预算拒绝、确认后旧坐标锁定至重读。
- `decoration-ui-browser-r1.log` 实际gateway／Vue／CSP与明确API夹具、新Chromium91项通过，产物 `editor-workbench/run-LiHKXC/result.json`。新增空／小数禁用、取消无POST、精确dx/dy与选取、成功先锁旧坐标、明确读回更新并清表单；不是后端授权证明。
- `verify_editor_template_browser.mjs r28 --materials-only` 实际Node／文件SQLite／FileBucket／自有HTTPS／41输入、真实管理员与作者登录、新Chromium9组通过。原素材7组保留，再测平移5→6实际提交后只丢浏览器回包、其它脏输入保持、刷新原键查询／精确读6且仅一次POST；反向6→7恢复原坐标，旧5／6不变、其它DTO保持及管理员404。收据 `editor-phase/template-browser-r28/receipt.json`；日志`decoration-ui-real-r28.log`／stderr为空。无正式IDB、外连或非预期错误；本轮浏览器平移限中立模板单实例，完整副本／批量由前述API与本轮控制器范围分别覆盖。
- Vue build/check逐byte一致（JS394669B、CSS33898B、8包notice）；shell65、三测试及控制器模块语法／diff通过，31浏览器源码SHA逐项复核保持。无web/src／DDL变化，不重建原生束，不跑无关完整Root、规则、Trial或发布长链。四代码主动LSP均push-only未确认，TXT无服务；两文档warning视图clean，mode=all缓存55文件仍为前述4项既有warning（3处位置），未屏蔽、不以无诊断称全仓clean。

## 后继装饰同层调序历史与保存API

按产品Q61／Q66，新增精确 `{op:'decoration-reorder',memberIds,direction}`；direction只能为1或-1。两profile的受信历史和 `PrivateDrafts` 保存均调用既有 `reorderDecorations`：每个连续选中块越过一个相邻未选实例，保持选中块内部次序；处于边界可无变化。仅改变装饰数组次序，不改实例身份／坐标、定义、城市、道路、底层或章节；不跨四层固定顺序，不自动改道路类型。重叠水域摘要仍按共同composer的现行最上层规则处理，不是新增原版机制。

请求沿用16操作／16KiB、精确已保存修订、原键重放／查询、权限／epoch及不可变对象事务。非空唯一实例、精确字段及方向先检查，每一步再走共同writer和整源核验；无历史的顺序改变或夹带坐标／身份／城市变更仍拒绝。DTO实例数组按已存顺序返回；素材引用诊断的列举顺序随装饰顺序改变，但引用成员和定义内容不变。该API批次尚未接界面调序，后继列表按钮及浏览器证据见下，不将局部成功称为完整画布或可玩准入。

本批日志位于 `.dragon-analysis/editor-completion/`：

- `reorder-history-before.log` 新正控未接时拒绝；`reorder-history-after.log` 两profile共10组通过，包含原平移6组及调序、反向恢复、边界no-op、JSON往返、平移／调序组合、非法方向／成员／额外字段／访问器零执行、无授权与夹带修改负控。`reorder-history-components.log` 原共同工具122检查／36精确拒绝、5850索引及3891矩形拾取检查通过，覆盖既有叠放／水域顺序行为；素材历史7组和shell65通过。
- `reorder-api-before.log` 新HTTP正控原先422 `DRAFT_MAP_EDITS`；`reorder-api-after-r3.log` 实际common Request／文件SQLite／FileBucket／41输入26组通过（原素材及平移22组＋两profile各2组调序链），认证为种子夹具。准确重排、整源等于共同writer、原键重放／查询、旧修订、反向恢复及边界no-op、CAS／同键异正文／越权拒绝、方向及成员负控无新draft对象；服务实例重建后保持，Trial／release表仍为空。
- 保留中间失败：`reorder-api-after.log` 错误期待素材引用数组列举顺序不变；改为对引用成员的无损排序比较，仍严格核整个source及实例顺序。`reorder-api-after-r2.log` 错误期待非法方向的已存历史返回422；原历史解析门对此正确返回503 `DRAFT_HISTORY_CORRUPT`，改为read／compile捕获／save三路严格验证该状态和错误码，没有放宽产品或接受多个错误码。
- schema仍23源／50表／49索引／343列／4FK，shell65及四JS语法／diff通过。无web/src／Vue／DDL改动，不重建两束，未跑尚未接线的调序浏览器流程、无关完整Root或运行／Trial／发布长链。四代码主动LSP均push-only未确认；两文档warning视图clean，mode=all缓存55文件仍含drafts参数标志（两个分析器）、旧章报告正则及原证工具整数解析共4项既有warning，未屏蔽、不冒全部clean。

## 后继同层调序表单与真实浏览器保存

`draft.txt` 新增 `actions.reorder(selection,direction)`，方向仅±1，复用素材的完整实例选取、唯一journal、准确loaded修订、16KiB及原键恢复；不请求素材名称。确认明确针对整个装饰层（包含筛选／页外选中项），每个连续块越过相邻未选实例；确认返回仍复核身份／代次／原loaded及表单对象，成功撤verifiedRead，必须明确读收据修订才显示新顺序，不在客户端先交换数组。其它脏输入不捎带。

`MaterialsPanel.vue` 提供上移（较后绘制）／下移（较先绘制），以及由已读完整实例数组派生的全局绘制序（1先）；筛选不会把该序号变成本页排名。沿用分页及隐藏选取计数，精确重读后清选。只是列表工作区，不是画布叠放预览、四层重排、可玩证明或新的运行规则。

本批 `.dragon-analysis/editor-completion/` 证据：

- `reorder-controller-r1.log` 95通过2失败：稀疏选取数组被Array.some跳过而发出无效请求；另一项是测试将调序确认专用断言错误用于后续丢弃其它脏输入的读取确认。共享选取检查改用Array.from后的dense值校验，擷取／平移／调序均拒绝空洞（服务端原本仍拒非法成员），不扩权限。r2仅余测试确认误用失败；修正测试确认处理后r3全过，追加三种动作稀疏数组覆盖的最终 `reorder-controller-r4.log` 97组通过。两profile覆盖两方向、原键原body重试／刷新仅键查询、坐标与顺序不抢先变化、缺DTO／坏选择／方向／确认失效、配额及预算无POST。
- `reorder-ui-browser-r1.log` 实际gateway／Vue／CSP、新Chromium加明确API夹具92项通过，产物 `editor-workbench/run-TMkIbm/result.json`。取消无POST，按完整层而非过滤页调序、保存后旧序号锁定至重读、反向恢复、坐标保持；不是实际后端权限证明。
- `reorder-ui-real-r29.log`：`verify_editor_template_browser.mjs r29 --materials-only` 实际Node／文件SQLite／FileBucket／HTTPS／41来源／真实登录及全新Chromium11组通过。沿既有素材和平移链，在7→8将两个连续实例上移（筛选页外一个仍参与），真实提交后只丢浏览器回包；刷新原键查询／明确读8，仅一次POST，其它脏输入不保存。8→9下移恢复完整顺序和引用诊断列表，旧7／8不变、共7个独立键，管理员越权拒绝、正式IDB零访问、域外及非预期错误为空、stderr空。收据 `editor-phase/template-browser-r29/receipt.json`，31源码SHA复核；这是中立作者浏览器，完整副本由本批控制器与此前API分范围覆盖，不冒默认workerd／Trial／发布全链。
- Vue build/check逐byte一致（JS396508B、CSS33898B、8包notice），shell65、三测试及TXT模块语法通过。无web/src／服务／DDL变更，不重建原生束或重复未受影响的Root长链／规则回归。四代码主动LSP均push-only未确认、TXT无服务，不以无诊断称clean。两文档主动warning视图clean；mode=all的55文件缓存仍有4项既有warning（三处，drafts参数标志由两个分析器报告），未屏蔽。diff检查通过，保留原有换行提示不批量归一化。

## 后继装饰放置受信历史（HTTP仍关闭）

本节记录HTTP开放前的内部切片；后继API见下，旧拒绝收据不代表现行接口能力。

两profile的内部map历史新增精确 `{op:'decoration-place',instanceId,materialId,variantRef,x,y,waterClass}`，只调用既有 `placeComponent`，不新建配方、占格或地形算法。素材与variant必须存在，落点是明确安全整数，水域类别必须明确为null或共同writer支持的类别；缺字段、负零表示和其它类型拒绝。共同writer检查完整footprint，不裁切越界组件，并经过draft composer；草稿成功不等于运行准入。

新实例限定本game的 `#decoration-`＋64位小写hex身份；重放从原装饰、道路组件和据点placement建立已用实例集合，每次成功追加，不能重用已有身份。水域放置沿共同writer生成 `group-<instanceId>` 及成员／显示属性，并记入已用水组集合；不另猜分类或重建旧水组。只允许对应的新装饰及水组变化，素材擷取→放置、放置→平移／水组更名可顺序组合；已有整源比较继续拒绝夹带底层、城市、原实例或顺序变化。

本批证据前缀 `.dragon-analysis/editor-completion/placement-history-`：

- `before.log` 新正控未接线时422 `COPY_TEMPLATE_HISTORY`；`after-r4.log` 两profile、实际41固定Web输入8组通过。覆盖原素材放置、两相邻原实例擷取成两格素材后放置、两格完整边界与越界再移回拒绝、中立跨步骤重放、JSON codec、重复／外game身份、缺素材／variant、非法类别／坐标／字段、访问器零执行、水组创建与后续更名、已用素材不能移除，以及底层／城市／placement／未选实例夹带拒绝。r1至r3也通过；最终r4保留多格及跨步骤覆盖，并将新测试的console输出warning改为stdout后重跑，不屏蔽规则。编辑时旧import文本未命中产生部分应用，补读实际import后立即补齐，再运行验证，没有运行半接线版本。
- `decoration.log` 既有平移／调序历史10组、`material.log` 素材历史7组、`shell.log` 65项通过。`root.log` 的 `--materials-only` 实际common Request／文件SQLite／FileBucket／41来源26组通过；新增两profile向HTTP发送有／无instanceId的放置命令均422 `DRAFT_MAP_EDITS`，draft对象数不变。其余素材／平移／调序原键、CAS、权限、旧修订和历史拒绝仍覆盖；认证为种子夹具，不是浏览器登录。
- 三JS语法／diff检查通过，三代码主动LSP均push-only未确认；两文档warning视图clean，mode=all的56文件缓存仍为4项既有warning（三处位置），新增console warning已消除且未屏蔽规则。没有web/src／Vue／DDL变更，不重建两束；未跑尚未接线的放置浏览器、完整Root长入口或无关规则／Trial／发布链。该批次的HTTP生成身份及保存接线进展见下一节；本内部端口不自动授予这些能力。

## 后继装饰放置保存API

`server/drafts.js` 在原mapEdits中接受精确 `{op:'decoration-place',materialId,variantRef,x,y,waterClass}`。必须明确素材、variant、整数落点与null或受支持水域类别，客户端不能提交instanceId或额外字段。服务以固定域、gameId、actorId、原操作键和该请求操作索引生成 `#decoration-` 身份；同键／同正文恢复原ID，同批相同素材同位置的两次放置仍有不同ID，新操作使用新ID。

保存调用共同 `placeComponent`，历史重放使用同一解析及身份规则，继承16操作／16KiB、CAS、权限／epoch和不可变对象事务。完整footprint、水域组及整源核验没有分叉，不放宽共享快照验证器的64MiB源上限。原 `decorationInstances`、`materialDefinitions.references` 和水组DTO按精确修订读回新实例及引用，不回写旧修订或猜分类。该API批次尚未接控制器；后继只读选项、控制器及Vue表单进展见以下两节。

本批证据前缀 `.dragon-analysis/editor-completion/placement-api-`：

- `before.log` 新保存正控在未接线时422 `DRAFT_MAP_EDITS`。`after-r1.log` 原完整素材入口运行3600秒超时且为空，**不计通过**；后续进程检查未发现残留的该测试Node进程，没有批量清理未知临时目录。
- 新显式 `node tools/verify_editor_template_root.mjs --placement-only` 的 `focused-r2.log` 16组通过，实际common Request／文件SQLite／FileBucket／41固定来源、种子认证。保留必要的素材擷取和真实DTO读取，两profile均覆盖同批两次作者素材放置及水域放置、服务身份／索引区分、原键POST重放与查询、全源等于共同writer、成员／引用DTO、其它源字段和旧修订不变。
- 非法素材／variant／类别／落点／缺字段／客户端ID、先合法再越界整批、已引用素材删除、16操作／16KiB、CAS、同键异正文及外作者／管理员越权均拒绝且draft对象数不变。早期放置历史被改成越界后read／compile捕获／save三路拒绝，恢复后重建服务实例读回一致；新操作生成不同ID，旧已放置修订保留。Trial／release表仍为空，不冒实际Trial或发布。
- 聚焦入口跳过旧素材更名／删除和平移／调序长链，原入口及原断言仍保留；不能将16组扩称原完整入口通过。stderr只有四条明确的角色阶段进度，不冒空stderr；不是浏览器登录／HTTP运输／workerd或云证据。
- `history.log` 内部放置8组、`schema.log` 23源／50表／49索引／343列／4FK、`shell.log` 65项及两JS语法／diff通过。无web/src／Vue／DDL改动，不重建两束；未跑未接线的放置表单／浏览器或无关规则／发布长链。
- 两代码主动LSP均push-only未确认；两文档warning视图clean。mode=all缓存56文件仍4项既有warning（三处位置：drafts的布尔参数由两个分析器报告、章缺口测试endsWith建议、原证验证器数值解析），未屏蔽，不称全仓clean。

## 后继放置只读选项与原键控制器

草稿GET新增 `materialPlacement`，逐素材返回实际 `variantRefs`，水域可选值为明确null及共同 `WATER_CLASSES` 的键；不从名称猜类别、不默认original、不返回第二份可写素材源。null仅表示不指定水域组合，并非将素材判为陆地。该投影与原素材／实例清单属于同一已读修订。

`draft.txt` 校验完整素材覆盖、唯一素材／variant／类别及形状；缺选项时仅禁新放置，不禁已有擷取／移动等操作；坏选项拒绝整次安装、不半替换当前快照。展示模型为独立副本。新增 `actions.place(materialId,variantRef,x,y,waterClass)`，必须从已读选项明确选择，落点是固定域内安全整数；完整footprint和水组仍由服务共同writer验证，不裁切、不以客户端检查放行运行。

放置不走名称prompt、不生成客户端instanceId，确认文字列明变体、落点和类别；确认后再次核身份／代次／原loaded与表单对象。请求只含已保存metadata、空resourceEdits和一条mapEdit；继续唯一journal／16KiB／CAS／原键查询重试。未知回应不另起操作；刷新仅恢复键、不重建正文；收据之后显式精确重读，不乐观追加实例，也不捎带其它脏输入。

证据前缀 `.dragon-analysis/editor-completion/placement-controller-`：

- `r1.log` 两控制器合计100项通过（原97＋新3），两profile覆盖明确null／水域选择、原配方可放但不编辑、其它脏输入与修改后的修订输入不捎带、丢回应原键原body重试、刷新仅查询、收据锁定与重读、无乐观实例；另核缺／坏DTO、选项副本无别名、非法／省略变体类别坐标、取消／身份失效、存储失败不发POST。旧无选项DTO仍能擷取，不伪造默认选项。
- `root-r1.log` 的 `--placement-only` 实际common Request／文件SQLite／FileBucket／41输入16组通过，新增两profile源码variant与共同类别逐值对照，以及真实DTO通过原生控制器读取；原放置ID／原键／CAS／整批原子拒绝／历史／旧修订等覆盖保持。认证为种子夹具，此新增控制器集成只GET，不能冒称实际控制器POST或浏览器登录；stderr仍仅明确的角色进度。
- `shell.log` 65项，三JS及TXT模块语法／diff通过。测试均通过；首次文档diff因新增EOF空行失败，已定点去掉后复查，不批量改换行。三JS主动LSP均push-only未确认，TXT无服务，不称clean；两文档warning视图clean，mode=all缓存56文件仍4项既有warning（三处位置），未屏蔽。没有web/src／Vue／DDL变更，不重建两束；该控制器批次尚未跑当时未接的放置Vue／浏览器，不重复无影响的完整素材长入口、规则／Trial／发布链。

## 后继放置表单与真实浏览器保存

`MaterialsPanel.vue` 新增逐素材的“选择放置”及显式变体／X／Y／水域类别表单。所有字段初始未选或空白；null类别显示“不指定水域组合（非判定陆地）”。原配方可作为放置素材但仍不能改名／删除；没有选项时只禁放置。筛选素材不暗中替换目标，界面只持有选择值；换游戏／已读修订／verified变化清理表单，不提前添加实例或客户端身份。

证据前缀 `.dragon-analysis/editor-completion/placement-ui-`：

- `browser-r1.log` 工作台新Chromium93项通过，产物 `.dragon-analysis/editor-workbench/run-npX7D5/result.json`。实际gateway／Vue／CSP但API明确夹具；覆盖缺选项禁用、原配方选取、无默认值、变体文本转义、缺类别／越界不能提交、取消无POST、保存后不乐观增量、精确重读新实例与表单清理。
- `real-r30.log` 的 `verify_editor_template_browser.mjs r30 --materials-only` 12组通过，实际Node服务／文件SQLite／FileBucket／41来源／自有HTTPS／真实作者与管理员登录／全新Chromium。保留原素材／平移／调序11组，新增显式已读variant、已知落点和null类别放置9→10：取消无写、只保存已保存metadata；真实提交后仅中断浏览器回应，刷新原键查询／精确读取10只发生一次放置POST。新实例ID由服务分配、仅新增一条素材引用，其它地图／章／水组保持，旧9不变；另表脏输入不捎带、管理员越权拒绝、无正式IDB／外连／非预期页面错误。
- 收据／截图 `.dragon-analysis/editor-phase/template-browser-r30/receipt.json` 与 `template.png`；总8次保存／8个操作键，31项源码SHA复核一致，stderr为空。该轮放置覆盖明确null类别，不冒真实浏览器水域放置、完整副本放置或画布交互；它们的API／控制器证据与剩余范围分别记录。
- Vue build／check逐byte一致（JS403548B、CSS33898B、8包notice），shell65、两测试语法与diff通过。本批测试首轮通过；三代码主动LSP均push-only未确认，不称clean。两文档warning视图clean，mode=all缓存56文件仍4项既有warning（三处位置），未屏蔽。没有web/src／服务／DDL更改，不重建原生束；不重复无影响Root／规则／Trial／发布长链。完整画布、语义工具、初始化与发布目标仍未完成。

## 后继装饰拆分受信历史（HTTP尚未开放）

本节保留内部能力批次的历史证据与锚点；后继HTTP接线见下一节，不将当时拒绝入口当作现状。

`copyprofile.js` 两profile新增内部 `decoration-split {instanceId,childIds}`，只调用既有 `splitDecoration`。子身份必须为本游戏 `#decoration-` 加64位小写hex、2至256个、完整唯一且从未使用；实际variant的图块数及受信原子配方由共同writer核验。移除父实例不释放其身份，拆分不能覆盖既有城市／道路／装饰ID。不是开放作者指定HTTP子身份。

中立模板仍整源顺序重放／比较；完整副本除既有装饰、水组、素材根之外，仅增加共同writer算出的 `base.unknownUnderlays` 精确投影比较。基础图块、地理数组、章节和城市仍在整源保护内，不能借拆分改写未知底层或掩盖缺失。拆分保持原位置的绘制顺序，明确water mask的子项才留水域属性，组ID／显隐保持，未知底层的covering身份按共同writer重绑并保留前身份；不新增规则、补默认地形或改原生初始化。

证据前缀 `.dragon-analysis/editor-completion/split-history-`：

- `before.log`：新增正控在未接线时实际422 `COPY_TEMPLATE_HISTORY`；实现后 `after-r3.log` 8组通过（中立／完整副本各4），使用41固定Web输入做擷取→放置→拆分、JSON codec、像素／地理／小地图相等、原素材可在无引用后移除、水组成员变化、缺历史／错身份／复用／单格／错数量／稀疏／访问器及夹带字段拒绝。访问器执行0次。r1／r2亦通过，r3增加mask／显隐及子ID复用负控，为最终覆盖。
- 未知底层重绑另用明确自有夹具，不冒固定原图已有该covering记录：设置一格未知并明确父covering，限定一格water mask及隐藏水组，拆分后只有对应子项留waterClass；原数组不补值，地形／地理／小地图保持，sourceRef被篡改仍拒绝。
- `root.log` 的 `--placement-only` 16组通过，实际common Request／文件SQLite／FileBucket／41输入、种子认证。新增两profile HTTP带或不带childIds的拆分命令均422 `DRAFT_MAP_EDITS`、无新增草稿对象；保留原放置／原键／CAS／历史／重建与旧修订验证。只证明内部入口没有自动开放HTTP，不是拆分保存功能已完成。
- `water.log` 31项、`placement.log` 8组、`components.log` 122项／36拒绝／5850索引及3891框选对照、shell65通过。三JS语法及diff通过；主动LSP三份push-only未确认，不能称clean；两文档warning视图clean，mode=all缓存57文件仍4项既有warning（三处位置），未屏蔽。无web/src／Vue／DDL改动，不重建两束；未跑未接的拆分控制器／浏览器、完整Root长入口或无关Trial／发布链。

该批次尚缺服务分配子身份与HTTP接线，后续进展见下；不得从内部能力推导运行准入或完整编辑器完成。

## 后继装饰拆分保存API与序列化一致性

`drafts.js` 接受 `mapEdits:[{op:'decoration-split',instanceId,childCount}]`，子数量是2至256的显式整数断言，必须与当前实例实际variant的全部图块数一致；不是选前N格、不是裁切。父ID非空且至多256字符。禁止客户端childIds，继续每请求16操作／16KiB及原CAS／epoch／不可变对象事务，不增加身份分配表。

服务用 `['dragon-decoration-child-1',gameId,actorId,operationKey,operationIndex,childIndex]` 的SHA生成本游戏子ID；历史与保存调用同一resolver，再交共同split writer及profile核验。原键重发／查询不重新分配身份，原request_json保留childCount而不补childIds；旧请求保持原形状。现有实例及水组成员DTO自然呈现结果；该批次尚未提供拆分候选投影或UI，后继接线见下。

**实际保存发现并修复的确定性缺口**：共同split writer原按componentDefinitions插入顺序覆盖同图块的候选单格配方。源JSON规范化排序后，同样数据可能选出不同definitionRef，导致实际保存与受信重放不一致。先以重复单格配方＋真实source codec复现，再改为按稳定ID顺序扫描（最后一个满足既有条件的ID胜出），与规范序列化后的选择一致。没有减少受信配方条件、猜建配方或放宽整源比较；这是创作序列化合同，不是新增原版机制。

证据前缀 `.dragon-analysis/editor-completion/split-api-`：

- `before.stderr` 新API正控在未接线时422 `DRAFT_MAP_EDITS`；`after-r1.stderr` 接线后实际保存422 `COPY_PROTECTED_DELTA`。`order-before.log` 独立复现codec前后选出`aaa-duplicate`与`atom`；修复后 `order-after.log` 组件123项／36拒绝／5850索引及3891框选对照通过，`tools.log` 37项、`history.log` 两profile拆分8组通过。新增测试最初重复import被诊断为unused，已移除重复并复验，未屏蔽。
- `after-r3.log`：`node tools/verify_editor_template_root.mjs --placement-only` 20组通过，实际common Request／文件SQLite／FileBucket／41输入、种子认证。r2单命令拆分已通过；最终r3追加既有水组同名命令后在同一请求第二项拆分，验证operationIndex参与身份分配。两profile各新增2组，实际擷取两格素材→明确水域放置→拆分；服务子ID逐项核SHA、原键POST／查询、整源等于共同writer、组身份与成员、旧修订保持。实际拆分后父素材已无实例引用可删除，子实例及水组不丢失。
- 数量3／256与实际两格不符、先合法拆分再错误命令、重复拆分及17操作／16KiB越界均不产生草稿对象；客户端身份、非法数量／父ID／单格拆分、CAS、同键异body及外作者／管理员越权继续拒绝。历史childCount改为合法范围但错误的3，读／编译捕获／保存三路422；恢复记录并重建服务实例后最新与旧修订一致。不是OS进程重启、真实登录或浏览器证书，未创建Trial或发布。
- 原生束235文件重建、复建unchanged，SHA `f0c85588c748d6416606362634784e6608578516d0d31d433aa60f95d89f3884`，两入口壳SHA保持。schema仍23源／50表／49索引／343列／4FK，shell65、四JS语法及diff通过。
- 四代码主动LSP未确认（1超时、3 push-only），最终Root复探仍超时，不称clean；两文档warning视图clean。mode=all缓存59文件4项warning：既有drafts flag参数、gap测试endsWith、原证工具数值转换，以及本次探测到componenttools既有控制字元过滤正则提示；没有屏蔽或为消提示放宽过滤。未改Vue或DDL，不重建展示壳；未运行完整素材长入口、未接线的拆分控制器／浏览器或无关规则／Trial／发布链。

该API批次的候选DTO及控制器后续进展见下；完整画布、语义工具、初始化与发布目标仍未完成。

## 后继拆分候选投影与原键控制器

草稿GET新增 `decorationSplitCandidates:[{instanceId,childCount}]`，完整覆盖当前修订装饰实例。只对共同writer支持的byte-stamp／indexed-footprint与实际实例变体的2至256图块给出数量，其余null；沿用既有实例的variant解析，不为作者选择新变体。数量仅是候选断言，不保证原子配方和整幅草稿验证成功，不生成子ID或授予运行资格。

`draft.txt` 验证完整覆盖、唯一稳定ID、严格字段和null／2至256数量；缺DTO仅禁拆分，不禁其它素材操作，坏DTO不半安装。显示投影独立复制。`actions.split(instanceId)` 从原已读快照取得数量，确认显示全部图格和服务端复核边界；确认后重核身份／代次／原loaded／表单对象。只发已保存metadata、空resourceEdits及一项split，复用唯一journal／原键／精确修订，未知响应不另起保存，刷新仅恢复键，收据后显式重读，不乐观移除父实例或分配子身份。

证据前缀 `.dragon-analysis/editor-completion/split-controller-`：

- `before.log` 三个新控制器用例在未接线时失败；`after-r1.log` 两控制器合计103项通过，覆盖两profile的已读数量／原key原body精确重试、刷新只查询、其它脏输入不捎带、旧实例保持至精确读取、单格／缺候选拒绝、坏DTO原子性、投影无别名、确认取消／身份原地改变／强制改密、journal写失败不POST。新fixture最初与旧水域splitDto同名，执行前改为decorationSplitDto；测试文件十处既有字符串拼接按诊断定点改写为等价模板字符串，未改断言或生产语义。
- `root-r1.log` 的 `--placement-only` 20组通过，实际common Request／文件SQLite／FileBucket／41输入、种子认证。两profile父实例实际候选为2，拆后两个子实例为null、父ID移除；真实GET均通过原生控制器读取，旧放置／拆分／CAS／历史门保持。新增控制器集成仅GET，不冒真实控制器POST或浏览器登录。
- shell65及三JS／TXT模块语法通过。三代码主动LSP：一clean、一有既有drafts flag参数warning、一push-only未确认；TXT无服务，不称全部clean；两文档warning视图clean，mode=all缓存59文件仍4项既有warning，未屏蔽。diff检查通过。无web/src／Vue／DDL变更，不重建两束；未跑尚未接的拆分表单／浏览器或无关完整素材／Trial／发布长链。

该批次尚待的拆分表单与浏览器联合保存见下；候选DTO不是完整地图编辑、初始化或发布完成证书。

## 后继装饰拆分表单与真实浏览器保存

`MaterialsPanel.vue` 的完整实例表逐行新增拆分按钮及候选状态，明确区分未知、非多格候选和数量。操作只取该行稳定实例ID，不从勾选／筛选集合裁切，也不在Vue分配子ID；禁用状态、确认与原键恢复仍走共同控制器，旧父实例保持到精确重读。按钮旁明确候选不保证配方成功，未新增画布或可玩预览。

证据前缀 `.dragon-analysis/editor-completion/split-ui-`：

- `browser-r1.log` 首轮失败：新增末列后，旧移动测试仍把最后一个td当坐标。增加明确的 `data-instance-coordinates` 标记并改三处断言，不改变坐标／调序产品行为；`browser-r2.log` 新Chromium94项通过，产物 `.dragon-analysis/editor-workbench/run-CFUnZV/result.json`。实际gateway／Vue／CSP＋显式API夹具，覆盖未知禁用、单格禁用、按行拆分、取消无写、收据锁旧父实例、读回子实例和选择清理；不冒后端权限证明。
- `real-r31.log`：`verify_editor_template_browser.mjs r31 --materials-only` 14组通过，实际Node服务／文件SQLite／FileBucket／41输入／自有HTTPS／真实登录／新Chromium。保留原12组；测试从同一固定Web输入选两个相邻非水域原子，并逐项核当前DTO的ID／定义／坐标后，经实际UI擷取10→11、显式选择变体／落点／null类别放置11→12，父实例实际候选2。
- 实际拆分12→13先取消不写，再在服务提交成功后仅中断浏览器回应；其它脏名称不捎带、原父行锁定。刷新后不重造body，原键查询／精确读13只发生一次拆分POST。两个服务子ID不同、位置与原两格对应、父实例消失、父素材引用归零，子实例非拆分候选；章节／地图摘要／水组等不变，旧10／12不变。管理员越权404，无正式IDB、外连或非预期错误。此轮是中立、明确null类别拆分，不冒完整副本／水域拆分浏览器或完整画布验收。
- 收据及截图 `.dragon-analysis/editor-phase/template-browser-r31/receipt.json`／`template.png`，11次保存／11个键；31项源码SHA事后复核一致，stderr为空。Vue build／check逐byte一致（JS405251B、CSS33898B、8包notice），shell65、两测试语法通过。三代码主动LSP均未确认（1超时、2 push-only）；两文档warning视图clean。末次mode=all缓存60文件27项warning，包含根AGENTS.md的23项排版提示及原4项代码提示；本批未改根AGENTS，也未屏蔽诊断。diff检查通过；无web/src或DDL变化，不重建原生束、不重复无影响Root／规则／Trial／发布长链。

完整地图工作区、语义工具、道路／实体全字段、原生初始化与发布等仍未完成，不以本批联合保存代替全量验收。

## 后继装饰移除共同内容与受信历史（尚未接HTTP）

此标题记录该内容批次的历史范围；保存API后继接线见下一节。

按工程合同§2删除只露出当前下层、未知不补底的约定，新增共同 `removeDecorations(source,ids)`：必须为非空、唯一且全部存在的完整装饰实例；整批复制写入，仅过滤装饰与对应水组成员。水组剩余成员或明确baseCells仍保留原ID／名字／显隐，真正空组移除。配方库、道路、据点、基础图块／地理与unknownUnderlays记录保持，不回滚放置时截图、不清历史covering来源、不补零或草地。草稿composer继续报告裸露unknown，严格编译仍拒绝。

两profile内部历史接受精确 `decoration-remove {memberIds}`，同一共同writer顺序重放并整源比较；已有实例／水组身份账本不因移除而释放，放置→移除→复用原ID仍拒绝。未增加新根替换或改HTTP入口，不能以这条受信能力提交任意源修改。本批未改既有独立studio界面路径，也不等于A30真实游戏内容物理删除。

证据前缀 `.dragon-analysis/editor-completion/decoration-removal-`：

- `content-r1.log` 4通过1失败：测试改变下层tile却未同步fixture的visualRef，既有严格composer正确拒绝 `UNSUPPORTED_VISUAL_BINDING`。只改为一致的明确测试配方，不放宽产品；`content-r2.log` 5组通过，覆盖露出后来修改的当前下层、其它格保持、裸露未知严格拒绝／其它覆盖仍有效、水组部分成员和base-only组保留、非法混合选择整批拒、整块移除及道路不变、JSON codec往返。均自有合成创作夹具，不冒原版机制。
- `history.log` 实际41固定Web输入、两profile6组通过：完整源／旧源保持、精确组成员、codec、无历史／错ID／稀疏／访问器／夹带base／坐标／顺序／城市拒绝，以及放置→移除恢复基线但原ID不得复用。访问器执行0次。这是内部内容校验，不是HTTP或真实权限链。
- `components.log` 123项／36拒绝／5850索引／3891框选对照、`water.log` 31项、shell65通过。原生束235文件重建及复建unchanged，SHA `f4592ed667674ca27c21586fb48cf814b391d04101b8ced60ae5cf1fccc02b58`，两入口壳SHA保持；不登记新程序／库或部署。
- 四代码主动LSP warning视图3clean、1push-only未确认；两文档复探warning视图clean（编辑时的临时服务未就绪提示不当最终通过）。mode=all缓存62文件26项warning，含根AGENTS的23项及原3项代码提示，未屏蔽、不冒全仓clean。四JS语法及diff检查通过。未接移除HTTP、DTO／控制器／表单或浏览器，本批不重复无影响的Root／Trial／发布及规则长链；没有Vue改动，不重建展示壳。完整功能目标仍未完成。

## 后继装饰移除保存API

`server/drafts.js` 开放精确 `decoration-remove {memberIds}`：非空、不重复的明确实例ID，每ID1至256字符；沿用整请求16KiB、最多16项mapEdits。没有新增ID、客户端源字段或回填底层权限；调用共同 `removeDecorations`，未知实例／道路／据点或混合无效选择整批拒绝。原请求JSON、顺序历史、CAS、epoch、不可变对象／SQL收据事务均沿用；草稿GET既有实例、拆分候选、素材引用和水组投影自然反映移除，不增加第二份源。

证据前缀 `.dragon-analysis/editor-completion/decoration-removal-api-`：

- `before.log/.stderr` 首次以1800秒预算运行超时，仅完成作者的旧放置阶段进度，未到新增移除断言，不能称负控已复现或通过。失败日志保留，没有据此放宽门。
- `after-r1.log/.stderr` 在5400秒预算内正常完成 `--placement-only` 24组，实际common Request／文件SQLite／FileBucket／41输入／种子认证。保留原20组放置／拆分，新增两profile各2组：真实拆分子实例先移除一个，水组保留另一成员；原键POST／查询收据一致，精确GET及整个编译捕获源等于共同writer、旧修订和无关字段保持。随后移除最后一成员，空组消失，旧部分移除修订仍不变。
- 新负控覆盖重复／空／非字串／未知混合／据点ID／额外字段、先合法后非法的整批请求、17项／16KiB预算、同键异body409、CAS412、外作者／管理员404，均无新增draft对象。历史成员改为未知ID后read／compile capture／save三路422，恢复记录再重建服务实例读回一致；没有真正OS进程重启。Trial／release表仍为0。日志scope的旧“rename/delete lanes skipped”指宽泛素材更名／删除支线，并非本次装饰移除未测。
- `content.log` 5组、`history.log` 6组、schema23源／50表／49索引／343列／4FK、shell65及两JS语法／diff通过。裸露未知的严格编译拒绝在共同内容夹具覆盖，本API轮移除的是实际新建水域子实例，不冒原图所有移除／可玩地图认证。
- 两代码主动LSP未确认（1超时、1 push-only）；两文档warning视图clean，mode=all缓存62文件仍26项既有warning（根AGENTS23项及3项代码），未屏蔽。成功轮stderr仅8条角色阶段进度。没有web/src／Vue／DDL变化，不重建两束；该API批次尚未接移除控制器／表单（后继控制器见下），未跑移除浏览器、完整素材长入口或无关规则／Trial／发布。不是A30真实游戏删除，完整任务仍未完成。

## 后继装饰移除原键控制器

`draft.txt` 新增 `actions.removeInstances(selection)`，复用素材工作流和唯一保存journal。只有已精确读取的完整装饰实例可选；取消、空／重复／稀疏／未知／道路或素材ID均不POST。确认前复制选择数组，确认后再次核身份／代次／原loaded与表单对象；提示仅移除当前装饰及其水组成员，露出当前下层，未知底层不补值，保留素材／道路／据点／旧修订。

请求只有已保存metadata、空resourceEdits和一条 `decoration-remove`，不捎带其它脏输入或使用手改修订输入。沿用16KiB和原键原body查询／重试；刷新只恢复关联、不重建body。成功收据撤销verified，旧实例仍显示且锁定，须明确读取收据修订才显示移除结果，不乐观删行。

证据前缀 `.dragon-analysis/editor-completion/decoration-removal-controller-`：`before.log` 原103项通过、新3项因未接动作失败；`after-r1.log` 两控制器106项全通过，覆盖两profile选择冻结、原已读修订、其它脏输入保留、未知回包锁／原键原body重试、刷新只查询、精确重读、取消、身份更换／原地ID或version变化／强制改密、存储失败和16KiB拒绝。测试使用自有DTO与API端口，不冒真实后端保存或浏览器证据。

shell65、测试JS及TXT模块语法（pipefail）／diff通过。测试主动LSP为push-only未确认，TXT无语言服务；两文档warning视图clean，mode=all缓存62文件仍26项既有warning（根AGENTS23项及3项代码），未屏蔽。没有服务／web/src／Vue／DDL更改，不重建两束或重跑无影响的Root／规则／Trial／发布链。该控制器批次的移除Vue表单与真实浏览器进展见下；不是物理删除或完整编辑器完成。

## 后继装饰移除表单与真实浏览器保存

`MaterialsPanel.vue` 新增“移除所选装饰实例”，复用已有完整实例勾选集合。跨页／被筛选隐藏的选择仍参与，数量明确显示；无选择或已读修订失效时禁用。文字区分实例移除和无引用作者素材定义移除，未知底层不补值。原生确认交共同控制器，不乐观删行；收据后精确重读才清选择并安装新列表。

证据前缀 `.dragon-analysis/editor-completion/removal-ui-`：

- `browser-r1.log` 工作台新Chromium95项通过（`editor-workbench/run-PeGcbH/result.json`）。实际gateway／Vue／CSP，API明确夹具；覆盖跨页选两个实例、过滤后页外一项仍参与、取消无POST、提交后旧行锁定、精确读取32→30及选择清理。
- `real-r32.log/.stderr` 运行被中断，日志与输出目录为空、没有收据，未计通过；检查该测试进程无残留后使用全新轮次，不复用其数据库／profile。
- `real-r33.log/.stderr` 的 `verify_editor_template_browser.mjs r33 --materials-only` 15组通过，实际Node服务／文件SQLite／FileBucket／41来源／自有HTTPS／真实登录／新Chromium。保留既有14组，新增13→14批量移除两个实际拆分子实例，其中一个被筛选隐藏：取消无写；真实提交200后仅丢浏览器回应，父流程脏名称不捎带、原行保留且锁定；刷新原键查询／读取14只发生一次移除POST。
- 收据 `editor-phase/template-browser-r33/receipt.json`、截图 `template.png`；总12次保存／12个原键，31源码SHA逐项复核一致，stderr为空。精确DTO仅去目标实例／拆分候选／对应素材引用，原素材及其它章／地图／水组投影保持，旧13不变；管理员越权拒绝、无正式IDB／外连／非预期错误。此轮中立、null类子实例移除，不冒完整副本或水组移除浏览器证明，相关API证据独立保留。
- Vue build/check逐byte一致（JS405845B、CSS33898B、8包notice），shell65、两测试语法通过。三代码主动LSP未确认（2超时、1 push-only），不称clean；两文档warning视图clean，mode=all缓存62文件仍26项既有warning（根AGENTS23及3项代码），未屏蔽。最终diff检查通过。无web/src／服务／DDL改变，不重建原生束、不重复无影响Root／规则／Trial／发布长链；完整地图工作区和整项编辑器仍未完成。

## 后继明确补底受信历史（HTTP尚未开放）

依据工程合同§2的明确补底约定，`copyprofile.js` 两profile接受内部 `base-fill {cells,tile,geography}`，精确字段与dense数组校验后复用共同 `fillBase`。只允许明确非空、唯一的固定域格索引，原byte 0..255和地理0..3，安全整数且拒负零；不猜草地／陆地等默认值，不代表原版通行规则。完整副本新增基础terrainRef／geography的重放结果精确比较，与已有unknownUnderlays／waterGroups比较一起覆盖完整写集，余字段仍整源保护。

共同writer只修改所选基础格、清理对应未知记录及旧base水组引用；组还有其它成员或baseCells则保身份／显隐，真空组移除。装饰、道路、据点、素材和其它基础格不改，不将放置时截图回填为下层。未补的裸露unknown仍受原严格编译门；界面解锁base并确认的要求没有取消，该历史批次HTTP与界面都尚未开放此命令；后继API见下，界面仍未接。

证据 `.dragon-analysis/editor-completion/base-fill-history-`：

- `before.log` 新正控在未接线时422 `COPY_TEMPLATE_HISTORY`；`after.log` 两profile共6组通过、41固定Web输入：显式边界值、连续补同一格、JSON codec、其它源字段不变；缺历史、非法格／重复／空／稀疏／非数／负零／越界byte或geography、先越界再合法、访问器0执行，以及夹带其它基础格／上层／城市／unknown修改均拒绝。
- 另以明确自有base水组夹具验证移除部分baseCells保组、全移除去空组；不冒原图这两格本来是水域。`water.log` 31项、`removal.log` 6组及shell65通过，既有装饰移除不回填底层的合同保持。
- 两JS语法／diff通过；代码主动LSP1clean、1 push-only未确认，两文档warning视图clean。mode=all缓存63文件仍26项既有warning（根AGENTS23及3项代码），未屏蔽。仅内部profile／测试／文档变化，无web/src／Vue／DDL变更，不重建两束，不重复无影响HTTP长入口／浏览器／Trial／发布。此历史批次没有补底HTTP正向证据；后继API见下，明确选项、base解锁／确认和实际工作区仍待接。

## 后继明确补底保存API

`server/drafts.js` 接入精确 `base-fill {cells,tile,geography}`，格索引为0..98303的非空唯一列表，图块0..255、地理0..3；安全整数、拒负零，不允许夹带source、unknown记录或工作区锁定状态。整请求16KiB／16项mapEdits沿用。调用共同writer及两profile顺序整源比较，不分配新实体身份、不改旧请求JSON或CAS／epoch／不可变保存事务。

新增显式 `verify_editor_template_root.mjs --base-fill-only` 聚焦入口，沿用实际初始化／来源安装／作者与管理员完整复制的共同前置，跳过无影响的素材放置拆分长链。证据前缀 `.dragon-analysis/editor-completion/base-fill-api-`：

- `before.stderr` 新正控在HTTP未接时422 `DRAFT_MAP_EDITS`；`after-r1.log` 12组通过，实际common Request／自有文件SQLite／FileBucket／41固定Web输入、种子认证，不冒真实登录浏览器。
- 两profile都从实际已保存源明确选两个有unknown记录的基础格，保存后整源编译捕获逐值等于共同 `fillBase`，仅所选记录清理；原键POST／查询收据一致、旧修订不变，原请求body精确保留，上层／素材／实体DTO保持。随后另一请求显式覆盖其中一格到边界byte255／地理3，精确源与旧版本保持。
- 空／重复／非法格、非法数值／类型／额外字段、先合法再非法的整批、17操作／16KiB、同键异body409、旧CAS412、异作者／管理员越权404都拒绝且无新draft对象。把历史tile改成另一合法值后，read／compile capture／save三路422；恢复原记录并重建服务实例后读回一致，不冒OS进程重启。旧legacy request_json逐byte不变、Trial／release表仍0。
- 内部历史6组、schema23源／50表／49索引／343列／4FK、shell65、两JS语法／diff通过。两代码主动LSP未确认（1超时、1 push-only）；两文档warning视图clean，mode=all缓存63文件仍26项既有warning（根AGENTS23及3项代码），未屏蔽。没有web/src／Vue／DDL变化，不重建两束；未跑未接的补底控制器／浏览器、完整素材长入口或无关规则／Trial／发布。该批GET尚无完整基础格读回投影，后继见下；base解锁／确认要求仍是后续工作，不以保存成功宣称可玩。

## 后继基础格只读投影

精确草稿GET新增 `baseTerrain {width,height,tiles,geography,unknownCells}`：宽高直接来自已核源bounds，两数组是基础层自己的完整数据，未知tile保持null；unknownCells仅为已有unknownUnderlays记录的格索引，不是当前露出未知的计算结果。没有把上层装饰／道路／据点合成到此投影，没有回填0、默认地理或可玩解释；原覆盖来源详情不外发。两个数组及索引数组独立复制，不成为第二份可写源，也不授予基础层解锁状态。

证据前缀 `.dragon-analysis/editor-completion/base-terrain-dto-`：

- 首次 `before.log/.stderr` 进程以134退出、报告内存分配失败，无完成收据，不能作为缺功能或产品故障的具体证明。测试增加先核投影存在的短断言，避免缺字段时展开98304格数组差异；`before-r2.stderr` 明确复现 `base terrain projection required`，实际字段undefined。未改机器配置或结束其它进程。
- `after-r1.log` 的 `--base-fill-only` 14组通过，实际common Request／文件SQLite／FileBucket／41输入、种子认证。两profile各新增完整原始数组／98304格／null及unknown记录逐项核对，直接服务DTO修改后重新捕获源仍不变；补两格后仅相应tile和unknown列表改变，后续255／3明确覆盖读回一致，旧精确修订保持。原保存原键／CAS／权限／坏历史／重建等测试继续保留，stderr为空。
- shell65、两JS语法通过；两代码主动LSP未确认（1超时、1 push-only）；两文档warning视图clean，mode=all缓存63文件25项既有warning，未屏蔽、不据缓存认定未确认代码clean。最终diff检查通过。没有请求／DDL／UI／web/src变更，不重建两束或重复未接的基础层浏览器／无关长链。该投影批次的客户端校验、默认锁定及原键控制器进展见下；表单仍待接，不是完整地图编辑或运行认证。

## 后继基础层锁定与补底控制器

`draft.txt` 在响应边界一次核对固定384×256的完整tiles／geography数组及唯一unknown索引，拒绝缺格、稀疏、非法值／类型或额外字段；缺DTO保持未知，坏DTO不半替换上下文。全部98304格留在控制器私有状态，Vue展示投影只有每页24条独立格摘要（索引／坐标／tile／geography／unknown标记）及计数，不把完整源送入响应式树。只读翻页无网络请求，也不要求先解锁。

基础层默认锁定；`baseUnlock(true)`只在身份有效、精确已读且无未确认操作时生效。换身份、成功读取、收据或开始补底都重新锁定，不将此工作区状态写进source或journal。`baseFill(cells,tile,geography)`要求显式唯一格和byte／地理值，确认前冻结输入，确认后重核身份、代次、原loaded／基础投影及仍然解锁；确认期间重新锁定即取消，不恢复旧锁状态。

提交只用已保存metadata、空resourceEdits和一条base-fill，沿用16KiB与唯一journal。其它脏表单不捎带，未知回应不另起保存，刷新只查原键而不重建body；原键重试无需重新解锁已确认的原命令。收据后保留旧格值并锁定，明确读取收据修订才显示新值，仍须另行解锁下一次编辑。

证据前缀 `.dragon-analysis/editor-completion/base-fill-controller-`：

- `r1.log` 两控制器110项通过（原106＋新4），覆盖两profile、null保持、分页最后格98303、无完整数组投影／无别名、缺坏DTO原子拒绝、默认锁定／身份更换重锁、取消／重新锁定／原地身份变化、非法选择／数值、16KiB、存储失败、选择冻结、原键原body恢复、刷新只查询、其它脏输入保留及精确读回。此批测试首轮通过，没有伪造失败记录。
- `root-r1.log` 实际common Request／文件SQLite／FileBucket／41来源的 `--base-fill-only` 14组通过；新增两profile真实GET投影通过原生控制器，分页末24格逐项匹配原始DTO，翻页／解锁不增加GET或POST。此控制器集成明确只允许GET、storage写入即抛错，不冒实际控制器POST、真实认证或浏览器证据；原后端保存覆盖继续保留。
- shell65、两JS与TXT模块语法（pipefail）通过。两代码主动LSP未确认（1超时、1 push-only），TXT无服务；两文档warning视图clean，mode=all缓存63文件25项既有warning，未屏蔽。最终diff检查通过。未修改服务／web/src／Vue／DDL，不重建两束或重跑无影响长链。此控制器批次的基础格表单与实际浏览器进展见下，不以此标记完整地图或整个编辑器完成。

## 后继基础格表单与真实浏览器补底

新增 `BaseTerrainPanel.vue` 并挂入地图页：默认锁定、每页24条已读基础格，明确显示null未知／地理原值／未知来源标记；可在未解锁时只读翻页、跳至1–4096页，最后格98303可见。选取跨页保持且明确页外计数，需主动解锁、输入图块byte及地理值；所有输入初始空，非法或缺值禁提交。锁定状态与所选格仅属工作区，不是第二份源；保存不乐观改值，成功后须读精确收据修订并再次解锁。

证据前缀 `.dragon-analysis/editor-completion/base-fill-ui-`：

- `browser-r1.log` 工作台新Chromium98项通过（`editor-workbench/run-zZfQl8/result.json`），真实gateway／Vue／CSP、API明确夹具；覆盖缺DTO未知、默认锁／null不补零、4096页最后格、只读翻页无请求、跨页选择、缺值／越界禁用、取消不POST、另表脏输入不捎带、提交后旧值锁定及精确读回。
- 新显式 `verify_editor_template_browser.mjs r35 --base-fill-only` 保留其它入口，绕开无关素材长链。`real-r35.log/.stderr` 7组通过：实际Node／文件SQLite／FileBucket／41来源／自有HTTPS／真实登录／新Chromium。由已读DTO选两个不同页且不属base水组的真实未知格；明确解锁及20／0输入，取消无写。实际提交2→3后只丢浏览器回应，刷新仅恢复原键、查询／明确读取3只一POST；原2及其它上层、章、素材、水组投影保持，已选unknown来源项消失但未选数组值原样。
- 再明确解锁，对其中一格输入255／3保存3→4，精确读回、旧3保持、不同操作键。收据／截图 `editor-phase/template-browser-r35/receipt.json`／`template.png`；共2次补底保存，32源码SHA逐项复核一致，stderr空，管理员越权404、无正式IDB／外连／非预期错误。不是完整副本补底浏览器、水组修改浏览器、可玩初始化／Trial／发布或完整画布认证。
- Vue build/check逐byte一致（JS418610B、CSS33898B、8包notice），shell65、两测试语法及diff通过。功能测试首轮通过；编辑工具随后阻断测试文件80处字符串拼接（含既有行），已按AST核对、定点改为模板字符串，未改业务断言或其它格式。r34为转换前成功记录，转换后重新建立全部隔离环境的r35再通过，当前32项源码SHA一致；不把旧r34冒充改写后的证明。AST复核剩余字符串拼接为0。四代码主动LSP均push-only未确认；两文档warning视图clean，mode=all缓存64文件仍25项既有warning（根AGENTS格式23项及两测试各1项），未屏蔽。无web/src／服务／DDL变更，不重建原生束或重复无影响Root／规则长链。

## 后继实例位移准备独立取消

`MaterialsPanel.vue` 增加“取消位移准备（不保存）”：仅清空本地X／Y，未填完一轴也可取消；保留全部实例勾选（含页外）、筛选与素材放置参数。装饰几何锁不阻止撤销本地准备，不会因此解锁或写源；沿既有`locked`保护忙碌／未确认保存上下文，两轴都空时禁用。继续复用原`hasInputs`脏离开判断，不新增journal、GET或POST。成功保存导致上下文失效时仍由原watch清理输入，不改变既有保存／重读生命周期。

证据 `.dragon-analysis/editor-completion/shift-cancel-`：`browser-r2.log` 165组通过（原164＋1，另扩原双实例锁定组），新Chromium产物 `.dragon-analysis/editor-workbench/run-4V0JVH/`。核单轴未完成及双轴取消、锁定时可取消、空值禁用，页外勾选／筛选及具名变体／落点／水域参数不变，无新增请求。API为明确夹具，不冒实际后台保存证书。首轮误以为收据后本地2／3位移仍保留，实际原watch已清空，`browser-r1.log`保留失败；改正断言，未改保存行为。

build/check逐byte一致（JS511596B、CSS36741B、8包许可）、shell65、测试语法与diff通过。两代码主动LSP300秒仍一timeout／一push-only未确认。仅Vue、既有工作台测试和生成壳变化，不重建不变原生束、不跑无影响实际保存／Trial／发布／规则长链；这不是实例画布移动或完整A09交付。

## 后继检查格取用实例位移

`MaterialsPanel.vue` 在原24项分页的实例列增加“用作位移锚点”，仅已勾选实例可选，绝不默选第一项；不新建全部实例的下拉DOM。锚点显示原稳定ID与已保存坐标，筛选／翻页不丢失；取消勾选该实例会清锚点，再勾选不会自动恢复。几何锁或非装饰层不能选／取用，不因此清空已填位移。明确重读成功、保存上下文失效、身份／修订切换仍沿原watch清本地参数及锚点；失败读取保留旧表单与选择。

`MapPanel.vue` 只转送锚点与取点事件；`MapWindowPanel.vue` 沿已读窗口／图集的原检查坐标，提供“将检查格用作所选位移锚点目的地”。接收端再次核当前锚点ID、勾选、编辑层／锁及gameId／已读revision／sourceDigest，随后仅写本地 `shiftX=目的地X-锚点X`、`shiftY=目的地Y-锚点Y`。单纯点地图不填位移；明确取用也不导航、读取、保存、移动源或改变勾选／素材放置参数。锚点工具选择自身不算内容脏输入，填出的X／Y沿原脏离开判断。

零位移仍不能提交。取点不认证整批footprint、不裁切越界、不把合成图格当底层；该取点批次尚无所选实例占格／贴图预览；后继[目的占格轮廓](#后继整批位移目的占格预览)只补前者。作者须另按原“整批平移”并确认，服务继续验证全部勾选实例（含页外项）、完整占格及原profile；原journal、原键恢复与精确重读不改。

证据前缀 `.dragon-analysis/editor-completion/shift-point-`：

- `browser-r1.log` 167组通过（原165＋2）；补充重读场景的最终 `browser-r3.log` 仍167组通过。实际新Chromium／gateway／Vue，API为明确夹具，不冒真实后端保存或任免／运行准入证据。明确选锚点、零位移、检查后仍不填参数、取点计算1／0、隐藏锚点行仍可取用、锁定／换层禁用、取消保存保输入、取消勾选清锚点及重新勾选不复活均通过；全部请求计数、窗口／Atlas／scene／框选／显隐读数、原RGBA及素材变体／水域／坐标保持。成功／失败同修订重读分别清除／保留锚点。
- `browser-r2.log` 在补测重读时试图从基础层选择装饰锚点，按钮按规则禁用而超时，保留失败。r3显式先切装饰层选择，再恢复原基础层，未放宽产品守卫。首版未执行的实现草稿曾使用全部已选项下拉，测试前改为现有分页列按钮，避免为全图框选创建巨大选项列表；无新独立测试框架。
- build/check逐byte一致（JS515012B、CSS36741B、8包许可），shell65与测试语法／diff通过。四代码主动LSP300秒均push-only未确认；纯Vue及测试／生成后台壳变更，无服务／原生控制器／web/src／DDL变化，不重建原生束，不重复无影响的实际保存／Trial／发布／规则长链。

此处只补地图检查格到现有批量位移表单的操作出口；当时完整实例画布拖动／占格预览与完整A09仍未完成；后继占格轮廓见下节，画布直接拖动及完整A09仍未完成。后继真实服务保存证据见下节，不用夹具成绩代替。

## 后继取点位移真实HTTPS保存

复用 `tools/verify_editor_template_browser.mjs` 的自有Node共同服务、临时SQLite／FileBucket、固定41来源输入、loopback HTTPS及全新Chromium。新增显式 `--translation-point-only`，沿既有真实作者登录／强制改密、中立创建原键恢复和修订2读取，仅运行取点正反位移；完整素材模式仍保留原擷取／更名／调序／拆分／移除链，取点准备共用同一函数，没有新增服务路由或测试框架。

`.dragon-analysis/editor-completion/shift-point-http-r72.log` 9组通过，收据 `.dragon-analysis/editor-phase/template-browser-r72/receipt.json` 的40源码SHA逐项核同。基准实例 `import-atom-0`／`tile-20` 从(0,0)以真实已读窗口检查格(1,0)填1／0，修订2→3；再从(1,0)取(0,0)填-1／0，修订3→4，最终全部实例坐标恢复原2。每次准备只有精确revision2或3的一个1×1窗口GET及一个spring图集GET（共4GET），输入框999不被当成已读修订；检查本身不填位移，独立取用不发保存或其它GET。该计数仅限取点阶段，不冒整项测试只有4GET。

两次另行确认保存共2POST，核准确If-Match、原metadata、空resourceEdits及单个 `decoration-translate`，其它脏名称不捎带；取消确认无写，原上下文和输入保留。第一次已提交后只丢浏览器回应，刷新仅恢复原操作关联，原键查询和明确读3不重复POST；第二次用不同键反向平移并明确读4。旧2／3不可变，未选实例、章节／据点／地图描述／城市定义／素材定义保持；读回清本地位移与锚点。管理员读该作者草稿404，正式IDB访问0、errors／outside为空。没有伪造API成功回包；丢回应沿原受控route.fetch／abort，不修改服务结果。仅单实例、现有固定域、作者中立副本；不冒批量占格全矩阵、管理员完整副本、可玩初始化／Trial／发布或生产TLS认证。

保留失败和未覆盖：`shift-point-http-r70.log/.stderr` 的完整 `--materials-only` 1800秒空输出超时，无收据；r71增加不含凭据的阶段日志，600秒超时，已到真实创建／读2，但未到取点准备。两轮后仅查询本轮命令的Node进程，未发现存活，不关闭其它进程。单独Node导入检查成功，r71阶段日志证明不是停在启动；**未定位完整素材长链超时的唯一根因**，r72聚焦通过不撤销r70／71未确认，也不认证未重跑的完整模式。聚焦入口首轮通过，保留完整模式及其默认行为分支，未放宽超时／权限／保存守卫。

本批只有既有测试工具与文档变化；产品三Vue、生成壳、原生束及库指纹不变，不重复构建或无影响工作台／规则／Trial／发布链。测试语法、diff和本地链接检查通过；工具主动LSP300秒仍push-only未确认。完整A09和长期目标仍未完成。

## 后继实例本页批量勾选

`MaterialsPanel.vue` 在既有24项分页列表增加“本页全选／取消本页”，仅操作当前筛选页，保留页外勾选；追加去重并保留原已选顺序。原生checkbox显示全选／部分选中／空选状态，空页禁用；繁忙及未确认保存仍沿原 `locked` 禁用。装饰几何锁不限制只读选择，与单行勾选一致。筛选／翻页本身不改变集合，也不自动选定位移锚点；取消本页若移除现有锚点，仍由原取消勾选监听清除。原“清除全部选取”继续作用于完整集合。无GET、保存、来源或运行准入变化。

复用工作台入口：`.dragon-analysis/editor-completion/instance-page-browser.log` 168组通过（167＋1），产物 `.dragon-analysis/editor-workbench/run-WlR9TU/`。新组核部分选中、第一页24／第二页6合并30、取消第二页保24、筛选单行取消保23、空筛选禁用、几何锁下选择、再次选页去重、清全部恢复checkbox及原请求计数不变；原保存收据后禁用也覆盖。全新Chromium／实际Vue和gateway，API仍为明确夹具，非新的真实HTTP保存／权限证明。

后台build/check逐byte一致（JS516014B／CSS36741B／8包许可），shell65、测试语法及diff通过。两代码主动LSP300秒均push-only未确认，不称clean。仅组件、既有测试、生成后台壳及文档变化；原生控制器／服务／web/src／DDL未改，不重建原生束、不重跑无影响实际保存／Trial／发布／规则链。完整实例画布移动、地图工作区及A09仍未完成。

## 后继基础格本页批量选择

`BaseTerrainPanel.vue` 为既有24格分页补底列表增加“本页全选／取消本页”，只追加／移除当前页格索引，去重并保留页外集合。原生checkbox显示部分选择状态；空页、未解锁、非基础编辑层、繁忙或未确认保存时沿原 `locked` 禁用，与单格选择一致，不借此解除基础层锁。翻页不自动选择；“清除全部选取”仍作用于全部页。

选择不填写图块byte／地理值，不根据合成像素或未知底层猜值，不发GET或保存。作者仍须明确两项数值，并经原确认、单一journal及精确修订保存／读取；原批次、正文预算及服务校验不变。保存／重读清除集合后checkbox同步归空并锁定。

`.dragon-analysis/editor-completion/base-page-browser.log` 首轮169组通过（原168＋1），产物 `.dragon-analysis/editor-workbench/run-RdnObH/`。新组验证单格部分选中、24＋24合并48、取消第二页保第一页、重新选页去重、锁回／换道路层禁用而保集合、清全部与明确重读后状态、两项数值保持空及零新增请求；原两格补底确认／收据／读回仍通过。全新Chromium与实际Vue／gateway，API为明确夹具，不冒新的真实HTTPS批量保存／权限证明。

后台build/check逐byte一致（JS517078B／CSS36741B／8包许可）、shell65、测试语法及diff通过；两代码主动LSP300秒均push-only未确认。只改组件、既有测试及生成后台壳，不重建未变原生束，也不重复无影响服务／实际保存／Trial／发布／规则长链。完整地图编辑及A09仍未关闭。

## 后继补底参数独立取消

`BaseTerrainPanel.vue` 新增“取消补底准备”，仅清空本地tile／geography，不清选格或页码，不读取／保存，不还原已保存地形，不解除基础层锁。与“清除全部选取”区分：后者只清集合，不代表放弃已填参数。按钮沿原readLocked（繁忙、不可读上下文或未确认保存）禁用；单纯锁回基础层不阻止清理本地准备，空参数时禁用，数值0仍属于已填参数。原hasInputs读取这两个字段，取消后不再因它们触发离开确认，其它脏表单仍独立保留。

复用工作台入口，`.dragon-analysis/editor-completion/base-cancel-browser.log` 首轮170组通过（原169＋1），产物 `.dragon-analysis/editor-workbench/run-jYVXpv/`。验证锁回后清两项参数但不解锁、跨页两格及当前页保留、仅填0也能取消、取消后空值禁用、零新增请求，之后正常离开／返回保留选格；原保存收据未重读时按钮禁用。既有补底保存／重读及其它工作台流程保持。全新Chromium与实际Vue／gateway，API为明确夹具，非新的真实服务保存或权限证明。

build/check逐byte一致（JS517970B／CSS36741B／8包许可）、shell65、测试语法及diff通过；两代码主动LSP300秒均push-only未确认。只改组件、既有测试、生成后台壳及文档，不重建未变原生束或重跑无影响服务／规则／Trial／发布链。A09和全量目标仍未完成。

## 后继整批位移目的占格预览

`MaterialsPanel.vue`复用已读实例坐标、完整勾选集合和`materialPlacement.materials[].offsets`，将已填写的非零整数位移投影为目的占格。offsets来自服务端共同`componentCells`，即definition.footprint减anchor，不从格数、图片或实例名称猜形状。该批实例DTO尚未声明当前variant，因此只画占格轮廓，不假选original贴图；后继[实例当前变体缩图](#后继实例当前变体只读投影与缩图)增加只读字段与列表缩图；再后继[目标贴图](#后继整批位移目标贴图)接入所选实例的半透明目标层，仍非移动后底层合成。

通过`MapPanel`传给`MapWindowPanel`的仅是当前窗口内去重占格、精确窗口身份及计数，不是地图源；最多32×32即1024个SVG格。所有勾选实例（含筛选／分页隐藏项）参与，越界格次按实例计数，缺形状的实例单独标未知，不补默认。窗口外仅不画，不裁切保存集合或位移；同格重叠只合并显示，不合并实例身份。

紫色表示目的轮廓，存在越界格次时红色；原位置仍留在已保存底图，未知下层不作模拟。原确认、完整服务校验、journal及精确重读流程不变，不自动GET／POST或保存，不把轮廓当成合法性／运行证明。只有已读、可编辑装饰层及完整位移时显示；锁定／换层／繁忙隐藏，清空位移或选取撤销。本占格批次在任何指针／HTML拖曳期间隐藏，避免与临时平移窗口错位；后继[位移目标拖曳](#后继整批位移目标拖曳)为该模式接入独立临时预览，其它工具仍隐藏。显示前再次匹配game／revision／sourceDigest与窗口矩形。提示区固定高度、叠层pointer-events:none，不移动或拦截画布输入。

复用工作台入口，`shift-preview-browser-r1.log`首轮171组通过（原170＋1），产物`.dragon-analysis/editor-workbench/run-Xn2Lrj/`。两个重叠实例在非等比显示窗口中向右一格，目的窗口联集为两格、越界格次为二；改向左一格只留窗口内一格且无越界，输入不完整隐藏。筛选不丢隐藏选择，锁／道路层隐藏、恢复装饰层重显，取消位移撤销；底图RGBA、其它放置参数、原请求计数及原位移确认取消保持。未知形状计数在本轮用例为0，未新增旧DTO缺形状分支专项。新Chromium／实际Vue与gateway，API仍为明确夹具，不冒新实际HTTP保存／权限证据。

build/check逐byte一致（JS521927B、CSS37063B、8包许可）、shell65、测试语法与diff通过；四代码主动LSP300秒均push-only未确认。只改三Vue、既有测试和生成后台壳；服务、共同geometry、原生控制器与web/src不变，不重建原生束或重复无影响实际保存／Trial／发布／规则链。该批尚未接位移目标拖曳；后继见下节。原位实例拾取拖动／当前变体贴图及A09整体仍未完成。

## 后继整批位移目标拖曳

`MapWindowPanel.vue`新增第六个共用工具“拖動位移目標（只填表單）”，模式下拉与右键菜单一致。必须先勾选完整实例并显式选定其中一个为位移锚点，且装饰层、锁、已读窗口／图集资格有效；不根据画布合成图块猜选哪个实例。指针所在世界图格就是该锚点的目的地，不是叠加按下后的鼠标距离。

拖动期间通过`MapPanel`向`MaterialsPanel`传递临时目标和精确来源／窗口原点；只复用已有整批footprint联集计算，**不修改原X／Y输入**。临时零位移也可预览，原非零保存门不变。所有勾选实例包括页外项参与，最多显示1024格；该批未声明当前variant，不画假定贴图；后继列表缩图不替代位移合成。位移轮廓与临时窗口同一世界原点，素材放置ghost暂时隐藏，提示明确“尚未填入參數”。未知形状及越界计数保持原含义，不裁切实例或视为服务准入。

复用已有edgePanDelta、私有整图切片预览及取消流程：只有明确读整图时才在可见边缘平移，不增加GET或规则更新。窗口内松手再次取实际世界格，经过原`useShiftPoint`身份／锚点检查才填写两轴；有临时平移时仅确定本地窗口。不移动源实例，仍须另按整批平移并确认。离可见窗口松手、Esc、失焦、尺寸／隐藏变化或锁／层／身份／锚点失效取消并恢复原RGBA及输入。勾选集合变化也重新发出锚点投影以取消正在进行的手势，不用旧目标隐式作用于变化后的集合；筛选、翻页不改变集合。

复用`verify_editor_workbench_browser.mjs`，首轮及最终`shift-drag-browser-r2.log`均179组通过（原171＋8），最终产物`.dragon-analysis/editor-workbench/run-4pPW6w/`，errors／unexpected／failed为空。最终轮另核右键菜单未选锚点时禁用新工具，选择锚点后从真实菜单进入。非等比窗口中五分支核Esc、离窗、实际resize、键盘锁定及合法零位移填写；三跨窗口分支核边缘平移超过32格后Esc、键盘改变勾选取消及正常松手，临时轮廓相对坐标0／1准确、两实例无越界，输入7／8保留到提交，确定后X为世界目标减382、Y为0。取消恢复原PNG／窗口；原未读999、全部API／窗口／Atlas／scene／选择请求计数保持。新Chromium、实际Vue／gateway、明确API夹具，不冒新的真实HTTPS保存、权限或生产证据；旧取点HTTPS成绩不当本次拖动保存证书；后继新的真实服务验证见[目标拖曳HTTPS保存](#后继位移目标拖曳真实https保存)。

build/check逐byte一致（JS524899B、CSS37063B、8包许可）、shell65、测试语法与diff通过；四代码主动LSP300秒仍push-only未确认。仅三Vue、既有测试、生成后台壳及文档变化；原生控制器、服务、web/src及DDL未改，不重建原生束、不重复无影响实际保存／Trial／发布／规则长链。这里是**已明确选择的整批实例之目标拖曳**，不是在原位置命中并抓取任意实例，不含当前变体贴图／未知下层模拟；完整地图工作区及A09仍未完成。

## 后继位移目标拖曳真实HTTPS保存

复用 `tools/verify_editor_template_browser.mjs r73 --translation-point-only`，仅为现有取点helper增加显式交互选择，不新建服务或测试框架。聚焦模式正向使用目标拖曳、反向保留检查格取用；完整素材模式仍沿原取点行为。自有Node共同服务、临时文件SQLite／FileBucket、41个固定来源输入、loopback HTTPS、真实作者登录／强制改密及全新Chromium，未替换API成功回包；只有指定已提交回应被主动丢弃，TLS例外仅限本测试连接／context，不改全局信任。

`shift-drag-http-r1.log`首轮9组通过，收据 `.dragon-analysis/editor-phase/template-browser-r73/receipt.json` 固定40个源码SHA，errors／outside为空、正式IDB访问为0。实际实例为 `import-atom-0`／`tile-20`，修订2的窗口(0,0)2×1与春Atlas均按已保存修订读取，输入999不影响请求。真实指针从锚点格拖至(1,0)，占格轮廓与实际来源相符、无越界或未知形状；拖动期间两轴保持空白，Esc后仍为空且Canvas PNG不变，重新拖动松手才填写1／0。整个定位阶段仅原窗口及Atlas两次GET，无自动保存。修订3反向使用1×1窗口检查格并独立取用，填-1／0；两阶段合计四次精确GET。

沿既有真实保存流程验证：两次独立确认前均取消一次且无POST；正向保存携带If-Match修订2和唯一 `decoration-translate` 正文，不包含其它脏名称，服务提交3后丢回应。刷新只查原键并明确读取3，无重复POST；反向使用新键／If-Match修订3，明确读取4。实际两次POST，最终坐标回到原值；旧2／3完整快照、未选实例、章节、地图描述、据点／定义／素材资料保持。成功读回清位移参数及锚点，管理员读作者草稿404。收据原“point translation”检查名称沿旧通用定位步骤保留，`translationPoints[].interaction`与scope明确区分本轮drag／point，不把旧r72结果冒充本轮。

本批只改既有测试与文档，产品源码／后台壳／原生束不变。语法、diff、链接与当前源码指纹复核通过；测试主动LSP等待300秒仍push-only未确认。此证据是中立profile单原子实例的拖动到保存／原键恢复，不是批量全部形状、整图边缘平移的真实保存证书，也不覆盖完整副本、Trial、发布或生产TLS。此前完整素材模式r70／r71超时仍未确认；不重复无影响构建、工作台夹具或规则／Trial／发布长链，A09与完整目标仍未完成。

## 后继实例当前变体只读投影与缩图

草稿读取 `decorationInstances` 增加只读 `variantRef`。值直接来自已验证实例，并沿共同 `maplayers.js` recipe及既有拆分候选的解析合同：省略实例variantRef表示定义中的具名original，而不是客户端按图片或首个变体猜测。此处不改编辑源、配方、放置／位移操作、profile历史或保存正文。

`draft.txt`边界接受旧四字段与新五字段实例摘要；新字段必须属于该实例素材的已读variantRefs，不能借其它素材的同名选项。空值／错型／未声明值或缺少选项使整次读取失败，保留此前有效状态；通过校验后复制到私有模型。旧响应缺字段继续缺失，不补original。

`MaterialsPanel.vue`在原24项分页实例列显示当前变体与128 backing／64 CSS缩略图，复用原生 `drawMaterialPreview` 和同修订已读季节Atlas。没有额外GET、图像URL或像素响应式状态；旧摘要明示未知且不画图，缺Atlas／未支持视觉配方保持空白棋盘。不改变选择、锚点、表单或规则。这里是实例本身缩图，不是移动后的底层合成、遮挡预测或运行准入；该批地图位移仍为完整占格轮廓，后继接线见[目标贴图](#后继整批位移目标贴图)。

证据前缀 `.dragon-analysis/editor-completion/instance-variant-`：

- `controller-r2.log` 两现有控制器158项通过，新增两组核具名非original变体、响应／显示对象篡改不改私有状态、旧响应缺值不补、七类无效／无绑定情况原子拒绝。首轮157／158，原因是测试把带revision参数的DTO工厂直接用作API回调，路径被误当revision；只修夹具调用，保留 `controller-r1.log`，没有放宽产品校验。
- `browser-r1.log` 全新Chromium工作台180组通过，产物 `.dragon-analysis/editor-workbench/run-GDPajG/`。新增实例使用other而素材示例仍original，三格像素分别为强调／基础／强调，证明未偷用示例变体；下一旧格式行显示未知且无Canvas。原定位、批量轮廓／拖曳、分页、取消与请求计数回归保持。API为明确夹具。
- `http-r2.log` 自有HTTPS／Node／文件SQLite与FileBucket、固定41输入、真实作者登录与新Chromium，聚焦9组通过，收据 `.dragon-analysis/editor-phase/template-browser-r75/receipt.json`。全部实例variantRef属于其实际素材选项，原原子为original；读图集后当前实例缩图ready，正向拖动保存2→3／丢回应原键查询、反向取点保存3→4、旧快照与未选内容保持，定位仍四GET、保存仍两POST。首轮r74在两次定位后总命令600秒超时、无收据，仍未确认；查询未发现该测试存活Node，不关闭其它进程。独立r75在900秒预算内通过，不把前轮记通过或断言唯一超时原因。
- Vue build/check逐byte一致（JS526187B、CSS37244B、8包许可），shell65、五个JS／TXT模块语法、diff与文档链接通过。五代码主动LSP300秒两timeout／三push-only未确认；TXT无服务。两文档主动检查clean；mode=all为133文件／47项warning及此前两项JSON往返误报，新入缓存的一项是未改的`#profile(single)`布尔参数提示，未抑制或当成本批修复。无web/src、DDL、编译或正式运行变化，不重建未变原生束，不重复无影响Trial／发布／规则长链。A09整体仍未完成。

## 后继整批位移目标贴图

复用实例有效variantRef及已读`visualVariants`，`MaterialsPanel`在原目的占格计算中增加窗口内稀疏tile投影：按**源实例绘制序**处理勾选集合，而非勾选先后；只取该实例当前变体，不代用original。每个目标格后画覆盖先画，最多保留当前32×32窗口的1024格。形状已知而贴图未知的上层将相应目标格置空，不能误显下面已选实例的贴图；后续已知上层仍可覆盖它。若任一所选形状未知，整幅贴图暂不显示，只保留已有轮廓和未知计数，不猜未知实例覆盖范围。

`MapWindowPanel`在轮廓下面增加独立Canvas，CSS透明度0.7且不接收指针；原生`draft.txt.drawShiftPreview`检查有界本地格／tile参数并用私有Atlas绘制。原素材缩图、放置ghost和此目标层共用同一已读Atlas画布，没有新GET／URL、第二份图集或响应式RGBA。临时拖曳／边缘平移的世界原点只用于计算本地格，保存正文、输入填写时机和原取消流程不变。清空参数、锁／层／身份／窗口失效仍撤销目标层。

这是**所选实例自身的目标层**，不是完整移动后合成：未选实例的目标遮挡、移走后露出的已知／未知下层、道路／据点及规则影响都不在此模拟；原位置仍画在已保存底图。越界只限制显示，不裁切保存集合或放宽服务验证。此处透明度、裁剪及疏格预算均为编辑器表现，不是原游戏机制或性能SLA。

证据前缀 `.dragon-analysis/editor-completion/shift-picture-`：

- 两现有控制器158项、shell65通过。Vue build/check逐byte一致（JS527379B、CSS37287B、8包许可）；TXT／两测试语法与diff通过。原native资源束、web/src、业务API、DDL及规则均未改，不重建不变原生束，不跑无影响Trial／发布／规则长链。
- 工作台首轮及最终`browser-r2.log`181组通过（180＋1，另扩三分支），最终产物 `.dragon-analysis/editor-workbench/run-4aXp8n/`。明确API夹具核非original像素、未知上层清空、已知上层覆盖、反转勾选顺序仍保持源顺序、0.7透明度与不拦截指针。跨32格边缘平移后的目标像素与当前上层变体相同，临时格坐标／原点一致；Esc、改变勾选取消、松手填写、底图及全部请求计数保持。
- 真实服务`http-r1.log`首轮9组通过，`.dragon-analysis/editor-phase/template-browser-r76/receipt.json`固定40个源码SHA。自有HTTPS／Node／文件SQLite／FileBucket／固定41输入、真实作者登录／新Chromium；单原子实例拖动时目标层ready且目的格像素非透明，Esc及松手不改原底图，仍须独立确认保存。原2→3丢回应查询／反向取点3→4、四定位GET／两POST、旧快照及其它内容、IDB隔离保持。不是批量全部变体或完整地图移动后合成认证；以前r74及完整素材模式的超时不被撤销。
- 四代码主动LSP等待300秒均push-only未确认，TXT无服务。本批产品／测试执行均通过，无新增失败轮；A09及完整互联网编辑器目标仍未完成。

## 后继单项选取直接设为位移锚点

`MaterialsPanel.vue` 增加“取用單項並設為位移錨點”。只有当前已读窗口选取恰为一项且装饰层可编辑时可用；沿既有 `takeDecorationSelection` 的精确来源、取代全部勾选确认及确认后身份／来源复核。返回后再核单项和本地资格，才同时设置素材勾选与同一实例锚点。不以列表第一页或当前筛选第一项猜锚点，候选可以在页外；多项不暗取首项。

取消保持原勾选和锚点。确认不改筛选／页码、X／Y位移或已保存内容，没有新GET／POST、journal或服务协议；仍须另行指示位移目标并确认保存。原仅取用勾选按钮与实例列锚点按钮保持。此项省掉拾取后翻页找实例的步骤，不是原位抓取拖动，也不计算未知下层或授予运行准入。

复用现有两浏览器入口，证据前缀 `.dragon-analysis/editor-completion/selection-anchor-`：

- `browser.log` 首轮 **200组通过**，新profile产物 `.dragon-analysis/editor-workbench/run-eVTpJi/`，API为明确夹具。已读结果在筛选页外：取消保旧under勾选／锚点，确认选overlap并设同名锚点，筛选under和原位移两轴保持、页外选中计数正确，零额外请求。完整框选多项、空结果与锁定禁用，解锁不自动取用。不是服务权限证书。
- `http-r81.log` 首轮 **14组通过**，产物 `.dragon-analysis/editor-phase/template-browser-r81/receipt.json`，绑定41个测试源码／资源SHA。真实自有HTTPS／Node／SQLite／FileBucket／固定源、作者登录和全新profile：修订2画布拾取后新按钮取消保空勾选／锚点，确认同时取用并设锚点，**不再点击实例列锚点按钮**即进入目标拖曳；位移两轴此前保持空。其后Esc、松手填1／0、独立确认2→3丢回应原键恢复；修订3批量重叠联集／最上拾取及取消转移保下层，原列表锚点反向3→4还原继续通过。共7定位GET、2POST／2独立键，精确已读修订非999、旧2／3与其它源保，管理员404、IDB0、errors／outside为空。仅此实际原子实例流程，不外推批量移动、未知几何、Trial或完整A09。
- Vue build/check逐字节一致、shell65、两MJS语法及diff通过。三代码主动诊断：两项300秒push-only未确认，另一测试报告既有查询断言的嵌套三目样式warning，保留而未屏蔽。随后mode=all列36条错误级诊断：工作台既有代码34条样式项（33条字符串模板、1条反向条件，均不在本批新增锚点断言行）及既有实体JSON往返2条已记录误报；另列120 warning／14 hint。不做无关全文件改写或抑制，不能把测试通过写成诊断全净。文档及最终指纹见 `selection-anchor-final-hashes.json`。

只改Vue组件、既有测试与生成后台壳，无控制器／服务／web/src／DDL变化，不重建原生束，不重复无影响规则／Trial／发布长链。完整地图工作区和编辑器目标仍未完成。

## 后继已选锚点占格抓取位移

互联网窗口新增第八个模式“抓住已選錨點占格位移”。须先显式勾选并指定锚点；仅装饰可编辑／可见、已读窗口与图集就绪、该锚点实例有已知完整offsets时可用。按下必须命中该实例的某一真实占格，不按边框或cellCount猜形状；蓝色轮廓先标明锚点的已知占格，包含被遮住的格，因此不是未选实例的最上自动拾取，也不改变素材勾选。

抓取保留按下格相对源锚点的偏移：目标锚点＝当前游标世界格－抓取偏移，按下不跳到游标格，也不叠加表单已有位移。复用原shift手势、整批占格／当前变体贴图预览、边缘整图切片及松手填表；取消、锁定、选取／资格／几何失效走原取消，不新建地图写入入口。已读整图边缘平移仍在临时世界origin内换算，合法松手才确定窗口并填两轴；仍须另行确认整批保存。其它选中实例跟随同一位移，未知下层不补、不裁切或扩域。

复用工作台，`anchor-grab-browser.log` 首轮因模板提示仍只允许旧pick/select模式而超时；补齐grab显示，不改断言掩盖。r2通过后补跨窗抓取验证，`anchor-grab-browser-r3.log` **212组通过**（原206＋6），产物 `.dragon-analysis/editor-workbench/run-SarXjY/result.json`。八项菜单及无锚点禁用；负偏移三格夹具抓住+1格：按下零位移预览、松手得到−1而非旧目标模式的0，Esc／锁定保原1／0；未读输入／请求与底像素保持。整图边缘两例核抓取偏移、临时origin贴图对应、Esc还原和松手位移origin−382；原锚点移出窗口后在空白按下不开始抓取。合法legacy缺offsets即使已有锚点仍禁新模式，原目标模式保持可用，不能从格数补形状。均为真实gateway／Vue／新Chromium与明确API夹具；新模式真实HTTPS保存的后继限定验证见下节，不冒完整权限证明。

Vue build/check逐byte一致、shell65、MJS语法／diff／链接通过；主动诊断与当前指纹见 `anchor-grab-final-hashes.json`。一轮精确编辑部分应用后补齐未匹配提示，再执行构建测试；未运行半修改状态。仅MapWindowPanel、既有工作台测试、文档与生成后台壳变化；无共同控制器、服务、web/src、DDL或规则变更，不重建原生束、不重复无影响实际保存／Trial／发布／规则长链。完整A09／编辑器仍未完成。

## 后继锚点抓取真实HTTPS保存与恢复

复用 `verify_editor_template_browser.mjs --translation-point-only`，仅把正向目标拖曳替换成已选占格grab模式；反向明确取点和原保存／恢复链保持。真实作者登录、自有Node／文件SQLite／FileBucket／固定41项安装源／HTTPS／全新Chromium，无成功API夹具。修订2单格最上拾取后，通过原确认快捷动作取用并设锚点，不另点实例列；在源实例占格按下，Esc保空位移，合法松手只填1／0、源Canvas字节保持，蓝色锚点轮廓仍位于未保存的源位置。后续独立确认才按准确CAS2提交平移。

正向实际200提交至3后故意丢浏览器回应，刷新仅查询原键、明确读3，无重复POST；反向沿原列表锚点与检查格取点−1／0，以新键提交3→4还原。修订3真实重叠的完整框选／最上拾取／轮廓与取消取代保持原下层勾选，旧2／3与其它源投影保持、管理员404、IDB访问0、errors／outside为空。共7定位GET（修订2／3非未读999）、2POST／2独立键。

`anchor-grab-http-r86.log` 首轮 **14组通过**，`.dragon-analysis/editor-phase/template-browser-r86/receipt.json` 含41项测试源／资源SHA、`interaction:grab`正向手势及`interaction:point`反向记录。此次真实实例为单格原子占格，抓取偏移为0；不以此替代上节API夹具的非零抓取偏移／跨窗证据，也不冒多格抓取、整批真实移动、未知底层、Trial或发布认证。

仅既有工具和两份文档变化，语法／diff／链接、当前指纹与主动诊断见 `anchor-grab-http-final-hashes.json`；不重建未变产品／Vue／原生束，不重复无影响工作台、控制器、规则／Trial／发布长链。完整A09与总目标保持进行中。

## 后继只看已勾选实例

`MaterialsPanel.vue` 增加“只看已勾选”，与现有实例／定义文字筛选取交集，仍从完整已读目录按原绘制序列出，每页24项。用Set查询勾选身份，不为每个实例线性搜索整个选择集合。切换筛选回第一页；取消勾选使该列离开此检视，集合缩小导致末页消失时回到最后一个有效页。关闭筛选不会复活已取消的勾选，也不改位移锚点、X／Y、放置输入、地图源或journal。锁定／忙时不可操作，明确上下文变更沿原准备状态清理一起复位。

复用现有工作台验证：30项跨页全选后开启筛选，保原顺序、锚点piece-000与位移7／−2；取消末页6项后显示剩余24项，页码及本页全选状态正确。文字筛选到单项后取消勾选，行消失；关闭再开启筛选不恢复该项，清空选择后显示空集合，关闭筛选恢复普通列表。全程原请求计数、素材读写次数保持；后续原擷取仍包含页外勾选，收据阶段新筛选禁用并复位，不改变保存命令。

`instance-selected-filter-browser-r1.log`／`-r2.log` 记录真实显示问题：列表已回前页，本页全选的DOM checked仍停留在旧页取消值，等待列表更新也未消除。将本页复选框以当前页身份序列作为key，页成员变化时同步重建该控件，未修改实际选择集合。r3继续至单项取消后，Playwright uncheck尝试检查已离开DOM的原行而超时；改为实际click并等待行消失、取消筛选后再核未勾选，不放宽产品断言。失败日志全部保留。

r4 **215组通过**，随后固定7项入口／依赖／生成物SHA，最终r5仍 **215组通过**（原213＋2），产物 `.dragon-analysis/editor-workbench/run-HvWUnX/result.json`，errors／unexpected／failed为空。是全新Chromium与实际gateway／Vue、明确API夹具的本地筛选回归，不冒真实后端保存或完整A09。Vue build/check逐byte一致、shell65、测试语法／diff／链接通过；两代码主动LSP等待300秒仍push-only未确认。当前指纹、日志及诊断见 `instance-selected-filter-final-hashes.json`。无控制器／服务／web/src／DDL变化，不重建原生束或重复无影响真实保存／规则／Trial／发布长链。

## 后继窗口选取独立清除

素材工具新增“清除窗口選取（保留勾選與錨點）”，调用唯一草稿控制器 `clearDecorationSelection`。仅清理本次已读的拾取／累计框选结果；空结果也可清除，下一次Shift追加从空集合开始，不复活旧累计身份。不清素材工具中已经确认取用的勾选、位移锚点、X／Y、筛选、其它输入或地图窗口，不撤销已保存内容，不产生GET／POST、journal或确认对话。

这是只读结果清理，装饰层锁定不会阻止清除；控制器仍要求当前有效的已读选择，忙时拒绝，失效身份／修订或未知保存状态没有可清除的旧结果。界面沿共享读取／忙状态禁用，清除后两个取用按钮及清除按钮禁用，pick／select轮廓消失。grab模式的已选锚点轮廓属于已确认素材选择，不是本动作清除对象。

复用既有入口：`selection-clear-controller.log` **106组通过**（105＋1），新增本地清除、忙时不清、锁定后可清、重复清除、原输入／已读窗口／上下文保持、零请求／确认／持久键、后续append只含新结果及空结果清理。`selection-clear-browser.log` 新Chromium **217组通过**（216＋1），产物 `.dragon-analysis/editor-workbench/run-nsF3Ao/result.json`；真实gateway／Vue配明确API夹具，核清掉结果与轮廓而已取用的页外身份、锚点、位移、窗口文字与Canvas像素、未读999及全部相关请求计数保持。不是实际后端保存或完整地图工作区证明。

Vue build/check逐byte一致（JS563561B、CSS37664B、8包许可）、shell65通过；语法／diff／链接与主动诊断见 `selection-clear-final-hashes.json`。只有控制器本地状态、组件、既有测试、文档及生成后台壳变化，无服务、web/src、规则、资源或DDL修改；不重建原生束、不重复无影响HTTPS保存／Trial／发布／规则长链。A09仍未完成。
