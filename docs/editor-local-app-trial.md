# E-05-LOCAL-APP-1：本地真实 App 内存试运行

## 范围与提交

用户“提交代码，然后继续”后，先提交已验证的任务二＋E-02/E-03基线为`20692d7`（未推送）；之后完成本页切片，后续改动仍在工作区。任务一整体未完成。内置844e…、compiler0.6、当前39资源和switch原样，未访问DOS/真实SAVE/用户profile，未部署或修改全局配置。

这是Web工程接线，不新增原规则结论。共享App/输入/MapView/GameBar/Clock/战斗入口仍是生产代码；不是原简化`/trial`的十天harness。新入口不经过intro/singleinstance或玩家标题存档加载。

## 实际接线

- 工作台选择已有完整章及“測試運行（新視窗）”：用户手势内同步打开固定`/trial-wait`，清opener；编译请求带准确已保存expectedRevision。成功后用固定`/trial-app`和URLSearchParams导航，响应303至`/trial-game`。被拦窗口可再次点击，不替换工作台；失败等待页不启动空局。
- `studio-app-2`保留旧构建目录；snapshot/sourceDigest/native四资源/两mini仍固定同一修订。完整副本另外捕获八个四季图资源引用，由复制时核验的不可变源取得并在编译/读取包时核URL、长度和SHA；不是运行时改取最新内置地图。旧草稿没有这些受信引用时不能开启完整App，明确要求重新复制，不回退。
- `trialapp.js`取显式game/revision/chapter并核对应身份，选择势力和原军师；`createTrialEnvironment`共享既有content/world装配，readonly身份包含chapterId。`startApp`可注入此环境，实际新局依然走setScenario/loadState/production fresh prepare及其规则初始化。仅允许该窗口首次bootstrap，不热换live世界。
- `trialpolicy.js`注入readonly无正式存档能力、七个调用即拒绝的仓储方法及空槽列表。App的saveGame/loadSave/beginSavedGame入口拒绝；GameBar两行显示“停用”，settingsClick和直接dialog入口也拒绝。普通玩家默认启动仍使用原仓储；没有删除/迁移/覆盖旧档，也没有另建IDB来暂存Trial。
- 独立窗口只持有内存。草稿再保存/编译不改旧局，需新窗口测试新快照；关闭编辑页不停止已打开的本地Trial。游戏结束复用原App清理continuation/UI/scenario/clock，再丢弃RNG和停止运行，不返回玩家档案标题；同窗口重开拒绝，须新窗口。刷新/关闭也丢弃内存，Trial从不回写草稿。

## 最新验证与边界

先登记[入口/I/O白名单](editor-local-validation.md)再显式串行执行。所有文件存储/server/browser均自有。

- [最终49门收据](../.dragon-analysis/map-migration-2/app-trial-machine-r3/receipt.json)：2026-10-01 15:41:44.787Z–16:03:53.747Z，全部exit0；90源码/当前39资源前后SHA同。此前47门保留，新增pure capability和actual App Trial两门；原5退休road skip不算通过，固定RNG非CPU/全战役认证。
- [实际App专项](../.dragon-analysis/editor-phase/app-trial-machine-r3-app-trial/receipt.json)：实际工作台新窗口/opener为空/选章势力/App/pump；原子(10,10)改为16的rev2旧局保持state/RAM/RNG，保存32到rev3后新窗口实际读32；六固定资产及四季请求、无IDB、所有正式存读入口拒绝、popup拦截保持工作台、无章拒绝/陈旧编译拒绝、关闭编辑页旧局不变；结束清空scenario/clock/RNG且同窗restart拒绝，0意外错误/外部请求，原39不变。
- [新局截图](../.dragon-analysis/editor-phase/app-trial-machine-r3-app-trial/new-app.png)：真实共享游戏UI，菜单存读两行停用、底部“草稿試運行／僅記憶體”标识；不是M06新美术认证。
- pure门只在内存核readonly字段和七仓储拒绝，不读文件/网络。整套包含普通玩家存档mock事务/菜单/owned IDB、20章及JSON、编辑器两次原有20章证明、季节/写回/cache/路网/战术映射等原已审安全门。
- r1同49通过但结束只停止未丢弃进度；r2补原App清理、结束不可复活；r3明确绑定chapterId。前两轮保留为历史SHA，不拼成最终源码成绩；无需伪造测试失败。
- Jev只发送审过2048B工程摘要（固定1.13.0），advisoryOnly，不作原机制/测试/放行证据。[静态审计](../.dragon-analysis/editor-phase/app-trial-session-r1/static-receipt.json)绑定最终源码及收据。
- LSP部分push-only/超时不可确认，GameBar超过5000行支持上限，Markdown支持不足；没有宣称全清。常量内部window.open被不检查literal的规则重复误报，已用诊断工具标false-positive，未写ignore/关闭规则/改全局缓存；Boolean保留原hold赋值语义。

## 尚未完成

此切片不代表完整E-05或RuntimeManifest@1后台交付：

- 无真实账户/会话epoch/作者权限；Q70登录撤销、服务端授权及私有资源每请求校验未完成。不能对外部署此本地服务。
- Q71断网暂停/有效重连续旧局/401终止尚未完成，不能用navigator.online或假登录状态充当后台。
- Q69仍用现有全源编译支持域；选择单章运行不等于其它坏章不阻断编译，单章依赖闭包待人物/章节模型和初始化门。
- 未专门认证全部战术命令/战果/退出竞态；真实App入口与既有战术映射/共享回归不等于全战役。
- 可靠复制/CAS事务、实体编辑、素材完整管理/性能、发布/玩家多游戏目录/身份隔离档案仍见[任务一剩余表](editor-current-workspace.md)。任意新拓扑/移城/扩容及未知初始化仍拒收。

下一步先复核E-02管理/实体表单的独立低风险工作；真正后台需要确定持久化、事务、认证和部署能力后接线，不自动选平台或部署，不用本地假认证宣称完成。
