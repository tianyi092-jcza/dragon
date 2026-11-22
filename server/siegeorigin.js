import { origins } from './siegeorigins.generated.js';

const byId = new Map(origins.map(([, type], i) => [`ki-1995:siege:${i}`, type]));
export function siegeMatchesType(id, type) {
  return Number.isInteger(type) && byId.get(id) === type;
}
