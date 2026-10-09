"""Memory-only Web compiler signed24 / fixed-source coherence, no DOS or CLI writes."""
import hashlib
import json
import math
import sys
from copy import deepcopy
from pathlib import Path

from content_pipeline import compile_chapter, source_chapter

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23'
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
        raise ValueError('invalid fixed money compile fixture JSON') from cause


require(len(sys.argv) == 1, 'no paths or commands accepted')
manifest = parse(read(PREFIX / 'manifest.json'))
row = next(row for row in manifest['assets'] if row['path'] == 'data.json')
body = read(PREFIX / 'data.json')
require(len(body) == row['byteLength'] and hashlib.sha256(body).hexdigest() == row['sha256'], 'fixed data digest')
data = parse(body)
require(len(data['scenarios']) == 20, 'chapter count')
checks = 0
refusals = 0
cases = []


def positions(template):
    return [{'index': c['idx'], 'x': c['x'], 'y': c['y']} for c in template['cities']]


def exercise(template, idx, changes, unknown=False):
    global checks
    document = source_chapter(template, f'money-compile-{idx}')
    if unknown:
        raw = bytearray.fromhex(document['compatibility']['nativeFactionSlotRaw'][0])
        raw[0x0B], raw[0x2B], raw[0x30] = 0xA5, 0x5A, 0xEF
        document['compatibility']['nativeFactionSlotRaw'][0] = raw.hex()
    original = deepcopy(document)
    baseline = compile_chapter(document, positions(template))
    expected = deepcopy(baseline)
    for slot, amount in changes:
        document['state']['factions'][slot]['money'] = amount
        faction = expected['factions'][slot]
        raw = bytearray.fromhex(faction['raw'])
        raw[0x20:0x23] = amount.to_bytes(3, 'little', signed=True)
        faction['raw'], faction['money'], faction['money_hi'] = raw.hex(), amount, raw[0x22]
        native = bytearray.fromhex(expected['nativeFactionSlotRaw'][slot])
        native[0x20:0x23] = raw[0x20:0x23]
        expected['nativeFactionSlotRaw'][slot] = native.hex()
    captured = deepcopy(document)
    compiled = compile_chapter(document, positions(template))
    require(compiled == expected, 'only named money / exact raw3 changed')
    require(document == captured and document['compatibility'] == original['compatibility'], 'author document unchanged')
    for slot in range(22):
        raw = bytes.fromhex(compiled['nativeFactionSlotRaw'][slot])
        old = bytes.fromhex(baseline['nativeFactionSlotRaw'][slot])
        require(raw[:0x20] + raw[0x23:] == old[:0x20] + old[0x23:], 'all other native bytes retained')
        if slot >= len(compiled['factions']):
            require(raw == old, 'unpublished native slot retained')
    cases.append({'idx': idx, 'changes': changes, 'unknown': unknown,
                  'scenario': {'factions': compiled['factions'], 'nativeFactionSlotRaw': compiled['nativeFactionSlotRaw']}})
    checks += 1


for idx, template in enumerate(data['scenarios']):
    document = source_chapter(template, f'unchanged-{idx}')
    captured = deepcopy(document)
    require(compile_chapter(document, positions(template)) == template, '20 unchanged outputs identical')
    require(document == captured, 'unchanged document not mutated')
    checks += 1
    exercise(template, idx, [(0, template['factions'][0]['money'] + 1)])
    exercise(template, idx, [(0, -1), (len(template['factions']) - 1, -655001)])
for amount in [-8388608, -655001, -655000, -1, 0, 1, 655000, 655001, 0x123456, 8388607]:
    exercise(data['scenarios'][0], 0, [(0, amount)], unknown=True)

for invalid in [-8388609, 8388608, 16777215, True, False, 1.5, None, '1', math.nan, math.inf, -math.inf, -0.0]:
    document = source_chapter(data['scenarios'][0], 'bad-money')
    document['state']['factions'][0]['money'] = invalid
    try:
        compile_chapter(document, positions(data['scenarios'][0]))
    except ValueError as error:
        require('faction money' in str(error), 'correct money error')
        refusals += 1
    else:
        raise ValueError('invalid signed24 accepted')

document = source_chapter(data['scenarios'][0], 'bad-count')
while len(document['state']['factions']) < 23:
    faction = deepcopy(document['state']['factions'][0])
    faction['idx'] = len(document['state']['factions'])
    document['state']['factions'].append(faction)
    document['compatibility']['factions'].append(document['compatibility']['factions'][0])
try:
    compile_chapter(document, positions(data['scenarios'][0]))
except ValueError as error:
    require(str(error) == 'factions: current engine limit is ' + str(22), 'fixed22 guard')
    refusals += 1
else:
    raise ValueError('23rd declared native slot accepted')
for name in ['tools/verify_editor_money_compile.py', 'tools/content_pipeline.py']:
    read(ROOT / name)
for path, digest in inputs.items():
    require(hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, 'input drift')
print(json.dumps({'result': 'PASS-MONEY-COMPILE-SIGNED24-FIXED-SOURCE', 'chapters': 20,
                  'checks': checks, 'refusals': refusals, 'inputHashes': inputs, 'cases': cases,
                  'limits': 'No rule steps/fullApp/abnormal-money UI domain/negative extraction/default install; only Web compile and native initialization byte coherence'}, ensure_ascii=False))
