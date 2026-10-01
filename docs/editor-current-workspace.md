# 本地编辑工作台：当前源与组件／组合工具

## E-03-COMPONENT-TOOLS-1（最新交付）

用户“继续未完成的任务”后，完成当前profile下的以下切片；任务一整体仍未完成。内置844e…、compiler0.6及39角色/switch不变，原件／原DOS／封存基准未写。

- 原图块素材列表／名称搜索、经核验图集预览、从选中完整装饰擷取作者命名多格素材（最多256格），明确单一水域类型/掩码；不把导入原子冒充已重建山脉/长城等原对象。整图不是可擷取素材。
- Shift多选／框选完整实例，非锚点格可命中整个多格组件；拖预览至地图或点击放置，显示整footprint，边界超界不提交。整实例移动/删除，未知底层仍保留；缩放、边缘自动平移、多格实例拆为子实例、全素材语义整理尚待后续。
- 实际水域组合创建／拆出严格子集／合并，保留余组和明确引用；拆分继承原flag（含false），合并必须明确选最终flag，不按素材或水域全类操作。所有group编辑不改native/完整geography/道路。
- 解锁base后明确选择原byte/显示地理并确认补绘指定格；不还原原未知地形、不改上层或其它格。删除暴露unknown仍拒正式编译。替换移除对应unknown及旧base组引用，未指定格原样保留。
- `componenttools.js`采用copy-on-write，在共同composer通过后才接入本地状态；失败不部分写源。服务同修订保存map+追加componentDefinitions，未使用新增素材的全部variant也核配方/footprint；原定义不可覆盖。单进程文件harness仍非可靠后台CAS/认证；没有新recipe/拓扑/扩容/新规则。

### 最新验证

先登记[库存/I/O](editor-local-validation.md)再显式串行执行。

- [47门完整机器收据](../.dragon-analysis/map-migration-2/component-tools-machine-r1/receipt.json)：2026-10-01 13:07:08.555Z–13:27:49.331Z，全部exit0；84源码和当前39资源前后SHA同。原45门＋纯组件工具/实际组件浏览器两门；原5退休road skip仍非通过，固定RNG只局部Web确定性。
- [最新实际浏览器／20章收据](../.dragon-analysis/editor-phase/component-tools-machine-r1-components/receipt.json)：框选/两格素材擷取/真实drag-drop/非锚点整实例选择，建组/拆分false/合并明确true，unknown阻断、明确补底、保存重开/两PNG、陈旧/覆盖/未用坏recipe拒收；20编辑源fresh/生产JSON恢复，IDB0、意外console/page/request错误0、1280/1024布局。新图是自有副本操作，不是原件改动或M06新美术认可。[操作截图](../.dragon-analysis/editor-phase/component-tools-machine-r1-components/component-workspace.png)。
- pure门21检查/12负控，含整footprint超界、混类别不猜、严格拆分、合并缺flag、未用坏variant拒收及失败不变；group/native完整地理同，JSON源往返。
- 首轮[unit.log](../.dragon-analysis/editor-phase/component-tools-r1/unit.log)发现merge把undefined传入带true默认的create函数导致未显式选择也放行；仅修merge入口boolean校验，保留负控期待，新unit-r2及完整47门通过。未用测试掩盖产品失败。
- 7代码/HTML主动LSP：1动态Scenario字段hint＋5既有querySelector/正确await括号建议；3有finding、4inconclusive（1超时/3push-only）、0确认clean，不能称全清。Markdown覆盖及最终语法/SHA/链接/diff记录另列；没有关闭规则、清缓存或改变全局配置。
- Jev仅审过1982B人类摘要后发送固定1.13.0，结果advisoryOnly，不作测试oracle/原机制/放行证据。[最终静态记录](../.dragon-analysis/editor-phase/component-tools-r1/static-receipt.json)绑定本轮SHA与收据。

## E-02/03-CURRENT-WORKSPACE-1（上一批历史交付）

2026-10-01，基于dev `6d89b01` 的本地切片。用户在任务一审阅后“好，继续”授权先补这三项；不是完整互联网编辑器授权、发布验收或提交授权。任务二当前地图844e…保持不变。

## 实际交付

- `tools/editor_builtin_source.mjs`从当前`builtinresources.generated.js`固定描述符读取38角色＋manifest，校验URI、长度、SHA、完整sourceDigest／world／20章、共享编译的四原生产物后才复制。无ignored迁移源或旧world/catalog/data回退；所有读取均为Web资料，不访问DOS或玩家存档。
- 本地首页提供完整测试复制／最小地图复制和工作台入口。完整复制带原20章运行资料；最小复制无章节，不能试运行。复制独立身份，原件只读；保留显式兼容辅助字节、组件、实际组合及固定修订图集引用。人物跨章实体库／完整ID分配事务仍待E-04，不把旧按槽字典认证为完整创作模型。
- `/studio`转到`web/editor-studio.html`，`src/editor/studio.js`从草稿及经SHA／尺寸核验的只读原图集绘制实际合成图块，不再用原静态背景＋绿色矩形冒充新源。工作区显隐／锁定不影响正式内容；源未知格显示棋盘，不伪填。
- 从列表或地图选择现存实际水域组合，查看ID／成员，定位、勾选“在小地圖顯示”。开关只写该组的boolean；共同composer输出完整geography及显示摘要，共同minimap生成即时250×167像素，保存后重开保留。未保存预览不写服务、原件或Scenario。
- 共享编译器仍0.6；局部构建I/O另标`studio-unified-1`，保留原0.6目录，子目录保存准确快照、原生四资源＋两张实际PNG。四资源在`assets`，两PNG在`minimapAssets`，每个角色按同快照校验长度／SHA；不冒称完整RuntimeManifest@1或完整App试运行。
- 当前源约43MiB，局部请求上限改为64MiB的UTF8字节计数，越限停止积累。新UI保存提交expectedRevision，单本地进程先比修订再写；旧测试无此字段仍为历史harness模式。冲突不覆盖，不把此文件存储／单进程判断称为可靠后台事务、认证或发布CAS。
- 页面内部控件、状态及确认文本繁中；创作者原有文字／诊断代码不自动转换。启动未完成禁用工具，保存中禁重复操作；后续编辑与已发保存快照不同则仍标脏，离开提示。校验／编译只取已保存修订，脏预览不会冒充已编译。
- 保留受限道路工具：删除后未知底层仍阻断编译；原路径重建必须明确确认沿用原道路图块组件并修复成员引用，不猜还原下层。草地实际原子可放置、层序可调。完整素材库、拆组／合组及底层补齐表单尚未实现，不能据此放行任意路网。

