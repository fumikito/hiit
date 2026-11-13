/**
 * フェーズ列を時刻ベースで進めるタイマー。
 * setInterval の回数ではなく終了時刻で管理するので、
 * バックグラウンドで間引かれてもズレない。
 */
export class Timer {
	/**
	 * @param {object[]} phases
	 * @param {{phase?:Function, tick?:Function, count?:Function, done?:Function}} handlers
	 */
	constructor(phases, handlers = {}) {
		this.phases = phases;
		this.on = handlers;
		this.handle = null;
		this.reset();
	}

	get phase() {
		return this.phases[this.index];
	}

	reset() {
		this.stopLoop();
		this.state = 'idle';
		this.index = 0;
		this.remaining = this.phases[0].duration * 1000;
		this.endAt = 0;
		this.lastSecond = null;
		this.emitTick();
	}

	start() {
		if (this.state === 'running') {
			return;
		}
		if (this.state === 'done') {
			this.reset();
		}
		const fresh = this.state === 'idle';
		this.state = 'running';
		this.endAt = performance.now() + this.remaining;
		if (fresh) {
			this.on.phase?.(this.phase, true);
		}
		this.handle = setInterval(() => this.tick(), 100);
		this.tick();
	}

	pause() {
		if (this.state !== 'running') {
			return;
		}
		this.remaining = Math.max(0, this.endAt - performance.now());
		this.state = 'paused';
		this.stopLoop();
		this.emitTick();
	}

	toggle() {
		this.state === 'running' ? this.pause() : this.start();
	}

	stopLoop() {
		if (this.handle) {
			clearInterval(this.handle);
			this.handle = null;
		}
	}

	tick() {
		const now = performance.now();
		let changed = false;
		while (now >= this.endAt) {
			if (this.index >= this.phases.length - 1) {
				this.finish();
				return;
			}
			this.index++;
			this.endAt += this.phase.duration * 1000;
			changed = true;
		}
		this.remaining = this.endAt - now;
		if (changed) {
			// 画面復帰時などに大きく遅れて追いついた場合は音を鳴らさない。
			const late = this.phase.duration * 1000 - this.remaining > 1500;
			this.on.phase?.(this.phase, !late);
			this.lastSecond = null;
		}
		const sec = Math.ceil(this.remaining / 1000);
		if (sec !== this.lastSecond) {
			if (this.lastSecond !== null && sec <= 3 && sec >= 1) {
				this.on.count?.(sec);
			}
			this.lastSecond = sec;
		}
		this.emitTick();
	}

	finish() {
		this.stopLoop();
		this.state = 'done';
		this.index = this.phases.length - 1;
		this.remaining = 0;
		this.emitTick();
		this.on.done?.();
	}

	/** 開始からの経過秒（小数） */
	elapsed() {
		let sum = 0;
		for (let i = 0; i < this.index; i++) {
			sum += this.phases[i].duration;
		}
		return sum + this.phase.duration - this.remaining / 1000;
	}

	emitTick() {
		this.on.tick?.(this);
	}
}
