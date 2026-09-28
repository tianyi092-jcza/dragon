# Checkpoint Journal

> 本轮交接记录，不是长期指令、原机制证明或新任务授权。长期事实/架构/命令/约定见[项目记忆](../AGENTS.md)；机制细节留在SKILL和`re-notes`。本文删除旧P批次流水账、重复验证声明及已退役方案的独立章节，必要过程合并如下。

## 1. 当前交付状态

- 本记录随 **0.1.2 发布批次**纳入提交，前序成果提交为`1102efa`。本批包含后续表现修正、默认面板、测试与必要文档；最终提交以`v0.1.2`标签为准，不在自身提交中猜写SHA。
- 用户已明确授权审查全部改动与未跟踪文件、完整提交、推送GitHub并创建Release。版本概要见[CHANGELOG](../CHANGELOG.md)，版本号见根目录`VERSION`。
- Jev CLI、说明和mock测试经审查作为可复用开发工具纳入；默认不联网、不进入产品运行时。修复缺少retry-after-ms时将null误作0的退避问题并增加mock覆盖。本地代理状态、凭据、缓存、运行报告、临时截图和dist不纳入。
- 用户已确认军团移动及最新云雨暂停/运行问题解决；随后要求默认打开三块UI，已实现并验证。当前没有已复现且未解决的本轮功能阻塞。
- 没有扩展原规则容量、改变AI或安装运行时依赖；未访问真实SAVE/存档/profile，未使用子代理。发布目标为GitHub `main`与`v0.1.2`；Gitea镜像不在本次发布目标内。

## 2. 本轮实现与相关文件

| 工作 | 结果与维护源 | 关键文件 |
| --- | --- | --- |
| Web基础与内容扩展 | 行为基线、资源/状态分层、多档正文+摘要事务、JSON管理、受限编辑器、地图分块；仍192据点，启动仍全读快照。[基础](web-refactor-phase1.md)／[扩展](web-refactor-phase2.md) | `core/savecatalog.js`、`saverepository.js`、`indexeddbsavebackend.js`、`saveexchange.js`；`tools/contenteditor.js`、`render/chunkedterrain.js`；离线`apply_content_patch.py` |
| 3F47恢复缺口 | 保存里已有movement/terrain/cityCache，但App读档接线漏传；补全参数，不合成替代、不放宽守卫。[行军证据](re-notes-march-pathfinding.md) | `main.js`；`verify_legion_lifecycle_browser.mjs`非默认RAM往返哨兵 |
| 行军/接战/战略节奏 | 统一锚点、8×movePeriod插值、五响上限与提速；之后修复图标提前转向/驻守和首次加载空帧。[现行表现](march-presentation-fixes.md) | `render/mapview.js`、`engagementpresentation.js`、`game/clock.js`；`verify_march_marker_presentation.mjs`、`verify_march_markers_browser.mjs` |
| 云雨表现 | 保留原完整PNG，独立八帧播放和平滑位移；随战略计时冻结/恢复，持续慢帧不再停动画，追赶距离不再触发消失。[现行合同](presentation-modernization.md) | `render/presentationclock.js`、`weatherpresentation.js`、`main.js`；`verify_weather_presentation.mjs`、`verify_weather_browser.mjs` |
| 默认UI | 新游戏和标题读档后展开军师一级菜单、势力信息、小地图；不选中子项、不添加hold，按钮仍可收起 | `main.js: enterGame`；生命周期浏览器断言；外部`re-ui-advisor-menu/SKILL.md` |

表中`core/`、`render/`、`game/`与编辑器`tools/`路径相对`web/src/`；验证与离线脚本在仓库`tools/`。外部Skill位于`E:/Dragon/.agents/skills/`。

## 3. 调试过程、失败尝试与修正

| 问题／尝试 | 定位及最终处理 |
| --- | --- |
| 前两阶段浏览器3F47失败 | 改前参考版本同样失败；根因为恢复能力漏传，不是原DOS公式未知。补接后原失败测试及三项非默认RAM保存/读档通过。 |
| fresh与JSON恢复快照要求完全相等 | 既有恢复会将sidecar默认值具体化；分别冻结两种表示，不为对齐测试改规则。 |
| 非整数DPR分块像素漂移 | 保留现行DPR覆盖，增加整图采样回退；不以删除失败用例宣称一致。 |
| 军团插值位置配上规则终点帧 | 造成提前转向/驻守；显示段未完按该段方向，段尾再用规则帧。另预载全部120张军团标识，避免首用null。 |
| 渐变云先灰后白，仍不符合原外观 | 两种程序云均退役，恢复原八帧完整PNG；不再叠加自绘雨丝。仅分析方案未实施时曾导致用户刷新仍旧，后已实际修改。 |
| 恢复PNG后雨丝静止 | 原生天气更新不推进对象frame；表现播放器独立换帧，不写回规则。 |
| 移动中云团消失又出现 | 曾用规则位置与滞后显示位置的差判回卷，反复清alpha；改为比较相邻权威位置，真跳变只重定位。 |
| 暂停政策反了、正常计时动画停住 | 用户澄清后云雨随计时暂停；另将>100ms慢帧整帧丢弃改为最多推进100ms，后台显式pause。测试注入120ms可见负载覆盖运行态。 |
| 预载军团图后天气资源统计0/16 | 默认Resource Timing缓存容量不足；在测试新profile扩大buffer，保留资源/错误断言。 |
| 默认势力面板引出战斗测试异常 | 测试用普通对象缺`Scenario.monarchOf/city`；改用正式Scenario包装及君主索引，不关闭面板、不删错误断言。 |
| 云雨只读断言跨越update | 改成紧贴draw取证；浮点收尾采用容差，不改变生产规则。 |
| 快照路径分隔符导致模块404 | 证据生成器按Windows路径形态重建；失败轮保留，重新全量验证，不拼接成绩。 |

