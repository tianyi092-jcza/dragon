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

## 仍缺

全部CSS/loader/audio消费者、整图fallback、G127/255、Q69、RuntimeManifest及实际Trial全部输入／异步／失效屏障；完整实体／章节／普通模板、发布／玩家存档／物理删除／备份仍未完成。主goal保持active；无commit/push、部署／云创建、安装／全局trust、实际profile-IDB／DOS-SAVE或共享清理。
