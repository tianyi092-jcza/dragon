# E-01-MAP-IMAGE-RESOURCE-PORTS-1 — 共同MapView图片I/O

## 有限实际接线

现MapView第四可选参数`resourcePorts:{loadImage,assertCurrent}`，安装时固定捕获两函数与worldGetter当时对象；新增`mapimages.js`仅管理该view的拥有图片、队列与局部生命周期，不是新renderer/codec/权限服务。既有城标、军团标识、接战图三个取图函数直接分流到这个I/O；相机、据点/军团锚点、插值、方向帧、状态查询/Rule/AI/RNG/计时、默认global Image路径/cache和原120方向预载不变。没有挂玩家App/认证Trial或任意scenario运行准入。

三城标＋24×5军团帧＋4接战帧共127精确logicalURL，只接受这三个族，拒坏范围/路径/remoteURL/末尾newline。四active可信loadImage，最多127local entries；仅工程描述界，不是浏览器heap/CPU硬配额。原private PNG每context八owned图片限制没改；本轮实际三图/最多四handles，**未验证单context装127图**。可信端口必须自行管理解码器总预算及远端读取，不能靠controller发权限。

`draw`复用ownedpixels且每次局部assert；首次缺图可请求一次，失败保settled拒态、后续draw不自动retry。`loadImageResources`显式读取：当前inflight才合并，既有settled图重新GET并释放旧handle，没有永久已授权URL缓存或公共Image回退。晚await/回调核closed、实际caller-local/world对象及entry身份，晚image只清ownedhandle；close拒queued work、释放已持有与以后返回的handle，不能取消provider/抹Canvas/GC/DRM。保持原CSS/DPR和绘制布局，城标private首次未准备只跳该图；默认Image始终truthy，原默认图路径不改变。

## 政策/库存边界

先完整rehash前继Music `9df289…`、wx归档旧MapView与两政策源及三旧文档。MapView虽是旧清单19consumer之一，**不在前继528声明/130imports中**，不能误写成375保护源内改动。`before.json/policy-edit-registration.json`明确old-inventory外来源与授权范围。只更新available-library.txt中MapView单consumerSHA及sourcecatalogpolicy.js完整manifest固定SHA为`ce57b4244e0c17223e042d1a08bcff9b00af2cac2cc1cf355968e7d8678f4767`；93530B、398资源/字体/其它18consumer（含已封存Music）、20unknown255/profile/registry/mode/原政策代码与源41不变。

旧definition_digest逐项比较仍failclosed、不自动修复/迁移/重登记；真实旧数据库升级没测、没有触碰实际后台。当前合并526保护源＋两政策/MapView/mapimages/newtool为531声明；实际135import（旧130加5个此前图外renderer依赖），原375谱系本轮全保，先前3world授权变化不混成本轮。

## 当前成绩及严格限制

- `tools/verify_map_image_resource_ports.mjs` **19模型检查**（原16＋callback close/replacement与dispose回调撤销三例）：同现MapView城/军团/接战画法、style-1→23/countdown7→3保持、没有global Image；函数捕获、local画面复用/显式fresh和release、世界对象替换/局部撤权、close/late、失败无自动retry/显式后读、十role四active队列、五坏角色/坏函数opt-in拒。fakehandle/guard不是HTTP授权。
- 原`verify_march_marker_presentation.mjs`当前不改工具：tilecenter/X优先/纯骑混编周期/转向到达/延迟预载/120帧首次非空及不重复load全部保；本轮新增I/O不赋新机制证据。
- 原librarypolicy current **400roles/19consumer/10拒/getter0/20unknown**，所有body与其它指纹同源，非全Q69。
- **fresh native-r3 7检查/17Node控制/6browser资源GET，29报告源SHA/33执行前WX/11字节等值模块mirror**。真实Root+tempSQLite/R2/KDF正常Source-library登记/fullcopy/saved1-current2，不fakeGame/Job/opaque来源；三个真实私有PNG通过同MapView/nativeBitmap进城标16×16、style23-frame0军团16×16和接战frame3 48×48，区域全部RGBA hash与独立Node decode精确一致。原PNG先证alpha只0/255，城标按原#141414背景合成，其它透明像素归零；不是epsilon、抽样或复制结果。仅这三private角色，**不是127图全域/完整城市军团/真实战役认证**。
- native rendering使用明确synthetic只读sc（三数组及一个空城），未执行Scenario/Rule、没有新初始化事实；world使用原definition，实际Sprite通过现draw/helpers。成功三个GET和之后显式同图fresh GET前后完整35表行/目录/size一致，baseline前等原editor bootstrap/accounts响应实际完成，不豁免sessions或加sleep。local revoke阻cached draw/不GET；sameepoch原库返回后fixture永久fence插入、Root实际409/read1拒；之后实际password handler撤旧cookie，401，owned四handle释放。不是410/provider取消/物理scrub。
- IDB/外部请求/pageerrors0，fresh Chromium/profile，仅owned临时R2/SQL/browser/TLS关闭；用户SAVE/profile/存档、共享cache/已有speaker/真实云不碰。

