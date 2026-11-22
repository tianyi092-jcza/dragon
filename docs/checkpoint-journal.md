# 检查点日志（checkpoint journal）

> 长期事实、架构、命令与约定维护在 [AGENTS.md](../AGENTS.md)；本页只记录本轮会话的详细进展、调试过程、失败尝试、相关文件、当前阻塞和下一步，不构成实施／提交／部署授权。
> 历史：[§73–194快照](checkpoint-journal-archive-73-194.md)、[§72及以前](checkpoint-journal-archive-through-72.md)、[更早收据缺口](historical-receipts.md)。历史待办与运行状态不自动延续；机制结论须回SKILL／re-notes原证。

## 本轮（工作区未提交：实施已做，commit／push／部署均待用户明确授权）

### 230. 引擎用指定战场地、审核列表自适应、攻城选图原证结论

- 上架审核列表 100% 自适应（用户验收反馈）：8 列最小宽原 1680px 撑破卡片出页面滚动条；收紧为名称 120／作者 90／说明 150／版本 80／状态 100／创建时间 140／状态时间 140／操作 300，说明列吸余宽；发布历史内表列宽 180→100~140 并加 `.history-cell` 封顶（`max-width:100%`＋内部横滚）；表根 `width:100%`，卡片保持 `overflow:hidden`。构建＋檢查全过。文件：`editor-ui/src/ReviewPanel.vue`。
- 引擎接线断点（已修）：scenario 城＝章行，`applyModule` 的 `battlefield:` 只写定义不写章行——面板换图引擎照用旧图。修正式流向（定义→章行）：新 `backfillRowBattlefields`（定义有、章行缺的按槽位补，只补缺不覆盖，seed 时跑）；面板改战场地同步全章所有章行。上限不动：`troops_cap` 按章各异是定稿（老章互不拉平），定义只供新建 admit 取初值。显式走 `resolveSiegeMap`，缺省走目录回退（与原版同一张）。回放：admit 6/6（含新断言“改定义全章行同步、上限老章不动”）、identity 6/6。文件：`web/src/content/authoring/gamesource.js`、`server/gamecopy.js`、`tools/verify_copy_city_admit.mjs`。
- 攻城选图原证结论（用户问“不同城门不同图”，已分析，未实现一城四图）：`4ADE→4AF3` 选图输入只有 `D34=城市index`，`4B08` 写 `D35=0`（来路／城门没进寄存器，re-notes-legion-fate §14.1）；`CB07` 按 D34 读目录，一城一张；BATTLE.MAP 214＝192 城目录＋22 野战（0xC0..0xD5），目录无一城四图位置；bit6 镜像只在玩家守方路径置（`4F13→4F58` 返回 `D35 OR C0`），且是二值开关，变不出四种图。结论：一城一图＋玩家守方镜像变体是实锤；用户所见差异只可能是野战（城门外军团按地形 `0x4B63`＋`0x97F0` 出图）或镜像变体（CB9B 反转＋主题 `0x3F-theme`）。按证据铁律不实现一城四图；判别测试：同城同章打城本身从两门各进一次，图同则城门无关，若真不同记下两图版式／主题再翻 `D34→CB07`／`CB9B` 分支。

### 229. 據點建城收斂：刪新建面板、戰場＋上限進屬性、複製回填、發布補行、縮略圖、拖磚成路、基礎雙字段

