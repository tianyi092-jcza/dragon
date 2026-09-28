# AGENTS.md — 臥龍傳 Web 项目记忆

> 本文件只维护长期事实、架构、命令、约定及当前主线。先读[全局AGENTS](../AGENTS.md)：安全、原证、审批与自主执行以其为准。
> [journal](docs/checkpoint-journal.md)只保留当前状态、限定验证摘要与证据入口；版本沿革见[CHANGELOG](CHANGELOG.md)，旧调试流水通过Git历史追溯。机制详细源为相关SKILL/`re-notes`，不在记忆中复制。历史日志不是任务授权或机制证明。

## 1. 边界与当前主线

- 原生JavaScript ES Modules + Canvas 2D重写1995 DOS《臥龍傳》，无模拟器、框架、构建步骤或npm运行时依赖；完整`web/`可由静态HTTP服务独立运行。
- 仓库`E:/Dragon/web-port`；原程序`E:/Dragon/Dragon/`；官方基准`E:/Dragon/原版/`；`上/中/下/后/`为改版库。自动化禁止访问真实`SAVE.DAT`、用户存档/profile；测试用内存、mock或新隔离profile。
- **现行规则主干**：fresh与restore使用v2原生道路/固定表，生产v1路径已删除，不相容槽禁用。原生接线及门后续段已有各自限定域证据，但不据此宣称完整战役或所有原机制均已认证。未知消费点继续fail-closed，保已提交前缀、hold/禁存。
- **当前主线**：已发布`0.1.5`（Git标签`v0.1.5`）；发布号由`VERSION`维护，独立规则基线仍为`web-0.1.1`。存储/内容扩展、地图分段脏层、灾害只读播放器、据点/军团锚点、战术对白折行、G1F评分刷新与普通军师新局初始化已落地。
- **工作方向**：在单一规则/AI内核上推进已批准的Web工程与表现任务，不以“全逆向完成”为工程重构前提；性能先测量再切片。超原容量、任意道路/城池移动及底图建筑分层尚未实现，列作方向不等于授权。
- 原机制只依据原指令/原数据/受控原运行态，区分实锤、推断、未知。Web产品差异单列；不凭现代码、测试或体验补公式。容量仍为原运行域，不自动授权超过192据点或改变AI/调度。
- 保留共享脏改；commit、push分别需要明确授权，不调整全局配置、信任或权限来绕过工具限制。发布目标须显式指定：`github`与Gitea镜像`origin`不是同一目标，不能因默认remote误推。
- 只纳入产品代码、测试、迁移及必要文档；本地代理状态、缓存、临时报告/截图、运行产物不入版本库，也不擅自清理。仓库外SKILL不强行复制进仓库。

## 2. 架构与数据流

`原版非存档资料 → 显式离线导入 → Web编辑源 → 校验/编译资产 → Scenario副本 → 保存守卫/快照 → IndexedDB`

模块路径相对`web/src/`：

| 模块 | 职责 |
| --- | --- |
| `main.js`、`app/startflow.js`、`app/battleflow.js` | App装配、标题/开局、战斗接续；新局与读档共用`loadState` |
| `content/`、`game/world.js`、`game/worldresources.js` | 内容/章节/修订身份、Scenario副本、每世界资源实例 |
| `game/navigation/` | 原生道路图、地形/占格能力与规则桥；不用通用Dijkstra/A*替代原寻径 |
| `game/ai.js`、`weather.js`、`autobattle.js`、`legionscheduler.js` | 战略规则、灾害、速算及逐槽调度 |
| `game/native*.js`、`legionphase.js`、`legioncounts.js`、`legioncontinuation.js`、`strategicfailure.js` | 固定原始表、相位/计数、续段所有权、严格恢复与故障暂停 |
| `game/clock.js`、`tacticalclock.js`、`battle/original*.js` | 战略/战术预算、权威Session、RNG、VM、结算 |
| `game/savegame.js`、`core/saverepository.js`、`indexeddbsavebackend.js`、`localstore.js` | 快照/守卫与仓储分离；单档正文及摘要原子写入 |
| `render/`、`ui/`、`game/playerqueries.js` | 只读绘制与表现状态、GameBar/HUD、消息FIFO、纯查询 |

- 逻辑基准640×400；现世界384×256格、16px图块、192道路节点；128军团槽、22正常势力、24×24外交矩阵、256×4B事件轮。哨兵、别名及排除槽有语义，不能把固定循环一律改成数组length。
- `web/content/builtin/`是编辑源，编译产生20章模板及资源；命名state字段为权威，未知兼容字节保留。解析纠错先导入新目录比较，不手改生成物掩盖错误。
- 图集、地图布局、世界资源与道路拓扑分离；画道路不等于建立通路，图块索引也参与规则。地图分块保留非整数DPR的整图采样回退；发布资产不等于跨文件原子事务。
- 新局live `legions=[]`不代表原始表可缺失；显式初始化有来源合同。地图对象前16火灾/暴动、后16雨云，不filter压缩槽号。
- 多档仓储使用同源IndexedDB `wolong-web/saves`；正式保存不是DOS文件或服务端API。目录与单档正文同事务提交，完成前不得报成功。`saves.html`提供隔离管理/JSON备份，`editor.html`只编辑现容量许可字段并导出补丁，不热改运行场景。
- 用户不要求旧Web格式兼容，但这不授权批量清库。新档须完整保存RNG/固定表/调度/能力状态；旧或不相容槽在hover、hit-test、click三路禁用。
- 读档先回标题；detached校验和资源ready后才安装。await后核scenario/world/clock/票据；预检失败不碰live，安装后故障保前缀并禁存，不假事务回滚。战斗、未完成交互/续段/装配/故障均禁存。

