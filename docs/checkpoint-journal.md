# Checkpoint Journal

> A 部分为长期项目记忆（事实／架构／命令／约定／坑点／主线状态），跨会话有效；B 部分为近期会话详细台账。机制与产品合同只链接维护源，不复述。历史成绩不代替当前验证，待办不自动授权实施。

## A. 项目记忆（长期有效）

### A1. 主线状态与门控（2026-10-31）

- **生产**：`https://dragon-editor.720108.xyz`；镜像 `20261031-cr8`（应用代码全量替换），healthy、重启 0。发布／管理／删除维护门仍 503；公开 registry `REGISTRY_EMPTY`；`control/current.json` 404；monitor timer active。
- **Git**：`bb35302` 已推 github main，工作树干净（另有本轮未提交的本地开发服务与三处修复）；v0.1.9 Release 已发（`278dc1b`）；不推 Gitea。
- **本地开发服务（2026-10-31 起为标准测试入口）**：`node tools/dev_editor.mjs`（默认 8443／`.dragon-analysis/dev`），同一 `createEditorService` 跑在 Node SQLite＋文件桶上，改源码自动重建并重启；不再靠改生产或起 workerd 验证功能。详见 §45。
- **默认身份**：源 `approved-builtin-28805f-entities7e7-1`（41 roles／58143656 B）；库 `approved-available-library-f4ba804b-1`（400 角色／98515 B）。旧 47e 源已从生产删除（DB 行＋87 blob），web 内旧 47e 内容字节保留。
- **本轮交付**：新建游戏（一键产出原游戏完整 20 章副本，所有登录用户可用）、游戏资源（只读分类浏览＋音频试听，启动自动登记）、单席位改「最新登录胜出」。
- **A30 阶段 1**：ledger 保留／退休分支＋检查点 `retirement-checkpoint` v1＋屏障＋清理执行＋publisher／receipts／scan 消费者迁移＋证据矩阵场景 1–5 已交付；`deleteAllowed` 恒 false。
- **阻塞**：A30 阶段 2（410／名称释放，无删除目标与闭包实证）；A31 外部（异地备份目标／保留政策／告警接收端）；A28 跨窗口恢复矩阵；原证缺口（G-INIT／道路／扩容／配方）按铁律不得猜测实现。

### A2. 架构与关键身份

- Pinned 源：manifest `807e2d3b…`/14268，entity 清单 `76eaca3e…`/775、runtime `537e6af…`，注册 `approved-builtin-28805f-entities7e7-1`，41 roles，totalBytes 58143656。staging 读 pinned 字节逐 role 验 sha（`editor_stage_source.mjs`，不再经 Web 默认门预热）。
- Ledger 库表（workerd 断言 6 表/38 列/1FK）：`content_distribution_events/chunks`＋`checkpoints`（5列）＋`enqueue_barrier`（2列）＋`cleanup`（6列）。退休读只返最小身份（无 payload 键）；保留缺块一律 `DISTRIBUTION_LEDGER_CORRUPT`；旧键重放不返 payload（只校验）。检查点是新对象新摘要，不沿用操作摘要。
- 画像库 `f4ba804b`/93632 字节/400 角色/20 消费者；`LIBRARY_BASE_REVISION` 冻结 47e；255 缺口不冒 Q69 闭包。
- 产品行为：五档提速 6.5/5.0/4.8/1.8/1.0ms、预算 16/帧，Trial 束 230 项；密码 9–128 码点、ASCII 大小写＋数字＋符号；Vue 后台 13 页迁移完成（构建逐字节，audit 0）；备份页 slot4 导入＋损坏拒收（主链 10 项／公开 App 12 项）。

