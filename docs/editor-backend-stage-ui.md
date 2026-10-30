# E-01：后台阶段任务与核验下载界面

本页维护`server/public/stage.txt`及独立后台最小桥接。复用[真实阶段API](editor-backend-stage-api.md)，不新增规则、编译算法、运行证书或发布能力。玩家375输入及既有服务／SQL／R2合同不改。

## 上下文、操作与恢复

- 从私有资料表单的实际已读修订取得只读gameId／draftRevision／dirty；没有完成读取或仍有未确认保存时不能预约。dirty需原生明确确认只处理已保存资料，不保存或替换输入。用途固定data／images，图像仍限管理员本人。
- 每用途保一个UI操作关联。actor命名空间下只保存game／修订／purpose／enqueueKey／Job ID，以及未确认命令的action／key／期待状态修订；没有密码、CSRF、作者文字、完整源或产物。关联不是权限或持久Job权威。
- 预约失去回应、没有Job ID时，按钮明确说明会以原键及原完整固定body再次确认；若服务未收过，可能建立原请求。只用户明确操作，不隐藏POST、不自动新键，不按当前编辑器或latest重造内容。恢复后的关联不等于已读取草稿上下文。
- run／retry只按已查的Job状态修订、明确确认、固定`{}`及永久命令key执行。回应失去先GET真实Job，reload不自动执行。query显示当前阶段事实并允许下一次明确CAS操作，不宣称原HTTP命令曾执行写入。活跃lease／旧CAS仍由服务拒绝，UI不假定过期或调低期待。
- 未确认请求离开需确认；关联损坏不发新请求。实际改密成功才在UI标旧会话已撤销，原Job仍由SQL epoch拒绝，不冒已删除／已成功／已失败。身份／用途代次和实际当前authority引用检查拒迟到安装；仅清理本模块创建的blob URL。

## 产物下载

ready只显示stage-only事实，不是运行／Trial／发布按钮。具体产物按钮使用固定Job路由和服务checkpoint的assetId，不接任意URL、路径或hash。服务每次从精确源完整重建／验所有checkpoint与真实R2对象；UI额外要求octet-stream、按描述长度有界读取，核完整SHA及`X-Content-SHA256`，然后才建立自有blob下载。

不自动下载或预览，身份变化撤销本模块URL。每次读取成本较高，没有Cloudflare CPU／内存、并发、公平性或SLA承诺。对旧epoch禁run／下载，query仍可明确取得服务拒绝；新预约须明确使用已读取修订，不恢复旧权限。

## 实际验证

`backend-stage-ui-session-r1/ui-r2`八组真实默认Root／SQLite／R2／HTTPS8787及fresh Chromium流程：

1. 真登录、完整copy与私有精确读取；读取前阶段按钮禁用，作者文字textContent，没有Trial／publish控件。
2. dirty取消没有POST；实际202回应在浏览器网络边界丢失后reload，无自动POST，用户明确原键／原body取得同一Job。
3. 真实data29产物，run实际完成但回应丢失；原命令key／CAS关联reload，随后只有明确GET，无自动run或另起命令；已保存资料不变。
4. 实际terrain完整下载；独立浏览器网络byteflip及错误SHA头均拒，不创建第二下载。
5. 已知Job关联reload不恢复源／产物或凭据；明确查询重建界面，保持准确修订，不latest回退。
6. 实际images七产物、mini下载byte与此前独立Pillow认证的固定PNG相同；所有阶段、下载均不改草稿修订／元数据／modifiedAt。
7. 另一真实作者独立context没有他人的关联或产物，不能选择管理员图像用途；服务才是权限源。
8. 实际表单改密成功禁旧run／下载，旧Job真实query409；不复活旧epoch或删除对象，允许明确新预约。

UI有13条记录的Node设置／检查请求、5条浏览器阶段POST、两独立wx下载／截图，pageerror与未解释console错误0、外域请求0、IDB读取0。不是完整浏览器HTTP计数。ui-r1七组先通过，扩充reload／SHA头／epoch覆盖后r2八组通过；两个producer／日志／下载／截图分别保留，没有失败靠重跑碰运气。

同当前产品SHA的API七组42、私有draft九组50、受控epoch三组18另通过，共110条记录请求；加UI的13条Node请求为123，不冒包含全部浏览器请求的全轮。旧427输入仅Root固定Text路由、client、draft只读通知和HTML四处模块改动；其余423（375玩家）保护，新增stage模块及测试为429声明。适用LSP未确认或不支持不作clean，实际语法、进口／链接、源逆差和日志SHA另封存。

## 后继默认组合链完整复验

当前 `EDITOR_TEST_NODE=1 node tools/verify_editor_backend_stage_ui.mjs 110` 默认combined入口完整通过 **17组**，包括实际结构GET；不是`--jobs-only`或实体聚焦模式。真实Node／文件SQLite／FileBucket、自有HTTPS与新Chromium，管理员登录／改密并复制固定20章，另作者独立会话核隔离。没有成功API替身、云访问或生产操作。

