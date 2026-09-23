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
parser.add_argument(
    "--candidate",
    type=Path,
    default=Path(__file__).resolve().parent / "fixtures" / "road-v2-candidate.json",
)
args = parser.parse_args()
candidate_bytes = args.candidate.read_bytes()
# P57 rebuilt candidate (user approval (a), 2026-09-21): the historical fixed
# candidate SHA 353a6c70… is absent from disk and git history, so this pin was
# substituted — not edited around. Rebuild provenance: probe trace data
# (origins/edges/geometry, verified identical to P04) + documented E717 rules
# (E81C DH stepping W=0/E=1/N=2/S=3, E77D DH^=1 target slots, E81C AH point
# counting for byte cost, E961/E841/E889/E91E flag classes) + E717 record layout.
# Equivalence proof: re-encoded low 32KiB == P04 frozen SHA c226fc8f… and
# point stream == d443c417…; see march notes §3.6 P57 addendum.
assert (
    hashlib.sha256(candidate_bytes).hexdigest()
    == "b943e43a2fdf6c21ec574702e4933d861ec2176335d32f35b65bd8989b196b48"
)
original_source = (SOURCE_ROOT / "world/roads.json").read_bytes()
original_runtime = (WEB / "road_graph.json").read_bytes()
try:
    candidate = json.loads(candidate_bytes)
    # P58 flip: the fixed source and the published runtime are both the
    # P57-built v2 candidate (default v2). The historical v1 pin is retired.
    assert (
        json.loads(original_source)["version"]
        == json.loads(original_runtime)["version"]
        == 2
    )
    assert original_source == candidate_bytes
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
    # P58 flip retired the new-directory-only gate: recompiling the same
    # source over the same output must be byte-identical, never a refusal.
    compile_content(source, output, maps=False)
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
    "v2 content OK: fixed candidate roundtrip, 23 malformed controls, empty-array acceptance, byte costs, idempotent republication; default v2 since P58"
)
