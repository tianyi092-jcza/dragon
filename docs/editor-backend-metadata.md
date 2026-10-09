# 独立后台：同事务域游戏元数据基础

范围`E-01-BACKEND-METADATA-1`，接续[真实账户服务](editor-backend-auth.md)，依据产品§3/4.1/5与[工程合同](game-editor-technical-design.md)§1/5/6；不是原版机制变更，也不是完整草稿/复制/发布交付。

## 后继限定管理状态API（本页原成绩仍历史）

[管理下架/解除维护源](editor-backend-management.md)已装Root实际admin同SQL管理三列、独立audit/permanent minimalreceipt；不改本页metadata.js或snapshot/refs/draft/modifiedAt。current16/161与Node28/原账户7/61证据另签，工程Game不冒正式版本/正常Source；完整操作UI、发布-上架-限制同提交/registry仍open。本页“未开放”是本轮历史，不覆盖后继copy/draft/stage/library或管理API。

## 实际实现

`server/metadata.js#GameMetadataStore`在同一账户SQLite Durable Object内建表；`server/worker.js`装配并给真正会话开放`GET /api/games`自己的紧凑摘要及`GET /api/admin/games`管理员全局管理摘要。管理摘要只含当前正式名称/简介（无正式版时null）、公开创建者账户、上架/限制、行修订与时间，不输出他人草稿名称/正文/根引用/草稿修订。强制改密态仍拒绝；管理员也不能借管理权取得他人私有快照。

- 游戏ID由服务分配UUIDv4，创建需实际服务分配能力；`content_used_ids`永久记已使用ID，为未来删除后不复用保留基础，不意味着本轮已实现物理删除。
- 账户来自真正session principal；准备前、异步验收后以及同步事务内都查有效会话/epoch，不接受ownerId或管理员角色DTO。prepared snapshot/allocation使用私有对象能力，复制成JSON即无效。
- 名称/简介复用共同trim/NFC/8/20码点规范，服务器额外在trim前拒控制码和孤立代理；作者原文不转繁体。同作者大小写敏感唯一，跨作者可重名；同游戏草稿名与当前正式名可共占一个名，改草稿后当前正式名仍占用；纯旧草稿名释放。SQL唯一键`owner_id,name COLLATE BINARY`在同事务域，不靠预检清单或进程Map。
- 成功创建`createdAt==modifiedAt`，草稿/行修订从十进制字符串1开始，`BigInt`递增不经浮点；正式指针null、nextOrdinal为0、未上架。草稿修改不伪造正式版本；实际内容no-op不改变修订/时间，失败完全回滚。
- 快照引用按`gameId,revision`追加，旧引用不覆盖；本层只管事务内引用，不能把引用/摘要存在当已核验真实对象或依赖闭包。
- 同步`transaction`内只允许一次创建或CAS保存；异步callback在调用前拒绝，thenable/多次写会回滚，逃逸callback在事务结束后不能继续写。审计只记录操作者/动作/ID/前后修订/UTC，不记录草稿/密码/个人资料。
- 提交幂等另用永久`content_operations`：账户/方法/目标/HMAC请求摘要/epoch绑定，无短TTL重新分配ID；异内容409，同key并发只一次修改。返回丢失/重启后仍可重放原结果，不换成latest；权限与所有权复查先于重放。改密/停用恢复后的旧epoch收据不可复活。未来删除必须清理内容正文并只保最小事实收据，本轮没有冒此清理已完成。

## 明确未开写入口

生产`GameMetadataStore`未安装真实不可变对象/源验收端口，准备快照返回503；**未开放生产创建、复制、保存、编译、发布或上架接口**。`{valid:true}`/作者提交的hash/一份自称manifest均不能取得prepared能力。服务端验收端口将来必须实际读回不可变字节，核根/sourceDigest/依赖/安全结构，之后才可准备并提交。

元数据测试独立fixture提供工程JSON标记的引用验收端口，用真正账户/SQLite测试事务；没有冒充真实GameSource、BlobStore或编译。当前正式名和超过MAX_SAFE_INTEGER的序号场景由fixture直接SQL建立，**只证明占用/表示/事务，不是正式发布或1.9→1.10全链证书**。fixture只在ignored自有验证目录，不在生产配置或浏览器包。

## 本轮实证

先登记[验证I/O](editor-local-validation.md)，使用已安装Miniflare/workerd，实际HTTPS127.0.0.1:8787、own OS temp SQLite与随机工程密码/密钥；不读用户profile/存档/IDB/SAVE/DOS/云凭据，不创建云资源/部署或清共享缓存。

- `tools/verify_editor_backend_metadata.mjs`最终`backend-metadata-session-r1/metadata-r4`八组：真实两作者/管理员；NFC/码点/大小写/跨作者与坏字拒；私有读取与管理员无跨作者编辑/快照I/O；CAS/旧引用/no-op/实际SQL回滚；双请求/同key一次；草稿与当前正式双名；能力伪造/异步与逃逸拒；已准备后提交、在途异步准备期间停用拒绝；新登录旧收据不复活；大十进制修订；重启保持及owned SQLite只读核查。
- r1测试把`Different`（9码点）误用作8字符域内幂等冲突，实际先422而非预期409；原测试/日志保留。修为7码点`Changed`，r2通过；随后追加已准备提交撤销/大整数/旧名释放，r3完整重跑通过，不拼接r2结果；再将CLI JSON输出等价改用stdout，r4八组全部重跑，原r3及脚本保。
- 当前生产Worker完整重跑原账户`auth-r12`七组及新fresh浏览器`backend-auth-browser-r6`六组；不是只dispatch或旧绿色。历史账户r11/r5精确SHA保，不作为当前代码证书。
- 玩家根wrangler/旧293源码＋82资产保持原byte；新增后台输入独立封存。未运行无关87游戏全量或规则战役，不称全安全clean。

主动10路径7clean/1findings（35正确await括号hint）/2inconclusive，session272文件9既有warning保；两个CLI console.log提示改为明确stdout并重跑，不改await语义/禁规则/清缓存。Jev仅3633B人工工程摘要经preview后`jev-1.13.0`advisory，无资源/源码/凭据/个人资料或完整日志，不代实证。新语法/旧byte/实际receipts/依赖/producer与本地链接另封存。

## 接续

后继[真实R2不可变对象基础](editor-backend-blobs.md)已接内部put/read与会话/作者复查，仍不是真实GameSource或依赖验收，delete503。根与依赖实际验收 → 固定源原子复制/准确草稿保存 → 工作台真实受权接线 → 持久编译/发布/上下架/公告与删除恢复；随后Trial与玩家目录/存档。阶段现有接口和测试引用不提前放行任何未完成步骤。
