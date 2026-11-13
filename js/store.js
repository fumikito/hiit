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
	set(key, value) {
		try {
			localStorage.setItem(PREFIX + key, JSON.stringify(value));
		} catch {
			// 保存できなくても動作は継続する。
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
