# Checkpoint Journal

> 本文件 = 当前主线状态 + 稳定事实/命令/坑点 + 本批会话明细。
> 逐批历史明细的维护源：批次证据见各 `docs/editor-*.md` 的「维护源」、验证 lane 状态见 [editor-local-validation.md](editor-local-validation.md)、Trial 线程逐轮交接见 `.dragon-analysis/editor-phase/SESSION-RESTART-HANDOFF-TRIAL-SERVER-R*.md`（最新 R17）。早期逐批明细已自本文件移除，旧版在 git 历史中可查。

## 当前主线状态（2026-10-09，dev 分支 @20692d7，未 push）

- **任务一（编辑器）E-05 Trial 服务端线程：批次 1-7e＋8a-8h 全部闭合**。最新 8h（删除级联，事项③）：`GameDeletionFence.begin()` fence INSERT 同一事务内级联 trial 行＋资产；链已封存（deletecascade-r1：derive 双向绿→guards 562/269→gate 12/13 真后端→audit 9785→postdoc 9787，`deletionCascadeWired:true`）。guards **562/269**；仍不称 Q69/Q70/Q71 闭包完成。
- **用户事项队列**：①统一/胜利终局——暂缓（裁决 B）；②战术帧实际验证——✅ 8g 闭合；③删除级联——✅ 8h 闭合（链已封存；dispatcher 跨 lane 全回归待下批链）；④图片资源 native 路径——**用户已裁决，实施中**（人物头像上传，见下）；⑤commit/push/deploy——最后，等明确授权。仍不称 Q69/Q70/Q71 闭包完成。
- **Web 产品决定（用户裁决 2026-10-09，非原版机制）**事项④人物头像上传：①尺寸不限 128×128（建议值；实测 120×120），只保证现有源矩形裁active→64×64 显示不变，上传单文件 ≤100K（性能）；②只收 JPG/PNG（以当前 `new Image()` 解码能力为准）；③头像资源不绑定 255 槽位（uuid 级 assetId，数量不限；武将数据模型槽位解限另案）；④落盘走 `trial_assets` 派生机制（同事务写入＋fence 级联删除复用 8h）。
- **其它 open lane**（详见 local-validation 与各维护源）：E-01 GameBar 图像 native 全图/SDK 502 根因 UNKNOWN；saved-source capture 成本线程（候选未装、fullnative false）；RuntimeManifest/发布/物理删除等 R12-4 属后端线程。任务二（地图改造）已收口（MAP-MIGRATION-2，审计页为准）。
- **本地提交基线**：dev HEAD=`20692d7`（任务二＋E-02/E-03 基线）。8a-8g 全部改动（server/、tools/ 新工具、docs、.dragon-analysis/）均在工作区未提交；`server/` 不入 git（先例，链以 sha 钉住）。365 个脏改主要是 `.gitattributes` 换行符归一化假象＋未提交批次产物。

## 稳定架构事实（Trial 栈，实锤）

- 链路：工作台 `draft.txt` 选章 → POST `/api/games/:id/trials`（issue/commit 两阶段）→ 壳 `/api/trial/web/?trial=<uuid>`（会话 cookie Path=/api）→ 束内 `servertrialapp.js` boot（gate 十字段）→ `TrialStrategicClock`（网络 permit＋各 hold 并集）＋ `createTrialBattleFrames` 战术边界（rAF 循环同一函数，evaluate 泵送不绕行）。
- 私有资源：`/api/trial/web/<path>` 统一只读路由 = 束模块（215 文件）＋`trialRegistryBytes` 两注册表角色；库 398 固定资源 manifest `70acce54`（93632 字节不变），20 条 G127/255 未闭合引用保持登记（`STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE`）。
- 战术入口：玩家进攻 4F36 必挂起（attacker==player、非委任、真守备）；玩家空城（0x4200 临時守备）被攻走快战 4F06→TALK26 无战术。章数据 20 章全零初始军团（AI 组建）。
- 权威文档：[editor-trial-server.md](editor-trial-server.md)（设计＋逐批）、[editor-goal-completion.md](editor-goal-completion.md)（最新收口）、[editor-local-validation.md](editor-local-validation.md)（验证清单＋工具表）。

