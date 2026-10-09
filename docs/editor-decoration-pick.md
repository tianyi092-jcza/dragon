# E-03-DECORATION-PICK-1：装饰拾取显示索引

限定桌面工作台优化，先测量再实现；不是规则地图索引、完整语义库、扩容或整体性能验收。原线性`hitDecoration`保留，新增只读`createDecorationPicker`与studio的三个装饰拾取入口（单点检视、移动、删除；矩形框选不使用此索引），无composer/compiler/引擎/默认资产改变。

## 行为与失效边界

- 遍历现有数组顺序及`componentCells`的实际footprint/anchor，按二维坐标保留最后匹配的装饰**数组索引**。不以包围框填空洞，不按地理/外观/透明度/水类别筛选，原工作区显隐/锁门与unknown删除后补底保持。
- 私有Map只存坐标和索引，返回冻结pick接口，不暴露缓存或改写源。NaN跳过与原严格相等无法命中相同；字符串不与数字混同。极端数字仅纯JS等价测试，不是合法运行数据认证。
- 只有共同composer草稿重建成功后建立新快照；每次现有`changed()`/启动/保存重载的rebuild同时更换它，包含放置/移动/删除/拆分/平移/调序/定义及组操作。一次构建仍线性耗时及额外内存，不能宣称免费缓存。任意外部debug直接改draft而不重建不属该快照合同。
- 后续拾取不重扫九万实例；不推进RNG/规则、改变源/配方/mini、修改AI或存档，不修改旧线性helper的其它调用。实际源码复核发现CodeGraph只列selectCell，pointer handler还有move和del；本次三个入口都接，未用不完整调用表作全覆盖证据。

## 测量与验证

[I/O先登记](editor-local-validation.md#e-03-decoration-pick-1拾取性能先审io)。owned `decoration-pick-index-session-r1/probe-r1.json`记录当前92586装饰、98明确点（三轮89命中），原线性一轮约400ms；它是审计，不是性能通过门。

同源r2三轮98点逐项线性/索引等值，结果摘要相同：线性390–403ms、构建13–24ms、单次索引整轮0.04–0.18ms；另三轮9800次索引查询含assert约0.93–1.28ms。**仅Node本机计时，不推算浏览器FPS、用户机器或整体UX**，没有猜测阈值或性能通过断言。源及281声明JS/82Web资产按允许delta前后核，不输出资源正文。

最终白名单env `run-focused-r2.mjs`实际六项串行exit0：component pure/browser、viewport pure/browser、unified workspace、navigation browser。80入口/281声明库存不变，未全80跑。

- 纯门115检查/36原拒收，加5850 indexed/linear等值：多格非零anchor及空洞、最上遮挡、源独立、不隐式追踪原数组、重新构建后的调序/删除/平移/拆分及作者定义、更名/JSON、无命中/字符串/NaN等。全部源不变。
- 真实current地图240格矩形拖选集合与原线性helper计算结果同，map/dirty不变；**归因更正**：原fixture为逐格原子，此检查是回归覆盖，不证明框选使用索引；原日志`indexed240cell rectangle`措辞撤销，封存byte保留。矩形原来是全实例footprint扫描且只末尾一次draw，后继[矩形选择切片](editor-rectangle-selection.md)保全部遮挡/顺序并减少临时数组，不改成最上拾取；接续原两格捕获、图卡/分页、实际HTML5放置、组拆合、作者管理/引用、拆分/平移/调序/锁门、unknown删除补底、保存重开及20章fresh/JSON。viewport亦覆盖实际移动/删除/左键、菜单、留边与明确重载，统一工作台20章及导航六组按各自原合同重验。
- 所有browser为own loopback/temp/fresh Chromium；IDB hook拒0、外网/SAVE/用户profile禁，自己listener/browser关闭。导航预期503按其原合同，不作picker错误。纯/测量无nativeIDB或网络。每门当前日志/收据/图、四源内存逆delta/277旧源、82资产、文档与诊断由`static-receipt-r1.json`关联。
- 编辑期间首个多段替换最后一段不唯一，立即重读发现三个旧调用而不是两个；补三入口后才运行。纯测试初写漏一个对象括号，检查即修，未运行中间字节；没有把这些编辑问题称产品回归失败，也未调整正确机制/等待URL来迎合诊断。

r1六项通过后把纯fixture的显式原数组reverse改为赋值toReversed，保原快照及新的顺序/清空断言，消除新增mutation警告而不忽略规则；r2全部六项再次执行。主动10路径3clean/2findings仅九hint/3MD unavailable/2inconclusive，矛盾“6confirmed-clean”文字不采信；session223files七既有warning，无新blocking。既有selector、动态Scenario.cities及正确(await).prop不改成错误API/语义；固定等待URL沿既有误报裁决。Jev只3395B人工工程摘要/preview0redactions/fixed1.13/advisory，无资源/图片/正文/完整日志外发，不作机制/性能/权限门。

完整流程、语义工具栏/其它变换/性能验收与后台/初始化/容量仍按[差距索引](editor-requirements-matrix.md)开放。goal active，无commit/push/deploy。
