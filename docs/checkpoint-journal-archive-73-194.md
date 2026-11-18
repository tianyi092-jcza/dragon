# 检查点历史快照：§73–194

> **只作历史证据，不是当前memory或任务清单。** 本文件保存§195整理前的journal（包括当时页首与旧兼容索引），后文的“当前／未完成／授权”均限各原批次。现行交接回[checkpoint-journal.md](checkpoint-journal.md)，长期约定回[AGENTS.md](../AGENTS.md)。已被后继推翻的状态、旧goal、旧进程／SHA不重新生效。
> §73–184在本快照形成前已是截短摘要，完整旧记录须按下述Git来源追溯；§185–194保留整理前详单。本文件不追加新进展。

> 长期架构、命令与约定只维护在 [AGENTS.md](../AGENTS.md)；本页记录当前交接、会话进展、调试、验证与下一步。原机制证据查对应 re-notes，历史通过不替代新变更的验证。§72 以前见[归档](checkpoint-journal-archive-through-72.md)。
>
> 2026-11-17 按 §78 同规则再精简：§73–184 只保留标题与结论一行（锚点不变），细节用 `git show b101dd3:docs/checkpoint-journal.md` 恢复，或见各批次文档/re-notes。新增进展写在最前，不重写历史。

## 当前主线与状态

| 工作线 | 当前交接 |
| --- | --- |
| 战略事件调度 | D2-EVENT-64 本地完成并推送 `b101dd3`（未部署）：64 位置绝对调度表取代 D2-C 旁表，生产者/移页/泵串行/保存恢复全链接入；维护源[D2-EVENT-64 计划](d2-event-scheduler-plan.md)（§12 实现与 V01–V20 映射），边界与调试见下§187 |
| copy 收敛 | 元数据／章节／据点／武将／地图／审核已接 copy；部分定义面板、旧 draft 整体退役与表清理待办，按[收敛任务](copy-simplification-tasks.md)推进 |
| 据点扩容 | 193 城全链（检验→票→提交→批准→正式包→玩家装配）本地通过；运行/道路/财政/存档支持 v2-192 与 v3-512（M192／M193／M257），内置与生产准入仍 192。见[扩容计划](city-capacity-expansion-plan.md) |
| 地图工作台 | ATOMIC-CATALOG-1 单格库＋MAP-SPACE-4 布局＋紧凑底对齐为现行；据点组第八类只读；桥梁/水路并道路；长期约定在 memory §2 |
| 海域／地面 | SEA-GROUND-1：全幅 95 底图、小地图仅地面轮廓＋道路/据点，四层合成保留；见[合同](map-sea-ground-contract.md) |
| 编辑器展示层 | Element Plus 默认主题/组件/size＋繁体 locale，仅 `editor-ui/`；玩家 Canvas 不套此规则（memory §3） |
| 基础地图交互（本轮） | 锁定＝拖选中对象／未锁定＝拖整图／点击切换选中；多选组合/拆散、据点绑定/解绑、保存连通门均为本地实现未提交；复制链只动装配门；详见下§188 |
| Git／生产 | `github/main`=`b101dd3`（D2 实现已推送；本次 journal／memory 整理尚未提交）；`origin`（Gitea）停在 `dd877b3` 未推。生产仍是上一版镜像，未写入、未部署、未迁移真实数据 |

### 未完成、阻塞与下一步

1. **D2-EVENT-64 收尾**：功能与验证已完成（24 条适用 verifier＋两条浏览器 lane 全绿）；剩部署/生产验收需单独授权。已知环境限制：主动 LSP 对 `ai.js` 恒 inconclusive；`verify_war_proposal_browser` 落 retryable 分支不计通过（§187）。
2. **copy 收敛**：部分定义面板、旧 draft 整体退役与表清理，按[收敛任务](copy-simplification-tasks.md)分批；不重开已完成的 copy 链。
3. **据点扩容后继**：人物/地图等容量、生产准入迁移按[CITY-CAPACITY-1](city-capacity-expansion-plan.md)推进；计划不等于部署。
4. **环境注意**：宿主 LSP 不可用或 inconclusive 时不得称 clean；`verify_c15_upstream_replays` 等历史失败不能冒称通过；panel_visibility 已在§190补齐现行夹具并通过。不得为跑绿恢复 Trial 或放宽身份门。

5. **基础地图交互收尾**：§193四项交互之后，§194已接已有道路／据点拖动：实时只红罩、保存才列详情，修复后解除；合规移城真实192城模板＋20章编译、copy/模板SQLite、既有193城分步建城及fresh浏览器通过。宿主LSP仍有未确认项，独立Vue LS通过。现行语义见地图合同§2.6–2.7；不自动迁移历史地图。
6. **用户浏览器实测**：沿用`https://127.0.0.1:8443/`、`.dragon-analysis/basemaps-dev-store`；已核health、JS/CSS响应与本次构建SHA一致、全新profile登录页无错误。未人工重启既有进程、未写真实库；登录后的实际后端编辑保存仍待用户手测，不把API夹具当成该验收。
7. **提交与部署**：本轮所有改动均未提交未推送（shell-ui.txt/trialweb.txt会大churn）；生产部署/删内置游戏另需授权。

## 194. 道路／据点拖动：实时红罩、保存时错误详情

**授权与最终口径**：用户要求已有道路和据点可拖动，并最终明确“拖放后不列对象／据点／坐标／原因，只标半透明红罩；只有保存时才列详情并拒绝保存”。详细维护源为`map-atomic-catalog-contract.md`§2.7，属于Web编辑产品决定，不是原版机制变化。

**实现与边界**：
- 新`map-object-translate`贯通Canvas、共同预演与copy白名单。道路平移点列／明确图块及bounds；据点平移中心和明确城组成员，并同步共享主表、章节具名坐标和已有raw `+08/+0A`／重复表。邻接、身份、槽号不重排，不猜附近图块归属，不自动拉伸或重连道路。
- `mappositionvalidation.js`复用构路／连通规则并检查节点重叠、中心覆盖、扫描序及已认证道路数据。Canvas只以35%红色标记问题格，修正／撤销重新计算；不把位置详情投给实时错误列表。保存复核才列对象ID、据点名称／ID、坐标和原因，拒绝不丢候选、不锁死工作台；服务端独立复核。
- 移动检查模式由控制器按待保存命令传递，清空移动／重读后解除。保留copy原“stamp→bind→admit→接路”中间态分步保存，避免新增全局保存门阻断193城流程。模板原完整编译门仍在。
- 仍不开放道路／据点Shift成组或批删，不跨地图界限安装对象，不自动重编号跨扫描次序的据点；相关问题显示红罩并在保存时解释。没有扩大原子库放置白名单。

**本轮验证**：
- 最终串行核心5文件47/47：basemap11＋Canvas26＋copy组3＋对象编辑2＋新位置编辑5。覆盖前后端JSON一致、原源不变、道路图块／bounds同步、章节raw坐标、拒非法字段／对象／越界、扫描序错误、实体透明预览、只红不列、修复清罩、保存零请求拒绝且保留输入、修复后保存重读；补充城组明确归属／邻近非成员不移动断言后同项定向1/1。
- 新专项使用真实192城模板，支持的`placement-city-027`从(22,67)移到(22,68)，真实SystemBaseMapStore／内存SQLite保存、重读、再移回摘要完全恢复；同次移动安装到真实完整copy后20章共同编译通过。最初正例夹具只搜索横向单路城，原图唯一单路城为纵向，扩为两个方向后通过；没有为夹具放宽规则。
- `verify_copy_city_topology`2项（含193城完整链）及`verify_copy_map_ops`8项通过，证明分步建城与旧模块操作未被移动门堵住；新专项另测真实GameCopyStore／内存SQLite拒坏移动无前缀、修复整批原子保存。`verify_system_base_map_store`最终复跑通过，新增直接服务端坏道路移动422／详细信息／完整快照不变。
- 最终fresh Chromium选择／拆散lane通过：真实`road-126`与`placement-city-091`拖动后只有红罩、保存才出现ID／名称／原因、SQLite版本不变、撤销红罩解除，再继续原组合／拆散／批删保存重读回归；console、pageerror、请求失败为空。运输仍为API夹具，持久化为真实隔离SQLite。首次180秒预算超时不计通过，后以240秒预算单跑通过；最终构建再跑同lane通过。本轮未重跑446格大组、四视口布局或工作台总入口，不借§193成绩冒充本轮执行。
- 原始证据固定白名单`verify_entity_fields.py`通过：87指令签名及原资源SHA、768城／512将记录等；不读SAVE，不作新机制推断。坐标字段和原道路规则沿用原证。
- build＋check通过（JS 1273708B、CSS 151780B），Trial束检查259文件unchanged；12个变更JS/MJS语法检查、`git diff --check`通过（仅CRLF提示）。独立Vue LS33 SFC通过，BaseMapPanel零诊断，ChaptersPanel保留既有unused hint。宿主主动LSP13文件2 clean／1 findings／10 inconclusive；最后重探新校验／专项两个文件仍inconclusive。`mode=all`仅既有mapcanvas嵌套三元warning，并报告Vue未完成／AST deferred及待完成缓存，不称全部clean。

**交付边界**：本轮HEAD仍`6330551`，保留之前全部未提交修改；无commit/push/deploy。沿用8443原库，仅核health与壳字节：JS SHA `41f46eed7de4e4ef6da859e2a7a5a15d729589bf7e946097021baebca625695a`、CSS SHA `36373ca6b4d74780832b187dde8cdbc676dd8cd00f5bbcbc20bf316476cc0d77`与磁盘一致。未人工停杀既有服务、未登录写用户库；实际已登录后端手测仍单列，不把夹具当生产验收。

## 193. 半透明实体拖动、多选批删与独立组合对象

**授权**：用户确认增容正常后要求四项交互改造；明确新组合须真正成为一个新对象、仅保留自己的ID；历史所属组合数据为兼容保留但不显示。截图指定锁图／复制／填充移到缩小之后，右键原最后两钮上移补位。详细维护源为`map-atomic-catalog-contract.md`§2.6；不是原版机制或生产迁移。

