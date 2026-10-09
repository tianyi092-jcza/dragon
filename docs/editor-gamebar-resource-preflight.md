# GameBar 私有资源前置排查（只读，未实施）

## 当前基线与边界

前继HUD限定生产批次已封存：`hud-faction-card-ports-session-r1/static-receipt-r3.json` SHA `be2126634c3a05c471bcda8b2a3e3cc9b7f6ac0e4b17192876fec133752537d5`，539inputs/243imports/375原声明玩家输入谱系。GameBar当前SHA `394bbb9037e6f0e2f79f471abfadf9ce4eda6a58389381ccc2ddf5a9b739e8c8` 已在这份inventory内；HUD成果不自动覆盖GameBar。

只读自有证据目录`.dragon-analysis/editor-phase/gamebar-resource-preflight-r1/`：源码审前WX、十四源WX、registration/report/stdout/stderr/meta。独立核sealed base4287项，另核finish.extraHashes的16独立新增项（48项中32重叠），总4303。首collector误在加入extras后仍期待base4287，`4303 !== 4287`发生在源捕获和探针之前；旧脚本/selfWX/失败日志/meta保留，仅newaudit-r2按seal.mjs实际职责分开计数，base4287、539/243/375及所有SHA期待不变。r2完成14源/17UI/2mini/24portrait调用的源码排查；未执行GameBar/规则方法、浏览器、SQL/R2或网络，不读真实存档/profile/IDB。

## 实际入口，不按索引空白判死代码

CodeGraph定位GameBar为`ui/gamebar.js:141`，caller查询为空；AST确认`main.js:157 new GameBar(this)`。构造器实取十九个Image：十七固定共享UI（详见report.staticURLs）加当前world.definition.assets.minimap的base/large。两mini分别在await后检查原world；十九way Promise.all最终安装imgs/_gf并draw本身没有另一个world/lifecycle票据复查（源层观察，不宣称已复现跨场景错误）。

Canvas的drawImage能直接消费既有解码ImageBitmap，不需要DOM src URL或HUD portraitcanvas转运。私有接线仍需准确saved/world/size locator、每await及安装末次复查、owned handles释放；不能把局部assert当实际Root重新授权，也不能用已缓存pixels充当后来显式读取的权限。十七UI+两mini同时持有十九图，必须显式规划generic私有PNG每context八handles的所有权/分工，不提升原预算或套大fallback许可。

## 头像工作流必须分域

AST确认二十四处`portrait(...)`，report保留实际行/参数。至少包含：右侧军团与资源君主的绘制内懒加载、五种进言的君主/军师、外交接见、武将信息/任命对白、内政/外交预算三头像、编成/编成提示/财政。不是一个无副作用循环可以统一替换。

- `showGeneralCard`（4272）：先await quoteFor，再await portrait.catch(null)，最后创建generalCard/draw；方法内没有捕获scenario或_scenarioUiGeneration/request-key复查。只记源码事实，尚无本次browser复现，不宣称漏洞或修复。
- `showGeneralMessageDialog`（4346）：portrait await后核_scenarioUiGeneration；三秒timer比较card对象才close。不能借资源统一化删除这个区别。
- `closeGeneralCard`正常退层清timer/选中后可能调用onClose；`resetScenarioUi`增generation、丢弃timer/card/queue，不执行其回调。这个资源取消与消息推进界线必须保留；不把全部取消都转为close或执行/重播后继。
- drawRes/军团面板的portrait.then在所读片段中没有对应key/scenario晚到复查，源层待审计，不等于受控复现。新private失败不应悄悄公共fallback；原默认catch显示空头像不能反向赋private权限。
- 多步进言/预算/外交接续有规则/付款/RNG/hold边界，排查不授权本次改写它们。只读资源工程不得猜G127/255/default头像、合并按姓名匹配的人物身份或改任何原规则。

## 下一限定实施候选

优先把**同GameBar构造器的17共享UI+两精确编译mini资源**拆为可选可信I/O与owned生命周期，保持原绘制/布局/hold/消息行为；这可以先解决实际实例化依赖，再审单独武将卡双await端口。实施前另登记/归档获准旧源、精确consumer SHA及manifest pin，封闭默认分支和每资源目的/world关系；做focused/fresh正常Source-copy-save/native权限与像素验证，不重复已封存HUD和解码器大套件。十九资源接线不自动覆盖24头像/TALK/App/RuntimeManifest/Profile/Trial。

本只读文档和report不是新生产receipt、profile或准入：implementationBatchOpened=false、productChanged=false；主目标以及完整GameBar/全部消费者、App、认证Trial、发布、drain/物理删除与工作台仍未完成。无commit/push/deploy/cloud/install/trust修改。
