# E-05-CHAPTER-PROJECTION-1：单章编译投影基础（前批历史）

后续已实际接服务/cache/工作台/真实App，见[单章试运行](editor-chapter-trial.md)；下文“未接”等只描述本纯基础封存阶段，不作当前状态。完整Q69静态依赖闭包仍未认证。

Q69产品允许其它章未完成而只测试已完成章，不能跳过共享依赖或原槽数据。此独立基础只验证源投影，不称Q69整体完成，服务/工作台目前仍全源编译。原证/初始化/profile门和真正私有资源授权不放宽，后台配置仍局部待提供。

## 实现与确切范围

`web/src/editor/trialscope.js#projectTrialChapter`先走当前共同`validateGameSource`的结构/地图/槽引用/有限JSON门；所选章须存在且章序唯一。Clone后只保该章在chapters/chapterOrder，其它所有共享字段原样保留，完整selected.state不剪将领/未活动槽、关系/事件/天气/兼容字段；不是新章或新将初始化器。现旧generals128字典仍是兼容资料，不能用投影掩盖人物库身份问题。

同时输出`savedSourceDigest`与`selectedSourceDigest`：前者绑定完整已保存草稿，后者绑定具体投影内容，必须分别核验，不能把子集摘要当整源或两不同scope共用snapshot身份。该函数无FS/网络/RNG/时间，无保存/API，未修改共享compiler。资源捕获、服务scope目录/cache/manifest身份、迟到请求及真实App尚未接线/认证；保留资源字段不等于已证明全部可达资源完整。

## 实際 focused 验证

`node tools/verify_editor_trial_scope.mjs`只读取已批准新current39 Web输入和共同copy/compile模块。完整20章副本与单章投影分别同compiler编译：terrain/roadGraph/roadCost/roadOffset/geography/minimapGeography完全同、所有共享字段和selected.state全文同；其它章state缺城市时整源仍拒绝，投影可编译。六拒收含未知章/重复章/缺章/坏所选city/坏共享道路/无关章NaN（不安全JSON不是无关表单缺项），caller深比较不变。

[最终unit-r3](../.dragon-analysis/editor-phase/trial-scope-session-r1/unit-r3.log)PASS；r2保持旧参数风格时已通过，随后negative helper布尔flag诊断按callback分离、期望不变后r3重跑。r1是测试调用错把`copyBuiltinGame`当双对象参数，立即触gameId类型门。已读真实签名，仅修测试caller为结构参数＋sha函数，不改产品/门/期望；[原失败](../.dragon-analysis/editor-phase/trial-scope-session-r1/unit-r1.log)保留。

两个新JS语法，active LSP均无剩余诊断但push-only不可确认/0confirmed-clean；4Markdown unavailable，session全181文件仍3旧warning（parser两未调用路径、控制码正则已有意图裁决），新增flag诊断已实际消除而非忽略/清cache。原证不涉及新公式/别名，确定投影步骤不需要Jev分流或发送原数据。session及[独立最终核签](../.dragon-analysis/editor-phase/trial-scope-session-r1/static-receipt-r2.json)单列；原61/134生产/回归源、新current39/作者2保全。没有新增62门全套、service/UI/browser/初始化认证，不复跑未改生产全套或拼历史通过。前批日期静态的docSHA属其封存时刻，本页/新增I/O登记另签。不读写真实SAVE/profile/DOS、默认草稿、Web资产或网络，无commit/push/deploy/全局改动。

## 后继共享兼容资源的双章拒收矩阵

当前 `verify_editor_trial_scope.mjs` 增补六个负控：分别破坏共享roadCost字节、roadOffset JSON及道路nativeBinding flags，对两个不同的完整章各执行一次。每例先确认全源编译按对应错误拒绝，再确认投影原样保留共享兼容资料／地图，所选章编译以相同错误拒绝；请求前后源对象深比较不变。测试只检验现有固定域准入，不为新道路或原版flags添加规则。

完整入口通过，20章、14个负控（其中本批共享矩阵6个）；原“其它章未完成可单章编译”、完整／所选资产相同、有限JSON及其它拒收保持。证据 `.dragon-analysis/editor-completion/trial-shared-scope-20261029/{tests-r1.log,before.json,after.json}`，428项选定源码／Web输入SHA前后相同，语法／diff及锚点检查通过。主动LSP脚本超时未确认，文档仅台账三处既有标识／摘要词典hint；mode=all同样保留代码pending，不冒clean。仅已有Web固定来源及内存副本，无网络、数据库、浏览器、真实SAVE或产品代码改动；未重建不变的程序束。不是画像／TALK／战场全部资源闭包、服务认证或完整Trial启动证明，A20仍部分。

## 下一实际接线

服务须捕获已保存整源，再形成具体scope投影/manifest，同时核full/selected摘要、game/revision/chapter/snapshot边界；scope缓存不能覆盖旧whole构建或其它章，不允许读取另scope资产。选中坏引用/必需资源或共享地图坏仍禁启动，全源校验不能因单章成功放行。实际UI/App/旧Trial迟到资源、禁存与不回写场景独立验证；不得把本纯函数当这些已完成。
