# 原图水域显示资料：人工候选审核

当前状态：**用户m1668“很好，效果不错，继续”已认可本次候选视觉，正式本地采纳及39入口机器轮已完成**。不扩大为DOS机制、道路清单逐项规则认证或完整编辑器授权。下文PENDING/PROPOSED与“未安装”属于认可前的冻结来源/历史产物，由本节及[完成审计](map-migration-completion-audit.md)替代。

## 最新：真实认可与正式本地采纳（MINIMAP-ADOPTION-1）

- [验收描述符](data/current-map-display-acceptance.json)记录真实原话/来源/范围，绑定stage-r9的40da…修订、sourceDigest、两尺寸PNG及七图离线页SHA；不改写旧图/收据，不重新请求已经给出的认可。
- [采纳builder](../tools/map_display_acceptance.mjs)重新核23输入/12工具/38角色/七图/原源编译；[批准stage入口](../tools/stage_approved_unified_map_game.mjs)生成独立r11/r12及规范Controlled模块。38角色中36个原byte保持，只有目录/世界URI更新；source、native、atlas、两mini和20章仍是已审原字节。原source及role中的旧候选措辞保留来源历史，当前批准以manifest.displayAcceptance为准，不伪改旧来源。
- 当前实际修订`map-2-844eab32a84212f72b1430d398f5e82a3924d7e9527746fc2d1c7581cf694f86`，0.6共用编译，161组合/51显示；原23716水格不变。manifest的geographyReview/visualReview/authorDisplayData.status=APPROVED并携带真实验收描述符。经原installer双门/38hash/URI/previous-byte/immutable检查本地原子switch，旧0.5及其它修订目录均保留；已运行页面不热换。
- `approved-machine-suite-r1`：原36安全入口＋组合/seed/批准stage20章JSON三门，共39入口串行exit0；绑定当前72源码及39资源前后SHA同。含真实App三布局/导航/菜单锁、生产保存/五类拒收记录保留、四季×3DPR/中立五格只读投影、native路径/目录/恢复、持久副本20→16；5退休skip不是通过，固定RNG不是CPU等价。另`approved-late-world-r1`旧页atlas晚到不改新页state/RAM/RNG/身份；不将旧36绿拼成新证明。
- `approved-stage-repro-r1`：两新目录38角色/manifest/module同、20章fresh及生产JSON能力恢复、五错误认可负控。安装前`install-review-guard-r4`五拒收与`explicit-install-transfer-r3`六temp转移门过；mock仍只是测试，真实认可来源是m1668，不混淆。
- 后续完整编辑器的组合选取/拆分/checkbox UI仍未实现，属于未授权后续工作。未提交/推送/部署，未访问真实SAVE/profile；最终静态/LSP限制与逐项完成审计只在审计页维护。

复现入口：先以`stage_explicit_unified_map_game`从固定源生成候选（不依赖手工图/已装包），再用`stage_approved_unified_map_game explicit-stage-rN`重建批准转移包。后者明确需要保留的stage-r9及审核七图/收据作为人工认可证据，不假称批准服务可在缺失证据时自动放行；两个入口均只写全新目录，安装另走受控installer。

## 历史：组合级开关与主河摘要（认可前反馈）

