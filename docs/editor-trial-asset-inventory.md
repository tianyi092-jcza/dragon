# E-05-TRIAL-ASSET-INVENTORY-1：固定导入profile共享资源盘点

goal655继续范围内的**只读库存**，不是Q69闭包或完整任务一证书。当前[单章服务](editor-chapter-trial.md)已有双摘要/固定修订/实际App；本轮不重复该64门，不改规则/源/服务/渲染/存档，不安装或接固定静态资源。

## 实际资产与消费者

`tools/audit_editor_trial_assets.mjs`显式列路径，不扫描整个Web或跟随音乐manifest任意file；[最终receipt](../.dragon-analysis/editor-phase/trial-asset-inventory-r2/receipt.json)与[stdout](../.dragon-analysis/editor-phase/trial-asset-inventory-session-r1/audit-r2.log)记录398项、52792110B（约52.8MB）、所有输入前后SHA同。

- 完整7个battle/TALK数据/原display（299520B），3layout terrain与units；battle maps/navigation各214×4096byte，192city/214directory、3×2048attribute、32×128script words、768formation vector、1023TALK strings/424已提取battle talk records。只是当前Web表形状/指纹，不认证424覆盖全部原消息或数据由这次重新逆向。
- 全150可用`kao/0..149.png`库（固定目录仅确认PNG集合，无按active剪枝）、15个kyo view、120march/4engage/8weather/16disaster、战略/战术UI/字体、gameover与END_s1..12。
- 固定playback.json/11音乐FLAC/2speaker WAV全部保留，音频只表现，不因缺声暂停规则；FLAC/RIFF/woff2 magic与PNG signature/IHDR只作文件库存，**未解码全部音频/图像或作像素验收**。这里只核已有11精确music file，并不采集旁侧MIDI/VGM/调试proof/音频原数据。
- 固定20consumer/index/tool源码SHA；index CSS19个URL都在398中。core loader五JSON/战术资源与portrait懒加载之外，directImage、CSS和动态backgroundImage、`new URL(...,import.meta.url)`音乐/样本都单列，所以不能用只改loadJSON/fetch或一次App启动宣称捕获完成。
- world季节8/native4/mini2仍由既有manifest捕获。受信current39与20章全128人物/192city检查，全部city view有资源；不重解释原人物身份/未知字段/原G127，source/地图及历史副本不变。

## 缺失路径与尚未闭合边界

唯一当前源引用但库存中不存在的头像是`kao/255.png`：20引用，全部是各章G127，attr0。**这不是无头像哨兵/死路径证明**。已实现075B speaker按原army slot抓general metadata，临时城防、NPC通知及自定军师语境不能只按inactive跳过。当前core `portrait(i)`会构造该路径，UI部分catch空图不是原规则证据，也不能伪造png或把别人头像套过去。

