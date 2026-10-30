# 编辑器小范围收口审计（基线 98f0630）

**历史基线，不是当前工作清单**：本页“当前／本轮／未接线”均相对于98f0630审计及标明的后继批次。当前完整编辑器状态唯一汇总入口为[验收清单](editor-completion-audit.md)。特别是下文旧上传／裁剪政策、只读地图、未有中立创建／继承界面、旧pin发布形态，不得据此重复实施或否认后继已交付的限定能力；可玩初始化、完整实体／资源闭包及物理清理仍按现行清单独立开放。

> 后继实施：用户再次要求「按建议执行」后，头像清除／源限制／裁剪确认／预览代次已修并补当前SHA聚焦验证，详见[PORTRAIT-UI-FIX-1](editor-portrait-ui-fix.md)。随后[PORTRAIT-IDENTITY-1](editor-portrait-identity.md)修正全局byte覆盖及消费者接线，聚焦浏览器22项通过。随后[PORTRAIT-WORKERD-1](editor-portrait-workerd.md)补真实上传／保存／发布API／匿名App串行14项，并修壳可见性／匿名资源路径。本文以下为前轮只读审计基线，不再以当时「未修」作当前UI／运行时身份状态；随后[PORTRAIT-PNG-SAFETY-1](editor-portrait-png-safety.md)补游戏库PNG有界解码／规范重编码。随后[JPEG有界实现](editor-portrait-jpeg-safety.md)补游戏库JPEG解码／规范PNG输出。后继[当前SHA真实链](editor-portrait-workerd-safety.md)补串行17项，含原JPEG公开API规范PNG／UI绑定／发布／匿名App三实体全部RGBA；后继[Trial PNG切片](editor-trial-portrait-png-safety.md)补源矩形有界规范化／存储预算及提交前写门；后继[Trial JPEG切片](editor-trial-portrait-jpeg-safety.md)补旧16384像素预算内矩形解码／规范PNG，58项内部SQLite检查；后继[Trial裁剪切片](editor-trial-portrait-crop.md)补服务端方形裁剪＋规范128输出（opt-in，24检查／45 HTTP／11图exact＋真实路由5门）；后继[预算探针](editor-portrait-decode-budget.md)验上限内最坏解码有界完成＋exact＋无留存（7检查／33 HTTP，零生产改动）；后继 C 在当前 SHA 走真实公开 Trial 链裁剪接续（15检查／1图 exact，无浏览器 boot）；更大源接受／OS隔离／完整格式与独立彩色精度、浏览器 App 运行、同时游玩／保存及完整消费者组合仍open；Trial 壳作者确认裁剪 UI（D切片）真浏览器 7检查通过，不称完整workerd验收。
>
> 后继隔离排查：[PORTRAIT-DECODE-ISOLATION-1](editor-portrait-decode-isolation.md)独立Node child探针23检查／5HTTP通过；后继Windows Job探针attempt5为17检查／15 native jobs，实测提交内存及周期检查的用户CPU quota终止／整组清理，不是RSS、精确CPU截止或权限沙箱。临时生产接线因Worker不能spawn及静默回退不满足合同而撤回；OS硬内存／CPU／权限隔离仍未安装。用户已要隔离，#3格式认证／#4旧资产自动迁移／#7消费者整体按建议暂缓或冻结；JPEG源预算、发布UI、游戏侧并发三项按用户最新要求待前项完成后统一决策，不提前实施。原255未知引用不等同旧上传对象，冻结不是旧图安全证明。

**后继平台边界**：用户已明确VPS编辑器→Cloudflare正式游戏、内置静态资源／origin保持，不采用Containers／解码Worker；[适配／分发／读取方案](editor-vps-cloudflare-plan.md)仅设计，现Worker/DO/R2接线并未变为VPS部署。权威提交／公开可见确认的Outbox提案需审阅与故障验证，不能借平台选择关闭正式release／历史包／物理删除／隔离缺口。

本轮按用户「按你建议执行」核对当前代码、限定收据与状态索引，只修文档；不新增功能、不重跑密封 lane、不提交／推送／部署。不是完整编辑器验收，也不是新的原版机制证明。

## 1. 基线与证据时效

- 本地 `dev HEAD=98f0630a2ebae4bcad884bfe3087f0e96a3eb160`，开始时工作区干净；相对本地 `github/dev` ahead 4。四提交依次为 `640ee09`（workerd 对等）、`dba2210`（壳及 BOOT-1）、`965dc06`（头像及战术浏览器）、`98f0630`（lint）。未 fetch，不据此证明实时远端或部署状态。
- `VERSION=0.1.5`，本地最新版本标签 `v0.1.5`。journal 原「v0.1.6 已发布／ebd4d52 已推送」只保留为历史叙述，当前本地文件不能支持该版本或实时发布结论；本轮不改版本号。
- `.dragon-analysis/editor-phase/SESSION-RESTART-HANDOFF-TRIAL-SERVER-R17.md` 是旧交接，不再是当前待办源。该审计轮状态使用本页与[逐项索引](editor-requirements-matrix.md)；后继当前状态转由[完整验收清单](editor-completion-audit.md)维护；原批次保留自己的时间、源码与覆盖限制。

