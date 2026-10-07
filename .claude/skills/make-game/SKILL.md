---
name: make-game
description: HTMLゲームを企画 → 仕様 → 実装 → 確認 → デプロイ → X告知の流れで作り、サイトに公開する。「ゲームを作りたい」「ゲームを投稿して」「サイトに載せて」「X用の動画を撮って」「◯時に公開したい」と言われたときに使う。
argument-hint: "[作りたいゲームのアイデア、または既存ゲームのパス]"
---

# ゲームを作ってサイトに公開する

ユーザーとは日本語でやり取りする。引数: $ARGUMENTS

このスキルは Codex とも共有している。リポジトリ直下の `AGENTS.md` から Codex がこのファイルを読むので、手順を変えたときは `AGENTS.md` の「Codex で作業するときの読み替え」も合っているか確認する。

各フェーズの終わりでユーザーに確認し、OKが出てから次へ進む。どのフェーズにいるかを毎回はっきり伝える。
すでに完成したゲーム（ファイルやフォルダのパス）を渡された場合は、1〜2を飛ばし、「3. 実装」の配置の手順から始める。

## 1. 企画

アイデアを一緒に膨らませ、短くまとめる。

- どんなゲームか（ひとことで）
- 何が面白いのか（遊びの核）
- 操作方法（PCのキーボード／マウス、スマホのタッチ）
- 1回あたりのプレイ時間の目安

アイデアがない場合は、3つほど案を出して選んでもらう。最初の作品は**小さく作れるもの**を勧める。

## 2. 仕様

企画をもとに、作るものを具体的に決める。チャット上に箇条書きで示し、OKをもらう。

- **フォルダ名**: 半角英小文字・数字・ハイフンだけ（例: `jump-cat`）。URLになる。`games/` に同じ名前がないか確認する。
- **タイトル**と、一覧に出す**1行の説明文**
- 画面の流れ（タイトル → プレイ → 結果 → もう一度）
- ルール（勝ち負け・スコア・ゲームオーバーの条件）
- 操作（キーボード／マウスとタッチの両方）
- 見た目・音の方針（素材は自作か、コードで描く図形を基本にする）

## 3. 実装

`games/<フォルダ名>/index.html` に作る。

- 基本は**1ファイル**にまとめる（HTML＋`<style>`＋`<script>`）。ライブラリやビルドは使わず、素のJavaScriptで書く。画像や音を使う場合も同じフォルダに置き、**相対パス**で読み込む。
- **デザインの方針**:
  - 画面上のテキストは**極力少なく**する。遊び方の説明文は置かず、見れば分かる操作にする（説明が要るなら絵や動きで伝える）。
  - **シンプルで分かりやすいレイアウト**にする。要素を詰め込まず、遊ぶのに必要なもの（ゲーム画面・操作ボタン・結果）だけを置く。
- 必ず入れるもの:
  - `<meta charset="UTF-8">` と `<meta name="viewport" content="width=device-width, initial-scale=1">`
  - トップに戻るリンク `<a href="../../">← トップへ戻る</a>`
  - PCとスマホの両方で遊べる操作。タッチ操作中に画面がスクロールしないようにする。
  - 画面サイズに合わせて表示を調整すること
  - **画面の下に 80px ほどの空白**を入れる（`padding-bottom: calc(80px + env(safe-area-inset-bottom))` など）。Xのアプリ内ブラウザで開くと、下部にXの投稿文が重なってボタンが隠れるため。結果パネルなどの重ねて出す画面も同じ。
  - アイコン `games/<フォルダ名>/icon.png`（正方形のPNG、512×512 推奨）。トップページの一覧に表示する。ユーザーが用意していなければ、ゲームの絵を使って Canvas で描くなどして作り、見せてOKをもらう。ゲームのページにも `<link rel="icon" href="icon.png">` と `<link rel="apple-touch-icon" href="icon.png">` を入れる。
  - X などにURLを貼ったときにアイコンとタイトルが出るよう、`<head>` にカード用の meta タグを入れる。`og:url` と `og:image` だけは相対パスでは読まれないので、公開URLを `https://` から書く。カードはタイトルとアイコンだけにし、**説明文（`description` / `og:description`）は入れない**。

    ```html
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="KeiFurukawaFunnyCh">
    <meta property="og:title" content="タイトル">
    <meta property="og:url" content="https://keifurukawafunnych.com/games/<フォルダ名>/">
    <meta property="og:image" content="https://keifurukawafunnych.com/games/<フォルダ名>/icon.png">
    <meta name="twitter:card" content="summary">
    ```

    大きい画像のカードにしたいと言われたら、1200×630 の `ogp.jpg`（タイトル・ひとこと説明・ゲームの絵）を作って同じフォルダに置き、`og:image` を `ogp.jpg` に、`twitter:card` を `summary_large_image` にして、`og:image:width`（1200）と `og:image:height`（630）も足す。画像はゲームのページ上で Canvas に描いて書き出すと、ゲームと同じ素材で作れる。
- 文言の約束: 重さ・点数などの数値には単位を付ける（例: 「250g」）。セリフやメッセージは結果に応じて変える。
- 頼まれたら追加する機能（麻辣湯チャレンジで作った実装を参考にする）:
  - **英語表示**: 文言をすべて日英の辞書にまとめ、音ボタンの横に切り替えボタンを置く。選んだ言語は `localStorage` に保存し、初回はブラウザの言語に合わせる。
  - **X投稿ボタン（結果画像つき）**: 結果画像を Canvas で作る。スマホは Web Share API（`navigator.share({files})`）で画像ごと共有シートに渡し、PCは画像を保存してから `https://x.com/intent/post` を開く。Webの投稿URLでは画像を添付できないことをユーザーに説明しておく。
  - **自分の画像を具材などに追加**: `<input type="file">` で読み込み、縮小して `localStorage` に保存する（サーバー不要）。
