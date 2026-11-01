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

### B1 菜单重构（已执行，2026-11，未提交）

- **范围**：`server/public/client.txt` 的 `views` 由 13 项改为 10 项四元组（id／显示名／管理员限定／分组 `workbench|game|admin`）；`Workbench.vue` 按「工作台級／遊戲級／管理員」三标签拉平渲染，新增顶部 `#current-game` 选择器（`draft.refresh()` 取清单、`draft.chooseGame()` 切换，取消确认后原生 select 回退）；移除階段任務／階段結構／素材庫／刪除追蹤的菜单项与面板挂载（组件文件、`stage.js`／`stageassets.js`／`library.js`／`management.js#installGameDeletion` 及服务端能力全部保留，client 仍构造这四个控制器以维持 `canLeave`／`pagehide` 守卫）；`ChaptersPanel.vue` 为遊戲章節占位页（B4 接线）；`CopyPanel` 移除「刪除追蹤」按钮与其 `openDeletion` 通路；`系統資源` 解除管理員限定。
- **顺带修复（B1 直接依赖）**：`editorapp.js` 新增只读目录实例 `libraryBrowser`（`readRole: ['admin','author']`）供 `/api/resources`、`/api/resources/asset` 使用。原因：菜單解除系統資源的管理員限定后，作者点开资源页会因 `availableLibrary.readRole` 只有 admin 而在 asset 请求上 403。`availableLibrary` 的安装／登记路径未放宽（`install` 仍有 `actor.role !== 'admin'` 守卫）。
- **证据**：`node editor-ui/build.mjs --check` 通过（561386B／37733B／8 包）；`node --check` 覆盖 client.txt（复制为 .mjs 校验）、copy.js、editorapp.js、verify_editor_shell.mjs；`git diff --check` 通过；静态壳矩阵 `verify_editor_shell.mjs` PASS 82 checks（含新增 view-section×10、view-label×10、menu-groups、cancelled-views-absent、current-game-selector）。浏览器（本地 `node tools/dev_editor.mjs --port 8455`，全新 profile）：`PASS-B1-MENU-CLICKTHROUGH` — 10 项菜单顺序＝合同、三分组标签、4 个取消项不在菜单、逐模块进入 10 个 section 且选中态/hash 一致、取消后与确认后的顶部切换行为、非预期 console/pageerror/requestfailed 0；`PASS-B1-ROLE-GATING` — 作者只见 8 项（含系統資源、无用戶管理／上架審核）、資源清单与图片加载成功。
- **未做／待办**：B2 起的状态机、上架校验、删除强提醒、章節页、武将导入、复制范围、玩家端存档校验均未开始；`PublishPanel` 仍是旧「發布」文案与单键流（B2 重写）；`ManagementPanel` 仅改菜单名，页面内仍是旧「上架／下架／限制」管理操作（B3 重写）；顶部选择器与「遊戲管理」页内的游戏选择仍是两处入口，未合并为唯一入口；旧验证器仍按 `#menu [data-view=stage-editor|stage-assets-editor|library-editor|deletion-editor]` 导航，删除项后会失败，需随 B2／B3 一并改造：`verify_editor_backend_stage_ui`、`_stage_asset_ui`、`_library_ui`、`_fallback_ui`、`_management_ui`、`verify_editor_workbench_browser`、`verify_publication_chain_browser`（`--deletion-ui`）、`run_management_ui_r5`。JS LSP 在本机为 push-only／不可用，未取得 clean 结论（非 0 findings 的证明）。

### B2 上架管理（已执行，2026-11，未提交）

