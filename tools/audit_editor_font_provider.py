"""Pinned STR/font loader and shell instructions, not DOS execution or admission."""
import json
import re
import sys
from hashlib import sha256
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

ROOT = Path(__file__).resolve().parent.parent
INPUTS = {
    'END_S10.DAT': (40806, '19d565b225482cc255decd78cbbbbabf03df5a38d05e14dd7eb566ebdaae4643'),
    'END_S11.DAT': (10637, 'c0f68f59d4449fce077984a14e5c4b0396df51b50b1a8dd89bb8929ece9dd401'),
    'PLAY.BAT': (25, 'fc48ce984d193ecc1c8579e73bcfb7b129cf2eb636e0fe682cae39347e622e7e'),
    'STR.EXE': (916, '6d7d709c173ae530faa86f2474f2b312c76597fb15623e82a3c93072fa6379fb'),
    'YNVSHELL.COM': (979, '629d5c71c96b2502cd9d256b2fabd74e7275b7014f0a0743cd0dd07a8204a6b8'),
    'KI.EXE': (67099, 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868'),
}


def require(value, message):
    if not value:
        raise ValueError(message)


def cjk_offset(cx):
    """STR 006F..00BF arithmetic, conditional on given post-open CX."""
    ch, cl = cx >> 8, cx & 255
    if ch >= 0xfa:
        index = 0x56
    else:
        if ch < 0xa4:
            index = ((ch - 0xa1) & 255) * 0x9d
        elif ch < 0xc9:
            index = (ch - 0xa4) * 0x9d + 0x198
        else:
            index = (ch - 0xc9) * 0x9d + 0x16b1
        if cl > 0x7e:
            cl = (cl - 0x22) & 255
        index = (index + ((cl - 0x40) & 255)) & 65535
    return index * 30


def read_ranges(length, width, offsets):
    counts = {'complete': 0, 'partial': 0, 'pastEnd': 0}
    first = {}
    for value, offset in enumerate(offsets):
        available = min(width, max(0, length - offset))
        kind = 'complete' if available == width else 'partial' if available else 'pastEnd'
        counts[kind] += 1
        if kind not in first:
            first[kind] = {'registerValue': value, 'offset': offset, 'availableBytes': available}
    require(sum(counts.values()) == 65536, 'complete arithmetic register domain')
    return {'requestedBytes': width, 'fileBytes': length, 'cases': 65536, 'counts': counts,
            'firstExamples': first, 'minOffset': min(offsets), 'maxOffset': max(offsets)}


def main():
    require(len(sys.argv) == 2 and re.fullmatch(r'r[1-9][0-9]{0,3}', sys.argv[1]), 'one bounded round required')
    parent = ROOT / '.dragon-analysis/editor-completion'
    require(parent.is_dir() and not parent.is_symlink() and parent.resolve().is_relative_to(ROOT), 'owned parent required')
    output = parent / ('font-provider-' + sys.argv[1])
    require(not output.exists() and not output.is_symlink(), 'new owned output required')
    originals = {}
    for name, (length, digest) in INPUTS.items():
        path = ROOT.parent / 'Dragon' / name
        require(path.is_file() and not path.is_symlink(), 'fixed input required')
        raw = path.read_bytes()
        require(len(raw) == length and sha256(raw).hexdigest() == digest, 'fixed input SHA/length')
        originals[name] = raw
    raw = originals['STR.EXE']
    require(raw[:2] == b'MZ' and int.from_bytes(raw[8:10], 'little') * 16 == 512 and raw[20:24] == bytes.fromhex('1e010000'), 'STR MZ entry')
    relocation_start = int.from_bytes(raw[24:26], 'little')
    relocations = [tuple(int.from_bytes(raw[relocation_start + i * 4 + j:relocation_start + i * 4 + j + 2], 'little') for j in [0, 2]) for i in range(int.from_bytes(raw[6:8], 'little'))]
    require(relocations == [(0x11f, 0), (0x161, 0)], 'STR relocated installation and resident-end segments')
    code = {'STR.EXE': raw[512:], 'YNVSHELL.COM': bytes(256) + originals['YNVSHELL.COM']}
    ranges = {'STR.EXE': [(0x2c, 0x5d), (0x5d, 0xdf), (0xdf, 0x11e), (0x11e, 0x194)],
              'YNVSHELL.COM': [(0x100, 0x135), (0x1ac, 0x1f1), (0x223, 0x25b)]}
    signatures = {'STR.EXE': {
        0x2c: '80fc5075279c2eff1e0400fb', 0x38: '3c00751bf9b40180ff017713',
        0x44: '8cc88ec00aff7505bbdf00eb03bb5d002ae4f8cf', 0x58: '2eff2e0400',
        0x5d: '1e5253518cc88ed8ba1400b8003dcd21',
        0xc1: '8cc08ed88bd6b91e00b43fcd2126c7441e0000b43ecd212bc0595b5a1fcb',
        0xdf: '1e5253518cc88ed8ba2000b8003dcd21', 0xf1: '8ac1ba0f00f7e2',
        0x101: '8cc08ed88bd6b90f00b43fcd2126c6440f00b43ecd212bc0595b5a1fcb',
        0x11e: 'b800008ed8fab81535cd21', 0x13b: '2e891e04002e8c060600ba2c00b81525cd21',
        0x160: 'ba5a002bd3b80031cd21'},
        'YNVSHELL.COM': {0x11c: 'b83b03e88a00', 0x1dc: '23db7408d1e3ff97f101',
                         0x223: '1eff06a8018bd0', 0x23e: 'b8004bcd217208'}}
    windows, lines = {}, []
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    for name, spans in ranges.items():
        boundaries = set()
        for start, end in spans:
            block = code[name][start:end]
            instructions = list(decoder.disasm(block, start))
            require(sum(row.size for row in instructions) == len(block), 'complete window')
            label = f'{name}:{start:04X}..{end:04X}'
            windows[label] = sha256(block).hexdigest()
            lines.append(label)
            for row in instructions:
                boundaries.add(row.address)
                lines.append(f'{row.address:04X} {row.bytes.hex()} {row.mnemonic} {row.op_str}')
        for address, expected in signatures[name].items():
            value = bytes.fromhex(expected)
            require(address in boundaries and code[name][address:address + len(value)] == value, f'signature {name}:{address:X}')
    shell = code['YNVSHELL.COM']
    require(shell[0x33b:0x353].hex() == '0400f302000000000400d902340300000400cc0234030000', 'first three startup commands')
    require(int.from_bytes(shell[0x1f9:0x1fb], 'little') == 0x223, 'opcode4 dispatch')
    for address, name in [(0x2f3, b'LOGO    .EXE'), (0x2d9, b'STR     .EXE'), (0x2cc, b'YNFONT  .EXE')]:
        require(shell[address:address + len(name) + 1] == name + b'\0', 'literal executable filename')
    require(code['STR.EXE'][0x14:0x2c] == b'END_S10.DAT\0END_S11.DAT\0', 'font filenames DATA')
    require([cjk_offset(value) for value in [0xa140, 0xa440, 0xc940, 0xfaff]] == [0, 12240, 174270, 2580], 'instruction arithmetic examples')
    font_ranges = {
        'scope': 'Conditional file intervals only; not character-domain validity, DOS execution or successful reads.',
        'cjkPostOpenCX': read_ranges(len(originals['END_S10.DAT']), 30, [cjk_offset(value) for value in range(65536)]),
        'asciiPostOpenAHAndCL': read_ranges(len(originals['END_S11.DAT']), 15, [value * 15 for value in range(65536)]),
    }
    for name, (_, digest) in INPUTS.items():
        require(sha256((ROOT.parent / 'Dragon' / name).read_bytes()).hexdigest() == digest, 'input changed')
    report = {'scope': 'static STR provider and startup dispatch, not actual DOS/interrupt ABI proof',
              'inputs': {name: {'byteLength': length, 'sha256': digest} for name, (length, digest) in INPUTS.items()},
              'toolSHA': sha256(Path(__file__).read_bytes()).hexdigest(), 'windows': windows,
              'relocations': relocations, 'notCPUExecution': True, 'fontReadRanges': font_ranges,
              'unknown': ['Chained previous INT15 handler behavior and registers/flags.',
                          'DOS INT21 returns, actual short reads, font interpretation and stack preservation; file bytes only pinned.',
                          'Complete startup paths, other providers, G127 and FF portrait/cache reachability.'],
              'admission': {'runtimeAllowed': False, 'trialAllowed': False, 'releaseAllowed': False}}
    output.mkdir()
    for name, text in [('windows.txt', '\n'.join(lines)), ('receipt.json', json.dumps(report, ensure_ascii=False, indent=2))]:
        with (output / name).open('x', encoding='utf8', newline='\n') as stream:
            stream.write(text + '\n')
    print(json.dumps({'windows': len(windows), 'output': str(output), 'notCPUExecution': True}))


if __name__ == '__main__':
    main()
