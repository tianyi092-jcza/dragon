// Frozen system-owned singleton declaration, not discovered DDL or game purge authority.
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const SYSTEM_BASE_MAP_LAYOUTS = freeze({
  system_base_map: [[0, 'singleton', 'INTEGER', 0, null, 1, 0], [1, 'version', 'INTEGER', 1, null, 0, 0],
    [2, 'digest', 'TEXT', 1, null, 0, 0], [3, 'template_json', 'TEXT', 1, null, 0, 0], [4, 'updated_at', 'TEXT', 1, null, 0, 0]],
});
const DDL = 'CREATE TABLE system_base_map (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version>0), digest TEXT NOT NULL, template_json TEXT NOT NULL, updated_at TEXT NOT NULL)';
export function withSystemBaseMapDefinitions(baseline) {
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  return freeze({
    ...baseline,
    objects: [...baseline.objects, ['table', 'system_base_map', 'system_base_map', DDL]]
      .sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1])),
    fk: { ...baseline.fk, system_base_map: [] },
    indexList: { ...baseline.indexList, system_base_map: [] },
  });
}
