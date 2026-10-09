# 独立后台：真实管理员完整复制入口

## 范围与启动

E-01-BACKEND-COPY-ENTRY-1按用户m6873新建后台、m6911独立域名／不影响玩家授权实施。沿用独立`server/wrangler.jsonc`，根玩家配置和375玩家输入不改。这里只交付固定来源登记＋管理员完整副本＋自己的游戏摘要；不是普通minimal/中立模板、草稿编辑、共同编译、Trial、PNG/头像/Q69、发布或完整目标完成。没有云资源创建、线上部署、commit/push、依赖安装或全局信任改变。

仓库根运行：

```bash
node tools/start_editor_backend.mjs --init
node tools/start_editor_backend.mjs --stage-source
# 后续无需重复stage：
node tools/start_editor_backend.mjs
```

本机入口`https://127.0.0.1:8787/`，自签名工程证书仅本次入口；不安装全局证书。初始化不回显密码、以wx创建私密`.dev.vars`，既有文件不覆盖。SQLite/R2/公开来源descriptor在独立`server/.local/`；不是玩家存档。正式Cloudflare是另域名HTTPS443，不是公网监听8787；线上权限、CPU/内存/运行预算仍另验。

`--stage-source`是**操作员显式**本机装配，不冒管理员登录：共同固定loader先核两manifest＋38世界资产＋entity资源共41角色，57,943,821B；最大43,308,095B源按1MiB分块，实际R2条件创建／读回长度和SHA，存在对象亦实际读回核字节。两个Text manifest与固定Web原byte一致，Git -text保护，不重新JSON格式化。不读取DOS/SAVE、用户profile/IDB或真实云秘密。不覆盖不同既有descriptor，不自动latest。R2 stage与`.local/source-root.json`都不赋权、不自动批准SQL来源。

以真实管理员`tianyi`登录，首次强制改密；进入“完整複製內置”刷新来源并显式登记。只有真实管理员、正确Origin/CSRF、永久key和逐await/提交权限复查可核全部R2字节后登记。然后输入名称/简介，预约，查询或明确运行/取消。副本目标UUID由服务分配；客户端不能传目标ID/来源路径/根对象。新管理员完整副本只属于自己，不越权他人或编辑原件。

## HTTP 与持久操作

所有私有接口使用原Secure/HttpOnly/Strict/host-only/API-path cookie、精确HTTPS Origin、CSRF、强制改密及epoch门；Root仅有R2绑定才装配实际catalog/copy/metadata/blob端口。没有R2/来源时拒，不退旧无认证harness。

| 接口 | 行为 |
| --- | --- |
| GET `/api/admin/source` | 当前固定定义、配置的stage descriptor与真实SQL登记摘要；这不是每次GET全R2复核的运行证书 |
| POST `/api/admin/source/install` | exact `{}`，只取服务配置固定来源；逐角色实际R2验证＋同SQL来源登记，不接客户端root/path |
| POST `/api/admin/copies` | exact registryId/name/introduction，永久Idempotency-Key预约目标/名字，202；规范名称/简介、不同内容同key409 |
| GET `/api/admin/copies/<operation-key>` | 真实管理员自己的持久状态／已提交第一版结果；不靠DTO或临时Map权限 |
| POST `…/run`、`…/cancel` | exact `{}`＋独立command key＋quoted positive If-Match；缺条件428，写入陈旧412，key不同路径/方法/条件409；实际品牌claim/run或取消 |
| GET `/api/games` | 当前主体自己的真实已落库游戏摘要；不是完整编辑工作台、资源或草稿读取接口 |

`copy_http_commands`只永久绑定命令请求条件，不是执行/成功收据。pending/running的实际变更仍CAS；已经committed的run返回经过真实immutable第一版/origin重核的既有结果，已经canceled的cancel返回自己取消摘要，是不变更查询，不宣称每个新命令头会执行或对终态强制陈旧CAS。复制、source与认证的同key namespace冲突同步检查；来源验证含await，额外trusted operationGuard在SQL实际提交复查，真实source-install/创建账号竞争只有一namespace提交。

复用[同SQL完整复制事务](editor-backend-admin-copy.md)：baseline/候选完整源R2实际读回、共同full copy/source records/结构＋限定差异；目标/名字/origin/baseline/对象refs/永久结果一次SQL提交，非marker。未开放普通draft/save/upload/compiler/publish；原件不能直接编辑。来源目录和图片字节不自动成为PNG/运行/消费者闭包证明。

运行当前使用**300秒有界租约**，不依赖请求内timer续期或waitUntil成功。入口r2/r3实测原60秒到期（约65秒，running/gen1/rev2，lease已过期且无心跳），采用既有内部完整复制夹具的300秒上限；过期/epoch/代次仍拒。该值不是五分钟云CPU/内存SLA；超限可以查询，待实际stored deadline后重新claim，不换目标/记录ID，也不自动无条件重跑。