这些记录是工程调试，不作为新增原机制结论。历史“渐变云／暂停仍播放／只用规则frame／长帧全丢”均已废弃，不再作为实施参考。

## 4. 验证证据与限制

证据公共父目录：`C:/Users/fczll/AppData/Local/Temp/`。每根的`checks.json`及receipts/源码hash才是对应批次结果；临时文件可能被清理，缺失时不可推定仍有效或补造证明。

| 证据根 | 最终执行轮 | 结果／用途 |
| --- | --- | --- |
| `dragon-refactor-phase2/` | full-2 / browser-2 | 非浏览器201通过；浏览器22/24，保留两项3F47失败历史 |
| `dragon-3f47/` | full-2 / browser-2 | 201/201、24/24；恢复漏传闭合 |
| `dragon-march-presentation/` | full-2 / browser-2 | 201/201、24/24；插值/五响/提速；manifest仅CodeGraph后台日志漂移 |
| `dragon-march-markers/` | full-4 / browser-4 | 203/203、25/25；出城/转向/驻守与图片就绪 |
| `dragon-weather-clock-follow/` | full-4 / browser-4 | 203/203、25/25；原PNG、运行慢帧、暂停冻结 |
| `dragon-default-panels/` | full-5 / browser-5 | 203/203、25/25；新局及读档默认展开 |
| **`dragon-release-012/`** | **full-4 / browser-4** | **发布前完整轮：203/203、25/25；另Jev mock 10/10** |

- 最近完整轮非浏览器DRIFT[]，822文件浏览器快照前后及与当前生产/测试源码零漂移，Node语法与diff检查通过。完整轮包含八帧云雨逐像素、规则/RNG不变、存档隔离往返、军团及原规则基线；不等于完整原版战役认证。
- 默认面板初轮full-4通过、browser-4为24/25；上节Scenario夹具修复后从首入口完整重跑，不拼接成绩。
- 较早渐变探索及focused修复证据仍分别留在`dragon-modern-presentation/`、`dragon-white-cloud/`、`dragon-original-cloud/`、`dragon-cloud-animation/`；它们的通过不证明现行外观或暂停政策。
- LSP存在push-only inconclusive、Markdown服务unavailable、部分超大文件超限；无error报告不等于全clean。实际执行/静态检查补充覆盖，不能伪称工具已确认。
- 复用固定入口/I/O白名单、Node/Python权限守卫及fresh browser profile。测试套件包含有意错误/资源失败探针，不能笼统声称全套零console错误；对应专项自己校验预期。
- 适用的跨域重构曾审最小脱敏preview后调用Jev，仅advisory；确定性修复及本次纯文档整理不额外调用。

## 5. 阻塞、后续与交接

- **本次文档整理**：只改项目记忆和本journal，清除旧主线串行前提、过时HEAD/待提交清单、旧P编号流水账及重复的LSP/权限声明；保留本轮失败原因和可定位证据。两份文档的文件链接与围栏检查、git diff --check通过；822个生产/测试快照文件无变化，未重跑游戏套件。Markdown LSP不可用，mode=all无可用缓存，不据此宣称LSP clean。
- **0.1.2发布**：本次用户已同时批准commit/push/Release；审查范围包括此前未跟踪开发工具，但不包含本地运行产物。发布批次另核14个JS语法、文档链接、diff及822个浏览器快照与当前源码一致。14项LSP主动检查均push-only inconclusive，实际测试补覆盖。最终推送/发布状态以GitHub标签、Release及交付回执为准。
- **未实现的扩展**：超过192据点/规则容量、任意道路/城池移动、大地图建筑分层、脏层渲染及其它表现播放器尚未实现。不是本次批准任务；继续时先界定范围，再按对应规则或表现合同验证。
- **据点整体偏移**：仅评估，未实施。整座建筑在底图内，不同于中心小标识；直接挪矩形会带动地面与道路，需要单独美术分层方案。
- **原证边界**：具体未知/有界围栏看AI全链和各`re-notes`，不把旧日志中的待调查事项自动升级为本轮阻塞，亦不宣称全逆向结束。
- **文档遗留链接**：部分`re-notes`仍指向此前已经删除的journal旧§11/13/21–25。它们在本次整理前已失效；应回查Git历史/原证恢复索引，不补造证据或改写原机制结论。本轮不扩展重写这些原证文档。
