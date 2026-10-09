"""Web encoding consistency guard; no initialization/rule/domain permission."""
import hashlib
import json
import sys
from copy import deepcopy
from pathlib import Path

from content_pipeline import compile_chapter, source_chapter

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23'
FIELDS = {
    'attr': 0, 'monarch_idx': 1, 'advisor_idx': 2, 'capital': 3,
    'strategic_city_primary': 0x16, 'strategic_city_secondary': 0x17,
    'n_generals': 0x18, 'target_faction': 0x19, 'legion_morale_cap': 0x1D,
    'talk_style': 0x1E, 'n_cities': 0x23, 'bellicosity': 0x28,
    'diplomat_idx': 0x2A, 'march_marker_style': 0x3E,
}
inputs = {}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    body = path.read_bytes()
    inputs[str(path.relative_to(ROOT))] = hashlib.sha256(body).hexdigest()
    return body


def parse(body):
    try:
        return json.loads(body)
    except ValueError as cause:
        raise ValueError('invalid fixed faction consistency JSON') from cause


def positions(template):
    return [{'index': c['idx'], 'x': c['x'], 'y': c['y']} for c in template['cities']]


def refused(document, template, slot, offset):
    captured = deepcopy(document)
    try:
        compile_chapter(document, positions(template))
    except ValueError as error:
        expected = (f'faction {slot}: encoded/native divergence at +{offset:02x}; '
                    'initialization edit unsupported')
        require(str(error) == expected, 'exact unsupported encoding diagnostic')
    else:
        raise ValueError('divergent native field accepted')
    require(document == captured, 'rejection mutated document/compatibility')


require(len(sys.argv) == 1, 'no paths or commands accepted')
manifest = parse(read(PREFIX / 'manifest.json'))
row = next(a for a in manifest['assets'] if a['path'] == 'data.json')
body = read(PREFIX / 'data.json')
require(len(body) == row['byteLength'] and hashlib.sha256(body).hexdigest() == row['sha256'], 'data digest')
data = parse(body)
require(len(data['scenarios']) == 20, 'twenty chapters')
checks, refusals = 0, 0
for idx, template in enumerate(data['scenarios']):
    doc = source_chapter(template, f'guard-{idx}')
    captured = deepcopy(doc)
    require(compile_chapter(doc, positions(template)) == template, 'unchanged full output')
    require(doc == captured, 'baseline source mutated')
    checks += 1
    for slot in [0, len(template['factions']) - 1]:
        for field, offset in FIELDS.items():
            named = deepcopy(doc)
            current = named['state']['factions'][slot][field]
            named['state']['factions'][slot][field] = 1 if current is None or current == 0 else 0
            refused(named, template, slot, offset)
            refusals += 1
            native = deepcopy(doc)
            raw = bytearray.fromhex(native['compatibility']['nativeFactionSlotRaw'][slot])
            raw[offset] ^= 1
            native['compatibility']['nativeFactionSlotRaw'][slot] = raw.hex()
            refused(native, template, slot, offset)
            refusals += 1
    # Independent unknown compatibility bytes must not force full-record equality.
    native = bytearray.fromhex(doc['compatibility']['nativeFactionSlotRaw'][0])
    public = bytearray.fromhex(doc['compatibility']['factions'][0])
    native[0x0B], native[0x2B], native[0x30] = 0xA5, 0x5A, 0xEF
    public[0x0B], public[0x2B], public[0x30] = 0x11, 0x22, 0x33
    doc['compatibility']['nativeFactionSlotRaw'][0] = native.hex()
    doc['compatibility']['factions'][0] = public.hex()
    captured = deepcopy(doc)
    compiled = compile_chapter(doc, positions(template))
    expected = deepcopy(template)
    expected['nativeFactionSlotRaw'][0] = native.hex()
    expected['factions'][0]['raw'] = public.hex()
    require(compiled == expected, 'unknown bytes overwritten or rejected')
    require(doc == captured, 'unknown compatibility mutated')
    checks += 1
    # The four already-supported resources remain independent of this guard.
    doc['state']['factions'][0].update(money=-1, reserve_cav=1, reserve_arc=256, reserve_inf=65500)
    captured = deepcopy(doc)
    compiled = compile_chapter(doc, positions(template))
    expected['factions'][0].update(money=-1, money_hi=255, reserve_cav=1, reserve_arc=256, reserve_inf=65500)
    for raw in [native, public]:
        raw[4:10] = bytes.fromhex('01000001dcff')
        raw[0x20:0x23] = b'\xff\xff\xff'
    expected['nativeFactionSlotRaw'][0] = native.hex()
    expected['factions'][0]['raw'] = public.hex()
    require(compiled == expected, 'supported resources/other byte parity')
    require(doc == captured, 'supported source mutated')
    checks += 1
for name in ['tools/verify_editor_faction_consistency.py', 'tools/content_pipeline.py']:
    read(ROOT / name)
for path, digest in inputs.items():
    require(hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, 'input drift')
require(checks == 60 and refusals == 1120, 'exact coverage counts')
print(json.dumps({'result': 'PASS-FACTION-ENCODING-CONSISTENCY-GUARD', 'chapters': 20,
                  'checks': checks, 'refusals': refusals, 'encodedFields': FIELDS,
                  'inputHashes': inputs, 'limits': 'Fourteen existing encoded byte fields only; consistency is NOT initialization/role/domain permission. Unencoded faction fields, JS author, full App/backend/default install remain open'}, ensure_ascii=False))
