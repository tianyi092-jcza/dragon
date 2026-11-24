# 檢查點日誌

長期架構、命令及驗證約定見 [AGENTS.md](../AGENTS.md)。本頁記錄交接，不代替原證或部署授權。

## MINIMAP-FLAT | small-map flatten to builtin (style-3 uncommitted)

Web product decision (user approved builtin flat look, not original mechanism): style-2 bands/dither formed large grey blotches (user called mountains) atop the north-expanded world. Established: renderMinimapPixels only consumes 0-land/1-sea/2-river/3-lake; mountains never enter the base. Style-3: flat land (coastal shade only), solid sea, rivers/roads/markers/viewport unchanged.

- change: minimap.js landPixel flattened + MINIMAP_STYLE_REVISION=minimap-style-3-flat-land + sea de-checkered; 3 seed assertions synced; trialweb.txt rebuilt.
- verify: node --check pass; verify_minimap_seed/groups/system_base_map_minimap all pass; offline base 17KB->4KB flat; 8443 child reloaded, 8321/8443-play 200.
- untouched: builtin compiled bases (already flat), acceptance history, controller-test mock strings.
- pending: published local 1.0 base frozen at approve; user re-submit->review->shelf to refresh; commit/push need separate auth.
- play dropdown now shows revision label (playapp.js live module, no bundle needed; verified served with new string); status line also shows loaded revision. If user still sees old art: refresh /play (stale entries list), confirm label is the new version; else republish again on the reloaded child.

- correction 2026-11-24 16:40 UTC+8: 1.1 pack art verified FLAT on server (both base+large: 11 colors, cream/navy/green, no grey, no checkerboard). Earlier stale-child theory withdrawn: 16:21 watcher restart did pick up style-3. The grey in browser = stale page/session holding the 1.0 pack, not server data. No republish needed; fresh reload /play and start a NEW game (check 1.1 label in dropdown + status line).

## PLAYER-LOCAL｜本地發布遊戲與擴展地圖

**交付邊界**：`eec4516` 已推送 `github/main`；`c8a974b`（勢力列表）只在本地 `main` 提交。本批未部署。舊 §232–236 與 ENGINE-AUDIT 原文可查 `git show c8a974b:docs/checkpoint-journal.md`。

| 問題／失敗嘗試 | 定位、變更與驗證 |
| --- | --- |
| 本地只見內置遊戲；能選章卻無法開局 | `8321` 沒有目錄 API。改用 `8443/play`，確認本地 1.0、19 章與首章包；開局仍因原域尺寸門拒絕北擴世界。`trialruntime.js` 按已知 grid 格式裝配，`playapp.js` 修正選章標籤、空勢力與載入提示。全新瀏覽器以劉虞開局成功，不等於正式 reader 驗收。 |
| 編輯後複製與道路保存 | `editor-ui/src/{BaseMapPanel.vue,mapcanvas.js,StrongholdCreate.vue}`、`server/{systembasemapstore,gamecopy}.js`、`web/src/editor/roadchain.js` 支援基礎據點新增、多格地圖編輯、道路識別與新增據點的章節准入。北擴三城後完整複製、審核並上架本地 1.0。 |
| 開局成功但首次行軍即停；普通檔過快 | 新編軍團未帶道路位置，且 grid 每刻重訪前 16 槽。`nativelegions.js`、`legioncounts.js`、`ai.js` 修正編成、占格與八批輪轉；`clock.js` 依使用者決定將舊普通設為最高檔。道路日結不回士氣；返都後由到期動作補員或解體。`verify_map_extent_march.mjs` 等四項回歸通過。 |
| 中立城下令即報錯；可接敵後勝利仍停在 4CF5 | `worldgridroads.js` 原先只接受友方目的地；擴展城編號又誤入 DOS 固定城表。改為在城前接敵，grid 中立城攻勝寫回所屬與城數。不要把能進入攻城當作整場結算等價證明。 |
| 月末兩次不同錯誤均顯示 0 日 | 先修軍團編成丟失 `+21/+24` 月結欄位；之後是已佔北擴城的負 Y 被當作無符號座標。財政修後實際跨月又暴露災害事件誤走舊輪；修正 `navigation/{originalmonthlyfiscal,scenariomonthlyfiscal,scenarioweather}.js` 與 `ai.js`。隔離瀏覽器以劉虞持有負座標城從 1/31 跨至 2/1；財政／天氣 20 項通過，使用者亦確認。 |
| 同格選單、勢力列表與外交接見 | `gamebar.js` 按同格實體開「據點／軍團」，軍團列表右鍵直接關閉；外交 FIFO 分開隊列類型與接見類型，協助／停戰均實測可開窗。`hud.js` 依實際據點排除空勢力，按君主引用計數而不重複，不刪槽、不改武將歸屬。 |

