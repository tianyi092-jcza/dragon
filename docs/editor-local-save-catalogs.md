# 本机存档目录只读发现与独立检视（A28／N8）

## 合同与边界

依据[产品§6](game-editor-design.md#6-玩家入口存档与下架)及[需求矩阵N8](editor-requirements-matrix.md)，未知、损坏、网络失败和下架不构成清档依据；已确认更新的旧档自动清除政策不变。本批仅补独立管理入口所需的本机目录发现，不实现另一套旧档确认删除流程。

`web/src/core/gamesavecatalogs.js` 导出 `readGameSaveCatalogs`：

- 调用者必须显式提供数据库名和IndexedDB适配器；导入模块无I/O，不默认访问玩家数据库。
- 仅接受既有version1／`saves`结构；数据库不存在时中止升级事务，返回空结果，不创建持久数据库或对象仓储。未知已有结构报错，不迁移。
- 使用`openKeyCursor`枚举键，只GET规范的`game:<encodeURIComponent(gameId)>:catalog-v3`目录；不读取任何record正文，不启动网络、场景、准入或恢复。
- 完整校验目录的既有format3身份／行格式；有效目录标`summary-only`，**不代表可载入或资源有效**。损坏或值为undefined的目录标`corrupt-summary`，不把它当空目录。非规范别名及其它键只计数，原样保留，不改写或删除。
- 在同一个readonly事务完成后才交付结果；默认最多10万键、1000目录、5万摘要行，可调小不可超过上限。超预算或事务错误拒绝整个结果，不返回伪完整的部分清单。
- 不跨调用缓存目录或CAS权限。返回数据不包含存档正文；本接口不签删除、覆盖、当前版本或存档有效性证明。

## 隔离验证

`node tools/verify_game_save_store_browser.mjs catalog-discovery-r1` 使用自有loopback、全新Chromium context、随机命名数据库和两页并发，12组通过。收据：`.dragon-analysis/editor-phase/catalog-discovery-r1/receipt.json`；日志：`.dragon-analysis/editor-completion/catalog-discovery-r1.log`。

保留原存储验证：两游戏隔离、真实双页CAS竞争、旧token／ABA拒绝、请求成功后的原生事务abort回滚，以及新版保存＋旧档清理原子性。新增目录验证覆盖：不存在数据库不落盘、四个游戏的独立目录发现、百分号命名区别、坏／undefined目录、非规范别名不GET、仅目录GET／readonly模式、三种预算拒绝、非法预算在open前拒绝及所有原始键值检查前后不变。page错误／外网请求均为0。旧键与所有正文均为测试显式构造，不涉及用户存档。

语法与 `git diff --check` 通过。主动LSP：新文档确认clean，两JS为push-only未确认，验收清单只有既有SHA词典信息；session全量缓存仍有10项既有warning（其它服务／测试），未屏蔽或称全仓clean。

## 后继：独立首页入口（只读）

`playerpublic.js` 为普通首页的 `mountPublicCatalog` 注入显式 `wolong-web` 目录读取端口；`playercatalog.js` 增加“不可用存檔管理”按钮。仅用户点击后读取，不依赖远端目录成功、不读取存档正文；正式新局／读档子页（`selectionVisible:false`）不提供入口。`startApp` 只有非Trial、非正式启动分支创建 `StartMenu`，本批不增加Trial持久化端口。

对话框按gameId显示目录及槽／版本摘要，明确“尚未核对可用性”。损坏目录显示未知并保留；失败可显式重试，不显示为无存档。未知键只计数，文字使用textContent；无载入、删除、导出或关闭按钮，右键返回，不自动关闭。打开时阻止底层游戏选择；关闭或所属视图销毁后，迟到结果不能重开或写回界面。

验证：`verify_game_save_store_browser.mjs catalog-ui-r1` 15组通过（保留先前12组），全新隔离Chromium＋随机数据库，实际原生目录读取和DOM操作覆盖远端不可用仍可检查、损坏目录、HTML文字转义、阻止底层点击／选择、失败重试、右键退层、迟到回应和所有键值不变。收据 `.dragon-analysis/editor-phase/catalog-ui-r1/receipt.json`。`verify_player_catalog_browser.mjs` 21项通过，产物 `release-readiness/player-catalog-browser-NM5Ib5`（均在 `.dragon-analysis`）：真实公共wrapper挂载不碰IDB，显式点击才触发一次拒绝端口并显示未知，正式子页入口隐藏；此测试IDB是拒绝夹具，原生IDB证明来自前述15组。公告／公共入口纯检查14项通过。

重新生成本地 `server/public/trialweb.txt`，231个文件；第二次构建 `unchanged:true`，SHA `f2f814d3a327834eeaf1e12b61b7b1e2082d4978530d05c2aa7fb59b6aa31efb`。未改固定库注册身份、运行准入、规则或store写路径，未部署。没有重新跑真实Trial引擎／正式完整场景恢复；以上不是其替代证明。

本批主动LSP：两文档确认clean，四JS为push-only未确认，未将无诊断称为clean；session全量缓存74文件仍有10项既有warning。语法及diff检查通过，未屏蔽诊断。

## 后继：实际标题启动链

`node tools/verify_startmenu_local_catalog_browser.mjs catalog-title-r2` 3组通过。使用真实 `index.html → boot → App → StartMenu`、原生静态资源、全新Chromium context和自有loopback；只跳过开场演出，不替换标题、章节选择或目录读取实现。测试仅包裹真实 `_chooseChapter` 计数，仍调用原方法。普通HTTP源使正式远端reader不可用，不是生产HTTPS断网实验。

在该新context的 `wolong-web` 写入明确标为不可玩快照的测试摘要／正文和损坏目录，再经实际首页按钮检查。仪器拒绝检查期间的readwrite、正文GET及正文游标；实际只读两份目录。弹窗显示坏目录未知、点击底层“是”不进入章节、超过3秒不自动关闭；右键后全部原始键值不变，继续点击“是”确实进入内置章节选择，未启动对局或载入正文。截图和源码SHA收据：`.dragon-analysis/editor-phase/catalog-title-r2/`，日志 `editor-completion/catalog-title-r2.log`（位于 `.dragon-analysis`）。

首轮 `catalog-title-r1` 失败是测试错误地要求整个App启动零IDB访问；核读 `startApp` 发现既有内置存档仓储启动预读一次。现锁定那次version1预读，不冒充新增管理器的无版本目录扫描；此前公共wrapper自身挂载零IDB的21项证据仍成立。没有修改产品来满足错误断言，也没有宣称完整存档恢复、Trial或云准入通过。本补证语法／diff检查通过；主动LSP两文档clean、测试JS为push-only未确认，session全量缓存75文件仍有10项既有warning，未屏蔽或称全仓clean。

## 后继：未知原生结构与只读事务中止

`node tools/verify_game_save_store_browser.mjs catalog-schema-r2` 19组通过，保留此前15组。新增三个独立随机命名数据库：version2含`saves`及额外带索引仓储、version1缺少`saves`、version3无仓储。检查均返回结构未知，未创建检查事务或GET；前后版本、仓储、keyPath、索引属性、全部键及值完全一致，不迁移、不判空、不删除。测试的建库与全量比对是显式隔离夹具行为，不属于管理器读取权限。

另在原生readonly目录GET成功事件后主动abort，要求整个检查拒绝、无部分报告，所有原始数据不变；下一次显式检查成功。收据 `.dragon-analysis/editor-phase/catalog-schema-r2/receipt.json`，日志 `.dragon-analysis/editor-completion/catalog-schema-r2.log`；page错误和外网请求0。没有修改产品实现、重建bundle或操作用户数据库。本补证仍不证明完整可玩快照或场景恢复。语法及diff检查通过；主动LSP本文clean、测试JS为push-only未确认、验收清单仍只有SHA词典信息；session全量缓存75文件仍有10项既有warning，未屏蔽或称全部clean。

## 后继：当前源码复核与验收范围澄清

本轮核读 `gamesavecatalogs.js`、`playercatalog.js` 与本页既有接线记录，确认独立只读管理器已经存在，不再列为需要重建的功能。目录报告只描述本地摘要，不核远端版本、不承诺正文可玩；既有自动清旧流程与只读管理器职责分离，未知格式的人工删除／导出仍不在本项授权内。

复用原入口 `node tools/verify_game_save_store_browser.mjs catalog-current-r1`，当前源码 **19组通过**，没有修改产品或测试。新Chromium context、两页、随机专用数据库与loopback白名单，收据 `.dragon-analysis/editor-phase/catalog-current-r1/receipt.json` 固定5份入口／源码SHA，errors／forbidden为空。范围包括真实跨页CAS、ABA拒绝、写请求成功后事务abort回滚、新版保存与旧槽清理同事务，以及目录只读检视、未知结构／损坏目录保留、预算拒绝、错误重试、右键返回和关闭后的迟到结果拒绝。检查阶段禁止正文GET、正文游标和写事务；前置存储测试的正文读写／删除只作用于显式隔离夹具，不冒整条入口零写入。

该轮没有实际App、完整可玩snapshot、正式版本核验或用户数据库，不把19组局部回归当成A28完整恢复／备份／版本清理证书。实际标题启动链仍引用上节历史收据，本轮未重跑或沿用其旧SHA作为新成绩。A28仍为部分完成；审计表补齐已交付只读入口及其维护源，工程合同§8.2把底层批次的「左确认／取消、尚未接线」限定为历史，保现行过期档自动清理政策。

本批仅调整文档，未改源码、两束、存储格式、规则或准入。主动文档诊断、链接／diff及本次收据源码核对见 `local-catalog-current-final-hashes.json`；未重复无影响编辑器、Trial、发布或完整规则长链。

## 尚未完成

未知格式的导出或人工删除没有新增产品授权，本批不实现；不把摘要可读当成正文完整、远端版本有效或允许清理。A28完整跨窗口／失败／场景恢复联合出口仍未关闭，也没有真实玩家数据库或生产部署证明。
