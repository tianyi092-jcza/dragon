"""Focused KI/entity certificates, not an unused-field or whole-game proof.

Run: python -X utf8 -B tools/verify_entity_fields.py [--distributions]
Only the fixed non-save inputs below are opened, read-only. No path arguments,
search, pickle, game imports, generated Web data, KI execution or output files.
The formulas certify the documented instruction windows, not arbitrary inputs.
"""

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# This is deliberately not a configurable directory or wildcard input list.
SOURCES = {
    "Dragon/KI.EXE": "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
    "原版/SINARIO.DAT": "4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87",
    "Dragon/MMAP.MAP": "51b6fcaa390c80bd8a358dcacbf7d8dbb6dfeb0e048d8c3bdd86329df3401bcf",
    "Dragon/MMAP.MDL": "2fa1dd1b1ec7c426cf22583334a62dc61bdb1f1cefc59cbe8e9827480d118d1d",
    "Dragon/MMAP.MCH": "b10a5b64bbffa672c1fb5cb37703ac4c14b18bf1166cc47c4e802c19aae9f8f7",
    "Dragon/BATTLE.MAP": "8bbb2867ed526a2dcd2fcc1e0202a93952dcd113d3720936fd7304fd9e3ef872",
    "Dragon/BATTLE.MDL": "3522f7362f928fae45c1431a9efe57e285250d9db05d04ebdcb59f420e3e0bd3",
    "Dragon/BATTLE.DAT": "89e311cd59d0e5d943762f03230c6db419c2d77730b2591429651445d19ef120",
    "Dragon/KYOGRF.DAT": "e086f526bdada5baf751c41d2f73a78a0ba70002f282f63a9f33114542ed933f",
}

# VA = file offset - 0x200. Each signature has a specific positive proposition;
# absence of another signature/consumer cannot establish that a field is unused.
SIGNATURES = {
    # City ownership, occupancy cache, threat, frontier and independent troop bytes.
    0x3F01: "2e8e1e520d",
    0x3F11: "8abc5a08",
    0x3F29: "886717",
    0x3F47: "268a07247f88845808",
    0x3F92: "88ac5408",
    0x3FAB: "80bc5b0800",
    0x3FFF: "02af5808",
    0x4028: "80a440083f",
    0x4133: "8b954a082b974808",
    0x4155: "2af2bf4022",
    0x4179: "f60504740c807d23087306884d20886d23feca740583c740ebcd",
    0x420B: "8b8c52083ae9",
    0x4231: "88ac5308",
    0x425B: "886c1a",
    0x28F4: "8bfbd1e7d1e7",
    0x43D3: "807d1802",
    0x440F: "8bf8",
    0x441B: "807d1801",
    0x4455: "fe4d18",
    0x4CF3: "8af8867c01887c1a",
    0x575C: "8a45122a4513",
    0x6A73: "f6041f",
    0x88E0: "8a4401",
    0x891F: "3a8741087418",
    0x892B: "fe875b08",
    0x8937: "fe441b",
    0x8943: "fe8f5b08",
    0x8953: "fe4c1b",
    # General full-byte capabilities, rating lifecycle and fate branches.
    0x55AC: "ba7f00be4042803c807228",
    0x55D3: "8a07d0e002e043e2f788641f",
    0x5347: "e85c02",
    0x1BE9: "e85137",
    0x5391: "e81202",
    0x52E7: "8b9751428aead0e5",
    0x5304: "02af5242",
    0x5944: "3c40730c3c20721f8a441c3a441974025ac3",
    0x5956: "c6441dffc6441700",
    0x5981: "e898d6b94100e80600c6441c18",
    0x6B67: "c6471a00c6471700",
    0x6BB3: "c6471703",
    0x6BC2: "88642a",
    0x6C42: "c6471a00c6471700",
    0x7771: "8a441722c07507f604407402b005",
    0xCC02: "81eb4022d1eb",
    0xCC0C: "8aa75642d0e4d0e402e0",
    # Faction signed money, debt test and relationship display, not AI tiers.
    0x560B: "03442012542280fa09",
    0x563D: "294420185422",
    0x5649: "80faf67f0c",
    0x5803: "8b472180fc80721cf7d83d2700",
    0x7A9A: "32d28a043c80721a247fb22a3c647712",
    # Serialized spans and only the documented restored map pointer.
    0x8CBB: "bac056",
    0x8CC6: "bef00cbf3b00",
    0x8CDB: "bf4052",
    0x8CED: "bf0004",
    0x8D10: "bf3b00",
    0x8D22: "bf2000",
    0x8D34: "bf4052",
    0x8D46: "bf0004",
    0x8A09: "b97f00",
    0x8B08: "89441c895c1a",
    0x8C2E: "bd0400",
    0x25B2: "b91000",
    0x25C1: "fe4c0b",
    0x25C6: "8a441e88440b",
    0x6F34: "887c02",
    0x6FF6: "894404",
    0x6FFB: "81fb2c01",
    0x7003: "886c1e",
    0x701D: "c6440b01",
    0x2990: "c60408c6440330",
    0x4F8C: "bb0042",
    0x4F95: "c647027f",
    0x52DB: "8a7c02",
    # Edge AH byte cost excludes special seed, while point allocation includes it.
    0xE81D: "32e4",
    0xE843: "88470383c304",
    0xE84B: "80e60f",
    0xE889: "88470383c304fec4",
    0xE951: "83c304fec4",
    0xE7AE: "886504",
    0x4A3D: "02570480d600",
    0x49DC: "83c204",
    # RNG is CS state outside serialized CS:CF0..D2A, not a DOS slot field.
    0x0077: "e808ec",
    0xECE2: "8cc88ed8",
    0xECF1: "8006fcec89",
    0xECF6: "a2fdec",
}


