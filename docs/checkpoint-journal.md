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

## 小地图窗口垂直居中（2026-11-24 用户：上贴顶下空块未提交）

- `mappanellayout.js`：内容（图＋1px＋20px双横幅）在框内垂直居中（取整余量对半），横向本来就居中；transform／横幅／命中全跟 mapBox 走，无需另改。
- 驗證：`verify_map_panel_layout` 通过（横幅不超框断言仍成立）；trialweb 重建。

## 游戏内读档黑屏（2026-11-24 用户报未提交）

- 根因：trial 持久局无标题菜单，`returnToTitle` 尾部直调 `startMenu.show` 空指针；读档弹窗只有注释没实现。
- 修：`returnToTitle` 无 startMenu 时先确认本局有档（无档留局内提示不动），拆旧局后直弹本局 LOAD DATA（行结构与 SAVE 共用建造器，存档按游戏隔离只读 app.saves）；未使用槽不可选；回标题后取消ֱ禁用（无处可退）；读失败重弹列表；非持久试玩走原事件回选单。
- 镜像触点：开关轮询 hover 点击右键取消绘制重置栏共 11 处；存档行映射抽共用（存档行为不变）。
- 驗證：语法＋trialweb 重建；无浏览器覆盖，待用户 8443 实测（系统选单→存檔讀取→确认→列表→进局）。

## 游戏内读档黑屏＋空档提示＋存档失败无日志（2026-11-24 用户报未提交）

- 根因1：trial 持久局无标题菜单，returnToTitle 直调空 startMenu.show 黑屏；读档弹窗只有注释。
  修：读档直弹本局 LOAD DATA（行与 SAVE 共用建造器，app.saves 按游戏隔离不混档）；
  有档→拆旧局→选档进局；无档→空窗盖在当局上（右键关回游戏，不拆局）；
  回标题后取消禁用、读失败重弹；settingsClick(5) 与确认链共用。
- 根因2：存档失败吞异常（控制台干净）。修：catch 加 console.error('[wolong] local save failed')。
- 附带修：一次拼错把 load 头拼丢（SAVE 里同时开双窗＋load 未定义），已恢复原样并全量复核。
- 驗證：语法＋trialweb 重建；无浏览器覆盖，待用户实测三条（有档读档进局／无档空窗可关／存档失败贴 console 红字）。

## 存档点击报 confirmSystemSave 未定义（2026-11-24 用户报未提交）

- 根因：抽共用行时拼错，closeSystemSaveDialog＋confirmSystemSave 定义被吃了（SAVE 打
  开会连带开 LOAD 窗、confirm 未定义崩）。已从 HEAD 整段恢复，diff 复核仅剩预期
  增删（弹窗镜像11处＋共用行＋读档三件套＋main 分支）。
- 驗證：双文件 node --check＋trialweb 重建；待用户实测（SAVE DATA 选槽存档成功）。

## 本轮交接总览（2026-11-24 小地图＋读档／存档链未提交）

### 本轮目标
- 小地图窗口内容垂直居中；游戏系统选单内存档读取可用（trial 持久局）；存档失败可定位。

### 已完成工作
- 小地图居中：`mappanellayout.js` 内容（图＋1px＋20px双横幅）垂直居中，`verify_map_panel_layout` 通过。
- 读档黑屏修：`returnToTitle` 无 startMenu（trial 持久）时预检有档→拆局→弹本局 LOAD DATA→选档进局；
  无档弹空窗盖当局（右键关回游戏不拆局）；回标题后取消禁用；读失败重弹；非持久走原事件。
- 空档提示改：用户原话“不是应该弹出存档的窗口，显示里面是空的，而不是这个提示”→空表也弹窗。
- 存档失败：catch 加 `console.error('[wolong] local save failed')`；存档按游戏隔离（app.saves 只装本局）。
- 读档行与 SAVE 共用 `buildSaveSlotRows()`；弹窗镜像 11 处（开关／轮询／hover／点击／右键／绘制／重置）。

### 关键决策
- 游戏内读档必须先回标题（拆旧局）再进新局，禁热替换——trial 无标题则以“拆局＋本局列表窗”等效。
- 无档→提示不动 vs 弹空窗：按用户拍板改弹空窗（不拆局）；只有已拆局后才禁用取消（防黑屏 limbo）。
- 存档失败先补日志再修根因（异常曾被吞）。

