<a id="chapter-wb-本地实施与隔离验收审计收口中"></a>
# CHAPTER-WB 本地实施与隔离验收审计

> 本表保留原任务交付轮次证据。后续用户已批准同君主／共首都均保首丢后，新复制规则以[章节合同§0](chapter-and-base-resources.md)与journal§201–202为准；下文当时的“原20章共首都拒绝”不再是现行规则，不将历史18/17章验证改写成20章通过。

审计对象：[P0–P7任务](chapter-workbench-plan.md)。当前基线HEAD为`513e8a1`，实现保留在工作区；本表不授权提交、推送、部署或真实数据迁移。现行合同维护在[章节合同§0](chapter-and-base-resources.md)，逐次执行记录在[journal§199](checkpoint-journal.md)。

**结论：P0–P7本地实现及本任务的隔离验收已完成。** 本结论不表示全部工程检查绿色、旧库消费者身份已迁移或生产可部署。已验证范围：原四Tab及后续批准的外交矩阵、独立章节/势力生命周期与服务端事务、普通创建/独立源完整复制、正式装配/玩家实选、跨纪元月结及隔离存读档，逐项证据如下。新增真实编辑器HTTPS/SQLite组合lane已关闭五Tab保存接缝；复制转换提示已按下述后继补齐；日期显示也已由后继真实Canvas/HUD观察覆盖；最终文件、现行合同与逐项覆盖已复核，不以单项通过替代本表整体证据。各测试只证明列明范围，不推定全部原版事件分支、扩容写入或生产部署；默认旧available-library指纹检查失败、宿主LSP未确认仍明确保留，不能称全部检查绿色。测试结果引用实际执行轮次，没有把历史测试重记为本次重跑。

## 需求 → 产物 → 证据 → 缺口

