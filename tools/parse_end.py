"""END_S*.DAT / GAMEOVER.DAT 解析 — 复刻 D7OVER.EXE 0x58F RLE 解压器
格式: [u32 输出尺寸][RLE流]
RLE: 首字节A写出并作标记; 扫描后续字节直到再次出现A; 然后一字节计数N,
     N>0 → 追加A×N; N==0 → 同步点继续。EOF结束。
输出 128000B = mode 12h 640×400×16色 4平面(VGA planar)。
"""

import os
import struct
import sys


def rle_decode(data, out_size, start=4):
    """★成对触发RLE(D7OVER 0x58F): 相邻两字节相等→后一字节为额外计数N,
    追加该字节×N；N==0 仅同步。否则全部是字面量。"""
    out = bytearray()
    i = start
    n = len(data)

    def rd():
        nonlocal i
        if i >= n:
            return None
        v = data[i]
        i += 1
        return v

    while len(out) < out_size:
        a = rd()
        if a is None:
            break
        out.append(a)
        prev = a
        while True:
            b = rd()
            if b is None:
                return bytes(out[:out_size])
            out.append(b)
            if b == prev:
                cnt = rd()
                if cnt is None:
                    return bytes(out[:out_size])
                if cnt:
                    out += bytes([b]) * cnt
                break
            prev = b
    return bytes(out[:out_size])


def planar_to_indexed(raw, w=640, h=200, planes=4, page=0, page_size=None):
    """VGA planar → 每像素索引。每页 = planes×(w*h/8)B, 平面页内连续"""
    if page_size is None:
        page_size = planes * (w * h // 8)
    idx = bytearray(w * h)
    rowb = w // 8
    psize = rowb * h
    base = page * page_size
    for y in range(h):
        rowoff = base + y * rowb
        for xb in range(rowb):
            bits = []
            for p in range(planes):
                off = base + p * psize + y * rowb + xb
                bits.append(raw[off] if off < len(raw) else 0)
            for bit in range(8):
                v = 0
                for p in range(planes):
                    v |= ((bits[p] >> (7 - bit)) & 1) << p
                idx[y * w + xb * 8 + bit] = v
        _ = rowoff
    return idx


def write_ppm(path, idx, pal, w=640, h=400):
    try:
        with open(path, "wb") as f:
            f.write(f"P6\n{w} {h}\n255\n".encode())
            for v in idx:
                f.write(bytes(pal[v * 3 : v * 3 + 3]))
        return True
    except OSError as e:
        print(f"写 {path} 失败: {e}")
        return False


def load_brg(path, entries=16):
    """4bit RGB ×3B/色 → 缩放到 0..255"""
    try:
        with open(path, "rb") as f:
            d = f.read()
    except OSError as e:
        print(f"读 {path} 失败: {e}")
        return b""
    d = d[: entries * 3]
    return bytes(min(255, c * 17) for c in d)


def main():
    import glob

    from PIL import Image

    src = sys.argv[1] if len(sys.argv) > 1 else "E:/Dragon/Dragon/GAMEOVER.DAT"
    outdir = sys.argv[2] if len(sys.argv) > 2 else "tools/_end_test"
    try:
        os.makedirs(outdir, exist_ok=True)
        with open(src, "rb") as f:
            d = f.read()
    except OSError as e:
        print(f"输入不可用: {e}")
        return 1
    size = struct.unpack("<I", d[:4])[0]
    print(f"{src}: {len(d)}B → 宣称输出 {size}B")
    raw = rle_decode(d, size)
    print(f"解码 {len(raw)}B, 前16: {raw[:16].hex()}")
    # 双页布局: 每 64000B = 640×200×4平面完整屏
    ok = True
    for page in range(2):
        idx = planar_to_indexed(raw, page=page)
        pal = load_brg("E:/Dragon/Dragon/OVERPAL.BRG")
        ok = write_ppm(os.path.join(outdir, f"out_p{page}.ppm"), idx, list(pal), h=200)
        if ok:
            print(f"已写 {outdir}/out_p{page}.ppm")

    # ---- 批量: GAMEOVER + END_S1..12 → web/grf/*.png ----
    webgrf = os.path.join(os.path.dirname(__file__), "..", "web", "grf")
    endpal = load_brg("E:/Dragon/Dragon/ENDPAL.BRG")  # 12组×16色, 先用第0组
    jobs = [
        (
            "E:/Dragon/Dragon/GAMEOVER.DAT",
            "gameover.png",
            load_brg("E:/Dragon/Dragon/OVERPAL.BRG"),
        )
    ]
    for p in sorted(glob.glob("E:/Dragon/Dragon/END_S*.DAT")):
        n = os.path.basename(p).replace("END_S", "").replace(".DAT", "")
        try:
            num = int(n)
        except ValueError:
            continue
        if 1 <= num <= 12:
            jobs.append((p, f"end_s{num}.png", endpal))
    for path, name, pal in jobs:
        try:
            with open(path, "rb") as f:
                dd = f.read()
        except OSError as e:
            print(f"跳过 {path}: {e}")
            continue
        sz = struct.unpack("<I", dd[:4])[0]
        if sz == 128000:
            rw = rle_decode(dd, sz)
            full = bytearray(640 * 400)
            for pg in range(2):
                full[pg * 640 * 200 : (pg + 1) * 640 * 200] = planar_to_indexed(
                    rw, page=pg
                )
            w, h = 640, 400
        elif sz == 91200:
            # END_S1 特例: 单页 640×285 (4平面×22800B)
            rw = rle_decode(dd, sz)
            full = planar_to_indexed(rw, w=640, h=285)
            w, h = 640, 285
        else:
            print(f"跳过 {name}: 非标尺寸 {sz}")
            continue
        img = Image.frombytes(
            "RGB", (w, h), bytes(b for v in full for b in pal[v * 3 : v * 3 + 3])
        )
        out = os.path.normpath(os.path.join(webgrf, name))
        img.save(out)
        print(f"OK {name} <- {os.path.basename(path)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
