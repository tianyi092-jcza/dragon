# E-03-RECTANGLE-AUDIT-1：完整实例框选与临时分配

限定工作台显示侧切片，不改源、规则、容量或正式权限。先核真实路径再测量；完整语义库/性能验收仍开放。

## 更正旧描述

`studio.js`的pointerup原本扫描**全部装饰实例**，实际footprint任一格与矩形相交即选入；包括被另一实例遮挡的下层实例，按数组顺序加进Set。它不是逐格调用selectCell，原本就只在末尾draw一次。上一阶段“检视/框选共用最上拾取索引”及browser marker `indexed240cell rectangle`的归因错误：索引只接单点检视/移动/删除，原地图240格框选检查只能证明回归集合相同，不能证明使用索引。已更正[原维护源](editor-decoration-pick.md)及工程摘要，旧封存收据/日志不覆写，不把它们冒成新证明。

## 实际改动

`componenttools.js#decorationIdsInRect`仍按数组遍历，直接以原footprint/anchor坐标执行相同矩形谓词，返回按原顺序的全部匹配ID；省去每个候选的临时componentCells坐标数组，不用最上单点picker、不以包围框填空洞、不丢下层。不增加持久缓存。studio只有装饰框选分支接它；反向拖拽钳位、Shift追加、其它层/锁、selectedIds、groupId/sel及原末尾draw保持。源和mini不因选择改变。

## 测量与验证

[I/O先登记](editor-local-validation.md#e-03-rectangle-audit-1真实路径复核先审io)。owned `rectangle-audit-session-r1/probe-r1.json`测实施前92586实例，六固定矩形×三轮，包括240格/2格/整图/1905实例/空与越界；候选和原路径**完整有序ID**逐同，保护281源码/82资产。实施后r2同18个结果摘要再逐同；240格三轮原12.34/9.19/8.15ms，产品8.94/5.96/5.94ms。仍O(实例footprint)并分配结果数组，仅Node本机观察、不设性能通过阈值/不推FPS或整体UX。

最终白名单env `run-focused-r1.mjs`六项全部实际exit0：component pure/browser、viewport pure/browser、unified workspace、navigation。80/281仅库存不变，没有全80新成绩。

- 原115检查/36拒、5850单点等值保持；新增3891矩形等值/拒收，12候选×324边界组合、多格非零anchor/空洞/所有遮挡/源数组顺序、空矩形、缺定义拒，不修改任何候选源。
- current240格实际拖框对原完整footprint扫描集合相同，事件内只一次canvas清屏/一次layer刷新；临时测量wrapper仅owned页，pointerup后恢复。不声称此次修复了重复绘制。
- 实际放置作者2格实例覆盖两个原子，框选三个实例全部入选且顺序保持；反向Shift再框仍保union，source/mini/dirty/sel/groupId逐同。随后inspect仍只选最上实例，原捕获/图卡/组/拆合/平移/调序/unknown补底/保存重开与20章fresh/JSON接续；另统一工作台20章、视口及导航按原合同重验。
- own OS temp/loopback/fresh Chromium，IDB hook抛拒/计0、外网/DOS SAVE/用户profile禁，自己listener/browser关闭；导航503明确预期按原合同，其它错误/forbidden0。四既有源有界改动/277旧源/82Web资产/当轮日志/收据/图/语法/诊断另由`static-receipt-r1.json`关联；无新入口或产品模块。

主动11路径0clean/2findings仅八hint/7MD unavailable/2inconclusive；工具“7confirmed-clean”把unavailable误算，不采；session222files六既有warning，无新blocking、不清cache/禁规则。Jev只3432B人工工程摘要/preview/fixed1.13/advisory（初preview把当前单格测量与后续多格测试混述，已在send前纠正并保旧preview），不发源数据/图/快照/完整日志，不作性能/机制/授权门。主动LSP unavailable/inconclusive不算clean；既有selector、Scenario.cities与正确(await).prop不改成错误API。goal active，无commit/push/deploy。
