// KI.EXE 军团委任模式：军团 status bit2 (0x04) 是 0x4E5C/0x4ED7 的权威标志。
export const LEGION_STATUS_DELEGATED = 0x04;

/**
 * 兼容旧 Web metadata：若旧对象只有 delegated 布尔值，首次读取时同步到 status。
 * 此后所有规则、UI 与 SAVE 均以 status bit2 为权威。
 */
export function isLegionDelegated(legion) {
  if (!legion) return false;
  const hasStatus = Number.isInteger(legion.status);
  if (
    !hasStatus &&
    typeof legion.delegated === "boolean" &&
    !legion._delegationSynced
  ) {
    setLegionDelegated(legion, legion.delegated);
  }
  const delegated = ((legion.status ?? 0) & LEGION_STATUS_DELEGATED) !== 0;
  legion.delegated = delegated;
  legion._delegationSynced = true;
  return delegated;
}

export function setLegionDelegated(legion, delegated) {
  if (!legion) return false;
  const status = legion.status ?? 0x80;
  legion.status = delegated
    ? status | LEGION_STATUS_DELEGATED
    : status & ~LEGION_STATUS_DELEGATED;
  legion.delegated = Boolean(delegated);
  legion._delegationSynced = true;
  return legion.delegated;
}