**提交驗證**：`eec4516` 合併遠端既有玩家修正後重建程式包，21 項專項測試通過，Vue LSP 37 個元件無診斷；`c8a974b` 完成語法與 bundle 檢查。這些是分項驗證，非全庫通過。

## 下一步與未結項

1. **下一項：小地圖顯示。** 尚無確認根因。取得具體畫面、章節與操作，先看內置遊戲如何載入及繪製，再查擴展世界的資源、原點、比例與標記位置；用同一觀察點重現後再決定改哪一層。本輪只登記，不改程式。
2. 外交與預算同批等待：宣戰已有等待門；玩家停戰／協助及內政／外交預算可能在第一項答復前繼續派發。`ai.js` 的 `drainStrategicEventBatch` 待構造同批連續事件驗證。審查 65 項過、1 項因 `verify_budget_message_ui.mjs` 夾具缺 `compiled minimap base` 未進入測試；這不是玩家小地圖問題的根因證據。
3. 攻城傷亡：已核六隊交錯扣兵與部分士氣寫回；未完成內置與發布路徑同輸入、同 RNG 的全程對照。保留為待查，不改倍率。

## 歷史定位與相容錨點

§195–231 見 `git show 22b287b:docs/checkpoint-journal.md`（建城流程 §229、戰場接線 §230、當時推送收據 §231）。較早批次見[§73–194 歸檔](checkpoint-journal-archive-73-194.md)、[早期歸檔](checkpoint-journal-archive-through-72.md)、[收據缺口](historical-receipts.md)。以下錨點供舊連結轉接；使用歷史收據時按批次查閱，不作當前授權。

<a id="184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push"></a><a id="186-d2-event-64p0p1隔离审计与一次性决策包未实施未push"></a>
§184–187：[事件調度歸檔](checkpoint-journal-archive-73-194.md)。

<a id="79-sea-ground-1全幅海域基底与地面轮廓"></a><a id="80-atomic-catalog-1单格素材库与单层分类"></a><a id="81-atomic-preview-2分类更正植被核对与32px预览"></a><a id="82-atomic-spring-neutral-3固定春季与中立据点素材"></a><a id="84-map-space-4地图优先布局与对象右键菜单"></a><a id="85-map-space-5紧凑布局与原始比例"></a><a id="87-map-pan-lock-1地图拖动锁定切换"></a><a id="88-city-group-1四套配方与放置接缝待确认"></a><a id="89-city-group-preview-1据点组只读素材展示"></a>
§79–89：地面、素材與工作台歷史；[現行地圖合同](map-atomic-catalog-contract.md)。

