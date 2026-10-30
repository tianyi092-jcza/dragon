"""Static KI chapter-read certificate, not DOS execution or initialization approval.

Only Dragon/KI.EXE is read. No path arguments, scenario/save access or writes.
The short-return statement is conditional on the close interrupt's returned AH;
DOS/provider behavior and destination-buffer prehistory are not synthesized.
"""
import hashlib
import json
import sys
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

ROOT = Path(__file__).resolve().parents[2]
KI_SHA = 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868'
SPANS = {
    'chapter_reader': (0x8CAE, 0x8CFF),
    'retry_wrapper': (0xE38C, 0xE3A6),
    'open_seek_read_close': (0xF4DF, 0xF528),
    'startup_allocation_call': (0x000D, 0x0016),
    'allocation': (0x00DF, 0x0155),
    'fresh_monthly_call': (0x1B29, 0x1B2C),
    'event_page_shift': (0x2BD9, 0x2C08),
    'event_consumer': (0x31AE, 0x31F2),
    'current_page_enqueue': (0x2FBF, 0x300E),
    'future_page_enqueue': (0x301C, 0x304E),
    'event_direct_caller': (0x3E11, 0x3E65),
    'reserve_upkeep': (0x3E65, 0x3E8E),
    'expense_accumulator': (0x5673, 0x5695),
    'envoy_maintenance': (0x3E8E, 0x3EFD),
    'relation_addresses': (0x310A, 0x3138),
    'random_byte_leaf': (0xECE0, 0xECFC),
    'status_display_dispatch': (0x5E80, 0x5EB7),
    'money_display_wrapper': (0x5F5D, 0x5F7F),
    'calendar_faction_return': (0x1DE9, 0x1E17),
    'calendar_display_inputs': (0x1E17, 0x1E46),
    'startup_common_caller': (0x005E, 0x006B),
    'new_and_load_selection': (0x1A6E, 0x1B5A),
    'strategic_entry_paint': (0x1BE0, 0x1BEC),
    'legion_slot_batch': (0x25A3, 0x2600),
    'legion_monthly_half_records': (0x5456, 0x548F),
    'legion_occupancy_rebuild': (0x8AEA, 0x8B12),
}
# Exact signatures carry the positive claims below. They are checked even with -O.
SIGNATURES = {
    0x000D: '8cc88ed88ec0e8c900',
    0x00DF: '5053b448bb5e1dcd21725c',
    0x00EA: 'a3380d05000da33a0d050003a33c0d05c001a33e0d050002a3560d054000a3400d',
    0x1B29: 'e8ad10',
    0x005E: 'e86919e80a1ae86319e8761bc3',
    0x1AD9: 'e8647072e8eb4c',
    0x1B55: '8cc88ed8c3',
    0x1AA7: '2ec606a69800c3',
    0x1BE0: '8cc88ed88ec0e8076ee85137',
    0x25B6: '80bc4022807221',
    0x25DE: 'f6844022087403e89604',
    0x25E8: '5983c640e2c781fec01f720233f62e8936180d',
    0x5462: 'b08033d2b97f00bb402238077208386701750303570483c320e2ef',
    0x8AEA: '803c807222',
    0x8B05: '8b5c1089441c895c1a26fe07c3',
    0x2BD9: '1e065053515256572ec706200d00002ec606ad31072ea1560d8ed88ec033c08bf8be0001b98001fcf3a5b98000f3ab',
    0x31CB: '268b07268b570283c304891e200d22c07414',
    0x31DD: '8e1e520d8ad832ff4bd1e32eff97f2318cc88ed8c3',
    0x2FF1: '803f007508890f895702',
    0x3033: '803f007507890f895702',
    0x3E11: 'e89af38b361c0d2e8e1e520d',
    0x3E46: 'e81c00e84200',
    0x3E65: '32d28b440403440680d20003440880d200',
    0x5673: '505203441a12541c80fa09',
    0x568C: '89441a88541c5a58c3',
    0x3E8E: '8a7c2a80ffff7466e847ae3c20735f',
    0x3ECA: '2e8b3efd0ce838f28bfa8a078a158ae0',
    0x310A: '5087f7e809008bd387f7e8020058c3',
    0xECE0: '1e538cc88ed8bbfeeca0fdecd70206fcec8006fcec89a2fdec5b1fc3',
    0x3E5F: 'b004e81c20c3',
    0x5E80: '2ef606a698027501c3',
    0x5F5D: '505352578a4422988bd08b4420',
    0x5F7A: '5f5a5b58c3',
    0x1DEC: 'e82220e82500eb04',
    0x1E17: 'a1f60c33d2bb0309bfbb02e80ae8',
    0x1E25: 'a0f40c33d28ae2bb0209bfc002e8fae7',
    0x1E35: 'a0f00c33d28ae2bb0209bfc402e8eae7c3',
    0x8CBB: 'bac056f7e28bca',
    0x8CC6: 'bef00cbf3b00e8bd56',
    0x8CD5: '8b1e520d33f6bf4052e8ab56',
    0x8CE7: '8b1e560d33f6bf0004e89956',
    0xE38C: '1e505351525657e849115f5e5a595b581f7306b400cd50ebe7c3',
    0xF4DF: '5583ec068bec894602894e04b8003dcd21722d',
    0xF4F2: '1e8edb8946008bd8b800428b4e048b5602cd21720c',
    0xF507: 'b43f8bd68bcf8b5e00cd21',
    0xF512: '1f9fb43e8b5e00cd219eb8ffff8bd09f83c4065d9ec3',
}


