// Lazy authenticated bitmap loading, independent of full-page busy feedback.
export function createMapAtlasLoader({ api, install, publish, path = '/api/admin/base-map/atlas', decode = blob => createImageBitmap(blob) }) {
  let source = null, season = 'spring', key = null, generation = 0, image = null;
  async function load() {
    if (!source) return;
    const descriptor = source.editorAssets?.seasonAtlases?.[season];
    if (!descriptor || !/^[a-f0-9]{64}$/.test(descriptor.sha256) || !Number.isSafeInteger(descriptor.byteLength) || descriptor.byteLength < 1 || descriptor.byteLength > 4 * 1024 * 1024) { publish({ atlasError: '圖集描述無效', atlasLoading: false }); return; }
    const nextKey = season + ':' + descriptor.sha256;
    if (key === nextKey) return;
    key = nextKey;
    const mark = ++generation, selectedSeason = season;
    install(null); image?.close(); image = null;
    publish({ atlasLoading: true, atlasError: '', season });
    try {
      const result = await api(path + '?season=' + selectedSeason, undefined, { binary: true, maxBytes: descriptor.byteLength, feedback: 'local' });
      if (mark !== generation) return;
      if (result.bytes.length !== descriptor.byteLength || result.sha256 !== descriptor.sha256) throw new Error('圖集長度或摘要不符');
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', result.bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (mark !== generation) return;
      if (digest !== descriptor.sha256) throw new Error('圖集內容校驗失敗');
      const decoded = await decode(new Blob([result.bytes], { type: 'image/png' }));
      if (mark !== generation) { decoded.close(); return; }
      if (decoded.width !== 256 || decoded.height !== 256) { decoded.close(); throw new Error('圖集尺寸無效'); }
      image = decoded; install(image);
    } catch (error) {
      if (mark === generation) { key = null; publish({ atlasError: error.message }); }
    } finally { if (mark === generation) publish({ atlasLoading: false }); }
  }
  return Object.freeze({
    setSource(value) {
      source = value;
      if (source) return load();
      generation++; key = null; install(null); image?.close(); image = null;
      publish({ atlasLoading: false, atlasError: '', season });
    },
    setSeason(value) {
      if (!['spring', 'summer', 'autumn', 'winter'].includes(value)) throw new Error('季節無效');
      season = value; return load();
    },
    retry: load,
  });
}
