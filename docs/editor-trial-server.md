# E-05-SERVER-AUTH-1：服务端 Trial 记录与真实会话认证（考证与设计登记）

本页保留初次考证／设计及下方实施批次，不再代表“尚未实施”。服务端1–7e／8a–8h与后继限定lane、App双规则边界及真实浏览器链已接；当前完整状态与剩余出口见[现行验收清单](editor-completion-audit.md)A20–A22／A32；[小范围审计](editor-closeout-audit.md)只维护其98f0630基线及后继索引，不是当前源码证书。不据本页关闭完整Q69/Q70/Q71/E-05。下方“尚未完成／未接线”只指其历史批次。用户已授权本线程方向（"你判定选择，默认同意授权"）；部署平台不自动选择，实施只接本地真实后端栈，不部署、不用假认证。

## 后继关闭真实编辑页后的独立Trial

既有 `verify_editor_backend_draft_ui.mjs` 新增互斥的 `--trial-close-only --node-service` 范围。自有临时文件SQLite／FileBucket、固定20章副本及登记库、本地HTTPS和全新Chromium；浏览器真实登录后读取修订1，从现行工作台按钮打开子窗口，完成势力选择及实际App的192据点装配。没有成功API替身，也没有用脚本假造opener。

关闭实际编辑页后，子窗口继续收到至少两次真实200状态探测，保同一scenario对象、runtimeEnabled及running gate；关闭期间没有新增Trial POST，原已保存草稿全文保持、浏览器保存请求为0。再用创建Trial的浏览器会话显式结束，子窗口正常清除scenario并显示「已結束」。该3组收据证明这一完整副本及窗口顺序，不替代断网／重登／全部窗口组合、规则步推进或生产环境证明。

首轮已通过关闭后的检查，但末步错误使用Node侧同账号的另一登录会话结束，按既有 `PrivateTrials.#bound` 会话绑定合同返回401；不为测试放宽产品。修为子窗口获取自身会话CSRF并发起结束后，完整r2通过。证据 `.dragon-analysis/editor-completion/trial-editor-close-20261029/` 的 `tests-r1.log`、`tests-r2.log`、`result.json`；603项选定输入SHA前后保持，31项入口指纹及 `ui-r109.png` 摘要核对通过。仅测试及文档变更，未重建束、未重跑默认草稿长链。正式IDB访问与域外请求为0，pageerror为空；本批没有声称所有console／取消资源请求均无错误。工具只关闭自有服务／浏览器，临时资料保留。

语法、diff及链接检查通过。主动LSP脚本仍为push-only未确认；两文档一份clean、一份仅既有摘要／历史标识词典提示。`mode=all`为4条测试风格及3条文档词典hint，缓存不冒clean，未屏蔽或改写正确await语义。

## 后继新草稿保存不替换已运行Trial

同一 `--trial-close-only --node-service` 入口在真实编辑页关闭后，使用已认证的另一会话执行元数据改名保存，实际CAS提交修订1→2；精确读取2确认新名称和原章节全文，读取1仍与原DTO完全相同。子窗口用其创建会话读取Trial状态：保存前后整个状态DTO相同，仍绑定修订1及原快照／manifest，不是只比URL；同一scenario对象保持，没有创建替代Trial或浏览器草稿保存。

首轮在新草稿保存和精确读取后立即要求gate为running失败，未记录当时的详细状态，不能据此归因产品故障。后继完整r2记录该时点 `sameScenario=true / ended=false / runtimeEnabled=true / gate=paused`，随后等待既有monitor自己的有效探测恢复running（30秒预算），再执行原创建会话终止并正常清场。测试没有强行恢复gate、替换场景或放宽身份比较。长同步验证可能延迟探测，但本轮未证明暂停的唯一根因，也不宣称全过程从未暂停；这与新草稿不得热换Trial是不同要求。

完整4组通过，证据 `.dragon-analysis/editor-completion/trial-newer-draft-20261029/`：首轮失败保留于 `tests-r1.log`，最终 `tests-r2.log`／`result.json`，603项选定输入SHA前后相同，31项入口指纹及 `ui-r110.png` 摘要核对通过。沿用自有Node文件SQLite／FileBucket、真实HTTPS登录及全新Chromium；新增写入为真实服务API元数据保存，不冒第二个编辑页表单。未测改动规则资源／全部迟到资源组合、workerd或生产；无产品、原生束、DDL变化，完整A21仍未关闭。语法、diff和链接通过；主动LSP脚本push-only未确认，两文档一clean／一仅词典提示，mode=all为4条既有测试风格与3条文档词典hint，不称全量clean。

## 真实认证协议考证（实锤，行级来源）

- `server/worker.js:52-53`：`users(id,account UNIQUE,role admin|author,password_hash,disabled,must_change,epoch,version)`；`sessions(token_hash PK,user_id,epoch,absolute_until,idle_until)`。
- `server/worker.js:41-43`：cookie 恰好一条 `COOKIE=<64hex>`，否则 401 LOGIN_REQUIRED。
- `server/worker.js:103-107` `principal(tokenHash)`：JOIN sessions×users；`!row||disabled||epoch!==user_epoch||now>=absolute_until||now>=idle_until` → 401 SESSION_INVALID。**epoch bump（改密/禁用）即全会话撤销——Q70 要求的服务端撤销基础设施已存在**。
- `server/worker.js:109-114`：`touch` 滑动 idle（min(absolute)）；登录签发 token＋`csrf=mac('csrf:'+token,secret)`（`server/security.js` HMAC）；`sessionMs/idleMs/rateMs/accountLimit` 来自 env config（`security.js config()`，缺配置 503）。
- 幂等：`operations` 表 sealed_result（AES-GCM/HKDF，`security.js seal/unseal`）；内容侧 `content_operations/content_reservations` 带 `auth_epoch`，epoch 变 → 409 OPERATION_REVOKED（`server/metadata.js:124-127`）。写路径复查 `assertCurrent`＋二次 `principal`（`worker.js:196-208` 风格：id/epoch/role/must_change 漂移 → 401）。
- 管理面：`/api/auth/login|logout|password`、`/api/session`、`/api/admin/accounts`（role=admin）；`/api/auth/password` 改密即 epoch 撤销他会话（paired-epoch 负例在 canonical-root-1 等 scope 实测 401）。

## 草稿快照链考证（实锤）

- `server/drafts.js:36-38`：`draft_requests/draft_objects/draft_references`；save 走 CAS `compareAndSwap(gameId,expected,prepared)`，对象须 verified/committed（`drafts.js:194-203`），成功后以 `games.snapshotReference(tokenHash,gameId,revision)` 落 `rootKey/sourceDigest/dependencyDigest`。
- `server/snapshots.js GameSnapshotVerifier.verifyStored`：stored 单次 parse 验证（canonical-cost-r1 起生产已接）。
- 故「Q68 已保存且通过校验的准确快照」服务端现存表示＝committed 修订＋snapshotReference 三摘要；Trial 绑定此身份即绑定准确修订，不用当前行代旧修订（`drafts.js:72` 注释同款约束）。

## 既有 Trial 切片现状（闭合，各自缺口在原文）

投影基础（trialscope）、单章服务/工作台/真实 App（editor-chapter-trial）、本地内存 App 试运行（editor-local-app-trial）、主动退出处置（editor-trial-discard）、资产库存 staging（editor-trial-asset-inventory）、连接核心/events/规则边界（editor-trial-connection）。上述切片在本页初次设计时的共同缺口是服务端 Trial 对象、会话 epoch 授权、真实 HTTP status adapter、私有资源逐请求授权及孤儿清理；后文实施批次已逐步接入，不能将这份历史缺口清单当作现行未实现清单。当前剩余以页首验收清单为准。

## 服务端设计（工程合同 §7 落地；均为本地后端实现，不部署）

- **表** `trial_sessions`：`trial_id TEXT PK, owner_id TEXT NOT NULL, session_token_hash TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL, draft_revision TEXT NOT NULL, chapter_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, snapshot_digest TEXT NOT NULL, manifest_digest TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','ended')), end_reason TEXT, created_at TEXT NOT NULL, absolute_until INTEGER NOT NULL`。十字段与客户端 gate 冻结字段一一对应（trialId/sessionId/authEpoch/gameId/draftRevision/snapshotId/snapshotDigest/chapterId/manifestDigest/ownerId）；draft_revision 保十进制大数串不转 Number（§7/连接核心同款）。
- **启动** `POST /api/drafts/:gameId/trials`（op_key 幂等＋sealed result 同款）：principal 有效 → 草稿 committed 修订==请求 expectedRevision 且 snapshotReference 三摘要一致（Q68，不一致 412/409 同款）→ `projectTrialChapter` 投影可编译（Q69 支持域，坏引用/缺共享依赖拒）→ 固定快照与 manifest 捕获（沿用 chapter-trial 服务捕获身份，不取最新）→ 插入 active 行，absolute_until 取创建会话的 absolute_until（孤儿按服务端会话绝对期限处理，§7）。仅作者本人（ownerId==principal.id）。
- **逐请求授权**：所有 Trial 私有资源/状态请求带 trial_id；处理＝cookie→principal（401 全条件）→trial 行存在且 owner/epoch/字段精确绑定且 state='active'，否则 401 TRIAL_INVALID（映射连接核心 7 类失效之一，不借道 invalid 字符串推断更多）。**不仅保护启动 URL**（§7）。
- **状态/探测** `GET /api/trials/:id/status`：返回 active/ended 及绑定摘要复核；网络 503/超时绝不返回 401 语义（Q71 客户端单飞 5s/10s 政策在连接核心，本端只给真实状态）。
- **结束**：显式 `POST /api/trials/:id/end`；自动结束＝请求时发现 principal 失效或 epoch 漂移（lazy）＋absolute_until 到期 sweep；游戏删除（management 链）级联结束。终止后仅清理 Trial 派生对象，发布版/当前草稿/其它 Trial 不受影响（§7）。
- **快照固定保留**：Trial active 期间其 snapshot 派生对象不得被新草稿保存/清理覆盖；实施时考证现有 snapshot/对象生命周期后给最小保留机制，不新建平行存储。

## 有界验证计划（实施批次执行，均为实际负例）

启动：未登录/过期/禁用/epoch 漂移 401；非作者 403/404；expectedRevision 不符 412；未保存/未 committed 拒；坏章/坏共享引用/缺依赖拒（Q69 域）；幂等重放同结果、冲突 op_key 409。存续：改密/禁用/退出后下一资源请求 401 TRIAL_INVALID（Q70），503/超时不变 401（Q71）；别的人 trial_id 不可见；结束后再取 401；删除游戏后取 401。清理：absolute_until sweep 只清 Trial 派生；whole35 式 SQL 期待逐案。隔离 restore 仅注册列，不恢复永久 operation。新源走语法＋主动 LSP＋session-all＋静态核签，不拼旧门数。

## 尚未完成与边界

批次1（下节）已接线记录/授权/生命周期，其余无实施。后续：真实 App/工作台接线（启动按钮改走服务端 Trial）、连接核心 status adapter 接真端点、双规则边界与全部 mutating 入口安装、Q69 完整依赖闭包（人物/章节模型）、原生关闭回调投递、部署形态。不宣称 DRM/远程擦除；已缓存私有内容边界如实说明（§7）。生产/玩家默认行为本页不变；无 commit/push/deploy。

## 实施批次1（E-05-SERVER-AUTH-IMPL-1）：记录/授权/生命周期（已接线，待证据scope）