<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a><a id="49-共享头像文件及资产id数字重编号"></a>
[§37 預設主題決策](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)；[§49 頭像身份決策](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。

<a id="10-014发布整理"></a><a id="11-015发布整理"></a><a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a><a id="5-当前时钟系统逆向与重构本地完成"></a><a id="6-发布主线阻塞与下一步"></a><a id="8-用户指定五档提速"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-录像反馈后的战略性能修复"></a><a id="11-编辑器vps部署前只读盘点"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a><a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a>
§5–33：時鐘、表現、早期部署與 Vue 工作台見[舊收據索引](checkpoint-journal-archive-through-72.md)。

## 2026-11-24 小地圖 style-3＋副本地理回填（GEO-BACKFILL，未提交）

- style-3（用户批准对齐内置纯平，非原版机制）：`web/src/content/authoring/minimap.js` landPixel 压平＋海岸渐变、海面纯色 seaA、`MINIMAP_STYLE_REVISION=minimap-style-3-flat-land`；三处 seed 断言同步 seed 不变（`verify_minimap_seed`／groups／`system_base_map_minimap` 全过）；`trialweb.txt` 已重建；离线底图 17KB→4KB 纯平。`playapp.js` 游戏下拉框＋状态行显示发布版本号 live 生效。以上全部未提交。
- 根因（实锤数据分层 mismatch）：副本 8c05e6a0（384x264,minY-8）terrainRef 海图块仅 12.0%，但 `map.base.geography` 100% 全海（sea-ground-1 模板默认＋装饰 `preserve-underlay` 盖章不改底）；若一致下采样海应 13.3%，实际包底图 59.8%。markers 走剧本故三城标记一直对。内置对照：图块 12.1% 海→底图 10.3% 海一致。
- 修复（用户批准方案 A，数据面）：`tools/verify_geo_backfill_isolated.mjs` 用 inferred-sea-edge-connected 从 compose 后 terrain 回填（0陆88617／1海9663／2河3096），水团 baseCells 非零门过，patch 后 compose 诊断 0，海 68.7%（含道路覆绿≈包 59.8%）→10.5%，隔离 PNG 与大地形吻合。写库：`game_copies` 1 行 data_json＋copy_digest→`de0520e2…`（sha 自洽防 COPY_CORRUPT），备份在 `C:/Users/fczll/AppData/Local/Temp/wolong-geo-backfill/backup-data-json-13fb.json`。policy sea-ground-1 同步移除（否则 INVALID_SEA_GROUND_BASE），副作用：该图 base-fill 解锁。验证状态自动 stale，用户须在编辑器重跑验证→提交→批准上架 1.2。提交推送另需授权。

## 2026-11-24 小地圖河改海藍 style-4（未提交，用戶待上架 1.2）

- 用戶確認回填效果后要求河与海同蓝。`minimap.js`：`river` 由绿 `(64,96,64)` 改海蓝 `(0,30,90)`，`road` 保持绿（路上叠线仍可见），`MINIMAP_STYLE_REVISION=minimap-style-4-blue-river`（server/tools 仅作报告戳记，无契约风险）。此改共享渲染，内置小地图河同步变蓝（已告知用户）。
- 驗證：`node --check` 过；`trialweb.txt` 重建（sha `4f989d…`）；三項 seed 校驗全过（颜色不碰 seed）；隔离重渲染 10 色零绿，海 17.3%（原河像素併入海，数学吻合），預覽 PNG 與大地图一致。
- 服務：supervisor 1848／child 9864 為我方實例；重載新碼需新 child，kill 9864 後 supervisor 未補叉連帶退出，已用原命令重起（supervisor 16256／child 17124，`/play` 200）。child  fork 於 style-4 之後發布 1.2 编底图必為新码。
- 用戶動作不變：編輯器重驗→提交→批准→發布 1.2，一次帶走地理回填＋河藍＋style-3 壓平。

## 2026-11-24 小地圖 style-5 對照 DOS 原版（未提交，用戶待上架 1.2）

- 用戶对照 DOS 原版底图要求：河回绿、河再细、陆地加杂点、海岸立体感；推翻 style-4 河蓝（内置同步变蓝已随 style-5 回退）。
- `minimap.js` → `minimap-style-5-dos-relief`：`river` 回绿 `(64,96,64)`（road 保持绿）；陆地哈希杂点（`textureNoise>0` 加深 22，同 seed 稳定）；海岸投影第二遍（纯海像素上／左邻陆 → `(128,64,32)`，河路陆不动）；`landPixel(shade,grain)`；`gamebar.js drawMini` 底图 `imageSmoothingEnabled=false` 包一下保 1px 锐（显示侧，内置同步更脆）。
- 三项 seed 校验曾按 style-3「seed 不影响输出」断言失败，属测试刻舟（用户已批改方向），按铁律 8 更新为「同 seed 确定、异 seed 杂点不同、掩码一致」后三项全过；`trialweb.txt` 重建（sha `2ff41991…`）。
- 隔离重渲染 21 色：陆底 17910／杂点 14251、海 4043／绿河 2823／投影 341，预览与 DOS 质感一致。服务 child 已轮换（12576，17:38:56，style-5 之后）`/play` 200。
- 用户动作不变：编辑器重验→提交→批准→发布 1.2（压平＋回填＋河绿＋杂点＋投影一次带走）。