| 计划项 | 当前产物/可检查入口 | 已有证据及未完成项 |
| --- | --- | --- |
| P0.1 现行路径与legacy分离 | `server/gamecopy.js`、`server/public/draft.txt`、`editor-ui/src/ChaptersPanel.vue`；旧writer保留给固定profile回放 | 现行受限命令与四Tab已接；旧管理页章节/任官/原单位表单已撤。legacy测试不替代copy，见T1/T2/T3 |
| P0.2 字段、单位、归属、默认值表 | 章节合同§0字段表；`re-notes-ai-fiscal.md`、`re-notes-legion-fate.md` | 信赖、两月税/兵、钱/三池、G00/G17/G18/G19/G1C/G1D及raw写入已分清；空白创建recipe的模板/清理写集及用户批准外交默认均已列明，T5 BLANK验证实际消费者；不外推任意旧源缺失输入可以补造 |
| P0.3 原始基线 | `tools/audit_chapter_workbench.py`；本地`.dragon-analysis/chapter-wb-p0-01/baseline.json` | 已核该产物存在并包含工具/parser/五源SHA；20章、错属/共首都及短尾明细。是非存档原数据盘点，不是机制证书；下库短尾不得补零 |
| P1.1 独立章节及身份/编号/次序/固定槽 | `gamesource.js`章节标签/复制/势力身份；`copychapters.js`转换 | T1/T4锁定章身份、编号6/名称8码点分别trim/NFC唯一、势力number与idx分离；退役保留原生位置/身份，T1/T4首中末验证不重排 |
| P1.2 章CRUD、零章、首中末删除 | `addBlankChapter`、`copyChapterInGame`、当前chapters命令 | T1首中末/末章，T3取消/数量/末章重读，T5真实API及已发内容不变；零章保存但无发布票 |
| P1.3 事务、权限、票据、旧格式读取 | `GameCopyStore.writeModule`、`validateWhole`、draft DTO | T1晚SQL失败及命令批回滚、T5作者/CSRF/跨游戏拒绝；显式新格式写入，不在GET迁移旧源 |
| P2.1 创建、编号递增、容量、换君主 | `createChapterFaction`、`changeChapterMonarch`，势力Tab | T1/T2/T3验证君主+首都同存、资源/方案默认、旧君主留属、ID/城/钱不变；退役槽不复用，DTO按已分配槽数限制22；T2容量负控、T5退役后新编号/新槽创建通过 |
| P2.2 首都、军师、保留外交官 | `setChapterCapital`、`setChapterCityOwner`、`chapterCapitalGaps`、四Tab候选 | T1 raw/C01/F03/F23及旧C1A不变；T3换都/取消/军师/首都锁定；后继修军师变更的兼容n_generals投影，保持F18不变，T1完整34/34。外交官选择项不显示，合法旧字段未删除。首都>255/原生城数溢出目前明确拒绝，不能外推扩容适配已完成 |
| P2.3 解散影响与清理 | `retireChapterFaction`、当前两命令、DTO/四Tab、player环境 | T1两入口首中末成功、九类后续写入拒绝/事务无前缀；T3影响数量确认/取消零写/重读解锁首都；T4编译/fresh/完整JSON恢复；T5鉴权HTTP及退役副本正式App链。军团/非零事件/外交官/俘虏/其他任官报`COPY_CHAPTER_RETIREMENT_CONFLICT`具体冲突，不猜清；不复用退役槽，保留外交物理字节 |
| P2.3 删章隔离 | 当前copy delete、UI数量确认 | T1/T3/T5已有证据。与势力解散是不同操作，前者通过不能推定后者 |
| P2.4 武将/据点本章配置与联动 | `configureCopyGeneral`、`setChapterGeneralArrival`、`setChapterGeneralOwner`，city-faction | T1/T2：主表关联只在明确保存时分槽、正常0..126容量、active/月数/join/owner独立、F18双raw；T3普通城空城选择及取消/重读。特殊状态转属具体拒绝，不能声称所有残留关系已支持 |
| P3.1 独立开局方案、默认及旧值保留 | `chapteropening.js`、`chapterresources.js`、新建势力命令 | T1/T2/T6及T5运行分别证明存储/界面/应用；下月税/未知字节保留。空白章其余初态由创建recipe及T5 BLANK另行验证，不用方案默认值单测替代 |
| P3.2 实际人数/金额、只换算一次 | `encodePlayerOpening`、`editChapterResourcePeople`、预览 | T1/T6覆盖0/9/10/127/上限及拒绝，钱不除十；T3预览及重读；App实测word12/7、next20/30/40。测试不是任意旧值被裁剪的授权 |
| P3.3 玩家实选及restore不重套 | `world.js`、正式player loader、`chapter-published-choice-browser.mjs` | T5真实选择两个势力、真实App/saveGame/退出标题/新页restore，运行信赖13/27与征兵370保留，RNG快照全对象一致；reader status/admit为隔离测试port，不是生产签名端到端 |
| P3.4 BC/AD无0年、月结/倒计时/显示/保存 | `clock.js`、`savegame.js`、main加载、日期展示 | T7三种年界及无0年；T5前1末→公元1初实际App月结/财政报告各一次、月数3→2、两侧IDB及AD恢复后续计不重复。后继BLANK全flag真实App还核选章DOM纪元、生产Canvas年份文字与35px列/32px高字形边界、10Hz HUD年月日，双侧读档显示正确；1/1测试337251ms/总342090ms，dragon-chapter-http-xedUrX。不是此前整月每日行军或所有事件组合的证明 |
| P4.1 普通新建、共享主表、空白/同游戏复制 | 模板创建、主表导入、空白章/同章复制 | T5新建无凭空势力/人物；T1/T4独立复制。新创建边界已修固定表继承额外活动势力，真实API核0→2→退役1→再建2，完整复制不重置。共同天气窗已由五原始文件20章逐字节对照接入，双章深拷贝/真实天气初始化通过。完整空事件模板已按独立原证复制，短尾仍拒绝。后续批准固定模板外交已接，新增势力双向普通183，原关系/对角/别名字节保持；两势力空白章实际编译/fresh/JSON恢复通过，第三势力新增写集576格核对通过。**后继T5 BLANK全flag已从真实创建/作者HTTP操作走通正式审批/App/跨纪元IDB链，不再仅有装配证据** |
| P4.2 完整复制逐章映射 | `initializeCopyGenerals`、`initializeCopyChapters`、conversion receipt | T4：实际固定Web源无歧义17章编译及34次装配/JSON恢复，保留来源值/独立方案。原始五库与已安装Web源需区分；全20章包含共首都，应拒绝而非假称成功 |
| P4.3 只纠正新副本 | `copychapters.js`与T4 | 错属纠正收据包含before/after，C1A及原源不变；共首都拒绝。T5真实完整copy API坏源拒绝；早期成功formal为SQL种入转换夹具；后继COPY lane以独立身份完整复制其17章并通过真实API/正式App链。转换明细现同时进入创建完成/原键查询回执和只读「轉換明細」弹窗；标签与首都前后值可见，原件不变。原四字段身份/来源校验保持，展示数据不作为权限。新增回执控制器3/3、五Tab浏览器含复制明细/转义通过，COPY+FORMAL真实HTTP后继1/1（277857ms/总287073ms，dragon-chapter-http-OG5aCD），核回执=作者数据/原键查询一致、篡改身份或未知字段仍503、旧四字段回执兼容；该轮未重跑玩家浏览器App/ERA。后继删除SQL链接检查同步兼容可选展示字段；新增真实内存SQLite与前端回执合跑6/6（152ms），原四身份/未知字段/来源/8192B门均有拒绝负控；不是物理删除全链证书。单点隔离纠错收据为upper-2／許昌city82／faction0，before:null→after:0，原源和C1A不变 |
| P5.1 四Tab、共享章、非向导、脏输入/旧响应 | `ChaptersPanel.vue`、draft控制器 | T2/T3：共享章、切Tab/章/游戏保护、0章、模块标题反馈。后续T2补保存/重读失败，并扩到替换会话后首次读/缺行/ensure/保存/重读五阶段×成功/失败十格矩阵：无回灌、无后续请求；修复首次读取迟到错误外泄及续请求缺少守卫。T3一次422后旧值保留/模块错误/再保存恢复，不外推所有异步时序 |
| P5.2 章/势力/武将显示与编辑 | 四Tab、主表DTO投影、分页组件 | T2/T3：标签、开局字段、军师空选、库中未配置人物、主表姓名/字/号/六能力/头像键/自杀属性、编辑取消保存。另含解散影响确认、取消零写、隐藏退役行/保留其它编号及据点锁定即时更新 |
| P5.3 据点、固定表头分页/窄屏、旧入口退役 | 四Tab与DraftPanel | T3及generals永久browser lane：分页/窗口尺寸/隐显输入/空城保存/首都锁定；后续已补主表名称/坐标/类型/外观/最大生产只读投影，章节读模型支持0..511；T2新增193/512行及非法范围/重复槽拒绝，T3实际跳页查看第193城及只读列；后续修复capital读取仍限191的接缝，T2验证192/511可读、512拒绝，T3选首都192保存重读/锁定。511仅为读合同，不放宽原生首都/计数写入门 |
| P6.1 两章两势力/关系/取消/拒绝/IDB | T1–T5组合 | T5普通HTTP已建两章各两势力，同一主表人物跨章君主/普通人、同城异属；解散/拒绝/新编号再创建/删章保持他章与主表。T3取消与分页等为独立UI夹具；后继EDITOR lane另行验证真实编辑器五Tab的10次鉴权保存重读和整个作者源精确恢复 |
| P6.2 真实API→检验→提交→审核→正式加载 | T5及`server/playpacks.js` | 成功转换夹具两势力App链通过；普通创建profile视觉绑定修复仍保registry/definition/SHA负控。**普通空白新建成功链已由T5 BLANK全flag覆盖；独立17章源的完整copy API成功链已由COPY全flag覆盖；未冒充原20章成功** |
| P6.3 点名入口与分级检查 | 见下表及journal逐次结果 | named入口已分别执行；Vue33SFC、build/check、Trial束有记录。主动LSP多次inconclusive不能记clean；不存在本轮所有变更的总绿证书 |
| P7.1 合同回流/撤旧口径 | 章节合同§0及旧§1–§8归档，相关re-notes | 已撤旧纪年标签/异属首都/旧表单口径；本轮原证与Web产品边界已回流。原版其他尚未闭合分支不因本任务完成而获得实现授权 |
| P7.2 逐项交付/隔离证据 | 本表、journal、T5隔离库、P0收据 | 本表按需求记录本地交付证据；正式App stdout与隔离数据库提供实际观测，未生成独立冻结result.json/完整工具SHA收据，不声称具备该额外产物，也不事后伪造历史收据。禁止提交/推送/部署及原件保护由工作区检查与各隔离lane落实；宿主诊断和旧库登记限制见下文 |

