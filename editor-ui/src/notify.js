// 全編輯器唯一的瞬時消息提示出口：全部使用 Element Plus Message 的 Plain
// 白底樣式（plain: true），不再使用其它自造黑色背景提示。
// 常駐的 `<p role="status">` 文案保留為可讀屏／可測試的持久記錄，
// 這裡只做閱後即焚的輕提示，不改變任何業務狀態。
import { ElMessage } from 'element-plus/es/components/message/index.mjs';

const TYPES = ['success', 'warning', 'info', 'error'];

export function notify(message, type = 'info', options = {}) {
  const text = String(message ?? '').trim();
  if (!text || typeof document === 'undefined') return undefined;
  return ElMessage({
    message: text,
    type: TYPES.includes(type) ? type : 'info',
    plain: true,
    duration: 3000,
    showClose: true,
    grouping: true,
    ...options,
  });
}

export const notifySuccess = (message, options) => notify(message, 'success', options);
export const notifyWarning = (message, options) => notify(message, 'warning', options);
export const notifyError = (message, options) => notify(message, 'error', options);
export const notifyInfo = (message, options) => notify(message, 'info', options);
