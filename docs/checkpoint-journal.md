# 检查点日志（checkpoint journal）

> **分工**：长期事实、架构、命令与约定见 [AGENTS.md](../AGENTS.md)；这里记录有范围的实施、调试、验证、失败、阻塞、下一步，以及架构决策的背景与取舍。长期规则同步维护在 AGENTS.md，不在日志中另设平行规范。旧批次不构成新任务授权，历史成绩不代表当前通过。
> 本轮清理保留尚有交接价值的本地工作，删除旧环境快照、重复测试成绩和已撤销的 UI 补丁；被引用的旧锚点保留在文末。已提交历史用 `git log -p -- docs/checkpoint-journal.md` 追溯。

## 当前主线与状态

| 工作线 | 当前交接状态 |
| --- | --- |
| 游戏级数据／copy 简化 | 元数据、章节、据点、武将库、发布／审核已接 copy；地图／部分定义面板、旧 draft 控制器与旧表清理仍未整体收尾，见[任务清单](copy-simplification-tasks.md) |
| 发布／审核修补 | 下列 §14／§15 的真实包准备、成功提示与 `listed=1` 修补已在本地验证；不是本轮默认主题任务的新增业务改动 |
| Element Plus 默认展示 | 已迁移并重建；指定回归保留 6 项既有失败，真实源完整浏览器验收及 Vue LSP 未闭合，详见 §36；用户确认此选择为长期架构约定，决策记录见 §37（tag: `architecture`） |
| 生产 | **本轮没有部署或线上复核**。上一份部署收据为 editor `20261111-city2`、player `20261109-b6-disk`、static `826b7c3a…`／sourceTree `65cbb8d7…`；仅作历史定位，不保证服务器此刻仍是该值。运维入口见[存储布局 §18](game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产) |
| 工作区 | 用户已授权完整本地提交；本次对已有 copy／发布审核／清理、展示层、工具与文档改动一起审查并纳入提交，排除重复部署镜像及本地任务草稿。审查修补与最终验证见 §38；没有 push／部署 |

## 38. 完整本地提交前审查：copy／发布审核／默认展示层与回归

### 范围与审查修补

- 用户授权完整本地 commit，**不 push**。覆盖原有 copy 单套／publish 单槽链路、作者提交及管理员审核、删除／purge、共享武将、默认 Element Plus 展示层、构建输出、迁移工具、对应测试和文档；不是仅提交 UI，也不把原有业务差异误记为默认主题迁移新增。
- 审查发现并修复两个实际问题：① `approveSlot` 名称占用、旧名称扫描与名称登记原先误用审核管理员 `actor.id`，现统一用游戏作者 `g.owner_id`；同作者重名必须整体回滚，其它作者同名允许。② map 模块只取 `applyCopyMapEdits(...).map` 会漏掉素材命令对 `componentDefinitions` 的增删改，现持久化完整返回 profile，失败命令组不留半定义／半摘要，不顺带删除原装饰。
- 新增回归先复现 **8 tests／5 pass／3 fail**（两项名称、一项素材捕获），修复后 **8／8**。不涉及原版机制或战斗／存档规则修改。
- 同步两项过期测试合同：schema source 清单换成实际挂载的 `gamecopy`、移出退役 `trials`，仍按既有冻结声明逐表／索引／FK 精确核验（不是从观察结果反写放行门）；删除后重取栅栏预期改为同回执成功，并断言不推进 row revision／registry，以便继续 purge。
- 更正审核已接线、导入字／号留空、共享武将 `0..15` 及旧 UI 皮肤条款等注释／文档。原 `verify_review_ui_model.mjs`、`verify_vps_draft_save.mjs` 原文移入 `tools/retired/` 保留，不将旧 mock 改绿冒充新链验证。
- 重复 `.deploy/` 镜像忽略但保留，本地 `docs/prompt-element-plus-default-migration.md` 草稿只在本地 exclude；无截图、profile、状态库或缓存入提交。两个一次性数据迁移／清库工具仅审查与纳入版本，**本轮未执行，不构成未来运行授权**。全局 `E:/Dragon/AGENTS.md` 在 Git 仓库外，不伪称已纳入此仓库提交。

