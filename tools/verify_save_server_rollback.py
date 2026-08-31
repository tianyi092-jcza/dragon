"""parse或canonical发布失败时三份输出必须完整回滚；禁止真实SAVE写入。"""

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


source = ROOT.parent / "Dragon" / "SAVE.DAT"
source_before = source.read_bytes()

for failure_env in (
    {"DRAGON_SAVE_TEST_FORCE_PARSE_FAILURE": "1"},
    {"DRAGON_SAVE_TEST_FAIL_REPLACE_AT": "2"},
    {"DRAGON_SAVE_TEST_FAIL_REPLACE_AT": "3"},
):
    with tempfile.TemporaryDirectory(prefix="dragon-save-rollback-") as temp:
        root = Path(temp)
        save_dat = root / "SAVE.DAT"
        save_json = root / "save.json"
        save_meta = root / "save.webmeta.json"
        lease = root / "lease.json"
        save_dat.write_bytes(source_before)
        save_json.write_text('{"slots":[{"sentinel":1}]}', encoding="utf-8")
        save_meta.write_text(
            '{"schema":1,"slots":{"0":{"sentinel":2}}}', encoding="utf-8"
        )
        env = os.environ.copy()
        env.update(
            {
                "DRAGON_SAVE_DAT": str(save_dat),
                "DRAGON_SAVE_JSON": str(save_json),
                "DRAGON_SAVE_META": str(save_meta),
                "DRAGON_INSTANCE_LEASE": str(lease),
                **failure_env,
            }
        )
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
                    connection = http.client.HTTPConnection(
                        "127.0.0.1", port, timeout=0.2
                    )
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
            # 启动会按canonical SAVE+sidecar主动重建save.json；事务回滚基准取启动后状态。
            before = (
                save_dat.read_bytes(),
                save_json.read_bytes(),
                save_meta.read_bytes(),
            )
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
            assert response.status == 500, failure_env
            assert (
                save_dat.read_bytes(),
                save_json.read_bytes(),
                save_meta.read_bytes(),
            ) == before, failure_env
            assert not list(root.glob(".*.tmp")), "staged files not cleaned"
            assert source.read_bytes() == source_before
        finally:
            server.terminate()
            server.wait(timeout=10)

# 模拟进程在第一次canonical replace后硬退出：下一次启动必须先按持久journal
# 恢复三文件，再重建save.json；整个测试仅使用临时SAVE副本。
with tempfile.TemporaryDirectory(prefix="dragon-save-crash-recovery-") as temp:
    root = Path(temp)
    save_dat = root / "SAVE.DAT"
    save_json = root / "save.json"
    save_meta = root / "save.webmeta.json"
    save_journal = root / "save.publication-journal.json"
    lease = root / "lease.json"
    save_dat.write_bytes(source_before)
    save_json.write_text('{"slots":[]}', encoding="utf-8")
    save_meta.write_text('{"schema":1,"slots":{"0":{"sentinel":2}}}', encoding="utf-8")
    base_env = os.environ.copy()
    base_env.update(
        {
            "DRAGON_SAVE_DAT": str(save_dat),
            "DRAGON_SAVE_JSON": str(save_json),
            "DRAGON_SAVE_META": str(save_meta),
            "DRAGON_SAVE_JOURNAL": str(save_journal),
            "DRAGON_INSTANCE_LEASE": str(lease),
        }
    )
    crash_env = {**base_env, "DRAGON_SAVE_TEST_CRASH_AFTER_REPLACE": "1"}
    port = free_port()
    server = subprocess.Popen(
        [sys.executable, str(ROOT / "tools" / "webserver.py"), str(port)],
        cwd=ROOT,
        env=crash_env,
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
        before = (save_dat.read_bytes(), save_meta.read_bytes())
        candidate = bytearray(source_before)
        candidate[0] ^= 1
        try:
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
        except (OSError, http.client.HTTPException):
            pass
        server.wait(timeout=10)
        assert server.returncode == 91
        assert save_journal.exists()
        assert save_dat.read_bytes() != before[0]
    finally:
        if server.poll() is None:
            server.terminate()
            server.wait(timeout=10)

    # lease来自已崩溃进程且仍在期限内；恢复测试不需要acquire，只需等服务器就绪。
    restart_env = {**base_env, "DRAGON_LEASE_MS": "1000"}
    port = free_port()
    restarted = subprocess.Popen(
        [sys.executable, str(ROOT / "tools" / "webserver.py"), str(port)],
        cwd=ROOT,
        env=restart_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    try:
        ready = False
        for _ in range(100):
            try:
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=0.2)
                connection.request("GET", "/")
                response = connection.getresponse()
                response.read()
                connection.close()
                if response.status == 200:
                    ready = True
                    break
            except OSError:
                time.sleep(0.03)
        assert ready
        assert (save_dat.read_bytes(), save_meta.read_bytes()) == before
        assert not save_journal.exists()
        assert json.loads(save_json.read_text(encoding="utf-8"))["slots"]
        assert not list(root.glob("*.backup"))
        assert not list(root.glob(".*.backup"))
        assert source.read_bytes() == source_before
    finally:
        restarted.terminate()
        restarted.wait(timeout=10)

print(
    "save server rollback OK: parse/replace failures and post-replace crash recover all outputs"
)
