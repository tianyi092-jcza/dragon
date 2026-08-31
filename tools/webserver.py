"""本地正式服务器：静态文件、SAVE API 与单游戏实例租约。"""

import base64
import contextlib
import json
import os
import posixpath
import secrets
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent / "web"
PROJECT_ROOT = ROOT.parent
RUNTIME_ROOT = Path(
    os.environ.get("DRAGON_RUNTIME_DIR", PROJECT_ROOT / ".dragon-runtime")
)
SAVE_DAT = Path(
    os.environ.get(
        "DRAGON_SAVE_DAT",
        PROJECT_ROOT.parent / "Dragon" / "SAVE.DAT",
    )
)
# 解析态、sidecar、lease和锁默认全部放在静态web根之外。
SAVE_JSON = Path(os.environ.get("DRAGON_SAVE_JSON", RUNTIME_ROOT / "save.json"))
SAVE_META = Path(os.environ.get("DRAGON_SAVE_META", RUNTIME_ROOT / "save.webmeta.json"))
SAVE_JOURNAL = Path(
    os.environ.get(
        "DRAGON_SAVE_JOURNAL",
        SAVE_JSON.with_name("save.publication-journal.json"),
    )
)
INSTANCE_LEASE = Path(
    os.environ.get(
        "DRAGON_INSTANCE_LEASE",
        RUNTIME_ROOT / "save.instance-lease.json",
    )
)
LEASE_MS = max(1000, int(os.environ.get("DRAGON_LEASE_MS", "60000")))
HEARTBEAT_MS = max(250, int(os.environ.get("DRAGON_HEARTBEAT_MS", "5000")))
LEASE_LOCK = threading.RLock()
SAVE_WRITE_LOCK = threading.Lock()
SAVE_TEST_DELAY_MS = max(0, int(os.environ.get("DRAGON_SAVE_TEST_DELAY_MS", "0")))
SAVE_TEST_FORCE_PARSE_FAILURE = (
    os.environ.get("DRAGON_SAVE_TEST_FORCE_PARSE_FAILURE") == "1"
)
SAVE_TEST_FAIL_REPLACE_AT = max(
    0, int(os.environ.get("DRAGON_SAVE_TEST_FAIL_REPLACE_AT", "0"))
)
SAVE_TEST_CRASH_AFTER_REPLACE = max(
    0, int(os.environ.get("DRAGON_SAVE_TEST_CRASH_AFTER_REPLACE", "0"))
)
LEASE_PROCESS_LOCK = INSTANCE_LEASE.with_name(f"{INSTANCE_LEASE.name}.lock")
SAVE_PROCESS_LOCK = SAVE_DAT.with_name(f"{SAVE_DAT.name}.lock")
sys.path.insert(0, str(Path(__file__).resolve().parent))


@contextlib.contextmanager
def process_file_lock(path: Path):
    """跨进程独占锁；同进程线程互斥仍由外层threading锁负责。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+b")
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0, os.SEEK_END)
            if handle.tell() == 0:
                handle.write(b"\0")
                handle.flush()
            while True:
                try:
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    time.sleep(0.01)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        if os.name == "nt":
            import msvcrt

            with contextlib.suppress(OSError):
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            with contextlib.suppress(OSError):
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def temp_path(path: Path, tag: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    return path.with_name(
        f".{path.name}.{os.getpid()}.{threading.get_ident()}.{tag}.tmp"
    )


def write_bytes_durable(path: Path, payload: bytes) -> None:
    """写完整文件并flush，供跨进程崩溃恢复日志/备份使用。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())


def write_json_temp(path: Path, payload: dict, tag: str) -> Path:
    temp = temp_path(path, tag)
    write_bytes_durable(
        temp,
        json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    )
    # 发布前必须可重新解析。
    json.loads(temp.read_text(encoding="utf-8"))
    return temp


def atomic_json(path: Path, payload: dict) -> None:
    temp = write_json_temp(path, payload, "atomic")
    os.replace(temp, path)


def replace_canonical(staged: Path, target: Path, index: int) -> None:
    """测试可注入第N次发布失败/硬退出；正式路径等价于os.replace。"""
    if index == SAVE_TEST_FAIL_REPLACE_AT:
        raise OSError(f"forced canonical replace failure at {index}")
    os.replace(staged, target)
    if index == SAVE_TEST_CRASH_AFTER_REPLACE:
        os._exit(90 + index)


