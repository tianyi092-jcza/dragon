const INSTANCE_HEADER = "X-Dragon-Instance";
const LEASE_GENERATION_HEADER = "X-Dragon-Lease-Generation";
const LEASE_EXPIRES_HEADER = "X-Dragon-Lease-Expires-At";
const SERVER_TIME_HEADER = "X-Dragon-Server-Time";

export class InstanceLeaseError extends Error {
  constructor(reason, status = 0) {
    super(reason);
    this.name = "InstanceLeaseError";
    this.reason = reason;
    this.status = status;
  }
}

function overlay() {
  let node = document.querySelector("#instance-lock");
  if (node) return node;
  node = document.createElement("div");
  node.id = "instance-lock";
  Object.assign(node.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "pre-line",
    textAlign: "center",
    background: "#141414",
    color: "#e8d9b0",
    font: '18px/1.8 "Noto Serif TC", "PMingLiU", serif',
  });
  document.body.append(node);
  return node;
}

export function showInstanceMessage(message, blocking = true) {
  const node = overlay();
  node.textContent = message;
  node.style.display = "flex";
  node.style.pointerEvents = blocking ? "auto" : "none";
}

export function hideInstanceMessage() {
  const node = document.querySelector("#instance-lock");
  if (node) node.style.display = "none";
}

export function instanceHeaders(headers = {}) {
  const token = globalThis.__dragonInstance?.token;
  return token ? { ...headers, [INSTANCE_HEADER]: token } : { ...headers };
}

export async function instanceFetch(url, options = {}) {
  requireInstanceRuntime();
  const response = await fetch(url, {
    ...options,
    headers: instanceHeaders(options.headers),
  });
  requireInstanceRuntime();
  return response;
}

export function instanceRuntimeActive(now = Date.now()) {
  const runtime = globalThis.__dragonInstance;
  if (!runtime || runtime.state !== "active") return false;
  if (!Number.isFinite(runtime.expiresAt) || now >= runtime.expiresAt) {
    runtime.suspend?.("lease-expired");
    return false;
  }
  return true;
}

export function requireInstanceRuntime(now = Date.now()) {
  if (!instanceRuntimeActive(now))
    throw new InstanceLeaseError("lease-lost", 409);
}

