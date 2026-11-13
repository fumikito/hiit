# HIIT Timer

A dependency-free HIIT interval timer web app (PWA, works offline). Create your own workouts in the app. UI is in Japanese.

HIIT（高強度インターバルトレーニング）用のタイマーです。ブラウザで開くだけで使え、ホーム画面に追加すればアプリのように動きます。一度開けばオフラインでも使えます。

**👉 https://takahashifumiki.com/hiit/**

## 特徴

- 準備・運動・インターバルで背景色が変わる大きなタイマー表示
- 段階ごとの進捗バーと、全体の進捗バー（運動・休憩を色分け）
- 残り3秒のビープ音、種目名の読み上げ（それぞれオン/オフ可）
- 実行中は画面のスリープを防止（Screen Wake Lock 対応ブラウザ）
- 自分のワークアウトをフォームで作成・編集（種目の追加・並べ替え・個別の秒数）
- ビルド不要・依存ライブラリなし。静的ファイルを置くだけで自分のサーバーでも動く

## 使い方

1. https://takahashifumiki.com/hiit/ を開く
2. ホーム画面に追加する（推奨）
   - **iPhone**: Safari の共有 →「ホーム画面に追加」
   - **Android**: Chrome のメニュー →「ホーム画面に追加」（または「アプリをインストール」）
3. 左上のメニューでワークアウトを選び、「スタート」

### ワークアウトを作る

右上の歯車（設定）から操作します。

- **＋ 新規作成**：一から作る
- **複製して編集**：選んでいるプリセットをもとに作る
- **編集**：自分で作ったワークアウトを直す・削除する

一覧には、最初から入っている「プリセット」と、自分で作った「マイワークアウト」が並びます。プリセットは配信元が更新すると自動で新しくなり、マイワークアウトには影響しません。

### 注意

- **マイワークアウトは、その端末のそのブラウザにだけ保存されます。** 別の端末とは共有されず、ブラウザのデータを消すと消えます。
- **iPhone では Safari とホーム画面のアプリで保存場所が別です。** ホーム画面に追加してから、アプリ側で作ってください。
- iOS では消音モード（マナーモード）だとビープ音が鳴らない場合があります。
- 画面をロックするとタイマーの音は止まります（ブラウザの制約）。実行中はスリープ防止が効くので、画面は点けたまま使ってください。
- 音と読み上げは、最初にスタートボタンを押したときに有効になります（ブラウザの自動再生制限のため）。

## 動作環境

- 動作確認済み：iOS Safari（実機、シミュレーターの iOS 17.4 / 27.2）、デスクトップ版 Chrome
- 標準的な Web API（ES Modules、Service Worker、Web Audio）だけを使っているので、最近のモダンブラウザなら動くはずです（Android・Firefox は未確認）

## 自分のサーバーに置く

静的ファイルを配信できるWebサーバーなら何でも動きます（Apache / nginx / GitHub Pages など）。**HTTPS で配信してください**（Service Worker の要件。`localhost` は例外として HTTP で動きます）。サブディレクトリでもルートでも動きます。

```bash
cd /path/to/document_root
git clone https://github.com/fumikito/hiit.git
```

`https://example.com/hiit/` を開けば使えます。プリセットを変えたい場合は `workouts.json` を編集します（次の節）。

git clone せずに配置する場合は、手元で clone してから必要なファイルだけを送ります。

```bash
rsync -av \
  --exclude='.git' --exclude='.gitignore' --exclude='README.md' --exclude='LICENSE' \
  ./ user@example.com:/path/to/document_root/hiit/
```

ローカルで試すなら：

```bash
python3 -m http.server 8765
# http://localhost:8765/ を開く
```

## プリセットの定義（workouts.json）

全員に配られるプリセットは `workouts.json` に書きます。`workouts` 配列に複数登録できます。各自のマイワークアウトはアプリ内で作るので、ここを編集する必要はありません。

```json
{
  "workouts": [
    {
      "name": "全身サーキット",
      "countdown": 10,
      "work": 40,
      "rest": 20,
      "rounds": 2,
      "roundRest": 60,
      "sets": [
        "スクワット",
        { "name": "プランク", "work": 60 },
        { "name": "バーピー", "work": 30, "rest": 30 }
      ]
    }
  ]
}
```

| キー | 意味 | 既定値 |
|---|---|---|
| `name` | ワークアウト名 | `名称未設定` |
| `countdown` | スタート前のカウントダウン（秒）。`0` で省略 | `10` |
| `work` | 各セットの運動時間（秒） | `20` |
| `rest` | セット間のインターバル（秒）。`0` で省略 | `10` |
| `rounds` | `sets` 全体を繰り返す回数 | `1` |
| `roundRest` | ラウンド間の休憩（秒） | `rest` と同じ |
| `sets` | 種目の配列（必須）。文字列、または `{ "name", "work", "rest" }` で個別指定 | — |

- 最後のセットの後にはインターバルを入れません。
- 合計時間は自動で計算され、選択メニューと画面に表示されます。
- 名前で選択中のワークアウトを覚えているので、順番を入れ替えても選択は保たれます。

### プリセットの更新が反映されるタイミング

1. アプリを開いたとき
2. アプリに戻ってきたとき（タイマー停止中のみ。運動中は割り込まない）
3. 設定（歯車）→「プリセットを再取得」を押したとき

オフラインのときや `workouts.json` に誤りがあるときは、最後に読み込めた定義で動きます。

## サーバー設定

### Apache

同梱の `.htaccess` が次を行います。

- `Cache-Control: no-cache` を付け、更新後に古いJS/CSSが残らないようにする（オフライン用のキャッシュは Service Worker が持つ）
- `.git`・`README.md`・`LICENSE` などを 404 にする

### nginx

`.htaccess` は効かないので、同等の設定を追加してください。

```nginx
# ^~ を付けないと、既存の「location ~* \.(js|css)$」などが優先されて効かない
location ^~ /hiit/ {
    add_header Cache-Control "no-cache";
    location ~ /hiit/(\.git|README\.md|LICENSE|\.gitignore) { return 404; }
}
```

### CDN（CloudFlare など）

CDN がブラウザ向けのキャッシュ期間を上書きする場合でも、Service Worker が毎回サーバーに再検証するので、2回目以降の表示には影響しません。

## カスタマイズ

- アプリ名やテーマ色：`manifest.json` と `index.html` の `<title>`・`apple-mobile-web-app-title`
- 段階ごとの色：`style.css` の `:root` にある `--prepare` / `--work` / `--rest` / `--done`
- アイコン：`icons/`（`icon.svg` と、iOS 用の PNG 180/192/512px）

### Service Worker のキャッシュ

ファイルの中身を変えるだけなら、次に開いたときに自動で反映されます。**ファイルを追加・削除したときは、`sw.js` の `ASSETS` を更新し、`VERSION` を上げてください。**

## ファイル構成

```
index.html             画面
style.css
manifest.json          PWA の設定
sw.js                  Service Worker（オフライン対応）
workouts.json          プリセットの定義
js/
  app.js               画面の制御
  config.js            定義の検証と、実行順への展開
  timer.js             タイマー本体（終了時刻ベースで、バックグラウンドでもずれない）
  source.js            プリセットの取得
  library.js           プリセットとマイワークアウトの一覧・保存
  editor.js            ワークアウトの編集フォーム
  sound.js             ビープ音・読み上げ
  wakelock.js          スリープ防止
  store.js             localStorage のラッパー
```

## ライセンス

[MIT](LICENSE)
