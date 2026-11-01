# 编辑器工作台结构（Web 产品决定，2026-11）

用户批准的最终结构。凡与本文冲突的旧界面描述作废；服务端既有能力不因界面取消而删除。
字段级归属见 [基础资料与章节属性](chapter-and-base-resources.md)；新建游戏与资源见
[新建游戏与游戏资源](editor-create-and-resources.md)。

## 1. 三级结构

```text
底层資源（工作台級）  遊戲地圖（含據點）、遊戲引擎、遊戲資源
        │ 新建遊戲時只複製地圖（含據點）
        ▼
遊戲（遊戲級）        遊戲屬性、地圖管理、城池據點、武將管理 → 試運行測試
        │ 章節由作者建立
        ▼
遊戲章節（章節級）    章節定義、武將章節屬性、據點章節屬性 → 章節運行測試
        │ 校驗通過
        ▼
上架（作者提交，管理員同意）
```text

## 2. 菜单终版（拉平一级 + 顶部「當前遊戲」选择器）

| 层级 | 模块 | 说明 |
|---|---|---|
| 工作台級 | 新建遊戲 | 只填遊戲屬性；**只複製底層地圖（含據點）**，不複製章節、不複製武將 |
| 工作台級 | 遊戲管理 | 我的遊戲列表＋**切換當前遊戲**（頂部同步）；管理員可見「複製遊戲」（地圖＋章節＋武將全套複製） |
| 工作台級 | 用戶管理 | 創作者帳號（原「創作者帳戶」） |
| 工作台級 | 系統資源 | 底層只讀瀏覽：遊戲地圖（含據點）、遊戲引擎、遊戲資源 |
| 工作台級（管理員） | 上架審核 | 跨所有創作者的上架申請審核 |
| 遊戲級 | 城池據點 | 據點基礎屬性增刪改（原名「基礎資料／據點管理」） |
| 遊戲級 | 地圖管理 | 地圖元素編輯；地圖上刪除據點＝只刪位置、不刪檔案 |
| 遊戲級 | 武將管理 | 武將基礎屬性；**默認空**，提供「從底層資源導入」 |
| 遊戲級 | 遊戲章節 | 章節定義＋武將章節屬性＋據點章節屬性＋章節運行測試 |
| 遊戲級 | 上架管理 | 作者視角的單行一遊戲列表：上架／刪除 |

顶部「當前遊戲」是全局上下文；切換時必須攔截未保存改動。

## 3. 取消的模块

| 取消项 | 理由 | 处置 |
|---|---|---|
| 階段任務 | 固定源階段產物不可修改、只能使用 | 界面取消；服務端能力保留，不進入作者菜單 |
| 階段結構 | 同上 | 同上 |
| 素材庫 | 與「遊戲資源／系統資源」重複 | 界面取消，職責歸「系統資源」 |
| 刪除追蹤 | 併入「上架管理」 | 界面取消，刪除動作移入上架管理與上架審核 |

## 4. 遊戲狀態機（三個顯示態）

```text
草稿 ──點「上架」──► 校驗整遊戲數據
                       ├─ 有錯 → 列出錯誤，狀態不變
                       └─ 無錯 → 提示「將自動增加版本號並提交審核」
                                  └─► 版本號 +1、狀態＝待上架、狀態時間＝now
                                         │ 管理員同意 → 已上架（狀態時間＝now）
                                         │ 管理員拒絕 → 回待上架並標「已駁回」
```

- 新建後未提交過：狀態＝**草稿**，版本號顯示「—」。
- 「上架」任何狀態可點；每次成功提交版本號 +1（待上架期間再提交亦如此）。
- **只有「上架」需要管理員同意。**

## 5. 列表字段

作者側「上架管理」，一行一遊戲：
**遊戲名稱 ｜ 說明 ｜ 版本號 ｜ 狀態 ｜ 創建時間 ｜ 狀態時間** ＋ 操作「上架｜刪除」。

管理員「上架審核」，覆蓋所有創作者：
**遊戲名稱 ｜ 作者 ｜ 說明 ｜ 版本號 ｜ 狀態 ｜ 創建時間 ｜ 狀態時間** ＋ 操作「同意上架｜拒絕｜刪除」。

## 6. 刪除規則

- **任何狀態都可刪，不需對方同意**（作者刪自己的、管理員刪任意的），立即生效。
- **不可恢復**：彈窗必須顯著提醒「刪除整個遊戲（含所有章節與已上架版本），不是刪除單個版本，刪除後不可恢復」。
- 刪除後：該行消失，線上入口下線，玩家端讀取視為「遊戲不存在」。

## 7. 章節（遊戲章節模塊）

