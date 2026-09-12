# 臥龍傳 Web · 会话日志

> 长期事实、当前架构、命令、约定和主线状态见[项目记忆](../AGENTS.md)；安全/审批见[全局AGENTS](../../AGENTS.md)。本文只保留当前重构批次及本轮文档整理的过程，不下达任务、不替代原始证据。历史测试结果只适用于所述批次。

## 开场批次完整提交前审查

- 用户本次明确授权：审查所有已改动/未跟踪文件，保留产品、测试、必要文档，排除本地代理和运行产物，创建一个完整提交并推送。该授权仅适用于本次；下方旧交接的“未授权提交”是当时状态。
- 候选26文件：开场源码/六份素材、启动和音乐衔接、相关测试、说明与journal。现有两份测试的换行格式改动已审查并保留。`.pi/`、`.codegraph/`、`.dragon-runtime/`、`.playwright-cli/`、缓存/临时截图保持忽略，不强制加入，不删除用户本地产物。仓库外数据Skill不属于本仓库提交；同等产品说明已经写入仓库文档。
- 审查发现并修复：快速关闭/开启开场音乐时，过期play Promise不得暂停较新的播放；补受控Audio异步回归，并补齐skip位置归零，保持单次播放/独立静音。没有修改游戏规则或存档格式。
- 全量安全回归最终覆盖142项（128 MJS、13 Python、1 viewport JS；另两份JS helper由对应浏览器测试调用）。首轮因部分测试找不到默认playwright停止；显式设置已安装的PLAYWRIGHT_MODULE后继续，未安装依赖或改全局配置。随后战斗布局fixture拒绝新增的本地开场CSS，已补`.css: text/css`白名单，不绕过资源错误检查；修正后该项及后续93项通过，之前49项通过。
- 原始验证日志：`/tmp/wolong-precommit-MNCrnt.log`（环境失败）、`/tmp/wolong-precommit-DuBYiw.log`（前49项及CSS fixture失败）、`/tmp/wolong-precommit-rest-jn21Ll.log`（修正后93项）。均为本机临时文件，不纳入提交。测试没有访问实际DOS SAVE或用户正式浏览器存档。
- 26份暂存候选通过路径排除和窄范围凭证扫描；从`git write-tree`导出到`/tmp/wolong-staged-r8d5oN`，独立部署与完整开场浏览器测试再次通过（含音频异步竞态），不依赖忽略文件兜底。Node在临时目录提示ESM自动识别，未为消除提示修改全局package配置。
- 主动LSP检查16份源/测试：11份push-only无法确认，其余辅助诊断为main既有布尔参数、测试localhost/日志风格警告；不称全绿。语法/差异检查和真实浏览器为补充覆盖。
- 远端预检受阻：当前origin为`https://gitea.fczllc.top/fczllc/dragon.git`，`git fetch origin`返回`404 page not found / repository not found`。未更改remote或凭证；本地验证/提交不依赖此网络步骤，远端更新需正确地址或访问权限。
- 本段记录提交前证据；实际提交/推送是否成功及哈希，以Git状态和最终交付回复为准，避免提前写成远端已更新。

## 本轮交接 checkpoint：开场移植与视口适配

### 目标

将用户提供的 `F:/dragon/wolong_intro_vite` 开场页面与音乐整合到当前游戏，从首次打开、现有新游戏/章节/势力/军师选择或读档，一直到进入战略地图。随后按用户截图修正普通窗口两侧留白。当前这次请求只补交接文档，不授权新功能或提交推送。

### 已完成工作

- 必要代码、配置和六份素材已迁入 `web/intro/`，以后在当前游戏项目维护；F盘原项目保留备份，不是运行依赖。六份素材与源文件SHA-256一致。
- 以原生RAF和sine.inOut插值替代GSAP，不引入Vite、PixiJS、npm运行依赖或构建步骤。
- 新场景接入 `boot → startApp → StartMenu → enterGame/returnToTitle`；保留原弹窗绘制和交互，未修改 `startmenu.js` 或 `startflow.js`。进入游戏清理开场音频/RAF，返回标题复用终场。
- 新MP3与现有音乐系统分离，标题不再选择旧FLAC曲目0，游戏内四季/交涉/战斗音乐和设置保留。
- 初版contain已改为左上覆盖、不缩小；9组视口测试及1912×956截图检查通过。具体测试证据见下方两个批次记录。

### 关键决策（最新确认）

