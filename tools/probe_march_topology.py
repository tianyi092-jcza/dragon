"""Probe KI.EXE's strategic-map topology inputs without inventing graph edges.

Reverse-engineering anchors:
- KI.EXE 0xE4CE treats MMAP.MAP tiles 0xCB..0xD3 as topology origins.
- The current map contains exactly 192 such cells, matching the 192 unique city
  coordinates across the combined 20 scenarios.
- KI.EXE 0xE961 classifies connectable map tiles in 0xB8..0xDD and returns a
  compact class used while tracing each road polyline.
- KI.EXE 0xE81C..0xE95F probes orthogonal and diagonal neighbours, so this tool
  deliberately does not reduce the original geometry to a guessed four-neighbour
  graph.

This first-stage probe outputs evidence and local candidates only. It does not
claim that a neighbouring classified tile is a completed topology edge.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
MAP_PATH = WEB / "mmap_map.bin"
DATA_PATH = WEB / "data.json"
OUT_JSON = WEB / "road_graph_probe.json"
OUT_GRAPH = WEB / "road_graph.json"
OUT_IMAGE = ROOT / "docs" / "march-topology-probe.png"

WIDTH = 384
HEIGHT = 256
ORIGIN_MIN = 0xCB
ORIGIN_MAX_EXCLUSIVE = 0xD4
CONNECTABLE_MIN = 0xB8
CONNECTABLE_MAX = 0xDD

# KI.EXE 0xE899..0xE915 probe order after a traced point.
DIRECTIONS = (
    ("west", -1, 0),
    ("east", 1, 0),
    ("north", 0, -1),
    ("south", 0, 1),
    ("northwest", -1, -1),
    ("northeast", 1, -1),
    ("southwest", -1, 1),
    ("southeast", 1, 1),
)
SEED_DIRECTIONS = DIRECTIONS[:4]
DIRECTION_INDEX = {
    direction: index for index, (direction, _dx, _dy) in enumerate(DIRECTIONS)
}
OPPOSITE_DIRECTION = {
    "west": "east",
    "east": "west",
    "north": "south",
    "south": "north",
}


def classify_connectable(tile: int) -> int | None:
    """Replicate KI.EXE 0xE961's tile classification result."""
    if not CONNECTABLE_MIN <= tile <= CONNECTABLE_MAX:
        return None
    kind = 1
    if tile >= 0xBA:
        kind = 0
        if tile >= 0xCB:
            kind = 3
            if tile >= 0xD4:
                kind = 4
    if tile == 0xCA:
        kind |= 0x80
    return kind


def load_inputs() -> tuple[bytes, dict]:
    try:
        map_bytes = MAP_PATH.read_bytes()
        data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot load topology probe inputs: {exc}") from exc
    if len(map_bytes) != WIDTH * HEIGHT:
        raise SystemExit(
            f"{MAP_PATH} has {len(map_bytes)} bytes; expected {WIDTH * HEIGHT}"
        )
    return map_bytes, data


def unique_cities(data: dict) -> dict[tuple[int, int], dict]:
    result: dict[tuple[int, int], dict] = {}
    for scenario in data["scenarios"]:
        for city in scenario["cities"]:
            key = (city["x"], city["y"])
            existing = result.get(key)
            if existing is None:
                result[key] = {
                    "x": city["x"],
                    "y": city["y"],
                    "names": [city["name"]],
                }
            elif city["name"] not in existing["names"]:
                existing["names"].append(city["name"])
    return result


def map_tile(map_bytes: bytes, x: int, y: int) -> int | None:
    if x < 0 or y < 0 or x >= WIDTH or y >= HEIGHT:
        return None
    return map_bytes[y * WIDTH + x]


def classified_neighbours(map_bytes: bytes, x: int, y: int) -> list[dict]:
    neighbours = []
    for order, (direction, dx, dy) in enumerate(DIRECTIONS):
        neighbour_tile = map_tile(map_bytes, x + dx, y + dy)
        if neighbour_tile is None:
            continue
        kind = classify_connectable(neighbour_tile)
        if kind is not None:
            neighbours.append(
                {
                    "probe_order": order,
                    "direction": direction,
                    "x": x + dx,
                    "y": y + dy,
                    "tile": neighbour_tile,
                    "class": kind,
                }
            )
    return neighbours


