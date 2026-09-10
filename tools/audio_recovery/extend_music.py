"""Temp-only exact original decoder recurrence experiment; no production writes.
Run: python -B <this-file> --repo E:/Dragon/web-port --tracks 2 3 4 5 0 6 7 8 9 10
Requires only recover_music.py's already-installed capstone. No original saves.
"""

import argparse
import hashlib
import importlib.util
import json
import struct
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
ap = argparse.ArgumentParser()
ap.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
ap.add_argument(
    "--out",
    type=Path,
    default=Path(tempfile.gettempdir()) / "dragon-music-loops" / "extended",
)
ap.add_argument(
    "--tracks",
    nargs="+",
    default=["2", "3", "4", "5", "0", "6", "7", "8", "9", "10", "OVERBGM"],
)
a = ap.parse_args()
out = a.out.resolve()
assert out.is_relative_to(Path(tempfile.gettempdir()).resolve()), (
    "Outputs must stay in OS temp"
)
out.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location(
    "recover", a.repo / "tools/audio_recovery/recover_music.py"
)
assert spec is not None and spec.loader is not None
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
bgm = (r.ROOT / "BGM.DAT").read_bytes()
assert (
    hashlib.sha256(bgm).hexdigest()
    == "7a51c8b9a349b9e088f3796b70c268181c60bcebead70942f00e1621523dedc9"
)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def encode(value):
    return json.dumps(value, separators=(",", ":")).encode()


def seconds(t):
    return t * r.DIV / r.PIT


def snapshot(c, regs, remaining, phase, silent=()):
    # All original music RAM (including unused bytes), plus externally emulated
    # B69 countdown and B6B BIOS phase. B68 explicitly included. No CPU scratch
    # registers/stack: IRQ wrapper saves them; 03DE establishes DS/ES/BX itself.
    state = bytearray(c.mem[0x1098C:0x10B60])
    if silent:
        # Only persistent fields written by D0/rest/C0; all other bytes retained.
        for ch in silent:
            for base in [0x9B8, 0x9F6, 0xA02]:
                at = base + 2 * ch - 0x98C
                state[at : at + 2] = b"\0\0"
        # A4A is unconditionally reset at 03E8 before EACH voice, never read by
        # BIOS fade. Last silent voice may leave 0 or 1 without affecting future.
        state[0xA4A - 0x98C] = 0
    return (
        bytes(state)
        + bytes([c.byte(0xB68)])
        + struct.pack("<HH", remaining, phase)
        + bytes(regs)
    )


