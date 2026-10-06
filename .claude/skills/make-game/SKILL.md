---
name: make-game
description: HTMLゲームを企画 → 仕様 → 実装 → 確認 → デプロイの流れで作り、サイトに公開する。「ゲームを作りたい」「ゲームを投稿して」「サイトに載せて」と言われたときに使う。
argument-hint: "[作りたいゲームのアイデア、または既存ゲームのパス]"
---

# ゲームを作ってサイトに公開する

ユーザーとは日本語でやり取りする。引数: $ARGUMENTS

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
- 必ず入れるもの:
  - `<meta charset="UTF-8">` と `<meta name="viewport" content="width=device-width, initial-scale=1">`
  - トップに戻るリンク `<a href="../../">← トップへ戻る</a>`
  - PCとスマホの両方で遊べる操作。タッチ操作中に画面がスクロールしないようにする。
  - 画面サイズに合わせて表示を調整すること
  - アイコン `games/<フォルダ名>/icon.png`（正方形のPNG、512×512 推奨）。トップページの一覧に表示する。ユーザーが用意していなければ、ゲームの絵を使って Canvas で描くなどして作り、見せてOKをもらう。ゲームのページにも `<link rel="icon" href="icon.png">` と `<link rel="apple-touch-icon" href="icon.png">` を入れる。
  - X などにURLを貼ったときにアイコンとタイトルが出るよう、`<head>` にカード用の meta タグを入れる。`og:url` と `og:image` だけは相対パスでは読まれないので、公開URLを `https://` から書く。

    ```html
    <meta name="description" content="説明文">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="KeiFurukawaFunnyCh">
    <meta property="og:title" content="タイトル">
    <meta property="og:description" content="説明文">
    <meta property="og:url" content="https://keifurukawafunnych.com/games/<フォルダ名>/">
    <meta property="og:image" content="https://keifurukawafunnych.com/games/<フォルダ名>/icon.png">
    <meta name="twitter:card" content="summary">
    ```
- 既存ゲームを持ち込む場合: 中身を `games/<フォルダ名>/` にコピーし、入口を `index.html` にする。上の「必ず入れるもの」が足りなければ追加し、`/` で始まるパスや `C:\...` のパスは相対パスに直す。ゲームの中身は、頼まれない限り変えない。

## 4. 確認

- `python -m http.server 8000` をバックグラウンドで起動する。`curl -s -o /dev/null -w "%{http_code}"` で、ゲームのページと読み込んでいる各ファイルが 200 を返すか確認する。
- ユーザーに `http://localhost:8000/games/<フォルダ名>/` を開いて遊んでもらい（できればスマホ幅でも）、感想や直したい点を聞く。
- 直したい点があれば修正し、OKが出るまで繰り返す。終わったらサーバーを止める。

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

2. 追加・変更したファイルだけを `git add` し、`Add game: <タイトル>` というメッセージでコミットして `git push` する。
3. 数分でサイトに反映されることを伝え、URLを案内する。
   - ゲーム: `https://keifurukawafunnych.com/games/<フォルダ名>/`
   - トップ: `https://keifurukawafunnych.com/`
