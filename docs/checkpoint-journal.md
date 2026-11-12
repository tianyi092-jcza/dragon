# 检查点日志（checkpoint journal）

> 长期事实、架构、命令及约定见 [AGENTS.md](../AGENTS.md)；本页记录有范围的交接、调试、验证与未完成项，不代替原证或实施授权。已提交细节用 `git log -p -- docs/checkpoint-journal.md` 追溯；历史成绩不代表当前通过。旧链接锚点保留，旧方案不因此恢复。

## 当前主线与状态

| 工作线 | 当前交接 |
| --- | --- |
| copy收敛 | 元数据、章节、据点、武将库及发布审核已接copy；地图／部分定义面板、旧draft控制器与表清理尚未收尾，见[任务清单](copy-simplification-tasks.md) |
| 本地后继 | §53主表初始化／整库覆盖／持久管理列表、§54删除链、§55–56阻塞弹窗已实现并做适用验证；纳入§58统一提交批次，未部署 |
| 真实数据 | 用户授权的两份本地孤儿文件已定向清除，收据见§54；这不代表头像旧copy/publish/formal、旧冻结包或生产已迁移／验收 |
| Git／生产 | §58提交前已fetch核本地HEAD与github/main均为`4191dc1`、无分叉；用户已授权本批commit/push，提交与推送结果以Git记录为准。生产仍以[存储布局§18](game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产)为入口；本轮未部署、未重启用户服务 |
| 验证边界 | 独立Vue检查可用；宿主push-only／timeout／deferred不能称clean。API夹具浏览器、隔离真实HTTPS后端和生产分别报告 |

### 未完成、阻塞与下一步

- **继续主线**：按用户新任务推进地图／旧draft收尾；§58仅授权审查并提交／推送现有成果，不授权扩展实现或部署。
- **交付边界**：本地复制／检验／删除展示已验；真实生产发布、玩家整局／存档、旧头像引用迁移未验。后续按对应lane及实际来源验证，不能用合成DTO替代。
- **保留失败**：`verify_vps_publish_pack.mjs`最近记录43过1失败（`stale draft visual capture refused`）；`verify_vps_trial.mjs`长链超时；旧玩家pack harness缺检验票报`PUBLISH_VALIDATION_REQUIRED`。§53未消除这些问题。
- **旧入口缺口**：`verify_editor_backend_admin_copy`缺`MINIFLARE_MODULE`未跑；`verify_editor_backend_copy_entry`取消回执旧objects断言失败；`verify_editor_template_root --portrait-epoch-only`仍期待已退役Trial返回422而实际410；`verify_generals_conflict_model`动作清单漏`adoptFor`。先核入口适用性，不放宽来源门或重开Trial凑通过。
- **检查工具**：宿主LSP仍有未确认，独立Vue LS仅余ChaptersPanel既有TS6133提示。发布控制器测试8项完成后轮询计时器未退出：`node --test --test-force-exit tools/verify_publish_controller_slot.mjs`可得到用例收据，但不能证明计时器清理；生命周期应另测。

## 58. 全量工作区审查与统一提交

- **范围**：用户明确授权审查全部修改与未跟踪文件、创建一个完整提交并推送。纳入产品代码、8份回归测试、构建壳及必要合同／任务／交接文档，共33文件；本批没有新增持久化迁移脚本，不自动迁移旧副本。
- **排除**：本地`.pi`配置、CodeGraph索引、依赖、`.dragon-analysis`运行数据及临时测试日志不纳入提交；不部署、不重启用户服务、不再次操作真实游戏数据。
- **本轮复验**：13个明确指定入口共58项通过（含删除15组、回收10组和发布服务18项内部断言）；真实隔离HTTPS新建／复制／导入／审批链1项通过。两套全新浏览器测试通过，build `--check`确认JS/CSS及13包许可产物一致；独立Vue LS正控和30SFC检查通过，变更组件零诊断。
- **检查限制**：宿主21路径主动LSP均未确认（push-only／timeout），`mode=all`仍5个Vue文件deferred，不宣称clean；独立Vue检查保留ChaptersPanel既有提示。首页旧入口失败、发布轮询计时器及生产验证缺口未被本次消除。全部变更JS/MJS及控制器／构建TXT语法、33文件精确暂存清单、暂存diff检查通过；未发现私钥或常见凭据模式，本地代理／运行产物未入暂存。一次忽略目录状态扫描超时留下空index.lock，确认无Git进程后移除残留锁，随后暂存成功。

