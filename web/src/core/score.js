// Scene-owned music intents only. Original entry/return chains and the literal
// Web clock-field integration boundary are documented in re-notes-audio.md.
import { seasonalMusicTrack } from "./music.js";

export function tacticalMusicTrack(registers) {
  if (registers?.mode === 0) return registers.battleSideFlag & 0x40 ? 8 : 7;
  if (registers?.mode === 1) return 9;
  if (registers?.mode === 2) return 10;
  return null;
}

export class ScoreDirector {
  constructor(music, clock) {
    this.music = music;
    this.clock = clock;
    this.scene = "title";
    this.audience = null;
    this.battle = null;
  }
  title() {
    this.scene = "title";
    this.audience = null;
    this.battle = null;
    this.music.select(0); // KI:1A74, not standalone OPENBGM
  }
  strategy() {
    this.scene = "strategy";
    this.audience = null;
    this.battle = null;
    this.music.select(seasonalMusicTrack(this.clock()?.month));
  }
  calendar(clock) {
    if (
      this.scene !== "strategy" ||
      this.audience ||
      clock.hour !== 1 ||
      ![3, 6, 9, 12].includes(clock.month)
    )
      return;
    if (clock.day === 1) this.music.fadeOut();
    if (clock.day === 2) this.music.select(seasonalMusicTrack(clock.month));
  }
  beginAudience(owner) {
    if (this.scene !== "strategy" || this.audience === owner) return;
    this.audience = owner;
    this.music.fadeOut();
    this.music.select(6);
  }
  endAudience(owner) {
    if (this.audience !== owner) return;
    this.audience = null;
    if (this.scene === "strategy") {
      this.music.fadeOut();
      this.music.select(seasonalMusicTrack(this.clock()?.month));
    }
  }
  discardAudience() {
    this.audience = null;
  }
  beginBattle(battle) {
    this.scene = "battle";
    this.audience = null;
    this.battle = battle;
    this.music.fadeOut();
  }
  readyBattle(battle) {
    if (this.scene === "battle" && this.battle === battle)
      this.music.select(tacticalMusicTrack(battle.session?.registers));
  }
  fadeBattle(battle) {
    if (this.scene === "battle" && this.battle === battle) this.music.fadeOut();
  }
  endBattle(battle) {
    if (this.scene === "battle" && this.battle === battle) this.strategy();
  }
  gameOver() {
    this.scene = "gameover";
    this.audience = null;
    this.battle = null;
    this.music.select("OVERBGM");
  }
}
