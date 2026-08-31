"""Web 静态服务器。

新游戏章节及其静态资源由此服务器（或任意静态托管）提供；存档完全由玩家浏览器
IndexedDB 管理。本服务器不读取、解析、保存或分发 DOS SAVE.DAT，也不依赖原版程序目录。
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "web"


class StaticHandler(SimpleHTTPRequestHandler):
    """只从 web 发布目录提供静态文件。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        if os.environ.get("DRAGON_HTTP_LOG") == "1":
            super().log_message(format, *args)


if __name__ == "__main__":
    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
    except ValueError:
        port = 8321
    print(f"serving static web files at http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), StaticHandler).serve_forever()