## 57. 本轮 project memory／journal 整理

- **范围**：仅`AGENTS.md`与本页；保留代码、测试、生成物、用户数据及仓外全局约定。本次不运行无关游戏／浏览器回归，不提交／推送。
- **整理**：长期规则留memory／模块维护源；本页保留§53–56产物、根因、失败、验证边界与§54授权清理收据。已提交批次压为索引，去掉重复构建字节、临时运行信息及被新方案替代的详细步骤。
- **纠正**：不再把§47–50写成待实施；本地残留清理已完成，撤销首页“未操作真实数据”的过时总括。区分本地缓存远端指针与在线远端状态，不把历史commit授权延伸到本轮。
- **检查通过**：57条本地链接／目标锚点有效，原54个标题／兼容锚点全部保留，2962份非目标文件SHA及路径集合不变，diff检查通过；journal体积约减49%。纯文档不跑无关LSP、构建或游戏／浏览器回归。未解决项集中列出，不重复散落为多个“当前阻塞”。

## 56. 检验窗口沿用阻塞弹窗布局

- `PublishPanel.vue`共用检验／提交弹窗缩窄、加高、居中；四圆点位于内容上方，删除底部说明及无消费者计时器。保留检验层、长明细内部滚动、通过自动关闭和失败关闭入口；展示事件通知`Workbench.vue`抑制重复全局动画，不改busy、票据或协议。
- 扩展`tools/verify_editor_panel_visibility_browser.mjs`：新隔离Chromium＋构建壳／控制器＋内存API，覆盖3视口、Esc／遮罩阻塞、20条错误滚动、失败停动画、成功自动关闭及关闭后普通刷新恢复全局Loading；既有复制／删除／显隐／分页回归通过，console/pageerror/意外请求0。
- 发布控制器8/8通过；首次直接node执行后因轮询计时器超时，改测试runner加`--test-force-exit`取收据，限制见“未完成”。build/check同字节；独立Vue LS正控及30SFC通过，本次组件零诊断，宿主3路径未确认。
- 本地服务返回的shell-ui.js/css曾核200且SHA匹配当前产物；这是资源核对，不是生产或真实检验端到端验收。未操作真实数据／部署。

## 55. 完整复制阻塞弹窗布局调整

