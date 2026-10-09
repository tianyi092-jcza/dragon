# 本地游戏管理（E-02-LOCAL-METADATA-1）

用户在本地真实App试运行交付后“继续”，本批补本地副本显示资料和管理入口；不是完整任务一、认证/发布后端或实体规则编辑。dev基线仍`20692d7`，本批及上一批E-05工作区改动未再次提交；未push/fetch/deploy、改全局配置/信任或访问DOS/真实SAVE/profile。当前844e…39角色/switch保持不变。

## 实际交付与合同

具体字段/API唯一维护于[共同合同§1.4](game-editor-technical-design.md#14-本地游戏管理切片e-02-local-metadata-1)。

- `web/editor-games.html`和`src/editor/games.js`成为本地首页；从当前固定原件复制时填写名称/简介，清单显示名称/简介/ID/修订，资料表显示固定来源、192城/章/组数量、本地占位建立者及UTC时间。无上架/删除/账户假按钮；当前原件仍须复制后编辑。
- `gamemetadata.js`共用trim+NFC/Unicode码点8/20/名称非空/控制字元与孤立代理项校验，保留作者简体或其它文字，不转繁体。界面本身繁中。重名只检查同本地ownerId占位值的当前草稿，区分大小写；不作认证、正式发布名占用或授权证明。
- `/api/metadata`只改显示字段/草稿修订/服务修改时间，精确expectedRevision先检查；未知字段、缺/陈旧修订、原件ID及不合法名称拒收。地图另窗保存后旧资料表拒覆盖、保留未保存输入；重新载入/取消/离开均按编辑器常规提示处理。保存发出后的输入由代码保脏逻辑保留，不冒充已写入。
- 新复制一次写同值createdAt/modifiedAt；map保存也刷新modifiedAt。旧草稿缺时间显示“未记录”，不读文件时间猜造创建时间；客户端资料表不能提交时间/ownerId。
- 旧轻量`/api/games`ID响应保持；details=1返回摘要，game-info读当前摘要。单个坏草稿单独报错，不隐去有效记录；重名占用无法核实时写入仍失败。名称/简介使用textContent显示，不作为HTML或脚本。
- 显示修改计入共同sourceDigest和新草稿身份；旧快照/正在运行的Trial固定旧URI，不热换。地图、章节、人物/兼容字节、共享资产未重写；不是发布或正式游戏版本管理。

本地文件harness仍无认证、耐故障事务、多进程CAS/复制原子提交。历史测试无metadata复制仍允许未配置名称/重复默认测试名的语义不完整草稿，不自动修旧文件或据此声称完整名称登记。

## 本批验证

先登记[入口与I/O](editor-local-validation.md)再串行执行，不跑通配；浏览器/监听/OS temp目录本轮自有且关闭。

- [51入口完整收据](../.dragon-analysis/map-migration-2/game-management-machine-r1/receipt.json)：2026-10-01 16:34:28.361Z–16:59:35.319Z全部exit0，95源码和当前39资源前后SHA同。上一批90中只有editor_server/run_map_migration_verification两路径变化，另五新增路径；其余共享App/规则/存档源码同。旧49收据仅历史，不拼成当前成绩。
- pure门覆盖trim/NFC、8/20个emoji码点、作者文字保留、十非法输入及同占位值/大小写/自身/不同占位值重名边界。
- [实际管理浏览器/API收据](../.dragon-analysis/editor-phase/game-management-machine-r1-games/receipt.json)：真实当前完整副本、UTC系统记录、九拒收、改名后全源只有metadata/修订/modifiedAt变化，六个native/mini资产SHA相同但sourceDigest不同，旧编译包逐对象相同；旧图保存修订拒绝。实际填写/保存/重开、陈旧表单输入保留/手动重载、简体原文及`<img src=x>`作为文字、坏草稿单独报错通过，IDB0、意外错误/外网0。故意旧表单产生一次HTTP400及对应资源错误，收据明确保留，未冒称所有console条目0。[截图](../.dragon-analysis/editor-phase/game-management-machine-r1-games/game-management.png)是自有副本/故障夹具，不是原件修改或新美术验收。
- 原49门在本轮全部重新执行，包括20章/生产JSON、实际App内存试运行及正式存读拒绝、组件/道路/地图预览、当前玩家存档mock与自有IDB、季节/真实易主五格/缓存/UI锁及行军捕获；原五退休road skip不算通过，固定RNG仍非CPU/全战役认证。
- 七代码/HTML主动LSP：四hint（querySelector及正确await括号建议），三finding、四inconclusive（一次超时/三push-only）、零确认clean；Markdown/缓存与最终语法/链接记录另列，不称全工作区清洁。未关闭规则/清缓存或改全局配置。
- Jev只发送经preview人工审核的2424B工程摘要，固定1.13.0、advisoryOnly；不是机制证据、测试oracle或放行门。[最终静态记录](../.dragon-analysis/editor-phase/game-management-session-r1/static-receipt.json)绑定本轮SHA、链接、语法与诊断限制。

## 未完成与下一独立方向

任务一仍缺真实认证/权限/CSRF、可靠复制与写事务、完整游戏/人物/据点/章节实体编辑及初始化、正式名登记/发布/上下架/删除、玩家多游戏目录/游戏隔离存档、完整素材管理/边缘平移/缩放、认证/断网Trial与单章依赖闭包及完整产品验收。未认证G门不因本批改名解除；未知原初始化不得填值。

下一独立低风险方向可继续E-03视口导航/素材管理，或先做E-04只读引用目录与字段准入审计；真实实体写入须依已证字段和联动闭包推进。互联网能力须核明确后台部署/持久化/事务/认证环境，不自动选平台、部署或用本地owner占位值伪造认证。