## 关键命令

- 后端：`node tools/editor_server.mjs --serve --port 8322`（8321 为游戏静态服）；自检 `node tools/editor_server.mjs`。
- Trial 工具（真实后端/浏览器）：`node tools/verify_editor_trial_<name>.mjs <round>`（gate/asset_gate/sentinel_gate/talk_gate/talkdirect_gate/tactical_frames/endview_defeat）；8g 战术帧实证 `node tools/verify_editor_trial_tactical_frames.mjs <round>`（round 目录需预置 fixture.js，浏览器 75 分钟有界）。
- 束重卷：`node tools/build_trial_web_bundle.mjs`（215 文件 sha 输出；改 web/src 后必跑）。
- 证据链（scope 内）：`node <scope>/derive.mjs` → `prepare-guards.mjs` → `run.mjs`（含 dry＋scope 双轮）→ `audit.mjs` → `post-document.mjs`；失败现场移 `attemptN-*` 保留后重跑，不得覆盖。
- 单测 `node --test tools/verify_<x>.mjs`；Python 用 `python`（C:/Python313，非 WindowsApps 垫片）。
- Jev 审过：`node tools/jev_assess.mjs <change|failure|reverse-triage> --input -`（先不加 `--send`）。

## 重要坑点（已验证）

- **roadgraph 门面 vs app.world**：`web/src/game/roadgraph.js` 是默认世界单例门面；试玩壳只装配 `createWorldResources` 自建实例（`scenarioassembly` 只加载注入 world）→ 门面恒未加载，`roadNodeAt/roadNodeRawAddress` 恒 null。任何「当前 world」查询必须走 `scenarioNativeRoadContext(sc).roads`（8g 缺陷①实锤，dispatch 已改）。
- **TRIAL_QUERY vs bust**：`/api/trial/web/` 对任何 query 一律 422（8g 缺陷②已修：白名单唯一 `?v=original-sprites-1`）；试玩响应全 no-store，缓存戳在试玩壳是死重。
- **试玩壳画布竞态**：`#cv` 初始 300×150，resize 异步；mapping 探测必须轮询等 width≥1000，否则点击坐标全错（连环误触工具栏）。取 `app.view.cv ?? #cv`。
- **settings 窗口与观众弹窗**：系统菜单开启阶段不应答任何观众（keypad/reasons 的游戏坐标可落入工具栏带 py<32，连环 toggles）；audience 开着也能点工具栏。
- **guards 双桶**：同一文件可在 guards 的 inputs 与 imports 两桶——继任时两桶都要写新 hash，否则 merged 时旧值覆盖。
- **链式 EEXIST**：derive/run/audit/postdoc 均 once-only（flag:'wx'），任何中途失败都会留下 `derive-before-*/source-*/audit-source-*/before.json` 等，重跑前必须移入 attemptN-*（含 q69-*-scope 轮目录）。
- **gitattributes 假象**：`git status` 大面积脏改常系 `.gitattributes` 换行符归一化（工作字节==封存字节），用字节比对甄别，不吸收无关改动。
- 画布点击经 `getBoundingClientRect` 换算（含 1px 边框＋body 边距）；章节 id 含 `#`，拼 URL 必须 `encodeURIComponent`。
- E717 槽纪律：源槽＝种子方向，目标槽＝到达反方向；走廊 8006 单格 detour 零可分类——纯几何新路必拒收，有效改路须 tile 重漆 recipe。
- `prepareScenario` 城市/节点门是显式别名 enforcement；`structuredClone` 替代 JSON 深拷贝；verify 输出走 `tlog`，`console.log` 触发 pi-lens 告警。
- 失败断言读玩家可见 DOM（`#edcap`），不读内存对象（8e 教训：caption 误读内存值）。
- 引擎 fail-closed 是特性非 bug：`originalroadmovement` 的 `Uncovered ...` 系列 = 覆盖缺口信号，修须 RE 证据，禁经验补公式。

## 约定（证据链纪律）

