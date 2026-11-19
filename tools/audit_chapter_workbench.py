"""CHAPTER-WB P0: read only five explicit SINARIO sources; never access saves.
Run from repository: python -X utf8 -B tools/audit_chapter_workbench.py <new-output-dir>
The exclusive output directory contains the raw-source receipt, not game content.
"""
import hashlib
import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from parse_sinario import SC_SIZE, parse_scenario


def main():
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=False)
    root = Path(__file__).resolve().parents[2]
    sources = []
    chapters = []
    names = defaultdict(list)
    people = defaultdict(list)
    for directory in ("原版", "上", "中", "下", "后"):
        path = root / directory / "SINARIO.DAT"
        data = path.read_bytes()
        sources.append({"path": str(path), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        # A short event tail remains explicitly unknown; never pad the source.
        if len(data) < SC_SIZE * 3 + 0x52C0 or len(data) > SC_SIZE * 4:
            raise ValueError(f"unsupported chapter extent: {path}")
        for index in range(4):
            raw = data[index * SC_SIZE:(index + 1) * SC_SIZE]
            state = parse_scenario(raw)
            key = f"{directory}:{index + 1}"
            name = unicodedata.normalize("NFC", state["name"].strip())
            names[name].append(key)
            capitals = defaultdict(list)
            mismatches = []
            invalid = []
            for faction in state["factions"]:
                capital = faction["capital"]
                capitals[capital].append(faction["idx"])
                city = next((row for row in state["cities"] if row["idx"] == capital), None)
                if city is None:
                    invalid.append({"factionSlot": faction["idx"], "capital": capital})
                elif city["faction"] != faction["idx"]:
                    mismatches.append({"factionSlot": faction["idx"], "monarch": faction["monarch"],
                                       "citySlot": capital, "cityName": city["name"],
                                       "currentOwner": city["faction"], "expectedOwner": faction["idx"],
                                       "sourceOffset": index * SC_SIZE + 0x8C0 + capital * 32 + 1})
            for general in state["generals"]:
                if general["idx"] == 127:
                    continue
                identity = unicodedata.normalize("NFC", general["name"].strip())
                people[identity].append({"chapter": key, "slot": general["idx"],
                                         "recordSha256": hashlib.sha256(raw[0x42C0 + general["idx"] * 32:0x42E0 + general["idx"] * 32]).hexdigest()})
            chapters.append({"source": key, "name": state["name"], "nameCodePoints": len(name),
                             "start": state["start"], "declaredFactions": state["n_factions"],
                             "factionSlots": [f["idx"] for f in state["factions"]],
                             "trust": state["trust"], "tax": state["tax"], "nextTax": state["next_tax"],
                             "conscriptionPeople": state["conscription"], "nextConscriptionPeople": state["next_conscription"],
                             "monthlyPolicyRaw": state["nativeMonthlyPolicyRaw"],
                             "capitalOwnerMismatches": mismatches, "invalidCapitals": invalid,
                             "duplicateCapitals": [{"citySlot": slot, "factions": slots} for slot, slots in capitals.items() if len(slots) > 1],
                             "eventTailBytes": len(raw[0x52C0:0x56C0]),
                             "general127Raw": raw[0x52A0:0x52C0].hex()})
    report = {"scope": "raw-source inventory; not mechanism certification or migration",
              "toolSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "parserSha256": hashlib.sha256(Path(__file__).with_name("parse_sinario.py").read_bytes()).hexdigest(),
              "sources": sources, "chapters": chapters,
              "duplicateNames": {name: refs for name, refs in names.items() if len(refs) > 1},
              "generalNameOccurrences": dict(people)}
    (output / "baseline.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"chapters": len(chapters), "capitalOwnerMismatches": sum(len(c["capitalOwnerMismatches"]) for c in chapters),
                      "duplicateCapitalChapters": sum(bool(c["duplicateCapitals"]) for c in chapters),
                      "invalidCapitalChapters": sum(bool(c["invalidCapitals"]) for c in chapters),
                      "duplicateNames": report["duplicateNames"], "distinctGeneralNames": len(people),
                      "receipt": str(output / "baseline.json")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