### 最终验证（本次真实运行）

显式选择下列 30 个测试文件，串行、独立临时状态；不读正式 `SAVE.DAT`，不访问生产。完整命令为：

```bash
node --test --test-reporter=tap --test-concurrency=1 \
  tools/verify_copy_api_bodies.mjs tools/verify_copy_approve_slot.mjs tools/verify_copy_chapter_ops.mjs \
  tools/verify_copy_controller_chapters.mjs tools/verify_copy_controller_cities.mjs tools/verify_copy_controller_copypage.mjs \
  tools/verify_copy_controller_generals.mjs tools/verify_copy_controller_map.mjs tools/verify_copy_controller_modules.mjs \
  tools/verify_copy_controller_posts.mjs tools/verify_copy_generals_manage.mjs tools/verify_copy_map_ops.mjs \
  tools/verify_copy_pin_shape.mjs tools/verify_copy_reject_slot.mjs tools/verify_copy_review_queue.mjs \
  tools/verify_copy_single_slot.mjs tools/verify_copy_validate_gate.mjs tools/verify_publish_controller_slot.mjs \
  tools/verify_review_controller_queue.mjs tools/verify_publish_ui_model.mjs tools/verify_editor_draft_controller.mjs \
  tools/verify_editor_chapter_people.mjs tools/verify_game_purge.mjs tools/verify_editor_schema_sources.mjs \
  tools/verify_copy_http_roundtrip.mjs tools/verify_review_backend.mjs tools/verify_publication_producer.mjs \
  tools/verify_publish_after_retirement.mjs tools/verify_editor_definition_controller.mjs tools/verify_general_library.mjs
```

HTTP 子进程使用隔离端口 `EDITOR_TEST_PORT=18789`。最终 TAP 摘要：

```text
# tests 302
# pass 295
# fail 7
# duration_ms 703137.929
exit 1
```

- 七项失败均为之前已知：definition controller 的六个城池 DTO 用例（名称见 §36 交付记录）、`verify_general_library.mjs:61` 的库级删除／级联口径；本轮未为“全绿”修改这七项断言或对应业务。其它所选测试通过，**不宣称全仓测试全绿**。
- 中间首轮 24 文件是 **217／216／1**，失败为旧 schema owner 清单；补充 HTTP／兼容／基线组是 **85／77／8**，除上述七项还有旧重复栅栏断言。同步两项测试后单独复查 **2／2**，再跑上述最终 30 文件；没有隐去失败尝试。
- `node tools/verify_editor_schema_sources.mjs`：`24 owners / 56 tables / 54 indexes / 368 columns / 4 FK; exact frozen gates after copy/Trial retirement`。
- `node editor-ui/build.mjs && node editor-ui/build.mjs --check`：1000 modules，build **5.52s**／check **4.68s**；JS **1043210 B**、CSS **113943 B**、13 包 notices，同字节通过。
- `node tools/build_trial_web_bundle.mjs`：241 文件，SHA `e41d7a9a4ac3248cd8affb797dc2729278f4ae43d222e527c1c2182456e1e936`，`unchanged:true`；相对提交基线的产物差异属于原有工作，不因本轮未改玩家规则而漏交。
- 候选文件中的 JS／MJS 及四个控制器文本共 **52 项语法检查通过**；未发现意外大文件、二进制或私钥格式。`tools/retired/` 原件另核对保留。
- 主动 LSP／分析器批次：58 文件，15 clean、10 findings、33 inconclusive（1 timeout、32 push-only）；无 error，但有旧 draft deprecation、未改 copy.js／parity 脚本 hint、CLI 日志／嵌套三元样式提醒、原证字节 `0xBA` 拼写误报，以及隔离 HTTPS 测试的自签证书校验豁免提醒。**不能据此称全 clean**；Vue 仍有 §36 的检查限制，不为消告警修改原证字节、业务合同或生产 TLS。
- 文档本地链接／锚点 **49 项通过**，工作区及暂存区 `git diff --check` 通过。最终文档 LSP 有 6 条 Marksman 父目录 AGENTS／SKILL 链接告警，目标文件均实际存在且已由链接检查确认；不为消除工作区索引边界告警改坏有效路径。
- 本次未重跑浏览器逐页验收，复用 §36 已区分真实服务／合成预览的收据；合法已登记源库及完整真实复制／发布浏览器链路限制仍需另行收尾。没有执行数据迁移、部署或 push。
- 原始审查 diff、失败／成功日志及最终完整 TAP 暂存本机 `C:/Users/fczll/AppData/Local/Temp/dragon-complete-commit/`，关键结论已记在本节；临时路径不作为永久测试放行依据。