def seed_candidates(map_bytes: bytes, x: int, y: int) -> list[dict]:
    """Replicate 0xE57F's cardinal one-cell, then two-cell fallback probes."""
    candidates = []
    for direction, dx, dy in SEED_DIRECTIONS:
        for distance in (1, 2):
            candidate_tile = map_tile(map_bytes, x + dx * distance, y + dy * distance)
            if candidate_tile is None:
                break
            if CONNECTABLE_MIN <= candidate_tile <= CONNECTABLE_MAX:
                candidates.append(
                    {
                        "direction": direction,
                        "distance": distance,
                        "x": x + dx * distance,
                        "y": y + dy * distance,
                        "tile": candidate_tile,
                        "class": classify_connectable(candidate_tile),
                    }
                )
                break
    return candidates


def origin_records(map_bytes: bytes, cities: dict[tuple[int, int], dict]) -> list[dict]:
    records = []
    for index, tile in enumerate(map_bytes):
        if not ORIGIN_MIN <= tile < ORIGIN_MAX_EXCLUSIVE:
            continue
        x = index % WIDTH
        y = index // WIDTH
        city = cities.get((x, y))
        records.append(
            {
                "id": len(records),
                "x": x,
                "y": y,
                "tile": tile,
                "city_name_count": len(city["names"]) if city else 0,
                "seed_candidates": seed_candidates(map_bytes, x, y),
            }
        )
    return records


def trace_seed(map_bytes: bytes, seed: dict) -> dict:
    """Transcribe KI.EXE 0xE81C..0xE992 for one active seed record."""
    x = seed["x"]
    y = seed["y"]
    direction = seed["direction"]
    previous: tuple[int, int] | None = None
    points = []

    tile = map_tile(map_bytes, x, y)
    if tile is None:
        return {"status": "outside-map", "points": []}

    # 0xE81C: a D4..DD seed is emitted with bit 0x40, then the tracer steps
    # once in the cardinal seed direction before ordinary classification.
    if tile >= 0xD4:
        points.append({"x": x, "y": y, "class": 4 | 0x40})
        previous = (x, y)
        _name, dx, dy = DIRECTIONS[DIRECTION_INDEX[direction]]
        x += dx
        y += dy

    seen_states = set()
    guard = WIDTH * HEIGHT
    while guard > 0:
        guard -= 1
        tile = map_tile(map_bytes, x, y)
        if tile is None:
            return {"status": "outside-map", "points": points}
        kind = classify_connectable(tile)
        if kind is None:
            return {
                "status": "unclassified-step",
                "points": points,
                "end": {"x": x, "y": y, "tile": tile},
            }
        points.append({"x": x, "y": y, "class": kind})
        if kind & 7 > 1:
            return {
                "status": "ok",
                "points": points,
                "end": {"x": x, "y": y, "tile": tile, "class": kind},
                "arrival_direction": direction,
                "weight": len(points),
                "bounds": {
                    "min_x": min(point["x"] for point in points),
                    "max_x": max(point["x"] for point in points),
                    "min_y": min(point["y"] for point in points),
                    "max_y": max(point["y"] for point in points),
                },
            }

        state = (x, y, previous)
        if state in seen_states:
            return {"status": "loop", "points": points}
        seen_states.add(state)

        current = (x, y)
        next_step = None
        for next_direction, dx, dy in DIRECTIONS:
            nx = x + dx
            ny = y + dy
            if previous == (nx, ny):
                continue
            next_tile = map_tile(map_bytes, nx, ny)
            if next_tile is not None and classify_connectable(next_tile) is not None:
                next_step = (next_direction, nx, ny)
                break
        if next_step is None:
            return {"status": "dead-end", "points": points}
        direction, x, y = next_step
        previous = current

    return {"status": "guard-exhausted", "points": points}


def trace_edges(map_bytes: bytes, origins: list[dict]) -> tuple[list[dict], list[dict]]:
    """Transcribe E717/E77D duplicate suppression around the E81C tracer."""
    marker_owner: dict[tuple[int, int], int] = {}
    records: dict[tuple[int, str], dict] = {}
    for origin in origins:
        for seed in origin["seed_candidates"]:
            marker_owner[(seed["x"], seed["y"])] = origin["id"]
            records[(origin["id"], seed["direction"])] = {**seed, "active": True}

    edges = []
    diagnostics = []
    for origin in origins:
        for direction, _dx, _dy in SEED_DIRECTIONS:
            record = records.get((origin["id"], direction))
            if record is None or not record["active"]:
                continue
            traced = trace_seed(map_bytes, record)
            if traced["status"] != "ok":
                diagnostics.append(
                    {
                        "origin": origin["id"],
                        "direction": direction,
                        "status": traced["status"],
                        "point_count": len(traced["points"]),
                    }
                )
                continue

            end = traced["end"]
            destination = marker_owner.get((end["x"], end["y"]))
            reciprocal_direction = OPPOSITE_DIRECTION.get(traced["arrival_direction"])
            reciprocal = (
                records.get((destination, reciprocal_direction))
                if destination is not None and reciprocal_direction is not None
                else None
            )
            reciprocal_matches = bool(
                reciprocal
                and reciprocal["x"] == end["x"]
                and reciprocal["y"] == end["y"]
            )
            if reciprocal_matches and reciprocal is not None:
                reciprocal["active"] = False
            else:
                diagnostics.append(
                    {
                        "origin": origin["id"],
                        "direction": direction,
                        "status": "missing-reciprocal",
                        "destination": destination,
                        "arrival_direction": traced["arrival_direction"],
                        "end": end,
                    }
                )

            edges.append(
                {
                    "id": len(edges),
                    "source": origin["id"],
                    "target": destination,
                    "seed_direction": direction,
                    "arrival_direction": traced["arrival_direction"],
                    "weight": traced["weight"],
                    "bounds": traced["bounds"],
                    "points": traced["points"],
                    "reciprocal_suppressed": reciprocal_matches,
                }
            )
    return edges, diagnostics


