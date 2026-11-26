# 檢查點日誌

長期架構、命令與操作約定見[專案記憶](../AGENTS.md)；本頁記本輪交接。歷史結果不是部署授權，也不代替 DOS 原證。

## PLAYER-START-MASK｜選章到軍師、確認到入局的等待回饋（本地）

- 生產 `ceb2df1` 更新前端遮罩前，以新 Chromium 會話開《臥龍傳·重構》第二章：本次章節包準備 9.95 秒，確認軍師到新局完成 5.14 秒（其中共用資源 4.52 秒）；是一次量測，不是固定耗時。
- 等待章節包、確認窗頭像與新局裝配時顯示模態遮罩及不定進度，保留可立即選取的勢力目錄和既有驗證。開局流程、命名後防重入／錯誤清理與隔離正式 reader 前兩章新局、存讀均通過。正式 reader 測試初次因舊 `dist` 身份不符被拒；重建本機靜態清單後通過，未放寬身份、未改上架資料或部署本次遮罩。

## DEV-FORMAL-BOOTSTRAP-R1｜舊 dev 發布基線遷移演練通過，真庫待批准

- `node tools/rehearse_dev_distribution.mjs`：唯一 dev SQLite 只讀開啟，用 SQLite online backup 取得一致備份，再從備份建立可寫副本。SQL、分發桶、票證僅在系統臨時目錄／記憶體；沒有 `--apply`、對外監聽或生產連線。結束刪除臨時資料，此備份**不是**真遷移所需的持久備份。
- 實測基線為一款已上架遊戲 `8c05e6a0-f9ed-4be2-b25a-dd6c57ac4bce`，release `79f5fd86-6c3f-45ba-8a64-7fec0ae3a74e`，ordinal／revision `1.7`，sourceDigest `97254353e4a189198d8fb2362977e14656d2ce62226b188c5e43950915931954`。8 行舊 outbox（1.0–1.7，全 pending、0 次、無回執）、8 行舊公告，沒有舊正式根；不代表 8 次正式可見發布。
- 不重審、不重編、不重置序號。由現存 pack 建立並核驗正式資源，在同一 SQLite 交易歸退兩張舊表的 16 行、加入 **bootstrap** gen1 的 v2 catalog/projection（並非新的 publish）。正式目錄只公開現行 1.7，首次正式可見時間取新根回執；1.0–1.6 沒有正式歷史，舊記錄在原備份中保留，不偽造 `game_releases` 發布日誌。
- 驗證：交易末端故意失敗，16 行逐行恢復、帳本仍為 0；正常提交後、分發前關庫重開，標準 publisher `VISIBLE_CONFIRMED`，再 drain 為 `IDLE`。reader 對 19 章逐章換票、取 manifest 與正文、核對 SHA；6 個遊戲資產、共享依賴與靜態包通過正式驗證。manifest `142bd3aaf9ed0cae9c1b47edf6ed8b1b574c06ae104fc77e5c7c261f84ca0b68`，runtime index `6fa760f041058482737064b6cd81e6a2ced5f0dfefa80dcf780af34503381f5e`。57 張表除 5 張遷移／分發表外，其餘 52 張與備份雙向逐行比對一致，integrity/FK 通過。新 producer 可接續建立 gen2（僅交易內探針，已回滾）；**沒有**真的發布 1.8。此輪驗資料與 reader，非重跑瀏覽器。
- **下一步需單獨批准**：只遷移本地 dev。停本地寫入、持久保存一致 SQLite 與對應 private／配置備份、確認無既有分發根，重核上述 pin／摘要／舊記錄，再套用已演練的基線；若輸入不符則停止。啟動兩個本地站後從 `8443/play` 驗收，生產、登入賬號、遊戲編輯資料及玩家存檔不遷移。不得只還原 DB 卻留下較新的分發根。

## DEV-FORMAL-ENTRY｜dev 向生產統一（本地代碼、隔離驗收；未部署／未遷移）