- **创建路径**：`POST /api/games` → `AdminFullCopy` 走 `FIXED_COPY_PROFILE`，roles 含 admin 与 author，产出完整 20 章副本；配额 `gameLimit`（默认 0＝不限）。中立模板 `FIXED_TEMPLATE_PROFILE` 不再产生新数据，历史行按各自 `profile_revision` 读取。
- **资源浏览**：`GET /api/resources`（400 角色＋分类 portrait/image/audio/font/data）＋ `GET /api/resources/asset?path=`（支持 HTTP Range → 206/416）。角色字节按 pinned 索引分块取回拼接（单块 sha≠角色 sha，不能按整角色对象取）；库注册行由 `editorapp.#bootstrapLibrary` 在首个请求内自愈（构造期时尚无 owner 行）。
- **单席位**：`EDITOR_SINGLE_USER=1` 开启，语义为「最新登录胜出」——登录事务内删过期行、删该用户全部活会话、再插新会话，同一时刻仅 1 个有效会话。
- **CSP**：主后台 CSP 必须含 `media-src 'self'`；`default-src 'none'` 下缺失会静默拦截 `<audio>`（服务器日志看不到请求）。

### A3. 常用命令

- 本地开发服务：`node tools/dev_editor.mjs [--port 8443] [--store .dragon-analysis/dev] [--no-watch]` → 编辑器 `https://127.0.0.1:8443/`；玩家静态 `python -m http.server 8321 --directory web`。状态目录自带 sqlite／私有桶／TLS，删掉即重置。

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

- **改 `web/src/**` 任何文件都会改变源码树摘要**：`verifyInstalledProgram` 同时校验 web 根与 Trial 束 `server/public/trialweb.txt`；改了 src 必须重跑 `tools/build_trial_web_bundle.mjs`，否则启动即 `startup-failed`（错误被吞，用一次性脚本直调 `startConfiguredPublication` 打印栈定位）。
- **静态摘要变更必须重新归档**：`STATIC_RELEASE_SHA256`／`STATIC_SOURCE_SHA256`／`STATIC_PATH_PREFIX` 三处同改，且归档在监听之前完成——直接切换会停机 8–40 分钟。正确做法：先跑独立预归档（只写 R2 不可变对象、不碰 DB／端口、带 `--memory`），完成后再切镜像。
- **容器一律带内存上限**：本项目 VPS 仅 3.8G；曾用无 `--memory` 的诊断容器触发 OOM 整机重启。
- **`<audio>` 播放依赖 CSP `media-src` 与 Range 206**：缺一即控件灰、时长为 0:00，且服务器日志看不到请求。
- **静态包可不重传全部对象**：新 release 只差少数文件时，用 `cp -al` 硬链接克隆旧 static 目录再替换其中变更文件（先 `rm` 再放，避免写穿共享 inode 污染旧版本）。
- **`node -e`／heredoc 里做多行中文替换易被引号打断**：改用「写临时脚本文件 → node 执行 → 删除」，或把替换内容放独立文件再拼接。

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

## B. 会话台账

> B1 为已归档批次摘要（内容已在 v0.1.9 发布）；§42–44 为本轮（2026-10-31 生产替换、库行迁移、新建游戏与游戏资源重构）的详细进展、调试与阻塞。更早批次见 A 部分或 Git 历史。

### B1. 已归档批次摘要（§34–41，均已含入 v0.1.9 发布）

