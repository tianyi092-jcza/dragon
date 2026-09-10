# 臥龍傳 Web · 会话日志

> 长期项目记忆见[项目AGENTS](../AGENTS.md)，安全与授权见[全局AGENTS](../../AGENTS.md)。本文件仅记录近期会话的进展、调试、失败尝试、文件及验证，不替代原始证据，不自动授权后续任务。
> 已合并重复批次、移除过时待办/中间快照路径。下列历史验证只证明对应代码批次，不保证未来工作树；提交状态现场查询Git。

## 1. 前序工作收束

- **取消统一过场**：只移除`ai.monthlyAI`中的D7END触发，保留月末退场军团清理；统一后继续战略图。没有整体删除`EndView`，因为信赖归零和玩家势力灭亡仍使用GAME OVER；没有顺带删END资产或强制回标题。
- **指令职责拆分**：全局AGENTS负责证据/安全/审批，项目AGENTS负责长期记忆，SKILL和`re-notes`负责模块证据。本地七份SKILL补齐元数据；`web-port/.pi/settings.json`引用`../../.agents/skills`，未调整信任/权限。两种cwd下的发现曾验证，配置变更须在新会话复核。
- 宣战返回边界、资源读取、编成分配等旧勘误已回流对应SKILL/kernel笔记，不在日志重复原字节和公式。旧“待验收/候选下一步”已移除；不把已解决的CBE5身份等问题重新列为当前阻塞。

## 2. 音乐恢复、接入与菜单纠正

### 进展与关键决策

1. 执行原COM并用独立解码核对音乐/音效寄存器流；确认OPL3 NEW及四算子音乐，不再使用“双OPL2”、固定五声/82.5ms/2倍速等错误原版归因。四季试听WAV及14曲MIDI/VGM保留。
2. 首次主循环截断不能直接充当循环资产。随后证明控制状态和第二完整周期的有序寄存器写入重复，仅对有形式证明的永静音声部做投影；生成11首intro/loop FLAC、事件与边界证书。仓库生成链重跑曲04与证书一致，11首FLAC→PCM无损往返通过。
3. `MusicPlayer`管理单曲缓存、播放意图与过期异步请求；`ScoreDirector`按场景/owner选曲，迟到对白或战斗回调不能覆盖标题/失败音乐。自动播放被拒、下载/解码/启动失败不能阻塞规则；过时字节不再解码，启动失败清除伪活动source。
4. 原整段ID3 WAV无法单独取消未来后继，产品改用record3/13两段PCM，保留原共享驱动AH7/AH8边界。原曲、驱动、菜单、季节day/hour与音量语义的详细纠错统一见[音频笔记](re-notes-audio.md)。
5. **菜单误解已撤销**：曾误做七行、独立音效/音乐控件和四种SFX音色。用户纠正后删除这些状态/分支，恢复六行与单一「音效」TYPE音量控件；TYPE不换曲，不新增手动曲库。原菜单名/分派及PC门控链已由原字节复核，不能再从旧日志复活两行设计。
6. 实际BGM格式已向用户确认：`web/grf/music/loops/*.flac`，浏览器解码PCM后由Web Audio播放；不是实时MIDI或实机录音。PCM音量近似、循环接缝、解码内存及原/Web日期/独立OVER差异继续明示，不宣称逐样本等价。

### 调试与失败尝试

- 早期ffmpeg/libgme实验得到静音PCM，作废；采用固定外部OPL3核离线合成，不复制第三方核进产品。
- 修正原CF9“所有非零都重启”、SFX优先级比较方向、换季hour1/hour2的误读；新原字节与驱动执行回归锁定纠正后的结论。
- 浏览器测试曾遇标题/开场绑定竞态、军师确认旧坐标失效和回标题仍期待`app.clock`存在。测试改为等待真实绑定、当前按钮、旧clock仍hold而App已脱离；未靠改规则迁就测试。
- 旧viewport时间断言随获批的Web帧预算修正；音频测试补OFF→TYPE2不能复活停止驱动、失败重试、后继取消和不积压。截图仅作布局检查，不当作原始机制/听感认证。

## 3. 战术半速与接战固定急促音画

### 战术半速（已完成）

