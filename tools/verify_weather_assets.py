"""Verify generated rain-cloud PNGs against the original MMAP.MCH descriptors."""

from hashlib import sha256

from extract_march_markers import (
      SRC,
      WEATHER_DESCRIPTORS,
      WEATHER_OUT_DIR,
      decode_composite_sprite,
)
from PIL import Image, ImageChops

EXPECTED_MMAP_SHA256 = (
      "b10a5b64bbffa672c1fb5cb37703ac4c14b18bf1166cc47c4e802c19aae9f8f7"
)
EXPECTED_SIZE = (256, 144)
# Independent fixed RGBA baselines from the audited descriptors/palette. This prevents
# a shared decoder regression from blessing regenerated-but-wrong PNGs.
EXPECTED_RGBA_SHA256 = (
      "dfa1ba5998aaa4eb74b63cbac315f7521b3153b8f9b96779a51a89805d49cf11",
      "b6d01e9a7df36615e94af52f0b9f4671ac18216230acdb46f4f82138ed01b84d",
      "996e0b67092a95ea8a78edd8286c63c34740559ea0673bfd0a5b413ffa470a27",
      "c82ffe9a478639959a42dbcb0c3a4f281661b7e5d833716eab6d04f52a47d9d7",
      "7d802cd7cd44feb26eb164cf69bf9fe45037db710dcec34db5d081b15f4d1372",
      "dfa1ba5998aaa4eb74b63cbac315f7521b3153b8f9b96779a51a89805d49cf11",
      "b6d01e9a7df36615e94af52f0b9f4671ac18216230acdb46f4f82138ed01b84d",
      "996e0b67092a95ea8a78edd8286c63c34740559ea0673bfd0a5b413ffa470a27",
)


def main() -> None:
      raw = SRC.read_bytes()
      actual_hash = sha256(raw).hexdigest()
      if actual_hash != EXPECTED_MMAP_SHA256:
            raise AssertionError(
                  f"unexpected MMAP.MCH SHA256: {actual_hash} != {EXPECTED_MMAP_SHA256}"
            )

      generated = []
      for phase, descriptor in enumerate(WEATHER_DESCRIPTORS):
            expected = decode_composite_sprite(raw, descriptor)
            path = WEATHER_OUT_DIR / f"cloud_frame_{phase}.png"
            with Image.open(path) as source:
                  actual = source.convert("RGBA")
            if actual.size != EXPECTED_SIZE:
                  raise AssertionError(f"{path}: {actual.size} != {EXPECTED_SIZE}")
            rgba_hash = sha256(actual.tobytes()).hexdigest()
            if rgba_hash != EXPECTED_RGBA_SHA256[phase]:
                  raise AssertionError(
                        f"{path}: RGBA SHA256 {rgba_hash} != fixed audited baseline"
                  )
            if ImageChops.difference(actual, expected).getbbox() is not None:
                  raise AssertionError(
                        f"{path}: pixels differ from MMAP descriptor {descriptor:#x}"
                  )
            generated.append(actual)

      # CS:0x985A: phases 5/6/7 intentionally reuse descriptors 18/19/1A.
      for repeated, original in ((5, 0), (6, 1), (7, 2)):
            if ImageChops.difference(
                  generated[repeated], generated[original]
            ).getbbox():
                  raise AssertionError(
                        f"phase {repeated} must exactly repeat phase {original}"
                  )

      print(
            "weather assets OK: MMAP.MCH 0x18..0x1C decode to exact "
            "256x144 eight-phase PNGs"
      )


if __name__ == "__main__":
      main()
