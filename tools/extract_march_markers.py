"""Extract the original strategic march-marker tiles from MMAP.MCH.

KI.EXE evidence:
- legion[+9] = faction[+0x3E] * 5 (0x6FD2..0x701A)
- normal marker index = legion[+9] + legion[+8] (0x2B2A)
- MMAP.MCH overlay tile = 32-byte 1bpp mask + 128-byte 4-plane 16x16 pixels
  (0xD6DF..0xD704, 0xD804..0xD840)

The first 24 groups are the fixed faction marker styles. Each group has five
entries: four movement directions (0..3) and the stationary/arrived banner (4).
"""

from pathlib import Path

from PIL import Image, ImageDraw
from render_map import load_palette

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "Dragon" / "MMAP.MCH"
OUT_DIR = ROOT / "web-port" / "web" / "grf" / "march_markers"
SHEET = ROOT / "web-port" / "docs" / "march-marker-styles.png"
MANIFEST = ROOT / "web-port" / "web" / "grf" / "march_markers" / "manifest.json"
ENGAGE_OUT_DIR = ROOT / "web-port" / "web" / "grf" / "engage"
ENGAGE_SHEET = ROOT / "web-port" / "docs" / "engage-animation-groups.png"
STYLE_COUNT = 24
FRAMES_PER_STYLE = 5
TILE_SIZE = 160
ENGAGE_TABLE_OFFSET = 0xA000
ENGAGE_GROUPS = 5
ENGAGE_FRAMES = 4


def decode_overlay_tile(raw: bytes) -> Image.Image:
    if len(raw) != TILE_SIZE:
        raise ValueError(f"overlay tile must be {TILE_SIZE} bytes, got {len(raw)}")
    mask = raw[:32]
    planes = raw[32:]
    image = Image.new("P", (16, 16), 0)
    image.putpalette(load_palette(1) + [0] * (768 - 48))
    alpha = Image.new("L", (16, 16), 0)
    px = image.load()
    apx = alpha.load()
    if px is None or apx is None:
        raise RuntimeError("Pillow did not expose writable pixel access")
    for y in range(16):
        mask_word = (mask[y * 2] << 8) | mask[y * 2 + 1]
        for x in range(16):
            bit = 15 - x
            apx[x, y] = 255 if (mask_word >> bit) & 1 else 0
            color = 0
            for plane in range(4):
                b = planes[plane * 32 + y * 2 + x // 8]
                color |= ((b >> (7 - (x & 7))) & 1) << plane
            px[x, y] = color
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def decode_engage_sprite(decoded: bytes, group: int, frame: int) -> Image.Image:
    """Compose one 0x2B3C sprite from the MMAP.MCH tile-index table at 0xA000."""
    index = group * ENGAGE_FRAMES + frame
    entry = ENGAGE_TABLE_OFFSET + index * 4
    rows = decoded[entry]
    columns = decoded[entry + 1]
    offset = int.from_bytes(decoded[entry + 2 : entry + 4], "little")
    tile_indices = decoded[
        ENGAGE_TABLE_OFFSET + offset + 0x100 : ENGAGE_TABLE_OFFSET
        + offset
        + 0x100
        + rows * columns
    ]
    if len(tile_indices) != rows * columns:
        raise ValueError(f"engage sprite {group}:{frame} index list is truncated")

    sprite = Image.new("RGBA", (columns * 16, rows * 16), (0, 0, 0, 0))
    for cell, tile_index in enumerate(tile_indices):
        start = tile_index * TILE_SIZE
        tile = decode_overlay_tile(decoded[start : start + TILE_SIZE])
        sprite.alpha_composite(tile, ((cell % columns) * 16, (cell // columns) * 16))
    return sprite


def extract_engage_sprites(decoded: bytes) -> None:
    ENGAGE_OUT_DIR.mkdir(parents=True, exist_ok=True)
    scale = 2
    cell_w = 112
    cell_h = 112
    sheet = Image.new(
        "RGBA",
        (ENGAGE_GROUPS * cell_w, ENGAGE_FRAMES * cell_h),
        (30, 30, 30, 255),
    )
    draw = ImageDraw.Draw(sheet)
    for group in range(ENGAGE_GROUPS):
        for frame in range(ENGAGE_FRAMES):
            sprite = decode_engage_sprite(decoded, group, frame)
            sprite.save(ENGAGE_OUT_DIR / f"group_{group}_frame_{frame}.png")
            x = group * cell_w
            y = frame * cell_h
            draw.text((x + 4, y + 2), f"G{group} F{frame}", fill="white")
            resized = sprite.resize(
                (sprite.width * scale, sprite.height * scale),
                Image.Resampling.NEAREST,
            )
            sheet.alpha_composite(resized, (x + 8, y + 16))
    ENGAGE_SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(ENGAGE_SHEET)


def main() -> None:
    # Unlike MMAP.MAP, MMAP.MCH is not RLE-compressed. KI.EXE loads it as-is
    # and addresses each overlay tile at index * 160.
    decoded = SRC.read_bytes()
    required = STYLE_COUNT * FRAMES_PER_STYLE * TILE_SIZE
    if len(decoded) < required:
        raise SystemExit(f"MMAP.MCH too short: {len(decoded)} < {required}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scale = 4
    label_h = 14
    cell_w = 16 * scale + 8
    cell_h = 16 * scale + label_h + 8
    sheet = Image.new(
        "RGBA",
        (FRAMES_PER_STYLE * cell_w, STYLE_COUNT * cell_h),
        (30, 30, 30, 255),
    )
    draw = ImageDraw.Draw(sheet)

    for style in range(STYLE_COUNT):
        for frame in range(FRAMES_PER_STYLE):
            index = style * FRAMES_PER_STYLE + frame
            start = index * TILE_SIZE
            tile = decode_overlay_tile(decoded[start : start + TILE_SIZE])
            tile.save(OUT_DIR / f"style_{style:02d}_frame_{frame}.png")
            x = frame * cell_w + 4
            y = style * cell_h
            draw.text((x, y), f"S{style:02d} F{frame}", fill="white")
            sheet.alpha_composite(
                tile.resize((16 * scale, 16 * scale), Image.Resampling.NEAREST),
                (x, y + label_h),
            )

    SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(SHEET)
    extract_engage_sprites(decoded)
    MANIFEST.write_text(
        '{\n  "styleCount": 24,\n  "framesPerStyle": 5,\n'
        '  "frames": ["west", "east", "north", "south", "stationary"]\n}\n',
        encoding="utf-8",
    )
    print(f"loaded {len(decoded)} bytes ({len(decoded) // TILE_SIZE} complete tiles)")
    print(f"markers -> {OUT_DIR}")
    print(f"sheet   -> {SHEET}")
    print(f"engage  -> {ENGAGE_OUT_DIR}")


if __name__ == "__main__":
    main()