## 失败、派生与证据

owned `.dragon-analysis/editor-phase/map-image-resource-ports-session-r1/`。native-r1保33执行前源、stdout/stderr/meta，copied parent Music的effective-before文件名，而本轮从 outset将政策加入before，故ENOENT在try/启动server之前（0HTTP/0check、没有native-failure JSON；日志不伪造）。只newnative把文件名改before，原期待/权限/1800000ms保，native-r2全fresh通过。之后独立所有权审阅发现newcontroller的ready callback内close/replace可能重复dispose，以及旧handle.dispose回调close后enqueue会悬空；仅newmapimages把handle先解绑/catch只释放仍持有的handle/外dispose后重查entry与生命周期，加三模型例保原16，current19＋native-r3全fresh通过。MapView/两policy/Root/fixture/原期待不变；r2 passed旧版本源-log保，不能作当前helper最终成绩，r1不得拼绿色。native-derivation/head/tail记父SHA与局部截取范围，仅复用正常授权Source-copy-save和ownedtransport，不复制前继Music成功cases。新module mirrors原byte不替换imports，按原`/web/src/...`相对ESM路径提供。mirror/derivation/delta setup工具未事前wx源码捕获，明确**不是同期执行捕获**；actualnative/prod/module字节已在每轮执行前完整wx归档，不补追认setup。

三源正逆diff12/1/1操作，manifest单MapViewSHA与policy单pin反替换应精确等旧字节；几何/默认preload body与getter默认尾段独立守恒，新的controller不赋Root/session/schema/manifest能力。无规则/全层初始化变更，原origin/owner/epoch/fence/bytes/SHA服务逐次复核仍权威。

适用LSP/sessionall/syntax/diff/link/73Q/schema35-243-70/历史失败与当前来源图逐项审计；不能据empty/inconclusive/unavailable称workspace clean。Jev人工已审4550B摘要preview后固定jev-1.13.0/仅advisory，不含资源/源码/secret/真实身份/全日志、不签SQL/像素/权限或目标。Jev为cleanup前16模型摘要，后来三个所有权更正仅以current19/native-r3确定性证据审定，不冒模型判定更新正确。当前active9files初查6diagnostics含新setup JSON.parse error已补catch cause；collector两existence-stylewarning已等义includes修正，最后2files0但2inconclusive。其余model动态await/mirror-unused/native(await).prop五hint保留，四MD unavailable；sessionall severitywarning465files29继承warnings/该过滤摘要35hint，不称全部severity hint库存。没有ignore/rule关闭/cacheclear。

独立static-r1已核531/135、12syntax/634links/73唯一Q/35实际NodeDDL243列70对象，12/1/1三源正逆、单MapViewconsumer/单manifestpin反替换精确、默认preload/方向锚点段byte守恒、current模型19/native-r3/原default120/policy400全部wx与reportSHA/11module bytes、失败r1与旧passedr2/models/focused sources保持。文档回写后再次核整图，最后finish方可限定封存；全目标仍false。

## 尚未闭合

同MapView灾害/天气、GameBar/HUD/mini/其它直接Image与音乐角色仍未全端口化；fallback-world已有限验证而非共同App安装。全部RuntimeManifest/Profile/chapterId/slotMap/world-mini identities、255/G127/完整依赖、认证Trial所有规则mutating/async/断线/网络、发布-上架-registry-announcement、全历史typed-refs/provider-bodyCPUlegacy drain/物理delete410/content-scrub/cache-actualbackup恢复、工作台/实体初始化/全部73Q与主目标仍open。无commit/push/deploy/cloud/install/trust变更。