| 面 | 內容 |
|---|---|
| 章節定義 | 開始年代：紀年標籤（公元前／公元后）＋年/月/日，均可編輯，作為本章計時起點 |
| 武將章節屬性 | 所屬勢力（以君主決定）、身份（君主/武將/俘虜…）、職務（軍師/內政官/外交官…） |
| 據點章節屬性 | 所屬勢力（以君主決定）、中立、是否首都 |
| 章節運行測試 | 單章試運行（現有 `TrialSessions` 按章編譯，本地、不發布） |

章節互相獨立：無跨章推進、繼承、結局或存檔槽傳遞；共享的只有底層地圖與武將資料庫。

## 8. 試運行與上架校驗

- 章節運行測試：單章，用於修正本章。
- 上架校驗：整遊戲（遍歷 `chapterOrder` 全部章＋跨章引用匯總），主要防止底層地圖（含據點、道路）與武將被刪除後章節引用不到。
- 改基礎屬性（名稱、能力）自動傳導，不算錯；刪除被引用的基礎資料必須報錯並阻止上架。

## 9. 玩家端存檔校驗

載入存檔時校驗兩項，任一不符即不能載入：

| 情況 | 提示 | 本機存檔處置 |
|---|---|---|
| 遊戲已不存在 | 「該遊戲已被刪除，存檔不可用，是否刪除？」 | **確認**才刪（逐槽 compare-delete；無法核對的行保留並報數）；**取消／右鍵**保留 |
| 版本不符 | 「遊戲版本已更新，存檔不可用」 | 已批准政策為**自動清除**，不是逐檔確認（原「選擇A續玩／單檔確認清理」已撤銷，見 `../AGENTS.md` §2.3）；無法判定為舊版的行保留且不載入 |

版本標識已存在（`releaseId / releaseOrdinal / manifestDigest / sourceDigest`），本項只新增「遊戲是否存在」與面向玩家的提示。實現與證據見 §10 B7 行。

## 10. 開發批次與驗收

