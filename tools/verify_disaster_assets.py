"""Verify fire/riot animation PNGs against the original MMAP.MCH tables."""

from hashlib import sha256

from extract_march_markers import (
      DISASTER_DESCRIPTORS,
      DISASTER_NAMES,
      DISASTER_OUT_DIR,
      SRC,
      decode_composite_sprite,
)
from PIL import Image, ImageChops
from render_map import load_palette

EXPECTED_MMAP_SHA256 = (
      "b10a5b64bbffa672c1fb5cb37703ac4c14b18bf1166cc47c4e802c19aae9f8f7"
)
EXPECTED_RGBA_SHA256 = {
      1: (
            "2c4eb8d39fdcbaf555e4254411050df8c282044f83ce9699aac5253be7428548",
            "05a0caffc41d2ca7190a0904b63827f69c302b8c09305342702304409fd59cc6",
            "cce55de0faec031c9a18dfe07cab98a5d506453f3ac70449554bb717a078a139",
            "5a8654f7d0b5557b67dbc06813640f423860263eb1e4d14508f0a8ab553ea205",
      ),
      2: (
            "ced401d2326fcf71a975bc98fe38a5e3bdf7bae938f478cee3d1f70b9669318a",
            "49cbac1f0a88c2ba6c32cbf0636f65379fdde606955196180cfcd7f8f58981d8",
            "a5bec7a7f99a3a3ccfdca2079cecd8e872ba9597f023949d6c208a5ff9b793b2",
            "0b4eef5763a4e2ba33cc9e606752734084202c7a06d0dc632170f258f33fd7a7",
      ),
}
DISASTER_PALETTE_INDEXES = {
      1: (0, 1, 2, 6, 7, 10, 11, 12, 15),
      2: (0, 1, 2, 6, 7, 9),
}


def main() -> None:
      raw = SRC.read_bytes()
      actual_hash = sha256(raw).hexdigest()
      if actual_hash != EXPECTED_MMAP_SHA256:
            raise AssertionError(f"unexpected MMAP.MCH SHA256: {actual_hash}")

      palette_zero = load_palette(0)
      for kind, indexes in DISASTER_PALETTE_INDEXES.items():
            name = DISASTER_NAMES[kind]
            expected_colors = {
                  tuple(palette_zero[index * 3 : index * 3 + 3]) for index in indexes
            }
            rgba_bytes = b"".join(
                  decode_composite_sprite(raw, descriptor).convert("RGBA").tobytes()
                  for descriptor in DISASTER_DESCRIPTORS[kind][:4]
            )
            actual_colors = {
                  tuple(rgba_bytes[offset : offset + 3])
                  for offset in range(0, len(rgba_bytes), 4)
                  if rgba_bytes[offset + 3] == 255
            }
            if actual_colors != expected_colors:
                  raise AssertionError(
                        f"audited {name} palette-index set no longer matches pixels"
                  )
            for season in range(1, 4):
                  palette = load_palette(season)
                  for index in indexes:
                        start = index * 3
                        if (
                              palette[start : start + 3]
                              != palette_zero[start : start + 3]
                        ):
                              raise AssertionError(
                                    f"{name} palette index {index} differs in "
                                    f"season {season}"
                              )

      for kind, descriptors in DISASTER_DESCRIPTORS.items():
            name = DISASTER_NAMES[kind]
            for phase, descriptor in enumerate(descriptors):
                  expected = decode_composite_sprite(raw, descriptor)
                  path = DISASTER_OUT_DIR / f"{name}_frame_{phase}.png"
                  with Image.open(path) as source:
                        actual = source.convert("RGBA")
                  if actual.size != (80, 80):
                        raise AssertionError(f"{path}: {actual.size} != (80, 80)")
                  rgba_hash = sha256(actual.tobytes()).hexdigest()
                  expected_hash = EXPECTED_RGBA_SHA256[kind][phase & 3]
                  if rgba_hash != expected_hash:
                        raise AssertionError(
                              f"{path}: RGBA SHA256 differs from audited baseline"
                        )
                  if ImageChops.difference(actual, expected).getbbox() is not None:
                        raise AssertionError(
                              f"{path}: differs from MMAP descriptor {descriptor:#x}"
                        )

      print("disaster assets OK: fire/riot 5x5 tiles, exact eight phases and palette")


if __name__ == "__main__":
      main()
