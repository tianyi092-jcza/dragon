"""Lossless tactical TALK records; no terminology fixes or invented text.
KI 075B indexes TALK's u16 pointer table; 084A stops at double NUL.
Only the closed tactical selector domain 1AC,1AF..1E2 is exported.
"""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_HASH = "cb0cdba4f1c507243cbc4e636bc3fcf698a4f88fe3a0d784cc579e5548e6fcaf"


def export():
        raw = (ROOT.parent / "Dragon" / "TALK.DAT").read_bytes()
        assert hashlib.sha256(raw).hexdigest() == SOURCE_HASH
        records = {}
        for selector in [0x1AC, *range(0x1AF, 0x1E3)]:
                for personality in range(8):
                        index = 0x196 + (selector - 0x196) * 8 + personality
                        offset = int.from_bytes(
                                raw[index * 2 : index * 2 + 2], "little"
                        )
                        end = raw.index(b"\0\0", offset)
                        lines = (
                                raw[offset:end]
                                .decode("big5", errors="strict")
                                .split("\0")
                        )
                        records[index] = {"offset": offset, "lines": lines}
        output = {"revision": 1, "sourceSha256": SOURCE_HASH, "records": records}
        (ROOT / "web" / "battle_talk.json").write_text(
                json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8",
        )
        print(f"battle_talk.json: {len(records)} original records")


if __name__ == "__main__":
        export()