| 批次 | 任務 | 驗收 |
|---|---|---|
| **B1** | 菜單重構：三層分組、改名（城池據點／遊戲章節／上架管理／用戶管理／系統資源）、取消 4 項、頂部當前遊戲選擇器 | 全新瀏覽器會話逐模塊進入無 console 錯誤；取消項不再出現在菜單；切換遊戲攔截未保存改動 |
| **B2** | 上架管理頁：單行列表＋三狀態＋版本號自動+1＋整遊戲校驗＋管理員同意/拒絕＋立即刪除（強提醒） | 草稿→上架→待上架→已上架全流程；校驗失敗不改狀態；刪除後行消失 |
| **B2 已落地（2026-11，未提交）** | 作者側單行列表（`GET /api/games/submissions`，狀態由既有 `content_releases`／`listed` 推導，未新增 schema）、上架＝既有 `POST /api/publish` 管線、刪除＝既有 `POST /api/games/<id>/deletion` 不可逆 fence；強提醒在 Vue 對話框，4xx 明確拒絕＝本次未提交（不保留追蹤鍵），失去回應／5xx 才保留原鍵待只讀查詢 | 狀態機與「校驗失敗不改狀態」「刪除後行消失」已由 `verify_publish_ui_model.mjs`（12/12）、`verify_publication_ui_browser.mjs`（7 段）與本地真機 `PASS-B2-SUBMISSIONS` 鎖定；**管理員同意仍走既有 listing 接口，審核頁與「已駁回」標記留 B3；已上架遊戲的刪除仍需 B3 的下架能力** |
| **B3** | 上架審核頁（管理員，跨創作者） | 同意/拒絕/刪除三動作；拒絕回待上架並標已駁回 |
| **B3 已落地（2026-11，未提交）** | `GET /api/admin/reviews`（admin-only，跨創作者，欄位含作者與 `rejected`）＋`POST /api/admin/games/<id>/review`（只收 `{action:'reject',expectedRowRevision}`，寫 `content_audits(action='admin-reject', before_revision=<被拒 ordinal>)`、row_revision+1，無 schema、無分發、不推 registry）；同意上架沿用既有 admin listing；刪除沿用既有 fence 並放開 listed（合同 §6「任何狀態可刪」），已上架刪除同一個 fence 事務內 `listed=0` 並推 registry revision | 「已駁回」由 audit 精確推導（重新提交新 ordinal 自動清除）；`verify_review_backend.mjs`（6 組真實程式碼檢查）、`verify_review_ui_model.mjs`（9/9）、`verify_review_ui_browser.mjs`（6 段）、本地真機 5 張截圖鎖定；`verify_publish_ui_model.mjs`（12/12）、`verify_publication_ui_browser.mjs`（7 段）、`verify_editor_shell.mjs`（82 checks）已同步新規則 |
| **B4** | 遊戲章節模塊：年代（紀年＋年月日）可編輯、據點章節屬性、武將章節屬性 | 三面均可保存並回讀；紀年切換不破壞既有年份 |
| **B4 已落地（2026-11，未提交）** | `#chapters-editor` 三面：① 章節定義＝`state.start` 的 `era∈{bc,ad}`（**作者層標籤，缺省視為 ad，永不把年份取負**）＋年 1–65535／月 1–12／日 1–31；② 據點章節屬性＝`city.faction`（null＝中立）與 `faction.capital`；③ 武將章節屬性＝`general.faction` 與 `faction.diplomat_idx`。五個新 save-pipeline op（`start-date`／`city-faction`／`set-capital`／`general-faction`／`set-diplomat`）都採「**命名視圖＋固定 raw 槽同步**」：勢力槽 `monarch_idx@1`／`advisor_idx@2`（null＝0x7F）／`capital@3`（null＝0xFF）／`diplomat_idx@0x2A`（null＝0xFF），據點 `raw+0x01`＝當前所屬（中立 0x18，**`+0x1A` 是原版舊所屬，永不改**），同時寫 `state.*Raw` 表；`setMonarch`／`setStrategist`／`disbandFaction` 一併改為同步寫 raw。君主／軍師／外交官互相排斥（持任一職務須先清空），內政官（`city.governor`，需聯動 `general+0x17`／預算 `+0x1A`）**只讀展示、本批不開放**，首都唯一且不要求該據點屬於該勢力（原版 8 個勢力即如此）。 | 已由 `tools/verify_chapter_attributes.mjs`（4 組：20 章 raw 不變量／寫入後命名值與 raw 同步＋`factionNativeConsistencyGaps`=[]＋strict `validateGameSource` 通過／`FixedCopyProfile.verify` 回滾含 era 缺省刪除且外部篡改仍 `COPY_PROTECTED_DELTA`／20 條負例）、`tools/verify_editor_faction_consistency.mjs`（8/8，末條改為鎖定同步行為）、`tools/verify_editor_draft_controller.mjs`（109/109，新增 era null/ad/bc 與 `diplomat_idx`／`capital` 投影）、`tools/verify_editor_shell.mjs`（87 checks）與本地真機走查 `PASS` 10 checks 鎖定：紀年切換後年份不變、年/日保存回讀、據點所屬→回讀、設首都→回讀、武將所屬→回讀、外交官設與清空→回讀，每面皆有一次確認對話框與自動重讀；**封閉原生的 template 作者檔案仍不開放這些欄位（`replayTemplateHistory` 只允許結構操作）** |
| **B5** | 武將管理「從底層資源導入」（庫默認空） | 空庫可導入；導入後章節可引用 |
| **B6** | 新建遊戲只複製地圖（含據點）；管理員複製遊戲全套 | 新建後章節與武將為空、地圖據點齊全；複製遊戲三者齊全 |
| **B6 已落地（2026-11，未提交）** | `POST /api/games`（新建遊戲）改回 `FIXED_TEMPLATE_PROFILE`：只複製地圖（含道路／放置物／192 據點定義）＋一個空白首章（`factions/generals/cities` 皆空），武將庫空；管理員「複製遊戲」新增於「遊戲管理」（`#draft-full-copy`），走既有 `POST /api/admin/copies` 全套複製（地圖＋20 章＋原生武將）。`copy.js` 以 `mode:'minimal'|'full'` 參數化，兩者原鍵命名空間分離，`run` 回應停在 pending 時不推定完成。**取代 2026-10-31「新建遊戲產出完整 20 章副本」的舊產品決定。** | `verify_editor_template_root.mjs --city-names-only`（改動前 FAIL→改動後 19 groups PASS）、新增 `verify_editor_copy_modes.mjs` 5/5、`verify_editor_shell.mjs` 90 checks、本地真機 7 checks（新遊戲：空白首章＋武將庫 0＋192 據點；複製遊戲：20 章×128 武將／192 據點；作者看不到複製遊戲） |
| **B7** | 玩家端存檔校驗：遊戲存在性＋版本＋刪除提示 | 刪除遊戲後加載存檔出現對應提示；確認刪除本地存檔，取消保留 |
| **B7 已落地（2026-11，未提交）** | 遊戲已刪除＝**reader 明確 fact**（`410 GAME_DELETED`），不是「公開目錄沒有這行」：`playerdeletedgame.js`（`isGameDeletedFailure`／`confirmGameDeleted`／`discardLocalSaves`／`mountDeletedSavePrompt`）＋兩個入口——① 公開載入入口 `playerpublic.js`（`mode=load` 且目錄無此遊戲時用 `reader.status` 確認，然後掛刪除提示）；② 讀檔選擇器 `playerrestore.js` 的 `GAME_DELETED` 分支（選單開著時被刪）。提示文案＝本文件 §9 原句；**保留／右鍵**不動存檔；**確認**才逐槽走存檔自身 `get`＋`compareDelete`（無法核對的行保留並報數），刪完只剩「返回首頁」。版本不符維持既有**自動清除**（§9 已註明），不重開逐檔確認 | `tools/verify_player_deleted_saves.mjs` 10 checks（只有 410 才算刪除事實；目錄缺失／未上架／其它 410／503 都不得刪；逐槽驗證，壞行保留）；`tools/verify_player_restore_browser.mjs` **37 checks**（原 29 ＋ 8：提示先於任何本機正文讀取、保留後目錄不變、確認後目錄清空、正文缺失的槽保留並報「另有1個無法核對」、右鍵＝保留）；`--alternate-faction --large-ordinal` **38 checks**；`tools/verify_player_deleted_entry_browser.mjs` 6 checks（真實 `index.html?formalGame=..&mode=load` 入口＋真實 Chromium IndexedDB：410 彈提示、保留→返回首頁且存檔仍在、確認→清空＋無第二次刪除鍵、右鍵保留）；`verify_player_saves.mjs` 36、`verify_player_module_layout.mjs` 7、`node editor-ui/build.mjs --check`、`node --check`、`git diff --check` 通過 |
| **B8** | 全章匯總校驗（上架前）＋啟動解耦（R2 非開機條件） | 刪除被引用的基礎資料時上架被阻止並列出受影響章；R2 不可達仍可啟動與編輯 |
| **B8 已落地（2026-11，未提交）** | ① 共用判定 `chapterBaseReferenceGaps`／`chapterReferenceReport`（`web/src/content/authoring/gamesource.js`）遍歷 `chapterOrder` 全部章：章節索引缺失、`chapter.people` 指向已刪武將庫定義、`chapter.cities` 指向已刪據點定義、章節原生據點記錄的固定槽在底層定義中已無對應。上架門 `#publishPin` **先**跑逐章清單（`422 PUBLISH_CHAPTER_REFERENCES`，錯誤封包帶 `detail.chapters`）**再**跑 `validateGameSource`，否則單一的 192 據點鎖訊息會蓋掉逐章原因。只讀入口 `GET /api/games/<id>/draft/chapter-references`（走既有 `privateDrafts.captureForCompile`，修訂由服務端取當前已保存值、不接受客戶端指定）供「上架管理」的「校驗整遊戲」使用；上架管理在收到該 422 時直接列出被拒清單。**現行作者操作無法製造懸空引用**（`generaldefinitions.js` 拒絕刪除被引用定義、據點 192 鎖且無刪除 op），本檢查是整遊戲的第二道門，不宣稱可從 UI 觸發。② 啟動解耦：`vps/r2reachability.mjs` 只把傳輸層失敗（連線／逾時／截斷／5xx／429）判為「不可達」；`startConfiguredPublication` 的程式位元組歸檔／登記與 `startPublicationServer` 的 `checkHead()` 在不可達時**降級啟動**（`status().startup.staticArchive='unreachable'`、`status().remote='unreachable'`），工作台仍可編輯、上架仍只到「分發待確認」；任何已觀測到的權威事實（REMOTE_AHEAD／REMOTE_GAP／LEGACY_PENDING／AUTHORITY_MISMATCH／非傳輸級錯誤）照舊在監聽前 fail-closed。**取代「遠端預檢失敗不監聽」的舊不變量（受批次約束限制）。** | `tools/verify_chapter_references.mjs` 8 checks（pinned 20 章副本零缺口；武將庫／據點定義／作者層引用／章節索引／同章多原因分組；`detail` 只在帶清單時出現；接線順序）；`tools/verify_publish_ui_model.mjs` **14/14**（原 12 ＋ 校驗只讀 GET／逐章顯示／未知回執拒絕／422 detail 直接列出）；`tools/verify_publication_main.mjs` **93 checks**（原遠端中斷改判降級啟動＋歸檔不可達仍啟動並冪等重試＋未分類錯誤與權威事實仍 fail-closed）；`tools/verify_review_backend.mjs`、`verify_editor_shell.mjs` 90 checks、`verify_static_release_package.mjs`、`verify_editor_chapter_people.mjs`、`verify_editor_general_definitions.mjs`、`verify_editor_faction_consistency.mjs`、`node editor-ui/build.mjs --check`、`node --check`、`git diff --check`；本地 `node tools/dev_editor.mjs` 全新 store ＋ 全新瀏覽器 profile：10 個一級模組逐一可見、上架管理「校驗整遊戲」回「整遊戲校驗（修訂 1，共 1 章）：全部章節引用完整。」 |

批次間不互相阻塞；每批交付附驗證證據，未經授權不 commit／不 push／不部署。
