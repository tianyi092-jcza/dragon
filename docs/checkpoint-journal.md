# Checkpoint Journal

> A 部分为长期项目记忆（事实／架构／命令／约定／坑点／主线状态），跨会话有效；B 部分为近期会话详细台账。机制与产品合同只链接维护源，不复述。历史成绩不代替当前验证，待办不自动授权实施。

## A. 项目记忆（长期有效）

### A1. 主线状态与门控（2026-10-30）

- 专长采纳已生效：新默认 `map-2-28805…`/source `19ef…`/entities `7e7fad`（证书 `a65127…`）；server pinned 已跟进 28805（B-解耦）；画像库冻结 47e 锚 `approved-available-library-f4ba804b-1`（生产注册，混合态如实记录）；web 旧 47e 字节保留（删文件改玩家静态包清单，涉部署不动）。
- A30 阶段 1 已交付未提交：ledger 保留/退休分支＋检查点 `retirement-checkpoint` v1＋屏障＋清理执行，publisher/receipts/scan 消费者迁移，证据矩阵场景 1–5、完成门评估（fail-closed）、备份清除、清理竞态全绿。`deleteAllowed` 恒 false；410/名称释放无删除目标、无闭包实证不开；阶段 2 为独立外部依赖。
- 阻塞（目标 blocked，等 `/goal resume`＋任一输入）：commit/push 明示授权（工作树约 350 项未提交，混他人 WIP）；A31 外部（异地备份目标／保留政策／告警接收端）；`fallback_ui` 待他人 UI WIP 合入后重跑；A28 跨窗口恢复矩阵未定义。证据缺口（G-INIT／道路／扩容／配方）按铁律不得猜测实现。
- Git：`8fb4d6c` 已推 main（后台迁移＋ui 上线）；其后本地 300+ 项未提交，无 push/Release。
- 生产快照（末次收据，非实时保证）：vps6（`20261019-current-only-vps6`）＋ `ui-8fb4d6c` 在线；发布／管理／删除门 503；公开 registry `REGISTRY_EMPTY`，`control/current.json` 404；monitor timer active。

### A2. 架构与关键身份

- Pinned 源：manifest `807e2d3b…`/14268，entity 清单 `76eaca3e…`/775、runtime `537e6af…`，注册 `approved-builtin-28805f-entities7e7-1`，41 roles，totalBytes 58143656。staging 读 pinned 字节逐 role 验 sha（`editor_stage_source.mjs`，不再经 Web 默认门预热）。
- Ledger 库表（workerd 断言 6 表/38 列/1FK）：`content_distribution_events/chunks`＋`checkpoints`（5列）＋`enqueue_barrier`（2列）＋`cleanup`（6列）。退休读只返最小身份（无 payload 键）；保留缺块一律 `DISTRIBUTION_LEDGER_CORRUPT`；旧键重放不返 payload（只校验）。检查点是新对象新摘要，不沿用操作摘要。
- 画像库 `f4ba804b`/93632 字节/400 角色/20 消费者；`LIBRARY_BASE_REVISION` 冻结 47e；255 缺口不冒 Q69 闭包。
- 产品行为：五档提速 6.5/5.0/4.8/1.8/1.0ms、预算 16/帧，Trial 束 230 项；密码 9–128 码点、ASCII 大小写＋数字＋符号；Vue 后台 13 页迁移完成（构建逐字节，audit 0）；备份页 slot4 导入＋损坏拒收（主链 10 项／公开 App 12 项）。

### A3. 常用命令

- 环境：`MINIFLARE_MODULE=/c/Users/fczll/AppData/Roaming/npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js`；`PLAYWRIGHT_MODULE=$PWD/.dragon-analysis/pw-chrome-shim.mjs`（借系统 Chrome，无 bundled Chromium）；`EDITOR_TEST_NODE=1` 走 Node/SQLite/FileBucket（免 workerd）。
- 回放号用新号（产物全 `wx` 写）：stage_ui r73 PASS；fallback_rows r4／api r4／jobs r2；trial boot attempt120／session attempt12；source_catalog／admin_copy／library_policy／vps_trial 已重定 pin。
- 关键套件：`verify_distribution_ledger{,_retirement,_workerd,_backup_restore,_cleanup_races}.mjs`、`verify_distribution_publisher_retirement.mjs`、`verify_deletion_{catalog_scan,scan_retirement,retirement_prototype,completion_readiness}.mjs`、`verify_backup_purge_local.mjs`、`verify_publication_{producer,server,chain_browser}.mjs`、`verify_editor_backend_stage_ui.mjs`、`verify_editor_fallback_rows.mjs`、`verify_trial_{app_boot,session}.mjs`；收据落 `.dragon-analysis/` 对应会话目录（gitignored，不入仓）。

