/**
 * ビープ音（Web Audio）と読み上げ（Speech Synthesis）。
 * iOS はユーザー操作中に unlock() を呼ぶ必要がある。
 */
let ctx = null;

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

export function beep(freq = 880, duration = 0.15, volume = 0.4) {
	if (!ctx) {
		return;
	}
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	const t = ctx.currentTime;
	osc.type = 'sine';
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(volume, t);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
	osc.connect(gain).connect(ctx.destination);
	osc.start(t);
	osc.stop(t + duration + 0.02);
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
