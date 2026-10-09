# E-04-ENTITY-INSPECTION-1：只读人物／章节来源检查

## 已接入的界面

本地游戏管理的“唯讀人物／章節來源”进入`/entities?game=...`（`web/editor-entities.html`/`src/editor/entities.js`）。仅展示来源实例，不开放普通人物编辑、历史身份归并、任免或初始化。[来源保存](editor-entity-import.md#43-e-04-entity-copy-1本地full-copy保存来源索引不是人物编辑库)仍是additive兼容DTO，不把旧128条首遇槽字典当完整人物库。

- 可选20章，按姓名／字号／来源ID／G槽搜索，鼠标或Enter/空格选行。每章128原槽：127个独立来源ID，G127明确为保留兼容记录、不分配普通将ID。姓名与ID只用`textContent`，原作者文字不转繁体。
- 同时列原章/目标章、来源显示名/当前模板名/旧字典槽名，防止被按槽混人；不声称每条是不同历史人物。完整原32B逐byte展示，G14/G15/G1B橙色标未知，保原值、不猜或补值。
- 引用仅原C+19太守、前22个物理F+01君主/F+02军师共236字段的库存。指向127仍显示保留记录；FF/其它非普通byte保留计数，不虚构G255。无此三字段引用不证明没有其它消费者、脚本别名或删除安全。
- 原header日期与当前模板日期并列（后库idx14/15原264/266、现8/10），仅暴露已发现有损解析，**不暗修资产/模板**。能力byte与具名视图差异也只报告。
- `/api/entity-inspection`在await前读取detached草稿、返回该固定修订；本页直到手动重新载入才更换，迟到响应有ticket隔离。浏览/搜索/选章不写草稿、对局、计时、RNG或存档，没有mutating入口。旧草稿/minimal缺sourceRecords明确不可用，未自动补来源ID/库。后续[历史来源选择](editor-entity-history.md)已按该副本原修订/资源身份查可信tuple，缺坏不借latest；新58轮当前环境检查通过，未宣称日期新默认已切换。
- pure `entityinspection.js#inspectEntitySources`拒身份、固定资源ref、原/目标章、来源ID、槽与完整raw分歧；坏映射只拒读，不改文件。此功能仍是无认证本地harness，不是后台权限或原子实体编辑合同。

## 当前源码实跑证据

先登记[库存/I/O](editor-local-validation.md)，显式串行，不执行verify通配；所有profile/监听/临时草稿均本次自有，无真实SAVE/IndexedDB/用户profile/DOS读写、commit/push/deploy。

- [完整新57門](../.dragon-analysis/map-migration-2/entity-inspection-machine-r1/receipt.json)：2026-10-01 22:50:00.398Z–23:13:29.834Z全部exit0，116源码/39原资源/作者2输入前后SHA同。对前111只服务、runner、管理HTML/JS四差＋5新增源；不是55历史成绩＋两散测。原5退休skip仍非通过，固定RNG仅已覆盖Web确定性，不是CPU/完整战役/全部原机制认证。
- [同轮实际UI收据](../.dragon-analysis/editor-phase/entity-inspection-machine-r1-inspection/receipt.json)：管理链接/128列表/ID搜索/键盘选择/G127/32B/3未知色格/列明引用；实际20章API与年差异，1280/1024；旧快照修订不自行更换、手动重载更新；XSS标签为文字无img；minimal/旧草稿不补、坏raw映射API拒收且文件不变、IDB0、意外console/page/外网0。[实际截图](../.dragon-analysis/editor-phase/entity-inspection-machine-r1-inspection/entity-inspection.png)。XSS/旧draft/坏raw只是owned夹具，不是修改原件或原初始化机制样本。
- pure actual20章2560原记录、236字段分组总数、G127、两年差、8精准拒收和game全文不变；测试锁定原数据/身份序列化合同，不让测试规定新公式/初始化。
- 9变更代码/HTML主动LSP：6hints（querySelector及正确await括号），5inconclusive（2超时/3push-only），0confirmed-clean；7Markdown均unavailable；session全152文件仍列既有componenttools控制码正则1W（此前intent安全检查false-positive裁决），不清缓存/禁规则。不能称全LSP clean。未为hint错误改await、不禁规则/清缓存。
- Jev只发送审阅的2113B人工英文摘要，先preview固定1.13.0后send，advisoryOnly；不发原资源/用户名/实际原数据，不作机制/测试oracle/放行门。[最终静态](../.dragon-analysis/editor-phase/entity-inspection-session-r1/static-receipt.json)核本轮116源语法/所有57日志SHA/39＋2资源/文档链接/Gitdiff与HEAD，不复用旧文档SHA。

## 下一依赖，完整任务一仍未完成

只读来源表不是完整可写GeneralDefinition或初始化器。有证字段适配须耦合正式人物/章节权威与native模板、稳定引用及已证写集；新将/空章/任免计数/脚本槽别名/扩容仍不猜补。日期纠错须独立新导入目录/精确差异受控处理。真实账号/发布/玩家多游戏和网络试运行仍依赖已请求但未提供的后台能力配置；不自动选平台或部署。[goal工作表](editor-goal-completion.md)保持active，本批未再次提交/推送。
