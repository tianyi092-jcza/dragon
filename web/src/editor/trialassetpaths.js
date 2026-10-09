// Conservative fixed imported Web library. Not original reachability or Q69 proof.
const paths = [
	"battle_maps.json",
	"battle_navigation.json",
	"battle_rules.json",
	"battle_scripts.json",
	"talk.json",
	"battle_talk.json",
	"battle_display.bin",
];
for (let i = 0; i < 3; i++) {
	paths.push(`grf/battle_terrain_${i}.png`);
}
paths.push("grf/battle_units.png");
for (let i = 0; i < 150; i++) {
	paths.push(`kao/${i}.png`);
}
for (let i = 0; i < 15; i++) {
	paths.push(`grf/kyo_${String(i).padStart(2, "0")}.png`);
}
for (let style = 0; style < 24; style++) {
	for (let frame = 0; frame < 5; frame++) {
		paths.push(
			`grf/march_markers/style_${String(style).padStart(2, "0")}_frame_${frame}.png`,
		);
	}
}
for (let i = 0; i < 4; i++) {
	paths.push(`grf/engage/group_0_frame_${i}.png`);
}
for (let i = 0; i < 8; i++) {
	paths.push(`grf/weather/cloud_frame_${i}.png`);
}
for (const effect of ["fire", "riot"]) {
	for (let i = 0; i < 8; i++) {
		paths.push(`grf/disaster/${effect}_frame_${i}.png`);
	}
}
for (const kind of ["player", "other", "empty"]) {
	paths.push(`grf/ui/icon-${kind}_city.png`);
}
for (const name of [
	"tool_bar",
	"tool_ico1",
	"tool_ico2",
	"tool_ico3",
	"tool_ico4",
	"ico_money",
	"ico_cavalry",
	"ico_archer",
	"ico_infantry",
	"cloud",
	"frame_sq",
	"frame_col",
	"frame_cap",
	"message_npc",
]) {
	paths.push(`grf/ui/${name}.png`);
}
for (let i = 0; i < 3; i++) {
	paths.push(`grf/ivent_${i}.png`);
}
for (let i = 0; i < 16; i++) {
	paths.push(`grf/ui/battle_symbol_${i}.png`);
}
for (let i = 0; i < 6; i++) {
	paths.push(`grf/ui/battle_status_${i}.png`);
}
for (const type of ["cavalry", "archer", "infantry"]) {
	paths.push(`grf/ui/battle_unit_${type}.png`);
}
paths.push(
	"grf/ui/battle_formation_stone.png",
	"font/Oswald-Light.woff2",
	"grf/gameover.png",
);
for (let i = 1; i <= 12; i++) {
	paths.push(`grf/end_s${i}.png`);
}
paths.push("grf/music/playback.json");
for (const index of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
	paths.push(`grf/music/loops/BGM_${String(index).padStart(2, "0")}.flac`);
}
paths.push(
	"grf/music/loops/OVERBGM.flac",
	"grf/sfx/ynsound-record3.wav",
	"grf/sfx/ynsound-record13.wav",
);
export const FIXED_TRIAL_ASSET_PATHS = Object.freeze(paths.sort());
export const TRIAL_ASSET_PROFILE = "fixed-available-web-library-1";
