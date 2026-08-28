"""本地开发服务器：静态文件 + 存盘 API。

用法: python tools/webserver.py [端口]     (默认 8321)
  GET  /*                 静态文件 (web/ 为根)
  POST /api/save          body=SAVE.DAT 原始字节 → 覆写 ../Dragon/Dragon/SAVE.DAT
                          并重跑 parse_save.py 刷新 web/save.json，返回 {"ok":true}
  GET  /api/saves.json    返回最新 save.json 内容
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "web"
SAVE_DAT = Path(__file__).resolve().parent.parent.parent / "Dragon" / "SAVE.DAT"
sys.path.insert(0, str(Path(__file__).resolve().parent))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        # 开发服务器: 禁缓存, 避免 JS 模块更新后浏览器用旧文件报错
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/saves.json":
            data = (ROOT / "save.json").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/save":
            self.send_error(404)
            return
        n = 0
        try:
            n = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            self.send_error(411)
            return
        body = self.rfile.read(n)
        if len(body) != 4 * 0x56C0:
            self.send_error(400, f"bad size {len(body)}")
            return
        SAVE_DAT.write_bytes(body)
        # 重跑 parse_save.py 刷新 save.json
        import subprocess

        r = subprocess.run(
            [sys.executable, str(Path(__file__).resolve().parent / "parse_save.py")],
            capture_output=True,
            text=True,
        )
        ok = "OK" in r.stdout
        out = ('{"ok":%s}' % ("true" if ok else "false")).encode()
        self.send_response(200 if ok else 500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, format, *args):  # noqa: A002 - 基类参数名
        pass


if __name__ == "__main__":
    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
    except ValueError:
        port = 8321
    print(f"serving {ROOT} at http://127.0.0.1:{port}  (SAVE.DAT -> {SAVE_DAT})")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