- **范围**：`PublishPanel.vue` 重写为 `#publish-editor` 上架管理表（遊戲名稱／說明／版本號／狀態／創建時間／狀態時間＋上架、刪除），`server/public/publish.txt` 重写为对应控制器，新增 `GET /api/games/submissions`（`server/metadata.js#submissionSummaries`）投影作者本人三态清单。状态全部由既有数据推导（`next_ordinal==='0' && current_release_id===null`＝草稿；有 release 且 `listed=0`＝待上架；`listed=1`＝已上架；版本号＝`content_releases.ordinal`），未新增 schema／表／列，冻结 baseline 与 `verify_editor_schema_sources.mjs` 计数不变。
- **上架**＝既有 `POST /api/publish` 管线（capture → `assertPublishable` → `hasPendingMoves` → `captureForCompile` → `validateGameSource` → `compileTrialSource` → `releases.prepare` → `playPacks.prepare` → 同事务 pin＋ordinal），版本号由服务端 release 账本配发，UI 只用 `nextVersion` 做「本次將是 X」的显示推导。管理员同意上架仍走既有 `POST /api/games/<id>/listing`（B3 才重写审核页）。
- **交互决定**：上架／删除的同意放在 Vue 强提醒（`ElMessageBox.confirm`），删除文案含「刪除整個遊戲（含所有章節與已上架版本），不是刪除單個版本／立即生效且不可恢復／不刪玩家本地存檔」；控制器自身的原生 `confirm` 只用于「同鍵重送」「只停本分頁追蹤」两个恢复动作。
- **操作关联（journal）语义**：单一 sessionStorage 键 `editor-submission-operation:<actorId>`。取得回执即結案（`store(null)`），否则作者在每次上架成功后必须先点「放棄」才能再上架下一版；服务端 **4xx 明確拒绝**同样結案（本次未提交，修正后可直接重试），只有「失去回應／5xx／回执校验失败」保留原键并要求先只读查詢、僅 GET 404 允许同键重送。这条区分是本轮新增规则，`verify_publish_ui_model.mjs` 与 `verify_publication_ui_browser.mjs` 均已锁定。
- **证据**：`tools/verify_publish_ui_model.mjs` 12/12 pass（三态投影、坏行拒绝、精确 body＋key、4xx 結案、lost POST 仅 GET404 可同键重试、删除 body＋行消失、删除拒绝 listed／stale revision、删除回执必须 +1、坏 journal／存储失败不发请求、账户版本与身份切换、POST 成功但后续观察 404 不抹除回执、distribution kind 错误不推定公开）；`tools/verify_publication_ui_browser.mjs` 重写为 B2 gates 并 PASS（静态路由／头部／HTML／client 直连 `editorapp.fetch`，API 用受控响应，7 段：清单投影＋开页不发请求、上架强提醒＋422 不改状态、lost POST 保留原键＋reload 只恢复关联、只读查询后同键重送、删除强提醒＋取消＋确认后行消失、账户版本变更禁止重送、其他账户看不到前一位 journal；截图 `rejected.png`／`delete-warning.png`／`deleted.png`）；`tools/verify_editor_shell.mjs` PASS 82 checks（`publish-vue-owned` 断言改为 `actions.publish(row.gameId)`／`actions.remove(row.gameId, row.rowRevision)`）；`node editor-ui/build.mjs --check`（637821B／53828B／10 包）、`node --check`（metadata.js、editorapp.js、publish.txt 复制为 .mjs、两个验证器）、`git diff --check` 均通过。
- **本地真机流程**（`node tools/dev_editor.mjs --store .dragon-analysis/b1-dev-store --port 8455`，全新 profile，禁 IDB，单会话）：`PASS-B2-SUBMISSIONS` — 草稿行版本「—」→ 造 `DRAFT_TOPOLOGY_BROKEN`（`POST /api/games/<id>/topology/move`）后点上架，弹出「版本號自動 +1（本次 X）…提交管理員審核」强提醒，提交后报「仍有據點移動意向」且状态仍草稿、版本仍「—」→ 清除意向再上架得待上架 1.0 → 再上架 1.1（状态不倒退）→ 管理員在上架審核同意后为已上架且删除按钮禁用（title 含「上架審核下架」）→ 删除一游戏：提醒含三个必检短语、取消保留行、确认后行消失且 result 含「不可逆刪除柵欄」→ reload 后状态保持。截图与 result.json 在 `.dragon-analysis/b2-ui/`。
- **未做／待办**：① 已上架游戏的删除仍被服务端 `GAME_LISTED` 拒绝（`deletionfence.js`），合同 §6「任何状态可删」需管理员下架能力，随 B3 一起做；② 拒绝态「已駁回」标记未做（需管理员拒绝流程，B3）；③ 管理员上架审核页 `ManagementPanel` 仍是旧操作，B3 重写；④ `tools/verify_publication_ui.mjs` 在本轮改动前即已损坏（脚本无 DOM 却调用 `nodes[...].onclick()`，TypeError），未修；⑤ `tools/verify_publication_chain_browser.mjs`、`verify_publication_server.mjs`、`verify_vps_editor_server.mjs`、`verify_frozen_player_surface.mjs` 未逐一重跑（它们依赖 `/publish.js` 文件名与旧发布链语义，需在 B3 审核页落地后统一核对）；⑥ JS LSP 在本机 push-only／不可确认，仅以 `node --check` 作为语法门。

### B3 上架審核（已执行，2026-11，未提交）

- **范围**：`#management-editor` 由旧 `ManagementPanel` 改挂新的 `ReviewPanel.vue`（`#review-editor`，管理員專屬、跨創作者）：表格列 遊戲名稱／作者／說明／版本號／狀態／創建時間／狀態時間／操作；狀態列顯示 草稿／待上架／已上架，被拒的待上架版本另加「已駁回」`ElTag`。旧 `ManagementPanel.vue` 文件保留但不再挂载（下架／限制能力仍在服务端与 `management.txt`，本轮不给 UI 入口）。
- **服务端**：新增 `GET /api/admin/reviews`（`metadata.js#adminSubmissionSummaries`，admin-only，join users 取作者，排除已 fence 的游戏，行 `{gameId,author,name,introduction,version,state,stateTime,rejected,rowRevision,createdAt}`）与 `POST /api/admin/games/<id>/review`（`management.js#GameManagement.reject`，只收 `{action:'reject',expectedRowRevision}`，复用 `#actor/#session/#keySpace/#target` 与 content_reservations／content_operations 收据，method `admin-reject`；守卫 `REVIEW_NOT_SUBMITTED`／`REVIEW_LISTED`／`GAME_CHANGED`／`BUILTIN_PROTECTED`／`GAME_DELETING`）。
- **「已駁回」= `content_audits(action='admin-reject', before_revision=<被拒 release 的 ordinal>, after_revision=<新 row_revision>)`**：读时推导 `rejected = !listed && 存在匹配当前 release.ordinal 的该 audit`；重新提交会配发新 ordinal，标记自动消失。**没有新增 schema、没有第二轮状态字段、不做时间戳比较**（同一毫秒的两个事件也不会混淆）。
- **同意上架**沿用既有管理员 listing（公告／registry／分发路径不变）；**刪除**按合同 §6 改为任何状态可删：`deletionfence.js#assertFenceable` 去掉 `GAME_LISTED`，UPDATE 同事务写 `listed=0`，`editorapp.#postDeletion` 对原本已上架的游戏推进 registry revision（公告读时按 `listed` 过滤）。作者侧 `publish.txt` 同步删除 listed 拒绝分支与 GAME_LISTED 映射。
- **客户端**：新增 `server/public/review.txt`（`installReview`，`/review.js`；staticAsset＋gateway 白名单＋`client.txt` import＋`main.js` 的 `reviewModel`／`shell.review`）。**无 sessionStorage journal**：三个动作在服务端天然收敛（同键＝原回执；换键＝`GAME_CHANGED`／`changed:false`／`GAME_DELETING`），每次点击用新键、无论成败都重读清单、`canLeave() => true`。
- **证据**：`tools/verify_review_backend.mjs`（真实 editor application 代码＋Node SQLite＋FileBucket 临时目录，6 组：跨创作者清单／拒絕回执与同键重放＋audit／全部守卫不写 audit／同意上架推进 registry／listed+pending+draft 三态删除与 pin 级联、registry 推进、fenced 消失／作者侧同带 rejected）；`tools/verify_review_ui_model.mjs`（9/9）；`tools/verify_review_ui_browser.mjs`（真 gateway 静态路由 16 条含 `/review.js`，6 段）；`tools/verify_publish_ui_model.mjs` 12/12、`tools/verify_publication_ui_browser.mjs` 7 段、`tools/verify_editor_shell.mjs` 82 checks 已同步新规则；`node editor-ui/build.mjs --check` 通过。
- **本地真机流程**（`node tools/dev_editor.mjs --store .dragon-analysis/b3-dev-store --no-watch`，全新 Playwright profile，禁 IDB）：6 段 PASS，截图在 `.dragon-analysis/b3-ui/`（`admin-review-list.png`／`admin-rejected.png`／`admin-delete-warning.png`／`admin-publish.png`／`author-publish-list.png`／`rejected-row.png`）：审核清单跨创作者显示作者与三态、草稿不可审核、已上架可删；同意上架后行变已上架；拒絕后行显示「已駁回」且拒絕键禁用；删除任意状态弹出三短语强提醒并建栅栏；作者侧上架管理同样显示「已駁回」且已上架游戏删除键可用。dev store 的游戏是用 `.dragon-analysis/b3-ui/seed.mjs` 直接落库的三态样本（真实路由仍走 SQL），不涉及正式存档。
- **未做／待办**：① 下架／限制本轮已无 UI 入口（服务端与 `management.txt` 能力保留；如需入口需另行授权并决定放在哪个菜单）；② `tools/verify_editor_backend_deletion_fence.mjs`、`tools/fixtures/deletion-distribution.mjs` 里 `listed → GAME_LISTED` 断言已成旧规则（未重跑，未修改）；③ `tools/verify_publication_ui.mjs` 仍是 B2 前即损坏的脚本（未修）；④ `tools/verify_editor_backend_stage_ui.mjs`、`_stage_asset_ui`、`_library_ui`、`_fallback_ui`、`_management_ui`、`verify_editor_workbench_browser.mjs` 等仍按 B1 取消的视图导航，未在本轮修复；⑤ 工作台级菜单与顶部「当前游戏」选择器属后续批次；⑥ 玩家端存档「游戏是否仍存在」校验未开始。