def candidate_records(map_bytes: bytes) -> list[dict]:
    records = []
    for index, tile in enumerate(map_bytes):
        kind = classify_connectable(tile)
        if kind is None:
            continue
        x = index % WIDTH
        y = index // WIDTH
        neighbours = classified_neighbours(map_bytes, x, y)
        records.append(
            {
                "x": x,
                "y": y,
                "tile": tile,
                "class": kind,
                "neighbour_mask": sum(1 << item["probe_order"] for item in neighbours),
            }
        )
    return records


def render_probe(map_bytes: bytes, origins: list[dict]) -> None:
    palette = {
        None: (20, 24, 24, 255),
        0: (106, 92, 70, 255),
        1: (194, 158, 86, 255),
        3: (220, 70, 70, 255),
        4: (80, 150, 220, 255),
        0x80: (120, 200, 170, 255),
    }
    image = Image.new("RGBA", (WIDTH, HEIGHT), palette[None])
    pixels = image.load()
    if pixels is None:
        raise RuntimeError("Pillow did not expose writable pixel access")
    for y in range(HEIGHT):
        for x in range(WIDTH):
            kind = classify_connectable(map_bytes[y * WIDTH + x])
            pixels[x, y] = palette.get(kind, (180, 180, 180, 255))

    image = image.resize((WIDTH * 3, HEIGHT * 3), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(image)
    for origin in origins:
        x = origin["x"] * 3 + 1
        y = origin["y"] * 3 + 1
        draw.rectangle((x - 2, y - 2, x + 2, y + 2), outline="white", fill="red")
    OUT_IMAGE.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT_IMAGE)


