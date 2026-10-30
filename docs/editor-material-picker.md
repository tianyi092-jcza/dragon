# E-03-MATERIAL-PICKER-1：工作台可视素材定位

限定桌面表现交付；**不是完整Q48/N7语义素材库**。只扩展既有studio/HTML选择器及其component-browser测试，80入口/281声明源码库存不变，没有新80全轮或原机制结论。

## 实际行为

- 下拉列表保留；增加按原`variants.original.tiles`及现有atlas绘制的可视缩略图，每页至多24项/三列、上一页/下一页/总数。24是DOM显示预算，不是素材容量或规则限制；不裁剪定义或修改配方。
- 搜索仍按作者名称/身份；“作者素材”只依据现有明确category/revision，“单格/多格”只按footprint数量。不从外观/颜色猜山脉、河流、通行、水陆或原对象身份，完整语义整理仍开放。
- 图卡/下拉同步同一ID，图卡复用原onchange与原预览；Enter操作后焦点回新选中图卡。下拉跳至其它页时将其图卡滚入缩略区可见范围，不滚动整个地图或替换场景。作者名称以textContent呈现。
- 无结果时下拉/图卡为空、原预览清空、拖动禁用、提示明确、作者更名/移除禁用；清除筛选可再次选择。翻页只换呈现，选择/过滤不触发放置/保存/编译，不改变地图选择、dirty、定义或mini。
- 放置/拖放仍走原完整footprint/当前层/锁/unknown及共同composer门；没有编辑原件、猜隐藏底层、扩图、改道路/初始化/AI/RNG/Clock/仓储/Trial/default资源。空选择原拖动入口也拒，不能拖陈旧预览配方。

## 实际证据与限制