**实现**：
- `mapcanvas.js`拖动时以私有显示投影移除原位选中装饰，50%透明度绘制移动实体，单片段／历史组／多选均支持；保持鼠标抓取偏移，不再跳到组合左上角。落定才提交位移＋置顶，一次撤销；取消／Esc／失去捕获恢复。顶层picker保持唯一点选，批删仅收集所选ID。
- 新`decoration-combine`贯通共同预演与copy服务白名单／身份账本：按格展开所选配方，合为一个随机ID装饰及内部配方，不新增selectionGroups或成员归属属性；历史组引用清理。保留专用组拒绝、字段／身份校验、权限及总预算。组合／拆分单对象上限按地图格数，普通素材capture仍256格，解决新大对象再拆的旧256格限制。
- BaseMapPanel的多选删除可用；多选组合／拆散均可用，单格拆散为无修改；隐藏所属组合文字。工具栏缩小后依次锁图／复制／填充，后两项仍禁用，右键第二行组合／拆散／对象锁／删除，对象锁仍禁用。

**本轮验证**：
- 42/42：basemap11＋Canvas26＋历史copy组3＋新`verify_map_object_editing`2。新测试验证原位下层露出、50%透明绘制、非锚点抓取偏移、多选位移／批删不删覆盖下层、300格组合保存为一个对象、JSON预演／服务一致、300格再拆、terrain／geography／minimapGeography一致、非法身份／专用组拒绝。
- `verify_map_canvas_select_disband_browser`默认及`--large`分别通过；最终大组为5片段446格，6命令42392字节。真实转换模板＋SystemBaseMapStore／内存SQLite＋fresh Chromium，运输仍为API夹具。新增真实Shift多选→合并保存为一个对象→指针拖动中验证半透明绘制→撤销→再拆保存→批删一次撤销→再次批删保存，查SQLite快照确认对象确实删除。保留原截图30896与大组逐格拾取回归；console／pageerror／失败请求为空。
- `verify_system_base_map_browser`通过四视口布局及共享工具栏／菜单位置断言；首跑撞到旧末四钮断言，按本次批准位置更新后通过。大组与布局串行总命令曾超时，后分别执行通过，不把该总命令算通过。
- `verify_map_sea_ground`通过；`verify_map_sprite_materialization`第一次90秒串行预算超时，单跑106秒通过（10受信配方／17只读拒绝、JSON／保存重读／原子失败）。未运行无关战斗、存档、完整发布或生产测试。
- build＋check、8个JS/MJS语法、diff检查通过；Trial束检查unchanged。独立Vue LS33 SFC通过，BaseMapPanel零诊断，ChaptersPanel保留既有unused hint。宿主主动LSP9文件为1 clean／1 findings／7 inconclusive，最后两文件重探仍inconclusive；mode=all仅既有mapcanvas嵌套三元warning及Vue AST deferred，不能称全clean。

**交付边界**：沿用8443原库，只读核health200与JS/CSS字节匹配；不登录写用户地图、不手动停杀既有服务。未commit/push/deploy。用户保存当前未保存内容后刷新继续测试；旧组合不需后台迁移。

## 192. 地图保存容量增大：4096条／16 MiB并贯通HTTP与本地TLS

**授权与边界**：用户确认刚刷新首次拆大组合即超限，明确要求增大保存容量。旧16 KiB不足以容纳一次单格子ID列表，不是撤销积累。现地图暂存累计从128条／16 KiB增至4096条／16 MiB，保留单次操作单次撤销与原子拒绝；不改真实数据、不自动拆地图、不承诺无限容量。现行维护源为地图合同§2.6，旧设计文档同步标废旧值。

**贯通实现**：新增`web/src/editor/mapeditlimits.js`共享预算；前端basemap、基础地图store、copy地图写入共用命令上限。security请求读取、Node HTTP的Content-Length与chunked捕获、本地HTTPS代理共用路由预算：只有基础地图save与UUID游戏copy POST为16 MiB，登录等其它接口仍16 KiB。copy是模块复用接口，提高的是运输上限，不放宽模块权限或内容准入。超限提示明确数值，区分先保存积累与缩小单次选择。

**验证**：
- 42项通过：basemap控制器11、Canvas26、copy组操作3、预算/运输2。包含新会话256命令且请求>16 KiB一次暂存／撤销／保存重读，4096边界及越界不破坏历史；公共JSON读取精确16 MiB通过、+1字节413，非地图路由旧上限仍生效。
- `verify_map_edit_limits`实际隔离Node HTTP与临时HTTPS：两个地图路径256 KiB正文，Content-Length和chunked均到达预期边界，Node匿名仍401/403、HTTPS端口确认完整正文；普通登录16385字节仍413。全新临时SQLite／FileBucket／证书清理，无用户库访问。
- `verify_map_canvas_select_disband_browser --large`通过：真实转换组`web-piece-group-13236`，5片段446格，保存6命令／42392字节（超过旧16 KiB）；用真实SystemBaseMapStore＋内存SQLite保存，浏览器API运输仍夹具。验证一次撤销、JSON保存重载、独立子格点击、地形／地理／小地图不变，并复测截图30896已无组片段拆分。
- `verify_system_base_map_store`真实临时SQLite通过，129条进入内容校验而非旧计数拒绝，4097条拒绝且无写入；原权限／事务回滚／重开／摘要验证保持。
- build＋build --check通过；Trial束重建检查结果unchanged；变更JS/MJS node --check与diff检查通过。主动LSP11文件：2 clean、9 inconclusive；mode=all仍只有既有mapcanvas嵌套三元warning和Vue AST deferred，不冒称全clean。无Vue源改动，不重复无关Vue检查。

**本地服务核实**：8443壳SHA `c2171f80d2bb100dce8c8aa47d5bbdc0b49d43cedc13d85e748c4366bfeb8cc7`与构建一致，health200。曾测到TLS代理旧进程仍返回BODY_TOO_LARGE；正常源变更触发既有supervisor刷新后，20KB无凭据请求返回401 LOGIN_REQUIRED，证明不再被旧16 KiB入口截断且鉴权保留。未手动停杀服务、未带凭据写用户地图。用户在`https://127.0.0.1:8443/`保存已有内容后刷新即可手测。未commit/push/deploy；生产反代与部署未动，不将本地结果当线上验收。

## 191. 拆散到独立单格：修复选择组合与多格片段的双层遗漏

**用户授权**：用户两张截图表明`web-piece-instance-30896`所属`web-piece-group-18619`消失后仍整片选中；确认按建议修复按钮，不做后台全量打散。截图仅定位Web缺陷，不作为原版机制证据。

**原因／更正**：§189–190验证只覆盖`decoration-ungroup`删除selectionGroups和保存重读，没有证明多格实例变单格。“拆散已完成”的旧结论限于外层组关系，不能再用于逐格拆分验收。`mapcanvas.ungroupSelection`现收集通用组成员／选中装饰，批量解除组＋调用已有`decoration-split`；多格片段无组也可拆，UI开启相应入口。整批沿控制器预演和一次撤销；专用组／缺原子／既有限额仍拒绝，不变更核心配方／原版规则或真实库。

**附带定位**：加撤销后逐格选择回归发现独立notice节点改变画布尺寸，清提示后的同屏位置会命中另一片段。提示现复用固定状态区，载入／保存／撤销清提示；不再增加影响布局的节点，右键保持提示。

**本轮验证**：
- `node --test editor-ui/tests/mapcanvas.test.mjs tools/verify_copy_decoration_group.mjs`：29/29（Canvas26＋copy3）。覆盖有组／无组多格片段、单格ID唯一、真实JSON往返、再组合再拆散、失败不留解组前缀、专用组拒绝及恢复原源。
- 强化`verify_map_canvas_select_disband_browser`：真实转换模板选有多格成员的组合，一次撤销恢复组与片段；保存后原片段消失、全部子实例为一格且无所属组合，terrain／geography／minimapGeography逐项不变；重载后点击原片段多个格核不同子ID。额外精确使用截图`web-piece-instance-30896`，构造旧操作已经解组的状态，实际点击拆散并保存，核全部子实例占一格。隔离内存API／全新profile，不访问用户库。
- workbench总命令在240秒预算内前三lane通过，进入new_city后命令超时；随后单跑new_city通过。因此四专项分别通过，不把超时总命令写成通过。panel_visibility／system_base_map原布局与交互回归保持。
- build＋build --check、变更JS/MJS语法及diff检查通过。独立Vue LS33 SFC通过，BaseMapPanel零诊断；ChaptersPanel已有unused hint。宿主主动LSP五文件：1 clean、1 findings、3 inconclusive；缓存mode=all仅mapcanvas.js L104既有嵌套三元warning、三个Vue AST deferred，不称全仓clean。

**dev交付**：沿用8443原库，不重启他人进程、不批量写数据。health200；JS SHA `95d197b24b4500cb2d6927ea3a3dce975069f528102c860eff069f1629f09014`、CSS SHA `b7b8ff67b7ce69c01c6b53cbe14e4a0f392476d9b7434c221e2e03e2ea429006`与本轮构建一致。用户保存现有未保存内容后刷新`https://127.0.0.1:8443/`，可继续测试拆散／Shift多选／组合；既有无组多格片段不需迁移。未commit/push/deploy。

## 190. 地图交互收尾：底图选位、锁图与建城弹窗、现行回归入口

**范围与决定**：接续§189。用户确认底图格仅保留新据点选位用途，并要求改完继续使用原本地dev测试。现行产品约定回流至`map-atomic-catalog-contract.md`§2.6；未改原版规则或扩大存档／生产范围。

**实现**：BaseMapPanel移除锁图时Shift／默认分支的平移fallback；底图不弹右键或键盘对象菜单，保留pick／诊断定位与city-stamp选位。NewCityPanel改为工具栏“建城”打开默认ElDialog，通过BaseMapPanel tools插槽挂载，避免常驻表单压缩地图；关闭弹窗保留输入。§189右键保留拆散提示修复保持。

**测试整改与边界**：panel_visibility原先缺`GET /api/admin/base-map`夹具，500令地图进入uncertain，离开确认被浏览器自动拒绝，实际停在地图而非据点按钮坏。补合法空模板、有效sea-ground地图及顶栏游戏选择后通过，不屏蔽确认守卫。锁图helper改为清选择后验证空白／Shift拖动像素不变。workbench默认串行跑现行四专项，任一失败原样返回；约2600行旧draft/Trial体原地保留，只有显式`--legacy-draft`才执行，未宣称等价迁移所有历史覆盖。

