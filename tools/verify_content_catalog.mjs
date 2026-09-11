import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContentCatalog } from "../web/src/content/catalog.js";

let manifest, data;
try {
  [manifest, data] = await Promise.all(
    ["content/builtin/catalog.json", "data.json"].map(async (file) =>
      JSON.parse(await readFile(new URL(`../web/${file}`, import.meta.url))),
    ),
  );
} catch (error) {
  throw new Error("cannot load Web content catalog fixtures", { cause: error });
}
const catalog = createContentCatalog(manifest, data);
assert.equal(catalog.data, data);
assert.equal(catalog.chapters.length, 20);
for (const chapter of catalog.chapters) {
  assert.equal(catalog.chapter(chapter.id), chapter);
  assert.equal(
    catalog.chapter(chapter.legacyScenarioIndex)?.template,
    data.scenarios[chapter.legacyScenarioIndex],
  );
  assert.equal(catalog.resolveReference(chapter.reference), chapter);
}
assert.deepEqual(
  catalog.chapters
    .filter((chapter) => chapter.official)
    .map((chapter) => chapter.legacyScenarioIndex),
  [16, 17, 18, 19],
);
assert.equal(catalog.chapter("missing"), null);
assert.equal(catalog.chapter(-1), null);
assert.equal(
  catalog.resolveReference({
    ...catalog.chapter(0).reference,
    revision: "other",
  }),
  null,
);
assert.equal(
  catalog.resolveReference({
    ...catalog.chapter(0).reference,
    packId: "other",
  }),
  null,
);
const duplicate = structuredClone(manifest);
duplicate.chapters[1].id = duplicate.chapters[0].id;
assert.throws(() => createContentCatalog(duplicate, data), /identity/);
assert.throws(
  () => createContentCatalog(manifest, { scenarios: [] }),
  /incomplete/,
);
process.stdout.write(
  "content catalog OK: stable pack/chapter/revision refs preserve all 20 legacy scenario indices\n",
);