- **§34 专长低位采纳**：父 `47e358…` → 新默认 `28805…`／`19ef…`／`7e7fad`；`tools/install_editor_specialty_adoption.mjs` 原子切换（`SWITCHED-COHERENT-RELEASE`），正式证书 `a65127…`；2560 条 5 非零、24 改 14 不变；旧副本不迁移、不做兼容分派。
- **§35 A30 消费者负控**：`verify_deletion_catalog_scan` 在待发单代账本上补 entry／next／enqueue 重放三路径负控，均报 `DISTRIBUTION_LEDGER_CORRUPT`，22 组。
- **§36 A30 送审三问已批复**：①屏障只停新 enqueue、不新增解锁；②检查点 kind 先做阶段 0 原型再定；③阶段 2 为独立外部依赖。
- **§37 备份页拒收＋采纳回归**：`public-player-browser` 补截半字节／异 gameId 两例拒收（主链 10／公开 App 12 项）；`editor_trusted_copy` 重注册 28805 元组、`editor_stage_source` 改直读 pinned 字节；stage_ui 走法比较后由 §39 解决，r73 PASS。
- **§38 A30 阶段 0 原型**：`tools/fixtures/retirement-prototype.mjs`＋`verify_deletion_retirement_prototype`，7 组；确立「退休读只返最小身份、缺 chunks 不自动视为已退休」。
- **§39 server pinned 跟进 28805（B-解耦）**：源→28805，library 冻结 47e 锚（`LIBRARY_BASE_REVISION`）；verifier 重定 pin（source_catalog／admin_copy／library_policy／fallback_rows／vps_trial）；`fallback_ui` r8 解阻塞（实为夹具默认视图问题，非他人 WIP）；trial boot 120／session 12 全绿。
- **§40 A30 阶段 1**：`retirement-checkpoint` v1；`retireCheckpointInTxn`／`entry` 退休分支／重放退休分支／`pauseEnqueue`／`resumeEnqueue`／`cleanRetiredChunksInTxn`／`completeRetiredCleanupInTxn`；库表 6 表 38 列；证据矩阵场景 1–5（交错、恢复锁门、文件库重启、清理执行、备份恢复）＋清理竞态 6 组；完成门评估 10 要件 fail-closed＋备份清除。退休 18／node 31／workerd 30／catalog 22／producer 24／server 18 全绿。
- **§41 v0.1.9 发布**：347 项分类审查、240 份语法、敏感值零命中；`278dc1b`（335 文件）＋tag v0.1.9 推 github；Gitea 不推。

## 42. 生产全量替换部署（2026-10-31，v0.1.9＋单席位门）

- **授权与范围**：用户明确要求把编辑器部署整个替换掉。范围＝应用代码全量（server/vps/reader/web/tools子集/VERSION）；**不动**数据卷、env凭据（只改5个已知键）、nginx其它站点、probe/panel。旧库保留作审计，不删。
- **单席位门落地**：生产实际走`editorapp`（vps sidecar未启用），其登录本无门；按用户要求在`editorapp.#postLogin`加与vps同语义的409门（默认关闭，`EDITOR_SINGLE_USER=1`开启），并补`publication-config`白名单透传（此前Node链静默丢弃该变量，workerd直通故测试曾过）。workerd auth测试补门覆盖＋must_change过期夹具修正，全绿。
- **部署实录（只读核验＋幂等写入）**：443M tarball分片上传、SHA对版；staging与线上逐字节比对；R2只做put-if-absent预置；STATIC_*两摘要本地重算（bd0019df…/d5c1f278…，曾手误截断，已纠正并回归）；nginx新增static-v1/<新> location（复制旧块，曾误嵌套致-t失败，已回退重做）；env更新5键（pins＋单席位）；镜像`20261030-v019-singleseat`；首启完整归档约40分钟后healthy，零重启。
- **冒烟（生产）**：首页200；登录200且mustChangePassword=true；第二登录409 SINGLE_USER_ONLINE且零新会话；登出→重登200→清场零残留。source/library安装留待用户改密后做（must_change下管理接口403是预期行为）。
- **口令**：用户给定新默认口令，已按scrypt-32768-8-3重算hash并UPDATE（epoch/version+1，must_change=1，清全部旧会话，DB已先备份）。用户登录后必须自行改成正式口令；改密前不要做除登录外的管理操作。
- **回滚**：`/root/dragon-editor-backups/publication-20261030T172654Z-full`＋`app-old-20261030T175017Z`；旧static目录与旧镜像保留。已删：传输分片、诊断脚本、重复备份目录。

## 43. library 注册行摘要迁移（生产库写，用户批准）

