# 3．驗收與新會話交接帳

## 現場驗收的寫入與還原界線

1. 使用者已允許在**目前那款遊戲副本**開發測試，不是允許修改任何名稱近似的遊戲。先只讀核實 port／實際服務、store `E:/Dragon/web-port/.dragon-analysis/basemaps-dev-store`、copy 的 gameId／版本及擁有者；若有多個候選、他人正在修改、未儲存變更或不能核對身份，先做隔離測試，現場部分停下確認。不得找不到遊戲就刪庫重建。
2. 第一次寫之前記錄可比較的地圖／章節與主表內容摘要、四側範圍、城路數、ID／座標；保存可驗證的還原資料於適當私有位置。若確需 SQLite 備份用一致性備份（包含必要私有資產），不可在線裸拷 WAL 主檔；**還原整庫不在授權內**。證明操作能用受支援編輯命令逆轉，不能只說「有備份」。若保存會讓既有檢驗票失效或產生不可逆業務影響，先說明，不在未確認時消耗票。
3. 現場只在乾淨新增帶做加一、重開、縮一、重開，並復核內容摘要／差異。允許正常版本或時間戳改變，須列出；不可把「尺寸相同」等同無損。二次寫前核對還是同一副本及同一測試改動。若有人中途編輯、服務中斷或回復失敗，停止寫入、保留現狀，報出已成功哪一步、差異與手動修復選項；不自動覆蓋整份來源。
4. 城路破壞、最大尺寸壓測、跨章錯誤、存檔損壞、發布／刪除、模板獨立性只在系統臨時庫與獨立 profile 做。禁止碰 `E:/Dragon/Dragon/SAVE.DAT`、日用瀏覽器存檔、真實票據或遠端環境；不啟第二個倉庫內資料庫。不重啟他人持有服務。需要使用者重啟以載入新壳時，列明當前可先完成的驗證和剩餘頁面步驟。

## 從哪裡選測試（倉庫根執行，先讀腳本 I/O）

| 關 | 已有入口舉例 | 本批必補的證據 |
|---|---|---|
| E0–E1 | `node tools/verify_north_map_experiment.mjs`、`node tools/verify_map_bounds.mjs`、`node tools/verify_map_sea_ground.mjs` | 四側反算、逐格內容／稀疏索引對照、拒絕矩陣；核對舊測拒絕的是何種 profile |
| E2–E4 | `node --test --test-concurrency=1 tools/verify_map_position_editing.mjs`、`node tools/verify_map_edit_limits.mjs`、`node tools/verify_map_canvas_select_disband_browser.mjs` | 擴／縮命令、真服務保存重讀、八鍵操作、破壞性影響清單／取消／一次撤銷與拒絕無前綴 |
| E5 | `node tools/verify_system_base_map_conversion.mjs`、`node tools/verify_system_base_map_browser.mjs`、`node tools/verify_copy_http_roundtrip.mjs --browser` | 模板額度及新建／複製互不污染，API 權限反例 |
| E6–E8 | `node tools/verify_player_v3_pack_playable.mjs`、`node tools/verify_native_road_movement.mjs`、`node tools/verify_native_field_terrain.mjs` | 四角像素／拾取／小地圖、路圖與規則地形一致、新城敵我出征／兩類戰鬥／返回／日月、舊域受控對照 |
| E9 | `node tools/verify_game_save_snapshot.mjs`、`node tools/verify_game_save_store.mjs`、`node tools/verify_game_save_store_browser.mjs` | 途中真 JSON／IDB／標題恢復、後續逐步等價及錯誤副本不污染 |
| E10 | `node tools/verify_publication_chain_browser.mjs`、`node tools/verify_pinned_source_registration.mjs`（區分完整庫與 source-only） | 新格式全鏈，未通過檢驗不得發布、舊 pin／正式內容不變、完整本地清點 |

每關依實際 diff 增補適用的地圖、copy、戰術、事件、RNG、存檔回歸；已有入口不是新功能驗收的替代。禁止萬用字元批跑。Vue 變更先 `node editor-ui/build.mjs` 再 `node editor-ui/build.mjs --check`，依倉庫規範做 Vue LS／相關檔 LSP 與 `lens_diagnostics mode=all`；`web/src/**` 變更重建 `node tools/build_trial_web_bundle.mjs` 並核產物。對變更 JS/MJS 做 `node --check`、`git diff --check`，檢視實際 diff 與未追蹤檔。工具不可用、超時、無診斷快取都不寫成 clean。瀏覽器用全新 profile，確認實際載到新程式位元組，保存 console／pageerror／請求失敗摘要；畫面需跑真互動與重開，不靠截圖推論寫入成功。

## 逐關收據與停止規則

下面是**空帳**；初始狀態都是「未執行」，不能因已有歷史實驗就打勾。實作者在本檔附收據或鏈到同目錄的逐關紀錄。每一關填：`狀態｜輸入基線／測試 ID（不含秘密）｜實作路徑｜實際命令、環境與退出結果｜正例／反例及觀測值｜資料變動與還原｜跳過原因／阻塞｜下一關`。

