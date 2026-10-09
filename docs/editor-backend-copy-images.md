# 固定副本受权图像生产（限定内存规划器）

范围`E-01-BACKEND-COPY-IMAGES-1`。从[PNG I/O](editor-backend-png-io.md)与[实际资料编译](editor-backend-data-compile.md)继续，新增`server/copyimages.js#FixedCopyImages`，没有修改420既有输入、Root、持久Job、UI或玩家。不是完整编译器、任意作者素材上传、持久图像任务或运行证书。完整goal仍active；公共compile仍404。

后继[packed索引补齐](editor-backend-indexed-png.md)将现行planner推进`fixed-copy-images-2-indexed124`及PNG2，六PNG字节与此轮产物保持相同；下文`fixed-copy-images-1`是历史compiler而非当前值。报告schema及权限结构保持，旧Job不得重贴新pipeline。后继Root／持久Job接线另见[阶段API](editor-backend-stage-api.md)，本页原轮范围不扩大。

## 实际来源与身份链

构造端口是服务内部的真实SQL、principal、GameMetadataStore、PrivateDrafts、InstalledSourceCatalog和品牌固定policy，不接受客户端声明或DTO代替。

1. 当前真实管理员会话且非强制改密，游戏UUID属于本人；内置拒、其他账户不能借管理员目录读图。当前来源目录本来要求管理员，本切片不冒充管理员或拓宽目录权限。
2. 明确已保存修订经`PrivateDrafts.captureForCompile`：实际SQL不可变引用、全部源块/总SHA、immutable baseline、固定profile与definition重新验证；四资源表示安全仍非可玩域。
3. 同SQL `copy_origins`与服务品牌policy/definition绑定，owner/epoch、registry/profile/definition、完整origin与准确snapshotReference前后复查。
4. `InstalledSourceCatalog.loadFull`实际重读41角色约57MB，逐块/全角色SHA、服务policy、注册SQL与每个await的主体复查；来源捕获品牌不能由JSON恢复。四atlas路径只从服务policy的固定revision构造，不从请求、sourceRef或作者文字选URL。
5. 真正共同`compileGameSource`在该准确源重新运行，其sourceDigest须等于实际不可变引用。两个小地图用同一`renderMinimapPixels`、共享`MINIMAP_SIZES`/style及既有seed1，既有原图制作入口同seed；没有第二算法或新视觉决定。
6. 返回的内存plan仅可由本实例、原tokenHash及当前有效SQL/来源上下文读取。`assert`再核上下文和每个产物完整SHA；复制DTO或新会话不恢复它。重启品牌丢失；缓存不是持久grant/Job/发布收据。SQL与源缓存校验不冒每次assert重新网络读取全部已捕获R2；新capture重新读取全部来源。

`isInstalledSourcePolicy`源见`server/sourcecatalogpolicy.js`；完整源与profile、目录规则分别维护于[私有草稿](editor-backend-private-draft.md)、[来源目录](editor-backend-source-catalog.md)。机制没有新增或公式推断。

## 六个实际图像产物

| assetId | 尺寸 | 来源／处理 |
| --- | --- | --- |
| atlas_spring/summer/autumn/winter | 各256×256 | 固定目录实际PNG → 严格raw-sample RGBA解码 → 新RGBA PNG；完整像素不变，编码字节可不同 |
| minimap_base | 208×139 | 准确共同编译的minimapGeography/roadMask，共享seed1算法→RGB PNG |
| minimap_large | 250×167 | 同上 |

`dragon-fixed-copy-images-1`报告绑定game/revision/source/dependency/registry/definition/catalog root、`fixed-copy-images-1`/PNG/style/seed及每个产物尺寸、字节长度/PNG SHA和RGBA pixelSHA。`admission=bounded-images-only`，显式missing：`full-map-fallback`、`complete-runtime-dependencies`、`runtime-admission`、`persistent-image-job`。没有valid、RuntimeManifest、Trial或Release。

