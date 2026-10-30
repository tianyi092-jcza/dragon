"""Bounded KI numeric-display evidence; no DOS execution or runtime admission."""

import hashlib
import json
import re
import sys
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

KI_SHA = 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868'
ROOT = Path(__file__).resolve().parents[1]
WINDOWS = [(0x77B6, 0x77E7), (0x062F, 0x06F5), (0x0CAC, 0x0CC3)]
SIGNATURES = {
    0x77B6: '8a441133d28ae2bb0290',
    0x77C6: '8a441233d28ae2bb0290',
    0x77D6: '8a441333d28ae2bb0290',
    0x0640: '8acb32ed4903f98bea',
    0x0661: 'b90a00f7f1',
    0x0669: '33d24ffecb741823c075ed',
    0x0693: '5d5f5e59071fc3',
    0x069A: '508bf2',
    0x06DC: '58c3',
    0x06EF: '81ef00055ac3',
    0x0CAC: '5052bace03',
    0x0CC0: '5a58c3',
}
CALLS = {0x77C0: 0x062F, 0x77D0: 0x062F, 0x77E0: 0x062F,
         0x065E: 0x0CAC, 0x0666: 0x069A, 0x0680: 0x06DE, 0x0690: 0x069A}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    require(len(sys.argv) == 2 and re.fullmatch(r'[A-Za-z0-9-]{1,64}', sys.argv[1]) is not None,
            'one safe, new round identifier required')
    out = ROOT / '.dragon-analysis' / 'editor-phase' / sys.argv[1]
    require(not out.exists(), 'output already exists')
    data = (ROOT.parent / 'Dragon' / 'KI.EXE').read_bytes()
    require(len(data) == 67099 and hashlib.sha256(data).hexdigest() == KI_SHA, 'fixed KI mismatch')
    require(data[:2] == b'MZ' and int.from_bytes(data[8:10], 'little') * 16 == 512, 'MZ header mismatch')
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    starts, windows, text = set(), [], []
    for begin, end in WINDOWS:
        raw = data[512 + begin:512 + end]
        instructions = list(decoder.disasm(raw, begin))
        require(sum(item.size for item in instructions) == len(raw), 'incomplete decode')
        starts.update(item.address for item in instructions)
        windows.append({'begin': begin, 'endExclusive': end, 'sha256': hashlib.sha256(raw).hexdigest()})
        text.append(f'WINDOW {begin:04X}..{end:04X} exclusive')
        text.extend(f'{item.address:04X} {item.bytes.hex()} {item.mnemonic} {item.op_str}' for item in instructions)
    for address, encoded in SIGNATURES.items():
        raw = bytes.fromhex(encoded)
        require(address in starts and data[512 + address:512 + address + len(raw)] == raw,
                f'signature mismatch {address:04X}')
    for address, target in CALLS.items():
        raw = data[512 + address:512 + address + 3]
        require(address in starts and raw[0] == 0xE8 and
                (address + 3 + int.from_bytes(raw[1:], 'little', signed=True)) & 0xFFFF == target,
                f'near16 call mismatch {address:04X}')
    # Local arithmetic only: AX=u8 input, DX=0, BL=2; each 069A returns
    # AX unchanged, then 0669 clears DX. None of this executes VGA/CPU/IRQ.
    rows = []
    for value in range(256):
        ax, width, digits = value, 2, []
        while width:
            ax, remainder = divmod(ax, 10)
            require(ax <= 0xFFFF, 'word DIV quotient overflow')
            digits.append(remainder)
            width -= 1
            if width and ax == 0:
                digits.extend([None] * width)
                break
        expected = [value % 10, None if value < 10 else (value // 10) % 10]
        require(digits == expected, 'two-column arithmetic mismatch')
        rows.append({'input': value, 'columnsRightToLeft': digits, 'discardedQuotient': ax})
    require(sum(row['discardedQuotient'] != 0 for row in rows) == 156, 'truncation count mismatch')
    receipt = {'schema': 'dragon-ability-display-audit-1', 'kiSha256': KI_SHA,
               'windows': windows, 'signatures': len(SIGNATURES), 'near16Calls': len(CALLS),
               'arithmeticCases': len(rows), 'discardedHighDigits': 156,
               'cpuExecuted': False, 'fontPixelsVerified': False, 'runtimeAdmission': False}
    out.mkdir(parents=True, exist_ok=False)
    (out / 'windows.txt').write_text('\n'.join(text) + '\n', encoding='utf-8')
    (out / 'arithmetic.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (out / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
