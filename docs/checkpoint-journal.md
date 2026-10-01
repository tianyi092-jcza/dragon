# Checkpoint Journal

> 本轮会话的进展、调试、失败、文件、阻塞与下一步。长期事实、架构、
> 命令、约定见项目记忆（[`AGENTS.md`](../AGENTS.md) 各 SKILL），机制细节见
> `re-notes`，版本变更见 [`CHANGELOG.md`](../CHANGELOG.md)。历史发布批次
> 明细已归档，不在此重复；下文“已验证”均指本机重跑结果，不是全战役认证。

## 当前主线状态（2026-10-01，dev 分支）

- **任务二《地图统一改造》已完成本地限定域交付（MAP-MIGRATION-2）**：此前
  错误“关闭”判断保留更正历史；本次以新完整审计收口，不复用旧结论。用户m1668
  已认可视觉，正式0.6批准修订844e…已安装，原源/native/图像保留，组合开关
  不影响完整规则。39入口串行exit0、72源码/39资源前后SHA同，另旧页晚到过。
  静态通过/LSP不可确认项明确单列；逐项证据见审计，不认证全战役或完整编辑器。
  本轮用户明确授权任务二本地实现/原证核对/迁移/测试，禁止提交/推送/部署；
  [收口清单](map-migration-completion-audit.md)逐项记录实际产物与未完成项。
  G门仅按具体支持域取证，不宣称任意拓扑/空章/变槽/扩容已放行。
- **编辑器阶段进行中**（本地、无正式后端）：当前844e…源复制／真实预览外，已增加作者多格素材库/拖放/完整实例选择、组合创建拆合和明确补底；原受限道路闭环保留。最新47入口串行exit0、84源码/39资源SHA同；不等于完整任务一。服务8322（游戏静态服8321），详见[本批](editor-current-workspace.md)。
- **本地已提交基线**：dev HEAD=`6d89b01a5834c8d98212031dd2c5ff49c73c9bf2`，
  包含此前编辑器切片、诊断分离、槽位回填、道路编码器及3F29/3FBF容限。
  E-03-ROAD-LOOP开始时工作区干净；本次MAP-MIGRATION-2保留其全部未提交改动。
  本轮未fetch，远端状态仅有cached github/dev同SHA，
  不据此宣称本轮push成功。`4b13035`为此前任务二历史提交。
- **本轮本地未提交**：保留E-03-ROAD-LOOP；追加MAP-MIGRATION-2四层源/共同
  编译、0.6批准清单/不可变资源与当前游戏接线、读取能力守卫、显示布局/重试、
  隔离样本及验证；没有commit/push/deploy授权。
- **生产数据结论**：data.json 具名/旧属分立忠实（原版亲核零差异），
  首轮重建写是原版行为；官渡等 6 章靠死槽容限正常开局（曾 hold，现通）。

## 关键命令

- 游戏静态服（常驻，用户终端）：另见 8321 进程；编辑器服务：
  `node tools/editor_server.mjs --serve --port 8322`（本环境后台不驻留，
  前台验证过）。
- 自检：`node tools/editor_server.mjs`；单测：`node --test tools/verify_<x>.mjs`；
  浏览器脚本直接 `node tools/verify_<x>_browser.mjs`（全新 profile/隔离服务）。
- Python 工具链：`python`（C:/Python313，非 WindowsApps 垫片）；必要时
  `python -B tools/verify_road_v2_content.py`。
- 提交推送分离授权；`.dragon-analysis/` gitignored（报告与隔离输出不入库）。

## 重要坑点（已验证）

- 画布点击一律经 `getBoundingClientRect` 换算（含 1px 边框＋body 边距）。
- 章节 id 含 `#`：拼 trial/服务 URL 必须 `encodeURIComponent`。
- E717 槽纪律：源槽＝种子方向，目标槽＝到达反方向；同城同向无双港
  （slot-occupied 经几何不可达，守卫仅作纵深）。
- 走廊紧密度：现图 8006 单格 detour 零可分类——纯几何新路必拒收，
  有效改路须 tile 重漆 recipe。