- 用戶決定遊戲級地圖新據點流程：據點模塊建檔（含戰場＋城兵上限）→地圖放裝飾（拖放定座標）→右鍵綁定（坐標寫回檔案）→拖路連接→圖上檢驗；建城五步對話框（`NewCityPanel`＋`gamenewcity.js`＋Workbench 槽位＋`main.js`／`client.txt` 接線）已刪，`verify_new_city_panel_browser` 退役，workbench lane 與 panel_visibility 註釋同步。
- `battleMapId` 分類實錘：BATTLE.MAP 192 目錄各有 layout＋theme（目錄號選圖、layout 選 MDL 描述表、非零 theme 做 `0x3F-theme` 變換，見 re-battle-command SKILL CAEB/CB44/CBBC）；192 張地圖逐位元組皆不同。同類型多戰場（中／小都市各 16 種、大都市 4 種、關卡／戰場各 2 種），全表 22 種（版式 0/1/2 × 主題 12 種）。據點模塊建檔／編輯按類型先篩子集（類型切換清空越界選擇），共用 `editor-ui/src/siegebattletypes.js`。
- 城兵上限是原版章節屬性（+0x12，各章可異，實測 188/192 城跨章不同）：定義只存新建初值（建檔必填，編輯可改），老城各章互不干擾。章節勢力據點列表城兵列後加城兵上限列（×10 人數口徑、可改，寫 raw 0x12，`CITY_EDIT_FIELDS/CAPS` 已擴）。
- 複製落子回填（`seedFromGame` 統一路口，冪等）：定義缺 `troops_cap` 取首章同城行做默認；無首章行留空，後續 fail-closed。
- 發布鏈自動補行：`validateWhole` 開頭對已放置但缺章節行的新城按定義 `admit`（`troops_cap`＋`battleMapId` 取建檔值，逐城 fail-closed，票據綁定補後摘要）。新套件 `tools/verify_copy_seed_backfill.mjs` 3/3；全鏈探針：建檔→放→綁→檢驗自動補 20/20 章→編譯 nodes=193。
- 基礎據點雙字段（用戶產品決定）：base 記錄加 `troops_cap`（store `troopcap` 鍵＋面板城兵上限列，顯示×10 人數、輸入人數÷10 存 raw，10 倍數門）；複製裝配加 `overlayBaseCityIdentity`——上限取源首章同槽行、戰場取源據點定義；源無值時按引擎回退：base 手工值保留（更換持久化），否則 0..191 按槽位取 BATTLE.MAP 目錄（`createSiegeProjection` 無 `battleMapId` 即按槽位取目錄，編號與 `siege:N` 一致；192+ 留空等 admit）；`copyData.cities` 同時喂遊戲副本與系統基，兩邊天然一致。新套件 `verify_base_city_identity.mjs` 6/6、`verify_base_cities.mjs` 6/6（含 troopcap 門）。新遊戲／最小章從 base 物化本就帶整顆記錄，無需改。實測診斷（2026-11-22 dev 庫隻讀備份）：base 上限 192/192、戰場 0/192——源頭內置遊戲本就無顯式戰場地，按回退下一拷即 192 全滿。
- 附帶真修：`slice(15)` 取戰場號差一位（`siege:192` 會被當 92 放行），新舊七處一律改 `match` 取組（含原 admit 門）。
- 回歸：controller cities 16/16、seed backfill 3/3、admit 6/6、chapter_ops 34/34、E10 發布鏈全綠、road autobuild 4/4、position editing 6/6；city_fields 兩項為乾淨 HEAD 既有失敗（stash 對照）。Vue 構建＋檢查全過。
- 22 種縮略圖已上線：`tools/export_siege_thumbnails.mjs` 用真實 `composeBattlefield` 靜態合成＋Playwright 截圖，192 張 240×128 存 `web/grf/siege/`（逐張哈希皆異）；`/siege-thumb/:N.png` 同源路由（越界／遍歷一律 404）；共用 `SiegeThumbPicker.vue` 彈窗（按類型先過濾→22 組分組展示→點圖進單張 2 倍像素化大圖可返回→點定），遊戲＋基礎據點兩模塊建檔／編輯共用，文字下拉框已移除；對話框限高 90vh 內部滾動（修過整頁滾動條）、加圖例行。
- 拖磚成路（用戶產品決定）：道路／城門磚即道路數據（B8..DD 共 37 種，零跨類複用，憑磚號識別）；連通且兩端進城門的鏈在保存時自動物化為 road-auto-* 正式路（`web/src/editor/roadchain.js`，走同一 buildRoad 門），磚刪散自動清理；未連通／分叉／歧義／自環只標紅不攔存（warning，不進保存門）。mapPositionValidation 同源診斷供圖上即時紅格；gamecopy map 保存分支調和，不碰手建路。新套件 verify_map_road_autobuild.mjs 4/4（含隔離 store 全鏈）。
- 添門已確認為鋪磚動作（門磚即 D4..DD 裝飾），無需單獨 UI。水路定案：過水走廊即普通道路，不做 travelKind 區分（buildRoad 的 travelKind 只是作者標注 Q59，校驗與權重都不看它）。

