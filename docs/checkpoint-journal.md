# 檢查點日誌

長期事實、架構、命令與約定見 [AGENTS.md](../AGENTS.md)（Web）與[全局约定](../../AGENTS.md)。本頁只记会话进展、失败教训、阻塞与下一步；结论先查 AGENTS.md，不把本页当授权或原证。

## 当前主线状态（2026-11-26）

- 小地图显示已闭环：终态 `minimap-style-7-high-coast`（DOS 质感：哈希杂点／绿河／4px 海岸投影／drawMini 关平滑保 1px）；`trialweb.txt` 已重建。`81b36c5`、`6a28cf3` 已推 `github/main`。用户包已上架 1.5。
- 副本地理回填完成：副本 8c05e6a0 `base.geography` 全海→inferred-sea-edge-connected 回填（digest `de05…`，备份在系统 Temp 可回滚；sea-ground policy 同步移除）。
- 游戏列表行高：通用 `openListDialog` 一处改全覆盖（表头 30／行 20＋4px 间隙，pitch 命中；菜单式自适应列表除外），已推 `6a28cf3`。
- 待查（旧项，均不阻塞主线）：外交／预算同批连续事件验证；攻城伤亡内置与发布路径全程对照。

## 失败教训（已纠正，保留结论）

- stale-child 误判：曾把用户旧画面归因子进程旧码，实锤为用户旧会话抱着 1.0 包＋地理数据分层（图块 12% 海 vs 地理 100% 海；下采样海应 13.3% 实际包底图 59.8%；markers 走剧本故三城标记一直对）。
- 底图移位误读：用户要的是投影下沉不是底图移位，DISP_* 已全数回退（mappanellayout/gamebar 回 HEAD 无差异）。
- seed 校验刻舟：style-3「seed 不影响输出」断言随 style-5 改为「同 seed 确定、异 seed 杂点不同、掩码一致」；中间态 style-3／style-4／style-6 已被终态取代不再单独追溯，style-4 河蓝已回退（内置同步恢复绿河）。

## 历史定位与相容锚点

§195–231 见 `git show 22b287b:docs/checkpoint-journal.md`（建城流程 §229、战场接线 §230、当时推送收据 §231）。较早批次见[§73–194 归档](checkpoint-journal-archive-73-194.md)、[早期归档](checkpoint-journal-archive-through-72.md)、[收据缺口](historical-receipts.md)。以下锚点供旧連結转接；使用历史收据时按批次查閱不作当前授权。

<a id="184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push"></a><a id="186-d2-event-64p0p1隔离审计与一次性决策包未实施未push"></a>
§184–187：[事件调度归档](checkpoint-journal-archive-73-194.md)。

<a id="79-sea-ground-1全幅海域基底与地面轮廓"></a><a id="80-atomic-catalog-1单格素材库与单层分类"></a><a id="81-atomic-preview-2分类更正植被核对与32px预览"></a><a id="82-atomic-spring-neutral-3固定春季与中立据点素材"></a><a id="84-map-space-4地图优先布局与对象右键菜单"></a><a id="85-map-space-5紧凑布局与原始比例"></a><a id="87-map-pan-lock-1地图拖动锁定切换"></a><a id="88-city-group-1四套配方与放置接缝待确认"></a><a id="89-city-group-preview-1据点组只读素材展示"></a>
§79–89：地面、素材與工作台历史；[现行地圖合同](map-atomic-catalog-contract.md)。

<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a><a id="49-共享头像文件及资产id数字重编号"></a>
[§37 預設主題決策](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)；[§49 頭像身份決策](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。

<a id="10-014发布整理"></a><a id="11-015发布整理"></a><a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a><a id="5-当前时钟系统逆向与重构本地完成"></a><a id="6-发布主线阻塞与下一步"></a><a id="8-用户指定五档提速"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-录像反馈后的战略性能修复"></a><a id="11-编辑器vps部署前只读盘点"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a><a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a>
§5–33：時鐘、表現、早期部署與 Vue 工作台見[旧收据索引](checkpoint-journal-archive-through-72.md)。

## 本轮整理（2026-11-26 只读瘦身未改代码）

- 沉淀到 AGENTS.md（Web＋父 2.3）：终态 style-7、1.5 主线、地理分层坑＋回填工具、supervisor 不补 fork、Canvas 列表行高。
- 删：MINIMAP-FLAT 英文旧节及 16:40 correction；PLAYER-LOCAL 过时交付边界、旧下一步及四行旧问题定位表（已解决旧会话细节，原文查 git show 6a28cf3）；style-3／4／6＋底图间距四个中间态详节；全部 stale 未提交标记。