1. 正常播放第15秒显示首个“是否新游戏”弹窗，背景继续播放；15秒前跳到最后立即放行弹窗；之后skip不关闭、不推进、不重置弹窗。
2. 背景“重新开始”按钮清除会话标记并整页reload，包括已有弹窗和选择；普通音乐按钮只控制开场音乐。skip停止并静音开场音乐，不影响游戏里的设置。单次MP3播完停止，不循环。
3. 首次进入当前标签页播放；同一标签页普通刷新/结束游戏reload直达终场，静态人物、不自动播音乐。网页无法可靠识别Ctrl+F5，用户已接受 `sessionStorage['wolong.intro.seen.v1']` 替代，不再承诺硬刷新必定重播。
4. 游戏内读取进度仍先退出当前局，经 `returnToTitle(1)` 显示终场和现有读档弹窗，不重播动画/音乐；取消沿用原流程。
5. 当前视口策略为 `max(1, innerWidth/1920, innerHeight/1080)`，原点(0,0)，不平铺、不缩小，必要时等比放大；右侧/底部溢出裁切，无滚动条。1920×1080为原尺寸；小窗口看见局部构图是预期，不为保全构图重新缩小。弹窗仍640×400、屏幕居中，控制按钮/页脚按视口定位。
6. 以上均为用户批准的Web表现决定，不冒称原版机制。长期详细维护源是[opening-scene.md](opening-scene.md)，journal仅记录本次交接。

### 失败尝试与纠正

- F盘项目没有CodeGraph索引，结构查询失败后改为只读文件检查，没有创建索引或安装依赖。
- 初版沿用了原开场的居中contain：窗口高度受浏览器工具栏影响时场景缩小，左右出现白边。用户截图明确否定这一效果，最终采用其确认的方案2；不要恢复contain。
- “严格不缩放且任意大分辨率都铺满”不能同时满足。已说明1920×1080边界，用户选择允许必要的等比放大，不是拉伸或重复图片。
- 不采用“可靠检测Ctrl+F5”的方案；已明确浏览器能力限制并获得会话标记替代方案批准。
- 初次迁入用了 `innerHTML`，静态检查报风险，改为解析本地 `scene.html` 后 `replaceChildren`。CSS一次批量编辑出现部分应用（前两项已落盘、第三项匹配不唯一），随后仅修正剩余项；另修复了测试里的尾随空白。
- 避免固定父层的叠层上下文把背景按钮压在整个弹窗Canvas下：标题容器改为display:contents，背景、弹窗、控制分别分层，小窗口命中已实测。
- 旧测试仍预期loginbg和标题BGM0，按新产品行为更新断言，而不是恢复旧播放路径。LSP多次无法确认干净状态，不能把silent-on-clean、服务不可用当通过。

### 相关文件

| 用途 | 路径（相对 `web-port/`） |
| --- | --- |
| 开场生命周期、音频、视口比例 | `web/intro/app.js` |
| 动画参数投影 | `web/intro/timeline.js` |
| 文字/音乐配置、场景结构、样式 | `web/intro/intro.config.js`、`scene.html`、`styles.css` |
| 迁入素材 | `web/intro/assets/{landscape.png,cliff.png,gametitle.png,character-aligned-still.png,wolong_sleeves_aligned.gif,opening.mp3}` |
| 页面、启动与场景交接 | `web/index.html`、`web/src/boot.js`、`web/src/main.js` |
| 标题音乐所有权 | `web/src/core/score.js` |
| 新增浏览器回归 | `tools/verify_opening_browser.mjs` |
| 更新既有断言 | `tools/verify_music_browser.mjs`、`verify_music_runtime.mjs`、`verify_title_deferred_map.mjs` |
| 维护说明与音频差异 | `docs/opening-scene.md`、`docs/re-notes-audio.md`、`AGENTS.md` |

仓库外还更新了 `E:/Dragon/.agents/skills/re-data-formats/SKILL.md` 的开场差异摘要与链接；不要漏记为仓库内提交文件。

### 当前状态

