# E-01-BACKEND-PRIVATE-AUDIO-DECODE-1 — 私有音频只解码

## 范围与接线边界

新`web/src/content/privateaudio.js#createPrivateAudioContext`与模型`tools/verify_editor_private_audio.mjs`，复用[privatebytes](editor-backend-private-byte-context.md)准确game/savedrevision/source/dependency/长度SHA和actualRoot授权GET。**旧520输入/119imports/375玩家、Root/API/schema/privateresources/MusicPlayer/原曲选择与循环全部不变**。模块opt-in，不装App或编辑器、不创建播放节点/扬声器、不签循环证书，也不从stage ready/decoded buffer导出Trial/发布许可。[共同合同](game-editor-technical-design.md)的全部资源接线仍未完成。

调用端显式提供原生AudioContext/OfflineAudioContext及可信本地生命周期assert；端口形状/参考DTO/hash不是服务权限。context固定采样率（8k..192kHz工程界），仅private-library `audio/flac/.flac`及`audio/wav/.wav`，flat own-data且原privatebyte完整字段门仍拒错配。只解析标准FLAC STREAMINFO/有限metadata（最多128块、必须已知正样本数、4..32bit及1..8声道），RIFF/WAVE整数PCM8/16/24/32bit（完整RIFF长度、最多128chunk、一fmt在data前、准确rate/byteRate/blockAlign/完整正样本）。MP3、未知样本数、浮点/WAVE扩展等保守拒，不宣称完整所有codec支持。

原生`decodeAudioData`负责FLAC frame/CRC/解压和PCM转换，模块不实现第二音频codec。metadata前估算和decode后复查声道、采样率、样本（允许标准重采样计数舍入1frame）、duration与Float32预算256MiB；这是工程界，**不是browser实际heap/CPU/峰值硬配额**，原压缩byte与PCM/decoder内部内存可共存。只有一个pending或owned handle，超界先拒；不缓存已解码结果，每次后来显式read都重新授权GET。

每await前后及最后检查caller生命周期，失败释放pending计数；late revoke/close拒结果，不能修复旧授权。handle冻结仅包装层，AudioBuffer可变/可被复制。dispose幂等/close永久只删owned引用，不清零buffer、不关闭共享AudioContext、不停止别人节点、不取消SQL/Job/provider，无DRM、即时撤销、GC或drain保证。

## 当前实际验证

本节为首批封存记录，不代表后继库身份／源码已复验；现行库的独立浏览器验证见文末。

- **model-r2：41检查，3执行前WX源码**；fakeHTTP/audio-port非native授权。格式/mime/未求值getter/错game-source、FLAC未知/超预算、PCMheader/不支持float/bad decoded shape、401/403/409/410/503、owned并发和后来显式失败retry、late revoke/close/采样率变化、flags全false。原model-r1 39保留，两新增late cases只改新tool，产品不变。
- **native-r2：7检查/15Node控制请求/6browserGET，8报告来源SHA/14执行前WX源**；临时真实Root/SQLite/R2，actualKDF登录改密/固定Source41和库400角色登记/正常fullcopy保存1，再真实保存2，精确旧1参考。没有手工Game/Job/snapshot或dataJob、没有重复六阶段旧整轮。
- Chromium新隔离context与原生OfflineAudioContext49700Hz，私有`ynsound-record13.wav`原PCM signed16双声道：逐个Float32 sample及整PCM SHA按下述**当前browser转换控制**核完全相等；actualFLAC BGM04采样率49700/双声道/1703444frames与独立STREAMINFO一致，所有channel sample finite且有声值。FLAC没有第二解码器PCM认证、全11曲也未新解码。
- 三正读取（WAV/FLAC/后来WAV）全35SQL行/catalog/databaseSize不变、后来实际GET无settled cache；错误source实际owner GET200而客户端header拒（不是IDOR漏洞）。真实password撤旧cookie→401；新cookie下after-library实际400角色/全source await返回后插owned永久fence→409且未给音频byte/decoder，不是410/原生provider取消。全部GET、outside/pageerrors/IDB0，close后caller OfflineAudioContext仍suspended。无播放/可听视觉验收或全await原生覆盖。

## 首轮错误与直接定位（不以容差抹平）

