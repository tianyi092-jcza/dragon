# E-04-FACTION-CONSISTENCY-1：势力双来源一致性拒收

仅Python `content_pipeline.compile_chapter`的工程保护。该适配器已编码的非资源字段，若与同槽固定`nativeFactionSlotRaw`不一致，明确拒编译，而不是成功输出随后被fresh覆盖的值。**不批量同步角色/计数/策略、不猜任免初始化**；资金三byte与预备池六byte的既有同步保持。默认/原件/旧副本/live/save/App/规则/JS作者路径不改，无commit/push/deploy。

## 确认的Web缺口

[I/O先登记](editor-local-validation.md#e-04-faction-consistency-1双来源一致性先审io)。owned `faction-consistency-session-r1/audit.json`保护此前289源/82资产，20章原输出相等，20×14个首槽编辑使公开编码byte改变、固定raw仍旧。`nativefactions.js#initializeNativeFactionSlots`固定source.map(decodeSlot)后Object.assign覆盖声明视图；这是Web消费边界，不是原机制/角色可玩证据。

守卫比较本适配器已经回写的14个byte：+00/+01/+02/+03、+16/+17/+18/+19、+1D/+1E/+23/+28/+2A/+3E。覆盖attr/君主/军师/首都、两个策略城市、既有NPC军师计数派生byte、目标/士气/对白/城数/好战/外交官/标识。+18仍使用本来已有的n_generals＋advisor_count编码，不新增计数公式或实锤声明。错误明确槽号、偏移和初始化编辑不支持；输入/兼容区未写。

一致只证明两份编码没有在该接缝分叉，**不是改君主/军师/首都/计数等的许可或完整初始化门**；手动同时改两来源不能据此宣称合法游戏。未编码的n_legions/monthly_reserve_upkeep等不在此14byte比较，其它引用/初始化仍须共同校验与原证，不冒全势力schema。未知byte不作全记录等值比较，不整条64B覆写、不补零、未公开槽保留。

## 实际验证与限制

- 新固定Python门不接路径/命令，只current Web manifest/data与参数API。20章未改全文相等；首/末声明槽×14字段×具名/固定来源两个方向×20章，共1120精确拒收且源/兼容区保持。未知+0B/+2B/+30分别在公开和固定来源保不同值，不能借一致性校验擦掉或禁用未知；既有money=-1与三池联合编码继续同其它全文，合60正向检查。边界仅表示夹具，未执行角色/异常资源规则。
- normal/-O完整收据逐同，显式七focused全部exit0：新两门、reserve-native162/33与142表初始化cold、money-native70/13与50cold、内容产线20章/四季像素/坏源不覆旧输出、copy-drift、installed实体来源。没有新App/浏览器或角色变更执行成绩，不拼旧七门。
- 85入口/290源码（272Node/14Python/4HTML）只是库存，未全85轮。287旧声明源byte同，只有compiler/runner两个有界delta和一新Python门；82当前/归档资产、36产线输入/原始输入前后SHA。新详细静态收据关联当轮日志、audit、源码、链接/诊断和HEAD，旧收据/失败历史保留。
- 本轮是编码一致性拒收，不产生新的原版机制结论；宽度/角色来源仍以[原字段维护源](re-notes-custom-data.md)及[实体字段](re-notes-entity-fields.md)为准。Jev仅3036B人工工程摘要经preview/fixed1.13/advisory，不传原资源/快照/正文/全文日志，不作规则、许可或完成门。主动9路径0clean/0诊断/6MD unavailable/3inconclusive，全部未确认；矛盾工具6clean文字拒。session243files九旧path/duplicate/已裁决JSON建议warning，无新blocking，不清cache/禁rule，缓存缺项不等修复。

完整可写实体/继承/角色引用/初始化、其它字段写集、JS创作接线、真正后台与完整goal仍开放；这项拒收不能代替它们。
