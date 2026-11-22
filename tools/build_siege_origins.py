"""Rebuild/check the original-city siege picker catalog; no save data."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
scenario = (root.parent / '原版/SINARIO.DAT').read_bytes()
battle = (root.parent / 'Dragon/BATTLE.MAP').read_bytes()
rows = []
for slot in range(192):
    at = 0x8C0 + slot * 32
    city = scenario[at:at + 32]
    rows.append([city[2:8].decode('big5').strip('　\x00 '), city[0x16] & 15, *battle[2*slot:2*slot+2]])
assert [sum(r[1] == t for r in rows) for t in range(5)] == [21, 72, 86, 9, 4]
text = '// 由 tools/build_siege_origins.py 產生；列序即原版攻城目錄號。\nexport const origins = [\n' + ''.join('  ' + json.dumps(row, ensure_ascii=False) + ',\n' for row in rows) + '];\n'
path = root / 'server/siegeorigins.generated.js'
if '--check' in sys.argv:
    assert path.read_text(encoding='utf-8') == text
else:
    path.write_text(text, encoding='utf-8', newline='\n')
