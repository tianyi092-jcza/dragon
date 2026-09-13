# 静态部署与自动发布

## 部署边界

游戏没有服务端 API、数据库、WebSocket 或云存档依赖。部署到域名根目录，保留目录结构和文件大小写。正式站点使用 HTTPS；浏览器必须允许 IndexedDB。不要上传仓库根目录、原版程序、真实存档或本机配置。

推荐 Node.js 22，执行 `node tools/prepare_deploy.mjs` 生成 `dist/`。这是可选复制步骤，不是游戏编译；完整 `web/` 仍可直接运行。脚本每次重建固定的 `dist/`，检查单文件不超过 25 MiB、文件数不超过 20,000 及大小写冲突。Cloudflare 套餐限额可能变化，以官方文档为准。

发行包排除试听与逆向音频证据、调试日志、探针、设计源文件和展示截图；这些不等于可从研究仓库删除。运行中的 FLAC、两份效果音 WAV、开场 MP3，以及结束画面保留。尚未接入的 ENDBGM 原始导出仍保留在仓库，不随当前运行包发布。

## Pages Git 自动部署（推荐）

1. 登录 Cloudflare，在 **Workers & Pages → Create application → Pages → Connect to Git** 创建项目。
2. 安装／授权 Cloudflare GitHub 集成，仅选择所需仓库，例如 `tianyi092-jcza/dragon`。首次 OAuth 和账号选择需要仓库所有者完成，不能用 Wrangler 登录替代 GitHub 授权。
3. 选择生产分支 `main`，框架 `None`，仓库根目录保持默认。
4. 构建命令：`node tools/prepare_deploy.mjs`；输出目录：`dist`；环境变量可设 `NODE_VERSION=22`。
5. 保存并部署，记录实际分配的 `*.pages.dev` 地址。不要把示例项目名或预期域名当作已上线地址。
6. 后续 GitHub `main` 推送自动发布；按需要关闭不必要的分支预览。部署失败时旧的成功版本通常仍可访问，应核对部署记录中的提交 SHA。

根目录 `wrangler.jsonc` 是 **Workers** 备选配置，不含 Pages 的 `pages_build_output_dir`；Pages 在控制台使用上述配置，不应把浏览器 JS 设为 Functions／Worker 入口。

如需 Git 集成，首次不要用 `wrangler pages project create` 创建 Direct Upload 项目。Direct Upload 和 Git 集成的项目模式存在切换限制；临时命令行上传不等于已建立推送自动部署。

自定义域名必须在 Pages 项目的 **Custom domains** 中添加并按提示配置 DNS／证书，不要仅手工添加 CNAME 就视为完成。修改域名不会迁移浏览器存档。

## Workers Static Assets（备选）

使用 `wrangler.jsonc` 纯静态资源配置，不部署游戏后端。默认项目名是 `dragon`；首次发布前确认账号下没有会被覆盖的同名项目。

```bash
npx wrangler@4 login
npx wrangler@4 whoami
npx wrangler@4 deploy --dry-run
npx wrangler@4 deploy
```

Wrangler 自动执行配置中的复制命令。账号有多个时，用本机环境变量 `CLOUDFLARE_ACCOUNT_ID` 指定正确账号；不要在仓库写凭据。

如选择 Workers 的 Git 自动部署：在 Cloudflare 控制台连接 GitHub 仓库、生产分支 `main`，根目录选仓库根，部署命令用 `npx wrangler@4 deploy`；该命令已包含配置里的静态打包步骤。构建环境选择受支持的 Node.js 版本。平台界面和可用功能以当前账号为准，首次成功部署后再核对推送触发记录。Pages 与 Workers 二选一即可，不必为同一站点同时创建两套生产项目。

## 私有化部署

在自有服务器上将 `dist/` 内容交给 Nginx、Caddy 或其它静态服务器。提供正确 MIME：JS 为 JavaScript、JSON 为 JSON、WASM／二进制如有则按对应类型、FLAC 为 `audio/flac`。不要开启把所有缺失路径重写到首页的 SPA fallback。

- 公网生产站使用 HTTPS，局域网普通 HTTP 不等同于安全上下文；某些浏览器功能可能受限。
- 私人站点应增加反向代理认证、VPN 或 Cloudflare Access，不能依赖隐藏链接。
- 使用 Access 时检查自定义域名、默认 `pages.dev`／`workers.dev` 地址及预览地址，防止未保护的别名绕过认证。Pages 的预览访问控制不自动等于生产域名已受保护。
- 存档仍在用户浏览器中；服务器备份网站文件不会备份个人存档。

## 缓存与 404

`web/_headers` 随发行包复制，为未内容寻址的资源设置重新验证缓存与 `nosniff`。不要另行配置全站长期 `immutable` 或覆盖性“Cache Everything”规则，否则更新可能混用旧 JS 和新数据。

`web/404.html` 使 Pages 缺失资源返回 404；Workers 配置使用 `404-page`。静态服务器若不识别 Cloudflare `_headers` 文件，需要在自身配置中设置响应头。返回 404 HTML 可以接受，缺失 `.js`／`.json` 返回 **200 首页 HTML** 则不正确。

## 上线验收

使用全新浏览器配置／上下文，不接触用户真实存档：

1. 首页和资源返回成功状态、正确 MIME，没有外站运行依赖或控制台错误。
2. 任意不存在的 `.js`、`.json` URL 返回 404，不返回 200 首页。
3. 开场、跳过、新局、战略地图及战术入场正常，首次用户手势后声音可播放。
4. 在隔离环境检查四槽保存、返回标题读取、刷新及双标签页单实例行为。
5. 核对部署提交 SHA、自定义域名 HTTPS 和缓存头；再次推送验证自动部署。

不要把本地静态测试通过写成 Cloudflare 已上线；也不要将冒烟测试描述为全部游戏机制或所有浏览器已验证。

## 双仓库同步

保留 Gitea `origin`，GitHub 使用独立远程名 `github`。两次推送相互独立，任一失败都必须单独报告；不要用强制推送覆盖远端新增提交。

```bash
git remote -v
git push origin main
git push github main
```

新克隆 GitHub 仓库时默认 `origin` 指向 GitHub，上述名称只适用于本项目维护工作副本，应先核对地址。Cloudflare Git 集成监听 GitHub，不会因仅推送 Gitea 而触发。

## 官方参考

- [Pages 静态站点](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- [Pages Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Pages 限额](https://developers.cloudflare.com/pages/platform/limits/)
- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
