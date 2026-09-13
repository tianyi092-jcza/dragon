"""Probe ICONGRF.DAT layout hypotheses -> PNGs for visual inspection.

Offline one-shot tool (like parse_*.py siblings); hardcoded project paths are
intentional -- no CLI input, so path/IO guards add nothing. Marked
false-positive per existing convention for tools/parse_*.py.
"""

import os
from pathlib import Path

from PIL import Image

try:
    with open(r"E:/Dragon/Dragon/ICONGRF.DAT", "rb") as f:
        DATA = f.read()
except FileNotFoundError as err:
    raise SystemExit("ICONGRF.DAT not found; run from repo tools/ dir") from err
OUT = str(Path(__file__).resolve().parent.parent / ".dragon-analysis" / "ui-probes")
OUTDIR = Path(OUT)
try:
    OUTDIR.mkdir(parents=True, exist_ok=True)
except OSError as err:
    raise SystemExit(f"cannot create {OUT}: {err}") from err

try:
    with open(r"E:/Dragon/Dragon/GAMEPAL.BRG", "rb") as f:
        pal_raw = f.read()[:48]
except FileNotFoundError as err:
    raise SystemExit("GAMEPAL.BRG not found; run from repo tools/ dir") from err
# GAMEPAL.BRG: 4 seasons x 16 colors, BRG byte order, 2-bit-per-channel VGA
PAL = []
for i in range(16):
    b = pal_raw[i * 3]
    g = pal_raw[i * 3 + 1]
    r = pal_raw[i * 3 + 2]
    PAL.append((r << 2, g << 2, b << 2))
PAL[0] = (0, 0, 0)


def planar_to_rows(buf, w_bytes, planes):
    """Row-interleaved planar -> list of pixel-index rows."""
    stride = w_bytes * planes
    rows = []
    for i in range(0, len(buf) - len(buf) % stride, stride):
        row = []
        for p in range(planes):
            chunk = buf[i + p * w_bytes : i + (p + 1) * w_bytes]
            for by in chunk:
                for bit in range(7, -1, -1):
                    row.append((by >> bit) & 1)
        rows.append(row)
    return rows


def save(rows, name, scale=1):
    if not rows:
        return
    h = len(rows)
    w = len(rows[0])
    img = Image.new("P", (w, h))
    img.putpalette([c for rgb in PAL for c in rgb])
    img.putdata([rows[y][x] for y in range(h) for x in range(w)])
    if scale > 1:
        img = img.resize((w * scale, h * scale), Image.Resampling.NEAREST)
    img.save(os.path.join(OUT, name))
    print(name, f"{w}x{h}")


reg_a = DATA[0x6700 : 0x6700 + 0x3000]  # seg [0xD3A]
reg_b = DATA[0x9700:]  # seg [0xD48]

# H1: 32x32 tiles, 4-plane row-interleaved (512B/tile) -> strip
for name, reg in (("A", reg_a), ("B", reg_b)):
    n = len(reg) // 512
    rows = []
    for t in range(n):
        rows += planar_to_rows(reg[t * 512 : (t + 1) * 512], 4, 4)
    save(rows, f"{name}_tiles32_{n}.png", 2)

# H2: raw linear as 128px-wide image (4 planes x 4 bytes per row)
for name, reg in (("A", reg_a), ("B", reg_b)):
    save(planar_to_rows(reg, 16, 4), f"{name}_wide.png")

# H3: single-plane bitmap, 96px wide
for name, reg in (("A", reg_a), ("B", reg_b)):
    save(planar_to_rows(reg, 12, 1), f"{name}_mono96.png")
print("done", len(reg_a), len(reg_b))
