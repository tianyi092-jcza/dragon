"""导出 KI.EXE CAEB 装载的 214 张地图与三个 MDL 属性块。"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "web" / "battle_navigation.json"
MAP_PATH = ROOT / "Dragon" / "BATTLE.MAP"
MDL_PATH = ROOT / "Dragon" / "BATTLE.MDL"
MAP_COUNT = 214
MAP_SIZE = 0x1000
MAP_BASE = 0x200
ATTRIBUTE_SIZE = 0x800
MDL_LAYOUT_SIZE = 0xF800


def read_bytes(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except OSError as error:
        raise RuntimeError(f"cannot read {path}") from error


def main() -> None:
    battle_map = read_bytes(MAP_PATH)
    battle_mdl = read_bytes(MDL_PATH)
    expected_map_size = MAP_BASE + MAP_COUNT * MAP_SIZE
    if len(battle_map) != expected_map_size:
        raise RuntimeError(f"BATTLE.MAP must contain exactly {expected_map_size} bytes")
    expected_mdl_size = 0x1000 + 3 * MDL_LAYOUT_SIZE
    if len(battle_mdl) != expected_mdl_size:
        raise RuntimeError(f"BATTLE.MDL must contain exactly {expected_mdl_size} bytes")

    layouts: dict[str, dict[str, list[int]]] = {}
    for layout in range(3):
        attribute_offset = 0x1000 + layout * MDL_LAYOUT_SIZE
        layouts[str(layout)] = {
            "attributes": list(
                battle_mdl[attribute_offset : attribute_offset + ATTRIBUTE_SIZE]
            )
        }

    maps: dict[str, list[int]] = {}
    for directory_index in range(MAP_COUNT):
        tile_offset = MAP_BASE + directory_index * MAP_SIZE
        maps[str(directory_index)] = list(
            battle_map[tile_offset : tile_offset + MAP_SIZE]
        )

    payload = {
        "source": {
            "map": "Dragon/BATTLE.MAP",
            "model": "Dragon/BATTLE.MDL",
            "loader": "KI.EXE CS:CAEB..CB71",
            "tileOffset": "0x200 + directoryIndex*0x1000",
            "attributeOffset": "0x1000 + layout*0xF800",
            "attributeSize": "0x800",
        },
        "maps": maps,
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