- 現行決定取代下文 11/26 事故條目的待辦：截圖確為 `Scenario content identity/index mismatch`。`26255ed` 只改 `chapter(index)`，繼承的 `resolveReference()` 還回傳原本的第 0 槽。修正不是放寬身份校驗：標題目錄以行號選 `chapterId`，取得正式環境後原樣安裝，開局與存檔一律用該單章環境的 0 槽。
- `tools/dev_editor.mjs` 啟動本機正式發布器及獨立 reader：預設 `8443/play` → `8444/`，生產標題頁、章節目錄、票、分發、存讀檔同一路徑；管理界面留在 8443，玩家端不轉發編輯器 cookie。開發重建含 dist、程式歸檔與登記；不連生產。舊 `/api/trial-pack`、`/api/published-games` 不作玩家 fallback。
- **已驗**：`node tools/verify_dev_formal_site.mjs 8c05e6a0-f9ed-4be2-b25a-dd6c57ac4bce --rules`。只讀 dev 1.7 的已發布包，加載到系統臨時目錄中的隔離分發／SQLite（夾具入帳，不是舊庫遷移或真實審批）。全新 Chromium 從 `/play` 跳轉正式標題，upper-1／upper-2 均實際進入 195 城地圖、各存一槽；回標題按槽讀回正確章。無 console error／pageerror；無簡易取包請求。呂布格圖 AI、新野月結兩條回歸也以正式 reader 取包通過。`verify_player_environment` 40、`verify_player_saves` 36、`verify_publication_server` 18、`verify_frozen_player_surface` 13；bundle check、JS 語法、diff 通過。JS LSP 收到 9 條路徑回報（含建議診斷），無 `lens_diagnostics` 工具。
- **未通過／未做**：獨立 `verify_player_site.mjs:83` 期望換版後仍可用舊票讀章，現行 reader 回 409 `RELEASE_CHANGED`；未為此修改換版規則或宣稱該測試通過。未測全戰役、未提交推送、未改生產。
- **真實 dev 資料待批准**：唯一 dev 庫有 1 個舊 pin（1.7）、19 章、8 條舊 outbox，正式分發事件為 0，沒有對應的正式公開分發桶。切換程式不會令該 pin 出現在 reader，也不自動搬舊 origin 的瀏覽器存檔。下一步先定本地舊發布基線的遷移方案，一致備份、在隔離副本演練後再動真庫；不要刪遊戲或用生產桶補資料。

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

## 生產玩家報錯（2026-11-26，本輪目標：dev 部署生產＋修上架遊戲進局報錯；狀態：部署完成，報錯未解，我方诊断已证伪）

- **本輪目標**：把當前 dev 部署到生產（用戶授權整機替換，僅保留登錄賬號）；修復生產玩家頁報錯（用戶兩台電腦必現：上架遊戲加載章節後點擊，報錯回標題；內置遊戲秒進正常；dev 進第 1 章正常）。
- **已完成工作**：生產備份 `backup-20261126T152325Z`；src 取到 `f28fe55`；靜態重建 digest `36e8b97`；雙鏡像構建；數據置換（DB v220＋private／kao 同步，sessions 清空）；Dockerfile 漏拷兩文件各修一次（`d4e8ae3`／`ac46b7d` 已推送）；editor 健康 initialized:true；刪 8 條 dev 殘留 outbox＋8 條公告後重上架 8c05 出 1.0（註冊表 gen1、19 章 pack 下發、勢力表真實渲染均驗過）；州郡上限 8＋195 城回填＋擴圖 40 配額＋推送 `f28fe55`；`26255ed` 修復推送＋生產 `dist/src/main.js` 單文件同步（SHA 與源碼一致，服務 200）。
- **關鍵決策（及後果）**：①整機替換生產（僅保留 tianyi／tester 賬號；臨時口令已置，must_change 待恢復）。②移植殘留 outbox／公告直接刪除（不可再生 debris，pins／packs／chapters 等 durable 數據保留）。③`26255ed`：`_installFormalChapter` 按目錄位置校準 `legacyScenarioIndex`（見下，已證偽，待回滾判定）。
- **我方诊断链（已证伪，原样保留供复盘）**：`playerenvironment.js:44` 上架包章节 `legacyScenarioIndex` 写死 0 → `main.js:1171 _installFormalChapter(index)` → `setScenario(i)` → `loadState(mode:fresh)` → `currentMetadata(idx)`（`scenarioassembly.js:212`）断言 `chapter.legacyScenarioIndex === idx` → k>0 章必抛 `Scenario content identity/index mismatch`。node 模拟：修前 idx=1 抛原文、idx=0 过；修后两者皆过。但用户侧实测“错误还是依旧”，该链不能解释现象，结论作废。
- **失败尝试**：①三浏览器标题页干净——无效证据，我根本没走进章节（命名提交静默回标题，canvas 章节进入没走通）。②boot.js 三家字节一致——只排除了启动码分叉。③用户截图我方始终无法查看；exact 报错文字我从未亲眼拿到（一路是转述）；用户两台必现 vs 我方必不现的差异变量至今未隔离（是否 Ctrl+F5 硬刷未知——生产 dist 是 15:24 旧构建＋本次单文件补丁，浏览器缓存旧 main.js 即可解释“依旧”，但用户已不耐烦，未确认）。
- **相关文件**：`web/src/main.js`（`26255ed`，5 行补丁）；`web/src/player/playerenvironment.js:44`；`web/src/game/scenarioassembly.js:183-192/212-222/338`；`web/src/player/playercatalog.js`（标题公告对话框，非故障点）；`web/src/main.js:277 beginNewGame`；生产 `/srv/dragon/dist/src/main.js`（已同步补丁，回滚基线 bak 在 `/tmp/main.js.bak`，重启即失）；`backup-20261126T152325Z`。
- **当前状态**：生产 dist 已含 `26255ed` 但用户侧仍报错（缓存未排除）。用户原话：“错误依据。你解决不了。”“错误还是依旧”。诊断失效，不得再向用户复述该链。
- **阻塞点**：①无 verbatim 报错文本（用户贴的是本机截图路径，我方打不开）。②无复现（canvas 章节进入链我方没走通；命名静默返回本身也是未解 bug）。③不知用户是否硬刷，无法区分“补丁无效”与“缓存旧码”。
- **下一步（按顺序）**：①只问用户一件事：是否 Ctrl+F5 硬刷后重测（附带问第几章：若只有 upper-1 能进、upper-2 起失败，则旧链尚有残值；若 upper-1 也失败，则旧链全错）。②拿到一字不差的报错文字＋报错前点击步骤。③用 playwright 走通 canvas 章节进入，在己方复现后来抓 console＋network 定位真断言（候选还有 `playersaves.js` 的 formal save identity 系列、`scenarioassembly:426` city/node、`351` road version）。④证伪则 `git revert 26255ed`＋重建 dist 全量（不用单文件补丁），恢复干净基线。⑤本轮不再做新部署动作，不删游戏（已明确反对：内容在 8c05 内，删即丢 17 章＋1.0 发行）。

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

