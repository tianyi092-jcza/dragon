#!/bin/sh
# 手动发布玩家端（Worker + Static Assets）的构建步骤，替代 push 触发的 Cloudflare 自动构建。
#
# 用法：
#   vps/manual-static-build.sh <输出目录>
# 产物：
#   <输出目录>/dist/                     要上传的静态资源（1442 文件）
#   <输出目录>/dist/static-release.json  清单，其 sha256 必须等于 publication.env 的 STATIC_RELEASE_SHA256
#   <输出目录>/wrangler.deploy.jsonc      去掉 build.command 的临时配置，路径已换成绝对路径
#
# 为什么不能直接在仓库工作树上跑 prepare_deploy.mjs：
#   1) Windows 工作树是 CRLF（core.autocrlf=true），而 Cloudflare 与 VPS 都用 LF 产物；
#   2) `git archive` 在 autocrlf=true 时会给**未声明 eol** 的文本文件补 CRLF（实测 45 个文件、
#      +0.43 MiB），`sourceTreeDigest` 却不变（它只覆盖 web/src/**.js 与 intro/styles.css，
#      这两类在 .gitattributes 里显式 eol=lf）。于是「看起来 digest 对上了」但 inventory sha 对不上
#      = 改 publication.env 的 pin 后容器 startup-failed。
#   因此必须 `-c core.autocrlf=false`。
set -eu

root=$(git rev-parse --show-toplevel)
out=${1:-}
if [ -z "$out" ]; then
  echo "usage: vps/manual-static-build.sh <输出目录>" >&2
  exit 2
fi
# Windows 的 git-bash 下面 node 只认盘符路径：`/e/x` 会被当成 `E:\\e\\x`。
to_native() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) (cd "$1" && pwd -W) ;;
    *) (cd "$1" && pwd) ;;
  esac
}
mkdir -p "$out"
out=$(to_native "$out")
root=$(to_native "$root")

rm -rf "$out"
mkdir -p "$out"
git -C "$root" -c core.autocrlf=false archive HEAD \
  server vps reader tools web VERSION .gitattributes .gitignore | tar -x -C "$out"

(cd "$out" && node tools/prepare_deploy.mjs)

# 临时 wrangler 配置：仓库里的 wrangler.jsonc 保留 build.command（手动 deploy 时它正好是我们要跑的
# 那一步，但那时 dist 已在 LF 目录里生成好，不能再让 wrangler 在别处重建）。这里去掉 build 段，
# main 与 assets.directory 一律写成绝对路径，避免依赖当前工作目录。
node - "$out" "$root" <<'NODE'
const fs = require('node:fs'), path = require('node:path');
const base = process.argv[2], repo = process.argv[3];
const source = JSON.parse(fs.readFileSync(path.join(repo, 'wrangler.jsonc'), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
delete source.build;
source.main = path.join(base, 'reader/site.js');
source.assets.directory = path.join(base, 'dist');
fs.writeFileSync(path.join(base, 'wrangler.deploy.jsonc'), JSON.stringify(source, null, 2) + '\n');
NODE

sha=$(node -e "console.log(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('$out/dist/static-release.json')).digest('hex'))")
echo "static-release.json sha256 = $sha"
echo "按 docs/game-storage-layout.md §15.6 部署；记得这个值要同时写进 publication.env 的 STATIC_RELEASE_SHA256。"
