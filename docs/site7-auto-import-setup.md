# サイトセブン画像の自動取込 — 初回設定と毎日の使い方

## 結論

初回設定が終われば、普段の操作は原則として「サイトセブンの画面をiPhoneでスクリーンショットするだけ」です。

```text
iPhoneでスクリーンショット
  ↓ iOSショートカットが自動保存
iCloud Drive「01_入力/今日の日付」
  ↓ Windowsが同期完了を確認
Windows内で表・グラフを解析
  ↓ 高信頼の結果だけ
CSVと.pachiimportを保存
  ↓ 数字だけを暗号化してWeb Push
iPhone版パチトラッカーが受信
  ↓
次にアプリを開いた時に自動登録
```

「ローカル解析」とは、画像を外部のAIサービスへ送らず、Windowsパソコン内で読み取ることです。画像自体はiCloud Driveで同期されますが、解析のために別の会社のサーバーへアップロードすることはありません。

曖昧な結果を推測して登録することはしません。確実な結果は目視なしで登録し、確実でない結果は「保留」にします。保留は、データを削除したという意味ではありません。

## 最初に知っておく重要な制限

### 1. 画像内の日付はまだ自動読取できません

現在の画像解析は、サイトセブン画面に表示された「7/24」などの選択日を読み取りません。

監視設定の`"date": "auto"`は、画像の更新日時を日付として推測しません。`01_入力/2026-07-30/画像.jpg`のように、画像が入った日付フォルダの名前だけを使います。iOSショートカットが今日の日付のフォルダを自動で作るため、同日分は撮影だけで進められます。

日付フォルダがない場合や、1組に複数の日付が混ざった場合は、Windows側で`date-unknown-or-conflicting`として保留します。この場合はCSV、`.pachiimport`、Pushのどれも実行しません。

スクリーンショットだけで安全に自動登録できるのは、原則として次の条件を満たす場合です。

- サイトセブンで選んだ日付が今日
- スクリーンショットを撮った日も今日
- iPhoneとWindowsの日付・時刻が正しい

たとえば7月30日に、サイトセブンで7月24日を選んで撮影すると、ショートカットは`2026-07-30`フォルダへ保存します。画像内の「7/24」とフォルダ名が違うことは自動では見分けられません。

過去日を取り込む場合は、今のところ次のいずれかが必要です。

- パチトラッカーの通常の画像解析画面で「解析するデータの日付」を手動選択する
- 監視を止め、画像を`01_入力/2026-07-24`へ手動保存して、その日付の画像だけを1組として処理する
- または`watch-config.json`の`context.date`を`"2026-07-24"`のように指定して、その日付の画像だけを処理する

異なる日付の画像を同時に`01_入力`へ追加しないでください。過去日も完全に「撮るだけ」にするには、画像内の日付を確実に認識する追加実装が必要です。

### 2. 対応版アプリをHTTPSで公開してから使います

Web Push（アプリを閉じていても通知を届けるWeb標準機能）は、公開されたHTTPS版のWebアプリで利用します。パソコン内にソースコードがあるだけではiPhoneへ通知できません。

