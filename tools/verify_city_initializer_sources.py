"""C0/D6 read-only import witness: fixed SINARIO city caps, not playable admission.
Never calls read_scenarios/main, pads the short chapter, or accesses SAVE/IDB.
"""
import hashlib
from pathlib import Path

from parse_sinario import parse_scenario

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "上": (88832, "6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73"),
    "中": (88832, "cf91e4360fa4e9363b5136ba379d58c8b1c8b5b3ca309eca4071b4f7a805ce59"),
    "下": (88830, "89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb"),
    "后": (88832, "3e70ad54e3fc3b9d13a25883098d1ccc53218aafd1a7a461b095c1f1fc9812db"),
    "原版": (88832, "4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87"),
}


def verify():
    rows = []
    for source, (size, digest) in SOURCES.items():
        data = (ROOT / source / "SINARIO.DAT").read_bytes()
        if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"SINARIO source identity mismatch: {source}")
        for chapter in range(4):
            block = data[chapter * 22208:(chapter + 1) * 22208]
            if len(block) < 0x8C0 + 192 * 32:
                raise ValueError("Incomplete city table")
            raw_caps = [block[0x8C0 + city * 32 + 0x12] for city in range(192)]
            decoded = parse_scenario(block)
            if [city["troops_cap"] for city in decoded["cities"]] != raw_caps:
                raise ValueError("Importer altered chapter city caps")
            rows.append(raw_caps)
    # Source-specific witnesses, not rules for arbitrary authored chapters.
    differences = sum(a != b for row in rows for a, b in zip(rows[0], row))
    if differences != 2328 or [row[0] for row in rows] != [
        169, 169, 169, 169, 169, 169, 169, 189, 189, 165,
        165, 181, 181, 181, 181, 181, 169, 189, 165, 181,
    ]:
        raise ValueError("Pinned per-chapter cap witness changed")
    print("PASS: 20 city tables / 3840 caps preserved by importer; 2328 chapter differences")
    print("Scope: city fields only; short final chapter remains short, no full compile admission")


if __name__ == "__main__":
    verify()
