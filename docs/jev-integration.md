# Jev 在卧龙传 Web 项目中的适用性与集成

本文记录对 TypeSafe Jev 的调研和本项目的实际接入。Jev 是**可选的、开发期的外部语义判断器**；它不是原版机制证据、测试 oracle、游戏运行时依赖或发布门禁。

## 1. Jev 是什么

Jev 是 TypeSafe 的 System One 决策模型。一次请求由一份 `state` 和若干互相独立的 typed questions 组成，返回结构化答案而非生成文本：

| 原语 | 用途 | 返回 |
| --- | --- | --- |
| Choice | 从闭合集合中选一项 | 选择、各项概率、confidence |
| Score | 按有序 rubric 评分 | 概率加权 score、各级概率、confidence |
| Noul | 判断 yes/no 命题 | yes 的 0–1 概率 |

官方 HTTP 接口是 `POST https://api.typesafe.ai/v1/systemone`，使用 Bearer API key。当前稳定别名是 `jev-latest`；集成默认固定 `jev-1.13.0`，避免别名升级让同一输入静默改变结果。官方文档列出的 1.13 限制包括：文本输入、64k 总上下文、`state + 最长问题` 32k、英语效果最好；它不擅长精确数字、计数、日期比较、低级二进制／汇编、多跳推理、生成文本和充满无关内容的大 state。

Jev 的长处是：把**已经缩小范围的语义判断**变成有概率的闭集结果。它不能替代确定性代码、解析器、测试、逆向证据或人工审阅。

## 2. 本项目适用性

### 已接入的场景

1. **开发变更风险分流（`change` profile）**
   - 主关注域：原版规则、存档／状态、时序／RNG、UI／浏览器、工具／测试等；
   - 分别判断是否需要原证复核、是否有真实存档／profile／凭据风险、是否有确定性或状态所有权风险；
   - 分别判断是否值得补 focused rule、隔离 round-trip、fresh-profile browser 三类验证；
   - 给出独立审阅优先级。
2. **测试失败分流（`failure` profile）**
   - 把日志归入断言／规则、语法／导入、环境／依赖、timeout／race、浏览器／UI 或证据不足；
   - 独立判断产品缺陷信号和测试／环境缺陷信号，两者不强制互补；
   - 判断 browser 或隔离 save round-trip 是否有助于复现；
   - 评价现有日志的诊断信息质量。
3. **逆向调查分流（`reverse-triage` profile）**
   - 从人工整理的最小证据包中选择当前最关键的证据缺口，而不是猜原版规则；
   - 在静态 caller/xref、读写者/别名扫描、小范围反汇编复核、受控运行态 trace、单变量对照、原始数据结构解码、下游消费者追踪和证据包复核中选择下一探针；
   - 独立提示 Web 实现/文档污染、候选解释冲突、过早下结论以及是否确需受控运行态 trace；
   - 评价证据包能否支持“选择下一步”，输出固定带 `mechanismVerdict: false`。

这些结果适合帮助开发者决定“先看哪里、还缺哪类验证或原证”，不能宣告实现正确、测试通过或原版机制实锤。

### 可继续试验、但尚未接入的场景

- 将用户 issue 按 UI、规则偏差、存档、部署、资源等闭集标签分流；
- 对大量测试失败先做语义聚类，再由确定性脚本保留命令、退出码和 stack trace；
- 对文档中的主张做“疑似缺原证／已明确 Web 产品决定／纯工程事实”初筛；
- 在已有候选列表上选择最相关的审阅清单或 SKILL，选择之后仍由代码加载固定文件。

上线这些场景前必须准备本项目自己的标注样本，测量准确率、校准阈值并记录模型版本。不能把文档示例中的 confidence 阈值直接照搬成门禁。

### 明确不适用

- **原版机制判定**：Jev 不能把 Web 代码、测试、文档或观察升级为 `KI.EXE`／原始数据证据；
- **精确规则与逆向**：不能让它计算字节偏移、RNG 消费、兵力、寻路、汇编语义或战果；
- **测试 oracle**：不能用模型输出规定未经逆向闭合的期望值，也不能覆盖失败退出码；
- **游戏运行时 AI**：不接入 `web/`，不参与战略、战术、外交或 NPC 决策；否则会破坏离线静态部署、确定性、可回放和原版还原边界；
- **Canvas 视觉验收**：1.13 不接收图片、音频或视频；截图仍用浏览器工具和人工／像素级检查；
- **浏览器端调用**：不得把 API key 放入静态产品。官方 SDK 也默认禁止 browser use；
- **自动改代码／自动处置数据**：Jev 只返回判断，不执行 shell、选择器、网络地址或文件操作。

## 3. 已实现的结构

```text
tools/jev/client.mjs              无依赖 HTTP client、请求/响应校验、timeout、重试
tools/jev/profiles.mjs            本项目 state、原子问题、脱敏和结果摘要
tools/jev_assess.mjs              显式 preview / --send CLI
tools/verify_jev_integration.mjs  mock transport 回归；不访问实时 API
docs/jev-integration.md           维护源
```

实现保持产品零 npm 运行时依赖：只使用 Node 20+ 已有的 `fetch`、`Response` 和标准库。Jev 代码不进入 `web/`，也不进入 `dist/`。

安全默认值：