- 开局遍：89F0 调用者＝1BE6 启动链＋1B87 战术归来（读档路无）；fresh
  合成平面遍 192 城，显式平面（读档/测试）原样。
- 单平面顺序绘制：后城可见先城写（真图城距远不碰；合成测试城距须 ≥6）。
- `prepareScenario` 城市/节点门是显式别名 enforcement（恒等或拒收）。
- `structuredClone` 替代 JSON 深拷贝（lint 门）；verify 脚本输出走 `tlog`
  （`node:util format` 封装），`console.log` 会触发 pi-lens 告警。
- pi-lens 误报已裁决：content_pipeline 路径穿越（source_path 收容）、
  TS2568 Scenario 动态 fixture、await 成员括号式——不管；
  真告警（未用变量、`0*4`、嵌套三元、`!!`、裸 JSON.parse）修。

## 历史批次（E-03 道路＋漂移定案，已纳入6d89b01）

- 新增 `roadedit.js`（建造全认证派生＋精确拒收码、`deriveSlots` 与 v2
  tag 254/254 一致、`encodeRoadGraphV2` 与 roads.json 逐字节全同）；
  工作台 road 画线＋land/water 确认＋近线删除。
- `verify_road_edit.mjs`、`verify_editor_studio_road_browser.mjs` 全绿
  （exit0；删 road-0→逐格重建→保存校验编译过）。
- 漂移：先误判数据 bug，后原版亲核纠正——具名/旧属分立忠实；
  落为 3F29 死槽跳过＋3FBF raw 回退两处产品容限（已纳入6d89b01）。
  官渡仲裁：hold→18 轮推进；arrival/city/faction/diplomacy/callers/
  movement＋复制/闭环/menu_save 重跑全绿。
- 阻塞：无（漂移修复 authority 问题已由证据裁决：不改数据）。
- 当时待办：v2新边编译接线、漂移报告归档（由下批接续）；正式publish未做。

## E-03-COMPONENT-TOOLS-1（当前素材／组合／明确补底切片）

- 用户“继续未完成的任务”后继续当前profile的本地编辑工具，不接真实账户/发布、不扩容。素材列表/搜索/图集预览、完整实例框选/Shift多选、命名多格擷取/拖放/整footprint命中及边界拒绝接通；原byte配方不改。水域组创建/拆分继承flag/合并明选flag只改组引用；补底解锁确认后只写目标base及明确地理，unknown未补仍拒编译。
- 服务同修订保存map+追加definition，旧定义不可覆写，未使用的新变体也用共同composer核。copy-on-write失败不改本地源；单进程文件存储仍非可靠后台事务/CAS。原件844e…39角色/switch未变，未访问DOS/真实SAVE/profile，未提交/推送/部署或改全局配置。
- [47门串行收据](../.dragon-analysis/map-migration-2/component-tools-machine-r1/receipt.json)：13:07:08.555Z–13:27:49.331Z全exit0，84源码/39资源前后SHA同；21纯工具检查/12负控，实际浏览器框选/两格擷取/拖放/非锚点整选/拆false/合true/明确补底/保存重开/两PNG/20编辑源fresh及生产JSON过。所有浏览器/存储自有，IDB0/意外错误0。原5退休skip/固定RNG非CPU/非全战役限制保留。
- 首轮merge缺flag被create默认true吞掉，unit负控失败保留；仅修merge入口后unit及47过，不改期待。7主动LSP6hint/4inconclusive/0confirmed-clean，Markdown/缓存及最终静态限制详见[交付](editor-current-workspace.md)。Jev只发送审过1982B摘要、仅advisory。
- 任务一仍缺真实后端、完整实体/章节模型、完整App内存试运行、发布/目录/隔离存档和完整E-03工作流/UI验收；下一优先E-05准确snapshot+禁正式保存，不把本地认证模拟当真实后台。

## E-02/03-CURRENT-WORKSPACE-1（上一轮历史：当前源／组合开关／真实预览）