- `server/trials.js`新模块：trial_sessions 表（十字段＋state/end_reason/created_at/absolute_until，manifest_digest 本批 NULL）；issue/commit 两阶段（提交事务内复读 snapshotReference 与 epoch，漂移即 401/409 回滚）；status 返回 active/ended 真实状态并 lazy 结算 session-absolute-expiry；绑定失败（非本人/异会话/异 epoch/删除栅栏）一律 401 TRIAL_INVALID 并 lazy 记 session-revoked/game-deleting；authorize 为 active-only 供后续资源路由；endPreview/endCommit 幂等结束（不同 op_key 重结束返回当前态）。
- `server/worker.js`五处定点插入：POST /api/games/:gameId/trials（fields expectedRevision/chapterId、op 密封幂等、canCommit 后 commit）、GET /api/trials/:id/status（touch 同款）、POST /api/trials/:id/end；CSRF/Origin/must_change 等原闸门原样适用，不新增权限或命名空间。
- 批次边界：私有资源逐请求服务、游戏删除级联、客户端 status adapter 与 App/工作台接线均未做；drafts.read 完整 verify 路径未用于启动（成本）。

## 批次2（E-05-SERVER-AUTH-IMPL-2）：启动投影编译绑定（已接线，证据闭合）

- `server/trials.js`：issue 改为 async——snapshotReference 后 `captureForCompile`（精确修订、事务外）＋`projectTrialChapter`（真实 chapterOrder 成员，副本章 ID 为 `<gameId>#<章>` 命名空间，格式门已含 `#`）＋`compileGameSource(selected)`（Q69 支持域证明）；capture 身份/epoch/profile/三摘要与 reference 逐项绑定（漂移 409/503）；`manifest_digest=selectedSourceDigest`（不再 NULL）；commit 复查 manifestDigest 64hex。`server/worker.js`：trialSessions 移入 blobs 块构造（drafts 端口）、三路由 503 TRIAL_NOT_CONFIGURED 守卫、await issue。
- 功能证据（saved-source-trial-server-native-r2，已闭合）：33 检查／49 实际 HTTP——批次1 矩阵全保＋start-chapter-unknown 422（真实成员判定，`<gameId>#upper-99`）＋每启动 manifestDigest 64hex 绑定与行一致；五张预期写表外逐表 digest 不变；guards 继任 546/255→546/256（trialscope.js 入闭包，priorProtected546/255 谱系）；独立 audit 9298 hash-read／6 新 WX；gate 三次 attempt 均为探针/期待/guards 时序缺陷登记（derive 两次重生成＋guards 一次重生成，现场改名保留）。仍不称 Q69 闭包/Q70/Q71 完成：依赖闭包（人物/TALK/资源）、私有资源服务、删除级联、客户端 adapter 未接线。

## 批次3（E-05-SERVER-AUTH-IMPL-3）：客户端 status adapter（已接线，证据闭合）

- `web/src/editor/trialstatusadapter.js`新模块（零相对import、纯注入，不改服务端）：`createTrialStatusProbe({baseUrl,fetch})` 产出连接核心 monitor 的 probe，真实 GET status 端点；映射：200 active→valid（九服务端字段＋原 sessionId 透传，authEpoch→String，gate 精确复核，异绑定只暂停不热换）、200 ended 四原因→trial-ended/auth-revoked/auth-expired/game-deleted、401 LOGIN_REQUIRED|SESSION_INVALID→auth-invalid、401 TRIAL_INVALID→trial-ended；其余（网络/超时/5xx/坏JSON/未知分类/异trialId）一律抛错只暂停（Q71）。无重试/缓存/默认URL；snapshot-deleted 未发射（服务端未暴露）；App/Trial窗口未接，私有资源服务/删除级联/Q69闭包仍未接线。
- 功能证据（saved-source-trial-server-adapter-r1，已闭合）：44 检查／46 实际 HTTP——真实后端五 Trial 全生命周期七分类映射（active→running、显式结束→trial-ended、改密→auth-invalid、重登录→trial-ended 不复活、lazy 过期→auth-expired、栅栏→trial-ended 后恢复观测→game-deleted、无 cookie→auth-invalid）＋11 项登记 loopback 合成传输负例（Q71：503/坏JSON/未知分类/异trialId 只暂停不终结、超时 abort 实达、断网暂停、代次迟到丢弃、请求形状 GET 无 body、sessionId 透传）；绑定异 manifest 只暂停不热换；五终态行原因精确＋五张预期写表外逐表 digest 不变；guards 继任 546/256→547/256（服务端闭包与既有源不变）；独立 audit 9323 hash-read／6 新 WX；derive/gate/audit 各一次 attempt 登记、现场改名保留（gate1 通过但因 audit 期待 rework 重跑，非失败拼绿）。仍不称 Q70/Q71 完成：App/Trial 窗口与双规则边界安装、私有资源服务、删除级联、Q69 依赖闭包未接线。

## 批次4前考据（E-05-SERVER-AUTH-RESOURCE-1）：试运行资源流与私有资源服务设计（无实施）

本页节为考据与设计登记，**不含实施**；实施批次另行登记 I/O 与验证收据。考据均为行级源码实锤。

### 现行本地试运行资源流（tools/editor_server.mjs，无认证开发服务器）

- `POST /api/compile`：投影（可章 scope）→validate→compileTrialSource→写 build 目录 `build/<rev>/<TRIAL_COMPILER_REVISION>/<studio-app-2|studio-chapter-1/<sha(chapter)>/`（manifest.json/snapshot.json[/saved-source.json]/六资产文件）；不可变——同目录已存在且 digest 异即拒（editor_server.mjs:275-355）。
- `GET /api/trial-pack` → `{manifest, chapterId, terrainHex, chapter}`：manifest 身份（gameId/draftRevision/sourceDigest[/savedSourceDigest]/trialSnapshotId）＋资产目录，章 state 内嵌，terrain 以 hex 内联（editor_server.mjs:356-365）。
- `GET /api/trial-asset?game&revision&digest&asset&scope&chapter` → 六资产（terrain/roadGraph/roadCost/roadOffset/minimapBase/minimapLarge）原始字节；readBuild 逐项复核 build 字节＋manifest 的 sha256/byteLength/url 与 scope 身份（editor_server.mjs:101-136, 366-372）。
- `visualAssets`：公共 `content/builtin/compiled/map-2-<sha>/map_{atlas,tiles}_{season}.png`，编译时核 byteLength＋sha256（editor_server.mjs:139-152）；内置画集内容寻址、非草稿私有。
- 窗口链：`/trial-app`→303→`/trial-game`（App HTML 注入 boot）；trialapp.js 取 pack→`createTrialEnvironment`→`startApp(null,{trial})`。

### 客户端消费（web/src/content/authoring/trialruntime.js，实锤）

manifest compilerRevision/buildFormat/identity/scope 精确绑定；四 `assets`（terrain/roadGraph/roadCost/roadOffset）＋两 `minimapAssets` 的 `/api/trial-asset` URL 六参数精确（scopedAsset 逐参等值）；fullApp 要 visualAssets 公共路径正则＋两 minimap；章 state 内嵌 pack；worldresources 经 URL 取 roadGraph(JSON)/terrain/roadCost/roadOffset 字节与 atlas/minimap 图像。

### 生产后端现状（实锤）

`server/worker.js` 无 trial-pack/trial-asset 路由（批次1-3 仅 start/status/end）；`FixedCopyDataCompiler` 为 scope 'all' 全量编译（datacompiler.js:44 七产物＋chapter_N），产物入 blobs＋`data_compile_objects`（actor/operation 拥有），非章投影、不可复用为试运行资源；批次2 启动已跑 captureForCompile＋projectTrialChapter＋compileGameSource(selected) 作支持域证明但不落盘；服务端小地图可渲染：renderMinimapPixels（纯 web 模块，tools 已用）＋`server/pngio.js` encodePNG。

### 批次4设计（本地后端实现，不部署）

- **派生对象**：启动提交事务内把投影编译输出落为 Trial 派生对象——新表 `trial_assets(trial_id TEXT NOT NULL, asset_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(trial_id,asset_id))`；六资产＋pack manifest JSON＋章 state JSON；结束（显式/lazy/将来删除级联）同事务 DELETE（§7 仅清 Trial 派生对象，不动发布版/草稿/其它 Trial）。
- **`GET /api/trials/:id/pack`**：`authorize`（active-only，lazy 结算与 status 同款）后返回 `{manifest, chapterId, chapter, binding}`；manifest 身份即批次2 绑定（snapshot_digest/manifest_digest/trialId），资产 URL 指向 `/api/trials/:id/assets/:assetId`；binding 十字段供客户端 gate 冻结。
- **`GET /api/trials/:id/assets/:assetId`**：逐请求 `authorize`（401 TRIAL_INVALID；ended/revoked/fenced 不区分）；响应字节与存储 sha256/byte_length 复核；no-store；未知 assetId 404，坏 id 形 422。
- visualAssets 公共路径不私有化（无草稿信息）；503/超时绝不返 401 语义（Q71）。
- **边界**：客户端 pack 消费适配（createTrialEnvironment 的 scopedAsset 现仅认 `/api/trial-asset` 六参数形）与 App/工作台接线属后续批次；Q69 完整依赖闭包（人物/TALK/资源）不在本批；不新建平行存储——派生对象只挂 trial_id 级联，源字节永远来自不可变 content_snapshots 重投影复核。

## 批次4（E-05-SERVER-AUTH-RESOURCE-IMPL-1）：私有资源服务（已接线，证据闭合）

- `server/trials.js`：`trial_assets` 派生对象表＋级联 DELETE；issue 计算八行派生对象（manifest/章 state/terrain/roadGraph/roadCost/roadOffset/minimapBase/minimapLarge，小地图 renderMinimapPixels＋pngio encodePNG 3 通道）并改返 `{trial,derived}`；commit 逐行校验后同事务写入；`authorize` 补 authEpoch 成九字段；`pack`（active-only）返 `{manifest,chapterId,chapter,binding}`，`asset` 逐请求 authorize＋字节复核。`server/worker.js`：pack/assets 两 GET 路由与启动路由接 `{trial,derived}`。visualAssets 公共路径不私有化；Q69 闭包/删除路由级联/客户端 pack 适配/App 接线未做。
- 功能证据（saved-source-trial-server-resource-r1，已闭合）：52 检查／66 实际 HTTP——启动负例面重证、pack 全形状绑定（scope/identity/trialSnapshotId/六资产/九字段 binding/章 state）、六资产字节级复核、结束后两路由 401、改密/重登录/过期/栅栏负例、派生表级联回空、六预期写表外逐表 digest 不变；guards 继任 547/256（闭包成员不变）；独立 audit 9351 hash-read／6 新 WX；gate 两次 attempt 登记现场保留（attempt-1：矩阵实捕 TDZ 遮蔽缺陷——issue 局部 const chapter 遮蔽模块格式门致 500，已修；attempt-2：visualAssets 断言——新考据实锤生产 copy 链不注入 `assets.editorVisuals`，该注入仅开发服务器 copy 时做（editor_server.mjs:237），快照忠实为 null、与开发服务器旧草稿 full-App 边界一致；完整 App 画集需注册表画集端口，列为下批候选）。仍不称 Q70/Q71 完成。

## 批次5前考据（E-05-SERVER-AUTH-VISUALS-1）：注册表画集端口（无实施）

