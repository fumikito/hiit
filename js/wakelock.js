/**
 * 運動中に画面がスリープしないよう Screen Wake Lock を取る。
 * タブ切替で自動解除されるので、復帰時に取り直す。
 */
let lock = null;
let wanted = false;

export async function acquireWakeLock() {
	wanted = true;
	if (!('wakeLock' in navigator) || lock) {
		return;
	}
	try {
		lock = await navigator.wakeLock.request('screen');
		lock.addEventListener('release', () => {
			lock = null;
		});
	} catch {
		lock = null;
	}
}

export function releaseWakeLock() {
	wanted = false;
	lock?.release();
	lock = null;
}

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible' && wanted) {
		acquireWakeLock();
	}
});