本轮只读核对以下本地原收据（路径均位于 `.dragon-analysis/editor-phase/`，不将本机产物纳入版本库）：

| scope | 已核对原件 | 可以支持的结论／限度 |
| --- | --- | --- |
| `workerd-parity-r1` | `derivation.json/run.json/audit.json/post-document.json` | 自检、对等矩阵 20、node 玩壳浏览器 7；当轮空注册表缺 installed-source 全链，后由 BOOT-1 补限定链，不是线上部署 |
| `editor-shell-boot1` | 同上 | 壳矩阵 65、自检；audit 登记本机 workerd 全链 20，含改名、两次解散、发布／pack／asset／上下架；live 数字来自 audit 登记，不冒本轮新跑 |
| `editor-shell-b4e` | 同上及 `run-portrait-unit.log` | 壳矩阵 69、头像单测 15、自检；audit 登记上传／绑定／发布／资源／在用拒删／解绑／删除 API 生命周期，不等于全部 UI 操作或上传安全通过 |
| `trial-tactical-browser-r1` | 同上及 `receipt.json` | 工作台→Trial→宣战→编成→真实 canvas 行军→交战／Session 帧→offline 冻结→online 恢复→改密终止且关闭战斗，20 项；IDB 调用 0，未分类 console/page/outside 空；匿名正式游玩不在此面 |

### lint 后源码漂移

`trial-tactical-browser-r1` 的 bundle SHA 为 `cf819801cfdf93643cd5255de26a3457b0d46173104f01281e55bba74ddc805b`，等于 `965dc06:server/public/trialweb.txt`；当前 bundle 为 `ed9037fa05bce4f875996b45a42966bcf8a1391fbe66c720b3b94436d391dc69`，**不是该 20 项浏览器收据测试的字节**。

已核 `git diff 965dc06 98f0630`：生产变化仅 `originalroadarrival.js` 参数赋值改本地 `normalized/di`、`playpacks.js` 的 BLOB 类型嵌套条件改 `if/else`，及束重卷；`ai.js/gamebar.js` 与战术 lane 钉住值相同。arrival 的旧 CRLF 原件 SHA `ce07106f…` 与 Git LF blob `c5e84ea9…` 归一化后相同，换行差异不另算规则变化。B4e 的 `playpacks.js` 钉住 SHA `dd30ea44…` 等于 lint 前 Git blob，当前为 `e26d80b8…`。更早 workerd／BOOT-1 多个文件已被后继壳／头像批次替代，旧 immutable 字段只描述当轮。

`98f0630` 提交说明记载 road 32/0、portrait 15/15 再验；在上述四个 scope 未找到 lint 后独立收据。本轮没有补跑游戏测试，因此只能标为**提交记载，当前完整链待再验**，不能把 lint 前成绩拼为 HEAD 全绿。新验证应另建 scope，保留原失败与密封链。

## 2. 真实已接线范围

- 任务二：固定地图／原槽域限定迁移已交付，见[迁移审计](map-migration-completion-audit.md)。不重复迁移，不推广到任意新拓扑或扩容。
- 互联网编辑器本机 workerd：B1 左菜单单系统壳、B2 用户资料／管理、B3 游戏列表与状态门、B4a 章节 CRUD、B4b 据点只读引用／删除检查、B4c1 改名／字号／头像绑定、B4c2 君主／军师／解散、B4d1 只读地图示意、B4e 游戏头像库；BOOT-1 补 installed-source→copy→read/save→publish→pack/assets→上下架。据点／武将仍固定 192／128，不存在已放行的完整增删或可玩空白章。
- Trial 服务端批次 1–7e、8a–8h，及后继浏览器／双门／往返／多游戏切片已有各自封存记载；真实会话、私有资源、App 战略和战术边界、失效处置已接线，不能再写成「只有 fake core／未装 App」。Q69/Q70/Q71 整体仍 open。
- workerd 发布登记／冻结包／匿名玩路由与本地多游戏持久入口已接线，不再列为未实现。`server/published.js` 当前 pin 只有 `revision/sourceDigest/chapters/publishedAt`，每游戏单行覆写；它不是工程合同中的独立 `releaseId/releaseOrdinal` 和全部历史正式版本／公告事务。
- fence begin 的 Trial／发布包／游戏头像级联是已落地的冻结／派生清理，不是全历史内容物理删除。

## 3. 头像审计：两条管线，不能合并成 Q37 完成

产品后续裁决来源为[journal](checkpoint-journal.md)记录的用户 2026-10-09 决定：JPG/PNG、单文件≤100K，128×128为建议源尺寸，源矩形裁 active 显示64×64，资源 ID 与运行槽无关。这是 Web 产品决定，不是原版规则。此前 Q37 的规范128输出与原图尺寸不是一回事。

