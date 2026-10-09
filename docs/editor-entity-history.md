# E-04-ENTITY-HISTORY-1：副本固定来源检查

**后续真实升级已完成：**[日期采纳](editor-date-adoption.md)的新47e358默认与实存旧844e归档均由同生产reader核验，旧副本8/10/来源ID保持，新副本264/266；真实API/App证明不回退latest，不以以下旧future内存tuple夹具代替升级证据。

本批是[完整任务目标](editor-goal-completion.md)的独立工程接线，不是认证/发布后台、日期正式采纳或完整人物编辑器。当前844e…游戏的39资产、作者两个输入、旧草稿/对局/存档仍未改；[日期候选](editor-date-import.md)的先前3c2…源码收据仅代表当时，因本批共享helper变更不能冒充当前工具认证。

## 问题与实现

旧只读inspection直接使用“当前”作者来源。一旦当前data/source默认切换，已保存副本固定的sourceRecords可能被错误拒收，或若未来放宽校验则暗借新原始记录。这是Web身份/生命周期问题，不是原DOS机制结论；不需要猜未知字段、初始化或合历史人物。

- `preserve_editor_entity_history.mjs`直接受信current39和完整已装作者reader校验后，将**来源修订、对应dataURL和独立SHA/长度/原章序描述符**保存成`builtinentityhistory.generated.js`深冻结元数据。原始来源DOS路径只在描述符中作文字，不打开。已存在输出必须byte同，否则明确要求受控合并/审阅，不自动覆写历史。最终[保留收据r2](../.dragon-analysis/editor-phase/entity-history-preserve-r2/receipt.json)绑定本批helper；r1旧helper收据保历史。
- 保存tuple为原844e…/dataSHA07c874…/body5f65…，历史module SHA`bcb970210aad46fa9b8eec16abc94b59ce3949bc3222f0080c4aadde2fe434fa`。它是一个验证过的作者来源记录，不是可随意上传URI的注册表或发布/认证授权。
- `entityhistory.js#resolveDraftEntitySource`纯函数在**代码可信历史＋当前tuple**中精确匹配sourceRef/sourceRecords修订、gameId、bodyURI/SHA/长度和dataSHA；混游戏/来源、篡URI、未登记及冲突tuple直接拒绝。元组内dataURL必须属于该修订固定编译目录，作者两个URI必须属于bodySHA内容目录；不接受草稿自证的路径。
- `editor_entity_source.mjs#readEntitySourceForDraft`选择成功后只读该tuple的data/manifest/body三个Web URL，先核data与manifest SHA/长度，再纯body decoder。历史缺失/坏字节**不回退latest、不补档、不修改模板或ID**。新full copy仍用`readInstalledEntitySource`当前默认，保持既有严格当前data绑定。
- 本地`GET /api/entity-inspection`await前读取detached draft，然后用匹配的descriptor/bundle检查原章/raw/ID；没有await后写回。旧/minimal无sourceRecords仍显示不可用，用户手动reload的草稿修订语义和browser ticket不变。

## 实际验证，不模拟真实升级成功

[focused](../.dragon-analysis/editor-phase/entity-history-session-r1/unit-r1.log)及本次机器轮中相同入口：

- 实际已装历史三个Web输入、真实full-copy DTO、20章原128/raw/2540来源ID/模板旧日期不变；默认与注入async reader结果同，严格三URL顺序、caller全文不变。
- 10个精确context拒收：八game/source/ref情形在**任何I/O前**拒绝，另有冲突manifest身份和非法trusted dataURL。三种资产损坏及历史body缺失四拒收，只允许对应三URL，无latest尝试。
- 未来默认tuple只在内存pure-selector夹具中加入：证明来源键而不是数组顺序/latest决定选择；**不声称未来tuple已经批准/安装，不证明真实程序更新或新版数据加载**。候选日期/当前source仍未切换，真实升级及App/date入口将由下一批实测。

## 新整轮与覆盖限制

[完整串行58门](../.dragon-analysis/map-migration-2/entity-history-machine-r1/receipt.json)：2026-10-02 00:19:38.406Z–00:43:25.470Z，全部exit0，124源码/当前39资产/作者2输入前后SHA同。旧116中仅helper/server/runner三差，新增history/creator/resolver/验证四源及前批日期四源。日期工具纳库存不意味着该58轮重新执行原窗/overlay/staging；它们各自封存focused证据单列。不是旧57＋散测拼装，原五个退休road skip不算通过，局部固定RNG不作CPU/整战役认证。

既有source inspection fresh browser仍实际覆盖管理链接、搜索/键盘/G127/raw/引用/两年差、固定修订、XSS/minimal/坏源、IDB0/console/page/外网0；其本批收据位于[同轮inspection](../.dragon-analysis/editor-phase/entity-history-machine-r1-inspection/receipt.json)。本批未改UI，但新服务接线在实际新浏览器轮中运行。

7JS主动LSP：现有正确`(await).member`一hint不误改，六push-only inconclusive、0confirmed-clean；7Markdown unavailable；session162仍3个既有warning（parser两路径sink本批不调用、控制码正则此前有意图安全检查裁决），不清缓存/禁规则或宣称全clean。Jev仅人工2379B英文工程摘要先preview审过后固定1.13.0/advisoryOnly，主风险persistence_state，不发原资源/实际数据/用户信息/凭据，不作oracle或放行。[最终静态](../.dragon-analysis/editor-phase/entity-history-session-r1/static-receipt.json)核本轮入口所有日志SHA、124源语法/当前39/作者2/深冻结history、文档链接/Gitdiff/HEAD。未再commit/push/fetch/deploy，不改全局设置、信任、规则或缓存。

该阶段下一任务为实际App/Clock与精确显示批准继承/采纳，现已由页首独立真实升级完成；历史registry只保留当前已校验旧输入，未来新增必须明确受控追加，不能把PENDING候选自动列为可信历史。人物/据点/章节可写权威、初始化/扩容与真实后台仍未完成，goal保持active。
