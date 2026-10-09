# E-01-BACKEND-PRIVATE-FALLBACK-DECODE-1 — 固定季节整图解码（opt-in）

## 范围

接续[私有字节](editor-backend-private-byte-context.md)、[小图/JSON解码](editor-backend-private-resource-decode.md)，新增`privatefallback.js`，把原小图PNG envelope原样提取到`privatepng.js`共用（只增加明确固定整图分支）。**Root/API/schema/身份授权/原byte协议/已有UI/player/Music/Rule不变**。共有525声明/122imports/375原玩家输入，旧522仅一opt-in源获准提取，其余521输入/119imports保持；原小图4Mi pixels限制与35检查仍在。新模块不装进Root/原编辑UI/player，不能把阶段plan/Job/byte header当RuntimeManifest或Trial/发布/删除放行。

`createPrivateFallbackContext(reference,ports)`调用原`createPrivateByteContext`，只接`private-stage`、四个`fallback-SEASON`与匹配的`fallback_SEASON`（不是report、atlas、任意library或普通图片）。原精确game/savedrevision/source/dependency、UUID/长度≤4MiB/SHA、同源GET/每次实际服务授权与所有await生命周期核验不改。共享envelope的固定分支要求**6144×4096、8bit RGBA/colorType6、不交错**；完整PNG chunk CRC/顺序/palette条件/IDAT/IEND、动画/颜色转换元数据拒收与小图相同。浏览器负责真实DEFLATE/滤波/像素，不另造PNGcodec；envelope可接受有坏DEFLATE的结构，最后必须真实解码成功。

独立预算为**一个owned或pending bitmap**，6144×4096×4=100663296B（96MiB）RGBA；不是原引擎容量扩容、整体浏览器native峰值/CPU/heap硬配额。返回冻结`{image,width,height,dispose}`，dispose幂等仅关闭本机owned ImageBitmap，释放之后下次显式读取重新真实GET；无settled缓存/自动retry。close永久关闭原bytes context与ownedbitmap，late decode回来不交付并关闭新image，cleanup错不掩盖主要拒绝；已暴露/已画/已复制像素仍可读取，不宣称DRM、GC、即时远端撤权或provider正文排空。所有四准入旗标恒false。

## 当前验证（不是全四季/全loader）

- 当前模型31：fakeHTTP/bitmap，故意大IHDR/小IDAT只是**envelope fixture、不是真实大像素**。角色错配/任意library/其它purpose/report提前拒、getter0calls/extra/错误source；错宽高/type/depth/interlace/CRC/缺IEND、原小图仍拒大图；一个owned/pending、dispose/close、lateclosed/revoked/cleanup、badnative dimensions、401/403/409/410/503与失败后必须显式新GET；fake ports不赋服务权限。
- 原小图/JSON模型独立派生入口**35检查全保**，只改相对导入/owned输出/自己source指针；oldtool不改，实际新提取实现跑全35原期待。没有重跑无关游戏、旧six-stage/namespace/wait/UI全套。
- actualnative-r3 **6检查/17Node请求/4browser GET/11报告sourceSHA/17执行前wx**：fresh隔离Chromium/actualRoot KDF/ownedSQLite-R2/loopbackHTTPS8787、正常Source41/库400登记与完整copy、saved1单季spring真实Job/current2。不是fakeGame/snapshot/Job，也不用公共旧整图替代新编译输出。
- Node实际Root产物GET全部PNG长度/SHA与Job描述子一致；独立Python/Pillow解码完整6144×4096 RGBA并核全alpha255。浏览器原字节→native ImageBitmap→64行Canvas条带→全100663296B RGBA SHA**逐byte同Pillow**（不是抽样/epsilon），原SQL全35行/catalog/databaseSize核验只读不变。不等于Rule/Scenario接入、全部四season或透明/色彩配置域通过。
- owned第二bitmap请求在GET前拒；dispose两次只关闭一次、之后显式fresh GET；same当前epoch的永久owned fence在原Stage.read完整返回后植入，Root末检查409、observer恰1 beforebinary/decoder，不是410/cancel/drain。随后实际改密撤旧browsercookie，后续GET401，不绕缓存。零IDB/outside/pageerrors、全4GET；只close本批context/browser/server，不清共享状态。

## 两轮失败只修新增测试

1. native-r1已过normalsetup/Pillow两项、13Node调用，browser `PRIVATE_FALLBACK_ROLE`：新增派生producer改了URL/descriptor却保留`purpose:data`。只改newnative locator到fallback-spring，产品/权限/31模型/35原期待与1800s预算不变。
2. native-r2已过完整像素/预算/旧cookie401五项、17Node调用，晚fence observer期待1实际0。新增producer错误套用库读测试顺序：改密新epoch后旧Job原guard已拒，没到“read返回后”hook；快照/本人库可保留不代表旧Job可读取。**该409body.code没有同期捕获，不能事后冒称native JOB_AUTH_REVOKED响应证据**。只把当前epoch的fence测试提前、之后再改密验证旧cookie401；409/count1/401/其它业务期待、产品/预算均保，完整fresh r3通过。

两轮17源码WX/stdout/stderr/meta/failureJSON/PNG/Pillow partial及postexecution分析分别保，partial不绿色、不拼成绩、不延预算、不改旧fixture/权限/旧工具，不把测试错误写成Root/provider/SLA修复。原派生head/derivation仍原稿，当前差异另独立核。

## 证据和未完成边界

owned `.dragon-analysis/editor-phase/backend-private-fallback-decode-session-r1/`：before按audio abe017ea全SHA核后归档；models、小图回归、三native源码/log、Pillow源码/PNG/stdout-meta、privacy-reviewed Jev、独立static和finish封存。所有执行源码/输出wx、白OSenv+现有MF/OpenSSL/Playwright/Python-Pillow、主1800000ms预算；真实用户SAVE/profile/IDB/秘密/共享清理、云创建deploy/installtrust/commitpush未使用。Jev仅人工审过3338B英文摘要，固定jev-1.13.0/advisoryOnly，未发送资源/源码/完整日志/身份/秘密，不作像素、SQL、原机制或完成oracle。独立static-r1实际核525输入/122imports/375玩家、原envelope提取精确正向等值/当前17执行源与11报告源/31模型和35原期待、失败两源码的仅locator与order差异、10语法/621本地链接/73唯一Q/35actual NodeDDL243列70对象/gitdiff；文档后r2重签。LSP初始7code零诊断但inconclusive7；4auxiliary有3inconclusive和Python ownedCLI oracle一条unchecked-throwing-call-python（pillow.py:5），原报留存，精确标false-positive：缺/坏owned输入应使子进程失败，producer实际断言非零并保stderr，不吞错；仅测试CLI语境、不泛化Python路径例外，未加ignore或改已执行源码。4MD unavailable（marksman/typos ready0/2），sessionall454文件27继承warning/35hint-info，不能称workspaceclean，不ignore/禁rule/清缓存。

尚缺共同角色→实际loader/MapView/directImage/Music及缓存身份接线、RuntimeManifest/profileCertificate/chapterId-slotMap、G127/255/初始化原证、实际认证Trial规则/异步/网络门、publish/listing/registryannouncement、allhistoryrefs/body-providerCPUlegacy-drain/physicaldelete-readback410/scrub-cacheactualbackuprestore与工作台/全部73Q。单季完整像素只是后续有限输入事实，goal active；未知原证不阻止独立低风险工程，也不能以整图尺寸门解除原槽扩容禁区。