行级实锤：`installedSourcePolicy`（sourcecatalogpolicy.js）冻结 41 角色（`content/builtin/compiled/<revision>/manifest.json` 角色＋38 编译资产含 map_atlas_*/map_tiles_* 的 sha256/byteLength＋实体角色），`policy.revision='map-2-<sha>'`、`policy.registryId='approved-builtin-47e358-entities086-1'`；`InstalledSourceCatalog.loadFull(tokenHash,registryId)` 返回逐读 `#check`（会话＋注册表行，无 admin 门）的 `readWeb(path)`（sourcecatalog.js:85-88）；`FixedCopyImages`（copyimages.js:31-33,48-53）已是同款 copy_origins 注册表绑定＋角色字节复核先例（其 admin 门是 copyimages 自有策略，非 catalog 层）。editorVisuals 形状（开发服务器注入值，editor_builtin_source.mjs:51-53）：`{springAtlas:{url,sha256,byteLength}, seasonAtlases:{四季 manifest 条目}, seasons:{四季条目}}`；客户端 trialruntime 只按公共路径正则读 url。设计：trials.js 增 `catalog`＋`policy` 两端口，issue 内 copy_origins 绑定复核（registry_id/profile_revision/definition_digest，409 TRIAL_SOURCE_CHANGED）→loadFull→读 manifest 角色字节（sha/byteLength 复核）→提取八条目并与 policy.roles 逐项等值（503 TRIAL_VISUALS_BINDING）→写进 manifest 派生行 visualAssets（不再为 null）；无新权限面（所有者试运行绑定＋公开描述符，App 本来就从公共路径取这些字节）；Q69 闭包/删除级联/App 接线仍未做。

## 批次5（E-05-SERVER-AUTH-VISUALS-IMPL-1）：注册表画集端口（已接线，证据闭合）

- `server/trials.js`：构造增 `catalog`＋`policy` 两端口（brand 检查）；`#visuals`——copy_origins 绑定复核（409 TRIAL_SOURCE_CHANGED）→loadFull→manifest 角色字节复核→八条目与 policy.roles 逐项等值（503 TRIAL_VISUALS_BINDING）→editorVisuals 形写进 manifest 派生行（visualAssets 不再为 null）。`server/worker.js`：构造补两端口。无新权限面。
- 功能证据（saved-source-trial-server-visuals-r1，已闭合）：54 检查／66 实际 HTTP——resource-r1 矩阵全保＋visualAssets 描述符正例＋独立 oracle（pinned world-manifest 逐条 deepEqual）＋启动负例面重证＋派生表级联回空＋六预期写表外逐表 digest 不变；guards 继任 547/256（闭包成员不变）；独立 audit 9377 hash-read／6 新 WX；derive 一次 attempt（String.replace `$` 特殊替换缺陷——apply 改函数形式）与 audit 一次 attempt（期待顺序缺陷）登记、现场保留。完整 App 接线/客户端 pack 适配/删除级联/Q69 闭包仍未做，不称 Q70/Q71 完成。

## 批次6（E-05-CLIENT-PACK-IMPL-1）：客户端 pack 消费适配（已接线，证据闭合）

- `web/src/content/authoring/trialruntime.js`：createTrialEnvironment 识别服务端 pack（binding 九字段严校：键集精确、trialId uuid、gameId/draftRevision/chapterId 与 manifest identity 逐项等值、snapshotDigest==savedSourceDigest、manifestDigest==sourceDigest、authEpoch 非负整数）；scopedAsset 增 `/api/trials/:id/assets/:assetId` 精确形（与 binding.trialId 绑定），无 binding 时开发服务器六参数形原样保留；返回携冻结 binding。随本批做画库消费者 pin 最小升级（trialruntime.js 为 19 pin 之一：available-library.txt 单条＋sourcecatalogpolicy.js manifestHash，长度不变外科替换）。App 窗口接线/sessionId/gate 安装/prepareScenario 抓取不在本批。
- 功能证据（saved-source-trial-client-pack-r1，已闭合）：26 检查／12 实际 HTTP——实际后端真 pack＋Node 正例（冻结 binding 回环/world URL 集）＋15 绑定负例＋4 URL 负例＋dev 包回归双向＋terrain 服务不变＋结束后 pack 401；guards 继任 547/256（计数不变）；独立 audit 9404 hash-read／6 新 WX；derive/gate 三次 attempt 登记现场保留（replaceAll 逆序标签交互、画库消费者指纹拒→最小 pin 升级、minimapAssets dev 前缀门漏适配→pin 重卷）。仍不称 Q70/Q71 完成。

## 批次7前考据（E-05-APP-WIRING-1）：App/工作台接线设计（无实施）

本页节为考据与设计登记，**不含实施**；实施子批次另行登记 I/O 与验证收据。

### 现有窗口链路（开发服务器，实锤）

`listtrial.launchListTrial`：点击手势同步 `openWindow('/trial-wait','_blank')`→`opener=null`→compile 身份复核→`location.replace('/trial-app?…')`→303→`/trial-game`（web/index.html 骨架，boot 换为 trialapp.js＋状态标示）；trialapp.js 取 `/api/trial-pack`→`createTrialEnvironment`→`startApp(null,{trial})`（editor_server.mjs:376-392）。

### 生产后端现状（实锤）

- 静态面：worker.js 仅服务管理 UI bundle（`/`＋client/draft/stage/library/catalog/management/stage-assets.js＋style.css），CSP `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; …`（无 img/media/font）；无引擎模块与资产路由。
- 会话响应 `{user, csrf}`——无会话 id 字段；CSRF token 是登录期 opaque 标记、客户端已持有、随会话撤销。
- 工作台：draft.txt（认证草稿 UI：游戏列表/载入/保存/操作查询重试）无试运行入口；开发工作台（studio.js）在开发服务器栈，与本线程分立。
- 资源面：引擎 src 213 文件约 2.4MB（可构建期打包文本图）；公共画集 41 角色在 installed-source 注册表 R2；398 运行资源＋font 附档在 available-library 注册表 R2（E-05-TRIAL-ASSET-INVENTORY 即为试运行资源库存）；两注册表在 EDITOR_BLOBS 块内均已就位。
- 已就位件：批次1-5 服务端 Trial/pack/assets/画集、批次3 status adapter、批次6 pack 消费适配、trialconnection 三件套、trialruleboundaries（未装 App）、trial-discard 处置。

### 批次7设计（本地后端实现，不部署；分解为 7b/7c/7d/7e）