设计维护源：[基础重构](docs/web-refactor-phase1.md)、[多档/受限编辑/地图分块](docs/web-refactor-phase2.md)、[内容架构](docs/content-architecture.md)、[表现现代化](docs/presentation-modernization.md)。两份“第二阶段”分别指内容扩展和表现升级，不混为同一范围。

## 3. 当前Web产品约定

- 无关闭按钮、羽扇唯一交互开关、右键逐层退回、子菜单地图锁、地图空白左键无功能，详见[全局约定](../AGENTS.md)和[军师UI技能](../.agents/skills/re-ui-advisor-menu/SKILL.md)。强制多步对话右键无效；普通提示可右键/3秒关闭并执行后继。
- 新游戏及从标题读档后默认展开军师一级菜单、势力信息面板、小地图；军师子项未选中，不额外锁地图/hold；原按钮仍可收起。
- 菜单/模态/场景/战斗/装配/鼠标hold取并集，不改速度模拟暂停。地图鼠标移动即暂停，连续静止1秒释放自己的hold；输入锁与物理区域识别分开。
- 战略五档60/35/20/10/3.125ms，每RAF最多6次完整更新、每步检查hold；战术最多一个完整帧，不补后台债务。战略与表现时钟不能互相代替。
- 行军按8×movePeriod插值；城标/军团共用原图块中心(16x+8,16y+8)，不补偿到道路视觉中线，证据见[图块锚点](docs/re-notes-map-marker-anchor.md)。显示段按X优先定向、结束才采用下一方向/驻守帧；绘制不改路线/RNG。六队全骑周期2、其余3的规则不变。接战30ms换帧、60ms发声，每段连续共享接触最多五响；详情见[行军表现](docs/march-presentation-fixes.md)。
- 云雨直接使用原完整八帧PNG，不画渐变云或额外雨丝；独立表现时间100ms换帧、平滑位移，**随战略计时暂停/恢复**：speed<=0或任何hold时位置和雨丝均冻结，后台/场景退出亦冻结。可见慢帧限量推进，不整帧丢弃至永久停动画；细节见[表现合同](docs/presentation-modernization.md)。
- Canvas backing store仅尺寸/DPR变化时重建；地图分段缓存只跳过栅格化，不跳过GameBar布局/消息drain；连续移动或超容量回退直绘。灾害播放器只读原槽/frame，无新时钟或延寿。详见[表现合同](docs/presentation-modernization.md)。
- 列表右侧滚动条、24px表头、墨绿色`#4a7828`选中；排序绑定原对象。
- 自定军师`{custom:true,general_idx:null,name,hao,portrait}`；军师化身排除普通任官/编成/自动出征。统一后留在地图、不播D7END；信赖归零/玩家灭亡仍GAME OVER。
- 系统菜单：保存、读取、音效、战略速度、战术速度、退出。音效TYPE1→2→3→4→关闭调CF9；OFF停BGM，不禁PC/FM效果。战术对白不暂停Session；姓名独占首行，正文仅在DOM移除CR/LF后按宽度折行，原捕获/消息/快照不变。见[对白合同](docs/re-notes-tactical-lifecycle.md#battle-text-reflow-1姓名首行正文自动折行web产品决定)与[战术规则](docs/re-notes-tactical-rules.md)。
- 独立开场原生动画/单次MP3，会话刷新/读档直达终场；具体音乐与弹窗边界见[开场维护源](docs/opening-scene.md)。

## 4. 重要坑点与证据入口

- canonical `OriginalBattleRng`启动RTC播种一次，新局/标题不重播种，读档恢复；禁Math.random兜底。战术回写同一RNG后续战略；输入→A426 VM→A065帧，消息/RNG不能重播。见[战斗技能](../.agents/skills/re-battle-command/SKILL.md)。
- 每更新1据点/16军团，槽动作→日结→03尾→余槽/天气；退场当前槽仍完成尾段。native表唯一持有记录，live/delayed是同对象视图；0B/1E零值、独立03、F14及inactive/未知槽不能被“清理”。generalIdx、slot、leader不可混用。见[行军技能](../.agents/skills/re-march-engagement/SKILL.md)。
- `_march`不能覆盖原0A/0C/0E或消除残值；地址、节点id与字宽区分，CF1不一律无路，未知RAM不补零。工程拒绝不能伪造原版blocked。
- 六队原值及战前BP列表是权威，不合并军团、不用synthetic city替代守军。双方战果先提交再各自474A，失败保前缀；撤退不传送，初值48不等于固定等待48次。见[战后技能](../.agents/skills/re-post-battle/SKILL.md)。
- 战争关系、势力目标、军团命令分开；玩家未完命令优先，委任不能覆盖。消息返回有续段/付款/互俘边界，不假回滚。见[外交技能](../.agents/skills/re-domestic-diplomacy/SKILL.md)、[消息ABI](docs/re-notes-strategic-message-abi.md)。
- 存档恢复须贯穿传递road/movement/terrain/cityCache能力，不能靠重新合成掩盖漏传。JSON会丢undefined、非有限数变null，structuredClone不替代真实JSON往返。地址不等于SAVE偏移，内部十人单位不等于显示人数，MMAP透明用独立mask，索引0可是不透明黑。见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- BGM FLAC来自软件OPL3，不是实机录音；无损不保证无缝或低解码内存。部署/版权见[README](README.md)，旧日志不证明再分发许可或远端状态。
- 原证总入口：[AI全链](docs/re-notes-ai-chain.md)、[行军](docs/re-notes-march-pathfinding.md)、[去向](docs/re-notes-legion-fate.md)、[财政](docs/re-notes-ai-fiscal.md)、[外交](docs/re-notes-ai-diplomacy.md)。文档中的旧批次、历史v1说明不代替当前代码及原始证据。

## 5. 常用命令与验证

仓库根执行；先审入口、依赖和I/O，命令清单不是扩大任务/安装/部署授权。

```bash
python -m http.server 8321 --directory web
unset PYTHONOPTIMIZE
export PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1
python -B tools/compile_content.py --output /path/to/new-generated  # 需Pillow；不要覆盖共享目录
python -B tools/verify_content_pipeline.py
node tools/verify_content_catalog.mjs
node tools/verify_world_resources.mjs
node tools/verify_start_flow.mjs
node tools/verify_legion_slot_phase.mjs
node tools/verify_legion_slot_battle.mjs
node --test --test-reporter=tap tools/verify_native_formation.mjs
node --test tools/verify_road_field_authority.mjs
python -B tools/verify_map_marker_anchor.py  # 固定非存档原资源，只读锚点/像素布局核验
node tools/verify_weather_presentation.mjs
node tools/verify_disaster_presentation.mjs
node tools/verify_retained_layers.mjs
node tools/verify_render_layers_browser.mjs
node tools/verify_weather_browser.mjs  # 已有Playwright；可指定PLAYWRIGHT_MODULE
node tools/verify_legion_lifecycle_browser.mjs
node --check web/src/main.js
git diff --check
```

- 全部变更检查实际diff、支持文件的主动LSP、`lens_diagnostics mode=all`、`git diff --check`。unavailable/inconclusive或空缓存不代表clean；工具自动格式化后核字节漂移。
- 纯文档检查链接、职责/规则一致性及元数据，不跑无关游戏回归。规则/数据/工具跑focused；共享调度/RNG/存档/跨模块状态改变须完整安全回归。UI用新profile核流程及console/page/request错误；保存额外测守卫、往返、事务失败。
- 全量先固定显式入口/依赖/源码及I/O白名单，再串行执行入口；禁止verify_*通配或把历史通过当本轮证明。新测试进入inventory、权限白名单和快照。只能关闭自有监听/profile，不碰真实档案或共享dist。
- 验证绑定实际SHA，保留失败轮；后续源码漂移先核差异再重验，不拼接成绩。UTF8日志、明确reporter；Windows复杂路径用落盘脚本，检查manifest分隔符；脚本不得覆盖已封存证据根。
- 子进程仅传必要环境白名单，不转储凭据；LF/CRLF warning不等于diff检查失败。原窗口、同引擎往返、首批及完整战役证据分开陈述。

### Jev开发期辅助（非运行时依赖）

- 仅advisory，不是机制证据、测试oracle、审阅替代品或放行门。跨规则/存档状态/时序RNG/UI浏览器/工具测试等多风险域的实际diff，或验证有明显遗漏风险时用`change`；失败经直接诊断仍有多种归因时用`failure`。
- 逆向先取得原始事实；仍有多个调查方向/关键证据缺口时用`reverse-triage`选探针，不让模型计算指令、字宽、公式或判机制。确定性证据已唯一定位、纯文档、明显语法/导入问题无需调用。
- 固定流程：人工最小文字→不联网preview并审最终state→确认无禁发信息及TYPESAFE_API_KEY可用→`--send`。适用范围已有持续授权；缺key/失败/不宜外发则说明，不阻塞权威验证。
- 禁发原版资源、真实存档/profile、凭据、个人信息、私密issue、未审完整日志或大段源码；不得把结果直接用作命令/路径/自动改码输入。
- `node tools/jev_assess.mjs <change|failure|reverse-triage> --input -`，审过后才加`--send`；详见[集成文档](docs/jev-integration.md)。
