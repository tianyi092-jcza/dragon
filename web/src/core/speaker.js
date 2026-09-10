// PC 提示音调用来源 — KI.EXE 0xCDE / 0xCE7:
//   0xEB11: AL=重复次数, AH=重复间隔计数；不读取CF9设置。
//   port 0x61 bit0/1门控、0x3DA bit3垂直回扫等待，不是18Hz BIOS节拍。
// Web固定音高/时长仅保留既有表现近似，非原PIT/逐采样认证。
//   0xCDE = ax 0x101 → 短哔一声(命令确认/军团移动)
//   0xCE7 = ax 0x202 → 两声(警告: 出陣条件不足/天灾提示等)
//   0x2F5(AL=3) = int 61h AH=5, AL=3 → 接敌/攻城等待阶段的 YNSOUND ID 3
// COM:0154开启OPL3 NEW与六组4-op；ID3使用bank0未配对的2-op channel6。
// 记录3→3个INT1C tick→记录13→7 tick→记录0；重复请求重置同一通道。
// WAV为原指令寄存器链的离线OPL3合成（非声卡录音），详见re-notes-audio.md。

const ENGAGE_SFX_URLS = [3, 13].map(
	(record) =>
		new URL(`../../grf/sfx/ynsound-record${record}.wav`, import.meta.url),
);
export const ORIGINAL_BIOS_TICK_SECONDS = 65536 / 1193182;
export function getAudioContext() {
	return actx;
}

let actx;
let muted = false;
const activeTones = new Set();
let engageBuffer = null;
let engageBufferPromise = null;

let engageVoices = [];
export const ENGAGE_SFX_PLAYBACK_RATE = 1;

// 保留既有Web默认PC提示音近似，不伪称原PIT频率/声压认证。
// 原CF9「音效」设置只控制音乐驱动，不选择PC/FM音色。
const PC_BEEP = { frequency: 950, gain: 0.12, wave: "square" };

/** 首次用户手势时解锁 AudioContext(浏览器自动播放策略)；在 pointerdown 里调 */
export function unlockSfx() {
	try {
		actx ??= new (
			window.AudioContext || /** @type {any} */ (window).webkitAudioContext
		)();
		if (actx.state === "suspended")
			void Promise.resolve(actx.resume()).catch(() => {});
	} catch {
		/* 无音频环境静默 */
	}
}

/** 独立SFX静音用于诊断；不是系统菜单CF9设置。 */
export function toggleMute() {
	muted = !muted;
	if (muted) stopAllSfx();
	return muted;
}

function stopAllSfx() {
	stopEngageSfx();
	for (const { osc, gain } of activeTones) {
		try {
			osc.stop();
			osc.disconnect();
			gain.disconnect();
		} catch {
			/* Context may already be closed. */
		}
	}
	activeTones.clear();
}

function tone(freqMs, gapMs) {
	if (muted) return;
	try {
		actx ??= new (
			window.AudioContext || /** @type {any} */ (window).webkitAudioContext
		)();
		if (actx.state === "suspended")
			void Promise.resolve(actx.resume()).catch(() => {});
		const profile = PC_BEEP;
		const t0 = actx.currentTime + gapMs;
		const osc = actx.createOscillator();
		const g = actx.createGain();
		osc.type = profile.wave;
		osc.frequency.value = profile.frequency;
		g.gain.setValueAtTime(profile.gain, t0);
		g.gain.setValueAtTime(0, t0 + freqMs);
		osc.connect(g).connect(actx.destination);
		const voice = { osc, gain: g };
		activeTones.add(voice);
		osc.onended = () => {
			activeTones.delete(voice);
			osc.disconnect();
			g.disconnect();
		};
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
		engageBufferPromise ??= Promise.all(
			ENGAGE_SFX_URLS.map(async (url) => {
				const response = await fetch(url);
				if (!response.ok) throw new Error(`engage SFX ${response.status}`);
				return actx.decodeAudioData(await response.arrayBuffer());
			}),
		);
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

/** 音频诊断/独立预载：等待解码及AudioContext恢复。
 * 战略、接敌、战术规则不能await此函数；未就绪发声请求直接丢弃。
 */
export async function prepareEngageSfx() {
	const buffer = await loadEngageBuffer();
	if (!buffer || muted || !actx) return buffer;
	try {
		if (actx.state === "suspended") await actx.resume();
		if (actx.state === "running") return buffer;
		// 部分浏览器resume()先resolve、随后才切running；独立音频诊断
		// 等待状态事件，但这不是规则或四相动画的推进条件。
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

/** COM:0828先关闭channel6；还未到期的后继同样取消。 */
export function stopEngageSfx() {
	const previous = engageVoices;
	engageVoices = [];
	for (const voice of previous) {
		try {
			voice.source.stop();
			voice.source.disconnect();
		} catch {
			/* closed */
		}
	}
}

/** AH7/0318清后继计数但不写channel6。当前EG自然衰减，取消未来ID13。
 * 新ID0要256个BIOS tick才到；这两个认证PCM在0.166s前已自然归零。
 * AH8只清busy位、保留后继，不调用本函数。
 */
export function musicDriverStarted() {
	if (!actx) return;
	const now = actx.currentTime;
	const current = engageVoices.filter((voice) => voice.start <= now).at(-1);
	for (const voice of [...engageVoices]) {
		try {
			if (voice.start > now) {
				voice.source.stop();
				voice.source.disconnect();
				engageVoices = engageVoices.filter((entry) => entry !== voice);
			} else if (voice === current) {
				// Override normal transition key-off, not the current envelope.
				voice.source.stop(voice.start + voice.source.buffer.duration);
			}
		} catch {
			/* No audio error may escape into scene/rule processing. */
		}
	}
}

function scheduleEngageRecord(buffer, start, end) {
	const source = actx.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = ENGAGE_SFX_PLAYBACK_RATE;
	source.connect(actx.destination);
	const voice = { source, start };
	engageVoices.push(voice);
	source.onended = () => {
		engageVoices = engageVoices.filter((entry) => entry !== voice);
		source.disconnect();
	};
	source.start(start);
	source.stop(end);
}

/** 一次ID3请求，两个原记录沿共享BIOS时基串联；不因未就绪排队补播。 */
export function engageSfx() {
	if (muted || !engageBuffer || !actx || actx.state !== "running") return false;
	try {
		stopEngageSfx();
		const now = actx.currentTime;
		const tick = Math.floor(now / ORIGINAL_BIOS_TICK_SECONDS);
		const next = (tick + 3) * ORIGINAL_BIOS_TICK_SECONDS;
		scheduleEngageRecord(engageBuffer[0], now, next);
		scheduleEngageRecord(
			engageBuffer[1],
			next,
			(tick + 10) * ORIGINAL_BIOS_TICK_SECONDS,
		);
		return true;
	} catch {
		stopEngageSfx();
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
