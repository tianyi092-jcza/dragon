"""生成小地图底图(仅陆地+海洋)供用户手工加渐变:
  - tmp_crop/minimap_base.png    208x139: 陆地平色 #F0D090, 海洋棋盘抖动
  - tmp_crop/minimap_landmask.png 208x139: 陆地掩码 (白=陆地, 黑=其它)

用户编辑 minimap_base.png 后 (仅改陆地区域颜色), 再由 compose_minimap.py
叠加陆地棋盘抖动 + 河流 + 道路 → web/grf/ui/minimap_roads.png
"""

import os

from PIL import Image

WEB = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "web"))
TMP = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "tmp_crop"))

SEA_TILES = {95, 191}  # 水域 tile (海洋/河流)
COAST_TILE = 202  # 海岸浅水

LAND_FLAT = (240, 208, 144)  # 陆地平色 #F0D090 (用户在此基础上加渐变)
SEA_A = (0, 30, 90)  # 藏青
SEA_B = (0, 2, 5)  # 近黑

SRC_W, SRC_H = 384, 256
OUT_W, OUT_H = 208, 139


def main():
    mmap_path = os.path.join(WEB, "mmap_map.bin")
    if not os.path.exists(mmap_path):
        raise SystemExit(f"缺少 {mmap_path}")
    try:
        with open(mmap_path, "rb") as f:
            mmap_ = bytearray(f.read())
    except OSError as e:
        raise SystemExit(f"读取失败: {e}") from e
    if len(mmap_) != SRC_W * SRC_H:
        raise SystemExit("mmap_map.bin 尺寸不是 384x256")

    try:
        os.makedirs(TMP, exist_ok=True)
    except OSError as e:
        raise SystemExit(f"无法创建输出目录: {e}") from e
    img = Image.new("RGB", (OUT_W, OUT_H))
    mask = Image.new("L", (OUT_W, OUT_H), 0)
    for oy in range(OUT_H):
        sy0 = oy * SRC_H // OUT_H
        sy1 = max(sy0 + 1, (oy + 1) * SRC_H // OUT_H)
        for ox in range(OUT_W):
            sx0 = ox * SRC_W // OUT_W
            sx1 = max(sx0 + 1, (ox + 1) * SRC_W // OUT_W)
            sea = False
            for sy in range(sy0, sy1):
                for sx in range(sx0, sx1):
                    t = mmap_[sy * SRC_W + sx]
                    if t in SEA_TILES or t == COAST_TILE:
                        sea = True
            if sea:
                img.putpixel((ox, oy), SEA_A if (ox + oy) % 2 == 0 else SEA_B)
            else:
                img.putpixel((ox, oy), LAND_FLAT)
                mask.putpixel((ox, oy), 255)

    base = os.path.join(TMP, "minimap_base.png")
    msk = os.path.join(TMP, "minimap_landmask.png")
    try:
        img.save(base, optimize=True)
        mask.save(msk, optimize=True)
    except OSError as e:
        raise SystemExit(f"写入失败: {e}") from e
    print(f"OK {base} + {msk} {OUT_W}x{OUT_H}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
