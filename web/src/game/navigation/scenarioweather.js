import {
  beginOriginalDisasterAreaEvent34A6,
  beginOriginalDisasterObject34B1,
  continueOriginalDisasterArea237E,
  continueOriginalDisasterObject34B1,
  originalMonthlyWeatherEvents,
} from "./originalweather.js";

const missing = (label) => {
  throw new RangeError(`Web engineering Uncovered native weather ${label}`);
};
const own = (record, field) => {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, field))
    missing(field);
  return record[field];
};
const byte = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) missing(label);
  return value;
};
const word = (value, label) => {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0xffff)
    missing(label);
  return value & 0xffff;
};
const signedWord = (value) => ((value & 0xffff) << 16) >> 16;

function createScenarioAreaIO(sc, rng = null) {
  const cityAt = (index) => {
    const cities = own(sc, "cities");
    if (!Array.isArray(cities) || !Object.hasOwn(cities, index))
      missing(`city ${index}`);
    const city = cities[index];
    if (!city || typeof city !== "object" || Array.isArray(city))
      missing(`city record ${index}`);
    return city;
  };
  const currentBounds = () => {
    const bounds = sc?._disasterBounds ?? own(sc, "weatherCloudBounds");
    if (!bounds || typeof bounds !== "object" || Array.isArray(bounds))
      missing("weather bounds");
    return bounds;
  };
  return {
    readBoundWord(field) {
      return word(own(currentBounds(), field), `weather bound ${field}`);
    },
    readCityByte(index, field) {
      const named = { owner: "faction", disaster: "disaster_event" }[field];
      if (!named) missing(`city byte ${field}`);
      return byte(own(cityAt(index), named), `city ${index} ${named}`);
    },
    readCityWord(index, field) {
      if (field !== "x" && field !== "y") missing(`city word ${field}`);
      return word(own(cityAt(index), field), `city ${index} ${field}`);
    },
    writeCityByte(index, field, value) {
      if (field !== "disaster") missing(`city write ${field}`);
      cityAt(index).disaster_event = byte(value, `city ${index} disaster`);
    },
    readPlayerFaction() {
      return byte(own(sc, "player_faction"), "player faction");
    },
    nextRandomByte() {
      if (typeof rng?.nextByte !== "function") missing("canonical RNG");
      return byte(rng.nextByte(), "canonical RNG byte");
    },
  };
}

export function beginScenarioDisasterAreaEvent(sc, rng) {
  return beginOriginalDisasterAreaEvent34A6(createScenarioAreaIO(sc, rng));
}

export function continueScenarioDisasterAreaEvent(sc, state) {
  return continueOriginalDisasterArea237E(createScenarioAreaIO(sc), state);
}

function createScenarioObjectIO(sc, rng, queued = []) {
  const cityAtPointer = (pointer) => {
    if (
      !Number.isInteger(pointer) ||
      pointer < 0x0840 ||
      pointer > 0x2020 ||
      (pointer - 0x0840) % 0x20
    )
      missing(`city pointer ${pointer}`);
    const index = (pointer - 0x0840) >>> 5;
    const cities = own(sc, "cities");
    if (!Array.isArray(cities) || !Object.hasOwn(cities, index))
      missing(`city ${index}`);
    return cities[index];
  };
  const objectAt = (slot) => {
    const objects = own(sc, "disasterMapObjects");
    if (!Array.isArray(objects) || !Object.hasOwn(objects, slot))
      missing(`disaster object ${slot}`);
    const object = objects[slot];
    if (
      object !== null &&
      (typeof object !== "object" || Array.isArray(object))
    )
      missing(`disaster object record ${slot}`);
    return { objects, object };
  };
  const eventAt = (offset) => {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset >= 0x400 ||
      offset % 4
    )
      missing(`event address ${offset}`);
    const slots = own(sc, "strategicEventSlots");
    const index = offset >>> 2;
    if (!Array.isArray(slots) || !Object.hasOwn(slots, index))
      missing(`event slot ${index}`);
    const event = slots[index];
    if (event !== null && (typeof event !== "object" || Array.isArray(event)))
      missing(`event record ${index}`);
    return { slots, index, event };
  };
  return {
    readPlayerFaction: () => byte(own(sc, "player_faction"), "player faction"),
    readCityPointerWord(pointer, field) {
      if (field !== "x" && field !== "y") missing(`city word ${field}`);
      return word(own(cityAtPointer(pointer), field), `city ${field}`);
    },
    readCityPointerByte(pointer, field) {
      if (field !== "owner") missing(`city byte ${field}`);
      return byte(own(cityAtPointer(pointer), "faction"), "city owner");
    },
    writeCityPointerByte(pointer, field, value) {
      if (field !== "disaster") missing(`city write ${field}`);
      cityAtPointer(pointer).disaster_event = byte(value, "city disaster");
    },
    readObjectByte(slot, field) {
      const { object } = objectAt(slot);
      if (field !== "status")
        return byte(own(object, field), `object ${field}`);
      return object === null ? 0 : byte(own(object, "status"), "object status");
    },
    readObjectWord(slot, field) {
      const { object } = objectAt(slot);
      return word(own(object, field), `object ${field}`);
    },
    writeObjectByte(slot, field, value) {
      const { objects, object } = objectAt(slot);
      value = byte(value, `object ${field}`);
      if (field === "status" && value === 0) {
        objects[slot] = { ...object, status: 0, active: false };
        return;
      }
      const next = object ?? {};
      next[field] = value;
      if (field === "status") next.active = value >= 0x80;
      if (field === "subtype") {
        next.group = value;
        next.kind = value;
      }
      objects[slot] = next;
    },
    writeObjectWord(slot, field, value) {
      const { objects, object } = objectAt(slot);
      const next = object ?? {};
      next[field] = signedWord(word(value, `object ${field}`));
      objects[slot] = next;
    },
    nextRandomByte() {
      if (typeof rng?.nextByte !== "function") missing("canonical RNG");
      return byte(rng.nextByte(), "canonical RNG byte");
    },
    readEventCursorWord() {
      const cursor = own(sc, "_strategicEventCursor");
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0x3fff)
        missing("aligned D20 cursor");
      return cursor * 4;
    },
    readEventTypeByte(offset) {
      const { event } = eventAt(offset);
      return event === null ? 0 : byte(own(event, "type"), "event type");
    },
    writeEventWord(offset, value) {
      const { slots, index, event } = eventAt(offset & 0xfffc);
      if (offset % 4 === 0) {
        slots[index] = { type: value & 0xff, arg0: value >>> 8 };
      } else if (offset % 4 === 2) {
        if (event === null) missing("event first-word prefix");
        slots[index] = { ...event, arg1: value & 0xff, arg2: value >>> 8 };
        queued.push({ ...slots[index] });
      } else missing("unaligned event word");
    },
  };
}

