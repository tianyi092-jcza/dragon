#!/usr/bin/env python3
"""提取开场 UI 素材（ICONGRF.DAT → web/grf/ui/）

逆向依据（见 docs/SESSION_HANDOFF.md §开场UI + 与 DOSBox 截图逐像素比对）：
- 云纹瓦片 = ICONGRF 0xBA20, 128B, 1bpp 32×32 盘龙纹章
  位0=调色板idx8 蓝(#002266 背景), 位1=黑(龙纹) —— 与原版截图比对确认
- 金框拼片（8×8 1bpp, 基址 0x9DC8, 与截图 □ 链匹配）:
  +0x00 方框链片(顶/底带): 1位=绿 idx5, 0位=红 idx10 (不透明, 放大截图定色)
  +0x30 实心角块(柱顶/底帽): 全金 idx11
  +0x38 柱身 0x9E00(6c=.GG.GG..): 左条金 idx11 + EGA掩码(0x0B/0x07)右条奶油 idx9/深橙 idx7
- 金色=idx11 #FFAA00、红=idx10 #DD0000、绿=idx5 #559944（与 DOSBox 截图比对）
"""

import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "Dragon", "ICONGRF.DAT")
OUT = os.path.join(ROOT, "web", "grf", "ui")
try:
    with open(os.path.join(ROOT, "tools", "palette.json"), encoding="utf-8") as f:
        PAL = json.load(f)
except FileNotFoundError as err:
    raise SystemExit("palette.json not found; run from repo tools/ dir") from err
BLUE = tuple(int(PAL[8][i : i + 2], 16) for i in (1, 3, 5))  # idx8 #002266
GOLD = tuple(int(PAL[11][i : i + 2], 16) for i in (1, 3, 5))  # idx11 #FFAA00
GREEN = tuple(int(PAL[5][i : i + 2], 16) for i in (1, 3, 5))  # idx5 #559944
LGREEN = tuple(int(PAL[13][i : i + 2], 16) for i in (1, 3, 5))  # idx13 #88AA66
RED = tuple(int(PAL[10][i : i + 2], 16) for i in (1, 3, 5))  # idx10 #DD0000
CREAM = tuple(int(PAL[9][i : i + 2], 16) for i in (1, 3, 5))  # idx9 #FFDD99
DARK = tuple(int(PAL[7][i : i + 2], 16) for i in (1, 3, 5))  # idx7 #CC8822
BLACK = (0, 0, 0)

try:
    os.makedirs(OUT, exist_ok=True)
except OSError as err:
    raise SystemExit(f"cannot create {OUT}: {err}") from err
try:
    with open(SRC, "rb") as f:
        D = f.read()
except FileNotFoundError as err:
    raise SystemExit("ICONGRF.DAT not found; run from repo tools/ dir") from err


def img1bpp(buf, w, h, on, off=BLACK):
    im = Image.new("RGB", (w, h))
    px = []
    for b in buf[: w * h // 8]:
        for bit in range(7, -1, -1):
            px.append(on if (b >> bit) & 1 else off)
    im.putdata(px)
    return im


def tile_rgba(off):
    """8×8 1bpp → RGBA（位1=金不透明, 位0=透明）"""
    b = D[off : off + 8]
    im = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    for y in range(8):
        for x in range(8):
            if (b[y] >> (7 - x)) & 1:
                im.putpixel((x, y), GOLD + (255,))
    return im


def save(im, name, scale=1):
    if scale > 1:
        im = im.resize((im.width * scale, im.height * scale), Image.Resampling.NEAREST)
    im.save(os.path.join(OUT, name))
    print(name, im.size)


# 云纹瓦片 32×32 (最后128B): 位0=蓝底, 位1=黑龙
save(img1bpp(D[0xBA20:0xBAA0], 32, 32, BLACK, off=BLUE), "cloud.png", 1)

# 金框拼片 (基址 0x9DC8)
# 顶/底带: 回形方框链 0x9DC8 —— 1位=金 idx11, 0位=红 idx10 (不透明, 原版放大图定色)
sq = D[0x9DC8:0x9DD0]
im = Image.new("RGB", (8, 8))
im.putdata(
    [(GOLD if (sq[y] >> (7 - x)) & 1 else RED) for y in range(8) for x in range(8)]
)
save(im, "frame_sq.png")

# 角帽: 实心块 0x9DF8 全金 (柱顶/底各一带)
save(tile_rgba(0x9DF8), "frame_cap.png")

# 柱身: 编织纹 0x9DE0 (6c 56×6 6c = 绳纹链) —— 1位=浅绿 idx13 高光, 0位=绿 idx5 底
# (不透明; 原版柱=绿编织链+金角帽, 与按钮同族绿, 并排对比图定色)
braid = D[0x9DE0:0x9DE8]
im = Image.new("RGB", (8, 8))
im.putdata(
    [
        (LGREEN if (braid[y] >> (7 - x)) & 1 else GREEN)
        for y in range(8)
        for x in range(8)
    ]
)
save(im, "frame_col.png")

print("done ->", OUT)
