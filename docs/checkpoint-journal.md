# 檢查點日誌

長期事實、架構、命令與約定見 [AGENTS.md](../AGENTS.md)（Web）與[全局约定](../../AGENTS.md)。本頁只记会话进展、失败教训、阻塞与下一步；结论先查 AGENTS.md，不把本页当授权或原证。

## 当前主线状态（2026-11-26）

- 小地图显示已闭环：终态 `minimap-style-7-high-coast`（DOS 质感：哈希杂点／绿河／4px 海岸投影／drawMini 关平滑保 1px）；`trialweb.txt` 已重建。`81b36c5`、`6a28cf3` 已推 `github/main`。用户包已上架 1.5。
- 副本地理回填完成：副本 8c05e6a0 `base.geography` 全海→inferred-sea-edge-connected 回填（digest `de05…`，备份在系统 Temp 可回滚；sea-ground policy 同步移除）。
- 游戏列表行高：通用 `openListDialog` 一处改全覆盖（表头 30／行 20＋4px 间隙，pitch 命中；菜单式自适应列表除外），已推 `6a28cf3`。
- 待查（旧项，均不阻塞主线）：外交／预算同批连续事件验证；攻城伤亡内置与发布路径全程对照。

## 失败教训（已纠正，保留结论）

- stale-child 误判：曾把用户旧画面归因子进程旧码，实锤为用户旧会话抱着 1.0 包＋地理数据分层（图块 12% 海 vs 地理 100% 海；下采样海应 13.3% 实际包底图 59.8%；markers 走剧本故三城标记一直对）。
- 底图移位误读：用户要的是投影下沉不是底图移位，DISP_* 已全数回退（mappanellayout/gamebar 回 HEAD 无差异）。
- seed 校验刻舟：style-3「seed 不影响输出」断言随 style-5 改为「同 seed 确定、异 seed 杂点不同、掩码一致」；中间态 style-3／style-4／style-6 已被终态取代不再单独追溯，style-4 河蓝已回退（内置同步恢复绿河）。

## 历史定位与相容锚点

§195–231 见 `git show 22b287b:docs/checkpoint-journal.md`（建城流程 §229、战场接线 §230、当时推送收据 §231）。较早批次见[§73–194 归档](checkpoint-journal-archive-73-194.md)、[早期归档](checkpoint-journal-archive-through-72.md)、[收据缺口](historical-receipts.md)。以下锚点供旧連結转接；使用历史收据时按批次查閱不作当前授权。

<a id="184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push"></a><a id="186-d2-event-64p0p1隔离审计与一次性决策包未实施未push"></a>
§184–187：[事件调度归档](checkpoint-journal-archive-73-194.md)。

<a id="79-sea-ground-1全幅海域基底与地面轮廓"></a><a id="80-atomic-catalog-1单格素材库与单层分类"></a><a id="81-atomic-preview-2分类更正植被核对与32px预览"></a><a id="82-atomic-spring-neutral-3固定春季与中立据点素材"></a><a id="84-map-space-4地图优先布局与对象右键菜单"></a><a id="85-map-space-5紧凑布局与原始比例"></a><a id="87-map-pan-lock-1地图拖动锁定切换"></a><a id="88-city-group-1四套配方与放置接缝待确认"></a><a id="89-city-group-preview-1据点组只读素材展示"></a>
§79–89：地面、素材與工作台历史；[现行地圖合同](map-atomic-catalog-contract.md)。

