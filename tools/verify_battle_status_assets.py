"""Lock C673 source offsets, original planar pixels, palette and command evidence.
Reads only KI.EXE/ICONGRF.DAT/GAMEPAL.BRG and the generated PNGs, never a save.
"""
from hashlib import sha256
from pathlib import Path

from extract_battle_status_icons import STATUS_ORIGIN, STATUS_SIZE, decode_status
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_HASHES = {
    "KI.EXE": "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
    "ICONGRF.DAT": "2154782c045b898aa5fafa74a4ff0c3745771ec85799b7882e1c4c009b3f1c1d",
    "GAMEPAL.BRG": "1f0119c75ea5cd333bd3ac75ef92030f93924f011728edc9b1f727c483263708",
}
PIXEL_HASHES = [
    "6bc9c0b99aea72005d33d1959a1366c9a82f0aa7f629f2fd41b3b1c6dc1ae50d",
    "26ce4afce9234b5a40c8bb517c7c850852fff8e7a9b4d797759236d2e2222248",
    "fa0bf5e9a99fc00a11b078e438cd67b2b6bd29b68d6ed539290833a71665532c",
    "a2cc39f46cdebb5279573211f7d2a6e248bf826dd53e90716f62fcd741bfc282",
    "09b56e2af95842b2cfc91c59e2ce50df361e27283e43d42060c9823636d4c2ad",
    "e409dbd627bc28b6970409ffa2145bd91b097e1ba2cf3115cfd79bb37ff38f8c",
]
sources = {}
for name, expected in SOURCE_HASHES.items():
    sources[name] = (ROOT.parent / "Dragon" / name).read_bytes()
    assert sha256(sources[name]).hexdigest() == expected, name
exe = sources["KI.EXE"]
# VA + MZ header, not raw VA as a file offset. Each byte block is an
# independently checked instruction seam, not a screenshot-derived rule.
for va, expected in {
    0x00BD: "b80097",  # D48 file origin
    0xD2E4: "020400010503",  # C7F4 raw bottom-card group order
    0xC687: "8ae032c0d1e88bf0d1e803f0",  # SI = cmd * 0xC0
    0xC693: "2e8e1e480d83c236bb7601b91810e8e431",  # D48 / x+54 / y374 / F888 24x16
    0xC121: "2df001d1e8d1e8d1e8d1e881eaf80080fa107203050800",
    0xC175: "b23088163cd3",
    0xC191: "b21c88163cd3",
    0xC1AD: "b20588163cd3",
    0xC1CC: "32e42e862610d322e47502b4ff",
    0xC23C: "2ec6066aa0eb",
    0xC260: "2ec6066aa074c60648d301",
    0xC3B0: "e8a843",  # 16-bit near-call target wraps to 075B, not 1075B
}.items():
    block = bytes.fromhex(expected)
    assert exe[0x200 + va:0x200 + va + len(block)] == block, hex(va)
assert ((0xC3B0 + 3 + 0x43A8) & 0xFFFF) == 0x075B
assert STATUS_ORIGIN == 0x9700 and STATUS_SIZE == 0xC0
for command, expected in enumerate(PIXEL_HASHES):
    decoded = decode_status(sources["ICONGRF.DAT"], sources["GAMEPAL.BRG"], command)
    assert decoded.size == (24, 16)
    assert sha256(decoded.tobytes()).hexdigest() == expected, command
    with Image.open(ROOT / "web" / "grf" / "ui" / f"battle_status_{command}.png") as asset:
        assert asset.size == decoded.size
        assert asset.convert("RGB").tobytes() == decoded.tobytes(), command
print("battle status assets OK: 6 original 24x16 frames, source/pixel hashes and KI instruction offsets")