def graph_statistics(origins: list[dict], edges: list[dict]) -> dict:
    adjacency = [[] for _origin in origins]
    for edge in edges:
        source = edge["source"]
        target = edge["target"]
        if target is None:
            continue
        adjacency[source].append(target)
        adjacency[target].append(source)

    component_sizes = []
    seen = set()
    for start in range(len(origins)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        size = 0
        while stack:
            node = stack.pop()
            size += 1
            for neighbour in adjacency[node]:
                if neighbour not in seen:
                    seen.add(neighbour)
                    stack.append(neighbour)
        component_sizes.append(size)

    degree_counts = Counter(len(neighbours) for neighbours in adjacency)
    return {
        "component_count": len(component_sizes),
        "component_sizes": sorted(component_sizes, reverse=True),
        "degree_counts": {
            str(degree): count for degree, count in sorted(degree_counts.items())
        },
    }


def runtime_graph(origins: list[dict], edges: list[dict]) -> dict:
    """Build the compact, validated graph consumed by Web shadow routing."""
    return {
        "version": 1,
        "width": WIDTH,
        "height": HEIGHT,
        "nodes": [
            {"id": origin["id"], "x": origin["x"], "y": origin["y"]}
            for origin in origins
        ],
        "edges": [
            {
                "id": edge["id"],
                "source": edge["source"],
                "target": edge["target"],
                "weight": edge["weight"],
                "points": [
                    {"x": point["x"], "y": point["y"]} for point in edge["points"]
                ],
            }
            for edge in edges
        ],
    }


def road_cost_comparison(map_bytes: bytes) -> dict:
    try:
        road_cost = (WEB / "road_cost.bin").read_bytes()
    except OSError as exc:
        raise SystemExit(f"cannot load road_cost comparison input: {exc}") from exc
    if len(road_cost) != WIDTH * HEIGHT:
        raise SystemExit(
            f"road_cost.bin has {len(road_cost)} bytes; expected {WIDTH * HEIGHT}"
        )
    classified = {
        index
        for index, tile in enumerate(map_bytes)
        if classify_connectable(tile) is not None
    }
    legacy_road = {index for index, value in enumerate(road_cost) if value}
    return {
        "classified_tile_count": len(classified),
        "legacy_road_cost_tile_count": len(legacy_road),
        "overlap_count": len(classified & legacy_road),
        "classified_only_count": len(classified - legacy_road),
        "legacy_only_count": len(legacy_road - classified),
    }


def main() -> None:
    map_bytes, data = load_inputs()
    cities = unique_cities(data)
    origins = origin_records(map_bytes, cities)
    candidates = candidate_records(map_bytes)
    edges, trace_diagnostics = trace_edges(map_bytes, origins)
    origin_coords = {(node["x"], node["y"]) for node in origins}
    city_coords = set(cities)
    if len(origins) != 192 or len(city_coords) != 192 or origin_coords != city_coords:
        raise SystemExit(
            "topology-origin invariant failed: expected 192 origins matching 192 cities"
        )

    tile_counts = Counter(map_bytes)
    class_counts = Counter(
        kind for tile in map_bytes if (kind := classify_connectable(tile)) is not None
    )
    neighbour_counts = Counter()
    for candidate in candidates:
        mask = candidate["neighbour_mask"]
        for order, (direction, _dx, _dy) in enumerate(DIRECTIONS):
            if mask & (1 << order):
                neighbour_counts[direction] += 1
    seed_counts = Counter(
        f"{candidate['direction']}:{candidate['distance']}"
        for origin in origins
        for candidate in origin["seed_candidates"]
    )

    output = {
        "evidence": {
            "map_width": WIDTH,
            "map_height": HEIGHT,
            "origin_tile_range": [ORIGIN_MIN, ORIGIN_MAX_EXCLUSIVE - 1],
            "connectable_tile_range": [CONNECTABLE_MIN, CONNECTABLE_MAX],
            "origin_count": len(origins),
            "unique_city_coordinate_count": len(city_coords),
            "origin_coordinates_equal_city_coordinates": origin_coords == city_coords,
            "origin_without_city": [
                list(point) for point in sorted(origin_coords - city_coords)
            ],
            "city_without_origin": [
                list(point) for point in sorted(city_coords - origin_coords)
            ],
            "origin_tile_counts": {
                str(tile): tile_counts[tile]
                for tile in range(ORIGIN_MIN, ORIGIN_MAX_EXCLUSIVE)
                if tile_counts[tile]
            },
            "connectable_class_counts": {
                str(kind): count for kind, count in sorted(class_counts.items())
            },
            "classified_candidate_neighbour_counts": dict(
                sorted(neighbour_counts.items())
            ),
            "origin_seed_candidate_counts": dict(sorted(seed_counts.items())),
            "legacy_road_cost_comparison": road_cost_comparison(map_bytes),
            "traced_edge_count": len(edges),
            "trace_diagnostic_count": len(trace_diagnostics),
            "edge_weight": {
                "min": min((edge["weight"] for edge in edges), default=0),
                "max": max((edge["weight"] for edge in edges), default=0),
                "total": sum(edge["weight"] for edge in edges),
            },
            "traced_graph": graph_statistics(origins, edges),
        },
        "origins": origins,
        "candidates": candidates,
        "traced_edges": edges,
        "trace_diagnostics": trace_diagnostics,
    }

    if trace_diagnostics or len(edges) != 254:
        raise SystemExit(
            f"traced graph invariant failed: edges={len(edges)}, "
            f"diagnostics={len(trace_diagnostics)}"
        )
    if any(edge["target"] is None for edge in edges):
        raise SystemExit("traced graph contains an unresolved target")
    graph_stats = output["evidence"]["traced_graph"]
    if graph_stats["component_count"] != 1 or graph_stats["component_sizes"] != [192]:
        raise SystemExit(f"traced graph is not fully connected: {graph_stats}")

    OUT_JSON.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    OUT_GRAPH.write_text(
        json.dumps(runtime_graph(origins, edges), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    render_probe(map_bytes, origins)

    evidence = output["evidence"]
    print(
        f"origins={evidence['origin_count']} cities={evidence['unique_city_coordinate_count']} "
        f"exact={evidence['origin_coordinates_equal_city_coordinates']}"
    )
    print("origin tiles:", evidence["origin_tile_counts"])
    print("connectable classes:", evidence["connectable_class_counts"])
    print(f"probe -> {OUT_JSON}")
    print(f"graph -> {OUT_GRAPH}")
    print(f"image -> {OUT_IMAGE}")


if __name__ == "__main__":
    main()
