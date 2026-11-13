import { buildPhases, totalSeconds } from './config.js';
import { fetchWorkouts, rememberGood, lastGood } from './source.js';
import { Timer } from './timer.js';
import { unlock, beep, chime, say } from './sound.js';
import { acquireWakeLock, releaseWakeLock } from './wakelock.js';
import { store } from './store.js';
import { entries, saveMine, deleteMine } from './library.js';
import { openEditor, initEditor } from './editor.js';

const $ = (sel) => document.querySelector(sel);
const el = {
	body: document.body,
	themeColor: document.querySelector('meta[name="theme-color"]'),
	title: $('#workout-title'),
	select: $('#workout-select'),
	label: $('#phase-label'),
	counter: $('#counter'),
	name: $('#phase-name'),
	time: $('#time'),
	phaseBar: $('#phase-bar'),
	next: $('#next'),
	segments: $('#segments'),
	totalFill: $('#total-fill'),
	elapsed: $('#elapsed'),
	left: $('#left'),
	toggle: $('#toggle'),
	reset: $('#reset'),
	dialog: $('#settings'),
	source: $('#source'),
	status: $('#fetch-status'),
	notice: $('#notice'),
	refetch: $('#refetch'),
	sound: $('#opt-sound'),
	current: $('#wk-current'),
	edit: $('#wk-edit'),
	voice: $('#opt-voice'),
};

let currentJson = '';
let fetchedAt = null;
let presets = [];
let items = [];
let timer = null;
let phases = [];
let total = 0;
let current = 0;

