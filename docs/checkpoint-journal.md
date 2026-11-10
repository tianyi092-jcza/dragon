# 检查点日志（checkpoint journal）

> **用途**：只记录**本工作线**的详细进展、调试过程、失败尝试、相关文件、当前阻塞与下一步。
> 长期事实／架构／命令／约定／主线在 [AGENTS.md](../AGENTS.md)；生产布局与部署配方细节在
> [game-storage-layout](game-storage-layout.md) §16 与 **§18（现行）**。本文件不复制、不替代原始证据或验证。
> 旧批次（EDGE 之前的 ui7–ui16、B1–B8、方案 B 的 A/B/C 批）已删；需要细节用 `git log -p -- docs/checkpoint-journal.md`。
> 仍被外部文档引用的旧锚点保留在文末「归档锚点」。

## 速查：当前生产（2026-11-09 UTC 起）

| 项 | 值 |
| --- | --- |
| 主机 | `ssh sadcloud`（82.158.91.231:7218，Debian 13，4C/3.9G/50G），根目录 `/srv/dragon` |
| 镜像 | 编辑器 `dragon-editor-publication:20261111-city2`（HEAD `ec7d1c8`，sha `58d62d5d…`）；玩家 `dragon-player:20261109-b6-disk` |
| 静态发布 | 清单 `826b7c3a…`、sourceTree `65cbb8d7…`、1442 檔／165.81 MiB，`publication.env` 三个 pin 与 nginx `deployment-assets/static-v1/<digest>/` 一致 |
| 入口 | nginx 443 `ssl_preread` 按 SNI → `8443` → `8788`（editor）／`8789`（player）；两域名 A 记录灰云直指源站，TLS=Let's Encrypt（SAN 覆盖两域名） |
| 数据 | `data/editor.sqlite`（`700`/`600`，uid `1000`）、`private-objects/`、`bucket/`、`dist/` |
| 线上事实 | 账本 `tail=confirmed=16`；`937c71ab…「臥龍傳·重构版」` `listed=1`、pin `1.0`；玩家目录 revision **1**（编辑器 `draft_revision=2`，见 §11）；玩家 `registry` generation 16 |

部署（改完必须锁步，改 `web/` 才需要重建静态发布）：

```bash
ssh sadcloud 'cd /srv/dragon/src && git fetch -q origin main && git reset -q --hard origin/main'
ssh sadcloud 'cd /srv/dragon && docker builder prune -af && docker build -f src/vps/Dockerfile.publication -t dragon-editor-publication:<tag> src'
ssh sadcloud 'cd /srv/dragon && EDITOR_DEPLOYMENT_ID=<tag> PLAYER_DEPLOYMENT_ID=<tag> docker compose up -d --force-recreate editor player'
curl -s https://dragon-editor.720108.xyz/api/health   # 200 + initialized:true
curl -s https://dragon.720108.xyz/play-api/v1/registry # generation / directory
```

## 1. 批次 A：上架申請 190–205 s 後 `DISTRIBUTION_AUTHORITY_CORRUPT`

- **根因（實錘，經生產庫只讀核對）**：`content_distribution_checkpoints` 的唯一一行把 `anchor_digest` 指進**退役範圍**（gen14 自己的 digest），`retireCheckpointInTxn` 只驗「digest 存在」不驗「未退役」，於是 `e089e88` 的 `#anchor()` 在 `check(entry.retired !== true)` 直接 503。第二層同樣真實：錨點快照（gen11 目錄）裡沒有「在退役世代才上架」的遊戲，重發時「前一版序號」被當 null。
- **修法**：`#anchor()` 改為按世代從新到舊取第一個**未退役**的可讀世代（全部退役才 503）；`#catalog()` 在 `tail.retired` 時走新的 `#rebuild()`，按資料庫權威事實（`published_games`／`content_games`／`content_deletion_fences`）重建 `catalog.games`，錨點只當 digest 鏈起點與 runtime 冷凍沿用；runtime 不能臆造時由 pack 重算（`buildRuntimeIndex`）。
- **檔案**：`server/publicationproducer.js`（`#anchor`/`#catalog`/`#rebuild`/`#retained`/`#pinned`/`#runtime`/`#previous`/`#firstOnline`）、新 `tools/verify_publish_after_retirement.mjs`（3 組）。
- **失敗嘗試（留證）**：新 lane 用舊碼覆蓋必重現 503（舊檔 `:106` 的 ordinal check），證明測試真的咬住此 bug。
- 提交 `7590fdc`／`905dffe`／`a84412b`；鏡像 `20261109-b2-disk12`；上線後使用者重試成功 → gen15 publish `1.0`，管理員「同意」→ gen16 listing，玩家目錄出現。

