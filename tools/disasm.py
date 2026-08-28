# -*- coding: utf-8 -*-
"""KI.EXE 反汇编辅助工具 (复用: python -i disasm.py 或 import)"""
import pickle, os
from capstone import Cs, CS_ARCH_X86, CS_MODE_16

EXE = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', 'Dragon', 'KI.EXE'))
LOAD = 0x200          # MZ header size (header para = 0x20)
md = Cs(CS_ARCH_X86, CS_MODE_16)
md.detail = False

_d = None
def data():
    global _d
    if _d is None:
        _d = open(EXE, 'rb').read()
    return _d

def va_range(start, end):
    """线性反汇编 [start,end) 加载模块偏移"""
    out = []
    for ins in md.disasm(data()[LOAD+start:LOAD+end], start):
        out.append(f'{ins.address:04X}: {ins.bytes.hex():<14} {ins.mnemonic} {ins.op_str}')
    return '\n'.join(out)

def func(start, max_len=0x400):
    """从 start 线性反汇编 max_len 字节"""
    return va_range(start, start+max_len)

def callers(target, search_data=None):
    """扫描 call rel16 指向 target 的位置"""
    d = search_data if search_data is not None else data()
    hits = []
    for off in range(LOAD, len(d)-3):
        if d[off] == 0xE8:
            rel = int.from_bytes(d[off+1:off+3], 'little')
            if ((off-LOAD+3+rel) & 0xFFFF) == target:
                hits.append(off-LOAD)
    return hits

def imm_refs(value, width=2):
    """找立即数 value 出现的位置(小端)"""
    d = data()
    pat = value.to_bytes(width, 'little')
    hits, i = [], 0
    while True:
        i = d.find(pat, i)
        if i < 0: break
        hits.append(i-LOAD)
        i += 1
    return [h for h in hits if h >= 0]

def code_addrs():
    """之前递归下降得到的真实代码地址集"""
    p = os.path.join(os.path.dirname(__file__), 'code_addrs.pkl')
    return pickle.load(open(p, 'rb')) if os.path.exists(p) else None

def cs_ref(addr):
    """找 mov reg,cs:[addr] / word ptr cs:[addr] 形式引用 addr 的代码位置"""
    # 常见编码: 2E xx xx <addr_le>
    d = data()
    pat = addr.to_bytes(2, 'little')
    hits, i = [], 0
    while True:
        i = d.find(pat, i)
        if i < 0 or i > len(d)-4: break
        # 前缀检查: 前两字节含 2E(cs:) 且第三字节是常见 modrm 操作码
        pre = d[i-2:i]
        op = d[i+2] if i+2 < len(d) else 0
        if 0x2E in pre or op in (0x8B,0x89,0x83,0x81,0x80,0xC6,0xC7,0x8A,0x88,0xA1,0xA3,0x3B,0x39):
            hits.append((i-LOAD, d[max(0,i-3):i+5].hex(' ')))
        i += 1
    return hits

if __name__ == '__main__':
    print('KI.EXE loaded. 用法: func(0x9377), callers(0x9377), va_range(a,b), cs_ref(0xCF2)')
