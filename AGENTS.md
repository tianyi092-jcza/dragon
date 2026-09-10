# AGENTS.md — 臥龍傳 Web 项目记忆

> 长期事实、架构、命令与现行约定维护于此；先读[全局AGENTS](../AGENTS.md)，安全、证据、审批与自主执行以其为准。
> [会话日志](docs/checkpoint-journal.md)记录进展、失败尝试和验证，不下达任务。模块细节与原始证据只在对应SKILL和`docs/re-notes-*.md`维护，不在本文件复制推导过程。

## 1. 项目与证据边界

- 用原生JavaScript ES Modules + Canvas 2D重写1995 DOS《臥龍傳》；无模拟器、框架、构建或npm运行时依赖，产品由静态服务器运行。
- 仓库`E:/Dragon/web-port`；原程序/运行数据`E:/Dragon/Dragon/`；官方基准`E:/Dragon/原版/`。`上/中/下/后/`是改版库，不能证明官方机制。
- 原始指令、数据/资源及必要的受控原版观测才是机制证据；用户观察、Web现状、测试和文档只作线索。结论区分实锤/推断/未知，未闭合不得补公式进入正式规则。
- 新证据须同步实现、测试及唯一详细维护源；用户批准的Web差异另标，不反写成原版事实。表现不得暗改规则状态、RNG消费、胜负、六队伤亡、士气、城壁或城损。
- 自动化禁止读写`E:/Dragon/Dragon/SAVE.DAT`；不得覆盖用户/其它会话改动。commit与push分别需要明确授权，本地交付不要求自动提交。

## 2. 架构与数据流

| 入口/模块 | 职责 |
| --- | --- |
| `web/src/main.js` | App装配；新局/读档统一`loadState`；战略RAF、月结、战术入口与战果回写 |
| `web/src/game/clock.js` / `tacticalclock.js` | 战略日历/五档预算与独立战术帧预算 |
| `web/src/game/ai.js` / `weather.js` | 据点/军团AI、接敌、战后状态机、战略事件与灾害 |
| `web/src/game/roadgraph.js` / `autobattle.js` | 原版道路拓扑、寻径及战略六队速算 |
| `web/src/game/battle/original*.js` | 权威`OriginalBattleSession`、RNG、VM、对象、命令与结算 |
| `web/src/game/savegame.js` | IndexedDB快照、运行态sidecar及保存守卫 |
| `web/src/render/mapview.js` / `battleview.js` | 战略/战术投影与输入桥接 |
| `web/src/render/engagementpresentation.js` / `minimapmarkers.js` | 接战独立音画时钟与只读方块投影 |
| `web/src/core/music.js` / `score.js` / `speaker.js` | BGM播放、场景选曲与单声道效果音 |
| `web/src/ui/gamebar.js` / `hud.js` / `startmenu.js` | 菜单、Canvas弹窗、战略消息FIFO、标题与角色确认 |
| `tools/parse_*.py` / `export_*.py` / `verify_*` | 原数据解析、资产生成与分层验证 |

- 逻辑分辨率`640×400`，战略网格`384×256`；浏览器负责视口缩放。`web/data.json`由`parse_sinario.py`生成20章，错误须修解析链，不能手改生成物掩盖。
- SINARIO不含运行时军团表，新局从`legions=[]`开始；保留每章16雨云初态和头部吸引边界。地图对象前16槽为火灾/暴动、后16槽为常驻雨云，不能用删除/filter压缩固定槽。
- 规则只用canonical `OriginalBattleRng`字节流，进程启动时由RTC播种一次；新局/标题不重新播种，读档恢复快照。禁止`Math.random()`回退，异步战术须先回写同一RNG再恢复战略。
- 正式保存为IndexedDB `wolong-web/saves`四槽JSON。sidecar是同一快照内的导航、军团、回归队列、事件/灾害、调度游标、军师与RNG附加状态，不是服务端文件；旧SAVE上传API、token/lease不是现行架构。
- 战斗、接战过渡或待补日历进位期间禁止快照。游戏内读档必须先回标题；空槽在hover、hit-test、click三条路径均禁用。保存测试仅用mock、内存或隔离profile。

## 3. 现行交互与Web产品决定