- 用户在任务一审阅后“好，继续”授权上述优先切片；不是完整后台/发布/任意拓扑授权。当前原件844e…39资产未改，完整副本保留20章/原子/161组/兼容helpers，默认来源不再读ignored旧源。
- 新繁中工作台真实图块绘制、实际组选择/定位/checkbox、即时像素/编译两PNG、保存重开/未保存离开提示接通。原尺寸/槽门不变；未保存不改服务或Scenario。局部43MiB源请求用64MiB字节上限，单本地进程修订比较非可靠CAS，构建另标studio-unified-1，旧产物保留。
- [新完整45入口](../.dragon-analysis/map-migration-2/current-workspace-machine-r2/receipt.json)串行exit0，81源码/39资源前后SHA同；20fresh/生产JSON、source-explicit字节、两PNG与批准源一致、开关native/geography不变、坏成员/PNG/审核/陈旧修订拒收及实际保存重开过。保留原生改点/晚到身份和UI明确确认原路重建；有关样本改真实覆盖原子，不靠被盖base假编辑。原5退休skip/固定RNG非CPU/非全战役限制仍在。
- 首次idle Node连接ECONNRESET、校验文案误拼修订、机器r1只跑5门时resize过渡断言失败均保留；connection-close/文案/可观测布局等待后新完整r2通过，无自动重试或规则期待放宽。12主动LSP25hint/4inconclusive/0confirmed-clean；Markdown覆盖不足、session全量见静态记录。Jev1713B仅advisory。
- [详细交付/剩余任务](editor-current-workspace.md)；组件库/拆分合组/明确补底、实体章节、完整App试运行及真实后台仍待后续。未提交、推送、部署、读取真实档或用户profile。

## WARN-T1-REVIEW-1（历史：任务一状态审阅／截图19W修复）

- 本轮用户更正为“查看任务一”；没有新增完整编辑器实施授权。[状态复核](../.dragon-analysis/editor-phase/warnings-task1-r1/task1-review.md)区分已有地基与E-01～E-11未交付项。当前优先缺口：工作台builtinSource仍导入旧ignored源，compile只取完整geography计算hash，没有新组合开关UI或真实小地图预览；任务二正式生成接线已完成，不能混为一谈。
- 仅改3文件：asset retry使用专用相对mock命名空间；savegame三处嵌套三元在原表达式位置改if（缺失/own undefined/0/null及求值顺序不变）；历史地理审核工具改类型约束的PIL字节Parser（白名单/hash/尺寸门不变），未关闭规则或改全局配置。
- 1250旧源码精确SHA分支对照、retry mock通过；Python3负控及3图逐byte与旧审核轮一致。Python checker首轮AST import缺lineno失败已保留，只修checker。新[39入口串行收据](../.dragon-analysis/map-migration-2/warning-fix-machine-suite-r1/receipt.json)全exit0、72源码/39当前资源前后SHA同；原5退休skip/局部RNG非CPU限制仍在。Python审核工具在72之外，另按自身SHA/3输出绑定，不冒充整套成员。
- session全缓存93文件0warning；3变更路径主动LSP0诊断但均push-only/inconclusive，不称全工作区已认证clean。低级hint不属截图19W。Jev仅发送已审1284B说明摘要作advisory，不是放行或原机制证据。当前地图844e…/原件/旧档均未改，未提交/推送/部署或访问真实SAVE/profile。

## MINIMAP-ADOPTION-1（用户m1668认可后的本地采纳）