### 失败尝试
- 抽共用行脚本拼错两次：一次把 load 头拼丢（SAVE 里双窗＋load 未定义），一次吃掉
  `closeSystemSaveDialog`＋`confirmSystemSave` 定义（点槽报未定义）；均已从 HEAD 恢复＋逐项复核 diff。
- 教训：server/editorapp（\r\n）与 gamebar 长函数优先 node 脚本精确锚点，事后必全量复核 diff。

### 相关文件
- `web/src/ui/mappanellayout.js`、`web/src/ui/gamebar.js`、`web/src/main.js`、
  `server/public/trialweb.txt`（重建）、`docs/checkpoint-journal.md`。

### 当前状态
- 代码＋bundle 就绪未提交：`git status` 5 改（journal／trialweb／main／gamebar／mappanellayout）。
- 待用户 8443 实测三条：有档读档进局／无档空窗可关／SAVE 选槽存档成功（失败贴 console 红字）。

### 阻塞点
- 需用户实机回执（console 红字决定存档失败根因下一步）；8443 supervisor 由用户自管，勿碰其进程。

### 下一步
1. 用户实测回执→若存档仍失败，按红字修 snapshot/IDB 根因；
2. 三条全绿后按授权提交（提交／推送各需明确授权）。

## grid 存读档：原生军团槽身份校验
- 1.7 版 `/play` 实机错误在 `snapshotState`，早于 IndexedDB 写入。grid 新局装配创建原生军团槽；快照与读取此前只允许道路身份 2/3。两端现也接受已装配的 grid，不改变道路内存、边界或摘要校验，已重建 trialweb。
- `verify_map_extent_save.mjs` 新增的 grid 新局 128 槽 JSON 往返／恢复后再快照对照通过。原 E9 行军夹具在装配前向空章投影直接插军团，仍被零章初始化拒绝；不据此声称行军中存读通过。用户随后确认实机保存成功。

## /play 读档确认后黑屏
- 原因：有档时先回标题，清空 scenario 并移除 game-active，再试图在已隐藏的游戏 Canvas 绘列表。持久 `/play` 改为先在当前画面开列表；选槽并预装配成功后复用退场清理，再安装新局。列表可右键取消。
- 隔离 GameBar 确认／取消／选槽调用检查及 save transition guard 通过，已重建 trialweb；当时未做浏览器端到端、LSP／lens 验证，未动用户服务或存档。

## /play 跨章读档身份不符
- 用户确认列表可见，选槽报 `Scenario content identity/index mismatch`。发布玩每个运行目录只绑定一章（idx 0）；按游戏隔离的槽却可来自别章。现按槽内章 ID 加载同游戏同发布的目标环境，沿用原身份及装配校验，通过后才切换世界、内容及章节数据；不改写旧档。
- 全新 Chromium 临时 profile，8443 真实 1.7 发布资源、两个变更 JS 由本地请求拦截提供：第二章建局并存 0 槽，重新从第一章开局，经 GameBar 读档列表选槽，恢复为 upper-2／slot 0／gameStarted=true。未重启用户服务或读取其存档。语法及 diff 检查通过；未跑 LSP／lens。

## /play 按游戏及版本追加存档记录
- 保存菜单打开记录窗并自动新增一条，不选槽、不覆盖，提交成功提示并滚到新行；读取只显示匹配游戏、内容摘要和发布版本的实存行，旧记录没有版本号时按游戏及摘要匹配。不改写旧档。
- 全新浏览器 profile、8443 的 1.7 资源配本地 JS：连续保存五次得到五条独立记录（内部 ID 4..8），列表加载第二条成功；更换版本过滤值后零行。bundle 已重建；未修改用户服务或存档。