### B4 遊戲章節（已执行，2026-11，未提交）

- **范围**：`#chapters-editor` 由 B1 占位页重写为三面：① 章節定義（`era∈{bc,ad}` 标籤＋年／月／日，输入范围 年 1–65535、月 1–12、日 1–31）；② 據點章節屬性（所屬勢力含中立、是否首都、內政官只讀）；③ 武將章節屬性（所屬勢力含自由、身份與職務、外交官設／清）。`Workbench.vue` 改挂 `:model="draftModel" :actions="draft" :busy`。
- **写入口径（本轮确定的统一规则）**：全部走「命名视图＋固定 raw 槽同步」。`gamesource.js` 新增 `setChapterStart`／`setChapterCityFaction`／`setFactionCapital`／`setChapterGeneralFaction`／`setFactionDiplomat`，并把既有 `setMonarch`／`setStrategist`／`disbandFaction` 改为同步写 `factions[].raw` 与 `nativeFactionSlotRaw`；`disband-faction` 还会把其据点的 `+0x01` 写 `0x18`。势力槽 offset／哨兵：`monarch_idx@1`(0xFF)／`advisor_idx@2`(0x7F)／`capital@3`(0xFF)／`diplomat_idx@0x2A`(0xFF)。据点 **`+0x01`＝当前所属**（中立 0x18），**`+0x1A` 是原版旧所属，永不修改**（此前的错误理解已在本轮纠正并由测试锁定）。`postsHeld` 增加外交官；改所属前必须清空君主／军师／外交官职务；首都唯一且不要求该据点属于该势力（内置 20 章自有 8 例，故不得加「首都须归属」校验）。
- **服务端**：`drafts.js` capture 新增 5 个 op 白名单（`start-date` values 仅 `era/year/month/day`；`city-faction`；`set-capital`；`general-faction`；`set-diplomat`）与对应 apply 分支，`read()` 投影增 `startDate.era ?? null`、`factions[].diplomat_idx ?? null`；`copyprofile.js` 结构重放与逆序回滚同步加入这 5 个 op（新增 `revertFactionByte`／`revertCityFaction`，`revertFactionPost` 现在同时回滚固定字节）。
- **客户端**：`draft.txt` 新增 `startInputs` 暂存（纳入 `dirty()`／取消／重读清理）、`attributes` 投影（每章 `start`、`factions`(含 diplomatSlot/capital)、`generals`(含 posts)、`cities`）与动作 `setStartInput`／`cancelStartInput`／`saveChapterStart`／`cityFaction`／`setCapital`／`generalFaction`／`setDiplomat`；统一由 `submitChapterField` 执行 confirm → attempt → persist → sendAttempt，成功后自动 `load()` 回读；`accept()` 的 `postEdit` 名单扩到 9 个 op（免覆盖 metadata／resourceInputs）。
- **证据**：`tools/verify_chapter_attributes.mjs` 4/4（20 章 raw 不变量；五个 writer 写入后命名值与 raw 同步且 `factionNativeConsistencyGaps`=[]、`validateGameSource` draft／strict 均无缺口；`FixedCopyProfile.verify` 可用 5 条命令历史回滚、baseline 无 `era` 时回滚是 delete，外部新增 `start.hour` 或篡改 `+0x1A` 仍 `COPY_PROTECTED_DELTA`；20 条负例含未知章／未知城／未声明势力／非整数／超范围／保留槽 127／持职务改所属／跨势力外交官，全部拒绝且不改数据）；`tools/verify_editor_faction_consistency.mjs` 8/8（末条 test 由「旧行为锁定」改写为「命名视图与固定槽同一条命令」＋反向锁死外部篡改仍被拒）；`tools/verify_editor_draft_controller.mjs` 109/109（新增 era null/ad/bc 与 `era:'xx'` 负例、`diplomat_idx`/`capital` 投影与未知判定）；`tools/verify_editor_shell.mjs` 87 checks（新增 chapter-attribute-writers／-pipe／-revert／-controller／-attributes-ui）；`tools/verify_vps_city_save.mjs` 的 advisor-copy 期望改为「副本在任官清除那一刻已含 `+02=0x7F`」；`tools/verify_editor_copy_profile.mjs`、`verify_editor_chapter_city_history.mjs`、`verify_editor_chapter_cities.mjs`、`verify_editor_chapter_gap_reports.mjs`、`verify_editor_chapter_resources.mjs` 均通过；`node editor-ui/build.mjs --check`、`node --check`（含 draft.txt 复制为 .mjs）、`git diff --check` 通过。
- **本地真机流程**（`node tools/dev_editor.mjs --port 8443 --store .dragon-analysis/b4-dev-store --no-watch`，全新 Playwright profile，禁 IDB，`.dragon-analysis/b4-browser.mjs`）：PASS 10 checks — 登录＋`POST /api/admin/source/install`＋取完整副本→`#draft-load`（完整副本 read 需数十秒，必须等 GET 响应）→章節面 20 章／16 势力／192 据点；切纪年后年份不变、改年+日保存回读；据点所属改槽→回读；设首都→回读（势力表与据点行同时显示）；武将所属→回读；外交官设→回读且职务列显示、清空→回读；持职务武将有 20 个所属下拉为 disabled；每面一次确认对话框；pageerror／consoleerror／requestfailed 均 0；截图与 `result.json` 在 `.dragon-analysis/b4-ui/`。
- **本轮修掉的两个真 bug**：① `draft.txt` 的 `startDate` 校验把服务端恒发的 `era: null` 当非法，导致**所有真实草稿无法载入**（消息「章節紀年標籤…」）→ 改为 `era != null` 判定并加控制器用例；② `attributes` 投影误把谓词 `currentFactionRoles()` 当投影对象用（`.chapters` undefined）→ 改用 `factionRoles.chapters`（守卫由 `attributesReady()` 负责），并对 `nativeCities` 加可选链。
- **未做／待办**：① 封闭原生的 template 作者档案（`fixed-template-authoring-1`）仍不开放这些原生欄位——`replayTemplateHistory` 只允许 add-blank／copy／delete／rename，面板对非完整副本显示「只能改章名与章節結構」；② **內政官（`city.governor`）只读**：任命须联动 `general+0x17=2` 与预算 `general+0x1A`（KI `6A9B..6B70`），本批不开放；③ 外交官／内政官在 20 章内置初态皆为 null，故「先有外交官再改」等路径未被真实资料覆盖，只由负例与模型测试锁定；④ B5 武將從底層資源導入、B6 新建只複製地圖、B7 玩家端存檔校驗、B8 全章匯總校驗＋启动解耦均未开始；⑤ JS LSP 本机 push-only／不可确认，`lens_diagnostics` 未取得 clean 结论；⑥ 本地 dev store 与走查脚本（`.dragon-analysis/b4-*`）为未跟踪的本地产物，未 commit／未 push／未部署。