- 已将“很好，效果不错，继续”绑定到已展示40da…候选及七图离线页SHA，[真实验收记录](data/current-map-display-acceptance.json)只批准Web显示/本地迁移，不授权完整编辑器、commit/push/deploy或原机制认证。
- 两独立批准包explicit-stage-r11/r12保留source/native/图像原byte，仅更新world/catalog URI及批准manifest/规范模块；20章fresh/生产JSON和五错误认可负控过。原installer受控安装后实际修订`map-2-844eab32a84212f72b1430d398f5e82a3924d7e9527746fc2d1c7581cf694f86`；旧目录/已运行世界保留，未热换。
- approved-machine-suite-r1：原36＋组合/seed/批准stage三门共39入口串行exit0，绑定72源码/39资源。新版实际副本原子20→16/20章恢复、四季×DPR/五格写回、存档拒收且记录保留、真实导航/菜单锁/行军中立捕获均过；另approved-late-world-r1旧页atlas晚到保护过。原5退休skip/固定RNG非CPU/非全战役限制仍在。
- 安装前原拒审5门r4/temp转移6门r3过，真实m1668认可和mock分开。最终72语法/AST、六文档98链接、当前39/旧39保真及diff通过；checker首次误排Python扩展拒收后只修checker，新轮通过，失败保留。LSP六路径1动态fixture hint/5inconclusive、六Markdown unavailable，session19warning/85hint不可冒称全清。Jev经审1667B摘要仅advisory。任务二必需项已逐项闭合；完整组合选择/拆分/checkbox UI仍属后续，不假称实现，限制由[完成审计](map-migration-completion-audit.md)维护。

## 历史 MAP-MIGRATION-2（认可/采纳前的收口状态）

- 当前候选`map-2-19e2b03991ee4cf77c58ba44ef14313f213f93dbe8984407ff16392cb7748797`。
  原192槽/XY及可见CB..D3扫描同门，原plane/图/helper/20章不变，旧资源目录保留；
  非规则展示标签仍PENDING，不把caller颜色/连通启发式当原机制。
- 92586装饰/5526道路/192据点原子与unknown底层；显式替换、层序/水域调序/删除、
  workspace显隐锁定不影响编译，四层均真正消费。支持域不是任意组件组合。
- 28资产完整副本永久样本：原子(10,10)20→16恰一字节，原图/helper不变；
  相同编译/同引擎20章native16＋JSON恢复过，来源修订/SHA固定。
- `machine-suite-r1`36个审过入口串行全部exit0：完整AGENTS安全列表、20章、
  scoped规则/目录、事务失败、真实保存/旧身份和缺三能力拒收且不删记录、
  三布局/据点锁与行军目标例外、中立活捕获、四季×3DPR/五格只读投影。
  固定65源码及38角色＋manifest的39资源文件前后SHA无漂移；5退休walker skip
  不计通过，固定RNG双跑不是CPU等价。另变seed及旧页atlas迟到/新页保持0.5通过。
- 所有浏览器为自有server/newContext，真实SAVE stat已移除后才执行；无真实档/
  用户profile访问，无提交/推送/部署/权限变化。失败轮保留；详细I/O、收据、限制
  及来源维护在[收口审计](map-migration-completion-audit.md)，不复制原证规则。
- 仍未完成：原地理候选hist85812/9420/3072/0（lake标签缺、旧river/lake混类）；
  需独立Web展示标注审核，不能由图片批准替代。新旧mini/256索引sprite/初始
  平面坐标图在`.dragon-analysis/map-migration-2/geography-review-r1/`，三实际布局
  在`machine-suite-r1-browser/`，M-06等待用户，不代签；全任务goal未标complete。
- 自动继续轮已制作[显式Web水域/道路作者资料](map-water-display-review.md)，不在
  正式源里猜Original标签：1外海/13湖区/其余river、35水路/219陆路候选，17显示
  road标签与旧any-point启发式不同，原flags/cost/geometry不变。23716格/湖707
  来源和实例明确，lake删除unknown仍拒绝；数据尚需审核，不因707非零算通过。
- `explicit-water-proposal-r3/review-r3/App-r3`均限定过：Native4资产/roadMask及
  全20章state/order不变；自含对照/分区/图例/水路4图零网络；隔离38角色清单
  在真实App独立proposal修订下192城/一章fresh/三布局/懒加载0error。未安装；r3
  另过Node严格4URI mock的全20章本proposal身份fresh/JSON能力恢复逐字段同。
  未当CPU/全规则认证，65源码与39当前资源仍同36suite SHA。
  等待类别资料＋M-06验收；图链接在水域审核页。