- **现象**：部署后「固定库登记」页任何操作报 `SOURCE_PROFILE_CHANGED`，「完整副本」页同码红字；但来源 28805 新行当日已正确注册。
- **根因（生产实物取证）**：B-解耦把 `installedAvailableLibraryPolicy` 的 `revision` 从 47e 改到 28805，导致 policy 对象的 `definitionDigest` 由 `dbafe65e…` 变为 `1c0fbd17…`；而 `installed_sources` 里库行仍是 10-19 注册时的 `dbafe65e…`。`sourcecatalog.#row`／`runtimeassets.#row` 严格比对 definition_digest，不等即 409。产品无“覆盖式重登记”分支（install 只能 INSERT 新行、已存在且摘要不符即 409 SOURCE_ALREADY_REGISTERED），故无法从 UI 自愈。
- **一致性证据（只读，先于写库）**：扫描生产 `private-objects/installed/approved-available-library-f4ba804b-1/` 下全部（433 个）对象，按 `schema === 'dragon-installed-source-index-1'` 筛出两份索引；两份除 `definitionDigest` 字段外**逐字节相同**，400 roles 完全一致（`roles identical: True`）。即内容零差异，差异仅在信封摘要。
- **执行（用户批准）**：先备份 `editor.sqlite` 到 `/root/dragon-editor-backups/librarystmt-<TS>/`；`UPDATE installed_sources SET definition_digest='1c0fbd17…', root_digest='dcf0883b…', root_byte_length=98515 WHERE registry_id='approved-available-library-f4ba804b-1' AND definition_digest='dbafe65e…'`（带旧值守卫，`rowcount===1` 断言，否则中止）。结果 1 行更新，`row_revision` 保持 1。
- **未动**：47e 旧源行保留（读它报 409 是正确的退役语义，不伪造可用性）；`source_operations` 历史不动；R2/对象存储零写入（对象早已存在，且 `put-if-absent` 语义永不覆盖）。
- **遗留**：本次未重启容器（SQLite 行更新对进行中的实例立即可见），下次自然重启后同样成立；UI 侧“完整副本”页若仍选中旧 47e 源需手动切换，属陈旧选择噪音而非故障。
- **验收（生产，用户实际操作）**：库行迁移后刷新页面，「完整副本」页 `驗證並登記固定來源` → **操作完成**，源显示 `approved-builtin-28805f-entities7e7-1 — 已驗證登記`；「固定库登记」页 `建立本次驗證登記請求` → **操作完成**，库 `approved-available-library-f4ba804b-1 / 400角色 / 20未閉合引用 — 服務已登記`，原键 `24fedf02-ed25-47fe-86cc-55f36ad8f73` 已核对回应。container `healthy`、重启 0；DB 三行齐备（库 `def=1c0fbd17/root=dcf0883b/98515`、源 28805 `def=8f06cee7/root=c9b26619/18835`、旧 47e 保留）。用户已自行完成强制改密（`must_change=0`、epoch 3→4）。

## 44. 新建游戏与游戏资源重构（Web 产品决定）

- **用户决定**：菜单「建立遊戲／完整副本」→ **「新建遊戲」**，不分管理员/作者，填名称+简介(≤100字)点击一次即产出原游戏完整 20 章副本；废弃中立空壳模板。「固定庫登記」→ **「遊戲資源」**，去掉登记语义，改为只读分类浏览 + 音频试听，所有用户可看；库由服务启动时自动登记。
- **产品决定记录**：[新建游戏与游戏资源](editor-create-and-resources.md)。原版无「空白新建」也无「资源库登记」，故全部标注为 Web 产品决定，不作原版机制声明。
- **实现**：`gamemetadata.js` 简介 20→100；`editorapp` 作者创建改走 `FIXED_COPY_PROFILE`（`roles:['admin','author']`）、新增 `#bootstrapLibrary`（env 为准自愈摘要）、新增 `GET /api/resources` 与 `GET /api/resources/asset?path=`；`sourcecatalog` 增 `resourceRoles()`/`readRole()`；`admincopy` 增 `gameLimit`（同事务配额，默认 0=不限，生产未启用）；`catalog.txt` 重写为资源浏览控制器；`CopyPanel.vue`/`CatalogPanel.vue` 重写；`client.txt` 菜单改名并解除 catalog 管理员限定；`style.css` 补资源列表样式。
- **部署事故与修复（如实记录）**：

  1. 首次换镜像 `startup-failed` —— 改 `web/src/editor/gamemetadata.js` 使源码树摘要变化，但 Trial 束 `trialweb.txt` 仍内嵌旧哈希，`verifyInstalledProgram` 立即拒绝。修复：重跑 `tools/build_trial_web_bundle.mjs` 并上传束。
  2. 第二次仍失败 —— `ReferenceError: FIXED_COPY_PROFILE is not defined`（`editorapp.js:204`）。改 `authorCopies` 时用了该常量但未 import。修复：import 由 `FIXED_TEMPLATE_PROFILE` 换为 `FIXED_COPY_PROFILE`。
  3. **严重失误**：定位上述错误时用了一个未设内存上限的诊断容器，把 3.8G 内存的 VPS 打爆触发 OOM 重启（其它容器自愈恢复）。此后所有容器操作都带 `--memory`。
  4. 摘要变更需重传 1437 个对象到 R2，且归档在监听之前完成 → 直接切换会造成约 8–40 分钟停机。改为**独立预归档**（`/root/prestage.mjs`，只写 R2 不可变对象、不碰 DB/端口，内存上限 900m），生产持续服务；预归档 7 分钟完成后切换镜像，启动自检通过。

