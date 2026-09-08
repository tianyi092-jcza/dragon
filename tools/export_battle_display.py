"""Export lossless MDL/SCH planes for the bounded native reference compositor.

Unlike the PNG alpha atlases, these bytes preserve color bits outside the mask.
Layout graphics are three 192*0x140 blocks, followed by 360*0x140 SCH records.
No PNG is opened or rewritten. Source: KI CB71/CAB7, D958, E085/E0E1.
"""

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = Path(__file__).resolve().parents[1] / "web"
HASHES = {
    "BATTLE.MDL": "3522f7362f928fae45c1431a9efe57e285250d9db05d04ebdcb59f420e3e0bd3",
    "BATTLE.SCH": "2ddad3e90d2e6c6c2e0d7e278e2a07254374e7bd7f4e34d4405599ce76f5ec0b",
}


def export_bytes():
    sources = {}
    for name, expected in HASHES.items():
        raw = (ROOT / "Dragon" / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError(f"unrecognized original resource: {name}")
        sources[name] = raw
    mdl = sources["BATTLE.MDL"]
    return (
        b"".join(mdl[0x1800 + i * 0xF800 : 0x10800 + i * 0xF800] for i in range(3))
        + sources["BATTLE.SCH"]
    )


if __name__ == "__main__":
    target = WEB / "battle_display.bin"
    target.write_bytes(export_bytes())
    print(f"{target.name}: {target.stat().st_size} original plane bytes")
