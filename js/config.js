/**
 * ワークアウト定義(JSON)の検証とフェーズ列への展開。
 */

const LABELS = {
	work: '運動の秒数',
	rest: 'インターバルの秒数',
	countdown: 'カウントダウンの秒数',
	rounds: 'ラウンド数',
	roundRest: 'ラウンド間の休憩の秒数',
};

/**
 * 数値項目を検証する。未指定なら fallback。
 * エラー文はJSONを書く人にもフォームの利用者にも通じるよう「どれの・何が」で書く。
 */
const num = (value, fallback, owner, key, { min = 0 } = {}) => {
	if (value === undefined || value === null) {
		return fallback;
	}
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
		throw new Error(`「${owner}」の${LABELS[key]}は${min}以上の数値にしてください（${key}: ${JSON.stringify(value)}）`);
	}
	return value;
};

/**
 * 1つのワークアウトを検証し、既定値を埋めた形に正規化する。
 *
 * @param {object} w
 * @returns {object}
 */
export function normalizeWorkout(w) {
	if (!w || typeof w !== 'object') {
		throw new Error('ワークアウトはオブジェクトで指定してください');
	}
	const name = String(w.name || '名称未設定');
	const work = num(w.work, 20, name, 'work', { min: 1 });
	const rest = num(w.rest, 10, name, 'rest');
	const countdown = num(w.countdown, 10, name, 'countdown');
	const rounds = Math.floor(num(w.rounds, 1, name, 'rounds', { min: 1 }));
	const roundRest = num(w.roundRest, rest, name, 'roundRest');
	if (!Array.isArray(w.sets) || !w.sets.length) {
		throw new Error(`「${name}」には種目を1つ以上入れてください（sets）`);
	}
	const sets = w.sets.map((s, i) => {
		const set = typeof s === 'string' ? { name: s } : s;
		if (!set || typeof set !== 'object') {
			throw new Error(`「${name}」の sets[${i}] は文字列かオブジェクトで指定してください`);
		}
		const label = String(set.name || `セット${i + 1}`);
		return {
			name: label,
			work: num(set.work, work, label, 'work', { min: 1 }),
			rest: num(set.rest, rest, label, 'rest'),
		};
	});
	return { name, countdown, work, rest, rounds, roundRest, sets };
}

/**
 * JSON文字列またはオブジェクトからワークアウト一覧を得る。
 *
 * @param {string|object} source
 * @returns {object[]}
 */
export function parseWorkouts(source) {
	const data = typeof source === 'string' ? JSON.parse(source) : source;
	const list = Array.isArray(data) ? data : (data && data.workouts) || [data];
	if (!list.length) {
		throw new Error('workouts が空です');
	}
	return list.map(normalizeWorkout);
}

/**
 * ワークアウトを実行順のフェーズ配列に展開する。
 * 最後のセットの後にはインターバルを入れない。
 *
 * @param {object} w 正規化済みワークアウト
 * @returns {{type:string,label:string,name:string,duration:number,set?:number,round?:number,next?:string}[]}
 */
export function buildPhases(w) {
	const phases = [];
	if (w.countdown > 0) {
		phases.push({ type: 'prepare', label: '準備', name: 'まもなく開始', duration: w.countdown });
	}
	for (let r = 0; r < w.rounds; r++) {
		w.sets.forEach((set, i) => {
			phases.push({ type: 'work', label: '運動', name: set.name, duration: set.work, set: i, round: r });
			const lastOfRound = i === w.sets.length - 1;
			if (lastOfRound && r === w.rounds - 1) {
				return;
			}
			const duration = lastOfRound ? w.roundRest : set.rest;
			if (duration > 0) {
				phases.push({
					type: 'rest',
					label: lastOfRound ? 'ラウンド休憩' : 'インターバル',
					name: '休憩',
					duration,
					set: i,
					round: r,
				});
			}
		});
	}
	// 「次は〇〇」表示用に、後続の運動名を埋める。
	let next = '';
	for (let i = phases.length - 1; i >= 0; i--) {
		phases[i].next = next;
		if (phases[i].type === 'work') {
			next = phases[i].name;
		}
	}
	return phases;
}

export const totalSeconds = (phases) => phases.reduce((sum, p) => sum + p.duration, 0);
