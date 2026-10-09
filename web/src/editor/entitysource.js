// Pure byte-bound reader for an explicit trusted author-only source descriptor.
// No filesystem/fetch; provenance paths are DATA, never input file locations.
const hex = (value, chars) => typeof value === "string" && value.length === chars && /^[0-9a-f]+$/i.test(value);
const fail = () => { throw new TypeError("invalid/unbound entity source package"); };
export async function decodeEntitySource(manifest, bytes, trusted, sha256) {
  if (!(bytes instanceof Uint8Array) || typeof sha256 !== "function" || !trusted ||
      manifest?.schemaVersion !== 1 || manifest.profile !== "ki-fixed-entity-source-1" || manifest.mode !== "READONLY_IMPORT_INPUT" ||
      manifest.resource?.path !== "entity-source.json" || manifest.runtimeDataSha256 !== trusted.runtimeDataSha256 ||
      manifest.resource.sha256 !== trusted.resource?.sha256 || manifest.resource.byteLength !== trusted.resource?.byteLength ||
      !Number.isInteger(bytes.byteLength) || bytes.byteLength <= 0 || bytes.byteLength > 2 * 1024 * 1024 || bytes.byteLength !== manifest.resource.byteLength ||
      !hex(trusted.runtimeDataSha256,64) || !hex(trusted.resource.sha256,64) || !Array.isArray(trusted.sourceChapterOrder) || trusted.sourceChapterOrder.length !== 20) fail();
  if (await sha256(bytes) !== trusted.resource.sha256) fail();
  let bundle; try { bundle = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch (cause) { throw new TypeError("invalid entity source JSON", { cause }); }
  if (bundle?.schemaVersion !== 1 || bundle.profile !== manifest.profile || bundle.mode !== manifest.mode || bundle.runtimeDataSha256 !== trusted.runtimeDataSha256 ||
      !Array.isArray(bundle.chapters) || bundle.chapters.length !== 20 || !Array.isArray(bundle.sourceChapterOrder) || bundle.sourceChapterOrder.length !== 20) fail();
  const ids = new Set();
  for (let i = 0; i < 20; i++) {
    const chapter = bundle.chapters[i], expected = trusted.sourceChapterOrder[i], src = chapter?.source;
    if (typeof expected !== "string" || !expected || ids.has(expected) || chapter?.chapterId !== expected || bundle.sourceChapterOrder[i] !== expected ||
        src?.chapterOrdinal !== i % 4 || src.chapterByteOffset !== (i % 4) * 0x56c0 ||
        typeof src.path !== "string" || !Object.hasOwn(trusted.originalSources ?? {}, src.path) ||
        src.sha256 !== trusted.originalSources[src.path] || manifest.originalSources?.[src.path] !== src.sha256 || !hex(chapter.header128,256)) fail();
    ids.add(expected);
    for (const [key,count,width] of [["general32",128,64],["city32",192,64],["faction64",24,128]])
      if (!Array.isArray(chapter[key]) || chapter[key].length !== count || !chapter[key].every(value => hex(value,width))) fail();
  }
  return bundle; // read-only input by contract, NOT an initialized or runnable chapter
}
