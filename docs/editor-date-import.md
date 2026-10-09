# 已证日期解码纠错：历史离线阶段与后续采纳

**最新状态：已由[受控日期采纳](editor-date-adoption.md)安装新默认47e358…，新游戏/新副本264/266；旧副本仍固定8/10及旧来源，未热换。** 以下IMPORT/CANDIDATE/APP段分别是当时封存的focused证据，不用旧输入SHA冒充采纳后的当前工具。

## 原始依据与本次修改

日期主证据维护于[头部/时序原证](re-notes-custom-data.md)。本轮实际固定只读KI完整SHA`fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868`，再次核指令byte：`1D9C A1F00C`/`1D9F 3AC4`/`1DD7 FE06F00C`使用CF0日，头+03为hour；`1DAA 813EF60CE803`/`1DB2 C706F60CE603`/`1DB8 FF06F60C`为CF6年word；`8C62 8B4406`以头+06 word读年份。原header+00/day、+04/month、+06..07/year与这些指令相合，不用Web测试或观察证明位宽。

`tools/parse_sinario.py#parse_scenario`仅改两个解码来源：day从03改00、year从低byte改little-endian u16。没有改1000年后的原时序/999重置机制、月份推进、能力/资金/人数、默认值或隐藏兼容字节，也没有调用有覆盖输出的parser.main。

## 受控新目录，非整个重新导入认证

[最终实际收据](../.dragon-analysis/editor-phase/date-import-r2/receipt.json)由`tools/verify_editor_date_import.py date-import-r2`生成（显式`-X utf8 -B -O`验证安全校验不被优化撤掉）。r1历史收据保留：发现writer使用assert可能在-O丢身份/路径/原SHA校验后，改为显式require/异常，不变期望；最终r2两输出逐byte同r1，并实测-O非法round拒绝、无越界输出。只读取固定五个SINARIO整SHA/KI/current Web data.json及3个明确模块，输入前后SHA同；不读真实SAVE/profile/网络，不运行KI/DOS，不调用旧read_scenarios（其补尾逻辑未获本轮放行）。

- 实际20章原日期逐条核同；与现Web数据仅idx14/15年8→264、10→266，全部其它字段复制保持，原日/hour初值恰相同不证明旧映射正确。
- 120个内存header单变量检查：日9/hour3/month2、年0/255/256/999/1000/65535，证明解码不混日/hour且保u16高byte；不宣称这些header全部能作为可运行章节、不测试新的日历公式。
- 新owned目录输出`date-corrected-data.json`与20个source_chapter文档，每章共同compile_chapter往返与date-only模板相同；原件/已批准39资产/作者2输入/草稿/对局/存档均未更换。它不是完整GameSource/新运行包/发布。
- 下库最后2B缺失仍不补、不认证；仅从实际有字节的段读日期。输出date-only overlay保留**已有Web模板其它字段**，包括其原兼容事件尾，明确非原五文件完整无损重新提取证明。不能拿20往返掩盖缺尾或其它已知parser差异。

## 验证与维护边界

新2Python主动LSP均0诊断但push-only inconclusive、0confirmed-clean；session曾列7个writer-assert风险已改实际保留检查，仍有2个parser既有路径提示（本批不调用read_scenarios/main）、5个既有原证HTML锚点风格和1个既有控制码正则警告，未禁规则/清缓存或称全clean；支持语法、实际原窗/原文件SHA、20往返/120header及原已批准输入保全、文档链接和Gitdiff核签见[独立静态](../.dragon-analysis/editor-phase/date-import-session-r1/static-receipt.json)。本批focused数据/工具路径不改111/116原生产源与当前游戏/UI；不拼成58门或把此前57成绩当日期重新安装证书。旧57收据的文档SHA属其封存时刻，后续本说明另签。

原日期偏移和下一步骤已有确定性原证，不用Jev猜字宽/公式或发原资源。完整任务一/goal仍active：该离线阶段当时实际游戏/副本仍使用旧模板年8/10，来源检查页准确显示差异。后续候选/真实App及受控采纳见下及最新链接；不热改旧对局/存档/草稿，不绕现行批准包/显示认可/不可变角色校验。

## E-04-DATE-CANDIDATE-1：历史独立候选/同引擎（未安装）

`stage_editor_date_candidate.mjs`直接受信current39＋作者Web原header及KI七窗生成两独立候选，不依赖ignored date overlay。候选修订`map-2-3c2eddea32050d75f5e4d62a63809964d05402ae4e498e782835d44f7467960d`；[r1](../.dragon-analysis/editor-phase/date-candidate-r1/receipt.json)/[r2](../.dragon-analysis/editor-phase/date-candidate-r2/receipt.json)全部输出和receipt逐byte相同。

