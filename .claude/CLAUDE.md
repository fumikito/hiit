# HIITタイマー（fumikito/hiit）

ビルドなしの静的 PWA（Vanilla JS の ES モジュール + Service Worker）。本番は https://takahashifumiki.com/hiit/（さくらのレンタルサーバー、Apache、前段に CloudFlare）。

## 変更時のルール

- **JS・CSS・アイコンを変更・追加・削除したら、コミット前に `node bin/stamp.mjs` を実行し、書き換わった `index.html` と `sw.js` も一緒にコミットする。**
  - 理由：CloudFlare が静的ファイルにブラウザ向け `max-age=14400` を付けるため、同じ URL のままだと古い JS が最長4時間使われ、新旧のモジュールが混ざって壊れる（2026-11-13 に実際に起きた）。`?v=<内容ハッシュ>` で URL を変えて回避している。
  - `index.html` のインポートマップ、`sw.js` の `// stamp:start`〜`// stamp:end` は生成物なので、手で編集しない。
  - `workouts.json` だけの変更なら不要（実行しても害はない）。
- 動作確認はローカルで `python3 -m http.server 8765`（localhost は HTTP でも Service Worker が動く）。iOS は Xcode のシミュレーターで確認できる。

## デプロイ手順

自動デプロイはまだない。**本番（fumiki.sakura）への書き込みは、毎回ユーザーの明示的な許可を得てから行う。**

1. `main` に切り替えて最新にする（デプロイは必ず `main` から）

   ```bash
   cd /opt/local/www/fumiki/hiit && git checkout main && git pull
   ```

2. ハッシュが最新か確かめる。失敗したらデプロイせず、`node bin/stamp.mjs` の結果を PR で `main` に入れてからやり直す

   ```bash
   node bin/stamp.mjs --check
   ```

3. 試し実行（`-n`）で、送る・消すファイルを確かめる

   ```bash
   rsync -avn --delete \
     --exclude='.git' --exclude='.gitignore' --exclude='.claude' --exclude='bin' \
     --exclude='README.md' --exclude='LICENSE' --exclude='.DS_Store' \
     ./ fumiki.sakura:/home/fumiki/www/main/hiit/
   ```

4. 結果をユーザーに見せて許可を得てから、`-n` を外して実行する
5. 確認する

   ```bash
   B=https://takahashifumiki.com/hiit
   curl -s $B/ | grep -o 'app.js?v=[0-9a-f]*'        # 手元の index.html と同じハッシュか
   curl -s $B/sw.js | grep VERSION                    # 手元の sw.js と同じか
   for p in js/app.js style.css workouts.json; do curl -s -o /dev/null -w "%{http_code} $p\n" "$B/$p"; done   # 200
   for p in .git/config README.md LICENSE bin/stamp.mjs .claude/CLAUDE.md; do curl -s -o /dev/null -w "%{http_code} $p\n" "$B/$p"; done   # 404
   ```

## ハマりどころ

- CloudFlare のエッジはオリジンの `Cache-Control: no-cache`（`.htaccess`）を守るので、デプロイ後のパージは不要。問題になるのはブラウザ側の `max-age=14400` だけ。
- `index.html` は CloudFlare でもキャッシュされない（DYNAMIC）。そのため新しいハッシュはすぐに伝わる。
- ローカルの https://takahashifumiki.info は証明書の都合で Playwright から開けない。確認は localhost で行う。
