"""Independent authenticated KI/TALK/CFG fixtures (not CPU or DOS execution)."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT.parent / "Dragon" / "KI.EXE").read_bytes()
talk = (ROOT.parent / "Dragon" / "TALK.DAT").read_bytes()
scripts = (ROOT.parent / "Dragon" / "BATTLE.DAT").read_bytes()
assert hashlib.sha256(raw).hexdigest() == "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868"
assert hashlib.sha256(talk).hexdigest() == "cb0cdba4f1c507243cbc4e636bc3fcf698a4f88fe3a0d784cc579e5548e6fcaf"
ki = raw[0x200:]


def check(address, literal):
    expected = bytes.fromhex(literal)
    assert ki[address:address + len(expected)] == expected, hex(address)


def near(address):
    assert ki[address] == 0xE8
    return (address + 3 + int.from_bytes(ki[address + 1:address + 3], "little", signed=True)) & 0xFFFF


check(0xC324, "2e8b1e2e0d81eb4022d1eb81c34042")
check(0xC342, "80fa01750287df53578bfc8a671e8a4701")
check(0xC359, "2e8b1618d380c23c2e899722d3")
check(0x0763, "81f99601721381e99601d1e1d1e1d1e102cc80d50081c19601d1e1")
check(0x097E, "474783ea30c3")
check(0xA12A, "2efe0618d32ea118d3")
check(0xC47B, "8b45182e3b0605c473142ea305c4bb1000e843002ea118d304142ea326d3")
check(0xC415, "81f90001721181f9e001730b83f9207306")  # literal contradictory cursor gate; no guessed correction
check(0xC3FF, "aaf9b16aabd70000")
check(0x6E92, "8bfe81ee4042d1e68bded1e3d1e388bc4222")
check(0xC126, "d1e8d1e8d1e8")  # alleged C127 CALL is mid-instruction
check(0xA7F9, "fba910aa")  # indirect command9/10, NOT absent because no direct CALL
assert [near(a) for a in [0xC315, 0xC394, 0xC3B0, 0xC453, 0xC476, 0xC4F6]] == [0x01B4, 0x01DB, 0x075B, 0x0BCD, 0x06FD, 0x0AAA]
for base, expected in [(0xC048, [0xC01C, 0xC01C]), (0xC086, [0xC30D, 0xC30D])]:
    assert [int.from_bytes(ki[base + i * 2:base + i * 2 + 2], "little") for i in [27, 28]] == expected
assert int.from_bytes(ki[0xC086 + 58:0xC086 + 60], "little") == 0xC4A6

catalog = json.loads((ROOT / "web" / "battle_talk.json").read_text(encoding="utf-8"))
assert catalog["sourceSha256"] == hashlib.sha256(talk).hexdigest()
# Independent pointer/record decode, not exporter import or generated hash oracle.
for key, entry in catalog["records"].items():
    index = int(key)
    pointer = int.from_bytes(talk[2 * index:2 * index + 2], "little")
    cursor = pointer
    lines = []
    while talk[cursor:cursor + 2] != b"\0\0":
        end = talk.index(b"\0", cursor)
        lines.append(talk[cursor:end].decode("big5", "strict"))
        cursor = end
        if talk[cursor + 1] != 0:
            cursor += 1
    assert entry == {"offset": pointer, "lines": lines}, index
assert len(catalog["records"]) == 424
assert catalog["records"]["670"] == {"offset": 0x56F7, "lines": ["\\6啊啊，我就是\\1，", "來一決勝負！！！"]}
assert catalog["records"]["678"]["offset"] == 0x5811
assert catalog["records"]["622"]["lines"] == ["擺出陣形！！"]

# All32 blocks, starts0 and3 (A2E8 skip), both Jcc branches. This is a CFG
# overapproximation, not a claim that every branch/selector runs in one battle.
assert len(scripts) == 8192
exported = json.loads((ROOT / "web" / "battle_scripts.json").read_text())
commands = {3: set(), 13: set(), 16: set()}
message_sites = 0
for block in range(32):
    part = scripts[block * 256:(block + 1) * 256]
    words = [int.from_bytes(part[p:p + 2], "little") for p in range(0, 256, 2)]
    assert words == exported[block]
    pending, seen = [0, 3], set()
    while pending:
        pc = pending.pop()
        if pc in seen:
            continue
        assert 0 <= pc < 128
        seen.add(pc)
        instruction = words[pc]
        opcode, cc, ah = instruction & 31, (instruction >> 5) & 7, instruction >> 8
        assert opcode <= 18
        if opcode in commands:
            commands[opcode].add(ah)
        if opcode == 16:
            message_sites += 1
        if opcode == 10:
            target = words[pc + 1]
            pending.append(pc + 1 if target & 255 else target >> 8)
            if cc:
                pending.append(pc + 1 if target & 255 else pc + 2)
        else:
            pending.append(pc + 1)
assert commands == {3: set(range(6)), 13: set(range(5)), 16: set(range(21))}
assert message_sites == 200
print("tactical TALK raw OK: KI wrapped calls/stack/markers/input/wall, 424 records, 32-block CFG/200 message sites; AA10 has no proven production writer")