- 完整状态表见[UI技能](../.agents/skills/re-ui-advisor-menu/SKILL.md)：不增加关闭按钮；可取消窗口右键逐层退回；普通NPC/武将提示3秒或右键关闭后执行回调。外交费type5整段禁右键，不得用自动关闭或羽扇绕过强制预算。
- 羽扇是军师一级菜单唯一开关，只清所属工作流。选中任一子菜单就锁住整个地图；嵌套退层保留上级选中/hold，最后退出才释放。仅展开一级菜单时只拦截实际`640×48`矩形；空白地图左键不关闭界面。
- 系统/战略模态、场景切换及战术入口通过所属`clock.hold`冻结战略，不改速度档模拟暂停。地图鼠标移动立即取得独立hold，静止满1秒释放；所有hold取并集，不得互相覆盖。
- 正常地图逐RAF重绘；每RAF最多一个战略步或完整战术帧，不补后台债务。指针更新合并RAF，Canvas backing store仅在尺寸/DPR变化时重建；绘图不推进导航、规则或RNG。
- Canvas列表右侧滚动条、24px表头、墨绿`#4a7828`选中；排序后仍绑定原对象。战略消息进入`GameBar` FIFO，有证据时用`enqueueTalkMessage`；提交与后续RNG遵守消息返回边界。
- **玩家化身**：自定军师为`{custom:true,general_idx:null,name,hao,portrait}`；默认军师成为化身后排除普通武将/编成/任官/自动出征候选。这是Web决定，不能推翻原版候选规则。
- **结局**：统一全部据点后继续战略地图、不播D7END；信赖归零和玩家势力灭亡仍保留GAME OVER，不能整体删除`EndView`。
- **音频菜单**：仅六行——保存、读取、音效、战略速度、战术速度、退出。单一「音效」TYPE1→2→3→4→关闭调CF9音量，不是选曲或四种SFX音色；OFF停止BGM，不禁用PC/FM效果。内部`MusicPlayer`不是额外菜单项。
- **接战表现**：共享独立时钟100ms换帧、200ms触发声音，首次音画同步、结束同时清理；暂停冻结且不补播。PCM不升调，重复触发可截尾音。独立的是音画节拍，不是接敌等待窗口；不改道路轮询/倒数，也不延后战斗入口。
- **战术表现**：入场与后续战斗共用半速预算，`TACTICAL_PLAYBACK_RATE=0.5`，低四档等待加倍、最高30Hz，首帧仍立即执行。战术对白3秒或全局右键关闭，不暂停Session；不显示战术小地图/右下双箭头。详见[战术规则§5](docs/re-notes-tactical-rules.md)。

## 4. 重要坑点与证据入口

- 军团按槽轮询而非每日移动：主更新处理1据点/16军团，128军团需8次；Canvas插值不能写回规则坐标。敌城末端边界tile在坐标写回前检查，攻方停在前一道路点；真实军团不能合并或以synthetic city代替。
- 玩家未完成命令优先于通用AI；委任只决定战斗处理和后续自主。速算以六队原值为权威，兵种`1骑/2弓/3步/4空`；主将`generalIdx`与军团slot不可混用，`leader`仅显示/旧快照兼容。`0x291A`不是普通撤退，48周期回归/破城组撤退不可统一简化成返都。详见[行军](../.agents/skills/re-march-engagement/SKILL.md)、[战后](../.agents/skills/re-post-battle/SKILL.md)。
- 战术权威仅`OriginalBattleSession`；固定顺序为就绪输入→`A426` VM→`A065`帧，无输入仍推进。速度不改变规则帧/调用次数/RNG；没有真实对象/墙记录不得按战略比例臆造城损。详见[战斗技能](../.agents/skills/re-battle-command/SKILL.md)。
- 状态段地址不等于SAVE偏移；军团`+2`是主将byte、`+3`复用为状态/倒数，不能合成u16主将。BATTLE.MAP有214张64×64地图，layout只选MDL块。MMAP透明来自独立mask，索引0可能是不透明黑。详见[数据技能](../.agents/skills/re-data-formats/SKILL.md)。
- 灾害固定槽与消息返回顺序影响RNG：玩家提示返回后才消费强度/removal；入队失败不能照搬成功分支。type11槽号/字节地址须区分，雨云吸引maxY=400与物理回绕Y=272是不同字段；`0x4269`结算城损。完整公式与资源见[内政/外交技能](../.agents/skills/re-domestic-diplomacy/SKILL.md)、[kernel笔记](docs/re-notes-kernel.md)。
- BGM实际播放`web/grf/music/loops/*.flac`，Web Audio解码PCM；标题0、四季2–5、交涉6、战术7–10、失败OVERBGM自动选曲。WAV试听、MIDI/VGM证据不等于运行时曲库。FLAC无损的是软件OPL3合成，非实机录音；控制循环不保证PCM无缝，压缩不减少解码内存。
- CF9的TYPE1重启，TYPE2–4只衰减；音乐AH7取消未来SFX后继而保留当前自然衰减，AH8不取消该后继。PCM音量是Web近似；原版换日hour1与Web hour0、Web OFF抑制OVER与独立D7无条件播放的差异仍保留。详见[音频维护源](docs/re-notes-audio.md)。
- 新浏览器profile避免旧ESM缓存/真实存档干扰；`webserver.py`端口是位置参数，前台常驻正常，不重复占端口。pi-lens可能格式化，后续编辑重读文件，不覆盖其它会话改动。