本轮连续覆盖：固定库登记原键恢复；data29与images7及四季fallback共六purpose；三个实际下载及字节／摘要头／库根错误拒绝；398项私有库与20项已知引用缺口；真实结构计划44条输出／26条缺项、四个准入flag仍false；共用city-native保存2、竞争412、原键查询后明确读3、提交4丢回应恢复；准确修订4地图／拓扑只读与据点像素；武将改名／画像绑定和清除、原键恢复、CAS冲突、另一作者隔离；最后改密撤销旧阶段操作。各分支通过不把结构报告缺项算成资源齐全，不授权Trial／发布／删除。能力表新增四个聚焦断言仅在generals-only执行，本轮不冒其再次执行。

证据 `.dragon-analysis/editor-completion/stage-combined-https-20261029/`：

- r1／round108走到地图步骤，Playwright取大草稿正文时报`Request content was evicted from inspector cache`，未取得完整收据。只改测试：浏览器请求仍须200且正常完成，再通过独立真实HTTPS读取同一修订4作像素对照；不拦截或替换浏览器成功响应，也不按最新修订回退。
- r2／round109通过地图并到武将画像清除读回，1800秒总预算超时，无最终收据；随后确认无该测试进程，不猜唯一故障原因，不将部分日志计通过。
- r3／round110以独立日志及退出码文件记录，完整`tests-r3.log`／`result.json`和`exit-r3.txt=0`；17组、34条显式设置／核对请求、13条阶段POST、3份下载，39项入口源码SHA与截图`backend-stage-ui-session-r1/ui-r110.png`逐项复核。请求数字各有口径，不合称所有浏览器请求总数。errors／outside为空，正式IDB访问断言保持。
- 586项选定源码／固定内容／独立PNG参照输入，r3前后SHA相同；新增独立地图GET不改变浏览器原请求计数和只读检查。未改产品、规则、编译器或生成束。

测试语法、限定diff及文档链接检查通过。主动LSP脚本push-only未确认，三文档仅五处既有词典hint；mode=all另列测试既有布尔参数1条warning及3条风格hint，未屏蔽或称全部clean。无产品变化，不重建后台／原生束或重复无影响规则回归。

该收据补足此前共用实体表迁移后未重跑的Node默认stage组合出口，不替代workerd默认组合、全部编辑字段、原生初始化或完整A14／A19／A32验收。

## 后继异常权限修复后的完整HTTPS复验

在草稿／来源目录／私有库及[stage产物异常复核](editor-backend-stage-api.md#后继产物读取异常后的任务复核)修复之后，未修改测试，重新执行默认入口：`EDITOR_TEST_NODE=1 node tools/verify_editor_backend_stage_ui.mjs 111`。完整 **17组通过**，真实Node文件SQLite／FileBucket、自有随机端口HTTPS、新Chromium与实际管理员登录／改密／固定20章复制；另作者保持独立认证会话。不是先前收据换日期，也不是`--jobs-only`或实体聚焦。

先核读三个实际执行器`datacompiler.js`、`imagejobs.js`、`fallbackjobs.js`的execute：ready读取分支不claim，只有持有capability的写执行才在失败时尝试修改Job状态；本次GET异常复核不会因为ready校验自身正常的失败处理而必然产生JOB_CHANGED。此为当前代码路径核对，不把它当作所有并发或异常路径的运行证书。

本次实测覆盖保持：data29、images7和四季共六purpose；三个真实下载及浏览器字节／SHA头／库根负控；私有库398／missing20；结构GET44输出／26缺项且四准入flag=false；city-native精确保存／412／丢回应原键恢复；修订4地图；武将改名与画像绑定／清除；异作者隔离及真实改密后的旧Job409。结构GET也会通过共同stage读取重验六类报告。本轮没有额外注入服务端取数失败，前批13组端口夹具和本次真实正链应分别解释，不能拼成完整实HTTP异常矩阵。

证据 `.dragon-analysis/editor-completion/stage-current-authority-20261030/`：`tests-r1.log`、`result.json`、`exit-r1.txt=0`，截图`backend-stage-ui-session-r1/ui-r111.png`。34条显式设置／核对请求、13条阶段POST、3份下载各守原计数口径；errors／outside为空，正式IDB访问断言0。586项选定输入重新固定并在结束核同，39项收据源码SHA、截图和三下载长度／SHA均复核。后台runner只运行这一显式入口，原finally关闭自有服务／浏览器；自有临时资料按原工具保留，不宣称清理所有临时目录。

本批无程序、测试、束或DDL修改；仅更新验证文档。语法、限定diff及链接检查通过；文档主动LSP／mode=all仅既有词典hint，没有据此声称全仓代码clean。workerd默认组合、全部实体／初始化、全部async故障与完整编辑器出口仍未闭合。

## 仍未完成

完整工作台／实体／章初始化、完整回退与消费者／Q69、RuntimeManifest／运行准入、认证Trial全部规则及async门、发布／玩家／存档／删除／备份仍缺。本切片不关闭完整E-01／E-06或主目标；无部署、云资源、commit/push、安装、全局trust、用户profile-IDB、DOS-SAVE或共享清理。
