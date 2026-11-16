# 检查点日志（checkpoint journal）

> 长期架构、命令与约定只维护在[AGENTS.md](../AGENTS.md)；本页记录当前交接、会话进展、调试、验证和下一步。原机制证据查对应re-notes，历史通过不替代新变更的验证。旧逐轮流水不再默认加载：§72以前见[归档](checkpoint-journal-archive-through-72.md)，第二阶段细节见[设计§11](map-workspace-sprite-library-design.md#11-本地实施进展s0原始盘点s2局部未整体验收)与[逐项审计](map-workspace-sprite-library-audit.md)。

## 当前主线与状态

| 工作线 | 当前交接 |
| --- | --- |
| copy收敛 | 元数据／章节／据点／武将／地图／审核已接copy；部分定义面板、旧draft整体退役及表清理仍待，按[收敛任务](copy-simplification-tasks.md)另行推进 |
| 基础地图 | B0–B7本地42项核对完成；独立模板、两种创建、共同工作台与发布加载见[完成核对](system-base-map-completion-audit.md)；没有因此部署 |
| 据点扩容 | §92–169推进C0/C1，城市／章初态片段转换及城市ID到运行索引片段编译已实施，补战略邻接与导航端口一致性门；C2已验证运输／寻路／选边／撤退选址的分级对照，D5已接运行选边无路停止；用户批准D1/D3/D5/D6部分后，C3已接批次续段、两处别名、主动迁都无候选、军事候选类型化、所属索引服务、战略邻居索引边界、到达首读／移动所属／到达指针桥／移动节点域／撤退驻留与返回索引解槽；C4攻城入口城市门已改动态长度，C2/C3寻路索引读契约已接，C1 fresh缓存合成与初态已改live长度，C3/C5编成／增援／迁都城市门已动态化，C4俘虏城市门与首都扫描已动态化；用户2026-11-17授权解除阻塞后准入放行1..256并验证M193。详见[计划§9](city-capacity-expansion-plan.md#9-c0实施账本字段失败边界与差异提案)。完整源及v3装配未接；C4攻城资源身份／战术入口子项已接，C5–C9未开始，产品准入现为1..256（257+需v3重编号）；事件／天气／费用与财政扩域待目标需要时推进。 |
| 据点组新增 | §88完成四套配方／原证，§89接入据点后第八TAB及四张原尺寸只读预览，双DPR通过，随`c3efb05`提交。放置／拆散仍未开放；用户后继选择真实据点扩容，原新增实体／绑定已有据点的方向询问不再阻塞计划，实际创建接入扩容C6–C7 |
| 地图素材库 | v41及ATOMIC历史交付见§76／80／81；当前§87顶部锁图已明确为拖动锁定切换；§85收回顶部高度／固定紧凑右栏／底对齐／无框浮栏与100%原始比例，保留§84两行TAB／ID／局部懒加载与右键调序删除；保留§82固定春季与中立据点库：240单格／256身份／32px，单格79可放／161只读；§89另加四张只读据点组，合计八类4＋4两行。桥梁水路仍并道路，无组合库导航和悬停，不自动拆现有地图组合；四季共用布局、游戏动态所属配色不变 |
| 海域／地面模型 | SEA-GROUND-1本地实现与验证见§79：全幅95底图、地面小地图轮廓，保存／发布后由同一玩家引擎加载；四层合成／工具保留，原四层库导航由§80替代 |
| Git／生产 | 第二阶段完整提交`664819d22898e7ff9dacf2df7b1d8e11765a7bd8`已推送`github/main`；其后§78文档整理及§79–82代码／测试／文档／壳产物随§83所在本地提交收录。§83本地提交为`a7237ca`；§84–85修改随§86本地提交`fdb9d67`收录；§87–89修改随§90本地提交`c3efb05`收录；§91扩容计划文档尚未提交。没有新增push、部署或真实数据迁移 |

### 未完成、阻塞与下一步

1. 用户已授权按计划从C0推进本地实施，当前首批盘点见§92，入口见[CITY-CAPACITY-1](city-capacity-expansion-plan.md#handoff)。用户已选择保持384×256、支持新增真实据点，不再重复询问§88的新增／绑定方向；计划C0补全字段矩阵和具体Web差异合同，不能只删192固定门。已完成的据点组只读展示（§88–89）保留，真实放置／拆散在C6–C7接线；[据点组合同§3](map-city-group-contract.md#3-必须明确的放置接缝)是此前限制与询问背景，不代表当前仍需选择方向。顶部锁图的旧待确认项已由§87用户决定及本地实现解除：只锁拖动平移，不锁选取／缩放／编辑。对象锁定和八项组合／变换仍按原约定暂禁用。其余地图布局／菜单已本地实施验证。当前无第二阶段本地目标的剩余实施阻塞；不重开已完成的分类任务。新规则、旧地图／头像持久数据迁移、生产安装与验收须按后续任务和独立授权处理。
2. 宿主LSP仍有未确认；独立Vue检查保留`ChaptersPanel.vue`既有TS6133提示。隔离HTTPS历史出现atlas `net::ERR_ABORTED`，后续完整通过但根因未闭合，不能称已修复。
3. 历史回归适用性仍待复核，**不是本轮已确认回归**：`verify_vps_publish_pack`曾43过1失败（stale draft visual capture）、`verify_vps_trial`超时、旧玩家pack夹具缺检验票；backend_admin_copy缺MINIFLARE_MODULE，backend_copy_entry／template_root／generals_conflict_model存在旧合同期待。不得为跑绿恢复Trial或放宽身份门。
4. `verify_publish_controller_slot`曾用例结束但轮询计时器未退出；force-exit不能证明清理成功。公共网络reader及完整玩家App战役不在本次同加载器端口验证范围内。
5. §79–82按用户新请求实施本地地图改动，保留§78未提交文档整理；§83用户另行授权本地提交；仍无新增推送、部署、真实数据迁移或清理本地报告的授权。未重跑无关战斗／存档、schema／purge及完整资源审计（未改这些规则、表或资源）；§82只读复核据点着色来源19项，不新增运行规则；新规则仍按独立任务处理。

## 169. CITY-CAPACITY-1/C5：M192后开放（v3包可玩准入，用户批准执行）

- VPUBLISH后端链补查：`verify_copy_publish_parity`装配期即报`available library consumer fingerprint mismatch`，stash基线同败——registry记录hash与检出consumer文件偏斜（检出换行嫌疑），非CITY回归；改换行策略或重录指纹超出本轮授权，不动，C8-1 VPUBLISH行已注记。单元级v3链（triplets／pack-load／environment）保持全绿。

- 合成257城v3正式包（schema 2／studio-app-3／native-road-v3 role）→`loadPlayerPack`→`createPlayerEnvironment`→`loadRoadGraph`(v3,257节点)→prepare fresh（257城、roadVersion 3）→`assertPlayableScenario`放行、末城归属1、缓存0。新`verify_player_v3_pack_playable`一次通过；`loadTerrain`按真实网格维度门配96KB地形／代价＋空偏移表夹具。canPlace翻转未动（无cityId签发路径）。见[计划C5-6](city-capacity-expansion-plan.md#c5统一编译运行保存与旧图里程碑)。
- 测试-only，无产品代码变更，不重建bundle。`node --check`与`git diff --check`干净。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 168. CITY-CAPACITY-1/C6(c)：发布器v3-role全链同切（用户批准实施）

- 发布器按`compiled.roadGraph.version`发射三元组（v2逐字节不变；v3为schema 2／studio-app-3／native-road-v3；未知版本422拒收）；玩家`playerpack`＋`playerenvironment`双准入并拒混搭；`trials.js`未动（v2-only）。见[计划C6(c)](city-capacity-expansion-plan.md#c6c-发布器v3-role字段冻结已接用户2026-11-18批准实施)。
- verify_player_pack（v3加载＋3组混搭拒收）／environment（v3进环境＋2组混搭拒收）／publish_triplets（新：v2不变／v3三元组／无版本·v1·v4拒收）通过；发布器夹具补`roadGraph.version:2`；environment夹具补`schemaVersion:1`；`verify_player_pack_compiled`与`verify_publish_atomicity`为基线既有环境失败（stash同败）。bundle254文件，SHA `fd3e0694…8de550887`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 167. CITY-CAPACITY-1/C8：证据登记更新（VGROUP闭环）

- C8-1登记：VGROUP→✓（C7-J四配方浏览器：放置／拆散／删门／撤销／保存重读／两视口一致）；VISOLATION证据补C7-J模板浏览器；闭环表头加C7-A–C7-J。VPUBLISH仍✗（待C6c字段冻结确认；后继§168用户批准后已接C6c，VPUBLISH改△部分）。VEVENT为NA（D2未批准）。
- 纯文档变更，无代码／测试／产物改动，不跑回归。未提交、推送、部署或迁移真实数据，目标未完成。

## 166. CITY-CAPACITY-1/C7：四模板浏览器覆盖

- 新`tools/verify_city_group_browser.mjs`真实Chromium一次通过：四配方页内置放／拆散／删门（测试签发cityId，目录`canPlace`仍false故无UI点击流）＋JSON保存重读逐字节一致＋重读态可继续disband；两视口（1280×800／800×600）结果digest一致，零页错误／零外发请求。见[计划§9.10.36](city-capacity-expansion-plan.md#91036-c7-j四模板浏览器覆盖已接真机四配方放置拆散删门保存重读)。
- `node --check`通过；`git diff --check`干净。无产品代码变更，不重建bundle。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 165. CITY-CAPACITY-1/C7：撤销语义锁定（单命令单元＋取消零写）

- 据点组三操作经`basemap.js`共用stage管线：单次stage即一undo单元，undo从snapshot重算preview，save唯一写口，dispose／setIdentity只清本地态。见[计划§9.10.35](city-capacity-expansion-plan.md#91035-c7-i撤销语义锁定已接单命令单元取消零写)。
- 新`citygroupundo.test` 2/2（真实preview＋mock传输：place→disband两步各一单元、两次undo回pristine且零服务端写、stage后dispose零写）；`basemap.test`＋`mapcanvas.test` 30/30全过；单文件`node --check`通过，`git diff --check`干净。无产品代码变更，不重建bundle。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 164. CITY-CAPACITY-1/C7：删门（先解绑＋换原子墙）

- `componenttools.js:removeCityGate`删一门格：端口须存在（身份三项一致）＋引用该据点的道路须先解绑（模型无端口级引用，按city判，有路拒删且路不动）＋换墙原子tile门＋门格未被占；全有或全无（注销端口＋落墙装饰不入组，组链其它成员不动）。`occupiedCells`移入`componenttools.js`共享（放置侧保留`BAD_SOURCE`门）＋`mapcommands.js`新增`city-gate-remove`命令（调和器无需改动）。见[计划§9.10.34](city-capacity-expansion-plan.md#91034-c7-h删门已接先解绑道路换原子墙)。
- 新`verify_map_city_gate_remove`4/4（落墙／未知门／坏墙／路引用／占格拒收全fail-closed且源只读、命令接线）；放置族／拆散／copy_map_ops／component_tools 16/16、mapcanvas.test20/20、copy_map_ops＋component_tools 9/9通过；四文件`node --check`通过，`git diff --check`干净。bundle255文件，SHA `4e64515dad0f0ff72f007ea49f56c511cbf502ca2d8e524f1777dd14c6d7c6a1`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 163. CITY-CAPACITY-1/C7：拆散解组

- `componenttools.js:disbandCityGroup(source,cityId)`只摘`city-group-<cityId>`组链（装饰独立保留、端口元数据保留、记录不动；未知组fail-closed）＋`mapcommands.js`新增`city-group-disband`命令；`reconcileMapSelectionGroups`补删组过滤（否则调和按源集合重建被摘组——新单测抓包，已修正）。见[计划C7](city-capacity-expansion-plan.md#c7服务端与发布)。
- 新`verify_map_city_group_disband`3/3（只摘组／未知组与坏身份fail-closed／多组保留／命令接线）；place／copy_map_ops／component_tools 12/12、mapcanvas.test 20/20通过；三文件`node --check`通过。bundle255文件，SHA `b501992439fc3de666073a9b859ee0b6d0524627df5e3311f48735d43aa680ce`（仅门改），shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 162. CITY-CAPACITY-1/C7：画布放置解禁

- `mapcanvas.js decoration-place`：据点组materialId有caller签发`cityId`时走预检（锚点取选中格）＋物化（`newId`复用画布工厂）＋`stage({op:'city-group-place',materialized})`；无`cityId`沿用预览拒绝（既有用例逐字不变）。画布不签发cityId，UI目录`canPlace`仍false。见[计划§9.10.33](city-capacity-expansion-plan.md#91033-c7-f画布放置解禁已接ui目录仍预览态)。
- mapcanvas.test 20/20（含新增：无cityId拒收、错cityType拒收、有cityId落stage且源只读）；`node --check`（画布＋测试）通过。bundle未变（web/src未动）。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 161. CITY-CAPACITY-1/C7：放置落源与调和组保留

- `placeCityGroup(source,materialized)`落源（装饰实例＋`cityGatePorts`＋`selectionGroups`条目，全有或全无，原子tile形状门，不写copy模型）；`mapcommands.js`新增`city-group-place`命令；`reconcileMapSelectionGroups`补暂存组保留（判新以源集合为准——初版按调和后集合判新，把`decoration-remove`清空的组复活，被既有单测抓包，已修正）。mapcanvas解禁不动。见[计划C7](city-capacity-expansion-plan.md#c7地图与据点ui)。
- 新`verify_map_city_group_place`3/3（落源／调和组保留／全有或全无三门）及component_tools／placement／materialization／copy_map_ops共18/18、decoration三history共3/3通过；四JS/MJS语法通过（`node --check`）。bundle255文件，SHA `47337aa989aa495194972399373303a43b0b8a6709a1aa72e99374281e0eadc6`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 160. CITY-CAPACITY-1/C7：放置物化变换首片（纯函数＋单测）

- 新增`materializeCityGroupPlacement(plan,{cityId,newId})`（同文件）：门格只出`cityId:gateIndex`端口元数据（不生路），非门格按行序出原子`tile-<byte>`装饰描述，组链装饰实例id；copy模型行与章节覆盖不在此写。见[计划C7](city-capacity-expansion-plan.md#c7地图与据点ui)。
- 新`verify_city_group_materialization`2/2（门／饰／端口／组一致、冻结、fail-closed）及既有placement用例共6/6通过；双文件`node --check`通过。bundle255文件重建，SHA `15df9ea094c048a5dd8872a5daf79a03d0e576bcd9a40fdfca5179c5012f7ec5`，shell/play不变。`git diff --check`干净。未提交、推送、部署或迁移真实数据，目标未完成。

## 159. CITY-CAPACITY-1/C7：放置预检首片（纯函数＋单测）

- 新增`planCityGroupPlacement`（`web/src/editor/citygroupplacement.js`）：配方形状／锚点／`cityTypes`门，整单越界拒绝（`OUT_OF_BOUNDS`），装饰足迹＋道路构件＋placement占格冲突拒绝（`CELL_OCCUPIED`），返回冻结计划（itemId／cityType／中心／格／门）；只读不写，中心地形规则留`mapcompile`。新`verify_city_group_placement` 4/4（有效计划冻结＋源零写、双越界、三占格源、配方／锚点／类型／未知定义fail-closed）。
- bundle255文件（新模块入束），SHA `0f2cf27dea8dd4586c52c4b04d2f42ea95ebe4e58dff3c22973ed9df5caa8af0`，shell/play不变。双文件`node --check`通过，`git diff --check`干净。未提交、推送、部署或迁移真实数据，目标未完成。

## 158. CITY-CAPACITY-1/C7：引用清单查询首片（方法＋单测，无路由）

- `DraftTopology.references(tokenHash,game,cityId)`只读：触达道路、待定移动意图、覆盖这些路的重建记录；坏身份fail-closed（`TOPOLOGY_CITY_ID`422／builtin403），未知城返回空而不报错，永不写表。新`verify_topology_references`3/3（空表／记录后／只读性＋失败门）；vps intent既有套件通过。HTTP路由随删门工作接线（本轮未扩API面）。
- 三文件`node --check`通过；无bundle变更（服务端／测试-only）。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 157. CITY-CAPACITY-1/C8：VPERF codec基线

- 新增`tools/bench_m257_perf.mjs`（257节点v3链图，i5-7500实测）：checked编码10.3ms、快照2.1ms、端到端索引搜索2.1ms（256次owner读）、堆~8MiB；场景级assembly／月度耗时未录。C8-1登记VPERF改△。无产品代码变更，不重建bundle。
- `node --check`（bench脚本）通过，`git diff --check`干净。未提交、推送、部署或迁移真实数据，目标未完成。

## 156. CITY-CAPACITY-1/C6(c)：发布器v3-role字段冻结方案（纯文档，待确认）

- 冻结三元组：v3正式包`schemaVersion: 2`／`buildFormat: 'studio-app-3'`／roadGraph role `'native-road-v3'`；其余role／MIME／URL／world／manifest结构／compilerRevision不动。发布器按图版本发射，玩家双准入并拒混搭；`trials.js`保持v2-only。见[计划C6(c)](city-capacity-expansion-plan.md#c6服务端与发布)。实施需用户确认后动手。
- 纯文档变更，无代码／测试／产物改动，不跑回归。未提交、推送、部署或迁移真实数据，目标未完成。

## 155. CITY-CAPACITY-1/C7：受限创建／拆散／删门引用清单设计（纯文档）

- 据点组合同新增 §4（C7-A）：放置三路物化（主表新行稳定cityId、门只建端口元数据不自动生路、余格进装饰表成组）、拆散只摘组链、删门须先解绑道路引用（有路引用拒删）、引用清单（copy模型／地图源／编译nodeScan与章初态与battleMapId／栈与DTO）、非目标（旋转翻转对象锁、自动生路／分章、超占地形）。实施前置（C5-1／C6-1／M257(d)）已就绪；`mapcanvas.js:249`放置拒绝届时按配方解除。见[据点组合同§4](map-city-group-contract.md#4-c7-a-受限创建拆散删门引用清单设计未实施)。
- 纯文档变更，无代码／测试／产物改动，不跑回归。未提交、推送、部署或迁移真实数据，目标未完成。

## 154. CITY-CAPACITY-1/C9：同一模型与AGENTS回流

- 同一生产模型核查：`web/src/game`无gameId分流；残余`!==192`门均为DOS raw／legacy转换格式门（warconsumer type1别名、FFFF别名、`convertLegacy*`、`editChapterCityNative`），新城在其处fail-closed，无数量回退。未删除任何战术／人物模块。`AGENTS.md`“当前代码仍固定192”已更新为双布局现况（内置与生产准入仍192）。
- 纯文档变更（AGENTS＋本journal），无代码／测试／产物改动，不跑回归，不重建bundle。未提交、推送、部署或迁移真实数据，目标未完成。

## 153. CITY-CAPACITY-1/C8：残余192门收敛＋§7验收登记

- 修完：`ai.js`道路节点桥（`rawRoadNodeId`加`nodeCount`参数三调用点传live，`markLegionAtRoadNode`改live上限）与灭亡横扫（`readCityCount`能力缺省192＋io门／`cityAt`门放live）；extinction4FCE新增200城横扫用例。有意保留：cityphase相位（D1批准）、battleprojection目录门（C4 fail-closed决定）、legacy raw转换门（DOS格式本无257定义）、catalog最小值门。见[计划§9 C8-1/C8-2](city-capacity-expansion-plan.md#9-c0实施账本字段失败边界与差异提案)。
- extinction35/35、war三套件56项、movement＋save38项通过；bundle254文件，SHA `17caa963ab7f466724b2f1084d78723a36d5fb0dc008c852cf74b7a772a115a7`，shell/play不变。主动LSP未跑，不称clean。§7登记14项：V192／V193／V257闭环，VGROUP／VPUBLISH／VPERF未做，余项部分。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 152. CITY-CAPACITY-1/C7：设计分解（纯文档）

- C7无放宽式改动：copy城市模型已按`cityId`键控无192门，地图命令走共用核心；UI硬命中仅两处展示文案，其余为素材ID／像素高度误命中；服务端仅模板profile名字符串。剩余为新功能轨（受限创建／移动移除／删除命令原子边界、拆组删门引用清单、章节配置同数据、撤销语义、四模板浏览器覆盖），须先出设计，C6(c)字段冻结确认后可并行起草。见[计划C7](city-capacity-expansion-plan.md#c7地图与据点ui)。
- 纯文档变更，不跑回归。未提交、推送、部署或迁移真实数据，目标未完成。

## 151. CITY-CAPACITY-1/C6：游戏级数据copy面live长度

- `gamecopy.js`城市主表／引用校验／人物槽位／组过滤改live长度（`191→cities.length-1`等），唯一键`city-${index}`补旧数据fallback；`copyprofile.js`源检`192→game.cities.length`（默认192）。copy档案28/28全过（含257城档案）。bundle254文件重建（shell/play不变）。见[计划C6](city-capacity-expansion-plan.md#c6服务端与发布)。C6(c)发布器v3-role同切待用户确认schema2／studio-app-3字段方案。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 150. CITY-CAPACITY-1/C5：257城完整store往返（测试-only）

- 合成257城v3 fresh装配→`snapshotState`→`saveJSON`→内存店put/get（文本逐字节一致、记录deepEqual）→`admitSavedScenario`→prepare restore→257城／末城归属1／缓存0。新用例一次通过，admission 6/6；`prepareFresh`新增返回`template`供admit的data。见[计划C5-5](city-capacity-expansion-plan.md#c5统一编译运行保存与旧图里程碑)。无产品代码变更，不重建bundle。
- `node --check`通过。未提交、推送、部署或迁移真实数据，目标未完成。

## 149. CITY-CAPACITY-1/C5：剩余三项设计分解（纯文档）

- 玩家包准入三处v2钉死（`playerpack.js:10/:69`、`playerenvironment.js:16`），须schema2／studio-app-3／v3-role全链同切且字段先冻结，C6发布器未产出前不动代码；存档无需新格式（`savegame.js`无版本门，快照v1与metadata均已版本无关），剩余为257城完整store往返测试；章初态`cityIndex`／`chapterDigests`尚无消费者，待C6作者模型；逐章核对与M192后开放为准入决定门（阻塞，需用户拍板）。见[计划C5-4](city-capacity-expansion-plan.md#c5统一编译运行保存与旧图里程碑)。
- 纯文档变更，无代码／测试／产物改动，不跑回归。未提交、推送、部署或迁移真实数据，目标未完成。

## 148. CITY-CAPACITY-1/C5：M192真实图统一链里程碑

- 真实内置192城（同修订game-source.json＋roads.json，节点坐标192/192命中真实城市）走统一链：编译索引逐槽一致、fresh装配末城归属／缓存、真实图索引搜索found（旧地址读永不触发）、JSON快照／恢复往返保留。新`verify_m192_unified_chain`3/3。见[计划C5](city-capacity-expansion-plan.md#c5统一编译运行保存与旧图里程碑)。行为覆盖仍由既有分套件承担，此处锁定真实地图一致性入口。测试-only新增，无产品代码变更，不重建bundle。
- `node --check`与`git diff --check`干净。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 147. CITY-CAPACITY-1/C5-2：编译输出索引摘要

- `compileGameSource`输出新增`cityIndex`（dense槽／cityId／坐标）与`chapterDigests`（逐章state规范摘要，JSON稳定，供C6按章失效）；`battleMapId`绑定表不发射（`game.cities`无该字段是schema事实，C6作者模型工作）；章初态切片仍未接线（`state`为raw记录形，无新形数据）。见[计划C5](city-capacity-expansion-plan.md#c5统一编译运行保存与旧图里程碑)。
- 新`verify_compiled_source_index`3/3（含内置192城端到端：槽位／坐标／摘要一致）；两JS/MJS`node --check`通过。bundle254文件，SHA `50f30827491eefe85eb88c53c9d7b3724cb26210550e422836353db84519ec5b`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 146. CITY-CAPACITY-1/C5-1：编译路径动态槽位

- `validateGameSource`城数1..512、槽位dense 0..N-1；`chapterActiveGaps`两锁、`applySharedCityData`同契；`trialcompile`以nodeScan为计数／位置权威（替代FIXED_CITY_BINDINGS，槽序＝扫描序）；`encodeRoadGraphV2`显式拒257+；章raw／拓扑门保留。呈現層`chaptergapreport`同步新訊息。见[计划C5](city-capacity-expansion-plan.md#c5统一编译运行保存与旧图里程碑)。v3编码、章初态接线、战场绑定留待后继。
- chapter系37/37、gap_reports11/11（空章断言改/512/）、references修dense-slot断言；reorder为基线既有环境失败（stash同败，缺draft.txt）。四JS/MJS`node --check`通过。bundle254文件，SHA `91f4a94303643a7589437c03fb076b9912c25cfa8d2ba0c26116f72bba793903`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 145. CITY-CAPACITY-1/M257(h)：257城真实浏览器场景

- 新增`tools/verify_road_v3_browser.mjs`真实Chromium一次通过：`roads.json`拦截服务257城v3图（初版误拦`/road_graph.json`，默认世界资产实为`content/.../roads.json`，已修正），页内合成catalog／world／257城raw（faction源为浏览器内联移植，`TOTAL`越界与`const total`重声明已修复），fresh装配（roadVersion 3、257城、末城归属1、缓存0、`found(fffc,810,5)`、旧地址读永不触发）＋JSON快照／恢复往返一致，零页错误。见[计划§9.10.32](city-capacity-expansion-plan.md#91032-m257h-浏览器回归完成坏图断言仍为基线既有失败)。
- 无产品代码变更，不重建bundle（SHA维持`df484a5c…f9a99a4`）；`node --check`通过。坏图尾部断言仍为基线既有失败。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 144. CITY-CAPACITY-1/M257(h)：浏览器harness复核（已被§145接续）

- 本环境此前判无浏览器，复查发现`%LOCALAPPDATA%/ms-playwright`已有chromium/headless_shell多版本。`verify_road_cold_load_browser.mjs`真实Chromium可跑：主冷加载流程（fresh装配＋快照＋道路搜索共享路径）全部断言通过；尾部坏图拒绝断言失败，stash基线同败，为既有失败非CITY回归（该断言状态未变，见§145）。257城专用场景见§145。无代码／产物变更，不重建bundle。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 143. CITY-CAPACITY-1/M257(g)：257城移动与月度深路径

- movement夹具加`nodeCount`与v3边基址（`version!==1`统一原生初始化）；`native_faction_fixture`192硬门改live长度＋逐槽保留（根因：覆盖records致257城缓存合成拒收）。M257移动用例（首点`[2,10,0x810,0x2000,4]`、v3工作区锁定）与fiscal257城用例（recount72、RNG257次）通过。见[计划§9.10.31](city-capacity-expansion-plan.md#91031-m257g-深路径单测257城移动与月度已接)。
- movement36/36、fiscal11/11及三批回归（133＋106＋41）共327项全过。本轮仅测试与夹具变更，bundle与(f)一致（`df484a5c…f9a99a4`），shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 142. CITY-CAPACITY-1/M257(f)：装配v3准入

- 准入门v2→v2|v3：memory新增`maxNodesForVersion`／`edgeBaseForVersion`（单源；未知版本 fail-closed）；roadgraph装配／原图／边地址三函数版本化（v1保持旧256界可装载）；assembly元数据／可玩／P76／容量／初始化／context／snapshot放行v3；savegame四门放行v3。v1拒收断言改`/must be v2 or v3/`（movement＋callers；后者套件仍环境失败不可跑）。见[计划§9.10.30](city-capacity-expansion-plan.md#91030-m257f-装配v3准入已接)。
- road_graph等96/96、admission5/5（M257双用例＋513拒收）、movement等106/106通过；五JS语法通过。bundle254文件，SHA `df484a5ce77871f8f643c243fccf0a8d1298dbcfdcc5fc92e8a61cec4f9a99a4`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 141. CITY-CAPACITY-1/M257(e)：月度三循环与budgets门改live长度

- 方案A实施：原生三循环经可选`readCityCount`（缺省192，旧mock逐字节一致）；场景IO提供并放宽城市门；财政recount改`&0xffff`；外交邻居门改`>=cityCount`（C1C byte存储上限另行处理）；FFFF别名raw门保留。见[计划§9.10.29](city-capacity-expansion-plan.md#91029-m257e-月度三循环与budgets门改live长度已接)。
- fiscal10/10（含新增200城：recount＋8、收入增、RNG 200次）、budgets9/9（含新增195槽同值4250）、diplomacy16/16（含对照：192域抛2C79、257域零扰动30次RNG）；domestic_budget_event为基线既有环境失败。bundle254文件，SHA `c85ae1731a1a6846763d97e04214e3b0fa143118eb385a790933df45fc0b0164`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 140. CITY-CAPACITY-1/M257(d)：F23存取扩域

- F23存取byte扩word（可达域与DOS一致，阈值／min表达式不动）：nativefactions断言、`originalfactiontick`3E25、`originalmonthlydiplomacy`30B0、fiscal／diplomacy IO读数门；capture±1改word域回绕`&65535`（byte回绕会在256城清零计数）；warconsumer无需动，decode raw仍byte。见[计划§9.10.28](city-capacity-expansion-plan.md#91028-m257d-f23存取扩域已接表达式不动)。
- capture18/18（256次强制改属场景先抓包后修正）、fiscal／diplomacy／budgets等57/57、war／faction_tick／extinction4FCE／save_snapshot／runtime 64/64、extinction_fate通过；extinction4FCE不可达态与road_callers循环断言改word域（后者套件本身装配期环境失败不可跑）；extinction_message_fifo与game_save_store为基线既有环境失败（stash同败）。bundle254文件，SHA `1526542098ff9ede3e1c1f3d00064e910b7826d4233be5f07f519b496d54e855`，shell/play不变。主动LSP未跑，不称clean。月度循环与budgets门留待(e)。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 139. CITY-CAPACITY-1/M257(c)：边类标记版本跟随

- 五处`>=0x800／<0x800`边判改为版本相关`edgeBase`（缺省`0x800`）：movement选边经`io`透传、`performOriginalRoadAction`两处与arrival handler5经同一`io`字段、retreat经新`edgeBase`参数装配。`cx>=0x8000`费用高位与`0x20`槽位桥不动。见[计划§9.10.27](city-capacity-expansion-plan.md#91027-m257c-边类标记版本跟随已接)。
- search13/13（含新增边parked链：v3 `0x800`走城市路found，旧界走边分支耗尽）、memory／checkpoint／v2lifecycle／road_graph／state／admission／siege／city／结构化三套件107/107、movement＋arrival 67/67通过；五JS/MJS语法通过（`node --check`）。bundle254文件，SHA `48bffa9ac4949334e3de93b17ac2591c633d2ef69ddfbe78723ee0848fb8340b`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 138. CITY-CAPACITY-1/M257(b)：search区域参数与接线

- `searchOriginalRoadMemory`新增可选`regions{scratchEnd,queueBase}`（缺省v2逐字节一致；环模替代`&0xFBFF`；非法区域拒收）；`searchRegionsFor(layout)`供装配；movement经`io`透传，retreat经新`regions`参数装配（修复无`context`作用域误引用）。见[计划§9.10.26](city-capacity-expansion-plan.md#91026-m257b-search区域参数与接线已接)。edge判跟随留待(c)。
- search12/12（含新增v3区域链）及memory／checkpoint／v2lifecycle／road_graph／state／admission 38/38、movement＋arrival 67/67、siege／city／state／结构化search／retreat／selection 79/79通过；四JS语法通过（`node --check`）。bundle254文件，SHA `26ac8ca1390c50aac0e9b2752dde49ee15247105fa2d9f2de2f72d4e59a3fffa`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 137. CITY-CAPACITY-1/M257(a)：memory v3编码与checked

- `originalroadmemory.js`版本参数化：v2逐字节不变；v3保持`node=slot*8`，`edgeBase=align16(N*8)`（257城`0x810`），上限512；编码／checked／checkpoint往返均经`edgeBase`；新增冻结`roadLayout`供搜索步骤(b)。见[计划§9.10.25](city-capacity-expansion-plan.md#91025-m257a-memory-v3编码与checked已接)。搜索工作区与边判跟随留待(b)(c)。
- memory7/7（含新增257城项）及checkpoint／v2lifecycle／road_graph／search／state共39/39通过；两JS/MJS语法通过（`node --check`＋单测）。bundle254文件，SHA `71baddf8830c4b0a1d3364d76b10f1fb59f775e0adc1fb72b4e54af6af11b5ec`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 136. CITY-CAPACITY-1/M257：v3重编号与财政域扩宽设计（纯文档）

- M257需两处并行改造：v3区域重编号（第257节点基址`0x800`撞边基址；连带搜索访问标记`+0x8000`落入队列区、队列环掩码`0xFBFF`、三处`>=0x800`边判）与F23存取扩域（`nativefactions:46/101/164`、3E14读者、3091／2F17／2F99、财政两循环、外交候选循环、budgets门）。推荐V3-A：`node=slot*8`与全部槽位算术不动，仅参数化区域（`EDGE_BASE_V3=align16(N*8)`、队列搬`0x9000`、清区`[0x8000,0x8000+N*8)`、边判跟随edgeBase）；N≤256无溢出已证，只需存取扩域、阈值表达式不动。见[计划§9.10.24](city-capacity-expansion-plan.md#91024-m257设计分解v3重编号与财政域扩宽设计未实施)。实施顺序(a)–(h)已列，未动手。
- 纯文档变更，无代码／测试／产物改动，不跑回归。未提交、推送、部署或迁移真实数据，目标未完成。

## 135. CITY-CAPACITY-1/C0：准入放行1..256与M193验证

- 用户明确授权阻塞项按目标需要继续（此前保留门解除）。roadmemory／roadgraph／assembly三处192门改live长度1..256（node*8<0x800；257+需v3重编号），加`roadNodeCount()`；cityCache加`cityCount`（默认192），装配传live长度；citySlots保留为原版常量。见[计划§9.10.23](city-capacity-expansion-plan.md#91023-c0准入放行1256与m193验证用户授权2026-11-17解除上述保留)。
- 新`verify_city_capacity_admission`3/3（193城fresh装配＋末城归属／缓存／索引寻路；JSON快照／恢复往返保留193城；257／空表／城图不等拒收）；内存5/5、v2 7/7、checkpoint10/10、search11/11、state10/10、arrival32/32、city36/36、siege12/12、occupancy12/12通过。四JS＋一MJS语法通过；bundle254文件，SHA `8029ba83f1aad270f735ed76561167610eabacd4a73ec97607b13c27023ec9aa`，shell/play不变。`verify_scenario_assembly`为既有环境失败（stash基线6/6同败）。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 134. CITY-CAPACITY-1/C4：俘虏城市门与首都扫描动态化＋保留门确认

- capture的`cityAt`与`capital6A3D`扫描改live长度（缺表沿用192界，诊断不变）。同时确认两处有意保留：`STRATEGIC_LAYOUT.citySlots`装配准入门（产品准入仍192，解除等于放行生产，未授权）与月度／财政城市循环＋F23算术域（未批准，不动）。见[计划§9.10.22](city-capacity-expansion-plan.md#91022-c4俘虏城市门与首都扫描动态化)。
- capture18/18、siege12/12、city36/36通过；两JS语法通过（capture＋check）。bundle254文件，SHA `ec90b7901fcf0707c90dcfc4a6ab0a8bdcc9617f616efc730e76ac842f379715`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 133. CITY-CAPACITY-1/C3/C5：编成／增援／迁都城市门动态化

- 6F89首都门、412B首都门去192短路（`idx`身份校验保留）；6A3D扫描改`io.cityCount ?? 192`（生产io提供live长度）。诊断标签与fail-closed不变，192城行为一致。见[计划§9.10.21](city-capacity-expansion-plan.md#91021-c3c5编成增援迁都城市门动态化)。
- capital_relocation18/18（含新增199槽选中＋无count旧界null）、formation28/28、battle_original_formation、city36/36通过；五JS/MJS语法通过。bundle254文件，SHA `f378f38d9a518e4298e50a09a7bfb8d4904b56bf5cb6f1a8c675153b520f5225`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 132. CITY-CAPACITY-1/C1：fresh缓存合成与初态live长度

- `synthesizeScenarioCityCache`与`initializeScenarioCityNativeInputs`改按live城市表长度（城／记录等长＋逐槽身份）；192城逐字节不变。`createScenarioCityCache`的192门（存档面）不动，超192 span在其处fail-closed。见[计划§9.10.20](city-capacity-expansion-plan.md#91020-c1-fresh缓存合成与初态改live长度create工厂门待定)。
- occupancy_init12/12（含新增200城合成＋工厂拒、错长拒）、arrival32/32、city36/36、road_state10/10通过；两JS/MJS语法通过。bundle254文件，SHA `909678bfcfc1d83acb26b1e6310ff537adf960e6ca810048de87be2411e52b1d`，shell/play不变。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 131. CITY-CAPACITY-1/C2/C3：寻路索引读契约注入

- `searchOriginalRoadMemory`新增可选`readCityOwnerAtNode`＋`cityNodeBound`（缺省旧契约）；movement选边与retreat 487B在有`readCityOwner`能力时注入（`readRoadNodeOwner`＋共享`cityNodeBoundOf`），无能力mock走旧路。retreat三处读统一经同一契约。见[计划§9.10.19](city-capacity-expansion-plan.md#91019-c2c3寻路索引读契约可选注入已接)与[所属索引](re-notes-march-pathfinding.md#city-capacity-indexed-city-owner)。
- search11/11（含新增198..200槽链与487B全链路）、movement35/35、arrival32/32、siege12/12、结构化search/retreat/selection对照通过；四JS语法通过。bundle254文件，SHA `8aff7113f5833e8c4fcff2dc37c86fcccfc2c3f922a322b0550417cc8fbfaade`，shell/play不变。`verify_city_source_registered`为需`--output`的CLI（不能裸跑，非回归）。主动LSP未跑，不称clean。
- 未提交、推送、部署或迁移真实数据，目标未完成。

## 130. CITY-CAPACITY-1/C4：攻城入口城市门动态长度

- `performScenarioSiegeEntry`的私有指针`cityAt`与28BB入口门改用共享`cityAtRoadPointer`及live长度＋`idx`身份校验，诊断标签不变，失败仍fail-closed。192城行为不变；高索引完整攻城链未验证，不声称可玩。见[计划§9.10.18](city-capacity-expansion-plan.md#91018-c4攻城入口城市门改动态长度)。
- siege12/12、siege_result、npc_siege_evidence、movement35/35通过，一JS语法通过；bundle254文件，SHA `b64d3ad8c1a9ad2301336dd05b11560b092da72903e545223bcbea55da1a247e`，shell/play不变。siege_contact_march装配期失败经stash基线复核为既有环境失败。主动LSP未跑，不称clean。
- 未提交、推送、部署或真实迁移，目标未完成。

## 129. CITY-CAPACITY-1/C3：撤退驻留与返回动态长度

- 474A驻留检查改live城市域＋`roadNodeToCitySlot`解槽＋索引读主权（城市表缺失沿用旧界，错位仍fail-closed）；`originalRetreatRoute`的BX返回校验改live长度（旧`0x17e0`为192城写法）。487B体内部与寻路plumbing仍走旧地址API；siege手写mock已补`readCityOwner`。
- siege12/12、arrival32/32、movement35/35、road_state10/10通过；两JS/MJS语法通过。bundle254文件，SHA `1b802b67e843eabc54270a93ec60c895527c514cc95492b945c1fad5bcca70d8`，shell/play不变。road_callers与march_resume失败经stash基线复核为既有环境失败（装配期地形／路图），非本轮回归。主动LSP未跑，不称clean。
- 未提交、推送、部署或真实迁移，目标未完成。

## 128. CITY-CAPACITY-1/C3：移动节点域动态长度

- movement目标桥与城市节点门（`targetNode`读写、`cityAt`、`nodeize`落点）改按live城市长度动态化，0x800边／节点种属标记不动，城市表缺失时沿用旧门。首版误将 bound 常量放进`movementIO`作用域致5项失败，已提模块级`maxTargetNodeOf`／`cityNodeBoundOf`修复，movement35/35回绿。超192节点的完整移动进入仍未用真实大世界验证。
- movement35/35、arrival32/32、road_state10/10通过；两JS语法通过。bundle254文件，SHA `69fabb70eece684ec0b4d45550045d1b6441e67ad30d10468c6dd9e9eed1bb24`，shell/play不变。主动LSP未跑（沿用既有push-only/inconclusive结论，不称clean）。
- 未提交、推送、部署或真实迁移，目标未完成。

## 127. CITY-CAPACITY-1/C3：到达指针桥动态长度

- `originalroadstate.js`新增`cityAtRoadPointer`（`0x840+slot*32`同一起始／对齐，按live长度验`idx`，不设192门）；`arriveOriginalRoad`私有`cityAtPointer`全部六处改用共享体，失败仍为带指针与指令的RangeError。旧注释头在本轮一次误伤后已原样恢复，经`node --check`确认。
- road_state10/10、arrival32/32、movement35/35通过；三JS/MJS语法通过。bundle254文件，SHA `8c3eb862907ab67fe3510f2e171b8db2643ef26bc0e9f55d9522a373294eed04`，shell/play不变。主动LSP未跑（沿用既有push-only/inconclusive结论，不称clean）。
- 未提交、推送、部署或真实迁移，目标未完成。

## 126. CITY-CAPACITY-1/C3：移动所属索引解槽

- `performOriginalRoadAction`内联`cityOwner(node)`改用`roadNodeToCitySlot`解槽＋`readCityOwner(slot,"movement-owner")`；47BB寻路plumbing仍走旧地址API（共享搜索契约另行转移），`cityAt`／目标桥／retreat／`cacheAt`仍带旧门。详细边界见[移动所属索引](re-notes-march-pathfinding.md#city-capacity-indexed-movement-owner)与[计划§9.10.17](city-capacity-expansion-plan.md#91017-c3到达首读按节点解槽改索引)。
- movement35/35、arrival32/32通过；两JS语法通过。bundle254文件，SHA `f47bd9a7daa6cc1e67f76bdbc314cf83e22e831a96c0ce67d3fc47c130b3103d`，shell/play不变。主动LSP未跑（沿用既有push-only/inconclusive结论，不称clean）。
- 未提交、推送、部署或真实迁移，目标未完成。

## 125. CITY-CAPACITY-1/C3：到达首读索引解槽

- `originalroadstate.js`新增`roadNodeToCitySlot`：`BX`（8*slot）经同一u16回绕／对齐解槽并验`idx`身份，不设192门；`arriveOriginalRoad`首读改`readCityOwner(slot,"28F4-first")`，错位／回绕／身份错位fail-closed。movement／retreat同类读取仍走旧地址API；`cacheAt`指针校验仍带192门。详细边界见[所属索引](re-notes-march-pathfinding.md#city-capacity-indexed-city-owner)与[计划§9.10.17](city-capacity-expansion-plan.md#91017-c3到达首读按节点解槽改索引)。
- road_state9/9、arrival32/32、movement35/35通过；三JS/MJS语法通过。bundle254文件，SHA `0dc33f9cd9b71885a981a0f7807145601004939b13eab16622b7e5733bf3393b`，shell/play不变。主动LSP未跑（沿用既有push-only/inconclusive结论，不称clean）。
- 未提交、推送、部署或真实迁移，目标未完成。

## 123. CITY-CAPACITY-1/C3：战略邻居索引边界

- `originalroadstate.js`新增单格C1C解码服务，FF为空引用，不压缩／排序／修复；同一军事叶经Scenario两处返回接入，仍四槽懒读、null终止，其它消费者保留各自语义。旧byte解码不能产生高索引；显式nullable-index输入验证192/254/255/256可派令且仅null终止。详细边界见[行军说明](re-notes-march-pathfinding.md#city-capacity-typed-city-neighbours)。
- road_state8/8、native city36/36、治理算术3/3共393216样本、月度外交15/15、既有road movement/capture/续段入口通过。stderr故障hold均为负控预期；邻居存储／v3装配／派令／编成／缓存／道路位置仍待改。
- 五JS/MJS语法通过；bundle254文件，SHA `72ac7771a8d5fc9a990103d12a8fb6531540fa2f657339ce7396d8ea34382b02`，显式重build unchanged，shell/play不变。主动LSP五路径push-only/inconclusive，mode=all无缓存认证，不称clean。实际diff／空白及三文档203处本地链接锚点通过，新增锚点唯一。
- 未提交、推送、部署或真实迁移，目标未完成。

## 124. CITY-CAPACITY-1/C3：到达刷新现属索引

- `refreshOriginalCityCache`的3F11现属读取改用`readCityOwner(idx,"3F11")`，与军事／治理共用索引体；旧属比较、F17写回门、冷却与C18不变。到达首读仍走旧地址API。详细边界见[所属索引](re-notes-march-pathfinding.md#city-capacity-indexed-city-owner)与[计划§9.10.16](city-capacity-expansion-plan.md#91016-c3到达刷新现属读取改索引)。
- native city36/36、arrival32/32及请求续段通过；stderr故障hold为负控预期。邻居存储／v3装配／派令／编成／缓存／道路位置仍待改。
- 一JS语法通过；bundle254文件，SHA `b7820d543657ebf0dfbee464b3bbfbfd9ed488a03f697557b3d59b011a9837d1`，显式重build unchanged，shell/play不变。主动LSP一路径push-only/inconclusive，mode=all无缓存认证，不称clean。实际diff／空白及三文档206处本地链接锚点通过。
- 未提交、推送、部署或真实迁移，目标未完成。

## 122. CITY-CAPACITY-1/C3：城市所属索引服务

- `originalroadstate.js`新增索引读取体，旧地址适配保192门并复用；Scenario准备／能力提供readCityOwner，同一军事／请求后继／治理九处去DS地址及内部重复192门。所有者byte域与null→18h不变，未知仍拒，保原故障阶段标签。详细边界见[行军说明](re-notes-march-pathfinding.md#city-capacity-indexed-city-owner)。
- 索引服务7/7（含192/254/255/256真实读取及同一治理叶）、native city35/35、治理算术3/3共393216样本、月度外交15/15、movement35/35、capture18/18及TALK38续段通过。stderr故障hold均为负控预期；不等于高索引完整军事或新世界准入。
- 七JS/MJS语法通过；bundle254文件，SHA `ff819218c0ba7cb8c4767600af1448a0fd8811289d23cd6fa46671a59f017061`，显式重build unchanged，shell/play不变。主动LSP七路径push-only/inconclusive，mode=all无缓存认证，不称clean。
- 实际diff／空白及两文档140处本地链接锚点通过，新详细说明锚点唯一。邻居byte/FF、派令／编成／缓存／道路及v3装配仍待改。未提交、推送、部署或真实迁移，目标未完成。

## 121. CITY-CAPACITY-1/C3：军事候选身份与标记分离

- 同一`runOriginalCityMilitary`改用有序候选记录和独立敌对标记，取消私有16-byte表的FE/FF城市身份混用；不改四邻读取／byte威胁／重复owner与缓存读取、原DEC选择和已批准四候选低0规则。详细维护源见[行军说明](re-notes-march-pathfinding.md#city-capacity-typed-city-candidates)。没有新增第二套AI或放宽192准入。
- native city35/35通过，包含全部1024候选数／随机byte组合及新增三组己方／敌对／中立混合读取轨迹；既有故障注入日志均为预期负控。原窗静态入口和TALK38续段另通过，不声称CPU复演、完整战役或高索引军事入口验证。
- 两JS/MJS语法通过，bundle254文件SHA `117c8808b90d9a71a8b183cb634f67ee18c56ade6ebcbd8419266548471dc8ee`，显式重建unchanged，shell/play不变。主动LSP两路径push-only/inconclusive，mode=all无缓存认证，不称clean。
- 实际diff／空白及两文档138处本地链接锚点通过；新详细说明锚点唯一。cityOwner／邻居消费仍受旧地址及byte边界限制；派令、编成、缓存与v3装配待接。C3／M192未完成；未提交、推送、部署或迁移真实数据。

## 120. CITY-CAPACITY-1/C1/C2：战略邻接顺序与拓扑一致性

- D6生成前的核查发现不能用导航端口重建导入战略顺序：登记3840行连接多重集合均一致，但2600行非空顺序不同；导航114节点有中间空槽，战略数组无中间空槽。只读KI复核88CC..895D位序，完整证据／边界维护于[战后§12.3.1](re-notes-legion-fate.md#city-capacity-strategic-neighbour-order)，不把Web数据观察当原CPU结论。
- `compileChapterCityState`现必需传入已校验图，核城市ID／index／坐标配对、每城邻接多重集合，不改任一顺序或初态。增加已知但不连通、漏／重复邻接、陈旧图等负控，纯内存14/14通过。未生成新城C00高位，不改88CC运行／保存逻辑。
- 实际独占r11通过；只读比r10/r11，runtime-city-slices字节及SHA `c15e4c47f8d558246ccc5f5e3a70d8c798a5f182713ed1712e49f2bc34ff7d13`不变，41输入、三类道路对照、目录和39计数差异不变。旧收据保留，r11新增neighbourOrders统计；仍非M192或完整新城初始化。
- 三JS/MJS语法通过；bundle254模块SHA `44d213d1a1df74bb38798d712c122650810eb47ca26040b0b6fd0b1b23a6601d`，显式重build unchanged，shell/play不变。主动LSP三路径push-only/inconclusive，mode=all无缓存认证。实际变更／空白、两文档136处本地链接及原证新增锚点检查通过。未运行无关浏览器／战役回归，无提交／推送／部署／真实迁移。

## 119. CITY-CAPACITY-1/C1/C3：章节城市引用与初态编译

- 新增`chaptercitycompile.js`，按捕获的cityOrder编译城市、22物理势力城市引用及C18；不截byte身份，不用主表新章默认覆盖旧章值，不丢未放置引用。陈旧源计数拒绝，明确不用于live F23或恢复。详细维护源见[计划§9.10.11](city-capacity-expansion-plan.md#91011-c1c3章节城市id到运行索引编译隔离片段)。
- 新纯内存12/12通过；实际独占r10的20章3840城市／缓存、440势力片段逐字段对原state/raw独立oracle通过。另只读对照r9/r10：旧四份转换产物逐字节同，41输入、原道路三类查询轨迹、攻城目录及39计数差异不变。runtime-city-slices SHA `c15e4c47f8d558246ccc5f5e3a70d8c798a5f182713ed1712e49f2bc34ff7d13`，新报告绑定15审计＋7转换代码，旧报告不改。
- 三JS/MJS语法通过；bundle254模块，SHA `123fdb5b41824d961a6ff5adb50c790ab8dbd2f5a0a9fe99246dbafa73dc5ded`，显式重建unchanged，shell/play不变。主动LSP三路径push-only/inconclusive，mode=all无缓存认证，不称clean。
- 实际变更／空白检查及两文档134处本地链接锚点通过。仅隔离编译片段；未接完整GameSource／v3装配／运行消费者／快照恢复，不是M192或193/257城可玩验收。无提交、推送、部署或真实迁移。

## 118. CITY-CAPACITY-1/C4：真实目录绑定收据与受控城损输出

- `verify_city_source_registered.mjs`改用现行程序攻城目录ID，新增独立资源SHA／长度、目录文件SHA及目录模块代码SHA；不伪装成原41角色之一，不改旧r1–r8。独占r9报告通过192城实际目录绑定、20章3840城市行、440物理势力槽和39计数差异，以及全部既有寻路／选边／撤退对照。
- 独立r8/r9比较证明除192处battleMapId外，city-source其余值、章节城市／旧绑定、41输入及三类道路轨迹均未变化。资源2142364字节SHA、目录SHA和详细限界维护于[计划§9.10.10](city-capacity-expansion-plan.md#91010-c4攻城资源身份与战术入口解耦局部已接)；仍未认证类型适配、原BATTLE二进制、正式包登记或M192。
- `verify_battle_tactics.mjs`扩受控退出：两高索引目标共用资源0但城兵不同，攻／守方向的cityDamage各自等同属性旧索引基准、互不混用城兵，退出零RNG且不写源城市。使用强制finished／受控墙记录，明确不是完整战斗、战略城损或易主回写验收。
- 本轮只改审计／回归与文档，未改产品源码、不重建未变引擎包。两个MJS语法及相应入口、实际变更／空白、两文档133链接锚点通过；主动LSP两路径push-only/inconclusive，mode=all无缓存认证，不报clean。CodeGraph查询settleVisualBattle超时后改定点读取，未解锁／重启索引。不提交／推送／部署／迁移真实数据。

## 117. CITY-CAPACITY-1/C4：攻城资源ID与实际目标分离

- 新增`content/battlemapcatalog.js`，捕获现行192攻城目录为`ki-1995:siege:*`，排除野战目录；只核目录元数据，不替代布局／导航／资源身份校验。`createSiegeProjection`消费显式battleMapId，资源directoryIndex与实际city对象分离；无效显式绑定拒绝，旧192无字段输入暂兼容，不误取192..213野战项。
- 目录／投影新测试7/7；扩展已有tactics入口，通过实际detached Session验证城市256／257共用资源0时攻／守镜像、mode0、exitContext目标、RNG计数及地图隔离。首次隔离断言误用人头数1000而非显示十人单位100，核既有转换后只改测试预期；未改兵数公式。
- `main.ensureGameAssets`在资源边界一次捕获目录，不在每场投影重复校验。5个JS/MJS语法通过；bundle253模块，SHA `59d773f4a2e93b005b072ba462dc6f12b44e775fcaa133f5473f647fa9770ded`，显式重建unchanged，shell/play不变。只读3个现行Web战术资源，全部场景内存隔离，无SAVE/profile/网络/资源写入。实际diff／空白及两文档132链接锚点通过；主动LSP五路径push-only/inconclusive，mode=all无缓存认证，未称clean。
- 合同与限界见[计划§9.10.10](city-capacity-expansion-plan.md#91010-c4攻城资源身份与战术入口解耦局部已接)。未认证战略高索引攻城、退出城损／占领、类型适配、编辑UI、发布及保存；r1–r8仍是audit-only战场ID，未改旧收据。不提交／推送／部署／真实迁移。

## 116. CITY-CAPACITY-1/C2：真实登记图撤退决策对照

- 扩现有登记源审计，不改产品运行代码：192节点／254边中点±方向、首都每16城采样并含当前位置／边端／null、默认章／全己／全外三种所属配置，共30720次487B决策与原适配器逐结果／惰性所属读取序一致。未执行去向或军团写回，详细配置与三组轨迹SHA见[行军笔记](re-notes-march-pathfinding.md#city-capacity-structured-retreat)。
- 独占`.dragon-analysis/city-capacity/registered-city-source-r8/`通过，绑定13审计代码SHA及原7转换代码SHA；r1–r7保留。原52176次搜索／56160次选边、两轮城市投影、3840初态／440物理势力／39计数差异和41输入不改重核；另逐字段核r7的输入、投影代码、拓扑、搜索、选边及计数差异与r8完全相同。
- 三配置各10240次；默认章found701／already254／无首都700／下一城外属2083／双端外属6502，全己8332／1208／700／0／0，全外0／192／700／2292／7056。连通登记图无no-route样本，孤图仍靠独立单测，不混淆两类覆盖。
- MJS语法、diff／空白及两文档131处本地链接锚点通过；主动LSP push-only/inconclusive，mode=all无缓存认证。产品代码不变，不重建束、不跑浏览器。运行撤退尚缺持久化等待及caller接线，不用返回true/null临时绕过原去向链；不称M192或整体完成，不提交／推送／部署／真实迁移。

## 115. CITY-CAPACITY-1/C2：结构化487B撤退选址

- 新`structuredroadretreat.js`保原端点筛选／读取序及反搜选城，分开无首都／外属端点／无路／下一城外属，不产生假城市或直接执行去向。静态487B..491B窗口亲读并锁SHA，详细证据及限制见[行军笔记](re-notes-march-pathfinding.md#city-capacity-structured-retreat)。
- 新回归7/7：640次连接图查询逐结果／所属读取序对照原适配器，另测等费端口顺序、快捷、缺首都、孤图、未知所属、192/254/255/256；搜索8/8重新通过。两文件语法通过。252模块bundle显式重建unchanged，SHA `8a8a5fc7bac2568d2a874ac37f1b75047dc9fc01c2ed1067c03db5063603718f`，shell/play不变。主动LSP两push-only/inconclusive，mode=all无缓存认证。
- 实际diff／空白及两文档130处本地链接锚点通过。这是隔离决策，不是现行战后／garrison写回；尚未做真实登记图全量撤退对照或运行接线，未做M192／新城战役／浏览器。继续追调用者对null的去向语义，不机械替换。无提交／推送／部署／真实迁移。

## 114. CITY-CAPACITY-1/D5：运行选边耗尽停止动作

- 原生47BB耗尽在高费用门之前明确返回unreachable；两个动作入口恢复占格，保位置／目标，不读假0800边、不因无路调用291A。路上重算无路时保留原pending-bit，使下次到期不沿旧方向偷走；可达替换可恢复正常移动。原日结／尾段／余槽保持。详细维护源：[运行无路边界](re-notes-march-pathfinding.md#city-capacity-unreachable-action)。
- movement35/35、结构化选边6/6、到达32/32、捕获18/18通过。连续到期负控先红（旧方向仍移动），再修pending-bit；快照断言首次误读派生legions，改为权威nativeLegionSlots.records。没有放宽断言或修改存档实现。原耗尽假边oracle标历史并由已批准D5替代，原KI字节pin保留。
- 两文件语法及bundle同步通过，251模块SHA `2f1b4fd2c146ebbb12443f4d49c931ebd5bf3342027fc2950c2b34493f75cae9`，显式重建unchanged，shell/play未变。主动LSP两路径push-only/inconclusive，mode=all无缓存认证，不称clean。
- 实际diff及空白检查通过，两文档128处本地链接／锚点通过。D5尚缺487B撤退选址、玩家／AI新命令预检及提示；高费用策略另待决定。未做新城市准入、M192全战役或浏览器验证，不提交／推送／部署／真实迁移。

## 113. CITY-CAPACITY-1/C2：登记图选边三profile对照

- 扩`verify_city_source_registered.mjs`，在真实登记192节点／254边上，以全节点及每边中点正反方向、每16城目标加边两端、command1/10、默认／全己／全外属三profile作56160次47BB决定对照。位置／status bit0、其它状态位不变、owner读取及原写集次序逐项通过；原52176次491B及既有城市转换对照同时通过。
- 新独占报告`.dragon-analysis/city-capacity/registered-city-source-r7/audit.json`：各profile18720查询，去向请求分别8244／0／8332，仅stub记录owner，不执行291A；11份审计代码＋7份转换代码SHA及三轨迹hash绑定。本轮原41输入、20章源对象、结构图及双轮城市输出仍不变；r1–r6不改。详细配置与边界维护于[选边原证](re-notes-march-pathfinding.md#city-capacity-structured-selection)。
- 工具语法、diff空白及两文档126处本地链接／锚点通过，主动LSP push-only/inconclusive，mode=all未认证；只改测试及文档，不重建未变引擎束。未运行全点／全目标／全所属组合、CPU、actual legion写回、占格／接敌／去向／撤退／存档，不称M192通过。战场IDs仍运输probe，不是真实目录绑定；无提交／推送／部署／真实迁移。

## 112. CITY-CAPACITY-1/C2：结构化位置选边隔离核

- 新`structuredroadselection.js`复用491B结构化反搜，区分城市首末点选边、边内保点改向、已经到达、无路及原费用去向请求；自身不写军团／占格、不执行291A、不改生产准入。原47BB完整窗口已再次只读复核，详细维护源见[选边边界](re-notes-march-pathfinding.md#city-capacity-structured-selection)。
- 新6项通过：16城市对、72边点／方向／目标组合对照原47BB结果／读取顺序／写集顺序，另核高费用、快捷、无路、索引192/254/255/256。寻路8项复跑通过，两JS/MJS语法通过。规则点游标不必是当前XY，不能在接敌挂起前投影覆盖坐标；残留字段未删除。
- bundle251文件，SHA `770e1eb119e5096848436511996f78fa299aab614a7c04d4ae61ac4c20095fad`，显式重建unchanged，shell/play不变。主动LSP两push-only/inconclusive，mode=all无认证，不称clean。
- 仍未接实际移动、占格、接敌／战斗返回、撤退和存档；原费用扩域待决定，不是M192或新城可玩证明。保留已有报告和改动，无提交／推送／部署／真实迁移。

## 111. CITY-CAPACITY-1/C2：结构化寻路核与登记图查询对照

- 新`structuredroadsearch.js`保491B批次／交错／双端口次序，动态数组不截城市索引或队列计数；明确区分快捷、命中、耗尽。仍保原word费用语义，不抢先决定D5费用扩域，不接运行／保存。原窗再次只读核验，详细维护源见[寻路边界](re-notes-march-pathfinding.md#city-capacity-structured-search)。
- 新寻路8/8、运输8/8通过；寻路覆盖S2非稳定优先队列反例、S3重复节点、word回绕、192/254/255/256、511节点树的256项同批前沿及未知owner失败。合成输入不是可运行地图。
- 登记源独占r6通过52176查询：首章所属actor0单停止点全对36864＋双停止点6096，全己／全非己各4608；道路／方向／费用及惰性所属读取顺序逐同。41登记输入、源对象、图和章节不变；城市两轮输出、3840初态／440势力物理槽／39计数差异继续核对。`.dragon-analysis/city-capacity/registered-city-source-r6/audit.json`绑定9个audit代码SHA＋7个投影代码SHA及三组轨迹SHA；r1–r5不改，导出器仍rev4。
- 三JS/MJS语法、diff空白、新文件空白和两文档122处本地链接／锚点通过；250模块bundle显式重建unchanged，SHA `c8d0dc31f5e88bca9b821e2199e217aa362befa1e755ec1fbbaac2021710a57a`，shell/play不变。主动LSP三路径push-only/inconclusive，mode=all无缓存认证，不称clean。尚未跑完整App／浏览器；这不是全所属组合、原CPU、移动／撤退写回或M192/M193/M257验收。无提交／推送／部署／真实迁移。

## 110. CITY-CAPACITY-1/C2：结构化道路运输投影

- 新增`structuredroadgraph.js`，输出v3具名节点／端口／边，消除运输数据中的node×8、0800h边区及方向高位；保四槽顺序、边／点次序、byte费用／flags和bounds。已捕获城市片段不重复校验，未知道路在投影边界检查；不推导新费用或替换实际寻路。
- `verify_structured_road_graph.mjs`8/8，包括193/257节点、386/514边、6145点、255/256普通索引、重排、缺槽／冲突／坏字段／稀疏数组及隔离。大图样本只认证运输，不是可放置地图或M193/M257。
- 实登记源r5独占报告通过：`.dragon-analysis/city-capacity/registered-city-source-r5/road-topology.json`包含192节点／254边／5526点，逐端口／边字段对照旧v2 encoder。41原输入、源对象／20章不改；现有3840初态和39计数差异对照继续通过。audit绑定新增投影及oracle代码；城市导出仍rev4，旧r1–r4不改。详细合同／SHA及限制见[计划§9.10.6](city-capacity-expansion-plan.md#9106-c2结构化道路运输投影不含寻路运行切换)。
- 三JS/MJS语法、diff空白及两文档120处本地链接／锚点通过；主动LSP三路径push-only/inconclusive，mode=all无缓存认证，不称clean。引擎包249模块同步，显式重建unchanged，SHA `f7d735f8e7a458cbd205e39202dfa01430c395f055050fbe96ff1f998fa53241`，shell/play未变。未接运行加载器或存档，未跑浏览器／真实路线，不提交／推送／部署／真实迁移。

## 109. CITY-CAPACITY-1/C1：导入城市具名初态片段

- `chaptercityconversion.js`新增initializer，保原attr／冷却／旧属／边界计数／灾度／C18，四邻接转稳定cityId或null但不改顺序／尾槽；不把旧章拉平成新城零初态。缺完整raw、重复raw或同名字段冲突、无法映射邻居拒绝，不猜填。详细维护源：[计划§9.10.5](city-capacity-expansion-plan.md#9105-导入章已知城市初态投影rev4)。
- 章节转换7/7、CLI6/6通过；实登记源新轮次`.dragon-analysis/city-capacity/registered-city-source-r4/`核3840份已知初态、20章引用与39项计数差异，41输入不变，两轮输出相同。导出修订4；r1–r3不回写。audit依原byte独立对照，不以被测转换器自证。
- bundle248模块SHA `b1d1767a2089fc14c8ccc70eaa6b72176a7572a8ae7a52d2311e67cf84ba2d52`，显式重建unchanged，shell/play不变。主动LSP五路径push-only/inconclusive，mode=all无缓存认证，不称clean。
- 五文件语法、diff空白及两文档119处本地链接／锚点通过，复读rev4收据和输出确认3840份initializer。仍是离线新源片段，未接运行装配／保存，没有实现新城初态生成，不代表C1/C4或M192完成；其它原字段并未被证明unused。无提交、推送、部署或真实迁移。

## 108. CITY-CAPACITY-1/C1：章节城市引用与计数差异投影

- 新增`chaptercityconversion.js`及5项纯内存测试：保每章七个城市值、转换首都／两条战略目标到稳定cityId、FF→null；按已批准D6重计城数并同时报告原raw／公开计数。原章与raw不写回，不处理其它章状态或原生初态。
- 首次实登记源试投影因只看公开势力表而拒upper-1的21号城主；核现有`initializeNativeFactionSlots`后复用同一`decodeFactionSlot`读取完整22物理槽，并显式区分declared，不增加公开势力或扩容量。缺raw／公开引用与raw矛盾仍拒，不凭计数补隐藏角色。
- 导出器rev3新增`chapter-cities.json`并绑定七个代码文件；6/6转换CLI通过，含缺章节物理源时不创建输出的负控。新实登记源轮次`.dragon-analysis/city-capacity/registered-city-source-r3/`核20章3840城／440物理槽，对照39处城数差异，41输入SHA不变、两轮输出逐字节同；r1/r2不改。详细合同与限制见[计划§9.10.4](city-capacity-expansion-plan.md#9104-章节城市值首都目标与城数投影rev3)。
- 五JS/MJS语法通过；引擎束248模块SHA `dc60902149f04309cf2c2f6f7f36e11ebbff78b52d4419ccae531e93a072f896`，显式重建unchanged，shell/play无变。主动LSP五路径push-only/inconclusive，mode=all无缓存认证，不称clean。
- 实际变更及空白检查、两文档118处本地链接／锚点通过，r3收据末审核到3840行和39项计数差异。仍为离线部分数据转换，战场仅audit-only运输ID；不是M192、新城运行、完整GameSource v2、发布或存档验收。不提交／推送／部署／真实迁移。

## 107. CITY-CAPACITY-1/C1：实际登记源片段转换

- 只读固定41个登记Web输入，经共同full-copy内存投影核到实际placement额外含`id/componentRef/variantRef/importRef`。原纯三字段validator会拒绝真实形状；补同形负控先红，再显式保留／校验四字段及实例ID唯一，不在工具里删字段造通过。
- 新永久入口`verify_city_source_registered.mjs --output <新轮次>`产出`.dragon-analysis/city-capacity/registered-city-source-r2/`：192城完整属性／默认章cap／稳定顺序及placement逐值对照，20章不回写；两轮输出一致，41登记源SHA前后不变。战场ID使用明确audit-only探针，**不是**真实战场绑定、API创建、完整新源或M192证书。
- 导出器修订`city-source-projection-2`加五文件代码SHA，audit另绑定四个审计／读取工具SHA；r1是收据升级前首轮，原样保留不追补。范围及复跑入口见[计划§9.10.3](city-capacity-expansion-plan.md#9103-真实登记源片段核验非运行验收)。
- 源校验14/14、转换6/6、实际登记源r2通过；五JS/MJS语法通过。bundle247模块SHA `b352fd4d1e68f617ae7e938921ca26cd1ae8cde4a63a7015168915bbd56a429c`，显式重建unchanged，shell/play未变。主动LSP五路径push-only/inconclusive，mode=all无缓存认证，不称clean。
- 实际变更、空白及两文档117处本地链接／锚点通过，最终audit收据已读取核对。未访问原SAVE、真实账户／profile／存档／生产桶，不提交、推送、部署或安装／迁移真实数据；章节及道路引用转换、初态／运行与后续验收仍未完成。

## 106. CITY-CAPACITY-1/C1：旧据点片段转换及离线独占输出

- 新增`citysourceconversion.js`：明确旧slot→cityOrder、坐标与slot退到legacyBindings，指定默认章一次取城兵上限，战场ID由调用方显式传入。完整章状态／raw／首都不动，不声称整个GameSource已转换；合同见[计划§9.10.2](city-capacity-expansion-plan.md#9102-c1旧据点源片段转换与独占输出已实现)。
- `export_city_source_projection.mjs`只读显式源JSON与战场ID JSON，校验后在新独占叶目录输出片段、旧绑定及SHA收据；拒覆盖既有轮次，收据最后写，明确不含运行／发布／保存迁移。
- 转换6/6、源边界13/13通过；CLI仅新临时目录合成夹具，验证缺父目录、输入不变、重复输出确定性、拒覆盖、失败不创建输出与输入输出SHA。三个JS/MJS语法通过；247模块bundle显式重建unchanged，SHA `c49d8a5ef27fb2b1a1ee5f9c90203d56280e22914fdacb406590ff7d00f6c30e`，shell/play未变。主动LSP三路径均push-only/inconclusive，mode=all无缓存认证，不称clean。
- diff空白、新文件空白及两文档116处本地链接／锚点通过；当前状态摘要同步，历史批次不改写。未转换真实登记源、未接生产schema2或新增城运行，旧192门仍在；C1其余章节／道路／首都引用及后续里程碑继续。不提交、推送、部署或迁移真实数据。

## 105. CITY-CAPACITY-1/C1：据点源属性边界

- 新增`citysource.js:captureCitySource`，复用identity模块，明确新据点字段／placement坐标唯一权威、草稿缺项与已放置城严格完整性；旧slot／坐标／raw及未知placement字段拒绝而非静默剥离。新章默认上限不拉平已有章节；资源绑定这里只核字符串，不代目录／运行检查。详细合同见[计划§9.10.1](city-capacity-expansion-plan.md#9101-c1据点源属性边界已实现尚未接gamesource新版)。
- 新纯内存测试13/13、身份37/37通过；两文件语法通过。246模块bundle显式重建unchanged，SHA `5909c7b6b982c359315711bfb391b00ba26eaf2c6407bab781396197f9c5b9f0`，shell/play未变。主动LSP两路径push-only/inconclusive，mode=all无缓存认证，不称clean。
- 实际变更及空白检查通过，两文档115处本地链接／锚点通过。这是新源片段validator，不是完整新版GameSource接线；旧192门未开放。C1还缺旧源隔离转换、章节／道路／首都稳定引用、战场目录校验及真实保存，后续继续。不提交／推送／部署／真实迁移。

## 104. CITY-CAPACITY-1/D6：城兵上限原证与导入负边界

- 复核KI的420B治理双byte读取及575C预算读取，确认`troops_cap`是C12独立输入；新源必须逐章保留，不由类型／战场推算，也不拉平成首章上限。详细维护源：[字段原证](re-notes-entity-fields.md#city-capacity-troops-cap)。
- 新增只读`verify_city_initializer_sources.py`：锁五库长度／SHA，直接纯解析20份城市表，3840个上限与原byte逐同；2328条与首章不同，槽0跨章示例锁定。语法检查用compile不产pycache；不写原源、Web生成物、SAVE或任何用户状态。
- 首次临时统计在下库88830B长度断言失败；确认既有缺2B事件尾原证后，仅验证完整城市区，未补尾、未放宽完整导入门。工具通过不是20章可编译、M192或扩容准入通过。
- diff空白及新增源／计划空白、证据链接检查通过；主动LSP为push-only/inconclusive，mode=all无缓存认证，不称clean。本批不改产品代码、不重建引擎束、不跑浏览器；后续继续C1具名源和D6初始化接线，保持未提交／未推送／未部署／未真实迁移。

## 103. CITY-CAPACITY-1/D1：消息自身续段失败暂停

- 补`completeRequest`中40F6／414F／40B3异步错误边界：该段在批次resume之前，原先错误逃逸会清掉request却不进入failure hold。现保已写前缀、暂停并禁存，不恢复／重跑批次。
- 新负控先红（RNG注入错误逃逸）后绿，覆盖RNG未写和40B3缺owner但冷却已写27；重复关闭、下次aiTick均无额外RNG或游标推进。native city34/34、phase9/9、request continuation通过；两JS语法及bundle同步通过，245模块SHA `65907d778fb01b8c640b72145f1bd9b16266693222181e011e5004a3a0b74fec`，显式重建unchanged，shell/play不变。
- 详细维护源见[续段边界](re-notes-march-pathfinding.md#city-capacity-request-tail)，历史P24阶段所有者说明已标旧，不让文档反向要求重复治理。diff空白及新增锚点／文档空白检查通过；主动LSP为ai.js超5000行、测试push-only/inconclusive，mode=all无缓存认证，不称clean。仍不是M193/M257验证；本批未跑浏览器或完整战役，不提交／推送／部署／真实迁移。

## 102. CITY-CAPACITY-1/D1：192相位分配及多城续段接线

- 新增`web/src/game/cityphase.js`并接入原生aiTick，按已批准192相位分配城市区间；military/daily阶段闭包按城市顺序恢复，整个批次返回后才推进相位与唯一军团batch。空城市批次也走军团；同步无UI不能重入。旧192结果不变，历史cityIndex／_cityTickCursor名称暂保留为相位，不偷偷升级保存格式。
- `verify_city_phase.mjs`9/9、`verify_native_city.mjs`33/33、request continuation通过；movement34/34、capture18/18通过。新N257双请求夹具只访问已知v2槽66/67，新增占位城市不消费，不当作193／257城市可运行认证；0／98304也只是纯调度函数域测试。
- 四文件语法、diff空白通过；LSP的ai.js超5000行，其余三文件push-only/inconclusive；mode=all未认证，不报clean。包245模块SHA `c8f68c399d3fe3b1be668631fa568fd4143f8af5ca7a2ec17912985a2362080c`，显式构建unchanged，shell/play不变。
- 详细行为维护于[行军笔记](re-notes-march-pathfinding.md#city-capacity-request-tail)，计划摘要同步。仍需C1城市源、C2道路与全部引用、C4初态／事件／战场、C5装配和真实保存等，不标C3或总目标完成。未跑浏览器／完整战役；不提交／推送／部署／真实迁移。

## 101. CITY-CAPACITY-1/D1：原生TALK38治理与军团续段

- `aiTick`原生分支接入军事请求的一次性resume，消息未关不治理／灾损、不推进城市／军团游标；同步无UI、重复关闭、调用方options变更、旧clock回调及后继失败保前缀／禁存均有正负控。详细源在[行军笔记](re-notes-march-pathfinding.md#city-capacity-request-tail)。这是D1前置修复，仍固定192，不代表动态批次完成。
- `verify_native_city.mjs`31/31通过，`verify_city_request_continuation.mjs`通过。新增夹具首次因只给求援1次RNG、遗漏随后治理2次RNG而失败，按已有治理消费补3个明确字节后通过，不改规则消费／断言目标。失败回调负控stderr预期。
- 两JS语法通过；包244模块SHA `f4ba1e122d3edb6177392118da096707b09479d370a7895098e6d9f779ef60d1`，显式构建unchanged，shell/play未变。主动LSP：ai.js超5000行限制，测试push-only/inconclusive；mode=all无缓存认证，不报clean。无浏览器／完整战役验收、无提交／推送／部署／真实迁移。

## 100. CITY-CAPACITY-1/D5：主动迁都无候选不再写189

- 已批准的D5子项落实于`originalcapitalrelocation.js`：选择器返回null，type8在读旧首都／写F03之前返回`no-capital-candidate`。正常候选与真实城189仍合法；不改捕获4DF0、灭亡、提案显式commit或4502写序，不放宽192门。
- `verify_native_capital_relocation.mjs`17/17通过：原首都5／189／null无候选全状态不变；事件消费游标正常前进，无消息／RNG／continuation，下游缺字段不被提前读取；真实189正常迁都。KI字节pin不变，当前差异详细维护于[去向笔记](re-notes-legion-fate.md#city-capacity-d5-capital)，外交笔记标废无城189的现行oracle。
- 捕获／JSON回归首次17/18，失败为旧fixture期待恢复原始地图BA，但现有prepareScenario fresh已执行89F0/8A1E着色。测试修为保存前live中心与冷恢复中心一致，同时确认不可变资源仍BA；未改着色／恢复代码。复跑18/18通过。该检查验证快照保真，不单独认证着色原规则；故障负控stderr属预期。
- 三文件语法与diff空白检查通过；引擎包244模块，SHA `03631d9c0bd6f8caf5a756e4b8a087d636d40d53196e782e0ffcb57243748bf9`，显式构建unchanged，shell/play未变。LSP未确认项如实保留，不报全clean。未跑浏览器、M192/193/257全链；未提交／推送／部署／迁移真实数据。

## 99. CITY-CAPACITY-1/D3：批准记录与去除两处跨记录别名

- **批准**：用户对§98集中请求回复“同意建议”，确认D1、D3、D5及D6新城初态／导入计数；随后恢复goal，当前active。D2、D4、费用域及财政算术扩域仍未批。历史“D1–D6未批／goal阻塞”仅适用于此前批次，现行维护源为[计划§9.4](city-capacity-expansion-plan.md#94-web差异具体提案待用户确认不进正式规则)。
- **实现**：`originalroadarrival.js`移除43D3旧别名读取函数，改用实际到达节点的stored C18；3F29中立旧属不再写外交[0][23]。当前192城同样适用，明确为批准的Web差异，不称原版等价。正常势力F17、冷却／缓存寿命、占格和其它到城命令不改；未放宽192节点门。
- **证据维护**：[行军原证§3.13](re-notes-march-pathfinding.md#city-capacity-d3)新增现行差异与历史原证边界；旧43D3 raw指令测试保持，别名值测试改为干扰输入。补当前城与目标城缓存相反、七个旧别名分区节点、两个缓存值共14组，检查精确RNG消费和stored值不被重建；中立场景检查整张外交表不变。
- **验证**：到城32/32、道路移动34/34、city request continuation入口及KI原始城市AI字节入口通过；故障负控输出为预期，退出码均0。三JS/MJS语法、diff空白通过。主动LSP三路径均push-only/inconclusive，不认证clean。244模块引擎包重建SHA `a234d3488d88d5582d15efd82ad38e8d2096ca52b2e4b96a918184f59142fd87`，显式重复构建unchanged，shell/play未变。
- **边界**：C0/C1及后续里程碑未完成，未执行浏览器／完整战役或M193/M257，未声称所有规则回归通过。无提交／推送／部署／真实迁移／SAVE或用户profile访问。

## 98. CITY-CAPACITY-1：实施前产品决定确认

- 身份／中心纯数据子模块已完成本批验证，但不是C1整项完成。下一阶段接源初态及运行引用会依赖尚未批准的Web行为；不把用户的“继续”解释成批准D1–D6，不靠继续堆叠未接线模块绕开决定。
- 本次请求确认[计划§9.4](city-capacity-expansion-plan.md#94-web差异具体提案待用户确认不进正式规则)中的D1节奏、D3两处别名、D5逐caller失败行为及D6新城初态／转换计数。D2事件跨月细节、D4抽样选择及D6算术扩域仍分项待定，不混进一揽子批准。
- goal因所需产品输入暂停，须用户明确决定并`/goal resume`后继续。C0其余消费者审计、C1转换和后续里程碑均未完成；不以此次暂停宣称已穷尽独立审计或扩容成功。保留现有本地改动，无提交／推送／部署／真实迁移。

## 97. CITY-CAPACITY-1/C1：放置中心边界及F23域续查

- `compileCityIdentity`补固定384×256整数中心、单格唯一校验；不改建筑footprint、章引用及可玩准入。四角／移动不改索引、重复中心、非法坐标及98304互异中心的纯数据投影加入测试，总计37/37；大样本不代表可玩容量认证。
- 两文件语法、diff空白检查通过；引擎包244模块，SHA `c78dcdcac24c73c8b052c8eb4ac744f2376d07d07cbb2845dd97ecf718d01dd0`，显式重建unchanged，shell/play未变。主动LSP两路径仍push-only/inconclusive，不报clean。
- C0续查F23三个外交消费者及3E14财政阈值：只放宽byte门会在4093／8189城触发signed16／word边界，具体源码推导及剩余UI读者见[计划§9.11](city-capacity-expansion-plan.md#911-c0续查f23计数与算术域)。这是待决D6影响，不是新增原机制结论，不自行补阈值。
- 未接生产扩容、未跑游戏／浏览器全链；不提交、推送、部署或迁移真实数据。C0和C1继续，D1–D6未批。

## 96. CITY-CAPACITY-1/C1：独立城市身份投影子模块

- 按计划允许先实现已闭合纯数据合同，新增`cityidentity.js:compileCityIdentity`；仅身份双射／单城单放置→cityOrder已放置子序列及索引表，不改原规则，不连接v1生产编译门。详细边界见[计划§9.10](city-capacity-expansion-plan.md#910-c1独立子模块确定性城市身份投影)。
- 内存测试`verify_city_capacity_identity.mjs`22/22通过：0/1/191/192/193/257、254/255/256无哨兵化、未放置／重排／删除／改名、JSON及冻结、重复缺失引用负控。两文件语法与diff空白通过；无磁盘测试数据、IDB、浏览器或网络。
- 引擎包同步244模块，SHA `52658ffd445643f35b70a56c4eff487e1acfba39f2cb666bb4c9086e84283942`，重建unchanged；shell/play未变。主动LSP两文件inconclusive/push-only，mode=all未认证，不称clean。
- C0继续；C1仅此子模块已落地，其余schema／转换／章节引用未接线，C2–C9未开始。未跑可玩M193/M257，不提交／推送／部署／真实迁移。

## 95. CITY-CAPACITY-1/C0：目标跟踪与发布／存档外层盘点

- 用户明确要求以`/goal`持续推进；已建立活动目标，不把D1–D6提案自动视为批准。C0仍进行中。
- [计划§9.8](city-capacity-expansion-plan.md#98-c0正式发布与存档外层接缝)记录现行copy检验→审批→prepare→原子安装→玩家准入链。检验目前只编地图，审批才完整编译；包冻结源章节而非独立运行投影，扩容须让章节、索引和道路取同次编译产物。旧draft发布不是当前copy主链。
- 存档codec/store全文已核：外层format3／IDB version1不含城市数量门；纯内存规范JSON往返验证257条及192/254/255/256索引、null通过，无IDB访问。运行装配仍需新schema和恢复验证，不能宣称M257通过。
- 续核`buildRuntimeIndex`、`manifestRoles`及`createPlayerEnvironment`：格式门和资源角色清单须同步，章选择器已在发布时用数字首都索引生成名称，不能等Scenario才转换。计划§9.9补稳定ID写链：主表copy行保存用cityId，章节操作仍cityIdx；已识别旧draft只读面板，避免改错入口。完整inventory／程序登记及当前章节DTO链仍待。
- 本批只修改计划与日志；尚未执行发布、浏览器或运行恢复。保留全部已有改动，未提交、推送、部署或迁移真实数据。

## 94. CITY-CAPACITY-1/C0：原生事件跨月与消费边界对照

- **产物**：新增`tools/verify_city_capacity_event_boundaries.mjs`，5项包含原KI窗口SHA、移页前／后延迟差异、消费后仍占位、旧当前页未消费事件丢弃、301C域外首读拒绝。固定KI只读，夹具全内存，未读SAVE或用户profile。
- **原证回流**：[外交§2.1](re-notes-ai-diplomacy.md#21-city-capacity-1c0事件移页与消费边界复核)维护原窗、指令、时序图与向量；[扩容计划§9.7](city-capacity-expansion-plan.md#97-c0事件边界测试与d2缺口收敛)记录D2影响，不把测试当原CPU证书。确认现行native adapter，不复用legacy移页。
- **验证**：新边界5/5、既有`verify_native_weather_events.mjs`5/5通过；新工具语法、`git diff --check`及三份文档105处本地链接／锚点通过。主动LSP为push-only/inconclusive，未确认clean；最终缓存诊断不能替代主动检查。不改玩家源码，不需重建共同包，未跑浏览器／完整月结战役。
- **状态**：C0仍进行中。D2初稿不足以实施：跨月未消费、游标已过月末、handler再入队及天气共享状态须明确；不擅将“不丢事件”实现成无限堆积或更改RNG／事件时机。其它字段审计继续，不扩大为全程序逆向。没有提交、推送、部署或真实数据迁移。

## 93. CITY-CAPACITY-1/C0：选都原字段纠错与事件次序复核

- **原证**：只读固定`KI.EXE`，重取6A3D、33EA、301C、5358窗口并核SHA；6A55取C16类型，6A73取C00边界。详细bytes、复核命令和反例回流[去向§11.1](re-notes-legion-fate.md#111-原始绑定与调用者实锤)，扩容计划仅链接，不复制另一套机制解释。
- **本地修改**：`originalcapitalrelocation.js`及`scenariocapitalrelocation.js`分开type／attr读取，保原分支短路与读取时点；未改捕获分支、无候选189及消息／4502写序。原回归夹具补独立type，新加字段分离、短路消费及缺type三项负控。同步`server/public/trialweb.txt`，不重开Trial接口。
- **验证**：`verify_native_capital_relocation.mjs`15/15通过（451F故障日志为既有负控预期），三个JS/MJS `node --check`通过；共同包243文件、重复构建unchanged，SHA见计划§9.6。主动LSP三路径均inconclusive/push-only；mode=all未认证缓存，不能称clean。`git diff --check`通过；三文档132处本地链接检查发现一处既有断锚`re-notes-ai-fiscal.md#native-fiscal-monthly-sequence`（去向旧§21内容，本次未改），本次新增引用均有效。没有跑浏览器／完整战役，不以局部15项证明扩容。
- **事件续查**：原5358显示585F去向先于2BD9，预算／天气在2BD9之后；301C起点先探槽后查0400。D2需保留生产者不同月界位置，不能照legacy移页写新native队列；完整callee仍待追。
- **状态**：C0继续，D1–D6未获确认；此次只修已闭合原证错误，不实施新规则、不放宽192门。保留原有文档改动，未提交／推送／部署／迁移真实数据，未读写SAVE或用户profile。

## 92. CITY-CAPACITY-1/C0：首批字段审计与待决合同

- **授权**：用户要求按扩容计划从C0开始，随后继续推进；保持384×256，保留已有修改，不提交／推送／部署／迁移真实数据。
- **产物**：[计划§9](city-capacity-expansion-plan.md#9-c0实施账本字段失败边界与差异提案)新增16行影响矩阵、纯数据不变量、版本登记及D1–D6具体提案。源码事实与原证结论分开；已读／待追明确，不以CodeGraph或旧测试认证KI规则。
- **发现**：首都、邻接、目标、计数和事件均残留byte／指针限制；天气选城单byte不能覆盖index256；两个6A3D实现分别取attr低位与type，须回原证及adapter核对；迁都、占领、city cache和消息后继不能仅改数组长度。事件溢出会改变生产者返回后的写回，必须连同调用链确认。
- **进度**：C0进行中，未勾完成；C1–C9未开始，尚无产品代码修改，也未开放第193城。D1节奏、D2拥挤事件、D3别名、D4区域天气抽样、D5不可达／无首都、D6初始化／计数均为待确认提案，不进入正式规则。继续追原证分歧、事件完整链及尚缺UI／发布／外层存档消费者。
- **验证**：两份文档93处本地链接／锚点检查通过；`git diff --check`及未跟踪计划的尾随空白检查通过。已核职责、字段引用和本次修改；纯文档不运行游戏回归、浏览器、构建或LSP。测试入口仅登记待审I/O，不算执行。未访问真实SAVE、用户profile或生产数据。

## 91. CITY-CAPACITY-1：固定地图据点扩容计划与新会话交接

- **用户范围**：最终独立Web代码支持人物／据点／道路／地图扩展；本期先保持384×256解除192据点限制。用户要求代码分析与详细设计后制定开发计划，在新对话实施。本轮只改文档，不开放新城、不改编译／运行保护门。
- **产物**：[扩容计划](city-capacity-expansion-plan.md)为唯一详细任务维护源，包含基线`c3efb05`、已核主链、稳定ID／运行索引／战场分离、结构化道路与位置、动态调度／事件、章节初态、版本／存档／发布合同、C0–C9依赖和逐项验收；§1有可复制的新对话启动请求。
- **进度边界**：已完成主链代码调查，不是所有读写者穷尽审计，未重新核原二进制。C0–C9尚未实施；第193城与257城都是后续验收，不是本轮通过。新城显式战场、单城更新频率、不可达结果、事件不静默丢弃是设计方向，具体节奏和行为缺口在C0细化，不擅补规则。
- **交接**：不再重问新增实体还是绑定已有据点；先完成C0，再按依赖让旧192图进入同一新结构，贯通193／257边界和编辑／发布。仍只读的四组素材、已有锁图／布局保持，不重做前轮功能。
- **验证**：四份文档139处本地链接／锚点通过；已审职责、实际diff及代码路径。新计划272行／44个未勾选任务，包含C0–C9，无尾随空白；`git diff --check`通过。纯文档不跑游戏、浏览器、构建或LSP，不将历史成绩算本轮验证。未提交、推送、部署、迁移真实数据或访问SAVE／用户profile。

## 90. 锁图与据点组预览本地提交

- **授权／范围**：用户要求“提交代码”，本地提交收录§87–89连续改动的19个源码／测试／文档／生成文件，包括地图拖动锁定、据点组原证配方、第八分类和四张只读原尺寸预览。不推送、不部署、不迁移真实数据。
- **提交前复验**：九个前端入口83／83、原资源来源22／22；`build.mjs --check`核JS1190233B／CSS151272B／13licenses，壳与源码一致。浏览器、独立Vue及宿主LSP未确认项沿用§89明确批次，不把本次提交当作重跑或clean证明。
- **边界**：据点组仍仅展示，放置／拆散和实体绑定决定未完成；原图及共同编译门未放宽。提交不包含临时截图、profile、运行数据或秘密。

## 89. CITY-GROUP-PREVIEW-1：据点组只读素材展示

- **授权／范围**：用户要求先放进元素资源面板查看，在“据点”按钮后增加“据点组”；本轮只接展示，不等待实体绑定决定、不开放新放置或拆散。保留§87–88未提交改动；没有commit／push／部署／真实迁移授权。
- **实现**：[据点组合同§1.1](map-city-group-contract.md#readonly-library)维护现行边界。`mapcanvas.js`私有加载四套配方、投影尺寸和只读DTO，完整原子身份匹配后才预览；源定义／放置计划不混入组预览，直接放置拒绝。`BaseMapPanel`在据点后插入第八TAB，保持两行4＋4和260px右栏；据点组两列、每格16px，80×80／48×48／48×16／16×48，不缩小或拉伸；名称和完整组ID换行。原240单格三列32px及79可放不变，浏览不写地图，锁图及旧组合保留。
- **单元／原证**：九个显式前端入口83／83通过；新增四组尺寸／逐格drawImage、DPR1／1.25／2、DTO隔离、缺定义、同名源定义不授予能力、无幽灵／无stage／直接拒绝。末审补全缓存目录的DTO复制与变异负控，未让展示DTO污染私有目录。原来源回归22／22重新通过，未修改原配方或规则。
- **浏览器**：最终fresh DPR2、DPR1完整夹具均PASS，四组逐像素对比登记春季PNG、尺寸／后备像素／不平滑、完整ID／两列／无横滚、Enter／Space／拖动零dirty及零额外保存；模板和作者游戏均覆盖。原240单格、锁图、取消／层锁、菜单五动作／undo、异常提示、JSON保存重读、四视口导航释放宽度及非地图页隔离继续通过，console／pageerror／请求失败／意外API为空。地图几何保持§85：1024×600展开550×455／折叠676×455，1440×900为940×755／1092×755，1600×1000为1100×855／1252×855，900×700为426×555／552×555。API为隔离内存夹具，不冒充真实HTTPS。
- **构建／诊断**：最终build→check为JS1190233B／CSS151272B／13licenses；独立Vue32SFC通过、BaseMapPanel零诊断，Chapters旧TS6133 hint保留。主动LSP五路径未确认（1timeout、4push-only），mode=all六条复杂度建议／六文件未完整，不称全clean。最终双DPR曾合并调用耗尽240秒工具预算：DPR2已PASS，未把DPR1算通过；确认无残留该测试Node进程后，DPR1独立fresh重跑完整通过，未改产品超时或跳过断言。四个变更JS／MJS语法、42处新增／修改本地文档链接与锚点、实际diff及空白检查通过。
- **截图／边界**：最终DPR2截图`C:/Users/fczll/AppData/Local/Temp/dragon-map-compact-7T8rrm/`，DPR1为`dragon-map-compact-qtNgQU/`；`city-groups-wide.png`与`city-groups-game-narrow.png`展示实际面板，不是离线拼图；最终DPR1宽屏截图已读取复核。未重跑实际HTTPS／发布／玩家长链或无关规则／存档；共同核心／玩家源码未改，不重建Trial，未访问真实SAVE或用户profile。

## 88. CITY-GROUP-1：四套配方与放置接缝待确认

- **授权／范围**：用户确认四种通用据点组，25／9／3／3格、中心锚点、关卡中间城楼＋两门最终3格，按16px组合尺寸预览，要求开始实施。开始时保留§87八个未提交文件，没有提交／推送／部署或真实数据迁移授权。
- **已完成**：新增`editor-ui/src/mapcitygroups.json`四套完整矩阵／门位置／适用类型／中心锚点及原图见证；从原MAP、官方SINARIO及原MDL核对，不从截图猜byte。设计维护源为[据点组合同](map-city-group-contract.md)，原证唯一维护源为[准入接续](re-notes-editor-map-admission.md#city-group-template-sources)。完整原图匹配数12／18／5／4；战场共享3×3是用户Web决定，不伪称四门type4原图见证。
- **验证**：`python -B -X utf8 tools/verify_map_city_sprite_sources.py`22／22通过（原19项＋新增三项）；完整图样80×80／48×48／48×16／16×48逐格比较原MDL解码索引，未缩为32px。离线四张PNG及绑定源／工具SHA的receipt位于临时目录`C:/Users/fczll/AppData/Local/Temp/dragon-city-groups-hvpke97l/`，均已打开核对；它们不是工作台截图。`build.mjs --check`通过，现有壳仍JS1187425B／CSS150907B／13licenses，未更改其产物。主动LSP两路径1clean／1push-only未确认，mode=all有旧复杂度提示及未完整覆盖，不称全clean。五处新增文档／配方证据链接与锚点检查通过；实际diff审阅及空白检查通过，原道路原证锚点保持指向原章节。
- **接缝／待答复**：已核`trialcompile.js`固定192槽／原坐标／CB..D3节点扫描、道路绑定及章节raw邻接，模板保存也经该门。已向用户询问拖入后“新建独立据点、随后填写资料”还是“绑定／替换已有据点外形”；前者不能擅增运行槽或战场，后者不能自动猜绑定目标／移城／删路策略。待选择后继续所需的跨层放置、拆散、受限保存与完整编译验证。
- **未完成／跳过**：尚未把新配方导入工作台或开放拖放／拆散，不宣称功能完成；独立配方不产生GameSource写入，未修改共同核心、真实模板或已有地图。未跑浏览器／HTTPS／发布／游戏回归，因为对应实现尚未进行；未改玩家源码，不重建Trial。原锁图及其它未提交改动保留，未访问SAVE／用户profile。

## 87. MAP-PAN-LOCK-1：地图拖动锁定切换

- **授权／范围**：用户指出锁图按钮未生效，明确要求锁定／解锁切换、锁后地图不能拖动，作为后续对象操作基础。开工`fdb9d67`、工作区干净；本轮只改展示层指针处理及按钮，不改对象能力／规则／源结构，没有新增commit／push／部署授权。
- **实现**：详细合同见[§2.5](map-atomic-catalog-contract.md#map-pan-lock)。`BaseMapPanel`增加本地`panLocked`，默认解锁、开闭锁图标／aria-pressed／提示同步；切换清除进行中的地图手势。移动阈值照常记录，锁后拖动松手不误拾取新格；仅阻止pan，选取、右键、缩放、素材放置和图层工具保留原能力／权限。保存重读和布局变化不清锁；不写地图内容或本机持久存储，不产生dirty／undo。
- **浏览器**：fresh DPR2、DPR1各完整通过。新增共用`verifyMapPanLock`在真实登记模板与作者游戏各执行：100%下未锁拖动确实改变Canvas像素、锁后拖动像素完全不变（含不误选松手格）、连续两轮切换及图标、Enter／空格解锁、进行中PointerCapture手势经键盘锁定取消、解锁不续旧手势、新拖动恢复。锁时选取／菜单、工具及滚轮缩放继续可用；模板及游戏锁着放置／保存重读，模板另核五菜单动作／undo／浮栏与四视口导航变化仍保持锁。纯切换和视图操作零额外写入／dirty，实际编辑仍仅原单格命令。原240像素／懒加载／ID、错误提示、隔离保存及四尺寸紧凑布局回归通过，console／pageerror／请求失败为空。API为内存夹具，不冒实际HTTPS或生产。
- **检查**：9个前端入口82／82；build→check核JS1187425B／CSS150907B／13licenses。独立Vue32SFC通过，BaseMapPanel零诊断，Chapters旧TS6133 hint保留。主动LSP三路径均未确认（1timeout、2push-only）；mode=all两条旧复杂度建议、1pending／6未完整，不称clean。两个变更MJS语法、9处新增／修改本地链接锚点及实际diff／空白检查通过。
- **边界／回流**：全局项目说明和详细合同已撤销当前“顶部锁图待明确／禁用”，§84–86保留当批历史；对象锁和八项组合变换依旧禁用。仅UI改动，本轮未重跑实际HTTPS发布／同引擎长链或无关战斗／存档，未改Trial核心、不重建其包；保留现有生成物身份。未访问真实SAVE／用户profile，未提交部署。

## 86. 地图工作台布局与操作本地提交

- **授权／范围**：用户确认当前效果并要求提交代码。本节所在提交收录§84–85连续改造的27个源码／测试／文档／生成文件，包括右键调序、浮动图层、紧凑布局、素材懒加载、100%和按钮左／提示右对齐；不推送、不部署、不迁移真实数据。
- **提交前复验**：9个前端入口82／82；`build.mjs --check`核JS1187066B／CSS150907B／13licenses；trialweb重建核243文件、SHA `bb1ca433a3352d4e9c01d82926d05887f85dc9e9642b8b1e18e2981334529ee7`且`unchanged=true`，两个游戏壳未变。实际diff、暂存范围与空白检查用于提交审核，不提交profile、缓存、运行数据或临时截图。
- **验证边界**：浏览器、独立Vue、共同命令和实际HTTPS分别保留§84–85明确批次收据，本次提交不重复长链；宿主LSP未确认仍保留，不因commit或构建通过称clean。顶部锁图、对象锁与八项组合变换维持已说明的禁用状态，不新增能力。

## 85. MAP-SPACE-5：紧凑布局与原始比例

- **范围／授权**：用户多次标注截图要求把顶部／右侧空白还给地图，明确工具后同行显示状态、删除长说明、右栏固定、导航折叠全宽给地图、地图与素材栏底对齐；追加浮动图层图标无框／方形／悬停边框，以及放大和缩小间的100%按钮。只改展示布局及调用既有缩放动作，保留§84全部未提交修改；没有commit／push／部署／真实迁移授权。
- **实现**：现行维护源[合同§2.4](map-atomic-catalog-contract.md#compact-map-layout)。`BaseMapPanel`两列两行Grid，右栏260px跨两行；状态移回工具按钮后同行且保留错误显示，删除`seaGroundPending`常驻长说明但不改控制器暂存／保存语义；`Workbench/theme`紧凑壳只对地图页生效。素材仍32px，浮栏九个图标32px方形text按钮，正常透明边框、hover／focus默认边色。100%用既有zoom倍率恢复1，16px格／视野中心不变；无新增规则或持久字段。
- **布局实测（CSS px，DPR1／2一致）**：1024×600地图展开550×455／折叠676×455；1440×900为940×755／1092×755；1600×1000为1100×855／1252×855；900×700为426×555／552×555。上边缘均137，底边分别592／892／992／692，与素材栏完全齐平；右栏各次260宽且位置不因导航变化。宽屏导航释放152px、窄屏126px全给地图，不用缩图或拉伸冒充可视窗口扩大。
- **浏览器验证**：最终fresh DPR1、DPR2各PASS，真实登记源／PNG、内存API，不是实际HTTPS或生产。新增逐视口顶部／底部／右边距与状态同行可见、右栏固定、导航释放宽度、三列32px与默认按钮字形不裁切；仅按钮组窄屏横滚。100%从低于及高于1的倍率恢复、实际Canvas选中格stroke为16 CSS px、中心对象相同；浮栏九按钮32×32／静止透明边框／悬停边框及拖动／方向键仍通过。原240张春季像素、七类懒加载、取消／锁层／菜单调序／删除／undo、一次异常零写入提示、JSON保存重读／旧组合不变／作者游戏隔离继续通过；切离地图页核原76px头和16／24px主区内边距恢复。console／pageerror／失败请求／未预期API均为空。
- **截图复核**：独占临时目录DPR1 `C:/Users/fczll/AppData/Local/Temp/dragon-map-compact-FQQuA1/`，DPR2 `C:/Users/fczll/AppData/Local/Temp/dragon-map-compact-6g4Liw/`；已读宽屏默认位置和窄屏折叠截图。第一轮发现窄屏状态会随整个工具行滚出视口，已改为只滚按钮组，最终双DPR新增边界断言通过。截图／profile不提交。
- **构建／检查**：9个显式前端入口82／82；build→check为JS1187066B／CSS150890B／13licenses。独立Vue32SFC通过，两个变更SFC零诊断，Chapters旧TS6133 hint保留。主动LSP5路径均未确认（3timeout、2push-only）；mode=all两条既有复杂度建议、6文件未完整，不称clean。两个变更MJS语法、五份本轮文档中15处新增／修改本地链接锚点及`git diff --check`通过。
- **验证边界**：本轮未改共同命令、编译、发布、源或规则核心，未重跑§84实际HTTPS／SQLite／同加载器长链、物化及无关战斗／存档；既有trialweb保持§84产物，不伪称本轮新重建。仅本地改动未提交部署；顶部锁图及八项组合变换／对象锁继续保持原明确禁用范围，不属于本轮新增能力。

### §85追加：工具左对齐、提示右对齐

- 用户后续截图明确按钮组移到地图左边缘、提示保持同行右对齐。仅将`BaseMapPanel`的auto间距从按钮组移到状态并设置文字右对齐；素材栏、地图宽高与100%行为不变。浏览器新增两端对齐及文字方向断言。
- build→check：JS1187066B／CSS150907B／13licenses；fresh DPR1完整夹具及四视口／导航折叠／作者地图验证通过，地图几何与上表相同。截图`C:/Users/fczll/AppData/Local/Temp/dragon-map-compact-RmKM8i/wide-default.png`已读取复核。独立Vue32SFC通过（BaseMapPanel零诊断、Chapters旧hint）；主动宿主LSP两路径未确认（timeout／push-only各1），不称clean。纯对齐未重复DPR2、82单元或完整HTTPS；沿用原范围边界，不提交部署。

## 84. MAP-SPACE-4：地图优先布局与对象右键菜单

- **授权／范围**：用户提供布局截图，要求尽量留地图空间、提示合入标题下、两字按钮／锁图图标、两行分类TAB、32px图样下ID和无分页懒加载、中栏改可拖浮层、选中对象右键操作；追加导航折叠时地图自适应，并要求按此实施。开工HEAD为`a7237ca`、工作区干净；本轮无commit／push／部署／真实迁移授权。
- **实现与限制**：详细维护源[合同§2.3](map-atomic-catalog-contract.md#map-space-layout)。七类4＋3两行，不擅自新增“其它”；素材每批24项内部追加，原79可放／161只读不变。浮层默认地图左下角、拖动／方向键移动并在缩放布局时限制边界；导航折叠释放宽度给地图，保缩放及世界中心。类型／坐标／完整ID右键菜单开放装饰层内置顶／下移／上移／置底和删除；其余八项与对象锁禁用，顶部锁图范围待明确，不称可用。
- **共同命令**：`reorderDecorations`和`copyprofile`仅扩direction为`top`／`bottom`，稳定分区保持各组相对次序，一命令／一次undo，不循环发大量相邻命令。原±1和严格字段、预算、层锁、身份、保存重读、失败原子性不变。未改道路／据点／地理配方、RNG或原资源。
- **调试与纠偏**：浏览器发现默认ElCard过渡会动画化绝对坐标，导致拖动／键盘位移漂移；改由外层布局容器持位置，保Element Plus默认皮肤，再完整双DPR通过。截图复核发现原undo清空后仍显示未保存，已补正确提示和单测；提示合并的末审又补`run()`错误经纯显示status端口进入地图提示，浏览器注入一次ID分配失败证明确实可见且零写入，没有屏蔽异常。
- **单元／服务**：9个前端入口82／82；`verify_editor_component_tools`185项、36失败／不变控制、5850拾取等值及3891框选等值检查通过，新增31种非空选择×双端点稳定调序。`verify_copy_map_ops`8／8（131.909秒），含真实内存SQLite端点持久化／JSON、非法方向及失败批次零写入、预演与受限writer一致。
- **浏览器**：最终fresh DPR2、DPR1分别通过240张春季真实PNG逐像素／32px、ID、两行分类／懒加载／切类回顶／无tooltip、无季节与旧导航、锁层／取消／拖放／撤销／JSON保存重读／作者隔离；新增宽屏导航折叠152px全部交给地图且中心选中对象相同、浮层Pointer／键盘与四视口边界、右键五动作及undo、九禁用按钮、Shift+F10／Esc、真实异常提示零写入。视口1024×600、1440×900、1600×1000、900×700整页不滚；API为内存夹具。最终DPR1截图在独占临时目录`C:/Users/fczll/AppData/Local/Temp/dragon-map-space-HNBDgM/`，不提交截图或profile。
- **真实全链**：最终`verify_copy_http_roundtrip --browser`626.836秒PASS，隔离HTTPS／SQLite／FileBucket、新profile，无API mock；240春季像素、模板放置／撤销／保存重读、右键置底／置顶各一命令持久化、两种浏览器创建、copy编辑后旧票拒／重验／提交／批准、同`loadPlayerPack→createPlayerEnvironment→prepareScenario`地形和192节点／据点、两尺寸发布小地图PNG逐像素、旧游戏和其它副本隔离。该最终轮包含末次状态端口更正，不沿用§80历史结果代替。
- **构建／检查**：build→check核JS1185355B／CSS149824B／13licenses；重建trialweb含243文件，SHA `bb1ca433a3352d4e9c01d82926d05887f85dc9e9642b8b1e18e2981334529ee7`。独立Vue32SFC通过，三个变更SFC零诊断，Chapters旧TS6133 hint保留。主动LSP16路径4确认／11push-only未确认／client.txt不支持；`mode=all`保留2条复杂度建议、6文件未完整，不称全clean。11个变更JS／MJS及文本入口client的module语法检查、17处新增／修改本地链接锚点与diff空白检查通过，不因txt无LSP跳过语法。
- **交付边界**：本地改动未提交；顶部锁图是明确待确认项，其余独立工作已验证。没有生产操作、真实数据迁移、SAVE／用户profile访问；未重复无关战斗、存档、schema／purge或原始资源逆向审计。默认分页例外只适用于地图素材库；旧文档顶部已标现态，旧批次分页／中栏收据保持历史范围。

## 83. 海底与原子素材库本地提交

- **授权／范围**：用户要求「提交代码」，仅本地commit，不push。本节所在提交收录§78文档整理及§79–82连续地图改造：全幅底图与地面轮廓、单格七类库、32px预览、固定春季与中立据点展示，共40个源码／测试／文档／生成物文件。保留旧地图和原资源身份，不包含运行数据、profile、缓存或临时报告。
- **提交前复验**：9个前端入口82／82，`verify_map_sea_ground.mjs`通过；编辑器`build.mjs --check`核JS1197839B／CSS149053B／13licenses；引擎包重建核243文件、SHA `a80c9a6cc326e674065777eba28b025285b51fbf142cf1d265e7acd8784e45b6`，`unchanged=true`，两个游戏壳也未变化。
- **检查边界**：实际diff、暂存清单／文本类型／秘密特征及diff空白检查用于提交审核；浏览器、原证、Vue与完整HTTPS分别沿用§79–82明确批次的收据，本次不重复长链。宿主LSP未确认仍按§82保留，不因commit或构建成功改称clean。无远端推送、部署或真实数据迁移。

## 82. ATOMIC-SPRING-NEUTRAL-3：固定春季与中立据点素材

- **范围**：用户要求移除四季选择，地图／素材固定春季、编辑布局自动供四季使用；据点库只显示中立外观，所属配色由游戏动态决定。仅展示与工作台动作投影，不新增配色或道路／据点放置能力；旧定义、实例和256原子身份全部保留。未授权提交／推送／部署／真实数据迁移，保留此前全部改动。
- **实现**：`BaseMapPanel.vue`去四季Tabs／样式；`basemapworkbench.js`及`gamemapworkbench.js`移除公开season动作，私有loader保持春季默认。`mapatomiccatalog.js`只过滤6个所属色中心与10个玩家色边角，默认库240卡／79可放／161只读，据点30卡全只读；底层`catalogAtoms`仍256。测试helper改按原ID定位，不把过滤后的数组下标当byte。详细用户合同与过滤集合见[合同§2.2](map-atomic-catalog-contract.md#spring-neutral-library)。
- **原证复核**：只读固定KI／MDL／MAP／官方SINARIO，重核`89F0..8AEA`完整窗及`8A3F..8A74`、`8AD1..8AE9`指令，中心中立+2／玩家+0／其它+1和十对部件选择与既有原证一致；`verify_map_city_sprite_sources.py`19／19通过。没有DOS执行、SAVE或用户profile访问，不以截图颜色证明所属；222..231是中立与非玩家共用，不称中立专属。
- **单元与构建**：9个前端入口82／82通过，新增中立过滤但原身份保留、模板与游戏固定春季动作边界，以及一条放置命令JSON往返后四季同坐标／同byte绘制且源不变。build→check一致：JS1197839B／CSS149053B／13licenses；9个本轮JS／MJS语法通过。
- **浏览器**：fresh DPR2、DPR1分别完整通过240张春季卡的实际PNG逐像素／32px预览与分页、无季节控件／悬停／旧导航、中立据点只读；模板与作者游戏仅请求spring，保存仍保留全部四季描述符。保留拖放／键盘取消／锁／一次undo／JSON保存重读／旧实例组不变／作者隔离，四视口1024×600、1440×900、1600×1000、900×700整页不滚。真实登记源与图集，API为内存夹具，非生产／实际HTTPS证明。
- **诊断**：独立Vue LS32SFC通过，BaseMapPanel零诊断、Chapters既有TS6133 hint保留。主动宿主LSP10路径均未确认（1超时／9push-only），`mode=all`9条复杂度建议、1pending／6未完整，不称clean；未为了建议扩大业务重构。
- **验证边界**：本轮展示与动作收敛不改共同编译／规则／资源。实际HTTPS浏览器helper已适配240卡／固定春季，但未重跑§80完整HTTPS／发布／同加载器或共同物化；历史收据不冒成本轮新结果。未重建未改的Trial核心，未跑无关战斗／存档或部署。本轮实际diff、语法与`git diff --check`通过；当前合同及其它文档顶部现态已同步，§80–81的256卡／季节切换收据保留历史范围。

## 81. ATOMIC-PREVIEW-2：分类更正、植被核对与32px预览

- **范围**：用户以六张截图要求蓝水岸边归水系、水系第一张回地面，核对疑似缺失的植被图样，并把右侧16×16预览放大到32×32。仅展示分类／缩略图；地图格、幽灵、规则、准入及持久数据不变。保留全部先前未提交改动，无commit／push／部署授权。
- **核对与改动**：框选卡逐像素对应7／14／15／21／22／23／24／25及6；固定原MDL全部256个128B解码等于春季图集索引。按用户视觉分类决定更正100项水系，地面余20项，冠点／植被图样原已存在，如今默认第一页全部可见，无需补造或重导入。6、168及176..179等仍只读，不因外观开放规则。详细映射与证据边界唯一维护于[合同§2.1](map-atomic-catalog-contract.md#presentation-correction)。
- **实现**：`mapatomiccatalog.js`固定分类表；`mapcanvas.js`仅缩略图每格32CSSpx并关闭平滑，地图／放置16px不改；`BaseMapPanel.vue`初始画布32×32。同步`map_atomic_browser_helpers.mjs`逐原像素及每个放大子像素验证，私有组合缩略图也按每格32px绘制，孔洞及地图幽灵保持原形。
- **单元与构建**：9个前端入口79／79通过，含20地面／100水系／用户框选项、79可放、原子32px预览但16px单格命令、四季与DPR1／1.25／2、组合孔洞和取消。build后check通过：JS1198484B、CSS149131B、13licenses；5个变更JS／MJS语法检查通过。
- **浏览器**：全新隔离profile的DPR2、DPR1分别完整通过全部256卡×四季再回春，每卡32CSSpx／32×DPR后备、每个原像素精确扩成2×2 CSS纯色块、分页／无悬停／七分类；锁层／取消／拖放／一次undo／JSON保存重读、旧组合不变、作者游戏隔离，以及1024×600／1440×900／1600×1000／900×700无页面溢出。真实登记源与PNG，API为内存夹具，不能冒充真实HTTPS／生产结果。
- **诊断**：独立Vue LS全部32SFC检查通过，BaseMapPanel零诊断，Chapters保留既有TS6133提示；宿主主动LSP6路径均未确认（1超时、5push-only），不称clean。`mode=all`8条复杂度建议（mapcanvas4／basemap3／mapatomiccatalog1）、2pending、3未完整，不扩大为本轮业务重构。
- **验证边界**：本轮只改展示，未重跑§80真实HTTPS／发布／同加载器、共同物化或无关战斗存档；§80完整后端收据保留为历史，不当本轮新结果。共同核心／原资源没有新改动，未重建Trial。3个文档75处本地链接／锚点、实际diff及`git diff --check`核对通过。

## 80. ATOMIC-CATALOG-1：单格素材库与单层分类

- **授权／范围**：用户要求所有素材16×16原子化，取消组合卡、一级层分类与各库导航，仅剩末级分类；追加水路／桥梁归道路、底图自然露出及去掉素材悬停，最后明确继续完成。详细维护源[单格库合同](map-atomic-catalog-contract.md)。不是拆除现有地图实例，也不授权新道路／据点／配色规则；保留此前全部本地改动，无提交／推送／部署或真实数据迁移。
- **实现**：`mapatomiccatalog.js`逐byte投影256卡／七类，复用严格原子身份；79既有支持byte可放、177只读，72／190仍未知且独立。`mapcanvas.js`默认不注入组合，私有planner与共同能力保留；`BaseMapPanel.vue`只剩末级分类／分页，去Tooltip、历史／作者／高级／组合导航，底图名称和提示统一。四层眼睛／锁、片段手动拆分及保存／取消守卫保留，浏览不改旧组合或定义。
- **回归更新**：`map_atomic_browser_helpers.mjs`共用全卡原像素／分类／分页验证；`verify_copy_atomic_browser.mjs`替换旧浏览器组合样板流程，非浏览器HTTP链保持。物化入口显式注入旧配方，避免误以为当前库仍默认组合。补默认Canvas恰256单格、全路桥byte归道路、缺失／篡改身份及无悬停绑定断言。
- **已跑单元／共同核心**：9个前端入口最终77/77；`verify_map_sea_ground`通过；`verify_map_sprite_materialization`105.203秒通过10物化／17只读、JSON、完整身份／预算、旧源启用／撤销／保存重读。此物化lane为真实共同函数＋内存传输，不冒HTTPS；旧组合能力没有因移除默认卡被删除。
- **浏览器**：fresh DPR2与DPR1各通过全部256卡、春夏秋冬再回春、真实登记PNG逐像素RGBA、16CSSpx／DPR、七类／当前页／无悬停、键盘取消／换类取消／锁层、拖放／一次undo／保存重读、旧定义／实例组不变和作者游戏隔离；各核1024×600、1440×900、1600×1000、900×700整页不滚。API为内存夹具。前两次失败是作者夹具刷新后未加载／选择游戏，改夹具流程后完整重跑通过，没有改产品权限或屏蔽请求错误。
- **实际持久化／同引擎**：`verify_copy_http_roundtrip --browser`最终517.547秒PASS，独立HTTPS／SQLite／FileBucket、新profile、无API mock。256春季预览；模板112与0单格放置／撤销／保存重读；两浏览器创建取最新模板；copy再放0令旧检验票失效，重新检验／提交／批准；同`loadPlayerPack→createPlayerEnvironment→prepareScenario`读取改后地形，192节点／据点及两尺寸发布小地图PNG逐像素通过。旧游戏、模板与另一个新游戏互不改写。不是公网部署、全战役或全部256种图块逐一发布认证。
- **构建／诊断**：build→check一致，JS1198358B／CSS149131B／13许可；独立Vue LS32SFC通过，BaseMapPanel零诊断、Chapters原TS6133 hint。主动宿主LSP10路径：4确认／6push-only未确认；modeall仍有basemap3复杂度提示、1pending与2检查未完整，不能称全clean。9个本轮JS／MJS语法、50处新增／修改本地文档链接与锚点、`git diff --check`通过。原资源、v41目录和共同规则本轮未改，不另造原证／Trial产物；§79的既有Trial重建保留其批次身份。
- **交付边界**：本轮请求已完成本地实现和适用验证。真实持久数据未自动迁移，现有地图组合不自动拆除；任意新拓扑、据点组合／配色、部署及生产操作仍需另行任务。文档用本合同覆盖旧导航／Tooltip现态，历史收据不改写。

## 79. SEA-GROUND-1：全幅海域基底与地面轮廓

- **授权与产品合同**：用户确认全图95海域基底；取消手工地理及单格／范围填海；仅地面构成小地图陆地，其他装饰不参与轮廓；一级固定基底／装饰／道路／据点，二级分类独立。详细维护源为[新合同](map-sea-ground-contract.md)，属于Web决定，不是新KI机制。保留§78用户文档改动，不提交／推送／部署或访问真实SAVE/profile。
- **实现**：共同`mapground/maplayers/componenttools/mapcommands`持有显式policy、地面贡献及捕获／拆分语义；服务接一条工作区启用命令，冻结history不放宽。新模板首次建立启用；旧可编辑地图只本地暂存、可撤销、保存才写入，保留原覆盖物及作者已知基底内容。控制器、Canvas、BaseMapPanel与稳定一级归属同步；v41原188目录身份和能力不改，另显示1张只读海底卡。玩家规则引擎无需另造加载路径。
- **调试纠偏**：旧测试仍寻找填海／水域按钮、删除后unknown和7分类，按新合同更新；控制器合成夹具补显式policy，原70测试保留权限／取消／错误保护覆盖。真实浏览器先遇ElementPlus隐藏原生checkbox、相册卡片未滚入可视区及漏改旧水域TAB；改为可见label、显式scrollIntoView与新装饰操作，未放宽产品权限或跳过错误。实际diff复查发现「地面＋水系」混合捕获先计算默认mask再设置水域身份会丢陆地；新增负控先失败，再调整赋值顺序，捕获／放置／拆分通过。
- **已跑回归**：`verify_map_sea_ground`通过；7个前端入口最终70/70；`verify_map_sprite_materialization`最终10物化／17只读、controller启用／撤销／重读通过（101.142秒）；`verify_system_base_map_store`通过，首次新模板摘要`a4c549e620b9391f2aa24dec1a7fe6e6778bb79a39fc08d5cf199a5477e1479d`。旧base-geography＋copy-map-ops 13/13，旧minimap、conversion（原20章及全输出保真）、冻结base-fill 6组／decoration-placement 8组均通过。
- **浏览器与实际运行链**：`verify_system_base_map_browser`fresh DPR2通过，最终构建再以DPR1通过；各覆盖1600×1000／900×700、188目录卡、四季、四一级TAB、海底蓝色不透明像素、无旧工具、素材／dirty／角色／游戏隔离；API为内存夹具。`verify_copy_http_roundtrip --browser`实际隔离HTTPS／SQLite／FileBucket完整通过589.763秒，无API mock：保存重读、两种创建、copy编辑、票据失效／重验／审核、`loadPlayerPack→createPlayerEnvironment→prepareScenario`读取改后字节；两尺寸发布小地图PNG逐像素等于地面轮廓＋道路结果。该完整HTTPS轮后仅有混合水域捕获顺序修复和撤销后状态提示更正，受影响部分由上述专项、70单测、物化与最终DPR1补验，未把完整HTTPS冒称又重跑一遍。公共网络分发、完整战役与任意地图可玩性不在此收据内。
- **构建／诊断**：最终build→check一致，JS1215486B／CSS149265B／13许可；重建trialweb 243文件，SHA `a80c9a6cc326e674065777eba28b025285b51fbf142cf1d265e7acd8784e45b6`。独立Vue LS全32SFC通过，BaseMapPanel零诊断，Chapters既有TS6133 hint保留。主动宿主LSP 21路径：7确认、14未确认（1timeout／13push-only）；modeall保留basemap的3项复杂度提示、2文件待完成，不称全clean。收尾20个JS／MJS语法、38处新增／修改本地文档链接／锚点及`git diff --check`通过。
- **交付边界**：本地实施已完成，尚未部署或迁移真实数据；用户实际视觉偏好可继续反馈。旧持久地图第一次打开会有明确未保存启用预览，并非GET暗写；已发布版本与用户存档不会被本次本地工作改动。

## 78. Project memory与journal精简（历史批次）

- **范围**：只改仓库`AGENTS.md`与本页。开工核HEAD和本地`github/main`均为`664819d`、工作区干净；不修改产品、测试、资源、全局约定或历史归档。
- **分工**：memory保留长期架构、数据／权限边界、常用命令、UI约定与当前主线；从本次已验证实施中提炼目录身份／私有计划／组批保存、地理边界和离线报告／Windows编码坑点。版本数量、测试成绩、提交号及调试经过放journal，不塞回长期指令。
- **删减**：合并v1–v41重复计数、临时目录／哈希／包尺寸、逐轮“goal继续／仍待”与已解决测试期待；纠正“尚待提交／推送”的过时现态。不把旧失败改写成通过，不将高级保留改写为原机制已知。
- **历史可追溯**：保留§73–77摘要、旧标题与兼容锚点；原逐轮文本可用`git show 664819d:docs/checkpoint-journal.md`恢复，现有设计／原证／审计也保留详细证据，不再复制一份巨型归档。
- **检查结果**：66处本地链接／锚点、80个旧定位保留、实际diff与仅两份文档变更范围核对通过；journal由约82KB减至20KB（约76%）。产品／测试／资源和历史归档无改动。纯文档未重跑构建、游戏、浏览器或LSP；没有提交、推送或部署。

## 77. 第二阶段完整提交审查（用户另行授权）

### 审查与交付

- 用户授权完整审查、一次提交并推送；实际保留45文件：6项目文档、13产品源码、19测试／工具、2构建壳产物、5羽扇图片。没有迁移文件；图片作为产品素材保留，未擅自接运行入口。
- 排除代理会话、`.dragon-analysis/`、`.codegraph/`、依赖、profile和临时报告；没有删除这些本地数据。`AGENTS.md`是项目合同，handoff明确为历史提示词，不当缓存排除。
- 已复核源码、组批／取消／只读能力、测试I/O隔离、文件类型与常见秘密签名；无阻断提交的产品问题。70前端tests、build一致性检查通过，壳字节未变；既有完整功能收据沿用§76，不冒称本轮重跑。
- 创建一个完整提交`664819d`；向GitHub正常快进推送，连同此前设计提交`6e9b10f`送达。实际`ls-remote`与HEAD一致，提交后工作区干净。没有强推、Gitea推送、部署或真实迁移。

### 审查中修复与失败尝试

| 问题 | 处理与结果 |
| --- | --- |
| 新检出缺少忽略的报告父目录 | 修`tools/audit_map_sprite_atoms.py`与`tools/audit_system_base_map.mjs`：允许建父目录，轮次叶目录仍独占；不放宽拒覆盖。Python夹具不再预建父目录，34项回归150.676秒通过；Node实际审计及重复轮次EEXIST／inventory不变通过 |
| 暂存被`index.lock`拒绝 | 核为空、约14分钟未变且无Git进程，复核mtime后仅清理该空锁；未改索引内容或工作区。随后精确45文件白名单暂存／检查／提交成功 |
| 递归扫描耗时 | 全量ignored状态扫描及一次广域搜索超时；改用普通Git状态、明确路径、`check-ignore`和`git grep`完成审查，没有清理目录或改全局策略 |
| 诊断覆盖不完整 | 三个修补工具主动LSP均push-only；modeall五复杂度提示、四UI未完整。不是clean，不以构建成功替代语义检查 |

修补只影响离线工具／回归及journal，未改产品目录或壳。`g02-coast-completion-r2`是修补前工具生成的历史报告，不冒充新脚本收据；工具版本以提交中的文件为准。Node本轮报告保存在忽略目录`system-base-map-commit-review-r1`，不入提交。

## 76. 第二阶段S2局部UI与S0资源盘点

> 本节现为该会话的完成摘要；标题保留旧链接。S0–S6已闭合，不再逐轮重复“未完成”。完整配方／SHA／原图见证维护于[准入说明§2.1a–y](re-notes-editor-map-admission.md#sprite-g02-coast-completion)，逐项要求与版本化收据维护于[审计](map-workspace-sprite-library-audit.md)。

### 实施进展与相关文件

| 阶段 | 交付与相关文件 |
| --- | --- |
| 源盘点／精炼目录 | `mapspritecatalog.json/js`、`audit_map_sprite_atoms.py`、`audit_map_city_sprite_sources.py`、`map_sprite_identity.mjs`；全部256槽原资源／四季／去向，严格身份与视觉相似分开，不删2357旧定义 |
| 工作台／导航 | `BaseMapPanel.vue`、`Workbench.vue`、`WorkspaceIcon.vue`、`theme.css`及两workbench协调器；折叠菜单、单行工具／四季Tabs、紧凑图层、网格／DPR／resize、撤工作台mini但保留玩家与编译资产 |
| 私有计划／编辑动作 | `mapcanvas.js`、`mapspriterecipes.js`、`basemap.js`；原像素／透明空洞／幽灵、Pointer与键盘、取消／锁层／身份守卫、七条既有命令一次预览／撤销，保存重读后完整配方复用 |
| 显式海域 | `mapbasepresets.json`及上述UI／画布；95原纹理周期，单格或1..16矩形走一次base-fill；不补unknown，不自动清覆盖物，不改旧模板 |
| 发布闭环 | `verify_copy_http_roundtrip.mjs --browser`；真实隔离HTTPS／SQLite／文件桶保存重读、两创建、copy复用令旧票失效、重验提交审核、实际pack/environment/scenario加载 |

最终v41共188条：103原子、58既有多格、10可物化四格、17只读配方；66可放、122只读，四类五个原图摆放例。256槽为79普通引用／162只读／1基底／14高级保留／0待整理。高级保留不等于机制认证；72／190仍未知，河湖mask、任意道路连通和移城未开放。

### 关键调试与纠偏

| 问题／失败尝试 | 已确认处理或边界 |
| --- | --- |
| 旧片段被误当自然对象／像素相同即同身份 | 核2357严格身份仍各自独立；按完整配方或受证原子组合提炼，不裁旧块冒ID。72／190只视觉相同，原byte不合并 |
| 原证推翻初始分类 | 撤销3／13／19“纯地表”候选；251不能统一dy=-2；七岸纹误入水系改归ground。回归随原证修正，不用旧绿测试保留错误 |
| 审计共享引用顺序错误 | 223先遇只读曾被误汇总；95参与池形曾触发错误拒绝。明确普通引用／基底优先、保留全部组件引用并加反序负控，逐配方权限不提升 |
| 组批物化／只读绕行风险 | 先证明四原子→捕获→移除临时实例→完整放置的七命令，再接私有计划／画布／真实保存。原子缺失、未知字段、变体或mask不匹配拒绝；只读在分配ID前拒放置 |
| Pointer与布局 | 触摸原生滚动曾抢占Pointer，仅素材预览加touch-action；窄栏分页挤空、状态宽度压零分别修布局。取消／失焦／捕获丢失／resize／换源均有负控 |
| 浏览器／测试假设错误 | 目录扩充后旧条目跨页，改按itemId算页码、显式jumper；隐藏侧栏先切Tab，不force点击。旧数量／返回值／不存在dispose等夹具错误按实际合同修正后重跑 |
| 超时与像素差异 | 合并重任务／双DPR曾超预算，只有完整重跑才记通过；软件2D后端用于确定性像素核对，不外推全部GPU／触屏硬件。UTF-8显式用于Windows文件及子进程，不改全局编码 |
| atlas请求中断 | 增加等待及阶段URL／错误／时序诊断，最后HTTPS完整通过；历史ERR_ABORTED根因仍未闭合，未过滤或宣称修复 |

### 最终验证与覆盖边界

| 验证 | 最终实施收据（不是本轮文档整理重跑） |
| --- | --- |
| 前端／原资源 | 七前端入口70项；原资源34项，最终132.756秒；原MDL／MAP／四季、篡改、反序与256去向覆盖 |
| 既有定义／物化 | 161严格身份、56普通放置及4可放拼例415.596秒；10物化／17只读、预算／末步失败／地理／JSON与真实控制器90.450秒 |
| UI | fresh DPR1／2各1600×1000和900×700，188卡／256槽、四季RGB／孔洞、分页、角色／dirty、取消／撤销／复用；API夹具不代持久化 |
| 真实后端 | 当前构建隔离HTTPS635.755秒通过，无API mock；代表配方及byte0／海域、两创建、票据、审核、玩家同加载器。不是188项逐一发布、公网reader或完整战役 |
| 构建／语义 | build→check及独立Vue32SFC通过，Chapters既有unused hint；未改共同web核心／schema，不重建Trial或虚报schema／purge重跑 |
| 宿主／静态检查 | 主动LSP32路径9确认／23未确认（5timeout18push-only）；最终缓存5复杂度提示／4UI未完整。26源文件语法、166本地链接／锚点、diff／目录与报告绑定检查通过 |

验收时本地未提交；后续提交／推送已在§77完成，不能把两次授权混为部署授权。原资源字节和版本边界见详细审计；原始批次记录可从`664819d`的本文件恢复。

## 75. 地图实测反馈与第二阶段设计交接

历史设计轮只交付[产品设计](map-workspace-sprite-library-design.md)和[接续提示词](map-workspace-sprite-library-handoff.md)，未授权生产操作。六项意见及S0–S6后来由§76实施；提示词已标历史，不再作为当前状态或新授权。

## 74. 全量审查、统一提交与推送

基础地图上一批审查65文件，产品／测试／文档及分级复验见[完成核对](system-base-map-completion-audit.md)；提交`172ffe0`已推送GitHub。当时宿主未确认、历史测试缺口仍保留，不等于部署。不要与§77的45文件提交混用收据。

## 73. 本轮 project memory / journal 整理

历史整理将长期规则归`AGENTS.md`、截至§72详单归[归档](checkpoint-journal-archive-through-72.md)，保留70旧标题／锚点转接；未更改产品。后继精简见§78，不重载旧临时计数或授权。

## 地图会话交接（§59–72汇总）

### 进展与相关文件

基础地图盘点、系统单槽、创建快照、两工作台与同加载器闭环已交付；路径与合同见[基础地图设计](system-base-map-design.md)和[盘点](system-base-map-inventory.md)。

### 关键调试、失败尝试与修正

916道路格水域引用去重、Uint8Array边界解析、工作区新增素材预算与旧冻结门、session缺省version一致性、玩家规范`1.n`兼容等见[原批次归档](checkpoint-journal-archive-through-72.md#72-基础地图最终依赖审计与分级复验)。长期坑点已归AGENTS；未把Web分片认证成DOS对象。

### 最终验证收据与覆盖限制

B0–B7的42项及当时转换／存储／copy／玩家／HTTPS／Vue结果见[完成核对](system-base-map-completion-audit.md)。旧接口夹具、计时器退出、诊断不完整等仍按本页“下一步”保留，不将旧通过外推当前修改。

## 已提交批次摘要

早期copy／删除／默认Element Plus决策见下方归档入口；代码版本查Git，现态看页首，不重复旧包尺寸和临时测试轮次。

## 归档索引与兼容锚点

以下旧定位只转接历史记录，不恢复旧待办或授权。全部批次详见[归档](checkpoint-journal-archive-through-72.md)；无法恢复的更早收据见[缺口索引](historical-receipts.md)。

<!-- markdownlint-disable MD033 -->
<a id="72-基础地图最终依赖审计与分级复验"></a><a id="71-浏览器创建入口与画布编辑验收补齐"></a><a id="70-真实https后端浏览器保存与会话dto修正"></a>
§70–72：[真实后端、浏览器补齐与最终审计](checkpoint-journal-archive-through-72.md#72-基础地图最终依赖审计与分级复验)。
<a id="69-实际地图审批包与玩家加载器接缝"></a><a id="68-游戏地图展示壳接线"></a><a id="67-游戏地图共享编辑会话前置"></a><a id="66-基础地图组合选取与诊断反馈"></a><a id="65-管理员基础地图首版画布与构建壳接线"></a>
§65–69：[两工作台、会话及运行加载器](checkpoint-journal-archive-through-72.md#69-实际地图审批包与玩家加载器接缝)。
<a id="64-基础地图统一创建接线与真实https验证"></a><a id="63-基础地图应用装配固定schema与删除隔离"></a><a id="62-基础地图快照实例化与单槽存储核心"></a><a id="61-基础地图a方案分片与独立候选转换"></a><a id="60-基础地图b0源盘点历史后继见61"></a><a id="59-系统基础地图独立化设计与任务"></a>
§59–64：[盘点、合同与统一创建](checkpoint-journal-archive-through-72.md#64-基础地图统一创建接线与真实https验证)。
<a id="58-全量工作区审查与统一提交"></a><a id="57-本轮-project-memoryjournal-整理"></a><a id="56-检验窗口沿用阻塞弹窗布局"></a><a id="55-完整复制阻塞弹窗布局调整"></a><a id="54-删除弹窗就地进度与文件清理先于库行删除"></a><a id="54-后续用户确认本地测试定向清除历史残留"></a><a id="53-copy主表初始化内置武将覆盖与持久管理员列表"></a>
§53–58：[初始化、删除与历史授权收据](checkpoint-journal-archive-through-72.md#53-copy主表初始化内置武将覆盖与持久管理员列表)。
<a id="52-全量工作区审查与统一提交批次"></a><a id="51-project-memory-与会话日志整理"></a><a id="50-copy头像目录跳过无用旧草稿使用统计"></a><a id="49-共享头像文件及资产id数字重编号"></a><a id="48-头像弹窗等尺寸加载分页按钮右对齐与数字排序"></a><a id="47-武将管理加载性能真实进度固定列宽与局部头像加载"></a>
§47–52：[画像、列表与旧提交](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。
<a id="46-编辑器展示修补与-vue-检查工具本地提交"></a><a id="45-项目级-vue-lsp-standalone-兼容工具2026-11-12"></a><a id="44-武将据点统一分页与操作列头像每页-25-张2026-11-12"></a><a id="43-武将管理固定表头行编辑与懒加载核查2026-11-12"></a><a id="42-据点面板跨模块残留回归修复2026-11-12"></a><a id="41-编辑器统一页中央四圆点加载动画2026-11-12"></a><a id="40-城池据点加载按钮旋转动画2026-11-12"></a><a id="39-城池据点列表固定表头2026-11-12"></a><a id="38-完整本地提交前审查copy发布审核默认展示层与回归"></a>
§38–46：[默认展示层及Vue检查工具](checkpoint-journal-archive-through-72.md#45-项目级-vue-lsp-standalone-兼容工具2026-11-12)。
<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a><a id="36-element-plus-默认主题与默认组件迁移本轮"></a>
§36–37：[Element Plus默认主题/组件决策（tag: architecture）](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)，现行规则在memory§3/布局规范。
<a id="14-批次-j同意上架-422-source_runtime_binding审核页重复提示2026-11-11"></a><a id="15-批次-j-2同意成功却无反馈上架管理仍待审核2026-11-11"></a><a id="34-编辑副本简化收尾删除重试打通冻结基线对齐上架章门恢复2026-11-11"></a><a id="35-游戏级武将管理重写父表库行编辑自杀旗头像相册2026-11-11"></a>
§14–15、34–35：[发布/武将旧批次](checkpoint-journal-archive-through-72.md#34-编辑副本简化收尾删除重试打通冻结基线对齐上架章门恢复2026-11-11)。
<a id="5-当前时钟系统逆向与重构本地完成"></a><a id="8-用户指定五档提速"></a><a id="6-发布主线阻塞与下一步"></a>
时钟与旧阻塞：[原归档索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-014发布整理"></a><a id="10-录像反馈后的战略性能修复"></a><a id="10-录像反馈后的战略性能修复--10-014-发布整理"></a>
表现与发布旧记录：[原归档索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<a id="11-015发布整理"></a><a id="11-编辑器vps部署前只读盘点"></a><a id="11-编辑器vps部署前只读盘点--11-015-发布整理"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署/固定库/Trial：[原归档索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)，非现行生产入口。
<a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="19–23-后台框架壳--账户管理--阶段任务--只读素材库--草稿与章节组件化"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a><a id="30-上架限制与删除追踪组件化--32-固定库身份合同授权修复--33-后台迁移提交推送与受限上线"></a>
早期Vue壳/上线：[原归档索引](checkpoint-journal-archive-through-72.md#19-后台框架壳editor-ui-1)。
<!-- markdownlint-enable MD033 -->