- 产品/保存/校验语义见[产品设计](game-editor-design.md)及[工程合同§2.2.2](game-editor-technical-design.md)。`map.waterGroups[].showOnMinimap`作用于实际拼接组合，默认由创建工具写true；旧源没有groups仍全显示。不是素材/类别全局开关，也不是工作台隐藏。多格实例整个加入组；关闭不改大图/完整geography/规则，不隐藏道路。
- 原图导入组合持久化实际memberIds/baseCells；N02等审核分区不是组合，同区不相连水片也独立。唯一显示取舍候选：[original-map-minimap-groups.json](data/original-map-minimap-groups.json)，导入初始化纯函数[map_minimap_groups.mjs](../tools/map_minimap_groups.mjs)。4条主河带与8邻接初始化是Web作者候选，不认证原DOS多格对象或具名河流身份，不在渲染时重新猜类别。
- 共用编译`editor-local-0.6`同时返回完整geography和仅显示用minimapGeography，过滤关闭组合后最上方仍显示水域有效，非水域不擦下层；base水显示标注亦过滤。3个生成入口都消费后者。颜色统一、宽区域色带/有限色阶点阵采用`minimap-style-2-bands-dither`，seed独立，不用规则RNG。
- 当前隔离候选：`explicit-stage-r9/r10`，新修订`map-2-40da80fbba6764cb95b7da5fbd54187628230639ac766acc71710105e16d6372`。161个实际水域组合，51个显示（海/湖与4主河带内独立水片），110个次要河片关闭；完整陆74588/海9874/河13135/湖707及23716水格不变。这是供复审的预置，不是用户已认可全部新组合边界。
- 机器证据：unit-r2（同素材两个组合独立、多格、叠层/base/道路/源JSON/旧源默认/六拒收/无ambient RNG/time）；layered-r2（原30项含用户新共用线色）；engine-r1（0.6自有临时store、20章fresh、真实原生点动作及原子改动）；repro-r4（23固定输入/12工具、38角色+manifest/metadata两目录同、四native与原候选同，真实候选全部组合关闭仍完整地理/规则资产/roadMask不变，20章fresh/生产JSON及7作者数据拒收）；seed-r3（两尺寸重复/变seed纯显示）；App-r3（直接本候选进实际App，192城、一章、三布局、精确角色URI、懒加载，0error/forbidden）。收据/日志统一在`session-evidence/minimap-groups-*`与`minimap-groups-App-r3`，不是新的36整套或CPU认证。
- 初轮r3/r4 stage-report误留0.5合同文本，随后r5/r6修正为动态0.6；r7/r8将审核分区/主河带内不相连水片进一步拆成独立组合；最终r9/r10只是等价清理嵌套三元的源码身份更新。全部旧轮保留，当前复现/装配/App只绑定最终轮，不拼历史绿。浏览器r1/r2及旧离线页已被当前资料替代。
- 包装收据核当前已装39资源和generated switch仍同旧36收据；原65源码现7差（两几何文件、maplayers/mapcompile/minimap/trialcompile及layered测试），其余58同；其它新工具独立SHA，不冒充旧65成员。主动14JS LSP的新3项warning已修，既有Scenario动态fixture hint/部分push-only inconclusive单列；最终检查另记审计。
- **仅数据、共同编译与生成接线已完成；完整编辑器的组合选择/拆分/checkbox UI没有实现。本候选未安装、未提交/推送/部署；goal未complete。**

最新材料：**[单文件离线新旧同尺寸+实际App对照](../.dragon-analysis/map-migration-2/minimap-groups-review-r2/review.html)**（无script/form/网络，7图内嵌，新截图SHA于包装时固定，不冒充App旧收据已有图hash）；[普通](../.dragon-analysis/map-migration-2/minimap-groups-App-r3/normal.png)、[放大](../.dragon-analysis/map-migration-2/minimap-groups-App-r3/large.png)、[短视口](../.dragon-analysis/map-migration-2/minimap-groups-App-r3/fallback.png)。请复审主河取舍、统一线色及渐变/点阵风格；已认可的水域类别不再重复请求认可。

维护数据：[original-map-water-display-proposal.json](data/original-map-water-display-proposal.json)。
维护工具：[propose_map_water_annotations.mjs](../tools/propose_map_water_annotations.mjs)，显式应用逻辑共用[map_water_display_authoring.mjs](../tools/map_water_display_authoring.mjs)。
独立可复现生成入口：[stage_explicit_unified_map_game.mjs](../tools/stage_explicit_unified_map_game.mjs)，不再读取ignored历史unified source或当前编译包；旧stage入口仅维护历史候选复现，不用于新资料收口。
整体迁移与门槛仍由[完成审计](map-migration-completion-audit.md)维护。

## 资料与规则边界

- 原始地形平面、256索引图块及其指纹是可复核原资源；本提案读取已在M0核过的固定编译资产，并再核manifest SHA/长度。原初始plane SHA为`740708c27a89db0a7f82865be623b5732099ec97aabf399e7dbde1450c87c861`。
- `sea/river/lake`在此是**Web显示作者资料**，不是KI字段或通行类别。原图像素只支持“图样是什么”；不能从蓝色、河口连通、宽窄或用户观感推出原机制。
- 本提案显式列出水图样tile IDs、1项外海与13项湖区候选几何，默认剩余可见水图样为河流。不运行边缘连通、RGB阈值或自动湖泊分类。水域显示类别资料本轮已认可；组合分片连接性只初始化成员，不重判类别。
- 两个南部宽水域只称`L-southwest/L-southeast`，不指定洞庭／鄱阳等原湖名；其它小水域也只给坐标ID。它们不是原地图已有语义标签的证明。
- 城旗帜蓝色不列为水；道路可见桥／水图样另记base显示标注，不推断隐藏规则底层。r3显式作者列表给35条水路、其余219条陆路（含桥／短跨水段），17项显示标签与旧any-water-point启发式不同。所有图的原flags／weight／坐标保持，标签尚待审核；不由图样倒推原移动方式。

