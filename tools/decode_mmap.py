"""Decode the duplicate-byte RLE stream used by MMAP.MAP.

KI.EXE 0xF5E7..0xF6D9:
- MMAP.MAP starts with a four-byte uncompressed-size header.
- When two consecutive input bytes match, the next byte is a repeat count.
- A zero count escapes the duplicate pair without adding repeats.

MMAP.MDL and MMAP.MCH are raw fixed-size tile files and must not pass through
this decoder.
"""

import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DRAGON = ROOT / "Dragon"
WEB = ROOT / "web-port" / "web"


def rle_decode(data: bytes, skip_header: bool = True) -> bytes:
    pos = 4 if skip_header else 0
    out = bytearray()

    def read_byte() -> int | None:
        nonlocal pos
        if pos >= len(data):
            return None
        value = data[pos]
        pos += 1
        return value

    first = read_byte()
    if first is None:
        return bytes(out)
    out.append(first)
    previous = first

    while True:
        value = read_byte()
        if value is None:
            break
        out.append(value)
        if value != previous:
            previous = value
            continue

        count = read_byte()
        if count is None:
            break
        if count:
            out.extend([value] * count)

        first_of_group = read_byte()
        if first_of_group is None:
            break
        out.append(first_of_group)
        previous = first_of_group

    return bytes(out)


def main() -> None:
    source = DRAGON / "MMAP.MAP"
    output = WEB / "mmap_map.bin"
    try:
        compressed = source.read_bytes()
    except OSError as exc:
        raise SystemExit(f"cannot read {source}: {exc}") from exc

    declared = struct.unpack("<I", compressed[:4])[0]
    decoded = rle_decode(compressed)
    if len(decoded) != declared:
        raise SystemExit(
            f"MMAP.MAP decoded {len(decoded)} bytes, expected {declared} bytes"
        )

    try:
        output.write_bytes(decoded)
    except OSError as exc:
        raise SystemExit(f"cannot write {output}: {exc}") from exc

    print(f"MMAP.MAP: {len(compressed)}B -> {len(decoded)}B (declared {declared})")
    for name in ("MMAP.MCH", "MMAP.MDL"):
        path = DRAGON / name
        try:
            size = path.stat().st_size
        except OSError as exc:
            raise SystemExit(f"cannot stat {path}: {exc}") from exc
        print(f"{name}: raw {size}B (not MAP RLE)")


if __name__ == "__main__":
    main()
