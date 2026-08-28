"""提取自創軍師命名文字庫 — END_S15.DAT (KI.EXE 0x8FC8 加載, [0x5221]門控)
格式: 2621 個 u16le Big5 碼點序列 (尾段 B2F3→B343 連續遞增為碼表特徵)
輸出: web/nametable.json {"chars": [...]}
"""

import json
import os

SRC = os.path.join(os.path.dirname(__file__), "..", "..", "Dragon", "END_S15.DAT")
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "nametable.json")


def main():
    # pi-lens-ignore: unvalidated-input
    try:
        with open(SRC, "rb") as fh:
            d = fh.read()
    except OSError as e:
        raise SystemExit(f"无法读取源文件 {SRC}: {e}") from e
    assert len(d) % 2 == 0, f"意外的大小 {len(d)}"
    chars = [d[i : i + 2].decode("big5", "replace") for i in range(0, len(d), 2)]
    # pi-lens-ignore: unvalidated-input
    try:
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump({"chars": chars}, fh, ensure_ascii=False)
    except OSError as e:
        raise SystemExit(f"无法写入输出 {OUT}: {e}") from e
    print(f"OK {len(chars)} 字 -> {os.path.abspath(OUT)}")


if __name__ == "__main__":
    main()
