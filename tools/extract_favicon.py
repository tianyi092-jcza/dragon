#!/usr/bin/env python3
"""提取原版羽扇图标并生成网站 Favicon (ICO + PNG)

从原版顶栏工具图标 (grf/ui/tool_ico1.png) 中提取独立羽扇图样：
- 羽毛：纯白反光 (#F0F0F0)、浅黄羽脊 (#F0D090)、浅灰阴影 (#A0B0B0)、深灰收边 (#607070)
- 扇柄：金褐柄身 (#C08020)、深褐立体阴影 (#804020)
- 外围：透明背景，附带 1px 半透明深色轮廓 (#001030cc)，兼顾深色与浅色浏览器标签页
- 规格：打包 16x16, 32x32, 48x48, 64x64 复合 favicon.ico，并输出标准 32x32 及 64x64 Retina favicon.png
"""

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "web", "grf", "ui", "tool_ico1.png")
OUT_DIR = os.path.join(ROOT, "web")


def extract_fan() -> None:
    im = Image.open(SRC)
    w, h = im.size
    pal = im.getpalette() or []
    colors: dict[int, tuple[int, int, int]] = {
        i: (pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]) for i in range(len(pal) // 3)
    }

    # 提取羽扇的所有有效色彩像素
    fan_pixels: dict[tuple[int, int], tuple[int, int, int, int]] = {}
    fan_indices = {2, 4, 5, 6, 7, 8}
    px_access = im.load()
    if px_access is None:
        raise RuntimeError(f"failed to load pixels from {SRC}")

    for y in range(h):
        for x in range(w):
            val = int(px_access[x, y])
            if val in fan_indices and val in colors:
                rgb = colors[val]
                fan_pixels[(x, y)] = (rgb[0], rgb[1], rgb[2], 255)

    min_x = min(x for x, _y in fan_pixels)
    max_x = max(x for x, _y in fan_pixels)
    min_y = min(y for _x, y in fan_pixels)
    max_y = max(y for _x, y in fan_pixels)
    fw = max_x - min_x + 1  # 28
    fh = max_y - min_y + 1  # 22

    # 1:1 放置在 32x32 标准透明画布正中央
    fan32_raw = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    ox = (32 - fw) // 2  # 2
    oy = (32 - fh) // 2  # 5
    for (x, y), rgba in fan_pixels.items():
        fan32_raw.putpixel((x - min_x + ox, y - min_y + oy), rgba)

    raw_access = fan32_raw.load()
    if raw_access is None:
        raise RuntimeError("failed to load fan32_raw pixels")

    # 增加 1px 外轮廓深色暗影，确保在深浅色标签栏上都清晰醒目
    fan32 = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    outline_color = (0, 16, 48, 200)

    for y in range(32):
        for x in range(32):
            cur_pixel = raw_access[x, y]
            alpha = cur_pixel[3] if isinstance(cur_pixel, tuple) else 0
            if alpha == 0:
                has_neighbor = False
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < 32 and 0 <= ny < 32:
                            neighbor = raw_access[nx, ny]
                            n_alpha = neighbor[3] if isinstance(neighbor, tuple) else 0
                            if n_alpha > 0:
                                has_neighbor = True
                                break
                    if has_neighbor:
                        break
                if has_neighbor:
                    fan32.putpixel((x, y), outline_color)
            else:
                color_val = (
                    (
                        cur_pixel[0],
                        cur_pixel[1],
                        cur_pixel[2],
                        cur_pixel[3],
                    )
                    if isinstance(cur_pixel, tuple)
                    else (0, 0, 0, 255)
                )
                fan32.putpixel((x, y), color_val)

    # 生成 64x64 Retina 尺寸 (2x 像素精准无模糊放大 Nearest Neighbor)
    fan64 = fan32.resize((64, 64), Image.Resampling.NEAREST)

    # 导出文件
    png_path = os.path.join(OUT_DIR, "favicon.png")
    ico_path = os.path.join(OUT_DIR, "favicon.ico")

    # favicon.png 保存 32x32 标准清晰度
    fan32.save(png_path, "PNG")
    print(f"Generated {png_path} (32x32)")

    # 同时导出高清版本 favicon-64.png
    png64_path = os.path.join(OUT_DIR, "favicon-64.png")
    fan64.save(png64_path, "PNG")
    print(f"Generated {png64_path} (64x64)")

    # favicon.ico 打包多尺寸
    fan32.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )
    print(f"Generated {ico_path} (16, 32, 48, 64 multi-size ICO)")


if __name__ == "__main__":
    extract_fan()
