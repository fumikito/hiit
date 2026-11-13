/**
 * localStorage の薄いラッパー。プライベートモード等で使えなくても落ちない。
 */
const PREFIX = 'hiit:';

export const store = {
	get(key, fallback) {
		try {
			const raw = localStorage.getItem(PREFIX + key);
			return raw === null ? fallback : JSON.parse(raw);
		} catch {
			return fallback;
		}
	},
	/** @returns {boolean} 保存できたか（容量超過・保存禁止などで false） */
	set(key, value) {
		try {
			localStorage.setItem(PREFIX + key, JSON.stringify(value));
			return true;
		} catch {
			// 設定値などは保存できなくても動作は継続する。結果が要る呼び出し元は戻り値を見る。
			return false;
		}
	},
	remove(key) {
		try {
			localStorage.removeItem(PREFIX + key);
		} catch {
			// noop
		}
	},
};