### B5 武將庫（已执行，2026-11，未提交）

- **范围**：`武將管理`（`#generals-editor`）的基礎資料面由「只對廢棄中立模板可用」改为所有遊戲自有來源可用，并新增「從底層資源導入」。武將庫＝`game.generals`（id 鍵 `gameId#general-<64hex>`，欄位 `name/hao/portraitRef`），章節引用＝`chapter.people`（`included/factionId(null)/overrides`）。菜单说明「**默認空**，提供『從底層資源導入』」的默认空由 `copyBuiltinGame` full 分支不再写旧槽位字典实现。
- **数据模型决定**：`game.generals` 就是文档 chapter-and-base-resources §1/§2 的遊戲級基礎資料（唯一维护源），舊槽位字典（`{0:{slot,name}}`）**不是**庫，读投影与写入路径都 fail-closed（`generalLibrarySupported`）。新建/完整副本的庫為空；章節原生 128 槽與 `people` 引用屬兩層表示並存，本批**不做**庫→原生槽 materialize（§5.2「唯一轉換點」仍未裁決），也不宣稱導入即可試玩。
- **服务端**：`web/src/content/authoring/generaldefinitions.js` 新增 `GENERAL_ID_PREFIX`／`libraryGame()`（`builtin-template|builtin-copy`，均需 `sourceId===BUILTIN_GAME_ID`）／`libraryIdentities()`／导出 `generalLibrarySupported(game)`；`captureScope` 只对 template 强制「章節 state 必須空」，完整副本的原生 state 不讀不改。`gamesource.js#copyBuiltinGame` full 分支刪除舊槽位字典寫入（保留 `compatibility.slotBindings.generals`）。`copyprofile.js#verify(capability, candidate, appliedEdits, definitionEdits, mapEdits, peopleEdits)` 新增第 6 參並去掉 `COPY_DEFINITION_PROFILE` 閘：定義庫與 people 引用改為「從 pinned baseline 前向重放 → 嚴格 compare（錯誤碼 `COPY_DEFINITION_DELTA`／`COPY_PEOPLE_DELTA`）→ 把比較 clone 歸一回 pinned 形狀（無 `people` 鍵不得多出、`generals` 還原為 baseline）」；`normalizeLibraryRoots` 在 `revertAppliedChapterEdits` 的「無章節編輯」早退路徑也執行，避免庫命令被靜默忽略。`drafts.js` 讀投影改由 `generalLibrarySupported(loaded.proof.game)` 決定（不再看 `profileRevision`），`#verifyHistory` 僅在庫不支持時才 `DRAFT_PEOPLE_PROFILE` 並把 peopleEdits 傳入 `profile.verify`。
- **客户端**：`draft.txt` 的 `definitionReady()` 去掉 profileRevision 閘（改看 `definitions !== null`）、`supported` 同源；`checkedDefinitions(rows, gameId)` 去 profile 閘；`checkedFactionRoles` 額外校驗並保留 `portrait/portraitKey`；新增 `importSelection`／`importRows()`／`importPortraitRef()`／`toggleImport`／`clearImportSelection`／`importGenerals()` 与模型 `importSource`。導入來源＝**本遊戲固定源武將記錄**（已讀修訂的每章 127 個非保留槽；不做跨章人物身份合併、不推測缺失原圖）；原圖只有命中已讀共用頭像庫（`portraitKey ?? String(portrait)`）才帶 `assetId/sha256`；一次 ≤16 名（沿用 `generalEdits` 上限），走既有 confirm→attempt→persist→sendAttempt 管線，body 僅 `generalEdits:[{op:'create',values}]`，不夾帶章節原生寫入。`clearDefinitions()` 一併清空選取。文案「中立模板」→「武將庫」。
- **UI**：`GeneralDefinitionsPanel.vue` 標題改「本遊戲武將庫（默認空）」，新增 `#general-import`（查找／清除查找／清除選擇／導入已選、表格 `data-import-key`／`data-import-toggle`、`庫中已有同名同字` 標記）；`GeneralsPanel.vue` 標題改「武將庫與章節武將」。章節引用沿用既有 `#chapter-people`（加入此章／保留未加入配置／姓名／字／頭像覆蓋／逐欄恢復繼承／移除配置）。
- **受保護邊界**：庫命令只改 `generals` 與 `chapter.people` 兩個根；原生 128 槽、faction/城市 raw、`map`、`metadata` 之外的任何 delta 仍 `COPY_PROTECTED_DELTA`。被章節引用（含 `included:false` 的配置）的定義不可刪除。
- **证据**：新增 `tools/verify_general_library.mjs` PASS 6 groups（空庫＋20 章空人物投影；導入後 `generals` 一個根且章節 state 不變；引用後 `inheritedFields/overriddenFields` 與有效值；未記錄引用 `COPY_PEOPLE_DELTA`、未記錄定義 `COPY_DEFINITION_DELTA`、摻帶原生 `force++` 仍 `COPY_PROTECTED_DELTA`；引用存在時刪除被拒、移除後可刪；舊槽位字典不支持且寫入被拒）。既有兩個鎖定「builtin-copy 必拒」的舊斷言按新規則改寫：`tools/verify_editor_general_definitions.mjs` 10 groups（新增完整副本空庫＋可用、舊字典 fail-closed）與 `tools/verify_editor_chapter_people.mjs` 13 groups；`tools/verify_editor_people_history.mjs` 12 groups（扁平端口現按重放校驗，未記錄引用改報 `COPY_PEOPLE_DELTA`）。另：`verify_editor_shell.mjs` 87、`verify_editor_draft_controller.mjs` 109/109、`verify_editor_general_references.mjs` 4/4、`verify_chapter_attributes.mjs` 4/4、`verify_editor_copy_profile.mjs` PASS-PINNED-COPY-CONTENT-DELTA、`node editor-ui/build.mjs --check`（670154B／53828B／10 包）、`node --check`（drafts/copyprofile/generaldefinitions/gamesource/draft.txt 副本）、`git diff --check`。
- **未做／待办**：① 能力（`ability`／`specialty_low_bits`）仍屬章節原生只讀欄位，導入只帶姓名／字／頭像——導入能力需先裁定作者層欄位與凍結聲明；② 庫→章節原生 128 槽的 materialize（含 B6「新建只複製地圖」後章節如何取得武將）未做；③ 導入來源目前取本遊戲固定源記錄，minimal 複本（`copyEntitySourceRecords` 只允許 `builtin-copy`）尚無 `sourceRecords`，B6 需一併決定底層資源如何隨新遊戲攜帶；④ 同章／跨章同名記錄不自動合併（避免發明人物身份），庫中可能出現重複條目，需作者自行取捨；⑤ B6 新建/複製範圍、B7 玩家端存檔校驗、B8 全章匯總校驗＋啟動解耦未開始；⑥ `tools/verify_editor_backend_copy_profile.mjs` 需外部 fixture 路徑（`pathToFileURL(undefined)`）而未能運行，非本批改動引起；⑦ JS LSP 本機 push-only／不可確認，僅以 `node --check` 作語法門；⑧ 本地 dev store 與走查產物（`.dragon-analysis/b5-*`）為未跟蹤本地产物，未 commit／未 push／未部署。

