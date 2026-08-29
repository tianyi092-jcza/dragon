import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = await fs.readFile(
  new URL("../web/src/ui/startmenu.js", import.meta.url),
  "utf8",
);
assert.match(source, /!sv\.played/);
assert.match(source, /disabled: true/);
assert.match(source, /!rows\[scroll \+ i\]\.disabled/);
console.log("title load empty slots are disabled");
