"""Fixed non-save original sources only; no engine/profile or live store access."""
from collections import Counter
from contextlib import redirect_stderr
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_map_city_sprite_sources as audit


class CitySpriteSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = {name: (audit.ROOT.parent / "Dragon" / name).read_bytes()
            for name in ("KI.EXE", "MMAP.MDL", "MMAP.MAP")}
        cls.inputs["SINARIO.DAT"] = (audit.ROOT.parent / "原版/SINARIO.DAT").read_bytes()
        cls.report = audit.inspect_city_sources(cls.inputs)

    def test_large_city_corner_pairs_and_wall_end_references(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        layout = audit.rle_decode(self.inputs["MMAP.MAP"])
        items = {item["itemId"]: item for item in catalog["components"]}
        cases = [("east-top", [[0, 0, 223], [0, 1, 246]], (-2, 2), [259, 7]),
                 ("east-bottom", [[0, 0, 246], [0, 1, 225]], (-2, -1), [259, 10]),
                 ("south-left", [[0, 0, 224], [1, 0, 247]], (2, -2), [255, 11]),
                 ("south-right", [[0, 0, 247], [1, 0, 225]], (-1, -2), [258, 11])]
        for side, tiles, (cx, cy), first in cases:
            item = items[f"city-corner-{side}-2-v1"]
            self.assertEqual(item["tiles"], tiles)
            self.assertEqual((item["category"], item["support"], item["geographyEffect"]), ("city", "reference-only", "unresolved"))
            width, height = max(x for x, _, _ in tiles) + 1, max(y for _, y, _ in tiles) + 1
            matches = [(x, y) for y in range(257 - height) for x in range(385 - width)
                       if all(layout[(y + dy) * 384 + x + dx] == tile for dx, dy, tile in tiles)]
            expected = {(city["x"] - cx, city["y"] - cy) for city in self.report["chapters"][0]["cities"] if city["typeNibble"] == 0}
            self.assertEqual(set(matches), expected)
            self.assertEqual(len(matches), 21)
            self.assertEqual(item["source"]["firstWitness"], first)
            self.assertEqual(list(matches[0]), first)
            self.assertEqual(item["source"]["occurrences"], 21)
        atoms = {item["tile"]: item for item in catalog["items"]}
        for tile, count in [(252, 22), (253, 1)]:
            self.assertEqual((atoms[tile]["category"], atoms[tile]["support"]), ("wall", "reference-only"))
            self.assertEqual(atoms[tile]["definitionRef"], f"tile-{tile}")
            self.assertEqual(sum(row["byte"] == tile for row in self.report["wallEndObservations"]), count)
            self.assertNotIn("geographyMask", atoms[tile])

    def test_original_complete_windows_and_caller_bounds(self):
        windows = self.report["windows"]
        self.assertEqual([(row["start"], row["endExclusive"], row["fileOffset"]) for row in windows],
                         [(0x89F0, 0x8AEA, 0x8BF0), (0xE4CE, 0xE50C, 0xE6CE)])
        self.assertEqual(windows[0]["sha256"], "11e4ac44e6a7104365b62f752a786d68a84419be04c8bd52a47a7e0f40de5e4c")
        raw = bytes.fromhex(windows[0]["bytesHex"])
        # 192 city slots at 0840h, +20h, not a renderer's array length.
        self.assertEqual(raw[0x89FB - 0x89F0:0x8A09 - 0x89F0].hex(), "b9c000be4008e81a0083c620e2f8")
        self.assertEqual(raw[-1], 0xC3)
        self.assertTrue(windows[0]["instructions"][-1].endswith("ret "))
        self.assertEqual(bytes.fromhex(windows[1]["bytesHex"])[0xE4E5 - 0xE4CE:0xE4ED - 0xE4CE].hex(),
                         "3ccb720c3cd47308")

    def test_official_four_chapters_and_three_center_families(self):
        expected = [(0, 205, 21), (1, 205, 72), (2, 205, 86), (3, 208, 4), (3, 211, 5), (4, 205, 4)]
        self.assertEqual(len(self.report["chapters"]), 4)
        for chapter in self.report["chapters"]:
            self.assertEqual(len(chapter["cities"]), 192)
            self.assertEqual([(r["typeNibble"], r["centerByte"], r["count"]) for r in chapter["typeCenterCounts"]], expected)
        self.assertEqual([(r["c01EqualsCff"], r["otherNonNeutralOwner"], r["c01Equals18h"], r["mapCount"])
                          for r in self.report["centerFamilies"]], [(203, 204, 205, 183), (206, 207, 208, 4), (209, 210, 211, 5)])

    def test_gate_catalog_references_match_two_native_color_families_without_admitting_placement(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        gates = [item for item in catalog["items"] if item["itemId"].startswith("gate-")]
        expected = [row[key] for row in self.report["centerFamilies"][1:]
            for key in ("c01EqualsCff", "otherNonNeutralOwner", "c01Equals18h")]
        self.assertEqual([item["tile"] for item in gates], expected)
        for item in gates:
            self.assertEqual((item["category"], item["support"], item["geographyEffect"]),
                             ("city", "reference-only", "unresolved"))
            self.assertEqual(item["definitionRef"], f"tile-{item['tile']}")
            self.assertEqual(item["anchor"], [0, 0])
            self.assertEqual(item["footprint"], [[0, 0]])
        atoms = {row["byte"]: row for row in self.report["atoms"]}
        self.assertEqual([atoms[item["tile"]]["mapCount"] for item in gates], [0, 0, 4, 0, 0, 5])

    def test_corner_family_retention_matches_native_pairs_without_erasing_wall_uses(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        group = next(row for row in catalog["advancedRetention"] if row["reason"] == "native-city-color-parts")
        self.assertEqual(group["source"]["pairs"], [[row["c01DiffersFromCff"], row["c01EqualsCff"]]
            for row in self.report["cornerPairs"]])
        self.assertEqual(group["tiles"], [tile for tile in range(222, 242) if tile not in (223, 224, 225, 226, 227, 228, 229, 231)])
        self.assertEqual(group["source"]["nativeWindow"], {key: self.report["windows"][0][key]
            for key in ("start", "endExclusive", "sha256")})
        self.assertEqual(group["source"]["nativeInputSha256"], {name: self.report["inputs"][name]["sha256"]
            for name in ("KI.EXE", "SINARIO.DAT")})
        self.assertTrue(all(not row["sameMdlBytes"] for row in self.report["cornerPairs"]))

    def test_map_absence_does_not_mean_no_dynamic_consumer(self):
        absent = self.report["mapAbsentButAddressedByColorBranches"]
        self.assertEqual(absent, [203, 204, 206, 207, 209, 210, *range(232, 242)])
        atoms = {row["byte"]: row for row in self.report["atoms"]}
        self.assertTrue(all(atoms[tile]["mapCount"] == 0 for tile in absent))
        self.assertTrue(all(atoms[tile]["mdlOffset"] == tile * 128 for tile in absent))
        self.assertFalse({72, 190} & set(absent), "the retained visual pair has no such certified consumer here")

    def test_corner_reads_are_not_an_entire_city_footprint(self):
        reads = [(row["x"] + point["dx"], row["y"] + point["dy"], point["byte"])
            for row in self.report["chapters"][0]["cities"] for point in row["cornerReads"]]
        self.assertEqual(len(reads), 768)
        accepted = [(x, y) for x, y, tile in reads if 222 <= tile < 242]
        self.assertEqual(len(accepted), 750)
        self.assertEqual(len(set(accepted)), 750)
        self.assertEqual(Counter(tile for _, _, tile in reads if not 222 <= tile < 242), {212: 4, 213: 4, 214: 5, 215: 5})
        self.assertTrue(all(not row["sameMdlBytes"] for row in self.report["cornerPairs"]))
        self.assertEqual([(row["c01DiffersFromCff"], row["c01EqualsCff"]) for row in self.report["cornerPairs"]],
                         [(tile, tile + 10) for tile in range(222, 232)])

    def test_interior_complete_occurrences_not_just_selected_examples(self):
        rows = self.report["interiorObservations"]
        self.assertEqual([(r["byte"], r["mapCount"], r["typeNibble"]) for r in rows], [(254, 84, 0), (255, 84, 0)])
        self.assertTrue(all(r["allMapOccurrencesEqualThesePositions"] for r in rows))
        self.assertEqual(json.loads(json.dumps(self.report))["interiorObservations"][0]["offsets"], [[0, -1], [-1, 0], [1, 0], [0, 1]])

    def test_interior_catalog_matches_complete_native_position_sets_but_grants_no_placement(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        references = [item for item in catalog["items"] if item["itemId"].startswith("city-interior-")]
        rows = self.report["interiorObservations"]
        self.assertEqual([item["tile"] for item in references], [row["byte"] for row in rows])
        self.assertEqual(rows[1]["offsets"], [(-1, -1), (1, -1), (-1, 1), (1, 1)])
        for item, row in zip(references, rows):
            self.assertTrue(row["allMapOccurrencesEqualThesePositions"])
            self.assertEqual(row["mapCount"], 84)
            self.assertEqual((item["category"], item["support"], item["geographyEffect"]),
                             ("city", "reference-only", "unresolved"))
            self.assertEqual(item["definitionRef"], f"tile-{item['tile']}")
            self.assertEqual(item["source"]["offset"], item["tile"] * 128)
            self.assertEqual(item["anchor"], [0, 0])
            self.assertEqual(item["footprint"], [[0, 0]])

    def test_gate_caps_cover_all_five_vertical_centers_without_a_fixed_two_cell_offset(self):
        rows = self.report["gateCapObservations"]
        self.assertEqual([(r["slot"], r["x"], r["y"], r["dy"]) for r in rows],
                         [(59, 202, 99, -2), (68, 159, 101, -3), (70, 130, 103, -2),
                          (72, 200, 104, -2), (94, 64, 130, -2)])
        self.assertTrue(all(r["byte"] == 251 and r["typeNibble"] == 3 and r["centerByte"] == 211 for r in rows))
        self.assertEqual([r["columnBytes"] for r in rows],
                         [[251, 230, 211], [251, 230, 230, 211], [251, 230, 211], [251, 230, 211], [251, 230, 211]])
        layout = audit.rle_decode(self.inputs["MMAP.MAP"])
        self.assertEqual([(i % 384, i // 384) for i, tile in enumerate(layout) if tile == 251],
                         [(r["x"], r["y"]) for r in rows])
        self.assertEqual(next(r["mapCount"] for r in self.report["atoms"] if r["byte"] == 251), 5)
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        item = next(r for r in catalog["items"] if r["itemId"] == "city-gate-cap-251-v1")
        self.assertEqual((item["tile"], item["definitionRef"], item["category"], item["support"], item["geographyEffect"]),
                         (251, "tile-251", "city", "reference-only", "unresolved"))
        self.assertEqual(item["source"]["offset"], 32128)
        self.assertEqual(item["footprint"], [[0, 0]], "the card does not materialize a gate or its variable-length stem")

    def test_three_cell_edges_cover_all_middle_bytes_and_match_readonly_catalog_recipes(self):
        rows = self.report["frameEdgeObservations"]
        self.assertEqual([(r["direction"], r["middleByte"], r["mapCount"]) for r in rows],
                         [("north", 244, 60), ("south", 245, 67), ("west", 242, 58), ("east", 243, 45)])
        layout = audit.rle_decode(self.inputs["MMAP.MAP"])
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        for row in rows:
            item = next(r for r in catalog["components"] if r["itemId"] == f"city-edge-{row['direction']}-3-v1")
            self.assertEqual(item["tiles"], row["tiles"])
            self.assertEqual((item["category"], item["support"], item["geographyEffect"]), ("city", "reference-only", "unresolved"))
            self.assertEqual(item["source"]["occurrences"], row["mapCount"])
            self.assertEqual(item["source"]["firstWitness"], [row["occurrences"][0]["x"], row["occurrences"][0]["y"]])
            self.assertEqual(len(row["occurrences"]), row["mapCount"])
            dx, dy, middle = row["tiles"][1]
            self.assertEqual([(p["y"] + dy) * 384 + p["x"] + dx for p in row["occurrences"]],
                             [i for i, tile in enumerate(layout) if tile == middle])
            for point in row["occurrences"]:
                city = self.report["chapters"][0]["cities"][point["slot"]]
                self.assertEqual((city["x"], city["y"]), (point["x"] + row["centerOffset"][0], point["y"] + row["centerOffset"][1]))
                self.assertEqual(city["centerByte"], 205)
                self.assertIn(city["typeNibble"], (1, 2, 4))
        self.assertEqual([sorted({p["typeNibble"] for p in r["occurrences"]}) for r in rows],
                         [[1, 2, 4], [1, 2, 4], [1, 2, 4], [1, 2]])

    def test_adjacent_bytes_are_observations_not_extra_city_nodes(self):
        rows = self.report["adjacentObservations"]
        self.assertEqual([(r["byte"], r["mapCount"]) for r in rows],
                         list(zip(range(212, 222), [4, 4, 5, 5, 102, 95, 104, 117, 37, 35])))
        self.assertTrue(all(r["nodeNeighborhoodMatchCount"] == r["mapCount"] for r in rows))
        for row in rows:
            self.assertTrue(all((r["dx"], r["dy"]) != (0, 0) for r in row["relativeCounts"]))
        self.assertEqual(rows[0]["relativeCounts"], [{"typeNibble": 3, "dx": 0, "dy": -1, "count": 4}])
        self.assertEqual(rows[-1]["relativeCounts"], [
            {"typeNibble": 0, "dx": -2, "dy": 0, "count": 17},
            {"typeNibble": 0, "dx": 2, "dy": 0, "count": 18}])

    def test_boundary_parts_cover_exact_original_cells_and_node_offsets(self):
        rows = self.report["boundaryPartObservations"]
        expected = {212: (4, {(0, -1)}, {3}, {208}), 213: (4, {(0, 1)}, {3}, {208}),
            214: (5, {(-1, 0)}, {3}, {211}), 215: (5, {(1, 0)}, {3}, {211}),
            216: (102, {(0, -1)}, {1, 2, 4}, {205}), 217: (95, {(0, 1)}, {1, 2, 4}, {205}),
            218: (104, {(-1, 0)}, {1, 2, 4}, {205}), 219: (117, {(1, 0)}, {1, 2, 4}, {205}),
            220: (37, {(0, -2), (0, 2)}, {0}, {205}), 221: (35, {(-2, 0), (2, 0)}, {0}, {205}),
            246: (45, {(2, -1), (2, 0), (2, 1)}, {0}, {205}),
            247: (45, {(-1, 2), (0, 2), (1, 2)}, {0}, {205})}
        self.assertEqual([row["byte"] for row in rows], list(expected))
        layout = audit.rle_decode(self.inputs["MMAP.MAP"])
        for row in rows:
            count, offsets, kinds, centers = expected[row["byte"]]
            points = row["occurrences"]
            self.assertEqual(row["mapCount"], count)
            self.assertEqual(len(points), count)
            self.assertEqual([p["y"] * 384 + p["x"] for p in points],
                             [i for i, tile in enumerate(layout) if tile == row["byte"]])
            self.assertEqual({(p["dx"], p["dy"]) for p in points}, offsets)
            self.assertEqual({p["typeNibble"] for p in points}, kinds)
            self.assertEqual({p["centerByte"] for p in points}, centers)
            for p in points:
                city = self.report["chapters"][0]["cities"][p["slot"]]
                self.assertEqual((p["x"] - city["x"], p["y"] - city["y"]), (p["dx"], p["dy"]))
                self.assertEqual(city["typeNibble"], p["typeNibble"])
        self.assertEqual(json.loads(json.dumps(rows)), rows)

    def test_boundary_catalog_uses_original_atoms_without_materializing_nodes(self):
        catalog = json.loads((audit.ROOT / "editor-ui/src/mapspritecatalog.json").read_text(encoding="utf-8"))
        items = [item for item in catalog["items"] if item["itemId"].startswith("city-boundary-")]
        rows = self.report["boundaryPartObservations"][:10]
        self.assertEqual([item["tile"] for item in items], [row["byte"] for row in rows])
        self.assertEqual(sum(row["mapCount"] for row in rows), 508)
        for item in items:
            self.assertEqual((item["category"], item["support"], item["geographyEffect"]), ("city", "reference-only", "unresolved"))
            self.assertEqual(item["definitionRef"], f"tile-{item['tile']}")
            self.assertEqual(item["source"]["offset"], item["tile"] * 128)
            self.assertEqual(item["anchor"], [0, 0])
            self.assertEqual(item["footprint"], [[0, 0]])
            self.assertNotIn("geographyMask", item)
            self.assertNotIn("authorWaterClass", item)

    def test_large_city_middle_edges_are_not_always_wall_or_always_gate(self):
        rows = {row["byte"]: row["occurrences"] for row in self.report["boundaryPartObservations"]}
        self.assertEqual(Counter((p["dx"], p["dy"]) for p in rows[246]), {(2, -1): 21, (2, 0): 3, (2, 1): 21})
        self.assertEqual(Counter((p["dx"], p["dy"]) for p in rows[247]), {(-1, 2): 21, (0, 2): 3, (1, 2): 21})
        for wall, gate, offset in ((246, 221, (2, 0)), (247, 220, (0, 2))):
            wall_slots = {p["slot"] for p in rows[wall] if (p["dx"], p["dy"]) == offset}
            gate_slots = {p["slot"] for p in rows[gate] if (p["dx"], p["dy"]) == offset}
            self.assertEqual((len(wall_slots), len(gate_slots)), (3, 18))
            self.assertFalse(wall_slots & gate_slots)
            self.assertEqual(wall_slots | gate_slots, {c["slot"] for c in self.report["chapters"][0]["cities"] if c["typeNibble"] == 0})

    def test_wall_end_neighbors_are_literal_and_do_not_wrap_at_map_boundary(self):
        rows = self.report["wallEndObservations"]
        layout = audit.rle_decode(self.inputs["MMAP.MAP"])
        self.assertEqual([(p["x"], p["y"]) for p in rows],
                         [(i % 384, i // 384) for i, tile in enumerate(layout) if tile in (252, 253)])
        self.assertEqual(Counter(p["byte"] for p in rows), {252: 22, 253: 1})
        self.assertEqual(rows[0], {"byte": 252, "x": 191, "y": 0,
                         "neighbors": {"west": 231, "east": 29, "north": None, "south": 29}})
        row = next(p for p in rows if p["byte"] == 253)
        self.assertEqual(row, {"byte": 253, "x": 139, "y": 18,
                         "neighbors": {"west": 231, "east": 231, "north": 89, "south": 110}})
        self.assertEqual({p["neighbors"]["west"] for p in rows if p["byte"] == 252}, {222, 231, 248})
        self.assertEqual({p["neighbors"]["north"] for p in rows if p["byte"] == 252}, {None, 222, 230})
        for p in rows:
            for key, dx, dy in (("west", -1, 0), ("east", 1, 0), ("north", 0, -1), ("south", 0, 1)):
                x, y = p["x"] + dx, p["y"] + dy
                expected = layout[y * 384 + x] if 0 <= x < 384 and 0 <= y < 256 else None
                self.assertEqual(p["neighbors"][key], expected)

    def test_modified_raw_inputs_fail_instead_of_certifying_a_new_rule(self):
        for name in self.inputs:
            with self.subTest(source=name):
                changed = dict(self.inputs)
                data = bytearray(changed[name]); data[-1] ^= 1; changed[name] = bytes(data)
                with self.assertRaisesRegex(ValueError, "mismatch"):
                    audit.inspect_city_sources(changed)

    def test_round_boundary_and_existing_directory_before_any_source_read(self):
        with tempfile.TemporaryDirectory(prefix="dragon-city-sprite-test-") as folder:
            root = Path(folder)
            existing = root / ".dragon-analysis/sprite-city-sources-existing"
            existing.mkdir(parents=True)
            marker = existing / "keep.txt"; marker.write_text("keep", encoding="utf-8")
            with patch.object(audit, "ROOT", root), patch.object(Path, "read_bytes", side_effect=AssertionError("must not read")):
                with self.assertRaises(FileExistsError):
                    audit.main(["existing"])
                for invalid in ("../escape", "", "x" * 49):
                    with redirect_stderr(StringIO()), self.assertRaises(SystemExit):
                        audit.main([invalid])
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")
            self.assertEqual(list((root / ".dragon-analysis").iterdir()), [existing])

    def test_failed_inspection_creates_no_output(self):
        with tempfile.TemporaryDirectory(prefix="dragon-city-sprite-test-") as folder:
            root = Path(folder)
            with patch.object(audit, "ROOT", root), patch.object(Path, "read_bytes", return_value=b"bad"):
                with self.assertRaisesRegex(ValueError, "fixed source SHA mismatch"):
                    audit.main(["rejected"])
            self.assertEqual(list(root.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
