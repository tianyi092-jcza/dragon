"""导出 KI.EXE 战术规则查表资产。

当前仅导出已由 0xAA2C/0xAA7E 指令流确认的 0xCCE4 起 48×(dx,dy)
有符号阵型向量。产品规则层不得在 JS 中手抄或猜测该表。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT.parent / "Dragon" / "KI.EXE"
OUT = ROOT / "web" / "battle_rules.json"
MZ_LOAD = 0x200
FORMATION_VECTOR_OFFSET = 0xCCE4
FORMATION_VECTOR_SIZE = 0x60


def signed_byte(value: int) -> int:
    return value - 0x100 if value >= 0x80 else value


def main() -> None:
    raw = EXE.read_bytes()
    block = raw[
        MZ_LOAD + FORMATION_VECTOR_OFFSET :
        MZ_LOAD + FORMATION_VECTOR_OFFSET + FORMATION_VECTOR_SIZE
    ]
    if len(block) != FORMATION_VECTOR_SIZE:
        raise SystemExit("KI.EXE formation-vector table is truncated")
    vectors = [
        [signed_byte(block[index]), signed_byte(block[index + 1])]
        for index in range(0, len(block), 2)
    ]
    payload = {
        "source": {
            "file": "KI.EXE",
            "loadOffset": MZ_LOAD,
            "formationVectorOffset": FORMATION_VECTOR_OFFSET,
        },
        "formationVectors": vectors,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"battle rules OK: {len(vectors)} formation vectors -> {OUT}")


if __name__ == "__main__":
    main()
