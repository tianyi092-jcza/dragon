# E-08：真实快照与opt-in仓储的限定兼容验证

本批只增加测试及显式inventory登记，**没有修改snapshotState、codec/store、规则/AI/RNG、App或资产**。先前[底层仓储](editor-game-save-store.md)的小JSON夹具不构成完整快照证明；本批补当前20章实际快照、公共detached恢复的限定证据，仍未接正式发布版本识别/确认UI/游戏选择或现存玩家档。

## 路径与实际证据

- `tools/verify_game_save_snapshot.mjs`按当前深冻结默认读取manifest/data/catalog/world-definition和四native资源，逐长度/SHA；fetch只允许四个原URL的内存Response，不向网络转发。每章同生产createNewGameScenario/prepareScenario fresh初始化，真实Clock初始日期及固定工程RTC，0规则tick；不能冒空章初始化、原CPU或全战役。
- 调用现snapshotState产生完整saved，strict codec不放宽、不补undefined/null/0或丢未知键；注入own mock仓储put/get，与原snapshot全文深比及规范JSON/SHA比。读取后调用与标题相同的admitSavedScenario，独立冷world/prepareScenario restore；四种native记忆/assembly全文和cold重新快照webMeta、固定军团表相等。RNG真实restore并比较两个独立恢复实例的后16byte；live原RNG/state/Clock保持不变。
- 每章三个必需cap（movementMemory/terrainMemory/cityCache）分别缺失及错误scenario_idx，共80拒载夹具。底层允许它们作为语法有效JSON保存，公共准入拒载；正文、完整token/目录不变、delete0。不把存储成功当Scenario完整/正式版本有效，不借损坏来触发版本删档。
- 最终白名单env `game-save-snapshot-session-r1/run-focused-r1.mjs`实际七项串行exit0：新snapshot门（20章/80拒载/implicit IDB0）、仓储纯7组/59拒、fresh真实IDB两页六组，以及原repository/local-saves/transition-guard/Trial-policy。原small local-saves仍只是它的小mock往返，本批不改其说明或拼历史成绩。
- 新78入口/177声明源码（166Node/7Python/4HTML）仅inventory，不是新78全轮。176旧声明源只有runner新增一行，175旧源及82 current/archive资产byte不变；新本工具/实际日志/输入/SHA/七focused与browser收据、文档/诊断/有界差异由同session `static-receipt-r1.json`另签。

## 失败、边界与未完成项

预审probe-r1将live Scenario（class/alias getter）与structuredClone的plain对象直接deepStrictEqual，夹具失败，原脚本/完整owned日志与exit收据保留。probe-r2改两侧相同克隆比较，20章全部strict→store→common restore通过，loss项空；没有改生产类、字段或codec迎合断言。随后正式门补cold webMeta/native表、RNG continuation及80个共同准入拒载，并全七项重跑。

只证明当前20章fresh0tick快照和已覆盖公共恢复路径，不证明中途行军/交互/战后/整战役全部snapshot，也不认证未来跨游戏release/章资源匹配、完整备份/导入或生产App可直接装载v3。真正确认版本/左确认右取消政策、后台/匿名多游戏、完整保存与异步入口接线继续见[差距索引](editor-requirements-matrix.md)。不访问native IDB/用户档/真实SAVE；旧档不贴1.0、不迁移清理。goal active，无新commit/push/deploy；诊断unavailable/inconclusive不称clean。