- **生产结果**：镜像 `20261031-cr3` healthy、重启 0、首页 200；菜单 `新建遊戲`/`遊戲資源`；库注册行摘要 `1c0fbd17…`（启动自登记）；源 `28805f`；游戏数 0。
- **未做**：真实登录后的功能冒烟需管理员口令（用户持有）；`verify_editor_backend_stage_ui.mjs` 的 `--copy-only` 仍引用已删除的 `#source-*`/`#copy-run` 等旧按钮 ID，待更新。
- **用户实测反馈后的修正（§44 续）**：①「確認新建」在恢复态被禁用 —— `createDisabled` 误含 `Boolean(operation) && !summary`，已移除，恢复态按钮现在可点且文案为「確認新建（續）」；②游戏资源改为**进入即自动加载**（`catalog.txt` 内 `autoStarted` + `queueMicrotask`，身份切换后允许重载），不再需要手动按钮；③音频无法播放 —— `<audio>` 会发 HTTP Range 请求，而资源端点只返回 200 全文且无 `Accept-Ranges`，已补 206/416 与 `Content-Range`（含后缀式 `bytes=-N`）；④资源列表加序号（`.resource-row .index`）。分类实测：頭像 150、圖像／圖塊 226、音樂與音效 13、字體 2（含 OFL 许可证）、其他 9，合计 400。
- **资源页二轮修正**：①列表仍空 —— 自动加载走了 `work`/`run` 包装，登录期 `generation` 递增使 `valid(t)` 失效，返回时 `autoStarted` 已置真 → 永久空列表。改为独立 `autoLoad()`（不经 busy/status、不吃 ticket、最多重试 3 次、身份切换重置），且不再产生"操作完成"噪音。②去掉卡片内重复的 `遊戲資源` 标题与说明，仅保留分类＋筛选＋列表。③资源页隐藏「未載入草稿」上下文提示（`Workbench.vue` 按 view 判断）。④进入资源页清空全局状态行（`client.txt show()`）。
- **单席位改为「最新登录胜出」（用户决定 2026-10-31）**：原实现在有活会话时直接 409 `SINGLE_USER_ONLINE`，导致「关浏览器未登出 → 30 分钟内无法再登录」。实测当时表里有一条空闲已过期 211 分钟、绝对期限尚存的僵尸会话，加一条 11 分钟空闲的活会话。改为：登录提交事务内先删过期行，再删该用户全部活会话，然后插入新会话——同一时刻仍只有 1 个有效会话（满足"不能同时多端"），但最新登录必定成功，永不锁死。`verify_editor_backend_auth.mjs` 断言同步改为「新登录 200、旧会话 401、再登录再踢」。
- **资源音频与新游戏权限修正**：①音乐试听无声——后台主 CSP 为 `default-src 'none'` 且无 `media-src`，浏览器在发请求前即拦截（nginx 日志无任何 `.flac` 请求可证）。已补 `media-src 'self'`（原有 `img-src 'self' blob:` 保留）。②「新建遊戲」报 `FULL_COPY_ADMIN_REQUIRED`——`authorCopyAccess` 仍只放行 `role === 'author'`，管理员反而被拒；已放宽为 `admin || author`（与页面所有人可见一致）。
- **页面精简（新建游戏页）**：去掉卡片内重复的 `新建遊戲` 标题与说明；该页隐藏「未載入草稿」上下文提示（`Workbench.vue` 的 hidden 条件加 `state.view === 'copy'`）；进入该页清空全局状态行（`client.txt` 同 `catalog-editor` 处理）。

