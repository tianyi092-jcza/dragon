#!/usr/bin/env python3
"""提取资源面板的资金/骑兵/弓兵/步兵图标。

逆向依据（KI.EXE）：
- 资源面板组件表在 0xE88；四条 type=9 图片记录分别为
  (x=88,y=112/128/144/160, 源偏移=0x1200/0x12C0/0x1380/0x1440, 尺寸=24×16)。
- 组件渲染器 type9 在 0xF888；源图是 4bpp 四平面、逐行存储，每平面 3×16=48B。
- 运行时段 [0xD50] = ICONGRF 第二装载段 [0xD48]+0xA00；[0xD48] 从
  ICONGRF.DAT 文件偏移 0x9700 装载。因此源文件偏移 = 0x9700+0xA00+表内偏移，
  即 0xB300/0xB3C0/0xB480/0xB540。
- 面板语义是红底黑剪影；这里把平面解码后的 idx0 黑色图形提取出来，并统一铺
  GAMEPAL idx10 的 #DD0000 红底。
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT.parent / "Dragon" / "ICONGRF.DAT"
OUT = ROOT / "web" / "grf" / "ui"

WIDTH = 24
HEIGHT = 16
ROW_BYTES = WIDTH // 8
PLANE_SIZE = ROW_BYTES * HEIGHT
SPRITE_SIZE = PLANE_SIZE * 4
RED = (221, 0, 0, 255)  # GAMEPAL idx10
BLACK = (0, 0, 0, 255)

ICONS = [
    ("ico_money.png", 0xB300),
    ("ico_cavalry.png", 0xB3C0),
    ("ico_archer.png", 0xB480),
    ("ico_infantry.png", 0xB540),
]


def extract(data: bytes, offset: int) -> Image.Image:
    planes = [
        data[offset + i * PLANE_SIZE : offset + (i + 1) * PLANE_SIZE] for i in range(4)
    ]
    if any(len(p) != PLANE_SIZE for p in planes):
        raise ValueError(f"short sprite at {offset:#x}")

    im = Image.new("RGBA", (WIDTH, HEIGHT), RED)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            bit = 7 - (x & 7)
            idx = sum(
                ((planes[p][y * ROW_BYTES + (x >> 3)] >> bit) & 1) << p
                for p in range(4)
            )
            if idx == 0:
                im.putpixel((x, y), BLACK)
    return im


def main() -> None:
    data = SRC.read_bytes()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, offset in ICONS:
        im = extract(data, offset)
        im.save(OUT / name)
        print(f"{name}: ICONGRF {offset:#06x}, {WIDTH}x{HEIGHT}")


if __name__ == "__main__":
    main()
