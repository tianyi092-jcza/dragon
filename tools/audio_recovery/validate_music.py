"""Independent structured decoder vs bounded original-instruction traces; no save access."""

import json
import struct

from recover_music import DIV, OUT, PIT, ROOT, Y


def load_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as error:
        raise AssertionError(f"Invalid audio evidence: {path}") from error


def vlq(data, cursor):
    value = 0
    for _byte in range(4):
        byte = data[cursor]
        cursor += 1
        value = (value << 7) | (byte & 127)
        if not byte & 128:
            return value, cursor
    raise AssertionError("SMF VLQ exceeds four bytes")


manifest = load_json(OUT / "manifest.json")
results = []
for item in manifest["tracks"]:
    name = item["name"]
    raw = (ROOT / (("BGM" if name.startswith("BGM_") else name) + ".DAT")).read_bytes()
    song = (
        raw[item["archiveOffset"] : item["archiveOffset"] + item["archiveLength"]]
        if name.startswith("BGM_")
        else raw
    )
    voices = [
        {"pc": p, "left": 0, "main": 0, "repeat": 0, "count": 0, "sub": 0, "ret": 0}
        for p in struct.unpack_from("<6H", song, 16)
    ]
    notes = []
    loops = [[] for _ in range(6)]
    divider = 1
    reload = 1
    tempos = []
    old = None
    for irq in range(1, item["endIRQ"] + 1):
        divider = (divider - 1) & 255
        if divider:
            continue
        divider = reload
        for ch, s in enumerate(voices):
            s["left"] -= 1
            if s["left"] > 0:
                continue
            for _bound in range(10000):
                pc = s["pc"]
                op, arg = song[pc : pc + 2]
                s["pc"] += 2
                if op < 128:
                    assert arg & 127 < 32
                    notes.append([irq, ch, pc, op, arg])
                    s["left"] = Y[0xAB0 - 256 + (arg & 127)]
                    break
                if op & 0xF0 == 0xB0:
                    reload = (((255 - arg) * 11) >> 3) & 255
                elif op & 0xF0 == 0xC0:
                    if op == 0xC1:
                        s["count"] = (s["count"] - 1) & 255
                        if s["count"]:
                            s["pc"] = s["repeat"]
                    elif op == 0xC2:
                        s["ret"] = s["pc"]
                        s["pc"] = s["sub"]
                    elif op == 0xC3:
                        if s["ret"]:
                            s["pc"] = s["ret"]
                    else:
                        s["pc"] = s["main"]
                        loops[ch].append(irq)
                elif op & 0xF0 == 0xD0:
                    if op == 0xD1:
                        s["count"] = arg
                        s["repeat"] = s["pc"]
                    elif op == 0xD2:
                        s["ret"] = 0
                        s["sub"] = s["pc"]
                    else:
                        s["main"] = s["pc"]
            else:
                raise AssertionError("command-only loop")
        if reload != old:
            tempos.append([irq, reload])
            old = reload
    actual = load_json(OUT / (name + ".events.json"))
    assert notes == actual["notes"], name
    assert [x[0] for x in loops] == item["firstLoopIRQByVoice"], name
    assert tempos == item["tempoChangesIRQAndDivider"], name
    # Validate VGM byte stream exactly preserves all register writes and rounded time.
    d = (OUT / (name + ".vgm")).read_bytes()
    assert d[:4] == b"Vgm "
    pos = 256
    t = 0
    writes = []
    while d[pos] != 0x66:
        op = d[pos]
        pos += 1
        if op == 0x61:
            t += int.from_bytes(d[pos : pos + 2], "little")
            pos += 2
        else:
            assert op in {0x5E, 0x5F}
            writes.append([t, d[pos] + (256 if op == 0x5F else 0), d[pos + 1]])
            pos += 2
    assert writes == [
        [round(t * DIV / PIT * 44100), r, v] for t, r, v in actual["writes"]
    ]
    assert t == round(item["endIRQ"] * DIV / PIT * 44100)
    # SMF parser validates all delta lengths, events, channel voice messages, and final EOT.
    m = (OUT / (name + ".mid")).read_bytes()
    assert m[:4] == b"MThd" and m[14:18] == b"MTrk"
    assert int.from_bytes(m[18:22], "big") == len(m) - 22
    pos = 22
    on = 0

    while pos < len(m):
        _delta, pos = vlq(m, pos)
        op = m[pos]
        pos += 1
        if op == 255:
            typ = m[pos]
            pos += 1
            n, pos = vlq(m, pos)
            pos += n
            if typ == 47:
                assert pos == len(m)
        else:
            assert op & 0xF0 in {0x80, 0x90, 0xB0, 0xE0}
            assert max(m[pos : pos + 2]) < 128
            pos += 2
            on += op & 0xF0 == 0x90
    assert on == item["noteOnCount"]
    results.append(
        {
            "name": name,
            "noteEventsMatched": len(notes),
            "registerWritesRoundtrip": len(writes),
            "midiNoteOns": on,
            "pass": True,
        }
    )
print(json.dumps(results, indent=2))
(OUT / "validation.json").write_text(json.dumps(results, indent=2))