export function beginScenarioDisasterObjectEvent(sc, event) {
  const subtype = byte(own(event, "arg0"), "event arg0");
  const pointer =
    byte(own(event, "arg1"), "event arg1") |
    (byte(own(event, "arg2"), "event arg2") << 8);
  return beginOriginalDisasterObject34B1(
    createScenarioObjectIO(sc, null),
    subtype,
    pointer,
  );
}

export function continueScenarioDisasterObjectEvent(sc, state, rng) {
  const queued = [];
  const result = continueOriginalDisasterObject34B1(
    createScenarioObjectIO(sc, rng, queued),
    state,
  );
  return { ...result, queued };
}

/** Strict named adapter for the original 22DB then 2286 monthly producer. */
export function performScenarioMonthlyWeatherEvents(sc, rng) {
  const queued = [];
  const cityAt = (index) => {
    const cities = own(sc, "cities");
    if (!Array.isArray(cities) || !Object.hasOwn(cities, index))
      missing(`city ${index}`);
    const city = cities[index];
    if (!city || typeof city !== "object" || Array.isArray(city))
      missing(`city record ${index}`);
    return city;
  };
  const currentBounds = () => {
    const narrowed = sc?._disasterBounds;
    const bounds = narrowed ?? own(sc, "weatherCloudBounds");
    if (!bounds || typeof bounds !== "object" || Array.isArray(bounds))
      missing("weather bounds");
    return bounds;
  };
  const eventAt = (offset) => {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset >= 0x100 ||
      offset % 4
    )
      missing(`event address ${offset}`);
    const slots = own(sc, "strategicEventSlots");
    const index = offset >>> 2;
    if (!Array.isArray(slots) || !Object.hasOwn(slots, index))
      missing(`event slot ${index}`);
    const event = slots[index];
    if (event !== null && (typeof event !== "object" || Array.isArray(event)))
      missing(`event record ${index}`);
    return { slots, index, event };
  };
  const io = {
    readBoundWord(field) {
      return word(own(currentBounds(), field), `weather bound ${field}`);
    },
    writeBoundWord(field, value) {
      if (!Object.hasOwn(sc, "_disasterBounds") || sc._disasterBounds == null)
        sc._disasterBounds = {};
      if (
        typeof sc._disasterBounds !== "object" ||
        Array.isArray(sc._disasterBounds)
      )
        missing("weather narrowed bounds");
      sc._disasterBounds[field] = signedWord(value);
    },
    readCityByte(index, field) {
      const city = cityAt(index);
      if (field === "xLow")
        return word(own(city, "x"), `city ${index} x`) & 0xff;
      const named = {
        owner: "faction",
        growth: "growth",
        defence: "defence",
        disaster: "disaster_event",
      }[field];
      if (!named) missing(`city byte ${field}`);
      return byte(own(city, named), `city ${index} ${named}`);
    },
    readCityWord(index, field) {
      if (field !== "x" && field !== "y") missing(`city word ${field}`);
      return word(own(cityAt(index), field), `city ${index} ${field}`);
    },
    writeCityByte(index, field, value) {
      if (field !== "disaster") missing(`city write ${field}`);
      cityAt(index).disaster_event = byte(value, `city ${index} disaster`);
    },
    readPlayerFaction() {
      return byte(own(sc, "player_faction"), "player faction");
    },
    showAreaMessage() {
      missing("TALK70 return at 23EC");
    },
    nextRandomByte() {
      if (typeof rng?.nextByte !== "function") missing("canonical RNG");
      return byte(rng.nextByte(), "canonical RNG byte");
    },
    readEventCursorWord() {
      const cursor = own(sc, "_strategicEventCursor");
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0x3fff)
        missing("aligned D20 cursor");
      return cursor * 4;
    },
    readEventTypeByte(offset) {
      const { event } = eventAt(offset);
      return event === null ? 0 : byte(own(event, "type"), "event type");
    },
    writeEventWord(offset, value) {
      const { slots, index, event } = eventAt(offset & 0xfffc);
      if (offset % 4 === 0) {
        const next = { type: value & 0xff, arg0: value >>> 8 };
        for (const field of ["arg1", "arg2"])
          if (event !== null && Object.hasOwn(event, field))
            next[field] = event[field];
        slots[index] = next;
      } else if (offset % 4 === 2) {
        if (event === null) missing("event first-word prefix");
        slots[index] = {
          ...event,
          arg1: value & 0xff,
          arg2: value >>> 8,
        };
        queued.push({ ...slots[index] });
      } else missing("unaligned event word");
    },
  };
  const result = originalMonthlyWeatherEvents(io);
  return { ...result, queued };
}