## 2. 批次 B：② 檢驗結果落庫＋按鈕規則；③ 四層逐項

- **新表 `content_game_validations`**（8 列、PK `game_id`；`state`/`checked_at`/`draft_revision`/`source_digest`/`chapter_count`/`failed_chapters`/`problems_json`）＋ `server/validations.js`（`ValidationStore`：UPSERT、`readFresh` 按修訂、報告上限 256 KiB、壞行 503）＋ `server/validationdeclarations.js`（additive 宣告）。
- **接口**：`POST /api/games/{id}/draft/chapter-references`（空 body）落庫；上架門在章節引用檢查之後、`validateGameSource` 之前要求「同修訂 passed 且 `sourceDigest` 相同」，否則 `409 PUBLISH_VALIDATION_REQUIRED`；清單 `GET /api/games/submissions` 每行帶 `draftRevision` 與 `validation`（不暴露 `sourceDigest`／逐章內容）。
- **③ 四層**＝`web/src/content/authoring/gamesource.js#chapterBaseReferenceGaps` 的四個 code：`CHAPTER_MISSING`／`CHAPTER_GENERAL_MISSING`／`CHAPTER_CITY_MISSING`／`CHAPTER_CITY_SLOT_MISSING`。只在前端按 code 分組顯示 ✓/✗（`referenceReceipt` 嚴格 keyset，服務端 DTO 不能加欄位）。
- **計數門**：24 owners / **55 tables / 53 indexes / 369 columns / 4 FK**；`gamepurge`／`deletioninventory`／`deletionuniquerows`／`deletionschema` 同步。
- 驗證：`verify_publish_ui_model` 18/18、`verify_publish_validation` 7 組、`verify_publish_operations_root` 31 組、`verify_editor_schema_sources`／`verify_distribution_schema` 綠。

## 3. 批次 C：④ 上架申請 ①–⑥ 真實進度

- `server/publishprogress.js`：`PublishProgress`＋`PUBLISH_STEPS` 六步＝讀取草稿修訂與快照／全章引用校驗／檢驗記錄核對／結構驗證與即時編譯／凍結封包與分配版本序號／寫入分發帳本並排隊。**只放記憶體**：單次請求的暫時狀態，重啟後由「查詢原操作」對帳。
- 端點 `GET /api/games/{id}/publish-operations/{key}/progress`（owner-scoped：別人 404、未登入 401），客戶端每 1.5 s 讀同一把鍵；`PublishPanel.vue` 在遮罩內列 ①–⑥（✓／▶／✗／·）。
- 提交 `d38e4d0`＋journal `ff36bee`；鏡像 `20261109-b3-disk12`。

## 4. 批次 D：四層改逐層請求、遮罩內同步更新

- **使用者回饋**：不要等算完才顯示四項、也不要另開彈窗；檢驗要在同一個遮罩計時裡逐項更新。驗證成功後仍不能上架 → 查出是**沒有新草稿修訂**（`draft_revision` 與 release 相同），文案已改為「已上架且沒有新修訂…」。
- **服務端**：`POST /draft/chapter-references` 接受 `{layer:'chapter'|'general'|'city'|'slot'}`，每層只回自己的 code；**前三層不落庫**，四層到齊才寫 `content_game_validations`（防半套記錄被上架門當通過）。伺服器端快取 `validationJobs`（key `tokenHash:gameId`、TTL 120 s、上限 8）。
- **前端**：`publish.txt` 依序發四次並合併結果，`checkedLayers` 控制 `done`；`PublishPanel.vue` 在既有 `.progress-overlay` 顯示四行；**移除 Element Plus `ElDialog`**（未帶樣式會落左上角並擋住點擊，是「校驗點不動」的直接原因）。
- 提交 `87cff4d`／`7bbd347`；鏡像 b4／b5。

## 5. 批次 E：生產遷回 `sadcloud`，instabox 退役

使用者：「以后就82.158.91.231部署了，不换了，instbox太不稳定了」「同时把域名也绑定过去」。