def restore_canonical(path: Path, payload: bytes | None) -> None:
    """发布中途失败时恢复进入事务前的canonical文件。"""
    if payload is None:
        with contextlib.suppress(FileNotFoundError):
            path.unlink()
        return
    restored = temp_path(path, "rollback")
    try:
        write_bytes_durable(restored, payload)
        os.replace(restored, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            restored.unlink()


def prepare_publication_journal(paths: tuple[Path, ...]) -> list[Path]:
    """发布前持久化三份canonical快照；journal存在即表示提交尚未完成。"""
    transaction = secrets.token_hex(8)
    entries = []
    backups = []
    try:
        for index, path in enumerate(paths):
            existed = path.exists()
            backup = path.with_name(f".{path.name}.{transaction}.{index}.backup")
            if existed:
                write_bytes_durable(backup, path.read_bytes())
                backups.append(backup)
            entries.append(
                {
                    "target": str(path.resolve()),
                    "existed": existed,
                    "backup": str(backup.resolve()) if existed else None,
                }
            )
        atomic_json(SAVE_JOURNAL, {"schema": 1, "entries": entries})
        return backups
    except (OSError, TypeError, ValueError):
        for backup in backups:
            with contextlib.suppress(FileNotFoundError):
                backup.unlink()
        raise


def recover_publication_journal() -> bool:
    """启动或发布异常后按持久journal回滚；可重复执行直到journal删除。"""
    if not SAVE_JOURNAL.exists():
        return False
    payload = json.loads(SAVE_JOURNAL.read_text(encoding="utf-8"))
    entries = payload.get("entries")
    if payload.get("schema") != 1 or not isinstance(entries, list):
        raise RuntimeError("invalid save publication journal")
    backups = []
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("target"), str):
            raise RuntimeError("invalid save publication journal entry")
        target = Path(entry["target"])
        backup_name = entry.get("backup")
        if entry.get("existed"):
            if not isinstance(backup_name, str):
                raise RuntimeError("save publication backup missing from journal")
            backup = Path(backup_name)
            backups.append(backup)
            restore_canonical(target, backup.read_bytes())
        else:
            restore_canonical(target, None)
    SAVE_JOURNAL.unlink()
    for backup in backups:
        with contextlib.suppress(FileNotFoundError):
            backup.unlink()
    return True


def commit_publication_journal(backups: list[Path]) -> None:
    """三份replace均成功后以删除journal作为单一提交点，再清理备份。"""
    SAVE_JOURNAL.unlink()
    for backup in backups:
        with contextlib.suppress(FileNotFoundError):
            backup.unlink()


class LeaseRegistry:
    def __init__(self, path: Path):
        self.path = path

    @contextlib.contextmanager
    def _guard(self):
        with LEASE_LOCK, process_file_lock(LEASE_PROCESS_LOCK):
            yield

    def _load(self) -> dict | None:
        try:
            lease = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(lease, dict) or not isinstance(lease.get("token"), str):
            return None
        return lease

    def _active(self, now: float) -> dict | None:
        lease = self._load()
        if not lease:
            return None
        if float(lease.get("expiresAt", 0)) <= now:
            with contextlib.suppress(FileNotFoundError):
                self.path.unlink()
            return None
        return lease

    def acquire(self) -> tuple[bool, dict]:
        now = time.time()
        with self._guard():
            if self._active(now):
                return False, {
                    "ok": False,
                    "reason": "instance-active",
                    "retryAfterMs": HEARTBEAT_MS,
                }
            token = secrets.token_urlsafe(32)
            generation = secrets.token_urlsafe(18)
            expires_at = now * 1000 + LEASE_MS
            lease = {
                "schema": 1,
                "token": token,
                "generation": generation,
                "acquiredAt": now,
                "expiresAt": expires_at / 1000,
            }
            atomic_json(self.path, lease)
            return True, {
                "ok": True,
                "token": token,
                "generation": generation,
                "heartbeatMs": HEARTBEAT_MS,
                "leaseMs": LEASE_MS,
                "serverTime": now * 1000,
                "expiresAt": expires_at,
            }

    def validate(self, token: str | None, renew: bool = False) -> dict | None:
        if not token:
            return None
        now = time.time()
        with self._guard():
            lease = self._active(now)
            if not lease or not secrets.compare_digest(lease["token"], token):
                return None
            if renew:
                lease.setdefault("generation", secrets.token_urlsafe(18))
                lease["expiresAt"] = now + LEASE_MS / 1000
                atomic_json(self.path, lease)
            return {**lease, "serverTime": now}

    def valid(self, token: str | None, renew: bool = False) -> bool:
        return self.validate(token, renew) is not None

    @contextlib.contextmanager
    def publication(self, token: str | None):
        """保存发布事务：跨进程锁住lease直到SAVE/meta/parse全部提交。"""
        with self._guard():
            lease = self._active(time.time())
            valid = bool(
                token and lease and secrets.compare_digest(lease["token"], token)
            )
            yield valid

    def release(self, token: str | None) -> None:
        if not token:
            return
        with self._guard():
            lease = self._load()
            if not lease or not secrets.compare_digest(lease["token"], token):
                return
            with contextlib.suppress(FileNotFoundError):
                self.path.unlink()