native-r1只有setup1检查/11控制请求后，firstWAV PCM SHA实际5c9ce4与collector统一`integer/32768`期待b5d01c不等，status1非timeout。失败14执行前源/stdout/stderr/meta/failureJSON保留；没有成功report，不拼绿色。

三新owned localbrowser字节注入探针（**不是Root/原音频机制证据**）：统一32768在8186样本不同；正32767/负32768的double除法仍106处float rounding不同。当前Chromium用`f32(integer*f32(sign<0?1/32768:1/32767))`全样本不同0，逆恢复signed16不同0；uniform误差最大5.33e-6只是诊断，**未采用epsilon**。该受控browser实现事实不推广为标准所有browser/原OPL转换公式。只改新native collector的独立PCM期望转换及文字，严格整hash断言/状态/权限/源预算/产品模块不改，再完整fresh r2通过。诊断round1..3各源码/log/meta/report WX；编辑时两个错误anchor工具拒且当时读取确认无改，再精确修，不虚构failedproducer。

## 封存与限制

owned `.dragon-analysis/editor-phase/backend-private-audio-decode-session-r1/`先核1e08前继全部source/import/history/failure/document/executionSHA，3MD先wx归档，当前新模块+tool库存522/120，仍375保护。模型/原生/诊断/失败分别保留，主原生1800s固定白OSenv/已有MF-OpenSSL-Playwright，不延期盲重试/不拼partial。独立static-r1通过所有SHA/14native与3model捕获/当前module镜像/41superset39/失败两处精确差分/原PCM独立重算/35实际NodeDDL243列70对象/73唯一Q/8语法/gitdiff/616本地链接，最终文档后r2另签。主动LSP六代码warning阈值零但inconclusive6、两aux同inconclusive2/confirmedClean0；早先native三个Window.audio与三个await-member hint保留、不误写全严重度零。四MD unavailable（marksman/typos ready0/2），sessionall450文件27继承warning/35hint-info，未ignore/禁rule/清cache，不以silent/unavailable称workspace clean。

人工最小3502B English摘要审preview后固定`jev-1.13.0` advisory（外内wrapper均必要OS白名单＋唯一必需key，不输出值），3send源WX，无源码/资源/秘密/ID/profile/完整日志；不是PCM/SQL/权限/originalmechanism/goal oracle。

实际Music/MapView/directImage资源角色接线、context缓存/大fallback、RuntimeManifest/profile/chapterId-slotMap/255-G127初始化原证、所有435依赖与认证Trial/mutating/network门、publish-listing-registry公告/allhistoryrefs-body-providerCPUlegacy-drain/physicaldelete410-scrub-cacheactualbackuprestore/完整工作台与全部73Q仍open。无用户SAVE/profile-IDB/共享清理/install/trust/cloud/commit/push/deploy，goal active。

## 后继现行库原生FLAC只解码

