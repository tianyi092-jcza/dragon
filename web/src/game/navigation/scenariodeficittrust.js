import { nativeFactionAt } from "../nativefactions.js";
import {
  originalBeginDeficitTrust3507,
  originalContinueDeficitTrust3DC9,
  originalFinishDeficitTrust3DFA,
} from "./originaldeficittrust.js";

const missing = (field) => {
  throw new RangeError(
    `Web engineering Uncovered native deficit-trust ${field}`,
  );
};
const own = (record, field) => {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, field))
    missing(field);
  return record[field];
};
const byte = (value, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) missing(field);
  return value;
};
const word = (value, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) missing(field);
  return value;
};

const io = (sc, redraw) => ({
  readTrustByte() {
    return byte(own(sc, "trust"), "trust");
  },
  writeTrustByte(value) {
    sc.trust = byte(value, "trust write");
  },
  readPlayerMonarchIdentity() {
    const pointer = word(
      own(sc, "nativePlayerFactionPointer"),
      "nativePlayerFactionPointer",
    );
    if (pointer % 0x40 || pointer >= 22 * 0x40)
      missing("87FF aligned player faction pointer");
    const faction = nativeFactionAt(sc, pointer >>> 6, "87FF player faction");
    const generalIndex = byte(own(faction, "monarch_idx"), "monarch_idx");
    const general = sc.generals?.[generalIndex];
    if (!general || general.idx !== generalIndex)
      missing(`monarch general ${generalIndex}`);
    return {
      generalIndex,
      portrait: byte(own(general, "portrait"), "monarch portrait"),
      personality: byte(own(general, "talk_idx"), "monarch talk_idx"),
    };
  },
  refreshStrategicDisplay(mask) {
    if (redraw != null) {
      if (typeof redraw !== "function") missing("display callback");
      redraw(byte(mask, "display mask"));
    }
  },
});

export function beginScenarioDeficitTrustEvent(event) {
  if (byte(own(event, "type"), "event type") !== 13) missing("event type 13");
  return originalBeginDeficitTrust3507(event);
}

export function continueScenarioDeficitTrustEvent(sc, state, redraw = null) {
  return originalContinueDeficitTrust3DC9(io(sc, redraw), state);
}

export function finishScenarioDeficitTrustEvent(sc, state, redraw = null) {
  return originalFinishDeficitTrust3DFA(io(sc, redraw), state);
}