页面仅按真实actor.id保存operation key到sessionStorage，无密码/cookie/CSRF。不确定预约回应保key并先查询，不能偷偷新建目标；只有明确权威404才允许清可选key。pending预约跨同窗口reload与**实际后台关闭/重启**可查询同目标，再由新私有cap执行。名称/简介textContent；当前“运行中”busy禁用本页按钮，非实时进度／同页主动中止保证，另一受权窗口/API可以取消；完整工作台待接。

## 重复关闭超时：原因、修复及失败纪律

遵守用户m8690：重复失败停止猜测重跑，先分析、受控复现、修复后完整验证。

- entry-r1在真实HTTP前因MF ESModule规则只有`.js`无法载入共同`.mjs`失败；归档后只增同类匹配，五旧测试同样只有模块规则扩展，不改期待/SDK/权限。
- entry-r2/r3是上述实际租约失效，不吞错误；保原worker/测试/探针。原timer未执行的具体同步分段原因没有闭合，不添加猜测。
- entry-r6是600秒ETIMEDOUT/null/SIGTERM、stderr空，原因未知，**不追认为下述原因**。entry-r8也600秒，停在pending浏览器关闭；同源关闭探针closeprobe-r1定位`frontend.close`之前、非Worker.dispose，持续raw1/secure1/activeResponse0。
- 独立旧helper TLS负控idleclose-r1：真实自签名TLS secureConnect、**不发送HTTP**，旧close保持未完成；仅销毁自有客户端后立即完成。这证明旧Node HTTP关闭跟踪没有收掉该TLS预连接，不是均匀5秒超时、Worker存储死锁或云TLS证明。
- 最小修复仅`tools/editor_local_https.mjs`记录本入口实际接受的socket；明确shutdown时停止listen并销毁这些**自有**连接，共享同一close Promise，证书清理一次。不杀其它进程/listener，不改Cloudflare TLS、来源/权限/租约/存储。shutdown可中止在途HTTP，不保证其回应完成；SQL若已提交须凭永久key查询，不因回应断开删除数据。
- closefixed-r1的observer把预期远端ECONNRESET当失败，保源码/log；只改observer为close事件、记录且仅允许ECONNRESET，再实际验证TLS不发HTTP和未完成握手的bareTCP、同Promise/重复关闭/peer销毁两组。3000ms只是夹具等待门，不是产品规则。

旧失败、null signal/timeout和探针均留，不计通过，不再次盲重跑已闭合问题。原entry-r4..10共用截图路径发生覆盖：r10现有图片已保，**r4/r5/r7/r9旧pixels无法恢复**，其JSON/metas/log/SHA仍保；不伪称全图保留。当前截图按round严格自有路径，先取PNG buffer、再wx写，不覆盖；r11/r12各独立图片/SHA。

## 当前实际验证

- 旧关闭负控idleclose-r1复现；修后closefixed-r2两组通过。entry-r9/r10后修复整门通过；最后当前截图规则下**entry-r11/r12各六组40真实Root HTTPS请求＋fresh Chromium**通过：真实source注册、授权/Origin/CSRF、namespace竞争、预约/key/name/CAS/取消、两个共同完整副本、immutable结果/own摘要、已提交与pending的真实launcher重启、HTML安全/IDB0/outside0/pageerror0。没有fixture内容API。
- 修后当前copy-r2八/metadata-r2八/blobs-r2九/auth-r2七/catalog-r2八/jobs-r2九/ids-r2十一整门，以及fresh实际账户browser-r15六组通过；395旧输入（375玩家）每轮前后SHA同。测试自身截图产物修复不改变产品，不为此重复以上七回归；不冒87全游戏或全部UI/战役。
- 最终主动warning门20路径0诊断，但outcomes为0clean/1unsupported/7MD unavailable/12inconclusive，全20未确认；矛盾“8confirmed clean”不采信，不改正确await括号。session289文件23旧warning保，无规则禁用/清缓存。实际Node/client module语法、HTML解析、精确旧差、两pinned byte/41输入、文档/Q1–Q73另验。Jev仅4545B人工工程摘要，经0redactions preview审阅后发送jev-1.13.0，只作advisory，未传源码/资源/凭据/存档/完整log。
- 静态收据生产者首轮误将旧TLS helper SHA查`sourceHashes`，实际当时仍属`protectedHashes`；查证meta字段后仅修collector并保失败源码/log，不改产品或测试期待、不重跑已经通过的应用整门。

## 仍开放

普通作者minimal与空章初始化、实体/章节/据点完整表单、认证私有draft/profile编辑、实际共同compiler执行/Validation/Trial、PNG与全部Q69消费者、发布/公告/上市/删除与备份清理、玩家registry/release/版本存档和线上运维均未完成。管理员复制入口可用不等完整编辑器或目标完成。线上独立域名、云绑定/部署和commit/push仍另需明确授权。