新增外交子模块：需求见计划后续批准增量。共享字典/矩阵边界与单格命令已接，原证3/3、五档单向写及非法/退役事务拒绝、控制器35/35；真实HTTP验证作者/CSRF门、他章/主表隔离、普通新建取得检验票。freshprofile五Tab验证22势力462格、窄宽屏仅表内横滚、即选即存无确认、422恢复旧值/报错、退役删行列。字典字段/原证及Web代表值来源维护在章节合同/去向笔记；外交专项本身不替代正式App链；后继普通新建结果见下段。

外交后继整体验证：命令/转换组合750秒超时，不记通过；分项`node tools/verify_copy_chapter_ops.mjs`33/33（592447ms）及`node --test tools/verify_copy_chapter_conversion.mjs`7/7（49245ms）分别通过。HTTP首次300秒超时后独占新目录`dragon-chapter-http-ZT2Tjj`重跑1/1（222486ms），包含普通新建检验票及真实外交写入/权限/回滚；本轮不带FORMAL/BROWSER/APP/ERA。UI1280106B/152440B、VueLS33SFC通过，该轮Trial为`0ec379e487623763540b56e2fd1e76c994bca77469b2e1b7fe13aee8d81a6339`（261files）。主动LSP10路径9inconclusive/1unsupported，非clean。