- 批次闭环五段：derive（6 authored，provenance/doc-impl/production pair 双向证明）→ guards 继任（prior 谱系登记）→ gate（dry 轮保留＋scope 轮重放）→ 独立 audit → post-document；全部 hash 钉住、不重跑已密封 scope、不追认历史成功。
- 机制结论只认原始证据（KI.EXE 指令链/原版数据/受控观测）；推断与未知不进正式规则路径；空句/覆盖缺口登记为已知问题不发明绕行。
- 试玩内容前提（用户批准）：仅据点/道路/武将数据可定制，引擎/规则/AI 不动；自动化禁触 `E:/Dragon/Dragon/SAVE.DAT`。

## 会话记录：8g 试玩战术帧实证（2026-10-09）

**目标**：用户事项②——Trial 栈战术帧动态浏览器实证（7e 残留）。**结果**：✅ 闭合。

**实锤并修复两个真生产缺陷**（验证的目的就是实际跑通，修复属授权内最小必要改动）：
1. `web/src/game/commands.js`：`dispatch` 原用门面取 `roadEdgeOrNode/targetNode` → 试玩壳恒 null → 首个行军动作 fail-closed 冻泵（dry5/8/9 现场：`Le: undefined`／`target node id: undefined`）。改 `dispatchSourceRoadNode/dispatchTargetNode` 经 `scenarioNativeRoadContext(sc).roads`，非 native 回落门面。
2. `server/worker.js`：trial web 路由 query 422 与 `imageBust` 冲突 → 战场打不开（battle 从未在试玩跑通故未发现）。白名单唯一 bust 值。
3. `server/public/trialweb.txt` 重卷（215 文件，commands.js 条目前进）。新工具 `tools/verify_editor_trial_tactical_frames.mjs`（23 检查／7 调用）。

**失败尝试（attempt1-11 全保留于 `.dragon-analysis/editor-phase/`）**：import 路径层级→settings 早窗 flake×2→AI 零军团（加 census 等待）→长距行军超时（30min＋军团遥测）→移动覆盖缺口 fail-closed（v1 长距，记 march-engagement 线程残留）→被动防御零战术（dry7，得 0x4200 快战机制红利）→on-road 过滤查错 roadgraph 实例（门面未加载，dry10）→offgraph 冻泵（publish-drops-null 实锤链）→targetNode 第二处门面（dry 后修）→`#cv` 300×150 映射竞态→settings 应答落工具栏。另有 ~25 次链脚本/derive/guards 漂移重登记（均属链纪律清场，非产品问题）。

**相关文件**：`web/src/game/commands.js`、`server/worker.js`、`server/public/trialweb.txt`、`tools/verify_editor_trial_tactical_frames.mjs`、`docs/editor-trial-server.md`（8g 节）、`docs/editor-goal-completion.md`、`docs/editor-local-validation.md`（工具表）、`.dragon-analysis/editor-phase/SESSION-RESTART-HANDOFF-TRIAL-SERVER-R17.md`。

**当前阻塞**：无（8g 已闭合）。**下一步**：事项③删除级联批次（后端 fence 同事务级联）；之后按序 ④图片 native 讨论、⑤commit/push 授权。

**lint 收口（同批，2026-10-09）**：pi-lens 报告 1E !79W 已清零。`commands.js` L14 barrel `export…from` → 本地再导出（同名公开面不变）；`worker.js` 嵌套三元展开＋`(await …).prop` 解构；三个 harness 工具改走仓库 `tlog` 约定（`node:util format`）、展开嵌套三元、解构 await；journal 整篇重组（883→~90 行）。再封存：derive 7 authored 双向绿 → guards 561/268 → run EXIT=0（浏览器战术门 23/7 再次全绿，兼证 lint 重构未破坏试玩栈）→ audit 9755 → postdoc 9757 路径／301 链接。过程现场 attempt40-45 全保留；`git diff` 证实 L14 非本批改动。

**lint 登记（不阻塞）**：（已收口，见上）

## 会话记录：8h 删除级联（2026-10-09，事项③，已修改待验证）

