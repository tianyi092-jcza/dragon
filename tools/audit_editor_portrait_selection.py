"""Bounded original list selection; byte-checked algebra, NOT CPU/device/runtime."""
import json
import re
import sys
from hashlib import sha256
from pathlib import Path

from capstone import Cs, CS_ARCH_X86, CS_MODE_16

ROOT = Path(__file__).resolve().parent.parent
KI_SHA = 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868'
WINDOWS = [(0x81C0,0x820E),(0x820E,0x8459),(0x8463,0x8607),
           (0x21E7,0x2216),(0x8713,0x8755),(0x716D,0x724D),(0x7663,0x76DC)]


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(raw):
    return sha256(raw).hexdigest()


def main():
    require(len(sys.argv)==2 and re.fullmatch(r'r[1-9][0-9]{0,3}',sys.argv[1]), 'one bounded round required')
    parent=ROOT/'.dragon-analysis/editor-phase/portrait-selection-session-r1'
    require(parent.is_dir() and parent.resolve(strict=True).is_relative_to(ROOT) and not parent.is_symlink(), 'owned parent required')
    output=parent/sys.argv[1]
    require(not output.exists() and not output.is_symlink(), 'new owned round required')
    path=ROOT.parent/'Dragon/KI.EXE'
    require(path.is_file() and not path.is_symlink(), 'fixed primary required')
    ki=path.read_bytes()
    require(len(ki)==67099 and digest(ki)==KI_SHA,'primary SHA/length')
    code=ki[0x200:0x10200]
    signatures={
        0x820E:'5581ec00028bec',0x8215:'2ea3a8812e891ea681',
        0x823D:'8cd08ec08bfdb90001b8fffff3ab',0x824E:'2eff16a881',
        0x8253:'2e8826bd81',0x825D:'2e8b1eba81e81a03',
        0x8268:'e8a701720c8ad832ffd1e303eb8b5e00f8',
        0x8279:'9c33c0e810002e8b0eba81d1e99d9f81c400029e5dc3',
        0x828F:'535152',0x82AF:'5a595bc3',0x840A:'5f5e581f5a595bc3',
        0x8439:'2c3d721832e4d1e08bd883fb0a720883eb0ae83101',
        0x8450:'2eff975984',0x8455:'ebbbf9c3',
        0x8463:'8bfa2e2b16b08183ea10b104d3ea2e0216bc812e3a16bd81720fc3',
        0x8497:'5a5b58',0x84A6:'8bf2e83c9d72d1',
        0x84B7:'588bc6f8c3',0x857F:'e8327c2e891eba81',
        0x8587:'23db741e',0x859D:'2e8a2ebd81e80d00',
        0x85A9:'2eff16a881',0x85B2:'2e8026e885fe2e0826e885',
        0x85BD:'2e8026ef85fe2e0826ef85',0x85C8:'2e8026f385fe2e0826f385',
        0x85D3:'2ea2f1855733fffecd7427558acd03ef8b5e008bd3',
        0x85EA:'45458b5e00',0x85F5:'875600',
        0x85F8:'4545fec975ee5d89134747ebd55fc3',
        0x21E7:'5053b80500bb0100',0x220E:'f85b58c3f95b58c3',
        0x7186:'b8a871bb4d72',0x7197:'e87410',
        0x71F5:'b81772bb4d72',0x7206:'e80510',
        0x767C:'b8a076bbdc76',0x768F:'e87c0b',
    }
    for cs,raw in signatures.items():
        signature=bytes.fromhex(raw)
        require(code[cs:cs+len(signature)]==signature,f'signature{cs:04X}')
    table=[int.from_bytes(code[n:n+2],'little') for n in range(0x8459,0x8463,2)]
    require(table==[0x8458,0x8463,0x84DD,0x851A,0x8546], 'five handler words')
    decoder=Cs(CS_ARCH_X86,CS_MODE_16)
    decoded = {}
    windows = {}
    calls = {}
    lines=['KI SHA '+KI_SHA,'CS=file-0200; near16 wrap; NOT CPU/selection/device execution',
           '8459..8463 DATA '+','.join(f'{n:04X}' for n in table)+'; not instructions']
    for start,end in WINDOWS:
        block=code[start:end]
        insns=list(decoder.disasm(block,start))
        require(sum(i.size for i in insns)==len(block),f'complete window{start:04X}..{end:04X}')
        windows[f'{start:04X}..{end:04X}']=digest(block)
        lines.append(f'WINDOW {start:04X}..{end:04X}')
        for ins in insns:
            decoded[ins.address]=ins.bytes.hex()
            operand=ins.op_str
            if ins.bytes[0] in(0xE8,0xE9) and ins.size==3:
                target=(ins.address+3+int.from_bytes(ins.bytes[1:],'little',signed=True))&0xFFFF
                operand=f'{target:04X} near16'
                if ins.bytes[0]==0xE8:
                    calls[f'{ins.address:04X}']=f'{target:04X}'
            lines.append(f'{ins.address:04X} {ins.bytes.hex()} {ins.mnemonic} {operand}')
    for cs in signatures:
        require(cs in decoded,f'instruction boundary{cs:04X}')
    require(all(n in decoded for n in table),'handler entry boundaries')
    for cs,target in [(0x8262,0x857F),(0x8268,0x8412),(0x827C,0x828F),
                      (0x844B,0x857F),(0x84A8,0x21E7),(0x85A2,0x85B2),
                      (0x7197,0x820E),(0x7206,0x820E),(0x768F,0x820E)]:
        require(calls.get(f'{cs:04X}')==f'{target:04X}','decoded caller')
    # Model ONLY pointer exchanges; comparison outcomes are explicit synthetic
    # choices. No DS sort-field reads, flags emulator, mouse, RNG or CPU.
    sort_cases=[]
    for count in (0,1,2,126,127,128):
        effective=256 if count==0 else count
        original=[0xFFFF]*256
        for n in range(count):
            original[n]=0x4240+n*0x20
        for pattern in ('never','always','alternating'):
            rows = original.copy()
            swaps = 0
            comparisons = 0
            maximum = 0
            for outer in range(effective-1):
                dx=rows[outer]
                for at in range(outer+1,effective):
                    maximum = max(maximum, at)
                    comparisons += 1
                    exchange=pattern=='always' or (pattern=='alternating' and comparisons%2==0)
                    if exchange:
                        rows[at], dx = dx, rows[at]
                        swaps += 1
                rows[outer]=dx
            require(sorted(rows)==sorted(original),'pointer multiset')
            require(rows[effective:]==original[effective:],'sort tail untouched')
            require(maximum<256,'allocated table bound')
            require(comparisons==effective*(effective-1)//2,'loop count arithmetic')
            sort_cases.append({'countByte':count,'effectiveCount':effective,'comparisonPattern':pattern,'comparisons':comparisons,'swaps':swaps,'maxWordIndex':maximum,'membershipPreserved':True})
    # Given retained local index AL and an unchanged table, unsigned DL<count
    # admits exactly count indices. 826D consumes AL only and explicitly clears BH.
    selection_cases=[]
    for count in (0,1,2,126,127,128):
        admitted=[index for index in range(256) if index<count]
        offsets=[index*2 for index in admitted]
        require(admitted==list(range(count)),'unsigned byte gate')
        require(all(n<512 for n in offsets),'selected table offset')
        selection_cases.append({'countByte':count,'admittedIndices':admitted,'maxByteOffset':max(offsets,default=None)})
    require(digest(path.read_bytes())==KI_SHA,'primary changed')
    report={'result':'PASS-BOUNDED-SELECTION-TABLE-NOT-Q69','inputHashes':{'KI.EXE':KI_SHA},
            'toolHash':digest(Path(__file__).read_bytes()),'windows':windows,'signatures':len(signatures),
            'decodedNearCalls':calls,'handlerTable':{'offset':'8459','kind':'five-word DATA','targets':[f'{n:04X}' for n in table]},
            'sortPointerCases':sort_cases,'selectionByteCases':selection_cases,
            'confirmedLocalFacts':{
                'table':'820E reserves512bytes; ES=SS, BP=SP;256FFFFwords filled. registered callback81A8 writes SS:[BP+DI]; AHcount recorded81BD.',
                'sorting':'857F sortkey0 invokes builder again; otherwise85B2 edits comparison opcodes/branch and exchanges pointer words only. nonzeroCH count1..128 sorts that prefix; count0 decrementsCH toFF and handles256words, not an empty early return. DS fields from FFFF+SI remain UNKNOWN on count0.',
                'selection':'8463 checks DL<81BD. on guarded left completion84B7 discards handler return address,84B8AX=SI andCLC;826D zeroesBH and loadsSS:[BP+2*AL]. flags saved before cleanup828F/restored aroundADDSP; savedcallerBP restored.',
                'roles':'71A8/7217/76A0 registrations verified, domain receipt remains authority for local0..125 army vs0..127 general builder operands; this report no full-domain regrant.',
                'poll':'21E7 preserves AX/BX explicitly but not SI/BP around external1000:0; local right path STC, left path CLC. Device actual implementation/ABI NOT proved.',
            },
            'limits':'Static instruction facts + pointer/index algebra only, NOT CPU/DOS/runtime or full820E proof. Conditional membership requires all callee/device/render returns preserve SS/BP/SI/candidate memory as required; complete E453 input routing, selfmodified sort descriptors, registered rendering callbacks and far1000/graphics paths not closed. Index gate before later21E7/far return not a final provenance check. Empty-count fields FFFF+SI unresolved. G127actual init/all writers/messages/cachepixels/portrait255/Q69/runtimeManifest/Trial/release remain unknown; no FF sentinel/fill/dead assumption/productchange.'}
    output.mkdir()
    for name,body in [('windows.txt','\n'.join(lines)+'\n'),('receipt.json',json.dumps(report,ensure_ascii=False,indent=2)+'\n')]:
        with (output/name).open('x',encoding='utf-8',newline='\n') as handle:
            handle.write(body)
    print(json.dumps({'result':report['result'],'signatures':report['signatures'],'windows':len(windows),'sortPointerCases':len(sort_cases),'selectionIndexComparisons':6*256,'actualCPUExecution':False}))


if __name__=='__main__':
    main()