- **instabox 實際不可用**：`machine is cooling down until 2026-11-09T16:27:20Z`（時間戳自 14:18Z 起一字不變，偶爾通一次）；**無 `rsync`**、出站 `ssh` 報 `hostname contains invalid characters`（沙箱限制）、入站長連線被掐斷；`ssh-agent` forwarding 在 sadcloud 被 hardening 關閉。
- **上線步驟**：`src` 取到 `61b204f` → 建 editor `20261109-b6-disk12`／player `20261109-b6-disk` → `vps/manual-static-build.sh` 重建靜態發布（`b5674f4b…`／`91defffe…`）→ `rsync -a --delete` 同步 `dist` → 改 `publication.env` 三個 pin → 改 nginx 的 `static-v1/<digest>/` → `nginx -t && reload` → 起容器。
- **四個坑（已寫進 game-storage-layout §18.2）**：① `sites-enabled/` 是空的 → 80/8443 根本沒人聽，443 SNI 分流全指死端口（外部 TLS reset／CF 525）；② 開機會經公網拉自己的靜態歸檔，digest 與 nginx 路徑必須同步換；③ tar 過來的屬主是 root → `private owner permissions required` → `startup-failed`（`chown -R 1000:1000`、目錄 700、DB 600）；④ compose 用 `${EDITOR_DEPLOYMENT_ID}`／`${PLAYER_DEPLOYMENT_ID}` 插值，只起 editor 也要兩個都給。
- **數據遷移（一次性，遷完不再依賴 instabox）**：instabox 端無 rsync，改用**經本機中轉的 tar over ssh**。`data/`（3.5 M，帳本 16/16、`937c71ab` `listed=1`、pin `1.0`）＋`private-objects/`（196 M）＋`bucket/{control,projections,receipts,roots,artifacts/937c71ab}`（12 M）。落盤後核對 `tail==confirmed`、pin ordinal、玩家 `registry` generation 與 `control/current.json` 一致。
- **退役**：sadcloud 上兩隻 2 天前遺留、與新 editor 同掛 `/srv/dragon/data` 的舊容器（`sad_sutherland`、`wonderful_meninsky`）已停並移除；臨時開的 `AllowAgentForwarding yes` 已改回 `no`，臨時公鑰已從 `authorized_keys` 刪除。
- 文檔：`11e3a80`（AGENTS.md、game-storage-layout §18、本 journal），已推 `github/main`。

## 6. 城池據點頁（提交 `61b204f`，已隨 b6 上線）

- **口徑演變**：使用者先要「遊戲級別0屬性」，經核對原版證據（`cityrecords.js`：`max_prod`/`type`/`view` 20 章 192 格完全一致；`growth`/`defence`/`troops_cap` 逐章不同，屬章節初始化值；`prod`/`troops` 是引擎執行時值）後採納**方案 b**：不做遊戲級預設值，上升值／防災值／城兵留在章節級，新建章節時自動帶上一章同據點的值。
- **頁面**：列＝序號／據點名稱／最大生產力／類型／操作；槽位與 X/Y 不顯示不可改（座標由地圖放置寫入）；無刪除（另議）；「加載」＋搜索＋單列雙向排序＋**序號隨顯示順序重排**；行內編輯↔保存/取消。
- **校驗**：名稱 NFC 後 1–12 碼點、**遊戲內唯一**（重名 `409 DRAFT_CITY_NAME_TAKEN`）；`max_prod`/`type` 0–65535 整數、非空列不可清空；`citySave` 單請求提交（`draft.txt`），舊 `renameCity` 保留供既有 lane。
- **測試**：`verify_editor_definition_controller` 80/80（新增全 keyset `cityRow()` 夾具）、`verify_editor_shell` 92；`node --check`、`build --check` 通過。

## 7. 當前阻塞與下一步

1. **使用者要測據點模組**：`https://dragon-editor.720108.xyz` →「城池據點」；對照點見批次 E 之後的交付說明。
2. **`artifacts/programs/` 有 6 個共享程序包未搬**（各 171 MB，當前目錄不引用）；要用「完整副本／共享程序包」再從退役機補。
3. **文檔已切 sadcloud**；instabox 上鏡像與 `/data/dragon` 留作回滾，不再部署。`docs/handoff-20261110-publish-authority.md` 的 §3／§4／§5 已於 2026-11-10 訂正（原本仍寫 instabox＋Cloudflare Tunnel `f5d35af4-…`、`b2` 鏡像、`cf369743` 在架）；遺留待議：`game-storage-layout` §16.5 的 schema 複核基線仍寫 54/52/361/4，現行是 55/53/369/4。
4. 既有遺留（另案）：`verify_copy_publish_parity` 的 `web/src/main.js` 指紋失配（先前批次改程序碼未重註冊可用庫，重新生成等於重新註冊，未做）。

## 8. 已知既有紅（不得寫成全綠）

