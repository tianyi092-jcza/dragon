# E-04-MONEY-COMPILE-1：资金编译与固定势力表

这是**Web编译表示修复**，不是新增经济公式、异常资金可玩域、完整人物/章初始化或编辑器表单。只改`tools/content_pipeline.py`：F+20..22独立signed24编码，并把同三个byte写入声明槽对应的固定22槽来源；其余未知byte/未公开槽保留。正常规则±655000不是存储夹限。声明势力校验由24改22，与现生产原生初始化器的22槽一致，不激活物理22/23。

后继[三池编译](editor-reserve-compile.md)另补声明槽+04..09六byte同步；本文“三byte/其它字段待审”及287/七门均为资金批次历史，不是当前仅同步money的断言。两切片均不复制整条raw或改变正常规则域。

## 确认的缺口与最小修复

先登记[I/O](editor-local-validation.md#e-04-money-compile-1具名资金原生表先审io)。`money-compile-session-r1/probe-run-r1.json`固定旧285声明源/82Web资产，20章未改完整编译相等；更改具名资金只改变公开faction.raw，固定nativeFactionSlotRaw仍旧。实际`initializeNativeFactionSlots`从固定来源decodeSlot后Object.assign声明视图，观察更改被覆盖；负值原unsigned writer拒收。这是当前工程路径审计，不以它证明原游戏公式。

原宽度/符号已在[资金原证](re-notes-custom-data.md#势力-31-资金与财政状态实锤)及[离线解码](editor-money-import.md)复核。此处signed24整型[-8388608,8388607]只定义三byte表示，拒bool/float/非有限/字符串/out-of-range，不补0、不夹限或变更unsigned其它字段。编译在克隆文档上操作，兼容输入不反写；只复制money三byte进固定表，**不把公开64B raw整条覆盖原生来源**。

`initializeNativeFactionSlots/decodeSlot/rebindNativeFactionViews`原产品代码不改。其它具名势力字段与固定来源仍需各自同步/初始化闭包，不能把资金修复推广为全部字段已闭合。JS GameSource/Trial创作接线和完整可写表单不由本Python适配器修复。

## 实际验证

新`verify_editor_money_compile.py`：current immutable Web manifest/data，不读DOS或SAVE，只调用参数式source_chapter/compile_chapter。20章未改完整输出逐同；70检查包括40次两端资金编辑及10个边界/未知byte夹具，12种坏资金＋第23声明槽共13拒。每次完整compiled与预期只money/money_hi/两raw的三byte差异相等，所有其它原生byte/未公开槽、原作者文档不变；无负值规则执行或默认安装。

新Node门实际调用生产固定表初始化：50候选共22槽money均与三byte一致、声明视图是同表同对象；明确负值/大正值/隐藏未知byte保留，真实JSON冷副本经原rebind再同表，全文相等。只有表初始化/重绑，不是完整prepareScenario/军师/外交/App初始化或冷战役恢复。IDB getter访问0，无Clock/AI/RNG规则推进、profile/网络。

白名单env七focused串行exit0：新Node原生门、新Python-O、既有内容产线（独立OS temp全20章/四季像素相等、坏源不覆盖）、离线资金原证、date-only overlay（owned新目录，不install）、copy-drift、installed来源reader。normal由Node子进程实际执行，-O完整Python结果与其同输入关联另核。287声明源（271Node/12Python/4HTML）及83入口只是库存，**未全83执行**；283旧声明源/82current及archive资产byte同，只有compiler/runner两有界delta+两新测试。没有本阶段运行失败。r1七门通过后把同一22槽错误的包含断言加强为精确全文相等，r2七门重跑；再将内容源/旧Web参照36个实际产线输入补入前后SHA，r3七门全部再运行。各轮保留，不拼接成绩。

`money-compile-session-r1/static-receipt-r1.json`另签源码/语法/七日志/原证输入/owned日期输出/前后SHA与文档、诊断/Jev/HEAD。正确错误文字`is 22`被误判Python身份操作，已精确FP裁决；后继加强为同一错误的精确全文比较，不改期望22/no rule mute。非有限夹具使用math常量。最终主动12路径全部未确认（8MD unavailable/4inconclusive），零诊断不等clean，工具矛盾8clean文字拒；session237files九既有warning包含三个本轮新浮出的旧pipeline路径sink，未更改sink不等安全闭合。

Jev仅3028B人工工程摘要/advisory，preview审阅后固定模型，不发送源数据、夹具、快照或全文日志，不作原机制/运行域/发布授权或目标完成门。完整goal继续；默认/作者来源/旧副本/live/save均未重导入，无commit/push/deploy。
