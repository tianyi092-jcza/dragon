"""Verify the 16 tactical formation buttons against original ICONGRF data."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "extract_battle_formation_icons.py"
SOURCE = ROOT.parent / "Dragon" / "ICONGRF.DAT"
PALETTE = ROOT.parent / "Dragon" / "GAMEPAL.BRG"
OUT = ROOT / "web" / "grf" / "ui"


def load_extractor() -> ModuleType:
    spec = importlib.util.spec_from_file_location("formation_extractor", TOOL)
    if spec is None or spec.loader is None:
        raise AssertionError("cannot load formation extractor")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extractor = load_extractor()
try:
    source = SOURCE.read_bytes()
    palette = PALETTE.read_bytes()
except OSError as error:
    raise AssertionError(
        f"cannot read original formation resources: {error}"
    ) from error
expected_grid = extractor.decode_grid(source, extractor.load_colors(palette))
with Image.open(OUT / "battle_symbols_grid.png") as source_image:
    actual_grid = source_image.convert("RGB")
if actual_grid.size != (128, 32):
    raise AssertionError(f"formation grid has wrong size {actual_grid.size}")
if actual_grid.tobytes() != expected_grid.convert("RGB").tobytes():
    raise AssertionError("formation grid differs from ICONGRF 0x2800")

red = (208, 0, 0)
yellow = (240, 224, 0)
for index in range(16):
    expected = extractor.inactive_cell(expected_grid, index).convert("RGB")
    with Image.open(OUT / f"battle_symbol_{index}.png") as source_image:
        actual = source_image.convert("RGB")
    if actual.size != (16, 16):
        raise AssertionError(f"formation {index}: wrong size {actual.size}")
    if actual.tobytes() != expected.tobytes():
        raise AssertionError(f"formation {index}: altered ICONGRF glyph pixels")
    for offset in range(1, 15):
        frame = (
            actual.getpixel((offset, 1)),
            actual.getpixel((offset, 14)),
            actual.getpixel((1, offset)),
            actual.getpixel((14, offset)),
        )
        if frame != (red, red, red, red):
            raise AssertionError(f"formation {index}: inactive frame is not red")
    colors = actual.getcolors(maxcolors=257)
    if colors is None or any(color == yellow for _, color in colors):
        raise AssertionError(f"formation {index}: selected frame baked into asset")

print("battle formation assets OK: ICONGRF 0x2800, 16 independent framed buttons")
