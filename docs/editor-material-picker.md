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
