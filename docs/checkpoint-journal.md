# 檢查點日誌

本頁交接本輪工作；長期命令、架構與約定見 [AGENTS.md](../AGENTS.md)。本頁不是操作授權，也不是原版機制的證據。

## §232｜據點選圖與複製保留（已提交推送）

- `c2ae722`（已隨主線推至 `github/main`）：遊戲與基礎據點共用攻城戰場、城景選圖；攻城候選依原始 192 城的據點類型篩選，野戰仍由地形決定。複製保留城景 ID `0..14`。另整理人數單位、表單與選圖視窗的自適應布局。產品與來源見[據點合同](editor-city-definitions.md)；具體差異用 `git show c2ae722` 查閱，不再以舊 §229 的分組數作為現行選圖規格。

## §233｜地圖邊緣延伸與基礎地圖（已提交推送 `bfba508`）

- **資料與保存**：不再讓使用者逐格重鋪新增行列。新增按鈕送 `map-extent`、`delta: 1`、`fill: 'edge'`，取當下邊線的普通地形與疊層，新增格有獨立身份；多格素材只取邊線。道路、橋、城門、據點不延伸，原座標不動。保留不帶 `fill` 的舊命令語意，不重寫已有空白行列。核心在 `web/src/content/authoring/mapextent.js`，預覽與服務端分別由 `web/src/editor/mapcommands.js`、`server/copyprofile.js` 呼叫。見[擴縮合同入口](map-expansion/README.md)。
- **介面演進**：使用者實測遊戲地圖四向成功後，移除「複製／填充」佔位按鈕，將八個文字按鈕改為網格後的北／南／西／東四組 `＋／−`。純圖示按鈕等寬高，方向組間留 16px。管理員「基礎地圖」直接使用同一工具列與命令，不另建實作；模板保存不修改既有遊戲。介面在 `editor-ui/src/{BaseMapPanel.vue,WorkspaceIcon.vue,theme.css,main.js}`，同步重建編輯器資源。
- **調試**：疊層案例最初因測試用山脊配方的 ID 與定義不符，觸發 `INVALID_COMPONENT_IDENTITY`；修正夾具的定義、視覺配方與隔離地圖，沒有放寬校驗。瀏覽器最初因測試伺服器未供應 `auth-logo.png`、`brand.png` 產生兩個 404；改由夾具供應真圖，不忽略 console 錯誤。
- **收據**：`verify_map_extent_sides_ops.mjs`＋`verify_map_extent_controller.mjs` 共 11 項通過（四向保存重讀、縮回、調整新格再延伸、排除特殊物件等）；`verify_map_extent_templates.mjs` 7 項通過（配額、權限、建立時快照與舊副本隔離等）。`tools/verify_system_base_map_browser.mjs --edge-growth` 驗遊戲地圖；`--base-edge-growth` 以全新瀏覽器驗基礎地圖四增四縮、每步保存重讀與最終還原。兩者是隔離 API 夾具，不是生產驗收。編輯器 build、`--check`、Vue LSP 通過。

## §234｜模組改名（已提交推送）

- `server/public/client.txt` 的 `catalog-editor` 顯示名由「人物頭像」改為「遊戲資源」。ID、管理員權限、頭像功能不動。
- 當時完整 `verify_editor_shell.mjs` 停在舊 `login-form` 斷言；§235 已將該斷言與 current-game-selector 改為正則，現停在預存的 `accounts-vue-owned` stale（ElTable 遷移前即存在，未動）。

## §235｜編輯器 UI 統一規範（Message／Dialog／Form／預設主題）＋冒烟修復（已提交推送 `5065270`）