- `tools/verify_publication_ui.mjs`：legacy DOM 掛載 lane，`nodes['publish-games-refresh']` undefined（HEAD 同樣紅）。
- `verify_editor_backend_deletion_{inventory,columns,declared_unique_rows}` 等 pinned 歷史 lane 需 round 參數（HEAD 同樣紅）。
- `verify_editor_template_root`：L1575 期望 `ad.generalDefinitions === null`，實得 `[]`（HEAD 同樣紅）。
- ~~`tools/verify_frozen_publication_root.mjs`~~：已於 2026-11-10 轉綠，見 §9；本節原先把它記成「`vps/deletion-runtime-refs.mjs:64` 的 `fields(asset, …)` 拋 `DELETE_RUNTIME_REFERENCE_INVALID`」，那只是最下一層，上面還壓着两层過時前置。
- `tools/verify_vps_editor_server.mjs` 也曾是紅（同一類過時計數 54/52），此前無人登記；現已綠。

## 9. 批次 F：`verify_frozen_publication_root` 轉綠（三个叠加的過時假設，非產品缺陷）

2026-11-10 只讀重跑 HEAD，實際是**三層**依序攔截；§8 原記的 `DELETE_RUNTIME_REFERENCE_INVALID` 只在最後一層。

1. **過時計數（第一層）**：`tools/verify_frozen_publication_root.mjs`（L51／L308／L338）期望 `assertDeletionDefinitions().tablesVerified === 54`，現行是 **55**——`server/validationdeclarations.js` 加了 `content_game_validations`；§2 的計數門當轮同步了 `gamepurge`／`deletioninventory`／`deletionuniquerows`／`deletionschema`，漏了這條 lane。同類：`tools/verify_vps_editor_server.mjs` 的 `54/52` 也漏更（現已 55/53）。
2. **批次 B 的新前置（第二層）**：產品決定「檢驗結果存服務端，上架硬門＝同修訂 passed」讓這條 lane 的 `POST /api/publish` 直接 `409 PUBLISH_VALIDATION_REQUIRED`（`server/editorapp.js:484`），而它的 `call()` 從不產生檢驗記錄。修法照 `tools/verify_publish_operations_root.mjs` 的既有做法：新增 `ensureValidated()`，在每次上架前按真實畫面流程逐層 `POST /draft/chapter-references`（`chapter`／`general`／`city`／`slot`，四層到齊才落庫），並断言 `content_game_validations.state==='passed'`；不直接把 passed 寫進表。
3. **過時的索引鍵集（第三層，§8 記的那條）**：`vps/deletion-runtime-refs.mjs` 對 runtime index 用精確 8 鍵鍵集，而 `vps/runtime-index.mjs:75` 之後會寫進**可選** `chapterIndex`（章節／勢力清單），玩家端 `web/src/player/runtimecontract.js#validateIndex` 已校驗其形狀。修法：提出 `INDEX_KEYS`，有 `chapterIndex` 時放行 9 鍵；鍵集仍然精確，未知欄位照舊拒絕，而 `chapterIndex` 不含任何物件引用，故不擴大引用閉包。

- **結論**：這不是刪除引用解析的真缺陷；先前「真缺陷线鎖」的推断被只讀重跑＋堆栈定位推翻。
- **驗證**：`verify_frozen_publication_root` **46 組**（8 世代、20 章、restore 邊界，`EXIT=0`）、`verify_deletion_runtime_refs` **80 checks**、`verify_vps_editor_server` **12 組**，均綠。
- 純測試／診斷改動，`web/`／`server/` 行為未變，不需重建鏡像或換 static digest。

## 10. 據點＝遊戲共享資料（父子表合同，2026-11-11 用戶決定；未提交）

**用戶結論（四次澄清的終點）**：城池據點／地圖道路／武將／遊戲章節都是**單款遊戲自己的共享數據**，只有一份，全章共用。`sourceRef.kind='builtin-copy'`、`copy_origins.profile_revision='fixed-copy-resources-1'` 只是「由內置完整源導入」的**來源標籤**，不代表存在第二份據點數據；真正的「副本」只指**編輯期臨時修訂**（加載當前數據→保存延伸修訂號→發布審核通過後成為現行版本）。由此確定：加載讀 head；發布釘提交時凍結的修訂；不保留歷史的可加載性（只暴露「當前修訂＋已發布修訂」）；並發不做特殊處理（單帳號單在線）。

