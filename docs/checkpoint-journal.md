# 檢查點日誌

長期架構、命令與操作約定見[專案記憶](../AGENTS.md)；本頁記本輪交接。歷史結果不是部署授權，也不代替 DOS 原證。

## 據點編輯｜保存慢的原因、修正與驗證

- **現象與定位**：只改南昌的州郡也要久候。前端已送欄位差異；瓶頸之一在 `server/systembasemapstore.js`：舊 `saveCities()` 走整圖 `save()`，重讀模板、檢查連通性並編譯。遊戲副本則在單行保存後重新下載整份資料。兩者不是同一個問題。
- **修正 `621e202`**：系統基只替換已驗模板中的城市資料，保留版本與摘要；`server/gamecopy.js` 與 `server/public/draft.txt` 以保存回執更新副本行。兩個據點面板統一空數值存 0、允許清除圖片；不改刪城引用檢查。詳見[據點欄位合同](editor-city-definitions.md)。
- **失敗與修正**：初版用無原型物件組城市字典，物件內驗證通過，但持久化後重新建遊戲報 `system base map snapshot digest mismatch`。改用一般 JSON 物件；回歸改為序列化往返後重算摘要。隔離 HTTPS 重驗讀寫、直推與新建播種通過。瀏覽器段首次找不到 Playwright；指定已安裝模組後，以新 profile 驗證行編輯、數值清空存零及清圖後再讀。
- **性能邊界**：已載入的原圖夾具、記憶體 SQLite，單次屬性保存測得 451 ms；不是瀏覽器總耗時或生產保證。副本控制器另驗單行回執不發整份 GET，刪城仍拒絕落點、道路及章節實質引用。
- **州郡 `0e9c267`**：`StrongholdCreate.vue`、兩個據點面板、讀寫控制器及 `cityrecords.js` 同步放寬到 6 個 Unicode 碼點，仍可空。副本控制器 15 項、六字／七字邊界（含生僻字）、Vue LSP、build/check 通過；這次長度改動未做瀏覽器實測，無 lens 診斷。未遷移開發資料。
- **州郡上限 8（本輪，未提交）**：用戶將「所屬州郡」上限從 6 放寬到 8（`州·郡國`如幽州·右北平郡 7 字）。`cityrecords.js`、`systembasemap.js`、`StrongholdCreate/StrongholdPanel/SystemStrongholdPanel.vue`、`basecities.js`、欄位合同及 AGENTS 記憶同步到 8；副本控制器 15 項重跑通過，Vue LSP 37 SFCs 0 告警，`editor-ui/build.mjs --check`＋重建通過，`trialweb.txt` 無變化（无需重建）。
- **195 城州郡回填（本輪，未提交，只寫 dev 系統基）**：以用戶網站郡縣總表對應的倉庫數據（`data/original.json` cmd/cit/cty＋`data/office-places.json` 州歸屬）為源，斷代公元 200 年、繁體 `州·郡國`。dev 庫 `editor.sqlite` system_base_map version 133→135，已填 35→170（新增 135＋補短 2：瑯邪徐州→徐州·瑯邪國、長沙荆州→荊州·長沙郡），空白 25，超 8 字 0。實錘 127（縣→郡→州／省尾補全／異體別名），推斷 10（同名取地＋coords：樊城荊州·南陽郡、廣德揚州·丹陽郡、秭埽荊州·南郡、下邳徐州·下邳國、武都涼州·武都郡等；官渡/虎牢/界橋等關隘渡口留空）。
- **維持已填不覆蓋 7（待用戶定奪）**：曲梁（司隸·廣平郡 vs 冀州·魏郡）、館陶（司隸·陽平郡 vs 冀州·魏郡）、平陽（司隸·平陽郡 vs 司隸·河東郡）、盧（青州·濟北國 vs 兗州·濟北國）、鄴（司隸·魏郡 vs 冀州·魏郡）、易城（幽州·涿郡 vs 冀州·河間國）——候選皆有 200 年實錘（廣平/陽平/平陽三郡為魏晉置；鄴 200 年屬冀州袁紹；易城 cty 易→河間國），但尊重現填值未動。北平（279,-3）強制留空：cty 僅中山北平縣與圖位不合，地望近無終（右北平郡）或為遼西方向邊塞，所指待考。

## 同輪玩家與地圖交付｜`a31ac39`

- **玩家**：財政面板分開顯示最近結算與次月政策；月結等待期間不顯示零日。格圖經過敵城改在城門接戰，戰略接觸等候中可改令；列表首次點列降序。來源與邊界見[財政](re-notes-kernel.md)、[行軍](re-notes-march-pathfinding.md)。推送前選跑 49 項回歸通過，非全戰役驗收。
- **地圖**：基礎與遊戲地圖共用 Shift／右鍵框選；Ctrl+C 讀同一選區，Delete 沿用確認。見[操作合同](map-atomic-catalog-contract.md)。兩模組框選／刪除瀏覽器夾具通過；剪貼只驗控制器。舊綜合腳本等待道路移位提示逾時，不計為通過。

## 阻塞與下一步

- **擴縮配額 20→40＋系統基自動擴圖（本輪，未提交）**：用戶要求四邊各再加 20（只動系統基）。`MAP_EXT_SIDE_MAX`、面板配額、活合同同步 40（最大 `464×336`）；dev 系統基一次 80 條底圖命令從 `424×296` 擴到 `464×336`（v139），195 據點＋195 州郡全保留。配額類驗證同步後全綠；`impact` E4／`battle` E8／`publish` E10 在乾淨 HEAD 同錯（既有失敗，非本輪）。另：v137–138 他人會話已把關城填益州、北平填幽州（與無終地望一致），予以保留。commit／push 未授權未執行。

- 據點兩批已本地提交，無已知實施阻塞。整理時本地 `main` 比追蹤的 `github/main` 多上述兩個提交；未部署。推送、部署另需授權。
- 新野月結隔離樣本（本地《呂布歸天》1.7）不是玩家歷史對局重播；徵兵流量不等於庫存淨變化，途中戰損也未定位。若續查，對齊章節、月份、調兵與戰鬥前後狀態，再用 `tools/verify_release_xinye_recruit.mjs` 比對，不靠單張截圖改公式。
- 本次整理僅調整 `AGENTS.md` 與本頁；早期擴圖、存檔、戰後及舊夾具失敗細節見 `git show 0e9c267:docs/checkpoint-journal.md`。

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
