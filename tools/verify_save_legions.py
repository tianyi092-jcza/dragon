"""使用纯内存夹具验证 SAVE 军团槽地址和关键字段；禁止读取正式 SAVE.DAT。"""

slot_size = 0x56C0
legion_base = 0x22C0
slot_count = 4
legion_count = 128
record_size = 64


def make_record(legion_idx, unit_troops, morale=100):
    record = bytearray(record_size)
    record[0] = 0x80
    record[2:4] = legion_idx.to_bytes(2, "little")
    record[4:6] = sum(unit_troops).to_bytes(2, "little")
    record[6] = morale
    for unit_idx, troops in enumerate(unit_troops):
        record[0x29 + unit_idx * 4] = troops
    return record


def install_record(raw, slot_idx, legion_idx, unit_troops, morale=100):
    start = slot_idx * slot_size + legion_base + legion_idx * record_size
    raw[start : start + record_size] = make_record(
        legion_idx,
        unit_troops,
        morale,
    )


raw = bytearray(slot_size * slot_count)
install_record(raw, 0, 0, [10, 20, 30, 40, 50, 60])
install_record(raw, 0, 37, [1, 2, 3, 4, 5, 6], morale=180)
install_record(raw, 1, 127, [25, 25, 25, 25, 25, 25])
install_record(raw, 3, 12, [8, 7, 6, 5, 4, 3])
# 有属性但无兵力/士气的噪声槽不得被识别为活动军团。
noise = legion_base + 5 * record_size
raw[noise] = 0x80

expected_counts = [2, 1, 0, 1]
actual_counts = []
for slot_idx in range(slot_count):
    slot = raw[slot_idx * slot_size : (slot_idx + 1) * slot_size]
    live = []
    for legion_idx in range(legion_count):
        start = legion_base + legion_idx * record_size
        record = slot[start : start + record_size]
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
    actual_counts.append(len(live))

if actual_counts != expected_counts:
    raise SystemExit(f"unexpected live legion counts: {actual_counts}")

print(f"save legions OK: in-memory counts={actual_counts}, base=0x{legion_base:X}")
