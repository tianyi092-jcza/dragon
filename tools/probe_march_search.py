"""Validate KI.EXE 0x491B/0x4A0F reverse-search first-hop semantics.

The topology builder already emitted ordered cardinal slots and undirected edge
polylines in road_graph_probe.json. This probe reconstructs the tagged slots:
source endpoint = 0x4000, destination endpoint = 0x8000, then transcribes the
search's edge-visited uniform-cost expansion for every ordered node pair.
"""

from __future__ import annotations

import heapq
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "web" / "road_graph_probe.json"
OUTPUT = ROOT / "web" / "road_search_probe.json"
DIRECTIONS = ("west", "east", "north", "south")
OPPOSITE = {
    "west": "east",
    "east": "west",
    "north": "south",
    "south": "north",
}


def load_graph() -> dict:
    try:
        return json.loads(INPUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot load {INPUT}: {exc}") from exc


def build_slots(data: dict) -> list[list[tuple[int, int] | None]]:
    slots: list[list[tuple[int, int] | None]] = [
        [None] * len(DIRECTIONS) for _origin in data["origins"]
    ]
    for edge in data["traced_edges"]:
        source_direction = DIRECTIONS.index(edge["seed_direction"])
        target_direction = DIRECTIONS.index(OPPOSITE[edge["arrival_direction"]])
        source_slot = (edge["id"], 0x4000)
        target_slot = (edge["id"], 0x8000)
        if slots[edge["source"]][source_direction] is not None:
            raise SystemExit(f"duplicate source slot on edge {edge['id']}")
        if slots[edge["target"]][target_direction] is not None:
            raise SystemExit(f"duplicate target slot on edge {edge['id']}")
        slots[edge["source"]][source_direction] = source_slot
        slots[edge["target"]][target_direction] = target_slot
    return slots


def reverse_search(data: dict, slots: list, target: int, current: int) -> dict | None:
    """Transcribe 0x491B mechanically with all city ownership treated as same-faction."""
    if target == current:
        return (
            None  # 0x491B returns CF=1 for start==goal; caller handles arrival first.
        )

    edges = data["traced_edges"]
    visited_edges = bytearray(len(edges))
    sequence = 0
    frontier = [(0, sequence, target, 0, -1)]
    while frontier:
        cost, _order, node, stride, entering_edge = heapq.heappop(frontier)
        if node == current:
            return {
                "stride": stride,
                "edge": entering_edge,
                "cost": cost,
            }

        # 0x49C3..0x49DF: every city node contributes +4 before its edges.
        expanded_cost = cost + 4
        for slot in slots[node]:
            if slot is None:
                continue
            edge_id, tag = slot
            if visited_edges[edge_id]:
                continue
            visited_edges[edge_id] = 1
            edge = edges[edge_id]
            if tag == 0x4000:
                neighbour = edge["target"]
                next_stride = -4
            elif tag == 0x8000:
                neighbour = edge["source"]
                next_stride = 4
            else:
                raise SystemExit(f"unexpected tag {tag:#x}")
            sequence += 1
            heapq.heappush(
                frontier,
                (
                    expanded_cost + edge["weight"],
                    sequence,
                    neighbour,
                    next_stride,
                    edge_id,
                ),
            )
    return None


def independent_distance(data: dict, source: int, target: int) -> int | None:
    adjacency = [[] for _origin in data["origins"]]
    for edge in data["traced_edges"]:
        cost = edge["weight"] + 4
        adjacency[edge["source"]].append((edge["target"], cost))
        adjacency[edge["target"]].append((edge["source"], cost))
    distance = [1 << 30] * len(adjacency)
    distance[source] = 0
    frontier = [(0, source)]
    while frontier:
        cost, node = heapq.heappop(frontier)
        if cost != distance[node]:
            continue
        if node == target:
            return cost
        for neighbour, edge_cost in adjacency[node]:
            candidate = cost + edge_cost
            if candidate < distance[neighbour]:
                distance[neighbour] = candidate
                heapq.heappush(frontier, (candidate, neighbour))
    return None


def forward_endpoint(edge: dict, current: int, stride: int) -> int | None:
    # 0x27A2: +4 terminates at edge+8 (target); -4 at edge+6 (source).
    if stride == 4 and current == edge["source"]:
        return edge["target"]
    if stride == -4 and current == edge["target"]:
        return edge["source"]
    return None


def main() -> None:
    data = load_graph()
    slots = build_slots(data)
    node_count = len(data["origins"])
    pair_count = 0
    distance_mismatches = []
    invalid_first_hops = []
    samples = []

    for current in range(node_count):
        for target in range(node_count):
            if current == target:
                continue
            pair_count += 1
            result = reverse_search(data, slots, target, current)
            if result is None:
                invalid_first_hops.append({"current": current, "target": target})
                continue
            edge = data["traced_edges"][result["edge"]]
            next_node = forward_endpoint(edge, current, result["stride"])
            if next_node is None:
                invalid_first_hops.append(
                    {
                        "current": current,
                        "target": target,
                        "edge": result["edge"],
                        "stride": result["stride"],
                    }
                )
            expected = independent_distance(data, current, target)
            if result["cost"] != expected:
                distance_mismatches.append(
                    {
                        "current": current,
                        "target": target,
                        "actual": result["cost"],
                        "expected": expected,
                    }
                )
            if len(samples) < 12 and (current * 37 + target * 17) % 113 == 0:
                samples.append(
                    {
                        "current": current,
                        "target": target,
                        "first_edge": result["edge"],
                        "stride": result["stride"],
                        "next_node": next_node,
                        "cost": result["cost"],
                    }
                )

    output = {
        "evidence": {
            "node_count": node_count,
            "edge_count": len(data["traced_edges"]),
            "ordered_pair_count": pair_count,
            "distance_mismatch_count": len(distance_mismatches),
            "invalid_first_hop_count": len(invalid_first_hops),
            "slot_counts": {
                str(count): sum(
                    1
                    for node_slots in slots
                    if sum(slot is not None for slot in node_slots) == count
                )
                for count in range(1, 5)
            },
        },
        "samples": samples,
        "distance_mismatches": distance_mismatches[:100],
        "invalid_first_hops": invalid_first_hops[:100],
    }
    if distance_mismatches or invalid_first_hops:
        raise SystemExit(
            f"search validation failed: distance={len(distance_mismatches)}, "
            f"first-hop={len(invalid_first_hops)}"
        )
    if OUTPUT.resolve().parent != (ROOT / "web").resolve():
        raise SystemExit(f"refusing to write outside web directory: {OUTPUT}")
    OUTPUT.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"search OK: {pair_count} ordered pairs, "
        f"distance mismatches=0, invalid first hops=0"
    )
    print(f"probe -> {OUTPUT}")


if __name__ == "__main__":
    main()
