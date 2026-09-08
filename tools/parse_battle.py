"""BATTLE.* 战术画面资源提取器（KI.EXE 静态逆向，2026-08-26）。

已闭合的呈现资源链：
- BATTLE.MAP：0x200 字节目录，随后是 214 个独立的 64×64 地图；
  地图 i 位于 ``0x200 + i*0x1000``。目录首字节选择 0/1/2 号
  BATTLE.MDL 图形块，次字节写入 AB4F。
- BATTLE.MDL：0x1000 字节前导区，随后三个 0xF800 图形块。
  每块前 0x800 是 256×8 字节的地图图块描述；其后 0xF000 是
  192 个 0x140 字节、32×16、带 1bpp mask 的四平面图形。
- BATTLE.SCH：360 个同格式 0x140 字节图形；相邻两帧组成一个
  32×32 战术对象。B240 的图形号公式选择其中 180 个对象帧。
- BATTLE.DAT：32×256 字节持续战场脚本。

输出：
- web/grf/battle_terrain_{0,1,2}.png：三套 192 帧地形 atlas；
- web/grf/battle_units.png：360 个半帧战术对象 atlas；
- web/battle_maps.json：214 个据点/野战目录地图及目录字段；
- web/battle_scripts.json：32 个脚本块。

证据地址：地图装载 ``KI.EXE CS:CAEB..CB43``；MDL 块装载
``CB44..CB71``；图形记录寻址/合成 ``DFBB..E156``；单位图形号
``B32D..B355``。
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
WEB = Path(__file__).resolve().parents[1] / "web"
OUT = WEB / "grf"

MAP_DIRECTORY_SIZE = 0x200
MAP_COUNT = 214
MAP_CELLS = 0x1000
MDL_PREFIX_SIZE = 0x1000
MDL_LAYOUT_SIZE = 0xF800
MDL_ATTRIBUTE_SIZE = 0x800
SPRITE_RECORD_SIZE = 0x140
SPRITE_WIDTH = 32
SPRITE_HEIGHT = 16
TERRAIN_SPRITES_PER_LAYOUT = 192
UNIT_HALF_SPRITES = 360
ATLAS_COLUMNS = 16


def load_palette(off: int = 16) -> list[tuple[int, int, int]]:
    path = Path(__file__).with_name("palette.json")
    try:
        palette = json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise RuntimeError(f"无法读取调色板: {path}") from error
    # 原版战斗截图与ICONGRF解码均使用4-bit通道的高半字节(n*16)，
    # palette.json中的n*17仅是浏览器全幅归一化，不能直接用于战术VGA像素。
    return [
        (
            int(palette[off + index][1:3], 16) & 0xF0,
            int(palette[off + index][3:5], 16) & 0xF0,
            int(palette[off + index][5:7], 16) & 0xF0,
        )
        for index in range(16)
    ]


PAL = load_palette()


def read_dat(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except OSError as error:
        raise RuntimeError(f"无法读取资源文件: {path}") from error


def _quadrant_byte(data: bytes, plane: int, y: int, byte_x: int) -> int:
    """E011 的四象限顺序：左上、右上、左下、右下。"""
    quadrant = (1 if byte_x >= 2 else 0) + (2 if y >= 8 else 0)
    return data[plane * 0x40 + quadrant * 0x10 + (y & 7) * 2 + (byte_x & 1)]


def decode_sprite320(record: bytes) -> Image.Image:
    """0x140B → 32×16 RGBA（0x40B mask + 4×0x40B VGA planes）。"""
    if len(record) != SPRITE_RECORD_SIZE:
        raise ValueError("battle sprite record must contain exactly 0x140 bytes")
    mask = record[:0x40]
    planes = record[0x40:]
    image = Image.new("RGBA", (SPRITE_WIDTH, SPRITE_HEIGHT), (0, 0, 0, 0))
    pixels = image.load()
    if pixels is None:
        raise RuntimeError("Pillow did not expose the battle sprite pixel buffer")
    for y in range(SPRITE_HEIGHT):
        for x in range(SPRITE_WIDTH):
            byte_x = x >> 3
            bit = 7 - (x & 7)
            # E085/E0B1以0x20个word顺序把mask同步AND到四平面；它与
            # E011写色平面使用相同的左上/右上/左下/右下四象限布局。
            opaque = (_quadrant_byte(mask, 0, y, byte_x) >> bit) & 1
            color = 0
            for plane in range(4):
                color |= (
                    (_quadrant_byte(planes, plane, y, byte_x) >> bit) & 1
                ) << plane
            pixels[x, y] = (*PAL[color], 255 if opaque else 0)
    return image


def save_sprite_atlas(data: bytes, count: int, path: Path) -> None:
    expected = count * SPRITE_RECORD_SIZE
    if len(data) != expected:
        raise ValueError(
            f"{path.name}: expected {expected} source bytes, got {len(data)}"
        )
    rows = (count + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    atlas = Image.new(
        "RGBA",
        (ATLAS_COLUMNS * SPRITE_WIDTH, rows * SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )
    for index in range(count):
        begin = index * SPRITE_RECORD_SIZE
        sprite = decode_sprite320(data[begin : begin + SPRITE_RECORD_SIZE])
        atlas.alpha_composite(
            sprite,
            (
                (index % ATLAS_COLUMNS) * SPRITE_WIDTH,
                (index // ATLAS_COLUMNS) * SPRITE_HEIGHT,
            ),
        )
    atlas.save(path)


def export_visual_assets(battle_mdl: bytes, battle_sch: bytes) -> None:
    required_mdl = MDL_PREFIX_SIZE + 3 * MDL_LAYOUT_SIZE
    if len(battle_mdl) != required_mdl:
        raise ValueError(f"BATTLE.MDL must contain exactly {required_mdl} bytes")
    if len(battle_sch) != UNIT_HALF_SPRITES * SPRITE_RECORD_SIZE:
        raise ValueError("BATTLE.SCH must contain exactly 360 sprite records")

    for layout in range(3):
        graphics_begin = MDL_PREFIX_SIZE + layout * MDL_LAYOUT_SIZE + MDL_ATTRIBUTE_SIZE
        graphics_end = graphics_begin + TERRAIN_SPRITES_PER_LAYOUT * SPRITE_RECORD_SIZE
        save_sprite_atlas(
            battle_mdl[graphics_begin:graphics_end],
            TERRAIN_SPRITES_PER_LAYOUT,
            OUT / f"battle_terrain_{layout}.png",
        )
    save_sprite_atlas(battle_sch, UNIT_HALF_SPRITES, OUT / "battle_units.png")


def export_map_payload(battle_map: bytes) -> dict[str, object]:
    expected = MAP_DIRECTORY_SIZE + MAP_COUNT * MAP_CELLS
    if len(battle_map) != expected:
        raise ValueError(f"BATTLE.MAP must contain exactly {expected} bytes")

    directory = []
    maps: dict[str, list[int]] = {}
    for index in range(MAP_COUNT):
        layout = battle_map[index * 2]
        theme = battle_map[index * 2 + 1]
        if layout > 2:
            raise ValueError(
                f"BATTLE.MAP directory {index} has invalid layout {layout}"
            )
        directory.append({"idx": index, "theme": theme, "layout": layout})
        begin = MAP_DIRECTORY_SIZE + index * MAP_CELLS
        maps[str(index)] = list(battle_map[begin : begin + MAP_CELLS])

    return {
        "source": {
            "map": "Dragon/BATTLE.MAP",
            "loader": "KI.EXE CS:CAEB..CB43",
            "mapOffset": "0x200 + directoryIndex*0x1000",
            "terrainAtlas": "grf/battle_terrain_{layout}.png",
            "unitAtlas": "grf/battle_units.png",
        },
        "cities": directory[:0xC0],
        "directory": directory,
        "maps": maps,
    }


def export_scripts(battle_dat: bytes) -> list[list[int]]:
    if len(battle_dat) != 0x2000:
        raise ValueError("BATTLE.DAT must contain exactly 32 0x100-byte blocks")
    return [
        [
            int.from_bytes(
                battle_dat[block * 0x100 + index * 2 : block * 0x100 + index * 2 + 2],
                "little",
            )
            for index in range(0x80)
        ]
        for block in range(32)
    ]


def main() -> None:
    try:
        OUT.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise RuntimeError(f"无法创建输出目录: {OUT}") from error

    battle_map = read_dat(ROOT / "Dragon" / "BATTLE.MAP")
    battle_mdl = read_dat(ROOT / "Dragon" / "BATTLE.MDL")
    battle_sch = read_dat(ROOT / "Dragon" / "BATTLE.SCH")
    battle_dat = read_dat(ROOT / "Dragon" / "BATTLE.DAT")

    export_visual_assets(battle_mdl, battle_sch)
    map_payload = export_map_payload(battle_map)
    scripts = export_scripts(battle_dat)
    try:
        (WEB / "battle_maps.json").write_text(
            json.dumps(map_payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        (WEB / "battle_scripts.json").write_text(
            json.dumps(scripts, separators=(",", ":")), encoding="utf-8"
        )
    except OSError as error:
        raise RuntimeError(
            f"无法写入 battle_maps/battle_scripts JSON: {error}"
        ) from error

    print(
        "battle assets: 214 maps; 3×192 terrain sprites; "
        "360 unit half-sprites; 32 script blocks"
    )


if __name__ == "__main__":
    main()