### B6 新建／複製範圍（已执行，2026-11，未提交）

- **范围**：工作台級「新建遊戲」=`POST /api/games` → `AdminFullCopy`（`roles:['admin','author']`，`profileRevision: FIXED_TEMPLATE_PROFILE`），只複製底層地圖（含道路／放置物／192 據點定義），**不複製章節內容、不複製武將**；管理員「複製遊戲」=既有 `POST /api/admin/copies`（全套 `FIXED_COPY_PROFILE`：地圖＋20 章＋原生武將）。本批**推翻 2026-10-31「新建遊戲產出完整 20 章副本」的舊產品決定**，依 2026-11 工作台結構合同 §2 執行。
- **服务端**：`server/editorapp.js` 只改 author 實例一行（`profileRevision: FIXED_COPY_PROFILE → FIXED_TEMPLATE_PROFILE`）＋注释与 import。副本內容由既有 `copyBuiltinGame({kind:'minimal'})` 決定：`copyBuiltinGame` minimal 分支只寫 map／componentDefinitions／cities，`chapters={}`、`chapterOrder=[]`、`generals={}`；`tools/editor_trusted_copy.mjs` 的 minimal 分支再 `addBlankChapter`＋改名「第一章」（空殼首章，`state.factions/generals/cities` 皆空）。管理員整套複製完全未改動（`/api/admin/copies` 的 reserve/run/cancel、租約、收据、`copy_origins`），仍由既有 verifier 鎖定。
- **客户端**：`editor-ui/src/copy.js` 加 `mode: 'minimal'|'full'` 參數化（同一協議實現，兩種管線）：minimal＝`POST /api/games`／`GET /api/games/create/<key>`／`.../run`、原鍵命名空間 `editor-copy-operation:<actor>`；full＝`GET /api/admin/source`（取 `definition.registryId`，使用者不選來源）→`POST /api/admin/copies`／`GET /api/admin/copies/<key>`／`.../run`、原鍵命名空間 `editor-fullcopy-operation:<actor>`、客戶端另加 admin 門。新增不變量：`run` 回應若仍停在 `pending`／`running`，**不推定为已建立**，保留原鍵並要求先查詢（`needsQuery=true`）。`server/public/client.txt` 新增第二個 `fullCopyUI`（render／setIdentity／pagehide／canLeave 同步接線）；`editor-ui/src/main.js` 加 `fullCopyModel`/`shell.fullCopy`；`Workbench.vue` 把 `:copy-model`/`:copy-actions` 傳給 `DraftPanel`；`DraftPanel.vue`（遊戲管理）新增管理員限定的 `#draft-full-copy`（`#full-copy-name`／`#full-copy-introduction`／`#full-copy-create`／`#full-copy-message`），顯示條件為控制器 `visible`（=admin）。`CopyPanel.vue` 文案改「只複製底層地圖（含據點）：章節與武將庫都是空的」。
- **证据**：① `tools/verify_editor_template_root.mjs --city-names-only` 在改動前 **FAIL**（`draft.profileRevision` 實際 `fixed-copy-resources-1`），改動後 **PASS 19 groups**（含 neutral creation／chapter copy／city-name／chapter-city／admin full-copy）；其中原「admin 經 `/api/games` 必須 403」的斷言按 B6 合同改為「admin 亦可用工作台級新建，profile 仍是 template」。② 新增 `tools/verify_editor_copy_modes.mjs` 5/5（minimal 只走 `/api/games`、body 無 registryId、原鍵命名空間；full 先讀 `/api/admin/source` 再 POST `/api/admin/copies`、body 帶 registryId、兩者原鍵不共用；full 對 author 完全無請求；registry 回應缺 `registryId` 時不發 POST 也不存鍵）。③ `tools/verify_editor_shell.mjs` PASS 90 checks（新增 `copy-create-map-only`／`copy-mode-split`／`admin-fullcopy-ui`）。④ `node editor-ui/build.mjs --check` 通過（673943B／53828B／10 包）；`node --check` 覆蓋 editorapp.js、copy.js、main.js、client.txt（複製為 .mjs）、兩個驗證器；`git diff --check` 通過。
- **本地真機流程**（`node tools/dev_editor.mjs --port 8443 --store .dragon-analysis/b6-dev-store --no-watch`，全新 Playwright profile，禁 IDB，`.dragon-analysis/b6-browser.mjs`）：PASS 7 checks，`consoleErrors`／`pageErrors`／`requestfailed` 全 0 —— 登入＋改密＋`POST /api/admin/source/install`；工作台級新建 → 新遊戲 `draft?revision=1` 為 **1 個空白首章（factions/generals/cities 皆 0）＋武將庫 0＋cityDefinitions 192＋chapterCities 0**；逐模塊走查（遊戲章節 0 列、城池據點 192 列、武將庫 0 列、地圖管理 canvas 就緒）；管理員「複製遊戲」→ 新遊戲 **20 章／每章 128 武將＋192 據點／勢力保留**，UI 章節下拉 20 項；作者帳號：`新建遊戲` 可用、`複製遊戲` 與 `上架審核` 不存在。截图与 `result.json` 在 `.dragon-analysis/b6-ui/`。
- **未做／待办**：① **新遊戲（空殼作者檔案）的章節屬性面仍只讀**：`draft.txt` 的 `attributes.supported` 只認 `fixed-copy-resources-1`，template 遊戲顯示「本修訂屬封閉原生的作者檔案…請改用完整副本再編輯」；B4 的 5 個原生寫入（start-date／city-faction／set-capital／general-faction／set-diplomat）在 `replayTemplateHistory` 仍被封閉。② **新遊戲沒有「從底層資源導入」來源**：B5 的導入來源是本遊戲固定源章節武將記錄，空殼遊戲沒有該投影，`#general-import` 不顯示——「底層資源如何隨新遊戲攜帶」仍是待裁決項（B5 未做③）。③ 庫／章節 → 原生 128 槽 materialize 仍未做，新遊戲的 192 據點／128 武將章節資料沒有建立通路，故新遊戲目前不能試玩或上架。④ 管理員「複製遊戲」建立後不自動刷新「當前遊戲」清單（需按「重新整理」），未加自動刷新以避免與 `busy` 互鎖。⑤ `tools/verify_editor_copy_controller.mjs` 在此批之前已失效（斷言 `refreshSource`／`run`／`cancel`／`model.copyState` 等舊 copy 控制器 API，TypeError），本批未重寫，改以新增的 `verify_editor_copy_modes.mjs` 覆蓋；⑥ JS LSP 本機 push-only／不可確認，只以 `node --check` 作語法門；⑦ 本地 dev store 與走查產物（`.dragon-analysis/b6-*`）為未跟蹤本地产物，未 commit／未 push／未部署。