## 45. 本地开发服务与三处资源读取缺陷（2026-10-31）

- **用户决定（长期有效）**：测试改为启动本地开发环境服务；无明示不 push／不部署；功能需求由用户口述，与产品合同冲突时以其为准并反向修改合同文档。
- **新增 `tools/dev_editor.mjs`（未提交）**：`createEditorService`＋`vps/sqlite-port`＋`vps/file-bucket`＋`tools/editor_local_https`，即生产同一套 `server/editorapp.js`，不是模拟实现。监视 `editor-ui/src`（重建 Vue 壳）、`web/src`（重建 Trial 束）、`server`、`vps`，变更后重建并重启子进程（壳约 4s、束 0.2s、重启 1–2s）；`web/` 顶层与 `web/intro` 回车手动重启。pinned staging 按三份 manifest 指纹缓存 `staged.json`（首次约 40s，之后 0）。监视先比对 size/mtime 指纹，Windows 递归监听的空事件不再触发无意义重启。
- **开发态偏差（仅本地，不入生产契约）**：`EDITOR_RATE_MS=1000`（生产 10 分钟会锁死连续测试登录）；本地 TLS 传输白名单放行 `range`（否则本地测不出 206）；`createEditorHTTPS(mf,{port,tls})` 支持复用稳定自签证书，避免每次重启重新信任。
- **修复 1：超过 1MiB 的单个角色无法读取**。`sourcecatalog.readRole` 原按 `installed/<id>/<role sha>` 取「整角色对象」，但 staging 只写 1MiB 分块且分块 sha≠角色 sha，因此除「恰好单块且哈希相同」的小文件外都取不到：13 个音频中 8 个、`battle_maps.json`／`battle_navigation.json` 共 10 个角色 404（此前被 4MiB `descriptor` 上限先挡成 413 `SOURCE_OBJECT_TOO_LARGE`，看起来像「文件太大」）。改为 `#roleBytes()`：读 pinned 索引→定位该 role→逐 chunk 取回拼接→校验总长与 sha。实测 `BGM_00` 9310062B／`BGM_09` 11196244B／`battle_maps.json` 2142364B 全 200 且字节数对齐。
- **修复 2：Range 恒不生效**。`editorapp.#getResourceAsset` 的正则写成 `^bytes=(d*)-(d*)$`（少反斜杠，`d*` 只匹配字面 d），永不匹配 → 只回 200 全文；§44 记的「已补 206/416」实际未成立，只是 200 能播掩盖了它。改为 `\d*`。实测 `bytes=0-1023`→206 `content-range: bytes 0-1023/9310062`；`bytes=-500`→206 尾段；越界→416 `bytes */119348`；浏览器 `<audio>` 载入 `BGM_09` 后 `duration=332.33`、`seekable.end=duration`、`readyState=4`。
- **修复 3：全新库首启永不登记库行**。`#bootstrapLibrary` 在 DO 构造期执行且要求已存在 `tianyi` 行，而该行由首个请求里的 `seed()` 创建 → 空库时直接 return，资源列表能列（policy 直读）但 asset 一律 404 `SOURCE_NOT_REGISTERED`，只有重启才恢复。改为 `libraryBootstrapped` 一次性标记＋在 `handle()` 的 `seed()` 之后重试。实测新库（仅复制 `private/`＋`staged.json`、无 sqlite）：登录＋改密后**未重启**即 200 且登记行出现。
- **观察（已更正）**：`/api/resources` 实测 400 项（portrait 150／image 226／audio 13／font 2／data 9）；`docs/editor-create-and-resources.md §3.2` 表原合计 397，已按实测改为五行 150/226/13（11 flac＋2 wav）/2/9，并把 §5 验证行的计数改同；同时把 §3.5「自动登记」从已不存在的 `publication-main` 描述改回 `editorapp.#bootstrapLibrary` 实际路径。
- **验证**：`node --check` 四个改动文件；`git diff --check`；`editor-ui/build.mjs --check` 通过（578995B／37733B／8 包）；`build_trial_web_bundle` `unchanged` 237 文件 sha `db65431…`；浏览器整页仅有登录前一条 `401 /api/session`；修复后无自触发重启。LSP 对这四个 JS 为 push-only 未确认（无 finding）。

