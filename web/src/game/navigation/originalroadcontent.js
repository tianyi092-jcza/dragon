// Staged Web v2 asset profile, not KI's response to malformed runtime RAM.
// Record widths/reciprocity: KI E717..E81B, 4A21..4A4E; march notes §§3.6, 3.9.
import { createCheckedOriginalRoadMemory } from "./originalroadmemory.js";

function coordinate(value, limit) {
  if (!Number.isInteger(value) || value < 0 || value >= limit) {
    throw new TypeError("Invalid original road content coordinate");
  }
}

export function validateOriginalRoadContent(graph) {
  // Validates explicit byte costs, four ordered tags, flags/bounds widths,
  // address regions and reciprocal endpoints. Never infer fields from v1.
  createCheckedOriginalRoadMemory(graph);
  if (graph.width !== 384 || graph.height !== 256) {
    throw new TypeError("Invalid original road content dimensions");
  }
  const coordinates = new Set();
  for (const node of graph.nodes) {
    coordinate(node.x, graph.width);
    coordinate(node.y, graph.height);
    coordinates.add(`${node.x},${node.y}`);
  }
  if (coordinates.size !== graph.nodes.length) {
    throw new TypeError("Duplicate original road content coordinates");
  }
  for (const edge of graph.edges) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const point of edge.points) {
      coordinate(point.x, graph.width);
      coordinate(point.y, graph.height);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    // Web asset consistency only; do not rewrite the explicit original bounds.
    if (
      edge.bounds.minX !== minX ||
      edge.bounds.maxX !== maxX ||
      edge.bounds.minY !== minY ||
      edge.bounds.maxY !== maxY
    ) {
      throw new TypeError("Original road content bounds disagree with points");
    }
  }
}