普通新建正式链后继：`CHAPTER_WB_BLANK=1 CHAPTER_WB_FORMAL=1 CHAPTER_WB_BROWSER=1 CHAPTER_WB_APP=1 CHAPTER_WB_ERA=1 PLAYWRIGHT_MODULE=<本机已有Playwright> node --test tools/verify_chapter_workbench_http.mjs`本轮1/1（测试340416ms/总347720ms），独占目录`dragon-chapter-http-cS7oaR`，game `99eb8f84-d919-482f-bc33-1731effe6017`。源全由HTTP创建/导入/编辑，不SQL注入有效章节；两玩家各三页面真实App/IDB，BC1→AD1月结/财政各1、月数3→2、恢复不重套与续计成立。两处负控驱动修复：普通模板资源writer原被拒；发布正文原漏作者章名导致预览不可用。`verify_publish_triplets.mjs`6checks通过，包含缺旧name/改名与异步捕获、原源不改；资源memory工具已有194checks/72negatives。六文件主动LSP全部inconclusive，缓存未确认，不是clean。此轮无RETIREMENT flag、无完整copy API正控；未以此宣称所有分支或总目标完成。

独立源完整复制后继：`CHAPTER_WB_COPY=1 CHAPTER_WB_FORMAL=1 CHAPTER_WB_BROWSER=1 CHAPTER_WB_APP=1 CHAPTER_WB_ERA=1 PLAYWRIGHT_MODULE=<本机已有Playwright> node --test tools/verify_chapter_workbench_http.mjs`1/1，测试277341ms/总283310ms，`dragon-chapter-http-BUbad4`，game `586dccf3-96b5-47bf-922a-b64c4142f6ce`。实际复制独立注册源全部17章，无章节SQL注入，正式manifest保持17章；两玩家各3页，BC→AD及信赖13/27、征兵370、倒计时3→2、月结/财政各一次、完整RNG恢复和续计通过，无意外浏览器/外网错误。该轮未开RETIREMENT。独立源单测随后3/3（18877ms）、默认owned-runtime-assets43组、publish-triplets6组通过；默认源HTTP1/1（196543ms，`dragon-chapter-http-BFd7Al`）仍拒原20共首都。首都纠错定向1/1（12621ms）输出上述收据。

**单列失败**：`EDITOR_TEST_PORT=18973 node tools/verify_pinned_source_registration.mjs`在stageInstalledAvailableLibrary处报`available library consumer fingerprint mismatch`，尚无任何启动/鉴权检查执行（checks/calls均空），不记通过、不改pin/指纹绕过。默认源HTTP和独立源HTTP是各自独立的通过证据，不等于该CLI/library工具通过；适用性结论：该失败涉及未迁移的旧available-library消费者身份；本任务现行copy依赖的固定来源注册与真实编辑器/发布加载已另行实测。未使用`--no-library`将壳测试冒充业务验收，也未把此失败标为通过；默认全库启动/库身份升级不在本次禁止改旧pin的交付结论内。

## 命令索引与执行范围

以下均在仓库根执行。长lane串行，禁止用通配批跑。T7在首轮审计重跑；后续据点展示切片重跑T2/T3与generals浏览器lane。其余是已记录执行，详细时间/临时目录见journal。