const fmt = (sec) => {
	const s = Math.max(0, Math.round(sec));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const options = () => ({ sound: el.sound.checked, voice: el.voice.checked });

/* ---------- 描画 ---------- */

function renderSegments() {
	[el.segments, el.totalFill].forEach((layer) => {
		layer.innerHTML = '';
		phases.forEach((p) => {
			const seg = document.createElement('span');
			seg.className = `seg seg-${p.type}`;
			seg.style.flexGrow = p.duration;
			layer.append(seg);
		});
	});
}

function render(t) {
	const p = t.phase;
	const w = items[current].workout;
	const state = t.state === 'idle' ? 'idle' : t.state === 'done' ? 'done' : p.type;
	if (el.body.dataset.state !== state) {
		el.body.dataset.state = state;
		// Safari のアドレスバー・ステータスバー周りも背景色に合わせる。
		el.themeColor.content = getComputedStyle(el.body).getPropertyValue('--bg').trim();
	}
	el.body.dataset.paused = t.state === 'paused' ? '1' : '';

	if (t.state === 'idle') {
		el.label.textContent = 'スタート待ち';
		el.name.textContent = w.name;
	} else if (t.state === 'done') {
		el.label.textContent = '完了';
		el.name.textContent = 'おつかれさまでした';
	} else {
		el.label.textContent = t.state === 'paused' ? `${p.label}（一時停止中）` : p.label;
		el.name.textContent = p.name;
	}
	const sec = t.state === 'done' ? 0 : Math.ceil(t.remaining / 1000);
	el.time.textContent = sec >= 60 ? fmt(sec) : String(sec);

	if (t.state === 'idle' || p.set === undefined) {
		const rounds = w.rounds > 1 ? ` × ${w.rounds}ラウンド` : '';
		el.counter.textContent = `全${w.sets.length}セット${rounds}・${fmt(total)}`;
	} else {
		const parts = [`セット ${p.set + 1} / ${w.sets.length}`];
		if (w.rounds > 1) {
			parts.push(`ラウンド ${p.round + 1} / ${w.rounds}`);
		}
		el.counter.textContent = parts.join('　');
	}

	el.next.textContent = t.state !== 'done' && p.next ? `次：${p.next}` : '';
	const ratio = t.state === 'done' ? 1 : 1 - t.remaining / (p.duration * 1000);
	el.phaseBar.style.transform = `scaleX(${ratio})`;

	const elapsed = t.state === 'done' ? total : t.elapsed();
	el.totalFill.style.clipPath = `inset(0 ${100 - (elapsed / total) * 100}% 0 0)`;
	el.elapsed.textContent = `経過 ${fmt(elapsed)}`;
	el.left.textContent = `残り ${fmt(total - elapsed)} / 全体 ${fmt(total)}`;

	el.toggle.textContent = t.state === 'running' ? '一時停止' : t.state === 'paused' ? '再開' : 'スタート';
	el.toggle.classList.toggle('is-pause', t.state === 'running');
}

/* ---------- タイマー ---------- */

function onPhase(p, audible) {
	if (!audible) {
		return;
	}
	const { sound, voice } = options();
	if (sound) {
		beep(p.type === 'work' ? 1320 : 660, 0.5);
	}
	if (voice) {
		const text = p.type === 'work' ? p.name : p.type === 'rest' ? `休憩。次は${p.next}` : '準備してください';
		say(text);
	}
}

function loadWorkout(index) {
	timer?.stopLoop();
	releaseWakeLock();
	const i = items[index] ? index : 0;
	const w = items[i].workout;
	current = i;
	store.set('workoutKey', items[i].key);
	el.select.value = String(i);
	el.title.textContent = w.name;
	phases = buildPhases(w);
	total = totalSeconds(phases);
	renderSegments();
	timer = new Timer(phases, {
		tick: render,
		phase: onPhase,
		count: () => options().sound && beep(880, 0.15),
		done: () => {
			releaseWakeLock();
			if (options().sound) {
				chime();
			}
			if (options().voice) {
				say('おつかれさまでした');
			}
		},
	});
}

/**
 * プリセットとマイワークアウトから一覧を作り直す。
 * 選択はキー（プリセットは名前、マイワークアウトは id）で保つ。
 *
 * @param {string|null} selectKey 指定があればそれを選ぶ
 */
function refreshList(selectKey = null) {
	items = entries(presets);
	el.select.innerHTML = '';
	const groups = { preset: 'プリセット', mine: 'マイワークアウト' };
	Object.entries(groups).forEach(([source, label]) => {
		const group = document.createElement('optgroup');
		group.label = label;
		items.forEach((item, i) => {
			if (item.source === source) {
				group.append(new Option(`${item.workout.name}（${fmt(totalSeconds(buildPhases(item.workout)))}）`, String(i)));
			}
		});
		if (group.children.length) {
			el.select.append(group);
		}
	});
	const key = selectKey || store.get('workoutKey', null);
	loadWorkout(Math.max(0, items.findIndex((item) => item.key === key)));
}

function setPresets(list) {
	presets = list;
	refreshList();
}

/* ---------- workouts.json の取得と反映 ---------- */

const clock = (d) => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

/**
 * メイン画面の注意書き。定義の誤り・404など、利用者が直すべき問題だけ出す。
 * オフラインは問題が解決したことを意味しないので、表示をそのまま残す。
 *
 * @param {Error|null} err null なら消す
 */
function showNotice(err) {
	if (err?.kind === 'offline') {
		return;
	}
	el.notice.hidden = !err;
	el.notice.textContent = err ? `${err.message}。前回の定義で動作しています` : '';
}

function showStatus(message, isError = false) {
	el.status.textContent = message;
	el.status.classList.toggle('is-error', isError);
}

/**
 * 取得結果を反映する。内容が同じなら何もしない。
 *
 * @returns {boolean} 反映したら true
 */
function apply({ text, list }) {
	fetchedAt = new Date();
	showNotice(null);
	if (text === currentJson) {
		return false;
	}
	currentJson = text;
	rememberGood(text);
	el.source.textContent = text;
	el.toggle.disabled = false;
	el.reset.disabled = false;
	setPresets(list);
	return true;
}

/** 設定画面の「最新を取得」。キャッシュを使わずサーバーに取りに行く。 */
async function refetch() {
	el.refetch.disabled = true;
	showStatus('取得中…');
	try {
		const result = await fetchWorkouts({ fresh: true });
		if (result.text === currentJson) {
			fetchedAt = new Date();
			showNotice(null);
			showStatus(`変更はありません（${clock(fetchedAt)} 確認）`);
		} else if (timer.state === 'paused' && !confirm('定義が更新されています。途中のタイマーをリセットして反映しますか？')) {
			showStatus('更新があります。反映は保留しました');
		} else {
			apply(result);
			showStatus(`最新の定義を反映しました（${clock(fetchedAt)}）`);
		}
	} catch (err) {
		showNotice(err);
		showStatus(`${err.message}。今の定義のまま使えます`, true);
	} finally {
		el.refetch.disabled = false;
	}
}

/** アプリに戻ってきたとき、タイマーが動いていなければ静かに取り直す。 */
async function refreshOnReturn() {
	if (document.visibilityState !== 'visible' || !['idle', 'done'].includes(timer?.state)) {
		return;
	}
	try {
		apply(await fetchWorkouts({ fresh: true }));
	} catch (err) {
		// 今の定義のまま使う。直すべき問題なら画面に出す。
		showNotice(err);
	}
}

/* ---------- 設定ダイアログ ---------- */

function openSettings() {
	timer.pause();
	if (fetchedAt) {
		showStatus(`最終読み込み：${clock(fetchedAt)}`);
	}
	const item = items[current];
	const kind = item.source === 'preset' ? 'プリセット' : 'マイワークアウト';
	el.current.textContent = `${item.workout.name}（${kind}）`;
	el.edit.textContent = item.source === 'preset' ? '複製して編集' : '編集';
	el.dialog.showModal();
}

/* ---------- ワークアウトの作成・編集 ---------- */

function editCurrent() {
	const item = items[current];
	el.dialog.close();
	if (item.source === 'preset') {
		openEditor({
			workout: { ...item.workout, name: `${item.workout.name}（コピー）` },
			title: 'プリセットを複製',
			deletable: false,
			onSave: (raw) => afterSave(saveMine(raw)),
		});
		return;
	}
	openEditor({
		workout: item.workout,
		title: 'ワークアウトを編集',
		deletable: true,
		onSave: (raw) => afterSave(saveMine(raw, item.id)),
		onDelete: () => {
			if (!deleteMine(item.id)) {
				return false;
			}
			refreshList(items[0].key);
			return true;
		},
	});
}

function createNew() {
	el.dialog.close();
	openEditor({
		workout: null,
		title: '新しいワークアウト',
		deletable: false,
		onSave: (raw) => afterSave(saveMine(raw)),
	});
}

/** 保存できたら一覧を作り直してそれを選ぶ。できなければ false（フォームは開いたまま）。 */
function afterSave(id) {
	if (!id) {
		return false;
	}
	refreshList(`c:${id}`);
	return true;
}

/* ---------- 初期化 ---------- */

async function init() {
	// 旧版の保存データを整理する。
	store.remove('customJson');
	store.remove('workout');
	const legacyName = store.get('workoutName', null);
	if (legacyName) {
		store.set('workoutKey', `p:${legacyName}`);
		store.remove('workoutName');
	}
	initEditor();

	el.sound.checked = store.get('sound', true);
	el.voice.checked = store.get('voice', true);
	el.sound.addEventListener('change', () => store.set('sound', el.sound.checked));
	el.voice.addEventListener('change', () => store.set('voice', el.voice.checked));

	el.toggle.addEventListener('click', () => {
		unlock();
		const wasRunning = timer.state === 'running';
		timer.toggle();
		wasRunning ? releaseWakeLock() : acquireWakeLock();
	});
	el.reset.addEventListener('click', () => {
		timer.reset();
		releaseWakeLock();
	});
	el.select.addEventListener('change', () => loadWorkout(Number(el.select.value)));
	el.refetch.addEventListener('click', refetch);
	el.edit.addEventListener('click', editCurrent);
	$('#wk-new').addEventListener('click', createNew);
	$('#open-settings').addEventListener('click', openSettings);
	$('#settings-close').addEventListener('click', () => el.dialog.close());
	document.addEventListener('visibilitychange', refreshOnReturn);
	document.addEventListener('keydown', (e) => {
		if (e.code === 'Space' && !document.querySelector('dialog[open]')) {
			e.preventDefault();
			el.toggle.click();
		}
	});

	try {
		apply(await fetchWorkouts());
	} catch (err) {
		const saved = lastGood();
		if (saved) {
			apply(saved);
			fetchedAt = null;
			showNotice(err);
			showStatus(`${err.message}。前回の定義で動作しています`, true);
			return registerWorker();
		}
		el.title.textContent = '定義を読み込めません';
		el.name.textContent = err.message;
		el.toggle.disabled = true;
		el.reset.disabled = true;
	}

	registerWorker();
}

function registerWorker() {
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.register('sw.js').catch(() => {});
	}
}

init();
