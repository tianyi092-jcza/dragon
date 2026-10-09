# E-01-BACKEND-PRIVATE-RESOURCE-DECODE-1 — opt-in私有JSON/PNG解码

## 范围与输入

承接[私有字节桥](editor-backend-private-byte-context.md)，新增`web/src/content/privateresources.js#createPrivateResourceContext`和`tools/verify_editor_private_resources.mjs`。**现Root、所有API/Stage断言、bytecontext、schema、旧工具、全部375已有玩家输入与UI均不改**；不装现App、工作台或Trial，不发RuntimeManifest/Profile/slotMap证书。现字节桥仍是每次同源Cookie GET/准确saved game-revision-source-dependency/长度SHA，真实服务为权限权威。

`reference`交原bytecontext精确字段校验；locator以own enumerable data descriptors捕获，不执行getter、不保调用者可变别名。解码接口只`readJSON(locator)`、`readPNG(locator)`、`close()`，mode private-resources-1/four permission fields均false。只有新内部decoder依赖bytecontext，不能把ImageBitmap/已读字节/生命周期callback当原始作者/服务权限。请求/字段/locator/hash结构本身不授权。

### JSON

原byteGET与SHA成功后，fatal UTF8（BOM保留导致JSON拒）→JSON.parse→有限数字/32深度/200000 value预算→逐层freeze→最后生命周期重核。最多4MiB压根locator在GET前拒；这是工程界，不是全章容量或heap/CPU/provider SLA。每次读取新请求，无settled JSON缓存；同await byte单飞仍原规则，但解析各自生成独立冻结对象。

**只解析数据**，不eval、不Object.assign到状态、不解释内容初始化/道路规则、不读取存档或安装Scenario。`__proto__/constructor`保为inert own data、不改原型；duplicate-key遵循JS JSON.parse而非新author规范，浮点/整数表示不作原版字段准入。领域schema、身份、固定槽、Rule支持域和源语义仍须共同validator另核，不能用JSON通过替代它们。

### PNG / owned ImageBitmap

现标准浏览器`createImageBitmap(Blob)`解码，options premultiplyAlpha:none/colorSpaceConversion:none/imageOrientation:none；不构造公共Image.src、SVG、objectURL或另一个PNG像素解码器。解码前只做**envelope preflight**：signature/4096chunk/CRC/顺序/完整IEND，raw8或indexed1/2/4 noninterlaced、PLTE/tRNS类型长度/animation及color-transform metadata拒；DEFLATE、filter、palette像素等仍由原生浏览器decoder决定，不假称preflight是完整PNGvalidator。

工程界延续现[bounded PNG adapter](editor-backend-png-io.md)：8192单边、4Mi pixels，最多八个pending＋owned handles，budget在新PNG byte GET前核。**6144×4096四季整图不在本decoder域**；不能为全manifest凑数放宽，也不能把小portrait测试扩成全部394PNG/透明/颜色档案认证。PNGbytes原4/16MiB限制不变。

原byte await与bitmap await前后均本机lifecycle检查；header宽高与实际bitmap一致才返回冻结`{image,width,height,dispose}`。每次调用独立image/无settled bitmap缓存；dispose幂等且只清owned handle，contextclose永久阻新读并关闭已有bitmap。关闭/换代后晚到bitmap也关闭；次生close异常不覆盖原decoder/生命周期错误。已暴露的CanvasImageSource仍可被调用者缓存、绘制或复制，**不保证GC、DRM、已画像素抹除、服务revocation即时冻结或provider排空**，实际Trial尚需全mutating/async/网络入口接线。

## 验证与限定证据

owned `.dragon-analysis/editor-phase/backend-private-resource-decode-session-r1/`先核f7a948fa全部input-source-import-history-failure-doc-executionSHA、wx归档三旧doc再登记I/O，产品两新文件不覆盖旧源。native fixture仅向隔离浏览器提供两新/旧byte ES镜像，真实API delegation与sealed StageAssetApiFixture不变；同源opaqueCookie来自owned真实Root，绝非用户profile。

### actual native-r2：7检查/17Node控制/6browserGET

