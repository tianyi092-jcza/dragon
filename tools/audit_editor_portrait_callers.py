"""Fixed primary caller prefixes; not a complete call graph or portrait policy."""
import json
import re
import sys
from hashlib import sha256
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

ROOT = Path(__file__).resolve().parent.parent
KI_SHA = "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868"
WINDOWS = [(0x3C99, 0x3D08), (0x5E60, 0x5EE3), (0x6DFD, 0x6E2F),
           (0x807B, 0x80B0), (0x8810, 0x88B0), (0x8EA0, 0x8EE6),
           (0x8FC9, 0x900D), (0x915B, 0x9165), (0x01B4, 0x01D5), (0x9796, 0x97C3)]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return sha256(data).hexdigest()


def main():
    require(len(sys.argv) == 2, "one owned round required")
    name = sys.argv[1]
    require(re.fullmatch(r"[A-Za-z0-9-]{1,64}", name), "unsafe round")
    parent = ROOT / ".dragon-analysis" / "editor-phase"
    require(parent.is_dir() and not parent.is_symlink(), "owned parent required")
    output = parent / name
    require(not output.exists() and not output.is_symlink(), "new owned round required")
    path = ROOT.parent / "Dragon" / "KI.EXE"
    require(path.is_file() and not path.is_symlink(), "fixed regular primary required")
    ki = path.read_bytes()
    require(digest(ki) == KI_SHA, "unapproved primary")

    def at(cs, length):
        block = ki[0x200 + cs:0x200 + cs + length]
        require(len(block) == length, "truncated fixed code")
        return block

    signatures = {
        0x3CB1: "8a4401", 0x3CB4: "e8a4ca", 0x3CCD: "8a4401",
        0x3CD0: "e888ca", 0x3CE1: "2e8b1efd0c8a7f02", 0x3CF3: "8a874142",
        0x3CFD: "e85bca", 0x5E80: "2ef606a698027501c3",
        0x5E8B: "2e8e1e520d2e8b36fd0c", 0x5EBC: "8a6401",
        0x5EC1: "d1e8d1e8d1e8", 0x5EC9: "8a844142", 0x5ED0: "e8ffa8",
        0x6E1C: "8bc62d4022d1e88bf0", 0x6E25: "8a844142", 0x6E2C: "e8a399",
        0x8099: "8a640232c0d1e8d1e8d1e8", 0x80A6: "8a844142", 0x80AD: "e82287",
        0x8824: "e88d79", 0x882D: "e82b7f", 0x8856: "b093",
        0x8870: "5883f9ff", 0x887C: "e8dc7e", 0x888F: "e8040f",
        0x8899: "e8bf7e", 0x8ED8: "8a8741423cff7406", 0x8EE3: "e8ec78",
        0x8FF8: "803e2152ff7505c606215291", 0x900A: "e84e01",
        0x915B: "56a02152bb1a2d", 0x9162: "e86d76",
        0x01B4: "9c50535152", 0x01D2: "589dc3", 0x9796: "0650535257",
        0x97C0: "5807c3",
    }
    for cs, hex_bytes in signatures.items():
        expected = bytes.fromhex(hex_bytes)
        require(at(cs, len(expected)) == expected, f"signature {cs:04X}")

    expected_candidates = {
        0x075B: [0x3CB4, 0x3CD0, 0x3CFD, 0x882D, 0x887C, 0x8899, 0xC3B0],
        0x07D2: [0x079D, 0x5ED0, 0x6E2C, 0x80AD, 0x8EB8, 0x8EE3, 0x9162],
    }
    code = ki[0x200:0x10200]
    candidates = {}
    for target, expected in expected_candidates.items():
        found = [cs for cs in range(len(code) - 2) if code[cs] == 0xE8
                 and (cs + 3 + int.from_bytes(code[cs + 1:cs + 3], "little", signed=True))
                 & 0xFFFF == target]
        require(found == expected, "changed literal candidate index")
        candidates[f"{target:04X}"] = [f"{cs:04X}" for cs in found]

    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    lines = [f"KI SHA256 {KI_SHA}", "CS=file offset-0200; E8 is near16",
             "Bounded prefixes only; no DOS/CPU/pixel execution or full graph assertion"]
    hashes, calls = {}, {}
    for start, end in WINDOWS:
        block = at(start, end - start)
        hashes[f"{start:04X}..{end:04X}"] = digest(block)
        lines.append(f"WINDOW {start:04X}..{end:04X}")
        consumed = 0
        for instruction in decoder.disasm(block, start):
            consumed += instruction.size
            operand = instruction.op_str
            if instruction.bytes[0] == 0xE8 and instruction.size == 3:
                target = (instruction.address + 3 + int.from_bytes(
                    instruction.bytes[1:], "little", signed=True)) & 0xFFFF
                calls[f"{instruction.address:04X}"] = f"{target:04X}"
                operand = f"{target:04X} (near16)"
            lines.append(f"{instruction.address:04X} {instruction.bytes.hex()} {instruction.mnemonic} {operand}")
        require(consumed == len(block), "incomplete prefix decode")
    for target, sites in expected_candidates.items():
        for site in sites:
            if site not in (0x079D, 0xC3B0):
                require(calls.get(f"{site:04X}") == f"{target:04X}", "call not at decoded boundary")
    # Only the shown operand arithmetic; source domains and records remain separate.
    for index in range(256):
        ax = index << 8
        for _ in range(3):
            ax >>= 1
        require(ax == index * 0x20, "index address arithmetic")
    for slot in range(128):
        si = 0x2240 + slot * 0x40
        projected = ((si - 0x2240) & 0xFFFF) >> 1
        require(projected + 0x4240 == 0x4240 + slot * 0x20, "slot address arithmetic")
    require(digest(path.read_bytes()) == KI_SHA, "primary changed")
    report = {
        "result": "PASS-BOUNDED-PORTRAIT-CALLER-PREFIXES-NOT-REACHABILITY",
        "inputHashes": {"KI.EXE": KI_SHA}, "toolHash": digest(Path(__file__).read_bytes()),
        "windows": hashes, "decodedNearCalls": calls, "literalCandidates": candidates,
        "byteIndexArithmetic": 256, "canonicalSlotArithmetic": 128,
        "localOperands": {
            "3CB4/3CD0": "AL=caller DS:SI general+1; caller SI domain not certified",
            "3CFD": "AL=G01 indexed by player CFD faction+2",
            "5ED0": "AL=G01 indexed by CFD faction+1, behind CS98A6 mask02h gate",
            "6E2C": "AL=G01 indexed by incoming legion SLOT pointer, not legion+2",
            "80AD": "AL=G01 indexed by incoming legion+2 commander (7F90/7F9B); old faction/advisor label withdrawn by portrait-domains audit",
            "882D": "entry AX restored at8823;01B4 saves/restoresAX on normal balanced far return, so AL=input portrait byte in that domain",
            "887C": "AL=93h restored from savedAX; CX=FFFF skips this message",
            "8899": "9796 saves/restoresAX at9797/97C0 on normal balanced FAC2 return; AL=input portrait byte in that domain",
            "8EE3": "8EDC/8EDE skip AL=FF locally, not universal helper policy",
            "9162": "AL=DS5221; 8FFF changes FF to91h in custom initialization only",
        },
        "limits": "Contiguous bounded code/signatures and address arithmetic only. Literal E8 list is not a full call graph/absence proof;079D/C3B0 prior reader source separate. Source pointers, record/slot legal domains, upstream registration, complete far/driver/FAC2 returns beyond the shown normal wrapper, indirect aliases, pixel/cache lifetimes and complete G127 reachability remain unclosed. No default/placeholder/FF-no-image rule, product/runtime install or Q69 closure.",
    }
    output.mkdir()
    with (output / "windows.txt").open("x", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines) + "\n")
    with (output / "receipt.json").open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ["result", "byteIndexArithmetic", "canonicalSlotArithmetic", "literalCandidates"]}))


if __name__ == "__main__":
    main()