PNG适配器的4Mi pixels、16MiB等预算不变，仍明确不支持6144×4096整图回退、色彩管理/动画或未支持位深/交错；不是云内存/CPU/SLA证明。六图的成功不推广到全部素材、头像G127/255或Q69闭包。

## 当前实际验证

`tools/verify_editor_backend_copy_images.mjs`显式入口；ignored `backend-copy-images-session-r1/fixture-worker.js`继承真实Root，以实际会话、Origin/CSRF、同SQL/R2与内部端口运行。工程随机秘密仅内存/owned绑定，loopback HTTPS8787、已装MF/OpenSSL/Pillow，无浏览器/用户IDB/DOS SAVE/云操作。

最终images-r2八组48实际HTTPS请求／六新PNG独立Pillow像素对拍：

- 本人管理员/401/author403/builtin403/非法和缺失game/revision/self-valid拒；没有请求路径或DTO授权。
- 四atlas与两共同mini pixelSHA等于固定原包，六新产物由`tools/verify_editor_copy_images_oracle.py`独立Pillow读取，来源/输出尺寸、RGBA像素及完整长度/SHA对拍。codec压缩字节不同不是像素变化。
- 实际新登录的同owner不能获取原token的临时plan；任意asset选择不授权。structuredClone/JSON不能复制品牌，plan中byte突变503，无共享来源暗修。
- 实际保存draft2后仍捕获requested1：sourceDigest/全部六描述符保1，不latest回退；图像读取不修改game.modifiedAt。
- 实际SQL origin.definition破坏409；fixture仅在owned原生R2对固定atlas同size翻一byte，新capture `SOURCE_OBJECT_CORRUPT`503。只有明确fixture恢复原始bytes，不伪称服务自动repair或rollback。
- 固定来源atlas的原生R2 get已实际返回object后受控等待；实际改密撤epoch，释放后旧读取401，不能产生/缓存新plan，新会话不能复活旧plan。
- 实际服务关闭/同SQL-R2重启后旧plan404，公开生产compiler404保持。

初轮images-r1六组39请求通过；保producer和六图片，之后只新增同owner新会话与saved2/requested1覆盖，r2八组通过，不重跑碰运气。图像HTTP切片没有失败轮或期待放宽。只有ignored夹具能hold/变异/恢复，生产没有测试开关。

独立Pillow取图器审阅发现真实目录逃逸缺口：原实现仅约束文件留在base，却未约束base解析后留在仓库。已增加`base.resolve(strict=True).is_relative_to(ROOT)`，同时保留文件留在base的检查。`verify-oracle-guard.mjs`使用自有OS临时目录、六张原HTTP产物副本和owned目录junction负控：原代码能读到六张仓库外测试图，新代码在`Image.open`前明确拒绝`owned directory escape`；加固后对既有images-r2六图再运行Pillow，尺寸／pixelSHA全部不变。原producer和取图器保留，不伪称旧HTTP使用了新源码，也不重复整个HTTP流程。

## 静态、诊断与未完成

本批保护420旧声明（375玩家）并新增三个产品/测试源为423。源码/产物/日志/原producer、imports/语法、文档链接/73Q及诊断分开封存。实际执行不是LSP空缓存的推论；inconclusive/unavailable不称clean，精确native Request URL规则误报只记录裁决，不关规则。取图器原路径缺口不是误报，实际修复与junction负控另有证据；加固后通用路径规则仍报告开图行21时，仅按实测ROOT/base双重约束裁决当前精确误报，不撤销旧问题、不冒整个workspace clean。

后继仍须持久image Job/不可变产物引用和checkpoint恢复、真正公开受权compiler、全部依赖/大图/头像消费者与Q69、完整工作台/初态原证、Trial、发布/玩家/存档/物理删除/备份全链。此规划器不关闭E-01/E-06或主目标；不需要重复已闭合地图视觉验收、账户/复制或独立PNG基础。没有commit/push/部署/云资源/依赖安装/全局信任/共享清理。