[I/O先登记](editor-local-validation.md#e-03-material-picker-1可视定位先审io)。最终白名单env `material-picker-session-r1/run-focused-r2.mjs`六项全部exit0：component pure/browser、viewport pure/browser、unified workspace、navigation browser。它们各用原隔离合同，fresh Chromium/own temp/loopback、IDB.open立即抛拒与外网/SAVE/profile禁入，不转发凭据；只关闭自己的listener/browser。

- component pure原115检查/36拒收重验；真实component-browser新增图卡24项/两页不重叠/键盘上一页、下拉+Enter图卡与焦点同步/同配方像素、空搜索清alpha与draggable/作者动作/分页禁用、单格过滤、作者多格过滤、作者`<img src=x>`只作原文字、选中图卡在clip范围内。选择/过滤前后完整draft字符串、dirty、地图选中ID和mini同。
- 接续原实际HTML5拖放、组拆合、作者更名/移除/引用、拆分/批量平移/调序/层锁、unknown补底及实际保存重开，20章生产fresh+JSON通过。统一工作台亦按其原20章路径重验；不称全战役/CPU、任意章初始化或真实后台。
- r1六项通过后审图补选中图卡滚入可视区、Enter后焦点及空结果引用提示，r2**全部六项重跑**；r1保历史，不拼成绩。本轮没有产品测试失败；一次精确编辑最后一个旧段未匹配，前两段已应用，重读后完成剩余段，未用中间字节跑测试。
- 静态审计r1误把纯工具文本stdout当JSON，原producer与log保留，修审计读取器不改产品/预期/实际六门；重新独立签字，不将该失败称通过。
- 最终281语法/278旧源及82 current/archive Web资产同SHA、三源有界差异、当前六日志/四browser收据/图/文档/诊断/HEAD由`material-picker-session-r1/static-receipt-r1.json`独立关联。封存的运行态存档八门只是此前基准，未在本UI阶段重跑。
- 主动10路径0clean/2findings仅八既有hint/7Markdown unavailable/1inconclusive；工具矛盾“7confirmed-clean”文本拒，session222files七既有warning，没有禁rule/清cache；LSP未确认/Markdown unavailable不等clean；既有Scenario.cities动态字段及正确(await).prop建议不改成错误API或读未解决Promise，固定等待URL误报沿既有review裁决。Jev只3499B人工工程摘要/preview0redactions/fixed1.13/advisory，不送原数据/图像/快照/完整日志，不作原证或完成门。

完整语义组件/工具栏、其它变换/性能与全部桌面流程、真正权限/发布/资源生命周期、实体/空章初始化、拓扑和扩容仍按[差距索引](editor-requirements-matrix.md)开放。goal active，无commit/push/deploy。

## 后继互联网素材列表贴图预览

互联网工作台复用原素材列表／24项分页和既有放置按钮，新增逐行贴图，不另造素材源或选择／保存流程。GET草稿的 `materialPlacement.materials[].visualVariants` 投影每个实际变体的 `{variantRef,tiles}`，图格坐标为既有anchor相对偏移；只有明确byte-stamp及对应MMAP视觉绑定返回图块字节，其余 `tiles:null`，不按名称／外观猜配方。旧DTO缺该字段只缺贴图，不禁原操作；提供时在原控制器边界核完整变体覆盖、唯一坐标与footprint一致、字节0..255并深拷贝，坏投影不半安装。

贴图只用同一精确修订、身份与已核季节图集的私有RGBA；图集仍须作者明确读取，预览本身不发请求。原生控制器用每图集一个256×256 `OffscreenCanvas` 缓存，写入Vue持有的128×128缩略图Canvas，按完整包围框等比绘制并关闭平滑；空隙／边缘保持透明，不铺草或补地形。无图集／旧或不支持的投影会清空。图集随原保存／身份／读取生命周期失效，不把像素放进Vue数据树。

未选放置变体时只展示具名original示例（该变体不存在则空白），不自动选择放置参数；选定变体后展示对应贴图。图片不反写source、waterClass、规则地形、道路、初始化、Trial或发布准入。作者仍使用原选择放置按钮及显式参数、单journal／CAS／原键与精确重读。

证据前缀 `.dragon-analysis/editor-completion/material-pictures-`：

- 最终 `controller-r2.log` 两控制器147项通过，复用原DTO测试扩展贴图深拷贝、变体覆盖、错字节／坐标／稀疏数组等拒绝；旧缺贴图DTO与原保存行为保持。
- `workbench-r2.log` 136项通过，产物 `.dragon-analysis/editor-workbench/run-tHIuUv`，API明确夹具；三格负偏移素材用区分图块7／8的实际RGBA控制，核整图左右／中心像素、透明边缘及明确重读夏图集后的变化，原框选／拖放／离开保护链保持。无新增独立测试入口。
- 最终 `real-r62.log` 的 `--materials-only` 20组／12保存通过。实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实登录／新Chromium；选中固定原子素材，缩略中心像素逐字节等于同修订认证图集的实际variant byte对应像素，边缘透明；原放置、丢响应原键恢复、拆分／移除等保存链保持。40源码SHA事后全同、无非预期错误／外网／正式IDB、stderr空，收据 `.dragon-analysis/editor-phase/template-browser-r62/receipt.json`，复核 `recheck-r62.json`。
- 首轮工作台与真实r61均通过，但随后shell的 `draft-vue-owned` 正确拒绝原生控制器 `createElement`。改成OffscreenCanvas后，未放宽检查，重跑控制器、Vue build／check、工作台与真实r62；shell65、五JS及TXT模块语法、diff通过。r61仅保中间实现证据。辅助统计第一次按TAP的 `# tests` 搜索未命中Node实际 `ℹ tests`，改读实际输出，不改测试期待。
- `root-r1.log/.stderr` 的 `--placement-only` 3600秒超时，无完成收据，不计通过；进度走至管理员拆分历史，不能冒整入口或完整副本图片浏览器成功。后续浏览器当时未启动，已单独运行并封存上述收据；只读确认超时后匹配的测试Node进程为0，未杀其它进程、未重复长入口或批量清理未知临时目录。
- 六代码主动LSP120秒／并发2：1项确认clean、5项未确认（1超时／4push-only）；TXT无服务，不称全部clean；两文档warning视图clean，mode=all缓存102文件仍37项既有warning及1hint，未屏蔽。没有web/src或DDL变更，不重建原生束、未重复无影响规则／Trial／发布长链。完整语义库、全工作区及运行资源闭包仍未完成。

## 后继素材落点实际贴图预览

在既有占用格轮廓内增加独立的半透明Canvas贴图层，复用上述明确变体字节和同修订私有图集。素材组件只转交选择ID／variant及offsets，不把RGBA放进Vue数据树；原生控制器从私有已校验材料中查图块，列表缩略图和落点图共用每图集一个OffscreenCanvas缓存。按真实16像素图格与anchor偏移绘制，关闭平滑；窗口外只在显示侧裁出画布，不改完整footprint或保存范围。该层不拦截指针，检查、指针定位和原生素材拖放均沿原落点流程。

换变体立即换贴图；未知配方明确清空旧像素、保留已知占用轮廓，不回退original、不猜地形或类别。层锁／当前层／身份与读取失效仍由原资格门清预览。原已保存画布不被覆盖，X／Y、类别、source、journal和保存时机不因预览改变；实际放置仍须独立确认，不授运行准入。

复用现有验证，证据前缀 `.dragon-analysis/editor-completion/placement-pixels-`：

- `controller.log` 两控制器150项、`workbench-r1.log` 工作台138项首轮通过，后者产物 `.dragon-analysis/editor-workbench/run-lNZnMV`、API明确夹具。新增在原三格负偏移场景核窗口像素、非等比CSS尺寸、不拦指针、变体切换、未知配方清空、越界显示与锁定移除；保存画布原RGBA及无请求／无自动写保持。未增独立测试脚本。
- `real-r67.log` 的 `--materials-only` 首轮21组／12保存通过。实际HTTPS／Node／自有SQLite／FileBucket／41来源／真实登录／新Chromium；固定原子素材的整块16×16 RGBA与同修订认证春图集对应字节块逐值一致，保存画布原字节不变，拖动中亦保持准确贴图；随后原放置、真实提交丢响应／原键查询重读、拆分／移除等保存链保持。40源码SHA事后全部匹配、非预期错误／外网／正式IDB均无、stderr空。收据 `.dragon-analysis/editor-phase/template-browser-r67/receipt.json`，复核 `recheck-r67.json`；不是任意配方或完整副本新增浏览器认证。
- Vue build／check逐byte一致，shell65、两测试JS及TXT模块语法、diff通过；本批已执行验证首轮均通过。四代码主动LSP120秒／并发2仍未确认（1超时、3push-only），TXT无服务，不称clean；三文档warning视图clean，mode=all缓存102文件仍32项既有warning，未屏蔽。没有后端／web/src／DDL改动，不重建原生束，不重复无影响Root、规则、Trial／发布长链。完整工作区、连续边缘平移、语义库及完整目标仍开放。
