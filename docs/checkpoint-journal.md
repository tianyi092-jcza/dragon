# 检查点日志（checkpoint journal）

> 长期事实、架构、命令与约定维护在 [AGENTS.md](../AGENTS.md)；本页只记录本轮会话的详细进展、调试过程、失败尝试、相关文件、当前阻塞和下一步，不构成实施／提交／部署授权。
> 历史：[§73–194快照](checkpoint-journal-archive-73-194.md)、[§72及以前](checkpoint-journal-archive-through-72.md)、[更早收据缺口](historical-receipts.md)。历史待办与运行状态不自动延续；机制结论须回SKILL／re-notes原证。

## 当前主线与状态

| 工作线 | 当前交接 |
| --- | --- |
| 游戏章节 | CHAPTER-WB P0–P7及后继调整已本地交付（五Tab、复制去重、行编辑见§200–208）。现行规则以[章节合同§0](chapter-and-base-resources.md#0-chapter-wb-现行产品口径与字段盘点)为准。旧 draft 菜单已撤（控制器保留），「游戏管理」即上架发布模块。不把§199中途缺口当待办。 |
| copy收敛 | 共享数据、章节、武将、地图、审核已接copy；删除仅留上架审核。定义面板余项、旧draft退役及表清理见[收敛任务](docs/copy-simplification-tasks.md)。 |
| 地图／扩容／事件 | 现行范围见[CITY计划](docs/city-capacity-expansion-plan.md)、[地图合同](docs/map-atomic-catalog-contract.md#26-地图交互收尾选位背景与锁图对象操作)、[D2计划§12](docs/d2-event-scheduler-plan.md)；本地通过不等于部署。 |
| 本地成果／生产 | 提交／推送分别授权，未经授权不部署。保留既有用户修改，未迁移内置源、已有copy或正式包。旧Git跟踪引用/PID不能代表当前远端或服务状态，操作前重核。 |

### 当前阻塞、支持限制与下一步

- **登记边界仍未解决**：默认`verify_pinned_source_registration.mjs`因available-library消费者指纹失败；已对照旧pin与HEAD，差异来自本轮纪元相关`main.js/gamebar.js/hud.js`，不是无关旧失败。未改旧身份或放宽检查。部署前须按授权处理程序／库身份及完整归档验收。
- **诊断不是全绿**：宿主LSP多次inconclusive、TXT unsupported及缓存pending/complexity warning不能记clean；独立Vue LS 34 SFC实际通过另列。后续按变更重验不将历史构建/分项通过代替全链。
- **支持边界**：复杂退役关系具体拒绝；已分配22槽不复用；首都及计数原生byte写限制仍在。512城读模型通过不代表大于255首都已能写。App跨纪元证明月界/存读档续计，不声称模拟此前整月所有事件分支或生产签名reader验收。
- **现场数据待确认**：开发库`content_games`为0，3条`copy_requests`均为`failed`，编辑器无已提交游戏；章节页无数据是数据缺失而非投影门。用户看到的章节数据不在任何现存本地库；需用户确认期望来源（重新复制/导入或其它备份），不自行重建。
- **下一步范围**：菜单重整、品牌统一、检验单行三项未提交；现场复测、copy余项、库身份更新、部署及真实数据操作仍须另行授权。`client.txt`／`index.html`改动后须重启本地编辑器服务（supervisor 按设计忽略 `server/public`）。

## 217. 品牌统一与检验单行（未提交）

- 品牌统一「臥龍傳編輯器」：页签 title、左上品牌单行 20px 加粗（用户明确指定的字阶例外）、加载占位文；旧两行副标题 `brand-caption` 已无引用。
- 检验列改单行：`PublishPanel.vue` 检验结论与时间同行（`validation-cell` 复用 8px 间距），逻辑不动。用户已确认已上架行「未检验／—」是检验票一次性语义（提交即作废），不是校验丢失。
- 验证：`build --check` 通过；Vue LSP 全过；shell 测试仍只有已知 `login-form` 旧失败。

## 216. 菜单重整：删游戏管理、上架改名、去分组（未提交）

- 用户四项：删「游戏管理」（draft-editor 菜单项；draft 控制器是全台游戏上下文底座，继续保留供选游戏／workspace／stage 共用）；「上架管理」改名「游戏管理」；取消「工作台级」，「新建游戏」移到游戏级首位；分组标签不再显示，权限过滤不变。
- 改动：`client.txt` views 12 项（copy 首位游戏组，publish 改名；默认落地与新建后进游戏改为 `copy`／`publish-editor`）；`Workbench.vue` 菜单展平（去 `ElMenuItemGroup`、去分组标签）；`verify_editor_shell` 跟进（viewPanels 去 draft、菜单标签与分组断言更新，地图双面板单独立检查，`MapPanel` 改 `BaseMapPanel`）；`verify_editor_panel_visibility_browser`（初始 copy、12 视图、mock 补三图）。
- 附带修活：三处旧 mock 补 `brand.png`／`auth-logo.png` 静态供给；`verify_city_delete_browser` 改走顶栏选游戏（draft 菜单已无）。编辑中发现 views 数组一度写出 16 项重复，可见性断言抓到，已修（12 项）。
- 验证：可见性 12 视图全过；unbind／city-delete／disband 全过；`build --check`、`lsp` 全过；shell 静态检查等价复刻全过（原文件仍停在已知 `login-form` 旧失败，菜单检查位执行不到）。
- 已知 stale（非本轮引入，不扩大）：`verify_editor_workbench_browser.mjs` 66 处 `nav()` 用 `#menu button[data-view]`，新壳菜单项是 `li`，自 Vue 改壳即不可运行需另起 rehab。

## 215. 编辑器 chrome 图与用户管理（已提交 53e55f4；chrome 部分 892dc75）

- 頁籤圖示 `dist/favicon.ico`、品牌标 `web/favicon.png`（32px）、登入 logo `web/feather-fan-white-shadow-128.png`（128px）：`server/public/` 真文件为源，同名 `.b64.txt` 为服务模块（既有 Text 规则全环境通用；`wrangler Data` 规则被本机 miniflare 拒绝已 revert，`text-loader` 二进制分支同步 revert）；`editor-ui/public/` 同字节镜像仅供 Vite 构建解析，运行走服务端同源路由（CSP 禁 `data:`，不内嵌不改 CSP）。`index.html` 加 icon 链接；服务端三路由 200＋字节一致。
- 登入页：品牌链接 `v-if="ready"`（未登录无品牌）；登录区 `margin: auto` 垂直居中；label 50% 左对齐、按钮同宽、按钮顶部 24px；顶部 128px logo；登录标题改「臥龍傳編輯器」。侧栏页脚折叠按钮去文字只留箭头、与菜单图标同起点左对齐；第三方授权链搬顶栏登出后（16px 间距、12px 字用户明确例外）。
- 用户管理：拆郵箱／電話、帳戶／姓名、角色／狀態列（角色狀態列移備註后），空值显示空，去初始密码提示行；操作列加刪除（仅创作者行）：服务端物理删 users＋sessions 行、不碰游戏关联，仅创作者禁自删，管理员 403。新建/重置作者初始密码＝初始化配置的 `EDITOR_DEFAULT_PASSWORD`（本地 `Dev-Local-Only-2026!`），首次登录强制改密。
- 側欄：人物頭像（原系統資源）移至管理員版块基礎地图后并改名仅管理员可见；用户管理移至管理员版块最后。服务端头像字节仍对作者开放读取（游戏编辑要用），只收菜单层。
- 驗證：`verify_shell_brand_browser.mjs`（真服务隔离库）全过；`verify_account_delete.mjs`（删作者200＋列表消失、删管理员403、重删404）全过；`verify_editor_backend_browser.mjs`（修活 stale 选择器＋按钮数 2→3＋补删除覆盖）全过；`build --check`、`lsp` 全过。页签图标用户侧曾显示旧地球标：服务端字节已对（SHA 一致），系浏览器缓存旧无图标，清站数据即解。

## 214. 地图保存检验单句明确原因（已提交 6ac9145）

- 解绑被道路引用据点后保存，服务端 422 `COPY_MAP_CITY_ROAD_REF`，客户端无此码回落通用模板三处各说一遍。`client.txt` 错误映射新增 `COPY_MAP_CITY_ROAD_REF`／`COPY_MAP_CITY_BOUND` 一句明确中文，三处展示位同源收敛；其它码仍走通用模板。验证：`verify_map_unbind_message_browser.mjs` 全过（唯一原因行、无裸码、无通用话术、版本未推进）。

## 213. 城池据点地图坐标列与删除（已提交 6ac9145）

- 据点名称后加「地圖座標」列（已绑定显示落子 x,y，未绑定为空）；操作列加「刪除」（编辑／刪除同行不换行）：服务端 `remove:[cityId]` 守卫落子 `COPY_MAP_CITY_PLACED`／道路 `COPY_MAP_CITY_ROADED`／章节实质 `COPY_MAP_CITY_CHAPTER`（附明细）逐项拒绝，中性行随删清理；`cityCopyRemove` 用 `{feedback:'local'}` 直达面板行。系统基页不动。验证：`verify_copy_city_delete.mjs` 5/5；`verify_city_delete_browser.mjs` 全过（含同行断言）。

## 212. 系统基础据点模块与单复制基准（已提交 d22b4f1）

- 基础据点即系统基 `content.cities` 的管理员编辑面（与城池据点同列同口径，坐标只读归地图）：`saveCities`／`replaceCities`、`assertSystemBaseCities`；`admincopy.js` 派生 `blessed()`＋reserve 门 `COPY_SINGLETON_EXISTS`（仅完整复制占位）＋提交后 `onCommitted` 刷新；前端 `base-stronghold-editor`（排基础地图前）。验证见当轮 `verify_base_cities` 4/4 等。只允许一个成功完整复制；删内置／生产覆盖／M7 延后部署轮次。

## 211. 开发数据目录收敛为唯一一个

- 用户确认只保留 `E:/Dragon/web-port/.dragon-analysis/basemaps-dev-store`（内含失败回执 `臥龍傳·重構版`／`重構版3`），删除其余 9 个仓库内库及 `E:/Dragon/.dragon-analysis/element-default-ui`；以后固定此目录启动，验证用系统临时目录。规则已入 [AGENTS.md](../AGENTS.md)§4。
- **重要事实**：保留库无任何已提交游戏，3 条复制请求全 `failed`；章节无数据是数据缺失，不得重建或声称恢复。

## 210. 完整提交前审查与验证（历史批次）

- 用户授权审查全部改动建单提交并推送；核对 60 改＋20 新增，排除代理／运行产物；Trial 重建 unchange；`verify_pinned_source_registration` 默认 lane 仍因 available-library 指纹失败（见阻塞）。后续远端若变须重核，不以快照代替 push 结果。

## 209. project memory 与 journal 整理

- 长期事实归 memory、会话进展归 journal；journal 约 126KB 压至约 26KB，memory 约 143 行；文档链接检查通过；未把历史成绩改写为本轮结果。

## 208–200. 已关闭章节批次（各一行，细则见 git 历史）

- 208 武将所属并入本行编辑保存；207 势力名去内部编号后缀；206 所属解析／首都候选／武将列宽；205 首都只读标识与城兵单位；204 章节页布局收尾；203 新增章节紧凑表单；202 同君主共首都保首丢后；201 同章重复势力保首次（被 202 取代）；200 删除管理入口清退与复制失败可诊断性。

## 199. CHAPTER-WB P0–P7（本地完成，细则见审计与计划文档）

- 阶段产物与关键验证收据见[审计](docs/chapter-workbench-audit.md)与实施计划；lane 命令与分层验证入口见 [AGENTS.md](../AGENTS.md)§5，不在此复制命令表。本轮不重跑历史 lane，不把中途缺口当待办。

## 198–194. 地图历史批次（一行一条）

- 198 地图保存检查弹窗与拒绝／未知／重读失败区分；197 据点绑定与素材拖放收尾；194 道路／据点拖动红罩与保存错误详情。现行细则以地图合同为准。

## 历史定位与兼容锚点

以下只转接历史，不恢复旧状态或授权。无锚点的§73–194按[归档编号](checkpoint-journal-archive-73-194.md)查找；更早见[旧归档](checkpoint-journal-archive-through-72.md)。

<a id="184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push"></a><a id="186-d2-event-64p0p1隔离审计与一次性决策包未实施未push"></a>
§184–187：[旧旁表、审计与绝对位置调度实现](checkpoint-journal-archive-73-194.md#187-d2-event-64p2p5-本地实现d0d8s1-全-a已完成并推送-b101dd3未部署)；现行规则见D2计划不用旧旁表方案。

<a id="79-sea-ground-1全幅海域基底与地面轮廓"></a><a id="80-atomic-catalog-1单格素材库与单层分类"></a><a id="81-atomic-preview-2分类更正植被核对与32px预览"></a><a id="82-atomic-spring-neutral-3固定春季与中立据点素材"></a>
§79–82：[底图、原子库与春季展示历史](checkpoint-journal-archive-through-72.md#79-sea-ground-1全幅海域基底与地面轮廓)。
<a id="84-map-space-4地图优先布局与对象右键菜单"></a><a id="85-map-space-5紧凑布局与原始比例"></a><a id="87-map-pan-lock-1地图拖动锁定切换"></a><a id="88-city-group-1四套配方与放置接缝待确认"></a><a id="89-city-group-preview-1据点组只读素材展示"></a>
§84–89：[布局、锁图与据点组预览历史](checkpoint-journal-archive-through-72.md#89-city-group-preview-1据点组只读素材展示)；对象拖动以现行地图合同为准。

<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a>
§37：[Element Plus默认主题／组件决策](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)（tag: architecture）。
<a id="49-共享头像文件及资产id数字重编号"></a>
§49：[共享头像数字身份决定](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。
<a id="10-014发布整理"></a><a id="11-015发布整理"></a><a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a><a id="5-当前时钟系统逆向与重构本地完成"></a><a id="6-发布主线阻塞与下一步"></a><a id="8-用户指定五档提速"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-录像反馈后的战略性能修复"></a>
时钟与表现：[更早历史索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<a id="11-编辑器vps部署前只读盘点"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署／Trial：[更早历史索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)，不是当前部署身份或恢复接口授权。
<a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a>
早期Vue壳：[原批次及缺口说明](checkpoint-journal-archive-through-72.md#19-后台框架壳editor-ui-1)。
