/**
 * Covered D52 reads for 491B: 49C9..49CD reads city +1 at 0841 + node*4.
 * For an aligned city node (8*slot), this is 0841 + 20h*slot, slots 0..191.
 * This is NOT a general D52 RAM image or a fallback for misaligned inputs.
 *
 * Web representation: compile_chapter writes named city.faction to raw +1,
 * mapping explicit null to 18h. Runtime ownership uses the named field; raw
 * is an initial compatibility record and can be stale after capture.
 * Missing fields/slots remain uncovered, not neutral, zero, or "blocked".
 */
export function readOriginalRoadCityOwnerByte(scenario, address) {
 if (!Number.isInteger(address) || address < 0 || address > 0xffff) {
  throw new RangeError("Invalid original road state address");
 }
 const offset = address - 0x841;
 if (offset < 0 || offset % 0x20 !== 0 || offset / 0x20 >= 192) {
  throw new RangeError(`Uncovered original road state byte: ${address}`);
 }
 return readCityOwnerByIndex(scenario, offset / 0x20);
}

/** 28F4 first-read node bridge: BX is a city node (8*slot), so BX*4 is the
 * city-base offset and DI+0x841 is that city's +1 owner byte. Decode the
 * slot with the same u16 wrap/alignment as the legacy byte adapter, then
 * validate identity without the legacy 192-slot cap; ownership itself
 * comes from the indexed reader (dynamic scenario length).
 */
export function roadNodeToCitySlot(scenario, node, instruction = '') {
 const at = instruction ? ` at ${instruction}` : '';
 if (!Number.isInteger(node) || node < 0 || node > 0xffff)
  throw new RangeError(`Invalid road node${at}: ${node}`);
 const address = (((node * 4) & 0xffff) + 0x841) & 0xffff;
 const offset = address - 0x841;
 if (offset < 0 || offset % 0x20 !== 0)
  throw new RangeError(`Uncovered road node bridge${at}: ${node}`);
 const slot = offset / 0x20;
 if (slot >= scenario?.cities?.length || scenario.cities[slot]?.idx !== slot)
  throw new Error(`Uncovered original road city slot: ${slot}${at}`);
 return slot;
}

/** City-base pointer bridge 0x840+slot*0x20 with the same alignment as the
 * legacy adapter, but validated against the live scenario length instead
 * of the legacy 192-slot cap. Identity stays strict: cities[slot].idx must
 * equal slot. All failures stay fail-closed RangeErrors with the pointer
 * and instruction attached.
 */
export function cityAtRoadPointer(scenario, pointer, instruction = '') {
 const at = instruction ? ` at ${instruction}` : '';
 if (!Number.isInteger(pointer) || pointer < 0 || pointer > 0xffff)
  throw new RangeError(`Web engineering Uncovered city pointer ${pointer}${at}`);
 const offset = pointer - 0x840;
 if (offset < 0 || offset % 0x20 !== 0)
  throw new RangeError(`Web engineering Uncovered city pointer ${pointer}${at}`);
 const slot = offset / 0x20;
 if (slot >= (scenario?.cities?.length ?? 0) || scenario.cities[slot]?.idx !== slot)
  throw new RangeError(`Web engineering Uncovered city pointer ${pointer}${at}`);
 return scenario.cities[slot];
}

/** City-node domain bound for road search: live length*8, legacy 0x600
 * (192*8) when the city table is absent. Edge/node kind markers (0x800+)
 * are untouched; identity is enforced where records load.
 */
export function cityNodeBoundOf(scenario) {
 const total = scenario?.cities?.length;
 return total === undefined ? 0x600 : total * 8;
}

/** Indexed owner read for a road node (8*slot): same slot decode and
 * identity as roadNodeToCitySlot, ownership from the indexed reader.
 */
export function readRoadNodeOwner(scenario, context, node, instruction = '') {
 return context.readCityOwner(roadNodeToCitySlot(scenario, node, instruction), instruction);
}

/** Decode one lazily-read legacy C1C slot: FF is an absent reference.
 * Military stops there; other consumers own their skip/stop semantics.
 * No compaction/reordering. Consumers receive null or an index, not a sentinel.
 */
export function readOriginalStrategicNeighbour(city, slot, instruction = '3FD4') {
 if (!Number.isInteger(slot) || slot < 0 || slot >= 4)
  throw new RangeError(`Invalid strategic neighbour slot at ${instruction}`);
 const value = city.strategicNeighbours?.[slot];
 if (!Number.isInteger(value) || value < 0 || value > 255)
  throw new RangeError(`Web engineering Uncovered C1C neighbour at ${instruction}`);
 return value === 255 ? null : value;
}

/** Named city lookup. Identity is not a DS address; ownership remains a byte.
 * Shared by the legacy address adapter and indexed city-rule capabilities.
 * This does not admit a larger Scenario or invent missing ownership fields.
 */
export function readCityOwnerByIndex(scenario, index, instruction = '') {
 const at = instruction ? ` at ${instruction}` : '';
 if (!Number.isSafeInteger(index) || index < 0)
  throw new RangeError(`Invalid city index${at}`);
 const city = scenario?.cities?.[index];
 if (index >= scenario?.cities?.length || city?.idx !== index)
  throw new Error(`Uncovered original road city slot: ${index}${at}`);
 const owner = city.faction;
 if (owner === null) return 0x18;
 if (!Number.isInteger(owner) || owner < 0 || owner > 0xff)
  throw new Error(`Uncovered original road city owner: ${index}${at}`);
 return owner;
}
