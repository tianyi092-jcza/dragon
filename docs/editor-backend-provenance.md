# E-01：固定受信完整副本与限定资源差异门

本阶段是**内部内容验收**，不是互联网作者权限、持久来源注册表或运行证书。完整目标继续active；生产复制／保存／上传／编译／发布仍关闭。源结构前置和实际本机传输见[分块源切片](editor-backend-snapshots.md)。

## 受信来源，不采作者自报

`tools/editor_trusted_copy.mjs#createPinnedCopyLoader`是离线／服务bootstrap适配器，不在Worker内读文件。只登记固定`map-2-47e358…`与`entities-086ca8…`joint tuple；资源canonical摘要`87742af7…`、21714B实际manifest SHA `bde6dfc8…`和作者来源manifest/正文/runtime数据摘要固定。更新默认模块不会自动登记新源或重贴旧副本；不读取latest/ignored候选/任意URL。

先核实际manifest字节，再从其固定路径读38角色；共同`readInstalledEditorSource`验证实际长度/SHA、源规范摘要、20章顺序和共同编译的原生地形/道路/helper。实体两输入使用共同decoder和固定runtime摘要。总计41实际Web输入：39运行/创作角色＋2作者来源；读入私有字节捕获，每次给共享适配器的是独立byte副本。捕获后不因原目录后来改变而混读模板。

复用`copyBuiltinGame`及`copyEntitySourceRecords`，保完整20章、192据点、原槽/兼容字节、2540独立普通来源记录及20保留G127记录。来源记录不是历史人物合并：不按槽／姓名／头像认同一人，不开放该索引的任免或初始化。实体ID由内部allocator生成；原图、旧实体包和旧副本不写入。APPROVED字符串、sourceRef、owner占位或有效hash本身均不能登记来源／授予权限。

## 内容能力与精确写集

`server/copyprofile.js#FixedCopyProfile`只接受**服务代码注入的受信loadCopy端口**。capture规范摘要、冻结基线图和来源收据，生成私有WeakMap品牌能力；JSON序列化、副本对象、自报valid以及另一实例不能恢复该能力。该对象不等principal、数据库权限、游戏所有权或持久授权，不能作为跨RPC创建游戏的凭据。未实现的生产来源注册／复制事务不能用这个WeakMap替代。

`fixed-copy-resources-1`仅适用于捕获的既有完整副本：

- 允许规范名称/简介（trim＋NFC/8/20码点，作者文字不转繁体）。元数据只做内容校验，实际同作者双名占用/修订仍由元数据事务负责。
- 四资源复用[已证共同writer](editor-chapter-resource-write.md)的money signed24、骑/弓/步u16映射。按每个既有章/公开槽构造小字段shell调用原writer，再将预期公开factions及22槽native raw带回精确比较；不用whole-source克隆去补角色或猜初始化。资金高byte和两份raw必须是相同九byte写集，具名值／raw／native分叉拒绝。
- 所有其它根字段、ruleProfile、sourceRef、compatibility/helper、地图/配方、章序/身份、城市/将索引、完整来源32B/G127、角色/缓存/计数/月政策和unknown均与冻结基线精确一致。字段增加/删除、hidden/symbol/getter/洞/原型和非法值拒；getter不执行。
- 返回内容baseline/source摘要及已改章槽/字段清单，不返回valid运行标记。signed24/u16只是表示域，**不能据此放行异常初值、规则执行或发布**。地图修改/空章/新增将/任免/图片需另外闭合profile，不能用该窄门限制产品长期功能，也不能假装这些域已通过。

## 实际执行

[I/O先登记](editor-local-validation.md)后新增两个focused入口。上批394源码/资产在每轮前后逐SHA不变（含375玩家输入）；本轮只新增4产品/测试文件，不修改旧Worker、原玩家配置/引擎/默认包或已封存产物。

- `profile-r1`72拒先通过；补来源raw32/G127/最后章兼容字段与跨实例能力后，最终`profile-r2`**78拒、getter0**。实际41输入生成全20章完整副本；20章各首槽四资源+1，完整JSON序列化/解析后内容摘要同；源Ref/helper/owner占位/身份/角色/九byte外raw/未公开槽/元数据/非法数/假能力及实际manifest/terrain/entity正文篡改拒。JSON往返不是便利克隆，两个structuredClone建议已按准确位置裁决FP，保真实JSON边界；不禁规则/清缓存或改期待迎合工具。
- 最终`worker-r2`**6组真实Worker/R2/SQLite＋NodeHTTPS8787**，读取45,204,719B/44块完整副本（原43MB＋只读来源索引）。宿主使用上述固定bootstrap实际条件写R2；Worker从实际byte流/SHA/共同结构门读冻结基线与候选，再执行同一内容差异门。它是特权工程staging，**不是作者上传API或线上来源注册**。
- Worker夹具真实账户/强制改密/Origin/CSRF；作者角色不能调用管理员完整副本内容夹具。完整四资源写通过，语义计数改动/self-valid/假票据/跨作者拒；实际SQLite改密撤销后旧、新会话都不能复活旧epoch票据。重启丢失临时内容票据404，但R2及SQL会话保留，显式重新capture才可再验。没有从DTO重建权限或游戏行，生产draft路径实际404。

随机工程秘密只进owned绑定/请求内存、不入输出；全新owned OS temp/R2/SQLite及一天工程自签TLS，无用户profile/IDB/SAVE/DOS、真实证书/云凭据、安装/全局信任改动、云资源创建/部署/commit/push。时间、字节大小和局部成功不是生产CPU/内存/并发/SLA保证。没有修改游戏规则，本轮不重跑无关87游戏库存或浏览器UI；真实端口与权限夹具执行不拿旧绿代替。

最终主动11路径outcomes为1clean/1findings（仅12正确await hint）/7Markdown unavailable/2push-only inconclusive；工具“8confirmed clean”矛盾文字不采。session282文件23既有warning保（14已reviewed测试诊断logger＋9旧项），两个本轮JSON建议精确FP，无禁规则/清缓存；不冒全clean。新source语法/依赖/current SHA/394旧字节/日志和Q1–Q73链接另封存。Jev仅3688B人工工程摘要，preview核验无禁发内容再fixed`jev-1.13.0`发送，输出advisory，不作来源、权限、机制或完成门。

## 仍开放

持久受信共享来源注册与维护、真实管理员复制目标分配／同事务来源引用／幂等提交、作者草稿与地图profile接线、运行/初始化/兼容delta全部支持域、PNG/portrait解码、编译任务、Trial/发布/删除、Q69所有消费者/资源闭包及线上运维。特权bootstrap、内部内容品牌、manifest匹配不能替代其中任一项；此阶段不complete完整E-01/E-02或整个目标。
