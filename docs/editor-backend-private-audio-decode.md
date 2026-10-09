# E-01-BACKEND-PRIVATE-AUDIO-DECODE-1 — 私有音频只解码

## 范围与接线边界

新`web/src/content/privateaudio.js#createPrivateAudioContext`与模型`tools/verify_editor_private_audio.mjs`，复用[privatebytes](editor-backend-private-byte-context.md)准确game/savedrevision/source/dependency/长度SHA和actualRoot授权GET。**旧520输入/119imports/375玩家、Root/API/schema/privateresources/MusicPlayer/原曲选择与循环全部不变**。模块opt-in，不装App或编辑器、不创建播放节点/扬声器、不签循环证书，也不从stage ready/decoded buffer导出Trial/发布许可。[共同合同](game-editor-technical-design.md)的全部资源接线仍未完成。

调用端显式提供原生AudioContext/OfflineAudioContext及可信本地生命周期assert；端口形状/参考DTO/hash不是服务权限。context固定采样率（8k..192kHz工程界），仅private-library `audio/flac/.flac`及`audio/wav/.wav`，flat own-data且原privatebyte完整字段门仍拒错配。只解析标准FLAC STREAMINFO/有限metadata（最多128块、必须已知正样本数、4..32bit及1..8声道），RIFF/WAVE整数PCM8/16/24/32bit（完整RIFF长度、最多128chunk、一fmt在data前、准确rate/byteRate/blockAlign/完整正样本）。MP3、未知样本数、浮点/WAVE扩展等保守拒，不宣称完整所有codec支持。

原生`decodeAudioData`负责FLAC frame/CRC/解压和PCM转换，模块不实现第二音频codec。metadata前估算和decode后复查声道、采样率、样本（允许标准重采样计数舍入1frame）、duration与Float32预算256MiB；这是工程界，**不是browser实际heap/CPU/峰值硬配额**，原压缩byte与PCM/decoder内部内存可共存。只有一个pending或owned handle，超界先拒；不缓存已解码结果，每次后来显式read都重新授权GET。

每await前后及最后检查caller生命周期，失败释放pending计数；late revoke/close拒结果，不能修复旧授权。handle冻结仅包装层，AudioBuffer可变/可被复制。dispose幂等/close永久只删owned引用，不清零buffer、不关闭共享AudioContext、不停止别人节点、不取消SQL/Job/provider，无DRM、即时撤销、GC或drain保证。

## 当前实际验证

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
