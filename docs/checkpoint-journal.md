# 检查点日志（checkpoint journal）

> 长期项目记忆：[AGENTS.md](../AGENTS.md)；产品与工程细节以其中链接的合同为维护源。本页只记录当前交接、会话进展、失败、验证、阻塞和下一步，不授予实施／提交／部署权限。
> 历史：[§73–194整理前快照](checkpoint-journal-archive-73-194.md)、[§72及以前](checkpoint-journal-archive-through-72.md)、[更早收据缺口](historical-receipts.md)。归档中的旧待办、授权和运行状态不可当作当前事实；原机制结论仍须回到SKILL／re-notes原证。

## 当前主线与状态

| 工作线 | 当前交接／维护源 |
| --- | --- |
| copy 收敛 | 共享数据、章节、武将、地图、审核已接copy；定义面板余项、旧draft退役与表清理仍待。见[收敛任务](copy-simplification-tasks.md)。 |
| 据点扩容 | 固定384×256；运行支持v2-192／v3-512，193城发布装配链本地验证通过；内置与生产准入仍192。后续人物／地图容量及部署不自动获授权。见[CITY计划](city-capacity-expansion-plan.md)。 |
| 战略事件 | D2-EVENT-64已实现，历史提交`b101dd3`；旧D2-C旁表已退役。后续部署与生产验收须另授权。见[计划§12](d2-event-scheduler-plan.md)。 |
| 地图交互 | §188–194已本地实现：锁图对象拖动、独立组合／拆单格、批删、绑定／解绑、建城弹窗、4096条／16 MiB预算、道路／据点拖动及实时红罩／保存详情。现行语义见[地图合同§2.6–2.7](map-atomic-catalog-contract.md#26-地图交互收尾选位背景与锁图对象操作)，不自动迁移旧数据。 |
| Git／生产 | §196用户授权整批审查、提交并推送`github/main`；审查基点`6330551`，fetch后远端无独有提交，本地另有该文档提交待一并推送。实际提交／推送结果以Git记录及交付回执为准；未授权部署或真实数据迁移。 |

### 当前阻塞与下一步

- **无已知实现阻塞；验证边界仍在**：§194本地回归通过，但宿主LSP部分inconclusive；独立Vue LS通过不能改写宿主结果。实际已登录dev后端手测与生产验收未由自动化覆盖。
- **本地手测交接**：前轮沿用`https://127.0.0.1:8443/`及`.dragon-analysis/basemaps-dev-store`；已核壳字节、health，未带凭据写用户库。此前`localhost`触发LOCAL_HOST拒绝，5173另有实例；使用前重新核实例归属，不停杀／重建他人服务。本轮文档整理未重查运行状态。
- **不再重开旧问题**：§189右键菜单消失、§190锁图fallback与过期测试夹具、§191只解组未拆格、§192容量限制，均有后继修复；旧“未跑／待修／疑似缓存”仅留归档，不是当前待办。用户已确认§192增容正常。
- **后续工作分开授权**：copy余项按收敛任务推进；D2／扩容部署、提交、推送、真实数据操作分别审批。若继续地图回归，按改动选择lane；不把§193大组／四视口的历史通过当成本轮已跑。

## 196. 整批提交前审查与验证

**范围**：用户要求审查全部修改／未跟踪文件，保留产品代码、测试、迁移与必要文档，排除本地代理／运行产物，创建一个完整提交并推送更新。审查清单为36个已跟踪修改＋9个新增文件，包含前几轮地图工作和文档归档；无新增schema迁移。`server/editorapp.js`既有暂存固定源登记兼容分支保留。`tools/editor_local_https.mjs`是已跟踪的运输层源码，其16 MiB修复和回归配套保留，不是临时代理实例；数据库、证书、profile、日志及本地运行目录不纳入。

**审查修正**：`assertMapConnected`单城无路仍拒绝，与旧注释相反；仅纠正注释以符合现行实现，不新增例外或改变规则。生成壳重新build／check，Trial束重新核对；大幅生成物diff来自完整重建，未手改压缩代码。

**本轮验证**：
- 串行8个明确测试文件共59/59通过：basemap、mapcanvas、copy decoration group、map object editing、map position editing、map edit limits、copy city topology、copy map ops。覆盖193城链、地图移动及JSON/raw、组合拆分、预算、HTTP/TLS运输门。
- 工作台现行四lane总命令通过：显隐／列表与删除、基础地图四视口、选择拆散及道路据点红罩／保存拒绝、新城弹窗；fresh浏览器、隔离API／SQLite。首次误将Playwright入口设为CommonJS `index.js`，动态导入未取得chromium而失败；改用已有`index.mjs`后整组重跑通过，未改产品绕过。
- `verify_system_base_map_store`通过；独立Vue LS33 SFC通过，ChaptersPanel仅既有unused提示。宿主主动LSP35文件为2 clean／33 inconclusive；`mode=all`保留mapcanvas嵌套三元warning及3个Vue未确认／deferred，不称全部clean。
- 暂存源登记兼容分支用一次性Node应用＋真实鉴权＋内存SQLite／临时FileBucket核验：陌生registry拒绝且无登记；固定源首次复制请求登记成功，唯一`auto-<digest前24位>`收据，202仅预留、未创建游戏。未触碰用户／生产库。
- 所有变更JS/MJS语法、限定秘密／运行文件扫描、diff检查通过；扫描只覆盖本批文件和明确模式，不宣称完整秘密审计。归档122节完整；初次检查误按升序断言失败，按日志实际倒序复核通过。

**边界**：未重跑`--legacy-draft`、446格`--large`或生产验收；本轮现行默认浏览器和大对象核心测试通过不冒充这些覆盖。未安装依赖、修改全局配置、停杀既有服务或部署。提交／推送采用普通非强制操作，仅`github/main`，不推`origin`。

## 195. Project memory与journal职责整理

**范围**：用户要求清除过期、重复、临时记忆，分离长期项目事实与会话记录；只处理`AGENTS.md`、本页及新历史归档，保留现有产品／测试／生成物修改，不提交或部署。

**整理过程与更正**：
- 完整核读memory和journal；发现页首仍称远端为`b101dd3`、指向§188未完成项，而实际本地HEAD为`6330551`，后继§189–194已修复相关问题；删去这些实时状态假象，不推断远端／生产已更新。
- 将整理前journal保留为`checkpoint-journal-archive-73-194.md`，明确仅历史快照。当前页移除旧阶段日志、重复规则、临时进程／散落构建SHA与被后继推翻的待办；保留本轮道路／据点工作的调试、失败和验证边界。
- `AGENTS.md`维护长期架构、命令、约定、工程坑点及当前主线；地图细则链接到专项合同。纠正删除管理仍归“上架审核视图”的过时描述，补齐独立组合／拆分、预算、移动校验范围与回归入口。
- 首轮全仓链接检查发现3个更早发布／渲染锚点漏接（先前仅扫docs未覆盖其它Markdown）；补齐后按全仓及父级AGENTS／SKILL复核。历史锚点保留仓内引用的转接；归档不重新激活旧goal、审批、Trial接口或旧数据格式。§73–184的早期逐条全文仍按原说明到`git show b101dd3:docs/checkpoint-journal.md`追溯，不能把既有截短摘要称为完整原证。

**验证与交付**：文档职责／事实一致性已核；62个出站链接、33个仓内引用锚点及归档122个编号节（73–194）检查通过，`git diff --check`通过（仅已有CRLF提示）。当前journal从576行／84566字节缩为81行／约12 KiB；不重跑无关游戏、浏览器、构建或LSP。前轮成绩见§194，不冒充本轮执行。没有新的实现阻塞；下一步按上方交接和当前用户授权选择工作。

## 194. 道路／据点拖动：实时红罩、保存时错误详情

**最终授权**：已有道路／据点可拖动；拖放后只显示半透明红罩，不列对象／据点／坐标／原因；修正后解除，保存时仍有问题才列详情并拒绝保存。属于Web产品决定，详细源为[地图合同§2.7](map-atomic-catalog-contract.md#map-position-feedback)。

**实现／相关文件**：
- `web/src/editor/mapobjectmove.js`：平移明确对象，保ID／槽号／邻接；据点同步主表和全部章节具名坐标、已有raw `+08/+0A`及重复表，不猜邻近图块归属、不自动重连。
- `web/src/editor/mappositionvalidation.js`：共用构路／连通、节点覆盖／重叠、扫描序及既有道路认证校验；`mapcommands.js`、`server/copyprofile.js`接受限命令`map-object-translate`。
- `editor-ui/src/{mapcanvas,basemap,basemapworkbench}.js`、`BaseMapPanel.vue`：半透明实体拖动，候选问题格35%红罩；校验模式随未保存移动批次，修正／撤销重算，错误详情只在保存时进入列表。
- `server/{gamecopy,systembasemapstore}.js`：服务端独立复核，拒绝不留写入前缀；保留copy“stamp→bind→admit→接路”中间态分步保存，不加全局拒绝门。模板完整编译门不变。道路／据点Shift成组／批删、越界放置、自动重排槽号不在本批开放范围。

**调试与失败尝试**：
- 初版把位置校验用于所有copy地图保存，会堵住分步建城；审计现有193城流程后改为移动批次门，既有建城回归通过。
- 真实图正例起初只搜横向单路城而找不到样本；原图唯一单路城为纵向，扩为两方向后通过，没有放宽规则。`placement-city-027`从(22,67)移至(22,68)，保存／重读／移回摘要一致；相同移动在完整copy的20章共同编译通过。
- 浏览器首跑180秒超时不计通过；后以240秒预算单跑及最终构建重跑通过。细节历史快照保留，不将超时命令算成功。

**已执行验证（§194实现轮，非本轮文档检查）**：
- 串行47/47：`editor-ui/tests/{basemap,mapcanvas}.test.mjs`＋`tools/verify_{copy_decoration_group,map_object_editing,map_position_editing}.mjs`五个明确文件；补充明确城组成员／邻近非成员断言后定向1/1。覆盖JSON预演／服务一致、透明拖动、只红不列、修复清罩、拒绝保候选、保存重读及坐标raw同步。
- `verify_copy_city_topology`2项（193城链）和`verify_copy_map_ops`8项通过；新专项含真实GameCopyStore内存SQLite的拒绝／原子保存，以及真实192城模板／20章正例。`verify_system_base_map_store`复跑通过，含直接服务端错误详情和快照不变。
- `verify_map_canvas_select_disband_browser`fresh Chromium通过：`road-126`、`placement-city-091`拖放只红罩，保存才列详情且数据库版本不变，撤销清罩，再完成旧组合／拆散／批删保存重读。console/pageerror/失败请求为空；API运输为夹具、持久化为隔离SQLite，不冒称实际HTTPS或生产。未在该轮重跑446格大组、四视口或工作台总入口。
- `verify_entity_fields.py`固定非存档白名单通过（87指令签名及原资源SHA）；不作新机制推断。build＋check、Trial束检查、12个JS/MJS语法、diff检查通过。独立Vue LS33 SFC通过；ChaptersPanel仅既有unused提示。
- 宿主LSP13文件：2 clean／1 findings／10 inconclusive；新校验与专项重探仍inconclusive。`mode=all`仅既有mapcanvas嵌套三元warning及未完成／deferred缓存；不得称全部clean。

**未覆盖／交付**：未带凭据写用户库、未人工停杀既有服务；前轮只读核8443 health和JS/CSS与本地构建一致。无commit/push/deploy。实际登录保存手测、宿主未确认诊断及部署审批仍按页首分别记录。

## 历史定位与兼容锚点

以下只转接历史，不恢复旧状态或授权。无锚点的§73–194按[归档编号](checkpoint-journal-archive-73-194.md)查找；更早见[旧归档](checkpoint-journal-archive-through-72.md)。

<a id="184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push"></a><a id="186-d2-event-64p0p1隔离审计与一次性决策包未实施未push"></a>
§184–187：[旧旁表、审计与绝对位置调度实现](checkpoint-journal-archive-73-194.md#187-d2-event-64p2p5-本地实现d0d8s1-全-a已完成并推送-b101dd3未部署)；现行规则见D2计划，不用旧旁表方案。

<a id="79-sea-ground-1全幅海域基底与地面轮廓"></a><a id="80-atomic-catalog-1单格素材库与单层分类"></a><a id="81-atomic-preview-2分类更正植被核对与32px预览"></a><a id="82-atomic-spring-neutral-3固定春季与中立据点素材"></a>
§79–82：[底图、原子库与春季展示历史](checkpoint-journal-archive-73-194.md#79-sea-ground-1全幅海域基底与地面轮廓)。
<a id="84-map-space-4地图优先布局与对象右键菜单"></a><a id="85-map-space-5紧凑布局与原始比例"></a><a id="87-map-pan-lock-1地图拖动锁定切换"></a><a id="88-city-group-1四套配方与放置接缝待确认"></a><a id="89-city-group-preview-1据点组只读素材展示"></a>
§84–89：[布局、锁图与据点组预览历史](checkpoint-journal-archive-73-194.md#89-city-group-preview-1据点组只读素材展示)；对象拖动以现行地图合同为准。

<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a>
§37：[Element Plus默认主题／组件决策](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)（tag: architecture）。
<a id="49-共享头像文件及资产id数字重编号"></a>
§49：[共享头像数字身份决定](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。
<a id="10-014发布整理"></a><a id="11-015发布整理"></a><a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a>
<a id="5-当前时钟系统逆向与重构本地完成"></a><a id="6-发布主线阻塞与下一步"></a><a id="8-用户指定五档提速"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-录像反馈后的战略性能修复"></a>
时钟与表现：[更早历史索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<a id="11-编辑器vps部署前只读盘点"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署／Trial：[更早历史索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)，不是当前部署身份或恢复接口授权。
<a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a>
早期Vue壳：[原批次及缺口说明](checkpoint-journal-archive-through-72.md#19-后台框架壳editor-ui-1)。
