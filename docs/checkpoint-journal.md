# 檢查點日誌

長期事實、架構、命令與約定見 [Web 專案記憶](../AGENTS.md)及[全局約定](../../AGENTS.md)。本頁只記批次交接；測試結果限於所列環境，不是原版機制證據或部署授權。

## MAP-SHIFT-COPY｜基礎地圖／地圖管理

Ctrl+C 讀取 Shift／框選共用選區；移除 Ctrl 點選的獨立選格狀態。地圖畫布 28 項及物件編輯 3 項測試通過，Vue LSP、build/check 通過，8443 實際腳本 SHA 與產物一致。未跑瀏覽器剪貼操作，無 lens 工具。

## MAP-RECT-DELETE｜基礎地圖／地圖管理

共用右鍵拖曳追加矩形多選、單擊右鍵仍開工具，畫布 Delete 復用刪除確認。`mapcanvas.test.mjs` 28 項、兩模組獨立瀏覽器夾具（`verify_map_canvas_select_disband_browser.mjs --rectangle-delete`／`--game-rectangle-delete`，鎖圖與未鎖圖、取消／確認／撤銷）、Vue LSP 及 build/check 通過；未改開發資料。完整舊瀏覽器腳本在道路／據點移位後等待 `.base-map-problems` 超時，未算通過。無 lens 工具。

## LIST-SORT｜遊戲列表首次點列降序

共用 Canvas 列表未點表頭時保留原行序，首次點列及換列從降序開始，同列再點反向。軍師列表與武將專長兩個回歸腳本通過，已重建 Trial bundle，核對本地8443提供的 gamebar.js 與工作樹一致。未做瀏覽器或 LSP／lens 驗證。

## XINYE-FISCAL-TRACE｜203年十月至十二月

本地上架1.7 `middle-3`、曹操、固定RNG、只在記憶體設定截圖所見政策與庫存。`node tools/verify_release_xinye_recruit.mjs <本地上架UUID>` 連跑兩次月結；11月38城收入13438、實徵0，12月34城收入62598、騎弓步實徵3190/2130/3000。非玩家存檔重播，與用戶所見收入19938/112998、騎兵庫存1000→10670不符，原因未定位。日期展示在月結掛起時顯示新月1日，不更動內部CF0=0或重跑月結；時鐘回歸、財政13項與bundle已驗，未做瀏覽器／LSP／lens。

## CONTACT-REORDER｜接戰等候中改令

移除軍團列表與命令確認用 `_engagement` 拒絕己方改令的 Web 限制。原證見[行軍筆記](re-notes-march-pathfinding.md)。本地軍師 UI 與擴圖改令回歸通過，重建 Trial bundle；未部署或重播玩家對局。

## GRID-TRANSIT-SIEGE｜過境敵城接戰時機

移除格圖選到通往敵方過境城的道路就觸發攻城的分支，改在到達城門前處理；途中野戰不變。原證與回歸場景見[行軍筆記](re-notes-march-pathfinding.md)。本地擴圖行軍、敵城接觸、接戰音效三組共7項通過；不是歷史對局重播。

## FINANCE-REPORT｜玩家財政面板

改顯最近月結的實際收支，次月稅率仍可獨立設定；舊檔無報表時不反推。修正非原生槽路徑遠距離除數。原證見 [5358 月結](re-notes-kernel.md)。本地 `verify_native_monthly_fiscal.mjs` 13 項通過，含 18%／100%、國庫、支出清零後報表及距離邊界；已重建 Trial bundle。未部署、未用玩家存檔。

## MEMORY-CLEANUP｜本輪文件交接

- **核對**：以已提交的 `d4773c6` 對照工作樹。舊頁首仍把 1.5 小地圖列為主線，內文又把已推送的存檔、戰鬥修復列為「未提交」。改以擴展格圖的玩家流程為主線，區分本地 1.7 驗證與生產狀態。
- **變更**：`AGENTS.md` 保留架構、操作入口與共用命令，補入格圖／原生道路的差別、即時邊界與持久 `/play` 讀檔邊界。此頁合併重複除錯經過，移除舊截圖描述、臨時備份路徑與已結案的待辦。歷史原文由 Git 保存，舊錨點保留在頁末，不另建一份活動日誌。
- **範圍與下一步**：純文件整理，無產品程式或資料變更；不重跑遊戲或瀏覽器。無需部署或遷移。本輪沒有新的實施阻塞；後續若追查舊測試失敗，先重跑對應夾具，不把歷史結果當作目前結論。

## GRID-PLAYER｜最近一次產品交付