| 代号 | 实际命令/入口 | 最近记录的范围/结果 |
| --- | --- | --- |
| T1 | `node --test --test-concurrency=1 tools/verify_copy_chapter_ops.mjs tools/verify_copy_chapter_conversion.mjs` | 上一合跑39/39，490237ms（32项命令/事务＋7项转换/运行）；最新命令文件单独34/34，601235ms，包含军师兼容显示数修复、两入口首中末退役、冲突及后续引用拒绝；未冒称本次又重跑转换文件 |
| T2 | `node --test tools/verify_copy_controller_chapters.mjs tools/verify_copy_controller_cities.mjs tools/verify_copy_controller_posts.mjs` | 历史与generals/copypage/map合跑50/50（673ms）；本轮三入口36/36（214ms），追加实际开局工厂后42/42（284ms），含作者编号确认、旧格式预览与fresh一致、退役读模型/22已分配槽、主表投影/193及512槽、读写错误及过期十格矩阵；不是鉴权HTTP |
| T3 | `PLAYWRIGHT_MODULE=<已有playwright模块URL> node tools/verify_chapter_workbench_browser.mjs` | 本轮完整五Tab lane通过，含外交矩阵、解散影响/取消/重读、删最后章、193城首都重读及两次预期422后恢复；API为内存夹具，0非预期浏览器错误 |
| T4 | `CHAPTER_WB_IDB=1 node --test tools/verify_copy_chapter_conversion.mjs` | 原IDB轮6/6、36825ms。最新与T1联合39/39，转换文件7项：34次fresh+JSON和三种退役位置的实际装配/JSON；此轮未开IDB开关，App跨月由T5覆盖。随后修空白固定表，转换文件7/7、39009ms；补天气缺失负控后与三项创建/发布门联跑4/4、92926ms |
| T5 | `CHAPTER_WB_FORMAL=1 CHAPTER_WB_BROWSER=1 CHAPTER_WB_APP=1 CHAPTER_WB_ERA=1 CHAPTER_WB_RETIREMENT=1 node --test tools/verify_chapter_workbench_http.mjs`（设置已有PLAYWRIGHT_MODULE） | 1/1、291788ms，目录`dragon-chapter-http-KHicW3`，game `4827933e-76f0-4d36-9ce4-2f44d32e81fa`；退役副本审批/两势力各3页、App月结/IDB/RNG恢复续计。其后补两章各两势力与退役后再创建，默认HTTP lane另1/1、187496ms，目录`dragon-chapter-http-HjoBNw`；这次未重跑formal分支。空白固定表修复后默认HTTP又1/1、186414ms，目录`dragon-chapter-http-09bXLW`，验证实际22槽活动数而不只看公开列表；formal分支未再次重跑 |
| T6 | `node --test tools/verify_chapter_player_opening.mjs`；`tools/verify_native_monthly_policy.mjs` | 两者此前各6/6，计量/方案单测，不替代T5 |
| T7 | `node --test tools/verify_native_victory_gate.mjs tools/verify_chapter_era_clock.mjs` | **该记录轮次15/15，289ms**；胜负门已从8位SHA前缀改为完整SHA256绑定，只读固定KI/官方SINARIO与内存App，时钟为小单测。证明固定22槽活动位参与胜负，不证明作者解散清理已完成 |
| 点名兼容入口 | `node --test tools/verify_chapter_attributes.mjs`；`node --test tools/verify_chapter_city_compile.mjs` | 4/4、14/14；前者旧writer回放，不得采用其旧首都豁免作为现行合同 |
| 点名运行入口 | `node tools/verify_player_chapters.mjs`；`node tools/verify_runtime_contract.mjs` | 此前47与106检查通过，范围为索引/准入合同，不是App交互 |

共同天气后继：`node --test --test-concurrency=1 tools/verify_chapter_blank_weather.mjs tools/verify_copy_chapter_conversion.mjs` **9/9、39053ms**。绑定五个原始非存档文件SHA，20个完整天气窗与边界相等、直接解码匹配生成物；验证新章引用隔离/实际天气初始化、17章转换运行不变。新章仍在缺外交矩阵处拒绝；本轮没有再次跑HTTP/formal。

