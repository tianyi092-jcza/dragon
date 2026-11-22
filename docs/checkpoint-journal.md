# 檢查點日誌

本頁交接本輪工作；長期命令、架構與約定見 [AGENTS.md](../AGENTS.md)。本頁不是操作授權，也不是原版機制的證據。

## §232｜據點選圖與複製保留（已本地提交）

- `c2ae722`：遊戲與基礎據點共用攻城戰場、城景選圖；攻城候選依原始 192 城的據點類型篩選，野戰仍由地形決定。複製保留城景 ID `0..14`。另整理人數單位、表單與選圖視窗的自適應布局。產品與來源見[據點合同](editor-city-definitions.md)；具體差異用 `git show c2ae722` 查閱，不再以舊 §229 的分組數作為現行選圖規格。

## §233｜地圖邊緣延伸與基礎地圖（本地未提交）

- **資料與保存**：不再讓使用者逐格重鋪新增行列。新增按鈕送 `map-extent`、`delta: 1`、`fill: 'edge'`，取當下邊線的普通地形與疊層，新增格有獨立身份；多格素材只取邊線。道路、橋、城門、據點不延伸，原座標不動。保留不帶 `fill` 的舊命令語意，不重寫已有空白行列。核心在 `web/src/content/authoring/mapextent.js`，預覽與服務端分別由 `web/src/editor/mapcommands.js`、`server/copyprofile.js` 呼叫。見[擴縮合同入口](map-expansion/README.md)。
- **介面演進**：使用者實測遊戲地圖四向成功後，移除「複製／填充」佔位按鈕，將八個文字按鈕改為網格後的北／南／西／東四組 `＋／−`。純圖示按鈕等寬高，方向組間留 16px。管理員「基礎地圖」直接使用同一工具列與命令，不另建實作；模板保存不修改既有遊戲。介面在 `editor-ui/src/{BaseMapPanel.vue,WorkspaceIcon.vue,theme.css,main.js}`，同步重建編輯器資源。
- **調試**：疊層案例最初因測試用山脊配方的 ID 與定義不符，觸發 `INVALID_COMPONENT_IDENTITY`；修正夾具的定義、視覺配方與隔離地圖，沒有放寬校驗。瀏覽器最初因測試伺服器未供應 `auth-logo.png`、`brand.png` 產生兩個 404；改由夾具供應真圖，不忽略 console 錯誤。
- **收據**：`verify_map_extent_sides_ops.mjs`＋`verify_map_extent_controller.mjs` 共 11 項通過（四向保存重讀、縮回、調整新格再延伸、排除特殊物件等）；`verify_map_extent_templates.mjs` 7 項通過（配額、權限、建立時快照與舊副本隔離等）。`tools/verify_system_base_map_browser.mjs --edge-growth` 驗遊戲地圖；`--base-edge-growth` 以全新瀏覽器驗基礎地圖四增四縮、每步保存重讀與最終還原。兩者是隔離 API 夾具，不是生產驗收。編輯器 build、`--check`、Vue LSP 通過；本會話沒有可用的 `lens_diagnostics`。

## §234｜模組改名、記憶整理與交接

- **改名**：`server/public/client.txt` 的 `catalog-editor` 顯示名由「人物頭像」改為「遊戲資源」。ID、管理員權限、頭像功能不動。同步 `tools/verify_editor_shell.mjs` 的名稱斷言；語法與名稱／權限定點檢查通過。
- **未通過**：完整 `verify_editor_shell.mjs` 在更早的 `login-form` 斷言即停止，沒有跑到選單名稱檢查。這不阻塞單純改名，但不能把整套 shell 驗證記為通過。若要恢復此驗證，先對照現行登入元件與舊斷言，不要以更改登入功能來迎合測試。
- **記憶整理**：長期規則及命令歸入 [專案記憶](../AGENTS.md)，歷史批次改用下方索引，不把舊版服務狀態、遠端同步或部署待辦沿用為現況。
- **交付邊界／下一步**：整理時本機 HEAD 為 `c2ae722`；其後的地圖、介面、改名與文件修改尚未提交。本輪未推送、部署或寫入實際地圖。若手測服務仍顯示舊名稱，重啟自己持有的編輯器實例後再核對。本次只整理文件，不重跑歷史遊戲回歸；提交、推送、部署分別需授權。

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