| 範圍 | 除錯經過與收斂 | 相關入口 |
| --- | --- | --- |
| 宣戰後不出兵、奪城後不再進攻 | 先修城市游標與軍團固定槽，再分開檢查「已交戰」和「月結仍選為目標」。袁紹攻下代、涿郡、易城、廣武後，舊月結沿用開局邊界清掉目標；改讀當前道路及主權，受控局面後續攻下薊縣。未調整出兵或宣戰機率。 | `web/src/game/ai.js`、`navigation/scenariomonthlydiplomacy.js`（相對 `web/src/game/`）；[外交原證](re-notes-ai-diplomacy.md) |
| 行軍、交戰與失城通知 | 先前把和平目的地或高費尋路當成錯誤而停表；兩者分別走當前路段折返與軍團去向。有路的敗軍不應一律進延遲回歸。玩家城僅有城兵且被攻陷時，先報城名及敵將，關閉後才易主；俘將、遷都及滅亡各等自己的消息返回，不重算戰果。 | `worldgridroads.js`、`ai.js`、`battleflow.js`；[行軍](re-notes-march-pathfinding.md)、[戰後去向](re-notes-legion-fate.md) |
| 北平災害與存檔 | 雨雲可集中在北平，但舊受災掃描止於槽 191，且跨零距離用無符號數計算。受災和清除現共用實際城表與世界座標。同類存檔問題出在快照／冷裝配的座標與目標准入，不在 IndexedDB 寫入。已驗北、西擴圖存讀與版本隔離。 | `originalweather.js`、`savegame.js`、`nativelegions.js`；[天災原證](re-notes-kernel.md)、`tools/verify_map_extent_save.mjs` |
| 玩家入口與 HUD | 修正持久 `/play` 跨章讀檔與敗北後重選遊戲；軍師缺名時新局先命名，不改舊檔。小地圖與勢力資訊面板可分別拖動、關閉；拖窗不移動相機。 | `playapp.js`、`startmenu.js`、`gamebar.js`、`mappanellayout.js`；[軍師初始化](re-notes-entity-fields.md) |

**交付收據**：`f682498`、`6df66f5` 為讀存檔前序；`d4773c6` 彙整產品、測試與必要文件，三者已推送 `github/main`，未部署。推送前選定的 72 項回歸通過，另以 `tools/verify_grid_war_ai_release.mjs` 讀本地 8443 的 1.7 發布資源，在記憶體驗證北方戰線、逐城災報與失城消息。已核 JS 語法及 Trial bundle，未讀寫玩家存檔。這不是重播用戶歷史對局。

**驗證缺口**：過往 E8 戰鬥夾具曾在零章預塞軍團時被拒，部分原生道路夾具在 `prepareScenario` 報 `8A3F`，另有 `301C` 滿隊列返回值斷言不符。未以其他綠燈抵銷這些結果，亦無本批完整 LSP／lens 或全戰役驗收。需要時從下列舊日誌按錯誤與批次定位。

## 歷史收據與相容錨點

本次整理前的完整交接（含據點相冊、存檔排障及逐批測試）可查 `git show d4773c6:docs/checkpoint-journal.md`。§195–231 查 `git show 22b287b:docs/checkpoint-journal.md`；其餘見[收據缺口](historical-receipts.md)。以下保留舊文件的引用入口。

<a id="184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push"></a><a id="186-d2-event-64p0p1隔离审计与一次性决策包未实施未push"></a>
§184–187：[事件調度歸檔](checkpoint-journal-archive-73-194.md)。

<a id="79-sea-ground-1全幅海域基底与地面轮廓"></a><a id="80-atomic-catalog-1单格素材库与单层分类"></a><a id="81-atomic-preview-2分类更正植被核对与32px预览"></a><a id="82-atomic-spring-neutral-3固定春季与中立据点素材"></a><a id="84-map-space-4地图优先布局与对象右键菜单"></a><a id="85-map-space-5紧凑布局与原始比例"></a><a id="87-map-pan-lock-1地图拖动锁定切换"></a><a id="88-city-group-1四套配方与放置接缝待确认"></a><a id="89-city-group-preview-1据点组只读素材展示"></a>
§79–89：[素材與工作台歷史](checkpoint-journal-archive-73-194.md)、[現行地圖合同](map-atomic-catalog-contract.md)。

<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a><a id="49-共享头像文件及资产id数字重编号"></a>
[§37 預設主題決策](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)；[§49 頭像身份決策](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。

<a id="10-014发布整理"></a><a id="11-015发布整理"></a><a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a><a id="5-当前时钟系统逆向与重构本地完成"></a><a id="6-发布主线阻塞与下一步"></a><a id="8-用户指定五档提速"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-录像反馈后的战略性能修复"></a><a id="11-编辑器vps部署前只读盘点"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a><a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a>
§5–33：[時鐘、表現、早期部署與 Vue 工作台收據](checkpoint-journal-archive-through-72.md)。
