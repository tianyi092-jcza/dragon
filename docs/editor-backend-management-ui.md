# E-01-BACKEND-MANAGEMENT-UI-1 — 管理下架/解除及未知结果界面（限定交付）

## 范围与权威

依据已批准[产品Q20/管理限制](game-editor-design.md)与[技术§5.38/权限](game-editor-technical-design.md)，接既有[认证管理API](editor-backend-management.md)；非DOS机制。只增加admin公开管理界面和未知结果追踪，**无发布、作者上架、匿名registry、Trial或删除准入**。既有`server/management.js`、metadata/auth/CSRF/HMAC/CAS/epoch/audit/permanentkey所有API/规则字节保，Root仅Text import/serve新`/management.js`；client/index只装新模块/区块及所属canLeave/render，不修改原draft/stage/library/catalog/copy协议或403/409期待。

`server/public/management.txt#installGameManagement`从真实client api/authority/work/isBusy装配。admin非mustChange才显示；创作者隐藏，无他人草稿路径/正文。明确load→`GET /api/admin/games`，只投影公开名称（无正式版显示「尚無正式版本」）、公开创作者、listed/restricted/管理row；NFC作者文字不转，用textContent，builtin无写行。上架/限制描述不是实际正式版本/registry证明；列表格式/重复UUID/布尔/十进制有界核。

## 操作与未知结果合同

- 确认后**先严格持久化**`sessionStorage editor-management-operation:<actorId>`六字段tuple：actorId/publicVersion/gameId/key/action/original expected。无密码/CSRF/源/草稿输入；value exactkeys、UUID4、ASCII16..128key、version safepositiveint、两action与8192位管理row界。storage写失败不POST；无效/不可读journal阻新写，不默默遗忘。
- unlist `{action:'unlist'}`或clear `{}`、原key/quoted原If-Match，不自动保存/切latest。UIpublicVersion/generation/DTO只作旧回应处理，不授服务权限；真实actualRoot/principal/session/epoch/sameSQL仍权威。
- 网络、503/401/404/409、malformed-success全部保原tuple，不自动retry/另键/猜成功/取消。reload恢复tuple但checked重置，不自动管理POST或operationGET；原client `/api/session`/账户GET照旧。
- **先明确GET原操作**。只有exact404 `MANAGEMENT_OPERATION_NOT_FOUND`才允许再确认manual同key/body/原expected重试，且publicVersion仍同；其它404/错误不允许。GET404不是取消或provider完成证书；陈旧CAS重试仍原row，不能暗换当前row覆盖。
- success minimal exact六字段+同game/action/flags、ISO时间/十进制row=expected或expected+1（BigInt，64→65合法）；只清本机原关联，再独立GET**目前**清单。旧回执是历史事实，不当前状态、不开/回滚旧状态，不授删除。
- 停止追踪须明确confirm；只删除本机tuple，不删/复用永久服务key，不取消在途/SQL回滚。取消保tuple。canLeave接原draft/stage/catalog后，新工作流不越其它dirty/未知状态；password/logout/切换原确认顺序保。
- awaited list/POST/query回返前对捕获actor/version/generation及liveidentity再核，不能旧actor删除新actor关联或安装旧列表。真实改密保旧tuple但新version禁retry，旧epoch GET409保持未知；非空旧journal不是权限/提交事实。

## 真实执行证据

owned `.dragon-analysis/editor-phase/backend-management-ui-session-r1/`，先核管理API生产receipt **7f00bd8e/507输入113imports375玩家**及所有源/import/history/失败/document maps，wx归档允许旧worker/client/index/local-validation。其它**504输入/110imports/375玩家**逐byte保持；登记scope写111oldimports是非权威算术笔误，actual113减3=110，所有验证使用actualmaps，原登记不覆盖。独立static-r3核509输入/504旧375玩家/114imports（110旧）/9语法577链接73唯一Q/35表243列70对象，三旧源正逆delta与Root整个既有类body精确等值；文档补录后r4另重签，不拿入口数量冒全轮。

fresh **browser-r4 13检查/24Node control HTTP/9浏览器管理POST/5operationGET/11reportsourceSHA/12执行前wx源**；调用统计分立（24不含浏览器fetch、route.fetch/CDP或SDK内部）。浏览器请求本机Origin限定，actual新context/隔离SQLiteR2，无userprofile/IDB/SAVE。Root/fixture engineering Games/假snapshot/listedopaque正式指针均非正常Source/发布/匿名目录；不staging/读取R2正文或旧局资源。