## 当前阻塞与下一步

- 瀏覽器真機系列需擁有者會話（publication_chain／copy_http --browser／save_store browser／panel visibility 等），不是失敗；本輪未跑。
- 乾淨 HEAD 既有失敗（city_fields 2 項等，stash 對照過），部署前重核；未跑／失敗不記通過。
- 提交／推送／部署均待用戶明確授權；本輪工作區未提交。
- 下一步：①用戶刪檔重拷驗收（base 雙字段＋拖磚成路＋換圖即用）；② gate 若用戶給出同城攻城兩門兩圖反例，順 `D34→CB07`／`CB9B` 翻 KI 分支，否則不做一城四圖；③用戶確認後按授權 commit。

## 近期历史（已关闭或移交；细则见 git 历史，不恢复状态、不授权新任务）

### 228–227. MAP-EXT 交接

- 228 三笔已在历史中（0889a6e 過場資產歸屬／4b0e0d3 北線隔離實驗／ffad700 四向擴縮合同與驗收帳）；推送狀態重核 git log。
- 227 交接入口仍为 map-expansion/README（E0–E10 逐关）；不新增页面，不把计划当实施。

### 226–223. 北线隔离实验（均非上架验收；App 可玩门仍拒实验版本）

- 226 跨零中断重播一致；东／西／南单格扩未过编译尺寸门。
- 225 玩家命令跨界往返隔离 fresh 通过（157 行 hitTest 失败非本链）。
- 224 玩家包加载通过；CHAPTER_CAPITAL 拒票未处理。
- 223 北扩 12 行寻路通过（384×268）。

### 222–212. 已提交批次（一行一条）

- 222 過場資產歸屬＋8443 重啟驗證（STATIC_RELEASE_INVALID 仍停）。
- 221 f522aaf 推送收据（与 github/main 同步）。
- 220／219 胜负过场动画（f522aaf）。
- 218 dev 重启验证（8443 served==本地）。
- 217 品牌统一（7b5b627）；216 菜单重整（7b5b627）；215 chrome 图＋用户管理（53e55f4／892dc75）。
- 214 保存检验单句（6ac9145）；213 坐标列＋删除（6ac9145）；212 系统基＋单复制基准（d22b4f1）。
- 211 唯一开发库（规则已入 AGENTS §4）；210 提交前审查（pinned-source-registration available-library 指纹失败，部署前处理）。

### 208–200. 已关闭章节批次（各一行，细则见 git 历史）

- 208 武将所属并入本行编辑保存；207 势力名去内部编号后缀；206 所属解析／首都候选／武将列宽；205 首都只读标识与城兵单位；204 章节页布局收尾；203 新增章节紧凑表单；202 同君主共首都保首丢后；201 同章重复势力保首次（被 202 取代）；200 删除管理入口清退与复制失败可诊断性。

### 199. CHAPTER-WB P0–P7（本地完成，细则见审计与计划文档）

- 阶段产物与关键验证收据见[审计](docs/chapter-workbench-audit.md)与实施计划；lane 命令与分层验证入口见 [AGENTS.md](../AGENTS.md)§5，不在此复制命令表。本轮不重跑历史 lane，不把中途缺口当待办。

### 198–194. 地图历史批次（一行一条）

