# E-03-DECORATION-ORDER-1：同层装饰调序

任务一 goal655 中的限定桌面工作台切片，对应已批准 Q60/61/66；不是完整编辑器、任意地图或原版机制完成证书。固定384×256/192、byte-stamp与共同compiler0.6门不变。总体缺口见[工作表](editor-goal-completion.md)，先登记的入口/I/O见[本地验证](editor-local-validation.md)。

## 实际实现

- `componenttools.js#reorderDecorations(source, ids, direction)`：明确非空、唯一、存在的装饰ID及±1方向。先经原共同draft composer检查，copy-on-write只改`map.decorations`数组次序。每个选中块跨一相邻未选项，选中项与未选项各自的相对顺序保留；边界返回原源，不制造修订或副本。不是按当前索引移动失效选择，不跨层或按重叠格猜邻居。
- 不改实例ID/坐标/footprint/配方/水域类别、素材库、base/unknown、道路/据点、组合成员及显隐flag。未知底层保持未知，原严格编译/引用/profile拒收不放宽。原绘制与编译数组顺序、最上水域/非水遮挡合同不另造算法。
- 工作台「裝飾實例工具」有「所選裝飾上移」「所選裝飾下移」。非装饰当前层、装饰锁定或无选择时禁用；保留的`window.moveSelected`独立重复检查，不能从控制台绕当前层/锁。成功后按稳定ID恢复焦点，撤销待移动/导航状态并设dirty；边界/拒绝不设dirty、不改变选取。Shift取消当前焦点后，只处理仍选中的ID。
- 原件、默认来源/资产、共同composer/compiler、规则/AI/RNG/App/正式存档未改。作者调序当然可能改变其副本组合输出；这不认证新原版公式、全战役、任意拓扑、原多格语义或扩容。

## 本轮实际验证（2026-10-02）

仅以下**7个实际focused入口**，不是旧71门的新全量证书；实现/测试SHA由[本轮静态记录](../.dragon-analysis/editor-phase/decoration-order-session-r1/static-receipt-r3.json)绑定。164声明源码语法/变化清单与82 current/archive资产独立保全，不能因此声称全仓或所有消费者已覆盖。

| 实际入口 | 本轮产物及限定覆盖 |
| --- | --- |
| `verify_editor_component_tools.mjs` | `unit-r1.log`：115检查/36拒收与调用者不变；五实例31非空子集×两方向、相对次序/步长/边界、其它层/unknown/组合保留、两水域次序/非水遮挡/JSON。显式作者byte/water夹具，不是原规则oracle。 |
| `verify_editor_component_browser.mjs decoration-order-browser-r2` | [fresh工作台收据](../.dragon-analysis/editor-phase/decoration-order-browser-r2/receipt.json)：真实按钮/Shift多选、边界、跨层与锁定直接调用拒、取消焦点不移动旧索引、叠放水域、保存重开、旧immutable包；既有擷取/拆分/批量/素材管理/组合/补底/两PNG及20章生产fresh+JSON全部继续执行。拒绝IDB spy访问0、errors/forbidden0；[截图](../.dragon-analysis/editor-phase/decoration-order-browser-r2/component-workspace.png)只是副本工作流证据，不是新原图视觉批准。 |
| `verify_editor_viewport.mjs` | `viewport-pure-r1.log`：31检查/6负控，编辑几何，不是引擎扩容。 |
| `verify_editor_viewport_browser.mjs decoration-order-viewport-r1` | [fresh视口收据](../.dragon-analysis/editor-phase/decoration-order-viewport-r1/receipt.json)：滚轮/CSS拾取/整图/捕获平移/真实HTML5边缘拖动/Escape/blur提示、源/mini不变。 |
| `verify_editor_unified_workspace.mjs decoration-order-workspace-r1` | [共同工作台收据](../.dragon-analysis/editor-phase/decoration-order-workspace-r1/receipt.json)：组合开关/保存/两PNG、20章fresh/JSON、真实页面与原件保全；无后台认证。 |
| `verify_layered_map_compile.mjs` | `layered-compile-r1.log`：原共同纯组合及已批准层/水域/unknown/recipe拒收，不新增原机制。 |
| `verify_layered_map_engine.mjs` | `layered-engine-r1.log`：20章同生产fresh、真实既有道路动作/副本原子byte变化与旧快照保留；历史夹具只读Web原输入/封存源，不读取DOS存档或用户profile。不是完整战役。 |

上述日志均在`.dragon-analysis/editor-phase/decoration-order-session-r1/`。两component入口先执行，其后五入口串行exit0。pure只有内存；各browser为新Chromium context，临时store/loopback及关闭均属于其自有实例；没有真实SAVE/profile、用户IndexedDB、外网资源请求、共享资产写入或部署。

### 中断与诊断纪律

首轮browser外层480秒中断：只有截图、空stdout，无receipt/failure verdict，**不计通过**，不能推断具体阻塞点或产品原因。原[中断记录](../.dragon-analysis/editor-phase/decoration-order-session-r1/browser-r1-timeout.json)、round/image/log保留。先前同入口实际耗时415948ms只是预算线索；新round加请求/prepare进度及900秒预算后完整通过，不拼旧中途结果，不自动重试掩错。

五变更文件主动LSP：0 confirmed-clean，3 inconclusive（超时或push-only），其余只有既有动态`Scenario.cities`及查询选择器/正确await括号等hint；不错误改成`citiesOf`或移除必要await括号。固定内部`window.open('/trial-wait','_blank')`旧误报按精确身份标false-positive，不放宽URL策略。Markdown不支持/全session既有warning另列最终记录，不把空缓存当clean，不禁规则/清缓存/改全局信任。Jev只审过2930B工程摘要、preview零redaction、固定1.13.0/advisoryOnly，不传原资源/存档/个人资料/凭据，不作规则证据或批准。

## 剩余

同层调序入口已交付；完整语义素材库、其它允许的变换、工具右键菜单、完整性能/UX验收仍需逐项核对。真实认证/事务/权限资源闭包、连接计时安装、可写人物/章节及有证初始化、发布/匿名目录/跨游戏正式存档和容量门仍未完成。此前历史阶段的成绩不重贴本轮代码；goal仍active，无再次commit/push/fetch/deploy。
