# 新对话接续提示词：精灵素材库与地图工作台第二阶段

> 本文件保留**最初设计轮的启动提示词**，不是当前实施状态或新的执行授权。下文“本轮只写文档”“前一goal已complete”和基线提交仅指当时设计轮／上一阶段，不适用于已经启动的第二阶段持续目标。接续先查看当前goal、[设计与S0–S6清单](map-workspace-sprite-library-design.md)及[逐项证据审计](map-workspace-sprite-library-audit.md)，不要重做已验证步骤，也不要据旧提示词重建goal或宣称当前任务完成。实施范围以用户当次授权为准。

将下面整段发送给新对话即可：

---

请实施 `E:/Dragon/web-port/docs/map-workspace-sprite-library-design.md`，按其中S0–S6连续推进。此次以我发送本提示词作为本地实施授权；不授权commit、push、部署、生产/真实数据迁移或访问用户存档/profile。不要仅复述计划，有清晰且已授权的低风险步骤就继续做；只暂停真正受阻的部分。不要把方案或旧绿色测试直接当完成证据。

## 工作环境与阅读顺序

- 仓库 `E:/Dragon/web-port`，建议从 `E:/Dragon/web-port/editor-ui` 启动，确保私有Vue LSP配置生效。所有回复中文并以“tianyi,”开头。
- 先读 `E:/Dragon/AGENTS.md`、仓库 `AGENTS.md`，再读新设计全文及现有 `docs/system-base-map-design.md`、`docs/editor-ui-layout-spec.md`、`docs/editor-framework-shell.md`。
- 地图相关再按适用范围读 `docs/game-editor-design.md`、`docs/game-editor-technical-design.md`、`docs/game-map-migration-plan.md`、`docs/re-notes-editor-map-admission.md` 和 `E:/Dragon/.agents/skills/re-data-formats/SKILL.md`。机制结论须原证，不把文档/现状反向当原版证明。
- 先 `git status --short` 与 `git log -1`。实施基线提交为 `172ffe0193a43555d00f517b97d4353e0f83b65c`，上轮已推GitHub；本次设计文件/索引可能尚未提交，属于需要保留的用户工作。不要reset/clean，不要擅自覆盖其它会话改动。重新核当前HEAD，不假定一直未变。
- 结构导航先CodeGraph。前会话工具曾超时；若仍不可用说明后降级明确源码读取/搜索，不改锁、全局配置或工具信任。

## 用户真正要的方向

1. 顶部工具合并一行，季节/全图/放大/缩小靠右；四季是“春夏秋冬四个TAB”，不是下拉框。默认春季，只有一份地图布局，任何季节编辑都映射其它季节。
2. 整个编辑器左导航用ElMenu collapse模式，菜单项带图标、底部折叠开关；删两行“草稿與正式版本分離／遊戲規則共用同一引擎”，保留简洁授权入口。折叠后地图自适应并保持视口，不重读或丢输入。
3. 放大时单元格网格清楚；取消中间常驻小地图，四层用紧凑眼睛/锁图标，减少属性区宽度/说明/内部哈希。不能删除玩家小地图或自动小地图编译功能。
4. **素材库是核心，不是仅把2357项旧列表改成图片墙。** 以已解码原始图块/四季图集提炼分类、去重、可拼接的组件；默认相册不展示大量从原地图切出的不规则片段。图层与素材分类分开。
5. 相册原生像素显示，不把16px图块撑成64px；名称不常驻，分类TAB＋分页；拖放到格、幽灵预览、锚点吸附、一次操作可撤销。保留键盘操作。
6. 海域自动平铺背景，不让用户摆成千上万海水元件。但游戏编译仍需明确逐格byte/地理；不能用背景掩盖unknown，不能把既有模板或普通新建悄悄改成空白海图。

## 已有能力，不要重做

系统基础地图独立SQLite单槽、管理员读/初始化/保存、两种创建单快照实例化、两工作台共用Canvas/命令、copy摘要票据、真实HTTPS与同玩家加载器已打通。上一阶段B0–B7 42项的历史审计在 `docs/system-base-map-completion-audit.md`，不修改其完成状态来充本轮进度。

