#!/usr/bin/env node
/** Optional static release packaging; no compilation or game-data mutation. */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { buildStaticRelease, STATIC_RELEASE_FILE } from "../vps/static-release.mjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "web");
const destination = join(root, "dist");
const excluded = new Set([
  "demo.html",
  "road_graph_probe.json",
  "road_search_probe.json",
  "grf/ui/battle_symbols_grid.png",
  // Design originals; the public UI uses the exported feather-fan asset.
  "加粗描边的羽扇图标.png",
  "柔光白羽金柄羽扇.png",
]);
function include(path) {
  // Unified-map authoring inputs are not player runtime assets (37–41 MiB).
  // Keep them in Git/VPS editor sources, not Workers Static Assets. Do not
  // generically skip large files: an oversized runtime asset must still fail.
  if (/^content\/builtin\/compiled\/[^/]+\/game-source\.json$/.test(path))
    return false;
  if (excluded.has(path) || /(^|\/)[.]/.test(path)) return false;
  if (/\.(log|psd|npy|pyc)$/i.test(path) || path.endsWith("logs_webserver.txt"))
    return false;
  if (/^(capture|grf\/uiprobe)\//.test(path)) return false;
  if (path.startsWith("grf/music/")) {
    return (
      path === "grf/music/playback.json" ||
      /^grf\/music\/loops\/[^/]+\.flac$/.test(path)
    );
  }
  if (path.startsWith("grf/sfx/"))
    return /^grf\/sfx\/ynsound-record(3|13)\.wav$/.test(path);
  return true;
}
const files = [];
function collect(directory, prefix = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symlink not allowed: ${relative}`);
    if (entry.isDirectory()) collect(absolute, `${relative}/`);
    else if (include(relative)) {
      if (!entry.isFile()) throw new Error(`Non-file not allowed: ${relative}`);
      const size = lstatSync(absolute).size;
      if (size > 25 * 1024 * 1024)
        throw new Error(`Exceeds 25 MiB: ${relative}`);
      files.push({ relative, absolute, size });
    }
  }
}
collect(source);
if (files.length + 1 > 20000)
  throw new Error("Exceeds conservative Pages 20,000-file limit");
const names = files.map((file) => file.relative.toLowerCase());
if (new Set(names).size !== names.length)
  throw new Error("Case-insensitive path collision");
// Reserve the generated inventory; never trust a source-supplied replacement.
if (names.includes(STATIC_RELEASE_FILE))
  throw new Error("Reserved static release inventory path");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const release = buildStaticRelease(files.map(file => {
  const bytes = readFileSync(file.absolute);
  if (bytes.length !== file.size) throw new Error(`Source changed: ${file.relative}`);
  file.sha256 = sha(bytes);
  return { path: file.relative, byteLength: bytes.length, sha256: file.sha256 };
}));
// Never remove an arbitrary user path: the output is fixed to this repository's dist/.
if (existsSync(destination) && lstatSync(destination).isSymbolicLink())
  throw new Error("dist must not be a symlink");
rmSync(destination, { recursive: true, force: true });
for (const file of files) {
  const target = join(destination, file.relative);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(file.absolute, target);
  if (!lstatSync(target).isFile() || sha(readFileSync(target)) !== file.sha256)
    throw new Error(`Copied bytes changed: ${file.relative}`);
}
writeFileSync(join(destination, STATIC_RELEASE_FILE), release.bytes, { flag: "wx" });
process.stdout.write(
  `Static inventory SHA256: ${release.sha256}; source tree: ${release.manifest.sourceTreeDigest}\n` +
  `Prepared dist/: ${files.length + 1} files, ${((files.reduce((sum, file) => sum + file.size, 0) + release.bytes.length) / 1024 / 1024).toFixed(2)} MiB\n`,
);