- 用户要求战斗指挥入场及后续场景慢一倍。新增`TACTICAL_PLAYBACK_RATE=0.5`，低四档等待加倍、最高60Hz→30Hz；首个A065仍立即执行，每RAF最多一个完整帧，不积后台债务。
- A1C5入场与后续输入→A426→A065共用预算器；不改原IRQ等待常量、Session、命令或RNG。原始等待链与Web倍率分别记录在[战术规则§5](re-notes-tactical-rules.md)。
- 慢档52帧需约22.4秒，浏览器测试deadline由20秒改40秒，移除旧短间隔过滤；完整Session/VM/native/RNG/HP断言保留。最初接战范围尚不明确，未顺带改接敌规则。

### 固定急促接战（已完成）

- 用户随后明确允许动画/声音脱离战略速度，强调“比较急促”，无需原版时序一致。**640ms初案撤回、未采用**；最终100ms换帧、200ms发声，四相3→2→1→0，PCM原速不升调，重复触发可截尾音。
- 新`EngagementPresentation`只由主RAF推进；大图/小地图读同一相位。首次显示即请求声音，多接触加入不倍增音量/频率，轮询替换接触对象不重启节拍；暂停/隐藏冻结，长帧不补历史声音。
- 删除AI轮询直接发声，防止两套节拍叠加；原道路周期、倒数、保存相位和第12次自身槽战斗入口保留。**整体接敌等待仍受战略速度影响**，独立的只是音画；委任仍为单RAF gate，不等播放完成。
- 最后接触解除、委任/战术/标题/换局边界同时清理音画。补充失败重触发不能丢失旧声音清理所有权的回归；音频异常不进入规则路径。
- 未改既存`clock.js`战略档位，也未回退上一批战术半速、单一音效菜单或音乐资产。证据与Web差异统一见[音频维护源](re-notes-audio.md)，行军笔记/技能仅保留摘要链接。

## 4. 相关文件索引

| 范围 | 主要文件（相对仓库根） |
| --- | --- |
| 音乐播放/场景与SFX | `web/src/core/{music,score,speaker}.js`、`web/src/main.js`、`web/src/render/{battleview,endview}.js` |
| 恢复工具与资源 | `tools/audio_recovery/`、`tools/render_opl3_vgm.mjs`、`web/grf/music/{README.md,playback.json,loops/}`、`web/grf/sfx/` |
| 单一音效菜单 | `web/src/ui/gamebar.js`、`tools/verify_sound_profiles.mjs`（现为禁止音色切换回归）、`tools/verify_system_menu.js` |
| 战术预算 | `web/src/game/tacticalclock.js`、`tools/verify_tactical_speed*.mjs`、`tools/verify_battle_{viewport.js,browser_acceptance.mjs}` |
| 接战表现与门控 | `web/src/render/{engagementpresentation,minimapmarkers,mapview}.js`、`web/src/game/ai.js`、`web/src/main.js`、`web/src/ui/gamebar.js` |
| 音频验证 | `tools/verify_music_{driver.py,runtime.mjs,loops.mjs,browser.mjs}`、`tools/verify_engage_sfx_asset.mjs` |
| 接战验证 | `tools/verify_engagement_{presentation,browser,poll}.mjs`、`tools/verify_engage_transition.mjs`、`tools/verify_minimap_battle_markers.mjs`、`tools/verify_audio_minimap_browser.mjs`、`tools/verify_advisor_delegation_ui.mjs` |
| 长期文档 | `AGENTS.md`、`docs/re-notes-{audio,tactical-rules,march-pathfinding,kernel}.md`、仓库外`../.agents/skills/` |

## 5. 最近代码批次验证与残余边界

