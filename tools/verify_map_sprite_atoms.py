"""Isolated regression for the S0 audit, not a placement or rules certificate.

Copies only named non-save resources into a temporary fixture. The happy path
uses the real installed-source validator; negative cases alter fixture metadata
or files only. No template, database, browser profile or SAVE.DAT access.
"""
import contextlib
import copy
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from collections import Counter
from unittest.mock import patch

from PIL import Image
import audit_map_sprite_atoms as audit


class SpriteAtomAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="dragon-sprite-audit-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name) / "project"
        (cls.root / "web").mkdir(parents=True)
        dragon = cls.root.parent / "Dragon"
        dragon.mkdir()
        for name in ("MMAP.MDL", "MMAP.MAP", "GAMEPAL.BRG", "KI.EXE"):
            shutil.copyfile(audit.ROOT.parent / "Dragon" / name, dragon / name)
        (cls.root.parent / "原版").mkdir()
        shutil.copyfile(audit.ROOT.parent / "原版/SINARIO.DAT", cls.root.parent / "原版/SINARIO.DAT")
        for name in ("mmap_map.bin", *(f"map_atlas_{season}.png" for season in audit.SEASONS)):
            shutil.copyfile(audit.ROOT / "web" / name, cls.root / "web" / name)
        (cls.root / "editor-ui/src").mkdir(parents=True)
        for name in ("mapspritecatalog.json", "mapbasepresets.json"):
            shutil.copyfile(audit.ROOT / "editor-ui/src" / name, cls.root / "editor-ui/src" / name)
        installed_root = audit.ROOT
        run = subprocess.run

        def validate_installed(args, **kwargs):
            # The fixture owns raw files; existing validator owns installed source.
            return run(args, **{**kwargs, "cwd": installed_root})

        # A clean checkout has no ignored report directory. The audit creates it,
        # while the existing-directory negative test still forbids overwrites.
        assert not (cls.root / ".dragon-analysis").exists()
        with patch.object(audit.subprocess, "run", side_effect=validate_installed):
            cls.output = cls.generate("valid")
        cls.report = json.loads((cls.output / "inventory.json").read_text(encoding="utf-8"))
        cls.registration = cls.report["registration"]

    @classmethod
    def generate(cls, name):
        with patch.object(audit, "ROOT", cls.root), patch.object(sys, "argv", ["audit", name]), contextlib.redirect_stdout(io.StringIO()):
            audit.main()
        return cls.root / ".dragon-analysis" / ("sprite-atoms-" + name)

    def test_mixed_reference_disposition_is_independent_of_component_order(self):
        path = self.root / "editor-ui/src/mapspritecatalog.json"
        before = path.read_bytes()
        self.addCleanup(path.write_bytes, before)
        catalog = json.loads(before)
        catalog["components"].reverse()
        catalog["recipes"].reverse()
        path.write_text(json.dumps(catalog), encoding="utf-8")
        with patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
            output = self.generate("reversed-component-order")
        report = json.loads((output / "inventory.json").read_text(encoding="utf-8"))
        self.assertEqual(report["summary"]["dispositions"], self.report["summary"]["dispositions"])
        for actual, original in zip(report["atoms"], self.report["atoms"], strict=True):
            self.assertEqual(actual["disposition"], original["disposition"])
            self.assertEqual(set(actual.get("componentItemIds", [])), set(original.get("componentItemIds", [])))
        self.assertEqual(report["atoms"][223]["disposition"], "catalog-reference")
        self.assertEqual(report["atoms"][246]["disposition"], "read-only-reference")
        self.assertEqual(report["atoms"][95]["disposition"], "base-preset")
        self.assertEqual(set(report["atoms"][95]["componentItemIds"]), {"water-pool-outline-13-v1", *[f"coast-{name}-4-v1" for name in ["opposed-corners", "rounded-bay", "vertical-step", "horizontal-step", "right-angle", "left-bay"]]})
        self.assertEqual(report["catalog"]["support"], {"existing-decoration": 66, "reference-only": 122})

    def test_sea_base_95_texture_period_is_native_in_all_seasons(self):
        # Web sea-base-95-v1 chooses geography=1 explicitly; this proves only
        # byte/pixels/period, never a DOS water or passability classification.
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapbasepresets.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog["schema"], "map-base-presets-1")
        self.assertEqual(catalog["catalogRevision"], "map-base-presets-1")
        self.assertEqual(list(catalog["items"]), ["sea-base-95-v1"])
        preset = catalog["items"]["sea-base-95-v1"]
        self.assertEqual(preset["fill"], {"tile": 95, "geography": 1})
        self.assertEqual(preset["support"], "explicit-base-fill")
        self.assertEqual(preset["scope"], "selected-cells-only")
        self.assertEqual(preset["geographyAuthority"], "web-author-explicit-choice")
        self.assertIs(preset["preserveOverlays"], True)
        self.assertEqual(preset["periodPixels"], [2, 2])
        source = preset["source"]
        self.assertEqual(source["revision"], self.registration["revision"])
        self.assertEqual(source["resource"], "MMAP.MDL")
        self.assertEqual(source["byteOffset"], 95 * 128)
        self.assertEqual(source["byteLength"], 128)
        self.assertEqual(source["atlasRect"], [240, 80, 16, 16])
        self.assertEqual(set(source["seasonRgbSha256"]), set(audit.SEASONS))
        evidence_path, anchor = source["evidenceRef"].split("#")
        self.assertTrue((audit.ROOT / evidence_path).is_file())
        self.assertEqual(anchor, "21a-接续原资源核对byte95重复纹理非海域规则")
        raw = (self.root.parent / "Dragon" / source["resource"]).read_bytes()[source["byteOffset"]:source["byteOffset"] + source["byteLength"]]
        self.assertEqual(source["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(hashlib.sha256(raw).hexdigest(),
                         "1343d1f3641745575b7c889286478988827c4f4bac686c1a24b9424200e03432")
        for season in audit.SEASONS:
            with Image.open(self.root / "web" / f"map_atlas_{season}.png") as atlas:
                left, top, width, height = source["atlasRect"]
                tile = atlas.crop((left, top, left + width, top + height))
                self.assertEqual(source["seasonRgbSha256"][season], hashlib.sha256(tile.convert("RGB").tobytes()).hexdigest())
                self.assertEqual(hashlib.sha256(tile.convert("RGB").tobytes()).hexdigest(),
                                 "a22b32429919b7039306ce9cfe1e231d21f3587efe7618d938c0570e5e9d7f5d")
                for y in range(48):
                    for x in range(48):
                        self.assertEqual(tile.getpixel((x % 16, y % 16)),
                                         3 if (x + y) % 2 == 0 else 8)
        repetition = json.loads((self.output / "repetition.json").read_text(encoding="utf-8"))
        self.assertEqual(repetition["atoms"][95]["occurrences"], 8410)
        self.assertEqual(repetition["atoms"][95]["firstWitness"], [319, 0])

    def test_blue_lookalikes_are_not_sea95_period_or_shifted_aliases(self):
        # Resource identity only: these blue-looking bytes are not alternate
        # phases of 95. This does NOT classify their DOS geography or use.
        mdl = (self.root.parent / "Dragon/MMAP.MDL").read_bytes()
        decoded = {}
        for tile in (95, 191, 202):
            raw = mdl[tile * 128:(tile + 1) * 128]
            decoded[tile] = bytes(sum(((raw[plane * 32 + y * 2 + x // 8] >> (7 - x % 8)) & 1) << plane
                                      for plane in range(4)) for y in range(16) for x in range(16))
            for season in audit.SEASONS:
                with Image.open(self.root / "web" / f"map_atlas_{season}.png") as atlas:
                    x, y = tile % 16 * 16, tile // 16 * 16
                    self.assertEqual(atlas.crop((x, y, x + 16, y + 16)).tobytes(), decoded[tile])
        base = decoded[95]
        for tile, colors, differences in ((191, {3, 8}, 30), (202, {3, 4, 8}, 50)):
            indices = decoded[tile]
            self.assertEqual(set(indices), colors)
            self.assertEqual(sum(a != b for a, b in zip(indices, base)), differences)
            period_x = next(k for k in range(1, 17) if all(
                indices[y * 16 + x] == indices[y * 16 + (x + k) % 16] for y in range(16) for x in range(16)))
            period_y = next(k for k in range(1, 17) if all(
                indices[y * 16 + x] == indices[(y + k) % 16 * 16 + x] for y in range(16) for x in range(16)))
            self.assertEqual([period_x, period_y], [16, 16])
            self.assertFalse(any(all(indices[y * 16 + x] == base[(y + dy) % 16 * 16 + (x + dx) % 16]
                                     for y in range(16) for x in range(16))
                                 for dy in range(16) for dx in range(16)))

    def test_g08_g09_road_references_bind_original_classifier_and_caller_bytes(self):
        # Static original-instruction evidence, not a CPU execution or an
        # arbitrary-map topology certificate. Full branch explanation: admission 2.1e.
        exe = (self.root.parent / "Dragon/KI.EXE").read_bytes()
        self.assertEqual(hashlib.sha256(exe).hexdigest(),
                         "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868")
        self.assertEqual(int.from_bytes(exe[8:10], "little") * 16, 0x200)
        self.assertEqual(exe[0x200 + 0xE961:0x200 + 0xE993].hex(),
                         "3bf7742c268a043cb872253cdd772152b2013cba720e32d23ccb7208b2033cd47202b2043cca750380ca808ac25af8c3f9c3")
        self.assertEqual(exe[0x200 + 0xE881:0x200 + 0xE899].hex(),
                         "e8dd00890f88570288470383c304fec424073c0176025fc3")
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        cases = [(186, 12, [263, 93]), (187, 12, [263, 95]), (188, 5, [284, 47]), (189, 5, [286, 47]),
                 (192, 14, [317, 152]), (193, 22, [330, 143]), (194, 20, [332, 141]), (195, 14, [320, 149]),
                 (191, 19, [285, 47]), (202, 634, [333, 141])]
        for tile, count, first in cases:
            self.assertEqual(layout.count(tile), count)
            position = layout.index(tile)
            self.assertEqual([position % 384, position // 384], first)
            item = next(item for item in catalog["items"] if item["tile"] == tile)
            self.assertEqual(item["category"], "road")
            self.assertEqual(item["support"], "reference-only")
            self.assertEqual(item["geographyEffect"], "unresolved")
            self.assertNotIn("geographyMask", item)
            self.assertNotIn("authorWaterClass", item)

    def test_fine_corners_keep_their_pixels_and_only_admit_reference_viewing(self):
        mdl = (self.root.parent / "Dragon/MMAP.MDL").read_bytes()
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        cases = [
            (3, [[15, 15]], 144, [383, 0]),
            (13, [[15, 13], [14, 14], [15, 14], [13, 15], [14, 15], [15, 15]], 59, [381, 1]),
            (19, [[14, 0], [15, 0], [15, 1]], 77, [20, 5]),
            (28, [[15, 14], [14, 15], [15, 15]], 36, [316, 0]),
            (21, [[0, 15], [2, 15], [4, 15]], 36, [348, 3]),
        ]
        for tile, points, count, first in cases:
            raw = mdl[tile * 128:(tile + 1) * 128]
            indices = [sum(((raw[plane * 32 + y * 2 + x // 8] >> (7 - x % 8)) & 1) << plane
                           for plane in range(4)) for y in range(16) for x in range(16)]
            self.assertEqual([[i % 16, i // 16] for i, value in enumerate(indices) if value in (3, 8)], points)
            self.assertEqual({indices[y * 16 + x] for x, y in points}, {8})
            self.assertEqual(layout.count(tile), count)
            position = layout.index(tile)
            self.assertEqual([position % 384, position // 384], first)
            item = next(item for item in catalog["items"] if item["tile"] == tile)
            self.assertEqual(item["support"], "reference-only")
            self.assertEqual(item["geographyEffect"], "unresolved")
            self.assertTrue(item["itemId"].startswith("coast-corner-") or item["itemId"] == "shore-fine-corner-21-v1")
            # Exact graphic coordinates are not a rule-plane geography mask.
            self.assertNotIn("geographyMask", item)
            self.assertNotIn("authorWaterClass", item)

    def test_g07_native_occurrences_and_separate_visual_labels(self):
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        for tile, count, first, category in [(181, 1079, [164, 0], "field"),
                                             (182, 446, [236, 0], "ground"),
                                             (183, 163, [234, 0], "ground")]:
            self.assertEqual(layout.count(tile), count)
            position = layout.index(tile)
            self.assertEqual([position % 384, position // 384], first)
            item = next(item for item in catalog["items"] if item["tile"] == tile)
            self.assertEqual(item["category"], category)  # Web label, not a DOS terrain rule.
            self.assertEqual(item["geographyEffect"], "preserve-underlay")
            self.assertEqual(item["support"], "existing-decoration")

    def test_g06_crown_references_keep_original_occurrences_without_inferred_rules(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        for tile, count, first in [(168, 400, [186, 0]), (176, 72, [188, 0]),
                                   (177, 1008, [354, 0]), (178, 201, [88, 0]), (179, 600, [217, 30])]:
            self.assertEqual(layout.count(tile), count)
            position = layout.index(tile)
            self.assertEqual([position % 384, position // 384], first)
            item = next(row for row in catalog["items"] if row["tile"] == tile)
            self.assertEqual((item["category"], item["support"], item["geographyEffect"]),
                             ("ground", "reference-only", "unresolved"))
            self.assertNotIn("geographyMask", item)
            self.assertEqual(item["footprint"], [[0, 0]])

    def test_mottle_and_gate_cap_keep_observed_identity_without_geography_or_placement_grants(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        for tile, count, first, category in [(29, 313, [187, 0], "ground"), (251, 5, [202, 99], "city")]:
            self.assertEqual(layout.count(tile), count)
            position = layout.index(tile)
            self.assertEqual([position % 384, position // 384], first)
            item = next(row for row in catalog["items"] if row["tile"] == tile)
            self.assertEqual((item["category"], item["support"], item["geographyEffect"]),
                             (category, "reference-only", "unresolved"))
            self.assertNotIn("geographyMask", item)
            self.assertEqual(item["footprint"], [[0, 0]])

    def test_web_sample_catalog_matches_native_atoms_without_certifying_water(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog["schema"], "map-sprite-catalog-1")
        self.assertEqual(catalog["sourceRevision"], self.registration["revision"])
        self.assertEqual(catalog["scope"], "web-curated-catalog-explicit-support")
        self.assertEqual([item["tile"] for item in catalog["items"]], [112, 6, 180, 248, 16, 184, 185, 203, 204, 205, 0, 1, 2, 17, 18, 20, 32, 33, 36, 37, 48, 49, 52, 53, 196, 197, 198, 199, 200, 201, 3, 13, 19, 28, 181, 182, 183, 206, 207, 208, 209, 210, 211, 254, 255, 186, 187, 188, 189, 192, 193, 194, 195, 191, 202, 29, 251, 168, 176, 177, 178, 179, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 252, 253, 21, 88, 89, 90, 91, 92, 93, 94, 104, 105, 106, 107, 108, 109, 110, 111, 96, 97, 98, 99, 100, 101, 102, 103, 41, 42, 74, 75, 79])
        categories = {row["id"] for row in catalog["categories"]}
        self.assertEqual(len(categories), 7)
        raw = (self.root.parent / "Dragon/MMAP.MDL").read_bytes()
        for item in catalog["items"]:
            tile = item["tile"]
            self.assertIn(item["category"], categories)
            self.assertEqual(item["definitionRef"], f"tile-{tile}")
            self.assertEqual(item["anchor"], [0, 0])
            self.assertEqual(item["footprint"], [[0, 0]])
            self.assertEqual(item["ruleRecipeRef"], "ki-byte-stamp-1")
            self.assertEqual(item["support"], "reference-only" if tile in (41, 42, 74, 75, 79, 96, 97, 98, 99, 100, 101, 102, 103, 88, 89, 90, 91, 92, 93, 94, 104, 105, 106, 107, 108, 109, 110, 111, 21, 3, 6, 13, 19, 28, 32, 33, 36, 37, 48, 49, 52, 53, 184, 185, 196, 197, 198, 199, 200, 201, 203, 204, 205, 206, 207, 208, 209, 210, 211, 254, 255, 186, 187, 188, 189, 192, 193, 194, 195, 191, 202, 29, 251, 168, 176, 177, 178, 179, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 252, 253) else "existing-decoration")
            self.assertEqual(item["geographyEffect"], "unresolved" if tile in (41, 42, 74, 75, 79, 96, 97, 98, 99, 100, 101, 102, 103, 88, 89, 90, 91, 92, 93, 94, 104, 105, 106, 107, 108, 109, 110, 111, 21, 3, 6, 13, 19, 28, 32, 33, 36, 37, 48, 49, 52, 53, 184, 185, 196, 197, 198, 199, 200, 201, 203, 204, 205, 206, 207, 208, 209, 210, 211, 254, 255, 186, 187, 188, 189, 192, 193, 194, 195, 191, 202, 29, 251, 168, 176, 177, 178, 179, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 252, 253) else "preserve-underlay")
            source = item["source"]
            self.assertEqual(source["resource"], "MMAP.MDL")
            self.assertEqual(source["offset"], tile * 128)
            self.assertEqual(source["byteLength"], 128)
            self.assertEqual(source["sha256"], hashlib.sha256(raw[tile * 128:(tile + 1) * 128]).hexdigest())
            self.assertEqual(set(source["seasonRgbSha256"]), set(audit.SEASONS))
            for season in audit.SEASONS:
                with Image.open(self.root / "web" / f"map_atlas_{season}.png") as atlas:
                    x, y = tile % 16 * 16, tile // 16 * 16
                    pixels = atlas.convert("RGB").crop((x, y, x + 16, y + 16)).tobytes()
                    self.assertEqual(source["seasonRgbSha256"][season], hashlib.sha256(pixels).hexdigest())

    def test_native_river_stroke_pixel_edges_and_original_context_are_not_rule_ports(self):
        # Palette index 3 is a pixel observation only, never a water/passability mask.
        expected = {
            88: ("ES", 992, [357, 0]), 89: ("SW", 1048, [231, 0]),
            90: ("ESW", 27, [262, 19]), 91: ("NSW", 34, [260, 13]),
            92: ("E", 53, [227, 6]), 93: ("S", 72, [128, 3]),
            94: ("EW", 1696, [229, 0]), 104: ("NE", 1054, [228, 0]),
            105: ("NW", 1000, [358, 0]), 106: ("NES", 15, [294, 43]),
            107: ("NEW", 35, [236, 15]), 108: ("W", 19, [302, 2]),
            109: ("N", 33, [99, 46]), 110: ("NS", 1229, [356, 2]),
            111: ("NESW", 4, [265, 18]),
        }
        mdl = (self.root.parent / "Dragon/MMAP.MDL").read_bytes()
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        self.assertEqual(hashlib.sha256(layout).hexdigest(), "740708c27a89db0a7f82865be623b5732099ec97aabf399e7dbde1450c87c861")
        for tile, (edges, count, first) in expected.items():
            raw = mdl[tile * 128:(tile + 1) * 128]
            indices = bytes(sum(((raw[p * 32 + y * 2 + x // 8] >> (7 - x % 8)) & 1) << p
                                for p in range(4)) for y in range(16) for x in range(16))
            sides = [indices[:16], indices[15::16], indices[-16:], indices[::16]]
            self.assertEqual("".join(side for side, pixels in zip("NESW", sides) if 3 in pixels), edges)
            self.assertEqual(layout.count(tile), count)
            self.assertEqual([layout.index(tile) % 384, layout.index(tile) // 384], first)
            for season in audit.SEASONS:
                with Image.open(self.root / "web" / f"map_atlas_{season}.png") as atlas:
                    self.assertEqual(atlas.crop((tile % 16 * 16, tile // 16 * 16,
                                                tile % 16 * 16 + 16, tile // 16 * 16 + 16)).tobytes(), indices)

    def test_water_mouth_families_retain_native_pixel_profiles_and_all_original_witnesses(self):
        # NESW index-3 pixel counts describe these images, not water masks or rule ports.
        expected = {
            96: ([5, 2, 4, 8], 9, [76, 11]), 97: ([4, 8, 5, 2], 13, [249, 20]),
            98: ([8, 3, 4, 4], 14, [293, 36]), 99: ([3, 4, 8, 4], 19, [284, 16]),
            100: ([1, 1, 1, 8], 12, [350, 8]), 101: ([1, 8, 1, 2], 28, [308, 10]),
            102: ([8, 1, 4, 1], 12, [22, 7]), 103: ([3, 1, 8, 1], 15, [147, 25]),
        }
        mdl = (self.root.parent / "Dragon/MMAP.MDL").read_bytes()
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        self.assertEqual(hashlib.sha256(layout).hexdigest(), "740708c27a89db0a7f82865be623b5732099ec97aabf399e7dbde1450c87c861")
        for tile, (counts, occurrences, first) in expected.items():
            raw = mdl[tile * 128:(tile + 1) * 128]
            indices = bytes(sum(((raw[p * 32 + y * 2 + x // 8] >> (7 - x % 8)) & 1) << p
                                for p in range(4)) for y in range(16) for x in range(16))
            self.assertEqual([pixels.count(3) for pixels in [indices[:16], indices[15::16], indices[-16:], indices[::16]]], counts)
            self.assertEqual(layout.count(tile), occurrences)
            self.assertEqual([layout.index(tile) % 384, layout.index(tile) // 384], first)
            for season in audit.SEASONS:
                with Image.open(self.root / "web" / f"map_atlas_{season}.png") as atlas:
                    self.assertEqual(atlas.crop((tile % 16 * 16, tile // 16 * 16,
                                                tile % 16 * 16 + 16, tile // 16 * 16 + 16)).tobytes(), indices)

    def test_final_coast_atoms_keep_original_occurrences_and_read_only_scope(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        for tile, count, first in [(41, 19, [304, 39]), (42, 9, [362, 44]), (74, 1, [272, 52]), (75, 6, [373, 47]), (79, 37, [148, 25])]:
            item = next(item for item in catalog["items"] if item["itemId"] == f"coast-edge-{tile}-v1")
            positions = [[i % 384, i // 384] for i, byte in enumerate(layout) if byte == tile]
            self.assertEqual((len(positions), positions[0]), (count, first))
            self.assertEqual((item["tile"], item["category"], item["support"], item["geographyEffect"]),
                             (tile, "ground", "reference-only", "unresolved"))
            self.assertNotIn("geographyMask", item)
            self.assertNotIn("authorWaterClass", item)

    def test_multicell_catalog_original_windows_and_four_seasons(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog["catalogRevision"], "map-sprite-samples-41")
        self.assertEqual([item["itemId"] for item in catalog["components"]],
                         ["shore-shallow-arc-2-v1", "shore-left-line-2-v1", "shore-upper-line-2-v1", "shore-lower-bend-2-v1", "shore-right-line-2-v1", "shore-lower-line-2-v1", "mountain-slope-double-face-18-v1", "mountain-slope-tall-face-20-v1", "mountain-slope-upper-face-22-v1", "mountain-slope-stepped-face-13-v1", "mountain-slope-shoulder-10-v1", "mountain-slope-face-12-v1", "mountain-slope-east-hook-9-v1", "mountain-slope-lower-steps-14-v1", "mountain-slope-upper-steps-14-v1", "mountain-slope-narrow-tail-10-v1", "mountain-slope-east-tall-8-v1", "mountain-slope-lower-7-v1", "mountain-slope-west-tail-7-v1", "mountain-slope-west-open-7-v1", "mountain-slope-tail-2-v1", "mountain-slope-east-step-5-v1", "mountain-slope-west-open-5a-v1", "mountain-slope-west-open-5b-v1", "mountain-slope-west-6-v1", "mountain-slope-west-foot-4-v1", "mountain-slope-east-open-5-v1", "city-corner-east-top-2-v1", "city-corner-east-bottom-2-v1", "city-corner-south-left-2-v1", "city-corner-south-right-2-v1", "city-edge-north-3-v1", "city-edge-south-3-v1", "city-edge-west-3-v1", "city-edge-east-3-v1", "field-corner-se-v1", "field-corner-sw-v1", "field-corner-ne-v1", "field-corner-nw-v1", "mountain-block-6-v1", "mountain-east-6-v1", "mountain-west-6-v1", "mountain-foot-4-v1", "mountain-step-up-3-v1", "mountain-step-down-3-v1", "mountain-east-4-v1", "mountain-foot-east-4-v1", "wall-corner-3-v1", "mountain-column-4-v1", "field-column-2-v1", "river-bank-strip-3-v1", "mountain-strip-4-v1", "wall-strip-5-v1", "wall-start-2-v1", "wall-end-2-v1", "wall-turn-2-v1", "wall-short-3-v1", "field-strip-2-v1"])
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        self.assertEqual([item["itemId"] for item in catalog["recipes"]],
                         [f"coast-{suffix}-4-v1" for suffix in ["pointed-tip", "lower-diagonal", "rising-diagonal", "right-notch", "narrow-inlet", "opposed-corners", "rounded-bay", "vertical-step", "horizontal-step", "right-angle", "left-bay", "right-cape", "diagonal-neck", "narrow-cape", "rounded-head", "fork-inlet"]] + ["water-pool-outline-13-v1"] + [f"mountain-slope-{suffix}-4-v1" for suffix in
            ["diagonal", "fold", "lower-turn", "upper-turn", "horizontal", "double-step", "narrow-face", "notched-face", "lower-face", "compact"]])
        self.assertEqual(catalog["recipes"][-1]["tiles"], [[0, 0, 166], [1, 0, 160], [0, 1, 161], [1, 1, 174]])
        for item in catalog["components"] + catalog["recipes"]:
            source, tiles = item["source"], item["tiles"]
            self.assertEqual(source["layoutSha256"], hashlib.sha256(layout).hexdigest())
            self.assertEqual(item["anchor"], [0, 0])
            self.assertEqual(item["footprint"], [[x, y] for x, y, _ in tiles])
            reference_only = item["itemId"].startswith(("coast-", "shore-", "city-", "water-pool-")) or item["itemId"] == "river-bank-strip-3-v1"
            self.assertEqual(item["support"], "reference-only" if reference_only else "existing-decoration")
            self.assertEqual(item["geographyEffect"], "unresolved" if reference_only else "preserve-underlay")
            if item["itemId"].startswith(("shore-", "coast-")):
                self.assertEqual(item["category"], "ground", "Web category follows design §6.2, not rule admission")
            self.assertEqual(item["ruleRecipeRef"], "ki-byte-stamp-1")
            width, height = max(x for x, _, _ in tiles) + 1, max(y for _, y, _ in tiles) + 1
            self.assertEqual(source.get("rgbHoleCarrier"), [0, 0, 0] if len(tiles) < width * height else None)
            if item["itemId"] == "wall-corner-3-v1":
                self.assertEqual(tiles, [[0, 0, 248], [1, 0, 223], [1, 1, 250]])
                self.assertEqual(source["firstWitness"], [5, 38])
                self.assertEqual(source["occurrences"], 2)
            matches = [[x, y] for y in range(257 - height) for x in range(385 - width)
                       if all(layout[(y + dy) * 384 + x + dx] == tile for dx, dy, tile in tiles)]
            self.assertEqual(source["firstWitness"], matches[0])
            self.assertEqual(source["occurrences"], len(matches))
            for season in audit.SEASONS:
                with Image.open(self.root / "web" / f"map_atlas_{season}.png") as atlas:
                    image = Image.new("RGB", (width * 16, height * 16))
                    for dx, dy, tile in tiles:
                        left, top = tile % 16 * 16, tile // 16 * 16
                        image.paste(atlas.crop((left, top, left + 16, top + 16)).convert("RGB"), (dx * 16, dy * 16))
                    self.assertEqual(source["seasonRgbSha256"][season], hashlib.sha256(image.tobytes()).hexdigest())
            for tile in {tile for _, _, tile in tiles}:
                self.assertIn(item["itemId"], self.report["atoms"][tile]["componentItemIds"])

    def test_four_categories_of_composition_examples_match_original_cells_and_transparent_pixels(self):
        catalog = json.loads((self.root / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        report = json.loads((self.output / "examples.json").read_text(encoding="utf-8"))
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        by_id = {item["itemId"]: item for item in catalog["components"]}
        self.assertEqual(report["catalogRevision"], catalog["catalogRevision"])
        self.assertEqual(report["layoutSha256"], hashlib.sha256(layout).hexdigest())
        self.assertEqual(report["scriptSha256"], self.report["scriptSha256"])
        self.assertEqual([row["category"] for row in report["examples"]], ["mountain", "water", "field", "wall", "wall"])
        self.assertEqual([row["source"] for row in report["examples"]], [
            {"firstWitness": [175, 32], "occurrences": 1}, {"firstWitness": [245, 2], "occurrences": 11},
            {"firstWitness": [72, 12], "occurrences": 237}, {"firstWitness": [5, 38], "occurrences": 1},
            {"firstWitness": [13, 42], "occurrences": 2}])
        html = (self.output / "examples.html").read_text(encoding="utf-8")
        self.assertIn('href="examples.html"', (self.output / "review.html").read_text(encoding="utf-8"))
        self.assertNotRegex(html, r"(?i)<script|https?://|background-size|transform:")
        for row, configured in zip(report["examples"], catalog["examples"], strict=True):
            self.assertEqual(row["placements"], configured["placements"])
            self.assertEqual(row["referenceOnly"], row["category"] == "water")
            cells = {}
            for placement in configured["placements"]:
                for dx, dy, tile in by_id[placement["itemId"]]["tiles"]:
                    pos = placement["x"] + dx, placement["y"] + dy
                    self.assertEqual(cells.get(pos, tile), tile, "overlapping items must agree, not overwrite contradictory bytes")
                    cells[pos] = tile
            self.assertEqual(row["cells"], [[x, y, cells[x, y]] for x, y in sorted(cells, key=lambda p: (p[1], p[0]))])
            width, height = row["size"]
            hits = [[x, y] for y in range(257 - height) for x in range(385 - width)
                    if all(layout[(y + dy) * 384 + x + dx] == tile for (dx, dy), tile in cells.items())]
            self.assertEqual(row["source"], {"firstWitness": hits[0], "occurrences": len(hits)})
            for season, image_ref in row["seasonImages"].items():
                with Image.open(self.output / image_ref["path"]) as image, Image.open(self.root / "web" / f"map_atlas_{season}.png") as atlas:
                    self.assertEqual(image.mode, "RGBA")
                    self.assertEqual(image.size, (width * 16, height * 16))
                    self.assertEqual(hashlib.sha256(image.tobytes()).hexdigest(), image_ref["rgbaSha256"])
                    self.assertIn(f'width="{width * 16}" height="{height * 16}"', html)
                    for y in range(height):
                        for x in range(width):
                            crop = image.crop((x * 16, y * 16, (x + 1) * 16, (y + 1) * 16))
                            if (x, y) not in cells:
                                self.assertEqual(crop.tobytes(), bytes(16 * 16 * 4))
                            else:
                                tile = cells[x, y]
                                original = atlas.crop((tile % 16 * 16, tile // 16 * 16, tile % 16 * 16 + 16, tile // 16 * 16 + 16)).convert("RGBA")
                                self.assertEqual(crop.tobytes(), original.tobytes())

    def test_complete_identity_and_native_pixel_samples(self):
        report = self.report
        self.assertEqual([atom["byte"] for atom in report["atoms"]], list(range(256)))
        self.assertEqual(report["summary"]["used"], 238)
        self.assertEqual(report["catalog"]["revision"], "map-sprite-samples-41")
        self.assertEqual(report["catalog"]["items"], 188)
        self.assertEqual(report["catalog"]["multiCellItems"], 85)
        self.assertEqual(report["catalog"]["materializedRecipes"], 10)
        self.assertEqual(report["catalog"]["referenceRecipes"], 17)
        self.assertEqual(report["catalog"]["support"], {"existing-decoration": 66, "reference-only": 122})
        self.assertEqual(report["fourSeasonVisualDuplicates"], [[72, 190]])
        self.assertEqual(report["summary"]["strictAtomicIdentities"], 256)
        self.assertTrue(all(atom["placementSupport"] == "not-certified-by-this-audit"
                            and atom["advancedReference"] for atom in report["atoms"]))
        self.assertEqual(report["summary"]["pendingIdentification"], 0)
        self.assertEqual(report["summary"]["dispositions"], {
            "catalog-reference": 79, "read-only-reference": 162,
            "base-preset": 1, "advanced-retained": 14,
        })
        expected = {0: "catalog-reference", 1: "catalog-reference", 2: "catalog-reference",
                    **{tile: "read-only-reference" for tile in [11, 14, 15, 22, 26, 27, 30, 31, 34, 35, 39, 41, 42, 43, 46, 47, 50, 51, 57, 62, 63, 65, 68, 73, 74, 75, 76, 77, 79, 81, 82, 83, 86, 87]},
                    **{tile: "read-only-reference" for tile in [7, 23, 40, 56, 58, 59, 66, 67, 69, 70, 71, 78, 84, 85]},
                    **{tile: "read-only-reference" for tile in [96, 97, 98, 99, 100, 101, 102, 103, 38, 44, 45, 54, 55, 60, 61, 64, 80, 88, 89, 90, 91, 92, 93, 94, 104, 105, 106, 107, 108, 109, 110, 111]},
                    **{tile: "catalog-reference" for tile in [160, 161, 166, 174, 137, 142, 151, 153, 154, 157, 158, 164, 165, 167, 169, 170, 172]},
                    **{tile: "catalog-reference" for tile in [116, 117, 118, 119, 121, 122, 123, 125, 127, 128, 130, 131, 134, 135, 138, 139, 140, 141, 143, 144, 145, 146, 147, 150, 152, 155, 156, 159, 163, 171, 173, 175]},
                    **{tile: "advanced-retained" for tile in [72, 190, 222, 230, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241]},
                    17: "catalog-reference", 18: "catalog-reference", 20: "catalog-reference",
                    181: "catalog-reference", 182: "catalog-reference", 183: "catalog-reference",
                    **{tile: "read-only-reference" for tile in [4, 5, 8, 9, 10, 12, 21, 24, 25, 3, 13, 19, 28, 32, 33, 36, 37, 48, 49, 52, 53, 196, 197, 198, 199, 200, 201, 206, 207, 208, 209, 210, 211, 254, 255, 186, 187, 188, 189, 192, 193, 194, 195, 191, 202, 29, 251, 168, 176, 177, 178, 179, 226, 227, 228, 229, 242, 243, 244, 245, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 224, 225, 246, 247, 252, 253]},
                    184: "read-only-reference", 185: "read-only-reference", 203: "read-only-reference",
                    204: "read-only-reference", 205: "read-only-reference", 115: "catalog-reference", 120: "catalog-reference", 136: "catalog-reference",
                    124: "catalog-reference", 126: "catalog-reference", 129: "catalog-reference",
                    148: "catalog-reference", 149: "catalog-reference", 162: "catalog-reference",
                    16: "catalog-reference", 112: "catalog-reference", 180: "catalog-reference", 248: "catalog-reference",
                    6: "read-only-reference", 95: "base-preset",
                    113: "catalog-reference", 132: "catalog-reference", 231: "catalog-reference", 249: "catalog-reference",
                    114: "catalog-reference", 133: "catalog-reference", 223: "catalog-reference", 250: "catalog-reference"}
        for atom in report["atoms"]:
            self.assertEqual(atom["disposition"], expected.get(atom["byte"], "pending-identification"))
            reference_only = atom["disposition"] in ("pending-identification", "advanced-retained")
            self.assertEqual(atom["catalogItemId"] is None, reference_only)
            if reference_only:
                self.assertIsNone(atom["webCategory"])
                self.assertEqual(atom["categoryConfidence"], "unknown")
                self.assertEqual(atom["webSupport"], "advanced-read-only")
        for name in ("mapspritecatalog.json", "mapbasepresets.json"):
            path = "editor-ui/src/" + name
            data = (self.root / path).read_bytes()
            self.assertEqual(report["inputs"][path], {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        self.assertEqual(sum(atom["candidateCategory"] is not None for atom in report["atoms"]), 4)
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        samples = json.loads((self.output / "samples.json").read_text(encoding="utf-8"))
        self.assertEqual(samples["sourceRevision"], self.registration["revision"])
        self.assertEqual(samples["layoutSha256"], hashlib.sha256(layout).hexdigest())
        self.assertEqual(len(samples["samples"]), 4)
        html = (self.output / "samples.html").read_text(encoding="utf-8")
        for sample in samples["samples"]:
            left, top = sample["sourceOrigin"]
            width, height = sample["inspectionSize"]
            sx, sy = sample["sourceSeed"]
            self.assertEqual(sample["seedOffset"], [sx - left, sy - top])
            self.assertEqual(layout[sy * 384 + sx], sample["seedByte"])
            self.assertEqual(sample["cells"], [[x, y, layout[(top + y) * 384 + left + x]]
                                              for y in range(height) for x in range(width)])
            for field in ("anchor", "footprint", "geographyMask", "trustedRecipe"):
                self.assertIsNone(sample[field])
            for season in audit.SEASONS:
                info = sample["seasonImages"][season]
                with Image.open(self.root / "web" / f"map_atlas_{season}.png") as indexed, Image.open(self.output / info["path"]) as image:
                    atlas = indexed.convert("RGB")
                    self.assertEqual(image.size, (width * 16, height * 16))
                    self.assertEqual(hashlib.sha256(image.tobytes()).hexdigest(), info["rgbSha256"])
                    for x, y, tile in sample["cells"]:
                        tx, ty = tile % 16 * 16, tile // 16 * 16
                        self.assertEqual(image.crop((x * 16, y * 16, x * 16 + 16, y * 16 + 16)).tobytes(),
                                         atlas.crop((tx, ty, tx + 16, ty + 16)).tobytes())
                self.assertIn(f'src="{info["path"]}" width="{width * 16}" height="{height * 16}"', html)
        for name in ("samples.html", "review.html"):
            text = (self.output / name).read_text(encoding="utf-8").lower()
            self.assertNotIn("<script", text)
            self.assertNotIn("https://", text)
            self.assertNotIn("http://", text)

    def test_repetition_pixels_and_observed_windows(self):
        report = json.loads((self.output / "repetition.json").read_text(encoding="utf-8"))
        self.assertEqual(report["schema"], "map-sprite-repetition-review-1")
        self.assertEqual(report["sourceRevision"], self.registration["revision"])
        self.assertEqual(report["layoutSha256"], self.report["layoutSha256"])
        self.assertEqual(report["scriptSha256"], self.report["scriptSha256"])
        self.assertEqual([row["byte"] for row in report["atoms"]], list(range(256)))
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        # Independent nine-cell enumeration, including the last legal row/column.
        counts, witnesses = Counter(), {}
        for y in range(254):
            for x in range(382):
                values = {layout[(y + dy) * 384 + x + dx] for dy in range(3) for dx in range(3)}
                if len(values) == 1:
                    tile = values.pop()
                    counts[tile] += 1
                    witnesses.setdefault(tile, [x, y])
        self.assertTrue(counts)
        self.assertLess(len(counts), 256)
        html = (self.output / "repetition.html").read_text(encoding="utf-8")
        index = (self.output / "review.html").read_text(encoding="utf-8")
        for row in report["atoms"]:
            tile = row["byte"]
            self.assertEqual(row["occurrences"], counts[tile])
            self.assertEqual(row["firstWitness"], witnesses.get(tile))
            self.assertEqual(row["rect"], [tile % 16 * 48, tile // 16 * 48, 48, 48])
            self.assertIn(f'id="repeat-{tile}"', html)
            self.assertIn(f'href="review.html#atom-{tile}"', html)
            self.assertIn(f'href="repetition.html#repeat-{tile}"', index)
            for forbidden in ("geographyMask", "waterClass", "trustedRecipe", "placementSupport"):
                self.assertNotIn(forbidden, row)
        for season in audit.SEASONS:
            info = report["sheets"][season]
            with Image.open(self.output / info["path"]) as sheet, Image.open(self.root / "web" / f"map_atlas_{season}.png") as original:
                self.assertEqual(sheet.size, (768, 768))
                self.assertEqual(info["size"], list(sheet.size))
                self.assertEqual(hashlib.sha256(sheet.tobytes()).hexdigest(), info["rgbSha256"])
                atlas = original.convert("RGB")
                for row in report["atoms"]:
                    tile = row["byte"]
                    tx, ty = tile % 16 * 16, tile // 16 * 16
                    expected = atlas.crop((tx, ty, tx + 16, ty + 16)).tobytes()
                    left, top, _, _ = row["rect"]
                    for dy in range(3):
                        for dx in range(3):
                            x, y = left + dx * 16, top + dy * 16
                            self.assertEqual(sheet.crop((x, y, x + 16, y + 16)).tobytes(), expected)
                    self.assertIn(f'background-position:-{left}px -{top}px', html)
        self.assertEqual(html.count('width:48px;height:48px;'), 256 * 4)
        for forbidden in ('<script', 'http://', 'https://', 'background-size', 'transform:'):
            self.assertNotIn(forbidden, html.lower())

    def test_all_slot_contexts_preserve_witnesses_and_four_season_pixels(self):
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        report = json.loads((self.output / "contexts.json").read_text(encoding="utf-8"))
        self.assertEqual(report["schema"], "map-sprite-atom-contexts-1")
        self.assertEqual(report["sourceRevision"], self.registration["revision"])
        self.assertEqual(report["layoutSha256"], hashlib.sha256(layout).hexdigest())
        self.assertEqual(report["scriptSha256"], self.report["scriptSha256"])
        self.assertEqual(report["summary"], {"atoms": 256, "withWitness": 238, "withoutWitness": 18})
        self.assertEqual([row["byte"] for row in report["atoms"]], list(range(256)))
        html = (self.output / "review.html").read_text(encoding="utf-8")
        for row in report["atoms"]:
            tile = row["byte"]
            position = layout.find(bytes([tile]))
            if position < 0:
                for field in ("firstWitness", "sourceOrigin", "inspectionSize", "seedOffset"):
                    self.assertIsNone(row[field], "unused slots must not acquire fabricated witnesses")
                self.assertEqual(row["cells"], [])
                self.assertEqual(row["seasonImages"], {})
                self.assertFalse((self.output / f"context-{tile}.png").exists())
                continue
            cx, cy = position % 384, position // 384
            self.assertEqual(row["firstWitness"], [cx, cy])
            left, top = row["sourceOrigin"]
            width, height = row["inspectionSize"]
            self.assertEqual([left, top], [max(0, cx - 2), max(0, cy - 2)])
            self.assertEqual([left + width, top + height], [min(384, cx + 3), min(256, cy + 3)])
            self.assertEqual(row["seedOffset"], [cx - left, cy - top])
            expected = [[x, y, layout[(top + y) * 384 + left + x]]
                        for y in range(height) for x in range(width)]
            self.assertEqual(row["cells"], expected)
            self.assertEqual(list(row["seasonImages"]), list(audit.SEASONS))
            for season in audit.SEASONS:
                info = row["seasonImages"][season]
                with Image.open(self.root / "web" / f"map_atlas_{season}.png") as indexed, Image.open(self.output / info["path"]) as image:
                    atlas = indexed.convert("RGB")
                    self.assertEqual(image.size, (width * 16, height * 16))
                    self.assertEqual(hashlib.sha256(image.tobytes()).hexdigest(), info["rgbSha256"])
                    for x, y, neighbor in expected:
                        tx, ty = neighbor % 16 * 16, neighbor // 16 * 16
                        self.assertEqual(image.crop((x * 16, y * 16, x * 16 + 16, y * 16 + 16)).tobytes(),
                                         atlas.crop((tx, ty, tx + 16, ty + 16)).tobytes())
                self.assertIn(f'src="{info["path"]}" width="{width * 16}" height="{height * 16}"', html)
            for field in ("footprint", "anchor", "geographyMask", "trustedRecipe"):
                self.assertNotIn(field, row, "inspection windows do not certify recipes")

    def test_observed_adjacency_has_exact_counts_and_source_witnesses(self):
        layout = audit.rle_decode((self.root.parent / "Dragon/MMAP.MAP").read_bytes())
        report = json.loads((self.output / "adjacency.json").read_text(encoding="utf-8"))
        self.assertEqual(report["sourceRevision"], self.registration["revision"])
        self.assertEqual(report["layoutSha256"], hashlib.sha256(layout).hexdigest())
        self.assertEqual(report["totals"], {"east": 383 * 256, "south": 384 * 255})
        # Independent axis-wise scan, rather than the generator's per-cell loop.
        expected = Counter()
        witnesses = {}
        for axis, step, width, height in (("east", 1, 383, 256), ("south", 384, 384, 255)):
            for y in range(height):
                row = layout[y * 384:y * 384 + width]
                neighbours = layout[y * 384 + step:y * 384 + step + width]
                for x, pair in enumerate(zip(row, neighbours)):
                    key = (axis, *pair)
                    expected[key] += 1
                    witnesses.setdefault(key, [x, y])
        actual = {(row["axis"], *row["bytes"]): row["occurrences"] for row in report["pairs"]}
        self.assertEqual(len(actual), len(report["pairs"]), "no duplicate pair rows")
        self.assertEqual(actual, expected)
        self.assertEqual(list(actual), sorted(actual), "stable output order")
        for row in report["pairs"]:
            self.assertEqual(row["firstWitness"], witnesses[(row["axis"], *row["bytes"])])
        samples = json.loads((self.output / "samples.json").read_text(encoding="utf-8"))
        for sample in samples["samples"]:
            self.assertEqual(sample["observedAdjacency"],
                             [row for row in report["pairs"] if sample["seedByte"] in row["bytes"]])
            self.assertIsNone(sample["trustedRecipe"], "observation must not grant placement")

    def test_all_adjacency_previews_are_exact_directional_four_season_crops(self):
        report = json.loads((self.output / "adjacency-preview.json").read_text(encoding="utf-8"))
        observed = json.loads((self.output / "adjacency.json").read_text(encoding="utf-8"))
        self.assertEqual(report["schema"], "map-sprite-adjacency-preview-1")
        for field in ("sourceRevision", "layoutSha256", "scriptSha256"):
            self.assertEqual(report[field], observed[field])
        self.assertEqual([(row["axis"], row["bytes"]) for row in report["pairs"]],
                         [(row["axis"], row["bytes"]) for row in observed["pairs"]])
        html = (self.output / "adjacency.html").read_text(encoding="utf-8")
        review = (self.output / "review.html").read_text(encoding="utf-8")
        self.assertNotIn("<script", html.lower())
        self.assertNotIn("https://", html.lower())
        self.assertNotIn("http://", html.lower())
        ids = set(re.findall(r'id="([^"]+)"', html))
        styles = set(re.findall(r'style="display:block;([^"]+)"', html))
        links = set(re.findall(r'href="([^"]+)"', review))
        witness_cells = set(re.findall(r'<td>\d+</td><td>\(\d+,\d+\)</td><td>\d+, \d+</td>', html))
        for axis, width, height in (("east", 32, 16), ("south", 16, 32)):
            rows = [row for row in report["pairs"] if row["axis"] == axis]
            rectangles = [tuple(row["rect"]) for row in rows]
            self.assertEqual(len(set(rectangles)), len(rows), "unique pair rectangles")
            for season in audit.SEASONS:
                info = report["sheets"][axis][season]
                with Image.open(self.output / info["path"]) as sheet, Image.open(self.root / "web" / f"map_atlas_{season}.png") as indexed:
                    atlas = indexed.convert("RGB")
                    self.assertEqual(list(sheet.size), info["size"])
                    self.assertEqual(sheet.width, 1024)
                    self.assertEqual(hashlib.sha256(sheet.tobytes()).hexdigest(), info["rgbSha256"])
                    for index, row in enumerate(rows):
                        left, top, w, h = row["rect"]
                        self.assertEqual([left, top, w, h],
                                         [index % (1024 // width) * width,
                                          index // (1024 // width) * height, width, height])
                        self.assertLessEqual(top + h, sheet.height)
                        for side, tile in enumerate(row["bytes"]):
                            x = left + (side * 16 if axis == "east" else 0)
                            y = top + (side * 16 if axis == "south" else 0)
                            tx, ty = tile % 16 * 16, tile // 16 * 16
                            self.assertEqual(sheet.crop((x, y, x + 16, y + 16)).tobytes(),
                                             atlas.crop((tx, ty, tx + 16, ty + 16)).tobytes())
                        first, second = row["bytes"]
                        self.assertIn(f'pair-{axis}-{first}-{second}', ids)
                        self.assertIn(f'width:{w}px;height:{h}px;background-image:url({info["path"]});'
                                      f'background-position:-{left}px -{top}px', styles)
            for tile in range(256):
                present = any(row["bytes"][0] == tile for row in rows)
                self.assertEqual(f'adjacency.html#{axis}-{tile}' in links, present)
                self.assertEqual(f'{axis}-{tile}' in ids, present)
        for row in observed["pairs"]:
            x, y = row["firstWitness"]
            offset = y * 384 + x
            next_offset = offset + (1 if row["axis"] == "east" else 384)
            self.assertIn(f'<td>{row["occurrences"]}</td><td>({x},{y})</td>'
                          f'<td>{offset}, {next_offset}</td>', witness_cells)

    def test_repeat_is_byte_identical(self):
        with patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
            repeated = self.generate("repeat")
        files = sorted(path.name for path in self.output.iterdir())
        self.assertEqual(files, sorted(path.name for path in repeated.iterdir()))
        for name in files:
            self.assertEqual((self.output / name).read_bytes(), (repeated / name).read_bytes(), name)

    def test_registration_mismatch_refuses_before_output(self):
        for season in audit.SEASONS:
            for field, value in (("sha256", "0" * 64), ("byteLength", 0), ("path", "wrong.png")):
                with self.subTest(season=season, field=field):
                    registration = copy.deepcopy(self.registration)
                    registration["seasonAtlases"][season][field] = value
                    name = f"bad-{season}-{field}"
                    with patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(registration))):
                        with self.assertRaises(AssertionError):
                            self.generate(name)
                    self.assertFalse((self.root / ".dragon-analysis" / ("sprite-atoms-" + name)).exists())

    def test_advanced_retention_preserves_duplicate_bytes_and_unknown_rules(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_bytes())
        self.assertEqual(len(catalog["advancedRetention"]), 2)
        group = catalog["advancedRetention"][0]
        self.assertEqual(group["tiles"], [72, 190])
        raw = (self.root.parent / "Dragon/MMAP.MDL").read_bytes()
        self.assertEqual(raw[9216:9344], raw[24320:24448])
        self.assertEqual(hashlib.sha256(raw[9216:9344]).hexdigest(), group["source"]["sha256"])
        for tile in group["tiles"]:
            atom = self.report["atoms"][tile]
            self.assertEqual(atom["retentionGroupId"], group["groupId"])
            self.assertEqual(atom["disposition"], "advanced-retained")
            self.assertEqual(atom["mapOccurrences"], 0)
            self.assertIsNone(atom["webCategory"])
            self.assertEqual(atom["categoryConfidence"], "unknown")
            self.assertEqual(atom["seasonRgbSha256"], group["source"]["seasonRgbSha256"])
        self.assertTrue(all(item["tile"] not in group["tiles"] for item in catalog["items"]))

    def test_advanced_retention_rejects_unproven_or_conflicting_groups_before_output(self):
        path = self.root / "editor-ui/src/mapspritecatalog.json"
        before = path.read_bytes()
        self.addCleanup(path.write_bytes, before)
        cases = (("tiles", [72, 72]), ("tiles", [72, 95]), ("tiles", [72, 191]), ("tiles", [72, 232]),
                 ("sha256", "0" * 64), ("seasonRgbSha256", {"spring": "0" * 64}),
                 ("layoutSha256", "0" * 64), ("mapOccurrences", 1), ("offsets", [0, 24320]))
        for index, (field, value) in enumerate(cases):
            catalog = json.loads(before)
            group = catalog["advancedRetention"][0]
            if field == "tiles":
                group[field] = value
                group["source"]["offsets"] = [tile * 128 for tile in value]
            else:
                group["source"][field] = value
            path.write_text(json.dumps(catalog), encoding="utf-8")
            name = f"retention-mismatch-{index}"
            with self.subTest(field=field, value=value), patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
                with self.assertRaises(AssertionError):
                    self.generate(name)
                self.assertFalse((self.root / ".dragon-analysis" / ("sprite-atoms-" + name)).exists())
            path.write_bytes(before)

    def test_native_corner_retention_keeps_full_family_without_hiding_existing_wall_references(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_bytes())
        group = catalog["advancedRetention"][1]
        self.assertEqual(group["source"]["pairs"], [[tile, tile + 10] for tile in range(222, 232)])
        self.assertEqual(group["tiles"], [tile for tile in range(222, 242) if tile not in (223, 224, 225, 226, 227, 228, 229, 231)])
        for tile in group["tiles"]:
            atom = self.report["atoms"][tile]
            self.assertEqual(atom["disposition"], "advanced-retained")
            self.assertEqual(atom["retentionGroupId"], group["groupId"])
            self.assertIsNone(atom["catalogItemId"])
        for tile in (223, 231):
            self.assertEqual(self.report["atoms"][tile]["disposition"], "catalog-reference")
        self.assertTrue(all(self.report["atoms"][tile]["mapOccurrences"] == 0 for tile in range(232, 242)))
        self.assertIn("KI.EXE", self.report["inputs"])
        self.assertIn("SINARIO.DAT", self.report["inputs"])

    def test_native_corner_retention_rejects_unproven_family_or_provenance(self):
        path = self.root / "editor-ui/src/mapspritecatalog.json"
        before = path.read_bytes()
        self.addCleanup(path.write_bytes, before)
        source = json.loads(before)["advancedRetention"][1]
        cases = [("tiles", source["tiles"][:-1]), ("tiles", [*source["tiles"], 223]),
                 ("tiles", [*source["tiles"], 251]), ("reason", "guessed"),
                 ("pairs", [[222, 233], *source["source"]["pairs"][1:]]),
                 ("nativeWindow", {**source["source"]["nativeWindow"], "start": 0}),
                 ("nativeInputSha256", {"KI.EXE": "0" * 64}), ("resourceSha256", "0" * 64)]
        for index, (field, value) in enumerate(cases):
            catalog = json.loads(before)
            group = catalog["advancedRetention"][1]
            (group if field in ("tiles", "reason") else group["source"])[field] = value
            path.write_text(json.dumps(catalog), encoding="utf-8")
            name = f"native-retention-mismatch-{index}"
            with self.subTest(field=field), patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
                with self.assertRaises(AssertionError):
                    self.generate(name)
                self.assertFalse((self.root / ".dragon-analysis" / ("sprite-atoms-" + name)).exists())
            path.write_bytes(before)

    def test_modified_native_input_refuses_before_registration_or_output(self):
        path = self.root.parent / "Dragon/KI.EXE"
        before = path.read_bytes()
        self.addCleanup(path.write_bytes, before)
        changed = bytearray(before); changed[0x8BF0] ^= 1
        path.write_bytes(changed)
        with patch.object(audit.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "fixed source SHA mismatch: KI.EXE"):
                self.generate("bad-native-exe")
            run.assert_not_called()
        self.assertFalse((self.root / ".dragon-analysis/sprite-atoms-bad-native-exe").exists())

    def test_catalog_provenance_mismatch_refuses_before_output(self):
        cases = (
            ("mapspritecatalog.json", "sourceRevision", "wrong"),
            ("mapspritecatalog.json", "sha256", "0" * 64),
            ("mapspritecatalog.json", "seasonRgbSha256", {"spring": "0" * 64}),
            ("mapbasepresets.json", "revision", "wrong"),
            ("mapbasepresets.json", "sha256", "0" * 64),
            ("mapbasepresets.json", "seasonRgbSha256", {"spring": "0" * 64}),
        )
        for index, (filename, field, value) in enumerate(cases):
            path = self.root / "editor-ui/src" / filename
            before = path.read_bytes()
            self.addCleanup(path.write_bytes, before)
            catalog = json.loads(before)
            if field == "sourceRevision":
                catalog[field] = value
            elif filename == "mapspritecatalog.json":
                catalog["items"][0]["source"][field] = value
            else:
                catalog["items"]["sea-base-95-v1"]["source"][field] = value
            path.write_text(json.dumps(catalog), encoding="utf-8")
            name = f"catalog-mismatch-{index}"
            with self.subTest(file=filename, field=field), patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
                with self.assertRaises(AssertionError):
                    self.generate(name)
                self.assertFalse((self.root / ".dragon-analysis" / ("sprite-atoms-" + name)).exists())
            path.write_bytes(before)

    def test_component_witness_mismatch_refuses_before_output(self):
        path = self.root / "editor-ui/src/mapspritecatalog.json"
        before = path.read_bytes()
        self.addCleanup(path.write_bytes, before)
        for index, (field, value) in enumerate((("firstWitness", [0, 0]), ("occurrences", 0),
                                               ("layoutSha256", "0" * 64), ("seasonRgbSha256", {season: "0" * 64 for season in audit.SEASONS}))):
            catalog = json.loads(before)
            catalog["components"][0]["source"][field] = value
            path.write_text(json.dumps(catalog), encoding="utf-8")
            name = f"component-mismatch-{index}"
            with self.subTest(field=field), patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
                with self.assertRaises(AssertionError):
                    self.generate(name)
                self.assertFalse((self.root / ".dragon-analysis" / ("sprite-atoms-" + name)).exists())
            path.write_bytes(before)

    def test_materialized_recipe_requires_original_witness_and_no_borrowed_definition_identity(self):
        path = self.root / "editor-ui/src/mapspritecatalog.json"
        before = path.read_bytes()
        self.addCleanup(path.write_bytes, before)
        for index in range(3):
            catalog = json.loads(before)
            recipe = catalog["recipes"][0]
            if index == 0:
                recipe["source"]["occurrences"] = 0
            elif index == 1:
                recipe["source"]["seasonRgbSha256"]["winter"] = "0" * 64
            else:
                recipe["definitionRef"] = catalog["components"][0]["definitionRef"]
            path.write_text(json.dumps(catalog), encoding="utf-8")
            name = f"materialized-recipe-mismatch-{index}"
            with self.subTest(index=index), patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
                with self.assertRaises(AssertionError):
                    self.generate(name)
                self.assertFalse((self.root / ".dragon-analysis" / ("sprite-atoms-" + name)).exists())
            path.write_bytes(before)

    def test_component_hole_and_duplicate_coordinates_are_not_inferred(self):
        path = self.root / "editor-ui/src/mapspritecatalog.json"
        before = path.read_bytes()
        self.addCleanup(path.write_bytes, before)
        for index, tiles in enumerate(([[0, 0, 248], [1, 0, 223], [0, 1, 0], [1, 1, 250]],
                                       [[0, 0, 248], [1, 0, 223], [1, 0, 250]],
                                       [[0, 0, 248], [1, 0, 223], [1, 16, 250]])):
            catalog = json.loads(before)
            item = catalog["components"][0]
            item["tiles"], item["footprint"] = tiles, [[x, y] for x, y, _ in tiles]
            path.write_text(json.dumps(catalog), encoding="utf-8")
            name = f"component-shape-{index}"
            with self.subTest(tiles=tiles), patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
                with self.assertRaises(AssertionError):
                    self.generate(name)
                self.assertFalse((self.root / ".dragon-analysis" / ("sprite-atoms-" + name)).exists())
            path.write_bytes(before)

    def test_example_invented_offset_or_witness_refuses_before_output(self):
        path = self.root / "editor-ui/src/mapspritecatalog.json"
        before = path.read_bytes()
        self.addCleanup(path.write_bytes, before)
        for index in range(2):
            catalog = json.loads(before)
            if index == 0:
                catalog["examples"][0]["placements"][1]["x"] = 1
            else:
                catalog["examples"][0]["source"]["firstWitness"] = [0, 0]
            path.write_text(json.dumps(catalog), encoding="utf-8")
            name = f"example-mismatch-{index}"
            with self.subTest(index=index), patch.object(audit.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(self.registration))):
                with self.assertRaises(AssertionError):
                    self.generate(name)
                self.assertFalse((self.root / ".dragon-analysis" / ("sprite-atoms-" + name)).exists())
            path.write_bytes(before)

    def test_validator_failure_refuses_before_output(self):
        with patch.object(audit.subprocess, "run", side_effect=subprocess.CalledProcessError(1, ["node"])):
            with self.assertRaises(subprocess.CalledProcessError):
                self.generate("validator-failed")
        self.assertFalse((self.root / ".dragon-analysis/sprite-atoms-validator-failed").exists())

    def test_existing_output_refuses_without_validator(self):
        before = (self.output / "inventory.json").read_bytes()
        with patch.object(audit.subprocess, "run") as run:
            with self.assertRaisesRegex(SystemExit, "refusing to overwrite"):
                self.generate("valid")
            run.assert_not_called()
        self.assertEqual((self.output / "inventory.json").read_bytes(), before)

    def test_invalid_round_refuses_without_validator(self):
        for name in ("", "../escape", "a/b", "中文", "a" * 49):
            with self.subTest(name=name), patch.object(audit.subprocess, "run") as run:
                with self.assertRaisesRegex(SystemExit, "usage:"):
                    self.generate(name)
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
