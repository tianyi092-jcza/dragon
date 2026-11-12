# 编辑器 Vue LSP 兼容工具（仅开发期）

保留玩家／Trial 原生引擎、编辑器 **Vue 3.5.44**、Element Plus 2.14.8 和 pi-lens 4.4.12；这里只固定独立的 **@vue/language-server 2.2.12 + TypeScript 5.9.3**。它支持 Vue 3，不是把框架降到 Vue 2。

## 安装与使用

在 `E:/Dragon/web-port`（或你的仓库根）执行：

```sh
npm ci --prefix editor-ui/lsp --ignore-scripts --no-audit --no-fund
npm run --prefix editor-ui/lsp check
cd editor-ui
pi
```

- **从 `editor-ui` 启动新 pi 进程**。已实测新 SDK 会话能用本地 override 返回符号；从仓库父目录启动的同版运行时仍用了默认 launcher，虽然 `effective_config` 能看到嵌套配置。因此不能仅凭配置来源表声称 launcher 已生效，也不承诺老会话／仅 `/reload` 已切换。
- `editor-ui/.pi-lens.json` 只覆盖 `vue` 的 launcher 和初始化选项，设置 `vue.hybridMode:false`；SDK 来自此私有工具包而非用户绝对路径。配置不增加自定义检查规则、不关闭其它服务器或改变全局默认。
- 项目 launcher 仍受 pi 已有项目信任控制。若提示信任不足，由用户在 pi 中处理；不要自动设置信任、权限或改全局配置绕过。
- 独立 package／lock 只安装在 `editor-ui/lsp/node_modules/`，已忽略；不改编辑器运行时依赖、不进玩家或静态发布包、不执行包 lifecycle scripts。

## 原因与诊断边界

Vue LS 3.3.14 的类型服务要通过 `tsserver/request`／`tsserver/response` 桥使用外部 TS 服务。本机 pi-lens 4.4.12 没有接上此桥：服务器可初始化，却在 `_vue:projectInfo` 等待，导航／语义诊断超时。2.2.12 的 standalone 模式内部持有 TS 项目，不需要此桥。后续客户端真正接通桥后再另行升级；不要只延长等待、屏蔽诊断或盲目换插件。

`../jsconfig.json` 声明现有 JS ES Modules 的 Bundler 解析，解决 Element Plus 深路径 `.mjs` 声明查找；未通过关闭诊断、排除源码或 any 声明消除提示。

`npm run --prefix editor-ui/lsp check` 使用配置中的相同 launcher／options 启动全新进程：

1. 虚拟 TS Vue 文档的符号能返回；故意制造 TS2322，要求完整诊断及标准 publish 两条路径都能报出；修正后重新请求确认消失。
2. 逐个读取 `src/*.vue`，请求完整诊断；错误级诊断或模块声明解析提示 7016 会失败，其它提示照实输出。
3. 断言零 TS 桥请求、stderr 为空，关闭自己启动的子进程；不创建 fixture 源文件，不读存档／生产。

该版服务在 inter-file dependency 模式下 **advertise push，而非 pull**，但仍注册了完整诊断 handler，上述脚本明确调用它。pi-lens 的空 push／silent-on-clean 仍可能显示 unconfirmed，个别主动查询仍可能超时；不把空缓存当 clean，也不把此协议回归写成所有 pi-lens 检查都通过。需要完整确认时运行上述 check，并记录实际结果。

## 回退

只移走本目录上级 `editor-ui/.pi-lens.json`，退出并重新启动 pi，就恢复原内置 Vue 服务选择（及其当前桥接限制）。不删除或覆盖用户其它修改，不调整全局 pi-lens／Vue。`jsconfig.json` 只表达项目解析方式，可独立保留；私有依赖目录是否卸载由用户决定。

## 可复核来源

- [Vue LS v2.2.12 入口](https://github.com/vuejs/language-tools/blob/v2.2.12/packages/language-server/node.ts)：`vue.hybridMode:false` 走内部 TS 服务。
- [v2.2.12 standalone 初始化](https://github.com/vuejs/language-tools/blob/v2.2.12/packages/language-server/lib/initialize.ts)。
- 本机 pi-lens `docs/configuration.md` 的 `lsp.serverOverrides`／信任／命令数组规则；现场证据、失败范围与新会话验证见仓库 `docs/checkpoint-journal.md` §45。
