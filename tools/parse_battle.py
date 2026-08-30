"""BATTLE.* 战斗系统资源提取器 (静态逆向 2026-08-23)

格式(逆向自 KI.EXE 加载器 0xCAEB-0xCC27 + 实测渲染验证):
- BATTLE.MAP (877056B):
    头部 0x200B = 256 项目录，每项两个字节：第1字节=地图布局号(0/1/2)，
    第2字节=地形主题号(0,33,35..46 → CS:0xAB4F)。0..213供城战，
    0xC0..0xD5同时是0x4B63野战地形分类返回的目录项。
    地图块位于 0x200 + 布局号*256 个字节（KI.EXE将布局号换算为
    64K:4K地址，因此三个4096B地图块以256B滑窗起点共享底层数据），
    每次读取4096B = **64×64 图块索引表**(16px图块 → 1024px战场)。
- BATTLE.MDL (194560B): 1520 × 128B = 16×16 16色4平面planar图块集(与MMAP.MDL同族,
    行内2B对、平面步进32B)。KI.EXE 按 u16*256 定位读取 256B 子块
- BATTLE.SCH (115200B): 第二图块集, 900 × 128B 同格式
- BATTLE.DAT (8192B): 32 × 256B 配置块; KI.EXE 0xCBE5 以 (军团记录byte[0x4256]*4+序号)<<8
    为偏移读取 —— 军团(0x2240区)每军种的图形/参数配置, 依赖军团区逆向(#7)

输出: web/grf/battle_map_{0,1,2}.png (三种布局, MDL图块集渲染)
      web/grf/battle_atlas_{mdl,sch}.png (图块集总览)
"""

import json
import os

from PIL import Image

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "grf")


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


PAL = load_palette()


def read_dat(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError as e:
        raise RuntimeError(f"无法读取资源文件: {path}") from e


def tile128(tb):
    """128B → 16×16 像素 (4平面, 行内2字节对, 平面步进32B)"""
    px = [[0] * 16 for _ in range(16)]
    for p in range(4):
        for y in range(16):
            b, b2 = tb[y * 2 + p * 32], tb[y * 2 + 1 + p * 32]
            for x in range(8):
                if (b >> (7 - x)) & 1:
                    px[y][x] |= 1 << p
                if (b2 >> (7 - x)) & 1:
                    px[y][x + 8] |= 1 << p
    return px


def save(px, w, h, name, scale=2):
    img = Image.new("P", (w, h))
    img.putpalette([c for rgb in PAL for c in rgb])
    pp: Image.Image.load = img.load()  # type: ignore[assignment]
    for y in range(h):
        for x in range(w):
            pp[x, y] = px[y][x]
    img.resize((w * scale, h * scale), Image.Resampling.NEAREST).save(
        os.path.join(OUT, name)
    )


def atlas_sheet(d, name, cols=40):
    ts = len(d) // 128
    rows = (ts + cols - 1) // cols
    img = Image.new("P", (cols * 16, rows * 16))
    img.putpalette([c for rgb in PAL for c in rgb])
    pp: Image.Image.load = img.load()  # type: ignore[assignment]
    for t in range(ts):
        px = tile128(d[t * 128 : (t + 1) * 128])
        cx, cy = (t % cols) * 16, (t // cols) * 16
        for y in range(16):
            for x in range(16):
                pp[cx + x, cy + y] = px[y][x]
    img.resize((cols * 32, rows * 32), Image.Resampling.NEAREST).save(
        os.path.join(OUT, name)
    )
    return ts


def main():
    try:
        os.makedirs(OUT, exist_ok=True)
    except OSError as e:
        raise RuntimeError(f"无法创建输出目录: {OUT}") from e

    bmap = read_dat(os.path.join(BASE, "Dragon", "BATTLE.MAP"))
    mdl = read_dat(os.path.join(BASE, "Dragon", "BATTLE.MDL"))
    sch = read_dat(os.path.join(BASE, "Dragon", "BATTLE.SCH"))

    n_mdl = atlas_sheet(mdl, "battle_atlas_mdl.png")
    n_sch = atlas_sheet(sch, "battle_atlas_sch.png")
    print(f"atlases: MDL {n_mdl} tiles, SCH {n_sch} tiles")

    tiles = [tile128(mdl[t * 128 : (t + 1) * 128]) for t in range(n_mdl)]
    # 0x4B63 的野战地形分类可返回 BATTLE.MAP 目录 0xC0..0xD5；
    # 城池目录仍是 0..213。统一导出两者实际引用的全部目录项。
    field_directory_indices = range(0xC0, 0xD6)
    referenced_directory_indices = set(range(214)) | set(field_directory_indices)
    seen = set()
    city_layouts = []  # ★战斗系统: 城池→(地形主题,战场布局) 索引
    for c in range(214):
        layout, theme = bmap[c * 2], bmap[c * 2 + 1] & 0xFF
        city_layouts.append({"idx": c, "theme": theme, "layout": layout})

    directory = []
    for directory_idx in sorted(referenced_directory_indices):
        layout = bmap[directory_idx * 2]
        theme = bmap[directory_idx * 2 + 1] & 0xFF
        directory.append({"idx": directory_idx, "theme": theme, "layout": layout})
        if layout in seen:
            continue
        seen.add(layout)
        off = layout * 256 + 0x200
        mc = bmap[off : off + 4096]
        img = Image.new("P", (64 * 16, 64 * 16))
        img.putpalette([c2 for rgb in PAL for c2 in rgb])
        pp: Image.Image.load = img.load()  # type: ignore[assignment]
        for i, tv in enumerate(mc):
            t = tiles[tv % len(tiles)]
            cx, cy = (i % 64) * 16, (i // 64) * 16
            for y in range(16):
                for x in range(16):
                    pp[cx + x, cy + y] = t[y][x]
        img.resize((512, 512), Image.Resampling.NEAREST).save(
            os.path.join(OUT, f"battle_map_{layout}.png")
        )
    print(f"battle maps: layouts {sorted(seen)}")

    # 战场布局索引 → web/battle_maps.json (battle.js 按 c.idx 查 layout)
    # BATTLE.DAT 开场脚本 32 块 × 128 word (u16le) → battle_scripts.json
    # 块号 = 编制类型×4 + 攻守(0/1) (re-notes-kernel.md BATTLE.DAT 节)
    import json

    bdat = read_dat(os.path.join(BASE, "Dragon", "BATTLE.DAT"))
    scripts = [
        [
            int.from_bytes(bdat[b * 256 + i * 2 : b * 256 + i * 2 + 2], "little")
            for i in range(128)
        ]
        for b in range(32)
    ]
    outdir = os.path.dirname(__file__)
    try:
        with open(
            os.path.join(outdir, "..", "web", "battle_maps.json"),
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(
                {"cities": city_layouts, "directory": directory},
                f,
                ensure_ascii=False,
            )
        with open(
            os.path.join(outdir, "..", "web", "battle_scripts.json"),
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(scripts, f)
    except OSError as e:
        raise RuntimeError(f"无法写入 battle_maps/battle_scripts JSON: {e}") from e
    print(
        f"battle_maps.json: {len(city_layouts)} cities; battle_scripts.json: 32 blocks"
    )


if __name__ == "__main__":
    main()
