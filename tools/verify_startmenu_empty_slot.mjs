import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = await fs.readFile(
  new URL("../web/src/ui/startmenu.js", import.meta.url),
  "utf8",
);
assert.match(source, /!sv\.played/);
assert.match(source, /disabled: true/);
assert.match(source, /!rows\[scroll \+ i\]\.disabled/);
assert.match(
  source,
  /headerH\s*=\s*24[\s\S]*const top = header \? headY \+ headerH \+ 2/,
  "标题阶段势力等表格也必须使用加高的24px表头",
);
process.stdout.write(
  "title load empty slots are disabled; list headers are 24px\n",
);
