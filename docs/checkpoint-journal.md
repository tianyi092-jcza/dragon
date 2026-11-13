# 检查点日志（checkpoint journal）

> 长期事实/架构/命令/约定维护在[AGENTS.md](../AGENTS.md)，本页只记当前交接、会话进展、失败、验证和下一步。历史详单已移至[截至§72归档](checkpoint-journal-archive-through-72.md)，不把历史授权或测试结果当作当前放行凭据。

## 当前主线与状态

| 工作线 | 当前交接 |
| --- | --- |
| 基础地图 | B0–B7本地42项核对完成：独立模板、管理员维护、两种创建共用初始化、游戏工作台、保存/审批及同加载器装配。见[任务](system-base-map-tasks.md)和[逐项证据](system-base-map-completion-audit.md)；未部署 |
| copy收敛 | 元数据/章节/据点/武将/地图/审核已接copy；部分定义面板、整个旧draft退役与表清理另待，见[收敛任务](copy-simplification-tasks.md) |
| 数据边界 | 不自动迁移旧游戏地图或头像冻结包。缺mapEditorAssets的旧copy在新画布明确拒绝；真实数据迁移、提交/推送、部署均需独立授权 |
| Git/生产 | 地图批次结束时本地HEAD为0541fff，修改未提交/推送；未联网确认远端，也未操作生产。旧§58的提交授权不延伸到本批。现行运维入口为[存储布局§18](game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产) |
| 验证边界 | 真实资源夹具、隔离HTTPS后端、玩家加载器端口与生产分别报告；LSP未确认不记clean，不把本地完成当公共分发或整局战役验收 |

### 未完成、阻塞与下一步

1. 本地图实施目标已关闭，无待用户确认的实施阻塞；下一批按用户范围选择copy剩余收敛或旧数据迁移，不自动扩大任务。
2. 旧地图数据迁移、头像旧持久化/冻结包兼容、生产安装与验收未执行；公共分发/网络reader admission及完整玩家App战役不在本次加载器端口验证内。
3. **未解决的历史验证缺口**（不是已确认的本轮回归）：`verify_vps_publish_pack`曾43过1失败（stale draft visual capture）；`verify_vps_trial`曾超时；旧玩家pack harness曾缺检验票。backend_admin_copy缺MINIFLARE_MODULE、backend_copy_entry旧objects断言、template_root portrait-epoch旧Trial预期、generals_conflict_model旧动作清单均待按现行适用性复核。不得为跑绿恢复Trial或放宽来源门。
4. `verify_publish_controller_slot`曾用例完成但轮询计时器未退出；force-exit只取用例结果，不证明生命周期清理。宿主LSP仍有未确认，独立Vue检查保留ChaptersPanel既有TS6133提示。

## 74. 全量审查、统一提交与推送

- **授权/范围**：用户明确要求审查全部改动/未跟踪文件，并创建一个完整提交后推送。精确清单65文件：30产品/转换/构建、24测试、11必要文档；含新增系统表声明及受控转换工具，不含真实数据迁移或部署。
- **审查**：复核创建单快照、权限/CSRF/epoch、schema/purge隔离、旧配方门、工作台会话/dirty/异步、玩家版本准入及对应负控。62份非memory目标文件SHA与最终实施审计后快照一致；文档整理保留70历史锚点。未发现阻断本次提交的问题，历史测试缺口与工具限制继续保留。
- **本批复验**：17前端测试、模板存储13项、copy地图/验证/单槽9项、玩家pack61项通过；schema sources严格声明通过。构建check核JS/CSS/13包许可一致，trialweb复建unchanged；独立Vue LS31SFC通过，仅既有ChaptersPanel TS6133提示。先前真实HTTPS浏览器/同加载器和完整回归收据未被冒称为本批重跑。
- **检查边界**：宿主15路径0诊断、6clean/9push-only未确认，mode=all仍pending/deferred，不称全仓clean。私钥/PAT/凭据URL常见模式扫描无命中；本地.pi/.codegraph/.dragon-analysis、依赖、profile、截图和运行数据不入提交。
- **Git**：本批fetch后main与github/main均为0541fff、无分叉；只向GitHub remote `github`推送，不向Gitea origin或生产部署。最终提交ID与推送结果以Git记录及交付回执为准。

## 73. 本轮 project memory / journal 整理

- **范围**：只整理仓库`AGENTS.md`、本页及新增历史归档；保留其它会话/地图批次的代码、测试、构建产物与未提交修改。未修改仓外全局约定或CONTEXT领域词汇。
- **职责调整**：memory保留稳定架构、数据/权限/保存边界、UI约定、常用命令和重要坑点；删除重复实施过程、测试数量和临时状态。journal集中保留当前交接、地图批次关键调试与验证，细节按原编号归档。
- **过时信息处理**：删除当前状态中的4191dc1/旧提交授权、重复待实施列表、各中间批次已失效任务计数/包尺寸；历史失败保留并注明适用性未复核，不伪称解决。
- **归档策略**：`checkpoint-journal-archive-through-72.md`保留整理前完整记录，明确标为历史快照；旧标题/锚点在本页提供转接，原相对资源链接仍有效。历史批次不再作为默认上下文反复加载。
- **本轮检查**：87条本地链接/目标锚点、70个旧标题/显式锚点转接通过；62份非目标未提交文件SHA及变更路径集合不变，git diff --check通过（仅换行提示）。memory正文缩减约23%，journal约72%；完整旧收据仅留归档。纯文档未重复执行游戏、构建、浏览器或LSP回归。未提交、推送或部署。