- 本地整合及视口修改已完成，浏览器回归通过；尚未收到用户对最终视口效果的新反馈，不据此声称用户已视觉验收。未部署远端、未commit/push。
- 交接时现场Git：分支 `main`，HEAD `1630d28 refactor: separate content sources, world resources and startup flow`。产品/测试/文档改动仍在工作区，`web/intro/`、`docs/opening-scene.md`、`tools/verify_opening_browser.mjs`仍未跟踪；下轮必须重新查状态。
- 开始本轮前已存在 `tools/verify_standalone_web_browser.mjs`、`tools/verify_world_resources.mjs` 的改动；本轮只运行前者，未编辑这两个文件，不能当无关噪声回退。
- 开场移植阶段通过7项focused检查；最终视口修改后重跑新增开场浏览器回归（含9组尺寸）、3份JS语法及diff检查。未重新跑全量战略/战斗规则回归；下方历史141/141不是本轮全量结果。
- 临时图：最新 `C:/Users/fczll/AppData/Local/Temp/wolong-opening-cover.png`；旧contain对比 `.../wolong-opening-integrated.png`。Temp可能被清理，应能从测试重生成。

### 阻塞点与验证边界

- 没有已知阻塞当前功能交付的问题；自动播放仍受浏览器用户手势策略限制，已有开场解锁处理。
- 主动LSP部分push-only未确认、Markdown语言服务不可用；辅助诊断有既有布尔参数/测试localhost风格警告。以语法、隔离浏览器、差异及链接检查补充，不报全绿。
- 全屏测试采用对应视口尺寸，不是实机按F11；没有宣称全浏览器/所有DPR或用户实际机器都已验收。存档测试仅使用临时端口与全新profile，未访问真实DOS SAVE或实际用户IndexedDB。

### 下一步（不是自动授权）

1. 下轮先读根AGENTS、`web-port/AGENTS.md`和[开场维护源](opening-scene.md)，重新检查工作区；依据用户下一条要求继续，不从历史“提交前审查”恢复commit/push授权。
2. 若用户反馈视觉问题，只在 `web/intro/` 调整，保持上述门控、音频隔离和既有弹窗；不要回F盘项目作为主维护源。
3. 如需复测，在仓库根运行 `node tools/verify_opening_browser.mjs`；设置 `OPENING_SCREENSHOT` 为临时绝对路径可导出1912×956截图。需人工体验时用普通静态服务器启动完整web目录，在独立profile检查普通窗口/F11。
4. 本次仅写journal，无需再跑无关游戏回归。用户明确要求提交/推送时再审查全部候选变更，保护既有两份测试修改，并单独说明仓库外Skill。

## 开场视口调整批次：左上覆盖、不缩小

- 用户确认方案2：`scale=max(1, width/1920, height/1080)`，背景固定左上角，不平铺、溢出裁切，不改变既有弹窗大小/居中及开局流程。撤销初版contain配置。
- 全新隔离浏览器开场回归通过，新增9组尺寸：1912×956、1920×1080、2560×1440、3840×2160、1366×768、3440×1440、1280×1024、800×1200、640×400；断言左上原点、覆盖、不缩小、无滚动条/滚动、640×400弹窗居中。保留15秒、跳过、新局/隔离读档、刷新和自然终场验证。模拟全屏视口尺寸，未声称实际按F11。
- 检查1912×956截图：`C:/Users/fczll/AppData/Local/Temp/wolong-opening-cover.png`，原两侧适配白边已消除。3份JS语法及diff空白检查通过。LSP主动检查有push-only未确认、Markdown服务不可用及测试localhost风格警告，未冒报全绿。未跑无关战斗回归，未提交推送。

## 开场移植批次：原生场景与开局衔接

- 用户批准：15秒放行既有弹窗，提前skip立即放行；晚skip不动弹窗，停曲静音只作用开场；会话刷新/结束直接终场，显式重启整页重播；游戏内读档直达终场和存档框。无法可靠识别Ctrl+F5，采用已批准的sessionStorage替代。详细维护源：[开场场景](opening-scene.md)。
- `web/intro/`迁入必要资源与配置，原生RAF替代GSAP；没有引入Vite/Pixi/第三方运行依赖。六份资产逐文件SHA-256与F盘源一致，F盘原项目保留。旧标题FLAC保留资源但停止标题选曲，独立MP3不写游戏音乐设置。
- 通过7项focused检查：opening browser、music browser、music runtime、start flow、startmenu empty slot、title deferred map、standalone web browser。浏览器均临时端口/全新隔离上下文；实际覆盖15秒、早晚skip、自定军师、真实新局与隔离保存/读取、刷新/重启、小窗口按钮命中、自然终场、单实例及原音乐菜单。没有访问DOS SAVE或用户实际IndexedDB。
- 10份JS/MJS语法检查、实际diff及`git diff --check`通过。13份源/测试主动LSP探测：11份因push-only/silent-on-clean不能确认，另2份有4条既存风格警告（main布尔参数、音乐测试临时localhost）；不声称LSP全绿。5份Markdown的LSP不可用，另核对围栏与本地链接。全量战略/战斗机制回归未跑：本批未改变规则/存档格式/调度，仅开场表现与生命周期入口。
- 人工查看浏览器截图确认叠层；临时截图`C:/Users/fczll/AppData/Local/Temp/wolong-opening-integrated.png`。保留开始时已有的`verify_standalone_web_browser.mjs`、`verify_world_resources.mjs`改动，本批未编辑它们。未commit/push。