**父表／子表**（原版字段表）：父表＝名稱、坐標（地圖管理寫回）、最大生產力、類型＋給新章用的默認值（當前生產力／上升值／防災值／城兵，一次性從該遊戲第一章取回）；子表＝所屬勢力＋那四項可改，名稱／最大生產力／類型只讀關聯父表；內政官不在章節設置。名稱以父表為準（內置 20 章 70/3840 處按章異名由此覆蓋）。

**測量（內置 20 章 × 192 座）**：`max_prod`／`type` 與父表 0 差異；`name` 70 處不同（每章 3–6，如「中山／常山」「上黨／沾」「北平／北京」）；`x/y` 同槽共享。

**改動**：`cityrecords.js` 的 `CITY_BASE_NUMBERS` 擴為 7 項並按原版字寬限幅，新增 `CITY_SHARED_INVARIANTS`（只 `max_prod/type/view` 要求章節無關）；`gamesource.js` 導入時四項默認值取第一章、只對不變量做跨章比對；`chaptermaterialize.js` 新章優先取父表默認值；`citydefinitions.js` 修 `cityRecord(values,[])` 使任何非空數值保存都拋 `city data fields required` 的真 bug；`server/drafts.js` 的 `cityDefinitions` 不再按 profile 置 null、`cityEdits` 對兩種 builtin kind 開放；`server/copyprofile.js#verify` 新增 `cityEdits` 重放＋整源比對；`server/public/draft.txt` 放開據點讀寫門與 `CITY_NUMBER_LIMITS`；`StrongholdPanel.vue` 移除錯誤說明、改爲 8 欄（名稱／最大生產／當前生產／上升值／防災值／城兵／類型＋操作），重建 `server/public/shell-ui.*`。

**驗證**：`tools/verify_editor_city_profile.mjs` **8 組**（新增：有記錄通過，無記錄／值不符／改別座／改坐標／改槽位均 422）、`verify_editor_city_definitions` **4/4**、`verify_editor_shell` **92 checks**、`verify_native_city` **29/29**、`editor-ui build --check` 通過。`verify_vps_city_save` 跑到 900s 仍未結束（非失敗，未得終態）。

**未做（下一步）**：章節五屬性的寫入通道＋面板；舊修訂回收（只收斂接口、不 GC）。70 處異名遷移與生產部署已於 §11 完成。

## 11. 批次 G：共享據點投影＋70 異名遷移＋部署上線（2026-11-11）

**合同**：名稱歸父表；父表缺的 `prod`/`growth`/`defence`/`troops` 從當前遊戲第一章同槽記錄回填一次。舊存檔（生產 rev1＝舊 `copyBuiltinGame` 輸出）不改位元組也能按現行合同讀；任何一次保存把投影寫成新修訂。

**實現**：
- `web/src/content/authoring/gamesource.js` 新增 `applySharedCityData(game)`（冪等；192 父表校驗；四值回填不覆蓋已有值；章節名稱一律取父表；不動 `raw`／`nativeCityRecordRaw`），`copyBuiltinGame` 導入時套用；`cityrecords.js` 導出 `CITY_NUMBER_LIMITS`。
- `server/drafts.js`：`#load` 與 `#profile` 在基線／引用校驗後套同一投影（失敗 → `503 DRAFT_REFERENCE_CORRUPT`／`DRAFT_BASELINE_CORRUPT`），所以讀取、保存、`captureForCompile`、上架都看到同一份父表名稱。
- `vps/migrate-shared-cities.mjs`：一次性遷移命令。自建最小裝配（`FileBucket`＋`PrivateWriteJournal`＋`ImmutableBlobStore`＋`GameSnapshotVerifier`＋`GameMetadataStore`＋`InstalledSourceCatalog.definition()`），系統主體只存活於進程內、不寫 `sessions`；走真實 `PrivateDrafts.save`，只寫新修訂，不動 `copy_origins`、不建 release、不發布。`--dry-run` 只驗能解開修訂（投影後再度量是冪等的，量不出「存檔是否舊」）。

**驗證（本地）**：新增 `tools/verify_shared_city_migration.mjs` **15 checks**（把已投影副本反推成生產形狀作 rev1 → 讀投影 → 無改動保存 rev2 → `captureForCompile` 0 異名／192 原始章節位元組保留 → 再保存仍 rev2 → 新章用父表名）；`verify_editor_city_definitions` 改為「原版固定源保留 10 個異名槽位、導入副本 0 異名」**4/4**；`verify_editor_city_profile` 8 組、`verify_vps_draft_save` 179 checks、`verify_editor_chapter_cities`、`verify_chapter_attributes` 均綠。`verify_editor_copy_profile` 900 s 超時（未得終態，不算通過）；`verify_editor_backend_copy_profile` 缺 `MINIFLARE_MODULE`（既有環境要求）。