<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a><a id="49-共享头像文件及资产id数字重编号"></a>
[§37 預設主題決策](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)；[§49 頭像身份決策](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。

<a id="10-014发布整理"></a><a id="11-015发布整理"></a><a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a><a id="5-当前时钟系统逆向与重构本地完成"></a><a id="6-发布主线阻塞与下一步"></a><a id="8-用户指定五档提速"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-录像反馈后的战略性能修复"></a><a id="11-编辑器vps部署前只读盘点"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a><a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a>
§5–33：時鐘、表現、早期部署與 Vue 工作台見[旧收据索引](checkpoint-journal-archive-through-72.md)。

## 本轮整理（2026-11-26 只读瘦身未改代码）

- 沉淀到 AGENTS.md（Web＋父 2.3）：终态 style-7、1.5 主线、地理分层坑＋回填工具、supervisor 不补 fork、Canvas 列表行高。
- 删：MINIMAP-FLAT 英文旧节及 16:40 correction；PLAYER-LOCAL 过时交付边界、旧下一步及四行旧问题定位表（已解决旧会话细节，原文查 git show 6a28cf3）；style-3／4／6＋底图间距四个中间态详节；全部 stale 未提交标记。

## 所屬州郡字段（2026-11-24 用户需求，未提交未推送）

- 基础据点＋城池据点共用可选 `region`：默认空白可空最多 5 字，列表在据点名称后加「所屬州郡」列，新建／编辑／校验／保存两端同口径；建游戏整份复制系统基快照自动带州郡，无需改复制逻辑。合同见 `docs/editor-city-definitions.md`「所屬州郡」节。
- 改动：`cityrecords.js`（`cityRegion`＋`captureCityDefinitions` 准入）、`citysource.js`（准入＋剔除编译必填门）、`server/gamecopy.js`（新建／`region` 补丁）、`server/systembasemapstore.js`（`region` 补丁）、`server/systembasemap.js`（形状校验）、`draft.txt`（城池保存／新建）、`basecities.js`（基础保存）、两面板＋`StrongholdCreate.vue`＋列宽；构建产物 `shell-ui.*`／`trialweb.txt` 重建。
- 验证：`verify_copy_controller_cities` 14/14（含新增州郡回归）、`verify_base_cities` 7/7、`verify_city_source_conversion` 6/6（中途发现 region 误入编译必填门已修）、`verify_chapter_city_compile` 14/14、controller modules/posts 17/17、`verify_copy_api_bodies` 1/1、build＋check 字节一致。Vue LSP／浏览器冒烟未跑。
- 州郡後續（2026-11-24）：城池讀投影 `checkedCopyCities` 漏帶 `region` 致重讀空白已修（行恒帶 `region` 預設空白）；城池表改與基礎表同版式（無固定寬、100% 自適應、表頭 nowrap），刪 `strongholdcolumns.js`；兩表序號 50px、攻城戰場去排序；最大／當前生產、上升、防災、城兵上限、據點圖片六列去排序並收窄最小寬（96–112）消橫滾。
- 州郡版式（2026-11-24）：兩表序號 60px、攻城戰場固定 180px，戰場格改圖左文右兩行（首行戰場名、次行 siege:N 去括號，`siegeParts`），縮略圖保持 96×51。

## 據點圖片自管庫（2026-11-24 用户需求，未提交未推送）

- 新 Web 产品决定（用户批准，取代 2026-10-31 唯讀）：遊戲資源新增「據點圖片」可管分類（kyo 凍結圖＋自管上傳圖），管理員可新增／替換／刪除；其餘分類仍只讀。
- 用户拍板：寬統一壓 192（高度等比、最近鄰）、僅 PNG、單張 ≤400K、view 遞增（優先複用刪除空洞，超 255 拒）、被刪圖引用處顯示為空、僅影響新發布（歷史版本不动）。
- 實現：`server/citypicturestore.js`（SQLite `city_pictures`＋`bindCityPictureStorage`／`hasCityPictureView` 准入）；`editorapp.js`（GET 清單／POST 三動作管理員門／網關內建直出＋DO 匿名出自管位元組／`#getResources` 新類＋kyo 歸類＋IHDR 寬高）；`gamecopy.js`／`systembasemapstore.js`（view 門改 store-aware）；`trials.js`（`cityViewGaps` 加 extraKnown 參數，試玩沿用凍結集）；`playpacks.js`（門＋`collectCustomCityPictureEntries`＋manifest.cityPictures＋pack_assets＋serve）；玩家端 `assets.js`（world 綁定＋回落 grf）→ `gamebar.js`／`hud.js` → `playerenvironment.js`／`playerpack.js`（manifest 驗證）。
- 前端：`catalog.txt`（新類＋url 雙形驗收＋canManage＋三動作＋文案）；`CatalogPanel.vue`（頭像款相冊＋新增／編輯對話窗拖放＋刪除二次確認＋全 TAB 去數量）；`CityPicture.vue`（自取清單合併內建＋未知 view 顯示為空）。
- 驗證：`verify_city_pictures` 8/8（store／catalog 控制器／HTTP 全鏈路＋發包凍結純函數）；`verify_copy_city_admit`＋`verify_base_cities` 13/13；`verify_idor_matrix` 通過；editor-ui build＋check 一致；trialweb 重建；LSP 37 SFC 零診斷。
- 预存破缺（非本次，均在改前即破）：`verify_editor_catalog_controller`（用舊 installLibraryRegistration 簽名）、`verify_editor_trial_asset_gate`／sentinel（需 round 參數＋預置 fixture）、`verify_editor_shell#accounts-vue-owned`（四文件皆未動）、`verify_copy_city_create`（並行城兵上限分支把 troops_cap／battleMapId 改必填，測試未跟進；已證 view 門本身正確）。
- 待验收：8443 真機相冊＋上傳對話窗（Playwright 未裝，本機未跑瀏覽器）；帶自管圖的正式發布端到端；commit／push 待授權。

## 據點圖片相冊版式調整（2026-11-24 用户看圖後三點，未提交）

- 新增按鈕獨立一行（移出 grid 相冊容器，圖片從下一行起排）。
- 卡片圖下只放遊戲中編號（view），去「據點圖片」字樣與尺寸字樣。
- 圖片按原尺寸展示（覆寫全域 64px 縮圖，`width/height: auto`）。
- 驗證：editor-ui build＋check 一致；LSP 本兩文件零診斷（ChaptersPanel 的 notifyError hint 是別人的文件，未動）。

## 據點圖片相冊小圖修復（2026-11-24 用户看圖：不是 192 嫌小，未提交）

- 根因：全域 `.resource-card .thumb`（64px，兩 class 優先級）＋卡片三欄 grid（2.6em／64px／1fr）壓住自管圖；單 class 覆寫輸掉。
- 修：相冊卡加 `city-picture-card` 改縱向 flex 居中；`img.city-picture-thumb` 三 class＋元素級覆寫回原尺寸（`width/height: auto`＋pixelated）。
- 驗證：editor-ui build＋check 一致。

## 據點圖片序號浮標（2026-11-24 用户看圖：序號放圖片左上角未提交）

- 卡片改圖框相對定位＋黑色半透明序號浮標（左上 4px）；圖下只留管理員編輯／刪除（非管理員無圖下文字）。
- 驗證：editor-ui build＋check 一致。

## 據點圖片載入體驗（2026-11-24 用户：開啟慢＋載入中難看未提交）

- 慢因：相冊 15 張逐張走圖書館鑑權讀取；幾秒首刷正常，1 小時內重進讀瀏覽器緩存秒開。
- 修：kyo 相冊直連 `/city-picture`（與圖書館同位元組已核 sha，immutable 年緩存）；自管圖掛 `?sha=`（命中 immutable／未命中 no-store／壞 sha 拒收）；`img` 帶寬高原尺寸灰底占位＋左上浮標先出，載入不跳版。
- 驗證：`verify_city_pictures` 8/8（含 sha 緩存三態）；editor-ui build＋check 一致。

## 城市資訊卡所屬州郡顯示（2026-11-24 用户需求未提交）

- 遊戲側點擊據點資訊板：都市類型同行右方不變，下一行（君主同行）右對齊加淺青 `#9fe3ff` 州郡名；空不畫。
- 數據鏈：`admitChapterCity` 入表自帶 `definition.region ?? ''`；`attachCityRegions(states, cities)`（gamesource 新純函數）發包時回填舊章同槽行，定義為準、未知槽不動；`playpacks.prepare` 逐章調用；`createNewGameScenario` 整 clone 透傳；`gamebar._drawCityCard` 繪製。
- 驗證：`verify_city_region_card` 2/2（admit 入表／回填冪等）；`verify_city_pictures` 8/8（發包改動回歸）；trialweb 重建（supervisor 側已同步）；git diff 無空白錯誤。

## 扩图两连修（2026-11-24 用户报障未提交）：宣战打敌城掐表＋8A3F 攻城漆崩

- 故障 1：grid 入口把敌城目的地当拒收（`friendly destination`），宣战下令即掐表。
  修：入口只拦非法节点；敌城直达放行，由到场／过境 E8 管线接敌（中立／开战→攻城接触，未宣战 ai 侧原样拒收一步不动，E7 旧回归锁死）。
- 故障 2：`paint8A1E` 原版 `(y-2)*384+bx` 步长在扩图上越界／错格（y>255 直接掐；命中范围内读错格静默 corrupt）。
  修：原图字节游走一字不动；扩图走 tile 空间等价角点（都城 ±2／关隘正交／余 ±1），越界角跳过；接缝 `paintExpandedCityTile` 导出可测。
- 驗證：`verify_grid_march_hostile` 2/2（新）、`verify_map_extent_march` 2/2（含 E8 前件拒收）、`verify_city_capture_expanded` 3/3（新，y>255／角等价／越界）、trialweb 重建。
- 待用户 8443 实测：重打一次宣战攻城（march→接触→攻城→占领不断表）；另：战斗动画落点若仍在家城，拿存档复现再查（与本次两修无关，需另立）。

## 扩图攻城漆 fail-closed 诊断增强（2026-11-24 用户 8A3F 仍报未提交）

- 现象：扩图分支已上线（用户控制台出现 paintExpandedCityTile 帧），仍停在 8A3F。
- 动作：拆分 fail-closed（原生内存缺失 vs 城出界分开报文），出界错带出 idx/x/y/bounds。
- 原图 A-MAP-2 回归全绿；扩图新回归 3/3；trialweb 重建。
- 待用户复现贴新报文（含坐标即定是地形装配还是脏城市）。

## 扩图攻城漆改跳过（2026-11-24 用户复现坐标定位：无原生内存未提交）

- 实锤：扩图世界根本没有 D44 原生地形内存（E6 路网替换道路平面；grid restore 明确不带原生内存；grid fresh 提前返回不建原生装配）。`scenarioNativeRoadContext(sc)?.terrain` 恒为 null。
- 修：paint8A1E 扩图分支无原生内存时直接跳过（地面渲染走图集，用户地图一直正常即证；规则／边框照常）。若未来绑定了原生内存自动恢复绘制（paintExpandedCityTile 保留＋单测）。
- 驗證：A-MAP-2 原图回归全绿；扩图 3/3；trialweb 重建。
- 待用户 8443 supervisor 重启后重打宣战攻城（march→接触→攻城→占领不断表）；若战斗动画仍落在家城另立 bug（与本次掐表无关）。

## Canvas willReadFrequently（2026-11-24 用户报控制台警告未提交）

- `worldresources.js` 季节图集混合（`getImageData`×2＋`putImageData`）的离屏 canvas 加 `{ willReadFrequently: true }`；纯性能提示修，无行为变化。
- trialweb 重建。

## Grid 持续接触无声（2026-11-24 用户：静态有声/play 无声未提交）

- 根因：grid 路从不经过原生 wait() 轮询，接触只建倒数、无声直接等决战；且首触即决（倒数旁路）时闪光只亮一帧、渲染插值还没起步，看着像落在老家。
- 修：`resolveGridMarchContact` 攻城／野战两支，沿用“首触静默、等待中重复发声”（与 wait 同语义，决战入场不响）；`resolveGridMarchContact` 导出单测接缝。
- 驗證：新 `verify_grid_march_sound` 2/2（首触静默＋重复发声×攻城野战）；E7 行军 2/2；presentation 既有；trialweb 重建。
- 待用户 8443 实测：持续接触（围城多日／野战互啃）应有声＋小地图闪光落目标，首触仍静默符合原设计。

## 扩图直达攻城改到场接触（2026-11-24 用户：战斗应在目标门口未提交）

- 用户对（以静态内置版为准）：直达敌城先行军、到门口再接敌；之前出发即接（标落老家）是偏差。
- 修：`advanceGridMarch` 终点==命令目标时跳过行前接触检查，行军照走；到场 `terminates` 敌城（含宣战他势力，原中立分支一并收敛）抛接触进 E8。过境敌城仍即时接触（E7 锁定）；未宣战 ai 侧拒收不变。
- 驗證：`verify_grid_march_hostile` 2/2、`verify_grid_march_sound` 2/2、E7 行军 2/2；trialweb 重建。
- 待用户实测：陈留打濮阳应在濮阳门口闪光＋响声＋攻城。

## 扩图战斗链用户验收（2026-11-24 用户确认正常未提交）

- 宣战攻城全链打通：行军→门口接触（闪光＋声效）→攻城→占领不断表；用户实机确认正常。
- 本轮改动均未提交：据点图片自管库、州郡卡显示、grid 行军三修（入口／发声／到场接触）、8A3F 扩图漆跳过＋诊断、willReadFrequently；预存破缺（catalog 旧测试／trial 门需参／shell 旧断言／copy_create 并行分支）与本次无关。

## 提交推送 46cf530（2026-11-24 用户授权一并提交＋推送到 github/main）

- 范围：35 改＋1 删＋6 新增（据点图片自管库／州郡卡／grid 三修／8A3F／声效／region＋城兵上限收尾／回归／journal），无密钥、无本地产物（.dragon-analysis／dist／node_modules 均未入）。
- 审过别会话改动（region 补完＋troopcap／battlefield plumbing）一并入同一提交；工作区干净。
- 推送：4e9bedf..46cf530 main -> main（github）。
