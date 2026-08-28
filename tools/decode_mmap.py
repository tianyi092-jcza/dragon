# -*- coding: utf-8 -*-
"""
卧龙传 MMAP.* 解码器
算法逆向自 KI.EXE @0xF5E7-0xF6D9:
  - 跳过文件头 4 字节 (MMAP.MAP 中为 u32 未压缩大小 384*256=98304)
  - 状态机: 逐字节输出；当连续两次读到的字节相同时，下一字节为计数 c:
      c==0 -> 转义(这两个相同字节只是数据)，重新开始一组
      c>0  -> 再重复输出该字节 c 次，重新开始一组
    注意: 计数处理后的下一字节总是作为新组首字节(即使与前组尾相同也不触发)
"""
import os, struct

def rle_decode(data: bytes, skip_header=True) -> bytes:
    i = 4 if skip_header else 0
    n = len(data)
    out = bytearray()
    pos = [i]
    def rb():
        if pos[0] >= n:
            return None
        v = data[pos[0]]; pos[0] += 1
        return v
    b = rb()
    if b is None:
        return bytes(out)
    out.append(b); prev = b
    while True:
        x = rb()
        if x is None: break
        out.append(x)
        if x != prev:
            prev = x
            continue
        c = rb()
        if c is None: break
        if c:
            out.extend([x] * c)
        y = rb()          # 新组首字节
        if y is None: break
        out.append(y); prev = y
    return bytes(out)

def main():
    base = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', 'Dragon'))
    webdir = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'web'))
    for name in ('MMAP.MAP', 'MMAP.MCH', 'MMAP.MDL'):
        d = open(os.path.join(base, name), 'rb').read()
        o = rle_decode(d)
        declared = struct.unpack('<I', d[:4])[0]
        print(f'{name}: {len(d)}B -> {len(o)}B (头声明 {declared})')
        open(os.path.join(webdir, name.lower().replace('.', '_') + '.bin'), 'wb').write(o)

if __name__ == '__main__':
    main()
