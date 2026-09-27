"""Isolated authoring roundtrip; reads Web source only, writes private temp."""

import hashlib
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from apply_content_patch import apply_patch
from content_pipeline import SOURCE_ROOT, load_content, read_json, write_json

catalog = read_json(SOURCE_ROOT / "catalog.json")
chapter = catalog["chapters"][0]["file"]
original = read_json(SOURCE_ROOT / chapter)
changed = deepcopy(original)
changed["state"]["cities"][0]["prod"] = 12345
patch = {
    "format": "wolong-content-patch", "version": 1,
    "packId": catalog["id"], "revision": catalog["revision"],
    "changes": [{"path": chapter,
                 "sha256": hashlib.sha256((SOURCE_ROOT / chapter).read_bytes()).hexdigest(),
                 "document": changed}],
}
with TemporaryDirectory(prefix="wolong-editor-test-") as temporary:
    root = Path(temporary)
    path = root / "patch.json"
    write_json(path, patch)
    output = apply_patch(SOURCE_ROOT, path, root / "edited", "editor-test-1")
    compiled = load_content(output)[1]
    assert compiled["scenarios"][0]["cities"][0]["prod"] == 12345
    assert read_json(output / chapter)["compatibility"] == original["compatibility"]
    assert (output / "world/roads.json").read_bytes() == (SOURCE_ROOT / "world/roads.json").read_bytes()
    for mode in ("path", "hash", "capacity", "unknown"):
        bad = deepcopy(patch)
        change = bad["changes"][0]
        if mode == "path":
            change["path"] = "../outside.json"
        elif mode == "hash":
            change["sha256"] = "0" * 64
        elif mode == "capacity":
            change["document"]["state"]["cities"].pop()
        else:
            change["document"]["compatibility"]["injected"] = 1
        write_json(path, bad)
        target = root / mode
        try:
            apply_patch(SOURCE_ROOT, path, target, "editor-test-2")
        except ValueError:
            pass
        else:
            raise AssertionError(f"accepted bad patch: {mode}")
        assert not target.exists()
assert read_json(SOURCE_ROOT / chapter) == original
print("content editor OK: isolated compilation, compatibility/roads intact, malicious/stale/capacity patches rejected")