### B7 玩家端存檔校驗（已执行，2026-11，未提交）

- **范围**：「遊戲已不存在」的載入提示与可选的本地存檔删除；「版本不符」维持既有自動清除（合同 §9 已註明，不重開逐檔確認）。判定用 **reader 的明確 fact**（`410 GAME_DELETED`），**不是**「公開目錄沒有這一行」——目錄缺失、未上架、任意 410、503、網路失敗都不構成删除事实，也不授權刪本地存檔。
- **新增 `web/src/player/playerdeletedgame.js`（唯一维护源）**：`GAME_DELETED_SAVE_NOTICE`（合同 §9 原句）、`isGameDeletedFailure`（僅 `code==='GAME_DELETED' && status===410`）、`confirmGameDeleted({reader,gameId})`（`reader.status` 成功＝false；只有上述 fact 為 true；其它錯誤原樣拋出不降級為「已刪除」）、`discardLocalSaves({store})`（逐槽 `store.get`→`token.bodyDigest===row.bodyDigest`→`store.compareDelete`；正文缺失／摘要不符／CAS 衝突／非槽位行一律 **保留並計入 kept**，不整庫清空）、`mountDeletedSavePrompt({root,store,onExit})`（兩個按鈕＋`role=status` 結果行；右鍵＝保留；清完只留「返回首頁」，不提供第二次刪除）。
- **两个入口（都是「載入存檔」）**：① `playerpublic.js` 的公開載入入口：`mode==='load'` 且 registry 目錄無此遊戲時才呼叫 `confirmGameDeleted`，成立則 `catalog.close()`＋`mountDeletedSavePrompt`（`onExit=initialPage`）；不成立仍走原 `showFailure`（文案仍「沒有刪除存檔」）。② `playerrestore.js` 的讀檔選擇器：`refresh()`／`choose()` 收到 `GAME_DELETED`（選擇器開著時遊戲被刪）進入 `deleted` 階段，同文案＋「刪除本機存檔／保留存檔」；刪除成功→`deleted-done`（只留「關閉」），失敗→保留原存檔並可重試。**選擇器在任何本機正文讀取之前就會顯示提示**（`loadPlayerChapters` 先於 `store.list()` 失敗）。
- **版本不符**：仍由 `playerrestore.refresh()` 的舊版清理（`releaseId` 不同且 ordinal 較小、`agrees()` 通過、`reader.status` 再核當前一版）自動清除；無法判定的行保留且不載入，行為與 B2 起相同，本批未改。
- **证据**：新增 `tools/verify_player_deleted_saves.mjs` **10 checks**（僅 410 為事實；listed／unlisted／其它 410／503 都 false 或原樣拋出；`discardLocalSaves` 只在 token 與摘要一致時刪、失效行與 CAS 失敗行全部保留、非槽位行不讀正文）；`tools/verify_player_restore_browser.mjs` **37 checks**（原 29 ＋ 8 個 B7 gate：提示文案、`gets` 為空即未讀本機正文、保留後目錄仍 `[0]`、確認後目錄 `[]` 且只留「關閉」、刪掉正文但留下摘要的槽被保留並報「另有1個無法核對的存檔保留未動」、獨立提示元件三條路徑——右鍵保留／保留按鈕／目錄讀取失敗→「刪除未完成」後仍可保留、確認後不再有刪除鍵且「返回首頁」才結案）；`--alternate-faction --large-ordinal` **38 checks**；新增 `tools/verify_player_deleted_entry_browser.mjs` **6 checks**（真實 `web/index.html?formalGame=..&mode=load` 入口＋真實 Chromium 原生 IndexedDB＋route 履行的同源 HTTPS reader，不開監聽：410 → 只有刪除提示（無 `player-public-failure`）→「保留存檔」→ 導回初始頁且存檔仍在 → 重進→「刪除本機存檔」→ 目錄清空、無第二次刪除鍵→「返回首頁」→ 右鍵→保留）；`tools/verify_player_saves.mjs` 36、`tools/verify_player_module_layout.mjs` 7、`node editor-ui/build.mjs --check`（673943B／53828B／10 包）、`node --check`（5 個新／改檔案）、`git diff --check` 通過。
- **测试夹具的形状（重要）**：`tools/fixtures/player-restore-browser.mjs` 的 `reader.status` 只对**对象形**调用（`{gameId}`，即讀檔選擇器的清理前重核）施加 `holdStatus` 阻塞；`loadPlayerChapters` 用的是字符串形，故意不受阻。B7 的 `deleted` fact 用 `const id = typeof request==='string' ? request : request?.gameId` 判定，**不要**順手把 holdStatus 條件也改成 `id===G`，否則「舊 token 清理被 CAS 拒絕」那條 gate 會因為阻塞點前移而失效（本批曾踩到，已還原並保留原形狀）。
- **合同衝突處理**：`editor-workbench-structure.md` §9 原文對「版本不符」也寫「確認後刪除、取消保留」，與 `../AGENTS.md` §2.3 已批准的「版本更新→舊檔不能用並自動清除，原『選擇A續玩／單檔確認清理』政策已撤銷」衝突。依已批准政策與更高層約定：版本行維持自動清除，並在 §9 表格加上「本機存檔處置」列註明；只有**刪除遊戲**這一項才做逐檔確認。
- **未做／待辦**：① 首頁「不可用存檔管理」仍是**只讀檢視**（`playercatalog.js` 明示不從此清除），沒有為「已刪除遊戲」的目錄行提供刪除入口——它需要對每個本地目錄 gameId 逐一查 `reader.status`，屬新產品決定，本批未做；② 未上架（`listed=false` 但遊戲存在）仍走通用失敗頁，不提示刪檔；③ 正在進行的會話被刪仍由 `playersessionhost.js` 既有的「遊戲已刪除…本機存檔保留」對話框處理（不刪檔），與 B7 不同入口、不同語義；④ `playerpublic.js` 的 6 行接線只在 `verify_player_deleted_entry_browser.mjs` 中以 route 履行的 reader 覆蓋，未在真實 VPS／Cloudflare reader 上跑（本地無 /play-api）；⑤ 新 `playerdeletedgame.js` 已加入 `verify_static_release_package.mjs` 的 `playerModules` 清單，但該重入口未在本批重跑；⑥ `tools/verify_player_restore_browser.mjs` 的 fixture 種子存檔是**store 級記錄（合成 snapshot）**，只證明提示與清除路徑，不代表可載入的完整存檔；⑦ JS LSP 本機 push-only／不可確認，只以 `node --check` 作語法門；⑧ 本地產物 `.dragon-analysis/release-readiness/player-*-browser-*` 為未跟蹤目錄，未 commit／未 push／未部署。

