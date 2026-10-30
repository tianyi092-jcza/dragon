# E-08：游戏绑定备份／导入边界与正式备份界面

`web/src/core/gamesaveexchange.js#createGameSaveExchange({identity,context})`是独立工程输入边界，不是认证、正式发布识别、最新版本确认或删除许可。旧saveexchange、save-manager、v2库、共同snapshot/restore/App/Trial均不改；不把旧档重贴game/release/1.0，不自动迁移或清档。

下列核心协议及原始成绩保留其历史范围；现行正式端口和`saves.html`界面见本文后继节，不能把历史“未装UI”当作当前全量缺口。

## 实际合同

- 构造时捕获精确`gameId/releaseId/releaseOrdinal/chapterId/manifestDigest`，按v3 codec验语法；`context`固定data/content/world引用，仍须由未来受信准入adapter提供。对象自称valid、知道tuple或自洽SHA不构成权限，也不证明对应正式release存在。与真实registry/删除/版本管理无接口。
- `encode(record)`先descriptor安全的严格canonical JSON捕获完整v3record，禁止有损值/accessor；核tuple和实际content章索引→chapterId，再走原encodeSaveFile/decodeSaveFile的规则profile、RNG与实际公共detached准备。输出独立`wolong-game-save/version1` envelope，字段只有format/version/rules/bodyText/bodyDigest；SHA256覆盖canonical完整v3正文，不是签名或保密。
- `decode(text)`核64MiB UTF8文件预算、精确外层字段/完整原规则profile、canonical v3/身份/章匹配、正文SHA，之后仍走同公共恢复门。不回退旧format1；旧format1仍由原工具处理。坏/缺身份、规则、能力、RNG、SHA或无法识别的输入拒绝，拒绝没有库/当前App副作用。
- 解码只返回独立captured `{input,origin}`；input仅保存所需7字段及完整snapshot，origin冻结原slot/recordId/writeRevision供信息显示，不授予本地写权。另存由调用者**显式**使用绑定游戏的store及目标槽/CAS；接收store重新生成本地recordId/counter，不继承外来41号写修订。此模块没有IDB、fetch、当前release查找、安装live、delete、迁移或UI。
- 公共准备可能加载本context的固定世界能力/资源缓存，不推进规则/RNG/Clock，不等于对任何章或任意战役可恢复。文件含完整私人存档正文；不发Jev、网络、日志或自动上传。这里未实现文件选择／下载／取消及游戏选择绑定仓储的玩家UI。

## 当前真实成绩与限制

