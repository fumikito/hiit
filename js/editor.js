/**
 * ワークアウト編集フォーム。
 * フォームの値 ⇔ 定義オブジェクトの変換と、行の追加・並べ替え・削除を受け持つ。
 */
import { normalizeWorkout, buildPhases, totalSeconds } from './config.js';

const $ = (sel) => document.querySelector(sel);
const el = {
	dialog: $('#editor'),
	form: $('#editor-form'),
	heading: $('#editor-heading'),
	sets: $('#ed-sets'),
	rowTemplate: $('#ed-set-row'),
	total: $('#ed-total'),
	error: $('#ed-error'),
	remove: $('#ed-delete'),
};
const FIELDS = ['name', 'countdown', 'work', 'rest', 'rounds', 'roundRest'];
const field = (name) => el.form.elements[`ed-${name}`];

let handlers = {};
const SAVE_FAILED = 'この端末に保存できませんでした。ブラウザの保存領域がいっぱいか、保存が禁止されている可能性があります';
// 開いた直後は空欄でもエラーを出さない。入力するか保存を押してから出す。
let touched = false;

const fmt = (sec) => `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;

/** 空欄は undefined（＝既定値を使う）にする。 */
const numberOrUndefined = (input) => (input.value.trim() === '' ? undefined : Number(input.value));

function addRow(set = { name: '' }, defaults = {}) {
	const row = el.rowTemplate.content.firstElementChild.cloneNode(true);
	row.querySelector('.ed-set-name').value = set.name;
	// 既定値と同じなら空欄にしておき、既定値を変えたときに追従させる。
	if (set.work !== undefined && set.work !== defaults.work) {
		row.querySelector('.ed-set-work').value = set.work;
	}
	if (set.rest !== undefined && set.rest !== defaults.rest) {
		row.querySelector('.ed-set-rest').value = set.rest;
	}
	el.sets.append(row);
	return row;
}

/** フォームの内容を定義オブジェクトにする（検証はしない）。 */
function read() {
	const raw = { name: field('name').value.trim() };
	FIELDS.slice(1).forEach((key) => {
		const value = numberOrUndefined(field(key));
		if (value !== undefined) {
			raw[key] = value;
		}
	});
	// 既定値と同じ秒数は保存しない（既定値を変えたときに追従させるため）。
	const defaults = { work: raw.work ?? 20, rest: raw.rest ?? 10 };
	raw.sets = [...el.sets.children].map((row) => {
		const set = { name: row.querySelector('.ed-set-name').value.trim() };
		const work = numberOrUndefined(row.querySelector('.ed-set-work'));
		const rest = numberOrUndefined(row.querySelector('.ed-set-rest'));
		if (work !== undefined && work !== defaults.work) {
			set.work = work;
		}
		if (rest !== undefined && rest !== defaults.rest) {
			set.rest = rest;
		}
		return Object.keys(set).length === 1 ? set.name : set;
	});
	return raw;
}

/** 入力のたびに検証して、合計時間かエラーを出す。 */
function preview() {
	// 種目行の空欄プレースホルダーに、いまの既定値を見せる。
	const work = field('work').value || '20';
	const rest = field('rest').value || '10';
	el.sets.querySelectorAll('.ed-set-work').forEach((input) => (input.placeholder = work));
	el.sets.querySelectorAll('.ed-set-rest').forEach((input) => (input.placeholder = rest));
	field('roundRest').placeholder = rest;
	try {
		const raw = read();
		if (!raw.name) {
			throw new Error('ワークアウト名を入力してください');
		}
		if (raw.sets.some((s) => !(typeof s === 'string' ? s : s.name))) {
			throw new Error('種目名が空の行があります');
		}
		const w = normalizeWorkout(raw);
		el.total.textContent = `合計 ${fmt(totalSeconds(buildPhases(w)))}（${w.sets.length}種目 × ${w.rounds}ラウンド）`;
		el.error.textContent = '';
		return raw;
	} catch (err) {
		el.total.textContent = '';
		el.error.textContent = touched ? err.message : '';
		return null;
	}
}

function onSetsClick(e) {
	const button = e.target.closest('button[data-act]');
	if (!button) {
		return;
	}
	const row = button.closest('li');
	const act = button.dataset.act;
	if (act === 'up' && row.previousElementSibling) {
		row.previousElementSibling.before(row);
	} else if (act === 'down' && row.nextElementSibling) {
		row.nextElementSibling.after(row);
	} else if (act === 'remove') {
		row.remove();
	}
	preview();
}

/**
 * 編集フォームを開く。
 *
 * @param {object} opts
 * @param {object|null} opts.workout 初期値（正規化済み）。null なら新規
 * @param {string} opts.title 見出し
 * @param {boolean} opts.deletable 削除ボタンを出すか
 * @param {(raw: object) => boolean} opts.onSave 保存できたら true
 * @param {() => boolean} [opts.onDelete] 削除できたら true
 */
export function openEditor({ workout, title, deletable, onSave, onDelete }) {
	handlers = { onSave, onDelete };
	const w = workout || { name: '', countdown: 10, work: 20, rest: 10, rounds: 1, sets: [{ name: '' }] };
	el.heading.textContent = title;
	field('name').value = w.name;
	['countdown', 'work', 'rest', 'rounds'].forEach((key) => (field(key).value = w[key]));
	// ラウンド間休憩は rest と同じなら空欄（＝rest に追従）。
	field('roundRest').value = w.roundRest !== undefined && w.roundRest !== w.rest ? w.roundRest : '';
	el.sets.innerHTML = '';
	w.sets.forEach((set) => addRow(set, w));
	el.remove.hidden = !deletable;
	touched = false;
	preview();
	el.dialog.showModal();
}

export function initEditor() {
	el.form.addEventListener('input', () => {
		touched = true;
		preview();
	});
	el.sets.addEventListener('click', onSetsClick);
	$('#ed-add').addEventListener('click', () => {
		addRow().querySelector('.ed-set-name').focus();
		preview();
	});
	$('#ed-cancel').addEventListener('click', () => el.dialog.close());
	el.remove.addEventListener('click', () => {
		if (!confirm('このワークアウトを削除しますか？')) {
			return;
		}
		if (handlers.onDelete?.()) {
			el.dialog.close();
		} else {
			el.error.textContent = SAVE_FAILED;
		}
	});
	el.form.addEventListener('submit', (e) => {
		e.preventDefault();
		touched = true;
		const raw = preview();
		if (!raw) {
			return;
		}
		// 保存できなかったときは、入力内容を失わないようフォームを開いたままにする。
		if (handlers.onSave(raw)) {
			el.dialog.close();
		} else {
			el.error.textContent = SAVE_FAILED;
		}
	});
}