- 既存ゲームを持ち込む場合: 中身を `games/<フォルダ名>/` にコピーし、入口を `index.html` にする。上の「必ず入れるもの」が足りなければ追加し、`/` で始まるパスや `C:\...` のパスは相対パスに直す。ゲームの中身は、頼まれない限り変えない。

## 4. 確認

- このPCには Python がないので、ローカルサーバーは `.claude/serve.ps1`（PowerShell製）を使う。`.claude/launch.json` の `site` 設定で、ブラウザペインから起動できる（`preview_start` に `name: "site"`）。
- ブラウザペインで `http://localhost:8000/games/<フォルダ名>/` を開き、コンソールエラーがないことを確かめる。
- **スマホ幅の確認**: 320×568・375×667・390×844 で、プレイ画面と結果画面の両方を見る。横あふれがないこと、結果画面や吹き出しが重ならないこと、ボタンが画面に収まることを確かめる。確認が終わったら表示サイズをデスクトップに戻す。
- ユーザーにも遊んでもらい、感想や直したい点を聞く。直したい点があれば修正し、OKが出るまで繰り返す。
- 実機でしか確かめられないこと（タッチ操作、共有シート、ファイル選択など）は、確認できていないと正直に伝える。

## 5. デプロイ

1. `index.html` の `<ul class="games">` の**先頭**に、新しいゲームを**アイコン付き**で、既存の `<li>` と同じ形で追加する。`icon.png` がまだなければ、先に用意する（「3. 実装」を参照）。

   ```html
   <li>
     <a class="icon" href="games/<フォルダ名>/"><img src="games/<フォルダ名>/icon.png" alt="" width="72" height="72"></a>
     <div>
       <a href="games/<フォルダ名>/">タイトル</a>
       <p>説明文</p>
     </div>
   </li>
   ```

2. 追加・変更したファイルだけを `git add` し、`Add game: <タイトル>` というメッセージでコミットする。
3. 公開のタイミングをユーザーに確認する。
   - **すぐ公開**: `git push` する。数分でサイトに反映されることを伝え、URLを案内する。
   - **時刻を指定して公開**（X投稿の時刻に合わせたいときなど）: 下の「予約公開」を使う。
4. URLの案内:
   - ゲーム: `https://keifurukawafunnych.com/games/<フォルダ名>/`
   - トップ: `https://keifurukawafunnych.com/`

### 予約公開（GitHub Actions）

PCやアプリを閉じていても動くよう、GitHub Actions で公開する。

1. ゲームのコミットを公開用ブランチ `publish-<フォルダ名>` に置き、`main` は `origin/main` に戻す。
2. `main` に下のワークフローだけをコミットして push する（ゲームはまだ公開されない）。その後、公開用ブランチを `main` の上に rebase して push する。
3. GitHub の時刻指定実行は 10〜30 分遅れることがあるので、**X投稿の45分前**くらいに設定する。cron は UTC（日本時間 − 9 時間）。
4. 公開までの修正は**公開用ブランチにコミット**する。`main` に直接コミットすると、取り込み（fast-forward）が失敗する。
5. ユーザーに伝えること: 予定時刻の15分後に「Actions」タブで緑のチェックを確認する。動いていなければ「Run workflow」で手動実行できる。公開前にXでリンクを貼って試すと、カードなしの状態が記憶されることがあるので避ける。

```yaml
name: Publish <タイトル>
on:
  schedule:
    - cron: '<分> <時(UTC)> <日> <月> *'
  workflow_dispatch:
permissions:
  contents: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
      - name: Merge publish branch into main
        id: merge
        run: |
          if ! git ls-remote --exit-code origin publish-<フォルダ名> >/dev/null; then
            echo "already published"; exit 0
          fi
          git fetch origin publish-<フォルダ名>
          git merge --ff-only origin/publish-<フォルダ名>
          git push origin main
          git push origin --delete publish-<フォルダ名>
          echo "published=true" >> "$GITHUB_OUTPUT"
      - name: Wait until the game page is live
        if: steps.merge.outputs.published == 'true'
        run: |
          for i in $(seq 1 30); do
            curl -fsSL https://keifurukawafunnych.com/games/<フォルダ名>/ >/dev/null && exit 0
            sleep 20
          done
          exit 1
```

## 6. X告知

ユーザーは @furukawakeigame で、プレイ動画つきの投稿で告知する。

1. **動画**: 9:16 の縦長（1080×1920）で、**プレイ映像だけ**にする。字幕・タイトル画面・エンドカードは入れない。最後にゲーム内の**オチ**（失敗して怒られる、など）があるとよい。どんなオチにするかはユーザーに確認する。
2. **撮り方**: `record-template.html`（このスキルのフォルダ）を `.claude/record.html` にコピーし、そのゲーム用に書き換える。実際のゲームを iframe で自動操作し、画面を 1080×1920 の Canvas に描き直して MP4 にする。撮れたら通常再生で最後まで見て、オチまで映っているか確かめてから `.claude/out/` の動画をユーザーに渡す。`.claude/out/` はコミットしない。
3. **投稿**: ゲームのURLは本文ではなく**リプライ**に貼る（動画つきの投稿ではリンクカードが出ないため）。Xではリプライを予約できないので、投稿後に手動で貼ってもらう。
4. カードが出ないと言われたら、まず meta タグを確認し、問題がなければ時間をおくか URL に `?v=2` を付けて貼り直す。
