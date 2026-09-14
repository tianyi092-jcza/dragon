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
 const slot = offset / 0x20;
 const city = scenario?.cities?.[slot];
 if (city?.idx !== slot) {
  throw new Error(`Uncovered original road city slot: ${slot}`);
 }
 const owner = city.faction;
 if (owner === null) return 0x18;
 if (!Number.isInteger(owner) || owner < 0 || owner > 0xff) {
  throw new Error(`Uncovered original road city owner: ${slot}`);
 }
 return owner;
}
