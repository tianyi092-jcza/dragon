# 精确保存修订的私有固定库读取（E-01-BACKEND-PRIVATE-LIBRARY-ASSETS-1）

限定后继[固定库登记](editor-backend-available-library.md)与[索引PNG](editor-backend-indexed-png.md)。新增`server/libraryassets.js`及显式验证，Root仅装配／固定GET；原草稿、目录、profile、PNG、引擎及375玩家输入不改。437声明、434旧保护，不等完整工作台或运行准入。

## 权威与接口

- `GET /api/games/<UUID>/draft/library-assets?revision=<正十进制>`：398固定资源描述、20未闭合引用及准确source／catalog身份。
- `GET .../library-assets/library-NNN?revision=...`：服务白名单索引选择一个角色，真实bytes的attachment。query只允许一个revision；不收URL、path、hash、latest、valid或任意上传。
- 当前只允许实际管理员本人固定副本，不能跨作者读取；普通作者模板与其权限尚未实现。内置保护、真实session／must-change／owner／Origin继续实际Root及stores，不能用记录ID、DTO、manifest或关联存储赋权。
- 每次重读准确保存snapshot、完整source／原baseline、原固定副本profile，再经原InstalledSourceCatalog读取／完整核验实际R2全部400角色。byte库独立SQL登记必须已完成，仅运维staging不足；目录和复制源仍不同registry，不重定向latest。每次重复完整读取成本高，未保证云CPU／内存／吞吐SLA。
- await后检查实际principal／epoch、owner、精确snapshot及copy origin／原source登记，库capture也回查当前实际登记。返回的临时内部`assertCurrent`不出HTTP；Root在自己的await之后、构造Response之前再调用，以拒绝服务返回后才发生的撤销或SQL改变。新保存2不阻合法旧1，但旧1指针或source/profile被篡改不能继续发bytes。
- 清单仅`private-available-bytes-only`和`STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE`；含20个G127/255缺项，不补255。产物只用octet-stream、固定attachment名、no-store／nosniff；核完整长度／SHA并返回`X-Content-SHA256`、`X-Draft-Revision`、`X-Source-SHA256`、`X-Library-Root`及明确非运行admission。PNG/audio/font等本接口只证明字节，不证明所有消费语义。

## 实际验证与失败纪律

独立`.dragon-analysis/editor-phase/backend-library-assets-session-r1`：owned OS temp SQL/R2／随机工程配置、真实本机HTTPS、现有MF/OpenSSL及白OS环境，无用户profile-IDB或DOS档案。源、报告、产物wx并SHA绑定。

最终assets-r5七组55实际HTTPS：未登记库拒绝、真实认证／作者／owner／Origin／原件／精确query及固定assetId、保存1后改2仍读旧1、全部400角色验证、PNG/JSON/FLAC/WAV/WOFF2/bin六attachments完整bytes／headers、source2不同而library同、游戏修改时间不变、实际SQL owner／copy origin／library profile损坏、实际R2同size损坏及独立停止／重启／恢复、实际改密旧cookie401和新cookie读取通过；Trial仍404。

三个native await控制明确用独立ignored派生夹具而非默认Root成功替身：实际catalog返回后改copy origin409；实际service返回后改snapshot，Root末次assert409；实际service返回后的await callback调用原真实password handler（KDF／SQL epoch／撤旧session，200），Root末次assert401、旧cookie401、新真实login可读。后者不是并发外部HTTP、直接改epoch或虚构认证。独立controls-only r4两组20请求先通过，最终r5也完整包含；计数不含内部password handler作为额外HTTP。

当前默认Root阶段API七组42、私有草稿九组50另通过，共92 focused请求，与主55及独立20分别保留。不重做无关UI／KDF／PNG或全游戏，byte读取不冒浏览器播放覆盖。

失败保留并先定位：

1. r1在首个夹具控制404停止：外层Root仅转发`/api/`，原`/test/`未进入DO。只改夹具地址为`/api/test/`；生产、期待及timeout不变，旧producer／fixture／六产物保留。
2. r2 in-flight promise拒绝遮盖首错，r3加入立即拒绝处理／partial trace并只运行controls，确认实际Root耦合wait/release observer在`reached`返回502。两简单同flags原生DO gate探针均200，不能推断平台一律禁deferred promise。真实Root/transport 502细因仍未知，旧失败不升级为pass；改用同一真实结果边界的直接原password handler callback，独立验证后才完整执行r5。不是生产TLS/SDK修复或放松认证。
3. 串行assets5/API1/draft1放在单个outer1830s预算，前两已独立通过，outer在draft期间中断，buffered log未落盘、draft1结果未知。未发现残留匹配owned进程。只对draft2单独使用原runner1800s／outer1830s，不延超时或重跑前两项。

主动诊断／session-all、语法／imports、旧Root精确逆差、435旧声明中434未改SHA、文档链接及Q1–Q73另封存；不把unsupported／unavailable／inconclusive或空缓存写成clean。

