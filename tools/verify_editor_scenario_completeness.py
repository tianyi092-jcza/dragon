"""Strict aggregate import tests. Only pinned non-save bytes and owned temp files.
No CLI importer main, Web output, SAVE, native execution or installed mutations.
"""
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import import_builtin_content as importer
import parse_sinario as parser

PARENT = Path(__file__).resolve().parents[2]
OFFICIAL_SHA = '4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87'
LOWER_SHA = '89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb'


class Completeness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.full = (PARENT / '原版/SINARIO.DAT').read_bytes()
        cls.short = (PARENT / '下/SINARIO.DAT').read_bytes()
        if hashlib.sha256(cls.full).hexdigest() != OFFICIAL_SHA or hashlib.sha256(cls.short).hexdigest() != LOWER_SHA:
            raise ValueError('fixed SINARIO SHA mismatch')
        if len(cls.full) != 88832 or len(cls.short) != 88830:
            raise ValueError('fixed SINARIO length mismatch')

    def setUp(self):
        self.owned = tempfile.TemporaryDirectory(prefix='owned-scenario-completeness-')
        self.addCleanup(self.owned.cleanup)
        self.root = Path(self.owned.name)
        # Explicit fixture: the complete official archive is repeated under five
        # synthetic directory labels. This is NOT an original 20-chapter corpus.
        for label in parser.SOURCES:
            folder = self.root / label
            folder.mkdir()
            (folder / 'SINARIO.DAT').write_bytes(self.full)

    def test_complete_archives_preserve_all_parsed_values(self):
        data = parser.read_scenarios(str(self.root))
        self.assertEqual(len(data['scenarios']), 20)
        expected = []
        for label in parser.SOURCES:
            for i in range(4):
                row = parser.parse_scenario(self.full[i * parser.SC_SIZE:(i + 1) * parser.SC_SIZE])
                row['_src'] = label
                row['name'] = parser.PREFIX.get(label, '') + row['name']
                expected.append(row)
        self.assertEqual(data['scenarios'], expected)
        self.assertEqual(data['meta']['x_range'], [min(c['x'] for c in expected[0]['cities']), max(c['x'] for c in expected[0]['cities'])])

    def test_city_table_stops_before_map_object_records(self):
        # KI 89FB..8A07: CX=C0h, SI=0840h, stride20h; state starts at
        # file+80h, so cities end at file20C0h, before map objects.
        for index in range(4):
            with self.subTest(chapter=index):
                chunk = self.full[index * parser.SC_SIZE:(index + 1) * parser.SC_SIZE]
                original = parser.parse_scenario(chunk)
                self.assertEqual(len(original['cities']), 192)
                self.assertEqual([city['raw'] for city in original['cities']], [chunk[0x8C0 + slot * 32:0x8E0 + slot * 32].hex() for slot in range(192)])
                altered = bytearray(chunk)
                # Owned negative only: eight non-city object slices happen to
                # decode as names. They must never become cities 192..199.
                for slot in range(8):
                    offset = 0x20C0 + slot * 32 + 2
                    altered[offset:offset + 6] = b'FAKE  '
                before = bytes(altered)
                parsed = parser.parse_scenario(before)
                self.assertEqual(len(parsed['cities']), 192)
                self.assertEqual(parsed, original)
                self.assertEqual(bytes(altered), before)

    def test_empty_names_reject_instead_of_truncating_fixed_tables(self):
        # Unsupported named projection is not proof of an invalid DOS record.
        # Never silently discard this slot or the remainder of the fixed table.
        for chapter in range(4):
            chunk = self.full[chapter * parser.SC_SIZE:(chapter + 1) * parser.SC_SIZE]
            for table, offset, slots in [('general', parser.OFF_GENERAL, (0, 64, 127)), ('city', parser.OFF_CITY, (0, 96, 191))]:
                for slot in slots:
                    for blank in (b'\0' * 6, b' ' * 6):
                        with self.subTest(chapter=chapter, table=table, slot=slot, blank=blank):
                            altered = bytearray(chunk)
                            start = offset + slot * 32 + 2
                            altered[start:start + 6] = blank
                            before = bytes(altered)
                            with self.assertRaisesRegex(ValueError, f'{table} slot {slot}: empty decoded name'):
                                parser.parse_scenario(before)
                            self.assertEqual(bytes(altered), before)

    def test_empty_name_import_stops_before_output_or_runtime_comparison(self):
        path = self.root / parser.SOURCES[0] / 'SINARIO.DAT'
        for table, offset, slot in [('general', parser.OFF_GENERAL, 64), ('city', parser.OFF_CITY, 96)]:
            with self.subTest(table=table):
                altered = bytearray(self.full)
                start = offset + slot * 32 + 2
                altered[start:start + 6] = b'\0' * 6
                path.write_bytes(altered)
                output = self.root / ('empty-name-' + table)
                with patch.object(importer, 'read_scenarios', side_effect=lambda: parser.read_scenarios(str(self.root))), \
                        patch.object(importer, 'read_json', side_effect=AssertionError('partial table reached runtime comparison')), \
                        self.assertRaisesRegex(ValueError, f'{table} slot {slot}: empty decoded name'):
                    importer.import_content(output)
                self.assertFalse(output.exists())
                self.assertEqual(path.read_bytes(), bytes(altered))

    def test_missing_or_extra_bytes_reject_instead_of_padding(self):
        path = self.root / parser.SOURCES[0] / 'SINARIO.DAT'
        for raw in (b'', self.full[:parser.SC_SIZE], self.full[:-1], self.full[:-2], self.full + b'\0'):
            with self.subTest(length=len(raw)):
                path.write_bytes(raw)
                with patch.object(parser, 'parse_scenario', side_effect=AssertionError('incomplete archive reached parser')), self.assertRaisesRegex(SystemExit, 'SINARIO.*expected=88832'):
                    parser.read_scenarios(str(self.root))
                self.assertEqual(path.read_bytes(), raw)

    def test_real_lower_short_tail_is_refused_without_repair(self):
        path = self.root / '下' / 'SINARIO.DAT'
        path.write_bytes(self.short)
        with self.assertRaisesRegex(SystemExit, 'actual=88830'):
            parser.read_scenarios(str(self.root))
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), LOWER_SHA)

    def test_import_stops_before_any_output_or_runtime_comparison(self):
        (self.root / '下' / 'SINARIO.DAT').write_bytes(self.short)
        output = self.root / 'new-output'
        with patch.object(importer, 'read_scenarios', side_effect=lambda: parser.read_scenarios(str(self.root))), \
                patch.object(importer, 'read_json', side_effect=AssertionError('reached runtime comparison before input rejection')), \
                self.assertRaisesRegex(SystemExit, 'actual=88830'):
            importer.import_content(output)
        self.assertFalse(output.exists())

    def test_escaped_source_is_refused_not_silently_omitted(self):
        original_resolve = Path.resolve
        selected = self.root / parser.SOURCES[0] / 'SINARIO.DAT'

        def resolve(path, *args, **kwargs):
            if path == selected:
                return self.root.parent / 'not-opened-outside.bin'
            return original_resolve(path, *args, **kwargs)

        # Simulate a resolved outside target without creating a privileged link.
        with patch.object(Path, 'resolve', resolve), patch('builtins.open', side_effect=AssertionError('must not open outside source')), self.assertRaisesRegex(SystemExit, 'SINARIO source escapes base'):
            parser.read_scenarios(str(self.root))

    def test_existing_output_still_rejected_before_read(self):
        output = self.root / 'existing-output'
        output.mkdir()
        marker = output / 'keep.txt'
        marker.write_bytes(b'owned existing data')
        with patch.object(importer, 'read_scenarios', side_effect=AssertionError('must not read inputs')), self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
            importer.import_content(output)
        self.assertEqual(marker.read_bytes(), b'owned existing data')


if __name__ == '__main__':
    if sys.argv[1:]:
        raise SystemExit('no path or test selection arguments permitted')
    unittest.main(verbosity=2)
