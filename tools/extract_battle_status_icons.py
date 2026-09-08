#!/usr/bin/env python3
"""C673 status art: ICONGRF.DAT[0x9700 + command*0xC0], 24x16 planar4.

00B2..00C3 loads file 0x9700 into DS D48. C673 selects SI=cmd*0xC0
and calls F888(CX=0x1018); F938/F999 copies rows within each VGA plane.
GAMEPAL.BRG stores B,R,G nibbles; EBDC..EC29 sends R,G,B to the DAC.
Use n*16 RGB channels, matching the existing original-size battle UI assets
(the 8-bit display conversion is Web presentation, not a game rule).
No screenshot-derived colors, masks, recoloring, or manual PNG edits.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "Dragon" / "ICONGRF.DAT"
PALETTE = ROOT.parent / "Dragon" / "GAMEPAL.BRG"
OUT = ROOT / "web" / "grf" / "ui"
STATUS_ORIGIN = 0x9700
STATUS_SIZE = 0xC0


def decode_status(data: bytes, palette: bytes, command: int) -> Image.Image:
    if not 0 <= command < 6:
        raise ValueError("status command must be 0..5")
    offset = STATUS_ORIGIN + command * STATUS_SIZE
    frame = data[offset:offset + STATUS_SIZE]
    if len(frame) != STATUS_SIZE or len(palette) < 48:
        raise ValueError("short ICONGRF/GAMEPAL source")
    colors = []
    for index in range(16):
        blue, red, green = palette[index * 3:index * 3 + 3]
        colors.append(((red & 15) * 16, (green & 15) * 16, (blue & 15) * 16))
    image = Image.new("RGB", (24, 16))
    for y in range(16):
        for x in range(24):
            index = sum(((frame[plane * 48 + y * 3 + x // 8] >> (7 - x % 8)) & 1) << plane
                        for plane in range(4))
            image.putpixel((x, y), colors[index])
    return image


def main() -> None:
    data, palette = SOURCE.read_bytes(), PALETTE.read_bytes()
    OUT.mkdir(parents=True, exist_ok=True)
    for command in range(6):
        target = OUT / f"battle_status_{command}.png"
        decode_status(data, palette, command).save(target)
        print(f"{target.name}: ICONGRF {STATUS_ORIGIN + command * STATUS_SIZE:#06x}, 24x16")


if __name__ == "__main__":
    main()