**最终验证**：
- `node --test editor-ui/tests/mapcanvas.test.mjs`：24/24，新增底图可city-stamp而不可移动／删／拆／调序／捕获。
- `node tools/verify_editor_workbench_browser.mjs`：四lane全过（panel_visibility、system_base_map、map_canvas_select_disband、new_city_panel）；四视口地图布局、13模块空态／192城态、列表保存重读、锁图空白／Shift、底图右键／Shift+F10无菜单、单组拆散持久化、建城弹窗均覆盖。全新Chromium／隔离内存API；不是实际dev登录后的保存验收。
- build＋build --check、五个变更工具node --check通过；git diff --check通过（仅仓库既有CRLF转换提示）。独立`npm run --prefix editor-ui/lsp check`通过33个实际SFC，变更Vue零诊断；ChaptersPanel有既有unused提示。
- 宿主`lens_diagnostics source=lsp scope=paths`九文件均inconclusive（3超时、6push-only），不称clean；独立检查不能改写此结果。最后`mode=all`仅缓存：mapcanvas.js两个复杂度warning（command=37、previewPlacement=17），三个Vue AST检查deferred；未为消警拆分既有业务。补充建城弹窗关闭／重开保留输入断言后专项再次通过，工具LSP重查仍push-only。

**本地dev交付**：查明8443 supervisor使用`.dragon-analysis/basemaps-dev-store`，5173另有`.dragon-analysis/dev`实例，均未停杀／重建；沿用8443。`https://localhost:8443`被现有LOCAL_HOST门拒绝，必须用`https://127.0.0.1:8443/`。health 200、initialized=true；JS SHA `c99111724067a625a09100fdc9194b38f2fd81be92de763d79cf15c5f1f6aa11`、CSS SHA `f5585bd67589f16e32d17faf280002bed7110e2eb5324d34222326590a456551`与磁盘构建一致。全新浏览器只读打开登录页成功，pageerror/requestfailed均空；未接触用户profile或存档、未更改真实库。用户可在该地址继续登录手测。未commit/push/deploy。

## 189. 接续恢复：拆散后右键菜单消失修复与回归边界

**核实起点**：HEAD `6330551`，23个跟踪文件修改＋2个新增测试；§188是最新交接，页首 `github/main=b101dd3` 只是历史记录，本轮未查询远端或生产。

**复现与修复**：`verify_map_canvas_select_disband_browser.mjs` 在拆散提示后重开菜单稳定超时。去掉补左键重试仍失败；`BaseMapPanel.vue` 的 `down()` 在右键时也清空 notice，使工具栏/画布布局改变，ResizeObserver 清除刚打开的菜单。将清提示移到左键判定后，原失败路径通过。没有改分组数据或选择规则；本轮不将用户观察归因于缓存。

**测试收尾**：删除 ensureMenu 补点击重试、DIAG 输出、未使用夹具和重复断言；明确拆散后直接右键，重载后先左键选中再右键；断言右键保留拆散提示。使用全新 Chromium context、真实转换模板和内存 API，不读写 dev/生产库或真实存档。

**本轮验证**：
- 选择取消／单组拆散／保存并重载持久化浏览器测试连续两次通过（第二次为清理后的正式测试）。
- `node --test editor-ui/tests/mapcanvas.test.mjs` 23/23；build＋build --check、测试脚本 node --check、git diff --check通过。
- panel_visibility：13个空态模块显示隔离通过；随后第108行点击隐藏的 `#stronghold-load` 超时，完整测试未通过。
- workbench：第168行菜单断言失败，`#menu button[data-view]` 返回空。现有 Workbench 使用 Element Plus MenuItem，旧 button 选择器及12模块预期已过期；这不是产品菜单为空的证据。大型历史测试还混有旧 draft/Trial 夹具，需另按当前 copy 合同审计，不能直接放宽断言跑绿。
- 主动 LSP：BaseMapPanel.vue 与新增 mjs 都为 inconclusive；Vue 加长等待重查仍 push-only，不能称 clean。

**下一步与未完成**：审计两条旧浏览器 lane 的当前 copy 数据加载、菜单节点与模块清单；核对 `BaseMapPanel.move()` 的锁图空白拖动 fallback（代码仍调用 pan，与§188“已删”的交接描述不符，尚未浏览器验证）。用户真实 dev 复测与 system-base-map 布局失败仍未闭环。未提交、推送、部署或操作已有服务。

## 188. 基础地图交互：锁定语义＋多选组合/拆散＋据点绑定/解绑＋保存连通门（本地全部未提交）

**本轮目标**：用户要求一次做完“基础地图”模块——①锁定拖图/解锁选中拖对象；②拖动吸附＋置顶；③右栏拖放跟随缩放；④据点右键绑定/解绑下拉；⑤保存时据点-道路连通性检查。随后追加：点击切换选中、组合/拆散（Shift多选）、选中框白色、删除页独立，以及复制链打通（内置源直转新规范、一次性）。

**已完成工作**（均为本地改动，未提交；dev `:8443` basemaps-dev-store运行正常，模板v1、复制游戏已上架v1.0）：
- 锁定语义终版（用户两次纠正后定稿）：锁定＝拖动已选对象移动，未锁定＝拖动一律平移地图；单击切换选中与锁定无关。`BaseMapPanel` down/move/up/pick/openContext全链按此实现；锁按钮title同步。
- 选中框白色；多选框橙色；右键菜单组合/拆散按钮及启用逻辑、所属组合行、notice提示条；素材悬停外框＋抓手；删右键菜单变换按钮行；图层默认全开（roads/cities改false使点选直达）。
- 多选：Shift+单击切换（装饰/通用组合入选；道路/据点拒绝并提示）；普通单击清空回单选；多选拖动整体平移＋落定置顶（单undo）；锁定下按空白拖动无动作（locked pan fallback已按用户“锁定只拖对象”删掉）。
- 通用装饰成组/解散：新op `decoration-group`/`decoration-ungroup`（mapcommands预览＋COPY_MAP_OPS＋copyprofile校验：`gameId#group-<64hex>`或`web-piece-group-N`、仅装饰成员、≥2件、成员须未入组；城市组走原路径并被拒）。组合＝先全打散再成组（单undo）；单组选中只许拆散；单装饰两者皆禁；所选无组时拆散为noop+提示。
- 4081个转换期`web-piece-group-*`纳入可选/可散（已核验全decor成员，水域组另表不受影响）；城市组不参组。
- 据点绑定/解绑：右键下拉（未绑定列表）＋绑定/解绑切换；绑定回写档案x/y，解绑模板删键/游戏置0；新op `city-unbind`全链。
- 保存连通门`assertMapConnected`（陆/水/桥统一单连通图；单城0路亦判孤立（用户拍板）；无头路/断线/孤立段拒收）接入`validateSystemBaseMap`＋`gamecopy.validateWhole`。
- DeletionPanel迁出上架审核页到独立管理员入口`刪除管理`（client.txt views＋Workbench挂载＋图标；等价revert d9d2f2f的同页拼装）。
- 复制链：`POST /api/admin/copies`内自动安装已装配内置源（一次性，无需单独确认；安装按钮方案按用户要求撤销）。
- 测试：`verify_copy_decoration_group.mjs`（新，内存态2/2）；`mapcanvas.test.mjs`+3组（现23/23）；editor-ui全套89/89；`verify_copy_map_ops.mjs` 8/8；`verify_map_canvas_select_disband_browser.mjs`（新，真实模板web-piece组＋内存API，写到“拆散后重开菜单”一步，待跑通）；`build.mjs`+`--check`多次双绿；system-base-map浏览器lane按终版锁语义重写helper后全过，仅停line 211既有布局断言。

**关键决策**（用户拍板；均为Web产品决定）：锁定=拖对象/未锁定=拖整图/点击切换与锁无关；toggle-off仅装饰/组合（底图/据点/道路保持粘选，不破坏既有grid测试）；单城0路算孤立；组合先打散；单组禁组合；整图一键解散暂不做；删除只走管理（独立页）；复制用既有游戏级初始化路径（模板优先；“绕过模板”方案经用户确认原逻辑正确已revert，admincopy.js现与HEAD一致）。

**失败尝试**（勿重复踩）：copy面板加安装来源按钮→用户否决已revert；复制绕过模板→用户确认原逻辑正确已revert；verifyMapPanLock helper按翻转前语义写了两版全废（现行版匹配终版语义）；clipboard.png须经bash读（read工具对本机Temp路径不稳定）；read工具偶发返回过期缓存，关键比对以grep/node直读为准；shell-ui.txt大diff为Vite minify重命名（以build --check为准）；verify_map_canvas_select_disband_browser夹具曾缺stage-assets映射致壳起不来、atlas等待谓词写反而超时、page.mouse无actionability等待致菜单竞态——已逐个修完（locator点击＋ensureMenu重试＋面板级图集等待）。

**相关文件**：`editor-ui/src/mapcanvas.js`（多选/拖拽/选择/显示）、`editor-ui/src/BaseMapPanel.vue`（手势/菜单/绑定）、`editor-ui/src/{base,gamemap}workbench.js`（透传）、`editor-ui/src/Workbench.vue`＋`server/public/client.txt`（删除独立入口）＋`WorkspaceIcon.vue`、`web/src/editor/{componenttools,mapcommands}.js`（成组writer/preview/调和修补）、`server/copyprofile.js`（op白名单＋校验＋city-unbind）、`web/src/content/authoring/mapcompile.js`（assertMapConnected）、`server/{systembasemap,gamecopy,editorapp}.js`（save门/validateWhole/复制时自动安装）、`tools/verify_copy_decoration_group.mjs`（新）、`tools/verify_map_canvas_select_disband_browser.mjs`（新，未收尾）、`tools/map_atomic_browser_helpers.mjs`＋三份browser lane（锁语义＋计数13＋映射更新）。

**当前状态**：HEAD=`6330551`＋大片未提交改动（`git status`见23改2新；其中`server/admincopy.js`已恢复干净；无commit无push）；dev `:8443`健康（basemaps-dev-store：模板v1、复制游戏已上架v1.0）；复制/检验/提交/同意全链用户已在dev验证通过；用户在真实浏览器验证报告两问题未闭环（下述阻塞1）。