### 45.1 配额接线、admin 建游戏 403、验证器（同日续）

- **用户决定**：`EDITOR_GAME_LIMIT` 采用「默认 0＝不限＋按 env 可收紧」，不现在收紧到 3（删除与名称释放未开放，满额会永久卡死）。文档 `§2.4`／`§5` 已按此改写并写明理由。
- **接线**：`server/editorapp.js` 构造期读 `env.EDITOR_GAME_LIMIT`（未设＝0），同时传给 `adminCopies` 与 `authorCopies`；非法值由 `AdminFullCopy` 直接 `503 COPY_QUOTA_POLICY`，不会被静默当作不限。
- **修复 4：admin 无法「新建遊戲」（403 `FULL_COPY_SOURCE_ADMIN_REQUIRED`）**。§44 只放宽了 `authorCopyAccess`（admin||author），内层 `authorSource` 仍是 `InstalledSourceCatalog{readRole:'author'}`，`#actor` 严格比对单角色 → 生产主账号（admin）点新建必 403。改为 `readRole` 接受角色数组（`['admin','author']`），`install` 的守卫改为按 `actor.role !== 'admin'` 判定，保持「只有管理员能安装固定源」。dev 实测：同一 admin 会话从 403 变 202。
- **新增 `tools/verify_editor_game_quota.mjs`**（Node SQLite/FileBucket＋自签 HTTPS，无浏览器）：限额 1 → 首个游戏 202/200；第二个 429 `GAME_QUOTA_EXCEEDED` 且不留 `copy_requests` 行（用 `GET /api/games/create/<key>` 断言 404）、`/api/games` 仍 1 条；另一账号仍可 202（按 owner 计）；重启去掉 env 后同一会话再建成功（默认不限，2 条）；`EDITOR_GAME_LIMIT=three` 构造期 `COPY_QUOTA_POLICY`。结果 `PASS-EDITOR-GAME-QUOTA`，5 项全绿。
- **附带观察（未改）**：全新部署只会自愈 **library** 行，`source` 行仍需管理员 `POST /api/admin/source/install`；在此之前「新建遊戲」返回 404 `SOURCE_NOT_REGISTERED`。dev 环境已用该接口注册 `approved-builtin-28805f-entities7e7-1`（`8f06cee7…`/`c9b26619…`/18835）。

### 45.2 固定源启动登记（方案 C，用户选择）

- **背景**：全新库只自愈 library 行，`source` 行必须管理员手动 `POST /api/admin/source/install`；在此之前「新建遊戲」404 `SOURCE_NOT_REGISTERED`。用户否决「照库静默自愈」（丢收据、降校验），选择保留审计与全量校验的启动登记。
- **新增 `vps/register-pinned-source.mjs`**：`registerPinnedSource({storage,bucket,env})` → 确保 `tianyi` 存在（与 `editorapp.seed` 同列同默认口令，`must_change=1`）→ 走**真实** `InstalledSourceCatalog.install`（逐 role/逐 chunk 重算 SHA + 写 `source_operations` 收据，actor=该管理员）→ 幂等键 `startup-<root.sha 前 32>`，同 root 重放不叠加收据。
- **失败关闭**：已登记且 root/definition 一致 → `already-registered` 快速返回（不重复 58 MB 校验）；已登记但 pinned 字节变化 → `SOURCE_REGISTRATION_CONFLICT`，交给 §43 式人工迁移，绝不自动覆盖。
- **接线**：`EDITOR_REGISTER_SOURCE=1`（`publication-config` 校验，要求同时给 `EDITOR_INSTALLED_SOURCE_ROOT`）→ `publication-main` 传 `prepare` → `publication-server` → `startEditorServer`，在 `createEditorService`（建表＋库行自愈）之后、**listen 之前**执行，端口不会暴露半配置状态。`vps/publication.env.example` 已写说明。生产未开启该开关（源行已存在），属下次部署时才生效的 opt-in。
- **验证** `tools/verify_pinned_source_registration.mjs`（Node SQLite/FileBucket＋自签 HTTPS，无浏览器）：空库 → `registered`（1 条收据、`registered_by`=管理员、root 对齐）→ 重跑 `already-registered`（收据仍 1）→ 篡改 root 得 `SOURCE_REGISTRATION_CONFLICT` → 恢复后起服务，默认口令登录 200 且强制改密、改密后 `POST /api/games` **202**（无需手动登记）、取消后 `content_games`=0。结果 `PASS-PINNED-SOURCE-REGISTRATION`。

