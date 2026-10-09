# E-01-HUD-FACTION-CARD-PORTS-1（共同君主卡有限接线，非完整准入）

## 产品与边界

只为现行HUD君主卡增加可选`loadPortrait/loadQuote/assertCurrent`可信端口；不安装App/Trial。default portrait→quoteFor及原文字节点/卡布局保持，原另外两处HUD募兵portrait、GameBar/hold/规则不改。固定已知portrait整数0..149，128×128；255/G127不补像、不默认或判死路径。

新`ui/portraitcanvas.js`把原私有PNG上下文已经decode的owned ImageBitmap画到DOM Canvas，128像素/像素化/1px棕边/4px圆角等同web/index.html的#card img。没有第二PNG decoder、blob/dataURL、公共URL回退或Root CSP修改；CSP没有DOM img-src许可不是授权放宽理由。已画Canvas像素是本地副本，释放bitmap不是DRM、GC/抹像或即时远端撤权。

HUD固定捕获三函数。私有entry持有generation、原scenario/card/faction-index/capital/monarch/portrait；在每个image/quote await、外部guard/读取方法后和DOM格式化/安装末次复查。旧quote/bitmap不能复活新卡；显式null、close/新请求解绑旧entry后才dispose，reentrantclose/cleanup throw保首错且不double-release。每次显式同君主仍fresh私有GET，无settled头像授权缓存。loadQuote是可信I/O端口，native只有明确标记的合成提示，**没有签原TALK或全部对白消费者**。

## 实际验证（未签全部HUD）

- 新fakeDOM/可信I/O模型当前model-r4 **18检查**（保原16+两手工复核补例）：实际HUD构造/卡DOM、同faction fresh/释放/null、捕获函数、255等前置拒、第一I/O前撤销、晚image/quote、scenario/card/monarch/portrait/capital/index变更、旧quote/新卡分立、409/401不回退、坏shape/Canvas失败、cleanup首错、格式化/DOM替换/release reentrancy。模型不赋服务器权限。
- 原固定库policy-r3现行 **400roles/19consumer/10negative/getter0/20unknown** 通过，398资源/字体/其余18consumer/registry-profile-mode/93530B不改。只HUD指纹与完整清单pin变：HUD `2288dcb89311843a704d11dea748cf713bc290c1f9a4e3d5649131e2f31f3866`，清单 `30c434115d3e4a0768a1afad0203a00845e374045b2a746f3868d705cf455282`；旧definition比较failclosed/no realDBmigration不变，三旧源先wx归档。
- fresh native-r3 **7检查/18Node控制/5私有GET/2完成bootstrapGET**：正常实际RootSource41+库400登记/fullcopy/saved1-current2，没有fakeGame/Job、没有原槽初始化。真实kao0 authenticated PNG/同decoder/nativeBitmap→**实际同HUD构造/DOM卡Canvas**，全部128×128 RGBA SHA同独立Nodepngio，实际computedCSS128/1px/4px相同。合成faction/scenario仅只读渲染，非完整规则/原将身份认证。
- 完成原/session和/admin/accounts bootstrap后建立whole35SQL行/目录/size baseline，读取/绘制/同君主fresh后不变。真实PNG已返回、合成quote延迟后局部撤销，在安装前拒/释放/隐藏不改规则；后续sameepoch原Library.read响应返回后永久fence，实际Root409/observer1（非410），随后实际改密旧cookie401。5GET获得3handle全部释放/ownCanvas移除，IDB/outside/pageerror0，无公共图片/秘密/profile存档访问。

## 失败与复核原件

owned `.dragon-analysis/editor-phase/hud-faction-card-ports-session-r1/`先register并重新核前继83a5…完整2535项，534原保护源，HUD原不在536声明库存，不能虚写成375之一。实现后原16模型passed；初86模块镜像的regex遗漏多行import，native-r1实际1完成检查/12Node/0资源GET，HUD动态import失败。**r1没有捕获具体failed request/status，不能追认某个响应**；后续只读闭包明确32真实依赖未镜像。只有新fixture补到118原URL byte-exact模块、原86不变，修新focused runner跨行解析（原model1 WX对传递闭包覆盖不完整，后续model2/3 fullfresh重验），不改Root/权限/业务期待/1800s。

fullfresh-native2已全7通过，保同期179 report-source/248 WX-source；随后手工复核仅私有分支两处：monarch读取后再核owner，未知新头像拒绝前隐藏旧文本卡，加两模型/归档旧源和镜像/只重核HUD单pin；当前model18/policy/native3独立fullfresh。旧passed和r1failure/source/log/meta全保，不追认旧SHA为current或拼partial绿。独立最终collector首static-r1发现旧model三轮缺HTML、旧policy两轮缺sourcecatalog.js直接readFile依赖的执行前full-byte WX：它们原有精确b.inputs guard/report SHA不是WX，不回溯补捕获。只有newwrapper补两明确依赖，当前model-r4原18与policy-r3原400/19/10全fresh、全部report-source有实际捕获；native-r3原179report/248WX完整且产品/执行器未变，不重复native。历史五轮记录guard-only/非currentcertificate，失败static与旧writer源保。118 ESmodule加载不等全部机制被执行，更不授完整consumer certificate。

## 限定收口与未完成

当前产品与上述focused/native已验证；current-audit-r2已独立核534保护源、原536全集/375谱系、HUD七定点编辑正逆、其它default分支/原卡文字children不变、policy仅单consumer/pin，现**539inputs/243imports/118原URL镜像/13syntax**与原预算current模型/native source graph均通过，diff-check0。243是当前跨行静态import闭包，不把旧139当作全transitive证明；新Root/Rule未执行或修改。新collector-r1误把prior numeric536/139作hash字典，`5 !== 539`保原self-WX/log/meta；只newr2改读protectedHashes528+sourceHashes8/importHashes139，不降低539期待。独立static-r2全历史捕获/失败/旧passed SHA与实际WX身份图、**17syntax/640links/73唯一Q/35表243列70对象**通过。文档回写与最终诊断后新static/finish再重核全图；正式有限封存以owned `static-receipt-r3.json`、`finish.json`为准。前继83a5…是历史生产基线，后继只追加本批539/243/375谱系，不据此授完整准入。主动LSP六文件原5hints（新generator两unused与native三await-member）/四inconclusive，无ignore/rule关闭；空诊断非workspace clean；后续active-warning十一文件零finding但十inconclusive/一MD unavailable，raw clean0（不采信convenience的一clean），session-all476缓存文件30继承warning/35hint，未清cache/禁rule/suppress。3361B人工摘要审preview后jev-1.13.0 advisory分类stateownership、priority1.55，非SQL/像素/原机制/完成oracle；source/default独立收口已通过，不因此跑无关Rule或存档。最终active-nine raw clean0/findings1/inconclusive4/MD unavailable4，两local scratch reverse警告session FP（数组已clone/map，非shared mutation），保raw、不加ignore/禁rule；sessionall475缓存30继承warning/35hint，非workspace扫清。

无commit/push/deploy/cloud/install/trust。HUD全部模态/募兵、GameBar、真实quote端口、全部435角色/App/RuntimeManifest/Profile/slotMap/未知初始化/认证Trial全部mutating-network、发布/registry/refs-providerdrain-物理删除/backup/工作台与73Q、主goal仍open。
