# AGENTS.md — 臥龍傳 Web 项目记忆

> 本文件维护长期事实、架构、命令、约定与当前主线。先读[全局AGENTS](../AGENTS.md)，安全、证据、审批与自主执行以其为准。
> [journal](docs/checkpoint-journal.md)只记会话过程与验证；模块规则及原始证据由对应SKILL/`re-notes`维护。不得从旧日志恢复任务或提交授权。

## 1. 项目边界

- 原生JavaScript ES Modules + Canvas 2D重写1995 DOS《臥龍傳》；无模拟器、框架、构建步骤或npm运行时依赖。完整`web/`可独立部署到普通静态HTTP服务，运行不需要原版目录或提取工具。
- 仓库`E:/Dragon/web-port`；原程序/运行数据`E:/Dragon/Dragon/`；官方基准`E:/Dragon/原版/`，`上/中/下/后/`为改版库。
- 原版机制只依据可复核指令、原始数据/资源及必要的受控运行观测。用户观察、Web现状、测试和文档不构成原版证明；区分实锤/推断/未知，未闭合不补公式。Web产品差异另标，成果回流唯一详细维护源。
- 自动化禁止读写`E:/Dragon/Dragon/SAVE.DAT`。保留用户/其它会话改动；commit与push分别需要明确授权。分支、提交和工作树状态现场查Git，不把批次状态当永久事实。

## 2. 当前主线

- **一套规则/AI/UI内核，内容与运行态分离**；不是两套“原版/扩展”玩法。渐进拆分，保持现有规则、RNG顺序、消息返回边界、hold并集、视觉与四槽行为。
- **已落地 B0–B4a**：纯玩家查询解除commands↔diplomacy循环；原始记录读取隔离；Web可编辑内容源/编译管线与目录身份；图集/布局源；世界独立道路/地形缓存；无绘制开局选择流程。
- **后续拆分**：场景生命周期与存储仓储；GameBar/HUD按工作流拆分；AI按城市/军团/事件/战后/调度拆分；BattleView驱动与绘制分离。`OriginalBattleSession`不按文件行数硬拆。
- **尚未实现**：编辑器、地图扩容、任意内容包/世界热切换、Loading动画、新通关过场及多语言。现有AI/渲染仍使用默认世界门面，四槽存储尚未迁移为内容身份。
- 普通非接触道路调度仍未全链闭合；战术BD46/B824/compositor等以笔记标注的scoped-PASS为限，不宣称全DOS等价。最新用户任务决定本轮范围。

## 3. 架构与数据流

`原版非存档资料 → 显式离线导入 → Web可编辑源 → 校验/编译资产 → 复制为Scenario → 保存守卫/快照 → IndexedDB`

以下模块路径相对`web/src/`，同组省略重复目录前缀：

| 模块 | 职责 |
| --- | --- |
| `main.js`、`app/startflow.js` | App装配、战略RAF/月结/战果接续；无绘制选择流程；新局/读档共用`loadState` |
| `content/` | 内容包/章节/修订身份、旧索引映射、世界资源与布局常量 |
| `game/world.js`、`worldresources.js`、`navigation/` | Scenario/模板复制、每世界资源实例与导航；`roadgraph.js/pathfind.js`为默认实例门面 |
| `game/ai.js`、`weather.js`、`autobattle.js` | 战略调度、接敌/战后、事件/灾害、六队速算 |
| `game/playerqueries.js`、`legacyrecords.js` | 纯玩家查询与原记录兼容读取 |
| `game/clock.js`、`tacticalclock.js`、`battle/original*.js` | 战略/战术预算；权威Session、RNG、VM、命令与结算 |
| `game/savegame.js`、`core/localstore.js` | 快照/恢复与保存守卫；IndexedDB读写 |
| `render/`、`ui/` | 战略/战术投影与表现；GameBar/HUD工作流、消息FIFO、StartMenu布局/输入/清理 |
| `core/assets.js`、`music.js`、`score.js`、`speaker.js` | 资源缓存、BGM播放、场景选曲与效果音 |