### A4. 约定与证据纪律

- 原版机制只认 KI.EXE 指令／二进制／受控观测；体验、现状代码、单样本不作证据；推断／未知不进正式规则路径；测试锁定已确认规则，不预设结果（见 `E:/Dragon/AGENTS.md`）。
- 提交／推送／部署／生产注册／删真实数据分别明示授权；允许改文件≠允许 commit；一次请求明确含多项才连带。自动化测试禁读／写 `E:/Dragon/Dragon/SAVE.DAT`，正式存档只用隔离 IndexedDB。
- LSP push-only 未确认≠clean；`lens_diagnostics mode=all`；超时或空缓存不称 clean。delta 误报先行级取证再定论。
- 测试夹具 fixture-only 变更（如 before.json 437 条目重基线、oracle 清单绑定）须与 pinned 字节交叉核对；地图字节未变时像素证继续有效。
- 工作树混有他人未提交 WIP：一律不碰、不代提交；commit 前先做归属分离审计。
- 历史成绩≠当前验证；保留失败日志；进程内 bridge≠原生 TCP/TLS；同机备份≠异地灾备；维护门只按独立证据分步解除。

### A5. 坑点备忘

- 8787 `EADDRINUSE`：先查残留 node（nohup 后台常驻），foreground 重跑换新 round；`failure-r*.json` 多为端口碰撞残留。
- `/tmp` 在 shell 与 node 非同一文件系统：调试日志写仓库内相对路径。
- `finally` 清场掩盖真实断言：调试改 `catch` 透出真实错后再清场。
- 自造 opId 须满足 variant/version 位；同 game 连续 publish 致 `GAME_PENDING`（改 listing 或换 game）；Idempotency-Key 须与目标键一致，否则误报丢失。
- pi-lens delta 对私有方法名／冻结快照误报（`#state` 裸调用判未使用、hex 内 `ba` 判typo）：行级取证（grep/sed/`node --check`）后再定，不碰正确代码。
- Jev preview 一律 HTTP451 地区限制：不绕过，不阻塞权威验证。
- SSH 密钥字面转义换行：用临时规范化副本，用后即删；远端操作先核 ED25519 指纹；凭据禁入 Git／日志。
- Docker 验证记得显式 tmpfs（漏了 EROFS）；Node fetch 丢自定义 Host 时改原生 HTTP 显式 Host；远端 CRLF vs Git LF：覆盖前逐文件比对并保存原 SHA，不批量重写。
- Workers 静态单文件 25MiB 上限：创作源超限时排除创作源、保留运行资产。
- 月结保留 day0（消息期间不推进日期）；道路夹具读 `DEFAULT_WORLD.assets.roadGraph`，不把 `{}` 当无阻挡。

## 1. 接续状态

- 已并入 A1。本节旧快照（a11e448 未 push 等）以 Git 实际状态为准，不再维护。

## 2. 已关闭批次与历史索引

<a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a>
<a id="9-battle-text-reflow-1战术双方对白自动折行"></a>
<a id="10-014发布整理"></a>
<a id="11-015发布整理"></a>

- 历史批次收据已归档对应 Git 历史／CHANGELOG，不在本页维护第二份提交表（入口保留，内容见 Git）。合同见[表现合同](presentation-modernization.md)、[战术生命周期](re-notes-tactical-lifecycle.md)，收据缺口见[历史收据说明](historical-receipts.md)。Workers 静态单文件 25MiB 上限教训见 A5。

## 3. 历史批次相关文件（本轮部署见§12）

- 运行代码仅 `web/src/game/clock.js`（提速，见 A2）；§7 为纯文档整理。不再维护逐批文件清单。

## 4. 验证与状态边界

- 已收敛为 A4。细节见各维护源，不在此重复。

## 5. 当前时钟系统逆向与重构（本地完成）

- `61dbf2f` 已封存并被§8取代；原证与审计见[战略时序](re-notes-strategic-time.md)。接续结论（月结保留 day0、道路夹具读 DEFAULT）见 A5。

## 6. 发布主线阻塞与下一步

- 已并入 A1。R2§2.72／VPS§6 细节见对应维护源。
## 7. 本次记忆整理

- 2026-08 方法说明（历史）：AGENTS 只留长期事实，本页当时 Slim 一次。后续整理沿用 A 部分增量更新，不再另起方法节。

## 8. 用户指定五档提速

