# 本地游戏列表试运行入口（Q67限定切片）

## 已交付与边界

`web/src/editor/games.js`在可编辑副本行提供「測試運行」，先读取已保存草稿并选择章，再由「開啟測試視窗」的直接用户手势打开独立窗口。无章副本禁用，原件没有该按钮；这不是认证或权限隔离，真正后台仍缺。

`listtrial.js`捕获gameId/draftRevision/chapterId三个字符串（修订不转Number），同步打开固定同源`/trial-wait`并清opener，再调用既有chapter compile。响应game/revision/scope/单章不符拒收；实际Trial loader仍独立验证完整manifest、scope、资产与快照。导航只有固定`/trial-app`路径，参数用URLSearchParams编码；不是通用URL转发。

- 阻挡不发编译，列表保持可操作；失败只尝试关闭本次等待窗口，不碰旧Trial/列表/工作台。
- 选择后若源已保存新修订，expectedRevision冲突拒，不悄悄换成latest；重新整理、选择后才能启动新修订。
- 同游戏的资料表未保存修改需要确认，拒绝不开窗口/不编译；确认只测试已保存源，表单不被保存或丢弃。
- 取消只退出章节选择；旧App的状态/RAM/RNG与固定世界不被新保存热换，关闭列表也不终止它。
- 原工作台入口、服务、compiler/composer、规则/AI/RNG/Clock/存档和默认资源均未修改。

这是Q67列表可达性与既有准确快照流程的本地交付，不是Q67作者身份完成，也不关闭Q69完整资源依赖/Q70真实撤销/Q71实际App断网控制。独立连接组件尚未安装；398资产捕获是历史离线库存，不冒当前程序批准。没有commit/push/deploy。

## 实际验证

先登记I/O见[本地清单](editor-local-validation.md)。本轮五个显式focused入口实际exit0：

1. `verify_editor_list_trial.mjs`：7组检查、15负控、IDB0；捕获身份/同步手势/编码/blocked/失败/关闭与错identity、whole、错章、非法修订；仅内存，不作认证。
2. `verify_editor_list_trial_browser.mjs list-trial-browser-r5`：fresh Chromium实际列表/20章/取消/空章/文字安全/被拦/未保存确认；原件不由本地列表枚举，readonly分支用显式只读DTO夹具（不建原件草稿/不当后台授权证据）/固定修订冲突及两个真实App，修订2与3、不同章、native tile16/32；正式save/load拒，旧state/RAM/RNG不变，列表关闭不结束App，IDB0/outside0。恰一预期陈旧compile400及console资源错误单列，其它page/console0。
3. `verify_editor_game_management.mjs list-trial-management-r2`：既有管理UI/API、九拒收、metadata-only原生产产物/旧包及IDB0。
4. `verify_editor_app_trial.mjs list-trial-app-r2`：既有工作台与实际App两修订、四季/正式存读拒/退出及IDB0。
5. `verify_editor_chapter_trial_api.mjs`：共同单章服务19拒收、scope/cache/坏共享与固定旧包。

证据在`.dragon-analysis/editor-phase/list-trial-session-r1/`；r1因测试误用描述符bodyURL（实际resourceURL）在服务启动前ENOENT，r2因测试误用snapshotId（实际trialSnapshotId）断言失败，原日志/轮保留。两次都是夹具字段修正，未改生产规则或降低断言。browser-r3保为早期成功；审计发现其builtin-original不存在选择器为弱断言，r4改为显式实际保护ID的readonly DTO夹具与可见文本/无按钮双断言后完整重跑通过。随后复核子进程环境边界，r5为新浏览器显式OS env白名单，并以owned wrapper用同白名单实际串行重跑全部五focused（不继承凭据）。最终browser-r5/管理r2/App r2/API r2，不混称真实原件目录或认证证明；r4与旧静态证书保历史。

runner库存为73入口/167声明源码，但本轮只上述五focused，**没有声称73全串行已跑**，旧71/调序7均为历史。最终源码语法/82资产保全、实际日志/工具SHA/图、内部链接、HEAD/diff与主动LSP/session诊断另签静态收据，不把push-only/inconclusive或Markdown unavailable写成confirmed clean。
