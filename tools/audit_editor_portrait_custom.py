"""Bounded KI custom-advisor portrait writes; not CPU execution or admission."""
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
    output = parent / ('portrait-custom-' + sys.argv[1])
    require(not output.exists() and not output.is_symlink(), 'new owned round required')
    path = ROOT.parent / 'Dragon/KI.EXE'
    require(path.is_file() and not path.is_symlink(), 'fixed primary required')
    raw = path.read_bytes()
    require(len(raw) == 67099 and sha256(raw).hexdigest() == KI_SHA, 'primary SHA/length')
    require(raw[:2] == b'MZ' and int.from_bytes(raw[8:10], 'little') * 16 == 0x200 and raw[0x14:0x18] == bytes(4), 'MZ header and entry CS:IP')
    code = raw[0x200:]
    ranges = [(0x0000, 0x0082), (0x0701, 0x075B), (0xF720, 0xF75E), (0xF75E, 0xF7A1), (0xF878, 0xF888), (0x1AE0, 0x1B2C), (0x7B3C, 0x7B90), (0x7B90, 0x7C6E), (0x8E5A, 0x8EA0), (0x8F7C, 0x8F97), (0x8FC9, 0x905E), (0x912D, 0x917C), (0x92F5, 0x9309)]
    signatures = {0x0000: 'b451cd218edb',
                  0x003A: 'e82e00',
                  0x007A: 'e8a3f6b000e82d09',
                  0x0701: '50515755',
                  0x0705: '2ea31f072ea336072ea34d07',
                  0x0711: '8bfa8beb8b0486c4',
                  0x0724: '8bd78bdd83c2108b440286c4',
                  0x073B: '8bd78bdd83c2208b440486c4',
                  0x0752: '8bd78bdd5d5f5958c3',
                  0xF720: '0650535255',
                  0xF725: 'b80050bb0000ba100833edcd15',
                  0xF732: '7224',
                  0xF734: '2e891e91f72e8c0693f7',
                  0xF73E: 'b80050bb0001ba101033edcd15',
                  0xF74B: '720b',
                  0xF74D: '2e891e8af72e8c068cf7f8',
                  0xF758: '5d5a5b5807c3',
                  0xF75E: '1e06565755',
                  0xF767: '8cd08ed88ec083ec208bec8bf4',
                  0xF774: '81fa7002771e81fb80017718',
                  0xF789: '9a00000000eb059a00000000',
                  0xF798: '83c4205d5f5e071fc3',
                  0xF878: '80fc807203f8eb078ac432e4f9eb00c3',
                  0x7B90: '50535256',
                  0x7BA7: '32e4d1e08bf0b80a00',
                  0x7BB3: '464683c3104875f5',
                  0x7BBB: '5e5a5b58c3',
                  0x7BC0: '50535152565755813affff',
                  0x7BE0: '8b3a8a650132c0d1e8d1e8d1e8054242',
                  0x7BFB: '8a650232c0d1e8d1e8d1e8054242',
                  0x7C15: '8a650332c0d1e8d1e8d1e8054208',
                  0x7C49: '8a441833d28ae2',
                  0x7C59: '8a442333d28ae2',
                  0x7C66: '5d5f5e5a595b58c3',
                  0x7B3C: '1e06505152565755',
                  0x7B50: '2e8e1e520db86f7bbb907b',
                  0x7B66: '5d5f5e5a5958071fc3',
                  0x7B72: '33f68bfe32e4803c8072068933fec44747',
                  0x7B83: '83c64081fe800575ec',
                  0x1AEF: '22c07405', 0x1AF6: 'ebf2',
                  0x1AF8: '2e8e1e520d', 0x1AFD: '8a670280fc7f7403fe4f18',
                  0x1B08: '32c0d1e8d1e8d1e88bf0c684404200',
                  0x1B17: '2e891efd0cd1e3d1e32e883eff0c',
                  0x8E5A: '1e53562e8e1e520d8bf3',
                  0x8E73: '721c', 0x8E78: '2c2072f47710',
                  0x8E7E: '807c027f750a813e2252a1d07502b001',
                  0x8E8E: 'f8eb04', 0x8E94: 'f99c50',
                  0x8E9A: '589d5e5b1fc3',
                  0x8F7C: '8a443f884402', 0x8F82: 'c6062152ff',
                  0x8FF3: '2e8e1e520d', 0x8FF8: '803e2152ff7505c606215291',
                  0x9046: '5bc647027f53', 0x912D: 'a02152fec83c937202b092',
                  0x913D: 'a22152', 0x9144: 'a02152fec03c93720232c0',
                  0x9154: 'a22152', 0x915B: '56a02152bb1a2d',
                  0x92F5: 'b97e00bb40423a4701', 0x9300: '83c320e2f6f8c3f9c3'}
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    boundaries, windows, lines = set(), {}, ['KI SHA ' + KI_SHA, 'Main CS offset=file-0200; near CALL targets wrap at 16 bits.']
    for start, end in ranges:
        block = code[start:end]
        instructions = list(decoder.disasm(block, start))
        require(sum(ins.size for ins in instructions) == len(block), 'complete window')
        windows[f'{start:04X}..{end:04X}'] = sha256(block).hexdigest()
        for ins in instructions:
            boundaries.add(ins.address)
            lines.append(f'{ins.address:04X} {ins.bytes.hex()} {ins.mnemonic} {ins.op_str}')
    for address, text in signatures.items():
        expected = bytes.fromhex(text)
        require(address in boundaries and code[address:address + len(expected)] == expected, f'signature/boundary {address:X}')
    targets = {0x003A: 0x006B, 0x007A: 0xF720, 0x007F: 0x09AF,
               0x0719: 0xF878, 0x0730: 0xF878, 0x0747: 0xF878,
               0x0721: 0xF75E, 0x0738: 0xF75E, 0x074F: 0xF75E, 0xF795: 0xF7A4,
               0x7B94: 0x8607, 0x7BB0: 0x7BC0, 0x7BD8: 0xF6DC,
               0x7BF5: 0x0701, 0x7C0E: 0x0701, 0x7C28: 0x0701,
               0x7C53: 0x062F, 0x7C63: 0x062F,
               0x1AE5: 0x7B3C, 0x7B63: 0x820E, 0x1AEA: 0x8E5A, 0x1AF3: 0x8FC9, 0x8E6A: 0x8EA0,
               0x8E70: 0x21E7, 0x8E75: 0xE453, 0x8E91: 0x8F7C,
               0x9138: 0x92F5, 0x914F: 0x92F5, 0x9140: 0x915B, 0x9157: 0x915B, 0x9162: 0x07D2, 0x9041: 0x8F7C}
    for site, target in targets.items():
        require(site in boundaries and code[site] == 0xE8, 'near call boundary')
        require((site + 3 + int.from_bytes(code[site + 1:site + 3], 'little', signed=True)) & 0xFFFF == target, 'near16 target')
    dispatcher = code[0x8F97:0x8FA7]
    require(dispatcher.hex() == '5e906e907f908d90a390c0902d914491', 'eight dispatcher DATA words')
    cases, largest = 0, 0
    for occupied in [set(), set(range(126)), set(range(21, 147))]:
        for initial in range(256):
            for direction in [-1, 1]:
                candidate, attempts = initial, 0
                for _ in range(127):
                    attempts += 1
                    candidate = (candidate + direction) & 255
                    if candidate >= 147:
                        candidate = 146 if direction < 0 else 0
                    if candidate not in occupied:
                        break
                require(0 <= candidate < 147 and candidate not in occupied, 'bounded arithmetic example')
                largest = max(largest, attempts)
                cases += 1
    require(sha256(path.read_bytes()).hexdigest() == KI_SHA, 'primary changed')
    report = {'result': 'PASS-BOUNDED-CUSTOM-PORTRAIT-NOT-Q69', 'inputSHA': KI_SHA,
              'toolSHA': sha256(Path(__file__).read_bytes()).hexdigest(), 'windows': windows,
              'dispatcherDataSHA': sha256(dispatcher).hexdigest(), 'near16Targets': {f'{k:04X}': f'{v:04X}' for k, v in targets.items()},
              'arithmeticOnly': {'cases': cases, 'largestAttempts': largest, 'notCPUExecution': True},
              'facts': ['0701 reads three fixed words DS:[SI], [SI+2], [SI+4], swaps their bytes, calls F878 then F75E for each.',
                        '0701 copies entry AX into three CS immediate operands; BX/DX are recovered from saved BP/DI after drawing, AX/CX/DI/BP popped at return.',
                        'F878 has no calls and changes only AX/flags: AH<80h selects AL=AH, AH=0, CF=1; otherwise AX unchanged and CF=0.',
                        'F75E saves DS/ES/SI/DI/BP, allocates 32 stack bytes, and restores them on the common local return; balanced nested returns and intact saved stack remain prerequisites.',
                        'F75E unsigned DX>0270h or BX>0180h skips rendering; on-disk far font-loader operands are 0000:0000.',
                        'MZ entry CS:IP=0:0; local startup CALL003A targets 006B, whose CALL007A targets F720. Normal prior helper returns remain prerequisites.',
                        'After F720, 007D MOV AL,0 and 007F CALL09AF have no intervening local conditional branch; downstream use of CF is not established here.',
                        'F720 uses INT15 AX=5000h, BX=0, DX=0810h, BP=0; CF clear stores returned ES:BX at CS:F793/F791 for the F790 far call.',
                        'Second INT15 uses AX=5000h, BX=0100h, DX=1010h, BP=0; CF clear stores returned ES:BX at CS:F78C/F78A for F789, then CLC.',
                        'Either CF-set branch returns via saved BP/DX/BX/AX/ES pops; second-call failure does not roll back the first pointer write. No local null or code-domain check.',
                        '7B3C registers builder 7B6F with 820E; builder scans 22 faction slots 0..21, attr >=80h only.',
                        '7B3C restores saved registers except output BX; POP/RET suffix preserves selection CF.',
                        '7B90 calls 8607 then visits ten SS:[BP+2*(post-8607 AL+row)] cells; FFFF takes the explicit blank-text branch.',
                        '7BC0 saves/restores BP/SI/DI and other listed registers on both local row paths, conditional on balanced helper returns.',
                        'Nonblank row reads faction +1/+2 for name pointers 4242h+byte*20h, +3 for 0842h+byte*20h; no local field-index guard.',
                        '7C49/7C59 display stored F18/F23; local renderer neither recounts these nor explicitly calls portrait reader 07D2.',
                        '1AEA calls 8E5A; CF cancels, nonzero AL calls 8FC9 then returns to 8E5A.',
                        '8E5A saves DS/BX/SI and sets DS=D52, SI=entry BX; 8E91 cancellation calls reset.',
                        'After E453 AL-20h=0, advisor index 7F plus name word D0A1 forces AL=1.',
                        '1AFD skips the F18 byte decrement only for advisor index 7F; 1B12 clears selected advisor attr in both branches.',
                        '1B17 stores entry BX as CFD, then shifts BX twice and stores BH as CFF.',
                        '8FFF replaces G127 portrait FF with 91h in this custom entry only.',
                        '8F82 explicitly writes FF during this reset helper; 9041 cancellation calls it.',
                        '913D/9154 write cycled portrait bytes after 92F5 returns CF clear.',
                        '92F5 compares G0..125 portrait bytes, no attr filter; does not scan G126/G127.',
                        'Both cycle handlers normalize candidates to 0..146 before collision checks.'],
              'unknown': ['Complete 820E selection and E453 input domains; 0701/F878/F75E wrapper now checked, but the INT15 provider and actual font-call targets, full startup helper effects and other F720 callers, F7A4 body, 8607 and device/stack preservation remain open. Numeric helper has a separate bounded ability-display audit.',
                          'All G127 writers, other portrait callers, cache pixels, FF resource policy.'],
              'admission': {'runtimeAllowed': False, 'trialAllowed': False, 'releaseAllowed': False}}
    output.mkdir()
    with (output / 'windows.txt').open('x', encoding='utf-8', newline='\n') as stream:
        stream.write('\n'.join(lines) + '\n')
    with (output / 'receipt.json').open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'result': report['result'], 'output': str(output), 'windows': len(windows), 'arithmeticCases': cases}))


if __name__ == '__main__':
    main()
