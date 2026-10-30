# v0.1.9 发布审阅

用户明确授权：审查全部已改动与未跟踪文件，保留产品代码、测试、迁移和必要文档，排除本地代理／运行产物，创建完整提交和 Release 并推送更新；Gitea 镜像不在本次发布目标内。

## 纳入范围

- 专长低位采纳全套：`tools/install_editor_specialty_adoption.mjs`、`tools/stage_editor_specialty_candidate.mjs`、`tools/verify_editor_specialty_candidate.mjs`、新默认内容（`map-2-28805…` 56M、`entities-7e7fad…` 496K）、`docs/editor-specialty-adoption-contract.md`、loader/门重注册（`editor_trusted_copy.mjs`）、staging 解耦（`editor_stage_source.mjs`）、fixture 豁免（`publish-runtime-stage.mjs`）。
- server pinned 跟进 28805（B-解耦）：`server/pinned/` 两 manifest、`server/sourcecatalogpolicy.js`（源常量迁移＋`LIBRARY_BASE_REVISION` 拆分，library 冻结 47e 锚）；verifier 重定 pin（source_catalog／admin_copy／library_policy／vps_trial／fallback_rows oracle＋before.json 重基线）。
- A30 阶段 1：`server/distributionledger.js`（检查点表＋屏障表＋清理表，`retireCheckpointInTxn`／`entry` 退休分支／重放退休分支／`pause/resumeEnqueue`／`status.enqueuePaused`）、`vps/distribution-publisher.mjs`（checkHead／predecessor 退休分支）、`vps/distribution-receipts.mjs`（`recoverRetired`）、`vps/deletion-catalog-scan.mjs`（退休凭证＋`retiredGenerations`）。
- 测试 13 套件＋fixture：ledger 退休 18 组、node 31 组、workerd 30 组＋重启、publisher-retirement 6 组、scan-retirement 5 组、catalog-scan 22 组、producer 24 组、server 18 组、completion-gate 5 组、purge 3 组、backup-restore 7 组、cleanup-races 6 组、stage-0 原型 7 组。
- 备份页损坏导入拒收（saves.html 夹具断言，主链 10 项／公开 App 12 项）；fallback 全链（rows r4／api r4／jobs r2）；trial 重验（boot attempt120 23 项／session attempt12 169 项）。
- 必要文档：台账 A/B 重构（`checkpoint-journal.md`）、维护源同步（deletion-inventory、game-save-exchange 等）、本审阅、CHANGELOG 0.1.9、README/VERSION。
- 他人未提交 WIP（editor-ui 面板、`server/editorapp.js`、`server/public/*` 等）属产品代码一并纳入；fallback_ui 登录失败归属该 UI 层，已在台账记阻塞，不冒充通过。

## 排除

- 本地代理／运行产物：`.dragon-analysis/` 会话收据（gitignored，不入仓）、`editor-ui/node_modules`（ignored）、`/tmp` 日志、`r3/r4` 失败轮 PNG（ignored 目录内）、临时规范化 SSH 副本（已删）、凭据与 env。
- CRLF 换行差异：保留不批量重写（git autocrlf 警告属实，不改）。

## 验证

- 240 份变更／新增 JS/MJS `node --check` 全过；敏感值扫描（私钥／AKIA／ghp／xox／明文密码）仅命中 UI 标签`"變更密碼"`，无凭据。
- 阶段 1 全量回归：上述 13 套件＋workerd 重启全绿；`stage_ui` r73 `PASS-REAL-ROOT-STAGE-UI-SCOPED`（errors/outside 双空）。重型浏览器链沿用已完成独立证据，本次不重复生产操作。
- LSP：变更路径 0 findings，一律 push-only 未确认，不称 clean。最终 `git diff --stat` 见提交说明。

## 限制（不因发布而解除）

- 本次是代码 Release，不表示 VPS／R2 生产链已就绪；发布／管理／删除维护门保持 503；`deleteAllowed` 恒 false；410/名称释放无删除目标、无闭包实证不开。
- A30 阶段 2（生产 410／备份清除实证）、A31 外部（异地备份／保留政策／告警接收端）、A28 跨窗口矩阵、fallback_ui（他人 WIP 合入后重跑）仍阻塞。
- 推送仅 GitHub main＋新标签；不推 Gitea，不触发除既有自动构建外的新流水线；不做线上部署验证。
