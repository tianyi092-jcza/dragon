"""Read-only fixed SINARIO initial-table inventory, not a neutral initializer.

Only five pinned non-save files, no CLI paths/globs, parser imports, padding,
KI execution, writes or runtime grant. Observed constant bytes are NOT defaults.
Run: python -X utf8 -B tools/audit_editor_neutral_initialization.py
"""
import hashlib
import json
import sys
from pathlib import Path

PARENT = Path(__file__).resolve().parents[2]
SOURCES = {
    '上': '6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73',
    '中': 'cf91e4360fa4e9363b5136ba379d58c8b1c8b5b3ca309eca4071b4f7a805ce59',
    '下': '89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb',
    '后': '3e70ad54e3fc3b9d13a25883098d1ccc53218aafd1a7a461b095c1f1fc9812db',
    '原版': '4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87',
}
# Chapter FILE offsets, not DS addresses (state begins at chapter +0x80).
# See re-notes-custom-data and re-data-formats. All physical slots included.
SPANS = (
    ('header', 0, 0x80, 0x80), ('factions', 0x80, 0x680, 64),
    ('diplomacy', 0x680, 0x8C0, 24), ('cities', 0x8C0, 0x20C0, 32),
    ('weather', 0x20C0, 0x22C0, 16), ('legions', 0x22C0, 0x42C0, 64),
    ('generals', 0x42C0, 0x52C0, 32), ('events', 0x52C0, 0x56C0, 4),
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inventory(data, begin, end, width):
    require(0 <= begin < end and width > 0 and (end - begin) % width == 0, 'span')
    observed = data[begin:end]
    count = (end - begin) // width
    records = [observed[i * width:(i + 1) * width] for i in range(count)]
    complete = len(observed) == end - begin
    return {
        'fileBegin': begin, 'fileEndExclusive': end, 'recordBytes': width,
        'expectedBytes': end - begin, 'availableBytes': len(observed),
        'missingBytes': end - begin - len(observed), 'complete': complete,
        'observedSha256': sha(observed),
        'completeRecords': sum(len(row) == width for row in records),
        'nonzeroRecordSlots': [i for i, row in enumerate(records) if any(row)],
        'incompleteRecordSlots': [i for i, row in enumerate(records) if len(row) != width],
        'allObservedBytesZero': not any(observed),
        'completeZeroTable': complete and not any(observed),
    }


def ordinary_inactive_records(chunk):
    rows = []
    for slot in range(127):  # G127 remains separately inventoried, never a free slot.
        record = chunk[0x42C0 + slot * 32:0x42E0 + slot * 32]
        require(len(record) == 32, 'complete general record')
        if record[0] < 0x80:
            rows.append({'slot': slot, 'attr': record[0], 'sha256': sha(record),
                         'nonzeroOffsets': [i for i, value in enumerate(record) if value],
                         'factionByte1C': record[0x1C], 'appearanceByte18': record[0x18]})
    return rows


def selfcheck():
    full = inventory(bytes(8), 0, 8, 4)
    short = inventory(bytes(6), 0, 8, 4)
    missing = inventory(b'', 0, 8, 4)
    require(full['completeZeroTable'] and full['completeRecords'] == 2, 'zero full')
    require(short['allObservedBytesZero'] and not short['completeZeroTable'] and short['incompleteRecordSlots'] == [1], 'no zero padding')
    require(not missing['completeZeroTable'] and missing['missingBytes'] == 8, 'no missing default')
    changed = inventory(b'\0\0\0\0\0\0\1\0', 0, 8, 4)
    require(not changed['completeZeroTable'] and changed['nonzeroRecordSlots'] == [1], 'nonzero is retained')
    require(SPANS[0][1] == 0 and SPANS[-1][2] == 0x56C0 and all(a[2] == b[1] for a, b in zip(SPANS[:-1], SPANS[1:], strict=True)), 'partition')
    return 5


def main():
    require(sys.argv[1:] == [], 'no input/output path arguments permitted')
    checks = selfcheck()
    chapters, inputs = [], {}
    for name, expected in SOURCES.items():
        path = PARENT / name / 'SINARIO.DAT'
        raw = path.read_bytes()
        require(sha(raw) == expected, 'fixed source SHA: ' + name)
        require(len(raw) == (88830 if name == '下' else 88832), 'fixed source length')
        inputs[str(path.relative_to(PARENT)).replace('\\', '/')] = {'bytes': len(raw), 'sha256': sha(raw)}
        for ordinal in range(4):
            chunk = raw[ordinal * 0x56C0:(ordinal + 1) * 0x56C0]
            spans = {label: inventory(chunk, begin, end, width) for label, begin, end, width in SPANS}
            general127 = chunk[0x52A0:0x52C0]
            require(len(general127) == 32, 'G127 completeness')
            hidden = chunk[0x80 + 22 * 64:0x680]
            require(len(hidden) == 128, 'two physical non-normal faction slots')
            chapters.append({'source': name, 'chapter': ordinal, 'availableBytes': len(chunk), 'spans': spans,
                             'inactiveOrdinaryGenerals': ordinary_inactive_records(chunk),
                             'general127Hex': general127.hex(), 'nonNormalFactionSlotsHex': hidden.hex()})
    missing = [{'source': row['source'], 'chapter': row['chapter'], 'table': label, 'missingBytes': span['missingBytes'], 'incompleteRecordSlots': span['incompleteRecordSlots']}
               for row in chapters for label, span in row['spans'].items() if not span['complete']]
    require(missing == [{'source': '下', 'chapter': 3, 'table': 'events', 'missingBytes': 2, 'incompleteRecordSlots': [255]}], 'exact unpadded tail')
    summary = {label: {'completeTables': sum(row['spans'][label]['complete'] for row in chapters),
                       'completeZeroTables': sum(row['spans'][label]['completeZeroTable'] for row in chapters)} for label, *_ in SPANS}
    inactive = [record for row in chapters for record in row['inactiveOrdinaryGenerals']]
    residue = {'inactiveOrdinaryRecords': len(inactive),
               'inactiveNonzeroRecords': sum(bool(record['nonzeroOffsets']) for record in inactive),
               'general127DistinctRecords': len({row['general127Hex'] for row in chapters}),
               'nonNormalFactionDistinctBlocks': len({row['nonNormalFactionSlotsHex'] for row in chapters})}
    print(json.dumps({'scope': 'raw sample inventory only; no neutral defaults, initialization recipe or runtime admission',
                      'inputs': inputs, 'selfChecks': checks, 'chapterCount': len(chapters), 'summary': summary, 'residueSummary': residue,
                      'missing': missing, 'chapters': chapters}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