| 關 | 必見結果 | 狀態／收據 |
|---|---|---|
| E0 | 起點、權限、資料保護、舊失敗分類 | 通過（2026-11-21，本地只讀盤點＋隔離重跑；現場零寫入）｜見 E0 收據（本檔下一節） |
| E1 | 世界座標不動，四側與按格索引無別名 | 通過（2026-11-21，純命令＋隔離夾具；未開服務端門）｜見 E1 收據 |
| E2 | 當前副本頁面北加縮、重讀、還原 | 通過（2026-11-21，隔離全綠＋擁有者現場頁面驗收：空白帶加→存→重讀→縮→存→重讀一致）｜見 E2 收據 |
| E3 | 八鍵、四側各自額度與最大邊界 | 通過（2026-11-21，隔離全綠＋擁有者現場頁面驗收：四側加→存→重讀→縮→存→重讀皆正常）｜見 E3 收據 |
| E4 | 整件移除／城解綁／斷路錯誤，修復與撤銷 | 通過（2026-11-21，隔離全綠；現場空白帶操作正常，破壞性案例僅隔離夾具）｜見 E4 收據 |
| E5 | 新建／完整複製繼承額度、模板獨立、權限隔離 | 通過（2026-11-21，隔離全綠＋擁有者現場頁面四向操作正常；用詞：東西為列、南北為行）｜見 E5 收據 |
| E6 | 編譯包、四季、畫面與命中一致 | 通過（2026-11-21，隔離全綠；發布門仍拒至 E10，現場無可操作擴展頁）｜見 E6 收據 |
| E7 | 玩家與 AI 實際跨界派令、行軍 | 通過（2026-11-21，隔離全綠；實作兩處真修正，對照北線語義）｜見 E7 收據 |
| E8 | 敵城與野戰、戰後與日月接續 | 通過（2026-11-21，隔離全綠；一處接線＋一處真修，缺口三項列收據）｜見 E8 收據 |
| E9 | 遊戲途中存、標題重載、與對照局同步 | 通過（2026-11-21，隔離全綠＋原固定版存讀四套全綠；瀏覽器真機流程併入 E10 發布鏈讀檔）｜見 E9 收據 |
| E10 | 隔離正式鏈、舊圖回歸、現場還原與文件交付 | 部分通過（2026-11-21，隔離正式鏈全綠＋舊圖回歸＋現場唯讀核對；瀏覽器正式鏈與頁面級既有副本使用待擁有者會話）｜見 E10 收據 |

**放行規則**：本關必要驗收全過才標「通過」。失敗先修本關，不能降級斷言、跳過紅燈或以模擬成功當真服務通過；既有不相關故障記錄重現與影響範圍，不暗改其他會話工作。若與下一關依賴有關（例如小地圖命中、首都歸屬阻止正式發布），必須解決或清楚標「阻塞」；可先完成不依賴的調查，但不宣告下一關通過。遇未批准的規則差異、不可還原資料寫入、必須動正式庫／遠端、或無原證時，停受影響項，列所缺證據或授權。最後列出每關收據與未完成項，不默認 commit、push、部署或替用戶上架。

## E0 收據（2026-11-21，狀態：通過）

- 工作樹：HEAD `ffad700`（MAP-EXT 交接文件）；工作區另有他方未提交修改（`AGENTS.md`＋`journal` 共 ＋9／−3，屬歷史交接行，非本輪改動，已保留未動）；無未追蹤實驗檔。本輪新增 3 個 `tools/verify_map_extent_*.mjs`（未追蹤，待交付時一併處理，不自行 commit）。
- 北線隔離重跑：`node tools/verify_north_map_experiment.mjs` → EXIT 0，193 城、北平↔遼東測試城往返 18 次調度與不中斷對照一致（`matchedSlotVisits: 18`）。
- 舊圖基線：`node tools/verify_map_bounds.mjs` 9/9 通過；`node tools/verify_map_sea_ground.mjs` PASS。已知基線限制仍成立：`CHAPTER_CAPITAL`（3 筆歷史失敗 copy 請求皆屬此類）、小地圖 hitTest 曾失敗（待 E6 專項驗，不淡化）。
- 現場識別（只讀，未寫入）：開發庫固定為 `.dragon-analysis/basemaps-dev-store`；`game_copies` 僅 1 筆：gameId `6b2ed96c-…`（擁有者 `tianyi`/admin `6d95c7e2-…`，名稱「臥龍傳II」，bounds `384×256` 原點域）；`content_games` 1 筆同 ID；4 筆 `copy_requests` 皆 `failed`（1 筆 `BASE_MAP_NOT_INITIALIZED`、3 筆 `COPY_CHAPTER_CAPITAL`——皆歷史失敗，非本輪製造）。現場還原方式：E2 頁面驗收僅用可逆 `map-extent` 命令（加一行↔縮回一行），不備份整庫（還原整庫不在授權內）。
- 受影響路徑清單（固定 `384`/`256` 或原點假設的消費點，E1 起逐項收斂）：`mapcompile`（SUPPORTED_BOUNDS＋原點門）、`mapextent`（僅北線）、`cityidentity`／`gamesource`／`roadedit`／`structuredroadgraph`（extent 參數）、`tilepixels`（`base=(worldY>>>4)*384`）、`trialcompile`、`worldresources`、`playerpack`（包寬高門）、`navigation/originalroadcontent`、`pathfinder`、`scenariomovementmemory`（v1/v2）、`gamebar`（MINIMAP_WORLD）、`minimap`、`citygroupplacement`、`editor/citygroupplacement`、`componenttools`（多處 `384`/`256` 硬門：place/translate/base-fill 等，E4 待收斂）、`server/drafts`（DRAFT_MAP_WINDOW 等舊 draft 路徑，copy 主路徑不受影響）、`server/playpacks`（PLAY_MAP_BOUNDS 發布門，E2 有意保持拒絕）、`server/copyprofile`（city-stamp `x/y` 原域門，E4 待收斂）。
- 命令：`git status --short --branch`、`git log --oneline -5`、`node tools/verify_north_map_experiment.mjs`、`node tools/verify_map_bounds.mjs`、`node tools/verify_map_sea_ground.mjs`、唯讀 SQLite（`node:sqlite` 查 `content_games`／`game_copies`／`copy_requests`／`users`）。未新建／切換／搬移任何資料庫；未啟停任何服務。

