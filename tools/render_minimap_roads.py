"""小地图底图: 从 MMAP.MAP + road_cost.bin 生成带棋盘抖动的道路/河流/海域底图
输出: web/grf/ui/minimap_roads.png 208x139 (与 gamebar.drawMini 显示尺寸 1:1)

逆向结论 (docs/checkpoint-journal.md):
  - 原版小地图底纹不是精灵图, 是逐像素棋盘抖动 (VGA mode 0x12 16色):
    陆地 = 卡其(240,208,144) 与 灰褐(197,191,161) 50/50 棋盘
    海洋 = 藏青(0,30,90) 与 近黑(0,2,5) 50/50 棋盘
  - 绿色(64,96,64) = 河流/海岸: tile95 洪水填充连通地图边缘=海洋, 孤立95=河流; tile202=海岸浅水
  - 棕色路网 = road_cost==1 且在陆地 tile 上 (海/河全部 cost==1, 需排除)
"""

import os

from PIL import Image

WEB = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "web"))

SEA_TILES = {95, 191}  # 水域 tile (海洋/河流)
COAST_TILE = 202  # 海岸浅水

# 配色 (从原游戏截图取样)
LAND_A0 = (240, 208, 144)  # 卡其 (左上角) #F0D090
LAND_A1 = (212, 175, 55)  # 深金 (右下角) #D4AF37
LAND_B = (197, 191, 161)  # 灰褐 (棋盘抖动第二色)
SEA_A = (0, 30, 90)  # 藏青
SEA_B = (0, 2, 5)  # 近黑
RIVER_COL = (64, 96, 64)  # 河流/海岸绿
ROAD_COL = (90, 58, 35)  # 深棕路网

SRC_W, SRC_H = 384, 256
OUT_W, OUT_H = 208, 139  # drawMini 内区地图尺寸


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


def main():
    cost_path = os.path.join(WEB, "road_cost.bin")
    mmap_path = os.path.join(WEB, "mmap_map.bin")
    for p in (cost_path, mmap_path):
        if not os.path.exists(p):
            raise SystemExit(f"缺少 {p}")
    try:
        with open(cost_path, "rb") as f:
            cost = bytearray(f.read())
        with open(mmap_path, "rb") as f:
            mmap_ = bytearray(f.read())
    except OSError as e:
        raise SystemExit(f"读取失败: {e}") from e
    if len(cost) != SRC_W * SRC_H or len(mmap_) != SRC_W * SRC_H:
        raise SystemExit("road_cost.bin / mmap_map.bin 尺寸不是 384x256")

    ocean = ocean_mask(mmap_)

    img = Image.new("RGB", (OUT_W, OUT_H))
    for oy in range(OUT_H):
        # 源区域: 每输出像素覆盖 ~1.846x1.841 源 tile
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
            # 优先级: 河流 > 道路 > 海洋 > 陆地
            if river:
                col = RIVER_COL
            elif road:
                col = ROAD_COL
            elif sea:
                col = SEA_A if (ox + oy) % 2 == 0 else SEA_B
            else:
                if (ox + oy) % 2 == 0:
                    # 陆地左上→右下对角渐变 #F0D090→#D4AF37
                    t = (ox / (OUT_W - 1) + oy / (OUT_H - 1)) / 2
                    col = tuple(
                        round(a + (b - a) * t)
                        for a, b in zip(LAND_A0, LAND_A1, strict=True)
                    )
                else:
                    col = LAND_B
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
