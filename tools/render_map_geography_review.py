"""Local visual review only: no water classifier, rule edits, DOS or profile IO."""
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFile, ImageFont

ROOT = Path(__file__).resolve().parent.parent
round_name, revision = sys.argv[1:]
if not re.fullmatch(r"[a-zA-Z0-9-]+", round_name):
    raise ValueError("invalid review round")
if not re.fullmatch(r"map-2-[a-f0-9]{64}", revision):
    raise ValueError("invalid compiled revision")
package = ROOT / "web/content/builtin/compiled" / revision
manifest_path = package / "manifest.json"
def decode_json(data, label):
    try:
        return json.loads(data)
    except (ValueError, TypeError) as cause:
        raise ValueError(f"invalid {label}") from cause


def decode_image_bytes(data):
    # Byte-only decoder: unlike Image.open, this API cannot accept a path.
    # Callers still supply only whitelisted and SHA/length-verified assets.
    if not isinstance(data, bytes):
        raise TypeError("review decoder requires bytes")
    parser = ImageFile.Parser()
    parser.feed(data)
    return parser.close().convert("RGB")


manifest = decode_json(manifest_path.read_bytes(), "manifest")
if manifest["worldRevision"] != revision:
    raise ValueError("manifest revision mismatch")
inputs = {"manifest.json": manifest_path.read_bytes()}
assets = {asset["path"]: asset for asset in manifest["assets"]}


def checked(name):
    # Never follow paths provided by a report or external argument.
    if name not in {"terrain.bin", "game-source.json", "map_atlas_spring.png", "minimap_base.png", "minimap_large.png"}:
        raise ValueError("asset outside review whitelist")
    data = (package / name).read_bytes()
    entry = assets[name]
    if len(data) != entry["byteLength"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
        raise ValueError(f"asset hash/length mismatch: {name}")
    inputs[name] = data
    return data


terrain = checked("terrain.bin")
if len(terrain) != 384 * 256:
    raise ValueError("unsupported terrain dimensions")
source = decode_json(checked("game-source.json"), "game source")
checked("map_atlas_spring.png")
checked("minimap_base.png")
checked("minimap_large.png")
legacy_paths = ["web/grf/ui/minimap_roads.png", "web/grf/ui/minimap_auto_208x139.png"]
for path in legacy_paths:
    inputs[path] = (ROOT / path).read_bytes()
output = ROOT / ".dragon-analysis/map-migration-2" / round_name
output.mkdir()  # Never overwrite a historical review round.
font = ImageFont.load_default()
atlas = decode_image_bytes(inputs["map_atlas_spring.png"])
if atlas.size != (256, 256):
    raise ValueError("unsupported indexed atlas dimensions")

# Indexed sprites stay identifiable; enlargement is nearest-neighbour, not a
# procedural approximation and not a claim about native layer semantics.
contacts = Image.new("RGB", (16 * 80, 16 * 90), "white")
draw = ImageDraw.Draw(contacts)
for tile in range(256):
    x, y = (tile % 16) * 80, (tile // 16) * 90
    crop = atlas.crop(((tile % 16) * 16, (tile // 16) * 16,
                       (tile % 16 + 1) * 16, (tile // 16 + 1) * 16))
    contacts.paste(crop.resize((64, 64), Image.Resampling.NEAREST), (x + 8, y))
    draw.text((x + 8, y + 66), f"{tile:02X} / {tile}", font=font, fill="black")
contacts.save(output / "indexed-sprites.png")

# Pre-89F0 known initial plane, without runtime owner/legion overlays. Only a
# coordinate reference for human annotation, not the live-game screenshot.
reference = Image.new("RGB", (1536, 1056), "white")
small_atlas = atlas.resize((64, 64), Image.Resampling.NEAREST)
for i, tile in enumerate(terrain):
    sprite = small_atlas.crop(((tile % 16) * 4, (tile // 16) * 4,
                              (tile % 16 + 1) * 4, (tile // 16 + 1) * 4))
    reference.paste(sprite, ((i % 384) * 4, (i // 384) * 4 + 32))
draw = ImageDraw.Draw(reference)
draw.text((4, 4), "Initial MMAP tile plane (before 89F0); tile coordinates; NO semantic classifier", font=font, fill="black")
for x in range(0, 384, 32):
    draw.line((x * 4, 32, x * 4, 1055), fill="gray")
    draw.text((x * 4 + 2, 18), str(x), font=font, fill="black")
for y in range(0, 256, 32):
    draw.line((0, y * 4 + 32, 1535, y * 4 + 32), fill="gray")
    draw.text((2, y * 4 + 34), str(y), font=font, fill="black", stroke_width=1, stroke_fill="white")
reference.save(output / "initial-map-coordinates.png")

comparison = Image.new("RGB", (4 * 660, 460), "white")
draw = ImageDraw.Draw(comparison)
for index, (label, key) in enumerate([
    ("Legacy Web hand-composed reference (NOT native pixel proof)", legacy_paths[0]),
    ("Previous automatic 208x139 (historical approval only)", legacy_paths[1]),
    ("Current candidate 208x139; water annotation PENDING", "minimap_base.png"),
    ("Current candidate 250x167; fitted comparison only", "minimap_large.png"),
]):
    draw.text((index * 660 + 4, 4), label, font=font, fill="black")
    # Decode only the exact whitelisted/hash-checked bytes; do not reopen paths.
    image = decode_image_bytes(inputs[key])
    image.thumbnail((624, 417), Image.Resampling.NEAREST)
    # Upscale all reference boxes proportionally for readable comparison.
    scale = min(624 / image.width, 417 / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
    comparison.paste(image, (index * 660 + 4, 32))
comparison.save(output / "minimap-comparison.png")

histogram = Counter(source["map"]["base"]["geography"])
receipt = {
    "caseId": "M-00-M-06-geography-visual-review", "contractRevision": "visual-review-1",
    "sourceHashes": {name: hashlib.sha256(data).hexdigest() for name, data in inputs.items()},
    "toolHashes": {"tools/render_map_geography_review.py": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
    "toolVersion": {"python": sys.version, "pillow": PIL.__version__},
    "fixtureId": revision, "expectedSource": "hash-verified known initial plane and atlas; Web reference images, NOT native semantics",
    "result": "REVIEW_REQUIRED", "geographyHistogram": dict(sorted(histogram.items())),
    "geographyProvenance": source["map"]["base"].get("geographyProvenance"),
    "artifactPaths": ["indexed-sprites.png", "initial-map-coordinates.png", "minimap-comparison.png"],
    "coverageLimits": "No automatic classification or approval. Original lake annotation absent in candidate. Does not prove native rules or certify historical river/sea labels.",
}
(output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(json.dumps({"result": receipt["result"], "histogram": receipt["geographyHistogram"], "revision": revision}))