**阻塞点**：
1. 用户实测①单击再点不取消选中②单组拆散后组还在——本地Node单测全绿＋逻辑复核指向旧bundle或“拆后无可见变化被误判未生效”（已加所属组合行＋保存提示＋硬刷新指纹：白框/所属组合行）。浏览器复现测试已写到“拆散后重开菜单”一步超时（`menu().waitFor()`），根因待查（候选：拆散后selected丢失致openContext门限拦截；或布局抖动致坐标漂移）。下一步先修测试门限/选中保持，结论决定用户端是旧bundle还是真bug。
2. 上述新browser test含DIAG调试输出与ensureMenu重试逻辑，跑通后需清理成正式断言。
3. `verify_editor_panel_visibility_browser`与`verify_editor_workbench_browser`改完未跑。
4. system-base-map browser line 211布局断言为改动前已存在失败（与本轮无关，未动）。
5. 提交/推送/生产部署/删内置游戏均未授权。

**下一步**（下个对话入口）：1) 修完`verify_map_canvas_select_disband_browser`门限问题并跑绿（先确认拆散后selected保持，再决定是否补canvas逻辑）；2) 跑panel_visibility＋workbench两条browser lane；3) 用户按验证协议重测（硬刷新Ctrl+Shift+R→白框/所属组合指纹→选→重选消→组显→拆→存→重载仍散四步）；4) map-wide一键解散（已defer按需）；5) commit需明确授权（shell-ui.txt/trialweb.txt会大churn）。

## 187. D2-EVENT-64：P2–P5 本地实现（D0–D8＋S1 全 (a)，已完成并推送 b101dd3，未部署）

**目标与会话**：用户确认 D0–D8＋S1 全 (a)，随后追加「`0x304E` 纳入调度条目」「Playwright 没有就授权安装」。目标是拥挤/跨页/满轮不丢事件、月结位置换算正确、消息返回前不派下一条、保存恢复可校验、旧旁表退役；禁止真实 `SAVE.DAT`／profile／dev 库。

**实现**（全部为 Web 产品决定，非原版机制）
- `web/src/game/navigation/strategiceventschedule.js`（新，381 行）：`{version:1, epoch, entries[], meta[]}`，绝对位置 `epoch*64+slot`，rank `0=carry／1=overflow`，位置内顺序 carry→原轮→overflow；排队/carry/排序 0 RNG；缺字段＝空表，非法字节/版本/区域抛 `RangeError`。
- 生产：2FBF 页内拥挤→`(epoch+1)*64`；跨页→`epoch*64+offset/4`；301C 满轮→`epoch*64+offset/4` 且 CF 仍 0；原轮可写时只写原轮（不双派发）。新增 `accepted` 表示「Web 已接受」，`inserted` 只保留原 4 字节真值；22DB/2286/预算/57FE 改读 `accepted`。
- 移页：2BD9 先 `beforeEventMonthShift()`（旧当前页 `cursor..63` 含元数据搬到新纪元位置 0，再搬过期条目），之后才 `resetEventMonth`；pristine 新局（原轮全空、调度表空）直接跳过，保持 epoch 0。
- 派发：泵在分频归零时只推进一次游标并冻结批次（carry→原轮→overflow）；`ai.js` 串行派发，消息未返回不下一条，整批结束才 `tickFactionStrategicState` 一次；场景卸载清批次，挂起期间禁存。
- 上下文与保存：type11 携带区域快照；type12 subtype0 携带 `city._disasterGeneration`（随 `cityRuleState` 保存，不符则不清零、不移对象）；快照保存 `strategicEventSchedule`，恢复一次性校验，非空旧旁表拒绝（不猜到期时间）。
- S1：`enqueueDelayedStrategicEvent` 在 native 走真实 301C（`BL=0x14`，0 RNG），`gamebar` 三处 type6/7 不再抛 `legacy event wheel`。
- 304E：`hasScheduledEvent`（只读）并入 `hasPendingStrategicEvent`，调度条目在派发前都算待办。

**失败与纠错**
- V09 抓到真实缺陷：首版 `drainStrategicEventBatch` 在首条消息未关闭时就派发下一条（`Uncovered overlapping native generic TALK event`）→ 改为消息挂起即等待。
- 浏览器首轮抓到新局崩溃：`beforeEventMonthShift` 在 `resetEventMonth` 之前要求 cursor，实测 `RangeError: Uncovered monthly diplomacy _strategicEventCursor` → 改为「原轮全空且调度表空才跳过」，其余缺 cursor 仍 fail-closed 且不写 reset 前缀。
- 其它：超长 heredoc 截断改用 `write`；`savegame.js` import 锚点替换静默失败后补写；`carryOverdueEntries` 改 order 未重排已补；恢复拒绝误读 state 字段已改读 runtime；旧测试按新语义更新（满页仍计 queued、四字节记录含 `arg2`）。
- 过程失误：曾用 `verify_*.mjs` 通配跑全目录，大量需参数/服务的 backend 脚本失败并超时——不是回归，违反 AGENTS「禁止通配」，已改显式清单，不作证据。

**相关文件**
- 产品：`strategiceventschedule.js`（新）、`strategiceventschedule` 的调用方 `ai.js`、`savegame.js`、`originalweather.js`、`originallegionfate.js`、`originalmonthlydiplomacy.js`、`scenarioevents.js`、`scenarioweather.js`、`scenariomonthlydiplomacy.js`、`scenariomonthlybudgets.js`、`scenariolegionfate.js`；删 `strategiceventoverflow.js`。
- 测试：新增 `verify_d2_event_{schedule,schedule_chain,schedule_browser,refusal,save_roundtrip,v_matrix,v_matrix_app}.mjs`；更新 `verify_native_legion_fate`（42/42）、`verify_native_weather_monthly`、`verify_strategic_negotiation_events`；删 `verify_event_overflow_side_table.mjs`。
- 文档：计划 §10–§12（含 V01–V20 映射）、本页 §186–§187、`re-notes-ai-diplomacy` §40、`re-notes-legion-fate` §20、两个 SKILL 的 Web 指针。

**验证（2026-11-17 实跑）**
- 24 条适用 `tools/verify_*` 全绿：调度 9/9、链 9/9、refusal 6/6、V 矩阵 13/13、app 5/5、存档往返 1/1、天气 8/8＋5/5、fate 42/42、预算 9/9、容量边界 5/5、RNG raw、外交 runtime/20 章 220 组合、三个 save lane、capital/message_fifo/negotiation/city_ai/native_city/faction_tick、`weather_regional_sampling`。
- 浏览器（真实 Chromium，隔离 profile）：`verify_menu_save_slots_browser` 通过（存 A→推进→存 B→覆盖→回标题→空槽三禁→读 A→刷新→读 B，`page errors: []`）；新增 `verify_d2_event_schedule_browser` 注入 2 条非空调度（overflow+generation、carry+region，epoch 5）经 `saveGame`→IndexedDB→`reload`→`loadSave` 原样恢复。
- 构建：`trialweb.txt` 重建 256 文件，sha `2237603d…`；`git diff --check` 通过。
- 未通过/未覆盖：`verify_war_proposal_browser` 两次落 retryable（`exit 2`，骰子分支未触发），不计通过；主动 LSP `inconclusive=5`（push-only、`ai.js` 超 5000 行），仅 `node --check`，不称 clean。

**状态与下一步**：已提交 `b101dd3` 并推送 `github/main`；无阻塞、无未决用户决定。后续仅部署/生产验收（需授权）与可选扩展（人物/地图容量）。
## 186. D2-EVENT-64：P0/P1隔离审计与一次性决策包（未实施，未push）

- 只读审计＋隔离探针（`.dragon-analysis/d2-event-64/`，未入库）：基线 5 条全绿；复现 D2-C 接缝——当前页满时 22DB `areaQueued:false` 却不写 bounds、旁表只存四字节载荷，轮转 4 次后才派发（约晚 4 个月）且按错误区域结算；301C 远期满轮落 M+5 位置 0（晚约 1 个月）；2FBF 跨页请求（原版立即 STC）同样延后；恢复路径不校验旁表，`type:0x1ff` 被截断成 255 后才在派发时抛错。
- 接线审计：2FBF 生产者 6 处、301C 4 处；仅 22DB/预算/57FE 读 `inserted`；进言 type6/7 仍走 legacy（后由 S1 修复）。
- SKILL 补证：301C 的 `BL` 是槽偏移且扫到四页末尾；页满失败仍已消费随机起点 1 字节；301C 插入/满队列 CF 均 0 且 5940 不查；DOS 槽尾 `+0x52C0..+0x56BF` 就是事件轮、无「到期时间」字段。
- 产出：计划 §10（审计与分级）＋§11（推荐模型、四组示例、D0–D8＋S1 决策表）；用户随后确认全 (a)。

## 185. D2-EVENT-64后继计划（仅文档，供新会话goal委派）

- 已由 §186–§187 执行完毕；本节保留计划期交接。任务分解 P0–P6、决策表 D0–D8＋S1、验收矩阵 V01–V18（后补 V19/V20）、完成审计清单；维护源[D2-EVENT-64 计划](d2-event-scheduler-plan.md)。
- 规划期已记 2FBF 捕获后仍报失败、22DB 不写 bounds 的线索；实际复现与修复见 §186–§187。

## 184. D2-C实现：溢出旁表＋2BD9排空（用户批C，本地验证，未push）

- **已被 §187 取代**（模块与测试在 `b101dd3` 删除）。旁表只存四字节载荷＋sequence、按页 3 排空，捕获事件被推迟约 4 个月且丢失目标位置与区域上下文；模块与测试已在 `b101dd3` 删除，语义改由绝对调度表承担。保留本节仅作历史与锚点。

## 183. D2-A满页行为冻结：原版满页就是丢，无overflow机制（RE结论，未push）

- 结论仍然有效；Web 差异见 §187。原版 2FBF 只看当前页剩余、跨页立即 STC；301C 满轮 CF 仍 0，调用方不重试，事件实际丢失。Web 的「接受并延后」是已批准产品差异，不改原窗字节。

## 182. B4收尾：D4 k=2可达＋2286新城入灾＋费用域保留（本地验证，未push）
- 用户拍板：N=193..256顶槽必须可达（总目标突破192）；费用域问清区别后再定；D2按“实现它”推进到可实现边界。

