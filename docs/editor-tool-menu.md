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

## 后继互联网图块窗口工具菜单

`editor-ui/src/MapWindowPanel.vue` 已接互联网窗口的右键菜单，和原左键模式下拉共用定义。本批初始五项为检查、素材落点、窗口平移、完整装饰框选、基础格框选；后继新增第六项[整批位移目标拖曳](editor-instance-library.md#后继整批位移目标拖曳)，仍须明确选择锚点且装饰可编辑，不在菜单中暗选实例。再后继新增第七项[单格最上装饰拾取](editor-decoration-pick.md#后继互联网单格最上装饰拾取)，菜单仅切模式，左键才查询，仍须显式确认才取代素材勾选。第八项为[已选锚点占格抓取](editor-instance-library.md#后继已选锚点占格抓取位移)，需明确锚点及已知形状，保留抓取偏移并复用原位移流程，不自动拾取未选实例。不是将本地studio八工具全部移植，也不增加道路／据点编辑能力。素材资格、当前层和锁定仍决定可选项；选菜单仅切换同一个mode，不代选材料、不换层、不解锁、不调用保存或查询。

只在同修订窗口／图集就绪时打开；打开取消拥有的未完成拖动，并在有本地平移预览时恢复确认图，不选右键位置、不清已有检查格。原生按钮使用menu／menuitemradio及选中状态，方向键跳过禁用项，Home／End和Enter沿同一选择逻辑。Esc只关闭菜单并将焦点还给canvas；下一次Esc仍走已有临时操作取消。菜单按浏览器可视区域限制位置和最大尺寸，resize／blur／visibilitychange／焦点离开、窗口或工具资格变化会关闭。透明遮罩消费菜单外首个点击，避免关闭时穿透触发画布或其它控件；再次点击才进行原操作。此范围不影响玩家／Trial游戏右键。

复用既有验证，前缀 `.dragon-analysis/editor-completion/window-tool-menu-`：

- `workbench-r1.log` 新Chromium148项首轮通过，产物 `.dragon-analysis/editor-workbench/run-G8cBEU/`。原147项保持，新增实际右键五项／禁用门、检查格不变、当前视口内菜单范围、Esc与焦点恢复、方向键跳过禁用项及Enter切模式、Home回检查、遮罩首次点击不检查而第二次正常检查；Canvas原像素、当前层与请求数保持。是实际gateway／Vue、明确API夹具，不冒实际后端权限或原生全部焦点提示矩阵。
- Vue build/check逐字节一致、shell65、既有浏览器脚本语法及diff通过。两代码主动LSP300秒仍未确认（一超时、一push-only），不称clean；两文档主动warning视图clean，mode=all缓存108文件仍36项既有warning，未屏蔽。未改native控制器／服务／web/src／DDL，不重建原生束；核既有实际template浏览器的右键只用于小地图且显式Esc，未重复无影响Root／保存／Trial／发布长链，没有新增独立测试脚本。

完整地图工作区、边缘自动平移、语义工具与完整Q15仍未关闭；本批不增加原版机制或放宽运行准入。
