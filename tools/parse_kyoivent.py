"""KYOGRF.DAT / IVENTGRF.DAT 图形提取器

格式(逆向结论 2026-08-23, 全静态破解, 无需DOSBox-X):
- 16色 4平面 planar, 平面主序(与 KAOGRF 同族), 行内高位在前。
- KYOGRF.DAT (69120B): 15条 × 0x1200B, 每条一幅 96×96 城市风景视图。
  索引来源: 城市结构 raw[0x16]>>4 (KI.EXE 0x7F21: mov al,[si+0x16]; shr al,4)。
  加载器 0x7F1A: 偏移=idx*0x1200, blit ax=0x6006 → ah=行数96/al=行字节6。
- IVENTGRF.DAT (76032B): 3事件 × 0x6300B。每事件 = ★行交错双帧★:
  每平面 352 行, 偶数行=场景A, 奇数行=场景B, 各 144×176。
  (blit ax=0xb012 → 176行×18字节=12672B; 若按单帧平面序解码会得到两图交织的乱码)
  加载器 0x3D09 (事件号al), 调用点 0x3849/0x393D/0x3A23/0x3B21。
- 调色板: GAMEPAL.BRG 夏季组(palette.json off=16), 与头像一致。

输出: web/grf/kyo_XX.png (2x), web/grf/ivent_N_{a,b}.png (2x)
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


def decode_planar(d, base, w, h, parity=None):
    """parity=None 普通 plane-major; 0/1 = 行交错双帧取偶/奇数行"""
    px = [[0] * w for _ in range(h)]
    rows_per_plane = h if parity is None else h * 2
    row_step = 1 if parity is None else 2
    pstride = (w // 8) * rows_per_plane
    for p in range(4):
        for y in range(h):
            o = base + p * pstride + (y * row_step + (parity or 0)) * (w // 8)
            for bx in range(w // 8):
                b = d[o + bx]
                for k in range(8):
                    if (b >> (7 - k)) & 1:
                        px[y][bx * 8 + k] |= 1 << p
    return px


def save(px, w, h, name, scale=2):
    img = Image.new("P", (w, h))
    img.putpalette([c for rgb in PAL for c in rgb])
    pp: Image.Image.load = img.load()  # type: ignore[assignment]
    for y in range(h):
        for x in range(w):
            pp[x, y] = px[y][x]
    img.resize((w * scale, h * scale), Image.Resampling.NEAREST).save(
        os.path.join(OUTDIR, name)
    )


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
        save(decode_planar(d, i * 0x1200, 96, 96), 96, 96, f"kyo_{i:02d}.png")
    print(f"KYOGRF: {n} views")

    d = read_dat(os.path.join(BASE, "Dragon", "IVENTGRF.DAT"))
    n = len(d) // 0x6300
    for r in range(n):
        for par, tag in ((0, "a"), (1, "b")):
            save(
                decode_planar(d, r * 0x6300, 144, 176, par),
                144,
                176,
                f"ivent_{r}_{tag}.png",
            )
    print(f"IVENTGRF: {n} events x2 frames")


if __name__ == "__main__":
    main()
