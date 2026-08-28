"""合成小地图最终底图:
输入: tmp_crop/minimap_base_grad.png (用户手工加过渐变的陆地+海洋底图)
      tmp_crop/minimap_landmask.png  (陆地掩码, render_minimap_base.py 生成)
      web/mmap_map.bin + web/road_cost.bin
输出: web/grf/ui/minimap_roads.png 208x139 (drawMini 1:1 显示)

合成规则 (优先级 河流>道路>海洋>陆地):
  河流 = 孤立水域 tile95/191 + 海岸 tile202 → 绿 #406040
  道路 = road_cost==1 且在陆地 tile → 棕 #5A3A23
  海洋 = 连通地图边缘的水域 → 藏青/近黑棋盘;
         但用户手工改过的海侧像素(如海岸阴影)保留用户颜色, 只回正未动过的藏青棋盘格
  陆地 = 用户渐变像素原样 (用户底图自带纹理, 不再叠加棋盘抖动)
"""

import os

from PIL import Image

WEB = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "web"))
TMP = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "tmp_crop"))

SEA_TILES = {95, 191}
COAST_TILE = 202

SEA_A = (0, 30, 90)
SEA_B = (0, 2, 5)
RIVER_COL = (64, 96, 64)
ROAD_COL = (90, 58, 35)

SRC_W, SRC_H = 384, 256
OUT_W, OUT_H = 208, 139


def ocean_mask(mmap_):
    """洪水填充: 连通地图边缘的水域=海洋, 其余=河流/湖泊"""
    ocean = bytearray(SRC_W * SRC_H)
    stack = []
    for x in range(SRC_W):
        for y in (0, SRC_H - 1):
            i = y * SRC_W + x
            if mmap_[i] in SEA_TILES and not ocean[i]:
                ocean[i] = 1
                stack.append((x, y))
    for y in range(SRC_H):
        for x in (0, SRC_W - 1):
            i = y * SRC_W + x
            if mmap_[i] in SEA_TILES and not ocean[i]:
                ocean[i] = 1
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < SRC_W and 0 <= ny < SRC_H:
                ni = ny * SRC_W + nx
                if mmap_[ni] in SEA_TILES and not ocean[ni]:
                    ocean[ni] = 1
                    stack.append((nx, ny))
    return ocean


def _close(col, ref, tol=24):
    return all(abs(a - b) <= tol for a, b in zip(col, ref, strict=True))


def untouched_sea(col):
    """底图海像素仍是生成时的藏青棋盘色(未被用户手工改过)"""
    return _close(col, SEA_A) or _close(col, SEA_B)


def main():
    paths = {
        "base": os.path.join(TMP, "minimap_base_grad.png"),
        "mask": os.path.join(TMP, "minimap_landmask.png"),
        "cost": os.path.join(WEB, "road_cost.bin"),
        "mmap": os.path.join(WEB, "mmap_map.bin"),
    }
    for p in paths.values():
        if not os.path.exists(p):
            raise SystemExit(f"缺少 {p}")
    try:
        base = Image.open(paths["base"]).convert("RGB")
        mask = Image.open(paths["mask"]).convert("L")
        with open(paths["cost"], "rb") as f:
            cost = bytearray(f.read())
        with open(paths["mmap"], "rb") as f:
            mmap_ = bytearray(f.read())
    except OSError as e:
        raise SystemExit(f"读取失败: {e}") from e
    if base.size != (OUT_W, OUT_H) or mask.size != (OUT_W, OUT_H):
        raise SystemExit(f"底图/掩码尺寸须为 {OUT_W}x{OUT_H}")
    if len(cost) != SRC_W * SRC_H or len(mmap_) != SRC_W * SRC_H:
        raise SystemExit("road_cost.bin / mmap_map.bin 尺寸不是 384x256")

    ocean = ocean_mask(mmap_)
    base_bytes = base.tobytes()  # RGB 每像素 3 字节

    img = Image.new("RGB", (OUT_W, OUT_H))
    for oy in range(OUT_H):
        sy0 = oy * SRC_H // OUT_H
        sy1 = max(sy0 + 1, (oy + 1) * SRC_H // OUT_H)
        for ox in range(OUT_W):
            sx0 = ox * SRC_W // OUT_W
            sx1 = max(sx0 + 1, (ox + 1) * SRC_W // OUT_W)
            river = road = sea = False
            for sy in range(sy0, sy1):
                for sx in range(sx0, sx1):
                    i = sy * SRC_W + sx
                    t = mmap_[i]
                    if t in SEA_TILES:
                        if ocean[i]:
                            sea = True
                        else:
                            river = True
                    elif t == COAST_TILE:
                        river = True
                    elif cost[i]:
                        road = True
            if river:
                col = RIVER_COL
            elif road:
                col = ROAD_COL
            else:
                j = (oy * OUT_W + ox) * 3
                ucol = (base_bytes[j], base_bytes[j + 1], base_bytes[j + 2])
                if sea and untouched_sea(ucol):
                    col = SEA_A if (ox + oy) % 2 == 0 else SEA_B
                else:
                    # 陆地 / 用户改过的海侧像素(如海岸阴影): 底图原样
                    col = ucol
            img.putpixel((ox, oy), col)

    out = os.path.join(WEB, "grf", "ui", "minimap_roads.png")
    try:
        img.save(out, optimize=True)
    except OSError as e:
        raise SystemExit(f"写入失败: {e}") from e
    print(f"OK {out} {OUT_W}x{OUT_H}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