def require(condition, message):
    """Keep evidence checks enabled even under python -O."""
    if not condition:
        raise AssertionError(message)


def word(data, offset):
    return int.from_bytes(data[offset : offset + 2], "little")


def decode_map(data):
    """KI F600..F634 duplicate-pair RLE; fixed source, not a generic loader."""
    out = bytearray()
    pos = 4
    previous = None
    while pos < len(data):
        value = data[pos]
        pos += 1
        out.append(value)
        if value == previous:
            require(pos < len(data), "truncated RLE count")
            out.extend([value] * data[pos])
            pos += 1
            previous = None
        else:
            previous = value
    require(len(out) == 384 * 256, "fixed map dimensions")
    return out


def check_map_edges(tiles, centers):
    """Independent E57F/E717/E81C geometric transcription for this raw map.

    Guards diagnose unsupported input; they are not invented KI rule fallbacks.
    E7AE byte cost is computed separately from allocated point count.
    """
    directions = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1))

    def tile(point):
        x, y = point
        return tiles[y * 384 + x] if 0 <= x < 384 and 0 <= y < 256 else -1

    def connected(point):
        return 0xB8 <= tile(point) <= 0xDD

    seeds = {}
    owners = {}
    for idx, (x, y) in enumerate(centers):
        for direction, (dx, dy) in enumerate(directions[:4]):
            for distance in (1, 2):
                p = (x + dx * distance, y + dy * distance)
                if connected(p):
                    seeds[idx, direction] = p
                    owners[p] = idx
                    break
    consumed = set()
    adjacent = [set() for _ in centers]
    point_total = 0
    costs = []
    for key, seed in seeds.items():
        if key in consumed:
            continue
        origin, direction = key
        special = tile(seed) >= 0xD4
        points = [seed] if special else []
        previous = seed if special else None
        dx, dy = directions[direction]
        current = (seed[0] + dx, seed[1] + dy) if special else seed
        seen = set()
        while True:
            require(connected(current), "road left classified map")
            require((current, previous) not in seen, "road loop")
            seen.add((current, previous))
            points.append(current)
            if tile(current) >= 0xCB:
                break
            for next_direction, (dx, dy) in enumerate(directions):
                candidate = (current[0] + dx, current[1] + dy)
                if candidate != previous and connected(candidate):
                    direction = next_direction
                    previous, current = current, candidate
                    break
            else:
                raise AssertionError("road dead end")
        require(current in owners and direction < 4, "road destination seed")
        target = owners[current]
        reciprocal = (target, direction ^ 1)
        require(seeds.get(reciprocal) == current, "road reciprocity")
        consumed.add(reciprocal)
        adjacent[origin].add(target)
        adjacent[target].add(origin)
        require(not (set(points) & set(centers)), "center in edge points")
        require(special, "official special seed distribution changed")
        point_total += len(points)
        costs.append((len(points) - int(special)) & 255)
    require(
        (len(costs), point_total, sum(costs), min(costs), max(costs))
        == (254, 5526, 5272, 5, 83),
        "raw geometry / E7AE cost distribution",
    )
    return adjacent


