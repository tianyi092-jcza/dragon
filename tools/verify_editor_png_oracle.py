"""Independent installed Pillow test oracle; no production dependency or user files."""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23/"
FIXED = {f"web/map_atlas_{season}.png" for season in ("spring", "summer", "autumn", "winter")}
FIXED.update({PREFIX + "minimap_base.png", PREFIX + "minimap_large.png"})
try:
    files = json.load(sys.stdin)
except (json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
    raise ValueError("invalid owned PNG oracle input JSON") from error
if not isinstance(files, list) or len(files) > 128:
    raise ValueError("bounded owned PNG input list required")
results = []
for name in files:
    if not isinstance(name, str) or not (name in FIXED or re.fullmatch(r"\.dragon-analysis/editor-phase/backend-png-io-session-r1/fixture-[0-9]+\.png", name)):
        raise ValueError("PNG oracle input outside explicit whitelist")
    path = (ROOT / name).resolve(strict=True)
    if not path.is_relative_to(ROOT.resolve()):
        raise ValueError("PNG oracle path escaped repository")
    with Image.open(path) as image:
        if image.format != "PNG" or image.width * image.height > 4 * 1024 * 1024:
            raise ValueError("PNG oracle budget")
        rgba = image.convert("RGBA")
        results.append({"path": name, "width": image.width, "height": image.height, "pixelSha": hashlib.sha256(rgba.tobytes()).hexdigest()})
print(json.dumps({"oracle": "installed-Pillow", "results": results}))