**缺口实锤**：`trials.js #bound` 只有 lazy 路径（下次观测到 `GAME_DELETING` 才 `#close`），`deletionfence.js begin()` 同一事务内无任何 trial 级联；生产 `worker.js` 尚未实例化 fence（仅各 deletion fixture 用），故改动点落在 fence 类自身事务内、未来接线方自动继承。

**改动**：`server/deletionfence.js`——fence INSERT 后同事务 `UPDATE trial_sessions→ended/game-deleting（WHERE game_id＋state=active）＋DELETE trial_assets（子查询限本 game trial）`，`sqlite_master` 存在性守卫（旧库无 trial 表时跳过）；reason/表列契约镜像 `TrialSessions.#close`。`server/trials.js`——`LIMITS`＋文件头注释更新（级联已接线，Q69 仍未闭）。`server/worker.js`——13 处历史字符串拼接机械模板化（`git diff` 证行为等价）＋注释更新。无构造签名/导入变更，既有 fixture 构造不受影响。新工具 `tools/verify_trial_deletion_cascade.mjs`（node:sqlite 直连真实 `GameDeletionFence` 类，三场景）。

**验证**：三场景全绿（同 game 双 active 全清＋异 game 不动＋已结束行原因不变／无 trial 表旧库 fence 照常／失败 409 路径 trial 行资产无损＋无 fence 残留）；`editor_server.mjs` 自检 OK；三文件 `node --check`；lint 零 error（deletionfence L42 一并模板化；`useBlockStatements`/复杂度警告系全文件既有惯用法未动）。**未跑**：完整 workerd gate（deletion-fence/trial 系）与 guards 继任——`before.json` pin 着旧 `deletionfence.js` hash，重跑对应 gate 时须继任。

**调试结论存档**：①桩 `sql.exec` 起初惰性（`.all()` 延至 `toArray()`）致 INSERT 从未执行、`begin` 报 `GAME_NOT_FOUND`——改为立即执行＋缓存行；②`node:sqlite` 无 `db.transaction()`，改显式 BEGIN/COMMIT/ROLLBACK；③新工具初版 `console.log` 触 `no-console` 告警，改仓库 `tlog` 约定。

**兼容性核查（继续轮）**：fence 构造签名未变——两处 fixture-worker 同参构造不受影响；fence fixture 无 trial 表→守卫跳过→fence 行为与改前一致（仅 `before.json` pin 旧 hash，重跑该 gate 时须继任，属预期）；存活代码无一处 pin `LIMITS` 字串值，trial 系 gate 仅断言 state/trialId/状态码——8h 改动对既有 gate 的行为面零影响。完整 workerd gate 重跑＋guards 继任仍待（可并入下批链）。

**下一步**：完整链（deletion-fence/trial 系 gate 重跑＋guards 继任）或并入下批链；之后按序 ④图片 native 讨论、⑤commit/push 授权。无 commit/push；SAVE.DAT 未触。

## 会话记录：lint 清零＋复杂度重构（2026-10-09，与 8h 同批提交）

**范围**：用户指令清 pi-lens !33W（checkpoint-journal.md／verify_trial_deletion_cascade.mjs／deletionfence.js／worker.js／editor-trial-server.md），md 两文件零告警无需改动。
**改动（纯机械，零行为变更）**：模板字面量 14 处；单行 if 加括号（biome --unsafe autofix）；`console.log`→`tlog`；复杂度拆分——fence `begin`→`#checkFenceIdempotency/#assertFenceable/#cascadeTrialsForGame`、trials `issue`→`#checkIssueBinding/#checkChapterState`、`trialChapterAssetGaps`→`portraitGaps/cityViewGaps`＋记录构造子、`copyCommand`→`#recordCopyCommand/#cancelCopy`、`handle`(255)→dispatcher 树（`#gateEntry/#postLogin/#getTrialRoutes/#getPrimaryRoutes/#getCollectionRoutes/#getRecordRoutes/#postEntryRoutes/#postTrialStart/#postTrialEnd/#postAuthMutation` 等 20＋方法，严格保序）、`fetch`→模块函数 `staticAsset`、零散小拆（`contentKey` 循环、`trialRegistryBytes` 分块、`#getDraftRead/#getTrialStatusPack/#getManagementCopy/#getAdminAccounts/#postManagement/#postDraftSave/#postLibraryInstall/#buildPasswordMutation/#buildAccountMutation`）。路由优先级与 fail 码逐段核对：GET 链 trial→primary→collection→record、POST 链 entry→trials→mutation 均与原顺序一致；generic 分支保持“先 match 后 admin”（404/403 不漂移）。
**验证**：`node --check` 全过；级联三场景＋editor 自检全绿；biome 全规则＋复杂度双口径零告警。调试结论：①一次 `#target` 行首误删（即时补回，全文复核）；②`export default {}` 内私方法非法→`staticAsset` 改模块函数；③两处虚构标识（`policyOf`/`userOf`）即时修正——均为提交前自检捕获，未入提交。

