"""Staged v2 compiler controls: explicit fixed candidate, copied Web source only."""

import argparse
import hashlib
import json
import os
import shutil
import sys
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from content_pipeline import (
    SOURCE_ROOT,
    compile_content,
    load_content,
    read_json,
    write_json,
)

WEB = SOURCE_ROOT.parents[1]
FORBIDDEN = [
    (WEB.parent.parent / name).resolve()
    for name in ("Dragon", "原版", "上", "中", "下", "后")
]


def guard(event, args):
    if event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
        path = Path(os.fsdecode(args[0])).resolve()
        if path.name.upper() == "SAVE.DAT" or any(
            path.is_relative_to(root) for root in FORBIDDEN
        ):
            raise PermissionError(f"forbidden original-data access: {path}")


sys.addaudithook(guard)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--candidate", type=Path, required=True)
args = parser.parse_args()
candidate_bytes = args.candidate.read_bytes()
assert (
    hashlib.sha256(candidate_bytes).hexdigest()
    == "353a6c706e002f94a861ef515d11342080290cffbcbb0acc7053231413ecadf7"
)
original_source = (SOURCE_ROOT / "world/roads.json").read_bytes()
original_runtime = (WEB / "road_graph.json").read_bytes()
try:
    candidate = json.loads(candidate_bytes)
    assert (
        json.loads(original_source)["version"]
        == json.loads(original_runtime)["version"]
        == 1
    )
except ValueError as error:
    raise AssertionError("invalid fixed Web road JSON fixture") from error


def rejected(action):
    try:
        action()
    except (ValueError, TypeError, KeyError):
        return
    raise AssertionError("invalid staged content was accepted")


with TemporaryDirectory(prefix="wolong-v2-content-test-") as temporary:
    root = Path(temporary)
    source = root / "source"
    shutil.copytree(SOURCE_ROOT, source)
    roads_path = source / "world/roads.json"
    write_json(roads_path, candidate)
    output = root / "compiled-v2"
    compile_content(source, output, maps=False)
    assert read_json(output / "road_graph.json") == candidate
    published = (output / "road_graph.json").read_bytes()
    rejected(lambda: compile_content(source, output, maps=False))
    assert (output / "road_graph.json").read_bytes() == published
    # Collection types must match the JS loader. An empty edge array is a
    # valid staged asset shape, not a claim that native callers accept this world.
    empty = deepcopy(candidate)
    empty["edges"] = []
    for node in empty["nodes"]:
        node["edgeSlots"] = [0, 0, 0, 0]
    write_json(roads_path, empty)
    empty_output = root / "empty-array"
    compile_content(source, empty_output, maps=False)
    assert read_json(empty_output / "road_graph.json") == empty
    for field in ("edges", "nodes"):
        for invalid in ({}, "", None):
            graph = deepcopy(empty)
            graph[field] = invalid
            write_json(roads_path, graph)
            rejected(lambda: load_content(source))
            target = root / "rejected-collection"
            rejected(lambda target=target: compile_content(source, target, maps=False))
            assert not target.exists(), "bad collection must not create output"
            assert (output / "road_graph.json").read_bytes() == published
    # v2 consumes the full byte domain, NOT v1's positive finite distance.
    for cost in (0, 255):
        graph = deepcopy(candidate)
        graph["edges"][0]["weight"] = cost
        write_json(roads_path, graph)
        assert load_content(source)[-1]["edges"][0]["weight"] == cost
    changes = [
        lambda g: g["nodes"][0]["edgeSlots"].__setitem__(0, 0),
        lambda g: g["nodes"][0]["edgeSlots"].__setitem__(0, 0xC800),
        lambda g: g["nodes"][0]["edgeSlots"].__setitem__(0, 0x4801),
        lambda g: g["nodes"][0]["edgeSlots"].__setitem__(1, 0x4800),
        lambda g: g["edges"][0].__setitem__("target", 0),
        lambda g: g["edges"][0].__setitem__("weight", 0.5),
        lambda g: g["edges"][0].__setitem__("weight", 256),
        lambda g: g["edges"][0].__setitem__("weight", True),
        lambda g: g["edges"][0]["points"][0].pop("flags"),
        lambda g: g["edges"][0]["points"][0].__setitem__("flags", 256),
        lambda g: g["edges"][0].pop("bounds"),
        lambda g: g["edges"][0]["bounds"].__setitem__("maxX", 0),
        lambda g: g.__setitem__("width", 768),
        lambda g: g["nodes"][0].__setitem__("x", 384),
        lambda g: g["edges"][0]["points"][0].__setitem__("y", 256),
        lambda g: g["edges"].__setitem__(
            0, {**g["edges"][0], "points": [g["edges"][0]["points"][0]] * 6145}
        ),
        lambda g: g.__setitem__("edges", g["edges"] * 2),
    ]
    for change in changes:
        graph = deepcopy(candidate)
        change(graph)
        write_json(roads_path, graph)
        rejected(lambda: load_content(source))
        target = root / "rejected"
        rejected(lambda target=target: compile_content(source, target, maps=False))
        assert not target.exists(), "validation failure must not create any output"
        assert (output / "road_graph.json").read_bytes() == published
assert (SOURCE_ROOT / "world/roads.json").read_bytes() == original_source
assert (WEB / "road_graph.json").read_bytes() == original_runtime
print(
    "v2 content OK: fixed candidate roundtrip, 23 malformed controls, empty-array acceptance, byte costs, new-directory-only publication; default v1 unchanged"
)
