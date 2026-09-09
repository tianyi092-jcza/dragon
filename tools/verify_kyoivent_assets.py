"""Verify canonical IVENTGRF-derived audience illustrations."""

from hashlib import sha256
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GRF = ROOT / "web" / "grf"
EXPECTED_RGB_SHA256 = {
    0: "64c76bd977ced57803f8e195d327bc58503d27660c1b0da05f0a05b269c5bb41",
    1: "7c7b8820246bb3867e629f1ae16356c1f7aee50b988c33ab7877659303e0997f",
    2: "13894e7d0f5288e867ae490a34e527a65396c48a3a29200d9ef4825fa35cf40d",
}


for index, expected_hash in EXPECTED_RGB_SHA256.items():
    path = GRF / f"ivent_{index}.png"
    assert path.is_file(), f"missing canonical illustration: {path}"
    # Paths are fixed repository assets, never user input.
    # pi-lens-ignore: unvalidated-input
    with Image.open(path) as image:
        if image.size != (288, 176):
            raise AssertionError(f"{path.name}: expected 288x176")
        rgb_hash = sha256(image.convert("RGB").tobytes()).hexdigest()
    assert rgb_hash == expected_hash, f"{path.name}: unexpected RGB pixels"

    for suffix in ("a", "b"):
        alias = GRF / f"ivent_{index}_{suffix}.png"
        assert not alias.exists(), f"obsolete duplicate illustration remains: {alias}"

print("IVENTGRF assets OK: 3 canonical 288x176 illustrations")