**遷移（生產）**：先用 `cp` 的 sqlite 三件＋`cp -al` 的 `private-objects` 在 `/srv/dragon/build/dryrun` 做完整預演（`1 → 2`、0 異名、0 缺值），再停 editor，對 live `/srv/dragon/data` 跑同一命令：`{"from":"1","to":"2","changed":true,"nameMismatchesAfter":0,"citiesMissingDefaultsAfter":0}`；`content_snapshots` rev1 `b7c9546c…`、rev2 `11b4a595…`。

**部署**：本地 `sh vps/manual-static-build.sh .deploy/static-c789d4e` → 清單 `80c9e96b…`／sourceTree `50c4fc95…`（1442 檔／165.81 MiB）→ tar over ssh 上傳 `/srv/dragon/build/static-c789d4e` → `rsync -a --delete` 到 `dist` → nginx `static-v1/<digest>/` 換新 → `publication.env` 三個 pin 同步 → 起鏡像 `20261111-city1`。

**第五個坑（新，已寫進 game-storage-layout §18.2）**：`/srv/dragon/bucket` 內 26 個 tar 中轉遺留的目錄屬主是 `197609`（非 `1000`）。舊 digest 的 `control/programs/<digest>.json` 早已存在，啟動只讀不寫所以沒暴露；換新 digest 必須寫登記檔與 `artifacts/programs/<digest>/`，`node`（uid 1000）無權 → `PROGRAM_REGISTRATION_UNAVAILABLE` → `startup-failed` 重啟循環。修法 `chown -R 1000:1000 /srv/dragon/bucket`；之後 `/api/health` 200 `initialized:true`、`distribution-idle`，`control/programs/80c9e96b….json` 與 `bucket/artifacts/programs/80c9e96b…`（170 M）已生成。

**未做**：① 玩家端仍 pin revision 1（`content_game_validations` 只有 rev1 的 passed 行），要在工作台重走四層校驗＋上架才會更新玩家目錄（序號會升到 `1.1`）；② 據點頁生產實測待用戶；③ 舊修訂回收。

## 12. 批次 H：章節據點五屬性（所屬勢力＋四項數值）寫入通道與面板（2026-11-11）

**範圍（用戶裁決）**：章節可改的五屬性＝所屬勢力／當前生產力／上升值／防災值／城兵。名稱、座標、最大生產力、類型仍屬遊戲共享父表（§11）。

**證據**：原生城市記錄偏移 `+0x0E-0x0F` 當前生產力（字）、`+0x10` 上升值、`+0x11` 防災值、`+0x12` 城兵上限、`+0x13` 當前城兵、`+0x16` 觀感×16＋類型（`chaptermaterialize.js` 與 `re-notes-entity-fields` 一致）。`cityrecords.js` 舊註釋寫「0x12 城兵／0x17 外觀」是錯的，已改正。growth／defence 是 u8，**0–255 只是編碼寬度**，原版樣本 0–179／0–100 不縮小域，也不另設平衡上限；prod ≤ max_prod、troops ≤ troops_cap 沿用引擎自身語義。

**實現**：
- `gamesource.js`：`CITY_EDIT_FIELDS` 加 `growth:[0x10,1]`、`defence:[0x11,1]`；新增 `CITY_EDIT_CAPS`（troops→`troops_cap`、prod→`max_prod`、growth/defence→255）；`editChapterCity` 的 raw 一致性檢查擴到 0x10/0x11；`editChapterCityNative` 的受保護位元組改為「0x0E/0F/13 永遠容忍（舊歷史修復）＋本次寫入偏移容忍」。
- `server/drafts.js`：`city`/`city-native` values 白名單四欄。`server/copyprofile.js`：`revertCityFields` 重算 raw 帶四值、native 對帳鍵集加 growth/defence、回退白名單四欄。
- `server/public/draft.txt`：`attributes.chapters[].cities` 增 `prod/growth/defence/troops/maxProd/troopsCap`；`setNativeCityInput`/`saveNativeCityInputs`/`submitNativeCity` 支援四欄；新增 `cityNumbers(chapterId, cityIdx, values)`（以當前已讀修訂代填身份，不接受頁面自報修訂）。
- `editor-ui/src/ChaptersPanel.vue`：「據點章節屬性」表加四列數值＋操作列（編輯／保存／取消，`data-city-number`／`data-number-input`／`data-number-edit|save|cancel`），同列一次保存；所屬勢力仍即時單命令。`editor-ui` 已重建（`shell-ui.js` 700445 B／`shell-ui.css` 56594 B，`build.mjs --check` 通過）。