- 默认只打印即将发送的 JSON，**不联网**；必须显式加 `--send`；
- 只自动读取仓库内文件，拒绝 `.env*`、`.dev.vars`、`.dragon-runtime`、`.git`、`.playwright-cli`、`node_modules`、`SAVE.DAT` 和 `save.json`；仓库外内容只能由操作者先审阅后经 stdin 提供；
- 自动遮盖常见 Authorization、API key、token、secret、password 和 Cookie 形态；脱敏不是完整 DLP，`--send` 前仍须人工看 preview；
- 输入硬上限 48 KiB，超限时要求先过滤，不静默截断；这也减少 Jev 1.13 的 context rot；
- client 每次尝试 timeout 10 秒，对 408、429、529 和 5xx 最多重试两次，支持 `Retry-After`／`retry-after-ms`；
- 响应须与问题 id、类型、闭集选项和概率范围吻合，否则 fail closed；
- 输出始终带 `advisoryOnly: true`，不会修改文件、启动测试、提交、推送或改变游戏状态。

## 4. 使用

### 4.1 本地 preview（建议先做）

```bash
node tools/jev_assess.mjs change --input review.txt
node tools/jev_assess.mjs failure --input test.log
node tools/jev_assess.mjs reverse-triage --input evidence-summary.txt

git diff -- web/src/game/clock.js \
  | node tools/jev_assess.mjs change --input -
```

preview 会显示最终的脱敏 state、所有问题、模型 id、输入字节数和脱敏次数。它不读取环境变量中的 key，也不发网络请求。

### 4.2 `reverse-triage` 证据包

不要输入 `KI.EXE`、原始二进制、整段反汇编或无边界的大型 trace。先由确定性工具和人工核对产生简短文本，明确区分事实、候选和未知；为降低歧义，优先使用简洁英文标签：

```text
SCOPE: bounded function/range or state field under investigation
PRIMARY EVIDENCE: KI.EXE addresses, xrefs, raw offsets, or controlled trace provenance
CONFIRMED: facts directly supported by that evidence
CANDIDATES: competing interpretations; no candidate is a conclusion
UNKNOWN: open entry, predicate, input, width/alias, RNG/order, writeback, or continuation boundaries
AVAILABLE PROBES: bounded deterministic checks that can actually be run
```

有两个以上仍合理的调查方向、关键缺口不明确，或需要在静态闭包与受控 trace 之间选择时自动调用；若下一步已由地址、xref、失败边界等确定性事实唯一确定，则直接执行该步骤，不为调用 Jev 而延误。Jev 只选择调查 lane，返回后仍须用反汇编、原始数据或可重复运行态观测闭合证据链。

### 4.3 实时调用

TypeSafe 官方变量：

```bash
export TYPESAFE_API_KEY='...'
node tools/jev_assess.mjs failure --input test.log --send
node tools/jev_assess.mjs reverse-triage --input evidence-summary.txt --send
```

CLI 只读取 `TYPESAFE_API_KEY`，不使用其它供应商的环境变量。不要把任何 key 写进仓库、命令参数、日志或浏览器代码。CLI 只在 stderr 报告所用变量名，不打印值。

如需跟随稳定别名而不是固定模型，可显式指定：

```bash
node tools/jev_assess.mjs change --input review.txt --model jev-latest --send
```

输出为 JSON，包含 versioned `model`、usage、Choice／Score 的完整 probability distribution、confidence，以及 Noul 概率。当前工具**不基于概率自动通过或阻止任何动作**；先积累标注样本再确定阈值。

### 4.4 验证集成

```bash
node --test tools/verify_jev_integration.mjs
node --check tools/jev/client.mjs
node --check tools/jev/profiles.mjs
node --check tools/jev_assess.mjs
```

mock 回归验证请求结构、脱敏、输入上限、credential 只进入 Authorization、typed response 校验、重试和错误脱敏，不消耗额度、不需要 key。

## 5. 数据与费用边界

调用 `--send` 会把 preview 中显示的文本发给 TypeSafe。官方称客户请求／响应不用于训练，但一般账户的数据保留仍受其 DPA、主协议和隐私政策约束；ZDR 是企业选项，不应自行假定当前账户已启用。

因此不得发送：

- 原版／改版二进制、图像、音频等第三方资源；
- `SAVE.DAT`、IndexedDB 导出、`.dragon-runtime`、真实 profile；
- API key、Cookie、个人信息、私密 issue 或未获授权的完整用户日志；
- 与当前问题无关的大段源码或工作树内容。

官方模型页在本文调研时列出 `jev-1.13.0` 输入价为 **$0.042 / 百万 token**、输出 token 免费，限额为每秒 250,000 token、每分钟 1,200 请求。价格、版本和限制会变化，实际使用前以官方模型页和账户控制台为准。

## 6. 评估方法

在考虑 CI 或半自动路由前，至少建立一组不含敏感数据的本项目样本：

1. 由人给每个变更／失败标主类和需要的验证 lane；为逆向证据包标注主要缺口和最有效的下一探针；
2. 固定模型版本运行 Jev，保存输入 hash、问题版本、模型版本、概率和人工标签；
3. 分 profile 计算混淆矩阵、漏报率和 confidence／概率校准；
4. 专门加入 prompt injection、中文日志、超长 stack、多个同时故障、反例和边界案例；
5. 先以“仅展示建议”运行，证明收益后才讨论自动路由；
6. 模型或问题改变时重新校准，不把旧阈值沿用到新版本。

即使未来进入 CI，也只能作为非阻塞的 advisory artifact；项目现有测试、LSP、`git diff --check`、浏览器隔离验证和原证纪律仍是权威门。

## 7. 官方资料

- [Introduction](https://docs.typesafe.ai/introduction)
- [Quick start](https://docs.typesafe.ai/introduction/quickstart)
- [API reference](https://docs.typesafe.ai/api)
- [State](https://docs.typesafe.ai/concepts/state)
- [How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)
- [Confidence](https://docs.typesafe.ai/confidence)
- [Models](https://docs.typesafe.ai/models)
- [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)
- [Legal](https://docs.typesafe.ai/legal)
