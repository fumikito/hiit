/**
 * オフライン対応の Service Worker。
 * 初回に ASSETS を事前キャッシュし、以降はネットワーク優先・失敗時キャッシュ。
 * VERSION と ASSETS は bin/stamp.mjs が生成する（JS/CSS は内容ハッシュ付きURL）。
 */
// stamp:start（bin/stamp.mjs が生成する。手で編集しない）
const VERSION = 'hiit-a8250080';
const ASSETS = [
	'./',
	'index.html',
	'style.css?v=32671564',
	'manifest.json',
	'workouts.json',
	'js/app.js?v=1db1f54e',
	'js/config.js?v=46cdfb63',
	'js/editor.js?v=3b6d2f38',
	'js/library.js?v=3ed8f56c',
	'js/sound.js?v=93b94502',
	'js/source.js?v=bb3ac8e8',
	'js/store.js?v=7905432d',
	'js/timer.js?v=19b9e739',
	'js/wakelock.js?v=9be72e49',
	'icons/icon-180.png',
	'icons/icon-192.png',
	'icons/icon-512.png',
	'icons/icon.svg',
];
// stamp:end

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(VERSION)
			// ブラウザのHTTPキャッシュにある古い版を取り込まないよう、サーバーから取り直す。
			.then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => k.startsWith('hiit-') && k !== VERSION).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

/**
 * ネットワーク優先。応答が遅い・オフラインのときはキャッシュを返す。
 * 取得できたものは毎回キャッシュを更新するので、VERSION を上げなくても内容は追従する。
 */
const TIMEOUT = 3000;

function fromNetwork(request) {
	// CloudFlare が静的ファイルに max-age=14400 を付けるため、ブラウザのHTTPキャッシュを使わず再検証させる。
	return fetch(request, { cache: 'no-cache' }).then((res) => {
		if (res.ok) {
			const copy = res.clone();
			caches.open(VERSION).then((cache) => cache.put(request, copy));
		}
		return res;
	});
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) {
		return;
	}
	const url = new URL(request.url);
	// ?fresh 付きは明示的な再取得。キャッシュを使わず、結果はクエリなしのキーで保存する。
	if (url.searchParams.has('fresh')) {
		url.search = '';
		event.respondWith(
			fetch(request, { cache: 'no-store' }).then((res) => {
				if (res.ok) {
					const copy = res.clone();
					caches.open(VERSION).then((cache) => cache.put(url.href, copy));
				}
				return res;
			})
		);
		return;
	}
	const network = fromNetwork(request);
	const fallback = () => caches.match(request, { ignoreSearch: true }).then((hit) => hit || network);
	event.respondWith(
		new Promise((resolve) => {
			const timer = setTimeout(() => fallback().then(resolve), TIMEOUT);
			network
				.then((res) => {
					clearTimeout(timer);
					resolve(res);
				})
				.catch(() => {
					clearTimeout(timer);
					resolve(fallback());
				});
		})
	);
	event.waitUntil(network.catch(() => {}));
});
