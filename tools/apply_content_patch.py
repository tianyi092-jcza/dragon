"""Validate an editor patch into a NEW source directory; never publish in place."""

import argparse
import hashlib
import shutil
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from content_pipeline import (
    SOURCE_ROOT,
    load_content,
    read_json,
    source_path,
    write_json,
)

CITY_FIELDS = {"max_prod", "prod", "growth", "defence", "troops", "troops_cap"}


def apply_patch(source, patch_path, output, revision):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output.exists() or output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("output must be a new directory outside source")
    if not output.parent.is_dir():
        raise ValueError("output parent must exist")
    catalog = read_json(source / "catalog.json")
    patch = read_json(patch_path)
    if (patch.get("format"), patch.get("version"), patch.get("packId"), patch.get("revision")) != (
        "wolong-content-patch", 1, catalog["id"], catalog["revision"]
    ):
        raise ValueError("patch identity mismatch")
    if not isinstance(revision, str) or not revision.strip() or revision == catalog["revision"]:
        raise ValueError("a new explicit content revision is required")
    allowed = {chapter["file"] for chapter in catalog["chapters"]} | {"world/layout.json"}
    changes = patch.get("changes")
    if not isinstance(changes, list) or not changes or len(changes) > len(allowed):
        raise ValueError("invalid patch changes")
    seen = set()
    for change in changes:
        path = change["path"]
        if path not in allowed or path in seen:
            raise ValueError("duplicate or forbidden patch path")
        seen.add(path)
        original_path = source_path(source, path)
        if hashlib.sha256(original_path.read_bytes()).hexdigest() != change["sha256"]:
            raise ValueError("source changed since editor opened")
        if path != "world/layout.json":
            original = read_json(original_path)
            candidate = deepcopy(change["document"])
            cities = candidate["state"]["cities"]
            if len(cities) != 192:
                raise ValueError("city capacity cannot change")
            for before, after in zip(original["state"]["cities"], cities, strict=True):
                for field in CITY_FIELDS:
                    value = after[field]
                    limit = 65535 if field in {"max_prod", "prod"} else 255
                    if type(value) is not int or not 0 <= value <= limit:
                        raise ValueError("invalid editable city value")
                    after[field] = before[field]
            if candidate != original:
                raise ValueError("patch changed identities, rules, roads or compatibility bytes")
    # Validate completely before the one-directory publish. Unknown source bytes
    # and roads are copied without reinterpretation. A rejected patch leaves no output.
    with TemporaryDirectory(prefix="wolong-editor-", dir=output.parent) as temporary:
        staged = Path(temporary) / "source"
        shutil.copytree(source, staged)
        for change in changes:
            write_json(source_path(staged, change["path"]), change["document"])
        catalog["revision"] = revision
        write_json(staged / "catalog.json", catalog)
        load_content(staged)
        if output.exists():
            raise FileExistsError(output)
        staged.rename(output)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--patch", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    print(apply_patch(args.source, args.patch, args.output, args.revision))


if __name__ == "__main__":
    main()
