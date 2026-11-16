#!/usr/bin/env node
/**
 * JS/CSS の URL に内容ハッシュ（?v=）を付け、Service Worker の事前キャッシュ一覧と VERSION を更新する。
 *
 * CloudFlare は静的ファイルにブラウザ向け max-age=14400 を付けるため、同じ URL のままだと
 * 古い JS が最長4時間使われ、新旧のモジュールが混ざって壊れる。内容が変わったファイルだけ
 * URL を変えれば、確実に新しい版が読まれる。index.html 自体は no-cache で届く。
 *
 *   node bin/stamp.mjs          index.html と sw.js を書き換える
 *   node bin/stamp.mjs --check  最新でなければ終了コード 1（デプロイ前の確認用）
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const read = (path) => readFileSync(join(ROOT, path));
const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 8);
const list = (dir, ext) => readdirSync(join(ROOT, dir)).filter((f) => !ext || f.endsWith(ext)).sort().map((f) => `${dir}/${f}`);

const modules = list('js', '.js');
const versioned = Object.fromEntries(['style.css', ...modules].map((path) => [path, `${path}?v=${hash(read(path))}`]));

// index.html: スタイル・エントリー・インポートマップ（モジュール内の import も ?v 付き URL に解決させる）
const imports = Object.fromEntries(modules.map((path) => [`./${path}`, `./${versioned[path]}`]));
const importmap = `<script type="importmap">\n${JSON.stringify({ imports }, null, '\t').replace(/^/gm, '\t')}\n\t</script>`;
const html = read('index.html').toString()
	.replace(/href="style\.css(\?v=[^"]*)?"/, `href="${versioned['style.css']}"`)
	.replace(/<script type="importmap">[\s\S]*?<\/script>/, importmap)
	.replace(/src="js\/app\.js(\?v=[^"]*)?"/, `src="${versioned['js/app.js']}"`);

// sw.js: 事前キャッシュ一覧はファイルから作るので、追加・削除の書き忘れが起きない。
// VERSION は全ファイルの内容から作るので、何か変われば Service Worker が更新される。
const assets = ['./', 'index.html', versioned['style.css'], 'manifest.json', 'workouts.json',
	...modules.map((path) => versioned[path]), ...list('icons')];
const version = hash([html, ...assets.filter((a) => a !== './' && a !== 'index.html').map((a) => read(a.split('?')[0]))].join('\0'));
const block = [
	'// stamp:start（bin/stamp.mjs が生成する。手で編集しない）',
	`const VERSION = 'hiit-${version}';`,
	'const ASSETS = [',
	...assets.map((a) => `\t'${a}',`),
	'];',
	'// stamp:end',
].join('\n');
const sw = read('sw.js').toString().replace(/\/\/ stamp:start[\s\S]*?\/\/ stamp:end/, block);

const outputs = { 'index.html': html, 'sw.js': sw };
const stale = Object.keys(outputs).filter((path) => read(path).toString() !== outputs[path]);
for (const path of Object.keys(outputs)) {
	if (!outputs[path].includes(path === 'sw.js' ? 'stamp:end' : 'type="importmap"')) {
		console.error(`${path} に書き換え位置の目印がありません`);
		process.exit(2);
	}
}
if (check) {
	if (stale.length) {
		console.error(`ハッシュが古いファイル: ${stale.join(', ')}。node bin/stamp.mjs を実行してコミットしてください。`);
		process.exit(1);
	}
	console.log('OK: ハッシュは最新です');
} else {
	stale.forEach((path) => writeFileSync(join(ROOT, path), outputs[path]));
	console.log(stale.length ? `更新: ${stale.join(', ')}（VERSION hiit-${version}）` : '変更なし');
}
