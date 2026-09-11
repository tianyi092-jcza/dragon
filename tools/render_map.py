"""从Web图集/布局源重建四季地图；原始解码函数仅保留供离线导入/证据工具。"""

import os

from content_pipeline import SOURCE_ROOT, load_content, render_world

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
WEB = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "web"))

SEASONS = ["spring", "summer", "autumn", "winter"]


def load_palette(bank=0):
    """从 GAMEPAL.BRG 提取调色板。文件384B=4组×16色(BRG字节序)，对应春夏秋冬。
    每分量低4位有效；EBDC数学(DAC): v=(((nibble<<4)*16+0x80)>>8)<<2 ∈ 0..60步长4。
    RGB888 = v*255//60。季节判定依据: idx14 草地色 春#88AA66/夏#55AA11/秋#DD8800/冬#FFFFFF，
    与 DOSBox 实机截图(196年7月=夏季组)吻合。"""
    try:
        with open(os.path.join(BASE, "Dragon", "GAMEPAL.BRG"), "rb") as resource:
            d = resource.read()
    except OSError as error:
        raise RuntimeError(
            "cannot read offline import resource: GAMEPAL.BRG"
        ) from error
    pal = []
    for i in range(16):
        b, r, g = d[bank * 48 + i * 3 : bank * 48 + i * 3 + 3]  # BRG 顺序

        def chan(c):
            v = ((((c & 0x0F) << 4) * 16) + 0x80) >> 8 << 2
            return v * 255 // 60

        pal += [chan(r), chan(g), chan(b)]
    return pal


def load_tiles():
    try:
        with open(os.path.join(BASE, "Dragon", "MMAP.MDL"), "rb") as resource:
            mdl = resource.read()
    except OSError as error:
        raise RuntimeError("cannot read offline import resource: MMAP.MDL") from error
    tiles = []
    for t in range(256):
        tb = mdl[t * 128 : (t + 1) * 128]
        px = [[0] * 16 for _ in range(16)]
        for p in range(4):
            for y in range(16):
                b, b2 = tb[y * 2 + p * 32], tb[y * 2 + 1 + p * 32]
                for x in range(8):
                    if (b >> (7 - x)) & 1:
                        px[y][x] |= 1 << p
                    if (b2 >> (7 - x)) & 1:
                        px[y][x + 8] |= 1 << p
        tiles.append(px)
    return tiles


def main():
    _, _, world, tileset, layout, _ = load_content(SOURCE_ROOT)
    for name, image in render_world(SOURCE_ROOT, world, tileset, layout):
        image.save(os.path.join(WEB, f"map_tiles_{name}.png"), optimize=True)
        print(f"OK web/map_tiles_{name}.png")


if __name__ == "__main__":
    main()
