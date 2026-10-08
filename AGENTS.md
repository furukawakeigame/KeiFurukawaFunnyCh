# AGENTS.md

Codex など、AGENTS.md を読むエージェント向けの案内です。ルールの本体は Claude Code と共通で、次の2つのファイルにあります。作業の前に必ず読んでください。

- `CLAUDE.md` — サイトの構成と制約（無料・シンプル、フレームワークやビルドなし、相対パスのみ など）
- `.claude/skills/make-game/SKILL.md` — ゲームを作って公開し、Xで告知するまでの手順（企画 → 仕様 → 実装 → 確認 → デプロイ → X告知）

「ゲームを作りたい」「サイトに載せて」「X用の動画を撮って」「◯時に公開したい」と頼まれたら、`SKILL.md` の手順どおりに進めてください。

## Codex で作業するときの読み替え

- ユーザーとのやり取りは日本語で行う。
- `SKILL.md` に出てくる「ブラウザペイン」「`preview_start`」は Claude Code の機能。Codex では、PowerShell で `.claude/serve.ps1` を起動し（`powershell -ExecutionPolicy Bypass -File .claude/serve.ps1`）、ユーザーのブラウザで `http://localhost:8000/` を開いてもらって確認する。
- スマホ幅の確認や動画の録画など、ブラウザ操作が必要な工程をできない場合は、そのことをユーザーに伝える。
- X用の動画をユーザーが自分で撮るときは、`.claude/recorder.html`（9:16 録画ツール）の使い方を案内する。手順は `SKILL.md` の「6. X告知」にある。
- コミットメッセージや手順は `SKILL.md` に合わせる。予約公開中（`publish-<フォルダ名>` ブランチがある間）は、`main` に直接コミットしない。
