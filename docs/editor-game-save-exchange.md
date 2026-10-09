# E-08：游戏绑定备份／导入边界（opt-in，未装UI）

`web/src/core/gamesaveexchange.js#createGameSaveExchange({identity,context})`是独立工程输入边界，不是认证、正式发布识别、最新版本确认或删除许可。旧saveexchange、save-manager、v2库、共同snapshot/restore/App/Trial均不改；不把旧档重贴game/release/1.0，不自动迁移或清档。

## 实际合同

- 构造时捕获精确`gameId/releaseId/releaseOrdinal/chapterId/manifestDigest`，按v3 codec验语法；`context`固定data/content/world引用，仍须由未来受信准入adapter提供。对象自称valid、知道tuple或自洽SHA不构成权限，也不证明对应正式release存在。与真实registry/删除/版本管理无接口。
- `encode(record)`先descriptor安全的严格canonical JSON捕获完整v3record，禁止有损值/accessor；核tuple和实际content章索引→chapterId，再走原encodeSaveFile/decodeSaveFile的规则profile、RNG与实际公共detached准备。输出独立`wolong-game-save/version1` envelope，字段只有format/version/rules/bodyText/bodyDigest；SHA256覆盖canonical完整v3正文，不是签名或保密。
- `decode(text)`核64MiB UTF8文件预算、精确外层字段/完整原规则profile、canonical v3/身份/章匹配、正文SHA，之后仍走同公共恢复门。不回退旧format1；旧format1仍由原工具处理。坏/缺身份、规则、能力、RNG、SHA或无法识别的输入拒绝，拒绝没有库/当前App副作用。
- 解码只返回独立captured `{input,origin}`；input仅保存所需7字段及完整snapshot，origin冻结原slot/recordId/writeRevision供信息显示，不授予本地写权。另存由调用者**显式**使用绑定游戏的store及目标槽/CAS；接收store重新生成本地recordId/counter，不继承外来41号写修订。此模块没有IDB、fetch、当前release查找、安装live、delete、迁移或UI。
- 公共准备可能加载本context的固定世界能力/资源缓存，不推进规则/RNG/Clock，不等于对任何章或任意战役可恢复。文件含完整私人存档正文；不发Jev、网络、日志或自动上传。这里未实现文件选择／下载／取消及游戏选择绑定仓储的玩家UI。

## 当前真实成绩与限制

先[I/O登记](editor-local-validation.md#e-08-game-save-exchange-1opt-in备份身份先审io)，新纯门`tools/verify_game_save_exchange.mjs`及只读`tools/gamesavefixture.mjs`使用current八个固定Web输入/四native URL内存映射、真实20章fresh0tick snapshot，own mock两个仓储；global nativeIDB getter拒0、accessor getter0。

- 每章完整snapshot→source仓储revision41→encode/decode→接收仓储新ID/revision1，全文相等；各source记录、接收库其它game同slot与old-v2/slots夹具保留。100个自洽SHA的坏native能力/RNG/错章输入拒绝；20次重复另存明确CAS冲突；其它tuple/外层/SHA/profile/legacy/unsafe字段/64MiB UTF8/有损值/getter/cycle及await前捕获共**148拒收**，原记录/目录/live/Clock/RNG不变，delete0。工程releaseId不是发布认证。
- 白名单env `game-save-exchange-session-r1/run-focused-r1.mjs`实际八项串行exit0：新exchange、真实snapshot20/80、仓储memory7/59、原仓储fresh Chromium两页六组及四旧repository/local-save/transition/Trial门。**浏览器只重验既有store，不是新exchange/UI浏览器接线证书**。
- 新库存79入口/182声明源（171Node/7Python/4HTML），不是新79全轮。旧177仅runner登记两处插入；176旧声明源及82 current/archive Web资产同SHA，旧saveexchange/ruleprofile补计输入但正文不改。新测试初写非async回调内await被syntax检查拒，修回调并包fixture解析异常后才运行；原exact副本及syntax失败日志保留，失败不算通过。
- final同session `static-receipt-r1.json`关联当前语法/八实际日志/收据/输入/旧差异/HEAD/链接/诊断；Jev只人工工程摘要preview后fixed1.13/advisory，不发数据/正文/完整日志，不作为放行或原证。LSP不可用/静默不当clean，正确await括号不改。

[完整工作表](editor-goal-completion.md)与[差距索引](editor-requirements-matrix.md)仍开放：受信发布/current、Q11/Q19左确认右取消/精确删档政策、实际游戏选择仓储和备份UI/共享App、中途完整运行态/全部消费者。底层文件自洽不绕共同准入，也不能绕已删除/下架/版本策略。goal active，无commit/push/deploy。