## 1. 基础重构 B0–B4a：范围与进展

用户批准渐进重构，同一内核服务Web内容源；本批保持现有规则、UI、RNG顺序、消息返回边界及四槽存档。未实施编辑器、扩容、Loading/通关动画或新运行时依赖。

1. **基线与I/O审计**：保存原代码/测试及资源哈希；两路只读审计分别检查测试安全和内容/地图依赖。138个原有验证文件区分可执行测试与helper；禁止触碰真实SAVE，浏览器使用隔离profile。保留原有`ai.js`条件换行和两个测试文件格式改动。
2. **公共查询/兼容边界**：抽出`playerqueries.js`，命令模块保留旧导出，外交不再反向依赖命令；`legacyrecords.js`隔离原字节读取，未重解释AI别名或初始/运行字段选择。
3. **内容源**：导入20章可编辑Web文档，增加包/章节/修订身份与旧索引映射；已命名字段驱动编译，未知兼容字节保留。编译结果与原运行模板无损一致，不宣称完整DOS序列化。
4. **地图源/世界实例**：256个16×16图块转换为256×256索引色atlas，另存裁剪、四季调色板、排列、据点位置和道路拓扑。导航算法移入实例工厂，旧API指向默认世界；现有Canvas继续使用四季整图。
5. **开局流程**：从StartMenu抽出无绘制开局流程，保留选择循环、旧章节索引、默认/自定军师返回值和await进入边界；窗口布局、输入及finally清理由StartMenu持有。
6. **文档回流**：内容格式、生成入口、资源职责和固定限制统一在[内容架构](content-architecture.md)；README撤销过时的服务端SAVE API/lease要求，项目记忆与数据技能同步入口。