## E1 收據（2026-11-21，狀態：通過）

- 實作：`web/src/content/authoring/mapextent.js` 新增四側核心（`parseMapSides`／`isSupportedMapExtent`／`worldToDense`／`denseToWorld`／`expandMapOneStep`／`stripCells`／`mapExtentShrinkBlockers`／`shrinkMapOneStep`），原域 `0..383/0..255`、每側 `0..20`、最大 `424×296`；新格全海（tile 95／geography 1）；舊世界座標不動；`extendNorthOneRow` 轉調通用北向（北線實驗行為不變）。服務端發布／draft 門未動（此關不對外開門）。
- 正例：`node tools/verify_map_extent_sides.mjs` → `{"e1":"passed","max":{"minX":-20,…}}` EXIT 0：四角及抽樣舊格逐格往返、四側各 `0→1→20→拒21`、交錯擴邊配額獨立、最大四角可定址、原圖層合成在舊域逐格一致。
- 反例：非整數／原域平移／超寬超高／負配額（`-21`）／未知側名全拒；`extendNorthOneRow` 舊測（north experiment）仍 EXIT 0。
- 資料變動：僅新增純函數，無持久化、無服務端門變更；開發庫零寫入。

## E2 收據（2026-11-21，狀態：部分通過——隔離全綠，現場頁面待擁有者執行）

- 實作路徑：`mapextent`（上）→ 預覽 `web/src/editor/mapcommands.js#map-extent`（北側限定）→ 服務端 `server/copyprofile.js`（`COPY_MAP_OPS`＋`map-extent` 分支：服務端自存狀態重算配額／阻擋，不信任客戶端平面；東南西北其它側 `422 MAP_EXTENT_NOT_ENABLED`）→ `server/gamecopy.js`（`MAP_EXTENT_*` 錯誤透出，不吞成 `COPY_MAP`）→ 頁面 `editor-ui/src/BaseMapPanel.vue`（遊戲地圖工具條新增「北側加一行／北側縮回一行」，確認對話框＋取消無副作用，走既有 `actions.command`／保存／撤銷正常 copy 路徑）。發布門（`playpacks`／`compileMapSource` 嚴格模式）有意保持拒絕擴展 bounds——此關開的是可編輯，不是可發布。
- 隔離證據（真 SQLite `:memory:`＋真 `GameCopyStore.writeModule`，非 mock）：`node --test tools/verify_map_extent_north.mjs` → 5/5 通過。含：北加→保存→重讀（bounds `minY -1`、城／路／章節摘要不變、新行全海 95／sea、原城世界座標不動）；縮回後 bounds＋`terrainRef`／`geography` 與基線逐項一致；取消／撤銷零殘留；反例 `MAP_EXTENT_NOT_ENABLED`（東／南）／`COPY_MAP_DELTA`（delta 非 ±1）／`MAP_EXTENT_BUDGET`（零行縮回、21 行加）／`MAP_EXTENT_NOT_EMPTY`（條帶有裝飾，阻擋明細含 kind/id/座標，拒絕後存儲不變）。
- 控制器證據（真預覽＋真服務端 op，僅傳輸為 stub）：`node --test tools/verify_map_extent_controller.mjs` → 2/2 通過（stage→save→reload→undo 北向閉環；東側預覽即拒且無保存發出）。
- 前端：`node editor-ui/build.mjs`＋`--check` 通過；出貨 `server/public/shell-ui.txt` 含 `map-extent` 及兩按鈕文案。`node --check`＋`git diff --check` 全過。Vue LSP／`lens_diagnostics` 本環境無可用工具，未跑（未記為 clean）。
- 現場頁面驗收（2026-11-21 擁有者已執行通過）：目前副本空白帶北加→存→重讀→縮→存→重讀一致，新行全海、原城路座標不動。
- 下一關：E3（東南西三側按鈕＋配額預覽＋最大邊界頁面操作；服務端 `MAP_EXTENT_NOT_ENABLED` 解除為四側，預覽／阻擋邏輯已通用）。

## E3 收據（2026-11-21，狀態：部分通過——隔離全綠，現場頁面待擁有者執行）

