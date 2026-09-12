// Presentation-only cache; separate from game saves and music settings.
export const MUSIC_CACHE = "wolong.intro.music.v1";

export async function loadOpeningMusic(
  url,
  { signal, onProgress = () => {} } = {},
) {
  let cache;
  try {
    cache = await globalThis.caches?.open(MUSIC_CACHE);
    const cached = await cache?.match(url);
    if (cached?.ok) {
      const blob = await cached.blob();
      if (blob.size) {
        onProgress({ stage: "cached", loaded: blob.size, total: blob.size });
        return blob;
      }
    }
  } catch {
    // Storage can be unavailable (plain HTTP, privacy settings or quota).
    cache = null;
  }
  onProgress({ stage: "download", loaded: 0, total: 0 });
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`开场音乐下载失败: ${response.status}`);
  const length = Number(response.headers.get("Content-Length"));
  const total =
    !response.headers.get("Content-Encoding") &&
    Number.isFinite(length) &&
    length > 0
      ? length
      : 0;
  const parts = [];
  let loaded = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.byteLength;
        onProgress({ stage: "download", loaded, total });
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const bytes = await response.arrayBuffer();
    parts.push(bytes);
    loaded = bytes.byteLength;
  }
  if (!loaded || (total && loaded !== total))
    throw new Error("开场音乐下载不完整");
  const blob = new Blob(parts, { type: "audio/mpeg" });
  onProgress({ stage: "saving", loaded, total: loaded });
  let saved = false;
  if (cache) {
    try {
      await cache.put(
        url,
        new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }),
      );
      saved = true;
    } catch {
      // Keep the complete in-memory blob; never pretend persistence succeeded.
    }
  }
  onProgress({ stage: saved ? "saved" : "memory", loaded, total: loaded });
  return blob;
}