- GameSource/aggregate语义仅later-3、later-4的start.year 8→264/10→266。回填旧值后全文deep-equal原源/data；新序列化属于候选生成，不宣称两个JSON原文字节只改数字。38资产中改source/data/两章/world/catalog共6角色，另外32角色（18章、四native、八季节图、两mini）保持原byte。地图/所有其它字段与既有事件兼容尾保持，不作完整原五文件重提取认证。
- 独立新sourceDigest/世界/catalog URI；源/显示/日期全部PENDING-DATE-DELTA，旧绑定sourceDigest的displayAcceptance移至明确priorDisplayApproval，不偷偷贴新source。作者包只改runtimeDataSHA及其hash/URI，完整header/G/C/F源raw全文同，旧描述符不能充新包信任。
- [最终验证](../.dragon-analysis/editor-phase/date-candidate-session-r1/verify-r2.log)：固定白名单（current39/作者2/KI/12代码）拒自由receipt输入，两个包复现、32原byte保全、新data/作者SHA耦合、候选被现author批准入口拒绝；生产createContentCatalog/createWorldResources/prepareScenario **20章fresh＋真实JSON restore**通过。两世界fresh状态除start值外全文相同，恢复state/RAM快照同；20次旧内容/世界身份restore全部拒绝，八native请求只内存映射，无网络/存档。r1验证历史保留，r2绑定加强后的固定I/O白名单。
- 新2JS主动LSP无诊断但push-only inconclusive/0confirmed-clean，5Markdown均unavailable；session159仍3个既有warning（旧parser两路径、本批不调用；控制码正则此前有意图裁决），无清缓存/禁规则或全clean宣告。限制与最终[独立静态](../.dragon-analysis/editor-phase/date-candidate-session-r1/static-receipt.json)另签；未拼58门全套。本次不改生产代码/原116源码/当前39/作者2/switch/草稿/存档，不做App浏览器、Clock推进或完整战役认证；原证下一步骤确定，不调用Jev猜日期或发送原资源。
- 此r1/r2后history helper已改变，12代码输入SHA只代表封存时刻；当前代码验证必须重新staging，不改写旧收据。旧副本可信历史选择已由[历史来源接线](editor-entity-history.md)实现，不能把其内存future tuple夹具当真实升级认证。

## E-04-DATE-APP-1：历史新候选与真实 App（该阶段未采纳）

同stager在当前helper上独立生成[date-candidate-r3](../.dragon-analysis/editor-phase/date-candidate-r3/receipt.json)/[r4](../.dragon-analysis/editor-phase/date-candidate-r4/receipt.json)，所有包/收据byte相同，新身份`map-2-cdbb15e706e7d456ba800eb78ec2837263a486facee0dc032cfb62260eb4c736`。source/data仍仅两year原纠错、六角色变/32角色同；身份改变是代码依赖摘要真实改变，不把旧3c收据改名冒充新验证。[新20章生产fresh/真实JSON/旧身份拒收](../.dragon-analysis/editor-phase/date-app-session-r1/candidate-verify.log)再次实际执行、输入前后SHA同。

新增`verify_editor_date_app.mjs`从准确两候选资源byte加载，不安装/改日期status或绕author APPROVED入口。四个全新context从原index DOM仅移除boot，使用**同生产startApp/prepareScenario/Clock/GameBar/HUD**的trial禁存能力：idx14原8/新264、idx15原10/新266全部成功启动，Clock.serialize与template原日期相同；实际DOM日期与Canvas.fillText/截图显示264/266，没有低byte截断。正常战略速度未改，settings所属hold在初始同任务建立，serial0；此认证只覆盖启动，不把0tick截图冒充日历推进/原CPU或全战役。

[实际浏览器收据](../.dragon-analysis/editor-phase/date-app-browser-r1/receipt.json)：两世界同章初态除start外全文同/相同fixture RTC下RNG同，render前后state/RAM/RNG/Clock完全不变；准确各世界URL，无旧图资源fallback、console/page/外网错误均0。正式save/load实际拒绝、IDB.open0；自有browser/server finally关闭，不访问真实profile/SAVE。截图candidate-14/candidate-15与prior-14/prior-15只作本批日期/同资源接入证据，不新增或伪称m1668视觉认可。

本批只新增验证工具，原124源/current39/作者2保持；主动新JS无诊断但push-only inconclusive/0confirmed-clean，5Markdown均unavailable，session164仍3个既有warning（parser两未调用路径/控制码正则已有意图裁决），未清缓存/禁规则。Jev仅人工2354B工程摘要preview审过后固定1.13.0/advisoryOnly，主风险ui_browser，不发原资源/实际数据/凭据、不作oracle。最终检查独立列于[静态](../.dragon-analysis/editor-phase/date-app-session-r1/static-receipt-r3.json)。首个owned静态checker误把作者Web URI当仓库路径、漏web/前缀而ENOENT，已只修checker路径换算并保留static.log失败；未改产品/期望，新静态与文档SHA另核。不拼59门整轮或冒充当前游戏已纠错。该阶段下一步**受控非视觉日期差异的精确显示继承证据与采纳**现已由[独立采纳交付](editor-date-adoption.md)完成：保原m1668对象/绑定不变，不能把PENDING字符串硬改APPROVED；新数据作者binding必须真实更新，旧草稿/live/存档不热替，旧来源须在真正升级后再验证。后台资料仍未提供，可编辑实体/初始化/扩容等完整goal未完成。