- **範圍**：`editor-ui/src` 全量：新建 `notify.js`（ElMessage plain:true 統一出口）；`main.js` 加 message 樣式＋`statusError` 旗標；`Workbench.vue` 全局 toast 觀察器（statusMessage 按 statusError 分 info/error，model.message 陣列去重 info）＋`onNotice`；Stronghold／Generals／Chapters 本地狀態補 toast；8 個原生 form 全轉 ElForm／ElFormItem（login／password／profile 無 @submit，仍由 `server/public/client.txt` 的 FormData 接管，保留 form id、input name、reset 語義）；Chapters 新增章、Stronghold 新增據點、BaseMap 保存檢查加 `align-center`／`destroy-on-close`／`close-on-click-modal`；CopyGame 轉換明細、full-copy／publish 失敗、review 三階段按鈕移入條件 footer（id 保留、幾何不斷言變化）；`theme.css` 刪除失效的 `form:not(.el-form)` 等規則，換成 `.el-form` 等價布局。`tools/verify_editor_shell.mjs` 的 login-form／current-game-selector 斷言同步為正則。
- **刻意不動的例外**：GeneralsPanel 相簿（幾何斷言鎖定）；阻塞式 alertdialog 三處體內標題＋按鈕；`window.confirm`（Stronghold 刪除，改 ElMessageBox 會破壞 `verify_city_delete_browser` 的 native-dialog 自動接受，且本機無瀏覽器可重驗）；`accounts-vue-owned` 斷言仍紅（預存 stale，未動）。
- **冒烟抓到的兩個真 bug（已修）**：① GeneralsPanel `watch(albumFailure)` 寫在 `const albumFailure` 宣告之前，掛載即 ReferenceError——三個本地 watch 已移到宣告之後。② Workbench 全局觀察器讀 `props.managementModel.message` 拋 TypeError——根因是 `defineProps` 漏宣告 `managementModel, management`（main.js 有傳、watcher 有讀，props 回退為 undefined），已補回宣告。兩者皆為本輪新增代碼的缺陷，非原版機制問題。
- **驗證收據**：`node build.mjs`＋`--check` 通過；`npm run --prefix editor-ui/lsp check` 36 個 SFC 零診斷；`git diff --check` 乾淨（僅既有 CRLF 提示）。隔離冒烟（8446＋smoke2 臨時庫＋全新 profile，dev server 自動重載新 bundle）：錯誤登錄 toast 為 `is-plain error`、login／password／profile／create／copy-create／full-copy-form 均為 ElForm、登錄→工作台掛載→6 個可見視圖＋個人資料／變更密碼全部零 pageerror。`verify_editor_shell.mjs` 跑過已修的兩處斷言，仍停在預存的 `accounts-vue-owned`（第 70 行），與修復前一致，無新紅。
- **未動／待辦**：8447 新 store 啟動失敗，係倉庫預存不一致——`server/available-library.txt` 的 programHashes 與已提交的 5 個 `web/src` 文件（main／endview／mapview／gamebar／hud）對不上，本輪未碰 web/src，已確認 8446 照常用 pinned 跳過 staging 正常服務（坑點已回流 [AGENTS.md](../AGENTS.md)§4）。登錄成功後舊的「帳戶或密碼無效」文案殘留顯示（statusMessage 成功路徑未覆蓋），小瑕疵未修。

## §236｜記憶整理（journal 修剪＋事實回流 AGENTS.md）

- 把 §232／§233／§234／§235 的狀態更新為已推送（`c2ae722`、`bfba508`、`5065270` 皆在 `github/main`，工作樹乾淨）；刪除 §234 已失效的交接項（舊 HEAD、手測重啟排查）；§234 的 login-form 阻塞已由 §235 解決，現唯一 stale 為 `accounts-vue-owned`。
- 長期有效的兩條回流至 [AGENTS.md](../AGENTS.md)：§3 消息出口＋三表 FormData 約束；§4 新庫 staging 指紋預存不一致坑點。一次性的 TDZ／defineProps 根因只留 §235，不進記憶。
- 本輪只改 journal 與 AGENTS.md，未跑遊戲回歸；當前阻塞與下一步見 §235 未動／待辦，無新增阻塞。提交／推送另需授權。

## ENGINE-AUDIT｜財政輸入、水戰速算、日月結與災害

- 修復玩家下月稅率／三兵種配額未寫原生政策塊，及相容災害處理器延遲清除事件遺失城指針；外交失敗夾具補已運轉事件輪游標，未放寬正式檢查。已批准的 Web 水戰速算僅切換雙方主將專長，不改兵種權重、行軍或抽數。規則來源見 [月度財政](re-notes-ai-fiscal.md) 與 [武將字段](re-notes-entity-fields.md)。
- 日月／災害／戰鬥等串行專項 225 項，加開局政策 6 項及進言／道路到達／戰後／區域天氣 47 項。全新瀏覽器 Clock smoke 通過；原版第一章勢力 0 由 196/4/1 跨至 196/6/7，兩次月結、瀏覽器記錄 0 錯。不代表逐幀 DOS 全遊戲等價。
- 公開玩家入口所選程式 `826b7c3a…` 仍提供 `43D3 faction alias` 舊路徑；本輪未部署。路徑 LSP 未返回診斷，無 lens 工具；tsc、JS 語法及 diff 另驗。

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