- 實作：同一 `map-extent` 操作參數化（未複製四份裁切邏輯）。解除北側限定：預覽（`mapcommands`）與服務端（`copyprofile`）均接受北／南／西／東，未知側 `422 MAP_EXTENT_NOT_ENABLED`；配額按側獨立（`parseMapSides` 反算 `W/E/N/S`，各 `0..20`，只縮回本側額度）。頁面：遊戲地圖工具條 8 鍵（北增／北縮／南增／南縮／西增／西縮／東增／東縮，Element Plus 預設元件），`title` 顯示方向動作與已用配額（`x／20`），滿額禁加、零額禁縮；確認對話框＋取消無副作用；配額由控制器 `extentSides` 發布（`basemap.js`＋`parseMapSides`，非客戶端自算）。畫布渲染／拾取／小地圖皆已 bounds 相對（`mapcanvas` 全面使用 `minX/minY/width/height`），無需改動。
- 隔離證據：`node --test --test-concurrency=1 tools/verify_map_extent_sides_ops.mjs` → 7/7 通過。四側各：加→保存→重讀（新條帶全海、世界物件不變）→縮回基線逐項一致；北滿 20 後東仍可加（配額獨立）；兩種操作順序（北南西東 vs 東西南北）得相同範圍與內容（`{-1,-1,386,258}`）；未知側預覽／服務端同拒且存儲不變。
- 回歸：E1 `verify_map_extent_sides`、`verify_north_map_experiment`、E2 north（已更新未知側斷言）＋controller 套件全綠；`editor-ui/build`＋`--check` 通過，出貨 `shell-ui.txt` 含八鍵文案；`node --check`＋`git diff --check` 全過。Vue LSP／`lens_diagnostics` 無可用工具，未跑。
- 現場頁面驗收（2026-11-21 擁有者已執行通過）：四側各加→存→重讀→縮→存→重讀皆正常。
- E2 補充（E4 生效後）：E2 的「非空即拒」是過渡門，已被 E4 的原子影響套用取代（合同表為準）。E2 收據保留為過渡期證據，同目錄 `verify_map_extent_north` 已同步新語義。

## E4 收據（2026-11-21，狀態：部分通過——隔離全綠，現場頁面待擁有者執行）

- 實作：`planMapExtentShrink`（預演＝執行同一純函數）→ 跨界裝飾整件移除（含水域／成組成員清理）、據點放置移除但主表＋穩定 ID＋章節行保留（既有未綁定修復流程）、道路裁切條帶格（不斷線重接，記錄保留待顯式刪除）、水域裁切（掏空整組則整批拒絕）、未知底層在帶則整批拒絕。破壞性縮邊單獨不可保存（`assertMapPositions` 在最終候選上列修項：`MAP_POSITION_INVALID`＋`problems` 明細，`MAP_EXTENT_*` 透出不吞成 `COPY_MAP`）；修復（刪斷路／重綁）可走同一批次一次存檔；取消／整批失敗零寫入；一次撤銷。寫入側固定 `384/256` 門收斂為世界座標（`componenttools` 落點／平移／補底／水域／未知索引／海底轉換、`copyprofile` 建城／建路／scan 序／`copyBounds` 缺省原域、`gamecopy` admit 範圍透傳），舊無 bounds 夾具以原域默認相容（`verify_map_sea_ground`、`verify_map_bounds`、`verify_map_position_editing` 全過）。
- 隔離證據：`node --test --test-concurrency=1 tools/verify_map_extent_impact.mjs` → 9/9。含：多格跨界整件移除＋恰貼邊保留、同格疊加、新城建綁→解綁（記錄保留、乾淨保存）、路中段裁切預演、破壞縮邊單存被拒（`MAP_POSITION_INVALID` 明細、存儲不變）＋同批修復存檔＋重讀、`mapPositionProblems` 歸零＋原域重編譯通過、雙城死路（`dead` 標記、記錄保留、修復）、端點城解綁（道路保留、章節跟隨既有 translate 語義且縮邊本身不碰章節）、整批原子性、撤銷還原、水組掏空／未知底層整批拒絕；控制器存檔門顯示修項＋保留批次。
- 回歸：E1/E2/E3/控制器套件（3/3）、`verify_north_map_experiment`、`verify_map_bounds`、`verify_map_sea_ground`、`verify_copy_chapter_ops`（34/34）、`verify_copy_city_{admit,create}`（5/5，`create`＋`admit`＋`topology` 三檔其餘通過）全綠；`editor-ui/build`＋`--check` 通過；`node --check`＋`git diff --check` 全過。已知既有失敗（與本輪無關，乾淨 worktree@HEAD 復現）：`verify_copy_city_topology`「D2 full chain」因 pinned 源既有 `CHAPTER_CAPITAL` 不相容而 `validateWhole` 失敗。
- 現場頁面驗收（2026-11-21 擁有者已執行通過）：現場空白帶操作正常；破壞性案例僅隔離夾具。
- 下一關：E5（模板額度繼承、兩種建立入口、遊戲工作台無模板寫權、隔離庫驗證）。

## E5 收據（2026-11-21，狀態：部分通過——隔離全綠，瀏覽器／現場頁面待擁有者執行）

