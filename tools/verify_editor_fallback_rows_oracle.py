"""Independent fixed full-map/row PNG pixel checks; Pillow is test-only."""
import hashlib
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / '.dragon-analysis/editor-phase/backend-fallback-rows-session-r1'
ROUND = sys.argv[1] if len(sys.argv) == 2 else ''
if not re.fullmatch(r'[1-9][0-9]{0,3}', ROUND):
    raise ValueError('explicit owned round required')
def digest(data):
    return hashlib.sha256(data).hexdigest()
def captured(path):
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(ROOT):
        raise ValueError('oracle escaped repository')
    return resolved.read_bytes()
def image(data):
    with Image.open(io.BytesIO(data)) as value:
        if value.format != 'PNG' or value.width * value.height > 6144 * 4096:
            raise ValueError('oracle PNG budget')
        return value.convert('RGBA')
try:
    world = json.loads(captured(ROOT / 'server/pinned/world-manifest.txt'))
except (ValueError, UnicodeError) as cause:
    raise ValueError('fixed manifest JSON') from cause
if digest(captured(ROOT / 'server/pinned/world-manifest.txt')) != 'bde6dfc8a82da5597ef22786e46681c87f2fe21cd55dd23921b32e346efa95e9':
    raise ValueError('fixed manifest binding')
roles = {row['path']: row for row in world['assets']}
def fixed(name):
    role = roles[name]
    data = captured(ROOT / 'web' / role['url'])
    if len(data) != role['byteLength'] or digest(data) != role['sha256']:
        raise ValueError('fixed asset binding')
    return data
results = []
for season in ['spring', 'summer', 'autumn', 'winter']:
    expected = image(fixed('map_tiles_' + season + '.png'))
    for platform in ['node', 'worker']:
        path = BASE / ('r' + ROUND + '-' + season + '-' + platform + '.png')
        data = captured(path)
        actual = image(data)
        if actual.size != (6144, 4096) or actual.size != expected.size or digest(actual.tobytes()) != digest(expected.tobytes()):
            raise ValueError('full-map pixels differ')
        results.append({'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'byteSha': digest(data), 'width': actual.width, 'height': actual.height, 'pixelSha': digest(actual.tobytes())})
expected = image(fixed('map_tiles_spring.png'))
atlas = image(fixed('map_atlas_spring.png'))
plane = fixed('terrain.bin')
for at in [1000, 97000]:
    tile = (plane[at] + 1) % 256
    x, y = (tile % 16) * 16, (tile // 16) * 16
    expected.paste(atlas.crop((x, y, x + 16, y + 16)), ((at % 384) * 16, (at // 384) * 16))
for platform in ['node', 'worker']:
    path = BASE / ('r' + ROUND + '-variant-' + platform + '.png')
    data = captured(path)
    actual = image(data)
    if actual.size != expected.size or digest(actual.tobytes()) != digest(expected.tobytes()):
        raise ValueError('edited pixels differ')
    results.append({'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'byteSha': digest(data), 'width': actual.width, 'height': actual.height, 'pixelSha': digest(actual.tobytes())})
raw = bytes((y * 41 + x * 17) % 256 for y in range(7) for x in range(36))
for platform in ['node', 'worker']:
    path = BASE / ('r' + ROUND + '-small-' + platform + '.png')
    data = captured(path)
    actual = image(data)
    if actual.size != (9, 7) or actual.tobytes() != raw:
        raise ValueError('small row samples differ')
    results.append({'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'byteSha': digest(data), 'width': actual.width, 'height': actual.height, 'pixelSha': digest(raw)})
print(json.dumps({'result': 'PASS-FIXED-FALLBACK-PILLOW-PIXELS', 'results': results}))
