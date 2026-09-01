import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_save import EVENT_BASE, parse_strategic_events  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


slot = bytearray(0x56C0)
slot[0x30:0x32] = (8).to_bytes(2, "little")
records = {
    0: bytes((2, 0, 1, 2)),
    1: bytes((3, 2, 0, 0xFF)),
    2: bytes((4, 7, 0x34, 0x12)),
    3: bytes((5, 1, 0x78, 0x56)),
    4: bytes((10, 9, 0x2A, 0x01)),
    5: bytes((12, 2, 0x40, 0x08)),
    6: bytes((13, 0, 0x96, 0x01)),
}
for index, record in records.items():
    start = EVENT_BASE + index * 4
    slot[start : start + 4] = record

events, cursor = parse_strategic_events(bytes(slot))
require(cursor == 2, "event cursor decode")
require(events[0] == {"type": 2, "arg0": 0, "arg1": 1, "arg2": 2}, "type2")
require(events[1] == {"type": 3, "arg0": 2, "arg1": 0, "arg2": 0xFF}, "type3")
require(events[2] == {"type": 4, "arg0": 7, "amount": 0x1234}, "type4")
require(
    events[3] == {"type": 5, "report": {"targetIdx": 1, "requested": 0x5678}},
    "type5",
)
require(events[4] == {"type": 10, "arg0": 9, "talkIndex": 0x012A}, "type10")
require(events[5] == {"type": 12, "arg0": 2, "cityPointer": 0x0840}, "type12")
require(events[6] == {"type": 13, "arg0": 0, "talkIndex": 0x0196}, "type13")
require(all(event is None for event in events[7:]), "empty event slots")

print("strategic event SAVE tail OK: 0x52C0 typed 4-byte decode including type10")