## 181. B4推进：D4实施＋费用域提案＋D2证据冻结（本地验证，未push）
- D4（用户B4“全做”授权，按提案逐字实施，标Web产品决定）：`originalweather.js` 22DB选城改live-N抽样…

## 180. 本地服务澄清＋删除面板挂载（本地 dev 5173 已起，未push）
- 更正：本轮全部实现均为本地服务，无推送无部署；此前的公网探测（dragon*.720108.xyz）只是只读连通性抽查，不是目标。本地目标库为`.dragon-analysis/dev`（editor.sqlite）：仅1个上架游戏`臥龍傳·重構版`（`be4d9d16…`，approved，20章6资产），即待删的旧上架。

## 179. VPERF场景级耗时：assembly＋月度（本地实测记录，非门限）
- 新`tools/bench_scenario_perf.mjs`（i5-7500／15.9GiB／win32／node24，与codec基线同机）：compileGameSource 192城2734ms（堆456MiB，地形/道路为主）；fresh缓存init＋synthesize三档皆sub-ms…

## 178. D1(b)具名编译＋D2新城拓扑＋编辑器新城面板（本地验证通过，未push）
- 用户决策：D1由(b)具名正统（内置终将删除，raw只留导入侧；(a)合成raw虽下游零改但成永久负担）；D2=建档→放piece→绑定（先cities.create→地图city-stamp放未绑定piece→city-bind选piece绑档案→admit→road-add→发布）；B4三项全做（见下blocked）；旧上架游戏可删…

## 177. VPUBLISH迁移：parity改走copy检验链（本地通过，未push）
- `tools/verify_copy_publish_parity.mjs`：遗留`/api/publish`直发（409）＋trial-pack比对（410退役）改走现行链：copy → `copy/validate`（passed＋ticket）→ `copy/submission`（submitted）→ `copy/approve…

## 176. B3片3(b)实施：显式admit＋named转换＋capture live化（已提交，未push）
- `gamesource.js`：`admitChapterCity(game,cityId,troopsCap)`——验主表完备（名＋7数＋troops_cap显式0..255，缺项指名拒收）＋placement在位（储备拒收）→回填主表x/y→逐章稠密追加密集条目…

## 175. 用户决策（已执行，见§176/§178；本节为历史记录）
- admit触发a/b待选（已解释，见下）；B4用户批准“现在启动”；VPUBLISH用户批准“迁移”（parity遗留直发流改走copy检验链，含△收敛）。goal仍blocked，待a/b选择＋/goal resume后执行。

## 174. B3片3设计：章节admit（§4.7，待触发确认，未push）
- 消费者盘点：`convertLegacyChapterCities`（state＋raw→编译具名形，192锁）／`captureCityDefinitions`（192锁＋x/y必填，片1储备行过不了）／`editChapterCity`（64-hex raw必填）／`chapterActiveGaps`密度门已live免改／rever…

## 173. B3实现片(2)：章节cityId键控＋191→511（已提交，未push）
- 边界解析方案（§4.6改键落为此实现：同等能力、更小 blast radius；内层记录仍槽位键控，删城重排时再议）：`gamecopy.js`五城市op接受`cityId`替代`cityIdx`…

## 172. B3实现片(1)：cities.create服务端签发（已提交，未push）
- `server/gamecopy.js` cities模块新增`create:{name,numbers?}`：姓名沿rename门（cityName／1..12码点／409重名）、numbers沿既有七字段0..65535门；签发`city-NNN`（既有最大序号＋1，pad3），槽位`existing.length`（只增不减故稠密）…

## 171. CITY后继：B2重录＋B5基线（goal complete，§176–184继续推进）
- 用户目标：完整实现破192后编辑工作台建档可玩＋玩家侧可运行；旧工作台上架游戏可删，无需迁移。已按组合授权推进：B1本地提交／B2重录／B3服务端签发／B4立项／B5全量；提交与推送分别授权，本轮只本地提交，不push、不部署、不动真实数据。

## 170. CITY-CAPACITY-1：本轮收敛检查点（goal complete，commit 8ba841f）
- 本轮目标：按计划从C0审计推进至M192／193／257验证与文档收敛（goal `980ce3d7`，已complete；耗时10h31m，tokens 8,237,552）。地图保持384×256；D1–D6仅实施已批准项，D2／D4／费用未动。

## 169. CITY-CAPACITY-1/C5：M192后开放（v3包可玩准入，用户批准执行）
- VPUBLISH后端链补查：`verify_copy_publish_parity`装配期即报`available library consumer fingerprint mismatch`，stash基线同败——registry记录hash与检出consumer文件偏斜（检出换行嫌疑），非CITY回归；改换行策略或重录指纹超出本轮授权…

## 168. CITY-CAPACITY-1/C6(c)：发布器v3-role全链同切（用户批准实施）
- 发布器按`compiled.roadGraph.version`发射三元组（v2逐字节不变；v3为schema 2／studio-app-3／native-road-v3；未知版本422拒收）；玩家`playerpack`＋`playerenvironment`双准入并拒混搭；`trials.js`未动（v2-only）。见[计划C6…

## 167. CITY-CAPACITY-1/C8：证据登记更新（VGROUP闭环）
- C8-1登记：VGROUP→✓（C7-J四配方浏览器：放置／拆散／删门／撤销／保存重读／两视口一致）；VISOLATION证据补C7-J模板浏览器；闭环表头加C7-A–C7-J。VPUBLISH仍✗（待C6c字段冻结确认；后继§168用户批准后已接C6c，VPUBLISH改△部分）。VEVENT为NA（D2未批准）。

## 166. CITY-CAPACITY-1/C7：四模板浏览器覆盖
- 新`tools/verify_city_group_browser.mjs`真实Chromium一次通过：四配方页内置放／拆散／删门（测试签发cityId，目录`canPlace`仍false故无UI点击流）＋JSON保存重读逐字节一致＋重读态可继续disband；两视口（1280×800／800×600）结果digest一致，零页错误／…

## 165. CITY-CAPACITY-1/C7：撤销语义锁定（单命令单元＋取消零写）
- 据点组三操作经`basemap.js`共用stage管线：单次stage即一undo单元，undo从snapshot重算preview，save唯一写口，dispose／setIdentity只清本地态。见[计划§9.10.35]…

## 164. CITY-CAPACITY-1/C7：删门（先解绑＋换原子墙）
- `componenttools.js:removeCityGate`删一门格：端口须存在（身份三项一致）＋引用该据点的道路须先解绑（模型无端口级引用，按city判，有路拒删且路不动）＋换墙原子tile门＋门格未被占；全有或全无（注销端口＋落墙装饰不入组，组链其它成员不动）。`occupiedCells`移入`componenttools.…

## 163. CITY-CAPACITY-1/C7：拆散解组
- `componenttools.js:disbandCityGroup(source,cityId)`只摘`city-group-<cityId>`组链（装饰独立保留、端口元数据保留、记录不动；未知组fail-closed）＋`mapcommands.js`新增`city-group-disband`命令；`reconcileMapSel…

## 162. CITY-CAPACITY-1/C7：画布放置解禁
- `mapcanvas.js decoration-place`：据点组materialId有caller签发`cityId`时走预检（锚点取选中格）＋物化（`newId`复用画布工厂）＋`stage({op:'city-group-place',materialized})`；无`cityId`沿用预览拒绝（既有用例逐字不变）。画布不签发…

## 161. CITY-CAPACITY-1/C7：放置落源与调和组保留
- `placeCityGroup(source,materialized)`落源（装饰实例＋`cityGatePorts`＋`selectionGroups`条目，全有或全无，原子tile形状门，不写copy模型）；`mapcommands.js`新增`city-group-place`命令；`reconcileMapSelectionGr…

## 160. CITY-CAPACITY-1/C7：放置物化变换首片（纯函数＋单测）
- 新增`materializeCityGroupPlacement(plan,{cityId,newId})`（同文件）：门格只出`cityId:gateIndex`端口元数据（不生路），非门格按行序出原子`tile-<byte>`装饰描述，组链装饰实例id；copy模型行与章节覆盖不在此写。见[计划C7]…

## 159. CITY-CAPACITY-1/C7：放置预检首片（纯函数＋单测）
- 新增`planCityGroupPlacement`（`web/src/editor/citygroupplacement.js`）：配方形状／锚点／`cityTypes`门，整单越界拒绝（`OUT_OF_BOUNDS`），装饰足迹＋道路构件＋placement占格冲突拒绝（`CELL_OCCUPIED`），返回冻结计划…

## 158. CITY-CAPACITY-1/C7：引用清单查询首片（方法＋单测，无路由）
- `DraftTopology.references(tokenHash,game,cityId)`只读：触达道路、待定移动意图、覆盖这些路的重建记录；坏身份fail-closed（`TOPOLOGY_CITY_ID`422／builtin403），未知城返回空而不报错，永不写表。新`verify_topology_references`3…

## 157. CITY-CAPACITY-1/C8：VPERF codec基线
- 新增`tools/bench_m257_perf.mjs`（257节点v3链图，i5-7500实测）：checked编码10.3ms、快照2.1ms、端到端索引搜索2.1ms（256次owner读）、堆~8MiB；场景级assembly／月度耗时未录。C8-1登记VPERF改△。无产品代码变更，不重建bundle。

