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

第一次交互输入16–128字符的初始密码，不回显、不放命令参数。`--init`只用wx建立私密`server/.dev.vars`（初始密码和随机256bit安全key），不覆盖已有配置；启动不生成通用公开密码。唯一管理员为`tianyi`，首次登录必须改密。作者创建/重设使用配置的统一初始密码，通过安全管道交付，不从页面/API显示；账户名不可改。

本机入口 **`https://127.0.0.1:8787/`**，Ctrl+C只关闭自己服务；占用端口报错，不杀其它进程。开发TLS为本机自签名；浏览器首次访问可能显示证书提示，不修改系统/浏览器全局信任。局部自动化只在新隔离context忽略该证书。后继[大源快照](editor-backend-snapshots.md)因本机workerd原生TLS正文中断改为NodeHTTPS入口→own WorkerHTTP随机loopback端口，已装OpenSSL仅生成own临时一天工程证书，保持真实Origin/CSRF/Host/body限制，线上TLS与玩家不变；原失败全保，不声称根因闭合。当前账户/launcher fresh browser已重跑。数据保存于`server/.local/metadata`，不清空重启；私密设置与持久化目录均Git ignore，不应上传截图、密码或数据库。

线上使用**后台专用域名的HTTPS443**，不是把8787当Cloudflare任意公网监听端口。独立`server/wrangler.jsonc`及Worker/SQLite Durable Object，`EDITOR_ORIGIN`部署时配置为该域名的精确源（scheme/host/port）；秘密走Worker secret机制。本轮没有部署或创建云资源。原玩家`wrangler.jsonc`、dist打包、游戏域名/静态入口不变。禁止给旧无认证`editor_server.mjs`开放互联网或称它是正式服务。

## 已实现的账户/API边界

- [Durable Object SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)是权威，users/sessions/双维login_rates/operations同事务域；写入用同步transactionSync，密码KDF/随机数/HMAC/加密在事务外准备，提交再复查会话epoch、停用和CAS版本，不跨网络await事务。
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

## 尚未完成

这是**真实账户入口切片，不是整个后台/编辑器完成**。受权草稿/复制/元数据与名称占用、R2私有对象和引用/物理删除、持久编译任务/发布公告、Trial绑定/撤销与所有App入口、registry/正式版本准入/存档政策、备份恢复/清理/运维及全部产品与原证门仍开放。旧API未因这个账户服务自动获得权限，不能直接接无认证文件harness充数。线上实际域名/资源/安全配置和部署证据留待单独获准后验证；不会为此修改现有玩家服务。