- 固定接战最终全量安全回归 **135/135通过（122 MJS、12 Python、1 viewport JS）**，185秒。名单相比此前审计集合仅新增两个接战表现测试，Python断言启用；未访问原SAVE/真实profile。
- 首轮两项旧浏览器测试因漏设`PLAYWRIGHT_MODULE`未启动，其余133项通过；指定已安装模块路径后完整重跑通过。未安装依赖或修改全局配置，未把首轮环境失败计作通过。
- fresh Chromium五档实测：换帧中位间隔100.0–100.3ms、声音200.0–216.3ms（含RAF量化）；真实Canvas/WebAudio起止、hold及返回标题通过。节拍fixture仅隔离AI回调以固定接触，保留真实Clock/RAF/音频；独立门控回归继续覆盖原字节、5/3次到期轮询、快照续态与战斗入口。
- 战术验收保留相同52规则帧的Session、RNG、VM和native端点一致性；音乐验收覆盖11首FLAC实际解码、单一菜单音量、场景切换和隔离IndexedDB保存/回标题读档。
- 该代码批次14个JS primary LSP及语法检查通过，最终lens无问题；6份Markdown语言服务未就绪，以25个相对链接、围栏/元数据、空白和20文件实际diff检查补充。曾发现journal末尾多一空行，已定点修正后重查通过。
- 最近完整原始日志：`C:/Users/fczll/AppData/Local/Temp/dragon-fixed-engagement-final-9fizr632/`，含`results.json`、逐项日志、`static-check.json`及差异补丁。临时目录可能被系统清理；长期机制证据在仓库笔记和资源证书，不依赖该路径。
- 没有由这些批次遗留的已授权开发待办；普通道路调度、战术scoped-PASS及音频合成局限仍按维护源限定，不能把局部通过扩写成全DOS等价。各批均未commit/push，后续以实际Git状态和新请求为准。

## 6. 本次项目记忆整理

- 按用户要求确认现有分工：`AGENTS.md`是长期project memory，本文是会话journal；`SESSION_HANDOFF.md`已有入口说明，不另建平行记忆文件。
- 重写两份文档：长期事实与命令集中到AGENTS；本文合并旧13节，保留近期关键进展、纠错/失败原因、相关文件和最后代码验证。移除旧测试计数堆叠、过时待办、重复规则推导和冗余临时快照路径。
- 本轮只改`AGENTS.md`及本文，未改代码、资产、原始证据或仓库外全局约定/SKILL；修改前已留本地副本。没有重新执行游戏测试，以上135项是上一代码批次结果，不是本轮文档验证。
- 本轮两份文档的18个相对链接、围栏、空白和`git diff --check`通过；已核对职责、当前产品决定及删减细节的维护源。Markdown LSP因marksman/typos未就绪不可用，不计通过，使用上述结构/引用与实际差异检查补充；不以旧游戏测试替代文档验证。

## 7. 完整提交与推送审查

- 用户授权审查全部改动/未跟踪文件并提交、推送。保留产品、迁移解析、验证、离线音频恢复工具及必要资产/证书/文档；`.gitignore`新增`/.pi/`，本地技能加载配置留在工作区、不提交。运行日志及审查报告保存在仓库外。
- 两路只读审查发现并修复：TALK38仅延后自身RNG、却未阻止治理/军团/天气继续运行；菜单全屏输入锁误用为物理地图命中，导致暴露地图移动不刷新独立1秒hold。
- `ai.js`现保留同一更新的续段，TALK38关闭后先请求RNG，再治理/军团/天气；不重跑城市轮询。排队即hold/禁快照，重复及标题/换局后的旧回调无效；入战沿用原有延后天气链。原字节及因果fixture见kernel笔记，新增`verify_city_request_continuation.mjs`。
- `GameBar.hitMapChrome`将固定UI几何与全屏输入锁分开，地图移动的hold与其它hold取并集；fresh browser新增菜单锁期间移动、关闭后仍等满1秒和另一hold保留验证。文档同时撤销残留60Hz现行描述及旧AI编成误标签。
- 本批全量安全回归**136/136通过**（123 MJS、12 Python、1 viewport JS），184.4秒；无原SAVE/真实profile访问。日志与清单位于`C:/Users/fczll/AppData/Local/Temp/dragon-publish-audit-31d4c5cg/`。提交/远端结果以Git为准，不把待执行推送写成已完成。
- 56个JS/Python文件primary LSP与语法检查通过，lens无问题；9份Markdown中4份LSP通过、5份服务不可用，另查实际差异、围栏和36个非代码相对链接。凭证扫描与JSON/音频格式、资源证书回归通过；修正kernel旧内存表达式被误渲染为链接的问题。
