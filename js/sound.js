/**
 * ビープ音（Web Audio）と読み上げ（Speech Synthesis）。
 * iOS はユーザー操作中に unlock() を呼ぶ必要がある。
 */
let ctx = null;
const pending = new Set(); // まだ鳴っていない予約済みの音源

/** 音源を予約し、鳴る前なら cancelScheduled() で取り消せるようにする。 */
function schedule(node, at) {
	pending.add(node);
	node.onended = () => pending.delete(node);
	node.start(at);
}

/** 一時停止・リセット時に、まだ鳴っていない予約音を取り消す。 */
export function cancelScheduled() {
	pending.forEach((node) => {
		try {
			node.stop();
		} catch {}
	});
	pending.clear();
}

export function unlock() {
	if (!ctx) {
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) {
			return;
		}
		ctx = new AC();
	}
	if (ctx.state === 'suspended') {
		ctx.resume();
	}
	// 無音を一度鳴らして iOS の再生制限を解除する。
	beep(1, 0.01, 0);
	if ('speechSynthesis' in window) {
		speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(''), { volume: 0 }));
	}
}

/**
 * @param {number} delay 何秒後に鳴らすか（Web Audio の時計で予約するので、タイマーの揺れに左右されない）
 */
export function beep(freq = 880, duration = 0.15, volume = 0.4, delay = 0) {
	if (!ctx) {
		return;
	}
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	const t = ctx.currentTime + delay;
	osc.type = 'sine';
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(volume, t);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
	osc.connect(gain).connect(ctx.destination);
	schedule(osc, t);
	osc.stop(t + duration + 0.02);
}

let noise = null;

/**
 * 秒ごとの小さな「チッ」。高域だけを残したごく短いノイズ。
 *
 * @param {number} delay 何秒後に鳴らすか
 */
export function tick(delay = 0, volume = 0.25) {
	if (!ctx) {
		return;
	}
	if (!noise) {
		noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) {
			data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
		}
	}
	const src = ctx.createBufferSource();
	const filter = ctx.createBiquadFilter();
	const gain = ctx.createGain();
	src.buffer = noise;
	filter.type = 'highpass';
	filter.frequency.value = 3000;
	gain.gain.value = volume;
	src.connect(filter).connect(gain).connect(ctx.destination);
	schedule(src, ctx.currentTime + delay);
}

export function chime() {
	[0, 0.18, 0.36].forEach((delay, i) => setTimeout(() => beep(1046 + i * 262, 0.25), delay * 1000));
}

export function say(text) {
	if (!('speechSynthesis' in window) || !text) {
		return;
	}
	speechSynthesis.cancel();
	const u = new SpeechSynthesisUtterance(text);
	u.lang = 'ja-JP';
	u.rate = 1.05;
	speechSynthesis.speak(u);
}
