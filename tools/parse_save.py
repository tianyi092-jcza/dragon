"""SAVE.DAT 存档解析器 (2026-08-23 逆向定论, 详见 docs/re-notes-kernel.md)

槽位布局 (槽基址 = i * 0x56C0, 与剧本文件同构!):
  +0x000  0x80B 系统头 (CS:0xCF0 镜像; [0x11]=剧本号0基, [0x3A]=势力数(剧本静态副本,自动槽可能为0))
  +0x040  32B 存档名 (Big5; 全"─"(A1D0×16)=未玩)
  +0x080  0x5240B 主状态块 —— 偏移=剧本文件偏移(DS=文件-0x80), parse_scenario 可直接吃整个槽
  +0x52C0 0x400B 杂项 (语义未逆向)

军团记录 64B @槽+0x22C0 ×128 (内存状态段 DS:0x2240；槽文件前置0x80B头):
  +0x00 状态位图(≥0x80存活; bit2有命令; bit5战斗中)
  +0x01 势力号；+0x02 军团长武将序号 byte（军团槽与武将槽一一对应）
  +0x03 接敌等待倒计时（status bit5时）；普通活动军团实测为0
  +0x04 总兵力；+0x06 士气
  +0x10/+0x12 当前 x/y (word le)
  +0x28+i*4 六单位记录：+1兵力、+2兵种(1..3，4为空)
  +0x08..+0x0F 目标坐标/方向步进包; +0x14..+0x1F 移动残差

注意: [0x3A] 不可靠；[0x11] 作为20章全局章节号优先使用，并用武将姓名/字号区
(+2..+14, 运行时基本不变)校验，头部越界或校验失败时再取20章最小diff(阈值500)。
parse_scenario 依赖的 [0x3A]=势力数与章节静态start/name始终用匹配模板回填。
槽头日期已确认：+0 word低字节=日、+4=月、+6 word=年；有效存档写入 state.save_date。

输出: web/save.json  {slots:[{slot,label,played,scenario_idx,state}]}
"""

import json
import os
import sys
from pathlib import Path

from parse_sinario import N_SCENARIO, SOURCES, parse_scenario

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SAVE_SRC = os.path.join(BASE, "Dragon", "SAVE.DAT")
OUT = os.environ.get(
    "DRAGON_SAVE_JSON",
    os.path.join(os.path.dirname(__file__), "..", ".dragon-runtime", "save.json"),
)
WEB_META_SRC = os.environ.get(
    "DRAGON_SAVE_META",
    os.path.join(
        os.path.dirname(__file__), "..", ".dragon-runtime", "save.webmeta.json"
    ),
)

N_SLOT = 4
SLOT_SIZE = 0x56C0
LEGION_BASE = 0x22C0  # 槽文件偏移；运行时状态段内偏移为0x2240
N_LEGION = 128
LEGION_SIZE = 64
EVENT_BASE = 0x52C0
EVENT_SIZE = 4
EVENT_COUNT = 256


def big16(b: bytes) -> int:
    return int.from_bytes(b, "little")