在[现行库隔离联合链](editor-backend-private-byte-context.md#后继浏览器json及小图解码)继续扩展 `verify_private_library_browser.mjs r4`，原样交付 `privateaudio.js`，通过明确的现行libraryIdentity与实际HTTPS权限GET取数。模块／服务／库定义未修改；不覆盖首批封存mirror，也不把旧native-r2当作当前源码证据。

`.dragon-analysis/editor-completion/private-audio-browser-r4.log` 首轮6组通过，收据 `.dragon-analysis/editor-phase/private-library-browser-r4/receipt.json`：

- 使用原生 `OfflineAudioContext(2,1,48000)`，不创建声源、不调用startRendering、不连接输出设备。实际库 `grf/music/loops/OVERBGM.flac` 的SHA与本地固定文件相同；独立读取STREAMINFO为49700Hz／2声道／2128609帧。浏览器解码为48000Hz／2声道／2055799帧，符合既有重采样一帧计数容差，duration等于length/rate；所有声道样本finite且有非零值。
- 持有handle时再次读取在GET前报 `PRIVATE_AUDIO_OWNED_BUDGET`。dispose幂等后，故意修改旧AudioBuffer样本，再次显式读取得到新GET／新AudioBuffer，其PCM SHA仍与第一次修改前一致；没有已解码缓存或对象别名。
- close幂等、closed读不发GET；已交付AudioBuffer的PCM保持可读且SHA不变，原生OfflineAudioContext仍suspended。只释放封装持有记录，不清零／撤销调用者已获得的音频，不声称DRM、垃圾回收或provider取消。
- 记录PCM SHA是同次原生实现的重复性／别名检查，不是独立FLAC解码器逐样本oracle，不认证全部11曲、循环点、音质或播放。四准入位始终false。
- 保留该联合链此前真实登录改密／登记／复制、准确旧1与当前2、JSON／两种PNG／迟到bitmap和旧cookie401等验证。十三次资源GET为十二200／一401，正式IDB0、草稿对象／请求账本保持，页面错误／外连均空，stderr为0。21项关键源码SHA运行前后及事后复核一致，参数／PCM SHA详见收据及 `private-audio-browser-recheck.json`。

本批只有测试及文档变化，不重建两束、不跑无影响Root／规则／发布长链；该批次现行库WAV尚待验证，后继聚焦见下；全部音频与所有迟到解码边界、已交付工作台／MusicPlayer接线和完整资源闭包仍开放。语法、shell65及diff通过；主动LSP使用30秒，测试为push-only未确认，三文档warning视图clean；mode=all缓存95文件仍31项既有warning／1项hint，未屏蔽。

## 后继现行库WAV与迟到解码

`verify_private_library_browser.mjs r5` 继续同一真实Node／HTTPS／SQLite／FileBucket／新Chromium联合链，未修改产品模块、预算或权限。`.dragon-analysis/editor-completion/private-audio-lifecycle-r5.log` 首轮8组通过，收据 `.dragon-analysis/editor-phase/private-library-browser-r5/receipt.json`，保留此前各轮。

- 实际库 `grf/sfx/ynsound-record13.wav` SHA `1ca03754da6b6911b018ba995333218e953f053066209d181c5781c0b994f11d`，测试只接受该样本的RIFF／16字节fmt／整数PCM16双声道／data完整封装，不实现第二通用WAV解析器。输入49700Hz／29826帧，与原生同采样率OfflineAudioContext解码的声道／帧／duration一致。
- 逐样本复核上文已隔离证明的当前Chromium转换控制 `f32(integer*f32(sign<0?1/32768:1/32767))`，整个Float32 PCM SHA严格相等，无epsilon。两声道SHA均为 `4be859672dab4cab783d6b2b4166dafbda9f6127ffe359f1679a3620ee42b2a8`。这是当前浏览器／固定PCM样本的转换校验，不是原OPL公式或所有浏览器保证。
- 另一次真实WAV GET及原生decodeAudioData完成后，仅通过自有端口延后返回，不伪造AudioBuffer。pending期间再读报 `PRIVATE_AUDIO_OWNED_BUDGET`，不新增GET；关闭context后释放返回，明确 `PRIVATE_AUDIO_CLOSED`，没有交付handle。重复close及closed读取保持，decoder只调用一次。
- provider端已经获得的真实PCM仍与独立转换SHA相同；调用者OfflineAudioContext保持suspended，未创建声源／启动渲染／连接扬声器。该行为不清零外部buffer、不取消原生provider、不宣称drain或即时撤销。四准入位false。
- 包括此前字节、JSON、小图、FLAC和改密撤旧cookie在内，共十五次资源GET为十四200／一401；21源码SHA运行前后及事后复核一致，页面错误／外连／正式IDB0、stderr为0、草稿对象／请求账本保持。独立复核 `private-audio-lifecycle-recheck.json` 保存WAV参数、PCM SHA、三种拒绝码和网络状态。

本批仍仅测试／文档变化，不重建两束，不重复无影响Root／规则／发布长链。没有认证全音频、全部await／身份矩阵、播放、工作台消费接线或完整依赖闭包。后继r6另证不调用close、只改变调用方代次时PNG及WAV迟到交付拒绝，维护于[共同字节上下文](editor-backend-private-byte-context.md#后继浏览器调用方代次失效)，不是实际服务权限撤销或宿主接线证明。语法、shell65及diff通过；主动LSP用30秒，测试仍push-only未确认，两文档warning视图clean；mode=all缓存95文件仍31项既有warning／1项hint，未屏蔽。