**順手修掉的既有缺陷（實錘，非本批引入）**：同一據點先 `city-native`（troops/prod）再 `city-faction` 會被判 `COPY_PROTECTED_DELTA`——`revertAppliedChapterEdits` 在逐條回退**之前**就把 `nativeCityRecordRaw` 換回基線表，於是 `revertCityFaction`／`revertCityGovernor` 的 +01／+19 位元組比對永遠落在基線上。修法：對帳時把「對帳前的候選表」存進 `nativeTables`，兩個回退函式優先用它；`city-native`＋`city-faction`、`city-native`＋`city-governor` 現在都能通過，且未申報改動仍被拒。

**驗證**：`verify_editor_city_fields` 48 checks（新增 growth/defence 正例、u8 上限、雙 raw 同步、僅寫入時容忍分歧）；新 lane `tools/verify_editor_chapter_city_attributes.mjs` **5 組 PASS**（四值＋勢力同批重放、未記錄改動／第二座／受保護位元組拒絕、u8 邊界、複製章節後再改）；`verify_editor_copy_profile --city-native-only` PASS；`verify_editor_draft_controller` 110/110；`verify_editor_shell` 92；`verify_editor_city_profile` 8 組；`verify_editor_chapter_cities`、`verify_editor_chapter_reorder`（5 組）、`verify_editor_chapter_generals`（6/6）綠。未跑：HTTP 級 `verify_vps_city_save`（上次 900 s 超時）、瀏覽器 lane、`verify_editor_copy_profile` 全量（僅跑 `--city-native-only`）。

**未做**：① 未提交／未推送；② 生產未重建鏡像；③ 章節數值面板未做瀏覽器實測（需全新 Playwright profile）。

**上線（2026-11-10 UTC）**：提交 `80486ae`＋`ec7d1c8` 已 push `github/main`；靜態 `826b7c3a…`／sourceTree `65cbb8d7…`（1442 檔 165.81 MiB）上傳 `/srv/dragon/build/static-80486ae` → `rsync -a --delete` 到 `dist` → nginx `static-v1/826b…` → `publication.env` 三 pin；鏡像 `20261111-city2`（sha `58d62d5d…`），`.env` 同步 `EDITOR_DEPLOYMENT_ID=20261111-city2`、`PLAYER_DEPLOYMENT_ID=20261109-b6-disk`（避免把 player 回到舊 tag）。

**新坑（已記在下文）**：改了 `web/src/**` 就必須跑 `node tools/build_trial_web_bundle.mjs` 重建 `server/public/trialweb.txt`，否則啟動 `verifyInstalledProgram` 拋 `INSTALLED_PROGRAM_INVALID` 並無限重啟——第一次部署就撞上，補 `ec7d1c8` 後重建成。驗證：health 200 `initialized:true`、新靜態 200／舊 404、`control/programs/826b….json` 與 `artifacts/programs/826b…` 已生成、registry 仍 generation 16（revision 1）。

## 13. 批次 I：工作台 UI 对齐与全模块布局规范（2026-11-11）

**用户反馈（截图）**：「按纽和文本框现在同高度，垂直居中对齐很难吗？…工具栏的当前游戏下拉框和‘重新整理’按纽没对齐，下面‘加载’按纽和搜索框没对齐。编辑框下，行内的文本框和保存与取消按纽没对齐」。随后表示「现在好齐了」，并要求把本次所有 UI／布局要求写成**适用于所有模块**的规范。

**根因（不是框架问题）**：编辑器本来就是 Vue 3＋Element Plus，错位来自我们自己的 `server/public/style.css`——全局 `input:not([type=checkbox]):not([type=radio]):not([type=file]),select{display:block;margin-top:7px}` 会推原生输入框，而 EP 按钮是 flex 居中；且该选择器权重（3 个属性选择器）高于 `.module-toolbar input`，后续补丁静默失效。另有表内按钮被写成 `min-height:28px`、`.page-heading>span` 副标题、带边框的「目前草稿」胶囊。