def parse_legions(slot: bytes, city_count: int = 200) -> tuple[list, list]:
    """128 条军团槽：返回活动军团与0x2977延迟回归队列。"""
    out = []
    delayed_returns = []
    for j in range(N_LEGION):
        r = slot[LEGION_BASE + j * LEGION_SIZE : LEGION_BASE + (j + 1) * LEGION_SIZE]
        delayed_return = r[0] == 0x08 and r[0x03] > 0
        if delayed_return:
            # 0x2977槽的+2是武将索引字节，+3独立为48次调度倒计时。
            lead = r[2]
            delayed_returns.append(
                {
                    "leader": lead if lead < 128 else None,
                    "generalIdx": lead if lead < 128 else None,
                    "faction": r[1],
                    "countdown": r[0x03],
                }
            )
            continue
        # 0x474A：即使存活位已置，士气(+6)或首单位兵力(+0x29)为0时
        # 也不能作为可继续行动的军团；status=8 则是0x2977延迟回归槽。
        if not delayed_return and (r[0] < 0x80 or r[0x06] == 0 or r[0x29] == 0):
            continue
        # 0x291A 以军团槽地址换算武将记录，且君主判定读取 byte [si+2]；
        # +3 被0x2831作为接敌倒计时覆写，因此主将索引只能取+2单字节。
        lead = r[2]
        units = [
            {
                # Web 编成/战术层统一以“人”为单位；军团记录以十人为单位。
                "troops": r[0x29 + unit_idx * 4] * 10,
                "type": r[0x2A + unit_idx * 4],
            }
            for unit_idx in range(6)
        ]
        target_city = r[0x20]
        target_active = r[0x0B] != 0 and target_city < city_count
        pending_engagement = bool(r[0] & 0x20) and 1 <= r[0x03] <= 0x0C
        engagement = None
        if pending_engagement:
            # status bit5/+3只实锤“接敌等待”；现有字段没有已确认的野战/攻城
            # 类型位。+0x20仍是行军目标城，不能把有效城市索引猜成攻城。
            # Web载入后按当前坐标→目标城重建道路下一点，再检查该点敌军/敌城。
            engagement = {
                "kind": "pending",
                "countdown": r[0x03],
                "target": {
                    "cityIdx": target_city if target_city < city_count else None,
                    "x": big16(r[0x16:0x18]),
                    "y": big16(r[0x18:0x1A]),
                },
            }
        out.append(
            {
                "idx": j,
                "slot": j,
                "status": r[0],
                "delegated": bool(r[0] & 0x04),  # 0x4E5C/0x4ED7 委任权威bit
                "faction": r[1],
                "leader": lead if lead < 128 else None,
                "leader_raw": lead,
                "x": big16(r[0x10:0x12]),
                "y": big16(r[0x12:0x14]),
                "troops": big16(r[0x04:0x06]),
                "morale": r[0x06],
                "units": units,
                "returnCountdown": r[0x03] if delayed_return else None,
                "engagementCountdown": r[0x03] if pending_engagement else None,
                "_engagement": engagement,
                "_active": not delayed_return,
                # 0x8CFF原样镜像完整状态段；这些不是进程指针而是E717
                # 道路段内地址，可由Web road_graph的确定布局反解。
                "roadStride": int.from_bytes(r[0x0A:0x0B], "little", signed=True),
                "roadPointAddress": big16(r[0x0C:0x0E]),
                "roadEdgeOrNode": big16(r[0x0E:0x10]),
                "targetNode": big16(r[0x14:0x16]),
                "targetX": big16(r[0x16:0x18]),
                "targetY": big16(r[0x18:0x1A]),
                "targetCity": target_city,
                "target": (
                    {
                        "idx": target_city,
                        "x": big16(r[0x16:0x18]),
                        "y": big16(r[0x18:0x1A]),
                    }
                    if target_active
                    else None
                ),
                "commandState": r[0x23],
                # 正常战略标识：+9=势力 march_marker_style*5，+8=西/东/北/南/驻止帧。
                "marker_base": r[0x09],
                "marker_frame": r[0x08],
                "raw": r.hex(),
            }
        )
    return out, delayed_returns


