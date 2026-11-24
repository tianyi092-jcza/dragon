# AGENTS.md — 臥龍傳 Web 專案記憶

先讀[全局約定](../AGENTS.md)。本檔只維護長期事實、目前主線、工程約定及可重用命令。每輪修改、失敗、驗證範圍、交接與阻塞記在 [checkpoint journal](docs/checkpoint-journal.md)；版本沿革見 [CHANGELOG](CHANGELOG.md)。文件或既有測試都不能替代原版證據、使用者授權或本輪驗證。

## 1. 專案邊界與目前主線

- 重寫 1995 DOS《臥龍傳》，不用模擬器。玩家與 Trial 引擎、編輯／編譯核心為原生 ES Modules＋Canvas 2D，無框架、無建置及 npm 執行依賴。只有 `editor-ui/` 使用 Vue 3＋Element Plus＋Vite；同源服務提供預建資源，Vue 只接顯示 DTO／動作，不持有憑據、源物件或 live 遊戲狀態。內容發布不觸發程式部署。
- **主線**：每款遊戲只有一套可編輯 copy、一個 publish 槽、一份 formal 快照；地圖、道路、據點、人物與章節為遊戲內共享資料。系統基礎地圖及基礎據點是建立時的模板，不是既有副本的第二份 live 資料。普通新建與完整複製分開，只允許一個成功的完整複製基準。舊 draft 退役／表清理等範圍見[收斂清單](docs/copy-simplification-tasks.md)。`/api/trial/*` 已退役（410），保留引擎不代表重新開放服務。
- **目前玩家主線**：發布遊戲與內置遊戲的表現對照，下一項是小地圖顯示。先追內置入口，再用相同章節、世界邊界與操作對照發布路徑；不把現有任一實作當作 DOS 原證。
- 編輯器為 12 項扁平選單，遊戲組在前、管理員組在後；品牌「臥龍傳編輯器」。「遊戲資源」是原頭像模組的顯示名，仍用 `catalog-editor`，僅管理員可用。「遊戲管理」負責上架發布；章節管理、勢力設定、勢力武將、勢力據點、外交關係在章節工作台；刪除遊戲只在上架審核入口。內置遊戲不可編輯、下架或刪除。
- 軟體版本見 `VERSION`；規則基線 `web-0.1.1`、內容摘要、遊戲版本 `1.n`、程式歸檔身份彼此獨立。生產為 `sadcloud` 單 VPS、玩家／編輯器分服務；操作前按[存儲佈局 §18](docs/game-storage-layout.md#18-迁回-sadcloud2026-11-09-utc-起现行生产)核對主機、目錄、程序與 pin，不沿用舊 PID 或遠端狀態。

## 2. 架構與資料歸屬

| 邊界 | 入口與不變條件 |
| --- | --- |
| 新局、編譯與存檔 | `web/src/app/`、`web/src/content/`、`web/src/game/{world,savegame}.js`、`web/src/core/{gamesavestore,saverepository}.js`。每世界持有資源；存檔只用同源 IndexedDB `wolong-web/saves`，目錄與正文同交易。遊戲內讀檔先回標題，離線校驗、資源就緒並重核身份後才安裝。戰鬥、未完續段、裝配、故障期間禁存。 |
| 行軍、戰鬥與表現 | `web/src/game/navigation/`、`native*.js`、`legionphase.js`、`legionscheduler.js`、`web/src/game/battle/`；`render/`、`ui/` 不推進路線或消費 RNG。原域 384×256、16px 圖塊、192 據點、128 軍團槽、22 正常勢力、24×24 外交矩陣；哨兵、保留槽不能依陣列長度泛化。原生道路、固定表與 RNG 不用 A*／隨機兜底，未知消費點 fail-closed。 |
| 地圖工作台 | `editor-ui/src/{BaseMapPanel.vue,mapcanvas.js,basemap.js}` 為共用展示及控制器；`web/src/editor/` 負責預演、物件編輯與位置校驗；`server/{mapworkspace,copyprofile,systembasemapstore}.js` 以同一命令重算，不信任前端平面。系統模板寫入須管理員；遊戲工作台不因此取得模板寫權。 |
| 編輯與發布 | `web/src/content/authoring/gamesource.js`、`server/{editorapp,gamecopy,copychapters,copygenerals}.js` 負責授權、遊戲源、章節／勢力與主表投影。`vps/` 管 SQLite、私有檔案桶與分發桶；`reader/site.js` 服務玩家。共享程式與單一遊戲資源分開存放、清理。 |

**規則與內容合同**

- 戰略事件用 `epoch*64+slot`；同一位置只推進一次，消息返回才派下一條，整批結束才 tick 勢力。原四位元組輪與調度表不得雙派。改表形狀同步[調度合同](docs/d2-event-scheduler-plan.md)、快照校驗及恢復回歸。開局 `playerOpening` 只在 fresh 安裝，restore 不從章頭重置；有紀元時前 1 年直接接公元 1 年。行軍、戰術、戰後與資料格式依父目錄對應 SKILL 核原證；[戰略時序](docs/re-notes-strategic-time.md)、[戰術生命週期](docs/re-notes-tactical-lifecycle.md)只作可追溯索引。敗北／統一過場為 Web 表現，不替代原勝負門。
- 基礎地圖及遊戲地圖共用四向擴縮：每側 `0..20` 格，不裁原域、不移動舊座標，最大 `424×296`。新增複製當前邊線普通地形及疊層，不複製道路、橋、城門或據點；縮回按現有物件影響規則。原全海命令與舊資料不追改。擴展須貫通編輯、編譯、行軍、存讀、發布，見[擴縮入口](docs/map-expansion/README.md)與[驗收邊界](docs/map-expansion/acceptance.md)。據點容量 v2-192／v3-512 與地圖尺寸是不同准入門；內置及生產限制見[CITY 計畫](docs/city-capacity-expansion-plan.md)。
- 地形位元組、顯示、規則地理、小地圖、路網分離。`sea-ground-1` 全幅以 95 海底承托素材，舊無 policy 源不猜底；四季共用布局，素材庫固定春季，保留 256 原子身份，不按像素合併。未鎖可平移，鎖圖才拖已選物件；整組拖放不自動建城，不猜道路重連。移動錯誤保存時列出具體物件／座標。確定道路／城門磚鏈結到兩城才可在遊戲保存時物化道路；有路紋不等於必然可通行。見[地面](docs/map-sea-ground-contract.md)、[原子與物件編輯](docs/map-atomic-catalog-contract.md)、[模板](docs/system-base-map-design.md)。
- 據點先建檔（指定戰場與城兵上限初值），地圖放置、綁定後連路。戰場、城景與上限是不同欄位；城兵上限不拉平既有章差。攻城依原城類型選圖，野戰依地形。武將主表以穩定 ID 關聯章槽，刪章不動主表或他章；勢力退役不重用原槽。同章同君主或不同君主共首都，完整複製只保首次並留回執，不合併資源。詳見[據點](docs/editor-city-definitions.md)、[武將](docs/editor-general-definitions.md)、[章節／雙基](docs/chapter-and-base-resources.md)。共享頭像 621 張、ID `0..620`，255 是普通資源；大於 255 用 `portraitKey`，不塞 DOS byte，見[頭像合同](docs/re-notes-portrait-reader.md)。
- copy 保存只攔模組約束；發布時全量校驗，摘要變動即廢票。提交須同摘要一次性票、說明及節流，審核同意在同一交易配發不重用的版本、更新 pin／formal／上架。刪除須所有權、柵欄及清理後復核，不刪共享程式或系統基礎地圖。正式版更新使舊局禁存、舊檔不可載入；網路失敗或下架不是版本更新。合同見[存儲佈局](docs/game-storage-layout.md)。

<a id="3-展示交互与文档职责"></a>
## 3. 展示、互動與文件職責

- 編輯器全系統使用繁體中文與 Element Plus 預設主題、元件、尺寸、locale；按路徑匯入元件並在 `main.js` 匯入樣式。不覆寫 `--el-*`，不污染玩家 `server/public/style.css`。瞬時提示一律經 `editor-ui/src/notify.js`（ElMessage `plain:true`），常駐文案保留 `<p role="status">`；`#login/#password/#profile` 由 `server/public/client.txt` 的 FormData 接管提交，ElForm 改造須保留 form id、input name 與 reset 語義。純圖示按鈕正方形、文字按鈕維持預設；地圖四個方向組之間留空。保留 id／data 屬性協定，不覆寫 `[hidden]`。玩家 Canvas 的右鍵／hold 規則依[全局約定](../AGENTS.md)，不套用到編輯器。
- 整頁不滾、資料區滾，列表固定表頭、25/50/100 筆分頁可跳頁；讀／編輯同寬，操作列用普通按鈕吸收餘寬，窄屏表內橫滾。共用四點載入、局部保存重讀回饋，資源按需載入不阻塞整頁。例外與元件細則見[布局規範](docs/editor-ui-layout-spec.md)與[框架殼](docs/editor-framework-shell.md)。
- 編輯器／地圖任務先核[產品設計](docs/game-editor-design.md)、[工程合同](docs/game-editor-technical-design.md)、[遷移計畫](docs/game-map-migration-plan.md)、[准入原證](docs/re-notes-editor-map-admission.md)及相關 SKILL，再查專項合同。方案文件不構成實施授權；新的機制原證回流 SKILL／re-notes，不只留在 journal。

## 4. 重要工程坑點

- 唯一開發狀態目錄 `E:/Dragon/web-port/.dragon-analysis/basemaps-dev-store`，不重建、搬移或另起倉庫內狀態庫。測試用系統臨時目錄、記憶體 SQLite／mock IDB、全新瀏覽器 profile。禁止自動化讀寫正式 `E:/Dragon/Dragon/SAVE.DAT` 或使用者存檔。
- 本地玩家入口分清三者：`8321` 是靜態引擎，不供上架目錄；開發編輯器的 `https://127.0.0.1:8443/play` 可讀本地已發布快照，但不是正式玩家標題頁；正式發布／通知驗收須走 reader 與分發桶。不要以靜態頁只見內置遊戲判定發布失敗。
- **build ≠ check ≠ 服務刷新**：Vue 先 build 再 `--check`，同步 `shell-ui.txt`、CSS 與授權清單。`server/public/*.txt` 由進程 import；`client.txt` 或 `index.html` 改後需重啟自己持有的實例，核實際服務位元組，不能停他人進程。`web/src/**` 改後重建 `trialweb.txt`。發布歸檔須核完整 inventory／SHA 與 pin，不放寬凍結身份，不把 `--source-only` 當完整資源庫驗證。
- `applyCapturedMapEdit` 的 `view(edit)` 是屬性描述符，取值用 `value(edit, key)`。地圖共用編輯預算 4096 命令／16 MiB 完整 JSON，模板／copy 源 64 MiB；批次預演／撤銷／拒絕都不可留下前綴。新城中心須符合行序，`road-add` 認證既鋪走廊而非鋪路命令。
- session DTO 的缺省版本要同口徑比較，不省略身份／epoch／SHA。schema 或 purge 變更同步投影、清單與刪除合同。SQLite WAL 檢查用一致備份，不裸拷主庫。離線報告新輪次獨占目錄，Python `-B`＋明確 UTF-8，含 Windows 子進程。
- 新狀態庫首次啟動會跑 staging 並校驗 `server/available-library.txt` 的 programHashes；倉庫存在預存不一致（指紋與已提交的 5 個 `web/src` 文件對不上），新庫因此失敗時先核對指紋來源，不手改 manifest；已有 pinned 的舊庫跳過 staging，不受影響。
- 提交、推送、部署、真實資料遷移各別授權。GitHub 遠端為 `github`，非 `origin`；當次操作當次核對，不根據舊日誌推斷同步。保留其他會話改動，不整體 reset／clean、不盲刪 Git 鎖，不提交憑據或運行資料。

## 5. 常用命令與分級驗證

從 `E:/Dragon/web-port` 執行。先審 I/O、選定範圍，重型任務串行；不以 `verify_*` 通配整批執行。以下不是啟服／部署授權。

```bash
python -m http.server 8321 --directory web
node tools/dev_editor.mjs --port 8443 --store .dragon-analysis/basemaps-dev-store
node editor-ui/build.mjs
node editor-ui/build.mjs --check
npm run --prefix editor-ui/lsp check
node tools/build_trial_web_bundle.mjs
node --test --test-concurrency=1 tools/verify_map_extent_sides_ops.mjs tools/verify_map_extent_controller.mjs
node --test tools/verify_map_extent_templates.mjs
node tools/verify_system_base_map_browser.mjs --edge-growth       # 遊戲地圖
node tools/verify_system_base_map_browser.mjs --base-edge-growth  # 系統模板
node tools/verify_pinned_source_registration.mjs
node tools/verify_editor_schema_sources.mjs
node tools/verify_game_purge.mjs
node --check <變更的JS或MJS>
git diff --check
```

- 依賴安裝及 Vue LSP 的專案級 override 見[LSP 說明](editor-ui/lsp/README.md)，不改全局設定。改動支持的檔案先做 LSP 路徑診斷，再跑 `lens_diagnostics mode=all`；工具缺失、超時或覆蓋不足要如實記錄，建置不代替診斷。
- 跨規則／時序／RNG／存檔選完整相關 lane；存檔測真實 JSON 往返、事務失敗與跨視窗 CAS。瀏覽器使用全新 profile，查 console／pageerror／請求失敗、保存及重讀；夾具、真實後端與生產分開報告。專項入口：[基礎地圖審計](docs/system-base-map-completion-audit.md)、[章節審計](docs/chapter-workbench-audit.md)、[擴縮驗收](docs/map-expansion/acceptance.md)。純文件核對事實、職責、連結／相容錨點及 diff，不跑無關遊戲／瀏覽器回歸。