LEASES = LeaseRegistry(INSTANCE_LEASE)


def ensure_runtime_save_json() -> None:
    """每次正式启动均从canonical SAVE与sidecar重建解析态，避免外部改档后陈旧。"""
    staged_json = temp_path(SAVE_JSON, "startup")
    env = os.environ.copy()
    env["DRAGON_SAVE_DAT"] = str(SAVE_DAT)
    env["DRAGON_SAVE_JSON"] = str(staged_json)
    env["DRAGON_SAVE_META"] = str(SAVE_META)
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).resolve().parent / "parse_save.py"),
                str(SAVE_DAT),
            ],
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )
        if result.returncode != 0 or "OK" not in result.stdout:
            raise RuntimeError(result.stderr or result.stdout or "initial parse failed")
        payload = json.loads(staged_json.read_text(encoding="utf-8"))
        if not isinstance(payload.get("slots"), list):
            raise TypeError("initial save JSON missing slots")
        os.replace(staged_json, SAVE_JSON)
    finally:
        with contextlib.suppress(FileNotFoundError):
            staged_json.unlink()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    @property
    def route(self) -> str:
        return urlsplit(self.path).path

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def json_response(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def lease_response_headers(self, lease: dict) -> None:
        self.send_header("X-Dragon-Lease-Generation", lease["generation"])
        self.send_header("X-Dragon-Lease-Expires-At", str(lease["expiresAt"] * 1000))
        self.send_header("X-Dragon-Server-Time", str(lease["serverTime"] * 1000))

    def authorized(self) -> bool:
        if LEASES.valid(self.headers.get("X-Dragon-Instance")):
            return True
        self.json_response(409, {"ok": False, "reason": "lease-lost"})
        return False

    def do_GET(self):
        # 即使旧部署遗留敏感文件在web根，也禁止静态路径旁路token授权API。
        denied = {
            "/save.json",
            "/save.webmeta.json",
            "/save.instance-lease.json",
        }
        # SimpleHTTPRequestHandler 会在落盘前 URL-decode；这里必须使用同等规范化，
        # 并统一小写，防止 `%73ave.json` 和 Windows 大小写路径绕过。
        decoded_route = unquote(self.route).replace("\\", "/")
        lower_route = posixpath.normpath(decoded_route).lower()
        if not lower_route.startswith("/"):
            lower_route = f"/{lower_route}"
        if (
            lower_route in denied
            or lower_route.endswith(".lock")
            or ".tmp" in lower_route
            or lower_route.startswith("/.dragon-runtime/")
        ):
            self.send_error(404)
            return
        if self.route == "/api/saves.json":
            if not self.authorized():
                return
            with SAVE_WRITE_LOCK, process_file_lock(SAVE_PROCESS_LOCK):
                data = SAVE_JSON.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if self.route == "/api/save.dat":
            if not self.authorized():
                return
            with SAVE_WRITE_LOCK, process_file_lock(SAVE_PROCESS_LOCK):
                if not SAVE_DAT.exists():
                    self.send_error(404, "SAVE.DAT not found")
                    return
                data = SAVE_DAT.read_bytes()
            if len(data) != 4 * 0x56C0:
                self.send_error(500, f"bad SAVE.DAT size {len(data)}")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def do_POST(self):
        if self.route == "/api/instance/acquire":
            ok, payload = LEASES.acquire()
            self.json_response(201 if ok else 423, payload)
            return
        if self.route == "/api/instance/heartbeat":
            lease = LEASES.validate(self.headers.get("X-Dragon-Instance"), renew=True)
            if lease:
                self.send_response(204)
                self.lease_response_headers(lease)
                self.end_headers()
            else:
                self.json_response(409, {"ok": False, "reason": "lease-lost"})
            return
        if self.route == "/api/instance/release":
            try:
                size = int(self.headers.get("Content-Length", 0))
            except (TypeError, ValueError):
                size = 0
            token = self.rfile.read(size).decode("utf-8", errors="ignore")
            LEASES.release(token)
            self.send_response(204)
            self.end_headers()
            return
        if self.route != "/api/save":
            self.send_error(404)
            return
        if not self.authorized():
            return
        try:
            size = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            self.send_error(411)
            return
        body = self.rfile.read(size)
        if len(body) != 4 * 0x56C0:
            self.send_error(400, f"bad size {len(body)}")
            return
        web_meta_header = self.headers.get("X-Dragon-Web-Meta")
        packet = None
        if web_meta_header:
            try:
                packet = json.loads(base64.b64decode(web_meta_header).decode("utf-8"))
                slot = int(packet["slot"])
                if not 0 <= slot < 4:
                    raise ValueError("bad metadata slot")
            except (ValueError, KeyError, json.JSONDecodeError):
                self.send_error(400, "bad X-Dragon-Web-Meta")
                return
        # 固定锁序 SAVE_WRITE_LOCK→LEASE_LOCK。持有publication直到binary、
        # sidecar与parse产物全部提交，release/acquire不能在中途换所有者。
        with (
            SAVE_WRITE_LOCK,
            process_file_lock(SAVE_PROCESS_LOCK),
            LEASES.publication(self.headers.get("X-Dragon-Instance")) as valid,
        ):
            if not valid:
                self.json_response(409, {"ok": False, "reason": "lease-lost"})
                return
            next_sidecar = {"schema": 1, "slots": {}}
            if packet is not None:
                try:
                    slot = int(packet["slot"])
                    if SAVE_META.exists():
                        next_sidecar = json.loads(SAVE_META.read_text(encoding="utf-8"))
                        next_sidecar.setdefault("slots", {})
                    next_sidecar["slots"][str(slot)] = packet.get("webMeta")
                except (OSError, ValueError, KeyError, json.JSONDecodeError):
                    self.send_error(500, "failed to prepare web save metadata")
                    return
            if SAVE_TEST_DELAY_MS:
                time.sleep(SAVE_TEST_DELAY_MS / 1000)
            staged_save = temp_path(SAVE_DAT, "upload")
            staged_meta = None
            staged_json = temp_path(SAVE_JSON, "parsed")
            try:
                staged_save.write_bytes(body)
                if staged_save.stat().st_size != 4 * 0x56C0:
                    raise ValueError("staged SAVE.DAT size mismatch")
                staged_meta = write_json_temp(SAVE_META, next_sidecar, "meta")
                env = os.environ.copy()
                env["DRAGON_SAVE_DAT"] = str(staged_save)
                env["DRAGON_SAVE_JSON"] = str(staged_json)
                env["DRAGON_SAVE_META"] = str(staged_meta)
                result = subprocess.run(
                    [
                        sys.executable,
                        str(Path(__file__).resolve().parent / "parse_save.py"),
                        str(staged_save),
                    ],
                    capture_output=True,
                    text=True,
                    env=env,
                    check=False,
                )
                if SAVE_TEST_FORCE_PARSE_FAILURE:
                    raise ValueError("forced parse failure")
                if result.returncode != 0 or "OK" not in result.stdout:
                    raise ValueError(result.stderr or result.stdout or "parse failed")
                parsed = json.loads(staged_json.read_text(encoding="utf-8"))
                if not isinstance(parsed.get("slots"), list):
                    raise TypeError("parsed save JSON missing slots")
                # 所有候选均验证成功后才发布canonical输出。三文件无法由文件系统
                # 提供单次原子替换，因此先把事务前快照写入持久journal；普通异常立刻
                # 回滚，进程硬退出/断电则由下一次启动在解析前恢复。
                canonical_paths = (SAVE_DAT, SAVE_META, SAVE_JSON)
                backups = prepare_publication_journal(canonical_paths)
                try:
                    replace_canonical(staged_save, SAVE_DAT, 1)
                    replace_canonical(staged_meta, SAVE_META, 2)
                    replace_canonical(staged_json, SAVE_JSON, 3)
                    commit_publication_journal(backups)
                except OSError:
                    recover_publication_journal()
                    raise
                ok = True
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                ok = False
            finally:
                for staged in (staged_save, staged_meta, staged_json):
                    if staged is not None:
                        with contextlib.suppress(FileNotFoundError):
                            staged.unlink()
        self.json_response(200 if ok else 500, {"ok": ok})

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
    except ValueError:
        port = 8321
    # 必须先恢复上次未完成的三文件发布，再以恢复后的SAVE+sidecar重建解析态。
    recover_publication_journal()
    ensure_runtime_save_json()
    print(f"serving {ROOT} at http://127.0.0.1:{port}  (SAVE.DAT -> {SAVE_DAT})")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
