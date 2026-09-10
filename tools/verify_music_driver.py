"""Authenticated original music/settings/shared-SFX slice; no SAVE access."""

import hashlib
import struct

from audio_recovery.recover_music import CPU, ROOT

ki = (ROOT / "KI.EXE").read_bytes()
sound = (ROOT / "SOUND.DAT").read_bytes()
bgm = (ROOT / "BGM.DAT").read_bytes()
assert (
    hashlib.sha256(ki).hexdigest()
    == "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868"
)
assert (
    hashlib.sha256(sound).hexdigest()
    == "b5624388d1bc8f6bb32aeff1d19b1da4c010d7b5a9682a249f1b807c27f2cdba"
)
assert (
    hashlib.sha256(bgm).hexdigest()
    == "7a51c8b9a349b9e088f3796b70c268181c60bcebead70942f00e1621523dedc9"
)


def raw(va, count):
    return ki[va + 0x200 : va + 0x200 + count]


assert raw(0x1756, 9) == "音　　效\0".encode("cp950")
# Both PC wrappers unconditionally enter EB11. The complete bounded gate/VSYNC
# chain below uses registers and ports, never reads CF9 or selects four patches.
assert raw(0xCDE, 18).hex() == "50b80101e82cde58c350b80202e823de58c3"
assert raw(0xEB11, 0x5B).hex() == (
    "518bc88ae5e8450073fbe4610c03e661e83a0072fbe8350073fbe8300072fbe82b0073fb"
    "e46124fce66180f901741ce81b0072fbe8160073fbe8110072fbe80c0073fbfecc75e8"
    "fec975b859c352bada03ec5aa8087402f9c3f8c3"
)
assert raw(0xCF9, 1) == b"\x01"
assert raw(0x5FF6, 4).hex() == "10600500"
assert raw(0x605A, 2).hex() == "a160"  # menu audio entry
assert raw(0x60A1, 4).hex() == "e82ca2c3"  # near call 02D0 (16-bit IP)
assert (
    raw(0x2D0, 37).hex()
    == "502ea0f90c3c0172167704b407cd612ea0f90cfec8d0e0d0e0b40bcd61eb04b408cd6158c3"
)
assert raw(0x2C2, 14).hex() == "502ec6060e02ffb8f209cd6158c3"
assert raw(0x2F5, 26).hex() == "2e38060f02730a50b40acd61a8045875082ea20f02b405cd61c3"
assert raw(0x9309, 12).hex() == "050502020203030304040405"
assert raw(0x9377, 16).hex() == "803ef30c01751c8a26f00c80fc107713"
assert raw(0x93D7, 18).hex() == "80fc01740980fc027503e85d6ec3e8da6ec3"
assert raw(0x99D4, 25).hex() == "2ea04bd3fec03c02730a2ef606350d40750232c00407e85468"
offset, length = struct.unpack_from("<II", bgm, 2 * 8)
song = bgm[offset : offset + length]


def fresh():
    cpu = CPU(song)
    cpu.mem[0x40000 : 0x40000 + len(sound)] = sound
    cpu.run(0x13E)
    cpu.run(0x16F, ds=0x4000, si=0)
    cpu.run(0x1E2, ds=0x2000, si=0)
    cpu.run(0x1F6)
    return cpu


CHANNEL6 = {
    0x30,
    0x33,
    0x50,
    0x53,
    0x70,
    0x73,
    0x90,
    0x93,
    0xF0,
    0xF3,
    0xC6,
    0xA6,
    0xB6,
}
c = fresh()
c.run(0x1DC, ax=3)
assert [c.byte(x) for x in [0x99E, 0x9EE, 0x9EF]] == [6, 13, 3]
start = len(c.writes)
c.run(0x269)
assert [c.byte(x) for x in [0x99E, 0x9EE, 0x9EF]] == [0, 13, 3]
assert not any(reg in CHANNEL6 for _, reg, _ in c.writes[start:])
c.run(0x1DC, ax=3)
start = len(c.writes)
c.run(0x1F6)
assert [c.byte(x) for x in [0x99E, 0x9EE, 0x9EF]] == [2, 0, 0]
assert not any(reg in CHANNEL6 for _, reg, _ in c.writes[start:])
start = len(c.writes)
for tick in range(1, 257):
    c.irq = tick * 256
    c.run(0x7CF)
    if tick < 256:
        assert c.byte(0x9EF) == 256 - tick
        assert len(c.writes) == start
assert c.writes[start:] == [[65536, 0xB6, 0], [65536, 0x53, 63], [65536, 0x50, 63]]

c = fresh()
for _ in range(4):
    c.run(0x3DE)
c.run(0x2A7, ax=0xF2)
for tick in range(1, 23):
    for _ in range(6):
        for ch in range(6):
            if c.byte(0x9A0 + ch):
                c.run(0x75E, ds=0x1000, es=0x2000, bx=ch, si=ch * 2)
    assert bool(c.byte(0x99E) & 2) == (tick < 22)
print(
    "music driver OK: original audio label, PC gate independent of CF9, CF9/day-hour/cache/mode bytes, COM AH7/AH8 channel6/tail, F2 BIOS22"
)
