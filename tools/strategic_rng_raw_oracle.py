"""Bounded EC82/ECE0 execution; fixed KI whitelist, private memory, RTC input only.
Not a general CPU/DOS emulator. No KI call stubs and no SAVE access.
"""

import hashlib
import json
import re
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

KI = Path(__file__).resolve().parents[2] / "Dragon" / "KI.EXE"
DIGEST = "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868"


class RngMachine:
    def __init__(self, raw, clock):
        self.memory = bytearray(0x100000)
        self.memory[0x10000:0x20000] = raw[0x200:0x10200]
        self.regs = {
            "ax": 0xABCD,
            "bx": 0x4567,
            "cx": 0xAAAA,
            "dx": 0x5555,
            "si": 0,
            "di": 0,
            "bp": 0,
            "sp": 0xFFFC,
            "cs": 0x1000,
            "ss": 0x7000,
            "ds": 0x4000,
            "es": 0x5000,
            "ip": 0,
        }
        self.aliases = {a + b: (a + "x", 8 * (b == "h")) for a in "abcd" for b in "lh"}
        self.clock = clock
        self.zf = False
        self.steps = 0
        self.swaps = []
        self.writes = set()
        self.decoder = Cs(CS_ARCH_X86, CS_MODE_16)

    def reg(self, operand):
        if operand in self.aliases:
            key, shift = self.aliases[operand]
            return (self.regs[key] >> shift) & 255
        return self.regs[operand]

    def width(self, operand):
        return 8 if operand in self.aliases or "byte ptr" in operand else 16

    def address(self, operand):
        segment = re.search(r"(cs|ss|ds|es):", operand)
        segment = segment[1] if segment else ("ss" if "bp" in operand else "ds")
        expr = operand[operand.index("[") + 1 : operand.index("]")]
        expr = re.sub(
            r"\b(ax|bx|cx|dx|si|di|bp|sp)\b",
            lambda match: str(self.reg(match[0])),
            expr,
        )
        assert re.fullmatch(r"[0-9a-fx +\-]+", expr)
        offset = (
            sum(
                int(term.replace(" ", ""), 0)
                for term in re.findall(r"[+-]?\s*(?:0x[0-9a-f]+|[0-9]+)", expr)
            )
            & 65535
        )
        return (self.regs[segment] << 4) + offset

    def get(self, operand):
        if "[" in operand:
            address = self.address(operand)
            return int.from_bytes(
                self.memory[address : address + self.width(operand) // 8], "little"
            )
        return (
            self.reg(operand)
            if operand in self.regs or operand in self.aliases
            else int(operand, 0)
        )

    def put(self, operand, value):
        value &= (1 << self.width(operand)) - 1
        if "[" in operand:
            address = self.address(operand)
            self.memory[address : address + self.width(operand) // 8] = value.to_bytes(
                self.width(operand) // 8, "little"
            )
            self.writes.add(address)
        elif operand in self.aliases:
            key, shift = self.aliases[operand]
            self.regs[key] = (self.regs[key] & ~(255 << shift)) | (value << shift)
        else:
            self.regs[operand] = value

    def push(self, value):
        self.regs["sp"] = (self.regs["sp"] - 2) & 65535
        address = (self.regs["ss"] << 4) + self.regs["sp"]
        self.memory[address : address + 2] = (value & 65535).to_bytes(2, "little")

    def pop(self):
        address = (self.regs["ss"] << 4) + self.regs["sp"]
        value = int.from_bytes(self.memory[address : address + 2], "little")
        self.regs["sp"] = (self.regs["sp"] + 2) & 65535
        return value

    def run(self, entry):
        self.regs["ip"], self.regs["sp"] = entry, 0xFFFC
        self.memory[0x7FFFC:0x7FFFE] = b"\0\0"
        for _ in range(10000):
            ip = self.regs["ip"]
            if ip == 0:
                assert self.regs["sp"] == 0xFFFE
                return
            assert self.regs["cs"] == 0x1000 and 0xEC82 <= ip < 0xECFC, hex(ip)
            ins = next(
                self.decoder.disasm(
                    bytes(self.memory[0x10000 + ip : 0x10000 + ip + 15]), ip, count=1
                )
            )
            op, args = ins.mnemonic, [arg.strip() for arg in ins.op_str.split(",")]
            self.regs["ip"] = (ip + ins.size) & 65535
            self.steps += 1
            if ip == 0xECB6:
                self.swaps.append((self.regs["bx"], self.regs["dx"]))
            if op == "mov":
                self.put(args[0], self.get(args[1]))
            elif op == "push":
                self.push(self.get(args[0]))
            elif op == "pop":
                self.put(args[0], self.pop())
            elif op == "xchg":
                left, right = map(self.get, args)
                self.put(args[0], right)
                self.put(args[1], left)
            elif op in ("inc", "dec", "add", "xor", "shl"):
                left = self.get(args[0])
                right = self.get(args[1]) if len(args) == 2 else 1
                value = (
                    left + right
                    if op in ("inc", "add")
                    else left - right
                    if op == "dec"
                    else left ^ right
                    if op == "xor"
                    else left << right
                )
                value &= (1 << self.width(args[0])) - 1
                self.zf = value == 0
                self.put(args[0], value)
            elif op == "jne":
                if not self.zf:
                    self.regs["ip"] = self.get(args[0]) & 65535
            elif op == "ret":
                self.regs["ip"] = self.pop()
            elif op == "xlatb":
                self.put(
                    "al",
                    self.memory[
                        (self.regs["ds"] << 4)
                        + ((self.regs["bx"] + self.reg("al")) & 65535)
                    ],
                )
            elif op == "int":
                assert (
                    self.get(args[0]) == 0x1A
                    and self.reg("ah") == 2
                    and self.reg("al") == 0
                )
                for key, value in zip(("ch", "cl", "dh"), self.clock, strict=True):
                    self.put(key, value)
            else:
                raise AssertionError((hex(ip), op, args))
        raise AssertionError("instruction bound exceeded")


def main():
    raw = KI.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == DIGEST
    results = []
    for clock in [
        (0, 0, 0),
        (0, 0, 1),
        (1, 2, 3),
        (0x12, 0x34, 0x56),
        (0x23, 0x59, 0x59),
    ]:
        machine = RngMachine(raw, clock)
        machine.run(0xEC82)
        assert machine.steps == 3365 and len(machine.swaps) == 256
        table = list(machine.memory[0x1ECFE:0x1EDFE])
        state = list(machine.memory[0x1ECFC:0x1ECFE])
        assert sorted(table) == list(range(256))
        assert machine.memory[0x1EDFE] == 0x1E and 0x1EDFE not in machine.writes
        draws = []
        for _ in range(32):
            machine.run(0xECE0)
            draws.append(machine.reg("al"))
        results.append(
            {
                "clock": dict(zip(("ch", "cl", "dh"), clock, strict=True)),
                "table": table,
                "addend": state[0],
                "index": state[1],
                "draws": draws,
                "final": list(machine.memory[0x1ECFC:0x1ECFE]),
            }
        )
    print(
        json.dumps(
            {
                "sha256": DIGEST,
                "scope": "EC82/ECE0 only; RTC supplied",
                "results": results,
            }
        )
    )


if __name__ == "__main__":
    main()
