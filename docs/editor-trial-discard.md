# E-05-TRIAL-DISCARD-1：本地App退出不结算的战术处置

**已接本地Trial主动退出；不代表真实认证、断网暂停或Q70/Q71完成。** 全任务状态仍见[工作表](editor-goal-completion.md)。这是产品4.8退出丢弃的Web工程修复，不是新增DOS机制。

## 实际改动

原`returnToTitle()`已清战略scenario/clock/RNG，但未撤销BattleView待开场代次或释放其Session与退出callback。修复只在`canPersist===false`分支先终止、禁止runtime、清其`_nativeTacticalQueue`，再调用`discardTrial()`；正常标题流程不调用它。

`BattleView.discardTrial()`要求无正式存储能力且有Trial身份；先不可逆标记/增加开场代次、active/runtime关、回调/prevClock/battle/VM/startup/display-owner/图像/scene/layers/拖放/预算等引用清除，再取消RAF与自己resize listener、清对白定时器与两处头像src、隐藏战斗UI。**不调用**正常`finish()`、`settleExit()`、native tail或display scratch的`endBattle()`；不恢复旧战略hold/速度，不写Session、六队、战果或RNG。重复丢弃无动作，之后open拒绝、直接帧入口返回false，按钮不能再排入旧Session。

原open的await后与catch已检查代次，退出增加代次即使旧图片/JSON/bytes成功或失败晚到也不能装回view。主App旧装配ticket继续用原预检；未重写规则/AI/输入→VM→A065/正常战斗finish/速度。此处丢整个Trial的display过程owner，非把正常进程scratch生命周期改成每战清零。

仅释放此App/View持有的进度引用；等待中的Promise、测试保留或同Realm外部引用、浏览器缓存/像素、DOM事件闭包不承诺即时GC/远程擦除。未移除所有按钮listener，不作DRM/安全沙箱证明。实际认证失效仍须受信后端与连接适配器安装后触发该终止入口；目前没有假认证URL或owner代替凭据。

## 验证与失败记录

入口/I/O先登记于[本地验证](editor-local-validation.md)。

- [纯夹具实际unit](../.dragon-analysis/editor-phase/trial-discard-session-r1/unit-r2.log)：48检查/4负控，真实View方法和暂态OriginalBattleSession，迟到success/reject、已活动Session、重复/重开拒、非Trial拒接口；原Session/RNG快照不变，结算/回调/display commit为0，IDB getter0。presentation stub而非完整战斗/像素等价。
- [fresh实际App](../.dragon-analysis/editor-phase/trial-discard-browser-r3/receipt.json)：两新页pending/active夹具、共享生产App/returnToTitle及私有fixture延迟真实PNG；退出清原生队列及owned引用，释放资源不复活，Session与规则RNG不变、无settle/tail/commit/IDB访问，console/page错误与越权请求0。只有预资源presentation被stub；不是全战、正常settlement/真实权限或网络策略。截图[pending](../.dragon-analysis/editor-phase/trial-discard-browser-r3/pending.png)/[active](../.dragon-analysis/editor-phase/trial-discard-browser-r3/active.png)。
- 浏览器r1真实失败保留：fixture未await原`beginNewGame()`的Promise拒绝而断言restart失败；仅加await后r2通过。格式/安全顺序定稿后r3及完整轮重新实跑，旧r1/r2日志/目录不覆盖，不算产品回归通过。
- [新完整显式串行轮](../.dragon-analysis/map-migration-2/trial-discard-machine-r1/receipt.json)：2026-10-02T10:22:14.897Z–11:00:57.338Z，**71入口全部实际exit0**，164已声明源/current39/作者2前后SHA同，日志各签SHA。此前64入口加连接core/monitor/events纯与browser/真实rule-boundary、discard纯与App共7新门，无旧绿色拼接。五退休road skips不算通过，Web同引擎固定路径不是CPU/完整战役认证。164是显式清单，不称所有生产/import闭包。
- [交付静态](../.dragon-analysis/editor-phase/trial-discard-session-r1/static-receipt-r2.json)另签当前源码语法、71日志、archive82保全、文档/链接/diff/HEAD及实际Jev工程摘要。LSP不可确认不写clean：5JS两hint（旧main promise包装建议、新fixture条件body spread仅省略未提供body，保留已审有界语义）/3push-only inconclusive，无confirmed-clean；5MD unavailable；session-all204文件保7个既有warning（两旧parse路径、一安全控制码regex、四旧offline helper重复）。未清cache/禁规则/改全局配置。

## 仍未完成

[连接核心](editor-trial-connection.md)和opt-in规则时钟仍未装进真实Trial；认证协议/session epoch、所有mutating入口/异步接续、暂停与有效重连、401自动触发终止、私有资源/完整Q69依赖闭包与真实后台仍待接线及验证。不得因本处主动退出成功称完整任务一。无新提交、push或部署；HEAD仍20692d7，现47e358/default及历史原件/副本/存档不变。
