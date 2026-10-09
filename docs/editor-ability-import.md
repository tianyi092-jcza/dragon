# E-04-ABILITY-DECODE-1：离线能力全byte保真

仅纠正`tools/parse_sinario.py#parse_scenario`：武术`+11`、统率`+12`、政治`+13`直接取byte，不再`&0F`。专长`+0E..10`仍只解高四位；不增加原记录字段、补低位/未知、修改公式、任官/新章初始化或运行准入。**默认包、作者来源、旧副本、App、规则、存档均未重导入或热换。** 这不是可写人物库、完整G-INIT或“255能力都安全”。

## 可复核原证与边界

唯一详细原字段维护源[实体§3.4](re-notes-entity-fields.md#武将-34-全字节能力读与高半字节unused的冲突)。固定KI SHA `fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`、MZ512：`45D9/45DE`比较/取全武力byte，`3811/3816`政治byte，`52E7`word DL/DH映射11/12，`5304`再读统率byte；`9C29/9C2C`战术读取11/12；`41C2/41C6`政治/武力byte；`3EAC/3EC4`政治byte；`77B6/77C6/77D6`三能力显示全byte。新门直接核上述15签名及五原SINARIO固定SHA；General32文件`42C0+32*slot`与载入DS`4240`（文件状态从80起）的偏移一致。此为**实锤的保存原字节宽度依据**，不是所有结果/随机消费/高值除法安全证明；既有字节回绕及未知合法域继续拒未经确认的扩值机制。

owned `ability-decode-session-r1/audit-r2.py/log`只解指令，未执行KI。r1两个展示窗口起点误落前一条指令中段，仅audit，未作签名/机制结论；r2从已知41BE/77B6边界开始。Capstone近call可能显示32位符号扩展，不能将其文字当16位IP目标；本批签名只取字节读取指令，不认证新增调用图。两个audit原字节和脚本均保留。

## 实际验证

[I/O先登记](editor-local-validation.md#e-04-ability-decode-1离线全byte先审io)，新`verify_editor_ability_import.py`normal及`-O`均通过：20章/2560记录逐原byte，原样本能力均≤15，结合唯一三字段有界差异证明这些章原解析输出未改变。内存夹具1536单byte（槽0与127、三字段各0..255）、256联合不同byte、768专长高nibble检查，**其它完整解析输出与原章baseline相等**；旧mask只是明确投影参照，不执行旧源码。输入高值不进入正式游戏，G127只作原槽字节保真，不开放新增普通将。

下库88830B末章少2B保持原短尾，全部general完整；仅调用parse_scenario，未调用会补尾的read_scenarios或覆写Web的main。当轮原资金unsigned、城200上界/空名break/其它raw遗漏保持，不借该批暗修；后继[资金专项](editor-money-import.md)另修离线signed24，默认/编译域仍不改。

六focused白名单环境串行全部exit0：新normal/-O、原实体9固定输入85签名/官方512将768城、date-only独立输出（20章120header/7日期签名）、copy-drift3840城、installed实体三Web资源20章及5坏缺拒。后一日期门仅owned overlay，不安装。无浏览器/UI/游戏规则变更，故不跑无关浏览器或全81。284声明源码是库存（270Node/10Python/4HTML），不是81全轮；两既有Python补声明不是新产品。

静态`ability-decode-session-r1/static-receipt-r1.json`绑定281旧源中279不变、parser/runner内存逆delta、82默认/归档Web资产、六实际日志/新date产物、原只读输入、文档/技能、当前producer/HEAD与诊断。首次新测试拟用exec重建旧decoder，主动诊断发现动态执行/类型问题后，在运行前移除，保exact草稿；改投影与完整baseline比较，不禁规则。原证确定字宽与受控输入保真直接闭合，无公式/runtime/UI变更，本批未调用Jev推断机制。主动12路径全部未确认（9MD unavailable/3inconclusive），零诊断不是clean；session229文件13既有warning保留，不禁规则或清缓存。完整目标仍active，原可写实体/初始化/安全域/后台缺口继续开放，无commit/push/deploy。
