# -*- coding: utf-8 -*-
"""用 MMAP.MAP(384x256格) + MMAP.MDL(256个16x16 4平面图块) 渲染完整地图 PNG"""
import os
from PIL import Image

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
WEB = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'web'))

SEASONS=['spring','summer','autumn','winter']

def load_palette(bank=0):
    """从 GAMEPAL.BRG 提取调色板。文件384B=4组×16色(BRG字节序)，对应春夏秋冬。
    每分量低4位有效；EBDC数学(DAC): v=(((nibble<<4)*16+0x80)>>8)<<2 ∈ 0..60步长4。
    RGB888 = v*255//60。季节判定依据: idx14 草地色 春#88AA66/夏#55AA11/秋#DD8800/冬#FFFFFF，
    与 DOSBox 实机截图(196年7月=夏季组)吻合。"""
    d = open(os.path.join(BASE,'Dragon','GAMEPAL.BRG'),'rb').read()
    pal=[]
    for i in range(16):
        b,r,g = d[bank*48+i*3:bank*48+i*3+3]   # BRG 顺序
        def chan(c):
            v=((((c&0x0F)<<4)*16)+0x80)>>8<<2
            return v*255//60
        pal += [chan(r),chan(g),chan(b)]
    return pal

def load_tiles():
    mdl = open(os.path.join(BASE,'Dragon','MMAP.MDL'),'rb').read()
    tiles=[]
    for t in range(256):
        tb=mdl[t*128:(t+1)*128]
        px=[[0]*16 for _ in range(16)]
        for p in range(4):
            for y in range(16):
                b,b2=tb[y*2+p*32],tb[y*2+1+p*32]
                for x in range(8):
                    if (b>>(7-x))&1: px[y][x]|=1<<p
                    if (b2>>(7-x))&1: px[y][x+8]|=1<<p
        tiles.append(px)
    return tiles

def main():
    mmap_ = open(os.path.join(WEB,'mmap_map.bin'),'rb').read()
    W,H = 384,256
    tiles = load_tiles()
    for bank,name in enumerate(SEASONS):
        img = Image.new('P',(W*16,H*16))
        img.putpalette(load_palette(bank)+[0]*(768-len(load_palette(bank))))
        pxl=img.load()
        for cy in range(H):
            for cx in range(W):
                pt=tiles[mmap_[cy*W+cx]]
                for y in range(16):
                    pr=pt[y]
                    for x in range(16): pxl[cx*16+x, cy*16+y]=pr[x]&15
        img.save(os.path.join(WEB,f'map_tiles_{name}.png'),optimize=True)
        print(f'OK web/map_tiles_{name}.png')

if __name__=='__main__':
    main()
