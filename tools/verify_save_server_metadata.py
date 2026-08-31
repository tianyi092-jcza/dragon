"""临时目录端到端验证webserver保存sidecar并由fresh /api/saves.json恢复。"""

import base64
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
SLOT_SIZE = 0x56C0


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


with tempfile.TemporaryDirectory(prefix="dragon-save-meta-") as temp:
    temp_path = Path(temp)
    save_dat = temp_path / "SAVE.DAT"
    save_json = temp_path / "save.json"
    save_meta = temp_path / "save.webmeta.json"
    lease_path = temp_path / "save.instance-lease.json"
    # parse_save需要可识别剧本底版；复制现有SAVE到临时文件，不修改真实存档。
    source = ROOT.parent / "Dragon" / "SAVE.DAT"
    source_before = source.read_bytes()
    # 四槽各自写入sentinel；fresh客户端必须先GET该binary再只替换一个槽。
    server_binary = bytearray(source_before)
    for slot_index in range(4):
        server_binary[slot_index * SLOT_SIZE + 0x52BF] = 0xA0 + slot_index
    save_dat.write_bytes(server_binary)
    save_json.write_text('{"slots":[]}', encoding="utf-8")
    rng = {"table": list(range(257)), "addend": 9, "index": 10, "calls": 11}
    preserved_meta = {"schema": 2, "originalRng": {"calls": 99}}
    save_meta.write_text(
        json.dumps({"schema": 1, "slots": {"2": preserved_meta}}),
        encoding="utf-8",
    )
    web_meta = {
        "schema": 2,
        "originalRng": rng,
        "legionRuleState": [
            {
                "slot": 1,
                "_retreat": {"cityIdx": 2, "nodeId": 3, "captorFaction": 4},
                "_engagement": None,
                "engagementCountdown": None,
            }
        ],
    }
    packet = base64.b64encode(
        json.dumps({"slot": 0, "webMeta": web_meta}).encode("utf-8")
    ).decode("ascii")
    port = free_port()
    env = os.environ.copy()
    env.update(
        {
            "DRAGON_SAVE_DAT": str(save_dat),
            "DRAGON_SAVE_JSON": str(save_json),
            "DRAGON_SAVE_META": str(save_meta),
            "DRAGON_INSTANCE_LEASE": str(lease_path),
        }
    )
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
                acquire_response = connection.getresponse()
                acquire_payload = json.loads(acquire_response.read())
                connection.close()
                if acquire_response.status == 201:
                    token = acquire_payload["token"]
                    break
            except OSError:
                time.sleep(0.05)
        assert token
        # 真实fresh JS initSaveAssets路径：GET当前SAVE，再serializeSave仅patch槽0。
        before_slots = [
            bytes(server_binary[i * SLOT_SIZE : (i + 1) * SLOT_SIZE])
            for i in range(4)
        ]
        fresh_output = temp_path / "fresh-client-save.dat"
        fresh_client = subprocess.run(
            [
                "node",
                str(ROOT / "tools" / "verify_save_fresh_client.mjs"),
                f"http://127.0.0.1:{port}",
                str(fresh_output),
                token,
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        assert fresh_client.returncode == 0, fresh_client.stderr
        fresh_binary = bytearray(fresh_output.read_bytes())
        assert len(fresh_binary) == 4 * SLOT_SIZE
        for slot_index in range(1, 4):
            assert (
                fresh_binary[slot_index * SLOT_SIZE : (slot_index + 1) * SLOT_SIZE]
                == before_slots[slot_index]
            ), f"fresh JS init changed untouched slot {slot_index}"
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
        connection.request(
            "POST",
            "/api/save",
            body=bytes(fresh_binary),
            headers={
                "Content-Type": "application/octet-stream",
                "X-Dragon-Web-Meta": packet,
                "X-Dragon-Instance": token,
            },
        )
        http_response = connection.getresponse()
        response_body = http_response.read()
        connection.close()
        assert http_response.status == 200, response_body.decode("utf-8", errors="replace")
        response = json.loads(response_body)
        assert response == {"ok": True}
        persisted = save_dat.read_bytes()
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/api/save.dat", headers={"X-Dragon-Instance": token})
        binary_response = connection.getresponse()
        assert binary_response.status == 200
        assert binary_response.read() == persisted
        connection.close()
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request(
            "GET", "/api/saves.json", headers={"X-Dragon-Instance": token}
        )
        fresh = json.loads(connection.getresponse().read())
        connection.close()
        slot = next(item for item in fresh["slots"] if item["slot"] == 0)
        assert slot["webMeta"]["originalRng"] == rng
        assert slot["webMeta"]["legionRuleState"] == web_meta["legionRuleState"]
        sidecar = json.loads(save_meta.read_text(encoding="utf-8"))["slots"]
        assert sidecar["0"] == web_meta
        assert sidecar["2"] == preserved_meta, "untouched slot sidecar must remain"
        assert persisted[:SLOT_SIZE] == bytes(fresh_binary[:SLOT_SIZE])
        for slot_index in range(1, 4):
            assert (
                persisted[slot_index * SLOT_SIZE : (slot_index + 1) * SLOT_SIZE]
                == before_slots[slot_index]
            ), f"untouched slot {slot_index} changed"
        assert save_dat.stat().st_size == 4 * SLOT_SIZE
        # 无metadata的外部整份上传必须清空所有stale sidecar。
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
        connection.request(
            "POST",
            "/api/save",
            body=persisted,
            headers={
                "Content-Type": "application/octet-stream",
                "X-Dragon-Instance": token,
            },
        )
        external_response = connection.getresponse()
        external_body = external_response.read()
        connection.close()
        assert external_response.status == 200, external_body
        assert json.loads(save_meta.read_text(encoding="utf-8")) == {
            "schema": 1,
            "slots": {},
        }

        assert not list(temp_path.glob(".*.tmp")), "staged temp files leaked"

        # 静态路径必须拒绝解析态、sidecar、lease与锁；只有token API可读取SAVE。
        for leaked_path in (
            "/save.json",
            "/%73ave.json",
            "/%2e/save.json",
            "/folder/%2e%2e/save.webmeta.json",
            "/folder%5c..%5csave.instance-lease.json",
            "/SAVE.JSON",
            "/save.webmeta.json",
            "/save.instance-lease.json",
            "/save.instance-lease.json.lock",
            "/SAVE.DAT.lock",
            "/.save.webmeta.json.test.tmp",
        ):
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            connection.request("GET", leaked_path)
            leaked_response = connection.getresponse()
            leaked_response.read()
            connection.close()
            assert leaked_response.status == 404, leaked_path
        assert source.read_bytes() == source_before, "test must not modify real SAVE.DAT"
    finally:
        server.terminate()
        server.wait(timeout=10)

print("save server metadata OK: temporary POST -> parse -> fresh GET preserves canonical RNG")