def check_instruction_models():
    # 4155: DL=1; at most N-1 skip branches before unconditional DL--.
    for n in range(2, 128):
        states = {n - 1}
        for _ in range(n):
            states = {dh - 1 for dh in states if dh}
        require(not states, "4155 conditional termination")
    # 52FC..5304 CH wraps before subsequent word multiplication.
    command = (255 - (255 >> 2) + 255) & 255
    require(
        command == 191 and ((65535 * (command << 4)) >> 10) & 65535 == 64509,
        "full-byte command wrap",
    )
    # 55A6 separately truncates each SHL and every AH sum (equivalent mod 256).
    for force in range(256):
        for lead in range(256):
            ah = (15 + 15 + 15 + ((force * 2) & 255) + ((lead * 2) & 255)) & 255
            require(ah == (45 + 2 * force + 2 * lead) & 255, "55A6 modulo")
    records = [bytearray(32) for _ in range(128)]
    for record in records:
        record[0x1F] = 91
        record[0x11] = 200
    records[0][0] = records[127][0] = 0x80
    for record in records[:127]:
        if record[0] >= 0x80:
            record[0x1F] = (
                sum(record[o] >> 4 for o in (14, 15, 16))
                + 2 * record[17]
                + 2 * record[18]
            ) & 255
    require(
        records[0][31] == 144 and records[1][31] == records[127][31] == 91,
        "55A6 active 0..126 only; not all raw ratings disposable",
    )
    require(
        int.from_bytes(bytes.fromhex("6801f6"), "little", signed=True) == -655000,
        "signed24 lower cap",
    )


