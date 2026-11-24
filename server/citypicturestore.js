// 據點圖片自管庫（Web 产品决定 2026-11，用户批准：游戏资源新增「據點圖片」
// 可管分類）。内建 0..14 沿用 web/grf/kyo_*.png 凍結文件；15..255 由管理員上傳，
// 存本庫 SQLite；發布時只收錄被引用到的圖（仿 portraits forPublish），歷史版本不动。
import { createHash } from 'node:crypto';
import { decodePNG, encodePNG, PNGError } from './pngio.js';
import { cityPictures as builtinPictures } from './citypictures.js';
import { fail } from './security.js';

export const CITY_PICTURE_BUILTIN_COUNT = builtinPictures.length;
export const CITY_PICTURE_MAX_VIEW = 255;
export const CITY_PICTURE_STANDARD_WIDTH = 192;
// 使用者拍板：單張上傳上限 400K，僅 PNG，JPG 拒收。
export const CITY_PICTURE_MAX_UPLOAD_BYTES = 400 * 1024;
const CITY_PICTURE_MAX_BASE64 = 560 * 1024;

const sha = value => createHash('sha256').update(value).digest('hex');

function checkBase64(value) {
  if (typeof value !== 'string' || !value.length || value.length > CITY_PICTURE_MAX_BASE64 ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail(422, 'CITY_PICTURE_UPLOAD');
  let bytes;
  try { bytes = Buffer.from(value, 'base64'); } catch { fail(422, 'CITY_PICTURE_UPLOAD'); }
  if (!bytes.length || bytes.length > CITY_PICTURE_MAX_UPLOAD_BYTES) fail(422, 'CITY_PICTURE_UPLOAD');
  return bytes;
}

// 使用者拍板：最近鄰縮放（保 DOS 像素風），寬統一 192，高度等比。
function scaleToStandardWidth(pixels, width, height) {
  if (width === CITY_PICTURE_STANDARD_WIDTH) return { pixels, width, height };
  const targetHeight = Math.max(1, Math.round(height * CITY_PICTURE_STANDARD_WIDTH / width));
  if (targetHeight > 8192) fail(422, 'CITY_PICTURE_GEOMETRY');
  const out = new Uint8Array(CITY_PICTURE_STANDARD_WIDTH * targetHeight * 4);
  for (let dy = 0; dy < targetHeight; dy++) {
    const sy = Math.min(height - 1, Math.floor(dy * height / targetHeight));
    for (let dx = 0; dx < CITY_PICTURE_STANDARD_WIDTH; dx++) {
      const sx = Math.min(width - 1, Math.floor(dx * width / CITY_PICTURE_STANDARD_WIDTH));
      out.set(pixels.subarray((sy * width + sx) * 4, (sy * width + sx) * 4 + 4), (dy * CITY_PICTURE_STANDARD_WIDTH + dx) * 4);
    }
  }
  return { pixels: out, width: CITY_PICTURE_STANDARD_WIDTH, height: targetHeight };
}

function ingest(pngBase64) {
  const raw = checkBase64(pngBase64);
  let decoded;
  try { decoded = decodePNG(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)); }
  catch (error) { if (error instanceof PNGError) fail(422, 'CITY_PICTURE_FORMAT'); throw error; }
  const scaled = scaleToStandardWidth(decoded.pixels, decoded.width, decoded.height);
  let encoded;
  try { encoded = Buffer.from(encodePNG(scaled.pixels, scaled.width, scaled.height, 4)); }
  catch (error) { if (error instanceof PNGError) fail(422, 'CITY_PICTURE_GEOMETRY'); throw error; }
  return { bytes: encoded, width: scaled.width, height: scaled.height, sha256: sha(encoded) };
}

const rowDescriptor = row => Object.freeze({ view: row.view, width: row.width, height: row.height,
  byteLength: row.byte_length, sha256: row.sha256 });

// 准入共用：gamecopy／systembasemapstore 的純函數無 store 句柄，構造時綁定同進程
// 唯一 SQL；未綁定時 fail-closed（只認內建 0..14）。
let boundStore = null;
export function bindCityPictureStorage(storage) {
  boundStore = new CityPictureStore({ storage });
  return boundStore;
}
export function hasCityPictureView(view) {
  if (CityPictureStore.isBuiltinView(view)) return true;
  if (!Number.isInteger(view) || view < 0 || view > CITY_PICTURE_MAX_VIEW) return false;
  return boundStore ? boundStore.has(view) : false;
}

