# E-01-BACKEND-KEY-SELECTION-AUDIT-1 — 六族目标键选择模型（不接生产）

[Root键族核验](editor-backend-key-namespace-audit.md)已经确认实际guard；本批只把**当前可解释SQL归属**与未知历史分开，不把任意记录标为正常Root写者。生产sole6d6195a9/504输入111imports/375玩家保持；新的owned selectors不是生产helper，未被ValidatedFreeze/Root/waiters导入。

## 六种选择与来源

owned `backend-key-selection-preflight-r1/selectors.mjs`固定六个独立NOT INDEXED SELECT，不用UNION或拼接actor/key：

| 族 | 选择范围 | 当前Web来源及界限 |
| --- | --- | --- |
| copy | content_reservations按同actor/op_key的目标TEXTcopy_request | AdminFullCopy.reserve37-50/execute101-110；reservation保留，缺失父不猜归属 |
| draft | 目标TEXTgameId draft_requests各状态 | PrivateDrafts保存流程；选择不赋pending/failed成功父条件 |
| compile | compile_operations按当前目标TEXTjob_id | CompileJobs73-84/132-144；不按当前epoch/rowRevision重构retry历史，失父/movedjob未知 |
| command | copy_http_commands按目标TEXTcopy relation同actor/op_key | Root.copyCommand256-282及HttpCommandTargets；targetId是allocation key，不按key全局合并actor |
| stage-command | stage_http_commands按目标TEXTstage relation同actor/op_key | StageJobsAPI49-69及HttpCommandTargets；缺proof/坏反向属于已存在单独checker，不在本selector补证 |
| delete | 当前目标TEXTgameId content_deletion_operations | GameDeletionFence.begin39-60：actual actor可为跨owner管理员，**不能强设为游戏owner** |

auth/source没有本族可靠game归属；metadata companion不是额外namespace。未绑定HTTP、失父/迁移后compile operation、BLOB gameId别名、跨game/allhistory不借摘要/JSON/当前owner/epoch猜归属。相同字符串键按原生BINARY actor-key对分开。返回的selection存在不证明正常Root来源、无跨族冲突、权限、完整refs或delete。

候选预算DB32MiB/每族10000、六族总20000，只是模型工程边界，不授生产SLA。选中actor/key须TEXT与原key16..128 ASCII域；模型失败为assertion，仅owned用途，没有公开错误/产品门。

## 当前证据

完整35DDL Node SQLite独立模型**18组**：六族精确顺序/当前keys与管理员delete actor、合法metadata companion/source/auth排除、另一actor同两字符串键/另一game独立、未绑定HTTP排除、job移动/删除不猜旧归属、HTTP relation移动、四种BLOB gameId排除、三个选中BLOB key及BLOB actor拒、真实10001draft行/DB预算内失败。invalidsize/nullprojection为synthetic，Node page_count/page_size不冒workerd能力。

model-r1实际selectors/model两份wx保存发生在执行前，模型报告三个SHA（含固定DDL）、120s白环境子进程meta0/signalnull/errornull，stdout/stderr和完整模型源码保。没有NativeRoot/workerd新测试，不认证全部物理schema/页、正常创建-save-enqueue-delete或任何用户态。两份source/全部生产504/111/375/之前只读审计与此次前注册docarchive复核另签，无producer失败。

只改本维护doc及local-validation原先登记，产品/旧fixture/schema/Source/R2/UI-玩家-媒体-原机制不改，无Jev/无关游戏或浏览器轮；主动LSP/session-all不可确认者明示不clean。无真实SAVE-profileIDB/共享清理/安装-权限-部署-云-提交-推送。

## 接续边界

之后的实际namespace一致性门须同实际授权/schema/fence/原两freeze事务，明确碰撞即保守拒绝而不是认定所有legacy工程rows为正常Root；末callback后重核、晚到碰撞/authority/全部SQL rollback、自己的companion合法保、另一actor同key不冲突必须独立验证。此prototype未自动接入，生产基线不升级；全目标/Q及fullhistory/Source/未知provider/physicaldelete410-cachebackup/runtimeTrialreleaseworkbenchinit仍open。
