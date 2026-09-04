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

/**
 * 委任四相开始前同时完成样本解码与AudioContext恢复。仅预载buffer不足以
 * 保证声音起拍：浏览器仍可能在第一帧后才完成resume()。
 */
export async function prepareEngageSfx() {
	const buffer = await loadEngageBuffer();
	if (!buffer || muted || !actx) return buffer;
	try {
		if (actx.state === "suspended") await actx.resume();
		if (actx.state === "running") return buffer;
		// 部分浏览器的resume()会先resolve、随后才切running；首帧必须等到
		// 状态事件，而不是让四相画面先于实际音频时钟启动。
		await new Promise((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				actx.removeEventListener?.("statechange", check);
				resolve();
			};
			const check = () => {
				if (actx.state === "running") finish();
			};
			const timeout = setTimeout(finish, 1000);
			actx.addEventListener?.("statechange", check);
			check();
		});
	} catch {
		return null;
	}
	return buffer;
}

/**
 * YNSOUND ID 3：同步起播一次已缓存样本。这里不能await加载/resume；四相
 * onFrame必须在同一调用栈内启动声音，否则画面会先走完再补播。
 */
export function engageSfx() {
	if (muted || !engageBuffer || !actx || actx.state !== "running") return false;
	try {
		const source = actx.createBufferSource();
		source.buffer = engageBuffer;
		source.connect(actx.destination);
		source.start(actx.currentTime);
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