- 逻辑分辨率`640×400`；当前世界`384×256`格、16px图块、192道路节点、128军团槽、24势力槽。尺寸/槽位/地址/哨兵限制不能一律替换为数组length。
- `web/content/builtin/`为可编辑源，`tools/compile_content.py`生成20章运行模板及地图/道路资产。`state`命名字段是编辑权威，未知兼容字节保留；不手改`data.json`等生成物掩盖错误。原始解析纠错经离线导入新目录、核对源差异后再编译。
- 图集、图块排列、世界对象与道路拓扑分离；`map_tiles_*.png`是四季整图派生缓存。贴道路图不产生通行性，图块索引仍参与规则，不能随意重编号。详见[内容架构](docs/content-architecture.md)。
- 新局从`legions=[]`开始；保留16雨云初态与头部吸引边界。地图对象前16槽为火灾/暴动、后16槽为雨云，不用filter压缩固定槽。
- 正式保存为浏览器同源IndexedDB `wolong-web/saves`四槽JSON。sidecar在快照内保存导航、军团、回归队列、事件/灾害、调度游标、军师和RNG，不是服务端文件。旧SAVE API、token/lease均已废弃；单实例由浏览器锁管理。
- 游戏内读档先回标题；空槽hover/hit-test/click都禁用。战斗、接战过渡、待补日历或未完成战略交互期间按保存守卫禁快照；保存测试仅用mock、内存或全新隔离profile。

## 4. 现行交互与Web产品约定

- 不增加关闭按钮；可取消窗口右键逐层回退。普通NPC/武将提示3秒或右键关闭后执行回调；外交费type5整段禁右键，不得通过自动关闭/羽扇绕过强制预算。
- 羽扇是军师一级菜单唯一开关，只清所属工作流。选中子菜单就锁全地图；退层保留上级选中/hold，最后退出才释放。仅展开一级菜单只拦截实际`640×48`矩形；空白地图左键不关闭界面。详见[UI技能](../.agents/skills/re-ui-advisor-menu/SKILL.md)。
- 模态、场景切换、战术入口使用所属`clock.hold`，不改速度档模拟暂停。地图鼠标移动取得独立hold，静止满1秒释放；所有hold取并集。物理UI命中区域与全屏输入锁分开，锁地图时仍须识别暴露区域的鼠标移动。
- 逐RAF重绘、合并指针更新；每RAF最多一个战略步或完整战术帧，不补后台债务。Canvas backing store只在尺寸/DPR变化时重建；绘图不推进导航、规则或RNG。
- Canvas列表右侧滚动条、24px表头、墨绿`#4a7828`选中；排序后绑定原对象。战略消息使用GameBar FIFO，规则提交与RNG消费遵守各自消息返回边界。
- **玩家化身**：自定军师为`{custom:true,general_idx:null,name,hao,portrait}`；默认军师成为化身后排除普通武将/编成/任官/自动出征候选。这是Web决定，非原版候选规则证据。
- **结局**：统一后继续战略地图、不播D7END；信赖归零/玩家势力灭亡仍保留GAME OVER，不能整体删除EndView。
- **系统菜单**：保存、读取、音效、战略速度、战术速度、退出共六行。单一「音效」TYPE1→2→3→4→关闭调CF9音量，不是选曲/SFX音色；OFF停BGM，不禁PC/FM效果。
- **接战表现**：独立共享时钟100ms换帧、200ms发声，首次同步、结束清理；暂停冻结、不补播，PCM不升调。独立的只是音画，不是接敌等待；不改道路倒数或延后战斗入口。
- **战术表现**：入场/战斗共用`TACTICAL_PLAYBACK_RATE=0.5`，低四档等待加倍、最高30Hz，首帧立即执行。战术对白3秒或全局右键关闭，不暂停Session；无战术小地图/右下双箭头。见[战术规则§5](docs/re-notes-tactical-rules.md)。

## 5. 重要坑点与详细维护源