**链实捕真回归（2026-10-09，deletecascade-r1 gate）**：dispatcher 重构漏了 `#postTrialStart/#postTrialEnd` 外层路径守卫——trialSessions 在位时劫持全部非 trial POST，改密 `fields` 直接 422（probe 首登后改密步实捕；直连复现定位到 col 251 改密断言）。修法：两方法入口补 `if (!trialStartPath) return null`／`if (trialPath?.[2] !== 'end') return null`；全叶子守卫复核（无条件分发必自守或调用方守）。smoke：login/password/admin-accounts 全 200。修入 commit `7623922`，链锚点跟进（derive diff 仍精确六文件）。

**链封存（2026-10-09，deletecascade-r1）**：derive 6 authored 双向绿 → guards 562/269（561/268＋3 生产改＋新工具双桶）→ gate PASS 12 检查／13 调用（真 workerd＋DO SQLite：静态交叉＋开局＋seed＋fence＋级联＋409＋回放）→ audit 9785 hash-read／7 新 WX → postdoc 9787 路径／5 链接／syntax 7。权威 manifest `saved-source-trial-deletecascade-r1/post-document.json`（`deletionCascadeWired:true/deleteCascade8hProven:true`）。残留：dispatcher 重构跨 lane 全回归（trial/copy/draft/stage 路由）待下批链；Q69/Q70/Q71 仍不称闭包。

**事项④人物头像上传机制（2026-10-09，实施＋单元验证通过）**：`trials.js` 新增 `sniffPortraitMime`（PNG/JPEG 魔数）＋`uploadPreview/uploadCommit`（两阶段，id 形＋保留名＋100KiB＋魔数校验，active-only，409 幂等，manifest.portraits 登记）；`asset()` 扩展非派生行 serve（serve 时魔数嗅探 mime，零 schema 迁移，manifest/chapter 仍 404）；`issue` manifest 增 `portraits: []`；`worker.js` 新增 `POST /api/trials/:id/portraits`（base64≤140000＋op 密封幂等）＋资产路由改走 `served.mime`。验证：新工具 `tools/verify_trial_portrait_upload.mjs` 六场景全绿（真 policy＋stub 端口直连 TrialSessions）＋自检＋lint 零告警。调试结论：初版 `uploadCommit` 返回形状与 worker/tools 调用错位（即时对齐为直接返回 entry）；`TRIAL_ID` 先于 `TRIAL_INVALID`（形检优先，改测用合法未知 UUID）。残留：工作台上传 UI＋武将数据 portrait 引用键＋跨 lane 回归待下批。

**事项④试运行壳上传 UI（2026-10-09，路径 A）**：`servertrialapp.js` 预启动面板新增头像上传区（`mountPortraitUploads`，文件选择＋编号＋上传＋列表预览）：客户端验类型/100K/编号形，FileReader 转 base64，同源 POST `/api/trials/:id/portraits`，成功后重取 pack 刷新列表（`pack` 改 let）；旧快照无 portraits 数组时明示不支持。验证：DOM 桩全流程（初绘／空文件／类型／超限／上传刷新）＋node --check＋lint 零告警；另清 3 处历史拼接。武将数据 portrait 引用键（B 侧）未动。

**束重卷（同批）**：`servertrialapp.js` 改动后重卷试玩束（215 文件，sha `1d2a3acd…`），壳不变。