## B3 编辑器工作台结构重构（2026-11，用户批准，代码未动）

**用户定案**（原话要点）：编辑器工作台与玩家端两个端独立；编辑器产出游戏数据、玩家端加载运行；「游戏剧本＝底层资源（地图＋武将资料）＋多个独立章节」；章节之间无推进/继承/结局/存档槽传递；地图与武将是**引用**不是复制，改属性自动传导、删了才报错；势力属章节定义（由君主决定）。

- **三级结构**：底层資源（工作台級）→ 遊戲（遊戲級）→ 遊戲章節（章節級）。菜单**拉平一级 + 顶部「當前遊戲」选择器**（原 Q/A 三选一，用户选 A）。
- **菜单终版**：工作台級＝新建遊戲、遊戲管理（原「遊戲與章節草稿」改名）、用戶管理（原「創作者帳戶」）、系統資源（原「遊戲資源」）；遊戲級＝城池據點（原「基礎資料／據點管理」）、地圖管理、武將管理、遊戲章節（「章節」两字不好看，用户改名）、上架管理；管理員專屬＝上架審核（跨创作者）。
- **取消 4 项**：階段任務、階段結構（只能用不能改）、素材庫（与系统资源重复）、刪除追蹤（并入上架管理）。服务端能力保留，只删界面。
- **状态机**：草稿 →（点「上架」，整游戏校验，无错则版本号自动 +1）→ 待上架 →（管理员同意）→ 已上架；管理员拒绝→回待上架并标「已驳回」。**只有上架需管理员同意**；无「发布」按钮（原发布按钮文字改「上架」）。
- **删除**：任何状态、任何人（作者删自己／管理员删任意）可删，无需对方或管理员同意，**立即且不可恢复**，弹窗须强提醒「删除整个游戏（含所有章节与已上架版本），不是删除单个版本」。
- **列表字段**：作者侧＝游戏名称/说明/版本号/状态/创建时间/状态时间＋上架、删除；管理员侧另加「作者」列＋同意上架、拒绝、删除。
- **复制范围**：新建遊戲只复制**地图（含据点）**，不复制章节、不复制武将（武将库默认空，提供「從底層資源導入」）；管理员「複製遊戲」才整套复制（地图＋章节＋武将）。
- **游戏章节**：开放开始年代编辑（纪年标签 公元前/公元后 ＋ 年/月/日，原 `chapter.startDate` 只读）；据点章节属性（所属势力/中立/是否首都）、武将章节属性（所属势力/身份/职务）；单章「章節運行測試」；游戏级「試運行測試」＝全章汇总校验（主要防据点/武将删除后引用不到）。
- **玩家端存档校验**：新增「游戏是否仍存在」+ 既有版本标识；不符时弹窗「…存档不可用，是否删除？」，确认即删本地存档，取消不动。
- **新增/更新的产品文档**：`docs/editor-workbench-structure.md`（结构、菜单、状态机、批次验收）、`docs/chapter-and-base-resources.md`（基础资料 vs 章节属性字段归属，按用户命名改为「城池据点」）、`docs/editor-create-and-resources.md` §2.5 复制范围与 §3.4 素材库取消。
- **待执行批次** B1 菜单重构 → B2 上架管理 → B3 上架審核 → B4 游戏章节（年代＋据点/武将章节属性）→ B5 武将导入 → B6 新建/复制范围 → B7 玩家端存档校验 → B8 全章汇总校验＋启动解耦。均未开工。