def main():
    require(
        sys.argv[1:] in ([], ["--distributions"]), "only --distributions is accepted"
    )
    raw = {}
    for name, digest in SOURCES.items():
        # Fixed path membership before opening; no actual save path is probed.
        data = (ROOT / name).read_bytes()
        require(
            hashlib.sha256(data).hexdigest() == digest, f"source fingerprint: {name}"
        )
        raw[name] = data
    ki = raw["Dragon/KI.EXE"]
    require(word(ki, 8) * 16 == 0x200, "MZ header")
    for va, hex_bytes in SIGNATURES.items():
        expected = bytes.fromhex(hex_bytes)
        require(ki[va + 512 : va + 512 + len(expected)] == expected, f"KI VA {va:04X}")
    scenario = raw["原版/SINARIO.DAT"]
    require(len(scenario) == 4 * 0x56C0, "four complete chapters, no extra tail")
    tiles = decode_map(raw["Dragon/MMAP.MAP"])
    centers = [(i % 384, i // 384) for i, t in enumerate(tiles) if 0xCB <= t < 0xD4]
    require(len(centers) == 192, "192 ordered centers")
    adjacency = check_map_edges(tiles, centers)
    require(len(raw["Dragon/MMAP.MDL"]) == 0x8000, "map model size")
    require(len(raw["Dragon/MMAP.MCH"]) == 0xA832, "map character size")
    require(len(raw["Dragon/BATTLE.MAP"]) == 0x200 + 214 * 0x1000, "214 battle maps")
    require(set(raw["Dragon/BATTLE.MAP"][:428:2]) == {0, 1, 2}, "layout indices")
    require(len(raw["Dragon/BATTLE.MDL"]) == 0x2F800, "three layout resources")
    require(len(raw["Dragon/BATTLE.DAT"]) == 32 * 0x100, "eight script groups")
    require(len(raw["Dragon/KYOGRF.DAT"]) == 15 * 0x1200, "15 scene pages")
    result = []
    old_owner_differences = []
    count_differences = []
    for chapter in range(4):
        s = scenario[chapter * 0x56C0 : (chapter + 1) * 0x56C0]
        cities = [s[0x8C0 + i * 32 : 0x8E0 + i * 32] for i in range(192)]
        generals = [s[0x42C0 + i * 32 : 0x42E0 + i * 32] for i in range(128)]
        factions = [s[0x80 + i * 64 : 0xC0 + i * 64] for i in range(24)]
        relation = s[0x680:0x8C0]
        legions = [s[0x22C0 + i * 64 : 0x2300 + i * 64] for i in range(128)]
        require(not any(s[0x22C0:0x42C0]), "official legion initial table")
        require(not any(s[0x52C0:]), "official event initial table")
        for idx, c in enumerate(cities):
            neighbors = list(c[0x1C:])
            used = [v for v in neighbors if v != 255]
            require(neighbors == used + [255] * (4 - len(used)), "compact neighbors")
            require(all(v < 192 for v in used), "neighbor indices")
            require(all(idx in cities[v][0x1C:] for v in used), "reciprocal neighbors")
            mask = sum(1 << j for j, v in enumerate(used) if cities[v][1] != c[1])
            require(c[0] & 15 == mask and c[0x1B] == mask.bit_count(), "frontier cache")
            require((word(c, 8), word(c, 10)) == centers[idx], "node order")
            require(set(used) == adjacency[idx], "raw map / chapter adjacency")
            require(c[0x13] <= c[0x12] and word(c, 14) <= word(c, 12), "official caps")
            require(c[0x16] & 15 <= 4 and c[0x16] >> 4 < 15, "official type/page")
            if c[1] != c[0x1A]:
                old_owner_differences.append([chapter, idx, c[1], c[0x1A]])
        active = [i for i, f in enumerate(factions) if f[0] >= 128]
        require(active == list(range([22, 11, 6, 4][chapter])), "active faction slots")
        require(s[0x3A] == len(active), "header count")
        counts = Counter(c[1] for c in cities)
        for idx, f in enumerate(factions):
            require(f[0x3F] == f[2], "initial advisor copy")
            if idx in active:
                require(cities[f[3]][1] == idx, "capital ownership")
                require(
                    generals[f[1]][0] & 0x40 and generals[f[1]][0x1C] == idx,
                    "monarch linkage",
                )
                if f[0x23] != counts[idx]:
                    count_differences.append([chapter, idx, f[0x23], counts[idx]])
        for g in generals:
            require(
                all(g[o] & 15 == 0 for o in (14, 15, 16)), "official specialty low bits"
            )
            require(
                all(g[o] <= 15 for o in (17, 18, 19)),
                "official full-byte ability samples",
            )
            require(g[0x16] < 8 and g[0x1E] < 8, "script/dialogue bounds")
        asymmetric = sum(
            relation[i * 24 + j] != relation[j * 24 + i]
            for i in range(24)
            for j in range(i + 1, 24)
        )
        require(
            asymmetric == [77, 30, 13, 6][chapter], "directed relation distribution"
        )
        item = {
            "chapter": chapter,
            "date": [s[0], s[4], word(s, 6)],
            "asymmetricPairs": asymmetric,
            "activeFactions": active,
        }
        if "--distributions" in sys.argv:
            item["distributions"] = {
                label: {
                    f"{offset:02X}": dict(
                        sorted(Counter(r[offset] for r in records).items())
                    )
                    for offset in range(width)
                }
                for label, records, width in (
                    ("general", generals, 32),
                    ("city", cities, 32),
                    ("faction", factions, 64),
                    ("legion", legions, 64),
                    ("header", [s[:128]], 128),
                    (
                        "relationRow",
                        [relation[i : i + 24] for i in range(0, 576, 24)],
                        24,
                    ),
                )
            }
        result.append(item)
    require(
        old_owner_differences == [[2, 171, 3, 2], [3, 175, 2, 1]], "official old owners"
    )
    require(
        count_differences
        == [[2, 2, 30, 29], [2, 3, 11, 12], [3, 1, 55, 54], [3, 2, 33, 34]],
        "official count differences",
    )
    check_instruction_models()
    print(
        json.dumps(
            {
                "result": "PASS",
                "signaturesChecked": len(SIGNATURES),
                "sources": SOURCES,
                "chapters": result,
                "cityRecordsChecked": 768,
                "generalRecordsChecked": 512,
                "zeroLegionSlots": 512,
                "map": [192, 254, 5526, 5272],
                "oldOwnerDifferences": old_owner_differences,
                "cityCountDifferences": count_differences,
                "scope": "Positive certificates and official distributions only; no unused proof.",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