## 5. 常用命令

在`E:/Dragon/web-port`执行；运行任何测试/生成器前审计I/O，下面的循环不是SAVE安全豁免。

```bash
# 静态服务（另开终端测试，结束后关闭本次启动的服务）
python tools/webserver.py 8321

# 全量回归；使用已安装的Playwright，不自动安装依赖
export PLAYWRIGHT_MODULE='C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright'
unset PYTHONOPTIMIZE
export PYTHONDONTWRITEBYTECODE=1
for f in tools/verify_*.mjs; do node "$f" || exit 1; done
for f in tools/verify_*.py; do python -B "$f" || exit 1; done
node tools/verify_battle_viewport.js

# 静态检查；仅生成器变更时重建对应资产，不顺带重建其它产物
node --check web/src/main.js
python -m py_compile tools/parse_sinario.py tools/parse_battle.py tools/export_battle_rules.py
git diff --check
python tools/parse_sinario.py
python tools/parse_battle.py
python tools/export_battle_rules.py
python tools/extract_march_markers.py

# 独立浏览器冒烟；不用真实profile
SESSION="dragon-smoke-$(date +%s)-$$"
playwright-cli -s="$SESSION" open http://127.0.0.1:8321/ --browser=chrome
playwright-cli -s="$SESSION" console
playwright-cli -s="$SESSION" close

# KI反汇编：VA=文件偏移-0x200；near call按16位IP回绕
PYTHONPATH=tools python -B -c 'from disasm import va_range; print(va_range(0x2D0,0x2F5))'
```

音乐再生依赖离线工具环境，不是产品依赖；完整命令与固定核证书见[音频笔记](docs/re-notes-audio.md)，不要在游戏运行时安装合成库。

## 6. 分级验证

- **所有变更**：检查实际diff、受支持的变更文件LSP、`lens_diagnostics mode=all`及`git diff --check`；仓库外文件另查前后差异/空白/路径。
- **纯文档/Skill**：查链接、规则一致性、围栏和元数据；改加载配置才验证相应cwd的发现。无需无关游戏回归或浏览器冒烟。
- **规则/数据/工具**：focused测试、解析/静态检查与原始证据复核；共享调度、RNG、存档或跨模块状态变更须全量安全回归。新测试也须先审计I/O。
- **UI/浏览器**：另用全新Playwright会话/profile验证修改流程及console/page错误。保存场景增加守卫、往返和错误路径验证，只用mock/内存/隔离profile。
- 工具缺失须明确记录，可用覆盖相同风险的替代检查，但不能报为工具通过；关键风险未覆盖则标待验证/阻塞。批次测试数不属于永久保证。

## 7. 当前主线与状态

- 原生战略/战术、IndexedDB保存、规则RNG及自动场景音乐已接入；近期音频菜单纠正、战术半速、独立急促接战音画已交付，当前行为以本文件及对应维护源为准。
- 普通非接触道路调度尚未全链闭合；战术BD46/B824/compositor等只达到笔记标注的scoped-PASS，不能宣称全DOS等价。具体缺口按对应SKILL核对，不恢复已作废的旧待办。
- 当前工作只由最新用户请求决定；旧日志不自动授权下一批。分支、提交与工作树状态现场读Git，最近验证及本轮详细进展只记[日志](docs/checkpoint-journal.md)。
