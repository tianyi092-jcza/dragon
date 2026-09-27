import { CITY_FIELDS, editCity, editTile, sourceDigest } from './contenteditor.js';
import { loadImage } from '../core/assets.js';
const $ = (id) => document.getElementById(id);
const sources = new Map();
const documents = new Map();
const history = [];
let catalog, layout, atlas, currentPath, selectedTile = 0;
async function load(path) {
  if (documents.has(path)) return documents.get(path);
  const response = await fetch(`content/builtin/${path}`);
  if (!response.ok) throw new Error(`無法讀取 ${path}`);
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); }
  catch (cause) { throw new TypeError('Invalid content JSON', { cause }); }
  sources.set(path, { sha256: await sourceDigest(text), text });
  documents.set(path, value);
  return value;
}
function fields() {
  const city = documents.get(currentPath)?.state.cities[Number($('city').value)];
  if (!city) return;
  $('fields').replaceChildren();
  for (const [field, max] of Object.entries(CITY_FIELDS)) {
    const label = document.createElement('label');
    label.textContent = `${field} `;
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.max = String(max);
    input.value = city[field]; input.dataset.field = field;
    label.append(input); $('fields').append(label);
  }
}
function renderMap() {
  const ctx = $('map').getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 384; x++) {
    const tile = layout[y][x];
    ctx.drawImage(atlas, (tile % 16) * 16, Math.floor(tile / 16) * 16, 16, 16, x * 2, y * 2, 2, 2);
  }
}
function replace(path, value) {
  history.push({ path, previous: documents.get(path) });
  documents.set(path, value);
  if (path === 'world/layout.json') layout = value;
  $('status').textContent = `${history.length} 次修改；尚未寫入來源或遊戲。`;
}
async function chooseChapter() {
  const path = catalog.chapters[Number($('chapter').value)].file;
  const document = await load(path);
  currentPath = path;
  $('city').replaceChildren(...document.state.cities.map((city) => new Option(`${city.idx}: ${city.name}`, city.idx)));
  fields();
}
let busy = false;
async function run(operation) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button, select, input').forEach((control) => { control.disabled = true; });
  try { await operation(); }
  catch (error) { $('status').textContent = `操作失敗：${error.message}`; }
  finally {
    busy = false;
    document.querySelectorAll('button, select, input').forEach((control) => { control.disabled = false; });
  }
}
$('chapter').onchange = () => run(chooseChapter);
$('city').onchange = fields;
$('apply').onclick = () => run(() => {
  let doc = documents.get(currentPath);
  for (const input of $('fields').querySelectorAll('input')) {
    if (input.value === '') throw new TypeError('數值不可為空');
    doc = editCity(doc, Number($('city').value), input.dataset.field, Number(input.value));
  }
  replace(currentPath, doc);
});
$('atlas').onclick = (event) => {
  if (!atlas || busy) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.min(15, Math.floor((event.clientX - rect.left) / rect.width * 16));
  const y = Math.min(15, Math.floor((event.clientY - rect.top) / rect.height * 16));
  selectedTile = y * 16 + x;
  $('tile').textContent = `圖塊 ${selectedTile}`;
};
$('map').onclick = (event) => run(() => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / rect.width * 384);
  const y = Math.floor((event.clientY - rect.top) / rect.height * 256);
  replace('world/layout.json', editTile(layout, x, y, selectedTile));
  renderMap();
});
$('undo').onclick = () => run(() => {
  const entry = history.pop();
  if (!entry) return;
  documents.set(entry.path, entry.previous);
  layout = documents.get('world/layout.json');
  fields(); renderMap();
  $('status').textContent = `已撤銷；剩餘 ${history.length} 次修改。`;
});
$('export').onclick = () => run(() => {
  const paths = [...new Set(history.map((entry) => entry.path))];
  if (!paths.length) throw new Error('沒有修改');
  const patch = { format: 'wolong-content-patch', version: 1, packId: catalog.id,
    revision: catalog.revision, changes: paths.map((path) => ({ path,
      sha256: sources.get(path).sha256, document: documents.get(path) })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(patch)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'wolong-content-patch.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('status').textContent = '已匯出補丁。使用 tools/apply_content_patch.py 輸出到新來源目錄，再執行 compile_content.py。未更新目前遊戲。';
});
void run(async () => {
  catalog = await load('catalog.json');
  layout = await load('world/layout.json');
  atlas = await loadImage('map_atlas_summer.png');
  $('atlas').getContext('2d').drawImage(atlas, 0, 0);
  $('chapter').replaceChildren(...catalog.chapters.map((chapter, index) => new Option(chapter.id, index)));
  await chooseChapter(); renderMap();
  $('status').textContent = '已載入編輯副本。修改僅在本頁記憶體；離頁前請匯出。';
});
window.addEventListener('beforeunload', (event) => {
  if (history.length) { event.preventDefault(); event.returnValue = ''; }
});