def parse_strategic_events(slot: bytes) -> tuple[list, int]:
    """SAVE尾部0x400B原版战略事件轮；返回256槽与当前槽游标。"""
    events = []
    for index in range(EVENT_COUNT):
        start = EVENT_BASE + index * EVENT_SIZE
        event_type, arg0, arg1, arg2 = slot[start : start + EVENT_SIZE]
        if event_type == 0:
            events.append(None)
            continue
        word = arg1 | (arg2 << 8)
        if event_type == 1:
            event = {"type": 1, "aggressor": arg0, "defender": arg1}
        elif event_type in (2, 3):
            event = {"type": event_type, "arg0": arg0, "arg1": arg1, "arg2": arg2}
        elif event_type == 4:
            event = {"type": 4, "arg0": arg0, "amount": word}
        elif event_type == 5:
            event = {
                "type": 5,
                "report": {"targetIdx": arg0, "requested": word},
            }
        elif event_type in (6, 7, 8, 9):
            event = {"type": event_type, "arg0": arg0, "arg1": arg1, "arg2": arg2}
        elif event_type == 10:
            event = {"type": 10, "arg0": arg0, "talkIndex": word}
        elif event_type == 11:
            event = {"type": 11, "arg0": arg0, "arg1": arg1, "arg2": arg2}
        elif event_type == 12:
            event = {"type": 12, "arg0": arg0, "cityPointer": word}
        elif event_type == 13:
            event = {"type": 13, "arg0": arg0, "talkIndex": word}
        else:
            # 未知类型也必须保留原始4B，避免读档时静默吞掉证据。
            event = {"type": event_type, "arg0": arg0, "arg1": arg1, "arg2": arg2}
        events.append(event)

    cursor_bytes = big16(slot[0x30:0x32])
    cursor = (
        cursor_bytes // EVENT_SIZE
        if cursor_bytes <= 0x100 and cursor_bytes % 4 == 0
        else 0
    )
    return events, cursor


