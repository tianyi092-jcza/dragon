"""只读验证真实 SAVE.DAT 军团槽地址和关键字段。"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT.parent / "Dragon" / "SAVE.DAT"
slot_size = 0x56C0
legion_base = 0x22C0

try:
    raw = source.read_bytes()
except OSError as error:
    raise SystemExit(f"cannot read legion fixtures: {error}") from error

if len(raw) != slot_size * 4:
    raise SystemExit(f"unexpected SAVE.DAT size: {len(raw)}")

expected_counts = []
for slot_idx in range(4):
    slot = raw[slot_idx * slot_size : (slot_idx + 1) * slot_size]
    live = []
    for legion_idx in range(128):
        start = legion_base + legion_idx * 64
        record = slot[start : start + 64]
        if record[0] < 0x80 or record[0x06] == 0 or record[0x29] == 0:
            continue
        total = int.from_bytes(record[4:6], "little")
        units = [record[0x29 + unit_idx * 4] for unit_idx in range(6)]
        if total != sum(units):
            raise SystemExit(
                f"slot {slot_idx} legion {legion_idx}: total {total} != units {units}"
            )
        if record[2] != legion_idx or record[3] != 0:
            raise SystemExit(
                f"slot {slot_idx} legion {legion_idx}: leader {record[2:4].hex()}"
            )
        live.append((legion_idx, total, record[6]))
    expected_counts.append(len(live))

print(f"save legions OK: counts={expected_counts}, base=0x{legion_base:X}")
