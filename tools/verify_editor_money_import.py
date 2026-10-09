"""Fixed KI/five SINARIO, signed24 offline decode. No CLI extraction/padding,
SAVE, file writes, installed assets/profile/IDB/network or game execution.
Explicit require checks run unchanged under -O. Raw fixtures are NOT runtime admission.
"""
import copy
import hashlib
import json
import sys
from pathlib import Path

from parse_sinario import parse_scenario
ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
SOURCES = {'上':'6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73','中':'cf91e4360fa4e9363b5136ba379d58c8b1c8b5b3ca309eca4071b4f7a805ce59','下':'89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb','后':'3e70ad54e3fc3b9d13a25883098d1ccc53218aafd1a7a461b095c1f1fc9812db','原版':'4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87'}
SIGNATURES = {0x560B:'034420',0x560E:'125422',0x5611:'80fa09',0x563D:'294420',0x5640:'185422',0x5649:'80faf6',0x6851:'8a4422',0x6854:'98',0x6855:'8bd0',0x6857:'8b4420'}
inputs = {}
def sha(b): return hashlib.sha256(b).hexdigest()
def require(c, m):
    if not c:
        raise ValueError(m)
def read(p):
    b = p.read_bytes()
    inputs[str(p.relative_to(PARENT))] = sha(b)
    return b
require(sys.argv[1:] == [], 'no input/output path arguments permitted')
ki = read(PARENT / 'Dragon/KI.EXE')
require(sha(ki) == 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868', 'KI SHA')
require(int.from_bytes(ki[8:10], 'little') * 16 == 512, 'MZ512')
for va, signature in SIGNATURES.items():
    expected = bytes.fromhex(signature)
    require(ki[512+va:512+va+len(expected)] == expected, f'KI {va:04X}')
source = read(ROOT / 'tools/parse_sinario.py').decode('utf-8')
require(source.count('"money": int.from_bytes(f[0x20:0x23], "little", signed=True),') == 1, 'bounded decoder')
chapters = normal_slots = declared_records = 0
missing_tail = []
fixture = b''
def unsigned_projection(parsed):
    """Former unsigned named value projection, never execute old decoder."""
    result = copy.deepcopy(parsed)
    for f in result['factions']:
        f['money'] &= 0xffffff
    return result
for name, digest in SOURCES.items():
    raw = read(PARENT / name / 'SINARIO.DAT')
    require(sha(raw) == digest, 'SINARIO SHA')
    require(len(raw) == (88830 if name == '下' else 88832), 'fixed source size')
    for ordinal in range(4):
        chunk = raw[ordinal*0x56C0:(ordinal+1)*0x56C0]
        if len(chunk) != 0x56C0:
            missing_tail.append({'source':name,'chapter':ordinal,'missingBytes':2,'policy':'not padded'})
        parsed = parse_scenario(chunk)
        for slot in range(22):
            money_bytes = chunk[0x80+slot*64+0x20:0x80+slot*64+0x23]
            unsigned = int.from_bytes(money_bytes, 'little')
            require(unsigned < 0x800000, 'fixed original sample has no signbit, not a legal value bound')
            require(bytes.fromhex(parsed['nativeFactionSlotRaw'][slot])[0x20:0x23] == money_bytes, 'all normal raw slots unchanged')
            normal_slots += 1
        for f in parsed['factions']:
            money_bytes = chunk[0x80+f['idx']*64+0x20:0x80+f['idx']*64+0x23]
            require(f['money'] == int.from_bytes(money_bytes, 'little'), 'original nonnegative named output same')
            require(f['money_hi'] == money_bytes[2], 'raw highbyte retained')
            declared_records += 1
        require(parsed == unsigned_projection(parsed), 'complete current original output projection equal')
        chapters += 1
        if not fixture:
            fixture = chunk
require(bool(fixture), 'fixed base required')
baseline = parse_scenario(fixture)
slots = [0, len(baseline['factions'])-1]
def check(raw):
    expected = copy.deepcopy(baseline)
    for slot, f in enumerate(expected['factions']):
        record = bytes(raw[0x80+slot*64:0x80+(slot+1)*64])
        unsigned = int.from_bytes(record[0x20:0x23], 'little')
        f['money'] = unsigned - 0x1000000 if unsigned & 0x800000 else unsigned
        f['money_hi'] = record[0x22]
        f['raw'] = record.hex()
    expected['nativeFactionSlotRaw'] = [bytes(raw[0x80+s*64:0x80+(s+1)*64]).hex() for s in range(22)]
    parsed = parse_scenario(bytes(raw))
    require(parsed == expected, 'money decode changed unrelated full output')
    projected = unsigned_projection(parsed)
    for f in parsed['factions']:
        require(f['money'].to_bytes(3, 'little', signed=True) == bytes.fromhex(f['raw'])[0x20:0x23], 'signed raw roundtrip/no clamping')
        require(projected['factions'][f['idx']]['money'] == int.from_bytes(bytes.fromhex(f['raw'])[0x20:0x23],'little'), 'former unsigned projection only')
    return parsed
single_checks = boundary_checks = joint_checks = 0
for slot in slots:
    for offset in range(0x20,0x23):
        for value in range(256):
            raw = bytearray(fixture)
            raw[0x80+slot*64+offset] = value
            check(raw)
            single_checks += 1
values = [-0x800000,-0x7fffff,-655001,-655000,-65535,-32768,-1,0,1,32767,65535,655000,655001,0x7ffffe,0x7fffff]
for slot in slots:
    for value in values:
        raw = bytearray(fixture)
        raw[0x80+slot*64+0x20:0x80+slot*64+0x23] = (value & 0xffffff).to_bytes(3,'little')
        require(check(raw)['factions'][slot]['money'] == value, 'signed boundary')
        boundary_checks += 1
for value in range(256):
    raw = bytearray(fixture)
    for slot in range(22):
        raw[0x80+slot*64+0x20:0x80+slot*64+0x23] = bytes(((value+slot*37)&255,(255-value+slot*13)&255,(value+slot*29)&255))
    check(raw)
    joint_checks += 1
read(ROOT / 'tools/verify_editor_money_import.py')
for path, digest in inputs.items():
    require(sha((PARENT/path).read_bytes()) == digest, 'input drift')
print(json.dumps({'result':'PASS-OFFLINE-SIGNED24-MONEY-NOT-RUNTIME-ADMISSION','inputHashes':inputs,'signatures':{f'{va:04X}':s for va,s in SIGNATURES.items()},'chapters':chapters,'normalRawSlots':normal_slots,'declaredRecords':declared_records,'unchangedOriginalParsedChapters':chapters,'singleByteChecks':single_checks,'signedBoundaryChecks':boundary_checks,'jointSlotChecks':joint_checks,'missingTail':missing_tail,'limits':'Only named money signed decode; money_hi/raw unchanged. Negative/outside655000 raw fixtures not runtime/initializer/compiler/domain authorization; no clamp/formula/default/copy/save changes. 16-bit98isCBW, disassembler mnemonic text not oracle.'},indent=2))
