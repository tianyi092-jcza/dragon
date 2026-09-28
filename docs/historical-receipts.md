# P24 历史收据断链索引

这是**缺口索引，不是恢复出的收据或原始机制证明**。原`checkpoint-journal.md`旧§11、13、21–25已被整理删除；8处旧链接改指本页，避免把现行journal同号章节误当原证。

## 核查范围与结果

- 本次检查全部本地refs可达的51个journal历史版本（`git log --all --format=%H -- docs/checkpoint-journal.md`后逐份`git show`）：未找到下列7个批次标识。不能据此断言原记录从未存在，只能确认当前可达Git历史不足以恢复这些段落。
- `cebd68c:docs/checkpoint-journal.md`§7指向整理前备份`dragon-project-memory-cleanup-8vrszv4e/before/docs/`；`5e14645:docs/checkpoint-journal.md`末节指向`dragon-project-memory-u797futb/docs/`。两处均位于本机TEMP，本次核实目录存在但已为空，未获得旧正文。
- 核查清单与每份历史文档SHA保存在`C:/Users/fczll/AppData/Local/Temp/dragon-render-layers/history-audit.json`。这是本次索引核查收据，不替代下列缺失的旧执行收据；TEMP可能被清理。
- 未扫描整个会话/环境日志或复制私有证据包，未读取真实存档。以下规则笔记仍保留各自地址、字段、伪代码及限定域；它们不是丢失收据的替身，本轮不新增或重判机制结论。

## 待恢复的七组收据

<a id="p24-fate-road-recovery-1"></a>
### 旧§11：P24-FATE-ROAD-RECOVERY-1

缺失：有界caller修复的定向成绩、绑定收据及scout失败与成功原窗审计的区分记录。相关详细源：[去向§7.5](re-notes-legion-fate.md)、[AI全链](re-notes-ai-chain.md)。

<a id="p24-original-return-1"></a>
### 旧§13：P24-ORIGINAL-RETURN-1

缺失：原属回归限定入口的原byte、对齐解码、分析依赖与命令收据。相关详细源：[去向§8](re-notes-legion-fate.md)。

<a id="p24-siege-entry-evidence-1"></a>
### 旧§21：P24-SIEGE-ENTRY-EVIDENCE-1

缺失：攻城入口有界原证根与可复跑脚本的定位。相关详细源：[去向§14](re-notes-legion-fate.md)。

<a id="p24-siege-integration-1"></a>
### 旧§22：P24-SIEGE-INTEGRATION-1

缺失：真实攻城接线的脚本、输入输出及安全验证收据。相关详细源：[去向§15](re-notes-legion-fate.md)。

<a id="p24-siege-initialization-1"></a>
### 旧§23：P24-SIEGE-INITIALIZATION-1

缺失：临时槽初值、55A6及冷恢复的原证、失败与检查收据。相关详细源：[去向§16](re-notes-legion-fate.md)。

<a id="p24-neutral-retreat-1"></a>
### 旧§24：P24-NEUTRAL-RETREAT-1

缺失：中立撤退别名的原始bin、对齐反汇编、执行器输入输出与验证收据。相关详细源：[去向§17](re-notes-legion-fate.md)。

<a id="p24-siege-warning-1"></a>
### 旧§25：P24-SIEGE-WARNING-1

缺失：警告前缀与等待边界的新原窗、执行器及收据。相关详细源：[消息ABI](re-notes-strategic-message-abi.md)。

## 下一恢复步骤

若找到这七批的明确备份或证据包路径，先核文件身份、SHA、输入/输出及原限定域，再在本页替换对应“缺失”条目。无法找到时，应在需要重用该原证的具体任务中按固定KI与明确输入重新验证，形成**新的**收据；不得补写旧成绩、虚构旧路径，或把一次新测试冒充历史原件。本页缺口不自动授权扩大逆向范围。
