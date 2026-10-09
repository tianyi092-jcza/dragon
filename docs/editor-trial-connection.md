# E-05-CONNECTION-GATE-1：连接能力核心与注入式探测协调

**已实现纯客户端核心、独立窗口事件adapter及随后opt-in真实规则计时边界；尚未安装到真实Trial/App或接真实后端，不是Q70/Q71或E-05完整验收。** 产品依据[Q70/Q71](game-editor-design.md#48-草稿测试运行q67q71确认)及[工程§7](game-editor-technical-design.md#7-草稿试运行状态机)，非DOS机制。不重复日期、地图、单章服务或资源库存；原Trial/正式匿名游戏的实际行为本轮不变。

## 实际接口

- `trialconnection.js#createTrialConnectionGate`复制并冻结准确10字符串字段：`trialId/snapshotId/ownerId/sessionId/authEpoch/gameId/draftRevision/snapshotDigest/chapterId/manifestDigest`。草稿序号按规范十进制大数串，不转换Number；epoch是opaque exact，未来认证adapter须明确映射后台真实类型。字符串256限制仅工程输入预算，不是原容量或凭据规范。
- 初始`paused/unconfirmed`。`beginProbe()`返回不可伪造引用的窗口内ticket，有pending即复用；代次通过内部对象身份区分，不靠时间戳/全局计数。周期探测pending本身不暂停已有运行；首次明确失败/超时、offline或页面恢复立即使能力无效。
- `receive(ticket,{kind:'valid',binding})`只有当前代次、可见且全部字段精确同旧绑定才能运行。新修订/新登录/新manifest不能复活或热换旧局。未知分类、原HTTP状态或缺字段只暂停，不擅自推断登出/删除；明确可信adapter的7种失效分类才终止；客户端exit/window-dispose只允许显式end，不从服务端invalid字符串借道。
- 终态不可逆，清核心binding/pending。`runRuleStep(callback)`仅许可时调用同步单步，不undo、不catch规则异常、不补后台步；暂停不回滚已提交前缀。这不是实际战略/战术接线，未来两个规则入口必须各自逐步检查，不可只包住一次含多步的RAF或仅设战略hold。
- `trialconnectionmonitor.js#createTrialConnectionMonitor`显式注入`probe/setTimer/clearTimer`，无默认认证URL/fetch。采用建议5秒轮询/10秒deadline；online只触发确认而不释放能力。offline使旧pending代次失效但不竞发请求，恢复需要新确认。隐藏清轮询并暂停，页面恢复重新确认；明确终止或dispose清自己的timer/abort信号。
- 超时**先暂停，再触发同步abort listener**，避免监听器在检测失败后还获准下一规则步。仅一个active逻辑probe及最多一个未abort信号；adapter应合作取消，非合作已abort工作仍可能物理存在，其迟到结果须丢弃。不能把fake transport测试当真实HTTP取消、后台不可见期间瞬时撤销或DRM。

`valid/invalid`是**受信adapter验证完成的能力结果**，不能直接由草稿manifest、自称有效的JSON或window message生成。401/撤销、epoch、Trial、manifest、缓存/no-store、CSRF/Origin/授权均仍需真实后端与协议实现。纯核心本身不是认证边界，不把本地owner占位当登录。

## 有界验证

准确I/O先登记[本地清单](editor-local-validation.md#e-05-connection-gate-1先登记纯能力核心不称真实认证)。两个显式入口使用内存身份/规则step spy与fake scheduler/transport；没有原DOS/HTTP/browser/profile/正式存档写入。source SHA绑定实际日志，旧轮保留：

- [核心unit](../.dragon-analysis/editor-phase/trial-connection-gate-session-r1/unit-r3.log)：121检查/22负控、7终止分类、IndexedDB访问spy为0；完整旧身份重连、离线旧成功/401、跨实例ticket、hidden/restored、明确失效/重复结束/异常前缀。spy步数不是原规则/RNG差分。
- [monitor](../.dragon-analysis/editor-phase/trial-connection-gate-session-r1/monitor-r3.log)：51检查，fake5s/10s、单飞、连接失败、visibility/online再确认、错修订不恢复、非合作abort迟到失效/成功不污染、dispose、同步probe抛错、终止清timer；周期运行probe超时的同步abort listener观察能力已false。
- 新4JS语法与主动LSP、session-all、文档链接/HEAD/diff及旧145声明源码/82资源SHA保全签在[独立静态](../.dragon-analysis/editor-phase/trial-connection-gate-session-r1/static-receipt.json)。不拼旧64成新66/68整轮，不跑无UI变更的无关browser；4新JS主动LSP0诊断但均push-only inconclusive，5MD unavailable；session-all保留8warning（7既有＋技术稿未改头部MD028），不为清数改规则/缓存或无关格式。

## E-05-CONNECTION-EVENTS-1：独立浏览器事件adapter

`trialconnectionevents.js#bindTrialConnectionEvents(monitor,{windowTarget,documentTarget,navigatorState})`显式绑定当前测试窗口/文档，不读取opener、编辑标签、存储或网络/身份凭据。初始可见必须确认，初始隐藏不发探测；offline立即暂停，online仅请求确认。隐藏与persisted pagehide保留窗口内状态且暂停，pageshow恢复要重新确认；避免可见性切换已发新ticket后再restored使它失效。非persisted pagehide或显式dispose不可逆结束，**先终止再清自己的callbacks**，abort listener不能获准规则步。beforeunload可能被取消，不作为终止事实。partial install失败清自己监听/计时，不移除其它监听。

先登记[I/O清单](editor-local-validation.md#e-05-connection-events-1窗口事件adapter先审io)，新增三源（adapter/Node test/browser test），旧149声明源码/82资源不动：

- [Node事件验证](../.dragon-analysis/editor-phase/trial-connection-events-session-r1/unit-final.log)：39检查/5负控、IDB访问0；fake事件/timer/transport涵初始隐藏/离线、恢复/旧失效/错epoch、两类pagehide、前置取消、编辑页/opener不参与、partial install、自己监听移除和abort先终止。此前core121/22负控及monitor51也在此轮显式串行[core](../.dragon-analysis/editor-phase/trial-connection-events-session-r1/core-final.log)/[monitor](../.dragon-analysis/editor-phase/trial-connection-events-session-r1/monitor-final.log)重验，非历史拼接/完整64门。
- [fresh Chromium证据](../.dragon-analysis/editor-phase/trial-connection-events-browser-r5/receipt.json)：19检查，真实浏览器offline/online的`isTrusted`/navigator状态、在线提示不提前恢复、另开编辑标签关闭不中断核心、原生刷新旧running fixture Realm消失，新Realm再次初始未确认/零计数、IDB0、console/page/outside错误0。隐藏/BFCache/非persisted终止仍明确是synthetic DOM事件。probe有效/失效及timer/两规则计数仍是fixture，不是HTTP认证、真实战略/战术或hold债务证据。
- [失败r1](../.dragon-analysis/editor-phase/trial-connection-events-browser-r1/failure.json)/[r2](../.dragon-analysis/editor-phase/trial-connection-events-browser-r2/failure.json)保留：console及fixture-only beacon只观测到注入persisted提示，没有原生刷新/导航关闭回调结果；不据此猜BFCache或认定实现正确/错误。最终改独立证明原生刷新空新Realm及合成事件的清理路径，**原生关闭回调可靠送达尚未认证**，没有禁用BFCache/修改用户浏览器或放宽断言叫成功。失败telemetry不发真实身份/凭据，最终移除该路由。
- 新3JS显式Biome lint/语法、主动LSP/session-all、文档/HEAD/diff与152源码/82资源保全在[本轮静态](../.dragon-analysis/editor-phase/trial-connection-events-session-r1/static-receipt.json)。新3JS无confirmed-clean：2 push-only inconclusive、browser test另有13个aux await-member hint（保留正确括号，不改成await promise.prop）；5MD unavailable，session-all此视图196文件保留7既有warning，先前MD028未呈现不当已解决。无规则/缓存/全局修改。当前仅standalone DOM接线，不导入原App/Trial入口，正式匿名游戏与既有本地Trial行为不变。

## E-05-RULE-BOUNDARIES-1：opt-in实际规则计时边界

核心新增只读`rulePermit`：运行时返回process-local代次对象，暂停/终止返回null；同代次周期有效确认不换对象，暂停后重新确认必须换代。该对象不是凭据、nonce或额外权限，不允许通过JSON/window message构造认证。新增`trialruleboundaries.js`：

- `TrialStrategicClock({gate,...clockOptions})`继承原Clock，**没有复制原日历/调度/步长/RNG规则**。effective hold是原调用者hold与网络许可/代次不一致的并集；写`hold=false`不能清网络能力。`advanceFrame/advance`在入口丢弃新代次的旧dt/墙钟相位，再依原Clock每步hold检查停住多步catch-up；`_tick`直调也拒暂停。中途已经提交的原步/待日历flag保留，恢复不重播原泵。
- `nonTrialHold`供未来所有权保存/恢复，**不能将当时effective `hold`保存后当原菜单hold恢复**，否则可能把网络暂停错误固化为外部hold。现BattleView/main仍未改用这个接口，所以不能直接宣称已经安装到App；default Clock/匿名游戏不变。
- `createTrialBattleFrames(gate,view,{isHeld})`只调用既有`view.updateBattleFrames`完整步骤；不另造战术公式。暂停/新代次/其它hold仅清scriptAccumulator，第一恢复调用不消费离线dt，保first-frame/规则/RNG/队列/启动stepper进度，随后沿原一RAF至多一帧预算执行。必须传战术自己的其它暂停判据，不能用战略clock.hold（活动战斗本就持战略hold）或把表现对白当规则暂停。
- hold回调可检测故障/换代，故**先执行回调再读permit**；busy覆盖回调及真实frame，重入拒绝。异常原样传播/保已提交prefix，不倒滚规则、重放输入或误报认证失效。已经开始的同步完整帧仍按原次序完成，网络事件不能异步抢占JS指令；这是Web能力边界，不重新解释DOS消息/设备。

先登记[I/O](editor-local-validation.md#e-05-rule-boundaries-1显式opt-in真实计时边界先审io)。[实际新测试](../.dragon-analysis/editor-phase/trial-rule-boundaries-session-r1/unit-r3.log)使用真实Clock、BattleView.prototype预算、BattleScript/OriginalBattleSession/RNG、真实mode0 startup generator：暂停保队列/RNG/快照，初次及中间未观测到的断网/重确认不吃债务、周期许可保持相位、menu hold并集、跨月已提交prefix/日历续段、多步catch-up中途停、同步换代、startup第10帧暂停后续完50帧再进入第51帧VM/输入、真实VM异常保已消费输入与RNG但不伪造失效。只有paint/panel方法是noop，规则不是两个计数spy；**该fixture为未完整初始化对象/地形的临时内存会话，不是完整战斗、mode1单挑、真实App/Canvas/原CPU认证**。两个新源+core只读getter，原引擎源未改。后续所有规则mutating输入/async资源安装/场景退出仍须分别守门。

本轮显式串行重验core/monitor/events与原clock-transition/battle-clock-hold/battle-script-VM，实际日志及source SHA与154声明源码/82资产保全签在[新静态](../.dragon-analysis/editor-phase/trial-rule-boundaries-session-r1/static-receipt.json)。旧152中仅core增加getter，其余151源不变；不拼旧64/新全门数。未安装UI，不跑假真实auth的无关browser；主动LSP及session-all的覆盖限制另记，不称空缓存全部clean。

## 尚未完成

没有服务端Trial记录/会话认证、实际HTTP status adapter、真实Trial的浏览器生命周期安装、opt-in双计时边界在App的安装/全部规则mutating入口与其它hold所有权/无债务接线、App进度销毁回调、真实IDB/私有路由安全或完整Q69共享资源认证。原页关闭不撤销会话需未来真实窗口/后端证明，本核心根本没有“编辑页关闭”事件。不能因核心终态清binding就声称App/外部transport已清对局。

后台能力配置仍只阻塞真实集成；已授权独立核心继续。无生产/AI/RNG/默认资源/草稿/live/save或后台配置变更，未提交、推送、部署。后续接线必须复核真实认证协议与两个实际规则入口，取得同引擎/新profile证据，不能给现无认证harness加假已认证接口。