- 198 地图保存检查弹窗与拒绝／未知／重读失败区分；197 据点绑定与素材拖放收尾；194 道路／据点拖动红罩与保存错误详情。现行细则以地图合同为准。

## 历史定位与兼容锚点

以下只转接历史，不恢复旧状态或授权。无锚点的§73–194按[归档编号](checkpoint-journal-archive-73-194.md)查找；更早见[旧归档](checkpoint-journal-archive-through-72.md)。

<a id="184-d2-c实现溢出旁表2bd9排空用户批c本地验证未push"></a><a id="186-d2-event-64p0p1隔离审计与一次性决策包未实施未push"></a>
§184–187：[旧旁表、审计与绝对位置调度实现](checkpoint-journal-archive-73-194.md#187-d2-event-64p2p5-本地实现d0d8s1-全-a已完成并推送-b101dd3未部署)；现行规则见D2计划不用旧旁表方案。

<a id="79-sea-ground-1全幅海域基底与地面轮廓"></a><a id="80-atomic-catalog-1单格素材库与单层分类"></a><a id="81-atomic-preview-2分类更正植被核对与32px预览"></a><a id="82-atomic-spring-neutral-3固定春季与中立据点素材"></a>
§79–82：[底图、原子库与春季展示历史](checkpoint-journal-archive-through-72.md#79-sea-ground-1全幅海域基底与地面轮廓)。
<a id="84-map-space-4地图优先布局与对象右键菜单"></a><a id="85-map-space-5紧凑布局与原始比例"></a><a id="87-map-pan-lock-1地图拖动锁定切换"></a><a id="88-city-group-1四套配方与放置接缝待确认"></a><a id="89-city-group-preview-1据点组只读素材展示"></a>
§84–89：[布局、锁图与据点组预览历史](checkpoint-journal-archive-through-72.md#89-city-group-preview-1据点组只读素材展示)；对象拖动以现行地图合同为准。

<a id="37-前端架构决策编辑器采用-element-plus-默认主题与组件"></a>
§37：[Element Plus默认主题／组件决策](checkpoint-journal-archive-through-72.md#37-前端架构决策编辑器采用-element-plus-默认主题与组件)（tag: architecture）。
<a id="49-共享头像文件及资产id数字重编号"></a>
§49：[共享头像数字身份决定](checkpoint-journal-archive-through-72.md#49-共享头像文件及资产id数字重编号)。
<a id="10-014发布整理"></a><a id="11-015发布整理"></a><a id="6-render-layers-1测量脏层灾害播放器及断链整理"></a><a id="5-当前时钟系统逆向与重构本地完成"></a><a id="6-发布主线阻塞与下一步"></a><a id="8-用户指定五档提速"></a><a id="9-battle-text-reflow-1战术双方对白自动折行"></a><a id="10-录像反馈后的战略性能修复"></a>
时钟与表现：[更早历史索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)。
<a id="11-编辑器vps部署前只读盘点"></a><a id="12-受限编辑器容器部署"></a><a id="13-固定库刷新与私有trial接续"></a><a id="16-当前版本资源门部署与只读巡检补强"></a>
旧部署／Trial：[更早历史索引](checkpoint-journal-archive-through-72.md#归档索引与兼容锚点)，不是当前部署身份或恢复接口授权。
<a id="19-后台框架壳editor-ui-1"></a><a id="20-账户管理组件化editor-ui-2"></a><a id="21-草稿与章节组件化editor-ui-3"></a><a id="22-阶段任务与结构展示editor-ui-4"></a><a id="23-只读素材库组件化editor-ui-5"></a><a id="30-上架限制与删除追踪组件化editor-ui-12"></a><a id="32-固定库身份合同授权修复与目标闭合editor-ui-14"></a><a id="33-后台迁移提交推送与受限上线"></a>
早期Vue壳：[原批次及缺口说明](checkpoint-journal-archive-through-72.md#19-后台框架壳editor-ui-1)。