- 规则只用canonical `OriginalBattleRng`，进程启动RTC播种一次；新局/标题不重播种，读档恢复快照，禁`Math.random()`回退。异步战术先回写同一RNG再恢复战略；保持就绪输入→A426 VM→A065帧顺序，无输入仍推进。无真实对象/墙记录不能按战略比例造城损。见[战斗技能](../.agents/skills/re-battle-command/SKILL.md)。
- 主更新处理1据点/16军团，128军团需8次，不是每日移动。敌城末端边界tile在坐标写回前检查；插值不改规则坐标，真实军团不合并或换成synthetic city。玩家未完成命令优先于通用AI；委任不能覆盖目标。见[行军技能](../.agents/skills/re-march-engagement/SKILL.md)。
- `generalIdx`与军团slot分开，`leader`仅显示/旧快照兼容；兵种`1骑/2弓/3步/4空`，六队原值为权威。`0x291A`、48周期回归与破城组撤退不能简化为普通返都。见[战后技能](../.agents/skills/re-post-battle/SKILL.md)。
- 状态段地址不等于SAVE偏移；军团`+2`主将byte与`+3`状态/倒数不能合成u16。BATTLE.MAP含214张64×64图，layout只选MDL块。MMAP透明用独立mask，索引0可能是不透明黑。见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- TALK38保留城市更新续段，返回后再处理相应RNG/治理/军团/天气，不重跑城市轮询；过期或重复回调不能复活旧局。灾害消息返回、入队成功/失败影响RNG；type11槽号与字节地址、雨云吸引maxY=400与回绕Y=272必须区分。见[内政/外交技能](../.agents/skills/re-domestic-diplomacy/SKILL.md)及[kernel笔记](docs/re-notes-kernel.md)。
- BGM运行资产是`web/grf/music/loops/*.flac`，不是试听WAV/MIDI；软件OPL3合成非实机录音，控制循环不保证PCM无缝，压缩不减少解码内存。CF9 TYPE1重启、TYPE2–4衰减；AH7取消未来SFX后继、AH8不取消。PCM音量、原/Web换日边界与OFF/OVER差异以[音频维护源](docs/re-notes-audio.md)为准，不宣称逐样本等价。

## 6. 常用命令

在仓库根执行；测试/生成器先审计I/O。开发工具依赖不等于产品运行依赖，不自动安装库或修改全局配置。

```bash
# 任一普通静态服务；端口是位置参数，前台常驻正常
python tools/webserver.py 8321
# 或：python -m http.server 8321 --directory web

# 内容源编译先输出新目录比较，确认后才显式输出到web；开发机需Pillow
python -B tools/compile_content.py --output /path/to/generated
python -B tools/verify_content_pipeline.py
node tools/verify_content_catalog.mjs
node tools/verify_world_resources.mjs
node tools/verify_start_flow.mjs
node tools/verify_standalone_web_browser.mjs

# 全量安全回归：已安装Playwright，必要时用PLAYWRIGHT_MODULE指定其路径
unset PYTHONOPTIMIZE
export PYTHONDONTWRITEBYTECODE=1
for f in tools/verify_*.mjs; do node "$f" || exit 1; done
for f in tools/verify_*.py; do python -B "$f" || exit 1; done
node tools/verify_battle_viewport.js

node --check web/src/main.js
git diff --check
# KI反汇编：VA=文件偏移-0x200；near call按16位IP回绕
PYTHONPATH=tools python -B -c 'from disasm import va_range; print(va_range(0x2D0,0x2F5))'
```

其它生成命令见[内容架构](docs/content-architecture.md)与对应SKILL/音频笔记；只重建变更涉及的资产。浏览器测试串行使用全新会话/profile，避免ESM缓存或真实存档干扰；只关闭本轮启动的服务/浏览器。

## 7. 分级验证

- **所有变更**：实际diff、受支持的变更文件LSP、`lens_diagnostics mode=all`、`git diff --check`；仓库外文件另查前后差异/空白/路径。工具可能自动格式化，后续编辑先重读。
- **文档/Skill**：链接、规则一致性、围栏/元数据；改加载配置才验证相应cwd的发现。无需无关游戏回归或浏览器冒烟。
- **规则/数据/工具**：focused回归、解析/静态检查与相关原始证据复核；共享调度、RNG、存档或跨模块状态变更须全量安全回归。
- **UI/浏览器**：全新profile验证流程及console/page错误；保存增加守卫、往返与失败路径，只用mock/内存/隔离profile。
- 工具缺失明确记录，可用覆盖同风险的替代检查，但不能报工具通过；关键覆盖不足标待验证/阻塞。测试数字、临时证据位置和调试经过只进journal，不构成永久健康保证。