辅助[KI局部原窗口](../.dragon-analysis/editor-phase/trial-asset-inventory-session-r1/portrait-window-r1.log)以固定完整SHA`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`、文件偏移CS+0200、capstone只解075B..08A0，未执行程序。正命题：079D call07D2；07E0/07E4按AL逐项比较4cache，miss走07EC..0824读像素边界。**该局部没有FF独立早退，不能从cache占位推出所有FF调用免读文件**。随后[原portrait reader审计](re-notes-portrait-reader.md)闭合正常C350→C39C→075B→BCD返回→079D的AL局部链、四标签静态初值/替换及E38C/F4DF读取条件；原KAO仅150记录，FF miss会请求offset522240/2048B而不是免读。没有DOS短读/CPU/像素执行，完整G127调用可达/全部缓存写者/初始化生命周期仍未知；后继同[维护源domain节](re-notes-portrait-reader.md#e-05-portrait-domains-1军团显示语境更正与候选表边界)撤销807B军师标签为军团主将、区分0..125军团候选与0..127人物候选，不证完整选中返回或G127前史，不新增无头像规则或将缺资产称闭包。

`GameBar._drawRoads`仅文本定义、CodeGraph无caller，旧索引可能缺关系，不能认定dead；旧mmap fallback仍不加入新Trial允许路径，不删除规则代码以通过测试。完整style/图像URL路径与scope一一绑定、未声明路径拒绝、CSS在初始HTML解析前的定位、失败资源/晚响应缓存隔离仍要实际实现并验证。

## 后续捕获合同方向（未实现，不是完成宣告）

398项保守全库可作为固定imported-profile捕获输入；不可据此开放任意portrait/upload/战术目录或缩为猜测可达子集。需保存不可变logicalURL→SHA/长度/byte及程序consumer指纹，单章独立身份带静态captured digest，所有loader/directImage/CSS/audio使用同捕获；失败不回latest/root。必须审缺失路径：取得原/产品调用边界证据，或明确工程保存原缺失状态的适用范围与必需资源阻断合同；不能靠manifest写“完整”或catch吞掉验证。

## E-05-AVAILABLE-LIBRARY-STAGE-1（随后独立离线捕获，未接运行）

`trialassetpaths.js`导出固定398可用路径，stager不依ignored audit report、直接读Web与受信current39。最终两独立[stage-r3](../.dragon-analysis/editor-phase/trial-assets-stage-r3/receipt.json)/[stage-r4](../.dragon-analysis/editor-phase/trial-assets-stage-r4/receipt.json)整个manifest/所有blob/receipt byte同；manifest SHA`5d7e371e70c7a45ba80812efa93fc78b2a19ac68435e5c520dd80767772ea95b`。原r1/r2 c2072b7e6f3d4f6dc7c7182c50f7a0c96c0a239f041e257b049432f364a47530及通过日志封存，不冒最终源码：新5JS补block/template和拆3个赋值表达式、格式化后实际重audit/stage/verify；资源/数据/运行consumer byte不变，新manifest两producer/profile源码指纹变。398逻辑资源＋现有Oswald许可附档按SHA去重为387blob，原字节/runtimeDataSHA/19consumer代码指纹完整保；附许可不等于认证其它资源再分发许可。

- 纯`trialassetmanifest.js`先独立trusted byteSHA/长度、currentdataSHA/baseRevision/19programSHA，再严格398路径/各row SHA、长度、SHA生成blobPath/MIME/许可附档/20个未闭合G127引用；只返回`STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE`。不知道logicalURL（包括255）在blob验证前拒绝，不提供fallback/资源URL/规则安装。256KiB manifest、单blob64MiB/总资源128MiB是Web工程输入预算，不当原容量/用户素材配额。
- [实际验证](../.dragon-analysis/editor-phase/trial-asset-inventory-session-r1/stage-verify-r2.log)：两包复现、所有398/附档逐byte对两包及Web，blob目录精确同、独立currentdata/程序SHA、12负控（缺表/混hash/越界/MIME/大小/currentdata/程序/未闭合引用/mode/坏blob/255或越界logicalURL）及输入前后SHA同。故意重绑内存hash只测schema，不作人类批准/运行认证。
- 此包**仅owned离线staging**，没有安装/保存Trial build或改service、loader、CSS/directImage/audio。源255仍列未闭合，不补图片/猜哨兵/把缺依赖称完整。下一实际runtime capture identity/全部请求绑定/晚结果/缺资产拒收仍要接线和测试；无需重做日期或已有单章服务。

此轮新增audit与4个staging/纯reader/test JS/文档；原138生产/回归源/current39/作者2保全、语法/主动LSP及链接/diff检查由[独立静态](../.dragon-analysis/editor-phase/trial-asset-inventory-session-r1/static-receipt.json)签。未跑/拼新65/66全轮或无关browser（无生产/UI改动）。主动新5JS均push-only inconclusive（0诊断不等clean），5MD unavailable；新5JS直接Biome lint PASS，原8blocking style及block/template新警告已修，不禁规则。定向full/cheap刷新还示4个jscpd重复辅助模式警告（保独立白名单审计避免泛化文件I/O），opengrep180s timeout/gitleaks等未适用不是通过；旧Python2/control-regex1/长期anchor warning不为本轮改语义。Jev仅[2546B人工工程摘要](../.dragon-analysis/editor-phase/trial-asset-inventory-session-r1/jev-input.txt)/preview后fixed1.13.0 advisory，不含原数据且不作oracle/批准门。没有新commit/push/deploy、真实SAVE/profile/DOS执行或全局设置/缓存操作。下一证据步骤已确定，不向Jev发送原资源/原窗口或要求其猜FF机制。

## E-05-ASSET-COVERAGE-8A：运行时加载点机械覆盖证明（批次8a，已闭合）

`tools/audit_editor_trial_asset_coverage.mjs <round>` 对每个运行时加载点做「源码锚（漂移门）→ 具体路径域 → 大小写敏感 ∈ FIXED_TRIAL_ASSET_PATHS」机械证明；数据依赖域只按钉住内置 20 章求值（draft 章启动门属 8b）。最终 [receipt](../.dragon-analysis/editor-phase/saved-source-trial-asset-coverage-r1/coverage-receipt.txt)（tools 输出存档）：19 站点／394 产出路径＋4 保守超集行＝398 全覆盖。

| 站点 | 锚文件 | 域来源 | 产出 |
| --- | --- | --- | --- |
| battle-eager-five | main.js:124-128 | 五字面量（battle 四 JSON＋talk.json） | 5 |
| talk-lazy | talk.js:17 | talk.json（与上行同行，0 新） | 0 |
| battle-terrain-layout | battleview.js:194 | battle_maps.json directory 214 项 layout∈{0,1,2}（固定钉住数据） | 3 |
| battle-fixed-four | battleview.js:195-197 | 三字面量（units/battle_talk/battle_display） | 3 |
| battle-status-icons | battleview.js:825 | 值域=战术命令码（originalsession 六组槽写点锚），上界由库存六行证明，命令域出自钉住固定 battle 数据、8a 不重导 | 6 |
| battle-unit-three | battleview.js:838-840 | 三字面量 | 3 |
| march-markers | mapview.js:9-26 | safeStyle 取模 24＋frame 钳 0..4（代码构造域） | 120 |
| engage-frames | mapview.js:87 | frame&3 | 4 |
| city-icons | mapview.js:679-683/124-135 | kind∈{empty,player,other} 代码封闭 | 3 |
| mapimages-role-gate | mapimages.js ROLE | 正则门逐字锚＋三域逐一回验 | 0 |
| disaster-frames | disasterpresentation.js:6-13 | ASSETS{1:fire,2:riot}＋frame&7 | 16 |
| weather-frames | weatherpresentation.js:30-31 | length 8 | 8 |
| gamebar-literals | gamebar.js | 全部 loadImage("...") 字面量机械提取 | 17 |
| kyo-city-view-data | gamebar.js:726 | 20 章 3840 city 的 view byte（0..14 全使用） | 15 |
| kao-portrait-data | world.js:219＋startmenu/battleview:662 锚 | 20 章 2560 武将 portrait byte：147 distinct，146 在库；缺失集逐字节==manifest 登记的 20 个 G127/255 | 146 |
| endview-endings | ai.js:1857/2570/5248-5253＋commands.js:138 | gameover 字面量＋end_s1..12 生成式 | 13 |
| music-playback | music.js:187-211 | playback.json 11 tracks 逐条 file 字段＋自身 | 12 |
| speaker-engage-sfx | speaker.js:14-16 | ENGAGE_SFX_URLS [3,13] | 2 |
| shell-css-urls | trialapp.txt＋index.html | 两 CSS url() 集机械提取（19 唯一，battle_status_0 与上站重叠） | 18 |

反向覆盖：库存 398 行每行要么被上表产出，要么属登记保守超集（kao/145,147,148,149 四行——20 章未引用但刻意保留全量，不剪枝猜测子集）。

**大小写错位修复（本批实证发现）**：库存 12 个 `grf/END_s*.png` 键为大写，而磁盘规范名与运行时生成式（ai.js:5251 `grf/end_s${i+1}.png`）均为小写——trial web 路由按精确键查找，小写运行请求 404（endview try/catch 静默吞缺图）。修复：`trialassetpaths.js` 12 键改小写（对齐磁盘/运行时；不改运行时、不动原证 END_S 大写表记——DOS FAT 大小写不敏感，Web 产品文件名为准）；连带修复 producer 漂移：stager `consumerPaths` 补 `web/src/editor/servertrialapp.js`（7c 起 txt 已含 20 键，stager 只产 19）。manifest sha 730442cb…→70acce54…（93632 字节不变；row 值/policy/unresolved/runtimeData/baseRevision 全等，programHashes 仅两预期变），`sourcecatalogpolicy.js` manifestHash 继任；registryId 保持 `approved-available-library-76cdf28-1`（opaque 注册名，内容绑定由 manifestDigest 承担，改名无安全收益且级联面大——登记决定）。封存轮次工具 verify_editor_backend_library_png.mjs:16 的 76cdf28 钉属其封存现场（wx 写其 session 目录、before.json 433 钉不可重跑），不更新、如实登记。

**HTTP 实证**（`tools/verify_editor_trial_web_assets.mjs`，真实后端＋两注册表安装，6 检查／12 调用）：小写 end_s1/7/12 经 trial web 路由 200 且字节==磁盘＋X-Content-SHA256 一致；大写变体 404 TRIAL_WEB_PATH（无静默别名）；kao/255.png 维持 404（不补图/不套用）；kao/0.png 与 playback.json 基线不变；匿名 401 会话门不变。

**边界（不称 Q69 闭包完成）**：draft 章 portrait/view 启动门属 8b；G127/255 处置（三选一）属 8c 前置未决；TALK 域与终局序列可达性属 8d。openview open_s* 帧 trial 不可达（boot 传 null opening，main.js `opening?.` 链）刻意不在库；loadBuiltinContent 仅非 trial 分支；map_atlas/map_tiles/季节 8 属 installedSources 注册表根（批次5/7b 已钉），非本库存域。