## 生產部署（2026-11-26，用戶授權整機替換，數據上架暫緩）

- **範圍**：src 取到 `f28fe55`，靜態重建，雙鏡像構建，數據整庫替換為 dev（含 DB v220／private／kao；僅保留登錄賬號語義，tianyi 口令已臨時重置＋must_change=1 待用戶首登輪換）。備份 `backup-20261126T152325Z` 保留，舊 dist 字節因 rsync --delete 丟失（見前條）。
- **現狀**：editor Up 且 `/api/health` initialized:true；雙域靜態 200；player 容器 Up 但 unhealthy——`REGISTRY_EMPTY`，分發桶空（dev 從未分發＋舊桶被替換）。用戶指示數據上架暫緩，故 player 健康依賴的 publish 一步留待後續。
- **構建修補**：Dockerfile 漏拷 `tools/system_base_map_conversion.mjs`＋`pieces` 兩文件，各修一次（`d4e8ae3`／`ac46b7d` 已推）。
- **待辦**：上架 8c05（清掉 8 條 dev 殘留 outbox＋8 條殘留公告後重新 publish，編譯約數分鐘）→ bucket 有包 → player 轉健康。另：登錄限流窗 10 分鐘／同賬號 5 次，重試需間隔。
- **上架完成（同日稍後，用戶手动 validate→submission→approve，approve 初次 503）**：根因是移植把 pin（1.7）帶來、賬本事件沒帶來——`recordInTxn` 在空賬本下 catalog 為空、新版本序號必須恰為 `1.0`，而 pin 1.7 推出 1.8，對不上即 `DISTRIBUTION_AUTHORITY_CORRUPT`（fail-closed 符合設計；本地 9443 能過是因為 dev 入口沒配 publicationProducer，根本沒進賬本檢查）。修法（一次性創世引導，備份 `editor.pre-fresh-bootstrap.sqlite` 在前）：刪移植 pin／packs／releases、current_release_id 置空、next_ordinal 歸 `0`，slot 保持 submitted；重批得 `approved ordinal 1.0`，賬本 gen1 落地、outbox 即时排空、注冊表內外網 200（含臥龍傳·重構 1.0 全章節），player 轉 healthy。生產序號從 1.0 起算（dev 仍稱 1.7，內容一致，後續 dev 發版與生產各自遞增）。
- **收尾衛生**：一次性管理會話已刪（用戶自有 UI 會話保留）；tianyi 口令為用戶自設（must_change=0，保持）；prod 臨時腳本已 shred；worktree 內 prod DB 拷貝與臨時口令 helper 已刪。
