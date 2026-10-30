# E-01-BACKEND-AUTH-1：独立后台入口与真实账户服务

用户m6873已明确“没有后台……适配现有部署进行实现……分配一个端口号”，m6911明确另解析后台专用域名、不影响游戏。无需用户预先建后台；新建实施授权已取得，不重复索要同一批准。commit/push/线上部署/真实云资源创建仍未授权。

## 后继限定管理状态接线（不重标本页历史）

[管理下架/解除API](editor-backend-management.md)复用当前认证/永久内容key/sameSQL而非短TTL authreceipt，不授别人私有草稿/发布；current actualRoot16检查161调用及本页原账户完整current7组61另签，角色/epoch/Origin-CSRF/body/KDF policy不改。无新账户能力/角色提升/creator禁存，完整management UI/发布-上架/registry/玩家仍缺。本页原源码/浏览器成绩保历史，不能冒当前管理API browser验收。

## 启动入口

仓库根运行（需要现已安装的Wrangler/Miniflare，不自动安装）：

```bash
node tools/start_editor_backend.mjs --init
node tools/start_editor_backend.mjs
```

第一次交互输入9–128字符、同时包含大写字母、小写字母、数字和符号的初始密码（空白不算符号），不回显、不放命令参数。`--init`只用wx建立私密`server/.dev.vars`（初始密码和随机256bit安全key），不覆盖已有配置；启动不生成通用公开密码。唯一管理员为`tianyi`，首次登录必须改密。作者创建/重设使用配置的统一初始密码，通过安全管道交付，不从页面/API显示；账户名不可改。

本机入口 **`https://127.0.0.1:8787/`**，Ctrl+C只关闭自己服务；占用端口报错，不杀其它进程。开发TLS为本机自签名；浏览器首次访问可能显示证书提示，不修改系统/浏览器全局信任。局部自动化只在新隔离context忽略该证书。后继[大源快照](editor-backend-snapshots.md)因本机workerd原生TLS正文中断改为NodeHTTPS入口→own WorkerHTTP随机loopback端口，已装OpenSSL仅生成own临时一天工程证书，保持真实Origin/CSRF/Host/body限制，线上TLS与玩家不变；原失败全保，不声称根因闭合。当前账户/launcher fresh browser已重跑。数据保存于`server/.local/metadata`，不清空重启；私密设置与持久化目录均Git ignore，不应上传截图、密码或数据库。

线上使用**后台专用域名的HTTPS443**，不是把8787当Cloudflare任意公网监听端口。独立`server/wrangler.jsonc`及Worker/SQLite Durable Object，`EDITOR_ORIGIN`部署时配置为该域名的精确源（scheme/host/port）；秘密走Worker secret机制。本轮没有部署或创建云资源。原玩家`wrangler.jsonc`、dist打包、游戏域名/静态入口不变。禁止给旧无认证`editor_server.mjs`开放互联网或称它是正式服务。

## 已实现的账户/API边界

- [Durable Object SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)是权威，users/sessions/双维login_rates/operations同事务域；写入用同步transactionSync，密码KDF/随机数/HMAC/加密在事务外准备，提交再复查会话epoch、停用和CAS版本，不跨网络await事务。
- 用户最新密码强度决定：初始及新密码为9–128个Unicode码点，包含ASCII大写／小写字母、数字及至少一个Unicode标点或符号；空白不算符号。前端最短长度、错误提示、共享后端及本地初始化一致；已有密码仍按原哈希验证，不强制重设。
- 标准scrypt N32768/r8/p3、随机128bit盐、32byte摘要、常量时间比较。初始/新密码拒NUL及孤立代理，不做静默Unicode归一化。参数参照[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)；实际workerd KDF已跑通，约210ms仅本机观测，非线上CPU/并发/SLA认证。
- 256bit随机会话，只存token SHA；host-only `__Secure-dragon-editor` cookie，Path=/api、Secure/HttpOnly/SameSite=Strict。所有写请求精确Origin与CSRF（登录仍精确Origin）；不给跨域CORS权限。绝对8h/空闲30min、账户5次/来源30次每10min默认工程策略，可显式配置正整数；SQLite持久，不重启归零。禁用/恢复/重设/改密递增epoch并撤销旧session，恢复不复活旧cookie。
- 受限改密态只允许session/password/logout。管理员只能创建author、列账户、停用/恢复/重设；作者不能跨权限管账户。管理员自己不能停用/重设，正常改密可用。不存在任意提升role/改account API。
- POST16KiB流预算、fatal UTF8/JSON及精确字段。入口先捕获有界POST，再交给DO，避免拒权时遗弃未读RPC输入而截断HTTP错误响应；事务内仍重新校验，不弱化Origin/CSRF。大输入413、孤立代理密码422有真实HTTPS证据。
- 幂等key必须16–128ASCII、HMAC请求摘要不存可字典攻击的密码裸摘要，HKDF/AES-GCM密封结果，AAD绑定actor/key/requestDigest；同key异payload409，同key并发只提交一次。重放核epoch/期限；正文Cookie不以明文存SQL。登出后的旧cookie401，不称全客户端恢复协议已完成。
- JSON DTO无密码/hash/rawtoken；public UI只有繁体登录/改密/管理员账户管理、所有文字textContent，CSP self/no-store/nosniff。没有把既有草稿工作台或无认证API挂到此Worker。

