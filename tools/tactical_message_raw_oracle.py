"""Test-only bounded execution of authenticated A12A and complete close callees.
No KI-call stubs, DOS/devices, RNG, or production import. Models 16-bit registers,
byte aliases, stack and private segmented memory. ZF is the only flag consumed
in these exact allowed ranges; other flags are deliberately not claimed.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

raw = (Path(__file__).resolve().parents[2] / "Dragon" / "KI.EXE").read_bytes()
assert hashlib.sha256(raw).hexdigest() == "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868"
code = raw[0x200:0x10200]
md = Cs(CS_ARCH_X86, CS_MODE_16)
RANGES = [(0xA12A, 0xA156), (0xC3B8, 0xC3FF), (0xC4A6, 0xC4D2), (0xD9D1, 0xDA1C), (0xE41B, 0xE453)]


def run(fixture):
    mem = bytearray(0x100000)
    mem[0x10000:0x20000] = code
    regs = {"ax": 0xABCD, "bx": 0x1234, "cx": 0x5678, "dx": 0x9012, "si": 0, "di": 0,
            "sp": 0xFFFC, "cs": 0x1000, "ss": 0x7000, "ds": 0x4000, "es": 0x5000, "ip": 0xA12A}
    aliases = {a + b: (a + "x", 8 * (b == "h")) for a in "abcd" for b in "lh"}
    zero = False
    trace, closes = [], []

    def reg(name):
        if name in aliases:
            key, shift = aliases[name]
            return (regs[key] >> shift) & 255
        return regs[name]

    def width(operand):
        return 8 if operand in aliases or "byte ptr" in operand else 16

    def address(operand):
        segment = re.search(r"(cs|ds|ss|es):", operand)
        segment = segment[1] if segment else "ds"
        expr = operand[operand.index("[") + 1:operand.index("]")]
        expr = re.sub(r"\b(ax|bx|cx|dx|si|di|bp|sp)\b", lambda m: str(reg(m[0])), expr)
        assert re.fullmatch(r"[0-9a-fx +\-]+", expr), expr
        offset = sum(int(t.replace(" ", ""), 0) for t in re.findall(r"[+-]?\s*(?:0x[0-9a-f]+|[0-9]+)", expr)) & 65535
        return (regs[segment] << 4) + offset

    def word(addr, value):
        mem[addr:addr + 2] = (value & 65535).to_bytes(2, "little")

    def get(operand):
        if "[" in operand:
            addr = address(operand)
            return int.from_bytes(mem[addr:addr + width(operand) // 8], "little")
        return reg(operand) if operand in regs or operand in aliases else int(operand, 0)

    def put(operand, value):
        value &= (1 << width(operand)) - 1
        if "[" in operand:
            addr = address(operand)
            mem[addr:addr + width(operand) // 8] = value.to_bytes(width(operand) // 8, "little")
        elif operand in aliases:
            key, shift = aliases[operand]
            regs[key] = (regs[key] & ~(255 << shift)) | (value << shift)
        else:
            regs[operand] = value

    def push(value):
        regs["sp"] = (regs["sp"] - 2) & 65535
        word((regs["ss"] << 4) + regs["sp"], value)

    def pop():
        addr = (regs["ss"] << 4) + regs["sp"]
        value = int.from_bytes(mem[addr:addr + 2], "little")
        regs["sp"] = (regs["sp"] + 2) & 65535
        return value

    word(0x1D318, fixture["counter"])
    for addr, value in zip([0xD322, 0xD324, 0xD326], fixture["markers"], strict=True):
        word(0x10000 + addr, value)
    word(0x1E15C, 0x2000)  # display cell heap, not CS scratch
    word(0x1E479, 0x3000)  # E41B hit map heap
    word(0x1E47B, 0)
    word(0x7FFFC, 0)  # return sentinel
    steps = 0
    for _ in range(20000):
        steps += 1
        ip = regs["ip"]
        if ip == 0:
            break
        assert any(a <= ip < b for a, b in RANGES), hex(ip)
        instruction = next(md.disasm(bytes(mem[0x10000 + ip:0x10000 + ip + 15]), ip, count=1))
        op = instruction.mnemonic
        operands = [x.strip() for x in instruction.op_str.split(",")]
        regs["ip"] = (ip + instruction.size) & 65535
        if ip in [0xA133, 0xA13F, 0xA14B, 0xA155]:
            trace.append([ip, regs["ax"]])
        if ip == 0xC3B8:
            closes.append(reg("cl"))
        if ip == 0xC4A6:
            closes.append(2)
        if op == "mov":
            put(operands[0], get(operands[1]))
        elif op == "push":
            push(get(operands[0]))
        elif op == "pop":
            put(operands[0], pop())
        elif op == "xchg":
            a, b = map(get, operands)
            put(operands[0], b)
            put(operands[1], a)
        elif op in ["inc", "dec", "add", "cmp", "and", "or", "xor", "shl", "shr"]:
            a = get(operands[0])
            b = get(operands[1]) if len(operands) == 2 else 1
            if op in ["add", "inc"]:
                value = a + b
            elif op in ["cmp", "dec"]:
                value = a - b
            elif op == "and":
                value = a & b
            elif op == "or":
                value = a | b
            elif op == "xor":
                value = a ^ b
            elif op == "shl":
                assert b == 1
                value = a << 1
            else:
                assert b == 1
                value = a >> 1
            value &= (1 << width(operands[0])) - 1
            zero = value == 0
            if op != "cmp":
                put(operands[0], value)
        elif op in ["je", "jne", "jmp"]:
            if op == "jmp" or zero == (op == "je"):
                regs["ip"] = int(operands[0], 0) & 65535
        elif op == "call":
            push(regs["ip"])
            regs["ip"] = int(operands[0], 0) & 65535
        elif op == "ret":
            regs["ip"] = pop()
        else:
            raise AssertionError((hex(ip), op, operands))
    else:
        raise AssertionError("message oracle step bound exceeded")
    assert regs["sp"] == 0xFFFE
    return {"counter": get("word ptr cs:[0xd318]"),
            "markers": [get(f"word ptr cs:[{hex(a)}]") for a in [0xD322, 0xD324, 0xD326]],
            "trace": trace, "closes": closes, "steps": steps}


if __name__ == "__main__":
    print(json.dumps([run(f) for f in json.load(sys.stdin)]))
