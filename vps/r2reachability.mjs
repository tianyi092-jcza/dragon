// 「遠端不可達」與「遠端權威事實不符」是兩件事（Web 產品決定 2026-11，B8：
// R2 非開機條件）。只有傳輸層失敗——連線失敗、逾時、截斷、5xx／429——才允許
// 降級啟動，讓工作台保持可編輯；任何已觀測到的權威事實（遠端根回退或超前、
// 舊協議根、權威 id 不符、收據／位元組不符、恢復鎖）仍然是 fail-closed，因為
// 那是需要人工介入的狀態，不是暫時性不可達，也不是可以繼續寫入的授權。
//
// 本判定只看已丟出的錯誤形狀，不重試、不改寫響應、不把未知當成可達。
const NETWORK_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED',
  'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'EPROTO',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
]);
// r2client 对非 200/404/412 的 HTTP 答复抛 `R2 get 503` 这类消息。
const HTTP_STATUS = /^R2 (?:get|put|control put|delete|list) (\d{3})$/;
// https-bytes 的传输级失败（绝对期限、流被中止、声明长度不符）。
const TRANSPORT_MESSAGE = /^(?:R2|STATIC)_(?:REQUEST_TIMEOUT|RESPONSE_ABORTED|RESPONSE_TRUNCATED)$/;

function statusIsTransport(status) {
  return status >= 500 || status === 429;
}

export function isRemoteUnreachable(error) {
  if (error === null || typeof error !== 'object') return false;
  if (typeof error.code === 'string' && NETWORK_CODES.has(error.code)) return true;
  const message = typeof error.message === 'string' ? error.message : '';
  const http = HTTP_STATUS.exec(message);
  if (http) return statusIsTransport(Number(http[1]));
  if (TRANSPORT_MESSAGE.test(message)) return true;
  return error.cause !== undefined && error.cause !== error && isRemoteUnreachable(error.cause);
}
