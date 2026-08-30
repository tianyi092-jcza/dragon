"""导出KI.EXE CAEB加载的目录/tile、SCH 256B块与MDL 0xF800属性块。"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "web" / "battle_navigation.json"
MAP_PATH = ROOT / "Dragon" / "BATTLE.MAP"
SCH_PATH = ROOT / "Dragon" / "BATTLE.SCH"
MDL_PATH = ROOT / "Dragon" / "BATTLE.MDL"


def read_bytes(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except OSError as error:
        raise RuntimeError(f"cannot read {path}") from error


def main() -> None:
    battle_map = read_bytes(MAP_PATH)
    battle_sch = read_bytes(SCH_PATH)
    battle_mdl = read_bytes(MDL_PATH)
    if len(battle_map) < 0x1300:
        raise RuntimeError("BATTLE.MAP is shorter than the directory/tile windows")
    if len(battle_sch) < 0x300:
        raise RuntimeError("BATTLE.SCH is shorter than the three 0x100 blocks")

    layouts: dict[str, dict[str, list[int]]] = {}
    for layout in range(3):
        tile_offset = 0x200 + layout * 0x100
        attribute_offset = 0x1000 + layout * 0xF800
        schedule_offset = layout * 0x100
        layouts[str(layout)] = {
            "tiles": list(battle_map[tile_offset : tile_offset + 0x1000]),
            "schedule": list(battle_sch[schedule_offset : schedule_offset + 0x100]),
            "attributes": list(
                battle_mdl[attribute_offset : attribute_offset + 0xF800]
            ),
        }

    payload = {
        "source": {
            "map": "Dragon/BATTLE.MAP",
            "schedule": "Dragon/BATTLE.SCH",
            "model": "Dragon/BATTLE.MDL",
            "loader": "KI.EXE CS:CAEB..CB74",
            "tileOffset": "0x200 + layout*0x100",
            "attributeOffset": "0x1000 + layout*0xF800",
            "scheduleOffset": "layout*0x100",
        },
        "layouts": layouts,
    }
    try:
        OUT.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
    except OSError as error:
        raise RuntimeError(f"cannot write {OUT}") from error
    print(f"{OUT}: {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
