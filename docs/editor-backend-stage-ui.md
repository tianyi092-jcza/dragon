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

## 仍未完成

完整工作台／实体／章初始化、完整回退与消费者／Q69、RuntimeManifest／运行准入、认证Trial全部规则及async门、发布／玩家／存档／删除／备份仍缺。本切片不关闭完整E-01／E-06或主目标；无部署、云资源、commit/push、安装、全局trust、用户profile-IDB、DOS-SAVE或共享清理。