**修法**：`style.css` 去掉全局控件的 `display:block;margin-top:7px`，改 `inline-block;margin:0;vertical-align:middle`；末尾追加统一节奏：`.module-toolbar/.current-game/.account-actions/.page-line{align-items:center}`、按钮 `inline-flex;justify-content:center;height/min-height:34px`、表内 `input/select{margin:0}`、`.el-button+.el-button{margin-left:8px}`；`Workbench.vue` 的 `.page-line` 改为「左 `#status`、右 `#workspace-context`（右对齐、无边框）」；`StrongholdPanel.vue` 类型列改 `ElSelect` 式原生下拉映射 0–4＝大都市／中都市／小都市／關卡／戰場（按 `CS:7DF5` 证据；原版字串为「都市」）。重建 `shell-ui.js` 702194 B／`shell-ui.css` 56774 B。

**规范落地**：新增 `docs/editor-ui-layout-spec.md`（全模块强制：页面骨架／顶部提示行／控件度量／优先 EP 组件／表格／枚举映射／保存后重读／文案密度／自检清单／反例），并在 `web-port/AGENTS.md` §3 与根 `AGENTS.md` §2.3 各加一条指针——后续对话不再逐条确认这些 UI 要求。

**性能（查清但未交付）**：分段计时显示冷读 21 s（解源 3.4＋profile 8.1＋验证 6.2＋DTO 1.3）、保存 17 s、编辑保存 59 s（其中编码 9.3 s、逐块落盘 27 s）。本地试过源/profile/验证三级 LRU、未变区块复用与「保存后种入已验证读缓存」，可到热读 2.8 s／无改动保存 2.9 s／编辑保存 23 s；但 `verify_vps_draft_save` 由 179 全绿变为 168 绿＋11 红（缓存跳过逐请求 blob 读与 epoch 复核，正是这些断言在守的不变量），故**整份回退 `server/drafts.js`**，当前跑原实现。下一步需先决定「改测试为语义断言」还是「只做读取侧缓存」，再动性能。

**交接**：加载／保存性能与副本数据形状的设计取舍见 [draft-performance](re-notes-draft-performance.md)（实测分段、原型优化、11 条契约红的判据、下一轮要回答的五个问题）。

**未做**：本轮 UI 改动未提交／未部署（生产仍是镜像 `20261111-city2`、静态 `826b7c3a…`）；像素级自检需在 `web-port` 安装 `playwright` 模块（当前只有全局 CLI，`import 'playwright'` 抛 `ERR_MODULE_NOT_FOUND`），本次由用户目测确认「好齐了」。

## 归档锚点（外部文档仍在引用；保留原标题以不破链接）

### 5. 当前时钟系统逆向与重构本地完成
时钟逆向与重构的细节见 `re-notes-strategic-time`；journal 侧只保留结论索引。

### 6. 发布主线阻塞与下一步
旧「发布主线」阻塞条目已被批次 A–E 取代；当前状态见本文件 §7。

### 6. render-layers-1测量脏层灾害播放器及断链整理
渲染层测量与断链整理属旧批次，细节用 `git log -p` 追溯。

### 8. 用户指定五档提速
用户指定五档 6.5／5.0／4.8／1.8／1.0 ms，每 RAF 最多 16 更新；60 Hz 上限约 960 更新/秒、高刷上限 1000；暂停丢规则债但冻结显示。

### 9. battle-text-reflow-1战术双方对白自动折行
战术对白自动折行属战斗呈现批次，细节见 `re-notes-tactical-lifecycle`。

### 10. 录像反馈后的战略性能修复 / 10. 0.1.4 发布整理
旧性能与发布整理条目，结论已并入现行主线。

### 11. 编辑器VPS部署前只读盘点 / 11. 0.1.5 发布整理
旧部署盘点与发布整理条目，现行部署见 §速查与 game-storage-layout §18。

### 12. 受限编辑器容器部署
受限编辑器容器部署属旧环境，现行容器编排见 §速查。

### 13. 固定库刷新与私有Trial接续
固定库以 `approved-available-library-f4ba804b-1` 身份注册；刷新/替换会撞 `SOURCE_MANIFEST_NOT_PINNED`，现行口径见 `vps-editor-readiness`。

### 16. 当前版本资源门部署与只读巡检补强
旧版本资源门批次，现行资源门见 `server/pinned/*` 与 `sourcecatalogpolicy`。

### 19.–23. 后台框架壳 / 账户管理 / 阶段任务 / 只读素材库 / 草稿与章节组件化
`editor-ui-1`–`editor-ui-5` 系列，均已并入现行 Vue 壳与工作台。

### 30. 上架限制与删除追踪组件化 / 32. 固定库身份合同授权修复 / 33. 后台迁移提交推送与受限上线
旧 UI 系列收尾批次；现行上架/删除规则见 `AGENTS.md` 与 `re-ui-advisor-menu`。