- 后续独立生成入口`stage_explicit_unified_map_game`只读22固定Web/作者输入，
  不依赖ignored中间源/current编译包；两干净目录38角色/manifest/metadata同，
  20章新修订fresh/JSON＋7作者数据拒收过。纯显示函数提取后旧候选14产物/digest
  仍同，四rule/两mini亦同；没有安装、没有复跑未漂移36门。checker首次API误用
  失败及修正轮收据保留，详见审计/水域审核页，不复制新原规则结论。
- 独立stage直接真实App（三布局/四规则两mini/192城）过，不复制已装资产重包装。
  实图发现旧normal/短视口右panel覆盖军师条；只修纯几何碰撞下移，宽屏保留。
  layout2六个focused入口（pure/direct stage/当前App导航/锁退层/行军/3DPR retained）
  串行过。原65仅layout/纯测试2变，其余63及39资源不变；不拼成新36整套全绿。
  M-06现在看portable-stage-App-r2三图，旧图/漏检保留，类别/外观仍待用户。
- installer追加未审核拒收门：历史PENDING或proposed/缺状态/只改map状态五项
  实际CLI在独立temp repo角色读取/写目录前拒收，switch不变，真实39资源SHA同。
  仅防误装，不批准人类验收或完成新stage正式采纳。installer不在旧65快照内，
  以独立工具SHA核签；原65仍两几何差/其余63同。static首次误算其成员关系失败
  已保留并仅修checker复验；原规则/装配未改，不重跑无影响规则门、不拼成新36。
  详细入口/I/O/失败及static/LSP限制维护于审计，等待类别＋M-06，未mark complete。
- 人工验收未到也继续独立安装接缝：支持explicit-stage-rN及previous同族，不放宽
  审核/38hash/world/规范module/previous-byte门；补原尺寸及world全部角色同revision。
  explicit-install-transfer-r2六case在temp：未审/坏terrain/自洽hash但旧world URI/
  previous不符拒，mock双APPROVED只测38byte复制/原子switch/旧目录保留及immutable
  重装拒，绝非用户批准。旧五拒审因installer变化重验r3过；实际current39/proposal38/
  switch原样，旧65仍两几何差。未改规则/生成包/七验收图，未重复未漂移门。
  真实类别/M-06记录、批准后源描述符及实际正式采纳仍待用户，目标未complete。

## MINIMAP-COMBINATION-1（本轮用户视觉反馈，本地未安装）

- 用户认可水域类别；候选JSON记录CATEGORY_APPROVED_VISUAL_PENDING及准确范围，不扩大为DOS机制/道路逐项批准。组合开关写入共同合同并接maplayers/mapcompile/minimap，完整geography与仅显示minimapGeography分离；关闭不改大图/规则，不隐藏道路。服务共同编译器升0.6，旧build目录保留。
- 实际组合持久化memberIds/baseCells；审核分区N02不是独立物件，同区不连水片也各自控制。原图Web导入候选161组，51显示/110次要河片隐藏；主河带及拆组不是原DOS语义认证。组合选择/拆分/checkbox工作台UI未实现，不扩展为完整编辑器。
- 当前新隔离revision为`map-2-40da80fbba6764cb95b7da5fbd54187628230639ac766acc71710105e16d6372`，explicit-stage-r9/r10由23输入/12工具两目录38角色＋manifest同。四native与原候选同，全23716水格/完整类别与20章不变；真实候选所有组合关仍native/roadMask/geography同。
- focused串行：unit-r2、layered-r2、engine-r1、seed-r3、repro-r4（20fresh/生产JSON+7作者拒收）、App-r3（直接新包/192城/三布局/懒加载/0error/forbidden）通过，未拼新36全套。初轮metadata误留0.5及之后组合拆分/等价清理轮全部保留，当前成绩绑定最终源码，不覆盖旧证据。
- [新离线对照](../.dragon-analysis/map-migration-2/minimap-groups-review-r2/review.html)：两尺寸旧/新纯底图＋实际App三布局，无脚本/网络。包装核已装39及switch不变；旧65现7差，其余58同；其它工具单独SHA。最终LSP/static限制由[审计](map-migration-completion-audit.md)记载，不称全清。
- 未安装/提交/推送/部署/访问真实档或profile；类别不再重复索取认可。下一步用户复审主河取舍/新风格，真实认可后再准备规范批准产物/采纳接缝，goal仍active。详细维护源：[水域显示审核](map-water-display-review.md)，不在journal复制原机制。