## 后继异步失败时的游戏级读取边界

底层[共同目录异常复核](editor-backend-available-library.md#后继共同目录异常取数的撤权与来源复核)负责主体与库登记，不拥有游戏归属／精确草稿快照。因此不能用底层修复代替本层检查。本轮在`captureForCompile`及`catalog.loadFull`两个await失败时复查原`#assert`；它仍执行原principal／owner／snapshot／origin／栅栏规则，不增加授权或读取最新草稿。有效上下文继续抛同一个原异常。

复用共同Request工具，新增显式`--library-failure-only`：真实应用分发、认证、GameMetadataStore、PrivateLibraryAssets和文件SQLite参与，身份、游戏／快照／来源登记为种子行；源捕获与库加载是明确失败的异步端口，**不是完整副本、批准登记或有效资源字节**。清单与单资源两条GET路径，在两个端口各覆盖六条件：无变化、owner改变、精确snapshot改变、origin改变、删除栅栏、epoch改变。24个Request分别保持500或准确404／409／401，不返回字节；再有两个直接服务正对照验证原异常对象严格相同。

修前首先复现清单capture阶段owner变化仍500 `INTERNAL_ERROR`而非404 `GAME_NOT_FOUND`，保留`before.log`，不将该轮说成24例均已执行。修后 **26组通过**，capture调用26次、catalog调用13次，对象I/O为0；十张选定业务表在定点恢复夹具变化后全文与基线相同，无操作收据、Trial或发布写入。清理仅自有临时SQLite／目录。没有实际登录HTTP、成功资源读取、编译或浏览器证书，该异常矩阵批当时未重跑完整私有库长链；成功路径未修改。后继当前源码正链复验见下节，不将它冒作历史HTTPS入口重跑。

证据 `.dragon-analysis/editor-completion/library-scope-failure-20261029/`：`before.log`、首轮24组`after.log`及最终`after-r2.log`；`before-r2.json`／`after-r2.json`的126项选定服务源码／策略／入口SHA保持（不是全部传递依赖指纹）。两JS语法和diff检查通过。主动LSP两代码push-only未确认，两文档一clean／一三条既有词典hint；mode=all保留测试中既有console／嵌套三元两项warning及七条风格hint，另有三条词典hint，不屏蔽或冒全仓clean。未改Web、DDL、原生或后台束，不开放普通作者读他人库或任何运行资格。

## 后继当前私有库完整Request链复验

在共同目录、草稿与私有库异常路径修复后，直接执行既有 `node tools/verify_editor_template_root.mjs --private-library-only`，没有增加新矩阵、替换成功端口或放宽断言。**14组完整通过、退出码0**。真实共同Request分发、会话检查、文件SQLite／FileBucket、41来源登记与400角色库staging／登记参与；账户及会话是明确种子身份，不是登录HTTP或浏览器认证。

该入口先走普通作者中立创建／原键恢复、精确读取与保存2、错误profile拒绝、不完整章Trial／发布拒收，再走管理员完整20章复制。随后清单实际给出398项，保存当前修订2后仍按精确旧1读取JSON、PNG、FLAC；字节长度／SHA、响应身份头与客户端固定库绑定均检查。重复GET返回独立字节，错误source头、缺失／错误库身份和另一作者拒收；重新构造应用后仍可读取旧1，真实对象GET期间禁用账户后401。选定草稿对象数、操作记录、当前快照以及无新增Trial／发布保持。库字节上下文的runtime／trial／release／delete四项资格仍全false，不将下载成功升级为运行准入。

证据 `.dragon-analysis/editor-completion/private-library-current-20261029/`：`tests-r1.log`完整收据、独立`exit-r1.txt`为0；955项选定服务／VPS／Web源码、固定资源、策略及工具SHA在`before.json`／`after.json`中前后一致。后台日志在结束前为空，期间没有凭空日志或进程存活判通过；收到最终退出码与收据后才登记结果。测试按原finally关闭SQLite并移除自身临时目录，未访问用户存档、DOS SAVE、生产服务或远端桶；没有修改产品／测试代码、DDL或两类程序束。

这补的是当前共同Request与实际字节成功链，不是重跑封存的本机HTTPS r5，也不含浏览器解码、全部398资源消费者、生产R2／TLS、物理删除或完整编辑器。入口语法、限定diff与文档目标检查通过；文档主动LSP及session-all仅既有词典hint，无错误／警告，不代表全仓诊断清空。

## 仍缺

全部CSS/loader/audio消费者、整图fallback、G127/255、Q69、RuntimeManifest及实际Trial全部输入／异步／失效屏障；完整实体／章节／普通模板、发布／玩家存档／物理删除／备份仍未完成。主goal保持active；无commit/push、部署／云创建、安装／全局trust、实际profile-IDB／DOS-SAVE或共享清理。