## 156. CITY-CAPACITY-1/C6(c)：发布器v3-role字段冻结方案（纯文档，待确认）
- 冻结三元组：v3正式包`schemaVersion: 2`／`buildFormat: 'studio-app-3'`／roadGraph role `'native-road-v3'`；其余role／MIME／URL／world／manifest结构／compilerRevision不动。发布器按图版本发射，玩家双准入并拒混搭；`tri…

## 155. CITY-CAPACITY-1/C7：受限创建／拆散／删门引用清单设计（纯文档）
- 据点组合同新增 §4（C7-A）：放置三路物化（主表新行稳定cityId、门只建端口元数据不自动生路、余格进装饰表成组）、拆散只摘组链、删门须先解绑道路引用（有路引用拒删）、引用清单（copy模型／地图源／编译nodeScan与章初态与battleMapId／栈与DTO）、非目标（旋转翻转对象锁、自动生路／分章、超占地形）。实施前置…

## 154. CITY-CAPACITY-1/C9：同一模型与AGENTS回流
- 同一生产模型核查：`web/src/game`无gameId分流；残余`!==192`门均为DOS raw／legacy转换格式门（warconsumer type1别名、FFFF别名、`convertLegacy*`、`editChapterCityNative`），新城在其处fail-closed，无数量回退。未删除任何战术／人物模块…

## 153. CITY-CAPACITY-1/C8：残余192门收敛＋§7验收登记
- 修完：`ai.js`道路节点桥（`rawRoadNodeId`加`nodeCount`参数三调用点传live，`markLegionAtRoadNode`改live上限）与灭亡横扫（`readCityCount`能力缺省192＋io门／`cityAt`门放live）；extinction4FCE新增200城横扫用例。有意保留：cityph…

## 152. CITY-CAPACITY-1/C7：设计分解（纯文档）
- C7无放宽式改动：copy城市模型已按`cityId`键控无192门，地图命令走共用核心；UI硬命中仅两处展示文案，其余为素材ID／像素高度误命中；服务端仅模板profile名字符串。剩余为新功能轨（受限创建／移动移除／删除命令原子边界、拆组删门引用清单、章节配置同数据、撤销语义、四模板浏览器覆盖），须先出设计，C6(c)字段冻结确认后可…

## 151. CITY-CAPACITY-1/C6：游戏级数据copy面live长度
- `gamecopy.js`城市主表／引用校验／人物槽位／组过滤改live长度（`191→cities.length-1`等），唯一键`city-${index}`补旧数据fallback；`copyprofile.js`源检`192→game.cities.length`（默认192）。copy档案28/28全过（含257城档案）。bun…

## 150. CITY-CAPACITY-1/C5：257城完整store往返（测试-only）
- 合成257城v3 fresh装配→`snapshotState`→`saveJSON`→内存店put/get（文本逐字节一致、记录deepEqual）→`admitSavedScenario`→prepare restore→257城／末城归属1／缓存0。新用例一次通过，admission 6/6；`prepareFresh`新增返回`t…

## 149. CITY-CAPACITY-1/C5：剩余三项设计分解（纯文档）
- 玩家包准入三处v2钉死（`playerpack.js:10/:69`、`playerenvironment.js:16`），须schema2／studio-app-3／v3-role全链同切且字段先冻结，C6发布器未产出前不动代码；存档无需新格式（`savegame.js`无版本门，快照v1与metadata均已版本无关），剩余为257城…

## 148. CITY-CAPACITY-1/C5：M192真实图统一链里程碑
- 真实内置192城（同修订game-source.json＋roads.json，节点坐标192/192命中真实城市）走统一链：编译索引逐槽一致、fresh装配末城归属／缓存、真实图索引搜索found（旧地址读永不触发）、JSON快照／恢复往返保留。新`verify_m192_unified_chain`3/3。见[计划C5]…

## 147. CITY-CAPACITY-1/C5-2：编译输出索引摘要
- `compileGameSource`输出新增`cityIndex`（dense槽／cityId／坐标）与`chapterDigests`（逐章state规范摘要，JSON稳定，供C6按章失效）；`battleMapId`绑定表不发射（`game.cities`无该字段是schema事实，C6作者模型工作）；章初态切片仍未接线…

## 146. CITY-CAPACITY-1/C5-1：编译路径动态槽位
- `validateGameSource`城数1..512、槽位dense 0..N-1；`chapterActiveGaps`两锁、`applySharedCityData`同契；`trialcompile`以nodeScan为计数／位置权威（替代FIXED_CITY_BINDINGS，槽序＝扫描序）；`encodeRoadGraphV2…

## 145. CITY-CAPACITY-1/M257(h)：257城真实浏览器场景
- 新增`tools/verify_road_v3_browser.mjs`真实Chromium一次通过：`roads.json`拦截服务257城v3图（初版误拦`/road_graph.json`，默认世界资产实为`content/.../roads.json`，已修正），页内合成catalog／world／257城raw…

## 144. CITY-CAPACITY-1/M257(h)：浏览器harness复核（已被§145接续）
- 本环境此前判无浏览器，复查发现`%LOCALAPPDATA%/ms-playwright`已有chromium/headless_shell多版本。`verify_road_cold_load_browser.mjs`真实Chromium可跑：主冷加载流程（fresh装配＋快照＋道路搜索共享路径）全部断言通过；尾部坏图拒绝断言失败，sta…

## 143. CITY-CAPACITY-1/M257(g)：257城移动与月度深路径
- movement夹具加`nodeCount`与v3边基址（`version!==1`统一原生初始化）；`native_faction_fixture`192硬门改live长度＋逐槽保留（根因：覆盖records致257城缓存合成拒收）。M257移动用例（首点`[2,10,0x810,0x2000,4]`、v3工作区锁定）与fiscal25…

## 142. CITY-CAPACITY-1/M257(f)：装配v3准入
- 准入门v2→v2|v3：memory新增`maxNodesForVersion`／`edgeBaseForVersion`（单源；未知版本 fail-closed）；roadgraph装配／原图／边地址三函数版本化（v1保持旧256界可装载）；assembly元数据／可玩／P76／容量／初始化／context／snapshot放行v3；s…

## 141. CITY-CAPACITY-1/M257(e)：月度三循环与budgets门改live长度
- 方案A实施：原生三循环经可选`readCityCount`（缺省192，旧mock逐字节一致）；场景IO提供并放宽城市门；财政recount改`&0xffff`；外交邻居门改`>=cityCount`（C1C byte存储上限另行处理）；FFFF别名raw门保留。见[计划§9.10.29]…

## 140. CITY-CAPACITY-1/M257(d)：F23存取扩域
- F23存取byte扩word（可达域与DOS一致，阈值／min表达式不动）：nativefactions断言、`originalfactiontick`3E25、`originalmonthlydiplomacy`30B0、fiscal／diplomacy IO读数门；capture±1改word域回绕`&65535`…

## 139. CITY-CAPACITY-1/M257(c)：边类标记版本跟随
- 五处`>=0x800／<0x800`边判改为版本相关`edgeBase`（缺省`0x800`）：movement选边经`io`透传、`performOriginalRoadAction`两处与arrival handler5经同一`io`字段、retreat经新`edgeBase`参数装配。`cx>=0x8000`费用高位与`0x20`槽…

## 138. CITY-CAPACITY-1/M257(b)：search区域参数与接线
- `searchOriginalRoadMemory`新增可选`regions{scratchEnd,queueBase}`（缺省v2逐字节一致；环模替代`&0xFBFF`；非法区域拒收）；`searchRegionsFor(layout)`供装配；movement经`io`透传，retreat经新`regions`参数装配…

## 137. CITY-CAPACITY-1/M257(a)：memory v3编码与checked
- `originalroadmemory.js`版本参数化：v2逐字节不变；v3保持`node=slot*8`，`edgeBase=align16(N*8)`（257城`0x810`），上限512；编码／checked／checkpoint往返均经`edgeBase`；新增冻结`roadLayout`供搜索步骤(b)。见[计划§9.10.2…

## 136. CITY-CAPACITY-1/M257：v3重编号与财政域扩宽设计（纯文档）
- M257需两处并行改造：v3区域重编号（第257节点基址`0x800`撞边基址；连带搜索访问标记`+0x8000`落入队列区、队列环掩码`0xFBFF`、三处`>=0x800`边判）与F23存取扩域…

## 135. CITY-CAPACITY-1/C0：准入放行1..256与M193验证
- 用户明确授权阻塞项按目标需要继续（此前保留门解除）。roadmemory／roadgraph／assembly三处192门改live长度1..256（node*8<0x800；257+需v3重编号），加`roadNodeCount()`；cityCache加`cityCount`（默认192），装配传live长度；citySlots保留为…

## 134. CITY-CAPACITY-1/C4：俘虏城市门与首都扫描动态化＋保留门确认
- capture的`cityAt`与`capital6A3D`扫描改live长度（缺表沿用192界，诊断不变）。同时确认两处有意保留：`STRATEGIC_LAYOUT.citySlots`装配准入门（产品准入仍192，解除等于放行生产，未授权）与月度／财政城市循环＋F23算术域（未批准，不动）。见[计划§9.10.22]…

## 133. CITY-CAPACITY-1/C3/C5：编成／增援／迁都城市门动态化
- 6F89首都门、412B首都门去192短路（`idx`身份校验保留）；6A3D扫描改`io.cityCount ?? 192`（生产io提供live长度）。诊断标签与fail-closed不变，192城行为一致。见[计划§9.10.21]…

## 132. CITY-CAPACITY-1/C1：fresh缓存合成与初态live长度
- `synthesizeScenarioCityCache`与`initializeScenarioCityNativeInputs`改按live城市表长度（城／记录等长＋逐槽身份）；192城逐字节不变。`createScenarioCityCache`的192门（存档面）不动，超192 span在其处fail-closed。见[计划§9.…

## 131. CITY-CAPACITY-1/C2/C3：寻路索引读契约注入
- `searchOriginalRoadMemory`新增可选`readCityOwnerAtNode`＋`cityNodeBound`（缺省旧契约）；movement选边与retreat 487B在有`readCityOwner`能力时注入（`readRoadNodeOwner`＋共享`cityNodeBoundOf`），无能力mock走…

## 130. CITY-CAPACITY-1/C4：攻城入口城市门动态长度
- `performScenarioSiegeEntry`的私有指针`cityAt`与28BB入口门改用共享`cityAtRoadPointer`及live长度＋`idx`身份校验，诊断标签不变，失败仍fail-closed。192城行为不变；高索引完整攻城链未验证，不声称可玩。见[计划§9.10.18]…

## 129. CITY-CAPACITY-1/C3：撤退驻留与返回动态长度
- 474A驻留检查改live城市域＋`roadNodeToCitySlot`解槽＋索引读主权（城市表缺失沿用旧界，错位仍fail-closed）；`originalRetreatRoute`的BX返回校验改live长度（旧`0x17e0`为192城写法）。487B体内部与寻路plumbing仍走旧地址API；siege手写mock已补`re…