## 验证与证据

入口、依赖、I/O白名单先登记于[本地验证清单](editor-local-validation.md)。所有服务／存储／浏览器均本轮自有，没有真实SAVE、用户profile、正式IDB、commit/push/deploy或全局配置变更。

- [完整45入口串行收据](../.dragon-analysis/map-migration-2/current-workspace-machine-r2/receipt.json)：11:50:13.866Z–12:04:45.147Z，全部exit0；81源码（含HTML）和当前39角色前后SHA同。原39门＋6编辑门，明确显式执行，无通配。
- [工作台专项](../.dragon-analysis/editor-phase/current-workspace-machine-r2-workspace/receipt.json)：当前完整复制161组／51显示、两PNG与当前批准源逐byte一致；开关变化时完整terrain/geography/道路／helpers不变；20章fresh及生产JSON恢复；错误审核状态、错成员、坏PNG、陈旧修订拒收。实际浏览器首页最小复制、组合选择／定位／checkbox、未保存不写服务、保存重开、编译PNG、1280/1024布局、IDB0、console/page/request错误0通过。
- [工作台截图](../.dragon-analysis/editor-phase/current-workspace-machine-r2-workspace/workspace.png)是隔离副本关闭两段主河后的操作示例，不是当前游戏已修改或新原机制证据。
- 同轮道路Node实际原生动作仍走改点(252,9)→(252,10)，旧修订晚到不串资源、坏binding／拓扑／摘要拒收；UI实际删路、原路径明确确认重建、保存校验编译通过。Node/浏览器地形样本现在修改实际覆盖原子而非无效被盖base，仍10天／192城、无正式保存。
- 其余同轮覆盖存档mock事务／拒收、当前App、四季×DPR／真实易主五格、缓存、军师地图锁及行军中立捕获；原5退休skip不算通过，固定RNG仅Web局部确定性，不认证CPU或全战役。

### 失败保留及诊断

- `current-workspace-r2/failure.json`及早期road-loop.log：大源处理之间复用idle Node连接出现ECONNRESET；测试改显式connection-close，无自动重试，无放宽规则期待。
- `road-studio-r1.log`：UI校验状态误拼修订数字与旧断言不符；修正文案（保留校验结果），不是原生建造失败。
- `current-workspace-machine-r1`只执行前5门，工作台测试在viewport异步resize未落定时断言旧canvas宽度失败；加可观测布局等待后新r2完整45通过，未替换坐标或隐藏产品错误。
- 12变更路径主动LSP：25条hint（动态Scenario字段及既有await括号／querySelector建议），8有finding、4inconclusive（1超时／3push-only），0确认clean。Markdown支持不可用另列，不称全工作区清洁；session全量结果见交付静态记录。没有关闭规则／清全局缓存。
- Jev只发送人工审过1713B摘要，固定1.13.0，输出advisoryOnly；不作原证、测试oracle或放行门。[最终静态记录](../.dragon-analysis/editor-phase/current-workspace-r1/static-receipt.json)绑定上述收据、当前字节、链接及语法，不把历史绿色拼成新成绩。

## 任务一仍未完成

| 范围 | 仍缺 |
| --- | --- |
| E-01/E-09 | 真正账户／权限／CSRF／上传安全及可靠持久服务 |
| E-02 | 游戏管理完整流程、可靠复制事务／实体身份模型、原件保护权限验收 |
| E-03 | 当前原图块/作者多格库、组合拆合和明确补底已交付；仍缺完整素材语义整理/素材管理、多格实例拆成子实例、批量变换、边缘平移/缩放、完整流程与性能/UI验收 |
| E-04 | 人物／据点／章节编辑、跨章人物引用、已证初始化联动 |
| E-05 | 完整App内存试运行及禁正式存档／认证断网生命周期 |
| E-06/E-07/E-08 | 发布事务、玩家多游戏目录、身份隔离存档完整流程 |
| E-10/E-11 | 完整产品验收；任意拓扑／扩容仍受原证门约束 |

下一优先项：E-05同引擎完整App内存试运行，先接准确snapshot与显式禁正式存档；认证/断网生命周期仍依赖真实后台能力，不能拿本地harness模拟为完整交付。完整后台需要核对现有持久化/事务/认证部署能力，不自动选平台服务或部署；人物章节初始化及任意拓扑仍受原证门限制。