| 路径／直接源码 | 审计基线行为（历史） | 当轮未完成或差异 |
| --- | --- | --- |
| Trial：`servertrialapp.js:mountPortraitUploads`、`server/trials.js` | 前置选择原 JPG/PNG，按原文件字节上传到 Trial 派生库；不强制128源尺寸 | 不是游戏级永久库；不得据它宣布所有图片安全处理已完成 |
| 游戏库：`server/public/general.txt:previewPortrait`、`server/portraits.js:GamePortraits.upload` | 任意尺寸源由浏览器中央方形裁剪→128 PNG；API检查规范输出≤100KiB、magic及128头字段，库可复用／发布冻结 | 源文件大小没有同等前置检查，也没有作者调整裁剪范围控件；服务端只看头、不解像素，不满足工程§6的隔离解码、拒动画／多态、像素预算与重编码去元信息合同 |
| 绑定／运行：`generalportrait.js`、`core/assets.js:buildPortraitOverrides` | 草稿 `portraitKey` 不改原 byte；取资源时仍按 portrait byte 放入全局覆盖 Map | 多个武将共用原 byte 却绑定不同 key 时后写覆盖前写；并非全部消费者稳定实体身份接线证书，不新增255补图 |

**确定的 UI 源码缺陷（未修，非浏览器复现）**：`general.txt`「清除頭像綁定」分支产生 `key=null`，紧接 `if (!key) return`，无法调用保存。B4e audit 的解绑 API 链不能证明该按钮可用。另，选图异步预览期间仍可点击上传，空 canvas 的 `toBlob` 也会成功；缺少预览就绪／代次守卫。后续应先补这些独立 UI 回归，再按安全合同完成服务端处理。

node 多文档编辑页面是保留的本地工具，不属于本次 workerd 单系统壳收口范围；「node 没上传 UI」不自动升级为互联网编辑器阻塞。

## 4. 剩余事项与建议顺序

1. **历史头像事项已被产品决定取代**：该审计轮上传／裁剪差距不再作为当前待办，用户已改为禁止上传、共用621画像；旧客户端退役及实际Trial验证见[R2§2.60](r2-player-connection.md#260-固定库新身份与trial选边修复library-refresh-1)。不按旧审计重开上传功能，其余身份／全部消费者闭包仍须分别核验。
2. **Q69/Q70/Q71 整体验收绑定**：将既有服务器、核心、战略／战术浏览器证据按当前源码汇总到逐项矩阵。该审计轮20项只覆盖改密终态和真实 offline/online 帧链；其本身不覆盖禁用／退出／绝对期限、仅关闭编辑页不中断、原生关闭／visibility／BFCache、装配／迟到资源／全部 mutating 入口的完整组合。不能将旧 synthetic／分层测试冒为当前双边界浏览器全证。用户事项①统一／胜利免实证已关闭，不再把它当待办。
3. **正式版本与玩家协议**：原保全历史游戏包／旧局续玩／单档确认清理决定已撤销，当前仅最新版准入、旧局禁存、新版保存原子清旧及仅同版下架继续。本地联合证据与边界见[R2§2.72](r2-player-connection.md#272-当前版本唯一的共同发布联合复验current-publication-1)；生产发布、历史服务端数据／备份物理回收及完整环境矩阵仍缺，不把pin或局部IDB隔离当全合同。
4. **编辑器完整能力**：workerd 地图仍是只读示意，不等于已有本地组件工具完成互联网接入；据点／武将全字段、继承覆盖、完整语义素材、普通中立模板和可玩空白章、全桌面／繁体／跨作者矩阵仍需收口。任意移动／新路／变槽／扩容依赖 G-ROAD/G-SLOTS/G-INIT/G-CAP，按原证逐项放行。
5. **独立后端 open lane**：RuntimeManifest/Profile 完整装配、GameBar native 全图与 SDK 502 UNKNOWN、全引用／排空／物理清理／备份不复活。不能借 Trial 壳通过关闭这些独立门。
6. **交付审批（历史状态）**：该审计轮当时未授权新commit/push/deploy，不约束后续用户明确批准的任务；当前提交／部署收据见journal§12–14，commit与push仍分别需明确授权，不从文档推定。

## 5. 本轮文档验证

- 本地链接存在性、表格列数、冲突标记、新增乱码及Q1–Q73唯一性检查；`git diff --check`。原journal曾用替换字符举例记录GBK事故，保留历史文字，不把它误判为本轮新增乱码。
- 九份变更文档已主动LSP检查：六份clean，三份只有14条typos信息项（历史schema／批次标识片段，不改原标识）；session `mode=all`已查询，未出现warning/error。中间编辑曾收到marksman silent，后主动探测返回结果，不以此前空缓存追认clean；最后更新文件另探测。
- 游戏／浏览器未重跑，理由是本轮仅状态文档；历史收据核对不算新回归。本地审计记录另存 `.dragon-analysis/editor-phase/closeout-status-audit-98f0630-r1/`，不改旧密封scope、不入版本库。
