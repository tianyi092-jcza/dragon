# E-04-MONEY-DECODE-1：离线资金signed24保真

仅修`tools/parse_sinario.py#parse_scenario`的具名money：`int.from_bytes(f[20:23], little, signed=True)`，即`u=loWord+(hiByte<<16); u>=800000h ? u-1000000h : u`。原money_hi仍是原高byte，faction.raw/nativeFactionSlotRaw仍保原记录；**不夹限、不改预算/费用/AI公式、其它解析字段或compiler。** 默认包/作者来源/旧副本/运行局/存档均未重导入。负值输入不是完整实体、空章初始化或任意负值运行域的授权。

## 原始证据与可复核范围

原机制详细源仍为[势力资金§3.1](re-notes-custom-data.md#势力-31-资金与财政状态实锤)。固定KI SHA `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，MZ512；本次重新核`560B/560E`word+byte、`563D/5640`word减/byte借位与两高byte比较，显示`6851 8A4422`取高byte、`6854 98`、`6855 8BD0`、`6857 8B4420`组成有符号DX:AX。正式门直接比较10签名；它们支持**实锤的解码宽度/符号**，不新认证全部入口、夹限条件/RNG或异常输入算术。文件势力区80h+槽×40h，20..22三byte完整。

owned `money-decode-session-r1/audit-r1.py/log`只读指令/原记录，不执行KI。Capstone5.0.7以16位模式仍把单byte98打印为cwde；此处无66前缀，16位语义为CBW，必须以原字节/寄存器宽度判断，不能把展示文字当CPU执行证据。原收据保留该文字，不隐藏它或改工具来制造一致性。

## 实际验证与限制

[I/O先登记](editor-local-validation.md#e-04-money-decode-1离线signed24先审io)。五固定SHA SINARIO/20章：前22正常物理槽共440条三资金byte均无signbit；公开声明范围仅228条，不能把其余物理记录扩成公开势力。新decoder具名money/money_hi与原三byte逐同，完整解析结果和旧unsigned**投影**相等；没有执行重建的旧源码。少尾下库88830B保持原短，未调用补尾read_scenarios或覆写Web的main。

内存夹具1536单byte（首/末公开槽×20..22各256）、30有符号边界（含−8388608/8388607、−1、±655000及±655001）、256组22槽同时不同byte；完整解析输出仅指定资金/raw字节与其具名money/money_hi改变，全其它baseline逐同，money转回原3byte逐同，未将±655000当解码夹限。未进入编译或游戏，不作负金全消费者/除法/发布安全域证明。

白名单env六focused串行exit0：新normal及-O完全同JSON、既有能力normal、原实体9固定输入85签名/官方512将768城、copy-drift20章3840城、installed作者源20章/5坏缺拒。确定的位宽/符号修复不使用Jev推机制。没有UI/引擎/调度变化，故不跑无关浏览器或全部82库存。初新测试的Python导入/同列语句诊断在执行前定点修复，不禁规则。主动12路径全部未确认（9MD unavailable/3inconclusive），零诊断不是clean，矛盾工具9clean文字不采；session229文件11既有warning（2parser路径/4旧重复/5原MD锚点）保留，不清缓存。

285声明源（270Node/11Python/4HTML）只是库存；其中282旧源byte同，仅parser/runner两有界delta、一新Python门。静态`money-decode-session-r1/static-receipt-r1.json`绑定实际六日志/原输入/完整语法/82当前与归档Web资产/文档技能/HEAD和诊断，旧能力证据仍历史保留。

本轮封存时`content_pipeline.put`仍按unsigned域编码，负money编译策略未修。随后[资金编译专项](editor-money-compile.md)独立signed24写入并同步固定来源三byte，默认包不改；不能把任一底层切片称负资金正式编辑/完整运行闭环。现20章没有触及signbit，默认包不需为本修复重编。城200上界、空名break、其它raw/计数/初始化及真实后台仍按原缺口处理，完整goal保持active，无commit/push/deploy。
