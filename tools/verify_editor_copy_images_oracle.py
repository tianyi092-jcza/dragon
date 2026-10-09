"""Independent Pillow pixel evidence for six owned, explicitly named image artifacts only."""
import hashlib
import json
import pathlib
import re
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2 or not re.fullmatch(r"[1-9][0-9]{0,2}", sys.argv[1]):
    raise ValueError("owned round required")
base = (ROOT / ".dragon-analysis/editor-phase/backend-copy-images-session-r1" / ("images-r" + sys.argv[1])).resolve(strict=True)
if not base.is_relative_to(ROOT):
    raise ValueError("owned directory escape")
records = []
for number in range(1, 7):
    path = (base / ("asset-" + str(number) + ".png")).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError("owned artifact escape")
    with Image.open(path) as image:
        if image.format != "PNG" or image.width * image.height > 4 * 1024 * 1024:
            raise ValueError("bounded PNG required")
        pixels = image.convert("RGBA").tobytes()
        records.append({"number": number, "width": image.width, "height": image.height, "pixelSha256": hashlib.sha256(pixels).hexdigest()})
print(json.dumps({"oracle": "Pillow", "version": Image.__version__, "results": records}))