## 可编辑性

- 水域装饰原子携带显式`waterClass`和候选region来源；base不永久保留同一装饰的水印。非水域装饰叠在上面不擦水域摘要。
- 删除原水原子暴露`UNKNOWN_UNDERLAY`时编译仍拒绝，不自动补草地。作者明确补`tile-20`的受控负/正用例，才允许得到陆地显示资料；这不是恢复了隐藏原底层。
- 所有字节/定义/道路规则绑定仍走生产`compileGameSource`。候选地理分类不会变成规则地形或原道路代价。

## 历史类别审核点（已收到水域类别认可，不重复请求；新视觉见页首）

1. `S-east`外海边界、河口是否需要内移／外移？
2. `L-southwest/L-southeast`和各小水域候选：哪些应作为湖泊显示，哪些仍应是河流？
3. 原索引图块集合是否漏选窄河或桥下水图样、误选陆地图样？旗帜蓝色不能充当水资料。
4. 含岸线／细水线的整格摘要是否过宽？候选图与原初始平面对照，不能只看湖泊数量非零。
5. 新小地图道路、水系是否可辨？原M-06还需普通／放大／短视口回退的当前游戏布局确认。

审核类别资料与M-06美术验收是两个门；图片生成成功不等于已批准分类。未通过前不修改正式编译清单，也不标goal complete。

## 执行与限制

工具参数只能是一个新隔离round，所有输入是代码固定白名单；输出完整候选源、逐实例标注、显式地理mask、同核心自动两尺寸小地图、坐标分区叠图、原候选对照及收据。

不读取DOS或SAVE，不访问任何真实profile，不提交／推送／部署。两个未审批的显示提案比较不证明原版美术、规则或完整湖泊语义。

## 本轮结果（限定，不是批准）

- `explicit-water-proposal-r3`：23,716格逐实例标注；陆74,588／海9,874／河13,135／湖707，13湖区候选均含实际水图样原子。不是因为湖数非零就认为分类正确。
- 四规则资产／graph字段／路网mask均0差；20章顺序和完整state的JSON digest保持`fbeccf4737c0b94424b949eb42a2a45599a17e0be6266a5d0d3a8e4e36325a78`。实际南部湖原子：田野覆盖保留湖资料、删除露unknown阻断、作者明确补land才更新摘要，均过。
- `explicit-water-review-r3`：四张PNG在fresh owned contexts从自含SVG采集，无页面/console/network请求。r1/r2旧材料保留；r2只缩短图上标号/分离图例，r3另加显式道路图。
- `explicit-water-App-r3`：38角色/独立`water-proposal-96b190917820cfdb8a3cbe1fb6020be9292d462ed0dcd3261c6aadb976c79498`目录及metadata，仅受控route送入真实生产App。192城、一章fresh、标题懒加载、两mini独立URI、三布局/外框均过，0error/forbidden。图片专用hold在真实UI计算后取并集，不更改速度，不作为hold规则测试。r1含settings弹窗图，r2改干净场景；r3另验证全部20章以本候选身份fresh及生产assembly JSON能力恢复逐字段同，4精确URI的Node mock fetch不转发。三轮均保留。
- 未安装、未批准。20章独立Node收据另存，不将一章画面试运行当20章证据，不当真实存档或全规则复验；当前0.5源和其36机器门所绑定65源码/39角色文件未变。
- `explicit-water-proposal-r4`：只提取共用作者资料函数，候选sourceDigest、全部14产物及nativeParity与r3相同；既有PNG/App审核图仍对应完全相同资料，不重复未漂移浏览器门。
- `explicit-stage-r1/r2`：从22固定Web/作者输入独立生成38角色＋manifest/metadata，两干净目录逐byte相同；不依赖ignored文件、已安装生成模块或原候选source。仍共用生产import/lift/compile/minimap，不新增运行格式或内置豁免。新source的origin metadata如实记录独立基准输入，完整内容hash形成新修订，不伪装旧身份；两个mini及四native资产与审核候选逐byte同。
- `explicit-stage-repro-r1`首次checker因误用不存在的`content.reference(idx)`失败（没有规则或产物失败）；核API后改为`content.chapter(idx).reference`，失败日志保留。r2：两目录全角色及manifest/metadata同、输入/工具hash同、20章新身份fresh及生产JSON恢复逐字段同、7项作者资料拒收通过。没有重新执行未改生产代码的36门，不拼接为新整套认证。
- `portable-stage-App-r1/r2`直接读取上述独立生成包的原38字节与generated模块进真实App，不从current pack复制或重包装。r1图中normal/短视口右侧panel盖住军师条；原几何门漏检menu。只修纯布局：重叠时移到条下y84（关闭军师菜单也预留，羽扇切换不移动导航），宽屏无交叠保持原位。r2三尺寸真实AABB/资源URI/懒加载/192城/0error通过，菜单八项不再被盖。旧r1/r3图保留，M-06当前用下列r2图，不代签。
- geometry相关focused六入口串行exit0：pure矩阵/直接stageApp/实际current App导航/军师锁退层/行军目标及中立活捕获/retained三DPR像素。仅layout与纯测试两个原65文件改变，原39资源与其它63文件不变；原36收据仍是此前版本，不称新整套认证。