## 地图会话交接（§59–72汇总）

### 进展与相关文件

| 阶段 | 实际交付 | 维护入口 |
| --- | --- | --- |
| 盘点/转换 | 98,304格覆盖；用户选A，以可拆Web片段而非DOS对象身份分组；保留unknown与逐格来源 | `tools/audit_system_base_map.mjs`、`system_base_map_pieces.mjs`、`system_base_map_conversion.mjs`；[盘点](system-base-map-inventory.md) |
| 模板合同/存储 | 系统SQLite单槽、完整验证后生效、版本/摘要、首次建立不覆写；系统表不随游戏删除 | `server/systembasemap*.js`、`systembasemapdeclarations.js`、`editorapp.js` |
| 创建/编辑核心 | 两种创建捕获同一快照，地图与人物来源分离；共同增量命令维护组合引用 | `server/admincopy.js`、`mapworkspace.js`、`gamecopy.js`；`web/src/editor/mapcommands.js` |
| 工作台 | 管理员/游戏共用Canvas、素材分页、组合选取、诊断、保存重读；旧MapPanel/mapview启动与DTO桥移除 | `editor-ui/src/{BaseMapPanel.vue,basemap.js,basemapworkbench.js,gamemapworkbench.js,mapcanvas.js,mapatlas.js}`及main/Workbench/client |
| 运行闭环 | 实际copy删片补底→旧票失效→重验/审批→生产pack/environment/世界加载器装配 | `tools/verify_copy_http_roundtrip.mjs --browser`；`web/src/player/runtimecontract.js` |

详细产品/支持域合同以[基础地图设计](system-base-map-design.md)为唯一维护源。旧draft共享章角色状态仍由ChapterRoles消费，兼容协议有直接测试消费者；删除地图入口不等于整体draft退役。

### 关键调试、失败尝试与修正

| 问题 | 已查原因与处理 |
| --- | --- |
| 水域审计首跑失败 | 916道路格同时具有member/base显示引用，不一定带waterClass；修审计按物理格去重，不改源或规则 |
| 多格对象边界不明确 | 5×5据点窗遗漏4格，邻接不证明归属；用户选A：Web可拆片段，不猜自然对象/隐藏底层 |
| 初始化JSON解析失败 | 可信readWeb返回Uint8Array；边界转Buffer后解析，不放宽38资源/SHA门 |
| 普通新建编译失败 | minimal空白章不是可运行20章；其按草稿结构检查，模板自身完整编译；full仍核真实章坐标/邻接 |
| 新模板无法擷取素材 | 转换定义使总数超过旧1024门；仅工作区另计不可改转换配方，保留768作者素材预算和旧冻结门，补满额负控 |
| 模板页面无首读、无报错 | 曾尝试自动enter/忙态门，无效已撤回；真正原因是session根version缺省undefined与捕获null不等，统一缺省并补真实DTO形状用例 |
| 玩家包拒绝新copy版本 | 审批revision为1.n而玩家只接整数；先复现PLAYER_PACK_INVALID，再兼容规范1.n，保留精确身份/SHA及非法格式负控 |
| 浏览器选择/checkbox失败 | EP隐藏input/placeholder拦截，改点可见Select壳/label，不force点击或改皮肤；小地图纹理比较排除视口指示框 |
| 旧测试夹具失败 | Trial成功预期、schema计数、发布动作/全局列表、据点DTO字段落后现行合同；按真实接口修夹具，不恢复旧产品门 |
| 工具检查受限 | CodeGraph超时后降级明确文件查读，未解锁/改权限；宿主push-only/超时/deferred与独立Vue LS分别报告 |

### 最终验证收据与覆盖限制

- 最终日志：本机忽略目录`.dragon-analysis/system-base-map-final-uqJeiD/`；逐项需求→代码/断言映射在[完成核对](system-base-map-completion-audit.md)。这些是本地图批次收据，不自动证明后续修改。
- 五个基础地图核心lane、copy地图/校验/单槽9项、schema sources、purge19组、distribution schema rows19组通过；玩家pack61/client50/environment37/chapters42/runtime104/mock saves36/reader77通过；控制器94项及章节继承13组通过。
- 真实资源夹具浏览器覆盖片段/组合命中、图层锁定显隐、拆分/撤销、unknown定位补底、素材/小地图与宽窄视口。真实HTTPS无API拦截浏览器438.7秒回放两创建、模板/游戏保存、隔离、审批及同加载器装配。
- 实际审批包交同一玩家加载器后terrain等于编辑结果且不同原图，v2道路/192据点/正式身份一致；session/static为隔离端口，不等于公共网络reader或完整App战役。
- 17前端用例、48JS/MJS及client/shell语法、build→check、trialweb复建一致通过；独立Vue LS31SFC通过。主动LSP50路径0发现、11clean/39未确认；mode=all仍pending/deferred，**不是全仓clean**。favicon默认请求的精确404单列，未掩盖业务错误。
- 最终42任务、10文档289本地路径/8基础地图锚点、实际diff已核。未提交、推送、部署、读写真实SAVE或用户profile。旧§54曾另获授权清理本地孤儿文件，其收据保留归档，不与本地图批次混用。

## 已提交批次摘要

早期copy主表/整库覆盖/持久管理员列表、先清文件后删库、复制/检验阻塞弹窗的记录见归档§53–58；默认EP决策见归档§37。实现细节查对应合同或Git，不重复列旧包尺寸、临时测试轮次和已解决待办。

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
早期Vue壳/上线：[原归档索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<!-- markdownlint-enable MD033 -->
