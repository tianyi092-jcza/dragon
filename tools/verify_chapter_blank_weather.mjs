// Read only five explicit non-save source files; never access Dragon/SAVE.DAT.
// This proves the shared weather input, not a generic diplomacy/event recipe.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CHAPTER_BASE } from '../web/src/content/authoring/chapterbase.generated.js';
import { initializeBlankChapterInputs } from '../web/src/content/authoring/gamesource.js';
import { initializeScenarioWeatherInputs } from '../web/src/game/weather.js';
import { initializeNativeStrategicEventWheel } from '../web/src/game/nativeevents.js';

const sources = [
  ['原版', '4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87'],
  ['上', '6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73'],
  ['中', 'cf91e4360fa4e9363b5136ba379d58c8b1c8b5b3ca309eca4071b4f7a805ce59'],
  ['下', '89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb'],
  ['后', '3e70ad54e3fc3b9d13a25883098d1ccc53218aafd1a7a461b095c1f1fc9812db'],
];

test('all twenty original weather windows and bounds match the pinned blank-chapter input', () => {
  let firstWindow;
  sources.forEach(([name, digest]) => {
    const bytes = readFileSync(new URL(`../../${name}/SINARIO.DAT`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, name);
    Array.from({ length: 4 }, (_, index) => index).forEach(index => {
      const chapter = bytes.subarray(index * 22208, (index + 1) * 22208);
      const window = chapter.subarray(0x21c0, 0x22c0);
      assert.equal(window.length, 256, `${name}:${index + 1}: no padded short input`);
      firstWindow ??= window;
      assert.deepEqual(window, firstWindow, `${name}:${index + 1}: complete raw weather window`);
      const decoded = Array.from({ length: 16 }, (_, slot) => {
        const cloud = window.subarray(slot * 16, (slot + 1) * 16);
        return { active: cloud[0] >= 0x80, x: cloud.readInt16LE(2), y: cloud.readInt16LE(4),
          phaseX: cloud.readInt8(8), velocityX: cloud.readInt8(9), phaseY: cloud.readInt8(10),
          velocityY: cloud.readInt8(11), timer: cloud[12], interval: cloud[13], group: cloud[14], frame: cloud[15] & 7 };
      });
      assert.deepEqual(decoded, CHAPTER_BASE.weatherClouds);
      assert.deepEqual({ minX: chapter.readInt16LE(0x32), minY: chapter.readInt16LE(0x34),
        maxX: chapter.readInt16LE(0x36), maxY: chapter.readInt16LE(0x38) }, CHAPTER_BASE.weatherCloudBounds);
    });
  });
});

test('blank event input is copied from complete original windows, never from the truncated tail', () => {
  let complete = 0, incomplete = 0;
  sources.forEach(([name, digest]) => {
    const bytes = readFileSync(new URL(`../../${name}/SINARIO.DAT`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest);
    Array.from({ length: 4 }, (_, index) => index).forEach(index => {
      const window = bytes.subarray(index * 22208 + 0x52c0, (index + 1) * 22208);
      if (window.length !== 1024) {
        assert.deepEqual([name, index, window.length], ['下', 3, 1022]);
        assert.throws(() => initializeNativeStrategicEventWheel({ nativeStrategicEventRaw: window.toString('hex') }), /Invalid native strategic event raw wheel/);
        incomplete += 1;
      } else {
        assert.equal(window.toString('hex'), CHAPTER_BASE.nativeStrategicEventRaw);
        assert.ok(window.every(value => value === 0));
        complete += 1;
      }
    });
  });
  assert.deepEqual([complete, incomplete], [19, 1], 'counts belong to these exact hashed input files, not a runtime rule');
});

test('blank diplomacy template is byte-exact original upper chapter one, including aliases and diagonals', () => {
  const bytes = readFileSync(new URL('../../上/SINARIO.DAT', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sources[1][1]);
  assert.equal(CHAPTER_BASE.nativeDiplomacyRaw, bytes.subarray(0x680, 0x8c0).toString('hex'));
  assert.equal(CHAPTER_BASE.ordinaryDiplomacyRaw, bytes[0x681]);
  assert.equal(CHAPTER_BASE.ordinaryDiplomacyRaw, 183, 'template ordinary55, not a guessed midpoint');
});

test('blank chapters own independent weather inputs and the real initializer accepts them', () => {
  const first = { factions: [] }, second = { factions: [] };
  initializeBlankChapterInputs(first); initializeBlankChapterInputs(second);
  assert.deepEqual(first.weatherClouds, CHAPTER_BASE.weatherClouds);
  assert.notEqual(first.weatherClouds, second.weatherClouds);
  assert.notEqual(first.weatherCloudBounds, second.weatherCloudBounds);
  first.weatherClouds[0].x += 1; first.weatherCloudBounds.minX += 1;
  assert.deepEqual(second.weatherClouds, CHAPTER_BASE.weatherClouds);
  assert.deepEqual(second.weatherCloudBounds, CHAPTER_BASE.weatherCloudBounds);
  initializeScenarioWeatherInputs(second);
  assert.ok(second.weatherClouds.every(cloud => cloud.status === 0x80));
  assert.deepEqual(second.disasterMapObjects, Array.from({ length: 16 }, () => ({ status: 0 })));
  assert.equal(second.nativeDiplomacyRaw, CHAPTER_BASE.nativeDiplomacyRaw);
  assert.deepEqual(second.diplomacy, []);
  assert.equal(second.nativeStrategicEventRaw, CHAPTER_BASE.nativeStrategicEventRaw);
  initializeNativeStrategicEventWheel(second);
  assert.deepEqual(second.strategicEventSlots, Array(256).fill(null));
});