- 正常actual KDF/admin必改密、41 Source与400库角色登记/fullcopy、真实dataJob29输出/saved1，随后合法metadata save2；无fake Game/工程snapshot/Job父或发布捷径。
- Chromium准确saved1 roads_0成功byteSHA/fatalUTF8/JSON/deepfreeze，192节点/version2、重编码共享canonicalSourceTokens的语义SHA恰等真实产物；**没有调用原寻径、fresh初始化或安装道路图**。
- 库kao/0.png真实privateGET后PNG preflight/nativeBitmap/Canvas draw；原资源SHA与实际descriptor一致，全部不透明RGBA逐像素SHA同既有Node PNG codec，128×128。不据此判G127/255可达、透明像素或所有PNG表现。
- 三成功读（含第二JSON真实网络GET）前后全35SQL rows/catalog/databaseSize指纹一致，不跨实际password/fence修改段做“无写”比较。
- fabricatedsource+匹配改造locator的合法本人库GET200由旧byte header拒、**不是额外HTTP权限漏洞**；实际password handler撤旧cookie→JSON GET401，新cookie下native永久fence在真实库all400/fullsource返回后→PNG GET409，beforebytes/decoder/count1，非410/cancel/provider drain。
- IDB/outside/unexpectedpage errors0；读都GET；只关自建browser/server。14源码执行前wx与8reportSHA，原1800s/白OSenvMF-OpenSSL-Playwright；r1已经passed，sessionall发现newmodule owned Set清理loop多余spread后仅改直接迭代删除owned元素、模型工具加round输出参数，old r1 wx源保；镜像同步后r2 fullfresh相同七条全部通过，model相同35。无native/model失败或预算延长，不重复六stage/namespace/wait/UI全套。

### model-r2：35 checks

fakeHTTP/lifecycle/bitmap ports，不代nativeRoot/browser/pixels/权限。UTF8/BOM/语法/nonfinite/depth/node/locator-getter0calls、JSON freeze/每次GET、PNG signature/CRC/format/pixel/metadata/IEND/decode失败、8handles/幂等dispose/close及bitmap await晚到清理/次生cleanup首错保护，JSON特殊属性不污染原型，各分支有证。三个执行前wx源/model stdouterr/meta保；无失败。初稿JSON.parse测试flag只改为本地明确expected对象；Buffer.slice alias草稿在执行前改Uint8Array独立输入，避免负控污染后续样本；未放宽产品权限/预算/期望，也未虚构failedrun。

## 静态、advisory及后续

新模块+工具520inputs119imports375player，所有旧518/118精确SHA保护；独立static-r1已核执行捕获/report/model源码/镜像SHA、仅新模块opt-in import graph、73唯一Q/35actual Node CREATE与243 table_xinfo列70对象、**7语法/611本地链接/gitdiff/HEAD20692d7**，文档后static-r2独立重签。旧r1源码只新cleanup loop与round输出参数差异，currentr2 native/model源码全部逐项核，没有选择性拼旧成功；两轮全部7/35相同，生产byte-root权限不漂移。

主动5执行代码及2collector/advisory代码零diagnostic但全部inconclusive/confirmedClean0；四MD unavailable（marksman/typos ready0/2）。sessionall曾446文件28warning含该新spread，最小修后447文件只27 inheritedwarning/35hint-info（14console/5duplicate/7Pythonpath/1structuredClone）。最终3代码主动batch零diagnostic、实际1clean/2inconclusive，不猜clean具体路径，不把局部batch或便捷clean提示/空cache作workspace clean。未ignore/rule-disable/cacheclear。Jev人工**3926B**最小英文摘要审preview后固定jev-1.13.0 advisoryOnly，无源码/资源/私有ID/秘密/完整日志，内外wrapper仅OS白名单及所需key；不是SQL/status/pixel/原机制/goal oracle。

全部435role实际选择/共同world道路loader/30 loadImage及直接MapView/disaster/Music/context-cache/authTrial、完整RuntimeManifest/profilecert/chapterId-slotMap、255/G127原证初始化、发布上下架registry/公告、allhistory refs/body-providerCPUlegacy-drain/physicaldelete410-scrub-cacheactualbackuprestore、工作台与全部73Q仍open。此轮是decoded resource ownership与同源输入基础，不是运行放行。无commit-push-deploy/cloud-installtrust/真实SAVE-profile-IDB/共享清理，goal active。
