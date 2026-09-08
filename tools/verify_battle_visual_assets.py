"""回归 BATTLE.MDL/SCH 图形解码及 214 张独立战术地图产物。"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, cast

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
EXPECTED_PIXEL_HASHES = {
    "battle_terrain_0.png": "586c8528879826b4a74f291505594ff5e7da5eb6c80e195daaffbb5097870827",
    "battle_terrain_1.png": "4564aa0635add542b32b849844b808155f5dd45ee325065a40b39650ebf53d51",
    "battle_terrain_2.png": "b1645b21e15f4a7eb7ec753e545448194a35a3c5c4738ca5b933635a5172959f",
    "battle_units.png": "b6b31ee03d7089658c4eb995b6abdee37f0e5d1b50d0d69d1a0b4ef7a9e2216f",
}


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AssertionError(f"cannot read {path}") from error


for name, expected_hash in EXPECTED_PIXEL_HASHES.items():
    path = WEB / "grf" / name
    with Image.open(path) as source:
        image = source.convert("RGBA")
    expected_size = (512, 368) if name == "battle_units.png" else (512, 192)
    assert image.size == expected_size, f"{name}: {image.size}"
    expected_bounds = (
        (0, 0, 511, 368) if name == "battle_units.png" else (0, 0, *expected_size)
    )
    if image.getbbox() != expected_bounds:
        raise AssertionError(f"{name}: nonempty bounds {image.getbbox()}")
    pixels = image.tobytes()
    if any(
        pixels[offset + channel] & 0x0F
        for offset in range(0, len(pixels), 4)
        for channel in range(3)
    ):
        raise AssertionError(
            f"{name}: tactical VGA colors must preserve 4-bit channels as n*16"
        )
    digest = hashlib.sha256(pixels).hexdigest()
    assert digest == expected_hash, f"{name}: {digest}"

maps = read_json(WEB / "battle_maps.json")
navigation = read_json(WEB / "battle_navigation.json")
assert isinstance(maps, dict) and isinstance(navigation, dict)
assert len(maps["cities"]) == 0xC0
assert len(maps["directory"]) == 214
assert len(maps["maps"]) == 214
assert len(navigation["maps"]) == 214
assert all(len(tile_map) == 0x1000 for tile_map in maps["maps"].values())
assert maps["maps"]["0"] != maps["maps"]["10"]
assert maps["maps"] == navigation["maps"]
assert all(
    len(layout["attributes"]) == 0x800 for layout in navigation["layouts"].values()
)

# E085/E0B1 proves the mask shares E011's quadrant order. A base ground
# diamond must have one contiguous alpha run per scanline, not row-major holes.
with (
    Image.open(WEB / "grf" / "battle_terrain_0.png") as terrain_0,
    Image.open(WEB / "grf" / "battle_terrain_1.png") as terrain_1,
    Image.open(WEB / "grf" / "battle_terrain_2.png") as terrain_2,
):
    terrain_images = tuple(
        terrain.convert("RGBA") for terrain in (terrain_0, terrain_1, terrain_2)
    )
    terrain_alphas = tuple(terrain.getchannel("A") for terrain in terrain_images)
for layout_index, alpha in enumerate(terrain_alphas):
    attributes = navigation["layouts"][str(layout_index)]["attributes"]
    sprite = attributes[1 * 8 + 1]
    left = (sprite % 16) * 32
    top = (sprite // 16) * 16
    for y in range(16):
        width = 4 * min(y, 16 - y)
        expected = list(range(16 - width // 2, 16 + width // 2))
        actual = [x for x in range(32) if alpha.getpixel((left + x, top + y))]
        if actual != expected:
            raise AssertionError(
                f"layout {layout_index} sprite {sprite}: broken quadrant mask row {y}"
            )


def city_76_pixel(
    layer_step: int, scene_x: int, scene_y: int
) -> tuple[int, int, int, int]:
    """Compose one discriminating roof pixel in the same order as BattleView."""
    tiles = maps["maps"]["76"]
    attributes = navigation["layouts"]["0"]["attributes"]
    color = (0, 0, 0, 255)
    atlas = terrain_images[0]
    for depth in range(-0x3F, 0x40):
        first_x = max(0, -depth)
        last_x = min(0x3F, 0x3F - depth)
        for x in range(first_x, last_x + 1):
            y = x + depth
            tile = tiles[y * 0x40 + x]
            descriptor = tile * 8
            for level in range(7):
                sprite = attributes[descriptor + level + 1]
                if sprite == 0:
                    continue
                left = (x + y) * 16
                top = 64 + (0x40 + y - x) * 8 - 8 - level * layer_step
                if not (left <= scene_x < left + 32 and top <= scene_y < top + 16):
                    continue
                source_x = (sprite % 16) * 32 + scene_x - left
                source_y = (sprite // 16) * 16 + scene_y - top
                pixel = atlas.getpixel((source_x, source_y))
                if not isinstance(pixel, tuple) or len(pixel) != 4:
                    raise AssertionError("terrain atlas must be RGBA")
                rgba = cast(tuple[int, int, int, int], pixel)
                if rgba[3] != 0:
                    color = (rgba[0], rgba[1], rgba[2], rgba[3])
    return color


# DD22 moves SI back 0x400 for every descriptor slot; DDB4 emits each such
# screen-buffer row as 16 pixels. DL=0,2,..,12 is the matching occlusion code,
# not an 8px coordinate. This city-76 roof seam exposed the old 8px spacing.
if city_76_pixel(8, 1252, 289) != (240, 240, 240, 255):
    raise AssertionError("city 76 roof fixture no longer distinguishes 8px spacing")
if city_76_pixel(16, 1252, 289) != (0, 0, 0, 255):
    raise AssertionError("DD22/DDB4 descriptor rows must be 16px apart")

print("battle visual assets OK: 214 maps + quadrant-mask MDL/SCH sprites")
