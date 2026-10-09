# E-03-INSTANCE-LIBRARY-1：装饰实例与作者素材管理

当前goal655“继续完成剩下的所有任务”中的独立桌面编辑器切片，**不是完整任务一完成证书**。当前固定384×256/192、byte-stamp/compiler0.6门不变，原件844e…/current39资源及switch保真。后端/原证依赖和整体收口见[逐项工作表](editor-goal-completion.md)。

## 实现及原子边界

`web/src/editor/componenttools.js`提供纯copy-on-write操作，成功后仍经共享composer(draft)检查；失败不替换工作区数据。本批无新KI规则或公式，也不改共用地图编译/游戏AI/RNG/存档。

- `splitDecoration`：2至256格的完整装饰实例拆成逐格子实例，必须是受信多格byte-stamp/原variant。只复用现有受composer验证的相同byte单格配方，不猜建新的机制；保持原数组位置，逐格水域mask贡献及组显示flag。子ID全新/不复用，原组成员引用展开为真正贡献水域的子ID，空组清理；后续上层仍上层。底层null不补，仅相关unknown.covering引用更新且保留priorCovering来源。素材定义本身不拆/删除，原实例来源随子实例留存。不是道路/据点拆分或任意节点增删。
- `translateDecorations`：选定完整装饰集合、明确非零整数格位移；所有成员及全footprint先验证，再一次提交。重复/缺失成员或任一超界整批拒绝，不裁切或先改一部分。成员ID、组flag/引用、base/unknown和未选实例/道路/placement不改；移动露unknown仍由严格编译拒收，不恢复旧图。
- `renameMaterial`：只改作者素材显示name，不改byte/footprint/recipe/variant/watermask。原图块配方唯读；同源语言保留，不自动转繁体。保存后sourceDigest/修订改变，但native四产物/两mini不因名称改变。
- `materialReferences/removeMaterial`：明确列装饰、道路components、placement三种定义消费者；有引用拒绝，只移除无当前引用的作者定义。不是删除共享图集、其它游戏、专属blob或旧编译快照；完整互联网资源删除/GC尚另属后台合同。
- `validateLibraryAdditions`历史API名保留兼容，当前允许新增合法定义、只改作者name、删除无同包map引用的作者定义；其它旧定义内容及原图块全部不可覆写。服务先核expectedRevision和上述结构/引用，再将同包map+definitions作共同草稿校验并写入；本地文件harness不是耐故障事务或真实认证。
- 实际`studio.js/HTML`有完整实例拆分/整数X/Y批量平移、更名/引用列表/无引用移除按钮；锁定层仍保护内容，raw配方更名/移除禁用，已用作者素材移除禁用并列引用。移除需确认；失败不改变选取，成功拆分选取新子实例。新增author ID用Web crypto，仅作者身份，不消费规则RNG。

## 本轮证据（2026-10-01）

入口/I/O先登记[验证清单](editor-local-validation.md)；扩展原两个component入口，库存仍53/98源，未以旧viewport成绩代替当前变更验证。

- [新完整机器轮](../.dragon-analysis/map-migration-2/instance-library-machine-r1/receipt.json)：18:46:37.541Z–19:08:32.974Z53入口串行全exit0，98源码及39当前资源前后SHA同。相对上一viewport98只有helper/server/HTML/studio/两个component测试六差；其余92同。全部旧功能也重跑，5退休road skip不算通过，固定RNG只证明相应Web路径而非CPU/完整战役。
- pure：44检查、28精确失败/不改调用者控制；含带mask的多格拆分/false组/后盖层/unknown引用、整批平移及其它成员不动、三消费者引用拒绝、raw配方不可改/删、作者更名/联合map无引用删除、JSON源保真。未构造未经原证认证的规则golden。
- [真实工作台收据](../.dragon-analysis/editor-phase/instance-library-machine-r1-components/receipt.json)：新owned temp/loopback/Chromium context，实际框选擷取/拖放/组拆合及既有补底；新增更名保存后六资产hash同/identity变、UI+服务拒绝已用定义、整实例拆分后三种plane及mini像素同/false组保留、整批超界完全无提交、实际平移/返回、删已无引用定义与旧compiled pack仍全同；保存重开、两PNG、20章fresh+生产JSON恢复。IDB open0、errors/forbidden0、current39/switch同。[截图](../.dragon-analysis/editor-phase/instance-library-machine-r1-components/component-workspace.png)为owned副本，不是原件新美术批准。
- 初始focused `instance-library-focused-r1`及`unit-r1.log`通过后，完整53又在相同最终代码SHA执行；没有本批产品测试失败或重写预期值。以最后完整收据为最终证据，不拼多轮成绩。
- 主动6代码/HTML：9hint（动态Scenario.cities、querySelector与正确await括号等），3有finding/3push-only inconclusive，0confirmed-clean；原常量waiting页open误报沿已有裁决重新锚定，无新增ignore/禁用规则或全局配置。7份Markdown主动检查均unavailable。session全量133文件仍列1条现有name控制码正则warning：已标本位置false-positive（明确拒绝控制码，不是意外字符），[33个拒绝/合法名接受探针](../.dragon-analysis/editor-phase/instance-library-session-r1/name-controls.log)验证安全限制；缓存仍显示，不清缓存/禁用规则/撤掉限制，不声称0W。最终[静态记录](../.dragon-analysis/editor-phase/instance-library-session-r1/static-receipt.json)绑定源码与覆盖，不能称“全LSP清洁”。
- Jev仅发审过2527B人工工程摘要/preview0redactions，固定1.13.0/advisoryOnly；无资源/代码/profile/凭据，不作原证/验收/命令来源。

## 后续可视定位（限定切片）

[工作台可视素材定位](editor-material-picker.md)已补原配方图卡/24项分页/作者来源与单多格过滤、键盘焦点/选中可见性/无结果清理；六实际focused及原20章JSON重验，定义/地图不因选择改变。不是完整语义组件整理，本文原53门成绩保持历史，不冒新80全轮。

## 剩余与接续

仅当前原字节profile及装饰，尚缺完整语义山脉/河流等素材整理、任意分块式子实例操作、完整性能/UX验收；这些不能因原图块列表与截图而称完成。真实账户/权限/持久事务/资源删除、单章Trial闭包及生命周期、人物/章节初始化、发布/目录/多游戏存档与G门仍另待证据/环境。

下一步是人物/据点/章节身份和引用的只读审计与明确写入门，不自动按同槽合人或填0/FF初值。此次未再次commit/push/fetch/deploy，未访问真实SAVE/profile/DOS或更改全局配置；共享旧脏改/目录与sealed报告保留。
