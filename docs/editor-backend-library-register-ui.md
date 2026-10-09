# 固定素材库运维登记界面（E-01-BACKEND-LIBRARY-REGISTER-UI-1）

本切片为[既有固定可用库](editor-backend-available-library.md)的实际管理员GET／install API接最小工作台入口。可在工作台明确信息查询与验证登记，不再要求手工调用该API。操作员仍需独立`--stage-library`装配；不是后台创建云资源或作者上传。Root仅固定static import／`/catalog.js`，client安装／identity／busy后controls重绘和leave gate，index固定区；新catalog模块及显式测试。业务API／真实目录、认证、SQL-R2／私有素材／draft／stage及375玩家不改。451声明／446旧保护。

## 事实、操作与恢复

- 只有正常改密后的真实管理员展示该区。显式GET显示服务definition、staged root及SQL registered事实；固定registry／profile、400角色、mode和20unknown。GET是目录元数据，不新核全媒体，不证明原键执行或运行资格。实际权限／完整byte核验与提交仍在既有服务。
- 先明确查看完整descriptor，再明确确认，以固定空body `{}`＋一次生成永久key提交。可选sessionStorage只留userVersion／registry／definitionDigest／root描述／key／unknown或confirmed关联，不留cookie／CSRF、作者文字／完整源或资源bytes。它不是权限、epoch、服务收据或SQL操作权威。
- 初始／reload／身份变化不自动GET或POST，不凭registered事实把未知键标成功。丢回应或无效200仍保unknown；先明确GET，descriptor／当前actor版本及原关联一致，才可明确原键、原空body重放。如果服务尚未接收，可能执行原请求；不是查询键API的伪装。
- 收到且核对该次install回应，才本地显示confirmed；服务器source_operations永久收据仍是权威。GET里registeredAt／root／rowRevision与original request的归属不同，不互推。同键重放重新核全部实际R2，成本高、无云SLA承诺。
- broken储存或actor版本／definition／root变动禁重放和新键。userVersion仅是保守UI关联，不替代真实principal／epoch；actual password handler成功更换身份后保旧关联但禁重放，真实新会话原键409、旧cookie401由服务确认。
- 明确放弃需确认，仅删本机关联；不撤销SQL操作、回滚登记或物理删除。取消保留原键；确认后必须重新明确GET再明确建立新请求，不悄悄换键。storage读写不可用fail-closed。
- async返回检查actor引用／代次；pagehide清本次view并拒晚回应，原键关联保留。unknown／broken有原生beforeunload保护，站内logout／改密另走canLeave。全局busy解除后重绘本区按钮，不让通用enable覆盖细粒度禁用。
- 服务install的空body由既有固定运维配置取得root；UI无法将GET描述作为服务端条件参数。程序／bootstrap部署变更仍须独立控制；错误回传或冲突不自称旧请求成功。没有新增Root写前置条件或并发部署事务。

## 当前实际验证

独立`backend-library-register-ui-session-r1`、随机工程配置／owned OS temp SQLite-R2／loopback HTTPS／fresh Chromium。白OS子环境及已安装依赖、wx新日志／截图／原源，不安装或改SDK／trust。最终`ui-r3`十组通过：13记录Node调用、12浏览器library status GET、4 install POST，正文均`{}`，键序列原A三次及明确新B一次；不是全部HTTP／认证计数。

1. 默认未装配，明确查看后install禁用；无自动GET／POST。
2. 实际停止／重启并装配400角色，但未登记；取消首次确认不造键或请求。
3. 真实install200已提交而浏览器网络丢失，unknown原键保留；实际native beforeunload确认后reload无自动请求，明确GET仅示registered事实，原键同body重放200，SQL登记root／revision／时间同。
4. 再次真实starter重启，same owned SQL/R2／原键／登记事实保留；reload不自动恢复权限或请求。
5. 实际200后的count399与另控改staged root响应分别禁用／禁重放；原键保留，明确正确GET可恢复。
6. 真实同key200回应mode被注入伪runtime值，不能confirm，保unknown和先GET门。
7. 真改密handler更换identity／版本，旧关联即使GET后仍禁；真实新会话旧key409／旧cookie401。
8. 明确放弃cancel保key，accept仅删本机关联、须新GET才明确新key；SQL登记事实同，无新Game。
9. corrupted储存下次Realm恢复broken后fail-closed；明确GET不修关联，下一次实际beforeunload仍提示。另标synthetic pagehide：实际200之后delivery之前清view，迟到事实不装；不是实际BFCache／设备事件证明。
10. 真独立author无该区，受测IDB0／外网0／未解释console及page错误0；游戏列表仍空，wx截图显示非运行库事实。

同当前产品SHA的独立`compat-r4`保原[只读库UI](editor-backend-library-ui.md)十流程：17 Node／17库GET／0内容POST／3完整库附件（含11,196,244B FLAC）＋1当前data-stage附件、七坏头／bytes／长度拒／改密与author等。owned派生producer仅改artifacts路径／449−3保护计数、追加catalog源SHA及相同helper相对路径；原十流程、期待和预算精确逆差相同。不是全阶段／后台／规则回归。

## 两次失败与受控定位

- **r1不是通过**：先有站内canLeave但缺新模块原生beforeunload。测试为reload挂`once(dialog)`未触发，下一confirm又挂第二accept，出现`Cannot accept dialog which is already handled`，uncaught callback掩盖完整结果。保源码／日志／metadata；加真实unknown／broken beforeunload，以及awaited Promise.all action/dialog和类型断言。独立route-owned exact-hook native probe验证dialog/listener机制，不称后台权限证据。
- **r2不是通过**：八组后，测试把sessionStorage写坏即期待当前Realm的confirmed闭包变broken，等dialog10s超时。controlled exact-hook事件probe实测「confirmed内存＋坏storage」不拦、unknown内存拦；坏storage需下一Realm才恢复为broken。仅修测试时点：第一reload无未知内存提示，下次Realmbroken恢复＋明确GET后再reload必须有原生提示。保失败及源码，不改产品／预算，不拼八组部分成绩。
- 最终r3独立fresh全十组，r4兼容另独立原预算；正确await.member括号不改坏，不禁规则／清缓存／延timeout／改期待碰绿。

Jev人工3824B工程摘要只作change advisory，preview审最终state后发送，不传源码、原资源、秘密、用户状态或完整日志，不作原机制／权限／oracle／完成门。支持主动LSP／session-all、syntax、Root/client/index精确逆差、82 imports／78旧import保护、文档链接／73Q及所有SHA另签；unsupported／unavailable／inconclusive不称clean。

## 剩余及安全边界

全部作者权限／个人资料、可写素材／实体／章／地图CRUD、G127/255、全消费者／统一RuntimeManifest／认证Trial／发布／玩家存档／物理删除备份及完整桌面工作台仍缺；不关闭完整E-01或主goal。无commit/push、cloud create/deploy、用户profile-IDB／DOS-SAVE、真实秘密或共享清理。
