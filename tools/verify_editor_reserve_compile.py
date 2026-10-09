"""Fixed Web inputs, compile u16 pools only; no rules, installs or SAVE files."""
import hashlib
import json
import math
import sys
from copy import deepcopy
from pathlib import Path

from content_pipeline import compile_chapter, source_chapter

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23'
FIELDS = {'reserve_cav': 4, 'reserve_arc': 6, 'reserve_inf': 8}
inputs = {}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    body = path.read_bytes()
    inputs[str(path.relative_to(ROOT.parent))] = hashlib.sha256(body).hexdigest()
    return body


def parse(body):
    try:
        return json.loads(body)
    except ValueError as cause:
        raise ValueError('invalid fixed reserve fixture JSON') from cause


require(len(sys.argv) == 1, 'no path or commands accepted')
ki = read(ROOT.parent / 'Dragon/KI.EXE')
require(hashlib.sha256(ki).hexdigest() == 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868', 'KI SHA')
require(ki[:2] == b'MZ' and int.from_bytes(ki[8:10], 'little') * 16 == 512, 'MZ header')
signatures = {0x5F85: '83c604', 0x5F88: 'b90300', 0x5F8E: '8b04', 0x5F90: 'ba0a00', 0x5F93: 'f7e2', 0x5F9B: '4646'}
for address, encoded in signatures.items():
    expected = bytes.fromhex(encoded)
    require(ki[512 + address:512 + address + len(expected)] == expected, 'reserve read signature')
manifest = parse(read(PREFIX / 'manifest.json'))
row = next(row for row in manifest['assets'] if row['path'] == 'data.json')
body = read(PREFIX / 'data.json')
require(len(body) == row['byteLength'] and hashlib.sha256(body).hexdigest() == row['sha256'], 'data digest')
data = parse(body)
require(len(data['scenarios']) == 20, 'chapters')
checks, refusals = 0, 0
cases = []


def positions(template):
    return [{'index': c['idx'], 'x': c['x'], 'y': c['y']} for c in template['cities']]


def exercise(template, idx, changes, unknown=False):
    global checks
    doc = source_chapter(template, f'reserve-{idx}')
    if unknown:
        raw = bytearray.fromhex(doc['compatibility']['nativeFactionSlotRaw'][0])
        raw[0x0B], raw[0x2B], raw[0x30] = 0xA5, 0x5A, 0xEF
        doc['compatibility']['nativeFactionSlotRaw'][0] = raw.hex()
    baseline = compile_chapter(doc, positions(template))
    expected = deepcopy(baseline)
    for slot, field, amount in changes:
        doc['state']['factions'][slot][field] = amount
        faction = expected['factions'][slot]
        raw = bytearray.fromhex(faction['raw'])
        offset, width = (0x20, 3) if field == 'money' else (FIELDS[field], 2)
        raw[offset:offset + width] = amount.to_bytes(width, 'little', signed=field == 'money')
        faction[field], faction['raw'] = amount, raw.hex()
        if field == 'money':
            faction['money_hi'] = raw[0x22]
        native = bytearray.fromhex(expected['nativeFactionSlotRaw'][slot])
        native[offset:offset + width] = raw[offset:offset + width]
        expected['nativeFactionSlotRaw'][slot] = native.hex()
    captured = deepcopy(doc)
    compiled = compile_chapter(doc, positions(template))
    require(compiled == expected, 'full output only selected words/money changed')
    require(doc == captured, 'source/compatibility mutated')
    for slot, encoded in enumerate(compiled['nativeFactionSlotRaw']):
        raw, old = bytes.fromhex(encoded), bytes.fromhex(baseline['nativeFactionSlotRaw'][slot])
        require(raw[:4] + raw[10:32] + raw[35:] == old[:4] + old[10:32] + old[35:], 'other native bytes retained')
        if slot >= len(compiled['factions']):
            require(raw == old, 'unpublished slot unchanged')
    cases.append({'idx': idx, 'changes': changes, 'unknown': unknown,
                  'scenario': {'factions': compiled['factions'], 'nativeFactionSlotRaw': compiled['nativeFactionSlotRaw']}})
    checks += 1


for idx, template in enumerate(data['scenarios']):
    doc = source_chapter(template, f'unchanged-{idx}')
    captured = deepcopy(doc)
    require(compile_chapter(doc, positions(template)) == template, 'unchanged output')
    require(doc == captured, 'unchanged source mutated')
    checks += 1
    for field in FIELDS:
        for slot in [0, len(template['factions']) - 1]:
            exercise(template, idx, [(slot, field, template['factions'][slot][field] + 1)])
for field in FIELDS:
    for amount in [0, 1, 255, 256, 32768, 65500, 65535]:
        exercise(data['scenarios'][0], 0, [(0, field, amount)], unknown=True)
exercise(data['scenarios'][0], 0, [(0, 'reserve_cav', 1), (0, 'reserve_arc', 256),
                                (0, 'reserve_inf', 65500), (0, 'money', -1)], unknown=True)
for field in FIELDS:
    for invalid in [-1, 65536, True, False, 1.5, None, '1', math.nan, math.inf, -0.0]:
        doc = source_chapter(data['scenarios'][0], 'invalid')
        doc['state']['factions'][0][field] = invalid
        captured = deepcopy(doc)
        try:
            compile_chapter(doc, positions(data['scenarios'][0]))
        except ValueError as error:
            require(str(error).startswith(f'record +{FIELDS[field]:02x}:'), 'correct word refusal')
            refusals += 1
        else:
            raise ValueError('invalid u16 accepted')
        # NaN never compares equal: canonical author snapshot must not be used here.
        require(doc['compatibility'] == captured['compatibility'], 'bad input compatibility mutated')
    doc = source_chapter(data['scenarios'][0], 'missing')
    del doc['state']['factions'][0][field]
    try:
        compile_chapter(doc, positions(data['scenarios'][0]))
    except KeyError as error:
        require(error.args == (field,), 'missing word refusal')
        refusals += 1
    else:
        raise ValueError('missing reserve synthesized')
for name in ['tools/verify_editor_reserve_compile.py', 'tools/content_pipeline.py']:
    read(ROOT / name)
for path, digest in inputs.items():
    require(hashlib.sha256((ROOT.parent / path).read_bytes()).hexdigest() == digest, 'input drift')
require(checks == 162 and refusals == 33 and len(cases) == 142, 'coverage counts')
print(json.dumps({'result': 'PASS-RESERVE-COMPILE-FIXED-SOURCE', 'chapters': 20,
                  'checks': checks, 'refusals': refusals, 'signatures': len(signatures), 'inputHashes': inputs,
                  'cases': cases, 'limits': 'Representation u16 only; not 65535 gameplay permission, rule execution/fullApp/JS author adapter/default install'}, ensure_ascii=False))