function headerNumber(response, name) {
  const value = response.headers?.get?.(name);
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function responseValidity(response, requestStarted, leaseMs, now) {
  const elapsed = Math.max(0, now() - requestStarted);
  const serverTime = headerNumber(response, SERVER_TIME_HEADER);
  const serverExpires = headerNumber(response, LEASE_EXPIRES_HEADER);
  const serverRemaining =
    serverTime == null || serverExpires == null
      ? leaseMs
      : Math.max(0, serverExpires - serverTime);
  return Math.min(leaseMs, serverRemaining) - elapsed;
}

async function acquire(now) {
  const requestStarted = now();
  let response;
  try {
    response = await fetch("/api/instance/acquire", {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    throw new InstanceLeaseError("server-unavailable");
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // status below is authoritative.
  }
  if (response.status === 201) {
    const leaseMs = Number(payload.leaseMs);
    const generation = payload.generation;
    if (!(leaseMs > 0) || typeof generation !== "string")
      throw new InstanceLeaseError("invalid-lease", 500);
    const validForMs = responseValidity(response, requestStarted, leaseMs, now);
    if (!(validForMs > 0))
      throw new InstanceLeaseError("stale-lease-response", 409);
    return { ...payload, validForMs };
  }
  if (response.status === 423)
    throw new InstanceLeaseError("instance-active", 423);
  if (response.status === 404 || response.status === 405)
    throw new InstanceLeaseError(
      "single-instance-unavailable",
      response.status,
    );
  throw new InstanceLeaseError(
    payload.reason ?? "server-unavailable",
    response.status,
  );
}

function release(token) {
  if (!token) return;
  void fetch("/api/instance/release", {
    method: "POST",
    body: token,
    keepalive: true,
  });
}

export async function startSingleInstance(
  { onActive, onSuspend, onLost } = {},
  { now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {},
) {
  showInstanceMessage("正在取得遊戲使用權……");
  let stopped = false;
  let heartbeatTimer = null;
  let expiryTimer = null;
  let state = "acquiring";
  const runtime = {
    token: null,
    generation: null,
    state,
    expiresAt: 0,
  };
  globalThis.__dragonInstance = runtime;

  const setState = (next) => {
    state = next;
    runtime.state = next;
  };
  const clearExpiry = () => {
    if (expiryTimer != null) cancel(expiryTimer);
    expiryTimer = null;
  };
  const suspend = () => {
    if (stopped || state !== "active") return;
    setState("suspended");
    onSuspend?.();
    showInstanceMessage("本地服務暫時中斷，遊戲已凍結。\n正在重新連線……");
  };
  runtime.suspend = suspend;
  const armExpiry = () => {
    clearExpiry();
    const delay = Math.max(0, runtime.expiresAt - now());
    expiryTimer = schedule(() => {
      expiryTimer = null;
      if (now() >= runtime.expiresAt) suspend("lease-expired");
      else armExpiry();
    }, delay);
  };
  const renewLocalLease = (validForMs = runtime.leaseMs) => {
    runtime.expiresAt = now() + validForMs;
    armExpiry();
  };
  const scheduleHeartbeat = (delay = runtime.heartbeatMs) => {
    heartbeatTimer = schedule(heartbeat, delay);
  };

  async function heartbeat() {
    heartbeatTimer = null;
    if (stopped || !runtime.token) return;
    const requestStarted = now();
    const requestDeadline = runtime.expiresAt;
    const revalidation = requestStarted >= requestDeadline;
    const token = runtime.token;
    const generation = runtime.generation;
    if (revalidation) suspend("lease-expired");
    let response;
    try {
      response = await fetch("/api/instance/heartbeat", {
        method: "POST",
        headers: { [INSTANCE_HEADER]: token },
        cache: "no-store",
      });
    } catch {
      suspend("server-unavailable");
      scheduleHeartbeat();
      return;
    }
    if (stopped || runtime.token !== token || runtime.generation !== generation)
      return;
    if (response.status === 204) {
      const responseGeneration = response.headers?.get?.(
        LEASE_GENERATION_HEADER,
      );
      const validForMs = responseValidity(
        response,
        requestStarted,
        runtime.leaseMs,
        now,
      );
      const arrivedBeforeOriginalDeadline =
        revalidation || now() < requestDeadline;
      if (
        responseGeneration !== generation ||
        !(validForMs > 0) ||
        !arrivedBeforeOriginalDeadline
      ) {
        suspend("stale-lease-response");
        scheduleHeartbeat(0);
        return;
      }
      renewLocalLease(validForMs);
      if (state === "suspended") {
        setState("active");
        hideInstanceMessage();
        onActive?.();
      }
      scheduleHeartbeat();
      return;
    }
    clearExpiry();
    setState("lost");
    stopped = true;
    onLost?.();
    showInstanceMessage(
      "遊戲使用權已丟失，運行已停止。\n請重新載入頁面。",
      true,
    );
  }

  async function acquireUntilAvailable() {
    while (!stopped) {
      try {
        const lease = await acquire(now);
        // pagehide/beforeunload 可能在 acquire 请求尚未返回时先停止本页。
        // 此时服务端已经授予的 token 也必须立即释放，且绝不能重新激活 runtime。
        if (stopped) {
          release(lease.token);
          return null;
        }
        runtime.token = lease.token;
        runtime.generation = lease.generation;
        runtime.heartbeatMs = lease.heartbeatMs;
        runtime.leaseMs = lease.leaseMs;
        renewLocalLease(lease.validForMs);
        setState("active");
        hideInstanceMessage();
        onActive?.();
        scheduleHeartbeat();
        return runtime;
      } catch (error) {
        if (!(error instanceof InstanceLeaseError)) throw error;
        if (error.reason === "instance-active") {
          setState("blocked");
          showInstanceMessage(
            "臥龍傳已在另一個視窗中執行。\n\n請先關閉原有遊戲視窗。\n本頁將在使用權釋放後重新嘗試。",
          );
          await new Promise((resolve) => schedule(resolve, 1000));
          continue;
        }
        setState("unavailable");
        showInstanceMessage(
          error.reason === "single-instance-unavailable"
            ? "此部署模式無法提供單一遊戲實例保護。\n請使用 tools/webserver.py 啟動遊戲。"
            : "本地遊戲服務無法連線。\n為防止多實例覆蓋存檔，遊戲未啟動。",
        );
        throw error;
      }
    }
    return null;
  }

  const stopAndRelease = () => {
    if (stopped) return;
    stopped = true;
    if (heartbeatTimer != null) cancel(heartbeatTimer);
    clearExpiry();
    const token = runtime.token;
    // pagehide/beforeunload可能被测试或宿主页显式派发而页面仍存活；先同步
    // 失效并冻结本地runtime，再异步release。任何in-flight响应此后都不能激活。
    runtime.token = null;
    runtime.generation = null;
    runtime.expiresAt = 0;
    const wasActive = state === "active";
    setState("stopped");
    if (wasActive) onSuspend?.();
    release(token);
  };
  addEventListener("pagehide", stopAndRelease);
  addEventListener("beforeunload", stopAndRelease);
  addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });

  return acquireUntilAvailable();
}
