"""强制parse失败时canonical SAVE/meta/json必须保持不变；禁止真实SAVE写入。"""

import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


with tempfile.TemporaryDirectory(prefix="dragon-save-rollback-") as temp:
    root = Path(temp)
    source = ROOT.parent / "Dragon" / "SAVE.DAT"
    source_before = source.read_bytes()
    save_dat = root / "SAVE.DAT"
    save_json = root / "save.json"
    save_meta = root / "save.webmeta.json"
    lease = root / "lease.json"
    save_dat.write_bytes(source_before)
    save_json.write_text('{"slots":[{"sentinel":1}]}', encoding="utf-8")
    save_meta.write_text('{"schema":1,"slots":{"0":{"sentinel":2}}}', encoding="utf-8")
    before = (save_dat.read_bytes(), save_json.read_bytes(), save_meta.read_bytes())
    env = os.environ.copy()
    env.update({
        "DRAGON_SAVE_DAT": str(save_dat),
        "DRAGON_SAVE_JSON": str(save_json),
        "DRAGON_SAVE_META": str(save_meta),
        "DRAGON_INSTANCE_LEASE": str(lease),
        "DRAGON_SAVE_TEST_FORCE_PARSE_FAILURE": "1",
    })
    port = free_port()
    server = subprocess.Popen(
        [sys.executable, str(ROOT / "tools" / "webserver.py"), str(port)],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    try:
        token = None
        for _ in range(100):
            try:
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=0.2)
                connection.request("POST", "/api/instance/acquire", body=b"")
                response = connection.getresponse()
                payload = json.loads(response.read())
                connection.close()
                if response.status == 201:
                    token = payload["token"]
                    break
            except OSError:
                time.sleep(0.03)
        assert token
        candidate = bytearray(source_before)
        candidate[0] ^= 1
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
        connection.request(
            "POST",
            "/api/save",
            body=bytes(candidate),
            headers={
                "Content-Type": "application/octet-stream",
                "X-Dragon-Instance": token,
            },
        )
        response = connection.getresponse()
        response.read()
        connection.close()
        assert response.status == 500
        assert (save_dat.read_bytes(), save_json.read_bytes(), save_meta.read_bytes()) == before
        assert not list(root.glob(".*.tmp")), "staged files not cleaned"
        assert source.read_bytes() == source_before
    finally:
        server.terminate()
        server.wait(timeout=10)

print("save server rollback OK: parse failure leaves canonical outputs untouched")
