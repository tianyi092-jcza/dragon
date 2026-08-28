"""小地图底图: MMAP.MAP 图块 + GAMEPAL 秋季色库(bank2) → 192×128 PNG
实证: 原版小地图=土黄地形+蓝水, 与秋季色库渲染吻合 (用户截图对照)"""

import os

import render_map as R  # noqa: E402
from PIL import Image


def main():
    web = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "web"))
    src = os.path.join(web, "mmap_map.bin")
    if not os.path.exists(src):
        raise SystemExit(f"缺少 {src}")
    with open(src, "rb") as fh:
        mmap_ = fh.read()
    w, h = 384, 256
    tiles = R.load_tiles()
    pal = R.load_palette(2)  # 秋季 bank2 = 原版小地图土黄调

    img = Image.new("RGB", (w * 2, h * 2))
    for cy in range(h):
        for cx in range(w):
            pt = tiles[mmap_[cy * w + cx]]
            for y in range(16):
                for x in range(16):
                    img.putpixel(
                        (cx * 2 + x // 8, cy * 2 + y // 8),
                        tuple(pal[(pt[y][x] & 15) * 3 : (pt[y][x] & 15) * 3 + 3]),
                    )
    out = img.resize((192, 128), Image.Resampling.NEAREST)
    out.save(os.path.join(web, "grf", "ui", "minimap_bg.png"), optimize=True)
    print("OK web/grf/ui/minimap_bg.png 192x128")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except OSError as e:
        raise SystemExit(f"读取失败: {e}") from e
