#!/usr/bin/env python3
"""OPEN_S1..S6.DAT 开场动画导出 — 复用 parse_end 的 RLE/planar 解码
布局结论(见 docs):
  S1 = 640×350 EGA 单张全景(前 56000B) + 文本尾块(不导出)
  S2..S6 = 320×200×16色 多帧动画, 每帧 32000B = 4平面×8000B 平面连续
输出: web/grf/open_s{n}.png / open_s{n}_f{i}.png (PNG, 用 OPENPAL.BRG 组0)
依赖 Pillow; 无 Pillow 时回退 PPM。
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from parse_end import load_brg, planar_to_indexed, rle_decode  # noqa: E402

SRC = r"E:\Dragon\Dragon"
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "grf")
PAL_PATH = os.path.join(SRC, "OPENPAL.BRG")

# (文件名, 布局) layout: "ega640x350" 或 ("anim", frames)
LAYOUTS = {
    1: ("ega640x350", None),
    2: ("anim", 12),
    3: ("anim", 12),
    4: ("anim", 12),
    5: ("anim", 9),
    6: ("anim", 4),
}

FRAME_BYTES = 32000  # 4 planes × 8000


def write_png(path, idx, pal, w, h):
    try:
        from PIL import Image

        img = Image.new("P", (w, h))
        img.putdata(list(idx))
        img.putpalette(list(pal))
        img.save(path)
        return True
    except ImportError:
        return False


def write_ppm(path, idx, pal, w, h):
    try:
        with open(path, "wb") as f:
            f.write(f"P6\n{w} {h}\n255\n".encode())
            for v in idx:
                f.write(bytes(pal[v * 3 : v * 3 + 3]))
        return True
    except OSError as e:
        print(f"写 {path} 失败: {e}")
        return False


def main():
    try:
        os.makedirs(OUT, exist_ok=True)
    except OSError as e:
        sys.exit(f"建目录失败: {e}")
    pal = load_brg(PAL_PATH)
    if not pal:
        sys.exit("无法读取调色板")
    total = 0
    for n, (layout, frames) in LAYOUTS.items():
        src = os.path.join(SRC, f"OPEN_S{n}.DAT")
        try:
            with open(src, "rb") as f:
                raw = rle_decode(f.read(), 1 << 20)
        except OSError as e:
            print(f"跳过 S{n}: {e}")
            continue
        if layout == "ega640x350":
            w, h = 640, 350
            idx = planar_to_indexed(raw[: w * h // 8 * 4], w=w, h=h)
            name = f"open_s{n}.png"
            p = os.path.join(OUT, name)
            ok = write_png(p, idx, pal, w, h)
            if not ok:
                write_ppm(p[:-4] + ".ppm", idx, pal, w, h)
            print(f"S{n}: {w}x{h} -> {name}")
            total += 1
        else:
            count = 0
            for i in range(frames):
                chunk = raw[i * FRAME_BYTES : (i + 1) * FRAME_BYTES]
                if len(chunk) < FRAME_BYTES:
                    break
                idx = planar_to_indexed(chunk, w=320, h=200)
                name = f"open_s{n}_f{i}.png"
                p = os.path.join(OUT, name)
                if not write_png(p, idx, pal, 320, 200):
                    write_ppm(p[:-4] + ".ppm", idx, pal, 320, 200)
                count += 1
            print(f"S{n}: {count} 帧 -> open_s{n}_f*.png")
            total += count
    print(f"共导出 {total} 张 -> {os.path.abspath(OUT)}")


if __name__ == "__main__":
    main()