- **7b 壳与路由**：worker.js 增 `GET /trial-wait`（静态等待页）＋`GET /trial-app?trial=<uuid>`（壳 HTML——同 index.html 骨架、`<base href="/trial-web/"`、boot 换为 trialboot 模块、「草稿試運行」标示、正式存读禁能注入、壳级 CSP 最小放宽 `img-src/media-src/font-src 'self'`）＋`GET /trial-web/<path>` 统一 web 内容路由：web/src/** 来自构建期打包文本图（sha 复核响应头），`content/builtin/compiled/**` 映射 installed-source 角色，`music/font/intro/kao/…` 等映射 available-library 角色（404 拒、无静默回退、角色 sha/byteLength 复核、no-store）；会话门（401 全条件），公共字节不绑 trial（§7 只要求私有资源绑定，pack/六资产已是）。
- **7c 启动与工作台**：draft.txt 增「測試運行」（从已载入草稿的 chapterOrder 选章→点击手势开等待页→POST start→`location.replace('/trial-app?trial=<trialId>')`；opener=null、被拦显示重试、失败只关本次等待窗口——listtrial 同款纪律）；**sessionId=当前会话 CSRF token**（登录期 opaque，仅客户端比较、永不作为身份外传）。
- **7d 窗口运行与守门**：trialboot 模块——`GET pack`→`createTrialEnvironment({fullApp:true})`→势力选择→`startApp(null,{trial})`；gate 冻结 10 字段（pack.binding 9＋sessionId）→monitor（批次3 adapter probe）＋events adapter（visibility/offline/online）＋双规则边界安装（TrialStrategicClock/createTrialBattleFrames，main.js/BattleView opt-in 注入点按 rule-boundaries 登记）＋终态处置（trial-discard 丢弃进度＋提示重新登录，重登录只开新 Trial）。
- **7e 浏览器证据**：全新 Chromium profile 对真实后端：启动→boot→运行→断网暂停→恢复确认续行→改密终态不复活→显式结束；IDB spy 0、console/page/outside 错误 0；正式匿名游戏行为不变。

### 边界

引擎代码与公共资产对任何有效会话可读（管理 UI 同款门；真实部署形态不在范围）；`/trial-web` 只读白名单、404 拒未知、无目录列举；App 全部 mutating 入口/hold 所有权安装属 7d 逐点登记，浏览器证据属 7e；本页不宣称 Q70/Q71 完成、不部署、不改玩家默认行为。

## 批次7b（E-05-APP-WIRING-IMPL-7B）：试运行壳与统一 web 路由（已接线，证据闭合）

- `tools/build_trial_web_bundle.mjs` 构建单文本束 `server/public/trialweb.txt`（web/src 全树＋intro/styles.css，逐文件 sha/长度/束 sha）与壳模板 `server/public/trialapp.txt`（index.html 骨架、剥 favicon、boot 换 servertrialapp 引用＋标示）。`server/worker.js`：`GET /api/trial/wait` 等待页、`GET /api/trial/web/?trial=<uuid>` 壳（会话 cookie Path=/api 覆盖的挂载点，零认证面变更；壳级 CSP 放宽 img/media/font 'self'，管理 UI CSP 不变）、`GET /api/trial/web/<path>` 统一只读路由（束映射＋`trialRegistryBytes` 两注册表角色 R2 分块直读、会话门、遍历/未知 404、sha 复核、no-store）。
- 功能证据（saved-source-trial-app-shell-r1，已闭合）：23 检查／26 实际 HTTP——壳三路由全负例、CSP 壳/管理端差异、束 oracle 全 214 文件、三类内容（束模块/installed-source atlas/available-library 字体音乐）逐字节等同磁盘与钉住角色、boot 模块 pending 404、壳重生成 oracle；guards 继任 547/256→550/258；独立 audit 9434 hash-read／6 新 WX；derive/gate 各一次 attempt 登记现场保留（prior 过期密封、createHash 未导入→500 实捕已修）。boot 模块/工作台按钮/App 接线（7c/7d）仍未做，不称 Q70/Q71 完成。

## 批次7c（E-05-APP-WIRING-IMPL-7C）：窗口 boot 与战略 clock 边界安装（已接线，证据闭合）

- `web/src/editor/servertrialapp.js`：?trial→session（csrf=sessionId）→pack→势力选择→createTrialEnvironment→gate 十字段（buildServerTrialBinding 导出）→monitor/events adapter→startApp({...env,gate})→终态观察（dispose＋returnToTitle＋重登录提示）/暂停保进度/运行状态行。`web/src/main.js`：startApp trial 分支 `app.trialGate`，clock 创建点按 trialGate 选 TrialStrategicClock（原选项不变；匿名路径不变）。束重生成 215 文件＋画库 pin 升级 20 条（main.js＋servertrialapp.js，policy 三处）。战术帧边界/工作台按钮属 7d、浏览器证据属 7e。
- 功能证据（saved-source-trial-app-boot-r1，已闭合）：17 检查／25 实际 HTTP——束 oracle、binding 十字段与负例、入口负例、真实后端完整 boot-flow（running、offline 暂停/online 恢复、改密终态恰一次处置＋标示、重登录不复活）、main.js 安装点静态复核、20 消费者 pin oracle、终态行 session-revoked；guards 继任 550/258→551/258；独立 audit 9462 hash-read／6 新 WX；gate 五次 attempt 登记现场保留。仍不称 Q70/Q71 完成：动态 App boot/工作台按钮/战术帧边界与浏览器证据未做。

## 批次7d（E-05-APP-WIRING-IMPL-7D）：工作台按钮与战术帧边界（已接线，证据闭合）

- `server/public/draft.txt`＋`index.html`：測試運行本章——章选择（载入捕获命名空间章）→手势开等待页→POST start→身份严校→壳导航；被拦重试、失败只关本次等待窗口。`web/src/render/battleview.js`：`createTrialBattleFrames` opt-in 安装（trialGate 存在时 loop 走边界，isHeld=战术自身 runtime 判据，不用战略 hold）；匿名路径不变。束重生成＋画库 pin 更新（battleview.js）。
- 功能证据（saved-source-trial-workbench-r1，已闭合）：9 检查／14 实际 HTTP——载入填章＋按钮启用、点击开等待页 opener null＋真实 trial active＋壳导航、被拦提示、坏章关窗、rigged 身份拒、battleview 安装点、束 oracle、pin oracle、终态行 explicit＋rigged active；guards 继任 551/258；独立 audit 9492 hash-read／6 新 WX；derive/gate 多次 attempt 登记现场保留。仍不称 Q70/Q71 完成：动态 App boot/战斗与浏览器证据未做。

## 批次7e（E-05-APP-WIRING-IMPL-7E）：Q70/Q71 浏览器证据（已接线，证据闭合）

- `tools/verify_editor_server_trial_browser.mjs`：Playwright 全新 context 对真实后端——管理端登录→draft 载入→点击測試運行本章→popup 壳→势力选择→App 运行（trialGate running＋clock.hour 递增）→offline 暂停 hour 冻结→online 恢复→页1 改密→ended/auth-invalid＋returnToTitle＋已結束标示→重开不复活→trial B 显式 end→ended/trial-ended；IDB spy 0、console/page/outside 错误 0。正式匿名游戏边界登记（开发服务器栈不变）。
- 功能证据（saved-source-trial-browser-r1，已闭合）：harness 15 检查／7 Node 调用全绿（running 递增／offline 冻结双读／online 恢复／改密终态＋已結束标示／不复活／trial B 显式 end 终态处置），gate probe 10 检查（束 oracle 215、20 pin oracle、CSP/cityIcon/openApp 静态断言、receipt 复核），独立 audit 9527 hash-read／9 新 WX；guards 继任 552/259（新工具入库）。仍不称 Q70/Q71 全部完成：战术帧动态浏览器证据未做。

## 批次7e（E-05-APP-WIRING-IMPL-7E）：Q70/Q71 浏览器证据（已闭合——修复与诊断细节）

- `tools/verify_editor_server_trial_browser.mjs`（Playwright 全新 context）已建成并定稿全绿：15 检查／7 Node 调用（登录→载入→点击→壳→势力→运行递增→offline 冻结双读→online 恢复→改密终态 trial-ended＋标示→不复活→trial B running→显式 end 终态处置 trialEnded/runtime false/scenario 清除＋已結束标示→IDB spy 0／未分类 console·page·outside 错误 0）。R10 四项待办全部解决：①`worker.js` trialHeaders CSP `style-src` 改 `'self' 'unsafe-inline'`（仅壳路由，管理端 headers 与严格 script-src 不变——壳模板内联 style＋势力面板 cssText 此前被阻断）；②'window-dispose' 实锤为 harness 竞态非产品缺陷——gate 首个探测（t≈400ms）即报 running（monitor 独立轮询），harness 在 App boot 中途 POST end→endCommit 级联删 trial_assets→boot 关键路径 minimapBase 401 TRIAL_INVALID→openApp reject→boot 失败处置 window-dispose（幂等先到胜出，服务端行仍 explicit；init-script 调用栈捕获实证来自 servertrialapp.js openApp catch，页面无 pagehide）；harness 修为 trial B 在 POST end 前等 scenario 就绪＋clock 递增（与 trial A 同强度）；③错误分类按 URL＋时序绑定实现（预登录 /api/session 401 探测、offline 窗口 ERR_INTERNET_DISCONNECTED、改密后 trial A status 401=Q70 终态信号本身、revive pack 401=不复活裁决、trial-wait 页 502=miniflare 并发编译饱和代理 flake 与 capture 线程 UNKNOWN 502 同族非产品、trial B 结束后迟到资源 401=授权边界设计证据），receipt 记 classifiedExpected 计数；④剩余检查已补齐并转正式断言。另实锤并修复真缺陷：offline 窗口期公共资产加载被打断→broken Image→`mapview.js` cityIcon fallback（resourcePorts===null 路径）无 .ok 守卫致 drawImage InvalidStateError 风暴（强制复现 205 次拿栈 RetainedLayers.finish←MapView.draw），并连带终态 returnToTitle 内 draw 抛错吞 dragon-trial-ended 派发；已改 {img,ok} entry＋onload 置 ok＋未就绪返回 null（对齐 march/engage fallback 模式，不动加载/重试语义）。pin/束已重卷（mapview.js；guards 未继任，7e scope 统一走）。诊断现场全部保留（diag1-3＋attempt1-6 轮次目录＋attempt1-failure/receipt/截图）。调参依据见 R10 交接（draft/启动 ~40-50s 须 120s、option state:'attached'、终态原因两路径、offline 沉降）。

## 批次8前考据（E-05-Q69-CLOSURE-1）：完整依赖闭包设计（无实施）

本页节为考据与设计登记，**不含实施**；实施子批次另行登记 I/O 与验证收据。

### 已就位（实锤，各有闭合 scope）

- 固定库存：`trialassetpaths.js` 398 路径（battle 四 JSON＋talk/battle_talk/battle_display、3 layout terrain＋units、150 kao、15 kyo、120 march、4 engage、8 weather、16 disaster、UI 组、font、gameover、END_s1..12、playback＋11 FLAC＋2 WAV），available-library 注册表 R2 钉住；`decodeTrialAssetManifest` mode 明确 `STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE`，20 个 G127/255 引用登记为未闭合（未补图/未猜哨兵/未套别人头像）。
- 服务面：批次7b `/api/trial/web/` 统一只读路由——会话门后束命中或注册表回退（`content/builtin/compiled/`→installedSources，其余→availableLibrary），逐字节 sha/byteLength 复核＋`X-Content-SHA256`，未知路径 404，no-store；公共字节绑会话不绑 trial（7b 设计决定，§7 只要求私有资源绑定）。
- 私有面：批次4 pack＋六资产与批次5 visualAssets 八条目在 trial_assets 派生表，逐请求 authorize（401 TRIAL_INVALID），结束级联删除。
- 战略侧动态证据：批次7e 浏览器实证公共资产（kao/icon/font/playback 等）经壳路由实际抵达。

### 运行时加载域枚举（Web 调用点实锤）

- 固定共享（章无关）：battle 四 JSON（main.js:124-127 eager）＋battleview.js:194-197 四件（layout 来自固定 battle_maps.json，域 0..2 由该固定表限定）；talk.json（main.js:128＋talk.js:17 懒加载；章侧唯一入口 talk_idx `% mod` 回落）；UI 图标组/ivent 0-2（gamebar.js:192-209/4375）；weather 0-7（weatherpresentation.js:31）；disaster fire/riot 0-7（disasterpresentation.js:13）；march（mapview.js:20-26 safeStyle 取模钳 0..23）＋engage 0-3＋city icon 3（mapimages.js ROLE 门）；battle_status/unit 经动态 backgroundImage（battleview.js:825/838-840），battle_symbol 0..15/formation_stone 为 index.html CSS `url(...)` 引用；END_s1..12/gameover（endview.js）；Oswald font；playback.json＋BGM（music.js `import.meta.url` 相对）；ynsound record3/13（speaker.js）。openview 仅经 `startApp(opening,…)` 的 opening 参数，trial boot 传 null（servertrialapp.js:35；main.js:983 `opening?.`），试玩不可达。
- **章数据依赖域（闭包核心缺口）**：①`kao/{portrait byte}.png`——world.js:219 君主头像、startmenu 军师缓存、battleview.js:662 战术对白 speaker 等多入口；域＝章 state 全部武将 G01 byte。②`grf/kyo_{city.view}.png`——gamebar.js:726 `String(city.view??0).padStart(2,'0')`；域＝章 state 全部 city view byte（库存批已实证 20 章 192 city 全部有资源，见 editor-trial-asset-inventory）。

### 人物/FF 原证状态（G127 处置决定前不得实现任何补图/回退）

- 普通头像选择域 0..92h，93h 为 NPC 常量；FF 为特定占位（re-notes-entity-fields 头像行）。通用四缓存 reader 07D2 **无 FF 早退**；8EA0 君主+军师显示 caller 局部 `3CFF/7406` 仅跳过军师侧 FF；8FC9 自定入口 FF→写 91h；FF miss 请求 KAOGRF 越界 offset 522240（已签 150 记录文件无此条），DOS 短读/像素状态未认证；14 个 E8 候选 caller 域未闭合，完整 G127 可达性**未知**（re-notes-portrait-reader）。
- G127 是多用途兼容记录（无军师/自定义军师取决于名字与路径，re-notes-entity-fields:48-54）；`4F8A→52D7` 临时城防消费者存在；不能按 attr0/inactive 跳过。

### 批次8设计（本地实现，不部署；分解 8a/8b/8c/8d）

- **8a 库存覆盖机械证明**：每运行时加载点→路径域→库存行的对照工具（含 CSS 19 URL、directImage、动态 backgroundImage、`import.meta.url` 音频——inventory 已单列但未机械绑定）；输出权威对照表入 editor-trial-asset-inventory.md。纯静态考据，无生产改动。
- **8b 章依赖启动门（缺失拒收）**：trials.js issue 在 compile 后校验所选章全部武将 portrait byte 与全部 city view byte 落在捕获集（kao 实际行＋kyo 00..14），缺则拒启动（Q69 域 422）；draft 章不假设继承内置字节。在 8c 决定前 portrait∉捕获集（含 255）一律拒——这不是规则断言，是缺资产保守拒，与现 manifest 未闭合登记一致。
- **8c G127/255 处置（前置未决）**：三选一——(i) 原证闭合试玩场景 G127 不可达（14 caller 域，RE 大项）；(ii) 定义 active 判据后启动拒；(iii) Web 产品决定对特定 caller 对齐 8EA0 局部 FF 跳过语义。未批准/未闭合前不得实现任何补图/套用/哨兵猜测。
- **8d TALK 与终局序列边界**：talk_idx 全域 `% mod` 回落的数据域审计或启动门；gameover/END_s 在试玩的可达性考据（败北可达→已在库；通关结局在单章试玩是否可达须证）。

### 边界

本页不宣称 Q69 闭包完成；8a-8d 各自须完整证据链。不放宽原证/初始化/profile 门；FF/255 任何处置须先原证或明确产品决定；公共字节绑会话不绑 trial 的边界在闭包证书中如实登记，不冒充私有绑定。

## 批次8a（E-05-Q69-CLOSURE-IMPL-8A）：库存覆盖机械证明＋大小写错位修复（已闭合）

- `tools/audit_editor_trial_asset_coverage.mjs`（新工具）：19 加载点「源码锚→路径域→大小写敏感库存成员」机械证明，394 产出＋4 保守超集＝398 全覆盖；数据依赖域按钉住内置 20 章求值（kao：2560 武将/147 distinct byte，缺失集逐字节==manifest 登记 20 个 G127/255；kyo：3840 city view 全在库；battle layout 域由固定 battle_maps.json 214 项限定 {0,1,2}）。权威对照表入[库存页](editor-trial-asset-inventory.md)。
- **实证发现并已修真缺陷**：库存 12 个 `grf/END_s*` 键大写与磁盘/运行时小写实际名错位（trial 路由小写请求 404、endview 静默吞缺图）；`trialassetpaths.js` 改小写＋stager consumerPaths 补 servertrialapp.js（producer 漂移修复），manifest 重卷 730442cb…→70acce54…（93632 字节不变，diff 恰为 12 键 case＋两 programHash），sourcecatalogpolicy manifestHash 继任、束重卷 215 文件（仅 trialassetpaths 一项变）。registryId 名保持（opaque 名 vs manifestDigest 内容绑定，决定登记于库存页）。
- **HTTP 实证**：`tools/verify_editor_trial_web_assets.mjs`（新工具）真实后端 6 检查／12 调用——小写 end_s 200 字节==磁盘＋sha 头一致、大写变体 404、kao/255 维持 404、基线行不变、匿名 401。
- 证据 scope saved-source-trial-asset-coverage-r1；guards 552/259→554/261（两新工具入库）。仍不称 Q69 闭包完成：8b 章依赖启动门／8c G127/255 处置（前置未决）／8d TALK 域与终局序列未做；主 goal active，无 commit/push。

## 批次8b（E-05-Q69-CLOSURE-IMPL-8B）：章依赖启动门（缺失拒收，已闭合）

- `server/trials.js`：issue 在 compile 与 chapterState 校验后、derived 构建与 insert 前调用新导出纯函数 `trialChapterAssetGaps(state)`——章 state 全部武将 portrait byte 须落在捕获集 kao 0..149、全部 city view byte 须落在 kyo 00..14（捕获集由 `FIXED_TRIAL_ASSET_PATHS` 单一真源派生，无硬编码区间）；任一缺失 `fail(422, 'TRIAL_CHAPTER_ASSET_MISSING')`，不写 trial 行。generals/cities 非数组并入 TRIAL_CHAPTER。含 255 一律拒——缺资产保守拒（8c 前置未决），不是规则断言，与 manifest 未闭合登记一致。
- **后果登记**：内置 20 章每章恰携一条 G127/255 记录（单元实证 20 章 20 缺口逐字节==staged manifest unresolvedReferences），故 8c 处置决定前全部内置派生章启动被拒 422；7d 按钮流程与 7e 浏览器 harness 在本批后不可重放绿（其 scope 为已密封历史证据）。此为批次8设计明定的保守拒，8c 解除。
- 顺带 lint 修复：预存字符串拼接 `stem + season + '.png'` 转模板字面量（行为等同；行移位使预存 advisory 归入本轮阻断，按最小转换消除）。
- 新工具 `tools/verify_editor_trial_asset_gate.mjs <round>`：单元域（合成净态 0 缺口／合成五缺口精确形／内置 20 章恰 20 个 G127/255 缺口／库存 398）＋真实后端（匿名 401 先于资产门、内置章 issue 两次 422 TRIAL_CHAPTER_ASSET_MISSING 且无 trialId 泄漏）；17 检查／11 实际调用。证据 scope saved-source-trial-asset-gate-r1；guards 554/261→555/262。仍不称 Q69 闭包完成：8c/8d 未做。

## 批次8c（E-05-Q69-CLOSURE-IMPL-8C）：G127/255 哨兵排除（已实施，用户裁决 B）

- **裁决记录（Web 产品决定，非原版机制）**：用户 2026-10-08 裁决选项 B 哨兵排除，窄判据——仅 slot 127 且 portrait byte 255（与 staged manifest 登记形态逐字节一致：slot 127／portrait 255／kao/255.png）。原版 FF/255 语义未知（14 caller 域未闭合），此排除不是原版规则断言，不猜哨兵语义、不补图、不套用其它头像。
- `server/trials.js`：`trialChapterAssetGaps` 首行排除哨兵形态（`TRIAL_SENTINEL_SLOT=127`／`TRIAL_SENTINEL_PORTRAIT=255` 常量，`idx===127 && portrait===255` 即 `continue`）；其它缺失（含其它槽位 255）仍入缺口，issue 仍 422 `TRIAL_CHAPTER_ASSET_MISSING`。staged manifest 仍登记 20 条未闭合引用，库仍为 `STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE`（门与库登记的 divergence 系产品决定明示，非闭包证书）。
- **后果登记**：全部 20 内置派生章缺口清零，issue 放行（200 含 trialId，status active）；8b 的 422 拒收断言成为历史证据（其 scope 已密封，不重放）。7e 浏览器 harness 仍为已密封历史证据。
- 新工具 `tools/verify_editor_trial_sentinel_gate.mjs <round>`：单元域（合成净态 0 缺口／合成四缺口精确形＋255 已排除／它槽 255 仍缺口／内置 20 章 0 缺口＋20 哨兵计数／库存 398／manifest 未闭合仍 20）＋真实后端（匿名 401 先于资产门、内置章 issue 200 含 trialId 且终态 active、status 200 active）；19 检查／11 实际调用。证据 scope saved-source-trial-sentinel-r1；guards 555/262→556/263。仍不称 Q69 闭包完成：8d TALK 域与终局序列未做；链 seal 待其它线程 guard 漂移消解后自 gate 起重跑，主 goal active，无 commit/push。

## 后继Trial共享画像字节路径

**代码缺口与修复**：`trialPortraits` 给覆盖画像登记 `kao/<assetId>.png`；`createTrialEnvironment` 经 `buildPortraitOverrides` 保留此相对URL，Trial页面位于 `/api/trial/web/`。此前 `EditorMetadata.#getTrialWebFile` 把PNG交给旧固定资源库读取，而 `available-library-8993b360.txt` 的398个resources及supportingFiles均没有 `kao/p0001.png`；编辑器预览／正式玩家的共享画像成功不能证明该路径可用。另核150个数字ID的共享清单SHA／长度与旧固定库逐项一致；不是全621张PNG的新实读证书。

现在配置了既有受信 `readSharedPortrait` 的宿主，Trial的 `kao/<ID>.png` 先经 `GamePortraits.get` 查621张共享清单，再读取固定文件并核长度／SHA，返回image/png、no-store、nosniff及摘要。读取成功或失败后都复核principal，撤销返回401；未知ID在读取前拒绝，损坏字节不退回旧库。URL路径与原查询白名单不放宽。VPS的普通／冻结服务沿既有固定ID→文件Map注入，无新路径参数、上传、远端兜底或图片写入。未配置读取器的宿主保持原注册库路径，不宣称它已支持扩展画像。该共享静态路径沿原登录门，不新增trialId／gameId上下文，也不是新建Trial或全部依赖闭包证明。

复用 `verify_editor_template_root.mjs --portrait-epoch-only`：真实共同Request、会话／CSRF与文件SQLite，真实Node适配器分别读取0和p0001的编辑器预览及Trial相对路径，两路正文逐字节相同并核清单长度／SHA、PNG头和响应头；匿名401。错误查询／未知ID零读取、同长度坏字节503，新增Trial路径成功／抛错两种读取中epoch撤销均401，既有预览、使用标记与删除栅栏回归保留。actor／使用资料／坏读取器及撤销时机为显式夹具；不安装固定资源、不读对象桶、不是真实登录／HTTPS／浏览器或完整App运行。

`trial-shared-portrait-before.log` 在旧路径得到TRIAL_WEB_PATH而非进入共享读取器，负控失败保留；调整后16组通过（原12＋两路字节两组＋Trial撤销两组），shell65通过。产物、固定输入、诊断见 `.dragon-analysis/editor-completion/trial-shared-portrait-final-hashes.json`。本批只改共同服务路由、既有测试及文档，不改画像清单／PNG、Vue、Web引擎、Trial清单格式、DDL或两束；不重复无影响规则／发布长链。该路由批尚未验证实际保存p0001→Trial创建→App显示；后继限定链见下节，全部消费者仍未闭合。

## 后继Trial注册资源迟到响应的会话复核

`server/editorapp.js` 的 `/api/trial/web/` 注册资源出口此前在 `trialRegistryBytes` 异步读取后直接返回字节，与共享画像分支的后置principal检查不一致。现成功返回前重新核会话；读取抛错时也先核权限，已撤销优先401，仍有效则保留原错误。覆盖固定源与可用资源库两种catalog分支，不改变注册资源解码／SHA、资源路径、Trial快照、公开玩家出口或游戏规则。该出口是会话授权的只读共用资源，不新增trialId绑定，也不宣称它证明整个Trial依赖闭包。

复用 `verify_editor_template_root.mjs --portrait-epoch-only`：先行 `before.log` 在epoch于读取中改变时复现 **200而非401**；修后 `after-r2.log` **46组通过**（原28＋16注册读取负控＋2正常权限对照）。四种权限变化（epoch、disabled、absoluteUntil、idleUntil）×两catalog路径×成功／抛错，各迟到响应与随后请求均401，后请求零新增字节读取；显式权限变化及游戏元数据保持。另核有效权限下原字节／SHA／no-store仍200，原读取错误仍503。原画像／使用标记／删除栅栏测试保持。

这是实际共同Request派发与自有文件SQLite，注册字节端口及权限变更时机是明确夹具，没有安装／读取注册blob，不是实网撤销、真实墙钟到期、浏览器或全Trial认证。证据目录 `.dragon-analysis/editor-completion/trial-registry-authority-20261029/`，154项选定源码／资源SHA前后保持；两代码语法、shell65通过。主动LSP两代码push-only未确认，不作clean结论。无Vue、DDL、web/src或束改动，不重建无关程序束、不重复无影响规则／发布长链。A21／A29仍部分。

## 后继共享画像保存至Trial App展示

复用 `tools/verify_trial_app_boot.mjs <round> --node-portrait`，保原workerd默认模式，新增自有Node SQLite／FileBucket＋HTTPS分支；来源暂存使用既有工具及严格条件写适配，不改变产品FileBucket合同。真实登录／初始改密、41来源与固定库安装、完整复制20章、读取修订1之后，以唯一 `portrait` 命令和If-Match1保存首章原槽0的p0001覆盖至修订2。精确读2核全部章节DTO只有该portraitKey改变，旧修订1全文保持，再按已保存修订2实际创建Trial。

沿既有同源代理注入已认证管理员会话，原样转送API正文与资源；本批补透传缓存／摘要／nosniff响应头。新Chromium会话阻止Service Worker、只允许自有origin／Blob，子进程环境显式白名单，任何IndexedDB访问都报错。实际加载现行Trial壳及原生束，选择势力、启动完整App，核192据点与六派生资源到齐。随后直接调用既有 `gamebar.showGeneralCard` 展示方法（不下规则命令、不构造替代Image），核运行人物保原portrait byte和p0001覆盖、真实卡片Image的当前URL及120×120解码尺寸。此调用不是菜单点击导航的验收。

`attempt101` **26项通过**；实际 `/api/trial/web/kao/p0001.png` 一次200，27060B，代理取得的完整响应正文SHA及响应声明均为 `67b13e325fc3adea9e8a74b45d192a83d6d5aebf040b3d7200a9c201a34ba147`，image/png、no-store。`loaded.png` 保留实际卡片画布；结束Trial后页面无异常、正式IDB访问仍0。无成功API回包或图片替换，账号登录发生在Node请求端，浏览器会话由代理注入，不冒浏览器登录UI／原生公网TLS证明。也不冒全621画像、战术／其它显示消费者、完整战役或发布／存档验证。

证据：`.dragon-analysis/editor-phase/trial-app-boot-r1/attempt101/receipt.json`、`traffic.log`及四阶段截图；24个执行前源码／资源SHA在结束时逐项重核。首轮 `attempt100` 在暂存阶段因测试直接传R2条件写选项给FileBucket而失败，`trial-shared-portrait-app-r100.log` 保留；改用现有入口的 `{etagDoesNotMatch:'*'}`→Headers条件写转换后r101通过，没有放宽产品门或断言。最终诊断／指纹见 `trial-shared-portrait-app-final-hashes.json`。

本批仅既有验证入口及文档变化，未改产品、画像、库身份或两束，不重建、不重复无影响工作台／发布／规则长链；原workerd默认模式本批未跑。A16／A20／A21／A32仍按整体审计范围判断，不能由一个图片消费链宣布全部完成。

## 后继当前Trial启动与显式终止完整复验

`node tools/verify_trial_app_boot.mjs 111 --node-portrait` 当前入口 **27项通过**。保留真实登录／改密、固定源与库安装、20章完整副本、p0001保存1→2、精确读取两修订、实际Trial创建及同源代理后的完整App加载链；192据点、六派生资源到齐、p0001正文／声明SHA与120×120图片解码均通过。Node文件SQLite／FileBucket和自有HTTPS处理真实业务，浏览器仍经本地HTTP代理注入已认证会话，不能称浏览器登录UI或公网TLS验证。

本次仅增强既有结束步骤：不再以固定等待15秒且页面无异常代替进度丢弃证明；明确结束后限时等待实际App的`trialEnded=true`、`runtimeEnabled=false`、`scenario=null`与“已結束”提示，并断言`trialGate.state=ended`。结束前资源及页面错误检查、全程正式IndexedDB访问0／域外请求0保持。结束后的网络错误列表未新增零错误断言，不把预期授权失败或未核请求混称全部网络成功；未测试重新登录复活、断网／战术帧或其它关闭原因。

证据：`.dragon-analysis/editor-phase/trial-app-boot-r1/attempt111/`保存24项入口指纹、27项收据、HTTP记录／代理流量和四阶段截图；`.dragon-analysis/editor-completion/trial-current-boot-20261029/`保存日志及557项选定源码／固定内容前后SHA，均保持。自有临时数据库与对象目录不覆盖用户内容；finally关闭本测试服务、浏览器和数据库，原工具保留临时资料，未声称物理回收。

未修改产品、默认源、库身份或束，不重复无影响构建／规则回归。本轮关闭的是当前Node启动至显式终止的限定出口，不能替代全部章节／资源消费者、workerd默认模式、浏览器认证或完整A20–A22／A32验收。

## 后继章节依赖检查先于派生资源生成

`TrialSessions.issue` 保留身份、删除栅栏、精确快照绑定、单章投影及结构编译的原顺序；编译成功后立即执行既有 `#checkChapterState` 和 `trialPortraits`，通过后才分配trialId、生成小地图PNG并读取注册表视觉资源。原先这些章节检查位于视觉资源读取之后，已知缺图章仍会支付无用生成／读取成本。此处只提前现有拒收，不增加允许域、默认画像或新的规则检查；若章节依赖与视觉来源同时异常，现在先报章节依赖错误。合法章的清单、快照、提交复核及原键协议不变。

复用 `tools/verify_vps_trial.mjs`，在既有真实41角色安装、草稿装配及正常Trial issue／commit／serve／end链前增加三种候选：普通槽portrait byte255、city view255、显式portraitKey字符串255。候选捕获及对应sourceDigest是明确内存端口夹具，并非这些非法内容已经通过实际草稿保存；身份／所有权及删除栅栏仍调用实际元数据端口。视觉capture观察口一旦被调用即失败。前两种保持 `TRIAL_CHAPTER_ASSET_MISSING`，第三种保持共同画像收集器的 `PLAY_PORTRAIT_CORRUPT`，均须视觉capture零次、trial_sessions／trial_assets／content_games全文不变、候选与原源摘要不变。

证据位于 `.dragon-analysis/editor-completion/trial-preflight-*.log`：`before.log` 六项失败复现旧路径先到视觉capture；调整后 `after.log` **29项通过**（原20＋9），正常章仍走实际安装资源及创建、读取、终止、会话撤销／跨作者拒绝链。既有章节报告10项、shell65通过。真实SQLite内存库与自有临时FileBucket；principal及三个坏候选是显式夹具，不冒登录／HTTP／浏览器、所有20章Trial或完整依赖闭包。

源码、诊断和最终复核记录见 `trial-preflight-final-hashes.json`。本批没有改Web引擎、画像／城市图资源、Vue、DDL或生成束，不重建两束，不重复无影响规则、浏览器、发布长链。A20／A21／A32及完整编辑器仍未完成。

## 后继单章隔离与坏章拒收联合复核

在上述同一 `verify_vps_trial.mjs` 入口增加反向案例，无产品改动：从实际已保存源捕获副本，仅将末章普通槽画像改为255，选择首章仍成功issue；再选择末章必须 `TRIAL_CHAPTER_ASSET_MISSING` 且不增加视觉读取。首章章数据及六个派生资源与正常源issue结果逐字节相同；manifest仅含首章，savedSourceDigest绑定候选，selectedSourceDigest与正常首章一致。两次issue都不commit，trial_sessions／trial_assets／content_games全文及候选／原源摘要保持。

候选捕获／reference仍是显式端口夹具；由于只改另一章、共享地图和资源未变，视觉读取适配器明确转交原真实已保存reference，实际读取已安装资源。此安排验证单章投影与检查顺序，不能当成坏候选已通过实际草稿保存、真实HTTP授权或完整资源绑定证明。

`trial-scope-ports.log` 首轮及 `trial-scope-ports-r2.log` 失败均保留：第一版从loader对象复制候选，六个派生资源一致但chapter JSON字节不一致；补逐资源诊断后定位章序列化差异。改为从实际 `captureForCompile` 结果复制，并核它与loader源的canonical摘要相同及原章序列化字节与正常issue一致；没有放宽逐字节断言。`trial-scope-ports-r3.log` 最终 **35项通过**（29＋6）。13个测试输入在r3前冻结并事后核同，诊断及范围见 `trial-scope-final-hashes.json`。仅既有测试和本文／审计变更，不重建不变两束，不重复无影响UI、规则、发布或HTTP长链；A20／A32仍部分。

## 后继Trial画像引用拒收的工作台提示

`server/public/draft.txt` 为既有 `PLAY_PORTRAIT_CORRUPT` 增加繁体指导：核对本章原始肖像字段和共享肖像覆盖；缺图报告零缺口不代表所有引用合法，不能自动补图或换图。该码来自共同画像收集器，不把它简单解释为“必定255”，也不暗示已有编辑器能修改所有原始字段。原错误信息仍保留；启动使用已保存修订／章、未保存输入、所属子窗口清理、晚到回应守卫及不自动保存／重读／重试均不变。

复用 `verify_editor_draft_controller.mjs` 原Trial失败循环增加此码，`trial-portrait-guidance-before.log` 一项失败复现缺少指导；修后 `trial-portrait-guidance-controller.log` **106组通过**（原组内增加分支），shell65通过。核typed999仍提交已读修订1／原章，只一条Trial请求，提示包含明确上下文及新指导；保脏name和999、关闭所属子窗口、不导航、不写journal，并保“回应不明不能推定服务端未建立”说明。是明确API／子窗口夹具，不冒实际HTTP或新浏览器错误场景。

语法、TXT实际导入、diff及链接通过，当前输入和诊断见 `trial-portrait-guidance-final-hashes.json`。仅控制器提示、既有测试及文档变化，无Vue／DOM结构、服务准入、Web引擎或资源改变，不重建两束，不重复无影响浏览器、实际Trial、发布、规则长链。完整A20／A21／A32仍未闭合。

## 后继Trial资产提交逐点回滚

核 `EditorRoot.#postTrialStart`：实际请求路径由外层 `storage.transactionSync` 包住会话／八个派生资产提交、touch及remember；`TrialSessions.commit` 本身不另开事务。本批不改产品，只在既有 `verify_vps_trial.mjs` 将正常commit也放入相同平台事务边界，并增加SQLite逐点失败检查。

先正常提交一个真实已生成Trial，再实际issue第二个。在manifest、chapter、terrain、roadGraph、roadCost、roadOffset、minimapBase、minimapLarge八个插入位置分别安装自有临时SQLite触发器，以 `RAISE(ABORT)` 失败；每轮断言抛出精确夹具错误后删除自有触发器，核 `trial_sessions`、`trial_assets`（含旧资产字节）、`content_games` 全文与失败前相同。覆盖新会话行和已插入资产前缀的共同回滚，不以只有空表来掩盖误清旧Trial。

移除故障后直接使用同一份已生成DTO／derived重新提交，八行资产ID／SHA／长度／字节逐项一致，派生buffer摘要保持，旧Trial仍active；新Trial随后通过现有end路径结束。原正常pack／asset／end、跨作者与epoch、三坏候选提前拒收和单章隔离用例同轮保留。`trial-commit-rollback-ports.log` 首轮 **45项通过**（35＋10），15个输入测试前冻结并事后核同。使用实际SQLite内存事务、自有临时FileBucket及固定41角色安装；故障触发器和principal是明确夹具，不是进程崩溃／磁盘持久性、workerd、HTTP幂等收据seal／remember失败或完整并发恢复证明。

仅既有测试和文档改变，语法／diff／链接及诊断记录见 `trial-commit-rollback-final-hashes.json`；不重建未变两束或重复无影响UI、规则、发布、完整HTTP长链。A21及完整编辑器仍部分，后继应用收据回滚见下节，其它恢复边界仍须分别验收。

## 后继共同Request的Trial收据入库回滚

复用 `verify_editor_template_root.mjs --trial-commit-only`，走实际共同Request、会话／CSRF、seal、外层事务、`TrialSessions.commit`、touch、remember及replay。用户／会话、游戏快照元数据和issue产物是明确夹具；issue不编译资源，八个小型派生buffer只是提交边界输入，不是可玩清单。使用自有临时文件SQLite，不启动HTTP服务器、不安装源或访问用户存档。

先通过同一路由正常创建旧Trial。第二次请求在 `operations` INSERT处使用自有临时触发器注入失败；触发条件同时要求该次Trial行和全部八个资产已经存在，避免把提前失败误报为末端回滚。实际响应500／INTERNAL_ERROR后，trial_sessions、trial_assets、operations、content_games、content_snapshots和sessions六表全文与请求前一致，旧会话／资产／收据均保留。删除自有故障触发器后，以同一请求键和正文重试，仅新建一个Trial及八资产；旧失败trialId无行，资产ID／长度／SHA／字节一致，游戏及快照不变。随后同键同正文返回同一解密收据、不再调用issue或插行；同键改章409／IDEMPOTENCY_CONFLICT且六表保持。

`trial-request-rollback-r1.log` 四组通过，补入sessions回滚及旧收据／快照保留断言后，`r2.log` 仍四组通过；六个输入在最终轮前冻结并事后核同。实际issue替身总调用三次（旧成功、失败、重试成功），最终两Trial／十六资产，故不能把整体说成只创建一个Trial。一次编辑因读取覆盖要求被拒、未应用，重读后完成修改；无测试失败。

源码／诊断见 `trial-request-rollback-final-hashes.json`。只改既有测试及文档，无产品、DDL、两束变更；未跑无影响编译、浏览器、发布或规则长链。这里只证明共同Request与文件SQLite内的收据末端回滚和原键恢复，不证明真实登录／网络、seal本身失败、workerd、并发进程、断电持久性或完整A21／A29。

## 后继Trial结束收据回滚

继续复用上节 `--trial-commit-only`，不新建入口或修改产品。对目标Trial的结束请求，在 `operations` INSERT处注入失败；触发器仅在目标已标记ended／explicit且其八个资产全部删除后触发。响应500后六表全文与结束前一致，目标仍active且资产恢复，另一Trial及既有收据不受影响。移除自有触发器，以原结束请求键重试：仅目标状态／end_reason改变，其八资产删除，其它Trial和资产、旧收据、游戏及快照保持；再次同键重放响应相同，六表不再变化。

`trial-end-rollback-r1.log` 保留失败：回滚和重试已经通过，后续期望对象为普通原型而SQLite行是null原型，严格比较失败。只将目标行展开为普通对象进行全字段比较，未减少字段断言或修改产品。最终 `r2.log` **七组通过**（原创建四组＋结束三组），最终两Trial、一个ended／一个active、私有资产从16降为8；issue替身仍只调用三次。六个输入在r2前冻结并事后核同，见 `trial-end-rollback-final-hashes.json`。

边界仍是实际共同Request／会话／CSRF／seal／SQL事务／结束／remember／replay和自有文件SQLite，身份、源元数据及issue产物为明确夹具；删除只发生于临时测试资产，不涉及真实游戏物理删除。未认证实际编译／登录／网络、seal失败、workerd、跨进程或断电恢复。仅测试及文档变化，不构建未变两束或重复无影响游戏／浏览器／发布长链；完整A21／A29仍部分。

## 后继Trial准备返回后的权限复核

同一 `verify_editor_template_root.mjs --trial-commit-only` 增加两个独立游戏的时序用例，保留上述创建／结束回滚。issue替身先用实际principal及snapshotReference取得合法身份和快照，构造原epoch的预备DTO；经过显式await后，分别向自有SQLite插入该游戏删除栅栏、或把另一个作者的用户epoch从1升到2，再返回原DTO／八资产。实际Root完成seal后进入原提交事务：前者由 `TrialSessions.commit` 的删除栅栏复核返回409／GAME_DELETING，后者由Root的principal复核返回401／SESSION_INVALID。

两例各准备一次，trial_sessions、trial_assets、operations、content_games、content_snapshots、sessions六表全文保持，预备trialId未写入；显式注入的栅栏／用户epoch变化仍存在，未靠回改权限制造通过。原派生buffer摘要及其它Trial保持。只验证此准备返回／提交边界，不宣称所有await、真实改密、删除事务或跨进程并发均已覆盖。

`trial-late-authority-r1.log` 九组通过；随后更正日志汇总，把原回滚流程的三次issue与新增两次分开计数。最终 `r2.log` 仍九组通过（原七＋二），`rollbackIssueCalls=3`、总 `issueCalls=5`、最终两Trial／八资产。六个输入在最终轮前冻结并事后核同，诊断和源码摘要见 `trial-late-authority-final-hashes.json`。实际共同Request／文件SQLite与明确身份、元数据、issue及时序夹具边界不变；未改产品或构建两束，未重跑无影响浏览器／编译／发布／规则长链。完整A21／A29仍部分。

## 后继新草稿保存与已准备Trial的固定修订

复用 `verify_vps_trial.mjs` 的实际41角色安装、PrivateDrafts捕获／保存、结构编译及Trial派生资产链。在已运行的修订1 Trial之外，先实际issue另一份修订1 Trial但不提交；随后以已支持的resourceEdits把首章势力槽0资金加1，真实保存1→2，再提交先前的修订1 Trial。此新增时序段没有替换capture、reference或视觉读取；principal及operationGuard仍为既有端口身份夹具，不是HTTP登录或并行进程。

验证旧snapshotReference完整不变，新修订root／sourceDigest不同，草稿保存不改已存在Trial两表全文／BLOB。准备好的旧Trial仍可提交，八资产逐项ID／SHA／长度／字节等于原准备值，pack仍绑定修订1及原资金。按修订2新issue／commit的Trial绑定新摘要，资金加1，完整chapter等于实际捕获的修订2；六种地图派生资产保持原字节，原来运行的Trial完整pack不变。随后只结束新建的两Trial，原Trial仍active；旧修订1再次捕获的完整源摘要及最初loader对象摘要保持。

**两种时点不得混同**：上述是已完成准备的旧快照提交，不代表保存推进后可以重新捕获旧修订的运行资产。`OwnedRuntimeAssets` 既有当前修订门见[VPS就绪§4.2](vps-editor-readiness.md)；新发起旧修订issue仍409／SOURCE_RUNTIME_CHANGED、无新Trial行，也不偷偷改用最新修订。本批不放宽该门。

`trial-draft-advance-ports.log` 前五个新增断言已通过，随后错误假设新申请旧修订也能成功，遇现行409中止；失败日志保留。核对已有明确门槛后只修测试期待，不改产品；一次编辑因read coverage拒绝未应用，重读后修改。最终 `trial-draft-advance-ports-r2.log` **52项通过**（原45＋7），15个相关输入在最终轮前冻结并事后核同，初轮输入摘要另存不覆盖。

实际SQLite内存库、自有临时FileBucket；旧入口的非法候选与故障注入仍保持各自夹具范围，本段资金保存及Trial捕获／编译／提交则使用实际端口。没有新浏览器、App运行、网络并发或断电持久性证明。只改既有测试及文档，语法／diff／链接与主动诊断见 `trial-draft-advance-final-hashes.json`；不重建不变两束或重复无影响UI、发布、规则长链。完整A21仍部分。

## 批次8d（E-05-Q69-CLOSURE-IMPL-8D）：TALK 固定域锁定＋终局可达考据（已实施，用户裁决 A）

- **裁决记录（Web 产品决定，非原版机制）**：用户 2026-10-08 裁决选项 A 窄门——试玩 TALK 门只锁已全绿的固定域；`414+talk_idx` 个性窗维持现状（空句照弹空对白框，不跳过、不发明 `% mod`），登记为已知问题。原版空句语义未知，此决定不是原版规则断言。
- **生产改动：零**：本批不改任何行为文件（`talk.js`／`gamebar.js`／`endview` 均不动）；只有文档登记＋新证据工具。链条以 guards 整图钉住现状为准。
- 数据域审计（实锤，`web/talk.json` count 1023，79 空首 409）：进言理由 `ri∈0..4`（三处 5 项 reasonsItems），君主行 `108/111/114+ri*9+monarchTalkIdx(%3)` ⊆108..152 全非空；固定字面（43/45/47/57/64/75/89/103..107/153/167..171/231..235/360..380/399/446..453/553..581）全非空；编成窗 446..448 空但有回退（449+talk%5 非空）；特长窗 553..581 全非空。`personalityTalkIndex`／`originalTacticalTalkIndex` 无 `% mod`（talk_idx 为 byte 0x1E 全字节直存），414..669 有 73 空（含 417..421）→君主个性行经常空框（只影响显示，不崩溃；`showGeneralMessageDialog` 无空守卫）。gamebar.js 零试玩分支（同码同路）。type10 通用事件 talkIndex 来自 SAVE 尾部，试玩不载 SAVE→不可达（推断）。
- 终局可达（代码级实锤，浏览器实证残留）：败北 gameover 三路径（信赖归零／玩家灭亡／native 玩家败北）均无试玩排除→可达；统一 END_S1..12 门（`dispatchNativeUnificationGate`，条件仅 `countNativeAliveFactions===1`＋shown 护栏）无试玩排除→单章杀光全部 native 对手即开门（TALK75 非空＋君主行可能空框→END_S 循环）。
- 新工具 `tools/verify_editor_trial_talk_gate.mjs <round>`：单元域（talk.json count 1023／固定字面单点＋103..107／108..152／167..171＋231..235／360..380 全非空／编成回退形 446..448 空＋449..453 非空／特长窗 553..581 全非空／无 mod 算术＋%3 界＋5 理由静态／已知问题钉 417..421＋414..669 空 73）＋真实后端（匿名 401、内置章 issue 200 含 trialId 且终态 active、status 200 active）；23 检查／11 实际调用。证据 scope saved-source-trial-talk-r1；guards 556/263→558/265（新工具＋web/talk.json 入库）。仍不称 Q69 闭包完成：8d 残留统一结局浏览器实证、删除级联、人物/TALK 其余、资源库存剩余未做；主 goal active，无 commit/push。

## 批次8e（E-05-ENDVIEW-DEFEAT-8E）：试玩败北终局浏览器实证（用户裁决 A）

- **前提（用户批准，非原版机制断言）**：试玩定制仅据点／道路／武将三类数据，引擎／规则／AI 原封不动且不受影响；builtin 派生 later-3 即可证明引擎终局路径。机制断言仍只认原始证据。
- **裁决 A 范围**：只证败北半（gameover.png＋score.gameOver）；统一 END_S 浏览器实证仍为残留。**全程只走原版机制**：被动单城侧（later-4 选 1 嚴國棟，仅南昌一城，三面被 0 司馬炎城包围，不下令——放置即合法原版行为）、原版系统选单切最高战略／战术速、弹窗一律真实左键（理由选末项撤回／拒绝类、keypad 按原值決定、消息框推进）、战斗不下令任其自解；不调后门 API、不发明规则／费用／流程。**生产改动：零**。灭亡＝最后据点失陷同轮（0x4FCE，ai.js finalizeFactionExtinction 实锤），单城必走此门。
- attempt-1（dry，later-3 孫浩 53 城）：被动一整年（264-1→265-1）无开战、无灭亡——关系 42 和平起步＋53 城征服极太长，诚实失败，现场保留为 attempt1-q69-8e-dry-endview；目标改选 later-4 单城（同裁决 A、同引擎路径、同零生产改动，仅 harness 目标变更）。
- 有界 22 分钟 pump；超时即 honest fail（attempt 保留），不编造通过。终局门在试玩 LIVE（8d 补强：trialruntime fresh＋copyprofile 保留 nativeFactionSlotRaw→native 槽初始化→门开）。败北三路径（信赖归零／玩家灭亡／native 玩家败北）均无试玩排除。
- 点击回标题（finish→location.reload）在试玩内会重进试玩而非主标题，语义未知，不作浏览器断言（静态代码已审）。trial 行在败北后状态仅记录不断言。
- 新工具 `tools/verify_editor_trial_endview_defeat.mjs <round>`：单元域（败北调用点静态／later-4 双势力＋单城／势力选择接线／速度档接线／试玩 native 前提）＋真实浏览器（工作台→later-4→选势力 1→running→最高速→pump 至 endview）；15 检查／7 调用，receipt `PASS-TRIAL-ENDVIEW-DEFEAT-8E-NOT-Q69-CLOSURE`（266-7 灭亡，caption 大業未成嚴國棟軍覆滅，score gameover，0 非预期错误＋1 登录前 401 benign 分类）。证据 scope saved-source-trial-endview-r1；guards 558/265→559/266（新工具入库）。仍不称 Q69 闭包完成：统一实证、删除级联等未做；主 goal active，无 commit/push。

## 批次8f（E-05-TALK-DIRECT-WHEEL-8F）：ai 直接字面＋宣战/灾害窗＋type-10 不可达（裁决 A 延伸，零生产改动）

- **范围（用户裁决 A 的延伸，无新裁决）**：8d 锁 gamebar 字面窗后，ai.js 直接 `enqueueTalkMessage` 字面、`486+warTalkStyle` 宣战窗、`70+subtype` 灾害窗、type-10 原生通用轮、八个性选择器窗的数据域一次收口。只锁已全绿固定域；空窗一律维持现状登记为已知问题（不跳过、不发明 %mod、不改行为）。原版空句/轮调度语义未知，不作原版规则断言。
- **全绿固定域（实锤）**：ai 直接字面 26..38/57/63/65..70/75/407/486..488 全非空；原生战争 3C3D CX 闭包 43..49 全非空（补 8d 的 44/48/49）；灾害 producers 恰三处 type-12（arg0 0/1/2，3197/3207 即时＋3944 延迟）→70..72 全非空。
- **新已知问题（实锤，裁决 A 登记不改）**：`486+warTalkStyle`（clamp 0..7）中 489..493 恰空——数据实锤四君主实例：middle-2 f10 劉寧 talk6→492、middle-3 f10 張武 talk3→489、lower-3 f3 郭攸之 talk4→490、f4 尹默 talk5→491；其宣战对白弹空框。8e 无此混淆：later-4 两君主 talk 均为 1→487 非空。八个性窗（0x197/0x198/0x199/0x19a/0x19e/0x1a4/0x1a6/0x1a7→基 414/422/430/438/470/518/534/542）空数钉 73/68/68/65/56/28/23/20。
- **type-10 不可达（代码穷举＋数据零槽）**：web/src 零 `{type:10}` 产生式；20 章 boot 轮（256×4 hex 全解码）零 type-10 槽；原生 `payload.talkIndex>=1023` throw fail-closed；唯一轮写入口（ai.js 2312/2351）经 ensureStrategicEventSlots 拒绝 native 上下文。试玩＝native 上下文故 type-10 不可达。边界：原生分支轮运行时写入除上二入口外未逐条追踪，本批不称战略事件可达性闭合。
- **承接用户纠正（8e 勘查措辞修正）**：被动等待不会导致统一——不宣战不进攻时，对方最终会宣战进攻（8e 实测即嚴國棟主动宣战围城）；统一须主动征服。用户对 8e 后续形状裁决 B（统一实证暂缓，先做其余 lane），本 8f 即 B 下第一批。
- 新工具 `tools/verify_editor_trial_talkdirect_gate.mjs <round>`：单元域（上列全绿镜像＋489..493 钉空＋四君主实例＋灾害 producers 静态＋type-10 三重不可达＋八窗空数钉）＋真实后端（匿名 401 先行、内置章 issue 200 含 trialId 且 status active）；23 检查／11 调用，receipt `PASS-TRIAL-TALK-DIRECT-WHEEL-8F-NOT-Q69-CLOSURE`。证据 scope saved-source-trial-talkdirect-r1；guards 559/266→560/267（新工具入库）。仍不称 Q69 闭包完成：统一实证、删除级联等未做；主 goal active，无 commit/push。

## 批次8g（E-05-TRIAL-TACTICAL-8G）：试玩战术帧浏览器实证（事项2，零生产改动）

- **范围（用户事项2实际验证，短距进攻式）**：事项1统一/胜利暂缓、B休眠下开工的第一批。later-4 选势力 0，以距南昌(175)最近的有兵城出击（0x3644 setup 公式＋一次生产 cmd.dispatch 行军令，10 分钟重试窗；native harness 先例，注释明示）→4F36 玩家进攻挂起（tactical-suspended，siege-attack，TALK28）→开场自动关闭（3 秒产品规则，本批不点击）→帧经真实 _trialFrames 边界对象泵完（与 rAF 循环同一函数，不绕行）→写回非空＋队列排空＋战略时钟恢复。只走原版机制，不调后门，不发明规则/费用。
- **机制红利（originalsiege.js dispatchOriginalSiegeBattle，实锤）**：city==player 且仅 0x4200 临時守备时走快战（4F06→TALK26 警告后易主，无战术）——解释了 8e 与 dry7 被动局零战术即灭亡。4F36（attacker==player、非委任、真守备）必挂起战术，本批即走此分支。
- **生产修复（本批授权内）**：根因实锤链闭合——`commands.js` 的 `dispatch` 用默认世界门面 `roadgraph.js` 取 `roadEdgeOrNode/targetNode`，而试玩壳（`createTrialEnvironment` 自建 world，`scenarioassembly` 只加载注入的 world）从不加载门面实例 → 恒 null → 首个行军动作读 0x0E fail-closed 冻泵。修法：`dispatchSourceRoadNode/dispatchTargetNode` 优先用 `scenarioNativeRoadContext(sc).roads`（剧本自身 world），非 native 回落门面（匿名/开发服务器行为不变）；bundle 已重卷（215 文件，commands.js 条目前进）。证据：dry5/8/9 现场（Le undefined / target node undefined）＋本批修复后全程。
- **生产修复其二（server/worker.js）**：`/api/trial/web/` 路由原对任何 query 一律 422 TRIAL_QUERY，而 `core/assets.js imageBust` 给四张战场 sprite 拼 `?v=original-sprites-1`（试玩响应全 no-store，bust 本为死重）——战场在试玩壳必打不开。修法：白名单放行唯一已知 bust 值，其余 query 仍严格 422（8x Scoped-asset 纪律不破）。
- **设计史（attempt 全保留）**：v1 长距进攻（虎牢關→南昌 dist163）触发真引擎覆盖缺口 originalroadmovement unsigned fail-closed（与试玩栈无关，未修，记残留，attempt5）；v2 被动防御证实 0x4200 快战机制（dry7 诚实无战术）；v3 首次 on-road 过滤查错实例（roadgraph 门面默认世界单例从未加载，dry10 误报 no-onroad-city）；v4 改用 `app.world.roads.roadGraphReady/roadNodeAt` 直查＋graphReady 断言＋真实 canvas 点击目标城走 app 实例 dispatch，并硬校验新军团 roadEdgeOrNode 为整数（仍冻即为诚实失败）。
- **单元域（实锤）**：trialruleboundaries.createTrialBattleFrames＋battleview opt-in＋循环走边界；ai.suspendNativeTacticalBattle＋onTacticalBattle 通道＋4F36/4F06 分支；开场 TALK 27/28/29 全非空；战斗资产（battle_talk.json 可解析／battle_display.bin／terrain0..2／units）在试玩路径＋磁盘在位；later-4 双势力＋势力 0 有城＋南昌 175 属势力 1；势力选择／速度档／试玩 fresh 前提接线。
- 新工具 `tools/verify_editor_trial_tactical_frames.mjs <round>`：单元域 9 检查＋真实浏览器 13 检查（工作台→later-4→选势力 0→running→最高速→dispatch→挂起→开场→战斗开（边界在位）→帧→写回→排空→时钟恢复→零非预期错误）；22 检查，receipt `PASS-TRIAL-TACTICAL-Frames-8G-NOT-Q69-CLOSURE`。证据 scope saved-source-trial-tactical-r1；guards 560/267→561/268（新工具入库）。仍不称 Q69 闭包完成：统一实证暂缓（事项1）、删除级联（事项3排队）等未做；主 goal active，无 commit/push。

## 批次1功能证据（saved-source-trial-server-native-r1，已闭合）

实际本地后端（真 Worker/SQLite/认证链，非浏览器）32 检查／48 实际 HTTP 通过：启动负例（无 cookie 401／坏 CSRF 403／query 422／fields 422／修订格式 422／未知修订 404／坏章格式 422／他人游戏 404／未知游戏 404）；有效启动＋密封幂等重放同 trialId＋异 body 同键 409；status（无 cookie 401／他人 401 TRIAL_INVALID／query 422／active 200）；end（他人 401／显式 200 ended-explicit／异键重结束 200 同态）；Q70（改密后旧会话 401 SESSION_INVALID、重登录 status 401 TRIAL_INVALID 不复活、行记 session-revoked）；lazy 绝对期限（status 200 ended/session-absolute-expiry）；删除栅栏（status 401 TRIAL_INVALID、行记 game-deleting、清栅栏后 200 ended 不变）；四终态行原因精确＋栅栏行恢复＋除五张预期写表（trial_sessions/operations/sessions/login_rates/users）外逐表 digest 不变。guards 继任 545/254→546/255（worker.js 改＋trials.js 增，priorProtected545/254 谱系）；独立 audit 9274 hash-read／11 新 WX／组合 pair 链（derb→note→noteB→noteC→noteD）双向证明通过；gate 四次 attempt 缺陷均探针/期待缺陷登记、现场改名保留。不称 Q70/Q71 完成（客户端 adapter/真实 App 未接）；投影编译/manifest/资源服务/删除级联仍未接线。

## 批次8h（E-05-TRIAL-DELETE-CASCADE-8H）：fence begin 同事务 trial 级联（后继deletecascade-r1已封存，非物理删除）

- **缺口（实锤）**：`trials.js #bound` 只有 lazy 路径（下次观测到 `GAME_DELETING` 才 `#close` 记 `game-deleting` 并清资产）；`deletionfence.js begin()` 同一事务内无任何 trial 级联。生产 `worker.js` 尚未实例化 fence（仅各 deletion fixture 使用），故改动点落在 fence 类自身事务内，未来任何接线方自动继承。
- **实施**：`server/deletionfence.js`——fence INSERT 后同事务 `UPDATE trial_sessions SET state='ended', end_reason='game-deleting' WHERE game_id=? AND state='active'`＋`DELETE FROM trial_assets WHERE trial_id IN (SELECT trial_id FROM trial_sessions WHERE game_id=?)`，`sqlite_master` 存在性守卫（旧库无 trial 表时跳过）；reason/表列契约镜像 `TrialSessions.#close`（lazy 路径保留作后备）。`server/trials.js`——`LIMITS`＋文件头注释更新（fence-begin 级联已接线；Q69 完整依赖闭包／runtime 准入仍关闭）。`server/worker.js`——13 处历史字符串拼接机械模板化（行为等价）＋注释更新。无构造签名、无新增导入，既有 fixture 构造不受影响。
- **验证（本批）**：新工具 `tools/verify_trial_deletion_cascade.mjs`（node:sqlite 直连真实 `GameDeletionFence` 类）三场景全绿——同 game 双 active 全清＋异 game 不动＋已结束行原因不变／无 trial 表旧库 fence 照常／失败 409 路径 trial 行资产无损＋无 fence 残留；`editor_server.mjs` 自检 OK；三文件 `node --check`；lint 零 error。调试结论见 journal 8h 节（桩惰性致 `GAME_NOT_FOUND`／`node:sqlite` 无 transaction helper／`tlog` 约定）。
- **边界**：完整 workerd gate（deletion-fence/trial 系）与 guards 继任未跑（`before.json` pin 旧 `deletionfence.js` hash，重跑须继任）；仍不称 Q69 闭包完成；无 commit/push。