事件模板后继：同一天气/转换命令最新 **10/10、39139ms**，新增19完整原事件窗与生成物一致、1个1022B短尾被真实初始化器拒绝；新章实际建立256空槽。生成基座22615B，Trial为`5bb9774053a4e58be40a58dfdf8606da32f4887477abdc7eea0ae2bc666803f1`。该历史轮次外交缺失仍实际拒绝，未把复制完整模板等同于修复旧短尾。后继用户批准外交模板后，同命令11/11、47457ms，新增完整矩阵原字节与空白章编译/fresh/JSON恢复正控；补旧矩阵分歧拒绝后定向`new blank chapter`1/1、21433ms及SQLite `faction creation commits`1/1、36636ms。新基座23818B，该轮Trial为`774e5e3259394dfb55b23fa0afaceaa2f8041269ff6a6b530cf10ddc7552c6b2`。本轮没有重跑T5正式App或UI；新外交子模块仍未接完。

## 收口复核与明确边界

1. **已关闭的原缺口**：空白创建recipe及批准的外交语义已落实，BLANK实际API/正式App/跨纪元链通过；独立品牌、独立registry的COPY全17章正控也已通过。上文事件/天气阶段的“缺外交”“未接完”只描述当轮历史，不是当前阻塞。原20章坏首都仍拒绝，旧缺字节不自动补造；复杂解散关系与扩容写入限制见逐项表。
2. **注册与库指纹分开报告**：显式`EDITOR_TEST_PORT=18973 node tools/verify_pinned_source_registration.mjs --source-only`通过五项源注册/启动检查，未检查available library。默认工具的consumer指纹失败来自本轮纪元修改的`web/src/main.js`、`ui/gamebar.js`、`ui/hud.js`；只读对比证明三者HEAD字节仍匹配旧pin，而工作区不匹配。未篡改旧库身份或放宽校验，不能把source-only当默认工具通过，也不能把失败称为原有无关问题。
3. **当前最终文件检查**：UI build→check后继1282911B/152440B/licenses12；独立Vue LS33SFC；最终59个变更/新JS/MJS及draft/shell-ui两份代码TXT语法；Trial在军师兼容显示修复后为470ad89ca0057bfb26a1d51adfdea2f59482e43390181b0209706badec1e4dc2/261files；基座23818B check通过。六个计量/政策/胜负/纪元/旧属性/据点编译入口串行45/45（28980ms），player章节47、runtime合同106。主动LSP9inconclusive/1unsupported单列，不是clean。HEAD513e8a1，原pin/库声明/内置源无diff。6份本轮文档的79个本地链接/锚点检查通过（journal限定§199），修复财政月结顺序的缺失兼容锚点。只读重新打开本任务三个独占SQLite产物，核xedUrX正式2章、BUbad4与OG5aCD正式17章、listed=1、正式资产各6项及两势力信赖47/201；前两轮保存BC1末初态，未开ERA的OG5aCD仍保AD187，并有17章转换回执。该复核证明持久产物仍在，不冒充又跑浏览器或月结。
4. **界面审计修复**：现行确认统一作者编号与君主名，不再显示正常势力的物理槽编号；新增编号8/物理槽0的取消零POST断言，控制器36/36，五Tab浏览器通过两次预期422及其它无错误。后续首都确认补势力名后，控制器36/36（214ms）及同浏览器lane再次通过。再修旧格式缺方案的预览信赖73与实际fresh255不一致：负控先失败，修后控制器＋实际开局工厂42/42（284ms）、五Tab浏览器通过，旧源不改且显式方案73保留。该项功能修复与对应回归均已落实。
5. **真实编辑器接缝已验证**：`CHAPTER_WB_EDITOR=1 PLAYWRIGHT_MODULE=<已有模块> node --test tools/verify_chapter_workbench_http.mjs`新增`chapter-editor-http-browser.mjs`，全新Chromium context使用本轮真实会话cookie连接独占HTTPS，API无mock。章节名称、势力信赖、另一章普通将倒计时、普通据点归属、外交单向关系各改变/恢复一次，共10次真实POST及GET；每步由独立鉴权读取核SQLite结果，末尾整个作者源精确恢复，其他章/主表不变，0浏览器错误/外网请求。完整HTTP lane **1/1，测试233145ms/总235510ms**，`dragon-chapter-http-kTPvBc`。首轮因测试误点ElSelect内部input被placeholder遮挡而超时，改点真实可见选择器容器，未force、未改业务控件。该轮只登记当前copy依赖的固定源，未测试available-library/default dev启动，也未重跑FORMAL/App；不能用它改写库指纹失败或LSP未确认。