export class CityPictureStore {
  #sql;
  constructor({ storage }) {
    if (!storage?.sql || typeof storage.transactionSync !== 'function') throw new TypeError('actual SQLite storage required');
    this.#sql = storage.sql;
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS city_pictures (view INTEGER PRIMARY KEY CHECK(view >= 0 AND view <= 255), png BLOB NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length > 0), width INTEGER NOT NULL CHECK(width > 0), height INTEGER NOT NULL CHECK(height > 0), created_at TEXT NOT NULL)');
    });
  }
  static isBuiltinView(view) {
    return Number.isInteger(view) && view >= 0 && view < CITY_PICTURE_BUILTIN_COUNT;
  }
  list() {
    return Object.freeze(this.#sql.exec('SELECT view,width,height,byte_length,sha256 FROM city_pictures ORDER BY view').toArray().map(rowDescriptor));
  }
  has(view) {
    if (CityPictureStore.isBuiltinView(view)) return true;
    if (!Number.isInteger(view) || view < 0 || view > CITY_PICTURE_MAX_VIEW) return false;
    return this.#sql.exec('SELECT view FROM city_pictures WHERE view=?', view).toArray().length > 0;
  }
  get(view) {
    if (!Number.isInteger(view) || view < 0 || view > CITY_PICTURE_MAX_VIEW) return null;
    const row = this.#sql.exec('SELECT * FROM city_pictures WHERE view=?', view).toArray()[0];
    if (!row) return null;
    return Object.freeze({ ...rowDescriptor(row), bytes: Buffer.from(row.png) });
  }
  // 使用者拍板：優先複用已刪除空洞，否則遞增；超 255 拒絕。
  allocate() {
    const used = new Set(this.#sql.exec('SELECT view FROM city_pictures').toArray().map(row => row.view));
    for (let view = CITY_PICTURE_BUILTIN_COUNT; view <= CITY_PICTURE_MAX_VIEW; view++) {
      if (!used.has(view)) return view;
    }
    fail(422, 'CITY_PICTURE_EXHAUSTED');
  }
  add(pngBase64) {
    const view = this.allocate(), picture = ingest(pngBase64);
    this.#sql.exec('INSERT INTO city_pictures VALUES(?,?,?,?,?,?,?)', view, picture.bytes, picture.sha256, picture.bytes.length, picture.width, picture.height, new Date().toISOString());
    return Object.freeze({ view, width: picture.width, height: picture.height, byteLength: picture.bytes.length, sha256: picture.sha256 });
  }
  replace(view, pngBase64) {
    if (CityPictureStore.isBuiltinView(view)) fail(422, 'CITY_PICTURE_BUILTIN');
    if (!Number.isInteger(view) || view < 0 || view > CITY_PICTURE_MAX_VIEW) fail(422, 'CITY_PICTURE_VIEW');
    // sql.exec 回的是資料列游標（沒有 .changes），先查存在再寫。
    if (this.#sql.exec('SELECT view FROM city_pictures WHERE view=?', view).toArray().length !== 1) fail(404, 'CITY_PICTURE_NOT_FOUND');
    const picture = ingest(pngBase64);
    this.#sql.exec('UPDATE city_pictures SET png=?,sha256=?,byte_length=?,width=?,height=? WHERE view=?', picture.bytes, picture.sha256, picture.bytes.length, picture.width, picture.height, view);
    return Object.freeze({ view, width: picture.width, height: picture.height, byteLength: picture.bytes.length, sha256: picture.sha256 });
  }
  remove(view) {
    if (CityPictureStore.isBuiltinView(view)) fail(422, 'CITY_PICTURE_BUILTIN');
    if (!Number.isInteger(view) || view < 0 || view > CITY_PICTURE_MAX_VIEW) fail(422, 'CITY_PICTURE_VIEW');
    // 物理刪除（使用者拍板）；引用該圖的據點顯示為空，僅影響新發布。
    if (this.#sql.exec('SELECT view FROM city_pictures WHERE view=?', view).toArray().length !== 1) fail(404, 'CITY_PICTURE_NOT_FOUND');
    this.#sql.exec('DELETE FROM city_pictures WHERE view=?', view);
    return Object.freeze({ view });
  }
}