for requested in a.tracks:
    try:
        track = requested if requested == "OVERBGM" else int(requested)
    except ValueError as error:
        raise SystemExit("Invalid original music index") from error
    assert track in [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, "OVERBGM"]
    if track == "OVERBGM":
        song = (r.ROOT / "OVERBGM.DAT").read_bytes()
        assert (
            sha(song)
            == "702154f9d104a865b9c45a17469b10cb7aea89e08ed1e1270dde85735e38a681"
        )
        off = None
        n = len(song)
        label = "OVERBGM"
    else:
        off, n = struct.unpack_from("<II", bgm, track * 8)
        song = bgm[off : off + n]
        label = f"BGM_{track:02}"
    streams = struct.unpack_from("<6H", song, 16)
    silent = [ch for ch, pc in enumerate(streams) if pc == 0x22]
    # Strong static whitelist: initial D0, exactly five 00/00 rests (192 each),
    # unconditional C0 to D0's following address 24h. No external jump target.
    assert song[0x22:0x30] == bytes.fromhex("d000 0000 0000 0000 0000 0000 c000")
    silent_regs = {
        bank + reg + ch % 3
        for ch in silent
        for bank in [(ch // 3) * 256]
        for reg in [0xA0, 0xB0]
    }
    c = r.CPU(song)
    c.run(0x13E)
    c.run(0x1E2, ds=0x2000, si=0)
    c.run(0x1F6)
    init_writes = len(c.writes)
    regs = bytearray(512)
    wi = 0
    seen = {"full": {}, "audible": {}}
    found = {}
    boundary_states = {}
    raw_states = {}
    next_music = 1
    next_bios = 256
    tempos = []
    old = None
    start = time.time()
    for _step in range(3000000):
        t = min(next_music, next_bios)
        c.irq = t
        ismusic = t == next_music
        if ismusic:
            next_music = t + (c.byte(0xB68) or 256)
            c.run(0x3DE)
            if c.byte(0xB68) != old:
                old = c.byte(0xB68)
                tempos.append([t, old])
        if t == next_bios:
            next_bios += 256
            for _ in range(6):
                for ch in range(6):
                    if c.byte(0x9A0 + ch):
                        c.run(0x75E, ds=0x1000, es=0x2000, bx=ch, si=ch * 2)
        for ix in range(wi, len(c.writes)):
            _, reg, value = c.writes[ix]
            regs[reg] = value
            if ix >= init_writes and reg in silent_regs:
                assert value == 0
        wi = len(c.writes)
        if ismusic:
            for mode in ["audible", "full"]:
                state = snapshot(
                    c,
                    regs,
                    next_music - t,
                    next_bios - t,
                    silent if mode == "audible" else (),
                )
                if mode not in found:
                    # Dictionary stores actual bytes: equality is NOT based only on hash.
                    if state in seen[mode]:
                        s = seen[mode][state]
                        p = t - s
                        found[mode] = [s, t, t + p]
                        boundary_states[mode] = [sha(state)]
                        raw_states[mode] = state
                        print("FOUND", track, mode, found[mode], flush=True)
                        seen[mode].clear()
                    else:
                        seen[mode][state] = t
                elif t == found[mode][2]:
                    assert state == raw_states[mode], (
                        f"{track} {mode}: second state mismatch"
                    )
                    boundary_states[mode].append(sha(state))
        if len(found) == 2 and all(len(x) == 2 for x in boundary_states.values()):
            break
        if seconds(t) > 4000:
            raise RuntimeError(
                (track, "no validated recurrence within 4000 sec", found)
            )
    else:
        raise RuntimeError("iteration bound")
    result: dict[str, Any] = {
        "track": track,
        "archiveOffset": off,
        "bytes": n,
        "songSha256": sha(song),
        "streams": streams,
        "silentVoices": silent,
        "silentRawHex": song[0x22:0x30].hex(),
        "silentRegisters": sorted(silent_regs),
        "tempos": tempos,
        "simulatedToIRQ": t,
        "wallSeconds": time.time() - start,
        "firstSixMainJumps": [x[:6] for x in c.loops],
        "modes": {},
    }
    for mode, (s, e, end2) in found.items():

        def events_between(
            start,
            end,
            writes=c.writes,
            projected=(mode == "audible"),
            excluded=silent_regs,
        ):
            return [
                [t - start, reg, v]
                for t, reg, v in writes
                if start < t <= end and not (projected and reg in excluded)
            ]

        ev1 = events_between(s, e)
        ev2 = events_between(e, end2)
        assert ev1 == ev2, f"{track} {mode}: register trace mismatch"
        name = f"{label}.{mode}"
        writes = [
            w for w in c.writes if w[0] <= e
        ]  # Keep ALL silent writes in original expanded stream.
        oldwrites = c.writes
        c.writes = writes
        (out / f"{name}.vgm").write_bytes(r.vgm(c, e))
        c.writes = oldwrites
        (out / f"{name}.events.json").write_bytes(
            encode({"writes": writes, "endIRQ": e, "loopStartIRQ": s, "loopEndIRQ": e})
        )
        metadata = {
            "startIRQ": s,
            "endIRQ": e,
            "periodIRQ": e - s,
            "verifiedSecondEndIRQ": end2,
            "startSeconds": seconds(s),
            "endSeconds": seconds(e),
            "periodSeconds": seconds(e - s),
            "stateSha256": boundary_states[mode][0],
            "registerSequenceSha256": sha(encode(ev1)),
            "registerWritesPerLoop": len(ev1),
            "exactSecondStateAndRegisterSequence": True,
            "direct49700Start": round(seconds(s) * 49700),
            "direct49700End": round(seconds(e) * 49700),
            "viaVgm49700Start": round(round(seconds(s) * 44100) * 49700 / 44100),
            "viaVgm49700End": round(round(seconds(e) * 44100) * 49700 / 44100),
        }
        result["modes"][mode] = metadata
        (out / f"{name}.boundary-state.hex").write_text(raw_states[mode].hex() + "\n")
    (out / f"{label}.proof.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result), flush=True)