## 37. 前端架构决策：编辑器采用 Element Plus 默认主题与组件

- **tag**: `architecture`
- **状态**：已接受（accepted），长期有效；来源为用户的默认组件迁移要求及本次明确的长期约定确认。
- **维护归属**：本节保存决策背景与取舍；长期规则维护在[全局 AGENTS §2.3](../../AGENTS.md#23-渲染与状态原则)及[project memory／仓库 AGENTS §3](../AGENTS.md#3-展示交互与文档职责)。实施与验证证据见本文 §36 及[迁移交付记录](../editor-ui/element-plus-migration.md)。

### 背景

编辑器原先混用自造深绿主题、原生 table、自写弹窗与部分 Element Plus 组件，且共用玩家样式。缺少按需组件 CSS 会产生裸 DOM，主题／高度覆盖、表格编辑态与只读态、公共弹层与 Teleport 样式也需要反复修补。用户要求统一采用默认主题与默认组件，并明确这不是一次性换色，而是后续前端页面持续遵循的项目约定。

### 可选方案

| 方案 | 优点 | 代价与结论 |
| --- | --- | --- |
| 保留自造深绿主题、原生列表与自写弹窗 | 维持原有外观和 DOM 结构，短期迁移少 | 继续自行维护控件、表格、弹层及尺寸一致性，与用户要求不符；不选 |
| 使用 Element Plus 组件，但继续自定义主题／皮肤与高度覆盖 | 可保留项目品牌外观并复用部分组件能力 | 默认组件外再维护一层视觉规则，仍可能被旧玩家样式污染，升级时须核覆盖；不选 |
| **统一使用 Element Plus 默认主题、默认组件与默认控件** | 视觉与默认尺寸由同一组件体系负责，减少重复皮肤及自写 UI 的维护 | 接受默认外观和组件 DOM／事件合同，迁移时适配选择器与表单绑定；**选用** |

### 最终选择与取舍理由

1. 编辑器工作台全部现有及后续新增前端页面，长期统一使用 **Element Plus 默认主题、默认组件、默认控件与默认 size**。颜色、字阶、边框、圆角与控件尺寸使用默认 `--el-*` 体系（默认主色 `#409EFF`），不再自造深绿主题或叠加皮肤；例外须另获用户明确批准。
2. 列表用 `ElTable/ElTableColumn`，弹窗用 `ElDialog`（必要时 `ElMessageBox`），表单及按钮使用对应默认组件。自定义 CSS 只负责骨架、间距、宽度、滚动和地图／资源内容布局，不重画标准控件。
3. 选择一致性、可维护性和减少重复实现，放弃专属品牌皮肤及依赖原生 DOM 结构的便利；默认组件并不意味着放弃既有业务状态机，阻塞流程仍控制 Esc／遮罩／明确关闭，中文／繁体文案与交互语义不变。
4. 不另引 UI 框架、图标库或依赖；沿用 Vue 3.5.x＋Vite 6.x，本次 Element Plus 基线为 **2.14.8**。后续版本升级另按依赖变更验证，长期约定指默认体系，不是永久冻结版本号。

### 影响范围

- **适用**：`editor-ui/` 展示层及其预构建的 `server/public/shell-ui.txt`、`shell-ui.css`、`shell-ui-licenses.txt`。这是 Web 产品架构选择，不是原版游戏机制结论，也不授权新增功能或业务改动。
- **不适用／不改**：玩家与 Trial 原生 JavaScript／Canvas 界面、共同编辑／编译核心、server 业务逻辑、二进制格式、存档与战斗规则；玩家列表选中色等游戏约定保持。`server/public/style.css` 仍归玩家，不为编辑器修改；编辑器与它解除样式耦合。
- **文档覆盖**：全局 AGENTS 和 project memory 同步长期规则。旧布局文档中的整页不滚、数据区滚、枚举名称、保存重读等通用目标继续适用；固定 34px、自造高度变量、原生 table 皮肤与共用玩家样式的旧要求已被取代，不得借旧文档重新引回。

### 后续注意事项

- 组件按现有模块路径按需引入，并在 `editor-ui/src/main.js` 同时导入对应 `style/css`；`theme.css` 仅布局，不新增主题变量或控件尺寸覆盖。新页面默认沿用此约定，无须逐页重新确认。
- 保留中文／繁体、id／data-* 测试及控制器协议；组件事件传值、空字符串有效选项、数组多选、表单 reset、Teleport 与阻塞弹窗都按现有合同验证，不能因换组件悄改语义。
- 展示修改后先 build 再 `--check`，同步三份产物；重启自己持有的 import 静态资源的 dev 实例，使用全新 profile／禁缓存检查默认外观、console 与行高。布局例外只服务内容几何，不成为重新自造皮肤的入口。
- 本次只补决策记录与长期记忆，**未重跑实现构建、业务回归或浏览器验收，未部署**。§36 的合法已登记源库与 Vue LSP 缺口仍在，默认体系已获批准不等于完整真实业务流程已验完；旧规范全文同步仍属后续文档收尾。

## 36. Element Plus 默认主题与默认组件迁移（本轮）

### 范围与实施

- 用户要求仅迁 `editor-ui/` 展示层，EP 升至 **2.14.8**，Vue **3.5.44**／Vite **6.4.4** 保持；保中文／繁体、id／data-*、回调参数与交互语义，不改业务、玩家样式、二进制、存档或规则，不加依赖／图标库。
- 完成 27 个 Vue 文件的增量修改；`PortraitPreview.vue` 已检查但无需修改。逐面板改前／改后、完整文件清单、原始输出与布局理由统一维护在 [迁移交付记录](../editor-ui/element-plus-migration.md)，本日志不重复整张清单。
- `package.json`／lock 升 EP；`main.js` 集中补组件 CSS，编辑器挂载时移除玩家 `/style.css` link，默认字体供 Teleport 继承；新增 `theme.css` 只留 grid／flex、间距、宽度、滚动、资源图尺寸。
- 列表改 `ElTable/ElTableColumn`，输入／选择／多选改对应默认组件；公共自写遮罩改 `ElDialog`，进度用 `ElProgress`，地图工具菜单改 `ElPopover`。`Workbench.vue` 的 ConfigProvider 用默认 size、繁体 locale、`empty-values=[null, undefined]`。
- `GeneralsPanel` 修缺失排序回调与错误 ElInput slot，补齐动态列／字段标记；保头像选择、姓名 diff、0..15 能力、分批导入与失败关闭时序。`StrongholdPanel` 保双向排序、原数字校验与保存边界。
- 正式重建 `server/public/shell-ui.txt`（服务 URL `shell-ui.js`）、`shell-ui.css`、`shell-ui-licenses.txt`；只有这三份构建输出获展示层任务授权，未修改其它 server／authoring／game 文件的既有差异。

### 调试经过、失败尝试与修正

1. **裸组件／旧主题污染**：初始 main 只有 button／message-box／tag 样式，ElTable 缺样式；玩家 style 又定义旧主色和控件覆盖。修正为逐组件 CSS 导入＋只在编辑器卸载旧 link，不改玩家文件、不再叠皮肤。
2. **旧产物与 ESM 缓存**：最初 `--check` 报 stale，它不会写产物；改为先 build，再 check。服务 import 静态文本，必须重启自有实例；无效的快捷键刷新改用 CDP 禁缓存后 reload，确认实际加载新包。
3. **表单兼容**：原生 fieldset 无法可靠下传组件 disabled，资源区改 ElForm；表单 reset 与外部 DOM 资料填值须兼容 ElInput。真实资料保存已验证，不将密码／源对象交给壳模型。
4. **组件事件不是原生事件**：ElInput／ElSelect 回调传值而非 `event.target.value`；保数字／空值处理交原边界，不借迁移新增 clamp。数组复选用 ElCheckboxGroup；跨页已选集合不能随当前页丢失。
5. **空字符串选项**：默认 Select 把 `''` 当空值，影响「中立／自由／清空」等有标签的有效选项；ConfigProvider 明确排除 `''`，不改业务值。
6. **弹层与进度**：不定进度给读屏的 `aria-valuenow=null`，不伪报 50%；运行／失败阻塞框禁 Esc 和遮罩关闭，地图菜单仍允许 Esc。截图禁动画，避免淡入中间帧被误判成浅色皮肤。
7. **真实库阻塞**：正常启动撞 `INVALID_RESOURCE_LIBRARY`／消费者指纹不匹配；隔离 `--no-library` 后可验登录与空壳，但完整复制返回 **403 `SOURCE_NOT_REGISTERED`**。未改 manifest、库身份、服务门或用户数据来强行通过。
8. **替代覆盖有限**：临时 Vite 预览用合成 DTO＋stub actions 检查组件外观／参数；不连后端，不是原版机制或真实发布链证明。Vue LSP 超时也未用编译成功冒充全 clean。

### 验证收据（该批次真实输出，整理文档时未重跑）

| 命令／范围 | 结果 |
| --- | --- |
| `cd editor-ui && node build.mjs && node build.mjs --check` | build 3.97s／check 3.72s，1000 modules；JS **1043210 B**、CSS **113943 B**、13 包 notices；随后独立 check 同字节通过 |
| `node --test tools/verify_copy_generals_manage.mjs` | **15 tests／15 pass／0 fail**，479.3062ms |
| copy controller 5 文件＋definition controller＋chapter people（完整命令见 AGENTS §5／交付记录） | **114 tests／108 pass／6 fail**，34035.0129ms，退出 1；失败名称与改前 baseline 一致 |
| `node --test tools/verify_copy_chapter_ops.mjs tools/verify_copy_single_slot.mjs tools/verify_copy_validate_gate.mjs` | **12 tests／12 pass／0 fail**，79790.9791ms |
| 文案／选择器／范围审计 | 原中文模板片段缺失 0，必需静态 id 无丢失；动态 data-* 人工复核；会话前后 UI／三产物以外 diff 变化 `[]`；玩家 style SHA 未变；`git diff --check` 退出 0 |
| 主动 LSP＋session all | 32 文件：2 clean、30 inconclusive（29 timeout＋1 push-only），0 diagnostics **不等于全部 clean**；最终 main.js／theme.css 主动确认 clean，all 仅未改 copy.js:76 既有 unreachable-code hint |

六个失败均在 `verify_editor_definition_controller.mjs` 的城池身份／名称 DTO 用例；完整名称与基线对照见交付记录。另一个已知 `verify_general_library.mjs:61` 本批**未另跑**，不计通过，也未为“修绿”改业务或测试。

### 浏览器：真实服务与合成预览分开

- 8443 已有别的实例，未停止；自有隔离服务使用 `node tools/dev_editor.mjs --port 8444 --store E:/Dragon/.dragon-analysis/element-default-ui --no-library`。新 Playwright profile，修改后重启并禁缓存 reload，无生产操作。
- **真实服务**：登录后 11 个主导航、资料／密码页与账户菜单无捕获的 console error／pageerror；资料保存并重读成功。默认主色 `#409eff`，玩家 style link=0，页面与 viewport 同为 1000px，无外层滚动。初始未登录 session 的 401 不包含在“登录后零错误”结论中。
- **合成预览**：27 面板逐页截图，`errors=0 / non-default-primary=0 / outer-scroll=0`。Generals 只读／编辑行均 **49px**，改名仍送原 patch；实际 7/20 显示 **35%**；跨页多选保留页外项；Publish／CopyGame 的 Esc 阻塞、Review 明确取消、地图菜单 8 项及 Esc 关闭均核对。只证明展示与所测回调。
- **未验完**：真实原章复制后编辑、真实头像字节、完整发布／审核／删除，受源登记阻塞；尚需 Vue／JSON 的完整主动 LSP。
- 本机证据目录：`C:/Users/fczll/AppData/Local/Temp/dragon-element-migration/`，有会话前备份、`final-build.log`、`generals.log`、`controllers.log`、`chapter.log`、`baseline-definitions.log`、`browser-*.log`、`audit.log`、逐页截图与三张 contact sheet。临时预览源已移到该目录 `preview-source/`，未进发布包；profile 会话和自有 8444／8445 服务已关，原 8443 未碰。临时目录不是永久证据仓；关键输出已收进交付记录，不保存测试口令。

### 当前阻塞与下一步

1. 使用**合法可用且已登记**的资源库补真实源全流程，不通过改指纹或放宽准入绕过；使用原 8443 时由其持有者重启加载新产物。
2. Vue LSP 可用后补全未确认文件；六个控制器既有红另案定位，不扩大展示层任务。
3. [旧布局规范](editor-ui-layout-spec.md)、[工作台结构](editor-workbench-structure.md)与 copy 任务清单仍有 34px／旧 API／旧阶段文案，后续文档专项同步；本次在 memory 明确现行覆盖关系，没有擅改这些维护源或实现。
4. copy 地图／定义面板改绑、旧链清理、非内置测试数据清理仍按独立范围推进；清理真实数据先列清单与一致备份并取得授权，不因 UI 迁移完成自动执行。
5. 本地实施／验证不等于部署；commit／push／上线分别按明确授权处理，不作为本轮文档交付的前提。

## 14. 批次 J：同意上架 422 SOURCE_RUNTIME_BINDING＋审核页重复提示（2026-11-11）

- **根因与修复**：copy 的批准引用无旧快照 `rootKey`，却走 `runtimeassets.capture()`，包准备真实链报 422；`runtimeassets.js` 增带 live-session／SHA 校验的 `readShared()`，`playpacks.js` 季节图改用共享读取，保留来源／role 绑定及批准事务的新鲜度门。此前 approve 注入桩未覆盖 `prepare→visuals→capture`，不能当真实链通过。
- **提示修复**：`review.txt` 与页面 `#status` 重复报错；`ReviewPanel.vue` 去掉重复一行，只留全局提示，控制器模型与测试不改。
- **既有验证收据**：`verify_copy_http_roundtrip` 加真实同意段通过（105s），20 章源只读包准备通过；review-queue 9/9、approve-slot 2/2、UI build／check 通过。以上未在本轮记忆整理重跑。
- **旧浏览器 lane**：`verify_review_ui_browser.mjs` mock 旧 `/api/admin/reviews`／listing，与现 copy API 不符，HEAD 同样在 L112 失败；不是本轮默认主题引入，尚不能拿旧 lane 证明新流程。

## 15. 批次 J-2：同意成功却无反馈＋上架管理仍待审核（2026-11-11）

- `review.txt` 内外层透传成功结果，标题提示「已同意上架版本 1.0。」；`gamecopy.js#approveSlot` 同事务写 `listed=1`，受限拒 `409 LISTING_RESTRICTED`。旧版同意只写 formal 不置 listed，导致玩家目录永远不可见，**不只是显示问题**。
- submission 增「已上架，修改后重新检验」禁用理由；审核空列表改中性文案。涉及 `server/gamecopy.js`、`server/public/review.txt`、相关控制器／回归和壳产物。
- 既有收据：approve-slot 2/2（含 listed 与受限拒绝）、真实链回放、review-queue 9/9、UI build／check；本轮未重跑。新流程下架 UI 尚无入口；生产未因本轮工作改动。

## 34. 编辑副本简化收尾：删除重试打通＋冻结基线对齐＋上架章门恢复（2026-11-11）

- 已实现：purge 兼容老库缺表、回执如实计数；已有栅栏可零写重试；`PURGE_INCOMPLETE` 附残留表；review 删除 outcome 结构化、单弹窗逐项状态；publish 先查章节引用再全量检验。冻结声明补 copy 三表、剔退役 trial 的 exact 形状，inventory 留老库兼容。
- 相关文件：`server/{gamepurge,deletionfence,deletioninventory,deletiondefinitions,deletionschema,deletionindexprojections,deletionuniquerows}.js`、`server/public/{review,publish}.txt`、ReviewPanel、purge／review／publish 回归及 fixtures；详细差异见 [copy 清单 §7–§8](copy-simplification-tasks.md#7-2026-11-11-补记删除失败冻结基线对齐上架章门恢复)。旧 UI 模型 lane 退役到 `tools/retired/`，不改旧断言冒充新链覆盖。
- 失败教训：裸拷 WAL 库漏数据→改一致快照；仅 check 不 build→仍下发旧包；删除回执只认修订+1→已栅栏重试误杀，改允许等值；尝试 supervisor stdin 不可写→重启自有进程。purge 保持**单事务原子性**，不为进度显示拆事务。
- 该批已有 purge 12、review-queue 9、publish-slot 8 等收据及隔离浏览器删除验证；不等于当前全仓回归通过。批量非内置数据清理、地图／定义面板及旧链收尾未因这些局部通过自动完成。

## 35. 游戏级武将管理重写：父表库行编辑＋自杀旗＋头像相册（2026-11-11）

- 最终合同：姓名库内唯一、只发改动字段，六能力 **0..15**（先前 1..15 裁决已撤销）；自杀旗为游戏级属性，关联原生槽只改 bit4，`generalId:null` 原生槽不被库同步。头像走既有只读清单与 manifest，不新开资源通道。
- 原章有武将不等于父表库已导入；空库需要显式按姓名去重导入。首次 466 条约 68KB，被 HTTPS **16KiB** 上限拒 413；改 **64 条／批**，实测最大 9481B，逐批真实进度、成功前缀保留，失败明确关闭后可重试。
- 字／号拆分：新增 `zi` 保存但不影响原生槽；不再把原版 6 字节称呼直接填入库 `hao`，导入字／号为空、人工维护。旧误填库曾经授权清空重导；这不是以后可自动清库的授权。
- 失败教训：DTO 精确键集未同步导致整页拒收；把合法 `portraitRef:null` 当校验失败；相册 await 清单后才开导致首点无反馈。相册已改立即打开、异步读清单、图片 lazy／async。
- 相关文件：`web/src/content/authoring/{generaldefinitions,gamesource}.js`、`server/gamecopy.js`、`server/public/draft.txt`、GeneralsPanel／Workbench、`verify_copy_generals_manage.mjs` 与 `clear_copy_generals_once.mjs`。原来多轮 34px／基线／圆角／自写遮罩补丁已被 §36 默认组件方案整体替代，不再保留为现行修法。
- 最新指定覆盖见 §36：generals 15/15；保留的已知红为 `verify_general_library.mjs:61`（库级删除／级联口径）及 definition-controller 六项城池用例。不得宣称全绿。

## 本次 project memory 整理

- 完整检查当前两份记忆、EP 交付记录、copy 收尾清单及相关源文件；CodeGraph 超时后用文件／源码核对，没有解锁索引、改配置或扩实现范围。
- `AGENTS.md` 删除旧镜像／摘要／行数快照、代理环境细节、退役 CF 部署命令和重复机制推导；保留稳定边界、模块职责、copy 当前状态、默认 EP 决定、构建／重启／库准入／WAL／部署锁步等坑点与常用命令。
- journal 将旧 A–I 批压成归档索引，保留未提交 J／J-2／34／35 的关键根因与状态；新增 §36 的实施、失败、真实输出、覆盖限制与下一步。未将“历史待验收／待提交”写成新任务阻塞，也未把旧生产快照升级为当前线上事实。
- 只改上述两份文档；整理前完整副本暂存本机 `C:/Users/fczll/AppData/Local/Temp/dragon-memory-cleanup/`，其它会话改动不覆盖。本轮核对本地链接／兼容锚点、`git diff --check`，并逐字比较两文档以外的 diff 与未跟踪文件清单，均无意外变化；不重跑无关游戏／服务测试，不提交推送。
- 主动 LSP：首次 AGENTS 出现 6 条 Marksman 跨工作区链接告警（父目录 AGENTS／SKILL），实际文件存在，未改有效路径；最终再次探测两份文档均 clean、0 diagnostics。session `mode=all` 含历史诊断缓存，不当成本轮全仓检查；归档段仅为兼容旧链接局部允许 HTML 锚点。

## 归档索引与兼容锚点

旧 A–I 批：发布账本退休恢复、检验落库／四层显示、sadcloud 搬迁、共享据点父子投影与异名迁移、章节五属性写入和 UI 对齐。当前权威分别见[存储布局](game-storage-layout.md)、[据点合同](editor-city-definitions.md)、[字段原证](re-notes-entity-fields.md)、[草稿性能调查](re-notes-draft-performance.md)。旧 UI 的深绿主题、原生 table、公共自写遮罩、34px 覆盖已撤销；旧性能 LRU 原型因跳过 blob／epoch 检查造成 11 红曾回退，不是已交付优化。

以下入口只为旧链接定位，**不复活旧合同／旧部署状态**；未在本文件保留的细节查 Git 历史与对应维护源。旧文档的 §4.x／§45–§47.4 等数字引用也属于当时日志编号，不指向本轮章节。

<!-- markdownlint-disable MD033 -->
<a id="5-当前时钟系统逆向与重构本地完成"></a>
<a id="8-用户指定五档提速"></a>
时钟／指定提速：[战略时序](re-notes-strategic-time.md)（含旧批验证边界）。

<a id="6-发布主线阻塞与下一步"></a>
旧发布阻塞已被后续批次替代，见本文「当前主线与状态」。

<a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a>
<a id="9-battle-text-reflow-1战术双方对白自动折行"></a>
<a id="10-014发布整理"></a>
<a id="10-录像反馈后的战略性能修复"></a>
<a id="10-录像反馈后的战略性能修复--10-014-发布整理"></a>
表现／对白／性能旧批：[表现合同](presentation-modernization.md)、[战术生命周期](re-notes-tactical-lifecycle.md)及 Git 历史。

<a id="11-015发布整理"></a>
<a id="11-编辑器vps部署前只读盘点"></a>
<a id="11-编辑器vps部署前只读盘点--11-015-发布整理"></a>
<a id="12-受限编辑器容器部署"></a>
<a id="13-固定库刷新与私有trial接续"></a>
<a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署／固定库／Trial 收据：[VPS 就绪历史](vps-editor-readiness.md)、[库身份与私有字节合同](editor-backend-private-byte-context.md)；现行生产见存储布局 §18，编辑器 Trial 已退役。

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
早期 Vue 壳／固定库／受限上线：[框架壳合同](editor-framework-shell.md)、[迁移清单](editor-ui-migration-checklist.md)、[早期审计](editor-ui-final-audit.md)。默认组件后继以本文 §36 及其交付记录为准。
<!-- markdownlint-enable MD033 -->
