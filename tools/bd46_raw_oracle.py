"""Bounded raw BD46 test oracle, adapted from the independent occupancy review.
Authenticated KI bytes run in private memory, no KI-call stubs. JSON fixtures on
stdin, results on stdout. Requires capstone (test-only)
no runtime dependency.
Fail closed outside BD46..BFF1 or unsupported instruction/branch, >2M steps.
Models CF/ZF/SF/OF and 8/16-bit wrap, not PF/AF (no consumer here), interrupts,
devices, DOS, arbitrary segment-boundary words or invalid map input. CLD is
safe because DF remains clear and STOSW always increments. Near targets wrap.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

raw = Path(sys.argv[1] if len(sys.argv) > 1 else "E:/Dragon/Dragon/KI.EXE").read_bytes()
assert (
    hashlib.sha256(raw).hexdigest()
    == "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868"
)
md = Cs(CS_ARCH_X86, CS_MODE_16)
code = raw[0x200:0x10200]  # One CS segment; do not leak later file data into ES.


def run(fixture):
    request = fixture["request"]
    plane = request["layer"]
    memory = bytearray(0x100000)
    memory[0x10000 : 0x10000 + len(code)] = code
    registers = {
        "ax": request["current"],
        "bx": 0x1800,
        "cx": (plane << 8) | request["mask"],
        "dx": request["target"],
        "si": 0,
        "di": 0,
        "bp": request["endpointPolicy"],
        "sp": 0xFFFC,
        "cs": 0x1000,
        "ds": 0x5000,
        "es": 0x2000,
        "ss": 0x7000,
        "ip": 0xBD46,
    }
    flags = {"z": 0, "c": 0, "s": 0, "o": 0}
    aliases = {a + b: (a + "x", 8 * (b == "h")) for a in "abcd" for b in "lh"}
    found = None
    executed = set()
    aliases_read = []
    addresses = set()

    def reg(s):
        if s in aliases:
            key, shift = aliases[s]
            return (registers[key] >> shift) & 255
        return registers[s]

    def setreg(s, v):
        if s in aliases:
            key, shift = aliases[s]
            registers[key] = (registers[key] & ~(255 << shift)) | ((v & 255) << shift)
        else:
            registers[s] = v & 65535

    def width(s):
        return 8 if "byte ptr" in s or s in aliases else 16

    def address(s):
        segment = re.search(r"(cs|es|ss|ds):", s)
        segment = segment[1] if segment else "ds"
        expr = s[s.index("[") + 1 : s.index("]")]
        expr = re.sub(r"\b(ax|bx|cx|dx|si|di|bp|sp)\b", lambda m: str(reg(m[0])), expr)
        # Operand expressions originate solely from decoded authenticated KI bytes.
        assert re.fullmatch(r"[0-9a-fx +\-]+", expr), expr
        result = (registers[segment] << 4) + (
            sum(
                int(token.replace(" ", ""), 0)
                for token in re.findall(r"[+-]?\s*(?:0x[0-9a-f]+|[0-9]+)", expr)
            )
            & 65535
        )
        assert 0 <= result < len(memory) - 1
        return result

    def get(s):
        if "[" in s:
            a = address(s)
            return memory[a] if width(s) == 8 else memory[a] | memory[a + 1] << 8
        return reg(s) if s in registers or s in aliases else int(s, 0)

    def word(a, v):
        memory[a] = v & 255
        memory[a + 1] = (v >> 8) & 255

    def put(s, v):
        if "[" in s:
            a = address(s)
            if width(s) == 8:
                memory[a] = v & 255
            else:
                word(a, v)
        else:
            setreg(s, v)

    def push(v):
        registers["sp"] = (registers["sp"] - 2) & 65535
        word((registers["ss"] << 4) + registers["sp"], v)

    def pop():
        a = (registers["ss"] << 4) + registers["sp"]
        v = memory[a] | memory[a + 1] << 8
        registers["sp"] = (registers["sp"] + 2) & 65535
        return v

    # CC31 aliases: D2FC descriptor base=2000:0000; surcharge=2000:2000;
    # D300=2400:0000, exactly D2FC+4000 bytes. Output=5000:1800.
    word(0x1D2FC, 0x2000)
    word(0x1D300, 0x2400)
    word(0x7FFFC, 0)  # Sentinel near return IP
    # Not a stubbed KI call.
    for offset, value in fixture["bytes"]:
        assert 0 <= offset < 0x4000 and 0 <= value <= 255
        memory[0x20000 + offset] = value

    steps = 0
    for _ in range(2000000):
        steps += 1
        ip = registers["ip"]
        if not ip:
            break
        assert registers["cs"] == 0x1000 and 0xBD46 <= ip <= 0xBFF1, hex(ip)
        instruction = next(
            md.disasm(bytes(memory[0x10000 + ip : 0x10000 + ip + 15]), ip, count=1)
        )
        m = instruction.mnemonic
        operands = [s.strip() for s in instruction.op_str.split(",")]
        registers["ip"] = (ip + instruction.size) & 65535
        executed.add(m)
        addresses.add(ip)
        if ip == 0xBFDC:
            aliases_read.append(
                [
                    registers["bx"] // 2,
                    memory[0x22000 + registers["bx"]],
                    memory[0x24000 + registers["bx"]]
                    | memory[0x24001 + registers["bx"]] << 8,
                    memory[0x24000 + (registers["bx"] ^ 0x2000)]
                    | memory[0x24001 + (registers["bx"] ^ 0x2000)] << 8,
                ]
            )
        if ip == 0xBE4A:
            found = registers["dx"]
        if m == "mov":
            put(operands[0], get(operands[1]))
        elif m == "push":
            push(get(operands[0]))
        elif m == "pop":
            put(operands[0], pop())
        elif m == "xchg":
            a, b = get(operands[0]), get(operands[1])
            put(operands[0], b)
            put(operands[1], a)
        elif m in (
            "adc",
            "add",
            "sub",
            "cmp",
            "and",
            "or",
            "xor",
            "test",
            "inc",
            "dec",
            "neg",
            "shl",
            "shr",
        ):
            a = get(operands[0])
            b = get(operands[1]) if len(operands) > 1 else 1
            w = width(operands[0])
            mask = (1 << w) - 1
            sign = 1 << (w - 1)
            oldcarry = flags["c"]
            if m in ("adc", "add", "inc"):
                v = a + b + (oldcarry if m == "adc" else 0)
                flags["c"] = v > mask
                flags["o"] = not bool((a ^ b) & sign) and bool((a ^ v) & sign)
            elif m in ("sub", "cmp", "dec"):
                v = a - b
                flags["c"] = a < b
                flags["o"] = bool((a ^ b) & sign) and bool((a ^ v) & sign)
            elif m == "neg":
                v = -a
                flags["c"] = a != 0
                flags["o"] = a == sign
            elif m in ("and", "test"):
                v = a & b
                flags["c"] = flags["o"] = 0
            elif m == "or":
                v = a | b
                flags["c"] = flags["o"] = 0
            elif m == "xor":
                v = a ^ b
                flags["c"] = flags["o"] = 0
            elif m == "shl":
                assert b == 1
                v = a << b
                flags["c"] = bool(a & (1 << (w - b)))
                flags["o"] = bool(v & sign) ^ flags["c"]
            else:
                assert b == 1
                v = a >> b
                flags["c"] = bool(a & (1 << (b - 1)))
                flags["o"] = bool(a & sign)
            v &= mask
            flags["z"] = v == 0
            flags["s"] = bool(v & sign)
            if m in ("inc", "dec"):
                flags["c"] = oldcarry
            if m not in ("cmp", "test"):
                put(operands[0], v)
        elif m.startswith("j"):
            condition = {
                "jmp": 1,
                "je": flags["z"],
                "jne": not flags["z"],
                "jb": flags["c"],
                "jae": not flags["c"],
                "ja": not flags["c"] and not flags["z"],
                "jbe": flags["c"] or flags["z"],
                "jl": flags["s"] != flags["o"],
                "jge": flags["s"] == flags["o"],
            }[m]
            if condition:
                registers["ip"] = get(operands[0]) & 65535
        elif m == "call":
            push(registers["ip"])
            registers["ip"] = get(operands[0]) & 65535
        elif m == "ret":
            registers["ip"] = pop()
        elif m in ("stosw", "rep stosw"):
            for _ in range(registers["cx"] if m.startswith("rep") else 1):
                word((registers["es"] << 4) + registers["di"], registers["ax"])
                registers["di"] = (registers["di"] + 2) & 65535
            if m.startswith("rep"):
                registers["cx"] = 0
        elif m == "cld":
            pass
        elif m == "clc":
            flags["c"] = 0
        elif m == "stc":
            flags["c"] = 1
        else:
            raise RuntimeError(f"unsupported instruction at {ip:04x}: {m}")
    else:
        raise RuntimeError("2,000,000 decoded-instruction bound exceeded")
    count = registers["ax"] & 255
    words = (
        []
        if flags["c"]
        else [
            memory[0x51800 + i * 2] | memory[0x51801 + i * 2] << 8 for i in range(count)
        ]
    )
    assert registers["sp"] == 0xFFFE
    return {
        "name": fixture["name"],
        "carry": bool(flags["c"]),
        "count": count,
        "words": words,
        "distance": found,
        "instructions": steps,
        "aliases": aliases_read,
        "workspace": hashlib.sha256(memory[0x24000:0x28800]).hexdigest(),
        "addresses": sorted(addresses),
        "instruction_subset": sorted(executed),
    }


if __name__ == "__main__":
    print(json.dumps([run(fixture) for fixture in json.load(sys.stdin)]))
