"""Read-only YNSOUND original-code interpreter and lossless OPL register / note export.
No DOS filesystem, no save access, no downloads. Python + existing capstone only.
COM addresses = file+0x100. Offline event times ignore instruction/OUT latency.
Outputs SMF note skeleton (no speculative GM patches), VGM OPL3 and JSON evidence.
"""

import hashlib
import json
import math
import re
import struct
from pathlib import Path

from capstone import CS_ARCH_X86, CS_MODE_16, Cs

ROOT = Path(__file__).resolve().parents[3] / "Dragon"
OUT = Path(__file__).resolve().parents[2] / "web" / "grf" / "music"
PIT = 1193182
DIV = 256
Y = (ROOT / "YNSOUND.COM").read_bytes()
assert (
    hashlib.sha256(Y).hexdigest()
    == "e2c6a6a8576c4f2a96b7e3f156d7f48c9570ae03539fe9367adb78aebb364fa1"
)
md = Cs(CS_ARCH_X86, CS_MODE_16)


class CPU:
    def __init__(self, song):
        self.mem = bytearray(0x50000)
        self.mem[0x10100 : 0x10100 + len(Y)] = Y
        self.mem[0x20000 : 0x20000 + len(song)] = song
        self.r = {
            "ax": 0,
            "bx": 0,
            "cx": 0,
            "dx": 0,
            "si": 0,
            "di": 0,
            "bp": 0,
            "sp": 0xFFFE,
            "cs": 0x1000,
            "ds": 0x2000,
            "es": 0x2000,
            "ss": 0x3000,
            "ip": 0,
        }
        self.f = {"z": 0, "c": 0, "s": 0, "o": 0}
        self.cache = {}
        self.irq = 0
        self.writes = []
        self.portreg = {}
        self.loops = [[] for _ in range(6)]
        self.commands = {}
        self.notes = []
        self.executed = set()
        self.steps = 0

    def reg(self, s):
        return (
            (self.r[s[0] + "x"] >> (8 if s[1] == "h" else 0)) & 255
            if s in ["al", "ah", "bl", "bh", "cl", "ch", "dl", "dh"]
            else self.r[s]
        )

    def width(self, s):
        return (
            8
            if "byte ptr" in s or s in ["al", "ah", "bl", "bh", "cl", "ch", "dl", "dh"]
            else 16
        )

    def addr(self, s):
        seg = re.search(r"(cs|ds|es|ss):", s)
        seg = seg[1] if seg else ("ss" if "bp" in s else "ds")
        expr = s[s.index("[") + 1 : s.index("]")]
        expr = re.sub(
            r"\b(ax|bx|cx|dx|si|di|bp|sp)\b", lambda m: str(self.reg(m[0])), expr
        )
        assert re.fullmatch(r"[0-9a-fx +\-]+", expr), expr
        n = sum(
            int(t.replace(" ", ""), 0)
            for t in re.findall(r"[+-]?\s*(?:0x[0-9a-f]+|[0-9]+)", expr)
        )
        return (self.r[seg] << 4) + (n & 65535)

    def get(self, s):
        if "[" in s:
            a = self.addr(s)
            return (
                self.mem[a]
                if self.width(s) == 8
                else self.mem[a] | self.mem[a + 1] << 8
            )
        return (
            self.reg(s)
            if s in self.r or s in ["al", "ah", "bl", "bh", "cl", "ch", "dl", "dh"]
            else int(s, 0)
        )

    def put(self, s, v):
        w = self.width(s)
        v &= (1 << w) - 1
        if "[" in s:
            a = self.addr(s)
            self.mem[a] = v & 255
            if w == 16:
                self.mem[a + 1] = v >> 8
        elif w == 8:
            sh = 8 if s[1] == "h" else 0
            k = s[0] + "x"
            self.r[k] = (self.r[k] & ~(255 << sh)) | (v << sh)
        else:
            self.r[s] = v

    def push(self, v):
        self.r["sp"] = (self.r["sp"] - 2) & 65535
        a = (self.r["ss"] << 4) + self.r["sp"]
        self.mem[a : a + 2] = struct.pack("<H", v & 65535)

    def pop(self):
        a = (self.r["ss"] << 4) + self.r["sp"]
        v = int.from_bytes(self.mem[a : a + 2], "little")
        self.r["sp"] = (self.r["sp"] + 2) & 65535
        return v

    def byte(self, a):
        return self.mem[0x10000 + a]

    def run(self, ip, **regs):
        self.r.update(regs)
        self.r["ip"] = ip
        self.push(0)
        for _step in range(100000):
            ip = self.r["ip"]
            if ip == 0:
                return
            assert 0x13E <= ip < 0x97A, hex(ip)
            if ip not in self.cache:
                ins = next(
                    md.disasm(
                        bytes(self.mem[0x10000 + ip : 0x10000 + ip + 15]), ip, count=1
                    )
                )
                self.cache[ip] = (
                    ins.mnemonic,
                    [s.strip() for s in ins.op_str.split(",")],
                    ins.size,
                )
            m, op, size = self.cache[ip]
            self.executed.add(ip)
            self.steps += 1
            self.r["ip"] = (ip + size) & 65535
            if ip == 0x4E8:
                self.loops[self.r["bx"]].append(self.irq)
            if ip == 0x3FB:
                pc = self.r["di"]
                v = self.mem[0x20000 + pc]
                arg = self.mem[0x20001 + pc]
                if v >= 128:
                    self.commands[f"{v:02x}"] = self.commands.get(f"{v:02x}", 0) + 1
                else:
                    self.notes.append([self.irq, self.r["bx"], pc, v, arg])
            if m == "mov":
                self.put(op[0], self.get(op[1]))
            elif m == "push":
                self.push(self.get(op[0]))
            elif m == "pop":
                self.put(op[0], self.pop())
            elif m == "xchg":
                a, b = self.get(op[0]), self.get(op[1])
                self.put(op[0], b)
                self.put(op[1], a)
            elif m in (
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
                a = self.get(op[0])
                b = self.get(op[1]) if len(op) > 1 else 1
                w = self.width(op[0])
                mask = (1 << w) - 1
                sign = 1 << (w - 1)
                old = self.f["c"]
                if m in ("add", "inc"):
                    v = a + b
                    self.f["c"] = v > mask
                    self.f["o"] = not bool((a ^ b) & sign) and bool((a ^ v) & sign)
                elif m in ("sub", "cmp", "dec"):
                    v = a - b
                    self.f["c"] = a < b
                    self.f["o"] = bool((a ^ b) & sign) and bool((a ^ v) & sign)
                elif m == "neg":
                    v = -a
                    self.f["c"] = a != 0
                    self.f["o"] = a == sign
                elif m in ("and", "test"):
                    v = a & b
                    self.f["c"] = self.f["o"] = 0
                elif m == "or":
                    v = a | b
                    self.f["c"] = self.f["o"] = 0
                elif m == "xor":
                    v = a ^ b
                    self.f["c"] = self.f["o"] = 0
                elif m == "shl":
                    if b == 0:
                        continue
                    v = a << b
                    self.f["c"] = bool(a & (1 << (w - b)))
                    self.f["o"] = bool(v & sign) ^ self.f["c"] if b == 1 else 0
                else:
                    if b == 0:
                        continue
                    v = a >> b
                    self.f["c"] = bool(a & (1 << (b - 1)))
                    self.f["o"] = bool(a & sign) if b == 1 else 0
                v &= mask
                self.f["z"] = v == 0
                self.f["s"] = bool(v & sign)
                if m in ("inc", "dec"):
                    self.f["c"] = old
                if m not in ("cmp", "test"):
                    self.put(op[0], v)
            elif m.startswith("j"):
                f = self.f
                c = {
                    "jmp": 1,
                    "je": f["z"],
                    "jne": not f["z"],
                    "jb": f["c"],
                    "jae": not f["c"],
                    "ja": not f["c"] and not f["z"],
                    "jbe": f["c"] or f["z"],
                    "jl": f["s"] != f["o"],
                    "jge": f["s"] == f["o"],
                    "jg": not f["z"] and f["s"] == f["o"],
                    "jle": f["z"] or f["s"] != f["o"],
                }[m]
                if c:
                    self.r["ip"] = self.get(op[0]) & 65535
            elif m == "call":
                self.push(self.r["ip"])
                self.r["ip"] = self.get(op[0]) & 65535
            elif m == "ret":
                self.r["ip"] = self.pop()
            elif m == "loop":
                self.r["cx"] = (self.r["cx"] - 1) & 65535
                if self.r["cx"]:
                    self.r["ip"] = self.get(op[0]) & 65535
            elif m in ("stosw", "rep stosw"):
                for _ in range(self.r["cx"] if m.startswith("rep") else 1):
                    a = (self.r["es"] << 4) + self.r["di"]
                    self.mem[a : a + 2] = struct.pack("<H", self.r["ax"])
                    self.r["di"] = (self.r["di"] + 2) & 65535
                if m.startswith("rep"):
                    self.r["cx"] = 0
            elif m == "cld":
                pass
            elif m == "out":
                port = self.get(op[0])
                v = self.get(op[1])
                assert port in {0x220, 0x221, 0x222, 0x223}
                if not port & 1:
                    self.portreg[port] = v
                else:
                    self.writes.append(
                        [
                            self.irq,
                            (0x100 if port == 0x223 else 0) + self.portreg[port - 1],
                            v,
                        ]
                    )
            elif m == "in":
                self.put(
                    op[0], 0
                )  # hardware status is read only for bus delays, never tested
            else:
                raise RuntimeError(f"{ip:04x}: {m} {op}")
        raise RuntimeError("instruction bound")


def vlq(v):
    b = [v & 127]
    v >>= 7
    while v:
        b.insert(0, (v & 127) | 128)
        v >>= 7
    return bytes(b)


def midi(cpu, end):
    # SMPTE 25 fps * 40 subframes = 1000 ticks/sec. No guessed tempo or GM program.
    regs = {}
    active = {}
    data = []
    pitch_errors = []
    # Explicit +/-2-semitone pitch-bend sensitivity on each independent voice.
    for ch in range(6):
        for cc, value in [(101, 0), (100, 0), (6, 2), (38, 0), (101, 127), (100, 127)]:
            data.append((0, bytes([0xB0 + ch, cc, value])))
    for t, r, v in cpu.writes:
        regs[r] = v
        c = r & 255
        ch = (r >> 8) * 3 + c - 0xB0
        if 0xB0 <= c <= 0xB2:
            at = round(t * DIV / PIT * 1000)
            if ch in active:
                data.append((at, bytes([0x80 + ch, active.pop(ch), 0])))
            if v & 32:
                fnum = ((v & 3) << 8) | regs.get(r - 16, 0)
                block = (v >> 2) & 7
                hz = fnum * (3579545 / 72) * 2 ** (block - 20)
                mf = 69 + 12 * math.log2(hz / 440)
                note = round(mf)
                assert 0 <= note <= 127
                pitch_errors.append((mf - note) * 100)
                bend = max(0, min(16383, round(8192 + (mf - note) * 4096)))
                data.append((at, bytes([0xE0 + ch, bend & 127, bend >> 7])))
                active[ch] = note
                data.append((at, bytes([0x90 + ch, note, 96])))
    for ch, n in active.items():
        data.append((round(end * DIV / PIT * 1000), bytes([0x80 + ch, n, 0])))
    track = bytearray()
    prev = 0
    name = b"OPL note skeleton; original FM timbres not General MIDI"
    track += b"\x00\xff\x03" + vlq(len(name)) + name
    for t, b in data:
        track += vlq(t - prev) + b
        prev = t
    track += b"\x00\xff\x2f\x00"
    return b"MThd" + struct.pack(">IHHH", 6, 0, 1, 0xE728) + b"MTrk" + struct.pack(
        ">I", len(track)
    ) + track, {
        "noteOnCount": sum(1 for _, b in data if b[0] & 0xF0 == 0x90),
        "roundingCentsRange": [min(pitch_errors), max(pitch_errors)]
        if pitch_errors
        else [],
    }


def vgm(cpu, end):
    stream = bytearray()
    last = 0

    def wait(n):
        while n:
            k = min(n, 65535)
            stream.extend(b"\x61" + struct.pack("<H", k))
            n -= k

    for t, r, v in cpu.writes:
        now = round(t * DIV / PIT * 44100)
        wait(now - last)
        last = now
        stream.extend(bytes([0x5F if r & 256 else 0x5E, r & 255, v]))
    final = round(end * DIV / PIT * 44100)
    wait(final - last)
    stream.append(0x66)
    h = bytearray(0x100)
    h[:4] = b"Vgm "
    struct.pack_into("<I", h, 8, 0x171)
    struct.pack_into("<I", h, 0x34, 0xCC)
    struct.pack_into("<I", h, 0x5C, 14318180)
    struct.pack_into("<I", h, 0x18, final)
    struct.pack_into("<I", h, 4, len(h) + len(stream) - 4)
    return h + stream


def recover(name, song):
    cpu = CPU(song)
    cpu.run(0x13E)
    cpu.run(0x1E2, ds=0x2000, si=0)
    cpu.run(0x1F6)
    divider = 1
    bios = 0
    tempos = []
    old = None
    # First complete loop per six streams; guard 10 minutes, fail closed.
    for irq in range(1, 600 * PIT // DIV):
        cpu.irq = irq
        divider = (divider - 1) & 255
        if divider == 0:
            divider = cpu.byte(0xB68)
            cpu.run(0x3DE)
            tempo = cpu.byte(0xB68)
            if tempo != old:
                tempos.append([irq, tempo])
                old = tempo
        bios = (bios - 1) & 255
        if bios == 0:
            # INT1C 071D..073D performs six complete fade passes (not one).
            for _ in range(6):
                for ch in range(6):
                    if cpu.byte(0x9A0 + ch):
                        cpu.run(0x75E, ds=0x1000, es=0x2000, bx=ch, si=ch * 2)
        if all(cpu.loops):
            break
    else:
        raise RuntimeError(name + " has no complete loop in 600 seconds")
    end = irq
    (OUT / (name + ".mid")).write_bytes(midi(cpu, end)[0])
    (OUT / (name + ".vgm")).write_bytes(vgm(cpu, end))
    (OUT / (name + ".events.json")).write_text(
        json.dumps({"writes": cpu.writes, "notes": cpu.notes}, separators=(",", ":"))
    )
    result = {
        "name": name,
        "bytes": len(song),
        "sha256": hashlib.sha256(song).hexdigest(),
        "seconds": end * DIV / PIT,
        "endIRQ": end,
        "tempoChangesIRQAndDivider": tempos,
        "firstLoopIRQByVoice": [x[0] for x in cpu.loops],
        "commands": cpu.commands,
        "patchTable": struct.unpack_from("<H", song, 2)[0],
        "auxTable": struct.unpack_from("<H", song, 4)[0],
        "streams": list(struct.unpack_from("<6H", song, 16)),
        "registerWrites": len(cpu.writes),
        "decodedInstructions": cpu.steps,
        "executedCOMAddresses": [hex(x) for x in sorted(cpu.executed)],
        **midi(cpu, end)[1],
    }
    print(
        name,
        round(result["seconds"], 3),
        result["firstLoopIRQByVoice"],
        tempos,
        flush=True,
    )
    return result


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    bgm = (ROOT / "BGM.DAT").read_bytes()
    for i, (off, n) in enumerate(struct.iter_unpack("<II", bgm[:88])):
        r = recover(f"BGM_{i:02}", bgm[off : off + n])
        r.update(archiveOffset=off, archiveLength=n)
        results.append(r)
    for name in ["OPENBGM", "ENDBGM", "OVERBGM"]:
        results.append(recover(name, (ROOT / (name + ".DAT")).read_bytes()))
    (OUT / "manifest.json").write_text(
        json.dumps(
            {
                "sources": {
                    n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest()
                    for n in [
                        "KI.EXE",
                        "YNSOUND.COM",
                        "BGM.DAT",
                        "OPENBGM.DAT",
                        "ENDBGM.DAT",
                        "OVERBGM.DAT",
                    ]
                },
                "tracks": results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
