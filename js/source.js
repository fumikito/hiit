/**
 * プリセット（workouts.json）の取得。
 *
 * - 通常取得: Service Worker 経由（ネットワーク優先、オフライン時はキャッシュ）。
 * - fresh 取得: ?fresh を付けると SW はキャッシュを使わずネットワークのみで取りに行く。
 *   失敗はそのままエラーになるので「取れなかった」ことを利用者に伝えられる。
 * - 最後に検証を通った定義は端末に保存し、取得・検証に失敗したときの起動用に使う。
 *   （壊れたJSONもHTTP的には成功なので SW のキャッシュには入りうるため）
 */
import { parseWorkouts } from './config.js';
import { store } from './store.js';

const URL_PATH = 'workouts.json';

/** kind: offline（接続不可）| http（404等）| invalid（JSONの誤り） */
const fail = (kind, message) => Object.assign(new Error(message), { kind });

/**
 * @param {{fresh?: boolean}} opts
 * @returns {Promise<{text: string, list: object[]}>}
 */
export async function fetchWorkouts({ fresh = false } = {}) {
	const res = await request(URL_PATH, fresh);
	if (!res.ok) {
		throw fail('http', `workouts.json を取得できませんでした（HTTP ${res.status}）`);
	}
	const text = await res.text();
	let list;
	try {
		list = parseWorkouts(text);
	} catch (err) {
		throw fail('invalid', `workouts.json の内容に誤りがあります：${err.message}`);
	}
	return { text, list };
}

async function request(path, fresh) {
	const url = fresh ? `${path}?fresh=${Date.now()}` : path;
	try {
		return await fetch(url, { cache: 'no-store' });
	} catch {
		throw fail('offline', 'サーバーに接続できませんでした（オフラインかもしれません）');
	}
}

export const rememberGood = (text) => store.set('lastGoodJson', text);

/**
 * 最後に検証を通った定義。なければ null。
 *
 * @returns {{text: string, list: object[]}|null}
 */
export function lastGood() {
	const text = store.get('lastGoodJson', null);
	if (!text) {
		return null;
	}
	try {
		return { text, list: parseWorkouts(text) };
	} catch {
		return null;
	}
}
