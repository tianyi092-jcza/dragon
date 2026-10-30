// Read-only presentation of existing chapter validators, not new admission rules.
import { chapterSaveGaps, chapterActiveGaps } from '../web/src/content/authoring/gamesource.js';
import { trialChapterAssetGaps } from './trials.js';
const LIMIT = 100;
function describe(gap) {
  const rest = gap.message.startsWith(gap.subject) ? gap.message.slice(gap.subject.length) : gap.message;
  const exact = new Map([
    [' generals must be 128 dense (locked)', '武將須符合目前128個密排槽的鎖定格式。'],
    [' cities must be 192 (locked)', '據點須符合目前192個槽的鎖定格式。'],
    ['general idx must be unique 0..127', '武將編號須唯一且在0～127範圍。'],
    ['city idx must be unique 0..191', '據點編號須唯一且在0～191範圍。'],
    ['faction idx must be unique 0..21', '勢力編號須唯一且在0～21範圍；隱藏原生槽不列為公開勢力。'],
    ['declared faction count differs from public view length; initialization edit unsupported', '勢力聲明數量與公開列表長度不一致；解散／初始化寫集未閉合，不自動改數量或原生槽。'],
    ['native faction source must contain 22 valid fixed slots', '已提供的原生勢力來源須包含22個有效固定槽；不以預設值修補。'],
    ['.name/hao must be strings', 'name／hao須為文字。'],
    ['.ability must be an object', 'ability能力資料須為物件。'],
    [' factions must include at least one entry', '本章至少一個勢力才可進入試運行／發布校驗；空勢力草稿仍可保存。'],
  ]);
  let description = exact.get(rest);
  const field = /^\.([a-z_]+) (is required|must be a finite number|must be a string|must be an integer or null)$/.exec(rest);
  if (field) description = `${field[1]}：${({ 'is required': '必填資料缺失或格式不符', 'must be a finite number': '須為有限數值', 'must be a string': '須為文字', 'must be an integer or null': '須為整數或空值' })[field[2]]}。`;
  const ability = /^\.(siege|field|naval|force|lead|politics) must be an integer in 0\.\.(15|255)$/.exec(rest);
  if (ability) description = `${ability[1]}：須為0～${ability[2]}的整數；僅為儲存表示檢查，不代表可玩准入。`;
  const nativeView = /^faction slot (\d+) is not declared position (\d+); native view order required$/.exec(rest);
  if (nativeView) description = `原生勢力視圖位置 ${nativeView[2]} 卻指向槽 ${nativeView[1]}；固定槽映射未閉合，不自動重排。`;
  const nativeMismatch = /^faction slot (\d+) ([a-z_]+) differs from native source; initialization edit unsupported$/.exec(rest);
  if (nativeMismatch) description = `勢力槽 ${nativeMismatch[1]} 的 ${nativeMismatch[2]} 與固定原生來源不一致；任免／初始化編輯尚未閉合，不能試運行或發布。`;
  const reference = /^ (governor|monarch|advisor|capital) (.+) is unknown$/.exec(rest);
  if (reference) description = `${({ governor: '太守', monarch: '君主', advisor: '軍師', capital: '首都' })[reference[1]]}引用 ${reference[2]} 未命中本章實體。`;
  return { code: gap.code, subject: gap.subject, description: description ?? '尚未識別的校驗診斷；請保留代碼與位置供核查。', recognized: description !== undefined };
}
export function chapterGapReport(state, chapterId) {
  const save = chapterSaveGaps(state, chapterId), all = chapterActiveGaps(state, chapterId);
  if (save.some((gap, i) => JSON.stringify(gap) !== JSON.stringify(all[i]))) throw new Error('chapter validator prefix changed');
  const active = all.slice(save.length);
  const assets = Array.isArray(state?.generals) && Array.isArray(state?.cities) ? trialChapterAssetGaps(state) : null;
  return {
    saveGaps: save.length, activeGaps: active.length,
    assets: assets === null ? null : { total: assets.length, items: assets.slice(0, LIMIT), omitted: Math.max(0, assets.length - LIMIT) },
    details: { save: save.slice(0, LIMIT).map(describe), active: active.slice(0, LIMIT).map(describe),
      omittedSave: Math.max(0, save.length - LIMIT), omittedActive: Math.max(0, active.length - LIMIT) },
  };
}
