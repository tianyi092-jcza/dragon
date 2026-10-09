"""Independent fixed-library/owned-fixture Pillow oracle; never production code."""
import hashlib
import json
import re
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1].resolve(strict=True)
MANIFEST_SHA = "76cdf28d1cc6099ccd9f2e7c60085ed6694be6a7509f72c41960d63648cfd2e0"
raw = (ROOT / "server/available-library.txt").read_bytes()
if hashlib.sha256(raw).hexdigest() != MANIFEST_SHA:
    raise ValueError("fixed library changed")
try:
    manifest = json.loads(raw)
    files = json.load(sys.stdin)
except (json.JSONDecodeError, UnicodeDecodeError, OSError) as cause:
    raise ValueError("invalid owned oracle JSON") from cause
fixed = {"web/" + name: row for name, row in manifest["resources"].items() if name.endswith(".png")}
if len(fixed) != 376 or not isinstance(files, list) or len(files) > 450:
    raise ValueError("bounded fixed library list required")
prefix = "web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23/"
additional = {"web/map_atlas_" + season + ".png" for season in ("spring", "summer", "autumn", "winter")}
additional.update({prefix + "minimap_base.png", prefix + "minimap_large.png"})
results = []
for name in files:
    if not isinstance(name, str) or not (name in fixed or name in additional or re.fullmatch(r"\.dragon-analysis/editor-phase/backend-library-png-session-r1/fixture-[0-9]{4}\.png", name)):
        raise ValueError("outside fixed PNG whitelist")
    path = (ROOT / name).resolve(strict=True)
    if not path.is_relative_to(ROOT):
        raise ValueError("PNG oracle path escaped repository")
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if name in fixed and (len(data) != fixed[name]["byteLength"] or digest != fixed[name]["sha256"]):
        raise ValueError("fixed PNG bytes changed")
    if not 0 < len(data) <= 16 * 1024 * 1024:
        raise ValueError("PNG byte budget")
    with Image.open(BytesIO(data)) as image:
        if image.format != "PNG" or image.width * image.height > 4 * 1024 * 1024:
            raise ValueError("PNG pixel budget")
        rgba = image.convert("RGBA")
        results.append({"path": name, "byteSha": digest, "width": image.width, "height": image.height, "pixelSha": hashlib.sha256(rgba.tobytes()).hexdigest()})
print(json.dumps({"oracle": "installed-Pillow", "manifestSha": MANIFEST_SHA, "results": results}))