主要接缝：
- `editor-ui/src/{Workbench.vue,main.js,theme.css,BaseMapPanel.vue}`。
- `editor-ui/src/{basemap.js,basemapworkbench.js,gamemapworkbench.js,mapcanvas.js,mapatlas.js}`，源/图片在框架外，Vue仅DTO/动作。
- `web/src/editor/{mapcommands.js,componenttools.js}`、`server/{mapworkspace.js,systembasemap.js,systembasemapstore.js,gamecopy.js,editorapp.js}`。
- `tools/system_base_map_pieces.mjs` 是旧视觉区间/四邻接/16×16格分片算法，不是本次精炼目录算法。

## 先处理的难点

- 初始2357定义=256原子＋2101去重片段；不是2357种原版独立精灵。截图2358多出项未查真实模板，不能推断来源。
- 精灵解码完成不等于多格自然对象/拼接语义已闭合。先输出全部256槽的来源、四季、类别、严格重复/视觉相似和支持状态；山地/河流/墙段/农田先做样板，再覆盖全目录。Web组合明确标注，不凭观察补规则。
- 精炼库不要删除旧片段定义，实例仍引用它们；展示隐藏不是持久数据清理。目录应版本化、可追溯；新配方在所属模板/copy物化，服务端登记验证，不接受客户端任意recipe/预算。相册去重不能把规则不同但像素相同的byte合并。
- 海水平铺图块/周期配方须核实四季和接缝，不能随意指定tile编号。现行“非水装饰不擦除下层水域地理”，全海base上贴陆地并不会自动使小地图变陆地：按设计§8明确基底地理写入和可撤销语义，不偷偷改共同composer规则。
- 仍固定384×256/192槽，不扩容、不开放任意道路/移城。不把道路外观拖放等同拓扑连接。不可用功能明确禁用，不摆空按钮。
- 不自动迁移生效模板、旧copy/publish/formal或原版源。旧copy缺mapEditorAssets仍明确拒绝。程序目录更新不自动重导入系统模板，不让内容保存触发构建/部署。

## 执行与验证

按新设计S0–S6逐项落地，更新其清单与证据，不新建一个与旧goal混淆的长目标；只有我明确要求追踪goal时才创建。前一长期goal已complete，不要重新激活或重复结算它。

先完成明确的独立UI改动与源盘点，目录/规则未知只阻塞相关配方。全库数量不要先拍脑袋；未知项如实列出，不能用“高级入口兜底”冒称全部语义整理完毕。样板审美/边界确需我判断时，提供可见样例、候选及影响，再一次性问具体问题；不要反复问已批准的布局和四季方案。

验证必须覆盖新功能：原像素/分类去重、四季一致、拖放/格对齐/DPR/取消、菜单折叠/权限/dirty、海域/地理/unknown、旧源保真、两种创建隔离、真实保存后重读及发布同引擎消费。具体命令/用例见设计§10。合成DTO、真实资源夹具、真实隔离HTTP、玩家loader端口和生产分别报告，不混称。

- Vue改动build再check，提交产物壳三件套按现有约定同步；web/src改动重建trialweb。
- 独立Vue LSP＋支持的变更文件主动LSP＋mode=all，push-only/超时不称clean；之前ChaptersPanel已有TS6133提示。
- 使用新Playwright context/profile和自己持有的隔离服务，绝不读写真实SAVE.DAT或用户profile，不停他人服务，不擅装依赖。
- 可参考前会话已有浏览器安装（先核存在，不保证版本永远不变）：PLAYWRIGHT_MODULE=`C:/Users/fczll/AppData/Roaming/npm/node_modules/playwright-core/index.mjs`；PLAYWRIGHT_CHROMIUM_EXECUTABLE=`C:/Users/fczll/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe`。真实HTTP回归可用空闲EDITOR_TEST_PORT；此前19837是隔离测试端口，不保证现在空闲。
- 不跑verify通配；重任务串行。旧测试失败先核当前合同，不能为跑绿恢复Trial或放宽SHA/身份门。

完成前建立“每条用户要求→具体文件→具体测试/截图/输出”的核对表，清楚列出未支持规则、未迁移真实数据、未跑/未确认验证。不以build成功或大量测试通过替代素材库本身和交互验收。新发现回流详细文档和journal，保持长期AGENTS简洁。交付本地变更即可，不自动commit/push/deploy。

---

## 当前设计轮交付边界

新设计和本提示词仅供下一会话实施；截图位于用户临时目录，可能失效，不能作为唯一交接证据。关键内容已转成文字、布局图、数据约束和验收清单。设计轮只验证文档链接/锚点/范围与diff，不宣称新代码或UI已完成。
