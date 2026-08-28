// PC 喇叭音效复刻 — KI.EXE 0xCDE / 0xCE7 (2026-08-24 反汇编定论):
//   0xEB11 = 喇叭驱动: ax 低字节=重复次数, 高字节=每次脉宽;
//   port 0x61 bit0/1 门控发声, port 0x3DA bit3 垂直回扫计时(约18Hz节拍)
//   0xCDE = ax 0x101 → 短哔一声(命令确认/军团移动)
//   0xCE7 = ax 0x202 → 两声(警告: 出陣条件不足/天灾提示等)
// web 用 WebAudio 方波近似原版单音蜂鸣(原版无频率设置, 固定约1kHz味)

let actx;
let muted = false;

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
		const t0 = actx.currentTime + gapMs;
		const osc = actx.createOscillator();
		const g = actx.createGain();
		osc.type = "square";
		osc.frequency.value = 950;
		g.gain.setValueAtTime(0.12, t0);
		g.gain.setValueAtTime(0, t0 + freqMs);
		osc.connect(g).connect(actx.destination);
		osc.start(t0);
		osc.stop(t0 + freqMs);
	} catch {
		/* 无音频环境静默 */
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
