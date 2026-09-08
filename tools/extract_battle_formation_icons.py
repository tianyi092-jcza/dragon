#!/usr/bin/env python3
"""Extract the original 16-button tactical formation artwork.

KI's battle UI loads the 128x32 four-plane block at ICONGRF.DAT 0x2800.
Each 16x16 cell contains a 14x14 inset frame. The stored first cell is the
currently-selected variant, so individual button assets normalize only the
frame pixels to the original inactive red; CSS restores the selected yellow
frame at runtime. Glyph pixels are copied unchanged from ICONGRF.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "Dragon" / "ICONGRF.DAT"
PALETTE = ROOT.parent / "Dragon" / "GAMEPAL.BRG"
OUT = ROOT / "web" / "grf" / "ui"
ORIGIN = 0x2800
WIDTH = 128
HEIGHT = 32
PLANE_SIZE = WIDTH * HEIGHT // 8
CELL = 16
INACTIVE_RED = 10


def load_colors(palette: bytes) -> list[tuple[int, int, int]]:
    if len(palette) < 48:
        raise ValueError("short GAMEPAL.BRG")
    colors = []
    for index in range(16):
        blue, red, green = palette[index * 3 : index * 3 + 3]
        colors.append(((red & 15) * 16, (green & 15) * 16, (blue & 15) * 16))
    return colors


def decode_grid(data: bytes, colors: list[tuple[int, int, int]]) -> Image.Image:
    block = data[ORIGIN : ORIGIN + PLANE_SIZE * 4]
    if len(block) != PLANE_SIZE * 4:
        raise ValueError("short ICONGRF formation block")
    image = Image.new("P", (WIDTH, HEIGHT))
    palette = [channel for color in colors for channel in color]
    image.putpalette(palette + [0] * (768 - len(palette)))
    pixels = []
    row_bytes = WIDTH // 8
    for y in range(HEIGHT):
        for x in range(WIDTH):
            pixels.append(
                sum(
                    (
                        (
                            block[plane * PLANE_SIZE + y * row_bytes + x // 8]
                            >> (7 - x % 8)
                        )
                        & 1
                    )
                    << plane
                    for plane in range(4)
                )
            )
    image.putdata(pixels)
    return image


def inactive_cell(grid: Image.Image, index: int) -> Image.Image:
    if not 0 <= index < 16:
        raise ValueError("formation index must be 0..15")
    left = (index % 8) * CELL
    top = (index // 8) * CELL
    cell = grid.crop((left, top, left + CELL, top + CELL))
    for offset in range(1, CELL - 1):
        cell.putpixel((offset, 1), INACTIVE_RED)
        cell.putpixel((offset, CELL - 2), INACTIVE_RED)
        cell.putpixel((1, offset), INACTIVE_RED)
        cell.putpixel((CELL - 2, offset), INACTIVE_RED)
    return cell


def main() -> None:
    try:
        data = SOURCE.read_bytes()
        palette = PALETTE.read_bytes()
    except OSError as error:
        raise SystemExit(
            f"cannot read original battle UI resources: {error}"
        ) from error
    grid = decode_grid(data, load_colors(palette))
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        grid.save(OUT / "battle_symbols_grid.png")
        for index in range(16):
            inactive_cell(grid, index).save(OUT / f"battle_symbol_{index}.png")
    except OSError as error:
        raise SystemExit(f"cannot write battle formation assets: {error}") from error
    print("battle formation icons: ICONGRF 0x2800, 128x32, 16 original cells")


if __name__ == "__main__":
    main()
