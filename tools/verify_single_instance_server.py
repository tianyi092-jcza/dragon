"""临时目录验证单实例lease及跨进程互斥；禁止写真实SAVE.DAT。"""

import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLOT_SIZE = 0x56C0


def port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(port_number, method, path, body=b"", headers=None):
    connection = http.client.HTTPConnection("127.0.0.1", port_number, timeout=15)
    connection.request(method, path, body=body, headers=headers or {})
    response = connection.getresponse()
    data = response.read()
    response_headers = dict(response.getheaders())
    connection.close()
    return response.status, data, response_headers


def launch_server(port_number, env):
    process = subprocess.Popen(
        [sys.executable, str(ROOT / "tools" / "webserver.py"), str(port_number)],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    for _ in range(100):
        try:
            status, _, _ = request(port_number, "GET", "/")
            if status == 200:
                return process
        except OSError:
            time.sleep(0.03)
    raise AssertionError("server did not start")


def start_server(port_number, env):
    process = launch_server(port_number, env)
    status, _, _ = request(port_number, "POST", "/api/instance/acquire")
    return process, status


with tempfile.TemporaryDirectory(prefix="dragon-instance-") as temp:
    root = Path(temp)
    source = ROOT.parent / "Dragon" / "SAVE.DAT"
    source_before = source.read_bytes()
    save_dat = root / "SAVE.DAT"
    save_dat.write_bytes(source_before)
    save_json = root / "save.json"
    save_json.write_text('{"slots":[]}', encoding="utf-8")
    lease = root / "lease.json"
    env = os.environ.copy()
    env.update(
        {
            "DRAGON_SAVE_DAT": str(save_dat),
            "DRAGON_SAVE_JSON": str(save_json),
            "DRAGON_SAVE_META": str(root / "meta.json"),
            "DRAGON_INSTANCE_LEASE": str(lease),
            # 进程重启和Windows CI启动耗时可能超过1秒；给持久lease断言留足余量。
            "DRAGON_LEASE_MS": "5000",
            "DRAGON_HEARTBEAT_MS": "250",
            "DRAGON_SAVE_TEST_DELAY_MS": "700",
        }
    )
    server_port = port()
    server, initial = start_server(server_port, env)
    try:
        assert initial == 201
        lease_record = json.loads(lease.read_text(encoding="utf-8"))
        token = lease_record["token"]
        generation = lease_record["generation"]
        status, data, _ = request(server_port, "POST", "/api/instance/acquire")
        assert status == 423 and json.loads(data)["reason"] == "instance-active"
        status, _, response_headers = request(
            server_port,
            "POST",
            "/api/instance/heartbeat",
            headers={"X-Dragon-Instance": token},
        )
        assert status == 204
        assert response_headers["X-Dragon-Lease-Generation"] == generation
        assert float(response_headers["X-Dragon-Lease-Expires-At"]) > float(
            response_headers["X-Dragon-Server-Time"]
        )
        before = save_dat.read_bytes()
        status, _, _ = request(
            server_port,
            "POST",
            "/api/save",
            body=before,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert status == 409 and save_dat.read_bytes() == before
        status, _, _ = request(
            server_port,
            "POST",
            "/api/save",
            body=before,
            headers={
                "Content-Type": "application/octet-stream",
                "X-Dragon-Instance": "wrong",
            },
        )
        assert status == 409 and save_dat.read_bytes() == before

        # 持久lease跨server restart：旧token可续，第二实例仍锁。
        server.terminate()
        server.wait(timeout=10)
        server, initial = start_server(server_port, env)
        assert initial == 423
        status, _, response_headers = request(
            server_port,
            "POST",
            "/api/instance/heartbeat",
            headers={"X-Dragon-Instance": token},
        )
        assert status == 204
        assert response_headers["X-Dragon-Lease-Generation"] == generation
        assert request(server_port, "POST", "/api/instance/acquire")[0] == 423

        # 保存发布期间release/acquire不能穿过事务边界。
        assert request(server_port, "POST", "/api/instance/release", b"wrong")[0] == 204
        assert request(server_port, "POST", "/api/instance/acquire")[0] == 423
        save_result = {}
        release_result = {}
        save_thread = threading.Thread(
            target=lambda: save_result.update(
                result=request(
                    server_port,
                    "POST",
                    "/api/save",
                    body=before,
                    headers={
                        "Content-Type": "application/octet-stream",
                        "X-Dragon-Instance": token,
                    },
                )
            )
        )
        save_thread.start()
        time.sleep(0.15)
        release_thread = threading.Thread(
            target=lambda: release_result.update(
                result=request(
                    server_port,
                    "POST",
                    "/api/instance/release",
                    token.encode(),
                )
            )
        )
        release_thread.start()
        time.sleep(0.15)
        assert release_thread.is_alive(), "release interleaved with save publication"
        acquire_started = time.monotonic()
        acquire_during = request(server_port, "POST", "/api/instance/acquire")
        assert time.monotonic() - acquire_started >= 0.25
        assert acquire_during[0] in (201, 423)
        save_thread.join(timeout=10)
        release_thread.join(timeout=10)
        assert save_result["result"][0] == 200
        assert release_result["result"][0] == 204
        if acquire_during[0] == 201:
            token2 = json.loads(acquire_during[1])["token"]
        else:
            status, data, _ = request(server_port, "POST", "/api/instance/acquire")
            assert status == 201
            token2 = json.loads(data)["token"]

        time.sleep(5.1)
        status, data, _ = request(server_port, "POST", "/api/instance/acquire")
        assert status == 201 and json.loads(data)["token"] != token2
        assert source.read_bytes() == source_before
    finally:
        server.terminate()
        server.wait(timeout=10)

# 两个独立webserver进程共用路径：并发acquire恰好一个201，SAVE发布不撕裂。
with tempfile.TemporaryDirectory(prefix="dragon-instance-processes-") as temp:
    root = Path(temp)
    source = ROOT.parent / "Dragon" / "SAVE.DAT"
    source_before = source.read_bytes()
    save_dat = root / "SAVE.DAT"
    save_dat.write_bytes(source_before)
    save_json = root / "save.json"
    save_json.write_text('{"slots":[]}', encoding="utf-8")
    env = os.environ.copy()
    env.update(
        {
            "DRAGON_SAVE_DAT": str(save_dat),
            "DRAGON_SAVE_JSON": str(save_json),
            "DRAGON_SAVE_META": str(root / "meta.json"),
            "DRAGON_INSTANCE_LEASE": str(root / "lease.json"),
            "DRAGON_LEASE_MS": "5000",
            "DRAGON_HEARTBEAT_MS": "500",
        }
    )
    ports = [port(), port()]
    servers = [launch_server(number, env) for number in ports]
    try:
        barrier = threading.Barrier(3)
        results: list[tuple[int, bytes, dict] | None] = [None, None]

        def concurrent_acquire(index):
            barrier.wait()
            results[index] = request(ports[index], "POST", "/api/instance/acquire")

        threads = [
            threading.Thread(target=concurrent_acquire, args=(i,)) for i in range(2)
        ]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=10)
        completed = [result for result in results if result is not None]
        assert sorted(result[0] for result in completed) == [201, 423], results
        token = json.loads(next(result for result in completed if result[0] == 201)[1])[
            "token"
        ]

        bodies = []
        for marker in (0x5A, 0xA5):
            body = bytearray(source_before)
            body[0x52BF] = marker
            bodies.append(bytes(body))
        save_results: list[tuple[int, bytes, dict] | None] = [None, None]
        barrier = threading.Barrier(3)

        def concurrent_save(index):
            barrier.wait()
            save_results[index] = request(
                ports[index],
                "POST",
                "/api/save",
                body=bodies[index],
                headers={
                    "Content-Type": "application/octet-stream",
                    "X-Dragon-Instance": token,
                },
            )

        threads = [
            threading.Thread(target=concurrent_save, args=(i,)) for i in range(2)
        ]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=30)
        completed_saves = [result for result in save_results if result is not None]
        assert [result[0] for result in completed_saves] == [200, 200], save_results
        assert save_dat.read_bytes() in bodies, "cross-process save was torn"
        assert source.read_bytes() == source_before
    finally:
        for server in servers:
            server.terminate()
            server.wait(timeout=10)

print("single instance server OK: generation/deadline + cross-process lease/save locks")