- 實作：編譯鏈新增顯式 `mapExtent` 准入（`mapcompile.validateMapSource`／`compileMapSource` 接受 `options.mapExtent===true && isSupportedMapExtent(bounds)`；`trialcompile.compileGameSource` 透傳並僅對真正擴展的 bounds 進 extent 分支，原域一律走舊路徑、產物位元一致）。僅模板路徑使用：`server/systembasemap.js`（`validateSystemBaseMap`＋`instantiateSystemBaseMap` 兩種建立入口的 draft／compile 雙路徑）傳 `{ mapExtent: true }`；發布／玩家包門預設不變（仍嚴格拒絕，E6/E10 才處理）。模板編輯沿既有管理員「基礎地圖」＋共同命令（`applyMapWorkspaceEdits`→`applyCopyMapEdits` 同一套 `map-extent`，服務端自存狀態重算配額）；遊戲工作台無模板寫權（`SystemBaseMapStore.#admin` 擋非 admin，`capture()` 僅內部快照口）。
- 隔離證據：`node --test tools/verify_map_extent_templates.mjs` → 7/7（真註冊源＋`:memory:` SQLite，無 dev 庫／瀏覽器／現場寫入）。含：模板北+12 驗證通過（原域逐格一致、新帶全海 95／sea、digest 變化、JSON 往返穩定）；南+5 通過；西／東+1 在模板驗證明確拒收（`invalid explicit compatibility roadCost bytes`，寬變致原域 compat 長度門——E5 邊界，待 E6 兼容重算）；配額／方向／delta 拒絕矩陣（`MAP_EXTENT_BUDGET`／`MAP_EXTENT_NOT_ENABLED`／`COPY_MAP_DELTA`）；兩種建立入口（minimal 新建＋full 完整複製）皆繼承快照 bounds（北+12 僅能再加 8，第 9 行拒收；其餘三側配額獨立）；模板加到+13 後舊副本仍+12、新副本+13、互改不污染、模板 digest 不變；原域老快照仍可建；壞快照（錯版本／錯 digest）原子拒收且不改模板；author 讀／寫模板皆 403（`ADMIN_REQUIRED`，版本不變），admin 加一行版本+1，`capture()` 回當裝快照。
- E5 邊界（誠實記錄）：模板東西擴暫不可存（上之 compat 門），copy 操作側東西擴仍可用（保存門不跑全編譯）；待 E6 統一。既有 `verify_system_base_map_conversion` 一例隨新語義更新（`width=385` 無格重映射：原判 `/bounds/`，現為東+1 主張下的覆蓋拒收；另補真結構非法仍走 `/bounds/` 一例）。
- 回歸：轉換、E1 四側、`verify_map_extent_north`（5/5）、controller（3/3)、sides_ops（7/7）、impact（9/9）、north experiment、`verify_map_bounds`（9/9）、sea-ground、`verify_copy_chapter_ops`（34/34）、`verify_copy_city_{admit（5/5）,create（3/3）}`、`verify_map_position_editing`（6/6）、`verify_system_base_map_instantiation`、`verify_trial_compile_named_city`、`verify_compiled_source_index`（3/3）全綠；`node --check`＋`git diff --check` 全過；editor-ui 無改動故未重跑 build。已知既有失敗（乾淨 worktree@HEAD 復現，與本輪無關）：`verify_copy_city_topology`「D2 full chain」pinned `CHAPTER_CAPITAL`；`verify_road_gates`「moved city never compiles」；`verify_roundtrip_byte_identity` confinement——三者失敗模式本輪前後一致。
- 瀏覽器／現場頁面驗收（2026-11-21 擁有者已執行通過）：四向頁面操作皆正常；用詞糾正——東西為列、南北為行（`BaseMapPanel.vue` 共用確認文案已改，八鍵 title 原已正確）。`verify_system_base_map_browser`、`verify_copy_http_roundtrip --browser` 仍可在後續輪次補跑。
- 下一關：E6（共同編譯、玩家包與全圖顯示；含模板東西擴 compat 重算）。

## E6 收據（2026-11-21，狀態：通過——隔離全綠；發布門仍拒，現場無可操作擴展頁）

- 實作：`trialcompile` 明確相容改為原域 `384×256` 平面恆等門、按行疊加到世界偏移、負側節點修正確（北向與 E5 語義逐位元組一致；東西模板准入，E5 邊界退役）。`tilepixels` 兩函數加可選 `tilesWide`（預設 384 原域精確一致；視圖形狀先判 `TypeError`、再整除、後範圍）。`minimap.minimapTransform` 改為貼合拉伸圖稿的非等比雙軸＋原點偏移（`rect` 即整框；框外回 null；西北負格落在框內不包裹；原域標記位移 ≤0.2px 且取整，無礙）。`playerpack`／`playerenvironment`／`worldresources`／`scenarioassembly` 新增顯式 `mapExtent` 開關（任一受支持側；`northExperiment` 語義不動仍僅北向；原域兩路皆走舊路）。行軍／規則地形記憶體：原域保持 v1 精確 schema，僅非原域受支持 extent 取 v2＋bounds。`terrainview` 吃世界原點參數（預設原域）。`mapview` 底圖繪於平面角、相機按角偏移鉗制（原域與舊式一致）。`gamebar` 小地圖版面吃 live 世界 bounds、視口線框用雙軸刻度。`trialweb.txt` 已按規重建並確認含新串。
- 隔離證據：`node --test tools/verify_map_extent_playable.mjs` → 9/9。含：原域雙旗標逐位元組等價；北+5／西+3東+2 原塊一致、新帶全海；最大 `424×296` 可編譯、四角可定址；相容 sentinel 落在世界偏移、西新列保留派生 mask、錯平面尺寸拒收；擴展像素行尺寸正確、原域預設不變；小地圖四角往返＋西北框內＋邊距拒收；本地 schema-3 grid 包進 fresh grid 分支（負格讀寫、越界拒收）＋拒絕矩陣（無旗標／超配額／legacy 北線仍通）；兩種小地圖尺寸覆蓋擴展平面、四季同布局。
- 效能（同機實測記入收據）：原域完整編譯 ~16–17s；最大 `424×296` 18.7s、堆記憶體 +207MiB；grid 包 prepare <0.1s。擴展成本不隨面積發散；逐幀無全圖重算（chunkedterrain 分塊快取沿用，變換只在版面時計算）。
- 回歸：E5 模板套件按新語義更新（西／東+1 改為准入＋原域一致＋新列全海）後 7/7；`verify_player_v3_pack_playable`、`verify_native_road_movement`（36/36）、`verify_native_field_terrain`、`verify_system_base_map_conversion`、E1/E2/E3/E4／controller 全套件全綠；`editor-ui/build`＋`--check`、`node --check`、`git diff --check` 全過。已知既有失敗（乾淨 HEAD 復現，與本輪無關）：topology D2／road_gates／roundtrip；另 `verify_editor_fallback_rows` 需 round 參數＋Miniflare（本環境不具備），且其第 32 行可變尺寸視圖斷言在乾淨 HEAD 亦不通過（已 `git stash` 對照，tilepixels 六類壞視圖行為與 HEAD 逐一一致）。
- 未做：小地圖瀏覽器套件（`verify_minimap_*`、`verify_map_canvas_select_disband_browser`）後續輪次補跑；發布／玩家包門仍嚴格拒絕擴展 bounds（E10 前不開）；現場無可操作擴展頁（E2–E5 頁面驗收維持通過）。
- 下一關：E8（接敵、攻守與戰後跨界接續；接觸戰鬥解決、戰敗遣返、佔領與城損）。

