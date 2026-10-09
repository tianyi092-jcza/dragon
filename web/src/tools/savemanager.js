import { localSaveRepository as repository } from '../core/localstore.js';
import { decodeSaveFile, encodeSaveFile, MAX_SAVE_FILE_BYTES } from '../core/saveexchange.js';
import { loadBuiltinContent } from '../content/catalog.js';
import { createWorldResources } from '../game/worldresources.js';

const status = document.querySelector('#status');
const rows = document.querySelector('#rows');
const file = document.querySelector('#file');
const importButton = document.querySelector('#import');
let contextPromise;
function context() {
  contextPromise ??= loadBuiltinContent().then((content) => ({
    content, data: content.data, world: createWorldResources(),
  })).catch((error) => { contextPromise = null; throw error; });
  return contextPromise;
}
function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refresh() {
  const summaries = await repository.list();
  rows.replaceChildren();
  for (const summary of summaries.filter((entry) => entry.played)) {
    const row = document.createElement('tr');
    const date = summary.date;
    for (const text of [summary.slot + 1, summary.label,
      date ? `${date.year}/${date.month}/${date.day}` : '—']) {
      const cell = document.createElement('td');
      cell.textContent = String(text);
      row.append(cell);
    }
    const cell = document.createElement('td');
    const button = document.createElement('button');
    button.textContent = '匯出 JSON';
    button.onclick = () => run(async () => {
      const saved = await repository.get(summary.slot);
      download(await encodeSaveFile(saved, await context()), `wolong-save-${summary.slot + 1}.json`);
      status.textContent = '已匯出經驗證的單檔備份。';
    });
    cell.append(button);
    row.append(cell);
    rows.append(row);
  }
  status.textContent = `${summaries.filter((entry) => entry.played).length} 個存檔；目錄讀取不載入快照正文。`;
}
let busy = false;
async function run(operation) {
  if (busy) { return; }
  busy = true;
  document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  try { await operation(); }
  catch (error) { status.textContent = `操作失敗，未覆蓋現有存檔：${error.message}`; }
  finally {
    busy = false;
    document.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    importButton.disabled = !file.files?.length;
  }
}
file.onchange = () => { importButton.disabled = busy || !file.files?.length; };
importButton.onclick = () => run(async () => {
  const chosen = file.files?.[0];
  if (!chosen || chosen.size > MAX_SAVE_FILE_BYTES) { throw new TypeError('請選擇不超過 64 MiB 的 JSON 存檔'); }
  const saved = await decodeSaveFile(await chosen.text(), await context());
  const created = await repository.add(saved);
  await refresh();
  status.textContent = `匯入完成，另存為第 ${created.slot + 1} 檔；未啟動或替換目前遊戲。`;
});
document.querySelector('#refresh').onclick = () => run(refresh);
void run(refresh);
