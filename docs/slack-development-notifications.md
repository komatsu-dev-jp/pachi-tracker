# Slack 開発通知の使い方

## 結論

リモート作業中の「計画」「モック画像」「実装進捗」「完了画面」を Slack で確認できます。

モック画像には自動で「確認用モック」「実装済み画面ではない」と表示されるため、iPhone 側でも画像の意味を区別できます。

## 1. Slack 側の準備

Slack アプリ（Slack とこの開発ツールをつなぐ専用設定のことです）に次の Bot Token Scopes（ボットに許可する操作範囲のことです）を設定します。

- `chat:write` — 計画や進捗の文章を送信
- `files:write` — モックや実装画面の画像を送信

ボットを送信先チャンネルのメンバーに追加してください。

## 2. このプロジェクトの設定

1. [`.env.slack.example`](../.env.slack.example) を複製し、ファイル名を `.env.slack.local` にします。
2. `SLACK_BOT_TOKEN` に `xoxb-` で始まる Bot Token（秘密鍵のことです）を入れます。
3. `SLACK_CHANNEL_ID` に送信先の Channel ID（チャンネルを表す ID のことです）を入れます。
4. 次のコマンドで設定状態を確認します。

```powershell
npm run slack:check
```

`Slack 設定: 文章通知=利用可能 / 画像通知=利用可能` と表示されれば準備完了です。

> `.env.slack.local` は Git（ファイルの変更履歴を管理する仕組みのことです）の共有対象外です。Bot Token を画面、ソースコード、Slack の文章に貼り付けないでください。

## 3. 通知コマンド

### 計画を送る

```powershell
npm run slack:notify -- --type plan --title "ホーム画面の改修" --message "1. 現状確認`n2. モック作成`n3. 実装と検証"
```

### モック画像を送る

```powershell
npm run slack:notify -- --type mock --title "ホーム画面 A案" --message "実装前の確認用です" --image "C:\path\to\mock.png"
```

### 実装進捗と現在の画面を送る

```powershell
npm run slack:notify -- --type progress --title "UI実装中" --message "上部カードまで完了しました" --image "C:\path\to\progress.png"
```

### 完了結果を送る

```powershell
npm run slack:notify -- --type complete --title "ホーム画面の改修完了" --message "lint と build は成功しました" --image "C:\path\to\result.png"
```

`--image` を複数回書くと、複数枚を一度に送れます。実際に送らず内容だけ確認したい場合は `--dry-run` を追加します。

## 4. リモートモードで使う場合

リモート環境（PC とは別の場所で開発コマンドが動く環境のことです）にも次の値を秘密の環境変数として設定します。

- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID`
- `SLACK_PROJECT_NAME`（任意）
- `SLACK_THREAD_TS`（同じ Slack スレッドにまとめる場合のみ）

リモート環境に `.env.slack.local` をコミットして渡す方法は使わないでください。

## 5. 通知タイミング

- 実装前: `plan` を 1 回
- モックを作った時: `mock` + 画像
- 長い実装の区切り: `progress`（通知が多すぎないよう大きな区切りだけ）
- 検証完了後: `complete` + 完成画面
- 判断が必要な時: `warning`

## 6. 主なエラー

- `not_in_channel`: Slack ボットを送信先チャンネルに追加します。
- `missing_scope`: `chat:write` または `files:write` の権限を追加し、Slack アプリを再インストールします。
- `invalid_auth`: Bot Token の値を確認します。
- `channel_not_found`: チャンネル名ではなく Channel ID を設定します。

## 7. Slackから指示する

`#pati-tracker` に次の形式で投稿します。

```text
codex: ホーム画面の表示崩れを直してください
```

日本語の `指示:` でも受け付けます。通常の会話は命令として扱いません。

受信設定を確認するコマンド:

```powershell
npm run slack:inbox -- --check
npm run slack:inbox -- --next
```

安全のため、`.env.slack.local` の `SLACK_ALLOWED_USER_ID` と一致する1人の投稿だけを受け付けます。パソコンとCodexデスクトップが起動している間、定期確認がSlackを見に行きます。外部の有料サーバーは使用しません。

## 参考にした Slack 公式資料

- [Working with files](https://docs.slack.dev/messaging/working-with-files/)
- [Sending messages using incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/)
- [files.completeUploadExternal](https://docs.slack.dev/reference/methods/files.completeUploadExternal/)
