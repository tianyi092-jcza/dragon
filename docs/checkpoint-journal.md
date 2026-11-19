# 检查点日志（checkpoint journal）

> 长期事实、架构、命令与约定维护在 [AGENTS.md](../AGENTS.md)；本页只保留近期交接、实际修改、调试失败、验证边界和下一步，不构成实施／提交／部署授权。
> 历史：[§73–194快照](checkpoint-journal-archive-73-194.md)、[§72及以前](checkpoint-journal-archive-through-72.md)、[更早收据缺口](historical-receipts.md)。历史待办与运行状态不自动延续；机制结论须回到SKILL／re-notes原证。

## 当前主线与状态

| 工作线 | 当前交接 |
| --- | --- |
| 游戏章节 | CHAPTER-WB P0–P7本地实现及隔离验收已完成，后续五Tab、复制去重和行编辑调整见§200–208。现行规则以[章节合同§0](chapter-and-base-resources.md#0-chapter-wb-现行产品口径与字段盘点)为准，逐项证据见[审计](chapter-workbench-audit.md)。不再把§199中途缺口当待办。 |
| copy收敛 | 共享数据、章节、武将、地图、审核已接copy；删除仅留上架审核。定义面板余项、旧draft及表清理按[收敛任务](copy-simplification-tasks.md)另行确定范围。 |
| 地图／扩容／事件 | 最近地图工作见§194、197–198；193城发布链已有本地证据，运行支持v2-192/v3-512，内置与生产准入仍192。现行范围见[CITY计划](city-capacity-expansion-plan.md)、[地图合同](map-atomic-catalog-contract.md#26-地图交互收尾选位背景与锁图对象操作)、[D2计划§12](d2-event-scheduler-plan.md)。 |
| 本地成果／生产 | 用户已授权审查全部改动、创建完整提交并推送GitHub，执行记录见§210，最终提交/远端状态以Git记录为准；未授权部署。保留既有用户修改，未迁移内置源、已有copy或正式包。旧Git跟踪引用/PID不能代表当前远端或服务状态，操作前重核。 |

### 当前阻塞、支持限制与下一步

- **登记边界仍未解决**：默认`verify_pinned_source_registration.mjs`因available-library消费者指纹失败；已对照旧pin与HEAD，差异来自本轮纪元相关`main.js/gamebar.js/hud.js`，不是无关旧失败。未改旧身份或放宽检查。`--source-only`五项通过仅证明源注册，不证明库登记；部署前须按授权处理程序／库身份及完整归档验收。
- **诊断不是全绿**：宿主LSP多次inconclusive、TXT unsupported及缓存pending/复杂度warning，不能记clean；独立Vue LS 33 SFC实际通过另列。后续按变更重验，不将历史构建/分项通过代替全链。
- **支持边界**：复杂退役关系具体拒绝；已分配22槽不复用；首都及计数原生byte写限制仍在。512城读模型通过不代表大于255首都已能写。App跨纪元证明月界/存读档续计，不声称模拟此前整月所有事件分支或生产签名reader验收。
- **用户现场待确认**：此前章节页“未载入副本”缺少明确修复／复测证据；不能把它当零章，也不能把未证实的401原因与复制422混同。若仍复现，先核所选游戏、加载请求与服务字节，再定点诊断。用户已确认上架成功，不重开此前“审核无反应”问题。
- **开发实例交接**：用户指定`https://127.0.0.1:8443/`和`.dragon-analysis/basemaps-dev-store`。曾误启默认空库导致游戏看似消失；只读核原库数据仍在，按用户要求切回，未删除/下架游戏。后续不得默认换库或重建库；测试另用独占目录。最后实现轮已核shell/draft字节一致，本次文档整理未重查服务，不固定PID、不停他人实例。
- **下一步范围**：本轮按用户授权审查并提交／推送；现场复测、copy余项、库身份更新、部署及真实数据操作仍须另行授权，不重开已完成章节goal。

## 210. 完整提交前审查与验证

- 用户明确授权保留产品、测试、转换及必要文档，排除本地代理／运行产物，创建一个完整提交并推送。核对60个已修改文件及20个未跟踪文件；新文件均为章节产品模块、隔离验证工具／夹具及计划／审计文档。`.pi/`、`.codegraph/`、`.dragon-analysis/`、`.dragon-runtime/`、依赖目录、截图、日志和本地数据库保持忽略，不强制加入、不删除。UI预构建壳、licenses、Trial束及章节基座是产品所需生成物，保留提交。
- **审查修复**：`verify_system_base_map_instantiation.mjs`仍期待旧回执，实际运行因缺`duplicates: []`失败；更新为现行完整回执后11组检查通过，不放宽对象比较或产品门。
- **本轮实跑**：章节命令／转换／独立可信源三入口串行46/46（710876ms）；控制器、复制回执、纪元、开局、天气、外交、武将去向、胜负门11入口串行115/115（10114ms）。转换运行子项仍为17章／34次fresh与JSON恢复，完整20章转换有独立断言，不混称20章全部App验证。另player章节47、runtime合同106、发布triplets6检查通过。
- **界面与生成物**：`node editor-ui/build.mjs --check`核壳JS1275063B/CSS153744B/licenses12一致；`node tools/build_chapter_base.mjs --check`23818B一致；`npm run --prefix editor-ui/lsp check`33 SFC通过。全新profile的章节五Tab和武将库两个browser入口通过（前者仅两次预期422，无其它错误）。Trial重建为unchanged，261files、SHA470ad89ca0057bfb26a1d51adfdea2f59482e43390181b0209706badec1e4dc2。80候选文件的UTF-8、适用JS/MJS/TXT/Python语法及Trial JSON、常见私钥/token模式与diff检查通过；LF/CRLF提示未批改。
- **仍不通过／未确认**：默认`verify_pinned_source_registration.mjs`本轮再次在available-library消费者指纹报错，checks/calls为空，未改pin或绕过。主动LSP12路径为11inconclusive＋1TXTunsupported，缓存仍未确认，独立Vue结果单列。没有重跑HTTPS正式App/跨纪元全链或全部历史lane；此前隔离通过范围见§199、202，不改写为本轮执行。未访问用户存档或操作用户开发实例。
- 推送前fetch核`HEAD...github/main`为3/0：已有三个本地提交领先，无远端分叉；本次只新建一个提交，快进推送同时携带前三个提交，不force、不改历史。后续远端若变化须重新核对，不以该快照替代实际push结果。

## 209. 本轮project memory与journal整理

- 仅整理`AGENTS.md`与本页，不改产品、测试或生成物。将章节五Tab、独立身份/开局/纪元、单位边界及显式开发库选择等长期事实归入memory，并链接专项合同，不复制详细实现过程。
- 删除过时远端追踪/PID、中间构建SHA/尺寸、重复“进行中”与已关闭待办；§199改为阶段产物、关键故障和分层验证索引。§201的“不同君主仍拒绝”已被§202取代，不再作为现行规则；早期17/18章测试保留历史边界，不伪称当时测了20章。
- 保留近期用户决定、未解决登记/诊断限制、现场未载入问题、相关文件、命令和已有证据定位；保留旧标题与兼容锚点。
- **本轮文档验证**：两文件70个出站链接、全仓及父AGENTS/SKILL中80个journal引用检查通过；diff检查通过，仅既有LF/CRLF提示。其它已跟踪文件的改动摘要前后相同。journal由约126KB压至约26KB，memory保持约143行；未重跑游戏、浏览器、构建或LSP，不把历史成绩写成此次执行。

## 208. 武将所属并入本行编辑保存

- `ChaptersPanel.vue`所属读态纯文字，编辑态才出现下拉，与登场/月数/投奔一次保存；取消零POST，删独立`setGeneralFaction`调用。绑定主表人物沿`general-settings`；旧未关联人物由`draft.txt`将`general-arrival`＋确有变化的`general-faction`置于同一chapters事务。任职禁改、未知原槽当前项及dirty守卫保留，后端规则不变。
- **调试**：旧弹层动画造成同名option双匹配，改按控件`aria-controls`定位；旧“所属仍null”断言与显式改属0冲突，按操作校正而不放宽产品。保存后重读旧draft曾因TXT未随watch刷新；核owned实例后仅触本会话源码mtime，文件SHA不变，再GET核字节一致，没有切库或写用户游戏。
- **验证**：`node --test tools/verify_copy_controller_chapters.mjs tools/verify_copy_controller_posts.mjs`31/31；`node --test --test-name-pattern='ordinary affiliation' tools/verify_copy_chapter_ops.mjs`1/1（总39577ms），含组合成功及第二命令失败整批回滚。`verify_chapter_workbench_browser.mjs`freshprofile完整五Tab通过，含选择零请求、取消原槽17不变、四项单请求/精确双命令/重读；仅两次预期422，其余错误0。build→check、独立Vue LS33 SFC、语法/diff通过；宿主未确认诊断不记clean。

## 207. 已知势力名称去掉内部编号后缀

用户要求已解析所属只显示“董卓”，不带“原槽17”。未知仍留未匹配数字提示，不改真实关系。浏览器证明查看零POST、当前项不可新选；初次误计隐藏/动画中的选项，改为定位实际可见选项后完整lane通过，不用force或点击重试。

## 206. 所属名称解析、首都本属候选与武将列宽

- 只读核用户指定库：郭汜属17，公开声明0..15中董卓为6，而原生17记录`80371e33`的君主55也为董卓。`draft.txt`仅在完整raw/活动/正常君主号成立时投影名称，不将17映射6、不追加势力；已知名显示按§207收尾。坏raw/不活动/G127不猜名。
- 换都下拉仅本章本属城，创建君主＋首都合同不变。空所属显示“無”；被俘标题单行、倒计时保足够宽度。1024宽首次超14px，调列宽后1920/1440/1024读编辑态无溢出；控制器31/31及freshprofile完整lane通过，含首都192选择/重读/锁定。512只证明读取。

## 205. 首都只读标识与城兵显示单位（用户明确要求）

`ChaptersPanel.vue`据点首都列仅✓/空，换都保留在势力页。章节城兵显示/编辑实际人数，非十倍数拒绝，保存只除10一次；`StrongholdPanel.vue`游戏级标题“城兵*10”，原数值协议不改。原证沿实体字典C12/C13及7E94。

freshprofile验证118→1180、上限2550、1181拒绝零POST、1190仅发送119再恢复118；取消不写。初次旧固定POST计数被新增保存打破，改取操作前基线后完整通过。build/check、独立Vue LS、语法/diff通过；未改运行规则或重建Trial。

## 204. 章节页面五项布局收尾（用户明确要求）

`ChaptersPanel.vue`/`Workbench.vue`将校验及操作提示统一到工作台状态栏；势力按钮单排、读态行紧凑而默认控件尺寸不变。武将/据点流式列宽，隐藏身份职务/内政官列但保数据与守卫；外交60/70px，大矩阵只表内滚。freshprofile验证1920/1440/1024读编辑态不溢出、控件不越格、唯一状态栏/预期422/随后保存恢复；build/check与独立Vue LS通过。

## 203. 新增章节紧凑表单（用户授权布局选择）

`ChaptersPanel.vue`/`theme.css`将编号名称、日期分组，保存取消并排；仅布局宽度间距，不改默认EP皮肤或业务。freshprofile覆盖1440/1024和保存重读，通过build/check及独立Vue LS。此前审核诊断保留取消零POST/确认单POST重读回归，未改审核业务或代用户批准；用户确认上架成功。

## 202. 不同君主共首都也保首丢后（用户明确批准）

- 在§201基础上，同章不同君主共首都也按源顺序保首丢后，只在新复制detached数据上退役后者；不splice、不合钱兵、不删主表或改原件。不存在首都/复杂关系仍具体拒绝。`chapterConversion.duplicates`记录共都原因/城市，回执及只读弹窗展示；保留者首都归己，C1A不变。
- 原20章现在成功，四条丢弃为上1两组同君主后项、中2刘宁（保孙策）、下3郭攸之（保刘备）；这是固定输入收据，不是硬编码规则。独立测试源也改为20章，独立身份/SHA门保留，原pin不变。
- **验证**：转换/回执/独立源18/18（60661ms）；默认真实HTTPS原20章复制1/1（总258170ms，owned目录`dragon-chapter-http-mSyNIw`）；`CHAPTER_WB_COPY=1 CHAPTER_WB_FORMAL=1 node --test tools/verify_chapter_workbench_http.mjs`1/1（总329490ms，`dragon-chapter-http-Q8edb1`），检验/提交/审批/正式加载通过，未开BROWSER/APP/ERA。回执6/6、freshprofile可见明细及build/check/独立Vue LS通过。
- 首次只读探针对冻结capture直接退役被readonly拒绝，未改原对象；正式转换始终clone，测试核原件/主表与保留者钱兵不变。该轮未修章节未载入问题。

## 201. 同章重复势力保留首次（用户截图后续决定）

首轮按同君主身份去重：关联generalId优先，否则原君主槽；只新副本丢后、不跨章或凭同名合并，保固定槽/资源隔离并写可见回执。转换9/9、回执/独立源8/8，独立18章COPY+FORMAL通过（owned目录`dragon-chapter-http-o6Zxza`）。当时不同君主共都仍拒绝；这一限制已被§202明确批准的后继规则取代，不再等待重复审批，不把当时18章成绩改写成20章。

## 200. 删除管理入口清退与复制失败可诊断性（用户后续请求）

- `client.txt`、Workbench/main桥接撤独立删除模块，删除仅留上架审核；ReviewPanel/review控制器和服务端权限/栅栏不改，未执行游戏删除。浏览器验证入口消失、审核入口保留。
- 复制422当时来自登记源共首都，非名称占用。`admincopy.js`及复制控制器让失败持久回执/原键查询保留章名、君主、城市和原序号，不再误导改名重试；旧仅code回执有fallback，不重写历史行。真实HTTP1/1核detail重读和源/模板/其它游戏不变，回执控制器4/4；该轮不是成功copy证据，后继处理已见§201–202。
- 调试曾误以`editor.sqlite`读取隔离产物而失败，按实际`authority.sqlite`只读重查，未创建新库。本地空库误切及章节未载入问题按页首交接，不与此422混为同一故障。

<a id="199-chapter-wbp0p7本地实施与隔离验收收口中"></a>
## 199. CHAPTER-WB：P0–P7本地实施与隔离验收（本地完成）

原任务仅授权本地实现/隔离验证，逐项审计后goal已完成；后继产品决定见§200–208。详细需求映射在[chapter-workbench-audit.md](chapter-workbench-audit.md)，实施计划在[chapter-workbench-plan.md](chapter-workbench-plan.md)。不把已关闭中途缺口、临时拒绝门或旧副本兼容支路当现行规则。

### 阶段产物与相关文件

| 阶段 | 实际成果／定位 |
| --- | --- |
| P0 | `audit_chapter_workbench.py`只读五套SINARIO；`.dragon-analysis/chapter-wb-p0-01/baseline.json`保存输入/工具/解析器SHA、20章/466名/8处错属/3章共都。下库末章原事件尾1022B，不补齐；固定Web源20章后续成功不证明DOS短尾被修补。 |
| P1 | `gamesource.js`、`gamecopy.js`实现稳定章ID、标签唯一、独立增删复制；读取/校验/写入/废票同事务，末步故障无前缀。零章可存但发布拒绝；章节引用报告消费真实`problems`。 |
| P2 | 章内创建/换君主/军师/首都/所属与双raw、计数联动；`copygenerals.js`按稳定主表ID配置本章普通槽。`retireChapterFaction`保固定槽、隔离他章与主表，复杂关系具体拒绝；详细写集/原证见[去向笔记](re-notes-legion-fate.md)。 |
| P3 | `chapteropening.js`、`chapterresources.js`负责人数一次换算；`world.js`fresh选方案，clock/savegame/main及玩家元资料保纪元，restore不重套。原输入域证据见[财政笔记](re-notes-ai-fiscal.md)。 |
| P4 | `copychapters.js`新副本转换与回执；`build_chapter_base.mjs`从固定原证生成空白章政策、22槽、天气、完整空事件页与批准外交模板。旧缺字节源不在GET/restore补造。转换规则以§202为最新。 |
| P5 | `ChaptersPanel.vue`＋`draft.txt`五Tab、主表投影、分页/脏保护/迟到响应守卫；`chapterdiplomacy.js`单向单格命令。旧DraftPanel章节/任官/原单位资源表单清退，游戏管理只留游戏资料。 |
| P6–P7 | `verify_chapter_workbench_http.mjs`与`fixtures/chapter-{editor-http,published-choice}-browser.mjs`分层验证真实鉴权/SQLite/桶、正式包、玩家实选及App/IDB；`chapter_idb_transport.mjs`提供独占IDB运输。审计补回执消费者和实际日期显示接缝。 |

### 关键调试、失败与修复

- **零章门误伤地图模板**：最初放通用严格编译器导致系统模板失败；移至copy发布`CHAPTER_EMPTY`，地图实例化回归通过。
- **删除数组不等于解散**：旧splice破坏dense native槽，末项删除仍残留活动记录；先拒绝现行坏写入，再实现固定槽退役、关系守卫及首中末编译/fresh/JSON恢复。不能只靠列表少一行断言成功。
- **新空章并非可玩**：首次创建沿用整张模板使2势力实际有16个活动槽；负控定位后创建边界先清已知槽字段。发布探针又揭外交/事件/天气缺口；原窗复核及用户批准模板后补齐，最终以普通新建API-only正式App链闭合，不从测试需要猜字节。
- **发布接缝**：普通模板profile被`PublishedPacks.#visuals`误拒；只纳入已批准来源模式，registry/definition/资产SHA负控仍拒。资源writer原只接受完整复制，补普通模板边界；正式章名正文丢失导致浏览器超时，改在异步准备前捕获作者标签，源及旧包不改。
- **回执扩展漏消费者**：新增`chapterConversion`触发`COPY_RECEIPT_CORRUPT`，后审计又发现`deletioncopyorigins`四字段假设。只分离可选展示数据，保四身份精确匹配、未知字段/来源/8192B门；新增负控与旧回执兼容，不冒称物理删除全链重跑。
- **任官派生值**：清军师后旧显示`n_generals`仍7而F18为8；负控后用现行copy专用writer刷新兼容视图，冻结replay与真实F18不改。
- **界面状态**：422后曾仍显示旧“保存成功”；区分保存未确认与写后重读失败，不谎称回滚、不自动重送。首次读/缺行/ensure/保存/重读×成功失败的迟到矩阵阻止旧会话写提示或追加请求。旧无方案预览trust73与fresh255不符，修只读预览，不回写旧数据。
- **测试本身的失败**：组合重测试超时不记总通过，拆分重跑单列；App静态白名单漏素材、ElSelect隐藏输入定位、HUD 10Hz尚未更新分别修夹具/实际可见容器/MutationObserver等待。未force重试或替换月结实现。误将JSON容器Trial束作JS检查，改按正确格式验证，不报为产品语法失败。

### 关键验证收据（历史实际执行，本次整理不重跑）

HTTP各lane命令后缀均为`node --test tools/verify_chapter_workbench_http.mjs`；浏览器需已有`PLAYWRIGHT_MODULE`。目录均为本任务独占临时目录，若产物已清理须重跑，不凭路径猜通过。

| 命令／lane | 已验证结果与边界 |
| --- | --- |
| `node --test tools/verify_copy_chapter_ops.mjs` | 最终34/34，601235ms；事务/标签/独立关系/原生计数/生命周期与退役拒绝。后续§208新增组合断言另跑定向，不宣称重新全跑34项。 |
| `node --test tools/verify_copy_receipt_links.mjs tools/verify_copy_conversion_receipt.mjs` | 6/6，152ms；旧新回执、身份/未知字段/坏展示/预算/来源负控。 |
| `CHAPTER_WB_EDITOR=1` | 真实五Tab浏览器直连鉴权HTTPS/SQLite，10次POST及GET，最终作者源全对象恢复；1/1，总235510ms，`dragon-chapter-http-kTPvBc`。不是内存API夹具。 |
| `CHAPTER_WB_BLANK=1 CHAPTER_WB_FORMAL=1 CHAPTER_WB_BROWSER=1 CHAPTER_WB_APP=1 CHAPTER_WB_ERA=1` | 普通新建→两章两势力→检验/审批/正式加载→两玩家各3页App/IDB；1/1，总342090ms，`dragon-chapter-http-xedUrX`。源全经API，无SQL种章。实际DOM/Canvas/HUD日期通过。 |
| `CHAPTER_WB_COPY=1 CHAPTER_WB_FORMAL=1 CHAPTER_WB_BROWSER=1 CHAPTER_WB_APP=1 CHAPTER_WB_ERA=1` | 当时独立身份17章完整copy链1/1，总283310ms，`dragon-chapter-http-BUbad4`；不冒称原20章。后继20章COPY+FORMAL证据见§202，未在该轮重开App/ERA。 |
| `CHAPTER_WB_FORMAL=1 CHAPTER_WB_BROWSER=1 CHAPTER_WB_APP=1 CHAPTER_WB_ERA=1 CHAPTER_WB_RETIREMENT=1` | 退役后转换夹具的正式/两玩家App/跨纪元IDB1/1，291788ms，`dragon-chapter-http-KHicW3`；该轮SQL显式seed夹具，不冒充普通创建或copy API成功。 |
| 核心/元资料回归 | 开局计量/月政策/胜负/纪元/旧属性/据点编译六入口45/45；player-chapters47、runtime-contract106检查通过。天气/事件/外交原证绑定输入SHA，不访问SAVE。 |
| 构建与静态 | 最终59个JS/MJS及两份代码TXT语法、Trial JSON/重建一致、CHAPTER_BASE生成check、diff和六文档79链接通过；独立Vue LS33 SFC。宿主未确认及默认库指纹失败保留在页首。 |

**跨纪元实际覆盖**：两玩家方案47/201分别装入，运行信赖13/27保存后不重置；BC1末→AD1初月结/财政各一次、登场3→2，两侧真实IDB与完整RNG恢复一致，续计serial/sub各+1无重复月结。Canvas“前1”/“1”及HUD正确，均在原日期区；未将字体测量或工厂单测代替App链。普通新建资金10000是显式测试输入，不改默认0。读取端为隔离正式字节运输，不是生产签名reader/部署验收。

## 198. 地图保存：列出检查项，区分拒绝、写入未知与重读失败

`basemap.js`/`BaseMapPanel.vue`/`client.txt`增加局部保存检查弹窗与持久报告；服务端原已有校验，不模拟单响应内部进度。移动检查失败不POST；明确拒绝保候选，写入未知先重读，写后重读失败不报回滚，写入及重读都成功才报成功。模板全检与copy移动批次门保持。

实现轮`basemap.test.mjs`＋`verify_map_position_editing.mjs`16/16及隔离浏览器通过，含非法道路/城移动的对象详情、未执行服务端步骤、数据库版本不变及修复后重存；build/check、独立Vue LS通过。CodeGraph查询超时是导航失败，不是产品保存超时。历史提交`eac9181`不代表已推送/部署；实际登录用户库与生产未由该轮验收，本次未重跑。

## 197. 地图工作台：据点绑定、素材拖放与工具栏排序

绑定/解绑改局部反馈、锁图可操作，解绑后菜单保留并预选原城但不自动绑回；曾被busy/resize关闭菜单，修位置调整及浮层判定后浏览器通过。素材幽灵去中心十字，240单格/4据点组沿共同拖放落装饰、一次撤销，不建城。测试曾用2×2夹具容不下整组，改16×16而非放宽边界；核心30/30、延长预算完整重跑四视口/DPR2浏览器通过，首轮超时不计通过。网格移至工具栏末尾后重跑build/check/独立Vue LS，未重复四视口。文件集中`BaseMapPanel.vue`、`basemapworkbench.js`、`mapatomiccatalog.js`、`mapcanvas.js`及地图专项测试；现行细则见地图合同。

## 196. 整批提交前审查与验证

这是章节任务前的历史授权批，不授权当前提交。保留产品/测试/迁移/必要文档，排除库、证书、profile和本地运行产物；`editor_local_https.mjs`是受跟踪运输源码，不是临时实例。串行8文件59/59、工作台现行四lane总命令及模板store通过；首次Playwright误用CommonJS入口，改已有ESM入口后重跑，不绕产品。固定源登记兼容负控/预约通过，不冒充实际创建。独立Vue LS通过，宿主部分未确认；未跑legacy-draft/large/生产。旧提交与远端引用不再作为页首实时状态。

## 195. Project memory与journal职责整理

前次整理建立长期memory/会话journal分工和§73–194快照；保留历史转接锚点，归档不恢复旧授权/接口。曾因只查docs漏三个跨目录锚点，扩至全仓及父AGENTS/SKILL后通过。该次关于独立删除管理的口径后来由§200用户决定撤销。当前整理见§209，不重记旧文档或产品检查为本轮结果。

## 194. 道路／据点拖动：实时红罩、保存时错误详情

本地实现平移明确对象及据点全章坐标/raw，拖放仅红罩、保存才列对象/城/坐标/原因；不猜归属、重连道路或重排槽。初版对所有copy保存全检阻断分步建城，改为移动批次门后193城链通过。相关文件`mapobjectmove.js`、`mappositionvalidation.js`、`mapcommands.js`、地图Canvas/控制器与两类store。

实现轮47/47、拓扑2项/地图命令8项、模板store及隔离浏览器通过；首次浏览器超时不计，重跑通过。原证工具核87签名及资源SHA，build/check/Trial/独立Vue LS通过；宿主未全部确认。完整调试及未覆盖范围见[§194历史快照](checkpoint-journal-archive-73-194.md)，后继保存反馈见§198，不将本地结果外推为生产验收。

## 历史定位与兼容锚点

以下只转接历史，不恢复旧状态或授权。无锚点的§73–194按[归档编号](checkpoint-journal-archive-73-194.md)查找；更早见[旧归档](checkpoint-journal-archive-through-72.md)。

<a id="184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push"></a><a id="186-d2-event-64p0p1隔离审计与一次性决策包未实施未push"></a>
§184–187：[旧旁表、审计与绝对位置调度实现](checkpoint-journal-archive-73-194.md#187-d2-event-64p2p5-本地实现d0d8s1-全-a已完成并推送-b101dd3未部署)；现行规则见D2计划，不用旧旁表方案。

<a id="79-sea-ground-1全幅海域基底与地面轮廓"></a><a id="80-atomic-catalog-1单格素材库与单层分类"></a><a id="81-atomic-preview-2分类更正植被核对与32px预览"></a><a id="82-atomic-spring-neutral-3固定春季与中立据点素材"></a>
§79–82：[底图、原子库与春季展示历史](checkpoint-journal-archive-73-194.md#79-sea-ground-1全幅海域基底与地面轮廓)。
<a id="84-map-space-4地图优先布局与对象右键菜单"></a><a id="85-map-space-5紧凑布局与原始比例"></a><a id="87-map-pan-lock-1地图拖动锁定切换"></a><a id="88-city-group-1四套配方与放置接缝待确认"></a><a id="89-city-group-preview-1据点组只读素材展示"></a>
§84–89：[布局、锁图与据点组预览历史](checkpoint-journal-archive-73-194.md#89-city-group-preview-1据点组只读素材展示)；对象拖动以现行地图合同为准。

<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a>
§37：[Element Plus默认主题／组件决策](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)（tag: architecture）。
<a id="49-共享头像文件及资产id数字重编号"></a>
§49：[共享头像数字身份决定](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。
<a id="10-014发布整理"></a><a id="11-015发布整理"></a><a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a>
<a id="5-当前时钟系统逆向与重构本地完成"></a><a id="6-发布主线阻塞与下一步"></a><a id="8-用户指定五档提速"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-录像反馈后的战略性能修复"></a>
时钟与表现：[更早历史索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<a id="11-编辑器vps部署前只读盘点"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署／Trial：[更早历史索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)，不是当前部署身份或恢复接口授权。
<a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a>
早期Vue壳：[原批次及缺口说明](checkpoint-journal-archive-through-72.md#19-后台框架壳editor-ui-1)。
