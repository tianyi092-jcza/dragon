# 有界无DOM PNG I/O（独立适配器）

本页保留E-01-BACKEND-PNG-IO-1独立适配器轮的历史范围与证据；该轮未装图像Job／Root。后继[图像Job](editor-backend-image-jobs.md)及[阶段API](editor-backend-stage-api.md)已受权使用六图，仍非运行加载器。当前[packed索引补齐](editor-backend-indexed-png.md)将PNG版本推进2，新增indexed1/2/4并实测376固定库图；以下版本1的「低位索引不支持」只属历史，不再是现行支持域。大图／颜色管理／低位灰度／交错／16bit等拒绝保持，不把解码当Validation／Q69／Trial／Release许可。

## 实现与边界

- 版本`png-io-1-noninterlaced8`；仅Node标准库`node:zlib`，无DOM、Canvas、npm运行时依赖或第二套mini算法。Node与Worker同步inflate／deflate、消费长度的真实探针使用原兼容日期／flags，没有改SDK或配置。
- `decodePNG`规范捕获非共享Uint8 bytes，不执行调用者覆盖的buffer getter；返回独立RGBA原始样本。支持非交错8bit灰度、RGB、索引、灰度alpha、RGBA；索引PLTE／tRNS和RGB／灰度透明样本保留，包括alpha0处的RGB。
- signature、完整chunk边界／CRC／关键顺序／reserved bit／IEND、palette与透明条件、实际zlib消费长度、全部扫描行长度与五滤波器逐项检查。短读、额外压缩流、坏CRC／Adler、非法索引／filter、未知critical等不补像素。未知非critical数据只作CRC验证后跳过，不解释其文本；不签其元数据合法性。
- 明确拒交错、16bit及索引低位深、动画和未支持颜色profile／gamma转换。适配器是raw-sample I/O，不声称色彩管理或浏览器任意图片等价；固定输入没有这些未支持描述。`encodePNG`仅RGB8／RGBA8，filter0、标准zlib与完整CRC，输出独立byte。
- ≤16MiB输入／输出、≤4Mi pixels及4096 chunks是有限工程预算，不是Cloudflare CPU／内存／执行SLA。6144×4096整图回退超过像素预算并明确拒绝；不是整图消费者闭包。四atlas是256×256索引8bit；不解码原DOS资源、不新增原机制结论。

## 当前验证

证据目录`.dragon-analysis/editor-phase/backend-png-io-session-r1/`，源／固定输入／日志SHA与独立wx产物；只有自有loopback随机端口、内存Miniflare，无SQL／R2／认证权限主张。Pillow仅已装测试oracle，不进入生产。

- `png-r3`五组63实际Worker请求，30精确Node／Worker负控。
- 16独立Pillow RGBA oracle：五支持颜色类型、五滤波器／边宽／透明，四实际atlas、两固定manifest mini。Node与Worker解码像素全SHA一致。
- 32新Node／Worker RGBA编码及1共同mini RGB编码，另经Pillow独立解码对拍，不只自往返。共同mini renderer未改；禁止ambient RNG的实际编码通过，不引入平行纹理算法。
- 负控覆盖CRC／Adler／signature／截断／IEND／IHDR／chunk顺序和reserved bit、palette／tRNS／索引、unsupported格式／动画／profile、短行／filter、炸弹、压缩流残尾；额外Node拒proxy、DataView、非byte、SAB／超预算与编码长度／channels，覆盖的buffer getter消费次数0。
- `probe-r1`在Node加载前因Windows裸盘符import失败，未运行Worker；仅改合法file URL，`probe-r2`实际同步zlib／info.bytesWritten通过。
- `png-r1`因独立MF夹具未登记ESModule规则把`.js`当CommonJS，编解码未执行。已核既有启动器相同显式`.js/.mjs`规则并定点复用；保原producer／日志，不改SDK／产品／期望或盲跑。`png-r2`原四组53请求通过；随后补输出Pillow及10负控，r3通过。
- 支持的主动LSP／session-all另封存；push-only/inconclusive不报clean。ignored原生Request URL来源的规则误报精确裁决，不关规则或清缓存。原417输入（375玩家）全保；新三源使声明420。语法／imports／本地链接与源及失败档案另签。

## 尚缺

真实owner／source／profile装配到图像阶段、共同地图像素编译、产物持久检查点与恢复、全部资源／大图／头像消费者闭包、公共compile及runtime准入仍缺；本适配器不减少资料报告的四个missing门。继续[主目标工作表](editor-goal-completion.md)，不关闭E-01／E-06、Q69或主goal，不提交／推送／部署／创建云资源。
