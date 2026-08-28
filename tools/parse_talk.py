"""
卧龙传 TALK.DAT 解析器 (对白/消息字符串表)
格式: 逆向实测 (2026-08-23)
  - 头部 1024 × u16le 指针表 (0x800=2048B), 指向文件内绝对偏移
  - 第 1024 项 = 0 (哨兵), 有效条目 0..1022
  - 每条目内以 \\x00 分隔多个子串 (对应原版一屏多行/多条消息)
  - 文本为 Big5 繁体中文; 占位符 \\1..\\4 运行时替换为势力/城池/武将名
输出: web/talk.json
"""

import json
import os

SRC = os.path.join(os.path.dirname(__file__), "..", "..", "Dragon", "TALK.DAT")
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "talk.json")

N_PTR = 1024

# 术语修正: 原版为日式汉化译法, 三国语境用词纠正 (保留源文件不动, 输出时替换)
TERM_FIXES = {
  "海戰": "水戰",  # 三国无“海战”一词, 应为水战 (长江/汉水水军)
}


def fix_terms(s: str) -> str:
  for old, new in TERM_FIXES.items():
    s = s.replace(old, new)
  return s


def main():
  try:
    with open(SRC, "rb") as fh:
      d = fh.read()
  except OSError as e:
    raise RuntimeError(f"无法读取 TALK.DAT: {e}") from e

  ptrs = [int.from_bytes(d[i * 2 : i * 2 + 2], "little") for i in range(N_PTR)]
  assert ptrs[0] == N_PTR * 2, f"指针表首项异常: {ptrs[0]:#x}"
  assert ptrs[N_PTR - 1] == 0, "第1024项应为0哨兵"

  strings = []
  for i in range(N_PTR - 1):
    seg = d[ptrs[i] : ptrs[i + 1]]
    subs = [
      fix_terms(p.decode("big5", "replace").replace("\ua140", ""))
      for p in seg.split(b"\x00")
      if p
    ]
    strings.append(subs)

  out = {"count": len(strings), "strings": strings}
  try:
    with open(OUT, "w", encoding="utf-8") as fh:
      json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
  except OSError as e:
    raise RuntimeError(f"无法写入 talk.json: {e}") from e
  print(f"talk.json: {len(strings)} 条目, {os.path.getsize(OUT)} B")


if __name__ == "__main__":
  try:
    main()
  except Exception as e:
    raise SystemExit(f"parse_talk failed: {e}") from e
