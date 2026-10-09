"""Bounded primary portrait reader audit; no DOS execution or pixel substitute."""
import json
import re
import sys
from hashlib import sha256
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

ROOT = Path(__file__).resolve().parent.parent
PRIMARY = ROOT.parent / "Dragon"
KI_SHA = "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return sha256(data).hexdigest()


def main():
    require(len(sys.argv) == 2, "one owned round required")
    round_name = sys.argv[1]
    require(re.fullmatch(r"[A-Za-z0-9-]{1,64}", round_name), "unsafe round")
    parent = ROOT / ".dragon-analysis" / "editor-phase"
    require(parent.is_dir() and not parent.is_symlink(), "owned evidence parent required")
    output = parent / round_name
    require(not output.exists() and not output.is_symlink(), "new owned round required")
    inputs = {"KI.EXE": PRIMARY / "KI.EXE", "KAOGRF.DAT": PRIMARY / "KAOGRF.DAT"}
    for path in inputs.values():
        require(path.is_file() and not path.is_symlink(), "fixed regular input required")
    bodies = {name: path.read_bytes() for name, path in inputs.items()}
    require(digest(bodies["KI.EXE"]) == KI_SHA, "unapproved KI")
    ki = bodies["KI.EXE"]

    def at(cs, length):
        part = ki[0x200 + cs:0x200 + cs + length]
        require(len(part) == length, "truncated fixed window")
        return part

    # These assertions pin original instructions; they do not invent sentinel handling.
    signatures = {
        0x0785: "e84504", 0x079D: "e83200", 0x07E0: "3a874608", 0x07E4: "7442",
        0x07F1: "88874608", 0x080F: "8ae0", 0x0811: "33c9",
        0x0813: "8ac1", 0x0815: "d1e0d1d1d1e0d1d1d1e0d1d1",
        0x0821: "bf0008", 0x0824: "e865db", 0x083A: "e8faf1",
        0x0845: "00ffffffff", 0x0BCD: "50", 0x0C12: "58c3",
        0xC350: "8a4701", 0xC3B0: "e8a843",
        0xE393: "e84911", 0xE39D: "7306", 0xF4EB: "b8003dcd21",
        0xF4FA: "b80042", 0xF507: "b43f8bd68bcf8b5e00cd21",
        0xF512: "1f9fb43e8b5e00cd219eb8ffff", 0xF526: "9ec3",
    }
    for cs, hexadecimal in signatures.items():
        expected = bytes.fromhex(hexadecimal)
        require(at(cs, len(expected)) == expected, f"signature {cs:04X}")
    require(at(0x0D79, 11) == b"KAOGRF.DAT\x00", "fixed filename literal")
    windows = [(0x075B, 0x07D2), (0x07D2, 0x0845), (0x0BCD, 0x0C14), (0xC315, 0xC398),
               (0xC39C, 0xC3B8), (0xE38C, 0xE3A6), (0xF4DF, 0xF528)]
    engine = Cs(CS_ARCH_X86, CS_MODE_16)
    lines = [f"KI SHA256 {KI_SHA}", "File offset = CS + 0200; native near IP is 16-bit",
             "Readonly static audit, not a CPU/DOS/pixel execution", "0845 bytes 00ffffffff; D79 KAOGRF.DAT"]
    window_hashes = {}
    for start, end in windows:
        block = at(start, end - start)
        window_hashes[f"{start:04X}..{end:04X}"] = digest(block)
        lines.append(f"WINDOW {start:04X}..{end:04X}")
        consumed = 0
        for instruction in engine.disasm(block, start):
            consumed += instruction.size
            operand = instruction.op_str
            if instruction.bytes[0] == 0xE8 and instruction.size == 3:
                relative = int.from_bytes(instruction.bytes[1:], "little", signed=True)
                operand = f"{(instruction.address + 3 + relative) & 0xFFFF:04X} (near16)"
            lines.append(f"{instruction.address:04X} {instruction.bytes.hex()} {instruction.mnemonic} {operand}")
        require(consumed == len(block), "incomplete fixed decode")
    # Literal SHL/RCL witnesses over the 8-bit parameter domain, not an emulator.
    offsets = []
    for portrait in range(256):
        ax, cx = portrait << 8, 0
        for _ in range(3):
            carry = (ax >> 15) & 1
            ax = (ax << 1) & 0xFFFF
            cx = ((cx << 1) | carry) & 0xFFFF
        offset = (cx << 16) | ax
        require(offset == portrait * 0x800, "native shift witness mismatch")
        offsets.append(offset)
    # Conditional, normal-return cache witness only, not a real UI/DOS trace.
    labels, next_slot = [255] * 4, 0
    for portrait in range(4):
        require(portrait not in labels, "conditional miss witness")
        labels[next_slot] = portrait
        next_slot = (next_slot + 1) & 3
    require(labels == [0, 1, 2, 3] and 255 not in labels, "no universal FF cache-hit")
    kao_length = len(bodies["KAOGRF.DAT"])
    report = {
        "result": "PASS-BOUNDED-PRIMARY-PORTRAIT-READER-NOT-REACHABILITY",
        "inputHashes": {name: digest(data) for name, data in bodies.items()},
        "toolHash": digest(Path(__file__).read_bytes()),
        "windows": window_hashes, "cacheInitialBytes": at(0x0845, 5).hex(),
        "portraitRecordBytes": 0x800, "kaoFileBytes": kao_length,
        "completeRecordCount": kao_length // 0x800, "tailBytes": kao_length % 0x800,
        "allByteParametersChecked": 256,
        "conditionalNormalCacheWitness": {"requests": [0, 1, 2, 3], "labels": labels,
                                          "subsequent255IsHit": False},
        "miss255": {"requestedOffset": offsets[255], "requestedBytes": 0x800,
                    "completeRecordPresent": offsets[255] + 0x800 <= kao_length},
        "confirmedLocalCode": [
            "07D2 compares AL against four cache labels; a miss replaces round-robin label before read",
            "C350 loads AL from slot-derived general+1; C39C preserves AX through its font step before C3B0->075B; 075B calls BCD which saves AX at BCD/restores at C12 on normal return, then 079D uses that AL",
            "After conditional normal misses 0,1,2,3 the four labels contain no FF; a subsequent FF at 07D2 misses (not a real UI reachability trace)",
            "0824->E38C->F4DF opens literal filename, seeks CX:AX, asks DI bytes at destination BX:SI",
            "Normal F510 read return has no AX-versus-DI byte-count branch; CF flows through LAHF/SAHF and E39D JAE",
            "F505 seek failure skips F512 POP DS; failure stack is not an ordinary successful callback",
        ],
        "limits": "Initial cache labels do not prove initial pixel memory. Static branch arithmetic only; no DOS read/EOF/CF observation, no CPU execution, no pixel rendering. Cache miss255 conditional is not proof G127 is reached. Full caller/indirect writes/cache lifetime and all temporary127 uses remain unclosed. No placeholder/FF-no-image rule, no runtime binding/Q69 certificate.",
    }
    for name, path in inputs.items():
        require(digest(path.read_bytes()) == report["inputHashes"][name], "primary input changed")
    output.mkdir()
    with (output / "windows.txt").open("x", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines) + "\n")
    with (output / "receipt.json").open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ["result", "kaoFileBytes", "completeRecordCount", "tailBytes", "miss255", "allByteParametersChecked"]}))


if __name__ == "__main__":
    main()