公開先は[パチトラッカー](https://komatsu-dev-jp.github.io/pachi-tracker/)です。アプリ内に`設定 → データ管理 → Windows自動取込`が表示されない場合は、対応版がまだ公開されていないか、古い版が残っています。その状態ではペアリングを進めないでください。

iPhoneのホーム画面へ追加したWebアプリでWeb Pushを使えることと、Apple Developer Programへの有料登録が不要なことは、[WebKit公式の説明](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)で確認できます。

## iCloud Driveに作るフォルダ

iPhoneの「ファイル」アプリで、iCloud Driveの中に次のフォルダを作ります。

```text
iCloud Drive
└─ サイトセブンOCR
   ├─ 00_連携
   │  └─ WindowsとiPhoneを初回連携するファイル
   ├─ 01_入力
   │  └─ YYYY-MM-DD
   │     └─ 元のスクリーンショット
   ├─ 02_保留
   │  └─ 必要に応じて確認メモを置く場所
   ├─ 02_処理済み
   │  └─ 利用者が手動整理するときだけ使う任意フォルダ
   └─ 03_出力
      ├─ 解析結果.csv
      └─ pachiimport
         └─ <バッチID>.pachiimport
```

`02_保留`と`02_処理済み`は整理用の任意フォルダです。現在の監視処理は、元画像をどちらにも移動しません。元画像は常に`01_入力`へ残します。

フォルダの作り方:

1. iPhoneで「ファイル」を開く
2. `ブラウズ → iCloud Drive`を開く
3. 右上の`… → 新規フォルダ`を選ぶ
4. `サイトセブンOCR`を作る
5. その中に`00_連携`、`01_入力`、`02_保留`、`02_処理済み`、`03_出力`を作る
6. `03_出力`の中に`pachiimport`を作る

iCloud Driveが表示されない場合は、`設定 → 自分の名前 → iCloud → Drive`で、このiPhoneの同期を有効にします。

## 初回設定

### 1. WindowsでiCloud Driveを同期する

1. Apple公式の「iCloud for Windows」を開く
2. iPhoneと同じApple Accountでサインインする
3. iCloud Driveを有効にする
4. エクスプローラーで`iCloud Drive → サイトセブンOCR`を開く
5. `サイトセブンOCR`を右クリックする
6. `このデバイス上に常に保持する`を選ぶ
7. 緑色のチェックが付くまで待つ

公式手順:

- [WindowsでiCloud Driveを設定する](https://support.apple.com/ja-jp/guide/icloud-windows/-icw0144825a5/icloud)
- [ファイルやフォルダをWindowsへ固定する](https://support.apple.com/ja-jp/guide/icloud-windows/icw8531ad6b7/1.0/icloud/1.0)

Windows上の場所は環境によって、たとえば次のどちらかになります。

```text
C:\Users\<Windowsユーザー名>\iCloudDrive
C:\Users\<Windowsユーザー名>\iCloud Drive
```

名前を推測せず、エクスプローラーで`01_入力`を開き、アドレス欄に表示された実際の場所を使ってください。

### 2. iPhoneのスクリーンショット自動保存を作る

iOS 26のショートカットでは、スクリーンショットが保存された時を自動化の開始条件にできます。[AppleのiOS 26紹介動画](https://developer.apple.com/videos/play/wwdc2026/310/)でもスクリーンショットの自動化が案内されています。

1. iPhoneで「ショートカット」アプリを開く
2. 下部の`オートメーション`を開く
3. 右上の`＋`を押す
4. `スクリーンショット`を選ぶ
5. `スクリーンショットが保存された時`を選ぶ
6. `すぐに実行`を選ぶ。表示される場合は`実行前に尋ねる`をオフにする
7. `新規の空のオートメーション`を選ぶ
8. `アクションを追加`を押し、`現在の日付`を追加する
9. `日付をフォーマット`を追加する
10. 日付形式を`カスタム`にし、`yyyy-MM-dd`と入力する
11. `フォルダを作成`を追加する
12. 親フォルダに`iCloud Drive/サイトセブンOCR/01_入力`を選ぶ
13. 作るフォルダ名に、手順10の`フォーマット済みの日付`を指定する
14. `ファイルを保存`を追加する
15. 保存する内容に、開始条件から渡された`スクリーンショット`を指定する。候補にない場合は`ショートカットの入力`を指定する
16. 保存先に、手順11で作成または取得した`日付フォルダ`を指定する
17. `保存先を尋ねる`をオフにする
18. 表示される場合は`ファイルが存在する場合は上書き`をオフにする
19. 完了を押す

同じ日付のフォルダが既にある場合は、新しい同名フォルダを増やさず、そのフォルダを利用する設定にします。

`ファイルを保存`はiOSショートカットの標準アクションです。[Apple公式のファイル操作ガイド](https://support.apple.com/ja-jp/guide/shortcuts/apdaf74d75a5/ios)も参照できます。

テストとしてスクリーンショットを1枚撮り、「ファイル」アプリの`01_入力/今日の日付`に元の大きさの画像が増えることを確認します。2026年7月30日なら、保存先は`01_入力/2026-07-30`です。写真アプリ側のスクリーンショットも削除しません。

このオートメーションは、サイトセブン以外のスクリーンショットにも反応します。別の画像が入っても自動削除はされませんが、不要な保留を増やしたくない場合は、作業しない期間だけオートメーションをオフにしてください。

### 3. Windows解析用のアプリをビルドする

PowerShellを開き、次を実行します。

```powershell
cd "C:\path\to\New project 2\pachi-tracker-latest"
npm.cmd run build
Test-Path -LiteralPath ".\dist\auto-worker.html"
```

最後に`True`と表示されれば、Windows内で画像を解析するページが準備できています。`False`や赤いエラーが表示された場合は、そのまま監視へ進まず、エラー内容を確認します。

Windows側の監視にはNode.js 20以上を使います。Node.jsは無料ですが、Windowsの標準搭載機能ではありません。

```powershell
node --version
```

`v20`以上なら利用できます。監視用ブリッジには追加ライブラリがないため、`site7-push-bridge`内で`npm install`を実行する必要はありません。

### 4. 監視設定を作る

PowerShellで監視用フォルダへ移動します。

```powershell
cd "C:\path\to\New project 2\site7-push-bridge"
Test-Path -LiteralPath ".\watch-config.json"
```

`False`の場合だけ、設定例をコピーします。`True`の場合は既存設定を守るため、このコピー操作をしません。

```powershell
Copy-Item -LiteralPath ".\watch-config.example.json" -Destination ".\watch-config.json"
notepad.exe ".\watch-config.json"
```

最低限、次の項目を実際の環境に合わせます。

```json
{
  "inputDirectory": "C:\\Users\\YOUR_NAME\\iCloudDrive\\サイトセブンOCR\\01_入力",
  "outputDirectory": "C:\\Users\\YOUR_NAME\\iCloudDrive\\サイトセブンOCR\\03_出力",
  "stateDirectory": "C:\\Users\\YOUR_NAME\\AppData\\Local\\PachiTrackerBridge\\watch-state",
  "distDirectory": "..\\pachi-tracker-latest\\dist",
  "context": {
    "storeId": null,
    "storeName": "実際の店舗名",
    "date": "auto",
    "event": "",
    "machineName": "実際の機種名",
    "expectCompleteTable": true
  },
  "push": {
    "enabled": false,
    "configPath": "C:\\Users\\YOUR_NAME\\AppData\\Local\\PachiTrackerBridge\\bridge-config.dpapi",
    "deviceId": null
  }
}
```

これはファイル全体ではなく、変更する項目の見本です。設定例にある他の項目は残してください。

注意点:

- WindowsのJSONでは、フォルダの区切りを`\\`と2本書く
- `storeName`と`machineName`は、パチトラッカーに登録された表記と一致させる
- 初回テストが終わるまでは`push.enabled`を`false`にする
- 秘密鍵はOneDriveやiCloudではなく、`AppData\Local`へ置く
- `stateDirectory`は処理済み画像の指紋や保留理由を記録するWindows内の管理場所
- `date`が`"auto"`の場合、`01_入力`直下ではなく`YYYY-MM-DD`フォルダへ画像を保存する
- 異なる店舗や機種の画像を、同じ撮影・同期の1組に混ぜない

### 5. WindowsとiPhoneを初回連携する

まずPowerShellで、実際のiCloud Driveの場所を指定します。次は`iCloudDrive`だった場合の例です。

```powershell
cd "C:\path\to\New project 2\site7-push-bridge"
$site7Icloud = Join-Path $env:USERPROFILE "iCloudDrive\サイトセブンOCR"
$bridgeSecret = Join-Path $env:LOCALAPPDATA "PachiTrackerBridge\bridge-config.dpapi"
Test-Path -LiteralPath $bridgeSecret
```

`False`の場合は、初回だけ次を実行します。

```powershell
node .\src\cli.mjs init --subject "https://komatsu-dev-jp.github.io/pachi-tracker/" --config $bridgeSecret --out "$site7Icloud\00_連携\windows-request.pachipair"
```

`True`の場合は秘密設定が既にあります。削除や再初期化をせず、新しい連携要求だけを別名で作ります。

```powershell
node .\src\cli.mjs pairing-request --config $bridgeSecret --out "$site7Icloud\00_連携\windows-request-2.pachipair"
```

連携要求は24時間で期限切れになります。期限切れの場合も秘密設定は削除せず、`pairing-request`で新しい要求を作ります。

次にiPhoneで操作します。

1. Safariで[パチトラッカー](https://komatsu-dev-jp.github.io/pachi-tracker/)を開く
2. Safariの共有ボタンを押す
3. `ホーム画面に追加`を選ぶ
4. 表示される場合は`Webアプリとして開く`をオンにする
5. `追加`を押す
6. Safariのタブを閉じ、ホーム画面のパチトラッカーを開く
7. `設定 → データ管理 → Windows自動取込`を開く
8. `1. Windowsの.pachipairを選ぶ`を押す
9. `iCloud Drive/サイトセブンOCR/00_連携/windows-request.pachipair`を選ぶ
10. `2. 通知を許可して連携する`を押す
11. iPhoneの通知確認で`許可`を押す
12. `3. 応答ファイルをWindowsへ返す`で`共有する`を押す
13. iPhoneの共有画面で`ファイルに保存`を選ぶ
14. 応答を`iCloud Drive/サイトセブンOCR/00_連携`へ保存する

ホーム画面への追加方法は[Apple公式ガイド](https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios)でも確認できます。Safari内で開いただけの状態では連携ボタンを完了できません。

最後にWindowsへ戻ります。`00_連携`に作られた`pachi-tracker-…-response.pachipair`のフルパスをコピーし、次の`ここに応答ファイルのフルパス`を置き換えて実行します。

```powershell
node .\src\cli.mjs import-pairing --config $bridgeSecret --response "ここに応答ファイルのフルパス"
```

`端末 … を追加しました`と表示されれば連携完了です。要求ファイル、応答ファイル、秘密設定は自動で削除・移動しません。

### 6. 通信なしで初回テストする

`watch-config.json`の`push.enabled`が`false`であることを確認します。これなら、解析できてもiPhoneへ送信しません。

PowerShellで次を実行し、その後にテスト用スクリーンショットを保存します。

```powershell
cd "C:\path\to\New project 2\site7-push-bridge"
node .\src\cli.mjs watch --watch-config .\watch-config.json --once
```

`--once`は、1組の画像が解析完了または保留になると監視を終了する診断用です。新しい画像がなければ待ち続けます。

成功時は`03_出力`に次が作られます。

```text
解析結果.csv
pachiimport\<バッチID>.pachiimport
```

保留になっても元画像は`01_入力`に残ります。既に`01_入力`へ未処理画像がある場合は、それらも解析候補になるため、初回は必ずPushを無効にしてください。

### 7. 自動送信を有効にする

初回テストが正常なら、`watch-config.json`を開きます。

```powershell
notepad.exe ".\watch-config.json"
```

次の1か所だけを変更して保存します。

```json
"enabled": true
```

通常の監視を開始します。

```powershell
node .\src\cli.mjs watch --watch-config .\watch-config.json
```

このPowerShellを開いている間、Windowsは新しい画像を監視します。止める場合はPowerShellで`Ctrl+C`を押します。Windowsがスリープ中は処理が止まりますが、元画像はiCloudに残るため、起動後に再開できます。

### 8. Windowsログオン時に自動開始する

毎日の操作を本当に「スクリーンショットだけ」にするには、Windows標準の「タスク スケジューラ」で監視を自動開始します。

1. Windowsの検索で`タスク スケジューラ`を開く
2. `タスクの作成`を押す
3. 名前を`パチトラッカー iCloud監視`にする
4. `ユーザーがログオンしているときのみ実行する`を選ぶ
5. `トリガー`で`ログオン時`を追加し、可能なら開始を1分遅らせる
6. `操作`で`プログラムの開始`を追加する
7. `プログラム/スクリプト`に、`where.exe node`で確認した`node.exe`の場所を入れる
8. `引数の追加`に次を入れる

```text
.\src\cli.mjs watch --watch-config .\watch-config.json
```

9. `開始`に次を入れる。ここには引用符を付けない

```text
C:\path\to\New project 2\site7-push-bridge
```

10. `設定`で、失敗した場合に再起動するよう設定する
11. 手動で起動した監視を`Ctrl+C`で止める
12. 保存後、タスクを右クリックして`実行`し、監視が起動することを確認する

監視処理には二重起動を防ぐロックがあります。手動監視を起動中にタスクも起動すると、後から起動した方は停止します。

## 毎日の使い方

同日データの場合、普段の操作は次だけです。

1. Windowsへログオンし、iCloud Driveの同期と監視が動いている状態にする
2. サイトセブンで、今日の日付・対象店舗・対象機種を表示する
3. 表一覧と差玉グラフを、文字やグラフの端が切れないようにスクリーンショットする。ショートカットが`01_入力/今日の日付`へ保存する
4. 同じ店舗・機種の1組を続けて撮る。Windowsへの最後の画像同期から約1分後に解析が始まる
5. iPhoneの通知を確認する
6. 次にパチトラッカーを開く

アプリを開くと受信箱を確認し、確実なデータだけを自動登録します。通知はiPhoneの仕様上、完全に無表示にはできません。

同じ元画像はSHA-256（ファイル内容から作る固有の指紋）で判定し、同じ内容を重複処理しません。同じIDで内容が異なる場合は、既存データを上書きせず停止します。

## 「保留」の意味

保留は「登録しないまま、安全に残している状態」です。削除でも失敗の隠蔽でもありません。

主な保留理由:

- 表またはグラフが不鮮明、途中で切れている
- 台番号とグラフの対応が確定できない
- 読み取り信頼度が基準未満
- 店舗または機種がパチトラッカーに未登録
- 店舗名が複数候補に一致する
- 既存データと内容が衝突する
- Pushが一時的に届かない
- 日付フォルダがない、または1組に複数の日付が混在している

明確な結果は目視なしで進められますが、曖昧な結果を100%自動で正解にすることはできません。保留を無理に登録せず、元画像を撮り直すか、パチトラッカーの通常解析画面で確認します。

アプリの`設定 → データ管理 → Windows自動取込`では、`自動登録`、`既存と重複`、`保留`、`安全のため拒否`の件数を確認できます。`保留中の受信データを再確認`を押しても、曖昧な値を推測して登録することはありません。

## CSV・.pachiimport・Pushの役割

| 種類 | 役割 | アプリ登録に使うか |
|---|---|---|
| 元画像 | 読み取り根拠。問題時に再解析するための原本 | 直接は使わない |
| `解析結果.csv` | Excelなどで見られる確認・バックアップ用の表 | 転送の正式データにはしない |
| `.pachiimport` | 項目構造、画像の指紋、信頼度、改ざん検査を保つ正式データ | 使う |
| Web Push | `.pachiimport`相当の数字を暗号化してiPhoneへ届ける経路 | 使う |

スプレッドシートは確認・集計には便利ですが、転送の中心にはしません。CSVだけでは信頼度や重複確認に必要な構造を安全に保ちにくいためです。

Pushは配送手段であり、バックアップではありません。届かなかった場合も`03_出力/pachiimport`が残るため、再送できます。

## 削除しない安全設計

- `01_入力`の元画像を自動削除しない
- 元画像を`02_保留`や`02_処理済み`へ自動移動しない
- CSVは追記方式で、同じバッチを重複追記しない
- 既存の`.pachiimport`を上書きしない
- 既存のパチトラッカーデータと内容が違う場合は上書きしない
- パチトラッカーの全体バックアップに、未取込を含むWindows受信原本も保存する
- エラー回復用のリセットでも、Windows受信原本は削除しない
- 秘密設定を更新する前に暗号化済みバックアップを作る
- Push送信先が失効しても購読情報を自動削除しない

整理のために画像を消す場合も、自動処理には任せず、バックアップを確認してから利用者自身が行います。

## 無料で使える範囲と通信

この構成では、有料OCR、外部AI API、Tesseract.js、Apple Developer Programを使いません。

- iOSショートカット: iPhone標準、無料
- iCloud for Windows: Apple公式、無料
- Windows PowerShell・タスク スケジューラ・Edge: Windows標準
- Node.js: 無料
- パチトラッカーのPWAとGitHub Pages: 現在の無料構成を利用
- 標準Web Push: Apple Developer Program登録不要

ただし、iCloudの無料容量を超えた場合の追加容量、インターネット回線、携帯通信には各自の契約費用がかかる場合があります。

これは完全なオフライン構成ではありません。

- 元画像はiCloud Driveを通る
- 解析はWindows内で行う
- Pushでは解析済みの数字だけを標準方式で暗号化して送る
- AppleのPush中継側には、暗号化された本文のほか、送信先、通信時刻、おおよその大きさなどの通信情報が見える
- 画像そのものはPushで送らない

Web Push本文の暗号化方式は[RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html)に基づきます。

## サイト利用規約について

この仕組みは、サイトセブンへの自動ログイン、ブラウザの自動操作、アクセス制限の回避、ページの自動巡回を行いません。利用者が自分で表示して撮ったスクリーンショットを後から処理します。

それでも、契約中のサービスや会員区分によって、画像保存、データの自動処理、二次利用に関する条件が異なる可能性があります。利用前に、サイトセブンの現在の利用規約と契約画面を確認してください。

- アクセス制限やコピー防止を回避しない
- 大量取得や高頻度アクセスをしない
- アカウントを共有しない
- 画像や解析データを第三者へ再配布しない
- 規約でスクリーンショットや自動処理が禁止されている場合は使用を止める

## 困った時の確認順

1. `01_入力/YYYY-MM-DD`に画像があるか
2. Windows側の画像に緑色のチェックが付いているか
3. `npm.cmd run build`後、`dist/auto-worker.html`があるか
4. PowerShellに`入力監視を開始しました`と表示されているか
5. `watch-config.json`の店舗名、機種名、日付、フォルダが正しいか
6. iPhone版に`Windows自動取込`メニューがあるか
7. ホーム画面のアプリから開いているか
8. iPhoneで通知が許可されているか
9. `03_出力`にCSVまたは`.pachiimport`があるか
10. アプリの自動取込画面で保留・拒否件数を確認する

元画像、秘密設定、CSV、`.pachiimport`、既存アプリデータは、原因が分かるまで削除しないでください。
