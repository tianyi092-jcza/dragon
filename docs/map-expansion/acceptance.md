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
| E0 | 起點、權限、資料保護、舊失敗分類 | 未執行 |
| E1 | 世界座標不動，四側與按格索引無別名 | 未執行 |
| E2 | 當前副本頁面北加縮、重讀、還原 | 未執行 |
| E3 | 八鍵、四側各自額度與最大邊界 | 未執行 |
| E4 | 整件移除／城解綁／斷路錯誤，修復與撤銷 | 未執行 |
| E5 | 新建／完整複製繼承額度、模板獨立、權限隔離 | 未執行 |
| E6 | 編譯包、四季、畫面與命中一致 | 未執行 |
| E7 | 玩家與 AI 實際跨界派令、行軍 | 未執行 |
| E8 | 敵城與野戰、戰後與日月接續 | 未執行 |
| E9 | 遊戲途中存、標題重載、與對照局同步 | 未執行 |
| E10 | 隔離正式鏈、舊圖回歸、現場還原與文件交付 | 未執行 |

**放行規則**：本關必要驗收全過才標「通過」。失敗先修本關，不能降級斷言、跳過紅燈或以模擬成功當真服務通過；既有不相關故障記錄重現與影響範圍，不暗改其他會話工作。若與下一關依賴有關（例如小地圖命中、首都歸屬阻止正式發布），必須解決或清楚標「阻塞」；可先完成不依賴的調查，但不宣告下一關通過。遇未批准的規則差異、不可還原資料寫入、必須動正式庫／遠端、或無原證時，停受影響項，列所缺證據或授權。最後列出每關收據與未完成項，不默認 commit、push、部署或替用戶上架。