## GRID-WAR-AI：发布游戏宣战后不出兵
- 1.7 吕布归天／曹操：实包 384×264、minY=-8、195 城（192 漁陽、193 北平、194 右北平），195 城每 192 相位恰好一遍加入回归。旧 grid 城市游标不提交；恢复轮询后又暴露军团未写穿固定槽、友军占格冲突及战后败军占格无适配。原证、对照及回归命令见[策略笔记](re-notes-npc-strategy.md)。未调整宣战概率、兵力门槛或闪烁／音频策略。
- 发布素材＋本地规则、内存新局：曹操及袁绍两视角均经历曹吕宣战、吕布军驻椎阳、主动接敌、小地图双色、音效请求；NPC 场景出现战后延迟回归。未重启服务或操作正式存档。专项行军／去向组合 77/78，另有 301C 返回对象断言不符；另跑 Chromium 接战表现（RAF/Canvas/WebAudio 十组）通过。发布实包浏览器冒烟只到椎阳章节装配，无 console/pageerror/请求失败；发布战斗全过程为规则测试而非浏览器端到端，未做 LSP/lens。

## GRID-SIEGE-RETREAT：委任守城胜后 29AE 停表
- 旧版 grid 未接 487B，非己城的可退军团误入去向；即使应当离队，攻城败方的 TALK32 也缺返回通道。修复及规则证据见[去向 §21](re-notes-legion-fate.md#21-grid-攻城败军有路撤退与-29ae-消息分开)。上一轮把观察到延迟回归当回归要求，现撤销：本夹具的可退败军必须在同一槽逐点回城。
- 1.7 实包两视角通过，结构退路／委任／原生去向 51/51。全新 Chromium 直接用 8443 实际脚本及章节，受控战果验证反向一步及 TALK32 关闭前后委任 RAF ticket；无请求、console 或 pageerror 异常。非重放用户历史对局。bundle 已重建，三处变更的服务脚本一致；未重启、未改存档。无 LSP/lens 诊断。

## GRID-FIELD-FATE / GRID-MARCH-FRAME：委任野战俘将停表、道路上仍是驻军旗
- 调用栈 resolveFieldBattle→291A→29C3/TALK34，修野战余槽挂起至个性对白返回，与攻城夺城不同；详见[去向 §21](re-notes-legion-fate.md#21-grid-攻城败军有路撤退与-29ae-消息分开)。扩图道路提交方向帧，见[行军笔记](re-notes-march-pathfinding.md) GRID-MARCH-FRAME。
- 真实 1.7 发布素材＋本地 8443 服务字节：新 Chromium 受控曹方委任野战俘高顺，两段对白关闭顺序、委任 RAF 及批处理认领通过，无 pageerror／console 红字／请求失败。双向转弯图标投影、扩图行军、三组 DPR 浏览器图标回归通过；未读写用户存档，未改外交／胜负／俘获概率，未重启或重新上架。未跑 LSP/lens。

**GRID-FIELD-COMMAND／8443 1.7 亲自指挥野战**：截图为 TALK29 关闭后误拒格图（含原生军团槽，不等于原生道路指针）。修复格图选图交接，见 [逆向说明](re-notes-legion-fate.md) GRID-FIELD-COMMAND。实包内存夹具成功建立战术 Session；全新 Chromium 对 8443 的 middle-1 受控曹军与高顺接触，关闭 TALK29 后真实 BattleView active、目录 C6、Canvas 可见，无 pageerror/console error/请求失败。未跑整场到结算，未动存档或发布数据。原生地形、军团流程、编成、夺城 59/59；bundle、JS 语法与 diff 检查完成。未提供 LSP/lens 工具。

**GRID-CENTER-ENTRY／郯城易主后进入友城**：6 月 2 日现场为槽 62/85 在 (297,103)，门格空，中心为槽 35 吕布（势力 13，目标瑯邪），城主 0；非起点漏占格。按[行军笔记](re-notes-march-pathfinding.md) GRID-CENTER-ENTRY 移除城中心重复拒收，不改变道路接敌、敌城拦截、异属军团状态。扩图／原生行军及图标 39/39、1.7 内存实包回归、JS 语法通过；重建 Trial，8443 实际 JS 与工作树 SHA 相同。未使用玩家存档，未复跑现场浏览器；无 LSP/lens 工具。

**GRID-LAST-CITY／吕布末城 2A31**：破城守军列表与灭亡武将扫描此前没有接入玩家消息返回。改为逐人的原序接续，最后 TALK36 返回才加占城数并交还军团批次，见[去向笔记](re-notes-legion-fate.md) GRID-LAST-CITY。8443 1.7 实包：内存设徐州为吕布末城，Node 与全新 Chromium 均得到消息队列 `[34,442,67,34,443,36]`、末条前占城数不增且 ticket 未归还；浏览器无红字或失败请求。用受控队列关闭，不代表手操重玩整场。FIFO 定时弹窗夹具补齐假小地图 URL 与 talk Response 后通过。相关测试另有 301C 满队列旧断言与现行返回字段不符，本轮未改该函数／断言。无 LSP/lens，未动存档或重新上架。

**GRID-CAPITAL-TALK30／玩家失都尚有城**：4E3A 缺消息接续；F03 和 4502 在此之前已经写完。只接迁都通知、展示刷新和返回，详见[去向笔记](re-notes-legion-fate.md) GRID-CAPITAL-TALK30。1.7 实包内存受控邺→信都：开消息前换都、消息未关不认领军团槽／不增攻方城数、重复关闭不重做。8443 全新 Chromium 真实消息卡含新城名，三秒自动关闭后才加一城，无 console 错误／pageerror／失败请求；未使用玩家现场存档。占城／迁都／批处理／FIFO 43/43，重建 bundle。未跑 LSP/lens（工具未提供）。

**MINI-FACTION-HOVER／小地图双列势力名单**：按可点单元格而非整行绘制悬停，空末格／间隙不命中；普通按行列表不变。全新 Edge 上从 8443 加载实际 GameBar，以三势力夹具检查 Canvas：横移时同一行左右底色采样从 211/240 互换为 240/211，间隙、末行空格与移出均清除。JS 语法、bundle 及 8443 模块摘要通过；未提供 LSP/lens。

**GRID-CAPTURE-4CF5／新增据点易主**：修复旧 191 上限，原证及场景见[战后笔记](re-notes-legion-fate.md) GRID-CAPTURE-4CF5。8443 1.7 实包内存受控攻陷新增首都、官员与迁都续段通过，服务模块 SHA 与本地一致；bundle 与 JS 语法通过。扩图重漆／原生占城地图／原生道路调用者合计 22/53 通过，后者 31 项在夹具 prepareScenario 阶段报 8A3F，未进本轮占城入口。无 LSP/lens；未重放现场存档。

**GRID-CAPITAL-4531／196 年 9 月 3 日停表**：截图为战略 type8 迁都事件，不在天气调用栈。4502 误将 L14 绑到 L0E；修正及原字节见[外交笔记](re-notes-ai-diplomacy.md) GRID-CAPITAL-4531。type8 与主动迁都共享的 18 项回归通过，包含格图无当前原生地址及原生当前位置不被覆盖；1.7 实包原有场景回归通过，8443 返回的适配器 SHA 与本地一致。未重放用户存档、未验证当时是否有暴雨；无 LSP/lens 工具。

**ADVISOR-NAME／选势力后确认军师**：取代之前“玩家新局可以无名”的入口行为，不修改旧存档或 NPC 原职务。见[军师初始化原证](re-notes-entity-fields.md)。本地8443发布1.7新浏览器三路：公孙瓒无军师，取消可重选、空名不能开始，输入子明（别号空）后为 custom；曹操可保留郭嘉或改为子明。正式宿主隔离检查33项、标题流程、空存档槽与自定加载浏览器通过；未访问玩家存档或部署。无本批 LSP/lens 结果。

**HUD-PANEL-DRAG／可移动小地图及势力信息**（用户截图指定的 Web 表现）：两窗左键拖动、窗内右键关闭；轻点小地图仍导航，原工具栏可重开。同一局保留自定义位置，换局重置；坐标仅属 UI。新 Chromium 独立 profile，8443 1.7 实测两窗分别拖动、相机不动、移动后小地图点击导航及逐个右键关闭，未触碰玩家档，无 pageerror/控制台红字；原布局4例、战术右键层级、bundle 通过。未跑 LSP/lens。

**GRID-LIVE-BORDER／袁紹攻占數城後月結丟失公孫瓚目標**：詳見[外交原證 §2](re-notes-ai-diplomacy.md)。本地 8443 1.7《呂布歸天》受控戰線：走真實占城尾段令代、涿郡、易城、廣武易主，舊月結漏列 14 且清 F19；修後保留交戰目標，未重設派令，城市／軍團泵第 8097 次更新拿下薊縣，下一輪月結仍辨識北方新增道路對面的玩家。非用戶存檔重播。外交、攻城與事件調度 51/51，含官方 RNG 基線與 256 鄰城索引；bundle、語法、8443 模組 SHA 已核。LSP 未在時限內返回路徑診斷，無 lens_diagnostics；未做瀏覽器目視。

**GRID-MARCH-FATE / GRID-SIEGE-26**：本地8443发布1.7《吕布归天》内存实例，公孙瓒从薊縣返程指向代，命令10＋高费搜索→状态8/TALK31；占格仅减一次，消息关闭才完成ticket。吕布速算攻下仅城兵守的玩家漁陽，TALK26携城名及吕布名、关闭前主权仍属玩家，随后TALK68→迁都30与城数验证通过。原证见[去向笔记](re-notes-legion-fate.md)。93项回归、JS语法、bundle、两个8443服务模块SHA通过。未重放用户具体存档，未做浏览器目视或LSP/lens验证。

**GRID-SAVE-END／北平存档与败北返回**：grid 军团 x/y、targetX/Y 按世界边界，targetNode 按实时城数；JSON 快照、标题准入、冷装配共用，非格图保留旧字节／word 验证。8443 1.7 新 Chromium 隔离 profile 实包将公孙瓒首都和军团设在北平 (279,-3)，真实 `saveGame` 返回 local；扩展地图 mock IDB 北／西负坐标军团读档后继续抵达，首都、占格、RNG、CAS/失败不改档回归通过。失败画 `/api/play/web/grf/defeat.png` 200 且 SHA 同源文件，真实按钮回 /play，两款游戏可选，背景自然尺寸 864×486。正式入口走 formal.onExit → 首页，不依赖有存档；正式宿主浏览器 33 项、首页选单浏览器 3 项通过。隔离打包排除两张未被运行时引用的羽扇设计稿、不放宽路径门；release inventory 包含过场 PNG。未部署、未访问用户档；语法与 diff 检查，无 lens_diagnostics / 本批 LSP 结果。

**GRID-STORM-AREA／北平暴雨结算与逐城通知**：见[kernel 天灾](re-notes-kernel.md)；本地 8443 1.7 实包控制雨区中心 (279,2)，我方漁陽和北平依次进入 TALK70，敌方右北平受灾不报，整个扫描耗 1 字节 RNG；负坐标月末清除、20/21 半径和第512槽、192基线、事件续段等 57/57。脚本使用内存世界，未碰玩家档；语法、bundle 与 8443 三个模块 SHA 核对通过；LSP 推送诊断超时，无 lens_diagnostics，未做浏览器目视复测。

**GRID-42AB／和平目的地不再停表**：撤销本文历史 E7/E8「未宣战一步不动」断言，见[原证与实包受控输入](re-notes-march-pathfinding.md)。行军、图标、E7 共 6 项通过；1.7 `/play` 实包公孙瓒途中易主折返、曹操／袁绍交战和战后回归通过。E8 整套旧夹具在 prepareScenario 拒收预塞军团，未到本次断言；未复现用户 196 年 12 月 6 日局面，未读写用户存档。JS 语法、bundle、8443 两个模块 SHA 通过；无 LSP/lens。

**ADVICE-MONARCH-GATE／出征禁进言**：按[入口原证](re-notes-march-pathfinding.md) 622E 将 TALK64 移至整个进言菜单门前。8443 1.7 公孙瓒，无名军师：全新 Chromium 走实际 submenuClick、亲征对白及编成、再点进言，菜单为空而普通 NPC 提示成功显示、暂停并自动关闭；经首都解体命令和实际军团槽处理后 G17=0，再点恢复五项。无 pageerror／控制台红字／失败请求，未读写用户存档；JS 检查、bundle 通过，无 LSP/lens 工具。

**GRID-MONARCH-DEPLOY／玩家军师可无名**：移除最高政治和君主的显示回退，亲征提交沿用同一规则而使用本世界占格，见[行军笔记](re-notes-march-pathfinding.md) GRID-MONARCH-DEPLOY。8443／1.7／吕布归天，公孙瓒所属 14 的 advisor_idx 原为 null；全新 Chromium 真实接见、定时对白返回后君主同槽亲领六队（C0），无军师名字头像，无页面／控制台／请求错误。原生亲征和编成夹具 34/34，1.7 实包占格只增一次。未改存档／发布数据，未跑 LSP/lens。
