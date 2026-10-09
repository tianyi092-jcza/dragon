"""Fixed KI + five SINARIO, offline byte decode only. No CLI extraction, padding,
SAVE, game execution, installed resources/profile/IDB/network or file writes.
Run normal or -O; checks are explicit, never optimized-away assert statements.
"""
import copy
import hashlib
import json
import sys
from pathlib import Path

from parse_sinario import parse_scenario

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
SOURCES = {
    '上': '6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73',
    '中': 'cf91e4360fa4e9363b5136ba379d58c8b1c8b5b3ca309eca4071b4f7a805ce59',
    '下': '89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb',
    '后': '3e70ad54e3fc3b9d13a25883098d1ccc53218aafd1a7a461b095c1f1fc9812db',
    '原版': '4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87',
}
SIGNATURES = {0x45D9: '3a6511', 0x45DE: '8a6511', 0x3811: '3a4713', 0x3816: '8a4713',
              0x52E7: '8b975142', 0x5304: '02af5242', 0x9C29: '8a5711', 0x9C2C: '8a7712',
              0x41C2: '028f5342', 0x41C6: '02975142', 0x3EAC: '8a875342', 0x3EC4: '3a875342',
              0x77B6: '8a4411', 0x77C6: '8a4412', 0x77D6: '8a4413'}
FIELDS = ((0x11, 'force'), (0x12, 'lead'), (0x13, 'politics'))
inputs = {}

def sha(value):
    return hashlib.sha256(value).hexdigest()

def require(condition, message):
    if not condition:
        raise ValueError(message)

def read(path):
    value = path.read_bytes()
    inputs[str(path.relative_to(PARENT))] = sha(value)
    return value

require(sys.argv[1:] == [], 'no input/output path arguments permitted')
ki = read(PARENT / 'Dragon/KI.EXE')
require(sha(ki) == 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868', 'KI SHA')
require(int.from_bytes(ki[8:10], 'little') * 16 == 0x200, 'MZ header')
for va, signature in SIGNATURES.items():
    expected = bytes.fromhex(signature)
    require(ki[512 + va:512 + va + len(expected)] == expected, f'KI {va:04X}')
source = read(ROOT / 'tools/parse_sinario.py').decode('utf-8')
for offset, field in FIELDS:
    literal = f'"{field}": g[0x{offset:02X}],'
    require(source.count(literal) == 1, 'bounded decoder fields')


def masked_reference(parsed):
    """Former three-mask projection; not an executed historical decoder."""
    result = copy.deepcopy(parsed)
    for general in result['generals']:
        for _, field in FIELDS:
            general['ability'][field] &= 15
    return result


chapters, records, missing_tail, fixture = 0, 0, [], b''
for name, digest in SOURCES.items():
    raw = read(PARENT / name / 'SINARIO.DAT')
    require(sha(raw) == digest, 'SINARIO SHA')
    require(len(raw) == (88830 if name == '下' else 88832), 'fixed SINARIO size')
    for ordinal in range(4):
        chunk = raw[ordinal * 0x56C0:(ordinal + 1) * 0x56C0]
        require(len(chunk) >= 0x52C0, 'complete general records')
        if len(chunk) != 0x56C0:
            missing_tail.append({'source': name, 'chapter': ordinal, 'missingBytes': 2, 'policy': 'not padded'})
        parsed = parse_scenario(chunk)
        require(len(parsed['generals']) == 128, 'fixed source 128 named records')
        for slot, general in enumerate(parsed['generals']):
            for offset, field in FIELDS:
                original = chunk[0x42C0 + slot * 32 + offset]
                require(general['ability'][field] == original, 'full byte original')
                require(original <= 15, 'fixed source distributions, not a runtime bound')
            records += 1
        require(parsed == masked_reference(parsed), 'actual20samples have no affected high bits')
        chapters += 1
        if not fixture:
            fixture = chunk

require(bool(fixture), 'required fixed synthetic base')
baseline = parse_scenario(fixture)
single_checks = joint_checks = specialty_checks = 0
for slot in [0, 127]:
    for offset, field in FIELDS:
        for value in range(256):
            raw = bytearray(fixture)
            raw[0x42C0 + slot * 32 + offset] = value
            expected = copy.deepcopy(baseline)
            expected['generals'][slot]['ability'][field] = value
            parsed = parse_scenario(bytes(raw))
            require(parsed == expected, 'single byte changed unrelated decoded output')
            expected['generals'][slot]['ability'][field] = value & 15
            require(masked_reference(parsed) == expected, 'former mask projection comparator')
            single_checks += 1
for value in range(256):
    raw = bytearray(fixture)
    expected = copy.deepcopy(baseline)
    for (offset, field), number in zip(FIELDS, [value, 255 - value, (value * 73) & 255], strict=True):
        raw[0x42C0 + offset] = number
        expected['generals'][0]['ability'][field] = number
    require(parse_scenario(bytes(raw)) == expected, 'joint distinct bytes/order')
    joint_checks += 1
for offset, field in [(0x0E, 'siege'), (0x0F, 'field'), (0x10, 'naval')]:
    for value in range(256):
        raw = bytearray(fixture)
        raw[0x42C0 + offset] = value
        expected = copy.deepcopy(baseline)
        expected['generals'][0]['ability'][field] = value >> 4
        require(parse_scenario(bytes(raw)) == expected, 'specialty high nibble unchanged')
        specialty_checks += 1
read(ROOT / 'tools/verify_editor_ability_import.py')
for path, digest in inputs.items():
    require(sha((PARENT / path).read_bytes()) == digest, 'input drift')
print(json.dumps({'result': 'PASS-OFFLINE-FULL-BYTE-ABILITY-NOT-RUNTIME-ADMISSION', 'inputHashes': inputs,
                  'signatures': {f'{va:04X}': value for va, value in SIGNATURES.items()}, 'chapters': chapters,
                  'records': records, 'unchangedOriginalParsedChapters': chapters, 'singleByteChecks': single_checks,
                  'jointByteChecks': joint_checks, 'specialtyNibbleChecks': specialty_checks, 'missingTail': missing_tail,
                  'limits': 'Offline three named-byte decode only; high values are input-preservation fixtures, not legal initialization/all-consumer/CPU/runtime range certification. No installed data, copy, identity, rule or live/save change; other parser omissions retained.'}, indent=2))