def load_web_meta() -> dict:
    try:
        payload = json.loads(Path(WEB_META_SRC).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    slots = payload.get("slots")
    return slots if isinstance(slots, dict) else {}


def load_scenario_library(base_root: Path) -> list[bytes]:
    """按 data.json 的 SOURCES 顺序载入20章原始槽，返回全局章节索引表。"""
    scenarios = []
    for source_name in SOURCES:
        path = (base_root / source_name / "SINARIO.DAT").resolve()
        try:
            path.relative_to(base_root)
        except ValueError as error:
            raise SystemExit(f"剧本路径必须位于项目目录内: {path}") from error
        try:
            data = path.read_bytes()
        except OSError as error:
            raise SystemExit(f"无法读取剧本文件: {path}: {error}") from error
        expected = N_SCENARIO * SLOT_SIZE
        if len(data) > expected:
            raise SystemExit(f"剧本文件意外大小 {len(data)}: {path}")
        if len(data) < expected:
            data += b"\x00" * (expected - len(data))
        scenarios.extend(
            data[index * SLOT_SIZE : (index + 1) * SLOT_SIZE]
            for index in range(N_SCENARIO)
        )
    return scenarios


def scenario_name_diff(slot: bytes, scenario: bytes) -> int:
    """比较128名武将的姓名/字号静态字节。"""
    distance = 0
    for general_idx in range(128):
        start = 0x42C0 + general_idx * 32 + 2
        distance += sum(
            a != b
            for a, b in zip(
                slot[start : start + 12], scenario[start : start + 12], strict=True
            )
        )
    return distance


def detect_scenario(slot: bytes, scenarios: list[bytes]) -> int:
    """返回data.json全局章节索引；优先采用SAVE头部章节号并以姓名区校验。"""
    distances = [scenario_name_diff(slot, scenario) for scenario in scenarios]
    header_idx = slot[0x11]
    best_i = min(range(len(distances)), key=distances.__getitem__)
    best_d = distances[best_i]
    if header_idx < len(scenarios) and distances[header_idx] < 500:
        return header_idx
    if best_d >= 500:
        raise ValueError(f"剧本判定失败: 最小姓名diff={best_d}")
    return best_i


def main(argv: list[str] | None = None) -> None:
    src = (argv or sys.argv)[1] if len(argv or sys.argv) > 1 else SAVE_SRC
    allowed_root = Path(BASE).resolve()
    source_path = Path(src).resolve()
    # 默认解析器继续限制项目内文件；测试/本地服务显式注入临时SAVE时允许该路径。
    if "DRAGON_SAVE_DAT" in os.environ:
        configured_source = Path(os.environ["DRAGON_SAVE_DAT"]).resolve()
        if source_path != configured_source:
            raise SystemExit(f"输入路径不匹配 DRAGON_SAVE_DAT: {src}")
    else:
        try:
            source_path.relative_to(allowed_root)
        except ValueError as error:
            raise SystemExit(f"输入路径必须位于项目目录内: {src}") from error
    try:
        d = source_path.read_bytes()
    except OSError as e:
        raise SystemExit(f"无法读取源文件: {e}") from e
    scenario_library = load_scenario_library(allowed_root)
    if len(d) != N_SLOT * SLOT_SIZE:
        raise SystemExit(f"SAVE.DAT 意外大小 {len(d)}")

    slots = []
    web_meta_slots = load_web_meta()
    for i in range(N_SLOT):
        slot = bytearray(d[i * SLOT_SIZE : (i + 1) * SLOT_SIZE])
        scen = detect_scenario(bytes(slot), scenario_library)
        # 槽头势力数不可靠 → 始终用匹配章节静态值回填 (parse_scenario 依赖它)
        slot[0x3A] = scenario_library[scen][0x3A]
        label_raw = bytes(slot[0x40:0x60])
        label = label_raw.decode("big5", errors="replace").rstrip("\x00")
        played = label.strip("─") != ""
        state = parse_scenario(bytes(slot))
        # 槽头前8字节是运行时日历而非SINARIO静态start；存档章节初始年月必须
        # 来自匹配到的章节模板，否则武将appear_months会把存档日期当新起点。
        template_state = parse_scenario(scenario_library[scen])
        state["name"] = template_state["name"]
        state["start"] = template_state["start"]
        state["legions"], state["delayedLegionReturns"] = parse_legions(
            bytes(slot), len(state["cities"])
        )
        state["strategicEventSlots"], state["_strategicEventCursor"] = (
            parse_strategic_events(bytes(slot))
        )
        # 势力attr bit7是活跃权威位；运行时AI以dead筛选，读档必须同步恢复。
        for faction in state["factions"]:
            faction["dead"] = not faction["active"]
        # ★可选#3 (2026-08-24): 槽头前 0x3B 字节 = CS:[0xCF0] 全局块原样镜像
        #   (KI.EXE 存盘例程 0x8CFF: 写 CS:[0xCF0] 0x3B 字节到槽+0；读档 0x8CAE 对称读回)
        #   日期字段: +0 word=[本月天数<<8|当日] / +2 [CF2]子刻度 / +3 [CF3]时刻
        #   / +4 月(1..12) / +5 [CF5]未知 / +6 word=年(AD)
        day_word = big16(bytes(slot[0x00:0x02]))
        date = {
            "day": day_word & 0xFF,
            "month": slot[0x04],
            "year": big16(bytes(slot[0x06:0x08])),
        }
        if (
            played
            and 1 <= date["day"] <= 31
            and 1 <= date["month"] <= 12
            and 1 <= date["year"] <= 1000
        ):
            state["save_date"] = date
            state["save_sub"] = slot[0x02]
            state["save_hour"] = slot[0x03]
        # 存档槽头部≠剧本头部布局, tax/trust 语义不可信:
        # 超出原版范围(税率 0..40)或 FF 时置 None → initPlayer 兜底默认值
        if state["tax"] is None or not (0 <= state["tax"] <= 40):
            state["tax"] = None
        web_meta = web_meta_slots.get(str(i))
        # 不把sidecar规则态写进二进制解析结果：main.loadSave会在buildArmies前按槽叠加，
        # 避免同一overlay分散在Python与JS两处。此处只把webMeta随槽返回。
        entry = {
            "slot": i,
            "label": label,
            "played": played,
            "scenario_idx": scen,
            "state": state,
        }
        if isinstance(web_meta, dict):
            entry["webMeta"] = web_meta
        slots.append(entry)
        print(
            f"槽{i}: 章节索引{scen} played={played} "
            f"军团={len(state['legions'])} 武将={len(state['generals'])}"
        )

    output_path = Path(OUT).resolve()
    if "DRAGON_SAVE_JSON" not in os.environ:
        output_path = allowed_root / output_path.relative_to(allowed_root)
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps({"slots": slots}, ensure_ascii=False), encoding="utf-8"
        )
    except OSError as e:
        raise SystemExit(f"无法写入 {output_path}: {e}") from e
    print(f"OK -> {output_path} ({output_path.stat().st_size} B)")


if __name__ == "__main__":
    main(sys.argv)