先[I/O登记](editor-local-validation.md#e-08-game-save-exchange-1opt-in备份身份先审io)，新纯门`tools/verify_game_save_exchange.mjs`及只读`tools/gamesavefixture.mjs`使用current八个固定Web输入/四native URL内存映射、真实20章fresh0tick snapshot，own mock两个仓储；global nativeIDB getter拒0、accessor getter0。

- 每章完整snapshot→source仓储revision41→encode/decode→接收仓储新ID/revision1，全文相等；各source记录、接收库其它game同slot与old-v2/slots夹具保留。100个自洽SHA的坏native能力/RNG/错章输入拒绝；20次重复另存明确CAS冲突；其它tuple/外层/SHA/profile/legacy/unsafe字段/64MiB UTF8/有损值/getter/cycle及await前捕获共**148拒收**，原记录/目录/live/Clock/RNG不变，delete0。工程releaseId不是发布认证。
- 白名单env `game-save-exchange-session-r1/run-focused-r1.mjs`实际八项串行exit0：新exchange、真实snapshot20/80、仓储memory7/59、原仓储fresh Chromium两页六组及四旧repository/local-save/transition/Trial门。**浏览器只重验既有store，不是新exchange/UI浏览器接线证书**。
- 新库存79入口/182声明源（171Node/7Python/4HTML），不是新79全轮。旧177仅runner登记两处插入；176旧声明源及82 current/archive Web资产同SHA，旧saveexchange/ruleprofile补计输入但正文不改。新测试初写非async回调内await被syntax检查拒，修回调并包fixture解析异常后才运行；原exact副本及syntax失败日志保留，失败不算通过。
- final同session `static-receipt-r1.json`关联当前语法/八实际日志/收据/输入/旧差异/HEAD/链接/诊断；Jev只人工工程摘要preview后fixed1.13/advisory，不发数据/正文/完整日志，不作为放行或原证。LSP不可用/静默不当clean，正确await括号不改。

[完整工作表](editor-goal-completion.md)与[差距索引](editor-requirements-matrix.md)仍开放：受信发布/current、实际游戏选择仓储和备份UI、中途完整运行态/全部消费者。旧Q11/Q19逐档确认删除已撤销，遵循工程合同§8.2的确认更新后自动清理／新版保存原子清旧政策。底层文件自洽不绕共同准入，也不能绕已删除/下架/版本策略。

## 后继正式存档适配器的备份端口

`web/src/player/playersaves.js#createPlayerSaveStore`新增`exportBackup(slot)`／`importBackup(text, slot)`，不另建库、身份推导或恢复引擎。上面的纯codec合同保持；正式端口由既有受信environment提供同一身份、content/world及assertCurrent，不能由文件自称的身份构造准入。

- 导出捕获所选正文，核正式played／固定章节边界、全部备份语义与身份；存储读取、异步预检后复查会话才返回文本。空槽拒绝。不写库、不上传，也不安装App。
- 导入先按绑定身份完整解码，资源等待后重核会话，再调用同一个正式put。目标槽必须显式给定，仅用空槽CAS；文件中的源槽、recordId、writeRevision不构成本机覆盖权限。仍由现有同事务保存策略处理版本及生成本地ID／计数，不引入独立写入策略。
- 分派事务前退休则拒绝；事务已提交后仍返回真实committed收据，不把迟到退休伪报成未写。未来界面还须处理自身取消／迟到展示、当前准入、文件选择／下载和目标槽，不因此认定备份UI完成。

验证：既有`verify_player_saves.mjs`36组通过，新增备份另存、占槽／坏文件／坏槽／空槽拒绝、事务abort保持、导入／导出资源等待中退休拒绝及已分派导入提交收据；原有保存／恢复／CAS门仍覆盖。使用自有IDB mock、固定Web输入、无真实存档或网络。`verify_player_repository.mjs`完整入口35组通过，复验见同目录repository.log。

`verify_formal_app_browser.mjs`既有程序化导入段改调用实际新端口，完整31组通过；大序号9007199254740993、原档／另一游戏／live保持、占槽拒绝及导入槽新页面恢复再保存均保留。新隔离Chromium/nativeIDB，pack为明确当前Web可信夹具，不冒签名远端准入或文件UI。收据 `.dragon-analysis/release-readiness/formal-app-browser-CUhlH7/result.json`；日志、246项选定输入前后SHA及仓储复验独立指纹在 `.dragon-analysis/editor-completion/formal-backup-adapter-20261029/`。

三份JS/MJS语法通过。原生程序束重建两次一致（第二次unchanged），两壳SHA保持；代码主动LSP均push-only未确认，不记clean。未提交、推送或部署；A28与完整目标仍部分。

## 后继独立页面的正式备份界面

`saves.html`现分别展示内置与正式自建备份。`tools/savemanager.js`装配同源reader／固定程序static reader／game隔离原生IDB；`tools/formalbackup.js`只持有备份界面，不启动App、不接触Trial或内置仓储。内置控件禁用范围收窄到本section，不干扰正式面板。非HTTPS环境只提示正式备份不可用，不阻断内置导入导出。

用户显式更新上架游戏、选择游戏并读取章节，再读本机摘要或选择JSON。摘要只允许所选当前版本／章节／manifest的槽显示导出入口，其余保留且不推断可恢复。每次导入／导出都重新准入选定章、装配现有pack并核当前上架release／ordinal，再使用既有playersaves备份端口；资源随操作释放，不保留长期写权。导出完整校验后下载JSON；导入固定绑定身份、64MiB预算、显式另存为目录下一新槽，仍以空槽CAS拒绝并发占用，不复用文件recordId／计数、不重试覆盖。成功显示真实提交槽；不会启动或热换对局。

选择变化清掉旧章列表／文件；操作中禁用本面板控件。pagehide关闭所属资源、阻止迟到UI／下载及未分派写；已分派IDB提交不假称回滚。已确认新版导入仍沿原正式保存事务清理同游戏旧档，界面明确说明，不能把“另存新槽”理解成另加保留旧版政策。备份文件正文仅本地读取，不上传。

验证使用既有恢复浏览器入口，在真实文件输入／下载、完整pack预检与原生IDB上新增五组：下载不改原档；导入新ID／槽4且原档保持；坏文件拒绝；版本变更后拒绝；待准入返回时关闭界面，迟到session关闭且存档不变。普通完整26组、大序号27组均通过，分别见 `.dragon-analysis/release-readiness/player-restore-browser-s9cfbq/`、`player-restore-browser-2lZA0h/`，errors／failed／forbidden为空。reader是明确受控端口，实际模块挂载于隔离测试页，不冒`saves.html`真实HTTPS／签名服务联合验证。

既有`verify_expansion_browser.mjs`完整通过，覆盖实际`saves.html`内置导出／导入、原编辑工具及48个渲染比较；不冒正式HTTPS链。244项选定源码／入口／输入SHA前后保持，日志和指纹见 `.dragon-analysis/editor-completion/formal-backup-ui-20261029/`。程序束两次重建一致，237条逐源字节／长度／SHA检查，两壳保持。四JS/MJS语法通过；五份代码／HTML主动LSP未确认（四push-only、一超时），不能记clean。此次编辑曾一次精确替换因两个相同匹配部分应用，随后只补未应用两点，未覆盖既有修改。

此界面批次当时剩余：真实服务注册目录→完整准入→此页面的联合验证、页面关闭与已提交导入收据及跨页竞争的更完整组合。前者的进程内运输后继见下节，真实TCP/TLS仍未验证。本界面不开放历史版本准入。整个A28仍部分，不能据文件UI已接认定完整编辑器完成。

## 后继准入返回期间换版的导入导出拒收

复用现有恢复浏览器入口的等待端口，在旧版本session已经捕获、尚未返回给备份页时改变reader当前releaseId／ordinal，然后释放原session。分别执行导出与有效JSON导入：旧身份可以完成自身pack准备，但`formalbackup.bound()`已有的末次status核对拒绝继续；不新增远端轮询、写门或产品逻辑。

两案都断言错误提示后控件解锁、全部所属session关闭、零下载事件、原存档正文／token及目录全文保持、新槽4不存在；从操作开始至拒绝的原生IDB打开次数不增，证明拒绝在本地正文读取／新槽分派之前。没有把已提交写入说成回滚。这里模拟的是准入返回期间换版，不是每个资源请求或最终status之后的所有竞态，也不认证远端与本地IDB的跨系统原子事务。

`verify_player_restore_browser.mjs`完整普通 **28组**／大序号 **29组**通过，保留9007199254740993、旧档清理及跨页CAS等既有范围。新隔离Chromium、原生自有IDB、真实备份控件与完整当前Web快照，reader身份／换版及等待时机为明确夹具，无正式profile／SAVE／外网。结果分别在 `.dragon-analysis/release-readiness/player-restore-browser-bsCg7e/` 与 `player-restore-browser-Fxgmro/`，错误／失败／域外数组为空。431项选定输入SHA前后同，日志和指纹见 `.dragon-analysis/editor-completion/backup-late-release-20261029/`。

本批仅扩既有测试，不改产品或程序束；语法通过，不重复发布服务整链。完整备份失败／跨窗组合及A28仍开放。

## 后继非首势力备份与恢复身份

既有正式App夹具新增显式`alternate-faction`测试参数，使用同一完整章的第二个有效势力启动并真实保存；不手改存档的player_faction来伪造对局。既有恢复浏览器入口新增`--alternate-faction`，可与`--large-ordinal`组合；默认仍选择首势力。备份模块的准备环境仍按现行实现使用章首势力，不改产品。

从实际App保存的势力1快照导出JSON，经文件输入另存槽4，再走真实读档选择器与captured repository预检：恢复环境player及返回快照player_faction都保持1，不回退首势力0。导入快照全文除目标slot外与原档相同、记录ID独立，选择恢复后原槽0及新槽4的完整正文／token保持；原首槽读档也明确核对保存势力。选择器移交后本测试释放session／pack，不把此步骤称为新页面App冷启动。

`node tools/verify_player_restore_browser.mjs`普通 **29组**，加`--alternate-faction --large-ordinal` **30组**通过；后者保持精确序号9007199254740993。收据分别在 `.dragon-analysis/release-readiness/player-restore-browser-Dv95nq/`、`player-restore-browser-Tmgdqk/`，记录`factionIdentity`与`importedPlayer`，errors／failed／forbidden均空。431项选定输入SHA前后相同，日志及指纹见 `.dragon-analysis/editor-completion/backup-player-identity-20261029/`。

仅扩既有测试／可信包夹具，真实隔离Chromium、原生自有IDB、完整快照、备份控件与恢复门；reader仍受控，不冒正式签名／TCP/TLS或所有势力覆盖。未改规则、正式备份代码、程序束或用户存档。两测试语法通过，完整A28及编辑器目标仍未完成。

## 后继非首势力导入槽的新页面App恢复

复用 `verify_formal_app_browser.mjs` 的完整入口，新增 `--alternate-faction`，只将大序号游戏阶段选择为同章第二势力；普通游戏与默认入口保持原选择。实际App从势力1开始，保存、通过正式存档适配器导出／导入到槽12，再导航到新文档／新Realm，以该槽启动真实App。这里复用既有受控pack与环境，不手改snapshot的玩家字段；不同于上一节止于选择器移交的检查。

新增断言核开局环境／live玩家不是首势力0；恢复后环境、live scenario、导入正文及再次保存正文均为1。原有精确序号9007199254740993、RNG恢复、槽12原recordId保持／writeRevision从3到4、源槽0和另一游戏完整正文与目录不变继续通过。默认模式同样验证四处玩家字段均为0。

两个完整命令均 **32组**通过：`node tools/verify_formal_app_browser.mjs --alternate-faction` 的收据在 `.dragon-analysis/release-readiness/formal-app-browser-Tz3jtd/result.json`；默认入口在 `formal-app-browser-SO1Xzy/result.json`。两份errors／failed／forbidden均空；247项选定输入SHA前后相同，日志与指纹见 `.dragon-analysis/editor-completion/backup-alternate-cold-start-20261029/`。仅测试改变，无产品／程序束／存档格式变动；所有IDB仅在全新profile的自有数据库。

本批是程序化备份端口与实际App／原生IDB的冷启动链，不是文件选择器、真实标题点击、签名reader或所有势力的联合验收；不把前批独立页面／服务成绩拼成新的全链证明。语法和diff检查通过；主动LSP测试脚本为push-only未确认，两文档一clean／一仅三条既有词典hint；mode=all另有一条原测试await括号提示，不能去掉必要括号或把缓存当clean。A28仍保留完整失败与跨窗口组合缺口。

## 后继正式备份页与真实发布服务联合

复用`verify_publication_chain_browser.mjs --node-service --player-client --player-app --public-player`完整入口，不另造签名或目录夹具。实际作者登录、20章编译、SQL及自有workerd R2发布／上架后，原生公开入口启动App并保存slot0；同一全新浏览器context另开未经替换的`saves.html`，实际reader读取目录和20章预览，以选定章重新准入、读取完整pack，点击原生下载及文件选择／导入按钮。导入slot4拥有独立recordId、完整snapshot除slot外与原档一致；slot0全文／token及live App装配元数据保持，备份页没有App实例。随后既有更新、下架、删除栅栏及重启分发断言继续通过。

首轮暴露打包测试入口的缺口：只靠git ls-files加旧手列player模块，遗漏已有未提交依赖`src/core/gamesavecatalogs.js`，在实际首页取模块时失败，尚未到备份UI。只修测试包装器：启用includePlayerModules时使用已构建trialweb程序清单补齐src JS，逐项验证当前字节／长度／SHA／文本及安全相对路径；不是放宽静态manifest或允许浏览器任意读本地文件，也不要求为了测试提交代码。默认不启用该模式的其它调用不变。非法清单直接失败，parse错误附cause不吞错。

最终r2完整入口通过：主链10项、公开App10项、20章／5代分发，自有R2域外请求0。结果 `.dragon-analysis/release-readiness/publication-chain-browser-tCKcZp/result.json`；首轮失败及r2日志、1055项选定源码／束／输入前后相同的指纹见 `.dragon-analysis/editor-completion/formal-backup-public-chain-20261029/`。所有真实App和备份数据只在fresh context的隔离原生IDB，文件正文在浏览器下载和测试内存间往返，无用户profile或正式SAVE.DAT。两测试语法通过，主动LSP两份push-only未确认。

**后继：备份页损坏导入拒收。** 同一完整入口在成功导入slot4之后，追加两例损坏导入负控：截半字节（decode失败）与有效信封但异gameId（显式身份／准入拒收）。两者状态均报“操作未完成”，目录slot集合不变、`get(5)`为空、slot4快照与recordId保持、slot0全文／token及live App装配元数据保持，备份页仍无App实例。只在`public-player-browser.mjs`夹具内新增断言，无产品或程序束改动；结果 `.dragon-analysis/release-readiness/publication-chain-browser-869N1n/result.json`（公开App12项，含新增拒收断言）。这只闭合导入事务失败路径，跨窗口恢复矩阵与原生TCP/TLS仍未证明，A28仍部分。

**同批附带：专长采纳后的默认元组跟进。** 新默认28805／source19ef／entities-7e7fad落地后，三处测试包装器出现回归，已按批准范围修复（只改测试，不碰产品、pinned与部署）：`editor_trusted_copy.mjs`的Web默认门显式重注册新元组（world manifest sha/len、entity三元组、provenance registryId同步新命名）；`editor_stage_source.mjs`不再经Web默认门预热，改为直接读pinned字节并逐role验sha（server pinned保持47e不变）；`publish-runtime-stage.mjs`在git tracked之外，对当前默认两目录补未跟踪豁免文件（copy→dist→serve全链sha已验，game-source.json仍排除）。专长采纳本身不在此条验收，见专长合同与台账§34。

这批闭合**实际服务签名／reader与实际备份页**的联合链，而运输仍为Playwright进程内bridge（HTTPS URL不是原生TCP/TLS成功）。完整副本bootstrap不冒中立创建；管理员操作走真实鉴权Request而非管理UI；生产、物理删除、备份页面全部失败／跨窗组合仍未证明。没有产品或程序束改动，A28仍部分。

**后继：页面导入槽的实际标题恢复。** 同一完整发布入口在既有slot0恢复之后，再通过App退出至标题阶段的读档导航，点击刚由`saves.html`导入的slot4，经实际签名reader重新准入并装配新App。核loadedSaveSlot=4、装配元数据与原对局一致、完整RNG以既有saveJSON规范比较一致；导入记录／token全文及原slot0均保持。并继续运行后续版本更新、下架、栅栏和重启断言。主链10项／公开App11项通过，结果 `.dragon-analysis/release-readiness/publication-chain-browser-Skw09a/result.json`；1055项选定输入SHA前后相同，日志／指纹在 `.dragon-analysis/editor-completion/formal-backup-public-restore-20261029/`。语法通过，主动LSP仍push-only未确认。仅新增既有测试断言；这次闭合的是真实服务、备份页面和标题恢复的进程内运输链，不是原生TCP/TLS、全部失败矩阵或完整游戏通关。
