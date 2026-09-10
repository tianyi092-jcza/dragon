"""内存 fixture 验证军团途中目标从 SAVE 字节恢复；不读写真实 SAVE.DAT。"""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

spec = importlib.util.spec_from_file_location(
    "parse_save_target_fixture", ROOT / "tools" / "parse_save.py"
)
assert spec and spec.loader
parse_save = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parse_save)
LEGION_BASE = parse_save.LEGION_BASE
SLOT_SIZE = parse_save.SLOT_SIZE
parse_legions = parse_save.parse_legions

slot = bytearray(SLOT_SIZE)
r = LEGION_BASE + 7 * 64
slot[r] = 0x84
slot[r + 1] = 0
slot[r + 2] = 7
slot[r + 0x03] = 0
slot[r + 0x06] = 200
slot[r + 0x0A] = 4
slot[r + 0x0B] = 1
slot[r + 0x0C : r + 0x0E] = (0x2030).to_bytes(2, "little")
slot[r + 0x0E : r + 0x10] = (0x0810).to_bytes(2, "little")
slot[r + 0x10 : r + 0x12] = (257).to_bytes(2, "little")
slot[r + 0x12 : r + 0x14] = (9).to_bytes(2, "little")
slot[r + 0x14 : r + 0x16] = (0x1234).to_bytes(2, "little")
slot[r + 0x16 : r + 0x18] = (321).to_bytes(2, "little")
slot[r + 0x18 : r + 0x1A] = (45).to_bytes(2, "little")
slot[r + 0x20] = 1
for index in range(6):
    slot[r + 0x29 + index * 4] = 10
    slot[r + 0x2A + index * 4] = (index % 3) + 1

legions, delayed = parse_legions(bytes(slot), city_count=2)
assert delayed == []
assert len(legions) == 1
legion = legions[0]
assert legion["leader"] == 7
assert legion["leader_raw"] == 7
assert legion["roadStride"] == 4
assert legion["roadPointAddress"] == 0x2030
assert legion["roadEdgeOrNode"] == 0x0810
assert legion["targetNode"] == 0x1234
assert legion["target"] == {"idx": 1, "x": 321, "y": 45}
assert isinstance(legion["delegated"], bool) and legion["delegated"]
assert legion["_engagement"] is None

# status bit5/+3 是原版接敌等待字段；二进制无已确认战型位，先恢复pending。
slot[r] |= 0x20
slot[r + 0x03] = 7
slot[r + 0x0B] = 2
slot[r + 0x1E] = 3
legions, _ = parse_legions(bytes(slot), city_count=2)
assert legions[0]["moveDelay"] == 2
assert legions[0]["movePeriod"] == 3
assert legions[0]["leader"] == 7  # +3倒计时不得污染+2主将索引
assert legions[0]["leader_raw"] == 7
assert legions[0]["engagementCountdown"] == 7
assert legions[0]["_engagement"] == {
    "kind": "pending",
    "countdown": 7,
    "target": {"cityIdx": 1, "x": 321, "y": 45},
}

# 无效目标槽不构造 target；bit5仍保留坐标供buildArmies重建类型。
slot[r + 0x20] = 9
legions, _ = parse_legions(bytes(slot), city_count=2)
assert legions[0]["target"] is None
assert legions[0]["targetCity"] == 9
assert legions[0]["targetNode"] == 0x1234
assert legions[0]["_engagement"]["kind"] == "pending"
assert legions[0]["_engagement"]["countdown"] == 7
assert legions[0]["_engagement"]["target"]["cityIdx"] is None
assert legions[0]["_engagement"]["target"]["x"] == 321
assert legions[0]["_engagement"]["target"]["y"] == 45

# 原始字节相位0也必须保留，不拿countdown或默认周期替换。
slot[r + 0x0B] = 0
slot[r + 0x1E] = 0
legions, _ = parse_legions(bytes(slot), city_count=2)
assert legions[0]["moveDelay"] == 0
assert legions[0]["movePeriod"] == 0

print(
    "save target roundtrip OK: target + pending engagement + raw road-poll phase restored in memory"
)