| 方法/路径 | 能力 |
| --- | --- |
| GET /api/health | 当前账户阶段/初始化状态，不承诺编译或发布就绪 |
| GET /api/session | 当前会话、受限态、CSRF |
| POST /api/auth/login /password /logout | 登录、改密换epoch、登出 |
| GET /api/admin/accounts | 管理员安全账户DTO |
| POST /api/admin/accounts | 管理员创建author |
| POST /api/admin/accounts/:id/disable /reset | 目标expectedVersion CAS/会话撤销 |

## 实际验证与失败记录

[I/O先登记](editor-local-validation.md)。独立后台测试不塞进旧地图87入口冒全量；不读取原DOS/SAVE/用户profile/正式IDB/云凭据，不安装依赖。旧293声明源/82资产375SHA各轮前后保，不运行prepare_deploy或删除共享dist。

最终`backend-auth-session-r1/auth-r11`真实HTTPS8787/workerd/SQLite七组：Origin/CSRF/强制改密、两作者/唯一管理员/目标CAS、同key并发与重启后receipt/session、登出、只读自己SQLite检查盐/摘要/密封结果、持久双维限速、实际时钟idle与absolute期限。额外3非法Unicode/NUL密码422及超预算413；不是mock认证或进程Map。

最终`backend-auth-browser-r5/browser-receipt.json`真实启动器HTTPS8787/两个fresh Chromium context六组：init拒覆盖、cookie属性/凭据输入清空、author实际登录与admin控件隔离、陈旧UI409保目标/手动刷新/取消确认停用与恢复不复活/重设强制改密、启动器dispose/reopen SQLite保账户及两方登出。IDB getter拒0、外网0、pageerror0；预期console仅session401、明确陈旧disable409、favicon404按路径登记。local自签名TLS不认证线上证书配置。

保留r1模块规则配置失败、r2Node Header Unicode非ByteString夹具失败、r3把内部SQLite数量当1的夹具错误及修正前exact文件。r4 API先通过；浏览器r1陈旧账户版本未刷新导致预期CAS409而等待恢复按钮失败，r2补实际409和显式refresh后通过。Unicode检查补充后的r5/r7本机Undici/native崩溃、r6进度探针生成语法错、r8/r9实际HTTPS重现首个Origin403响应中断，均不pass；定位后修入口有界RPC转送/r10及最终browser重新全部执行，未靠重试/删检查/禁规则掩盖。全部失败、暂态通过与生产旧byte归档保留。r10/API与r4/browser通过后等价消除三个新嵌套三元警告，最终r11/r5两门全部重新执行。

最终主动16路径outcomes为3clean/1findings（仅37条正确await括号hint）/1unsupported client.txt/4unavailable/7inconclusive，三条新增嵌套三元警告等价展开并复验；工具矛盾“8confirmed clean”不采信。session271文件9既有warning保，不禁规则/清缓存。client.txt另以Node module语法及真实浏览器执行核验，仍非LSP确认。原配置与375输入保全、收据/图片/生产者SHA另封存；空诊断、unavailable/inconclusive不冒clean。Jev仅人工无私密工程摘要/advisory，不发密码、数据/图片/完整日志，不作安全或完成门。