## 128. CITY-CAPACITY-1/C3：移动节点域动态长度
- movement目标桥与城市节点门（`targetNode`读写、`cityAt`、`nodeize`落点）改按live城市长度动态化，0x800边／节点种属标记不动，城市表缺失时沿用旧门。首版误将 bound 常量放进`movementIO`作用域致5项失败，已提模块级`maxTargetNodeOf`／`cityNodeBoundOf…

## 127. CITY-CAPACITY-1/C3：到达指针桥动态长度
- `originalroadstate.js`新增`cityAtRoadPointer`（`0x840+slot*32`同一起始／对齐，按live长度验`idx`，不设192门）；`arriveOriginalRoad`私有`cityAtPointer`全部六处改用共享体，失败仍为带指针与指令的RangeError。旧注释头在本轮一次误伤后…

## 126. CITY-CAPACITY-1/C3：移动所属索引解槽
- `performOriginalRoadAction`内联`cityOwner(node)`改用`roadNodeToCitySlot`解槽＋`readCityOwner(slot,"movement-owner")`；47BB寻路plumbing仍走旧地址API（共享搜索契约另行转移），`cityAt`／目标桥／retreat／`cac…

## 125. CITY-CAPACITY-1/C3：到达首读索引解槽
- `originalroadstate.js`新增`roadNodeToCitySlot`：`BX`（8*slot）经同一u16回绕／对齐解槽并验`idx`身份，不设192门；`arriveOriginalRoad`首读改`readCityOwner(slot,"28F4-first")`，错位／回绕／身份错位fail-closed。mov…

## 124. CITY-CAPACITY-1/C3：到达刷新现属索引
- `refreshOriginalCityCache`的3F11现属读取改用`readCityOwner(idx,"3F11")`，与军事／治理共用索引体；旧属比较、F17写回门、冷却与C18不变。到达首读仍走旧地址API。详细边界见[所属索引]…

## 123. CITY-CAPACITY-1/C3：战略邻居索引边界
- `originalroadstate.js`新增单格C1C解码服务，FF为空引用，不压缩／排序／修复；同一军事叶经Scenario两处返回接入，仍四槽懒读、null终止，其它消费者保留各自语义。旧byte解码不能产生高索引；显式nullable-index输入验证192/254/255/256可派令且仅null终止。详细边界见[行军说明]…

## 122. CITY-CAPACITY-1/C3：城市所属索引服务
- `originalroadstate.js`新增索引读取体，旧地址适配保192门并复用；Scenario准备／能力提供readCityOwner，同一军事／请求后继／治理九处去DS地址及内部重复192门。所有者byte域与null→18h不变，未知仍拒，保原故障阶段标签。详细边界见[行军说明]…

## 121. CITY-CAPACITY-1/C3：军事候选身份与标记分离
- 同一`runOriginalCityMilitary`改用有序候选记录和独立敌对标记，取消私有16-byte表的FE/FF城市身份混用；不改四邻读取／byte威胁／重复owner与缓存读取、原DEC选择和已批准四候选低0规则。详细维护源见[行军说明]…

## 120. CITY-CAPACITY-1/C1/C2：战略邻接顺序与拓扑一致性
- D6生成前的核查发现不能用导航端口重建导入战略顺序：登记3840行连接多重集合均一致，但2600行非空顺序不同；导航114节点有中间空槽，战略数组无中间空槽。只读KI复核88CC..895D位序，完整证据／边界维护于[战后§12.3.1]…

## 119. CITY-CAPACITY-1/C1/C3：章节城市引用与初态编译
- 新增`chaptercitycompile.js`，按捕获的cityOrder编译城市、22物理势力城市引用及C18；不截byte身份，不用主表新章默认覆盖旧章值，不丢未放置引用。陈旧源计数拒绝，明确不用于live F23或恢复。详细维护源见[计划§9.10.11]…

## 118. CITY-CAPACITY-1/C4：真实目录绑定收据与受控城损输出
- `verify_city_source_registered.mjs`改用现行程序攻城目录ID，新增独立资源SHA／长度、目录文件SHA及目录模块代码SHA；不伪装成原41角色之一，不改旧r1–r8。独占r9报告通过192城实际目录绑定、20章3840城市行、440物理势力槽和39计数差异，以及全部既有寻路／选边／撤退对照。

## 117. CITY-CAPACITY-1/C4：攻城资源ID与实际目标分离
- 新增`content/battlemapcatalog.js`，捕获现行192攻城目录为`ki-1995:siege:*`，排除野战目录；只核目录元数据，不替代布局／导航／资源身份校验。`createSiegeProjection`消费显式battleMapId，资源directoryIndex与实际city对象分离；无效显式绑定拒绝，旧…

## 116. CITY-CAPACITY-1/C2：真实登记图撤退决策对照
- 扩现有登记源审计，不改产品运行代码：192节点／254边中点±方向、首都每16城采样并含当前位置／边端／null、默认章／全己／全外三种所属配置，共30720次487B决策与原适配器逐结果／惰性所属读取序一致。未执行去向或军团写回，详细配置与三组轨迹SHA见[行军笔记]…

## 115. CITY-CAPACITY-1/C2：结构化487B撤退选址
- 新`structuredroadretreat.js`保原端点筛选／读取序及反搜选城，分开无首都／外属端点／无路／下一城外属，不产生假城市或直接执行去向。静态487B..491B窗口亲读并锁SHA，详细证据及限制见[行军笔记]…

## 114. CITY-CAPACITY-1/D5：运行选边耗尽停止动作
- 原生47BB耗尽在高费用门之前明确返回unreachable；两个动作入口恢复占格，保位置／目标，不读假0800边、不因无路调用291A。路上重算无路时保留原pending-bit，使下次到期不沿旧方向偷走；可达替换可恢复正常移动。原日结／尾段／余槽保持。详细维护源：[运行无路边界]…

## 113. CITY-CAPACITY-1/C2：登记图选边三profile对照
- 扩`verify_city_source_registered.mjs`，在真实登记192节点／254边上，以全节点及每边中点正反方向、每16城目标加边两端、command1/10、默认／全己／全外属三profile作56160次47BB决定对照。位置／status bit0、其它状态位不变、owner读取及原写集次序逐项通过；原5217…

## 112. CITY-CAPACITY-1/C2：结构化位置选边隔离核
- 新`structuredroadselection.js`复用491B结构化反搜，区分城市首末点选边、边内保点改向、已经到达、无路及原费用去向请求；自身不写军团／占格、不执行291A、不改生产准入。原47BB完整窗口已再次只读复核，详细维护源见[选边边界]…

## 111. CITY-CAPACITY-1/C2：结构化寻路核与登记图查询对照
- 新`structuredroadsearch.js`保491B批次／交错／双端口次序，动态数组不截城市索引或队列计数；明确区分快捷、命中、耗尽。仍保原word费用语义，不抢先决定D5费用扩域，不接运行／保存。原窗再次只读核验，详细维护源见[寻路边界]…

## 110. CITY-CAPACITY-1/C2：结构化道路运输投影
- 新增`structuredroadgraph.js`，输出v3具名节点／端口／边，消除运输数据中的node×8、0800h边区及方向高位；保四槽顺序、边／点次序、byte费用／flags和bounds。已捕获城市片段不重复校验，未知道路在投影边界检查；不推导新费用或替换实际寻路。

## 109. CITY-CAPACITY-1/C1：导入城市具名初态片段
- `chaptercityconversion.js`新增initializer，保原attr／冷却／旧属／边界计数／灾度／C18，四邻接转稳定cityId或null但不改顺序／尾槽；不把旧章拉平成新城零初态。缺完整raw、重复raw或同名字段冲突、无法映射邻居拒绝，不猜填。详细维护源：[计划§9.10.5]…

## 108. CITY-CAPACITY-1/C1：章节城市引用与计数差异投影
- 新增`chaptercityconversion.js`及5项纯内存测试：保每章七个城市值、转换首都／两条战略目标到稳定cityId、FF→null；按已批准D6重计城数并同时报告原raw／公开计数。原章与raw不写回，不处理其它章状态或原生初态。

## 107. CITY-CAPACITY-1/C1：实际登记源片段转换
- 只读固定41个登记Web输入，经共同full-copy内存投影核到实际placement额外含`id/componentRef/variantRef/importRef`。原纯三字段validator会拒绝真实形状；补同形负控先红，再显式保留／校验四字段及实例ID唯一，不在工具里删字段造通过。

## 106. CITY-CAPACITY-1/C1：旧据点片段转换及离线独占输出
- 新增`citysourceconversion.js`：明确旧slot→cityOrder、坐标与slot退到legacyBindings，指定默认章一次取城兵上限，战场ID由调用方显式传入。完整章状态／raw／首都不动，不声称整个GameSource已转换；合同见[计划§9.10.2]…