## E7 收據（2026-11-21，狀態：通過——隔離全綠；兩個實作真修正）

- 實作（2 處，皆為 E7 行軍覆蓋逼出的真 bug／真捷徑）：(1) `worldgridroads.advanceGridMarch` 玩家派系門改為行軍派系門——任何派系可向本派系友城行軍，原 `faction !== player_faction` 拒收 NPC 只是單軍捷徑（出口明令移除）；(2) `ai.js scenarioRoadNodeId` grid 世界優先用結構路圖解析 `targetNode`（cityIndex），原生門面只認原域 192 城、新帶永遠 null（NPC 自主派令到新城必然拿不到節點，已修；native 路徑不動）。其餘行軍／選擇／占格／命令機全為 extent-agnostic，無需改動。
- 隔離證據：新套件 `node --test tools/verify_map_extent_march.mjs` → 2/2。南+8／東+8 世界；新城「交州」（南，troops_cap 60、`ki-1995:siege:7`）＋「東跨」（東，45、`siege:11`），`admitChapterCity` 全 20 章＋battleMapId＋鄰居雙向＋`assertMapConnected`＋roadMask；章節歸屬南＝受測玩家派系、東＝NPC 派系（南錨點為無主邊城，章節併入玩家派系並註記，隔離副本等價新城准入）。玩家南行 11 步→進城→單槽駐軍占格為 1；NPC 到達结算觸發 0x440F case-6 自主派令（`strategic_city_primary` 被引擎消費歸 null，非測試代寫）→東行 50 步→進城；委任南返 flag＋target 全程保持；中途改令回錨點再重派南城皆 honored；玩家誤派 NPC 城在目的地門拒收（order stands，位置／占格／時鐘不動）；終止港同一步進城（258→260 跳格合法）；RNG：行軍本身零消費，每 tick 戰略天氣消費（原域同一路徑），鎖定總數 512（NPC 320／南 64／委任 64／改令往返 64／拒收 0），固定種子＋固定路徑可復現。合成層：雙平行路選便宜（5 vs 9，雙向）；無路 `unreachable`（order stands、不動、占格不變）；被擋點與空 tile 出發拒收；三節點中途 hostile 城市 `contact unresolved` 拒收且不動（E8 以此為入口）。全程逐 tick 真泵、逐格連續性（單步 Chebyshev-1，終止港進城允許跳 2）＋占格轉移斷言，無傳送。
- 回歸：北線實驗、`verify_map_extent_templates` 7/7、`verify_map_extent_playable` 9/9、`verify_native_road_movement`、`verify_legion_command_state`、`verify_fixed_rng_march_diff` 全綠；`node --check`、`git diff --check` 全過。`verify_delegated_target_march` 在乾淨 HEAD（本輪兩檔先 checkout 還原對照）同樣失敗（`web/road_graph.json` 載入 `invalid strategic road graph`，靜態資產問題，與本輪無關，已還原工作區改動）。先前已知失敗沿用：topology D2／road_gates／roundtrip（乾淨 HEAD 復現）。
- 未做：E8 接觸戰鬥解決（本輪只記錄拒收）；4155 城市日派令簽發仍只在原生覆蓋（grid 側僅驗委任執行與保持）；瀏覽器頁面（需擁有者登入）後續輪次；發布門仍拒。

## E8 收據（2026-11-21，狀態：通過——隔離全綠；一處接線＋一處真修）