静态收口的前两轮生产者分别错写migration标签`v1`（实际`editor-metadata-v1`）和探针文件名`auth-r6/7`（实际`auth-probe-r6/7`）；完整脚本与失败log留存，不改产品配置迎合断言。第三轮重新跑全部新语法/隔离配置/375SHA/最终测试绑定/旧失败保全/文档链接与Q1–Q73，封存于`backend-auth-session-r1/static-receipt-r1.json`。Jev仅经本地3931B人工摘要preview核验后发送`jev-1.13.0`，无凭据/资源/快照/源码/完整log；结果只作工程advisory，不代上述执行或完成门。

后继[同事务域游戏元数据基础](editor-backend-metadata.md)增加worker装配与只读列表；本页r11/r5/静态SHA保为历史账户切片，不当当前新增Worker字节证书。后继已完整重跑auth-r12与fresh browser-r6，真实Blob/复制/保存写门仍未开放。

## 后继：草稿编辑活动的空闲时限

完整草稿后台回归r89在武将保存等待超时；补充不含凭据／正文的失败记录后，r90确认该请求收到401 `SESSION_INVALID`。路由审查发现读取草稿、查询保存操作与保存草稿未像其它已认证编辑请求调用 `touch`，连续编辑仍可能达到上次续期的空闲截止。现三入口在身份／强制改密／Origin-CSRF等既有入口检查与对应路由语法检查之后、异步服务工作之前，复用既有 `touch`。仍为配置的空闲时长，且 `MIN(absolute_until, now+idleMs)`；不增加绝对寿命，不在异步返回后复活过期／撤销会话，私有服务的所有权／epoch／提交边界检查不变。

新增 `tools/verify_editor_draft_session.mjs`：真实共同Request认证＋SQLite、可控时钟与显式草稿端口替身。负控先复现成功读取未续期（`draft-session-before.log`）；修后27项通过，逐三路验证活动续期、越过旧idle仍可继续、绝对时限截断、idle／absolute过期和epoch撤销不调用端口、不改会话，禁用／强制改密仍拒绝；错误查询、缺If-Match、错误CSRF不续期。这不是草稿持久化／编译或真实登录证明。

`verify_editor_backend_draft_ui.mjs` r91 **combined** 在真实Node SQLite／FileBucket、隔离HTTPS、全新Chromium通过21范围组，包含真实登录／改密／异作者、未知回应原键恢复、CAS412、资源保存、章节创建／改名／删除、复制章据点及武将保存、后代独立复制与删除。源码收据补入 `server/editorapp.js`，IDB访问0、外网0，预期HTTP失败单列；日志 `current-draft-combined-r91.log`、截图 `editor-phase/backend-draft-ui-session-r1/ui-r91.png` 均在 `.dragon-analysis`。r89/r90失败保留，不拼作通过。没有任意地图／角色完整UI、Trial／发布／云端或完整目标完成声明；未部署。schema两门仍23源／50表／49索引／343列／4FK，未改DDL。

### 素材任务／固定库读取续期后继

同样的遗漏存在于 `#getStageRead` 与 `#getLibraryAsset`：现各自在既有查询参数检查之后、异步读取之前复用原touch，所有返回前的服务capability／Root身份复查保持不变。没有新增自动保活、修改idle／absolute策略或开放素材运行准入。时钟测试扩展为五入口45项，复用真实类的路径matcher，数据服务仍为显式替身；首尝试错误假设未配置实例有stageApi而失败，改用类prototype的原匹配器后，负控实际复现未续期（`resource-session-before-r2.log`），修后通过（`resource-session-after.log`）。

真实Node SQLite/FileBucket＋隔离HTTPS＋新Chromium r92 combined通过17组（`resource-session-stage-r92.log`），源码收据纳入editorapp：认证／旧epoch拒绝、六任务、图库398项／20缺引用、完整下载SHA负控、据点／地图／武将与头像操作及异作者隔离；结构GET独立重建44输出／26缺项，四项准入仍false。截图 `editor-phase/backend-stage-ui-session-r1/ui-r92.png`。日志及截图位于 `.dragon-analysis`，不是生产、全资源闭包、Trial或完整编辑器完成证明；未部署。其它入口仍按各自范围审计，不将本节称为全路由续期矩阵。

