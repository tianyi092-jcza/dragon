"""Execute the original channel-6 driver for ID3 -> ID13 -> ID0.

Offline only. Requests start immediately after an INT1C tick for this standalone
sample (3 full BIOS periods before ID13). A live request can have up to one BIOS
period less before that transition. No original/save files are ever written.
"""

import hashlib
import json
from pathlib import Path

from recover_music import CPU, DIV, PIT, ROOT, vgm

sound = (ROOT / "SOUND.DAT").read_bytes()
assert hashlib.sha256(sound).hexdigest() == (
    "b5624388d1bc8f6bb32aeff1d19b1da4c010d7b5a9682a249f1b807c27f2cdba"
)
assert len(sound) == 19 * 16
cpu = CPU(b"")
cpu.mem[0x40000 : 0x40000 + len(sound)] = sound
cpu.run(0x13E)
cpu.run(0x16F, ds=0x4000, si=0)  # AH2 sets SOUND.DAT segment/pointer
cpu.run(0x1DC, ax=3)  # AH5 single SFX request -> 07E6
checkpoints = []
for tick in range(1, 11):
    cpu.irq = tick * 256
    cpu.run(0x7CF)  # INT1C chained-record timer
    checkpoints.append([tick, cpu.byte(0x9EE), cpu.byte(0x9EF)])
assert checkpoints[0:3] == [[1, 13, 2], [2, 13, 1], [3, 0, 7]]
assert checkpoints[-1] == [10, 0, 0]
assert cpu.byte(0x99E) & 4 == 0  # ID0 clears SFX busy, not next-record sentinel
# Independent mapping of 0828..088D verifies actual interpreter writes.
registers = [
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
]
expected = [[0, 0x105, 1], [0, 0x104, 63]]
for irq, record in [(0, 3), (3 * 256, 13), (10 * 256, 0)]:
    expected.extend([[irq, 0xB6, 0], [irq, 0x53, 63], [irq, 0x50, 63]])
    if record:
        expected.extend(
            [irq, reg, value]
            for reg, value in zip(
                registers,
                sound[record * 16 : record * 16 + 13],
                strict=True,
            )
        )
assert cpu.writes == expected
# 100 ms synthesis tail only; no invented fade or additional driver events.
end = 10 * 256 + round(0.1 * PIT / DIV)
out = Path(__file__).resolve().parents[2] / "web" / "grf" / "sfx"
out.mkdir(parents=True, exist_ok=True)
(out / "ynsound-id3.vgm").write_bytes(vgm(cpu, end))
(out / "ynsound-id3.events.json").write_text(
    json.dumps(
        {
            "writes": cpu.writes,
            "timerCheckpoints": checkpoints,
            "endIRQ": end,
            "biosPhase": "request immediately after tick",
            "sourceSha256": hashlib.sha256(sound).hexdigest(),
        },
        indent=2,
    )
    + "\n"
)
# Music AH7 cancels the successor without keying channel6 off. Export each
# natural envelope separately so WebAudio can cancel the scheduled ID13 only.
for record in (3, 13):
    single = CPU(b"")
    single.mem[0x40000 : 0x40000 + len(sound)] = sound
    single.run(0x13E)
    single.run(0x16F, ds=0x4000, si=0)
    single.run(0x1DC, ax=record)
    assert single.writes == expected[:2] + [
        [0, 0xB6, 0],
        [0, 0x53, 63],
        [0, 0x50, 63],
    ] + [
        [0, reg, value]
        for reg, value in zip(
            registers, sound[record * 16 : record * 16 + 13], strict=True
        )
    ]
    # No INT1C successor or invented fade. Pinned OPL3 core's natural
    # EGT=0 envelopes are silent after 0.166s; keep 0.6s for verification.
    single_end = round(0.6 * PIT / DIV)
    stem = f"ynsound-record{record}"
    (out / f"{stem}.vgm").write_bytes(vgm(single, single_end))
    (out / f"{stem}.events.json").write_text(
        json.dumps(
            {
                "record": record,
                "writes": single.writes,
                "endIRQ": single_end,
                "sourceSha256": hashlib.sha256(sound).hexdigest(),
                "semantics": "AH5 only, natural EGT=0 decay; no INT1C successor or fade",
            },
            indent=2,
        )
        + "\n"
    )
print("PASS: original COM ID3/13/0 chain and independent record envelopes")