## 105. CITY-CAPACITY-1/C1：据点源属性边界
- 新增`citysource.js:captureCitySource`，复用identity模块，明确新据点字段／placement坐标唯一权威、草稿缺项与已放置城严格完整性；旧slot／坐标／raw及未知placement字段拒绝而非静默剥离。新章默认上限不拉平已有章节；资源绑定这里只核字符串，不代目录／运行检查。详细合同见[计划§9.…

## 104. CITY-CAPACITY-1/D6：城兵上限原证与导入负边界
- 复核KI的420B治理双byte读取及575C预算读取，确认`troops_cap`是C12独立输入；新源必须逐章保留，不由类型／战场推算，也不拉平成首章上限。详细维护源：[字段原证](re-notes-entity-fields.md#city-capacity-troops-cap)。

## 103. CITY-CAPACITY-1/D1：消息自身续段失败暂停
- 补`completeRequest`中40F6／414F／40B3异步错误边界：该段在批次resume之前，原先错误逃逸会清掉request却不进入failure hold。现保已写前缀、暂停并禁存，不恢复／重跑批次。

## 102. CITY-CAPACITY-1/D1：192相位分配及多城续段接线
- 新增`web/src/game/cityphase.js`并接入原生aiTick，按已批准192相位分配城市区间；military/daily阶段闭包按城市顺序恢复，整个批次返回后才推进相位与唯一军团batch。空城市批次也走军团；同步无UI不能重入。旧192结果不变，历史cityIndex／_cityTickCursor名称暂保留为相位…

## 101. CITY-CAPACITY-1/D1：原生TALK38治理与军团续段
- `aiTick`原生分支接入军事请求的一次性resume，消息未关不治理／灾损、不推进城市／军团游标；同步无UI、重复关闭、调用方options变更、旧clock回调及后继失败保前缀／禁存均有正负控。详细源在[行军笔记](re-notes-march-pathfinding.md#city-capacity-request-tail)。这…

## 100. CITY-CAPACITY-1/D5：主动迁都无候选不再写189
- 已批准的D5子项落实于`originalcapitalrelocation.js`：选择器返回null，type8在读旧首都／写F03之前返回`no-capital-candidate`。正常候选与真实城189仍合法；不改捕获4DF0、灭亡、提案显式commit或4502写序，不放宽192门。

## 99. CITY-CAPACITY-1/D3：批准记录与去除两处跨记录别名
- 批准：用户对§98集中请求回复“同意建议”，确认D1、D3、D5及D6新城初态／导入计数；随后恢复goal，当前active。D2、D4、费用域及财政算术扩域仍未批。历史“D1–D6未批／goal阻塞”仅适用于此前批次，现行维护源为[计划§9.4]…

## 98. CITY-CAPACITY-1：实施前产品决定确认
- 身份／中心纯数据子模块已完成本批验证，但不是C1整项完成。下一阶段接源初态及运行引用会依赖尚未批准的Web行为；不把用户的“继续”解释成批准D1–D6，不靠继续堆叠未接线模块绕开决定。

## 97. CITY-CAPACITY-1/C1：放置中心边界及F23域续查
- `compileCityIdentity`补固定384×256整数中心、单格唯一校验；不改建筑footprint、章引用及可玩准入。四角／移动不改索引、重复中心、非法坐标及98304互异中心的纯数据投影加入测试，总计37/37；大样本不代表可玩容量认证。

## 96. CITY-CAPACITY-1/C1：独立城市身份投影子模块
- 按计划允许先实现已闭合纯数据合同，新增`cityidentity.js:compileCityIdentity`；仅身份双射／单城单放置→cityOrder已放置子序列及索引表，不改原规则，不连接v1生产编译门。详细边界见[计划§9.10]…

## 95. CITY-CAPACITY-1/C0：目标跟踪与发布／存档外层盘点
- 用户明确要求以`/goal`持续推进；已建立活动目标，不把D1–D6提案自动视为批准。C0仍进行中。

## 94. CITY-CAPACITY-1/C0：原生事件跨月与消费边界对照
- 产物：新增`tools/verify_city_capacity_event_boundaries.mjs`，5项包含原KI窗口SHA、移页前／后延迟差异、消费后仍占位、旧当前页未消费事件丢弃、301C域外首读拒绝。固定KI只读，夹具全内存，未读SAVE或用户profile。

## 93. CITY-CAPACITY-1/C0：选都原字段纠错与事件次序复核
- 原证：只读固定`KI.EXE`，重取6A3D、33EA、301C、5358窗口并核SHA；6A55取C16类型，6A73取C00边界。详细bytes、复核命令和反例回流[去向§11.1](re-notes-legion-fate.md#111-原始绑定与调用者实锤)，扩容计划仅链接，不复制另一套机制解释。

## 92. CITY-CAPACITY-1/C0：首批字段审计与待决合同
- 授权：用户要求按扩容计划从C0开始，随后继续推进；保持384×256，保留已有修改，不提交／推送／部署／迁移真实数据。

## 91. CITY-CAPACITY-1：固定地图据点扩容计划与新会话交接
- 用户范围：最终独立Web代码支持人物／据点／道路／地图扩展；本期先保持384×256解除192据点限制。用户要求代码分析与详细设计后制定开发计划，在新对话实施。本轮只改文档，不开放新城、不改编译／运行保护门。

## 90. 锁图与据点组预览本地提交
- 授权／范围：用户要求“提交代码”，本地提交收录§87–89连续改动的19个源码／测试／文档／生成文件，包括地图拖动锁定、据点组原证配方、第八分类和四张只读原尺寸预览。不推送、不部署、不迁移真实数据。

## 89. CITY-GROUP-PREVIEW-1：据点组只读素材展示
- 授权／范围：用户要求先放进元素资源面板查看，在“据点”按钮后增加“据点组”；本轮只接展示，不等待实体绑定决定、不开放新放置或拆散。保留§87–88未提交改动；没有commit／push／部署／真实迁移授权。

## 88. CITY-GROUP-1：四套配方与放置接缝待确认
- 授权／范围：用户确认四种通用据点组，25／9／3／3格、中心锚点、关卡中间城楼＋两门最终3格，按16px组合尺寸预览，要求开始实施。开始时保留§87八个未提交文件，没有提交／推送／部署或真实数据迁移授权。

## 87. MAP-PAN-LOCK-1：地图拖动锁定切换
- 授权／范围：用户指出锁图按钮未生效，明确要求锁定／解锁切换、锁后地图不能拖动，作为后续对象操作基础。开工`fdb9d67`、工作区干净；本轮只改展示层指针处理及按钮，不改对象能力／规则／源结构，没有新增commit／push／部署授权。

## 86. 地图工作台布局与操作本地提交
- 授权／范围：用户确认当前效果并要求提交代码。本节所在提交收录§84–85连续改造的27个源码／测试／文档／生成文件，包括右键调序、浮动图层、紧凑布局、素材懒加载、100%和按钮左／提示右对齐；不推送、不部署、不迁移真实数据。

## 85. MAP-SPACE-5：紧凑布局与原始比例
- 范围／授权：用户多次标注截图要求把顶部／右侧空白还给地图，明确工具后同行显示状态、删除长说明、右栏固定、导航折叠全宽给地图、地图与素材栏底对齐；追加浮动图层图标无框／方形／悬停边框，以及放大和缩小间的100%按钮。只改展示布局及调用既有缩放动作，保留§84全部未提交修改；没有commit／push／部署／真实迁移授权。

## 84. MAP-SPACE-4：地图优先布局与对象右键菜单
- 授权／范围：用户提供布局截图，要求尽量留地图空间、提示合入标题下、两字按钮／锁图图标、两行分类TAB、32px图样下ID和无分页懒加载、中栏改可拖浮层、选中对象右键操作；追加导航折叠时地图自适应，并要求按此实施。开工HEAD为`a7237ca`、工作区干净；本轮无commit／push／部署／真实迁移授权。

## 83. 海底与原子素材库本地提交
- 授权／范围：用户要求「提交代码」，仅本地commit，不push。本节所在提交收录§78文档整理及§79–82连续地图改造：全幅底图与地面轮廓、单格七类库、32px预览、固定春季与中立据点展示，共40个源码／测试／文档／生成物文件。保留旧地图和原资源身份，不包含运行数据、profile、缓存或临时报告。

## 82. ATOMIC-SPRING-NEUTRAL-3：固定春季与中立据点素材
- 范围：用户要求移除四季选择，地图／素材固定春季、编辑布局自动供四季使用；据点库只显示中立外观，所属配色由游戏动态决定。仅展示与工作台动作投影，不新增配色或道路／据点放置能力；旧定义、实例和256原子身份全部保留。未授权提交／推送／部署／真实数据迁移，保留此前全部改动。

## 81. ATOMIC-PREVIEW-2：分类更正、植被核对与32px预览
- 范围：用户以六张截图要求蓝水岸边归水系、水系第一张回地面，核对疑似缺失的植被图样，并把右侧16×16预览放大到32×32。仅展示分类／缩略图；地图格、幽灵、规则、准入及持久数据不变。保留全部先前未提交改动，无commit／push／部署授权。

## 80. ATOMIC-CATALOG-1：单格素材库与单层分类
- 授权／范围：用户要求所有素材16×16原子化，取消组合卡、一级层分类与各库导航，仅剩末级分类；追加水路／桥梁归道路、底图自然露出及去掉素材悬停，最后明确继续完成。详细维护源[单格库合同](map-atomic-catalog-contract.md)。不是拆除现有地图实例，也不授权新道路／据点／配色规则；保留此前全部本地改动，无提交／推送…

## 79. SEA-GROUND-1：全幅海域基底与地面轮廓
- 授权与产品合同：用户确认全图95海域基底；取消手工地理及单格／范围填海；仅地面构成小地图陆地，其他装饰不参与轮廓；一级固定基底／装饰／道路／据点，二级分类独立。详细维护源为[新合同](map-sea-ground-contract.md)，属于Web决定，不是新KI机制。保留§78用户文档改动，不提交／推送／部署或访问真实SAVE/pro…

## 78. Project memory与journal精简（历史批次）
- 范围：只改仓库`AGENTS.md`与本页。开工核HEAD和本地`github/main`均为`664819d`、工作区干净；不修改产品、测试、资源、全局约定或历史归档。

## 77. 第二阶段完整提交审查（用户另行授权）
- 用户授权完整审查、一次提交并推送；实际保留45文件：6项目文档、13产品源码、19测试／工具、2构建壳产物、5羽扇图片。没有迁移文件；图片作为产品素材保留，未擅自接运行入口。

## 76. 第二阶段S2局部UI与S0资源盘点
- > 本节现为该会话的完成摘要；标题保留旧链接。S0–S6已闭合，不再逐轮重复“未完成”。完整配方／SHA／原图见证维护于[准入说明§2.1a–y](re-notes-editor-map-admission.md#sprite-g02-coast-completion)，逐项要求与版本化收据维护于[审计]…

## 75. 地图实测反馈与第二阶段设计交接
- 历史设计轮只交付[产品设计](map-workspace-sprite-library-design.md)和[接续提示词](map-workspace-sprite-library-handoff.md)，未授权生产操作。六项意见及S0–S6后来由§76实施；提示词已标历史，不再作为当前状态或新授权。

## 74. 全量审查、统一提交与推送
- 基础地图上一批审查65文件，产品／测试／文档及分级复验见[完成核对](system-base-map-completion-audit.md)；提交`172ffe0`已推送GitHub。当时宿主未确认、历史测试缺口仍保留，不等于部署。不要与§77的45文件提交混用收据。

## 73. 本轮 project memory / journal 整理
- 历史整理将长期规则归`AGENTS.md`、截至§72详单归[归档](checkpoint-journal-archive-through-72.md)，保留70旧标题／锚点转接；未更改产品。后继精简见§78，不重载旧临时计数或授权。

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
