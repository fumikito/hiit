/**
 * ワークアウトの一覧。
 *
 * - プリセット: サーバーの workouts.json。読み取り専用で、全員に同じものが配られる。
 * - マイワークアウト: この端末の localStorage に保存した定義。各自が作成・編集・削除できる。
 *
 * 両者は上書きし合わず、一覧に並べて表示する。プリセットを変えたいときは複製して編集する。
 */
import { normalizeWorkout } from './config.js';
import { store } from './store.js';

const KEY = 'myWorkouts';

/**
 * 保存されている配列をそのまま返す。書き戻しに使うので、壊れた要素も除かない。
 *
 * @returns {Array}
 */
function load() {
	const list = store.get(KEY, []);
	return Array.isArray(list) ? list : [];
}

/**
 * store.set の結果を判定する。失敗は false のときだけ。
 * 更新直後はブラウザのキャッシュから旧版の store.js（戻り値なし＝undefined）が
 * 読まれることがあり、それを失敗扱いにすると保存が一切できなくなるため。
 */
const saved = (result) => result !== false;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * プリセットとマイワークアウトをまとめた一覧を作る。壊れたマイワークアウトは読み飛ばす。
 *
 * @param {object[]} presets 正規化済みのプリセット
 * @returns {{key: string, source: 'preset'|'mine', id?: string, workout: object}[]}
 */
export function entries(presets) {
	const mine = [];
	load().forEach((item) => {
		const { id, raw } = item || {};
		if (!id || !raw) {
			return;
		}
		try {
			mine.push({ key: `c:${id}`, source: 'mine', id, workout: normalizeWorkout(raw) });
		} catch {
			// 手で壊された等。一覧には出さないがデータは消さない。
		}
	});
	return [...presets.map((workout) => ({ key: `p:${workout.name}`, source: 'preset', workout })), ...mine];
}

/**
 * マイワークアウトを保存する。id がなければ新規作成。
 *
 * @returns {string|null} 保存した id。書き込めなかったら null
 */
export function saveMine(raw, id = null) {
	const list = load();
	const target = id && list.find((item) => item?.id === id);
	if (target) {
		target.raw = raw;
	} else {
		id = newId();
		list.push({ id, raw });
	}
	return saved(store.set(KEY, list)) ? id : null;
}

/** @returns {boolean} 書き込めたか */
export function deleteMine(id) {
	return saved(store.set(KEY, load().filter((item) => item?.id !== id)));
}