## E-03-ROAD-LOOP（2026-10-01，本地后续切片，历史验证范围）

- `trialcompile.js`将道路生成器复核＋v2编码接入服务编译：固定runtimeSlot排序、
  全章城市/节点一致、连续/交叉/port/slot/cost/flags/bbox及生产codec检查。
  章节raw邻居与编译图端点不符则拒收，避免删/加边后静默保留旧C1C..1F；
  无章最小副本只编地图，不能以它证明空白章运行。
  `edgeId`仅导入溯源不当规则binding；移城和失效binding明确阻断，不暗修。
- `editor-local-0.2`按revision存不可变快照、二进制地形、v2道路和两个辅助资源，
  manifest核完整GameSource摘要＋各资产长度/hash。重复身份复制拒绝，修订BigInt。
  包／资产只取固定修订；旧请求与新保存/编译不会串世界。
- `trialruntime.js`以快照content/world走生产fresh prepare（含89F0），不再显式
  terrain绕开着色、不再默认内置道路。当前仍是无完整App的内存harness。
- 登记inventory后重跑7入口全绿（exit0）：服务自检、道路闭环、地形10轮、道路
  生成器、试运行浏览器10天、工作台删路重建浏览器、漂移原数据核对。
  道路闭环无编辑图全等；改(252,9)→(252,10)真实原生动作提交；晚到rev2道路
  在rev3已保存/编译后仍加载rev2；坏路/失效binding/坏摘要/坏资产拒收；原件hash不变。
  浏览器均新profile/独立store，IDB打开0；两份相关测试真实SAVE文件时间读取已移除。
- 漂移归档：[E-COPY-DRIFT-DATA-1](re-notes-editor-copy-drift.md)，3840条全raw与
  现属逐条匹配五组原文件，不改数据；早期“数据bug/致命章必拒”正式标废。
  本批未复跑容限规则链／官渡，数据身份证据不能认证死槽跳过完整正确。
- 失败保留：首次compile将binding导入edgeId误作规则字段导致road-0拒收，
  改为只比规则字段后通过；首次漂移脚本误假设下/SINARIO.DAT尾部长度，
  改为本次完整城记录覆盖后通过，不补源文件。原日志及最终收据在
  `.dragon-analysis/editor-phase/road-loop-20261001/`（gitignored）。
- 工程合同、I/O与覆盖限制详见[本地验证清单](editor-local-validation.md)。
  仅本地固定槽/受限编辑接线，不宣称任意新图、空章、正式发布或E-05完整App完成。
- 最终检查：8个变更JS入口/模块`node --check`通过，7份Markdown的80条本地
  链接路径与冲突标记检查通过（未验证全部锚点），`git diff --check`通过。
  主动LSP未报JS error/warning，仅18条既有/括号await等hint；3个文件push-only
  无法确认clean，7份Markdown的marksman/typos不可用，故不写“LSP全清”。
  已执行`lens_diagnostics mode=all`缓存复核（不替代上述缺失主动覆盖）。
  未跑完整共享规则/正式存档回归：本批未改共享AI/RNG/保存/装配实现，验证仅
  覆盖作者服务、受限快照适配与列出的测试，不宣称全战役或完整App认证。
- 下一切片：完整App的内存trial模式＋明确禁用正式保存入口、独立资源/UI门；
  工作台完整组件/繁中/离开提示及认证/可靠后端仍待实施。不触动规则未知处或放开G门。
