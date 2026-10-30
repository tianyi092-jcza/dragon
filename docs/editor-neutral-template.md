# 中立作者草稿：创建、保存与原操作恢复

## 合同与边界

依据产品Q28及开发待办H的作者新建“第一章＋公共基础地图”决定，中立创作起点不能以管理员完整20章副本代替。初次内容基线完成时，互联网作者入口仍错误地使用完整投影；本后继已接通作者创建、精确读取／保存与工作台。**仅完成可保存的中立创作起点，不报A06/E-10完整完成**：人物／势力及可玩初始化、地图编辑、Trial到发布玩家链仍有缺口。

这是已批准的Web作者结构，不是原版初始化规则。没有填0／FF／50、发明原生默认记录，也没有放宽Trial或发布门。

## 内容与来源

- `tools/editor_trusted_copy.mjs` 的受信构造参数 `kind` 默认为既有`full`，另有`minimal`。两种投影仍读取并校验同一组41个固定实际输入，不换库身份或跟随最新版。
- minimal复用 `copyBuiltinGame(kind: minimal)`，保留地图、道路、组件和192个公共据点定义；不复制原人物字典、人物槽绑定、剧本ID映射或 `sourceRecords`。再复用章结构writer创建“第一章”：仅空 `factions/generals/cities`，无原生记录／兼容字段默认值。基线名称“新遊戲”是有效占位，保存源采用已经验证的作者名称／简介。
- 独立内容profile为 `fixed-template-authoring-1`；完整副本仍为 `fixed-copy-resources-1`。两者分别核 `sourceRef.kind`，不允许把完整副本冒充模板或反之。空章没有原生势力表时不对undefined建立WeakMap项；完整形状比较仍拒绝擅加原生表、人物、势力和改地图。

## 实际服务接线

- Root的 `POST /api/games` 只接受作者名称／简介，服务自行选择受信模板profile；管理员完整复制仍走原管理员API及20章投影。客户端不能指定profile、目标ID或来源registry。
- `AdminFullCopy` 复用原请求摘要、租约、私有capability、不可变写入和同SQL提交，但新请求固定为各受信实例的profile。旧请求按**其已存profile**核原摘要，不修改旧键／摘要。模板服务可查询旧已提交完整副本；旧pending/running完整复制不能被claim成模板（`COPY_PROFILE_CHANGED`），仍可显式取消。没有把旧请求悄悄重解释。
- 源目录新增受信、只读的author端口，仅供创建内部读取同一已安装来源；不能install。公开管理员源端口仍只允许管理员。每次await后的actor/epoch/来源捕获复核保留。
- Root的分配解析先识别管理员cap；只有确实不属于该实例的 `COPY_LEASE_REQUIRED` 才尝试作者实例，不能把已识别cap的撤销／过期错误当作另一类权限。
- `PrivateDrafts` 从存储的实际基线重建精确profile，仍验证固定来源、baseline/source摘要、对象和历史；DTO返回实际profile。资料控制器只额外识别该明确模板标识，不接受任意profile字符串。
- 无SQL DDL、固定库身份或运行许可变化。

## 工作台

`建立遊戲／完整副本` 对作者、管理员均可见。作者看到中立新建说明和空白首章限制，管理员看到完整副本；作者不能调用来源查看／安装动作。角色来自当前会话而非作者输入。预约、执行、查询、取消分开；作者使用 `/api/games` 及 `/api/games/create/:key`，不借用管理员API。

名称／简介在创建原键前校验trim/NFC后的8／20码点，保留作者原文字。未知回应保留原键，必须显式查询，不能另建或自动重试。取消／清除本机追踪的确认返回后重新核身份与原操作，不能误清另一会话的关联。完成创建不表示可玩；跳到草稿仍须明确读取修订。

## 可复核验证

日志位于 `.dragon-analysis/editor-completion/`，除明确指出外均为本次实际执行：

1. 初始内容测试 `template-profile-r3.log` 8组、完整20章回归 `template-full-profile-r1.log`，仅证明内容层。后继 `verify_editor_template_profile.mjs` 为9组（`template-profile-wired.log`），另核完整profile不能捕获模板；完整20章／2540来源记录／41输入／78拒收回归再次通过（`template-full-profile-wired.log`）。保存门允许空章，active仍有两项固定实体数缺口及Q40无势力。
2. `verify_editor_template_root.mjs`：`template-root-r4.log` **10组**，实际共同Root Request、文件SQLite/FileBucket及固定41输入，seeded会话而非真实登录。作者只读源端口不能install；首次对象读取时撤销立即终止；创建重放／拒绝作者指定profile／管理员或异作者越权；真实执行、读取、元资料与章操作保存、CAS；profile篡改拒绝；实际管理员20章复制、旧完整副本回执与旧pending禁止重解释、重启读取。空模板Trial返回409、发布422，无Trial会话或正式版写入。r1先发现源端口仍管理员限定的真实缺口；r2仅测试误写Trial错误码，修为实际 `TRIAL_SNAPSHOT_CHANGED`；r3先过8组，r4包含后补保护。
3. `verify_author_create.mjs` 预约检查、资料控制器37组、复制控制器12组通过；后者含作者API路径、原键恢复、无管理员动作及确认期身份变化。shell65、schema23来源／50表／49索引／343列／4外键通过，未改schema。
4. 展示层build/check通过；`verify_editor_workbench_browser.mjs` **71项**（`template-workbench-r2.log`，`run-07riem`）。真实gateway/Vue＋显式API夹具，作者可见创建页、来源按钮禁用、导航不自动请求；不作为服务授权证据。
5. **真实HTTPS界面链** `verify_editor_template_browser.mjs r4`：5个范围组（`template-browser-r4.log`；产物 `.dragon-analysis/editor-phase/template-browser-r4/receipt.json` 和 `template.png`）。实际Node Root、SQLite/FileBucket、自有HTTPS、全新Chromium；真实作者登录／首次改密；预约及执行实际提交，但故意丢弃run回应，原键GET恢复而无第二次create/run；读取第一章空人物／势力／城市状态和192公共据点定义、3项active缺口；元资料CAS1→2及重新加载后精确读取2；管理员不能编辑作者草稿。作者浏览器管理员请求、正式IDB访问、域外请求和非预期错误均为0。r1发现菜单仍管理员限定，r2发现组件仍隐藏，两处实际接线均修复；r3错误假设重载必回草稿，实际上保留`#copy`，测试改为显式查原回执、再跳转和读取，未改产品导航语义。三次失败不记通过。

语法和diff检查通过。主动LSP覆盖15个JS/Vue：5份clean、5份有诊断、5份push-only未确认；client/draft文本模块无LSP，文档为1份clean和两项SHA词典信息。诊断包括既有drafts警告，以及复制控制器／测试的嵌套三元style警告和正确await括号提示。session全量缓存93文件仍19项warning、23项hint/info，未屏蔽或称全仓clean。

真实浏览器没有试玩、发布、外网云服务或生产操作；其成功不替代可玩初始化／完整资源闭包。旧作者副本未迁移；新内容profile及来源role权限亦不能当作原版机制证明。仍须继续完整实体创作、规则原证、地图编辑及E-10全链。

后继中立人物姓名／字／共享画像的API与表单已接线，`template-browser-r6`保留上述创建链并扩至8组真实HTTPS验证；只允许所有章节明确无引用的基础定义CRUD，未生成运行槽。详细原键恢复、同名独立ID、删除限制与当前证据统一见[人物基础定义](editor-general-definitions.md)，不能据此关闭可玩初始化出口。
