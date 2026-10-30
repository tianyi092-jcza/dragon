// Read-only byte preflight against a trusted build and locally measured source
// tree. NOT an admission capability, HTTP/MIME proof, import-closure proof or
// old-session retention mechanism. No default origin, cache or mutable fallback.
import { createHash } from 'node:crypto';
import { parseStaticRelease, STATIC_RELEASE_FILE, STATIC_RELEASE_MAX_BYTES } from './static-release.mjs';
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const seasons = ['spring', 'summer', 'autumn', 'winter'];
function fail(code) { throw new Error(code); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('STATIC_VISUAL_BINDING');
}
function captureVisuals(manifest) {
  // Capture before the first read await; no later caller mutation changes URLs,
  // hashes or the set of selected visual roles.
  const visuals = structuredClone(manifest?.visualAssets);
  exact(visuals, ['seasonAtlases', 'seasons']);
  const entries = []; let prefix;
  for (const [group, stem] of [['seasonAtlases', 'map_atlas_'], ['seasons', 'map_tiles_']]) {
    exact(visuals[group], seasons);
    for (const season of seasons) {
      const value = visuals[group][season];
      exact(value, ['path', 'url', 'sha256', 'byteLength']);
      if (typeof value.path !== 'string' || value.url !== value.path || !digest(value.sha256) ||
          !Number.isSafeInteger(value.byteLength) || value.byteLength < 1) fail('STATIC_VISUAL_BINDING');
      const match = /^content\/builtin\/compiled\/([A-Za-z0-9_-]+)\/([^/]+)$/.exec(value.path);
      if (!match || match[2] !== stem + season + '.png' || (prefix !== undefined && prefix !== match[1])) fail('STATIC_VISUAL_BINDING');
      prefix = match[1]; entries.push(value);
    }
  }
  return entries;
}

// Read-only declared references, not resolved program archive keys or verified
// asset bodies. Reuse exactly the binding checks used by the static verifier.
export function captureStaticVisualReferences(manifest) {
  return captureVisuals(manifest).map((entry, index) => ({
    role: `${index < seasons.length ? 'seasonAtlases' : 'seasons'}:${seasons[index % seasons.length]}`,
    path: entry.path, sha256: entry.sha256, byteLength: entry.byteLength,
  }));
}

/** readStatic is a trusted, bounded path-only byte port, never a client URL. */
export function createStaticResourceVerifier({ readStatic, expectedDigest, sourceTreeDigest } = {}) {
  if (typeof readStatic !== 'function' || !digest(expectedDigest) || !digest(sourceTreeDigest)) throw new TypeError('trusted byte port and build/source pins required');
  async function read(path, maxBytes) {
    const input = await readStatic(path, { maxBytes });
    if (input === null) fail('STATIC_RESOURCE_MISSING');
    if (!(input instanceof Uint8Array) || input.byteLength > maxBytes) fail('STATIC_RESOURCE_BYTES');
    return Buffer.from(input);
  }
  // All references are captured before IO. A batch shares only this scan, never
  // a cached success across operations, retries or concurrent callers.
  async function verifyCaptured(visuals) {
    const first = await read(STATIC_RELEASE_FILE, STATIC_RELEASE_MAX_BYTES);
    const release = parseStaticRelease(first, expectedDigest);
    if (release.sourceTreeDigest !== sourceTreeDigest ||
        !release.files.some(file => file.path.startsWith('src/') && file.path.endsWith('.js'))) fail('STATIC_SOURCE_MISMATCH');
    const byPath = new Map(release.files.map(file => [file.path, file]));
    for (const visual of visuals) {
      const file = byPath.get(visual.path);
      if (!file || file.kind !== 'asset' || file.sha256 !== visual.sha256 || file.byteLength !== visual.byteLength) fail('STATIC_VISUAL_BINDING');
    }
    let filesVerified = 0, bytesVerified = 0;
    for (const file of release.files) {
      // Deployment configuration is not necessarily served as an HTTP asset.
      if (file.kind === 'configuration') continue;
      const bytes = await read(file.path, Math.max(1, file.byteLength));
      if (bytes.length !== file.byteLength || sha(bytes) !== file.sha256) fail('STATIC_RESOURCE_BYTES');
      filesVerified++; bytesVerified += bytes.length;
    }
    const last = await read(STATIC_RELEASE_FILE, first.length);
    if (!last.equals(first)) fail('STATIC_RELEASE_CHANGED');
    return Object.freeze({ releaseDigest: expectedDigest, sourceTreeDigest, filesVerified, bytesVerified });
  }
  async function verifyStaticResources({ manifest } = {}) {
    return verifyCaptured(captureVisuals(manifest));
  }
  // Optional trusted-port capability. Each item needs only visualAssets, not
  // an entire runtime index or author manifest retained in memory.
  async function batch({ manifests } = {}) {
    if (!Array.isArray(manifests) || !manifests.length) throw new TypeError('nonempty static manifest batch required');
    const visuals = [];
    for (const manifest of manifests) visuals.push(...captureVisuals(manifest));
    const manifestsVerified = manifests.length;
    const proof = await verifyCaptured(visuals);
    return Object.freeze({ ...proof, manifestsVerified });
  }
  return Object.freeze(Object.assign(verifyStaticResources, { batch }));
}
