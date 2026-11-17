# D2-EVENT-64：战略事件64位置调度任务计划与跨会话交接

> 状态：**D0–D8＋S1 已确认（全部 (a)，2026-11-17）；P0–P5 本地完成并验证；P6 进行中（浏览器 E2E、LSP 结论、文档回流待补）**。未提交、未推送、未部署。
> 起点：本地 `cc6cd1d`（2026-11-17 复核 HEAD 未变），最近实现记录为 [journal §184](checkpoint-journal.md#184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push)。本轮执行与证据见 §10，待确认决策见 §11，交接见 [journal §186](checkpoint-journal.md#186-d2-event-64p0p1隔离审计与一次性决策包未实施未push)。版本仅用于定位，执行者必须重新核对 HEAD／diff，不重置到此版本。
> 本文是 D2 后继的任务、决策和验收维护源；原版机制仍归原证文档，历史结果仍归 journal。**禁止把本文建议或旧测试当原版证据。**

## 0. 执行授权、防呆与停止线

### 0.1 本轮和后继的权限

- 计划生成会话（§185）仅生成计划及交接链接，不改运行代码。执行会话（2026-11-17，§10）已完成 P0／P1：只读证据核对、隔离探针、合同草案与决策包；未改运行代码、未启动测试服务、未提交、未推送、未部署。
- 新会话收到 §9 的 `/goal` 委派后，可自主完成 P0/P1：只读证据核对、现状审计、隔离探针和合同草案；探针不得接正式规则路径，不预设未批准规则。
- P2–P6 运行实现须有 **D0–D8＋S1 决策表的明确确认记录**。已有确认只复核适用范围，不重复索批；缺项不能以“按建议”或历史 B4 全做自动补齐。
- 只暂停依赖待定行为的工作；继续独立的证据、测试基线及文档工作。全量目标未达到时不能将 goal 标为 complete。
- commit、push、生产写入／迁移／部署分别需要明确授权。测试不能接用户实际 dev 库；即使端口空闲，也不能复用 `.dragon-analysis/dev` 作自动化夹具。

### 0.2 不可越过的红线

1. 禁止读取或写入 `E:/Dragon/Dragon/SAVE.DAT`，禁止访问用户真实浏览器 profile／IndexedDB 存档。KI.EXE 只读原窗可用。
2. 不修改原版4字节格式，不占用“看起来未用”的 byte，不把 sequence 塞进 arg，不修改原资源或已登记清单来迁就测试。
3. 不重写全战略调度器、全事件分类、全游戏存档层；不恢复 Trial 接口，不新增简化引擎。
4. 不将“事件不丢”解释成强制产生事件效果。handler 原有活动／资格门可合法返回无效果；不能绕过这些门。
5. 不添加随机数、不预烧随机数、不用 Math.random；排序、携带与快照本身不能消费游戏 RNG。
6. 不通过释放别人的 hold、修改速度档、允许未完成续段保存来解决队列阻塞。
7. 不增加未经批准的合并、去重、丢弃、重试、超时、TTL、数量上限或“每帧最多若干条”规则。
8. 不吞掉 handler 异常后继续下条。保留既有已提交前缀、故障 hold／禁存及可诊断现场，不整批回滚已发生规则效果。
9. 不宣称“未拥挤永远逐字节一致”：月界未消费尾部携带也是批准后才存在的差异，即使没有满页。
10. 无证据不可勾完成；不得用只验证旁表 push/pop 的测试宣称生产→消费→消息返回→保存全链通过。

## 1. 目标、范围与非目标

### 1.1 最终目标

保持每月64个逻辑时间位置及首7／后10次势力tick节奏，允许一个到期位置承载多个事件。对已批准支持域内成功接受的事件，拥挤／月界不静默丢失、不重复派发；正常未触发Web差异的路径保持原来的选择、顺序、返回与RNG行为。贯通生产者、事件泵、消息续段、新局／恢复与JSON保存。

“64位置”不是64天，也不是每月最多64个事件；不改变日历／城市／军团的其它时钟。

### 1.2 范围

- 2FBF当前页入队、301C延迟入队、2BD9移页和初始化、31AE事件泵。
- 直接受影响的生产者返回后继：外交、预算、天气、月度武将去向；只追本次改变可能影响的路径。
- 同位置批处理与真实 handler／消息返回后的势力tick后继。
- 事件状态权威、保存校验、恢复、旧D2-C旁表退役策略。
- type11区域天气及type12灾害延迟清除的跨月上下文合同。

### 1.3 非目标

地图尺寸、城数上限、道路费用域、D4选城公式、战术机制、UI风格、copy/draft退役、生产迁移、任意新事件类型均不在本任务。发现相邻缺陷先登记影响，不借机全仓修复。

尤其：扩容城市可能穿过事件 arg0 byte 等身份门。必须检查所用193/257/512探针是否有效；若发现截断，列为独立依赖／差异决策，不能暗扩4字节载荷，也不能用绕过生产者的合成事件冒充扩容全链通过。

## 2. 必读入口与证据纪律

先读 `E:/Dragon/AGENTS.md`、仓库 `AGENTS.md`、[journal](checkpoint-journal.md) 当前摘要与§178–184、本文，以及 [扩容计划§9.4–9.7](city-capacity-expansion-plan.md)。本任务非编辑器UI改造，无需默认加载全部地图设计。

相关技能（实现前全文读取，不能只看名称）：

- `E:/Dragon/.agents/skills/re-domestic-diplomacy/SKILL.md`
- `E:/Dragon/.agents/skills/re-data-formats/SKILL.md`
- `E:/Dragon/.agents/skills/re-post-battle/SKILL.md`（301C／5940）
- `E:/Dragon/.agents/skills/re-march-engagement/SKILL.md`（若触及主调度／月结续段）
- UI消息所有权变更时再加载对应UI技能；工具检查按当前可用LSP技能执行。

历史技能中的“App v2未开放”等语句按各自批次证据范围理解，不用来撤销现行双布局产品准入。发现合同冲突须核对适用边界，不按文档新旧猜结论。

### 2.1 原证入口

| 主题 | 详细维护源／入口 | 必须复核的边界 |
| --- | --- | --- |
| 页轮转／消费 | [外交§2.1](re-notes-ai-diplomacy.md#21-city-capacity-1c0事件移页与消费边界复核) | 2BD9..2C10、31AE..31F2；游标推进先于handler，消费不清槽 |
| 当前页入队 | 同上及2FBF..301C | 随机起点、只向后、满CF=1、返回影响生产者 |
| 延迟入队 | [去向§9.3](re-notes-legion-fate.md#93-301c搜索两word写与cf实锤及明确工程域) | 301C..304E，两word写序，满CF仍0，域外读不等于full |
| 月结次序 | 外交§2.1、5358..53C6 | 585F先于2BD9；5715/578F/22DB/2286/57FE后于移页 |
| 天气 | 原天气窗口及相关re-notes索引，由P1定位 | 22DB写bounds条件、34A6/237E读bounds、34EB清除入队 |
| 消息返回 | 外交及财政／去向对应handler证据 | 通知和强制接见不能统一视为已返回 |

复用已有可复核原窗／SHA，不重做整程序逆向。测试运行前检查实际I/O；原窗复核输出记录输入SHA、地址范围、调用关系与适用域。新发现回流相应re-notes；本文仅链接摘要。

### 2.2 现有代码定位入口（不是原证）

`web/src/game/navigation/` 下：

- `originalweather.js`：2FBF、22DB、2286及灾害处理。
- `originallegionfate.js`：301C。
- `originalmonthlydiplomacy.js`：resetEventMonth／2BD9。
- `originalevents.js`、`scenarioevents.js`：31AE及场景适配。
- `strategiceventoverflow.js`：D2-C capture／drain。
- `scenarioweather.js`、`scenariomonthlydiplomacy.js`、`scenariomonthlybudgets.js`、`scenariolegionfate.js`：生产适配。
- `web/src/game/ai.js`、`savegame.js`、新局／恢复装配、clock及消息所有者：实际调用与禁存链，按调用图定位。

先用 CodeGraph 导航；超时或索引不足时记录限制，再用限定范围文本定位和 read。不要为导航失败擅改全局权限或删锁。

## 3. 起点审计：已知不等于已修

以下为本次代码阅读判断，尚未由本轮端到端探针认证：

1. D2-C只在入队失败时存4字节载荷＋sequence，缺原到期位置；2BD9清页3后排入该页，需要后续轮转才到当前页，不是本月末即时处理。
2. 正常当前页未消费尾部仍会随移页覆盖，旁表不能解决这类丢失。
3. 2FBF捕获溢出后仍返回 `inserted:false / cf:true`；22DB遇false立即返回，不写本次bounds，但type11载荷已留在旁表。
4. 既有 `verify_event_overflow_side_table.mjs` 检查捕获、排空、apply等，不证明真实天气生产后延迟执行的上下文正确，也不证明完整snapshot→JSON→restore。
5. 原生4字节没有sequence空间 **不是实现阻塞**；调度元数据可在Web结构存储。真正阻塞是时间、顺序、后继副作用与共享状态合同。

P1必须用隔离输入复现第3项的生产→返回→状态／旁表差异，不能仅重复本段文字。旧测试保留为历史行为描述还是改写，须由新合同决定；不能将错误现状固化为新目标。

## 4. 推荐模型与必须冻结的决定

### 4.1 结构建议（非最终字段schema）

```text
每月64位置；原7/10分频
       ↓
到期位置 → [event A, event B, ...] → 串行handler／消息返回 → 本次势力tick后继
                 ↑
Web元数据：目标月／位置、有效执行月／位置、稳定sequence、消费状态
载荷：原四字节；必要的事件上下文另按批准合同表达
```

- 先保原向后寻找空位；只在拥挤／迟到边界采用批准扩展。sequence只作同到期位置的稳定次序，不全局按生产顺序重排。
- 逻辑空位／历史占位／待消费／正在处理／已消费必须区分；消费后不能立刻变成可复用空槽。
- 月份使用与月结生命周期绑定的逻辑纪元或等价表示，不用墙钟时间。原目标与carry后的有效位置是否分别保存，在P1给出最小字段方案。
- 一个规则状态只有一个权威。可保留原4字节IO兼容投影，但必须声明主状态和派生视图；不能让旧轮、旁表、新队列三处独立派发。
- 原生低层证据函数与Web策略边界须清晰。推荐保留无扩展IO的原语义用于原窗对照，生产适配接Web扩展；不得因mock缺hook意外让生产退回丢事件。
- 调度元数据可JSON化，不存闭包／DOM／Promise。业务消息续段仍沿现有所有者，不创建第二套通用工作流引擎。

### 4.2 决策表（全部须有状态和来源）

状态只能填“待确认／已确认／被替代”，已确认须引用用户确认文本或可复核会话标识。生成本文时均为待确认，历史批准的C方向不能自动补齐具体语义。

| ID | 推荐内容／需冻结问题 | 默认状态 |
| --- | --- | --- |
| D0 | 扩展适用于哪些运行世界：建议同一引擎一致启用，不按192/193分叉；无差异路径保持一致，192满页也明确属于Web差异 | 待确认 |
| D1 | 2FBF仍先寻找空位；后续无空位且月末未消费时放月末列表。**原目标已超月末**时，按当前页请求落月末还是按目标延期？必须单独决定，不能混为“拥挤” | 待确认 |
| D2 | 301C保留原游标＋delay与搜索范围；满轮溢出应不早于合法请求目标及已搜索尾部，确定具体落点。不能一律塞本月末导致提前。起点0400h等未证域继续fail-closed，不当作full接收 | 待确认 |
| D3 | 旧月未消费事件与末槽后到达事件携带到下一可执行位置；建议新月首次正常到期边界执行（仍等首7次），旧到期事件先于新月同位置事件。明确有效位置、稳定排序与多月carry，不在移页回调里立即派发 | 待确认 |
| D4 | 同位置游标只推进一次，各handler再入队共享已推进游标；本批消息全部返回才走原势力tick后继。再入队不能重入当前执行列表；页尽且无待处理时保持原分频行为 | 待确认 |
| D5 | 明确“原槽写入”与“Web接受”的返回含义；成功保留溢出后生产者走成功后继，不能false又未来执行。301C原CF不能被改成新的失败协议 | 待确认 |
| D6 | 区域天气建议绑定事件所属区域，但必须同时冻结区域何时生效、清除、多个区域重叠与显示关系；只加bounds快照不算合同完成 | 待确认 |
| D7 | 同城灾害旧清除作用于新灾害的规则：先追原链，再决定继续共享读／按实例绑定。代次保护、合并、取消旧事件均非默认授权 | 待确认 |
| D8 | 新旧快照与D2-C旁表兼容：建议新格式明确版本；缺到期信息的旧非空旁表拒绝无损转换，不猜时间、不静默丢弃。拒载提示、旧空表／无表快照是否允许转换及fresh初始化分别冻结；不删除真实旧档 | 待确认 |

**审核时必须提供至少四组示例：** 当前页拥挤、请求目标超月末、301C远期满轮、旧月未消费尾部与新月同位置碰撞。每组给入队前后位置、返回值、RNG计数、月份轮转及实际派发顺序。

D6/D7复杂度是真实失败模式，不是泛化安全设计：事件跨月后共享状态已被下一次生产改写。若批准范围不足，报告方案成本和影响，暂停相关正式接线；不要为了“goal必须完成”自己裁决。

### 4.3 必须恒成立的不变量

- 每条已接受事件：处于待处理／正在处理／已返回状态之一；无静默消失、无同一事件重复派发。handler合法无效果返回仍算完成。
- 未触发Web差异的同输入执行：槽选择、游标／分频、RNG序列、写回与后继顺序一致。
- 跨月保留事件按批准的到期顺序执行；sequence不替代到期时间。
- 同位置多个事件不额外推进势力／日历时间；消息打开不消费下一事件；返回后本次势力后继恰好一次。
- 不早于批准目标；2FBF跨页请求的特例只能依据D1明确决定，不悄悄套用301C规则。
- 排队／carry／排序零RNG；拥挤时因多执行事件而引起的后续RNG轨迹变化必须如实标为Web差异，不能声称整局RNG不变。
- 已完成旧槽的历史占位保留到其合法轮转边界；原两word写失败的前缀语义不得被“统一事务化”抹平。
- 不支持域明确失败且不装配半份恢复态；不能自动补0、补空页或退回legacy掩盖错误。

## 5. 分阶段任务与放行门

### P0：重建现场与基线（无运行修改）

- [ ] 核 HEAD／status／当前goal；不假定journal中的旧哈希、端口、库状态仍有效。
- [ ] 用户显式委派后才创建goal；已有非complete goal先核范围，不擅自替换。
- [ ] 读取§2适用资料，建立本轮独占输出目录及证据账本；写入前审查忽略规则，避免提交运行数据。
- [ ] 盘点本机既有服务，只读辨认所有权；测试新建store和profile，不重启他人实例。
- [ ] 审测试脚本I/O／参数，选择最小基线并记录命令、退出码、输入身份和失败。

产物：基线表、适用读物、修改前快照身份。退出门：安全隔离明确；未知失败不得提前贴“基线已有”。

### P1：有界审计与产品合同冻结

- [ ] 复核§2.1原窗及关键调用链，原结论分“实锤／推断／未知”；已闭合分类不重开。
- [ ] 覆盖所有现行入队适配器、月结两侧、初始化、泵、handler返回、保存的实际接线，检查是否有绕过路径。
- [ ] 复现§3第3项；跟到22DB返回及后续type11消费，记录共享bounds变化，不接产品修补。
- [ ] 核type12产生、清除延迟、同城再发生的状态写序；仅追受影响范围。
- [ ] 完成D0–D8方案、差异表和示例，定义单一权威schema及旧快照策略。
- [ ] 明确2FBF／301C溢出不同时间域、两word前缀、异常恢复和月纪元初始化。
- [ ] 一次性汇总真正需用户决定的事项；记录批准后再进P2。

退出门：没有未决定的行为被写进正式规则；无关原机制未知不得升级为全任务停工。

### P2：最小调度核心与隔离测试

- [ ] 实现经批准的64位置列表／元数据；按实际复用需求划分模块，不造通用调度框架。
- [ ] 入队、占位、carry、顺序、同位置处理边界；保存输入在归属边界验证一次。
- [ ] 原始4字节payload与调度元数据分离，声明旧IO兼容投影及单一权威。
- [ ] 写独立预期的确定性状态轨迹测试，不用被测排序／换算函数生成oracle。
- [ ] 覆盖安全整数sequence／纪元、重复序号、无效位置等边界；不为遥远计数溢出添加重编号机制，非法输入明确拒绝即可。

退出门：§6核心矩阵通过；尚未接生产不得称功能完成。隔离实现不能成为长期第二引擎。

### P3：生产者、月结与上下文接线

- [ ] 接所有实际生产适配器，冻结返回含义；检查缺hook路径不让真实场景悄悄丢弃。
- [ ] 2BD9保移页时点及外交后继；fresh只初始化一次、restore不重放新局／月结。
- [ ] 585F在移页前的301C按旧月游标换算；其它生产者在移页后依新月状态入队。
- [ ] 按D6/D7实现天气上下文完整生命周期；未批准分支不能偷偷保留一个“不太对但不丢”的fallback。
- [ ] 对192正常路径作原证支持的对照，对拥挤差异作新合同对照。

退出门：真实生产→接受结果→后继写回→后续消费可复核；不仅是直接调用新核心。

### P4：事件泵、消息和势力tick接续

- [ ] 接31AE边界及真实dispatch，不以UI FIFO充当规则队列。
- [ ] 同位置A返回再B；A挂起则B及势力维护均不运行；最后返回后原后继只运行一次。
- [ ] handler再入队使用固定已推进游标；处理中的列表和后来接受的事件不能因循环长度变化重入／抢跑。
- [ ] 覆盖普通通知、多步预算／外交接见、故障及场景切换；沿现有hold、身份和continuation所有权。
- [ ] 已知未支持handler维持原fail-closed，不为清空队列伪造成功。

退出门：真App调用及消息返回轨迹通过，故障保前缀／禁存正确；未完成续段仍不可保存。

### P5：保存恢复、兼容与旧旁表退役

- [ ] 新格式完整capture→JSON.stringify/parse→保存库→恢复准入→装配→继续运行，非仅apply测试。
- [ ] 未消费列表、顺序、月纪元、游标／分频、必要上下文均保留；恢复不额外抽RNG、不重跑2BD9。
- [ ] 坏schema／重复sequence／坏位置／缺上下文／非法值拒绝，当前世界和已选存档不被半安装覆盖。
- [ ] 根据D8处理旧无表、空表、非空旁表三类输入；无法恢复的历史到期信息明确承认，不猜造。
- [ ] 删除或转为明确只读兼容的旧capture/drain生产路径；检索生产hook，确保无双派发或回落旧page3排空。
- [ ] 不顺带升级IndexedDB库版本／发布包schema；确有必要须列出具体依赖并先确认。

退出门：保存前后后续trace、RNG和最终状态一致；禁存／事务失败／跨窗口CAS等受影响守卫有适用覆盖。

### P6：集成验收、文档回流与交付

- [ ] 跑§6完整适用矩阵，串行重任务；有失败先判范围，不能把所有旧失败都归为环境。
- [ ] 真浏览器隔离会话验证消息串行、月界、保存／标题恢复；使用现有依赖，不擅自安装。
- [ ] 改`web/src/**`后重建共同Trial bundle并核产物；核登记身份是否受影响，不自行重录／放宽pin。
- [ ] 变更JS语法、支持路径主动LSP、`lens_diagnostics mode=all`及最终diff；超时／空缓存不称clean。
- [ ] 本文账本更新状态，原证新发现回对应re-notes；journal记录批次、测试、差异及剩余项；检索撤销“D2未做／只page3排空”等已失效现行摘要，历史条目标注后继而非篡改历史。
- [ ] 按§8完成逐项审计，再决定goal complete；无commit/push授权则本地未提交交付。

## 6. 最低验收矩阵

这些是**待合同冻结后**必须覆盖的场景，不预先替D1–D8规定未批准结果。每行须关联测试文件／命令／输出／输入范围。

| 编号 | 场景 | 必须证明 |
| --- | --- | --- |
| V01 | 192正常未满、各延迟边界 | 原槽、游标、分频、RNG和副作用一致；没有carry等差异触发 |
| V02 | 2FBF当前位置后满／无空位／请求跨月末 | 对应D1不同原因的准确落点、接受返回及生产后继；不重复抽随机起点 |
| V03 | 301C当前／未来页、满轮、边界外起点 | 不提前；普通／满CF原契约保留；未知读仍停，不强行接收 |
| V04 | 月结前cursor63＋delay2 | 旧位置65经轮转为新位置1，不误成新位置2 |
| V05 | 同位置A/B各再排delay6 | 游标只前进一次；与原槽0消费后目标7的对照一致 |
| V06 | 旧当前页尾部未消费、连续多月carry | 顺序不丢不重，已消费历史槽不重新执行，未来事件不被提前 |
| V07 | 末位置已经消费／cursor64／divider0下溢 | 迟到处理按D3；无事件时不造额外消费；新月仍遵首7 |
| V08 | 同位置事件数1/2/64/65/较大有限批次 | 批次容量不再是64条，顺序稳定；无任意截断／静默丢尾 |
| V09 | A通知→B强制预算→C无消息 | A/B返回前禁止后继，最后返回才继续同一次势力维护；无重叠接见 |
| V10 | handler故障／消息后故障／场景切换 | 保原已提交前缀、hold／禁存；无自动重试重放及过期回调写入新局 |
| V11 | 区域天气满页、跨月另一区域 | 接受返回与区域写回一致；执行、清除和展示按D6，不读错上下文 |
| V12 | 同城灾害再发生＋旧清除到期 | D7选择有明确轨迹，不能用“合理”替代批准规则 |
| V13 | 正式JSON保存恢复后继续数月 | 原/恢复两条轨迹的待处理顺序、RNG、结果完全一致，包含overflow/carry |
| V14 | 新旧／损坏快照、空与非空旁表 | D8准入明确，失败不修改当前局，不删除旧档，不生成假历史 |
| V15 | 真实193链＋合法257/512探针 | 标明真实编译可玩或合成容量测试；检查载荷身份域，不把队列测试冒充全扩容证明 |
| V16 | 实际生产适配／原语义detached夹具 | 生产一条统一路径，无hook遗漏、双队列、双派发；原证对照仍独立成立 |
| V17 | fresh／restore／月结消息挂起 | 初始化次数、纪元推进、月结前后生产相对顺序正确；restore不重放 |
| V18 | 写入失败边界及非法状态 | 两word已提交前缀不被抹平；新元数据失败策略明确，无半份可继续状态 |

数量守恒可作辅助断言：初始待处理＋成功接受＝已返回＋仍待处理＋当前正在处理（各身份只计一次，合法handler无效果也计已返回）。不得借该公式新增事件去重；sequence仅用于追踪／排序，不允许将相同payload视为重复。

### 6.1 已有验证入口与执行纪律

下列文件在计划生成时存在；执行者须先读脚本和依赖，核参数、夹具、I/O与适用域，再逐个运行。**不是一键全跑授权，也不是本轮已经通过。**

- 原证／队列：`tools/verify_city_capacity_event_boundaries.mjs`、`tools/verify_strategic_event_rng_raw.mjs`、`tools/verify_event_overflow_side_table.mjs`。
- 月结／生产：`tools/verify_native_monthly_diplomacy.mjs`、`tools/verify_native_monthly_budgets.mjs`、`tools/verify_native_monthly_fiscal.mjs`、`tools/verify_native_legion_fate.mjs`。
- 天气：`tools/verify_native_weather_events.mjs`、`tools/verify_native_weather_monthly.mjs`、`tools/verify_native_weather_objects.mjs`、`tools/verify_weather_regional_sampling.mjs`、`tools/verify_weather_city_disasters.mjs`。
- 消息／消费：`tools/verify_native_budget_consumer.mjs`、`tools/verify_budget_message_ui.mjs`、`tools/verify_general_fate_event.mjs`、`tools/verify_strategic_negotiation_events.mjs`、`tools/verify_incoming_diplomacy_events.mjs`。
- 保存／生命周期：`tools/verify_game_save_snapshot.mjs`、`tools/verify_game_save_runtime.mjs`、`tools/verify_save_transition_guard.mjs`、`tools/verify_app_save_ownership.mjs`、`tools/verify_save_repository.mjs`、`tools/verify_clock_transition.mjs`。
- 浏览器候选：`tools/verify_clock_browser.mjs`、`tools/verify_weather_browser.mjs`、`tools/verify_player_fate_browser.mjs`；需要为本任务补足同位置多事件及携带场景，不能只跑首页。
- 扩容：`tools/verify_city_capacity_admission.mjs`；更深链按变更选择，不恢复已退役Trial。

新增测试名称由执行者定，不得在文件未建立前记录为已运行。已有失败须保留输出，并用不覆盖当前改动的隔离基线证明归属；不能stash他人未知改动来换绿。

## 7. 执行账本模板（后继在本文更新）

初始状态（计划生成时）：P0–P6全部未开始；D0–D8全部待确认；本计划未运行游戏回归。
当前状态（2026-11-17 本轮）：P0、P1 完成；P2–P6 未开始。

| 阶段/需求 | 状态 | 文件/原证/批准来源 | 命令及结果 | 剩余缺口/下一步 |
| --- | --- | --- | --- | --- |
| P0 现场与隔离基线 | 完成 | HEAD `cc6cd1d`；KI `fffeba…`；§2.1 五窗 SHA | 5 个 `node tools/verify_*.mjs` 全通过（§10.2）；端口只读辨认 | 无 |
| P1 原窗与调用链复核 | 完成 | [外交§2.1](re-notes-ai-diplomacy.md#21-city-capacity-1c0事件移页与消费边界复核)、[去向§9.3](re-notes-legion-fate.md#93-301c搜索两word写与cf实锤及明确工程域)、[扩容§9.7](city-capacity-expansion-plan.md#97-c0事件边界测试与d2缺口收敛) | 同上＋静态接线审计（§10.5） | 已闭合分类不再重开 |
| P1 接缝复现（§3 第1–5项） | 完成 | 三个隔离探针（§10.3–§10.6，`.dragon-analysis/d2-event-64/`） | 真实生产适配器＋真实 2BD9／泵／消费者 | 无 |
| P1 合同草案与决策包 | 完成，已确认（2026-11-17 全部 (a)） | §11＋§11.5 确认记录 | 四组示例＋D0–D8＋S1 | 无 |
| P2 调度核心与隔离测试 | 完成（本地） | `web/src/game/navigation/strategiceventschedule.js`；`tools/verify_d2_event_schedule.mjs` | 9/9 通过（§12.4） | 无 |
| P3 生产者／月结／上下文接线 | 完成（本地） | 2FBF／301C 原叶＋五个适配器；S1＝`ai.js enqueueDelayedStrategicEvent` | §12.2／§12.4 | D6/D7 仅对离开原轮的记录带快照 |
| P4 事件泵／消息／势力后继 | 完成（本地） | `scenarioevents.js`（batch）＋`ai.js`（串行、tick 一次；304E 含调度条目） | 链测试 D4 用例＋304E 用例（9/9） | 无 |
| P5 保存恢复与旧旁表退役 | 完成（本地） | `savegame.js`；删除`strategiceventoverflow.js`与旧测试 | 8/8 链测试 D8 用例＋真实 Chromium 菜单存档往返（§12.5） | 非空调度条目的浏览器 IDB 往返仍只由引擎链覆盖 |
| P6 集成验收与文档回流 | 进行中 | §12 | 20 个 `tools/verify_*` 全绿（§12.4） | 浏览器 E2E、LSP 结论、journal |

每轮交接另记录：HEAD、自己修改路径、非自己修改、测试输出位置、当前决策状态、可执行下一步。不要将token耗尽或会话结束记为目标完成。

## 8. 完成审计与goal状态

只有以下全部满足才允许 `update_goal(status="complete")`：

- [ ] D0–D8已有明确决定，实施与决定一致；未支持域在用户认可的最终范围内明确排除，不暗缩范围。
- [ ] P0–P6交付齐全；所有真实生产适配、泵、消息续段、月结、保存与恢复无遗漏。
- [ ] V01–V18有具体证据；任何不适用项有依赖审计和明确理由，不用NA遮盖缺测。
- [ ] 旧D2-C排空不再与新队列并行工作；天气“false但未来执行”的接缝有真实回归。
- [ ] 适用测试、构建、语法、主动LSP和最终diff已核；检查失败／inconclusive不得写成通过，影响交付的缺口已解决。
- [ ] 新原证、Web差异、现行文档与测试一致，运行数据／缓存／秘密未进交付diff。
- [ ] 最终报告分开“本地已验证／未验证／待审批／生产未动”，没有用commit/push代替验收。

如果只完成P1：整个实施goal仍未完成。缺用户决定且其余无可做工作时用 `blocked`，原因列出D编号及选项，提示明确 `/goal resume`。`waiting`只用于会自行发送结果的具名后台任务，不用于等用户；不轮询这种后台任务。goal工具使用当前实际暴露名称，不能臆造工具名。

## 9. 新会话委派文本

建议从仓库根 `E:/Dragon/web-port` 开始；若从 `editor-ui` 开始，先声明根路径和工具覆盖限制。**本段已由 2026-11-17 会话使用并执行；保留为委派记录。**

```text
/goal 按 E:/Dragon/web-port/docs/d2-event-scheduler-plan.md 执行 D2-EVENT-64：保留64位置与7/10势力tick节奏，完成获批准的拥挤／跨月不丢事件调度及生产、消息续段、保存恢复全链，并按计划验收。先读两级AGENTS、最新journal、该计划和相关SKILL，检查当前goal与工作树，保留其它会话改动。

先自主推进P0/P1及隔离审计探针，复核已有原证，不重开全事件分类。本文只批准执行流程和设计方向，不替代D0–D8的具体产品确认：结合既有明确授权填决策表，缺项一次性给我选项／推荐／影响；确认前不得把待定规则接入正式路径。先做其它独立工作，确需我决定才blocked并提示/goal resume。

确认后继续P2–P6，不停在方案或孤立单测。重点防止2FBF捕获后仍报失败却未来执行、301C远期事件提前、月结前后错位、消息未返回就消费下一条、旧旁表双派发，以及旧存档缺到期信息被猜造。禁止访问真实SAVE.DAT、用户profile/存档或真实dev库；测试隔离。不得提交、推送、部署或迁移生产，不擅自重录pin或放宽身份门。

以计划V01–V18和完成清单逐项提供证据；未完成／阻塞／未跑检查如实登记，不能仅因测试若干项通过、token耗尽或会话结束将goal标complete。全部已授权低风险下一步应继续执行。
```

若用户只想先审合同，可将goal限定为P0/P1，但必须明确那是“设计审计目标完成”，不是D2全量实施完成。后续批准可以直接记录“批准D0…D8中哪些推荐／另选哪些具体语义”，然后 `/goal resume`；不能只记录含糊的“已批准所有细节”。

## 10. P0／P1 执行记录（2026-11-17，仅本地；未提交、未推送、未部署）

本节记录**本轮实际执行**的命令、输入与结果。探针只读仓库模块与 `web/data.json` 夹具，纯内存；未读 `SAVE.DAT`、用户 profile／IndexedDB、`.dragon-analysis/dev`。

### 10.1 现场与隔离

- HEAD 仍为 `cc6cd1d`；工作树只有上轮文档改动：`docs/checkpoint-journal.md`、`docs/city-capacity-expansion-plan.md` 已修改，`docs/d2-event-scheduler-plan.md` 未跟踪；无其它会话的运行代码改动，未 stash／reset。
- 本机监听：`127.0.0.1:5173`（journal 记录的 dev_editor）、`127.0.0.1:8443`（另一实例）。只读辨认所有权，未重启、未连接其 store。
- 本轮输出目录 `.dragon-analysis/d2-event-64/`（`.gitignore` 第 43 行 `/.dragon-analysis/` 已忽略；叶目录独占，不覆盖旧轮）。

### 10.2 基线命令与结果

| 命令 | 退出码 | 结果 | 覆盖 |
| --- | --- | --- | --- |
| `node tools/verify_city_capacity_event_boundaries.mjs` | 0 | 5/5 pass | KI 五窗 SHA（2BD9..2C10、2FBF..301C、301C..304E、31AE..31F2、5358..53C6）＋移页／消费／跨月对照 |
| `node tools/verify_event_overflow_side_table.mjs` | 0 | 5/5 pass | D2-C 捕获／排空／存档 apply（mock io） |
| `node tools/verify_strategic_event_rng_raw.mjs` | 0 | OK | EC82 播种、2BD9／2FBF／31BE 时序字节 |
| `node tools/verify_native_weather_monthly.mjs` | 0 | 8/8 pass | 22DB／2286 生产适配器 |
| `node tools/verify_native_weather_events.mjs` | 0 | 5/5 pass | 31AE 与 type11 适配器边界 |

日志在 `.dragon-analysis/d2-event-64/p0-*.log`。KI 只读 SHA 仍为 `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`。

### 10.3 复现 §3 第 3 项：2FBF 捕获后报失败，却在未来执行

夹具：真实 `performScenarioMonthlyWeatherEvents`（192 城、256×4B 轮、`_disasterBounds`=全图哨兵 `{-16,400,-16,400}`）；RNG 固定 `[1,0,0]` 后全 `255`（230C=1、2313=城0、2333=delay32 槽，2286 两道门均不过）；城 0=(200,90)、城 1=(197,92)、城 2=(192,190)、城 3=(190,186)、城 100=(196,146)，全部非玩家（不触发 TALK70 边界）。探针：`.dragon-analysis/d2-event-64/p1-probe-seam.mjs`。

| 场景 | `areaQueued` | `bounds` | 旁表 | RNG 字节数 |
| --- | --- | --- | --- | --- |
| 槽 32 空（对照） | true | `{minX:195,maxX:205,minY:85,maxY:95}` | 未建表 | 387 |
| 当前页 64 槽全占 | false | 不变（全图哨兵） | `[{type:11,seq:0}]`（键只有 type/arg0/arg1/arg2/sequence） | 387 |

- 对照执行（bounds 已写）：中心 (200,90)，受灾城 0=24、1=23、109=15、110=14——即预期区域。
- 捕获路径：2BD9 轮转 1 把旁表排进页 3 槽 0；轮转 2／3／4 逐页前移；轮转 4 后到达当前页槽 0；31AE 派发 type11（游标 0→1、divider=10）。
- 执行时读共享 bounds：全图哨兵 → 中心 (192,192)，受灾城 2=23、3=21（图心，**不是**城 0）；若此时 bounds 已被后续月改成 `{190..200,140..150}` → 中心 (195,145)，受灾城 100=24（另一个区域）。
- 时间线：月末 M 捕获（原目标为次月 M+1 当前页槽 32..60）→ M+1 月末排空进页 3（=M+5）→ 再经 3 次轮转 → **M+5 才可能派发，比原目标晚 4 个月**，且区域上下文已非产生时状态。

结论（Web 现状，非原版）：捕获只保存 4 字节载荷＋sequence，不保存目标月／位置／bounds；`inserted:false` 使 22DB 提前返回、不写本次 bounds、也不把事件放进 `queued`。

### 10.4 301C 远期满轮与 2FBF 跨页请求

| 请求 | 计算目标 | 返回 | 捕获 | 现状实际落点 |
| --- | --- | --- | --- | --- |
| 301C cursor0＋delay200 | 槽 200＝页 3 槽 8＝M+4 位置 8 | `inserted:false, cf:false, offset:0x400` | `{type:12,seq:2}` | M+1 轮转排空 → 页 3 槽 0＝M+5 位置 0（比请求晚约 1 个月） |
| 2FBF cursor40＋delay32 | 字节 288≥0x100（原版**立即 STC**，不扫描） | `inserted:false, cf:true, offset:288` | `{type:11,arg2:0x10,seq:1}` | 同上 → M+5 位置 0（若按绝对位置应在 M+2 位置 8，晚约 3 个月） |

### 10.5 接线审计（生产／消费／保存／初始化）

生产（native 路径全部经 `web/src/game/navigation/`）：

| 生产者 | 模块 | 原语 | 原目标 | 现返回值含义 | 现状偏差 |
| --- | --- | --- | --- | --- | --- |
| 2BD9 类型 1/2/3/8（外交／迁都／宣战） | `originalmonthlydiplomacy.js:58` | 2FBF | `0xff`→随机 0..31 槽＋cursor | 忽略（内部） | 满页即捕获，2BD9 不报告 |
| 5715 类型 4／578F 类型 5 | `originalmonthlybudgets.js:39/190` | 2FBF | `0xff`→随机 | `queued` 只含 `inserted:true` | 捕获时不进 `queued`，预算接见延后 |
| 22DB 类型 11 | `originalweather.js:290` | 2FBF | 32..60 槽＋cursor | `areaQueued`＋写 bounds | 捕获时 `false`、不写 bounds（§10.3） |
| 2286 类型 12 | `originalweather.js:314/325` | 2FBF | `0xff`→随机 | `cityQueued` 只数 `inserted` | 捕获不计数 |
| 57FE 类型 13 | `originalmonthlybudgets.js:190` | 2FBF | `0xff`→随机 | `queued:inserted` | 捕获时 `queued:false` |
| 585F/5940 类型 9 | `originallegionfate.js:174` | 301C | `(random&15)+8` | 不读 `inserted`（CF 恒 0） | 满轮捕获后照常推进 |
| 291A handler 类型 9 | `originallegionfate.js:174` 同族 | 301C | 见 §9.3 | 不读 | 同上 |
| 34EB 类型 12 清除 | `originalweather.js:248` | 301C | `(rng&7)+6` | 不读 | 满轮捕获后清除延后 |
| 进言提交 类型 6（6548→300E）／类型 7（66A9→301C） | **缺失**：`gamebar.js:2940/3238/3364` 仍走 `enqueueDelayedStrategicEvent` | — | `0x14` | legacy | native 场景下 `rejectNativeGeneralLifecycle` 抛 `legacy event wheel`（fail-closed，见 S1） |

消费与保存：

- `tickStrategicWarEvents` → `consumeScenarioStrategicEvent` → `originalEventPump31AE`（游标先＋4，再派发；实锤）→ `dispatchStrategicEvent`。消息打开时 `_strategicEventPostMessageRngPending=true` 且 UI `_clockHoldRequested`；`tickFactionStrategicState` 改为 `_factionTickDeferred`，消息返回后 `finishDeferredFactionTick` 恰好执行一次。
- `canSnapshotState` 在 `gamebar._strategicMessageActive`、各 native continuation 期间禁存；`applyWebMetaToState` 仅在字段存在时复制（旧档无 `strategicEventOverflow` 时保持缺键）。
- fresh 新局由 `initializeStrategicDiplomacy`→2BD9 初始化 cursor=0／divider=7；restore 读取已存值（presence 门）；事件轮由 `nativeStrategicEventRaw`（20 章全零）解码。

### 10.6 新发现：恢复边界不校验旁表，坏记录会被截断后进入轮子

探针：`.dragon-analysis/d2-event-64/p1-probe-restore.mjs`、`p1-probe-adapter.mjs`（后者用 `web/data.json` 第 16 章＋真实 `performScenarioMonthlyDiplomacy`）。

- `applyWebMetaToState` 接受 `{type:0x1ff, arg1:-1, arg2:0x10000, sequence:-3}` 原样写入，没有任何范围校验。
- 真实适配器排空 `{type:0x1ff,arg0:1,arg1:0,arg2:0}`：不报错，页 3 槽 0 变成 `{type:255,arg0:1,arg1:0,arg2:0}`（第一 word 按字节截断），旁表清空；该槽日后派发时 `dispatchStrategicEvent` 抛 `Uncovered native strategic event type 255`，进入 hold／禁存。
- 对照：合法记录 `{type:11,...}` 正常排入页 3 槽 0，旁表清空，RNG 0 次。
- 301C 第二 word 写失败：第一 word `0x0709` 已提交、第二 word 仍为 0（独立 MOV 前缀），异常外抛。
- 半条当前页记录（type/arg0 有、arg1/arg2 缺）在 31AE 读取第二 word 时抛 `Uncovered native event arg1`；此时 divider 已被重置为 10、游标未前进，因此下一次到期会再次读同一槽并再次失败（无自动修复）。

这是 P5／V14／V18 的必做项（恢复时一次性校验并在失败时不半安装），与 D8 的格式选择独立。

### 10.7 结论分级

- **实锤**：§2.1 五窗字节；2BD9 覆盖旧当前页（含未消费）；31AE 先推进游标再派发、消费不清槽；2FBF 跨页立即 STC；301C 普通插入／满轮 CF 均 0；22DB delay 32..60 槽、34EB delay 6..13 槽；301C 两 word 独立提交。
- **推断（证据基础为实锤）**：原版 type11 只要成功入队，就必然在当月内被派发（delay 32..60 槽＋每槽 10 小时≈13..25 天），所以执行时读共享 bounds 仍是产生时的区域；原版 type12 清除（约 2.5..5.4 天）总早于下一次月度生产，因此无条件清除不会误清。
- **未知／不在本任务**：FF 间接调用与自修改代码（见 `verify_native_event_producer_audit.mjs`）；不阻塞本任务。
- **Web 现状（非原版）**：§10.3–§10.6 全部为当前实现的工程事实，不构成原版机制。

### 10.8 四个 SKILL 复核（2026-11-17，全文／相关节）

- `re-domestic-diplomacy` §8.1：`0x301C` 的 `BL` 是**槽偏移**，从 `D20+BL*4` 起向**四页末尾**（0x400）顺序寻空，不是日历天数；`0x300E` 只是势力指针包装；玩家停战 `0x6548`／请援 `0x6695` 写 4B 后以 `BL=0x14` 调 301C＝当前游标后 20 个槽。`0x2FBF` 用 `rng&0x7C` 选当前页起始槽，只扫当前页剩余；`0x31AE` 自身 0 RNG；type11 起始槽 32..60 步进 4，type12 用直接城市索引、只分配前 16 静态槽。
- 同源 §5／§7：**页满失败仍已消费随机起点那 1 字节**，且「失败保留此前写入」；type1 页满仍 CLC、不进空城回退；type4／type5 满页 RNG 不能省略。这支持 D5：carry／旁表不得重放或补扣 RNG。
- `re-post-battle` §8：301C 插入与满队列 CF 都是 0，`5940` 不查 CF，随后照常 `5990`、真正返回后才写 `G1C=18`；type9 出队 `3485→50D7` 不消费 RNG；本链用四页事件轮槽偏移，不是按日／月递减队列。
- `re-data-formats` §3.2：DOS 槽尾 `+0x52C0..+0x56BF` 就是 256×4B 战略事件轮，`0x8CAE/0x8CFF` 完整读写；DOS 侧**没有**「到期时间」字段。因此 Web 旁表是纯 Web 附加物，忽略它不会丢失任何原版状态。
- `re-data-formats` §3.1／`re-post-battle` §7／§8：用户已批准**无需保留旧 Web 存档兼容／保全**，允许覆盖旧格式；新档仍须完整保存规则相位。D8 的推荐 (a) 因此更简单：旧 schema 直接按版本门处理，wheel/cursor/divider 齐全即可视为完整（等价 DOS），非空旁表因无法还原到期时间而拒绝，不做转换器；不新增迁移代码。
- `re-march-engagement`：主调度／月结续段未与本任务的事件轮语义冲突；`0x585F` 在 2BD9 之前、预算事件在其后的时序仍成立（见上文 §10.5）。

## 11. D0–D8＋S1 决策包（待用户一次性确认）

### 11.1 推荐模型（实施约定，非新机制）

- 单一权威：`Web调度表`＝「月纪元 epoch × 64 位置 → 事件列表」；4 字节轮只作为其**投影**用于原窗对照与原版下游读法，入队先写投影、投影放不下再写调度表；派发读调度表。禁止旧旁表／新队列／4 字节轮三处各自派发（P5 删除旧 capture／drain 生产路径）。
- 位置的绝对编号＝`epoch*64 + slot`；sequence 只在同一位置内稳定排序。所有排队／carry／排序 0 RNG。
- 计划元数据可 JSON 化；业务消息续段仍由现有 continuation／消息所有者承担。

### 11.2 四组示例（审核用）

| # | 场景 | 原版 | 现状（D2-C） | 推荐（若 D1–D3 按建议） |
| --- | --- | --- | --- | --- |
| 1 | 当前页拥挤：cursor 0、delay 32、64 槽全占 | 扫描到页尾→CF=1，调用方丢弃 | 捕获 type11（无位置／bounds）；`areaQueued:false`；M+5 在图心或别的区域结算（§10.3） | 接受，落到新纪元位置 0 列表（当月已无空位），按原目标槽排序；`areaQueued:true` 且 bounds 按 D6 快照 |
| 2 | 请求超月末：cursor 40、delay 32＝字节 288 | 立即 STC（不扫描），调用方丢弃 | 捕获；M+5 位置 0 | 接受，落到请求的绝对位置（M+2 位置 8），占用则向后找；不早于请求 |
| 3 | 301C 远期满轮：cursor 0、delay 200＝槽 200 | 扫描 200..255→CF=0，调用方按成功继续，实际丢失 | 捕获；M+5 位置 0（比请求晚约 1 个月） | 接受，落到请求位置（M+4 位置 8）的列表表尾；CF 仍 0 |
| 4 | 旧月未消费尾部＋新月同位置：月末 cursor 0、槽 5 有 X；新月在位置 5 产 Y | 移页丢弃 X；Y 在位置 5 | X 未进旁表（捕获只在入队失败时写），直接丢；Y 正常 | X 挂到新纪元位置 0 列表，排在 Z（新月位置 0 事件）之前；Y 在位置 5；派发顺序 X→Y |

每组 RNG：示例 1／4 的 2FBF 固定 delay 路径 0 RNG；随机起点（`0xff`）路径每次入队 1 字节；301C 0 RNG；捕获／排空 0 RNG；执行期 handler 自身 RNG（如 type11 的 34A6、type12 的 34EB）按被派发条数计——多派发即多消费，属已声明 Web 差异。

### 11.3 决策表

| ID | 问题 | 选项 | 推荐 | 影响 |
| --- | --- | --- | --- | --- |
| D0 | 扩展适用于哪些世界 | (a) 同一引擎对 192/193/257/512 一致启用；(b) 仅 193+ 启用，192 保留原版丢弃 | **(a)** | (a) 单一路径，192 满页不丢＝已声明的 Web 差异（D2-C 已如此）；(b) 双派发路径，且要回退已批准的 C 方向 |
| D1 | 2FBF 放不下时的落点 | (a) 页内拥挤→新纪元位置 0 列表；跨页请求（目标≥0x100）→按绝对位置落到未来页，占用则向后，整轮满则挂该位置列表；(b) 全部塞下一轮转页 3（现状）；(c) 丢弃（原版） | **(a)** | (a) 保留请求时间语义、不早于请求；需绝对位置元数据。(b) 现状把次月事件拖到约 4 个月后（§10.3）。(c) 违背不丢目标 |
| D2 | 301C 满轮落点 | (a) 保留原游标＋delay 的绝对目标，占用则沿轮向后扫（可跨月），整轮满则挂该绝对位置列表；(b) 塞下一轮转页 3（现状）；(c) 丢弃（原版，CF 仍 0） | **(a)** | (a) 不早于请求；需绝对位置。(b) 现状晚约 1 个月并丢请求位置。(c) 违背不丢目标 |
| D3 | 旧月未消费事件与 carry | (a) 移页时把旧当前页 cursor..63 未消费事件按旧槽序挂到新纪元位置 0 列表，排在新月同位置事件之前，等新月首次分频到期才派发；(b) 按原槽位搬到新纪元同槽；(c) 丢弃（原版） | **(a)** | (a) 最早合法位置、顺序确定、多月 carry 同一规则；(b) 月末事件再拖一个月且同槽要额外排序；(c) 违背不丢目标 |
| D4 | 同位置多事件与势力后继 | (a) 每位置只推进一次游标；列表按 sequence 串行，消息返回后再下一条；本批列表快照冻结，handler 再入队同位置不得重入本批；最后一条返回后势力 tick 恰好一次；(b) 每条事件推进一次游标；(c) 同位置只执行一条 | **(a)** | (a) 与游标语义一致；多 handler 的 RNG 轨迹变化须标 Web 差异。(b) 破坏 delay 基准与原槽对照。(c) 丢事件 |
| D5 | 入队返回含义 | (a) 生产者面向返回值改为「Web 已接受」`accepted`；`inserted` 保留为原 4 字节写入真值；22DB 在 accepted 时写 bounds／2286 计数／预算与 57FE 返回 queued／301C 保持 CF=0；(b) 保持现状（false 但未来执行） | **(a)** | (a) 需改 5 个生产者及其调用方，消除「报失败却执行」；(b) 现状接缝保留，V02／V11 无法通过 |
| D6 | 区域天气上下文 | (a) type11 事件携带区域快照（minX/maxX/minY/maxY＋产生纪元），执行用快照；共享 `_disasterBounds` 只作物件／显示镜像；(b) 保持共享读；(c) 区域 ID＋新区域表 | **(a)** | (a) 同月路径与原来一致，跨月正确；新增可 JSON 元数据。(b) 现状按错误区域结算（§10.3）。(c) 原版只有一个区域，过度设计 |
| D7 | 同城旧清除 vs 新灾害 | (a) 清除事件绑定城市灾害代次，代次不符不清零、不移对象；(b) 保持无条件清除；(c) 新灾害受理时取消旧清除事件 | **(a)** | (a) 原时序下行为不变，仅延迟时避免误清；需新增 city 字段与保存。(b) 延迟清除会误清新灾害。(c) 取消属新增规则，与「不丢」冲突 |
| D8 | 旧快照与旧旁表兼容 | (a) 新 schema 版本；wheel/cursor/divider 齐全（无旁表或空旁表）即视为完整——DOS 侧本就只有这 256×4B，无需转换器；非空旁表拒绝载入并提示（到期时间不可恢复，不猜）；恢复时校验调度表与旁表，非法即拒绝且不半安装；(b) 非空旁表按「下月位置 0」转换；(c) 拒绝全部旧档 | **(a)** | (a) 明确 fail-closed、不删旧档；需版本号／转换器；D2-C 从未 push／部署，真实旧档应无该字段。(b) 猜造到期时间。(c) 影响面不必要地大 |
| S1 | 进言提交 type6/7 是否并入本次 | (a) 并入 P3：把 `gamebar` 三处改为 native 301C／300E（delay 0x14，0 RNG），去掉 legacy 抛错；(b) 保持 fail-closed，另立任务 | **(a)** | (a) 让「所有实际生产适配器」真正统一（V16），改动集中在 3 个调用点＋1 个适配器；(b) 保持现状：进言成功后在 native 场景抛 `legacy event wheel`，属功能缺口但不静默丢事件 |

### 11.4 不受决策影响的必做项（无论选项）

- 恢复边界一次性校验调度表／旁表／sequence／月份纪元；非法输入拒绝且不覆盖当前世界。
- 单一权威，P5 必须移除旧 capture／drain 生产路径（可保留只读诊断），禁止双派发。
- 排队／carry／排序零 RNG；不新增去重、合并、TTL、上限、自动重试或超时。
- 两 word 独立提交前缀保留；半写记录不得被自动修补或当成空槽。
- 不改变天气、灾害清除、身份门与既有 RNG 规则来迁就测试。

### 11.5 确认方式

请按 `D0=a, D1=a, D2=a, D3=a, D4=a, D5=a, D6=a, D7=a, D8=a, S1=a` 的形式（或指出改选项／另述语义）一次性回复；确认前 P2 不开始。确认后可直接 `/goal resume` 继续 P2–P6。

**确认记录（2026-11-17）**：用户回复「全部按推荐（等价 D0=a, D1=a, D2=a, D3=a, D4=a, D5=a, D6=a, D7=a, D8=a, S1=a）」。九项全部按 (a) 执行，S1 并入 P3。确认范围只覆盖 §11.3 的行为选择；§11.4 必做项、§0.2 红线与未闭合原证不因此改变。

## 12. 实施记录（P2–P6 本地，2026-11-17；未提交／未推送／未部署）

按 §11.5 确认（D0–D8＋S1 全部 (a)）实施。原轮语义、原窗字节、RNG 与身份门未改；新增行为全部标为 Web 产品决定。

### 12.1 数据模型（`web/src/game/navigation/strategiceventschedule.js`）

```text
sc.strategicEventSchedule = {
  version: 1,
  epoch,                     // 月纪元；绝对位置 = epoch*64 + slot
  entries: [{ position, rank, order, type, arg0, arg1, arg2, region?, generation? }],
  meta:    [{ position, region?, generation? }]   // 原轮内记录的 D6/D7 附加元数据
}
```

- `rank 0 = carry`（旧页未消费尾部／过期条目），`rank 1 = overflow`（原轮放不下）；同一位置派发顺序固定为 **carry → 原轮记录 → overflow**。
- `order` 复用既有 `_strategicEventSeq`；排序／合并／carry 全部 0 RNG。
- 缺失字段＝空表（epoch 0）。DOS 侧本来只有 256×4B 原轮，因此该转换不发明状态、不猜到期时间；损坏版本／非法字节／非法区域一律抛 `RangeError`（不修复、不半安装）。

### 12.2 生产与落点（D1／D2／D5／S1）

| 入口 | 原行为 | 现落点 |
| --- | --- | --- |
| 2FBF 页内拥挤（扫到 0x100） | 捕获后报失败 | `(epoch+1)*64`（下月位置 0），`accepted:true`、`inserted:false` |
| 2FBF 请求跨页（目标 ≥0x100） | 立即 STC | `epoch*64 + offset/4`（请求的绝对位置，不早于请求） |
| 301C 整轮满（offset ≥0x400） | CF 仍 0、调用方按成功继续 | `epoch*64 + offset/4`（扫描终点＝请求位置向后） |
| 2BD9 移页 | 丢弃旧当前页未消费尾部 | `beforeEventMonthShift()` 把旧 `cursor..63` 按槽序搬到新纪元位置 0，再搬过期调度条目；之后才移位 |
| 进言 type6/7 | legacy 入口在 native 抛错 | `enqueueDelayedStrategicEvent` 在 native 走真实 301C（`BL=0x14`，0 RNG） |

- 原轮可写的记录**仍只写原轮**，overflow 不占用任何原槽，因此不会出现同一记录两处派发。
- `inserted` 保持原 4 字节写入真值；新增 `accepted`＝「Web 已接受」（原轮或调度表）；22DB／2286／预算／57FE 改读 `accepted`，消除「报失败却未来执行」。

### 12.3 派发、上下文与保存（D3／D4／D6／D7／D8）

- 泵（`consumeScenarioStrategicEvent`）：分频归零时**只推进一次游标**，冻结该位置批次并返回 `rest`；`ai.js` 串行派发，消息返回前不处理下一条，整批结束才 `tickFactionStrategicState` 一次（`finishDeferredFactionTick` 先排空批次）。场景卸载清空批次；批次或消息挂起期间禁存。
- D6：type11 产生时把 `_disasterBounds` 快照写入调度条目（overflow）或位置元数据（原轮记录，移页时随 carry 物化）；执行时优先用快照，缺省仍读共享 bounds。
- D7：`city._disasterGeneration` 在写入非零灾度时递增，随 `cityRuleState` 保存；type12 subtype0 清除事件携带产生时代次，代次不符则既不清零也不移对象。
- D8：恢复时一次性校验调度表；非空旧 D2-C 旁表拒绝载入（到期时间不可恢复），空旁表忽略；旧旁表模块与测试已删除。

### 12.4 验证（全部隔离、纯内存／只读 JSON）

| 入口 | 结果 | 覆盖 |
| --- | --- | --- |
| `tools/verify_d2_event_schedule.mjs` | 9/9 | 绝对位置、排序、carry 重定向、真实 JSON 往返、损坏拒绝、0 RNG |
| `tools/verify_d2_event_schedule_chain.mjs` | 8/8 | D1/D2 落点、D3 移页、D4 单次游标＋批次顺序、D6 快照、D7 代次、D8 恢复门 |
| `tools/verify_d2_event_refusal.mjs` | 6/6 | `inserted`／`cf` 真值、`accepted`、无 hook 仍原版丢弃、301C 原位写入 |
| `verify_native_weather_monthly` / `verify_native_weather_events` | 8/8、5/5 | 22DB／2286 计数改 `accepted`；type11/12 适配器 |
| `verify_native_legion_fate` | 42/42 | 301C 失败前缀与 hold；S1 后 native 走 301C |
| `verify_native_monthly_budgets` | 9/9 | type4/5 满页不再丢 |
| `verify_city_capacity_event_boundaries`、`verify_strategic_event_rng_raw` | 5/5、OK | 原窗 SHA 与 RNG 时序不变 |
| `verify_diplomacy_runtime`、`verify_diplomacy_all_scenarios` | OK | 真实 2BD9＋新移页钩子 |
| `verify_game_save_snapshot`／`_runtime`／`_exchange` | OK | 存档字段与恢复 |
| `verify_strategic_negotiation_events`、`_capital_event`、`_message_fifo`、`_city_ai`、`verify_native_city`、`verify_native_faction_tick` | OK | type6/7 四字节记录、泵与后继、城市链 |
| `tools/verify_d2_event_v_matrix.mjs` | 13/13 | V01–V08、V11、V15–V18（正常路径零差异、两类拒绝落点、远期不提前、错位换算、批次 65、区域快照、257 城、适配器单一化、纪元推进、元数据失败） |
| `tools/verify_d2_event_v_matrix_app.mjs` | 5/5 | V09 消息串行、V10 故障 hold/禁存/不重放、V12 代次轨迹、V13 模块级 JSON 续月一致、V14 恢复门包装 |
| `tools/verify_d2_event_save_roundtrip.mjs` | 1/1 | V13 应用级：真实 20 章夹具 `snapshotState→saveJSON→admitSavedScenario→prepareScenario(restore)`，调度表／城市代次保留且续月顺序一致 |
| `node tools/build_trial_web_bundle.mjs` | 重建 256 文件（sha `2237603d…`） | `server/public/trialweb.txt` 仅含新调度模块，旧旁表模块已无残留 |

### 12.5 已知边界（未覆盖，不算通过）

- `0x304E`：用户 2026-11-17 明确「纳入调度条目」，已实现（`hasScheduledEvent`，读-only）并有链测试；原版查询仍只扫原轮，本条属**已批准 Web 差异**。
- 浏览器验证：本机 `PLAYWRIGHT_MODULE` 为空，但 `@playwright/cli` 自带 `playwright`（`C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright`）与已下载 Chromium，现有 verifier 的默认路径即可用（无需新装依赖）。`verify_menu_save_slots_browser` 实跑通过：新局→菜单存 A→推进日→存 B→覆盖 A→回标题→空槽三禁→读 A→刷新→读 B，`page errors: []`。该轮同时暴露并修复了 §12.5.2 的新局缺陷。
- **非空调度条目的浏览器 IDB 往返**：已补 `tools/verify_d2_event_schedule_browser.mjs`——真实游戏页注入 2 条（overflow+generation、carry+region，epoch 5）→ `app.saveGame` → 真实 IndexedDB → `page.reload` → `app.loadSave`，两条与 epoch 原样恢复，`page errors: []`、禁止路径 0。
- `verify_war_proposal_browser` 两次运行均落在文档记录的 retryable 分支（`exit 2`，`no fate card`/`dice loss`），不计通过；其 `precheck.pending:true` 证明 304E 仍能查到在飞 type1。
- 主动 LSP 检查 inconclusive（push-only、`ai.js` 超 5000 行上限），`node --check` 全部通过；不称 clean。
- 多事件同位置时的 handler RNG 轨迹变化属已声明 Web 差异（多派发即多消费），未被原版对照覆盖。

### 12.5.2 浏览器实跑抓到并修复的新局缺陷

`beforeEventMonthShift` 首版要求 `_strategicEventCursor` 必须存在，但新局 `initializeStrategicDiplomacy→2BD9` 在 `resetEventMonth` 之前运行，此时 cursor/divider 尚未建立，导致新局直接 `RangeError: Uncovered monthly diplomacy _strategicEventCursor`（浏览器实测 30s 超时，`page errors` 捕获）。修复：仅当「原轮数组存在且全空、调度表无条目」时视为 pristine 新局并跳过 carry；其余缺 cursor 情形仍 fail-closed，且抛在 reset 写之前（`native_legion_fate` 前缀断言保持 `commitsReset:false`）。

### 12.5.1 V09 抓到并修复的实现缺陷

首版 `drainStrategicEventBatch` 在批次首条事件已打开消息时仍会立即派发下一条（测试报 `Uncovered overlapping native generic TALK event`）。已改为：若 `_strategicEventPostMessageRngPending` 已置位则直接返回等待，消息返回后才继续下一条。该缺陷正是本任务要防的「消息未返回就处理下一事件」，V09 现在锁死该顺序。

### 12.7 V01–V18 证据映射

| V | 证据 |
| --- | --- |
| V01 | `v_matrix` V01（delay 0/8/32/63 原位写入、无调度条目、0 RNG、游标/分频不动） |
| V02 | `v_matrix` V02（页内满→下纪元 0；跨页→绝对槽；随机起点只耗 1 字节）＋ `refusal` 用例 |
| V03 | `v_matrix` V03（满轮→槽 256，64 次到期均不派发该条；槽洞抛错） |
| V04 | `v_matrix` V04（cursor63+delay2→槽 65；移页后为新槽 1，非 2） |
| V05 | `v_matrix` V05（两条 delay6→槽 6/7；槽 0 消费只推进一次游标，未来槽不位移） |
| V06 | `v_matrix` V06（连续两月 carry 不重不丢，已消费槽不重放） |
| V07 | `v_matrix` V07（cursor64→page-end 无派发；divider 0→255 下溢不派发） |
| V08 | `v_matrix` V08（65 条同位置不截断，顺序稳定） |
| V09 | `v_matrix_app` V09（A/B 消息串行，C 无消息；整批后 tick 一次） |
| V10 | `v_matrix_app` V10（未知类型→hold/禁存/游标前缀保留/不重放）＋ `native_legion_fate` 故障用例 |
| V11 | `v_matrix` V11（生产时区域快照；后续月改共享 bounds 仍按快照伤害） |
| V12 | `chain` D7 ＋ `v_matrix_app` V12（旧代次清除跳过、同代次清除生效） |
| V13 | `save_roundtrip`（应用级真实夹具存档→恢复→续月）＋ `v_matrix_app` V13（模块级 JSON 顺序） |
| V14 | `chain` D8 ＋ `v_matrix_app` V14（损坏拒绝、包装错误、不改输入、旧档保留提示） |
| V15 | `v_matrix` V15（257 城采样＋满页接受）＋ `verify_weather_regional_sampling`／`native_city` |
| V16 | `v_matrix` V16（源码级：无旧旁表引用、五个适配器统一入库）＋ `refusal` 无 hook 保留原版丢弃 |
| V17 | `v_matrix` V17（fresh 2BD9 每轮 +1 纪元；restore 不再推进）＋ `native_legion_fate`／`diplomacy_all_scenarios` |
| V18 | `v_matrix` V18（非法元数据不落半条、原轮不变）＋ `native_legion_fate` 两 word 前缀｜`refusal` 301C 满轮 0x400 |
| V19（新增） | 304E 纳入：`chain` D4/304E 用例（调度条目在取走前被查询命中、目标不符不命中、取走后不再命中） |
| V20（新增） | 非空调度条目的浏览器 IDB 往返：`verify_d2_event_schedule_browser`（entries/epoch 原样恢复，page errors 空） |

### 12.6 待办

1. ~~浏览器集成~~：已完成菜单存档往返（§12.5）；可选补跑「非空调度条目」的浏览器 IDB 往返夹具。
2. ~~`0x304E`~~：用户已定「纳入调度条目」，实现与测试见 §12.7。
3. ~~文档回流~~：已完成——[外交 re-notes §40](re-notes-ai-diplomacy.md#40-d2-event-64web-绝对位置调度表web产品决定非原版机制)、[去向 §20](re-notes-legion-fate.md#20-d2-event-64-301c-满轮后的绝对位置接收web产品决定非原版机制)，并在两个 SKILL §8.1／§8 加入 Web 实现指针。
