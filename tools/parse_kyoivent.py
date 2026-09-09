"""KYOGRF.DAT / IVENTGRF.DAT 图形提取器

格式(逆向实锤 2026-09-09 对齐原版汇编 0xFA37/0xFAA2):
- 16色 4平面 planar, 平面主序, 行内高位在前。
- KYOGRF.DAT (69120B): 15条 × 0x1200B, 每条一幅 96×96 城市风景视图。
  加载器 0x7F1A: 偏移=idx*0x1200, blit ax=0x6006 → ah=行数96/al=行字节6。
- IVENTGRF.DAT (76032B): 3事件 × 0x6300B (25344B)。
  KI.EXE 0xFA37 blit: ax=0xb012 (dl=0x12=18 double-bytes=36字节/行=288像素宽, dh=0xb0=176行高)。
  每事件为一幅 288×176 原生插画:
  - 0: 军师/君主议事 (进言)
  - 1: 朝堂百官议政 (内政/外交预算)
  - 2: 外交互动/使节
- 调色板: GAMEPAL.BRG 夏季组(palette.json off=16), 与头像一致。

输出: web/grf/kyo_XX.png (2x), web/grf/ivent_N.png (288×176 原寸)
"""

import json
import os

from PIL import Image

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
WEB = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "web"))
OUTDIR = os.path.join(WEB, "grf")


def load_palette(off=16):
    p = os.path.join(os.path.dirname(__file__), "palette.json")
    try:
        with open(p, encoding="utf-8") as f:
            pal = json.load(f)
    except OSError as e:
        raise RuntimeError(f"无法读取调色板: {p}") from e
    return [
        tuple(int(pal[off + i][j : j + 2], 16) for j in (1, 3, 5)) for i in range(16)
    ]


def decode_planar(d, base, w, h):
    """标准 4-plane planar 解码 (w 像素宽, h 像素高)"""
    px = [[0] * w for _ in range(h)]
    pstride = (w // 8) * h
    for p in range(4):
        for y in range(h):
            o = base + p * pstride + y * (w // 8)
            for bx in range(w // 8):
                b = d[o + bx]
                for k in range(8):
                    if (b >> (7 - k)) & 1:
                        px[y][bx * 8 + k] |= 1 << p
    return px


def save(px, w, h, name, scale=1):
    img = Image.new("P", (w, h))
    img.putpalette([c for rgb in PAL for c in rgb])
    pp: Image.Image.load = img.load()  # type: ignore[assignment]
    for y in range(h):
        for x in range(w):
            pp[x, y] = px[y][x]
    if scale != 1:
        img = img.resize((w * scale, h * scale), Image.Resampling.NEAREST)
    img.save(os.path.join(OUTDIR, name))


PAL = load_palette()


def read_dat(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError as e:
        raise RuntimeError(f"无法读取资源文件: {path}") from e


def main():
    try:
        os.makedirs(OUTDIR, exist_ok=True)
    except OSError as e:
        raise RuntimeError(f"无法创建输出目录: {OUTDIR}") from e
    d = read_dat(os.path.join(BASE, "Dragon", "KYOGRF.DAT"))
    n = len(d) // 0x1200
    for i in range(n):
        save(decode_planar(d, i * 0x1200, 96, 96), 96, 96, f"kyo_{i:02d}.png", scale=2)
    print(f"KYOGRF: {n} views")

    d = read_dat(os.path.join(BASE, "Dragon", "IVENTGRF.DAT"))
    n = len(d) // 0x6300
    for r in range(n):
        px = decode_planar(d, r * 0x6300, 288, 176)
        save(px, 288, 176, f"ivent_{r}.png", scale=1)
    print(f"IVENTGRF: {n} events (288x176)")


if __name__ == "__main__":
    main()