def require(value, message):
    if not value:
        raise ValueError(message)


def inspect(data):
    require(hashlib.sha256(data).hexdigest() == KI_SHA, 'fixed KI SHA mismatch')
    require(data[:2] == b'MZ', 'MZ required')
    require(int.from_bytes(data[8:10], 'little') * 16 == 0x200, 'fixed MZ header required')
    require(data[20:24] == bytes(4), 'fixed startup CS:IP required')
    for address, value in SIGNATURES.items():
        expected = bytes.fromhex(value)
        require(data[0x200 + address:0x200 + address + len(expected)] == expected,
                f'instruction signature {address:04X}')
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    windows = {}
    for name, (start, end) in SPANS.items():
        raw = data[0x200 + start:0x200 + end]
        instructions = list(decoder.disasm(raw, start))
        require(sum(item.size for item in instructions) == end - start,
                f'complete aligned window {name}')
        windows[name] = {
            'start': f'{start:04X}', 'endExclusive': f'{end:04X}',
            'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': raw.hex(),
            'instructions': [{'address': f'{item.address:04X}', 'bytes': item.bytes.hex(),
                              'mnemonic': item.mnemonic, 'operands': item.op_str}
                             for item in instructions],
        }
    return {
        'source': 'Dragon/KI.EXE', 'sha256': KI_SHA, 'fileOffsetBias': 0x200,
        'signatureCount': len(SIGNATURES), 'windows': windows,
        'claims': {
            'chapterStride': 0x56C0,
            'zeroLegionConsumers': {
                'batch': 'for visited in-range slots with status zero, 25B6 takes the inactive branch and 25DE bit3 is clear; no 2662/2600/264A/2A7E call occurs. The batch still advances and writes D18',
                'occupancy': '8AEA status below 80h returns at 8B11 before coordinate reads, pointer writes or occupancy INC',
                'monthly': '5466..547B scans 127 half-records with stride 20h, not 128 records with stride 40h. All-zero table bytes leave DX zero at 547D; this does not zero the subsequent faction expense or entire monthly calculation',
                'statusOnlyInsufficient': 'clearing only each 40h record status does not clear the odd half-record status bytes read by the monthly scan',
                'scope': 'conditional static consequences of a complete zero table and valid caller state, not a new initialization recipe, CPU execution, all-consumer proof or permission to repair runtime holes with zero',
            },
            'newAndLoadPaintEntry': {
                'selection': 'successful 1AD9 CALL 8B40 follows 1ADE JMP 1B2C, bypassing new-game advisor handling and 1B29; both selection paths normally return via 1B59 to 1A96',
                'commonCaller': '1AAD returns from 1A6E to 0064; after 19CA returns, 0067 CALL 1BE0 reaches unconditional 1BE6 CALL 89F0',
                'scope': 'normal near-call control flow includes DOS load in the shared painting entry. No SAVE access, DOS execution, complete callee verification or Web restore policy change is implied',
            },
            'allocation': {'requestedParagraphs': 0x1D5E, 'eventSegmentDeltaFromReturnedAX': 0x13C0,
                           'eventReservedParagraphs': 0x40,
                           'scope': 'successful allocation path assigns segment pointers, with no explicit event-buffer clearing in 00DF..0145; allocator contents and later writers are not inferred'},
            'eventShift': {'entry': '2BD9', 'caller': '1B29',
                           'copySource': [0x100, 0x400], 'copyDestination': [0, 0x300],
                           'clearDestination': [0x300, 0x400],
                           'unknownTailPropagation': [{'before': 0x3FE, 'after': 0x2FE}, {'before': 0x3FF, 'after': 0x2FF}],
                           'scope': 'half-open byte ranges derived from the fixed REP instructions; conditional on reaching this prefix, not a full fresh-game execution or proof of initial bytes'},
            'eventConsumption': {
                'entry': '31AE', 'slotReads': ['31CB word ES:[BX] into AX', '31CE word ES:[BX+2] into DX'],
                'cursorAdvance': '31D2..31D5 advances D20 by four before testing AL',
                'emptySlot': '31D9..31DB tests the type only after both word reads; type zero returns at 31F1 without indirect dispatch, leaving the loaded DX value in the return registers',
                'enqueueWrites': ['2FF6/2FF8', '3038/303A'],
                'enqueueScope': 'successful branches of these two primitives write both words; this is not an exhaustive certificate of all event-buffer writers',
                'scope': 'unknown argument bytes can be read even for an empty type; absence of dispatch does not establish absent register effects in callers or authorize filling missing source bytes',
            },
            'eventReturnUpkeepBoundary': {
                'caller': '3E11 calls 31AE then reloads SI and DS; 3E14..3E46 does not read DX',
                'lowByte': '3E65 XOR DL,DL replaces the returned low argument byte before computing three reserve pools; 3E67 replaces AX',
                'highByte': 'DH remains unchanged through 3E65..3E8D; 5674 PUSH DX and 5692 POP DX preserve it, but expense arithmetic and stored high byte use only DL',
                'scope': 'with the same faction memory and normal return, event-return DX does not supply the 3E65/5673 expense amount. DH can survive to 3E49; subsequent diplomacy/display/caller effects are not certified here',
            },
            'eventReturnEnvoyBoundary': {
                'entry': '3E49 calls 3E8E',
                'earlyReturns': 'no envoy, first RNG rejection, no budget or second RNG rejection can return with inherited DH; none reads the inherited DX before return',
                'rng': 'ECE0..ECFB uses AX/BX/DS and CS-owned RNG bytes; it does not read or write DX',
                'relationUpdate': '310A/3119 computes addresses from SI/DI; 3110 MOV DX,BX overwrites the full inherited DX before 3ED2 uses it. Subsequent DL/DH operations use the newly read relation byte',
                'scope': 'with otherwise equal registers, memory and RNG state, inherited DX does not select the envoy branch, RNG consumption, budget or relationship writes in these windows; early returns may retain DH for later 5E80/display and outer-caller paths, which are not certified here',
            },
            'eventReturnDisplayBoundary': {
                'selector': '3E5F sets AL=4 before 5E80; disabled display returns directly, enabled dispatch reaches only 5F5D',
                'moneyInput': '5F5F saves incoming DX; 5F61 loads F22 into AL, opcode 98 sign-extends AL to AX in 16-bit mode, and 5F65 replaces full DX before the 062F call',
                'return': 'on normal nested return, 5F7B restores incoming DX; neither disabled display nor this wrapper proves that inherited DH has been cleared',
                'scope': 'incoming DX is not the money/sign input supplied by this wrapper. Full renderer behavior, stack integrity outside the ordinary call contract and callers beyond 3E64 are not certified',
            },
            'eventReturnCalendarBoundary': {
                'caller': '1DEC CALL 3E11 returns to unconditional 1DEF CALL 1E17',
                'overwrite': '1E17 loads year into AX; 1E1A XOR DX,DX overwrites the full returned DX before any read or nested call in this display routine',
                'otherInputs': 'month and day loads also reset full DX at 1E28 and 1E38 before 062F; this statement concerns caller-supplied inputs, not renderer internals',
                'scope': 'the inherited event-argument DX chain ends here on this normal calendar caller path. This is not an all-callers certificate, CPU/DOS proof, recovery of missing bytes or initialization permission',
            },
            'reads': [{'chapterOffset': 0, 'length': 0x3B, 'destination': 'CS:0CF0'},
                      {'chapterOffset': 0x80, 'length': 0x5240, 'destination': '[D52]:0000'},
                      {'chapterOffset': 0x52C0, 'length': 0x400, 'destination': '[D56]:0000'}],
            'normalReadReturnPath': 'F512..F527 has no returned-length comparison; F513 LAHF is immediately overwritten by F514 MOV AH,3E, then F51B SAHF uses close-return AH. F521/F526 preserve those reconstructed flags around stack cleanup',
            'wrapperReturn': 'E396..E39D restores caller registers then JAE E3A5 on CF=0; CF=1 enters INT50/retry',
            'shortReadConditional': 'After successful open and seek, different returned read counts with the same close-return AH take the same remaining path. Wrapper CF is the bit0 reconstructed from close-return AH, not a comparison of read AX with DI',
        },
        'unknown': ['actual DOS interrupt behavior on the supplied short file, including close-return AH',
                    'event-buffer bytes supplied by allocator and writes between allocation and chapter read',
                    'open/seek failure and INT50 handler full behavior',
                    'missing event-tail bytes and neutral initialization recipe'],
        'scope': 'static instruction evidence only; no KI execution, DOS I/O, missing-byte synthesis, runtime or deletion admission',
    }


def main():
    if len(sys.argv) != 1:
        raise SystemExit('no arguments accepted')
    print(json.dumps(inspect((ROOT / 'Dragon' / 'KI.EXE').read_bytes()), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