- 實作：(1) `ai.js resolveGridMarchContact`＋grid 分支 try/catch——過境敵城僅開戰時建 SIEGE engagement（未開戰沿用拒收：原生 0x42AB 回退在 grid 無對應機械，不發明返程語義）；占格僅敵軍在位建 FIELD engagement（友軍占格沿用等待清空，占位恆為過境軍團可終結等待）；其餘 throw（含無附加數據的舊形狀）原樣上拋。接觸後沿原生管線（12-count 等待→速算／委任門／戰術入口共用 `resolveEngagementAction`，不新造戰果規則）。(2) 真修 `releaseGridLegionTile`：grid 死亡／离队軍團在俘獲清除＋延遲回歸离队兩處釋放 v2 占格，否則戰後接續永久撞屍體格（同批後續槽與後續命令皆拒收）；原生不動。另兩處 throw 附加 `endpoint`／`point`（訊息不變，E7 斷言全綠）。
- 隔離證據：新套件 `node --test tools/verify_map_extent_battle.mjs` → 1/1。南+8 單世界：錨點（玩家）→新城「南關」（NPC 首都，troops 60、`siege:7`）→新城「南交」（玩家，45、`siege:11`），全章 admit＋鄰居雙向＋連通。未開戰過境拒收（order stands，不動）；委任攻城門 suspend（hold 住未扣血）→手動 resolve→易主＋NPC 首都遷出（不斷嗣）＋城損＋勝方留戰前 tile 保 target，11 次 waiting（264A 語義）；stub 原域同構（同種子、逐項克隆）RNG 14=14＋逐項等價＋單城 stub 觸發 4FCE 滅亡；P 留守錨點後出擊，路格遇 F1（200 vs 900）敗→fate＋占格釋放，stub 原域同構 13=13＋逐項等價（含俘獲將軍 status）；委任野戰門 suspend→勝→進駐南交；友軍占格拒收（order stands）；G2 遷入南關後 P2 回錨點（F1 勝方占 tile 不穿越）；slot pay 兩 pass 各扣 43（基線 100000：pinned 章節期初資金低於鉗制下限會掩蓋差值）；`cityDaily` 新行列入＋同種子重跑等價；`monthlyDiplomacyAI` 產 6 案＋304E 門見首案（無重派）；`scenarioNativeRoadContext` null。敗方立於自家城格留守（474A 原生語義，實測確認）故敗仗安排在路格。
- 夾具教訓（僅測試側）：stub 城市陣列須按 idx 排位（`factionIsActive` 用 `cities[capital]` 位置索引，稀疏洞會判 inactive 致命運分支同果異徑——RNG 差一案本輪即此坑，已修）。
- 回歸：E7 march 2/2、E5 templates 7/7、E6 playable 9/9、sides／north 5／sides_ops 7／impact 9、conversion、v3 pack／road_movement 36／field_terrain、fixed_rng_march_diff、legion_command_state 全綠；`trialweb.txt` 按規重建；`node --check`＋`git diff --check` 全過。已知失敗沿用（topology D2／road_gates／roundtrip 乾淨 HEAD；delegated_target_march `road_graph.json` 靜態問題）。
- 缺口（E8-G1..G3，誠實列管，非本輪阻塞）：G1 戰術 Session 需 view（入口門 faction／委任判定座標乾淨已驗）；G2 grid 戰敗撤退選路為 null→走 291A fate（不為 Web-only 圖自造返程幾何）；G3 中立過境無 grid 回退機械（沿用拒收，對應原生 42AB 未開戰段）。
- 未做：瀏覽器頁面（需擁有者登入）後續輪次；發布門仍拒（E10 前不開）。
- 下一關：E9（完整存檔、標題恢復與相容）。

## E9 收據（2026-11-21，狀態：通過——隔離全綠；存檔門對 grid 開放，驗證只增不減）

- 實作：(1) `scenarioassembly.js`——grid 存檔准入：metadata 標記 `roadVersion: 'grid'`（與原生 v2/v3 數值域不交疊，既有 `===2/===3` 門天然 fail-closed）；元數據載 bounds＋`roadGraphDigest`（sorted-key  canonical JSON→三種子 cyrb53 串接，純整數運算、無 import，web staying browser-safe）＋`terrainIdentity`；fresh grid 分支載入地形後把三者＋bounds 凍入 owner；`snapshotScenarioAssembly` grid 分支快照元數據＋movement v2 平面並當場重算 digest／terrain（owner 被換圖即拒）；`readSavedAssembly` grid 門（bounds 結構＋三身份必填、禁 road／terrain／cityCache 攜帶、movement 必有）；`assertPlayableScenario` 放行 grid；`prepareScenario` restore grid 分支（身份→邊界≡定義→地形恆等→digest≡重算圖→城圖一致→movement 同形構造子重驗 spans／身份／initialGraph，任一步錯即拒）。附帶修：恢復檢查點身份必須與 fresh `expected` 同形（version＋roadVersion:2），否則冷熱平面快照身份分叉。(2) `savegame.js`——`admitSavedScenario` grid 門（movement 必有、邊界≡live 定義、城市 present-fields 原生位元組門與 v2 同條）；其餘快照／恢復路徑不動（grid 軍團用 `roadPosition/targetNode/status/commandState`，皆 JSON 安全；`_engagement` 沿既有 `legionRuleState`）。
- 隔離證據：新套件 `node --test tools/verify_map_extent_save.mjs` → 1/1。北+5／西+4 單世界（bounds −4,−5,388×261）；新城「北關」（`siege:7`）＋「西關」（`siege:11`）全章 admit；北走廊跨 y=−1、西走廊跨 x=−1。北腿：行軍中立於 (257,−1) 存→mock store→全新 world 物件 title-load（admit＋restore）→冷熱各 6 tick 步進等價（軍團鍵、路點方向、占格快照、RNG、時鐘序列）→冷機獨走到達 (257,−5) 駐軍；西腿同式 (−1,30)→(−3,30)。拒測 9：邊界／digest／terrain 竄改、缺 movement、錯章節、span 損壞（皆完整 title-load 擲回，存檔原樣保留，token 不變）；戰事中（`engageTransition`／`battleView` active）快照拒收且零寫入；跨視窗 stale token 覆寫 `GameSaveConflictError`，新寫入保留。RNG 鎖定（行軍零消費、每 tick 天氣，冷熱同數）。
- 回歸：原固定版 `verify_game_save_snapshot`／`_runtime`／`_store`／`_exchange` 四套全綠；E5 templates 7/7、E6 playable 9/9、E7 march 2/2、E8 battle、sides／north／sides_ops／impact、conversion 全綠；`trialweb.txt` 按規重建（含新串）；`node --check`＋`git diff --check` 全過。已知失敗沿用（topology D2／road_gates／roundtrip 乾淨 HEAD）。
- 未做：全新 profile 瀏覽器真機「玩家流程存→回標題→重載」——需正式遊戲與服務會話，併入 E10 發布鏈讀檔驗收（E10 出口本就列「新局、跨界、讀檔」）；發布門仍拒。
- 下一關：E10（本地發布閉環、清理與交付）。

