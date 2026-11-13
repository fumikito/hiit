/**
 * オフライン対応の Service Worker。
 * 初回に ASSETS を事前キャッシュし、以降はネットワーク優先・失敗時キャッシュ。
 * ASSETS にファイルを追加・削除したら VERSION を上げること。
 */
const VERSION = 'hiit-v4';
const ASSETS = [
	'./',
	'index.html',
	'style.css',
	'manifest.json',
	'workouts.json',
	'js/app.js',
	'js/config.js',
	'js/timer.js',
	'js/sound.js',
	'js/store.js',
	'js/wakelock.js',
	'js/source.js',
	'js/library.js',
	'js/editor.js',
	'icons/icon.svg',
	'icons/icon-180.png',
	'icons/icon-192.png',
	'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(VERSION)
			.then((cache) => cache.addAll(ASSETS))
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