### 游戏清单／复制来源与操作查询续期后继

另六入口原先成功返回也不续期：自己的游戏清单、管理员游戏清单、原版来源状态、固定库状态、管理员复制操作查询、普通作者创建操作查询。现在仅在各自同步权限与数据读取成功之后复用原 `touch`；管理权限不足、数据端口拒绝、固定库查询语法错误均不续期。没有移动所有权／角色检查，也不增加自动心跳、绝对寿命或写入授权。

`verify_editor_draft_session.mjs` 扩展为103项：真实共同Request、SQLite、原清单服务的角色检查与可控时钟；来源／复制数据仍为明确替身。六新增入口各验证续期／越过旧idle／absolute截断及所有撤销拒绝，另验证五角色拒绝、错误固定库查询和四数据拒绝不改会话。负控 `list-session-before-r3.log` 实际复现未续期；前两次及初次修后测试因读取替身提前启用却没有源写入DDL而干扰既有POST案例，属夹具失败，已隔离读取替身与原写入端口，未改产品迁就。最终 `list-session-after-r3.log` 103项通过。日志均位于 `.dragon-analysis/editor-completion`。shell65项及两个schema门通过；未重复执行r91/r92重型浏览器链，不把历史收据算作新增代码的联合回归。发布／管理分发查询和结构集合等其余入口仍需各自审计，不称全路由矩阵完成；未部署。

### 发布／管理回执查询续期后继

继续补齐发布操作状态、管理操作回执与管理分发状态三条GET：先完成原同步服务权限／回执／冻结账本一致性事务，再续期并响应。事务失败、未知操作、分发kind或generation不符仍不续期；未改变永久回执、分发状态或匿名玩家准入。负控 `status-session-before.log` 先复现原成功查询未续期；时钟矩阵扩至137项通过（`status-session-after-r2.log`），含三入口的到期／撤销边界、额外查询参数、服务拒绝、损坏分发回执及合法distribution=null分支。状态数据为明确替身，不单凭该测试证明业务权限闭包。

另实际重跑 `verify_frozen_publication_root.mjs`：44组通过（`status-session-frozen-root.log`），共同Request／文件SQLite／FileBucket／20章真实编译、两次发布、8代冻结分发、50表隔离恢复及历史索引／资源正文诊断；721次私有读取、8次根写入。既有回执权限、事务故障／回滚、只读查询不改业务数据等断言全部保留。R2为内存端口，不是云端、浏览器、物理删除或生产放行证明。以上日志在 `.dragon-analysis/editor-completion`，shell65／语法／diff检查通过；未部署。结构集合等其它未覆盖入口不据此报完成。

### 结构集合读取的异步续期边界后继

`#getStageAssets` 在原管理员、查询格式、服务已配置检查之后、进入真实 `collectFixedStageAssets` 前复用touch；所有捕获的服务断言与返回前Root身份复核不变，四项准入仍false。新增时钟测试不是伪造ready计划：实际集合编排调用显式替身库读取并跨过旧idle截止，然后由未就绪任务正常拒绝409。负控 `collection-session-before.log` 原先错误地提前401；修后矩阵144项通过（`collection-session-after-r2.log`），另覆盖异步期间epoch撤销／absolute到期只读第一段即拒绝，错误角色／额外查询／已过期／未配置服务不续期也不读。以上日志在 `.dragon-analysis/editor-completion`。shell65、语法、diff通过；本批没有重跑ready六任务浏览器链，不以历史r92冒充当前正向集合收据，也不宣称所有接口均已审计。未部署。

## 尚未完成

这是**真实账户入口切片，不是整个后台/编辑器完成**。受权草稿/复制/元数据与名称占用、R2私有对象和引用/物理删除、持久编译任务/发布公告、Trial绑定/撤销与所有App入口、registry/正式版本准入/存档政策、备份恢复/清理/运维及全部产品与原证门仍开放。旧API未因这个账户服务自动获得权限，不能直接接无认证文件harness充数。线上实际域名/资源/安全配置和部署证据留待单独获准后验证；不会为此修改现有玩家服务。
