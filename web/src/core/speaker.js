// PC 喇叭音效复刻 — KI.EXE 0xCDE / 0xCE7 (2026-08-24 反汇编定论):
//   0xEB11 = 喇叭驱动: ax 低字节=重复次数, 高字节=每次脉宽;
//   port 0x61 bit0/1 门控发声, port 0x3DA bit3 垂直回扫计时(约18Hz节拍)
//   0xCDE = ax 0x101 → 短哔一声(命令确认/军团移动)
//   0xCE7 = ax 0x202 → 两声(警告: 出陣条件不足/天灾提示等)
//   0x2F5(AL=3) = int 61h AH=5, AL=3 → 接敌/攻城等待阶段的 YNSOUND ID 3
// YNSOUND硬件链已实锤为SB Pro双OPL2端口(220/221左、222/223右、224/225 mixer)。
// ID3由SOUND.DAT记录3驱动channel 6，3个INT1Ch tick后续接记录13，再过7 tick静音。
// grf/sfx/ynsound-id3.wav是按该寄存器链离线渲染并经用户听感确认的原音色样本。

const ENGAGE_SFX_URL = new URL(
	"../../grf/sfx/ynsound-id3.wav",
	import.meta.url,
);

let actx;
let muted = false;
let soundType = 1;
let engageBuffer = null;
let engageBufferPromise = null;

export const SOUND_PROFILES = [
	{ frequency: 950, gain: 0.12, wave: "square" },
	{ frequency: 760, gain: 0.11, wave: "square" },
	{ frequency: 1180, gain: 0.1, wave: "triangle" },
	{ frequency: 620, gain: 0.09, wave: "sawtooth" },
];

/** 首次用户手势时解锁 AudioContext(浏览器自动播放策略)；在 pointerdown 里调 */
export function unlockSfx() {
	try {
		actx ??= new (
			window.AudioContext || /** @type {any} */ (window).webkitAudioContext
		)();
		if (actx.state === "suspended") actx.resume();
	} catch {
		/* 无音频环境静默 */
	}
}

/** 设置系统选单音效类型 1..4。 */
export function setSoundType(type) {
	const value = Number(type);
	soundType = Number.isFinite(value)
		? Math.max(1, Math.min(4, Math.trunc(value)))
		: 1;
	return soundType;
}

/** 静音开关(返回切换后状态) */
export function toggleMute() {
	muted = !muted;
	return muted;
}

function tone(freqMs, gapMs) {
	if (muted) return;
	try {
		actx ??= new (
			window.AudioContext || /** @type {any} */ (window).webkitAudioContext
		)();
		if (actx.state === "suspended") actx.resume();
		const profile = SOUND_PROFILES[soundType - 1] ?? SOUND_PROFILES[0];
		const t0 = actx.currentTime + gapMs;
		const osc = actx.createOscillator();
		const g = actx.createGain();
		osc.type = profile.wave;
		osc.frequency.value = profile.frequency;
		g.gain.setValueAtTime(profile.gain, t0);
		g.gain.setValueAtTime(0, t0 + freqMs);
		osc.connect(g).connect(actx.destination);
		osc.start(t0);
		osc.stop(t0 + freqMs);
	} catch {
		/* 无音频环境静默 */
	}
}

async function loadEngageBuffer() {
	if (engageBuffer) return engageBuffer;
	try {
		actx ??= new (
			window.AudioContext || /** @type {any} */ (window).webkitAudioContext
		)();
		engageBufferPromise ??= fetch(ENGAGE_SFX_URL)
			.then((response) => {
				if (!response.ok) throw new Error(`engage SFX ${response.status}`);
				return response.arrayBuffer();
			})
			.then((bytes) => actx.decodeAudioData(bytes));
		engageBuffer = await engageBufferPromise;
		return engageBuffer;
	} catch {
		engageBufferPromise = null;
		return null;
	}
}

/** 预载YNSOUND ID3样本；首次用户手势后调用可避免交战时网络延迟。 */
export function preloadEngageSfx() {
	return loadEngageBuffer();
}

/** YNSOUND ID 3：播放一次原版channel 6双阶段包络样本。 */
export async function engageSfx() {
	if (muted) return false;
	const buffer = await loadEngageBuffer();
	if (!buffer || muted || !actx) return false;
	try {
		if (actx.state === "suspended") await actx.resume();
		const source = actx.createBufferSource();
		source.buffer = buffer;
		source.connect(actx.destination);
		source.start();
		return true;
	} catch {
		return false;
	}
}

/** 0xCDE 命令确认音(一声) */
export function clickSfx() {
	tone(0.05, 0);
}

/** 0xCE7 警告音(两声) */
export function warnSfx() {
	tone(0.07, 0);
	tone(0.07, 0.14);
}
