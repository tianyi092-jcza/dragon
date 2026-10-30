"""Original MZ mouse shim: bounded static evidence, NOT device execution or Q69."""
import json
import re
import sys
from hashlib import sha256
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

ROOT = Path(__file__).resolve().parent.parent
KI_SHA = 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    require(len(sys.argv) == 2 and re.fullmatch(r'r[1-9][0-9]{0,3}', sys.argv[1]), 'one bounded round required')
    parent = ROOT / '.dragon-analysis/editor-completion'
    require(parent.is_dir() and not parent.is_symlink() and parent.resolve().is_relative_to(ROOT), 'owned parent required')
    output = parent / ('portrait-mouse-' + sys.argv[1])
    require(not output.exists() and not output.is_symlink(), 'new owned round required')
    path = ROOT.parent / 'Dragon/KI.EXE'
    require(path.is_file() and not path.is_symlink(), 'fixed primary required')
    ki = path.read_bytes()
    require(len(ki) == 67099 and sha256(ki).hexdigest() == KI_SHA, 'primary SHA/length')
    def word(offset):
        return int.from_bytes(ki[offset:offset + 2], 'little')
    require(ki[:2] == b'MZ' and word(8) == 0x20 and word(22) == 0, 'MZ header and initial CS')
    count, table_start = word(6), word(24)
    require(table_start + count * 4 <= 0x200, 'relocation table in header')
    relocations = [word(i) + word(i + 2) * 16 for i in range(table_start, table_start + count * 4, 4)]
    code = ki[0x200:]
    far_sites = [0x21EF, 0x21FD, 0x2209, 0x84B2]
    for site in far_sites:
        require(code[site:site + 5] == bytes.fromhex('9a00000010'), 'far1000:0 operand')
        require(site + 3 in relocations, 'DOS relocates segment word')
    # Exclude the 16-word dispatcher DATA and callback state DATA from decoding.
    ranges = [(0x21E7, 0x2216), (0x84A6, 0x84BC), (0x10000, 0x1000E),
              (0x1002E, 0x1009A), (0x100BD, 0x100C0), (0x10101, 0x10137)]
    signatures = {
        0x10000: 'fa568bf0d1e62eff940e005efbcb',
        0x10070: '2e803e0001017421535152b80300cd33',
        0x10096: '5a595bc3', 0x100BD: 'cd33c3',
        0x10101: '9cfa2e803e000101', 0x10119: '83ec088bec',
        0x10131: '83c408fb9dcb', 0x21E7: '5053b80500bb0100',
        0x220E: 'f85b58c3f95b58c3', 0x84A6: '8bf2e83c9d72d1',
        0x84B7: '588bc6f8c3',
    }
    dispatcher = [int.from_bytes(code[n:n + 2], 'little') for n in range(0x1000E, 0x1002E, 2)]
    require(dispatcher == [0x2E, 0x70, 0x9A, 0xBD, 0xBD, 0xBD, 0xBD, 0xBD, 0xBD, 0xC0, 0x6F, 0x6F, 0x6F, 0x6F, 0x6F, 0x2E], '16 dispatcher words')
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    boundaries, windows = set(), {}
    lines = ['KI SHA ' + KI_SHA, 'Loaded-module offset=file-0200, not a single CS beyond FFFF.',
             '1000:000E..002E = 16 words DATA, not instructions; no CPU/device execution.']
    for start, end in ranges:
        block = code[start:end]
        instructions = list(decoder.disasm(block, start))
        require(sum(ins.size for ins in instructions) == len(block), 'complete window')
        windows[f'{start:05X}..{end:05X}'] = sha256(block).hexdigest()
        for ins in instructions:
            boundaries.add(ins.address)
            lines.append(f'{ins.address:05X} {ins.bytes.hex()} {ins.mnemonic} {ins.op_str}')
    for address, hex_bytes in signatures.items():
        raw = bytes.fromhex(hex_bytes)
        require(address in boundaries and code[address:address + len(raw)] == raw, f'signature/boundary {address:X}')
    require(sha256(path.read_bytes()).hexdigest() == KI_SHA, 'primary changed')
    report = {'result': 'PASS-BOUNDED-MZ-MOUSE-SHIM-NOT-Q69', 'inputSHA': KI_SHA,
              'toolSHA': sha256(Path(__file__).read_bytes()).hexdigest(), 'windows': windows,
              'relocatedFarSites': [f'{n:04X}' for n in far_sites], 'dispatcherWords': dispatcher,
              'facts': ['The far operands target loaded module segment 1000, offset zero, via MZ relocations.',
                        'Shim 1000:0000 saves SI before dispatch and restores SI after balanced local return.',
                        'AX=3 and AX=5 dispatch to 1000:00BD INT33/RET; no local BP save.',
                        '84B2 AX=1 dispatches to 0070, with optional INT33 AX=3 and BX/CX/DX saves.',
                        'Registered callback 0101 may set BP=SP; it has no local entry BP save.'],
              'unknown': ['Actual INT33 driver/ABI, asynchronous callback register restoration, SS/BP/table preservation.',
                          'All G127 writers, other portrait callers, cache pixels and FF dependency policy.'],
              'admission': {'runtimeAllowed': False, 'trialAllowed': False, 'releaseAllowed': False}}
    output.mkdir()
    with (output / 'windows.txt').open('x', encoding='utf-8', newline='\n') as stream:
        stream.write('\n'.join(lines) + '\n')
    with (output / 'receipt.json').open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'result': report['result'], 'output': str(output), 'windows': len(windows)}))


if __name__ == '__main__':
    main()