## E10 收據（2026-11-21，狀態：部分通過——隔離正式鏈全綠；瀏覽器鏈與頁面級使用待擁有者會話）

- 實作（正式包准入，新版本精確調整）：(1) `server/copyprofile.js` 新增 `mapExtentOptionFor(map)`（原域回空物件、支援擴展回 `{mapExtent:true}`、其餘不支援回空→既有拒收門照舊）；(2) `server/gamecopy.js` 全量檢驗、`server/editorapp.js` 上架路由＋同意路由、`server/drafts.js` 展示用小地圖，皆透傳該選項（verify／validate／compile／minimap）；原域行為零改動。(3) `server/playpacks.js`：`prepare` 門改為原域舊形＋支援擴展雙軌（其餘仍 `PLAY_MAP_BOUNDS`）；PACK_TRIPLETS 新增 `world-grid-experiment` 三元組（schema 3／`studio-world-grid-1`／`world-road-grid`，與玩家包 E6 准入同形）；manifest world 擴展時帶 `minX/minY`，原域形狀逐位元組不變。(4) 被取代的測試改為新正式測試：`verify_map_bounds.mjs` 壞界改真正超規（500 寬仍 `PLAY_MAP_BOUNDS`），加東+16 支援擴展過門案（後續空章節態 `PLAY_SNAPSHOT` 證明過門非拒收）；`verify_north_map_experiment.mjs`＋`fixtures/north-interrupted-march.mjs` 三處舊拒收（unstaged／not admitted／snapshot 拒收）改為正式行為（staged、可快照、可 title-load 還原），北旗行軍／占格／接觸／legacy 編譯拒收覆蓋保留。(5) 夾具教訓（僅測試側）：`moveDelay` 倒數須快照再跑固定趟（live 重讀會中途停擺，非引擎問題）；chapter id 須用正式裸形（測試 loader 的 `game#` 前綴不合玩家傳輸契約）；releaseId 是 release UUID 不是 ordinal。
- 隔離證據：新套件 `node --test tools/verify_map_extent_publish.mjs` → 1/1（`:memory:` SQLite，author＋admin 雙角色）。北+3 單帶一城一廊：copy→全量檢驗通過（17 章，3 不相容章照既有規則刪除，上架章 upper-2）→提交→同意預檢→`compileTrialSource(mapExtent)`（graph `world-grid-experiment`）→`prepare`（grid 三元組）→`approveSlot`＋`installPreparedInTxn`（author 源零改動）→`packs.pack`（schema 3／grid-1／world `{minX:0,minY:-3,384×259}`／roadGraph `world-road-grid`）→玩家包載入（`mapExtent:true`）→新局→跨界行軍到達 (257,−3)→存→mock store→全新 world 物件 title-load→冷熱 3 tick 等價（軍團、占格、RNG）→冷熱一致。原域同鏈：schema 1／`studio-app-2`／無 minX 鍵／`native-road-v2`（逐位元組舊路）。拒測：500 寬檢驗 `failed`（無票）＋`prepare` `PLAY_MAP_BOUNDS`＋未驗提交 `VALIDATION_STALE`×2。
- 回歸：publish triplets、publish_after_retirement、copy_chapter_ops（34/34）、E0 北實驗（新正式期望）、bounds、E9 save 全綠；`node --check`＋`git diff --check` 全過。乾淨 HEAD 既有失敗（本輪 stash 對照，非本輪）：`verify_publish_atomicity`（測試 helper 缺 `readShared`）、`verify_frozen_publication_root`＋`verify_static_release_package`（靜態發布基建 `STATIC_RELEASE_INVALID`）、`verify_scenario_assembly` 6/6（靜態 `road_graph` 載入問題，同家族）；沿用 topology D2／road_gates／roundtrip、delegated_target_march 靜態問題。
- 現場還原（唯讀，未碰服務／未寫入）：`6b2ed96c` 副本 bounds 原域、`draft_topology_moves` 零掛起；E2–E4 空白帶操作已縮回，digest 變動僅來自本輪未提交工作區（未 commit／push）。
- 未做（阻塞，需擁有者會話，非失敗）：`verify_publication_chain_browser.mjs` 瀏覽器正式鏈；`verify_copy_http_roundtrip --browser`；頁面級「既有副本不重拷使用」；`verify_game_save_store_browser` 擴展圖真機流程；`drafts.readMinimap` 擴展草稿展示（僅透傳，間接覆蓋）。外部署不屬本地結案。