- `CopyGamePanel.vue`去底部说明、缩窄加高居中，四圆点置弹窗内文字上方；`Workbench.vue`不重复显示背景Loading，保留请求计数／busy及复制协议。执行中无关闭按钮、Esc／遮罩不退出，失败保留原因与确认按钮。现行细则见[布局规范§3](editor-ui-layout-spec.md#3-加载反馈)。
- 同一永久浏览器入口覆盖宽／中／窄屏、局部动画位置、说明移除、阻塞与失败确认；build/check及独立Vue检查通过，宿主仍未确认。没有为验证创建真实游戏，未重启用户实例。

## 54. 删除弹窗就地进度与文件清理先于库行删除

- **根因**：开发入口未装配回收器；旧HTTP先删库后回收，失败pending时管理行已消失。前端又误拒成功回执`pointer: removed`／`privateObjects`。截图只作线索，不能凭图确定具体服务端错误。
- **实现**：`server/gamepurge.js`复用check核身份／归属／fence／名称／修订／下架；`server/editorapp.js`先核权→移除目录指针／清空专属文件→交易内复核并删库。缺回收器或回收失败503，保留fence及管理入口重试。`vps/game-reclaimer.mjs`抽出共用私有回收，`tools/dev_editor.mjs`接实际私有桶；正式装配仍清分发与私有两桶。详细合同：[存储布局§11.1](game-storage-layout.md#111-本轮实际做了什么)。
- **展示**：`ReviewPanel.vue`／`server/public/review.txt`就地更新栅栏、清文件、重读及结果；动作和全部请求走progress，无Loading。第4项改“遊戲檔案與公開入口”，失败显示原因，只有确认全部清理才显示完成。
- **验证**：控制器10项、Loading6项、reclaim10组、publication-server18项通过。`verify_game_purge.mjs`15组使用真实隔离SQLite/FileBucket＋内存分发桶：缺回收器拒绝、实际删一文件后故障仍保留库行／fence／管理行、重试清空前缀、35表零行、私有单桶幂等；其他游戏／installed／共享程序／画像不动。不含真实生产分发或账本退役验证。
- 新隔离浏览器阻住fence／purge／重读逐阶段核无全局Loading，最终四组完成；build/check、独立Vue及语法／diff通过，宿主9路径未确认。实现阶段没有操作真实数据，后续授权操作如下。

### §54 后续：用户确认本地测试，定向清除历史残留

- 用户确认本地并授权清除全部剩余残留；定位实际状态`.dragon-analysis/dev`，只读SQLite及专属源索引SHA／长度／源gameId／metadata，不按名称盲删。
- `dc7dc520-ab20-46d3-a29c-cdee91eecb55`（截图「臥龍傳·重構版」）：36张含game_id表0引用，复用`reclaimPrivateGame`清49文件／47,983,946字节；目标目录消失，其余568个桶文件SHA不变。
- `7e0b9428-3419-45c2-ae21-e0b62aa7f6d0`（另一旧副本）：再次核0引用后清49文件／47,983,954字节。合计98文件／95,967,900字节；私有目录`private/private/`在复查时已空，保留519个桶文件SHA不变。
- 未写数据库、未删共享installed、未访问线上或真实SAVE、未主动重启用户进程。运行实例及资源字节已核，但不冒充另一次真实游戏删除验收；本收据也不是持续保证该目录永远为空。

## 53. copy主表初始化、内置武将覆盖与持久管理员列表

- **授权／产物**：用户批准本地P1–P8，任务见[清单](copy-initialization-tasks.md)。`server/copygenerals.js`＋`admincopy.js`／`gamecopy.js`：新建事务安装copy，普通新建192据点完整父表／空武将库，完整复制按章序槽序首名优先形成466名／2540槽关联；冻结baseline/profile不改。主表按稳定ID跨章投影，丢失引用留发布门。
- `editorapp.js`／`server/public/draft.txt`／`GeneralsPanel.vue`：内置来源验证后单事务整库覆盖，确认→单次POST→重读，不扫描目标章、不再64条追加，失败不动旧库。
- `gamecopy.js`／`review.txt`／`ReviewPanel.vue`／`Workbench.vue`：全局管理按gameId保留提交过申请的游戏；通过／驳回不丢删除入口，编辑／校验不解锁审核，状态与listed独立；默认分页／固定表头。删除后继以§54为准。
- **规则／服务验证**：聚焦29项、关联27项通过；覆盖真实固定源首名优先、0/255头像、稳定ID、跨游戏隔离、缺失引用、章级覆盖拒绝及触发器注入写失败回滚。`verify_copy_http_roundtrip.mjs`独立临时SQLite/FileBucket＋真实HTTPS＋已登记源，完成复制立即读copy→覆盖重读→prepare／审批1.0→管理行保留／重复审核拒绝；普通新建后导入466名不改另一游戏。
- **展示／检查**：两份永久浏览器入口使用构建壳／内存API／真实PNG，确认单次导入、分页／列宽／相册／隐藏输入、据点及跨游戏管理通过；build/check、独立Vue、语法／diff通过。宿主LSP未确认，旧入口失败见“未完成”；没有真实数据迁移或生产验收。

## 已提交批次摘要

以下只保留原因、决策与兼容引用。§47–51纳入本地提交`4191dc1`，§39–45纳入`df8b35a`，§36–38纳入`34bf1c1`；细节查Git，不把历史通过／失败套作今日结果。

## 52. 全量工作区审查与统一提交批次

- 审查全部改动与未跟踪文件、画像重命名逐字节核验、链接及产物一致性；用户当批授权commit/push，当前本地记录为`4191dc1`。旧验证中的pack43/44失败仍保留，不以推送代替部署；本轮未联网复核远端。

## 51. project memory 与会话日志整理

- 上次文档职责拆分及旧锚点保留；修过手工压缩漏连字符的问题。当前整理以§57为准。

## 50. copy头像目录跳过无用旧草稿使用统计

- `?usage=0`跳过copy未消费的旧draft使用统计，保留无查询旧接口inUse、鉴权／epoch／SHA与删除栅栏；不读取PNG。34项及真实PNG夹具浏览器当批通过；现行合同见[轻量目录](editor-general-definitions.md#copy头像目录轻量读取现行)。

## 49. 共享头像文件及资产ID数字重编号

- 用户批准`p0001..p0471 → 150..620`，621图字节不变、255按普通资源、ID>255走portraitKey而非byte；不改DOS FF或冻结身份。清单／运行时／武将／发布适用回归通过，pack／旧Trial／玩家harness缺口集中见“未完成”。旧持久化及生产未自动迁移，见[画像合同](re-notes-portrait-reader.md#现行web准入与原证边界)。

## 48. 头像弹窗等尺寸加载、分页／按钮右对齐与数字排序

- 固定外框、网格内部滚动、数值排序与分页／按钮右对齐；改名风险的“待确认”已由§49批准实施取代。细则见[布局规范§6](editor-ui-layout-spec.md#6-头像选择弹窗)。

## 47. 武将管理加载性能、真实进度、固定列宽与局部头像加载

- 隐藏重型表单随busy重渲染导致慢，改内部按active挂载并保留输入；本机合成负载DOM由47867降至2499，不是生产SLA。全局／局部／progress分流、固定列及相册局部Loading落地；当时64批追加导入已被§53原子覆盖取代。

## 46. 编辑器展示修补与 Vue 检查工具本地提交

- `df8b35a`纳入§39–45及工具／产物／文档；仓外全局AGENTS不在本仓库提交中。

## 45. 项目级 Vue LSP standalone 兼容工具（2026-11-12）

- Vue LS3等待本机未接通的TS桥，改项目私有standalone并用TS2322正控／修正证明诊断通路。父目录解析到配置不等于launcher生效；从editor-ui新会话核验。安装与回退见[工具说明](../editor-ui/lsp/README.md)，宿主未确认与独立检查分开报告。

## 44. 武将／据点统一分页与操作列、头像每页 25 张（2026-11-12）

- 共用Pagination／RowActions落地；Teleport不继承父scoped属性曾使resize失效。撤销悬浮操作列、蓝色保存与一次挂全部头像，现行规则在memory／布局规范。

## 43. 武将管理固定表头、行编辑与懒加载核查（2026-11-12）

- 修空库不能导入、空能力被控件挂载补0；新增永久武将浏览器入口。后续展示及导入合同以§44／53为准。

## 42. 据点面板跨模块残留回归修复（2026-11-12）

- 局部display:flex覆盖hidden，改`:not([hidden])`；新增空态／192据点后遍历11模块的浏览器回归。单面板隐藏再显示不足以发现跨模块残留。

## 41. 编辑器统一页中央四圆点加载动画（2026-11-12）

- 共用请求计数在响应正文消费完后finally清理；并发／失败回归入口`verify_editor_loading.mjs`。一律全局遮罩已被局部／阻塞弹窗例外替代。

## 40. 城池据点加载按钮旋转动画（2026-11-12）

- 按钮转圈／等待文字已撤销，不是现行待办。

## 39. 城池据点列表固定表头（2026-11-12）

- 默认ElTable限定高度配合局部flex；引入的跨模块残留由§42修复。

## 38. 完整本地提交前审查：copy／发布审核／默认展示层与回归

- `34bf1c1`含copy发布审核、删除及默认展示；修approve名称登记误用管理员、copy map漏componentDefinitions。历史302项中7失败并非全绿，后续改过部分夹具，今日状态须重核，不能复用旧数字放行。

## 37. 前端架构决策：编辑器采用 Element Plus 默认主题与组件

- **tag: architecture；accepted，用户批准的Web决定，非原版机制。** 深绿自造主题、原生表格与部分EP／玩家样式混用导致重复覆盖维护；全自造和“EP＋自定义皮肤”均未选。
- 统一EP默认主题／组件／控件／size，接受默认外观及DOM／事件适配成本，减少重复实现；不额外引入UI／图标库。仅编辑器展示层，CSS只布局，不改变玩家Canvas／共同核心／规则／存档。
- 长期规则见[全局约定§2.3](../../AGENTS.md#23-渲染与状态原则)、[memory§3](../AGENTS.md#3-展示交互与文档职责)、[布局规范](editor-ui-layout-spec.md)；旧34px／原生table皮肤已撤销，架构获批不等于业务全链验收。

## 36. Element Plus 默认主题与默认组件迁移（本轮）

- 展示迁默认组件、补CSS、移除玩家style link；细节见[迁移记录](../editor-ui/element-plus-migration.md)。裸组件、check不生成包、ESM缓存、事件传值及有效空字符串等坑已回流memory；`--no-library`只验壳，不放宽真实库准入。

## 14. 批次 J：同意上架 422 SOURCE_RUNTIME_BINDING＋审核页重复提示（2026-11-11）

- 修copy批准误走旧rootKey capture，保来源／SHA／新鲜度门；真实prepare补旧approve注入桩盲区。

## 15. 批次 J-2：同意成功却无反馈＋上架管理仍待审核（2026-11-11）

- 透传成功反馈，approve同事务写listed=1，修formal已写但目录不可见；后续管理行保留见§53。

## 34. 编辑副本简化收尾：删除重试打通＋冻结基线对齐＋上架章门恢复（2026-11-11）

- 栅栏幂等重试、章引用门及冻结声明同步；WAL裸拷、只check未build、回执只认修订+1的教训已回流memory。现行删除顺序由§54取代，历史详情见[任务清单](copy-simplification-tasks.md#7-2026-11-11-补记删除失败冻结基线对齐上架章门恢复)。

## 35. 游戏级武将管理重写：父表库行编辑＋自杀旗＋头像相册（2026-11-11）

- 父表六能力0..15、自杀bit4、zi只存及头像DTO落地。旧整批正文触HTTPS16KiB/413后曾改64批；该导入现由§53空载荷／服务端原子覆盖取代，不恢复旧方案。

## 归档索引与兼容锚点

无法恢复的旧收据见[缺口索引](historical-receipts.md)，不把索引当原证。旧文档裸§4.x／§45–47.4可能属于更早编号；旧LRU原型跳过blob／epoch校验已回退，不是已交付优化。

<!-- markdownlint-disable MD033 -->
<a id="5-当前时钟系统逆向与重构本地完成"></a>
<a id="8-用户指定五档提速"></a>
时钟／提速：[战略时序](re-notes-strategic-time.md)。

<a id="6-发布主线阻塞与下一步"></a>
旧发布阻塞见本文「当前主线与状态」，不复活旧待办。

<a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a>
<a id="9-battle-text-reflow-1战术双方对白自动折行"></a>
<a id="10-014发布整理"></a>
<a id="10-录像反馈后的战略性能修复"></a>
<a id="10-录像反馈后的战略性能修复--10-014-发布整理"></a>
表现／对白／性能：[表现合同](presentation-modernization.md)、[战术生命周期](re-notes-tactical-lifecycle.md)。

<a id="11-015发布整理"></a>
<a id="11-编辑器vps部署前只读盘点"></a>
<a id="11-编辑器vps部署前只读盘点--11-015-发布整理"></a>
<a id="12-受限编辑器容器部署"></a>
<a id="13-固定库刷新与私有trial接续"></a>
<a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署／固定库／Trial：[VPS就绪历史](vps-editor-readiness.md)、[私有字节合同](editor-backend-private-byte-context.md)；现行生产见存储布局§18，Trial已退役。

<a id="19-后台框架壳editor-ui-1"></a>
<a id="20-账户管理组件化editor-ui-2"></a>
<a id="21-草稿与章节组件化editor-ui-3"></a>
<a id="22-阶段任务与结构展示editor-ui-4"></a>
<a id="23-只读素材库组件化editor-ui-5"></a>
<a id="19–23-后台框架壳--账户管理--阶段任务--只读素材库--草稿与章节组件化"></a>
<a id="30-上架限制与删除追踪组件化editor-ui-12"></a>
<a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a>
<a id="33-后台迁移提交推送与受限上线"></a>
<a id="30-上架限制与删除追踪组件化--32-固定库身份合同授权修复--33-后台迁移提交推送与受限上线"></a>
早期Vue壳／上线：[框架壳合同](editor-framework-shell.md)、[迁移清单](editor-ui-migration-checklist.md)、[早期审计](editor-ui-final-audit.md)；默认组件决策见§37。
<!-- markdownlint-enable MD033 -->
