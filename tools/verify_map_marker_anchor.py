"""Read-only primary-resource checks for re-notes-map-marker-anchor.md.

Fixed non-save inputs only. Does not run the game, extract assets, or access profiles.
Byte pins protect the reviewed instructions; resource checks protect tile geometry,
not a claim of whole-program/VGA emulation or exact Web palette equivalence.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT.parent / "Dragon"
HASHES = {
    "KI.EXE": "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
    "MMAP.MDL": "2fa1dd1b1ec7c426cf22583334a62dc61bdb1f1cefc59cbe8e9827480d118d1d",
    "MMAP.MCH": "b10a5b64bbffa672c1fb5cb37703ac4c14b18bf1166cc47c4e802c19aae9f8f7",
    "MMAP.MAP": "51b6fcaa390c80bd8a358dcacbf7d8dbb6dfeb0e048d8c3bdd86329df3401bcf",
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def pixels(raw):
    require(len(raw) == 128, "planar tile size")
    return [sum(((raw[p * 32 + y * 2 + x // 8] >> (7 - x % 8)) & 1) << p
                for p in range(4)) for y in range(16) for x in range(16)]


def geometry(image, indices):
    require(image.size == (16, 16), "uncropped 16x16 tile")
    colors = {}
    for y in range(16):
        for x in range(16):
            index = indices[y * 16 + x]
            pixel = image.getpixel((x, y))
            if not isinstance(pixel, tuple):
                raise AssertionError("expected RGBA pixel")
            color = pixel[:3]
            require(index not in colors or colors[index] == color,
                    f"palette-index geometry differs at {x},{y}")
            colors[index] = color
    require(len(set(colors.values())) == len(colors), "palette indices collapsed")


def main():
    raw = {}
    for name, digest in HASHES.items():
        raw[name] = (ORIGINAL / name).read_bytes()
        require(hashlib.sha256(raw[name]).hexdigest() == digest, name + " source hash")
    exe = raw["KI.EXE"]
    pins = {
        0x2B2A: "8b54108a5c1232ff8a4409024408e88ca9c3",  # XY + frame, no pixel shift
        0xD4C7: "2e2b1e56d8725083fb17734b2e2b1654d8724483fa28733f",
        0xD4DF: "d1e3d1e3d1e303d3d1e3d1e303dad1e3d1e3d1e3",  # (40*y+x)*8
        0xD68D: "bf000a32ffb517b128",  # screen tile scan 40 columns, 23 rows
        0xD74B: "83c6084747fec97403e93fff81c7b004",  # +2 VGA bytes, +4b0 row
        0xD804: "51565732c0d1e88bf0d1e8d1e803f0",  # MCH index*160
        0xD817: "bf58d8b91000",  # same tile scratch origin, 16 mask rows
        0xD796: "bac403b80201ef8bd7b91000a583c74ee2fa",  # 2 bytes, stride80
        0x27C2: "8b8748088b9f4a08894410895c12",  # node city coords -> legion
        0x27E9: "8b440e3b44147504c6440804c3",  # arrival only switches frame
        0x2808: "03440c8bd88b4410262b077409250080d1c0884408c3",  # X first
        0x281E: "8a4412262a470274092480d0c00402884408c3",  # then Y
        0xE4E2: "268a053ccb720c3cd47308e88f00",  # CB..D3 city nodes
    }
    for address, expected in pins.items():
        expected = bytes.fromhex(expected)
        require(exe[0x200 + address:0x200 + address + len(expected)] == expected,
                f"KI instruction pin {address:04X}")

    # Original duplicate-pair RLE (F600..F634), no save/template input.
    packed = raw["MMAP.MAP"]
    terrain = bytearray()
    position, previous = 4, None
    while position < len(packed):
        value = packed[position]
        position += 1
        terrain.append(value)
        if value == previous:
            require(position < len(packed), "RLE count")
            terrain.extend([value] * packed[position])
            position += 1
            previous = None
        else:
            previous = value
    require(len(terrain) == 384 * 256, "map dimensions")
    centers = {(i % 384, i // 384) for i, tile in enumerate(terrain) if 0xCB <= tile < 0xD4}
    try:
        graph = json.loads((ROOT / "web/road_graph.json").read_text(encoding="utf8"))
    except (OSError, ValueError) as error:
        raise AssertionError("cannot read shipped node geometry") from error
    require(len(centers) == 192, "original node count")
    require(centers == {(n["x"], n["y"]) for n in graph["nodes"]}, "node tile coordinates")

    # Web city colors differ, but every original index maps to one distinct RGB.
    for kind, tile in (("player", 0xCB), ("other", 0xCC), ("empty", 0xCD)):
        with Image.open(ROOT / f"web/grf/ui/icon-{kind}_city.png") as image:
            geometry(image.convert("RGBA"), pixels(raw["MMAP.MDL"][tile*128:(tile+1)*128]))
    for style in range(24):
        for frame in range(5):
            index = style * 5 + frame
            tile = raw["MMAP.MCH"][index*160:(index+1)*160]
            with Image.open(ROOT / f"web/grf/march_markers/style_{style:02d}_frame_{frame}.png") as source:
                image = source.convert("RGBA")
                geometry(image, pixels(tile[32:]))
                for y in range(16):
                    for x in range(16):
                        alpha = 255 * ((tile[y*2+x//8] >> (7-x%8)) & 1)
                        pixel = image.getpixel((x, y))
                        require(isinstance(pixel, tuple) and pixel[3] == alpha,
                                "uncropped original mask")
    print("map marker primary evidence OK: 13 instruction pins; 192 node tiles; 3 city geometries; 120 marker geometries/masks")


if __name__ == "__main__":
    main()
