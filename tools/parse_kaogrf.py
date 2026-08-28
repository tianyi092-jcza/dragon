# -*- coding: utf-8 -*-
"""KAOGRF.DAT 武将头像提取器
格式(逆向结论): 150条记录×2048字节定长, 无压缩。
64×64像素、16色4平面planar: 平面p位于 p*512 + y*8, 每行8字节高位在前。
调色板用 GAMEPAL.BRG 四季组(默认夏季)。
输出: web/kao/{0..149}.png (2x放大)
"""
import os, json
from PIL import Image

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
WEB = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'web'))
OUTDIR = os.path.join(WEB, 'kao')
W = H = 64


def load_palette(season='summer'):
    pal = json.load(open(os.path.join(os.path.dirname(__file__), 'palette.json'), encoding='utf-8'))
    off = {'spring': 0, 'summer': 16, 'autumn': 32, 'winter': 48}[season]
    return [tuple(int(pal[off + i][j:j + 2], 16) for j in (1, 3, 5)) for i in range(16)]


def decode_portrait(d, idx):
    base = idx * 2048
    out = [[0] * W for _ in range(H)]
    for p in range(4):
        for y in range(H):
            o = base + p * 512 + y * 8
            for bx in range(8):
                b = d[o + bx]
                for k in range(8):
                    if (b >> (7 - k)) & 1:
                        out[y][bx * 8 + k] |= 1 << p
    return out


def main():
    d = open(os.path.join(BASE, 'Dragon', 'KAOGRF.DAT'), 'rb').read()
    n = len(d) // 2048
    os.makedirs(OUTDIR, exist_ok=True)
    pal = load_palette()
    img = Image.new('P', (W, H))
    img.putpalette([c for col in pal for c in col])
    for i in range(n):
        pt = decode_portrait(d, i)
        px = img.load()
        for y in range(H):
            for x in range(W):
                px[x, y] = pt[y][x]
        img.resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(OUTDIR, f'{i}.png'))
    print(f'OK {n} 个头像 -> {OUTDIR}')


if __name__ == '__main__':
    main()