- 参数与行为见 A2。细则与收据见[战略时序§6](re-notes-strategic-time.md#6-现代实现方案已落实非dos硬件复刻)；本批为本地交付，发布授权与复验见§9。

## 9. v0.1.8发布审阅与执行

- v0.1.8已发布（16文件，只推GitHub main与新标签，不推Gitea）；授权不沿用。细则见[发布审阅](release-v0.1.8.md)。

## 10. 录像反馈后的战略性能修复

- 性能修复已交付（648更新8.31s→0.68s，地图689→41次）；细则见[战略时序§8–9](re-notes-strategic-time.md#9-完整app绘制热点修复)。Jev451见A5。

## 11. 编辑器VPS部署前只读盘点

- 连接：`root@166.88.160.23:5522`＋本机 `E:/Dragon/dartnode.key`（ED25519 指纹 `SHA256:ahYPBa0NV/Tr7X3j9HgEfGpZk9s07cHg`，用户已独立核对）；临时 known_hosts＋严格校验，不改全局 SSH。
- 只读结论：Debian 6.12／Docker 29.6；VPS 与本机 GET `https://dragon-editor.720108.xyz/` 均 200；R2 只读（`dragon`桶 `control/current.json` 404，`kao/`前缀 LIST 成功）；注册表 `REGISTRY_EMPTY`。
- 未核验：供应商快照位置、存量迁移、异地备份、告警接收端（→A1 外部缺口）。正式私有数据目录 0700 合同保留。
## 12. 受限编辑器容器部署

- vps2 上线：独立项目 `/srv/dragon-editor/publication`（原 probe/panel 保留，切换前备份 `deploy-20261019T103943Z`）；静态清单 1390 项与玩家站逐字节相同；镜像 `dragon-editor-publication:20261019-b4177c8-vps2`；收据在 VPS `deployment-final.json`。
- R2 小对象 GET404 错误信封预算＋装配修正（tools 适配器／MIME／显式 Host）随本次落地；维护门保留，未初始化 production 根，未碰 kao 对象。
## 13. 固定库刷新与私有Trial接续

- 新库 `approved-available-library-f4ba804b-1`（400 角色/20 消费者全匹配；255 缺口不冒 Q69 闭包，见 A2）；vps3/vps4 两步上线，私有库＋Trial 门开放。细则见 R2§2.71。
## 14. 当前政策联合发布复验

- 联合链通过（Node/workerd 资源门各 45 组＋两条 20 章浏览器链，进程内 bridge，不冒云发布）；失败轮 r1–r4 未算通过。细则见 R2§2.72。
## 15. 密码强度调整与线上同步

- 9–128 码点、四类字符（见 A2；细则见[认证合同](editor-backend-auth.md#已实现的账户api边界)），vps5 上线；不改 scrypt／会话，不重设账户。
## 16. 当前版本资源门部署与只读巡检补强

- 资源门 vps6 上线＋只读巡检（fault 遮盖／30 分钟 preflight／异常脱敏）；外部告警＋异地备份仍未配（→A1）。细则见 VPS§6。
## 17. 编辑器与受限部署提交整理

- `a11e448`：113 文件已提交、未 push；63 个 M 保留。授权不沿用到后轮（→A4）。
## 18. 下个对话接续摘要（a11e448之后）

- 本节目标／决策／失败／文件／阻塞已分别并入 A1–A5；原文备查 Git 历史。
- 维护源索引：[产品设计](game-editor-design.md)、[工程合同](game-editor-technical-design.md)、[迁移计划](game-map-migration-plan.md)、[准入原证](re-notes-editor-map-admission.md)、[需求矩阵](editor-requirements-matrix.md)、[R2接线](r2-player-connection.md)、[VPS就绪](vps-editor-readiness.md)。机制实现仍须加载相关 SKILL 及原始证据，journal 不代替它们。
## 19. 后台框架壳（EDITOR-UI-1）

Vue 3＋Element Plus 独立展示层落地（登录/侧栏/个人资料，CSP/忙门/离开守卫），构建逐字节一致，audit 0。收据：`.dragon-analysis/editor-workbench/`（最终壳 run-kg2ubG）。未改引擎／Trial／数据库／部署。
## 20. 账户管理组件化（EDITOR-UI-2）

账户页迁为 Vue 表格／创建表单（转义/409锁定/脏离开/会话清空），真实 workerd 浏览器通过创建／停用／恢复／重设／CAS。收据：壳 run-CTRH3Q，真实账户 ui2-real-accounts-2。
## 21. 草稿与章节组件化（EDITOR-UI-3）

Vue 草稿页＋章动作＋只读草稿栏（CAS/原键重试/失效清理），真实 HTTPS 通过保存丢包/412/重载恢复/作者隔离。收据：壳 run-KTpaS1，真实 ui-r35。
## 22. 阶段任务与结构展示（EDITOR-UI-4）

StageJobs/StageAssets 页迁移；结构 GET 固定库身份缺口（旧 76cdf28 vs 现行 f4ba804b，后由§32修复）如实保留，未放宽。收据：壳 run-5EOzkG，真实 ui-r48。
## 23. 只读素材库组件化（EDITOR-UI-5）

LibraryPanel 只读页（目录代际＋稳定 assetId＋本地筛选），真实轮 50 通过目录 398/缺项 20/下载 SHA。收据：壳 run-G5R3ht，真实 ui-r50＋library-r50。
## 24. 据点表格组件化（EDITOR-UI-6）

StrongholdPanel 语义表格（192 锁定／越界无 POST／竞争 412 保留输入），真实轮 54 通过。收据：壳 run-xBAah0，真实 ui-r54＋stronghold-r54。
## 25. 只读地图展示（EDITOR-UI-7）

MapPanel 迁移（Canvas 仍原生绘制，几何不进响应式树），真实轮 55 通过。收据：壳 run-JayK4r，真实 ui-r55＋map-r55。
## 26. 固定库登记展示（EDITOR-UI-8）

CatalogPanel 登记页（空 body 重放／本机放弃），真实轮 56 通过。收据：壳 run-5DNOZA，真实 ui-r56＋catalog-r56。
## 27. 武将与势力展示（EDITOR-UI-9）

GeneralsPanel（128 行／画像绑定／非法编号不 POST／412 锁定），真实轮 61（--generals-only）通过。收据：壳 run-8FqyfR，真实 ui-r61＋generals-r61。
## 28. 完整测试副本组件化（EDITOR-UI-10）

CopyPanel＋无框架 copy.js（预约 202/执行 200 提交后丢回包／重载无 POST／原键恢复），真实轮 63（--copy-only）通过。收据：壳 run-mId67d，真实 ui-r63＋copy-r63。
## 29. 发布管理组件化（EDITOR-UI-11）

PublishPanel 接管（tuple/回执校验／GET404 同键重试），真实发布链 10 组通过（进程内 bridge，不冒云发布）。收据：壳 run-iNwSBJ，真实链 publication-chain-browser-qiNFZu。
## 30. 上架限制与删除追踪组件化（EDITOR-UI-12）

Management/DeletionPanel（上架／下架／解除限制／跨作者删除），真实链 11 组通过（管理 POST3／删除 POST1／确认 6 代）。收据：壳 run-yhB8LT，真实链 publication-chain-browser-hm8F6b。
## 31. 共同收尾与逐项审计（EDITOR-UI-13）

移除无消费者兼容代码；13 页 Vue 独占 DOM。完整审计见[最终审计](editor-ui-final-audit.md)。收据：壳 run-UTh7HX，真实链 publication-chain-browser-MsfdUZ。
## 32. 固定库身份合同授权修复与目标闭合（EDITOR-UI-14）

用户授权后定点修复：policy 导出 AVAILABLE_LIBRARY_REGISTRY_ID，stageassetplan 换掉旧 76cdf28。r64 真实 combined 链 17 组通过（structuralGetChecked:true）。收据：ui-r64.json＋stage-plan-input-r64.json。
## 33. 后台迁移提交、推送与受限上线

用户另行明确提交并推送部署：73 文件提交 8fb4d6c 并推 main（CRLF 逐文件比对后覆盖）；Cloudflare 自动构建成功；VPS 最小覆盖 ui-8fb4d6c 上线冒烟通过。发布／管理／删除门仍 503。
## B. 会话台账（近期详细，2026-10-30前后）

> 以下保留近期会话的详细进展、调试、收据与阻塞，供接续查证。更早批次已压缩为 A 部分或归档 Git 历史。

## 34. 专长低位本地采纳切换（E-04-SPECIALTY-ADOPTION-1）

- **身份**：父`map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23`/source `87742af76b54a13711541eefbb2dd2066ba06d30602027b9bfcf9ae43bf9f2b1`/manifest `bde6dfc8a82da5597ef22786e46681c87f2fe21cd55dd23921b32e346efa95e9`；候选`map-2-28805fc52a1c79910a949fb32b242323777c1741245724b8c346fd8e7a567bfe`/source `19ef2ce35a92d4fad10d75610818f8113ff9b711480e45d7a009cd582c7b4d6b`，r1/r2逐byte一致，2560条5非零（200/006/100/100/500），24改14不变。
- **安装**：`tools/install_editor_specialty_adoption.mjs`原子切换，`SWITCHED-COHERENT-RELEASE`；PENDING候选经正式证书生成APPROVED最终manifest（合同SHA `a651273e8c770a4593f5f040f7cd7c468e72a493525ec34e86156913da4328fc`），新默认已生效并经trusted reader与installed entity source验证。父immutable目录保留作审计，不作可读回退。
- **验证**：copy/inspection按已采纳低位更新后通过；installed entity source通过；installed program在重建Trial束后36项通过（237文件）；player saves 36项通过；entity history沿用既有fixture通过。trial-app-boot需传轮次参数，未传参失败属调用形状错误，未跑重型浏览器链。
- **旧副本**：不保留、不迁移、不做兼容分派；清理核归属与引用、共享不删。live仓库内除审计保留父目录、分析归档证据及未动的server pinned生产文件外，无可删live草稿；server pinned未动（生产登记不在本次授权内）。14地图资源分属不同revision前缀键，不按hash合并删除。
- **收据**：`.dragon-analysis/editor-completion/specialty-adoption-install-20261030.json`（安装收据）与`specialty-adoption-certificate-20261030.json`（证书）。LSP四路径1 hint已清（installer未使用导入）。未提交／推送／部署。

## 35. A30历史退休消费者负控补强（E-01-BACKEND-DELETION-INVENTORY-1）

- **内容**：`tools/verify_deletion_catalog_scan.mjs`在独立待发单代账本上新增一组负控并移除其chunks：头部不变，但空闲`checkHead`的`entry(1)`、待发`drainOne`的`next()`、旧键`enqueueInTxn`幂等重放三者均报`DISTRIBUTION_LEDGER_CORRUPT`，不返回旧记录或去重成功。只加测试负控，未改产品、DDL、HTTP、PUT／DELETE能力或运行束。
- **验证**：22组通过（原21＋1），收据`.dragon-analysis/editor-completion/deletion-retained-history-20261029/tests-consumer-r1.log`；维护源`editor-backend-deletion-inventory.md`内21组记述已同步为22组并说明三条存活读取路径须连同迁移。A30仍未完成，退休协议实现与验收仍待后续按候选顺序推进。

## 36. A30退休实施送审包（E-01-BACKEND-DELETION-INVENTORY-1）

- **内容**：`docs/editor-backend-deletion-inventory.md`新增“后继退休实施送审包”节：触及清单（ledger五处／publisher三处／receipts四函数／联合扫描）、屏障代价（只暂停新enqueue、不新增解锁、跨进程排空条件尚未设计、检查点不可撤回）、分阶段（阶段0夹具原型不需审阅；阶段1产品分支与检查点kind需批准；阶段2生产410／备份清除为独立外部依赖）及三项送审问题。只加文档，未改产品、DDL、锁或DELETE能力。
- **状态**：~~A30产品实施待用户审阅批复前不启动；~~三问已批复（用户20261030）：①屏障语义接受（只暂停新enqueue、不新增解锁，失败沿用REMOTE_AHEAD/REMOTE_GAP）；②检查点kind命名先做阶段0夹具原型再定；③阶段2维持外部依赖口径，A30完成出口不等备份实证。阶段0原型已交付（见§38）；stage_ui走法B（server pinned跟进28805，旧副本不再使用）随后启动；其余独立台账项继续推进，不以送审代替实施。

## 37. 备份页损坏导入拒收＋专长采纳测试跟进（A28部分）

- **备份页负控**：`tools/fixtures/public-player-browser.mjs`在成功导入slot4后追加两例损坏导入（截半字节／异gameId有效信封），均报“操作未完成”，目录slot集合不变、`get(5)`为空、slot4与slot0及live App保持。完整入口`verify_publication_chain_browser.mjs --node-service --player-client --player-app --public-player`通过，主链10项／公开App12项，结果`.dragon-analysis/release-readiness/publication-chain-browser-869N1n/result.json`。只加夹具断言，无产品改动；跨窗口恢复矩阵与原生TCP/TLS仍未证明，A28仍部分。
- **采纳回归修复（只改测试）**：新默认28805落地后，`editor_trusted_copy.mjs`重注册新默认元组（manifest 807e2d3b/14268、entity 7e7fad／775／runtime 537e6af、provenance新registryId，均经磁盘byte核对）；`editor_stage_source.mjs`改直读pinned字节逐role验sha（server pinned保持47e）；`publish-runtime-stage.mjs`对当前默认两目录补未跟踪豁免文件（game-source.json仍排除）。`stageInstalledEditorSource`冒烟恢复`approved-builtin-47e358-entities086-1`／87对象。维护源`editor-game-save-exchange.md`已同步。loader消费者抽查`chapter_city_history` 7组／`chapter_people` 13组通过（inputHashes 41，新元组）。
- **stage_ui红（根因已锁定，待用户拍板A/B）**：`verify_editor_backend_stage_ui.mjs` r70/r71均在复制run步404。已复现并定位：`server/admincopy.js:98`用默认loader从已暂存47e字节执行复制，loader门已跟新默认28805 → `SOURCE_ROLE_NOT_REGISTERED`（reserve 202/GET 200/run 404；`COPY_NOT_FOUND`系调试夹具键不一致误报，已排除）。loader已恢复到通过copy_profile／主链的28805工作态。走法A（loader加显式tuple、server传47e）与“旧副本不再使用”相悖；走法B（server pinned跟进28805及policy/verifier重定pin）属pinned身份变更，需用户明确授权。未擅动，待决。（后续：用户选走法B，已由§39解决，r73 PASS。）

## 38. A30阶段0退休原型交付（E-01-BACKEND-DELETION-INVENTORY-1）

- **交付**：新建`tools/fixtures/retirement-prototype.mjs`（检查点校验＋显式保留／退休分支读取器，fixture-only）与`tools/verify_deletion_retirement_prototype.mjs`，7组通过，收据`.dragon-analysis/deletion-retirement-prototype/result.json`。无产品代码、DDL、锁、收据格式、屏障或DELETE能力改动。
- **覆盖**：退休代删chunks后仍返回同一最小身份凭证（operationDigest由事件行重算，不读chunks）；同态下保留路径entry/next/幂等重放三处均报`DISTRIBUTION_LEDGER_CORRUPT`；退休分支拒非退休代（无静默穿透）；保护代（GAME_B）读写不受影响；旧键重放仍去重；篡改检查点（未知代／空集／异authority／未知锚／复用操作摘要）全拒；退休集是数据（换退代2的检查点同样生效），非硬编码。只读路径前后SQL快照一致。
- **未覆盖**：检查点kind命名（待阶段0评审后定）、阶段1产品分支、阶段2外部依赖。A30仍未完成。

## 39. server pinned跟进28805（B-解耦，stage_ui复绿）

- **动因**：采纳后server pinned仍47e，`admincopy`用默认loader（28805）从47e暂存复制→`SOURCE_ROLE_NOT_REGISTERED`，stage_ui r70/r71 run步404。用户确认走法B（旧副本不再使用，server pinned跟进）。
- **library耦合（已披露）**：`installedAvailableLibraryPolicy`绑`baseRevision===revision`＋086 runtimeData；library（`approved-available-library-f4ba804b-1`，已生产注册）按47e/086构建，整体跟进需新库注册＋生产登记（越权），故B-解耦：源→28805，library冻结，policy拆出`LIBRARY_BASE_REVISION='47e…'`常量；library文件/注册/行为逐字节不变。library policy对象的revision字段跟源代（被`libraryassets`外无人消费；`library_policy`测试借它定位源字节，仍正确）。混合态如实记录，非隐藏。
- **改动（本地可逆，未提交；无部署、无生产注册、无commit）**：`server/pinned/world-manifest.txt`→28805字节（14268/sha `807e2d3b…`，与loader常量交叉核对）、`entity-manifest.txt`→7e7fad清单（775/`76eaca3e…`）；`sourcecatalogpolicy.js`源常量组＋注册`approved-builtin-28805f-entities7e7-1`＋LIBRARY_BASE_REVISION拆分；verifier重定pin：`source_catalog`（r/e＋totalBytes 57943821→58143656，逐role sha复核推导）、`admin_copy`（r/e＋收据字面量同步）、`library_policy`（entities＋注册断言）、`fallback_rows`（before.json 437条目按当前磁盘重基线＋oracle清单绑定改28805；该fixture早已陈旧190项，非本次打破，地图字节未变r1像素证仍有效）、`vps_trial:77`。web旧47e字节保留（删文件改玩家静态包清单，涉部署，不动）。
- **验证**：policy冒烟source 28805/41 roles＋library f4ba804b/400 roles；`source_catalog`通过；`admin_copy`通过（41 roles/20章/2540 records）；`library_policy`通过；`vps_trial` 52项通过；`fallback_rows` r4通过（oracle像素一致）；loader消费者此前已绿。`stage_ui` r73 `PASS-REAL-ROOT-STAGE-UI-SCOPED`（errors/outside双空，ui-r73.png落盘；r72已走完全部阶段无404，r73为完整收据）。
- **fallback回归 sweep**：`fallback_rows` r4、`fallback_api` r4、`fallback_jobs` r2 全绿（api/jobs/ui三处before.json化石（各~200项stale）已按当前磁盘重基线，fixture-only；三处oracle/收据像素证仍有效，地图字节未变）。`fallback_ui` r3/r4均卡在浏览器登录（`#stage-editor`不现身；同轮API调用source install 200＋copy run 200，服务层绿）。`server/editorapp.js`与`server/public/*`有多处他人未提交WIP改动，登录失败归属该UI层，与本次pinned迁移无关（迁移文件均服务层，已全绿），不碰他人改动，记阻塞待UI WIP合入后重跑。
- **trial重验（staged字节47e→28805的直接影响面）**：`trial_app_boot` attempt120（23 checks）与`trial_session` attempt12（169 checks）全绿。LSP五文件0 findings（1条`f4ba804b`内`ba`拼写误报，历史行未动）。`author_create`为mock注册表，无需改。

## 40. A30阶段1-ledger分支（产品，kind已定）

- **依据**：§36三问20261030已批复（屏障接受／kind先原型再定／阶段2外部口径）；阶段0原型（§38）已确立检查点语义，本轮定产品kind为`retirement-checkpoint` v1（本地可逆）。跨进程旧writer排空条件仍为生产前置 gate，单进程语义已按批复实现，文档 gate 保留。
- **改动（`server/distributionledger.js`，未提交）**：新增`content_distribution_checkpoints`（5列）＋`content_distribution_enqueue_barrier`（2列）两表（CREATE IF NOT EXISTS）；`retireCheckpointInTxn`（仅已确认可退：未确认409、坏输入422、锚缺失／摘要碰撞／重复pin 409）；`entry`退休分支（最小身份凭证＋retired/checkpointDigest，不读chunks；保留分支逐字节严格不变）；`enqueueInTxn`重放遇退休返回最小deduped（不读chunks）＋屏障期间新enqueue 503（`DISTRIBUTION_ENQUEUE_PAUSED`，blocked优先）；`pauseEnqueue`／`resumeEnqueue`（只停新enqueue，next/confirm/锁不变）；`status`增`enqueuePaused`。`operationStatus`／`pendingForGame`／`confirmInTxn`（已确认走收据dedupe，无payload读）无需改。
- **测试**：新`tools/verify_distribution_ledger_retirement.mjs` 11组绿（退役读chunk删除后仍返最小凭证、保留缺块仍CORRUPT、重放分支、双pin取新、屏障开关、blocked优先、22组外）；`distribution-ledger.mjs`夹具status期望补`enqueuePaused:false`；workerd schema断言重定5表/32列（+2表+7列，无新FK）；node 31组、workerd 30组+重启、`catalog_scan` 22组、stage-0原型、`publication_producer` 24组、`publication_server` 18组全绿。LSP四文件0 findings（push-only未确认，不称clean）。publisher/receipts/scan消费者迁移下轮。
- **消费者迁移（本轮，未提交）**：`vps/distribution-receipts.mjs`新增`recoverRetired`——退休代收据验证：身份四字段＋payloadDigest＋rootDigest/ETag/visibleAt逐项核对，不读、无payload回传，旧收据验证路径保留；`vps/distribution-publisher.mjs`：`checkHead`退休分支（远端根摘要与pin锚四字段比对通过即确认，不门远端ETag；保留代沿原payload路径）、`predecessor`退休分支（返回最小凭证，不回退、不重建内容）；`vps/deletion-catalog-scan.mjs`（`inspectFrozenCatalogObjects`）：退休代只列最小身份（generation/operationId/kind/gameId/operationDigest/previousDigest/retired/checkpointDigest），不读不重建正文，`retiredGenerations`单独成段，跨游戏分区只由保留代current-runtime构成（空分区不建、不删改headRuntimeReferences），仍不授删除资格；`operationStatus`语义不变。
- **消费者测试**：新`tools/verify_distribution_publisher_retirement.mjs` 6组绿（远端H=retired pin确认／篡改根拒／保留代原路径／predecessor最小凭证／旧键重放退休分支／屏障下drainOne暂停）；新`tools/verify_deletion_scan_retirement.mjs` 4组绿（双pin下retiredGenerations并集排序、跨游戏分区仅保留代构成、退休钥匙零贡献、零删除资格）；`catalog_scan` 22组、`producer` 24组回归绿。LSP七文件0 findings（push-only未确认）。证据矩阵交错/远端领先/检查点丢回执/清理竞态等场景与真实清理执行待后续轮次（清理退休正文本体、410/名称释放仍须闭包验证后开放，按既定门控）。
- **证据矩阵场景2＋场景1（本轮，未提交）**：`retireCheckpointInTxn`增恢复锁门（blocked≠null一律503拒绝退休，屏障暂停不挡检查点写入；远端领先／缺失／外authority保既有锁不绕行），退休测试补被锁实例用例（11组仍绿）。交错场景：scan-retirement改三代交错（gen1 A旧／gen2 A进+OTHER现／gen3两游戏原样结转），退gen1后断言：分区仅保留代构成（GAME头K1经gen2+gen3结转、OTHER头K2，历史空），retained payload逐字节可解析且OTHER条目runtime键保持，旧键重放gen1走退休最小、gen2走保留全验证（5组绿）；运行时刻证明跨游戏同key在合法目录中不存在（runtime key按合同嵌入gameId/ordinal/releaseId），退休相关的共享是同一key被多个保留代引用。publisher-retirement补退休head的gameId/kind断言（6组绿）。回归：ledger31组、catalog22组、producer24组全绿；LSP三文件0 findings（push-only未确认）。
- **证据矩阵场景3（本轮，未提交）**：退休测试补文件库重启段（13组绿）：pin随库持久，close/reopen后退休读/重放/摘要逐值可读；模糊提交重试同pin报409且pin表仅一行，恢复按实际读回推进。LSP单文件0 findings（push-only未确认）。剩余矩阵（清理竞态/备份恢复）须等真实清理执行；清理本体（退休正文删除+持久进度+幂等续清）与410/名称释放仍按门控排后。
- **证据矩阵场景4-清理执行（本轮，未提交）**：`cleanRetiredChunksInTxn`（未知pin 404／坏输入422／非退休代409；幂等并集收敛，`deleted/remaining`进度）＋`completeRetiredCleanupInTxn`（逐代缺失读回＋非pin退休代豁免＋保留代逐代完整校验，缺块INCOMPLETE 409／保留损坏CORRUPT 503；重复关闭重验时间单调）。新库表`content_distribution_cleanup`（6列）；workerd schema断言重定6表/38列。退休测试18组绿；node31、workerd30+重启、catalog22、stage-0、producer24、server18全绿。LSP三文件0 findings（push-only未确认）。pi-lens delta层报184/211 `state`未使用×8次，经grep/sed/awk+cat -A/read工具/node --check六重取证为裸`this.#state();`调用、无声明残留（注释编辑后行号零漂移），系`#state`私有方法名误判＋快照冻结，实锤误报，不改正确代码。
- **证据矩阵场景5-备份恢复（本轮，未提交）**：新`tools/verify_distribution_ledger_backup_restore.mjs` 7组绿（文件拷贝即备份；恢复后退役读仍最小凭证、保留代payload完整、他游戏完好、新enqueue+confirm可继续；缺pin／篡改pin均报CORRUPT拒绝复活）。实现中修复三处测试bug（同game连续publish致GAME_PENDING、先补clean/complete实参、deepEqual数组断言）；finally掩盖真实断言教训：调试改用catch透出真实错后再清场。LSP单文件0 findings（push-only未确认）。
- **完成门评估＋备份清除机制（本轮，未提交，resume 1和2的可执行部分）**：新`tools/fixtures/deletion-completion-readiness.mjs`（`assessDeletionCompletion`：十要件逐项实证——writer排空/SQL清理/私有清除/名称释放/缓存清除/恢复排除为证据槽（缺即关），ledger退役覆盖验真pin＋`completeRetiredCleanupInTxn`收据形状，他游级联查活，备份清除验收据链；全过才开，无一默开）＋新`tools/verify_deletion_completion_readiness.mjs` 5组绿（现状门关＋缺件清单精确、篡改收据仍关、合成全证据对照开且标synthetic、既有`deleteAllowed:false`断言未动）；新`tools/fixtures/backup-purge.mjs`（清单核对＋删后读回验证＋冻结收据）＋新`tools/verify_backup_purge_local.mjs` 3组绿（篡改/多余文件拒清、删净验证、清后不可恢复；仅自有测试文件）。410/名称释放面不建（无实证开则为伪报，门控保持）。LSP四文件0 findings（push-only未确认）。
- **pi-lens stale-flag留证**：delta层反复报`server/distributionledger.js:184/211 state未使用`＋备份测试`sha未使用`，经sed行级核对（两处皆裸`this.#state();`调用、无声明）、全文件`const state`六处皆被读（25处使用点）、备份文件全文无`sha`标识、`node --check`双过——实锤快照误报。本轮真问题（`cleaned`绑定、`rmSync`重导入、`code`断言）均即时修绿；误报文件正确代码一律不碰。
- **证据矩阵清理竞态（本轮，未提交）**：新`tools/verify_distribution_ledger_cleanup_races.mjs` 6组绿（部分清理[1]/续清[2]并集收敛＋重复幂等；未删先关INCOMPLETE且态留in-progress；清理中他游新发布落地且保留、close-out计入；旧writer晚回放最小dedupe且零复活、tail不变；屏障下清理照常、新enqueue照停、resume后恢复；双pin交错独立关闭且entry取新pin）。实现中修测试两处（op4先用后声明致幽灵新代；gen4未确认致退役409——皆产品行为正确、测试编排错）。回归：retirement18/node31/catalog22/producer24全绿。LSP单文件0 findings（push-only未确认）。