1. actualRootKDF：admin初始登录/强制改密由真实UI执行；明确publiclist不读未发草稿名/builtin无写行，无自动management操作请求。author另context初始登录/改密后隐藏且无管理按钮。
2. nativeconfirm cancel：全部35表行/catalog/databaseSize、localjournal及管理POST0保持。真实UI下架同时restricted1→解除两个0、管理row2→3；其它Game列/contenttime/snapshot/names逐项保，history后另读currentrow。
3. route.fetch获得实际200并已commit后abort交付：journal保、阻新写/retry；logout取消保身份，reload无管理POST/operationGET；explicitGET原key确认历史receipt并另GET目前list。不是HTTP未发送/事务取消/全部provider排空。
4. browser在native前abort：全35SQL保持；actualGET404才解锁manual确认，同原key/body/If-Match重送成功，无自动换键。native前拦截是工具控制，不冒provider已取消。
5. afteractualcommit的synthetic ARRAY-action 200回应：UI拒malformed，原tuple不丢，actualserviceGET解决。故障在browser交付，不称native成功结果真实坏。
6. 缓存列表与另一个真实admin请求管理row交叉：原row写409；query404后manual原key-row再409，不更新expected，whole35行目录size保持；forget cancel保tuple，明确forget只local无SQL。
7. owned损坏journal重载failclosed；明确forget。另标synthetic Storage.setItem失败在POST前，没有网络/SQL，不造真实配额已耗尽。
8. pending真实成功未知操作时，明确canLeave同意后实际password handler换epoch/publicversion/cookie，旧tuple保/禁retry/GET409OPERATION_REVOKED。actual workerd重启+pageload无管理自动请求、旧关联及Game持久；明确forget后load目前list。
9. original实际账户refresh和draft/stage/library/catalog壳存在；**不是**全copy-save-stage-libraryR2或原账户7/61API的本轮重跑。两个context IDBgetter访问0/外网0/pageerror与unexpectedconsole0；已声明session401/favicon404、controlledERR_FAILED、staleCAS409、operationGET404/409有原响应记录。无原机制或玩家浏览器回归。

独立 **model-r1 26检查/2执行前wx/2SHA** 是fakeDOM/storage/APIports，非实际授权/Root。验证坏DTO/重复IDs/builtin/rowtypes、坏/拒读journal、confirm与持久化先行、wrong404不retry、actor/version晚到list/POST/query不装/不删旧actorjournal、success之后remove失败仍保未知、坏六字段/flags/range及64→65精确进位。FakeDOMtextContent赋值不是实际浏览器XSS证书，模型不代真实Cookie/CSRF/SQL。

## 失败、静态与限制

browser-r1：newcollector `p.context().cookies(origin)`按根path `/`过滤实际protected Cookie `/api`，虽然native `/api/session`200仍正确assertcookie失败，发生management样本前。仅改查询scope `/api/`，不改Root Cookie/权限。r2前9个已完成检查保（第10个密码场景未完成）：newcollector在pending改密未处理原canLeave confirm，Playwright默认dismiss，**密码未更改**，publicversion断言正确失败；仅此场景显式接受原dialog，不放宽业务。r3完整13/24/9/5通过；proactive新helper flag-argument警告，只有两初始mustChange登录都true，改独立loginRestricted/去unusedelse再r4全部fresh13场景同字符串/原status-CAS-wholeSQL/预算保。四轮12wx源/log/meta/失败/两个passedreport与图全部保，Root/UI模块每轮bytes同，无产品因测试修补/ignore/放宽1800s。

静态原生产谱系SHA/三个旧源正逆delta/Root只Text服务及整个既有类body等值、actual source/import关闭图/9syntax含两TXT module解析、577links/73唯一Q/固定35-243-70已r3独立核；r1 collector误把第10个失败密码场景当10个完成，实际failedreport9，r2 collector猜ctx变量而actualp.context()，onlycollector修数量/字面量，旧failed source/log/meta/分析保，originalpostnote partial10计数以新erratum明确撤错。新helper/native/source/权限-budget不改。最终code9路径raw unsupported2/inconclusive7，MD7 unavailable；collector单独inconclusive，confirmedClean0。session-all429文件27继承warnings35显示hint-info，非workspace clean，全部证据另签。TXT无LSP，不把语法/browser替成clean；初probe7raw clean0/findings1/unsupported2/inconclusive4，即使便捷文本称2clean也不采用。新flagwarning已修，旧cache/warnings不禁rule/清cache。6014B人工最小摘要→preview审→固定jev1.13.0advisory，无源码/游戏bytes/密码/userdata/完整log，非oracle。

完整Q20仍需正常自建Game路径、发布/上架/限制/registry-announcement交叉CAS和匿名资源；此界面不提前授完整工作台/Trial/RuntimeManifest/所有实体初始化，完整refs/native-read-body-providerCPUlegacy闭包/physicaldelete/readback-scrub410/cacheactualbackup隔离restore及其它73Q仍open，goal active。无commit/push/deploy/cloud/install/trust/共享清理，不触真实SAVE或用户browserprofile。
