# R2 玩家接线：现状与当前版本唯一政策

状态：**用户最新决定“新版本上线，旧版本全部作废”，取代旧选择A；实现正在调整，尚不具备完整发布条件。** 当前代码检查点已提交`d2acb08`，没有推送或部署。产品政策维护于[产品设计§5–6](game-editor-design.md#5-草稿校验与发布)，新存档清理实现见§2.69。

> 本页§1及后续旧批次中“旧局续玩、保留旧游戏资源、旧档单独确认删除”等描述仅保留历史实现／验证事实，已撤销为现行需求；不能用那些旧测试放行新政策。游戏发布版本与程序软件版本仍分开，不据游戏作废要求随意删除共享程序或其他游戏资源。

## 1. 历史用户选择 A（已被最新决定撤销）

前一轮询问的两项为：A 只开放当前版，但为已开始旧局保留必要旧资源；B 更新即物理删旧资源，接受旧局后续取数失败。用户明确回复 **“A”**，原“需要确认旧资源政策”阻塞已解除，不再反复询问同一批准。

- 公开目录、编辑器版本列表、新局和读档只提供当前版；旧局仍固定原正式版本，不热换、不改标签。
- 更新／下架不物理清除已准入旧局需要的运行索引、章节和资产，不开放历史版本选择、历史读档或回滚，也不恢复历史草稿。
- 没有安全回收证据前不自动 GC，不用固定 TTL 杀死旧局。签名凭据持有在运行页面内存，不作为浏览器持久会话恢复许可。无玩家账户／每局保活表；不承诺防止重用已下载的公开内容或 bearer 凭据（非 DRM）。
- 明确物理删除整个游戏仍是例外；缺对象／缺状态／网络错误不是删除事实。完整删除投影及物理清理仍未闭合，本切片不开放原删除门。

`ReleaseLedger` 的旧 SQL 正式行剪枝和当前 pack 替换保持；R2 中已提交的不可变运行索引记录独立 releaseId／ordinal／revision／sourceDigest，旧凭据不再依赖已被剪除的 SQL 旧行。此决定不涉及原版机制、游戏规则、RNG、存档格式或时钟。

## 2. 当前已接通的本地资源通道

### 2.1 publisher → 不可变运行索引

[运行索引构造](../vps/runtime-index.mjs)被 [publisher](../vps/publish_to_r2.mjs) 的真实 `buildPayload` 调用：

- 核当前 pin、正式 Release、pack 与 manifest 的游戏／序号／保存修订／源摘要一致；章节精确齐全，资产必须与 manifest 声明及 SQL 字节长度／SHA 一致。
- 正式专属命名空间为 `artifacts/<gameId>/<ordinal>/<releaseId>/`，下面存 `manifest.json`、`chapters/<chapterId>.json`、摘要资产及 `runtime-<sha256>.json`；producer／reader 共享 `runtimeBase` 并核完整身份。索引明确 `manifest`、`chapter:<id>`、`asset:<id>` 的固定 key、SHA、长度、MIME；不接受任意客户端 key。
- 公用画像登记数字及 `p` 前缀模板 ID（`^p?[0-9]{1,6}$`，保留前导零），key 必须精确为 `kao/<id>.png`。语法通过不等于任意画像可读：角色必须已写入固定索引，且切根前与每次取数都核长度／SHA。publisher 不上传覆盖或删除共用画像，更新／下架不删旧运行索引和字节。先前仅数字正则会拒绝当前画像库471个模板 ID，已于 TEMPLATE-PORTRAIT-1 修复，不改变作者选图权限。
- 公开投影 `runtimeVersion:1`：directory／releases 仅当前上架版；私有投影中的 `gameStates` 只有游戏 ID／上架态，没有草稿名称或私人字段，用于旧凭据在下架后续取。公开 registry 不输出整个状态表或原始 projection。
- 完整空目录可替换旧目录。对象和投影都读回逐字节核对；旧根先验 JSON／代次／digest／ETag，CAS 后回读相同根才确认，否则保持待处理。CLI 非 drain 捕获也在一次 SQL 读事务内。
- 发布命名空间只允许正式空前缀或 `test/<id>/`；单游戏部分投影只能写隔离测试前缀。旧根不能被坏值推算或缺 ETag 降为首次创建。

前序空目录／读回修补为 R2-PLAYER-CONNECTION-1；其独立历史证据在 `.dragon-analysis/r2-player-connection/r3/`。当前成绩必须用下面的新源码验证，不能复用历史 SHA 冒当前通过。

后继 **RUNTIME-RELEASE-NAMESPACE-1** 为提交前上传所需的路径前置：原先仅按游戏／正式序号存 manifest 和章节，会使同一候选序号的两个不同尝试占用同名不可变对象；独立 releaseId 目录消除此冲突，原索引不能跨 releaseId 引用。已提交内容不改写、不删除，画像依赖仍共享。本批当时只完成路径和transport验证；后继§2.11接永久请求幂等、§2.13接候选身份到共同提交，当时尚未接上传与冻结提交；后继可配置预上传见§2.15，可选冻结生产者见§2.23，仍不能用路径或候选ID冒远端发布完成。相同候选ID必须重用准确内容，内容改变的再次尝试须另分ID。

后继 **RUNTIME-CANONICAL-1** 固定索引角色映射的序列化次序：同一组章节／资产行即使在准备数组和SQL游标中枚举顺序不同，也产生相同索引SHA／key。只按角色名排序索引映射，不重写manifest／章节／资产字节，不改变章节的语义顺序。此项解决捕获一致性前置，不代替冻结payload或权威事务；原索引读取本来不依赖映射成员顺序，保留对象和旧票不受该排序影响。

这是尚未生产部署的原型合同收紧：旧的 ordinal-only 运行路径拒绝，不提供别名或静默重写。没有操作真实桶或迁移既有对象；实际部署前若发现旧原型公开根／凭据，须停止切换并核迁移及旧局续取，不能直接覆盖旧根。

### 2.2 reader → 签名能力与角色读取

[读取 Worker](../reader/worker.js)、[准入签名](../reader/admission.js)、[双方 transport 合同](../reader/runtimecontract.js)：

| API | 当前行为 |
| --- | --- |
| `GET /play-api/v1/registry` | 一次根的同代次当前目录／公告；不暴露完整投影、状态表或 private 字段 |
| `GET /play-api/v1/status?game=<id>` | 当前版／上架态；仅明确 `deleted:true` 为410，未知 ID不冒删除 |
| `GET /play-api/v1/admissions?game=<id>&ordinal=<expected>&chapter=<id>` | 只对当前上架版、明确章节签票；旧版409、下架403；读索引及签名后再次观察根，变化则409且不返回凭据 |
| `GET /play-api/v1/file?role=<role>` | `Authorization: Bearer <ticket>`；按签名索引取固定版本；章节限定准入章节；每次核状态、索引、SHA／长度／MIME，返回前再核状态 |

原 `file?key=` 已退役，任何 raw key、额外 game 参数、重复 role 都拒绝；不能匿名取控制根、projection、staging、草稿、任意画像或其它游戏资源。下架后旧票仍取旧资源；新版本不会替换旧票索引。字节损坏／旧索引缺失返回503，不回退最新。API与字节回应均 `no-store`、`nosniff`、`no-referrer`；没有管理写 API、桶枚举或外网回源。

密钥配置（尚未安装到任何云环境）：

- `PUBLISH_BUCKET`：私有发布桶 binding，绝不是编辑器私有源桶。
- `PLAYER_ORIGIN`：确切 HTTPS 玩家 origin，签名 audience 与请求 origin 相等；不迁移玩家 origin／IndexedDB。
- `PLAYER_ADMISSION_ACTIVE_KEY`：当前签发 key ID。
- `PLAYER_ADMISSION_KEYS`：秘密 JSON 对象，key ID → 32字节随机密钥的小写hex；必须通过秘密配置注入，不入 Git／日志／玩家页面。代码没有默认密钥；测试中的固定字节只限自有夹具。
- 密钥轮换加入新 key 并切 active，保留旧验证 key，使旧局可继续；当前配置最多8代，不自动淘汰旧 key。退役／失窃恢复策略须显式处理，不能无说明删除旧 key。没有 TTL 或算法协商降级；HMAC-SHA256 固定。

解析预算为 metadata 2 MiB、单运行资源25 MiB、运行索引2048角色；是明确的 transport 安全拒绝边界，不是原版规则或生产 SLA。所有读取先检查 R2 size 再读正文，且复核实际长度和 SHA；JSON 用严格 UTF-8 解码。

### 2.3 独立冻结账本组件（FROZEN-LEDGER-1，历史起点）

[新账本](../server/distributionledger.js)已在独立SQLite实现并验证下列行为，但**共同editorapp、正式publisher和旧Outbox尚未改用它**：

- 生成并持久保留authority ID，按全局generation追加操作；每个操作固定UUID、种类、游戏、前操作摘要、时间及完整payload摘要。同ID准确重试不再发号，不同内容拒绝。
- payload是版本化JSON的**准确UTF-8字节**，最多4 MiB，以128 KiB BLOB分块保存；取数校验块序／总长／SHA并返回副本，不重读当前游戏表重建。该预算是内部传输边界，不是原版规则或生产SLA。
- `enqueueInTxn`／`confirmInTxn`要求调用者拥有与权威修改相同的外层同步事务。组件内同游戏尚有pending时拒绝另一次publish，管理状态事件可按序追加；只处理confirmed游标的下一项，不跳过。
- 回执验证器必须显式注入同步的服务端能力验证，不能默认接受客户端JSON；校验authority／generation／操作身份／payload摘要／根摘要／ETag／实际可见时间后才能确认。独立账本原测试使用品牌能力替身；后继§2.4增加真实本地R2读回能力，但正式publisher尚未接入。
- remote-ahead等恢复锁持久保留，没有自动解锁／调高本地序号来覆盖远端的入口；后继§2.5增加独立远端检查，受控恢复流程及共同应用接线仍缺。`entry(generation)`只读准确保留操作／payload／确认回执，并核前链；恢复锁下仍可检查，不重建当前游戏。

独立测试库为3表（state／events／chunks）、25列、1外键。此阶段未接共同Root；后继§2.17已新增共同构造与50表严格冻结／类型扫描，但尚未接正式生产者或完整分发引用清理。不能把独立测试当作生产迁移、忽略新表或弱化旧守卫。

证据 `.dragon-analysis/release-readiness/frozen-ledger-r2/`：两个显式入口，OS环境白名单、180秒／入口、源码／日志SHA稳定。`verify_distribution_ledger.mjs`29组包含逐写故障下外层修改与账本共同回滚、准确重试、顺序／伪回执／坏块负例、4 MiB边界、临时SQLite关闭重开及恢复锁；`verify_distribution_ledger_workerd.mjs`在新建Miniflare SQLite执行同28组，销毁实例后重启确认状态仍在、无Worker外网请求。Node入口预加载禁止网络；workerd仅自有loopback和独立目录，finally清理。不读取真实数据库或用户档，不证明掉电耐久性、R2提交或完整发布流程。

### 2.4 独立根读回与最小回执（DISTRIBUTION-RECEIPTS-1）

[回读组件](../vps/distribution-receipts.mjs)仅接受服务端注入的私有R2端口，向账本签发进程内WeakMap品牌能力；没有切根、上传运行资源、修改SQL或对外HTTP入口。它不是完整publisher：

- 从账本准确payload的`projection`成员确定性生成公开字节，核payload及操作描述摘要；候选v2根绑定authority／generation／operation ID／操作及payload摘要／前操作摘要／投影摘要。`expectedObjects`只给出副本，不执行PUT。该历史阶段尚未验证reader完整根身份；后继严格读取与联调见§2.16。旧publisher不迁移为冻结生产者，禁止覆盖v2根；新publisher也不自动迁移旧根。
- 观察实际根，逐字节核同代投影，再读根核相同字节、ETag和服务端Last-Modified；只使用S3 HTTP日期的秒级精度，不用本地时间、入队时间或自定义metadata代替上线时间。
- 根／投影符合后才向`control/receipts/<authorityId>/<generation>/<operationDigest>.json`写不可变最小回执，并读回完全相同字节。回执只含身份、摘要、ETag、可见时间，不含游戏名称或正文；PUT响应丢失／读回失败不向账本返回确认能力。
- 新实例可由该私有不可变回执恢复能力，不依赖永存含内容的旧投影。客户端JSON、其它实例的旧内存票据、错身份／摘要／日期／额外字段均不能冒确认。端口及命名空间必须由可信装配固定，不接受客户端提供。
- **恢复历史观察不等于允许继续推送**：组件不核远端最新代次与本地尾部，不判断备份落后，不验证完整运行依赖或业务投影语义；这些仍必须由后继producer／drainer／reader执行。新代切根前必须已有前代回执，现组件没有自行推进代次的能力。它也不是公告firstOnlineAt生产接线或云S3条件写证明。

证据`.dragon-analysis/release-readiness/distribution-receipts-r1/`：三个显式入口，内存R2／真实SQLite23组、实际自有workerd R2适配S3头／Node SQLite同23组、原账本29组均通过且源码SHA稳定。覆盖两次根观察、投影坏字节、MIME／时间／ETag拒绝、根变化、写后丢响应／读回缺失、坏持久回执、重建验证器后恢复、原始JSON伪造、await期间输入突变及预算／前缀拒绝。workerd只用独立目录／桶和loopback，outbound为0；不是实际云S3、CAS、资源闭包、掉电或共同Root发布流程证据。共同应用、旧publisher、reader、SQL schema和游戏代码均未改变。

### 2.5 独立有序切根与恢复守卫（DISTRIBUTION-PUBLISHER-1）

[新传输组件](../vps/distribution-publisher.mjs)把独立冻结账本与§2.4回执用于条件切根。**此阶段未接共同editorapp／旧CLI或验证reader，也未实现权威发布生产者。后继§2.6增加默认R2运行依赖验证、§2.16增加真实本地R2到reader联调；仍不是权威生产者或任意投影完整可玩证明。**

- 启动／空闲也可检查远端头；旧协议根、异authority、超出本地尾部或下一待确认代次、已确认根消失／回退、同代不同字节／确认ETag／时间均持久封锁，不覆盖、补号或自动解锁。网络失败不当成删除事实。
- 根GET前后分别观察本地确认游标；若读数只是被另一发布者推进超过，有限重试而不误设永久恢复锁。首次根读到不存在、随后另一发布者写出回执时，再读根判断，不能把合法并发误报删除。
- 只用账本保留的准确payload；运行依赖验证器只得到副本。前代必须有匹配私有持久回执，才写并读回下一代投影、复核头并带前ETag条件切根。不存在根只允许首次条件创建。
- CAS返回false或写后丢响应不代表权威事务失败；核当前操作根／投影并持久读回最小回执后，才在SQL确认游标。根已是当前待确认操作时不重复PUT，不重置可见时间；SQL确认失败保留pending，下一代不越过。返回`COMMITTED_SYNC_PENDING`不伪装回滚；恢复锁需人工受控核账。
- 目前仍保留完整账本payload，没有删除／回收／备份导入器。该守卫拒绝落后备份推送，不等于已经自动恢复或完成物理删除。公告生产者也尚未消费回执时间。

最终证据`.dragon-analysis/release-readiness/distribution-publisher-r5/`：九个显式入口，真实S3客户端调用链8组、签名7项、旧publisher29项、内存条件R2／真实SQLite30组、实际自有workerd R2条件PUT同30组、回执两入口各23组、账本Node29组与workerd28组及实例重启全部通过，源码／日志SHA稳定。覆盖双发布者条件竞争、被并发推进超过的旧观察、首次创建竞态、写后丢响应、回执写前／写后故障、SQL确认故障不跨代、资源seam拒绝、投影坏字节、旧／异／领先／回退根、缺前代回执、恢复后不重复切根及`entry`副本／前链读取。r1仅inventory解析把生成fixture内的导入误作直接导入而失败，未执行测试；修本地清单解析后r2完整重跑通过，再仅去除内存条件写测试的冗余布尔转换warning，r3完整重跑六入口；失败现场保留。

继续核既有客户端发现新组件误用了四参数`putControl`，实际`r2client`只收`(key,bytes,ifMatch)`；早期两测试端口跟随了错误签名。新增直接调用真实客户端／签名器、进程内截获HTTPS的回归在r4确定失败；修第三参数传ETag并固定测试端口三参数后r5完整九入口通过。同时无条件GET的412改为错误，不再冒404缺对象；8组锁首次If-None-Match、后继If-Match、空闲不重切、412／403／500不冒不存在及404行为。r3以前的本地CAS成绩不当作真实客户端合同已通过。

环境仅白名单、自有内存／临时SQLite及新建Miniflare目录／R2；Node低层网络禁止，客户端测试只在本进程替换HTTPS请求并限定虚拟host／路径、使用假凭据、不创建socket，finally恢复；workerd只loopback、outbound=0。**不是实际云S3、掉电耐久性、真实HTTP发布幂等、全资源、正式schema迁移或浏览器游戏证明。** §2.3／§2.4旧收据在账本源码后继变化后为历史；本轮九入口是这些组件当前共同SHA的复验。共同应用47表冻结、旧publisher、reader、游戏源码及Trial束未改。

### 2.6 默认R2运行依赖验证（DISTRIBUTION-RESOURCES-1）

[资源验证器](../vps/distribution-resources.mjs)已成为独立publisher的默认验证器；旧测试仍可显式注入可信seam。只读固定操作payload，不重新查询当前游戏／草稿，不上传、列桶、删除或跟随manifest URL。

- 内部冻结信封为`{version:1,projection,runtime?}`。投影字段白名单及目录／正式行／上架状态／当前版公告关联在首次I/O前验证；发布操作必须另外绑定该游戏的准确runtime，即使该游戏未上架也要验证候选运行字节。该信封尚未接真实权威生产者，公告仍未改为实际首次可见时间生产。
- 按固定引用读索引、manifest、全部章节／声明资产／数字与p画像；核路径合同、身份、章节顺序、SHA／长度／MIME和严格JSON。再交叉核manifest的资产／画像声明与索引角色集合，不能用“各自摘要正确”掩盖漏角色、错身份或未声明附加角色。共享对象同次可去重，但元数据冲突拒绝；下次尝试重新读验，没有跨操作缓存豁免。
- 不积存所有资源正文；索引／manifest保留到当前runtime核验，逐资源校验后丢弃正文。这不单独证明S3接收流预算；后继客户端流量／截止时间守卫见§2.7。
- **静态闭包仍未完成**：实际`PublishedPacks`的`visualAssets`还引用受信静态四季图；没有配置静态包验证器时明确拒绝`DISTRIBUTION_STATIC_NOT_CONFIGURED`，不因六派生资产／画像存在而偷偷放行实际游戏。独立测试可注入静态校验seam，但不能作为部署包／核心SHA／战术音频等全部依赖已通过的证明。未解码图片、未验证原版机制或调用完整游戏加载器。

最终证据`.dragon-analysis/release-readiness/distribution-resources-r3/`：十一显式入口全部通过、源码／日志SHA稳定。新内存与实际自有workerd R2各34组，包含默认publisher（无资源override）缺画像不写根、恢复后确认、下一代缺依赖不前进；全部七对象缺失、字节／MIME／重复头、重签摘要后的manifest语义不一致、私有key、非法JSON、公开字段污染、跨调用重验、双游戏共享对象、await输入变更及静态依赖缺端口拒绝。其余九入口复验§2.3–2.5组件与旧publisher／签名；r1仅新fixture误写SQLite模块路径，在inventory前失败、未执行入口，修测试导入后r2完整重跑；后继拆分布尔flag helper消除warning、用显式新数组构造坏章序，并补同引用不同字段枚举顺序的等价验证，r3再全轮复验。OS白名单、Node禁网／客户端进程内替身、全新自有Miniflare及outbound=0边界不变；夹具仍是opaque transport DTO，不是完整编译游戏。共同Root／冻结schema／reader／游戏源码／Trial束不改，未部署。§2.5旧源码SHA收据为历史，本节为后继组件共同复验。

### 2.7 S3响应预算与绝对截止时间（R2-RESPONSE-BUDGET-1）

[`r2client`](../vps/r2client.mjs)现在在收集正文前核`Content-Length`，缺长度时按每个chunk累加；超过预算先拒绝并销毁响应／请求，不继续缓存。GET默认25 MiB，允许可信调用方通过`{maxBytes}`收紧；其它响应默认2 MiB。新切根／回执端口把根与最小回执收紧到4096B，投影和运行对象按已冻结长度收紧。TLS验证仍开启，不跟随重定向。

- 长度非法、短／超声明、aborted、未正常结束的close、native响应未complete或非字节chunk均拒绝；非404仍不是缺对象，坏／截断404也不返回null。
- 单请求默认60000ms绝对截止，包含连接／上传／正文；可信客户端构造参数`timeoutMs`只允许1..120000ms整数。慢流不能靠持续发小chunk重置截止。成功／失败清timer，失败关闭本次请求，不动其它连接。以上是工程预算，非生产吞吐／耐久性承诺。
- PUT超时／中断仍可能已写入远端，不声称回滚；既有publisher继续以准确根／持久回执恢复未知结果。此次没有实际云请求或改密钥／权限。

证据`.dragon-analysis/release-readiness/r2-response-budget-r1/`十二显式入口全部通过且源码／日志SHA稳定：新增[`verify_r2_response_budget`](../tools/verify_r2_response_budget.mjs)28组直接走实际签名客户端，在本进程截获限定虚拟HTTPS；验证有／无长度边界、header超额不收body、chunk超额、非法长度、短传／早close／aborted／错误、迟到事件、无响应及持续慢流deadline、参数预算、错误状态及已应用PUT的未知结果。没有socket／真实凭据；finally恢复builtin。其余十一入口复验§2.3–2.6，资源两入口仍各34组并新增精确`maxBytes`转交断言；实际自有workerd R2不冒云HTTPS。前序不同客户端／消费者SHA收据仅作历史。静态完整包、正式生产者／schema／玩家链与部署仍缺。

### 2.8 确定性静态部署清单（STATIC-RELEASE-1）

[`prepare_deploy`](../tools/prepare_deploy.mjs)新增生成`dist/static-release.json`，不修改`web/`或游戏数据。[清单合同](../vps/static-release.mjs)按路径排序记录每个复制文件的路径／SHA256／字节数，单独标识`_headers`、`_redirects`为部署配置，不能把它们当作必须可HTTP读取的资源。生成文件不把自身纳入摘要循环；来源树若占用该保留文件名则在替换输出前拒绝。复制前预检、复制后核实际字节，统计上限包含新增清单。

- 清单没有时间戳，重复打包字节一致；`sourceTreeDigest`覆盖本包全部`src/**/*.js`元数据，不只当前Trial导入。它只是源码树指纹，不证明实际执行闭包或编译／运行兼容性，也不把图片／音频变化冒作源码变化。
- 解析方必须提供来自可信构建的预期清单SHA；只接收有预算、规范序列化的准确字节，拒路径别名、大小写冲突、附加字段、错误源码摘要及非规范JSON。把响应自己的SHA传回解析器不构成远端可信证明。
- 仍保持25 MiB单文件限制、精确排除创作`game-source.json`、原音频／调试过滤及共享引擎文件；清单仅是静态公开包的元数据，不接入publisher，也不开放编辑源、R2或新API。

证据`.dragon-analysis/release-readiness/static-release-r2/`三个显式入口通过、源码稳定：[`verify_static_release`](../tools/verify_static_release.mjs)43组纯合同负控；[`verify_prepare_deploy`](../tools/verify_prepare_deploy.mjs)6组自有临时CLI包；[`verify_static_release_package`](../tools/verify_static_release_package.mjs)复制受控的实际Git跟踪Web字节，在自有临时目录打包两次，1377个输入包文件逐一核SHA／长度，216个`src` JS，原包157063660B、新清单210425B（输出合计1378文件）。清单SHA为`9b97c73323737d8ed824a8557c0d6861eb9bf77304f85e2fcc9ef15be8898738`，源码树SHA为`0657eda3a0599454466621c7d853e922a291298e643c9f2ca46e9690af96443c`。r1已通过；其后仅去除日志／数组反转风格warning并拒非普通文件，r2三个入口全量重跑，实际清单摘要不变。

测试不写共享`dist/`，不连云、不读私有编辑库／DOS存档／浏览器profile；子进程仅复制后的本地打包器和`git ls-files`，环境白名单。**没有证明Cloudflare当前部署字节、两端运行核心匹配、完整游戏依赖、旧局延迟加载或部署后旧资源保留。** 当前部分静态资源仍用无摘要URL读取；这些接缝未完成前，不能用本清单解除§2.6的静态依赖拒绝门，也不能把本次纯打包验证冒成浏览器／R2全链通过。

### 2.9 静态包字节预检（STATIC-RESOURCE-BYTES-1）

[`static-resources`](../vps/static-resources.mjs)新增独立只读校验器；构造时必须提供受信的路径字节读取端口、构建清单SHA与本地源码树SHA，没有默认origin或成功缓存。读取前冻结正式manifest的八项四季描述；严格核角色名、同一编译版本目录、路径／URL一致、SHA及长度，再与清单逐项绑定。随后逐一读验清单中**全部asset**，不是只核八幅图；`_headers`／`_redirects`作为部署配置不要求从HTTP取回。最后重读清单，变更即拒绝。每次读取传明确字节预算，零长度资源仍必须返回零字节；只保留当前资源，不积攒整个静态包。

- 这是可传给§2.6 `verifyStaticResources`的实际字节校验函数，不是空成功回调；仍未接生产读取端口、共同应用或部署配置。外层单次预检不是跨部署延迟读取的保留保证，没有热切换／回退／GC。
- 来源树非空且必须等于构造时的独立预期值，但这仍不证明VPS实际运行核心、编译器兼容性或引擎动态导入／全部运行期依赖。本批读取端口只有自有内存与文件实现；后继HTTPS字节端口见§2.10。这里的证据**不认证HTTP/TLS/MIME、实际Cloudflare字节或旧局A保留合同**，不据此开放默认静态拒绝门。
- [`verify_static_resources`](../tools/verify_static_resources.mjs)35组：完整逐字节／预算、每项缺失、懒加载JS与音频损坏／缺失、零长度、非字节、清单及源码SHA、八角色／跨版本／外部URL／私有路径、await后原对象变更、清单末次变化、无跨次缓存及端口失败；也接入真实R2运行资源校验函数，以自有transport图验证未配置拒绝、配置后核七个运行对象＋整包、删除音频后再次拒绝。不是编译游戏或R2服务实测。
- 扩充[`verify_static_release_package`](../tools/verify_static_release_package.mjs)：实际复制的1377文件包中，1376个asset经自有文件端口全部核验，使用预先测量的216个本地源码文件与当前固定八角色路径；随后只删除自有临时包中的音乐文件，重复预检必须拒绝，再重复构建恢复同一清单。没有触碰共享dist或原始Web文件。

证据`.dragon-analysis/release-readiness/static-resources-r2/`四显式入口全通过且输入SHA稳定：35组新预检、43组清单合同、6组隔离CLI、实际包逐字节测试。r1的33组及三个旧入口已通过；增补空源码负控及真实运行校验器接缝后r2全量重跑。清单／源码树摘要仍为§2.8所列值。环境白名单、无网络预加载、自有临时包；无真实凭据、云、用户档或编辑库。§2.8旧脚本摘要对应历史测试版本，不与新版本混作同一证据。

### 2.10 静态HTTPS字节端口（STATIC-HTTPS-1）

[`static-client`](../vps/static-client.mjs)提供服务器显式配置的HTTPS origin／路径前缀，只发GET，不接受请求方提供origin、凭据或任意header。路径限规范ASCII段，无绝对路径、点段、查询、片段或编码别名；固定要求identity编码及缓存重验，保持TLS验证，不跟随重定向、不重试。完整404才返回null；其它非200（含206）拒绝。200按文件扩展名校验MIME／UTF-8 charset，拒绝压缩编码，返回原字节供§2.9按独立SHA核验。

- 提取[`https-bytes`](../vps/https-bytes.mjs)供静态与[`r2client`](../vps/r2client.mjs)共用。保留§2.7的接收前／chunk预算、长度／截断检查及绝对deadline，另拒非HTTPS／userinfo／片段；不把PUT错误解释成回滚。静态调用必须传明确`maxBytes`，上限仍25 MiB，默认截止60秒。
- [`verify_static_client`](../tools/verify_static_client.mjs)31组，直接截获本进程native HTTPS：规范origin／前缀／路径、无凭据header、TLS选项、MIME与编码、状态／重定向、完整及截断404、预算、断流和无响应deadline。最后经实际静态全包校验器验证自有10资源包与错误JS字节。59次虚拟请求、零socket；finally恢复builtin，**不是实际TLS握手、Cloudflare响应或游戏包证明**。
- 当前仅新增可装配端口，未接生产配置、共同应用或永久资源路径。原根Assets配置尚未显式关闭HTML重定向；实际路径若重定向，本端口会拒绝，不能靠自动跟随绕过。部署时须核对可直接读取的规范路径。一次完整读验仍不保证更新后旧局延迟读取，不能解除默认静态门。

证据`.dragon-analysis/release-readiness/static-client-r2/`十七显式入口全部通过且输入SHA稳定（r1已全过；仅将测试日志改为stdout消除风格warning后，r2全部重跑）：新31组、原HTTPS预算28、静态35／43／CLI6／实际1376个asset，以及§2.3–2.6的运行资源34／34、客户端8、签名7、旧publisher29、新publisher30／30、回执23／23、账本29／28和workerd实例重启。环境白名单、Node无网络守卫；workerd仅自有loopback／R2且outbound为0；不读真实凭据、编辑库、DOS存档或用户profile，不写共享dist。旧R2客户端收据对应提取前源码，只作历史，不能拼作当前SHA。

### 2.11 发布请求永久幂等（PUBLISH-OPERATION-1）

[`PublishOperations`](../server/publishoperations.js)已接共同[`editorapp`](../server/editorapp.js)的`POST /api/publish`，复用既有`content_reservations`／`content_operations`，没有新增DDL。历史`copy`命名指这些表的命名空间家族，不代表放开复制权限。

- 捕获精确请求摘要（gameId和原始name）、当前主体／epoch、草稿修订、rowRevision及正式指针；准备阶段只持有私有票据，不提前写成功结果。最终同一同步事务重新核主体、所有权、删除围栏和命名空间，再检查捕获状态，执行pack安装／发号／pin／剪枝／原型Outbox／公告，核返回pin与实际SQL指针、release行和pin行一致，最后永久写请求绑定与结果。收据失败一起回滚，不消费版本号。
- 同键同请求重放原结果，且先于陈旧捕获检查；竞争者只执行一次提交回调。结果在后续版本替换、旧release行剪枝后仍可查询，但**不恢复旧版本**。改正文、跨操作家族、epoch撤销、伪造票据、删除围栏或损坏收据均拒绝；重放仍先鉴权。只覆盖本实现提交的新操作，不能为历史未记key的发布反推／补造收据。
- [`verify_publish_operations`](../tools/verify_publish_operations.mjs)24组真实SQLite／release／pin事务；主体和命名空间是明确测试端口。另有[`verify_publish_operations_root`](../tools/verify_publish_operations_root.mjs)13组：实际共同Request分发、固定41角色安装、20章真实编译、所属图素材、并发同键、重建应用实例、鉴权／CSRF／跨命名空间及末端收据故障；故障时核11张发布表完全回滚，再以同键获得下一合法序号。后者使用自有FileBucket、内存SQLite、种入的测试session及固定完整复制bootstrap，**不是作者空白新建、登录、网络TLS、R2或浏览器证明**。
- 真实20章验证发现Web源ID形如`<gameId>#upper-1`。永久收据保留已有pin的章节字符串合同，不把它误当URL段。该批暴露R2通用`isId`错误用于章节的问题；后继§2.12已补独立章节合同，不重命名编辑源章节或篡改存档。先前opaque transport夹具不能反证真实编译包已贯通。

证据`.dragon-analysis/release-readiness/publish-operation-r3/`六显式入口全部通过且源码稳定：新24／13组、原子性10组、22源DDL、Node HTTP11组、实际workerd Root schema。两项lazy freeze由实际构造器初始化后，仍为47表／47索引／318列／3FK，冻结门未放宽。r1保留测试重复建表和漏初始化lazy schema的失败，r2保留真实章节ID被新收据错误拒绝的失败及诊断，r3另保留测试清单扫描器误认普通`from`字符串的执行前失败。后续源码变更不能复用本批SHA。

这不是R2发布成功收据：仍用原型Outbox，未把§2.3–2.10接入正式提交，该批未实现预上传（后继可配置接线见§2.15）／全事件／远端首次可见时间；旧`unpublish`等路由也未因此取得永久幂等。当前local pin返回不等于Cloudflare可玩。

### 2.12 源章节身份与R2运输（CHAPTER-TRANSPORT-1）

真实共同应用产生的20章ID含`<gameId>#upper-1`等；来源见[`gamesource`](../web/src/content/authoring/gamesource.js)的固定复制与`freshChapterId`。这是Web源／运输合同，不是DOS机制。本批不改这些ID、源数据、章节JSON、存档或生成器。

- [`runtimecontract.isChapterId`](../reader/runtimecontract.js)单独接受已有简单ID，或**当前精确gameId**加`#`和1–100字符的ASCII字母／数字／下划线／连字符后缀。拒绝其它游戏前缀、多重`#`、路径、查询、百分号编码别名和超长后缀。通用`isId`仍用于release及签名key，不放宽。索引、投影、签名签发／验票和准入入口共用此检查；章节仍须存在于固定索引且与票据选章完全一致。
- R2逻辑key保留字面量`#`，不先把源ID改为`%23`文件名。[S3签名器](../vps/r2sign.mjs)原有逐路径段编码把HTTP路径转成`%23`；公共API查询用`encodeURIComponent`一次编码。角色和签名声明保留原始ID，解码后的`%23`别名不准入。签名器实现未改。
- `verify_publish_operations_root`增至14组：将实际共同Request／编译后SQL的20章、manifest及六资产交给`buildRuntimeIndex`，核章节顺序和每章原始JSON字节不变。**这只补真实编译产物到索引，不冒完整R2上传／静态依赖／同引擎开局**。
- `verify_runtime_contract`增至66项，含当前／外游戏范围、路径及编码负控、签名票原ID与key边界、S3路径编码；`verify_reader`增至66项，实际自有workerd/R2覆盖含`#`章节取数、跨章／跨游戏／编码别名拒绝及更新下架后旧票继续取旧字节。共享运行资源夹具增至35组，内存与自有R2均读到字面量key，外游戏章节在I/O前拒绝；仍是opaque运输夹具。

证据`.dragon-analysis/release-readiness/chapter-transport-r3/`：22显式入口全部通过、源码SHA前后稳定，包含上述4类入口、命名空间15、发布操作24、原子性10、DDL22源、Node HTTP11、实际workerd schema，以及HTTPS预算28、实际客户端8、签名7、旧publisher29、新publisher30／30、回执23／23、账本29／28与实例重启、旧Outbox10。47表／47索引／318列／3FK冻结不变。r1保留测试preload相对路径错误（未执行产品测试）；r2在原实现以真实20章确定复现`validateIndex`拒绝，修后r3完整重跑。环境白名单，Node默认禁网络，例外仅显式自有loopback；不触真实桶、凭据、编辑库、DOS存档或profile，未commit/push/deploy。此前含变更模块的收据只作历史，不拼当前SHA。

### 2.13 预提交候选版本与快照副本（RELEASE-CANDIDATE-1）

[`ReleaseLedger`](../server/releases.js)新增只读事务`prepare`，生成私有能力票及冻结候选身份：同一未提交序号的不同尝试有不同releaseId；此时不预留数据库记录、不推进序号、不创建正式版本。捕获owner／epoch／草稿修订／行修订／当前release／序号；`issuePreparedInTxn`在调用者的共同事务内重新检查权限、删除栅栏及全部捕获状态，以CAS安装**准确候选ID**。外层回滚可重试原票；成功后指针／序号改变使再次使用及同序号其它候选失效。正式时间仍在提交时产生。源／编译证明继续由共同生产者负责，候选票不是R2成功收据。

共同`#publishPin`已在异步pack准备前取得候选，最终事务使用该票；永久请求重放仍先于陈旧检查和正式发号，因此并发同键仍只提交一次。旧独立`issue`接口保留；未增加DDL或开放历史版本选择。进程退出会丢弃未提交的内存票；此处未实现持久候选恢复，也未执行R2预上传／垃圾回收。

[`PublishedPacks.snapshotPrepared`](../server/playpacks.js)从同实例、同主体／epoch的准备票导出manifest字符串、逐章JSON及六资产的独立副本，不查询或替换当前SQL pack。数组／记录冻结，二进制每次复制；调用者修改副本不能污染提交字节。正式安装后票失效。这只是服务端预上传输入，仍须生产者校验当前源／权限并完成实际上传回读。

证据`.dragon-analysis/release-readiness/release-candidate-r1/`：24显式入口全部通过、源码SHA前后稳定。新`verify_release_candidates`21组真实SQLite覆盖不写库、同序号不同ID、伪票／跨实例、状态／权限撤销、CAS被忽略、INSERT及末端故障回滚、原票重试和序号边界；`verify_publish_atomicity`13组增加副本隔离、票权限及SQL逐字段／逐字节相等；实际共同Request／固定安装／20章编译测试15组，在正式SQL仍为空时构建候选索引，与提交后SQL索引、全部文件及依赖严格相等。同键竞争和11表末端故障仍通过。其它入口为原22入口重跑及旧release回归27项；DDL仍22源／47表／47索引／318列／3FK。

旧release夹具曾漏传已必需的ordinal、误从只读已上架目录找未上架pin；`release-candidate-baseline/`用HEAD release实现复现首个旧故障并保存来源，只修夹具传参和准确SQL／目录断言。新增快照比较曾因Node SQLite的null-prototype行与plain DTO原型不同失败，现展开SQL记录后仍比较所有字段／字节，原失败夹具保留。以上不改产品规则，也不以吞错取代断言。

测试仅自有内存／临时SQLite、FileBucket及显式loopback服务；不触真实桶、凭据、编辑库、DOS存档或profile。实际workerd入口是冻结schema回归，不冒候选方法的workerd功能测试。该批未连接预上传（后继见§2.15）、全事件冻结账本、公告实际可见时间或玩家端；未commit/push/deploy。

### 2.14 不切根的不可变预上传（RUNTIME-STAGE-1）

[`createRuntimeStager`](../vps/runtime-stage.mjs)接候选身份和§2.13的准备副本，先同步构造并复制整个运行图，再访问可信R2端口。此组件本身不读写SQL、不分配正式序号，不写公开投影／当前根、不写共享`kao/`，也不删除或清理任何对象。

- 先核共享画像，再仅向该候选`artifacts/game/ordinal/releaseId/`作条件不可变PUT。每个对象按准确长度预算回读，核SHA／长度／唯一MIME；已存在冲突拒绝，不覆盖。同候选精确重试可复用，另一候选隔离。PUT抛错仍是未知，只有随后准确回读才能继续，不能凭HTTP成功认定完整。
- 全部上传后，再经§2.6默认运行图校验器复核索引、manifest、所有章节／资产／画像及配置的静态检查。真实manifest声明`visualAssets`但无静态端口时，首次I/O前拒绝。测试中的静态回调是明确seam，不是生产静态闭包证明。
- 每次调用必须提供同步、抛错式`assertCurrent`；异步／返回值形式拒绝。每个R2 await和静态回调前后重核，撤销后不继续上传或出票。实际权限、准确源和删除栅栏仍须由共同生产者提供并在最终SQL事务重核；这个注入点本身不是真实授权证明，也不提供物理删除所需的持久在途写登记。
- 只有全图通过才返回本实例私有WeakMap票及冻结运行引用；`verifyStaged`绑定完整候选身份，拒伪票／跨实例／不同候选。调用者或端口修改传入Buffer不能改变保留的期望字节。票只说明本次观察，**不是正式提交、远端可见、永续可用或删除完成收据**。

证据`.dragon-analysis/release-readiness/runtime-stage-r2/`：八显式入口全通过、源码SHA稳定。内存与实际自有workerd/R2各28组，覆盖原根／投影不变、原始`#`key、读回预算、条件冲突／重试、两个画像缺失／损坏、PUT前失败／写后丢响应、端口及调用者突变、完整复核时资源消失、I/O／静态／最后读回撤销、伪票和输入负控。另重跑运行资源35／35、运输合同66、实际R2客户端进程内替身8、签名7、候选路径15。r1八入口也通过26组，补两项迟到撤销后r2完整重跑，未覆盖旧记录。新夹具是opaque运输数据，未连SQL／共同Request／真实编译游戏；实际客户端用例不是该预上传器的真实S3联调。OS环境白名单，Node禁外网，Miniflare仅自有loopback且outbound=0；无真实桶／凭据／用户档／共享dist，无commit/push/deploy。

### 2.15 共同发布的可配置预上传（PUBLISH-RUNTIME-ROOT-1）

共同[`createEditorApplication`](../server/editorapp.js)增加可信平台参数`runtimeStager`，Node的`createEditorService`／`startEditorServer`原样接入；不是HTTP输入或可由作者选择的env能力。配置时，真实编译／准备副本→§2.14不可变预上传／全图读回→共同SQL提交；最终事务还须验证同实例、准确候选的私有staging票。未配置的旧适配器仍走既有本地流程，**不声称R2已上传或可见**。生产CLI尚未装配此端口。

[`PublishOperations.inspect`](../server/publishoperations.js)是只读同步守卫：重新检查当前会话／epoch／密码、操作命名空间、权属、删除栅栏和捕获的草稿／行修订／当前release；存在准确永久结果时先返回结果，不因后续版本改变误拒重放。共同生产者在每次R2等待前后使用该真实守卫，并在同一读事务核待处理拓扑与准确源root／digest。另一同键请求在等待期间提交时，停止本次上传、重核权限后返回同一永久结果，不再发号。最终写事务保留原权限／CAS守卫；插入reservation后只核源和私有预上传票，不能将事务内暂未补齐的结果对误判为持久损坏。

`node tools/verify_publish_operations_root.mjs --stage-runtime`使用实际共同Request分发、固定41角色安装、20章编译、真实SQLite／FileBucket与**内存R2端口**。静态检查不再用成功回调：把实际Git跟踪Web输入复制到自有临时目录，执行实际打包器，再经§2.9核全部1376个asset及清单；构建SHA与独立打包入口一致。首次PUT时正式release／pack／发布reservation均为空；提交后所有运行文件与R2字节相等。包含PUT期间停用、epoch、强制改密、行修订、删除栅栏撤销，以及A停在PUT、B先提交、A恢复返回B结果的竞争；失败不改11张发布表，也不清理已写候选对象。已有末端SQL收据故障仍共同回滚。

证据`.dragon-analysis/release-readiness/publish-runtime-root-r4/`十七显式入口全部通过、输入SHA稳定：inspect25、配置预上传Root22／旧Root15、候选21、原子性13、DDL22源／47表／47索引／318列／3FK、Node HTTP11、实际workerd Root schema、独立stage28／28、资源35／35、合同66、reader66、静态35、实际隔离打包、旧release27。Root配置路径实际2616次GET／146次PUT，五次完整静态检查共6890次文件读取；静态清单SHA为`9b97c73323737d8ed824a8557c0d6861eb9bf77304f85e2fcc9ef15be8898738`。Root22入口限600秒，其余180秒；逐请求计时显示含20章准备的串行请求约21–25秒，重放不编译或访问R2。

r1保留真实接线错误：写事务插入reservation后再次inspect误报`PUBLISH_RECEIPT_CORRUPT`；修正调用边界，未放宽损坏对校验。r2保留180秒总入口超时，增加逐请求计时并把该重入口预算设为600秒；r3全通过但静态夹具误以全部跟踪文件代替实际部署筛选，后改用真实隔离打包器，r4完整重跑，未拼接成绩。

边界：seeded session／完整复制bootstrap不是登录或作者空白新建；这次配置路径不是真实S3／workerd整链、TCP发布、浏览器或生产部署证据。仍写旧Outbox及本地公告时间，未把冻结payload／全局代次／远端确认接入正式事务；没有物理删除在途登记、静态旧局保留或核心兼容证明，不能据预上传成功宣称公开可玩。无真实凭据／桶／编辑库／DOS存档／用户profile／共享dist操作，未commit/push/deploy。

### 2.16 冻结根读取与禁止协议降级（READER-FROZEN-ROOT-1）

核代码更正：此前reader已能按generation／digest找到v2投影，但仅检查这两字段，未校验完整根身份，也无新publisher到reader的实际联调。新增[`publicationroot`](../reader/publicationroot.js)严格核v2的八字段、UUID／摘要／安全整数和首代／后继前链格式；缺字段、未知版本及额外字段拒绝。原未带version的原型根仍只按其generation／digest／可选previousDigest白名单读取；这不是自动迁移或历史恢复许可。

准入末次观察改为比较完整根字节SHA，不仅比较generation／投影digest。因此同代同投影但authority／operation／payload或前操作身份在await期间变化也返回409、不出票。既有票仍绑定原运行索引，更新／下架不换票、不改旧资源；明确删除仍在返回资源前复查。公开目录不新增私有根字段。旧[`uploadRelease`](../vps/publish_to_r2.mjs)在任何依赖读取或写入前拒绝带version的根，不能覆盖v2并降回原型协议；其它旧根也经白名单校验。

新增[`verify_reader_distribution`](../tools/verify_reader_distribution.mjs)：独立真实文件SQLite账本→默认资源校验的新publisher→实际自有workerd/R2条件写与最小回执→实际reader。七代覆盖未上架发布、上架、更新、下架／重新上架、读数期间下架和delete-fence；画像缺失保持pending不切根，排队新版尚不可准入，旧`#`章节票持续读旧字节。重开SQLite与publisher后idle不重写根。另以同reader的Node调用加真实测试桶控制根观察，验证五种同代／同投影身份竞态；坏根在实际worker返回503而非410。delete-fence只是受控投影事实，未执行物理清理，测试明确核旧对象仍在。

证据`.dragon-analysis/release-readiness/reader-frozen-root-r1/`十二显式入口全通过、源码SHA稳定：新联调89项、旧reader66、旧publisher29、候选路径15、新publisher30／30、资源35／35、回执23／23、运输合同66、旧Outbox10。OS环境白名单，除显式自有loopback外禁网络，worker outbound=0；目录与SQLite／R2均自有临时空间，不接真实桶或凭据。

边界：根格式检查不是对SQL权威、操作摘要原像、历史链或备份回退的独立认证；reader信任私有桶写边界，恢复守卫仍由publisher承担。此夹具为opaque运输数据，公告日期是fixture，不证明firstOnlineAt生产接线；未连接共同HTTP事务、生产CLI、完整游戏／浏览器／静态迟到资源。共同Root和47表冻结不改，未commit/push/deploy。

### 2.17 共同账本 schema 与删除检查（LEDGER-SCHEMA-1）

共同editorapp现在在同一storage构造`frozenDistribution`，仅初始化持久authority及空账本；默认回执验证拒绝`DISTRIBUTION_NOT_CONFIGURED`，没有因此接入生产者、排空器或公开API。旧Outbox／发布事务暂不迁移，不能把初始化当作冻结发布完成。

冻结基线为**23源／50表／49索引／99对象／343列／4FK**。原47表字面声明保持，新增[`distributiondeclarations`](../server/distributiondeclarations.js)只含明确三表的固定CREATE／列／索引／外键并合入各严格门；不从运行数据库推导可接受结构。两处UNIQUE／索引投影扫描和共同冻结计数同步为49，外键扫描分别检查三个TEXT用户ID边及INTEGER正安全代次边；未知表／索引／trigger、缺新表／新列、同列而删除CHECK及延期外键仍拒绝。

**删除引用缺口没有被白名单掩盖**：全局payload可能包含其它游戏，inventory不能只筛`game_id`。暂仅允许严格空账本的原有限观察，将authority状态摘要纳入SQL观察；有任何事件／块、恢复锁或异常singleton即`DELETE_DISTRIBUTION_UNSUPPORTED`，缺表拒绝。await期间其它游戏入队同样拒绝。仍返回`deleteAllowed:false`；完整全局引用、在途R2写入、payload清理／备份删除未完成，不能据此物理删除。

本批实际Node扫描暴露旧SQLite适配器缺`databaseSize`及迭代游标，原检查返回`DELETE_UNIQUE_QUERY`。现补原生page_count×page_size的有限整数逻辑分配字节，以及与`toArray()`共享消费位置的迭代；不修改32MiB／行数门，也不把逻辑页字节当WAL文件长度、堆上限或耐久证明。仍是同步eager查询。实际workerd游标返回独立RowIterator，且savepoint回滚不恢复连接级defer PRAGMA：测试改查共同消费行为，并仅复原自己注入的PRAGMA；两次失败保留在`ledger-schema-integration-r1/workerd-probe*.log`，不改产品门迎合fixture。

最终证据`.dragon-analysis/release-readiness/ledger-schema-r2/`：28显式入口全部通过、输入SHA稳定。r1全过后仅将声明排序比较器改为同义if分支去除风格warning，r2全部重跑，不拼接旧SHA。SQLite22项、新共同Node与实际workerd各16组覆盖严格新增schema／类型／唯一约束／完整故障回滚／空账本与跨游戏晚入队拒绝；另原账本29／28、publisher29／30／30、回执23／23、冻结reader89、发布操作25、预上传Root22／旧Root15（真实20章、50表）、候选21、原子性13、23源DDL、HTTP11、workerd Root、stage28／28、资源35／35、运输及旧reader各66、静态35和实际1376资产包、旧release27。所有存储自有，明确loopback例外外禁网络，无真实桶／DOS／profile／编辑库。清单生成首次误扫生成worker模板，在执行产品测试前拒绝，修显式模板排除后重跑；记录保留。

主动LSP检查28文件，5确认clean、23因push-only服务器静默而inconclusive，未报新error／warning但不宣称23文件clean；会话all仍有commandtargets原有1条风格error及24 warnings。该28入口批次未执行历史七条删除专用lane；其后继独立复验如下，不把16组冒充旧lane成绩。新增common schema、Node适配及限定负控已验证，完整删除链与正式冻结发布仍未完成；无commit/push/deploy。

**DELETION-LANES-50-1 后继复验**：`.dragon-analysis/release-readiness/deletion-lanes-r3/`七条入口均通过，610项输入SHA稳定；deletion definitions／FK rows／UNIQUE rows／index projections／SQL quickcheck／name bindings／bound SQL freeze分别为16／13／15／18／12／29／155组检查、80／50／50／61／51／97／1239次真实本机HTTPS调用。使用当前共同workerd Root、50表声明与原有鉴权、负控、回滚、重启断言；不是新16组的别名。bound lane本次超过旧500调用位置并通过，不据此宣称所有旧502 lane已复验或原故障原因已查明。

仅在新证据目录复制21个旧夹具／归档文件，调整相对导入、输出目录与自有端口；七条测试正文断言未放宽，旧归档`.before`仅作hash资料。新before保留原输入／导入键并逐项记录旧SHA差异，不覆写历史收据；当前50表oracle另从23个构造源的明确DDL在独立Node SQLite生成。每lane自建临时库、R2及TLS证书，不安装源／素材库；OS环境白名单，worker outbound计数为0，未读真实配置／存档或连接云。没有新增产品API或代码变化。

失败现场保留：r1准备器误递归hash-only归档的相对导入，尚未执行测试；r2七入口均因本机固定8787端口`listen EACCES`在开始鉴权前失败。r3仅为各入口选择系统分配的空闲loopback端口，并同步测试Origin与临时配置后全过；没有停止其它进程、修改系统端口策略、降低Origin／CSRF检查或修改历史夹具。测试目录保留供审计，不以这些SQL-only骨架证明GameSource、原生R2取消、物理删除或生产发布。

### 2.18 公告失败与游戏读取隔离（READER-ANNOUNCEMENT-ISOLATION-1）

依产品§6.1／Q36，公告失败不能阻断可用游戏目录。此前reader在所有snapshot路径解析公告，公告缺失或格式错误会同时阻断registry、status、准入及已准入资源。现在只在registry响应阶段解释公告；正常响应字段不变，公告单独失败返回HTTP200、完整已验证directory、空announcements及明确`announcementsError: "ANNOUNCEMENTS_UNAVAILABLE"`，不把失败伪装成正常空列表。只输出固定错误码，不回传坏正文；未上架游戏的公告仍先过滤。

根／投影的缺失、JSON／SHA／核心目录／版本／状态校验仍整体拒绝，未放宽准入、签名或资源门。明确删除仍返回410，不被坏公告掩盖。该变化仅完成读取协议隔离；前端还须消费错误标记并显示“通知暂不可用”，尚未接真实firstOnlineAt生产者。

证据`.dragon-analysis/release-readiness/reader-announcements-r1/`十三显式入口全部通过且输入SHA稳定：新[`verify_reader_announcements`](../tools/verify_reader_announcements.mjs)107项在自有workerd/R2同时测旧根与冻结v2根、公告故障／正常空／隐藏过滤、有效目录／新准入／旧票／状态、核心损坏继续拒绝、明确删除及摘要／缺对象拒绝；另冻结联调89、旧reader66、旧publisher29、路径15、新publisher30／30、资源35／35、回执23／23、合同66、旧Outbox10。baseline目录保留新测试对逐字节核对后的旧reader（仅导入路径迁移）确定失败。OS环境白名单、仅显式自有loopback，worker outbound=0，无实际云／用户数据。没有共同生产者、schema、游戏或Trial改动，未部署。

### 2.19 服务端可见时间引用（FIRST-ONLINE-REFERENCE-1）

新增[`firstonline`](../reader/firstonline.js)运输合同和投影`runtimeVersion: 2`，只允许在完整v2根下读取；既有投影v1保持兼容。v2公告不接受预填`firstOnlineAt`，而使用`firstOnline`：初次可见投影为仅含本代`generation`的引用；reader从**此次读取的同一R2根对象**的服务端`uploaded`解析时间，向下规范到S3 Last-Modified的秒级，与既有最小回执一致。不读取本地时钟、自定义metadata、入队或正式提交日期来冒上线时间。公开响应仍只输出日期，不泄露内部引用。

后代必须使用严格四字段`{generation, operationId, operationDigest, payloadDigest}`引用较早事件，authority取当前根；读取既有`control/receipts/<authority>/<generation>/<operationDigest>.json`，不新增别名或可变时间对象。核准确身份、规范八字段字节、摘要／ETag形状、秒级ISO、JSON MIME及4096字节预算。默认资源校验器也在切根前核所有历史时间引用；当前代自引用只能在实际根可见后解析，不预造回执。缺失或损坏历史回执使后续分发保持pending；已可见目录上的公告读故障沿用§2.18隔离，不阻断有效新准入或旧局资源。

证据`.dragon-analysis/release-readiness/first-online-r2/`三十显式入口全部通过且输入SHA稳定。新[`verify_first_online`](../tools/verify_first_online.mjs)89项使用实际文件SQLite、默认新publisher、自有workerd/R2及实际reader：四代覆盖根已切换但回执故障、SQL仍pending时读取实际服务时间、未知前代不越过、同根重试不重写／改时、下架、SQLite重开、较晚根重新上架仍保原时间、历史回执损坏／缺失隔离及修复后推进同代。含身份／字段／跨代／MIME／长度／非规范字节负控；其余回归含公告107、冻结读取89、原reader66、分发／回执／资源、预上传、共同20章预上传与永久操作、50表及Node HTTP、静态包1376资产。r1三十入口也通过，之后仅修新测试输出和未使用参数的风格告警，r2完整重跑；没有覆写历史结果。

仅自有临时SQLite／R2／隔离静态文件，OS环境白名单、显式loopback、worker outbound=0，无云凭据／真实存档／共享dist。坏回执的写回只恢复自有测试夹具，不是生产回滚许可。时间读取信任私有桶的受控不可变回执写边界，不能单靠格式核验独立证明SQL业务授权或公告唯一性。**共同发布／上架生产者还没有生成并持久固定这些引用；公告历史保留、前端提示与生产部署也未由此完成。** 该批不改公告历史政策、schema、游戏或Trial。

### 2.20 公开公告历史与当前运行版分离（ANNOUNCEMENT-HISTORY-1）

按产品Q32及工程合同§8.3，更正旧实现把“当前版可选”扩大为“删旧公告”的错误：共同发布事务不再删除旧公告，`AnnouncementStore`移除该剪枝能力。正式release／运行包仍只供当前选择，公告保存已经公开的名称、作者账户、版本及原日期快照；隐藏发布不新增公告，下架隐藏全历史，重新上架恢复已公开记录并只为尚未公开的当前版新增一条。不会按今天的名称或时间重建已被旧代码删除的记录。

冻结投影的默认资源门与reader允许同游戏的不同历史序号，但仍拒绝重复游戏／序号、无效或大于当前版的序号。v2旧版公告必须引用较早代次回执，不能借当前根自引用重置历史时间；公告仅是信息，不授予旧版新局／读档准入。reader公告错误继续独立降级，不阻断有效目录与当前准入。运输仍保持既有公开DTO及投影顺序；完整前端历史弹窗、分页和统一排序接线不由本批完成。

证据`.dragon-analysis/release-readiness/announcement-history-r2/`三十一显式入口全过、源码SHA稳定。共同Request／实际20章编译回归扩为21组（配置预上传28组）：管理员上架→作者改名后更新→两条冻结公告→下架→隐藏更新→解除限制仍下架→重新上架／重复重上，原快照／日期／ID不变；原永久重放、并发、权限和末端事务故障继续验证。原实现对新增共同入口测试在baseline目录确定失败（1条不等于2条）。公告模型23项另核SQL分页；原子性13组保全部写入失败断言。服务时间／R2联调扩为113项、七个真实冻结代次，核同游戏新版加旧公告、旧序号409而旧票仍读旧章、下架／重上保日期；v1／v2重复／未来／坏序号及v2历史重置时间的负控都保留。其它回归含读取隔离107、冻结读取89、原reader66、分发／回执／预上传／静态包、50表与Node HTTP。r1同31入口已过，随后仅修测试输出／嵌套三元的风格告警，r2完整重跑；旧证据未覆盖。

范围：本地共同应用仍以旧Outbox和本地时间写公告；冻结生产者与§2.19的实际时间引用尚未接入这些权威事务，不能把上述两条测试链拼成生产闭环。仅自有临时SQLite／R2／静态包与显式loopback，无云凭据、真实编辑库／用户档、DOS存档或共享dist。未改schema／规则／游戏／Trial，未commit/push/deploy；物理删除与旧资源保留的完整实现仍待完成。

#### 2.20.1 后继公开公告分页接线审查

接线前的源码审查确认：当时完整公告分页仍是功能缺口，不能用旧SQL服务的分页测试关闭A26。以下为审查基线，后继实现见§2.20.2。

- `server/announcements.js:list` 已有30条／多取一条、`(first_online_at DESC, announcement_id DESC)`及含registry修订的游标；`verify_announcements.mjs`覆盖30＋4条、旧修订重取第一页及坏游标。这是SQL公告路径。冻结模式的共同应用及gateway通过 `isLegacyPlayRoute` 返回 `PLAY_READER_REQUIRED`，不把此旧服务暴露为正式玩家分页后门。
- 正式入口为 `reader/site.js → reader/worker.js:registry`：按当前上架目录筛选公告、解析§2.19真实首次可见时间，返回完整公告数组；当前函数没有分页或游标响应，保持投影顺序而非在日期解析后执行§8.3的完整排序。`web/src/player/playerclient.js:registry` 白名单复制完整数组，当前公开行不包含SQL的 `announcementId`。不能直接把SQL游标接到冻结读取端，或以数组位置临时充当稳定公告身份。
- `web/src/player/playercatalog.js` 弹窗逐行显示完整数组，只有重试按钮；`verify_player_catalog_browser.mjs`明确用40条夹具核41个表格行、滚动、右键返回、点击不启动和3.25秒后不消失。它证明历史展示／交互范围，不证明翻页、游标重置或跨页去重。现有失败隔离保留，公告错误不应成为运行资源依赖。

后续实施出口限于现有产品／工程§8.3：冻结公开链提供稳定公告身份、实际首次可见时间与身份的稳定排序、绑定目录代次的游标；每次取页重新执行当前上架过滤，目录变化重取第一页，客户端清旧页并去重。随后接已有弹窗的取页操作及失败重试；不能自动开局、授旧版准入、恢复旧VPS读路由或新增公告编辑权限。生产发布／部署不属于此本地功能接线授权。

本批仅代码／既有测试范围审查和文档更正，没有更改产品或新增探针，也没有重新运行上述历史测试、浏览器或发布长链。A26保留未完成；后续必须验证真正公开链，不能把SQL与浏览器的分离收据拼成端到端分页证明。

#### 2.20.2 冻结公开公告分页与弹窗接线

`reader/worker.js`在原匿名registry增加可选 `?announcementPage=1`，后续页携带原样URL编码的 `cursor`；不启用旧VPS公告路由，无新写权限。每次请求重新读取当前根／投影并按当前上架目录筛选，沿§2.19解析真实首次可见日期后按 `(firstOnlineAt DESC, announcementId DESC)` 排序，30条一页。冻结投影没有SQL行号，公开 `announcementId` 使用已保证唯一、不可复用的 `gameId:ordinal` 运输身份；不是源实体ID或数组下标，同秒时按该ASCII字符串倒序确定顺序，不借发布日期、投影位置或本地时钟排序。

游标为不超过1024字符的JSON `{generation,digest,time,id}`，绑定当前目录根代次／摘要及末行排序键。换代返回第一页和 `announcementPage.reset=true`；同根不存在的键、坏JSON、重复／坏参数只使公告不可用，保留有效目录。响应含 `announcementPage:{reset,nextCursor}`；旧无分页参数调用继续返回原整表DTO，避免改变既有客户端／归档调用合同。本次仍读取完整受预算约束的投影及所需日期回执后取页，不宣称R2读取成本已降为每页30条。

`playerclient.registry({announcementCursor:null|string})`在边界验证页DTO、30条上限、稳定ID和游标长度／不原地循环，失败不损坏有效目录。玩家公告弹窗默认取第一页，以“載入更多”取后页；同根合并按稳定ID去重，换代清旧页，错误清陈旧公告且可重试第一页。原epoch丢弃迟到响应；按钮忙时禁用、Tab在可用按钮间循环，右键仅退公告、无自动关闭／关闭按钮／点击开局。没有修改游戏规则、发布或存档准入。

复用现有验证入口：`verify_reader`77项（真实自有workerd/R2，新增40条30＋10分页、跨页同秒排序／唯一ID、旧调用兼容、坏参数隔离、下架及重上换代）；`verify_first_online`115项（七个真实冻结代次，新增v2分页保持服务时间／历史快照和同秒稳定排序）。后者原“更新后旧票仍读旧章”断言违反已批准当前版唯一政策，已改为409 `RELEASE_CHANGED`，没有为旧测试修改产品准入。`verify_player_client`50项覆盖页DTO拒绝／原地游标／长度前置拒绝；`verify_player_catalog_browser`24项在新Chromium和受控API回包上核30＋10、换代替换、失败／重试、键盘及原只读交互，artifact `release-readiness/player-catalog-browser-KH96ka`。这些是当时的分范围证据；后继真实HTTP联合读取见§2.20.3，仍不冒生产部署证明。

日志在 `.dragon-analysis/editor-completion/announcement-page-*`：reader-r2、first-online-r1、client-r2、browser-r3；首轮reader／browser也通过，后继简化排序表达式、修Shift-Tab初始焦点；缓存检查发现client嵌套三元和浏览器夹具布尔写法告警后作等义简化，再跑client／browser，旧收据保留。最新原生束build-r3／r4两次重建，第二次unchanged：236文件，SHA `0d8fb998f12a02e06d79f30bfbdf051126a5fe9b4f5d4b3baf13d1085db3e9a9`；两壳仍为 `a456d35638594b2bf3e24a94ab7ec9478de6b40ca565d5afb79febf8598f90a0`／`515019f2fc5ac16bb4f0efb238f586a0840a325db57a66fb78c4a48bb7f00ffe`，现库f4ba804b及20项消费者指纹均匹配，未生成新注册表。七个代码文件主动LSP等待300秒均push-only未确认，不能标clean；未重跑无关地图保存／Trial／完整发布／游戏规则长链，未访问真实SAVE或用户profile，未commit/push/deploy。

#### 2.20.3 公告分页真实HTTPS联合读取

复用 `node tools/verify_player_client_workerd.mjs --catalog-browser`，没有另建验证框架或修改产品：既有Node客户端7组之后，在自有workerd／临时R2及全新Chromium上增加7组。实际 `mountPublicCatalog` 默认同源reader／原生fetch通过loopback HTTPS读取registry；Playwright只提供测试HTML和转送现有静态模块，API只continue，不替换回包、fetch或客户端。使用v1不透明运输夹具的40条历史，不冒40次真实作者发布；v2服务时间／历史回执证据仍分别见§2.19及§2.20.2。

浏览器阶段8次真实registry GET均200／no-store，覆盖默认内置与最新通知、30＋10行／唯一序号／同秒倒序、重试第一页、翻页前下架清除旧公告及失效选择、重上恢复原40条全部列值、翻页前根换代回首30而非拼旧页、之后再取得后10条。实际请求游标绑定新根generation／digest；右键返回，点击公告行不请求准入，未调用IDB。页面错误、失败请求、越白名单请求、外网调用均0；Node旧流程另有4次准入及9次文件读取，不能把它们误记为浏览器访问。

最终 `announcement-http-r3.log` 14组，artifact `.dragon-analysis/editor-completion/announcement-http-sOXj0w/result.json` 保留实际请求／响应状态、根、40条DOM列值与7个来源SHA；不带选项的 `announcement-http-default-r1.log` 原7组也通过。r1因辅助CDP `response.json()` 取体失败而中止，不计通过；删除该冗余观察器的取体操作，改以真实HTTP元数据、请求游标和实际DOM验证，既不忽略浏览器错误，也不包装原生fetch。r2已通过，r3只更新入口说明后重跑；失败日志及旧收据保留。

边界：这是公开组件到真实reader的本地联合读取，不是完整App启动、作者／编译／分发生成40版、生产受信TLS或云部署证明。workerd仍输出一次 `CERTIFICATE_UNKNOWN` 自签证书协商日志；仅新测试context允许自签证书，未改全局信任，不能称TLS日志干净。A26的本地公告阅读／分页出口限定关闭；完整发布、公告物理清理分别仍归A23/A30等未闭合项。只改既有验证入口及文档，不重建未变的原生束、不重跑地图／Trial／完整发布长链；代码主动LSP等待300秒仍push-only未确认，不能标clean。

### 2.21 上架必须已有正式发布身份（LISTING-PUBLICATION-1）

核对全事件生产者接缝时，实际共同Request复现：尚无正式版本的草稿可以被管理员置为listed，随后作者首次发布便可能直接进入目录，违反发布与上架分离。baseline目录保留旧源码SHA及新断言的确定失败：返回200／listed:true／currentReleaseId:null，而应拒绝。

[`PublishedGames.assertListableInTxn`](../server/published.js)仅供可信共同路由，在原管理员／密码／栅栏／行修订检查之后、同一上架事务内核正式指针、release所属游戏及正式序号、pin所属人／版本／摘要／非空不重复章节，以及已提交pack的版本／摘要。未发布返回409 `GAME_NOT_PUBLISHED`；身份撕裂拒绝，不用草稿或其它版本兜底。校验失败连同listed、行修订、审计、公告与registry一起回滚；既有权限优先级不变。该方法不替代R2依赖闭包、预上传或可见回执，也不为旧数据自动迁移／补正式版本。

证据`.dragon-analysis/release-readiness/listing-publication-r1/`三十一显式入口全过、源码SHA稳定。共同Request／实际20章编译为23组，配置预上传30组：作者无权上架、管理员不能预上架、15种指针／所属游戏／正式序号／pin／pack身份故障、缺pin与缺pack都拒绝且事务状态保持；修复测试注入后正常上架、更新、下架／重上、历史公告、永久重放及原末端故障仍通过。预上传仍为自有内存R2和实际1376项静态文件端口；其它31入口涵盖既有50表、Node HTTP、workerd schema、分发／回执／reader与静态回归，不把schema通过称为本方法在workerd的功能验证。

仅改两处后端模块及现有Root回归，无新增DDL、游戏规则、前端或Trial变更。该历史批尚未接上架永久幂等（后继见§2.22）；冻结全事件生产者及实际可见状态仍待接线，旧Outbox／本地公告时间不是生产闭环，未commit/push/deploy。

### 2.22 管理员上架永久幂等（LISTING-OPERATION-1）

实际共同Request复现并修复：成功上架后，完全相同请求重试原先返回409 `GAME_CHANGED`。现在[`GameManagement.list`](../server/management.js)在同一SQLite事务复用`content_reservations`／`content_operations`，方法为`admin-list`；新提交把原上架回调（正式身份门、flag、公告／registry）、审计和永久结果一起提交。原响应summary字段不变，完整结果限定64KiB、严格字段及状态校验；不增加DDL或TTL。现有管理操作查询接口可读该回执。

相同主体／键／请求摘要／目标／epoch返回原结果，不重复执行回调或增加公告。重建应用及workerd实例后仍可重放；后来下架或限制后，旧回执只返回当时快照，不重新上架。每次仍核当前管理员、密码、session／epoch、键命名空间和删除栅栏；陈旧新请求、换内容／目标复用键、半对回执或损坏结果均拒绝。可信回调必须同步；晚期写回执／审计故障、返回thenable或事务内认证失效都回滚。旧unlist／clear实现与返回合同不改。

证据`.dragon-analysis/release-readiness/listing-operation-r2/`三十三显式入口全部通过、输入SHA稳定：新增Node SQLite与实际自有workerd共享25组，后者dispose／重建后读取原永久回执；实际共同Request／20章编译28组，预上传模式35组。覆盖同键并发、实例重建／查询、冲突与Origin、晚期receipt故障九表状态保持、下架后原回执不改变状态，以及原发布／上架身份门／历史公告／50表与运输回归。预上传仍为内存R2＋实际1376项静态文件端口，不冒真实云或浏览器。

失败证据保留：`listing-operation-baseline/`为未修代码的确定409重试失败；新单元夹具首次用了错误UUID variant，修测试数据而未放宽校验；初版workerd在测试`CREATE TEMP TRIGGER`处报`SQLITE_AUTH`，栈探针定位后改为自有库普通trigger、finally删除，故障断言不变。r1停于该测试错误；r2完整重跑通过。环境为OS白名单和显式自有loopback，其余入口低层禁网；workerd outbound=0，不碰真实档、凭据或共享产物。

边界：前端现有API会提供幂等键，但本批未新增浏览器持久重试UI；没有把上架事务写入冻结分发账本，也未实现实际firstOnlineAt回填或Cloudflare可见状态。该批未接冻结生产者；后继可选接线见§2.23，未commit/push/deploy。

### 2.23 可选共同冻结生产者（FROZEN-PRODUCER-1）

共同应用增加仅供可信装配的`frozenPublication:true`，必须同时提供既有品牌预上传器；默认原型模式未启用它。[生产者](../server/publicationproducer.js)在实际发布、管理员上架、下架／解除限制、删除栅栏的同一SQLite事务记录冻结事件。发布的正式序号、pack／pin、永久操作结果和事件一起成功或回滚；管理／删除的原永久回执重放不再入列，无公开状态变化的no-op也不新增代次。同游戏有待确认事件时拒绝下一次新发布，原成功请求仍可重放。

新[私有目录合同](../server/publicationcatalog.js)存于准确payload的`catalog`，保留所有已知游戏的当前运行引用、上下架／删除栅栏状态及曾公开公告快照。下一操作只复制已校验的冻结尾部，提升前代自引用为准确操作摘要引用，再修改本次目标；不在排空时重读当前pack。公开projection只由白名单派生，隐藏游戏不输出名称／账户，目录只给当前版，公告保留已上架游戏的历史快照。私有目录不上传到公开projection；仍受4MiB payload／2MiB projection预算约束，超限拒绝而不截断或自动回收。

首次可见仍用§2.19的服务时间引用，不写本地时间代替：新模式不写旧Outbox或旧本地时间公告表。默认资源校验器核私有目录与投影完全一致；publisher现在可注入真实静态资源检查端口，而不必替换整个资源门。旧Outbox／本地公告、遗漏的其它游戏正式指针或删除栅栏、目录与现行SQL状态不符均拒绝，不能静默“导入”旧库。一旦冻结账本非空，默认旧适配器也不得遗漏新状态事件；旧破坏性`unpublish`在新模式拒绝。没有自动迁移、自动解锁或回退。

证据`.dragon-analysis/release-readiness/frozen-producer-r2/`三十六显式入口全部通过、输入SHA稳定：新增目录34组、双游戏实际SQL14组、实际共同Request链16组；既有33入口完整重跑。共同链使用真实固定库安装／20章编译、私有文件桶、实际1376项隔离静态包、内存条件R2、默认publisher及同一reader的Node调用。八代覆盖隐藏发布、上架、更新、下架／解除限制／再上架和删除栅栏；SQL包被栅栏移除后，仍可依次排空早已冻结的中间版本。验证同键并发／重建／重放、同游戏pending拒绝、四个提交故障的回滚、旧适配器拒绝漏记、旧票跨更新下架续取与栅栏后的410。单独双游戏探针核隐藏引用保留、异游戏公告引用、旧状态漏入拒绝和尾部坏字节拒绝；其主体／运行DTO为明确seam，不冒HTTP授权。

失败记录保留于`frozen-producer-probes/`：首次完整链揭示publisher默认门未接静态端口，因而保持pending；补该真实配置接缝后，另修测试的错误签名环境变量名及删除URL，未放宽产品校验。r1全部36入口通过后，增加跨游戏SQL覆盖检查及负控、修纯风格warning，r2完整重跑。均为OS环境白名单、显式自有loopback或低层禁网，不接真桶／凭据／用户profile／DOS存档。

边界：此模式尚未装进生产CLI、常驻排空器或UI；原发布响应仍是本地pin，不是可见确认；本批旧VPS玩家／公告读路由尚未收口，后继已在冻结模式明确关闭，见[VPS就绪§4.7](vps-editor-readiness.md#47-后继冻结模式关闭旧玩家读取面frozen-player-surface-1)，并非改用本地SQL作为新权威读取。这里的410由不可逆删除栅栏产生停止读取事实，不是物理清理完成；旧SQL payload及R2字节仍留存，物理删除门继续关闭。未验证实际云S3、掉电／整进程恢复、浏览器同引擎开局／存档、静态迟到资源保留或整套部署。共同50表无新增DDL，未commit/push/deploy。

### 2.24 作者发布操作状态（PUBLICATION-STATUS-1）

新冻结发布将`releaseId`同时用作该次publish事件的`operationId`，由既有永久发布回执定位；管理员操作仍用独立随机UUID。没有新增表／索引、改写旧回执或扫描历代4MiB payload。旧原型若没有这一关联，不推断或自动迁移，查询明确返回`DISTRIBUTION_STATUS_UNAVAILABLE`。

共同应用新增登录作者只读`GET /api/games/:gameId/publish-operations/:requestKey`：当前主体、所属游戏、命名空间、密码／会话／epoch、删除栅栏及成对永久回执都重新检查；管理员不能借此查看他人的发布回执。返回准确旧本地回执与`distribution`白名单：gameId、operationId、generation、kind、state、visibleAt、recoveryRequired。旧请求在版本剪枝／后续更新后仍定位原事件；未知请求404、坏回执503、栅栏409，未配置新模式503。POST发布响应仍保持原pin，不把它改成可见成功响应。

账本只读查询核操作元数据及已持久确认回执，不读chunks、不联网、不写SQL、不推进排空或解除恢复锁。`pending`／`visibleAt:null`表示尚无本地持久确认，即使远端根已经切换也不能乐观报成功；`confirmed`与visibleAt只证明该历史操作的根曾被确认，**不是当前仍上架、远端最新头或公告firstOnlineAt的替代物**。隐藏发布也可confirmed；恢复锁另以recoveryRequired表示。

证据`.dragon-analysis/release-readiness/publication-status-r2/`三十六显式入口全过，1627输入SHA稳定。永久发布模型37组，账本Node31／workerd30组及实例重建；实际20章共同冻结链23组／八代，包含当前认证／IDOR／坏查询、版本剪枝后读取、实例重建、缺分发关联、旧模式拒绝、删除栅栏，以及根已切换但最小回执写失败时仍pending、重试确认不重切根。元数据探针明确拒读chunks／任何写SQL；原共同Root两模式、publisher／reader／静态包及50表门完整重跑。

失败现场保留：最初快速探针的预加载路径缺`./`，在执行产品前失败；r1新增两组账本探针后，workerd包装器仍断言旧28组而失败。r2同步为30组，并将原恢复锁用例保留为最后一组，完整保留原实例重建断言，未放宽状态预期。实际共同链仍用内存条件R2与固定测试服务日期，不能冒真云证明；其它既有实际workerd/R2时间回归独立通过。本批尚未接作者重试UI（后继见§2.25）、管理员各操作状态或常驻drainer，未commit/push/deploy。

### 2.25 作者发布追踪与显式重试（PUBLICATION-UI-1）

[`publish.txt`](../server/public/publish.txt)接§2.24只读状态：发送POST前在当前标签页sessionStorage按作者ID保存并读回原请求键、原始名称、游戏与账户公开version，不存凭据、草稿或准入票。存储失败／坏关联阻止新请求。重载只恢复关联，不自动POST或查询；得到本地pin后只读查询分发，查询失败不把已提交改称失败。pending、历史confirmed、恢复锁与目前上架分开显示；没有自动轮询或客户端解除恢复锁。

未知POST先明确GET。仅准确`PUBLISH_OPERATION_NOT_FOUND`且没有已知本地回执时开放显式同键／同原始名称重试；404不证明请求已取消或不在途。账户version变化不重送，服务端仍重验真正epoch／权限。现POST没有预期草稿修订参数，因此确认文案明确：未提交时按服务端当时的已保存草稿校验，不能把这称为原草稿快照重放。停止本机追踪需要确认，不取消服务、不删除永久键，也警告另起键可能产生下一版。确认记录保留到用户明确停止追踪。

异步结果绑定账户快照、身份代次、原关联及查询序号，晚到旧查询不能覆盖新观察；切换账户清除旧输入／显示，不消费另一账户关联。所有动态内容以textContent或input.value呈现。更正旧UI的“替换立即删除旧资源”文案，明确旧局固定资源与旧档不相容。[`client.txt`](../server/public/client.txt)仅为发布模块传递beforeunload标记：该路径不再调用浏览器禁止的confirm，由原生离开提示处理；普通工作台离开仍可确认，不借此宣称其它模块离开流程已全审计。

最终证据`.dragon-analysis/release-readiness/publication-ui-r4/`八个显式入口全部通过、输入SHA稳定：原UI模型16、新追踪模型39、全新Chromium实际共同静态路由／安全头／HTML／client九组、永久操作37、实际20章冻结链23／八代、旧共同Root28、Node HTTP11及workerd50表。清单显式覆盖13个公共页面／模块／样式输入；浏览器静态请求经共同入口返回，只有API响应由测试控制。3次POST／6次状态GET、5个预期404／503，无额外请求失败、pageerror或外联，IDB.open为0；pending／confirmed截图与摘要在独立目录。Node HTTP另逐个核client全部十个模块的实际路由、MIME／no-store／nosniff和原文件字节。**本批浏览器UI与真实权威链分别验证，不拼成实际浏览器→SQL→R2证明；后继串接见§2.26。**

保留失败：前两次浏览器探针发现三条beforeunload禁止confirm的console错误，修调用边界而非忽略错误；r1八入口通过后，补账户切换输入断言复现原名称残留，清除后r2完整重跑。r2审计又发现publish.txt未列入递归输入清单：共同入口本身漏了`/publish.js`，而早期浏览器夹具直接提供文件掩盖该缺口。新增实际HTTP负例先复现404，再补唯一静态导入／映射／白名单；r3显式固定全部公共输入、经真实共同静态入口重跑浏览器及八入口；随后只将新测试的嵌套条件表达式改成等价if/else消除warning，r4完整复验。r1历史模块摘要取自当时浏览器结果，不伪造缺失的旧清单pin；失败现场均保留。无权威业务模型／schema／游戏／Trial变更；管理员状态关联、生产装配、旧玩家API收口与完整玩家端仍待完成，未commit/push/deploy。

#### 2.25.1 后继资源拒收的发布提示

`publish.txt` 为 `PLAY_CITY_VIEW_MISSING` 和 `PLAY_PORTRAIT_CORRUPT` 增加繁体说明，分别提示核对章节据点图片／武将画像依赖及已保存草稿，不再只显示内部码。画像错误不被简化成一定是255，也不声称工作台已支持修改所有城图字段。权威拒收分别见[据点图片门](editor-city-definitions.md#后继发布据点图片依赖拒收)与[画像依赖门](re-notes-portrait-reader.md#后继发布画像255依赖拒收)。

只改显示映射，不按422／500清除原操作或自行重试；保留原键、原名称及后续已编辑名称。仍须明确查询，只有原精确404条件允许显式同键／同原正文重送，不推定取消、回滚或未耗版本。

复用 `verify_publish_ui_model.mjs` **15项通过**（新增两错误分支），核提示、无自动GET／POST、原journal不变、未查询重试拒绝、查询404后同键同正文、输入保留。新Chromium既有工作台 **200组通过**，`.dragon-analysis/editor-workbench/run-DtzD1V/result.json`；这是API夹具工作台回归，新两条提示的精确覆盖来自控制器用例，不冒实际HTTP缺图发布或新增DOM错误路径验收。shell65、MJS语法、TXT实际导入及diff通过；测试主动LSP300秒push-only未确认，TXT不支持，诊断与指纹见 `.dragon-analysis/editor-completion/publish-asset-message-final-hashes.json`。无Vue生成壳／web/src／服务端权威或DDL变化，不重建两束，不重复无影响实际发布／Trial／规则长链。完整A20／A23／A32仍未完成。

#### 2.25.2 后继移动意向拒收的发布提示

`publish.txt` 为现有422 `DRAFT_TOPOLOGY_BROKEN` 增加繁体说明：尚有据点移动意向，不能发布，应核对原意向；道路重建记录不代表已完成重连或通过运行检查。不自动撤销意向、不清发布journal、不改键／名称、不改变查询404后才能显式重试的原流程，也不宣称清除意向就满足全部发布条件。

本轮核对 `hasPendingMoves`、草稿保存及Root发布检查，并复核[现行拓扑GET合同](editor-framework-shell.md#后继拓扑覆盖的阻挡与重建摘要一致性)：blocked只表示移动意向是否存在，重建记录独立暂存、没有写入权威地图。不能把这个布尔值当成完整道路准入；审计表原“任何意向仍阻运行”的概括已更正为实际边界。本批不扩大该布尔值、变更重建-only行为或放宽G-ROAD。

复用发布控制器错误分支，`topology-publish-message-before.log` 负控15过／1失败，明确旧界面只显示内部码；修后 `-controller.log` **16项通过**。新增分支核繁体说明、无自动GET／POST、原journal与后改名称保留、未查询不能重试、精确404后原键原正文重送；两个既有资源拒收提示及其余流程保持。shell65通过；全新Chromium既有工作台 **213组通过**，`.dragon-analysis/editor-workbench/run-y0TGsj/result.json`。浏览器为API夹具回归，新提示的精确证据来自控制器，不冒真实拒收HTTP或新增DOM错误路径验证。

MJS语法、TXT实际导入执行、diff、链接及测试前后入口SHA核对通过；主动诊断及当前指纹见 `topology-publish-message-final-hashes.json`。一次打印已有日志遇到GBK输出字符错误，改UTF-8后读取成功，未改原日志或重写测试结果。没有Vue、生成壳、web/src、后台准入、DDL或资源变化，不构建两束、不重复无影响真实发布／Trial／规则长链。A12／A23及完整编辑器仍未完成。

### 2.26 浏览器与实际本地发布链（PUBLICATION-BROWSER-CHAIN-1）

新增[`verify_publication_chain_browser`](../tools/verify_publication_chain_browser.mjs)将新Chromium页面请求转接到实际共同gateway／密码登录／当前会话／文件SQLite／20章编译及预上传，使用默认publisher、真实自有workerd R2条件写／服务时间／最小回执和实际workerd reader；**不再为此链伪造API响应**。两个虚拟HTTPS origin的运输由Playwright进程内转接，并非Node TCP／TLS／云S3；编辑器cookie不送玩家域，票据只在测试玩家页内存，IDB.open为0。固定完整副本bootstrap与管理员直接认证Request仍是显式测试准备，不冒作者空白新建或管理员UI。

十组覆盖：真实浏览器密码登录与游戏列表；实际发布提交后丢弃一次响应，刷新只恢复原键、GET真实永久回执而不重发；根已切换但回执写故障时仍pending，恢复确认不重切根、UI时间与R2 uploaded秒精度一致；隐藏发布不进入玩家目录；管理员上架后逐章准入并由浏览器SHA核全部20章与SQL编译字节相等；浏览器发布1.1后旧版不可新准入、旧票继续取旧索引；下架拒新准入但旧票续取；删除栅栏最终410。两次发布使用同一已保存草稿、不同发布名称，不冒内容编辑后的场景差异证明。五代全部确认，重开实际文件SQLite后publisher idle，不额外切根。测试明确核旧R2对象仍存在，**不是物理删除证明**。

最终证据`.dragon-analysis/release-readiness/publication-chain-r3/`九个显式入口全过、输入SHA稳定：新链十组，原UI16／新模型39／受控API浏览器九组、永久操作37、共同冻结链23／八代、旧Root28、Node HTTP11、workerd50表。新链两次浏览器POST、五次实际R2切根，1449次分发端GET／66次不可变PUT；静态端口读取实际隔离包1376个asset，共8268读／六次检查。只有预期的初始401、版本409、下架403、删除410及一条丢响应网络错误，无额外pageerror／外联，worker outbound=0；截图及13个UI输入摘要另存独立目录。

失败保留：r1测试误以为登录按钮显式写了type=submit而等待超时，改用实际“登入”角色定位，不改产品；r2九入口通过后补齐逐章实际读取及浏览器版本记录，r3全部重跑。仅新增两个测试文件，无产品／schema／游戏／Trial修改。静态检查仍是文件端口；同引擎运行、存档、迟到资源、生产HTTP／CLI／常驻drainer与物理清理尚未由此完成，未commit/push/deploy。

### 2.27 管理员上下架／限制操作的分发关联（MANAGEMENT-DISTRIBUTION-1）

冻结模式的新上架、下架、解除限制操作，在原永久回执内部使用`{version:1,result,distribution}`封装；`distribution`仅保存准确`operationId/generation`，明确无状态变化的操作为null。原POST及原management-operations查询仍返回原result形状，不把本地提交改称远端成功。未配置关联回调的旧模式继续写原格式；既有回执不重写、不按序号／时间猜关联，没有关联的状态查询明确503。没有新DDL、旁路账本或公开payload扫描。

受信同步回调与原状态变更、冻结事件、reservation／永久结果、审计处于同一SQLite事务；重放不调用回调。关联必须对应同游戏、同事件种类及代次；缺失结果、错误引用、原生async或thenable均拒绝并回滚。no-op不生成事件，只记录明确的null；它不是pending或confirmed。最后行状态／当前会话检查仍在回调之后，不能因增加回调而绕过一致性门。

新增当前管理员只读`GET /api/admin/games/:gameId/management-operations/:requestKey/distribution`，禁止query参数。主体、改密／session／epoch、自己的永久请求、成对回执、命名空间和删除栅栏都重新核验；另一个管理员也不能查他人的请求。返回`{version:1,gameId,result,distribution}`，非null时是既有账本状态白名单。查询不读chunks、不联网、不推动排空或解除恢复锁。confirmed只说明该历史事件曾被持久确认，不表示现在仍上架；后来下架／更新和重建实例不把原操作重做。旧格式关联未知503，未启用冻结模式503，删除栅栏409；本接口未覆盖删除栅栏请求本身。

最终证据`.dragon-analysis/release-readiness/management-distribution-r3/`二十个显式入口全部通过，1613输入SHA稳定。Node／实际workerd保留原25组，并增加24组关联／损坏／权限／回滚探针，两类回执均跨workerd实例重建；实际20章共同冻结链30组／八代核pending、历史确认、no-op、权限及旧操作查询。另完整重跑共同Root旧模式28／预上传35、两种实际浏览器发布链各十组、作者UI／永久发布、Node HTTP两模式、生命周期／CLI和严格50表／49索引／343列／4FK。浏览器仍是进程内运输桥，管理员动作用直接认证Request；本批没有管理员状态UI、新玩家引擎或物理删除认证。

r1二十入口通过后，补“已配置回调却返回undefined”拒绝，r2完整通过；随后受控负例复现回调晚改listed却逃过最终行校验，将关联回调移到最终行校验之前，r3全部重跑。失败原证保留在`management-distribution-probes/callback-row.*`，未削弱原25组断言。Jev仅发送已审脱敏概述尝试辅助分流，返回地区不可用HTTP451；未取得建议，也未作为正确性或放行依据。未commit/push/deploy。

### 2.28 管理员操作追踪与分发状态界面（MANAGEMENT-DISTRIBUTION-UI-1）

[`management.txt`](../server/public/management.txt)现支持管理员上架正式版本、下架限制及解除限制；仍不修改或发布他人草稿。上架资格按既有管理清单的`currentReleaseId`判断，不能以公开名称是否存在代替正式身份；真正资格／权限／CAS仍由服务核验。自己的游戏列表退役原来不保留请求键的直接上下架按钮，统一指向管理面板，不向作者暗示上架权限。

三种操作均在POST前写入并读回sessionStorage原主体／公开版本／目标／动作／键／原修订；上架body含原expectedRowRevision，所有动作保持原If-Match。成功回执不再清除追踪：先核永久本地结果，再只读查询§2.27分发。展示本地提交、待确认、历史已确认、恢复锁和明确无新增事件的no-op，均不冒当前远端状态。确认后须明确停止本机追踪才可另起操作；不取消在途请求或删除服务回执。重载仅恢复关联，无自动GET／POST；只有未知提交且永久结果GET明确404 `MANAGEMENT_OPERATION_NOT_FOUND`允许显式同键／原body／原修订重试。已知提交后任何状态查询失败均不开放重发。账户／版本切换、坏journal、读回失败、晚到请求和并发查询分别防护；beforeunload不调用嵌套confirm。

最终证据`.dragon-analysis/release-readiness/management-ui-r3/`十二个显式入口全部通过：新模型46组，Node／workerd原25＋关联24组及重建，实际管理员浏览器链11组，原浏览器链10组，作者模型16／39与受控浏览器9组，共同冻结链30组／八代、Node HTTP两模式各12组及实际workerd 50表／49索引／343列。新管理员链使用独立全新浏览器context、真实密码登录／Node service／同一文件SQLite／20章编译／默认publisher／自有workerd R2及reader，不用管理API响应夹具：上架真实提交后丢响应，刷新保键且不自动查询，GET恢复pending，排空后显示实际R2服务时间；后续更新不重做旧上架，下架／解除限制各有独立事件且解除仍下架。两次作者发布、三个管理POST、六代确认；20章SHA、旧票续取、栅栏410和数据库重开原断言仍在。两张管理面板截图已检查。

保留失败：初期模型探针错误假定一个microtask足以进入第二个GET、以及直接修改夹具源对象会改变UI已复制清单，均改为明确同步／刷新；输入扫描拒绝测试的部分data-URL字面量，改用显式moduleURL且继续固定实际公共文件，不放宽扫描门。r1实际浏览器发现首次发布后公开名称仍null，导致新上架按钮错误禁用；改用既有currentReleaseId并将模型默认样本设为名称null／正式指针有效，r2完整重跑；随后仅将测试期望body的嵌套条件改为等价if/else消除告警，r3十二入口再次全部通过。旧管理UI历史lane的“成功立即删除journal”断言不再是现行追踪合同，不用其历史47表收据冒本轮结果。

此链仍通过进程内浏览器运输桥，而不是TCP／TLS／真实云；两版仍用同一已保存草稿。删除仍是直接认证Request的栅栏测试，不是删除追踪UI或物理清理。没有后端业务、DDL、规则、引擎或Trial束变更；尚缺实际玩家引擎接入、正式存档、静态旧资源保留、物理删除和生产部署。Jev此前地区HTTP451尚不可用，不重试绕过，也不以辅助意见替代验证。未commit/push/deploy。

### 2.29 删除栅栏请求的分发关联（DELETION-DISTRIBUTION-1）

冻结模式的删除栅栏现在把准确分发事件引用与原请求回执放在同一SQLite事务：内部保存`{version:1,result,distribution:{operationId,generation}}`，原POST及原GET仍只返回四字段fenced结果。受信同步回调只在新请求执行；重放不再入列。记录必须匹配同游戏、delete-fence种类及实际事件代次，undefined／null／thenable／错误关联拒绝；末端重新核主体／epoch／角色、命名空间、owner、行修订、下架状态和栅栏回执。任何晚期故障连同栅栏、级联、事件、审计和回执回滚。旧模式保持原JSON，不迁移或猜旧关联。

新增当前请求主体只读`GET /api/games/:gameId/deletion-operations/:requestKey/distribution`；作者只能查询自己发起的请求，管理员亦不能借其他人的键读取回执。它在栅栏成立后仍可读取，返回`{version:1,gameId,result,distribution}`，分发字段复用账本状态白名单。pending表示未取得本地持久分发确认；confirmed仅表示该删除栅栏事件曾获根确认，**不是物理清理完成**。旧关联未知503、旧装配未配置503、其他主体／错误路径目标404、改密／停用／epoch失效仍拒绝；不读chunks、不联网、不执行清理或解除恢复锁。原GET也补路径gameId与回执目标一致检查，operations及distribution路径不接受POST。

证据`.dragon-analysis/release-readiness/deletion-distribution-r1/`十七个显式入口全部通过。新Node／实际workerd共享24组，含原结果与旧JSON、重放不回调、精确关联、损坏／异步／晚期权限和行状态变化回滚、审计失败及workerd持久实例重建。实际20章共同冻结链扩至35组／八代：栅栏事件失败整事务回滚、pending查询、主体／路径／会话负控、旧装配拒绝及排空后历史确认；原包删除后仍可按冻结字节排空。另回归共同旧Root、管理关联双平台、管理员／原浏览器链、作者UI、HTTP两模式和50表／49索引／343列／4FK门。浏览器继续真实本地R2与进程内运输桥，但本批新状态接口的HTTP断言来自共同Request测试，非新增删除状态UI。

没有新DDL／物理删除权限／引擎变化。非空全局分发账本的删除inventory仍明确拒绝，历史payload、旧R2对象、在途写和备份清理均未因此闭合；新回执不是绕开这些门的能力。删除追踪界面、完整玩家接线、Linux／真实云与部署仍待后继，未commit/push/deploy。

#### 2.29.1 后继拓扑意向删除栅栏复核

`DraftTopology` 原共同 `#owned` 只校主体及作者自己的游戏清单，没有检查删除栅栏；清单仍含该游戏，因此栅栏后仍能替换移动／重建意向或撤销记录。现于身份、强制改密、内置保护、ID及所有权检查之后调用既有 `GameMetadataStore.assertNotDeleting`，构造器明确要求该能力。另一作者及管理员的非自有内容仍先404，不借新增检查泄露栅栏；自有栅栏游戏拒409 `GAME_DELETING`。

共同检查覆盖record、rebuild、clear单项／全部、clearRebuild、list、listRebuilds及status。各方法从检查到操作保持同步；Root的异步源捕获返回后仍通过这些方法重新校主体／所有权／栅栏，不在路由层另复制一套门。没有改移动／几何规则、意向表结构、草稿保存门或deleteAllowed；内部hasPendingMoves继续保留原阻断，不为显示失败清意向。

复用 `tools/verify_vps_topology_intent.mjs`，`.dragon-analysis/editor-completion/topology-fence-before.log` 负控在栅栏后的record出现“Missing expected exception”，不是推测风险。修后 `topology-fence-after.log` 及固定入口／依赖SHA后的最终 `topology-fence-after-r2.log` 均 **30项通过**（原21＋9）：原固定源装配、保存阻断／撤销恢复、重建及坏几何检查保留；新增八种服务操作均拒绝，自有作者409、另一作者及管理员404，逐项比较两张意向表及content_games不变；栅栏、pending门及捕获源全文摘要保持。旧“cross-owner 404”用例实际使用无效主体，仅证401，现已更正名字；新的有效跨作者／管理员由明确principal夹具分别验证。

测试使用SQLite内存数据库、独立临时FileBucket和固定源，用户／principal、来源登记及直接插入栅栏时机均为夹具；不是实际删除事务、登录HTTP、跨进程竞态或物理回收证书。shell65、两代码语法／diff／链接通过；源码及主动诊断见 `topology-fence-final-hashes.json`。未改Vue、web/src、DDL或资源，不构建两束，不重复无影响浏览器／规则／Trial／发布长链。A12／A29仍部分、A30物理删除仍未完成。

#### 2.29.2 拓扑意向共同Request路径验证

复用 `verify_editor_template_root.mjs --topology-fence-only`，不安装固定源或运行完整创建长链。共同Root的Request路由、session／CSRF检查与独立文件SQLite是真实实现；用户会话、游戏元数据和小型意向用源为明确夹具，`captureForCompile` 替身在await中插入栅栏后返回原对象。此处验证路由返回后实际进入共同服务门，不冒真实草稿捕获、删除事务或网络并发。

两个作者分别覆盖move／rebuild，共 **4组**：先经路由成功建立两类意向，再在读取期间加栅栏，原本合法的新移动／重建请求均409 `GAME_DELETING`，不能覆盖先前记录。每组随后六条请求（读取、移动、重建、单项撤销、全部移动撤销、重建撤销）对自有作者均409，对另一作者及管理员均404；72次后续拒绝逐项保持两张意向表和content_games全文，捕获源对象及栅栏也保持。没有解除pending门、改道路算法或开放物理删除。

`topology-fence-request-r1.log`、`-r2.log`、最终固定9个入口／依赖SHA后的 `-r3.log` 均4组通过。复跑同工具原画像分支发现旧byte-reader会话撤销夹具使用无条件LIMIT 1，可选到前面新增的栅栏游戏，先返回409而非进入读取后401；`topology-fence-request-portrait-regression.log` 保留失败。仅修测试为明确选择未栅栏游戏，并断言byte-reader实际调用一次，不放宽任何拒绝码；最终 `-portrait-regression-r2.log` **12组通过**。两类入口的会话／捕获时机仍是明确夹具，非真实登录／HTTPS或完整权限矩阵。

语法、diff、链接与最终输入摘要核对通过；当前源码、日志及主动诊断见 `topology-fence-request-final-hashes.json`。本批只改既有测试及文档，没有产品、Vue、web/src、DDL或资源变化，不重建两束、不重复无影响浏览器／Trial／发布／规则长链。A12／A29仍部分，A30仍未完成。

#### 2.29.3 拓扑意向捕获后的会话撤销复核

沿用同一 `verify_editor_template_root.mjs --topology-fence-only`，在原四个删除栅栏场景后增加两条独立、未栅栏游戏的epoch场景：作者的move及另一作者的rebuild。先用真实Request成功建立原移动与重建记录，再由明确的 `captureForCompile` 替身在await内将该用户epoch从1改为2并返回原对象；现有服务复核使在途请求返回401 `SESSION_INVALID`，两张意向表、所有游戏行及源对象保持原样，不需新增产品检查。

每条旧会话随后再次读取、移动、重建、单项／全部移动撤销、重建撤销，六条均401，源捕获计数保持3（两次成功准备加一次在途撤销），不会继续读取或改写意向。用户epoch保持2，不回改epoch或复活旧会话；新游戏未插删除栅栏，不能用409掩盖会话门。原四条栅栏用例及跨作者／管理员404检查一起复验。

`topology-epoch-request-r1.log` **6组通过**（原4＋2），含原72次栅栏后续拒绝及新增12次旧会话拒绝。测试前固定9个入口／依赖摘要，运行后核同。共同Root、session判定与临时文件SQLite是真实实现；会话、元数据、小型源及epoch变更时机是显式夹具，不冒真实登录／改密、完整草稿捕获、网络并发、重登恢复或全部权限矩阵。

仅修改既有测试及文档；语法、diff、链接及主动诊断见 `topology-epoch-request-final-hashes.json`。未改产品、两束、道路规则、DDL或资源，不重复无影响画像分支、浏览器／Trial／发布／规则长链。A29仍部分，完整目标未完成。

### 2.30 自己的游戏删除请求追踪（DELETION-TRACKING-UI-1）

`management.txt`新增独立`installGameDeletion`，仍使用原公共模块路由；客户端新增“刪除追蹤”视图，旧自己的游戏列表不再直接发临时键删除POST。该批视图只列当前账户自己的自建游戏；后继管理员跨作者确认入口见§2.31，不开放草稿／私有资产读取。须未上架、输入准确原名称，POST前写入并读回sessionStorage原主体／公开版本／游戏／键／修订／确认名称，保持原请求body，不改用最新修订。存储失败、损坏关联、换账户或旧账户版本均不能偷偷另键重送。

刷新只恢复关联，不自动GET或POST；可在游戏已进入栅栏、已不在正常列表时，单独查询原永久回执及§2.29状态。只有未知本地提交且原回执GET明确404 `DELETE_OPERATION_NOT_FOUND`，才允许用户确认后重试原键／原body；已知提交后，分发查询404／503不授重试。精确校验fenced结果、原修订加一、事件种类／身份／代次／时间，拒绝错关联及迟到查询覆盖。确认栅栏分发后仍保留追踪，不显示“物理删除完成”；停止本机追踪不取消在途请求、不撤销栅栏、不删永久回执。beforeunload只触发浏览器标准提示，不嵌套confirm。

证据`.dragon-analysis/release-readiness/deletion-ui-r1/`十一显式入口全部通过：新UI模型42组、原管理46、删除关联Node／workerd24及持久重建、实际综合浏览器11组／六代、原浏览器10组／五代、作者39及受控浏览器9、Node HTTP两模式各12和workerd严格50表。新增浏览器模式`--node-service --management-ui --deletion-ui`使用实际作者密码会话、共同业务／文件SQLite／20章编译／默认publisher／自有workerd R2与reader；真实删除提交后丢失一次响应，刷新不重送或自动查询，原键GET恢复pending，排空后显示与实际R2根时间相等的历史确认。两张删除面板截图已检查；原20章SHA、更新／下架旧票、删除栅栏410及数据库重开断言保持。整个模式含两次发布、三次管理操作、一次删除POST，三次受控丢响应，无额外错误或对外请求。

运输仍为Playwright进程内桥，不冒真实TCP／TLS／云；完整副本为测试准备，两版仍是同一已保存草稿。界面明确告知历史内容／专属资源／备份清理未就绪，测试还核旧R2对象存在：本批不是用户要求的完整物理删除成果。该批没有后端业务／schema／引擎／Trial变更；管理员跨作者删除界面后继见§2.31，完整清理、玩家入口与存档、静态保留和生产部署仍须闭合。测试说明字符串曾出现未转义引号的语法诊断，运行前修正，未将失败写成通过。未commit/push/deploy。

### 2.31 管理员跨作者删除确认（ADMIN-DELETION-UI-1）

复用Q46已批准的管理员跨作者删除权限及§2.30原键追踪，不新增删除范围或修改／发布他人内容的权限。管理员可明确读取既有全局管理摘要；点击未上架目标后，新增认证`GET /api/admin/games/:gameId/deletion-preview`只返回`gameId`、`rowRevision`、`confirmationName`三个确认字段。名称仅用于既有准确名称确认，不能用可能滞后的公开名称代替。服务端重新检查当前管理员／改密状态、内置保护、目标存在、未上架、无栅栏及有效ID；拒绝额外query。此观察不写游戏／分发记录，不分配请求键、不读快照或私有对象，且不授予后续POST权限；实际POST仍独立检查当前权限、原修订与准确名称。

删除面板保留自己的列表，另为管理员显示明确的全局读取按钮。摘要显示目标ID、创作者和行修订；预览必须匹配用户所选ID及原修订，变化时要求重新读取，而非静默替换修订。只在有效预览、名称确认及sessionStorage写入／读回成功后发原删除POST。迟到预览、换账户、损坏或失败响应、另一请求已开始时均不建立新关联。作者不能调用管理员预览；管理员获得这三个最小管理确认字段后，仍不能读取他人草稿／私有资产。之后沿用原永久请求与分发查询，确认只代表栅栏的历史分发，不代表物理清理完成。

最终证据`.dragon-analysis/release-readiness/admin-deletion-ui-r2/`十五显式入口全部通过：删除UI52组（原42保留）、管理46、共享删除模型Node／workerd31组及持久重建（原24保留）、实际冻结Root37组／八代、旧Root28、Node HTTP两模式各12、严格50表与16组行校验、作者UI39及受控浏览器9。实际浏览器三模式分别核跨作者管理员删除、作者自己删除及原无删除UI链；管理员与作者模式各11组／六代，原模式10组／五代。管理员链使用独立实际密码登录、共同Node service／文件SQLite／20章编译／默认publisher／自有workerd R2与reader：预览后跨作者POST真实提交再丢响应，刷新不重送或自动查询，原键查回pending，排空后确认实际R2根时间。断言SQL栅栏actor为管理员而非owner；管理员读取他人草稿仍404且无私有桶读取。删除pending／confirmed截图已检查，旧R2对象仍存在的反证断言保留。

r1在Node包装器仍断言旧24组处停止，实际共享用例已执行31组；只同步包装计数，未删除或放宽断言，r2完整重跑十五入口。浏览器仍采用进程内运输桥，不冒实际TCP／TLS／云；完整副本为测试准备、两版仍为同一已保存草稿。未改DDL、游戏引擎、Trial束或reader；没有物理R2／历史payload／在途写／备份清理能力，尚不能称完整删除或发布条件齐备。Jev此前地区HTTP451仍不可用，不绕过、不以辅助意见代替实际验证。未commit/push/deploy。

### 2.32 玩家固定准入取数客户端（PLAYER-CLIENT-1）

新增浏览器兼容、尚未挂载到游戏入口的`reader/playerclient.js`。`createPlayerReader`只接受明确规范HTTPS origin与受信fetch端口，提供当前版本／章节准入与状态观察；准入结果产生固定session。签名票据只在闭包内存中用于Authorization，不返回给调用方、不进入URL、存档、sessionStorage或其它持久介质；没有自动重新准入、版本热换、资源缓存或TTL。公开identity及章节数组冻结，更新或下架观察不会修改原identity。`close`退休句柄，迟到取数不得交付；已确认删除也退休句柄。这里不承诺JavaScript内存的物理擦除或即时中止所有自定义fetch。

文件只接受manifest、本次准入章节、固定资源角色／画像ID形状；具体角色存在性仍由reader的签名运行索引决定。固定同origin端点、GET、credentials omit、no-store、redirect error、no-referrer；不将作者给出的URL当取数地址。manifest最多2MiB，其它资源最多25MiB，错误正文最多4KiB，流式累计预算及显式总deadline覆盖响应与正文；超限／超时取消自有流，迟到fetch返回也取消。逐资源校验MIME与SHA，manifest另绑定准入manifestDigest；不把这些运输检查冒充独立完整依赖／引擎兼容证书。

只有相同读取端的明确410／GAME_DELETED（若有gameId还须匹配）触发deleted；404、网络错误、503、下架、损坏错误体或其它410不触发删除，也不重发准入。状态更新可供后续界面提示，但本组件不控制时钟、不删除存档、不负责回标题。该批尚无角色URL／ObjectURL适配；后继运行包装配见§2.34，目录／公告UI和正式存档仍未接线，旧`playapp`仍不能据此使用R2正式游戏。

证据`.dragon-analysis/release-readiness/player-client-r1/`五个明确入口全过：客户端42组受控fetch／ReadableStream负控，实际自有workerd/R2与客户端7组，原reader66、公告隔离107、runtime contract66。新实际链核有命名空间的章节ID只编码一次、两个不同内容版本的旧票固定读取、下架续取、新准入拒绝、缺文件503后恢复、不自动重发准入、明确删除410及旧对象仍存在。该批实际链客户端运行于Node而非浏览器，数据为opaque运输夹具；后继真实浏览器取数见§2.33，仍不冒同引擎可玩、真实TLS／云、存档或物理清理。所有已有产品输入保持原字节；未修改web/src或Trial束，未commit/push/deploy。

### 2.33 浏览器客户端与实际编译资源（PLAYER-CLIENT-BROWSER-1）

现有隔离发布链新增`--player-client`：测试专用静态路由供实际playerclient及runtimecontract模块，客户端在全新Chromium中使用原生fetch，API仍进入真实共同Node service／文件SQLite／编译器／默认publisher／自有workerd R2与reader，不使用API响应夹具。浏览器逐一准入20章并将客户端读出的章节SHA与实际SQL编译正文对拍，核manifest准入摘要与全部152个索引asset角色（不等于全部621画像库或静态依赖闭包）。显式放入测试cookie后确认客户端请求不带cookie；玩家页面local/sessionStorage访问及IndexedDB.open均设拒绝守卫。

新增六组链内检查：真实旧章节对象暂缺时503、句柄保持active，恢复相同自有字节后原句柄继续读取；更新后旧身份／旧资源固定，新准入只接受当前版本；下架拒新准入但旧句柄续取；明确删除410退休句柄，第二次读在本地拒绝而无额外取数／重新准入。原发布、管理员上架／下架／解除限制／跨作者删除、三次真实提交后丢响应及六代确认继续通过。测试只在自有桶做暂缺故障与原字节恢复，不授生产回滚；删除后旧索引仍存在的反证断言保留。

浏览器首次接线发现客户端无条件在finally中abort已读完响应；已改为完整EOF只释放reader锁，只有未完成请求取消，补单元负例先复现再修。**这不是下面全部CDP事件的根因证明**：r1和修正后的r2都在严格requestfailed断言失败；独立自有本机HTTP与route.fulfill探针中，不调用abort的裸流读取也会在完整EOF后出现`net::ERR_ABORTED`（Chromium153）。具体浏览器内部原因未知，不凭事件名称认定网络数据丢失或完全无错误。

最终测试为每个客户端原生请求附测试专用关联号，只观察原生流而不替换字节／响应。这类CDP事件须逐项满足唯一实际请求／响应、固定读取端及端点、完整EOF、从未cancel、状态与实际响应全部字节数匹配，才单独记录为completedStreamFailures；缺失、未完成、取消、错origin／路径／状态／长度、重复关联或其它错误仍失败。18组独立观察器正负控锁住该边界，console/pageerror及原模式请求失败检查保留。不能把结果写成“浏览器没有requestfailed”。r3七入口通过后提取并加强观察断言／补负控，r4八入口从头复验；前两轮和两种独立探针现场保留。

最终证据`.dragon-analysis/release-readiness/player-client-browser-r4/`八入口全部通过：观察器18、增强浏览器原11＋新6组、原浏览器10、客户端43（原42保留）、实际workerd客户端7、reader66、公告107、contract66。两个浏览器模块与13个编辑器公共输入均显式固定SHA。只有客户端收尾三处产品改动，未改服务器、reader协议、schema、web/src或Trial束。模块仍仅在测试入口挂载，正式游戏入口／角色URL与资源包装配／存档／公告UI、静态旧局资源保留及物理清理没有因此完成；浏览器业务运输仍是进程内桥而非生产TCP／TLS／云。未commit/push/deploy。

### 2.34 固定运行包与自有资源URL（PLAYER-PACK-1）

新增尚未挂到游戏入口的`reader/playerpack.js`：从已准入session读取manifest、所选章节及全部声明角色，不重新准入或按latest寻找资源。校验准确正式身份／章序、明确传入的compilerRevision、当前studio-app-2世界与六个编译角色、画像及八个四季静态描述；逐项重核SHA／长度／MIME。manifest保留原字节意义，旧trial-asset字符串只作声明一致性检查，绝不向VPS取数；公开运行身份采用白名单，不把编译产物的trialSnapshotId当正式能力或伪造私有Trial binding。

调用方必须给出正整数总字节预算和受信、路径限定的静态读取端口。manifest最多2MiB，其它单项沿25MiB限制；读取前核声明合计，所选章读完再次核剩余预算。预算是累计输入字节，不宣称限制全部堆内存。所有字节核完后才生成自有Blob URL，任何失败回收已建URL；close幂等且不关闭调用方持有的session，撤销异常时仍尝试其余URL并保留失败项供重试。所有await前后检查session，退休／明确删除时拒绝交付迟到包；返回manifest、章节、正式身份和角色URL表冻结，不修改源章或规则状态。

这些URL不是DRM：已下载Blob不因服务器410自动消失，未来游戏入口必须在退出时调用close并使用assertCurrent守卫。测试明确证明下架保持可读、获知删除后守卫拒绝，而Blob在显式close前仍可取，close后取数失败。本组件提前固定八张四季图和所需画像／编译资产，不等于所有音频、战术、脚本等旧局依赖闭包或两端核心兼容证明，也没有App／正式存档／目录／公告接线。

最终证据`.dragon-analysis/release-readiness/player-pack-r2/`六入口全过：包装配52组、实际编译链6组、客户端43、实际workerd客户端7、reader66、contract66。实际链由隔离密码登录／共同Node service／文件SQLite完成20章发布编译与上架，默认publisher写入条件内存R2，经真实reader/client装配**一个选定章节**、152个声明asset及八张静态图，160个Blob URL；随后用未修改的同一world道路／地形加载器读取，核v2道路192节点及地形SHA。下架／删除四代及显式URL清理通过。这里的R2／服务日期是内存端口／固定测试时间，Blob取数在Node执行，不冒浏览器App或战役认证。r1六入口已通过，随后增加身份白名单、章后预算预检及五组负控，r2完整复验；旧47组保留。未改既有产品源码、web/src、Trial束、reader协议或schema，未commit/push/deploy。

### 2.35 正式运行环境与独立发布引用（PLAYER-ENVIRONMENT-1）

新增`reader/playerenvironment.js`，只接受受信`loadPlayerPack`结果及明确选择的势力，复用现有`createContentCatalog`、`createWorldResources`、`createNewGameScenario`与按世界绑定的画像覆盖，不调用Trial环境、不伪造binding或设置persistent。四个规则资源、两个小地图、八个季节角色及声明画像均接本包Blob URL；缺少角色即拒绝，不借内置世界URL或旧VPS接口填补。世界／内容修订仍是原sourceDigest，不将显示版本冒充依赖摘要；源章不改写，新局只由现有共享构造器复制。pack生命周期守卫传入世界资源及内容引用解析；包的最终close仍由调用方负责。

在该正式环境的章节reference上增加独立`publication:{releaseId,ordinal}`，内容目录解析同时核原game／chapter／source身份与这两个正式字段。这样同一已保存草稿再次发布、sourceDigest不变时，旧正式引用仍不能进入新环境；缺正式字段同样拒绝，不自动迁移旧存档。这是Web装配身份适配，**尚不是完整正式存档入口、IDB事务或版本不符清理流程**。原内容目录／world／Scenario／规则代码均未修改。

最终证据`.dragon-analysis/release-readiness/player-environment-r3/`八入口全部通过：环境37组、实际编译环境7组、原包装配52／实际编译6、客户端43／workerd7、reader66、contract66。实际隔离编译链仍发布20章、只装配其中一章和152角色＋八图；在原道路／地形校验之外，用新环境调用未修改的`prepareScenario(fresh)`得到v2／192据点的detached Scenario。现有`snapshotScenarioAssembly`→真实JSON往返→`readSavedAssembly`保留publication字段，原装配身份门拒绝缺失、错误release或ordinal；没有执行游戏帧、完整保存／恢复或实际App安装。R2仍为条件内存端口及固定测试日期，Blob加载在Node，非浏览器／云证明。

r1合成章节夹具漏写既有必填faction.n_legions，原共享新局门明确拒绝；只补测试输入，未放宽产品校验。r2八入口通过后，将元数据观察加强为现有快照及JSON读回，r3八入口完整复验。旧编译六组均保留。静态工具建议把JSON往返改成structuredClone的warning在本测试中不采纳：这里刻意验证文本序列化／读回，不能用内存克隆替代；该finding保留记录，不宣称全量clean。本批新增一个适配器及测试，不改共享引擎／Trial束／reader协议。完整App、存档、目录公告、删除退出与静态旧局闭包仍未完成，未commit/push/deploy。

### 2.36 玩家目录与公告读取（PLAYER-REGISTRY-CLIENT-1）

`createPlayerReader().registry()`复用现有受限HTTPS／GET／omit credentials／no-store／deadline／2MiB正文预算，读取当前公开目录。检查正安全整数generation、digest、正式身份、非重复gameId及章节；返回冻结白名单，不传递票据、内部字段或作者私密资料。每次调用独立读取，不缓存目录、自动轮询、重新准入或改变已有session；空目录／缺少某游戏不是删除事实。该观察不能代替随后带expected ordinal的正式准入。

公告是独立结果：保留当前上架游戏已公开的旧版本公告，不将它们变成旧版可选入口；同游戏／ordinal重复、未来版本、坏字段、缺公告列表或服务端错误标识统一输出空公告及`ANNOUNCEMENTS_UNAVAILABLE`，有效目录仍可用。隐藏游戏行不输出；公开名称和日期原值不重写。有效空列表与错误不同，结果的`announcementsError`分别为null或上述固定错误码。尚未执行界面排序、游标分页或公告弹窗；不在运输层伪造日期与最新通知。

证据`.dragon-analysis/release-readiness/player-registry-r1/`七入口全过：新模型29组、实际自有workerd/R2两种根协议中32次客户端目录比对（同时保留原107组公告／准入／旧票检查）、客户端43、workerd客户端7、reader66、原公告107、contract66。真实客户端核有效与损坏公告、有效空列表、隐藏行，以及核心投影／目录损坏仍503，不把核心错误弱化为公告失败。测试中的客户端运行于Node；原浏览器取数证据不冒本批已完成标题或通知界面。共享引擎、Trial束、reader服务端协议与权威数据库未改变；未commit/push/deploy。

### 2.37 固定准入身份与本地存档适配（PLAYER-SAVES-1）

`reader/playersaves.js#createPlayerSaveStore`把已准入正式环境绑定到既有opt-in `createGameSaveStore`，不另建IDB格式或规则恢复器。必须显式提供环境及同gameId仓储；捕获releaseId、正式ordinal、chapterId和manifestDigest，另核环境章节引用的sourceDigest与publication。本批当时v3 codec的releaseOrdinal是安全整数：从规范`1.n`的n精确转换，超过安全整数范围在任何仓储调用前拒绝，不四舍五入、不静默迁移；当时完整超大ordinal持久化仍未闭合，后继已由§2.56替代该限制。

`put(snapshot, expected)`在第一次await前严格JSON捕获完整正文及CAS期待，核已玩／固定章索引、装配身份，并复用原encodeSaveFile→JSON／RNG／规则／公共detached恢复预检后才调用既有原子写入。保存元数据来自固定准入，而非后来目录的新版；不读取最新版本来重贴标签。`get`先由既有仓储核正文与摘要／SHA，核上述完整正式身份及槽号，再走同一恢复门；同source的新release也拒绝旧档。返回的快照仍未安装live，不代替App的战斗／续段／故障禁存守卫或标题恢复流程。

`list`只是摘要，不是可加载、已识别历史正式版或删档证明；本适配器不暴露compareDelete，不把身份拒绝或坏档当删除许可。退休前已交给仓储的写入可能完成，因此其成功返回明确`committed:true`；不会在已提交后因退休谎报“原档未变”。调用方仍须阻止迟到结果安装live。退休发生在公共预检期间则拒绝发写；退休后的新读写也拒绝。没有默认global IndexedDB、迁移、清库、联网保活或Trial身份。

证据`.dragon-analysis/release-readiness/player-saves-r2/`八入口全过：新适配30组、实际编译链`--environment --saves`10组、既有仓储7组／59负控、原20章真实快照／80语义拒载、备份20章／148负控，以及环境37、运行包52、客户端43。r1八入口已过，r2新增四种存档头错身份及公共预检中退休不发写，共五组；产品实现不变，完整八入口重跑。共享源／原20章只读，所有保存均自有mock IndexedDB，外部网络拒绝；既有规则／schema／App／Trial束未改。

实际编译链仍为完整副本20章编译中**所选一章fresh 0 tick**：共同密码登录／Node业务／默认publisher／条件内存R2（固定2037服务时间）／reader准入／pack／正式环境→原snapshotState→绑定仓储→原admitSavedScenario及prepareScenario冷恢复；下架后仍按原身份覆写，明确410后新读写拒绝而本地档保留。此链不是原生浏览器IDB、实际App／中途战役或清档UI证书。完整新局／读档入口、最新版本复查、已识别旧release证明与确认compare-delete、晚提交界面归属、保存警告及超大ordinal格式仍待接；未commit/push/deploy。

### 2.37.1 共享扩展画像从实际保存到正式快照恢复

复用 `verify_player_pack_compiled.mjs --environment --saves --portrait`。新参数要求保存模式，不另建入口或绕过保存服务：自有完整副本bootstrap之后，实际作者登录Request，按已读修订1／metadata发送单portrait命令将首章槽0设为p0001，真实CAS保存为2；显式重读核20章投影只有这一portraitKey改变，旧修订1完整保持，然后由共同发布／编译／冻结／默认publisher和reader客户端完成正式准入。

旧测试仅遍历“存在覆盖”的武将，原章没有覆盖时可能零次断言；本模式明确要求且只允许一个p0001覆盖。新增画像使声明角色从152变153（非删除原生byte画像），八张静态图保持，资源URL总数161。实际取出全部153个Blob并逐项重算SHA／长度，包括p0001与固定PNG的27060B及摘要一致；正式世界将该武将解析到本包p0001 Blob，而不是内置相对路径。原生portrait byte保持源值。完整 `snapshotState` 经正式适配器／自有mock IDB保存，再实际JSON.stringify／parse全文往返、原冷恢复准入和 `prepareScenario(restore)` 后，portraitKey、原byte、世界画像URL及正式身份仍保持，RNG未消费。不是仅给测试对象临时塞覆盖或只核sidecar；该JSON往返也用于原保存模式。

初轮 `player-portrait-chain-r1.log` 已通过新增保存，随后旧夹具发布名 `Owned pack` 因10码点被现行8码点门拒绝（PUBLISH_NAME）。仅将测试名改为8码点 `Own pack`，未放宽产品。r2通过；固定16项相关输入后，`player-portrait-chain-r3.log` **14组通过**，`player-portrait-baseline.log` 原无画像参数保存模式 **10组通过**。下架续写、明确删除事件后拒新读写且自有档不删、显式Blob清理等既有检查同轮保留。此处的删除事件和临时目录清理不证明互联网物理删除闭包。

证据及诊断见 `.dragon-analysis/editor-completion/player-portrait-final-hashes.json`。这是共同Node业务／文件SQLite／自有FileBucket、条件内存R2和固定服务时间、Node Blob读取、选定一章fresh零tick与mock存档；业务经Request调用但没有真实网络／浏览器App、原生IDB、战术对白解码或中途战役证书。源／运行算法／服务／UI／两束不变；静态准备只在工具自己的临时包内执行，不重建仓库束、不部署。全621画像、所有显示消费者及A23／A28／A32完整出口仍未完成。

### 2.38 共享App保存请求归属（APP-SAVE-OWNERSHIP-1）

正式App接线审查发现既有共享`main.js.saveGame`竞态：请求排队时未绑定调用场景，IDB完成后也无归属复核。实际隔离浏览器负控先真实提交IDB，再暂扣返回、调用真正的`returnToTitle`：旧请求仍报普通local并改写当前槽状态／HUD，后续排队请求还在标题尝试快照。负控保留在`.dragon-analysis/release-readiness/app-save-ownership-before/`及其浏览器观察目录，不以代码推测代替复现。

本批只修共享保存方法：调用时捕获scenario／索引／world／content／clock／repository／入口票据及装配状态；队列执行前复核归属、持久权限和运行开关，再走原禁存守卫。只向捕获的repository发写入。已完成事务若归属或槽列表已改变，返回`{saved:'superseded',committed:true,slot}`，不覆盖当前列表／已选槽／HUD；这不是回滚或“原档未变”。拒绝或失败也不向已退出的新界面显示旧提示。未改变快照内容、规则/RNG、存储格式、Trial禁存入口或正式准入政策；正式reader环境仍未安装到App。

`.dragon-analysis/release-readiness/app-save-ownership-r2/`十个明确入口全部通过：新实际浏览器17项观察（含11种排队归属／权限／开关变化、真实IDB完成后真正回标题及旧队列拒绝）、既有repository／transition、游戏store／20章snapshot／exchange、正式存档30、实际编译链10，以及Trial policy／discard。浏览器使用全新profile、自有静态loopback，目录明确为内置夹具；不访问用户存档、DOS文件或外部服务。r1在所有保存断言完成后因开场MP3的`net::ERR_ABORTED`失败，保留现场；r2明确选择自有profile的产品“已看过开场”路径，不再测试无关流式音乐，仍严格要求本轮requestfailed为空，不把它解释成音乐问题已修复。

已重卷217项Trial源码束并核每项与当前Web字节一致，两壳不变。共享源码和静态包摘要随本批变化，历史旧摘要不是本批部署证明。尚无正式游戏下拉框／最新准入／旧档确认清理／删除退出接线，也不是完整战役或生产验证；未commit/push/deploy。

### 2.39 正式存档的App仓储接口（PLAYER-REPOSITORY-1）

`reader/playerrepository.js`显式适配§2.37正式存档端口为现有App的`load/list/get/put/add`形状，仍未安装到生产App。`load`完整读取本局身份匹配的记录，并核摘要与正文令牌相符后才整体接纳观察；其它release／ordinal／chapter／manifest的行仅保留占位及`unavailable`标记，不读其正文、不宣称是已认证旧版、不开放恢复或清理。标记必须由未来UI接线正确禁选，不能把保留占位当空槽。当前身份匹配但正文或预检失败时整次load拒绝，不猜修或静默跳过。

覆写仅用本仓储已观察的精确CAS令牌，不在冲突后自动重读、重试或覆盖其它窗口的档；只有明确重新load才更新观察。空占位创建使用null期望；add按所有已观察槽（包括不可用行）计算新槽，竞争插入则冲突而非改写或自动换槽。串行队列在入队前捕获候选JSON，成功的本仓储写入更新自身令牌；get仍核已观察令牌，list只提供本次观察的展示摘要，不冒最新或有效性证明。退休在排队／读取时拒绝；已经提交的写返回真实快照结果，仍由App负责拒绝晚到UI安装。没有隐式IDB、迁移、删除或远端版本推断，安全整数ordinal限制未改变。

证据`.dragon-analysis/release-readiness/player-repository-r1/`七个显式入口全部通过：新24组使用真实v3 CAS＋自有mock IDB、最小JSON／受信正式端口替身；实际编译链新增`--repository`（要求`--environment --saves`）13组，对同一正式准入完整快照验证load／覆写／另存、下架续写、其它观察者覆盖冲突及明确410拒绝；原无该参数10组、正式存档30及既有store／20章snapshot／exchange均保留通过。实际链仍只装配20章中的一章fresh0tick，条件内存R2与固定服务时间，不是实际App、原生浏览器存档或版本确认删档界面。

本批不改共享引擎、存储格式或Trial束；未来入口仍须接最新准入、不可用档管理、更新警告及删除确认退出。未commit/push/deploy。

### 2.40 共享App的显式正式入口（FORMAL-APP-1）

`startApp(opening, {formal})`现可显式接收固定正式环境、仓储、可选存档槽及必需的`onExit`所有者回调；与Trial互斥，坏参数在启动／存储前拒绝。不伪造私有Trial身份，不默认打开旧存档库，不进入持有旧目录的StartMenu。新局与恢复继续走同一`beginNewGame`／`beginSavedGame`、`loadState`、原生道路装配及Clock；不是另一份规则引擎。当前版本的远端准入、章节／势力选择仍由尚未完成的公开入口负责。

正式所有者守卫覆盖资产等待、场景装配、季节图迟到、保存排队与提交回执、战略RAF／输入，以及战术资产、RAF、输入、退出续段。发现终止时先作废App进入票据，再冻结并清除所属场景／续段；战术仅丢弃本局，不结算、不消费尾段RNG。私有Trial原授权门保留，复用丢弃主体而非伪造其身份。已经提交的保存仍如实返回`superseded/committed`，不安装晚到界面状态。

退出只向所有者回调一次，区分`title`、明确`GAME_DELETED`的`deleted`与其它`unavailable`。本批没有删除确认弹窗或导航：未来host必须在删除提示获确认后才回初始加载页，并关闭自有pack／session；不能把此回调当已完成产品退出流程。普通网络错误不会由App猜为删除，App本身不轮询远端。

保存窗口只列可用槽，`unavailable`保留行不再冒充“未使用”；分配新槽仍计入全部保留身份。实际浏览器以未知身份的槽10、当前槽0–3验证列表不提供10，另存真实落11且10的正文／SHA不变。此未知身份夹具不是已认证旧release或删除许可。

证据`.dragon-analysis/release-readiness/formal-app-r6/`十八显式入口全过：新浏览器15组、真实Session／RNG丢弃12组、内置App保存归属17组、正式仓储24、实际编译保存仓储链13及原存档／Trial／战术回归；另`formal-app-trial-r2/`独立通过本地编辑器新profile实际App主动／等待中Trial退出。重卷217项束，SHA为`3f9107fcc1952e0b8a1a9b3d1701c648e59ad28795efb23eccc53848d3b21b67`，两壳未变。r1／r2分别保留测试取错装配字段、undefined属性比较的失败；r5保留对同内容不同对象键序误用JSON字符串比较的失败，改核精确存储正文及SHA后完整重跑。

浏览器使用实际Web第一章／地图资源构成的受信pack接缝、真实正式环境及全新原生IDB；测试专用import map把`/web/src/`归一为`/src/`，拒绝第二份引擎URL。只核fresh／恢复／终止所有权，不是签名reader→App的联合端到端、生产静态挂载或完整战役证书。独立实际编译链不能拼成该浏览器的上游证明。公开当前游戏／公告界面、最新版本复查、旧版确认清档、更新警告、删除确认、生产模块路径／完整静态闭包仍待接；未commit/push/deploy。

### 2.41 玩家模块的统一静态路径（PLAYER-MODULE-LAYOUT-1）

五个玩家适配模块与`runtimecontract.js`的唯一实现现位于`web/src/player/`，引擎依赖使用相邻的`../core`、`../game`、`../content`路径。原`reader/`六文件仅兼容再导出；Node／workerd继续使用原接口，类、函数与常量对象仍是同一模块实例。搬移前后只改相对import地址，正文逐字节复核；没有第二份规则、存储格式或协议实现。

正式App浏览器测试移除专用import map及reader模块替身，所有产品模块由普通Web静态根提供，任何`/reader/`或`/web/src/`请求直接失败。原15组新局／恢复／原生IDB／保留槽／终止守卫全数保留。新布局测试核六组兼容导出引用相等，遍历49个字面ESM依赖均留在`web/src`；此检查不证明动态图片／音频闭包。

隔离静态打包显式包含尚未提交的六个新源文件，复验1383条清单及1382个asset；Trial束重卷为223项，原217项字节完全不变，新增恰为六个玩家模块，两壳不变。无需修改生产HTML或增加模块重写规则；这只是可由静态目录提供的模块布局，尚未把公开游戏选择入口挂到新客户端。

证据`.dragon-analysis/release-readiness/player-layout-r1/`十九显式入口全过，涵盖布局7、客户端43／目录29／pack52／环境37／存档30／仓储24、实际编译链13、正式App浏览器15、实际workerd reader／客户端／公告、静态合同／临时打包、观察器负控、增强真实本地发布浏览器及本地Trial浏览器。发布链仍经进程内运输桥，224条流完整EOF，21个严格关联的CDP `ERR_ABORTED`另记，不能称零requestfailed。该链的原静态夹具与新隔离打包是独立证据，不拼成已完成的生产核心SHA／旧局资源保留证书。

公开当前游戏／章节／势力／公告界面、签名准入到实际App的联合链、版本警告与确认清档、删除确认导航、完整静态旧局闭包及真实部署仍未完成。未commit/push/deploy。

### 2.42 实际发布准入到共享App（PUBLISHED-APP-CHAIN-1）

`verify_publication_chain_browser --player-client --player-app`新增联合验证：实际浏览器作者登录／共同Node业务／文件SQLite／20章编译／预上传／默认publisher／自有workerd R2与reader，接真实`createPlayerReader`签名准入、`loadPlayerPack`、正式环境／仓储及共享App。不是把分别通过的客户端和受信pack测试拼成端到端；本次App的章节、manifest及152个索引asset确实来自该发布的reader，另八幅季节图来自同次校验的隔离静态包。

玩家使用独立新浏览器context，只允许自有原生IDB库。所选第一章实际新局、保存、回标题所有者、另一页面重新按当时当前1.0准入并恢复同一存档；核装配元数据、正式身份及存储摘要。随后实际发布1.1、下架，旧App仍保持1.0身份并成功保存；临时缺R2章返回503，不退休已装配App；实际删除栅栏确认后的reader 410由App RAF发现，调用删除退出host一次、拒绝后续保存并保留本地档。

此host仅是测试启动／退出适配，不是公开选择界面或删除确认导航。产品模块和资源从同一临时部署包按普通路径读取，每次核清单SHA／长度，未使用import map或第二套引擎URL；包显式纳入六个玩家模块，共1382个asset。旧模式保留原静态输入，不能把其1376项清单冒充此包。共享引擎、协议、保存实现和223项Trial束本批未改。

证据`.dragon-analysis/release-readiness/published-app-r2/`七显式入口全部通过：联合发布浏览器原11组＋客户端6组＋App6组／六代根确认；原无App增强发布浏览器、实际编译保存仓储13组、正式App浏览器15组、流观察负控18组、隔离静态打包及模块布局7组。联合链538条完整EOF流，50个严格关联的CDP `ERR_ABORTED`单列，未放宽失败请求判断；原无App模式224条流／20个关联事件。r1联合链也通过，r2增加回归并修正报告范围文字，不是修产品错误。

仍只覆盖完整副本20章中的所选一章新局／冷恢复与版本生命周期，不证明完整战役。浏览器API仍经进程内运输桥，静态文件端口是受信测试端口；公开当前游戏／章节／势力／公告、更新警告、认证旧版后的确认清档、删除确认导航、旧局全部延迟资源保留、真实HTTP／TLS及部署仍未完成。未commit/push/deploy。

### 2.43 目录与公告视图组件（PLAYER-CATALOG-VIEW-1）

`web/src/player/playercatalog.js#mountPlayerCatalog`接受显式DOM根及既有已校验reader，提供内置默认项、当前正式游戏名称／版本下拉框、最新公告行、重试和只读历史弹窗。所有作者文字用textContent，不执行HTML；历史完整保留reader的服务端次序，展示发布日期与首次上线日期，可滚动，不截为前五条。点击公告不准入，右键只退弹窗、保留选择；没有关闭按钮或三秒倒计时。

刷新立即撤下旧自建选项，内置仍可选；有效目录与公告故障分别显示，目录失败不推断下架／删除／版本不符。并发刷新只安装最后一次结果，退出组件后的迟到结果不重建界面。弹窗期间`selection()`返回null，调用宿主必须据此拦截底层新局／读档动作；选择结果只是目录观察，不是准入能力或最新版本的永久证明。模块不打开存储、不调用admit、不导航。**尚未挂到首页／StartMenu，也未替换其旧API或实现新局／读档host**。

证据`.dragon-analysis/release-readiness/player-catalog-r1/`七显式入口全部通过：新隔离浏览器17组（真实DOM＋真实reader，受控目录响应，40条历史、滚轮、右键、超三秒不关闭、XSS文字、故障隔离及迟到顺序，IDB零调用），客户端43、目录29、真实workerd公告107＋32客户端比对、隔离静态打包、实际发布到App联合链及模块布局7组。首次独立浏览器运行因测试HTML未声明UTF-8而误解码固定中文断言，已保留失败现场并修测试页；后续完整批通过。

静态打包及联合链明确加入第七个玩家模块，共1383个asset，使用同一清单与源码树摘要；联合链仍是测试host，不能据此称公告组件已进入游戏标题。联合链538条完整EOF流、72个严格关联CDP事件单列，不冒零requestfailed。Trial束新增此文件为224项，原223项字节不变，两壳未改；共享App／规则／存档实现未改。公开入口、版本警告／清档确认、删除确认导航及生产部署仍待完成，未commit/push/deploy。

### 2.44 对局版本提示与确认退出宿主（PLAYER-SESSION-HOST-1）

`web/src/player/playersessionhost.js#createPlayerSessionHost`绑定同一正式session／pack身份、DOM根与显式导航端口。`checkStatus`只发单飞只读状态请求，以精确整数比较正式序号；确知新版后持续显示旧版保存警告，不换环境、重签票或改存档身份。下架仍可继续，网络／格式错误不变成删除，也不抹去已有警告；退出后的迟到结果不重建界面。没有计时器、规则时钟、存储或TTL逻辑，生产入口仍须接状态检查触发点（包括保存界面）及导航端口。

`onExit`供共享App完成退休后调用，先停止session／释放pack所属资源；只有reader实际terminal deleted状态才显示“遊戲已刪除”，单凭错误字符串或调用方reason不够。删除／未知故障均保留确认框，不自动消失，右键无效；确认前不调用导航端口。重复退出共用一次完成，释放／导航失败保留确认以重试，并发确认不重入；普通主动回标题直接调用所属导航端口。所有路径保留本地档案。此模块不代替App输入／RAF／战术退休守卫，也不提供已识别旧版清档授权。

证据`.dragon-analysis/release-readiness/player-session-host-r2/`十显式入口全部通过：新宿主浏览器16组（受控session／资源端口，含一次真实自有页面导航、零IDB），实际发布到App联合链与原无App链、正式App浏览器15、目录视图17、客户端43／目录29、隔离静态包、模块布局及流观察器36。联合链现在使用**真实宿主组件**：实际更新／下架后警告持续、真实旧身份保存，reader明确410后App RAF先退休，右键不导航、左键确认后才调用记录导航端口；实际目录选择和生产页面导航仍未接。联合链540条完整EOF流／64个严格关联CDP事件，原链224／27；不是零requestfailed或云／全战役证明。

r1回归中目录测试只记录了失败URL，不能据此判断中止原因，原失败保留。后继仅增强测试观测：每次registry请求以CORS安全Accept字段携带唯一序号，核原生流完整EOF、未取消、准确正整数字节数、状态／路径／origin／唯一响应；任何不符仍失败。观察器只增registry这一明确路径，并将原负控完整应用于file和registry两路径，共36组。r2目录12条完整流中有1个严格关联`ERR_ABORTED`事件单列，不宣称浏览器内部原因已解决，也不反向认证r1事件。

隔离静态包与联合链共同包含八个显式玩家模块／1384个asset；Trial束225项，原224项字节保持，两壳不变。共享App、规则、存档实现及reader协议未改。公开首页／选章／势力／读取入口、保存前检查挂钩、历史正式身份确认清档、完整静态保留及生产部署仍未完成；未commit/push/deploy。

### 2.45 正式App保存时状态复查（FORMAL-SAVE-STATUS-1）

共享`startApp`正式选项新增可选受信`checkStatus`函数，坏类型在启动／存储前拒绝；内置与私有Trial不配置。实际保存窗口打开时发起非阻塞复查，保存队列在原禁存守卫通过后、快照／IDB之前再次等待复查。正式宿主仍负责单飞请求和持续版本警告；App不把返回DTO或抛出的错误文字当删除凭据，只复核原环境的终止状态。网络／格式错误不改变时钟、准入、存档身份或既有警告，不禁止已准入旧局按守卫保存。

新增await后重新核对请求所属scenario／world／clock／入口／仓储、运行开关及完整禁存守卫；期间退出、暂停或进入不可保存状态不得继续生成快照／写库。已发出并实际提交的旧写仍遵循§2.38真实提交回执，不冒撤销。没有定时轮询、资源失败自动复查或新存储格式；生产入口仍须将真实宿主`checkStatus`和导航端口传入，不能把这一显式接缝当公开首页已挂载。

证据`.dragon-analysis/release-readiness/formal-status-r1/`二十四个显式入口全部通过：正式App浏览器增至20组（原15组保留，另核保存窗口只查状态／不写库不动RNG、原禁存不查询、等待期间战斗故障／暂停再守卫、伪410错误仍可保存、状态晚返／排队退出不发写）；真实发布到App联合链、原无App链、宿主16组、内置保存归属17组、正式仓储24组、实际编译保存13组及原repository／transition／store／snapshot／exchange／正式保存、Trial／战术回归、实际本地Trial浏览器、隔离包与布局。原生浏览器／mock IDB均为自有隔离实例，不触碰用户档案、真实DOS存档或云。

联合链不再由测试直接调用宿主状态检查：实际保存窗口先发现1.1并显示警告，旧1.0正文尚未写动；真实保存路径复查后仍写1.0，实际下架也可继续保存；实际reader 410由保存前复查发现，在任何IDB访问前退休，原档不变，右键无效、左键确认后才调用记录导航端口。该链542条完整EOF流／52个严格关联CDP事件，原链224／25；不宣称零requestfailed或浏览器内部原因已解决。

本批产品只改`main.js`及`ui/gamebar.js`的上述接缝；规则、身份codec、reader与宿主实现不改。225项Trial束仅这两项字节更新，两壳不变；同一隔离静态包供publisher／App，仍为1384个asset。LSP的GameBar超5000行未获检查确认，另有push-only未确认；现有提示不当错误，也不宣称工作区全净。公开选择／读档／历史正式身份确认清档、实际导航、完整静态保留和部署仍未完成；未commit/push/deploy。

### 2.46 同源玩家站点路由（PLAYER-SITE-1）

新增[站点入口](../reader/site.js)复用原只读reader，不导入编辑器／发布服务。根[Wrangler配置](../wrangler.jsonc)保留项目名、兼容日期、构建命令、静态目录和404策略；新增`ASSETS`、私有`PUBLISH_BUCKET`→`dragon`绑定及仅`/play-api`、`/play-api/*`的Worker-first路由，其余仍按Static Assets默认asset-first处理。保留前缀下的未知路径／方法由reader拒绝，不能落到同名静态文件或HTML重定向；非API缺页由原Assets绑定处理。依据[Cloudflare Worker与静态资源路由合同](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)配置，未引入SPA兜底、编辑器写API或公网桶。

配置只写非秘密`PLAYER_ORIGIN=https://dragon.720108.xyz`与active key ID `primary`，不改玩家origin或本地存储。**没有配置生产`PLAYER_ADMISSION_KEYS`或实施云变更**；密钥、当前公开根／authority和实际绑定须在整体验证具备后受控核验／配置，不能把本地配置视为云上已可准入。非此audience（例如workers.dev别名）不因此获得签发权限；静态内置页面仍独立于准入密钥／R2目录成功。旧key保留及轮换仍遵循§2.2，测试固定key不进入部署配置。

证据`.dragon-analysis/release-readiness/player-site-r1/`八显式入口全部通过：新18组、原reader66、实际workerd客户端7、公告107＋32客户端对拍、实际发布到App／原无App两种浏览器链、隔离打包器及runtime合同。新测试使用真实本地Miniflare Static Assets router／worker／R2与最小自有静态文件／opaque运行包：核GET／HEAD／404、近似但非API前缀、同名API静态遮蔽与重定向拦截、空目录503、不配置密钥拒准入但静态可读、配置后签发、更新／下架旧票续取、缺资源503不冒删除及410；外网为零，没有读取生产凭据或用户profile。

两种实际发布浏览器链的API已改经`reader/site.js`，原11＋6断言及App六组保持。App链542完整EOF流／76个严格关联CDP事件，原链224／25，均单列而非宣称零requestfailed。该链静态字节仍由测试桥提供；真实Assets路由另由上述最小夹具验证，不能拼称实际Cloudflare／完整生产静态包路由已认证。全部Web源、225项Trial束、两壳及规则／存档／reader协议保持上批字节；公开首页选择／启动、真实生产打包部署及密钥配置仍待完成。未commit/push/deploy。

### 2.47 浏览器静态图字节端口（PLAYER-STATIC-1）

新增`web/src/player/playerstatic.js#createPlayerStaticReader`，仅接受显式受信HTTPS origin、固定`content/builtin/compiled/map-2-<digest>/`下八种季节PNG路径及显式1..25MiB字节上限。路径不从manifest的远程URL取值，不接受绝对URL、查询／片段、穿越或任意静态文件。GET使用omit credentials、no-store、no-referrer及redirect error；核回应URL／MIME、声明长度上限及实际逐块预算，完整EOF后计算SHA。Fetch解码后的正文才是清单字节；有Content-Encoding时不把线长误作解码后长度。此处不解码PNG，也不凭响应自报摘要认证内容，最终SHA／长度仍由原`loadPlayerPack`对固定准入manifest核验。

绝对deadline覆盖取响应、流和哈希；未完成请求中止／取消，超时后迟到正文取消，完整EOF不再主动abort。非本端口产生的错误统一映射为静态取数失败，即使受信fetch端口抛出带`GAME_DELETED`的错误也不转为删除事实；HTTP410同样只是静态失败。没有storage、票据、重新准入或备用最新版路径，也未增加旧静态资源归档／JS音频字体闭包。

`tools/fixtures/published-app-boot.mjs`已将临时arrayBuffer静态函数换成该产品端口；测试仍提供自有静态包HTTP字节桥和启动／导航端口，并非生产首页已接通。真实新局及native IDB冷恢复各取八图，全部经产品端口和原包清单核验；发布者／App使用同一隔离静态包。两份静态输入夹具仅显式加入第九个玩家模块，默认无App模式输入不变。Trial束226项，原225项字节及两壳保持，只有新增模块；现有App／规则／保存／reader代码未改。

证据`.dragon-analysis/release-readiness/player-static-r2/`十入口全部通过：新端口47组（Fetch／流／hash接缝，编码头用已解码字节夹具，不冒原生gzip解码测试）、pack52、实际编译链13、两种实际发布浏览器链、正式App浏览器20、真实静态包、模块布局7、观察负控36、实际本地Trial浏览器。r1十入口也通过；复查后隔离外部typed error并增加一组负控，r2完整重跑。App链原11＋6＋6组／六根保持，542完整EOF流及56个严格关联CDP事件；无App链224／15，不宣称零requestfailed，也未放宽观察分类器。所有保存仅自有profile／mock；无真实DOS SAVE／用户档／生产桶／共享dist或云操作。

当前隔离包1498输入、1386清单文件／1385资产，digest `6fb925459fed639a7fdb206b022e5b91a3d430350cdcd533de8241bd0f2819a5`，sourceTree `23baa7f42e03d00ed00ed86eec7e9b71990c2e20c07b3e75f09f26a2a9043437`。不据此认证实际TLS／Cloudflare压缩响应、核心兼容、旧局全部延迟资产保留或公开启动界面；未commit/push/deploy。

### 2.48 正式App启动失败的所有权清理（FORMAL-START-FAILURE-1）

共享`startApp`在正式入口已安装后若仓储预检、资源装配或后续启动步骤抛错，现在通过既有`returnToTitle`废除进入票据、清理部分场景／时钟／续段及战术表现，并交回原宿主。只处理仍属于本次启动且未退休的正式入口；参数拒绝、重复启动、内置／Trial失败路径不因此退休其它所有者。原始异常仍向调用方抛出，不等待宿主的确认／导航Promise，也不把失败当启动成功。宿主退出本身失败另报诊断，不掩盖原始异常。

普通资源或仓储异常中的`GAME_DELETED`字样不是删除证明；清理前只向固定环境的`assertCurrent`核验所有权，未证删除时交付`unavailable`。非Error拒绝（含null）仍按失败清理，原拒绝值保留。没有清档、身份重贴、自动重试、重新准入或规则修改；完整公开bootstrap及实际页面导航仍待接。

补丁前负控使用原main准确字节：仓储拒绝已到调用方，但正式入口仍未退休且宿主回调为零，现场见`.dragon-analysis/release-readiness/formal-start-negative.log`及生成的负控脚本。当前`.dragon-analysis/release-readiness/formal-start-failure-r4/`二十四显式入口全部通过；正式App浏览器保留原20组，新增仓储拒绝／null／伪删除码／缺失槽／季节异步失败五组。最后一组先证明场景、时钟及未完成装配均已安装，再核清理；五组均核退出只一次、不能重新启用／保存、自有本地档摘要不变。r1测试误以为预检前已创建BattleView而失败，修正该测试期待后r2／r3通过；复查增加伪删除码负控后r4完整重跑，失败现场保留。

同批还覆盖真实发布到App与原无App链、原生内置保存归属、正式及原仓储／快照／备份、编译链、Trial／战术守卫、本地Trial浏览器及隔离静态打包。启动失败注入使用受信当前Web完整副本和记录退出端口，不冒真实reader故障到生产确认导航的联合证书。重卷226项Trial束仅main改变，原225项与两壳保持；未commit/push/deploy。

### 2.49 当前发布版章节预览与选择后准入（PLAYER-CHAPTERS-1）

`web/src/player/playerchapters.js`新增显式`loadPlayerChapters`／`admitPlayerChapter`。预览捕获当前目录身份与有序章节列表，逐章通过现有reader签名准入读取真实章节JSON，核字节预算、SHA及名称／起始日期展示字段；各章的release、source、章节顺序和manifestDigest必须一致。每个临时票据在成功或失败时关闭，返回仅含冻结的章节展示行与固定选择身份，不保留模板正文、运行票据或默认玩家势力。日期只作展示，不能据此宣称规则初态或整章可玩。

整批预览完成后再次核当前上架／发布身份；中途更新、下架、坏数据或任一失败不返回拼接的部分目录。调用方可用`assertCurrent`废除迟到请求；取消期间取得的临时票据也关闭。选定章节后必须再次调用准入端口，核预览的完整身份及manifest摘要，不能把预览票据复用于开局。准入之后仍按既有固定会话合同允许更新／下架续取，最终pack和共享引擎预检不被展示校验替代。没有存储、清档、规则修改、自动轮询或历史版选择。

`.dragon-analysis/release-readiness/player-chapters-r2/`十个显式入口通过：新端口42组；真实编译链加`--chapters`为16组，逐项与共同SQL中20章名称／日期核对，并验证下架拒新准入而已准入pack保持；原13组模式、client／registry／pack、静态包、模块布局、本地Trial及实际发布到App浏览器链同时复验。后者在新局及冷恢复前均由真实浏览器读取全部20章预览，再新签所选章；仍为测试启动与记录导航端口，没有生产选章／势力界面。626条完整EOF流中46个CDP中止事件逐条严格关联，未忽略未完成请求，也不称零requestfailed。r1十入口已过，增加真实浏览器接线后r2完整重跑。

隔离包1499输入、1387清单文件／1386资产，digest `de847cab156953f2dbb2f1ccdabc9ad4205f491de8423c03d43c277399b3671f`，sourceTree `3629c2aabcb137b476e18cd1cbf45eca456e04c7a72a79ef339feb2c3c1113e8`；发布者与测试App使用同包。227项Trial束只增加本模块，原226项及两壳字节保持。公开bootstrap／目录挂载／选章与势力操作／实际导航、版本清档和旧局完整静态闭包仍待完成；未commit/push/deploy。

### 2.50 正式新局章节／势力选择视图（PLAYER-NEW-GAME-VIEW-1）

`web/src/player/playernewgame.js#mountPlayerNewGame`新增独立新局界面：固定目录观察，经§2.49完整预览后显示真实章节名称／日期；只有点击章节才重新准入并加载§2.34固定运行包，只有再次明确选择势力才把session／pack交给调用方。势力使用章节声明的实际`idx`，不使用过滤后的行号，也不默认首势力；沿现有标题显示非空君主名，不补势力或改初始化。名称均为文本，不执行作者HTML。右键从势力／载入阶段回章节并释放本次资源，从章节退出返回null；迟到请求不能重开界面或交付旧结果。重试仍使用原目录观察，版本变化必须返回重新选择。没有存档操作、规则执行、自动倒计时或关闭按钮。

实际发布到App浏览器链的新局测试现由原生点击20章列表中的指定章、再点击势力按钮完成，不再由测试启动器直接指定首势力；随后仍使用共享环境／App／原生IDB，原保存、冷恢复、更新下架、删除确认断言保留。恢复流程仍是既有测试宿主，导航仍是记录端口；公开boot、标题目录／公告组合、正式恢复／不可用档管理和实际导航尚未挂载，不能据本视图宣称完整玩家入口完成。

`.dragon-analysis/release-readiness/player-newgame-r4/`九入口通过：新隔离浏览器20组（槽3／7、字面HTML、键盘循环、取消与迟到准入／静态资源、重新选择、无有效／重复／非法势力槽、终止拒交付、Blob清理及IDB零调用）；章节42、pack52、正式App25、实际发布链两模式、本地Trial、静态包及布局回归。独立视图的字节夹具不冒可玩规则，实际发布联合链另用真实20章编译包。r1清单在测试前拒绝未登记的测试模块URL；登记准确映射后r2前七入口通过，但本地Trial第一次fetch因`bad port`失败（未记录具体分配端口），保留现场；r3及最终样式修正后的r4均完整通过，没有改服务器或放宽网络守卫。

228项Trial束只增加新视图，原227项和两壳保持。隔离包1500输入、1388清单文件／1387资产，digest `f5c9917bb9c138d28db533eb8669cf166ca7092f3e774a6566c059bd643cc366`，sourceTree `8be8dfc292712bcded9539636a419facb355f1404e7d3491dc9e728c6a4fb310`；实际发布者与测试App同包。不是完整战役、生产部署或旧局全部静态资源保留证书；未commit/push/deploy。

### 2.51 正式读档捕获与首次安装（PLAYER-RESTORE-CAPTURE-1）

`web/src/player/playerrepository.js#capturePlayerSaveRepository`接受显式正式存档端口与本次所选档的完整CAS令牌。在返回前复用原仓储整批观察和正式`get`的JSON／detached恢复预检，所选槽必须存在、可玩且令牌逐字段一致；同正文但不同writeRevision也拒绝。捕获前发生替换、缺失、错章节或坏档，只拒绝，不重试换档、不推断旧正式版、不删除。

成功后返回仅供一次App启动使用的仓储：首次`load`只交付已捕获快照的独立副本，不再读取磁盘；第二次明确拒绝，不能借重新load悄悄换成本地新档。捕获后另一个窗口替换该槽，不改变此次恢复内容；后续`get`及覆盖仍使用原观察令牌，必须检测冲突，不能覆盖后来保存的新内容。其它保存／新增接口保持既有观察与串行CAS行为；退休守卫仍适用。原`createPlayerSaveRepository`的显式刷新行为不变，存储格式和规则没有修改。

实际发布到App测试的恢复支路已接此端口，并从所选真实档读取玩家势力，不再用章节首势力代替。启动／选档及导航仍属测试宿主，尚未完成生产读档列表、已识别旧正式版证明或确认清理界面。

`.dragon-analysis/release-readiness/player-restore-capture-r1/`十一个显式入口通过：仓储35组（原24组保留）、正式App浏览器27组（原25组保留，新增真实IDB在捕获后替换槽、App恢复原快照且覆盖冲突保留新档），另实际发布App联合链、编译16组、正式存档／store／20章snapshot／exchange、静态包、本地Trial和模块布局。联合链626条完整EOF流中的49个CDP中止事件严格逐条关联，不冒零requestfailed。独立仓储测试为最小JSON及受信端口接缝，不代替真实恢复证据。

228项Trial束仅仓储模块变化，其余227项及两壳字节保持。隔离静态包仍为1500输入／1388清单文件／1387资产，digest `9aea6d00ef8a1014b6a76ae28b519c778cf17a8a3e4a94d0a8168d3e71924730`，sourceTree `2c38298281407390588f1440f7fdffd95407ae702200068676306f28020c77ef`；实际发布者与测试App同包。公开bootstrap／恢复选择／实际导航及旧局完整静态闭包仍待完成；未commit/push/deploy。

### 2.52 正式存档选择视图（PLAYER-RESTORE-VIEW-1）

`web/src/player/playerrestore.js#mountPlayerRestore`使用显式当前目录观察、reader、同gameId仓储和运行包策略，先预览并核对当前上架版，再读取本地摘要。其它release／ordinal／chapter／manifest行只作不可用占位，不读正文、不推断已识别旧发布版。匹配行先经实际固定包、正式环境和原JSON／detached恢复门；只有核验成功才生成可点击按钮。检查失败的同章整组保持不可用，与仓储整批load守卫一致，不静默修复坏档。不可用行没有hover选择、hit-test恢复或click动作；独立说明页只说明保留，不提供删除权限。

点击有效槽才再次向服务器准入所选当前版，并以列表核验所得完整令牌调用§2.51捕获仓储。列表后槽被替换（包括相同正文的新计数）则拒绝，不能换档恢复；捕获完成后交付固定session／pack／environment／savedSlot和单次load仓储，由调用者接共享App。界面关闭不销毁已移交资源；未移交时右键／重试关闭旧句柄，epoch阻止迟到准入、资源或本地读取结果重开窗口。重试不会自动切换新版；取消不载入、不删除。没有App安装、导航、存档写入或原规则改动。

`.dragon-analysis/release-readiness/player-restore-view-r3/`十二显式入口全部通过。新独立浏览器17组使用完整Web快照与自有原生IDB、受控reader端口，覆盖七种构造拒绝、文字转义、未知身份不读正文／不可用行hover与click无效、说明返回、空目录、坏档整组禁选、静态故障重查、列表后替换拒绝、预览／最终准入／本地捕获等待期间取消、当前版本冲突、键盘焦点、非首行槽4和移交后单次load；原档摘要保持。其余入口为仓储35、正式App27、实际发布App链、编译16、正式存档／store／20章snapshot／exchange、隔离静态包、本地Trial及模块布局。r1同十二入口已通过，后仅补测试字段声明／移除未用参数，r2完整重跑；再补非首行选择覆盖后r3全轮通过。

实际发布联合链恢复支路现由原生点击存档按钮进入本组件，不再由测试宿主固定读取slot0后直接装配；新局原生选章／势力与全部既有断言保持。781条完整EOF流中78个CDP中止事件按原严格观察器逐条关联，不冒零requestfailed。该链使用实际共同发布／自有R2／签名reader／共享App／原生IDB，但启动和导航仍为测试端口，不是生产首页已经挂载。

229项Trial束仅新增本模块，原228项及两壳保持。隔离静态包1501输入／1389清单文件／1388资产，digest `068e749b20a82cbe7bb91fbadcb090e99f0f5143b95d6886faaa2438f5a7577b`，sourceTree `fcccf483b14421ee6421486b75e50e4a074c680c383add8b5c71364c52451858`；发布者与测试App同包。生产bootstrap／标题组合、已识别旧版证明及确认compare-delete、实际导航、超安全整数ordinal与完整旧局静态闭包仍待完成；不可用说明不是清档功能。未commit/push/deploy。

### 2.53 公开玩家启动、标题与实际导航（PLAYER-PUBLIC-ENTRY-1）

`web/src/boot.js`现按严格的`formalGame`／`mode=new|load`查询分流，`player/playerpublic.js`把既有目录、新局、恢复、静态读取、正式仓储、状态检查及退出宿主接到同一共享App。标题默认内置游戏；原“是／否”几何与内置流程保持，自建“是”进入新的选章／势力页面，“否”进入所选游戏的当前版存档列表，不再误用内置档。每次导航重新核公开目录并通过既有最终准入，不复用预览票据。旧`/api/published-games`、`/api/announcements`及localhost编辑器回退已从标题删除。

目录／公告在开场加载阶段及标题显示，远端失败不等待或封锁已就绪的内置游戏；非HTTPS静态开发页不发替代源请求。正式选择页面使用仅通知的标题组件，不展示可误导选择的内置下拉；公告模态拥有输入，右键只退公告而不取消下面的选章。新增`selectionVisible=false`时组件也不提供可消费的选择。作者文本仍由原组件按文本显示。

正式存档使用同源`wolong-web/saves`中的独立game键，没有迁移／清除旧键。恢复仍采用已核令牌的单次捕获仓储；普通退出实际回初始页，游戏内读取先退出旧App、重新载入当前版恢复页面。明确删除由原宿主停局并保持确认，右键无效，左键确认后才实际导航回初始页；本地档不删除。启动前取数失败只给通用失败／重新载入／返回界面，不推断删除。不可用档说明仍不是已识别旧发布版证明或确认清理能力。

`.dragon-analysis/release-readiness/player-public-r2/`十八显式入口全过：新公开模式通过**未替换的index.html／boot**及原生标题／章节／势力／存档点击，串接真实共同发布、自有R2、签名reader、共享App、原生IDB与实际页面导航。八组覆盖标题公告、选择页公告退层、是／否、退出／游戏内读取、更新警告与旧身份保存、下架续存、410禁写及确认前后URL和原档保留。开场使用本测试profile的已看过标记；装配后测试轮询持有时钟，不冒完整战役。公开模式1141条完整EOF流／155个严格关联CDP事件，原测试启动模式781／109，未放宽观察器或称零requestfailed。运输仍为自有进程内桥，不是真实TLS／Cloudflare部署；实际Assets路由另见§2.46。

其余入口覆盖目录／新局／恢复独立浏览器、正式App27／内置保存归属17、原开局／空槽／延迟地图／单实例、仓储35、编译16、静态包、本地Trial及观察负控36。旧公告源形测试中localhost、只显示五条且不可点击的期待与已批准政策冲突，已明确撤销并替换为当前接线／查询拒绝14组；不把旧错误期待当回归要求。probe1因派生runner未处理CRLF而跑到旧Trial证据目录并被EEXIST拒绝，未覆盖；probe2仅测试初始化在about:blank访问sessionStorage报错，限定自有源后r1、增加公告组合／游戏内读取覆盖后的r2均完整通过，失败现场保留。

230项Trial束新增公开装配模块，更新boot／StartMenu／目录组件，其余226项及两壳保持。隔离包1502输入、1390清单文件／1389资产，digest `60398362c5a4a81604e6390928b7bf74bb871112eb7559fa38bee2963f09aafa`，sourceTree `84938ea6c03fe2b0ffd4faf13fe1e1acb35288f8124f53460a54e600df1a7102`；发布者与实际公开App同包。仍缺旧版确认清理、超安全整数ordinal、旧局完整静态闭包／核心兼容、物理内容清理及实际生产配置；未commit/push/deploy。

### 2.54 已公开正式版本的只读元数据证明（RELEASE-HISTORY-1）

新增`GET /play-api/v1/releases?game=<UUID>&release=<UUID>&ordinal=1.n`，只识别当前仍上架游戏的指定正式版本，返回`{saved,current}`；saved包含原公开目录身份、章节列表及manifestDigest。它不发票据／旧版准入、不返回内部根键，也不验证本地档正文或授权删除。当前版直接核当前运行索引；较旧版须严格早于当前序号，并由当前公开历史的firstOnline引用闭合下面的证据链。

冻结publisher现在把**完全相同的候选根字节**不可变写入`control/roots/<authority>/<generation>/<operationDigest>.json`并读回核字节／头，随后才切根或确认；恢复已可见但未确认的操作也必须通过该检查。根副本单独不证明上线。reader还须取得原最小回执，核其权威／操作／payload引用及rootDigest，再核根副本SHA、完整引用元组、历史投影SHA／已上架release、运行索引SHA／身份／章节及manifest摘要。旧release行被SQL剪除、同源修订重复发布均不靠当前行补标签。

不改变冻结payload、公共公告或schema，不为已确认历史自动回填／猜造根副本。没有副本／回执或不支持的旧协议只报不可取得证明；候选资源、同序号其它release、错误或未来序号不获识别。返回前重读当前根：变更409，下架403，只有明确删除才410；缺状态、坏／缺proof保持503，不推断版本不同。根／回执4KiB，投影／索引沿原有2MiB预算，无R2列举或外网请求。物理删除仍须审计所有历史投影、根副本和其它引用，本批不解除非空分发账本的删除拒绝。

`.dragon-analysis/release-readiness/release-history-r4/`十六显式入口全过、1631输入SHA稳定。publisher内存／实际自有workerd各37组，新增根副本写前／写后故障、读回丢失／坏字节／MIME、不可变碰撞与已切根恢复故障，禁止提前确认或二次切根。first-online原113组保留，新`--release-history`为146组：实际自有R2／workerd核当前与历史元数据、错参数／UUID／序号、缺回执、坏根及伪匹配摘要、缺索引；Node包装同一自有桶的受控await核最后更新／下架／删除／未知状态竞态。共同应用20章编译／八代发布38组另核旧版证明对应真实发布与当前SQL身份，旧版admissions仍409。

另回归回执双平台23／23、reader66／冻结reader89／公告107＋客户端32、签名实际客户端8、drainer35、站点18、runtime66、编译16和公开玩家联合链。公开链保持原11＋6＋8组、六根／1141完整EOF流及129个严格关联CDP事件，静态包仍为§2.53相同1389资产；不称零requestfailed或真实云验证。r1失败是新查询用了旧`r0/r1`运输夹具而非UUID，新增可选UUID夹具且保持默认；r2误从旧发布响应取不存在的releaseId，改核实际SQL；r3旧浏览器R2测试白名单缺根副本路径，仅补精确`control/roots/`，失败现场全部保留。

Web源码、230项Trial束及两壳均未修改。仍需客户端正式版本／本地档校验、确认时重新查询与单槽compare-delete及界面接线；本接口不等于不可用存档清理完成。未commit/push/deploy。

### 2.55 客户端正式版本识别（PLAYER-RELEASE-CLIENT-1）

`createPlayerReader().release({gameId,releaseId,ordinal})`显式读取§2.54，只接受准确UUID／规范正式序号，复用固定HTTPS源、无凭据GET、no-store、禁止重定向、2MiB流预算与绝对deadline。请求参数在await前捕获；每次都重新请求，没有缓存、自动重试、准入或持久化。

返回冻结的公开字段白名单`{saved,current}`，核saved与请求精确相同、两者同gameId、章节身份及唯一性、manifestDigest、current的正式UUID。按BigInt比较序号：旧序号必须对应不同release UUID；同序号须为同一UUID／源修订／名称／日期及有序章节，矛盾响应拒绝。同源重复发布不合并为同版，超过安全整数的序号仍精确比较，但本批不改变存档codec的当时限制（后继见§2.56）。额外票据／私有字段不返回。

未知历史404、证明不可用503、目录变化409、下架403及明确删除410分别拒绝，不以普通错误推断删除；这次全局只读查询不会修改另一个已准入session，终止仍由所属session的请求／状态及原App守卫处理。识别正式发布不等于本地档完整性／语义校验、旧版可玩或用户同意删除；本批不调用IDB、compareDelete，不接不可用档清理界面。

`.dragon-analysis/release-readiness/player-release-r1/`十二显式入口全过，1626输入SHA稳定：新客户端51组覆盖错身份、同序号矛盾、超安全整数比较、捕获／冻结、字段过滤、错误／预算／超时及独立session不被改写；原客户端43、目录29保持。实际自有R2／workerd的历史验证保留原146组，新增客户端当前／旧版两次比对及同桶受控末次根更新／下架／删除／未知四种拒绝，共152组；原first-online113、reader66、客户端workerd7、编译存档链16同时复验。历史客户端在Node运行，未把此项冒成浏览器清档证明。

公开玩家联合链保原11＋6＋8组、六根／1141完整EOF流与106个严格关联CDP事件；新增方法尚不由该UI调用，此链仅回归既有游戏流程，不称零requestfailed。隔离静态包1389资产与publisher／实际App相同；230项Trial束仅客户端一项字节更新，原229项及两壳保持，并通过实际本地Trial丢弃验证。没有改reader服务端、规则、App或存档格式；完整资源保留、确认清理及生产部署仍待完成，未commit/push/deploy。

### 2.56 正式存档的大序号精确表示（SAVE-ORDINAL-1）

这是Web存储合同扩展，不是原游戏数值或规则变化。format3／catalog-v3的`releaseOrdinal`保留原0..MAX_SAFE_INTEGER数值及原编码；仅更大序号使用无前导零、至多31位的十进制字符串，与已存在的正式`1.n`协议域一致。每个序号仅有一种表示：小序号字符串、超安全整数Number、BigInt、浮点／指数／符号／空白／超长字符串均拒绝，不舍入、不隐式规范化、不迁移旧正文。槽号与writeRevision仍严格限安全整数，事务／SHA／完整token CAS保持。

`gamesavecodec`集中校验与正式版本转换，`playersaves`按固定准入生成该值，`playerrestore`按严格类型和值筛选，不再用Number安全整数门误禁合法大序号。备份继续复用原严格JSON／身份与公共detached预检；没有另建数据库、恢复器或旧版准入，也不赋予清档权限。此节替代前述批次的超安全整数持久化缺口；不把历史批次成绩改称当时已支持。

`.dragon-analysis/release-readiness/save-ordinal-r1/`十六显式入口全过，1626输入SHA稳定。新54组核0／安全边界／相邻大数／31位上限、唯一表示、零IO拒绝、正文／目录／token往返、CAS冲突与原子失败；原store7组／59负控、20章快照／80拒载、备份20章／148拒载、正式存档30、仓储35、实际编译链16保持。初次准备脚本误列不存在的Trial政策命令，在任何测试执行前拒绝；修正为既有入口后完整执行，没有产品或测试失败轮。

独立新profile的真实App／原生IDB增加两组为29：`1.9007199254740993`新局保存、完整备份往返、冷恢复及覆写均保留准确字符串，同时同库另一游戏的小序号档摘要不变。真实读档选择视图普通模式17组保持，大序号模式18组完整重跑并核相邻`9007199254740992`行禁选且不读正文；使用当前Web完整副本和受控reader身份，不冒该巨量序号的真实发布历史。公开生产boot联合链仍用实际1.0／1.1，保原11＋6＋8组、六根、1141完整EOF流及10个严格关联CDP事件，不称零requestfailed。内置保存17、本地Trial、政策、静态包／模块布局同时复验。

230项Trial束仅codec／正式保存／恢复视图三项更新，原227项及两壳保持。隔离包1389资产的digest `bf9ac28c0c24510c53baf9d1fdd1b401117dd542a459ee84b5811a8d42f39ae1`与publisher／实际App相同；没有改变发布者、reader、App规则或普通内置v2存储。旧版确认清理、完整旧局静态资源／核心兼容及实际部署仍未完成；未commit/push/deploy。

### 2.57 受信静态包不可变归档（STATIC-ARCHIVE-1）

实际调用链仍有延迟取数：`BattleView.open`加载战术地形图、单位图、`battle_talk.json`与`battle_display.bin`；`MusicPlayer.ensurePlaying`按需读播放清单／曲目且仅缓存一个解码曲目。`main.ensureGameAssets`的战略预载不能证明这些资源全部已固定。这是当前代码的工程事实，不是原版机制或完整动态依赖扫描结论。

新增`vps/static-archive.mjs#createStaticArchiver`接受独立构建digest、源码树digest、显式总字节预算、受信路径字节端口与不可变桶端口。沿用既有桶的`artifacts/`区：`artifacts/programs/<releaseDigest>/files/<path>`保存全部asset，最后保存同目录`static-release.json`。部署configuration条目仍在原清单中，但不作为HTTP资产上传；没有新增顶层桶分区、默认URL或作者代码上传入口。正文以精确`application/octet-stream`存放，未来读取适配器必须独立提供可信MIME及执行／路径策略。

每次stage重新读取并核清单／源码树／总预算，逐文件核长度与SHA、拒绝已有不同字节或MIME；PUT响应丢失只按有界精确读回判定。写完后重读源清单及全部远端asset，最后不可变安装清单并读回。同步所属守卫贯穿异步边界；失败可留下已上传对象，不谎报回滚或自动清理。重试不覆盖已有对象，新构建独立命名空间不触碰旧构建。返回冻结的核验摘要，不是SQL发布、当前根切换、运行准入或核心兼容证书；没有TTL／GC／删除接口。

`.dragon-analysis/release-readiness/static-archive-r2/`七个显式入口全部通过：新测试内存与真实自有workerd R2各34组，含碰撞／坏MIME、丢响应、源清单漂移、末次远端损坏、预算、退休时序、重试及两个构建共存；原静态清单43、静态预检35、打包6与实际包原模式保持。实际隔离包`--archive`经自有条件内存桶归档1389资产和清单，共157367537字节，再逐项核SHA及重试无新增PUT。该完整包不是实际云或workerd大包证书；workerd测试使用小型受控软件包。r1七入口已通过，复核既有四区布局后将初稿路径归入`artifacts/programs/`并完整重跑r2；两轮现场保留，未触碰真实桶。

实际包digest仍为`bf9ac28c0c24510c53baf9d1fdd1b401117dd542a459ee84b5811a8d42f39ae1`，Web／共享App／230项Trial束未改。本阶段只完成归档基础，**尚未接发布配置、固定对局的程序包身份、归档HTTP读取或全部延迟消费者**；完整依赖闭包、两端核心兼容和跨程序更新旧局续取仍待验证。归档共享资源也必须纳入后继物理清理引用边界，不能按游戏删除前缀误清。未commit/push/deploy。

### 2.58 固定静态归档只读端口与冷读（STATIC-ARCHIVE-READ-1）

新增`vps/static-archive-reader.mjs#createStaticArchiveReader`，只接受GET桶端口、独立受信构建／源码树摘要及同步所属守卫。路径、前缀与显式字节预算在IO前检查；每次读取重新核规范清单及两种摘要，只允许清单内asset，不读部署configuration或任意调用者拼接键。正文严格核有界长度、SHA和归档运输MIME；资产await后再核原清单准确字节。返回独立字节副本，不缓存成功、不写桶、不从原网站补取，不把缺失／损坏解释为游戏删除。它没有HTTP内容类型或可执行页面服务能力，也不签发程序／游戏准入。

`.dragon-analysis/release-readiness/static-archive-read-r2/`十个显式入口全过，1544输入SHA稳定。新只读测试内存与实际自有workerd R2各55组，覆盖零IO拒绝、清单／源码pin、路径与configuration拒绝、空文件、返回副本、预算／MIME／SHA／缺失、末次清单变化、异步所属退休及无成功缓存；所有读取均无PUT或源读取。原归档双平台34／34、清单43、预检35、打包6及实际包原两模式保持。

实际包新增`--archive --archive-read`：先归档1389资产，再删除**本测试临时目录**内的打包结果和源副本；重新构造仅持有GET端口与pins的冷读器，接原`createStaticResourceVerifier`完整核验1389资产及八幅图引用。另逐SHA核战术三地形图／单位图／对白／显示字节、音乐清单与一首FLAC，随后移除自有归档中的该曲目，重复预检必须拒绝且无修补写入。完整包使用条件内存桶；实际workerd只验证小包，不拼接为完整云／浏览器证书。r1在全包冷预检后因测试误写地形模板名为`battle_terrain_layout.png`失败；对照真实`BattleView.open`的布局插值改为0／1／2三个现存资源，产品代码未改，失败现场保留后完整重跑。

源Web／共享App／230项Trial束／publisher／reader站点均未修改，包digest仍为§2.56所列值。**尚未接生产静态配置、程序身份、归档HTTP路径或任何延迟加载器**；本批只证明固定归档可脱离原包冷读，不宣称活跃旧局跨部署续取、动态依赖闭包、两端核心兼容或物理清理完成。未commit/push/deploy。

### 2.59 VPS安装源码与试玩束检查（INSTALLED-PROGRAM-1）

`vps/installed-program.mjs#verifyInstalledProgram`枚举实际`web/src/**/*.js`，与实际`server/public/trialweb.txt`逐路径、长度、SHA及UTF-8正文比对；还核唯一`intro/styles.css`、准确集合及末次束／目录观察。按现有静态清单算法重新计算源码树摘要，对照独立配置的`STATIC_SOURCE_SHA256`，不接受束自报摘要为准入依据。拒绝符号链接、硬链接文件、非普通文件、遗漏／额外源码、陈旧束、坏结构及超预算；单文件25MiB，束和合计正文各64MiB。

显式`startConfiguredPublication`在私有数据路径检查之后、FileBucket／SQLite创建和远端IO之前执行检查。配置解析只额外保留原受信源码pin；`--check-config`仍然只验证配置语法，**不是安装核验成功**。不重建或覆盖源码，不迁移数据库，不自动改权限。顶层模块已可能导入：本检查是磁盘安装字节测量，不能称为已加载ESM证明；运行期间安装树须保持不可变，Linux部署／动态闭包及两端兼容仍待完成。

`.dragon-analysis/release-readiness/installed-program-r2/`十入口实际执行，1622输入SHA稳定：安装36组、CLI53组、服务18组、drainer35组、Node HTTP两模式、静态清单43组／预检35组及实际包冷读通过；**私有素材库回归失败，整轮不是全通过**。r1同样保留该失败；r2另外收紧非字符串pin输入。CLI负控确认错pin零远端调用且不创建数据库／私有对象目录，命令仅输出脱敏失败，信号监听清理；语法检查仍可接受格式正确但未安装的pin。实际229源码与230项束的摘要等于当前隔离静态包`331d16606f80d4b155a72938578d885a97f0681e1291b80edc8f9ab1e1d256c8`；Web、束和静态包均未变。

失败已确定为`server/available-library.txt`的20个消费者记录中，`main.js`、`render/battleview.js`、`ui/gamebar.js`三项仍精确匹配Git HEAD旧字节，而当前工作树已有后继变更；并非本批改动了这三个文件。测试首先在main摘要比较处失败。没有删除测试、自动替换旧pin或宣称素材库通过。已审三份Git原／现差异：后继正式会话／保存归属守卫，无资源路径改变；并用既有`stage_editor_trial_assets.mjs`在自有`installed-program-library-candidate-1`产出候选。候选93632字节、SHA `35863d888a9086d63f34a56b3563239c5afdbadaac55d4c5e03d860e5fefe86e`，严格比较只变上述三个消费者摘要，398资源、许可、20未解决项及来源身份全部不变。**本批结束时候选未安装**；后继§2.60核registry／旧捕获边界后，以新身份安装重新捕获的清单并复验。旧清单、安装源码检查和完整资源闭包是不同证明，不能相互替代。

全程仅自有临时文件、loopback及进程内HTTPS替身，其余使用禁网守卫；未接触真实DOS存档、用户profile、云或共享dist。本批未重跑浏览器，因未改Web或浏览器束；不构成公开入口、旧局延迟资源或云上线的新证明。未提交／推送／部署。

### 2.60 固定库新身份与Trial选边修复（LIBRARY-REFRESH-1）

先核`InstalledSourceCatalog`：既有registry不可替换definition/root，永久键不能跨定义重用，捕获逐次核注册行与epoch。因此没有修改旧注册行、放宽品牌／SHA或复用旧ID。重新捕获的`server/available-library.txt`仍为93632字节，SHA `8993b360d062fd29c2c26f5e55812a6b1911e2531881a44781e90e7690ddc06b`，独立registry为`approved-available-library-8993b360-1`。原398资源、许可、来源／profile和20个未知引用全部不变；20个消费者仅main／battleview／gamebar三项后继守卫及本批servertrialapp一项更新。原41角色完整复制源、SQL声明及登记／读取实现不变。旧registry与对象保留；新库仍须操作员显式暂存、管理员以新操作键登记，不能自动改旧`.local/library-root.json`或把暂存当批准。只读旧副本数据并未迁移；跨部署既有数据／活会话仍需单独验证。

实际Trial浏览器在初轮发现旧头像上传／图库把开始按钮挤出1280×720视口。按[画像禁上传的后继产品决定](editor-dev-todo.md)，删除`servertrialapp.js`过时上传／裁剪／图库实现及调用，仅保留显式势力选择与普通开始按钮；原会话绑定、连接监测、固定pack、同一App及退出流程不改。服务端上传口此前已退役（`editorapp.js`的Trial路由只含status/end/pack）；本批修其残留客户端，不改后端权限或共享画像。Trial束重卷230项，只有此模块变化；两个HTML壳字节不变。

`tools/verify_library_refresh.mjs`在实际file SQLite＋条件内存桶／自有Miniflare R2各通过8组：真实400角色stager／无覆盖重试，显式旧数据fixture与新登记共存，旧永久键冲突、旧root冒充新身份拒绝、全角色capture、注册变化／await撤销／坏对象拒绝、实际重启后旧行／收据和432个旧对象SHA保持，进程内捕获不跨实例复用。旧清单由四个精确逆替换重建并核固定旧SHA，不依赖忽略目录，也不生成旧策略品牌。原policy负控、私有库14组／20消费者均通过；删除的旧忽略文件依赖改为这一可重复历史负控，未放宽断言。

最终`.dragon-analysis/release-readiness/library-refresh-r4/`19个显式入口全部通过，1638输入pin稳定。含前批安装36／CLI53／服务／drainer／HTTP两模式、静态清单与资源门、实际1389资产归档冷读、共同20章冻结发布、实际公开玩家链、Trial policy／规则边界／discard。真正workerd登录／改密／两库登记／完整复制到全新Chromium Trial启动22项通过（`trial-app-boot-r1/attempt10`）：1280×720原生点击可见按钮、192城实际App完成装配、六派生资源取完、零IDB访问／页面错误／外域请求，实际结束流程不报错。会话在测试代理注入，非浏览器登录或线上TLS认证；不是全战役或G-INIT证明。公开玩家证据`publication-chain-browser-vubHFL`保留11＋客户端6＋公开8组、六代切根；1141完整EOF流中14条严格对应CDP中止事件，不能说全部请求零失败。

当前静态包摘要`c02c2d0817b18390af1d3d29763dd87259c4638a9dccd06b0ad88f7c6b9b96fa`、源码树`b8b2458077b2db52263853311f851e832b4bfa852bbc17a811af361537748150`，实际publisher／公开App一致；Trial束SHA `aaf598e30e01df7ccc3ef93c68a66c4b1021b11fce32921be936799b67a1fcad`。这些仍不是核心兼容或完整延迟资源闭包。

失败证据保留：r1新测试误以规范source parser解析普通清单JSON，改用严格捕获异常的JSON.parse；r2发现真实不可点击UI；修UI后r3新增断言误用不存在的App属性，截图已显示运行，改核实际runtimeEnabled/gameStarted和装配状态后r4通过。没有强制点击、缩减画像资源、跳过测试或修改规则来迁就。测试只用自有临时源／桶／数据库／浏览器，无真实存档／云／共享dist。未提交、推送或部署。

### 2.61 单次分发的静态整包批量预检（STATIC-BATCH-1）

调用链核对发现：`createDistributionResourceVerifier`原先为每个可见游戏（另含未上架发布候选）分别调用静态预检；同一冻结投影引用同一受信静态包时，整包读取随游戏数重复。本批只合并**同一次分发尝试中的扫描**，不改变准入、版本、发布数据或归档权限。

`createStaticResourceVerifier`保留原单manifest接口与结果，新增只读函数属性`batch({manifests})`。全部八图引用在首个await前复制／校验，每个成员均核清单绑定，再完整读验每项asset的长度／SHA并重读原清单；configuration仍不作为资产读取。空批、缺成员／畸形引用拒绝。不同调用、并发调用及重试各自重新读验，**没有跨调用成功缓存或共享在途结果**。返回的计数不是长期有效凭据。

分发校验器构造时捕获可选batch端口，仅保留各manifest的`visualAssets`，不累计完整运行索引／作者清单；全部R2运行角色仍走原身份、SHA／长度／MIME检查，随后一次批量预检成功才返回。可见游戏与隐藏发布候选都必须包含；无静态引用不调用。普通受信单项端口保持原行为，坏batch配置拒绝、batch失败不降级。现有显式CLI构造的真实静态端口直接具备该能力，默认publisher沿原装配使用；runtime stager仍单项预检。没有新增生产绕过开关或改变CAS／SQL确认顺序。

`tools/verify_static_batch.mjs`36组：四个不同游戏的运输夹具，同一运行图覆盖下单项52次静态读取降为批量13次；四个成员逐个错绑、隐藏候选、缺任一资产、首读后调用方修改、末次清单变化、并发／重试及无端口负控。实际内存SQLite＋默认publisher再核两代：缺音乐使分发保持pending、零新增对象／切根／确认，修复后原payload重试成功，每代仅一次整包扫描。上述是确定性读取次数，不是线上耗时、完整游戏或云负载成绩。

最终`.dragon-analysis/release-readiness/static-batch-r2/`15个显式入口全部通过，1657输入pin稳定：新36组、原资源35／清单43／HTTPS替身31、distribution resources双平台35／35、publisher37／37、runtime stage28／28、CLI53／服务18／drainer35、实际1389资产归档冷读、共同20章／八代冻结发布38组。r1相同15入口已通过35组，r2补实际publisher两代负控后完整重跑；无产品失败。共同发布夹具仍用原1376资产模式，不能与独立1389项冷读拼成完整程序闭包证明。仅自有内存／SQLite／workerd及必要loopback，必要环境白名单，无真实存档、云桶、凭据或共享dist。

Web／规则／Trial束及两个壳均未改，因此未重卷束或重跑无关浏览器。实际完整包摘要仍为§2.60的`c02c2d08…`／源码树`b8b24580…`。本批**没有接通归档的生产读取、程序身份／核心兼容或旧局延迟资源**；这些与旧档确认清理、物理删除及实际部署仍待完成。未提交、推送或部署。

### 2.62 显式启动链的程序归档（STATIC-STARTUP-1）

`publication-config.mjs`沿用独立配置的静态清单／源码树SHA和受限HTTPS端口，构造归档操作；总包上限固定256 MiB，不新增跳过开关。纯解析和`--check-config`仍不联网、不读写数据目录。真实`startConfiguredPublication`先核私有路径与实际安装源码／Trial束，再用同一签名R2客户端执行§2.57完整归档；成功后重新核安装文件和私有路径，才创建FileBucket／SQLite并进入原发布服务预检及监听。

所有asset复制至`<prefix>artifacts/programs/<清单SHA>/files/`，完整读回后清单最后安装；配置文件不作为资产上传。任何源缺失、读回失败或既存内容碰撞都拒绝启动，不覆写旧对象。丢失PUT响应仍只由准确读回决定成功；重启仍全量核验，没有成功缓存。部分对象乃至完整归档可能在失败后保留，**后续发布预检失败不撤销归档，也不据归档宣称已发布、可准入或可执行**。旧程序目录不自动删除，未引入TTL或GC。

CLI的SIGINT／SIGTERM会同时撤销启动归档所有权；在当前有界网络请求返回后的检查点停止，不继续建库／监听，只报stopped。不是立即中断在途网络请求，已提交对象不会回滚；其它错误仍按startup-failed处理。归档之后的原服务启动／HTTP及SQL排空边界保持不变。磁盘二次测量仍不是已加载ESM证明，部署目录必须在进程寿命内不可变。

最终Windows `.dragon-analysis/release-readiness/static-startup-r4/`十二入口、WSL2 `.dragon-analysis/release-readiness/static-startup-linux-r3/`十入口全部通过。CLI原53组保留，新增六组至59：缺源／缺读回零建库、碰撞不覆写、重复启动零新增PUT、全部PUT丢响应后准确读回、归档期间早到信号。旧远端预检故障另断言数据库确由服务创建，避免测试自己开库掩盖未到达原边界。实际CLI运输仍是严格进程内HTTPS替身，归档使用当前229份JS＋CSS及一项自有二进制探针，**不是完整1389资产的CLI云上传**；完整包另经原归档冷读入口复验。Linux原12组／11子进程重跑，真实SIGTERM／SIGINT、权限及崩溃边界保持通过；其空权威根替身现另支持上述程序归档。后继[Linux归档边界补验](vps-editor-readiness.md#410-后继linux归档中退出与异步后路径复核linux-archive-1)已实际递送归档中的SIGTERM／SIGINT，并验证归档await后目录权限／数据库权限／symlink变化拒启；共19组及十入口通过，产品未改。

保留probe1错误预期异常名、r1静态替身MIME错误两轮失败；修正仅在测试。r2十二入口和Linux r1十入口已通过，补全部PUT丢响应断言后Windows r3／Linux r2也通过；最终审计发现Windows清单复用旧pin时跳过新导入夹具，修正递归收集后按最终两scope完整重跑，不回填旧轮证据。原archiver、Web／规则、Trial束、静态包及两个壳均未改，不重跑无关浏览器。此批只接通**生产入口代码中的归档写入前置**，未连真实云，仍缺程序归档HTTP／运行绑定、核心兼容、旧局迟到资源、旧档确认清理和物理删除。未提交／推送／部署。

### 2.63 程序归档的不可变登记（PROGRAM-REGISTRATION-1）

新增纯格式模块[`reader/programregistration.js`](../reader/programregistration.js)及受控写入器[`vps/program-registration.mjs`](../vps/program-registration.mjs)。软件登记键为`<prefix>control/programs/<清单SHA>.json`；规范JSON只含`schema: dragon-program-registration-1`、`releaseDigest`、`sourceTreeDigest`，上限512字节。拒绝错误摘要、非规范编码／额外字段、错误或重复MIME及冲突内容。**格式通过不等于可信来源**：后继读取端须从受控登记键取得记录，不能接受客户端记录或把任意归档清单自身当授权。

显式CLI在§2.62的整包上传／全量读回及安装／私有路径复核成功后，才不可变写入登记；再次读回精确记录，然后再次核安装和私有路径，才进入原建库／服务预检。已有完全一致记录不重写，碰撞不修复，PUT丢响应只靠精确读回决定成功；读回未知或失败不建库。各await前后保留启动所有权检查。停机或后续失败可能保留已提交登记，不能假称回滚；重试仍重新验证整个程序归档，无成功缓存，也不删除旧程序登记。

这属于**操作员程序安装**，不是作者的游戏发布路径：不改游戏Release、序号、当前根、分发账本或DDL，不给作者写`control/`的接口，不按游戏复制程序。记录不选择当前程序、不签发游戏准入、不证明核心兼容、已加载ESM或完整战役。本批当时尚未新增程序资源HTTP路由；后继只读资源门见§2.64。玩家迟到资源绑定仍未完成，不能把登记成功写成当前程序选择或游戏发布成功。

`.dragon-analysis/release-readiness/program-registration-r1/`十四入口、`program-registration-linux-r1/`十入口首次全部通过。新格式／条件写40组分别在条件内存桶与实际自有workerd R2运行，覆盖规范字节／预算、零I/O坏参数、MIME／源摘要碰撞保留、错误GET不当缺失、PUT丢响应、各异步边界退休、重试及两软件登记共存；合成摘要只测登记协议，不冒已归档程序。真实CLI原59组保留，新增五组至64：登记丢响应后读回、坏登记不覆盖且零建库、读回缺失拒启、原登记重试零PUT及登记等待中退出。Linux仍为19组／18真实子进程，归档后权限变化在登记前拒绝，正常权威预检前须有完整归档和精确登记。

其余回归含安装36、归档34／34、冷读55／55、静态预检35、批量36、HTTPS31、服务18、drainer35、完整1389资产冷读，以及Linux文件桶／blob／SQLite／HTTP两模式。CLI HTTPS仍为进程内替身，232个程序对象加一个登记，不是云TLS／完整包上传；原40组workerd测试也不是部署证明。Web、230项Trial束、两个壳及当前静态包SHA均未变，不重跑无关浏览器或游戏规则；无真实桶、VPS、用户存档、提交／推送或部署。

### 2.64 已登记程序资源的只读HTTP（PROGRAM-ASSET-HTTP-1）

[`reader/programassets.js`](../reader/programassets.js)经`reader/site.js`挂载`/program-assets/<清单SHA>/<规范路径>`；Wrangler将该前缀及其子路径保留给Worker，不能由同名Static Assets文件绕过。仅GET／HEAD，拒绝非规范路径、未知后缀以及HTML文档／SVG／配置文件／清单直取（§2.67仅将固定开场片段作为纯文本供应）；查询仅有后继§2.66的四张战术图固定别名例外，其余拒绝。允许的JS、CSS、JSON、文本、图像、字体、二进制和音频使用固定后缀MIME，附no-store、nosniff、same-origin CORP；HEAD同样完成全部验证，只省略正文。不提供历史HTML入口、当前程序选择或游戏准入。

每次请求从**操作员受控**`control/programs/<SHA>.json`取规范登记，再取对应归档清单：核完整SHA、源码树SHA、至少一份源码JS及严格清单结构。只读清单内asset，先核R2尺寸／原存储MIME，再有界读流，核实际长度与SHA。返回前重新读取并比较清单和登记的准确字节。没有跨请求成功缓存、对象列举、修复写入、游戏私有资源入口或对当前ASSETS的失败回退。无效路径返回404；缺失／损坏／未登记／运输未知统一503，不冒GAME_DELETED。旧登记资源可读并不授予旧游戏开局。归档只存在而无登记，不能读取。

规范字段／路径／排序及字节编码抽至[`reader/staticreleaseformat.js`](../reader/staticreleaseformat.js)，是**不带授权或摘要认证的纯格式层**；VPS原同步构建／解析继续使用Node SHA，Worker使用Web Crypto，两边均独立核完整摘要及源码树摘要。没有复制第二套清单协议或增加nodejs_compat。现有完整包的清单／源码SHA、1390文件及1389资产均不变；三个隔离打包夹具仅新增复制这个工具依赖，不把它加入Web运行包。

最终`.dragon-analysis/release-readiness/program-http-r2/`十七入口与`program-http-linux-r1/`十一入口全过。新52组分别在内存与实际自有workerd/R2执行：真实stager＋登记后撤去源端，冷读固定资源／空文件／HEAD、未登记拒绝、坏MIME／长度／SHA／超预算、匹配清单SHA却伪造源码树、后续损坏不沿缓存，以及两个程序版本共存。受控末端登记／清单竞态、畸形流和五个await边界取消在Node模块上执行，workerd模式也只称其背后同一自有桶，不冒Worker调度竞态证书。新站点21组另核实际Assets路由：未登记和已登记资源都不能被同名静态文件遮蔽，普通首页及原游戏票据／下架／删除路径保持。

原清单43、打包6、登记40／40、归档34／34、冷读55／55、静态预检35、批量36、CLI64、reader66及共同冻结发布38组／八代／20章均复验；完整1389资产冷读仍为条件内存桶，不冒完整包HTTP。共同发布默认夹具仍为1376静态资产，不能拼成全包证明。Linux使用既有Node22.22.2／非root ext4，新增52组及原19组／18真实子进程、文件桶／blob／SQLite／安装／服务／HTTP／drainer通过。

r1前四入口通过后，六项打包回归因临时目录漏复制新依赖而失败；只补上述三处依赖复制，所有原断言保留，r2完整重跑。旧输入pin未收录两个测试入口的基线查验也曾报KeyError，均在改对应文件前明确记录独立基线来源，不把未收录项说成已封存。无Web／规则／Trial束改变，因此未重卷束或跑无关浏览器。本批仍未接玩家程序／迟到消费者的固定资源URL、两端核心兼容或旧档确认清理、物理删除；未连接真实云或VPS，未提交／推送／部署。

### 2.65 当前部署的程序入口处理器（PROGRAM-ENTRY-1，尚未挂载）

新增[`reader/programentry.js`](../reader/programentry.js)作为**当时尚未接入site／Wrangler的内部处理器**（后继本地挂载见§2.68）。它只接受根／index.html的合法formalGame与new／load请求，不接受客户端程序摘要、旧HTML地址或额外参数。当前软件由受控Static Assets绑定的规范`static-release.json`选择，按该清单完整SHA读取已登记归档中的`index.html`；不是按游戏内容决定软件，也不修改或签发游戏准入。

登记／归档／源码树／文件读验共用新内部模块[`reader/programarchive.js`](../reader/programarchive.js)，本批原`programassets`的路由、MIME、错误、禁止HTML和禁止查询合同保持（后继§2.66仅增加四张战术图的固定查询别名）。内部函数允许调用者收紧文件预算；入口的HTML上限512 KiB，在下载正文前核验。HTML必须是受审壳的明确doctype／head／UTF-8前缀，无既存base或http-equiv；只在head插入同源`/program-assets/<当前清单SHA>/`基址，其余壳文本不改。末端重新读取当前部署清单，变化即503，不回退旧程序或无版本资源。未知／缺失／取消均不冒游戏删除，错误页不加载App、不读写存档；HEAD做同样校验而不返回正文。此处理器不提供任意历史HTML入口，公开资源门仍拒绝HTML。

`.dragon-analysis/release-readiness/program-entry-r2/`七个显式入口全部通过：新57组分别经Node内存端口和实际自有workerd／R2／Static Assets；原资源HTTP52／52、站点21、游戏reader66及清单43保持。新测试用真实归档／登记器、生产`web/index.html`原字节及两份小程序夹具；在同一自有R2持久目录上切换两个独立Static Assets部署，入口只选当前程序，旧资源仍能读取但旧HTML不能选择。畸形流、元数据故障、部署清单await变化和七个取消边界由Node处理器在同一桶端口上验证，不能声称是workerd调度竞态或真实浏览器。首轮实际workerd拒绝`Request.redirect: "error"`，通过仅自有诊断副本定位后改为`manual`，仍严格只收200且拒重定向；失败轮与两次诊断记录保留，未放宽断言。

**本批时不能立即挂载并宣称玩家绑定已完成**：`core/assets.js`为四张战术图附加`?v=original-sprites-1`，本批时已登记资源门拒绝所有查询（后继§2.66已补精确别名）；本批时`playerstatic.js`八季节图仍以origin根路径取数，不能靠插入base使其自动固定（后继§2.67已接模块固定基址）。须分别闭合这些接缝，并用全新浏览器验证真实ESM／共享App／迟到战术与音频跨程序部署，才接生产路由。当前HTML处理器没有改变内置入口、Web源码、230项Trial束、静态包或游戏规则；本批不重跑不受影响的Linux启动／浏览器／完整包，也不把前轮成绩计为本轮新证明。两端核心兼容、旧档确认清理、物理删除及真实云／VPS仍待完成。未提交／推送／部署。

### 2.66 战术图固定查询别名（PROGRAM-SPRITE-QUERY-1）

`reader/programassets.js`仅对`grf/battle_terrain_0.png`、`grf/battle_terrain_1.png`、`grf/battle_terrain_2.png`和`grf/battle_units.png`接受字面查询`?v=original-sprites-1`，以兼容现有共享`core/assets.js`的图片缓存后缀。查询不是软件选择器，不参与R2键；带查询和无查询始终读取URL中同一程序摘要的同一登记文件。其它路径、空查询、不同值、编码别名、重复／额外参数均在读取桶前拒绝。GET／HEAD、登记／清单／源码树／文件SHA、末端重读、无缓存／无回退及错误不冒游戏删除等门保持不变。此为Web资源运输修复，不是战术规则变更。

`.dragon-analysis/release-readiness/program-query-r1/`七入口首轮全部通过：资源HTTP由52增至91组，Node与实际自有workerd／R2各运行一次；原入口57／57、站点21、游戏reader66、清单43保持。新增四张图GET／HEAD与无查询响应相等、22个非法查询／路径、三个层级各三种损坏／缺失，以及两个程序的四图分别保持原字节；原52组断言全部保留。所有非法查询另直接核Node模块零桶访问。夹具使用真实归档／登记器和每版不同的**不透明图像运输字节**，不是PNG解码、浏览器战术渲染或旧对局实测；受控竞态／流／取消仍由Node执行。HTTP不写对象，Worker无外部请求。

本批仅改资源HTTP路由与对应测试；Web、Trial束、程序清单、site／Wrangler均未改，因此不重卷束、不重复Linux启动或无关规则／浏览器验证。程序入口继续未挂载；八季节图基址、真实浏览器迟到消费者、两端核心兼容及其它发布条件仍须闭合。未提交、推送或部署。

### 2.67 季节图程序基址与实际浏览器接线（PROGRAM-BASE-1）

`playerstatic.js`增加固定`basePath`，仅允许`/`或规范`/program-assets/<64位小写SHA>/`；原八图路径、预算、摘要、超时及错误语义不变，不回退根路径。`playerpublic.js`从自身`import.meta.url`推导同源基址，不使用查询参数或可变document.baseURI。实际浏览器发现开场还读取`intro/scene.html`，因此资源门只将这个精确路径作为`text/plain; charset=utf-8`供应；nosniff及原登记／摘要检查保持，仍不开放HTML文档或任意HTML后缀。

复用公开发布浏览器链，加`--program-paths`：先用真实归档／登记器将完整1389资产放入自有内存桶，再通过实际入口／资源处理器加载未改boot与共享App，核八季节图固定前缀、新局、保存、实际退出／恢复、版本通知和删除确认。游戏数据仍经过自有workerd R2；程序HTTP由Node处理器经浏览器运输桥供应，**仅一个软件版本，不是跨部署迟到战术／音频、生产路由或真实云证明**。site／Wrangler未改，入口仍未挂载。

`.dragon-analysis/release-readiness/program-base-r5/`21入口通过、1699输入pin稳定；静态读取88、资源HTTP104／104、入口57／57、站点21，以及原公开／App浏览器、编译、Trial真实启动、安装和完整包冷读回归通过。试运行束已重卷，两个壳不变；程序摘要`e04593661aafae76f9750b2909f76818c53c8cbc8e7aedd1885fbb79529eea7d`，源码树`3290daa13e0f1a030bcda4bcfc578bc6ccf9b0b440cddc418079567ba24833c5`。失败轮保留：r1发现开场片段拒绝；r2测试误拦正常回首页导航；r3捕获季节图已完整读毕的CDP EOF事件，现只按精确请求关联、完整未取消流及清单长度／摘要分类，附29项观察器负控；r4新文本HEAD断言未区分workerd GET的gzip／chunked运输，已更正而保留正文／安全头检查。未触及平台启动代码，未重跑Linux；未提交／推送／部署。按用户要求，本批到此收口，不继续扩展辅助测试或工程范围。

### 2.68 正式入口挂载与旧页面迟到资源（PROGRAM-ENTRY-MOUNT-1）

`reader/site.js`现将`/`或`/index.html`中含`formalGame`／`mode`的请求交给现有程序入口处理器；非法组合由该处理器拒绝，不回退普通壳。Wrangler仅增加这两个精确Worker优先路径。**没有这两个参数的普通首页仍直接使用Static Assets，不依赖程序登记或游戏目录可用性**；其余API／资源路由保持。这是本地代码接线，未修改云配置或部署。

复用既有`--program-paths`浏览器链，准备两个完整的自有内存程序归档（第二份只给boot加无作用注释，不改引擎行为），在旧正式对局仍打开时切换当前清单。确认首次加载的四张战术PNG经真实`core/assets.js`解码、战术对白／显示数据读取以及实际MusicPlayer的BGM07下载解码仍走旧前缀；原内容身份和保存正文不变。实际退出后读档使用新前缀。浏览器现在经过真实`site.js`分发；这是**资源路径与生命周期验证，不是BattleView／战术Session执行或不同引擎版本兼容证明**。无需为未改的战斗规则另造模拟器或扩展规则测试。

`.dragon-analysis/release-readiness/program-mount-r1/`七入口首轮通过、1701输入pin稳定：实际workerd站点24组（含正式GET／HEAD、错误参数、未登记拒绝且普通首页可用），原入口57／57、资源104／104及公开浏览器两模式。前置`program-late-r1/`两条浏览器流程亦通过。没有新增测试文件或改Web／Trial束；未跑无关平台／规则回归。跨端核心兼容、旧档确认清理、物理删除及真实部署仍未完成；未提交／推送／部署。

### 2.69 新版作废旧档：保存与加载清理（CURRENT-ONLY-SAVES-1）

用户明确取消旧版兼容和单档删除确认：新版上线后旧版全部作废，直接读旧档须提示不能加载并自动清除；保存新版进度时清除同游戏旧版进度。本节完成本地存档路径；服务端旧凭据拒绝与宿主退休后继见§2.70。**旧数据物理回收及完整联合链仍待完成**，不能据此宣称新政策已全部实现。

- 正式保存显式启用同游戏旧序号清理；当前槽写入、旧槽删除与目录更新同一IDB事务。旧正文经格式／摘要／目录核对，事务内再次比较；任何失败同时回滚。不删除同版其他槽或其他游戏，本机已有更高版本时拒绝旧版再写。
- 读档选择器取得当前正式版本后，核本地旧版完整身份、正文摘要及目录，清理前复查当前状态，再按原令牌compare-delete。提示清除数量；未知、同一releaseId却序号冲突、损坏或网络失败不清除。不再装配旧运行资源或要求旧快照语义兼容，仅当前版走完整detached恢复。
- 复用现有测试：mock仓储9组／65负控、正式适配30组、普通及大序号真实浏览器读档、原生IDB删除成功后abort回滚、仓储／Trial政策／正式App回归通过。原生仓储首次调用遗漏必需轮次参数，在任何浏览器／数据操作前失败；修正调用后通过，日志保留于`.dragon-analysis/release-readiness/current-only-r1/`。未读取用户存档，未新增测试文件。
- Web三模块变更后重卷230文件Trial束，SHA为`2127a3bbe986038154fdbdc7095ade5e52aea4ff0d90cf4f643c9090e453d549`；两壳不变。本批不宣称真实部署、服务器作废或物理清理完成。

#### 后继读档清理与跨页同槽变更

复用 `verify_player_restore_browser.mjs` 及原fixture，在读档页已读取旧档、清理前的 `reader.status({gameId})` 等待点，用同一全新Chromium context的第二页操作真实原生IDB。分别执行同槽覆写（recordId保持）与删除后重建（recordId改变），随后释放状态回应：选择器按旧token清理被CAS拒绝，显示未删除／可重试，无可选行、不交付恢复结果；新正文、token及目录全文保持，右键退出后也保持。没有为通过测试改变产品清理／冲突行为。

普通模式21组、大序号模式22组通过（各新增2组）；大序号仍精确保留 `9007199254740993` 及原相邻序号拒读检查。最终收据分别为 `.dragon-analysis/release-readiness/player-restore-browser-ltu9bY/result.json` 和 `player-restore-browser-LEwtlE/result.json`，两页均记录错误／请求失败，errors／failed／forbidden为空；数据库白名单仅 `owned-formal-app`，无用户profile或真实存档。当前完整Web快照、原生IDB、共同store和选择器是真实代码；reader身份／版本和等待时机为明确夹具，不冒真实发布或备份导入全链。

日志与241项选定源码／输入前后SHA保存在 `.dragon-analysis/editor-completion/restore-cleanup-cross-page-20261029/`。首轮误把章预览的status也暂停，未到捕获旧token的清理边界，等待重试按钮超时；核读 `playerchapters.js` 后限定清理对象参数，未放宽结果断言，失败保留。r2两模式通过后补齐第二页错误监听并移除测试未用变量，最终r3重跑通过。两测试语法通过；主动代码LSP仍push-only未确认，mode=all仅原await-member风格及文档hash词典提示，不称clean。仅修改既有两个测试与文档，无产品／两束／DDL改动；A28完整备份恢复与跨窗口矩阵仍未闭合。

#### 后继正式备份的显式导入写回

核读发现必须区分三种入口：`saves.html → tools/savemanager.js → localSaveRepository`是既有内置存档管理；`createGameSaveExchange`仅负责固定身份备份编码／解码，自己不写库、不查询最新版本；此前正式App浏览器的大序号备份用例仅做编码／解码，随后恢复的是原slot0，并非从备份新导入的记录。不能据该收据宣称正式游戏已有备份导入界面。

在既有 `verify_formal_app_browser.mjs` 新增显式程序调用链：当前固定环境的完整快照编码→解码→明确选slot12→`createPlayerSaveStore.put`→原生IDB。版本序号`9007199254740993`精确保留，接收仓储分配新recordId／writeRevision3；新档正文及重新导出解码与明确改slot的候选相同。原slot0全文、另一游戏正文及目录不变，当前App的scenario／存档视图／loadedSlot／RNG／战略serial不变；再次以空槽期望写slot12被`GameSaveConflictError`拒绝，已导入正文及完整目录保持。不修改产品、束或数据库结构。

完整入口30组通过，最终收据 `.dragon-analysis/release-readiness/formal-app-browser-ntg6GU/result.json`，errors／failed／forbidden为空；全新Chromium context只使用自有`owned-formal-app`数据库和回环静态服务，无真实存档或外部请求。240项选定源码／输入SHA前后保持，日志在 `.dragon-analysis/editor-completion/formal-backup-import-20261029/`。首轮指纹脚本因路径反斜线转义语法错误未生成before，虽然该轮测试通过，不用它作带指纹交付；修正使用Path.as_posix后完整重跑r2。测试语法通过，主动代码LSP push-only未确认，不称clean。

该30组批次当时剩余明确包括：正式游戏备份文件选择／下载及导入目标界面、当前版本／身份取得与迟到取消的完整接线、导入事务失败与跨窗口恢复矩阵。后继[正式存档端口及独立备份界面](editor-game-save-exchange.md#后继独立页面的正式备份界面)已接`saves.html`的游戏／章节选择、文件下载／输入及新槽CAS，并取得受控reader浏览器26／27组；真实HTTPS联合准入与完整失败矩阵仍待补齐。上述30组只证明显式固定环境中的导入写回及占槽拒绝，不是文件选择、真实远端准入、从导入slot启动App或完整备份恢复证书；A28仍部分。

**后继导入槽冷启动与再保存**：在同一既有入口追加新页面／新Realm，从已导入slot12（而非原slot0）实际启动App，核loadedSlot、备份原标签及完整RNG快照；随后经App保存回slot12成功，recordId保持、writeRevision由3到4、大序号精确保留，原slot0和另一游戏正文／目录保持。完整入口31组通过，收据 `.dragon-analysis/release-readiness/formal-app-browser-xXnSRz/result.json`，errors／failed／forbidden为空。240项选定输入SHA前后保持，日志与指纹在 `.dragon-analysis/editor-completion/formal-backup-restore-20261029/`。首轮用JSON.stringify比较运行RNG对象与规范化存档的字段顺序，误判不等；核`gamesavecodec.saveJSON`按键排序及RNG.snapshot对象后，改用既有严格规范JSON比较全部值，未改规则／产品／预期相等要求，r2完整重跑通过。两测试语法通过，主动代码LSP均push-only未确认。该后继补齐从导入槽启动的限定链，仍非文件选择／下载界面、远端版本准入或全部失败与跨页恢复证书。

### 2.70 当前版本资源门与旧对局退休（CURRENT-SESSION-1）

按最新用户决定撤销旧版续取，不新增运行协议或第二套引擎：

- 共同发布投影在`gameStates`保留当前正式`releaseId/ordinal`，下架时也可确认版本，不公开隐藏名称、作者或草稿。reader核其格式及与已上架目录的一致性；资源读取前后均核固定凭据与当前版本，不符返回`409 RELEASE_CHANGED`，期间更新不能返回迟到字节。缺少版本依据返回503，不猜测、也不冒删除；明确删除仍为410。
- 客户端只对精确409／`RELEASE_CHANGED`进入不可恢复的`outdated`状态；其他状态码、网络或损坏不冒作废。宿主确认较新版本（包括下架后查询）或读取端终态后立即关闭会话／资源，再由既有App所有权守卫退休；不热换Scenario、不保存旧进度。确认框说明版本已更新，确认后才导航。单独下架且版本未变仍可继续。
- 复用现有测试，无新测试文件：目录35组、客户端45组、实际自有workerd/R2客户端7组、reader67项（含更新后读、下架、读取await期间更新）、隔离浏览器宿主21组、正式App29组、实际Trial22项通过。宿主为受控会话端口；正式App回归不等于新政策完整发布浏览器联合链。该联合链的后继当前版本唯一复验见§2.72；其它历史切片仍须按实际影响核对，不能复用旧版续玩结论。
- 日志在`.dragon-analysis/release-readiness/current-session-r1/`。reader首次失败来自新增竞态夹具与后续章节夹具复用同一不可变路径但正文不同；只为竞态夹具分配独立releaseId后通过，失败日志保留。重卷230文件Trial束，SHA `2eb5429b1200f448ca8cdabd6bf1f7c5148f3df5219fe31fd499a691b626ab20`，两壳不变。
- 这不是物理删除证书：旧R2对象、冻结历史payload与备份清理仍未完成；未推送、部署或接触真实存档。当前只读历史元数据接口不授旧版资源或游戏准入。

### 2.71 固定素材库消费者刷新及私有工作台（LIBRARY-REFRESH-2）

这是工程字节／依赖审计，不新增DOS机制或任意作者准入。逐项取Git历史恢复旧消费者并审读差异：`main.js`、`ui/gamebar.js`的旧字节来自`d2acb08137f91a4d4f8ac4fad7e10504eb3e49d1`，`render/mapview.js`、`render/disasterpresentation.js`、`render/weatherpresentation.js`来自`f60ea48cb8a232732f71c8bf42685fd9775f8004`。变化为既有天气OLD帧／2533准备、只读行军插值、季节混合及显示合并；仍使用同组八帧、灾害图和四季资源，没有增加素材路径。本批不改这五份引擎源码。

- 既有生成器的独立输出与旧manifest比较，**只有这五个programHashes改变**；398素材、许可证、角色、限制及20个未决画像255标记完全不变。新清单93632字节，SHA=`f4ba804b84b326ff2d569980127f52d3f6df92ab623d740ad3ab21945840615b`，新身份`approved-available-library-f4ba804b-1`。旧93632字节清单原样保留于[`server/pinned/available-library-8993b360.txt`](../server/pinned/available-library-8993b360.txt)，SHA=`8993b360d062fd29c2c26f5e55812a6b1911e2531881a44781e90e7690ddc06b`；不覆盖旧SQL登记、永久操作键或私有对象。
- 复用`verify_library_refresh.mjs`的Node／自有workerd两模式，各8组：完整400角色实际stager、新身份登记、重启、旧432对象／旧定义不变、旧root移植／重用键／撤销及损坏拒绝。`verify_editor_backend_library_policy.mjs`核400角色、20消费者、11负控及两份当前工作台严格身份；来源41角色的定义不变。没有放宽旧身份或伪造Q69完成。
- 两个服务端工作台模块原仍钉更早的`76cdf28`，现改为严格新身份。`catalog/draft/stage`的native beforeunload只返回阻止离开的状态，不再在浏览器禁止的位置调用同步confirm；普通手动离开仍确认，关联不自动重发／丢弃。沿用原UI测试，捕获本次运行前后的受保护文件，不再把多年以前的工作树SHA冒作当前基线；端口显式使用自有loopback。
- 新隔离浏览器：登记UI round127的11组通过（真实SQL／R2、丢200回执、原键重放、改密撤销、native unload保留未知关联、零游戏／IDB／外网／意外错误）；素材UI round126的10组通过（完整复制、固定已保存修订与dirty确认、398描述／20缺口、PNG／11.2MB FLAC／JSON逐字节、七种响应破坏拒绝、上下文／迟到／改密清理及旧data-stage附件）。该素材测试约1314秒；123–125超时保留，不算通过，不因慢而放宽验证。登记UI121的beforeunload console失败亦保留，修复后重跑，而非忽略错误。
- 实际同引擎Trial round110共22项通过：自有HTTPS workerd／R2、真实改密／来源与库登记／完整复制／Trial签发、真实束／势力选择／192据点／RAF／六派生资产，IDB与外网零调用。它不是浏览器作者全流程、任意空白章初始化或完整战役证明。证据维护于`.dragon-analysis/editor-phase/editor-completion-20261019/`及`trial-app-boot-r1/attempt110/`，五份原字节／diff、生成器候选与输入收据均保留。

生产进度独立记录于[journal §13](checkpoint-journal.md#13-固定库刷新与私有trial接续)，不把本地链拼成已上线。Web／230项Trial束／静态核心均未改；该批次遗留`privatebytes`端口尚钉旧身份；后继已改[显式库tuple绑定](editor-backend-private-byte-context.md#后继精确库身份绑定非运行准入)，并完成[现行库Request取数聚焦](editor-backend-private-byte-context.md#后继现行库实际request联合验证)，及[隔离浏览器字节聚焦](editor-backend-private-byte-context.md#后继现行库隔离浏览器字节协议)，已交付界面／全部消费者链仍待验证，不据私有工作台、模型或Trial局部成功声称完整Q69／作者准入闭包。当前版本唯一政策的公开发布浏览器联合链后继见§2.72；物理回收／备份引用及其它生产放行条件仍待完成。

### 2.72 当前版本唯一的共同发布联合复验（CURRENT-PUBLICATION-1）

本批修正历史测试对旧版续玩的预期，不改变既定Web政策、引擎、存档格式或230项Trial束。

- **实际接线修复**：`server/publicationcatalog.js::projectPublicationCatalog`已输出`gameStates.currentRelease={releaseId,ordinal}`，reader也已严格核验；但`vps/distribution-resources.mjs::projectionEntries`仍拒绝此字段，实际默认publisher首代保持pending、根不切换。本批允许这个**可选且严格两字段**描述，验证ID／序号、禁止已删状态携带，并核其与可见目录或隐藏发布candidate一致；不是忽略未知字段。保留没有此描述的历史投影支持，不授旧游戏资源准入。
- **默认资源门**：复用原夹具增加10组，Node／自有workerd均45组通过。新增可见／隐藏当前版本正控及null、缺字段、额外字段、非法ID／序号、身份不一致、隐藏candidate不一致、删除状态仍带currentRelease等负控；非法项在R2读取前拒绝，无写入。opaque传输夹具不是可玩游戏或生产云证明。
- **实际双浏览器链**：复用`verify_publication_chain_browser.mjs`，共同参数`--node-service --management-ui --deletion-ui --admin-deletion-ui --player-client --player-app`；第二条再加`--public-player --program-paths`。两条都走正常浏览器登录／发布与管理UI、实际共同SQLite、完整20章编译、默认publisher／自有条件R2和reader，六根／六确认、两个发布和三次管理提交；各11主组＋6客户端组，记录导航端口的共享App为8组，未改生产HTML／boot／真实导航及两程序归档的公开App为13组。R2 outbound均0，所有profile与IndexedDB均自有，不接触真实SAVE或用户档。
- **当前政策断言**：更新后旧票明确409／`RELEASE_CHANGED`，客户端进入不可逆outdated、重复读取本地拒绝；旧App退休／禁存且保存前不进入IDB，右键不能确认退出。明确左键确认后从当前目录进入1.1，不热换旧Scenario；在观察到的空槽1保存，核同事务清掉旧版槽0。仅下架且未更新的1.1对局可继续及保存，新准入403；删除后410退休、保存不写IDB、仍须明确确认回标题。删除测试故意保留R2旧字节，不冒物理清理。
- **失败与观察纪律**：r1首根0暴露接线，r2为Miniflare message.id基础设施错误，r3定位严格投影字段；r4误向不可覆盖的旧版占用槽0直接保存而失败，改为既有仓储允许的空槽1并验证原子清旧，不放宽产品仓储。r5公开链通过；删除临时提前调用资源门的诊断代码后，记录App r1及公开链r6完整通过。六代实际由默认publisher验证，未保留旁路。EOF后的CDP收尾仍逐请求关联，两条客户端分别204／275项已完成流事件，不宣称零requestfailed，不扩大忽略名单。
- **收据**：日志`.dragon-analysis/editor-phase/editor-completion-20261019/{published-app-current-only-r1,public-player-current-only-r6}.log`；独立产物目录分别`publication-chain-browser-i7633d`、`publication-chain-browser-ufpqGC`（位于`.dragon-analysis/release-readiness/`），包含源码SHA、截图及结果。失败轮保留，不拼接过期成绩。私有库／Trial的原部署收据见journal§13；本批当时未部署的资源门，后继已在vps6最小覆盖并经断网Docker45组／实际健康复验，收据见[journal§16](checkpoint-journal.md#16-当前版本资源门部署与只读巡检补强)。没有实际云游戏发布或初始化生产根；发布／删除维护门仍不因本地联合链或镜像健康而解除。

**物理清理审计仍未闭合**：`server/deletioninventory.js::emptyDistribution`有意拒绝非空全局冻结账本；`observe`只做双次分页元数据／SQL引用观察，`deleteAllowed`恒false，不是字节证明、计划或清理能力。`server/distributionledger.js`的payload摘要、永久事件／回执及链式previousDigest不能按game_id过滤后改写；历史envelope可能引用多个游戏。历史SQL payload、旧R2对象、在途写（当前仅ROOT_PUT_ADAPTER、legacy unknown）和全部备份须一起闭合，不能只删除游戏前缀或因生产暂无游戏就绕门。尚需有审阅的检查点／完整引用及写屏障方案、可复核清理恢复测试和备份覆盖／保留边界；本批未执行任何生产物理删除或回滚远端根。

## 3. 本地验证（不是端到端上线证明）

下列为 RUNTIME-CANONICAL-1 历史验证；后继章节运输见§2.12，候选批重跑见§2.13，后继独立预上传验证见§2.14，共同入口可配置接线见§2.15，后继冻结根读取与新publisher联调见§2.16，共同50表与回归见§2.17，后继公告读取隔离见§2.18，服务时间引用见§2.19，公告历史更正见§2.20，上架正式身份门见§2.21，上架永久幂等见§2.22，可选共同冻结生产者见§2.23，作者发布状态查询见§2.24，作者追踪UI见§2.25，实际本地浏览器发布串接见§2.26，管理员上下架／限制的分发关联见§2.27，管理追踪界面及实际管理员浏览器接线见§2.28，删除栅栏请求的分发关联见§2.29，自己的游戏删除追踪见§2.30，管理员跨作者确认见§2.31，尚未挂载的玩家取数客户端见§2.32，浏览器真实编译资源取数见§2.33，固定运行包与资源URL见§2.34，正式环境与发布引用见§2.35，玩家目录／公告客户端见§2.36，正式身份的本地存档适配见§2.37，共享App保存归属修复见§2.38，正式存档App仓储适配见§2.39，共享App显式正式入口见§2.40，玩家统一静态路径见§2.41，实际发布准入到共享App的联合验证见§2.42，尚未挂标题的目录／公告视图见§2.43，对局版本提示／确认退出宿主见§2.44，正式App保存时状态复查见§2.45，同源玩家站点路由见§2.46，浏览器静态图取数见§2.47，正式启动失败清理见§2.48，当前版章节预览与选择后准入见§2.49，正式新局选择视图见§2.50，正式读档捕获见§2.51，正式存档选择视图见§2.52，公开启动／标题与实际导航见§2.53，已公开正式版本元数据证明见§2.54，客户端识别见§2.55，正式存档大序号见§2.56，受信静态包归档见§2.57，固定归档冷读见§2.58，VPS安装源码检查及素材库失败见§2.59，后继固定库新身份／Trial选边修复见§2.60，单次分发批量静态预检见§2.61，显式启动链程序归档见§2.62，程序不可变登记见§2.63，已登记程序资源HTTP见§2.64，尚未挂载的当前程序入口处理器见§2.65，战术图固定查询别名见§2.66，季节图程序基址及实际浏览器接线见§2.67，正式路由挂载及旧页面迟到资源见§2.68。该批为显式六入口、OS 必需环境白名单、每入口180秒、源码和日志 SHA 前后核对。前五入口无网络预加载守卫；reader 使用新建自有 temp 目录的 Miniflare／workerd／R2、仅 loopback、Worker outboundService 拒绝外网，结束释放实例和本测试目录。无真实桶／凭据／DOS SAVE／用户 profile 或存档。

- `node tools/verify_runtime_release_namespace.mjs`：15项。纯内存桶与实际 reader：同候选序号的不同尝试无专属key重叠，跨release及旧ordinal-only别名拒绝；未提交的先行对象不切根／不准入、不阻塞另一尝试上传；旧票仍取原章节，新票只取胜出release；同ID变内容拒绝且不切根。此夹具只证明路径／读取边界，不证明SQL权威提交、崩溃恢复或生产GC。
- `node tools/verify_kao_library.mjs`：621幅 PNG／manifest 双向逐字节摘要核验通过（150数字＋471模板 ID）。
- `node tools/verify_runtime_contract.mjs`：49项。新增章节／资产行四种排列的同SHA、同key、同原始字节验证，且保留章节语义顺序。实际 `GamePortraits.forPublish` 的完整621项元数据均能进入索引且 ID／key／SHA／长度完全保持；`p` 前缀不允许大小写别名、扩展名、查询／片段、路径或跨 ID key。跨游戏／版本／私有路径、MIME、预算、坏摘要、角色／章缺失、非字符串前缀、严格 JSON／UTF-8及 producer 身份／资产负控。
- `node tools/verify_publish_to_r2.mjs`：29项。真实内存 SQL→索引→完整目录，原 CAS／读回／旧操作拒绝，空目录及 reader 拒新准入；不绕过新合同去保旧弱夹具。
- `node tools/verify_distribution_outbox.mjs`：10项。原型入列／去重／确认基本行为，不认证持久 payload 或恢复。
- `node tools/verify_reader.mjs`：58项。新增模板画像缺失／错字节不能切根、固定角色的精确字节与 MIME、未声明／别名／路径拒绝、坏字节503、raw template key 拒绝及更新下架后的旧票续取。实际 workerd 中 publisher→本测试 R2→签名→章节／资产／画像，更新后旧／新票各取各版，下架／重新上架，伪造／无票／raw key／跨游戏／跨章拒绝，密钥轮换加实例重启，损坏及缺失不回退；另有 Node 直调同一 Worker、真实本测试 R2 的受控 await 竞态，证明准入期间下架不出票、取数期间明确删除不返回迟到字节。

该批六入口证据 `.dragon-analysis/release-readiness/runtime-canonical-r3/`：inventory、results、逐日志和源码SHA，六入口均通过且输入稳定。r1在原实现确定复现相同资产行因顺序不同产生不同索引SHA，保留失败日志；修映射序列化后r2完整重跑通过，再仅将测试比较器改为if分支消除风格warning，r3重跑全部六入口。前序路径批次 `.dragon-analysis/release-readiness/runtime-namespace-r3/` 六入口也独立全通过；其r1原3个同名对象冲突、r2测试漏物理test前缀的失败记录保留，不冒当前SHA成绩。前序 `.dragon-analysis/release-readiness/template-portrait-r1/` 的五入口与 `.dragon-analysis/r2-admission-a/r3/` 的四入口为历史证据，源码不同不能拼成当前成绩。

测试中的 `deleted:true` 是明确的自有协议夹具，不是 VPS 删除流程已生成／确认该事实的证明；对照对象写回仅用于测试恢复，不是允许生产回滚。测试 pack 是受限 transport DTO，不是完整编译游戏，不用其 API 成功冒同引擎开局／存档或季节资源全部认证。

## 4. 仍未完成与下一接缝

1. **自动持久分发**：§2.23已将可选共同发布／上下架／限制／删除栅栏与冻结账本同事务提交，并验证按准确字节排空；[串行drainer组件](vps-editor-readiness.md#45-后继串行分发循环distribution-drainer-1)已有单飞／重试／恢复锁／停机验证，并已有[受信HTTP／drainer生命周期装配](vps-editor-readiness.md#46-后继冻结-http-与分发生命周期装配publication-service-1)，并已有[显式CLI／信号退出／状态事件的本地接线](vps-editor-readiness.md#48-后继显式冻结进程入口与配置publication-cli-1)，后继[Linux进程边界验证](vps-editor-readiness.md#49-后继linux权限真实信号与进程崩溃linux-platform-1)已在WSL2补权限、真实信号／进程崩溃及停机等待，后继受限生产容器、同机一致备份／隔离SQLite恢复与journal巡检已验证（见journal§12–13），但异地灾备／外部告警、完整发布及删除保留策略仍缺；旧`drainOutbox`仍从当前库捕获，不能代替新路径。§2.24已有作者发布请求的只读分发状态，§2.25已接作者追踪UI并独立浏览器验证；§2.26已串接浏览器到实际共同业务与自有R2；[冻结模式旧玩家读取面已关闭](vps-editor-readiness.md#47-后继冻结模式关闭旧玩家读取面frozen-player-surface-1)，不再通过旧VPS接口提供未确认的本地正式数据；§2.27已补管理员上下架／限制的永久分发关联，§2.28已接追踪界面并验证实际管理员浏览器操作；§2.29已有删除栅栏请求关联，§2.30已接自己的游戏删除追踪界面，§2.31已接管理员跨作者确认；§2.32已有尚未挂载的固定准入客户端，§2.33已验证其实际浏览器取数，§2.34已有未挂载的运行包／Blob URL装配及现有world加载器验证，§2.35已接正式环境、共享detached新局装配和独立发布引用，§2.36已有目录／公告取数客户端，§2.37已有固定准入与既有存档仓储的显式适配（非App／确认删档界面）；玩家基本入口与公告展示后继见§2.53；版本清理、真实HTTP／TLS／服务配置／恢复和物理内容清理尚未闭合；已有pending不能当新版本确认。不是点击发布后就自动可玩。
2. **玩家入口适配**：§2.53已把当前目录／公告、章节／势力及正式恢复组件挂入公开boot与标题，并验证实际导航及签名准入到同一App。旧[playapp](../web/src/editor/playapp.js)只保留旧模式实现，不是新标题的正式路径；manifest内历史URL仅作校验元数据，新客户端按固定票据／角色取数。§2.54已提供旧正式版的服务端只读元数据证明，§2.55已接客户端字段与版本关系校验；最新政策已取消旧档单独删除确认：§2.69接入自动旧档清理及新版保存原子清旧档，§2.70接入旧凭据拒绝与宿主退休；当前政策发布浏览器联合复验已在§2.72通过（非真实云），旧服务端数据回收及生产放行仍待完成。
3. **完整资源与版本合同**：本索引锁 pack JSON／章节／pack资产／公用画像，§2.6已接独立publisher的默认读验；可信静态四季／战术／音频等仍按原 manifest 的固定资源路径供应，§2.8新增部署字节清单，§2.9已有独立全包字节预检，§2.10已有经进程内HTTPS验证的读取端口；显式CLI已有静态配置，§2.59又核实际安装源码／束与该配置pin，§2.61合并单次分发内的整包扫描而不缓存成功，§2.62接入启动前归档写入，§2.63增加整包验证后的独立程序登记，§2.64已接受登记约束的只读程序资源HTTP，§2.65新增尚未挂载的当前程序入口处理器，§2.66补四张战术图的固定查询别名，§2.67已接季节图基址，§2.68已在本地挂正式路由并验证旧页面迟到资源；已加载代码证明、两端核心兼容／全依赖闭包及迟到资源认证仍未完成；私有素材库曾在§2.60刷新，当前五项消费者后继再按§2.71审差异并建立新registry；旧身份／对象保留，不能代替其余闭包。§2.40已有受信正式环境到共享App及本地保存的显式入口，§2.41已消除测试import map依赖并统一普通静态模块路径，§2.42已验证实际发布／reader准入到共享App及原生IDB的联合链；§2.44已有真实宿主版本警告／删除确认组件及联合链验证，§2.45已有共享App保存窗口／写入前复查的显式接缝；§2.46已配置本地同源只读API／Static Assets入口，§2.47已有固定八图的浏览器静态端口并接实际测试App，公开选择准入及实际初始页面导航已在§2.53接入，§2.57已有独立受信静态包归档基础，§2.58已验证脱离原包的固定GET冷读，后继§2.64补资源HTTP、§2.67补浏览器绑定，§2.68已验证受控软件切换后的迟到图像／数据／音乐路径（不冒不同引擎兼容）；仍须核验真实云绑定／密钥及完整旧静态资源保留，不能以本地运输桥代替生产证据。
4. **VPS／Cloudflare 生产装配**：共同应用与实际 Node HTTP 已完成[本地适配切片](vps-editor-readiness.md)；后继[Node冻结构造选项](vps-editor-readiness.md#44-后继node冻结发布构造选项node-frozen-service-1)已接受信启动参数并通过两模式HTTP及实际浏览器发布链复验，显式冻结CLI的本地装配见上述§4.8，后继受限生产Compose／真实HTTPS认证及同机备份恢复见journal§12–13；完整发布仍未就绪，sidecar／局部HTTP通过不能替代该生产收据；[根 Wrangler](../wrangler.jsonc)已在§2.46配置本地reader main／桶binding与API路由，实际云绑定／秘密配置及部署尚未验证。本批不修改云资源或现有 origin，不能直接把新 reader 上线当全链完成。

早期R2本地切片未改共享App；后继§2.38／§2.40已修改`web/src`的保存／入口／退出所有权并重卷Trial束，不改原规则公式。§2.17已把共同schema严格冻结扩为50表。§2.11触及共同应用，已增加实际Request发布、Node HTTP及workerd schema验证，不以此冒浏览器或R2联调。后续触及前端／保存／完整共同装配时必须按项目升级验证。静态检查单独记交付，不把局部通过写成完整 R2 接线、生产删除、VPS 迁移或部署成功。静态打包前序证据见[Workers 审计](workers-deployment-audit.md)，部署边界见[部署指南](deployment.md)。
