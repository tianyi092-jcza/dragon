"""Fixed non-save date evidence -> owned date-only source overlay, never install.
No read_scenarios (its legacy missing-tail padding), parser.main, SAVE/profile/network.
"""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

from content_pipeline import compile_chapter, source_chapter
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
SIGS = {0x1D9C: 'a1f00c', 0x1D9F: '3ac4', 0x1DD7: 'fe06f00c',
        0x1DAA: '813ef60ce803', 0x1DB2: 'c706f60ce603', 0x1DB8: 'ff06f60c', 0x8C62: '8b4406'}
def sha(b):
    return hashlib.sha256(b).hexdigest()

def require(condition):
    if not condition:
        raise ValueError('date import evidence/context check failed')

require(len(sys.argv) == 2 and re.fullmatch('[A-Za-z0-9-]{1,64}', sys.argv[1]))
output = ROOT / '.dragon-analysis/editor-phase' / sys.argv[1]
require(not output.exists())
inputs = {}
def read(path):
    b = path.read_bytes()
    inputs[str(path.relative_to(PARENT))] = sha(b)
    return b
ki = read(PARENT / 'Dragon/KI.EXE')
require(sha(ki) == 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868')
for va, h in SIGS.items():
    expected = bytes.fromhex(h)
    require(ki[0x200 + va:0x200 + va + len(expected)] == expected)
try:
    baseline = json.loads(read(ROOT / 'web/data.json'))
except (OSError, ValueError) as cause:
    raise ValueError('invalid fixed Web baseline') from cause
require(len(baseline['scenarios']) == 20)
corrected = copy.deepcopy(baseline)
differences, missing_tail, synthetic_checks = [], [], 0
for group, (name, expected_hash) in enumerate(SOURCES.items()):
    raw = read(PARENT / name / 'SINARIO.DAT')
    require(sha(raw) == expected_hash)
    for ordinal in range(4):
        idx = group * 4 + ordinal
        chunk = raw[ordinal * 0x56C0:(ordinal + 1) * 0x56C0]
        require(len(chunk) >= 0x52C0)  # all date/general/city/faction records present
        if len(chunk) != 0x56C0:
            require(name == '下' and ordinal == 3 and len(chunk) == 0x56BE)
            missing_tail.append({'idx': idx, 'bytes': 2, 'policy': 'not padded; unchanged existing Web event tail not certified from original'})
        parsed = parse_scenario(chunk)
        expected = {'day': chunk[0], 'month': chunk[4], 'year': int.from_bytes(chunk[6:8], 'little')}
        require(parsed['start'] == expected)
        old = baseline['scenarios'][idx]['start']
        for field in ['day', 'month', 'year']:
            if old[field] != expected[field]:
                differences.append({'idx': idx, 'field': field, 'old': old[field], 'original': expected[field]})
        corrected['scenarios'][idx]['start'] = expected
        # This is a date-only overlay of existing Web content, not a false whole
        # fresh extraction certificate or reconstruction of absent source tail.
        probe = bytearray(chunk)
        for year in [0, 255, 256, 999, 1000, 65535]:
            probe[0], probe[3], probe[4], probe[6:8] = 9, 3, 2, year.to_bytes(2, 'little')
            require(parse_scenario(bytes(probe))['start'] == {'day': 9, 'month': 2, 'year': year})
            synthetic_checks += 1
require(differences == [{'idx': 14, 'field': 'year', 'old': 8, 'original': 264}, {'idx': 15, 'field': 'year', 'old': 10, 'original': 266}])
unchanged = copy.deepcopy(corrected)
for idx in range(20):
    unchanged['scenarios'][idx]['start'] = baseline['scenarios'][idx]['start']
require(unchanged == baseline)
cities = [{'id': f"city-{c['idx']:03d}", 'index': c['idx'], 'x': c['x'], 'y': c['y']} for c in corrected['scenarios'][0]['cities']]
documents = []
for idx, template in enumerate(corrected['scenarios']):
    document = source_chapter(template, f'date-import-{idx}')
    require(compile_chapter(document, cities) == template)
    documents.append(document)
for p in ['tools/parse_sinario.py', 'tools/verify_editor_date_import.py', 'tools/content_pipeline.py']:
    read(ROOT / p)
for p, h in inputs.items():
    require(sha((PARENT / p).read_bytes()) == h)
output.mkdir()
def write(name, data):
    with (output / name).open('x', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
write('date-corrected-data.json', corrected)
write('date-corrected-chapters.json', documents)
receipt = {'result': 'PASS-DATE-ONLY-OVERLAY-NOT-INSTALLED', 'inputHashes': inputs, 'signatures': {hex(va): h for va, h in SIGS.items()},
           'chapters': 20, 'differences': differences, 'syntheticHeaderChecks': synthetic_checks, 'sourceChapterRoundTrips': 20,
           'missingSourceTail': missing_tail, 'outputHashes': {p: sha((output / p).read_bytes()) for p in ['date-corrected-data.json', 'date-corrected-chapters.json']},
           'limits': 'Only offline date decode fixed; no installed game/copy/live scenario/save migration. Existing Web fields preserved, source tail not padded/certified; not whole parser/empty init/mechanism expansion.'}
write('receipt.json', receipt)
print(json.dumps({'result': receipt['result'], 'chapters': 20, 'differences': differences, 'syntheticHeaderChecks': synthetic_checks}))
