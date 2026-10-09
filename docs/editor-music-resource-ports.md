# E-01-MUSIC-RESOURCE-PORTS-1 — 共同MusicPlayer可信资源端口

## 现行范围

原MusicPlayer只增加可选`resourcePorts:{assertCurrent,loadManifest,loadBuffer}`，实际播放器仍同一类、同一曲目/CF9/fade/loop/source-gain逻辑。默认静态JSON/FLAC、一曲cache和现有App装配不改。私有分支显式启动每次fresh manifest+已校验byte解码，不按track复用settled缓存；本轮没有安装App/Trial、发行新loop证书或修改原版规则。

可信函数安装时固定捕获；调用者局部assert及context对象/代次在await后重核，过期返回不能复活声音；loadBuffer返回buffer+dispose，pending失败/旧代次/停止/自然结束释放其handle。旧source.onended只能释放对应旧handle，不清当前新handle。dispose异常只作音频清理，音频错误保持静音、不影响规则计时，不自动重试或回退公共音源。当前已开始播放的source不因后台权限变化自动撤销；显式下一启动真实GET才由Root重核。局部assert不是长期授权、DRM或provider排空证书。

## 固定库消费者指纹精确升级

首次native-r1在任何业务HTTP前被正常stager的consumer fingerprint mismatch拒绝（0检查/0调用）。Music旧源没有列入前继526声明输入/128import图，登记时已经单独wx归档，不能虚写375中的一个变更。前继世界ports输入/所有375谱系仍保持，本批增加声明Music与新工具，及两已归档政策源的最小变化。

范围扩展先记录`scope-extension.json/effective-before.json`再修改：available-library.txt仅把music程序SHA改为当前源码SHA；sourcecatalogpolicy.js仅换整个93530B清单固定SHA为`518f6436d34aba53503012375c323f1f3e5f12f5f83a6948916da9c08f4b7303`。398资源/字体/其余18consumer/20unknown255、mode/profile/registry名/长度不变，不绕过stager或增加runtime准入。原清单/政策源/before/r1源码留存。原InstalledSourceCatalog.#row仍逐字比较definition_digest，不同则409SOURCE_PROFILE_CHANGED；旧清单输入新policy则503。**这是现行代码fail-closed边界，不是原生旧数据库升级验证**，没有自动迁移、清登记、补seal或repair；真实既有后台未访问或部署。

## 适用验证

- 新fake音频/ports模型17检查：同曲/CF9、stop/restart、自然结束/旧onended、晚manifest/buffer/上下文/scope、捕获函数、失败显式重试/静音/无公共回退、悬停与mute，非原生授权。
- 原`verify_music_runtime.mjs`及`verify_sound_profiles.mjs`现行focused通过，原case/工具SHA不改；不是全战役或新机制证据。
- 原库policy工具现行400roles/19consumer/20unknown、10负控/getter0通过。所有资源byte保持、originalSource41不变；不签完整依赖/PNG/audio消费者。
- 最终fresh native-r4 **7检查/15Node控制调用/6浏览器资源GET**：实际Root/KDF/tempSQLite-R2正常Source41+库400登记/fullcopy/saved1-current2，无fakeGame或Job捷径；原JSON/FLAC上下文取准确旧保存素材到**共同MusicPlayer+native AudioContext**，静音gain0，仅BGM04现有loopStart/end及49700Hz/2ch/1703444frame验证。无新循环证书、全部11曲PCM或听觉无缝验收。
- TYPE1显式restart重新两GET/释放旧handle，四成功资源GET前后全35SQL行/目录/size一致；只在观察到原编辑器bootstrap两GET完成后建立baseline。已有声音局部scope撤销显式ensure停止/释放，不做网络。随后sameepoch在真实库fullSource/400role返回后工程fixture插永久fence，实际409/read1/无新声音；再actualpassword handler撤旧浏览器cookie，401/静音，无公共回退。不是410、rollback或provider取消。
- 新隔离Chromium/实际cookie，6资源GET、2bootstrap GET（/api/session和/admin/accounts），IDB/外部网络/pageerror为0。AudioContext只自建、native silent sink无听觉输出，关闭自有context/browser/server，不碰用户profile/SAVE/实际档案、共享speaker。

## 失败与证据界限

owned `.dragon-analysis/editor-phase/music-resource-ports-session-r1/`每轮执行前wx源码、stdout/stderr/meta/报告保持1800s/OSenv白名单；r1指纹门拒原件保，精确政策升级后fresh-r2才继续。r2的四资源GET后全SQL digest不同，schema/35table/size相同；原编辑器异步bootstrap两GET会更新sessions.idle_until，producer之前未等待。**r2未捕获具体前后行/该请求时序，不能追认某一行实锤**。只修新producer：先注册观察accounts200并等body finished，再baseline，不排除任何表/改期待/加sleep；r3已通过该完整指纹断言。

r3错误把旧fixture平面kind/after写为nested hook，原prepare正确设置hook=null，随后真实源仍可播放，所以expected无source断言失败（4检查/13Node/6资源GET）；不是权限绕过。只修producer参数到真实既有合同，原409/read1/401/全部期待和预算保，fullfresh-r4全7通过。r1/r2/r3失败及partial都不拼绿色，所有旧工具/fixture/Root/helper未改。首次登记错猜Music在旧inventory、后续inline图统计反斜杠语法故障均是执行前setup，postnotes明确非同期源码捕获，不冒producer失败或产品修复。

## 后续与收口

当前保护524原声明源，加当前两政策源/Music/新工具为528；前继128imports＋实际Music/speaker为130，原375谱系无本轮变更（已经包含先前3world授权变更）。规范Q73/schema35-243-70/源码正逆/执行SHA/links/syntax/diff/支持LSP/sessionall仍独立核，独立static-r2已核528/130、11syntax/631links/73唯一Q/35实际NodeDDL243列70对象，三源完整正逆11/1/1操作、清单单MusicSHA及政策单pin逆替换等值；模型/默认/sound旧runner同期SHA与当前只两政策登记/捕获差异明确分开，不追认旧wrapper为现行。首static-r1只collector错把pre-policy旧wrapper作current，完整失败wx-source/log保；onlycollector定点核旧runnerSHA+两精确差分，其它所有product/tool仍强当前SHA，fullfresh-r2通过。最后文档回写后再次独立核并finish全部图，限定收口才取代前继f44b。

Jev只发人工已审3753B摘要，preview后固定jev-1.13.0，advisoryOnly；无资源/源/secret/privateID/全文日志，不作PCM/SQL/机制/权限/goal oracle。诊断不称workspace clean；active7 code显示0、原结果1clean/6inconclusive且1disposition隐藏；aux/4MD raw为2inconclusive/4unavailable（convenience clean不优先）。sessionall461files29warnings1893hint-info原文归档，含roadgraph原adjacency、Music旧stopPlayback(boolean)flagwarning（session defer而不是ignore或错误豁免），新model动态mock.started一hint保留，非error或产品字段。无禁rule/清cache。

全435角色/renderer直接Image/其他缓存、RuntimeManifest/profile/chapterId-slotMap、255/G127原证与初始化、认证Trial全部mutating/async/网络、发布-上架-registry-announcement、全历史引用/body-providerCPUlegacy排空/物理删除410-scrub-cache-backup恢复、工作台/新实体/全部Q仍open。没有commit/push/deploy/cloud/install/trust；本限定交付不关闭目标。