整体重构未完成；下一阶段范围以[项目记忆“当前主线”](../AGENTS.md#2-当前主线)为准，不在日志重复维护待办。该开发批次未commit/push。

## 2. 调试、失败尝试与修正

- 发现“直接改解码字段、仍由raw驱动部分规则”的双源风险：改为命名字段覆盖已建模兼容字节；未知区保留，不用经验补定义。回归专门修改生产力、城类型、资金、人物名与世界坐标，验证编译与显示派生字段同步。
- 原地图PNG是完整地图，不是图集：另建可编辑atlas/布局源，保留现有整图渲染；未把视觉道路当作导航或删除旧格网回退资源。
- 编译可能在写出数据后才遇到坏调色板：增加临时目录预生成，校验/渲染成功后再发布；补非有限JSON值拒绝。发布阶段仍非跨文件事务，磁盘/权限失败需重新生成核对。
- 开局旧注释与取消后的实际外层循环不完全一致：本次机械保留代码返回路径，不按注释悄悄改交互；用流程回归锁定此次迁移前后的行为，不据此认定原版机制。
- 曾误跑不存在的`verify_road_resume_restore.mjs`，报MODULE_NOT_FOUND，未计为覆盖；改用实际存在的回归与原导航备份差分。
- `render_map.py`固定资源路径被报路径穿越：逐项确认仅由脚本根和代码常量构成，无外部路径输入，记录为误报；未禁用规则或修改工具权限。Markdown语言服务未就绪，另用链接/结构检查，不冒报LSP通过。

## 3. 该代码批次验证

- 最终全量 **141/141通过**：127 MJS、13 Python、1 viewport JS，其中10项隔离浏览器；两个JS helper分别经音乐/独立部署测试调用，未将空执行算覆盖。中间阶段结果不再重复保留。
- 原导航备份差分：1468组道路路线、32组格网路线、192节点地址换算一致；检查包含边/腿/点顺序。
- 编译回归：20章完整对象、道路JSON、布局/成本字节及四季逐像素一致；7项既有运行资产SHA256未变。非有限值拒绝补充后重跑内容focused回归通过。
- 独立部署：仅复制`web/`到临时静态根，拒绝外源请求；全新profile真实点击开局，检查延迟加载、首章旧索引16及浏览器单实例接管。Python纯源测试用审计钩子拒绝所有原版目录和SAVE文件访问。
- 静态检查：27个变更JS/Python primary LSP通过，随后2个Python/3个关键JSON复查通过；29个JS/Python语法检查、82模块静态ESM依赖检查通过。27份源JSON及5份文档结构/链接检查通过；5份Markdown LSP不可用，未计通过。最终lens与diff检查通过。
- 原有两个测试文件与基线逐字节一致，AI diff保留原条件换行。没有把测试通过扩写为全DOS等价或已支持动态世界切换。

## 4. 相关文件

| 范围 | 文件（相对仓库根） |
| --- | --- |
| 查询/兼容读取 | `web/src/game/{playerqueries,legacyrecords,commands,diplomacy,ai}.js` |
| 内容与地图源 | `web/content/builtin/`、`web/src/content/`、`tools/{content_pipeline,compile_content,import_builtin_content,parse_sinario,render_map}.py` |
| 世界/导航 | `web/src/game/{worldresources,roadgraph,pathfind,world}.js`、`web/src/game/navigation/` |
| 开局与装配 | `web/src/app/startflow.js`、`web/src/ui/startmenu.js`、`web/src/main.js`、`web/src/core/assets.js` |
| 新回归 | `tools/verify_content_pipeline.py`、`tools/verify_{content_catalog,world_resources,start_flow,standalone_web_browser}.mjs` |
| 长期说明 | `AGENTS.md`、`README.md`、`docs/content-architecture.md`、仓库外数据技能 |

## 5. 项目记忆整理批次（仅文档）

- 只整理`AGENTS.md`与本文；保留工作区全部既有代码、资产、测试及其它文档改动，不读取真实SAVE，不commit/push。
- 项目记忆补齐B0–B4a当前主线，集中长期架构、命令、产品约定和重要坑点；日志聚焦本批进展、失败原因、相关文件及验证，不再复制长期规则。
- 删除旧音频/接战批次过程、重复测试数字、历史提交授权、过期“本次整理”记录、机器临时目录和中间快照位置。仍有效的产品决定/风险留在项目记忆，详细音频、战术、TALK38等证据继续由原SKILL/`re-notes`维护，未删除原始证据文件。
- 本轮未跑游戏回归或浏览器冒烟；上节141项是代码批次结果。两份文档的17个相对链接/锚点、围栏、空白、实际差异及`git diff --check`通过；文件哈希核对确认本轮只改这两份文档。Markdown LSP不可用，lens缓存未提供本轮文档诊断，不计作主动检查通过；以结构/引用和差异检查补足。

## 6. 完整提交前审查与验证

- 用户明确授权审查全部已改动/未跟踪内容，形成一个完整提交并推送。候选共62文件：产品源码、测试、离线迁移/编译工具、29份内容源/资产及4份文档；现有忽略规则排除本地代理配置、缓存、运行日志、截图与图像工程文件，未强制加入忽略项。
- 两路只读审查覆盖运行层和内容/工具。发现编译器接受零权重道路、运行时却拒绝；已在`content_pipeline.py`统一为有限正数，测试覆盖零、负数、布尔、字符串、null及非有限值，并确认失败不覆盖已有产物。基准内容本身有效，未修改规则或资产。
- 补强`verify_world_resources.mjs`：两世界使用不同terrain/cost并在第二次加载后分别断言；补强`verify_standalone_web_browser.mjs`的console.error/requestfailed捕获。两项原覆盖不足不代表运行时已发生串用或网络错误。
- 修正后重新执行全量安全回归 **141/141通过**，另从Git暂存区导出821个发行/测试文件，再以隔离profile真实开局和单实例接管通过，排除工作区忽略文件兜底。20章与解析/产物一致、12项来源哈希匹配；未访问真实SAVE。
- 独立导航差分覆盖36,864条有序路线、384个阻断/惩罚案例、11,560个行军上下文、98,304个格点和192条A*路线，与HEAD一致；只证明本次重构等价，不证明全DOS机制。
- 29份JS/Python与3份Markdown primary LSP通过；journal语言服务不可用，以结构/链接与实际差异检查补足。JSON解析、窄范围凭证模式扫描、暂存内容与空白检查另行核对；审查日志、基线及测试输出保留仓库外。
- 暂存导出的测试出现Node无type字段自动识别ESM警告，功能通过；未为消警告改全局package配置。LF/CRLF提示不算失败。提交/远端结果以Git为准，不预记尚未执行的推送为成功。
