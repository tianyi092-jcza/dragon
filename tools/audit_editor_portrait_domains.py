"""Primary army portrait domains; bounded instruction evidence, not runtime closure."""
import json
import re
import sys
from hashlib import sha256
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

ROOT = Path(__file__).resolve().parent.parent
KI_SHA = 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868'
WINDOWS = [(0x1E49, 0x1F0E), (0x62D2, 0x62FB), (0x6C5E, 0x6D56),
           (0x6DFD, 0x6E2F), (0x716D, 0x724D), (0x7663, 0x76DC),
           (0x7F90, 0x7FDB), (0x807B, 0x812A), (0x87FF, 0x8810),
           (0x3C99, 0x3D09)]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return sha256(data).hexdigest()


def main():
    require(len(sys.argv) == 2 and re.fullmatch(r'r[1-9][0-9]{0,3}', sys.argv[1]), 'one bounded round required')
    parent = ROOT / '.dragon-analysis/editor-phase/portrait-domains-session-r1'
    require(parent.is_dir() and parent.resolve(strict=True).is_relative_to(ROOT) and not parent.is_symlink(), 'owned parent required')
    output = parent / sys.argv[1]
    require(not output.exists() and not output.is_symlink(), 'new owned round required')
    path = ROOT.parent / 'Dragon/KI.EXE'
    require(path.is_file() and not path.is_symlink(), 'fixed primary required')
    ki = path.read_bytes()
    require(len(ki) == 67099 and digest(ki) == KI_SHA, 'primary SHA/length')
    code = ki[0x200:0x10200]
    signatures = {
        0x1EED: '81eb40228bf3', 0x1EF6: 'e89760',
        0x62DB: 'e88f0e', 0x62E0: '8bf381ee4022', 0x62E9: 'e8a41c',
        0x6C77: 'e81800', 0x6CB5: '8bf381ee4042d1e681c64022',
        0x6CD2: 'e82801', 0x6D2A: '8bde81eb4022d1eb',
        0x6D35: '8aa75e428a874142', 0x6D3D: 'e8d01a',
        0x6E1C: '8bc62d4022d1e88bf0', 0x6E25: '8a844142',
        0x7186: 'b8a871bb4d72', 0x7197: 'e87410',
        0x71AB: 'be402233ff32e4', 0x71B6: '803c80720b3a44017506',
        0x71C0: '8933fec44747', 0x71C6: '83c64081fec04175e7',
        0x71F5: 'b81772bb4d72', 0x7206: 'e80510',
        0x721A: 'be402233ff32e4', 0x7225: '803c807216',
        0x722A: 'ba34123b5410750e', 0x7232: 'ba34123b54127506',
        0x723A: '8933fec44747', 0x7240: '83c64081fec04175dc',
        0x767C: 'b8a076bbdc76', 0x768F: 'e87c0b',
        0x76A3: 'e85911be404203de8bd333ff',
        0x76B5: '803c8072153a441c7510807c1700750a3bd67406',
        0x76C9: '8933fec44747', 0x76CF: '83c62081fe405275dd',
        0x7F96: '2e8e1e520d81c64022e8d900',
        0x807E: '8bfe', 0x8099: '8a640232c0d1e8d1e8d1e88bf0',
        0x80A6: '8a844142', 0x80AD: 'e82287',
        0x87FF: '2e8b1efd0c8a7f0132dbd1ebd1ebd1ebc3',
        0x3CE1: '2e8b1efd0c8a7f0232dbd1ebd1ebd1eb',
    }
    for cs, expected in signatures.items():
        raw = bytes.fromhex(expected)
        require(code[cs:cs + len(raw)] == raw, f'signature {cs:04X}')
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    lines = ['KI SHA256 ' + KI_SHA, 'CS=file-0200; near16 targets wrap',
             'No CPU/DOS/device/selection-driver execution or complete caller graph.']
    windows, decoded, calls = {}, {}, {}
    for start, end in WINDOWS:
        block = code[start:end]
        windows[f'{start:04X}..{end:04X}'] = digest(block)
        lines.append(f'WINDOW {start:04X}..{end:04X}')
        instructions = list(decoder.disasm(block, start))
        require(sum(ins.size for ins in instructions) == len(block), f'complete window decode {start:04X}..{end:04X}')
        for ins in instructions:
            decoded[ins.address] = ins.bytes.hex()
            operand = ins.op_str
            if ins.bytes[0] in (0xE8, 0xE9) and ins.size == 3:
                target = (ins.address + 3 + int.from_bytes(ins.bytes[1:], 'little', signed=True)) & 0xFFFF
                operand = f'{target:04X} (near16)'
                if ins.bytes[0] == 0xE8:
                    calls[f'{ins.address:04X}'] = f'{target:04X}'
            lines.append(f'{ins.address:04X} {ins.bytes.hex()} {ins.mnemonic} {operand}')
    for cs in signatures:
        require(cs in decoded, f'signature instruction boundary {cs:04X}')
    for cs, target in [(0x1EF6, 0x7F90), (0x62DB, 0x716D), (0x62E9, 0x7F90),
                       (0x6C77, 0x6C92), (0x6CD2, 0x6DFD), (0x6D3D, 0x8810),
                       (0x7197, 0x820E), (0x7206, 0x820E), (0x768F, 0x820E),
                       (0x76A3, 0x87FF), (0x7F9F, 0x807B), (0x80AD, 0x07D2)]:
        require(calls.get(f'{cs:04X}') == f'{target:04X}', 'decoded caller')
    candidates = {}
    for target in (0x3C99, 0x3CC0, 0x3CDC, 0x6DFD, 0x807B, 0x7F90):
        candidates[f'{target:04X}'] = [f'{n:04X}' for n in range(len(code) - 2)
                                     if code[n] == 0xE8 and (n + 3 + int.from_bytes(code[n + 1:n + 3], 'little', signed=True)) & 0xFFFF == target]
    require(candidates['6DFD'] == ['6CD2'] and candidates['807B'] == ['7F9F'] and candidates['7F90'] == ['1EF6', '62E9'], 'literal inventory changed')
    # Arithmetic witnesses to the signed instruction operands above, NOT a CPU.
    army_slots = [(pointer - 0x2240) // 0x40 for pointer in range(0x2240, 0x41C0, 0x40)]
    general_slots = [(pointer - 0x4240) // 0x20 for pointer in range(0x4240, 0x5240, 0x20)]
    require(army_slots == list(range(126)), 'army list loop arithmetic')
    require(general_slots == list(range(128)), 'general list loop arithmetic')
    def eligible(attr, faction, assigned, slot, ruler):
        return attr >= 0x80 and faction == 2 and assigned == 0 and slot != ruler
    witnesses = {
        'sourceInactive127': eligible(0, 2, 0, 127, 0),
        'conditionalActive127': eligible(0x80, 2, 0, 127, 0),
        'ruler127Excluded': eligible(0x80, 2, 0, 127, 127),
        'wrongFaction127': eligible(0x80, 3, 0, 127, 0),
        'assigned127': eligible(0x80, 2, 1, 127, 0),
    }
    require(witnesses == {'sourceInactive127': False, 'conditionalActive127': True,
                          'ruler127Excluded': False, 'wrongFaction127': False, 'assigned127': False}, 'predicate arithmetic')
    distinction = []
    for slot in range(128):
        for commander in (0, 126, 127, 255):
            army_pointer = 0x2240 + slot * 0x40
            own_general = 0x4240 + ((army_pointer - 0x2240) >> 1)
            commander_general = 0x4240 + ((commander << 8) >> 3)
            require(own_general == 0x4240 + slot * 0x20, 'slot formula')
            require(commander_general == 0x4240 + commander * 0x20, 'commander formula')
            if slot == 1:
                distinction.append({'slot': slot, 'commander': commander, '6DFDGeneral': f'{own_general:04X}', '807BGeneral': f'{commander_general:04X}'})
    require(digest(path.read_bytes()) == KI_SHA, 'primary changed')
    report = {
        'result': 'PASS-BOUNDED-ARMY-PORTRAIT-DOMAINS-NOT-Q69',
        'inputHashes': {'KI.EXE': KI_SHA}, 'toolHash': digest(Path(__file__).read_bytes()),
        'windows': windows, 'decodedNearCalls': calls, 'literalCandidates': candidates,
        'signatures': len(signatures), 'arithmeticCases': 512,
        'armyListSlots': army_slots, 'generalListSlots': general_slots,
        'conditionalPredicateWitnesses': witnesses, 'differentSlotCommanderWitnesses': distinction,
        'confirmedLocalDomains': {
            '80AD': 'incoming army record +2 commander -> G01; not faction +2 advisor. Actual callers subtract2240 and7F9B adds2240. Values after external helper returns are not a proved full device ABI.',
            '6E2C': '6C92 converts chosen general BX to same army slot SI;6DFD inversely projects same-slot G01.6D35/6D39 also use same-slot personality/portrait for8810.',
            '71A8/7217': 'two legion candidate builders iterate2240..<41C0 step40: slots0..125 only. This is not all military scans or proof full820E selection return is constrained.',
            '76A0': 'general candidate builder iterates4240..<5240 step20: slots0..127. Gates attr>=80, allegiance=CFF, G17zero and not ruler F01 from87FF; NOT advisor F02 exclusion.',
            '3CFD': 'remains player faction CFD+2 advisor G01; separate from807B army+2.',
        },
        'withdrawn': 'prior 80AD incoming-faction/advisor annotation in old caller report and journal. Old byte windows/signatures remain valid; historical receipts not relabelled.',
        'limits': 'No CPU, DOS, KAO/pixel/cache execution, saved-state input, full820E selection/event/device return, general127 complete initialization/writer lifecycle, or all3C99/3CC0/3CDC upstream SI domains. Conditional128-slot predicate witness is not original runtime reachability. Byte255 mathematical address is not a valid general or portrait; no FF sentinel/fill/library grant/runtime admission/Trial/release.',
    }
    output.mkdir()
    with (output / 'windows.txt').open('x', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines) + '\n')
    with (output / 'receipt.json').open('x', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('result', 'signatures', 'arithmeticCases', 'conditionalPredicateWitnesses')}))


if __name__ == '__main__':
    main()