### B8 全章匯總校驗＋啟動解耦（已執行，2026-11，未提交）

- **范围**：① 上架前的全章匯總校驗（逐章列出因基礎資料缺失而引用不到的章）；② 啟動解耦——R2 不再作為開機條件。
- **服务端判定（唯一维护源）**：`web/src/content/authoring/gamesource.js` 新增 `chapterBaseReferenceGaps(game)`／`chapterReferenceReport(game)`。四類缺口：`CHAPTER_MISSING`（`chapterOrder` 指向不存在的章）、`CHAPTER_GENERAL_MISSING`（`chapter.people` 指向武將庫已刪定義）、`CHAPTER_CITY_MISSING`（`chapter.cities` 指向已刪據點定義）、`CHAPTER_CITY_SLOT_MISSING`（章節原生據點記錄的固定槽在底層定義中已無對應）。章名只取作者命名，缺名留 `null`，由呼叫端退回章節 id（不偽造名稱）。
- **上架門**：`server/editorapp.js#publishPin` 在 `captureForCompile` 之後**先**跑逐章清單，`fail(422,'PUBLISH_CHAPTER_REFERENCES',{chapters})`，**再**跑 `validateGameSource`。順序是硬要求：據點定義缺失時 `validateGameSource` 只會回一句 `requires 192 cities`，會蓋掉逐章原因。`server/security.js` 的 `HttpError`／`fail` 增加可选 `detail`；`server/public/client.txt` 的 `api()` 把它掛到 `error.detail`；`editorapp` 兩處 catch 統一走 `errorResponse()`，無 detail 時錯誤封包形狀不變。
- **只讀入口**：`GET /api/games/<id>/draft/chapter-references`（不帶 query）→ `server/drafts.js#chapterReferences`，走**同一** `captureForCompile`（修訂由服務端取 `listOwn().draftRevision`，客戶端不能挑版本），回 `{version,gameId,draftRevision,sourceDigest,chapterCount,chapters}`；不改資料、不發 Trial、不寫收據。UI 在「上架管理」每行加「校驗整遊戲」（`server/public/publish.txt#check` ＋ `editor-ui/src/PublishPanel.vue`），收到 `PUBLISH_CHAPTER_REFERENCES` 時直接用 `error.detail.chapters` 顯示被拒清單（回執逐項驗證，未知形狀一律拒絕）。
- **启动解耦**：新增 `vps/r2reachability.mjs#isRemoteUnreachable`：只有傳輸層失敗（`ENOTFOUND/ECONNRESET/ETIMEDOUT/…`、`R2_REQUEST_TIMEOUT`／`R2_RESPONSE_*`／`STATIC_RESPONSE_*`、`R2 get|put|control put|delete|list` 的 5xx／429）算「不可達」。`vps/publication-main.mjs` 把「程式位元組歸檔＋操作員登記」包進 try：不可達→`staticArchive='unreachable'`／`registration='skipped'` 並繼續；`vps/publication-server.mjs` 的 `checkHead()` 不可達→`remote='unreachable'` 並繼續監聽；`status()` 增加 `remote` 與 `startup` 兩個如實欄位。**權威事實與未分類錯誤仍然監聽前失敗**（遠端超前／回退／舊協議／權威 id 不符／收據不符），因為那是需要人工介入的狀態，不是暫時不可達。
- **证据**：`tools/verify_chapter_references.mjs` 8 checks；`tools/verify_publish_ui_model.mjs` 14/14（＋2 個 B8 用例）；`tools/verify_publication_main.mjs` 93 checks（原「遠端中斷即 startup-failed」改判降級啟動；新增歸檔不可達仍啟動＋下次啟動不重傳已完成物件；新增未分類錯誤與舊協議根仍 fail-closed）；`tools/verify_review_backend.mjs`、`verify_editor_shell.mjs` 90 checks、`verify_static_release_package.mjs`、`verify_editor_chapter_people.mjs`、`verify_editor_general_definitions.mjs`、`verify_editor_faction_consistency.mjs` 全綠；`node editor-ui/build.mjs --check`、`node --check`（含 `.txt` 模組以副本檢查）、`git diff --check` 通過；改動 `web/src` 後已重建 `server/public/trialweb.txt|trialapp.txt|playapp.txt`。
- **本地真機流程**（`node tools/dev_editor.mjs --store .dragon-analysis/b8-dev --port 8443`，全新 store ＋全新 Playwright profile，禁 IDB，腳本在 `/tmp/b8/walk.mjs`）：10 個一級模組逐一可見；`POST /api/admin/source/install`＋`/api/admin/library/install` 200；上架管理「校驗整遊戲」→ 真實後端回 `整遊戲校驗（修訂 1，共 1 章）：全部章節引用完整。`（另有一次 422 `GAME_NAME_OCCUPIED` 的重複新建，屬預期拒絕）。
- **未做／待辦**：① **作者介面無法製造懸空引用**（`generaldefinitions.js` 拒絕刪除被引用定義；據點 192 鎖且無刪除 op），所以「上架被阻止並列出受影響章」只在 Node／controller 層以受控刪除變體驗證，**不做**可從 UI 觸發的假承諾；② 據點／地圖檔案層的刪除入口仍不存在，等於本檢查目前只能攔「來源漂移／外部導入」造成的缺口；③ 降級啟動下「上架」仍可本地提交（既有語義：本地提交、分發確認、管理員同意是不同事實），未新增發布閘，也未在 UI 標示 `remote=unreachable`；④ R2 恢復後不自動補做本次跳過的歸檔／登記，需下一次啟動；⑤ 既有的 `tools/verify_editor_workbench_browser.mjs` 自 B3 重排選單後即失效（腳本仍期待 `#stage-editor`／`#library-editor`／`#deletion-editor` 與 `#management-editor` 面板，而 `Workbench.vue` 只用 `ReviewPanel` 渲染 `management-editor` 視圖、`ManagementPanel.vue` 已無引用），本批未修；`tools/verify_editor_template_root.mjs` 預設長模式在 HEAD 就有 `ad.generalDefinitions` 期望 `null` 的過期斷言（`copyBuiltinGame` 自帶 `generals:{}`），同屬既有失敗，本批未改。
