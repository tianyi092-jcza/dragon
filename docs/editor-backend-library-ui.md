# 私有固定素材庫的只读工作台入口（E-01-BACKEND-LIBRARY-UI-1）

限定接线[既有精确修订私有库API](editor-backend-library-assets.md)，不是完整素材创作模型、运行依赖闭包或RuntimeManifest。新增`server/public/library.txt`及显式fresh浏览器验证，旧Root仅固定静态import／`/library.js`映射；client装配、index只读区。业务API／stores／认证／draft与stage模块／玩家输入不变。449声明，444旧含375玩家保护。

## 精确修订、界面及权限

- 管理员本人先加载固定副本的明确保存修订，再点击「明確讀取已保存修訂素材庫」。工作台只给上下文，不赋权；实际服务仍每次验证session／owner／profile／准确snapshot及全400 R2角色。固定库须预先经既有API登记；本轮不新增登记UI或以运维staging代登记。
- 未保存资料需确认，只读已保存修订；取消不请求、不自动保存／读latest。server current2不改已读saved1，下载仍revision1。实际加载／保存换上下文就清旧目录，须明确再读；reload不恢复目录、资源bytes、凭据或自动请求。只读GET无未知写操作关联／新key。
- 显示398固定assetId、逻辑路径、长度及MIME，只在已读目录本地筛选；20个G127/255缺引用如实列出，无补图或下载按钮。路径／MIME／章节文本均textContent，不作innerHTML／API任意路径／文件名。当前仅管理员本人固定副本，普通作者无该区；这不替代普通模板和作者素材权限。
- 只下载opaque bytes，不插入PNG预览，不播放FLAC／执行JSON或加载字体，不裁剪／上传／编辑。文件名固定`library-NNN.bin`。库存／核验成功明确不是Q69、Trial／发布资格。

## 下载与异步边界

最大固定资源实测为BGM09 FLAC，11,196,244B，不能复用原stage4MiB预算。client新增显式`libraryBinary`分支最多16MiB，旧stage4MiB分支与返回DTO保持；二者不是可互换执行器／云SLA。

- stream累计长度不能超过目录描述，释放reader；最终完整bytes长度和SHA、回传SHA必须同描述相等。
- 保存修订、source SHA、catalog root、非运行admission及固定attachment名同捕获目录相等，才建立owned Blob URL并下载。parts与最终buffer可同时在内存；16MiB是单产物封装预算，非整堆上限、吞吐／云容量或GC保证。
- async返回及哈希await之后检查identity引用／代次／saved game-revision及该目录关联。上下文／实际改密所替换identity／401／pagehide清目录并revoke本模块URL；旧回应不能替新目录。
- 客户端绑定不是持久权限或服务器撤销即时通知。服务末次检查的已证边界沿用原API；已授权bytes交付后不承诺网络传输期间锁住epoch或远程收回副本／DRM。

## 实际限定证据

独立`.dragon-analysis/editor-phase/backend-library-ui-session-r1`，随机工程配置／owned OS temp SQL-R2／loopback HTTPS／新Chromium profile；既有MF、Playwright、OpenSSL及白OS子环境，源码、日志、截图／下载wx。

最终`ui-r2`十组通过：17记录Node setup／兼容调用、17浏览器library GET、0浏览器内容POST、4下载（3库附件＋1stage）。这不是全浏览器HTTP／认证请求计数。

1. 真实管理员加载saved1；staging但尚未SQL登记的库404，目录空，不隐式批准。
2. 真实登记后保存current2；dirty取消无GET，明确确认显示saved1的398／20，未保存名称保留。
3. PNG／最大11.2MB FLAC／JSON三完整附件SHA与固定Web原bytes同、固定文件名；未解码播放或运行媒体。
4. 实际服务200后，浏览器单独注入byte、SHA头、revision、source SHA、root、admission及超描述长度七种坏响应，均不建文件。
5. reload无恢复或自动库请求；坏assetId目录拒收，明确再读成功。
6. 实际加载2清旧目录，再明确读取2。
7. 当前data阶段真实Job ready、旧二项关联恢复及完整SHA附件在新client下兼容，stage仍4MiB／无浏览器POST。不冒完整六用途／全后台回归。
8. 实际password handler成功替换会话并清目录／ownedURL；不称SQL删除或原请求成败。
9. 独立真实author无管理员素材区；受测IDB0／外网0／console和page错误0，原game metadata／modifiedAt不变。
10. 另标**synthetic pagehide**：在实际200读取后、送入client之前触发本模块清理，晚到目录不安装；不是实际BFCache／设备事件证明。新状态文案明确旧目录已清，避免残留成功提示。读取完成的398目录与最终改密清空各有wx截图。

r1九组已通过但未当当前源码证书：随后发现测试故障注入的嵌套三元可读性warning，只改为if/else；并补上述pagehide控制及已读目录截图，旧producer／library源码、日志、下载与截图全部保留。最终独立r2原预算重验全十组；未延timeout／放宽期待，也无产品／producer失败蒙混。正确`(await expr).member`hints不改坏。

Jev只发送人工3337B最小工程摘要，preview审阅后固定`jev-1.13.0`advisory封存，不传源码／资源／凭据／用户状态或完整日志，未作规则／权限／oracle／完成门。适用诊断／session-all、各源SHA／imports、Root业务字节精确逆差、JS／HTML／链接与73Q另签；TXT unsupported和其它unconfirmed不等clean。

## 未完成

普通模板及其作者素材权限、可写素材／实体／章节／裁剪上传、全部loader／CSS／audio、G127/255、准确统一RuntimeManifest、认证Trial、发布／玩家存档／删除备份及完整桌面工作台。单一共同compiler／引擎、原件保护和goal继续active；无提交／推送、部署／云创建、安装／trust修改、用户profile-IDB／DOS-SAVE或共享清理。
