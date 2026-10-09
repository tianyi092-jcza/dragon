# E-03：工作台工具右键菜单（Q15限定交付）

这是已批准的**Web编辑器交互例外**，不是原版机制，也不改变玩家游戏/Trial内的右键退层。固定384×256/现有byte-stamp支持域；不新增工具、认证、容量或任意拓扑能力。

## 实际接线

- `web/src/editor/studio.js`在编辑canvas右键显示原toolbar八个工具，选项调用同一个原按钮；只切换工具，不在右键处放置/删除、不自动换层或解锁。右/中键pointerdown/up不进入地图操作；后续左键仍走原当前层/锁定及配方门。
- 原先canvas pointerdown没有检查button，放置/删除工具可能被非左键触发。本次补非主键屏障，不把这段编辑器缺陷写成游戏规则。
- 打开菜单不选格、改草稿或dirty。只停止拥有的平移/框选/边缘预览；待移动/道路点列保留到明确切换工具或原Esc取消。菜单Esc只关闭并把焦点还给canvas；下一次Esc依原工作台流程取消。菜单外canvas的首次点击只关闭，不执行正在选用的编辑工具。
- 原生按钮、menu/menuitemradio/已选状态，方向键环绕、Home/End及Enter；菜单按实际视口钳位、溢出可滚动。resize、blur、hidden、焦点离开关闭；右键不承担保存/取消/删除动作。
- HTML为繁体固定标签，无作者文本拼接/新运行依赖。无Scenario、规则/AI/RNG/Clock/存档/默认资产修改。

## 实际验证与证据

先登记[I/O](editor-local-validation.md#e-03-tool-menu-1q15工作台例外先审io)，扩展既有`verify_editor_viewport_browser.mjs`，没有新增入口。最终源码在白名单env wrapper `tool-menu-session-r1/run-focused-r3.mjs`下**五入口实际串行exit0**：viewport pure/browser、component pure/browser、unified workspace。新browser轮`tool-menu-viewport-r4`，component-r3/workspace-r3；五日志/源码/资产指纹在同session最终静态收据绑定，不拼旧绿色或称新73全轮。

- fresh Chromium覆盖原滚轮/CSS拾取/整图/捕获平移/真实HTML5靠边及取消；菜单新增实际八工具右键/原按钮状态、放置模式中键无编辑、键盘/待移Esc/外点消费、真实resize/视口钳位、源/dirty/选择/已保存草稿不变。blur/hidden明确是注入提示，不冒原生后台可靠性。
- 后续左键实际放置/删除；锁定和非装饰层拒放，菜单不绕门。仅owned草稿保存修订2并reload，恢复原map/mini和清dirty。IDB访问立即抛拒且0，console/page/outside0；无真实profile/SAVE访问。两PNG只工程流程证据，不是新美术批准。
- 既有component纯115检查/36负控，component及统一工作台各20章生产fresh/JSON路径重验。167声明源码及82 current/archive Web资产逐SHA：只studio/HTML/viewport browser三源码变化，164旧源不变。编译器/组合器/App/规则/默认资源不改。
- 初wrapper-r1碰到已有同名日志，`wx`以EEXIST拒覆盖，中断不能称五门通过；原日志/独立browser-r2及harness记录保留。r2完整五门通过后修复新嵌套条件/flag argument警告，以r3重跑全部五门。没有复用r2通过证书。
- 支持路径主动LSP/session结果另签，inconclusive/MD unavailable不是clean。固定`window.open("/trial-wait","_blank")`旧误报已有false-positive处置，不改语义/禁规则/清缓存。Jev只2488B人工最小工程摘要、preview后fixed1.13/advisory，不作机制、测试、批准或完成门。

## 未完成边界

Q15各模块/完整离开及并发交互矩阵仍缺；本页只工作台菜单。Q60所有实体/工具矩阵、完整语义库、真实账号/事务/发布、Q69全资源闭包、Q70/71真实App网络控制、空章/初始化/扩容原证仍按[差距索引](editor-requirements-matrix.md)开放。没有commit/push/deploy，完整goal仍active。
