# Web 扩展基础：第一阶段

> 本文记录第一阶段落点；其中四槽/整包存储、整季资源的后继已在[第二阶段](web-refactor-phase2.md)演进，下面“刻意保留”不再是阻止扩展的长期政策。

## 范围与版本

用户批准先做行为不变的基础重构。保持原生 ES Modules + Canvas 2D、静态部署、单一规则/AI/UI 内核；本阶段不扩容、不改数值、不改地图或交互、不改变未覆盖输入的失败边界。

- 参考实现：Git `061e221`（Web 0.1.1）。不是前次分析的 `1112dcd`，其后的修复均保留。
- 运行规则标识：`content/ruleprofile.js` 的 `ki-1995 / web-0.1.1`，由 catalog 暴露。它是 **Web 实现版本**，不是“DOS 已全部证明”的认证。
- 内容/章节 revision、world revision、roadVersion、存档 schema 各有职责，不互相替代。本阶段不改既有快照 metadata/schema；规则 revision 暂不新增为存档准入字段，跨规则版本存档兼容尚未开放。
- `tools/fixtures/refactor-baseline-0.1.1.json` 固定了六项生成内容资产 SHA256、20章 fresh/JSON恢复后的快照摘要、128槽的16批脚本化调度及 RNG 轨迹。参考由修改生产代码**之前**采集。

运行 `node tools/verify_refactor_baseline.mjs` 比对；`--record` 只允许创建不存在的基准文件，不能覆盖已有参考。未来确需改变规则/内容时，应新增经审查的版本与基准，不能为了让测试通过刷新旧文件。现存模板修改因此会触发差异，而不是被悄悄接受。

此基准是防止重构漂移的 **characterization test**，不是独立 DOS oracle：调度操作后的模拟效果是固定测试输入，不是第二套 AI；未声称覆盖完整战役、所有用户输入或所有消息分支。原证回归继续负责机制验证。

## 状态所有权与依赖合同

| 层 | 唯一职责 | 禁止事项 |
| --- | --- | --- |
| 内容 `content/` | 章节模板、世界定义、标识；新局显式克隆模板 | 不把模板当 live state，不从存档反改内容 |
| 规则运行态 `Scenario` 与 native adapters | 固定表、RNG、调度游标、规则 RAM/known 边界与续段 | 不用显示列表反建原表、不补未知 byte、不把 RAM 当可丢弃缓存 |
| 世界资源 `worldresources.js` | 捕获并冻结 definition，持有该世界道路/地形资源实例和懒加载四季图入口 | 不入快照、不热替换当前局、不改变寻路/容量门 |
| 派生表现 `MapView` / 图像缓存 | 读取世界定义与场景，绘图；缓存以资源 URL 为键 | 不推进规则、RNG 或导航；修改内容需版本化 URL |
| 快照 `game/savegame.js` / `scenarioassembly.js` | 守卫、克隆、完整性/身份检查、JSON恢复与 detached 装配 | 不读写数据库，不为存储后端修补规则 |
| 仓储 `core/saverepository.js` | `load()` / `save(slots)`、四槽规范化、隔离对象所有权 | 不解释 AI/规则，不选择恢复场景，不返回后端可变别名 |
| 存储适配器 `core/indexeddbsavebackend.js` | `read()` / `write(record)`、IDB事务及连接关闭 | 请求成功不等于事务提交；错误/abort必须拒绝 |
| App | 注入仓储和世界；保存排队、守卫、成功后更新UI状态；装配票据 | 不能因替换存储后端绕过快照守卫或标题读档流程 |

`core/localstore.js` 仅组合默认仓储并保留旧函数门面。App 使用 `saveRepository`，因此以后更换本机存储结构只需实现同一边界，不让数据库逻辑侵入规则引擎。异步后端必须在真正提交后 resolve，在失败时 reject；当前未增加服务器后端或联网同步。

四季位图经 `app.world.loadSeason()` 进入；MapView 通过注入 getter 读取同一世界定义。异步返回同时核对场景票据、world 实例与季节，旧世界位图不得写回新世界。默认门面仍保留供已有调用方使用；其余工具栏、小地图、规则坐标与容量约束未全面参数化，本阶段不声称支持任意地图尺寸。

## 刻意保留的合同

- IndexedDB 仍为 `wolong-web` v1、`saves` store、`slots` 单记录，仍四槽；没有迁库、清库或访问实际用户存档。
- 保存仍经过 App 串行队列、snapshot guard、事务完成后才更新 `app.saves` / 已选槽。失败保留旧档。
- 快照字段与 RAM 权威不搬家，不因“整理职责”重写大段规则模块。现有恢复会将部分 sidecar 默认字段具体化到 state，故 fresh 与 restored 分别固定摘要，不能武断要求对象字节相同。
- 192城、128军团、24外交槽、byte/word语义、有序边与规则轮询顺序全部保留。扩容必须另行设计，不以修改常量宣称完成。

## 后续接点

1. 多档/单档记录、摘要与导入导出：从 repository/transport 层演进，并单独设计列表UI与格式版本。
2. 地图编辑/分块渲染：从 world definition/资源入口演进，先保持原容量与拓扑合同。
3. 更大世界和更多据点：先解开节点地址/ID、哨兵、固定槽与调度的耦合，再按批准的扩展规则处理；不能简单换 `length`。

验证批次、失败和具体执行结果维护在 [checkpoint journal](checkpoint-journal.md)，不把本设计文档当永久健康证明。