可复现命令（仓库根，每项使用全新round，不自动安装）：

```bash
node tools/stage_explicit_unified_map_game.mjs new-stage-a
node tools/stage_explicit_unified_map_game.mjs new-stage-b
node tools/verify_explicit_unified_stage.mjs new-stage-a new-stage-b
```

生成资料仍为`PROPOSED_NOT_APPROVED`。批准后须按明确修订安装/只验受影响接缝；目前不能把独立生成成功当正式采纳。

本地installer保留未审核状态拒收门，支持`m2-stage-rN`及`explicit-stage-rN`，两族共用38角色/原尺寸/world全部URL同修订/规范Controlled generated/previous-byte检查，不设身份豁免。当前PROPOSED源和isolated模块仍不能直接安装。

[隔离转移测试](../tools/verify_explicit_map_install_transfer.mjs)只在新OS temp镜像给双状态**mock APPROVED**，用于测试复制及原子switch分支，绝不是本提案的人类批准记录。r2六case：未审、坏terrain、自洽hash却world指旧revision、previous不符拒收；规范mock输入38角色原byte复制＋旧目录保留，重复immutable安装拒收。真实38候选/当前39资产及switch始终不变。安装器变更后原五拒审负控亦重跑到r3；没有重跑未漂移规则或浏览器。

该门只防误装，不是批准机制；修改状态字符串不能替代类别资料与M-06验收。真实批准记录、批准后包/规范模块准备及实际采纳仍未发生，不把temp正向复制称为当前游戏已切换。

审核材料：

- **[单文件离线审核页（七图与验收点，无脚本／网络）](../.dragon-analysis/map-migration-2/offline-review-r1/review.html)**：直接打开即可；只是既有资料汇总，打开不等于批准。四review图核原输出SHA，三App图原收据无截图hash，包装时固定其当前SHA并核viewport尺寸，不冒充原收据已有hash。
- [新旧mini＋独立分类图](../.dragon-analysis/map-migration-2/explicit-water-review-r3/minimap-comparison.png)
- [原始坐标＋候选分区](../.dragon-analysis/map-migration-2/explicit-water-review-r3/region-review.png)、[标号图例](../.dragon-analysis/map-migration-2/explicit-water-review-r3/region-legend.png)
- [35水路／219陆路候选](../.dragon-analysis/map-migration-2/explicit-water-review-r3/road-types.png)
- 独立生成包直入真实App，当前布局：[普通](../.dragon-analysis/map-migration-2/portable-stage-App-r2/normal.png)、[放大](../.dragon-analysis/map-migration-2/portable-stage-App-r2/large.png)、[短视口回退](../.dragon-analysis/map-migration-2/portable-stage-App-r2/fallback.png)

上述七图是新风格反馈前的历史材料；当前M-06采用页首最新组合级候选，不以旧页代替。水域类别认可已回流作者JSON；真实视觉认可后才准备如实批准的源/规范包并切换正式清单、重验接缝。
