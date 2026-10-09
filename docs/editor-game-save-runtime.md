# E-08：直接战略入口的运行后快照验证

**限定验证切片，不是完整中局/战役或App安装。** 产品规则、初始化、仓储、App、Trial、资产本批均未改。新增`tools/verify_game_save_runtime.mjs`调用现有aiTick，并经过真实snapshotState→opt-in内存仓储→游戏绑定备份→共同detached恢复；不是再测小fake state。

## 实际覆盖

- 20个当前导入章，每章先八次直接战略callee，再捕获保存。参数与生产onStrategicTick的cityIndex/legionBatchStart/hour/runFactionTick:false形状一致，游标只由现入口提交。此路径实际改变治理/天气等状态并消费RNG；城市游标8、军团游标完成一轮回0。
- 原候选与独立cold恢复候选分别再八次同入口，逐次城市/军团游标及RNG调用数一致；完整RNG快照、完整webMeta/capability、公共restoreSnapshotState得到的**完整恢复语义状态**相等，城市游标16。储存的原捕获正文/目录不随两分支后续运行变化，删除0。
- 外层game/release字段明确工程fixture，不认证正式发布存在/当前版。显式mock数据库，无native IDB/profile/SAVE/DOS/网络；八个Web输入按现manifest长度/SHA，fetch只四native URL内存Response，implicit IDB0。备份解码不安装live。
- 每章额外一次显式越界城市cursor，实际aiTick失败/hold/禁snapshot，原RNG与已捕获存档不变，20拒收。仅此负控调用期间捕获console.error，严格验证一条原报告及RangeError后finally恢复；没有隐藏其它错误/放松规则。

## 不能推广的边界

- fresh来自共同prepareScenario夹具，**未运行完整App新局初始化/军师/外交**。Clock只提供捕获日期/时刻，strategicTickSerial保持0：这里有规则callee推进，却没有实际Clock.advanceFrame/onHour/月界，不能称16个完整规则帧。
- 没有活动军团/战术/玩家消息返回覆盖。gamebar收到消息就抛停止，不能自动调用onClose或绕过pending/failure继续保存。此20章有限首16城轨迹不是全城市/全事件、CPU等价或完整存档生命期认证。
- 预审8次RNG消费总量只作当前轨迹观测，不制定新原版公式。测试也不按数字写原规则期待；比较独立原/cold两分支。
- lexical静态相对import指纹122源，仅只读web/src及本测试所需tools；这不是间接callee/全消费闭包。80入口/281源码库存的增加包括**98个此前未声明的既有依赖**，不是新增98个产品模块，更不是全80通过。

## 失败、更正与交付

先[I/O登记](editor-local-validation.md)后owned `game-save-runtime-session-r1/probe-r1.mjs`预审20章八返回/cold原生表通过，仍AUDIT-ONLY。正式r1错误要求raw重快照JSON逐byte同：公共applyWebMetaToState会将**捕获sidecar中已经明确的字段**物化进state（例如事件分频、外交游标、灾害边界和势力运行字段）。这不是codec丢值或新增初始化证据。原r1脚本/失败日志保留；没有改产品/清字段/补默认值，而改比较完整webMeta及公共完整恢复语义状态，并独立核原捕获JSON原样保留。

r2无负控中间通过；补20失败禁存后r3工具exit0，但owned外层将stderr原失败报告拼进JSON日志再解析，解析失败保留，不能当完整封存。r4限定捕获并校验预期报告后正式通过。最终白名单env `run-focused-r1.mjs`实际八项串行exit0：runtime、exchange、snapshot、memory、旧repository/local-saves/transition/Trial-policy。新runtime20章/20拒、旧20章148备份拒/20章80准入拒/7组59仓储拒各按其合同；本批不重复浏览器、也无新UI成绩。

最终同session `static-receipt-r1.json`另签281源码语法/182旧声明除runner外181同SHA、98既有依赖当前SHA、82current/archive资产、实际八日志/收据/预审失败/producer/诊断/文档链接与HEAD；runner仅库存登记有界插入可内存逆构原SHA。Jev仅人工工程摘要/preview/fixed1.13/advisory，不发送快照/资源/原数据/完整日志，不作完成门。LSP不可确认按实际记录，不把空缓存或工具矛盾clean文本当全clean。

完整App、真实受信版本识别/最新/左确认右取消/游戏仓储绑定/备份UI、全运行态及真实后台仍按[差距索引](editor-requirements-matrix.md)开放。goal active，无commit/push/deploy。
