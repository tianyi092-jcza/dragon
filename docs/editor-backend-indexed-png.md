# 固定库索引PNG补齐（E-01-BACKEND-INDEXED-PNG-1）

本批从[固定byte库](editor-backend-available-library.md)实际格式排查继续，不新增原游戏机制、上传权限或运行资格。原433源及375玩家输入先封存；只改PNG适配器、六图planner版本和两关联验证，原资源、共同引擎、Root、目录及权限不改。

## 缺口定位与标准补齐

376张固定库PNG的实际IHDR：26 RGB8、157 RGBA8、25 indexed8、168 indexed4，全部非交错；最大256,000 pixels／44,033 bytes。旧解码器实际成功208、明确拒168，错误都是`PNG_UNSUPPORTED_FORMAT`；150头像、15 kyo与3 ivent使用4bit索引，不是坏资源或预算超限。`headers-r1.json`及`baseline-decode-r1.json`保原SHA、逐路径事实，四处旧源wx归档；没有重编码素材或以其它头像替代。

`server/pngio.js`新增非交错indexed1/2/4：扫描行stride取packed bit长度向上整byte，滤波器的左样本距离仍一byte，按高位在前提取每像素索引；行尾padding不当额外像素。PLTE长度不得超过位深可表示的颜色数，任何实际索引越palette仍拒。原indexed8与8bit灰度／RGB／灰度alpha／RGBA、五filter、tRNS与alpha0处RGB保持。

尺寸／chunk／CRC／顺序／zlib实际消费与长度／palette透明／unsupported critical／颜色管理／动画门均保留。灰度低位深、交错、16bit及未支持元数据仍拒；16MiB／4Mi pixels工程预算不放宽，仍不能解6144×4096整图。原始样本相等不宣称任意浏览器颜色管理等价。

PNG版本推进为`png-io-2-noninterlaced8-indexed124`；使用该I/O版本的planner推进`fixed-copy-images-2-indexed124`，由原派生规则自然得到`fixed-copy-images-2-indexed124-job-1`和新pipeline。报告schema结构不变。旧SQL Job不得自动重贴新compiler／pipeline或复用旧key启动新任务；实际owned旧compiler／旧pipeline tuple的query及run均409。原源、游戏修订、profile、像素／PNG及旧档案不热换，不将Job升级冒用户原操作成功。

## 当前实际验证

独立`.dragon-analysis/editor-phase/backend-library-png-session-r1`保存before、格式和旧解码定位、当前源码、日志与oracle；新fixture及报告均wx。所有输入固定白名单，Node/Python均实际resolve且必须留仓库；Pillow从捕获bytes解码，非生产依赖。仅已装Miniflare及原兼容flags／白OS环境／owned loopback；关联服务使用owned SQL/R2、随机工程配置与本机HTTPS。

- 库图像三组412实际Worker请求：376库图＋4 atlas／2 mini＋12独立packed fixtures全部Node／workerd尺寸和完整RGBA SHA等于独立Pillow，共394正例；18精确Node／Worker负控。新fixtures涵盖1／2／4位、宽1／3／8／9、全部五filter、跨byte／行尾非零padding、alpha0的非零RGB。拒绝涵盖越palette、位深palette上限、扫描行短／超长、透明长度、CRC／filter／压缩流残尾及仍不支持的灰度4／深度3。
- 原PNG五组63实际Worker回归：16输入及33实际新编码独立Pillow，30原CRC／deflate／结构／预算等负控保留；原「indexed4不支持」负控更正为仍不支持的gray4，对应本批明确新增支持，不放松坏数据。该验证的历史417保护基准不能覆盖后来合法后台变化，改为本批433来源及429未改输入，不追认旧producer为当前源。
- 持久图像Job九组56实际HTTPS：准确旧saved1／current2、lease到期与真实重启恢复、七产物R2／六PNG、ready/CAS/checkpoint/pipeline损坏、输出await改密401均通过；新增旧compiler/pipeline拒绝无自动迁移。六PNG字节与此前独立Pillow封存产物完全同，诚实复用其旧像素证据，不谎称本批重新跑六图Pillow。
- 实际默认Root阶段API七组42 HTTPS通过，原data29／images7、重建／私有产物／权限／SQL损坏与真实重启保持。与PNG的475 loopback Worker请求分开统计，不冒同类HTTP或全量浏览器覆盖。

新Pillow oracle的通用路径规则在`Image.open(BytesIO(data))`处报告sink；实际路径已固定白名单＋resolve留ROOT，读取后仅传捕获bytes。用原样oracle clone／owned OS temp／允许的fixture拼写和目录junction实际把文件导向ROOT外，执行在真实ROOT guard拒绝，stderr及代码SHA封存；因此仅精确裁决此行误报，不关规则、不清缓存或加忽略。394正例不重跑。

没有失败赌式重跑；Python新oracle的import排序在执行前定点修正。支持主动LSP与session-all、语法／imports／精确逆差／所有保护SHA及文档链接另封存，unsupported/unavailable/inconclusive不报clean。新两工具使声明435；429旧输入（含375玩家）全保，四旧改可准确反向恢复其原byte。

## 尚缺

解码168张既存图片不证明G127/255可达性或初始化闭包，也不新增`kao/255.png`。库asset权限／固定scope与全部CSS/loader/audio、整图fallback、RuntimeManifest、完整Trial输入/异步/计时认证门、发布／玩家／删除备份、完整实体和章节编辑仍缺。保持主goal active；没有commit/push、部署或云创建、安装／全局trust、真实profile-IDB／DOS-SAVE／共享清理。
