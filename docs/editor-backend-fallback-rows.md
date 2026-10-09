# 固定整图逐行生成（E-01-BACKEND-FALLBACK-ROWS-1）

本批补[私有库读取](editor-backend-library-assets.md)之后的整图生成基础，不开放新权限或运行入口。全部437旧源码（含375玩家输入）保持；新增纯像素核心、PNG流适配器及两项显式验证，声明441。原PNG decoder的4Mi pixels限制、六图Job、Root和共享规则/AI不改。

## 实际支持与预算

先用原兼容flags／已装Miniflare的独立loopback探针证明`node:stream`、`node:stream/promises`和`createDeflate`确实可用：64行、1,572,928原始bytes往返通过。不是平台CPU/内存承诺。

`web/src/content/authoring/tilepixels.js#createFixedTileRows`在调用时立即intrinsic检查并独立捕获98304-byte已编译plane及262144-byte RGBA atlas；拒shared/resizable/proxy/非byte/长度错，own getter不执行。固定384×256、16px、256×256不透明atlas，行优先从原tile编号的16×16位置复制样本，每次产生一行24576 bytes。atlas不透明条件是本适配器支持域，不是游戏机制；四固定atlas已实际核全alpha255。没有隐藏层猜测、RNG、规则写入或从图片反推terrain。

`server/rowpng.js#encodeRowPNG`编码标准非交错RGBA8 PNG。宽≤6144、高≤4096；输入每行必须准确width×4，恰好height行。标准zlib pipeline／backpressure使用32KiB输入与64KiB输出队列，每行独立捕获，加filter0；不物化96MiB整图或同时展开四季。IDAT CRC、IEND及输出总量含封装≤16MiB；错误／预算超限关闭owned streams并返回源iterator，不返回部分PNG。压缩产物在内存收集后拼接，可能同时持有压缩parts与最终buffer；此限制不是整个Worker内存上限或CloudflareSLA，后继持久化仍需自己的预算／租约／epoch。

不改变旧decoder或其拒绝整图的负控；新生成器不是扩大任意PNG解码域。版本分别`fixed-tile-pixels-1-rows`／`png-rgba8-rows-1`。未接原六图planner／Job／artifact API，旧Job和key不迁移；完整fallback依赖只有生成基础被验证，尚未授予RuntimeManifest／Q69准入。

## 当轮证据

独立`.dragon-analysis/editor-phase/backend-fallback-rows-session-r1`保存437 before、探针、源码／日志、12实际PNG与Pillow结果，wx不覆盖。唯一主producer六组、七实际loopback Worker请求；无认证Root／SQLite/R2／浏览器动作，不混为旧私有API重验。

- Node和实际workerd分别生成四季6144×4096整图，独立Pillow对固定manifest的原整图完整RGBA SHA和尺寸：八PNG全部同。输入捕获后修改caller plane及atlas不改结果。生成PNG约3.47–3.58MB，PNG编码byte不冒原palette编码等同。
- 两个相距较远的tile显式变更，Node及workerd两PNG与Pillow在原整图上使用原atlas独立替换对应16×16的完整结果同；原plane及atlas不改。仅验证pixel投影，不把裸plane编辑当完整作者编辑／compiler许可。
- 两个9×7RGBA PNG保奇数宽和透明像素非零RGB，独立Pillow逐样本相等；12产物完整byte及pixel SHA留档。
- getter0、view／长度／透明atlas拒，尺寸、行长、少行／多行及source抛错均拒；owned iterator实际关闭。
- 实际Node及workerd用确定性xorshift测试噪声（仅夹具，非规则RNG）超过16MiB压缩预算后拒；Node只消费685/4096行，iterator关闭，两者不返回PNG。原型backpressure／错误路径获实际验证，不承诺用户任意代码可取消或即时物理GC。

Python通用路径规则报告`Image.open(BytesIO(data))`；这里只消费捕获bytes，固定路径先resolve留ROOT。同源码clone／owned临时目录junction实际将允许的输出路径导向ROOT外，真实guard在读取输出前拒绝，stderr和代码SHA留档；仅精确裁决此行误报，不关规则／清缓存／写忽略或重跑12正例。

没有失败测试或放宽期待、延时赌绿；执行前修正新Python import／unused及封装初始字节计数。主动LSP／session-all／语法／imports／固定路径与保护SHA／文档链接独立封存；inconclusive或不可用不报clean。无需重复未改的账户、TLS、库、六图Job或玩家回归。

## 接续

仍需将整图按实际准确source、authority／epoch／租约和分块R2协议接入持久图像任务，全部资源消费者／CSS-loader-audio／G127/255与Q69，RuntimeManifest和完整Trial网络/异步/计时门、完整编辑表单／初始化、发布玩家／删除备份及全目标验收。没有commit/push、部署／云创建、安装／全局trust、真实profile-IDB／DOS-SAVE或共享清理；主goal保持active。
