# 固定可用库登记（E-01-BACKEND-AVAILABLE-LIBRARY-1）

此切片只把已有可用素材的固定byte库存接到真正SQL/R2登记；不是新原版规则、完整资源/Q69、RuntimeManifest、Trial或Release。375玩家输入及共同引擎不改，后台与玩家配置分离，无部署或云资源创建。

## 当前捕获与原证边界

原离线库398项/52,792,110B、387去重blob仍封存。先只读比对发现其19个consumer指纹中仅`main.js`与`battleview.js`已改变；不是资产变了，也不把旧指纹贴成当前程序证明。使用原显式stager在新的owned round实际重新捕获，398项/许可逐byte对旧库及当前Web完全同，20个G127/255未闭合引用同，其余17程序指纹同。新manifest93,530B，SHA`76cdf28d1cc6099ccd9f2e7c60085ed6694be6a7509f72c41960d63648cfd2e0`。

`server/available-library.txt`是上述有限库存的服务代码锚，不由上传或自报hash创建；读取仅固定内容。policy工厂先用intrinsic typed-array字段捕获非共享、非resizable Uint8Array，own getter及Proxy不执行；核完整固定SHA/长度后产生私有品牌及冻结结构。原41角色`installedSourcePolicy`函数体、旧registry/profile/definition不改；库使用不同`approved-available-library-76cdf28-1`。400角色=398可用资源+许可+manifest，不包括程序正文，仅记录19个consumer指纹，**不是所有模块/请求闭包**。

头像255仍不存在，20个未闭合引用保留；不补png、不套他人头像、不猜无头像哨兵或dead path。本库存轮仅按字节核验，不借此自称PNG/音频解码通过。后继[packed索引PNG](editor-backend-indexed-png.md)独立实测376现有PNG全RGBA样本，修正168个indexed4格式缺口；它不改变本库byte/consumer指纹或授权，也不闭包音频／全部消费者。整图回退、CSS/directImage/audio/全部lazy入口与scope绑定仍须独立实施。

## 实际持久链与权限

复用未改`InstalledSourceCatalog`的固定策略品牌、规范分块索引、真实R2条件创建/逐段长度SHA、完整角色SHA、实际principal/逐await和提交epoch复查、SQLite登记+永久key收据。400角色使用独立registry，在同`installed_sources/source_operations`表及原source操作命名空间；不同registry同key实际409。库不能替代管理员完整复制的41角色来源；Root仍把复制器/草稿profile接到原目录实例。

Root新增：

- `GET /api/admin/library`：真实管理员、精确Origin、无query，显示服务definition、运维暂存descriptor、登记facts；`registered`不是运行验证。
- `POST /api/admin/library/install`：真实管理员、Origin/CSRF、永久key、严格空body；从操作员固定配置取得root，不收客户端path/hash/valid。完整R2核验后登记，同key重放仍重验全部实际对象。

返回固定`STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE`及20未闭合引用。不提供库asset读取API、Game作者授权、manifest-loader安装、普通中立新建或Trial/发布入口。原source/copy/draft/stage路由不被库id重定向。

`tools/editor_stage_library.mjs`在首次await前捕获全部固定角色，并核当前19程序指纹；1MiB切块、R2条件写、真实读回完整SHA，不覆盖坏同key对象。启动器新增明确`--stage-library`及独立`.local/library-root.json`（存在则精确同值，否则wx）；host staging不等SQL批准，仍须真实管理员调用安装。原`--stage-source`默认行为保持。各次实际重启不跟latest，不靠进程Map恢复权限。

64MiB目录总byte等原有限运维界限不是Cloudflare CPU/内存/吞吐SLA；库登记不代物理GC/备份删除保障。没有运行资格的全库捕获不能声称已完成完整E-01/E-06。

## 本轮实际验证

独立`backend-available-library-session-r1`记录I/O、429输入before、Root/policy/启动器原件、当前源码及wx日志；新捕获在独立`backend-available-library-capture-r1`，不覆盖历史库。

- 当前库捕获398项/许可对旧包和Web逐byte同，387blob，源429前后不变；只两个程序指纹更新。
- policy十负控：错byte/长度/类型/DataView/DTO/Proxy/shared/resizable/旧manifest；getter0，JSON及structured clone不复活品牌，400实际byte/19当前程序指纹/20未闭合引用核验，原41definition保持`6c0fa868b555f4da1e1ef8a9065b85934a5372f8ebee7dafc4c02caeedf0b7ca`。测试的真实JSON roundtrip保留，新增try/catch响应诊断，不禁规则或改成另一种克隆冒覆盖。
- 默认未派生Root、fresh owned OS temp SQL/R2和随机工程配置：五组26实际HTTPS请求通过。显式暂存400角色、管理员/author/匿名/Origin/query拒绝、实际登记+同key完整核验重放、source同key冲突409、无Game/草稿写、真实启动器重启保SQL/R2、实际改密旧cookie401/旧key409、新明确登记及不存在的asset路径404。没有预设成功响应、持久Map、真实密码/存档/profile或外网。
- 当前同源码原source目录八组61及stage API七组42独立focused通过，共103；不把这些当新400角色损坏/全部消费者/浏览器覆盖。共同目录的实际R2/SQL损坏/异序/whole-digest/epoch-await与重启门来自当前source61回归，库400正例来自新Root26。

新文件四个（固定manifest、库stager、policy验证、Root验证）；只三旧文件(policy/Root/启动器)最小修改，预计433声明/426旧保护（含375玩家）。语法、主动诊断/session-all、精确逆差、imports/链接/文件SHA另封存。unsupported/unavailable/inconclusive不称clean。没有安装、SDK patch、全局trust、commit/push、部署、用户IDB或DOS-SAVE/共享清理。
