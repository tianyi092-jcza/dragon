// Q70/Q71 trusted status adapter for the Trial connection gate: maps the real
// GET /api/trials/:id/status endpoint to connection-gate outcomes. Explicit
// baseUrl/fetch injection only — no default URL, credential minting, retry or
// cache. Only definitive server verdicts end a trial; network errors, timeouts,
// 5xx, malformed bodies and unknown classifications only pause (Q71), and a
// 401 is never inferred from transport failure. Not wired into the App/Trial
// window yet; snapshot-deleted stays unemitted until the server exposes it.
const endedReasons = Object.freeze({
  "explicit": "trial-ended",
  "session-revoked": "auth-revoked",
  "session-absolute-expiry": "auth-expired",
  "game-deleting": "game-deleted",
});
const authFailureCodes = new Set(["LOGIN_REQUIRED", "SESSION_INVALID"]);
const text = (value) => typeof value === "string" && value.length > 0 && value.length <= 256;
const trialIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function createTrialStatusProbe({ baseUrl, fetch: fetchImpl } = {}) {
  if (typeof baseUrl !== "string" || baseUrl.length === 0 || baseUrl.length > 2048 || /[\r\n?#]/.test(baseUrl)) {
    throw new TypeError("invalid trial status base URL");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("trial status probe requires an explicit fetch implementation");
  }
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return async function probe(binding, signal) {
    if (!binding || typeof binding !== "object" || !trialIdPattern.test(binding.trialId ?? "") || !text(binding.sessionId)) {
      throw new TypeError("invalid trial status binding");
    }
    const response = await fetchImpl(`${base}/api/trials/${binding.trialId}/status`, {
      method: "GET",
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response || typeof response.status !== "number" || typeof response.json !== "function") {
      throw new Error("trial status transport failure");
    }
    if (response.status === 200) {
      let dto;
      try {
        dto = await response.json();
      } catch (cause) {
        throw new Error("trial status malformed", { cause });
      }
      // A status answer for a different trial is a transport/proxy fault, never a verdict.
      if (!dto || typeof dto !== "object" || dto.trialId !== binding.trialId) {
        throw new Error("trial status malformed");
      }
      if (dto.state === "active") {
        if (!text(dto.ownerId) || !text(dto.gameId) || !text(dto.draftRevision) || !text(dto.chapterId) ||
            !text(dto.snapshotId) || !text(dto.snapshotDigest) || !text(dto.manifestDigest) ||
            !Number.isSafeInteger(dto.authEpoch) || dto.authEpoch < 0) {
          throw new Error("trial status malformed");
        }
        return {
          kind: "valid",
          binding: {
            trialId: dto.trialId,
            snapshotId: dto.snapshotId,
            ownerId: dto.ownerId,
            // Client-side opaque marker; the server never sees or mints it.
            sessionId: binding.sessionId,
            authEpoch: String(dto.authEpoch),
            gameId: dto.gameId,
            draftRevision: dto.draftRevision,
            snapshotDigest: dto.snapshotDigest,
            chapterId: dto.chapterId,
            manifestDigest: dto.manifestDigest,
          },
        };
      }
      if (dto.state === "ended" && typeof dto.endReason === "string" && Object.hasOwn(endedReasons, dto.endReason)) {
        return { kind: "invalid", reason: endedReasons[dto.endReason] };
      }
      throw new Error("trial status unclassified");
    }
    if (response.status === 401) {
      let code = null;
      try {
        code = (await response.json())?.error;
      } catch {
        code = null;
      }
      if (authFailureCodes.has(code)) {
        return { kind: "invalid", reason: "auth-invalid" };
      }
      if (code === "TRIAL_INVALID") {
        return { kind: "invalid", reason: "trial-ended" };
      }
      throw new Error("trial status unclassified");
    }
    // 403/404/422/503/5xx and anything else: not a 401 semantic, pause only (Q71).
    throw new Error("trial status transport failure");
  };
}
