# 臥龍傳 Web 移植

使用原生 JavaScript ES Modules + Canvas 2D 重写1995 DOS《臥龍傳》。无模拟器、框架、构建步骤或npm运行时依赖。

## 运行与独立部署

完整的`web/`包含已转换的运行资产，可以独立复制到任意普通静态HTTP服务：

```bash
# 仓库根目录
python -m http.server 8321 --directory web
# 或
python tools/webserver.py 8321
# 浏览器访问 http://127.0.0.1:8321/
```

运行不需要原版目录或Python提取工具。请使用HTTP而非直接打开`file://`；单实例由浏览器锁管理，正式保存使用浏览器同源IndexedDB四槽。**不需要服务端SAVE API、token或lease**，旧README中的相反说明已作废。

不同域名/端口使用不同存储源；复制Web文件不会复制浏览器存档。自动化禁止访问`E:/Dragon/Dragon/SAVE.DAT`，保存测试只用内存、mock或隔离profile。

## 结构

```text
web/
├─ content/builtin/       可编辑章节、世界、图集/图块排列与来源记录
├─ data.json              编译后的运行模板（不是运行中Scenario或存档）
├─ map_tiles_*.png        四季整图派生缓存
└─ src/
   ├─ main.js            App装配、战略RAF与场景接续
   ├─ app/               无绘制的开局流程
   ├─ content/           内容目录身份与世界资源定义
   ├─ core/              输入、资源加载、音频与IndexedDB访问
   ├─ game/              规则、运行态、保存守卫与世界资源实例
   │  ├─ navigation/     每世界独立的道路/地形缓存与现有寻路算法
   │  └─ battle/         原版战术Session/RNG/VM与结算
   ├─ render/            Canvas绘制、表现时钟与输入桥接
   └─ ui/                标题、HUD、军师菜单及工作流

tools/
├─ import_builtin_content.py  显式离线导入原版非存档资料到新内容源目录
├─ compile_content.py         Web内容源→运行模板/地图/道路资产
├─ render_map.py              Web图集/布局→四季地图；保留离线解码API
├─ parse_*.py / export_*.py    原始证据与其它资产提取工具
└─ verify_*                   分层回归与隔离浏览器验证
```

一套规则/AI/UI内核使用不同内容，而不是两套玩法。当前尚未实现编辑器、地图扩容、任意内容包热切换、Loading动画或新通关过场；整体重构仍按批次推进。

## 内容开发

游戏不需要生成步骤。修改内容源时使用开发机Python/Pillow离线编译，先输出到临时目录比较：

```bash
python -B tools/compile_content.py --output /path/to/generated
python -B tools/verify_content_pipeline.py
node tools/verify_content_catalog.mjs
node tools/verify_world_resources.mjs
node tools/verify_start_flow.mjs
# 需要已安装的Playwright；测试自建临时发行副本/全新profile
node tools/verify_standalone_web_browser.mjs
```

格式、兼容字节、图集/世界约束、生成命令与未完成边界见[内容架构](docs/content-architecture.md)。运行资产不可手改以掩盖解析错误；原版机制只以可复核的指令/原始数据为证，不能从现有Web行为或测试反推。

## 开发资料

- [项目约定、常用命令与分级验证](AGENTS.md)
- [全局安全、证据与交互约定](../AGENTS.md)
- [数据格式与原始证据入口](../.agents/skills/re-data-formats/SKILL.md)
- [本批及历史验证记录](docs/checkpoint-journal.md)

本仓库保留离线逆向工具与已转换Web资源；原版程序目录并非Web运行依赖。素材来源与原始机制的已知/未知边界以对应技能、逆向笔记及资源证书为准。
